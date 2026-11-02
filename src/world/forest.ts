import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import { GROUND } from '../data/types';
import { ATMOS_GLSL, atmosphere } from './atmosphere';
import type { Heightfield } from './heightfield';

/**
 * Procedural forest: three species (beech, spruce, oak), three detail levels, one draw call per
 * species and level (9 in all, one shared ShaderMaterial).
 *
 *   near (< 60 m)  trunk with root flare and bark, limbs into the crown, a crown of leaf clusters
 *                  built from alpha-tested cards (spruce: drooping branch cards in whorls around a
 *                  dark needle core)
 *   mid  (< 180 m) the same tree with fewer, larger cards and fewer limbs
 *   far            a procedural impostor: one camera-facing quad per tree whose shader draws the
 *                  silhouette (lumpy crown / cone, trunk) with a fake sphere normal
 *
 * Leaves, needles and bare twigs are drawn in the fragment shader (no textures). Wind sways the
 * whole tree and flutters the cards in the vertex shader. The season uniform (0 summer → 1
 * autumn → 2 winter) tints the leaves, thins them out and reveals the twigs; snow settles on
 * limbs and spruce branches.
 */

/** One generated tree: x, y, z, height, rotation, kind (0 beech, 1 spruce, 2 oak), variation. */
const F = 7;
const TILE = 64;
const NEAR_DIST = 60;
const MID_DIST = 180;
const KINDS = 3;
const MAX_NEAR = 2500;
const MAX_MID = 9000;
const MAX_FAR = 40000;

export interface ForestSource {
  hf: Heightfield;
  /** Today: canopy height (m). */
  canopy?: Float32Array;
  /** Historic eras: land-cover classes (forest class → trees). */
  ground?: Uint8Array;
  /** 0..1 path coverage; no trees on paths. */
  paths?: Float32Array;
  spacing: number;
  seed: number;
}

function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function smoothNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Deterministic tree placement into 64 m tiles (pure; exported for tests). */
export function generateTrees(src: ForestSource): { tiles: Map<string, Float32Array>; count: number } {
  const { hf, spacing } = src;
  const b = hf.bounds;
  const perTile = new Map<string, number[]>();
  let count = 0;
  const gx0 = Math.floor(b.x0 / spacing);
  const gx1 = Math.floor(b.x1 / spacing);
  const gz0 = Math.floor(b.z0 / spacing);
  const gz1 = Math.floor(b.z1 / spacing);
  for (let gz = gz0; gz <= gz1; gz++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const jx = hash2(gx, gz, src.seed) - 0.5;
      const jz = hash2(gz, gx, src.seed + 7) - 0.5;
      const x = (gx + 0.5 + jx * 0.9) * spacing;
      const z = (gz + 0.5 + jz * 0.9) * spacing;
      if (!hf.inBounds(x, z, 1)) continue;
      const c = Math.round((x - hf.x0) / hf.cell);
      const r = Math.round((z - hf.z0) / hf.cell);
      const i = r * hf.cols + c;
      if (src.paths && src.paths[i]! > 0.25) continue;
      let height: number;
      if (src.canopy) {
        // local maximum of the canopy around the point = crown top
        let m = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const cc = Math.min(hf.cols - 1, Math.max(0, c + dc));
          const rr = Math.min(hf.rows - 1, Math.max(0, r + dr));
          m = Math.max(m, src.canopy[rr * hf.cols + cc]!);
        }
        if (m < 4) continue;
        if (hash2(gx, gz, src.seed + 17) < 0.12) continue; // natural gaps
        height = Math.min(38, Math.max(5, m * (0.92 + 0.1 * hash2(gx, gz, src.seed + 3))));
      } else if (src.ground) {
        if (src.ground[i] !== GROUND.forest) continue;
        if (hash2(gx, gz, src.seed + 11) < 0.12) continue;
        height = 14 + 14 * hash2(gx, gz, src.seed + 5);
      } else continue;
      // species: spruce in patches (planted stands), oak mixed into the beech where it's drier
      let kind = smoothNoise(x / 180, z / 180, src.seed + 21) > 0.68 ? 1 : 0;
      if (kind === 0 && smoothNoise(x / 90, z / 90, src.seed + 33) + 0.25 * hash2(gx, gz, src.seed + 41) > 0.78) kind = 2;
      const y = hf.heightAt(x, z);
      const key = `${Math.floor(x / TILE)}_${Math.floor(z / TILE)}`;
      let arr = perTile.get(key);
      if (!arr) perTile.set(key, (arr = []));
      arr.push(x, y, z, height, hash2(gx, gz, src.seed + 9) * Math.PI * 2, kind, hash2(gx, gz, src.seed + 13));
      count++;
    }
  }
  const tiles = new Map<string, Float32Array>();
  for (const [k, v] of perTile) tiles.set(k, new Float32Array(v));
  return { tiles, count };
}

// ---- tree geometry (unit tree: height 1, base at the origin) ---------------------------------

/** Vertex parts: 0 bark, 1 leaf card, 2 needle card, 4 needle core, 5 impostor. */
const P_BARK = 0;
const P_LEAF = 1;
const P_NEEDLE = 2;
const P_CORE = 4;
const P_IMPOSTOR = 5;

type V3 = [number, number, number];

function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a: V3): V3 => {
  const l = len3(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

class TreeGeo {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly uv: number[] = [];
  private readonly part: number[] = [];
  /** seed, ambient occlusion (inner crown darker), card up-facing (snow). */
  private readonly ex: number[] = [];
  private readonly idx: number[] = [];

  private vert(p: V3, n: V3, u: number, v: number, part: number, e: V3): number {
    this.pos.push(...p);
    this.nrm.push(...n);
    this.uv.push(u, v);
    this.part.push(part);
    this.ex.push(...e);
    return this.part.length - 1;
  }

  /** Tapered bark tube from a to b (optional sideways bow), uv = (around, along metres-ish). */
  tube(a: V3, b: V3, r0: number, r1: number, radial: number, rows: number, bow: V3 = [0, 0, 0], flare = 0): void {
    const d = norm3(sub3(b, a));
    const ref: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const t = norm3(cross3(d, ref));
    const bi = cross3(d, t);
    const L = len3(sub3(b, a));
    const base = this.part.length;
    for (let j = 0; j <= rows; j++) {
      const f = j / rows;
      const c = add3(lerp3(a, b, f), mul3(bow, Math.sin(f * Math.PI)));
      let r = r0 + (r1 - r0) * f;
      if (flare > 0) r *= 1 + flare * Math.pow(1 - Math.min(1, f * 5), 2);
      for (let i = 0; i <= radial; i++) {
        const ang = (i / radial) * Math.PI * 2;
        const n = add3(mul3(t, Math.cos(ang)), mul3(bi, Math.sin(ang)));
        this.vert(add3(c, mul3(n, r)), n, i / radial, f * L * 6, P_BARK, [0, 1, n[1]]);
      }
    }
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < radial; i++) {
        const k = base + j * (radial + 1) + i;
        const k2 = k + radial + 1;
        this.idx.push(k, k2, k + 1, k + 1, k2, k2 + 1);
      }
  }

  /** A leaf / needle card: centre, facing normal, up direction, size; `light` = shading normal source. */
  card(c: V3, n: V3, up: V3, w: number, h: number, part: number, seed: number, ao: number, light: (p: V3) => V3, anchorBottom = false): void {
    const nn = norm3(n);
    let r = cross3(up, nn);
    if (len3(r) < 1e-4) r = cross3([1, 0, 0], nn);
    r = norm3(r);
    const u = norm3(cross3(nn, r));
    const base = this.part.length;
    const corners: [number, number][] = [
      [-0.5, anchorBottom ? 0 : -0.5],
      [0.5, anchorBottom ? 0 : -0.5],
      [0.5, anchorBottom ? 1 : 0.5],
      [-0.5, anchorBottom ? 1 : 0.5],
    ];
    for (const [x, y] of corners) {
      const p = add3(c, add3(mul3(r, x * w), mul3(u, y * h)));
      this.vert(p, light(p), x + 0.5, anchorBottom ? y : y + 0.5, part, [seed, ao, nn[1]]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Solid cone (spruce needle core), shading normals pointing out and a little up. */
  cone(y0: number, y1: number, r: number, radial: number): void {
    const base = this.part.length;
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      const n = norm3([Math.cos(a), r / (y1 - y0) + 0.3, Math.sin(a)]);
      this.vert([Math.cos(a) * r, y0, Math.sin(a) * r], n, i / radial, 0, P_CORE, [0.5, 0.35, 0]);
      this.vert([0, y1, 0], n, i / radial, 1, P_CORE, [0.5, 1, 0]);
    }
    for (let i = 0; i < radial; i++) {
      const k = base + i * 2;
      this.idx.push(k, k + 2, k + 1);
    }
  }

  impostor(): void {
    const base = this.part.length;
    for (const [x, y] of [[-1, 0], [1, 0], [1, 1], [-1, 1]] as const) this.vert([x, y, 0], [0, 0, 1], (x + 1) / 2, y, P_IMPOSTOR, [0, 1, 0]);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('aPart', new BufferAttribute(new Float32Array(this.part), 1));
    g.setAttribute('aEx', new BufferAttribute(new Float32Array(this.ex), 3));
    g.setIndex(this.idx);
    return g;
  }
}

/** Point on a unit sphere, upper hemisphere favoured. */
function dirUp(r: () => number, minY: number): V3 {
  for (let k = 0; k < 20; k++) {
    const d: V3 = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1];
    const l = len3(d);
    if (l > 1 || l < 0.2) continue;
    if (d[1] / l < minY) continue;
    return norm3(d);
  }
  return [0, 1, 0];
}

interface Crown {
  c: V3;
  rad: V3;
  clumps: number;
  clumpR: [number, number];
  trunkTop: number;
  limbFrom: [number, number];
  limbs: number;
  trunkR: number;
  crooked: number;
}

const BEECH: Crown = { c: [0, 0.68, 0], rad: [0.2, 0.25, 0.2], clumps: 9, clumpR: [0.085, 0.12], trunkTop: 0.66, limbFrom: [0.36, 0.56], limbs: 5, trunkR: 0.013, crooked: 0.15 };
const OAK: Crown = { c: [0, 0.6, 0], rad: [0.29, 0.23, 0.29], clumps: 11, clumpR: [0.09, 0.13], trunkTop: 0.5, limbFrom: [0.3, 0.44], limbs: 6, trunkR: 0.017, crooked: 0.55 };

function broadleaf(spec: Crown, detail: 0 | 1, seed: number): BufferGeometry {
  const g = new TreeGeo();
  const r = rng(seed);
  const radial = detail ? 8 : 5;
  // trunk with root flare, slightly bowed
  g.tube([0, -0.02, 0], [0.01 * spec.crooked, spec.trunkTop, 0], spec.trunkR, spec.trunkR * 0.4, radial, detail ? 5 : 2, [0.012 * spec.crooked, 0, 0.008], 0.55);
  // clump centres on the crown ellipsoid (upper part favoured), one at the top
  const clumps: { p: V3; rad: number }[] = [];
  for (let i = 0; i < spec.clumps; i++) {
    const d = i === 0 ? ([0, 1, 0] as V3) : dirUp(r, -0.35);
    const k = i === 0 ? 0.72 : 0.62 + 0.18 * r();
    clumps.push({ p: add3(spec.c, [d[0] * spec.rad[0] * k, d[1] * spec.rad[1] * k, d[2] * spec.rad[2] * k]), rad: spec.clumpR[0] + (spec.clumpR[1] - spec.clumpR[0]) * r() });
  }
  // limbs from the trunk into the crown (crooked oak limbs kink once)
  const nLimbs = detail ? spec.limbs : Math.ceil(spec.limbs / 2);
  for (let i = 0; i < nLimbs; i++) {
    const cl = clumps[1 + (i % (clumps.length - 1))]!;
    const y0 = spec.limbFrom[0] + (spec.limbFrom[1] - spec.limbFrom[0]) * r();
    const a: V3 = [0, y0, 0];
    const end = lerp3(a, cl.p, 0.92);
    const mid = add3(lerp3(a, end, 0.5), [(r() - 0.5) * 0.06 * spec.crooked, 0.03 * spec.crooked, (r() - 0.5) * 0.06 * spec.crooked]);
    g.tube(a, mid, spec.trunkR * 0.5, spec.trunkR * 0.32, detail ? 5 : 3, 1);
    g.tube(mid, end, spec.trunkR * 0.32, spec.trunkR * 0.12, detail ? 5 : 3, 1);
  }
  // leaf cards around each clump; shading normal = blend of crown and clump sphere normals
  const cardsPer = detail ? 6 : 3;
  const sizeK = detail ? 2.0 : 2.7;
  for (const cl of clumps) {
    const light = (p: V3): V3 => {
      const a = sub3(p, spec.c);
      const b = sub3(p, cl.p);
      return norm3(add3(norm3([a[0] / spec.rad[0], a[1] / spec.rad[1], a[2] / spec.rad[2]]), mul3(norm3(b), 0.7)));
    };
    for (let k = 0; k < cardsPer; k++) {
      const d = dirUp(r, -0.6);
      const p = add3(cl.p, mul3(d, cl.rad * (0.35 + 0.45 * r())));
      // face roughly outwards with a random twist so the crown has depth from every side
      const n = norm3(add3(d, [(r() - 0.5) * 1.2, (r() - 0.5) * 0.8, (r() - 0.5) * 1.2]));
      const rel = sub3(p, spec.c);
      const depth = Math.min(1, len3([rel[0] / spec.rad[0], rel[1] / spec.rad[1], rel[2] / spec.rad[2]]));
      const ao = 0.35 + 0.65 * depth * (0.6 + 0.4 * Math.max(0, d[1]));
      const s = cl.rad * sizeK * (0.8 + 0.4 * r());
      g.card(p, n, [r() - 0.5, 1, r() - 0.5], s, s, P_LEAF, r(), ao, light);
    }
  }
  return g.build();
}

function spruce(detail: 0 | 1, seed: number): BufferGeometry {
  const g = new TreeGeo();
  const r = rng(seed);
  g.tube([0, -0.02, 0], [0, 1, 0], 0.012, 0.001, detail ? 6 : 4, detail ? 4 : 2, [0, 0, 0], 0.7);
  g.cone(0.14, 0.97, detail ? 0.1 : 0.12, detail ? 9 : 6);
  const tiers = detail ? 12 : 6;
  const per = detail ? 7 : 5;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const y = 0.16 + f * 0.78;
    const len = 0.03 + 0.2 * Math.pow(1 - f, 0.95);
    for (let k = 0; k < per; k++) {
      const a = ((k + r() * 0.6 + t * 0.37) / per) * Math.PI * 2;
      const out: V3 = [Math.cos(a), 0, Math.sin(a)];
      const droop = 0.35 + 0.25 * r();
      const dir = norm3([out[0], -droop, out[2]]);
      // the card lies along the branch, tilted around it so it shows from the side too
      const side = norm3(cross3(dir, [0, 1, 0]));
      const tilt = (r() - 0.5) * 1.1;
      const base: V3 = [out[0] * 0.006, y, out[2] * 0.006];
      const light = (p: V3): V3 => norm3([p[0] * 3, 0.55 + (p[1] - y) * 2, p[2] * 3]);
      const w = len * (detail ? 0.75 : 1.0);
      const ao = 0.4 + 0.6 * f;
      // anchored at the trunk, reaching out along `dir`
      const nn = norm3(cross3(side, dir));
      const nFace = norm3(add3(mul3(nn, Math.cos(tilt)), mul3(side, Math.sin(tilt))));
      g.card(base, nFace, dir, w, len * 1.15, P_NEEDLE, r(), ao, light, true);
    }
  }
  return g.build();
}

function impostor(): BufferGeometry {
  const g = new TreeGeo();
  g.impostor();
  return g.build();
}

const TREE_VERT = /* glsl */ `
${ATMOS_GLSL}
attribute float aPart;
attribute vec3 aEx;
attribute vec4 aInst;   // x, y, z, height
attribute vec3 aVar;    // rotation, variation, kind
uniform float uFar;
uniform float uScanMix;
uniform float uMapMix;
uniform vec3 uScanCenter;
uniform float uScanRadius;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vPart;
varying float vVar;
varying float vKind;
varying vec3 vEx;
varying float vH;
varying vec3 vRight;
varying vec3 vUp;
void main() {
  float h = aInst.w;
  vec3 camd = aInst.xyz - uCamPos;
  float dist = length(camd.xz);
  float fade = 1.0 - smoothstep(uFar * 0.82, uFar, dist);
  // relief scan / 1840 map lens = bare ground: vegetation inside the scan radius sinks away
  float sr = length(aInst.xz - uScanCenter.xz);
  fade *= 1.0 - smoothstep(0.0, 0.8, max(uScanMix, uMapMix)) * (1.0 - smoothstep(uScanRadius * 0.85, uScanRadius, sr));
  float c = cos(aVar.x), s = sin(aVar.x);
  float kind = aVar.z;
  vKind = kind;
  vVar = aVar.y;
  vPart = aPart;
  vEx = aEx;
  vUv = uv;
  float wide = 0.85 + 0.35 * aVar.y;
  // wind: the whole tree leans and sways (more at the top), gusts travel through the stand
  float gust = 0.6 + 0.4 * sin(uTime * 0.23 + aInst.x * 0.013 + aInst.z * 0.009);
  float sway = (sin(uTime * 0.8 + aInst.x * 0.05 + aInst.z * 0.03) + 0.4 * sin(uTime * 1.9 + aInst.x * 0.11)) * gust;
  vec3 wdir = vec3(0.8, 0.0, 0.5);
  vec3 wp;
  vec3 nn;
  if (aPart > 4.5) {
    // far impostor: a camera-facing quad (upright; tips towards the camera seen from above)
    vec3 toCam = uCamPos - (aInst.xyz + vec3(0.0, h * 0.55, 0.0));
    vec3 vd = normalize(toCam);
    vec3 right = normalize(vec3(-vd.z, 0.0, vd.x) + vec3(1e-5, 0.0, 0.0));
    vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float top = smoothstep(0.35, 0.9, vd.y);
    vec3 up = normalize(mix(vec3(0.0, 1.0, 0.0), camUp, top));
    float halfW = (kind > 0.5 && kind < 1.5 ? 0.2 : (kind > 1.5 ? 0.33 : 0.27)) * wide;
    vec3 base = aInst.xyz + up * (-0.04 * h) + vec3(0.0, top * h * 0.45, 0.0);
    wp = base + (right * position.x * halfW * h + up * position.y * h * 1.04) * fade;
    wp += wdir * sway * 0.006 * h * position.y * position.y;
    vRight = right;
    vUp = up;
    nn = vd;
    vH = position.y;
  } else {
    vec3 p = position;
    p.xz *= wide;
    p = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
    nn = vec3(c * normal.x - s * normal.z, normal.y, s * normal.x + c * normal.z);
    // leaves and needles flutter on their own
    if (aPart > 0.5) {
      float fl = sin(uTime * (3.0 + aEx.x * 3.0) + aEx.x * 40.0 + aInst.x) * (0.0025 + 0.002 * gust);
      p += vec3(fl, fl * 0.6, -fl * 0.8) * (0.5 + p.y);
    }
    wp = aInst.xyz + p * h * fade;
    wp += wdir * sway * 0.011 * h * p.y * p.y;
    vRight = vec3(1.0, 0.0, 0.0);
    vUp = vec3(0.0, 1.0, 0.0);
    vH = position.y;
  }
  vWorld = wp;
  vNormal = nn;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const TREE_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vPart;
varying float vVar;
varying float vKind;
varying vec3 vEx;
varying float vH;
varying vec3 vRight;
varying vec3 vUp;
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }

/** Leaf density for the season: summer full, November thinned, bare in winter. */
float leafDensity() {
  return uSeason <= 1.0 ? 1.0 - 0.22 * uSeason : clamp(0.78 - (uSeason - 1.0) * 1.35, 0.0, 1.0);
}
float twigShow() { return smoothstep(0.75, 1.6, uSeason); }

/** Leaf clusters in a card: two offset grids of pointed leaves, ragged round outline. */
float leafMask(vec2 uv, float seed, float dens) {
  vec2 c = uv - 0.5;
  float edge = length(c) * 2.0 + (kqNoise(uv * 5.0 + seed * 13.0) - 0.5) * 0.45;
  if (edge > 1.0) return 0.0;
  float m = 0.0;
  for (int L = 0; L < 2; L++) {
    vec2 g = uv * 8.0 + vec2(seed * 31.0, seed * 17.0) + float(L) * 0.5;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float hh = kqHash12(id + float(L) * 7.3);
    float a = hh * 6.2831;
    vec2 off = (vec2(kqHash12(id + 3.1), kqHash12(id + 7.7)) - 0.5) * 0.35;
    vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * (f - off);
    q.x *= 1.6;
    float d = length(q) + abs(q.y) * 0.2;
    float keep = step(1.0 - dens * (1.0 - edge * 0.35), hh * 0.85 + 0.15);
    m = max(m, step(d, 0.47) * keep);
  }
  return m;
}

/** Bare twigs in a card: a twig entering from below, forking upwards and outwards (winter crowns). */
float twigMask(vec2 uv, float seed) {
  float m = 0.0;
  vec2 o = vec2(0.42 + 0.16 * kqHash12(vec2(seed, 1.0)), 0.04);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float hs = kqHash12(vec2(seed * 13.0, fi));
    // fan of shoots, within ±60° of the card's up
    float a = (fi - 1.5) * 0.38 + (hs - 0.5) * 0.5;
    vec2 d = vec2(sin(a), cos(a));
    float L = 0.55 + 0.35 * hs;
    vec2 p = uv - o;
    float t = clamp(dot(p, d), 0.0, L);
    // a slight kink halfway
    vec2 k = d * t + vec2(d.y, -d.x) * sin(t * 9.0 + seed * 20.0) * 0.025;
    m = max(m, step(length(p - k), mix(0.014, 0.003, t / L)));
    // side shoots
    for (int j = 0; j < 2; j++) {
      float fj = float(j);
      vec2 o2 = o + d * L * (0.35 + 0.3 * fj);
      float a2 = a + (mod(fi + fj, 2.0) < 1.0 ? 0.65 : -0.65);
      vec2 d2 = vec2(sin(a2), cos(a2));
      vec2 p2 = uv - o2;
      float L2 = 0.18 + 0.14 * kqHash12(vec2(fi, fj + seed));
      float t2 = clamp(dot(p2, d2), 0.0, L2);
      m = max(m, step(length(p2 - d2 * t2), mix(0.007, 0.0025, t2 / L2)));
    }
  }
  return m;
}

/** Spruce branch card: a stem with needle sprigs, tapering to the tip (uv.y 0 trunk → 1 tip). */
float needleMask(vec2 uv, float seed) {
  float x = abs(uv.x - 0.5) * 2.0;
  float t = uv.y;
  float width = (1.0 - t) * 0.8 + 0.2;
  float fr = kqNoise(vec2(uv.x * 14.0, uv.y * 26.0) + seed * 9.0);
  float body = step(x, width * (0.7 + 0.4 * fr));
  float sprig = step(0.45, fract(t * 10.0 + x * 1.4 + seed * 3.0));
  body *= mix(1.0, sprig, smoothstep(width * 0.45, width, x));
  return body * step(0.02, t) * (1.0 - step(0.97, t));
}

vec3 leafColour(float kind, float v) {
  // summer
  vec3 sBeech = mix(srgb(vec3(0.2, 0.3, 0.1)), srgb(vec3(0.27, 0.36, 0.12)), v);
  vec3 sOak = mix(srgb(vec3(0.15, 0.22, 0.08)), srgb(vec3(0.2, 0.27, 0.1)), v);
  // November: copper beech, brown oak, a few late yellow and still-green crowns
  vec3 aBeech = v < 0.4 ? mix(srgb(vec3(0.5, 0.22, 0.07)), srgb(vec3(0.6, 0.32, 0.1)), v / 0.4)
              : v < 0.75 ? mix(srgb(vec3(0.62, 0.42, 0.12)), srgb(vec3(0.55, 0.3, 0.09)), (v - 0.4) / 0.35)
              : srgb(vec3(0.3, 0.3, 0.12));
  vec3 aOak = mix(srgb(vec3(0.36, 0.26, 0.11)), srgb(vec3(0.44, 0.32, 0.12)), v);
  vec3 sum = kind > 1.5 ? sOak : sBeech;
  vec3 aut = kind > 1.5 ? aOak : aBeech;
  vec3 dead = srgb(vec3(0.32, 0.24, 0.16));
  return uSeason < 1.0 ? mix(sum, aut, uSeason) : mix(aut, dead, clamp(uSeason - 1.0, 0.0, 1.0));
}

void main() {
  float kind = vKind;
  float isSpruce = step(0.5, kind) * (1.0 - step(1.5, kind));
  float seed = vEx.x;
  float v = fract(vVar * 7.13 + seed * 0.37);
  vec3 n = normalize(vNormal + vec3(0.0, 1e-4, 0.0));
  vec3 alb;
  float ao = vEx.y;
  float snowUp = 0.0;
  float leafy = 0.0;
  if (vPart < 0.5) {
    // bark: beech smooth grey with lichen, oak dark and furrowed, spruce red-brown and scaly
    float fur = kqNoise(vec2(vUv.x * 9.0, vUv.y * 0.6)) * 0.6 + kqNoise(vec2(vUv.x * 22.0, vUv.y * 2.5)) * 0.4;
    vec3 beech = srgb(vec3(0.46, 0.46, 0.42)) * (0.85 + 0.25 * kqNoise(vUv * vec2(4.0, 1.5)));
    beech = mix(beech, srgb(vec3(0.32, 0.38, 0.2)), smoothstep(0.55, 0.8, kqNoise(vUv * vec2(6.0, 2.0) + 3.0)) * 0.6);
    vec3 oak = srgb(vec3(0.26, 0.22, 0.17)) * (0.55 + 0.6 * smoothstep(0.25, 0.7, fur));
    vec3 spr = srgb(vec3(0.33, 0.22, 0.15)) * (0.7 + 0.4 * kqNoise(vUv * vec2(10.0, 5.0)));
    alb = kind > 1.5 ? oak : (isSpruce > 0.5 ? spr : beech);
    // darker at the foot (damp), and low in the stand
    alb *= mix(0.6, 1.0, smoothstep(0.0, 0.12, vH));
    snowUp = smoothstep(0.2, 0.7, n.y);
    ao = mix(0.55, 1.0, smoothstep(0.0, 0.5, vH));
  } else if (vPart < 1.5) {
    float dens = leafDensity() * step(seed, leafDensity() + 0.25);
    float lm = leafMask(vUv, seed, dens);
    float tw = twigMask(vUv, seed) * twigShow();
    if (lm < 0.5 && tw < 0.5) discard;
    leafy = lm;
    alb = lm > 0.5 ? leafColour(kind, v) * (0.8 + 0.4 * kqHash12(floor(vUv * 8.0) + seed)) : srgb(vec3(0.24, 0.21, 0.19));
    snowUp = lm > 0.5 ? 0.0 : 0.8 * smoothstep(-0.2, 0.6, vEx.z);
  } else if (vPart < 2.5) {
    if (needleMask(vUv, seed) < 0.5) discard;
    leafy = 1.0;
    alb = mix(srgb(vec3(0.06, 0.12, 0.07)), srgb(vec3(0.1, 0.17, 0.09)), v) * (0.8 + 0.4 * kqNoise(vUv * 12.0));
    // snow lies on the upper side of the branches
    snowUp = smoothstep(0.1, 0.8, vEx.z) * smoothstep(0.15, 0.7, vUv.y + 0.3 * kqNoise(vUv * 9.0 + seed));
  } else if (vPart < 4.5) {
    // the dark needle mass inside a spruce
    alb = srgb(vec3(0.045, 0.08, 0.05)) * (0.7 + 0.5 * kqNoise(vec2(vUv.x * 30.0, vWorld.y * 0.8)));
    leafy = 1.0;
    snowUp = 0.25 * smoothstep(0.3, 0.9, n.y);
  } else {
    // far impostor: silhouette drawn here (quad uv: x 0..1 across, y 0..1 up)
    vec2 q = vec2(vUv.x * 2.0 - 1.0, vUv.y);
    float nz = kqNoise(vec2(q.x * 4.0 + vVar * 17.0, q.y * 5.0)) + 0.5 * kqNoise(vec2(q.x * 9.0, q.y * 11.0) + vVar * 5.0);
    float crown;
    vec2 cq;
    if (isSpruce > 0.5) {
      float w = (1.0 - q.y) * 1.05;
      cq = vec2(q.x / max(w, 0.05), (q.y - 0.55) / 0.45);
      crown = step(abs(q.x), w * (0.8 + 0.3 * nz)) * step(0.14, q.y);
    } else {
      float cy = kind > 1.5 ? 0.58 : 0.64;
      float ry = kind > 1.5 ? 0.36 : 0.36;
      cq = vec2(q.x, (q.y - cy) / ry);
      float r = length(cq) + (nz - 0.75) * 0.32;
      crown = step(r, 0.98);
    }
    float trunk = step(abs(q.x), 0.05) * step(q.y, 0.55);
    // winter: bare broadleaf crowns become a thin, twiggy haze
    float bare = (1.0 - isSpruce) * twigShow();
    if (bare > 0.0 && crown > 0.5) crown *= step(bare * 0.72, kqHash12(floor(gl_FragCoord.xy * 0.5) + floor(vVar * 97.0)) * (0.6 + 0.6 * nz));
    if (crown < 0.5 && trunk < 0.5) discard;
    if (crown > 0.5) {
      float cz = sqrt(max(0.0, 1.0 - dot(cq, cq) * 0.7));
      vec3 vd = normalize(cross(vRight, vUp));
      n = normalize(vRight * cq.x + vUp * cq.y * 0.8 + vd * cz + vec3(0.0, 0.25, 0.0));
      alb = isSpruce > 0.5 ? srgb(vec3(0.07, 0.13, 0.08)) : mix(leafColour(kind, v), srgb(vec3(0.24, 0.21, 0.19)), bare);
      alb *= 0.7 + 0.45 * nz;
      ao = 0.45 + 0.55 * clamp(cq.y * 0.5 + 0.6, 0.0, 1.0);
      leafy = 1.0 - bare;
      snowUp = smoothstep(0.2, 0.8, n.y) * (isSpruce > 0.5 ? 0.6 : 0.25);
    } else {
      alb = srgb(vec3(0.25, 0.22, 0.2));
      ao = 0.6;
    }
  }
  // greyed toward the etching palette
  float lum = dot(alb, vec3(0.3, 0.55, 0.15));
  alb = mix(vec3(lum), alb, 0.75) * 0.9;
  alb = mix(alb, srgb(vec3(0.86, 0.89, 0.95)), uSnow * snowUp * 0.85);
  vec3 col = kqLight(alb, n, vWorld, ao, 1.0);
  // leaves scatter sky light: undersides dim, not black
  col += alb * uSkyAmbient * 0.18 * leafy * (1.0 - max(n.y, 0.0));
  // sun shining through the leaves from behind
  vec3 vd = normalize(vWorld - uCamPos);
  col += alb * uSunColor * pow(max(dot(vd, uSunDir), 0.0), 4.0) * 0.45 * leafy;
  gl_FragColor = vec4(kqFog(col, vWorld), 1.0);
}
`;

interface Batch {
  mesh: Mesh;
  geo: InstancedBufferGeometry;
  inst: InstancedBufferAttribute;
  vary: InstancedBufferAttribute;
  max: number;
}

/**
 * Instanced forest: three species × three detail levels (batch index = level · 3 + kind);
 * instance lists rebuilt as the camera moves.
 */
export class Forest {
  readonly object = new Group();
  readonly material: ShaderMaterial;
  private tiles = new Map<string, Float32Array>();
  private readonly batches: Batch[] = [];
  private lastX = Infinity;
  private lastZ = Infinity;
  private dirty = true;
  farDist = 700;
  readonly stats = { near: 0, mid: 0, far: 0, total: 0, drawCalls: 0 };
  /** Circles kept free of trees (feature buildings such as the field station). */
  private readonly clearings: { x: number; z: number; r: number }[] = [];

  constructor() {
    this.object.name = 'forest';
    this.material = new ShaderMaterial({
      vertexShader: TREE_VERT,
      fragmentShader: TREE_FRAG,
      side: DoubleSide,
      uniforms: {
        ...atmosphere,
        uFar: { value: this.farDist },
        // replaced by the terrain's scan uniforms (shared objects) in World
        uScanMix: { value: 0 },
        uMapMix: { value: 0 },
        uScanCenter: { value: new Vector3() },
        uScanRadius: { value: 1e6 },
      },
    });
    const make = (g: BufferGeometry, max: number, name: string): Batch => {
      const geo = new InstancedBufferGeometry();
      for (const k of ['position', 'normal', 'uv', 'aPart', 'aEx']) geo.setAttribute(k, g.getAttribute(k));
      geo.setIndex(g.index);
      const inst = new InstancedBufferAttribute(new Float32Array(max * 4), 4);
      const vary = new InstancedBufferAttribute(new Float32Array(max * 3), 3);
      inst.setUsage(DynamicDrawUsage);
      vary.setUsage(DynamicDrawUsage);
      geo.setAttribute('aInst', inst);
      geo.setAttribute('aVar', vary);
      geo.instanceCount = 0;
      const mesh = new Mesh(geo, this.material);
      mesh.name = name;
      mesh.frustumCulled = false;
      this.object.add(mesh);
      return { mesh, geo, inst, vary, max };
    };
    const imp = impostor();
    const names = ['beech', 'spruce', 'oak'];
    // level 0 near, 1 mid, 2 far (impostor)
    for (let lod = 0; lod < 3; lod++)
      for (let kind = 0; kind < KINDS; kind++) {
        const detail = (lod === 0 ? 1 : 0) as 0 | 1;
        const g = lod === 2 ? imp : kind === 1 ? spruce(detail, 11 + lod) : broadleaf(kind === 2 ? OAK : BEECH, detail, kind * 7 + lod + 3);
        this.batches.push(make(g, lod === 0 ? MAX_NEAR : lod === 1 ? MAX_MID : MAX_FAR, `trees-${names[kind]}-${['near', 'mid', 'far'][lod]}`));
      }
  }

  setTrees(tiles: Map<string, Float32Array>): void {
    this.tiles = tiles;
    let n = 0;
    for (const t of tiles.values()) n += t.length / F;
    this.stats.total = n;
    this.dirty = true;
  }

  setFarDistance(d: number): void {
    this.farDist = d;
    this.material.uniforms.uFar!.value = d;
    this.dirty = true;
  }

  update(camera: PerspectiveCamera): void {
    const p = camera.position;
    if (!this.dirty && Math.hypot(p.x - this.lastX, p.z - this.lastZ) < 8) return;
    this.dirty = false;
    this.lastX = p.x;
    this.lastZ = p.z;
    const counts = new Array<number>(this.batches.length).fill(0);
    const far = this.farDist;
    const t0x = Math.floor((p.x - far) / TILE);
    const t1x = Math.floor((p.x + far) / TILE);
    const t0z = Math.floor((p.z - far) / TILE);
    const t1z = Math.floor((p.z + far) / TILE);
    for (let tz = t0z; tz <= t1z; tz++) {
      for (let tx = t0x; tx <= t1x; tx++) {
        const arr = this.tiles.get(`${tx}_${tz}`);
        if (!arr) continue;
        for (let k = 0; k < arr.length; k += F) {
          const dx = arr[k]! - p.x;
          const dz = arr[k + 2]! - p.z;
          const d = Math.hypot(dx, dz);
          if (d > far) continue;
          if (this.clearings.length && this.clearings.some((c) => Math.hypot(arr[k]! - c.x, arr[k + 2]! - c.z) < c.r)) continue;
          const kind = Math.min(KINDS - 1, Math.max(0, Math.round(arr[k + 5]!)));
          // taller trees keep their detail a little further out
          const hk = 0.8 + Math.min(0.6, arr[k + 3]! / 60);
          const lod = d < NEAR_DIST * hk ? 0 : d < MID_DIST * hk ? 1 : 2;
          const bi = lod * KINDS + kind;
          const b = this.batches[bi]!;
          const n = counts[bi]!;
          if (n >= b.max) continue;
          const ia = b.inst.array as Float32Array;
          const va = b.vary.array as Float32Array;
          ia[n * 4] = arr[k]!;
          ia[n * 4 + 1] = arr[k + 1]! - 0.3;
          ia[n * 4 + 2] = arr[k + 2]!;
          ia[n * 4 + 3] = arr[k + 3]!;
          va[n * 3] = arr[k + 4]!;
          va[n * 3 + 1] = arr[k + 6]!;
          va[n * 3 + 2] = kind;
          counts[bi] = n + 1;
        }
      }
    }
    let calls = 0;
    this.batches.forEach((b, i) => {
      b.geo.instanceCount = counts[i]!;
      for (const a of [b.inst, b.vary]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, counts[i]! * a.itemSize);
        a.needsUpdate = true;
      }
      b.mesh.visible = counts[i]! > 0;
      if (b.mesh.visible) calls++;
    });
    const sum = (lod: number) => counts.slice(lod * KINDS, lod * KINDS + KINDS).reduce((a, c) => a + c, 0);
    this.stats.near = sum(0);
    this.stats.mid = sum(1);
    this.stats.far = sum(2);
    this.stats.drawCalls = calls;
  }

  /** Keep a circle free of trees in every era (e.g. a feature's building). */
  addClearing(x: number, z: number, r: number): void {
    this.clearings.push({ x, z, r });
    this.dirty = true;
  }

  /** Force an instance rebuild on the next update (after teleports). */
  invalidate(): void {
    this.dirty = true;
  }
}
