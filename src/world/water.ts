import {
  BufferAttribute,
  BufferGeometry,
  Group,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Plane,
  type Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import type { Era } from '../core/era';
import type { GraphicsLevel } from '../core/save';
import { GROUND } from '../data/types';
import { ATMOS_GLSL, atmosphere } from './atmosphere';
import type { GridDesc, Heightfield } from './heightfield';
import type { Sky } from './sky';

/**
 * Lakes and ponds (Karlsbergweiher, the Schwanenweiher, the Karlslust ponds …): a stylized water
 * surface over every flat body of water-class cells (docs/ART-DIRECTION.md §5 "water").
 *
 * The LiDAR returns the water surface as flat ground; the terrain shader sinks a bed under it
 * (`uBedDepth`) and this module draws the surface at the old height: per body one mesh on the
 * height grid, with a signed shore distance per vertex (shallow → clear, deep → teal, a foam line
 * on the shore). The shader layers wind ripples (directional waves + scrolling noise), fresnel,
 * the era sky reflected (planar reflection of the world on the high tier, the sky gradient with a
 * dark tree line otherwise), sun glitter, floating leaves (autumn) and ice + snow (February 1793).
 * Water does not cast shadows (transparent) but receives the sun shadow on its glitter.
 */

export interface WaterBody {
  /** Index in the list, stable per dataset. */
  id: number;
  /** Surface height (m). */
  level: number;
  /** Number of water cells. */
  cells: number;
  /** Bounding box of the water cells (local x/z). */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Centre of mass (local x/z). */
  cx: number;
  cz: number;
}

/**
 * Flat water bodies from the land-cover raster and a heightfield (pure, tested). Water cells are
 * grouped from the lowest cell up: a body takes the 4-connected water cells within `tol` metres
 * of its lowest cell, so a cascade of ponds splits into one body per level. Bodies with fewer
 * than `minCells` cells or a sloped surface (p90 − p10 > 0.5 m) are dropped.
 */
export function findWaterBodies(ground: Uint8Array, h: Heightfield, opts: { tol?: number; minCells?: number } = {}): { bodies: WaterBody[]; label: Int32Array } {
  const tol = opts.tol ?? 0.35;
  const minCells = opts.minCells ?? 12;
  const { cols, rows } = h;
  const n = cols * rows;
  const label = new Int32Array(n).fill(-1);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (ground[i] === GROUND.water) idx.push(i);
  idx.sort((a, b) => h.data[a]! - h.data[b]!);
  const bodies: WaterBody[] = [];
  const stack: number[] = [];
  let next = 0;
  const tmp: number[] = [];
  for (const seed of idx) {
    if (label[seed] !== -1) continue;
    const base = h.data[seed]!;
    const id = next++;
    tmp.length = 0;
    stack.push(seed);
    label[seed] = id;
    while (stack.length) {
      const k = stack.pop()!;
      tmp.push(k);
      const c = k % cols;
      const r = (k - c) / cols;
      const nb = [c > 0 ? k - 1 : -1, c < cols - 1 ? k + 1 : -1, r > 0 ? k - cols : -1, r < rows - 1 ? k + cols : -1];
      for (const j of nb) {
        if (j < 0 || label[j] !== -1 || ground[j] !== GROUND.water) continue;
        if (h.data[j]! > base + tol) continue;
        label[j] = id;
        stack.push(j);
      }
    }
    const hs = tmp.map((k) => h.data[k]!).sort((a, b) => a - b);
    const q = (p: number) => hs[Math.floor(p * (hs.length - 1))]!;
    if (tmp.length < minCells || q(0.9) - q(0.1) > 0.5) {
      for (const k of tmp) label[k] = -2;
      continue;
    }
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    let sx = 0;
    let sz = 0;
    for (const k of tmp) {
      const x = h.x0 + (k % cols) * h.cell;
      const z = h.z0 + Math.floor(k / cols) * h.cell;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
      sx += x;
      sz += z;
    }
    bodies.push({ id: bodies.length, level: q(0.5), cells: tmp.length, x0, z0, x1, z1, cx: sx / tmp.length, cz: sz / tmp.length });
    // relabel to the kept body's index
    for (const k of tmp) label[k] = bodies.length - 1;
  }
  // dropped / unassigned → -1
  for (let i = 0; i < n; i++) if (label[i]! < -1) label[i] = -1;
  return { bodies, label };
}

/**
 * Signed distance (m) to the shore of body `id` on the grid (pure, tested): positive inside the
 * water, negative outside, chamfer 3-4 approximation, clamped to ±maxM.
 */
export function shoreDistance(label: Int32Array, cols: number, rows: number, cell: number, id: number, box: { c0: number; r0: number; c1: number; r1: number }, maxM = 12): Float32Array {
  const w = box.c1 - box.c0 + 1;
  const hh = box.r1 - box.r0 + 1;
  const inside = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows && label[r * cols + c] === id;
  const BIG = 1e6;
  const dIn = new Float32Array(w * hh);
  const dOut = new Float32Array(w * hh);
  for (let r = 0; r < hh; r++)
    for (let c = 0; c < w; c++) {
      const isIn = inside(box.c0 + c, box.r0 + r);
      dIn[r * w + c] = isIn ? BIG : 0; // distance to the nearest outside cell
      dOut[r * w + c] = isIn ? 0 : BIG; // distance to the nearest inside cell
    }
  const pass = (d: Float32Array) => {
    for (let r = 0; r < hh; r++)
      for (let c = 0; c < w; c++) {
        let v = d[r * w + c]!;
        if (c > 0) v = Math.min(v, d[r * w + c - 1]! + 3);
        if (r > 0) v = Math.min(v, d[(r - 1) * w + c]! + 3);
        if (c > 0 && r > 0) v = Math.min(v, d[(r - 1) * w + c - 1]! + 4);
        if (c < w - 1 && r > 0) v = Math.min(v, d[(r - 1) * w + c + 1]! + 4);
        d[r * w + c] = v;
      }
    for (let r = hh - 1; r >= 0; r--)
      for (let c = w - 1; c >= 0; c--) {
        let v = d[r * w + c]!;
        if (c < w - 1) v = Math.min(v, d[r * w + c + 1]! + 3);
        if (r < hh - 1) v = Math.min(v, d[(r + 1) * w + c]! + 3);
        if (c < w - 1 && r < hh - 1) v = Math.min(v, d[(r + 1) * w + c + 1]! + 4);
        if (c > 0 && r < hh - 1) v = Math.min(v, d[(r + 1) * w + c - 1]! + 4);
        d[r * w + c] = v;
      }
  };
  pass(dIn);
  pass(dOut);
  const out = new Float32Array(w * hh);
  for (let i = 0; i < out.length; i++) {
    // cell centres: half a cell between the last water and the first land sample
    const s = dIn[i]! > 0 ? (dIn[i]! / 3 - 0.5) * cell : -(dOut[i]! / 3 - 0.5) * cell;
    out[i] = Math.max(-maxM, Math.min(maxM, s));
  }
  return out;
}

const WATER_VERT = /* glsl */ `
attribute float aShore;
varying vec3 vWorld;
varying float vShore;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vShore = aShore;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const WATER_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform float uIce;          // 0 open water, 1 frozen with snow (February 1793)
uniform float uLeaves;       // floating autumn leaves
uniform float uTreeLine;     // how much the shore forest darkens the low reflection
uniform vec3 uDeep;          // water body colour (linear)
uniform sampler2D uRefl;     // planar reflection (high tier)
uniform mat4 uReflMatrix;
uniform float uReflOn;
varying vec3 vWorld;
varying float vShore;

vec3 waveNormal(vec2 p, float t, float amp) {
  // directional waves (wind from the west-south-west) + two scrolling noise octaves
  vec2 g = vec2(0.0);
  vec2 dirs[4];
  dirs[0] = normalize(vec2(0.9, 0.35));
  dirs[1] = normalize(vec2(0.7, -0.6));
  dirs[2] = normalize(vec2(0.95, 0.1));
  dirs[3] = normalize(vec2(0.4, 0.9));
  float fr[4];
  fr[0] = 0.9; fr[1] = 1.7; fr[2] = 3.1; fr[3] = 5.3;
  for (int i = 0; i < 4; i++) {
    float ph = dot(dirs[i], p) * fr[i] - t * (1.2 + fr[i] * 0.35);
    g += dirs[i] * cos(ph) * fr[i] * 0.02 / (1.0 + float(i) * 0.6);
  }
#ifdef KQ_WATER_HQ
  float e = 0.15;
  vec2 q = p * 0.9 + vec2(t * 0.35, t * 0.12);
  float n0 = kqNoise(q);
  g += vec2(kqNoise(q + vec2(e, 0.0)) - n0, kqNoise(q + vec2(0.0, e)) - n0) / e * 0.06;
  vec2 q2 = p * 2.6 - vec2(t * 0.5, -t * 0.27);
  float m0 = kqNoise(q2);
  g += vec2(kqNoise(q2 + vec2(e, 0.0)) - m0, kqNoise(q2 + vec2(0.0, e)) - m0) / e * 0.025;
#endif
  return normalize(vec3(-g.x * amp, 1.0, -g.y * amp));
}

vec3 skyColour(vec3 r) {
  float y = max(r.y, 0.0);
  vec3 c = mix(uHorizon, uZenith, pow(y, 0.55));
  // the sun's halo in the reflection
  float s = max(dot(r, uSunDir), 0.0);
  c += uSunColor * 0.06 * pow(s, 8.0);
  return c;
}

void main() {
  vec3 toP = vWorld - uCamPos;
  float dist = length(toP);
  vec3 v = toP / max(dist, 1e-3);
  float depth = clamp(vShore, -2.0, 12.0);
  // waves calm near the shore and fade out with distance (no shimmer far away)
  float amp = mix(0.35, 1.0, smoothstep(0.0, 3.0, depth)) * (1.0 - 0.75 * smoothstep(60.0, 380.0, dist)) * (1.0 - uIce);
  vec3 n = waveNormal(vWorld.xz, uTime, amp);
  float ndv = max(dot(-v, n), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  fres = mix(fres, 1.0, 0.18);
  vec3 r = reflect(v, n);
  r.y = abs(r.y);
  vec3 refl = skyColour(r);
  // the shore forest reflected as a dark band low on the water (cheap tiers)
  refl = mix(refl, uDeep * 0.6 + uGroundAmbient * 0.12, uTreeLine * (1.0 - smoothstep(0.02, 0.28, r.y)));
#ifdef KQ_WATER_REFL
  if (uReflOn > 0.5) {
    vec4 rp = uReflMatrix * vec4(vWorld + vec3(n.x, 0.0, n.z) * 1.2, 1.0);
    vec2 ruv = rp.xy / rp.w;
    if (ruv.x > 0.0 && ruv.y > 0.0 && ruv.x < 1.0 && ruv.y < 1.0) {
      vec3 pr = texture2D(uRefl, ruv).rgb;
      float edge = smoothstep(0.0, 0.04, min(min(ruv.x, ruv.y), min(1.0 - ruv.x, 1.0 - ruv.y)));
      refl = mix(refl, pr, edge);
    }
  }
#endif
  // the water body: teal-green, lit by the sky fill and a little sun; clearer in the shallows
  float sh = kqShadow(vWorld, vec3(0.0, 1.0, 0.0));
  // in-scattered light: sky fill plus the sun through the water (stronger looking towards it)
  float into = pow(max(dot(v, uSunDir) * -1.0 + 1.0, 0.0) * 0.5, 2.0);
  vec3 body = uDeep * (uSkyAmbient * 1.1 + uSunColor * (max(uSunDir.y, 0.0) * 0.5 + 0.25 * into) * mix(0.4, 1.0, sh));
  vec3 col = mix(body, refl, fres);
  // sun glitter (blooms), shadowed by the trees
  float spec = pow(max(dot(r, uSunDir), 0.0), 380.0) * 6.0 + pow(max(dot(r, uSunDir), 0.0), 40.0) * 0.12;
  col += uSunColor * spec * sh * (1.0 - uIce * 0.8);
  // lantern and fire glow on the surface
  vec3 ld = uLanternPos - vWorld;
  float lat = clamp(1.0 - length(ld) / uLanternRadius, 0.0, 1.0);
  col += uLantern * lat * lat * 0.25;
  col += uGlowColor * 0.06 / (1.0 + dot(uGlowPos.xz - vWorld.xz, uGlowPos.xz - vWorld.xz) * 0.00002);
  // floating leaves (autumn): small warm specks drifting with the wind
  if (uLeaves > 0.0) {
    vec2 lp = vWorld.xz * 1.6 + vec2(uTime * 0.05, uTime * 0.02);
    vec2 id = floor(lp);
    vec2 f = fract(lp) - 0.5 - (vec2(kqHash12(id), kqHash12(id + 3.7)) - 0.5) * 0.6;
    float has = step(0.9 - 0.12 * smoothstep(4.0, 0.5, depth), kqHash12(id + 11.0)) * uLeaves;
    float lf = 1.0 - smoothstep(0.05, 0.11, length(f * vec2(1.0, 1.6)));
    vec3 lc = mix(vec3(0.42, 0.13, 0.03), vec3(0.55, 0.32, 0.05), kqHash12(id + 5.0));
    col = mix(col, lc * (uSunColor * 0.5 * sh + uSkyAmbient * 0.6), lf * has * (1.0 - smoothstep(30.0, 60.0, dist)));
  }
  // shore foam: a soft broken line where the water meets the bank
  float foamN = kqNoise(vWorld.xz * 1.3 + vec2(uTime * 0.2, 0.0)) * 0.6 + kqNoise(vWorld.xz * 3.1 - uTime * 0.15) * 0.4;
  float foam = (1.0 - smoothstep(0.0, 0.7 + 0.5 * foamN, depth)) * smoothstep(-0.6, 0.0, depth) * smoothstep(0.35, 0.65, foamN + 0.15);
  foam *= 1.0 - uIce;
  col = mix(col, vec3(0.85, 0.88, 0.86) * (uSkyAmbient * 0.7 + uSunColor * 0.35 * sh), foam * 0.75);
  float alpha = mix(0.28, 0.9, smoothstep(-0.4, 4.0, depth));
  alpha = max(alpha, fres * 0.9);
  // ice and snow (February 1793): opaque, pale blue with cracks and drifts
  if (uIce > 0.0) {
    vec2 ip = vWorld.xz * 0.35;
    float cr = abs(kqNoise(ip) - 0.5) + abs(kqNoise(ip * 2.3 + 5.0) - 0.5) * 0.5;
    float crack = 1.0 - smoothstep(0.0, 0.035, cr);
    float drift = smoothstep(0.6, 0.85, kqFbm(vWorld.xz * 0.08) + 0.3 * smoothstep(2.0, 0.0, depth));
    vec3 ice = mix(vec3(0.3, 0.42, 0.5), vec3(0.5, 0.62, 0.7), kqNoise(vWorld.xz * 0.2));
    ice = mix(ice, vec3(0.25, 0.32, 0.38), crack * 0.6);
    ice = mix(ice, vec3(0.88, 0.91, 0.97), drift);
    vec3 icec = ice * (uSunColor * max(uSunDir.y, 0.0) * mix(0.4, 1.0, sh) + uSkyAmbient) + refl * 0.3 * (1.0 - drift);
    col = mix(col, icec, uIce);
    alpha = mix(alpha, 1.0, uIce);
  }
  col = kqFog(col, vWorld);
  alpha *= smoothstep(-1.2, -0.2, depth);
  gl_FragColor = vec4(col, alpha);
}
`;

interface BodyMesh {
  body: WaterBody;
  mesh: Mesh;
  /** Signed shore distance on the body's grid box (m, positive inside the water). */
  sd: Float32Array;
  box: { c0: number; r0: number; c1: number; r1: number };
}

/** Era looks of the water (linear colours are set from sRGB hex). */
const ERA_WATER: Record<Era, { deep: [number, number, number]; leaves: number; ice: number; treeLine: number }> = {
  today: { deep: [0.1, 0.22, 0.2], leaves: 1, ice: 0, treeLine: 0.75 },
  '1789': { deep: [0.09, 0.24, 0.26], leaves: 0, ice: 0, treeLine: 0.45 },
  '1793-02': { deep: [0.06, 0.1, 0.14], leaves: 0, ice: 1, treeLine: 0.3 },
  '1793-07': { deep: [0.06, 0.09, 0.11], leaves: 0, ice: 0, treeLine: 0.3 },
  '1796': { deep: [0.11, 0.19, 0.17], leaves: 0.6, ice: 0, treeLine: 0.55 },
};

export class Water {
  readonly object = new Group();
  readonly material: ShaderMaterial;
  private readonly sets: Record<'2025' | '1789', BodyMesh[]> = { '2025': [], '1789': [] };
  private active: BodyMesh[] = [];
  private level: GraphicsLevel = 'low';
  private refl: WebGLRenderTarget | null = null;
  private readonly mirror = new PerspectiveCamera();
  private readonly reflMatrix = new Matrix4();
  private readonly tmpV = new Vector3();
  private readonly tmpT = new Vector3();
  private readonly plane = new Plane();
  private readonly clip = new Vector4();
  private readonly q = new Vector4();
  private readonly size2 = new Vector2();
  /** Hidden during the reflection pass (set by World: near ground cover, props). */
  reflectionSkip: { visible: boolean }[] = [];
  readonly stats = { bodies: 0, reflection: false, reflectedLevel: 0 };
  /** Planar reflection allowed (off under „Energiesparen“; the tier decides the rest). */
  reflections = true;

  constructor(
    ground: Uint8Array,
    private readonly grid: GridDesc,
    heightfields: Record<'2025' | '1789', Heightfield>,
    sky: Sky,
  ) {
    this.object.name = 'water';
    this.object.userData.noShadow = true;
    this.material = new ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      depthWrite: true,
      uniforms: {
        ...atmosphere,
        uZenith: sky.uniforms.uZenith!,
        uHorizon: sky.uniforms.uHorizon!,
        uIce: { value: 0 },
        uLeaves: { value: 1 },
        uTreeLine: { value: 0.7 },
        uDeep: { value: new Vector3(0.05, 0.13, 0.12) },
        uRefl: { value: null },
        uReflMatrix: { value: this.reflMatrix },
        uReflOn: { value: 0 },
      },
    });
    for (const key of ['2025', '1789'] as const) {
      const hf = heightfields[key];
      const { bodies, label } = findWaterBodies(ground, hf);
      this.sets[key] = bodies.map((b) => {
        const box = this.bodyBox(b);
        const sd = shoreDistance(label, this.grid.cols, this.grid.rows, this.grid.cell, b.id, box);
        return { body: b, sd, box, mesh: this.buildMesh(b, label, hf, sd, box) };
      });
      for (const bm of this.sets[key]) {
        bm.mesh.visible = false;
        this.object.add(bm.mesh);
      }
    }
    this.setEra('today', '2025');
  }

  /** Water bodies of the current terrain (for tests / systems). */
  get bodies(): WaterBody[] {
    return this.active.map((b) => b.body);
  }

  /** Water surface height at x/z, or null when not over a water body. */
  levelAt(x: number, z: number): number | null {
    for (const { body } of this.active) {
      if (x < body.x0 - 1 || x > body.x1 + 1 || z < body.z0 - 1 || z > body.z1 + 1) continue;
      return body.level;
    }
    return null;
  }

  /**
   * How far (m) x/z lies inside open water, bilinear on the shore-distance grid: > 0 in the
   * water, <= 0 on land, `-Infinity` away from every body. Frozen water (February 1793) counts
   * as land. Used to keep the player and hovering enemies out of the deep water (playtest:
   * walking across the Karlsbergweiher on its bed; Irrlichter kiting over the open lake).
   */
  depthInside(x: number, z: number): number {
    if (this.frozen) return -Infinity;
    const { cell, x0, z0 } = this.grid;
    for (const bm of this.active) {
      const { body, sd, box } = bm;
      if (x < body.x0 - 6 || x > body.x1 + 6 || z < body.z0 - 6 || z > body.z1 + 6) continue;
      const w = box.c1 - box.c0 + 1;
      const fc = (x - x0) / cell - box.c0;
      const fr = (z - z0) / cell - box.r0;
      const c = Math.floor(fc);
      const r = Math.floor(fr);
      if (c < 0 || r < 0 || c + 1 >= w || r + 1 > box.r1 - box.r0) continue;
      const tx = fc - c;
      const tz = fr - r;
      const a = sd[r * w + c]! * (1 - tx) + sd[r * w + c + 1]! * tx;
      const b2 = sd[(r + 1) * w + c]! * (1 - tx) + sd[(r + 1) * w + c + 1]! * tx;
      const v = a * (1 - tz) + b2 * tz;
      if (v > -6) return v;
    }
    return -Infinity;
  }

  private frozen = false;

  private bodyBox(b: WaterBody): { c0: number; r0: number; c1: number; r1: number } {
    const { cols, rows, cell, x0, z0 } = this.grid;
    const pad = 3;
    return {
      c0: Math.max(0, Math.round((b.x0 - x0) / cell) - pad),
      r0: Math.max(0, Math.round((b.z0 - z0) / cell) - pad),
      c1: Math.min(cols - 1, Math.round((b.x1 - x0) / cell) + pad),
      r1: Math.min(rows - 1, Math.round((b.z1 - z0) / cell) + pad),
    };
  }

  private buildMesh(b: WaterBody, label: Int32Array, hf: Heightfield, sd: Float32Array, box: { c0: number; r0: number; c1: number; r1: number }): Mesh {
    const { cols, cell, x0, z0 } = this.grid;
    const w = box.c1 - box.c0 + 1;
    const pos: number[] = [];
    const shore: number[] = [];
    const vi = new Int32Array(w * (box.r1 - box.r0 + 1)).fill(-1);
    const vert = (c: number, r: number): number => {
      const k = (r - box.r0) * w + (c - box.c0);
      if (vi[k]! >= 0) return vi[k]!;
      vi[k] = pos.length / 3;
      pos.push(x0 + c * cell, b.level + 0.04, z0 + r * cell);
      shore.push(sd[k]!);
      return vi[k]!;
    };
    const idx: number[] = [];
    // a quad when one corner is water, or a near-shore sample that is not lower than the water
    // (the bank hides the rest by depth; never spill over a dam into the lower valley)
    const keep = (c: number, r: number) => {
      const k = (r - box.r0) * w + (c - box.c0);
      return sd[k]! > -2.5 * cell && hf.data[r * cols + c]! >= b.level - 0.25;
    };
    for (let r = box.r0; r < box.r1; r++)
      for (let c = box.c0; c < box.c1; c++) {
        const any = label[r * cols + c] === b.id || label[r * cols + c + 1] === b.id || label[(r + 1) * cols + c] === b.id || label[(r + 1) * cols + c + 1] === b.id;
        if (!any && !(keep(c, r) && keep(c + 1, r) && keep(c, r + 1) && keep(c + 1, r + 1))) continue;
        const a = vert(c, r);
        const bb = vert(c + 1, r);
        const cc = vert(c, r + 1);
        const d = vert(c + 1, r + 1);
        idx.push(a, cc, bb, bb, cc, d);
      }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('aShore', new BufferAttribute(new Float32Array(shore), 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const m = new Mesh(g, this.material);
    m.name = `water-${b.id}`;
    m.renderOrder = 2;
    m.userData.noShadow = true;
    return m;
  }

  setEra(era: Era, terrain: '2025' | '1789'): void {
    for (const k of ['2025', '1789'] as const) for (const bm of this.sets[k]) bm.mesh.visible = k === terrain;
    this.active = this.sets[terrain];
    this.stats.bodies = this.active.length;
    const L = ERA_WATER[era];
    const u = this.material.uniforms;
    (u.uDeep!.value as Vector3).set(L.deep[0], L.deep[1], L.deep[2]);
    u.uLeaves!.value = L.leaves;
    u.uIce!.value = L.ice;
    this.frozen = L.ice > 0.5;
    u.uTreeLine!.value = L.treeLine;
  }

  setLevel(level: GraphicsLevel): void {
    this.level = level;
    const d = this.material.defines;
    const want = { KQ_WATER_HQ: level !== 'low', KQ_WATER_REFL: level === 'high' };
    let changed = false;
    for (const [k, on] of Object.entries(want)) {
      if (on === k in d) continue;
      if (on) d[k] = '';
      else delete d[k];
      changed = true;
    }
    if (changed) this.material.needsUpdate = true;
    if (level !== 'high') {
      this.refl?.dispose();
      this.refl = null;
      this.material.uniforms.uReflOn!.value = 0;
    }
  }

  frame(_camera: PerspectiveCamera, _dt: number): void {}

  /**
   * Planar reflection (high tier): the scene mirrored at the nearest visible body's surface,
   * half resolution, with an oblique near plane at the water. Skipped when no body is within
   * 450 m and in front of the camera. Call after the shadow map, before the main render.
   */
  renderReflection(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): void {
    const u = this.material.uniforms;
    u.uReflOn!.value = 0;
    this.stats.reflection = false;
    if (this.level !== 'high' || !this.reflections || this.active.length === 0) return;
    // nearest body in view
    let best: WaterBody | null = null;
    let bestD = 450;
    camera.getWorldDirection(this.tmpV);
    for (const { body, mesh } of this.active) {
      if (!mesh.visible) continue;
      const dx = Math.max(body.x0 - camera.position.x, 0, camera.position.x - body.x1);
      const dz = Math.max(body.z0 - camera.position.z, 0, camera.position.z - body.z1);
      const d = Math.hypot(dx, dz);
      if (d > bestD) continue;
      const fx = body.cx - camera.position.x;
      const fz = body.cz - camera.position.z;
      if (d > 30 && (fx * this.tmpV.x + fz * this.tmpV.z) < 0) continue;
      if (camera.position.y < body.level + 0.2) continue;
      best = body;
      bestD = d;
    }
    if (!best) return;
    const size = renderer.getDrawingBufferSize(this.size2);
    const w = Math.max(64, Math.round(size.x * 0.5));
    const h = Math.max(64, Math.round(size.y * 0.5));
    if (!this.refl || this.refl.width !== w || this.refl.height !== h) {
      this.refl?.dispose();
      this.refl = new WebGLRenderTarget(w, h, { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true });
      u.uRefl!.value = this.refl.texture;
    }
    const L = best.level + 0.04;
    const m = this.mirror;
    m.copy(camera, false);
    m.position.set(camera.position.x, 2 * L - camera.position.y, camera.position.z);
    camera.getWorldDirection(this.tmpV);
    this.tmpT.copy(camera.position).add(this.tmpV);
    this.tmpT.y = 2 * L - this.tmpT.y;
    m.up.set(0, 1, 0);
    // mirrored up vector keeps the image upright after the flip
    const camUp = this.tmpV.set(0, 1, 0).applyQuaternion(camera.quaternion);
    m.up.set(camUp.x, -camUp.y, camUp.z);
    m.lookAt(this.tmpT);
    m.updateMatrixWorld(true);
    m.projectionMatrix.copy(camera.projectionMatrix);
    // oblique near plane = the water plane (in mirror view space)
    this.plane.setFromNormalAndCoplanarPoint(this.tmpV.set(0, 1, 0), this.tmpT.set(0, L, 0));
    this.plane.applyMatrix4(m.matrixWorldInverse);
    this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const p = m.projectionMatrix.elements;
    this.q.set((Math.sign(this.clip.x) + p[8]!) / p[0]!, (Math.sign(this.clip.y) + p[9]!) / p[5]!, -1, (1 + p[10]!) / p[14]!);
    this.clip.multiplyScalar(2 / this.clip.dot(this.q));
    p[2] = this.clip.x;
    p[6] = this.clip.y;
    p[10] = this.clip.z + 1 - 0.003;
    p[14] = this.clip.w;
    m.projectionMatrixInverse.copy(m.projectionMatrix).invert();
    // world → reflection texture uv
    this.reflMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.reflMatrix.multiply(m.projectionMatrix).multiply(m.matrixWorldInverse);
    const vis = this.object.visible;
    this.object.visible = false;
    const skipVis = this.reflectionSkip.map((o) => o.visible);
    for (const o of this.reflectionSkip) o.visible = false;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.refl);
    renderer.clear(true, true, false);
    renderer.render(scene, m);
    renderer.setRenderTarget(prev);
    this.reflectionSkip.forEach((o, i) => (o.visible = skipVis[i]!));
    this.object.visible = vis;
    u.uReflOn!.value = 1;
    this.stats.reflection = true;
    this.stats.reflectedLevel = best.level;
  }

  dispose(): void {
    this.refl?.dispose();
    for (const k of ['2025', '1789'] as const) for (const bm of this.sets[k]) bm.mesh.geometry.dispose();
    this.material.dispose();
  }
}
