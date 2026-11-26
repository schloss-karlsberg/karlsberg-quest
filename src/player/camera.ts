import { type PerspectiveCamera, Vector3 } from 'three';
import { finiteOr, safeDt } from './guards';

/**
 * Third-person action camera (playtest round 8: first-person melee was unreadable — enemies sat
 * under the camera, behind the lantern or the HUD). An over-the-shoulder spring arm:
 *
 * - **pivot** at the character's head (stance height), the boom offset to the right shoulder so
 *   the character stands left of the crosshair and the view ahead stays open;
 * - **look** is the player's yaw / pitch (mouse, keyboard look) — the crosshair ray stays parallel to
 *   the first-person one, so measuring and examining aim as before;
 * - **collision** (round 10): the boom is swept from the shoulder towards the wanted camera spot
 *   against the footprint walls / props / interior walls (`blocked`) and never leaves the
 *   character's walkable space (`space`: outdoors stays outdoors, a room stays that room — no lens
 *   through a door, the Durchfahrt or a stair block, F-35); the camera stops in front of the first
 *   hit (pulls in at once, lets out slowly). Terrain is not a wall: a slope or the hohe Stufe behind
 *   the character **cranes** the boom up over the ground instead of shortening it into the head
 *   (F-07). Tree trunks, ferns and rocks are not collided with at all: they dither away where they
 *   stand between the lens and the character, the target or a speaker, or press against the lens
 *   (`seeThrough.ts`, SEE_GLSL in world/atmosphere.ts; F-03 / F-15 / F-21);
 * - **never inside the head**: a boom pulled in under 1.2 m **rises over the shoulder** (up to
 *   0.85 m, the shoulder offset shrinks), and the view tilts so the head stays in frame (`frameTilt`);
 * - **zoom** (wheel) 1.8–8 m; **fights** pull the boom back and up so every nearby enemy fits
 *   (`hints.fight`, written by combat each frame), and an enemy passing the lens lifts the camera
 *   over it (F-08); **rooms** (a ceiling over the character) use a closer, higher, narrower preset
 *   (F-31); a **conversation** (`hints.focus`, npc) frames a two-shot from the side — the character
 *   left, the speaker right, both heads above the dialogue box (`twoShot`, F-31).
 *
 * First person (`mode = 'first'`, settings „Kamera“) and the spirit view keep the old eye camera.
 * Pure maths over a small world interface (tests/camera.test.ts).
 *
 * **Photo mode** (src/systems/photo, additive; nothing changes while it is off): `setPhoto(true)`
 * puts the lens where the phone is held, at the eyes and a hand ahead of the face (`PHOTO_AHEAD`),
 * and hides the character (boom 0); `setFovScale(k)` narrows the field of view k-fold (the phone's
 * 2× zoom: the focal length doubles), eased unless reduced motion. `snapFov(camera)` ends the
 * zoom at once (a forced close: a cut scene, a fight, death): the base fov is written in the same
 * frame and the rig lets go of `camera.fov` — while the scale is 1 and nothing is easing, the rig
 * never writes the fov (a cinematic takeover captures and restores it). Tests: tests/camera-photo.test.ts.
 */
export type CameraMode = 'third' | 'first';

declare module '../debug/hooks' {
  interface KqHooks {
    /** Third-person camera rig (src/player/camera.ts): what it did last frame, for tests. */
    camera?: { state(): RigDebug & { mode: CameraMode; third: boolean; see: boolean; seeTarget: boolean; fightHints: number } };
  }
}

export interface CameraWorld {
  /** Ground height; `y` (optional) picks the storey near that height inside a walkable building. */
  heightAt(x: number, z: number, y?: number): number;
  /** Is a circle (x, z, r) inside a wall, a building footprint, a prop or an interior wall? */
  blocked(x: number, z: number, r: number): boolean;
  /**
   * Tree trunks near a point (kept for callers; round 10: the boom no longer collides with trunks,
   * they dither away instead).
   */
  trunks?(x: number, z: number, r: number, fn: (tx: number, tz: number, tr: number, top: number) => void): void;
  /** Highest the camera may be at the player's spot (a room's ceiling), or null outdoors. */
  ceiling?(x: number, z: number, feetY: number): number | null;
  /**
   * The walkable space a point belongs to at about feet height y: −1 outdoors, ≥ 0 a room, −2
   * inside a building but in no room (wall mass, a door's reveal). The boom never leaves the
   * character's space. Without it everything is one space.
   */
  space?(x: number, z: number, feetY: number): number;
}

/** Written by systems each frame (one frame late is fine): what the camera should frame. */
export interface CameraHints {
  /** Enemies in the fight (x, z, body radius, top height above the feet); [] = no fight. */
  fight: { x: number; z: number; r: number; top: number }[];
  /** A conversation partner's head (npc): the camera frames a two-shot of the character and the speaker. */
  focus: { x: number; y: number; z: number } | null;
  /** A big body (boss) close by: raise the camera more. */
  boss: number;
  /** Big bodies (bosses) the boom may not pass through: it goes over them instead (x, z, r, top above ground). */
  bodies?: { x: number; z: number; r: number; top: number }[];
}

export const cameraHints: CameraHints = { fight: [], focus: null, boss: 0, bodies: [] };

export const ZOOM_MIN = 1.8;
export const ZOOM_MAX = 8;
/** Shoulder offset (m to the right of the pivot) and the camera's lift above the pivot. */
const SHOULDER = 0.62;
/**
 * Shoulder in a fight (playtest round 9: "the enemy I was fighting sat exactly behind the
 * surveyor's body" at 0.62 m): the character moves well left of the crosshair.
 */
export const SHOULDER_FIGHT = 1.1;
/** Third-person pitch range (rad: −55° … +35°) and the level it eases back to while walking. */
export const PITCH_MIN_3P = -0.96;
export const PITCH_MAX_3P = 0.61;
export const PITCH_REST_3P = -0.21;
const LIFT = 0.18;
/** Closest the camera may come to a wall / the ground (m). */
const CLEAR = 0.28;
/** Shortest boom: closer than this and the character's head would fill the view (it fades). */
export const BOOM_MIN = 0.55;
/** A boom shorter than this rises over the shoulder instead of pressing into the head (round 10, F-07). */
export const NEAR_COMFORT = 1.2;
/** Highest the squeezed camera rises over the pivot (m). */
export const RISE_MAX = 0.85;
/** Highest the boom cranes up over rising ground behind the character (m). */
export const CRANE_MAX = 2.6;
/** Indoor preset (round 10, F-31): a closer, higher boom with a narrower shoulder. */
export const INDOOR_BOOM = 2.3;
const INDOOR_LIFT = 0.32;
const INDOOR_SHOULDER = 0.5;
/** An enemy closer than this to the lens (m from its body) lifts the camera over it (F-08). */
export const ENEMY_CLEAR = 1.3;
/** Sweep step along the boom (m): thinner than twice the probe radius, so no wall slips through. */
const STEP = 0.25;
/** Photo mode: the phone a hand ahead of the eyes (m, horizontal) and a little below them. */
export const PHOTO_AHEAD = 0.32;
export const PHOTO_DROP = 0.06;

const _f = new Vector3();
const _r = new Vector3();
const _s = new Vector3();
const _c = new Vector3();
const _shot = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };

const smooth01 = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Ease `cur` towards `want` at `up` / `down` per second (instant when `snap`). */
function ease(cur: number, want: number, up: number, down: number, dt: number, snap: boolean): number {
  return snap ? want : cur + (want - cur) * Math.min(1, dt * (want > cur ? up : down));
}

/**
 * How far a squeezed boom rises over the shoulder (pure; tested): 0 from `NEAR_COMFORT` out,
 * `RISE_MAX` at the shortest boom.
 */
export function squeezeRise(distance: number): number {
  if (!Number.isFinite(distance)) return 0;
  return RISE_MAX * (1 - smooth01(BOOM_MIN, NEAR_COMFORT, distance));
}

/**
 * Keep a point in frame (pure; tested): the extra pitch (rad, < 0 tilts the view down) so that
 * the point (tx, ty, tz) seen from the camera (cx, cy, cz) with view yaw / pitch sits between
 * `low` and `high` in normalised screen height (−1 bottom … 1 top). `fovV` in degrees.
 */
export function frameTilt(cx: number, cy: number, cz: number, tx: number, ty: number, tz: number, yaw: number, pitch: number, fovV: number, low = -0.62, high = 0.85): number {
  const fwd = Math.max(0.05, (tx - cx) * -Math.sin(yaw) + (tz - cz) * -Math.cos(yaw));
  const e = Math.atan2(ty - cy, fwd);
  const tanH = Math.tan((fovV * Math.PI) / 360);
  const hi = e - Math.atan(low * tanH);
  const lo = e - Math.atan(high * tanH);
  const p = Math.min(hi, Math.max(lo, pitch));
  // NaN anywhere (a point at the lens, a broken fov): no tilt rather than a NaN view (F-15)
  return Number.isFinite(p - pitch) ? p - pitch : 0;
}

/**
 * A conversation's two-shot (pure; tested): the camera behind and to the side of the character
 * (head at p) so the character stands left and the speaker (head at s) right of the middle, both
 * heads above the centre (the dialogue box covers the lower third). `side` +1 = camera on the
 * right of the line from the character to the speaker, −1 = the mirror (character right).
 */
export function twoShot(px: number, py: number, pz: number, sx: number, sy: number, sz: number, side: number, fovV: number, out: { x: number; y: number; z: number; yaw: number; pitch: number }): typeof out {
  // nothing to frame: the caller keeps its last good camera (F-15)
  if (!Number.isFinite(px + py + pz)) return out;
  if (!Number.isFinite(sx + sy + sz)) {
    sx = px;
    sy = py;
    sz = pz - 1;
  }
  side = side < 0 ? -1 : 1;
  fovV = finiteOr(fovV, 70);
  let ux = sx - px;
  let uz = sz - pz;
  const L = Math.hypot(ux, uz);
  if (L > 1e-6) {
    ux /= L;
    uz /= L;
  } else {
    // the speaker on the character's spot: any line will do
    ux = 0;
    uz = -1;
  }
  const D = Math.max(0.6, L);
  const back = 1.0 + 0.1 * Math.min(4, D);
  const off = (1.25 + 0.15 * Math.min(4, D)) * side;
  // right of the line p → s is (−uz, ux)
  out.x = px - ux * back - uz * off;
  out.z = pz - uz * back + ux * off;
  out.y = Math.max(py, sy) + 0.3;
  const ax = px + ux * D * 0.5;
  const az = pz + uz * D * 0.5;
  const ay = (py + sy) / 2;
  out.yaw = Math.atan2(-(ax - out.x), -(az - out.z));
  const tanH = Math.tan((fovV * Math.PI) / 360);
  out.pitch = Math.atan2(ay - out.y, Math.hypot(ax - out.x, az - out.z)) - Math.atan(0.22 * tanH);
  return out;
}

export interface RigInput {
  /** Feet (interpolated). */
  x: number;
  y: number;
  z: number;
  /** Pivot height above the feet (the stance's eye height). */
  eye: number;
  yaw: number;
  pitch: number;
  dt: number;
  reducedMotion: boolean;
  /** Spirit view: fly as a free eye. */
  flying: boolean;
}

/** What the rig did last frame (debug hook `kq.camera`, e2e). */
export interface RigDebug {
  /** Boom length before the rise / crane (m). */
  distance: number;
  /** Lens to the character's head (m). */
  head: number;
  /** Rise over the shoulder (squeeze), crane over the ground, lift over a passing enemy (m). */
  rise: number;
  crane: number;
  enemyLift: number;
  /** Extra pitch that keeps the head in frame (rad). */
  tilt: number;
  /** 0..1 indoor preset, 0..1 conversation two-shot. */
  indoor: number;
  focus: number;
  /** The character's walkable space (−1 outdoors) and the lens's. */
  space: number;
  lensSpace: number;
}

export class CameraRig {
  mode: CameraMode = 'third';
  /** Boom length the player chose (wheel). */
  zoom = 3.6;
  /** Current boom length after collision and smoothing (m; 0 in first person). */
  distance = 0;
  /** Smoothed fight pull-back (m) and lift (m). */
  private pull = 0;
  private lift = 0;
  /** Smoothed extra lift that carries the boom over a big body (m). */
  private bodyLift = 0;
  /** Smoothed shoulder offset (shrinks when a wall is at the right shoulder, and in a two-shot). */
  private shoulder = SHOULDER;
  private readonly pivot = new Vector3();
  private pivotInit = false;
  /** 0..1 how far a conversation's two-shot has taken over the view. */
  private focusMix = 0;
  /** The two-shot's side (+1 / −1, chosen when a conversation starts) and its smoothed camera. */
  private shotSide = 1;
  private readonly shot = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  private shotInit = false;
  /** Smoothed: squeeze rise, terrain crane, lift over an enemy at the lens, keep-in-frame tilt, indoor preset. */
  private rise = 0;
  private crane = 0;
  private enemyLift = 0;
  private tilt = 0;
  private indoor = 0;
  /** Effective mode last frame (the avatar hides in first person). */
  thirdPerson = false;
  readonly debug: RigDebug = { distance: 0, head: 0, rise: 0, crane: 0, enemyLift: 0, tilt: 0, indoor: 0, focus: 0, space: -1, lensSpace: -1 };
  /** The last camera placement that was finite (F-15: a NaN never reaches the camera). */
  private readonly good = new Vector3();
  private goodYaw = 0;
  private goodPitch = 0;
  private goodInit = false;
  /** Photo mode (src/systems/photo): the lens at the phone, the character hidden. */
  private photo = false;
  /** Wanted and current field-of-view narrowing (1 = the settings' fov, 2 = the phone's 2×). */
  private fovWant = 1;
  private fovK = 1;
  /** The fov the settings set (read back whenever someone else wrote camera.fov) and the one we set. */
  private fovBase = 0;
  private fovSet = -1;

  /** Photo mode on / off (src/systems/photo). Off restores the boom from scratch. */
  setPhoto(on: boolean): void {
    if (on === this.photo) return;
    this.photo = on;
    this.pivotInit = false;
  }

  get photoMode(): boolean {
    return this.photo;
  }

  /** Narrow the field of view k-fold (≥ 1; photo zoom). 1 = the settings' fov. */
  setFovScale(k: number): void {
    this.fovWant = Number.isFinite(k) ? Math.max(1, Math.min(4, k)) : 1;
  }

  /**
   * End the fov narrowing now (photo mode's forced close): scale 1, the base (settings) fov
   * written to the camera in this call, no easing and no later writes. A camera the rig never
   * narrowed is left alone.
   */
  snapFov(camera: PerspectiveCamera): void {
    if (this.fovSet >= 0) {
      // somebody else (the settings) wrote the fov since our last write: that is the base
      if (camera.fov !== this.fovSet) this.fovBase = camera.fov;
      const base = this.fovBase || 70;
      if (camera.fov !== base) {
        camera.fov = base;
        camera.updateProjectionMatrix();
      }
    }
    this.fovWant = 1;
    this.fovK = 1;
    this.fovSet = -1;
  }

  get fovScale(): number {
    return this.fovK;
  }

  /** The narrowing asked for (setFovScale), before easing. */
  get fovWanted(): number {
    return this.fovWant;
  }

  /** Apply the fov narrowing (only while one is wanted or still easing back). */
  private applyFov(camera: PerspectiveCamera, dt: number, instant: boolean): void {
    if (this.fovWant === 1 && this.fovK === 1 && this.fovSet < 0) return;
    // somebody else (the settings) wrote the fov: that is the new base
    if (camera.fov !== this.fovSet) this.fovBase = camera.fov;
    this.fovK = instant ? this.fovWant : this.fovK + (this.fovWant - this.fovK) * Math.min(1, dt * 12);
    if (Math.abs(this.fovK - this.fovWant) < 0.002) this.fovK = this.fovWant;
    const base = this.fovBase || 70;
    const fov = this.fovK === 1 ? base : (2 * Math.atan(Math.tan((base * Math.PI) / 360) / this.fovK) * 180) / Math.PI;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    // back at the base: hand the fov back to the settings
    this.fovSet = this.fovK === 1 && this.fovWant === 1 ? -1 : camera.fov;
  }

  /** Photo mode: the lens at the phone (eyes, a hand ahead), looking along the player's view. */
  private placePhoto(camera: PerspectiveCamera, o: RigInput, world: CameraWorld): void {
    const fx = -Math.sin(o.yaw);
    const fz = -Math.cos(o.yaw);
    let x = o.x + fx * PHOTO_AHEAD;
    let z = o.z + fz * PHOTO_AHEAD;
    // a wall right in front of the face: the phone stays at the eyes
    if (world.blocked(x, z, 0.08)) {
      x = o.x;
      z = o.z;
    }
    let y = o.y + Math.max(0.5, o.eye - PHOTO_DROP);
    y = Math.max(y, world.heightAt(x, z, o.y) + CLEAR);
    if (!Number.isFinite(x + y + z)) {
      this.fallBack(camera);
      return;
    }
    camera.position.set(x, y, z);
    camera.rotation.set(o.pitch, o.yaw, 0, 'YXZ');
    this.distance = 0;
    this.pivotInit = false;
    this.focusMix = 0;
    this.shotInit = false;
    this.good.copy(camera.position);
    this.goodYaw = o.yaw;
    this.goodPitch = o.pitch;
    this.goodInit = true;
    this.debug.distance = 0;
    this.debug.head = 0;
  }

  /** Wheel notches → zoom. */
  addZoom(notches: number): void {
    if (!notches || !Number.isFinite(notches)) return;
    // photo mode: the wheel is the phone's 1× / 2× (away from you = 2×); the boom keeps its length
    if (this.photo) {
      this.setFovScale(notches < 0 ? 2 : 1);
      return;
    }
    this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoom * Math.pow(1.12, notches)));
  }

  /** Snap the smoothing (teleports, loads). */
  reset(): void {
    this.pivotInit = false;
    this.distance = 0;
  }

  /** Is (x, z) at height y free for the lens: no wall, and in the character's walkable space? */
  private free(world: CameraWorld, x: number, z: number, feetY: number, space0: number): boolean {
    if (world.blocked(x, z, CLEAR * 0.8)) return false;
    if (world.space && space0 !== -2 && world.space(x, z, feetY) !== space0) return false;
    return true;
  }

  /** Free fraction (0..1) of the straight line a → b for the lens (walls and spaces only). */
  private sweep(world: CameraWorld, ax: number, az: number, bx: number, bz: number, feetY: number, space0: number): number {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(L / STEP));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (!this.free(world, ax + (bx - ax) * t, az + (bz - az) * t, feetY, space0)) return Math.max(0, (i - 1) / n - 0.25 / Math.max(L, 0.25));
    }
    return 1;
  }

  /** Back to the last good placement and restart every smoothed state (F-15). */
  private fallBack(camera: PerspectiveCamera): void {
    if (this.goodInit) {
      camera.position.copy(this.good);
      camera.rotation.set(this.goodPitch, this.goodYaw, 0, 'YXZ');
    }
    this.pivotInit = false;
    this.distance = this.zoom;
    this.pull = this.lift = this.bodyLift = 0;
    this.rise = this.crane = this.enemyLift = this.tilt = this.indoor = 0;
    this.shoulder = SHOULDER;
    this.focusMix = 0;
    this.shotInit = false;
  }

  /** Place the camera. Returns true in third person. */
  update(camera: PerspectiveCamera, o: RigInput, world: CameraWorld, hints: CameraHints = cameraHints): boolean {
    const dt = safeDt(o.dt);
    const third = this.mode === 'third' && !o.flying;
    this.thirdPerson = third;
    if (!Number.isFinite(this.zoom)) this.zoom = 3.6;
    // a broken input (NaN feet or look): hold the last good camera rather than pass it on (F-15)
    if (!Number.isFinite(o.x + o.y + o.z + o.yaw + o.pitch + o.eye)) {
      this.fallBack(camera);
      return third;
    }
    this.applyFov(camera, dt, o.reducedMotion);
    if (this.photo && !o.flying) {
      this.placePhoto(camera, o, world);
      return third;
    }
    camera.rotation.set(o.pitch, o.yaw, 0, 'YXZ');
    if (!third) {
      camera.position.set(o.x, o.y + o.eye, o.z);
      this.distance = 0;
      this.pivotInit = false;
      this.focusMix = 0;
      this.shotInit = false;
      this.good.copy(camera.position);
      this.goodYaw = o.yaw;
      this.goodPitch = o.pitch;
      this.goodInit = true;
      return false;
    }
    const snap = !this.pivotInit;
    // pivot: the head, smoothed a little in height only (steps and slopes do not jolt the view)
    const py = o.y + Math.max(0.55, o.eye * 0.94 + 0.08);
    if (!this.pivotInit || Math.abs(this.pivot.y - py) > 3 || Math.hypot(this.pivot.x - o.x, this.pivot.z - o.z) > 6) {
      this.pivot.set(o.x, py, o.z);
      this.pivotInit = true;
      this.distance = this.zoom;
      this.rise = this.crane = this.enemyLift = this.tilt = 0;
    } else {
      this.pivot.x = o.x;
      this.pivot.z = o.z;
      this.pivot.y += (py - this.pivot.y) * Math.min(1, dt * 14);
    }
    const instant = o.reducedMotion || snap;
    // a room over the character: the closer, higher indoor preset (F-31)
    const ceilAt = world.ceiling?.(o.x, o.z, o.y) ?? null;
    const ceil = ceilAt !== null && Number.isFinite(ceilAt) ? ceilAt : null;
    this.indoor = ease(this.indoor, ceil !== null ? 1 : 0, 3, 3, dt, instant);
    const ind = this.indoor;
    // the character's walkable space (a door's reveal counts as the side the boom comes from)
    let space0 = world.space?.(o.x, o.z, o.y) ?? -1;
    // fight framing: pull back until every enemy near the player fits, and lift the view
    let wantPull = 0;
    let wantLift = 0;
    if (hints.fight.length) {
      let spread = 0;
      let top = 0;
      for (const e of hints.fight) {
        const d = Math.hypot(e.x - o.x, e.z - o.z) + e.r;
        if (!(d <= 16) || !Number.isFinite(e.top)) continue;
        spread = Math.max(spread, d);
        top = Math.max(top, e.top);
      }
      if (spread > 0) {
        wantPull = Math.min(3.4, 0.8 + Math.max(0, spread - 2.5) * 0.32 + Math.max(0, top - 2) * 0.35);
        wantLift = Math.min(1.0, 0.45 + Math.max(0, top - 2) * 0.12);
      }
    }
    if (hints.boss > 0 && Number.isFinite(hints.boss)) {
      wantPull = Math.max(wantPull, Math.min(4.5, 1.2 + hints.boss * 0.6));
      wantLift = Math.max(wantLift, Math.min(1.2, 0.35 + hints.boss * 0.15));
    }
    const hf = hints.focus;
    const focus = hf && Number.isFinite(hf.x + hf.y + hf.z) ? hf : null;
    if (focus) {
      wantPull = 0;
      wantLift = 0;
    }
    // rooms are small: a fight indoors pulls back less
    wantPull *= 1 - 0.6 * ind;
    const fe = o.reducedMotion ? 1 : Math.min(1, dt * (wantPull > this.pull ? 2.2 : 1.1));
    this.pull += (wantPull - this.pull) * fe;
    this.lift += (wantLift - this.lift) * fe;
    const boom = this.zoom + this.pull + (Math.min(this.zoom, INDOOR_BOOM) - this.zoom) * ind;
    let wantShoulder = hints.fight.length || hints.boss > 0 ? SHOULDER_FIGHT : SHOULDER;
    wantShoulder += (INDOOR_SHOULDER - wantShoulder) * ind;

    const cy = Math.cos(o.yaw);
    const sy = Math.sin(o.yaw);
    const cp = Math.cos(o.pitch);
    _f.set(-sy * cp, Math.sin(o.pitch), -cy * cp);
    _r.set(cy, 0, -sy);
    if (space0 === -2 && world.space) {
      // standing in a doorway: the side behind the character is the space the boom keeps to
      space0 = world.space(o.x + sy * 0.9, o.z + cy * 0.9, o.y);
    }
    // the shoulder: shrink it when a wall stands right beside the head, and as the boom gets short
    // (a short boom at full offset would park the lens beside the ear)
    wantShoulder *= 0.45 + 0.55 * smooth01(BOOM_MIN, NEAR_COMFORT + 0.4, this.distance);
    const probeShoulder = Math.max(this.shoulder, wantShoulder);
    for (let k = 1; k >= 0; k -= 0.25) {
      const allowed = probeShoulder * k;
      const sx = this.pivot.x + _r.x * allowed;
      const sz = this.pivot.z + _r.z * allowed;
      if (k === 0 || this.free(world, sx, sz, o.y, space0)) {
        wantShoulder = Math.min(wantShoulder, allowed);
        this.shoulder = Math.min(this.shoulder, allowed);
        break;
      }
    }
    this.shoulder += (wantShoulder - this.shoulder) * Math.min(1, dt * 6);
    _s.copy(this.pivot).addScaledVector(_r, this.shoulder);
    _s.y += LIFT + this.lift + INDOOR_LIFT * ind;
    if (ceil !== null) _s.y = Math.min(_s.y, Math.max(this.pivot.y, ceil - CLEAR - 0.1));
    // a big body (a boss) between the lens and the character: the boom goes over it, not through
    // it (playtest round 9: the camera sat inside the Pikeur's ghost horse)
    let needLift = 0;
    for (const b of hints.bodies ?? []) {
      if (!Number.isFinite(b.x + b.z + b.r + b.top)) continue;
      for (let t = 0.6; t <= boom; t += 0.4) {
        const x = _s.x - _f.x * t;
        const z = _s.z - _f.z * t;
        if (Math.hypot(x - b.x, z - b.z) > b.r + 0.5) continue;
        const top = world.heightAt(b.x, b.z) + b.top + 0.4;
        const y = _s.y + this.bodyLift - _f.y * t;
        needLift = Math.max(needLift, finiteOr(Math.min(3, top - (y - this.bodyLift)), 0));
      }
    }
    this.bodyLift += (Math.max(0, needLift) - this.bodyLift) * Math.min(1, dt * (needLift > this.bodyLift ? 4 : 1.2));
    _s.y += this.bodyLift;
    // the boom: sweep from the shoulder back along the view; a wall or the edge of the character's
    // space ends it. The ground does not: rising ground behind cranes the boom up instead (needs
    // def / t per metre of boom), unless that would take more than CRANE_MAX (a real ridge).
    let free = boom;
    let craneK = 0;
    const steps = Math.max(1, Math.ceil(boom / STEP));
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * boom;
      const x = _s.x - _f.x * t;
      const y = _s.y - _f.y * t;
      const z = _s.z - _f.z * t;
      if (!this.free(world, x, z, o.y, space0)) {
        free = Math.max(BOOM_MIN, t - 0.2);
        break;
      }
      if (t > 0.5) {
        const def = world.heightAt(x, z, o.y) + CLEAR + 0.12 - y;
        if (def > 0) craneK = Math.max(craneK, def / t);
        // the crane a boom this long would need is too much: end the boom where it still fits
        if (craneK * t > CRANE_MAX) {
          free = Math.max(BOOM_MIN, Math.min(t - 0.2, CRANE_MAX / craneK));
          break;
        }
      }
    }
    // in at once, out gently (no pumping when the boom grazes a corner)
    if (free < this.distance || snap) this.distance = free;
    else this.distance += (free - this.distance) * Math.min(1, dt * (o.reducedMotion ? 6 : 2.5));
    this.crane = ease(this.crane, Math.min(CRANE_MAX, craneK * this.distance), 10, 2, dt, instant);
    // never inside the head: a short boom rises over the shoulder
    this.rise = ease(this.rise, squeezeRise(this.distance), 8, 2.5, dt, instant);
    _c.copy(_s).addScaledVector(_f, -this.distance);
    _c.y += Math.max(this.crane, this.rise);
    // an enemy passing the lens: lift over it rather than look through its body (F-08)
    let wantEnemy = 0;
    for (const e of hints.fight) {
      const dh = Math.hypot(_c.x - e.x, _c.z - e.z) - e.r;
      if (!(dh <= ENEMY_CLEAR)) continue;
      const over = world.heightAt(e.x, e.z, o.y) + e.top + 0.5 - (_c.y + this.enemyLift);
      if (over > 0) wantEnemy = Math.max(wantEnemy, Math.min(1.3, this.enemyLift + over) * (1 - smooth01(0.5, ENEMY_CLEAR, dh)));
    }
    this.enemyLift = ease(this.enemyLift, wantEnemy, 7, 1.5, dt, instant);
    _c.y += this.enemyLift;
    // never below the ground (slopes behind you lift the camera instead), never through the ceiling
    const g = world.heightAt(_c.x, _c.z, o.y) + CLEAR + 0.12;
    if (_c.y < g) _c.y = g;
    if (ceil !== null && _c.y > ceil - CLEAR) _c.y = Math.max(o.y + 0.4, ceil - CLEAR);
    // the view: the player's look, tilted just enough to keep the head in frame
    const fov = camera.fov || 70;
    const wantTilt = frameTilt(_c.x, _c.y, _c.z, this.pivot.x, this.pivot.y, this.pivot.z, o.yaw, o.pitch, fov, -0.5);
    this.tilt = ease(this.tilt, wantTilt, 10, 10, dt, instant);
    let yaw = o.yaw;
    let pitch = Math.max(PITCH_MIN_3P - 0.45, Math.min(PITCH_MAX_3P + 0.2, o.pitch + this.tilt));
    let px = _c.x;
    let pyC = _c.y;
    let pz = _c.z;
    // a conversation: a two-shot from the side, eased in and out (F-31)
    this.focusMix += ((focus ? 1 : 0) - this.focusMix) * (o.reducedMotion ? 1 : Math.min(1, dt * (focus ? 3 : 2)));
    if (focus) this.frameTwoShot(world, focus, o, space0, ceil, fov, dt);
    if (this.focusMix > 0.002 && this.shotInit) {
      const k = this.focusMix * this.focusMix * (3 - 2 * this.focusMix);
      px += (this.shot.x - px) * k;
      pyC += (this.shot.y - pyC) * k;
      pz += (this.shot.z - pz) * k;
      let dy = this.shot.yaw - yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw += dy * k;
      pitch += (this.shot.pitch - pitch) * k;
    } else if (!focus) this.shotInit = false;
    // a NaN that slipped through (the world's heights, a probe): keep the last good camera (F-15)
    if (!Number.isFinite(px + pyC + pz + pitch + yaw)) {
      this.fallBack(camera);
      return true;
    }
    camera.position.set(px, pyC, pz);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    this.good.set(px, pyC, pz);
    this.goodYaw = yaw;
    this.goodPitch = pitch;
    this.goodInit = true;
    const d = this.debug;
    d.distance = this.distance;
    d.head = Math.hypot(px - this.pivot.x, pyC - this.pivot.y, pz - this.pivot.z);
    d.rise = this.rise;
    d.crane = this.crane;
    d.enemyLift = this.enemyLift;
    d.tilt = this.tilt;
    d.indoor = ind;
    d.focus = this.focusMix;
    d.space = space0;
    d.lensSpace = world.space?.(px, pz, o.y) ?? -1;
    return true;
  }

  /** Free fraction of the two-shot on one side (leaves the shot in `_shot`). */
  private shotRoom(world: CameraWorld, focus: { x: number; z: number }, fy: number, side: number, feetY: number, space0: number, fov: number): number {
    const P = this.pivot;
    twoShot(P.x, P.y, P.z, focus.x, fy, focus.z, side, fov, _shot);
    return this.sweep(world, P.x, P.z, _shot.x, _shot.z, feetY, space0);
  }

  /** The conversation's camera (this.shot): the two-shot on the side with room, else over the shoulder. */
  private frameTwoShot(world: CameraWorld, focus: { x: number; y: number; z: number }, o: RigInput, space0: number, ceil: number | null, fov: number, dt: number): void {
    const P = this.pivot;
    const fy = Math.max(focus.y, o.y + 1.2);
    // the side: chosen when the conversation starts (the shoulder side unless the other has more room)
    if (!this.shotInit) {
      const a = this.shotRoom(world, focus, fy, 1, o.y, space0, fov);
      const b = this.shotRoom(world, focus, fy, -1, o.y, space0, fov);
      this.shotSide = a >= 0.95 || a >= b - 0.05 ? 1 : -1;
    }
    let f = this.shotRoom(world, focus, fy, this.shotSide, o.y, space0, fov);
    if (f < 0.55) {
      const other = this.shotRoom(world, focus, fy, -this.shotSide, o.y, space0, fov);
      if (other > f + 0.2) {
        this.shotSide = -this.shotSide;
        f = other;
      }
    }
    twoShot(P.x, P.y, P.z, focus.x, fy, focus.z, this.shotSide, fov, _shot);
    if (f < 0.55) {
      // no room for a two-shot (a narrow passage): over the shoulder, the speaker beyond the head
      const ux = focus.x - P.x;
      const uz = focus.z - P.z;
      const D = Math.max(0.6, Math.hypot(ux, uz));
      const rx = -uz / D;
      const rz = ux / D;
      _shot.x = P.x - (ux / D) * 1.7 + rx * 0.55 * this.shotSide;
      _shot.z = P.z - (uz / D) * 1.7 + rz * 0.55 * this.shotSide;
      _shot.y = P.y + 0.45;
      f = this.sweep(world, P.x, P.z, _shot.x, _shot.z, o.y, space0);
      const tx = focus.x - rx * 0.35 * this.shotSide;
      const tz = focus.z - rz * 0.35 * this.shotSide;
      _shot.yaw = Math.atan2(-(tx - _shot.x), -(tz - _shot.z));
      _shot.pitch = Math.atan2(fy - 0.15 - _shot.y, Math.hypot(tx - _shot.x, tz - _shot.z)) - 0.12;
    }
    // stop in front of what the sweep met (the view keeps its aim)
    const k = Math.max(0.35, Math.min(1, f));
    _shot.x = P.x + (_shot.x - P.x) * k;
    _shot.z = P.z + (_shot.z - P.z) * k;
    const g = world.heightAt(_shot.x, _shot.z, o.y) + CLEAR + 0.12;
    if (_shot.y < g) _shot.y = g;
    if (ceil !== null && _shot.y > ceil - CLEAR) _shot.y = Math.max(o.y + 0.4, ceil - CLEAR);
    const s = this.shot;
    if (!this.shotInit || o.reducedMotion) {
      s.x = _shot.x;
      s.y = _shot.y;
      s.z = _shot.z;
      s.yaw = _shot.yaw;
      s.pitch = _shot.pitch;
      this.shotInit = true;
      return;
    }
    const e = Math.min(1, dt * 4);
    s.x += (_shot.x - s.x) * e;
    s.y += (_shot.y - s.y) * e;
    s.z += (_shot.z - s.z) * e;
    let dy = _shot.yaw - s.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    s.yaw += dy * e;
    s.pitch += (_shot.pitch - s.pitch) * e;
  }
}

/** Unit forward of a yaw (0 = −z), for tests and the avatar. */
export function yawForward(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}
