import { type PerspectiveCamera, Vector3 } from 'three';
import type { EventBus } from '../core/events';
import type { PlayerState } from '../core/state';
import type { Input } from './input';
import { STANCES, type Stance } from './stance';

/** What the player controller needs from the world (keeps it testable without three scenes). */
export interface PlayerWorld {
  heightAt(x: number, z: number): number;
  /** Footprint collision (returns the corrected position). */
  collide(x: number, z: number, radius: number): { x: number; z: number; hit: boolean };
  /** Allowed x/z area (inclusive). */
  bounds(): { x0: number; z0: number; x1: number; z1: number };
  surfaceAt(x: number, z: number): string;
  /** 0..1 how much tree cover hides the player here. */
  coverAt(x: number, z: number): number;
  /** Spirit view allowed in the current era. */
  canFly(): boolean;
}

export interface PlayerStats {
  /** 0..1 how much noise the player makes right now (hunt hearing). */
  noise: number;
  /** 0..1 how visible the player is (hunt sight). */
  visibility: number;
  /** Horizontal speed m/s. */
  speed: number;
  /** Lantern lit (set by the lantern feature; raises visibility). */
  lanternLit: boolean;
  /** Extra noise from features (splashing, breaking twigs), decays each step. */
  noiseBoost: number;
  onSlopeLimit: boolean;
}

const SLOPE_LIMIT_DEG = 42;
const RADIUS = 0.35;
const FLY_SPEED = 28;
const FLY_FAST = 95;
const FLY_MIN_AGL = 2.5;
const FLY_MAX_AGL = 450;

/**
 * First-person controller: walk over the heightfield with stances, slope limit, footprint
 * collision; "spirit view" free flight. Simulation runs in fixed steps; the camera is
 * interpolated between steps in `applyCamera`.
 */
export class Player {
  readonly position = new Vector3();
  private readonly prev = new Vector3();
  yaw = 0;
  pitch = 0;
  stance: Stance = 'stand';
  flying = false;
  private vy = 0;
  private eye = STANCES.stand.eye;
  private strideAcc = 0;
  private bob = 0;
  private flyVel = new Vector3();
  readonly stats: PlayerStats = { noise: 0, visibility: 1, speed: 0, lanternLit: false, noiseBoost: 0, onSlopeLimit: false };
  /** Freeze movement (cut-scenes, menus). Mouse look still works unless `lookLocked`. */
  frozen = false;
  lookLocked = false;
  mouseSensitivity = 1;
  invertY = false;
  reducedMotion = false;

  constructor(
    private readonly world: PlayerWorld,
    private readonly input: Input,
    private readonly events: EventBus,
  ) {}

  /** Place the player (feet on the ground unless flying). */
  teleport(x: number, z: number, yaw?: number): void {
    const b = this.world.bounds();
    x = Math.min(b.x1, Math.max(b.x0, x));
    z = Math.min(b.z1, Math.max(b.z0, z));
    const g = this.world.heightAt(x, z);
    this.position.set(x, this.flying ? Math.max(this.position.y, g + 30) : g, z);
    this.prev.copy(this.position);
    if (yaw !== undefined) this.yaw = yaw;
    this.vy = 0;
    this.events.emit('player:teleport', { x, z });
  }

  setStance(s: Stance): void {
    if (s === this.stance) return;
    const previous = this.stance;
    this.stance = s;
    this.events.emit('player:stance', { stance: s, previous });
  }

  setFlying(on: boolean): void {
    if (on === this.flying) return;
    if (on && !this.world.canFly()) {
      this.events.emit('ui:toast', { text: 'toast.noSpirit' });
      return;
    }
    this.flying = on;
    this.flyVel.set(0, 0, 0);
    if (on) {
      this.setStance('stand');
      this.position.y += 1.5;
    }
    this.events.emit('player:fly', { flying: on });
  }

  /** Mouse look, once per rendered frame. */
  look(): void {
    const { dx, dy } = this.input.takeMouse();
    if (this.lookLocked) return;
    const k = 0.0022 * this.mouseSensitivity;
    this.yaw -= dx * k;
    this.pitch -= dy * k * (this.invertY ? -1 : 1);
    const lim = this.stance === 'prone' && !this.flying ? 0.9 : 1.45;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  update(dt: number): void {
    this.prev.copy(this.position);
    const inp = this.input;
    if (!this.frozen) {
      if (inp.wasPressed('fly')) this.setFlying(!this.flying);
      if (!this.flying) {
        if (inp.wasPressed('crouch')) this.setStance(this.stance === 'crouch' ? 'stand' : 'crouch');
        if (inp.wasPressed('prone')) this.setStance(this.stance === 'prone' ? 'stand' : 'prone');
        if (inp.wasPressed('up') && this.stance !== 'stand') this.setStance('stand');
      }
    }
    if (this.flying && !this.world.canFly()) this.setFlying(false);

    let fx = 0;
    let fz = 0;
    if (!this.frozen) {
      if (inp.isDown('forward')) fz -= 1;
      if (inp.isDown('back')) fz += 1;
      if (inp.isDown('left')) fx -= 1;
      if (inp.isDown('right')) fx += 1;
    }
    const len = Math.hypot(fx, fz);
    if (len > 0) {
      fx /= len;
      fz /= len;
    }
    // rotate the wish direction by yaw (yaw 0 looks to −z)
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const wx = fx * c + fz * s;
    const wz = -fx * s + fz * c;

    if (this.flying) this.updateFly(dt, wx, wz, fz);
    else this.updateWalk(dt, wx, wz, len > 0);

    // stats for the hunt
    const st = STANCES[this.stance];
    const speed = Math.hypot(this.position.x - this.prev.x, this.position.z - this.prev.z) / dt;
    this.stats.speed = speed;
    const moveNoise = speed < 0.05 ? 0 : this.flying ? 0 : Math.min(1, st.noise * (speed / Math.max(st.speed, 0.1)));
    this.stats.noiseBoost = Math.max(0, this.stats.noiseBoost - dt * 0.8);
    this.stats.noise = Math.min(1, moveNoise + this.stats.noiseBoost);
    const cover = this.world.coverAt(this.position.x, this.position.z);
    const vis = st.visibility * (1 - 0.35 * cover) * (this.stats.lanternLit ? 1.6 : 1) * (speed > 0.1 ? 1.1 : 1);
    this.stats.visibility = this.flying ? 0 : Math.min(1, vis);
  }

  private updateWalk(dt: number, wx: number, wz: number, moving: boolean): void {
    const st = STANCES[this.stance];
    const sprinting = this.stance === 'stand' && this.input.isDown('sprint');
    const v = moving ? (sprinting ? st.sprint : st.speed) : 0;
    let nx = this.position.x + wx * v * dt;
    let nz = this.position.z + wz * v * dt;
    this.stats.onSlopeLimit = false;
    if (moving) {
      // slope limit: refuse steps that climb too steeply (try sliding along each axis)
      const h0 = this.world.heightAt(this.position.x, this.position.z);
      const tooSteep = (x: number, z: number) => {
        const d = Math.hypot(x - this.position.x, z - this.position.z);
        if (d < 1e-5) return false;
        const probe = 0.6; // look a little ahead so 2 m cells don't let you creep up cliffs
        const px = this.position.x + ((x - this.position.x) / d) * probe;
        const pz = this.position.z + ((z - this.position.z) / d) * probe;
        const dh = this.world.heightAt(px, pz) - h0;
        return dh > 0 && (Math.atan2(dh, probe) * 180) / Math.PI > SLOPE_LIMIT_DEG;
      };
      if (tooSteep(nx, nz)) {
        this.stats.onSlopeLimit = true;
        if (!tooSteep(nx, this.position.z)) nz = this.position.z;
        else if (!tooSteep(this.position.x, nz)) nx = this.position.x;
        else {
          nx = this.position.x;
          nz = this.position.z;
        }
      }
    }
    const col = this.world.collide(nx, nz, RADIUS);
    nx = col.x;
    nz = col.z;
    const b = this.world.bounds();
    nx = Math.min(b.x1, Math.max(b.x0, nx));
    nz = Math.min(b.z1, Math.max(b.z0, nz));
    const ground = this.world.heightAt(nx, nz);
    let y = this.position.y;
    if (y > ground + 0.4) {
      this.vy -= 9.81 * dt;
      y += this.vy * dt;
      if (y <= ground) {
        y = ground;
        this.vy = 0;
      }
    } else {
      y = ground;
      this.vy = 0;
    }
    this.position.set(nx, y, nz);
    // footsteps
    const moved = Math.hypot(nx - this.prev.x, nz - this.prev.z);
    this.strideAcc += moved;
    const stride = sprinting ? st.stride * 1.4 : st.stride;
    if (this.strideAcc >= stride) {
      this.strideAcc = 0;
      this.events.emit('player:step', { x: nx, z: nz, surface: this.world.surfaceAt(nx, nz), running: sprinting });
    }
    this.bob += moved * (sprinting ? 2.4 : 2.8);
  }

  private updateFly(dt: number, wx: number, wz: number, fz: number): void {
    const fast = this.input.isDown('sprint');
    const sp = fast ? FLY_FAST : FLY_SPEED;
    // forward/back follow the view pitch, strafing stays level
    const cp = Math.cos(this.pitch);
    const target = new Vector3(wx, 0, wz).multiplyScalar(sp);
    if (fz !== 0) {
      target.multiplyScalar(cp);
      target.y = Math.sin(this.pitch) * sp * -fz;
    }
    if (this.input.isDown('up')) target.y += sp * 0.6;
    if (this.input.isDown('down')) target.y -= sp * 0.6;
    this.flyVel.lerp(target, Math.min(1, dt * 4));
    const p = this.position;
    p.addScaledVector(this.flyVel, dt);
    const b = this.world.bounds();
    p.x = Math.min(b.x1, Math.max(b.x0, p.x));
    p.z = Math.min(b.z1, Math.max(b.z0, p.z));
    const g = this.world.heightAt(p.x, p.z);
    p.y = Math.min(g + FLY_MAX_AGL, Math.max(g + FLY_MIN_AGL, p.y));
  }

  /** Interpolated eye position into the camera. */
  applyCamera(camera: PerspectiveCamera, alpha: number, frameDt: number): void {
    const target = this.flying ? 0 : STANCES[this.stance].eye;
    this.eye += (target - this.eye) * Math.min(1, frameDt * 8);
    const x = this.prev.x + (this.position.x - this.prev.x) * alpha;
    const y = this.prev.y + (this.position.y - this.prev.y) * alpha;
    const z = this.prev.z + (this.position.z - this.prev.z) * alpha;
    const bobAmp = this.reducedMotion || this.flying ? 0 : this.stance === 'stand' ? 0.035 : 0.015;
    camera.position.set(x, y + this.eye + Math.sin(this.bob * Math.PI) * bobAmp, z);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  writeState(s: PlayerState): void {
    s.x = this.position.x;
    s.y = this.position.y;
    s.z = this.position.z;
    s.yaw = this.yaw;
    s.pitch = this.pitch;
    s.stance = this.stance;
    s.flying = this.flying;
  }

  readState(s: PlayerState): void {
    this.flying = false;
    this.stance = s.stance;
    this.yaw = s.yaw;
    this.pitch = s.pitch;
    this.teleport(s.x, s.z);
    if (s.flying && this.world.canFly()) {
      this.flying = true;
      this.position.y = Math.max(this.position.y, s.y);
      this.prev.copy(this.position);
    }
    this.eye = this.flying ? 0 : STANCES[this.stance].eye;
  }

  /** Unit forward vector on the ground plane. */
  forward(): { x: number; z: number } {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }
}
