/**
 * K3: the fire seen from outside, at the scale of a landscape (playtest round 4: "smoke columns,
 * roof glow, embers in the sky visible from the park"). While the palace burns, the strongest
 * burning buildings each send up a column of smoke 150–220 m high that leans with the wind and
 * spreads into a pall, lit orange from below; a glow sits on the roofs and a dome of light over
 * the whole palace; embers rise high and drift downwind over the park.
 *
 * Fed by the fire controller (per-building intensity); one instanced draw call for the columns,
 * one for the glows, one point cloud for the embers. Time = atmosphere.uTime (deterministic).
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, InstancedBufferAttribute, Mesh, NormalBlending, Points, ShaderMaterial, Vector2, Vector4 } from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import { quadInstanced } from './gl';

export const MAX_COLUMNS = 6;
const PUFFS = 46;
const EMBERS = 900;

export interface BlazeSource {
  x: number;
  z: number;
  /** Roof height (m a.s.l.). */
  y: number;
  /** 0..1 */
  I: number;
}

/** Pick the strongest burning buildings as columns (pure). */
export function pickColumns(byBuilding: ReadonlyMap<string, { x: number; z: number; y: number; sum: number; n: number }>, max = MAX_COLUMNS): BlazeSource[] {
  return [...byBuilding.values()]
    .filter((b) => b.sum > 0.05)
    .map((b) => ({ x: b.x, z: b.z, y: b.y, I: Math.min(1, b.sum / Math.max(2, b.n * 0.6)) }))
    .sort((a, b) => b.I - a.I)
    .slice(0, max);
}

const COLS_GLSL = /* glsl */ `
uniform vec4 uCols[${MAX_COLUMNS}]; // x, roof y, z, intensity
uniform vec2 uWind;
uniform float uHigh;
vec4 colOf(float i) {
  int k = int(i + 0.5);
  vec4 c = uCols[0];
  for (int j = 1; j < ${MAX_COLUMNS}; j++) if (j == k) c = uCols[j];
  return c;
}
`;

const COLUMN_VERT = /* glsl */ `
${ATMOS_GLSL}
${COLS_GLSL}
attribute vec2 aPuff; // column, seed
varying vec2 vUv;
varying float vA;
varying float vLit;
varying float vSeed;
varying float vFog;
varying float vH;
void main() {
  vec4 col = colOf(aPuff.x);
  float I = col.w;
  float seed = aPuff.y;
  float r1 = fract(seed * 7.31);
  float r2 = fract(seed * 13.17);
  float life = 26.0 + 14.0 * r1;
  float age = fract(uTime / life + seed);
  float top = (150.0 + 70.0 * r2) * (0.55 + 0.45 * I) * mix(0.7, 1.0, uHigh);
  float h = pow(age, 0.8) * top;
  vec3 c = vec3(col.x, col.y + h, col.z);
  // the column leans with the wind and spreads into a pall at the top
  c.xz += uWind * (h * 0.55 + h * h * 0.0016);
  float spread = 4.0 + h * 0.16 + smoothstep(0.6, 1.0, age) * 30.0;
  float ang = seed * 41.0 + uTime * 0.05;
  c.xz += vec2(cos(ang), sin(ang)) * spread * (0.25 + 0.5 * r1);
  float size = (9.0 + h * 0.22 + 18.0 * r2) * (0.6 + 0.4 * I);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float a = seed * 6.28 + uTime * 0.03 * (r2 - 0.5);
  vec2 q = position.xy - 0.5;
  q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
  vec3 p = c + right * q.x * size + up * q.y * size;
  vUv = position.xy;
  vA = I * smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.7, 1.0, age));
  vLit = exp(-h / 45.0) * I * 1.3;
  vSeed = r1;
  vH = age;
  float d = length(p - cameraPosition);
  // a landscape-scale column: much less haze than the ground, so it reads from the park
  vFog = 1.0 - exp(-d * uFogDensity * 0.35);
  gl_Position = vA < 0.003 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const COLUMN_FRAG = /* glsl */ `
${ATMOS_GLSL}
varying vec2 vUv;
varying float vA;
varying float vLit;
varying float vSeed;
varying float vFog;
varying float vH;
void main() {
  vec2 q = vUv - 0.5;
  float n = kqFbm(vUv * 2.4 + vec2(vSeed * 13.0, uTime * 0.03 - vH * 2.0));
  float puff = smoothstep(0.5, 0.1, length(q) + (n - 0.5) * 0.38);
  float a = puff * vA * (0.45 + 0.6 * n) * 0.8;
  if (a < 0.004) discard;
  vec3 smoke = mix(vec3(0.02, 0.017, 0.015), vec3(0.07, 0.058, 0.05), n);
  // lit from below by the blaze, the upper sides catch the last of the sky
  vec3 lit = vec3(1.5, 0.45, 0.1) * vLit * (0.5 + 0.8 * n) * smoothstep(0.35, -0.3, q.y + (n - 0.5) * 0.3);
  vec3 col = smoke + lit + uSkyAmbient * 0.05 * smoothstep(-0.1, 0.45, q.y) + uGlowColor * 0.015;
  col = mix(col, uFogColor * 0.55, vFog * 0.6);
  gl_FragColor = vec4(col, a);
}
`;

const GLOW_VERT = /* glsl */ `
${ATMOS_GLSL}
${COLS_GLSL}
attribute vec2 aPuff; // column (−1 = the dome), seed
varying vec2 vUv;
varying float vI;
varying float vDome;
void main() {
  bool dome = aPuff.x < -0.5;
  vec4 col = dome ? uCols[0] : colOf(aPuff.x);
  float I = col.w;
  vec3 c = vec3(col.x, col.y + (dome ? 34.0 : 4.0), col.z);
  if (dome) {
    float sum = 0.0;
    vec3 acc = vec3(0.0);
    for (int j = 0; j < ${MAX_COLUMNS}; j++) {
      acc += uCols[j].xyz * uCols[j].w;
      sum += uCols[j].w;
    }
    c = acc / max(sum, 1e-3) + vec3(0.0, 34.0, 0.0);
    I = min(1.0, sum * 0.45);
  }
  float flick = 0.85 + 0.1 * sin(uTime * 2.3 + aPuff.y * 9.0) + 0.06 * sin(uTime * 5.9 + aPuff.y * 3.0);
  float size = dome ? 230.0 : 34.0 + 18.0 * I;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec2 q = position.xy - 0.5;
  vec3 p = c + (right * q.x + up * q.y * (dome ? 0.6 : 0.8)) * size;
  vUv = position.xy;
  vI = I * flick;
  vDome = dome ? 1.0 : 0.0;
  gl_Position = I < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const GLOW_FRAG = /* glsl */ `
uniform float uGain;
varying vec2 vUv;
varying float vI;
varying float vDome;
void main() {
  vec2 q = (vUv - 0.5) * 2.0;
  float r2 = dot(q, q);
  float g = exp(-r2 * (vDome > 0.5 ? 2.2 : 3.4));
  if (g < 0.01) discard;
  vec3 col = vDome > 0.5 ? vec3(0.55, 0.16, 0.03) * 0.5 : vec3(1.0, 0.32, 0.05) * 0.8;
  gl_FragColor = vec4(col * g * vI * uGain, 1.0);
}
`;

const EMBER_VERT = /* glsl */ `
${ATMOS_GLSL}
${COLS_GLSL}
uniform float uScale;
attribute vec4 aSeed; // column, r1, r2, r3
varying float vA;
varying float vHot;
void main() {
  vec4 col = colOf(aSeed.x);
  float I = col.w;
  float life = 9.0 + aSeed.y * 10.0;
  float age = fract(uTime / life + aSeed.z);
  float h = age * (60.0 + 170.0 * aSeed.w) * (0.6 + 0.4 * I);
  vec3 p = vec3(col.x, col.y + h, col.z);
  p.xz += uWind * h * (0.8 + aSeed.y) + vec2(sin(aSeed.z * 50.0), cos(aSeed.w * 50.0)) * (3.0 + h * 0.3);
  p.x += sin(uTime * (0.7 + aSeed.y) + aSeed.z * 30.0) * 3.0 * age;
  p.z += cos(uTime * (0.6 + aSeed.w) + aSeed.y * 30.0) * 3.0 * age;
  float tw = 0.6 + 0.4 * sin(uTime * (6.0 + aSeed.w * 9.0) + aSeed.y * 40.0);
  vA = I * smoothstep(0.0, 0.05, age) * (1.0 - smoothstep(0.55, 1.0, age)) * tw;
  vHot = 1.0 - age;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp((0.35 + 0.4 * aSeed.y) * uScale / max(-mv.z, 1.0), 1.6, 9.0);
  gl_Position = vA < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
}
`;

const EMBER_FRAG = /* glsl */ `
uniform float uGain;
varying float vA;
varying float vHot;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float a = exp(-dot(q, q) * 14.0) * vA;
  if (a < 0.01) discard;
  vec3 col = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.75, 0.35), vHot);
  gl_FragColor = vec4(col * a * 2.0 * uGain, 1.0);
}
`;

/** Smoke columns, roof glow, the glow dome and the embers of the burning palace. */
export class Blaze {
  readonly object = new Group();
  private readonly cols = Array.from({ length: MAX_COLUMNS }, () => new Vector4());
  private readonly uni = {
    uCols: { value: this.cols },
    uWind: { value: new Vector2(0.42, -0.12) },
    uHigh: { value: 1 },
    uGain: { value: 1 },
    uScale: { value: 600 },
  };
  private readonly columns: Mesh;
  private readonly glows: Mesh;
  private readonly embers: Points;
  active = 0;

  constructor() {
    this.object.name = 'k3-blaze';
    const mk = (v: string, f: string, add: boolean) =>
      new ShaderMaterial({
        vertexShader: v,
        fragmentShader: f,
        uniforms: { ...atmosphere, ...this.uni },
        transparent: true,
        depthWrite: false,
        blending: add ? AdditiveBlending : NormalBlending,
      });
    const cg = quadInstanced();
    const cp = new Float32Array(MAX_COLUMNS * PUFFS * 2);
    // puff-major, so a shorter instance count thins every column alike
    for (let i = 0; i < PUFFS; i++) for (let c = 0; c < MAX_COLUMNS; c++) cp.set([c, (i + 0.5) / PUFFS + c * 0.173], (i * MAX_COLUMNS + c) * 2);
    cg.setAttribute('aPuff', new InstancedBufferAttribute(cp, 2));
    cg.instanceCount = MAX_COLUMNS * PUFFS;
    this.columns = new Mesh(cg, mk(COLUMN_VERT, COLUMN_FRAG, false));
    const gg = quadInstanced();
    const gp = new Float32Array((MAX_COLUMNS + 1) * 2);
    for (let c = 0; c < MAX_COLUMNS; c++) gp.set([c, c * 0.37], c * 2);
    gp.set([-1, 0.5], MAX_COLUMNS * 2);
    gg.setAttribute('aPuff', new InstancedBufferAttribute(gp, 2));
    gg.instanceCount = MAX_COLUMNS + 1;
    this.glows = new Mesh(gg, mk(GLOW_VERT, GLOW_FRAG, true));
    const eg = new BufferGeometry();
    const es = new Float32Array(EMBERS * 4);
    for (let i = 0; i < EMBERS; i++) {
      const h = (k: number) => {
        const x = Math.sin((i + 1) * 78.233 + k * 12.9898) * 43758.5453;
        return x - Math.floor(x);
      };
      es.set([i % MAX_COLUMNS, h(1), h(2), h(3)], i * 4);
    }
    eg.setAttribute('position', new BufferAttribute(new Float32Array(EMBERS * 3), 3));
    eg.setAttribute('aSeed', new BufferAttribute(es, 4));
    this.embers = new Points(eg, mk(EMBER_VERT, EMBER_FRAG, true));
    for (const [m, o] of [[this.glows, 3], [this.columns, 5], [this.embers, 6]] as const) {
      m.frustumCulled = false;
      m.renderOrder = o;
      m.visible = false;
      this.object.add(m);
    }
  }

  /** Per frame: the columns (strongest first), quality, flash setting. */
  update(src: readonly BlazeSource[], opts: { high: boolean; reducedFlash: boolean; pointScale: number; wind?: Vector2 }): void {
    let sum = 0;
    for (let i = 0; i < MAX_COLUMNS; i++) {
      const s = src[i];
      if (s) this.cols[i]!.set(s.x, s.y, s.z, s.I);
      else this.cols[i]!.set(src[0]?.x ?? 0, src[0]?.y ?? 0, src[0]?.z ?? 0, 0);
      sum += s?.I ?? 0;
    }
    this.active = sum;
    this.uni.uHigh.value = opts.high ? 1 : 0;
    this.uni.uGain.value = opts.reducedFlash ? 0.75 : 1;
    this.uni.uScale.value = opts.pointScale;
    if (opts.wind) this.uni.uWind.value.copy(opts.wind);
    const on = sum > 0.01;
    this.columns.visible = on;
    this.glows.visible = on;
    this.embers.visible = on;
    // low quality: fewer puffs per column, fewer embers
    (this.columns.geometry as unknown as { instanceCount: number }).instanceCount = MAX_COLUMNS * (opts.high ? PUFFS : Math.round(PUFFS * 0.55));
    this.embers.geometry.setDrawRange(0, opts.high ? EMBERS : Math.round(EMBERS * 0.4));
  }

  dispose(): void {
    for (const m of [this.columns, this.glows, this.embers]) {
      m.geometry.dispose();
      (m.material as ShaderMaterial).dispose();
    }
  }
}
