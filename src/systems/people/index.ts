/**
 * Feature "people": the people contract v0 (./types.ts) — modern NPCs (the guide, tour members,
 * the doubles, the child, the historical twins) spawned by other systems through a
 * mesh-independent handle API, drawn by rigged CC0 stand-ins (./standin.ts) or, for a spec with an
 * authored body (today the guide), its MPFB build with the one shared people material (./authored.ts).
 * Authored bodies are off by default for now (`PEOPLE_AUTHORED_DEFAULT`, ./specs.ts: opt-in until the
 * guide's look passes review); `?people=authored` / `?people=standin` force one or the other for the
 * session.
 *
 * How a system gets it: `ctx.people` (declared below by declaration merging, set in `init`).
 * Declare `after: ['people']` and import only the types (`import type { Person } from
 * '../people/types'`). A spawn API returns a handle, which the events-and-state rule cannot carry
 * (events are fire-and-forget, payloads plain), so people is a service on the context like
 * `ctx.assets`; what the people DO in the story still travels through events and state.
 * Talking to a person (v0.1): spawn it with `speaker`; the npc system binds that speaker's story
 * placement to it (npc/bind.ts).
 *
 * Every frame: the distance LOD (from the camera) and each person's tick (registry.ts). People
 * are not saved: whoever spawned them spawns them again after a load.
 * Debug/test API: window.kq.people (see PeopleHooks).
 */
import type { LoadedModel } from '../../assets/loader';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import { type PeopleStats, PeopleRegistry } from './registry';
import { authoredBodiesOn } from './specs';
import { type PersonState, type StandInLoader, StandInPerson, kitFor } from './standin';
import type { PeopleApi, PersonSpawnOpts } from './types';

declare module '../../core/context' {
  interface GameContext {
    /** People contract v0 (src/systems/people/types.ts); set by the people system's init. */
    people?: PeopleApi;
  }
}

export interface PeopleHooks {
  /** Spawn a person; `yawDeg` in the debug hooks' degrees (0 = north, 90 = east), or `yaw` in radians (player convention). Returns the id. */
  spawn(specId: string, x: number, z: number, opts?: Omit<PersonSpawnOpts, 'x' | 'z'> & { yawDeg?: number }): string;
  list(): PersonState[];
  get(id: string): PersonState | null;
  clear(): void;
  /** Count, drawn count, approximate triangles and draw calls, LOD bands. */
  stats(): PeopleStats;
  specs(): readonly string[];
  /** Debug driving: walk a person straight ahead along its facing at `mps` on the ground (0 stops, and idles). */
  drive(id: string, mps: number): boolean;
}

declare module '../../debug/hooks' {
  interface KqHooks {
    people?: PeopleHooks;
  }
}

let reg: PeopleRegistry<StandInPerson> | null = null;
let ctxRef: GameContext | null = null;
let hooked = false;
const drives = new Map<string, number>();

function installHooks(ctx: GameContext, r: PeopleRegistry<StandInPerson>): void {
  const kq = window.kq;
  if (!kq) return;
  hooked = true;
  kq.people = {
    spawn(specId, x, z, opts = {}) {
      const { yawDeg, ...o } = opts;
      const yaw = yawDeg !== undefined ? (-yawDeg * Math.PI) / 180 : o.yaw;
      const p = r.spawn(specId, { ...o, x, z, yaw });
      ctx.loop.requestRender(2);
      return p.id;
    },
    list: () => r.list().map((p) => p.state()),
    get: (id) => r.get(id)?.state() ?? null,
    clear() {
      r.clear();
      drives.clear();
      ctx.loop.requestRender(2);
    },
    stats: () => r.stats(),
    specs: () => r.specs(),
    drive(id, mps) {
      const p = r.get(id);
      if (!p) return false;
      if (mps > 0) drives.set(id, mps);
      else drives.delete(id);
      p.setSpeed(Math.max(0, mps));
      return true;
    },
  };
}

export default defineSystem({
  id: 'people',
  init(ctx) {
    ctxRef = ctx;
    const loader: StandInLoader = {
      model: (id) => ctx.assets.model(id),
      peek: (id) => ctx.assets.peek<LoadedModel>(id),
    };
    // authored bodies on / off for the session: ?people=authored|standin, else PEOPLE_AUTHORED_DEFAULT
    const authored = authoredBodiesOn(ctx.params);
    reg = new PeopleRegistry<StandInPerson>(
      ({ id, specId, spec, opts, onDispose }) => {
        const p = new StandInPerson(
          id,
          specId,
          spec,
          opts,
          loader,
          (q) => {
            drives.delete(q.id);
            onDispose(q);
          },
          kitFor(spec, authored),
        );
        ctx.scene.add(p.root);
        return p;
      },
      (x, z) => ctx.world.heightAt(x, z),
    );
    ctx.people = reg;
  },
  frame(dt, ctx) {
    const r = reg;
    if (!r) return;
    if (!hooked) installHooks(ctx, r);
    // debug driving (kq.people.drive): straight ahead along the facing, feet on the ground
    for (const [id, mps] of drives) {
      const p = r.get(id);
      if (!p) {
        drives.delete(id);
        continue;
      }
      const o = p.root;
      const yaw = o.rotation.y;
      o.position.x -= Math.sin(yaw) * mps * dt;
      o.position.z -= Math.cos(yaw) * mps * dt;
      o.position.y = ctx.world.heightAt(o.position.x, o.position.z);
    }
    const s = ctx.settings.state;
    r.tick(dt, ctx.camera.position, { reducedMotion: s.reducedMotion, reducedFlash: s.reducedFlash });
  },
  dispose() {
    reg?.clear();
    reg = null;
    drives.clear();
    if (ctxRef?.people) ctxRef.people = undefined;
    if (hooked && window.kq) delete window.kq.people;
    hooked = false;
    ctxRef = null;
  },
});
