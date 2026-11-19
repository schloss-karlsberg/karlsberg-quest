import { type PerspectiveCamera, Vector3 } from 'three';

/**
 * Third-person action camera (playtest round 8: first-person melee was unreadable — enemies sat
 * under the camera, behind the lantern or the HUD). An over-the-shoulder spring arm:
 *
 * - **pivot** at the character's head (stance height), the boom offset to the right shoulder so
 *   the character stands left of the crosshair and the view ahead stays open;
 * - **look** is the player's yaw / pitch (mouse, keyboard look) — the crosshair ray stays parallel to
 *   the first-person one, so measuring and examining aim as before;
 * - **collision**: the boom is marched from the shoulder to the wanted camera spot against the
 *   terrain, the footprint walls / props / interior walls (`blocked`), tree trunks and an indoor
 *   ceiling; the camera stops in front of the first hit (pulls in at once, lets out slowly), so
 *   it is never inside a wall, a tree or a hill;
 * - **zoom** (wheel) 1.8–8 m; **fights** pull the boom back and up so every nearby enemy fits
 *   (`hints.fight`, written by combat each frame); a **conversation** (`hints.focus`, npc) tightens
 *   to a two-shot over the shoulder onto the speaker.
 *
 * First person (`mode = 'first'`, settings „Kamera“) and the spirit view keep the old eye camera.
 * Pure maths over a small world interface (tests/camera.test.ts).
 */
export type CameraMode = 'third' | 'first';

export interface CameraWorld {
  heightAt(x: number, z: number): number;
  /** Is a circle (x, z, r) inside a wall, a building footprint, a prop or an interior wall? */
  blocked(x: number, z: number, r: number): boolean;
  /** Tree trunks near a point: calls `fn(x, z, radius, top)` for each (top = trunk top height). */
  trunks?(x: number, z: number, r: number, fn: (tx: number, tz: number, tr: number, top: number) => void): void;
  /** Highest the camera may be at the player's spot (a room's ceiling), or null outdoors. */
  ceiling?(x: number, z: number, feetY: number): number | null;
}

/** Written by systems each frame (one frame late is fine): what the camera should frame. */
export interface CameraHints {
  /** Enemies in the fight (x, z, body radius, top height above the feet); [] = no fight. */
  fight: { x: number; z: number; r: number; top: number }[];
  /** A conversation partner's head (npc): the camera tightens to an over-the-shoulder two-shot. */
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
/** Closest the camera may come to a wall / trunk / the ground (m). */
const CLEAR = 0.28;
/** Shortest boom: closer than this and the character's head would fill the view (it fades). */
export const BOOM_MIN = 0.55;

const _f = new Vector3();
const _r = new Vector3();
const _s = new Vector3();
const _c = new Vector3();

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
  private focusYaw = 0;
  private focusPitch = 0;
  /** Effective mode last frame (the avatar hides in first person). */
  thirdPerson = false;

  /** Wheel notches → zoom. */
  addZoom(notches: number): void {
    if (!notches) return;
    this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoom * Math.pow(1.12, notches)));
  }

  /** Snap the smoothing (teleports, loads). */
  reset(): void {
    this.pivotInit = false;
    this.distance = 0;
  }

  /** Place the camera. Returns true in third person. */
  update(camera: PerspectiveCamera, o: RigInput, world: CameraWorld, hints: CameraHints = cameraHints): boolean {
    const dt = Math.min(0.1, Math.max(0, o.dt));
    const third = this.mode === 'third' && !o.flying;
    this.thirdPerson = third;
    camera.rotation.set(o.pitch, o.yaw, 0, 'YXZ');
    if (!third) {
      camera.position.set(o.x, o.y + o.eye, o.z);
      this.distance = 0;
      this.pivotInit = false;
      return false;
    }
    // pivot: the head, smoothed a little in height only (steps and slopes do not jolt the view)
    const py = o.y + Math.max(0.55, o.eye * 0.94 + 0.08);
    if (!this.pivotInit || Math.abs(this.pivot.y - py) > 3 || Math.hypot(this.pivot.x - o.x, this.pivot.z - o.z) > 6) {
      this.pivot.set(o.x, py, o.z);
      this.pivotInit = true;
      this.distance = this.zoom;
    } else {
      this.pivot.x = o.x;
      this.pivot.z = o.z;
      this.pivot.y += (py - this.pivot.y) * Math.min(1, dt * 14);
    }
    // fight framing: pull back until every enemy near the player fits, and lift the view
    let wantPull = 0;
    let wantLift = 0;
    if (hints.fight.length) {
      let spread = 0;
      let top = 0;
      for (const e of hints.fight) {
        const d = Math.hypot(e.x - o.x, e.z - o.z) + e.r;
        if (d > 16) continue;
        spread = Math.max(spread, d);
        top = Math.max(top, e.top);
      }
      if (spread > 0) {
        wantPull = Math.min(3.4, 0.8 + Math.max(0, spread - 2.5) * 0.32 + Math.max(0, top - 2) * 0.35);
        wantLift = Math.min(1.0, 0.45 + Math.max(0, top - 2) * 0.12);
      }
    }
    if (hints.boss > 0) {
      wantPull = Math.max(wantPull, Math.min(4.5, 1.2 + hints.boss * 0.6));
      wantLift = Math.max(wantLift, Math.min(1.2, 0.35 + hints.boss * 0.15));
    }
    const focus = hints.focus;
    if (focus) {
      wantPull = 0;
      wantLift = 0;
    }
    const ease = o.reducedMotion ? 1 : Math.min(1, dt * (wantPull > this.pull ? 2.2 : 1.1));
    this.pull += (wantPull - this.pull) * ease;
    this.lift += (wantLift - this.lift) * ease;
    // a conversation: a tighter boom, a wider shoulder (the speaker sits in the open right half)
    const boom = focus ? Math.min(this.zoom, 2.4) : this.zoom + this.pull;
    let wantShoulder = focus ? 0.78 : hints.fight.length || hints.boss > 0 ? SHOULDER_FIGHT : SHOULDER;

    // a conversation: the boom lies along the line from the speaker through the player (an
    // over-the-shoulder shot that faces the speaker), and on the shoulder side with more room
    // (playtest round 9: in the Registratur 70 % of the two-shot was plaster, Soll behind a jamb)
    let byaw = o.yaw;
    let bpitch = o.pitch;
    if (focus) {
      byaw = Math.atan2(-(focus.x - o.x), -(focus.z - o.z));
      bpitch = -0.12;
      const room = (side: number) => {
        const rx = Math.cos(byaw) * side;
        const rz = -Math.sin(byaw) * side;
        const fx = -Math.sin(byaw);
        const fz = -Math.cos(byaw);
        let t = 0;
        for (; t < boom + wantShoulder; t += 0.25) {
          const x = o.x + rx * Math.min(t, wantShoulder) - fx * Math.max(0, t - wantShoulder);
          const z = o.z + rz * Math.min(t, wantShoulder) - fz * Math.max(0, t - wantShoulder);
          if (world.blocked(x, z, CLEAR)) break;
        }
        return t;
      };
      if (room(-1) > room(1) + 0.5) wantShoulder = -wantShoulder;
    }
    const cy = Math.cos(byaw);
    const sy = Math.sin(byaw);
    const cp = Math.cos(bpitch);
    _f.set(-sy * cp, Math.sin(bpitch), -cy * cp);
    _r.set(cy, 0, -sy);
    // the shoulder: shrink it when a wall stands right beside the head
    for (let k = 1; k >= 0; k -= 0.25) {
      const sx = this.pivot.x + _r.x * wantShoulder * k;
      const sz = this.pivot.z + _r.z * wantShoulder * k;
      if (k === 0 || !world.blocked(sx, sz, CLEAR)) {
        wantShoulder *= k;
        break;
      }
    }
    this.shoulder += (wantShoulder - this.shoulder) * Math.min(1, dt * 6);
    _s.copy(this.pivot).addScaledVector(_r, this.shoulder);
    _s.y += LIFT + this.lift;
    // a big body (a boss) between the lens and the character: the boom goes over it, not through
    // it (playtest round 9: the camera sat inside the Pikeur's ghost horse)
    let needLift = 0;
    for (const b of hints.bodies ?? []) {
      for (let t = 0.6; t <= boom; t += 0.4) {
        const x = _s.x - _f.x * t;
        const z = _s.z - _f.z * t;
        if (Math.hypot(x - b.x, z - b.z) > b.r + 0.5) continue;
        const top = world.heightAt(b.x, b.z) + b.top + 0.4;
        const y = _s.y + this.bodyLift - _f.y * t;
        needLift = Math.max(needLift, Math.min(3, top - (y - this.bodyLift)));
      }
    }
    this.bodyLift += (Math.max(0, needLift) - this.bodyLift) * Math.min(1, dt * (needLift > this.bodyLift ? 4 : 1.2));
    _s.y += this.bodyLift;
    // the boom: march from the shoulder back along the view; the first obstacle ends it
    const ceil = world.ceiling?.(o.x, o.z, o.y) ?? null;
    let free = boom;
    const steps = Math.ceil(boom / 0.2);
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * boom;
      const x = _s.x - _f.x * t;
      const y = _s.y - _f.y * t;
      const z = _s.z - _f.z * t;
      let hit = false;
      // the ground: a little under it the camera slides up (below); deep under it is a ridge
      // between the camera and the character, which ends the boom
      if (y < world.heightAt(x, z) - 0.6) hit = true;
      if (!hit && ceil !== null && y > ceil - CLEAR) hit = true;
      if (!hit && world.blocked(x, z, CLEAR * 0.8)) hit = true;
      if (!hit && world.trunks) {
        world.trunks(x, z, 1.2, (tx, tz, tr, top) => {
          if (!hit && y < top && Math.hypot(x - tx, z - tz) < tr + CLEAR) hit = true;
        });
      }
      if (hit) {
        free = Math.max(BOOM_MIN, t - 0.2);
        break;
      }
    }
    // in at once, out gently (no pumping when a trunk slides past)
    if (free < this.distance) this.distance = free;
    else this.distance += (free - this.distance) * Math.min(1, dt * (o.reducedMotion ? 6 : 2.5));
    _c.copy(_s).addScaledVector(_f, -this.distance);
    // never below the ground (slopes behind you lift the camera instead)
    const g = world.heightAt(_c.x, _c.z) + CLEAR + 0.12;
    if (_c.y < g) _c.y = g;
    if (ceil !== null && _c.y > ceil - CLEAR) _c.y = Math.max(o.y + 0.4, ceil - CLEAR);
    camera.position.copy(_c);
    // a conversation: ease the view onto the speaker's face (the shoulder shot frames both)
    if (focus) {
      const dx = focus.x - _c.x;
      const dz = focus.z - _c.z;
      this.focusYaw = Math.atan2(-dx, -dz);
      this.focusPitch = Math.max(-0.6, Math.min(0.5, Math.atan2(focus.y - _c.y, Math.hypot(dx, dz))));
    }
    this.focusMix += ((focus ? 1 : 0) - this.focusMix) * (o.reducedMotion ? 1 : Math.min(1, dt * (focus ? 3 : 2)));
    if (this.focusMix > 0.002) {
      const k = this.focusMix * this.focusMix * (3 - 2 * this.focusMix);
      let dy = this.focusYaw - o.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      camera.rotation.set(o.pitch + (this.focusPitch - o.pitch) * k, o.yaw + dy * k, 0, 'YXZ');
    }
    return true;
  }
}

/** Unit forward of a yaw (0 = −z), for tests and the avatar. */
export function yawForward(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}
