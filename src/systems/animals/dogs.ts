/**
 * Jost's dogs Diane and Bijou (design C5, bible t5 / party): pure follow / bolt / lie behaviour.
 * DOM- and three.js-free.
 *
 *  - follow: keep a slot beside and behind the follow target (`npc:double.jost`, `player`, …),
 *    walk / trot / gallop by distance, sniff now and then, sit when the target has stood still.
 *  - run (the t5 wind moment): gallop along `path`, bark at the start and at each inner waypoint;
 *    with `back` return to the follow target's slot and report `animal:returned` exactly once
 *    (without a follow target the end of the path counts as "back").
 *  - lie: the party pose, at x/z or at the feet of a target (keep ending: the player's feet);
 *    after LIE_SLEEP s the clip turns to sleep.
 * Dogs are never hostile and never targetable.
 *
 * Targets are resolved by the caller (`resolve(ref)`), so the core knows no npc / player system.
 * Yaw: heading, `atan2(-dx, -dz)` (0 faces −z).
 * Motion: the core turns the dog at TURN rad/s (instant with reduced motion), plants it on sharp
 * reversals, and moves it forward along its yaw once aligned. The rig takes that yaw directly.
 */
import { allOf, finiteOr, isRecord } from '../../core/saved';
import type { AnimalClipHint, AnimalEvent, AnimalLook, AnimalMotion, AnimalRequest, AnimalSpawnOp, DogSave } from './types';

/** fauna v0 speeds per dog (m/s). */
export const DOG_SPEEDS: Record<'diane' | 'bijou', { walk: number; run: number }> = {
  diane: { walk: 1.4, run: 7 },
  bijou: { walk: 1.2, run: 5 },
};

export const DOGS = {
  SPACING: 1.5,
  /** Slot offsets in units of `spacing`: side (+ = right of the target), back (+ = behind). */
  SLOTS: [
    { side: -0.7, back: 1.0 },
    { side: 0.7, back: 1.3 },
  ],
  /** At the slot within this (m). */
  AT_SLOT: 0.6,
  /** Farther than this from the slot: gallop; else trot / walk. */
  RUN_DIST: 6,
  /** The target counts as still below this (m/s) … */
  STILL_SPEED: 0.2,
  /** … for this long → sit. */
  SIT_AFTER: 2.5,
  /** A sitting dog gets up when the slot is farther than this. */
  SIT_BREAK: 1.8,
  /** Sniff for SNIFF_S seconds every SNIFF_EVERY seconds while trotting along (phase per dog). */
  SNIFF_EVERY: 7,
  SNIFF_S: 1.6,
  /** Back at the follow target: within this of the slot (m). */
  RETURN_RADIUS: 1.2,
  /** A path point counts as reached within this (m). */
  PATH_EPS: 0.4,
  /** lie at a target's feet: this far in front of it (m), a little to the dog's slot side. */
  LIE_FEET: 0.8,
  LIE_SLEEP: 20,
  /**
   * Body turn rate (rad/s). A dog turns, then walks: its root only ever moves along its facing,
   * so it never slides sideways or backwards, and a slot behind it is a turn, not a reverse.
   */
  TURN: 5,
  /** A goal over 150° away starts a planted turn, which continues until within 60°. */
  REVERSE: (5 * Math.PI) / 6,
  TURN_RESUME: Math.PI / 3,
  /** Speed change limits (m/s²): no idle / walk flicker from one tick to the next. */
  ACCEL: 6,
  DECEL: 10,
  /** Catch-up speed per metre of gap ahead to the slot (1/s), on top of the target's speed. */
  GAIN: 1.5,
  /** Slowest walk to the slot of a standing target (m/s): no creeping on the spot. */
  MIN_WALK: 0.5,
  /** At a point (the slot of a standing target, the lie spot) within this (m). */
  ARRIVE: 0.15,
  /** Within this of the slot of a moving target the dog heads where the target heads (m). */
  NEAR: 0.4,
  /** A gallop eases back to a trot below this many walk speeds (and starts at 2). */
  RUN_LEAVE: 1.7,
  /**
   * When the target jumps (a teleport, a fade's warp, the walk's snap), a following dog farther than
   * this from its place lands there at once (m): no gallop through the forest from far behind.
   */
  SNAP_FAR: 12,
} as const;

export type DogState = 'idle' | 'follow' | 'sit' | 'bolt' | 'return' | 'lie';

export interface DogTarget {
  x: number;
  z: number;
  yaw: number;
  /** Ground speed m/s. */
  speed: number;
  /** The target jumped this tick (teleport, warp, snap); the caller detects it. */
  jumped?: boolean;
}
/** Resolve 'npc:double.jost' / 'player' / 'animal:<id>' to a live pose, or null when absent. */
export type DogResolve = (ref: string) => DogTarget | null;
/** Whether a dog is close enough to pass a waypoint occupied by another body. */
export type BlockedWaypoint = (dog: Dog, x: number, z: number) => boolean;

export interface Dog {
  readonly id: string;
  readonly look: AnimalLook;
  x: number;
  z: number;
  yaw: number;
  state: DogState;
  t: number;
  follow: string;
  spacing: number;
  /** Slot index into DOGS.SLOTS. */
  slot: number;
  path: [number, number][] | null;
  /** Next path point. */
  i: number;
  bark: boolean;
  back: boolean;
  lie: { x: number; z: number; follow: string } | null;
  /** Seconds the follow target has stood still. */
  still: number;
  readonly walk: number;
  readonly run: number;
  /** Sniff phase offset (s), from the id. */
  readonly phase: number;
  /** Current ground speed along the facing (m/s). */
  v: number;
  turning: boolean;
  motion: AnimalMotion;
}

export const headingOf = (dx: number, dz: number): number => Math.atan2(-dx, -dz);
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const wrapPi = (a: number): number => a - TAU * Math.floor((a + Math.PI) / TAU);
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function createDog(op: AnimalSpawnOp, slot?: number, at?: { x: number; z: number; yaw?: number }): Dog {
  const look: AnimalLook = op.look === 'bijou' ? 'bijou' : 'diane';
  const sp = DOG_SPEEDS[look === 'bijou' ? 'bijou' : 'diane'];
  const x = op.x ?? at?.x ?? 0;
  const z = op.z ?? at?.z ?? 0;
  const yaw = op.yaw !== undefined ? op.yaw * DEG : (at?.yaw ?? 0);
  const follow = op.follow ?? '';
  return {
    id: op.id,
    look,
    x,
    z,
    yaw,
    state: follow ? 'follow' : 'idle',
    t: 0,
    follow,
    spacing: op.spacing ?? DOGS.SPACING,
    slot: slot ?? (look === 'bijou' ? 1 : 0),
    path: null,
    i: 0,
    bark: false,
    back: false,
    lie: null,
    still: 0,
    walk: sp.walk,
    run: sp.run,
    phase: (hashStr(op.id) % 1000) / 1000 * DOGS.SNIFF_EVERY,
    v: 0,
    turning: false,
    motion: { tx: x, tz: z, speed: 0, yaw, clip: 'idle' },
  };
}

/** The dog's slot beside / behind a target. */
export function dogSlot(target: DogTarget, slot: number, spacing: number): { x: number; z: number } {
  const o = DOGS.SLOTS[((slot % DOGS.SLOTS.length) + DOGS.SLOTS.length) % DOGS.SLOTS.length]!;
  const fx = -Math.sin(target.yaw);
  const fz = -Math.cos(target.yaw);
  const rx = Math.cos(target.yaw);
  const rz = -Math.sin(target.yaw);
  return {
    x: target.x + rx * o.side * spacing - fx * o.back * spacing,
    z: target.z + rz * o.side * spacing - fz * o.back * spacing,
  };
}

/** Apply a request (run / lie / follow; spawn and despawn are the caller's). Returns the one-shot cues it starts. */
export function applyDogRequest(dog: Dog, req: AnimalRequest): AnimalEvent[] {
  const out: AnimalEvent[] = [];
  switch (req.op) {
    case 'run':
      dog.path = req.path.map((p) => [p[0], p[1]] as [number, number]);
      dog.i = 0;
      dog.bark = req.bark ?? false;
      dog.back = req.back ?? false;
      dog.state = 'bolt';
      dog.t = 0;
      dog.lie = null;
      if (dog.bark) out.push({ type: 'bark', id: dog.id, x: dog.x, z: dog.z });
      break;
    case 'lie':
      dog.lie = { x: req.x ?? NaN, z: req.z ?? NaN, follow: req.follow ?? (req.x === undefined ? dog.follow : '') };
      dog.state = 'lie';
      dog.t = 0;
      dog.path = null;
      break;
    case 'follow':
      dog.follow = req.follow ?? '';
      if (req.spacing !== undefined) dog.spacing = req.spacing;
      dog.state = dog.follow ? 'follow' : 'idle';
      dog.t = 0;
      dog.path = null;
      dog.lie = null;
      break;
    default:
      break;
  }
  return out;
}

/** Turn toward heading `hd` by at most `cap` radians. */
function turnToward(dog: Dog, hd: number, cap: number): void {
  dog.yaw = wrapPi(dog.yaw + clamp(wrapPi(hd - dog.yaw), -cap, cap));
}

/** Plant the feet while turning a goal from behind the dog into its forward half-plane. */
function turnForTravel(dog: Dog, hd: number, cap: number): boolean {
  dog.turning = Math.abs(wrapPi(hd - dog.yaw)) > (dog.turning ? DOGS.TURN_RESUME : DOGS.REVERSE);
  turnToward(dog, hd, cap);
  if (dog.turning) dog.v = 0;
  return !dog.turning;
}

/**
 * Move forward along the facing: the speed eases toward `goal` (ACCEL / DECEL) but never exceeds
 * `max` (braking into a point, no circling round it). `land`: a point the dog steps onto when it is
 * within this tick's step (the last few cm of an approach).
 */
function advance(dog: Dog, goal: number, max: number, dt: number, land?: { x: number; z: number }): void {
  const dv = clamp(goal - dog.v, -DOGS.DECEL * dt, DOGS.ACCEL * dt);
  dog.v = Math.max(0, Math.min(max, dog.v + dv));
  if (dog.v < 0.02 && goal <= 0) dog.v = 0;
  const step = dog.v * dt;
  if (step <= 0) return;
  const fx = -Math.sin(dog.yaw);
  const fz = -Math.cos(dog.yaw);
  // land only on a point ahead: a step onto a point behind would be a step backwards
  if (land && Math.hypot(land.x - dog.x, land.z - dog.z) <= step && (land.x - dog.x) * fx + (land.z - dog.z) * fz > 0) {
    dog.x = land.x;
    dog.z = land.z;
    return;
  }
  dog.x += fx * step;
  dog.z += fz * step;
}

/** Hard speed caps toward a point at distance d, heading error err: no orbit round it; `stop`: brake to stand on it. */
function pointCap(d: number, err: number, stop: boolean): number {
  const s = Math.abs(Math.sin(err));
  // the turning circle (radius v / TURN) must fit inside the circle through the point tangent to the facing
  const orbit = s > 1e-3 ? (DOGS.TURN * d) / (2 * s) : Infinity;
  return stop ? Math.min(orbit, Math.sqrt(2 * DOGS.DECEL * d)) : orbit;
}

/** Head for a fixed point at up to `want` m/s: turn first, slow through the turn. Returns the distance left. */
function goTo(dog: Dog, tx: number, tz: number, want: number, dt: number, stop: boolean, turn: number): number {
  const d = Math.hypot(tx - dog.x, tz - dog.z);
  if (d < 1e-6) {
    advance(dog, 0, 0, dt);
    return 0;
  }
  const hd = headingOf(tx - dog.x, tz - dog.z);
  if (!turnForTravel(dog, hd, turn)) return d;
  const err = wrapPi(hd - dog.yaw);
  advance(dog, want * Math.max(0, Math.cos(err)), pointCap(d, err, stop), dt, { x: tx, z: tz });
  return Math.hypot(tx - dog.x, tz - dog.z);
}

/** The walk / trot / gallop clip of the current speed (a gallop eases out a little later than it starts). */
function gaitClip(dog: Dog, was: AnimalClipHint): AnimalClipHint {
  if (dog.v >= dog.walk * (was === 'run' ? DOGS.RUN_LEAVE : 2)) return 'run';
  return dog.v > 0.05 ? 'walk' : 'idle';
}

/** Lie target in world space, or null when its follow target is absent. */
function liePoint(dog: Dog, resolve: DogResolve): { x: number; z: number; face: number; jumped: boolean } | null {
  const l = dog.lie!;
  if (l.follow) {
    const t = resolve(l.follow);
    if (!t) return null;
    const fx = -Math.sin(t.yaw);
    const fz = -Math.cos(t.yaw);
    const side = DOGS.SLOTS[dog.slot % DOGS.SLOTS.length]!.side;
    const rx = Math.cos(t.yaw);
    const rz = -Math.sin(t.yaw);
    const x = t.x + fx * DOGS.LIE_FEET + rx * side * 0.6;
    const z = t.z + fz * DOGS.LIE_FEET + rz * side * 0.6;
    return { x, z, face: headingOf(t.x - x, t.z - z), jumped: t.jumped === true };
  }
  if (Number.isNaN(l.x)) return { x: dog.x, z: dog.z, face: dog.yaw, jumped: false };
  return { x: l.x, z: l.z, face: dog.yaw, jumped: false };
}

/** The target jumped and the dog is far from its place: it lands there, standing, facing `yaw`. Returns whether it did. */
function landAfterJump(dog: Dog, jumped: boolean | undefined, x: number, z: number, yaw: number): boolean {
  if (!jumped || Math.hypot(x - dog.x, z - dog.z) <= DOGS.SNAP_FAR) return false;
  dog.x = x;
  dog.z = z;
  dog.yaw = yaw;
  dog.v = 0;
  return true;
}

/** Place a dog at its leader's new pose and finish any interrupted return. */
export function relocateDog(dog: Dog, target: DogTarget): boolean {
  const lie = dog.state === 'lie';
  const p = lie ? liePoint(dog, () => target) : null;
  const { x, z } = p ?? dogSlot(target, dog.slot, dog.spacing);
  const returned = dog.state === 'return' || (dog.state === 'bolt' && dog.back);
  if (!lie) {
    dog.state = 'follow';
    dog.t = 0;
    dog.still = 0;
    dog.path = null;
    dog.i = 0;
  }
  dog.x = x;
  dog.z = z;
  dog.yaw = p?.face ?? target.yaw;
  dog.v = 0;
  dog.turning = false;
  Object.assign(dog.motion, { tx: x, tz: z, yaw: dog.yaw, speed: 0, clip: lie ? (dog.t >= DOGS.LIE_SLEEP ? 'sleep' : 'lie') : 'idle' });
  return returned;
}

export function stepDog(
  dog: Dog,
  dt: number,
  resolve: DogResolve,
  out: AnimalEvent[] = [],
  reducedMotion = false,
  blockedWaypoint?: BlockedWaypoint,
): AnimalEvent[] {
  dog.t += dt;
  const turn = reducedMotion ? Infinity : DOGS.TURN * dt;
  const target = dog.follow ? resolve(dog.follow) : null;
  const m = dog.motion;
  const was = m.clip;
  m.tx = dog.x;
  m.tz = dog.z;
  m.clip = 'idle';

  switch (dog.state) {
    case 'follow':
    case 'sit': {
      if (!target) {
        dog.state = 'idle';
        advance(dog, 0, Infinity, dt);
        break;
      }
      // a walking target counts as walking down to half the still speed (no flicker round the line)
      const moving = target.speed > DOGS.STILL_SPEED * (dog.still > 0 ? 1 : 0.5);
      dog.still = moving ? 0 : dog.still + dt;
      const s = dogSlot(target, dog.slot, dog.spacing);
      m.tx = s.x;
      m.tz = s.z;
      landAfterJump(dog, target.jumped, s.x, s.z, target.yaw);
      const d = Math.hypot(s.x - dog.x, s.z - dog.z);
      if (dog.state === 'sit') {
        if (moving || d > DOGS.SIT_BREAK) {
          dog.state = 'follow';
          dog.t = 0;
        } else {
          m.clip = 'sit';
          break;
        }
      }
      if (moving || d > (dog.v > 0 ? DOGS.ARRIVE : DOGS.AT_SLOT)) {
        // the slot's offset along the facing: ahead (> 0) the dog closes in, behind it lets the slot come
        const along = (yaw: number) => -(s.x - dog.x) * Math.sin(yaw) - (s.z - dog.z) * Math.cos(yaw);
        const bearing = d > 1e-6 ? headingOf(s.x - dog.x, s.z - dog.z) : dog.yaw;
        let hd = bearing;
        if (d <= DOGS.AT_SLOT && along(dog.yaw) <= 0) hd = moving ? target.yaw : dog.yaw; // just past it: never turn round for that
        else if (moving) hd = target.yaw + wrapPi(bearing - target.yaw) * clamp((d - DOGS.ARRIVE) / (DOGS.NEAR - DOGS.ARRIVE), 0, 1);
        if (!turnForTravel(dog, hd, turn)) break;
        const ts = moving ? target.speed : 0;
        const ceil = d > DOGS.RUN_DIST ? dog.run : Math.min(dog.run, Math.max(ts, dog.walk * 1.5));
        const a = along(dog.yaw);
        let goal = clamp(ts + DOGS.GAIN * a, 0, ceil);
        if (!moving && a > 0) goal = Math.max(goal, Math.min(DOGS.MIN_WALK, ceil) * Math.max(0, Math.cos(wrapPi(bearing - dog.yaw))));
        advance(dog, goal, moving ? Infinity : pointCap(d, wrapPi(bearing - dog.yaw), true), dt, moving ? undefined : s);
      } else {
        // at the slot of a standing target: stand, turn to where the target faces
        dog.v = 0;
        turnToward(dog, target.yaw, turn);
      }
      const gap = Math.hypot(s.x - dog.x, s.z - dog.z);
      if (dog.still >= DOGS.SIT_AFTER && gap <= DOGS.AT_SLOT && dog.v === 0) {
        dog.state = 'sit';
        dog.t = 0;
        m.clip = 'sit';
      } else if (dog.v > 0.05 && dog.v <= dog.walk * 1.2 && (dog.t + dog.phase) % DOGS.SNIFF_EVERY < DOGS.SNIFF_S) m.clip = 'sniff';
      else m.clip = gaitClip(dog, was);
      break;
    }
    case 'bolt': {
      const path = dog.path;
      // The dog curves past reached points. A crowd can make the authored point unreachable.
      const pass = (): void => {
        while (path && dog.i < path.length) {
          const [x, z] = path[dog.i]!;
          if (Math.hypot(x - dog.x, z - dog.z) > DOGS.PATH_EPS && !blockedWaypoint?.(dog, x, z)) break;
          const inner = dog.i > 0 && dog.i < path.length - 1;
          if (inner && dog.bark) out.push({ type: 'bark', id: dog.id, x: dog.x, z: dog.z });
          dog.i++;
        }
      };
      pass();
      if (!path || dog.i >= path.length) {
        finishBolt(dog, target, out);
        m.clip = gaitClip(dog, was);
        break;
      }
      const [px, pz] = path[dog.i]!;
      goTo(dog, px, pz, dog.run, dt, false, turn);
      pass();
      const next = path[Math.min(dog.i, path.length - 1)]!;
      m.tx = next[0];
      m.tz = next[1];
      m.clip = dog.v > 0.05 ? 'run' : 'idle';
      if (dog.i >= path.length) finishBolt(dog, target, out);
      break;
    }
    case 'return': {
      if (!target) {
        dog.state = 'idle';
        out.push({ type: 'animal:returned', id: dog.id });
        break;
      }
      const s = dogSlot(target, dog.slot, dog.spacing);
      m.tx = s.x;
      m.tz = s.z;
      landAfterJump(dog, target.jumped, s.x, s.z, target.yaw);
      let d = Math.hypot(s.x - dog.x, s.z - dog.z);
      if (d > DOGS.RETURN_RADIUS) {
        const want = d > DOGS.RUN_DIST ? dog.run : Math.max(dog.walk * 1.5, target.speed);
        d = goTo(dog, s.x, s.z, want, dt, false, turn);
        m.clip = gaitClip(dog, was);
      }
      if (d <= DOGS.RETURN_RADIUS) {
        dog.state = 'follow';
        dog.t = 0;
        dog.still = 0;
        out.push({ type: 'animal:returned', id: dog.id });
      }
      break;
    }
    case 'lie': {
      const p = dog.lie ? liePoint(dog, resolve) : null;
      if (!p) {
        dog.v = 0;
        m.clip = 'lie';
        break;
      }
      m.tx = p.x;
      m.tz = p.z;
      landAfterJump(dog, p.jumped, p.x, p.z, p.face);
      const d = Math.hypot(p.x - dog.x, p.z - dog.z);
      const down = dog.v === 0 && (was === 'lie' || was === 'sleep');
      if (d > (down ? DOGS.AT_SLOT : DOGS.ARRIVE)) {
        goTo(dog, p.x, p.z, d > DOGS.RUN_DIST ? dog.run : dog.walk, dt, true, turn);
        dog.t = 0;
        m.clip = gaitClip(dog, was);
      } else {
        dog.v = 0;
        turnToward(dog, p.face, turn);
        m.clip = dog.t >= DOGS.LIE_SLEEP ? 'sleep' : 'lie';
      }
      break;
    }
    case 'idle':
      advance(dog, 0, Infinity, dt);
      m.clip = gaitClip(dog, was);
      if (target) {
        dog.state = 'follow';
        dog.t = 0;
      }
      break;
  }
  m.speed = dog.v;
  m.yaw = dog.yaw;
  return out;
}

function finishBolt(dog: Dog, target: DogTarget | null, out: AnimalEvent[]): void {
  dog.path = null;
  dog.i = 0;
  dog.t = 0;
  if (dog.back && target) {
    dog.state = 'return';
    return;
  }
  dog.state = target ? 'follow' : 'idle';
  if (dog.back) out.push({ type: 'animal:returned', id: dog.id });
}

/** Step all dogs in order. */
export function stepDogs(dogs: readonly Dog[], dt: number, resolve: DogResolve, reducedMotion = false): AnimalEvent[] {
  const out: AnimalEvent[] = [];
  for (const d of dogs) stepDog(d, dt, resolve, out, reducedMotion);
  return out;
}

export function serializeDog(dog: Dog): DogSave {
  const s: DogSave = {
    id: dog.id,
    look: dog.look,
    x: dog.x,
    z: dog.z,
    yaw: dog.yaw || 0,
    state: dog.state,
    t: dog.t,
    follow: dog.follow,
    spacing: dog.spacing,
    slot: dog.slot,
  };
  if (dog.path) {
    s.path = dog.path.map((p) => [p[0], p[1]] as [number, number]);
    s.i = dog.i;
  }
  if (dog.state === 'bolt' || dog.state === 'return') {
    s.bark = dog.bark;
    s.back = dog.back;
  }
  if (dog.lie) s.lie = { x: Number.isNaN(dog.lie.x) ? dog.x : dog.lie.x, z: Number.isNaN(dog.lie.z) ? dog.z : dog.lie.z, follow: dog.lie.follow };
  if (dog.v > 0) s.v = dog.v;
  if (dog.turning) s.turning = true;
  return s;
}

const DOG_STATES = allOf<DogState>()(['idle', 'follow', 'sit', 'bolt', 'return', 'lie']);

export function restoreDog(s: DogSave): Dog {
  const dog = createDog({
    op: 'spawn', id: s.id, kind: 'hund', look: s.look, x: finiteOr(s.x, 0), z: finiteOr(s.z, 0),
    follow: typeof s.follow === 'string' ? s.follow : undefined, spacing: finiteOr(s.spacing, DOGS.SPACING),
  }, Number.isFinite(s.slot) ? s.slot : undefined);
  dog.yaw = finiteOr(s.yaw, 0);
  dog.state = DOG_STATES.includes(s.state as DogState) ? (s.state as DogState) : 'idle';
  dog.t = finiteOr(s.t, 0);
  dog.path = Array.isArray(s.path)
    ? s.path.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p) => [p[0], p[1]] as [number, number])
    : null;
  dog.i = Math.max(0, finiteOr(s.i, 0));
  dog.bark = s.bark === true;
  dog.back = s.back === true;
  const lie = s.lie;
  dog.lie = isRecord(lie) && Number.isFinite(lie.x) && Number.isFinite(lie.z) ? { x: lie.x, z: lie.z, follow: typeof lie.follow === 'string' ? lie.follow : '' } : null;
  dog.v = typeof s.v === 'number' && Number.isFinite(s.v) ? Math.max(0, Math.min(dog.run, s.v)) : 0;
  dog.turning = s.turning === true;
  if (dog.state === 'bolt' && !dog.path) dog.state = dog.back ? 'return' : 'idle';
  if (dog.state === 'lie' && !dog.lie) dog.lie = { x: dog.x, z: dog.z, follow: '' };
  dog.motion.yaw = dog.yaw;
  return dog;
}
