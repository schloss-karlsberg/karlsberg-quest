import { Color, DataTexture, Matrix4, type Texture, Vector3, Vector4 } from 'three';

/** 1×1 stand-in bound while no shadow map exists (and during the shadow pass itself). */
export const NO_SHADOW_TEX: Texture = (() => {
  const t = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

/**
 * Uniforms shared (by reference) between every custom material: terrain, palace, trees, sky,
 * feature effects. Change a value here and every shader sees it on the next frame.
 */
export const atmosphere = {
  uSunDir: { value: new Vector3(0.4, 0.5, 0.3).normalize() },
  uSunColor: { value: new Color(1, 0.95, 0.85) },
  uSkyAmbient: { value: new Color(0.35, 0.4, 0.5) },
  uGroundAmbient: { value: new Color(0.18, 0.16, 0.12) },
  uFogColor: { value: new Color(0.6, 0.65, 0.7) },
  /** Fog colour looking towards the sun (in-scatter). */
  uFogSunColor: { value: new Color(0.9, 0.8, 0.65) },
  uFogDensity: { value: 0.0012 },
  /** Extra fog in low ground (valley mist): density · exp(−(y − uFogBase)/uFogFalloff). */
  uFogBase: { value: 260 },
  uFogHeightDensity: { value: 0.002 },
  uFogFalloff: { value: 25 },
  uTime: { value: 0 },
  uCamPos: { value: new Vector3() },
  /** Local light around the player (lantern): rgb colour·intensity, w = radius m. */
  uLantern: { value: new Vector3(0, 0, 0) },
  uLanternRadius: { value: 12 },
  uLanternPos: { value: new Vector3() },
  /** Distant fire glow (1793-07): rgb·intensity, and world position of the source. */
  uGlowColor: { value: new Color(0, 0, 0) },
  uGlowPos: { value: new Vector3(1262, 360, -1126) },
  uSnow: { value: 0 },
  /** 0..1 how deep the camera is inside forest (set per frame): adds trunk-level haze. */
  uUnderCanopy: { value: 0 },
  uForestFog: { value: 0.012 },
  /** Foliage: 0 summer green → 1 autumn → 2 bare winter. */
  uSeason: { value: 1 },
  /** Sun shadow map (render/shadows.ts): depth texture, world → shadow clip matrix. */
  uShadowMap: { value: NO_SHADOW_TEX },
  uShadowMatrix: { value: new Matrix4() },
  /** x on (0/1), y texel size (uv), z PCF taps, w strength (0..1, era). */
  uShadowParams: { value: new Vector4(0, 0, 0, 0) },
  /** xyz centre of the shadow box (player), w fade-out radius (m). */
  uShadowCenter: { value: new Vector4(0, 0, 0, 1) },
};

export type Atmosphere = typeof atmosphere;

/** GLSL shared by all world shaders. Requires the `atmosphere` uniforms. */
export const ATMOS_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmbient;
uniform vec3 uGroundAmbient;
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform float uFogDensity;
uniform float uFogBase;
uniform float uFogHeightDensity;
uniform float uFogFalloff;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uLantern;
uniform float uLanternRadius;
uniform vec3 uLanternPos;
uniform vec3 uGlowColor;
uniform vec3 uGlowPos;
uniform float uSnow;
uniform float uSeason;
uniform float uUnderCanopy;
uniform float uForestFog;
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform vec4 uShadowParams;
uniform vec4 uShadowCenter;

float kqHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float kqNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(kqHash12(i), kqHash12(i + vec2(1, 0)), u.x), mix(kqHash12(i + vec2(0, 1)), kqHash12(i + vec2(1, 1)), u.x), u.y);
}
float kqFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * kqNoise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return v;
}

/**
 * Sun shadow at world position wp (1 = lit). Soft PCF on a rotated Poisson disc, normal offset
 * against acne, fades out towards the edge of the box around the player. 1.0 when shadows are
 * off (low tier, SwiftShader, or a material that does not carry the shadow uniforms).
 */
float kqShadowCmp(vec2 uv, float z) {
  return step(z, texture2D(uShadowMap, uv).r);
}
// bilinear-filtered depth compare (4 texels): smooth edges without noise
float kqShadowBil(vec2 uv, float z, float t) {
  vec2 st = uv / t - 0.5;
  vec2 f = fract(st);
  vec2 b = (floor(st) + 0.5) * t;
  float a = kqShadowCmp(b, z), c = kqShadowCmp(b + vec2(t, 0.0), z);
  float d = kqShadowCmp(b + vec2(0.0, t), z), e = kqShadowCmp(b + vec2(t, t), z);
  return mix(mix(a, c, f.x), mix(d, e, f.x), f.y);
}
float kqShadow(vec3 wp, vec3 n) {
  if (uShadowParams.x < 0.5) return 1.0;
  float fade = smoothstep(uShadowCenter.w * 0.8, uShadowCenter.w, length(wp.xz - uShadowCenter.xz));
  if (fade >= 1.0) return 1.0;
  float ndl = dot(n, uSunDir);
  vec3 p = wp + n * (0.05 + 0.12 * (1.0 - abs(ndl)));
  vec4 sc = uShadowMatrix * vec4(p, 1.0);
  vec3 s = sc.xyz / sc.w * 0.5 + 0.5;
  if (s.x <= 0.0 || s.y <= 0.0 || s.x >= 1.0 || s.y >= 1.0 || s.z >= 1.0) return 1.0;
  float z = s.z - 0.0005;
  float t = uShadowParams.y;
  float lit;
  if (uShadowParams.z > 6.0) {
    // 3×3 bilinear taps (high): ~4 texel penumbra
    lit = 0.0;
    for (int i = -1; i <= 1; i++)
      for (int j = -1; j <= 1; j++) lit += kqShadowBil(s.xy + vec2(float(i), float(j)) * t * 1.25, z, t);
    lit /= 9.0;
  } else if (uShadowParams.z > 1.0) {
    // 2×2 bilinear taps (medium)
    lit = (kqShadowBil(s.xy + vec2(-0.6, -0.6) * t, z, t) + kqShadowBil(s.xy + vec2(0.6, -0.6) * t, z, t) + kqShadowBil(s.xy + vec2(-0.6, 0.6) * t, z, t) + kqShadowBil(s.xy + vec2(0.6, 0.6) * t, z, t)) * 0.25;
  } else {
    lit = kqShadowBil(s.xy, z, t);
  }
  return mix(mix(1.0, lit, uShadowParams.w), 1.0, fade);
}

/** Diffuse lighting: sun (wrapped lambert, shadowed), hemisphere ambient, lantern, fire glow. */
vec3 kqLight(vec3 albedo, vec3 n, vec3 wp, float ao, float sunShadow) {
  float ndl = dot(n, uSunDir);
  float sun = clamp((ndl + 0.15) / 1.15, 0.0, 1.0) * sunShadow;
  if (sun > 0.0) sun *= kqShadow(wp, n);
  vec3 amb = mix(uGroundAmbient, uSkyAmbient, n.y * 0.5 + 0.5) * ao;
  vec3 col = albedo * (uSunColor * sun + amb);
  // lantern: soft point light around the player
  vec3 ld = uLanternPos - wp;
  float dl = length(ld);
  float lat = clamp(1.0 - dl / uLanternRadius, 0.0, 1.0);
  lat *= lat;
  col += albedo * uLantern * lat * (0.35 + 0.65 * max(dot(n, ld / max(dl, 1e-3)), 0.0));
  // distant fire glow
  vec3 gd = uGlowPos - wp;
  float dg = length(gd);
  float gfall = 1.0 / (1.0 + dg * dg * 0.00002);
  col += albedo * uGlowColor * gfall * (0.3 + 0.7 * max(dot(n, gd / max(dg, 1e-3)), 0.0));
  return col;
}

/** Distance + height fog with sun in-scatter. */
vec3 kqFog(vec3 col, vec3 wp) {
  vec3 v = wp - uCamPos;
  float d = length(v);
  float hAvg = (wp.y + uCamPos.y) * 0.5;
  float hf = uFogHeightDensity * exp(-max(hAvg - uFogBase, 0.0) / uFogFalloff);
  // haze between the trunks when walking in the forest (fades for things high above the eye)
  float under = uUnderCanopy * uForestFog * (1.0 - smoothstep(6.0, 22.0, wp.y - uCamPos.y));
  float f = 1.0 - exp(-d * (uFogDensity + hf) - min(d, 260.0) * under);
  vec3 vd = v / max(d, 1e-3);
  float s = pow(max(dot(vd, uSunDir), 0.0), 6.0);
  vec3 fc = mix(uFogColor, uFogSunColor, s);
  // fire glow tints the fog around its source
  float gd = length(uGlowPos.xz - wp.xz);
  fc += uGlowColor * 0.25 / (1.0 + gd * gd * 0.000015);
  return mix(col, fc, clamp(f, 0.0, 1.0));
}
`;
