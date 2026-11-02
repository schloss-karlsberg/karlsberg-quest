/**
 * Fire shaders. Every instance reads its room's state from a 1-row float texture:
 *   r = burn intensity, g = smoke density, b = collapse flash (decays), a = unused.
 * Time = atmosphere.uTime (simulation time: deterministic in ?manual tests).
 */
import { ATMOS_GLSL } from '../../../world/atmosphere';

const STATE = /* glsl */ `
uniform highp sampler2D uState;
uniform vec2 uWind;
vec4 unitState(float u) { return texelFetch(uState, ivec2(int(u + 0.5), 0), 0); }
`;

/** Flame tongues: cylindrical billboards, layered fbm, white-hot core → orange → deep red. */
export const FLAME_VERT = /* glsl */ `
${ATMOS_GLSL}
${STATE}
attribute vec3 aPos;
attribute vec4 aDim;   // w, h, unit, seed
attribute float aKind; // 0 roof, 1 window tongue
varying vec2 vUv;
varying float vI;
varying float vSeed;
varying float vFog;
void main() {
  vec4 st = unitState(aDim.z);
  float I = st.r;
  if (aKind > 0.5) I = smoothstep(0.4, 0.85, I) * (1.0 - 0.6 * smoothstep(0.5, 1.0, st.b));
  float flick = 0.82 + 0.18 * sin(uTime * (2.1 + aDim.w * 2.0) + aDim.w * 40.0) + 0.12 * sin(uTime * 5.3 + aDim.w * 13.0);
  vec2 size = vec2(aDim.x * (0.55 + 0.45 * I), aDim.y * (0.35 + 0.65 * I) * flick * (1.0 + st.b * 0.9));
  vec3 toCam = cameraPosition - aPos;
  vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-4, 0.0, 0.0));
  vec3 p = aPos + right * (position.x - 0.5) * size.x + vec3(0.0, position.y * size.y, 0.0);
  // the wind bends the tips
  float bend = position.y * position.y * size.y * 0.22;
  p.xz += uWind * bend * (0.8 + 0.4 * sin(uTime * 1.3 + aDim.w * 7.0));
  vUv = position.xy;
  vI = I;
  vSeed = aDim.w;
  float d = length(p - cameraPosition);
  vFog = exp(-d * (uFogDensity * 0.7));
  gl_Position = I < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const FLAME_FRAG = /* glsl */ `
${ATMOS_GLSL}
varying vec2 vUv;
varying float vI;
varying float vSeed;
varying float vFog;
void main() {
  float x = (vUv.x - 0.5) * 2.0;
  float y = vUv.y;
  float t = uTime;
  float n = kqFbm(vec2(vUv.x * 2.6 + vSeed * 17.0, y * 1.9 - t * 2.4 - vSeed * 5.0));
  float n2 = kqNoise(vec2(vUv.x * 6.5 - vSeed * 3.0, y * 4.5 - t * 5.2));
  float xd = x + (n - 0.5) * 1.1 * y;
  float width = mix(0.92, 0.04, pow(y, 0.75)) * (0.7 + 0.6 * n);
  float shape = 1.0 - smoothstep(width * 0.45, width, abs(xd));
  shape *= smoothstep(0.0, 0.12, y);
  float top = 1.0 - smoothstep(0.25 + 0.5 * n, 0.95, y + (n2 - 0.5) * 0.3);
  float heat = shape * top * (0.55 + 0.7 * n2);
  if (heat < 0.015) discard;
  vec3 c1 = vec3(0.75, 0.07, 0.01);
  vec3 c2 = vec3(1.0, 0.36, 0.04);
  vec3 c3 = vec3(1.0, 0.78, 0.38);
  vec3 col = mix(c1, c2, smoothstep(0.1, 0.45, heat));
  col = mix(col, c3, smoothstep(0.5, 0.95, heat * (1.15 - y * 0.6)));
  float lum = heat * (2.2 + 2.6 * (1.0 - y));
  gl_FragColor = vec4(col * lum * vI * vFog, 1.0);
}
`;

/** Window interiors glowing through the panes (wall-aligned quads, with a soft halo). */
export const WINDOW_VERT = /* glsl */ `
${ATMOS_GLSL}
${STATE}
attribute vec3 aPos;
attribute vec4 aDir;  // nx, nz, w, h
attribute vec2 aUnit; // unit, seed
varying vec2 vQ;
varying vec4 vSt;
varying float vSeed;
varying float vFog;
const vec2 EXP = vec2(2.0, 1.7);
void main() {
  vSt = unitState(aUnit.x);
  vec3 n = vec3(aDir.x, 0.0, aDir.y);
  vec3 right = vec3(-aDir.y, 0.0, aDir.x);
  vec2 q = (position.xy - 0.5) * EXP;
  vec3 p = aPos + right * q.x * aDir.z + vec3(0.0, q.y * aDir.w, 0.0) + n * 0.02;
  vQ = q;
  vSeed = aUnit.y;
  float d = length(p - cameraPosition);
  vFog = exp(-d * (uFogDensity * 0.7));
  float lit = max(vSt.r, vSt.g * 0.3);
  gl_Position = lit < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const WINDOW_FRAG = /* glsl */ `
${ATMOS_GLSL}
varying vec2 vQ;
varying vec4 vSt;
varying float vSeed;
varying float vFog;
void main() {
  vec2 q = vQ;
  vec2 aq = abs(q);
  float inside = step(aq.x, 0.5) * step(aq.y, 0.5);
  // glazing bars: one vertical, two horizontal, and the frame
  float bars = max(step(abs(q.x), 0.035), step(abs(q.y - 0.12), 0.03));
  bars = max(bars, step(abs(q.y + 0.22), 0.03));
  bars = max(bars, step(0.46, max(aq.x, aq.y)));
  float I = vSt.r;
  float fl = kqNoise(vec2(uTime * 3.1 + vSeed * 30.0, q.y * 2.0 - uTime * 1.7));
  vec3 deep = vec3(0.6, 0.08, 0.02);
  vec3 hot = vec3(1.0, 0.55, 0.15);
  vec3 col = mix(deep, hot, clamp(fl * 0.8 + I * 0.5 - (q.y + 0.5) * 0.25, 0.0, 1.0));
  float pane = inside * (1.0 - bars * 0.88);
  float ember = vSt.g * 0.12 * (1.0 - I);
  float lum = pane * (I * (2.4 + 1.8 * fl) + ember * 4.0);
  // halo around the opening (cheap bloom)
  vec2 o = max(aq - 0.5, 0.0) / vec2(0.5, 0.35);
  float halo = (1.0 - inside) * exp(-dot(o, o) * 3.0) * I * 0.55 * (0.8 + 0.4 * fl);
  // light spilling up the facade
  halo += (1.0 - inside) * step(0.5, q.y) * exp(-(q.y - 0.5) * 2.2) * exp(-q.x * q.x * 6.0) * I * 0.5;
  vec3 c = col * (lum + halo * 1.6);
  if (dot(c, c) < 1e-5) discard;
  gl_FragColor = vec4(c * vFog, 1.0);
}
`;

/** Smoke puffs: spherical billboards rising, widening and drifting with the wind, lit from below. */
export const SMOKE_VERT = /* glsl */ `
${ATMOS_GLSL}
${STATE}
attribute vec4 aSrc;  // x, y, z, radius
attribute vec4 aSeed; // unit, phase, rand, life
varying vec2 vUv;
varying float vAlpha;
varying float vLit;
varying float vSeed;
varying float vFog;
varying float vAge;
void main() {
  vec4 st = unitState(aSeed.x);
  float I = clamp(max(st.r, st.g * 0.55) + st.b * 0.9, 0.0, 1.6);
  float life = aSeed.w;
  float age = fract(uTime / life + aSeed.y);
  float r2 = fract(aSeed.z * 7.31);
  vec3 base = aSrc.xyz + vec3((aSeed.z - 0.5) * aSrc.w, -2.0, (r2 - 0.5) * aSrc.w);
  float rise = age * (34.0 + 26.0 * aSeed.z) * (0.55 + 0.55 * min(I, 1.0));
  vec3 c = base + vec3(0.0, rise, 0.0);
  c.xz += uWind * age * age * (70.0 + 40.0 * r2);
  c.x += sin(uTime * 0.37 + aSeed.z * 30.0) * age * 6.0;
  c.z += cos(uTime * 0.29 + r2 * 30.0) * age * 6.0;
  float size = mix(5.0, 34.0 + 16.0 * r2, pow(age, 0.7)) * (0.55 + 0.45 * min(I, 1.0)) * (1.0 + st.b * 0.6);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  // slow rotation of each puff
  float a = aSeed.z * 6.28 + uTime * 0.08 * (r2 - 0.5);
  vec2 q = position.xy - 0.5;
  q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
  vec3 p = c + right * q.x * size + up * q.y * size;
  vUv = position.xy;
  vAlpha = min(I, 1.0) * smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.5, 1.0, age));
  vLit = exp(-rise / 14.0) * st.r + st.b * 0.6 * exp(-rise / 30.0);
  vSeed = aSeed.z;
  vAge = age;
  float d = length(p - cameraPosition);
  vFog = 1.0 - exp(-d * uFogDensity * 0.5);
  gl_Position = vAlpha < 0.003 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const SMOKE_FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform float uDensity;
varying vec2 vUv;
varying float vAlpha;
varying float vLit;
varying float vSeed;
varying float vFog;
varying float vAge;
void main() {
  vec2 q = vUv - 0.5;
  float r = length(q);
  float n = kqFbm(vUv * 2.6 + vec2(vSeed * 11.0, uTime * 0.05 - vAge * 1.5));
  float puff = smoothstep(0.5, 0.08, r + (n - 0.5) * 0.35);
  float a = puff * vAlpha * uDensity * (0.55 + 0.6 * n);
  if (a < 0.004) discard;
  vec3 smoke = mix(vec3(0.028, 0.024, 0.022), vec3(0.075, 0.065, 0.06), n);
  // lit from below by the fire; the shaded upper side catches the moon a little
  vec3 lit = vec3(1.6, 0.55, 0.14) * (0.6 + 0.8 * n) * smoothstep(0.35, -0.2, q.y + (n - 0.5) * 0.3);
  vec3 col = smoke + uSunColor * 0.02 * smoothstep(-0.1, 0.4, q.y) + lit * vLit + uGlowColor * 0.015;
  col = mix(col, uFogColor * 0.6, vFog * 0.6);
  gl_FragColor = vec4(col, a);
}
`;

/** Embers drifting up and away with the wind (additive points). */
export const EMBER_VERT = /* glsl */ `
${ATMOS_GLSL}
${STATE}
uniform float uScale;
attribute vec4 aSrc;  // x, y, z, radius
attribute vec4 aSeed; // unit, phase, rand, rand2
varying float vAlpha;
varying float vHeat;
void main() {
  vec4 st = unitState(aSeed.x);
  float I = clamp(st.r + st.b * 1.5, 0.0, 2.0);
  float life = 3.5 + 4.0 * aSeed.w;
  float age = fract(uTime / life + aSeed.y);
  vec3 p = aSrc.xyz + vec3((aSeed.z - 0.5) * aSrc.w * 1.4, -1.0, (fract(aSeed.w * 13.7) - 0.5) * aSrc.w * 1.4);
  p.y += age * (9.0 + 22.0 * aSeed.z) * (0.6 + 0.4 * I);
  p.xz += uWind * age * (18.0 + 30.0 * aSeed.w);
  p.x += sin(uTime * (1.5 + aSeed.z * 2.0) + aSeed.w * 40.0) * (1.0 + age * 4.0);
  p.z += cos(uTime * (1.2 + aSeed.w * 2.0) + aSeed.z * 40.0) * (1.0 + age * 4.0);
  vAlpha = min(I, 1.0) * (1.0 - age) * smoothstep(0.0, 0.05, age);
  vHeat = (1.0 - age) * (0.6 + 0.4 * sin(uTime * 17.0 + aSeed.z * 90.0));
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = vAlpha < 0.01 ? 0.0 : clamp(0.16 * uScale / max(-mv.z, 0.5), 1.0, 4.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const EMBER_FRAG = /* glsl */ `
varying float vAlpha;
varying float vHeat;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float k = 1.0 - smoothstep(0.1, 0.5, length(c));
  vec3 col = mix(vec3(1.0, 0.18, 0.02), vec3(1.0, 0.75, 0.35), vHeat) * 3.0;
  gl_FragColor = vec4(col * k, vAlpha * k);
}
`;

/** Sparks of a roof collapse: a ballistic burst from a pool of up to 4 bursts. */
export const SPARK_VERT = /* glsl */ `
uniform vec4 uBursts[4];
uniform float uNow;
uniform float uScale;
uniform vec2 uWind;
attribute vec4 aVel;  // vx, vy, vz, burst index
attribute float aRand;
varying float vAlpha;
varying float vHeat;
void main() {
  vec4 b = uBursts[int(aVel.w + 0.5)];
  float t = uNow - b.w;
  float life = 1.6 + 1.8 * aRand;
  vec3 p = b.xyz;
  vAlpha = 0.0;
  if (t > 0.0 && t < life) {
    vec3 v = aVel.xyz;
    float drag = (1.0 - exp(-1.2 * t)) / 1.2;
    p += v * drag;
    p.y -= 3.2 * t * t;
    p.xz += uWind * t * t * 4.0;
    vAlpha = 1.0 - t / life;
  }
  vHeat = vAlpha;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = vAlpha <= 0.0 ? 0.0 : clamp(0.22 * uScale / max(-mv.z, 0.5), 1.0, 5.0);
  gl_Position = projectionMatrix * mv;
}
`;

/** Big soft additive glow over each burning roof (cheap bloom). */
export const HALO_VERT = /* glsl */ `
${ATMOS_GLSL}
${STATE}
attribute vec4 aSrc;  // x, y, z, radius
attribute vec4 aSeed; // unit, ...
varying vec2 vUv;
varying float vI;
void main() {
  vec4 st = unitState(aSeed.x);
  vI = clamp(st.r + st.b, 0.0, 1.5) * (0.85 + 0.15 * sin(uTime * 3.0 + aSeed.y * 20.0));
  float size = (26.0 + aSrc.w * 2.5) * (0.6 + 0.4 * min(vI, 1.0));
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 c = aSrc.xyz + vec3(0.0, 2.0, 0.0);
  vec3 p = c + right * (position.x - 0.5) * size + up * (position.y - 0.5) * size;
  vUv = position.xy;
  gl_Position = vI < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const HALO_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vI;
void main() {
  vec2 q = vUv - 0.5;
  float g = exp(-dot(q, q) * 14.0);
  gl_FragColor = vec4(vec3(1.0, 0.38, 0.08) * g * vI * 0.55, 1.0);
}
`;
