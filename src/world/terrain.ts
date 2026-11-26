import {
  Box3,
  BufferAttribute,
  ClampToEdgeWrapping,
  DataTexture,
  DynamicDrawUsage,
  FloatType,
  Frustum,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MirroredRepeatWrapping,
  NearestFilter,
  RedFormat,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import { RELIEF_TILE_M, type TerrainReliefMeta, type TerrainSurfaceMeta } from '../data/types';
import { atmosphere } from './atmosphere';
import type { Heightfield } from './heightfield';
import { TERRAIN_FRAG, TERRAIN_VERT } from './terrainShader';
import { GROUND_TILE_M } from './vegetation/strips';

/** Quads per chunk side at LOD 0 (one quad = one 2 m cell). */
export const CHUNK = 64;
const LOD_STEPS = [1, 2, 4, 8];
/** Camera distance (m) up to which each LOD is used. */
const LOD_DIST = [200, 450, 1000, Infinity];
/** Chunks of mirrored "apron" terrain drawn around the data extent (hides the world edge). */
const APRON = 6;
const RELIEF_RANGE_M = 24;
const TILES_PER_NEAR_CHUNK = 16;

export interface TerrainDataset {
  key: string;
  hf: Heightfield;
  heightTex: DataTexture;
  surfTex: DataTexture;
  coverTex: DataTexture;
  /** per chunk (incl. apron) [min, max] heights */
  bounds: Float32Array;
}

interface Chunk {
  c0: number;
  r0: number;
  apron: boolean;
}

interface TerrainLod {
  mesh: Mesh;
  geo: InstancedBufferGeometry;
  attr: InstancedBufferAttribute;
  data: Float32Array;
  count: number;
}

function lodGeometry(step: number, cells: number): InstancedBufferGeometry {
  const n = cells / step;
  const pos: number[] = [];
  const idx: number[] = [];
  const v = (i: number, j: number) => j * (n + 1) + i;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pos.push(i, 0, j);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = v(i, j);
      const b = v(i + 1, j);
      const c = v(i, j + 1);
      const d = v(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
  }
  // skirts: one extra vertex below each border vertex; both windings so they show from any side
  const border: [number, number][] = [];
  for (let i = 0; i < n; i++) border.push([i, 0]);
  for (let j = 0; j < n; j++) border.push([n, j]);
  for (let i = n; i > 0; i--) border.push([i, n]);
  for (let j = n; j > 0; j--) border.push([0, j]);
  const base = pos.length / 3;
  border.forEach(([i, j]) => pos.push(i, 1, j));
  for (let k = 0; k < border.length; k++) {
    const k2 = (k + 1) % border.length;
    const t0 = v(border[k]![0], border[k]![1]);
    const t1 = v(border[k2]![0], border[k2]![1]);
    const s0 = base + k;
    const s1 = base + k2;
    idx.push(t0, s0, t1, t1, s0, s1, t0, t1, s0, t1, s1, s0);
  }
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  return g;
}

export function makeDataTexture(data: Uint8Array, cols: number, rows: number, mirrored: boolean, srgb = false): DataTexture {
  const t = new DataTexture(data, cols, rows, RGBAFormat, UnsignedByteType);
  t.flipY = false;
  t.wrapS = t.wrapT = mirrored ? MirroredRepeatWrapping : ClampToEdgeWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function makeHeightTexture(hf: Heightfield): DataTexture {
  const t = new DataTexture(hf.data, hf.cols, hf.rows, RedFormat, FloatType);
  t.flipY = false;
  t.magFilter = t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/**
 * Instanced, chunked heightfield terrain with one batch per base LOD and two optional near-tile
 * batches. Heights are fetched in the vertex shader, and skirts hide LOD cracks.
 */
export class Terrain {
  readonly object = new Group();
  readonly material: ShaderMaterial;
  private readonly chunks: Chunk[] = [];
  private readonly lods: TerrainLod[] = [];
  private relief: { coarse: TerrainLod; fine: TerrainLod; texture: DataTexture; meta: TerrainReliefMeta } | null = null;
  private dataset: TerrainDataset | null = null;
  private readonly frustum = new Frustum();
  private readonly box = new Box3();
  private readonly m4 = new Matrix4();
  readonly stats = { chunks: 0, triangles: 0 };
  /** LOD distance factor (graphics preset): < 1 switches to coarser chunks sooner. */
  lodScale = 1;
  reliefEnabled = false;
  readonly nx: number;
  readonly nz: number;

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly cell: number,
    readonly x0: number,
    readonly z0: number,
  ) {
    this.object.name = 'terrain';
    this.nx = Math.ceil((cols - 1) / CHUNK);
    this.nz = Math.ceil((rows - 1) / CHUNK);
    for (let j = -APRON; j < this.nz + APRON; j++) {
      for (let i = -APRON; i < this.nx + APRON; i++) {
        this.chunks.push({ c0: i * CHUNK, r0: j * CHUNK, apron: i < 0 || j < 0 || i >= this.nx || j >= this.nz });
      }
    }
    this.material = new ShaderMaterial({
      vertexShader: TERRAIN_VERT,
      fragmentShader: TERRAIN_FRAG,
      uniforms: {
        ...atmosphere,
        uHeight: { value: null },
        uRelief: { value: null },
        uReliefGrid: { value: [0, 0, RELIEF_RANGE_M] },
        uSurf: { value: null },
        uSurfDetail: { value: null as DataTexture | null },
        uSurfDetailGrid: { value: [0, 0, 0, 0] },
        uCover: { value: null },
        uMap: { value: null as Texture | null },
        uGrid: { value: [x0, z0, cell, 3] },
        uGridSize: { value: [cols, rows] },
        uScanMode: { value: 0 },
        uScanMix: { value: 0 },
        uScanCenter: { value: new Vector3() },
        uScanRadius: { value: 1e6 },
        uMapMix: { value: 0 },
        uContours: { value: 1 },
        uForestFar: { value: 700 },
        uHistoric: { value: 0 },
        uTreeShade: { value: 0.55 },
        uPalette: { value: 0 },
        uRuin: { value: 0 },
        uBedDepth: { value: 1.6 },
        uGroundAlb: { value: null as Texture | null },
        uGroundNH: { value: null as Texture | null },
        uTile: { value: GROUND_TILE_M.slice() },
        uDetailFar: { value: 160 },
      },
    });
    for (const step of LOD_STEPS) {
      this.lods.push(this.createLod(`terrain-lod${step}`, step, CHUNK, this.chunks.length));
    }
  }

  private createLod(name: string, step: number, cells: number, capacity: number): TerrainLod {
    const geo = lodGeometry(step, cells);
    const data = new Float32Array(capacity * 3);
    const attr = new InstancedBufferAttribute(data, 3);
    attr.setUsage(DynamicDrawUsage);
    geo.setAttribute('aChunk', attr);
    geo.instanceCount = 0;
    const mesh = new Mesh(geo, this.material);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.name = name;
    mesh.visible = false;
    this.object.add(mesh);
    return { mesh, geo, attr, data, count: 0 };
  }

  /** Per-chunk min/max heights (mirrored apron included) for culling. */
  computeBounds(hf: Heightfield): Float32Array {
    const b = new Float32Array(this.chunks.length * 2);
    const mirror = (i: number, n: number) => {
      const p = 2 * (n - 1);
      i %= p;
      if (i < 0) i += p;
      return i < n ? i : p - i;
    };
    this.chunks.forEach((ch, k) => {
      let mn = Infinity;
      let mx = -Infinity;
      for (let r = ch.r0; r <= ch.r0 + CHUNK; r += 2) {
        for (let c = ch.c0; c <= ch.c0 + CHUNK; c += 2) {
          const v = hf.data[mirror(r, hf.rows) * hf.cols + mirror(c, hf.cols)]!;
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      }
      b[k * 2] = mn - 30; // skirt depth margin
      b[k * 2 + 1] = mx + 1;
    });
    return b;
  }

  setDataset(ds: TerrainDataset): void {
    this.dataset = ds;
    const u = this.material.uniforms;
    u.uHeight!.value = ds.heightTex;
    u.uSurf!.value = ds.surfTex;
    u.uCover!.value = ds.coverTex;
  }

  get uniforms() {
    return this.material.uniforms;
  }

  /** Present-day surface shading only. The active height and cover textures still come from the dataset. */
  setSurfaceDetail(data: Uint8Array, { x0, z0, cols, rows }: TerrainSurfaceMeta): void {
    this.uniforms.uSurfDetail!.value?.dispose();
    this.uniforms.uSurfDetail!.value = makeDataTexture(data, cols, rows, false);
    this.uniforms.uSurfDetailGrid!.value = [x0, z0, cols, rows];
  }

  /** The streamed 1 m samples contain bounded offsets from the existing terrain triangles. */
  setReliefDetail(data: Uint8Array, meta: TerrainReliefMeta): void {
    const { x0, z0, cols, rows } = meta;
    if (this.cell !== 2 || (x0 - this.x0) % RELIEF_TILE_M !== 0 || (z0 - this.z0) % RELIEF_TILE_M !== 0
      || (cols - 1) % RELIEF_TILE_M !== 0 || (rows - 1) % RELIEF_TILE_M !== 0) {
      throw new Error('terrain relief: expected 32 m tiles on the base lattice');
    }
    const cells = RELIEF_TILE_M / this.cell;
    const texture = new DataTexture(data, cols, rows, RedFormat, UnsignedByteType);
    texture.needsUpdate = true;
    if (this.relief) {
      this.relief.texture.dispose();
      this.relief.texture = texture;
      this.relief.meta = meta;
    } else {
      // A 48 m diameter intersects at most four 128 m chunks and nine 32 m tiles.
      this.relief = {
        coarse: this.createLod('terrain-2m-tiles', 1, cells, 4 * TILES_PER_NEAR_CHUNK),
        fine: this.createLod('terrain-dgm1', 0.5, cells, 9),
        texture,
        meta,
      };
      this.lods.push(this.relief.coarse, this.relief.fine);
    }
    this.uniforms.uRelief!.value = texture;
    this.uniforms.uReliefGrid!.value = [x0, z0, RELIEF_RANGE_M];
  }

  /**
   * CC0 ground set (vegetation/strips.ts): splat-blended texture arrays instead of the procedural
   * colours. Off (null) on the low tier; switching recompiles the terrain shader once.
   */
  setGroundSet(set: { albedo: Texture; nh: Texture } | null): void {
    const u = this.material.uniforms;
    u.uGroundAlb!.value = set?.albedo ?? null;
    u.uGroundNH!.value = set?.nh ?? null;
    const on = set !== null;
    if (on === 'KQ_SPLAT' in this.material.defines) return;
    if (on) this.material.defines.KQ_SPLAT = '';
    else delete this.material.defines.KQ_SPLAT;
    this.material.needsUpdate = true;
  }

  get splat(): boolean {
    return 'KQ_SPLAT' in this.material.defines;
  }

  /** Choose LODs and cull chunks for this camera. Call once per frame before rendering. */
  update(camera: PerspectiveCamera): void {
    const ds = this.dataset;
    if (!ds) return;
    camera.updateMatrixWorld();
    this.m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m4);
    for (const batch of this.lods) batch.count = 0;
    const u = this.uniforms;
    const detail = this.reliefEnabled && ds.key === '2025' && u.uScanMix!.value <= 0.001 && u.uMapMix!.value <= 0.001 ? this.relief : null;
    const cam = camera.position;
    const ls = this.lodScale;
    const size = CHUNK * this.cell;
    let tris = 0;
    for (let k = 0; k < this.chunks.length; k++) {
      const ch = this.chunks[k]!;
      const x0 = this.x0 + ch.c0 * this.cell;
      const z0 = this.z0 + ch.r0 * this.cell;
      const refine = detail && !ch.apron && nearCrop(x0, z0, size, detail.meta, cam);
      this.box.min.set(x0, ds.bounds[k * 2]!, z0);
      this.box.max.set(x0 + size, ds.bounds[k * 2 + 1]! + (refine ? 0.32 : 0), z0 + size);
      if (!this.frustum.intersectsBox(this.box)) continue;
      const d = this.box.distanceToPoint(cam);
      if (d > camera.far) continue;
      let lod = 0;
      while (d > LOD_DIST[lod]! * ls) lod++;
      if (ch.apron) lod = Math.max(lod, 2);
      if (refine && lod === 0) {
        const tileCells = RELIEF_TILE_M / this.cell;
        for (let r = 0; r < CHUNK; r += tileCells) {
          for (let c = 0; c < CHUNK; c += tileCells) {
            const fine = nearCrop(x0 + c * this.cell, z0 + r * this.cell, RELIEF_TILE_M, detail.meta, cam);
            addTile(fine ? detail.fine : detail.coarse, ch.c0 + c, ch.r0 + r, fine ? 0.5 : 1);
            const quads = fine ? tileCells * 2 : tileCells;
            tris += quads * quads * 2;
          }
        }
        continue;
      }
      addTile(this.lods[lod]!, ch.c0, ch.r0, LOD_STEPS[lod]!);
      const q = CHUNK / LOD_STEPS[lod]!;
      tris += q * q * 2;
    }
    let total = 0;
    for (const batch of this.lods) {
      batch.geo.instanceCount = batch.count;
      batch.mesh.visible = batch.count > 0;
      if (batch.mesh.visible) {
        batch.attr.clearUpdateRanges();
        batch.attr.addUpdateRange(0, batch.count * 3);
        batch.attr.needsUpdate = true;
      }
      total += batch.count;
    }
    this.stats.chunks = total;
    this.stats.triangles = tris;
  }

  dispose(): void {
    for (const L of this.lods) L.geo.dispose();
    this.relief?.texture.dispose();
    this.material.dispose();
  }
}

function addTile(batch: TerrainLod, c: number, r: number, step: number): void {
  const i = batch.count++ * 3;
  batch.data[i] = c;
  batch.data[i + 1] = r;
  batch.data[i + 2] = step;
}

function nearCrop(x: number, z: number, size: number, crop: TerrainReliefMeta, camera: Vector3): boolean {
  const left = Math.max(x, crop.x0);
  const right = Math.min(x + size, crop.x0 + crop.cols - 1);
  const north = Math.max(z, crop.z0);
  const south = Math.min(z + size, crop.z0 + crop.rows - 1);
  if (left >= right || north >= south) return false;
  const dx = Math.max(left - camera.x, 0, camera.x - right);
  const dz = Math.max(north - camera.z, 0, camera.z - south);
  return dx * dx + dz * dz < RELIEF_RANGE_M * RELIEF_RANGE_M;
}
