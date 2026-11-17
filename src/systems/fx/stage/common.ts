/**
 * Shared pieces of the staged set pieces (fx/stage): a lit, fogged material for solid ghost
 * props (stones, carts, a theodolite) that can glow at the rim and fade, a glowing point cloud
 * (dust, eyes, sparks) and small helpers. Everything procedural; no textures.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { GameContext } from '../../../core/context';
import { ATMOS_GLSL, atmosphere } from '../../../world/atmosphere';

/** A running set piece. `frame` gets real seconds; `done` → the director disposes it. */
export interface Piece {
  readonly id: string;
  done: boolean;
  /** A memory line came up (echo:line). */
  line?(lineId: string, dur: number): void;
  /** The memory / cue ended: fade out (set `done` when gone). */
  end?(): void;
  frame(dt: number): void;
  /** Runs after the player's camera was applied: a piece may frame the view. */
  camera?(): void;
  dispose(): void;
}

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const smooth = (v: number) => {
  const c = clamp01(v);
  return c * c * (3 - 2 * c);
};
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Deterministic random numbers for a seed. */
export function rng(seed: number): () => number {
  let s = (seed * 48271 + 11) % 2147483647 || 1;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

const SOLID_VERT = /* glsl */ `
attribute vec3 color;
varying vec3 vWp;
varying vec3 vN;
varying vec3 vCol;
void main() {
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = m * instanceMatrix;
#endif
  vec4 wp = m * vec4(position, 1.0);
  vWp = wp.xyz;
  vN = normalize(mat3(m) * normal);
  vCol = color;
#ifdef USE_INSTANCING_COLOR
  vCol *= instanceColor;
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SOLID_FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
uniform float uAlpha;
uniform float uGhost;      // 0 solid … 1 a memory: cool rim glow, slightly see-through
uniform vec3 uRim;
uniform float uLift;       // a floor for the light (night scenes stay readable)
varying vec3 vWp;
varying vec3 vN;
varying vec3 vCol;
void main() {
  vec3 n = normalize(vN);
  vec3 col = kqLight(vCol, n, vWp, 1.0, 1.0);
  col = max(col, vCol * uLift);
  vec3 v = normalize(uCamPos - vWp);
  float rim = pow(1.0 - abs(dot(n, v)), 2.5);
  // fine grain on the stone so blocks read as dressed sandstone
  float g = kqNoise(vWp.xz * 9.0 + vWp.y * 7.0) * 0.18 - 0.09;
  col *= 1.0 + g;
  col = mix(col, col * 0.6 + uRim * rim * 1.6, uGhost * 0.55);
  col += uRim * rim * uGhost * 0.9;
  col = kqFog(col, vWp);
  gl_FragColor = vec4(col, uAlpha * mix(1.0, 0.82 + 0.18 * rim, uGhost));
}
`;

/** Lit + fogged material for solid props; per-vertex / per-instance colour. */
export function solidMaterial(ghost = 0, rim = new Color(0.55, 0.75, 1.0)): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: SOLID_VERT,
    fragmentShader: SOLID_FRAG,
    uniforms: { ...atmosphere, uAlpha: { value: 1 }, uGhost: { value: ghost }, uRim: { value: rim }, uLift: { value: 0.18 } },
    transparent: true,
    depthWrite: true,
  });
}

/** Give every vertex of a geometry one colour (the solid material reads `color`). */
export function paint<T extends BufferGeometry>(g: T, c: Color | number): T {
  const col = c instanceof Color ? c : new Color(c);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g.setAttribute('color', new BufferAttribute(a, 3));
  return g;
}

const GLOW_VERT = /* glsl */ `
attribute vec4 aCol;
attribute float aSize;
uniform float uScale;
varying vec4 vCol;
void main() {
  vCol = aCol;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aCol.a < 0.002 ? 0.0 : clamp(uScale * aSize / max(-mv.z, 0.3), 1.0, 64.0);
  gl_Position = projectionMatrix * mv;
}
`;
const GLOW_FRAG = /* glsl */ `
uniform float uSoft;
varying vec4 vCol;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float core = smoothstep(1.0, 0.0, r);
  float a = mix(core * core, smoothstep(1.0, 0.55, r), uSoft) * vCol.a;
  gl_FragColor = vec4(vCol.rgb * a, a);
}
`;

/** A cloud of glowing points; write `pos` / `col` (rgb HDR, a) / `size` (m), then `commit()`. */
export class GlowPoints {
  readonly points: Points;
  readonly pos: Float32Array;
  readonly col: Float32Array;
  readonly size: Float32Array;
  private readonly mat: ShaderMaterial;

  constructor(
    readonly count: number,
    o: { additive?: boolean; soft?: number; renderOrder?: number } = {},
  ) {
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 4);
    this.size = new Float32Array(count).fill(0.1);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aCol', new BufferAttribute(this.col, 4));
    g.setAttribute('aSize', new BufferAttribute(this.size, 1));
    this.mat = new ShaderMaterial({
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      uniforms: { uScale: { value: 600 }, uSoft: { value: o.soft ?? 0 } },
      transparent: true,
      depthWrite: false,
      blending: o.additive === false ? NormalBlending : AdditiveBlending,
    });
    this.points = new Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = o.renderOrder ?? 60;
  }

  commit(scale: number): void {
    const g = this.points.geometry;
    g.attributes.position!.needsUpdate = true;
    g.attributes.aCol!.needsUpdate = true;
    g.attributes.aSize!.needsUpdate = true;
    this.mat.uniforms.uScale!.value = scale;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

/** Pixels per metre at 1 m (point sizes). */
export function pxScale(ctx: GameContext): number {
  const h = ctx.renderer.domElement.height || window.innerHeight;
  return h / (2 * Math.tan((ctx.camera.fov * Math.PI) / 360));
}

/** Forward (xz) of a yaw in the player convention (0 = north / −z). */
export function forward(yaw: number): Vector3 {
  return new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
}

/** Player-convention yaw that looks from (ax, az) towards (bx, bz). */
export function yawTo(ax: number, az: number, bx: number, bz: number): number {
  return Math.atan2(-(bx - ax), -(bz - az));
}

/** The post grade a set piece borrows (restored when it lets go). */
export class GradeLoan {
  private readonly lift0: Color;
  private readonly gain0: Color;
  private readonly desat0: number;
  private released = false;

  constructor(private readonly ctx: GameContext) {
    const u = ctx.post.uniforms;
    this.lift0 = (u.uLift!.value as Color).clone();
    this.gain0 = (u.uGain!.value as Color).clone();
    this.desat0 = u.uDesaturate!.value as number;
  }

  /** Blend towards lift / gain by k (0 = untouched). */
  set(k: number, lift: Color, gain: Color, desat = -1): void {
    if (this.released) return;
    const u = this.ctx.post.uniforms;
    (u.uLift!.value as Color).copy(this.lift0).lerp(lift, k);
    (u.uGain!.value as Color).copy(this.gain0).lerp(gain, k);
    if (desat >= 0) u.uDesaturate!.value = lerp(this.desat0, desat, k);
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    // the world's look owns lift / gain (an era shift may have changed it meanwhile)
    this.ctx.world.applyLook();
  }
}
