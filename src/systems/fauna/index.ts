/**
 * Feature "fauna": the fauna contract v0 (./types.ts): animal bodies (the roe doe and her fawn,
 * Jost's dogs Diane and Bijou) spawned by other systems through a mesh-independent handle API,
 * drawn today by rigged CC0 stand-ins (./standin.ts). The people system's sibling.
 *
 * Who does what: this system owns the BODIES (meshes, clips, poses, LOD). What the animals DO
 * (flee and sneak, following Jost, alert events, save / restore, `kq.animals`) is the behaviour
 * layer's (src/systems/animals/, kq-systems), which drives the bodies like the walk system drives
 * people. Nothing spawns an animal by default.
 *
 * How a system gets it: `ctx.fauna` (declared below by declaration merging, set in `init`). Declare
 * `after: ['fauna']` and import only the types (`import type { Animal } from '../fauna/types'`).
 * Every frame: the distance LOD (from the camera) and each animal's tick (registry.ts). Animals are
 * not saved: the behaviour layer spawns them again from its own slice after a load.
 * Debug/test API: window.kq.fauna (see FaunaHooks).
 */
import type { LoadedModel } from '../../assets/loader';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import { type FaunaStats, FaunaRegistry } from './registry';
import { type AnimalState, type StandInLoader, StandInAnimal } from './standin';
import type { AnimalClip, AnimalSpawnOpts, FaunaApi } from './types';

declare module '../../core/context' {
  interface GameContext {
    /** Fauna contract v0 (src/systems/fauna/types.ts); set by the fauna system's init. */
    fauna?: FaunaApi;
  }
}

export interface FaunaHooks {
  /** Spawn an animal; `yawDeg` in the debug hooks' degrees (0 = north, 90 = east), or `yaw` in radians (player convention). Returns the id. */
  spawn(specId: string, x: number, z: number, opts?: Omit<AnimalSpawnOpts, 'x' | 'z'> & { yawDeg?: number }): string;
  list(): AnimalState[];
  get(id: string): AnimalState | null;
  clear(): void;
  /** Count, drawn count, approximate triangles and draw calls, LOD bands. */
  stats(): FaunaStats;
  specs(): readonly string[];
  /** Debug driving: move an animal straight ahead along its facing at `mps` on the ground (0 stops, and idles). */
  drive(id: string, mps: number): boolean;
  /** Debug: play a clip on an animal. */
  play(id: string, clip: AnimalClip, o?: { loop?: boolean; fade?: number; speed?: number }): boolean;
  /** Debug: the eye glint (0..1). */
  shine(id: string, k: number): boolean;
}

declare module '../../debug/hooks' {
  interface KqHooks {
    fauna?: FaunaHooks;
  }
}

let reg: FaunaRegistry<StandInAnimal> | null = null;
let ctxRef: GameContext | null = null;
let hooked = false;
const drives = new Map<string, number>();

function installHooks(ctx: GameContext, r: FaunaRegistry<StandInAnimal>): void {
  const kq = window.kq;
  if (!kq) return;
  hooked = true;
  kq.fauna = {
    spawn(specId, x, z, opts = {}) {
      const { yawDeg, ...o } = opts;
      const yaw = yawDeg !== undefined ? (-yawDeg * Math.PI) / 180 : o.yaw;
      const a = r.spawn(specId, { ...o, x, z, yaw });
      ctx.loop.requestRender(2);
      return a.id;
    },
    list: () => r.list().map((a) => a.state()),
    get: (id) => r.get(id)?.state() ?? null,
    clear() {
      r.clear();
      drives.clear();
      ctx.loop.requestRender(2);
    },
    stats: () => r.stats(),
    specs: () => r.specs(),
    drive(id, mps) {
      const a = r.get(id);
      if (!a) return false;
      if (mps > 0) drives.set(id, mps);
      else drives.delete(id);
      a.setSpeed(Math.max(0, mps));
      return true;
    },
    play(id, clip, o) {
      const a = r.get(id);
      if (!a) return false;
      a.play(clip, o);
      ctx.loop.requestRender(2);
      return true;
    },
    shine(id, k) {
      const a = r.get(id);
      if (!a) return false;
      a.setEyeShine(k);
      ctx.loop.requestRender(2);
      return true;
    },
  };
}

export default defineSystem({
  id: 'fauna',
  init(ctx) {
    ctxRef = ctx;
    const loader: StandInLoader = {
      model: (id) => ctx.assets.model(id),
      peek: (id) => ctx.assets.peek<LoadedModel>(id),
    };
    reg = new FaunaRegistry<StandInAnimal>(
      ({ id, specId, spec, opts, onDispose }) => {
        const a = new StandInAnimal(id, specId, spec, opts, loader, (q) => {
          drives.delete(q.id);
          onDispose(q);
        });
        ctx.scene.add(a.root);
        return a;
      },
      (x, z) => ctx.world.heightAt(x, z),
    );
    ctx.fauna = reg;
  },
  frame(dt, ctx) {
    const r = reg;
    if (!r) return;
    if (!hooked) installHooks(ctx, r);
    // debug driving (kq.fauna.drive): straight ahead along the facing, feet on the ground
    for (const [id, mps] of drives) {
      const a = r.get(id);
      if (!a) {
        drives.delete(id);
        continue;
      }
      const o = a.root;
      const yaw = o.rotation.y;
      o.position.x -= Math.sin(yaw) * mps * dt;
      o.position.z -= Math.cos(yaw) * mps * dt;
      o.position.y = ctx.world.heightAt(o.position.x, o.position.z);
    }
    r.tick(dt, ctx.camera.position, { reducedMotion: ctx.settings.state.reducedMotion });
  },
  dispose() {
    reg?.clear();
    reg = null;
    drives.clear();
    if (ctxRef?.fauna) ctxRef.fauna = undefined;
    if (hooked && window.kq) delete window.kq.fauna;
    hooked = false;
    ctxRef = null;
  },
});
