/**
 * A tiny procedural modelling kit: boxes, cylinders, cones and planks in local prop space,
 * coloured per piece (sRGB hex → linear), merged into ONE non-indexed geometry with
 * `position / normal / color / aGlow` (emissive 0..n). Props are built once per set and drawn
 * with one shared material (material.ts), so a whole quarry is a single draw call.
 */
import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  BufferGeometry as Geo,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';

export type Hex = number;

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tmpC = new Color();

/** Accumulates coloured pieces; `place` sets the prop's frame for the following pieces. */
export class Kit {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private glow: number[] = [];
  /** Current prop frame (world): pieces are given in prop space and transformed by it. */
  private frame = new Matrix4();
  private readonly stack: Matrix4[] = [];

  /** Start a prop at world x/y/z with yaw (radians, 0 = local +z faces south). */
  place(x: number, y: number, z: number, yaw = 0, tilt?: { x?: number; z?: number }): this {
    this.frame.compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(tilt?.x ?? 0, yaw, tilt?.z ?? 0, 'YXZ')), new Vector3(1, 1, 1));
    return this;
  }

  /** Nested frame (relative to the current one); pop() returns. */
  push(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): this {
    this.stack.push(this.frame.clone());
    const m = new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'YXZ')), new Vector3(1, 1, 1));
    this.frame.multiply(m);
    return this;
  }

  pop(): this {
    const m = this.stack.pop();
    if (m) this.frame.copy(m);
    return this;
  }

  /** Add a geometry in prop space (consumed). */
  add(g: BufferGeometry, color: Hex, glow = 0, local?: Matrix4): this {
    const geo = g.index ? g.toNonIndexed() : g;
    if (local) geo.applyMatrix4(local);
    geo.applyMatrix4(this.frame);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const P = geo.getAttribute('position');
    const N = geo.getAttribute('normal');
    tmpC.setHex(color).convertSRGBToLinear();
    for (let i = 0; i < P.count; i++) {
      this.pos.push(P.getX(i), P.getY(i), P.getZ(i));
      this.nor.push(N.getX(i), N.getY(i), N.getZ(i));
      this.col.push(tmpC.r, tmpC.g, tmpC.b);
      this.glow.push(glow);
    }
    if (geo !== g) geo.dispose();
    g.dispose();
    return this;
  }

  /** Box of size w (x) × h (y) × d (z), bottom centre at (x, y, z), rotated (rx, ry, rz). */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: Hex, rot?: [number, number, number], glow = 0): this {
    const g = new BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    return this.add(g, color, glow, local(x, y, z, rot));
  }

  /** Cylinder along y (radius top/bottom, height), bottom centre at (x, y, z). */
  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, color: Hex, rot?: [number, number, number], seg = 8, glow = 0): this {
    const g = new CylinderGeometry(rt, rb, h, seg, 1);
    g.translate(0, h / 2, 0);
    return this.add(g, color, glow, local(x, y, z, rot));
  }

  cone(r: number, h: number, x: number, y: number, z: number, color: Hex, seg = 8, rot?: [number, number, number]): this {
    const g = new ConeGeometry(r, h, seg, 1);
    g.translate(0, h / 2, 0);
    return this.add(g, color, 0, local(x, y, z, rot));
  }

  /** A rough rock: a squashed, jittered icosahedron. */
  rock(size: number, x: number, y: number, z: number, color: Hex, seed: number, squash = 0.7): this {
    const g = new IcosahedronGeometry(size, 0);
    const r = rng(seed);
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const k = 0.78 + r() * 0.4;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * squash, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    g.translate(0, size * squash * 0.6, 0);
    return this.add(g, color, 0, local(x, y, z, [0, r() * 6.28, 0]));
  }

  /** A pole/plank between two prop-space points (square section). */
  beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number, color: Hex, tw = t): this {
    const a = new Vector3(ax, ay, az);
    const b = new Vector3(bx, by, bz);
    const len = a.distanceTo(b);
    const g = new BoxGeometry(tw, len, t);
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
    const m = new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new Vector3(1, 1, 1));
    return this.add(g, color, 0, m);
  }

  /** A round pole between two points. */
  pole(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, color: Hex, seg = 6): this {
    const a = new Vector3(ax, ay, az);
    const b = new Vector3(bx, by, bz);
    const len = a.distanceTo(b);
    const g = new CylinderGeometry(r, r, len, seg, 1);
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
    const m = new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new Vector3(1, 1, 1));
    return this.add(g, color, 0, m);
  }

  get empty(): boolean {
    return this.pos.length === 0;
  }

  /** The merged geometry (the kit is reset). */
  build(): BufferGeometry {
    const g = new Geo();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('aGlow', new BufferAttribute(new Float32Array(this.glow), 1));
    g.computeBoundingSphere();
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.glow = [];
    return g;
  }
}

function local(x: number, y: number, z: number, rot?: [number, number, number]): Matrix4 {
  return new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0, 'YXZ')), new Vector3(1, 1, 1));
}

/** Vary an sRGB colour a little (deterministic): ±k in brightness. */
export function tint(hex: Hex, r: () => number, k = 0.12): Hex {
  const c = new Color(hex);
  const f = 1 - k + r() * 2 * k;
  c.r = Math.min(1, c.r * f);
  c.g = Math.min(1, c.g * f);
  c.b = Math.min(1, c.b * f);
  return c.getHex();
}
