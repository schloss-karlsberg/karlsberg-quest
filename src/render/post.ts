import {
  AdditiveBlending,
  BufferGeometry,
  Camera,
  Color,
  DepthTexture,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  NoBlending,
  OrthographicCamera,
  type PerspectiveCamera,
  type Scene,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  Vector4,
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

/** Bloom prefilter: soft-knee threshold on the exposed HDR colour, 13-tap downsample (half res). */
const BLOOM_PRE = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uExposure;
uniform float uThreshold;
varying vec2 vUv;
vec3 tap(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main() {
  vec3 c = tap(vec2(0.0)) * 0.5 + (tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0))) * 0.125;
  c *= uExposure;
  // never let a single fire-fly pixel explode: clamp, then a soft knee above the threshold
  c = min(c, vec3(40.0));
  float br = max(c.r, max(c.g, c.b));
  float knee = uThreshold * 0.5;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}
`;

/** 13-tap "dual box" downsample (Jimenez 2014) — no flicker on moving bright pixels. */
const BLOOM_DOWN = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main() {
  vec3 a = s(vec2(-2.0, -2.0)), b = s(vec2(0.0, -2.0)), c = s(vec2(2.0, -2.0));
  vec3 d = s(vec2(-2.0, 0.0)), e = s(vec2(0.0, 0.0)), f = s(vec2(2.0, 0.0));
  vec3 g = s(vec2(-2.0, 2.0)), h = s(vec2(0.0, 2.0)), i = s(vec2(2.0, 2.0));
  vec3 j = s(vec2(-1.0, -1.0)), k = s(vec2(1.0, -1.0)), l = s(vec2(-1.0, 1.0)), m = s(vec2(1.0, 1.0));
  vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** 9-tap tent upsample, added onto the next larger mip (additive blending). */
const BLOOM_UP = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uScatter;
varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main() {
  vec3 col = s(vec2(0.0)) * 4.0;
  col += (s(vec2(-1.0, 0.0)) + s(vec2(1.0, 0.0)) + s(vec2(0.0, -1.0)) + s(vec2(0.0, 1.0))) * 2.0;
  col += s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0));
  gl_FragColor = vec4(col * (uScatter / 16.0), 1.0);
}
`;

/**
 * Depth-only screen-space AO (SAO-like, half resolution). Normals come from the depth buffer,
 * 10 spiral taps rotated per pixel; the composite pass blurs it depth-aware. Fades out with
 * distance (the terrain shader already darkens hollows from the LiDAR relief).
 */
const AO_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDepth;
uniform vec2 uTexel;      // of the depth texture (full res)
uniform vec4 uProj;       // x = near, y = far, z = 1/P[0][0], w = 1/P[1][1]
uniform float uRadius;    // world radius (m)
uniform float uProjScale; // pixels per metre at 1 m distance (full res)
uniform float uIntensity;
varying vec2 vUv;
float viewZ(float d) {
  float n = uProj.x, f = uProj.y;
  return (n * f) / (f - d * (f - n));
}
vec3 viewPos(vec2 uv) {
  float z = viewZ(texture2D(tDepth, uv).r);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uProj.z * z, ndc.y * uProj.w * z, -z);
}
void main() {
  float d = texture2D(tDepth, vUv).r;
  if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 p = viewPos(vUv);
  float dist = -p.z;
  if (dist > 90.0) { gl_FragColor = vec4(1.0); return; }
  // normal from the smaller depth step on each axis (no halos on silhouettes)
  vec3 px1 = viewPos(vUv + vec2(uTexel.x * 2.0, 0.0)) - p, px0 = p - viewPos(vUv - vec2(uTexel.x * 2.0, 0.0));
  vec3 py1 = viewPos(vUv + vec2(0.0, uTexel.y * 2.0)) - p, py0 = p - viewPos(vUv - vec2(0.0, uTexel.y * 2.0));
  vec3 dx = abs(px1.z) < abs(px0.z) ? px1 : px0;
  vec3 dy = abs(py1.z) < abs(py0.z) ? py1 : py0;
  vec3 n = normalize(cross(dx, dy));
  float rPx = uRadius * uProjScale / dist;
  if (rPx < 1.5) { gl_FragColor = vec4(1.0); return; }
  rPx = min(rPx, 90.0);
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float ang = ign * 6.2831853;
  float occ = 0.0;
  const int N = 10;
  for (int i = 0; i < N; i++) {
    float t = (float(i) + 0.5) / float(N);
    float a = ang + t * 15.708; // 2.5 turns
    vec2 o = vec2(cos(a), sin(a)) * t * rPx * uTexel;
    vec3 q = viewPos(vUv + o) - p;
    float vv = dot(q, q);
    float vn = dot(q, n);
    occ += max(0.0, vn / sqrt(vv + 1e-4) - 0.2) * max(0.0, 1.0 - vv / (uRadius * uRadius * 1.0));
  }
  float ao = 1.0 - uIntensity * occ / float(N) * 1.6;
  ao = mix(ao, 1.0, smoothstep(50.0, 90.0, dist));
  gl_FragColor = vec4(clamp(ao, 0.0, 1.0), dist / 100.0, 0.0, 1.0);
}
`;

const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tAO;
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
uniform float uFlashScale; // flash and motion settings attenuate or suppress full-screen flashes
uniform float uBloom;      // bloom strength (0 = off)
uniform float uAO;         // 0 = no AO texture
uniform vec2 uAOTexel;
uniform vec3 uWhite;       // white balance multiplier (linear, before tone mapping)
uniform vec3 uShadowTint;  // split toning (display space, added in the shadows)
uniform vec3 uHighTint;    // … and in the highlights
uniform float uGradeX;     // 0 = plain grade (low tier)
uniform float uDebug;      // 1 = show the AO buffer, 2 = bloom only (art review: kq.ctx.post.debug)
varying vec2 vUv;

// ACES filmic (Stephen Hill's fit, as three.js' ACESFilmicToneMapping): keeps hues (fire stays
// orange instead of going yellow, foliage stays green) and rolls highlights off softly
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 color) {
  const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color = ACESInputMat * (color / 0.6);
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// depth-aware 5-tap blur of the half-res AO
float aoAt(vec2 uv) {
  vec2 c = texture2D(tAO, uv).rg;
  float sum = c.r * 2.0;
  float w = 2.0;
  vec2 o[4];
  o[0] = vec2(1.0, 1.0); o[1] = vec2(-1.0, 1.0); o[2] = vec2(1.0, -1.0); o[3] = vec2(-1.0, -1.0);
  for (int i = 0; i < 4; i++) {
    vec2 s = texture2D(tAO, uv + o[i] * uAOTexel).rg;
    float k = 1.0 - smoothstep(0.0, 0.02 * c.g + 0.002, abs(s.g - c.g));
    sum += s.r * k;
    w += k;
  }
  return sum / w;
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
  if (uAO > 0.0) col *= mix(1.0, aoAt(uv), uAO);
  if (uDebug > 0.5) {
    gl_FragColor = vec4(uDebug < 1.5 ? vec3(uAO > 0.0 ? aoAt(uv) : 1.0) : texture2D(tBloom, uv).rgb, 1.0);
    return;
  }
  col *= uExposure;
  if (uBloom > 0.0) col += texture2D(tBloom, uv).rgb * uBloom;
  if (uGradeX > 0.0) col *= uWhite;
  col = aces(col);
  // grade in display space
  col = toSRGB(col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  if (uGradeX > 0.0) {
    // split toning: cool/warm shadows and highlights per era (painterly colour, never grey)
    col += uShadowTint * (1.0 - smoothstep(0.0, 0.55, l)) + uHighTint * smoothstep(0.45, 1.0, l);
    l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  }
  col = mix(vec3(l), col, uSaturation * (1.0 - uDesaturate));
  col = (col - 0.5) * uContrast + 0.5;
  col = uLift + col * (uGain - uLift);
  // vignette
  vec2 q = vUv - 0.5;
  q.x *= uResolution.x / uResolution.y;
  float v = smoothstep(0.95, 0.25, length(q));
  col *= mix(1.0, v, uVignette);
  col += uFlash * uFlashScale;
  // film grain (luma-weighted: strongest in the mid tones, none in black)
  float g = hash(vUv * uResolution + fract(uTime * 7.13) * 100.0) - 0.5;
  col += g * uGrain * (0.4 + 0.6 * smoothstep(0.0, 0.35, l));
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export interface PostFeatures {
  bloom: boolean;
  ao: boolean;
  grade: boolean;
}

const BLOOM_LEVELS = 5;

function pass(frag: string, uniforms: Record<string, { value: unknown }>, additive = false): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: frag,
    uniforms,
    depthTest: false,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NoBlending,
    transparent: additive,
  });
}

/**
 * Scene → HDR render target (MSAA, with a depth texture) → [AO at half res] → [bloom mip chain] →
 * one full-screen pass doing tone mapping (ACES), white balance, split toning, colour grade,
 * vignette and grain. Feature systems tweak `post.uniforms` (uShift, uFlash, uDesaturate, uHeat …);
 * the era look sets the grade (World.applyLook), the quality tier switches bloom / AO / grade
 * extras (`setFeatures`).
 */
export class PostFX {
  readonly target: WebGLRenderTarget;
  readonly material: ShaderMaterial;
  private readonly quad: Mesh;
  private readonly cam: Camera = new OrthographicCamera();
  enabled = true;
  /** Art review: 0 normal, 1 AO buffer, 2 bloom buffer. */
  debug = 0;
  readonly features: PostFeatures = { bloom: true, ao: false, grade: true };
  /** Era bloom settings (World.applyLook): strength and threshold (exposed linear HDR). */
  bloomStrength = 0.6;
  bloomThreshold = 1.1;
  /** Era AO strength 0..1. */
  aoStrength = 0.8;
  private readonly bloomMips: WebGLRenderTarget[] = [];
  private readonly bloomPre: ShaderMaterial;
  private readonly bloomDown: ShaderMaterial;
  private readonly bloomUp: ShaderMaterial;
  private readonly aoTarget: WebGLRenderTarget;
  private readonly aoMat: ShaderMaterial;
  private w = 1;
  private h = 1;

  constructor(samples = 4) {
    this.target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples, depthBuffer: true });
    const dt = new DepthTexture(1, 1, UnsignedIntType);
    dt.minFilter = NearestFilter;
    dt.magFilter = NearestFilter;
    this.target.depthTexture = dt;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      const t = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
      this.bloomMips.push(t);
    }
    this.aoTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
    this.bloomPre = pass(BLOOM_PRE, { tSrc: { value: null }, uTexel: { value: new Vector2() }, uExposure: { value: 1 }, uThreshold: { value: 1 } });
    this.bloomDown = pass(BLOOM_DOWN, { tSrc: { value: null }, uTexel: { value: new Vector2() } });
    this.bloomUp = pass(BLOOM_UP, { tSrc: { value: null }, uTexel: { value: new Vector2() }, uScatter: { value: 0.75 } }, true);
    this.aoMat = pass(AO_FRAG, {
      tDepth: { value: dt },
      uTexel: { value: new Vector2() },
      uProj: { value: new Vector4() },
      uRadius: { value: 1.4 },
      uProjScale: { value: 500 },
      uIntensity: { value: 0.8 },
    });
    this.material = new ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: this.target.texture },
        tBloom: { value: this.bloomMips[0]!.texture },
        tAO: { value: this.aoTarget.texture },
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
        uBloom: { value: 0 },
        uAO: { value: 0 },
        uAOTexel: { value: new Vector2() },
        uWhite: { value: new Color(1, 1, 1) },
        uShadowTint: { value: new Color(0, 0, 0) },
        uHighTint: { value: new Color(0, 0, 0) },
        uGradeX: { value: 1 },
        uDebug: { value: 0 },
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
    const W = Math.max(1, Math.floor(w * dpr));
    const H = Math.max(1, Math.floor(h * dpr));
    this.w = W;
    this.h = H;
    this.target.setSize(W, H);
    (this.material.uniforms.uResolution!.value as Vector2).set(W, H);
    let bw = W;
    let bh = H;
    for (const t of this.bloomMips) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      t.setSize(bw, bh);
    }
    const aw = Math.max(1, W >> 1);
    const ah = Math.max(1, H >> 1);
    this.aoTarget.setSize(aw, ah);
    (this.material.uniforms.uAOTexel!.value as Vector2).set(1 / aw, 1 / ah);
    (this.aoMat.uniforms.uTexel!.value as Vector2).set(1 / W, 1 / H);
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

  /** Quality tier switches (QualityManager.apply). */
  setFeatures(f: Partial<PostFeatures>): void {
    Object.assign(this.features, f);
    this.material.uniforms.uGradeX!.value = this.features.grade ? 1 : 0;
  }

  private blit(renderer: WebGLRenderer, mat: ShaderMaterial, target: WebGLRenderTarget | null): void {
    this.quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(this.quad, this.cam);
  }

  private renderBloom(renderer: WebGLRenderer): void {
    const mips = this.bloomMips;
    const pre = this.bloomPre.uniforms;
    pre.tSrc!.value = this.target.texture;
    (pre.uTexel!.value as Vector2).set(1 / this.w, 1 / this.h);
    pre.uExposure!.value = this.material.uniforms.uExposure!.value;
    pre.uThreshold!.value = this.bloomThreshold;
    this.blit(renderer, this.bloomPre, mips[0]!);
    const down = this.bloomDown.uniforms;
    for (let i = 1; i < mips.length; i++) {
      down.tSrc!.value = mips[i - 1]!.texture;
      (down.uTexel!.value as Vector2).set(1 / mips[i - 1]!.width, 1 / mips[i - 1]!.height);
      this.blit(renderer, this.bloomDown, mips[i]!);
    }
    const up = this.bloomUp.uniforms;
    for (let i = mips.length - 1; i > 0; i--) {
      up.tSrc!.value = mips[i]!.texture;
      (up.uTexel!.value as Vector2).set(1 / mips[i]!.width, 1 / mips[i]!.height);
      this.blit(renderer, this.bloomUp, mips[i - 1]!);
    }
  }

  private renderAO(renderer: WebGLRenderer, camera: Camera): void {
    const cam = camera as PerspectiveCamera;
    const P = cam.projectionMatrix.elements;
    const u = this.aoMat.uniforms;
    (u.uProj!.value as Vector4).set(cam.near ?? 0.2, cam.far ?? 7000, 1 / P[0]!, 1 / P[5]!);
    u.uProjScale!.value = (this.h * P[5]!) / 2;
    u.uIntensity!.value = this.aoStrength;
    this.blit(renderer, this.aoMat, this.aoTarget);
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: Camera, time: number): void {
    const mu = this.material.uniforms;
    mu.uTime!.value = time;
    mu.uDebug!.value = this.debug;
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    const ao = this.features.ao && this.aoStrength > 0 && (camera as PerspectiveCamera).isPerspectiveCamera === true;
    if (ao) this.renderAO(renderer, camera);
    mu.uAO!.value = ao ? 1 : 0;
    const bloom = this.features.bloom && this.bloomStrength > 0;
    if (bloom) this.renderBloom(renderer);
    mu.uBloom!.value = bloom ? this.bloomStrength : 0;
    this.blit(renderer, this.material, null);
  }
}
