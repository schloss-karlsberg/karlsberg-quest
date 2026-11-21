import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { trackErrors } from './helpers/common';

/**
 * Tour C5 animals (src/systems/animals): the shy roe deer (an upright walk at them → alert → fled;
 * a crouched sneak to the 14 m photo range → nothing), Jost's dogs following (here: the player)
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
  // 1: grazing, seen from 13 m crouched (inside the photo range, below the sneak radius)
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

test('animals (b): after a restore, a crouched sneak to ≤ 14 m → no alert, no flight', async ({ page }) => {
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
  for (let i = 0; i < 80 && d.dist > 13.5; i++) {
    await page.evaluate(() => window.kq!.press('KeyW', 15));
    d = await doeDist(page);
  }
  const speed = await page.evaluate(() => window.kq!.ctx.player.stance);
  await step(page, 180); // three seconds crouched at the photo range
  d = await doeDist(page);
  console.log(`[animals b] stance ${speed}, doe at ${d.dist.toFixed(1)} m, state ${d.state}, events ${JSON.stringify(await events(page))}`);
  expect(d.dist).toBeLessThanOrEqual(14);
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
