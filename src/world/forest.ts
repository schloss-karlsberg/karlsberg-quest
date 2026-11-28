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
  type Texture,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import type { Era } from '../core/era';
import { GROUND } from '../data/types';
import { ATMOS_GLSL, SEE_FRAG_GLSL, SEE_GLSL, atmosphere } from './atmosphere';
import type { Heightfield } from './heightfield';
import { FOLIAGE_GLSL } from './vegetation/foliage';
import { type ModelTrees, pickVariant, SHADOW_REACH } from './vegetation/trees';
import { ViewCone } from './viewCone';

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
const MID_DIST = 130;
const KINDS = 3;
const MAX_NEAR = 2500;
const MAX_MID = 9000;
const MAX_FAR = 40000;

/** Looking steeply down keeps the full ring only this high (m) above the ground (flying, spirit view). */
export const FULL_RING_AGL = 20;

/**
 * How the instance lists are culled (pure; exported for tests): `full` ring (culling off, or
 * looking steeply down from high above the ground), the horizontal `sector` (level view), or the
 * 3D view `cone` per 64 m tile (looking steeply down on foot: the Quelle ravine). `dirY` = the
 * view direction's y, `agl` = camera height above the terrain (m).
 */
export function forestCullMode(cull: boolean, dirY: number, agl: number): 'full' | 'sector' | 'cone' {
  if (!cull) return 'full';
  if (dirY >= -0.55) return 'sector';
  return agl > FULL_RING_AGL ? 'full' : 'cone';
}

/**
 * May a tree at (x, z) cast into the sun shadow box (pure; exported for tests)? (refX, refZ) is
 * where the box's focus is expected, `castMax` the radius around it that the shadow pass draws
 * from at all. The view plays no part: a tree behind the camera shades the ground in front of it.
 */
export function casterInReach(x: number, z: number, refX: number, refZ: number, castMax: number): boolean {
  const dx = x - refX;
  const dz = z - refZ;
  return dx * dx + dz * dz <= castMax * castMax;
}

/** Can the 64 m tile (tx, tz) hold such a caster (pure; exported for tests)? */
export function tileInReach(tx: number, tz: number, refX: number, refZ: number, castMax: number): boolean {
  const dx = Math.max(tx * TILE - refX, 0, refX - (tx + 1) * TILE);
  const dz = Math.max(tz * TILE - refZ, 0, refZ - (tz + 1) * TILE);
  return dx * dx + dz * dz <= castMax * castMax;
}

/** Bounding sphere of every tile's trees, base to crown top (cx, cy, cz, r; pure, exported for tests). */
export function tileSpheres(tiles: Map<string, Float32Array>): Map<string, Float32Array> {
  const out = new Map<string, Float32Array>();
  for (const [key, arr] of tiles) {
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let k = 0; k < arr.length; k += F) {
      y0 = Math.min(y0, arr[k + 1]!);
      y1 = Math.max(y1, arr[k + 1]! + arr[k + 3]!);
    }
    if (!(y1 >= y0)) continue;
    const [tx, tz] = key.split('_').map(Number) as [number, number];
    // half the tile diagonal and height, plus a crown's reach over the tile edge
    out.set(key, new Float32Array([(tx + 0.5) * TILE, (y0 + y1) / 2, (tz + 0.5) * TILE, Math.hypot(TILE / 2, TILE / 2, (y1 - y0) / 2) + 8]));
  }
  return out;
}

export interface ForestSource {
  hf: Heightfield;
  /** Today: canopy height (m). */
  canopy?: Float32Array;
  /** Historic eras: land-cover classes (forest class → trees). */
  ground?: Uint8Array;
  /** 0..1 path coverage; no trees on paths. */
  paths?: Float32Array;
  /** Land-cover classes; no trees on water (lakes, ponds) in any era. */
  noTreesOnWater?: Uint8Array;
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
      if (src.noTreesOnWater && src.noTreesOnWater[i] === GROUND.water) continue;
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
  const radial = detail ? 12 : 6;
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
  g.tube([0, -0.02, 0], [0, 1, 0], 0.012, 0.001, detail ? 10 : 5, detail ? 5 : 2, [0, 0, 0], 0.7);
  g.cone(0.24, 0.97, detail ? 0.085 : 0.1, detail ? 10 : 6);
  // whorls of short drooping branches; the lowest third of a stand-grown spruce is bare
  const tiers = detail ? 15 : 7;
  const per = detail ? 8 : 5;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const y = 0.26 + f * 0.7;
    const len = 0.025 + 0.15 * Math.pow(1 - f, 0.9);
    for (let k = 0; k < per; k++) {
      const a = ((k + r() * 0.6 + t * 0.37) / per) * Math.PI * 2;
      const out: V3 = [Math.cos(a), 0, Math.sin(a)];
      const droop = 0.25 + 0.25 * r() + 0.15 * (1 - f);
      const dir = norm3([out[0], -droop, out[2]]);
      // the card lies along the branch, tilted around it so it shows from the side too
      const side = norm3(cross3(dir, [0, 1, 0]));
      const tilt = (r() - 0.5) * 0.9;
      const base: V3 = [out[0] * 0.006, y, out[2] * 0.006];
      const light = (p: V3): V3 => norm3([p[0] * 3, 0.65 + (p[1] - y) * 2, p[2] * 3]);
      const w = len * (detail ? 0.8 : 1.0);
      const ao = 0.5 + 0.5 * f;
      const nn = norm3(cross3(side, dir));
      const nFace = norm3(add3(mul3(nn, Math.cos(tilt)), mul3(side, Math.sin(tilt))));
      g.card(base, nFace, dir, w, len * 1.15, P_NEEDLE, r(), ao, light, true);
      // a crossed card on the near level: the branch reads as a spray, not a flat slab, from below
      if (detail) g.card(base, norm3(add3(mul3(nn, Math.sin(tilt)), mul3(side, -Math.cos(tilt)))), dir, w * 0.7, len * 1.05, P_NEEDLE, r(), ao * 0.9, light, true);
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
${SEE_GLSL}
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
varying vec2 vBarkUv;
varying float vSee;
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
    vBarkUv = vec2(0.0);
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
    // bark texture: once around the trunk, one tile per 1.8 m up (a little random per tree)
    vBarkUv = vec2(uv.x + aVar.y * 3.7, position.y * h / 1.8 + aVar.y * 11.0);
    vRight = vec3(1.0, 0.0, 0.0);
    vUp = vec3(0.0, 1.0, 0.0);
    vH = position.y;
  }
  vWorld = wp;
  vNormal = nn;
  // in the way of the third-person view (trunk, low spruce cone): thinned in the fragment shader
  vSee = aPart > 4.5 ? 0.0 : kqSee(aInst.xyz, 0.1 + h * 0.016, aInst.y + h, wp);
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
varying vec2 vBarkUv;
varying float vSee;
${SEE_FRAG_GLSL}
#ifdef KQ_BARK
precision highp sampler2DArray;
// CC0 bark set (vegetation/strips.ts): 0 beech, 1 oak, 2 spruce; colour + normal xy / height
uniform sampler2DArray uBarkAlb;
uniform sampler2DArray uBarkNH;
#endif
${FOLIAGE_GLSL}

/**
 * Leaf clump card (stylized foliage, docs/ART-DIRECTION.md §5): a soft round mass whose rim is
 * scalloped by leaf tips, a few gaps near the edge, the inside a calm pattern of overlapping
 * leaves (shading only, no holes: big shapes, no noise). Returns coverage (anti-aliased with
 * fwidth, so alpha-to-coverage gives soft edges under MSAA) and a leaf shade term in .y.
 */
vec2 leafClump(vec2 uv, float seed, float dens) {
  vec2 c = uv - 0.5;
  float r = length(c) * 2.0;
  float ang = atan(c.y, c.x);
  // a card only a few pixels across (mid ring, 60 m +) skips the sub-pixel detail: the noisy
  // tips, the rim gaps and the fine mottling (integration pass: this shader was the forest's cost)
  float fr = fwidth(r);
  bool coarse = fr > 0.02;
  // scalloped outline: leaf tips around the rim, slower lobes for a lumpy silhouette
  float lobes = 0.11 * sin(ang * 3.0 + seed * 17.0) + 0.07 * sin(ang * 5.0 + seed * 41.0);
  // (softer tips than before: big cards with spiky rims read as torn paper, playtest)
  float tips = 0.05 * abs(sin(ang * 11.0 + seed * 23.0)) + (coarse ? 0.015 : 0.03 * kqNoise(vec2(ang * 6.0, seed * 9.0)));
  float edge = 0.86 + lobes - tips;
  // thinner in autumn / winter: the outline shrinks and gaps open from the rim
  edge *= mix(0.55, 1.0, dens);
  float d = r - edge;
  float aa = max(fr * 1.2, 0.012);
  float cov = 1.0 - smoothstep(-aa, aa, d);
  float m1 = kqNoise(uv * 6.0 + seed * 31.0);
  if (coarse) {
    // far: thinner seasons just shrink the outline a bit more
    cov *= 1.0 - smoothstep(0.75, 1.0, r / max(edge, 0.05)) * (1.0 - dens) * 0.8;
    return vec2(cov, (0.74 + 0.36 * m1 * 0.85) * mix(0.85, 1.05, smoothstep(0.1, 0.8, r)));
  }
  // gaps between leaf groups, only in the outer third
  vec2 g = uv * 7.0 + seed * 13.0;
  float gap = kqNoise(g) * 0.6 + kqNoise(g * 2.3) * 0.4;
  float gapCut = smoothstep(0.55, 0.95, r / max(edge, 0.05)) * (1.25 - dens * 0.55);
  float ga = max(fwidth(gap) * 1.5, 0.02);
  cov *= smoothstep(gapCut - ga, gapCut + ga, gap + 0.25);
  // interior: calm mottling of leaf groups (two noise octaves, no grid)
  float m2 = kqNoise(uv * 15.0 + seed * 17.0);
  float shade = (0.74 + 0.36 * (m1 * 0.65 + m2 * 0.35)) * mix(0.85, 1.05, smoothstep(0.1, 0.8, r));
  return vec2(cov, shade);
}

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

/** Spruce branch card: a stem with feathery needle sprigs, tapering to the tip (uv.y 0 trunk → 1 tip); coverage. */
float needleMask(vec2 uv, float seed) {
  float x = abs(uv.x - 0.5) * 2.0;
  float t = uv.y;
  float width = (1.0 - t) * 0.75 + 0.25;
  float fr = kqNoise(vec2(uv.x * 10.0, uv.y * 18.0) + seed * 9.0);
  float lim = width * (0.65 + 0.45 * fr);
  // sprigs: angled side shoots along the stem
  float sp = fract(t * 9.0 + x * 1.2 + seed * 3.0);
  float spr = smoothstep(0.25, 0.5, sp) * smoothstep(0.98, 0.7, sp);
  lim *= mix(1.0, 0.55 + 0.45 * spr, smoothstep(0.3, 0.8, x / max(width, 0.05)));
  float d = x - lim;
  float aa = max(fwidth(x) * 1.2, 0.01);
  float cov = 1.0 - smoothstep(-aa, aa, d);
  return cov * smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.94, 1.0, t));
}

void main() {
  if (kqSeeCut(vSee, vWorld)) discard;
  float kind = vKind;
  float isSpruce = step(0.5, kind) * (1.0 - step(1.5, kind));
  float seed = vEx.x;
  float v = fract(vVar * 7.13 + seed * 0.37);
  vec3 n = normalize(vNormal + vec3(0.0, 1e-4, 0.0));
  vec3 alb;
  float ao = vEx.y;
  float snowUp = 0.0;
  float leafy = 0.0;
  // alpha-to-coverage (MSAA tiers): soft cut-out edges; the shadow pass and the low tier (no
  // MSAA, shadows off → uShadowParams.x = 0) keep a hard 0.5 alpha test
  float cut = uShadowParams.x > 0.5 ? 0.1 : 0.5;
  float cover = 1.0;
  // shadow map pass: only the cut-outs matter, no lighting
  if (uShadowPass > 0.5 && (vPart < 0.5 || (vPart > 2.5 && vPart < 4.5))) { gl_FragColor = vec4(1.0); return; }
  if (vPart < 0.5) {
#ifdef KQ_BARK
    // CC0 bark: beech silver-grey and smooth, oak deep furrows, spruce red-brown scales
    float bl = kind > 1.5 ? 1.0 : (isSpruce > 0.5 ? 2.0 : 0.0);
    vec4 bc = texture(uBarkAlb, vec3(vBarkUv, bl));
    vec4 bn = texture(uBarkNH, vec3(vBarkUv, bl));
    alb = bc.rgb;
    if (bl < 0.5) alb = mix(alb, vec3(dot(alb, vec3(0.3, 0.55, 0.15))) * vec3(0.98, 1.0, 1.02) * 1.25, 0.65);
    // tangent frame on the trunk: around (T) and up (B)
    vec3 bB = normalize(vec3(0.0, 1.0, 0.0) - n * n.y + vec3(1e-4, 0.0, 0.0));
    vec3 bT = cross(bB, n);
    vec2 dnb = bn.rg * 2.0 - 1.0;
    float bs = 0.9 * (1.0 - smoothstep(25.0, 70.0, length(vWorld - uCamPos)));
    n = normalize(n + (bT * dnb.x + bB * dnb.y) * bs);
    // moss on the weather side (west) and near the foot
    float mossy = smoothstep(0.1, 0.8, -n.x * 0.7 + 0.3) * (1.0 - smoothstep(0.05, 0.35, vH)) * 0.75 + smoothstep(0.3, 0.9, -n.x) * 0.25;
    alb = mix(alb, srgb(vec3(0.26, 0.33, 0.12)) * (0.8 + 0.4 * bc.g), mossy * (1.0 - isSpruce * 0.6));
    ao = mix(0.55, 1.0, smoothstep(0.0, 0.5, vH)) * mix(0.7, 1.05, bn.b);
#else
    // bark: beech smooth grey with lichen, oak dark and furrowed, spruce red-brown and scaly
    float fur = kqNoise(vec2(vUv.x * 9.0, vUv.y * 0.6)) * 0.6 + kqNoise(vec2(vUv.x * 22.0, vUv.y * 2.5)) * 0.4;
    vec3 beech = srgb(vec3(0.46, 0.46, 0.42)) * (0.85 + 0.25 * kqNoise(vUv * vec2(4.0, 1.5)));
    beech = mix(beech, srgb(vec3(0.32, 0.38, 0.2)), smoothstep(0.55, 0.8, kqNoise(vUv * vec2(6.0, 2.0) + 3.0)) * 0.6);
    vec3 oak = srgb(vec3(0.26, 0.22, 0.17)) * (0.55 + 0.6 * smoothstep(0.25, 0.7, fur));
    vec3 spr = srgb(vec3(0.33, 0.22, 0.15)) * (0.7 + 0.4 * kqNoise(vUv * vec2(10.0, 5.0)));
    alb = kind > 1.5 ? oak : (isSpruce > 0.5 ? spr : beech);
    ao = mix(0.55, 1.0, smoothstep(0.0, 0.5, vH));
#endif
    // darker at the foot (damp), and low in the stand
    alb *= mix(0.6, 1.0, smoothstep(0.0, 0.12, vH));
    // trunks further off sink into the stand's shade (no pale palisade between the crowns)
    alb *= mix(1.0, 0.55, smoothstep(25.0, 110.0, length(vWorld - uCamPos)));
    snowUp = smoothstep(0.2, 0.7, n.y);
  } else if (vPart < 1.5) {
    float dens = leafDensity() * step(seed, leafDensity() + 0.25);
    vec2 lc = dens > 0.02 ? leafClump(vUv, seed, dens) : vec2(0.0);
    float tw = twigMask(vUv, seed) * twigShow();
    cover = max(lc.x, tw);
    if (cover < cut) discard;
    if (uShadowPass > 0.5) { gl_FragColor = vec4(1.0); return; }
    leafy = step(tw, lc.x);
    alb = leafy > 0.5 ? leafColour(kind, v) * lc.y * (0.88 + 0.24 * kqHash12(vec2(seed * 7.0, v))) : srgb(vec3(0.24, 0.21, 0.19));
    // clumps: the outer rim catches more sky, the core stays darker
    ao *= mix(0.8, 1.05, smoothstep(0.2, 0.9, length(vUv - 0.5) * 2.0));
    snowUp = leafy > 0.5 ? 0.0 : 0.8 * smoothstep(-0.2, 0.6, vEx.z);
  } else if (vPart < 2.5) {
    cover = needleMask(vUv, seed);
    if (cover < cut) discard;
    if (uShadowPass > 0.5) { gl_FragColor = vec4(1.0); return; }
    leafy = 1.0;
    // blue-green needles, fresh lighter growth at the branch tips
    alb = mix(srgb(vec3(0.09, 0.16, 0.1)), srgb(vec3(0.13, 0.21, 0.11)), v) * (0.8 + 0.35 * kqNoise(vUv * 12.0));
    alb = mix(alb, srgb(vec3(0.22, 0.3, 0.13)), smoothstep(0.6, 1.0, vUv.y) * 0.5);
    // snow lies on the upper side of the branches
    snowUp = smoothstep(0.1, 0.8, vEx.z) * smoothstep(0.15, 0.7, vUv.y + 0.3 * kqNoise(vUv * 9.0 + seed));
  } else if (vPart < 4.5) {
    // the dark needle mass inside a spruce
    alb = srgb(vec3(0.06, 0.1, 0.065)) * (0.7 + 0.5 * kqNoise(vec2(vUv.x * 30.0, vWorld.y * 0.8)));
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
      float dd = abs(q.x) - w * (0.8 + 0.3 * nz);
      crown = (1.0 - smoothstep(-fwidth(dd), fwidth(dd), dd)) * step(0.14, q.y);
    } else {
      float cy = kind > 1.5 ? 0.58 : 0.64;
      float ry = kind > 1.5 ? 0.36 : 0.36;
      cq = vec2(q.x, (q.y - cy) / ry);
      float r = length(cq) + (nz - 0.75) * 0.32;
      float fr = max(fwidth(r), 0.01);
      crown = 1.0 - smoothstep(0.98 - fr, 0.98 + fr, r);
    }
    // a short dark trunk only (playtest: the far stand read as a palisade of pale poles)
    float trunk = step(abs(q.x), 0.04 * (1.0 - q.y)) * step(q.y, isSpruce > 0.5 ? 0.2 : 0.4);
    // winter: bare broadleaf crowns become a thin, twiggy haze (partial coverage, no pixel noise)
    float bare = (1.0 - isSpruce) * twigShow();
    crown *= 1.0 - bare * 0.62 * smoothstep(0.2, 0.9, length(cq) + 0.25 * nz);
    cover = max(crown, trunk);
    if (cover < cut * (bare > 0.5 ? 0.6 : 1.0)) discard;
    if (uShadowPass > 0.5) { gl_FragColor = vec4(1.0); return; }
    if (crown >= trunk) {
      float cz = sqrt(max(0.0, 1.0 - dot(cq, cq) * 0.7));
      vec3 vd = normalize(cross(vRight, vUp));
      n = normalize(vRight * cq.x + vUp * cq.y * 0.8 + vd * cz + vec3(0.0, 0.25, 0.0));
      alb = isSpruce > 0.5 ? srgb(vec3(0.07, 0.13, 0.08)) : mix(leafColour(kind, v), srgb(vec3(0.24, 0.21, 0.19)), bare);
      alb *= 0.7 + 0.45 * nz;
      ao = 0.45 + 0.55 * clamp(cq.y * 0.5 + 0.6, 0.0, 1.0);
      leafy = 1.0 - bare;
      snowUp = smoothstep(0.2, 0.8, n.y) * (isSpruce > 0.5 ? 0.6 : 0.25);
    } else {
      alb = srgb(vec3(0.13, 0.11, 0.1));
      ao = 0.45;
    }
  }
  // a touch toward the painted palette (rich, not grey: docs/ART-DIRECTION.md §1)
  float lum = dot(alb, vec3(0.3, 0.55, 0.15));
  alb = mix(vec3(lum), alb, 1.08) * 0.95;
  alb = mix(alb, srgb(vec3(0.86, 0.89, 0.95)), uSnow * snowUp * 0.85);
  vec3 col = kqLight(alb, n, vWorld, ao, 1.0);
  // leaves scatter sky light: undersides dim, not black
  col += alb * uSkyAmbient * 0.3 * leafy * (1.0 - max(n.y, 0.0));
  // sun shining through the leaves from behind
  vec3 vd = normalize(vWorld - uCamPos);
  col += alb * uSunColor * pow(max(dot(vd, uSunDir), 0.0), 4.0) * 0.55 * leafy;
  // coverage → alpha (alpha-to-coverage on the MSAA tiers; ignored otherwise)
  gl_FragColor = vec4(kqFog(col, vWorld), clamp((cover - cut) / max(1.0 - cut, 1e-3) * 1.6, 0.0, 1.0));
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
  private spheres = new Map<string, Float32Array>();
  private readonly batches: Batch[] = [];
  private lastX = Infinity;
  private lastZ = Infinity;
  private dirty = true;
  farDist = 700;
  /**
   * LOD scale of the graphics preset: the near (< 60 m) and mid (< 180 m) rings are multiplied by
   * it. `setDistances(near, far)` maps the preset's detailed-ring distance (170 m = High) onto it.
   */
  lodScale = 1;
  /** The preset's detailed-ring distance (m) that `lodScale` was derived from. */
  nearDist = 170;
  readonly stats = { near: 0, mid: 0, far: 0, total: 0, drawCalls: 0, culled: 0 };
  /** View direction the instance lists were built for (sector culling). */
  private lastYaw = 0;
  private lastDown = false;
  private lastMode = '';
  private lastFov = 0;
  private readonly cone = new ViewCone();
  private counts: number[] = [];
  private readonly dir = new Vector3();
  /** Sector culling on (debug / tests can switch it off). */
  cull = true;
  /** Circles kept free of trees for feature buildings. */
  private readonly clearings: { x: number; z: number; r: number; eras?: readonly Era[] }[] = [];
  private activeClearings: typeof this.clearings = [];
  private era: Era = 'today';
  /** CC0 model trees with baked impostors (medium / high, vegetation/trees.ts); null = procedural. */
  private models: ModelTrees | null = null;

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
        uBarkAlb: { value: null as Texture | null },
        uBarkNH: { value: null as Texture | null },
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

  /** CC0 bark set (vegetation/strips.ts) or null for the procedural bark (low tier). */
  setBark(set: { albedo: Texture; nh: Texture } | null): void {
    const u = this.material.uniforms;
    u.uBarkAlb!.value = set?.albedo ?? null;
    u.uBarkNH!.value = set?.nh ?? null;
    const on = set !== null;
    if (on === 'KQ_BARK' in this.material.defines) return;
    if (on) this.material.defines.KQ_BARK = '';
    else delete this.material.defines.KQ_BARK;
    this.material.needsUpdate = true;
  }

  /** Alpha-to-coverage for the leaf / impostor cut-outs (tiers with MSAA). */
  setAlphaToCoverage(on: boolean): void {
    this.a2c = on;
    this.models?.setAlphaToCoverage(on);
    if (this.material.alphaToCoverage === on) return;
    this.material.alphaToCoverage = on;
    this.material.needsUpdate = true;
  }
  private a2c = false;

  /** Uniforms the model trees share with this forest (atmosphere, far ring, scan lens). */
  get sharedUniforms(): Record<string, { value: unknown }> {
    const u = this.material.uniforms;
    return { ...atmosphere, uFar: u.uFar!, uScanMix: u.uScanMix!, uMapMix: u.uMapMix!, uScanCenter: u.uScanCenter!, uScanRadius: u.uScanRadius! };
  }

  /** Half extent of the sun shadow box (m; the last pass's), for the model trees' caster lists. */
  private shadowRange = 75;
  /**
   * Are sun shadows on (World: the shadow map exists, medium / high)? Then the trees the view
   * leaves out still cast into it: the low sun throws a crown's shadow 60 m and more, from behind
   * the camera right across the picture.
   */
  casting: () => boolean = () => false;
  private lastCasting = false;

  /** Shadow pass hook (render/shadows.ts `onPass`): the model trees draw their caster lists. */
  shadowPass(on: boolean, focus: Vector3, range: number): void {
    if (on && range !== this.shadowRange) {
      this.shadowRange = range;
      this.dirty = true;
    }
    const drift = this.models?.shadowPass(on, focus.x, focus.z, range) ?? 0;
    // the lists hold the casters within 24 m of drift (a turn in the full-ring mode does not
    // rebuild them): past 20 m rebuild before the next pass
    if (drift > 20) this.dirty = true;
  }

  /** Switch to the CC0 model trees (vegetation/trees.ts) or back to the procedural forest (null). */
  setModels(m: ModelTrees | null): void {
    if (m === this.models) return;
    if (this.models) this.object.remove(this.models.object);
    this.models = m;
    if (m) {
      this.object.add(m.object);
      m.setAlphaToCoverage(this.a2c);
    }
    for (const b of this.batches) b.mesh.visible = false;
    this.dirty = true;
  }

  /** The model trees are drawn (medium / high with the set loaded). */
  get usesModels(): boolean {
    return this.models !== null;
  }

  setTrees(tiles: Map<string, Float32Array>, era: Era): void {
    this.era = era;
    this.updateClearings();
    this.tiles = tiles;
    this.spheres = tileSpheres(tiles);
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

  /** Near (detailed) and far ring of the instanced trees (graphics preset). */
  setDistances(near: number, far: number): void {
    const ls = near / 170;
    if (ls === this.lodScale && far === this.farDist) return;
    this.lodScale = ls;
    this.nearDist = near;
    this.setFarDistance(far);
  }

  /**
   * Rebuild the instance lists when the camera moved 8 m or turned 20°. Trees outside a sector
   * around the view direction (horizontal half-FOV + 40°, everything within 30 m) are left out.
   * Looking steeply down keeps the full ring only from high above the ground (`agl` > 20 m:
   * flying, spirit view); on foot whole 64 m tiles outside the 3D view cone (frustum corner + 40°)
   * are left out instead, rebuilt when the view turned 20° (`forestCullMode`).
   *
   * That cut is for the picture only. With sun shadows on (`casting`), every tree in reach of
   * the shadow box stays a caster wherever the view points (TASK-088: the casters used to follow
   * the sector, so each rebuild in a turn switched the shadows of the trees behind the camera on
   * or off and the ground in view jumped lighter or darker).
   */
  update(camera: PerspectiveCamera, agl = 0): void {
    const p = camera.position;
    camera.getWorldDirection(this.dir);
    const down = this.dir.y < -0.55;
    const mode = forestCullMode(this.cull, this.dir.y, agl);
    const yaw = Math.atan2(this.dir.x, -this.dir.z);
    let dYaw = Math.abs(yaw - this.lastYaw);
    if (dYaw > Math.PI) dYaw = 2 * Math.PI - dYaw;
    const turned = mode === 'sector' ? dYaw > 0.35 : mode === 'cone' && this.cone.turned(camera, 0.35);
    const casting = this.casting();
    if (!this.dirty && !turned && down === this.lastDown && mode === this.lastMode && camera.fov === this.lastFov && casting === this.lastCasting && Math.hypot(p.x - this.lastX, p.z - this.lastZ) < 8) return;
    this.dirty = false;
    this.lastCasting = casting;
    this.lastX = p.x;
    this.lastZ = p.z;
    this.lastYaw = yaw;
    this.lastDown = down;
    this.lastMode = mode;
    this.lastFov = camera.fov;
    const cone = mode === 'cone';
    if (cone) this.cone.set(camera, 0.7);
    // horizontal view direction and the sector's cosine limit
    const hl = Math.hypot(this.dir.x, this.dir.z) || 1;
    const fx = this.dir.x / hl;
    const fz = this.dir.z / hl;
    const halfH = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    const sector = halfH + 0.7;
    const cosLimit = this.cull && !down && sector < Math.PI ? Math.cos(sector) : -2;
    const ls = this.lodScale;
    if (this.counts.length !== this.batches.length) this.counts = new Array<number>(this.batches.length).fill(0);
    const counts = this.counts;
    counts.fill(0);
    let culled = 0;
    const far = this.farDist;
    const models = this.models;
    // February 1793: bare broadleaf crowns (the dead models); a few snags in every stand
    const winter = atmosphere.uSeason.value > 1.6;
    const snagRate = atmosphere.uSeason.value > 0.5 ? 0.05 : 0.025;
    // the shadow lists are sorted from where the shadow focus will be (boot.ts: ahead of the camera
    // by 0.35 × the box's half extent); trees past the box + reach + 24 m of drift never cast
    const lead = this.shadowRange * 0.35;
    const refX = p.x + fx * lead;
    const refZ = p.z + fz * lead;
    const castMax = this.shadowRange + SHADOW_REACH + 24;
    models?.begin(refX, refZ, castMax);
    const t0x = Math.floor((p.x - far) / TILE);
    const t1x = Math.floor((p.x + far) / TILE);
    const t0z = Math.floor((p.z - far) / TILE);
    const t1z = Math.floor((p.z + far) / TILE);
    for (let tz = t0z; tz <= t1z; tz++) {
      for (let tx = t0x; tx <= t1x; tx++) {
        const arr = this.tiles.get(`${tx}_${tz}`);
        if (!arr) continue;
        const sp = cone ? this.spheres.get(`${tx}_${tz}`) : undefined;
        // a tile outside the view cone: none of its trees show, the ones in reach still cast
        const hidden = sp !== undefined && !this.cone.keeps(sp[0]!, sp[1]!, sp[2]!, sp[3]!, 30 + TILE * 0.71);
        if (hidden) {
          culled += arr.length / F;
          if (!casting || !tileInReach(tx, tz, refX, refZ, castMax)) continue;
        }
        for (let k = 0; k < arr.length; k += F) {
          const dx = arr[k]! - p.x;
          const dz = arr[k + 2]! - p.z;
          const d = Math.hypot(dx, dz);
          if (d > far) continue;
          // out of view: left out of the picture, but a caster while its shadow can fall into it
          const unseen = hidden || (d > 30 && dx * fx + dz * fz < cosLimit * d);
          if (unseen) {
            if (!hidden) culled++;
            if (!casting || !casterInReach(arr[k]!, arr[k + 2]!, refX, refZ, castMax)) continue;
          }
          if (this.activeClearings.length && this.inClearing(arr[k]!, arr[k + 2]!)) continue;
          const kind = Math.min(KINDS - 1, Math.max(0, Math.round(arr[k + 5]!)));
          // taller trees keep their detail a little further out
          const hk = (0.8 + Math.min(0.6, arr[k + 3]! / 60)) * ls;
          if (models) {
            const v = arr[k + 6]!;
            const variant = pickVariant(kind, (v * 7919.31) % 1, (v * 1237.77) % 1, winter, snagRate);
            if (unseen) models.cast(arr[k]!, arr[k + 1]! - 0.3, arr[k + 2]!, arr[k + 3]!, arr[k + 4]!, v, variant, d, hk);
            else models.push(arr[k]!, arr[k + 1]! - 0.3, arr[k + 2]!, arr[k + 3]!, arr[k + 4]!, v, variant, d, hk);
            continue;
          }
          // (the procedural forest casts with the batches it shows: an unseen caster stays in them)
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
    for (let i = 0; i < this.batches.length; i++) {
      const b = this.batches[i]!;
      b.geo.instanceCount = counts[i]!;
      b.inst.clearUpdateRanges();
      b.inst.addUpdateRange(0, counts[i]! * b.inst.itemSize);
      b.inst.needsUpdate = true;
      b.vary.clearUpdateRanges();
      b.vary.addUpdateRange(0, counts[i]! * b.vary.itemSize);
      b.vary.needsUpdate = true;
      b.mesh.visible = counts[i]! > 0;
      if (b.mesh.visible) calls++;
    }
    if (models) {
      models.end();
      this.stats.near = models.stats.lod0;
      this.stats.mid = models.stats.lod1;
      this.stats.far = models.stats.imp;
      this.stats.drawCalls = models.stats.calls;
      this.stats.culled = culled;
      return;
    }
    let nN = 0;
    let nM = 0;
    let nF = 0;
    for (let k = 0; k < KINDS; k++) {
      nN += counts[k] ?? 0;
      nM += counts[KINDS + k] ?? 0;
      nF += counts[2 * KINDS + k] ?? 0;
    }
    this.stats.near = nN;
    this.stats.mid = nM;
    this.stats.far = nF;
    this.stats.drawCalls = calls;
    this.stats.culled = culled;
  }

  private inClearing(x: number, z: number): boolean {
    for (const c of this.activeClearings) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r ** 2) return true;
    return false;
  }

  private updateClearings(): void {
    this.activeClearings = this.clearings.filter((c) => !c.eras || c.eras.includes(this.era));
    this.dirty = true;
  }

  /** Keep a circle free of trees, in every era by default. */
  addClearing(x: number, z: number, r: number, eras?: readonly Era[]): void {
    this.clearings.push({ x, z, r, eras });
    this.updateClearings();
  }

  /** Force an instance rebuild on the next update (after teleports). */
  invalidate(): void {
    this.dirty = true;
  }

  /**
   * Tree trunks within `r` of a point (third-person camera collision, src/player/camera.ts):
   * `fn(x, z, radius, topY)` with the trunk's radius at the root flare and the height where the
   * crown takes over.
   */
  trunksNear(x: number, z: number, r: number, fn: (tx: number, tz: number, tr: number, top: number) => void): void {
    const tx0 = Math.floor((x - r - 1) / TILE);
    const tx1 = Math.floor((x + r + 1) / TILE);
    const tz0 = Math.floor((z - r - 1) / TILE);
    const tz1 = Math.floor((z + r + 1) / TILE);
    for (let tz = tz0; tz <= tz1; tz++)
      for (let tx = tx0; tx <= tx1; tx++) {
        const arr = this.tiles.get(`${tx}_${tz}`);
        if (!arr) continue;
        for (let k = 0; k < arr.length; k += F) {
          const ax = arr[k]!;
          const az = arr[k + 2]!;
          const h = arr[k + 3]!;
          const tr = 0.1 + h * 0.016;
          if (Math.abs(ax - x) > r + tr || Math.abs(az - z) > r + tr) continue;
          if (this.activeClearings.length && this.inClearing(ax, az)) continue;
          fn(ax, az, tr, arr[k + 1]! + h * 0.55);
        }
      }
  }
}
