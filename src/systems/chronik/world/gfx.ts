/**
 * Shared procedural graphics for clue markers and echoes: glyph motes (Points), draped ground
 * rings, lit props with a glowing rim. All shaders use the shared `atmosphere` uniforms so they
 * match the world's light, fog and lantern.
 */
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  type Material,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { ATMOS_GLSL, atmosphere } from '../../../world/atmosphere';

/** sRGB hex → linear Color (the world renders in linear HDR before ACES in post). */
export function lin(hex: number, k = 1): Color {
  return new Color(hex).convertSRGBToLinear().multiplyScalar(k);
}

/** Shared per-frame values every marker shader reads. */
export const chronikUniforms = {
  /** px per metre at distance 1 (viewport height / (2·tan(fov/2))). */
  uPix: { value: 600 },
  uMotion: { value: 1 },
};

// ---------------------------------------------------------------------------------------------
// motes: rising glyph sparks

const MOTE_VERT = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
uniform float uHeight;
uniform float uSpread;
uniform float uSize;
uniform float uPix;
uniform float uFar;
uniform float uMotion;
attribute vec4 aSeed;
varying float vA;
varying float vKind;
void main() {
  float t = uTime * uMotion;
  float life = fract(t * (0.07 + aSeed.x * 0.1) + aSeed.y);
  float dir = aSeed.x > 0.5 ? 1.0 : -1.0;
  float ang = aSeed.z * 6.2831853 + t * (0.25 + aSeed.w * 0.45) * dir;
  float r = uSpread * (0.2 + 0.8 * sqrt(aSeed.w)) * (1.0 - 0.55 * life);
  vec3 p = vec3(cos(ang) * r, 0.05 + life * uHeight * (0.6 + 0.4 * aSeed.y), sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float fade = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.55, 1.0, life));
  float tw = 0.55 + 0.45 * sin(uTime * (2.5 + aSeed.x * 6.0) + aSeed.z * 31.0);
  float dist = -mv.z;
  vA = fade * tw * uAlpha * (1.0 - smoothstep(uFar * 0.55, uFar, dist));
  gl_PointSize = clamp(uSize * uPix * (0.55 + 0.9 * aSeed.y) / max(dist, 0.6), 1.0, 64.0);
  vKind = aSeed.x;
}
`;

const MOTE_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
varying float vKind;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = length(q);
  float core = exp(-d * d * 9.0);
  // a few motes are little four-pointed glyph sparks
  float arms = max(0.0, 1.0 - abs(q.x) * 9.0) * max(0.0, 1.0 - abs(q.y)) + max(0.0, 1.0 - abs(q.y) * 9.0) * max(0.0, 1.0 - abs(q.x));
  float a = (core + arms * 0.6 * step(0.72, vKind)) * vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

export interface MoteOptions {
  count: number;
  color: Color;
  height: number;
  spread: number;
  size: number;
  far?: number;
  seed?: number;
}

export function makeMotes(o: MoteOptions): Points & { material: ShaderMaterial } {
  const g = new BufferGeometry();
  const n = o.count;
  g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
  const seed = new Float32Array(n * 4);
  let s = (o.seed ?? 1) * 7919 + 13;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n * 4; i++) seed[i] = rnd();
  g.setAttribute('aSeed', new BufferAttribute(seed, 4));
  const m = new ShaderMaterial({
    vertexShader: MOTE_VERT,
    fragmentShader: MOTE_FRAG,
    uniforms: {
      uTime: atmosphere.uTime,
      uPix: chronikUniforms.uPix,
      uMotion: chronikUniforms.uMotion,
      uAlpha: { value: 0 },
      uHeight: { value: o.height },
      uSpread: { value: o.spread },
      uSize: { value: o.size },
      uFar: { value: o.far ?? 70 },
      uColor: { value: o.color },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const p = new Points(g, m) as Points & { material: ShaderMaterial };
  p.frustumCulled = false;
  p.renderOrder = 5;
  return p;
}

// ---------------------------------------------------------------------------------------------
// draped rings (ground decals that follow the terrain)

export function drapedRing(heightAt: (x: number, z: number) => number, cx: number, cz: number, r0: number, r1: number, seg = 96, lift = 0.12): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const [k, r] of [r0, r1].entries()) {
      const x = cx + c * r;
      const z = cz + s * r;
      pos.push(x - cx, heightAt(x, z) + lift, z - cz);
      uv.push(i / seg, k);
    }
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** A draped disc (ground mist under echoes). uv = (angle 0..1, radius 0..1). */
export function drapedDisc(heightAt: (x: number, z: number) => number, cx: number, cz: number, r: number, rings = 10, seg = 48, lift = 0.15): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const rr = (j / rings) * r;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      pos.push(x - cx, heightAt(x, z) + lift, z - cz);
      uv.push(i / seg, j / rings);
    }
  }
  const w = seg + 1;
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * w + i;
      idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const RING_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWp;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const RING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uDash;
uniform float uMotion;
uniform vec3 uCamPos;
varying vec2 vUv;
varying vec3 vWp;
void main() {
  float edge = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float dash = uDash > 0.0 ? smoothstep(0.35, 0.5, abs(fract(vUv.x * uDash - uTime * 0.12 * uMotion) - 0.5) * 2.0) : 1.0;
  float d = length(vWp - uCamPos);
  float a = uAlpha * smoothstep(0.0, 0.6, edge) * (0.3 + 0.7 * dash) * (1.0 - smoothstep(90.0, 160.0, d));
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, min(a, 1.0));
}
`;

export function ringMaterial(color: Color, dash: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    uniforms: {
      uColor: { value: color },
      uAlpha: { value: 0 },
      uTime: atmosphere.uTime,
      uCamPos: atmosphere.uCamPos,
      uMotion: chronikUniforms.uMotion,
      uDash: { value: dash },
    },
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
}

const MIST_FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
varying vec3 vWp;
void main() {
  float r = vUv.y;
  float n = kqFbm(vWp.xz * 0.35 + vec2(uTime * 0.05, -uTime * 0.035));
  float a = uAlpha * (1.0 - smoothstep(0.3, 1.0, r)) * smoothstep(0.3, 0.8, n);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, min(a, 1.0));
}
`;

export function mistMaterial(color: Color): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: RING_VERT,
    fragmentShader: MIST_FRAG,
    uniforms: { ...atmosphere, uColor: { value: color }, uAlpha: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
}

// ---------------------------------------------------------------------------------------------
// props: lit by the world (sun, lantern, fire glow) with a pulsing golden rim

const PROP_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vWp;
varying vec3 vCol;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vCol = color;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const PROP_FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform vec3 uRim;
uniform float uGlow;
varying vec3 vN;
varying vec3 vWp;
varying vec3 vCol;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(uCamPos - vWp);
  float grain = 0.82 + 0.36 * kqNoise(vWp.xz * 37.0 + vWp.y * 11.0);
  vec3 col = kqLight(vCol * grain, n, vWp, 1.0, 1.0);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.2);
  float pulse = 0.65 + 0.35 * sin(uTime * 2.3);
  col += uRim * uGlow * (rim * 1.0 * pulse + 0.015);
  gl_FragColor = vec4(kqFog(col, vWp), 1.0);
}
`;

export function propMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: PROP_VERT,
    fragmentShader: PROP_FRAG,
    uniforms: { ...atmosphere, uRim: { value: lin(0xffc65a, 2.2) }, uGlow: { value: 0 } },
    vertexColors: true,
  });
}

const HULL_VERT = /* glsl */ `
uniform float uGrow;
varying vec3 vN;
varying vec3 vWp;
void main() {
  vec3 p = position + normal * uGrow;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWp = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const HULL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform vec3 uCamPos;
varying vec3 vN;
varying vec3 vWp;
void main() {
  vec3 v = normalize(uCamPos - vWp);
  float rim = pow(1.0 - abs(dot(normalize(vN), v)), 1.5);
  float pulse = 0.6 + 0.4 * sin(uTime * 2.3);
  float a = uAlpha * rim * pulse;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

/** Back-face hull drawn slightly inflated: the glowing outline around a prop. */
export function hullMaterial(color: Color, grow = 0.025): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: HULL_VERT,
    fragmentShader: HULL_FRAG,
    uniforms: { uColor: { value: color }, uAlpha: { value: 0 }, uTime: atmosphere.uTime, uCamPos: atmosphere.uCamPos, uGrow: { value: grow } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: BackSide,
  });
}

/** Vertical light shaft (relief finds): faint, visible from afar while the scan is on. */
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWp;
void main() {
  float side = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float a = uAlpha * pow(side, 3.0) * (1.0 - vUv.y) * (0.75 + 0.25 * sin(uTime * 1.7 - vUv.y * 9.0));
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, min(a, 1.0));
}
`;

export function beamMaterial(color: Color): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: RING_VERT,
    fragmentShader: BEAM_FRAG,
    uniforms: { uColor: { value: color }, uAlpha: { value: 0 }, uTime: atmosphere.uTime },
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: DoubleSide,
  });
}

export function disposeTree(obj: { traverse(fn: (o: unknown) => void): void }): void {
  obj.traverse((o) => {
    const m = o as { geometry?: BufferGeometry; material?: Material | Material[] };
    m.geometry?.dispose();
    if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
    else m.material?.dispose();
  });
}

export const UP = new Vector3(0, 1, 0);
