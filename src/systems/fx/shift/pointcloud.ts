/**
 * LiDAR-style point clouds of the world for the era shift (and the Steinfraß grains):
 * terrain (with both era reliefs, for the morph), palace surface (area-weighted triangle
 * samples with confidence classes) and trees (from the forest's current instances).
 */
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, type InstancedBufferGeometry, type Mesh, type Object3D } from 'three';
import type { Heightfield } from '../../../world/heightfield';
import { rng } from '../geom';

/** Terrain points around (cx, cz): denser near the centre. Heights of both eras for the morph. */
export function buildTerrainCloud(hfA: Heightfield, hfB: Heightfield, cx: number, cz: number, radius: number, count: number, seed = 7): BufferGeometry {
  const r = rng(seed);
  const pos = new Float32Array(count * 3);
  const h2 = new Float32Array(count);
  const shade = new Float32Array(count);
  const rand = new Float32Array(count);
  const b = hfA.bounds;
  let n = 0;
  for (let i = 0; i < count * 2 && n < count; i++) {
    const rr = radius * Math.pow(r(), 0.75);
    const a = r() * Math.PI * 2;
    const x = cx + Math.cos(a) * rr;
    const z = cz + Math.sin(a) * rr;
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
    pos[n * 3] = x;
    pos[n * 3 + 1] = hfA.heightAt(x, z);
    pos[n * 3 + 2] = z;
    h2[n] = hfB.heightAt(x, z);
    // multi-directional hillshade with 2.5× exaggeration: relief reads like a LiDAR viewer
    const [nx, ny, nz] = hfA.normalAt(x, z);
    const ex = nx * 2.5;
    const ez = nz * 2.5;
    const len = Math.hypot(ex, ny, ez);
    // light from the north-west, 45° up
    shade[n] = Math.max(0, Math.min(1, (-0.5 * ex + 0.707 * ny - 0.5 * ez) / len));
    rand[n] = r();
    n++;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos.subarray(0, n * 3), 3));
  g.setAttribute('aH2', new BufferAttribute(h2.subarray(0, n), 1));
  g.setAttribute('aShade', new BufferAttribute(shade.subarray(0, n), 1));
  g.setAttribute('aRand', new BufferAttribute(rand.subarray(0, n), 1));
  g.boundingSphere = null;
  return g;
}

export interface PalaceSamples {
  /** x, y, z per point */
  pos: Float32Array;
  base: Float32Array;
  conf: Float32Array;
  count: number;
}

/** Area-weighted surface samples of the merged palace mesh (cached by the caller). */
export function samplePalace(palaceRoot: Object3D, count: number, seed = 11): PalaceSamples | null {
  let mesh: Mesh | null = null;
  palaceRoot.traverse((o) => {
    if (!mesh && (o as Mesh).isMesh) mesh = o as Mesh;
  });
  if (!mesh) return null;
  const g = (mesh as Mesh).geometry;
  const P = g.getAttribute('position');
  const B = g.getAttribute('aBase');
  const C = g.getAttribute('aConf');
  if (!P) return null;
  const idx = g.index;
  const triCount = idx ? idx.count / 3 : P.count / 3;
  const vi = (t: number, k: number) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
  const cum = new Float64Array(triCount);
  let total = 0;
  for (let t = 0; t < triCount; t++) {
    const a = vi(t, 0);
    const b = vi(t, 1);
    const c = vi(t, 2);
    const ux = P.getX(b) - P.getX(a);
    const uy = P.getY(b) - P.getY(a);
    const uz = P.getZ(b) - P.getZ(a);
    const vx = P.getX(c) - P.getX(a);
    const vy = P.getY(c) - P.getY(a);
    const vz = P.getZ(c) - P.getZ(a);
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    total += Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
    cum[t] = total;
  }
  const r = rng(seed);
  const pos = new Float32Array(count * 3);
  const base = new Float32Array(count);
  const conf = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const target = r() * total;
    let lo = 0;
    let hi = triCount - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cum[m]! < target) lo = m + 1;
      else hi = m;
    }
    const a = vi(lo, 0);
    const b = vi(lo, 1);
    const c = vi(lo, 2);
    let u = r();
    let v = r();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;
    pos[i * 3] = P.getX(a) * w + P.getX(b) * u + P.getX(c) * v;
    pos[i * 3 + 1] = P.getY(a) * w + P.getY(b) * u + P.getY(c) * v;
    pos[i * 3 + 2] = P.getZ(a) * w + P.getZ(b) * u + P.getZ(c) * v;
    base[i] = B ? B.getX(a) : pos[i * 3 + 1]!;
    conf[i] = C ? C.getX(a) : 2;
  }
  return { pos, base, conf, count };
}

let palaceCache: PalaceSamples | null = null;

/** Cached palace samples (the merged palace mesh never changes). Null until the palace loaded. */
export function palaceSamples(palaceRoot: Object3D, count = 110_000): PalaceSamples | null {
  if (!palaceCache) palaceCache = samplePalace(palaceRoot, count);
  return palaceCache;
}

export function palaceCloudGeometry(s: PalaceSamples, filter?: (rel: number) => boolean): BufferGeometry {
  const keep: number[] = [];
  for (let i = 0; i < s.count; i++) if (!filter || filter(s.pos[i * 3 + 1]! - s.base[i]!)) keep.push(i);
  const pos = new Float32Array(keep.length * 3);
  const base = new Float32Array(keep.length);
  const conf = new Float32Array(keep.length);
  const rand = new Float32Array(keep.length);
  const r = rng(5);
  keep.forEach((i, k) => {
    pos[k * 3] = s.pos[i * 3]!;
    pos[k * 3 + 1] = s.pos[i * 3 + 1]!;
    pos[k * 3 + 2] = s.pos[i * 3 + 2]!;
    base[k] = s.base[i]!;
    conf[k] = s.conf[i]!;
    rand[k] = r();
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aBase', new BufferAttribute(base, 1));
  g.setAttribute('aConf', new BufferAttribute(conf, 1));
  g.setAttribute('aRand', new BufferAttribute(rand, 1));
  return g;
}

/** Tree points (trunk line + crown shell) from the forest's current instance buffers. */
export function buildTreeCloud(forestRoot: Object3D, cx: number, cz: number, radius: number, maxTrees: number, perTree: number, seed = 3): BufferGeometry {
  const trees: { x: number; y: number; z: number; h: number; d: number }[] = [];
  forestRoot.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const g = m.geometry as InstancedBufferGeometry;
    const inst = g.getAttribute('aInst');
    if (!inst) return;
    const n = Math.min(g.instanceCount ?? 0, inst.count);
    for (let i = 0; i < n; i++) {
      const x = inst.getX(i);
      const z = inst.getZ(i);
      const d = Math.hypot(x - cx, z - cz);
      if (d <= radius) trees.push({ x, y: inst.getY(i), z, h: inst.getW(i), d });
    }
  });
  trees.sort((a, b) => a.d - b.d);
  const list = trees.slice(0, maxTrees);
  const r = rng(seed);
  const n = list.length * perTree;
  const pos = new Float32Array(n * 3);
  const base = new Float32Array(n);
  const rel = new Float32Array(n);
  const rand = new Float32Array(n);
  let k = 0;
  for (const t of list) {
    const trunk = Math.max(3, Math.round(perTree * 0.2));
    for (let i = 0; i < perTree; i++) {
      let x: number;
      let y: number;
      let z: number;
      if (i < trunk) {
        const f = i / trunk;
        x = t.x + (r() - 0.5) * 0.3;
        z = t.z + (r() - 0.5) * 0.3;
        y = t.y + f * t.h * 0.55;
      } else {
        // crown: ellipsoid shell
        const u = r() * 2 - 1;
        const a = r() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        const rad = t.h * 0.22 * (0.8 + 0.2 * r());
        x = t.x + Math.cos(a) * s * rad;
        z = t.z + Math.sin(a) * s * rad;
        y = t.y + t.h * 0.62 + u * t.h * 0.3;
      }
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
      base[k] = t.y;
      rel[k] = Math.max(0, Math.min(1, (y - t.y) / Math.max(1, t.h)));
      rand[k] = r();
      k++;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aBase', new BufferAttribute(base, 1));
  g.setAttribute('aRel', new BufferAttribute(rel, 1));
  g.setAttribute('aRand', new BufferAttribute(rand, 1));
  return g;
}
