import {
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  type PerspectiveCamera,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GROUND } from '../data/types';
import { ATMOS_GLSL, atmosphere } from './atmosphere';
import type { Heightfield } from './heightfield';

/** One generated tree: x, y, z, height, rotation, kind (0 broadleaf, 1 conifer), variation. */
const F = 7;
const TILE = 64;
const NEAR_DIST = 170;
const MAX_NEAR = 8000;
const MAX_FAR = 45000;

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
      const conifer = smoothNoise(x / 180, z / 180, src.seed + 21) > 0.68 ? 1 : 0;
      const y = hf.heightAt(x, z);
      const key = `${Math.floor(x / TILE)}_${Math.floor(z / TILE)}`;
      let arr = perTile.get(key);
      if (!arr) perTile.set(key, (arr = []));
      arr.push(x, y, z, height, hash2(gx, gz, src.seed + 9) * Math.PI * 2, conifer, hash2(gx, gz, src.seed + 13));
      count++;
    }
  }
  const tiles = new Map<string, Float32Array>();
  for (const [k, v] of perTile) tiles.set(k, new Float32Array(v));
  return { tiles, count };
}

function part(g: BufferGeometry, partId: number): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.deleteAttribute('uv');
  const n = ng.getAttribute('position').count;
  ng.setAttribute('aPart', new BufferAttribute(new Float32Array(n).fill(partId), 1));
  return ng;
}

function broadleaf(detail: 0 | 1): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const trunk = new CylinderGeometry(0.006, 0.012, 0.55, detail ? 6 : 3, 1, true);
  trunk.translate(0, 0.25, 0);
  parts.push(part(trunk, 0));
  const crown = new IcosahedronGeometry(0.21, detail);
  crown.scale(1, 1.15, 1);
  crown.translate(0, 0.64, 0);
  parts.push(part(crown, 1));
  if (detail) {
    const c2 = new IcosahedronGeometry(0.15, 1);
    c2.translate(0.11, 0.52, 0.08);
    parts.push(part(c2, 1));
    const c3 = new IcosahedronGeometry(0.13, 1);
    c3.translate(-0.1, 0.57, -0.09);
    parts.push(part(c3, 1));
  }
  return mergeGeometries(parts)!;
}

function conifer(detail: 0 | 1): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const seg = detail ? 8 : 5;
  const trunk = new CylinderGeometry(0.005, 0.011, 0.3, detail ? 5 : 3, 1, true);
  trunk.translate(0, 0.15, 0);
  parts.push(part(trunk, 0));
  const tiers = detail
    ? [
        [0.14, 0.13, 0.42],
        [0.36, 0.1, 0.38],
        [0.58, 0.07, 0.42],
      ]
    : [[0.14, 0.12, 0.86]];
  for (const [y, r, h] of tiers) {
    const c = new ConeGeometry(r!, h!, seg, 1, false);
    c.translate(0, y! + h! / 2, 0);
    parts.push(part(c, 1));
  }
  return mergeGeometries(parts)!;
}

const TREE_VERT = /* glsl */ `
${ATMOS_GLSL}
attribute float aPart;
attribute vec4 aInst;   // x, y, z, height
attribute vec3 aVar;    // rotation, variation, kind
uniform float uFar;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vPart;
varying float vVar;
varying float vH;
void main() {
  float h = aInst.w;
  vec3 camd = aInst.xyz - uCamPos;
  float dist = length(camd.xz);
  float fade = 1.0 - smoothstep(uFar * 0.82, uFar, dist);
  float c = cos(aVar.x), s = sin(aVar.x);
  vec3 p = position;
  float wide = 0.85 + 0.35 * aVar.y;
  p.xz *= wide;
  p = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
  vec3 nn = vec3(c * normal.x - s * normal.z, normal.y, s * normal.x + c * normal.z);
  // winter: broadleaf crowns thin out
  float bare = clamp(uSeason - 1.0, 0.0, 1.0) * (1.0 - aVar.z) * aPart;
  p.xz *= 1.0 - 0.25 * bare;
  vec3 wp = aInst.xyz + p * h * fade;
  // a little wind in the crowns
  float sway = sin(uTime * 0.9 + aInst.x * 0.05 + aInst.z * 0.03) * 0.012 * h * position.y * position.y * aPart;
  wp.x += sway;
  wp.z += sway * 0.6;
  vWorld = wp;
  // crowns: bias normals upward (soft, cloud-like shading); never sum opposite vectors (NaN)
  vNormal = aPart > 0.5 ? normalize(nn * 0.75 + vec3(0.0, 0.3, 0.0)) : nn;
  vPart = aPart;
  vVar = aVar.y + aVar.z * 2.0;
  vH = position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const TREE_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
varying vec3 vWorld;
varying vec3 vNormal;
varying float vPart;
varying float vVar;
varying float vH;
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
void main() {
  float kind = step(1.5, vVar);
  float v = fract(vVar);
  vec3 trunk = mix(srgb(vec3(0.36, 0.35, 0.32)), srgb(vec3(0.26, 0.2, 0.16)), kind) * (0.8 + 0.3 * v);
  vec3 summerB = mix(srgb(vec3(0.17, 0.25, 0.1)), srgb(vec3(0.23, 0.3, 0.12)), v);
  // November: copper beech, brown oak, a few late yellow and still-green crowns
  vec3 autumnB = v < 0.35 ? mix(srgb(vec3(0.42, 0.2, 0.08)), srgb(vec3(0.5, 0.27, 0.1)), v / 0.35)
               : v < 0.65 ? mix(srgb(vec3(0.36, 0.26, 0.13)), srgb(vec3(0.3, 0.24, 0.12)), (v - 0.35) / 0.3)
               : v < 0.85 ? srgb(vec3(0.52, 0.4, 0.14)) : srgb(vec3(0.24, 0.27, 0.12));
  vec3 winterB = srgb(vec3(0.3, 0.27, 0.25));
  vec3 needle = mix(srgb(vec3(0.07, 0.13, 0.08)), srgb(vec3(0.1, 0.16, 0.09)), v);
  vec3 broad = uSeason < 1.0 ? mix(summerB, autumnB, uSeason) : mix(autumnB, winterB, uSeason - 1.0);
  vec3 crown = mix(broad, needle, kind);
  float lum = dot(crown, vec3(0.3, 0.55, 0.15));
  crown = mix(vec3(lum), crown, 0.68) * 0.85;
  crown = mix(crown, srgb(vec3(0.85, 0.88, 0.94)), uSnow * 0.55 * smoothstep(0.0, 0.6, vNormal.y));
  vec3 alb = mix(trunk, crown, vPart);
  float ao = mix(0.3, 1.0, smoothstep(0.35, 0.95, vH)) * mix(0.55, 1.0, smoothstep(-0.6, 0.5, normalize(vNormal + vec3(0.0, 1e-4, 0.0)).y));
  // leaf noise breaks up flat facets
  float n = kqNoise(vWorld.xz * 0.9 + vWorld.y * 0.7);
  alb *= 0.65 + 0.5 * n;
  vec3 nrm = normalize(vNormal + vec3(0.0, 1e-4, 0.0));
  vec3 col = kqLight(alb, nrm, vWorld, ao, 1.0);
  // leaves scatter sky light: undersides are dim, not black
  col += alb * uSkyAmbient * 0.2 * vPart * (1.0 - max(nrm.y, 0.0));
  // light shining through leaves from behind
  vec3 vd = normalize(vWorld - uCamPos);
  col += alb * uSunColor * pow(max(dot(vd, uSunDir), 0.0), 4.0) * 0.35 * vPart;
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

/** Instanced forest with two detail levels per species; instance lists rebuilt as the camera moves. */
export class Forest {
  readonly object = new Group();
  readonly material: ShaderMaterial;
  private tiles = new Map<string, Float32Array>();
  private readonly batches: Batch[] = [];
  private lastX = Infinity;
  private lastZ = Infinity;
  private dirty = true;
  farDist = 700;
  readonly stats = { near: 0, far: 0, total: 0 };

  constructor() {
    this.object.name = 'forest';
    this.material = new ShaderMaterial({
      vertexShader: TREE_VERT,
      fragmentShader: TREE_FRAG,
      uniforms: { ...atmosphere, uFar: { value: this.farDist } },
    });
    const make = (g: BufferGeometry, max: number, name: string): Batch => {
      const geo = new InstancedBufferGeometry();
      geo.setAttribute('position', g.getAttribute('position'));
      geo.setAttribute('normal', g.getAttribute('normal'));
      geo.setAttribute('aPart', g.getAttribute('aPart'));
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
    this.batches.push(make(broadleaf(1), MAX_NEAR, 'trees-broad-near'));
    this.batches.push(make(conifer(1), MAX_NEAR, 'trees-conifer-near'));
    this.batches.push(make(broadleaf(0), MAX_FAR, 'trees-broad-far'));
    this.batches.push(make(conifer(0), MAX_FAR, 'trees-conifer-far'));
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
    if (!this.dirty && Math.hypot(p.x - this.lastX, p.z - this.lastZ) < 12) return;
    this.dirty = false;
    this.lastX = p.x;
    this.lastZ = p.z;
    const counts = [0, 0, 0, 0];
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
          const kind = arr[k + 5]!;
          const bi = (d < NEAR_DIST ? 0 : 2) + kind;
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
    this.batches.forEach((b, i) => {
      b.geo.instanceCount = counts[i]!;
      for (const a of [b.inst, b.vary]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, counts[i]! * a.itemSize);
        a.needsUpdate = true;
      }
      b.mesh.visible = counts[i]! > 0;
    });
    this.stats.near = counts[0]! + counts[1]!;
    this.stats.far = counts[2]! + counts[3]!;
  }

  /** Force an instance rebuild on the next update (after teleports). */
  invalidate(): void {
    this.dirty = true;
  }
}
