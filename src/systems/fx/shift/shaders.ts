/** Shaders of the era-shift effect: point cloud, veil, rewind streaks. */

/** LiDAR point cloud. KIND 0 terrain, 1 palace, 2 trees. Additive. */
export const CLOUD_VERT = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
uniform float uWaveR;
uniform float uInR;
uniform float uMorph;
uniform float uPalCut;
uniform float uPalLine;
uniform float uPalSolid;
uniform float uTreeCut;   // trees: old set visible above this rel height, new set below it
uniform float uTreeNew;   // 0 old trees, 1 new trees
uniform float uScale;
uniform float uSize;
uniform vec3 uCenter;
uniform float uFlash;
attribute float aRand;
#if KIND == 0
attribute float aH2;
attribute float aShade;
#else
attribute float aBase;
#endif
#if KIND == 1
attribute float aConf;
#endif
#if KIND == 2
attribute float aRel;
#endif
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 p = position;
  float d = length(p.xz - uCenter.xz);
  // points appear behind the outgoing scan wave, a bright brass line rides on its front
  float behind = 1.0 - smoothstep(uWaveR - 2.5, uWaveR, d);
  float front = exp(-pow((d - uWaveR) / 2.5, 2.0));
  // the reassembly wave hands each point back to the solid world
  float rebuilt = uInR > 0.0 ? smoothstep(uInR - 30.0, uInR - 2.0, d) : 1.0;
  float inFront = uInR > 0.0 ? exp(-pow((d - uInR) / 3.5, 2.0)) : 0.0;
  vec3 brass = vec3(1.9, 1.25, 0.55);
  vec3 col;
  float a = uAlpha;
#if KIND == 0
  float h = mix(p.y, aH2, uMorph);
  // the land breathes while it changes shape
  h += sin(uMorph * 3.14159) * (0.4 + 1.6 * aRand) * (0.5 + 0.5 * sin(d * 0.08 - uTime * 4.0));
  p.y = h + 0.2;
  float band = smoothstep(0.86, 1.0, fract(h / 2.5));
  float sh = aShade * aShade;
  col = mix(vec3(0.05, 0.2, 0.34), vec3(0.75, 0.95, 1.15), sh) * (0.35 + 0.9 * sh);
  col += vec3(0.6, 0.45, 0.25) * band * 0.7;
  col *= 1.0 - 0.6 * smoothstep(80.0, 360.0, d);
  a *= behind * rebuilt;
  col += brass * (front * 1.6 + inFront * 1.2);
#elif KIND == 1
  float rel = p.y - aBase;
  vec3 conf = aConf < 0.5 ? vec3(1.0, 0.25, 0.55) : aConf < 1.5 ? vec3(1.0, 0.55, 0.12) : vec3(0.2, 1.0, 0.55);
  float line = exp(-pow((rel - uPalLine) / 0.5, 2.0));
  float vis = 1.0 - smoothstep(uPalCut - 0.2, uPalCut + 0.2, rel);
  // points under the solid walls hand over (avoids sparkle on the surface)
  float under = smoothstep(uPalSolid - 0.6, uPalSolid + 0.6, rel);
  col = conf * 1.25 + brass * line * 2.6;
  a *= vis * behind * mix(0.15, 1.0, under);
#else
  float rel = aRel;
  float alive = uTreeNew > 0.5 ? 1.0 - smoothstep(uTreeCut - 0.04, uTreeCut, rel) : smoothstep(uTreeCut, uTreeCut + 0.04, rel);
  float edge = exp(-pow((rel - uTreeCut) / 0.03, 2.0)) * step(0.001, uTreeCut) * step(uTreeCut, 0.999);
  col = mix(vec3(0.18, 0.62, 0.42), vec3(0.55, 1.0, 0.7), aRand) * (0.55 + 0.6 * rel) + brass * edge * 1.2;
  a *= alive * behind * rebuilt;
  col += brass * (front + inFront);
#endif
  col += vec3(1.0, 0.85, 0.6) * uFlash;
  vColor = col;
  vAlpha = a;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = uSize * (0.7 + 0.6 * aRand);
  gl_PointSize = a < 0.003 ? 0.0 : clamp(size * uScale / max(-mv.z, 0.5), 1.0, 7.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const CLOUD_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c);
  if (r > 0.25) discard;
  float k = 1.0 - r * 3.2;
  gl_FragColor = vec4(vColor * k, vAlpha);
}
`;

/** Veil sphere around the camera (the void between eras). */
export const VEIL_VERT = /* glsl */ `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const VEIL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
void main() {
  gl_FragColor = vec4(uColor, uAlpha);
}
`;

/** Full-screen fade (same palette as the veil). */
export const FADE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(uColor, uAlpha);
}
`;

/** Time-rewind streaks spiralling around the player (line segments, head/tail per particle). */
export const REWIND_VERT = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
uniform vec3 uCenter;
attribute vec4 aSeed;   // angle, radius, height, speed
attribute float aTail;  // 0 head, 1 tail
varying float vAlpha;
varying float vTail;
vec3 at(float t) {
  float ang = aSeed.x - aSeed.w * t * 1.9;
  float r = aSeed.y * (1.0 - 0.35 * smoothstep(0.0, 3.0, t)) * (1.0 + 0.12 * sin(t * 2.0 + aSeed.x * 3.0));
  float y = aSeed.z + 1.8 * sin(t * 0.9 + aSeed.x * 5.0) - 2.0 * t * (aSeed.w - 0.8);
  return uCenter + vec3(cos(ang) * r, y, sin(ang) * r);
}
void main() {
  float t = uTime - aTail * (0.025 + 0.02 * aSeed.w);
  vec3 p = at(t);
  vAlpha = uAlpha * (1.0 - aTail);
  vTail = aTail;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const REWIND_FRAG = /* glsl */ `
varying float vAlpha;
varying float vTail;
void main() {
  vec3 col = mix(vec3(1.8, 1.3, 0.7), vec3(0.6, 0.3, 0.1), vTail);
  gl_FragColor = vec4(col, vAlpha);
}
`;
