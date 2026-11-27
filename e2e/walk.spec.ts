import { mkdirSync, writeFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { ciScale, isCI } from './helpers/ci';
import { warnIfShared } from '../scripts/dev/heavy-env.mjs';
import { trackErrors } from './helpers/common';
import { waitForHooks } from './helpers/pause';
import { sampleRenderWork } from './helpers/render-work';

/**
 * WP-16 tour walk (src/systems/walk): the guide walks p-fuehrung with the group, the leash
 * (waiting / resumed), the snap ahead after a teleport and the story's warp, a perf sample with
 * 16 bodies at each quality tier (table in the log, test-results/walk/perf.json) and
 * screenshots of the walking group (test-results/walk/walk-*.png).
 *
 * KQ_WALK_QUERY (env, optional) is appended to every boot URL, so the walk runs with other switches
 * without a code edit, e.g. `KQ_WALK_QUERY='&people=authored'` for the authored people bodies.
 */
const OUT = 'test-results/walk';
const EXTRA_QUERY = process.env.KQ_WALK_QUERY ?? '';
mkdirSync(OUT, { recursive: true });
test.describe.configure({ timeout: ciScale(300_000) });

type Rec = { n: string; p: any }[];
const START = { x: 524, z: -770 };

async function boot(page: Page, query: string): Promise<void> {
  await page.goto(`./?notitle&nosave&fresh&x=${START.x}&z=${START.z + 6}${query}${EXTRA_QUERY}`);
  await waitForHooks(page, ['walk', 'npc']);
  await page.evaluate(() => {
    const w = window as unknown as { rec: Rec };
    w.rec = [];
    window.kq!.ctx.events.onAny((n, p) => {
      if (n === 'npc:arrived' || n.startsWith('group:') || n === 'walk:bark') w.rec.push({ n, p: JSON.parse(JSON.stringify(p ?? null)) });
    });
  });
}

const events = (page: Page, name: string): Promise<any[]> => page.evaluate((n) => (window as unknown as { rec: Rec }).rec.filter((e) => e.n === n).map((e) => e.p), name);
const guide = (page: Page) => page.evaluate(() => window.kq!.walk!.list().find((n) => n.npc === 'imhoff')!);
const step = (page: Page, n: number) => page.evaluate((k) => window.kq!.step(k), n);

/** Teleport the player 3 m behind the guide (along his heading), looking the way he walks. */
async function behindGuide(page: Page, back = 3): Promise<void> {
  await page.evaluate((b) => {
    const g = window.kq!.walk!.list().find((n) => n.npc === 'imhoff')!;
    const fx = -Math.sin(g.yaw);
    const fz = -Math.cos(g.yaw);
    // kq.teleport yaw: degrees, 0 = north, 90 = east (heading = −yaw rad in the walker convention)
    window.kq!.teleport(g.x - fx * b, g.z - fz * b, (-g.yaw * 180) / Math.PI, -8);
  }, back);
}

test('walk (a): demo — the guide and the group walk to abzweig with the player following', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page, '&manual');
  await page.evaluate(() => window.kq!.walk!.demo());
  expect(await page.evaluate(() => window.kq!.walk!.stats().bodies)).toBe(15);
  await behindGuide(page);
  const t0 = Date.now();
  let arrived: any[] = [];
  let shots = 0;
  for (let s = 0; s < 90 && !arrived.length; s++) {
    await step(page, 60); // one game second
    await behindGuide(page, 4);
    if (s === 4 || s === 9 || s === 14) {
      // third person, the player a little to the side and ahead, looking back at the group
      await page.evaluate(() => {
        const g = window.kq!.walk!.list().find((n) => n.npc === 'imhoff')!;
        const fx = -Math.sin(g.yaw);
        const fz = -Math.cos(g.yaw);
        window.kq!.teleport(g.x + fx * 9 - fz * 2.5, g.z + fz * 9 + fx * 2.5, ((Math.PI - g.yaw) * 180) / Math.PI + 12, -6);
      });
      await step(page, 1);
      await page.evaluate(() => window.kq!.screenshotReady());
      await page.screenshot({ path: `${OUT}/walk-a-${++shots}.png` });
      await behindGuide(page, 4);
    }
    arrived = (await events(page, 'npc:arrived')).filter((e) => e.at === 'abzweig');
  }
  console.log(`[walk a] arrived after ${((Date.now() - t0) / 1000).toFixed(1)} s wall, events ${JSON.stringify(arrived)}`);
  expect(arrived).toEqual([{ npc: 'imhoff', at: 'abzweig', route: 'p-fuehrung', skipped: false }]);
  const g = await guide(page);
  expect(Math.hypot(g.x - 515.2, g.z - -729.9)).toBeLessThan(1);
  const near = await page.evaluate(() => {
    const l = window.kq!.walk!.list();
    const gg = l.find((n) => n.npc === 'imhoff')!;
    return l.filter((n) => n.npc !== 'imhoff').map((n) => Math.hypot(n.x - gg.x, n.z - gg.z));
  });
  expect(Math.max(...near)).toBeLessThan(10);
  expect(errors).toEqual([]);
});

test('walk (b): the player stays put → group:waiting (and a bark), comes close → group:resumed', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page, '&manual');
  await page.evaluate(() => window.kq!.walk!.demo({ to: 'einstieg' }));
  await page.evaluate(([x, z]) => window.kq!.teleport(x!, z!, 0, 0), [START.x, START.z + 2]);
  let waiting: any[] = [];
  for (let s = 0; s < 60 && !waiting.length; s++) {
    await step(page, 60);
    waiting = await events(page, 'group:waiting');
  }
  expect(waiting).toHaveLength(1);
  expect(waiting[0]).toMatchObject({ group: 'fuehrung', leader: 'imhoff' });
  expect(waiting[0].dist).toBeGreaterThanOrEqual(25);
  expect(await events(page, 'walk:bark')).toEqual([{ npc: 'imhoff', id: 'imhoff.bark.wait' }]);
  expect((await page.evaluate(() => window.kq!.walk!.groups()))[0]!.waiting).toBe(true);
  await behindGuide(page, 4);
  await step(page, 10);
  expect(await events(page, 'group:resumed')).toEqual([{ group: 'fuehrung', leader: 'imhoff' }]);
  expect(errors).toEqual([]);
});

test('walk (c): a teleport > 60 m ahead snaps the guide to the stop ahead (skipped); warp goes on', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page, '&manual');
  await page.evaluate(() => window.kq!.walk!.demo({ to: 'damm' }));
  await behindGuide(page);
  await step(page, 60);
  // next to 'felsen' (s ≈ 456 m)
  await page.evaluate(() => window.kq!.teleport(686, -590, 0, 0));
  await step(page, 2);
  const arr = await events(page, 'npc:arrived');
  expect(arr).toEqual([{ npc: 'imhoff', at: 'felsen', route: 'p-fuehrung', skipped: true }]);
  const g = await guide(page);
  expect(Math.hypot(g.x - 682.9, g.z - -596.1)).toBeLessThan(1.5);
  // the story's fade: warp to damm (the walk's target) → arrived there, skipped, members in their slots
  await page.evaluate(() => window.kq!.walk!.request({ op: 'warp', group: 'fuehrung', to: 'damm' }));
  await step(page, 1);
  expect((await events(page, 'npc:arrived')).at(-1)).toEqual({ npc: 'imhoff', at: 'damm', route: 'p-fuehrung', skipped: true });
  const spread = await page.evaluate(() => {
    const l = window.kq!.walk!.list();
    const gg = l.find((n) => n.npc === 'imhoff')!;
    return Math.max(...l.map((n) => Math.hypot(n.x - gg.x, n.z - gg.z)));
  });
  expect(spread).toBeLessThan(8);
  // backward warp: ignored
  await page.evaluate(() => window.kq!.walk!.request({ op: 'warp', group: 'fuehrung', to: 'felsen' }));
  expect((await events(page, 'npc:arrived')).length).toBe(2);
  expect(errors).toEqual([]);
});

const TIERS = (process.env.KQ_WALK_TIERS ?? 'high,medium,low').split(',');
const SAMPLE = { frames: 8, ticksPerFrame: 15 };
// Room for 183 primitive draws and 124k triangles in one pass (packed tour bodies, including
// the stand-in guide option). Medium/high can also draw the group in the shadow pass.
const GROUP_BUDGET = { calls: 190, triangles: 130_000 };

const perfCheck = isCI ? {
  annotation: { type: 'skip', description: 'The minimum frame count in the timed sample needs a quiet local machine.' },
} : {};

test('walk (d): perf — 16 bodies vs. none at the high, medium and low tiers; screenshots', perfCheck, async ({ page }) => {
  test.setTimeout(ciScale(840_000));
  warnIfShared('walk (d) perf'); // its frame times need heavy.sh --exclusive
  const rows = [];
  for (const tier of TIERS) {
    await boot(page, `&manual&idle&q=${tier}`);
    const setup = await page.evaluate(async ({ x, z }) => {
      const k = window.kq!;
      k.teleport(x, z - 8, 180, -6); // car park, looking south along the route
      await k.avatar!.ready();
      const w = k.walk!;
      const startBodies = w.stats().bodies;
      const before = new Set(k.ctx.people!.list().map((p) => p.id));
      w.demo();
      w.request({ op: 'follow', npc: 'child.compass', leader: 'imhoff' });
      const groupIds = k.ctx.people!.list().map((p) => p.id).filter((id) => !before.has(id));
      return { tier: k.ctx.quality.level, startBodies, bodies: w.stats().bodies, groupIds };
    }, START);
    expect(setup).toMatchObject({ tier: tier === 'med' ? 'medium' : tier, startBodies: 0, bodies: 16 });
    expect(setup.groupIds).toHaveLength(16);
    const work = await page.evaluate(sampleRenderWork, { ...SAMPLE, groupIds: setup.groupIds });
    const { added } = work;
    rows.push({ tier, ...work });

    expect(work.loaded, `${tier} loaded bodies`).toBe(16);
    expect(work.frames, `${tier} matched frames sampled`).toBe(SAMPLE.frames);
    expect(work.missing, `${tier} bodies missing geometry in the main view`).toEqual([]);
    const passes = tier === 'low' ? 1 : 2;
    expect.soft(added.calls, `${tier} added draw calls`).toBeGreaterThan(0);
    expect.soft(added.calls, `${tier} added draw calls`).toBeLessThanOrEqual(passes * GROUP_BUDGET.calls);
    expect.soft(added.triangles, `${tier} added triangles`).toBeGreaterThan(0);
    expect.soft(added.triangles, `${tier} added triangles`).toBeLessThanOrEqual(passes * GROUP_BUDGET.triangles);

    if (tier === TIERS[0]) {
      for (let i = 1; i <= 3; i++) {
        await page.evaluate(() => window.kq!.screenshotReady());
        await page.screenshot({ path: `${OUT}/walk-d-${tier}-${i}.png` });
        if (i < 3) await step(page, 150);
      }
    }
  }
  console.table(rows.map(({ tier, added }) => ({ tier, addedCalls: added.calls, addedTriangles: added.triangles })));
  writeFileSync(`${OUT}/perf.json`, JSON.stringify({ sample: SAMPLE, rows }, null, 2));
});
