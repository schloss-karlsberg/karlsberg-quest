import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { atmosphere } from './atmosphere';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = vec4(p.xy, p.w * 0.99999, p.w); // just inside the far plane (no clipping holes)
}
`;

const SKY_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uBelow;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform vec3 uCloudColor;
uniform float uClouds;
uniform float uStars;
uniform float uDisc;      // 0 none, 1 sun, 2 moon
uniform float uTime;
uniform vec3 uGlowColor;
uniform vec3 uGlowDir;
uniform float uFogBlend;  // how much the lower sky melts into the fog colour
varying vec3 vDir;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise2(p);
    p = p * 2.07 + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = y > 0.0 ? mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(uHorizon, uBelow, clamp(-y * 6.0, 0.0, 1.0));
  // sun / moon halo
  float sd = max(dot(d, uSunDir), 0.0);
  if (uDisc > 0.5) {
    float isSun = step(uDisc, 1.5);
    col += uSunColor * (pow(sd, 8.0) * 0.18 + pow(sd, 64.0) * 0.35) * mix(0.35, 1.0, isSun);
    float disc = smoothstep(isSun > 0.5 ? 0.9994 : 0.99965, isSun > 0.5 ? 0.9997 : 0.99985, sd);
    vec3 discCol = isSun > 0.5 ? uSunColor * 8.0 : vec3(2.2, 2.3, 2.5);
    col = mix(col, discCol, disc);
  }
  // stars
  if (uStars > 0.0 && y > 0.0) {
    vec3 p = d * 420.0;
    vec3 cellp = floor(p);
    float h = hash(cellp);
    float star = step(0.9965, h) * smoothstep(0.5, 0.0, length(fract(p) - 0.5));
    float tw = 0.7 + 0.3 * sin(uTime * 2.0 + h * 50.0);
    col += vec3(star * tw * uStars * smoothstep(0.0, 0.25, y) * 1.4);
  }
  // clouds: fbm on a plane above
  if (uClouds > 0.0 && y > 0.0) {
    vec2 uv = d.xz / (y + 0.12) * 1.3 + vec2(uTime * 0.004, uTime * 0.0015);
    float c = fbm(uv);
    float cov = smoothstep(1.0 - uClouds * 0.75, 1.15 - uClouds * 0.35, c);
    float lit = 0.75 + 0.5 * pow(sd, 3.0);
    vec3 cc = uCloudColor * lit + uSunColor * pow(sd, 12.0) * 0.4;
    col = mix(col, cc, cov * smoothstep(0.0, 0.2, y) * 0.9);
  }
  // fire glow on the horizon
  float gd = max(dot(normalize(vec3(d.x, 0.0, d.z)), uGlowDir), 0.0);
  col += uGlowColor * pow(gd, 6.0) * exp(-max(y, 0.0) * 9.0) * 0.35;
  // horizon haze melts into the fog colour
  col = mix(col, uFogColor, uFogBlend * (1.0 - smoothstep(-0.02, 0.22, y)));
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Procedural sky dome (gradient, sun/moon, stars, clouds, fire glow). Follows the camera. */
export class Sky {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;

  constructor() {
    this.material = new ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new Color() },
        uHorizon: { value: new Color() },
        uBelow: { value: new Color() },
        uCloudColor: { value: new Color() },
        uClouds: { value: 0.5 },
        uStars: { value: 0 },
        uDisc: { value: 1 },
        uGlowDir: { value: new Vector3(1, 0, 0) },
        uFogBlend: { value: 0.85 },
        uSunDir: atmosphere.uSunDir,
        uSunColor: atmosphere.uSunColor,
        uFogColor: atmosphere.uFogColor,
        uTime: atmosphere.uTime,
        uGlowColor: atmosphere.uGlowColor,
      },
    });
    this.mesh = new Mesh(new SphereGeometry(1000, 48, 24), this.material);
    this.mesh.name = 'sky';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  get uniforms() {
    return this.material.uniforms;
  }

  follow(pos: Vector3): void {
    this.mesh.position.copy(pos);
  }
}
