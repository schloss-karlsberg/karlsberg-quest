/**
 * Era ambience particles, all on the GPU in a box that wraps around the camera:
 *  - 1793-02: snow in the moonlight (+ frost mist)
 *  - 1789:    fireflies over the meadows and pollen motes in the evening sun
 *  - 1793-07: ash and stray embers on the hot wind
 *  - 1796:    grey ash (rising instead of falling while the Steinfraß runs)
 *  - today:   mist wisps in the hollows and dust motes under the canopy
 * Ground-hugging layers read the terrain height texture, so they sit on the real relief.
 * Under the palace's roofs (intact eras) nothing falls: particles and mist are masked by the
 * footprints of the buildings with rooms (`setRoofs` / `sheltered`), so no snow in the gallery.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedBufferAttribute,
  Mesh,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import type { Era } from '../../../core/era';
import { ATMOS_GLSL, atmosphere } from '../../../world/atmosphere';
import type { World } from '../../../world/world';
import { quadInstanced } from '../gl';
import { rng } from '../geom';

const GROUND_GLSL = /* glsl */ `
uniform highp sampler2D uHeight;
uniform vec4 uGrid;
uniform vec2 uGridSize;
float groundAt(vec2 xz) {
  vec2 cr = clamp((xz - uGrid.xy) / uGrid.z, vec2(0.0), uGridSize - 1.0);
  return texelFetch(uHeight, ivec2(cr + 0.5), 0).r;
}
`;

/** Up to this many roofed footprints (convex quads) mask the particles. */
export const MAX_ROOFS = 16;

const ROOF_GLSL = /* glsl */ `
uniform vec4 uRoofA[${MAX_ROOFS}];  // corners 0, 1 (x, z)
uniform vec4 uRoofB[${MAX_ROOFS}];  // corners 2, 3
uniform vec2 uRoofH[${MAX_ROOFS}];  // floor − 2 m, ridge
uniform int uRoofN;
float kqEdge(vec2 a, vec2 b, vec2 p) { vec2 e = b - a; vec2 d = p - a; return e.x * d.y - e.y * d.x; }
// 1 when p is under one of the roofs (inside the building's volume)
float kqUnderRoof(vec3 p) {
  for (int i = 0; i < ${MAX_ROOFS}; i++) {
    if (i >= uRoofN) break;
    if (p.y < uRoofH[i].x || p.y > uRoofH[i].y) continue;
    vec2 q = p.xz;
    float s0 = kqEdge(uRoofA[i].xy, uRoofA[i].zw, q);
    float s1 = kqEdge(uRoofA[i].zw, uRoofB[i].xy, q);
    float s2 = kqEdge(uRoofB[i].xy, uRoofB[i].zw, q);
    float s3 = kqEdge(uRoofB[i].zw, uRoofA[i].xy, q);
    if ((s0 >= 0.0 && s1 >= 0.0 && s2 >= 0.0 && s3 >= 0.0) || (s0 <= 0.0 && s1 <= 0.0 && s2 <= 0.0 && s3 <= 0.0)) return 1.0;
  }
  return 0.0;
}
`;

/** A roofed footprint for the mask: a convex quad and its vertical extent. */
export interface RoofQuad {
  corners: [[number, number], [number, number], [number, number], [number, number]];
  y0: number;
  y1: number;
}

/**
 * The quads for the buildings that have rooms (plus any extra ids): rings of 4 corners are used
 * as they are, others by their bounding rectangle.
 */
export function roofQuads(buildings: readonly { id: string; interior: string | null; base_h: number | null; ridge_h: number | null; ring: [number, number][] }[], extra: readonly string[] = []): RoofQuad[] {
  const out: RoofQuad[] = [];
  for (const b of buildings) {
    if ((!b.interior || b.interior === 'none') && !extra.includes(b.id)) continue;
    if (b.base_h === null || b.ridge_h === null) continue;
    let corners: RoofQuad['corners'];
    if (b.ring.length === 4) corners = b.ring.map((p) => [p[0], p[1]]) as RoofQuad['corners'];
    else {
      const xs = b.ring.map((p) => p[0]);
      const zs = b.ring.map((p) => p[1]);
      const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
      corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    }
    out.push({ corners, y0: b.base_h - 2, y1: b.ridge_h + 0.5 });
    if (out.length >= MAX_ROOFS) break;
  }
  return out;
}

/** CPU twin of the shader test (tests). */
export function underRoof(roofs: readonly RoofQuad[], x: number, y: number, z: number): boolean {
  for (const r of roofs) {
    if (y < r.y0 || y > r.y1) continue;
    const c = r.corners;
    let pos = 0;
    let neg = 0;
    for (let i = 0; i < 4; i++) {
      const [ax, az] = c[i]!;
      const [bx, bz] = c[(i + 1) % 4]!;
      const s = (bx - ax) * (z - az) - (bz - az) * (x - ax);
      if (s >= 0) pos++;
      if (s <= 0) neg++;
    }
    if (pos === 4 || neg === 4) return true;
  }
  return false;
}

const PARTICLE_VERT = /* glsl */ `
${ATMOS_GLSL}
${GROUND_GLSL}
${ROOF_GLSL}
uniform vec3 uBox;
uniform vec3 uVel;
uniform float uSway;
uniform float uSize;
uniform float uScale;
uniform float uGround;   // > 0: height above the terrain (0..uBox.y), else free in the box
uniform float uBlink;
uniform float uAlpha;
uniform float uUp;       // -1..1: 1 = rise instead of fall (Steinfraß)
attribute vec4 aSeed;
varying float vAlpha;
varying float vSeed;
void main() {
  vec3 vel = uVel;
  vel.y = mix(uVel.y, -uVel.y * 0.8, uUp);
  vec3 p = aSeed.xyz * uBox + vel * uTime;
  p += vec3(sin(uTime * 0.7 + aSeed.w * 31.0), 0.4 * sin(uTime * 0.9 + aSeed.w * 17.0), cos(uTime * 0.6 + aSeed.w * 23.0)) * uSway;
  // wrap into a box centred on the camera
  vec3 c = uCamPos;
  p = mod(p - c + uBox * 0.5, uBox) - uBox * 0.5 + c;
  float fy = 1.0;
  if (uGround > 0.0) {
    float y01 = fract(aSeed.y + vel.y * uTime / max(uBox.y, 1.0));
    p.y = groundAt(p.xz) + 0.25 + pow(y01, 1.6) * uGround + sin(uTime * 0.8 + aSeed.w * 9.0) * 0.3;
  } else {
    fy = 1.0 - smoothstep(0.35, 0.5, abs(p.y - c.y) / uBox.y);
  }
  vec3 d = p - c;
  float edge = 1.0 - smoothstep(0.32, 0.5, length(d.xz) / uBox.x);
  float blink = uBlink > 0.0 ? pow(max(0.0, sin(uTime * (1.1 + aSeed.w * 1.7) + aSeed.w * 60.0)), 6.0) : 1.0;
  vAlpha = uAlpha * edge * fy * blink * (1.0 - kqUnderRoof(p));
  vSeed = aSeed.w;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  // a mote smaller than a pixel fades out instead of being drawn as a hard 1 px dot: far dust and
  // pollen read as stars in a daytime sky, far snow as white noise (playtest)
  float ps = uSize * (0.6 + 0.8 * aSeed.w) * uScale / max(-mv.z, 0.3);
  vAlpha *= smoothstep(0.5, 1.8, ps);
  gl_PointSize = vAlpha < 0.004 ? 0.0 : clamp(ps, 1.0, 9.0);
  gl_Position = projectionMatrix * mv;
}
`;

const PARTICLE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uSoft;
varying float vAlpha;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  if (r > 0.5) discard;
  float k = mix(1.0, 1.0 - smoothstep(0.0, 0.5, r), uSoft);
  gl_FragColor = vec4(uColor * (0.85 + 0.3 * vSeed), vAlpha * k);
}
`;

const MIST_VERT = /* glsl */ `
${ATMOS_GLSL}
${GROUND_GLSL}
uniform vec3 uBox;
attribute vec4 aSeed;
varying vec3 vPos;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main() {
  vec3 p = vec3(aSeed.x * uBox.x, 0.0, aSeed.z * uBox.z) + vec3(0.6, 0.0, 0.25) * uTime;
  vec3 c = uCamPos;
  p.xz = mod(p.xz - c.xz + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5 + c.xz;
  float g = groundAt(p.xz);
  vec2 size = vec2(26.0 + 30.0 * aSeed.w, 5.0 + 5.0 * aSeed.y);
  p.y = g + 0.4 + aSeed.y * 2.0;
  vec3 toCam = cameraPosition - p;
  vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-4, 0.0, 0.0));
  vec3 q = p + right * (position.x - 0.5) * size.x + vec3(0.0, position.y * size.y, 0.0);
  float d = length(p.xz - c.xz);
  // hollows hold the mist: the lower the ground relative to the camera, the denser
  float low = smoothstep(4.0, -6.0, g - (c.y - 1.7));
  vAlpha = smoothstep(12.0, 30.0, d) * (1.0 - smoothstep(uBox.x * 0.3, uBox.x * 0.5, d)) * (0.45 + 0.55 * low);
  vUv = position.xy;
  vSeed = aSeed.w;
  vPos = q;
  gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
}
`;

const MIST_FRAG = /* glsl */ `
${ATMOS_GLSL}
${ROOF_GLSL}
uniform float uAlpha;
uniform vec3 uTint;
varying vec3 vPos;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main() {
  float n = kqFbm(vUv * vec2(2.2, 1.2) + vec2(uTime * 0.02 + vSeed * 9.0, vSeed * 5.0));
  float shape = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.3, 1.0, vUv.y)) * (1.0 - smoothstep(0.3, 0.5, abs(vUv.x - 0.5)));
  float a = shape * smoothstep(0.35, 0.75, n) * vAlpha * uAlpha;
  if (a < 0.003 || kqUnderRoof(vPos) > 0.5) discard;
  vec3 col = mix(uFogColor, uFogSunColor, 0.35) * uTint;
  gl_FragColor = vec4(col, a);
}
`;

interface LayerCfg {
  count: number;
  box: [number, number, number];
  vel: [number, number, number];
  sway: number;
  size: number;
  color: [number, number, number];
  alpha: number;
  additive: boolean;
  soft: number;
  ground?: number;
  blink?: boolean;
  /** Only draw this layer near the palace fire (1793-07). */
  nearFire?: boolean;
}

/** Era → particle layers (counts are for high quality; low uses 40 %). */
export const AMBIENT: Record<Era, { layers: LayerCfg[]; mist: number; mistTint: [number, number, number] }> = {
  '1793-02': {
    layers: [
      { count: 9000, box: [70, 34, 70], vel: [0.35, -1.1, 0.12], sway: 0.7, size: 0.055, color: [0.92, 0.96, 1.05], alpha: 0.85, additive: false, soft: 0.6 },
      { count: 2500, box: [24, 14, 24], vel: [0.3, -0.9, 0.1], sway: 0.4, size: 0.04, color: [1, 1, 1.05], alpha: 0.9, additive: false, soft: 0.4 },
    ],
    mist: 34,
    mistTint: [0.9, 0.95, 1.1],
  },
  '1789': {
    layers: [
      { count: 700, box: [70, 3, 70], vel: [0.1, 0.05, 0.05], sway: 0.9, size: 0.09, color: [2.6, 3.0, 0.9], alpha: 1, additive: true, soft: 1, ground: 2.6, blink: true },
      { count: 2600, box: [40, 16, 40], vel: [0.25, -0.05, 0.1], sway: 0.6, size: 0.022, color: [1.4, 1.2, 0.8], alpha: 0.55, additive: true, soft: 1 },
    ],
    mist: 0,
    mistTint: [1, 1, 1],
  },
  '1793-07': {
    layers: [
      { count: 2600, box: [80, 40, 80], vel: [0.9, -0.25, -0.3], sway: 1.2, size: 0.045, color: [0.16, 0.14, 0.13], alpha: 0.85, additive: false, soft: 0.3 },
      { count: 500, box: [80, 40, 80], vel: [1.4, 0.9, -0.4], sway: 1.5, size: 0.06, color: [3.0, 1.0, 0.25], alpha: 0.9, additive: true, soft: 1, nearFire: true },
    ],
    mist: 0,
    mistTint: [1, 1, 1],
  },
  '1796': {
    layers: [{ count: 4200, box: [70, 30, 70], vel: [0.25, -0.45, 0.08], sway: 0.9, size: 0.05, color: [0.26, 0.25, 0.24], alpha: 0.7, additive: false, soft: 0.35 }],
    mist: 16,
    mistTint: [1, 1, 1],
  },
  today: {
    layers: [{ count: 1600, box: [36, 14, 36], vel: [0.08, -0.03, 0.05], sway: 0.5, size: 0.018, color: [1.3, 1.2, 1.0], alpha: 0.45, additive: true, soft: 1 }],
    mist: 44,
    mistTint: [1, 1, 1],
  },
};

export class AmbientParticles {
  readonly object = new Group();
  private era: Era | null = null;
  private high = true;
  private readonly mats: ShaderMaterial[] = [];
  private fireLayers: Points[] = [];
  /** Steinfraß: −1 … 1 makes the ash rise. */
  up = 0;
  /** Shared roof-mask uniforms (all layers). */
  private readonly roof = {
    uRoofA: { value: Array.from({ length: MAX_ROOFS }, () => new Vector4()) },
    uRoofB: { value: Array.from({ length: MAX_ROOFS }, () => new Vector4()) },
    uRoofH: { value: Array.from({ length: MAX_ROOFS }, () => new Vector2()) },
    uRoofN: { value: 0 },
  };
  private roofCount = 0;

  constructor(private readonly world: World) {
    this.object.name = 'fx-ambient';
  }

  /** The roofed footprints that keep the weather out (see `roofQuads`). */
  setRoofs(roofs: readonly RoofQuad[]): void {
    this.roofCount = Math.min(MAX_ROOFS, roofs.length);
    for (let i = 0; i < this.roofCount; i++) {
      const r = roofs[i]!;
      const c = r.corners;
      this.roof.uRoofA.value[i]!.set(c[0][0], c[0][1], c[1][0], c[1][1]);
      this.roof.uRoofB.value[i]!.set(c[2][0], c[2][1], c[3][0], c[3][1]);
      this.roof.uRoofH.value[i]!.set(r.y0, r.y1);
    }
  }

  /** Roofs mask only while they stand (intact palace eras). */
  set sheltered(v: boolean) {
    this.roof.uRoofN.value = v ? this.roofCount : 0;
  }

  get sheltered(): boolean {
    return this.roof.uRoofN.value > 0;
  }

  private groundUniforms() {
    const u = this.world.terrain.uniforms;
    return { uHeight: u.uHeight!, uGrid: u.uGrid!, uGridSize: u.uGridSize! };
  }

  setEra(era: Era, high: boolean): void {
    if (era === this.era && high === this.high) return;
    this.era = era;
    this.high = high;
    this.clear();
    const cfg = AMBIENT[era];
    const r = rng(era.length * 977 + 3);
    for (const L of cfg.layers) {
      const n = Math.floor(L.count * (high ? 1 : 0.4));
      const seed = new Float32Array(n * 4);
      for (let i = 0; i < n * 4; i++) seed[i] = r();
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aSeed', new BufferAttribute(seed, 4));
      const m = new ShaderMaterial({
        vertexShader: PARTICLE_VERT,
        fragmentShader: PARTICLE_FRAG,
        uniforms: {
          ...atmosphere,
          ...this.groundUniforms(),
          ...this.roof,
          uBox: { value: new Vector3(...L.box) },
          uVel: { value: new Vector3(...L.vel) },
          uSway: { value: L.sway },
          uSize: { value: L.size },
          uScale: { value: 500 },
          uGround: { value: L.ground ?? 0 },
          uBlink: { value: L.blink ? 1 : 0 },
          uAlpha: { value: L.alpha },
          uUp: { value: 0 },
          uColor: { value: new Vector3(...L.color) },
          uSoft: { value: L.soft },
        },
        transparent: true,
        depthWrite: false,
        blending: L.additive ? AdditiveBlending : NormalBlending,
      });
      m.userData.baseAlpha = L.alpha;
      this.mats.push(m);
      const p = new Points(g, m);
      p.frustumCulled = false;
      p.renderOrder = 50;
      if (L.nearFire) this.fireLayers.push(p);
      this.object.add(p);
    }
    const mistN = Math.floor(cfg.mist * (high ? 1 : 0.5));
    if (mistN > 0) {
      const g = quadInstanced();
      const seed = new Float32Array(mistN * 4);
      for (let i = 0; i < mistN * 4; i++) seed[i] = r();
      g.setAttribute('aSeed', new InstancedBufferAttribute(seed, 4));
      g.instanceCount = mistN;
      const m = new ShaderMaterial({
        vertexShader: MIST_VERT,
        fragmentShader: MIST_FRAG,
        uniforms: { ...atmosphere, ...this.groundUniforms(), ...this.roof, uBox: { value: new Vector3(240, 1, 240) }, uAlpha: { value: 0.32 }, uTint: { value: new Vector3(...cfg.mistTint) } },
        transparent: true,
        depthWrite: false,
      });
      m.userData.baseAlpha = 0.32;
      m.userData.mist = true;
      this.mats.push(m);
      const mesh = new Mesh(g, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = 49;
      this.object.add(mesh);
    }
  }

  /**
   * Per frame. `fire` = 0..1 how much the palace burns (1793-07 embers near it), `fade` = 0..1
   * global fade (era shift).
   */
  frame(scale: number, fade: number, fire: number): void {
    const camNearFire = fire;
    for (const m of this.mats) {
      const u = m.uniforms;
      if (u.uScale) u.uScale.value = scale;
      if (u.uUp) u.uUp.value = this.up;
      const base = m.userData.baseAlpha as number;
      if (u.uAlpha) u.uAlpha.value = base * fade;
    }
    for (const p of this.fireLayers) {
      const u = (p.material as ShaderMaterial).uniforms;
      u.uAlpha!.value = (u.uAlpha!.value as number) * camNearFire;
      p.visible = camNearFire > 0.01;
    }
  }

  private clear(): void {
    for (const c of [...this.object.children]) {
      this.object.remove(c);
      (c as Mesh).geometry.dispose();
    }
    for (const m of this.mats) m.dispose();
    this.mats.length = 0;
    this.fireLayers = [];
  }

  dispose(): void {
    this.clear();
  }
}
