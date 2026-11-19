import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  type PerspectiveCamera,
  ShaderMaterial,
} from 'three';
import type { Era } from '../../core/era';
import type { GraphicsLevel } from '../../core/save';
import { ATMOS_GLSL, atmosphere } from '../atmosphere';
import { COVER_LOOKS, type CoverLook, type CoverSample, flowerChance, grassChance, hash2, reedChance, valueNoise } from './scatter';

/** What the nature layers read from the world (current era's terrain and land cover). */
export interface GroundCoverSource {
  /** Terrain height (m) at x/z (current era, no interiors). */
  height(x: number, z: number): number;
  /** Land cover at x/z into out: [forest, water, bare, lawn] 0..1. */
  cover(x: number, z: number, out: Float32Array): void;
  /** Inside the data extent (with margin). */
  inside(x: number, z: number): boolean;
}

/** Vertex parts: 0 grass blade, 1 flower stem, 2 flower head, 3 reed blade, 4 cattail. */
const TILE = 8;
/** Instance record: x, y, z, scale, rotation, variant (0..1). */
const R = 6;

interface Layer {
  mesh: Mesh;
  geo: InstancedBufferGeometry;
  inst: InstancedBufferAttribute;
  vary: InstancedBufferAttribute;
  max: number;
}

interface TileData {
  grass: Float32Array;
  flowers: Float32Array;
  reeds: Float32Array;
}

const TIERS: Record<GraphicsLevel, { cell: number; radius: number; maxGrass: number } | null> = {
  low: null,
  medium: { cell: 0.62, radius: 21, maxGrass: 9000 },
  high: { cell: 0.45, radius: 30, maxGrass: 20000 },
};

/** Unit grass tuft: `blades` curved, tapering blades around the origin, height 1. */
function tuftGeometry(blades: number, part: number, seed: number, width: number, lean: number, segs = 4, spread = 0.14): BufferGeometry {
  const pos: number[] = [];
  const t: number[] = [];
  const parts: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rnd() * 0.8;
    const r0 = spread * (0.2 + rnd() * 0.8);
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const h = 0.6 + rnd() * 0.4;
    const ln = lean * (0.6 + rnd() * 0.8);
    const w = width * (0.7 + rnd() * 0.6);
    // blade plane faces roughly sideways to its lean direction
    const px = -dz;
    const pz = dx;
    const base = pos.length / 3;
    for (let k = 0; k <= segs; k++) {
      const f = k / segs;
      const cx = dx * (r0 + ln * f * f);
      const cz = dz * (r0 + ln * f * f);
      const y = h * f * (1 - 0.15 * ln * f);
      const ww = w * (1 - f * 0.92);
      pos.push(cx - px * ww, y, cz - pz * ww, cx + px * ww, y, cz + pz * ww);
      // soft normal: up, tilted out along the lean (lit like a clump, not like a flat card)
      const nx = dx * 0.45;
      const nz = dz * 0.45;
      nrm.push(nx, 1, nz, nx, 1, nz);
      t.push(f, f);
      parts.push(part, part);
    }
    for (let k = 0; k < segs; k++) {
      const i = base + k * 2;
      idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute('aT', new BufferAttribute(new Float32Array(t), 1));
  g.setAttribute('aPart', new BufferAttribute(new Float32Array(parts), 1));
  g.setIndex(idx);
  return g;
}

/** Merge geometries with the same attribute set (position, normal, aT, aPart). */
function merge(list: BufferGeometry[]): BufferGeometry {
  const names = ['position', 'normal', 'aT', 'aPart'];
  const out: Record<string, number[]> = { position: [], normal: [], aT: [], aPart: [] };
  const idx: number[] = [];
  let base = 0;
  for (const g of list) {
    for (const n of names) out[n]!.push(...(g.getAttribute(n).array as Float32Array));
    for (const i of g.index!.array) idx.push(i + base);
    base += g.getAttribute('position').count;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(out.position!), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(out.normal!), 3));
  g.setAttribute('aT', new BufferAttribute(new Float32Array(out.aT!), 1));
  g.setAttribute('aPart', new BufferAttribute(new Float32Array(out.aPart!), 1));
  g.setIndex(idx);
  return g;
}

/** A flower: a thin stem and a head of two crossed petal cards (drawn in the shader). */
function flowerGeometry(): BufferGeometry {
  const stem = tuftGeometry(2, 1, 7, 0.012, 0.08, 3);
  const pos: number[] = [];
  const nrm: number[] = [];
  const t: number[] = [];
  const parts: number[] = [];
  const idx: number[] = [];
  const s = 0.09;
  for (let k = 0; k < 2; k++) {
    const a = k * Math.PI * 0.5 + 0.3;
    const ux = Math.cos(a) * s;
    const uz = Math.sin(a) * s;
    const b = pos.length / 3;
    // head card tilted up (faces the sky and the viewer)
    pos.push(-ux, 0.95 - s * 0.5, -uz, ux, 0.95 - s * 0.5, uz, ux, 0.95 + s * 0.5, uz, -ux, 0.95 + s * 0.5, -uz);
    for (let i = 0; i < 4; i++) nrm.push(0, 1, 0);
    t.push(0, 1, 2, 3); // corner id → petal uv
    parts.push(2, 2, 2, 2);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // a flat head on top as well (daisy seen from above)
  const b = pos.length / 3;
  pos.push(-s, 0.97, -s, s, 0.97, -s, s, 0.97, s, -s, 0.97, s);
  for (let i = 0; i < 4; i++) nrm.push(0, 1, 0);
  t.push(0, 1, 2, 3);
  parts.push(2, 2, 2, 2);
  idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  const head = new BufferGeometry();
  head.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  head.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  head.setAttribute('aT', new BufferAttribute(new Float32Array(t), 1));
  head.setAttribute('aPart', new BufferAttribute(new Float32Array(parts), 1));
  head.setIndex(idx);
  return merge([stem, head]);
}

/** A reed clump: long narrow blades and two cattails. */
function reedGeometry(): BufferGeometry {
  const blades = tuftGeometry(16, 3, 11, 0.026, 0.22, 5, 0.3);
  const heads: BufferGeometry[] = [];
  for (let k = 0; k < 2; k++) heads.push(cattailGeometry(k));
  return merge([blades, ...heads]);
}

/** A cattail head: a sausage of two crossed cards (rounded ends) with a thin spike above. */
function cattailGeometry(k: number): BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const t: number[] = [];
  const parts: number[] = [];
  const idx: number[] = [];
  const ox = (k ? -1 : 1) * 0.05;
  const oz = (k ? 1 : -1) * 0.03;
  const y0 = 0.84 + k * 0.07;
  const len = 0.13;
  const r = 0.016;
  const segs = 5;
  for (const [ax, az] of [[1, 0], [0, 1]] as const) {
    const base = pos.length / 3;
    for (let s = 0; s <= segs; s++) {
      const f = s / segs;
      const w = r * Math.pow(Math.sin(Math.PI * (0.08 + 0.84 * f)), 0.35);
      const y = y0 + f * len;
      pos.push(ox - ax * w, y, oz - az * w, ox + ax * w, y, oz + az * w);
      nrm.push(-az, 0.4, ax, -az, 0.4, ax);
      t.push(0.85 + 0.15 * f, 0.85 + 0.15 * f);
      parts.push(4, 4);
    }
    for (let s = 0; s < segs; s++) {
      const i = base + s * 2;
      idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
    // the bare spike above the head
    const b = pos.length / 3;
    const w = 0.003;
    pos.push(ox - ax * w, y0 + len, oz - az * w, ox + ax * w, y0 + len, oz + az * w, ox, y0 + len + 0.07, oz);
    nrm.push(-az, 0.4, ax, -az, 0.4, ax, -az, 0.4, ax);
    t.push(1, 1, 1);
    parts.push(3, 3, 3);
    idx.push(b, b + 1, b + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute('aT', new BufferAttribute(new Float32Array(t), 1));
  g.setAttribute('aPart', new BufferAttribute(new Float32Array(parts), 1));
  g.setIndex(idx);
  return g;
}

const COVER_VERT = /* glsl */ `
${ATMOS_GLSL}
attribute float aT;
attribute float aPart;
attribute vec4 aInst;   // x, y, z, scale
attribute vec2 aVar;    // rotation, variant
uniform float uRadius;
varying vec3 vWorld;
varying vec3 vN;
varying float vT;
varying float vPart;
varying float vVar;
varying vec2 vPetal;
void main() {
  float d = length(aInst.xz - uCamPos.xz);
  // grow out of the ground at the edge of the ring (no popping)
  float grow = 1.0 - smoothstep(uRadius * 0.72, uRadius, d);
  // tall reeds duck away right at the camera instead of filling the screen
  grow *= mix(1.0, 0.15 + 0.85 * smoothstep(0.8, 3.0, d), step(1.0, aInst.w));
  // … and along the line from the camera to the character (third person, round 9: walking into
  // the reed belt filled the screen with flat blades): uLanternPos rides on the character
  vec2 sa = uCamPos.xz, sb = uLanternPos.xz;
  vec2 ab = sb - sa;
  float hl = clamp(dot(aInst.xz - sa, ab) / max(dot(ab, ab), 1e-4), 0.0, 0.92);
  float seg = length(aInst.xz - (sa + ab * hl));
  float segOn = step(0.6, length(ab)) * step(length(ab), 12.0);
  grow *= mix(1.0, 0.12 + 0.88 * smoothstep(0.5, 1.4, seg), segOn * step(0.6, aInst.w));
  float c = cos(aVar.x), s = sin(aVar.x);
  vec3 p = position;
  p = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
  float sc = aInst.w * grow;
  vec3 wp = aInst.xyz + vec3(p.x * aInst.w, p.y * sc, p.z * aInst.w);
  // wind: gusts roll over the meadow, the tips move most
  float tt = aPart > 1.5 && aPart < 2.5 ? 1.0 : aT;
  float gust = 0.55 + 0.45 * sin(uTime * 0.7 + aInst.x * 0.05 + aInst.z * 0.035);
  float w = (sin(uTime * 2.1 + aInst.x * 0.45 + aInst.z * 0.3 + aVar.y * 6.0) * 0.6 + 0.4) * gust;
  wp.xz += vec2(0.8, 0.5) * w * 0.16 * sc * tt * tt;
  vWorld = wp;
  vN = normalize(vec3(c * normal.x - s * normal.z, normal.y, s * normal.x + c * normal.z));
  vT = aT;
  vPart = aPart;
  vVar = aVar.y;
  // flower head corners 0..3 → petal uv
  vPetal = vec2(aT > 0.5 && aT < 2.5 ? 1.0 : 0.0, aT > 1.5 ? 1.0 : 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const COVER_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
varying vec3 vWorld;
varying vec3 vN;
varying float vT;
varying float vPart;
varying float vVar;
varying vec2 vPetal;
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
void main() {
  vec3 n = normalize(vN);
  float t = vT;
  float season = uSeason;
  vec3 alb;
  float ao = mix(0.62, 1.0, t);
  float alpha = 1.0;
  if (vPart < 0.5 || (vPart > 0.5 && vPart < 1.5)) {
    // grass: summer green → autumn gold-green → dry straw; darker at the root
    vec3 bS = srgb(vec3(0.16, 0.27, 0.08)), tS = srgb(vec3(0.42, 0.6, 0.2));
    vec3 bA = srgb(vec3(0.24, 0.28, 0.11)), tA = srgb(vec3(0.62, 0.58, 0.28));
    vec3 bD = srgb(vec3(0.34, 0.3, 0.17)), tD = srgb(vec3(0.74, 0.64, 0.38));
    vec3 b = season < 1.0 ? mix(bS, bA, season) : mix(bA, bD, clamp(season - 1.0, 0.0, 1.0) * 1.4);
    vec3 tp = season < 1.0 ? mix(tS, tA, season) : mix(tA, tD, clamp(season - 1.0, 0.0, 1.0) * 1.4);
    alb = mix(b, tp, smoothstep(0.0, 1.0, t)) * (0.82 + 0.36 * vVar);
    // some tufts already dry
    alb = mix(alb, mix(bD, tD, t), step(0.82, fract(vVar * 7.7)) * 0.6);
  } else if (vPart < 2.5) {
    // flower head: a round petal disc with a darker centre; colour per instance
    vec2 q = vPetal * 2.0 - 1.0;
    float r = length(q);
    float petals = 0.78 + 0.18 * cos(atan(q.y, q.x) * 8.0 + vVar * 20.0);
    float aa = max(fwidth(r), 0.02);
    alpha = 1.0 - smoothstep(petals - aa, petals + aa, r);
    if (alpha < 0.1) discard;
    float k = fract(vVar * 13.7);
    vec3 pc = k < 0.4 ? vec3(0.95, 0.94, 0.88) : k < 0.65 ? vec3(0.98, 0.82, 0.15) : k < 0.85 ? vec3(0.62, 0.38, 0.85) : vec3(0.35, 0.5, 0.95);
    pc = srgb(pc);
    alb = mix(srgb(vec3(0.95, 0.75, 0.15)), pc, smoothstep(0.18, 0.3, r));
    ao = 1.0;
    n = vec3(0.0, 1.0, 0.0);
  } else if (vPart < 3.5) {
    // reeds: green below, straw-coloured tips; dry and pale in winter
    vec3 b = mix(srgb(vec3(0.2, 0.3, 0.12)), srgb(vec3(0.4, 0.36, 0.22)), clamp(season - 0.6, 0.0, 1.0));
    vec3 tp = mix(srgb(vec3(0.5, 0.58, 0.26)), srgb(vec3(0.76, 0.65, 0.4)), clamp(season - 0.3, 0.0, 1.0));
    alb = mix(b, tp, t) * (0.85 + 0.3 * vVar);
  } else {
    // cattail head: velvety brown, a soft highlight along its length
    alb = srgb(vec3(0.27, 0.17, 0.1)) * (0.8 + 0.3 * vVar);
    ao = 1.0;
  }
  // snow dusts the upper side
  alb = mix(alb, srgb(vec3(0.86, 0.89, 0.95)), uSnow * smoothstep(0.4, 1.0, t) * 0.6 * step(vPart, 3.5));
  vec3 col = kqLight(alb, n, vWorld, ao, 1.0);
  // light through the blades (back-lit meadow glows)
  vec3 vd = normalize(vWorld - uCamPos);
  col += alb * uSunColor * pow(max(dot(vd, uSunDir), 0.0), 3.0) * 0.5 * t * kqShadow(vWorld, vec3(0.0, 1.0, 0.0));
  gl_FragColor = vec4(kqFog(col, vWorld), alpha);
}
`;

/**
 * Near ground cover (docs/ART-DIRECTION.md §5): instanced grass tufts, meadow flowers and shore
 * reeds in a ring around the camera. Placement is deterministic per 0.55 / 0.75 m cell (hash),
 * density from the land cover, slope and era (`COVER_LOOKS`), cached per 8 m tile; blades sway in
 * the wind and grow out of the ground at the ring's edge. Off on the low tier.
 */
export class GroundCover {
  readonly object = new Group();
  readonly material: ShaderMaterial;
  private readonly layers: { grass: Layer; flowers: Layer; reeds: Layer };
  private tier = TIERS.low;
  private look: CoverLook = COVER_LOOKS.today!;
  private readonly tiles = new Map<string, TileData>();
  private lastX = Infinity;
  private lastZ = Infinity;
  private dirty = true;
  private readonly cov = new Float32Array(4);
  readonly stats = { grass: 0, flowers: 0, reeds: 0, tiles: 0 };
  /** Lake-bed depth of the terrain shader (reeds stand on the sunk bed). */
  bedDepth = 1.6;

  constructor(readonly src: GroundCoverSource) {
    this.object.name = 'nature-groundcover';
    this.object.userData.noShadow = true;
    this.material = new ShaderMaterial({
      vertexShader: COVER_VERT,
      fragmentShader: COVER_FRAG,
      side: DoubleSide,
      uniforms: { ...atmosphere, uRadius: { value: 30 } },
    });
    const make = (g: BufferGeometry, max: number, name: string): Layer => {
      const geo = new InstancedBufferGeometry();
      for (const k of ['position', 'normal', 'aT', 'aPart']) geo.setAttribute(k, g.getAttribute(k));
      geo.setIndex(g.index);
      const inst = new InstancedBufferAttribute(new Float32Array(max * 4), 4);
      const vary = new InstancedBufferAttribute(new Float32Array(max * 2), 2);
      inst.setUsage(DynamicDrawUsage);
      vary.setUsage(DynamicDrawUsage);
      geo.setAttribute('aInst', inst);
      geo.setAttribute('aVar', vary);
      geo.instanceCount = 0;
      const mesh = new Mesh(geo, this.material);
      mesh.name = name;
      mesh.frustumCulled = false;
      mesh.userData.noShadow = true;
      mesh.visible = false;
      this.object.add(mesh);
      return { mesh, geo, inst, vary, max };
    };
    this.layers = {
      grass: make(merge([tuftGeometry(22, 0, 3, 0.022, 0.26, 3, 0.42)]), 20000, 'nature-grass'),
      flowers: make(flowerGeometry(), 2500, 'nature-flowers'),
      reeds: make(reedGeometry(), 3000, 'nature-reeds'),
    };
  }

  setLevel(level: GraphicsLevel): void {
    const t = TIERS[level];
    if (t === this.tier) return;
    this.tier = t;
    this.tiles.clear();
    this.dirty = true;
    this.object.visible = t !== null;
    this.material.alphaToCoverage = t !== null;
    this.material.needsUpdate = true;
    if (t) this.material.uniforms.uRadius!.value = t.radius;
  }

  setEra(era: Era): void {
    this.look = COVER_LOOKS[era] ?? COVER_LOOKS.today!;
    this.tiles.clear();
    this.dirty = true;
  }

  /** Force a rebuild (teleports, era / tier change). */
  invalidate(): void {
    this.dirty = true;
  }

  private sample(x: number, z: number): CoverSample {
    this.src.cover(x, z, this.cov);
    return { forest: this.cov[0]!, water: this.cov[1]!, bare: this.cov[2]!, lawn: this.cov[3]! };
  }

  private tile(tx: number, tz: number): TileData {
    const key = `${tx}_${tz}`;
    let t = this.tiles.get(key);
    if (t) return t;
    const tier = this.tier!;
    const grass: number[] = [];
    const flowers: number[] = [];
    const reeds: number[] = [];
    const n = Math.round(TILE / tier.cell);
    const cell = TILE / n;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const gx = tx * n + i;
        const gz = tz * n + j;
        // full jitter (cells overlap a little) so the tufts never read as rows
        const x = (gx - 0.1 + 1.2 * hash2(gx, gz, 101)) * cell;
        const z = (gz - 0.1 + 1.2 * hash2(gz, gx, 103)) * cell;
        if (!this.src.inside(x, z)) continue;
        const c = this.sample(x, z);
        const r = hash2(gx, gz, 107);
        const v = hash2(gx, gz, 109);
        const rot = hash2(gx, gz, 113) * Math.PI * 2;
        // reeds on the shore band (stand on the sunk lake bed)
        const rc = reedChance(c, this.look);
        if (rc > 0 && r < rc) {
          const bed = this.bedDepth * smoothstep(0.15, 0.85, c.water);
          reeds.push(x, this.src.height(x, z) - bed - 0.05, z, 1.5 + 0.9 * v + bed, rot, v);
          continue;
        }
        const h = this.src.height(x, z);
        const e = 0.8;
        const sx = (this.src.height(x + e, z) - this.src.height(x - e, z)) / (2 * e);
        const sz = (this.src.height(x, z + e) - this.src.height(x, z - e)) / (2 * e);
        const slope = (Math.atan(Math.hypot(sx, sz)) * 180) / Math.PI;
        const patch = valueNoise(x * 0.07, z * 0.07, 5);
        const fc = flowerChance(c, this.look);
        if (fc > 0 && hash2(gx, gz, 127) < fc * (0.4 + patch)) {
          flowers.push(x, h - 0.02, z, 0.32 + 0.22 * v, rot, hash2(gx, gz, 131));
          continue;
        }
        // clumps of a few metres: dense, taller tussocks with thinner gaps between them
        const clump = smoothstep(0.22, 0.78, valueNoise(x * 0.33, z * 0.33, 17));
        const gc = grassChance(c, slope, patch, this.look) * (0.35 + 0.95 * clump);
        if (gc > 0 && r < gc) {
          const tall = (0.26 + 0.26 * v) * (1 - 0.45 * c.lawn) * (0.7 + 0.6 * patch) * (0.75 + 0.5 * clump);
          grass.push(x, h - 0.03, z, tall, rot, hash2(gx, gz, 137));
        }
      }
    t = { grass: new Float32Array(grass), flowers: new Float32Array(flowers), reeds: new Float32Array(reeds) };
    this.tiles.set(key, t);
    // keep the cache bounded (≈ the ring and its neighbours)
    if (this.tiles.size > 260) {
      const first = this.tiles.keys().next().value as string;
      this.tiles.delete(first);
    }
    return t;
  }

  update(camera: PerspectiveCamera): void {
    const tier = this.tier;
    if (!tier) return;
    const p = camera.position;
    if (!this.dirty && Math.hypot(p.x - this.lastX, p.z - this.lastZ) < 3) return;
    this.dirty = false;
    this.lastX = p.x;
    this.lastZ = p.z;
    const rad = tier.radius;
    const counts = { grass: 0, flowers: 0, reeds: 0 };
    const t0x = Math.floor((p.x - rad) / TILE);
    const t1x = Math.floor((p.x + rad) / TILE);
    const t0z = Math.floor((p.z - rad) / TILE);
    const t1z = Math.floor((p.z + rad) / TILE);
    // high above the ground (spirit view / flying) the cover is invisible anyway
    const agl = p.y - this.src.height(p.x, p.z);
    let tiles = 0;
    if (agl < 40) {
      for (let tz = t0z; tz <= t1z; tz++)
        for (let tx = t0x; tx <= t1x; tx++) {
          const cx = (tx + 0.5) * TILE - p.x;
          const cz = (tz + 0.5) * TILE - p.z;
          if (Math.hypot(cx, cz) > rad + TILE * 0.71) continue;
          const t = this.tile(tx, tz);
          tiles++;
          for (const k of ['grass', 'flowers', 'reeds'] as const) {
            const src = t[k];
            const L = this.layers[k];
            const max = k === 'grass' ? Math.min(L.max, tier.maxGrass) : L.max;
            const ia = L.inst.array as Float32Array;
            const va = L.vary.array as Float32Array;
            for (let o = 0; o < src.length; o += R) {
              const n = counts[k];
              if (n >= max) break;
              const dx = src[o]! - p.x;
              const dz = src[o + 2]! - p.z;
              if (dx * dx + dz * dz > rad * rad) continue;
              ia[n * 4] = src[o]!;
              ia[n * 4 + 1] = src[o + 1]!;
              ia[n * 4 + 2] = src[o + 2]!;
              ia[n * 4 + 3] = src[o + 3]!;
              va[n * 2] = src[o + 4]!;
              va[n * 2 + 1] = src[o + 5]!;
              counts[k] = n + 1;
            }
          }
        }
    }
    for (const k of ['grass', 'flowers', 'reeds'] as const) {
      const L = this.layers[k];
      const n = counts[k];
      L.geo.instanceCount = n;
      L.inst.clearUpdateRanges();
      L.inst.addUpdateRange(0, n * 4);
      L.inst.needsUpdate = true;
      L.vary.clearUpdateRanges();
      L.vary.addUpdateRange(0, n * 2);
      L.vary.needsUpdate = true;
      L.mesh.visible = n > 0;
    }
    this.stats.grass = counts.grass;
    this.stats.flowers = counts.flowers;
    this.stats.reeds = counts.reeds;
    this.stats.tiles = tiles;
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
