import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { GraphicsLevel } from '../../src/core/save';
import { trackErrors } from '../helpers/common';

/**
 * TASK-090, real GPU: frame strips of a plant hit and of a throw (Hoch and Niedrig), the touch
 * layout with the throw button, how many cuttable plants stand along the tour's path, and what a
 * cut costs (the nature layers rebuild once). Output: test-results/contribute/TASK-090/.
 *   KQ_E2E_PORT=5461 scripts/dev/heavy.sh --exclusive --max-hold 15 -- pnpm exec playwright test -c playwright.gpu.config.ts forage --workers=1
 */
const OUT = 'test-results/contribute/TASK-090';
/** Felsenpfad, forest floor beside the tour's path. */
const SPOT = { x: 676, z: -612 };

test.describe.configure({ timeout: 600_000 });

async function boot(page: Page, graphics: GraphicsLevel, extra = '') {
  await page.goto(`./?notitle&nosave&fresh&manual&q=${graphics}&cam=third${extra}`);
  await page.waitForFunction(() => window.kq?.ctx.input.enabled && !window.kq.ctx.loop.paused && !!window.kq.forage, null, { timeout: 120_000 });
  await page.addStyleTag({ content: '.kq-bullet-time,.kq-click-to-play{display:none!important}' });
  await page.evaluate(async (graphics) => {
    const k = window.kq!;
    k.ctx.settings.update((s) => {
      s.graphics = graphics;
      s.fov = 80;
      s.cameraZoom = 3.6;
      s.reducedMotion = false;
    }, 'graphics');
    k.progression!.grant('item.stab.esche', 1, true);
    k.progression!.grant('item.kastanie', 12, true);
    await k.avatar?.ready();
    await k.screenshotReady();
  }, graphics);
}

async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

const draw = (page: Page, n: number) => page.evaluate((k) => window.kq!.step(k, { draw: true }), n);

/** Stand 1.6 m in front of the densest clump of standing plants near `at`, facing it. */
async function faceClump(page: Page, at: { x: number; z: number }) {
  return page.evaluate(({ x, z }) => {
    const k = window.kq!;
    k.teleport(x, z, 0, -14);
    k.step(3);
    const plants = k.forage!.plants(45).filter((p) => p.factor === 1);
    let best = plants[0]!;
    let bestN = 0;
    for (const p of plants) {
      const n = plants.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < 2.2).length;
      if (n > bestN) {
        bestN = n;
        best = p;
      }
    }
    k.teleport(best.x, best.z + 1.7, 0, -14);
    k.step(20, { draw: true });
    return { ...best, near: bestN, all: plants.length };
  }, at);
}

for (const graphics of ['high', 'low'] as const) {
  test(`forage strips, ${graphics}`, async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page, graphics);
    const clump = await faceClump(page, SPOT);
    expect(clump.near).toBeGreaterThan(0);
    await shot(page, `${graphics}-cut-0-before`);
    // a Hieb: the frames around the impact, then the stubs and what rolled out
    await page.evaluate(() => {
      window.kq!.forage!.rig(1);
      window.kq!.press('KeyK', 2);
    });
    let i = 1;
    for (const ticks of [8, 6, 4, 6, 10, 20]) {
      await draw(page, ticks);
      await shot(page, `${graphics}-cut-${i++}`);
    }
    // a Wuchthieb on what is left around
    await page.evaluate(() => window.kq!.ctx.input.simulate('KeyK', true));
    await draw(page, 60);
    await page.evaluate(() => window.kq!.ctx.input.simulate('KeyK', false));
    for (const ticks of [16, 8, 20]) {
      await draw(page, ticks);
      await shot(page, `${graphics}-heavy-${i++}`);
    }
    const state = await page.evaluate(() => ({ ...window.kq!.forage!.state(), stats: window.kq!.ctx.world.nature.cover.stats }));
    writeFileSync(`${OUT}/${graphics}-cut.json`, JSON.stringify({ clump, state }, null, 2));

    // the throw: aim held, then the flight every few ticks, the landing
    await page.evaluate(({ x, z }) => {
      const k = window.kq!;
      k.teleport(x, z + 7, 0, -6);
      k.step(20, { draw: true });
      k.ctx.input.simulate('KeyF', true);
    }, clump);
    await draw(page, 12);
    await shot(page, `${graphics}-throw-0-aim`);
    await page.evaluate(() => window.kq!.ctx.input.simulate('KeyF', false));
    i = 1;
    for (const ticks of [5, 10, 12, 14, 12, 30]) {
      await draw(page, ticks);
      await shot(page, `${graphics}-throw-${i++}`);
    }
    // a far lob, looking up
    await page.evaluate(() => {
      const k = window.kq!;
      const p = k.ctx.player.position;
      k.teleport(p.x, p.z, 0, 12);
      k.step(10, { draw: true });
      k.ctx.input.simulate('KeyF', true);
    });
    await draw(page, 10);
    await shot(page, `${graphics}-lob-0-aim`);
    await page.evaluate(() => window.kq!.ctx.input.simulate('KeyF', false));
    await draw(page, 30);
    await shot(page, `${graphics}-lob-1`);
    expect(errors).toEqual([]);
  });
}

test('forage: plants along the tour path, and what a cut costs', async ({ page }) => {
  await boot(page, 'high');
  const tour = JSON.parse(readFileSync('content/story/00-tour.story.json', 'utf8')) as { beats: { enter?: { do: string; item?: string; x?: number; z?: number }[] }[] };
  const nuts = tour.beats.flatMap((b) => b.enter ?? []).filter((a) => a.do === 'loot' && a.item === 'item.kastanie').map((a) => ({ x: a.x!, z: a.z! }));
  const density = await page.evaluate((points) => {
    const k = window.kq!;
    return points.map(({ x, z }) => {
      k.teleport(x, z, 0, 0);
      k.step(1);
      const plants = k.forage!.plants(12);
      return { x, z, within12: plants.length, within5: plants.filter((p) => Math.hypot(p.x - x, p.z - z) < 5).length, ferns: plants.filter((p) => p.kind === 'fern').length };
    });
  }, nuts);
  const cost = await page.evaluate(({ x, z }) => {
    const k = window.kq!;
    k.teleport(x, z, 0, -10);
    k.step(30, { draw: true });
    const nature = k.ctx.world.nature;
    const cam = k.ctx.camera;
    const time = (fn: () => void) => {
      const t0 = performance.now();
      fn();
      return performance.now() - t0;
    };
    const idle: number[] = [];
    for (let i = 0; i < 50; i++) idle.push(time(() => nature.frame(cam)));
    const rebuild: number[] = [];
    for (let i = 0; i < 20; i++) {
      k.forage!.cut(x + (i % 5) * 1.5, z - 2 - Math.floor(i / 5) * 1.5, 1.3);
      rebuild.push(time(() => nature.frame(cam)));
    }
    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    return { idleMs: avg(idle), rebuildMs: avg(rebuild), rebuildMaxMs: Math.max(...rebuild), circles: k.forage!.state().circles, cover: { ...nature.cover.stats }, props: { ...nature.props.stats } };
  }, SPOT);
  mkdirSync(OUT, { recursive: true });
  const sum = (key: 'within12' | 'within5') => density.reduce((s, d) => s + d[key], 0);
  writeFileSync(`${OUT}/density-and-cost.json`, JSON.stringify({ cost, meanWithin12: sum('within12') / density.length, meanWithin5: sum('within5') / density.length, density }, null, 2));
  console.log(JSON.stringify({ cost, meanWithin12: sum('within12') / density.length, meanWithin5: sum('within5') / density.length, none: density.filter((d) => !d.within12).length }));
});

/**
 * TASK-095: a chestnut draws a court watcher off his post. Frames: his fan before, the aim, the
 * arm in the throw, the head turn, the walk, the look around, the way back.
 */
test('forage: a chestnut distracts a court watcher (1789)', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page, 'high');
  await page.evaluate(() => {
    const k = window.kq!;
    k.story?.look('day');
    k.setEra('1789');
    k.step(4);
    k.ctx.state.update((s) => (s.flags['disguise.coat'] = true), 'gpu');
    k.npc!.spawn({ npc: 'gardist', x: 1222, z: -1116, era: '1789', yaw: 270, watch: { fov: 70, range: 14, set: 'test', who: 'Ein Gardist' } } as never);
    k.court!.on('test');
    // behind him and to his right, looking level past him: the chestnut lands ten metres beyond him
    k.teleport(1233, -1111, 300, 0);
    k.step(60, { draw: true });
  });
  const name = (n: number, what: string) => `distract-${n}-${what}`;
  await shot(page, name(0, 'before'));
  await page.evaluate(() => window.kq!.ctx.input.simulate('KeyF', true));
  await draw(page, 12);
  await shot(page, name(1, 'aim'));
  await page.evaluate(() => window.kq!.ctx.input.simulate('KeyF', false));
  await draw(page, 5);
  await shot(page, name(2, 'arm'));
  await draw(page, 8);
  await shot(page, name(3, 'flight'));
  // step to the landing, then through his search
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 120 && k.court!.watchers()[0]!.distract === 'post'; i++) k.step(1);
  });
  const until = (phase: string) =>
    page.evaluate((phase) => {
      const k = window.kq!;
      for (let i = 0; i < 900 && k.court!.watchers()[0]!.distract !== phase; i++) k.step(1);
    }, phase);
  await draw(page, 24);
  await shot(page, name(4, 'turn'));
  await until('walk');
  await draw(page, 100);
  await shot(page, name(5, 'walk'));
  await until('look');
  await draw(page, 100);
  await shot(page, name(6, 'look'));
  await until('back');
  await draw(page, 60);
  const w = await page.evaluate(() => window.kq!.court!.watchers()[0]!);
  await shot(page, name(7, 'back'));
  writeFileSync(`${OUT}/distract.json`, JSON.stringify(w, null, 2));
  expect(w.distract).toBe('back');
  expect(errors).toEqual([]);
});

test('forage: the touch layout with the throw button (844 × 390)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await boot(page, 'low');
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.settings.update((d) => (d.touchControls = 'on'), 'touchControls');
    k.teleport(676, -612, 0, -10);
    k.step(20, { draw: true });
  });
  const button = page.getByTestId('touch-throw');
  await expect(button).toBeVisible();
  // clear of every other touch button
  const overlaps = await page.evaluate(() => {
    const mine = document.querySelector('[data-testid="touch-throw"]')!.getBoundingClientRect();
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('.kq-touch .kq-t-btn')) {
      const r = el.getBoundingClientRect();
      if (el.dataset.testid === 'touch-throw' || !r.width) continue;
      if (r.left < mine.right && r.right > mine.left && r.top < mine.bottom && r.bottom > mine.top) out.push(el.dataset.testid ?? '?');
    }
    return { out, mine: { left: mine.left, top: mine.top, right: mine.right, bottom: mine.bottom } };
  });
  expect(overlaps.out).toEqual([]);
  await shot(page, 'touch-844x390');
  await context.close();
});
