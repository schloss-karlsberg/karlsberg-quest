import {
  type BufferGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import type { AssetLoader } from '../../assets/loader';
import type { Era } from '../../core/era';
import type { GraphicsLevel } from '../../core/save';
import { SEE_FRAG_GLSL, SEE_GLSL, atmosphere } from '../atmosphere';
import type { GroundCoverSource } from './groundcover';
import { COVER_LOOKS, type CoverLook, type CoverSample, hash2, valueNoise } from './scatter';

/**
 * Scattered CC0 props of the forest floor (docs/ART-DIRECTION.md §5, §5.2): stylised ferns,
 * bushes, flower clumps and rocks in noise-driven clusters, fallen logs and stumps. Each model piece is one
 * InstancedMesh (the glTF's PBR material, patched to the world light by the asset loader, plus
 * wind for ferns and snow on top in February 1793). Placement is a deterministic scatter per 16 m
 * tile from the land cover; the instance lists follow the camera. Off on the low tier (nothing is
 * fetched there).
 */

interface PropKind {
  id: string;
  /** Asset id(s) in the nature manifest. */
  asset: string;
  /**
   * 'whole': the model is one prop; 'split': every mesh is its own variant (rock sets); 'nodes':
   * every top-level node is one variant (the nature2 sets of `pnpm assets:set`, `_lod1` skipped).
   */
  mode: 'whole' | 'split' | 'nodes';
  /** Visible radius (m) on high; medium uses 70 %. */
  radius: number;
  /** Scale range (× the model), or with `size` the height range in metres. */
  scale: [number, number];
  /** Scale picks a height in metres instead of a factor (stylised kits come in arbitrary units). */
  size?: boolean;
  /** Sink into the ground (fraction of the piece height). */
  sink: number;
  wind: boolean;
  shadow: boolean;
  /** Instances per variant mesh. */
  max: number;
  /** Chance per 2 m cell (pure density rule); `clump` is a second, finer noise for clusters. */
  chance: (c: CoverSample, slope: number, patch: number, look: CoverLook, clump: number) => number;
}

// nature round 2 (2026-11-19): stylised low-poly CC0 kit (Quaternius) for ferns, bushes, flowers
// and rocks, in noise-driven clumps (patch × clump) instead of an even sprinkle; the scanned Poly
// Haven logs and stumps stay (they read as stylised enough under the canopy at 60–70 m)
export const PROP_KINDS: PropKind[] = [
  {
    id: 'fern',
    asset: 'nature2.ferns',
    mode: 'nodes',
    radius: 42,
    scale: [0.55, 1.15],
    size: true,
    sink: 0.04,
    wind: true,
    shadow: false,
    max: 1400,
    chance: (c, slope, patch, look, clump) => (c.forest > 0.4 && c.bare < 0.15 && c.water < 0.02 && slope < 38 ? 0.75 * look.ferns * smoothstep(0.35, 0.7, patch) * smoothstep(0.3, 0.65, clump) * c.forest : 0),
  },
  {
    id: 'bush',
    asset: 'nature2.bushes',
    mode: 'nodes',
    radius: 70,
    scale: [0.8, 1.7],
    size: true,
    sink: 0.08,
    wind: true,
    shadow: true,
    max: 500,
    chance: (c, slope, patch, look, clump) =>
      c.bare < 0.12 && c.water < 0.02 && c.lawn < 0.3 && slope < 32 ? (0.05 * c.forest + 0.03 * (1 - c.forest) * (1 - c.lawn)) * look.ferns * smoothstep(0.5, 0.8, clump) * (0.4 + patch) : 0,
  },
  {
    id: 'flowers',
    asset: 'nature2.flowers',
    mode: 'nodes',
    radius: 36,
    scale: [0.22, 0.42],
    size: true,
    sink: 0.02,
    wind: true,
    shadow: false,
    max: 900,
    chance: (c, slope, patch, look, clump) => (c.bare < 0.1 && c.water < 0.02 && slope < 25 ? look.flowers * 4 * (1 - c.forest * 0.85) * (1 - c.lawn * 0.7) * smoothstep(0.55, 0.8, clump) * smoothstep(0.2, 0.6, patch) : 0),
  },
  {
    id: 'rock',
    asset: 'nature2.rocks',
    mode: 'nodes',
    radius: 95,
    scale: [0.35, 1.5],
    size: true,
    sink: 0.22,
    wind: false,
    shadow: true,
    max: 500,
    chance: (c, slope, _p, _l, clump) => (c.bare < 0.15 && c.water < 0.02 && c.lawn < 0.1 ? (0.012 * c.forest + 0.035 * smoothstep(16, 35, slope)) * (0.3 + 1.4 * smoothstep(0.55, 0.85, 1 - clump)) : 0),
  },
  {
    id: 'log',
    asset: 'nature.log.01',
    mode: 'whole',
    radius: 70,
    scale: [0.8, 1.25],
    sink: 0.2,
    wind: false,
    shadow: true,
    max: 260,
    chance: (c, slope) => (c.forest > 0.6 && c.bare < 0.1 && c.water < 0.01 && slope < 22 ? 0.009 : 0),
  },
  {
    id: 'stump',
    asset: 'nature.stump.02',
    mode: 'whole',
    radius: 60,
    scale: [0.7, 1.1],
    sink: 0.12,
    wind: false,
    shadow: true,
    max: 260,
    chance: (c, slope) => (c.forest > 0.5 && c.bare < 0.1 && c.water < 0.01 && slope < 28 ? 0.006 : 0),
  },
  {
    id: 'stump1',
    asset: 'nature.stump.01',
    mode: 'whole',
    radius: 60,
    scale: [0.8, 1.2],
    sink: 0.1,
    wind: false,
    shadow: true,
    max: 260,
    chance: (c, slope) => (c.forest > 0.5 && c.bare < 0.1 && c.water < 0.01 && slope < 28 ? 0.005 : 0),
  },
];

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const TILE = 16;
const CELL = 2;

interface Piece {
  kind: number;
  meshes: InstancedMesh[];
  /** Height of the piece (m, unscaled). */
  height: number;
}

/** Wind + snow patch on top of the loader's world-light patch (kqStandard). */
function patchNature(m: Material, wind: boolean): void {
  const mat = m as MeshStandardMaterial;
  if (!(mat instanceof MeshStandardMaterial) || mat.userData.kqNature) return;
  mat.userData.kqNature = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    // see-through (round 10, F-21): a fern / bush / rock between the lens and the character, the
    // fight's target or the speaker thins away per vertex (SEE_GLSL; kqStandard put vKqWorld and
    // the atmosphere uniforms in place)
    Object.assign(shader.uniforms, { uSeeCam: atmosphere.uSeeCam, uSeeP: atmosphere.uSeeP, uSeeT: atmosphere.uSeeT, uSeeK: atmosphere.uSeeK, uShadowPass: atmosphere.uShadowPass });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uShadowPass;\n${SEE_GLSL}\nvarying float vKqSee;`)
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvKqSee = kqSee(vKqWorld, 0.25, vKqWorld.y, vKqWorld);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vKqSee;\n${SEE_FRAG_GLSL}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (kqSeeCut(vKqSee, vKqWorld)) discard;');
    if (wind)
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
{
  vec2 kqIp = instanceMatrix[3].xz;
  float kqW = sin(uTime * 1.7 + kqIp.x * 0.4 + kqIp.y * 0.3) * 0.6 + sin(uTime * 3.1 + kqIp.x) * 0.25;
  transformed.xz += vec2(0.8, 0.5) * kqW * 0.06 * transformed.y * transformed.y;
}
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
{
  vec3 kqWn = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.82, 0.9), uSnow * smoothstep(0.35, 0.8, kqWn.y));
}`,
    );
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${key()}|kq-nature-${wind ? 1 : 0}`;
  mat.needsUpdate = true;
}

export class NatureProps {
  readonly object = new Group();
  private assets: AssetLoader | null = null;
  private level: GraphicsLevel = 'low';
  private look: CoverLook = COVER_LOOKS.today!;
  private readonly pieces: Piece[][] = PROP_KINDS.map(() => []);
  private readonly loading = new Set<number>();
  private readonly tiles = new Map<string, Float32Array[]>();
  private lastX = Infinity;
  private lastZ = Infinity;
  private dirty = true;
  private readonly cov = new Float32Array(4);
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  readonly stats: Record<string, number> = {};

  constructor(readonly src: GroundCoverSource) {
    this.object.name = 'nature-props';
  }

  attach(assets: AssetLoader): void {
    this.assets = assets;
    this.sync();
  }

  setLevel(level: GraphicsLevel): void {
    this.level = level;
    this.object.visible = level !== 'low';
    this.dirty = true;
    this.sync();
  }

  setEra(era: Era): void {
    this.look = COVER_LOOKS[era] ?? COVER_LOOKS.today!;
    this.tiles.clear();
    this.dirty = true;
  }

  /** Circles kept free of props (a built place: the Karlsbergquelle's hollow …). */
  private readonly clearings: { x: number; z: number; r: number }[] = [];

  /** Keep a circle free of scattered props (rebuilds the tiles it touches). */
  addClearing(x: number, z: number, r: number): void {
    this.clearings.push({ x, z, r });
    this.tiles.clear();
    this.dirty = true;
  }

  private sync(): void {
    if (this.level === 'low' || !this.assets) return;
    PROP_KINDS.forEach((k, i) => {
      if (this.pieces[i]!.length || this.loading.has(i)) return;
      this.loading.add(i);
      Promise.resolve()
        .then(() => this.assets!.model(k.asset))
        .then((m) => {
          this.pieces[i] = this.buildPieces(i, m.scene);
          this.dirty = true;
        })
        .catch((err: unknown) => console.warn(`[nature] prop ${k.asset} failed`, err));
    });
  }

  /** One InstancedMesh per mesh of the model (per variant for split sets), pivot at the ground. */
  private buildPieces(kind: number, root: Object3D): Piece[] {
    const k = PROP_KINDS[kind]!;
    root.updateMatrixWorld(true);
    const meshes: Mesh[] = [];
    root.traverse((o) => {
      if (o instanceof Mesh) meshes.push(o);
    });
    let groups: Mesh[][];
    if (k.mode === 'split') groups = meshes.map((m) => [m]);
    else if (k.mode === 'whole') groups = [meshes];
    else {
      const top = root.children.length === 1 && !(root.children[0] instanceof Mesh) && root.children[0]!.children.length > 1 ? root.children[0]!.children : root.children;
      groups = top
        .filter((n) => !n.name.endsWith('_lod1'))
        .map((n) => {
          const ms: Mesh[] = [];
          n.traverse((o) => {
            if (o instanceof Mesh) ms.push(o);
          });
          return ms;
        })
        .filter((g) => g.length);
    }
    const out: Piece[] = [];
    for (const g of groups) {
      // bounds of the group in model space
      let minY = Infinity;
      let maxY = -Infinity;
      let cx = 0;
      let cz = 0;
      let n = 0;
      const geos: { geo: BufferGeometry; mat: Material | Material[] }[] = [];
      for (const m of g) {
        const geo = m.geometry.clone();
        // meshopt-quantized positions are normalized integers: unpack before moving them, or
        // every vertex beyond ±1 (in node space) is clamped flat
        const pa = geo.getAttribute('position');
        if (!(pa.array instanceof Float32Array)) {
          const f = new Float32Array(pa.count * 3);
          for (let i = 0; i < pa.count; i++) f.set([pa.getX(i), pa.getY(i), pa.getZ(i)], i * 3);
          geo.setAttribute('position', new Float32BufferAttribute(f, 3));
        }
        geo.applyMatrix4(m.matrixWorld);
        geo.computeBoundingBox();
        const b = geo.boundingBox!;
        minY = Math.min(minY, b.min.y);
        maxY = Math.max(maxY, b.max.y);
        cx += (b.min.x + b.max.x) / 2;
        cz += (b.min.z + b.max.z) / 2;
        n++;
        geos.push({ geo, mat: m.material });
      }
      cx /= n;
      cz /= n;
      const ims: InstancedMesh[] = [];
      for (const { geo, mat } of geos) {
        geo.translate(-cx, -minY, -cz);
        const mats = Array.isArray(mat) ? mat : [mat];
        for (const mm of mats) patchNature(mm, k.wind);
        const im = new InstancedMesh(geo, mat, k.max);
        im.count = 0;
        im.frustumCulled = false;
        im.name = `nature-${k.id}`;
        if (!k.shadow) im.userData.noShadow = true;
        this.object.add(im);
        ims.push(im);
      }
      out.push({ kind, meshes: ims, height: maxY - minY });
    }
    return out;
  }

  /** Per-tile instance lists for every kind: [x, y, z, yaw, scale, variant]. */
  private tile(tx: number, tz: number): Float32Array[] {
    const key = `${tx}_${tz}`;
    let t = this.tiles.get(key);
    if (t) return t;
    const lists: number[][] = PROP_KINDS.map(() => []);
    const n = TILE / CELL;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const gx = tx * n + i;
        const gz = tz * n + j;
        // full-cell jitter: no rows along the grid
        const x = (gx + hash2(gx, gz, 201)) * CELL;
        const z = (gz + hash2(gz, gx, 203)) * CELL;
        if (!this.src.inside(x, z)) continue;
        if (this.clearings.length && this.clearings.some((q) => Math.hypot(x - q.x, z - q.z) < q.r)) continue;
        this.src.cover(x, z, this.cov);
        const c: CoverSample = { forest: this.cov[0]!, water: this.cov[1]!, bare: this.cov[2]!, lawn: this.cov[3]! };
        if (c.forest < 0.2 && c.water < 0.01 && c.bare < 0.1 && hash2(gx, gz, 205) > 0.3) continue;
        const h = this.src.height(x, z);
        const e = 1;
        const sx = (this.src.height(x + e, z) - this.src.height(x - e, z)) / (2 * e);
        const sz = (this.src.height(x, z + e) - this.src.height(x, z - e)) / (2 * e);
        const slope = (Math.atan(Math.hypot(sx, sz)) * 180) / Math.PI;
        const patch = valueNoise(x * 0.06, z * 0.06, 9);
        // clumps: a finer noise, warped so the clusters are not round
        const clump = valueNoise(x * 0.17 + 2.3 * patch, z * 0.17 - 1.7 * patch, 13);
        const r = hash2(gx, gz, 207);
        let acc = 0;
        for (let k = 0; k < PROP_KINDS.length; k++) {
          const p = PROP_KINDS[k]!.chance(c, slope, patch, this.look, clump);
          if (p <= 0) continue;
          if (r >= acc && r < acc + p) {
            const K = PROP_KINDS[k]!;
            const sc = K.scale[0] + (K.scale[1] - K.scale[0]) * hash2(gx, gz, 211);
            lists[k]!.push(x, h, z, hash2(gx, gz, 213) * Math.PI * 2, sc, hash2(gx, gz, 217));
            break;
          }
          acc += p;
        }
      }
    t = lists.map((l) => new Float32Array(l));
    this.tiles.set(key, t);
    if (this.tiles.size > 700) this.tiles.delete(this.tiles.keys().next().value as string);
    return t;
  }

  update(camera: PerspectiveCamera): void {
    if (this.level === 'low') return;
    const p = camera.position;
    if (!this.dirty && Math.hypot(p.x - this.lastX, p.z - this.lastZ) < 6) return;
    this.dirty = false;
    this.lastX = p.x;
    this.lastZ = p.z;
    const rk = this.level === 'high' ? 1 : 0.7;
    const maxR = Math.max(...PROP_KINDS.map((k) => k.radius)) * rk;
    const counts = this.pieces.map((ps) => ps.map(() => 0));
    const t0x = Math.floor((p.x - maxR) / TILE);
    const t1x = Math.floor((p.x + maxR) / TILE);
    const t0z = Math.floor((p.z - maxR) / TILE);
    const t1z = Math.floor((p.z + maxR) / TILE);
    for (let tz = t0z; tz <= t1z; tz++)
      for (let tx = t0x; tx <= t1x; tx++) {
        const dcx = (tx + 0.5) * TILE - p.x;
        const dcz = (tz + 0.5) * TILE - p.z;
        if (Math.hypot(dcx, dcz) > maxR + TILE) continue;
        const lists = this.tile(tx, tz);
        for (let k = 0; k < PROP_KINDS.length; k++) {
          const ps = this.pieces[k]!;
          if (!ps.length) continue;
          const K = PROP_KINDS[k]!;
          const rad = K.radius * rk;
          const L = lists[k]!;
          for (let o = 0; o < L.length; o += 6) {
            const dx = L[o]! - p.x;
            const dz = L[o + 2]! - p.z;
            if (dx * dx + dz * dz > rad * rad) continue;
            const vi = Math.min(ps.length - 1, Math.floor(L[o + 5]! * ps.length));
            const piece = ps[vi]!;
            const n = counts[k]![vi]!;
            if (n >= piece.meshes[0]!.instanceMatrix.count) continue;
            const sc = K.size ? L[o + 4]! / Math.max(0.01, piece.height) : L[o + 4]!;
            this.e.set((hash2(o, k, 3) - 0.5) * 0.12, L[o + 3]!, (hash2(o, k, 5) - 0.5) * 0.12);
            this.q.setFromEuler(this.e);
            this.v.set(L[o]!, L[o + 1]! - piece.height * sc * K.sink, L[o + 2]!);
            this.s.setScalar(sc);
            this.m4.compose(this.v, this.q, this.s);
            for (const im of piece.meshes) im.setMatrixAt(n, this.m4);
            counts[k]![vi] = n + 1;
          }
        }
      }
    this.pieces.forEach((ps, k) => {
      let total = 0;
      ps.forEach((piece, vi) => {
        const n = counts[k]![vi]!;
        total += n;
        for (const im of piece.meshes) {
          im.count = n;
          im.instanceMatrix.needsUpdate = true;
          im.visible = n > 0;
        }
      });
      this.stats[PROP_KINDS[k]!.id] = total;
    });
  }
}
