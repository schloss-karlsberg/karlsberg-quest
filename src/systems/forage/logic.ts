/**
 * Forage rules (docs/ACTION-RPG.md §7.1): PURE, no three.js, no DOM. Throwing a chestnut (the
 * aim, the arc, the bounces) and what a cut plant drops. The system (index.ts) wires this to the
 * input, the inventory, combat and the nature layers; tests drive it directly.
 */
import { finiteOr, isRecord } from '../../core/saved';
import { hashString, mulberry32 } from '../progression/logic';

export const NUT = 'item.kastanie';

export const THROW = {
  /** Farthest landing point (m, in plan from the hand). */
  range: 22,
  /** Nearest: a chestnut is never dropped on the thrower's own feet. */
  minRange: 2,
  /** m/s²: heavier than the world's, so the arc is short and easy to read. */
  gravity: 16,
  /** Seconds between two throws. */
  cooldown: 0.55,
  /** Drawn and collided radius (m): a chestnut as big as a fist, so it can be followed. */
  radius: 0.07,
  /** The hand: above the feet (standing / low stance), forward and to the right (m). */
  handUp: 1.45,
  handUpLow: 0.85,
  handFwd: 0.4,
  handRight: 0.28,
  /** Speed kept by a bounce: up, and along the ground. */
  bounce: 0.36,
  friction: 0.5,
  /** Ground bounces before it lies still. */
  bounces: 2,
  /** Seconds it lies there before it is gone. */
  rest: 1.1,
  /** Never longer in the air than this. */
  life: 5,
  /** Loudness (0..1) of the landing for animals and the pack. */
  loud: 0.7,
} as const;

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Seconds a throw over `d` m (in plan) stays in the air: near ones are quick, far ones lob. Never
 * under 0.55 s, so even a throw at the ground two steps ahead leaves the hand upwards.
 */
export function flightTime(d: number): number {
  return Math.min(1.25, Math.max(0.55, 0.47 + 0.036 * d));
}

/** Keep the landing point between `minRange` and `range` from the hand (in plan). */
export function clampAim(from: V3, to: V3, min: number = THROW.minRange, max: number = THROW.range): V3 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d >= min && d <= max) return { ...to };
  if (d < 1e-4) return { x: from.x, y: to.y, z: from.z - min };
  const k = (d < min ? min : max) / d;
  return { x: from.x + dx * k, y: to.y, z: from.z + dz * k };
}

/** The launch velocity that carries a chestnut from the hand to `to` in `flightTime` (gravity `g` down). */
export function solveThrow(from: V3, to: V3, g: number = THROW.gravity): { vx: number; vy: number; vz: number; t: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const t = flightTime(Math.hypot(dx, dz));
  return { vx: dx / t, vy: dy / t + 0.5 * g * t, vz: dz / t, t };
}

/** Points of the arc for the aim preview: `n` samples up to `t` s, written as x, y, z into `out`. */
export function arcPoints(from: V3, v: { vx: number; vy: number; vz: number }, t: number, n: number, out: Float32Array, g: number = THROW.gravity): void {
  for (let i = 0; i < n; i++) {
    const s = (t * (i + 1)) / n;
    out[i * 3] = from.x + v.vx * s;
    out[i * 3 + 1] = from.y + v.vy * s - 0.5 * g * s * s;
    out[i * 3 + 2] = from.z + v.vz * s;
  }
}

export interface Nut {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds since the throw. */
  age: number;
  bounces: number;
  /** Seconds lying still (-1: still moving). */
  rest: number;
  /** It struck something already: no second sting, no second noise. */
  spent: boolean;
  alive: boolean;
}

export function createNut(from: V3, v: { vx: number; vy: number; vz: number }): Nut {
  return { x: from.x, y: from.y, z: from.z, vx: v.vx, vy: v.vy, vz: v.vz, age: 0, bounces: 0, rest: -1, spent: false, alive: true };
}

export type NutEvent = 'bounce' | 'rest' | 'splash' | 'gone' | null;

/**
 * One fixed step of a chestnut in flight: gravity, then the ground. It bounces `THROW.bounces`
 * times, lies still for `THROW.rest` s and is gone; water swallows it at once.
 */
export function stepNut(n: Nut, dt: number, ground: (x: number, z: number) => number, water: (x: number, z: number) => boolean, g: number = THROW.gravity): NutEvent {
  if (!n.alive) return null;
  n.age += dt;
  if (n.rest >= 0) {
    n.rest += dt;
    if (n.rest >= THROW.rest) {
      n.alive = false;
      return 'gone';
    }
    return null;
  }
  if (n.age > THROW.life) {
    n.alive = false;
    return 'gone';
  }
  n.vy -= g * dt;
  n.x += n.vx * dt;
  n.y += n.vy * dt;
  n.z += n.vz * dt;
  const floor = ground(n.x, n.z) + THROW.radius;
  if (n.y > floor || n.vy > 0) return null;
  n.y = floor;
  if (water(n.x, n.z)) {
    n.alive = false;
    return 'splash';
  }
  n.bounces++;
  const up = -n.vy * THROW.bounce;
  if (n.bounces > THROW.bounces || up < 0.7) {
    n.vx = n.vy = n.vz = 0;
    n.rest = 0;
    return n.bounces === 1 ? 'bounce' : 'rest';
  }
  n.vy = up;
  n.vx *= THROW.friction;
  n.vz *= THROW.friction;
  return 'bounce';
}

/** Turn a chestnut back from an upright obstacle at o (a trunk, a body): it drops at its foot. */
export function deflectNut(n: Nut, ox: number, oz: number, keep = 0.25): void {
  let nx = n.x - ox;
  let nz = n.z - oz;
  const d = Math.hypot(nx, nz) || 1;
  nx /= d;
  nz /= d;
  const dot = n.vx * nx + n.vz * nz;
  if (dot < 0) {
    n.vx = (n.vx - 2 * dot * nx) * keep;
    n.vz = (n.vz - 2 * dot * nz) * keep;
  }
  n.vy = Math.min(n.vy, 1) * 0.5;
  n.spent = true;
}

// ---- what a cut plant gives -------------------------------------------------------------------

export const DROP = {
  /** Chance that a freshly cut fern, flower clump or low bush hides a chestnut. */
  chance: 0.1,
  /** Bad-luck protection: + per plant in a row that gave nothing, at most `dryMax` on top. */
  dryStep: 0.03,
  dryMax: 0.24,
  /** Outside the forest (tree cover below a half) the chance is this much smaller. */
  open: 0.5,
} as const;

export interface ForageSlice {
  /** Plants cut so far (the drop roll's counter). */
  cuts: number;
  /** Plants in a row that gave nothing. */
  dry: number;
  /** Chestnuts found under plants / thrown so far. */
  found: number;
  thrown: number;
  /** One-time hints already shown ('throw', 'cut'). */
  hints: string[];
}

export function createForageSlice(): ForageSlice {
  return { cuts: 0, dry: 0, found: 0, thrown: 0, hints: [] };
}

/** Fill what a saved slice lacks (older saves have none; a corrupt field falls back by itself). */
export function normalizeForage(raw: unknown): ForageSlice {
  const s = isRecord(raw) ? raw : {};
  const n = (v: unknown) => Math.max(0, Math.floor(finiteOr(v, 0)));
  return {
    cuts: n(s.cuts),
    dry: n(s.dry),
    found: n(s.found),
    thrown: n(s.thrown),
    hints: Array.isArray(s.hints) ? [...new Set(s.hints.filter((h): h is string => typeof h === 'string'))] : [],
  };
}

/** A plant's identity for the roll: its spot to the decimetre. */
export function plantKey(x: number, z: number): string {
  return `${Math.round(x * 10)}_${Math.round(z * 10)}`;
}

/** The chance the next cut plant drops a chestnut (pure; `forest` = tree cover 0..1 at the plant). */
export function dropChance(dry: number, forest = 1): number {
  return Math.min(1, (DROP.chance + Math.min(DROP.dryMax, dry * DROP.dryStep)) * (forest >= 0.5 ? 1 : DROP.open));
}

/**
 * Roll one freshly cut plant: seeded by the plant's spot and the cut counter, so the same play
 * gives the same finds. Counts the cut and the dry streak in the slice. True: a chestnut.
 */
export function rollDrop(slice: ForageSlice, key: string, forest = 1): boolean {
  const rng = mulberry32(hashString(key) ^ Math.imul(slice.cuts + 1, 0x9e3779b1));
  const hit = rng() < dropChance(slice.dry, forest);
  slice.cuts++;
  if (hit) {
    slice.dry = 0;
    slice.found++;
  } else slice.dry++;
  return hit;
}

/**
 * The circle a staff swing mows: a swing sweeps the half-disc ahead of the player (a circle of
 * half its reach, centred half-way out), a ring (`arcDeg` 300 and up) the whole disc around them.
 * Yaw as the player's: 0 faces −z.
 */
export function mowCircle(x: number, z: number, yaw: number, reach: number, arcDeg: number): { x: number; z: number; r: number } {
  if (arcDeg >= 300) return { x, z, r: reach };
  const r = reach * (arcDeg > 90 ? 0.58 : 0.5);
  return { x: x - Math.sin(yaw) * (reach - r), z: z - Math.cos(yaw) * (reach - r), r };
}
