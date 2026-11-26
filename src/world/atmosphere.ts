import { Color, type DepthTexture, Matrix4, Vector2, Vector3, Vector4 } from 'three';

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
  uShadowMap: { value: null as DepthTexture | null },
  uShadowMatrix: { value: new Matrix4() },
  /** x on (0/1), y texel size (uv), z near PCF taps, w strength (0..1, era). */
  uShadowParams: { value: new Vector4(0, 0, 0, 0) },
  /** Squared near and far distances of the transition to one filtered sample. */
  uShadowDetailSq: { value: new Vector2() },
  /** xyz centre of the shadow box (player), w fade-out radius (m). */
  uShadowCenter: { value: new Vector4(0, 0, 0, 1) },
  /** 1 while the sun shadow map renders (render/shadows.ts): shaders skip lighting, impostors face the sun. */
  uShadowPass: { value: 0 },
  /**
   * See-through (playtest round 10, `SEE_GLSL`, written each frame by src/player/seeThrough.ts):
   * the third-person lens, xyz, and w = how far from it anything can stand in the way (m, 0 = off).
   */
  uSeeCam: { value: new Vector4(0, 0, 0, 0) },
  /** The character's chest (xyz) and its half-width for the sight cone (w, m). */
  uSeeP: { value: new Vector4(0, 0, 0, 0.55) },
  /** A second subject (the fight's target, the speaker in a conversation): xyz, w half-width (0 = none). */
  uSeeT: { value: new Vector4(0, 0, 0, 0) },
  /** x lens radius inside which an occluder is gone, y its falloff (m), z cone strength 0..1, w world height above which nothing thins. */
  uSeeK: { value: new Vector4(0.45, 1.1, 0.82, 1e6) },
};

export type Atmosphere = typeof atmosphere;

/**
 * See-through for occluders of the third-person view (playtest round 10, F-03 / F-15 / F-21):
 * trunks, low spruce cones, ferns, bushes and rocks between the lens and the character (or the
 * fight's target, or the speaker), or pressed against the lens, screen-door dither away like the
 * character's own fade — no sorting, no transparency, the shadow pass untouched.
 *
 * Vertex side: `kqSee(base, r, top, wp)` → 0..1 how much to thin a vertical occluder standing
 * at `base` (xz axis, radius r, top height) for the vertex at world position `wp`; instanced
 * trees pass their instance, props their own vertex. Fragment side: `kqSeeCut(see, wp)` → discard.
 * Needs `uShadowPass` declared by the host shader (ATMOS_GLSL does) and the `uSee*` uniforms.
 */
export const SEE_GLSL = /* glsl */ `
uniform vec4 uSeeCam;
uniform vec4 uSeeP;
uniform vec4 uSeeT;
uniform vec4 uSeeK;
// the cone from the lens to a subject (s = its chest, w = its half-width): 0..1
float kqSeeCone(vec3 base, float r, float top, vec3 s, float w) {
  vec2 cp = s.xz - uSeeCam.xz;
  float L = length(cp);
  if (L < 0.4) return 0.0;
  vec2 dir = cp / L;
  vec2 ac = base.xz - uSeeCam.xz;
  float along = dot(ac, dir);
  // behind the lens, or not in front of the subject
  if (along < -r || along - r > L - 0.3) return 0.0;
  float k = clamp(along / L, 0.0, 1.0);
  float side = abs(ac.x * dir.y - ac.y * dir.x);
  float hw = r + w * k + 0.12;
  float c = 1.0 - smoothstep(hw, hw + 0.45, side);
  // low things (a fern) under the sight line to the subject's feet hide nothing
  float lineY = uSeeCam.y + (s.y - 1.0 - uSeeCam.y) * k;
  return c * step(lineY - 0.15, top);
}
float kqSee(vec3 base, float r, float top, vec3 wp) {
  if (uSeeCam.w <= 0.0 || uShadowPass > 0.5) return 0.0;
  vec2 d = base.xz - uSeeCam.xz;
  float dd = dot(d, d);
  if (dd > uSeeCam.w * uSeeCam.w) return 0.0;
  float lens = sqrt(dd) - r;
  // pressed against the lens: gone; a little further off: a thin ghost
  float s = lens < uSeeK.x ? 1.0 : 0.9 * (1.0 - smoothstep(uSeeK.x, uSeeK.x + uSeeK.y, lens));
  // the vertex itself at the lens (a low spruce branch, the bush the camera sits in)
  s = max(s, 1.0 - smoothstep(0.55, 1.25, length(wp - uSeeCam.xyz)));
  s = max(s, uSeeK.z * kqSeeCone(base, r, top, uSeeP.xyz, uSeeP.w));
  if (uSeeT.w > 0.0) s = max(s, uSeeK.z * kqSeeCone(base, r, top, uSeeT.xyz, uSeeT.w));
  return s;
}
`;

/** Fragment side of `SEE_GLSL`: discard by a screen-door pattern (needs `uSeeK`). */
export const SEE_FRAG_GLSL = /* glsl */ `
uniform vec4 uSeeK;
bool kqSeeCut(float see, vec3 wp) {
  if (see < 0.004) return false;
  // the crowns overhead stay: only what is near the eye line thins
  float k = see * (1.0 - smoothstep(uSeeK.w, uSeeK.w + 2.5, wp.y));
  return fract(52.9829189 * fract(dot(gl_FragCoord.xy + vec2(3.0, 11.0), vec2(0.06711056, 0.00583715)))) < k;
}
`;

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
uniform highp sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform vec4 uShadowParams;
uniform vec2 uShadowDetailSq;
uniform vec4 uShadowCenter;
uniform float uShadowPass;

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
 * Sun shadow at world position wp (1 = lit). Linear comparison sampling handles the filtered
 * depth comparisons. Use the wider tier kernel near the camera and one filtered tap farther out.
 */
float kqShadowTap(vec2 uv, float z) {
  return texture(uShadowMap, vec3(uv, z));
}
float kqShadow(vec3 wp, vec3 n) {
  if (uShadowParams.x < 0.5) return 1.0;
  vec2 fromCenter = wp.xz - uShadowCenter.xz;
  float fromCenterSq = dot(fromCenter, fromCenter);
  float radius = uShadowCenter.w;
  if (fromCenterSq >= radius * radius) return 1.0;
  float ndl = dot(n, uSunDir);
  vec3 p = wp + n * (0.05 + 0.12 * (1.0 - abs(ndl)));
  // The shadow projection is orthographic (clip w is one).
  vec3 s = (uShadowMatrix * vec4(p, 1.0)).xyz * 0.5 + 0.5;
  if (s.x <= 0.0 || s.y <= 0.0 || s.x >= 1.0 || s.y >= 1.0 || s.z >= 1.0) return 1.0;
  float z = s.z - 0.0005;
  float t = uShadowParams.y;
  vec2 fromCamera = wp.xz - uCamPos.xz;
  float fromCameraSq = dot(fromCamera, fromCamera);
  float lit;
  if (fromCameraSq < uShadowDetailSq.y) {
    float blend = smoothstep(uShadowDetailSq.x, uShadowDetailSq.y, fromCameraSq);
    if (uShadowParams.z > 6.0) {
      // 3×3 taps (Hoch). Reuse the centre sample for the distance blend.
      float centre = kqShadowTap(s.xy, z);
      float k = 1.25 * t;
      float around = kqShadowTap(s.xy + vec2(-k, -k), z) + kqShadowTap(s.xy + vec2(0.0, -k), z) + kqShadowTap(s.xy + vec2(k, -k), z)
                   + kqShadowTap(s.xy + vec2(-k, 0.0), z) + kqShadowTap(s.xy + vec2(k, 0.0), z)
                   + kqShadowTap(s.xy + vec2(-k, k), z) + kqShadowTap(s.xy + vec2(0.0, k), z) + kqShadowTap(s.xy + vec2(k, k), z);
      lit = mix((centre + around) / 9.0, centre, blend);
    } else {
      float k = 0.6 * t;
      lit = 0.25 * (kqShadowTap(s.xy + vec2(-k, -k), z) + kqShadowTap(s.xy + vec2(k, -k), z)
                  + kqShadowTap(s.xy + vec2(-k, k), z) + kqShadowTap(s.xy + vec2(k, k), z));
      if (blend > 0.0) lit = mix(lit, kqShadowTap(s.xy, z), blend);
    }
  } else {
    lit = kqShadowTap(s.xy, z);
  }
  float fade = smoothstep(radius * 0.8, radius, sqrt(fromCenterSq));
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
