/**
 * Camera-facing billboards of one built interior: candle flames, fire tongues, ember streams
 * (additive) and smoke puffs (alpha). All animation runs in the shader on uTime. Ember streams
 * use tightly fitted quads for their sparks, and each blend pass submits only its own geometry.
 */
import {
  AdditiveBlending,
  InstancedBufferAttribute,
  Mesh,
  NormalBlending,
  ShaderMaterial,
} from 'three';
import { quadInstanced } from '../fx/gl';
import type { FlameSpot } from './builder';
import { MAX_ROOMS } from './material';

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec2 iSize;
attribute float iKind;
attribute float iRoom;
attribute float iSeed;
attribute float iSpark;
uniform float uTime;
uniform float uRoomFire[${MAX_ROOMS}];
uniform float uRoomSmoke[${MAX_ROOMS}];
uniform float uRoomHeat[${MAX_ROOMS}];
uniform float uCandles;
uniform float uMotion;
varying vec2 vUv;
varying float vKind;
varying float vSeed;
varying float vAmt;
varying vec2 vSparkDelta;
varying float vSparkFade;
float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  int room = int(iRoom + 0.5);
  float amt = 1.0;
  if (iKind > 0.5 && room >= 0 && room < ${MAX_ROOMS}) {
    float fire = uRoomFire[room];
    float smoke = uRoomSmoke[room];
    float heat = uRoomHeat[room];
    amt = iKind > 2.5 ? max(max(smoke, fire * 0.8), heat * 0.5) : iKind > 1.5 ? max(fire, heat * (iSeed > 1.5 ? 0.0 : 0.55)) : fire;
  } else {
    amt = iKind < 0.5 ? uCandles : 0.0;
  }
  if (amt < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vAmt = amt;
  vKind = iKind;
  vSeed = iSeed;
  vUv = position.xy + 0.5;
  // cylindrical billboard (flames stay upright), smoke spherical
  vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
  vec3 up = vec3(0.0, 1.0, 0.0);
  if (iKind > 2.5) up = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
  else right = normalize(vec3(right.x, 0.0, right.z) + 1e-5);
  float t = uTime * uMotion;
  vec2 sz = iSize;
  if (iKind < 0.5) sz *= 0.9 + 0.12 * sin(t * 13.0 + iSeed * 40.0) + 0.06 * sin(t * 31.0 + iSeed * 9.0);
  if (iKind > 0.5 && iKind < 1.5) sz.y *= (0.55 + 0.45 * amt) * (0.9 + 0.15 * sin(t * 4.0 + iSeed * 20.0));
  vec3 base = iPos;
  // smoke rolls: drifts sideways and bobs under the ceiling
  if (iKind > 2.5) {
    base.y += 0.3 * sin(t * 0.4 + iSeed * 10.0);
    base.x += 0.8 * sin(t * 0.13 + iSeed * 17.0);
    base.z += 0.8 * cos(t * 0.11 + iSeed * 23.0);
    sz *= 0.85 + 0.3 * sin(t * 0.21 + iSeed * 5.0);
  }
  if (iKind > 1.5 && iKind < 2.5) {
    float fall = step(1.5, iSeed);
    float sd = fract(iSeed);
    float sx = hh(vec2(iSpark, sd * 17.0 + fall));
    float sp = (0.15 + 0.25 * hh(vec2(iSpark, sd * 3.0 + 1.0))) * (1.0 + fall * 0.8);
    float ph = fract(hh(vec2(iSpark + 4.0, sd)) + t * sp);
    float sy = mix(ph, 1.0 - ph * ph, fall);
    vec2 center = vec2(sx + (0.05 + 0.04 * fall) * sin(t * 2.0 + iSpark), sy);
    vec2 aspect = vec2(1.0, mix(0.45, 0.35, fall));
    vec2 halfSize = (0.012 + 0.004 * fall) / aspect;
    // Keep the same ellipse and clip to the parent stream's UV bounds.
    vUv = mix(clamp(center - halfSize, 0.0, 1.0), clamp(center + halfSize, 0.0, 1.0), vUv);
    vSparkDelta = (vUv - center) * aspect;
    vSparkFade = mix(1.0 - sy, 0.4 + 0.6 * sy, fall);
  }
  vec3 p = base + right * ((vUv.x - 0.5) * sz.x) + up * ((vUv.y - (iKind > 2.5 ? 0.5 : 0.0)) * sz.y);
  if (iKind < 0.5) p += right * 0.004 * sin(t * 7.0 + iSeed * 30.0) * vUv.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uMotion;
varying vec2 vUv;
varying float vKind;
varying float vSeed;
varying float vAmt;
varying vec2 vSparkDelta;
varying float vSparkFade;
float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * vn(p) + 0.25 * vn(p * 2.03 + 1.7) + 0.125 * vn(p * 4.01 + 3.1); }
void main() {
  float t = uTime * uMotion;
  vec2 uv = vUv;
  #ifndef SMOKE_LAYER
  if (vKind < 0.5) {
    // candle flame: a teardrop, white-yellow core, orange rim
    vec2 q = vec2((uv.x - 0.5) * 2.0, uv.y);
    float w = (1.0 - q.y) * smoothstep(0.0, 0.35, q.y) * 1.3;
    float d = abs(q.x) / max(w, 1e-3);
    float a = (1.0 - smoothstep(0.6, 1.0, d)) * smoothstep(0.0, 0.08, q.y);
    vec3 c = mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.92, 0.7), 1.0 - smoothstep(0.0, 0.7, d));
    gl_FragColor = vec4(c * a * 1.6 * vAmt, a);
    return;
  }
  if (vKind < 1.5) {
    // fire tongue: noise rising, narrowing upwards
    vec2 q = vec2((uv.x - 0.5) * 2.0, uv.y);
    float n = fbm(vec2(q.x * 2.2 + vSeed * 13.0, q.y * 2.5 - t * 2.6));
    // separate tongues licking upwards
    float tongues = fbm(vec2(q.x * 4.5 + vSeed * 31.0, q.y * 1.6 - t * 3.4));
    float w = (1.0 - q.y * 0.9) * (0.7 + 0.5 * n);
    float body = 1.0 - smoothstep(w * 0.45, w, abs(q.x));
    body *= smoothstep(0.95, 0.15, q.y + (n - 0.5) * 0.6);
    body *= smoothstep(0.25, 0.6, tongues + (1.0 - q.y) * 0.45);
    body *= smoothstep(0.0, 0.08, q.y);
    float core = smoothstep(0.55, 0.95, body) * (1.0 - q.y);
    vec3 c = mix(vec3(0.75, 0.1, 0.0), vec3(1.0, 0.4, 0.06), smoothstep(0.2, 0.8, body));
    c = mix(c, vec3(1.0, 0.68, 0.3), core * 0.7);
    // HDR core: the post's heat shimmer wobbles the air above the brightest flames
    gl_FragColor = vec4(c * body * (0.38 + 0.8 * core) * vAmt, body);
    return;
  }
  // embers: rising sparks or glowing bits falling from the ceiling
  float fall = step(1.5, vSeed);
  float a = (1.0 - smoothstep(0.0, 0.012 + 0.004 * fall, length(vSparkDelta))) * vSparkFade;
  gl_FragColor = vec4(vec3(1.0, 0.5, 0.12) * a * (2.0 + 1.5 * fall) * vAmt, a);
  #else
  // smoke puff: billowing, lit orange from below by the fire
  vec2 q = uv - 0.5;
  float n = fbm(uv * 3.0 + vec2(vSeed * 7.0, -t * 0.25));
  float edge = length(q) + (n - 0.5) * 0.35;
  if (edge >= 0.56) discard; // even the darkest second noise layer leaves zero alpha
  float n2 = fbm(uv * 6.0 - vec2(t * 0.1, vSeed * 3.0));
  float a = (1.0 - smoothstep(0.12, 0.5, edge + (n2 - 0.5) * 0.12)) * 0.62 * vAmt;
  vec3 sc = vec3(0.06, 0.055, 0.05) * (0.6 + 0.6 * n);
  sc += vec3(0.32, 0.09, 0.015) * smoothstep(0.6, 0.0, uv.y) * vAmt * (0.6 + 0.4 * n2);
  gl_FragColor = vec4(sc, a);
  #endif
}
`;

const SPARKS_PER_STREAM = 9;

/** Each slot describes one quad. Spark slots share a stream's position and carry their spark index. */
function flameGeometry(spots: readonly FlameSpot[]) {
  const g = quadInstanced();
  g.translate(-0.5, -0.5, 0);
  const n = spots.reduce((count, s) => count + (s.kind === 2 ? SPARKS_PER_STREAM : 1), 0);
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n * 2);
  const kind = new Float32Array(n);
  const room = new Float32Array(n);
  const seed = new Float32Array(n);
  const spark = new Float32Array(n);
  let i = 0;
  for (const s of spots) {
    const count = s.kind === 2 ? SPARKS_PER_STREAM : 1;
    for (let j = 0; j < count; j++, i++) {
      const p = i * 3;
      pos[p] = s.x;
      pos[p + 1] = s.y;
      pos[p + 2] = s.z;
      const q = i * 2;
      size[q] = s.w;
      size[q + 1] = s.h;
      kind[i] = s.kind;
      room[i] = s.room;
      seed[i] = s.seed;
      spark[i] = j;
    }
  }
  g.setAttribute('iPos', new InstancedBufferAttribute(pos, 3));
  g.setAttribute('iSize', new InstancedBufferAttribute(size, 2));
  g.setAttribute('iKind', new InstancedBufferAttribute(kind, 1));
  g.setAttribute('iRoom', new InstancedBufferAttribute(room, 1));
  g.setAttribute('iSeed', new InstancedBufferAttribute(seed, 1));
  g.setAttribute('iSpark', new InstancedBufferAttribute(spark, 1));
  g.instanceCount = n;
  return g;
}

// Match the vertex cutoff so a cold building submits no smoke or ember work.
const AMOUNT_CUTOFF = Math.fround(0.01);

export class FlameLayer {
  readonly additive;
  readonly smoke;
  private readonly candleCount: number;
  private readonly additiveCount: number;
  private readonly uniforms;

  constructor(
    spots: FlameSpot[],
    private readonly roomFire: number[],
    private readonly roomSmoke: number[],
    private readonly roomHeat: number[],
  ) {
    const candles = spots.filter((s) => s.kind === 0);
    const fire = spots.filter((s) => s.kind === 1 || s.kind === 2);
    const smoke = spots.filter((s) => s.kind === 3);
    const addGeo = flameGeometry([...candles, ...fire]);
    this.candleCount = candles.length;
    this.additiveCount = addGeo.instanceCount;
    this.uniforms = {
      uTime: { value: 0 },
      uRoomFire: { value: roomFire },
      uRoomSmoke: { value: roomSmoke },
      uRoomHeat: { value: roomHeat },
      uCandles: { value: 1 },
      uMotion: { value: 1 },
    };
    this.additive = new Mesh(addGeo, new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: AdditiveBlending,
    }));
    this.smoke = new Mesh(flameGeometry(smoke), new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, defines: { SMOKE_LAYER: 1 },
      transparent: true, depthWrite: false, blending: NormalBlending,
    }));
    this.additive.frustumCulled = this.smoke.frustumCulled = false;
    this.additive.renderOrder = 5;
    this.smoke.renderOrder = 4;
    this.update(0, false, 1);
  }

  update(time: number, reducedMotion: boolean, candles: number): void {
    let embers = false;
    let smoke = false;
    for (let i = 0; i < this.roomFire.length; i++) {
      const fire = this.roomFire[i]!;
      const heat = this.roomHeat[i]!;
      embers ||= Math.max(fire, heat * 0.55) >= AMOUNT_CUTOFF;
      smoke ||= Math.max(this.roomSmoke[i]!, fire * 0.8, heat * 0.5) >= AMOUNT_CUTOFF;
      if (embers && smoke) break;
    }
    this.additive.geometry.instanceCount = embers ? this.additiveCount : this.candleCount;
    this.additive.visible = (embers && this.additiveCount > this.candleCount) || (this.candleCount > 0 && candles >= AMOUNT_CUTOFF);
    this.smoke.visible = smoke && this.smoke.geometry.instanceCount > 0;
    this.uniforms.uTime.value = time;
    this.uniforms.uMotion.value = reducedMotion ? 0.25 : 1;
    this.uniforms.uCandles.value = candles;
  }

  dispose(): void {
    this.additive.geometry.dispose();
    this.smoke.geometry.dispose();
    this.additive.material.dispose();
    this.smoke.material.dispose();
  }
}
