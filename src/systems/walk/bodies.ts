/**
 * Bodies for the walk system: the people API (kq-characters, `ctx.people`) is required. There is
 * no fallback figure: when `ctx.people` is missing (people system failed / not registered) the walk
 * spawns no bodies at all, logs one loud error, and the walk logic, its events and the save slice
 * keep running bodiless so story beats never hang.
 */
import type { PeopleApi, PersonSpawnOpts } from '../people/types';
import type { Body, BodyClip, BodyFactory, BodySpawn } from './runtime';

// ---- the people API (kq-characters, src/systems/people/types.ts) -----------------------------

export type PeopleApiLike = Pick<PeopleApi, 'spawn' | 'specs'>;

/** `ctx.people` when the people system runs (undefined when it failed or is not registered). */
export function peopleOf(ctx: { people?: PeopleApi | undefined }): PeopleApiLike | null {
  const p = ctx.people;
  return p && typeof p.spawn === 'function' ? p : null;
}

export function peopleSpecs(api: PeopleApiLike): string[] | null {
  try {
    return [...api.specs()];
  } catch {
    return null;
  }
}

/**
 * A Body over a people-API person. The people system animates (locomotion from `setSpeed`) and
 * does its own distance LOD; we move `root` and turn with `face` (never root.rotation, never
 * lookAt: they would fight the person's own smooth turn). `play('walk' | 'run' | 'idle')` is left
 * out on purpose: locomotion follows the speed, and the npc system plays talk / idle in a
 * conversation.
 */
export function personBody(api: PeopleApiLike, o: BodySpawn): Body {
  const opts: PersonSpawnOpts = { x: o.x, z: o.z, y: o.y, yaw: o.yaw, look: 'solid', tier: o.tier, seed: o.seed, name: o.npc };
  if (o.speaker) opts.speaker = o.speaker;
  const p = api.spawn(o.spec, opts);
  let speed = -1;
  let yaw = Number.NaN;
  let snapped = false;
  return {
    setPos: (x, y, z) => p.root.position.set(x, y, z),
    face: (v, snap = false) => {
      if (Math.abs(v - yaw) < 1e-3 && snap === snapped) return;
      yaw = v;
      snapped = snap;
      p.face(v, snap);
    },
    setSpeed: (v) => {
      if (Math.abs(v - speed) < 0.02) return;
      speed = v;
      p.setSpeed(v);
    },
    play: (_clip: BodyClip) => {},
    setVisible: (on) => p.setVisible(on),
    dispose: () => p.dispose(),
  };
}

export const PEOPLE_MISSING = '[walk] people API missing: walk bodies disabled';

/**
 * The walk system's BodyFactory: a people-API person per npc, or no body (null) when the people
 * API is missing. The miss is reported once (default `console.error`): checked right away, so it
 * shows at init, and again on every spawn in case the API goes away later.
 */
export function walkBodies(people: () => PeopleApiLike | null, report: (msg: string) => void = (m) => console.error(m)): BodyFactory {
  let reported = false;
  const api = (): PeopleApiLike | null => {
    const p = people();
    if (!p && !reported) {
      reported = true;
      report(PEOPLE_MISSING);
    }
    return p;
  };
  api();
  return (o) => {
    const p = api();
    return p ? personBody(p, o) : null;
  };
}
