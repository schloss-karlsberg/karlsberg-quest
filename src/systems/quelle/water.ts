/**
 * The spring's living water (NEXT-SESSION §3.6): the still water in the trough / basin, the thin
 * stream from the pipe, the Karlsbergbach running down the ravine, and the motes over it. All lit
 * and fogged like the world (`ATMOS_GLSL`). Each piece reads its own clocks, so the touch can
 * stop time on the water (`uPoolTime` stands still, a ripple ring freezes where the hand went in),
 * hold the stream in the air and then run the brook backwards (`uPhase` integrates a signed flow).
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
  Vector4,
} from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import type { QuelleLook, WaterSpec } from './layout';

/** Uniforms shared by all water pieces of the spring (one object; the system writes it). */
export function waterUniforms() {
  return {
    uPoolTime: { value: 0 },
    uPhase: { value: 0 },
    uFreeze: { value: 0 },
    uMagic: { value: 0 },
    uIce: { value: 0 },
    uMurk: { value: 0 },
    uDeep: { value: new Color(0.08, 0.2, 0.2) },
    /** Touch ripple: world x, z, start (pool time), strength. */
    uRipple: { value: new Vector4(0, 0, -100, 0) },
    uGuide: { value: 0 },
    uReverse: { value: 0 },
  };
}
export type WaterUniforms = ReturnType<typeof waterUniforms>;

/** Era looks of the water. */
export function applyLook(u: WaterUniforms, look: QuelleLook): void {
  const deep: Record<QuelleLook, [number, number, number]> = {
    today: [0.07, 0.17, 0.15],
    baroque: [0.06, 0.2, 0.22],
    winter: [0.05, 0.09, 0.12],
    fire: [0.05, 0.08, 0.1],
    ruin: [0.1, 0.13, 0.08],
  };
  const d = deep[look];
  u.uDeep.value.setRGB(d[0], d[1], d[2]);
  u.uIce.value = look === 'winter' ? 1 : 0;
  u.uMurk.value = look === 'ruin' ? 1 : look === 'today' ? 0.25 : 0;
}

const COMMON = /* glsl */ `
uniform float uPoolTime;
uniform float uPhase;
uniform float uFreeze;
uniform float uMagic;
uniform float uIce;
uniform float uMurk;
uniform vec3 uDeep;
uniform vec4 uRipple;
uniform float uGuide;
`;

/** Sky / fresnel / sun glint on a water normal, plus the magic shimmer. */
const SHADE = /* glsl */ `
vec3 waterShade(vec3 wp, vec3 n, float depthTint, float sparkle) {
  vec3 v = normalize(uCamPos - wp);
  float cosT = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.03 + 0.97 * pow(1.0 - cosT, 5.0);
  // under the beeches the water mirrors leaves and trunks, not the sky
  vec3 sky = mix(uFogColor, uSkyAmbient * 2.2 + uSunColor * 0.08, 0.55) * mix(1.0, 0.4, uUnderCanopy);
  vec3 body = kqLight(uDeep * (1.0 + depthTint), vec3(0.0, 1.0, 0.0), wp, 1.0, 1.0) * 0.85;
  vec3 col = mix(body, sky, fres);
  vec3 r = reflect(-v, n);
  float sh = kqShadow(wp, vec3(0.0, 1.0, 0.0));
  float spec = pow(max(dot(r, uSunDir), 0.0), 140.0) * sh;
  col += uSunColor * spec * 2.4;
  // lantern and fire light glint too
  vec3 ld = normalize(uLanternPos - wp);
  col += uLantern * pow(max(dot(r, ld), 0.0), 40.0) * 0.6 * clamp(1.0 - length(uLanternPos - wp) / uLanternRadius, 0.0, 1.0);
  col += uGlowColor * fres * 0.6;
  // magic: a cold glow from below, golden sparks where the caustics meet
  vec3 magic = vec3(0.35, 0.8, 1.0) * (0.25 + 0.75 * sparkle) + vec3(1.0, 0.82, 0.45) * pow(sparkle, 6.0) * 2.0;
  col += magic * (uMagic * 1.1 + uGuide * 0.18);
  return col;
}
`;

// ---------------------------------------------------------------- the still water (pool)

const POOL_VERT = /* glsl */ `
varying vec3 vWp;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const POOL_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
${COMMON}
${SHADE}
varying vec3 vWp;
varying vec2 vUv;
float h(vec2 p, float t) {
  // the trickle stirs the surface near the pipe; the rest barely breathes
  float a = kqNoise(p * 7.0 + vec2(t * 0.6, -t * 0.4)) * 0.6 + kqNoise(p * 15.0 - vec2(t * 0.9, t * 0.7)) * 0.4;
  // the touch: one ring running out from the hand, frozen when time stands still
  float rt = uPoolTime - uRipple.z;
  float d = length(p - uRipple.xy);
  float ring = 0.0;
  if (rt > 0.0 && rt < 4.0) {
    float rr = rt * 0.55;
    ring = sin((d - rr) * 38.0) * exp(-pow((d - rr) * 9.0, 2.0)) * uRipple.w * exp(-rt * 0.7);
    ring += sin((d - rr * 0.6) * 44.0) * exp(-pow((d - rr * 0.6) * 11.0, 2.0)) * uRipple.w * 0.5 * exp(-rt * 0.9);
  }
  return a * 0.012 * (1.0 - uIce) + ring * 0.02;
}
void main() {
  vec2 p = vWp.xz;
  float e = 0.01;
  float t = uPoolTime;
  float h0 = h(p, t);
  vec3 n = normalize(vec3(-(h(p + vec2(e, 0.0), t) - h0) / e, 1.0, -(h(p + vec2(0.0, e), t) - h0) / e));
  // edge darkening (the wood / stone walls shade the water)
  vec2 q = abs(vUv - 0.5) * 2.0;
  float edge = smoothstep(0.55, 1.0, max(q.x, q.y));
  float caust = pow(kqNoise(p * 9.0 + t * 0.3) * kqNoise(p * 13.0 - t * 0.25), 1.2) * 2.2;
  vec3 col = waterShade(vWp, n, -edge * 0.5, clamp(caust, 0.0, 1.0));
  // leaves on today's water, a dull murk in 1796
  float leaf = step(0.82, kqNoise(p * 6.0 + 3.1)) * uMurk;
  col = mix(col, vec3(0.32, 0.2, 0.08) * (uSkyAmbient + uSunColor * 0.4), leaf * 0.8);
  col = mix(col, col * vec3(0.7, 0.75, 0.5), uMurk * 0.4);
  // ice: milky, cracked, no ripples
  float crack = smoothstep(0.02, 0.0, abs(kqNoise(p * 4.0) - 0.5)) + smoothstep(0.015, 0.0, abs(kqNoise(p * 9.0 + 7.0) - 0.5)) * 0.6;
  vec3 ice = kqLight(vec3(0.62, 0.7, 0.78), vec3(0.0, 1.0, 0.0), vWp, 1.0, 1.0) * (1.0 - crack * 0.35) + vec3(0.3, 0.35, 0.4) * pow(1.0 - clamp(dot(normalize(uCamPos - vWp), vec3(0.0, 1.0, 0.0)), 0.0, 1.0), 3.0);
  col = mix(col, ice, uIce);
  // the frozen moment: a glassy sheen
  col += vec3(0.6, 0.85, 1.0) * uFreeze * 0.12 * (1.0 - edge);
  gl_FragColor = vec4(kqFog(col, vWp), 0.92 - edge * 0.1);
}
`;

export function poolMesh(spec: WaterSpec, yawRad: number, u: WaterUniforms): Mesh {
  const g = new PlaneGeometry(spec.len, spec.wid, 1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new ShaderMaterial({
    vertexShader: POOL_VERT,
    fragmentShader: POOL_FRAG,
    uniforms: { ...atmosphere, ...u },
    transparent: true,
    depthWrite: false,
  });
  const mesh = new Mesh(g, m);
  mesh.position.set(spec.x, spec.y, spec.z);
  mesh.rotation.y = yawRad;
  mesh.renderOrder = 2;
  mesh.userData.noShadow = true;
  mesh.name = 'quelle-pool';
  return mesh;
}

// ---------------------------------------------------------------- the stream from the pipe

const STREAM_VERT = /* glsl */ `
attribute float aAlong;
varying float vAlong;
varying vec3 vWp;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vAlong = aAlong;
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const STREAM_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
${COMMON}
${SHADE}
varying float vAlong;
varying vec3 vWp;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  // streaks running down the stream (uPhase: forwards, held, backwards)
  float s = kqNoise(vec2(vUv.x * 6.0, vAlong * 9.0 - uPhase * 7.0));
  float s2 = kqNoise(vec2(vUv.x * 11.0 + 3.0, vAlong * 17.0 - uPhase * 11.0));
  float streak = smoothstep(0.35, 0.9, s * 0.6 + s2 * 0.5);
  vec3 col = waterShade(vWp, n, 0.6, streak);
  col += vec3(0.75, 0.85, 0.9) * streak * 0.35 * (uSkyAmbient + uSunColor * 0.5);
  float a = (0.45 + 0.4 * streak) * smoothstep(0.0, 0.06, vAlong) * (1.0 - uIce);
  if (a < 0.01) discard;
  gl_FragColor = vec4(kqFog(col, vWp), a);
}
`;

/**
 * A thin water jet from `from` falling (parabola, gravity) with horizontal speed along `dir`
 * (unit, world xz) until it reaches `toY`. Returns null when there is nothing to fall.
 */
export function streamMesh(from: Vector3, dirX: number, dirZ: number, toY: number, u: WaterUniforms, speed = 0.9, radius = 0.016): Mesh | null {
  const drop = from.y - toY;
  if (drop <= 0.02) return null;
  const tLand = Math.sqrt((2 * drop) / 9.81);
  const seg = 14;
  const ring = 6;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const along: number[] = [];
  const idx: number[] = [];
  const c = new Vector3();
  const tan = new Vector3();
  const side = new Vector3();
  const up = new Vector3();
  for (let i = 0; i <= seg; i++) {
    const s = i / seg;
    const t = s * tLand;
    c.set(from.x + dirX * speed * t, from.y - 4.905 * t * t, from.z + dirZ * speed * t);
    tan.set(dirX * speed, -9.81 * t, dirZ * speed).normalize();
    side.set(-dirZ, 0, dirX).normalize();
    up.crossVectors(side, tan).normalize();
    // the jet narrows as it falls and spreads a little at the end
    const r = radius * (1 - 0.35 * s) + (s > 0.9 ? (s - 0.9) * 0.15 : 0);
    for (let j = 0; j <= ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      const nx = side.x * Math.cos(a) + up.x * Math.sin(a);
      const ny = side.y * Math.cos(a) + up.y * Math.sin(a);
      const nz = side.z * Math.cos(a) + up.z * Math.sin(a);
      pos.push(c.x + nx * r, c.y + ny * r, c.z + nz * r);
      nor.push(nx, ny, nz);
      uv.push(j / ring, s);
      along.push(s);
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < ring; j++) {
      const a = i * (ring + 1) + j;
      const b = a + ring + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('aAlong', new BufferAttribute(new Float32Array(along), 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new ShaderMaterial({
    vertexShader: STREAM_VERT,
    fragmentShader: STREAM_FRAG,
    uniforms: { ...atmosphere, ...u },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(g, m);
  mesh.renderOrder = 3;
  mesh.userData.noShadow = true;
  mesh.name = 'quelle-stream';
  return mesh;
}

// ---------------------------------------------------------------- the brook down the ravine

const BROOK_VERT = /* glsl */ `
attribute vec2 aBrook; // metres along, −1…1 across
varying vec2 vB;
varying vec3 vWp;
void main() {
  vB = aBrook;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BROOK_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
${COMMON}
${SHADE}
uniform float uLen;
varying vec2 vB;
varying vec3 vWp;
void main() {
  float along = vB.x;
  float across = vB.y;
  // a meandering bed: dark wet earth either side, the water thin in the middle
  float wob = kqNoise(vec2(along * 0.35, 1.7)) - 0.5;
  float x = across + wob * 0.45;
  float bed = 1.0 - smoothstep(0.3, 1.0, abs(x));
  if (bed < 0.01) discard;
  float core = 1.0 - smoothstep(0.22, 0.62, abs(x) + (kqNoise(vec2(along * 0.9, 4.2)) - 0.5) * 0.25);
  // flow: ripples that run downhill (uPhase forward), stand still or climb back up
  float f = uPhase * 1.6;
  float r1 = kqNoise(vec2(x * 3.0, along * 2.2 - f * 2.0));
  float r2 = kqNoise(vec2(x * 6.0 + 4.0, along * 4.5 - f * 3.4));
  float e = 0.08;
  float hx = (kqNoise(vec2((x + e) * 3.0, along * 2.2 - f * 2.0)) - r1) / e;
  float hz = (kqNoise(vec2(x * 3.0, (along + e) * 2.2 - f * 2.0)) - r1) / e;
  vec3 n = normalize(vec3(-hx * 0.05, 1.0, -hz * 0.05 - (r2 - 0.5) * 0.04));
  float foam = smoothstep(0.75, 0.95, r2 * 0.7 + r1 * 0.4) * (1.0 - uIce) * core;
  // the bed: wet earth and pebbles; the shallow water shows it, darkened, with the sky and the sun on top
  float peb = kqNoise(vWp.xz * 9.0);
  vec3 mud = kqLight(vec3(0.13, 0.095, 0.065) * (0.7 + 0.6 * peb), vec3(0.0, 1.0, 0.0), vWp, 1.0, 1.0);
  vec3 v = normalize(uCamPos - vWp);
  float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
  vec3 sky = mix(uFogColor, uSkyAmbient * 2.2 + uSunColor * 0.08, 0.55) * mix(1.0, 0.35, uUnderCanopy);
  vec3 rr = reflect(-v, n);
  float spec = pow(max(dot(rr, uSunDir), 0.0), 120.0) * kqShadow(vWp, vec3(0.0, 1.0, 0.0));
  float caust = clamp(r1 * r2 * 2.0, 0.0, 1.0);
  vec3 magic = vec3(0.35, 0.8, 1.0) * (0.25 + 0.75 * caust) + vec3(1.0, 0.82, 0.45) * pow(caust, 6.0) * 2.0;
  vec3 wet = mud * 0.5 + sky * fres * 0.7 + uSunColor * spec * 2.0 + uGlowColor * fres * 0.5;
  wet += vec3(0.7, 0.78, 0.8) * foam * 0.25 * (uSkyAmbient + uSunColor * 0.5);
  wet += magic * (uMagic * 0.9 + uGuide * 0.14);
  vec3 col = mix(mud * 0.8, wet, core);
  // ice in the winter night, leaves in 1796
  vec3 ice = kqLight(vec3(0.6, 0.68, 0.76), vec3(0.0, 1.0, 0.0), vWp, 1.0, 1.0);
  col = mix(col, ice, uIce * core * 0.9);
  float leaf = step(0.8, kqNoise(vWp.xz * 5.0 + 1.3)) * uMurk;
  col = mix(col, vec3(0.3, 0.19, 0.08) * (uSkyAmbient + uSunColor * 0.4), leaf * 0.7);
  // the end of the drawn stretch fades into the ravine
  float fade = smoothstep(uLen, uLen - 6.0, along) * smoothstep(0.0, 0.6, along);
  gl_FragColor = vec4(kqFog(col, vWp), bed * mix(0.7, 0.92, core) * fade);
}
`;

/**
 * A ribbon along `line` (world xz), draped on the ground (each edge vertex at its own height + lift),
 * `width` m wide (narrow near the spring).
 */
export function brookMesh(line: readonly [number, number][], heightAt: (x: number, z: number) => number, u: WaterUniforms): Mesh | null {
  if (line.length < 3) return null;
  const pos: number[] = [];
  const attr: number[] = [];
  const idx: number[] = [];
  let along = 0;
  const across = [-1, -0.5, 0, 0.5, 1];
  for (let i = 0; i < line.length; i++) {
    const [x, z] = line[i]!;
    if (i > 0) along += Math.hypot(x - line[i - 1]![0], z - line[i - 1]![1]);
    const [ax, az] = line[Math.max(0, i - 1)]!;
    const [bx, bz] = line[Math.min(line.length - 1, i + 1)]!;
    let tx = bx - ax;
    let tz = bz - az;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    const half = 0.32 + Math.min(1, along / 14) * 0.4;
    for (const a of across) {
      const px = x - tz * half * a;
      const pz = z + tx * half * a;
      pos.push(px, heightAt(px, pz) + 0.05 + (1 - Math.abs(a)) * 0.015, pz);
      attr.push(along, a * 1.25);
    }
  }
  const nA = across.length;
  for (let i = 0; i + 1 < line.length; i++)
    for (let j = 0; j + 1 < nA; j++) {
      const a = i * nA + j;
      const b = a + nA;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aBrook', new BufferAttribute(new Float32Array(attr), 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new ShaderMaterial({
    vertexShader: BROOK_VERT,
    fragmentShader: BROOK_FRAG,
    uniforms: { ...atmosphere, ...u, uLen: { value: along } },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new Mesh(g, m);
  mesh.renderOrder = 1;
  mesh.userData.noShadow = true;
  mesh.name = 'quelle-brook';
  return mesh;
}

// ---------------------------------------------------------------- motes over the water

const MOTE_VERT = /* glsl */ `
attribute vec4 aMote; // x, z offset seed, phase, kind (0 over the water, 1 along the brook)
uniform float uMoteTime;
uniform float uPx;
uniform vec3 uCenter;
uniform float uBrookLen;
uniform float uReverse;
uniform float uGuide;
uniform float uMagic;
attribute vec3 aPath; // brook point (world) for kind 1
varying float vA;
varying float vHue;
void main() {
  float t = uMoteTime + aMote.z * 17.0;
  vec3 p;
  if (aMote.w < 0.5) {
    // hover over the water in slow loops
    float a = t * 0.35 + aMote.z * 6.28;
    p = uCenter + vec3(cos(a) * aMote.x, 0.25 + 0.35 * (0.5 + 0.5 * sin(t * 0.7 + aMote.z * 4.0)), sin(a * 1.3) * aMote.y);
    vA = 0.55 + 0.45 * sin(t * 2.3 + aMote.z * 9.0);
  } else {
    // drift along the brook (towards the spring when it runs backwards)
    p = aPath + vec3(sin(t * 0.9) * 0.15, 0.2 + 0.25 * sin(t * 0.6 + aMote.z * 5.0), cos(t * 0.8) * 0.15);
    vA = (0.35 + 0.65 * uReverse) * (0.5 + 0.5 * sin(t * 1.9));
  }
  vA *= clamp(uGuide * 0.8 + uMagic, 0.0, 1.0);
  vHue = aMote.z;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPx * (0.05 + 0.03 * fract(aMote.z * 7.0)) / max(0.5, -mv.z);
}
`;

const MOTE_FRAG = /* glsl */ `
varying float vA;
varying float vHue;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float a = exp(-r * r * 5.0) * vA;
  if (a < 0.01) discard;
  vec3 c = mix(vec3(0.55, 0.9, 1.0), vec3(1.0, 0.85, 0.5), step(0.7, fract(vHue * 3.7)));
  gl_FragColor = vec4(c * a * 1.6, a);
}
`;

export interface Motes {
  points: Points;
  material: ShaderMaterial;
  /** Re-seat the brook motes along `path` (world points) shifted by `offset` metres (signed flow). */
  flow(path: readonly Vector3[], offset: number): void;
}

/** ~36 motes over the water and ~24 along the brook. */
export function motes(center: Vector3, path: readonly Vector3[], u: WaterUniforms): Motes {
  const nWater = 36;
  const nBrook = 24;
  const n = nWater + nBrook;
  const aMote = new Float32Array(n * 4);
  const aPath = new Float32Array(n * 3);
  const pos = new Float32Array(n * 3);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const brook = i >= nWater;
    aMote[i * 4] = 0.25 + rnd() * 0.9;
    aMote[i * 4 + 1] = 0.15 + rnd() * 0.45;
    aMote[i * 4 + 2] = rnd();
    aMote[i * 4 + 3] = brook ? 1 : 0;
    pos[i * 3] = center.x;
    pos[i * 3 + 1] = center.y;
    pos[i * 3 + 2] = center.z;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aMote', new BufferAttribute(aMote, 4));
  const pathAttr = new BufferAttribute(aPath, 3);
  g.setAttribute('aPath', pathAttr);
  g.boundingSphere = null;
  const material = new ShaderMaterial({
    vertexShader: MOTE_VERT,
    fragmentShader: MOTE_FRAG,
    uniforms: {
      uMoteTime: { value: 0 },
      uPx: { value: 600 },
      uCenter: { value: center.clone() },
      uBrookLen: { value: path.length },
      uReverse: u.uReverse,
      uGuide: u.uGuide,
      uMagic: u.uMagic,
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(g, material);
  points.frustumCulled = false;
  points.renderOrder = 4;
  points.userData.noShadow = true;
  points.name = 'quelle-motes';
  const flow = (p: readonly Vector3[], offset: number) => {
    if (p.length < 2) return;
    const L = p.length - 1;
    for (let i = nWater; i < n; i++) {
      const k = i - nWater;
      // evenly spaced along the path, sliding with the flow, wrapping
      let s = ((k / nBrook) * L + offset * (0.7 + 0.6 * aMote[i * 4 + 2]!)) % L;
      if (s < 0) s += L;
      const j = Math.floor(s);
      const f = s - j;
      const a = p[j]!;
      const b = p[Math.min(L, j + 1)]!;
      aPath[i * 3] = a.x + (b.x - a.x) * f;
      aPath[i * 3 + 1] = a.y + (b.y - a.y) * f;
      aPath[i * 3 + 2] = a.z + (b.z - a.z) * f;
    }
    pathAttr.needsUpdate = true;
  };
  flow(path, 0);
  return { points, material, flow };
}
