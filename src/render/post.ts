import {
  BufferGeometry,
  Camera,
  Color,
  Float32BufferAttribute,
  HalfFloatType,
  Mesh,
  OrthographicCamera,
  type Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform vec2 uResolution;
uniform float uExposure;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uShift;      // 0..1 era-shift distortion (feature hook)
uniform vec3 uFlash;       // additive full-screen tint (damage, fire flash)
uniform float uDesaturate; // extra desaturation (threat, memory)
uniform float uHeat;       // 0..1 heat shimmer above bright (burning) areas (fx system)
uniform float uFlashScale; // settings.reducedFlash: full-screen flashes are scaled down here
varying vec2 vUv;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vUv;
  if (uShift > 0.0) {
    vec2 c = uv - 0.5;
    float r = length(c);
    uv += c * sin(r * 18.0 - uTime * 6.0) * 0.012 * uShift;
  }
  if (uHeat > 0.0) {
    // hot air rises above bright (HDR) fire pixels: wobble what lies just above them
    float hot = smoothstep(1.2, 5.0, dot(texture2D(tScene, uv - vec2(0.0, 0.045)).rgb, vec3(0.33)));
    hot = max(hot, 0.6 * smoothstep(1.2, 5.0, dot(texture2D(tScene, uv - vec2(0.0, 0.11)).rgb, vec3(0.33))));
    vec2 w = vec2(sin(uv.y * 120.0 - uTime * 11.0 + sin(uv.x * 40.0)), cos(uv.x * 90.0 + uTime * 8.0));
    uv += w * 0.0022 * uHeat * hot;
  }
  vec3 col = texture2D(tScene, uv).rgb;
  if (uShift > 0.0) {
    float ca = 0.004 * uShift * uFlashScale;
    col.r = texture2D(tScene, uv + vec2(ca, 0.0)).r;
    col.b = texture2D(tScene, uv - vec2(ca, 0.0)).b;
  }
  col *= uExposure;
  col = aces(col);
  // grade in display space
  col = toSRGB(col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation * (1.0 - uDesaturate));
  col = (col - 0.5) * uContrast + 0.5;
  col = uLift + col * (uGain - uLift);
  // vignette
  vec2 q = vUv - 0.5;
  q.x *= uResolution.x / uResolution.y;
  float v = smoothstep(0.95, 0.25, length(q));
  col *= mix(1.0, v, uVignette);
  col += uFlash * uFlashScale;
  // film grain
  float g = hash(vUv * uResolution + fract(uTime * 7.13) * 100.0) - 0.5;
  col += g * uGrain;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/**
 * Scene → HDR render target (MSAA) → one full-screen pass doing tone mapping, colour grading,
 * vignette and grain. Feature systems tweak `post.uniforms` (uShift, uFlash, uDesaturate, uHeat …).
 */
export class PostFX {
  readonly target: WebGLRenderTarget;
  readonly material: ShaderMaterial;
  private readonly quad: Mesh;
  private readonly cam: Camera = new OrthographicCamera();
  enabled = true;

  constructor(samples = 4) {
    this.target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples, depthBuffer: true });
    this.material = new ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: this.target.texture },
        uResolution: { value: new Vector2(1, 1) },
        uExposure: { value: 1 },
        uSaturation: { value: 1 },
        uContrast: { value: 1 },
        uLift: { value: new Color(0, 0, 0) },
        uGain: { value: new Color(1, 1, 1) },
        uVignette: { value: 0.3 },
        uGrain: { value: 0.03 },
        uTime: { value: 0 },
        uShift: { value: 0 },
        uFlash: { value: new Color(0, 0, 0) },
        uDesaturate: { value: 0 },
        uHeat: { value: 0 },
        uFlashScale: { value: 1 },
      },
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new Mesh(g, this.material);
    this.quad.frustumCulled = false;
  }

  get uniforms() {
    return this.material.uniforms;
  }

  setSize(w: number, h: number, dpr: number): void {
    this.target.setSize(Math.max(1, Math.floor(w * dpr)), Math.max(1, Math.floor(h * dpr)));
    (this.material.uniforms.uResolution!.value as Vector2).set(w * dpr, h * dpr);
  }

  /** MSAA samples of the HDR target (0 = off). Re-creates the target's buffers on the next render. */
  setSamples(n: number): void {
    if (this.target.samples === n) return;
    this.target.samples = n;
    this.target.dispose();
  }

  get samples(): number {
    return this.target.samples;
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: Camera, time: number): void {
    this.material.uniforms.uTime!.value = time;
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.quad, this.cam);
  }
}
