import type { GameContext } from '../core/context';
import { type Era, isEra } from '../core/era';
import type { GameState } from '../core/state';
import type { ScanMode } from '../world/world';
import { DebugPanel } from './panel';

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
}

declare global {
  interface Window {
    kq?: KqHooks;
  }
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function installDebug(ctx: GameContext, info: { frames: () => number }): KqHooks {
  const hooks: KqHooks = {
    ctx,
    teleport(x, z, yawDeg, pitchDeg) {
      ctx.player.teleport(x, z, yawDeg === undefined ? undefined : (-yawDeg * Math.PI) / 180);
      if (pitchDeg !== undefined) ctx.player.pitch = (pitchDeg * Math.PI) / 180;
      ctx.world.forest.invalidate();
    },
    setEra(e) {
      if (!isEra(e)) throw new Error(`unknown era '${e}'`);
      ctx.era.set(e);
    },
    setScanMode(n) {
      ctx.world.setScanMode(Math.max(0, Math.min(3, Math.round(n))) as ScanMode, true);
      ctx.events.emit('scan:mode', { mode: n });
    },
    setMapMix(v) {
      ctx.world.setMapMix(v, true);
    },
    step(n = 1) {
      ctx.loop.step(n);
    },
    state() {
      return structuredClone(ctx.state.state) as GameState;
    },
    async screenshotReady() {
      const f0 = info.frames();
      // three frames: instance buffers and textures uploaded, LODs settled for the current view
      while (info.frames() < f0 + 3) await nextFrame();
    },
    press(code, steps = 1) {
      ctx.input.simulate(code, true);
      ctx.loop.step(steps);
      ctx.input.simulate(code, false);
    },
  };
  window.kq = hooks;
  if (ctx.debug) new DebugPanel(ctx, info.frames);
  return hooks;
}
