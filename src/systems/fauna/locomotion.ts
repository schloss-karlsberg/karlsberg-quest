/**
 * Pure parts of the fauna system (no three.js, unit-tested in tests/fauna.test.ts). The people's
 * helpers (people/locomotion.ts) do the generic work: phase-locked strides, the stride measured from
 * a foot track, the yaw easing, the distance LOD and the weight envelopes. This file only adds what
 * is animal: gait thresholds from a spec's walk / run speeds, the animal head limits, clip
 * resolution over `AnimalClip`, the pose solver's knee point and the neck carriage angle.
 */
import { type HeadLimits, type LocoGaits } from '../people/locomotion';
import { type AnimalClip, CLIP_FALLBACK } from './types';

export {
  type AnimRate,
  type FootSample,
  type LocoGaits,
  advancePhase,
  animTick,
  easeWeight,
  easeYaw,
  hash01,
  headAim,
  locoWeights,
  lodFor,
  moveAmount,
  shotTarget,
  strideAt,
  strideFromFeet,
  wrapPi,
} from '../people/locomotion';

// ---- gaits --------------------------------------------------------------------------------------

/**
 * The idle → walk → run blend for an animal's gait speeds (m/s): walking from 0.08 m/s (full by
 * half the walk speed, at most 0.55 m/s later), running from 1.5 × the walk speed over a quarter of
 * the walk–run gap (at least 0.8 m/s). Diane (1.4 / 7): full gallop at 3.5 m/s; Bijou (1.2 / 5) at
 * 2.75; the roe (1.2 / 8) at 3.5. Between, the walk and run loops blend phase-locked (no trot clip).
 */
export function gaitsFor(speeds: { walk: number; run: number }): LocoGaits {
  const walk = Number.isFinite(speeds.walk) && speeds.walk > 0.2 ? speeds.walk : 1.2;
  const run = Number.isFinite(speeds.run) && speeds.run > walk ? speeds.run : walk * 3;
  return { walkFrom: 0.08, walkSpan: Math.min(0.55, 0.5 * walk), runFrom: 1.5 * walk, runSpan: Math.max(0.8, 0.25 * (run - walk)) };
}

/** Head-turn limits of an animal (radians): a longer neck turn than a person's, more pitch either way. */
export const ANIMAL_HEAD: HeadLimits = { yaw: 1.25, pitchDown: 0.6, pitchUp: 0.5, behind: 2.3 };

// ---- clips --------------------------------------------------------------------------------------

/** The clip that plays for `clip` from a set: itself when in it, else along `CLIP_FALLBACK` (idle at the end). */
export function resolveAnimalClip(clip: AnimalClip, supported: readonly AnimalClip[]): AnimalClip {
  let c: AnimalClip | null = clip;
  for (let i = 0; c && i < 12; i++) {
    if (supported.includes(c)) return c;
    c = CLIP_FALLBACK[c];
  }
  return 'idle';
}

// ---- poses --------------------------------------------------------------------------------------

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/**
 * The knee of a two-segment limb from `root` to `target` (segment lengths `a`, `b`), bent toward
 * `pole` (a direction; only its part across the root → target line counts). Targets out of reach
 * are pulled onto the reachable shell along the same line (the limb straightens or folds fully).
 * Returns the knee and the target actually reached.
 */
export function kneePoint(root: P3, target: P3, a: number, b: number, pole: P3): { knee: P3; end: P3 } {
  let ux = target.x - root.x;
  let uy = target.y - root.y;
  let uz = target.z - root.z;
  let d = Math.hypot(ux, uy, uz);
  if (d < 1e-9) {
    ux = 0;
    uy = -1;
    uz = 0;
    d = 1e-9;
  } else {
    ux /= d;
    uy /= d;
    uz /= d;
  }
  const lo = Math.abs(a - b) + 1e-6;
  const hi = a + b - 1e-6;
  const dc = Math.max(lo, Math.min(hi, d));
  // the pole's part across the line
  const pd = pole.x * ux + pole.y * uy + pole.z * uz;
  let nx = pole.x - pd * ux;
  let ny = pole.y - pd * uy;
  let nz = pole.z - pd * uz;
  let nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-9) {
    // pole along the line: any perpendicular in the sagittal (y–z) plane
    nx = 0;
    ny = -uz;
    nz = uy;
    nl = Math.hypot(ny, nz) || 1;
  }
  nx /= nl;
  ny /= nl;
  nz /= nl;
  const along = (a * a - b * b + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, a * a - along * along));
  return {
    knee: { x: root.x + ux * along + nx * h, y: root.y + uy * along + ny * h, z: root.z + uz * along + nz * h },
    end: { x: root.x + ux * dc, y: root.y + uy * dc, z: root.z + uz * dc },
  };
}

/**
 * The neck carriage (radians, + = nose up) that lifts the eyes from their bind height to `targetY`
 * by turning about the neck base in the sagittal plane: `eye` and `base` as (y, z) of the model
 * frame. Clamped to [−0.3, 0.6] (and to what the neck can reach).
 */
export function carriageFor(base: { y: number; z: number }, eye: { y: number; z: number }, targetY: number): number {
  const dy = eye.y - base.y;
  const dz = eye.z - base.z;
  const r = Math.hypot(dy, dz);
  if (!(r > 1e-9) || !Number.isFinite(targetY)) return 0;
  const want = Math.max(-1, Math.min(1, (targetY - base.y) / r));
  const up = Math.asin(want) - Math.atan2(dy, dz);
  return Math.max(-0.3, Math.min(0.6, up));
}

/** A smooth 0..1..0 envelope over a one-shot of `dur` seconds (attack `att` s, then a decay). */
export function shotEnvelope(t: number, dur: number, att = 0.06): number {
  if (!(t >= 0) || t >= dur) return 0;
  if (t < att) return t / att;
  const k = (t - att) / Math.max(1e-6, dur - att);
  return (1 - k) * (1 - k);
}
