/**
 * The Fläschchen's material: the world's light (sun, sky / ground ambient, lantern, the fire glow;
 * src/world/atmosphere.ts) and fog, like every other prop, plus a sun highlight and a rim for glass.
 * Optional `map` (the label canvas).
 */
import { Color, DoubleSide, ShaderMaterial, type Texture } from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';

const VERT = /* glsl */ `
varying vec3 vWp;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
uniform vec3 uColor;
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uSpec;
uniform float uSelf;
varying vec3 vWp;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vec3 alb = uHasMap > 0.5 ? texture2D(uMap, vUv).rgb : uColor;
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 col = kqLight(alb, n, vWp, 1.0, 1.0) + alb * uSelf;
  if (uSpec > 0.0) {
    vec3 v = normalize(uCamPos - vWp);
    float sp = pow(max(dot(reflect(-uSunDir, n), v), 0.0), 48.0);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    // glass: a sharp sun highlight, the sky in the rim, the lantern caught in it at night
    col += uSunColor * sp * uSpec + uSkyAmbient * rim * 0.35 * uSpec + uLantern * rim * 0.05 * uSpec;
  }
  gl_FragColor = vec4(kqFog(col, vWp), 1.0);
}
`;

export function flaschenMaterial(o: { color?: number; map?: Texture; spec?: number; self?: number }): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      ...atmosphere,
      uColor: { value: new Color(o.color ?? 0xffffff).convertSRGBToLinear() },
      uMap: { value: o.map ?? null },
      uHasMap: { value: o.map ? 1 : 0 },
      uSpec: { value: o.spec ?? 0 },
      uSelf: { value: o.self ?? 0 },
    },
    side: DoubleSide,
  });
}
