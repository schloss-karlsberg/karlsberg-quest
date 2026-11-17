/**
 * K4 Steinplatz (cue 'k4-quader'): before the Steinbrecher stands up, dressed blocks from the
 * courtyard wall grind across the ground towards one spot and shove themselves on top of each
 * other, mortar glowing in the joints like teeth, dust spurting where stone scrapes on stone.
 * ~5 s, then the heap thins away (the boss is what it became).
 */
import { BoxGeometry, Color, InstancedMesh, Matrix4, Quaternion, type ShaderMaterial, Vector3 } from 'three';
import type { GameContext } from '../../../core/context';
import { noiseBurst } from '../../../audio/synth';
import { GlowPoints, type Piece, clamp01, paint, pxScale, rng, smooth, solidMaterial } from './common';

const N = 26;
const DUST = 160;

interface Block {
  from: Vector3;
  to: Vector3;
  t0: number;
  size: Vector3;
  yaw0: number;
  yaw1: number;
}

export class QuaderPiece implements Piece {
  readonly id = 'k4-quader';
  done = false;
  private t = 0;
  private readonly blocks: Block[] = [];
  private readonly mesh: InstancedMesh;
  private readonly mat: ShaderMaterial;
  private readonly dust: GlowPoints;
  private readonly dustV: Float32Array;
  private readonly dustL: Float32Array;
  private nextDust = 0;
  private nextGrind = 0.3;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();

  constructor(
    private readonly ctx: GameContext,
    x: number,
    z: number,
  ) {
    const R = rng(Math.round(x + z * 3));
    const H = (a: number, b: number) => ctx.world.heightAt(a, b);
    const base = H(x, z);
    // a hunched heap: three courses narrowing upwards, a lopsided shoulder
    let k = 0;
    for (let row = 0; row < 5 && k < N; row++) {
      const per = [8, 7, 5, 4, 2][row]!;
      for (let i = 0; i < per && k < N; i++, k++) {
        const a = (i / per) * Math.PI * 2 + row * 0.4;
        const rr = [1.3, 1.1, 0.85, 0.6, 0.3][row]! + (row === 3 && i < 2 ? 0.35 : 0);
        const to = new Vector3(x + Math.cos(a) * rr, base + 0.3 + row * 0.55, z + Math.sin(a) * rr);
        const fa = R() * Math.PI * 2;
        const fd = 6 + R() * 8;
        const fx = x + Math.cos(fa) * fd;
        const fz = z + Math.sin(fa) * fd;
        this.blocks.push({
          from: new Vector3(fx, H(fx, fz) + 0.25, fz),
          to,
          t0: 0.2 + row * 0.55 + R() * 0.45,
          size: new Vector3(0.9 + R() * 0.3, 0.5, 0.55 + R() * 0.2),
          yaw0: R() * 6,
          yaw1: a + Math.PI / 2,
        });
      }
    }
    this.mat = solidMaterial(0.5, new Color(1.6, 0.7, 0.25));
    const geo = paint(new BoxGeometry(1, 1, 1), 0xa89478);
    this.mesh = new InstancedMesh(geo, this.mat, this.blocks.length);
    this.mesh.frustumCulled = false;
    ctx.scene.add(this.mesh);
    this.dust = new GlowPoints(DUST, { additive: true, soft: 1 });
    this.dustV = new Float32Array(DUST * 3);
    this.dustL = new Float32Array(DUST);
    ctx.scene.add(this.dust.points);
  }

  get time(): number {
    return this.t;
  }

  frame(dt: number): void {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    const fade = 1 - smooth((t - 5) / 1.2);
    if (fade <= 0) {
      this.done = true;
      return;
    }
    const one = new Vector3(1, 1, 1);
    const pos = new Vector3();
    let sliding = 0;
    this.blocks.forEach((b, i) => {
      const u = clamp01((t - b.t0) / 1.2);
      // grind along the ground first, then shove up onto the heap
      const g = smooth(Math.min(1, u / 0.7));
      const up = smooth((u - 0.6) / 0.4);
      pos.lerpVectors(b.from, b.to, g);
      const gy = ctx.world.heightAt(pos.x, pos.z) + 0.25;
      pos.y = gy + (b.to.y - gy) * up + Math.sin(u * 40) * 0.02 * (1 - up) * (u > 0 ? 1 : 0);
      this.q.setFromAxisAngle(new Vector3(0, 1, 0), b.yaw0 + (b.yaw1 - b.yaw0) * g);
      this.m.compose(pos, this.q, one).scale(b.size);
      this.mesh.setMatrixAt(i, this.m);
      if (u > 0 && u < 1) {
        sliding++;
        if (t > this.nextDust) this.spawn(pos);
      }
    });
    if (t > this.nextDust) this.nextDust = t + 0.05;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mat.uniforms.uAlpha!.value = smooth(t / 0.4) * fade;
    // the joints glow while it moves
    this.mat.uniforms.uGhost!.value = 0.25 + 0.5 * Math.min(1, sliding / 6);
    if (sliding > 0 && t > this.nextGrind) {
      this.nextGrind = t + 0.35;
      noiseBurst(ctx.audio, ctx.audio.bus('sfx'), { duration: 0.4, freq: 260 + Math.random() * 200, q: 1.2, gain: 0.14, attack: 0.05, type: 'bandpass' });
    }
    for (let i = 0; i < DUST; i++) {
      const L = this.dustL[i]!;
      if (L <= 0) {
        this.dust.col[i * 4 + 3] = 0;
        continue;
      }
      this.dustL[i] = L - dt;
      for (let c = 0; c < 3; c++) this.dust.pos[i * 3 + c] = this.dust.pos[i * 3 + c]! + this.dustV[i * 3 + c]! * dt;
      this.dustV[i * 3 + 1] = this.dustV[i * 3 + 1]! - dt * 0.6;
      this.dust.col.set([1.2, 1.0, 0.75, 0.35 * Math.min(1, L) * fade], i * 4);
    }
    this.dust.commit(pxScale(ctx));
  }

  private spawn(p: Vector3): void {
    for (let i = 0; i < DUST; i++) {
      if (this.dustL[i]! > 0) continue;
      this.dust.pos.set([p.x + (Math.random() - 0.5) * 0.6, p.y - 0.15, p.z + (Math.random() - 0.5) * 0.6], i * 3);
      this.dustV.set([(Math.random() - 0.5) * 1.2, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2], i * 3);
      this.dustL[i] = 0.6 + Math.random() * 0.8;
      this.dust.size[i] = 0.3 + Math.random() * 0.4;
      return;
    }
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.dust.dispose();
  }
}
