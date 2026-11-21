/**
 * LiDAR-style point clouds of the world for the era shift (and the Steinfraß grains):
 * terrain (with both era reliefs, for the morph), palace surface (area-weighted triangle
 * samples with confidence classes) and trees (from the forest's current instances).
 */
import { BufferAttribute, BufferGeometry, Float32BufferAttribute, type InstancedBufferGeometry, type Mesh, type Object3D } from 'three';
import type { Heightfield } from '../../../world/heightfield';
import { rng } from '../geom';

/**
 * Terrain points around (cx, cz) in the concentric-ring pattern of a terrestrial laser scanner
 * standing at the player: rings grow geometrically (`ringGrowth`) from 2 m out to `radius`, each
 * with `perRing` points, so density falls off with distance like a real scan. Heights of both eras
 * are stored for the morph; a strong hillshade makes the relief read like a LiDAR viewer.
 */
export function buildTerrainCloud(
  hfA: Heightfield,
  hfB: Heightfield,
  cx: number,
  cz: number,
  radius: number,
  perRing: number,
  ringGrowth = 1.03,
  seed = 7,
): BufferGeometry {
  const job = new TerrainCloudJob(hfA, hfB, cx, cz, radius, perRing, ringGrowth, seed);
  job.step(Infinity, Infinity);
  const n = job.count;
  const a = job.arrays;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(a.pos.subarray(0, n * 3), 3));
  g.setAttribute('aH2', new BufferAttribute(a.h2.subarray(0, n), 1));
  g.setAttribute('aShade', new BufferAttribute(a.shade.subarray(0, n), 1));
  g.setAttribute('aRand', new BufferAttribute(a.rand.subarray(0, n), 1));
  g.boundingSphere = null;
  return g;
}

/**
 * `buildTerrainCloud` ring by ring, inner rings first (the same points in the same order). The era
 * shift builds its terrain cloud this way over its first frames instead of all on the first one
 * (M-17): a ring only shows once the outgoing scan wave has passed it, so the shift keeps the rings
 * built out ahead of the wave (`step(budget, minR)`) and nothing on screen changes.
 * `geometry` holds full-size buffers; its draw range covers the points built so far.
 */
export class TerrainCloudJob {
  readonly arrays: { pos: Float32Array; h2: Float32Array; shade: Float32Array; rand: Float32Array };
  readonly geometry = new BufferGeometry();
  /** Points written so far. */
  count = 0;
  /** Every point nearer than this radius (m) is written; Infinity once all are. */
  builtR = 0;
  private readonly radii: number[] = [];
  private ring = 0;
  private readonly r: () => number;

  constructor(
    private readonly hfA: Heightfield,
    private readonly hfB: Heightfield,
    private readonly cx: number,
    private readonly cz: number,
    radius: number,
    private readonly perRing: number,
    ringGrowth = 1.03,
    seed = 7,
  ) {
    this.r = rng(seed);
    for (let rr = 2; rr <= radius; rr *= ringGrowth) this.radii.push(rr);
    const count = this.radii.length * perRing;
    this.arrays = { pos: new Float32Array(count * 3), h2: new Float32Array(count), shade: new Float32Array(count), rand: new Float32Array(count) };
    const g = this.geometry;
    g.setAttribute('position', new BufferAttribute(this.arrays.pos, 3));
    g.setAttribute('aH2', new BufferAttribute(this.arrays.h2, 1));
    g.setAttribute('aShade', new BufferAttribute(this.arrays.shade, 1));
    g.setAttribute('aRand', new BufferAttribute(this.arrays.rand, 1));
    g.boundingSphere = null;
    g.setDrawRange(0, 0);
    this.builtR = this.radii.length ? this.radii[0]! * 0.998 : Infinity;
  }

  get done(): boolean {
    return this.ring >= this.radii.length;
  }

  /**
   * Write rings until `budgetMs` is spent, but always at least one ring and at least out to
   * radius `minR` (m). The geometry's draw range and buffer update ranges follow.
   */
  step(budgetMs: number, minR: number, now: () => number = () => performance.now()): void {
    if (this.done) return;
    const t0 = budgetMs === Infinity ? 0 : now();
    const n0 = this.count;
    const { pos, h2, shade, rand } = this.arrays;
    const { hfA, hfB, cx, cz, perRing, r } = this;
    const b = hfA.bounds;
    let n = n0;
    const ring0 = this.ring;
    while (this.ring < this.radii.length) {
      const rr = this.radii[this.ring]!;
      if (this.ring > ring0 && rr * 0.998 > minR && budgetMs !== Infinity && now() - t0 >= budgetMs) break;
      const phase = r() * Math.PI * 2;
      for (let i = 0; i < perRing; i++) {
        const a = phase + (i / perRing) * Math.PI * 2;
        // a scanner's rings are slightly wobbly where the beam hits uneven ground
        const rj = rr * (1 + (r() - 0.5) * 0.004);
        const x = cx + Math.cos(a) * rj;
        const z = cz + Math.sin(a) * rj;
        if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
        pos[n * 3] = x;
        pos[n * 3 + 1] = hfA.heightAt(x, z);
        pos[n * 3 + 2] = z;
        h2[n] = hfB.heightAt(x, z);
        shade[n] = hillshade(hfA, x, z);
        rand[n] = r();
        n++;
      }
      this.ring++;
      // a ring's points sit within ±0.2 % of its radius: nothing unbuilt lies nearer than this
      this.builtR = this.done ? Infinity : this.radii[this.ring]! * 0.998;
    }
    this.count = n;
    if (n === n0) return;
    const g = this.geometry;
    g.setDrawRange(0, n);
    for (const [name, size] of [['position', 3], ['aH2', 1], ['aShade', 1], ['aRand', 1]] as const) {
      const attr = g.getAttribute(name) as BufferAttribute;
      attr.addUpdateRange(n0 * size, (n - n0) * size);
      attr.needsUpdate = true;
    }
  }
}

/** Hillshade 0..1 with 4× vertical exaggeration, light from the north-west 45° up. */
export function hillshade(hf: Pick<Heightfield, 'normalAt'>, x: number, z: number): number {
  const [nx, ny, nz] = hf.normalAt(x, z);
  const ex = nx * 4;
  const ez = nz * 4;
  const len = Math.hypot(ex, ny, ez);
  return Math.max(0, Math.min(1, (-0.5 * ex + 0.707 * ny - 0.5 * ez) / len));
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
  const it = samplePalaceSteps(palaceRoot, count, seed);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/** Triangles / samples between two yields of `samplePalaceSteps` (≈ 2–4 ms each on a laptop). */
const SAMPLE_STEP = 60_000;

/**
 * `samplePalace` as a resumable job: yields every SAMPLE_STEP triangles / samples, so the area pass
 * over the multi-million-triangle palace can run in idle slices (fx/shift/warm.ts) instead of
 * stalling the first frame of the first era shift. Same result as `samplePalace`.
 */
export function* samplePalaceSteps(palaceRoot: Object3D, count: number, seed = 11): Generator<void, PalaceSamples | null> {
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
    if (t % SAMPLE_STEP === SAMPLE_STEP - 1) yield;
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
    if (i % SAMPLE_STEP === SAMPLE_STEP - 1) yield;
  }
  return { pos, base, conf, count };
}

let palaceCache: PalaceSamples | null = null;
const PALACE_SAMPLES = 110_000;

/** Cached palace samples (the merged palace mesh never changes). Null until the palace loaded. */
export function palaceSamples(palaceRoot: Object3D, count = PALACE_SAMPLES): PalaceSamples | null {
  if (!palaceCache) palaceCache = samplePalace(palaceRoot, count);
  return palaceCache;
}

/**
 * Fill the `palaceSamples` cache as a resumable job (idle-time warm-up before the first shift).
 * Does nothing when the cache is already filled; a job that finds no palace mesh leaves it empty.
 */
export function* warmPalaceSamples(palaceRoot: Object3D): Generator<void, void> {
  if (palaceCache) return;
  const s = yield* samplePalaceSteps(palaceRoot, PALACE_SAMPLES);
  palaceCache ??= s;
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
