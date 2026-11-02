/**
 * Camera-facing billboards of one built interior: candle flames, fire tongues, ember streams
 * (additive) and smoke puffs (alpha). All animation runs in the shader on uTime; fire and smoke
 * spots are always present and shown by their room's fire / smoke uniform, so a `fire:room`
 * change costs nothing but a uniform write.
 */
import {
  AdditiveBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import type { FlameSpot } from './builder';
import { MAX_ROOMS } from './material';

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec2 iSize;
attribute float iKind;
attribute float iRoom;
attribute float iSeed;
uniform float uTime;
uniform float uRoomFire[${MAX_ROOMS}];
uniform float uRoomSmoke[${MAX_ROOMS}];
uniform float uCandles;
uniform float uMotion;
varying vec2 vUv;
varying float vKind;
varying float vSeed;
varying float vAmt;
void main() {
  int room = int(iRoom + 0.5);
  float amt = 1.0;
  if (iKind > 0.5) {
    float fire = 0.0;
    float smoke = 0.0;
    for (int i = 0; i < ${MAX_ROOMS}; i++) {
      if (i == room) { fire = uRoomFire[i]; smoke = uRoomSmoke[i]; }
    }
    amt = iKind > 2.5 ? max(smoke, fire * 0.8) : fire;
  } else {
    amt = uCandles;
  }
  vAmt = amt;
  vKind = iKind;
  vSeed = iSeed;
  vUv = uv;
  if (amt < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
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
  if (iKind > 2.5) base.y += 0.3 * sin(t * 0.4 + iSeed * 10.0);
  vec3 p = base + right * (position.x * sz.x) + up * ((position.y + (iKind > 2.5 ? 0.0 : 0.5)) * sz.y);
  if (iKind < 0.5) p += right * 0.004 * sin(t * 7.0 + iSeed * 30.0) * (position.y + 0.5);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uMotion;
uniform float uSmokeLayer;
varying vec2 vUv;
varying float vKind;
varying float vSeed;
varying float vAmt;
float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * vn(p) + 0.25 * vn(p * 2.03 + 1.7) + 0.125 * vn(p * 4.01 + 3.1); }
void main() {
  float t = uTime * uMotion;
  vec2 uv = vUv;
  bool smoke = vKind > 2.5;
  if (smoke != (uSmokeLayer > 0.5)) discard;
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
    vec3 c = mix(vec3(0.75, 0.12, 0.01), vec3(1.0, 0.45, 0.08), smoothstep(0.1, 0.6, body));
    c = mix(c, vec3(1.0, 0.68, 0.3), core * 0.8);
    gl_FragColor = vec4(c * body * 0.62 * vAmt, body);
    return;
  }
  if (vKind < 2.5) {
    // embers: sparks rising through the area
    float acc = 0.0;
    for (int i = 0; i < 9; i++) {
      float fi = float(i);
      float sx = hh(vec2(fi, vSeed * 17.0));
      float sp = 0.15 + 0.25 * hh(vec2(fi, vSeed * 3.0 + 1.0));
      float sy = fract(hh(vec2(fi + 4.0, vSeed)) + t * sp);
      vec2 c = vec2(sx + 0.05 * sin(t * 2.0 + fi), sy);
      float d = length((uv - c) * vec2(1.0, 0.45));
      acc += (1.0 - smoothstep(0.0, 0.012, d)) * (1.0 - sy);
    }
    gl_FragColor = vec4(vec3(1.0, 0.5, 0.12) * acc * 2.0 * vAmt, acc);
    return;
  }
  // smoke puff
  vec2 q = uv - 0.5;
  float n = fbm(uv * 3.0 + vec2(vSeed * 7.0, -t * 0.25));
  float a = (1.0 - smoothstep(0.15, 0.5, length(q) + (n - 0.5) * 0.3)) * 0.6 * vAmt;
  gl_FragColor = vec4(vec3(0.07, 0.065, 0.06) * (0.6 + 0.6 * n), a);
}
`;

export class FlameLayer {
  readonly additive: Mesh;
  readonly smoke: Mesh;
  private readonly matA: ShaderMaterial;
  private readonly matS: ShaderMaterial;
  private readonly geo: InstancedBufferGeometry;

  constructor(spots: FlameSpot[], roomFire: number[], roomSmoke: number[]) {
    const plane = new PlaneGeometry(1, 1);
    const g = new InstancedBufferGeometry();
    g.index = plane.index;
    g.setAttribute('position', plane.getAttribute('position'));
    g.setAttribute('uv', plane.getAttribute('uv'));
    const n = Math.max(1, spots.length);
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n * 2);
    const kind = new Float32Array(n);
    const room = new Float32Array(n);
    const seed = new Float32Array(n);
    spots.forEach((s, i) => {
      pos.set([s.x, s.y, s.z], i * 3);
      size.set([s.w, s.h], i * 2);
      kind[i] = s.kind;
      room[i] = s.room;
      seed[i] = s.seed;
    });
    if (!spots.length) room[0] = -1;
    g.setAttribute('iPos', new InstancedBufferAttribute(pos, 3));
    g.setAttribute('iSize', new InstancedBufferAttribute(size, 2));
    g.setAttribute('iKind', new InstancedBufferAttribute(kind, 1));
    g.setAttribute('iRoom', new InstancedBufferAttribute(room, 1));
    g.setAttribute('iSeed', new InstancedBufferAttribute(seed, 1));
    g.instanceCount = spots.length;
    this.geo = g;
    const uniforms = () => ({
      uTime: { value: 0 },
      uRoomFire: { value: roomFire },
      uRoomSmoke: { value: roomSmoke },
      uCandles: { value: 1 },
      uMotion: { value: 1 },
      uSmokeLayer: { value: 0 },
    });
    this.matA = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: uniforms(), transparent: true, depthWrite: false, blending: AdditiveBlending });
    this.matS = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: uniforms(), transparent: true, depthWrite: false, blending: NormalBlending });
    this.matS.uniforms.uSmokeLayer!.value = 1;
    this.additive = new Mesh(g, this.matA);
    this.smoke = new Mesh(g, this.matS);
    for (const m of [this.additive, this.smoke]) {
      m.frustumCulled = false;
      m.renderOrder = 5;
    }
    this.smoke.renderOrder = 4;
  }

  update(time: number, reducedMotion: boolean, candles: number): void {
    for (const m of [this.matA, this.matS]) {
      m.uniforms.uTime!.value = time;
      m.uniforms.uMotion!.value = reducedMotion ? 0.25 : 1;
      m.uniforms.uCandles!.value = candles;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.matA.dispose();
    this.matS.dispose();
  }
}
