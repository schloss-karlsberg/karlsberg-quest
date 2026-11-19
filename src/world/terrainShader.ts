import { ATMOS_GLSL } from './atmosphere';

export const TERRAIN_VERT = /* glsl */ `
precision highp float;
precision highp int;
uniform highp sampler2D uHeight;
uniform vec4 uGrid;      // x0, z0, cell, skirt depth per step (m)
uniform vec2 uGridSize;  // cols, rows
attribute vec3 aChunk;   // c0, r0, step (in samples)
varying vec3 vWorld;
varying float vOutside;

int mirrorIdx(int i, int n) {
  int p = 2 * (n - 1);
  i = i % p;
  if (i < 0) i += p;
  return i < n ? i : p - i;
}

void main() {
  vec2 cr = aChunk.xy + position.xz * aChunk.z;
  ivec2 ic = ivec2(int(cr.x), int(cr.y));
  ivec2 n = ivec2(uGridSize);
  ivec2 sc = ivec2(mirrorIdx(ic.x, n.x), mirrorIdx(ic.y, n.y));
  float h = texelFetch(uHeight, sc, 0).r;
  h -= position.y * uGrid.w * aChunk.z;
  vec3 wp = vec3(uGrid.x + cr.x * uGrid.z, h, uGrid.y + cr.y * uGrid.z);
  vec2 lo = uGrid.xy;
  vec2 hi = uGrid.xy + (uGridSize - 1.0) * uGrid.z;
  vec2 o = max(lo - wp.xz, vec2(0.0)) + max(wp.xz - hi, vec2(0.0));
  vOutside = length(o);
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const TERRAIN_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
uniform sampler2D uSurf;
uniform sampler2D uCover;
uniform sampler2D uMap;
uniform vec4 uGrid;
uniform vec2 uGridSize;
uniform int uScanMode;
uniform float uScanMix;
uniform vec3 uScanCenter;
uniform float uScanRadius;
uniform float uMapMix;
uniform float uContours;
uniform float uForestFar;
uniform float uHistoric;   // 0 today, 1 historic eras (palette)
uniform float uTreeShade;  // how much the canopy shades the forest floor
uniform float uPalette;    // 0 default, 1 colour-blind safe (settings.colorblind)
varying vec3 vWorld;
varying float vOutside;

vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }

float hillshadeMD(vec3 n) {
  // multi-directional hillshade (azimuths 225/270/315/360, elevation 35°), like the explorer's layer
  float e = radians(35.0);
  float s = 0.0;
  float w = 0.0;
  for (int k = 0; k < 4; k++) {
    float a = radians(225.0 + 45.0 * float(k));
    vec3 l = vec3(sin(a) * cos(e), sin(e), -cos(a) * cos(e));
    float wk = k == 2 ? 2.0 : 1.0;
    s += wk * max(dot(n, l), 0.0);
    w += wk;
  }
  return s / w;
}

vec3 diverging(float t) {
  // RdBu_r: blue (low) → paper white → red (high); colour-blind safe: Okabe-Ito blue → white →
  // orange (distinct for protan / deutan / tritan), with a lightness ramp that reads without hue
  vec3 blue = uPalette > 0.5 ? vec3(0.0, 0.3, 0.62) : vec3(0.13, 0.32, 0.62);
  vec3 white = vec3(0.96, 0.94, 0.9);
  vec3 red = uPalette > 0.5 ? vec3(0.9, 0.55, 0.0) : vec3(0.7, 0.12, 0.12);
  return t < 0.5 ? mix(blue, white, smoothstep(0.0, 0.5, t)) : mix(white, red, smoothstep(0.5, 1.0, t));
}

float contourLine(float h, float interval, float width) {
  float x = h / interval;
  float f = abs(fract(x - 0.5) - 0.5) / max(fwidth(x), 1e-4);
  return 1.0 - clamp(f / width, 0.0, 1.0);
}

void main() {
  vec2 uv = ((vWorld.xz - uGrid.xy) / uGrid.z + 0.5) / uGridSize;
  vec4 s = texture2D(uSurf, uv);
  vec4 cov = texture2D(uCover, uv);
  vec3 n = vec3(s.r * 2.0 - 1.0, 0.0, s.g * 2.0 - 1.0);
  n.y = sqrt(max(1.0 - n.x * n.x - n.z * n.z, 0.01));
  float slrm = (s.b - 0.5) * 6.0;   // m, local relief ±3
  float fine = (s.a - 0.5) * 2.0;   // m, fine relief ±1
  float dist = length(vWorld - uCamPos);
  vec3 n0 = n; // data normal without the procedural micro detail (used by the scan modes)
  // relief scan coverage first: where the scan paints the ground completely, the lit terrain
  // underneath (≈ 15 noise evaluations, lighting, fog) is never seen and is skipped
  float scanR = length(vWorld.xz - uScanCenter.xz);
  float reveal = (uScanMode > 0 && uScanMix > 0.001) ? uScanMix * (1.0 - smoothstep(uScanRadius * 0.9, uScanRadius, scanR)) : 0.0;
  vec3 col = uFogColor;
  if (reveal < 0.999) {

  // --- micro detail near the camera (leaf litter, grass clumps)
  float near = 1.0 - smoothstep(25.0, 90.0, dist);
  float nz1 = kqNoise(vWorld.xz * 1.7);
  float nz2 = kqFbm(vWorld.xz * 0.11);
  float nz3 = kqNoise(vWorld.xz * 0.023);
  if (near > 0.0) {
    float e = 0.35;
    float hx = kqNoise((vWorld.xz + vec2(e, 0.0)) * 1.7) - nz1;
    float hz = kqNoise((vWorld.xz + vec2(0.0, e)) * 1.7) - nz1;
    n = normalize(n + near * 0.35 * vec3(-hx, 0.0, -hz));
  }
  float slope = degrees(acos(clamp(n.y, -1.0, 1.0)));

  // --- albedo from land cover, season and slope
  float forest = cov.r;
  float water = cov.g;
  float bare = cov.b;
  float lawn = cov.a;
  vec3 meadowSummer = srgb(vec3(0.33, 0.43, 0.2));
  vec3 meadowAutumn = srgb(vec3(0.42, 0.42, 0.28));
  vec3 meadowWinter = srgb(vec3(0.40, 0.38, 0.32));
  float season = uSeason;
  vec3 meadow = season < 1.0 ? mix(meadowSummer, meadowAutumn, season) : mix(meadowAutumn, meadowWinter, season - 1.0);
  meadow *= 0.8 + 0.35 * nz2;
  // forest floor (only where there is forest: saves an fbm and a noise on open ground)
  vec3 litter = vec3(0.0);
  if (forest > 0.002) {
    vec3 litterAutumn = mix(srgb(vec3(0.33, 0.24, 0.16)), srgb(vec3(0.25, 0.21, 0.16)), smoothstep(0.3, 0.7, nz3 * 0.6 + nz2 * 0.6 - 0.1));
    vec3 litterSummer = srgb(vec3(0.24, 0.25, 0.15));
    litter = mix(litterSummer, litterAutumn, clamp(season, 0.0, 1.0)) * (0.7 + 0.45 * nz1 * nz2 + 0.2 * nz3);
    // moss and ivy patches on the forest floor
    litter = mix(litter, srgb(vec3(0.2, 0.27, 0.13)), smoothstep(0.5, 0.72, kqFbm(vWorld.xz * 0.045 + 3.0)) * 0.75);
    // darker damp hollows and twig/leaf clumps break up the floor
    litter *= mix(0.7, 1.05, smoothstep(-0.6, 0.6, slrm)) * (0.85 + 0.3 * kqNoise(vWorld.xz * 0.35));
  }
  vec3 lawnC = srgb(vec3(0.33, 0.47, 0.2)) * (0.9 + 0.2 * nz2);
  vec3 path = mix(srgb(vec3(0.5, 0.43, 0.34)), srgb(vec3(0.62, 0.55, 0.44)), uHistoric) * (0.85 + 0.3 * nz1);
  vec3 rock = srgb(vec3(0.52, 0.33, 0.26)) * (0.8 + 0.4 * nz2);

  vec3 alb = meadow;
  alb = mix(alb, lawnC, lawn);
  alb = mix(alb, litter, forest);
  alb = mix(alb, path, bare);
  alb = mix(alb, rock, smoothstep(32.0, 48.0, slope) * (1.0 - bare));

  // --- forest canopy seen from afar (beyond the instanced trees)
  float farF = smoothstep(uForestFar * 0.8, uForestFar, dist) * forest;
  if (farF > 0.0) {
    vec3 canopySummer = srgb(vec3(0.17, 0.24, 0.12));
    vec3 canopyAutumn = mix(srgb(vec3(0.42, 0.25, 0.1)), srgb(vec3(0.16, 0.2, 0.12)), smoothstep(0.35, 0.65, nz3 + 0.2 * nz2));
    vec3 canopyWinter = srgb(vec3(0.27, 0.24, 0.22));
    vec3 canopy = season < 1.0 ? mix(canopySummer, canopyAutumn, season) : mix(canopyAutumn, canopyWinter, season - 1.0);
    canopy *= 0.7 + 0.6 * kqFbm(vWorld.xz * 0.08);
    alb = mix(alb, canopy, farF);
  }

  // --- snow on flat ground
  float snow = uSnow * smoothstep(42.0, 20.0, slope) * (1.0 - forest * 0.5) * (0.85 + 0.15 * nz1);
  alb = mix(alb, srgb(vec3(0.86, 0.89, 0.95)), snow);

  // --- lighting
  float ao = clamp(1.0 + slrm * 0.22 + fine * 0.25, 0.5, 1.2);
  // the canopy's blanket shade stands in for real tree shadows only where the sun-shadow map does
  // not reach (low tier, beyond the shadow box): inside it the trees cast their own shadows
  float realShadow = uShadowParams.x * (1.0 - smoothstep(uShadowCenter.w * 0.8, uShadowCenter.w, length(vWorld.xz - uShadowCenter.xz)));
  float shade = mix(1.0, 1.0 - uTreeShade * (1.0 - 0.8 * realShadow), forest * (1.0 - farF));
  col = kqLight(alb, n, vWorld, ao * mix(1.0, 0.8, forest), shade);

  // --- water: dark, reflective
  if (water > 0.01) {
    vec3 v = normalize(vWorld - uCamPos);
    float fres = pow(1.0 - max(-v.y, 0.0), 4.0);
    vec3 wcol = srgb(vec3(0.04, 0.06, 0.06)) + mix(uFogColor * 0.6, uSkyAmbient, 0.5) * (0.15 + 0.85 * fres);
    wcol += uSunColor * pow(max(dot(reflect(v, vec3(0, 1, 0)), uSunDir), 0.0), 120.0) * 2.0;
    col = mix(col, wcol, smoothstep(0.2, 0.8, water) * (1.0 - snow));
  }

  // --- 1840 map overlay (Kartograf)
  if (uMapMix > 0.001) {
    vec3 m = texture2D(uMap, uv).rgb;
    float hs = hillshadeMD(n);
    vec3 mc = m * (0.55 + 0.6 * hs) * (uSunColor * 0.25 + uSkyAmbient * 0.6 + 0.35);
    col = mix(col, mc, uMapMix);
  }

  col = kqFog(col, vWorld);
  } // reveal < 0.999

  // --- relief scan modes (survey look), drawn over the lit terrain inside the scan radius
  if (uScanMode > 0 && uScanMix > 0.001) {
    // vertical exaggeration so that 30 cm banks and ditches read at walking distance
    vec3 nx = normalize(vec3(n0.x * 2.5, n0.y, n0.z * 2.5));
    float hs = hillshadeMD(nx);
    vec3 sc;
    if (uScanMode == 1) {
      sc = vec3(0.96, 0.93, 0.86) * (0.06 + 1.1 * hs);
    } else if (uScanMode == 2) {
      float t = clamp(0.5 + slrm / 2.4 + fine * 0.25, 0.0, 1.0);
      sc = diverging(t) * (0.55 + 0.6 * hs);
    } else {
      float slopeT = 1.0 - smoothstep(0.0, 25.0, degrees(acos(clamp(nx.y, -1.0, 1.0))));
      float openT = clamp(0.5 + fine * 1.3 + slrm * 0.35, 0.0, 1.0);
      float v = clamp(hs * 0.45 + slopeT * 0.25 + openT * 0.45 - 0.05, 0.0, 1.0);
      sc = mix(vec3(0.12, 0.1, 0.09), vec3(0.98, 0.95, 0.88), v);
    }
    sc = srgb(sc);
    if (uContours > 0.0) {
      float c5 = contourLine(vWorld.y, 5.0, 1.0) * (1.0 - smoothstep(250.0, 700.0, dist));
      float c25 = contourLine(vWorld.y, 25.0, 1.4);
      vec3 ink = srgb(vec3(0.24, 0.16, 0.1));
      sc = mix(sc, ink, max(c5 * 0.35, c25 * 0.6) * uContours);
    }
    float fogS = 1.0 - exp(-dist * uFogDensity * 0.3);
    sc = mix(sc, uFogColor, clamp(fogS, 0.0, 0.85));
    float r = scanR;
    // thin ink ring at the scan edge
    float ring = (1.0 - smoothstep(0.0, 2.5, abs(r - uScanRadius * 0.95))) * step(r, uScanRadius) * uScanMix * step(uScanRadius, 5000.0);
    col = mix(col, sc, reveal);
    col = mix(col, srgb(vec3(0.85, 0.7, 0.4)), ring * 0.6);
  }

  // dissolve the mirrored apron beyond the data extent into the fog
  col = mix(col, uFogColor, smoothstep(0.0, 700.0, vOutside));
  gl_FragColor = vec4(col, 1.0);
}
`;
