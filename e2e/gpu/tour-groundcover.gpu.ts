import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { frameStats, PERF_BUDGET } from '../../src/render/perf';
import { isSoftwareGpu } from '../../src/render/quality';
import { trackErrors } from '../helpers/common';

/** TASK-008. Use PERF_LABEL=before on the baseline build and PERF_LABEL=after on the slice. */
const LABEL = process.env.PERF_LABEL ?? 'after';
const OUT = `test-results/contribute/TASK-008/${LABEL}`;
const VIEWS = [
  { id: '01-karlsberger-hof', era: 'today', x: 524, z: -770, yaw: 253 },
  { id: '02-felsenpfad', era: 'today', x: 683, z: -596, yaw: 90 },
  { id: '03-weiher', era: 'today', x: 897.2, z: -845.3, yaw: 0 },
  { id: '04-quelle', era: 'today', x: 1059, z: -833, yaw: 270 },
  { id: '05-palace-plateau', era: 'today', x: 1216, z: -1114, yaw: 270 },
  { id: '06-ehrenhof', era: '1789', x: 1138, z: -1120, yaw: 90 },
] as const;
type View = (typeof VIEWS)[number];

function writeJson(name: string, result: unknown): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(result, null, 2));
}

async function boot(page: Page, reducedMotion: boolean) {
  await page.goto('./?notitle&nosave&fresh&manual&q=low&cam=third');
  await page.waitForFunction(() => window.kq?.ctx.input.enabled && !window.kq.ctx.loop.paused, null, { timeout: 120_000 });
  await page.addStyleTag({ content: '.kq-bullet-time,.kq-click-to-play{display:none!important}' });
  await page.evaluate(async (reduced) => {
    const k = window.kq!;
    k.ctx.settings.update((s) => {
      s.graphics = 'low';
      s.fov = 80;
      s.cameraZoom = 3.6;
      s.fpsCap = 60;
      s.powerSave = false;
      s.reducedMotion = reduced;
    }, 'graphics');
    await k.avatar?.ready();
    await k.screenshotReady();
  }, reducedMotion);
  const profile = await page.evaluate(() => {
    const { renderer, settings, quality, input } = window.kq!.ctx;
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      gpu: String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? ''),
      viewport: { width: innerWidth, height: innerHeight },
      touch: input.touchMode,
      pixelRatio: renderer.getPixelRatio(),
      graphics: quality.level,
      fpsCap: quality.capFps,
      powerSave: settings.state.powerSave,
      reducedMotion: settings.state.reducedMotion,
    };
  });
  expect(profile.gpu, 'ANGLE Metal renderer').toMatch(/metal/i);
  expect(isSoftwareGpu(profile.gpu)).toBe(false);
  expect(profile).toMatchObject({ graphics: 'low', fpsCap: 60, powerSave: false, reducedMotion });
  return profile;
}

async function shootViews(page: Page, prefix: string) {
  const results = [];
  for (const view of VIEWS) {
    const result = await page.evaluate(async ({ era, x, z, yaw }) => {
      const k = window.kq!;
      k.setEra(era);
      k.teleport(x, z, yaw, -6);
      k.step(2);
      await k.screenshotReady();
      const { calls, triangles } = k.ctx.renderer.info.render;
      return { clock: k.ctx.loop.time, calls, triangles, cover: { ...k.ctx.world.nature.cover.stats } };
    }, view);
    await page.screenshot({ path: `${OUT}/${prefix}-${view.id}.png` });
    results.push({ ...view, ...result });
  }
  return results;
}

async function walkAndTurn(page: Page, view: View) {
  const sample = await page.evaluate(async ({ x, z, yaw }) => {
    const k = window.kq!;
    const { input, loop, perf, player } = k.ctx;
    const frames: number[] = [];
    const cpu: number[] = [];
    let calls = 0;
    let triangles = 0;
    let walkedM = 0;
    k.teleport(x, z, yaw, -6);
    let prevX = player.position.x;
    let prevZ = player.position.z;
    loop.manual = false;
    const t0 = performance.now();
    let sampledAt = 0;
    let previousLook = 0;
    let forward: boolean | undefined;
    try {
      await new Promise<void>((resolve) => {
        const walk = (now: number) => {
          const elapsed = now - t0;
          const ahead = Math.floor(elapsed / 1000) % 2 === 0;
          if (ahead !== forward) {
            input.press('forward', ahead);
            input.press('back', !ahead);
            forward = ahead;
          }
          const look = 160 * Math.sin(elapsed * Math.PI / 1500);
          input.addLook(look - previousLook, 0);
          previousLook = look;
          if (!sampledAt && elapsed >= 2500) {
            sampledAt = now;
            prevX = player.position.x;
            prevZ = player.position.z;
            perf.onFrame = (frameMs, cpuMs, drawCalls, tris) => {
              frames.push(frameMs);
              cpu.push(cpuMs);
              calls = Math.max(calls, drawCalls);
              triangles = Math.max(triangles, tris);
              walkedM += Math.hypot(player.position.x - prevX, player.position.z - prevZ);
              prevX = player.position.x;
              prevZ = player.position.z;
            };
          }
          if (sampledAt && now - sampledAt >= 5000) resolve();
          else requestAnimationFrame(walk);
        };
        requestAnimationFrame(walk);
      });
      return { frames, cpu, calls, triangles, walkedM, elapsedMs: performance.now() - sampledAt };
    } finally {
      perf.onFrame = null;
      input.press('forward', false);
      input.press('back', false);
      loop.manual = true;
    }
  }, view);
  return {
    ...view,
    renderedFps: sample.frames.length * 1000 / sample.elapsedMs,
    frameMs: frameStats(sample.frames),
    cpuMs: frameStats(sample.cpu),
    elapsedMs: sample.elapsedMs,
    walkedM: sample.walkedM,
    callsMax: sample.calls,
    trianglesMax: sample.triangles,
  };
}

test.describe.configure({ timeout: 300_000 });

test('six matched Niedrig ground-cover views', async ({ page }) => {
  const errors = trackErrors(page);
  const profile = await boot(page, false);
  const views = await shootViews(page, 'desktop');
  writeJson('desktop-views', { profile, views });
  expect(views.at(-1)!.cover).toMatchObject({ grass: 0, flowers: 0, reeds: 0 });
  if (LABEL === 'before') {
    for (const view of views) expect(view.cover, view.id).toMatchObject({ grass: 0, flowers: 0, reeds: 0 });
  } else if (LABEL === 'after') {
    expect(views[0]!.cover.grass, 'Karlsberger Hof grass').toBeGreaterThan(0);
    expect(views[2]!.cover.reeds, 'Weiher shore reeds').toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

test.describe('667×375 landscape touch', () => {
  test.use({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });

  test('reduced-motion stills, live route timing and nine-scene phone bench', async ({ page }) => {
    const errors = trackErrors(page);
    const profile = await boot(page, true);
    expect(profile).toMatchObject({ viewport: { width: 667, height: 375 }, touch: true, pixelRatio: 1 });
    writeJson('phone-reduced-motion-views', { profile, views: await shootViews(page, 'phone-reduced-motion') });
    await page.evaluate(() => window.kq!.ctx.settings.update((s) => { s.reducedMotion = false; }, 'reducedMotion'));

    const route = [];
    for (const view of VIEWS.slice(0, 4)) {
      await page.evaluate(() => window.kq!.setEra('today'));
      const sample = await walkAndTurn(page, view);
      route.push(sample);
      expect.soft(sample.frameMs.n, `${view.id} sampled frames`).toBeGreaterThan(0);
      expect.soft(sample.walkedM, `${view.id} walked metres`).toBeGreaterThan(0.5);
      expect.soft(sample.callsMax, `${view.id} all-pass draws`).toBeLessThanOrEqual(PERF_BUDGET.calls);
      expect.soft(sample.trianglesMax, `${view.id} all-pass triangles`).toBeLessThanOrEqual(PERF_BUDGET.triangles);
    }
    writeJson('phone-route', { profile: { ...profile, reducedMotion: false }, budget: PERF_BUDGET, route });

    const bench = await page.evaluate(() => window.kq!.bench({ frames: 60, warmup: 15, log: false }));
    writeJson('phone-bench', bench);
    expect(bench).toMatchObject({ size: [667, 375], quality: 'low' });
    expect(bench.scenes).toHaveLength(9);
    for (const scene of bench.scenes) expect.soft(scene.withinBudget, scene.id).toBe(true);
    expect(errors).toEqual([]);
  });
});
