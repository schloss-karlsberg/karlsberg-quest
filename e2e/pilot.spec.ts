import { expect, test } from '@playwright/test';
import jpeg from 'jpeg-js';
import { SCREENS, trackErrors } from './helpers/common';

/**
 * Bullet-time pilot (`window.kq.pilot`, src/debug/pilot.ts): act / observe / choose in ?manual,
 * the observation's shape, mouse look without pointer lock, and a frame strip that is not black.
 */

/** A meadow south of the Apfelallee, far from the field station and from NPCs (as e2e/combat.spec.ts). */
const FIELD = { x: 1452, z: -640, yaw: 330 };

/** Mean luminance (0..255) and its spread of a JPEG data URL. */
function stats(dataUrl: string): { w: number; h: number; mean: number; sd: number } {
  const img = jpeg.decode(Buffer.from(dataUrl.split(',')[1]!, 'base64'), { useTArray: true });
  let sum = 0;
  let sq = 0;
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    const l = 0.2126 * img.data[i * 4]! + 0.7152 * img.data[i * 4 + 1]! + 0.0722 * img.data[i * 4 + 2]!;
    sum += l;
    sq += l * l;
  }
  const mean = sum / n;
  return { w: img.width, h: img.height, mean, sd: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
}

test('pilot: act, observe, frames, look, telegraph, dialogue', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = trackErrors(page);
  await page.goto('./?notitle&nosave&fresh&manual');
  await page.waitForFunction(() => window.kq?.combat !== undefined && window.kq?.pilot !== undefined, null, { timeout: 90_000 });
  await expect(page.getByTestId('bullet-time')).toBeVisible();
  await expect(page.getByTestId('bullet-time')).toHaveText('⏸ Bullet-Time');

  await page.evaluate(async (at) => {
    const k = window.kq!;
    k.progression!.grant('item.stab.esche', 1, true);
    k.progression!.equip('item.stab.esche');
    k.setEra('1789');
    k.teleport(at.x, at.z, at.yaw, -7);
    k.step(10);
    k.combat!.kill();
    k.step(5);
    await k.screenshotReady();
  }, FIELD);

  // observe: no stepping, one frame
  const o0 = await page.evaluate(() => {
    const k = window.kq!;
    const t0 = k.ctx.loop.tick;
    const o = k.pilot.observe();
    return { o, stepped: k.ctx.loop.tick - t0 };
  });
  expect(o0.stepped).toBe(0);
  expect(o0.o.frames).toHaveLength(1);
  expect(o0.o.player).toMatchObject({ era: '1789', yaw: FIELD.yaw });
  expect(o0.o.player.hp).toBeGreaterThan(0);
  expect(o0.o.player.max).toBeGreaterThan(0);
  expect(o0.o.player.x).toBeCloseTo(FIELD.x, 0);
  expect(Array.isArray(o0.o.enemies)).toBe(true);
  expect(o0.o.paused).toBe(false);

  // mouse look without pointer lock: 200 px right = 200 · 0.0022 rad ≈ 25° at sensitivity 1
  const look = await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.player.mouseSensitivity = 1;
    const before = k.pilot.observe({ frames: 0 }).player.yaw;
    const o = k.pilot.act({ mouse: { dx: 200 }, steps: 10, frames: 0 });
    const t = k.pilot.act({ mouse: { turnDeg: -25 }, steps: 6, frames: 0 });
    return { before, after: o.player.yaw, back: t.player.yaw, locked: document.pointerLockElement !== null };
  });
  expect(look.locked).toBe(false);
  expect(((look.after - look.before + 540) % 360) - 180).toBeCloseTo(25, -0.5);
  expect(((look.back - look.before + 540) % 360) - 180).toBeCloseTo(0, -0.5);

  // an enemy ahead; walk towards it with a frame strip
  const walk = await page.evaluate(() => {
    const k = window.kq!;
    k.combat!.god(true);
    k.combat!.spawn('streuner', { dist: 7, group: 'pilot.test' });
    const o = k.pilot.act({ hold: ['KeyW'], steps: 15, frames: 5 });
    return o;
  });
  expect(walk.frames).toHaveLength(5);
  expect(walk.enemies.length).toBeGreaterThan(0);
  const e = walk.enemies[0]!;
  expect(e).toMatchObject({ kind: 'streuner', name: expect.any(String) });
  expect(e.d).toBeLessThan(12);
  expect(Math.abs(e.bearing)).toBeLessThan(60);
  expect(typeof e.onScreen).toBe('boolean');
  expect(e.hp).toBeGreaterThan(0);
  expect(Math.hypot(walk.player.x - FIELD.x, walk.player.z - FIELD.z)).toBeGreaterThan(0.5);
  for (const f of walk.frames) {
    expect(f.startsWith('data:image/jpeg;base64,')).toBe(true);
    const s = stats(f);
    expect(s.w).toBe(320);
    expect(s.mean).toBeGreaterThan(12);
    expect(s.sd).toBeGreaterThan(4);
  }

  // attack: taps and a held left button (Wuchthieb) produce swing events
  const fight = await page.evaluate(() => {
    const k = window.kq!;
    const id = k.combat!.enemies()[0]!.id;
    const en = k.combat!.enemies()[0]!;
    const p = k.ctx.player.position;
    k.combat!.place(id, p.x - Math.sin(k.ctx.player.yaw) * 2, p.z - Math.cos(k.ctx.player.yaw) * 2);
    k.combat!.freeze(true);
    const light = k.pilot.act({ tap: ['KeyK'], steps: 50, frames: 2 });
    const heavy = k.pilot.act({ mouse: { left: 'hold' }, steps: 40, frames: 0 });
    const after = k.pilot.act({ steps: 20, frames: 0 });
    k.combat!.freeze(false);
    return { kind: en.kind, light: light.events, heavy: [...heavy.events, ...after.events], frames: light.frames.length };
  });
  expect(fight.frames).toBe(2);
  expect(fight.light.some((x) => x.type === 'swing')).toBe(true);
  expect(fight.heavy.filter((x) => x.type === 'swing').map((x) => x.kind), JSON.stringify(fight.heavy)).toContain('heavy');
  // events are drained per act
  const drained = await page.evaluate(() => window.kq!.pilot.act({ steps: 1, frames: 0 }).events.filter((x) => x.type === 'swing').length);
  expect(drained).toBe(0);

  // a forced wind-up shows its time left
  const tele = await page.evaluate(() => {
    const k = window.kq!;
    const id = k.combat!.enemies()[0]!.id;
    k.combat!.windup(id, undefined, 0.2);
    return k.pilot.observe({ frames: 0 }).enemies.find((x) => x.id === id) ?? null;
  });
  expect(tele?.state).toBe('windup');
  expect(tele?.telegraph).toBeGreaterThan(0);
  expect(tele?.attack).toBeTruthy();

  // a modal: the observation shows it, the simulation stands still, choose(n) answers it
  const dlg = await page.evaluate(() => {
    const k = window.kq!;
    let picked = '';
    k.ctx.ui.modals.open({ title: 'Prüfung', body: 'Weiter oder nicht?', actions: [{ label: 'Ja', onClick: () => void (picked = 'ja') }, { label: 'Nein', onClick: () => void (picked = 'nein') }] });
    const t0 = k.ctx.loop.tick;
    const o = k.pilot.act({ hold: ['KeyW'], steps: 5, frames: 0 });
    const stepped = k.ctx.loop.tick - t0;
    const label = k.pilot.choose(2);
    const after = k.pilot.observe({ frames: 0 });
    return { dialogue: o.dialogue, paused: o.paused, stepped, label, picked, closed: after.dialogue === null };
  });
  expect(dlg.paused).toBe(true);
  expect(dlg.stepped).toBe(0);
  expect(dlg.dialogue).toMatchObject({ kind: 'modal', title: 'Prüfung', text: expect.stringContaining('Weiter') });
  expect(dlg.dialogue!.options.map((x) => x.label)).toEqual(['Ja', 'Nein']);
  expect(dlg.label).toBe('Nein');
  expect(dlg.picked).toBe('nein');
  expect(dlg.closed).toBe(true);

  // keep: the held key stays down across acts until released
  const kept = await page.evaluate(() => {
    const k = window.kq!;
    k.pilot.act({ hold: ['KeyW'], keep: true, steps: 2, frames: 0 });
    const down = k.ctx.input.isDown('forward');
    k.pilot.release();
    return { down, after: k.ctx.input.isDown('forward') };
  });
  expect(kept).toEqual({ down: true, after: false });

  await page.screenshot({ path: `${SCREENS}/pilot.png` });
  expect(errors).toEqual([]);
});
