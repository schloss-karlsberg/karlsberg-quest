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
 */
import type { AnimalEvent, AnimalLook, AnimalMotion, AnimalRequest, AnimalSpawnOp, DogSave } from './types';

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
} as const;

export type DogState = 'idle' | 'follow' | 'sit' | 'bolt' | 'return' | 'lie';

export interface DogTarget {
  x: number;
  z: number;
  yaw: number;
  /** Ground speed m/s. */
  speed: number;
}
/** Resolve 'npc:double.jost' / 'player' / 'animal:<id>' to a live pose, or null when absent. */
export type DogResolve = (ref: string) => DogTarget | null;

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
  motion: AnimalMotion;
}

export const headingOf = (dx: number, dz: number): number => Math.atan2(-dx, -dz);
const DEG = Math.PI / 180;

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

function moveTo(dog: Dog, tx: number, tz: number, step: number): boolean {
  const dx = tx - dog.x;
  const dz = tz - dog.z;
  const l = Math.hypot(dx, dz);
  if (l <= step || l < 1e-6) {
    dog.x = tx;
    dog.z = tz;
    return true;
  }
  dog.x += (dx / l) * step;
  dog.z += (dz / l) * step;
  dog.yaw = headingOf(dx, dz);
  return false;
}

/** Ground speed toward a point at distance d (walk near, trot mid, gallop far), matching a moving target. */
function chaseSpeed(dog: Dog, d: number, targetSpeed: number): number {
  if (d < 0.05) return 0;
  if (d > DOGS.RUN_DIST) return dog.run;
  return Math.min(dog.run, Math.max(targetSpeed, dog.walk * Math.min(1.5, Math.max(0.5, d))));
}

/** Lie target in world space, or null when its follow target is absent. */
function liePoint(dog: Dog, resolve: DogResolve): { x: number; z: number; face: number } | null {
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
    return { x, z, face: headingOf(t.x - x, t.z - z) };
  }
  if (Number.isNaN(l.x)) return { x: dog.x, z: dog.z, face: dog.yaw };
  return { x: l.x, z: l.z, face: dog.yaw };
}

export function stepDog(dog: Dog, dt: number, resolve: DogResolve, out: AnimalEvent[] = []): AnimalEvent[] {
  dog.t += dt;
  const target = dog.follow ? resolve(dog.follow) : null;
  const m = dog.motion;
  m.tx = dog.x;
  m.tz = dog.z;
  m.speed = 0;
  m.clip = 'idle';

  switch (dog.state) {
    case 'follow':
    case 'sit': {
      if (!target) {
        dog.state = 'idle';
        break;
      }
      dog.still = target.speed < DOGS.STILL_SPEED ? dog.still + dt : 0;
      const s = dogSlot(target, dog.slot, dog.spacing);
      const d = Math.hypot(s.x - dog.x, s.z - dog.z);
      if (dog.state === 'sit') {
        if (target.speed > DOGS.STILL_SPEED || d > DOGS.SIT_BREAK) {
          dog.state = 'follow';
          dog.t = 0;
        } else {
          m.clip = 'sit';
          break;
        }
      }
      const v = d <= DOGS.AT_SLOT * 0.25 ? 0 : chaseSpeed(dog, d, target.speed);
      if (v > 0) moveTo(dog, s.x, s.z, v * dt);
      m.tx = s.x;
      m.tz = s.z;
      m.speed = v;
      if (v < DOGS.STILL_SPEED) dog.yaw = target.yaw;
      if (dog.still >= DOGS.SIT_AFTER && d <= DOGS.AT_SLOT) {
        dog.state = 'sit';
        dog.t = 0;
        m.clip = 'sit';
      } else if (v > 0 && v <= dog.walk * 1.2 && (dog.t + dog.phase) % DOGS.SNIFF_EVERY < DOGS.SNIFF_S) m.clip = 'sniff';
      else m.clip = v >= dog.walk * 2 ? 'run' : v > 0 ? 'walk' : 'idle';
      break;
    }
    case 'bolt': {
      const path = dog.path;
      if (!path || dog.i >= path.length) {
        finishBolt(dog, target, out);
        break;
      }
      let step = dog.run * dt;
      while (step > 0 && dog.i < path.length) {
        const [px, pz] = path[dog.i]!;
        const d = Math.hypot(px - dog.x, pz - dog.z);
        if (d <= step + DOGS.PATH_EPS) {
          moveTo(dog, px, pz, d);
          step -= d;
          const inner = dog.i > 0 && dog.i < path.length - 1;
          if (inner && dog.bark) out.push({ type: 'bark', id: dog.id, x: dog.x, z: dog.z });
          dog.i++;
        } else {
          moveTo(dog, px, pz, step);
          step = 0;
        }
      }
      const next = path[Math.min(dog.i, path.length - 1)]!;
      m.tx = next[0];
      m.tz = next[1];
      m.speed = dog.run;
      m.clip = 'run';
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
      const d = Math.hypot(s.x - dog.x, s.z - dog.z);
      if (d <= DOGS.RETURN_RADIUS) {
        dog.state = 'follow';
        dog.t = 0;
        dog.still = 0;
        out.push({ type: 'animal:returned', id: dog.id });
        break;
      }
      const v = d > DOGS.RUN_DIST ? dog.run : Math.max(dog.walk * 1.5, target.speed);
      moveTo(dog, s.x, s.z, v * dt);
      m.tx = s.x;
      m.tz = s.z;
      m.speed = v;
      m.clip = v >= dog.walk * 2 ? 'run' : 'walk';
      if (Math.hypot(s.x - dog.x, s.z - dog.z) <= DOGS.RETURN_RADIUS) {
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
        m.clip = 'lie';
        break;
      }
      const d = Math.hypot(p.x - dog.x, p.z - dog.z);
      if (d > 0.15) {
        const v = d > DOGS.RUN_DIST ? dog.run : dog.walk;
        moveTo(dog, p.x, p.z, v * dt);
        dog.t = 0;
        m.tx = p.x;
        m.tz = p.z;
        m.speed = v;
        m.clip = v >= dog.walk * 2 ? 'run' : 'walk';
      } else {
        dog.yaw = p.face;
        m.clip = dog.t >= DOGS.LIE_SLEEP ? 'sleep' : 'lie';
      }
      break;
    }
    case 'idle':
      if (target) {
        dog.state = 'follow';
        dog.t = 0;
      }
      break;
  }
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
export function stepDogs(dogs: readonly Dog[], dt: number, resolve: DogResolve): AnimalEvent[] {
  const out: AnimalEvent[] = [];
  for (const d of dogs) stepDog(d, dt, resolve, out);
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
  return s;
}

const DOG_STATES: readonly DogState[] = ['idle', 'follow', 'sit', 'bolt', 'return', 'lie'];

export function restoreDog(s: DogSave): Dog {
  const dog = createDog({ op: 'spawn', id: s.id, kind: 'hund', look: s.look, x: s.x, z: s.z, follow: s.follow, spacing: s.spacing }, s.slot);
  dog.yaw = s.yaw;
  dog.state = DOG_STATES.includes(s.state as DogState) ? (s.state as DogState) : 'idle';
  dog.t = s.t;
  dog.path = s.path ? s.path.map((p) => [p[0], p[1]] as [number, number]) : null;
  dog.i = s.i ?? 0;
  dog.bark = s.bark ?? false;
  dog.back = s.back ?? false;
  dog.lie = s.lie ? { ...s.lie } : null;
  if (dog.state === 'bolt' && !dog.path) dog.state = dog.back ? 'return' : 'idle';
  if (dog.state === 'lie' && !dog.lie) dog.lie = { x: dog.x, z: dog.z, follow: '' };
  dog.motion.yaw = dog.yaw;
  return dog;
}
