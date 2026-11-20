/**
 * Pure parts of the people system (no three.js, unit-tested in tests/people.test.ts): locomotion
 * blend weights from ground speed, phase-locked strides, the stride measured from a clip's foot
 * track, the body's yaw easing, the head's aim limits, the distance LOD and clip fallbacks.
 *
 * The fauna system (src/systems/fauna) reuses these helpers. Where a number is human (the gait
 * thresholds, the head limits, the LOD table) a function takes it as an optional last parameter
 * whose default is the people's value, so the people's behaviour does not change.
 */
import { CLIP_FALLBACK, PEOPLE_LOD, type PersonClip } from './types';

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (t: number) => t * t * (3 - 2 * t);

// ---- locomotion ---------------------------------------------------------------------------------

/** idle → walk from `WALK_FROM` over `WALK_SPAN` m/s, walk → run from `RUN_FROM` over `RUN_SPAN`. */
export const WALK_FROM = 0.08;
export const WALK_SPAN = 0.55;
export const RUN_FROM = 2.4;
export const RUN_SPAN = 1.5;

/** Speeds (m/s) of the idle → walk → run blend: walk from `walkFrom` over `walkSpan`, run from `runFrom` over `runSpan`. */
export interface LocoGaits {
  walkFrom: number;
  walkSpan: number;
  runFrom: number;
  runSpan: number;
}

/** The people's gaits (the default of every locomotion helper). */
export const HUMAN_GAITS: LocoGaits = { walkFrom: WALK_FROM, walkSpan: WALK_SPAN, runFrom: RUN_FROM, runSpan: RUN_SPAN };

export interface LocoWeights {
  idle: number;
  walk: number;
  run: number;
}

/** Blend weights of the idle / walk / run loops for a ground speed (m/s); they sum to 1. */
export function locoWeights(speed: number, g: LocoGaits = HUMAN_GAITS): LocoWeights {
  const sp = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  const move = smooth(clamp01((sp - g.walkFrom) / g.walkSpan));
  const run = smooth(clamp01((sp - g.runFrom) / g.runSpan));
  return { idle: 1 - move, walk: move * (1 - run), run: move * run };
}

/** How much of the body moves (0 standing … 1 walking or running): one-shots go upper-body only. */
export function moveAmount(speed: number, g: LocoGaits = HUMAN_GAITS): number {
  const w = locoWeights(speed, g);
  return w.walk + w.run;
}

/** Ground distance one loop covers at this speed: the walk and run strides blended like the clips (m). */
export function strideAt(speed: number, walkStride: number, runStride: number, g: LocoGaits = HUMAN_GAITS): number {
  const w = locoWeights(speed, g);
  const k = w.walk + w.run > 1e-6 ? w.run / (w.walk + w.run) : 0;
  return walkStride + (runStride - walkStride) * k;
}

/**
 * Phase-locked feet: ONE cycle counter (loops, 0..1) drives the walk and the run clip, advanced by
 * ground speed over the blended stride, so a blend between them never skates.
 */
export function advancePhase(phase: number, speed: number, walkStride: number, runStride: number, dt: number, g: LocoGaits = HUMAN_GAITS): number {
  const sp = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  const stride = Math.max(0.05, strideAt(sp, walkStride, runStride, g));
  const p = phase + (sp / stride) * Math.max(0, dt);
  return p - Math.floor(p);
}

/** One sample of a foot bone through a clip (model frame: the model faces +z, y up). */
export interface FootSample {
  t: number;
  y: number;
  z: number;
}

/**
 * The ground distance one loop of an in-place locomotion clip covers, measured from its foot
 * tracks: while a foot is planted (within the lowest `contact` share of its height range) it slides
 * backwards at the ground speed, so speed = the planted foot's median backward velocity and stride
 * = speed × the clip's length. Null when nothing is measurable (no planted backward slide).
 */
export function strideFromFeet(feet: FootSample[][], duration: number, contact = 0.2): number | null {
  if (!(duration > 0)) return null;
  const v: number[] = [];
  for (const s of feet) {
    if (s.length < 4) continue;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of s) {
      lo = Math.min(lo, p.y);
      hi = Math.max(hi, p.y);
    }
    const lim = lo + Math.max(1e-4, (hi - lo) * contact);
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1]!;
      const b = s[i]!;
      const dt = b.t - a.t;
      if (dt <= 0 || a.y > lim || b.y > lim) continue;
      const back = -(b.z - a.z) / dt;
      if (back > 0) v.push(back);
    }
  }
  if (v.length < 2) return null;
  v.sort((a, b) => a - b);
  const med = v[v.length >> 1]!;
  return med * duration;
}

/** Fallback strides (m per loop, per metre of body height) when a clip cannot be measured: what `strideFromFeet` measures on the Quaternius Walk / Run. */
export const STRIDE_PER_HEIGHT = { walk: 0.98, run: 1.31 } as const;

// ---- turning ------------------------------------------------------------------------------------

/** Wrap an angle to [−π, π). */
export function wrapPi(a: number): number {
  const d = (((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return d - Math.PI;
}

/** Seconds a `face()` turn takes to cover ~95 % of the angle; the body never turns faster than `FACE_MAX_RATE` rad/s. */
export const FACE_SECONDS = 0.55;
export const FACE_MAX_RATE = 5;

/**
 * One step of a smooth body turn from `current` toward `target` (radians, the shortest arc): an
 * exponential approach (95 % after `seconds`) capped at `maxRate` rad/s, frame-rate independent.
 * Snaps when it lands within 1e-3 rad. Result wrapped to [−π, π).
 */
export function easeYaw(current: number, target: number, dt: number, seconds = FACE_SECONDS, maxRate = FACE_MAX_RATE): number {
  const arc = wrapPi(target - current);
  if (Math.abs(arc) < 1e-3 || seconds <= 0) return wrapPi(target);
  const k = 1 - Math.exp((-3 * Math.max(0, dt)) / seconds);
  let step = arc * k;
  const cap = maxRate * Math.max(0, dt);
  if (Math.abs(step) > cap) step = Math.sign(step) * cap;
  return wrapPi(current + step);
}

/** Head-turn limits (radians, the NPC ghosts' values): yaw ±`HEAD_YAW`, pitch down / up; a target further round than `HEAD_BEHIND` is ignored (no owl neck). */
export const HEAD_YAW = 1.05;
export const HEAD_PITCH_DOWN = 0.3;
export const HEAD_PITCH_UP = 0.35;
export const HEAD_BEHIND = 2.2;

/** Head-turn limits (radians) for `headAim`. */
export interface HeadLimits {
  yaw: number;
  pitchDown: number;
  pitchUp: number;
  behind: number;
}

/** The people's head limits (the default of `headAim`). */
export const HUMAN_HEAD: HeadLimits = { yaw: HEAD_YAW, pitchDown: HEAD_PITCH_DOWN, pitchUp: HEAD_PITCH_UP, behind: HEAD_BEHIND };

/**
 * Head yaw / pitch toward a point given in the body frame relative to the head (the body faces +z,
 * +x is its left, y up). Yaw positive = toward +x; pitch positive = chin down (Rig.turnBone's sign).
 */
export function headAim(lx: number, ly: number, lz: number, lim: HeadLimits = HUMAN_HEAD): { yaw: number; pitch: number } {
  const a = Math.atan2(lx, lz);
  if (!Number.isFinite(a) || Math.abs(a) > lim.behind) return { yaw: 0, pitch: 0 };
  const dist = Math.hypot(lx, lz);
  const yaw = Math.max(-lim.yaw, Math.min(lim.yaw, a));
  const pitch = Math.max(-lim.pitchUp, Math.min(lim.pitchDown, -Math.atan2(ly, Math.max(0.3, dist))));
  return { yaw, pitch };
}

/** lookAround: the head's slow sweep (radians) at time t (s). */
export function sweepYaw(t: number, seed = 0): number {
  return Math.sin(t * 0.55 + seed) * 0.8 * (0.75 + 0.25 * Math.sin(t * 0.23 + seed * 1.7));
}

// ---- distance LOD -------------------------------------------------------------------------------

export type AnimRate = 'full' | 'slow' | 'frozen';

/** LOD by distance to the camera: animation rate and whether the person is drawn at all (`lod`: the bands, default `PEOPLE_LOD`). */
export function lodFor(dist: number, drawLimit: number = PEOPLE_LOD.drawLimit, lod: { fullRate: number; slowRate: number } = PEOPLE_LOD): { rate: AnimRate; hidden: boolean } {
  const d = Number.isFinite(dist) ? dist : Infinity;
  const rate: AnimRate = d <= lod.fullRate ? 'full' : d <= lod.slowRate ? 'slow' : 'frozen';
  return { rate, hidden: d > drawLimit };
}

/**
 * Whether the pose is evaluated this frame: every frame at 'full', about `PEOPLE_LOD.slowHz` at
 * 'slow' (an accumulator; seed it per person so the evaluations spread over frames), never at
 * 'frozen'. Returns the new accumulator.
 */
export function animTick(acc: number, dt: number, rate: AnimRate, hz: number = PEOPLE_LOD.slowHz): { evaluate: boolean; acc: number } {
  if (rate === 'full') return { evaluate: true, acc: 0 };
  if (rate === 'frozen') return { evaluate: false, acc };
  const step = 1 / hz;
  const a = acc + Math.max(0, dt);
  if (a < step) return { evaluate: false, acc: a };
  return { evaluate: true, acc: Math.min(step, a - step) };
}

// ---- clips --------------------------------------------------------------------------------------

/** The clip that plays for `clip`: itself when supported, else its nearest supported fallback (idle at the end). */
export function resolveClip(clip: PersonClip, supported: readonly PersonClip[]): PersonClip {
  let c: PersonClip | null = clip;
  for (let i = 0; c && i < 8; i++) {
    if (supported.includes(c)) return c;
    c = CLIP_FALLBACK[c];
  }
  return 'idle';
}

/** Looping clips (stay until another clip is played); the rest are one-shots. */
export const LOOPING: ReadonlySet<PersonClip> = new Set<PersonClip>(['idle', 'walk', 'run', 'talk', 'lookAround', 'sit', 'sitTalk']);

/** Weight easing: an exponential approach that covers ~95 % in `fade` seconds (cut when fade ≤ 0). */
export function easeWeight(w: number, target: number, dt: number, fade: number): number {
  if (fade <= 0) return target;
  return w + (target - w) * (1 - Math.exp((-3 * Math.max(0, dt)) / fade));
}

/** A one-shot's envelope target: on until `fade` before its end (then out), off after. */
export function shotTarget(t: number, duration: number, fade: number, loop: boolean): number {
  if (loop) return 1;
  return t < duration - Math.min(fade, duration * 0.4) ? 1 : 0;
}

/** Small deterministic hash of a seed to 0..1 (idle phase, gesture timing). */
export function hash01(seed: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}
