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
 * What a watcher can read from a distance (TASK-080), in the order it escalates:
 *  - **glance**: while grazing she lifts her head every few seconds (the clip only; still 'graze');
 *  - **alert**: head up and a look at what she noticed (`motion.gaze`): the player, or the spot a
 *    noise came from (`world:noise`, a thrown chestnut) for `LOOK_S` seconds. The body stays as it
 *    stands and turns only as far as the neck needs. An upright walker is noticed early
 *    (`FAR_RISE`), but outside the flee radius the meter stops at `HOLD_CAP`: she watches;
 *  - **step**: at `STEP_AT` she takes one step aside, away from the player, and watches again;
 *  - **flight**: meter full after the tell, a scripted startle, or a hit (`hitDeer`, cause 'hit').
 *    The flight ends on open ground where it can (`DeerInput.clutter`).
 * A noise alone turns her head, it never fills the meter (`NOISE_CAP`).
 *
 * A fawn (`follow: 'animal:<doe>'`) mirrors the doe's state and keeps a slot behind her, never
 * farther than FAWN_MAX. `stepDeerHerd` steps doe(s) first, then followers.
 *
 * Yaw: heading, `atan2(-dx, -dz)` (0 faces −z), the player / people / fauna convention.
 */
import { allOf, finiteOr, isRecord } from '../../core/saved';
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
  /** Noises alone raise the meter no further than this: they turn her head, they do not make her bolt. */
  NOISE_CAP: 0.9,
  /** A noise this strong at the deer (loudness × nearness × masking) makes her look toward it … */
  LOOK_GAIN: 0.4,
  /** … for this long (s): time to raise the phone, zoom and shoot. */
  LOOK_S: 8,
  /** Upright and moving between the flee and the notice radius: noticed within about a second. */
  FAR_RISE: 0.6,
  /** Outside the flee radius an unhurried player fills the meter no further: she watches. */
  HOLD_CAP: 0.9,
  /** In an alert the meter reaching this (after this many seconds of looking) is worth one step aside. */
  STEP_AT: 0.75,
  STEP_AFTER: 0.4,
  /** The step: metres, and its angle off the line straight away from the player (radians). */
  STEP_LEN: 1.4,
  STEP_TURN: (50 * Math.PI) / 180,
  /** Alert: the body turns only until what she watches is within this of straight ahead (the neck does the rest). */
  HEAD_TURN: (60 * Math.PI) / 180,
  /** Grazing: every `GLANCE_EVERY` s the head comes up for `GLANCE_S` s. */
  GLANCE_EVERY: 9,
  GLANCE_S: 2.4,
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

/** Why a deer bolted: the player came too fast, a script said so, or a thrown chestnut struck it. */
export type FleeCause = 'player' | 'cue' | 'hit';

export interface DeerFlight { fx: number; fz: number; tx: number; tz: number; by: FleeCause; dist: number }

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
  /** Alert: the spot of a noise she looks at for `heardT` more seconds (null: the player). Not saved. */
  heard: { x: number; z: number } | null;
  heardT: number;
  /** Metres of the step aside still to go, its direction, and whether this alert had its step. Not saved. */
  step: number;
  stepDir: { x: number; z: number };
  stepped: boolean;
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
  /** How overgrown the ground is there (0 = open): a flight ends where the deer can be seen again. */
  clutter?(x: number, z: number): number;
}

export const headingOf = (dx: number, dz: number): number => Math.atan2(-dx, -dz);
const DEG = Math.PI / 180;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

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
    shy: shyRadii(op.shy),
    flee: null,
    away: null,
    lastDist: NaN,
    heard: null,
    heardT: 0,
    step: 0,
    stepDir: { x: 0, z: 0 },
    stepped: false,
    motion: { tx: x, tz: z, speed: 0, yaw, clip: 'graze', gaze: null },
  };
  return d;
}

/** Radii from a spawn op or a save: each missing or non-positive radius takes its default. */
function shyRadii(shy: Partial<ShyRadii> | undefined): ShyRadii {
  const r = (v: unknown, fallback: number) => (finiteOr(v, 0) > 0 ? (v as number) : fallback);
  return { notice: r(shy?.notice, DEER.NOTICE), flee: r(shy?.flee, DEER.FLEE), settle: r(shy?.settle, DEER.SETTLE) };
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
  if (p.stance === 'stand') return (dist <= shy.flee ? DEER.FILL : DEER.FAR_RISE) * m;
  const s = STANCES[p.stance];
  return DEER.RISE * ((s.noise + s.visibility) / 2) * (0.5 + (1 - dist / r)) * m;
}

/** Photo-mode hook (C3): while the phone is up the alert is soothed and the deer do not bolt (running breaks it). */
export function calmDeer(d: Deer, seconds: number): void {
  d.calm = Math.max(d.calm, seconds);
}

/** Scripted startle (debug `kq.animals.alert`, a story cue): bolt away from `from` now. */
export function startleDeer(d: Deer, from: { x: number; z: number }, walkable?: DeerInput['walkable'], clutter?: DeerInput['clutter']): AnimalEvent[] {
  const out: AnimalEvent[] = [];
  if (d.state === 'flee' || d.state === 'leave' || d.state === 'gone') return out;
  startFlee(d, from, 'cue', { walkable, clutter }, out);
  return out;
}

/** A thrown chestnut struck the deer: bolt away from where it came from, cause 'hit'. */
export function hitDeer(d: Deer, from: { x: number; z: number }, walkable?: DeerInput['walkable'], clutter?: DeerInput['clutter']): AnimalEvent[] {
  const out: AnimalEvent[] = [];
  if (d.state === 'flee' || d.state === 'leave' || d.state === 'gone') return out;
  startFlee(d, from, 'hit', { walkable, clutter }, out);
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

function startFlee(d: Deer, from: { x: number; z: number }, by: FleeCause, ground: Pick<DeerInput, 'walkable' | 'clutter'>, out: AnimalEvent[]): void {
  const { walkable, clutter } = ground;
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
  if (walkable || clutter) {
    // straight away first, then wider: of the walkable directions the one that ends most in the open
    let best = Infinity;
    for (const a of FLEE_ANGLES) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const ux = dx * c - dz * s;
      const uz = dx * s + dz * c;
      const ex = d.x + ux * len;
      const ez = d.z + uz * len;
      if (walkable && !(walkable(ex, ez) && walkable(d.x + ux * len * 0.5, d.z + uz * len * 0.5))) continue;
      const k = clutter ? clutter(ex, ez) : 0;
      if (k >= best) continue;
      best = k;
      tx = ex;
      tz = ez;
      if (!(k > 0)) break;
    }
  }
  d.state = 'flee';
  d.t = 0;
  d.meter = 1;
  endWatch(d);
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
    // out there an unhurried player is watched, not fled from
    if (dist > d.shy.flee && !running) m = Math.min(m, Math.max(d.meter, DEER.HOLD_CAP));
    let heard: DeerNoise | null = null;
    if (input.noise) {
      const mk = 1 - DEER.MASK_GAIN * clamp01(input.mask ?? 0);
      let loudest = 0;
      for (const n of input.noise) {
        const dn = Math.hypot(n.x - d.x, n.z - d.z);
        const g = clamp01(n.loud) * Math.max(0, 1 - dn / d.shy.notice) * mk;
        m = Math.max(m, Math.min(m + g * DEER.NOISE_GAIN * (calm ? DEER.CALM_RISE : 1), DEER.NOISE_CAP));
        if (g >= DEER.LOOK_GAIN && g > loudest) {
          loudest = g;
          heard = n;
        }
      }
    }
    if (heard) {
      d.heard = { x: heard.x, z: heard.z };
      d.heardT = DEER.LOOK_S;
      m = Math.max(m, DEER.ALERT_AT + 0.1);
      out.push({ type: 'animal:heard', id: d.id, x: heard.x, z: heard.z });
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
      if (d.meter >= 1 && d.t >= DEER.TELL_S && !calm) startFlee(d, p, 'player', input, out);
      else if (d.meter <= DEER.CLEAR_AT && d.heardT <= 0) {
        d.state = 'graze';
        d.t = 0;
        endWatch(d);
      } else stepAside(d, p, dt, input);
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
  if (d.heardT > 0) {
    d.heardT = Math.max(0, d.heardT - dt);
    if (d.heardT <= 0) d.heard = null;
  }
  updateMotion(d, p);
  return out;
}

function toAlert(d: Deer, out: AnimalEvent[]): void {
  d.state = 'alert';
  d.t = 0;
  d.step = 0;
  d.stepped = false;
  out.push({ type: 'animal:alert', id: d.id });
}

/** The alert is over (grazing again, or bolting): nothing to look at, no step pending. */
function endWatch(d: Deer): void {
  d.heard = null;
  d.heardT = 0;
  d.step = 0;
  d.stepped = false;
}

/**
 * Alert, and the player keeps coming: one step aside per alert, at an angle away from the player
 * (to the side she already faces), so she ends quartering away and still watching.
 */
function stepAside(d: Deer, p: { x: number; z: number }, dt: number, input: DeerInput): void {
  if (!d.stepped && d.meter >= DEER.STEP_AT && d.t >= DEER.STEP_AFTER) {
    d.stepped = true;
    let ax = d.x - p.x;
    let az = d.z - p.z;
    const l = Math.hypot(ax, az) || 1;
    ax /= l;
    az /= l;
    const fx = -Math.sin(d.yaw);
    const fz = -Math.cos(d.yaw);
    let best = -Infinity;
    for (const turn of [DEER.STEP_TURN, -DEER.STEP_TURN]) {
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      const ux = ax * c - az * s;
      const uz = ax * s + az * c;
      if (input.walkable && !input.walkable(d.x + ux * DEER.STEP_LEN, d.z + uz * DEER.STEP_LEN)) continue;
      const along = ux * fx + uz * fz;
      if (along <= best) continue;
      best = along;
      d.stepDir = { x: ux, z: uz };
      d.step = DEER.STEP_LEN;
    }
  }
  if (d.step <= 0) return;
  const move = Math.min(d.step, DEER.WALK * dt);
  d.x += d.stepDir.x * move;
  d.z += d.stepDir.z * move;
  d.step -= move;
  d.yaw = headingOf(d.stepDir.x, d.stepDir.z);
  // her own step is not the player backing off
  d.lastDist = Math.hypot(p.x - d.x, p.z - d.z);
}

/** Turn the body only as far as the neck needs to keep (tx, tz) in view. */
function turnToWatch(d: Pick<Deer, 'x' | 'z' | 'yaw'>, tx: number, tz: number): void {
  if (Math.hypot(tx - d.x, tz - d.z) < 1e-3) return;
  const off = wrapPi(headingOf(tx - d.x, tz - d.z) - d.yaw);
  if (Math.abs(off) > DEER.HEAD_TURN) d.yaw = wrapPi(d.yaw + off - Math.sign(off) * DEER.HEAD_TURN);
}

/** What an alert deer looks at: the spot of a recent noise, else the player's head. */
function gazeOf(d: Pick<Deer, 'heard'>, p: DeerPlayer): { x: number; z: number; h: number } {
  if (d.heard) return { x: d.heard.x, z: d.heard.z, h: 0.2 };
  return { x: p.x, z: p.z, h: STANCES[p.stance].eye };
}

/** Grazing: head down, with a look around every `GLANCE_EVERY` s (`t` = seconds in the state). */
export function grazeClip(t: number): 'graze' | 'idle' {
  return t % DEER.GLANCE_EVERY >= DEER.GLANCE_EVERY - DEER.GLANCE_S ? 'idle' : 'graze';
}

function updateMotion(d: Deer, p: DeerPlayer): void {
  const m = d.motion;
  m.tx = d.x;
  m.tz = d.z;
  m.speed = 0;
  m.gaze = null;
  switch (d.state) {
    case 'graze':
      m.clip = grazeClip(d.t);
      break;
    case 'alert': {
      const g = gazeOf(d, p);
      m.gaze = g;
      m.clip = 'alert';
      if (d.step > 0) {
        m.tx = d.x + d.stepDir.x * d.step;
        m.tz = d.z + d.stepDir.z * d.step;
        m.speed = DEER.WALK;
      } else turnToWatch(d, g.x, g.z);
      break;
    }
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
      if (d.t < DEER.TELL_S) m.gaze = gazeOf({ heard: null }, p);
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
  // the fawn watches what the doe watches
  m.gaze = leader.motion.gaze ?? null;
  if (speed < 0.2) {
    if (f.state === 'alert' && m.gaze) turnToWatch(f, m.gaze.x, m.gaze.z);
    else f.yaw = leader.yaw;
  }
  m.yaw = f.yaw;
  m.clip = speed >= 0.2 ? (speed > DEER.WALK * 2 ? 'run' : 'walk') : leader.motion.clip;
  return out;
}

/** The leader id of a follower ('animal:ricke' → 'ricke'), or '' for a self-led deer. */
export function leaderId(d: Pick<Deer, 'follow'>): string {
  // (a saved herd is read before restore: `follow` may be anything there)
  return typeof d.follow === 'string' && d.follow.startsWith('animal:') ? d.follow.slice(7) : '';
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

const DEER_STATES = allOf<DeerState>()(['graze', 'alert', 'flee', 'settled', 'leave', 'gone']);

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
  const d = createDeer({
    op: 'spawn', id: s.id, kind: 'reh', look: s.look, x: finiteOr(s.x, 0), z: finiteOr(s.z, 0),
    follow: typeof s.follow === 'string' ? s.follow : undefined, spacing: finiteOr(s.spacing, DEER.FAWN_SPACING),
    shy: isRecord(s.shy) ? s.shy : undefined,
  });
  d.yaw = finiteOr(s.yaw, 0);
  d.state = DEER_STATES.includes(s.state as DeerState) ? (s.state as DeerState) : 'graze';
  d.t = finiteOr(s.t, 0);
  d.meter = finiteOr(s.meter, 0);
  d.calm = finiteOr(s.calm, 0);
  const f = s.flee;
  d.flee = isRecord(f) && [f.fx, f.fz, f.tx, f.tz].every(Number.isFinite) && (f.dist === undefined || Number.isFinite(f.dist)) ? { ...f, by: f.by === 'cue' || f.by === 'hit' ? f.by : 'player' } : null;
  d.away = isRecord(s.away) && Number.isFinite(s.away.x) && Number.isFinite(s.away.z) ? { x: s.away.x, z: s.away.z } : null;
  if (d.state === 'flee' && !d.flee) d.state = 'settled';
  if (d.state === 'leave' && !hasDeparture(s, herd)) d.state = 'gone';
  d.motion.yaw = d.yaw;
  return d;
}
