/**
 * The camera override slot of boot.ts and the production takeover on top of it (`ctx.cinematic`).
 *
 * Per drawn frame boot runs `player.applyCamera` (the third-person rig places the camera), then the
 * slot's function. The takeover's function calls the owner's shot; after a release it eases the
 * last shot into the rig's placement for 0.4 s (the rig never stopped running, so its result is
 * what the camera holds when the slot runs) and then frees the slot. Reduced motion: a cut.
 *
 * `OverrideSlot` emits `camera:override { active }` on every real change between free and taken
 * (takeover, auto-release, the debug `setCamera`); kq-mobile's photo mode listens.
 *
 * No three.js scene access, no DOM: tests/cinematic-system.test.ts drives it with a bare camera.
 */
import { type PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { CinematicCamera, TakeCameraOptions } from '../../core/context';
import type { EventBus } from '../../core/events';
import './types';

export type CameraFn = (cam: PerspectiveCamera) => void;

/** Seconds of the hand-back from the last shot to the rig. */
export const HANDBACK_S = 0.4;

/** boot.ts's single camera override slot; emits `camera:override` on real transitions only. */
export class OverrideSlot {
  private cur: CameraFn | null = null;

  constructor(
    private readonly emit: (active: boolean) => void,
    private readonly changed?: () => void,
  ) {}

  get fn(): CameraFn | null {
    return this.cur;
  }

  set(fn: CameraFn | null): void {
    const was = this.cur !== null;
    this.cur = fn;
    this.changed?.();
    if (was !== (fn !== null)) this.emit(fn !== null);
  }
}

export interface TakeoverPlayer {
  frozen: boolean;
  lookLocked: boolean;
  yaw: number;
  pitch: number;
}

export interface TakeoverDeps {
  slot: OverrideSlot;
  player: TakeoverPlayer;
  events: Pick<EventBus, 'on'>;
  reducedMotion: () => boolean;
  /** ms clock for the hand-back (render time, default performance.now). */
  now?: () => number;
  requestRender?: () => void;
  /** True while the title screen shows (boot's 'title' pause reason): its backdrop drift owns the view, takes are refused. */
  titleActive?: () => boolean;
}

const finiteV = (v: Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const finiteQ = (q: Quaternion) => Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w);

export class CameraTakeover implements CinematicCamera {
  private owner: string | null = null;
  private fn: CameraFn | null = null;
  private opts: TakeCameraOptions = {};
  private saved: TakeoverPlayer | null = null;
  /** The last good shot (for the hand-back and the NaN guard). */
  private readonly shotP = new Vector3();
  private readonly shotQ = new Quaternion();
  private shotFov = 0;
  private hasShot = false;
  /** The camera fov when taken (restored at the end of the hand-back). */
  private baseFov = 0;
  private readonly preP = new Vector3();
  private readonly preQ = new Quaternion();
  private readonly tmpQ = new Quaternion();
  private blend: { t0: number; dur: number } | null = null;
  private avatar = true;
  private readonly now: () => number;

  constructor(private readonly deps: TakeoverDeps) {
    this.now = deps.now ?? (() => performance.now());
    deps.events.on('shift:done', () => this.releaseAny('shift'));
    deps.events.on('era:change', () => this.releaseAny('era'));
    deps.events.on('player:died', () => this.releaseAny('death'));
    deps.events.on('save:loaded', () => this.releaseAny('load'));
  }

  get cameraOwner(): string | null {
    return this.owner;
  }

  /**
   * Is the slot's function ours and should the character be drawn (boot's `avatar.frame`)? During
   * the hand-back always: a `showAvatar: false` shot gets the character back as the ease starts, not
   * popping in at its end.
   */
  showsAvatar(fn: CameraFn | null): boolean {
    return fn !== null && fn === this.apply && (this.avatar || this.owner === null);
  }

  /** Taken or still handing back (the slot is ours). */
  get active(): boolean {
    return this.deps.slot.fn === this.apply;
  }

  takeCamera(owner: string, fn: CameraFn, opts: TakeCameraOptions = {}): boolean {
    if (this.owner !== null || typeof owner !== 'string' || !owner || typeof fn !== 'function') return false;
    if (this.deps.titleActive?.()) {
      console.warn(`[cinematic] takeCamera('${owner}') refused: the title screen is showing`);
      return false;
    }
    // another override (the debug bench camera) holds the slot
    if (this.deps.slot.fn !== null && this.deps.slot.fn !== this.apply) return false;
    this.owner = owner;
    this.fn = fn;
    this.opts = opts;
    this.avatar = opts.showAvatar !== false;
    this.blend = null;
    this.hasShot = false;
    // A new shot can interrupt the hand-back while the camera still has a cinematic FOV.
    if (this.deps.slot.fn !== this.apply) this.baseFov = 0;
    const pl = this.deps.player;
    if (opts.freeze !== false) {
      this.saved = { frozen: pl.frozen, lookLocked: pl.lookLocked, yaw: pl.yaw, pitch: pl.pitch };
      pl.frozen = true;
      pl.lookLocked = true;
    } else this.saved = null;
    if (this.deps.slot.fn !== this.apply) this.deps.slot.set(this.apply);
    this.deps.requestRender?.();
    return true;
  }

  releaseCamera(owner: string): void {
    if (this.owner === null || this.owner !== owner) return;
    this.release('release');
  }

  private releaseAny(reason: string): void {
    if (this.owner !== null) this.release(reason);
  }

  private release(reason: string): void {
    const cb = this.opts.onRelease;
    this.owner = null;
    this.fn = null;
    this.opts = {};
    const s = this.saved;
    this.saved = null;
    if (s) {
      const pl = this.deps.player;
      pl.frozen = s.frozen;
      pl.lookLocked = s.lookLocked;
      pl.yaw = s.yaw;
      pl.pitch = s.pitch;
    }
    if (this.deps.slot.fn === this.apply) {
      // one more pass through the slot: ease (or cut) to the rig, restore the fov, then free it
      this.blend = { t0: this.now(), dur: this.deps.reducedMotion() || !this.hasShot ? 0 : HANDBACK_S * 1000 };
      this.deps.requestRender?.();
    }
    try {
      cb?.(reason);
    } catch (err) {
      console.error('[cinematic] onRelease threw', err);
    }
  }

  /** The slot function (boot calls it every drawn frame after the rig). */
  readonly apply: CameraFn = (cam) => {
    if (this.owner !== null && this.fn) {
      if (!this.baseFov) this.baseFov = cam.fov;
      this.preP.copy(cam.position);
      this.preQ.copy(cam.quaternion);
      const preFov = cam.fov;
      try {
        this.fn(cam);
      } catch (err) {
        console.error(`[cinematic] camera shot of '${this.owner}' threw; camera released`, err);
        cam.position.copy(this.preP);
        cam.quaternion.copy(this.preQ);
        cam.fov = preFov;
        this.release('error');
        return;
      }
      if (!finiteV(cam.position) || !finiteQ(cam.quaternion) || !Number.isFinite(cam.fov) || cam.fov <= 0) {
        // a NaN never reaches the picture: the last good shot, or the rig's placement
        cam.position.copy(this.hasShot ? this.shotP : this.preP);
        cam.quaternion.copy(this.hasShot ? this.shotQ : this.preQ);
        cam.fov = this.hasShot ? this.shotFov : preFov;
        cam.updateProjectionMatrix();
      } else {
        this.shotP.copy(cam.position);
        this.shotQ.copy(cam.quaternion);
        this.shotFov = cam.fov;
        this.hasShot = true;
      }
      cam.updateMatrixWorld();
      return;
    }
    const b = this.blend;
    if (!b) {
      // nothing to do (released without a pass): free the slot
      this.deps.slot.set(null);
      return;
    }
    const raw = b.dur > 0 ? (this.now() - b.t0) / b.dur : 1;
    const base = this.baseFov || cam.fov;
    if (raw >= 1 || !this.hasShot) {
      cam.fov = base;
      cam.updateProjectionMatrix();
      this.blend = null;
      this.hasShot = false;
      this.deps.slot.set(null);
      return;
    }
    const c = Math.max(0, raw);
    const k = c * c * (3 - 2 * c);
    // the rig's placement of this frame is in the camera: lerp the last shot towards it
    cam.position.lerpVectors(this.shotP, cam.position, k);
    this.tmpQ.copy(this.shotQ).slerp(cam.quaternion, k);
    cam.quaternion.copy(this.tmpQ);
    cam.fov = this.shotFov + (base - this.shotFov) * k;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  };
}
