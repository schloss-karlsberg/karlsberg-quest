import { ATMOS_GLSL } from './atmosphere';

export const TERRAIN_VERT = /* glsl */ `
precision highp float;
precision highp int;
uniform highp sampler2D uHeight;
uniform highp sampler2D uRelief;
uniform vec3 uReliefGrid; // x0, z0, fade-out distance (m)
uniform vec3 uCamPos;
uniform vec4 uGrid;      // x0, z0, cell, skirt depth per step (m)
uniform vec2 uGridSize;  // cols, rows
uniform sampler2D uCover;
uniform float uBedDepth; // m the lake bed sinks below the (flat LiDAR) water surface
attribute vec3 aChunk;   // c0, r0, step (in samples)
varying vec3 vWorld;
varying float vOutside;

int mirrorIdx(int i, int n) {
  int p = 2 * (n - 1);
  i = i % p;
  if (i < 0) i += p;
  return i < n ? i : p - i;
}

float terrainHeight(ivec2 ic, ivec2 n) {
  ivec2 sc = ivec2(mirrorIdx(ic.x, n.x), mirrorIdx(ic.y, n.y));
  float h = texelFetch(uHeight, sc, 0).r;
  // water cells: the LiDAR return is the flat water surface; sink a bed under the water mesh
  // (world/water.ts draws the surface at the old height) so the shore meets it in a soft slope
  float wet = texelFetch(uCover, sc, 0).g;
  return h - uBedDepth * smoothstep(0.15, 0.85, wet);
}

void main() {
  vec2 cr = aChunk.xy + position.xz * aChunk.z;
  ivec2 ic = ivec2(cr);
  ivec2 n = ivec2(uGridSize);
  vec2 xz = uGrid.xy + cr * uGrid.z;
  float h;
  if (aChunk.z < 1.0) {
    // Each new vertex is the midpoint of a base triangle edge, including its b–c diagonal.
    // Interpolate the actual rendered height (also for shore triangles) before adding relief.
    ivec2 odd = ivec2(position.xz) % 2;
    if (odd.x == 1 && odd.y == 1) {
      h = 0.5 * (terrainHeight(ic + ivec2(1, 0), n) + terrainHeight(ic + ivec2(0, 1), n));
    } else {
      h = terrainHeight(ic, n);
      if (odd.x + odd.y > 0) h = 0.5 * (h + terrainHeight(ic + odd, n));
    }
    if (odd.x + odd.y > 0) {
      float fade = 1.0 - smoothstep(uReliefGrid.z * 0.5, uReliefGrid.z, distance(xz, uCamPos.xz));
      float offset = round(texelFetch(uRelief, ivec2(xz - uReliefGrid.xy), 0).r * 255.0) - 128.0;
      h += offset * 0.01 * fade;
    }
  } else {
    h = terrainHeight(ic, n);
  }
  h -= position.y * uGrid.w * max(1.0, aChunk.z);
  vec3 wp = vec3(xz.x, h, xz.y);
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
uniform float uRuin;       // 1796: burnt patches on the building grounds
#ifdef KQ_SPLAT
precision highp sampler2DArray;
uniform sampler2D uSurfDetail;
uniform vec4 uSurfDetailGrid; // north-west edge x/z, width/height in metres (one texel per metre)
// CC0 ground set (vegetation/strips.ts): 0 litter, 1 forest floor, 2 grass, 3 gravel, 4 rock,
// 5 snow, 6 mud, 7 burnt. Albedo (sRGB) and normal xy + height in one array each.
uniform sampler2DArray uGroundAlb;
uniform sampler2DArray uGroundNH;
uniform float uTile[8];
uniform float uDetailFar;  // m: texture normals fade out here
#endif
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
  float dist = length(vWorld - uCamPos);
#ifdef KQ_SPLAT
  if (uHistoric < 0.5 && uSurfDetailGrid.z > 0.0 && uScanMix <= 0.001 && uMapMix <= 0.001) {
    vec2 metres = vWorld.xz - uSurfDetailGrid.xy;
    vec2 edge = min(metres, uSurfDetailGrid.zw - metres);
    float detail = smoothstep(0.0, 16.0, min(edge.x, edge.y))
      * (1.0 - smoothstep(45.0, 100.0, dist)) * (1.0 - smoothstep(0.03, 0.18, cov.g));
    // Use explicit gradients for mip selection even when neighbouring fragments skip the read.
    vec2 uvDetail = metres / uSurfDetailGrid.zw;
    vec2 dx = dFdx(uvDetail);
    vec2 dy = dFdy(uvDetail);
    if (detail > 0.0) s = mix(s, textureGrad(uSurfDetail, uvDetail, dx, dy), detail);
  }
#endif
  vec3 n = vec3(s.r * 2.0 - 1.0, 0.0, s.g * 2.0 - 1.0);
  n.y = sqrt(max(1.0 - n.x * n.x - n.z * n.z, 0.01));
  float slrm = (s.b - 0.5) * 6.0;   // m, local relief ±3
  float fine = (s.a - 0.5) * 2.0;   // m, fine relief ±1
  vec3 n0 = n; // data normal without the procedural micro detail (used by the scan modes)
  // relief scan coverage first: where the scan paints the ground completely, the lit terrain
  // underneath (≈ 15 noise evaluations, lighting, fog) is never seen and is skipped
  float scanR = length(vWorld.xz - uScanCenter.xz);
  float reveal = (uScanMode > 0 && uScanMix > 0.001) ? uScanMix * (1.0 - smoothstep(uScanRadius * 0.9, uScanRadius, scanR)) : 0.0;
  vec3 col = uFogColor;
  if (reveal < 0.999) {

  float forest = cov.r;
  float water = cov.g;
  float bare = cov.b;
  float lawn = cov.a;
  float season = uSeason;
  float nz2 = kqFbm(vWorld.xz * 0.11);
  float nz3 = kqNoise(vWorld.xz * 0.023);
#ifdef KQ_SPLAT
  // --- splat-blended CC0 ground set: weights from land cover, slope, water, era; then
  // height-blended (the taller texel wins: pebbles poke out of the leaves), no visible tiling
  // (two offset lookups switched by a macro noise), macro colour variation on top
  float slope = degrees(acos(clamp(n.y, -1.0, 1.0)));
  float autumn = clamp(season, 0.0, 1.0);
  float macro = kqFbm(vWorld.xz * 0.013 + 7.0);
  float moss = smoothstep(0.42, 0.7, kqFbm(vWorld.xz * 0.045 + 3.0));
  float wv[8];
  wv[0] = forest * mix(0.25, 1.0, autumn) * (1.0 - 0.6 * moss);
  wv[1] = forest * (mix(1.0, 0.25, autumn) + moss * 0.9);
  wv[2] = (1.0 - forest) * (1.0 - bare) + lawn;
  wv[3] = bare * (1.0 - uRuin * 0.5);
  wv[7] = uRuin * (bare * (0.5 + 0.8 * smoothstep(0.45, 0.65, nz2)) + (1.0 - forest) * 0.6 * smoothstep(0.55, 0.75, macro));
  float rockW = smoothstep(30.0, 46.0, slope) * (1.0 - bare);
  // damp mud: the lake shore (and the bed under the water) and wet hollows in the forest
  float mudW = max(smoothstep(0.03, 0.4, water), forest * smoothstep(-0.2, -1.4, slrm) * smoothstep(0.45, 0.7, nz2) * 0.8);
  float snowW = uSnow * smoothstep(44.0, 24.0, slope) * (1.0 - forest * 0.3) * (0.9 + 0.1 * nz2);
  float keep = (1.0 - rockW) * (1.0 - mudW);
  for (int i = 0; i < 4; i++) wv[i] *= keep;
  wv[7] *= keep;
  wv[4] = rockW * (1.0 - mudW);
  wv[6] = mudW;
  float wsum = 0.0;
  for (int i = 0; i < 8; i++) { if (i != 5) wv[i] *= (1.0 - snowW); wsum += i == 5 ? 0.0 : wv[i]; }
  wv[5] = snowW;
  wsum += snowW;
  for (int i = 0; i < 8; i++) wv[i] /= max(wsum, 1e-4);
  // anti-tiling: a macro noise picks one of 8 offsets per patch, blended between neighbours
  vec2 dX = dFdx(vWorld.xz);
  vec2 dY = dFdy(vWorld.xz);
  float lk = kqNoise(vWorld.xz * 0.09) * 8.0;
  float ia = floor(lk);
  float fb = smoothstep(0.25, 0.75, fract(lk));
  vec2 offA = sin(vec2(3.0, 7.0) * ia);
  vec2 offB = sin(vec2(3.0, 7.0) * (ia + 1.0));
  vec4 cs[8];
  vec4 hs[8];
  float best = -1.0;
  for (int i = 0; i < 8; i++) {
    cs[i] = vec4(0.0);
    hs[i] = vec4(0.5, 0.5, 0.0, 0.0);
    if (wv[i] < 0.015) continue;
    float t = uTile[i];
    vec2 uvl = vWorld.xz / t;
    vec2 gx = dX / t;
    vec2 gy = dY / t;
    float L = float(i);
    vec4 ca = vec4(0.0);
    vec4 ha = vec4(0.0);
    vec4 cb = vec4(0.0);
    vec4 hb = vec4(0.0);
    if (fb < 0.98) {
      ca = textureGrad(uGroundAlb, vec3(uvl + offA, L), gx, gy);
      ha = textureGrad(uGroundNH, vec3(uvl + offA, L), gx, gy);
    }
    if (fb > 0.02) {
      cb = textureGrad(uGroundAlb, vec3(uvl + offB, L), gx, gy);
      hb = textureGrad(uGroundNH, vec3(uvl + offB, L), gx, gy);
    }
    if (fb <= 0.02) { cb = ca; hb = ha; }
    if (fb >= 0.98) { ca = cb; ha = hb; }
    cs[i] = mix(ca, cb, fb);
    hs[i] = mix(ha, hb, fb);
    best = max(best, hs[i].b + wv[i] * 1.6);
  }
  // height blend: keep what rises within 0.35 of the winner
  vec3 alb = vec3(0.0);
  vec2 dn = vec2(0.0);
  float hsum = 0.0;
  float hgt = 0.0;
  for (int i = 0; i < 8; i++) {
    if (wv[i] < 0.015) continue;
    float b = max(hs[i].b + wv[i] * 1.6 - best + 0.35, 0.0);
    b *= b;
    vec3 c = cs[i].rgb;
    // era / season tints per layer (hand-painted feel: warm lights, rich but not garish)
    if (i == 2) {
      // summer: pulled towards a fresh green at the texture's own brightness (the CC0 leafy-grass
      // set is straw-warm; under a low warm sun it read as sand)
      float gl = dot(c, vec3(0.3, 0.59, 0.11));
      vec3 lush = mix(c * vec3(0.86, 1.1, 0.72), gl * vec3(0.68, 1.12, 0.46), 0.55);
      vec3 gold = c * vec3(1.12, 1.0, 0.68);
      c = mix(lush, gold, autumn * 0.85);
      c = mix(c, c * vec3(1.15, 0.98, 0.62), clamp(season - 1.0, 0.0, 1.0));
      c *= mix(1.0, 1.12, lawn);
    } else if (i == 0) {
      c *= vec3(1.06, 0.95, 0.85);
    } else if (i == 3) {
      // 1789 gravel walks are pale, raked sandstone grit (not ×1.45: under the summer sun the
      // Ehrenhof and the walks burnt out to a white sand plane, playtest round 7)
      float l = dot(c, vec3(0.3, 0.55, 0.15));
      c = mix(c, vec3(l) * vec3(1.12, 1.04, 0.9) * 1.12, uHistoric * (1.0 - uRuin) * 0.6);
    } else if (i == 5) {
      c = mix(c, vec3(0.9, 0.93, 1.0), 0.45);
    }
    alb += c * b;
    dn += (hs[i].rg * 2.0 - 1.0) * b;
    hgt += hs[i].b * b;
    hsum += b;
  }
  alb /= max(hsum, 1e-4);
  dn /= max(hsum, 1e-4);
  hgt /= max(hsum, 1e-4);
  // macro variation (no repeat at 20 m): value and a warm/cool hue drift
  alb *= 0.8 + 0.42 * macro;
  alb = mix(alb, alb * vec3(1.08, 1.0, 0.86), smoothstep(0.35, 0.75, nz3));
  // detail normal (image +Y = −z here), fades out with distance
  float ns = 0.85 * (1.0 - smoothstep(uDetailFar * 0.4, uDetailFar, dist));
  n = normalize(vec3(n.x + dn.x * ns, n.y, n.z - dn.y * ns));
  float snow = snowW;
  float cavity = mix(0.72, 1.06, smoothstep(0.1, 0.75, hgt));
#else
  // --- micro detail near the camera (leaf litter, grass clumps)
  float near = 1.0 - smoothstep(25.0, 90.0, dist);
  float nz1 = kqNoise(vWorld.xz * 1.7);
  if (near > 0.0) {
    float e = 0.35;
    float hx = kqNoise((vWorld.xz + vec2(e, 0.0)) * 1.7) - nz1;
    float hz = kqNoise((vWorld.xz + vec2(0.0, e)) * 1.7) - nz1;
    n = normalize(n + near * 0.35 * vec3(-hx, 0.0, -hz));
  }
  float slope = degrees(acos(clamp(n.y, -1.0, 1.0)));

  // --- albedo from land cover, season and slope
  vec3 meadowSummer = srgb(vec3(0.33, 0.43, 0.2));
  vec3 meadowAutumn = srgb(vec3(0.42, 0.42, 0.28));
  vec3 meadowWinter = srgb(vec3(0.40, 0.38, 0.32));
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

  float cavity = 1.0;
#endif

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

#ifndef KQ_SPLAT
  // --- snow on flat ground
  float snow = uSnow * smoothstep(42.0, 20.0, slope) * (1.0 - forest * 0.5) * (0.85 + 0.15 * nz1);
  alb = mix(alb, srgb(vec3(0.86, 0.89, 0.95)), snow);
#endif

  // --- lighting
  float ao = clamp(1.0 + slrm * 0.22 + fine * 0.25, 0.5, 1.2) * cavity;
  // the canopy's blanket shade stands in for real tree shadows only where the sun-shadow map does
  // not reach (low tier, beyond the shadow box): inside it the trees cast their own shadows
  float realShadow = uShadowParams.x * (1.0 - smoothstep(uShadowCenter.w * 0.8, uShadowCenter.w, length(vWorld.xz - uShadowCenter.xz)));
  float shade = mix(1.0, 1.0 - uTreeShade * (1.0 - 0.8 * realShadow), forest * (1.0 - farF));
  col = kqLight(alb, n, vWorld, ao * mix(1.0, 0.8, forest), shade);

  // --- the lake bed under the water mesh (world/water.ts): darker and cooler with depth
  if (water > 0.01) col *= mix(vec3(1.0), vec3(0.45, 0.5, 0.48), smoothstep(0.2, 0.9, water));

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
