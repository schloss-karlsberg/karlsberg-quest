import { mkdirSync, writeFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

/**
 * Turn sweep on the real GPU (TASK-088): does the picture get lighter or darker when the view
 * turns, by more than what enters the frame explains? At each spot the view turns through 360° in
 * fixed yaw steps, one fixed tick each, and every frame's mean display luminance (0..255, whole
 * frame and thirds: sky / mid / ground) is read back. Three passes per spot:
 *
 * - `cw`, `ccw`: a steady turn in each direction (2° a tick = 120° a second);
 * - `still`: every yaw after the view has rested there (60 ticks).
 *
 * A picture that depends only on where the view is gives three equal curves; a difference between
 * them is state that lags behind or pops during the turn (the lens itself eases and cuts in at
 * walls: every row carries its position, so such steps can be told apart). Each row also has what
 * else can explain a step, and the frame's and the shadow pass's triangles.
 * Out: test-results/gpu/turn-luma-<label>-<tier>.json and a table on the console. One tier at a
 * time, each in its own hold of the exclusive lane:
 *
 *   TURN_LABEL=before TURN_Q=medium KQ_E2E_PORT=5411 scripts/dev/heavy.sh --exclusive --max-hold 6 -- \
 *     pnpm exec playwright test -c playwright.gpu.config.ts turn-luma --workers=1
 *
 * TURN_Q=low,medium,high picks tiers, TURN_SPOTS=a,b the spots. TURN_CAPTURE saves frames of a pass
 * as JPEGs, e.g. `plateau:still:328,330;weiher:cw:320,322`. TURN_UNSEEN_CASTERS=0 switches the
 * out-of-view tree casters off (the state before TASK-088) for a paired before / after in one build.
 * TURN_BENCH=1 runs the frame-cost pass instead (`kq.bench` at five fixed views, uncapped).
 */
const OUT = 'test-results/gpu';
const LABEL = process.env.TURN_LABEL ?? 'run';
const TIERS = (process.env.TURN_Q ?? 'low,medium,high').split(',');
const ONLY = process.env.TURN_SPOTS?.split(',');
const UNSEEN_CASTERS = process.env.TURN_UNSEEN_CASTERS !== '0';
/** spot → pass → yaws to save. */
const CAPTURE: Record<string, Record<string, number[]>> = {};
for (const part of (process.env.TURN_CAPTURE ?? '').split(';').filter(Boolean)) {
  const [spot, pass, yaws] = part.split(':');
  ((CAPTURE[spot!] ??= {})[pass!] ??= []).push(...yaws!.split(',').map(Number));
}
const STEP_DEG = Number(process.env.TURN_STEP ?? 2);
/** TURN_BENCH=1: the frame-cost pass (`kq.bench`) instead of the sweep. */
const BENCH = process.env.TURN_BENCH === '1';
mkdirSync(OUT, { recursive: true });
test.describe.configure({ timeout: 900_000 });

const SPOTS = [
  { id: 'hof', era: 'today', x: 524, z: -770 }, // car park, tour start
  { id: 'felsenpfad', era: 'today', x: 683, z: -596 }, // forest path in the gorge
  { id: 'weiher', era: 'today', x: 897.2, z: -845.3 }, // at the water
  { id: 'quelle', era: 'today', x: 1059, z: -833 },
  { id: 'plateau', era: 'today', x: 1216, z: -1114 },
  { id: 'wald', era: 'today', x: 1240, z: -1060 }, // forest at the corps de logis
  { id: 'waldrand', era: 'today', x: 1216, z: -1052 }, // on a path along the forest's edge
  { id: 'ehrenhof-1789', era: '1789', x: 1138, z: -1120 },
  { id: 'portal-1789', era: '1789', x: 1199, z: -1115.2 }, // outside the palace door
  { id: 'weiher-1789', era: '1789', x: 897.2, z: -845.3 },
  { id: 'quelle-1789', era: '1789', x: 1059, z: -833 }, // at the spring house (the lens cuts in at its wall)
  { id: 'forst-1789', era: '1789', x: 912, z: -616 }, // forest edge
  { id: 'allee-1793-02', era: '1793-02', x: 1138, z: -1120 }, // night, snow
  { id: 'forst-1793-02', era: '1793-02', x: 912, z: -616 },
  { id: 'forst-1793-07', era: '1793-07', x: 912, z: -616 },
  { id: 'forst-1796', era: '1796', x: 912, z: -616 },
] as const;

interface Row {
  yaw: number;
  all: number;
  sky: number;
  mid: number;
  ground: number;
  canopy: number;
  camX: number;
  camY: number;
  camZ: number;
  pitch: number;
  casters: number;
  boom: number;
  shadowOn: number;
  trees: [number, number, number, number];
  cover: number;
  reflection: boolean;
  waterCov: number;
  chunks: number;
  see: number;
  /** Triangles and draw calls of the frame (all passes), and of its shadow pass. */
  tris: number;
  calls: number;
  shadowTris: number;
}

interface Shot {
  pass: string;
  yaw: number;
  url: string;
}

async function sweep(page: Page, spot: (typeof SPOTS)[number]): Promise<{ cw: Row[]; ccw: Row[]; still: Row[]; shots: Shot[] }> {
  await page.evaluate(async ({ era, x, z }) => {
    const k = window.kq!;
    if (k.ctx.era.current !== era) k.setEra(era);
    k.teleport(x, z, 0, -8);
    k.step(2);
    await k.screenshotReady();
  }, spot);
  // everything around streams in during a first, unmeasured turn
  await page.evaluate(async () => {
    const k = window.kq!;
    for (let d = 0; d < 360; d += 30) {
      k.ctx.player.yaw = (-d * Math.PI) / 180;
      k.step(10, { draw: true });
      await new Promise((r) => setTimeout(r, 120));
    }
    await k.screenshotReady();
  });
  await page.waitForTimeout(1500);
  return page.evaluate(
    ({ stepDeg, capture }) => {
      const k = window.kq!;
      const ctx = k.ctx;
      const shots: Shot[] = [];
      const info = ctx.renderer.info.render;
      // the shadow pass's share of the frame's triangles
      const shadows = ctx.world.shadows as unknown as { update: (...a: unknown[]) => void; kqWrapped?: boolean };
      const counter = window as unknown as { kqShadowTris: number };
      if (!shadows.kqWrapped) {
        const update = shadows.update.bind(shadows);
        shadows.update = (...a) => {
          const t0 = info.triangles;
          update(...a);
          counter.kqShadowTris = info.triangles - t0;
        };
        shadows.kqWrapped = true;
      }
      const gl = ctx.renderer.getContext();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const buf = new Uint8Array(w * h * 4);
      const u = ctx.world.forest.material.uniforms as Record<string, { value: { x: number; w: number } & number }>;
      const measure = (deg: number, pass: string): Row => {
        const tris = info.triangles;
        const calls = info.calls;
        if (capture[pass]?.includes(deg)) shots.push({ pass, yaw: deg, url: ctx.renderer.domElement.toDataURL('image/jpeg', 0.92) });
        ctx.renderer.setRenderTarget(null);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        // rows from the bottom: ground third, middle third, sky third
        const sum = [0, 0, 0];
        const cnt = [0, 0, 0];
        for (let y = 0; y < h; y += 2) {
          const band = Math.min(2, Math.floor((y * 3) / h));
          let s = 0;
          for (let x = 0, o = y * w * 4; x < w; x += 2, o += 8) s += 0.2126 * buf[o]! + 0.7152 * buf[o + 1]! + 0.0722 * buf[o + 2]!;
          sum[band]! += s;
          cnt[band]! += Math.ceil(w / 2);
        }
        const f = ctx.world.forest.stats;
        const c = ctx.world.nature.cover.stats;
        const wa = ctx.world.water.stats;
        const mt = ctx.world.nature.modelTrees as { stats: { shadowLod?: number; shadowImp?: number } } | null;
        return {
          yaw: deg,
          all: (sum[0]! + sum[1]! + sum[2]!) / (cnt[0]! + cnt[1]! + cnt[2]!),
          ground: sum[0]! / cnt[0]!,
          mid: sum[1]! / cnt[1]!,
          sky: sum[2]! / cnt[2]!,
          canopy: u.uUnderCanopy!.value as number,
          camX: ctx.camera.position.x,
          camY: ctx.camera.position.y,
          camZ: ctx.camera.position.z,
          pitch: ctx.camera.rotation.x,
          casters: (mt?.stats.shadowLod ?? 0) + (mt?.stats.shadowImp ?? 0),
          boom: ctx.player.rig.distance,
          shadowOn: u.uShadowParams!.value.x,
          trees: [f.near, f.mid, f.far, f.culled],
          cover: c.grass + c.flowers + c.reeds,
          reflection: wa.reflection,
          waterCov: wa.coverage,
          chunks: ctx.world.terrain.stats.chunks,
          see: u.uSeeCam ? u.uSeeCam.value.w : 0,
          tris,
          calls,
          shadowTris: counter.kqShadowTris ?? 0,
        };
      };
      const face = (deg: number) => (ctx.player.yaw = (-deg * Math.PI) / 180);
      const turn = (from: number, sign: 1 | -1, pass: string): Row[] => {
        const rows: Row[] = [];
        // one unmeasured lap first, so the turn is steady when the measured lap starts
        for (let lap = 0; lap < 2; lap++)
          for (let i = 0; i < 360 / stepDeg; i++) {
            const deg = (((from + sign * i * stepDeg) % 360) + 360) % 360;
            face(deg);
            k.step(1, { draw: true });
            if (lap === 1) rows.push(measure(deg, pass));
          }
        return rows;
      };
      const cw = turn(0, 1, 'cw');
      const ccw = turn(0, -1, 'ccw');
      const still: Row[] = [];
      for (let deg = 0; deg < 360; deg += stepDeg) {
        face(deg);
        for (let i = 0; i < 60; i++) ctx.loop.step(1, false);
        k.step(1, { draw: true });
        still.push(measure(deg, 'still'));
      }
      return { cw, ccw, still, shots };
    },
    { stepDeg: STEP_DEG, capture: CAPTURE[spot.id] ?? {} },
  );
}

/** Largest step between neighbouring yaws, against the curve's typical step. */
function jumps(rows: Row[], key: 'all' | 'sky' | 'mid' | 'ground') {
  const d = rows.map((r, i) => r[key] - rows[(i + rows.length - 1) % rows.length]![key]);
  const abs = d.map(Math.abs);
  const sorted = [...abs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  let at = 0;
  for (let i = 1; i < abs.length; i++) if (abs[i]! > abs[at]!) at = i;
  return { max: abs[at]!, at: rows[at]!.yaw, median, signed: d[at]! };
}

/** Largest difference between two passes at the same yaw. */
function apart(a: Row[], b: Row[], key: 'all' | 'sky' | 'mid' | 'ground') {
  const by = new Map(b.map((r) => [r.yaw, r]));
  let max = 0;
  let at = 0;
  let sum = 0;
  for (const r of a) {
    const d = Math.abs(r[key] - by.get(r.yaw)![key]);
    sum += d;
    if (d > max) {
      max = d;
      at = r.yaw;
    }
  }
  return { max, at, mean: sum / a.length };
}

// Frame cost at the bench's fixed views (frame / CPU / GPU ms, calls, triangles), uncapped, the
// shadow map every frame: run it on the build before and after a change, on a quiet machine.
if (BENCH) test.use({ launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] } });
for (const tier of TIERS) frameCost(tier);

function frameCost(tier: string): void {
  test(`gpu: frame cost, ${tier}`, async ({ page }) => {
    test.skip(!BENCH, 'TURN_BENCH=1 runs the frame-cost pass');
    await page.goto(`./?notitle&nosave&fresh&manual&idle&q=${tier}&x=524&z=-770`);
    await page.waitForFunction(() => !!window.kq?.walk, null, { timeout: 180_000 });
    if (!UNSEEN_CASTERS) await page.evaluate(() => (window.kq!.ctx.world.forest.casting = () => false));
    await page.evaluate(() => window.kq!.screenshotReady());
    const only = ['today-fly', 'today-forest', '1789-fly', '1789-ehrenhof', '1796-ruin'];
    // twice: the first run compiles and streams, the second is the measurement
    await page.evaluate((ids) => window.kq!.bench({ frames: 40, warmup: 20, only: ids, log: false }), only);
    const bench = await page.evaluate((ids) => window.kq!.bench({ frames: 240, warmup: 40, only: ids, log: false }), only);
    writeFileSync(`${OUT}/turn-bench-${LABEL}-${tier}.json`, JSON.stringify(bench));
    console.log(`\nframe cost ${LABEL} / ${tier}`);
    console.table(bench.scenes.map((sc) => ({ scene: sc.id, 'frame avg': sc.frameMs.avg.toFixed(2), p95: sc.frameMs.p95.toFixed(2), 'cpu avg': sc.cpuMs.avg.toFixed(2), gpu: sc.gpuMs?.toFixed(2) ?? '-', 'calls avg/max': `${Math.round(sc.calls.avg)} / ${sc.calls.max}`, 'tris avg/max (k)': `${Math.round(sc.triangles.avg / 1000)} / ${Math.round(sc.triangles.max / 1000)}` })));
  });
}

for (const tier of TIERS) {
  test(`gpu: turn sweep, ${tier}`, async ({ page }) => {
    test.skip(BENCH, 'TURN_BENCH=1 runs the frame-cost pass only');
    await page.goto(`./?notitle&nosave&fresh&manual&idle&q=${tier}&x=524&z=-770`);
    await page.waitForFunction(() => !!window.kq?.walk, null, { timeout: 180_000 });
    await page.addStyleTag({ content: '.kq-bullet-time { display: none !important; }' });
    const gpu = await page.evaluate(() => {
      const gl = window.kq!.ctx.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    });
    expect(await page.evaluate(() => window.kq!.ctx.params.get('q'))).toBe(tier);
    if (!UNSEEN_CASTERS) await page.evaluate(() => (window.kq!.ctx.world.forest.casting = () => false));
    const out: Record<string, unknown> = { label: LABEL, tier, gpu, stepDeg: STEP_DEG, unseenCasters: UNSEEN_CASTERS, spots: {} };
    const table: Record<string, unknown>[] = [];
    for (const spot of SPOTS) {
      if (ONLY && !ONLY.includes(spot.id)) continue;
      const r = await sweep(page, spot);
      const j = { cw: jumps(r.cw, 'all'), ccw: jumps(r.ccw, 'all'), still: jumps(r.still, 'all') };
      const lag = { cwCcw: apart(r.cw, r.ccw, 'all'), cwStill: apart(r.cw, r.still, 'all'), ground: apart(r.cw, r.ccw, 'ground'), mid: apart(r.cw, r.ccw, 'mid'), sky: apart(r.cw, r.ccw, 'sky') };
      const canopy = r.still.map((x) => x.canopy);
      const frames = [...r.cw, ...r.ccw];
      const mean = (f: (x: Row) => number) => frames.reduce((a, x) => a + f(x), 0) / frames.length;
      const cost = { tris: mean((x) => x.tris), trisMax: Math.max(...frames.map((x) => x.tris)), calls: mean((x) => x.calls), shadowTris: mean((x) => x.shadowTris), shadowTrisMax: Math.max(...frames.map((x) => x.shadowTris)) };
      (out.spots as Record<string, unknown>)[spot.id] = { spot, jumps: j, lag, cost, rows: { cw: r.cw, ccw: r.ccw, still: r.still } };
      table.push({
        spot: spot.id,
        'still jump': j.still.max.toFixed(2),
        at: j.still.at,
        'turn jump': Math.max(j.cw.max, j.ccw.max).toFixed(2),
        median: j.cw.median.toFixed(2),
        'cw-ccw': lag.cwCcw.max.toFixed(2),
        'at ': lag.cwCcw.at,
        'cw-still': lag.cwStill.max.toFixed(2),
        canopy: `${Math.min(...canopy).toFixed(2)}..${Math.max(...canopy).toFixed(2)}`,
        'tris avg/max (k)': `${Math.round(cost.tris / 1000)} / ${Math.round(cost.trisMax / 1000)}`,
        'shadow avg/max (k)': `${Math.round(cost.shadowTris / 1000)} / ${Math.round(cost.shadowTrisMax / 1000)}`,
      });
      for (const shot of r.shots) writeFileSync(`${OUT}/turn-luma-${LABEL}-${tier}-${spot.id}-${shot.pass}-${shot.yaw}.jpg`, Buffer.from(shot.url.split(',')[1]!, 'base64'));
    }
    writeFileSync(`${OUT}/turn-luma-${LABEL}-${tier}.json`, JSON.stringify(out));
    console.log(`\nturn sweep ${LABEL} / ${tier} (${gpu}), luminance 0..255`);
    console.table(table);
  });
}
