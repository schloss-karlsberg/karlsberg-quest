/**
 * Visuals of the fight (visual only — reads the simulation, never writes to it):
 *  - spectral bodies from bodies.ts: depth-sorted smoke / mist billboards (fbm shader, lit by the
 *    moon and the lantern, fogged like the world but keeping their silhouette to ~50 m), additive
 *    glows with a minimum on-screen size (eyes, cores, cracks pierce the fog) and instanced solid
 *    pieces (paper, straw, sandstone, the ledger's covers);
 *  - telegraph poses (rear back, swell, arms up, eyes flare) and ground rings that fill up;
 *  - projectiles, the Bannlicht cone on the ground, gebannt rings;
 *  - particles: hit puffs / sparks / scraps / chips by family and the dissolve (mist, sparks, smoke,
 *    ash, paper, rising grit) — counts follow the quality preset. Nothing bleeds; nothing stays.
 *
 * Four draw calls for everything (puffs, glows, solids, rings), all instanced.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  DynamicDrawUsage,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  NormalBlending,
  BackSide,
  DoubleSide,
  type PerspectiveCamera,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { ELITES } from '../../rpg/enemies';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import type { AssetLoader } from '../../assets/loader';
import { type BodyPart, type BodyTemplate, bodyTemplate } from './bodies';
import { EnemyRigs } from './rigged';
import type { Enemy, Projectile, Ring } from './sim';

// ---- shaders ------------------------------------------------------------------------------------

const PUFF_VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iData;  // size, alpha, seed, style (0 smoke, 1 pale mist)
attribute vec3 iAlb;
attribute vec3 iEm;
uniform float uTime;
varying vec2 vUv;
varying vec4 vData;
varying vec3 vAlb;
varying vec3 vEm;
varying vec3 vWorld;
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float rot = iData.z * 6.2831 + uTime * (fract(iData.z * 7.31) - 0.5) * 0.7;
  float c = cos(rot);
  float s = sin(rot);
  vec2 q = mat2(c, -s, s, c) * position.xy;
  vec3 wp = iPos + (right * q.x + up * q.y) * iData.x;
  vUv = position.xy;
  vData = iData;
  vAlb = iAlb;
  vEm = iEm;
  vWorld = iPos;
  float vd = -(viewMatrix * vec4(iPos, 1.0)).z;
  // big puffs (boss smoke, mist) fade out before the camera sits inside them
  vData.y *= smoothstep(0.35, 1.1 + iData.x * 1.4, vd);
  gl_Position = vData.y <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const PUFF_FRAG = /* glsl */ `
${ATMOS_GLSL}
varying vec2 vUv;
varying vec4 vData;
varying vec3 vAlb;
varying vec3 vEm;
varying vec3 vWorld;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float n = kqFbm(vUv * 1.6 + vData.z * 31.0 + vec2(uTime * 0.25, -uTime * 0.4));
  float edge = r * (0.72 + 0.7 * n);
  float a;
  vec3 col;
  vec3 toCam = normalize(uCamPos - vWorld);
  vec3 N = normalize(mix(toCam, vec3(0.0, 1.0, 0.0), 0.45) + vec3(vUv.x, vUv.y, 0.0) * 0.25);
  if (vData.w < 0.5) {
    a = smoothstep(1.0, 0.3, edge) * vData.y;
    col = kqLight(vAlb * (0.7 + 0.6 * n), N, vWorld, 1.0, 1.0);
  } else {
    a = smoothstep(1.0, 0.05, edge);
    a = a * a * vData.y * (0.72 + 0.28 * n);
    // luminous mist: lit, plus a little of its own pale light (reads at night); a darker core
    col = kqLight(vAlb * (0.68 + 0.5 * n), N, vWorld, 1.0, 1.0) * (0.75 + 0.25 * edge) + vAlb * 0.1 + uFogColor * 0.12;
  }
  col += vEm * (1.0 - r) * (1.0 - r) * 1.4;
  float dist = length(vWorld - uCamPos);
  col = mix(kqFog(col, vWorld), col, 0.9 * (1.0 - smoothstep(45.0, 110.0, dist)));
  // a rim that contrasts with the era's fog on the ragged edge: dark on pale fog (1796 beige,
  // snow, day), fog-lit and pale in the dark (night, fire smoke) — the silhouette always reads
  float rim = smoothstep(0.5, 0.82, edge) * (1.0 - smoothstep(0.82, 1.0, edge));
  float fogL = dot(uFogColor, vec3(0.299, 0.587, 0.114));
  vec3 rimC = fogL > 0.38 ? vec3(0.03, 0.025, 0.03) : uFogColor * 1.3 + vec3(0.07, 0.075, 0.09);
  // round 6 readability: a firmer ink edge where the ground and fog are bright (sand, snow, day) —
  // the smoke bodies' silhouette holds against a pale backdrop at any distance
  float bright = fogL > 0.38 ? 1.0 : 0.0;
  col = mix(col, rimC + vEm * 0.3, rim * (vData.w > 0.5 ? 0.42 + 0.14 * bright : 0.6 + 0.2 * bright));
  if (vData.w < 0.5) a = max(a, rim * 0.5 * bright * vData.y);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`;

const GLOW_VERT = /* glsl */ `
${ATMOS_GLSL}
attribute vec3 iPos;
attribute vec4 iData; // size, intensity, min px, aspect
attribute vec3 iCol;
uniform float uPixel;
varying vec2 vUv;
varying vec3 vCol;
varying float vI;
varying float vFog;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float dist = max(0.05, -mv.z);
  float size = max(iData.x, iData.z * uPixel * dist);
  mv.xy += position.xy * size * vec2(iData.w, 1.0);
  vUv = position.xy;
  vCol = iCol;
  vI = iData.y;
  vec3 v = iPos - uCamPos;
  float d = length(v);
  float hAvg = (iPos.y + uCamPos.y) * 0.5;
  float hf = uFogHeightDensity * exp(-max(hAvg - uFogBase, 0.0) / uFogFalloff);
  vFog = 1.0 - exp(-d * (uFogDensity + hf) - min(d, 260.0) * uUnderCanopy * uForestFog);
  // eyes and cores (min px ≥ 4) burn through the fog: they are how an enemy is found at 30 m
  vFog *= iData.z >= 4.0 ? 0.55 : 1.0;
  gl_Position = projectionMatrix * mv;
}
`;

const GLOW_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
varying float vI;
varying float vFog;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float core = smoothstep(0.36, 0.02, r);
  float halo = exp(-r * r * 5.0) * (1.0 - r);
  vec3 col = (mix(vCol, vec3(1.0, 0.97, 0.9), 0.55) * core * 1.6 + vCol * halo * 1.1) * vI * (1.0 - 0.55 * vFog);
  gl_FragColor = vec4(col, 1.0);
}
`;

const SOLID_VERT = /* glsl */ `
attribute vec3 iAlb;
attribute vec4 iEm; // rgb emissive, w = surface (0 plain, 1 stone, 2 straw, 3 smooth)
attribute vec2 iFx; // x: visibility 0..1 (an enemy between the lens and what you look at dithers), y: outline on
varying float vVis;
varying vec3 vN;
varying vec3 vW;
varying vec3 vAlb;
varying vec4 vEm;
// the face in metres (u, v from its centre), its half extents, and a per-block seed
varying vec2 vFace;
varying vec2 vHalf;
varying float vSeed;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vAlb = iAlb;
  vEm = iEm;
  vec3 S = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vec3 an = abs(normal);
  vec3 q = position * S;
  if (an.x > 0.5) { vFace = q.yz; vHalf = S.yz * 0.5; }
  else if (an.y > 0.5) { vFace = q.xz; vHalf = S.xz * 0.5; }
  else { vFace = q.xy; vHalf = S.xy * 0.5; }
  vec3 o = instanceMatrix[3].xyz;
  vSeed = fract(sin(dot(o, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  vVis = iFx.x;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SOLID_FRAG = /* glsl */ `
${ATMOS_GLSL}
varying vec3 vN;
varying vec3 vW;
varying vec3 vAlb;
varying vec4 vEm;
varying vec2 vFace;
varying vec2 vHalf;
varying float vSeed;
varying float vVis;
void main() {
  // an enemy in the way (wedged against the lens, between the reveal camera and the boss) is
  // screen-door dithered: what is behind it stays readable
  if (vVis < 0.999 && kqHash12(floor(gl_FragCoord.xy)) > vVis) discard;
  vec3 n = normalize(vN);
  vec3 v = normalize(uCamPos - vW);
  // a little grain so flat faces read as stone / paper / straw
  float g = kqNoise(vW.xz * 9.0 + vW.y * 7.0) * 0.25 + 0.88;
  vec3 alb = vAlb;
  // playtest round 4 ("flat beige cube stacks", "cardboard robot"): blocks get dark mortar seams
  // at their edges and a value of their own; straw gets strands along its length
  float small = min(vHalf.x, vHalf.y);
  vec2 ed = vHalf - abs(vFace);
  float edge = min(ed.x, ed.y);
  float mat = floor(vEm.w + 0.5);
  float stone = mat == 1.0 ? 1.0 : 0.0;
  float straw = mat == 2.0 ? 1.0 : 0.0;
  if (small > 0.06 && mat != 3.0) {
    float w = clamp(small * mix(0.16, 0.2, stone), 0.012, mix(0.055, 0.08, stone));
    float seam = 1.0 - smoothstep(w * 0.4, w, edge);
    alb *= 1.0 - seam * mix(mix(0.5, 0.82, stone), 0.1, straw);
    // value per block (stone and wood), less for straw (its strands carry it)
    alb *= mix(0.8 + vSeed * 0.36, 1.0, straw);
    // chipped / weathered: blotches of darker stone, chisel marks
    float bl = kqNoise(vFace * 3.1 + vSeed * 17.0);
    alb *= 1.0 - smoothstep(0.6, 0.9, bl) * mix(0.25, 0.45, stone) * (1.0 - straw);
    if (stone > 0.5) {
      float ch = kqNoise(vec2(vFace.x * 22.0 + vFace.y * 9.0, vFace.y * 3.0 + vSeed * 4.0));
      alb *= 0.86 + ch * 0.22;
      // sandstone under the bright 1796 sky read as pale beige boxes: a darker, redder stone
      alb *= vec3(0.78, 0.7, 0.66);
    }
  }
  if (straw > 0.5) {
    // strands along the long axis of the face, with darker gaps and pale stalks
    bool longX = vHalf.x > vHalf.y;
    float across = longX ? vFace.y : vFace.x;
    float along = longX ? vFace.x : vFace.y;
    float st = kqNoise(vec2(across * 46.0 + vSeed * 9.0, along * 1.6));
    float st2 = kqNoise(vec2(across * 120.0, along * 4.0 + vSeed * 5.0));
    alb *= (0.42 + st * 0.75 + st2 * 0.3) * vec3(1.08, 0.82, 0.46);
    // bundles: darker towards the tied ends of a sheaf
    float tie = 1.0 - smoothstep(0.0, 0.18, (longX ? vHalf.x : vHalf.y) - abs(along));
    alb *= 1.0 - tie * 0.35;
  }
  vec3 col = kqLight(alb * g, n, vW, 1.0, 1.0);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.5);
  // the outline contrasts with the fog (dark on pale fog, pale at night)
  float fogL = dot(uFogColor, vec3(0.299, 0.587, 0.114));
  col = fogL > 0.38 ? col * (1.0 - rim * 0.55) : col + (uFogColor * 1.2 + vec3(0.05)) * rim * 0.45;
  col += vEm.rgb;
  float dist = length(vW - uCamPos);
  // a slab right in front of the lens dithers away (the camera never sits inside a boss's arm)
  float nearK = smoothstep(0.45, 1.25, dist);
  if (nearK < 1.0 && kqHash12(gl_FragCoord.xy) > nearK) discard;
  col = mix(kqFog(col, vW), col, 0.88 * (1.0 - smoothstep(45.0, 110.0, dist)));
  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * The outline (readability pass): every solid piece is drawn a second time as an inverted hull a
 * fixed number of pixels larger (grown per axis, so box corners stay closed) — a dark ink line
 * round stone, straw and paper against bright sand, snow and day fog, a fog-lit pale one at night.
 */
const OUTLINE_VERT = /* glsl */ `
attribute vec2 iFx;
uniform float uPixel;
uniform float uOutlinePx;
varying vec3 vW;
varying float vVis;
void main() {
  vec3 S = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float dist = length(c.xyz - cameraPosition);
  // a fixed width on screen (thin up close, never a fat slab), capped in metres far away
  float w = min(uOutlinePx * uPixel * dist, 0.09);
  vec3 grow = (S + 2.0 * w) / max(S, vec3(1e-4));
  vec4 wp = modelMatrix * instanceMatrix * vec4(position * grow, 1.0);
  vW = wp.xyz;
  vVis = iFx.x;
  gl_Position = iFx.y < 0.5 || iFx.x < 0.02 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * wp;
}
`;

const OUTLINE_FRAG = /* glsl */ `
${ATMOS_GLSL}
varying vec3 vW;
varying float vVis;
void main() {
  if (vVis < 0.999 && kqHash12(floor(gl_FragCoord.xy)) > vVis) discard;
  float dist = length(vW - uCamPos);
  if (dist < 1.1) discard;
  float fogL = dot(uFogColor, vec3(0.299, 0.587, 0.114));
  // dark ink on pale fog / sand / snow; a fog-lit pale line in the dark
  vec3 col = fogL > 0.38 ? vec3(0.025, 0.02, 0.022) : uFogColor * 1.25 + vec3(0.08, 0.08, 0.1);
  // fogged a little less than the body: the silhouette outlives the fill
  col = mix(kqFog(col, vW), col, 0.92 * (1.0 - smoothstep(55.0, 130.0, dist)));
  gl_FragColor = vec4(col, 1.0);
}
`;

const RING_VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iData;  // radius, fill 0..1, alpha, kind (0 area, 1 rain, 2 landing, 3 gebannt, 4 bann cone)
attribute vec2 iExtra; // yaw, half angle (cone)
varying vec2 vUv;
varying vec4 vData;
varying vec2 vExtra;
void main() {
  vec3 wp = iPos + vec3(position.x, 0.0, position.y) * iData.x * 1.06;
  vUv = position.xy * 1.06;
  vData = iData;
  vExtra = iExtra;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const RING_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec4 vData;
varying vec2 vExtra;
void main() {
  float r = length(vUv);
  if (r > 1.06) discard;
  float kind = vData.w;
  float ang = atan(vUv.x, vUv.y);
  vec3 col;
  float a;
  if (kind > 6.5) {
    // shockwave (a kill, a boss coming apart): a thin bright ring that runs outward
    float band = smoothstep(0.8, 0.95, r) * (1.0 - smoothstep(0.97, 1.03, r));
    a = band * vData.z;
    col = mix(vec3(1.0, 0.9, 0.7), vec3(0.75, 0.9, 1.0), step(0.5, vData.y)) * 1.6;
  } else if (kind > 5.5) {
    // finishable elite: a white double ring that beats
    float b1 = smoothstep(0.84, 0.9, r) * (1.0 - smoothstep(0.92, 0.98, r));
    float b2 = smoothstep(0.62, 0.66, r) * (1.0 - smoothstep(0.68, 0.72, r)) * (0.5 + 0.5 * sin(uTime * 9.0));
    a = (b1 + b2 * 0.8) * vData.z;
    col = vec3(1.0, 0.97, 0.9) * 1.7;
  } else if (kind > 4.5) {
    // elite aura: a soft ember halo with a slow dashed band
    float band = smoothstep(0.55, 0.85, r) * (1.0 - smoothstep(0.9, 1.0, r));
    float marks = 0.6 + 0.4 * step(0.4, fract(ang * 1.2732 - uTime * 0.35));
    a = band * marks * 0.55 * vData.z;
    col = vec3(1.0, 0.45, 0.12) * 1.5;
  } else if (kind > 3.5) {
    // Bannlicht: a pale cone of light on the ground
    float d = abs(mod(atan(-vUv.x, -vUv.y) - vExtra.x + 3.14159, 6.28318) - 3.14159);
    float inCone = 1.0 - smoothstep(vExtra.y - 0.05, vExtra.y, d);
    a = inCone * (1.0 - smoothstep(0.7, 1.0, r)) * vData.z * (0.55 + 0.45 * vData.y);
    col = vec3(1.0, 0.86, 0.55) * 1.6;
  } else if (kind > 2.5) {
    // gebannt: a pale turning ring of marks under the stunned enemy
    float marks = step(0.5, fract(ang * 1.909 + uTime * 0.6));
    float band = smoothstep(0.78, 0.86, r) * (1.0 - smoothstep(0.94, 1.0, r));
    a = band * (0.55 + 0.45 * marks) * vData.z;
    col = vec3(0.7, 0.9, 1.0) * 1.4;
  } else {
    // telegraph: dashed outline that turns + a disc that fills up towards the strike
    // fun pass: red and white on any ground — a white dashed outline on a dark under-edge, a red
    // disc that fills up towards the blow and a white-hot front where it grows (the 1796 sand, snow,
    // night grass and the fire's glare all read it)
    float dash = step(0.3, fract(ang * 3.183 + uTime * 0.8));
    float outline = smoothstep(0.9, 0.94, r) * (1.0 - smoothstep(0.98, 1.02, r)) * (0.7 + 0.3 * dash);
    float fill = vData.y;
    float inside = 1.0 - smoothstep(fill - 0.02, fill, r);
    float disc = inside * (0.22 + 0.36 * smoothstep(0.0, max(fill, 0.01), r));
    float front = smoothstep(fill - 0.06, fill - 0.01, r) * (1.0 - smoothstep(fill - 0.01, fill + 0.02, r));
    float under = smoothstep(0.84, 0.88, r) * (1.0 - smoothstep(1.02, 1.06, r));
    float line = clamp(outline + front, 0.0, 1.0);
    a = min(0.95, line + disc + under * 0.55) * vData.z;
    vec3 white = kind > 1.5 ? vec3(1.0, 0.93, 0.8) : vec3(1.0, 0.97, 0.94);
    vec3 red = kind > 0.5 && kind < 1.5 ? vec3(0.85, 0.18, 0.03) : vec3(0.82, 0.05, 0.04);
    col = (white * (1.15 + fill * 0.5) * line + red * disc * 1.15 + vec3(0.01) * under * 0.55) / max(a / max(vData.z, 0.001), 0.001);
  }
  if (a < 0.003) discard;
  gl_FragColor = vec4(col * a, a);
}
`;

// ---- pools ----------------------------------------------------------------------------------------

function quad(): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function dyn(n: number, size: number): InstancedBufferAttribute {
  const a = new InstancedBufferAttribute(new Float32Array(n * size), size);
  a.setUsage(DynamicDrawUsage);
  return a;
}

function upload(attrs: InstancedBufferAttribute[], n: number): void {
  for (const a of attrs) {
    a.needsUpdate = true;
    a.clearUpdateRanges();
    a.addUpdateRange(0, Math.max(1, n) * a.itemSize);
  }
}

const PUFF_STRIDE = 14;

class PuffPool {
  readonly mesh: Mesh;
  private readonly geo = quad();
  private readonly attrs: Record<'pos' | 'data' | 'alb' | 'em', InstancedBufferAttribute>;
  private readonly stage: Float32Array;
  private readonly depth: Float32Array;
  private order: number[] = [];
  n = 0;
  constructor(
    readonly max: number,
    mat: ShaderMaterial,
  ) {
    this.attrs = { pos: dyn(max, 3), data: dyn(max, 4), alb: dyn(max, 3), em: dyn(max, 3) };
    this.geo.setAttribute('iPos', this.attrs.pos);
    this.geo.setAttribute('iData', this.attrs.data);
    this.geo.setAttribute('iAlb', this.attrs.alb);
    this.geo.setAttribute('iEm', this.attrs.em);
    this.geo.instanceCount = 0;
    this.stage = new Float32Array(max * PUFF_STRIDE);
    this.depth = new Float32Array(max);
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 24;
  }
  push(x: number, y: number, z: number, size: number, alpha: number, seed: number, style: number, ar: number, ag: number, ab: number, er = 0, eg = 0, eb = 0): void {
    if (this.n >= this.max || alpha <= 0.003 || size <= 0.001) return;
    const o = this.n++ * PUFF_STRIDE;
    const s = this.stage;
    s[o] = x;
    s[o + 1] = y;
    s[o + 2] = z;
    s[o + 3] = size;
    s[o + 4] = alpha;
    s[o + 5] = seed;
    s[o + 6] = style;
    s[o + 7] = ar;
    s[o + 8] = ag;
    s[o + 9] = ab;
    s[o + 10] = er;
    s[o + 11] = eg;
    s[o + 12] = eb;
  }
  end(cam: Vector3): void {
    const n = this.n;
    const s = this.stage;
    if (this.order.length !== n) this.order = Array.from({ length: n }, (_, i) => i);
    for (let i = 0; i < n; i++) {
      const o = i * PUFF_STRIDE;
      this.depth[i] = (s[o] - cam.x) ** 2 + (s[o + 1] - cam.y) ** 2 + (s[o + 2] - cam.z) ** 2;
    }
    this.order.sort((a, b) => this.depth[b] - this.depth[a]);
    const P = this.attrs.pos.array as Float32Array;
    const D = this.attrs.data.array as Float32Array;
    const A = this.attrs.alb.array as Float32Array;
    const E = this.attrs.em.array as Float32Array;
    for (let k = 0; k < n; k++) {
      const o = this.order[k] * PUFF_STRIDE;
      P[k * 3] = s[o];
      P[k * 3 + 1] = s[o + 1];
      P[k * 3 + 2] = s[o + 2];
      D[k * 4] = s[o + 3];
      D[k * 4 + 1] = s[o + 4];
      D[k * 4 + 2] = s[o + 5];
      D[k * 4 + 3] = s[o + 6];
      A[k * 3] = s[o + 7];
      A[k * 3 + 1] = s[o + 8];
      A[k * 3 + 2] = s[o + 9];
      E[k * 3] = s[o + 10];
      E[k * 3 + 1] = s[o + 11];
      E[k * 3 + 2] = s[o + 12];
    }
    this.geo.instanceCount = n;
    upload(Object.values(this.attrs), n);
    this.mesh.visible = n > 0;
  }
}

class GlowPool {
  readonly mesh: Mesh;
  private readonly geo = quad();
  private readonly pos: InstancedBufferAttribute;
  private readonly data: InstancedBufferAttribute;
  private readonly col: InstancedBufferAttribute;
  n = 0;
  constructor(
    readonly max: number,
    mat: ShaderMaterial,
  ) {
    this.pos = dyn(max, 3);
    this.data = dyn(max, 4);
    this.col = dyn(max, 3);
    this.geo.setAttribute('iPos', this.pos);
    this.geo.setAttribute('iData', this.data);
    this.geo.setAttribute('iCol', this.col);
    this.geo.instanceCount = 0;
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    // after the fire smoke (fx/fire 40–42) and the room smoke (interiors 4–5): the Glutlinge' cores and
    // every enemy's eyes read through the smoke (playtest round 2: "Glutlinge vanish in the smoke")
    // round 6: after the ambient ground mist and snow (49 / 50) too — eyes are not veiled by it
    this.mesh.renderOrder = 52;
  }
  push(x: number, y: number, z: number, size: number, intensity: number, r: number, g: number, b: number, minPx = 0, aspect = 1): void {
    if (this.n >= this.max || intensity <= 0.003) return;
    const i = this.n++;
    const P = this.pos.array as Float32Array;
    const D = this.data.array as Float32Array;
    const C = this.col.array as Float32Array;
    P[i * 3] = x;
    P[i * 3 + 1] = y;
    P[i * 3 + 2] = z;
    D[i * 4] = size;
    D[i * 4 + 1] = intensity;
    D[i * 4 + 2] = minPx;
    D[i * 4 + 3] = aspect;
    C[i * 3] = r;
    C[i * 3 + 1] = g;
    C[i * 3 + 2] = b;
  }
  end(): void {
    this.geo.instanceCount = this.n;
    upload([this.pos, this.data, this.col], this.n);
    this.mesh.visible = this.n > 0;
  }
}

class SolidPool {
  readonly mesh: InstancedMesh;
  /** The inverted-hull outline drawn round every solid (shares the instances). */
  readonly outline: InstancedMesh;
  readonly outlineMat: ShaderMaterial;
  private readonly alb: InstancedBufferAttribute;
  private readonly em: InstancedBufferAttribute;
  private readonly fx: InstancedBufferAttribute;
  n = 0;
  constructor(readonly max: number) {
    const geo = new BoxGeometry(1, 1, 1);
    this.alb = dyn(max, 3);
    this.em = dyn(max, 4);
    this.fx = dyn(max, 2);
    geo.setAttribute('iAlb', this.alb);
    geo.setAttribute('iEm', this.em);
    geo.setAttribute('iFx', this.fx);
    const mat = new ShaderMaterial({ vertexShader: SOLID_VERT, fragmentShader: SOLID_FRAG, uniforms: { ...atmosphere } });
    this.mesh = new InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 23;
    this.outlineMat = new ShaderMaterial({ vertexShader: OUTLINE_VERT, fragmentShader: OUTLINE_FRAG, uniforms: { ...atmosphere, uPixel: { value: 0.002 }, uOutlinePx: { value: 1.7 } }, side: BackSide });
    this.outline = new InstancedMesh(geo, this.outlineMat, max);
    this.outline.instanceMatrix = this.mesh.instanceMatrix;
    this.outline.frustumCulled = false;
    this.outline.count = 0;
    this.outline.renderOrder = 23;
  }
  /** `vis` < 1 dithers the piece away; `outline` false draws no ink line (chips, flying grit). */
  push(m: Matrix4, r: number, g: number, b: number, er = 0, eg = 0, eb = 0, mat = 0, vis = 1, outline = true): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.mesh.setMatrixAt(i, m);
    const A = this.alb.array as Float32Array;
    const E = this.em.array as Float32Array;
    const F = this.fx.array as Float32Array;
    A[i * 3] = r;
    A[i * 3 + 1] = g;
    A[i * 3 + 2] = b;
    E[i * 4] = er;
    E[i * 4 + 1] = eg;
    E[i * 4 + 2] = eb;
    E[i * 4 + 3] = mat;
    F[i * 2] = vis;
    F[i * 2 + 1] = outline ? 1 : 0;
  }
  end(): void {
    this.mesh.count = this.n;
    this.outline.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0, Math.max(1, this.n) * 16);
    upload([this.alb, this.em, this.fx], this.n);
    this.mesh.visible = this.n > 0;
    this.outline.visible = this.n > 0;
  }
}

class RingPool {
  readonly mesh: Mesh;
  private readonly geo = quad();
  private readonly pos: InstancedBufferAttribute;
  private readonly data: InstancedBufferAttribute;
  private readonly extra: InstancedBufferAttribute;
  readonly mat: ShaderMaterial;
  n = 0;
  constructor(readonly max: number) {
    this.pos = dyn(max, 3);
    this.data = dyn(max, 4);
    this.extra = dyn(max, 2);
    this.geo.setAttribute('iPos', this.pos);
    this.geo.setAttribute('iData', this.data);
    this.geo.setAttribute('iExtra', this.extra);
    this.geo.instanceCount = 0;
    // normal (premultiplied) blending with a dark under-edge: a telegraph must read on bright grass
    this.mat = new ShaderMaterial({ vertexShader: RING_VERT, fragmentShader: RING_FRAG, uniforms: { uTime: atmosphere.uTime }, transparent: true, premultipliedAlpha: true, depthWrite: false, blending: NormalBlending, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 22;
  }
  push(x: number, y: number, z: number, r: number, fill: number, alpha: number, kind: number, yaw = 0, half = 0): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    (this.pos.array as Float32Array).set([x, y, z], i * 3);
    (this.data.array as Float32Array).set([r, fill, alpha, kind], i * 4);
    (this.extra.array as Float32Array).set([yaw, half], i * 2);
  }
  end(): void {
    this.geo.instanceCount = this.n;
    upload([this.pos, this.data, this.extra], this.n);
    this.mesh.visible = this.n > 0;
  }
}

// ---- particles -------------------------------------------------------------------------------------

/** 0 dark smoke, 1 pale mist, 2 glow spark, 3 solid chip. */
interface Particle {
  type: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  grow: number;
  r: number;
  g: number;
  b: number;
  /** spark intensity / puff heat. */
  em: number;
  /** m/s² (negative rises). */
  grav: number;
  drag: number;
  spin: number;
  rot: number;
  seed: number;
  /** solid aspect (y / x). */
  aspect: number;
}

export type DissolveKind = 'mist' | 'sparks' | 'smoke' | 'ash' | 'paper' | 'grit-rising' | 'fade';

/** Family → colours of hit puffs / sparks. */
const FAMILY_HIT: Record<string, { type: number; col: [number, number, number]; em: number; spark: [number, number, number] }> = {
  mist: { type: 1, col: [0.7, 0.74, 0.82], em: 0, spark: [0.9, 0.95, 1] },
  light: { type: 2, col: [0.6, 0.85, 1], em: 1.6, spark: [0.6, 0.85, 1] },
  hound: { type: 0, col: [0.06, 0.06, 0.07], em: 0.2, spark: [1, 0.5, 0.15] },
  paper: { type: 3, col: [0.86, 0.8, 0.66], em: 0, spark: [1, 0.3, 0.1] },
  shade: { type: 0, col: [0.07, 0.06, 0.06], em: 0.15, spark: [1, 0.8, 0.3] },
  ember: { type: 2, col: [1, 0.45, 0.1], em: 1.4, spark: [1, 0.55, 0.15] },
  stone: { type: 3, col: [0.52, 0.43, 0.36], em: 0, spark: [1, 0.6, 0.25] },
};

/** Aura colour of an elite (eyes, motes). */
function eliteAura(kind: string): readonly [number, number, number] {
  return ELITES[kind]?.aura ?? [1, 0.5, 0.15];
}

/** Horizontal reach of a body template from its axis (m): sideways (r) and fore / aft (f). */
export function hullOf(t: BodyTemplate): { r: number; f: number } {
  let r = 0;
  let f = 0;
  for (const p of t.parts) {
    const half = p.kind === 'solid' ? Math.max(p.size, p.sy ?? p.size, p.sz ?? p.size) * 0.5 : p.kind === 'puff' ? p.size * 0.6 : 0;
    r = Math.max(r, Math.abs(p.r) + half);
    f = Math.max(f, Math.abs(p.f) + half);
  }
  return { r, f };
}

/**
 * Where a point sits against a body's hull: an ellipse round its axis (sideways reach r, fore /
 * aft reach f, never less than its collision radius). 1 = on the hull, < 1 inside.
 */
export function hullDistance(e: Pick<Enemy, 'x' | 'z' | 'heading' | 'radius'>, hull: { r: number; f: number }, x: number, z: number): number {
  const dx = x - e.x;
  const dz = z - e.z;
  const c = Math.cos(e.heading);
  const s = Math.sin(e.heading);
  // the body's local frame (makeRotationY(heading)): right = (cos, -sin), forward = (-sin, -cos)
  const lr = dx * c - dz * s;
  const lf = -dx * s - dz * c;
  return Math.hypot(lr / Math.max(e.radius, hull.r), lf / Math.max(e.radius, hull.f));
}

/** Distance from point c to the segment a → b. */
function segDist(cx: number, cy: number, cz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): { d: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const L = dx * dx + dy * dy + dz * dz;
  const t = L > 1e-6 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / L)) : 0;
  return { d: Math.hypot(ax + dx * t - cx, ay + dy * t - cy, az + dz * t - cz), t };
}

const ss = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * How solid an enemy may be drawn (1 = fully): the camera inside (or brushing) its hull, or its
 * body on the line from the camera to a focus point (the boss being revealed, the player), thins
 * it to a dither of ~30 %.
 */
export function occlusionVis(e: Enemy, v: { hull: { r: number; f: number }; t: { top: number } }, f: Pick<VisualFrame, 'camera' | 'focus'>): number {
  const cam = f.camera.position;
  const top = v.t.top;
  let vis = 1;
  // the camera within the body's height and inside (or brushing) its hull
  if (cam.y > e.y - 0.5 && cam.y < e.y + top + 0.5) {
    const q = hullDistance(e, v.hull, cam.x, cam.z);
    vis = 0.3 + 0.7 * ss(0.5, 1.1, q);
  }
  const R = Math.max(e.radius, v.hull.r, v.hull.f);
  for (const p of f.focus ?? []) {
    if (p.id === e.id) continue;
    // the body's axis, sampled low / middle / high, against the line of sight
    for (const h of [0.2, 0.5, 0.85]) {
      const s = segDist(e.x, e.y + top * h, e.z, cam.x, cam.y, cam.z, p.x, p.y, p.z);
      // only what stands in front of the focus (not the crowd behind it), and not right at it
      if (s.t <= 0 || s.t >= 0.92) continue;
      vis = Math.min(vis, 0.3 + 0.7 * ss(R * 0.45, R * 0.45 + 0.8, s.d));
    }
  }
  return vis;
}

const _m = new Matrix4();
const _m2 = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const _s = new Vector3();
const _p = new Vector3();
const _ax = new Vector3(1, 0, 0);
const _ay = new Vector3(0, 1, 0);
const _qa = new Quaternion();
const _qb = new Quaternion();

interface Vis {
  t: BodyTemplate;
  /** smoothed telegraph glow / pose. */
  tell: number;
  lean: number;
  arm: number;
  swell: number;
  sink: number;
  fade: number;
  dissolved: boolean;
  phaseFlash: number;
  /** 0..1 recoil from the last staff hit (flinch away from the blow). */
  flinch: number;
  lastFlash: number;
  /** Fractional flame particles owed (burning parts). */
  fireAcc: number;
  /** Seconds of walking (gait phase). */
  walk: number;
  /** Horizontal reach of the body from its axis (m): the hull the camera must keep out of. */
  hull: { r: number; f: number };
  /** Smoothed visibility 0..1 (dithered while in the way of the lens). */
  vis: number;
}

/** A ring that runs outward on the ground (kills, a boss coming apart). */
interface Wave {
  x: number;
  y: number;
  z: number;
  t: number;
  dur: number;
  r0: number;
  r1: number;
  cold: boolean;
}

export interface VisualFrame {
  enemies: readonly Enemy[];
  projectiles: readonly Projectile[];
  rings: readonly Ring[];
  camera: PerspectiveCamera;
  viewportH: number;
  time: number;
  dt: number;
  /** Hit-stop: bodies hold their pose. */
  frozen: boolean;
  heightAt(x: number, z: number): number;
  reducedFlash: boolean;
  /** Bannlicht flare 0..1 and its cone. */
  bann: { t: number; x: number; z: number; yaw: number; range: number; angle: number } | null;
  /**
   * What the view is looking at besides the camera's own spot (a boss under its reveal camera, the
   * player when the camera is pulled away): an enemy between the lens and one of these dithers.
   */
  focus?: readonly { x: number; y: number; z: number; id?: string }[];
}

export class CombatVisuals {
  readonly object = new Group();
  private readonly puffs: PuffPool;
  private readonly glows: GlowPool;
  private readonly solids: SolidPool;
  private readonly ringPool: RingPool;
  private readonly puffMat: ShaderMaterial;
  private readonly glowMat: ShaderMaterial;
  private readonly vis = new Map<string, Vis>();
  private readonly parts: Particle[] = [];
  private readonly waves: Wave[] = [];
  private maxParticles = 900;
  private seedN = 1;
  /** Rigged CC0 bodies (hounds, the Raffschatten, the Pikeur's horse) from medium quality up. */
  readonly rigs = new EnemyRigs();

  constructor() {
    this.object.name = 'combat-visuals';
    this.puffMat = new ShaderMaterial({ vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG, uniforms: { ...atmosphere }, transparent: true, depthWrite: false });
    this.glowMat = new ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: { ...atmosphere, uPixel: { value: 0.002 } }, transparent: true, depthWrite: false, blending: AdditiveBlending });
    this.puffs = new PuffPool(1800, this.puffMat);
    this.glows = new GlowPool(900, this.glowMat);
    this.solids = new SolidPool(1400);
    this.ringPool = new RingPool(48);
    this.object.add(this.ringPool.mesh, this.solids.outline, this.solids.mesh, this.puffs.mesh, this.glows.mesh, this.rigs.object);
  }

  /** Rigged bodies on (medium / high: the asset loader) or off (low tier: null). */
  setAssets(a: AssetLoader | null): void {
    this.rigs.setAssets(a);
  }

  /** Quality preset → particle budget. */
  setQuality(level: string): void {
    this.maxParticles = level === 'low' ? 300 : level === 'medium' ? 600 : 900;
  }

  get particleCount(): number {
    return this.parts.length;
  }

  private rnd(): number {
    this.seedN = (this.seedN * 16807) % 2147483647;
    return this.seedN / 2147483647;
  }

  private add(p: Omit<Particle, 'age' | 'rot' | 'seed'>): void {
    if (this.parts.length >= this.maxParticles) this.parts.shift();
    this.parts.push({ ...p, age: 0, rot: this.rnd() * 6, seed: this.rnd() });
  }

  private template(e: Enemy): Vis {
    let v = this.vis.get(e.id);
    if (!v) {
      const t = bodyTemplate(e.kind, e.seed, e.size);
      v = { t, tell: 0, lean: 0, arm: 0, swell: 1, sink: 0, fade: 0, dissolved: false, phaseFlash: 0, flinch: 0, lastFlash: 0, fireAcc: 0, walk: 0, hull: hullOf(t), vis: 1 };
      this.vis.set(e.id, v);
    }
    return v;
  }

  /** Where the HP pips / labels go (top of the body), or null if unknown. */
  topOf(e: Enemy): number {
    return this.template(e).t.top;
  }

  /** Horizontal reach of the body from its axis (m): arms, covers, the horse's head. */
  hullOf(e: Enemy): { r: number; f: number } {
    return this.template(e).hull;
  }

  /** Current visibility of an enemy's body 0..1 (1 = solid; lower while in the way of the lens). */
  visOf(id: string): number {
    return this.vis.get(id)?.vis ?? 1;
  }

  // ---- emitters ------------------------------------------------------------------------------

  /** A staff hit: puffs / sparks / scraps / chips by family, thrown along the hit. */
  hit(family: string, x: number, y: number, z: number, dirX: number, dirZ: number, heavy: boolean, reducedFlash: boolean): void {
    const f = FAMILY_HIT[family] ?? FAMILY_HIT.mist;
    const n = (heavy ? 22 : 12) * (this.maxParticles / 900);
    for (let i = 0; i < n; i++) {
      const sp = (heavy ? 4.5 : 3) * (0.4 + this.rnd());
      const ang = (this.rnd() - 0.5) * 1.8;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const vx = (dirX * c - dirZ * s) * sp;
      const vz = (dirX * s + dirZ * c) * sp;
      const vy = (this.rnd() * 0.8 + 0.2) * sp * 0.8;
      const type = i % 3 === 0 ? 2 : f.type;
      if (type === 2) {
        const col = i % 3 === 0 ? f.spark : f.col;
        this.add({ type: 2, x, y, z, vx: vx * 1.6, vy: vy * 1.4, vz: vz * 1.6, life: 0.25 + this.rnd() * 0.35, size: 0.05 + this.rnd() * 0.04, grow: 0, r: col[0], g: col[1], b: col[2], em: reducedFlash ? 1 : 2.2, grav: 9, drag: 2.5, spin: 0, aspect: 1 });
      } else if (type === 3) {
        this.add({ type: 3, x, y, z, vx, vy: vy + 1, vz, life: 0.6 + this.rnd() * 0.5, size: 0.05 + this.rnd() * 0.06, grow: 0, r: f.col[0], g: f.col[1], b: f.col[2], em: 0, grav: family === 'paper' ? 2 : 9, drag: family === 'paper' ? 3 : 1, spin: (this.rnd() - 0.5) * 14, aspect: family === 'paper' ? 0.08 : 0.8 });
      } else {
        this.add({ type, x, y, z, vx: vx * 0.5, vy: vy * 0.4, vz: vz * 0.5, life: 0.5 + this.rnd() * 0.5, size: 0.2 + this.rnd() * 0.15, grow: 0.9, r: f.col[0], g: f.col[1], b: f.col[2], em: f.em, grav: -0.5, drag: 2.5, spin: 0, aspect: 1 });
      }
    }
  }

  /** Cold sparks glancing off an untouchable Irrlicht (or a safe zone). */
  glance(x: number, y: number, z: number): void {
    for (let i = 0; i < 8; i++) {
      const a = this.rnd() * Math.PI * 2;
      this.add({ type: 2, x, y, z, vx: Math.cos(a) * 3, vy: 1 + this.rnd() * 2, vz: Math.sin(a) * 3, life: 0.3 + this.rnd() * 0.2, size: 0.04, grow: 0, r: 0.6, g: 0.85, b: 1, em: 1.5, grav: 6, drag: 3, spin: 0, aspect: 1 });
    }
  }

  /** Drop every particle (an era change: no grit from 1796 drifting through 2025). */
  clearParticles(): void {
    this.parts.length = 0;
    this.waves.length = 0;
  }

  /** The dissolve: the body comes apart along its own parts, everything rises. */
  dissolve(e: Enemy, style: DissolveKind, reducedFlash: boolean): void {
    const v = this.template(e);
    v.dissolved = true;
    const k = this.maxParticles / 900;
    const scale = e.boss ? 1 : 0.7;
    for (const p of v.t.parts) {
      this.partWorld(e, v, p, _p);
      const reps = Math.max(1, Math.round((p.kind === 'puff' ? 1.5 : 3) * k * scale * (e.boss ? 2.2 : 1)));
      for (let i = 0; i < reps; i++) this.dissolveBit(style, _p.x + (this.rnd() - 0.5) * 0.2, _p.y + (this.rnd() - 0.5) * 0.2, _p.z + (this.rnd() - 0.5) * 0.2, p, reducedFlash, e.boss);
    }
  }

  private dissolveBit(style: DissolveKind, x: number, y: number, z: number, p: BodyPart, reducedFlash: boolean, big: boolean): void {
    const r = () => this.rnd() - 0.5;
    const life = (big ? 2.4 : 1.6) * (0.6 + this.rnd() * 0.6);
    switch (style) {
      case 'mist':
        this.add({ type: 1, x, y, z, vx: r() * 1.2, vy: 0.6 + this.rnd() * 0.8, vz: r() * 1.2, life, size: 0.3 + this.rnd() * 0.3, grow: 1.1, r: 0.72, g: 0.76, b: 0.84, em: 0, grav: -0.3, drag: 1.2, spin: 0, aspect: 1 });
        break;
      case 'sparks': {
        const c = p.kind === 'glow' ? p.col : ([1, 0.55, 0.15] as [number, number, number]);
        this.add({ type: 2, x, y, z, vx: r() * 3, vy: 1.5 + this.rnd() * 2.5, vz: r() * 3, life: life * 0.6, size: 0.05 + this.rnd() * 0.05, grow: 0, r: c[0], g: c[1], b: c[2], em: reducedFlash ? 1 : 2.4, grav: -0.8, drag: 1.4, spin: 0, aspect: 1 });
        if (this.rnd() > 0.5) this.add({ type: 0, x, y, z, vx: r() * 0.6, vy: 0.8, vz: r() * 0.6, life, size: 0.25, grow: 1, r: 0.1, g: 0.08, b: 0.07, em: 0.6, grav: -0.4, drag: 1, spin: 0, aspect: 1 });
        break;
      }
      case 'smoke':
      case 'fade':
        this.add({ type: 0, x, y, z, vx: r() * 0.8, vy: 0.7 + this.rnd() * 0.7, vz: r() * 0.8, life, size: 0.25 + this.rnd() * 0.25, grow: 1.2, r: 0.07, g: 0.07, b: 0.08, em: style === 'smoke' ? 0.2 : 0, grav: -0.5, drag: 1, spin: 0, aspect: 1 });
        break;
      case 'ash':
        if (this.rnd() > 0.35) this.add({ type: 3, x, y, z, vx: r() * 1.2, vy: 0.5 + this.rnd() * 1.2, vz: r() * 1.2, life: life * 1.2, size: 0.04 + this.rnd() * 0.04, grow: 0, r: 0.32, g: 0.3, b: 0.28, em: 0, grav: -0.6, drag: 1.6, spin: r() * 10, aspect: 0.1 });
        else this.add({ type: 2, x, y, z, vx: r(), vy: 1 + this.rnd(), vz: r(), life: life * 0.7, size: 0.035, grow: 0, r: 1, g: 0.5, b: 0.15, em: reducedFlash ? 0.8 : 1.6, grav: -0.5, drag: 1, spin: 0, aspect: 1 });
        break;
      case 'paper':
        // scraps whirl up and go grey as they rise
        this.add({ type: 3, x, y, z, vx: r() * 2.5 + 0.8, vy: 0.8 + this.rnd() * 1.6, vz: r() * 2.5, life: life * 1.3, size: 0.07 + this.rnd() * 0.06, grow: 0, r: 0.86, g: 0.8, b: 0.66, em: 0, grav: -0.4, drag: 1.4, spin: r() * 14, aspect: 0.06 });
        break;
      case 'grit-rising':
        // the stone remembers: grit and chips rise slowly upward instead of falling
        this.add({ type: 3, x, y, z, vx: r() * 0.4, vy: 0.4 + this.rnd() * 0.7, vz: r() * 0.4, life: life * 1.4, size: 0.04 + this.rnd() * (big ? 0.14 : 0.07), grow: 0, r: 0.55, g: 0.47, b: 0.4, em: 0, grav: -0.25, drag: 0.6, spin: r() * 3, aspect: 0.8 });
        if (this.rnd() > 0.6) this.add({ type: 1, x, y, z, vx: r() * 0.3, vy: 0.3, vz: r() * 0.3, life, size: 0.3, grow: 0.8, r: 0.6, g: 0.55, b: 0.48, em: 0, grav: -0.2, drag: 1, spin: 0, aspect: 1 });
        break;
    }
  }

  /** Flames licking up from a burning part: hot puffs that rise, darken and go to smoke; sparks. */
  private flames(x: number, y: number, z: number, n: number, size: number, reducedFlash: boolean, v: Vis): void {
    v.fireAcc += n * 2 * (this.maxParticles / 900);
    while (v.fireAcc >= 1) {
      v.fireAcc -= 1;
      const r = () => this.rnd() - 0.5;
      const s = Math.max(0.2, size * 0.7) * (0.7 + this.rnd() * 0.6);
      this.add({ type: 2, x: x + r() * size, y: y + r() * size * 0.5, z: z + r() * size, vx: r() * 0.6, vy: 1.6 + this.rnd() * 1.4, vz: r() * 0.6, life: 0.45 + this.rnd() * 0.4, size: s * 0.55, grow: -0.5, r: 1, g: 0.42 + this.rnd() * 0.2, b: 0.08, em: reducedFlash ? 0.9 : 1.7, grav: -1.2, drag: 1.2, spin: 0, aspect: 1 });
      if (this.rnd() > 0.55) this.add({ type: 2, x, y: y + size * 0.3, z, vx: r() * 1.6, vy: 2 + this.rnd() * 2.5, vz: r() * 1.6, life: 0.6 + this.rnd() * 0.6, size: 0.035 + this.rnd() * 0.03, grow: 0, r: 1, g: 0.6, b: 0.2, em: reducedFlash ? 0.9 : 1.8, grav: -0.6, drag: 1.2, spin: 0, aspect: 1 });
      if (this.rnd() > 0.7) this.add({ type: 0, x, y: y + size, z, vx: r() * 0.4, vy: 1.2, vz: r() * 0.4, life: 1.4, size: s * 1.2, grow: 1.4, r: 0.07, g: 0.06, b: 0.06, em: 0.15, grav: -0.5, drag: 1, spin: 0, aspect: 1 });
    }
  }

  /** A ring that runs outward over the ground. */
  wave(x: number, y: number, z: number, r0: number, r1: number, dur: number, cold = false): void {
    this.waves.push({ x, y, z, t: 0, dur, r0, r1, cold });
    if (this.waves.length > 12) this.waves.shift();
  }

  /** An enemy undone: a small ring and a spray in its family's colour (before the dissolve). */
  pop(e: Enemy, groundY: number, reducedFlash: boolean): void {
    const f = FAMILY_HIT[e.def.family] ?? FAMILY_HIT.mist;
    const top = this.template(e).t.top;
    this.wave(e.x, groundY + 0.1, e.z, e.radius * 0.6, e.radius + (e.elite ? 3.2 : 2), e.elite ? 0.55 : 0.4, e.def.family === 'mist' || e.def.family === 'light');
    const n = Math.round((e.elite ? 26 : 14) * (this.maxParticles / 900));
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const sp = 2.5 + this.rnd() * 3;
      this.add({ type: 2, x: e.x, y: e.y + top * 0.5, z: e.z, vx: Math.cos(a) * sp, vy: 1 + this.rnd() * 3, vz: Math.sin(a) * sp, life: 0.35 + this.rnd() * 0.35, size: 0.05 + this.rnd() * 0.04, grow: 0, r: f.spark[0], g: f.spark[1], b: f.spark[2], em: reducedFlash ? 1 : 2.4, grav: 5, drag: 2.4, spin: 0, aspect: 1 });
    }
  }

  /** A boss comes apart: a big ring, a column of light and a storm of its own matter. */
  bossBurst(e: Enemy, groundY: number, reducedFlash: boolean): void {
    const f = FAMILY_HIT[e.def.family] ?? FAMILY_HIT.mist;
    const top = this.template(e).t.top;
    this.wave(e.x, groundY + 0.1, e.z, e.radius, e.radius + 14, 1.3);
    this.wave(e.x, groundY + 0.12, e.z, e.radius * 0.5, e.radius + 7, 0.8, true);
    const k = this.maxParticles / 900;
    for (let i = 0; i < Math.round(110 * k); i++) {
      const a = this.rnd() * Math.PI * 2;
      const el = this.rnd() * 1.2;
      const sp = 4 + this.rnd() * 7;
      this.add({ type: 2, x: e.x, y: e.y + top * (0.3 + this.rnd() * 0.5), z: e.z, vx: Math.cos(a) * Math.cos(el) * sp, vy: Math.sin(el) * sp + 2, vz: Math.sin(a) * Math.cos(el) * sp, life: 0.8 + this.rnd() * 0.9, size: 0.06 + this.rnd() * 0.07, grow: 0, r: f.spark[0], g: f.spark[1], b: f.spark[2], em: reducedFlash ? 1.1 : 2.8, grav: 3, drag: 1.4, spin: 0, aspect: 1 });
    }
    for (let i = 0; i < Math.round(26 * k); i++) {
      const a = this.rnd() * Math.PI * 2;
      this.add({ type: f.type === 2 ? 0 : f.type, x: e.x + Math.cos(a) * e.radius * 0.5, y: e.y + top * this.rnd(), z: e.z + Math.sin(a) * e.radius * 0.5, vx: Math.cos(a) * 3, vy: 1 + this.rnd() * 2, vz: Math.sin(a) * 3, life: 1.8 + this.rnd(), size: 0.5 + this.rnd() * 0.5, grow: 1.6, r: f.col[0], g: f.col[1], b: f.col[2], em: f.em, grav: -0.4, drag: 1.2, spin: (this.rnd() - 0.5) * 6, aspect: f.type === 3 ? 0.4 : 1 });
    }
    // a column of pale light where it stood
    for (let i = 0; i < Math.round(30 * k); i++) this.add({ type: 2, x: e.x + (this.rnd() - 0.5) * 0.6, y: groundY + this.rnd() * 2, z: e.z + (this.rnd() - 0.5) * 0.6, vx: 0, vy: 4 + this.rnd() * 6, vz: 0, life: 1.2 + this.rnd() * 0.8, size: 0.1 + this.rnd() * 0.08, grow: 0, r: 1, g: 0.92, b: 0.75, em: reducedFlash ? 1 : 2.2, grav: -1, drag: 0.6, spin: 0, aspect: 1 });
  }

  /** The loot fountain: golden glints thrown up that rain down and bounce where the boss stood. */
  lootFountain(x: number, y: number, z: number, reducedFlash: boolean): void {
    const n = Math.round(46 * (this.maxParticles / 900));
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const sp = 1.2 + this.rnd() * 2.6;
      if (this.rnd() > 0.3) this.add({ type: 3, x, y: y + 1, z, vx: Math.cos(a) * sp, vy: 6 + this.rnd() * 4, vz: Math.sin(a) * sp, life: 2.6 + this.rnd() * 1.2, size: 0.09 + this.rnd() * 0.05, grow: 0, r: 1, g: 0.78, b: 0.32, em: 0, grav: 9, drag: 0.4, spin: (this.rnd() - 0.5) * 12, aspect: 0.25 });
      this.add({ type: 2, x, y: y + 1, z, vx: Math.cos(a) * sp, vy: 6 + this.rnd() * 4, vz: Math.sin(a) * sp, life: 1.6 + this.rnd() * 1, size: 0.06, grow: 0, r: 1, g: 0.85, b: 0.45, em: reducedFlash ? 1.1 : 2.4, grav: 8, drag: 0.4, spin: 0, aspect: 1 });
    }
  }

  /** The Glutling bursts: a ring of sparks and a puff of smoke. */
  burst(x: number, y: number, z: number, reducedFlash: boolean): void {
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      this.add({ type: 2, x, y: y + 0.4, z, vx: Math.cos(a) * 6, vy: 1 + this.rnd() * 2, vz: Math.sin(a) * 6, life: 0.5 + this.rnd() * 0.3, size: 0.07, grow: 0, r: 1, g: 0.55, b: 0.15, em: reducedFlash ? 1 : 2.5, grav: 4, drag: 3, spin: 0, aspect: 1 });
    }
    for (let i = 0; i < 6; i++) this.add({ type: 0, x, y: y + 0.4, z, vx: (this.rnd() - 0.5) * 2, vy: 1, vz: (this.rnd() - 0.5) * 2, life: 1.4, size: 0.5, grow: 1.4, r: 0.08, g: 0.07, b: 0.06, em: 0.7, grav: -0.6, drag: 1.4, spin: 0, aspect: 1 });
  }

  /** Dust thrown up by a slam / landing block. */
  dust(x: number, y: number, z: number, r: number): void {
    const n = Math.round(10 * (this.maxParticles / 900));
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const d = this.rnd() * r;
      this.add({ type: 1, x: x + Math.cos(a) * d, y: y + 0.2, z: z + Math.sin(a) * d, vx: Math.cos(a) * 2, vy: 0.8 + this.rnd(), vz: Math.sin(a) * 2, life: 1 + this.rnd() * 0.6, size: 0.35 + this.rnd() * 0.3, grow: 1, r: 0.55, g: 0.52, b: 0.48, em: 0, grav: -0.2, drag: 2, spin: 0, aspect: 1 });
    }
  }

  /** A block knocked out of the Steinbrecher flies west, towards Homburg. */
  block(x: number, y: number, z: number): void {
    this.add({ type: 3, x, y, z, vx: -9 - this.rnd() * 3, vy: 6 + this.rnd() * 3, vz: (this.rnd() - 0.5) * 3, life: 3.2, size: 0.45 + this.rnd() * 0.2, grow: 0, r: 0.5, g: 0.41, b: 0.34, em: 0, grav: 7, drag: 0.05, spin: (this.rnd() - 0.5) * 4, aspect: 0.7 });
    for (let i = 0; i < 6; i++) this.add({ type: 1, x, y, z, vx: -3 + (this.rnd() - 0.5) * 2, vy: 1, vz: (this.rnd() - 0.5) * 2, life: 1.2, size: 0.4, grow: 1, r: 0.6, g: 0.55, b: 0.5, em: 0, grav: -0.2, drag: 1.5, spin: 0, aspect: 1 });
  }

  /** The Bannlicht: motes of light thrown along the cone. */
  bannMotes(x: number, y: number, z: number, yaw: number, range: number, angle: number): void {
    const n = Math.round(40 * (this.maxParticles / 900));
    for (let i = 0; i < n; i++) {
      const a = yaw + (this.rnd() - 0.5) * ((angle * Math.PI) / 180);
      const sp = range * (0.6 + this.rnd() * 0.8);
      this.add({ type: 2, x, y: y + 1.2 + (this.rnd() - 0.5) * 0.4, z, vx: -Math.sin(a) * sp, vy: (this.rnd() - 0.3) * 1.5, vz: -Math.cos(a) * sp, life: 0.45 + this.rnd() * 0.35, size: 0.05 + this.rnd() * 0.05, grow: 0, r: 1, g: 0.85, b: 0.55, em: 2, grav: 0, drag: 2.2, spin: 0, aspect: 1 });
    }
  }

  // ---- combat variety pass -----------------------------------------------------------------------

  /** A blow bounces off a guard: brass sparks off the board's face, towards you. */
  guardSpark(x: number, y: number, z: number, dirX: number, dirZ: number, reducedFlash: boolean): void {
    const n = Math.round(14 * (this.maxParticles / 900));
    for (let i = 0; i < n; i++) {
      const a = (this.rnd() - 0.5) * 2.2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const sp = 2 + this.rnd() * 3;
      this.add({ type: 2, x, y: y + (this.rnd() - 0.5) * 0.4, z, vx: -(dirX * c - dirZ * s) * sp, vy: 0.5 + this.rnd() * 2, vz: -(dirX * s + dirZ * c) * sp, life: 0.25 + this.rnd() * 0.25, size: 0.045, grow: 0, r: 1, g: 0.78, b: 0.35, em: reducedFlash ? 1 : 2.2, grav: 7, drag: 2.5, spin: 0, aspect: 1 });
    }
  }

  /** A guard broken: the board thrown wide, leaves blown out of it. */
  guardBreak(x: number, y: number, z: number): void {
    const n = Math.round(18 * (this.maxParticles / 900));
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      this.add({ type: 3, x, y: y + this.rnd() * 0.6, z, vx: Math.cos(a) * (1.5 + this.rnd() * 2), vy: 1 + this.rnd() * 2.5, vz: Math.sin(a) * (1.5 + this.rnd() * 2), life: 1.2 + this.rnd() * 0.8, size: 0.08 + this.rnd() * 0.05, grow: 0, r: 0.86, g: 0.8, b: 0.66, em: 0, grav: 2, drag: 2.5, spin: (this.rnd() - 0.5) * 14, aspect: 0.06 });
    }
    this.wave(x, y - 0.8, z, 0.4, 2.4, 0.4);
  }

  /** The mirror throws the Bannlicht back: a bright line of motes from it to you. */
  reflectBeam(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, reducedFlash: boolean): void {
    const n = Math.round(30 * (this.maxParticles / 900));
    for (let i = 0; i < n; i++) {
      const k = this.rnd();
      this.add({ type: 2, x: fx + (tx - fx) * k, y: fy + (ty - fy) * k, z: fz + (tz - fz) * k, vx: (this.rnd() - 0.5) * 0.6, vy: (this.rnd() - 0.5) * 0.6, vz: (this.rnd() - 0.5) * 0.6, life: 0.25 + this.rnd() * 0.25, size: 0.05 + this.rnd() * 0.04, grow: 0, r: 0.9, g: 0.96, b: 1, em: reducedFlash ? 1 : 2.6, grav: 0, drag: 3, spin: 0, aspect: 1 });
    }
  }

  /** A mirror cracked / a veil torn: glass splinters (cold) or mist ripped apart. */
  shatter(x: number, y: number, z: number, glass: boolean, reducedFlash: boolean): void {
    const n = Math.round(20 * (this.maxParticles / 900));
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const sp = 2 + this.rnd() * 3;
      if (glass) this.add({ type: 3, x, y, z, vx: Math.cos(a) * sp, vy: 1 + this.rnd() * 2.5, vz: Math.sin(a) * sp, life: 0.7 + this.rnd() * 0.5, size: 0.05 + this.rnd() * 0.05, grow: 0, r: 0.75, g: 0.85, b: 0.95, em: 0, grav: 8, drag: 1, spin: (this.rnd() - 0.5) * 16, aspect: 0.15 });
      else this.add({ type: 1, x, y, z, vx: Math.cos(a) * sp * 0.6, vy: 0.4 + this.rnd(), vz: Math.sin(a) * sp * 0.6, life: 0.7 + this.rnd() * 0.4, size: 0.25 + this.rnd() * 0.2, grow: 1.2, r: 0.7, g: 0.8, b: 0.92, em: 0, grav: -0.2, drag: 2.4, spin: 0, aspect: 1 });
      if (i % 3 === 0) this.add({ type: 2, x, y, z, vx: Math.cos(a) * sp, vy: 1 + this.rnd() * 2, vz: Math.sin(a) * sp, life: 0.3, size: 0.04, grow: 0, r: 0.8, g: 0.92, b: 1, em: reducedFlash ? 1 : 2, grav: 4, drag: 2, spin: 0, aspect: 1 });
    }
  }

  /** Something called out of the fog: a column of grey mist where it rises. */
  emerge(x: number, y: number, z: number): void {
    const n = Math.round(16 * (this.maxParticles / 900));
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const d = this.rnd() * 0.7;
      this.add({ type: 1, x: x + Math.cos(a) * d, y: y + this.rnd() * 0.4, z: z + Math.sin(a) * d, vx: Math.cos(a) * 0.4, vy: 1.2 + this.rnd() * 1.6, vz: Math.sin(a) * 0.4, life: 1.4 + this.rnd() * 0.8, size: 0.4 + this.rnd() * 0.3, grow: 1.3, r: 0.5, g: 0.52, b: 0.58, em: 0, grav: -0.3, drag: 1.2, spin: 0, aspect: 1 });
    }
    this.wave(x, y + 0.08, z, 0.3, 2.2, 0.6, true);
  }

  /** Embers raining into a fire ring (each frame while it fills). */
  emberRain(x: number, y: number, z: number, r: number, k: number, reducedFlash: boolean): void {
    if (this.rnd() > 0.35 + k * 0.5) return;
    const a = this.rnd() * Math.PI * 2;
    const d = Math.sqrt(this.rnd()) * r;
    this.add({ type: 2, x: x + Math.cos(a) * d, y: y + 5 + this.rnd() * 2, z: z + Math.sin(a) * d, vx: (this.rnd() - 0.5) * 0.5, vy: -6 - this.rnd() * 3, vz: (this.rnd() - 0.5) * 0.5, life: 0.9, size: 0.06 + this.rnd() * 0.04, grow: 0, r: 1, g: 0.5, b: 0.12, em: reducedFlash ? 1 : 2.2, grav: 2, drag: 0.2, spin: 0, aspect: 1 });
  }

  /** A hazard lands: a burst of fire, or a stone breaking on the ground. */
  hazardLand(kind: 'fire' | 'stone', x: number, y: number, z: number, r: number, reducedFlash: boolean): void {
    if (kind === 'fire') {
      this.burst(x, y, z, reducedFlash);
      this.wave(x, y + 0.1, z, 0.4, r + 0.6, 0.45);
      return;
    }
    this.dust(x, y, z, r);
    this.wave(x, y + 0.1, z, 0.4, r + 0.8, 0.5);
    const n = Math.round(10 * (this.maxParticles / 900));
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      this.add({ type: 3, x, y: y + 0.3, z, vx: Math.cos(a) * (2 + this.rnd() * 3), vy: 2 + this.rnd() * 3, vz: Math.sin(a) * (2 + this.rnd() * 3), life: 1.4, size: 0.1 + this.rnd() * 0.12, grow: 0, r: 0.5, g: 0.42, b: 0.35, em: 0, grav: 9, drag: 0.3, spin: (this.rnd() - 0.5) * 8, aspect: 0.8 });
    }
  }

  /** Ausfall: a streak of light along the lunge. */
  lungeStreak(x0: number, y: number, z0: number, x1: number, z1: number, reducedFlash: boolean): void {
    const n = Math.round(26 * (this.maxParticles / 900));
    for (let i = 0; i < n; i++) {
      const k = this.rnd();
      this.add({ type: 2, x: x0 + (x1 - x0) * k + (this.rnd() - 0.5) * 0.3, y: y + (this.rnd() - 0.5) * 0.5, z: z0 + (z1 - z0) * k + (this.rnd() - 0.5) * 0.3, vx: 0, vy: 0.3, vz: 0, life: 0.25 + this.rnd() * 0.3, size: 0.04 + this.rnd() * 0.03, grow: 0, r: 1, g: 0.86, b: 0.6, em: reducedFlash ? 0.9 : 1.8, grav: 0, drag: 2, spin: 0, aspect: 1 });
    }
  }

  /** Erdstoß: two shock rings, a crown of dust and chips flung out, cracks of ember light. */
  groundSlam(x: number, y: number, z: number, r: number, reducedFlash: boolean): void {
    this.wave(x, y + 0.1, z, 0.3, r + 0.4, 0.45);
    this.wave(x, y + 0.12, z, 0.2, r * 0.7, 0.7);
    this.dust(x, y, z, r * 0.7);
    const k = this.maxParticles / 900;
    for (let i = 0; i < Math.round(18 * k); i++) {
      const a = this.rnd() * Math.PI * 2;
      const sp = 3 + this.rnd() * 4;
      this.add({ type: 3, x, y: y + 0.15, z, vx: Math.cos(a) * sp, vy: 2 + this.rnd() * 3, vz: Math.sin(a) * sp, life: 1, size: 0.05 + this.rnd() * 0.07, grow: 0, r: 0.42, g: 0.36, b: 0.3, em: 0, grav: 10, drag: 0.6, spin: (this.rnd() - 0.5) * 10, aspect: 0.8 });
    }
    // cracks: lines of low ember sparks running out along the ground
    for (let c = 0; c < 6; c++) {
      const a = (c / 6) * Math.PI * 2 + this.rnd() * 0.5;
      for (let j = 1; j <= 5; j++) {
        const d = (j / 5) * r * 0.85;
        this.add({ type: 2, x: x + Math.cos(a) * d, y: y + 0.06, z: z + Math.sin(a) * d, vx: 0, vy: 0.15, vz: 0, life: 0.5 + j * 0.06, size: 0.07, grow: 0, r: 1, g: 0.55, b: 0.2, em: reducedFlash ? 0.8 : 1.6, grav: 0, drag: 1, spin: 0, aspect: 1 });
      }
    }
  }

  /** Wirbel: a ring of motes swept round you (each frame while it spins). */
  whirl(x: number, y: number, z: number, r: number, t: number, reducedFlash: boolean): void {
    const n = Math.max(2, Math.round(5 * (this.maxParticles / 900)));
    for (let i = 0; i < n; i++) {
      const a = t * 14 + (i / n) * Math.PI * 2;
      const tx = -Math.sin(a);
      const tz = Math.cos(a);
      this.add({ type: 2, x: x + Math.cos(a) * r, y: y + 1 + (this.rnd() - 0.5) * 0.3, z: z + Math.sin(a) * r, vx: tx * 4, vy: 0, vz: tz * 4, life: 0.22, size: 0.05, grow: 0, r: 1, g: 0.85, b: 0.55, em: reducedFlash ? 0.9 : 1.8, grav: 0, drag: 4, spin: 0, aspect: 1 });
    }
  }

  /** Trail motes behind a projectile. */
  private trail(p: Projectile): void {
    const cold = p.kind.startsWith('irrlicht') || p.kind.startsWith('nebelweber');
    const stone = p.kind.startsWith('steinbrecher') || p.kind === 'steinfresser.brocken' || p.kind === 'hazard.stein';
    if (stone) this.add({ type: 1, x: p.x, y: p.y, z: p.z, vx: 0, vy: 0.3, vz: 0, life: 0.6, size: 0.3, grow: 0.6, r: 0.55, g: 0.5, b: 0.45, em: 0, grav: 0, drag: 1, spin: 0, aspect: 1 });
    else this.add({ type: 2, x: p.x, y: p.y, z: p.z, vx: (this.rnd() - 0.5) * 0.5, vy: (this.rnd() - 0.5) * 0.5, vz: (this.rnd() - 0.5) * 0.5, life: 0.3, size: 0.06, grow: 0, r: cold ? 0.6 : 1, g: cold ? 0.85 : 0.3, b: cold ? 1 : 0.1, em: 1.4, grav: 0, drag: 1, spin: 0, aspect: 1 });
  }

  // ---- body pose ---------------------------------------------------------------------------------

  private partWorld(e: Enemy, v: Vis, p: BodyPart, out: Vector3): Vector3 {
    this.bodyMatrix(e, v, p, _m);
    return out.set(0, 0, 0).applyMatrix4(_m);
  }

  /** Matrix of a part (without its own size / local rotation for puffs). */
  private bodyMatrix(e: Enemy, v: Vis, p: BodyPart, out: Matrix4): Matrix4 {
    const time = e.t + e.seed * 10;
    let lx = p.r;
    let ly = p.y;
    let lz = -p.f;
    // bone channels
    const armSign = p.bone === 'armL' ? 1 : p.bone === 'armR' ? -1 : 0;
    if (armSign !== 0) {
      // arms swing up (wind-up) and down (strike) about the shoulder
      const a = v.arm * (p.bone === 'armR' ? 1 : 0.85);
      const py = v.t.shoulder;
      const dy = ly - py;
      const dz = lz;
      ly = py + dy * Math.cos(a) - dz * Math.sin(a);
      lz = dy * Math.sin(a) + dz * Math.cos(a);
      if (e.kind === 'schuldbuch') {
        // the covers flap like wings
        lx *= 1 - 0.25 * Math.sin(v.arm);
      }
    }
    if (p.bone === 'flap') {
      const fl = Math.sin(time * (e.kind === 'mahnbrief' ? 9 : 2.5) + p.seed * 6);
      if (e.kind === 'mahnbrief') ly += fl * Math.abs(lx) * 0.6;
      else {
        lx += Math.cos(time * 3 + p.seed * 9) * 0.12;
        ly += fl * 0.12;
        lz += Math.sin(time * 2.2 + p.seed * 7) * 0.12;
      }
    }
    if (p.bone === 'legs' && (e.state === 'approach' || e.state === 'circle')) ly += Math.abs(Math.sin(time * 6 + p.seed * 3)) * 0.04;
    // walking legs swing about the hip
    if (p.gait) {
      const [py, pf, ph, amp] = p.gait;
      const a = Math.sin(v.walk * (e.boss ? 5.5 : 9) + ph) * amp * Math.min(1, this.moving(e));
      const dy = ly - py;
      const dz = lz + pf;
      ly = py + dy * Math.cos(a) - dz * Math.sin(a);
      lz = dy * Math.sin(a) + dz * Math.cos(a) - pf;
    }
    if (p.bone === 'hound') ly += Math.abs(Math.sin(v.walk * 9 + p.r)) * 0.06 * this.moving(e);
    // pages that turn: about a vertical axis at the spine
    if (p.turn) {
      const a = this.turnAngle(p, time);
      const pr = p.turn[3];
      const pz = -p.turn[4];
      const dx = lx - pr;
      const dz = lz - pz;
      lx = pr + dx * Math.cos(a) + dz * Math.sin(a);
      lz = pz - dx * Math.sin(a) + dz * Math.cos(a);
    }
    if (p.orbit) {
      const a = time * p.orbit[0] + p.orbit[1];
      const ox = lx;
      lx = ox * Math.cos(a) + lz * Math.sin(a);
      lz = -ox * Math.sin(a) + lz * Math.cos(a);
    }
    if (p.bone === 'core') {
      ly += Math.sin(time * 2.1) * 0.06;
    }
    if (p.bone === 'tail') lx += Math.sin(time * 5) * 0.05;
    // breathing / bob of the whole body
    const bob = e.kind === 'irrlicht' || e.kind === 'mahnbrief' ? Math.sin(time * 2.2 + e.seed * 5) * 0.12 : Math.sin(time * 2 + e.seed * 5) * 0.025;
    const c = v.t.shoulder * 0.5;
    _v.set(lx, ly - c, lz).multiplyScalar(v.swell);
    _v.y += c;
    // lean about the hips (rear back on the wind-up, forward on the strike)
    _q.setFromAxisAngle(_ax, -v.lean);
    _v.applyQuaternion(_q);
    _v.y += bob - v.sink;
    out.makeRotationY(e.heading);
    _v.applyMatrix4(out);
    // the flinch: a shove away from the blow (big bodies barely move)
    const shove = v.flinch * (e.boss ? 0.06 : 0.22 / Math.max(1, e.size));
    out.setPosition(e.x + _v.x + e.hitX * shove, e.y + _v.y, e.z + _v.z + e.hitZ * shove);
    return out;
  }

  /** Page-turn angle of a part (radians). */
  private turnAngle(p: BodyPart, time: number): number {
    const [rate, amp, ph] = p.turn!;
    // a page lifts, swings over and settles: a smoothed sawtooth
    const c = (time * rate + ph) / (Math.PI * 2);
    const f = c - Math.floor(c);
    const s = f < 0.55 ? 0.5 - 0.5 * Math.cos((f / 0.55) * Math.PI) : 1;
    return -amp * 0.5 + amp * s;
  }

  /** 0..1: is it walking (legs, gallop)? */
  private moving(e: Enemy): number {
    if (e.state === 'approach' || e.state === 'circle' || e.state === 'retreat' || e.state === 'return' || e.state === 'flee' || e.state === 'leave') return 1;
    if (e.state === 'strike' && e.dash) return 1.4;
    if (e.state === 'idle') return 0.35;
    return 0;
  }

  // ---- frame -----------------------------------------------------------------------------------

  frame(f: VisualFrame): void {
    const dt = f.frozen ? 0 : Math.min(0.1, f.dt);
    const cam = f.camera.position;
    const px = (2 * Math.tan(((f.camera.fov * Math.PI) / 180) / 2)) / Math.max(1, f.viewportH);
    this.glowMat.uniforms.uPixel!.value = px;
    this.solids.outlineMat.uniforms.uPixel!.value = px;
    this.puffs.n = 0;
    this.glows.n = 0;
    this.solids.n = 0;
    this.ringPool.n = 0;
    const seen = new Set<string>();
    this.rigs.begin();
    for (const e of f.enemies) {
      seen.add(e.id);
      this.drawEnemy(e, f, dt);
    }
    this.rigs.end();
    for (const id of [...this.vis.keys()]) if (!seen.has(id)) this.vis.delete(id);
    // telegraph rings
    for (const r of f.rings) {
      const y = this.groundY(f, r.x, r.z, r.r);
      const fill = Math.min(1, r.t / Math.max(0.01, r.dur));
      this.ringPool.push(r.x, y, r.z, r.r, fill, f.reducedFlash ? 0.75 : 1, r.kind === 'rain' ? 1 : r.kind === 'landing' ? 2 : 0);
      // an era hazard filling up: embers falling into it (combat variety pass)
      if (r.owner === 'hazard' && r.kind === 'rain' && dt > 0) this.emberRain(r.x, y, r.z, r.r, fill, f.reducedFlash);
    }
    // running rings (kills, bosses)
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]!;
      w.t += dt;
      const k = w.t / w.dur;
      if (k >= 1) {
        this.waves.splice(i, 1);
        continue;
      }
      const ease = 1 - (1 - k) * (1 - k);
      this.ringPool.push(w.x, w.y, w.z, w.r0 + (w.r1 - w.r0) * ease, w.cold ? 1 : 0, (1 - k) * (f.reducedFlash ? 0.5 : 0.95), 7);
    }
    // projectiles
    for (const p of f.projectiles) {
      if (!f.frozen) this.trail(p);
      if (p.kind === 'hazard.stein') {
        // a dressed block falling out of the night onto its ring
        _q.setFromEuler(_e.set(p.t * 2, p.t * 1.3, 0));
        _m2.compose(_p.set(p.x, p.y, p.z), _q, _s.set(0.8, 0.5, 0.6));
        this.solids.push(_m2, 0.55, 0.45, 0.37, 0, 0, 0, 1);
      } else if (p.kind.startsWith('steinbrecher')) {
        _q.setFromEuler(_e.set(p.t * 3, p.t * 2, 0));
        _m2.compose(_p.set(p.x, p.y, p.z), _q, _s.set(0.7, 0.55, 0.6));
        this.solids.push(_m2, 0.5, 0.41, 0.34, 0.25, 0.08, 0.01, 1);
      } else if (p.kind === 'nebelweber.frostkugel') {
        this.glows.push(p.x, p.y, p.z, 0.42, 2.2, 0.62, 0.86, 1, 7);
        this.glows.push(p.x, p.y, p.z, 1.1, 0.8, 0.3, 0.5, 0.8, 0);
      } else if (p.kind === 'steinfresser.brocken') {
        _q.setFromEuler(_e.set(p.t * 4, p.t * 3, 0));
        _m2.compose(_p.set(p.x, p.y, p.z), _q, _s.set(0.45, 0.38, 0.42));
        this.solids.push(_m2, 0.45, 0.37, 0.3, 0, 0, 0, 1);
      } else if (p.kind.startsWith('irrlicht') || p.kind.startsWith('nebelweber')) this.glows.push(p.x, p.y, p.z, 0.2, 2.2, 0.6, 0.85, 1, 5);
      else this.glows.push(p.x, p.y, p.z, 0.24, 2.4, 1, 0.3, 0.1, 5);
    }
    // the Bannlicht on the ground
    if (f.bann && f.bann.t > 0) {
      const b = f.bann;
      const y = f.heightAt(b.x, b.z) + 0.15;
      this.ringPool.push(b.x, y, b.z, b.range, b.t, (f.reducedFlash ? 0.35 : 0.6) * b.t, 4, b.yaw, ((b.angle * Math.PI) / 180) / 2);
    }
    this.particles(dt, f);
    this.puffs.end(cam);
    this.glows.end();
    this.solids.end();
    this.ringPool.end();
  }

  private groundY(f: VisualFrame, x: number, z: number, r: number): number {
    let y = f.heightAt(x, z);
    const k = r * 0.7;
    y = Math.max(y, f.heightAt(x + k, z), f.heightAt(x - k, z), f.heightAt(x, z + k), f.heightAt(x, z - k));
    return y + 0.12;
  }

  private drawEnemy(e: Enemy, f: VisualFrame, dt: number): void {
    const v = this.template(e);
    // pose targets from the AI state
    let lean = 0;
    let arm = 0;
    let swell = 1;
    let tell = 0;
    let sink = 0;
    switch (e.state) {
      case 'windup': {
        const w = Math.min(1, e.t / Math.max(0.01, e.windup));
        lean = -0.28 * w;
        arm = 1.6 * w;
        swell = 1 + 0.08 * w + (e.kind === 'glutling' ? 0.9 * w : 0);
        tell = 0.5 + 0.5 * w;
        if (e.kind === 'streuner') sink = 0.22 * w; // crouch before the pounce
        if (e.attack?.kind === 'summon') arm = 2.2 * w;
        break;
      }
      case 'strike':
        lean = 0.35;
        arm = -0.5;
        tell = 0.6;
        break;
      case 'recover':
        lean = 0.15 * Math.max(0, 1 - e.t * 2);
        break;
      case 'stagger':
        lean = Math.sin(e.t * 28) * 0.12;
        break;
      case 'gebannt':
        sink = e.kind === 'irrlicht' || e.kind === 'mahnbrief' ? 0 : 0.12;
        lean = 0.2;
        break;
      case 'roar':
        arm = 2.4;
        lean = -0.3;
        swell = 1.08;
        tell = 0.8;
        break;
      case 'intro': {
        // the reveal: it gathers itself, rises, throws up its arms and flares
        const k = Math.min(1, e.t / 1.2);
        arm = 2.5 * k;
        lean = -0.32 * k;
        swell = 1 + 0.1 * k;
        tell = 0.2 + 0.25 * k;
        sink = 0.25 * (1 - k);
        break;
      }
      case 'retreat':
        lean = -0.15;
        break;
      case 'notice':
        lean = -0.12;
        tell = 0.4;
        break;
      case 'leave':
        lean = 0.1;
        break;
      default:
        break;
    }
    // combat variety pass: a broken guard hangs open; a called one rises out of the ground
    if (e.guardBroken > 0 && e.state !== 'windup' && e.state !== 'strike') arm = -1.1;
    if (e.rise > 0) sink += e.rise * Math.min(2, this.template(e).t.top);
    // a new staff hit: flinch away from it
    if (e.flash > 0.95 && v.lastFlash < 0.9) v.flinch = 1;
    v.lastFlash = e.flash;
    v.flinch = Math.max(0, v.flinch - dt * 5.5);
    lean -= v.flinch * (e.boss ? 0.08 : 0.38);
    v.walk += dt * this.moving(e);
    const k = Math.min(1, dt * 12);
    v.lean += (lean - v.lean) * k;
    v.arm += (arm - v.arm) * Math.min(1, dt * (e.state === 'strike' ? 30 : 10));
    v.swell += (swell - v.swell) * k;
    v.tell += (tell - v.tell) * Math.min(1, dt * 10);
    v.sink += (sink - v.sink) * k;
    const dissolving = e.state === 'dissolve';
    const leaving = e.state === 'leave';
    if (dissolving || leaving) v.fade = Math.min(1, v.fade + dt * (leaving ? 0.3 : 1.6));
    else v.fade = Math.max(0, v.fade - dt * 3);
    const alpha = 1 - v.fade;
    // in the way of the lens: the camera wedged into its hull, or the body between the camera and
    // what the view is looking at — it thins to a dither so the fight behind it stays readable
    const want = occlusionVis(e, v, f);
    v.vis += (want - v.vis) * Math.min(1, dt > 0 ? dt * 10 : 1);
    const vis = v.vis;
    const stunned = e.stun > 0;
    const flash = e.flash;
    const pulse = 0.75 + 0.25 * Math.sin(f.time * 18);
    const tellK = v.tell * (e.state === 'windup' ? pulse : 1);
    // a rigged body (its models loaded): the model draws the body, the template only its extras
    const rigged = this.rigs.ready(e);
    if (rigged) {
      const dis = dissolving ? Math.min(1, Math.max(0, (e.t - 0.08) / 1.3)) : 0;
      if (dis < 1)
        this.rigs.draw(e, { lean: v.lean, sink: v.sink, tellK, flash, flinch: v.flinch, stunned, fade: Math.max(leaving ? v.fade : 0, (1 - vis) * 0.7), dissolve: dis, reducedFlash: f.reducedFlash, frozen: f.frozen }, dt, (x, y, z, size, I, r, g, b, px) => this.glows.push(x, y, z, size, I, r, g, b, px));
    }
    if (alpha <= 0.01) return;
    // undone: a quick swell before it comes apart (a pop, not a fade)
    if (dissolving && e.t < 0.14) v.swell = 1 + 0.2 * Math.sin((e.t / 0.14) * Math.PI);
    const wakeK = e.aggro ? 1 : 0.65;
    // weak point open (seal) / armour broken: glows harder
    const sealK = e.kind === 'schuldbuch' ? (e.sealOpen > 0 ? 2.4 + Math.sin(f.time * 10) * 0.6 : 0.5) : e.armorBroken > 0 ? 1.8 : 1;
    const rise = dissolving ? v.fade * 0.8 : 0;
    for (const p of v.t.parts) {
      // on a rig only the extras draw, plus the template's smoke as a faint fraying aura
      if (rigged && !p.onRig && (p.kind !== 'puff' || (p.style ?? 0) > 0.5)) continue;
      const aura = rigged && !p.onRig ? 0.2 : 1;
      this.bodyMatrix(e, v, p, _m);
      _p.set(0, 0, 0).applyMatrix4(_m);
      _p.y += rise * (0.5 + p.seed);
      if (p.kind === 'puff') {
        const em = p.em ?? [0, 0, 0];
        const fl = flash * 0.6;
        const heat = 1 + tellK * 1.2;
        const cold = stunned ? 0.35 : 0;
        this.puffs.push(_p.x, _p.y, _p.z, p.size * v.swell * (1 + v.fade * 0.6) * (aura < 1 ? 1.25 : 1), (p.alpha ?? 1) * alpha * aura * (stunned ? 0.75 : 1) * (0.2 + 0.8 * vis), p.seed, p.style ?? 0, p.col[0] + fl, p.col[1] + fl, p.col[2] + fl, em[0] * heat + v.t.tell[0] * tellK * 0.25 + cold * 0.2, em[1] * heat + v.t.tell[1] * tellK * 0.25 + cold * 0.35, em[2] * heat + v.t.tell[2] * tellK * 0.25 + cold * 0.5);
      } else if (p.kind === 'glow') {
        let I = (p.alpha ?? 1) * alpha * wakeK;
        let size = p.size * v.swell;
        const isEye = (p.style ?? 0) >= 4;
        if (isEye || p.bone === 'core') {
          I *= 1 + tellK * 1.6 + flash;
          size *= 1 + tellK * 0.6;
        }
        if (p.bone === 'seal') I *= sealK * (1 + tellK);
        if (stunned) I *= p.bone === 'core' ? 0.5 : 0.6;
        if (f.reducedFlash) I = Math.min(I, 2.2);
        const aura = e.elite && isEye ? eliteAura(e.kind) : null;
        const col = stunned && p.bone === 'core' ? ([0.7, 0.85, 1] as const) : aura ?? p.col;
        if (aura) I *= 1.5;
        this.glows.push(_p.x, _p.y, _p.z, size, I * 1.4 * (0.45 + 0.55 * vis), col[0], col[1], col[2], p.style ?? 0);
        if (p.fire && dt > 0 && !dissolving) this.flames(_p.x, _p.y, _p.z, p.fire * dt * (e.state === 'windup' ? 1.8 : 1), p.size, f.reducedFlash, v);
      } else {
        const em = p.em ?? [0, 0, 0];
        const fl = flash * 0.35;
        // orientation: heading · lean · arm swing · the part's own tilt
        const q = _qa.setFromAxisAngle(_ay, e.heading);
        q.multiply(_qb.setFromAxisAngle(_ax, -v.lean));
        if (p.bone === 'armL' || p.bone === 'armR') q.multiply(_qb.setFromAxisAngle(_ax, v.arm * (p.bone === 'armR' ? 1 : 0.85)));
        if (p.turn) q.multiply(_qb.setFromAxisAngle(_ay, this.turnAngle(p, e.t + e.seed * 10)));
        if (p.orbit) q.multiply(_qb.setFromAxisAngle(_ay, (e.t + e.seed * 10) * p.orbit[0] + p.orbit[1]));
        if (p.gait) {
          const a = Math.sin(v.walk * (e.boss ? 5.5 : 9) + p.gait[2]) * p.gait[3] * Math.min(1, this.moving(e));
          q.multiply(_qb.setFromAxisAngle(_ax, a));
        }
        q.multiply(_q.setFromEuler(_e.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0)));
        const shrink = dissolving ? Math.max(0.01, 1 - v.fade) : 1;
        _s.set(p.size * v.swell * shrink, (p.sy ?? p.size) * v.swell * shrink, (p.sz ?? p.size) * v.swell * shrink);
        _m2.compose(_p, q, _s);
        const seal = p.bone === 'seal' ? sealK : 1;
        const thin = Math.min(p.size, p.sy ?? p.size, p.sz ?? p.size) < 0.07;
        this.solids.push(_m2, p.col[0] + fl, p.col[1] + fl, p.col[2] + fl, em[0] * seal * (1 + tellK) + fl * 0.5, em[1] * seal * (1 + tellK) + fl * 0.5, em[2] * seal * (1 + tellK) + fl * 0.5, p.mat ?? 0, vis, !thin);
      }
    }
    // the elite: an ember halo on the ground, three motes circling over its head
    if (e.elite && !dissolving) {
      const y = this.groundY(f, e.x, e.z, e.radius);
      this.ringPool.push(e.x, y, e.z, e.radius + 0.75, 1, f.reducedFlash ? 0.6 : 0.9, 5);
      const c = eliteAura(e.kind);
      for (let i = 0; i < 3; i++) {
        const a = f.time * 2.4 + (i / 3) * Math.PI * 2;
        this.glows.push(e.x + Math.cos(a) * 0.35 * e.size, e.y + v.t.top + 0.25, e.z + Math.sin(a) * 0.35 * e.size, 0.07, f.reducedFlash ? 1.2 : 2, c[0], c[1], c[2], 3);
      }
      // low enough for the Gnadenstoß: a white beat round it and a white heart
      if (e.finishable) {
        this.ringPool.push(e.x, y + 0.01, e.z, e.radius + 1.0, 1, 1, 6);
        const beat = 0.6 + 0.4 * Math.sin(f.time * 9);
        this.glows.push(e.x, e.y + v.t.top * 0.55, e.z, 0.35, (f.reducedFlash ? 1.2 : 2.4) * beat, 1, 0.97, 0.9, 6);
      }
    }
    // veiled (the Nebelweberin's Schleier): a pale shell of mist motes turning round it
    if (e.ward > 0 && !dissolving) {
      const top = v.t.top;
      for (let i = 0; i < 7; i++) {
        const a = f.time * 1.6 + (i / 7) * Math.PI * 2;
        const h = e.y + top * (0.2 + 0.6 * ((i * 0.37) % 1));
        this.glows.push(e.x + Math.cos(a) * (e.radius + 0.25), h, e.z + Math.sin(a) * (e.radius + 0.25), 0.09, f.reducedFlash ? 1 : 1.8, 0.7, 0.88, 1, 3);
      }
      this.glows.push(e.x, e.y + top * 0.5, e.z, e.radius + top * 0.45, f.reducedFlash ? 0.25 : 0.4, 0.45, 0.6, 0.85, 0);
    }
    // the prologue's veil (a Streuner under a Schleier): a ring on the ground and a slow shell of
    // mist motes give its place away in bright daylight (playtest: only the nameplate showed)
    if (e.veil && !dissolving) {
      const gy = this.groundY(f, e.x, e.z, e.radius);
      this.ringPool.push(e.x, gy + 0.02, e.z, e.radius + 0.55, 1, 0.85, 3);
      const top = v.t.top;
      for (let i = 0; i < 6; i++) {
        const a = -f.time * 1.2 + (i / 6) * Math.PI * 2;
        this.glows.push(e.x + Math.cos(a) * (e.radius + 0.3), e.y + top * (0.25 + 0.12 * i), e.z + Math.sin(a) * (e.radius + 0.3), 0.11, f.reducedFlash ? 1 : 1.6, 0.75, 0.9, 1, 3);
      }
    }
    // a mirror: the core flares cold-white while uncracked, dims and flickers once cracked
    if (e.def.reflectsBann && !dissolving) {
      const I = e.cracked ? 0.4 + 0.4 * Math.max(0, Math.sin(f.time * 23)) : 1.2 + 0.3 * Math.sin(f.time * 4);
      this.glows.push(e.x, e.y, e.z, 0.2, (f.reducedFlash ? Math.min(I, 1) : I) * 0.9, 0.92, 0.97, 1, 4);
    }
    // gebannt: a turning pale ring under it
    if (stunned && !dissolving) {
      const y = this.groundY(f, e.x, e.z, e.radius);
      this.ringPool.push(e.x, y, e.z, e.radius + 0.6, 1, 0.9, 3);
    }
  }

  private particles(dt: number, f: VisualFrame): void {
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.age += dt;
      if (p.age >= p.life) {
        P.splice(i, 1);
        continue;
      }
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.vy = p.vy * drag - p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
      if (p.grav > 0 && p.type !== 2) {
        const g = f.heightAt(p.x, p.z) + 0.03;
        if (p.y < g) {
          p.y = g;
          p.vy = Math.abs(p.vy) * 0.25;
          p.vx *= 0.5;
          p.vz *= 0.5;
        }
      }
      const t = p.age / p.life;
      const fade = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      if (p.type === 2) this.glows.push(p.x, p.y, p.z, p.size * (1 - t * 0.5), p.em * fade, p.r, p.g, p.b, 2);
      else if (p.type === 3) {
        _q.setFromEuler(_e.set(p.rot, p.rot * 0.7, p.rot * 0.3));
        const s = p.size * (t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1);
        _m2.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, s * p.aspect, s));
        // paper greys as it rises
        const grey = p.aspect < 0.1 ? t * 0.5 : 0;
        this.solids.push(_m2, p.r * (1 - grey) + 0.3 * grey, p.g * (1 - grey) + 0.3 * grey, p.b * (1 - grey) + 0.3 * grey, 0, 0, 0, 0, 1, false);
      } else this.puffs.push(p.x, p.y, p.z, p.size * (1 + p.grow * t), fade * (p.type === 1 ? 0.7 : 0.85), p.seed, p.type, p.r, p.g, p.b, p.em * 1.0, p.em * 0.35, p.em * 0.08);
    }
  }

  dispose(): void {
    this.rigs.dispose();
    this.object.removeFromParent();
    this.object.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    this.puffMat.dispose();
    this.glowMat.dispose();
    this.solids.outlineMat.dispose();
    this.ringPool.mat.dispose();
  }
}
