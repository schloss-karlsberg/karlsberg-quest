import { mkdirSync, writeFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { trackErrors } from './helpers/common';

/**
 * WP-16 tour walk (src/systems/walk): the guide walks p-fuehrung with the group, the leash
 * (waiting / resumed), the snap ahead after a teleport and the story's warp, a perf sample with
 * 16 bodies at the high and the low tier (table in the log, test-results/walk/perf.json) and
 * screenshots of the walking group (test-results/walk/walk-*.png).
 */
const OUT = 'test-results/walk';
mkdirSync(OUT, { recursive: true });
test.describe.configure({ timeout: 300_000 });

type Rec = { n: string; p: any }[];
const START = { x: 524, z: -770 };

async function boot(page: Page, query: string): Promise<void> {
  await page.goto(`./?notitle&nosave&fresh&x=${START.x}&z=${START.z + 6}${query}`);
  await page.waitForFunction(() => !!window.kq?.walk && !!window.kq?.npc, null, { timeout: 180_000 });
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

interface Sample {
  tier: string;
  group: boolean;
  frames: number;
  fps: number;
  frameMs: number;
  cpuMs: number;
  calls: number;
  triangles: number;
  walkMs: number;
}

/**
 * Average frame / CPU ms, draw calls and triangles over at least `ms` of real time (perf monitor
 * per frame), longer until `minFrames` frames were drawn (SwiftShader at the high tier draws about
 * one frame a second), at most `maxMs`.
 */
async function sample(page: Page, tier: string, group: boolean, ms = 5000, minFrames = 10, maxMs = 30_000): Promise<Sample> {
  const r = await page.evaluate(async ([dur, minN, maxDur]) => {
    const kq = window.kq!;
    const perf = kq.ctx.perf as unknown as { onFrame: ((f: number, c: number, calls: number, tris: number) => void) | null };
    const prev = perf.onFrame;
    const acc = { n: 0, f: 0, c: 0, calls: 0, tris: 0, walk: 0 };
    perf.onFrame = (f, c, calls, tris) => {
      prev?.(f, c, calls, tris);
      acc.n++;
      acc.f += f;
      acc.c += c;
      acc.calls += calls;
      acc.tris += tris;
      acc.walk += kq.walk!.stats().ms;
    };
    const t0 = performance.now();
    while (performance.now() - t0 < dur! || (acc.n < minN! && performance.now() - t0 < maxDur!)) await new Promise((res) => setTimeout(res, 100));
    perf.onFrame = prev;
    const secs = (performance.now() - t0) / 1000;
    const n = Math.max(1, acc.n);
    return { frames: acc.n, fps: acc.n / secs, frameMs: acc.f / n, cpuMs: acc.c / n, calls: acc.calls / n, triangles: acc.tris / n, walkMs: acc.walk / n };
  }, [ms, minFrames, maxMs]);
  return { tier, group, ...r };
}

/** Put the player `d` m from the guide, on the far side from him (away from the group), looking at him. */
async function awayFromGuide(page: Page, d: number): Promise<void> {
  await page.evaluate((dd) => {
    const k = window.kq!;
    const g = k.walk!.list().find((n) => n.npc === 'imhoff')!;
    const p = k.ctx.player.position;
    const l = Math.hypot(p.x - g.x, p.z - g.z) || 1;
    const x = g.x + ((p.x - g.x) / l) * dd;
    const z = g.z + ((p.z - g.z) / l) * dd;
    k.teleport(x, z, (Math.atan2(g.x - x, -(g.z - z)) * 180) / Math.PI, -4);
  }, d);
}

test('walk (e): finding the group — marker on the compass, one call-out, „Zur Gruppe“ hold → behind the group', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page, '&manual');
  await page.evaluate(() => window.kq!.walk!.demo({ to: 'einstieg' }));
  await page.evaluate(([x, z]) => window.kq!.teleport(x!, z!, 0, 0), [START.x, START.z + 2]);
  // the player stays put: the guide waits on the leash (~25 m), and shows on the compass
  for (let s = 0; s < 60 && !(await events(page, 'group:waiting')).length; s++) await step(page, 60);
  await step(page, 30);
  const f1 = await page.evaluate(() => window.kq!.walk!.find());
  console.log(`[walk e] waiting: ${JSON.stringify(f1)}`);
  expect(f1.marker).toBe(true);
  expect(await page.locator('.kq-compass-marker[data-dist^="Gruppe"]').count()).toBe(1);
  // no call-out yet (the guide walked off, the player did not)
  expect((await events(page, 'walk:bark')).filter((b) => b.id === 'imhoff.bark.hier')).toEqual([]);
  // stray to 45 m: Gerold calls once
  await awayFromGuide(page, 45);
  await step(page, 30);
  await awayFromGuide(page, 50);
  await step(page, 120);
  expect((await events(page, 'walk:bark')).filter((b) => b.id === 'imhoff.bark.hier')).toEqual([{ npc: 'imhoff', id: 'imhoff.bark.hier' }]);
  // a minute apart: „Zur Gruppe“ is offered (Q / hold)
  for (let s = 0; s < 70 && !(await page.evaluate(() => window.kq!.walk!.find().prompt)); s++) await step(page, 60);
  expect(await page.evaluate(() => window.kq!.walk!.find().prompt)).toBe(true);
  await expect(page.locator('.kq-prompt')).toContainText('zur Gruppe');
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${OUT}/walk-e-zur-gruppe.png` });
  // still only one call-out in the episode
  expect((await events(page, 'walk:bark')).filter((b) => b.id === 'imhoff.bark.hier')).toHaveLength(1);
  // hold Q: fade, then the player stands on the route behind the group
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.input.simulate('KeyQ', true);
    k.step(90);
    k.ctx.input.simulate('KeyQ', false);
    k.step(90);
  });
  const rejoin = await events(page, 'group:rejoin');
  expect(rejoin).toHaveLength(1);
  const after = await page.evaluate(() => {
    const k = window.kq!;
    const g = k.walk!.list().find((n) => n.npc === 'imhoff')!;
    const p = k.ctx.player.position;
    return { dist: Math.hypot(p.x - g.x, p.z - g.z), find: k.walk!.find(), era: k.ctx.era.current };
  });
  console.log(`[walk e] after the hold: ${JSON.stringify(after)}`);
  expect(after.dist).toBeLessThan(30);
  expect(after.era).toBe('today');
  expect(after.find.prompt).toBe(false);
  expect(errors).toEqual([]);
});

/** The title's new-game flow: warning → name → lantern (as e2e/smoke.spec.ts). */
async function newGameFromTitle(page: Page, overSave: boolean): Promise<void> {
  const start = page.getByTestId('title-new');
  await expect(start).toBeEnabled({ timeout: 120_000 });
  await start.click();
  if (overSave) await page.locator('.kq-modal .actions button.primary').click();
  await page.getByTestId('warning-accept').click();
  await page.getByTestId('name-confirm').click();
  await page.getByTestId('light-lantern').click();
  await expect(page.getByTestId('title')).toBeHidden({ timeout: 30_000 });
}

test('walk (f): „Neues Spiel“ over a save with a group in it starts without the old group (save:loaded on a fresh start)', async ({ page }) => {
  const errors = trackErrors(page);
  // the retired prologue (`?classic`): the tour would bring its own group into the fresh game
  await page.goto('./?manual&classic');
  await newGameFromTitle(page, false);
  await page.waitForFunction(() => !!window.kq?.walk, null, { timeout: 60_000 });
  await page.evaluate(() => {
    const k = window.kq!;
    k.walk!.demo({ to: 'einstieg' });
    k.step(120);
    k.ctx.save.autosave('test', true);
  });
  expect(await page.evaluate(() => window.kq!.walk!.groups().length)).toBe(1);
  // reload: the save brings the group back …
  await page.reload();
  await page.waitForFunction(() => !!window.kq?.walk, null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.kq!.walk!.groups().length)).toBe(1);
  // … „Neues Spiel“ over it: gone (walk rebuilt from the fresh state)
  await newGameFromTitle(page, true);
  await page.evaluate(() => window.kq!.step(5));
  const after = await page.evaluate(() => ({ groups: window.kq!.walk!.groups().length, bodies: window.kq!.walk!.stats().bodies, list: window.kq!.walk!.list().length }));
  console.log(`[walk f] after Neues Spiel: ${JSON.stringify(after)}`);
  expect(after).toEqual({ groups: 0, bodies: 0, list: 0 });
  expect(errors).toEqual([]);
});

const TIERS = (process.env.KQ_WALK_TIERS ?? 'high,medium,low').split(',');

test('walk (d): perf — 16 bodies vs. none at the high, medium and low tiers; screenshots', async ({ page }) => {
  test.setTimeout(840_000);
  const rows: Sample[] = [];
  for (const tier of TIERS) {
    await boot(page, `&q=${tier}`);
    // stand at the car park looking south down the route
    await page.evaluate(([x, z]) => window.kq!.teleport(x!, z! - 8, 180, -6), [START.x, START.z]);
    await page.waitForTimeout(3000);
    rows.push(await sample(page, tier, false));
    await page.evaluate(() => {
      const w = window.kq!.walk!;
      w.demo();
      w.request({ op: 'follow', npc: 'child.compass', leader: 'imhoff' });
    });
    expect(await page.evaluate(() => window.kq!.walk!.stats().bodies)).toBe(16);
    await page.waitForTimeout(1500);
    rows.push(await sample(page, tier, true));
    if (tier === TIERS[0]) {
      for (let i = 1; i <= 3; i++) {
        await page.evaluate(() => window.kq!.screenshotReady());
        await page.screenshot({ path: `${OUT}/walk-d-${tier}-${i}.png` });
        await page.waitForTimeout(2500);
      }
    }
    const st = await page.evaluate(() => ({ walk: window.kq!.walk!.stats(), people: (window.kq as unknown as { people?: { stats(): unknown } }).people?.stats() ?? null }));
    console.log(`[walk d] ${tier}: stats ${JSON.stringify(st)}`);
  }
  const f = (v: number, d = 1) => v.toFixed(d).padStart(9);
  const lines = ['tier    group   frames      fps   frameMs    cpuMs      calls  triangles   walkMs'];
  for (const r of rows) lines.push(`${r.tier.padEnd(7)} ${String(r.group).padEnd(6)} ${String(r.frames).padStart(6)} ${f(r.fps)} ${f(r.frameMs, 2)} ${f(r.cpuMs, 2)} ${f(r.calls, 0)} ${f(r.triangles, 0).padStart(10)} ${f(r.walkMs, 3)}`);
  const label = (await page.evaluate(() => window.kq!.walk!.stats().people)) ? 'stand-in people v0.1 bodies' : 'no people API: walk bodies disabled';
  console.log(`[walk d] perf (${label})\n${lines.join('\n')}`);
  writeFileSync(`${OUT}/perf.json`, JSON.stringify({ label, rows }, null, 2));
  for (const r of rows) expect(r.frames).toBeGreaterThanOrEqual(10);
});
