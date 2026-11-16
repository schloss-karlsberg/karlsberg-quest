/**
 * Falling ceiling beams in the burning palace (K3 fire night): when a room near the player goes
 * from smoke to fire (or collapses), charred joists come down out of the ceiling — they tip at one
 * end first, swing, hit the floor and lie there glowing at the cracks. Purely visual (no collider:
 * a beam must never trap a player in the smoke); reduced motion: they are simply there, glowing.
 */
import { BoxGeometry, Mesh, MeshStandardMaterial, Group } from 'three';
import type { GameContext } from '../../core/context';
import type { IRoom } from './types';

interface Beam {
  mesh: Mesh;
  /** 0 hanging, 1 swinging on one end, 2 falling, 3 down. */
  phase: number;
  t: number;
  delay: number;
  vy: number;
  floor: number;
  ang: number;
  spin: number;
}

const MAX_BEAMS = 14;

export class FallingBeams {
  readonly group = new Group();
  private beams: Beam[] = [];
  private readonly geo = new BoxGeometry(1, 0.22, 0.24);
  private readonly mat = new MeshStandardMaterial({ color: 0x1a1210, roughness: 0.95, emissive: 0xff5a14, emissiveIntensity: 0.55 });
  private seed = 11;
  private rnd = () => ((this.seed = (this.seed * 16807) % 2147483647) / 2147483647);

  constructor(private readonly ctx: GameContext) {
    this.group.name = 'falling-beams';
  }

  /** A room caught fire / collapsed: 1–2 beams come down in it (if the player is near enough to see). */
  drop(room: IRoom, collapsed: boolean): number {
    const p = this.ctx.player.position;
    if (Math.hypot(room.cx - p.x, room.cz - p.z) > 28 || Math.abs(room.floor - p.y) > 6) return 0;
    if (!this.group.parent) this.ctx.scene.add(this.group);
    const n = collapsed ? 2 : 1;
    const f = room.frame;
    const reduced = this.ctx.settings.state.reducedMotion;
    for (let k = 0; k < n; k++) {
      if (this.beams.length >= MAX_BEAMS) this.remove(this.beams[0]!);
      const u = 0.25 + this.rnd() * 0.5;
      const v = 0.2 + this.rnd() * 0.6;
      const x = f.ox + f.ux * u * f.L + f.vx * v * f.W;
      const z = f.oz + f.uz * u * f.L + f.vz * v * f.W;
      const len = Math.min(f.W * 0.8, 3.5 + this.rnd() * 2.5);
      const mesh = new Mesh(this.geo, this.mat);
      mesh.scale.x = len;
      // joists run across the room (along v)
      const ang = Math.atan2(-f.vz, f.vx);
      mesh.rotation.set(0, ang, 0, 'YXZ');
      mesh.position.set(x, room.ceiling - 0.15, z);
      this.group.add(mesh);
      const b: Beam = { mesh, phase: 0, t: 0, delay: k * 0.9 + this.rnd() * 0.6, vy: 0, floor: room.floor, ang, spin: (this.rnd() - 0.5) * 0.6 };
      if (reduced) this.land(b);
      this.beams.push(b);
    }
    return n;
  }

  private land(b: Beam): void {
    b.phase = 3;
    b.mesh.position.y = b.floor + 0.12;
    b.mesh.rotation.set(0, b.ang + b.spin, 0.04, 'YXZ');
  }

  private remove(b: Beam): void {
    b.mesh.removeFromParent();
    this.beams = this.beams.filter((x) => x !== b);
  }

  frame(dt: number, time: number): void {
    for (const b of this.beams) {
      b.t += dt;
      if (b.phase === 0 && b.t > b.delay) {
        b.phase = 1;
        b.t = 0;
      } else if (b.phase === 1) {
        // one end gives: the beam swings down on the other
        b.mesh.rotation.z = Math.min(0.9, b.t * b.t * 2.2);
        b.mesh.position.y -= dt * 0.4;
        if (b.t > 0.65) {
          b.phase = 2;
          b.t = 0;
        }
      } else if (b.phase === 2) {
        b.vy -= 9.81 * dt;
        b.mesh.position.y += b.vy * dt;
        b.mesh.rotation.z = Math.max(0.04, b.mesh.rotation.z - dt * 1.6);
        b.mesh.rotation.y += b.spin * dt;
        if (b.mesh.position.y <= b.floor + 0.12) {
          b.mesh.position.y = b.floor + 0.12;
          b.phase = 3;
        }
      }
    }
    // the cracks glow and breathe
    this.mat.emissiveIntensity = 0.45 + 0.2 * Math.sin(time * 2.3) * (this.ctx.settings.state.reducedFlash ? 0.3 : 1);
  }

  clear(): void {
    for (const b of [...this.beams]) this.remove(b);
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
