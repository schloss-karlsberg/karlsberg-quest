/**
 * K4 "Rückwärts" (echo.k4.rueckwaerts, the Westblick): time runs backwards in front of you.
 * Three carts roll backwards up the slope, their carters walking backwards beside them, wheels
 * turning the wrong way; the dressed stones lift off the carts and off the ground and fly back
 * up into the wall they were broken out of — course by course, a window surround last, the dust
 * of the breaking flowing back into the joints. The picture takes on an old, warm, rewound grade
 * while the compass ticks backwards. Then the story's shift shows the palace of 1780.
 *
 * Reduced motion: no screen ripple, the stones fly slower; reduced flashing: no white glint when
 * the wall closes.
 */
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  type ShaderMaterial,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameContext } from '../../../core/context';
import { noiseBurst } from '../../../audio/synth';
import { GhostFigure } from '../../chronik/world/ghosts';
import { GlowPoints, GradeLoan, type Piece, clamp01, forward, paint, pxScale, rng, smooth, solidMaterial } from './common';

/** Seconds the picture needs (the echo is held at least this long). */
export const REWIND_SECONDS = 13;

const COLS = 12;
const ROWS = 12;
const BW = 0.95; // block length
const BH = 0.46; // course height
const CARTS = 3;
const PER_CART = 7;
const DUST = 520;

interface Stone {
  slot: Vector3;
  start: Vector3;
  t0: number;
  dur: number;
  arc: number;
  spin: Vector3;
  size: Vector3;
  cart: number;
  cartOff: Vector3;
}

interface Cart {
  group: Group;
  wheels: Mesh[];
  from: Vector3;
  to: Vector3;
  pos: Vector3;
  t0: number;
  carter: GhostFigure;
}

export function cartGeometry() {
  const wood = 0x6b4a2e;
  const bed = paint(new BoxGeometry(1.4, 0.35, 2.4), wood);
  bed.translate(0, 0.85, 0);
  const sideL = paint(new BoxGeometry(0.08, 0.4, 2.4), 0x5a3d25);
  sideL.translate(-0.68, 1.2, 0);
  const sideR = sideL.clone();
  sideR.translate(1.36, 0, 0);
  const shaftL = paint(new BoxGeometry(0.08, 0.08, 2.2), 0x5a3d25);
  shaftL.translate(-0.45, 0.8, 2.2);
  const shaftR = shaftL.clone();
  shaftR.translate(0.9, 0, 0);
  const axle = paint(new BoxGeometry(1.8, 0.1, 0.1), 0x3a2a1c);
  axle.translate(0, 0.62, 0.3);
  return mergeGeometries([bed, sideL, sideR, shaftL, shaftR, axle])!;
}

export function wheelGeometry() {
  const rim = paint(new CylinderGeometry(0.62, 0.62, 0.1, 18, 1, true), 0x3d2b1b);
  const hub = paint(new CylinderGeometry(0.12, 0.12, 0.16, 8), 0x2e2116);
  // the cylinders' axis is y: spokes lie in the xz plane
  const spokes = [0, 1, 2, 3].map((i) => paint(new BoxGeometry(1.18, 0.06, 0.06), 0x4a3422).rotateY((i * Math.PI) / 4));
  const g = mergeGeometries([rim, hub, ...spokes])!;
  g.rotateZ(Math.PI / 2); // axis along x
  return g;
}

export class RewindPiece implements Piece {
  readonly id = 'k4-rewind';
  done = false;
  private t = 0;
  private endT = -1;
  private readonly group = new Group();
  private readonly stones: Stone[] = [];
  private readonly mesh: InstancedMesh;
  private readonly mat: ShaderMaterial;
  private readonly cartMat: ShaderMaterial;
  private readonly carts: Cart[] = [];
  private readonly cartGeo: BufferGeometry;
  private readonly wheelGeo: BufferGeometry;
  private readonly dust: GlowPoints;
  private readonly dustHome: Float32Array;
  private readonly dustOff: Float32Array;
  private readonly dustT: Float32Array;
  private readonly grade: GradeLoan;
  private nextTick = 0.2;
  private nextSwell = 1.4;
  private glint = false;
  private readonly reduced: boolean;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  /** The wall's orientation (blocks lie along it). */
  private readonly wallQ = new Quaternion();

  constructor(private readonly ctx: GameContext) {
    this.reduced = ctx.settings.state.reducedMotion;
    const p = ctx.player.position;
    const fwd = forward(ctx.player.yaw);
    const right = new Vector3(-fwd.z, 0, fwd.x);
    const H = (x: number, z: number) => ctx.world.heightAt(x, z);
    const R = rng(1796);
    // the wall stands 15 m before you, across your view; its foot sits into the slope
    const wc = new Vector3(p.x + fwd.x * 15, 0, p.z + fwd.z * 15);
    let base = Infinity;
    for (let i = -6; i <= 6; i += 2) base = Math.min(base, H(wc.x + right.x * i, wc.z + right.z * i));
    base -= 0.15;
    this.wallQ.setFromAxisAngle(new Vector3(0, 1, 0), Math.atan2(-right.z, right.x));
    const slot = (x: number, y: number) => new Vector3(wc.x + right.x * x, base + y, wc.z + right.z * x);
    // courses of dressed stone, offset every other course; a window opening with a surround
    const slots: { at: Vector3; w: number; row: number; frame: boolean }[] = [];
    for (let row = 0; row < ROWS; row++) {
      const off = row % 2 ? BW / 2 : 0;
      for (let c = 0; c < COLS; c++) {
        const x = (c - COLS / 2 + 0.5) * BW + off - BW / 4;
        const y = row * BH + BH / 2;
        const inWindow = Math.abs(x) < 1.1 && row >= 3 && row <= 9;
        if (inWindow) continue;
        slots.push({ at: slot(x, y), w: BW * (0.92 + R() * 0.05), row, frame: false });
      }
    }
    // the Fenstergewände: jambs, sill and lintel in a lighter stone
    for (let row = 3; row <= 9; row++) for (const sx of [-1.2, 1.2]) slots.push({ at: slot(sx, row * BH + BH / 2), w: 0.32, row: row + 0.5, frame: true });
    slots.push({ at: slot(0, 3 * BH - 0.02), w: 2.7, row: 2.6, frame: true });
    slots.push({ at: slot(0, 10 * BH + 0.06), w: 2.9, row: 10.2, frame: true });

    // carts: far down the slope, they roll backwards up to the wall's foot
    const cartGeo = this.cartGeo = cartGeometry();
    const wheelGeo = this.wheelGeo = wheelGeometry();
    this.cartMat = solidMaterial(0.55, new Color(0.95, 0.8, 0.55));
    const night = ctx.era.info.night;
    for (let i = 0; i < CARTS; i++) {
      // beside the wall (never behind it): they back up the slope to its ends
      const lat = [-9.5, 9.5, 14][i]!;
      const stop = [-1.5, -0.5, 2.5][i]!;
      const from = new Vector3(wc.x + fwd.x * (24 + i * 5) + right.x * lat, 0, wc.z + fwd.z * (24 + i * 5) + right.z * lat);
      const to = new Vector3(wc.x + fwd.x * stop + right.x * lat, 0, wc.z + fwd.z * stop + right.z * lat);
      const group = new Group();
      group.add(new Mesh(cartGeo, this.cartMat));
      const wheels: Mesh[] = [];
      for (const s of [-0.85, 0.85]) {
        const w = new Mesh(wheelGeo, this.cartMat);
        w.position.set(s, 0.62, 0.3);
        group.add(w);
        wheels.push(w);
      }
      // the cart faces downhill (where it was going); it moves the other way
      group.rotation.y = Math.atan2(fwd.x, fwd.z);
      this.group.add(group);
      const carter = new GhostFigure(4100 + i * 17, { hat: i !== 1, dress: false, night, count: 2600 });
      this.group.add(carter.object);
      this.carts.push({ group, wheels, from, to, pos: from.clone(), t0: 0.4 + i * 0.9, carter });
    }

    // which stones ride on a cart: the first few courses (they arrive first)
    const order = slots.map((s, i) => ({ s, i, r: R() })).sort((a, b) => a.s.row - b.s.row || a.r - b.r);
    let cartIdx = 0;
    let onCart = 0;
    for (const { s } of order) {
      const riding = cartIdx < CARTS && !s.frame && s.row < 4;
      let start: Vector3;
      let cart = -1;
      const cartOff = new Vector3();
      if (riding) {
        cart = cartIdx;
        cartOff.set((onCart % 2 ? 0.32 : -0.32) * 1, 1.2 + Math.floor(onCart / 2) * 0.42, -0.8 + (onCart % 4) * 0.5);
        start = new Vector3();
        if (++onCart >= PER_CART) {
          onCart = 0;
          cartIdx++;
        }
      } else {
        // broken out and thrown down: lying in the grass on both sides of the wall, some at your feet
        let d = -11 + R() * 28;
        if (Math.abs(d) < 1.5) d += 3;
        const l = (R() - 0.5) * (d < -6 ? 12 : 26);
        start = new Vector3(wc.x + fwd.x * d + right.x * l, 0, wc.z + fwd.z * d + right.z * l);
        start.y = H(start.x, start.z) + 0.2;
      }
      const t0 = riding ? 0 : 2.2 + s.row * 0.55 + R() * 0.5;
      this.stones.push({
        slot: s.at,
        start,
        t0,
        dur: (this.reduced ? 1.8 : 1.15) + R() * 0.5,
        arc: 1.5 + R() * 3.5 + s.row * 0.25,
        spin: new Vector3((R() - 0.5) * 9, (R() - 0.5) * 9, (R() - 0.5) * 9),
        size: new Vector3(s.w, BH * 0.94, 0.55),
        cart,
        cartOff,
      });
    }
    this.mat = solidMaterial(0.35, new Color(1.0, 0.82, 0.55));
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), this.mat, this.stones.length);
    const sand = new Color(0xc9a77c);
    const frameCol = new Color(0xe2c9a0);
    const col = new Color();
    this.stones.forEach((s, i) => {
      col.copy(s.size.x < 0.5 || s.size.x > 2 ? frameCol : sand).multiplyScalar(0.85 + R() * 0.25);
      col.offsetHSL((R() - 0.5) * 0.02, 0, 0);
      this.mesh.setColorAt(i, col);
    });
    // the solid material reads a per-vertex colour too: white
    paint(this.mesh.geometry, 0xffffff);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);

    // dust of the breaking: it hangs in the air, then flows back into the joints
    this.dust = new GlowPoints(DUST, { additive: true, soft: 1 });
    this.dustHome = new Float32Array(DUST * 3);
    this.dustOff = new Float32Array(DUST * 3);
    this.dustT = new Float32Array(DUST);
    for (let i = 0; i < DUST; i++) {
      const s = this.stones[Math.floor(R() * this.stones.length)]!;
      this.dustHome.set([s.slot.x + (R() - 0.5) * 0.9, s.slot.y + (R() - 0.5) * 0.4, s.slot.z + (R() - 0.5) * 0.9], i * 3);
      this.dustOff.set([(R() - 0.5) * 16, 0.5 + R() * 6, (R() - 0.5) * 16], i * 3);
      this.dustT[i] = 1.5 + R() * 8;
      this.dust.size[i] = 0.18 + R() * 0.35;
    }
    this.group.add(this.dust.points);
    this.group.name = 'k4-rewind';
    ctx.scene.add(this.group);
    this.grade = new GradeLoan(ctx);
  }

  end(): void {
    if (this.endT < 0) this.endT = this.t;
  }

  /** Seconds into the picture (tests). */
  get time(): number {
    return this.t;
  }

  /** Stones in their slot (0..1). */
  get built(): number {
    return this.stones.filter((s) => this.t >= s.t0 + s.dur && (s.cart < 0 || this.t >= this.launchOf(s))).length / this.stones.length;
  }

  private launchOf(s: Stone): number {
    const c = this.carts[s.cart]!;
    return c.t0 + 5.2 + (s.cartOff.y - 1.2) * 1.2 + (s.cartOff.z + 0.8) * 0.5;
  }

  frame(dt: number): void {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    const fadeOut = this.endT < 0 ? 1 : 1 - clamp01((t - this.endT) / 1.2);
    const fadeIn = smooth(t / 0.8);
    const alpha = Math.min(fadeIn, fadeOut);
    if (this.endT >= 0 && fadeOut <= 0) {
      this.done = true;
      return;
    }
    const H = (x: number, z: number) => ctx.world.heightAt(x, z);
    // ---- carts roll backwards uphill; the carters walk backwards
    for (const c of this.carts) {
      const k = smooth((t - c.t0) / 5.2);
      const prev = c.pos.clone();
      c.pos.lerpVectors(c.from, c.to, k);
      const y = H(c.pos.x, c.pos.z);
      c.group.position.set(c.pos.x, y, c.pos.z);
      // pitch with the slope
      const ahead = H(c.pos.x + Math.sin(c.group.rotation.y) * 1.2, c.pos.z + Math.cos(c.group.rotation.y) * 1.2);
      c.group.rotation.x = -Math.atan2(ahead - y, 1.2);
      const moved = prev.distanceTo(c.pos);
      for (const w of c.wheels) w.rotation.x -= moved / 0.62; // backwards
      const side = new Vector3(Math.cos(c.group.rotation.y), 0, -Math.sin(c.group.rotation.y));
      const fx = c.pos.x + side.x * 1.4;
      const fz = c.pos.z + side.z * 1.4;
      c.carter.object.position.set(fx, H(fx, fz), fz);
      c.carter.object.rotation.y = c.group.rotation.y;
      c.carter.walkAmt = moved > 0.001 ? 1 : Math.max(0, c.carter.walkAmt - dt * 2);
      c.carter.walk -= moved * 2.6; // the stride runs backwards
      c.carter.fade = alpha * 0.95;
      c.carter.alpha = 0.85;
      c.carter.apply();
    }
    this.cartMat.uniforms.uAlpha!.value = alpha * 0.92;
    // ---- stones: from the ground / the carts back into their course
    const one = new Vector3(1, 1, 1);
    let flying = 0;
    this.stones.forEach((s, i) => {
      let start = s.start;
      let t0 = s.t0;
      if (s.cart >= 0) {
        const c = this.carts[s.cart]!;
        const yaw = c.group.rotation.y;
        start = this.v.set(s.cartOff.x, s.cartOff.y, s.cartOff.z).applyAxisAngle(new Vector3(0, 1, 0), yaw).add(c.group.position).clone();
        t0 = this.launchOf(s);
      }
      const u = clamp01((t - t0) / s.dur);
      // a fall played backwards: fast off the ground, slowing into the slot
      const k = 1 - Math.pow(1 - u, 3);
      const pos = this.v.lerpVectors(start, s.slot, k);
      pos.y += Math.sin(Math.PI * k) * s.arc;
      const unwind = 1 - k;
      this.q.setFromAxisAngle(this.v.clone().set(s.spin.x, s.spin.y, s.spin.z).normalize(), s.spin.length() * unwind * 0.35).premultiply(this.wallQ);
      if (u > 0 && u < 1) flying++;
      this.m.compose(pos, this.q, one).scale(s.size);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    // the wall glows faintly as it closes; a glint when the last stone sits
    const built = this.built;
    this.mat.uniforms.uAlpha!.value = alpha;
    this.mat.uniforms.uGhost!.value = 0.25 + 0.25 * (1 - built) + (this.glint ? 0.2 * clamp01(1 - (t - 10.4)) : 0);
    if (built > 0.995 && !this.glint) {
      this.glint = true;
      if (!ctx.settings.state.reducedFlash) (ctx.post.uniforms.uFlash!.value as Color).setRGB(0.05, 0.04, 0.025);
    }
    if (this.glint) (ctx.post.uniforms.uFlash!.value as Color).multiplyScalar(Math.max(0, 1 - dt * 3));
    // ---- dust flows back into the joints
    for (let i = 0; i < DUST; i++) {
      const k = 1 - clamp01((t - 0.5) / this.dustT[i]!); // 1 = hanging in the air, 0 = gone home
      const e = k * k;
      const o = i * 3;
      const sw = Math.sin(t * 1.3 + i) * 0.3 * k;
      this.dust.pos[o] = this.dustHome[o]! + this.dustOff[o]! * e + sw;
      this.dust.pos[o + 1] = this.dustHome[o + 1]! + this.dustOff[o + 1]! * e;
      this.dust.pos[o + 2] = this.dustHome[o + 2]! + this.dustOff[o + 2]! * e - sw;
      const a = (k > 0.02 ? 0.55 : 0) * Math.min(1, k * 4) * alpha;
      this.dust.col.set([1.3, 1.1, 0.8, a * 0.3], i * 4);
    }
    this.dust.commit(pxScale(ctx));
    // ---- the grade: old, warm, rewound; a ripple at the start (not in reduced motion)
    const g = smooth(t / 0.7) * fadeOut;
    this.grade.set(g, new Color(0.03, 0.022, 0.04), new Color(1.1, 0.99, 0.82), 0.15);
    if (!this.reduced && this.endT < 0) ctx.post.uniforms.uShift!.value = 0.35 * Math.max(0, 1 - t / 1.4) + 0.06 * (flying > 6 ? 1 : 0);
    // ---- sound: the compass ticks backwards, reversed swells as the courses close
    const am = ctx.audio;
    const out = am.bus('sfx');
    if (this.endT < 0 && t >= this.nextTick) {
      this.nextTick += 0.5;
      noiseBurst(am, out, { duration: 0.035, freq: 4200, q: 5, gain: 0.12 });
      noiseBurst(am, out, { duration: 0.03, freq: 3100, q: 5, gain: 0.08, when: 0.07 });
    }
    if (this.endT < 0 && t >= this.nextSwell && t < 10) {
      this.nextSwell += 1.6;
      // a sound played backwards: rises, then cuts off
      noiseBurst(am, out, { duration: 1.1, freq: 700, q: 0.7, gain: 0.16, attack: 1.0, type: 'lowpass' });
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.mesh.dispose();
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.cartMat.dispose();
    this.cartGeo.dispose();
    this.wheelGeo.dispose();
    for (const c of this.carts) c.carter.dispose();
    this.dust.dispose();
    const u = this.ctx.post.uniforms;
    if (!this.reduced) u.uShift!.value = 0;
    (u.uFlash!.value as Color).setRGB(0, 0, 0);
    this.grade.release();
  }
}
