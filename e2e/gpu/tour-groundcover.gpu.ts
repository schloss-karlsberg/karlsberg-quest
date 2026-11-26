import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { InstancedMesh } from 'three';
import type { GraphicsLevel } from '../../src/core/save';
import { frameStats, PERF_BUDGET } from '../../src/render/perf';
import { isSoftwareGpu } from '../../src/render/quality';
import { trackErrors } from '../helpers/common';

/** TASK-008. Labels select matched scenery, terrain-detail and startup-budget views. */
const LABEL = process.env.PERF_LABEL ?? 'after';
const OUT = `test-results/contribute/TASK-008/${LABEL}`;
const STARTUP_VIEWS = LABEL === 'slice4-before' || LABEL === 'slice4-after';
const PLATEAU_VIEWS = LABEL === 'slice5-before' || LABEL === 'slice5-after';
const UNDERSTORY_VIEWS = LABEL === 'slice6-before' || LABEL === 'slice6-after';
const MESH_VIEWS = LABEL === 'slice7-before' || LABEL === 'slice7-after';
const PLATEAU_POSE = PLATEAU_VIEWS || UNDERSTORY_VIEWS || MESH_VIEWS;
const TOUR_PROP_VIEWS = STARTUP_VIEWS || PLATEAU_POSE || LABEL === 'slice2-before' || LABEL === 'slice2-after';
const TERRAIN_DETAIL_VIEWS = STARTUP_VIEWS || PLATEAU_POSE || LABEL === 'slice3-before' || LABEL === 'slice3-after';
const VIEWS = [
  { id: '01-karlsberger-hof', era: 'today', x: 524, z: -770, yaw: 253 },
  { id: '02-felsenpfad', era: 'today', x: 683, z: -596, yaw: 90 },
  { id: '03-weiher', era: 'today', x: 897.2, z: -845.3, yaw: 0 },
  { id: '04-quelle', era: 'today', x: 1059, z: -833, yaw: 270 },
  { id: '05-palace-plateau', era: 'today', x: 1216, z: -1114, yaw: 270 },
  { id: '06-ehrenhof', era: '1789', x: 1138, z: -1120, yaw: 90 },
] as const;
const PLATEAU_VIEW = { ...VIEWS[4], x: 1199, z: -1115.2, yaw: 96 } as const;
const CAPTURE_VIEWS = PLATEAU_POSE ? [...VIEWS.slice(0, 4), PLATEAU_VIEW, VIEWS[5]] : VIEWS;
type View = (typeof CAPTURE_VIEWS)[number];
const PROP_YAWS: Partial<Record<View['id'], number>> = {
  '01-karlsberger-hof': 312,
  '02-felsenpfad': 72,
  '03-weiher': 20,
};
const UNDERSTORY_STOPS: Partial<Record<View['id'], { site: string; yaw: number }>> = {
  '03-weiher': { site: 'weiher', yaw: 74 },
  '04-quelle': { site: 'quelle', yaw: 68 },
  '05-palace-plateau': { site: 'plateau', yaw: 78 },
};
const BANK_YAWS: Partial<Record<View['id'], number>> = {
  '01-karlsberger-hof': 195,
  '02-felsenpfad': 72,
  '03-weiher': 255,
  '04-quelle': 196,
  '05-palace-plateau': 338,
};
const LONG_FRAME_MS = 25; // 1.5 frames at the 60 fps cap

function writeJson(name: string, result: unknown): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(result, null, 2));
}

async function boot(page: Page, reducedMotion: boolean, graphics: GraphicsLevel = 'low') {
  await page.goto(`./?notitle&nosave&fresh&manual&q=${graphics}&cam=third`);
  await page.waitForFunction(() => window.kq?.ctx.input.enabled && !window.kq.ctx.loop.paused, null, { timeout: 120_000 });
  await page.addStyleTag({ content: '.kq-bullet-time,.kq-click-to-play{display:none!important}' });
  await page.evaluate(async ({ reduced, graphics }) => {
    const k = window.kq!;
    k.ctx.settings.update((s) => {
      s.graphics = graphics;
      s.fov = 80;
      s.cameraZoom = 3.6;
      s.fpsCap = 60;
      s.powerSave = false;
      s.reducedMotion = reduced;
    }, 'graphics');
    await k.avatar?.ready();
    await k.screenshotReady();
  }, { reduced: reducedMotion, graphics });
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
  expect(profile).toMatchObject({ graphics, fpsCap: 60, powerSave: false, reducedMotion });
  return profile;
}

async function shootViews(page: Page, prefix: string, terrainDetail = false) {
  const results = [];
  for (const view of CAPTURE_VIEWS) {
    const understory = UNDERSTORY_VIEWS ? UNDERSTORY_STOPS[view.id] : undefined;
    const still = {
      ...view,
      yaw: (MESH_VIEWS ? BANK_YAWS[view.id] : undefined) ?? understory?.yaw ?? (TOUR_PROP_VIEWS ? PROP_YAWS[view.id] : undefined) ?? view.yaw,
      pitch: terrainDetail && view.era === 'today' ? -18 : -6,
    };
    await page.evaluate(({ era, x, z, yaw, pitch }) => {
      const k = window.kq!;
      k.setEra(era);
      k.teleport(x, z, yaw, pitch);
      k.step(2);
    }, still);
    if (LABEL === 'slice5-after' && view.id === PLATEAU_VIEW.id) {
      await page.waitForFunction(() => window.kq!.ctx.scene.getObjectByName('scenery-palace-plateau')?.visible, null, { timeout: 30_000 });
    }
    if (LABEL === 'slice6-after' && understory) {
      await page.waitForFunction((name) => window.kq!.ctx.scene.getObjectByName(name)?.visible, `castle-understory-${understory.site}`, { timeout: 30_000 });
    }
    const result = await page.evaluate(async () => {
      const k = window.kq!;
      await k.screenshotReady();
      const { calls, triangles } = k.ctx.renderer.info.render;
      const tourSets = k.scenery!.built().filter((id) => id.startsWith('tour-'));
      const plateau = k.ctx.scene.getObjectByName('scenery-palace-plateau') as InstancedMesh | undefined;
      const plants = k.ctx.scene.getObjectByName('scenery-castle-understory')?.children.filter((mesh) => mesh.visible) as InstancedMesh[] | undefined;
      const relief = k.ctx.world.terrain.object.getObjectByName('terrain-dgm1');
      return {
        clock: k.ctx.loop.time, calls, triangles, cover: { ...k.ctx.world.nature.cover.stats }, tourSets, plateauParts: plateau?.count ?? 0,
        understory: plants?.map(({ name, count }) => ({ name, count })) ?? [],
        meshDetail: !!relief?.visible,
      };
    });
    await page.screenshot({ path: `${OUT}/${prefix}-${view.id}.png` });
    results.push({ ...still, ...result });
  }
  return results;
}

function checkMeshDetail(views: Awaited<ReturnType<typeof shootViews>>, graphics: GraphicsLevel) {
  if (!MESH_VIEWS) return;
  for (const view of views) {
    expect.soft(view.meshDetail, view.id).toBe(LABEL === 'slice7-after' && graphics !== 'low' && view.era === 'today');
  }
}

function checkUnderstory(views: Awaited<ReturnType<typeof shootViews>>, graphics: GraphicsLevel) {
  if (!UNDERSTORY_VIEWS) return;
  for (const view of views) {
    const expected = LABEL === 'slice6-after' ? UNDERSTORY_STOPS[view.id] : undefined;
    if (expected) {
      expect.soft(view.understory.map(({ name }) => name), view.id).toEqual([`castle-understory-${expected.site}`]);
      const count = view.understory[0]?.count ?? 0;
      expect.soft(count, view.id).toBeGreaterThan(0);
      expect.soft(count, view.id).toBeLessThanOrEqual(graphics === 'low' ? 39 : 134);
    } else {
      expect.soft(view.understory, view.id).toEqual([]);
    }
  }
}

function checkPlateau(views: Awaited<ReturnType<typeof shootViews>>, graphics: GraphicsLevel) {
  if (!PLATEAU_VIEWS) return;
  const parts = graphics === 'low' ? 25 : 32;
  for (const view of views) {
    const expected = LABEL === 'slice5-after' && view.id === PLATEAU_VIEW.id ? parts : 0;
    expect.soft(view.plateauParts, view.id).toBe(expected);
  }
}

function checkTourSets(views: Awaited<ReturnType<typeof shootViews>>) {
  if (!TOUR_PROP_VIEWS) return;
  for (const view of views) {
    const expected = LABEL !== 'slice2-before' && PROP_YAWS[view.id] !== undefined ? [`tour-${view.id.slice(3)}`] : [];
    expect.soft(view.tourSets, view.id).toEqual(expected);
  }
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
    longFrames: sample.frames.filter((ms) => ms > LONG_FRAME_MS).length,
    elapsedMs: sample.elapsedMs,
    walkedM: sample.walkedM,
    callsMax: sample.calls,
    trianglesMax: sample.triangles,
  };
}

function checkWalk(sample: Awaited<ReturnType<typeof walkAndTurn>>, label: string, checkTriangles = true) {
  expect.soft(sample.frameMs.n, `${label} sampled frames`).toBeGreaterThan(0);
  expect.soft(sample.walkedM, `${label} walked metres`).toBeGreaterThan(0.5);
  expect.soft(sample.cpuMs.p95, `${label} CPU p95`).toBeLessThanOrEqual(PERF_BUDGET.cpuMs);
  expect.soft(sample.callsMax, `${label} all-pass draws`).toBeLessThanOrEqual(PERF_BUDGET.calls);
  if (checkTriangles) expect.soft(sample.trianglesMax, `${label} all-pass triangles`).toBeLessThanOrEqual(PERF_BUDGET.triangles);
}

test.describe.configure({ timeout: 300_000 });

test('Hoch opening from the title at Karlsberger Hof', async ({ page }) => {
  test.skip(!STARTUP_VIEWS && !MESH_VIEWS, 'use a slice4 or slice7 capture label');
  const errors = trackErrors(page);
  await page.goto('./?nosave&fresh&q=high&cam=third');
  const newGame = page.getByTestId('title-new');
  await expect(newGame).toBeEnabled({ timeout: 120_000 });
  await newGame.click();
  await page.getByTestId('warning-accept').click();
  await page.getByTestId('player-name').fill('Mara');
  await page.getByTestId('name-confirm').click();
  await page.getByTestId('start-tour').click();
  await expect(page.getByTestId('title')).toBeHidden({ timeout: 30_000 });
  const opening = await page.evaluate(() => {
    const k = window.kq!;
    return {
      graphics: k.ctx.quality.level,
      chapter: k.story!.state().chapter,
      era: k.ctx.era.current,
      fromCheckpoint: Math.hypot(k.ctx.player.position.x - 529, k.ctx.player.position.z + 777),
    };
  });
  expect(opening).toMatchObject({ graphics: 'high', chapter: 'tour', era: 'today' });
  expect(opening.fromCheckpoint).toBeLessThan(5);
  if (LABEL === 'slice7-after') {
    await page.waitForFunction(() => !!window.kq!.ctx.world.terrain.uniforms.uRelief?.value, null, { timeout: 30_000 });
  }
  await page.screenshot({ path: `${OUT}/desktop-high-opening.png` });
  // The byte spec checks request timing. Here the palace must arrive after entry through the title.
  await page.waitForFunction(() => window.kq!.ctx.world.palace.triangles > 0, null, { timeout: 120_000 });
  expect(errors).toEqual([]);
});

test('six matched Niedrig ground-cover views', async ({ page }) => {
  const errors = trackErrors(page);
  const profile = await boot(page, false);
  const views = await shootViews(page, 'desktop');
  writeJson('desktop-views', { profile, views });
  checkTourSets(views);
  checkPlateau(views, 'low');
  checkUnderstory(views, 'low');
  checkMeshDetail(views, 'low');
  expect(views.at(-1)!.cover).toMatchObject({ grass: 0, flowers: 0, reeds: 0 });
  if (LABEL === 'before' || LABEL === 'pr26-before') {
    for (const view of views) expect(view.cover, view.id).toMatchObject({ grass: 0, flowers: 0, reeds: 0 });
  } else if (LABEL === 'after' || LABEL === 'pr26-after') {
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
    const views = await shootViews(page, 'phone-reduced-motion');
    writeJson('phone-reduced-motion-views', { profile, views });
    checkTourSets(views);
    checkPlateau(views, 'low');
    checkUnderstory(views, 'low');
    checkMeshDetail(views, 'low');
    await page.evaluate(() => window.kq!.ctx.settings.update((s) => { s.reducedMotion = false; }, 'reducedMotion'));
    const liveProfile = { ...profile, reducedMotion: false };

    const route = [];
    for (const view of CAPTURE_VIEWS.slice(0, PLATEAU_POSE ? 5 : 4)) {
      await page.evaluate(() => window.kq!.setEra('today'));
      const sample = await walkAndTurn(page, view);
      route.push(sample);
      checkWalk(sample, view.id);
      if (LABEL === 'slice5-after' && view.id === PLATEAU_VIEW.id) {
        expect.soft(sample.renderedFps, 'Niedrig palace plateau at the 60 fps cap').toBeGreaterThanOrEqual(57);
      }
      if (MESH_VIEWS || (LABEL === 'slice6-after' && UNDERSTORY_STOPS[view.id])) {
        expect.soft(sample.renderedFps, `Niedrig ${view.id} at the 60 fps cap`).toBeGreaterThanOrEqual(57);
      }
    }
    writeJson('phone-route', { profile: liveProfile, budget: PERF_BUDGET, longFrameMs: LONG_FRAME_MS, route });

    const repeats = [];
    for (let run = 1; run <= 3; run++) {
      const sample = await walkAndTurn(page, VIEWS[3]);
      repeats.push({ run, ...sample });
      checkWalk(sample, `${sample.id} repeat ${run}`);
    }
    writeJson('phone-quelle-recheck', { profile: liveProfile, budget: PERF_BUDGET, longFrameMs: LONG_FRAME_MS, repeats });

    const bench = await page.evaluate(() => window.kq!.bench({ frames: 60, warmup: 15, log: false }));
    writeJson('phone-bench', bench);
    expect(bench).toMatchObject({ size: [667, 375], quality: 'low' });
    expect(bench.scenes).toHaveLength(9);
    for (const scene of bench.scenes) expect.soft(scene.withinBudget, scene.id).toBe(true);
    expect(await page.evaluate(() => !!window.kq!.ctx.world.terrain.uniforms.uSurfDetail?.value)).toBe(false);
    expect(await page.evaluate(() => !!window.kq!.ctx.world.terrain.uniforms.uRelief?.value)).toBe(false);
    expect(errors).toEqual([]);
  });
});

test.describe('DGM1 terrain on desktop', () => {
  test.skip(!TERRAIN_DETAIL_VIEWS, 'use a slice3 through slice7 capture label');

  for (const graphics of ['medium', 'high'] as const) {
    test(`${graphics}: six matched terrain views and five live route samples`, async ({ page }) => {
      const errors = trackErrors(page);
      const profile = await boot(page, false, graphics);
      const hasDetail = LABEL !== 'slice3-before';
      await page.waitForFunction((hasDetail) => {
        const { terrain, nature } = window.kq!.ctx.world;
        return terrain.splat && nature.status.trees === 'on' && (!hasDetail || !!terrain.uniforms.uSurfDetail?.value);
      }, hasDetail, { timeout: 120_000 });
      if (LABEL === 'slice7-after') {
        await page.waitForFunction(() => !!window.kq!.ctx.world.terrain.uniforms.uRelief?.value, null, { timeout: 30_000 });
      }
      const source = await page.evaluate(() => {
        const { terrain } = window.kq!.ctx.world;
        return terrain.uniforms.uSurfDetail?.value ? terrain.uniforms.uSurfDetailGrid!.value as number[] : null;
      });
      expect(source).toEqual(hasDetail ? [448, -1248, 896, 832] : null);
      const views = await shootViews(page, `desktop-${graphics}`, true);
      if (STARTUP_VIEWS || PLATEAU_POSE) checkTourSets(views);
      checkPlateau(views, graphics);
      checkUnderstory(views, graphics);
      checkMeshDetail(views, graphics);
      writeJson(`desktop-${graphics}-views`, { profile, source, views });

      await page.evaluate(() => window.kq!.setEra('today'));
      const route = [];
      for (const view of CAPTURE_VIEWS.slice(0, 5)) {
        const sample = await walkAndTurn(page, view);
        route.push(sample);
        // Hoch has known baseline triangle overruns (docs/PERFORMANCE.md §3.5). Record both runs.
        checkWalk(sample, view.id, graphics === 'medium');
      }
      writeJson(`desktop-${graphics}-route`, { profile, budget: PERF_BUDGET, longFrameMs: LONG_FRAME_MS, route });
      expect(errors).toEqual([]);
    });
  }
});
