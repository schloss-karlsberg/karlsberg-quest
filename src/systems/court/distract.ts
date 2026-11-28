/**
 * A watcher and a noise (docs/ACTION-RPG.md §7.1, TASK-095): a thrown chestnut lands in earshot,
 * the watcher turns to it, walks over, looks around and goes back to its post. Meanwhile its fan
 * points at the noise, so a player can pass behind it. Pure state machine (no three.js, no DOM);
 * the court system feeds it noises and turns its output into head turns, steps and captions.
 *
 *   post ──noise──▶ turn ──▶ walk ──▶ look ──▶ back ──▶ post (wary for a while)
 *     │ wary, or a watcher that must stay (the gate's inspector)
 *     └──noise──▶ glance (the head turns, the feet stay) ──▶ post
 *   a chestnut that strikes the watcher itself: alert (it faces the thrower), then back / post
 *
 * It is not a free pass: a watcher that just came back only glances at the next noise, one that
 * is busy ignores further noises, and one that has made the player out breaks off (`abort`).
 */

export const DISTRACT = {
  /** Earshot (m) of a noise of loudness 1; a landing chestnut is 0.7. */
  hear: 17,
  /** The head turns to the noise for this long before the feet follow (s). */
  turn: 0.7,
  /** Walking pace (m/s). */
  speed: 1.7,
  /** Never farther from the post than this (m). */
  leash: 8,
  /** It stops this far short of the noise (m). */
  short: 1.5,
  /** A walk shorter than this is not worth it: it looks from where it stands (m). */
  minWalk: 1,
  /** Looking around at the spot (s), the head swinging ± `sweep`° every `swing` s. */
  look: 4,
  sweep: 40,
  swing: 2.6,
  /** Back at the post: for this long a noise only turns its head, for `glance` s. */
  wary: 20,
  glance: 1.8,
  /** Struck by the chestnut: it faces the thrower this long (s), with this much suspicion at once. */
  alert: 3,
  hit: 0.55,
  /** … and falls for nothing for this long. */
  hitWary: 30,
} as const;

export type DistractPhase = 'post' | 'turn' | 'walk' | 'look' | 'back' | 'glance' | 'alert';

export interface Distract {
  phase: DistractPhase;
  /** Seconds in the phase. */
  t: number;
  /** The noise (world metres). */
  nx: number;
  nz: number;
  /** Where it walks to, as an offset from the post (m). */
  gx: number;
  gz: number;
  /** Where it stands now, as an offset from the post (m). */
  ox: number;
  oz: number;
  /** Seconds left in which a noise only earns a glance. */
  wary: number;
}

export function createDistract(): Distract {
  return { phase: 'post', t: 0, nx: 0, nz: 0, gx: 0, gz: 0, ox: 0, oz: 0, wary: 0 };
}

export interface Noise {
  x: number;
  z: number;
  /** 0..1 */
  loud: number;
}

/** Does a watcher standing at x/z hear the noise? */
export function hears(x: number, z: number, n: Noise): boolean {
  return n.loud > 0 && Math.hypot(n.x - x, n.z - z) <= DISTRACT.hear * Math.min(1, n.loud);
}

export interface NoiseOptions {
  /** The watcher never leaves its post (the gate's inspector, a watcher in a Musterung). */
  stay?: boolean;
  /**
   * How far (m) the way from the post is free in the direction ux/uz, up to `want` m (walls,
   * water, a steep bank). Default: all of it.
   */
  free?(ux: number, uz: number, want: number): number;
}

/**
 * A noise in earshot. 'go': it will walk over; 'glance': only the head turns (wary, or it must
 * stay); null: it is busy with an earlier noise, or alerted, and takes no notice.
 */
export function hearNoise(d: Distract, post: { x: number; z: number }, n: Noise, o: NoiseOptions = {}): 'go' | 'glance' | null {
  if (d.phase !== 'post') return null;
  d.t = 0;
  d.nx = n.x;
  d.nz = n.z;
  d.gx = d.gz = 0;
  if (d.wary > 0 || o.stay) {
    d.phase = 'glance';
    return 'glance';
  }
  const dx = n.x - post.x;
  const dz = n.z - post.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 1e-3) {
    const ux = dx / dist;
    const uz = dz / dist;
    let walk = Math.min(DISTRACT.leash, Math.max(0, dist - DISTRACT.short));
    if (o.free) walk = Math.max(0, Math.min(walk, o.free(ux, uz, walk)));
    if (walk >= DISTRACT.minWalk) {
      d.gx = ux * walk;
      d.gz = uz * walk;
    }
  }
  d.phase = 'turn';
  return 'go';
}

/** The chestnut struck the watcher itself: no distraction, it looks for the thrower. */
export function strike(d: Distract): void {
  d.phase = 'alert';
  d.t = 0;
  d.wary = Math.max(d.wary, DISTRACT.hitWary);
}

/** It has made the player out (or the scene moves on): the search is over, back to the post. */
export function abort(d: Distract): void {
  if (d.phase === 'post' || d.phase === 'back') return;
  d.wary = Math.max(d.wary, DISTRACT.wary);
  home(d);
}

function home(d: Distract): void {
  d.phase = d.ox !== 0 || d.oz !== 0 ? 'back' : 'post';
  d.t = 0;
}

/** Walk the offset towards tx/tz; true once it is there. */
function walk(d: Distract, tx: number, tz: number, step: number): boolean {
  const dx = tx - d.ox;
  const dz = tz - d.oz;
  const dist = Math.hypot(dx, dz);
  if (dist <= step) {
    d.ox = tx;
    d.oz = tz;
    return true;
  }
  d.ox += (dx / dist) * step;
  d.oz += (dz / dist) * step;
  return false;
}

/** One fixed step. Returns the new phase when it changed, else null. */
export function stepDistract(d: Distract, dt: number): DistractPhase | null {
  d.wary = Math.max(0, d.wary - dt);
  if (d.phase === 'post') return null;
  const before = d.phase;
  d.t += dt;
  switch (d.phase) {
    case 'turn':
      if (d.t >= DISTRACT.turn) {
        d.phase = d.gx !== 0 || d.gz !== 0 ? 'walk' : 'look';
        d.t = 0;
      }
      break;
    case 'walk':
      if (walk(d, d.gx, d.gz, DISTRACT.speed * dt)) {
        d.phase = 'look';
        d.t = 0;
      }
      break;
    case 'look':
      if (d.t >= DISTRACT.look) {
        d.wary = Math.max(d.wary, DISTRACT.wary);
        home(d);
      }
      break;
    case 'back':
      if (walk(d, 0, 0, DISTRACT.speed * dt)) {
        d.phase = 'post';
        d.t = 0;
      }
      break;
    case 'glance':
      if (d.t >= DISTRACT.glance) {
        d.phase = 'post';
        d.t = 0;
      }
      break;
    case 'alert':
      if (d.t >= DISTRACT.alert) home(d);
      break;
  }
  return d.phase !== before ? d.phase : null;
}

/** Heading in degrees (0 = north = −z, 90 = east) from a to b; null when they coincide. */
function heading(ax: number, az: number, bx: number, bz: number): number | null {
  const dx = bx - ax;
  const dz = bz - az;
  if (Math.hypot(dx, dz) < 0.05) return null;
  return ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
}

/**
 * Where a distracted watcher looks (degrees, 0 = north, 90 = east): at the noise, swinging while
 * it looks around, along its way while it walks back. Null: its own business (at the post, or
 * alerted: the system turns it to the thrower).
 */
export function distractYaw(d: Distract, post: { x: number; z: number }): number | null {
  const x = post.x + d.ox;
  const z = post.z + d.oz;
  switch (d.phase) {
    case 'turn':
    case 'walk':
    case 'glance':
      return heading(x, z, d.nx, d.nz);
    case 'look': {
      const base = heading(x, z, d.nx, d.nz) ?? heading(post.x, post.z, x, z);
      return base === null ? null : (base + DISTRACT.sweep * Math.sin((d.t / DISTRACT.swing) * Math.PI * 2) + 360) % 360;
    }
    case 'back':
      return heading(x, z, post.x, post.z);
    default:
      return null;
  }
}

/** Away from its post or looking elsewhere: its attention is not on its fan's usual sweep. */
export function distracted(d: Distract): boolean {
  return d.phase !== 'post';
}
