import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { trackErrors } from './helpers/common';

/**
 * Tour C5 animals (src/systems/animals): the shy roe deer (an upright walk at them → alert → fled;
 * a crouched sneak to the 22 m photo range → nothing), Jost's dogs following (here: the player)
 * and the t5 bolt (run with back → animal:returned per dog). Screenshots in test-results/animals/.
 * The player is driven with real input (kq.press('KeyW')), so speed and stance are the game's own.
 */
const OUT = 'test-results/animals';
mkdirSync(OUT, { recursive: true });
test.describe.configure({ timeout: 300_000 });

type Rec = { n: string; p: any }[];
const START = { x: 524, z: -764 };

async function boot(page: Page): Promise<void> {
  await page.goto(`./?notitle&nosave&fresh&manual&x=${START.x}&z=${START.z}`);
  await page.waitForFunction(() => !!window.kq?.animals && !!window.kq?.fauna, null, { timeout: 180_000 });
  await page.evaluate(() => {
    const w = window as unknown as { rec: Rec };
    w.rec = [];
    window.kq!.ctx.events.onAny((n, p) => {
      if (n.startsWith('animal:') && n !== 'animal:request') w.rec.push({ n, p: JSON.parse(JSON.stringify(p ?? null)) });
    });
  });
}

const events = (page: Page, name?: string): Promise<any[]> =>
  page.evaluate((n) => (window as unknown as { rec: Rec }).rec.filter((e) => !n || e.n === n).map((e) => (n ? e.p : { n: e.n, ...e.p })), name ?? null);
const step = (page: Page, n: number) => page.evaluate((k) => window.kq!.step(k), n);
const shot = async (page: Page, name: string): Promise<string> => {
  await page.evaluate(() => window.kq!.screenshotReady());
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path });
  return path;
};

/**
 * Put the player `dist` m from the doe on a line toward her that has no trunk, building or water,
 * facing her, in the given stance. Returns the approach start.
 */
async function lineUp(page: Page, dist: number, stance: 'stand' | 'crouch'): Promise<{ x: number; z: number; deg: number }> {
  return page.evaluate(
    ([dist, stance]) => {
      const k = window.kq!;
      const w = k.ctx.world;
      const doe = k.animals!.list().find((a) => a.id === 'ricke')!;
      const pl = k.ctx.player;
      const base = Math.atan2(pl.position.x - doe.x, pl.position.z - doe.z);
      let best: { x: number; z: number; bad: number } | null = null;
      for (let i = 0; i < 24; i++) {
        const a = base + ((i % 2 ? 1 : -1) * Math.ceil(i / 2) * 15 * Math.PI) / 180;
        let bad = 0;
        for (let s = 3; s <= (dist as number); s += 1) {
          const x = doe.x + Math.sin(a) * s;
          const z = doe.z + Math.cos(a) * s;
          let t = 0;
          w.forest.trunksNear(x, z, 1.2, () => t++);
          if (t || w.surfaceAt(x, z) === 'water' || w.collider.footprintAt(x, z) >= 0 || w.heightfield.slopeDeg(x, z) > 25) bad++;
        }
        const x = doe.x + Math.sin(a) * (dist as number);
        const z = doe.z + Math.cos(a) * (dist as number);
        if (!best || bad < best.bad) best = { x, z, bad };
        if (!bad) break;
      }
      const b = best!;
      // kq.teleport yaw: degrees, 0 = north, 90 = east (= −heading)
      const deg = (-Math.atan2(-(doe.x - b.x), -(doe.z - b.z)) * 180) / Math.PI;
      pl.setStance(stance as 'stand' | 'crouch');
      k.teleport(b.x, b.z, deg, -4);
      return { x: b.x, z: b.z, deg };
    },
    [dist, stance] as const,
  );
}

const doeDist = (page: Page) =>
  page.evaluate(() => {
    const k = window.kq!;
    const d = k.animals!.list().find((a) => a.id === 'ricke')!;
    return { dist: d.dist, state: d.state };
  });

test('animals (a): demo deer; walking upright straight at them → animal:alert, then animal:fled', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  const demo = await page.evaluate(() => window.kq!.animals!.demo());
  console.log(`[animals a] demo ${JSON.stringify(demo)}`);
  expect(await page.evaluate(() => window.kq!.animals!.stats())).toMatchObject({ deer: 2, dogs: 2, bodies: 4, active: true });
  // 1: grazing, seen from 13 m while crouched and still
  await lineUp(page, 13, 'crouch');
  await step(page, 30);
  expect((await doeDist(page)).state).toBe('graze');
  const grazing = await shot(page, 'deer-grazing');
  // walk at them upright from 38 m
  await lineUp(page, 38, 'stand');
  await step(page, 30);
  let alertShot = '';
  let fled: any[] = [];
  let walked = 0;
  for (let i = 0; i < 40 && !fled.length; i++) {
    await page.evaluate(() => window.kq!.press('KeyW', 15));
    walked += 15;
    const ev = await events(page);
    if (!alertShot && ev.some((e) => e.n === 'animal:alert')) alertShot = await shot(page, 'deer-alert');
    fled = await events(page, 'animal:fled');
  }
  const ev = await events(page);
  console.log(`[animals a] walked ${(walked / 60).toFixed(1)} s, events ${JSON.stringify(ev)}`);
  const names = ev.map((e) => `${e.n}:${e.id}`);
  expect(names.indexOf('animal:alert:ricke')).toBeGreaterThanOrEqual(0);
  expect(names.indexOf('animal:fled:ricke')).toBeGreaterThan(names.indexOf('animal:alert:ricke'));
  expect(fled.find((f) => f.id === 'ricke')).toMatchObject({ by: 'player' });
  expect(fled.map((f) => f.id).sort()).toEqual(['kitz', 'ricke']);
  // they bound off and stop again
  for (let i = 0; i < 10 && !(await events(page, 'animal:settled')).length; i++) await step(page, 30);
  expect((await events(page, 'animal:settled')).map((e) => e.id)).toContain('ricke');
  console.log(`[animals a] screenshots ${grazing} ${alertShot}`);
  expect(alertShot).not.toBe('');
  expect(errors).toEqual([]);
});

test('animals (b): after a restore, a crouched sneak to ≤ 22 m → no alert, no flight', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => window.kq!.animals!.demo());
  await step(page, 10);
  // round trip through the slice (as after a load): bodies re-spawned, no events
  const before = await page.evaluate(() => window.kq!.animals!.save());
  await page.evaluate(() => window.kq!.animals!.restore());
  expect(await page.evaluate(() => window.kq!.animals!.stats())).toMatchObject({ deer: 2, dogs: 2, bodies: 4 });
  expect(await page.evaluate(() => window.kq!.animals!.save().deer.map((d) => [d.id, d.state]))).toEqual(before.deer.map((d) => [d.id, d.state]));
  expect(await events(page)).toEqual([]);
  await lineUp(page, 30, 'crouch');
  await step(page, 10);
  let d = await doeDist(page);
  for (let i = 0; i < 80 && d.dist > 22; i++) {
    await page.evaluate(() => window.kq!.press('KeyW', 15));
    d = await doeDist(page);
  }
  const speed = await page.evaluate(() => window.kq!.ctx.player.stance);
  await step(page, 180); // three seconds crouched at the photo range
  d = await doeDist(page);
  console.log(`[animals b] stance ${speed}, doe at ${d.dist.toFixed(1)} m, state ${d.state}, events ${JSON.stringify(await events(page))}`);
  expect(d.dist).toBeLessThanOrEqual(22);
  expect(await events(page, 'animal:fled')).toEqual([]);
  expect(await events(page, 'animal:alert')).toEqual([]);
  expect(d.state).toBe('graze');
  expect(errors).toEqual([]);
});

test('animals (c): the dogs follow the player; a run with back → animal:returned for both', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => window.kq!.animals!.demo());
  await page.evaluate(() => window.kq!.ctx.player.setStance('stand'));
  for (let i = 0; i < 8; i++) await page.evaluate(() => window.kq!.press('KeyW', 30));
  const gaps = await page.evaluate(() => {
    const k = window.kq!;
    return k.animals!.list().filter((a) => a.kind === 'hund').map((a) => a.dist);
  });
  console.log(`[animals c] dog gaps after a 4 s walk ${JSON.stringify(gaps)}`);
  expect(Math.max(...gaps)).toBeLessThan(5);
  // a teleport (as after a fade): the dogs land at the player's side instead of galloping after.
  // Back to the car park, settle, then on to the abzweig stop 35 m away (both walkable).
  await page.evaluate((s) => window.kq!.teleport(s.x, s.z), START);
  await step(page, 120);
  await page.evaluate(() => window.kq!.teleport(515.2, -729.9));
  await step(page, 3);
  const landed = await page.evaluate(() => window.kq!.animals!.list().filter((a) => a.kind === 'hund').map((a) => a.dist));
  console.log(`[animals c] dog gaps 3 ticks after a 35 m teleport ${JSON.stringify(landed)}`);
  expect(Math.max(...landed)).toBeLessThan(5);
  await step(page, 20);
  const following = await shot(page, 'dogs-following');
  // the t5 bolt: out 20 m and back, barking, then back at the player
  await page.evaluate(() => {
    const k = window.kq!;
    const p = k.ctx.player.position;
    for (const [id, off] of [['diane', 0], ['bijou', 1.5]] as const) {
      const d = k.animals!.list().find((a) => a.id === id)!;
      k.animals!.request({ op: 'run', id, path: [[d.x, d.z], [p.x + 14 + off, p.z - 14], [d.x, d.z]], bark: true, back: true });
    }
  });
  let returned: any[] = [];
  for (let i = 0; i < 30 && returned.length < 2; i++) {
    await step(page, 30);
    returned = await events(page, 'animal:returned');
  }
  console.log(`[animals c] returned ${JSON.stringify(returned)}; screenshot ${following}`);
  expect(returned.map((r) => r.id).sort()).toEqual(['bijou', 'diane']);
  expect(errors).toEqual([]);
});

/** Measure each deer against the full scene so one visible deer cannot stand in for the pair. */
const deerShares = (page: Page) =>
  page.evaluate(() => {
    const k = window.kq!;
    const r = k.ctx.renderer;
    const sc = k.ctx.scene;
    const cam = k.ctx.camera;
    const gl = r.getContext();
    const deer = sc.children.filter((o) => /^animal:reh\./.test(o.name));
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const grab = () => {
      r.setRenderTarget(null);
      r.render(sc, cam);
      const b = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    };
    const diff = (a: Uint8Array, b: Uint8Array) => {
      let n = 0;
      for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > 24) n++;
      return n;
    };
    const all = grab();
    return deer.map((body) => {
      const visible = body.visible;
      body.visible = false;
      try {
        return diff(all, grab()) / (w * h);
      } finally {
        body.visible = visible;
      }
    });
  });

test('animals (d): t10 opens on the deer with the reh shot, from the stop and from 23 m back (TASK-001)', async ({ page }) => {
  const errors = trackErrors(page);
  const REH = { x: 727.4, z: -751.5 };
  await page.goto(`./?notitle&nosave&fresh&manual&x=${REH.x}&z=${REH.z}`);
  await page.waitForFunction(() => !!window.kq?.animals && !!window.kq?.fauna && !!window.kq?.story && !!window.kq?.cinematic, null, { timeout: 180_000 });
  await page.evaluate(() => {
    const w = window as unknown as { rec: Rec };
    w.rec = [];
    window.kq!.ctx.events.onAny((n, p) => {
      if (n.startsWith('cinematic:') && n !== 'cinematic:play') w.rec.push({ n, p: JSON.parse(JSON.stringify(p ?? null)) });
    });
  });

  // Gerold waits for a player up to 25 m behind him: t10 starts wherever the player stands then
  const spots = [
    { name: 'stop', x: REH.x, z: REH.z, touch: false },
    { name: '23m-back', x: 709.7, z: -736.7, touch: true },
  ];
  for (const [i, s] of spots.entries()) {
    await page.evaluate((touch) => window.kq!.ctx.settings.update((d) => (d.touchControls = touch ? 'on' : 'off'), 'touchControls'), s.touch);
    const sneak = page.locator('.kq-prompt').filter({ hasText: s.touch ? 'Langsam heranpirschen' : 'Schleichen: geduckt' });
    // t9 spawns Ricke and Kitz (a jump into the chapter lands at its checkpoint first; on the first
    // jump the beat's actions wait for the chapter card to fade, on game time)
    await page.evaluate(() => window.kq!.story!.goto('tour', 't9'));
    for (let i = 0; i < 30 && (await page.evaluate(() => window.kq!.animals!.stats().deer)) < 2; i++) await step(page, 60);
    expect(await page.evaluate(() => window.kq!.animals!.stats())).toMatchObject({ deer: 2, bodies: 2, visible: 2 });
    await page.evaluate((p) => window.kq!.teleport(p.x, p.z, 160, 0), s);
    await step(page, 10);
    // Gerold reaches the stop: t9 → t10
    await page.evaluate(() => window.kq!.ctx.events.emit('npc:arrived', { npc: 'imhoff', at: 'reh', route: 'p-fuehrung', skipped: false }));
    await step(page, 5);
    expect(await page.evaluate(() => window.kq!.state().systems.story?.beat)).toBe('t10');
    expect(await page.evaluate(() => window.kq!.cinematic!.playing())).toBe('tour.reh');
    await expect(sneak).toBeHidden();
    const at = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
    expect(Math.hypot(at.x - s.x, at.z - s.z)).toBeLessThan(1);
    for (const t of [3, 5.9]) {
      await page.evaluate((tt) => window.kq!.cinematic!.at('tour.reh', tt), t);
      await step(page, 3);
      await page.evaluate(() => window.kq!.screenshotReady());
      const shares = await deerShares(page);
      console.log(`[animals d] ${s.name} t=${t}: ${JSON.stringify(shares)}`);
      expect(shares).toHaveLength(2);
      for (const share of shares) expect(share).toBeGreaterThan(0.00015);
      expect(shares[0]! + shares[1]!).toBeGreaterThan(0.0015);
      if (t === 3) await shot(page, `deer-shot-${s.name}`);
    }
    // The shot is held past the grace, so only the input can end it here.
    if (s.touch) {
      await expect(page.getByTestId('cinematic-skip')).toContainText('tippen');
      await page.locator('canvas').first().dispatchEvent('pointerdown', { pointerType: 'touch' });
    } else {
      await page.keyboard.press('KeyX');
    }
    await step(page, 30);
    expect(await page.evaluate(() => window.kq!.cinematic!.playing())).toBeNull();
    const ends = (await page.evaluate(() => (window as unknown as { rec: Rec }).rec)).filter((e) => e.n === 'cinematic:end' && e.p.id === 'tour.reh');
    expect(ends).toHaveLength(i + 1);
    expect(ends.at(-1)?.p).toEqual({ id: 'tour.reh', skipped: true });
    expect(await page.evaluate(() => window.kq!.story!.state().beat)).toBe('t10');
    await expect(sneak).toBeVisible();
    if (s.touch) await expect(sneak.locator('kbd')).toHaveAttribute('data-key', 'Ducken');
    else await expect(sneak.locator('kbd')).toHaveText('C');
    if (s.touch) {
      await page.evaluate(() => window.kq!.teleport(704, -758, 160, 0));
      await step(page, 5);
      const camera = page.getByTestId('touch-photo');
      const shutter = page.getByTestId('touch-attack');
      const photoPrompt = page.locator('.kq-prompt').filter({ hasText: 'Fotomodus öffnen' });
      await expect(photoPrompt).toBeVisible();
      await expect(camera).toHaveClass(/\bcue\b/);
      // Gerold's phone-down briefing (imhoff.t.reh2) holds the scene; the camera opens once it ends
      await expect
        .poll(async () => {
          await step(page, 15);
          return page.evaluate(() => window.kq!.photo!.state().blocked);
        }, { timeout: 30_000 })
        .toBeNull();
      expect(await page.evaluate(() => window.kq!.photo!.open())).toBe(true);
      await expect(shutter).toHaveClass(/\bcue\b/);
      await expect(shutter).toHaveAccessibleName('Auslöser: Foto machen');
      await expect(camera).not.toHaveClass(/\bcue\b/);
      await page.evaluate(() => window.kq!.photo!.close());
      await expect(camera).toHaveClass(/\bcue\b/);
      await expect(shutter).not.toHaveClass(/\bcue\b/);
    }
  }
  expect(errors).toEqual([]);
});
