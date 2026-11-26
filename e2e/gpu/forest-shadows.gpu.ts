import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { isSoftwareGpu } from '../../src/render/quality';
import { trackErrors } from '../helpers/common';

const OUT = `test-results/perf/forest-shadows-${process.env.PERF_LABEL ?? 'after'}`;
const VIEWS = [
  { id: 'today-forest', x: 1240, z: -1060, yaw: 250, pitch: -4 },
  { id: 'today-forest-b', x: 1632, z: -1640, yaw: 260, pitch: -6 },
  { id: 'today-forest-c', x: 1952, z: -1010, yaw: 260, pitch: -6 },
];

test.use({
  launchOptions: {
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
  },
});

async function compare(page: Page, quality: 'high' | 'low') {
  const errors = trackErrors(page);
  const phone = quality === 'low';
  await page.goto(`./?notitle&nosave&fresh&q=${quality}&cam=third`);
  await page.waitForFunction(() => window.kq?.ctx.input.enabled && !window.kq.ctx.loop.paused);
  await page.addStyleTag({ content: '.kq-bullet-time,.kq-click-to-play{display:none!important}' });
  const profile = await page.evaluate(async ({ quality, phone }) => {
    const k = window.kq!;
    const { settings, renderer, world, input, quality: activeQuality } = k.ctx;
    settings.update((s) => {
      s.graphics = quality;
      s.fov = 80;
      s.cameraZoom = 3.6;
      s.fpsCap = phone ? 30 : 0;
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
      quality: activeQuality.level,
      touch: input.touchMode,
      shadows: world.shadows.enabled,
    };
  }, { quality, phone });
  expect(profile.gpu).toMatch(/metal/i);
  expect(isSoftwareGpu(profile.gpu)).toBe(false);
  expect(profile).toMatchObject({ quality, shadows: !phone });
  mkdirSync(OUT, { recursive: true });
  if (phone) {
    expect(profile.touch).toBe(true);
    await page.screenshot({ path: `${OUT}/low-tour-opening.png` });
  } else {
    await page.waitForFunction(() => window.kq!.ctx.world.forest.usesModels);
  }

  const samples = await page.evaluate(async ({ only, phone }) => {
    const k = window.kq!;
    const { world, loop } = k.ctx;
    const opts = { only, warmup: 90, frames: 240, log: false };
    const strength = world.shadows.strength;
    const results = [];
    try {
      // Alternate modes so a warm-up or another job on the machine is visible in the repeats.
      for (const on of phone ? [false] : [true, false, true, false, true, false]) {
        world.shadows.strength = on ? strength : 0;
        const result = await k.bench(opts);
        results.push({ shadowMap: on, ...result });
      }
      return results;
    } finally {
      world.shadows.strength = strength;
      loop.requestRender();
    }
  }, { only: VIEWS.map(({ id }) => id), phone });
  writeFileSync(`${OUT}/${quality}.json`, JSON.stringify({ profile, samples }, null, 2));
  for (const sample of samples) {
    expect(sample.scenes.map(({ id }) => id)).toEqual(VIEWS.map(({ id }) => id));
    expect(sample.scenes.every(({ frames }) => frames >= 200)).toBe(true);
  }

  await page.evaluate(() => { window.kq!.ctx.loop.manual = true; });
  for (const view of VIEWS) {
    await page.evaluate(async ({ x, z, yaw, pitch }) => {
      const k = window.kq!;
      k.teleport(x, z, yaw, pitch);
      k.step(2);
      await k.screenshotReady();
    }, view);
    await page.screenshot({ path: `${OUT}/${quality}-${view.id}.png` });
  }
  expect(errors).toEqual([]);
}

test.describe('desktop Hoch', () => {
  test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25 });
  test('times and captures the three forest views with paired shadow toggles', async ({ page }) => {
    test.setTimeout(240_000);
    await compare(page, 'high');
  });
});

test.describe('phone Niedrig', () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  test('captures the tour and forest with touch and reduced motion', async ({ page }) => {
    await compare(page, 'low');
  });
});
