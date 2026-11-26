import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { frameStats } from '../../src/render/perf';
import { isSoftwareGpu } from '../../src/render/quality';
import { trackErrors } from '../helpers/common';
import { VIEW_B_TARGET_MS, captureForestTick, compareShadowSamples, samplePhoneFrames, type ForestView, type ShadowSample } from '../helpers/forest-shadows';

const LABEL = process.env.PERF_LABEL ?? 'after';
const OUT = `test-results/perf/forest-shadows-${LABEL}`;
const revision = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const VIEWS: ForestView[] = [
  { id: 'today-forest', x: 1240, z: -1060, yaw: 250, pitch: -4 },
  { id: 'today-forest-b', x: 1632, z: -1640, yaw: 260, pitch: -6 },
  { id: 'today-forest-c', x: 1952, z: -1010, yaw: 260, pitch: -6 },
];
const VIEW_B = VIEWS[1]!;
const STILL_TICK = 20;

test.use({
  launchOptions: {
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
  },
});

async function loadView(page: Page, graphics: 'high' | 'medium' | 'low', manual = false, tour = false) {
  const phone = graphics === 'low';
  await page.goto(`./?notitle&nosave&fresh&q=${graphics}&cam=third${manual ? '&manual&idle' : ''}${tour ? '&story' : ''}`);
  await page.waitForFunction(() => window.kq?.ctx.input.enabled && !window.kq.ctx.loop.paused);
  await page.addStyleTag({ content: '.kq-bullet-time,.kq-click-to-play{display:none!important}' });
  const profile = await page.evaluate(async ({ graphics, phone }) => {
    const k = window.kq!;
    const { settings, renderer, world, input, quality } = k.ctx;
    settings.update((s) => {
      s.graphics = graphics;
      s.fov = 80;
      s.cameraZoom = 3.6;
      s.fpsCap = phone ? 60 : 0;
      s.powerSave = phone;
      s.reducedMotion = phone;
    }, 'graphics');
    await k.avatar?.ready();
    await k.screenshotReady();
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      gpu: String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
      size: [innerWidth, innerHeight],
      pixelRatio: renderer.getPixelRatio(),
      quality: quality.level,
      touch: input.touchMode,
      shadows: world.shadows.enabled,
      fpsCap: settings.state.fpsCap,
      powerSave: settings.state.powerSave,
      reducedMotion: settings.state.reducedMotion,
    };
  }, { graphics, phone });
  expect(profile.gpu).toMatch(/metal/i);
  expect(isSoftwareGpu(profile.gpu)).toBe(false);
  expect(profile).toMatchObject({ quality: graphics, shadows: !phone, powerSave: phone, reducedMotion: phone });
  if (phone) {
    expect(profile.touch).toBe(true);
    if (!manual) expect(await page.evaluate(() => window.kq!.ctx.loop.pace())).toBe(30);
  } else {
    await page.waitForFunction(() => window.kq!.ctx.world.forest.usesModels);
  }
  return profile;
}

async function takeStills(page: Page, graphics: 'high' | 'low', views = VIEWS) {
  for (const view of views) {
    await loadView(page, graphics, true);
    const tick = await page.evaluate(captureForestTick, { view, tick: STILL_TICK });
    expect(tick).toBe(STILL_TICK);
    await page.screenshot({ path: `${OUT}/${graphics}-${view.id}.png` });
  }
}

async function captureMotion(page: Page, graphics: 'medium' | 'high') {
  await loadView(page, graphics, true);
  await page.evaluate(() => {
    const { world } = window.kq!.ctx;
    // Match the tour's low afternoon sun during the walking and turning check.
    world.look.sun.azimuth = 214;
    world.look.sun.elevation = 13;
    world.applyLook();
  });
  expect(await page.evaluate(captureForestTick, { view: VIEW_B, tick: STILL_TICK })).toBe(STILL_TICK);
  for (let i = 1; i <= 6; i++) {
    const tick = await page.evaluate(() => {
      const k = window.kq!;
      for (let j = 0; j < 10; j++) {
        k.ctx.input.press('forward', true);
        k.ctx.input.addLook(8, 0);
        k.step(1);
      }
      k.ctx.input.press('forward', false);
      return k.ctx.loop.tick;
    });
    expect(tick).toBe(STILL_TICK + i * 10);
    await page.screenshot({ path: `${OUT}/${graphics}-b-motion-${tick}.png` });
  }
}

test.describe('desktop Hoch', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.25,
  });
  test('measures paired shadow cost and captures the forest and low sun motion', async ({ page }) => {
    test.setTimeout(360_000);
    const errors = trackErrors(page);
    const profile = await loadView(page, 'high');
    const ids = VIEWS.map(({ id }) => id);
    const samples = await page.evaluate(async (only) => {
      const k = window.kq!;
      const { world, loop } = k.ctx;
      const opts = { only, warmup: 90, frames: 240, log: false };
      const strength = world.shadows.strength;
      const results = [];
      try {
        for (const on of [true, false, false, true, true, false]) {
          world.shadows.strength = on ? strength : 0;
          results.push({ shadowMap: on, ...await k.bench(opts) });
        }
        return results;
      } finally {
        world.shadows.strength = strength;
        loop.requestRender();
      }
    }, ids);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/high.json`, JSON.stringify({ revision: revision(), profile, samples }, null, 2));
    for (const sample of samples) {
      expect(sample.scenes.map(({ id }) => id)).toEqual(ids);
      expect(sample.scenes.every(({ frames }) => frames >= 200)).toBe(true);
    }
    if (LABEL !== 'before') {
      const baseline: { profile: typeof profile; samples: ShadowSample[] } = JSON.parse(
        readFileSync('test-results/perf/forest-shadows-before/high.json', 'utf8'),
      );
      expect(baseline.profile).toEqual(profile);
      const comparison = compareShadowSamples(baseline.samples, samples, ids);
      writeFileSync(`${OUT}/comparison.json`, JSON.stringify(comparison, null, 2));
      const viewB = comparison.find(({ id }) => id === VIEW_B.id)!;
      expect.soft(viewB.reductionMs, `view B median paired reduction in ${viewB.metric}`).toBeGreaterThanOrEqual(VIEW_B_TARGET_MS);
    }
    await takeStills(page, 'high');
    await captureMotion(page, 'high');
    await captureMotion(page, 'medium');
    expect(errors).toEqual([]);
  });
});

test.describe('phone Niedrig', () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  test('measures paced renders and captures the tour with touch and reduced motion', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    const profile = await loadView(page, 'low', false, true);
    const samples = [];
    for (const view of [undefined, ...VIEWS]) {
      if (view) {
        await page.evaluate(({ x, z, yaw, pitch }) => window.kq!.teleport(x, z, yaw, pitch), view);
      }
      const sample = await page.evaluate(samplePhoneFrames, { warmupMs: 2500, durationMs: 5000 });
      samples.push({ id: view?.id ?? 'tour-opening', ...sample, frameMs: frameStats(sample.intervals), cpuMs: frameStats(sample.cpu) });
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/low.json`, JSON.stringify({ revision: revision(), profile, samples }, null, 2));
    for (const { id, frameMs } of samples) {
      expect.soft(frameMs.n, id).toBeGreaterThan(100);
      expect.soft(1000 / frameMs.avg, id).toBeGreaterThanOrEqual(27);
      expect.soft(1000 / frameMs.avg, id).toBeLessThanOrEqual(31);
    }

    await loadView(page, 'low', true, true);
    expect(await page.evaluate(captureForestTick, { tick: STILL_TICK })).toBe(STILL_TICK);
    await page.screenshot({ path: `${OUT}/low-tour-opening.png` });
    await takeStills(page, 'low');
    expect(errors).toEqual([]);
  });
});
