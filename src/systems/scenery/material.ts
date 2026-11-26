/**
 * Shared materials of the set dressing: the prop material (vertex colours, the world's light and
 * fog, snow on top faces in snowy looks, weathering noise, emissive parts that flicker like
 * embers / candle light) and the soft additive glow sprites (lit windows, fire light).
 */
import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import { SURF_GLSL, surfaces } from '../../world/surfaces';

const PROP_VERT = /* glsl */ `
attribute vec3 color;
attribute float aGlow;
attribute float aSurf;
attribute vec2 aUv;
varying vec3 vWp;
varying vec3 vN;
varying vec3 vCol;
varying float vGlow;
varying float vSurf;
varying vec2 vUv;
void main() {
  vSurf = aSurf - 1.0; // stored +1 (missing attribute → −1 = untextured)
  vUv = aUv;
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    // Inverse-transpose for rotation and non-uniform scale (no shear).
    mat3 basis = mat3(instanceMatrix);
    n /= vec3(dot(basis[0], basis[0]), dot(basis[1], basis[1]), dot(basis[2], basis[2]));
    n = basis * n;
  #endif
  vec4 wp = modelMatrix * p;
  vWp = wp.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vCol = color;
  #ifdef USE_INSTANCING_COLOR
    vCol *= instanceColor;
  #endif
  vGlow = aGlow;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const PROP_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
${SURF_GLSL}
uniform vec3 uEmissive;
uniform float uOpacity;
varying vec3 vWp;
varying vec3 vN;
varying vec3 vCol;
varying float vGlow;
varying float vSurf;
varying vec2 vUv;
void main() {
  if (uOpacity < 1.0 && kqHash12(gl_FragCoord.xy + floor(uTime * 30.0)) > uOpacity) discard;
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 col;
  if (uSurfOn > 0.5 && vSurf > -0.5) {
    // textured (medium / high): CC0 material detail on the palette colour, bump, specular
    vec3 alb = vCol * (0.92 + 0.16 * kqNoise(vWp.xz * 0.6 + vWp.y));
    float rough = 0.85;
    float metal = 0.0;
    kqSurface(vSurf, vUv, vWp, alb, n, rough, metal);
    // grime near the ground, snow on what faces the sky
    alb *= mix(0.78, 1.0, smoothstep(0.0, 0.5, fract(vWp.y) + n.y * 0.4));
    float snow = uSnow * smoothstep(0.5, 0.85, n.y) * smoothstep(0.35, 0.6, kqNoise(vWp.xz * 3.0) + 0.3);
    alb = mix(alb, vec3(0.82, 0.86, 0.95), snow);
    rough = mix(rough, 0.6, snow);
    col = kqLightPbr(alb, n, vWp, 1.0, rough, metal * (1.0 - snow));
  } else {
    float g = kqNoise(vWp.xz * 1.7 + vWp.y * 2.3);
    vec3 alb = vCol * (0.84 + 0.3 * g);
    // dirt creeps up from the ground, snow settles on what faces the sky
    alb *= mix(0.72, 1.0, smoothstep(0.0, 0.6, fract(vWp.y) + n.y * 0.4));
    float snow = uSnow * smoothstep(0.55, 0.85, n.y) * smoothstep(0.35, 0.6, kqNoise(vWp.xz * 3.0) + 0.3);
    alb = mix(alb, vec3(0.82, 0.86, 0.95), snow);
    col = kqLight(alb, n, vWp, 1.0, 1.0);
  }
  if (vGlow > 0.0) {
    float fl = 0.78 + 0.22 * sin(uTime * 7.3 + vWp.x * 3.1) * sin(uTime * 4.1 + vWp.z * 2.3);
    col += uEmissive * vGlow * fl;
  }
  gl_FragColor = vec4(kqFog(col, vWp), 1.0);
}
`;

/** The one material for all props of a set (vertex colours + aGlow). */
export function propMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: PROP_VERT,
    fragmentShader: PROP_FRAG,
    uniforms: { ...atmosphere, ...surfaces, uEmissive: { value: new Color(3.2, 1.25, 0.35) }, uOpacity: { value: 1 } },
    side: DoubleSide,
  });
}

const SPRITE_VERT = /* glsl */ `
attribute vec4 aSprite;   // x, y, z, size
attribute vec4 aTint;     // rgb, phase
uniform float uTime;
uniform float uFlicker;
varying vec2 vUv;
varying vec3 vTint;
varying float vFade;
void main() {
  vec3 c = aSprite.xyz;
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float fl = 1.0 - uFlicker * (0.18 + 0.12 * sin(uTime * 6.1 + aTint.w * 13.0) * sin(uTime * 3.7 + aTint.w * 7.0));
  mv.xy += (position.xy - 0.5) * aSprite.w;
  vUv = position.xy;
  vTint = aTint.rgb * fl;
  vFade = 1.0 - smoothstep(260.0, 520.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const SPRITE_FRAG = /* glsl */ `
uniform float uAlpha;
varying vec2 vUv;
varying vec3 vTint;
varying float vFade;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = exp(-r * r * 4.0) * (1.0 - smoothstep(0.85, 1.0, r));
  a *= uAlpha * vFade;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vTint * a, a);
}
`;

/** Camera-facing soft glows (instanced quads with aSprite / aTint). */
export function glowMaterial(flicker = 1): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: SPRITE_VERT,
    fragmentShader: SPRITE_FRAG,
    uniforms: { uTime: atmosphere.uTime, uFlicker: { value: flicker }, uAlpha: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

const POOL_VERT = /* glsl */ `
attribute float aPool;
varying float vPool;
varying vec2 vUv;
varying vec3 vWp;
void main() {
  vPool = aPool;
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const POOL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
varying float vPool;
varying vec2 vUv;
varying vec3 vWp;
void main() {
  vec2 d = vUv - vec2(0.5, 0.0);
  float a = exp(-dot(d * vec2(2.6, 1.8), d * vec2(2.6, 1.8)) * 3.0) * vPool * uAlpha;
  a *= 0.9 + 0.1 * sin(uTime * 5.0 + vWp.x);
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

/** Light pools draped on the ground (additive; uv.y = distance from the source edge). */
export function poolMaterial(color: Color): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: POOL_VERT,
    fragmentShader: POOL_FRAG,
    uniforms: { uColor: { value: color }, uAlpha: { value: 1 }, uTime: atmosphere.uTime },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}
