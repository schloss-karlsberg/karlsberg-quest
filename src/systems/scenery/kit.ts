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
import { SURF, planarUv } from '../../world/surfaces';

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
const tmpH = { h: 0, s: 0, l: 0 };

/** Surface layers by palette colour (props.ts `C`), the rest by hue / saturation / lightness. */
const SURF_BY_HEX = new Map<number, number>([
  [0x7a5636, SURF.PLANKS], // wood
  [0x4e3622, SURF.PLANKS], // woodDark
  [0x8a8278, SURF.PLANKS], // woodGrey
  [0x2b2a2a, SURF.IRON],
  [0xc49a7c, SURF.STONE], // sandstone (dressed blocks: no joints of their own)
  [0xa86f58, SURF.STONE],
  [0xd8c3a2, SURF.STONE],
  [0x9a8f84, SURF.RUBBLE],
  [0xe6e1d6, SURF.PLASTER], // lime
  [0xc9ad62, SURF.STRAW],
  [0x9c8446, SURF.STRAW],
  [0xff7a2a, SURF.NONE], // ember
  [0x3a3532, SURF.RUBBLE], // ash
  [0x9a8a68, SURF.FABRIC], // rope
  [0x8d8475, SURF.FABRIC], // cloth
  [0xe8dcc0, SURF.NONE], // ledger (paper)
  [0x6a4a3a, SURF.PLANKS], // roof boards
  [0x4a4c52, SURF.SLATE],
  [0x2a3a3c, SURF.NONE], // water
  [0xd9d2c4, SURF.PLASTER],
  [0xc9a24a, SURF.IRON], // gilt (metallic)
  [0xb8923e, SURF.IRON],
  [0x3e6a4a, SURF.FABRIC], // green silk
  [0x7a2a22, SURF.FABRIC], // carpet
]);

/** Hue signature of a colour: rgb / max (brightness-free, so `tint()`ed colours still match). */
function chroma(hex: number): [number, number, number] {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  const m = Math.max(1, r, g, b);
  return [r / m, g / m, b / m];
}
const PALETTE = [...SURF_BY_HEX].map(([hex, layer]) => ({ c: chroma(hex), layer }));

/** The surface layer a piece of colour `hex` gets (deterministic; tested). */
export function surfFor(hex: Hex, glow = 0): number {
  if (glow > 0) return SURF.NONE;
  const known = SURF_BY_HEX.get(hex);
  if (known !== undefined) return known;
  const q = chroma(hex);
  let best = -2;
  let bd = 0.035;
  for (const p of PALETTE) {
    const d = Math.abs(p.c[0] - q[0]) + Math.abs(p.c[1] - q[1]) + Math.abs(p.c[2] - q[2]);
    if (d < bd) {
      bd = d;
      best = p.layer;
    }
  }
  if (best > -2) return best;
  tmpC.setHex(hex).getHSL(tmpH);
  const { h, s, l } = tmpH;
  const deg = h * 360;
  // only the safe guesses; anything else (paint, paper, cloth colours) stays untextured
  if (s < 0.12 && l < 0.2) return SURF.IRON;
  if (deg >= 12 && deg < 45 && l < 0.42 && s > 0.15) return SURF.PLANKS;
  if (deg >= 70 && deg < 200 && l < 0.45 && s > 0.12) return SURF.PAINTED; // greens, teals: painted boards
  return SURF.NONE;
}

const WOODISH = new Set<number>([SURF.PLANKS, SURF.PAINTED, SURF.FINEWOOD, SURF.STRAW]);
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();

/** Accumulates coloured pieces; `place` sets the prop's frame for the following pieces. */
export class Kit {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private glow: number[] = [];
  private surf: number[] = [];
  private uv: number[] = [];
  /** Surface layer for the following pieces (null = by colour, see `surfFor`). */
  surface: number | null = null;
  /** Current prop frame (world): pieces are given in prop space and transformed by it. */
  private frame = new Matrix4();
  private readonly stack: Matrix4[] = [];

  /** Start a prop at world x/y/z with yaw (radians, 0 = local +z faces south). */
  place(x: number, y: number, z: number, yaw = 0, tilt?: { x?: number; z?: number }): this {
    this.frame.compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(tilt?.x ?? 0, yaw, tilt?.z ?? 0, 'YXZ')), new Vector3(1, 1, 1));
    return this;
  }

  /** The current frame (world matrix of the prop being built). */
  frameMatrix(): Matrix4 {
    return this.frame.clone();
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

  /** Add a geometry in prop space (consumed). `surf` overrides the surface layer. */
  add(g: BufferGeometry, color: Hex, glow = 0, local?: Matrix4, surf?: number): this {
    const geo = g.index ? g.toNonIndexed() : g;
    if (local) geo.applyMatrix4(local);
    geo.applyMatrix4(this.frame);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const P = geo.getAttribute('position');
    const N = geo.getAttribute('normal');
    const U = geo.getAttribute('uv');
    const layer = surf ?? this.surface ?? surfFor(color, glow);
    tmpC.setHex(color).convertSRGBToLinear();
    for (let i = 0; i < P.count; i++) {
      this.pos.push(P.getX(i), P.getY(i), P.getZ(i));
      this.nor.push(N.getX(i), N.getY(i), N.getZ(i));
      this.col.push(tmpC.r, tmpC.g, tmpC.b);
      this.glow.push(glow);
      this.surf.push(layer + 1); // stored +1: a geometry without aSurf reads 0 = untextured
    }
    // UVs in metres: the geometry's own UVs scaled per triangle by |dP/du|, |dP/dv| (boxes,
    // cylinders, cones keep continuous mapping); wood runs along the longer side of each face.
    const wood = WOODISH.has(layer);
    const o: [number, number] = [0, 0];
    for (let i = 0; i + 2 < P.count; i += 3) {
      let su = 1;
      let sv = 1;
      let ok = false;
      if (U) {
        const u0 = U.getX(i), v0 = U.getY(i);
        const du1 = U.getX(i + 1) - u0, dv1 = U.getY(i + 1) - v0;
        const du2 = U.getX(i + 2) - u0, dv2 = U.getY(i + 2) - v0;
        const det = du1 * dv2 - du2 * dv1;
        if (Math.abs(det) > 1e-9) {
          _a.fromBufferAttribute(P, i);
          _b.fromBufferAttribute(P, i + 1).sub(_a);
          _c.fromBufferAttribute(P, i + 2).sub(_a);
          // dP/du = (e1·dv2 − e2·dv1)/det, dP/dv = (e2·du1 − e1·du2)/det
          const tu = _b.clone().multiplyScalar(dv2).addScaledVector(_c, -dv1).multiplyScalar(1 / det);
          const tv = _c.clone().multiplyScalar(du1).addScaledVector(_b, -du2).multiplyScalar(1 / det);
          su = tu.length();
          sv = tv.length();
          ok = su > 1e-6 && sv > 1e-6;
        }
      }
      for (let k = 0; k < 3; k++) {
        if (ok && U) {
          let u = U.getX(i + k) * su;
          let v = U.getY(i + k) * sv;
          if (wood && sv > su) [u, v] = [v, u];
          this.uv.push(u, v);
        } else {
          planarUv(P.getX(i + k), P.getY(i + k), P.getZ(i + k), N.getX(i + k), N.getY(i + k), N.getZ(i + k), o);
          this.uv.push(o[0], o[1]);
        }
      }
    }
    for (let i = P.count - (P.count % 3); i < P.count; i++) this.uv.push(0, 0);
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
    // one jitter per corner (the faces are separate triangles: keep them closed)
    const jit = new Map<string, number>();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      let k = jit.get(key);
      if (k === undefined) {
        k = 0.78 + r() * 0.4;
        jit.set(key, k);
      }
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * squash, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    g.translate(0, size * squash * 0.6, 0);
    g.deleteAttribute('uv'); // planar per face (the polyhedron's spherical UVs smear)
    const s = SURF_BY_HEX.get(color) ?? surfFor(color);
    const layer = s === SURF.STRAW || s === SURF.PLASTER || s === SURF.NONE ? s : SURF.RUBBLE;
    return this.add(g, color, 0, local(x, y, z, [0, r() * 6.28, 0]), this.surface ?? layer);
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
    g.setAttribute('aSurf', new BufferAttribute(new Float32Array(this.surf), 1));
    g.setAttribute('aUv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.computeBoundingSphere();
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.glow = [];
    this.surf = [];
    this.uv = [];
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
