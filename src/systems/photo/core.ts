/**
 * Smartphone photo mode, the pure core (docs/ARCHITECTURE.md "Fotomodus"; design: the tour
 * drafts' systems.md §1). No three.js, no DOM: tests/photo.test.ts drives it with a synthetic view
 * and world.
 *
 * A shot is judged **geometrically**, never by pixels. For every registered target of the current
 * era its bounding sphere is projected into the frame; the target is "good" when all of these hold:
 *
 * 1. **in the middle third**: the projected centre lies within |x|, |y| ≤ 1/3 (NDC, the frame is the
 *    whole view; the phone bezel is drawn around it);
 * 2. **big enough**: the sphere's diameter covers ≥ `minFrac` of the frame **height**;
 * 3. **not hidden**: of three sample points on the sphere (top, left, right as seen from the lens)
 *    at least two have a clear sight line (terrain, footprint walls and tree trunks block it);
 * 4. **near enough**: lens → centre ≤ `maxDist`, or ≤ `fallbackDist` once the fallback clock ran out
 *    (see `PhotoCore.tick`: seconds the player has spent within `fallbackDist` of the target);
 * 5. **steady**: the camera turned slower than `STEADY_RAD_S` on average over the last 0.3 s;
 * 6. **calm**: the target's optional `calm()` returns true (an alerted deer does not count).
 *
 * A target's optional `state()` (an opaque string, e.g. the deer's 'graze' | 'alert' | 'flee' |
 * 'settled') is read at the moment of the shot for every good target and carried on its judgement
 * (`TargetJudgement.state`, then `photo:good { id, stars, state }`). It changes no stars or verdict.
 *
 * `needAll` binds targets together: a doe that is good alone is not good unless every id in its
 * `needAll` is good in the same shot too (doe and fawn both in the picture).
 *
 * **Stars** (story contract C3): 0 = not in the frame, 1 = in the frame but not good, 2 = good,
 * 3 = good and closer than 0.6 × `maxDist`. "Good" means ≥ 2, everywhere: a fallback shot gets
 * `fallbackStars` (default 2), and with 1 it is not good (no `photo:good`, no album, no `has()`).
 *
 * In any era but today the phone has no signal: nothing is judged, the image comes out white.
 */
import type { Era } from '../../core/era';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PhotoGrants {
  /** A codex fact id (content `facts`): unlocked once, quietly (no XP: photo cards give none). */
  codex?: string;
  /** A photo card id (`ph.*`, album only; listed in content/photo/targets.json `cards`). */
  card?: string;
  /** A story flag set to true (`state.flags[flag]`). */
  flag?: string;
}

export type PhotoKind = 'animal' | 'detail' | 'inscription' | 'person';

export interface PhotoTargetDef {
  /** Dotted id, e.g. 'reh.ricke', 'photo.parkplatz'. Story waits on `photo:good { id }`. */
  id: string;
  era: Era;
  kind?: PhotoKind;
  /** Where the target is now (a function: animals move); null = not in the world right now. */
  at: () => Vec3 | null;
  /** Bounding sphere radius (m). */
  r: number;
  /** Projected diameter as a fraction of the frame height, at least. */
  minFrac: number;
  /** Farthest good distance (m, lens → centre). */
  maxDist: number;
  /** Nearest good distance (m), default 0. */
  minDist?: number;
  /** 'third' (default): the centre must sit in the middle third; 'any': anywhere in the frame. */
  centre?: 'third' | 'any';
  /** Farther distance that counts once the fallback clock ran out (`fallbackAfterS`). */
  fallbackDist?: number;
  /** Seconds within `fallbackDist` of the target (unpaused) before `fallbackDist` counts. */
  fallbackAfterS?: number;
  /** Stars a fallback shot gets (default 2). */
  fallbackStars?: number;
  /** Other target ids that must be good in the same shot (both deer). */
  needAll?: string[];
  /** False = alerted: the shot does not count (animals; WP-17 supplies it). */
  calm?: () => boolean;
  /**
   * The subject's state right now (opaque, never validated; e.g. 'graze' | 'alert' | 'flee' |
   * 'settled'). Read at the shot for good targets only: `photo:good { id, stars, state }`.
   */
  state?: () => string;
  grants?: PhotoGrants;
  /** Player-facing name (album card), German. */
  label_de: string;
  /** Placeholder content (kq-story replaces it). */
  placeholder?: boolean;
}

/** What the lens saw: position and the view's yaw / pitch (player convention, 0 = −z). */
export interface PhotoView {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Vertical field of view (degrees, after the phone zoom). */
  fovV: number;
  /** Width / height. */
  aspect: number;
  /** Mean angular speed over the last 0.3 s (rad/s), see `SteadyMeter`. */
  angularSpeed: number;
}

/** Sight blockers for the line-of-sight samples. */
export interface PhotoWorld {
  heightAt(x: number, z: number): number;
  /** Footprint walls (buildings that stand in this era). */
  blocked?(x: number, z: number): boolean;
  /** Tree trunks near a point: x, z, radius, top (absolute y). */
  trunks?(x: number, z: number, r: number, fn: (tx: number, tz: number, tr: number, top: number) => void): void;
}

export type Verdict = 'perfekt' | 'gut' | 'weit-ok' | 'leer' | 'unscharf' | 'zu-weit' | 'zu-nah' | 'nicht-mittig' | 'zu-klein' | 'verdeckt' | 'aufgeschreckt' | 'nicht-alle' | 'kein-netz';

export const VERDICT_DE: Record<Verdict, string> = {
  perfekt: 'Perfekt!',
  gut: 'Gutes Foto',
  'weit-ok': 'Weit weg, aber erkennbar',
  leer: 'Nichts Besonderes im Bild',
  unscharf: 'Unscharf',
  'zu-weit': 'Zu weit weg',
  'zu-nah': 'Zu nah dran',
  'nicht-mittig': 'Nicht mittig',
  'zu-klein': 'Zu klein im Bild',
  verdeckt: 'Verdeckt',
  aufgeschreckt: 'Aufgeschreckt',
  'nicht-alle': 'Nicht alle im Bild',
  'kein-netz': 'Kein Netz',
};

export interface TargetJudgement {
  id: string;
  /** In front of the lens and inside the frame at all. */
  inFrame: boolean;
  good: boolean;
  /** 0 not in the frame, 1 in the frame but not good, 2 good, 3 good and close. */
  stars: number;
  /** Why not (or how good). */
  verdict: Verdict;
  /** Lens → centre (m). */
  dist: number;
  /** Projected centre (NDC) and diameter fraction of the frame height. */
  ndcX: number;
  ndcY: number;
  frac: number;
  /** Clear sample sight lines (0..3). */
  clear: number;
  /** Counted only via the fallback distance. */
  fallback: boolean;
  /** The target's `state()` at the shot (good targets with a getter only). */
  state?: string;
}

export interface ShotResult {
  era: Era;
  /** False in the past („Kein Netz“): nothing judged, white image. */
  signal: boolean;
  /** Ids of the targets that were in the frame. */
  targets: string[];
  /** Ids of the good targets. */
  good: string[];
  /** Best stars in the frame (0 = nothing, 1 = something but not good). */
  stars: number;
  verdict: Verdict;
  verdict_de: string;
  details: TargetJudgement[];
}

/** Middle third of the frame (NDC half-width). */
export const MIDDLE = 1 / 3;
/** Closer than this × maxDist: the third star. */
export const CLOSE_STAR = 0.6;
/** Steady: mean angular speed below this (rad/s) over the window. */
export const STEADY_RAD_S = 0.35;
/** Steadiness window (s). */
export const STEADY_WINDOW = 0.3;
/** Album entries kept in the save. */
export const ALBUM_MAX = 60;

const smooth = (v: number) => (Number.isFinite(v) ? v : 0);

/** The view's basis (camera rotation 'YXZ' with pitch, yaw). */
function basis(yaw: number, pitch: number) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const f = { x: -sy * cp, y: sp, z: -cy * cp };
  const r = { x: cy, y: 0, z: -sy };
  // up = right × forward
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  return { f, r, u };
}

/** Project a point: NDC x / y and the depth along the view (≤ 0 = behind the lens). */
export function project(v: PhotoView, p: Vec3): { x: number; y: number; depth: number } {
  const { f, r, u } = basis(v.yaw, v.pitch);
  const dx = p.x - v.x;
  const dy = p.y - v.y;
  const dz = p.z - v.z;
  const depth = dx * f.x + dy * f.y + dz * f.z;
  const tanH = Math.tan((v.fovV * Math.PI) / 360);
  if (depth <= 1e-3) return { x: NaN, y: NaN, depth };
  return { x: (dx * r.x + dy * r.y + dz * r.z) / (depth * tanH * v.aspect), y: (dx * u.x + dy * u.y + dz * u.z) / (depth * tanH), depth };
}

/**
 * Is the straight line a → b clear? Marched every 0.25 m; the last `stopShort` metres (the
 * target's own body) are not tested. Terrain above the line, a footprint wall or a trunk blocks.
 */
export function sightClear(w: PhotoWorld, a: Vec3, b: Vec3, stopShort = 0): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dy, dz);
  const end = d - stopShort;
  if (end <= 0.4) return true;
  const n = Math.max(1, Math.ceil(end / 0.25));
  for (let i = 1; i <= n; i++) {
    const s = (i / n) * end;
    if (s < 0.3) continue;
    const t = s / d;
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    const z = a.z + dz * t;
    if (w.heightAt(x, z) > y + 0.02) return false;
    if (w.blocked?.(x, z)) return false;
    if (w.trunks) {
      let hit = false;
      w.trunks(x, z, 0.6, (tx, tz, tr, top) => {
        if (!hit && y < top && Math.hypot(tx - x, tz - z) < tr) hit = true;
      });
      if (hit) return false;
    }
  }
  return true;
}

/** Judge one target on its own (needAll is applied over the whole shot by `judgeShot`). */
export function judgeTarget(t: PhotoTargetDef, v: PhotoView, w: PhotoWorld, fallbackReady: boolean): TargetJudgement {
  const c = t.at() ?? { x: NaN, y: NaN, z: NaN };
  const dist = Math.hypot(c.x - v.x, c.y - v.y, c.z - v.z);
  const p = project(v, c);
  const tanH = Math.tan((v.fovV * Math.PI) / 360);
  const frac = dist > t.r ? t.r / Math.sqrt(dist * dist - t.r * t.r) / tanH : 2;
  const out: TargetJudgement = { id: t.id, inFrame: false, good: false, stars: 0, verdict: 'leer', dist, ndcX: smooth(p.x), ndcY: smooth(p.y), frac, clear: 0, fallback: false };
  // in the frame at all: in front, and some of the sphere inside the borders
  if (!Number.isFinite(dist) || !(p.depth > 0) || Math.abs(p.x) > 1 + frac / v.aspect || Math.abs(p.y) > 1 + frac) return out;
  out.inFrame = true;
  out.stars = 1;
  // the three sight samples: top, left, right of the sphere as seen from the lens
  const { r: right, u: up } = basis(v.yaw, v.pitch);
  const k = t.r * 0.6;
  const samples: Vec3[] = [
    { x: c.x + up.x * k, y: c.y + up.y * k, z: c.z + up.z * k },
    { x: c.x - right.x * k, y: c.y - right.y * k, z: c.z - right.z * k },
    { x: c.x + right.x * k, y: c.y + right.y * k, z: c.z + right.z * k },
  ];
  const lens = { x: v.x, y: v.y, z: v.z };
  for (const s of samples) if (sightClear(w, lens, s, t.r * 0.7)) out.clear++;
  const far = t.fallbackDist !== undefined && fallbackReady ? Math.max(t.maxDist, t.fallbackDist) : t.maxDist;
  const centred = t.centre === 'any' ? Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 : Math.abs(p.x) <= MIDDLE && Math.abs(p.y) <= MIDDLE;
  // the first reason that fails, in the order a player can fix it
  if (dist > far) out.verdict = 'zu-weit';
  else if (dist < (t.minDist ?? 0)) out.verdict = 'zu-nah';
  else if (out.clear < 2) out.verdict = 'verdeckt';
  else if (!centred) out.verdict = 'nicht-mittig';
  else if (frac < t.minFrac) out.verdict = 'zu-klein';
  else if (!(v.angularSpeed <= STEADY_RAD_S)) out.verdict = 'unscharf';
  else if (t.calm && !t.calm()) out.verdict = 'aufgeschreckt';
  else {
    out.good = true;
    out.fallback = dist > t.maxDist;
    if (out.fallback) {
      out.stars = Math.max(1, Math.min(3, Math.round(t.fallbackStars ?? 2)));
      // one rule: good means ≥ 2 stars; a 1-star fallback is only "far, but in the frame"
      out.good = out.stars >= 2;
      out.verdict = out.good ? 'weit-ok' : 'zu-weit';
    } else {
      out.stars = dist < CLOSE_STAR * t.maxDist ? 3 : 2;
      out.verdict = out.stars === 3 ? 'perfekt' : 'gut';
    }
  }
  return out;
}

/** How bad a failure verdict is for the shot's summary (lower = the closest miss). */
const MISS_ORDER: Verdict[] = ['nicht-alle', 'aufgeschreckt', 'unscharf', 'zu-klein', 'nicht-mittig', 'verdeckt', 'zu-nah', 'zu-weit'];

/**
 * Judge a whole shot. `fallbackReady(id)` says whether a target's fallback clock ran out.
 * In the past (`era !== 'today'`): no signal, nothing judged.
 */
export function judgeShot(targets: readonly PhotoTargetDef[], era: Era, v: PhotoView, w: PhotoWorld, fallbackReady: (id: string) => boolean = () => false): ShotResult {
  if (era !== 'today') return { era, signal: false, targets: [], good: [], stars: 0, verdict: 'kein-netz', verdict_de: VERDICT_DE['kein-netz'], details: [] };
  const details = targets.filter((t) => t.era === era).map((t) => judgeTarget(t, v, w, fallbackReady(t.id)));
  const good = new Set(details.filter((d) => d.good).map((d) => d.id));
  // needAll: every partner must be good in the same shot (iterate: dropping one may drop another)
  for (let changed = true; changed; ) {
    changed = false;
    for (const t of targets) {
      if (!good.has(t.id) || !t.needAll?.length) continue;
      if (t.needAll.every((id) => good.has(id))) continue;
      good.delete(t.id);
      const d = details.find((x) => x.id === t.id)!;
      d.good = false;
      d.stars = 1;
      d.verdict = 'nicht-alle';
      changed = true;
    }
  }
  // the subject's state at the moment of the shot (good targets with a getter; opaque string)
  const byId = new Map(targets.map((t) => [t.id, t]));
  for (const d of details) {
    const get = d.good ? byId.get(d.id)?.state : undefined;
    if (get) d.state = get();
  }
  const inFrame = details.filter((d) => d.inFrame);
  const goods = details.filter((d) => d.good);
  let verdict: Verdict = 'leer';
  let stars = 0;
  if (goods.length) {
    const best = goods.reduce((a, b) => (b.stars > a.stars ? b : a));
    stars = best.stars;
    verdict = best.verdict;
  } else if (inFrame.length) {
    stars = 1;
    verdict = inFrame.map((d) => d.verdict).sort((a, b) => MISS_ORDER.indexOf(a) - MISS_ORDER.indexOf(b))[0] ?? 'leer';
  }
  return { era, signal: true, targets: inFrame.map((d) => d.id), good: goods.map((d) => d.id), stars, verdict, verdict_de: VERDICT_DE[verdict], details };
}

/** The `photo:good` payload of one good target (scalar only; `state` only when the target has a getter). */
export interface PhotoGoodEvent {
  id: string;
  stars: number;
  state?: string;
}

/** One `photo:good` payload per good target of a shot (index.ts emits them in this order). */
export function goodEvents(r: ShotResult): PhotoGoodEvent[] {
  const out: PhotoGoodEvent[] = [];
  for (const d of r.details) {
    if (!d.good) continue;
    out.push(d.state === undefined ? { id: d.id, stars: d.stars } : { id: d.id, stars: d.stars, state: d.state });
  }
  return out;
}

/**
 * Mean angular speed of the view over the last `STEADY_WINDOW` seconds (yaw and pitch, wrapped).
 * Feed it once per rendered frame.
 */
export class SteadyMeter {
  private readonly samples: { t: number; yaw: number; pitch: number }[] = [];

  push(t: number, yaw: number, pitch: number): void {
    if (!Number.isFinite(t + yaw + pitch)) return;
    this.samples.push({ t, yaw, pitch });
    while (this.samples.length > 2 && this.samples[1]!.t < t - STEADY_WINDOW - 0.5) this.samples.shift();
  }

  /** rad/s over the window ending at `now` (0 with fewer than two samples). */
  speed(now: number): number {
    const from = now - STEADY_WINDOW;
    let sum = 0;
    let span = 0;
    for (let i = 1; i < this.samples.length; i++) {
      const a = this.samples[i - 1]!;
      const b = this.samples[i]!;
      if (b.t <= from || b.t > now + 1e-6) continue;
      let dy = b.yaw - a.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      sum += Math.hypot(dy, b.pitch - a.pitch);
      span += b.t - Math.max(a.t, from);
    }
    return span > 1e-3 ? sum / Math.max(span, STEADY_WINDOW * 0.5) : 0;
  }

  reset(): void {
    this.samples.length = 0;
  }
}

/**
 * One album entry per target id (in the save; no image: the JPEG lives for the session only).
 * A better shot of the same target replaces stars and time.
 */
export interface AlbumEntry {
  id: string;
  era: Era;
  /** ISO time of the best shot. */
  at: string;
  /** Play seconds at that shot. */
  play: number;
  /** Best stars. */
  stars: number;
  /** The subject's `state()` at that best shot (targets with a getter only). */
  state?: string;
}

/** The photo system's save slice. */
export interface PhotoSlice {
  album: AlbumEntry[];
  /** Targets with a good shot ever (kept even when the album entry is dropped by the cap). */
  good: string[];
  /** Targets whose grants fired. */
  granted: string[];
  /** Photo cards unlocked (`ph.*`, album only). */
  cards: string[];
  /** Best stars per target. */
  best: Record<string, number>;
  /** Fallback clocks: seconds within `fallbackDist` per target. */
  near: Record<string, number>;
}

export function emptySlice(): PhotoSlice {
  return { album: [], good: [], granted: [], cards: [], best: {}, near: {} };
}

/** A save from another build: missing fields filled, junk dropped. */
export function normaliseSlice(s: Partial<PhotoSlice> | null | undefined): PhotoSlice {
  const e = emptySlice();
  if (!s || typeof s !== 'object') return e;
  const strs = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []);
  e.album = Array.isArray(s.album) ? s.album.filter((a) => a && typeof a.id === 'string').slice(-ALBUM_MAX) : [];
  e.good = strs(s.good);
  e.granted = strs(s.granted);
  e.cards = strs(s.cards);
  e.best = s.best && typeof s.best === 'object' ? { ...s.best } : {};
  e.near = s.near && typeof s.near === 'object' ? { ...s.near } : {};
  return e;
}

export interface GrantSink {
  /** Known codex fact ids (content packs); unknown ids are skipped with a warning. */
  knownFact(id: string): boolean;
  /** Known photo cards (`cards[]` of content/photo/targets.json). */
  knownCard(id: string): boolean;
  codex(id: string): void;
  card(id: string): void;
  flag(id: string): void;
  warn(msg: string): void;
}

/** A live binding for a target (`attachTarget`): position, and optionally calm / state. */
export interface PhotoLiveBinding {
  at: () => Vec3 | null;
  calm?: () => boolean;
  state?: () => string;
}

/**
 * Why the `?debug` test deer must not bind `reh.ricke` / `reh.kitz` (null = it may): somebody
 * else already holds a live binding, or `kq.animals` (kq-systems, optional) reports deer. The
 * animals hook's shape is not fixed yet, so the probe is tolerant: a truthy `deer` (or a
 * `deer()` returning something non-empty), or a `list()` / `all()` entry whose id / kind /
 * species / spec names a deer (deer, reh, roe).
 */
export function debugDeerBlocker(ids: readonly string[], isAttached: (id: string) => boolean, animals?: unknown): string | null {
  const taken = ids.filter((id) => isAttached(id));
  if (taken.length) return `already attached: ${taken.join(', ')}`;
  if (animals && typeof animals === 'object' && animalsReportDeer(animals as Record<string, unknown>)) return 'kq.animals reports deer';
  return null;
}

function animalsReportDeer(a: Record<string, unknown>): boolean {
  const nonEmpty = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v);
  try {
    if (typeof a.deer === 'function') {
      if (nonEmpty((a.deer as () => unknown)())) return true;
    } else if (nonEmpty(a.deer)) return true;
    for (const k of ['list', 'all'] as const) {
      const f = a[k];
      if (typeof f !== 'function') continue;
      const rows = (f as () => unknown).call(a);
      if (!Array.isArray(rows)) continue;
      for (const r of rows) {
        if (!r || typeof r !== 'object') continue;
        const o = r as Record<string, unknown>;
        if ([o.id, o.kind, o.species, o.spec, o.specId].some((v) => typeof v === 'string' && /deer|reh|roe/i.test(v))) return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * The bookkeeping around shots, over a save slice (pure; the system wires it to the game).
 */
export class PhotoCore {
  readonly targets = new Map<string, PhotoTargetDef>();
  /** Live bindings per target id, a stack of handles (the top one is active). */
  private readonly bindings = new Map<string, { base: Pick<PhotoTargetDef, 'at' | 'calm' | 'state'>; stack: PhotoLiveBinding[] }>();

  /**
   * Bind a live position (and optionally calm / state) to a target by id. Bindings stack per id:
   * the active one is always the top remaining handle, or the target's own (data) anchor when none
   * is left. The returned undo removes exactly this handle wherever it sits, so a binding that was
   * detached is never restored. Missing calm / state on the active handle fall back to the
   * target's own. Null for an unknown id.
   */
  attach(id: string, live: PhotoLiveBinding): (() => void) | null {
    const t = this.targets.get(id);
    if (!t) return null;
    let b = this.bindings.get(id);
    if (!b) {
      b = { base: { at: t.at, calm: t.calm, state: t.state }, stack: [] };
      this.bindings.set(id, b);
    }
    const handle: PhotoLiveBinding = { ...live };
    b.stack.push(handle);
    this.applyBinding(id);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const cur = this.bindings.get(id);
      if (!cur) return;
      const i = cur.stack.indexOf(handle);
      if (i >= 0) cur.stack.splice(i, 1);
      this.applyBinding(id);
    };
  }

  /** True while any live binding is attached to that target. */
  isAttached(id: string): boolean {
    return (this.bindings.get(id)?.stack.length ?? 0) > 0;
  }

  private applyBinding(id: string): void {
    const b = this.bindings.get(id);
    const t = this.targets.get(id);
    if (!b) return;
    if (t) {
      const top = b.stack[b.stack.length - 1];
      t.at = top ? top.at : b.base.at;
      t.calm = top?.calm ?? b.base.calm;
      t.state = top?.state ?? b.base.state;
    }
    if (!b.stack.length) this.bindings.delete(id);
  }

  constructor(private readonly slice: () => PhotoSlice) {}

  /** Register (or replace, by id) a target. */
  register(t: PhotoTargetDef): void {
    if (!t.id || !(t.r > 0) || !(t.maxDist > 0) || !(t.minFrac >= 0)) throw new Error(`photo: bad target '${t.id}'`);
    this.targets.set(t.id, t);
    // a replaced target keeps its live bindings: the new def is the base, the top handle stays active
    const b = this.bindings.get(t.id);
    if (b) {
      b.base = { at: t.at, calm: t.calm, state: t.state };
      this.applyBinding(t.id);
    }
  }

  unregister(id: string): void {
    this.targets.delete(id);
  }

  /** Advance the fallback clocks: seconds the player spends within a target's `fallbackDist`. */
  tick(dt: number, era: Era, player: Vec3): void {
    const s = this.slice();
    for (const t of this.targets.values()) {
      if (t.era !== era || t.fallbackDist === undefined || t.fallbackAfterS === undefined || s.good.includes(t.id)) continue;
      const c = t.at();
      if (c && Math.hypot(c.x - player.x, c.z - player.z) <= t.fallbackDist) s.near[t.id] = (s.near[t.id] ?? 0) + dt;
    }
  }

  fallbackReady(id: string): boolean {
    const t = this.targets.get(id);
    if (!t || t.fallbackAfterS === undefined) return false;
    return (this.slice().near[id] ?? 0) >= t.fallbackAfterS;
  }

  judge(era: Era, v: PhotoView, w: PhotoWorld): ShotResult {
    return judgeShot([...this.targets.values()], era, v, w, (id) => this.fallbackReady(id));
  }

  /**
   * Book a judged shot: one album entry per good target (today only; a better shot replaces the
   * old one; max `ALBUM_MAX`, the oldest out), best stars, and every grant once. Returns the
   * entries that were added or improved.
   */
  book(r: ShotResult, at: string, play: number, sink: GrantSink): AlbumEntry[] {
    if (!r.signal || !r.good.length) return [];
    const s = this.slice();
    const changed: AlbumEntry[] = [];
    for (const id of r.good) {
      const d = r.details.find((x) => x.id === id);
      const stars = d?.stars ?? r.stars;
      const state = d?.state;
      const old = s.album.find((a) => a.id === id);
      if (!old) {
        const e: AlbumEntry = { id, era: r.era, at, play: Math.round(play), stars };
        if (state !== undefined) e.state = state;
        s.album.push(e);
        changed.push(e);
        while (s.album.length > ALBUM_MAX) s.album.shift();
      } else if (stars > old.stars) {
        Object.assign(old, { era: r.era, at, play: Math.round(play), stars });
        if (state !== undefined) old.state = state;
        else delete old.state;
        changed.push(old);
      }
      s.best[id] = Math.max(s.best[id] ?? 0, stars);
      if (!s.good.includes(id)) s.good.push(id);
      if (s.granted.includes(id)) continue;
      s.granted.push(id);
      this.grant(this.targets.get(id)?.grants, id, sink);
    }
    return changed;
  }

  private grant(g: PhotoGrants | undefined, id: string, sink: GrantSink): void {
    if (!g) return;
    if (g.codex) {
      if (sink.knownFact(g.codex)) sink.codex(g.codex);
      else sink.warn(`photo '${id}': unknown codex id '${g.codex}', skipped`);
    }
    if (g.card) {
      if (sink.knownCard(g.card)) sink.card(g.card);
      else sink.warn(`photo '${id}': unknown card id '${g.card}', skipped`);
    }
    if (g.flag) sink.flag(g.flag);
  }

  has(id: string): boolean {
    return this.slice().good.includes(id);
  }
}
