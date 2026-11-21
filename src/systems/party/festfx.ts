/**
 * Materials and cheap effects of the party set (fest.ts): no three.js lights, no CPU particles
 * beyond the sparks; everything animates on the shared clock (`atmosphere.uTime`).
 *
 *  - `festPropMaterial`: the scenery prop material (vertex colours, world light, fog) plus up to
 *    `PARTY_LIGHTS` local warm point lights (the fire bowl, the fairy lights over the table, the
 *    table lantern). They only light the set's own props: the scenery shader is patched at its
 *    emissive hook; when the hook is missing it falls back to the plain prop material.
 *  - `flameMaterial`: cylindrical billboards for the fire bowl's tongues (ragged fbm, like the
 *    palace fire's), the candles in the lanterns (teardrop) and the gas burner (small blue crown).
 *  - `puffMaterial`: steam over the pots and a thin smoke over the fire bowl (soft billboards
 *    whose age loops on the clock).
 *  - `poolMaterial` + `drapedPool`: warm light pools draped on the terrain (additive).
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  Mesh,
  NormalBlending,
  ShaderMaterial,
  Vector3,
  Vector4,
} from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import { BILLBOARD_GLSL, quadInstanced } from '../fx/gl';
import { propMaterial } from '../scenery/material';

/** Local lights the set's prop material carries. */
export const PARTY_LIGHTS = 3;

/** The line of the scenery prop shader the local lights go in front of (tests check it is there). */
export const PROP_EMISSIVE_HOOK = '  if (vGlow > 0.0) {';
const PROP_UNIFORM_HOOK = 'uniform float uOpacity;';

const LIGHT_GLSL = /* glsl */ `
  // the party's warm local lights (fire bowl, fairy lights, table lantern)
  for (int i = 0; i < ${PARTY_LIGHTS}; i++) {
    vec3 ld = uPartyPos[i].xyz - vWp;
    float dl = length(ld);
    float at = clamp(1.0 - dl / max(uPartyPos[i].w, 1e-3), 0.0, 1.0);
    at *= at;
    col += vCol * uPartyCol[i] * at * (0.3 + 0.7 * max(dot(n, ld / max(dl, 1e-3)), 0.0));
  }
`;

export interface FestPropMaterial {
  material: ShaderMaterial;
  /** xyz = world position, w = radius (m); 0 radius = off. */
  pos: Vector4[];
  /** Linear colour × intensity. */
  col: Vector3[];
  /** The hook was found and the lights are in the shader. */
  lit: boolean;
}

/** The scenery prop material with the party's local lights. */
export function festPropMaterial(): FestPropMaterial {
  const m = propMaterial();
  const pos = Array.from({ length: PARTY_LIGHTS }, () => new Vector4(0, -1e4, 0, 0));
  const col = Array.from({ length: PARTY_LIGHTS }, () => new Vector3());
  const fs = m.fragmentShader;
  const lit = fs.includes(PROP_EMISSIVE_HOOK) && fs.includes(PROP_UNIFORM_HOOK);
  if (lit) {
    m.fragmentShader = fs
      .replace(PROP_UNIFORM_HOOK, `${PROP_UNIFORM_HOOK}\nuniform vec4 uPartyPos[${PARTY_LIGHTS}];\nuniform vec3 uPartyCol[${PARTY_LIGHTS}];`)
      .replace(PROP_EMISSIVE_HOOK, `${LIGHT_GLSL}${PROP_EMISSIVE_HOOK}`);
    m.uniforms.uPartyPos = { value: pos };
    m.uniforms.uPartyCol = { value: col };
  }
  return { material: m, pos, col, lit };
}

// ---- flames -------------------------------------------------------------------------------------

/** Flame kinds (aDim.z). */
export const FLAME = { fire: 0, candle: 1, gas: 2 } as const;

const FLAME_VERT = /* glsl */ `
${ATMOS_GLSL}
${BILLBOARD_GLSL}
attribute vec4 aFlame; // x, y, z, seed
attribute vec4 aDim;   // w, h, kind, lean
uniform float uFire;
varying vec2 vUv;
varying float vSeed;
varying float vKind;
varying float vFade;
void main() {
  float kind = aDim.z;
  float s = aFlame.w;
  float flick = 0.86 + 0.14 * sin(uTime * (2.3 + s * 2.0) + s * 40.0) + 0.08 * sin(uTime * 6.1 + s * 13.0);
  float k = kind < 0.5 ? uFire : 1.0;
  vec2 size = vec2(aDim.x * (0.75 + 0.25 * k), aDim.y * k * (kind < 1.5 ? flick : 1.0));
  vec3 p = kqBillboardUp(aFlame.xyz, position.xy, size, 0.0);
  // the tips lean and sway a little
  float bend = position.y * position.y * size.y;
  p.x += (aDim.w + 0.08 * sin(uTime * 1.7 + s * 9.0)) * bend * 0.25;
  p.z += 0.06 * cos(uTime * 1.3 + s * 5.0) * bend * 0.25;
  vUv = position.xy;
  vSeed = s;
  vKind = kind;
  float d = length(p - cameraPosition);
  vFade = exp(-d * uFogDensity * 0.7);
  gl_Position = size.y < 0.005 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FLAME_FRAG = /* glsl */ `
${ATMOS_GLSL}
varying vec2 vUv;
varying float vSeed;
varying float vKind;
varying float vFade;
void main() {
  float x = (vUv.x - 0.5) * 2.0;
  float y = vUv.y;
  float t = uTime;
  vec3 col;
  float a;
  if (vKind < 0.5) {
    // ragged tongues: the centre line sways, the width breathes, gaps tear through the tips
    float n = kqFbm(vec2(vUv.x * 2.4 + vSeed * 17.0, y * 1.8 - t * 2.2 - vSeed * 5.0));
    float n2 = kqNoise(vec2(vUv.x * 6.0 - vSeed * 3.0, y * 4.2 - t * 4.8));
    float xd = x + (n - 0.5) * 1.3 * y + sin(y * 6.0 - t * 6.5 + vSeed * 20.0) * 0.12 * y;
    float width = mix(0.9, 0.04, pow(y, 0.65)) * (0.6 + 0.8 * n);
    float shape = 1.0 - smoothstep(width * 0.35, width, abs(xd));
    shape *= smoothstep(0.0, 0.12, y);
    float top = 1.0 - smoothstep(0.25 + 0.5 * n, 0.95, y + (n2 - 0.5) * 0.3);
    float torn = smoothstep(0.15, 0.5, n2 + (1.0 - y) * 0.5);
    float heat = shape * top * torn * (0.6 + 0.6 * n2);
    if (heat < 0.02) discard;
    col = mix(vec3(0.8, 0.12, 0.02), vec3(1.0, 0.42, 0.06), smoothstep(0.1, 0.45, heat));
    col = mix(col, vec3(1.0, 0.82, 0.45), smoothstep(0.5, 0.95, heat * (1.15 - y * 0.6)));
    a = heat * (1.0 + 1.3 * (1.0 - y));
  } else if (vKind < 1.5) {
    // candle: a small teardrop, white core, orange rim
    float wob = sin(t * 11.0 + vSeed * 30.0) * 0.05;
    float px = x + wob * y;
    float w = mix(0.75, 0.1, clamp(y * 1.15, 0.0, 1.0));
    float d = length(vec2(px / w, (y - 0.32) * 1.6));
    float core = smoothstep(1.0, 0.15, d);
    if (core < 0.02) discard;
    col = mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.92, 0.7), smoothstep(0.35, 0.9, core));
    a = core * 1.8;
  } else {
    // gas: a low blue crown with an orange flicker at the tips
    float n = kqNoise(vec2(vUv.x * 9.0 + vSeed * 7.0, y * 3.0 - t * 9.0));
    float shape = (1.0 - smoothstep(0.55, 1.0, abs(x))) * (1.0 - smoothstep(0.2 + 0.5 * n, 1.0, y));
    if (shape < 0.03) discard;
    col = mix(vec3(0.15, 0.35, 1.0), vec3(1.0, 0.55, 0.2), smoothstep(0.55, 0.95, y + n * 0.3));
    a = shape * 0.9;
  }
  gl_FragColor = vec4(col * a * vFade, 1.0);
}
`;

export interface FlameSpec {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  kind: number;
  seed: number;
  lean?: number;
}

/** One instanced mesh for every flame of the set (additive). `uFire` scales the fire tongues. */
export function flameMesh(flames: readonly FlameSpec[]): Mesh {
  const g = quadInstanced();
  const a = new Float32Array(flames.length * 4);
  const d = new Float32Array(flames.length * 4);
  flames.forEach((f, i) => {
    a.set([f.x, f.y, f.z, f.seed], i * 4);
    d.set([f.w, f.h, f.kind, f.lean ?? 0], i * 4);
  });
  g.setAttribute('aFlame', new InstancedBufferAttribute(a, 4));
  g.setAttribute('aDim', new InstancedBufferAttribute(d, 4));
  g.instanceCount = flames.length;
  const m = new ShaderMaterial({
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    uniforms: { ...atmosphere, uFire: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const mesh = new Mesh(g, m);
  mesh.name = 'party-flames';
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  return mesh;
}

// ---- steam and smoke ----------------------------------------------------------------------------

const PUFF_VERT = /* glsl */ `
${ATMOS_GLSL}
attribute vec4 aSrc;   // x, y, z, rise (m over a life)
attribute vec4 aSeed;  // phase, side, size, life (s)
attribute vec4 aCol;   // rgb, alpha
varying vec2 vUv;
varying float vAge;
varying float vSeed;
varying vec4 vCol;
varying vec3 vWp;
void main() {
  float age = fract(uTime / aSeed.w + aSeed.x);
  vec3 c = aSrc.xyz;
  c.y += age * aSrc.w;
  // a slow drift, wider as it rises
  c.x += (sin(uTime * 0.8 + aSeed.x * 20.0) * 0.5 + (aSeed.y - 0.5)) * age * aSrc.w * 0.35;
  c.z += cos(uTime * 0.7 + aSeed.x * 13.0) * age * aSrc.w * 0.18;
  float size = aSeed.z * (0.45 + age * 1.9);
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float rot = aSeed.x * 6.28 + uTime * 0.3 * (aSeed.y - 0.5);
  vec2 q = position.xy - 0.5;
  q = vec2(q.x * cos(rot) - q.y * sin(rot), q.x * sin(rot) + q.y * cos(rot));
  mv.xy += q * size;
  vUv = position.xy;
  vAge = age;
  vSeed = aSeed.x;
  vCol = aCol;
  vWp = c;
  gl_Position = projectionMatrix * mv;
}
`;

const PUFF_FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform vec3 uWarm;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
varying vec4 vCol;
varying vec3 vWp;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float n = kqFbm(vUv * 2.2 + vec2(vSeed * 9.0, vAge * 1.5 - uTime * 0.08));
  float a = 1.0 - smoothstep(0.25, 1.0, r + (n - 0.5) * 0.7);
  a *= smoothstep(0.0, 0.12, vAge) * (1.0 - smoothstep(0.35, 1.0, vAge)) * vCol.a;
  if (a < 0.004) discard;
  // lit by the sky and the party's warm light
  vec3 col = vCol.rgb * (uSkyAmbient * 0.75 + uSunColor * 0.12 + uWarm);
  gl_FragColor = vec4(kqFog(col, vWp), a);
}
`;

export interface PuffSource {
  x: number;
  y: number;
  z: number;
  /** Rise over one life (m). */
  rise: number;
  count: number;
  /** Puff size (m). */
  size: number;
  /** Life (s). */
  life: number;
  /** sRGB colour and alpha. */
  color: number;
  alpha: number;
  /** Spread of the start points (m). */
  spread?: number;
}

/** One instanced mesh for the steam and smoke columns (normal blending, no depth write). */
export function puffMesh(sources: readonly PuffSource[], seed: () => number): Mesh {
  const g = quadInstanced();
  const src: number[] = [];
  const sd: number[] = [];
  const cl: number[] = [];
  const c = new Color();
  for (const s of sources) {
    c.setHex(s.color).convertSRGBToLinear();
    for (let i = 0; i < s.count; i++) {
      const f = seed();
      const sp = s.spread ?? 0;
      src.push(s.x + (seed() - 0.5) * sp, s.y, s.z + (seed() - 0.5) * sp, s.rise * (0.8 + 0.4 * seed()));
      sd.push(i / s.count + f * 0.05, seed(), s.size * (0.75 + 0.5 * seed()), s.life * (0.85 + 0.3 * seed()));
      cl.push(c.r, c.g, c.b, s.alpha);
    }
  }
  const n = src.length / 4;
  g.setAttribute('aSrc', new InstancedBufferAttribute(new Float32Array(src), 4));
  g.setAttribute('aSeed', new InstancedBufferAttribute(new Float32Array(sd), 4));
  g.setAttribute('aCol', new InstancedBufferAttribute(new Float32Array(cl), 4));
  g.instanceCount = n;
  const m = new ShaderMaterial({
    vertexShader: PUFF_VERT,
    fragmentShader: PUFF_FRAG,
    uniforms: { ...atmosphere, uWarm: { value: new Vector3(0.42, 0.3, 0.18) } },
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  });
  const mesh = new Mesh(g, m);
  mesh.name = 'party-steam';
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  return mesh;
}

// ---- light pools on the ground ------------------------------------------------------------------

const POOL_VERT = /* glsl */ `
attribute vec4 aPool;  // u, v (−1..1 across the pool), intensity, flicker
attribute vec4 aTint;  // linear rgb, fire (scales with uFire)
uniform float uFire;
varying vec4 vPool;
varying vec3 vTint;
varying float vFade;
varying vec3 vWp;
void main() {
  vPool = aPool;
  vTint = aTint.rgb * mix(1.0, uFire, aTint.a);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vFade = 1.0 - smoothstep(120.0, 260.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const POOL_FRAG = /* glsl */ `
uniform float uTime;
varying vec4 vPool;
varying vec3 vTint;
varying float vFade;
varying vec3 vWp;
void main() {
  float r2 = dot(vPool.xy, vPool.xy);
  float a = exp(-r2 * 3.2) * (1.0 - smoothstep(0.7, 1.0, sqrt(r2)));
  float fl = 1.0 - vPool.w * (0.16 + 0.1 * sin(uTime * 7.1 + vWp.x * 0.7) * sin(uTime * 4.3 + 1.7));
  a *= vPool.z * fl * vFade;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vTint * a, a);
}
`;

export interface PoolSpec {
  x: number;
  z: number;
  /** Half extents (m) along the pool's own axes, and its yaw. */
  rx: number;
  rz: number;
  yaw?: number;
  /** sRGB colour, intensity, flicker 0..1, scales with the fire. */
  color: number;
  intensity: number;
  flicker?: number;
  fire?: boolean;
}

/**
 * The pools as grids draped on the ground (`heightAt` + 4 cm) in one geometry; `n` cells per side.
 */
export function drapedPools(pools: readonly PoolSpec[], heightAt: (x: number, z: number) => number, n: number): BufferGeometry {
  const pos: number[] = [];
  const pool: number[] = [];
  const tint: number[] = [];
  const c = new Color();
  for (const p of pools) {
    c.setHex(p.color).convertSRGBToLinear();
    const cs = Math.cos(p.yaw ?? 0);
    const sn = Math.sin(p.yaw ?? 0);
    const vert = (u: number, v: number) => {
      const lx = u * p.rx;
      const lz = v * p.rz;
      const x = p.x + lx * cs + lz * sn;
      const z = p.z - lx * sn + lz * cs;
      const h = heightAt(x, z);
      pos.push(x, (Number.isFinite(h) ? h : 0) + 0.04, z);
      pool.push(u, v, p.intensity, p.flicker ?? 0);
      tint.push(c.r, c.g, c.b, p.fire ? 1 : 0);
    };
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const u0 = -1 + (2 * i) / n;
        const u1 = -1 + (2 * (i + 1)) / n;
        const v0 = -1 + (2 * j) / n;
        const v1 = -1 + (2 * (j + 1)) / n;
        vert(u0, v0);
        vert(u0, v1);
        vert(u1, v1);
        vert(u0, v0);
        vert(u1, v1);
        vert(u1, v0);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aPool', new BufferAttribute(new Float32Array(pool), 4));
  g.setAttribute('aTint', new BufferAttribute(new Float32Array(tint), 4));
  g.computeBoundingSphere();
  return g;
}

/** Additive light pools draped on the terrain (aPool / aTint). */
export function festPoolMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: POOL_VERT,
    fragmentShader: POOL_FRAG,
    uniforms: { uTime: atmosphere.uTime, uFire: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}
