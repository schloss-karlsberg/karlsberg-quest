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
  CanvasTexture,
  Sprite,
  SpriteMaterial,
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
import { BROOK_HALF, BROOK_REF, meshGround, type QuelleLook, type WaterSpec } from './layout';

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
    /** The brook's bed (linear albedos): wet earth, pebbles, the moss of its banks. */
    uBedCol: { value: new Color(0.07, 0.04, 0.026) },
    uPebCol: { value: new Color(0.16, 0.12, 0.1) },
    uMossCol: { value: new Color(0.05, 0.08, 0.025) },
  };
}
export type WaterUniforms = ReturnType<typeof waterUniforms>;

/** Era looks of the water. */
export function applyLook(u: WaterUniforms, look: QuelleLook): void {
  const deep: Record<QuelleLook, [number, number, number]> = {
    today: [0.03, 0.05, 0.04],
    baroque: [0.06, 0.2, 0.22],
    winter: [0.05, 0.09, 0.12],
    fire: [0.05, 0.08, 0.1],
    ruin: [0.1, 0.13, 0.08],
  };
  const d = deep[look];
  u.uDeep.value.setRGB(d[0], d[1], d[2]);
  u.uIce.value = look === 'winter' ? 1 : 0;
  u.uMurk.value = look === 'ruin' ? 1 : look === 'today' ? 0.25 : 0;
  // the bed: red-brown wet earth in the beech wood, dark meadow earth in the open past, snow in February 1793
  const bed: Record<QuelleLook, [number, number, number][]> = {
    today: [[0.06, 0.034, 0.022], [0.1, 0.075, 0.06], [0.04, 0.06, 0.02]],
    baroque: [[0.055, 0.042, 0.03], [0.2, 0.16, 0.12], [0.05, 0.085, 0.022]],
    winter: [[0.34, 0.38, 0.48], [0.1, 0.1, 0.12], [0.3, 0.34, 0.42]],
    fire: [[0.055, 0.042, 0.03], [0.2, 0.16, 0.12], [0.05, 0.085, 0.022]],
    ruin: [[0.06, 0.045, 0.03], [0.15, 0.12, 0.09], [0.07, 0.075, 0.03]],
  };
  const [bc, pc, mc] = bed[look];
  u.uBedCol.value.setRGB(...bc!);
  u.uPebCol.value.setRGB(...pc!);
  u.uMossCol.value.setRGB(...mc!);
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
  float leaf = step(0.86, kqNoise(p * 15.0 + 3.1)) * uMurk;
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

// ---------------------------------------------------------------- ground ribbons (brook, trail)

/** A ribbon sample: world x/z and half width (m). */
export interface RibbonPoint {
  x: number;
  z: number;
  half: number;
}

/**
 * Append a ribbon along `pts` to the arrays, draped on the terrain *mesh* (`meshGround`: the
 * triangles as drawn, not the bilinear patch) at every vertex, `lift(f)` m above it (f = −1…1
 * across). `aRib` = (m along, m across); normals from the terrain gradient (smooth, like the
 * terrain's own shading).
 */
function ribbon(
  out: { pos: number[]; nor: number[]; rib: number[]; idx: number[] },
  pts: readonly RibbonPoint[],
  heightAt: (x: number, z: number) => number,
  across: readonly number[],
  lift: (f: number) => number,
): number {
  if (pts.length < 2) return 0;
  const base = out.pos.length / 3;
  let along = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    if (i > 0) along += Math.hypot(p.x - pts[i - 1]!.x, p.z - pts[i - 1]!.z);
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    let tx = b.x - a.x;
    let tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    for (const f of across) {
      const off = f * p.half;
      const px = p.x - tz * off;
      const pz = p.z + tx * off;
      out.pos.push(px, meshGround(heightAt, px, pz) + lift(f), pz);
      const gx = (heightAt(px + 1, pz) - heightAt(px - 1, pz)) / 2;
      const gz = (heightAt(px, pz + 1) - heightAt(px, pz - 1)) / 2;
      const nl = Math.hypot(gx, 1, gz);
      out.nor.push(-gx / nl, 1 / nl, -gz / nl);
      out.rib.push(along, off);
    }
  }
  const nA = across.length;
  for (let i = 0; i + 1 < pts.length; i++)
    for (let j = 0; j + 1 < nA; j++) {
      const a = base + i * nA + j;
      const b = a + nA;
      out.idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  return along;
}

function ribbonGeometry(out: { pos: number[]; nor: number[]; rib: number[]; idx: number[] }): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(out.pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(out.nor), 3));
  g.setAttribute('aRib', new BufferAttribute(new Float32Array(out.rib), 2));
  g.setIndex(out.idx);
  g.computeBoundingSphere();
  return g;
}

const RIBBON_VERT = /* glsl */ `
attribute vec2 aRib; // metres along, metres across
varying vec2 vB;
varying vec3 vWp;
varying vec3 vN;
void main() {
  vB = aRib;
  vN = normal;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// ---------------------------------------------------------------- the brook down the ravine

const BROOK_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
${COMMON}
uniform float uLen;
uniform float uPulse;
uniform vec3 uBedCol;
uniform vec3 uPebCol;
uniform vec3 uMossCol;
varying vec2 vB;
varying vec3 vWp;
varying vec3 vN;
void main() {
  float along = vB.x;
  vec2 p = vWp.xz;
  // the thread of water wanders a little inside its bed
  float mea = (kqNoise(vec2(along * 0.31, 1.7)) - 0.5) * 0.22 + (kqNoise(vec2(along * 1.3, 5.3)) - 0.5) * 0.07;
  float x = vB.y - mea;
  float ax = abs(x);
  // the wet bed: ragged banks, wider in the little pools, never a band with parallel edges
  float grow = min(along / 18.0, 1.0);
  float bw = 0.3 + 0.2 * kqNoise(vec2(along * 0.45, 3.3)) + 0.14 * grow;
  float rag = (kqNoise(p * 2.7) - 0.5) * 0.26 + (kqNoise(p * 7.3 + 3.0) - 0.5) * 0.12;
  float bed = 1.0 - smoothstep(bw * 0.3, bw + 0.06, ax + rag);
  // the end of the drawn stretch fades into the ravine, the start out of the overflow
  float fade = smoothstep(uLen, uLen - 6.0, along) * smoothstep(0.0, 0.5, along);
  float aBed = bed * fade;
  if (aBed < 0.01) discard;
  // the water: a thread of a few centimetres, broken where only wet stones show, small pools
  float pool = smoothstep(0.62, 0.85, kqNoise(vec2(along * 0.22, 11.0)));
  float tw = 0.03 + 0.06 * kqNoise(vec2(along * 0.9, 7.9)) + pool * 0.12 + grow * 0.03;
  float run = mix(smoothstep(0.2, 0.42, kqNoise(vec2(along * 0.55, 9.1))), 1.0, pool);
  float core = (1.0 - smoothstep(tw * 0.45, tw + 0.035, ax + (kqNoise(p * 6.0) - 0.5) * 0.05)) * run;
  // flow: ripples and glints running downhill (uPhase forward), standing, or climbing back
  float f = uPhase * 1.8;
  float r1 = kqNoise(vec2(x * 9.0, along * 3.0 - f * 2.6));
  float r2 = kqNoise(vec2(x * 17.0 + 4.0, along * 6.0 - f * 4.2));
  vec3 n = normalize(vec3((r1 - 0.5) * 0.22, 1.0, (r2 - 0.5) * 0.22));
  // the bed: wet earth with pebbles, moss creeping in from the banks
  float peb = smoothstep(0.56, 0.7, kqNoise(p * 9.0)) * (0.55 + 0.45 * kqNoise(p * 3.1 + 7.0));
  vec3 earth = mix(uBedCol, uPebCol, peb);
  earth = mix(earth, uMossCol, smoothstep(0.45, 0.95, ax / bw) * smoothstep(0.35, 0.7, kqNoise(p * 1.9 + 2.0)));
  vec3 lit = kqLight(earth, normalize(vN), vWp, 1.0, 1.0);
  // what it mirrors: the dark wood around it under the beeches, a little sky in the open; never a pale pipe
  vec3 v = normalize(uCamPos - vWp);
  float fres = 0.03 + 0.3 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
  vec3 refl = mix(uFogColor * 0.4 + uSkyAmbient * 0.4, vec3(0.05, 0.06, 0.05) + uSkyAmbient * 0.35, uUnderCanopy);
  float sh = kqShadow(vWp, vec3(0.0, 1.0, 0.0));
  vec3 rr = reflect(-v, n);
  // the sun glitters on ripple crests only: a low sun down the brook makes broken sparkles, not a lit tube
  float spec = pow(max(dot(rr, uSunDir), 0.0), 90.0) * sh * smoothstep(0.5, 0.8, r2);
  // a few sparkles on the thread, not a white line
  float glint = pow(clamp(r1 * r2 * 1.45, 0.0, 1.0), 9.0);
  float lat = clamp(1.0 - length(uLanternPos - vWp) / uLanternRadius, 0.0, 1.0);
  vec3 water = lit * 0.4 + refl * fres + (uSunColor * (spec * 0.7 + glint * 0.3 * sh) + uLantern * glint * 0.15 * lat) * (1.0 - uIce);
  water += uGlowColor * (fres * 0.25 + glint * 0.06);
  // foam flecks where the thread runs over stones
  float foam = smoothstep(0.8, 0.96, r2 * 0.65 + peb * 0.5) * (1.0 - uIce) * (1.0 - pool);
  water += vec3(0.6, 0.65, 0.66) * foam * 0.14 * (uSkyAmbient + uSunColor * 0.5);
  // the wet bed round the thread: darker, glossy stones
  vec3 wetBed = lit * mix(0.55, 0.85, smoothstep(0.5, 1.0, ax / bw)) + refl * fres * 0.12 + uSunColor * spec * peb * 0.08;
  vec3 col = mix(wetBed, water, core);
  // magic: the thread lights up, sparks and pulses of light run with the flow (and back up); the
  // pulse train is stretched to the drawn length (uPulse), so the pulses cross the whole brook in
  // the time they took on the shorter brook they were tuned on and the run-back does not drag
  float caust = clamp(r1 * r2 * 2.0, 0.0, 1.0);
  float pulse = pow(0.5 + 0.5 * sin(along * 1.3 / uPulse - f * 3.2), 6.0);
  vec3 magic = vec3(0.35, 0.8, 1.0) * (0.3 + 0.7 * caust) + vec3(1.0, 0.82, 0.45) * pow(caust, 5.0) * 2.0;
  col += magic * (uMagic * (core * 0.9 + bed * (0.04 + 0.28 * pulse)) + uGuide * 0.1 * core);
  // ice in the winter night, leaves in 1796
  vec3 ice = kqLight(vec3(0.62, 0.7, 0.78), vec3(0.0, 1.0, 0.0), vWp, 1.0, 1.0) + refl * fres;
  col = mix(col, ice, uIce * core * 0.9);
  float leaf = step(0.8, kqNoise(p * 5.0 + 1.3)) * uMurk;
  col = mix(col, vec3(0.3, 0.19, 0.08) * (uSkyAmbient + uSunColor * 0.4), leaf * 0.6 * (1.0 - core * 0.5));
  gl_FragColor = vec4(kqFog(col, vWp), aBed * mix(0.82, 0.96, core));
}
`;

/**
 * How far the touch scene's light pulses on the brook are stretched for a drawn length of `len` m
 * (spacing and speed both, so a pulse crosses the whole brook in the same time; never shorter).
 */
export function brookPulse(len: number): number {
  return Math.max(1, len / BROOK_REF);
}

/**
 * The Karlsbergbach: a wet bed with a thread of water along `line` (world xz), draped on the
 * terrain mesh. The ribbon is wider than the bed so its banks fade out raggedly.
 */
export function brookMesh(line: readonly [number, number][], heightAt: (x: number, z: number) => number, u: WaterUniforms): Mesh | null {
  if (line.length < 3) return null;
  // resample to ~0.4 m so the ribbon follows the terrain triangles closely
  const pts: RibbonPoint[] = [];
  let along = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i]!;
    const [bx, bz] = line[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / 0.4));
    for (let s = 0; s < n; s++) {
      const t = s / n;
      pts.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, half: BROOK_HALF - 0.3 + Math.min(1, (along + len * t) / 16) * 0.3 });
    }
    along += len;
  }
  const [lx, lz] = line[line.length - 1]!;
  pts.push({ x: lx, z: lz, half: BROOK_HALF });
  const out = { pos: [] as number[], nor: [] as number[], rib: [] as number[], idx: [] as number[] };
  const len = ribbon(out, pts, heightAt, [-1, -0.7, -0.45, -0.22, 0, 0.22, 0.45, 0.7, 1], (f) => 0.025 + (1 - Math.abs(f)) * 0.01);
  const m = new ShaderMaterial({
    vertexShader: RIBBON_VERT,
    fragmentShader: BROOK_FRAG,
    uniforms: { ...atmosphere, ...u, uLen: { value: len }, uPulse: { value: brookPulse(len) } },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new Mesh(ribbonGeometry(out), m);
  mesh.renderOrder = 1;
  mesh.userData.noShadow = true;
  mesh.name = 'quelle-brook';
  return mesh;
}

// ---------------------------------------------------------------- the trail to the spring

const TRAIL_VERT = /* glsl */ `
attribute vec2 aRib;
attribute vec2 aHalf; // half width (m), distance to the strand's nearer end in fade lengths
varying vec2 vB;
varying float vHalf;
varying float vEnd;
varying vec3 vWp;
varying vec3 vN;
void main() {
  vB = aRib;
  vHalf = aHalf.x;
  vEnd = aHalf.y;
  vN = normal;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const TRAIL_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
uniform vec3 uSand;
uniform vec3 uSand2;
uniform float uLeaves;
uniform float uPatchy;
uniform float uTrodden;
varying vec2 vB;
varying float vHalf;
varying float vEnd;
varying vec3 vWp;
varying vec3 vN;
void main() {
  vec2 p = vWp.xz;
  // across in half widths (1 = the nominal edge; the ribbon reaches a little further for the fade)
  float a = abs(vB.y) / max(0.3, vHalf);
  float rag = (kqNoise(p * 1.3) - 0.5) * 0.5 + (kqNoise(p * 4.1 + 2.0) - 0.5) * 0.25;
  float edge = 1.0 - smoothstep(0.4, 0.95, a + rag * 0.55);
  // the strand's ends fade into the forest floor
  edge *= smoothstep(0.0, 1.0, vEnd + rag * 0.3);
  // 1796: the grass takes the trail back in patches
  edge *= mix(1.0, smoothstep(0.28, 0.62, kqNoise(p * 0.8 + 5.0)), uPatchy);
  if (edge < 0.01) discard;
  float n1 = kqNoise(p * 1.9);
  float n2 = kqNoise(p * 8.0 + 1.0);
  vec3 alb = mix(uSand, uSand2, smoothstep(0.25, 0.75, n1)) * (0.88 + 0.24 * n2);
  // the trodden middle is smoother and a touch lighter
  alb *= mix(0.9, 1.06, 1.0 - smoothstep(0.0, 0.6, a));
  // small stones, roots and leaves
  float peb = smoothstep(0.72, 0.82, kqNoise(p * 12.0 + 5.0));
  alb = mix(alb, alb * 1.3 + 0.015, peb * 0.55);
  float leaf = smoothstep(0.7, 0.76, kqNoise(p * 6.5 + 3.0)) * uLeaves * (0.6 + 0.4 * smoothstep(0.2, 0.9, a));
  alb = mix(alb, vec3(0.26, 0.11, 0.035) * (0.7 + 0.6 * n2), leaf * 0.75);
  // winter: trodden snow with footprints, a little earth where it is worn through
  float step1 = kqNoise(vec2(vB.x * 2.6, vB.y * 2.2 + 3.0));
  vec3 snow = vec3(0.6, 0.66, 0.78) * (0.86 + 0.14 * n2) * mix(1.0, 0.82, smoothstep(0.6, 0.75, step1));
  snow = mix(snow, uSand * 0.8, smoothstep(0.78, 0.9, kqNoise(p * 2.2 + 9.0)) * (1.0 - smoothstep(0.0, 0.5, a)) * 0.6);
  alb = mix(alb, snow, uTrodden);
  vec3 col = kqLight(alb, normalize(vN), vWp, 1.0, 1.0);
  gl_FragColor = vec4(kqFog(col, vWp), edge * 0.94);
}
`;

/** Trail looks per era (linear albedos): sand, its second tone, leaves, patchiness, snow. */
const TRAIL_LOOK: Record<QuelleLook, { sand: [number, number, number]; sand2: [number, number, number]; leaves: number; patchy: number; trodden: number }> = {
  // the red Buntsandstein sand of the reference photo, leaf litter on it
  today: { sand: [0.17, 0.092, 0.066], sand2: [0.21, 0.12, 0.085], leaves: 1, patchy: 0, trodden: 0 },
  // a kept path of pale red sand
  baroque: { sand: [0.3, 0.16, 0.1], sand2: [0.36, 0.22, 0.14], leaves: 0, patchy: 0, trodden: 0 },
  winter: { sand: [0.2, 0.1, 0.07], sand2: [0.24, 0.13, 0.09], leaves: 0, patchy: 0, trodden: 1 },
  fire: { sand: [0.3, 0.16, 0.1], sand2: [0.36, 0.22, 0.14], leaves: 0, patchy: 0, trodden: 0 },
  // nobody keeps it any more
  ruin: { sand: [0.22, 0.12, 0.075], sand2: [0.26, 0.15, 0.09], leaves: 0.6, patchy: 1, trodden: 0 },
};

/** The trail strands (world samples with half widths) as one soft-edged ground decal in the era's look. */
export function trailMesh(strands: readonly (readonly RibbonPoint[])[], heightAt: (x: number, z: number) => number, look: QuelleLook): Mesh | null {
  const out = { pos: [] as number[], nor: [] as number[], rib: [] as number[], idx: [] as number[] };
  const halves: number[] = [];
  for (const s of strands) {
    const start = out.rib.length / 2;
    const total = ribbon(out, s, heightAt, [-1.15, -0.75, -0.4, 0, 0.4, 0.75, 1.15], () => 0.022);
    // the shader needs the half width where it is and how far the strand's ends are (they fade)
    const fadeLen = Math.max(0.3, Math.min(3, total * 0.2));
    for (let i = start; i < out.rib.length / 2; i++) {
      const al = out.rib[i * 2]!;
      halves.push(s[Math.floor((i - start) / 7)]!.half, Math.min(al, total - al) / fadeLen);
    }
  }
  if (!out.idx.length) return null;
  const g = ribbonGeometry(out);
  g.setAttribute('aHalf', new BufferAttribute(new Float32Array(halves), 2));
  const L = TRAIL_LOOK[look];
  const m = new ShaderMaterial({
    vertexShader: TRAIL_VERT,
    fragmentShader: TRAIL_FRAG,
    uniforms: {
      ...atmosphere,
      uSand: { value: new Color(...L.sand) },
      uSand2: { value: new Color(...L.sand2) },
      uLeaves: { value: L.leaves },
      uPatchy: { value: L.patchy },
      uTrodden: { value: L.trodden },
    },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new Mesh(g, m);
  mesh.renderOrder = 0;
  mesh.userData.noShadow = true;
  mesh.name = 'quelle-trail';
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
    vA = (0.6 + 0.4 * uReverse) * (0.55 + 0.45 * sin(t * 1.9));
  }
  vA *= clamp(uGuide * 0.8 + uMagic, 0.0, 1.0);
  vHue = aMote.z;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPx * (0.07 + 0.05 * fract(aMote.z * 7.0)) / max(0.5, -mv.z);
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

/** ~36 motes over the water and ~24 along every 46 m of the brook (`path`: about a point per metre). */
export function motes(center: Vector3, path: readonly Vector3[], u: WaterUniforms): Motes {
  const nWater = 36;
  const nBrook = Math.round(24 * brookPulse(path.length));
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

// ---------------------------------------------------------------- the glow over the water

/** A soft column of light over the water (the place calling from afar; bright while time stands still). */
export function glowSprite(): Sprite {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let tex: CanvasTexture | null = null;
  if (c) {
    c.width = 64;
    c.height = 128;
    const g = c.getContext('2d');
    if (g) {
      // an ellipse that fades to nothing before the canvas edge (no visible quad), brightest low down
      g.scale(1, 2);
      const grd = g.createRadialGradient(32, 42, 0, 32, 36, 31);
      grd.addColorStop(0, 'rgba(220,245,255,0.9)');
      grd.addColorStop(0.3, 'rgba(130,205,255,0.4)');
      grd.addColorStop(0.7, 'rgba(70,150,255,0.1)');
      grd.addColorStop(1, 'rgba(60,140,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    }
    tex = new CanvasTexture(c);
  }
  const m = new SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0 });
  const sp = new Sprite(m);
  sp.renderOrder = 5;
  sp.userData.noShadow = true;
  sp.name = 'quelle-glow';
  return sp;
}
