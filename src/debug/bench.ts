import type { PerspectiveCamera } from 'three';
import type { GameContext } from '../core/context';
import type { Era } from '../core/era';
import { PERF_BUDGET, type PerfMonitor, frameStats } from '../render/perf';

/**
 * Scripted benchmark route (`kq.bench()`): flies over the palace in each era, walks the Ehrenhof,
 * stands in the burning Festsaal, meets the pack in the 1789 night with the lantern lit, and runs
 * the VAT relief scan. Records per scene the wall frame time, the CPU time of the render callback,
 * draw calls and triangles (all passes), and the renderer's geometry / texture / program counts.
 *
 * Features are reached duck-typed through `window.kq` (hunt, fx, interiors, lantern) so this file
 * imports no system. Works with or without `?manual` (render frames advance either way).
 */

export interface BenchScene {
  id: string;
  label: string;
  era: Era;
  /** Prepare the scene (teleport, threats). */
  setup(k: BenchKq): void;
  /** Camera for frame i of n (absolute pose); null = the player's own camera with `yaw` sweep. */
  camera?(cam: PerspectiveCamera, i: number, n: number, k: BenchKq): void;
  /** Player yaw sweep in degrees (ground scenes): [from, to]. */
  sweep?: [number, number];
  teardown?(k: BenchKq): void;
}

export interface BenchSceneResult {
  id: string;
  label: string;
  frames: number;
  frameMs: ReturnType<typeof frameStats>;
  cpuMs: ReturnType<typeof frameStats>;
  gpuMs: number | null;
  calls: { avg: number; max: number };
  triangles: { avg: number; max: number };
  geometries: number;
  textures: number;
  programs: number;
  /** Draw calls and triangles within PERF_BUDGET. */
  withinBudget: boolean;
}

export interface BenchResult {
  when: string;
  userAgent: string;
  renderer: string;
  pixelRatio: number;
  size: [number, number];
  quality: string;
  scenes: BenchSceneResult[];
  budget: typeof PERF_BUDGET;
}

export interface BenchOptions {
  /** Frames recorded per scene (default 150). */
  frames?: number;
  /** Frames rendered before recording (shader compile, uploads; default 20). */
  warmup?: number;
  /** Minimum wall-clock warmup per scene, in seconds (default 0). */
  warmupSeconds?: number;
  /** Only these scene ids. */
  only?: string[];
  /** Log a table to the console (default true). */
  log?: boolean;
}

/** The subset of `window.kq` the bench uses (duck-typed feature hooks). */
interface BenchKq {
  ctx: GameContext;
  teleport(x: number, z: number, yawDeg?: number, pitchDeg?: number): void;
  setEra(e: Era): void;
  setScanMode(n: number): void;
  step(n?: number): void;
  hunt?: { start(o?: Record<string, unknown>): unknown; stop(): void; freeze(on: boolean): void; placeInView(i: number, d: number, ang: number, look?: boolean): void };
  lantern?: { toggle(on?: boolean): boolean };
  fx?: { fire(on: boolean, opts?: Record<string, unknown>): void; fireTime(t: number): void };
  interiors?: {
    enter(roomId: string, opts?: Record<string, unknown>): boolean;
    fire(roomId: string, state: string): void;
    list(): { id: string; roomId: string; building: string; storey: number }[];
  };
}

/** Palace centre (Corps de logis) in the local frame. */
const PALACE = { x: 1195, z: -1095 };

function orbit(radius: number, height: number, turns = 0.35) {
  return (cam: PerspectiveCamera, i: number, n: number, k: BenchKq) => {
    const a = -0.6 + (i / Math.max(1, n - 1)) * Math.PI * 2 * turns;
    const x = PALACE.x + Math.cos(a) * radius;
    const z = PALACE.z + Math.sin(a) * radius;
    const ground = k.ctx.world.heightfield.heightAt(x, z);
    cam.position.set(x, ground + height, z);
    cam.lookAt(PALACE.x, k.ctx.world.heightfield.heightAt(PALACE.x, PALACE.z) + 8, PALACE.z);
  };
}

export const BENCH_SCENES: BenchScene[] = [
  { id: 'today-fly', label: 'Heute, Flug über die Ruine', era: 'today', setup: (k) => k.teleport(PALACE.x - 250, PALACE.z, 90), camera: orbit(260, 120) },
  { id: 'today-forest', label: 'Heute, im Wald am Corps de logis', era: 'today', setup: (k) => k.teleport(1240, -1060, 250, -4), sweep: [180, 340] },
  { id: '1789-fly', label: '1789, Flug über das Schloss', era: '1789', setup: (k) => k.teleport(PALACE.x - 250, PALACE.z, 90), camera: orbit(240, 90) },
  { id: '1789-ehrenhof', label: '1789, Allee und Ehrenhof', era: '1789', setup: (k) => k.teleport(1138, -1120, 90, 2), sweep: [40, 140] },
  {
    id: '1789-night-pack',
    label: '1793-02, Nacht, Meute + Laterne',
    era: '1793-02',
    setup: (k) => {
      k.teleport(1138, -1120, 90, 1);
      k.hunt?.start({ x: 1138, z: -1120, radius: 140, intensity: 0.6, hounds: 6, pikeur: true, seed: 3 });
      k.hunt?.freeze(true);
      const spots: [number, number][] = [
        [8, -20],
        [11, 18],
        [14, -35],
        [17, 30],
        [21, 4],
        [26, -12],
      ];
      spots.forEach(([d, ang], i) => k.hunt?.placeInView(i, d, ang));
      k.lantern?.toggle(true);
      k.step(2);
    },
    sweep: [60, 120],
    teardown: (k) => {
      k.hunt?.freeze(false);
      k.hunt?.stop();
      k.lantern?.toggle(false);
    },
  },
  {
    id: '1793-07-festsaal-fire',
    label: '1793-07, brennender Festsaal (innen)',
    era: '1793-07',
    setup: (k) => {
      k.step(1);
      k.interiors?.enter('B01.2.og-festsaal', { u: 0.1, v: 0.5, toU: 1, toV: 0.5, pitch: 6 });
      k.fx?.fire(true, { seconds: 300 });
      k.fx?.fireTime(120);
      k.interiors?.fire('B01.2.og-festsaal', 'burning');
      for (const r of k.interiors?.list().filter((x) => x.building === 'KB-B01' && x.storey === 2 && x.roomId !== 'B01.2.og-festsaal') ?? []) k.interiors?.fire(r.id, 'smoke');
      k.step(3);
    },
    sweep: [60, 130],
  },
  {
    id: '1793-07-fire-outside',
    label: '1793-07, Brand von außen',
    era: '1793-07',
    setup: (k) => {
      k.teleport(1125, -1120, 90, 3);
      k.step(3);
    },
    sweep: [50, 130],
    teardown: (k) => {
      k.fx?.fire(false);
      k.ctx.events.emit('threat:configure', { kind: 'fire', active: false } as never);
    },
  },
  { id: '1796-ruin', label: '1796, Ruine', era: '1796', setup: (k) => k.teleport(1138, -1120, 90, 0), sweep: [40, 140] },
  {
    id: 'scan3-fly',
    label: 'Heute, VAT-Relief überall',
    era: 'today',
    setup: (k) => {
      k.setScanMode(3);
      k.ctx.world.setScanArea(PALACE.x, PALACE.z, 1e6);
    },
    camera: orbit(300, 160),
    teardown: (k) => k.setScanMode(0),
  },
];

/** Additional palace views are opt-in to keep the regular nine-scene route stable. */
const PALACE_SCENES: BenchScene[] = [
  {
    id: '1789-festsaal',
    label: '1789, Festsaal (innen)',
    era: '1789',
    setup: (k) => {
      k.step(1);
      k.interiors?.enter('B01.2.og-festsaal', { u: 0.1, v: 0.5, toU: 1, toV: 0.5, pitch: 6 });
      k.step(3);
    },
    sweep: [60, 130],
  },
  { id: '1789-palace-front', label: '1789, Schlossfront', era: '1789', setup: (k) => k.teleport(1184, -1126, 90, -6) },
  { id: '1789-palace-plateau', label: '1789, Schlossplateau', era: '1789', setup: (k) => k.teleport(1216, -1114, 180, -6) },
];

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Run the route. `setCamera` installs a per-frame camera override in boot's render callback. */
export async function runBench(
  k: BenchKq,
  perf: PerfMonitor,
  setCamera: (fn: ((cam: PerspectiveCamera) => void) | null) => void,
  opts: BenchOptions = {},
): Promise<BenchResult> {
  const ctx = k.ctx;
  const frames = Math.max(2, opts.frames ?? 150);
  const warmup = Math.max(1, opts.warmup ?? 20);
  const { only } = opts;
  const scenes = only ? [...BENCH_SCENES, ...PALACE_SCENES].filter((s) => only.includes(s.id)) : BENCH_SCENES;
  const saved = { era: ctx.era.current, x: ctx.player.position.x, z: ctx.player.position.z, yaw: ctx.player.yaw, pitch: ctx.player.pitch, flying: ctx.player.flying };
  const gpuWas = perf.gpuEnabled;
  perf.enableGpuTimer(true);
  const results: BenchSceneResult[] = [];
  const gl = ctx.renderer.getContext();
  let rendererName = 'unknown';
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    rendererName = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  } catch {
    /* blocked */
  }
  try {
    for (const sc of scenes) {
      ctx.player.setFlying(false);
      if (ctx.era.current !== sc.era) k.setEra(sc.era);
      sc.setup(k);
      let i = 0;
      const total = warmup + frames;
      setCamera((cam) => {
        const j = Math.max(0, i - warmup);
        if (sc.camera) sc.camera(cam, j, frames, k);
        else if (sc.sweep) {
          const [a, b] = sc.sweep;
          const yaw = (-(a + ((b - a) * j) / Math.max(1, frames - 1)) * Math.PI) / 180;
          ctx.player.yaw = yaw;
          cam.rotation.set(ctx.player.pitch, yaw, 0, 'YXZ');
        }
      });
      ctx.world.forest.invalidate();
      const fm: number[] = [];
      const cm: number[] = [];
      let calls = 0;
      let callsMax = 0;
      let tris = 0;
      let trisMax = 0;
      // every animation frame drawn, whatever the cap or idle pacing (the bench measures throughput)
      const warmUntil = performance.now() + (opts.warmupSeconds ?? 0) * 1000;
      while (i < warmup || performance.now() < warmUntil) {
        ctx.loop.requestRender();
        await nextFrame();
        if (i < warmup) i++;
      }
      perf.resetClock();
      perf.onFrame = (f, c, dc, tr) => {
        fm.push(f);
        cm.push(c);
        calls += dc;
        tris += tr;
        callsMax = Math.max(callsMax, dc);
        trisMax = Math.max(trisMax, tr);
      };
      while (i < total) {
        ctx.loop.requestRender();
        await nextFrame();
        i++;
      }
      perf.onFrame = null;
      // the first recorded frame may carry the warm-up gap: drop it from the wall-time series
      fm.shift();
      const n = cm.length;
      const mem = ctx.renderer.info.memory;
      const r: BenchSceneResult = {
        id: sc.id,
        label: sc.label,
        frames: n,
        frameMs: frameStats(fm),
        cpuMs: frameStats(cm),
        gpuMs: perf.gpuMs,
        calls: { avg: Math.round(calls / n), max: callsMax },
        triangles: { avg: Math.round(tris / n), max: trisMax },
        geometries: mem.geometries,
        textures: mem.textures,
        programs: ctx.renderer.info.programs?.length ?? 0,
        withinBudget: callsMax <= PERF_BUDGET.calls && trisMax <= PERF_BUDGET.triangles,
      };
      results.push(r);
      sc.teardown?.(k);
      setCamera(null);
    }
  } finally {
    perf.onFrame = null;
    setCamera(null);
    perf.enableGpuTimer(gpuWas);
    if (ctx.era.current !== saved.era) k.setEra(saved.era);
    ctx.player.setFlying(saved.flying);
    ctx.player.teleport(saved.x, saved.z, saved.yaw);
    ctx.player.pitch = saved.pitch;
  }
  const res: BenchResult = {
    when: new Date().toISOString(),
    userAgent: navigator.userAgent,
    renderer: rendererName,
    pixelRatio: ctx.renderer.getPixelRatio(),
    size: [ctx.renderer.domElement.width, ctx.renderer.domElement.height],
    quality: String(ctx.settings.state.graphics ?? 'high'),
    scenes: results,
    budget: PERF_BUDGET,
  };
  if (opts.log !== false) {
    console.table(
      results.map((r) => ({
        scene: r.id,
        'fps(avg)': +(1000 / Math.max(0.01, r.frameMs.avg)).toFixed(1),
        'frame p95 ms': +r.frameMs.p95.toFixed(1),
        'cpu avg ms': +r.cpuMs.avg.toFixed(2),
        'gpu ms': r.gpuMs === null ? '-' : +r.gpuMs.toFixed(2),
        calls: r.calls.max,
        'tris k': Math.round(r.triangles.max / 1000),
        geo: r.geometries,
        tex: r.textures,
        prog: r.programs,
      })),
    );
  }
  return res;
}
