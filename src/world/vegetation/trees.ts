import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  type Object3D,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  type Texture,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { ATMOS_GLSL, SEE_FRAG_GLSL, SEE_GLSL } from '../atmosphere';
import { FOLIAGE_GLSL } from './foliage';

/**
 * CC0 model trees (docs/ART-DIRECTION.md §5.2): stylised Quaternius trees (Stylized Nature
 * MegaKit via poly.pizza: common broadleaf, pine, twisted, dead) in three levels of detail:
 *
 *   lod0  the model as authored (bark with normal map, leaf-clump cards with crown normals)
 *   lod1  bark simplified to ≈ 25 %, every second leaf card grown ×1.35 (pnpm assets:set --lod1)
 *   far   a baked impostor: each variant rendered once from 8 sides into an atlas (normal xy,
 *         albedo luminance + bark / leaf flag, coverage), lit at runtime like the models so the
 *         far stand has the same hues, light and shadow side as the near trees
 *
 * Neighbouring levels cross-fade with a screen-space dither over a few metres (no popping). One
 * draw call per variant and level, one for all impostors. The leaf colour comes from the season
 * (foliage.ts), so the same models serve summer 1789, autumn 2025 and the thinned 1796 crowns;
 * February 1793 swaps the broadleaf crowns for the bare (dead) models.
 */

export const TREE_FAMILIES = ['common', 'pine', 'twisted', 'dead'] as const;
export type TreeFamily = (typeof TREE_FAMILIES)[number];
/** Forest kind (0 beech, 1 spruce, 2 oak) the family's leaves are coloured as. */
const FAMILY_KIND = [0, 1, 2, 0];
/** Variant node names in models/nature2/trees.glb (pnpm assets:set). */
export const TREE_VARIANTS: { name: string; family: number }[] = [
  ...[1, 2, 3, 4, 5].map((i) => ({ name: `common${i}`, family: 0 })),
  ...[1, 2, 4, 5].map((i) => ({ name: `pine${i}`, family: 1 })),
  ...[2, 3, 5].map((i) => ({ name: `twisted${i}`, family: 2 })),
  ...[1, 2, 3, 4].map((i) => ({ name: `dead${i}`, family: 3 })),
];
/** Impostor views around each variant. */
const AZ = 8;
/** Instance records: aInst (x, y, z, height), aVar (rotation, variant + var, dither lo, hi). */
const MAX_LOD0 = 900;
const MAX_LOD1 = 2600;
const MAX_IMP = 40000;
/** Impostors that may cast sun shadows (the nearest within the shadow box's reach). */
const MAX_IMP_SHADOW = 6000;

/**
 * LOD rings (× k = preset · tree height): lod0 → lod1 at `TREE_N0`, lod1 → impostor at `TREE_N1`,
 * each cross-faded over ± `TREE_BAND`. Tri budget phase B (docs/PERFORMANCE.md §3.5) moved the
 * impostor switch from 78 to 72 (60 and 66 were tried: the pines across the Weiher, ~70–90 m out,
 * then read visibly flatter as impostors than as lod1 in an A/B flip).
 */
export const TREE_N0 = 30;
export const TREE_N1 = 72;
export const TREE_BAND = 5;
/**
 * lod1 → impostor ring of the shadow casters (× k, from the camera), cross-faded like the
 * picture's. Nearer than the picture's ring: an impostor's shadow is the tree's baked outline seen
 * from the sun's side, and past 60 m it cannot be told from the lod1 shadow (TASK-088 look pairs at
 * seven views on Mittel and Hoch: 0.03–0.5 of 255 mean difference). It pays for the casters that
 * the picture leaves out and that now cast: 13–25 % fewer triangles in the shadow pass.
 */
export const CAST_N1 = 60;

/**
 * Shadow casters (phase B): the shadow pass draws every model tree with the lod1 geometry (lod0
 * trees too: in a 2048² map over ±75 m a texel is 7 cm, the lod0 bark and card detail do not show),
 * and only the trees whose shadow can fall into the shadow box (`castGap`): the CPU lists leave
 * the others out, the vertex shaders (`CAST_GLSL`) collapse what the lists keep for the focus's
 * drift, so the shadows in the picture depend on where the box is and on nothing else (the
 * forest also leaves out trees whose shadow the picture cannot show, `shadowInSector`).
 *
 * `SHADOW_REACH` (m) is a crown's half width, added to the box's radius. Until TASK-088 the rule
 * was a plain disc, box + 30 m: under the low sun of the day eras (19–20°) a 25 m tree throws its
 * shadow 70 m, so trees on the sun's side entered and left the casters with their shadow already
 * well inside the box, and patches of ground flashed lit or shaded as the box moved with the view.
 */
export const SHADOW_REACH = 12;
/** A shadow's length over `height / tan(sun elevation)`: room for ground that falls away from the sun. */
export const CAST_STRETCH = 1.15;
/** Longest shadow (m) a tree is drawn for: at a grazing sun it thins out before it gets there. */
export const CAST_MAX = 100;

/** How far (m) the shadow of a tree of height `h` reaches on level ground, sun `sunY` = sin(elevation) (pure; tested). */
export function shadowLength(h: number, sunY: number): number {
  const sy = Math.min(1, Math.max(0.05, sunY));
  return Math.min(CAST_MAX, (CAST_STRETCH * h * Math.sqrt(1 - sy * sy)) / sy);
}

/**
 * Distance (m) from a point (fx, fz) to the shadow of the tree at (x, z), height `h`: the line
 * from its foot away from the sun (unit direction `sun`, pointing at it) to the shadow's tip
 * (pure; tested; `kqCastGap` in GLSL). 1-Lipschitz in the point: a focus that drifts by d changes
 * it by at most d.
 */
export function castGap(x: number, z: number, h: number, fx: number, fz: number, sunX: number, sunY: number, sunZ: number): number {
  const dx = fx - x;
  const dz = fz - z;
  const sl = Math.hypot(sunX, sunZ);
  if (sl < 1e-4) return Math.hypot(dx, dz);
  const ax = -sunX / sl;
  const az = -sunZ / sl;
  const t = Math.min(shadowLength(h, sunY), Math.max(0, dx * ax + dz * az));
  return Math.hypot(dx - ax * t, dz - az * t);
}

/** `castGap` for the shadow pass's vertex shaders (needs the atmosphere uniforms). */
const CAST_GLSL = /* glsl */ `
float kqCastGap(vec2 tree, float h) {
  vec2 d = uShadowCenter.xz - tree;
  float sl = length(uSunDir.xz);
  if (sl < 1e-4) return length(d);
  float sy = clamp(uSunDir.y, 0.05, 1.0);
  vec2 away = -uSunDir.xz / sl;
  float reach = min(${CAST_MAX.toFixed(1)}, ${CAST_STRETCH.toFixed(2)} * h * sqrt(1.0 - sy * sy) / sy);
  return length(d - away * clamp(dot(d, away), 0.0, reach));
}
`;

/** Shadow-pass level of a main-pass level: lod0 casts as lod1 (pure; tested). */
export function shadowLevel(level: number): number {
  return level === 0 ? 1 : level;
}

/** Number of leading entries of an ascending list (first `n`) that are ≤ `limit` (pure; tested). */
export function castCount(sorted: ArrayLike<number>, n: number, limit: number): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= limit) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Level for a tree at distance d (pure; tested): which levels draw it and the dither split.
 * Rings scale with `k` (preset · tree height). Returns [level, lo, hi] pairs (1 or 2 entries).
 */
export function treeLevels(d: number, k: number, out: number[], impAt = TREE_N1): number {
  const n0 = TREE_N0 * k;
  const n1 = impAt * k;
  const b = TREE_BAND * k;
  out.length = 0;
  if (d < n0 - b) out.push(0, 0, 2);
  else if (d < n0 + b) {
    const t = (d - (n0 - b)) / (2 * b);
    out.push(0, t, 2, 1, 0, t);
  } else if (d < n1 - b) out.push(1, 0, 2);
  else if (d < n1 + b) {
    const t = (d - (n1 - b)) / (2 * b);
    out.push(1, t, 2, 2, 0, t);
  } else out.push(2, 0, 2);
  return out.length / 3;
}

/** Variant for a tree (pure; tested): family from the forest kind, the season and a snag chance. */
export function pickVariant(kind: number, v: number, snag: number, winter: boolean, snagRate: number): number {
  let fam = kind === 1 ? 1 : kind === 2 ? 2 : 0;
  if (fam !== 1 && (winter || snag < snagRate)) fam = 3;
  const list = FAMILY_VARIANTS[fam]!;
  return list[Math.min(list.length - 1, Math.floor(v * list.length))]!;
}
const FAMILY_VARIANTS: number[][] = TREE_FAMILIES.map((_, f) => TREE_VARIANTS.flatMap((tv, i) => (tv.family === f ? [i] : [])));

// ---- shaders --------------------------------------------------------------------------------

/**
 * Tree proportions (GLSL; mirrored by `treeScaleY` in TS for tests): the kit's trees are 7–19 m
 * and stout. A stand tree of height h keeps the model's crown at scale C = min(h·k, max) (uCrown =
 * k, max per family); the part below the crown base yc (aShape.x, unit height) stretches so the
 * tree is h tall; bark below the crown is slimmed by aShape.y (towards the crown it flares back
 * into the branches).
 */
const SHAPE_GLSL = /* glsl */ `
float treeY(float y, float yc, float h, float C) {
  float a = max(C, (h - (1.0 - yc) * C) / yc);
  return y < yc ? y * a : yc * a + (y - yc) * C;
}
vec2 treePrune(vec3 p, float part, vec3 shape) {
  // stand trees shed their low limbs: bark below the crown base further out than the trunk
  // (shape.z, 0 = never) is pulled in onto the trunk, so the stretched stem stays clean
  vec2 xz = p.xz;
  if (part < 0.5 && shape.z > 0.0 && p.y < shape.x - 0.03) {
    float r = length(xz);
    float lim = shape.z * 1.7;
    if (r > lim) xz *= mix(lim / r, 1.0, smoothstep(shape.x - 0.1, shape.x - 0.03, p.y));
  }
  return xz;
}
vec3 treeScale(vec3 p, float part, vec3 shape, float h, vec2 crown) {
  float C = min(h * crown.x, crown.y);
  float thin = part > 0.5 ? 1.0 : mix(shape.y, 1.0, smoothstep(shape.x - 0.12, shape.x + 0.06, p.y));
  vec2 xz = treePrune(p, part, shape) * C * thin;
  return vec3(xz.x, treeY(p.y, shape.x, h, C), xz.y);
}
`;

/** World height of unit height y for a tree of height h (pure; tested; same as treeY in GLSL). */
export function treeScaleY(y: number, yc: number, h: number, k: number, max: number): number {
  const C = Math.min(h * k, max);
  const a = Math.max(C, (h - (1 - yc) * C) / yc);
  return y < yc ? y * a : yc * a + (y - yc) * C;
}

/** Crown scale factor and maximum (m) per family: common, pine, twisted, dead. */
export const FAMILY_CROWN: [number, number][] = [
  [0.75, 21],
  [0.66, 21],
  [0.85, 24],
  [0.75, 21],
];

const MODEL_VERT = /* glsl */ `
${ATMOS_GLSL}
${SEE_GLSL}
attribute float aPart;
attribute float aAo;
attribute float aSeed;
attribute vec3 aShape;
attribute vec4 aInst;
attribute vec4 aVar;
uniform vec2 uCrown;
uniform float uFar;
uniform float uScanMix;
uniform float uMapMix;
uniform vec3 uScanCenter;
uniform float uScanRadius;
uniform float uKind;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vPart;
varying float vAo;
varying float vVar;
varying vec2 vDither;
varying float vH;
varying float vSee;
${FOLIAGE_GLSL}
${SHAPE_GLSL}
${CAST_GLSL}
void main() {
  float h = aInst.w;
  float dist = length(aInst.xz - uCamPos.xz);
  float fade = 1.0 - smoothstep(uFar * 0.82, uFar, dist);
  float sr = length(aInst.xz - uScanCenter.xz);
  fade *= 1.0 - smoothstep(0.0, 0.8, max(uScanMix, uMapMix)) * (1.0 - smoothstep(uScanRadius * 0.85, uScanRadius, sr));
  float var = fract(aVar.y);
  float c = cos(aVar.x), s = sin(aVar.x);
  vec3 p = position;
  // thinner crowns in late autumn: whole cards drop out (degenerate), by their own seed
  if (aPart > 0.5 && uKind != 1.0 && aSeed > leafDensity() + 0.04) p = vec3(0.0);
  float wide = 0.9 + 0.25 * var;
  // proportions (treeScale): the crown keeps its shape at scale C, the trunk below it stretches
  // to the stand height and is slimmed (the kit's trees are short and stout)
  vec3 q = treeScale(p, aPart, aShape, h, uCrown);
  q.xz *= wide;
  q = vec3(c * q.x - s * q.z, q.y, s * q.x + c * q.z);
  vec3 nn = vec3(c * normal.x - s * normal.z, normal.y, s * normal.x + c * normal.z);
  float gust = 0.6 + 0.4 * sin(uTime * 0.23 + aInst.x * 0.013 + aInst.z * 0.009);
  float sway = (sin(uTime * 0.8 + aInst.x * 0.05 + aInst.z * 0.03) + 0.4 * sin(uTime * 1.9 + aInst.x * 0.11)) * gust;
  float yf = q.y / h;
  if (aPart > 0.5) {
    float fl = sin(uTime * (2.6 + aSeed * 3.0) + aSeed * 40.0 + aInst.x) * (0.003 + 0.002 * gust) * h;
    q += vec3(fl, fl * 0.6, -fl * 0.8) * (0.4 + yf);
  }
  vec3 wp = aInst.xyz + q * fade;
  wp += vec3(0.8, 0.0, 0.5) * sway * 0.011 * h * yf * yf;
  vWorld = wp;
  vNormal = nn;
  vUv = uv;
  vPart = aPart;
  vAo = aAo;
  vVar = var;
  vDither = aVar.zw;
  vH = position.y;
  // in the way of the third-person view (trunk, low crown): thinned in the fragment shader
  vSee = kqSee(aInst.xyz, 0.1 + h * 0.016, aInst.y + h, wp);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  // shadow pass: a tree whose shadow cannot fall into the shadow box costs fill for nothing
  if (uShadowPass > 0.5 && kqCastGap(aInst.xz, h) > uShadowCenter.w + ${SHADOW_REACH.toFixed(1)}) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
}
`;

const MODEL_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
uniform sampler2D uBark;
uniform sampler2D uBarkN;
uniform sampler2D uLeaf;
uniform float uLeafRef;
uniform float uKind;
uniform float uLod;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vPart;
varying float vAo;
varying float vVar;
varying vec2 vDither;
varying float vH;
varying float vSee;
${FOLIAGE_GLSL}
${SEE_FRAG_GLSL}
// interleaved gradient noise: the LOD cross-fade dither
float kqIgn(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  float dth = kqIgn(gl_FragCoord.xy);
  if (dth < vDither.x || dth >= vDither.y) discard;
  if (kqSeeCut(vSee, vWorld)) discard;
  float cut = uShadowParams.x > 0.5 ? 0.3 : 0.5;
  vec3 n = normalize(vNormal);
  vec3 alb;
  float cover = 1.0;
  float leafy = 0.0;
  float snowUp;
  if (vPart > 0.5) {
    vec4 t = texture2D(uLeaf, vUv);
    cover = t.a;
    if (cover < cut) discard;
    if (uShadowPass > 0.5) { gl_FragColor = vec4(1.0); return; }
    float lum = dot(t.rgb, vec3(0.3, 0.55, 0.15)) / uLeafRef;
    vec3 base = uKind == 1.0 ? needleColour(vVar) : leafColour(uKind, vVar);
    alb = base * mix(1.0, lum, 0.7);
    leafy = 1.0;
    snowUp = smoothstep(0.3, 0.9, n.y) * (uKind == 1.0 ? 0.9 : 0.5);
  } else {
    if (uShadowPass > 0.5) { gl_FragColor = vec4(1.0); return; }
    alb = texture2D(uBark, vUv).rgb;
    float camD = length(vWorld - uCamPos);
    if (uLod < 0.5 && camD < 30.0) {
      // bark normal map in a derivative frame (no tangents in the instanced geometry)
      vec3 bn = texture2D(uBarkN, vUv).xyz * 2.0 - 1.0;
      vec3 dp1 = dFdx(vWorld), dp2 = dFdy(vWorld);
      vec2 du1 = dFdx(vUv), du2 = dFdy(vUv);
      vec3 T = dp2 * du1.y - dp1 * du2.y;
      vec3 B = dp1 * du2.x - dp2 * du1.x;
      float inv = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
      n = normalize(n + (T * bn.x + B * bn.y) * inv * 0.8 * (1.0 - smoothstep(18.0, 30.0, camD)));
    }
    // moss on the weather side (west) and near the foot; damp, darker base
    float mossy = smoothstep(0.1, 0.8, -n.x * 0.7 + 0.3) * (1.0 - smoothstep(0.02, 0.25, vH)) * 0.6 + smoothstep(0.4, 0.95, -n.x) * 0.2;
    alb = mix(alb, srgb(vec3(0.24, 0.32, 0.11)), mossy * (uKind == 1.0 ? 0.3 : 1.0));
    alb *= mix(0.65, 1.0, smoothstep(0.0, 0.1, vH));
    // hand over to the darker impostor trunks (×0.6) with distance: no pale palisade far out
    alb *= mix(1.0, 0.6, smoothstep(35.0, 110.0, camD));
    snowUp = smoothstep(0.25, 0.75, n.y);
  }
  float ao = vAo;
  alb = mix(alb, srgb(vec3(0.86, 0.89, 0.95)), uSnow * snowUp * 0.85);
  vec3 col = kqLight(alb, n, vWorld, ao, 1.0);
  // leaves scatter sky light (undersides dim, not black) and glow when the sun is behind them
  col += alb * uSkyAmbient * 0.25 * leafy * (1.0 - max(n.y, 0.0));
  vec3 vd = normalize(vWorld - uCamPos);
  col += alb * uSunColor * pow(max(dot(vd, uSunDir), 0.0), 4.0) * 0.6 * leafy;
  gl_FragColor = vec4(kqFog(col, vWorld), clamp((cover - cut) / max(1.0 - cut, 1e-3) * 2.0, 0.0, 1.0));
}
`;

/** Bake pass: premultiplied (normal xy, luminance / part flag) and coverage into the atlas. */
const BAKE_VERT = /* glsl */ `
${SHAPE_GLSL}
attribute float aPart;
attribute float aAo;
attribute vec3 aShape;
varying vec3 vN;
varying vec2 vUv;
varying float vPart;
varying float vAo;
void main() {
  vN = normalize(normalMatrix * normal);
  vUv = uv;
  vPart = aPart;
  vAo = aAo;
  // the same slim trunk as the models (treeScale), in the unit tree
  vec3 p = position;
  p.xz = treePrune(p, aPart, aShape);
  if (aPart < 0.5) p.xz *= mix(aShape.y, 1.0, smoothstep(aShape.x - 0.12, aShape.x + 0.06, p.y));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;
const BAKE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uBark;
uniform sampler2D uLeaf;
uniform float uLeafRef;
uniform float uBarkRef;
varying vec3 vN;
varying vec2 vUv;
varying float vPart;
varying float vAo;
void main() {
  vec3 n = normalize(vN);
  float enc;
  if (vPart > 0.5) {
    vec4 t = texture2D(uLeaf, vUv);
    if (t.a < 0.5) discard;
    float lum = dot(t.rgb, vec3(0.3, 0.55, 0.15)) / uLeafRef * vAo;
    enc = 0.5 + 0.5 * clamp(lum * 0.5, 0.0, 0.999);
  } else {
    float lum = dot(texture2D(uBark, vUv).rgb, vec3(0.3, 0.55, 0.15)) / uBarkRef * vAo;
    enc = 0.5 * clamp(lum * 0.5, 0.0, 0.999);
  }
  gl_FragColor = vec4(n.xy * 0.5 + 0.5, enc, 1.0);
}
`;

const IMP_VERT = /* glsl */ `
${ATMOS_GLSL}
attribute vec4 aInst;
attribute vec4 aVar;
uniform float uFar;
uniform float uScanMix;
uniform float uMapMix;
uniform vec3 uScanCenter;
uniform float uScanRadius;
uniform vec4 uBox[${TREE_VARIANTS.length}];
uniform vec2 uShape[${TREE_VARIANTS.length}];
uniform vec2 uCrowns[4];
uniform vec2 uAtlas;
varying vec3 vWorld;
varying vec2 vA0;
varying vec2 vA1;
varying float vBlend;
varying vec3 vRight;
varying vec3 vUp;
varying vec3 vFwd;
varying float vVar;
varying float vFam;
varying vec2 vDither;
varying float vH;
${SHAPE_GLSL}
${CAST_GLSL}
void main() {
  float h = aInst.w;
  float dist = length(aInst.xz - uCamPos.xz);
  float fade = 1.0 - smoothstep(uFar * 0.82, uFar, dist);
  float sr = length(aInst.xz - uScanCenter.xz);
  fade *= 1.0 - smoothstep(0.0, 0.8, max(uScanMix, uMapMix)) * (1.0 - smoothstep(uScanRadius * 0.85, uScanRadius, sr));
  int vi = int(floor(aVar.y));
  float var = fract(aVar.y);
  vec4 box = uBox[vi];   // x radius, y bottom, z top (unit tree), w family
  vec2 shape = uShape[vi];
  int fam = int(box.w + 0.5);
  vec2 crown = uCrowns[fam];
  float C = min(h * crown.x, crown.y);
  float wide = 0.9 + 0.25 * var;
  // quad rows at the bottom, the crown base and the top: the piecewise height mapping of the
  // models (treeY) is exact with linear interpolation
  float row = position.y;
  float yu = row < 0.5 ? box.y : (row < 1.5 ? clamp(shape.x, box.y + 0.01, box.z - 0.01) : box.z);
  float yw = treeY(yu, shape.x, h, C);
  float y0 = treeY(box.y, shape.x, h, C);
  float y1 = treeY(box.z, shape.x, h, C);
  // the quad faces the camera (the sun in the shadow pass), tipping towards it from above
  vec3 centre = aInst.xyz + vec3(0.0, (y0 + y1) * 0.5, 0.0);
  vec3 vd = uShadowPass > 0.5 ? uSunDir : normalize(uCamPos - centre);
  vec3 right = normalize(vec3(vd.z, 0.0, -vd.x) + vec3(1e-5, 0.0, 0.0));
  float top = smoothstep(0.45, 0.95, vd.y);
  vec3 camUp = normalize(cross(vd, right));
  vec3 up = normalize(mix(vec3(0.0, 1.0, 0.0), camUp, top));
  vec3 wp = centre + (right * position.x * box.x * C * wide + up * (yw - (y0 + y1) * 0.5)) * fade;
  float yf = (yw - y0) / max(y1 - y0, 1e-3);
  float gust = 0.6 + 0.4 * sin(uTime * 0.23 + aInst.x * 0.013 + aInst.z * 0.009);
  float sway = (sin(uTime * 0.8 + aInst.x * 0.05 + aInst.z * 0.03) + 0.4 * sin(uTime * 1.9 + aInst.x * 0.11)) * gust;
  wp += vec3(0.8, 0.0, 0.5) * sway * 0.011 * h * yf * yf;
  // which baked side: the view direction in the tree's own (unrotated) frame
  float c = cos(aVar.x), s = sin(aVar.x);
  vec2 w = vd.xz;
  vec2 m = vec2(c * w.x + s * w.y, -s * w.x + c * w.y);
  float az = atan(m.x, m.y) / 6.2831853 * ${AZ}.0;
  az = mod(az + ${AZ}.0, ${AZ}.0);
  float a0 = floor(az);
  vBlend = az - a0;
  float a1 = mod(a0 + 1.0, ${AZ}.0);
  vec2 uvq = vec2(position.x * 0.5 + 0.5, (yu - box.y) / (box.z - box.y));
  vec2 tile = vec2(1.0 / ${AZ}.0, uAtlas.y);
  vA0 = (vec2(a0, float(vi)) + uvq) * tile;
  vA1 = (vec2(a1, float(vi)) + uvq) * tile;
  vRight = right;
  vUp = up;
  vFwd = vd;
  vVar = var;
  vFam = box.w;
  vDither = aVar.zw;
  vH = yf;
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  // shadow pass: a tree whose shadow cannot fall into the shadow box costs fill for nothing
  if (uShadowPass > 0.5 && kqCastGap(aInst.xz, h) > uShadowCenter.w + ${SHADOW_REACH.toFixed(1)}) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
}
`;

const IMP_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
uniform sampler2D uAtlasTex;
uniform vec3 uBarkCol[4];
uniform float uFamKind[4];
varying vec3 vWorld;
varying vec2 vA0;
varying vec2 vA1;
varying float vBlend;
varying vec3 vRight;
varying vec3 vUp;
varying vec3 vFwd;
varying float vVar;
varying float vFam;
varying vec2 vDither;
varying float vH;
${FOLIAGE_GLSL}
float kqIgn(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  float dth = kqIgn(gl_FragCoord.xy);
  if (dth < vDither.x || dth >= vDither.y) discard;
  vec4 t = mix(texture2D(uAtlasTex, vA0), texture2D(uAtlasTex, vA1), vBlend);
  float cut = uShadowParams.x > 0.5 ? 0.3 : 0.5;
  if (t.a < cut) discard;
  if (uShadowPass > 0.5) { gl_FragColor = vec4(1.0); return; }
  vec3 e = t.rgb / max(t.a, 1e-3);
  vec2 nxy = e.xy * 2.0 - 1.0;
  vec3 n = normalize(vRight * nxy.x + vUp * nxy.y + vFwd * sqrt(max(0.0, 1.0 - dot(nxy, nxy))) + vec3(0.0, 0.05, 0.0));
  int fam = int(vFam + 0.5);
  float kind = uFamKind[fam];
  float leaf = smoothstep(0.46, 0.54, e.z);
  float lum = (leaf > 0.5 ? (e.z - 0.5) : e.z) * 4.0;
  vec3 leafC = (kind == 1.0 ? needleColour(vVar) : leafColour(kind, vVar)) * mix(1.0, lum, 0.7);
  // far trunks stand in the crowns' shade: darker than the lit near bark, so the far stand does
  // not read as a pale palisade through the haze
  vec3 barkC = uBarkCol[fam] * lum * 0.6 * mix(0.6, 1.0, smoothstep(0.0, 0.1, vH));
  vec3 alb = mix(barkC, leafC, leaf);
  float snowUp = smoothstep(0.3, 0.9, n.y) * mix(0.5, kind == 1.0 ? 0.9 : 0.5, leaf);
  alb = mix(alb, srgb(vec3(0.86, 0.89, 0.95)), uSnow * snowUp * 0.85);
  vec3 col = kqLight(alb, n, vWorld, 1.0, 1.0);
  col += alb * uSkyAmbient * 0.25 * leaf * (1.0 - max(n.y, 0.0));
  vec3 vd = normalize(vWorld - uCamPos);
  col += alb * uSunColor * pow(max(dot(vd, uSunDir), 0.0), 4.0) * 0.6 * leaf;
  gl_FragColor = vec4(kqFog(col, vWorld), clamp((t.a - cut) / (1.0 - cut) * 2.0, 0.0, 1.0));
}
`;

// ---- geometry ---------------------------------------------------------------------------------

interface Part {
  geo: BufferGeometry;
  leaf: boolean;
  bark: Texture | null;
  barkN: Texture | null;
  leafTex: Texture | null;
}

/** Float copy of a (possibly quantised / normalised) attribute. */
function floats(geo: BufferGeometry, name: string, size: number): Float32Array | null {
  const a = geo.getAttribute(name);
  if (!a) return null;
  const out = new Float32Array(a.count * size);
  for (let i = 0; i < a.count; i++)
    for (let k = 0; k < size; k++) out[i * size + k] = k === 0 ? a.getX(i) : k === 1 ? a.getY(i) : k === 2 ? a.getZ(i) : a.getW(i);
  return out;
}

/** The meshes of a variant node (world transforms baked in, relative to the scene root). */
function collectParts(node: Object3D): Part[] {
  const out: Part[] = [];
  node.updateWorldMatrix(true, true);
  node.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const mat = m.material as { map?: Texture | null; normalMap?: Texture | null; alphaTest?: number; transparent?: boolean };
    const leaf = (mat.alphaTest ?? 0) > 0 || mat.transparent === true;
    const g = new BufferGeometry();
    const pos = floats(m.geometry, 'position', 3)!;
    const nrm = floats(m.geometry, 'normal', 3) ?? new Float32Array(pos.length);
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('normal', new BufferAttribute(nrm, 3));
    g.setAttribute('uv', new BufferAttribute(floats(m.geometry, 'uv', 2) ?? new Float32Array((pos.length / 3) * 2), 2));
    const col = floats(m.geometry, 'color', 3);
    if (col) g.setAttribute('color', new BufferAttribute(col, 3));
    g.setIndex(m.geometry.index ? Array.from(m.geometry.index.array as ArrayLike<number>) : null);
    g.applyMatrix4(m.matrixWorld);
    out.push({ geo: g, leaf, bark: leaf ? null : (mat.map ?? null), barkN: leaf ? null : (mat.normalMap ?? null), leafTex: leaf ? (mat.map ?? null) : null });
  });
  return out;
}

/** Card id per vertex (connected components of the index graph). */
function cardIds(geo: BufferGeometry): Int32Array {
  const n = geo.getAttribute('position').count;
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  const idx = geo.index!.array;
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(idx[t]!);
    for (let k = 1; k < 3; k++) {
      const b = find(idx[t + k]!);
      if (a !== b) parent[b] = a;
    }
  }
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = find(i);
  return out;
}

export interface TreeShape {
  /** Unit tree (height 1 at the top, trunk at the origin). */
  geo: BufferGeometry;
  /** Max horizontal radius, lowest and highest y (unit tree). */
  radius: number;
  bottom: number;
  top: number;
  /** Crown base (unit height): lowest leaf, 0.3 for bare trees. */
  crownBase: number;
  /** Trunk slimming (bark below the crown, × horizontal). */
  thin: number;
  /** Trunk radius (unit) for pruning the low limbs; 0 = keep them (twisted trees lean). */
  prune: number;
}

/**
 * Merge a variant's bark + leaves into one unit-height geometry with the shader attributes:
 * aPart (0 bark, 1 leaf), aAo (bark: the model's vertex AO; leaves: inner crown darker),
 * aSeed (per leaf card) and crown-sphere normals on the leaves (soft, clumped shading).
 */
export function buildTreeShape(parts: { geo: BufferGeometry; leaf: boolean }[], crownK: number, prune: boolean, scaleTo?: number, shapeOf?: { crownBase: number; thin: number; prune: number }): TreeShape {
  let top = -Infinity;
  let bottom = Infinity;
  for (const p of parts) {
    p.geo.computeBoundingBox();
    top = Math.max(top, p.geo.boundingBox!.max.y);
    bottom = Math.min(bottom, p.geo.boundingBox!.min.y);
  }
  const H = scaleTo ?? top;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const part: number[] = [];
  const ao: number[] = [];
  const seed: number[] = [];
  const idx: number[] = [];
  let radius = 0;
  // crown ellipsoid from all leaf vertices
  const cMin = new Vector3(Infinity, Infinity, Infinity);
  const cMax = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of parts) if (p.leaf) {
    cMin.min(p.geo.boundingBox!.min);
    cMax.max(p.geo.boundingBox!.max);
  }
  const cc = cMin.clone().add(cMax).multiplyScalar(0.5);
  const cr = cMax.clone().sub(cMin).multiplyScalar(0.5).max(new Vector3(0.01, 0.01, 0.01));
  for (const p of parts) {
    const base = part.length;
    const P = p.geo.getAttribute('position');
    const N = p.geo.getAttribute('normal');
    const U = p.geo.getAttribute('uv');
    const C = p.geo.getAttribute('color');
    const ids = p.leaf && p.geo.index ? cardIds(p.geo) : null;
    const seedOf = new Map<number, number>();
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i);
      const y = P.getY(i);
      const z = P.getZ(i);
      pos.push(x / H, y / H, z / H);
      radius = Math.max(radius, Math.hypot(x, z) / H);
      uv.push(U.getX(i), U.getY(i));
      part.push(p.leaf ? 1 : 0);
      if (p.leaf) {
        const rx = (x - cc.x) / cr.x;
        const ry = (y - cc.y) / cr.y;
        const rz = (z - cc.z) / cr.z;
        const rl = Math.hypot(rx, ry, rz) || 1;
        // crown-sphere normal blended with the card's own: clumped, soft shading
        let nx = (rx / rl) * 0.75 + N.getX(i) * 0.25;
        let ny = (ry / rl) * 0.75 + N.getY(i) * 0.25 + 0.08;
        let nz = (rz / rl) * 0.75 + N.getZ(i) * 0.25;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl;
        ny /= nl;
        nz /= nl;
        nrm.push(nx, ny, nz);
        ao.push(0.5 + 0.5 * Math.min(1, rl) * (0.75 + 0.25 * Math.max(0, ry / rl)));
        const id = ids ? ids[i]! : i;
        let sd = seedOf.get(id);
        if (sd === undefined) {
          sd = ((Math.imul(id + 1, 2654435761) >>> 0) % 10007) / 10007;
          seedOf.set(id, sd);
        }
        seed.push(sd);
      } else {
        nrm.push(N.getX(i), N.getY(i), N.getZ(i));
        ao.push(C ? 0.35 + 0.65 * C.getX(i) : 1);
        seed.push(0);
      }
    }
    const I = p.geo.index;
    if (I) for (let k = 0; k < I.count; k++) idx.push(base + I.getX(k));
    else for (let k = 0; k < P.count; k++) idx.push(base + k);
  }
  // crown base and trunk radius (unit height): slim the trunk to ≈ 1.8 % of the stand height
  let crownBase = 0.3;
  let thin = 1;
  let pruneR = 0;
  if (shapeOf) ({ crownBase, thin, prune: pruneR } = shapeOf);
  else {
    let leafMin = Infinity;
    const rs: number[] = [];
    for (let i = 0; i < part.length; i++) {
      const y = pos[i * 3 + 1]!;
      if (part[i]! > 0.5) leafMin = Math.min(leafMin, y);
      else if (y > 0.06 && y < 0.16) rs.push(Math.hypot(pos[i * 3]!, pos[i * 3 + 2]!));
    }
    rs.sort((a, b) => a - b);
    // the stem (lower quantile: limbs and roots at that height are further out)
    const trunkR = rs.length ? rs[Math.floor(rs.length * 0.3)]! : 0.04;
    crownBase = Number.isFinite(leafMin) ? Math.min(0.62, Math.max(0.14, leafMin)) : 0.3;
    thin = Math.min(1, Math.max(0.2, 0.018 / (trunkR * crownK)));
    pruneR = prune ? trunkR : 0;
  }
  const shape = new Float32Array(part.length * 3);
  for (let i = 0; i < part.length; i++) {
    shape[i * 3] = crownBase;
    shape[i * 3 + 1] = thin;
    shape[i * 3 + 2] = pruneR;
  }
  const g = new BufferGeometry();
  g.setAttribute('aShape', new BufferAttribute(shape, 3));
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1));
  g.setAttribute('aAo', new BufferAttribute(new Float32Array(ao), 1));
  g.setAttribute('aSeed', new BufferAttribute(new Float32Array(seed), 1));
  g.setIndex(idx);
  return { geo: g, radius, bottom: bottom / H, top: top / H, crownBase, thin, prune: pruneR };
}

/** Mean linear colour and luminance of the opaque texels of a texture (canvas readback). */
function textureMean(tex: Texture | null): { col: [number, number, number]; lum: number } {
  const fallback = { col: [0.2, 0.15, 0.1] as [number, number, number], lum: 0.3 };
  const img = tex?.image as CanvasImageSource | undefined;
  if (!img || typeof OffscreenCanvas === 'undefined') return fallback;
  try {
    const S = 32;
    const cv = new OffscreenCanvas(S, S);
    const cx = cv.getContext('2d', { willReadFrequently: true });
    if (!cx) return fallback;
    cx.drawImage(img, 0, 0, S, S);
    const d = cx.getImageData(0, 0, S, S).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    const lin = (v: number) => Math.pow(v / 255, 2.2);
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3]! < 128) continue;
      r += lin(d[i]!);
      g += lin(d[i + 1]!);
      b += lin(d[i + 2]!);
      n++;
    }
    if (!n) return fallback;
    const col: [number, number, number] = [r / n, g / n, b / n];
    return { col, lum: col[0] * 0.3 + col[1] * 0.55 + col[2] * 0.15 };
  } catch {
    return fallback;
  }
}

interface Batch {
  mesh: Mesh;
  geo: InstancedBufferGeometry;
  inst: InstancedBufferAttribute;
  vary: InstancedBufferAttribute;
  max: number;
  n: number;
}

function writeInst(b: Batch, i: number, x: number, y: number, z: number, h: number, rot: number, vr: number, lo: number, hi: number): void {
  const ia = b.inst.array as Float32Array;
  const va = b.vary.array as Float32Array;
  ia[i * 4] = x;
  ia[i * 4 + 1] = y;
  ia[i * 4 + 2] = z;
  ia[i * 4 + 3] = h;
  va[i * 4] = rot;
  va[i * 4 + 1] = vr;
  va[i * 4 + 2] = lo;
  va[i * 4 + 3] = hi;
}

/**
 * Shadow-pass-only instances of one batch, sorted by the distance from the rebuild's reference
 * point, so a pass draws just the leading ones within reach (`show`). Hidden outside the pass.
 */
class ShadowList {
  n = 0;
  private readonly rec: Float32Array;
  private readonly dist: Float32Array;
  private readonly sorted: Float32Array;
  private order: number[] = [];

  constructor(readonly batch: Batch) {
    this.rec = new Float32Array(batch.max * 8);
    this.dist = new Float32Array(batch.max);
    this.sorted = new Float32Array(batch.max);
  }

  add(d: number, x: number, y: number, z: number, h: number, rot: number, vr: number, lo: number, hi: number): void {
    if (this.n >= this.batch.max) return;
    const i = this.n++;
    const r = this.rec;
    const o = i * 8;
    r[o] = x;
    r[o + 1] = y;
    r[o + 2] = z;
    r[o + 3] = h;
    r[o + 4] = rot;
    r[o + 5] = vr;
    r[o + 6] = lo;
    r[o + 7] = hi;
    this.dist[i] = d;
  }

  /** Sort by distance and upload (end of a rebuild). */
  flush(): void {
    const n = this.n;
    const order = this.order;
    order.length = n;
    for (let i = 0; i < n; i++) order[i] = i;
    const dist = this.dist;
    order.sort((a, b) => dist[a]! - dist[b]!);
    const r = this.rec;
    const b = this.batch;
    for (let j = 0; j < n; j++) {
      const i = order[j]! * 8;
      writeInst(b, j, r[i]!, r[i + 1]!, r[i + 2]!, r[i + 3]!, r[i + 4]!, r[i + 5]!, r[i + 6]!, r[i + 7]!);
      this.sorted[j] = dist[order[j]!]!;
    }
    b.n = n;
    b.inst.clearUpdateRanges();
    b.inst.addUpdateRange(0, n * 4);
    b.inst.needsUpdate = true;
    b.vary.clearUpdateRanges();
    b.vary.addUpdateRange(0, n * 4);
    b.vary.needsUpdate = true;
    b.mesh.visible = false;
  }

  /** Show the leading instances within `limit` for the shadow pass; returns how many. */
  show(limit: number): number {
    const c = castCount(this.sorted, this.n, limit);
    this.batch.geo.instanceCount = c;
    this.batch.mesh.visible = c > 0;
    return c;
  }
}

function makeBatch(src: BufferGeometry, mat: ShaderMaterial, max: number, name: string, parent: Group): Batch {
  const geo = new InstancedBufferGeometry();
  for (const k of Object.keys(src.attributes)) geo.setAttribute(k, src.getAttribute(k));
  geo.setIndex(src.index);
  const inst = new InstancedBufferAttribute(new Float32Array(max * 4), 4);
  const vary = new InstancedBufferAttribute(new Float32Array(max * 4), 4);
  inst.setUsage(DynamicDrawUsage);
  vary.setUsage(DynamicDrawUsage);
  geo.setAttribute('aInst', inst);
  geo.setAttribute('aVar', vary);
  geo.instanceCount = 0;
  const mesh = new Mesh(geo, mat);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.visible = false;
  parent.add(mesh);
  return { mesh, geo, inst, vary, max, n: 0 };
}

/**
 * The model forest: built from the loaded set (`models/nature2/trees.glb`), fed per tree by
 * `Forest.update` (`begin` → `push` per tree → `end`).
 */
export class ModelTrees {
  readonly object = new Group();
  private readonly lod: Batch[][] = [[], []];
  private readonly imp: Batch;
  private readonly materials: ShaderMaterial[] = [];
  readonly impMaterial: ShaderMaterial;
  private readonly atlas: WebGLRenderTarget;
  /** The atlas bake (kept: a lost WebGL context erases the atlas, which is then baked again). */
  private readonly bakeScene = new Scene();
  private readonly bakeCam: OrthographicCamera;
  private readonly bakeMats: ShaderMaterial[];
  private atlasValid = false;
  readonly variants: number;
  readonly stats = { lod0: 0, lod1: 0, imp: 0, calls: 0, shadowLod: 0, shadowImp: 0 };
  private readonly lv: number[] = [];
  /** lod1 → impostor ring (× k); `TREE_N1`, a field for look checks. */
  impAt = TREE_N1;
  /** The casters' own lod1 → impostor ring (× k); `CAST_N1`, a field for look checks. */
  castAt = CAST_N1;
  private readonly clv: number[] = [];
  /** Shadow casters per variant (lod1 geometry) and impostors, sorted by distance (`ShadowList`). */
  private readonly shadowLod: ShadowList[] = [];
  private readonly shadowImp: ShadowList;
  /**
   * Rebuild-time reference of the shadow lists: the expected shadow focus, the sun, and the gap
   * (`castGap`) up to which a tree is kept.
   */
  private refX = 0;
  private refZ = 0;
  private castMax = Infinity;
  private readonly sun = new Vector3(0, 1, 0);
  private readonly mainVis: boolean[] = [];
  private mainBatches: Batch[] | null = null;

  constructor(root: Object3D, renderer: WebGLRenderer, tile: number, shared: Record<string, { value: unknown }>) {
    this.object.name = 'trees-model';
    const shapes: { l0: TreeShape; l1: TreeShape; tex: Part }[] = [];
    for (const v of TREE_VARIANTS) {
      const n0 = root.getObjectByName(v.name);
      const n1 = root.getObjectByName(`${v.name}_lod1`);
      if (!n0 || !n1) throw new Error(`[trees] variant ${v.name} missing in the set`);
      const p0 = collectParts(n0);
      const p1 = collectParts(n1);
      const k = FAMILY_CROWN[v.family]![0];
      const l0 = buildTreeShape(p0, k, v.family !== 2);
      // lod1 in the same unit frame and proportions as lod0 (its leaf cards grew past the top)
      let top0 = -Infinity;
      for (const p of p0) top0 = Math.max(top0, p.geo.boundingBox!.max.y);
      const l1 = buildTreeShape(p1, k, v.family !== 2, top0, l0);
      const bark = p0.find((p) => !p.leaf)!;
      const leaf = p0.find((p) => p.leaf);
      shapes.push({ l0, l1, tex: { geo: l0.geo, leaf: false, bark: bark.bark, barkN: bark.barkN, leafTex: leaf?.leafTex ?? null } });
    }
    this.variants = shapes.length;
    // per family: one material (textures + colour references)
    const famTex = TREE_FAMILIES.map((_, f) => shapes[TREE_VARIANTS.findIndex((v) => v.family === f)]!.tex);
    const barkMean = famTex.map((t) => textureMean(t.bark));
    const leafMean = famTex.map((t) => textureMean(t.leafTex));
    TREE_FAMILIES.forEach((name, f) => {
      const t = famTex[f]!;
      for (const tx of [t.bark, t.leafTex]) if (tx) tx.colorSpace = SRGBColorSpace;
      const m = new ShaderMaterial({
        vertexShader: MODEL_VERT,
        fragmentShader: MODEL_FRAG,
        side: DoubleSide,
        uniforms: {
          ...shared,
          uBark: { value: t.bark },
          uBarkN: { value: t.barkN },
          uLeaf: { value: t.leafTex ?? t.bark },
          uLeafRef: { value: Math.max(0.02, leafMean[f]!.lum) },
          uKind: { value: FAMILY_KIND[f] },
          uCrown: { value: new Vector2(...FAMILY_CROWN[f]!) },
          uLod: { value: 0 },
        },
      });
      m.name = `trees-${name}`;
      this.materials.push(m);
    });
    // lod1 materials: same textures, no bark normal map
    const lod1Mats = this.materials.map((m) => {
      const c = m.clone();
      c.uniforms = { ...m.uniforms, uLod: { value: 1 } };
      return c;
    });
    shapes.forEach((s, i) => {
      const fam = TREE_VARIANTS[i]!.family;
      this.lod[0]!.push(makeBatch(s.l0.geo, this.materials[fam]!, MAX_LOD0, `trees-${TREE_VARIANTS[i]!.name}-lod0`, this.object));
      this.lod[1]!.push(makeBatch(s.l1.geo, lod1Mats[fam]!, MAX_LOD1, `trees-${TREE_VARIANTS[i]!.name}-lod1`, this.object));
      this.shadowLod.push(new ShadowList(makeBatch(s.l1.geo, lod1Mats[fam]!, MAX_LOD0 + MAX_LOD1, `trees-${TREE_VARIANTS[i]!.name}-shadow`, this.object)));
    });

    // ---- impostor atlas: AZ sides per variant, one row per variant
    const W = tile * AZ;
    const H = tile * shapes.length;
    this.atlas = new WebGLRenderTarget(W, H, { samples: 4, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, depthBuffer: true });
    this.atlas.texture.anisotropy = 4;
    const bakeScene = this.bakeScene;
    const bakeMats = (this.bakeMats = famTex.map(
      (t, f) =>
        new ShaderMaterial({
          vertexShader: BAKE_VERT,
          fragmentShader: BAKE_FRAG,
          side: DoubleSide,
          alphaToCoverage: true,
          uniforms: {
            uBark: { value: t.bark },
            uLeaf: { value: t.leafTex ?? t.bark },
            uLeafRef: { value: Math.max(0.02, leafMean[f]!.lum) },
            uBarkRef: { value: Math.max(0.02, barkMean[f]!.lum) },
          },
        }),
    ));
    const boxes: number[] = [];
    shapes.forEach((s, i) => {
      const fam = TREE_VARIANTS[i]!.family;
      const r = s.l0.radius * 1.02;
      const yb = s.l0.bottom;
      const yt = s.l0.top * 1.01;
      boxes.push(r, yb, yt, fam);
      for (let a = 0; a < AZ; a++) {
        const m = new Mesh(s.l0.geo, bakeMats[fam]);
        // the camera looks down −z; the view from azimuth φ (direction tree → camera in the tree's
        // frame) = the tree turned by −φ seen from +z
        const phi = (a / AZ) * Math.PI * 2;
        m.rotation.y = -phi;
        const sx = tile / (2 * r);
        const sy = tile / (yt - yb);
        m.scale.set(sx, sy, sx);
        m.position.set((a + 0.5) * tile, (i + (0 - yb) / (yt - yb)) * tile, -tile);
        bakeScene.add(m);
      }
    });
    const cam = (this.bakeCam = new OrthographicCamera(0, W, H, 0, 0.1, tile * 4));
    cam.position.set(0, 0, 0);
    cam.updateMatrixWorld(true);
    this.bake(renderer);

    this.impMaterial = new ShaderMaterial({
      vertexShader: IMP_VERT,
      fragmentShader: IMP_FRAG,
      side: DoubleSide,
      uniforms: {
        ...shared,
        uAtlasTex: { value: this.atlas.texture },
        uAtlas: { value: [1 / AZ, 1 / shapes.length] },
        uBox: { value: Array.from({ length: shapes.length }, (_, i) => new Vector4(boxes[i * 4]!, boxes[i * 4 + 1]!, boxes[i * 4 + 2]!, boxes[i * 4 + 3]!)) },
        uShape: { value: shapes.map((sh) => new Vector2(sh.l0.crownBase, sh.l0.thin)) },
        uCrowns: { value: FAMILY_CROWN.map(([k, mx]) => new Vector2(k, mx)) },
        uBarkCol: { value: barkMean.map((b) => new Vector3(...b.col)) },
        uFamKind: { value: FAMILY_KIND.slice() },
      },
    });
    this.impMaterial.name = 'trees-impostor';
    const quad = new BufferGeometry();
    // rows: y = 0 bottom, 1 crown base, 2 top (see IMP_VERT)
    quad.setAttribute('position', new BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0, 1, 2, 0, -1, 2, 0]), 3));
    quad.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 4, 3, 4, 5]);
    this.imp = makeBatch(quad, this.impMaterial, MAX_IMP, 'trees-impostor', this.object);
    this.shadowImp = new ShadowList(makeBatch(quad, this.impMaterial, MAX_IMP_SHADOW, 'trees-impostor-shadow', this.object));
    this.materials.push(...lod1Mats);
  }

  private bake(renderer: WebGLRenderer): void {
    const prevTarget = renderer.getRenderTarget();
    const prevAlpha = renderer.getClearAlpha();
    const prevColor = renderer.getClearColor(new Color());
    renderer.setRenderTarget(this.atlas);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(this.bakeScene, this.bakeCam);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    this.atlasValid = true;
  }

  /** A WebGL context restore erased the baked atlas (render/context.ts). */
  invalidateAtlas(): void {
    this.atlasValid = false;
  }

  /** Bake the atlas again if it was erased; call before the shadow, reflection and main draws. */
  ensureAtlas(renderer: WebGLRenderer): void {
    if (!this.atlasValid) this.bake(renderer);
  }

  /** Alpha-to-coverage for the leaf and impostor cut-outs (MSAA tiers). */
  setAlphaToCoverage(on: boolean): void {
    for (const m of [...this.materials, this.impMaterial]) {
      if (m.alphaToCoverage === on) continue;
      m.alphaToCoverage = on;
      m.needsUpdate = true;
    }
  }

  /**
   * Start a rebuild. (refX, refZ): where the shadow focus is expected (the shadow lists are sorted
   * by how far each tree's shadow ends from it, `castGap`); `castMax`: the gap up to which a tree
   * may cast at all (the shadow box's radius plus `SHADOW_REACH` plus room for the focus to move
   * until the next rebuild); `sun`: the unit direction to the sun.
   */
  begin(refX = 0, refZ = 0, castMax = Infinity, sun?: { x: number; y: number; z: number }): void {
    for (const l of this.lod) for (const b of l) b.n = 0;
    this.imp.n = 0;
    for (const s of this.shadowLod) s.n = 0;
    this.shadowImp.n = 0;
    this.refX = refX;
    this.refZ = refZ;
    this.castMax = castMax;
    if (sun) this.sun.set(sun.x, sun.y, sun.z);
  }

  /**
   * One tree: position, height, rotation, variation (0..1), variant index, distance from the
   * camera and the ring scale (preset · tree height).
   */
  push(x: number, y: number, z: number, h: number, rot: number, v: number, variant: number, d: number, k: number): void {
    const lv = this.lv;
    const n = treeLevels(d, k, lv, this.impAt);
    const vr = variant + Math.min(0.999, v);
    for (let j = 0; j < n; j++) {
      const level = lv[j * 3]!;
      const b = level === 2 ? this.imp : this.lod[level]![variant]!;
      if (!b || b.n >= b.max) continue;
      writeInst(b, b.n++, x, y, z, h, rot, vr, lv[j * 3 + 1]!, lv[j * 3 + 2]!);
    }
    this.addCaster(x, y, z, h, rot, vr, variant, d, k);
  }

  /**
   * A tree the view leaves out (outside the sector or cone the lists are built for): no instance
   * in the picture, but a shadow caster like any other. The sun stands low, so a tree behind the
   * camera shades the ground in front of it.
   */
  cast(x: number, y: number, z: number, h: number, rot: number, v: number, variant: number, d: number, k: number): void {
    this.addCaster(x, y, z, h, rot, variant + Math.min(0.999, v), variant, d, k);
  }

  /** The shadow-pass instances of a tree `d` m from the camera (ring scale `k`), if its shadow is in reach. */
  private addCaster(x: number, y: number, z: number, h: number, rot: number, vr: number, variant: number, d: number, k: number): void {
    const ds = castGap(x, z, h, this.refX, this.refZ, this.sun.x, this.sun.y, this.sun.z);
    if (ds > this.castMax) return;
    const lv = this.clv;
    const n = treeLevels(d, k, lv, this.castAt);
    // shadow casters: lod0 as lod1 (a tree fading lod0 → lod1 is one full lod1 caster)
    if (n === 2 && lv[0] === 0) {
      this.shadowLod[variant]?.add(ds, x, y, z, h, rot, vr, 0, 2);
      return;
    }
    for (let j = 0; j < n; j++) {
      const level = shadowLevel(lv[j * 3]!);
      const s = level === 2 ? this.shadowImp : this.shadowLod[variant];
      s?.add(ds, x, y, z, h, rot, vr, lv[j * 3 + 1]!, lv[j * 3 + 2]!);
    }
  }

  /**
   * Shadow pass hook (render/shadows.ts `onPass`): during the pass only the caster lists draw,
   * each up to the trees whose shadow ends within `range + SHADOW_REACH` of the focus (plus the
   * focus's drift from the rebuild's reference point, so the cut never drops a tree the shader
   * would have kept). Returns that drift (m).
   */
  shadowPass(on: boolean, fx: number, fz: number, range: number): number {
    const main = (this.mainBatches ??= [...this.lod[0]!, ...this.lod[1]!, this.imp]);
    const drift = Math.hypot(fx - this.refX, fz - this.refZ);
    if (on) {
      const limit = range + SHADOW_REACH + drift;
      let lod = 0;
      let imp = 0;
      for (let i = 0; i < main.length; i++) {
        this.mainVis[i] = main[i]!.mesh.visible;
        main[i]!.mesh.visible = false;
      }
      for (const s of this.shadowLod) lod += s.show(limit);
      imp = this.shadowImp.show(limit);
      this.stats.shadowLod = lod;
      this.stats.shadowImp = imp;
    } else {
      for (let i = 0; i < main.length; i++) main[i]!.mesh.visible = this.mainVis[i] ?? false;
      for (const s of this.shadowLod) s.batch.mesh.visible = false;
      this.shadowImp.batch.mesh.visible = false;
    }
    return drift;
  }

  end(): void {
    let calls = 0;
    const flush = (b: Batch) => {
      b.geo.instanceCount = b.n;
      b.inst.clearUpdateRanges();
      b.inst.addUpdateRange(0, b.n * 4);
      b.inst.needsUpdate = true;
      b.vary.clearUpdateRanges();
      b.vary.addUpdateRange(0, b.n * 4);
      b.vary.needsUpdate = true;
      b.mesh.visible = b.n > 0;
      if (b.n > 0) calls++;
    };
    let l0 = 0;
    let l1 = 0;
    for (const b of this.lod[0]!) {
      flush(b);
      l0 += b.n;
    }
    for (const b of this.lod[1]!) {
      flush(b);
      l1 += b.n;
    }
    flush(this.imp);
    for (const s of this.shadowLod) s.flush();
    this.shadowImp.flush();
    this.stats.lod0 = l0;
    this.stats.lod1 = l1;
    this.stats.imp = this.imp.n;
    this.stats.calls = calls;
  }

  /** Debug: the impostor atlas texture. */
  get atlasTexture(): Texture {
    return this.atlas.texture;
  }

  dispose(): void {
    this.atlas.dispose();
    for (const m of this.bakeMats) m.dispose();
    for (const m of this.materials) m.dispose();
    this.impMaterial.dispose();
    this.object.removeFromParent();
  }
}
