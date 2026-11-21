import { type Page, expect, test } from '@playwright/test';
import { SCREENS, trackErrors } from './helpers/common';

/**
 * In-game cinematic (src/systems/cinematic, contract C1): an inline orbit through kq.cinematic.play
 * takes the camera (boot's override slot via ctx.cinematic.takeCamera), keeps the character in the
 * picture, freezes the player; a real key after the 0.5 s grace skips; the camera hands back with
 * no NaN and the player's yaw / pitch restored. Then the same with reduced motion (two stills, ≤ 3 s,
 * a cut back). Screenshots: test-results/screens/cinematic-*.png.
 */

interface Probe {
  cam: [number, number, number];
  fov: number;
  finite: boolean;
  yaw: number;
  pitch: number;
  frozen: boolean;
  avatar: boolean;
  playing: string | null;
  owner: string | null;
  events: [string, unknown][];
  hudHidden: boolean;
}

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const k = window.kq!;
    const c = k.ctx.camera;
    const q = c.quaternion;
    const vals = [c.position.x, c.position.y, c.position.z, q.x, q.y, q.z, q.w, c.fov];
    return {
      cam: [c.position.x, c.position.y, c.position.z] as [number, number, number],
      fov: c.fov,
      finite: vals.every(Number.isFinite),
      yaw: k.ctx.player.yaw,
      pitch: k.ctx.player.pitch,
      frozen: k.ctx.player.frozen,
      avatar: k.avatar!.state().visible === true,
      playing: k.cinematic!.playing(),
      owner: k.ctx.cinematic.cameraOwner,
      events: (window as unknown as { __cine: [string, unknown][] }).__cine.slice(),
      hudHidden: document.documentElement.hasAttribute('data-kq-cinematic'),
    };
  });
}

const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/**
 * Wait until the third-person rig has settled (frames keep drawing under WebDriver, and the rig
 * eases per drawn frame): the camera moves < 1 cm over 300 ms.
 */
async function settle(page: Page): Promise<void> {
  const cam = () => page.evaluate(() => window.kq!.ctx.camera.position.toArray() as number[]);
  let a = await cam();
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(300);
    const b = await cam();
    if (dist(a, b) < 0.01) return;
    a = b;
  }
  throw new Error('the camera rig did not settle');
}

/** Close whatever the new game's prologue has open (story cards, radio pages): a modal blocks the skip. */
async function closeModals(page: Page): Promise<void> {
  await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
  expect(await page.evaluate(() => window.kq!.ctx.ui.modals.count)).toBe(0);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${SCREENS}/cinematic-${name}.png` });
}

test.describe('cinematic', () => {
  test.describe.configure({ timeout: 240_000 });

  test('orbit: start, camera moves, avatar visible, frozen, skip, clean hand-back; reduced motion', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq?.cinematic !== undefined && window.kq?.avatar !== undefined, null, { timeout: 90_000 });
    await page.evaluate(() => window.kq!.avatar!.ready());
    await page.evaluate(() => {
      const k = window.kq!;
      (window as unknown as { __cine: [string, unknown][] }).__cine = [];
      k.ctx.events.onAny((n, p) => {
        if (n.startsWith('cinematic:') || n === 'camera:override') (window as unknown as { __cine: [string, unknown][] }).__cine.push([n, p]);
      });
      k.ctx.settings.update((d) => (d.reducedMotion = false), 'reducedMotion');
      // an open meadow by the Feldstation, looking north-east, a gentle downward look
      k.teleport(830, -930, 40, -10);
      k.step(40);
    });
    await closeModals(page);
    await settle(page);
    expect(await page.evaluate(() => window.kq!.cinematic!.list())).toContain('reh');
    const before = await probe(page);
    expect(before.finite).toBe(true);
    expect(before.owner).toBeNull();

    // ---- play an inline orbit around the player
    await page.evaluate(() => {
      const k = window.kq!;
      const p = k.ctx.player.position;
      k.cinematic!.play({ id: 'e2e-orbit', orbit: { x: p.x, z: p.z, r: 9, period: 14, seconds: 10, y: 3.5 } });
      k.step(1);
    });
    const p0 = await probe(page);
    expect(p0.events[0]).toEqual(['camera:override', { active: true }]);
    expect(p0.events).toContainEqual(['cinematic:start', { id: 'e2e-orbit', seconds: 10 }]);
    expect(p0.playing).toBe('e2e-orbit');
    expect(p0.owner).toBe('cinematic');
    expect(p0.frozen).toBe(true);
    expect(p0.avatar).toBe(true);
    expect(p0.hudHidden).toBe(true);
    expect(p0.finite).toBe(true);
    await shot(page, 'orbit-a');
    // input is frozen: W does not walk
    const pos0 = await page.evaluate(() => ({ ...window.kq!.ctx.player.position }));
    await page.evaluate(() => window.kq!.press('KeyW', 15));
    const pos1 = await page.evaluate(() => ({ ...window.kq!.ctx.player.position }));
    expect(Math.hypot(pos1.x - pos0.x, pos1.z - pos0.z)).toBeLessThan(0.01);
    // (15 ticks went by; nudge the look as a player would — restored at the end)
    await page.evaluate(() => {
      window.kq!.ctx.player.yaw += 0.8;
      window.kq!.step(10);
    });
    const p1 = await probe(page);
    expect(dist(p1.cam, p0.cam)).toBeGreaterThan(0.5);
    expect(p1.avatar).toBe(true);
    await shot(page, 'orbit-b');
    // ≈ 0.6 s in (1 + 15 + 10 + 10 ticks = 36): a real key skips
    await page.evaluate(() => window.kq!.step(10));
    const p2 = await probe(page);
    expect(dist(p2.cam, p1.cam)).toBeGreaterThan(0.2);
    await shot(page, 'orbit-c');
    await closeModals(page);
    await page.keyboard.press('KeyX');
    const p3 = await probe(page);
    expect(p3.events).toContainEqual(['cinematic:end', { id: 'e2e-orbit', skipped: true }]);
    expect(p3.events.filter(([n]) => n === 'cinematic:end')).toHaveLength(1);
    expect(p3.playing).toBeNull();
    expect(p3.owner).toBeNull();
    expect(p3.frozen).toBe(false);
    expect(p3.yaw).toBeCloseTo(before.yaw, 5);
    expect(p3.pitch).toBeCloseTo(before.pitch, 5);
    // the hand-back eases 0.4 s on the render clock (frames keep drawing under WebDriver)
    await page.waitForTimeout(900);
    await page.evaluate(() => window.kq!.step(2));
    const p4 = await probe(page);
    expect(p4.finite).toBe(true);
    expect(p4.events.at(-1)).toEqual(['camera:override', { active: false }]);
    expect(p4.events.filter(([n]) => n === 'camera:override')).toHaveLength(2);
    expect(p4.fov).toBeCloseTo(before.fov, 3);
    expect(p4.hudHidden).toBe(false);
    // back on the rig: where the camera was before
    expect(dist(p4.cam, before.cam)).toBeLessThan(0.6);
    expect(p4.avatar).toBe(true);
    expect(await page.evaluate(() => window.kq!.camera!.state().see)).toBe(true);

    // ---- reduced motion: two stills (≤ 3 s), then a cut back
    await closeModals(page);
    await page.evaluate(() => {
      const k = window.kq!;
      (window as unknown as { __cine: unknown[] }).__cine.length = 0;
      k.ctx.settings.update((d) => (d.reducedMotion = true), 'reducedMotion');
      const p = k.ctx.player.position;
      k.cinematic!.play({ id: 'e2e-still', orbit: { x: p.x, z: p.z, r: 9, period: 14, seconds: 10, y: 3.5 } });
      k.step(1);
    });
    const r0 = await probe(page);
    expect(r0.events).toContainEqual(['cinematic:start', { id: 'e2e-still', seconds: 3 }]);
    expect(r0.frozen).toBe(true);
    expect(r0.avatar).toBe(true);
    await shot(page, 'reduced-first');
    await page.evaluate(() => window.kq!.step(60));
    const r1 = await probe(page);
    expect(dist(r1.cam, r0.cam)).toBeLessThan(1e-6); // a still: no flight
    await page.evaluate(() => window.kq!.step(60));
    const r2 = await probe(page);
    expect(dist(r2.cam, r0.cam)).toBeGreaterThan(1); // the last key (cut behind the dip)
    await page.evaluate(() => window.kq!.step(70));
    const r3 = await probe(page);
    expect(r3.events).toContainEqual(['cinematic:end', { id: 'e2e-still', skipped: false }]);
    expect(r3.finite).toBe(true);
    expect(r3.frozen).toBe(false);
    expect(r3.owner).toBeNull();
    // the cut: the slot is free after the next drawn frame
    await page.evaluate(() => window.kq!.step(1));
    const r4 = await probe(page);
    expect(r4.events.at(-1)).toEqual(['camera:override', { active: false }]);
    expect(dist(r4.cam, before.cam)).toBeLessThan(0.6);
    // reduced 'skip': ends at once
    await page.evaluate(() => {
      const k = window.kq!;
      k.cinematic!.play({ id: 'e2e-skip', reduced: 'skip', orbit: { x: 830, z: -930, r: 5, period: 10, seconds: 5 } });
    });
    const r5 = await probe(page);
    expect(r5.events).toContainEqual(['cinematic:end', { id: 'e2e-skip', skipped: true }]);
    expect(r5.owner).toBeNull();
    await page.evaluate(() => window.kq!.ctx.settings.update((d) => (d.reducedMotion = false), 'reducedMotion'));
    expect(errors).toEqual([]);
  });
});
