/**
 * Visuals of the pack: hounds and the Pikeur are bodies of drifting smoke (instanced, depth-
 * sorted billboards with an fbm shader, lit by the moon and the lantern, fogged like the world),
 * shedding wisps as they move. Ember eyes are additive sprites with a minimum on-screen size so
 * they read at distance in the dark and pierce the fog. The pack brings a low ground mist with
 * it. The Pikeur wears a brass Parforcehorn that glows while it sounds. Plus the "caught" rush:
 * eyes and black smoke flying at the camera.
 *
 * Visual only: reads the simulation, never writes to it. Randomness here is cosmetic.
 */
import {
  AdditiveBlending,
  type BufferGeometry,
  ConeGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  Mesh,
  type PerspectiveCamera,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import { Rng } from './rng';
import type { Agent, PackState } from './sim';

// ---- particle templates ---------------------------------------------------------------------

const BODY = 0;
const TAIL = 5;
const HEAD = 6;
const CLOAK = 7;
const RIDER = 8;
/** bones 1..4 = legs (front-left, front-right, hind-left, hind-right) */

interface Part {
  x: number;
  y: number;
  z: number;
  size: number;
  bone: number;
  /** legs/lines: fraction along 0 … 1 */
  f: number;
  hip: [number, number, number];
  seed: number;
}

type V3 = [number, number, number];

class TemplateBuilder {
  readonly parts: Part[] = [];
  constructor(
    private readonly rng: Rng,
    private readonly s: number,
  ) {}

  blob(c: V3, r: V3, n: number, size: number, bone = BODY): this {
    const { rng, s } = this;
    for (let i = 0; i < n; i++) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (let k = 0; k < 12; k++) {
        x = rng.range(-1, 1);
        y = rng.range(-1, 1);
        z = rng.range(-1, 1);
        if (x * x + y * y + z * z <= 1) break;
      }
      this.parts.push({ x: (c[0] + x * r[0]) * s, y: (c[1] + y * r[1]) * s, z: (c[2] + z * r[2]) * s, size: size * s * rng.range(0.8, 1.2), bone, f: 0, hip: [0, 0, 0], seed: rng.next() });
    }
    return this;
  }

  line(a: V3, b: V3, n: number, s0: number, s1: number, bone: number): this {
    const s = this.s;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      this.parts.push({ x: (a[0] + (b[0] - a[0]) * t) * s, y: (a[1] + (b[1] - a[1]) * t) * s, z: (a[2] + (b[2] - a[2]) * t) * s, size: (s0 + (s1 - s0) * t) * s, bone, f: t, hip: [a[0] * s, a[1] * s, a[2] * s], seed: this.rng.next() });
    }
    return this;
  }

  legs(w: number, hipY: number, zf: number, zb: number, n: number, s0: number, s1: number): this {
    const s = this.s;
    const hips: V3[] = [
      [-w, hipY, zf],
      [w, hipY, zf],
      [-w, hipY, zb],
      [w, hipY, zb],
    ];
    hips.forEach((hip, L) => {
      for (let i = 0; i < n; i++) {
        const f = (i + 0.6) / n;
        this.parts.push({ x: hip[0] * s, y: (hip[1] - f * hipY) * s, z: hip[2] * s, size: (s0 + (s1 - s0) * f) * s, bone: 1 + L, f, hip: [hip[0] * s, hip[1] * s, hip[2] * s], seed: this.rng.next() });
      }
    });
    return this;
  }
}

/** Spectral hounds are a little larger than life (par force hound ≈ 0.65 m at the shoulder). */
export const HOUND_SCALE = 1.2;

/** A par force hound with drooping ears, nose along +z. */
export function houndTemplate(seed: number): Part[] {
  return new TemplateBuilder(new Rng(seed), HOUND_SCALE)
    .blob([0, 0.62, 0], [0.12, 0.12, 0.37], 22, 0.2)
    .blob([0, 0.58, 0.32], [0.12, 0.15, 0.11], 8, 0.21)
    .blob([0, 0.61, -0.32], [0.11, 0.13, 0.1], 7, 0.19)
    .blob([0, 0.5, -0.04], [0.07, 0.035, 0.2], 3, 0.14)
    .line([0, 0.7, 0.42], [0, 0.84, 0.56], 4, 0.18, 0.15, HEAD)
    .blob([0, 0.88, 0.64], [0.065, 0.06, 0.085], 5, 0.135, HEAD)
    .line([0, 0.86, 0.72], [0, 0.82, 0.86], 3, 0.1, 0.065, HEAD)
    .line([-0.062, 0.93, 0.6], [-0.08, 0.84, 0.56], 2, 0.08, 0.07, HEAD)
    .line([0.062, 0.93, 0.6], [0.08, 0.84, 0.56], 2, 0.08, 0.07, HEAD)
    .legs(0.085, 0.55, 0.3, -0.3, 6, 0.11, 0.065)
    .line([0, 0.68, -0.46], [0, 0.86, -0.76], 4, 0.1, 0.05, TAIL).parts;
}

/** The Pikeur: horse (withers ≈ 1.6 m) and a faceless rider in a cloak and tricorne. */
export function pikeurTemplate(seed: number): Part[] {
  return new TemplateBuilder(new Rng(seed), 1)
    .blob([0, 1.35, 0], [0.27, 0.29, 0.74], 30, 0.42)
    .blob([0, 1.32, 0.72], [0.25, 0.31, 0.21], 9, 0.4)
    .blob([0, 1.4, -0.68], [0.27, 0.31, 0.25], 9, 0.4)
    .line([0, 1.6, 0.9], [0, 2.12, 1.3], 7, 0.36, 0.26, HEAD)
    .blob([0, 2.08, 1.5], [0.09, 0.11, 0.22], 6, 0.24, HEAD)
    .line([0, 2.0, 1.62], [0, 1.9, 1.8], 2, 0.17, 0.14, HEAD)
    .line([-0.07, 2.26, 1.36], [-0.08, 2.38, 1.33], 2, 0.09, 0.07, HEAD)
    .line([0.07, 2.26, 1.36], [0.08, 2.38, 1.33], 2, 0.09, 0.07, HEAD)
    .line([0, 2.05, 0.88], [0, 2.32, 1.24], 4, 0.2, 0.16, HEAD)
    .legs(0.18, 1.1, 0.6, -0.6, 8, 0.17, 0.1)
    .line([0, 1.55, -0.98], [0, 0.85, -1.25], 6, 0.26, 0.18, TAIL)
    .line([0, 1.95, -0.02], [0, 2.62, 0.04], 9, 0.34, 0.3, RIDER)
    .blob([0, 2.55, 0.02], [0.2, 0.05, 0.07], 4, 0.24, RIDER)
    .blob([0, 2.86, 0.05], [0.06, 0.07, 0.06], 3, 0.2, RIDER)
    .blob([0, 3.02, 0.03], [0.26, 0.035, 0.22], 8, 0.14, RIDER)
    .blob([0, 3.08, 0.03], [0.1, 0.04, 0.09], 2, 0.13, RIDER)
    .line([-0.22, 2.5, -0.1], [-0.26, 1.55, -0.45], 6, 0.3, 0.36, CLOAK)
    .line([0.22, 2.5, -0.1], [0.26, 1.55, -0.45], 6, 0.3, 0.36, CLOAK)
    .line([0, 2.5, -0.12], [0, 1.6, -0.52], 6, 0.3, 0.36, CLOAK)
    .line([-0.22, 2.5, 0.05], [-0.14, 2.05, 0.42], 4, 0.15, 0.12, RIDER)
    .line([0.22, 2.5, 0.05], [0.14, 2.05, 0.42], 4, 0.15, 0.12, RIDER)
    .line([-0.3, 1.75, 0.05], [-0.3, 1.2, 0.2], 3, 0.18, 0.15, RIDER)
    .line([0.3, 1.75, 0.05], [0.3, 1.2, 0.2], 3, 0.18, 0.15, RIDER).parts;
}

// ---- shaders --------------------------------------------------------------------------------

/** Smoke kinds (iExtra.x). */
const K_SMOKE = 0;
const K_MIST = 1;
const K_BLACK = 2;
const K_BREATH = 3;

const SMOKE_VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iData;  // size, alpha, seed, heat
attribute vec2 iExtra; // kind (0 body smoke, 1 ground mist, 2 black smoke, 3 breath), ground height
uniform float uTime;
varying vec2 vUv;
varying vec4 vData;
varying vec2 vExtra;
varying vec3 vWorld;
varying float vFragY;
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float spin = iExtra.x > 0.5 && iExtra.x < 1.5 ? 0.15 : 0.6;
  float rot = iData.z * 6.2831 + uTime * (fract(iData.z * 7.31) - 0.5) * spin;
  float c = cos(rot);
  float s = sin(rot);
  vec2 q = mat2(c, -s, s, c) * position.xy;
  vec3 wp = iPos + (right * q.x + up * q.y) * iData.x;
  vUv = position.xy;
  vData = iData;
  vExtra = iExtra;
  vWorld = iPos;
  vFragY = wp.y;
  // body smoke that reaches the camera fades out instead of filling the screen (overdraw);
  // the black rush smoke (kind 2) is meant to come close
  float vd = -(viewMatrix * vec4(iPos, 1.0)).z;
  float nearFade = abs(iExtra.x - 2.0) > 0.5 ? smoothstep(0.5, 1.4, vd) : 1.0;
  vData.y *= nearFade;
  gl_Position = nearFade <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const SMOKE_FRAG = /* glsl */ `
${ATMOS_GLSL}
varying vec2 vUv;
varying vec4 vData;
varying vec2 vExtra;
varying vec3 vWorld;
varying float vFragY;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float kind = vExtra.x;
  vec3 col;
  float a;
  if (kind < 0.5) {
    float n = kqFbm(vUv * 1.7 + vData.z * 31.0 + vec2(uTime * 0.23, -uTime * 0.41));
    a = smoothstep(1.0, 0.3, r * (0.72 + 0.7 * n)) * vData.y;
    vec3 toCam = normalize(uCamPos - vWorld);
    vec3 N = normalize(mix(toCam, vec3(0.0, 1.0, 0.0), 0.45) + vec3(vUv.x, vUv.y, 0.0) * 0.25);
    vec3 albedo = vec3(0.05, 0.05, 0.06) * (0.7 + 0.6 * n);
    col = kqLight(albedo, N, vWorld, 1.0, 1.0);
    // ember heat around the eyes
    col += vec3(1.0, 0.32, 0.05) * vData.w * (1.0 - r) * (1.0 - r) * 0.5;
    // the pack keeps its silhouette in the fog out to ~60 m (dark shapes are what the eye finds),
    // only beyond that does it sink into the haze
    float dist = length(vWorld - uCamPos);
    vec3 fogged = kqFog(col, vWorld);
    col = mix(fogged, col, 0.8 * (1.0 - smoothstep(55.0, 120.0, dist)));
    // rim: the fog glows through the ragged outer edge of each puff (back-lit smoke)
    float edge = r * (0.72 + 0.7 * n);
    float rim = smoothstep(0.5, 0.82, edge) * (1.0 - smoothstep(0.82, 1.0, edge));
    vec3 rimCol = uFogColor * 1.25 + vec3(0.025, 0.028, 0.035) + vec3(0.5, 0.14, 0.02) * vData.w;
    col = mix(col, rimCol, rim * 0.6);
  } else if (kind < 1.5) {
    float n = kqFbm(vUv * 1.15 + vData.z * 17.0 + vec2(uTime * 0.035, uTime * 0.021));
    a = smoothstep(1.0, 0.0, r * (0.5 + 0.95 * n));
    a = a * a * vData.y;
    // sink softly into the ground instead of cutting a straight edge
    a *= smoothstep(vExtra.y - 0.3, vExtra.y + 1.5, vFragY);
    // moonlit frost fog: pale and a little luminous, warm inside the lantern light
    col = kqLight(vec3(0.85, 0.88, 0.95), vec3(0.0, 1.0, 0.0), vWorld, 1.0, 1.0) + uFogColor * 0.35;
    col = kqFog(col, vWorld);
  } else if (kind > 2.5) {
    // breath: pale vapour from the muzzle, luminous in the moonlit fog
    float n = kqFbm(vUv * 1.6 + vData.z * 13.0 + vec2(uTime * 0.3, -uTime * 0.5));
    a = smoothstep(1.0, 0.1, r * (0.6 + 0.8 * n));
    a = a * a * vData.y;
    col = kqLight(vec3(0.9, 0.92, 0.96), vec3(0.0, 1.0, 0.0), vWorld, 1.0, 1.0) + uFogColor * 1.1 + vec3(0.06);
    col += vec3(0.6, 0.18, 0.03) * vData.w * (1.0 - r);
    col = mix(kqFog(col, vWorld), col, 0.4);
  } else {
    // two octaves only: the rush covers the whole view, keep it cheap
    vec2 bp = vUv * 1.4 + vData.z * 23.0 + vec2(uTime * 0.5, -uTime * 0.7);
    float n = 0.5 * kqNoise(bp) + 0.25 * kqNoise(bp * 2.03 + vec2(17.1, 9.7)) + 0.1;
    a = smoothstep(1.0, 0.15, r * (0.65 + 0.8 * n)) * vData.y;
    col = vec3(0.004, 0.003, 0.003) + vec3(0.25, 0.05, 0.0) * vData.w * (1.0 - r);
  }
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`;

const GLOW_VERT = /* glsl */ `
${ATMOS_GLSL}
attribute vec3 iPos;
attribute vec4 iData; // size (m), intensity, kind (0 ember eye, 1 pale aura, 2 brass glint), aspect
uniform float uPixel;
uniform float uMinPx;
varying vec2 vUv;
varying vec4 vData;
varying float vFog;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float dist = max(0.05, -mv.z);
  float minSize = iData.z < 0.5 ? uMinPx * uPixel * dist : 0.0;
  float size = max(iData.x, minSize);
  mv.xy += position.xy * size * vec2(iData.w, 1.0);
  vUv = position.xy;
  vData = iData;
  // world fog (same terms as kqFog) — glows pierce it partly
  vec3 v = iPos - uCamPos;
  float d = length(v);
  float hAvg = (iPos.y + uCamPos.y) * 0.5;
  float hf = uFogHeightDensity * exp(-max(hAvg - uFogBase, 0.0) / uFogFalloff);
  float under = uUnderCanopy * uForestFog;
  vFog = 1.0 - exp(-d * (uFogDensity + hf) - min(d, 260.0) * under);
  gl_Position = projectionMatrix * mv;
}
`;

const GLOW_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vData;
varying float vFog;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  vec3 col;
  if (vData.z < 0.5) {
    float core = smoothstep(0.34, 0.02, r);
    float halo = exp(-r * r * 6.0) * (1.0 - r);
    col = vec3(1.0, 0.58, 0.18) * core * 1.8 + vec3(1.0, 0.26, 0.03) * halo * 1.1;
  } else if (vData.z < 1.5) {
    float g = 1.0 - r;
    col = vec3(0.42, 0.6, 0.58) * g * g * g * 0.5;
  } else {
    float g = 1.0 - r;
    col = vec3(1.0, 0.68, 0.28) * g * g * g;
  }
  col *= vData.y * (1.0 - (vData.z < 0.5 ? 0.6 : 0.72) * vFog);
  gl_FragColor = vec4(col, 1.0);
}
`;

const HORN_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const HORN_FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform float uGlow;
uniform float uFade;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uCamPos - vWorld);
  vec3 brass = vec3(0.55, 0.38, 0.14);
  vec3 col = kqLight(brass, n, vWorld, 1.0, 1.0);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.0);
  col += vec3(1.0, 0.6, 0.22) * (0.08 + 1.1 * uGlow) * (0.3 + rim);
  col = kqFog(col, vWorld);
  gl_FragColor = vec4(col * uFade, 1.0);
}
`;

// ---- instanced sprite pools -----------------------------------------------------------------

function quadGeometry(): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function dynAttr(n: number, size: number): InstancedBufferAttribute {
  const a = new InstancedBufferAttribute(new Float32Array(n * size), size);
  a.setUsage(DynamicDrawUsage);
  return a;
}

function upload(attrs: InstancedBufferAttribute[], n: number): void {
  for (const a of attrs) {
    a.needsUpdate = true;
    a.clearUpdateRanges();
    a.addUpdateRange(0, n * a.itemSize);
  }
}

/** Additive glow sprites (unsorted). */
class GlowPool {
  readonly mesh: Mesh;
  readonly geo = quadGeometry();
  private readonly pos: InstancedBufferAttribute;
  private readonly data: InstancedBufferAttribute;
  n = 0;

  constructor(
    readonly max: number,
    material: ShaderMaterial,
    renderOrder: number,
  ) {
    this.pos = dynAttr(max, 3);
    this.data = dynAttr(max, 4);
    this.geo.setAttribute('iPos', this.pos);
    this.geo.setAttribute('iData', this.data);
    this.geo.instanceCount = 0;
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  begin(): void {
    this.n = 0;
  }

  push(x: number, y: number, z: number, size: number, intensity: number, kind: number, aspect: number): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    (this.pos.array as Float32Array).set([x, y, z], i * 3);
    (this.data.array as Float32Array).set([size, intensity, kind, aspect], i * 4);
  }

  end(): void {
    this.geo.instanceCount = this.n;
    upload([this.pos, this.data], this.n);
    this.mesh.visible = this.n > 0;
  }
}

const SMOKE_STRIDE = 9;

/** Alpha-blended smoke/mist sprites, sorted back to front every frame. */
class SmokePool {
  readonly mesh: Mesh;
  readonly geo = quadGeometry();
  private readonly pos: InstancedBufferAttribute;
  private readonly data: InstancedBufferAttribute;
  private readonly extra: InstancedBufferAttribute;
  private readonly stage: Float32Array;
  private readonly depth: Float32Array;
  private order: number[] = [];
  n = 0;

  constructor(
    readonly max: number,
    material: ShaderMaterial,
    renderOrder: number,
  ) {
    this.pos = dynAttr(max, 3);
    this.data = dynAttr(max, 4);
    this.extra = dynAttr(max, 2);
    this.geo.setAttribute('iPos', this.pos);
    this.geo.setAttribute('iData', this.data);
    this.geo.setAttribute('iExtra', this.extra);
    this.geo.instanceCount = 0;
    this.stage = new Float32Array(max * SMOKE_STRIDE);
    this.depth = new Float32Array(max);
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  begin(): void {
    this.n = 0;
  }

  push(x: number, y: number, z: number, size: number, alpha: number, seed: number, heat: number, kind = K_SMOKE, ground = 0): void {
    if (this.n >= this.max || alpha <= 0.002) return;
    const o = this.n++ * SMOKE_STRIDE;
    const s = this.stage;
    s[o] = x;
    s[o + 1] = y;
    s[o + 2] = z;
    s[o + 3] = size;
    s[o + 4] = alpha;
    s[o + 5] = seed;
    s[o + 6] = heat;
    s[o + 7] = kind;
    s[o + 8] = ground;
  }

  end(cam: Vector3): void {
    const n = this.n;
    const s = this.stage;
    if (this.order.length !== n) this.order = Array.from({ length: n }, (_, i) => i);
    for (let i = 0; i < n; i++) {
      const o = i * SMOKE_STRIDE;
      this.depth[i] = (s[o]! - cam.x) ** 2 + (s[o + 1]! - cam.y) ** 2 + (s[o + 2]! - cam.z) ** 2;
    }
    this.order.sort((a, b) => this.depth[b]! - this.depth[a]!);
    const P = this.pos.array as Float32Array;
    const D = this.data.array as Float32Array;
    const E = this.extra.array as Float32Array;
    for (let k = 0; k < n; k++) {
      const o = this.order[k]! * SMOKE_STRIDE;
      P[k * 3] = s[o]!;
      P[k * 3 + 1] = s[o + 1]!;
      P[k * 3 + 2] = s[o + 2]!;
      D[k * 4] = s[o + 3]!;
      D[k * 4 + 1] = s[o + 4]!;
      D[k * 4 + 2] = s[o + 5]!;
      D[k * 4 + 3] = s[o + 6]!;
      E[k * 2] = s[o + 7]!;
      E[k * 2 + 1] = s[o + 8]!;
    }
    this.geo.instanceCount = n;
    upload([this.pos, this.data, this.extra], n);
    this.mesh.visible = n > 0;
  }
}

// ---- per-agent visual state -----------------------------------------------------------------

interface Vis {
  x: number;
  y: number;
  z: number;
  h: number;
  presence: number;
  sniff: number;
  emit: number;
  blinkT: number;
  blink: number;
  vx: number;
  vz: number;
  template: Part[];
  /** Eye intensity smoothing. */
  eye: number;
  /** Breathing phase (0..1, exhale at the wrap). */
  breath: number;
}

interface Wisp {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  alpha: number;
}

interface MistPuff {
  x: number;
  z: number;
  size: number;
  alpha: number;
  seed: number;
}

interface RushPair {
  sx: number;
  sy: number;
  sz: number;
  delay: number;
  dur: number;
  side: number;
  seed: number;
}

export interface VisualInput {
  agents: readonly Agent[];
  state: PackState;
  /** −1 normal; 0..1 dissolving (eyes go out one by one, smoke thins). */
  dissolve: number;
  time: number;
  dt: number;
  camera: PerspectiveCamera;
  viewportH: number;
  /** 0..1 horn glow (while a call sounds). */
  hornGlow: number;
  caught: { t: number } | null;
  reducedMotion: boolean;
  heightAt(x: number, z: number): number;
  /** 0..1 how much ground mist the pack brings (frost fog = 1). */
  mist: number;
  /** Snap to the simulation (manual stepping / screenshots). */
  snap: boolean;
  /** 0..1 finale calm-down: the mist settles low and thick around the resting pack. */
  settle?: number;
}

const MAX_SMOKE = 1500;
const MAX_GLOW = 96;
const MAX_WISPS = 420;
const MAX_BREATH = 160;
const MIST_N = 80;
const MIST_R = 72;
const _m = new Matrix4();
const smooth01 = (v: number) => {
  const c = Math.max(0, Math.min(1, v));
  return c * c * (3 - 2 * c);
};
const _v = new Vector3();

export class PackVisuals {
  readonly object = new Group();
  private readonly smoke: SmokePool;
  /** The ground mist draws before the pack: hounds stand out of the fog bank instead of drowning in
   *  it (the pack is meant to be readable at 30–60 m in frost fog; distance fog still applies). */
  private readonly mistPool: SmokePool;
  private readonly glowBack: GlowPool;
  private readonly glowFront: GlowPool;
  private readonly horn: Mesh;
  private readonly hornMat: ShaderMaterial;
  private readonly smokeMat: ShaderMaterial;
  private readonly glowMats: ShaderMaterial[] = [];
  private readonly vis = new Map<Agent, Vis>();
  private readonly wisps: Wisp[] = [];
  private wispHead = 0;
  /** Breath vapour puffs from the muzzles (pale, short-lived). */
  private readonly breath: Wisp[] = [];
  private breathHead = 0;
  private readonly mist: MistPuff[] = [];
  private mistLevel = 0;
  private readonly rng = new Rng(4242);
  private rush: RushPair[] = [];
  private rushOrigin = { x: 0, y: 0, z: 0, fx: 0, fz: -1 };

  constructor() {
    this.object.name = 'hunt-pack';
    this.smokeMat = new ShaderMaterial({
      vertexShader: SMOKE_VERT,
      fragmentShader: SMOKE_FRAG,
      uniforms: { ...atmosphere },
      transparent: true,
      depthWrite: false,
    });
    const glowMat = () => {
      const m = new ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        uniforms: { ...atmosphere, uPixel: { value: 0.002 }, uMinPx: { value: 5.5 } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      this.glowMats.push(m);
      return m;
    };
    this.glowBack = new GlowPool(16, glowMat(), 20);
    this.mistPool = new SmokePool(MIST_N, this.smokeMat, 20.5);
    this.smoke = new SmokePool(MAX_SMOKE, this.smokeMat, 21);
    this.glowFront = new GlowPool(MAX_GLOW, glowMat(), 22);
    for (let i = 0; i < MAX_WISPS; i++) this.wisps.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 1, life: 0, size: 0, alpha: 0 });
    for (let i = 0; i < MAX_BREATH; i++) this.breath.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 1, life: 0, size: 0, alpha: 0 });
    // the Parforcehorn: a coiled brass ring with a bell
    const ring = new TorusGeometry(0.2, 0.021, 8, 48);
    const bell = new ConeGeometry(0.075, 0.2, 14, 1, true);
    bell.rotateZ(Math.PI / 2);
    bell.translate(0.27, 0.06, 0);
    const hornGeo = mergeGeometries([ring.toNonIndexed(), bell.toNonIndexed()]) as BufferGeometry;
    this.hornMat = new ShaderMaterial({
      vertexShader: HORN_VERT,
      fragmentShader: HORN_FRAG,
      uniforms: { ...atmosphere, uGlow: { value: 0 }, uFade: { value: 1 } },
    });
    this.horn = new Mesh(hornGeo, this.hornMat);
    this.horn.matrixAutoUpdate = false;
    this.horn.visible = false;
    this.object.add(this.glowBack.mesh, this.mistPool.mesh, this.smoke.mesh, this.glowFront.mesh, this.horn);
  }

  clear(): void {
    this.vis.clear();
    for (const w of this.wisps) w.age = w.life = 1;
    for (const w of this.breath) w.age = w.life = 1;
    this.rush = [];
    this.mist.length = 0;
    this.mistLevel = 0;
    this.object.visible = false;
  }

  private visOf(a: Agent, snap: boolean): Vis {
    let v = this.vis.get(a);
    if (!v) {
      v = {
        x: a.x,
        y: a.y,
        z: a.z,
        h: a.heading,
        presence: 0,
        sniff: 0,
        emit: 0,
        blinkT: 2 + a.idx * 1.3,
        blink: 1,
        vx: 0,
        vz: 0,
        template: a.kind === 'pikeur' ? pikeurTemplate(901) : houndTemplate(101 + a.idx * 17),
        eye: 0.5,
        breath: (a.idx * 0.37) % 1,
      };
      this.vis.set(a, v);
      if (snap) v.presence = 1;
    }
    return v;
  }

  update(o: VisualInput): void {
    this.object.visible = true;
    const dt = Math.min(0.1, o.dt);
    const cam = o.camera;
    const px = (2 * Math.tan(((cam.fov / 2) * Math.PI) / 180)) / Math.max(1, o.viewportH);
    for (const m of this.glowMats) m.uniforms.uPixel!.value = px;
    this.smoke.begin();
    this.mistPool.begin();
    this.glowBack.begin();
    this.glowFront.begin();
    let pikeurVis: { v: Vis; a: Agent } | null = null;
    const n = o.agents.length;
    for (const a of o.agents) {
      const v = this.visOf(a, o.snap);
      // smooth towards the simulation (snap when manual stepping or teleported)
      const far = Math.hypot(a.x - v.x, a.z - v.z) > 3;
      const k = o.snap || far ? 1 : Math.min(1, dt * 14);
      const ox = v.x;
      const oz = v.z;
      v.x += (a.x - v.x) * k;
      v.z += (a.z - v.z) * k;
      v.y += (a.y - v.y) * k;
      const dh = Math.atan2(Math.sin(a.heading - v.h), Math.cos(a.heading - v.h));
      v.h += dh * (o.snap ? 1 : Math.min(1, dt * 10));
      if (dt > 0 && !o.snap) {
        v.vx = (v.x - ox) / dt;
        v.vz = (v.z - oz) / dt;
      } else {
        v.vx = -Math.sin(a.heading) * a.speed;
        v.vz = -Math.cos(a.heading) * a.speed;
      }
      // presence: fade in on spawn, out when dissolving (staggered per agent)
      let target = 1 - a.gone;
      if (o.dissolve >= 0) target = Math.min(target, o.dissolve < (a.idx + (a.kind === 'pikeur' ? n : 0) + 1) / (n + 2) ? 1 : 0);
      v.presence += (target - v.presence) * (o.snap && o.dissolve < 0 ? 1 : Math.min(1, dt * (target > v.presence ? 1.2 : 2.5)));
      if (a.gone > 0) v.presence = Math.min(v.presence, 1 - a.gone);
      v.sniff += ((a.sniffing ? 1 : 0) - v.sniff) * (o.snap ? 1 : Math.min(1, dt * 4));
      // blinking
      v.blinkT -= dt;
      if (v.blinkT <= 0) {
        v.blink = 0;
        v.blinkT = 3.5 + ((a.idx * 2.3 + o.time * 0.37) % 4);
      }
      v.blink = Math.min(1, v.blink + dt * 9);
      // eye intensity by state and awareness
      const want = o.state === 'chasing' ? 1.45 : o.state === 'calm' ? 0.6 + 0.6 * a.awareness : 0.95 + 0.3 * a.awareness;
      v.eye += (want - v.eye) * (o.snap ? 1 : Math.min(1, dt * 3));
      if (a.kind === 'pikeur') pikeurVis = { v, a };
      this.drawAgent(a, v, o);
    }
    // wisps
    this.updateWisps(dt);
    for (const w of this.wisps) {
      if (w.age >= w.life) continue;
      const t = w.age / w.life;
      const al = w.alpha * Math.pow(1 - t, 1.5) * Math.min(1, w.age / 0.2);
      this.smoke.push(w.x, w.y, w.z, w.size * (1 + 1.6 * t), al, (w.size * 7.13) % 1, 0);
    }
    // breath
    for (const w of this.breath) {
      if (w.age >= w.life) continue;
      w.age += dt;
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      w.z += w.vz * dt;
      w.vx *= 1 - dt * 1.6;
      w.vz *= 1 - dt * 1.6;
      w.vy += dt * 0.08;
      const t = w.age / w.life;
      const al = w.alpha * Math.pow(1 - t, 1.3) * Math.min(1, w.age / 0.12);
      this.smoke.push(w.x, w.y, w.z, w.size * (1 + 2.6 * t), al, (w.size * 11.7) % 1, 0, K_BREATH);
    }
    this.drawMist(o, dt);
    // the horn
    if (pikeurVis && pikeurVis.v.presence > 0.02) {
      const { v } = pikeurVis;
      const run = Math.min(1, Math.hypot(v.vx, v.vz) / 4);
      const bob = Math.abs(Math.sin((pikeurVis.a.dist / (1.6 + 1.4 * run)) * Math.PI * 2)) * (0.02 + 0.05 * run) * 1.4;
      _m.makeRotationY(v.h);
      const local = _v.set(0.3, 2.3 + bob, 0.02).applyMatrix4(_m);
      const hm = this.horn.matrix;
      hm.makeRotationY(v.h + Math.PI / 2);
      hm.multiply(_m.makeRotationZ(0.25));
      hm.setPosition(v.x + local.x, v.y + local.y, v.z + local.z);
      this.horn.matrixWorldNeedsUpdate = true;
      this.horn.visible = true;
      this.hornMat.uniforms.uGlow!.value = o.hornGlow;
      this.hornMat.uniforms.uFade!.value = v.presence;
      if (o.hornGlow > 0.02) this.glowFront.push(v.x + local.x, v.y + local.y, v.z + local.z, 0.5 + o.hornGlow * 0.3, o.hornGlow * 0.25 * v.presence, 2, 1);
    } else this.horn.visible = false;
    // the caught rush
    if (o.caught) this.drawRush(o);
    else this.rush = [];
    this.smoke.end(cam.position);
    this.mistPool.end(cam.position);
    this.glowBack.end();
    this.glowFront.end();
  }

  private drawAgent(a: Agent, v: Vis, o: VisualInput): void {
    const pik = a.kind === 'pikeur';
    const S = pik ? 1 : HOUND_SCALE;
    const speed = Math.hypot(v.vx, v.vz);
    const run = Math.max(0, Math.min(1, (speed - (pik ? 2 : 2.4)) / (pik ? 2.5 : 3)));
    const stride = (pik ? 1.6 + 1.4 * run : 0.9 + 0.8 * run) * S;
    const phase = (a.dist / stride) * Math.PI * 2;
    const swing = Math.min(1, speed / (pik ? 2 : 2.2)) * (0.32 + 0.3 * run);
    // leg phases: walk (4-beat) → gallop (paired)
    const walkP = [0, Math.PI, Math.PI / 2, (3 * Math.PI) / 2];
    const galP = [0, 0.7, Math.PI, Math.PI + 0.7];
    const ch = Math.cos(v.h);
    const sh = Math.sin(v.h);
    // terrain pitch: body follows the slope
    const len = pik ? 1.0 : 0.45 * S;
    const hf = o.heightAt(v.x - sh * len, v.z - ch * len);
    const hb = o.heightAt(v.x + sh * len, v.z + ch * len);
    const slope = Math.max(-0.8, Math.min(0.8, (hf - hb) / (2 * len)));
    const t = o.time;
    const bob = Math.abs(Math.sin(phase)) * (0.02 + 0.05 * run) * (pik ? 1.4 : S);
    const rise = (1 - v.presence) * -0.6; // smoke gathers up from the ground
    const alphaBase = (pik ? 0.82 : 0.8) * v.presence;
    const chase = o.state === 'chasing' ? 1 : 0;
    const eyeOn = v.eye * v.blink * v.presence;
    const sn = v.sniff * (pik ? 0.4 : 1);
    // finale: lying down (body sinks, forelegs stretch forward, hind legs fold, head on the paws)
    const lie = pik ? 0 : smooth01(a.lie);
    const drop = lie * 0.4 * S;
    for (const p of v.template) {
      let x = p.x;
      let y = p.y;
      let z = p.z;
      if (p.bone >= 1 && p.bone <= 4) {
        const L = p.bone - 1;
        const ph = phase + walkP[L]! * (1 - run) + galP[L]! * run;
        const ang = Math.sin(ph) * swing;
        const d = p.hip[1] - p.y; // distance down the leg
        const lift = Math.max(0, Math.cos(ph)) * 0.12 * swing * p.f * S;
        x = p.hip[0];
        y = p.hip[1] - d * Math.cos(ang) + lift;
        z = p.hip[2] * (1 + 0.15 * run) + d * Math.sin(ang);
        if (lie > 0) {
          const front = L < 2;
          const lx = p.hip[0] * (front ? 1.1 : 1.9);
          const ly = 0.07 * S + (1 - p.f) * 0.06 * S;
          const lz = p.hip[2] + (front ? p.f * 0.36 * S : -p.f * 0.08 * S);
          x += (lx - x) * lie;
          y += (ly - y) * lie;
          z += (lz - z) * lie;
        }
      } else {
        z *= 1 + 0.14 * run; // stretched at full gallop
        if (p.bone === HEAD) {
          const zz = Math.max(0, p.z / S - (pik ? 0.8 : 0.4));
          y -= sn * (0.3 + zz * 0.8) * S + chase * 0.08 * (pik ? 0 : S);
          z += sn * 0.06 * S;
        } else if (p.bone === TAIL) {
          x += Math.sin(t * (3 + run * 5) + a.idx) * 0.07 * (p.f + 0.3) * S;
          y += run * 0.04;
        } else if (p.bone === CLOAK) {
          z -= p.f * (0.1 + run * 0.35) + Math.sin(t * 2.3 + p.y * 3) * 0.05;
          x += Math.sin(t * 1.7 + p.seed * 9) * 0.05 * p.f;
        }
        y += bob * (p.bone === RIDER || p.bone === CLOAK ? 1.4 : 1);
        if (lie > 0) {
          if (p.bone === HEAD) {
            y -= lie * 0.5 * S;
            z += lie * 0.05 * S;
          } else if (p.bone === TAIL) y -= lie * (0.45 + 0.2 * p.f) * S;
          else y -= drop;
        }
      }
      if (lie > 0.9 && p.bone === BODY && !o.reducedMotion) y += Math.sin(t * 1.6 + a.idx) * 0.012 * (1 - a.dim);
      // smoky turbulence
      x += Math.sin(t * 1.7 + p.seed * 37) * 0.02;
      y += Math.sin(t * 1.3 + p.seed * 53) * 0.025 + rise;
      z += Math.sin(t * 1.1 + p.seed * 71) * 0.02;
      y += z * slope;
      // local (x right, z forward) → world
      const wx = v.x + ch * x - sh * z;
      const wz = v.z - sh * x - ch * z;
      const wy = v.y + y;
      const heat = p.bone === HEAD && !pik ? 0.5 * eyeOn * Math.max(0, Math.min(1, (p.z / S - 0.55) * 4)) : 0;
      this.smoke.push(wx, wy, wz, p.size * (1 + 0.12 * Math.sin(t * 0.9 + p.seed * 10)), alphaBase * (0.7 + 0.3 * p.seed), p.seed, heat);
    }
    // emit wisps: a constant seep, a trail when running
    v.emit += o.dt * (pik ? 9 + speed * 7 : 4 + speed * 8) * v.presence * (1 - 0.6 * lie);
    while (v.emit >= 1) {
      v.emit -= 1;
      const p = v.template[Math.floor(this.rng.next() * v.template.length)]!;
      const wx = v.x + ch * p.x - sh * p.z;
      const wz = v.z - sh * p.x - ch * p.z;
      this.emitWisp(wx + this.rng.range(-0.1, 0.1), v.y + p.y + rise, wz + this.rng.range(-0.1, 0.1), -v.vx * 0.15, -v.vz * 0.15, p.size * 1.2, pik ? 0.4 : 0.34);
    }
    // eyes: two embers at the front of the head (dim from behind)
    const toCamX = o.camera.position.x - v.x;
    const toCamZ = o.camera.position.z - v.z;
    const dc = Math.hypot(toCamX, toCamZ) || 1;
    const facing = (-sh * toCamX - ch * toCamZ) / dc;
    const face = 0.15 + 0.85 * Math.max(0, Math.min(1, (facing + 0.3) / 0.8));
    const ez = (pik ? 1.6 : 0.72 * S * (1 + 0.14 * run)) + sn * 0.06 * S + lie * 0.05 * S;
    const ey = (pik ? 2.13 - sn * 0.3 : (0.895 - sn * 0.6 - chase * 0.08) * S) - lie * 0.5 * S;
    // the eyes go out like lamps in a house: a last flicker, then dark
    const dim = a.dim;
    const flick = dim > 0 && dim < 0.75 && !o.reducedMotion ? 0.75 + 0.25 * Math.sin(t * 37 + a.idx * 5) * Math.sin(t * 11.3 + a.idx) : 1;
    const eyeDim = (1 - smooth01(dim)) * flick;
    const sep = pik ? 0.11 : 0.05 * S;
    for (const s of [-1, 1]) {
      const x = s * sep;
      const wx = v.x + ch * x - sh * ez;
      const wz = v.z - sh * x - ch * ez;
      const inten = eyeOn * face * (pik ? 0.5 : 1) * eyeDim;
      if (inten > 0.01) this.glowFront.push(wx, v.y + ey + ez * slope + bob + rise, wz, pik ? 0.09 : 0.075, inten, 0, 1.35);
    }
    // breath: a pale puff from the muzzle on every exhale, quicker and heavier on the run
    if (!pik && v.presence > 0.3 && lie < 0.5 && dim < 0.5) {
      const rate = 0.55 + 0.9 * run + 0.4 * chase;
      v.breath += o.dt * rate;
      if (v.breath >= 1) {
        v.breath %= 1;
        const mz = ez + 0.08 * S;
        const my = v.y + ey - 0.05 * S + mz * slope + bob + rise;
        const fx = -sh;
        const fz = -ch;
        for (let i = 0; i < 3; i++) {
          const w = this.breath[this.breathHead]!;
          this.breathHead = (this.breathHead + 1) % this.breath.length;
          const sp = 0.5 + 0.35 * i + 0.6 * run;
          w.x = v.x - sh * mz + this.rng.range(-0.03, 0.03);
          w.y = my + this.rng.range(-0.02, 0.02);
          w.z = v.z - ch * mz + this.rng.range(-0.03, 0.03);
          w.vx = fx * sp + v.vx * 0.6 + this.rng.range(-0.08, 0.08);
          w.vy = this.rng.range(0.02, 0.12) - 0.1 * sn;
          w.vz = fz * sp + v.vz * 0.6 + this.rng.range(-0.08, 0.08);
          w.age = -i * 0.06;
          w.life = this.rng.range(1.1, 1.7);
          w.size = 0.11 * S * (1 + 0.3 * i);
          w.alpha = (0.62 - 0.1 * i) * v.presence;
        }
      }
    }
    // the rider's cold glow (no lantern, but something shines through the smoke)
    if (pik) this.glowBack.push(v.x, v.y + 2.3, v.z, 2.6, 0.3 * v.presence * (0.85 + 0.15 * Math.sin(o.time * 1.3)), 1, 0.8);
  }

  private emitWisp(x: number, y: number, z: number, vx: number, vz: number, size: number, alpha: number): void {
    const w = this.wisps[this.wispHead]!;
    this.wispHead = (this.wispHead + 1) % this.wisps.length;
    w.x = x;
    w.y = y;
    w.z = z;
    w.vx = vx + this.rng.range(-0.15, 0.15);
    w.vy = this.rng.range(0.15, 0.45);
    w.vz = vz + this.rng.range(-0.15, 0.15);
    w.age = 0;
    w.life = this.rng.range(1.2, 2.6);
    w.size = size;
    w.alpha = alpha;
  }

  private updateWisps(dt: number): void {
    for (const w of this.wisps) {
      if (w.age >= w.life) continue;
      w.age += dt;
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      w.z += w.vz * dt;
      w.vx *= 1 - dt * 0.8;
      w.vz *= 1 - dt * 0.8;
      w.vy += dt * 0.05;
    }
  }

  /** Low ground mist around the player that comes and goes with the pack. */
  private drawMist(o: VisualInput, dt: number): void {
    const settle = o.settle ?? 0;
    const target = o.dissolve >= 0 ? 0 : Math.min(1.4, o.mist * (1 + 0.5 * settle));
    this.mistLevel += (target - this.mistLevel) * (o.snap ? 1 : Math.min(1, dt * 0.4));
    if (this.mistLevel < 0.01) return;
    const c = o.camera.position;
    const yaw = o.camera.rotation.y;
    if (!this.mist.length) {
      for (let i = 0; i < MIST_N; i++) {
        const a = this.rng.range(0, Math.PI * 2);
        const r = Math.sqrt(this.rng.range(0.02, 1)) * MIST_R;
        this.mist.push({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, size: this.rng.range(7, 15), alpha: this.rng.range(0.22, 0.42), seed: this.rng.next() });
      }
    }
    // a slow drift
    const wx = 0.35 * dt;
    const wz = 0.12 * dt;
    for (const m of this.mist) {
      m.x += wx;
      m.z += wz;
      let dx = m.x - c.x;
      let dz = m.z - c.z;
      if (dx * dx + dz * dz > MIST_R * MIST_R) {
        // respawn ahead of the view, far out
        const a = -yaw - Math.PI / 2 + this.rng.range(-1.2, 1.2);
        const r = this.rng.range(0.55, 0.95) * MIST_R;
        m.x = c.x + Math.cos(a) * r;
        m.z = c.z + Math.sin(a) * r;
        dx = m.x - c.x;
        dz = m.z - c.z;
      }
      const d = Math.sqrt(dx * dx + dz * dz);
      const near = Math.max(0, Math.min(1, (d - 3) / 6)); // no puffs in the face
      const g = o.heightAt(m.x, m.z);
      this.mistPool.push(m.x, g + m.size * (0.16 - 0.08 * settle), m.z, m.size * (1 + 0.25 * settle), m.alpha * this.mistLevel * near, m.seed, 0, K_MIST, g);
    }
  }

  /** Run the wisp emitter for a few seconds at once (so a fresh pack doesn't look "clean"). */
  prewarm(o: VisualInput, seconds = 2): void {
    const steps = Math.round(seconds * 30);
    for (let i = 0; i < steps; i++) {
      for (const a of o.agents) {
        const v = this.visOf(a, true);
        v.presence = 1;
        v.emit += (1 / 30) * (a.kind === 'pikeur' ? 9 : 4);
        while (v.emit >= 1) {
          v.emit -= 1;
          const p = v.template[Math.floor(this.rng.next() * v.template.length)]!;
          const ch = Math.cos(v.h);
          const sh = Math.sin(v.h);
          this.emitWisp(v.x + ch * p.x - sh * p.z, v.y + p.y, v.z - sh * p.x - ch * p.z, 0, 0, p.size * 1.2, a.kind === 'pikeur' ? 0.4 : 0.34);
        }
      }
      this.updateWisps(1 / 30);
    }
  }

  /** Eyes rushing in at the camera, black smoke closing in (≈ 1.6 s). */
  private drawRush(o: VisualInput): void {
    const c = o.camera;
    const t = o.caught!.t;
    if (!this.rush.length) {
      const yaw = c.rotation.y;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      this.rushOrigin = { x: c.position.x, y: c.position.y, z: c.position.z, fx, fz };
      const pairs = o.reducedMotion ? 0 : 11;
      for (let i = 0; i < pairs; i++) {
        const ang = this.rng.range(-0.9, 0.9);
        const d = this.rng.range(12, 30);
        const dx = fx * Math.cos(ang) - fz * Math.sin(ang);
        const dz = fz * Math.cos(ang) + fx * Math.sin(ang);
        const x = c.position.x + dx * d;
        const z = c.position.z + dz * d;
        this.rush.push({ sx: x, sy: o.heightAt(x, z) + this.rng.range(0.5, 1.4), sz: z, delay: this.rng.range(0, 0.55), dur: this.rng.range(0.8, 1.15), side: this.rng.range(-0.5, 0.5), seed: this.rng.next() });
      }
    }
    const O = this.rushOrigin;
    for (const r of this.rush) {
      const k = Math.max(0, Math.min(1, (t - r.delay) / r.dur));
      if (k >= 1) continue;
      const e = k * k * k;
      const ex = O.x + O.fx * 0.6 + -O.fz * r.side;
      const ez = O.z + O.fz * 0.6 + O.fx * r.side;
      const x = r.sx + (ex - r.sx) * e;
      const y = r.sy + (O.y - 0.05 - r.sy) * e;
      const z = r.sz + (ez - r.sz) * e;
      const rx = -O.fz;
      const rz = O.fx;
      const inten = (0.7 + 1.5 * k) * Math.min(1, (t - r.delay) * 4);
      for (const s of [-1, 1]) this.glowFront.push(x + rx * s * 0.06, y, z + rz * s * 0.06, 0.08, inten, 0, 1.35);
      for (let j = 0; j < 3; j++) {
        const back = 0.3 + j * 0.55;
        this.smoke.push(x - O.fx * back + rx * Math.sin(r.seed * 40 + j) * 0.2, y + Math.sin(r.seed * 31 + j) * 0.15, z - O.fz * back + rz * Math.sin(r.seed * 40 + j) * 0.2, 0.5 + k * 1.7 + j * 0.25, 0.75 * Math.min(1, k * 3 + 0.2), (r.seed + j * 0.17) % 1, j === 0 ? 0.6 : 0, K_BLACK);
      }
    }
    // the dark closing in around the edges of the view
    const close = Math.max(0, Math.min(1, (t - 0.3) / 1.2));
    if (close > 0) {
      const rx = -O.fz;
      const rz = O.fx;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + t * 0.4;
        const rr = 1.6 - close * 0.9;
        const px = O.x + O.fx * 1.4 + rx * Math.cos(a) * rr;
        const pz = O.z + O.fz * 1.4 + rz * Math.cos(a) * rr;
        this.smoke.push(px, O.y + Math.sin(a) * rr * 0.75, pz, 0.9 + close * 0.6, 0.85 * close, (i * 0.137) % 1, 0, K_BLACK);
      }
    }
  }

  dispose(): void {
    this.smoke.geo.dispose();
    this.mistPool.geo.dispose();
    this.glowBack.geo.dispose();
    this.glowFront.geo.dispose();
    this.smokeMat.dispose();
    for (const m of this.glowMats) m.dispose();
    this.horn.geometry.dispose();
    this.hornMat.dispose();
  }
}
