/**
 * Pure key evaluation of a cinematic (no three.js, no DOM; tests/cinematic-keys.test.ts).
 *
 *  - `normalize(raw, files)` checks a play request defensively (it comes from JSON, a story cue or
 *    the console) and turns it into a `Plan`: keys with every field carried over from the key before,
 *    or an orbit; the request's flags with their defaults.
 *  - `poseAt(plan, t, snap, env, hold)` is the camera and the world's look at time t.
 *  - `stillsAt(plan, t)` maps the reduced-motion clock onto the source clock (first key, a dip
 *    through black, the last key; ≤ 3 s).
 *
 * Generalised from the endings' `stageAt` (src/systems/story/endings/stage.ts, copied, not shared:
 * the story owns that file): player-relative eye from a frozen snapshot, smooth easing, the look
 * keys fade / fog / sun / dark.
 */
import type { CineTarget, CinematicFile, CinematicKey, CinematicOrbit } from './types';

export const ID_RE = /^[a-z0-9][a-z0-9._-]*$/i;
const TARGET_RE = /^(npc|animal):[a-z0-9][a-z0-9._-]*$/i;
export const STILLS_MAX = 3;
/** Half width (s) of the dip through black between the two reduced-motion stills. */
export const STILLS_DIP = 0.4;
/** Default heights: an absolute eye, a point to look at, an orbit's eye over the ground. */
export const EYE_Y = 1.6;
export const LOOK_Y = 1.2;
export const ORBIT_Y = 3;
/** Never closer to the ground than this (m). */
export const GROUND_CLEAR = 0.25;
const DEG = Math.PI / 180;

export type Eye = NonNullable<CinematicKey['eye']>;
export type Look = NonNullable<CinematicKey['look']>;

/** A key with everything carried over from the keys before it (`eye` / `look` / `fov` stay undefined until a key sets them: the defaults below). */
export interface FilledKey {
  t: number;
  eye?: Eye;
  look?: Look;
  fov?: number;
  fade: number;
  fog: number;
  sun: number;
  dark: number;
  ease: 'smooth' | 'linear';
}

export interface Plan {
  id: string;
  keys: FilledKey[] | null;
  orbit: CinematicOrbit | null;
  /** Length on the normal clock (s). */
  seconds: number;
  skippable: boolean;
  lockInput: boolean;
  reduced: 'stills' | 'skip';
}

/** The player and the view at the cinematic's start (frozen: the shot does not swim). */
export interface Snapshot {
  /** Player feet. */
  x: number;
  y: number;
  z: number;
  /** Player yaw (rad, 0 = north / −z, + = left) and pitch (rad, + = up). */
  yaw: number;
  pitch: number;
  /** Eye height above the feet (m). */
  eye: number;
  /** The camera at the start: the default eye, and the default fov. */
  cam: { x: number; y: number; z: number; fov: number };
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Env {
  /** Ground height (m). */
  ground(x: number, z: number): number;
  /** A target's world point, null when it cannot be found (the look holds). */
  target(t: CineTarget): Vec3 | null;
}

export interface Pose {
  x: number;
  y: number;
  z: number;
  /** Camera yaw / pitch (rad, as the player's). */
  yaw: number;
  pitch: number;
  fov: number;
  fade: number;
  fog: number;
  sun: number;
  dark: number;
}

export type Normalized = { ok: true; plan: Plan } | { ok: false; id: string; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const optFin = (v: unknown) => v === undefined || fin(v);
export const smooth = (v: number): number => {
  const c = Math.max(0, Math.min(1, v));
  return c * c * (3 - 2 * c);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Shortest-path angle lerp (rad). */
export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function checkEye(e: unknown): string | null {
  if (!isObj(e)) return 'eye must be an object';
  if (e.rel !== undefined) {
    if (e.rel !== 'player') return `eye.rel must be "player"`;
    for (const k of ['back', 'up', 'right', 'turn']) if (!optFin(e[k])) return `eye.${k} must be a number`;
    return null;
  }
  if (!fin(e.x) || !fin(e.z) || !optFin(e.y)) return 'eye needs numeric x / z (y optional)';
  return null;
}

function checkLook(l: unknown): string | null {
  if (!isObj(l)) return 'look must be an object';
  if (l.target !== undefined) return typeof l.target === 'string' && (l.target === 'player' || TARGET_RE.test(l.target)) ? null : `look.target "${String(l.target)}" is not npc:<id>, animal:<id> or player`;
  if (l.pitch !== undefined) return fin(l.pitch) && optFin(l.yaw) ? null : 'look.pitch / look.yaw must be numbers';
  if (!fin(l.x) || !fin(l.z) || !optFin(l.y)) return 'look needs a target, numeric x / z or a pitch';
  return null;
}

/** Check and fill a key list (≥ 2 keys, t[0] = 0, strictly increasing, last t 0.5–60). */
export function fillKeys(keys: unknown): FilledKey[] | string {
  if (!Array.isArray(keys) || keys.length < 2) return 'keys needs at least 2 entries';
  const out: FilledKey[] = [];
  let prev: FilledKey = { t: 0, fade: 0, fog: 0, sun: 0, dark: 0, ease: 'smooth' };
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (!isObj(k)) return `keys[${i}] is not an object`;
    if (!fin(k.t)) return `keys[${i}].t must be a number`;
    if (i === 0 && k.t !== 0) return 'the first key must have t = 0';
    if (i > 0 && k.t <= prev.t) return `keys[${i}].t must be greater than ${prev.t}`;
    if (k.eye !== undefined) {
      const e = checkEye(k.eye);
      if (e) return `keys[${i}]: ${e}`;
    }
    if (k.look !== undefined) {
      const e = checkLook(k.look);
      if (e) return `keys[${i}]: ${e}`;
    }
    if (k.fov !== undefined && (!fin(k.fov) || k.fov < 15 || k.fov > 90)) return `keys[${i}].fov must be 15–90`;
    for (const f of ['fade', 'fog', 'sun', 'dark'] as const) if (k[f] !== undefined && (!fin(k[f]) || (k[f] as number) < 0 || (k[f] as number) > 1)) return `keys[${i}].${f} must be 0–1`;
    if (k.ease !== undefined && k.ease !== 'smooth' && k.ease !== 'linear') return `keys[${i}].ease must be smooth or linear`;
    const key = k as unknown as CinematicKey;
    const f: FilledKey = {
      t: key.t,
      eye: key.eye ?? prev.eye,
      look: key.look ?? prev.look,
      fov: key.fov ?? prev.fov,
      fade: key.fade ?? prev.fade,
      fog: key.fog ?? prev.fog,
      sun: key.sun ?? prev.sun,
      dark: key.dark ?? prev.dark,
      // the easing belongs to the move INTO this key: it does not carry over
      ease: key.ease ?? 'smooth',
    };
    out.push(f);
    prev = f;
  }
  const last = prev.t;
  if (last < 0.5 || last > 60) return `the last key's t must be 0.5–60 (is ${last})`;
  return out;
}

function checkOrbit(o: unknown): string | null {
  if (!isObj(o)) return 'orbit must be an object';
  if (!fin(o.x) || !fin(o.z)) return 'orbit needs numeric x / z';
  if (!fin(o.r) || o.r <= 0 || o.r > 500) return 'orbit.r must be 0–500';
  if (!fin(o.period) || o.period === 0 || Math.abs(o.period) > 3600) return 'orbit.period must be a non-zero number';
  if (!optFin(o.y)) return 'orbit.y must be a number';
  if (!fin(o.seconds) || o.seconds < 1 || o.seconds > 600) return 'orbit.seconds must be 1–600';
  return null;
}

/** Check a play request (any JSON) and resolve its `ref` from `files`. */
export function normalize(raw: unknown, files: Readonly<Record<string, CinematicFile>> = {}): Normalized {
  if (!isObj(raw)) return { ok: false, id: '?', error: 'the request is not an object' };
  const id = typeof raw.id === 'string' ? raw.id : '?';
  const bad = (error: string): Normalized => ({ ok: false, id, error });
  if (!ID_RE.test(id)) return bad(`id "${String(raw.id)}" is missing or malformed`);
  const kinds = (['keys', 'ref', 'orbit'] as const).filter((k) => raw[k] !== undefined);
  if (kinds.length !== 1) return bad(`exactly one of keys / ref / orbit (got ${kinds.length ? kinds.join(', ') : 'none'})`);
  if (raw.skippable !== undefined && typeof raw.skippable !== 'boolean') return bad('skippable must be a boolean');
  if (raw.lockInput !== undefined && typeof raw.lockInput !== 'boolean') return bad('lockInput must be a boolean');
  if (raw.reduced !== undefined && raw.reduced !== 'stills' && raw.reduced !== 'skip') return bad('reduced must be stills or skip');
  let src: Record<string, unknown> = raw;
  if (raw.ref !== undefined) {
    if (typeof raw.ref !== 'string' || !ID_RE.test(raw.ref)) return bad('ref must be a file id');
    const file = Object.prototype.hasOwnProperty.call(files, raw.ref) ? files[raw.ref] : undefined;
    if (!isObj(file)) return bad(`no content/cinematics/${raw.ref}.json`);
    const fk = (['keys', 'orbit'] as const).filter((k) => file[k] !== undefined);
    if (fk.length !== 1) return bad(`content/cinematics/${raw.ref}.json needs exactly one of keys / orbit`);
    src = file as Record<string, unknown>;
  }
  const flag = <T>(k: string, d: T): T => (raw[k] !== undefined ? raw[k] : src[k] !== undefined ? src[k] : d) as T;
  const skippable = flag('skippable', true);
  const lockInput = flag('lockInput', true);
  const reduced = flag<'stills' | 'skip'>('reduced', 'stills');
  if (typeof skippable !== 'boolean' || typeof lockInput !== 'boolean' || (reduced !== 'stills' && reduced !== 'skip')) return bad('bad flags in the ref file');
  if (src.keys !== undefined) {
    const keys = fillKeys(src.keys);
    if (typeof keys === 'string') return bad(keys);
    return { ok: true, plan: { id, keys, orbit: null, seconds: keys[keys.length - 1]!.t, skippable, lockInput, reduced } };
  }
  const e = checkOrbit(src.orbit);
  if (e) return bad(e);
  const orbit = { ...(src.orbit as CinematicOrbit) };
  return { ok: true, plan: { id, keys: null, orbit, seconds: orbit.seconds, skippable, lockInput, reduced } };
}

/** The camera eye of a key in world space (`undefined`: the camera where it was at the start). */
export function eyePoint(eye: Eye | undefined, snap: Snapshot, env: Env, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  if (!eye) {
    out.x = snap.cam.x;
    out.y = snap.cam.y;
    out.z = snap.cam.z;
    return out;
  }
  if ('rel' in eye) {
    const yaw = snap.yaw + (eye.turn ?? 0) * DEG;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const back = eye.back ?? 0;
    const right = eye.right ?? 0;
    out.x = snap.x - fx * back + rx * right;
    out.z = snap.z - fz * back + rz * right;
    out.y = Math.max(env.ground(out.x, out.z) + GROUND_CLEAR, snap.y + (eye.up ?? snap.eye));
    return out;
  }
  out.x = eye.x;
  out.z = eye.z;
  out.y = env.ground(eye.x, eye.z) + Math.max(GROUND_CLEAR, eye.y ?? EYE_Y);
  return out;
}

/** Yaw / pitch from `e` towards `p` (rad, as the player's). */
export function anglesTo(e: Vec3, p: Vec3, out: { yaw: number; pitch: number }): { yaw: number; pitch: number } {
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const dz = p.z - e.z;
  const h = Math.hypot(dx, dz);
  if (h < 1e-6 && Math.abs(dy) < 1e-6) return out;
  if (h > 1e-6) out.yaw = Math.atan2(-dx, -dz);
  out.pitch = Math.atan2(dy, h);
  return out;
}

const _p: Vec3 = { x: 0, y: 0, z: 0 };
/** The view of a look from eye `e`; false when a target cannot be found (the caller holds). */
function lookAngles(look: Look | undefined, eye: Eye | undefined, e: Vec3, snap: Snapshot, env: Env, out: { yaw: number; pitch: number }): boolean {
  if (!look) {
    out.yaw = snap.yaw + (eye && 'rel' in eye ? (eye.turn ?? 0) * DEG : 0);
    out.pitch = snap.pitch;
    return true;
  }
  if ('target' in look) {
    const p = env.target(look.target);
    if (!p || !fin(p.x) || !fin(p.y) || !fin(p.z)) return false;
    anglesTo(e, p, out);
    return true;
  }
  if ('pitch' in look) {
    out.yaw = look.yaw !== undefined ? -look.yaw * DEG : snap.yaw;
    out.pitch = look.pitch * DEG;
    return true;
  }
  _p.x = look.x;
  _p.z = look.z;
  _p.y = env.ground(look.x, look.z) + (look.y ?? LOOK_Y);
  anglesTo(e, _p, out);
  return true;
}

export function newPose(): Pose {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 70, fade: 0, fog: 0, sun: 0, dark: 0 };
}

const _a: Vec3 = { x: 0, y: 0, z: 0 };
const _b: Vec3 = { x: 0, y: 0, z: 0 };
const _la = { yaw: 0, pitch: 0 };
const _lb = { yaw: 0, pitch: 0 };

/**
 * The pose at time t (clamped to the plan). `hold` is the last view: a look target that cannot be
 * found keeps it (pass the previous frame's yaw / pitch).
 */
export function poseAt(plan: Plan, t: number, snap: Snapshot, env: Env, hold: { yaw: number; pitch: number }, out: Pose = newPose()): Pose {
  const tt = Math.max(0, Math.min(plan.seconds, fin(t) ? t : 0));
  if (plan.orbit) {
    const o = plan.orbit;
    // start on the player's side of the circle: the shot leaves from where the view was
    const a0 = Math.atan2(snap.x - o.x, snap.z - o.z);
    const a = (Number.isFinite(a0) ? a0 : 0) + (Math.PI * 2 * tt) / o.period;
    out.x = o.x + o.r * Math.sin(a);
    out.z = o.z + o.r * Math.cos(a);
    out.y = env.ground(out.x, out.z) + Math.max(GROUND_CLEAR, o.y ?? ORBIT_Y);
    _p.x = o.x;
    _p.z = o.z;
    _p.y = env.ground(o.x, o.z) + 1.5;
    _la.yaw = hold.yaw;
    _la.pitch = hold.pitch;
    anglesTo(out, _p, _la);
    out.yaw = _la.yaw;
    out.pitch = _la.pitch;
    out.fov = snap.cam.fov;
    out.fade = out.fog = out.sun = out.dark = 0;
    return out;
  }
  const keys = plan.keys!;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1]!.t <= tt) i++;
  const A = keys[i]!;
  const B = keys[i + 1]!;
  const raw = Math.max(0, Math.min(1, (tt - A.t) / (B.t - A.t)));
  const u = B.ease === 'linear' ? raw : smooth(raw);
  eyePoint(A.eye, snap, env, _a);
  eyePoint(B.eye, snap, env, _b);
  out.x = lerp(_a.x, _b.x, u);
  out.y = lerp(_a.y, _b.y, u);
  out.z = lerp(_a.z, _b.z, u);
  // both looks seen from the eye of this frame: a target stays in the middle of the picture
  _la.yaw = _lb.yaw = hold.yaw;
  _la.pitch = _lb.pitch = hold.pitch;
  const okA = lookAngles(A.look, A.eye, out, snap, env, _la);
  const okB = lookAngles(B.look, B.eye, out, snap, env, _lb);
  out.yaw = lerpAngle(okA ? _la.yaw : hold.yaw, okB ? _lb.yaw : hold.yaw, u);
  out.pitch = lerp(okA ? _la.pitch : hold.pitch, okB ? _lb.pitch : hold.pitch, u);
  out.fov = Math.max(15, Math.min(90, lerp(A.fov ?? snap.cam.fov, B.fov ?? snap.cam.fov, u)));
  out.fade = lerp(A.fade, B.fade, u);
  out.fog = lerp(A.fog, B.fog, u);
  out.sun = lerp(A.sun, B.sun, u);
  out.dark = lerp(A.dark, B.dark, u);
  return out;
}

/** Length of the reduced-motion stills (s). */
export function stillsSeconds(plan: Plan): number {
  return Math.min(STILLS_MAX, plan.seconds);
}

/** Reduced motion: the source time to show at stills time t, and the black dip between the two stills. */
export function stillsAt(plan: Plan, t: number): { src: number; dip: number } {
  const T = stillsSeconds(plan);
  const mid = T / 2;
  const w = Math.min(STILLS_DIP, mid);
  return { src: t < mid ? 0 : plan.seconds, dip: w > 0 ? 1 - smooth(Math.abs(t - mid) / w) : 0 };
}
