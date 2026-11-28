/**
 * "Unauffällig" (docs/IDEAS-ROUND11.md §2.6): the court's rules, pure (no three.js, no DOM;
 * unit-tested in tests/court.test.ts). The system (./index.ts) feeds them what the player does
 * and what each watcher sees.
 *
 * - Tells: things a stranger does that a courtier would not (the hi-vis vest, running, the staff,
 *   taking something). Each is a rate (+x per second while seen) or an instant (+x at once).
 * - Suspicion: one value per watcher, 0..1. It rises only while the watcher sees the player inside
 *   a court zone (or during an inspection) doing a tell; else it decays at DECAY per second.
 * - Stages: 0.35 "Blick" (the head turns) → 0.7 "Misstrauen" (a barked line) → 1.0 "Aufgefallen"
 *   (escorted out: lossless).
 * - Zones scale the rates (the Orangerie teaches at ×0.6; the Ehrenhof is ×0.5 once admitted); an
 *   inspection ring triples them. Instants are never scaled: a blow struck in view is always 1.0.
 */

/**
 * Every tell of the design. `mvp: true` ones are detected now; the others are designed (rates from
 * §2.6) and slot in by adding their detection to `activeTells` — the rest of the chain takes them
 * as they are.
 */
export type TellId = 'hivis' | 'running' | 'staff' | 'take' | 'throw' | 'dodge' | 'lantern' | 'lawn' | 'place' | 'crouch' | 'tape' | 'linger';

export interface TellDef {
  id: TellId;
  /** Suspicion per second while seen (rate tells). */
  rate: number;
  /** Suspicion added at once (instant tells), never scaled by zone or ring. */
  instant?: number;
  /** Rate tells: full rate within this distance (m), half beyond it. */
  near?: number;
  /** Detected in the MVP. */
  mvp: boolean;
}

export const TELLS: Record<TellId, TellDef> = {
  /** No `disguise.coat`: the vest glows; full in 1.2 s within 10 m. */
  hivis: { id: 'hivis', rate: 1 / 1.2, near: 10, mvp: true },
  /** Speed ≥ RUN_SPEED (the old guard rule "wache-rennen"). */
  running: { id: 'running', rate: 0.6, mvp: true },
  /** Lock-on or a Wuchthieb charge in the last STAFF_WINDOW s: +1.0/s; a blow (attack) is instant 1.0. */
  staff: { id: 'staff', rate: 1.0, instant: 1.0, mvp: true },
  /** A pickup flagged `unseen` taken in view ('court:take'). */
  take: { id: 'take', rate: 0, instant: 1.0, mvp: true },
  /**
   * A chestnut thrown in view ('forage:throw'): a long look at once, not yet an escort. Throw from
   * outside the fans. (A chestnut that strikes a watcher adds `DISTRACT.hit` whatever it sees.)
   */
  throw: { id: 'throw', rate: 0, instant: 0.45, mvp: true },
  // ---- LATER (designed, not detected yet) ----
  dodge: { id: 'dodge', rate: 0, instant: 0.6, mvp: false },
  lantern: { id: 'lantern', rate: 0.5, mvp: false },
  lawn: { id: 'lawn', rate: 0.6, mvp: false },
  place: { id: 'place', rate: 0.8, mvp: false },
  crouch: { id: 'crouch', rate: 0.3, mvp: false },
  tape: { id: 'tape', rate: 0.4, mvp: false },
  linger: { id: 'linger', rate: 0.3, mvp: false },
};

/** Decay per second while a watcher sees no tell. */
export const DECAY = 0.25;
export const BLICK = 0.35;
export const MISSTRAUEN = 0.7;
export const AUFGEFALLEN = 1.0;
/** Hysteresis (a falling value leaves a stage this far below its threshold): no caption flicker. */
export const STAGE_HYST = 0.05;
/** Running: the existing guard threshold (story beat wache-rennen). */
export const RUN_SPEED = 4.8;
/** Staff in hand: a lock-on / charge counts this many seconds. */
export const STAFF_WINDOW = 4;
/** Inspection: within this distance of an inspector, hold E this long, then the ring runs this long at ×RING_MUL. */
export const INSPECT_R = 4;
export const INSPECT_HOLD = 1;
export const RING_S = 2.5;
export const RING_MUL = 3;
/** Ejection: the fade to black before the player stands at the exit (s). */
export const EJECT_FADE = 0.6;

export type Stage = 0 | 1 | 2 | 3;
export const STAGE_NAMES = ['ruhig', 'blick', 'misstrauen', 'aufgefallen'] as const;
export type StageName = (typeof STAGE_NAMES)[number];

/** What the player does this tick (the system reads it from player, input, combat events, flags). */
export interface PlayerSignals {
  /** `disguise.coat` is set (the court costume). */
  coat: boolean;
  /** Horizontal speed (m/s). */
  speed: number;
  /** Seconds since the last lock-on / Wuchthieb charge (Infinity: never). */
  staffAgo: number;
  /** A blow was struck this tick. */
  attacked: boolean;
  /** An `unseen` pickup was taken this tick. */
  took: boolean;
  /** A chestnut left the hand this tick. */
  threw?: boolean;
}

export interface TellHit {
  id: TellId;
  /** 'rate': per second; 'instant': once, this tick. */
  kind: 'rate' | 'instant';
}

/** The tells the player shows this tick (MVP detection). */
export function activeTells(p: PlayerSignals): TellHit[] {
  const out: TellHit[] = [];
  if (p.attacked) out.push({ id: 'staff', kind: 'instant' });
  if (p.took) out.push({ id: 'take', kind: 'instant' });
  if (p.threw) out.push({ id: 'throw', kind: 'instant' });
  if (!p.coat) out.push({ id: 'hivis', kind: 'rate' });
  if (p.speed >= RUN_SPEED) out.push({ id: 'running', kind: 'rate' });
  if (!p.attacked && p.staffAgo <= STAFF_WINDOW) out.push({ id: 'staff', kind: 'rate' });
  return out;
}

/** Per-second contribution of a rate tell at distance `dist` (before zone / ring multipliers). */
export function tellRate(id: TellId, dist: number): number {
  const d = TELLS[id];
  if (d.near !== undefined && dist > d.near) return d.rate * 0.5;
  return d.rate;
}

export interface WatchStep {
  level: number;
  /** The tell that raised the value most this tick (null: it fell or stayed). */
  tell: TellId | null;
}

/**
 * One tick of one watcher. `sees`: the player is in its fan, in line of sight, and its tells
 * count here (in a court zone or inside an inspection ring). `mul`: zone × ring multiplier.
 */
export function stepSuspicion(level: number, hits: readonly TellHit[], sees: boolean, dist: number, mul: number, dt: number): WatchStep {
  if (!sees || hits.length === 0) return { level: Math.max(0, level - DECAY * dt), tell: null };
  let v = level;
  let best: TellId | null = null;
  let bestAdd = 0;
  for (const h of hits) {
    const add = h.kind === 'instant' ? (TELLS[h.id].instant ?? 0) : tellRate(h.id, dist) * mul * dt;
    v += add;
    if (add > bestAdd) {
      bestAdd = add;
      best = h.id;
    }
  }
  return { level: Math.min(1, Math.max(0, v)), tell: best };
}

/** The stage of a value, given the previous stage (falling values keep a stage until STAGE_HYST below it). */
export function stageOf(level: number, prev: Stage = 0): Stage {
  const up: Stage = level >= AUFGEFALLEN ? 3 : level >= MISSTRAUEN ? 2 : level >= BLICK ? 1 : 0;
  if (up >= prev) return up;
  const th = [0, BLICK, MISSTRAUEN, AUFGEFALLEN][prev]!;
  return level > th - STAGE_HYST ? prev : up;
}

/** Zone multipliers (zones.ts): `mul`, and `admittedMul` once `court.admitted` is set. */
export function zoneMul(zone: { mul: number; admittedMul?: number } | null, admitted: boolean, ring: boolean): number {
  if (!zone) return ring ? RING_MUL : 0;
  const z = admitted && zone.admittedMul !== undefined ? zone.admittedMul : zone.mul;
  return z * (ring ? RING_MUL : 1);
}

/**
 * Is a point inside a watcher's fan? Watcher at wx/wz looking along `yawDeg` (0 = north = −z,
 * 90 = east = +x), whole fan `fovDeg`, reach `range`.
 */
export function inFan(wx: number, wz: number, yawDeg: number, fovDeg: number, range: number, px: number, pz: number): { inside: boolean; dist: number } {
  const dx = px - wx;
  const dz = pz - wz;
  const dist = Math.hypot(dx, dz);
  if (dist > range) return { inside: false, dist };
  if (dist < 0.5) return { inside: true, dist };
  const y = (yawDeg * Math.PI) / 180;
  const cos = (dx * Math.sin(y) - dz * Math.cos(y)) / dist;
  return { inside: cos >= Math.cos(((fovDeg / 2) * Math.PI) / 180), dist };
}

/** Heading in degrees (0 = north, 90 = east) from a to b. */
export function yawDegToward(ax: number, az: number, bx: number, bz: number): number {
  return ((Math.atan2(bx - ax, -(bz - az)) * 180) / Math.PI + 360) % 360;
}

/** Smallest angle between two headings (degrees, 0..180). */
export function yawGap(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return d;
}

/** The player's costume (player:costume): the court coat in every past era once `disguise.coat` is set. */
export function costumeFor(coat: boolean, era: string): 'court' | 'default' {
  return coat && era !== 'today' ? 'court' : 'default';
}

/** What showing the letter leads to (Musterung): no coat → ejected, no letter → refused, else the ring. */
export function inspectOutcome(f: { coat: boolean; letter: boolean }): 'eject' | 'refuse' | 'ring' {
  if (!f.coat) return 'eject';
  if (!f.letter) return 'refuse';
  return 'ring';
}

/** The colour of a fan by suspicion (linear rgb): pale straw → orange → red. */
export function fanColour(level: number): [number, number, number] {
  const v = Math.max(0, Math.min(1, level));
  const pale: [number, number, number] = [0.98, 0.88, 0.45];
  const orange: [number, number, number] = [0.95, 0.42, 0.06];
  const red: [number, number, number] = [0.86, 0.06, 0.03];
  const [a, b, k] = v < MISSTRAUEN ? [pale, orange, v / MISSTRAUEN] : [orange, red, (v - MISSTRAUEN) / (1 - MISSTRAUEN)];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
