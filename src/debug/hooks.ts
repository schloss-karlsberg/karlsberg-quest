import type { GameContext } from '../core/context';
import { type Era, isEra } from '../core/era';
import type { GameState } from '../core/state';
import type { Object3D, PerspectiveCamera } from 'three';
import type { PerfMonitor, PerfSummary } from '../render/perf';
import type { QualityManager } from '../render/quality';
import type { ScanMode } from '../world/world';
import { type BenchOptions, type BenchResult, runBench } from './bench';
import { DebugPanel } from './panel';
import { PerfHud } from './perfHud';
import { type NanWatchApi, installNanWatch, nanWatchDefaultOn } from './nanWatch';
import { type PilotApi, installPilot } from './pilot';

/** Test/debug API on `window.kq` (always installed; the stats panel only with ?debug). */
export interface KqHooks {
  ctx: GameContext;
  /** Teleport to local x/z (yaw in degrees, 0 = north, 90 = east). */
  teleport(x: number, z: number, yawDeg?: number, pitchDeg?: number): void;
  setEra(e: Era): void;
  setScanMode(n: number): void;
  setMapMix(v: number): void;
  /** Advance n fixed steps deterministically and render once. */
  step(n?: number): void;
  /** Deep copy of the game state. */
  state(): GameState;
  /** Resolves when everything is loaded and at least two frames with the current view were drawn. */
  screenshotReady(): Promise<void>;
  /** Simulate a key press (code like 'KeyW') for n steps. */
  press(code: string, steps?: number): void;
  /** Frame statistics of the last ≈ 240 frames (fps, frame / CPU ms, draw calls, triangles, memory). */
  perf(): PerfSummary;
  /** Scripted benchmark route over all eras (see src/debug/bench.ts); also Shift+F3. */
  bench(opts?: BenchOptions): Promise<BenchResult>;
  /** Result of the last bench run. */
  lastBench: BenchResult | null;
  /** Place a manifest asset in the world (dev / art review): ground height at x/z, yaw degrees. */
  spawnAsset(id: string, x: number, z: number, opts?: { yaw?: number; scale?: number }): Promise<string>;
  /** Show / hide the performance overlay (F3). */
  perfHud(on?: boolean): boolean;
  /** Switch the polish round's render optimisations off (bench "before" numbers). */
  baseline(): void;
  /** Bullet-time play: act / observe / choose (src/debug/pilot.ts, docs/ARCHITECTURE.md). */
  pilot: PilotApi;
  /** Exploded-geometry watchdog (src/debug/nanWatch.ts): on with ?debug / WebDriver, else off and free. */
  nanWatch: NanWatchApi;
}

/** Further baseline switches registered by optimised modules (see `baseline()`). */
export const baselineHooks: ((ctx: GameContext) => void)[] = [];

declare global {
  interface Window {
    kq?: KqHooks;
  }
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export interface DebugInfo {
  frames: () => number;
  perf: PerfMonitor;
  quality: QualityManager;
  /** Install / clear a per-frame camera override (bench). */
  setCamera: (fn: ((cam: PerspectiveCamera) => void) | null) => void;
  /** Wait for the palace and architecture surface loads that are already scheduled. */
  ready: () => Promise<unknown>;
}

/** The watchdog with the player-tied roots (avatar, combat viewmodel; looked up by name, cached). */
function nanWatchFor(ctx: GameContext, info: DebugInfo): NanWatchApi {
  const names = ['player-avatar', 'combat-viewmodel'];
  const roots: (Object3D | null)[] = names.map(() => null);
  let lookups = 0;
  return installNanWatch({
    scene: ctx.scene,
    camera: ctx.camera,
    roots: () => {
      // a missing / detached root is looked up again every 10th scan (getObjectByName walks the scene)
      if (lookups++ % 10 === 0) for (let i = 0; i < names.length; i++) if (!roots[i]?.parent) roots[i] = ctx.scene.getObjectByName(names[i]!) ?? null;
      return roots;
    },
    era: () => ctx.era.current,
    player: () => ctx.player.position,
    frame: info.frames,
    on: nanWatchDefaultOn(ctx.debug),
  });
}

export function installDebug(ctx: GameContext, info: DebugInfo): KqHooks {
  const hud = new PerfHud(ctx, info.perf, info.quality);
  let benchRunning = false;
  const hooks: KqHooks = {
    ctx,
    teleport(x, z, yawDeg, pitchDeg) {
      ctx.player.teleport(x, z, yawDeg === undefined ? undefined : (-yawDeg * Math.PI) / 180);
      if (pitchDeg !== undefined) ctx.player.pitch = (pitchDeg * Math.PI) / 180;
      ctx.world.forest.invalidate();
      // a held view (bullet time, menus) shows the new spot
      ctx.loop.requestRender();
    },
    setEra(e) {
      if (!isEra(e)) throw new Error(`unknown era '${e}'`);
      ctx.era.set(e);
      ctx.loop.requestRender();
    },
    setScanMode(n) {
      ctx.world.setScanMode(Math.max(0, Math.min(3, Math.round(n))) as ScanMode, true);
      ctx.events.emit('scan:mode', { mode: n });
      ctx.loop.requestRender();
    },
    setMapMix(v) {
      ctx.world.setMapMix(v, true);
      ctx.loop.requestRender();
    },
    step(n = 1) {
      ctx.loop.step(n);
    },
    state() {
      return structuredClone(ctx.state.state) as GameState;
    },
    async screenshotReady() {
      await info.ready().catch(() => {});
      const f0 = info.frames();
      // three frames: instance buffers and textures uploaded, LODs settled for the current view
      // (asked for explicitly: bullet time and held menus draw only on request)
      while (info.frames() < f0 + 3) {
        ctx.loop.requestRender();
        await nextFrame();
      }
    },
    press(code, steps = 1) {
      ctx.input.simulate(code, true);
      ctx.loop.step(steps);
      ctx.input.simulate(code, false);
    },
    perf() {
      return info.perf.summary();
    },
    async bench(opts) {
      if (benchRunning) throw new Error('bench already running');
      benchRunning = true;
      if (hud.visible) hud.showBench(null, true);
      try {
        const r = await runBench(hooks as never, info.perf, info.setCamera, opts);
        hooks.lastBench = r;
        if (hud.visible) hud.showBench(r);
        return r;
      } finally {
        benchRunning = false;
      }
    },
    lastBench: null,
    async spawnAsset(id, x, z, opts = {}) {
      const o = await ctx.assets.instance(id);
      o.position.set(x, ctx.world.heightAt(x, z), z);
      o.rotation.y = ((opts.yaw ?? 0) * Math.PI) / 180;
      o.scale.setScalar(opts.scale ?? 1);
      ctx.scene.add(o);
      ctx.loop.requestRender();
      return o.uuid;
    },
    perfHud(on) {
      hud.show(on ?? !hud.visible);
      ctx.loop.requestRender();
      return hud.visible;
    },
    baseline() {
      // switch this round's render optimisations off (before/after numbers in docs/PERFORMANCE.md)
      ctx.world.forest.cull = false;
      ctx.world.forest.invalidate();
      for (const fn of baselineHooks) fn(ctx);
    },
    pilot: installPilot(ctx),
    nanWatch: nanWatchFor(ctx, info),
  };
  window.kq = hooks;
  if (ctx.debug) new DebugPanel(ctx, info.frames);
  // F3: performance overlay, Shift+F3: run the bench (also settings → Leistungsanzeige, ?perf)
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'F3') return;
    e.preventDefault();
    if (e.shiftKey) {
      hud.show(true);
      void hooks.bench({ frames: 120 }).catch((err) => console.warn('[bench]', err));
    } else hud.show(!hud.visible);
  });
  hud.show(ctx.params.has('perf') || ctx.settings.state.perfHud);
  ctx.events.on('settings:change', ({ key }) => key === 'perfHud' && hud.show(ctx.settings.state.perfHud));
  return hooks;
}
