/**
 * Shy roe deer (design C5, bible t6): a pure, deterministic state machine. DOM- and three.js-free.
 *
 *   graze ──meter ≥ ALERT_AT──▶ alert (head up, the 1.5 s tell) ──meter full and tell over──▶ flee
 *     ▲                          │ meter ≤ CLEAR_AT (player froze / backed off)                 │ bound `shy.settle` m
 *     └──────────────────────────┘                                                              ▼
 *     └────────────── SETTLE_DWELL s calm ◀────────────────────────────────────────────── settled
 *   leave (scripted, after the photo) ──▶ gone
 *
 * The notice meter (0..1) rises with the player's stance noise and visibility (`STANCES`) inside
 * the notice radius and in line of sight. A crouched (or prone) player at crouch speed or slower
 * shrinks the radius to `notice × SNEAK_SCALE` (30 → 15 m), so a sneak reaches the 20–25 m photo
 * range without a rise. The meter fills faster when running, sprinting or walking upright within
 * `flee`. Standing still inside `flee` still builds suspicion. Freezing farther out, holding
 * still in a low stance or backing away lets it decay. Fleeing deer stop again and graze.
 *
 * A fawn (`follow: 'animal:<doe>'`) mirrors the doe's state and keeps a slot behind her, never
 * farther than FAWN_MAX. `stepDeerHerd` steps doe(s) first, then followers.
 *
 * Yaw: heading, `atan2(-dx, -dz)` (0 faces −z), the player / people / fauna convention.
 */
import { STANCES, type Stance } from '../../player/stance';
import type { AnimalEvent, AnimalLook, AnimalMotion, AnimalSpawnOp, DeerSave, ShyRadii } from './types';

/** Tuning (m, s, m/s, meter units per second). */
export const DEER = {
  /** C5 example radii (`shy`). settle = how far the deer bound before they stop. */
  NOTICE: 30,
  FLEE: 20,
  SETTLE: 25,
  /** A crouched, slow player scales the notice radius by this (C5). */
  SNEAK_SCALE: 0.5,
  /** "Crouch speed": sneaking means crouch / prone at or below this ground speed. */
  SNEAK_MAX_SPEED: STANCES.crouch.speed + 0.1,
  /** Above the upright walk (3.2) = running; above this = sprinting. */
  RUN_SPEED: STANCES.stand.speed + 0.5,
  SPRINT_SPEED: STANCES.stand.sprint - 1,
  /** Slower than this = frozen. */
  FREEZE_SPEED: 0.25,
  /** Moving away faster than this (m/s radial) = backing off. */
  BACKOFF_SPEED: 0.3,
  ALERT_AT: 0.5,
  CLEAR_AT: 0.2,
  /** The head-up tell before a flight (bible t6: 1.5 s warning). */
  TELL_S: 1.5,
  /** Rise rate for a perceived, moving player: RISE × stance (noise + visibility) / 2 × (0.5 + closeness). */
  RISE: 0.6,
  /** Upright + moving inside `flee`, or running. */
  FILL: 1.5,
  SPRINT_FILL: 2.5,
  /** Standing still inside the flee radius. */
  STAND_FILL: 0.75,
  /** Freezing / backing off. */
  DECAY: 0.5,
  /** Out of range or out of sight. */
  IDLE_DECAY: 0.25,
  /** A noise event of loudness 1 at the deer adds this much. */
  NOISE_GAIN: 0.8,
  /** Rustling leaves / wind (mask 1) reduce every rise by this fraction. */
  MASK_GAIN: 0.4,
  /** calm(): the meter is capped here and rises at CALM_RISE × the normal rate. */
  CALM_CAP: 0.9,
  CALM_RISE: 0.25,
  /** fauna v0 reh: walk 1.2 m/s, bounding run 8 m/s. */
  WALK: 1.2,
  BOUND: 8,
  /** After settling the deer stay watchful this long, then graze again. */
  SETTLE_DWELL: 4,
  SETTLE_METER: 0.35,
  /** Fawn: default slot distance behind the doe and the hard limit (C5: within 2 m). */
  FAWN_SPACING: 1.5,
  FAWN_MAX: 2,
  /** leave(): walk this far calmly, then gone. */
  LEAVE_DIST: 30,
} as const;

export type DeerState = 'graze' | 'alert' | 'flee' | 'settled' | 'leave' | 'gone';

export interface DeerFlight { fx: number; fz: number; tx: number; tz: number; by: 'player' | 'cue'; dist: number }

export interface Deer {
  readonly id: string;
  readonly look: AnimalLook;
  x: number;
  z: number;
  yaw: number;
  state: DeerState;
  /** Seconds in the current state. */
  t: number;
  /** Notice meter 0..1. */
  meter: number;
  /** Seconds of photo-mode calm left. */
  calm: number;
  /** '' = leads itself; 'animal:<id>' = follows that deer. */
  follow: string;
  spacing: number;
  shy: ShyRadii;
  flee: DeerFlight | null;
  /** leave() target. */
  away: { x: number; z: number } | null;
  /** Player distance last step (NaN = unknown) for the back-off test. */
  lastDist: number;
  motion: AnimalMotion;
}

export interface DeerPlayer {
  x: number;
  z: number;
  /** Ground speed m/s. */
  speed: number;
  stance: Stance;
}

export interface DeerNoise {
  x: number;
  z: number;
  /** 0..1 */
  loud: number;
}

export interface DeerInput {
  player: DeerPlayer;
  /** Line of sight deer → player (the integration ray-marches `hunt/perception.ts` lineOfSight). Default true. */
  los?: boolean;
  /** Noise events this step (a dropped branch, a bark, a shout). They count without line of sight. */
  noise?: DeerNoise[];
  /** 0..1 masking (wind in the leaves, bible: "das Rauschen des Laubs hilft"). */
  mask?: number;
  /** Can a deer stand here? (water, buildings: no). Default: everywhere. */
  walkable?(x: number, z: number): boolean;
}

export const headingOf = (dx: number, dz: number): number => Math.atan2(-dx, -dz);
const DEG = Math.PI / 180;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function createDeer(op: AnimalSpawnOp, at?: { x: number; z: number; yaw?: number }): Deer {
  const look: AnimalLook = op.look === 'kitz' ? 'kitz' : 'ricke';
  const x = op.x ?? at?.x ?? 0;
  const z = op.z ?? at?.z ?? 0;
  const yaw = op.yaw !== undefined ? op.yaw * DEG : (at?.yaw ?? 0);
  const follow = op.follow ?? '';
  const d: Deer = {
    id: op.id,
    look,
    x,
    z,
    yaw,
    state: 'graze',
    t: 0,
    meter: 0,
    calm: 0,
    follow,
    spacing: op.spacing ?? DEER.FAWN_SPACING,
    shy: { ...(op.shy ?? { notice: DEER.NOTICE, flee: DEER.FLEE, settle: DEER.SETTLE }) },
    flee: null,
    away: null,
    lastDist: NaN,
    motion: { tx: x, tz: z, speed: 0, yaw, clip: 'graze' },
  };
  return d;
}

/** Whether the player counts as sneaking (crouched or prone, at crouch speed or slower). */
export function isSneaking(p: DeerPlayer): boolean {
  return p.stance !== 'stand' && p.speed <= DEER.SNEAK_MAX_SPEED;
}

/** The radius inside which this player is perceived at all. */
export function noticeRadius(shy: ShyRadii, p: DeerPlayer): number {
  return isSneaking(p) ? shy.notice * DEER.SNEAK_SCALE : shy.notice;
}

/** Meter change per second for the player alone (no noise events, no calm). */
export function meterRate(shy: ShyRadii, dist: number, radial: number, input: DeerInput): number {
  const p = input.player;
  const r = noticeRadius(shy, p);
  if (dist > r || input.los === false) return -DEER.IDLE_DECAY;
  if (radial > DEER.BACKOFF_SPEED) return -DEER.DECAY;
  const m = 1 - DEER.MASK_GAIN * clamp01(input.mask ?? 0);
  if (p.speed < DEER.FREEZE_SPEED) return p.stance === 'stand' && dist <= shy.flee ? DEER.STAND_FILL * m : -DEER.DECAY;
  if (p.speed > DEER.SPRINT_SPEED) return DEER.SPRINT_FILL * m;
  if (p.speed > DEER.RUN_SPEED) return DEER.FILL * m;
  if (p.stance === 'stand' && dist <= shy.flee) return DEER.FILL * m;
  const s = STANCES[p.stance];
  return DEER.RISE * ((s.noise + s.visibility) / 2) * (0.5 + (1 - dist / r)) * m;
}

/** Photo-mode hook (C3): while the phone is up the alert is soothed and the deer do not bolt (running breaks it). */
export function calmDeer(d: Deer, seconds: number): void {
  d.calm = Math.max(d.calm, seconds);
}

/** Scripted startle (debug `kq.animals.alert`, a story cue): bolt away from `from` now. */
export function startleDeer(d: Deer, from: { x: number; z: number }, walkable?: DeerInput['walkable']): AnimalEvent[] {
  const out: AnimalEvent[] = [];
  if (d.state === 'flee' || d.state === 'leave' || d.state === 'gone') return out;
  startFlee(d, from, 'cue', walkable, out);
  return out;
}

/** Walk calmly away (after the photo cinematic) and end as 'gone'. Default direction: straight ahead. */
export function leaveDeer(d: Deer, toward?: { x: number; z: number }): void {
  let dx = toward ? toward.x - d.x : -Math.sin(d.yaw);
  let dz = toward ? toward.z - d.z : -Math.cos(d.yaw);
  const l = Math.hypot(dx, dz) || 1;
  dx /= l;
  dz /= l;
  d.state = 'leave';
  d.t = 0;
  d.flee = null;
  d.away = { x: d.x + dx * DEER.LEAVE_DIST, z: d.z + dz * DEER.LEAVE_DIST };
}

const FLEE_ANGLES = [0, 30, -30, 60, -60, 90, -90, 120, -120].map((a) => a * DEG);

function startFlee(d: Deer, from: { x: number; z: number }, by: 'player' | 'cue', walkable: DeerInput['walkable'], out: AnimalEvent[]): void {
  let dx = d.x - from.x;
  let dz = d.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-3) {
    dx = Math.sin(d.yaw); // straight back
    dz = Math.cos(d.yaw);
  } else {
    dx /= dist;
    dz /= dist;
  }
  const len = d.shy.settle;
  let tx = d.x + dx * len;
  let tz = d.z + dz * len;
  if (walkable) {
    for (const a of FLEE_ANGLES) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const ux = dx * c - dz * s;
      const uz = dx * s + dz * c;
      const ex = d.x + ux * len;
      const ez = d.z + uz * len;
      if (walkable(ex, ez) && walkable(d.x + ux * len * 0.5, d.z + uz * len * 0.5)) {
        tx = ex;
        tz = ez;
        break;
      }
    }
  }
  d.state = 'flee';
  d.t = 0;
  d.meter = 1;
  d.flee = { fx: d.x, fz: d.z, tx, tz, by, dist: Math.round(dist * 10) / 10 };
  d.yaw = headingOf(tx - d.x, tz - d.z);
  out.push({ type: 'animal:fled', id: d.id, by, dist: d.flee.dist });
}

/** Move toward (tx, tz) at most `step` m; true when there. */
function moveTo(d: Deer, tx: number, tz: number, step: number): boolean {
  const dx = tx - d.x;
  const dz = tz - d.z;
  const l = Math.hypot(dx, dz);
  if (l <= step || l < 1e-6) {
    d.x = tx;
    d.z = tz;
    return true;
  }
  d.x += (dx / l) * step;
  d.z += (dz / l) * step;
  d.yaw = headingOf(dx, dz);
  return false;
}

/** One step of a deer that leads itself (a doe, or a fawn without its doe). */
export function stepDeer(d: Deer, dt: number, input: DeerInput, out: AnimalEvent[] = []): AnimalEvent[] {
  const p = input.player;
  const dist = Math.hypot(p.x - d.x, p.z - d.z);
  const radial = Number.isNaN(d.lastDist) || dt <= 0 ? 0 : (dist - d.lastDist) / dt;
  d.lastDist = dist;
  d.t += dt;
  const running = p.speed > DEER.RUN_SPEED;
  const calm = d.calm > 0 && !running;

  if (d.state === 'graze' || d.state === 'alert' || d.state === 'settled') {
    let rate = meterRate(d.shy, dist, radial, input);
    if (calm && rate > 0) rate *= DEER.CALM_RISE;
    let m = d.meter + rate * dt;
    if (input.noise) {
      const mk = 1 - DEER.MASK_GAIN * clamp01(input.mask ?? 0);
      for (const n of input.noise) {
        const dn = Math.hypot(n.x - d.x, n.z - d.z);
        m += clamp01(n.loud) * DEER.NOISE_GAIN * Math.max(0, 1 - dn / d.shy.notice) * mk * (calm ? DEER.CALM_RISE : 1);
      }
    }
    d.meter = clamp01(calm ? Math.min(m, DEER.CALM_CAP) : m);

    if (d.state === 'graze') {
      if (d.meter >= DEER.ALERT_AT) toAlert(d, out);
    } else if (d.state === 'settled') {
      if (d.meter >= DEER.ALERT_AT && d.t > dt) toAlert(d, out);
      else if (d.t >= DEER.SETTLE_DWELL) {
        d.state = 'graze';
        d.t = 0;
      }
    } else {
      if (d.meter >= 1 && d.t >= DEER.TELL_S && !calm) startFlee(d, p, 'player', input.walkable, out);
      else if (d.meter <= DEER.CLEAR_AT) {
        d.state = 'graze';
        d.t = 0;
      }
    }
  } else if (d.state === 'flee' && d.flee) {
    if (moveTo(d, d.flee.tx, d.flee.tz, DEER.BOUND * dt)) {
      d.state = 'settled';
      d.t = 0;
      d.meter = DEER.SETTLE_METER;
      d.flee = null;
      d.yaw = headingOf(p.x - d.x, p.z - d.z); // look back at what startled them
      out.push({ type: 'animal:settled', id: d.id });
    }
  } else if (d.state === 'leave' && d.away) {
    if (moveTo(d, d.away.x, d.away.z, DEER.WALK * dt)) {
      d.state = 'gone';
      d.t = 0;
      d.away = null;
    }
  }
  d.calm = Math.max(0, d.calm - dt);
  updateMotion(d, p);
  return out;
}

function toAlert(d: Deer, out: AnimalEvent[]): void {
  d.state = 'alert';
  d.t = 0;
  out.push({ type: 'animal:alert', id: d.id });
}

function updateMotion(d: Deer, p: { x: number; z: number }): void {
  const m = d.motion;
  m.tx = d.x;
  m.tz = d.z;
  m.speed = 0;
  switch (d.state) {
    case 'graze':
      m.clip = 'graze';
      break;
    case 'alert':
      d.yaw = headingOf(p.x - d.x, p.z - d.z);
      m.clip = 'alert';
      break;
    case 'flee':
      if (d.flee) {
        m.tx = d.flee.tx;
        m.tz = d.flee.tz;
      }
      m.speed = DEER.BOUND;
      m.clip = 'run';
      break;
    case 'settled':
      m.clip = d.t < DEER.TELL_S ? 'alert' : 'idle';
      break;
    case 'leave':
      if (d.away) {
        m.tx = d.away.x;
        m.tz = d.away.z;
      }
      m.speed = DEER.WALK;
      m.clip = 'walk';
      break;
    case 'gone':
      m.clip = 'idle';
      break;
  }
  m.yaw = d.yaw;
}

/** The fawn's slot behind (and a little beside) its leader. */
export function fawnSlot(leader: Deer, spacing: number): { x: number; z: number } {
  const fx = -Math.sin(leader.yaw);
  const fz = -Math.cos(leader.yaw);
  const rx = Math.cos(leader.yaw);
  const rz = -Math.sin(leader.yaw);
  return { x: leader.x - fx * spacing + rx * 0.4, z: leader.z - fz * spacing + rz * 0.4 };
}

/** One step of a follower: mirror the leader's transitions (own events), keep the slot within FAWN_MAX. */
export function stepFollower(f: Deer, leader: Deer, dt: number, input: DeerInput, out: AnimalEvent[] = []): AnimalEvent[] {
  const p = input.player;
  f.lastDist = Math.hypot(p.x - f.x, p.z - f.z);
  f.t += dt;
  if (leader.state !== f.state) {
    const prev = f.state;
    f.state = leader.state;
    f.t = 0;
    if (f.state === 'alert' && prev !== 'alert') out.push({ type: 'animal:alert', id: f.id });
    else if (f.state === 'flee') {
      const by = leader.flee?.by ?? 'player';
      const dist = Math.round(f.lastDist * 10) / 10;
      f.flee = { fx: f.x, fz: f.z, tx: leader.flee?.tx ?? f.x, tz: leader.flee?.tz ?? f.z, by, dist };
      out.push({ type: 'animal:fled', id: f.id, by, dist });
    } else if (f.state === 'settled' && prev === 'flee') out.push({ type: 'animal:settled', id: f.id });
    if (f.state !== 'flee') f.flee = null;
  }
  f.meter = leader.meter;
  f.calm = leader.calm;
  // slot keeping
  const slot = fawnSlot(leader, Math.min(f.spacing, DEER.FAWN_MAX));
  const toSlot = Math.hypot(slot.x - f.x, slot.z - f.z);
  const lead = leader.motion.speed;
  const speed = toSlot < 0.05 ? 0 : Math.min(DEER.BOUND * 1.15, Math.max(lead, DEER.WALK, toSlot * 2));
  if (speed > 0) moveTo(f, slot.x, slot.z, speed * dt);
  const dx = f.x - leader.x;
  const dz = f.z - leader.z;
  const l = Math.hypot(dx, dz);
  if (l > DEER.FAWN_MAX) {
    f.x = leader.x + (dx / l) * DEER.FAWN_MAX;
    f.z = leader.z + (dz / l) * DEER.FAWN_MAX;
  }
  const m = f.motion;
  m.tx = slot.x;
  m.tz = slot.z;
  m.speed = speed;
  if (speed < 0.2) {
    f.yaw = f.state === 'alert' ? headingOf(p.x - f.x, p.z - f.z) : leader.yaw;
  }
  m.yaw = f.yaw;
  m.clip = speed >= 0.2 ? (speed > DEER.WALK * 2 ? 'run' : 'walk') : leader.motion.clip;
  return out;
}

/** The leader id of a follower ('animal:ricke' → 'ricke'), or '' for a self-led deer. */
export function leaderId(d: Pick<Deer, 'follow'>): string {
  return d.follow?.startsWith('animal:') ? d.follow.slice(7) : '';
}

/** Step all deer: self-led first, then followers whose leader has been stepped (chains allowed). */
export function stepDeerHerd(herd: readonly Deer[], dt: number, input: DeerInput): AnimalEvent[] {
  const out: AnimalEvent[] = [];
  const byId = new Map(herd.map((d) => [d.id, d]));
  const done = new Set<string>();
  const pending: Deer[] = [];
  for (const d of herd) {
    const lid = leaderId(d);
    if (!lid || !byId.has(lid) || lid === d.id) {
      stepDeer(d, dt, input, out);
      done.add(d.id);
    } else pending.push(d);
  }
  let guard = pending.length + 1;
  while (pending.length && guard-- > 0) {
    for (let i = 0; i < pending.length; i++) {
      const f = pending[i]!;
      const lead = byId.get(leaderId(f))!;
      if (!done.has(lead.id)) continue;
      stepFollower(f, lead, dt, input, out);
      done.add(f.id);
      pending.splice(i--, 1);
    }
  }
  for (const d of pending) stepDeer(d, dt, input, out); // cycles: lead themselves
  return out;
}

/** Calm a whole herd (photo mode): followers mirror their leader anyway. */
export function calmHerd(herd: readonly Deer[], seconds: number): void {
  for (const d of herd) calmDeer(d, seconds);
}

/** follow / despawn requests for a deer; returns false for ops a deer does not take (run, lie). */
export function applyDeerRequest(d: Deer, req: { op: string; follow?: string; spacing?: number }): boolean {
  if (req.op === 'follow') {
    d.follow = req.follow ?? '';
    if (req.spacing !== undefined) d.spacing = req.spacing;
    return true;
  }
  return req.op === 'despawn';
}

export function serializeDeer(d: Deer): DeerSave {
  const s: DeerSave = {
    id: d.id,
    look: d.look,
    x: d.x,
    z: d.z,
    yaw: d.yaw || 0, // no -0 in the save
    state: d.state,
    t: d.t,
    meter: d.meter,
    calm: d.calm,
    follow: d.follow,
    spacing: d.spacing,
    shy: { ...d.shy },
  };
  if (d.flee) s.flee = { ...d.flee };
  if (d.away) s.away = { ...d.away };
  return s;
}

const DEER_STATES: readonly DeerState[] = ['graze', 'alert', 'flee', 'settled', 'leave', 'gone'];

function hasDeparture(deer: DeerSave, herd: readonly DeerSave[]): boolean {
  const seen = new Set<string>();
  let current = deer;
  while (current.state === 'leave' && !seen.has(current.id)) {
    seen.add(current.id);
    const id = leaderId(current);
    const leader = id && id !== current.id ? herd.find((other) => other.id === id) : undefined;
    if (!leader) return Boolean(current.away);
    current = leader;
  }
  return false;
}

export function restoreDeer(s: DeerSave, herd: readonly DeerSave[] = []): Deer {
  const d = createDeer({ op: 'spawn', id: s.id, kind: 'reh', look: s.look, x: s.x, z: s.z, follow: s.follow, spacing: s.spacing, shy: s.shy });
  d.yaw = s.yaw;
  d.state = DEER_STATES.includes(s.state as DeerState) ? (s.state as DeerState) : 'graze';
  d.t = s.t;
  d.meter = s.meter;
  d.calm = s.calm;
  d.flee = s.flee ? { ...s.flee } : null;
  d.away = s.away ? { ...s.away } : null;
  if (d.state === 'flee' && !d.flee) d.state = 'settled';
  if (d.state === 'leave' && !hasDeparture(s, herd)) d.state = 'gone';
  d.motion.yaw = d.yaw;
  return d;
}
