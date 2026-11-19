/**
 * Shaders of the rigged characters (skinned meshes; the same material also draws unskinned props
 * on bones). Two looks, both premultiplied-alpha with a depth pre-pass so a body never shows its
 * own back through itself:
 *
 *  - ghost (NPCs, memories of people): period cloth lit by the world light (sun, shadow, lantern,
 *    fire glow), washed toward the figure's mood tint, translucent at the silhouette where a rim of
 *    the tint glows; the feet fray into mist; light bands drift up through the body; an eerie
 *    figure flickers. Reads as a person first, a ghost second (docs/ART-DIRECTION.md §6).
 *  - spectral (enemies): dense dark smoke lit by the world, a fog-contrast rim (dark on pale fog,
 *    pale in the dark) so the silhouette reads at 30 m, a small family-coloured core glowing
 *    through the chest (below the bloom threshold except at its heart), smoke flowing upward,
 *    ragged translucent edges, the telegraph flare on the rim, the hit flash, and the death
 *    dissolve: the body burns away along a noise front with an ember edge.
 */
import { Color, CustomBlending, DoubleSide, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial, Vector3 } from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';

const SKIN_VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uBaseY;
uniform float uHeight;
varying vec3 vN;
varying vec3 vWp;
varying float vY;
void main() {
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vWp = wp.xyz;
  vN = normalize(mat3(modelMatrix) * objectNormal);
  vY = (wp.y - uBaseY) / uHeight;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const GHOST_FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform vec3 uTint;
uniform vec3 uCloth;
uniform float uAlpha;
uniform float uEerie;
uniform float uSeed;
uniform float uMotion;
uniform float uStutter;
uniform float uPrepass;
uniform float uTalk;
uniform float uGlow;
varying vec3 vN;
varying vec3 vWp;
varying float vY;

void main() {
  float t = uTime * uMotion;
  // the feet fray into mist (noise eats the lowest fifth)
  float n = kqFbm(vec2(vWp.x * 3.1 + vWp.z * 2.3, vY * 5.0 - t * 0.6 + uSeed));
  float m = smoothstep(0.02, 0.26, vY + (n - 0.5) * 0.28);
  float d = length(vWp - uCamPos);
  float A = uAlpha * exp(-d * (uFogDensity * 1.4 + 0.0025));
  // eerie figures flicker like a bad memory
  float s = step(0.94, kqHash12(vec2(floor(t * 9.0), uSeed))) * uStutter;
  float fl = mix(1.0, (0.88 + 0.12 * sin(t * 1.9 + uSeed)) * (1.0 - 0.4 * s), uEerie);
  if (uPrepass > 0.5) {
    if (m * A < 0.35) discard;
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 nr = normalize(vN);
  vec3 v = normalize(uCamPos - vWp);
  if (dot(nr, v) < 0.0) nr = -nr;
  float ndv = clamp(dot(nr, v), 0.0, 1.0);
  float rim = pow(1.0 - ndv, 2.4);
  // cloth in the world's light, a soft wrap so the shadow side is never dead
  vec3 lit = kqLight(uCloth, nr, vWp, 1.0, 1.0) + uCloth * (uSkyAmbient * 0.35 + uSunColor * 0.08);
  // the mood tint at unit brightness, half its saturation (the cloth keeps its colour)
  vec3 tc = uTint / max(dot(uTint, vec3(0.299, 0.587, 0.114)), 1e-3);
  tc = mix(vec3(1.0), tc, 0.55);
  // a memory: a little washed toward the mood tint, never grey
  float l = dot(lit, vec3(0.299, 0.587, 0.114));
  vec3 mem = mix(lit, l * tc, 0.18);
  float flow = kqFbm(vec2(vWp.x * 3.0 + vWp.z * 2.0 + uSeed, vWp.y * 2.6 - t * 0.45));
  float bands = smoothstep(0.78, 1.0, 0.5 + 0.5 * sin(vWp.y * 26.0 - t * 1.6 + flow * 4.0));
  // inner light: rim, drifting bands, a soft heart at the chest
  float heart = exp(-pow((vY - 0.72) * 4.0, 2.0)) * 0.1;
  float glow = (rim * 0.85 + 0.015 + 0.03 * flow + 0.05 * bands + heart * (1.0 - rim)) * fl;
  glow *= 1.0 + uTalk * 0.25;
  // dense in the middle, translucent at the edge
  float a = clamp((0.84 - 0.5 * rim) * m * A * mix(1.0, 0.8 + 0.2 * flow, 0.5), 0.0, 0.92);
  vec3 col = mem * a + tc * uGlow * glow * m * A;
  // fog over the body (the glow keeps a little through it)
  vec3 fogged = kqFog(col / max(a, 1e-3), vWp) * a;
  col = mix(fogged, col, 0.35);
  gl_FragColor = vec4(col, a);
}
`;

const SPECTRAL_FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform vec3 uBody;
uniform vec3 uCore;
uniform vec3 uTell;
uniform vec3 uCoreP;
uniform float uCoreR;
uniform float uAlpha;
uniform float uFlash;
uniform float uTellK;
uniform float uDissolve;
uniform float uStun;
uniform float uSeed;
uniform float uPrepass;
varying vec3 vN;
varying vec3 vWp;
varying float vY;

void main() {
  float t = uTime;
  vec3 q = vWp * 2.2 + vec3(uSeed * 13.0);
  // smoke streaming up the body
  float flow = kqFbm(vec2(q.x + q.z * 0.7, q.y * 1.2 - t * 0.9));
  float wisp = kqFbm(vec2(q.x * 1.6 - q.z, q.y * 2.3 - t * 1.7));
  // the dissolve: a noise front eats the body, its edge burns in the family colour
  float dn = kqFbm(vec2(vWp.x * 4.0 + vWp.z * 3.0 + uSeed * 7.0, vWp.y * 3.0 + uSeed));
  float cut = dn + (1.0 - vY) * 0.25 - uDissolve * 1.45;
  if (uDissolve > 0.0 && cut < 0.0) discard;
  float burn = uDissolve > 0.0 ? 1.0 - smoothstep(0.0, 0.1, cut) : 0.0;
  // the lowest part is already smoke
  float n = kqFbm(vec2(vWp.x * 5.0 + vWp.z * 4.0, vY * 6.0 - t * 1.1 + uSeed));
  float m = smoothstep(0.0, 0.18, vY + (n - 0.5) * 0.24);
  float d = length(vWp - uCamPos);
  if (uPrepass > 0.5) {
    if (m * uAlpha < 0.45) discard;
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 nr = normalize(vN);
  vec3 v = normalize(uCamPos - vWp);
  if (dot(nr, v) < 0.0) nr = -nr;
  float ndv = clamp(dot(nr, v), 0.0, 1.0);
  float rim = pow(1.0 - ndv, 2.0);
  // ink-dark smoke, only half touched by the world's light (it is not quite there)
  vec3 alb = uBody * (0.45 + 1.0 * flow);
  vec3 col = kqLight(alb, nr, vWp, 1.0, 1.0) * 0.55 + alb * uSkyAmbient * 0.3;
  // a rim that contrasts with the era's fog: dark on pale fog (day, snow), fog-lit in the dark
  float fogL = dot(uFogColor, vec3(0.299, 0.587, 0.114));
  vec3 rimC = fogL > 0.38 ? vec3(0.015, 0.013, 0.02) : uFogColor * 1.5 + vec3(0.09, 0.095, 0.11);
  col = mix(col, rimC, rim * 0.6);
  // paler wisps drifting up over the surface
  col = mix(col, uFogColor * 0.35 + uCore * 0.05, smoothstep(0.58, 0.85, wisp) * 0.3 * (1.0 - rim));
  // the heart glows through the smoke from inside (small: it must not turn the body into a blob)
  vec3 dc = vWp - uCoreP;
  float core = exp(-dot(dc, dc) / (uCoreR * uCoreR)) * (0.35 + 0.65 * ndv);
  float veins = smoothstep(0.66, 0.92, flow) * (1.0 - rim) * exp(-dot(dc, dc) / (uCoreR * uCoreR * 9.0));
  vec3 cc = mix(uCore, vec3(0.6, 0.8, 1.0), uStun);
  col += cc * (core * 0.8 + veins * 0.3);
  // a faint ember line along the silhouette
  col += cc * pow(rim, 5.0) * 0.18;
  // the telegraph: the rim catches fire in the tell colour
  col += uTell * uTellK * (rim * 1.7 + core * 0.6);
  col += vec3(1.0, 0.95, 0.9) * uFlash * (0.25 + rim * 0.6);
  col += uCore * burn * 3.2;
  // ragged, translucent edges where the smoke thins
  float edge = smoothstep(0.02, 0.4, ndv + (wisp - 0.5) * 0.55 + 0.12);
  float a = (0.93 - 0.35 * rim) * m * edge * uAlpha;
  a = clamp(max(a, burn * uAlpha), 0.0, 0.97);
  // fogged like the world but keeping the silhouette to ~50 m
  col = mix(kqFog(col, vWp), col, 0.85 * (1.0 - smoothstep(40.0, 110.0, d)));
  gl_FragColor = vec4(col * a, a);
}
`;

const PREMUL = {
  transparent: true,
  depthWrite: false,
  side: DoubleSide,
  blending: CustomBlending,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
  blendSrcAlpha: OneFactor,
  blendDstAlpha: OneMinusSrcAlphaFactor,
} as const;

/** Uniforms shared by all slots of one ghost (one object per figure). */
export function ghostShared(tint: Color, seed: number, eerie: number): Record<string, { value: unknown }> {
  return {
    uTint: { value: tint },
    uAlpha: { value: 0 },
    uEerie: { value: eerie },
    uSeed: { value: seed },
    uMotion: { value: 1 },
    uStutter: { value: 1 },
    uTalk: { value: 0 },
    uGlow: { value: 1.3 },
    uBaseY: { value: 0 },
    uHeight: { value: 1.7 },
  };
}

/** A ghost slot material (colour pass) and its depth pre-pass twin. */
export function ghostMaterials(shared: Record<string, { value: unknown }>, cloth: Color): { body: ShaderMaterial; depth: ShaderMaterial } {
  const uniforms = { ...atmosphere, ...shared, uCloth: { value: cloth }, uPrepass: { value: 0 } };
  const body = new ShaderMaterial({ vertexShader: SKIN_VERT, fragmentShader: GHOST_FRAG, uniforms, ...PREMUL });
  const depth = new ShaderMaterial({
    vertexShader: SKIN_VERT,
    fragmentShader: GHOST_FRAG,
    uniforms: { ...uniforms, uPrepass: { value: 1 } },
    transparent: true,
    depthWrite: true,
    colorWrite: false,
    side: DoubleSide,
  });
  return { body, depth };
}

/** Uniforms of one spectral enemy body (set per frame by the combat visuals). */
export function spectralShared(body: [number, number, number], core: [number, number, number], seed: number): Record<string, { value: unknown }> {
  return {
    uBody: { value: new Color(...body) },
    uCore: { value: new Color(...core) },
    uTell: { value: new Color(1, 0.5, 0.15) },
    uCoreP: { value: new Vector3() },
    uCoreR: { value: 0.2 },
    uAlpha: { value: 1 },
    uFlash: { value: 0 },
    uTellK: { value: 0 },
    uDissolve: { value: 0 },
    uStun: { value: 0 },
    uSeed: { value: seed },
    uBaseY: { value: 0 },
    uHeight: { value: 1 },
  };
}

export function spectralMaterials(shared: Record<string, { value: unknown }>): { body: ShaderMaterial; depth: ShaderMaterial } {
  const uniforms = { ...atmosphere, ...shared, uPrepass: { value: 0 } };
  const body = new ShaderMaterial({ vertexShader: SKIN_VERT, fragmentShader: SPECTRAL_FRAG, uniforms, ...PREMUL });
  const depth = new ShaderMaterial({
    vertexShader: SKIN_VERT,
    fragmentShader: SPECTRAL_FRAG,
    uniforms: { ...uniforms, uPrepass: { value: 1 } },
    transparent: true,
    depthWrite: true,
    colorWrite: false,
    side: DoubleSide,
  });
  return { body, depth };
}

/** sRGB hex → linear colour. */
export function linHex(hex: number): Color {
  return new Color(hex).convertSRGBToLinear();
}


