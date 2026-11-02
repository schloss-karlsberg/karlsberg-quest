/**
 * Echo silhouettes: humanoid clouds of smoke particles (no meshes, no models). Each figure is a
 * point cloud sampled from a period silhouette (coat with tails, some with a tricorn), animated
 * in the vertex shader: limbs swing about their pivots, the head nods while speaking, smoke
 * peels off and rises, and the whole figure dissolves into drifting motes when the memory ends.
 * Two passes share one geometry: a dark smoke body (readable in daylight) and a pale glow.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, NormalBlending, Points, ShaderMaterial } from 'three';
import { atmosphere } from '../../../world/atmosphere';
import { chronikUniforms, lin } from './gfx';

// parts: 0 head, 1 torso, 2 arm L, 3 arm R, 4 leg L, 5 leg R, 6 coat skirt, 7 hat
interface Capsule {
  part: number;
  a: [number, number, number];
  b: [number, number, number];
  r: number;
  pivot: [number, number, number];
  w: number;
  /** x/z squash of the cross-section (torso is flatter front to back). */
  sx?: number;
  sz?: number;
}

function figureParts(hat: boolean, dress: boolean): Capsule[] {
  const p: Capsule[] = [
    { part: 0, a: [0, 1.6, 0], b: [0, 1.66, 0.01], r: 0.105, pivot: [0, 1.5, 0], w: 0.9 },
    { part: 0, a: [0, 1.46, 0], b: [0, 1.53, 0], r: 0.055, pivot: [0, 1.5, 0], w: 0.25 },
    { part: 1, a: [0, 1.02, 0], b: [0, 1.4, 0], r: 0.19, pivot: [0, 0.98, 0], w: 3.2, sx: 1.05, sz: 0.62 },
    { part: 2, a: [-0.22, 1.42, 0], b: [-0.27, 1.12, 0.02], r: 0.052, pivot: [-0.22, 1.42, 0], w: 0.55 },
    { part: 2, a: [-0.27, 1.12, 0.02], b: [-0.28, 0.86, 0.06], r: 0.045, pivot: [-0.22, 1.42, 0], w: 0.45 },
    { part: 3, a: [0.22, 1.42, 0], b: [0.27, 1.12, 0.02], r: 0.052, pivot: [0.22, 1.42, 0], w: 0.55 },
    { part: 3, a: [0.27, 1.12, 0.02], b: [0.28, 0.86, 0.06], r: 0.045, pivot: [0.22, 1.42, 0], w: 0.45 },
    { part: 4, a: [-0.09, 0.95, 0], b: [-0.1, 0.5, 0], r: 0.075, pivot: [-0.09, 0.95, 0], w: 0.8 },
    { part: 4, a: [-0.1, 0.5, 0], b: [-0.1, 0.08, 0.02], r: 0.058, pivot: [-0.09, 0.95, 0], w: 0.6 },
    { part: 5, a: [0.09, 0.95, 0], b: [0.1, 0.5, 0], r: 0.075, pivot: [0.09, 0.95, 0], w: 0.8 },
    { part: 5, a: [0.1, 0.5, 0], b: [0.1, 0.08, 0.02], r: 0.058, pivot: [0.09, 0.95, 0], w: 0.6 },
  ];
  // coat tails / skirt: a flared cone around the hips
  if (dress) p.push({ part: 6, a: [0, 0.98, 0], b: [0, 0.2, -0.02], r: 0.3, pivot: [0, 1.0, 0], w: 3.4, sx: 1.0, sz: 0.85 });
  else p.push({ part: 6, a: [0, 1.0, -0.02], b: [0, 0.58, -0.06], r: 0.23, pivot: [0, 1.0, 0], w: 1.6, sx: 1.05, sz: 0.75 });
  if (hat) {
    p.push({ part: 7, a: [0, 1.72, 0], b: [0, 1.74, 0], r: 0.19, pivot: [0, 1.5, 0], w: 0.7, sx: 1, sz: 0.85 });
    p.push({ part: 7, a: [0, 1.73, 0], b: [0, 1.82, 0], r: 0.1, pivot: [0, 1.5, 0], w: 0.4 });
  }
  return p;
}

/** Sample a figure point cloud (deterministic for a seed). */
export function sampleFigure(n: number, seed: number, opts: { hat: boolean; dress: boolean }) {
  let s = seed * 48271 + 11;
  const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);
  const parts = figureParts(opts.hat, opts.dress);
  const total = parts.reduce((a, p) => a + p.w, 0);
  const pos = new Float32Array(n * 3);
  const pivot = new Float32Array(n * 3);
  const part = new Float32Array(n);
  const rand = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    let pick = rnd() * total;
    let c = parts[0]!;
    for (const p of parts) {
      pick -= p.w;
      if (pick <= 0) {
        c = p;
        break;
      }
    }
    const t = rnd();
    const ax = c.a[0] + (c.b[0] - c.a[0]) * t;
    const ay = c.a[1] + (c.b[1] - c.a[1]) * t;
    const az = c.a[2] + (c.b[2] - c.a[2]) * t;
    // biased towards the surface so the silhouette reads
    let r = c.r * (0.55 + 0.45 * Math.sqrt(rnd()));
    if (c.part === 6) r *= opts.dress ? 0.35 + 0.65 * t : 0.7 + 0.5 * t; // flare downwards
    const ang = rnd() * Math.PI * 2;
    const up = (rnd() * 2 - 1) * (c.part === 0 ? 1 : 0.25);
    pos[i * 3] = ax + Math.cos(ang) * r * (c.sx ?? 1);
    pos[i * 3 + 1] = ay + up * c.r * 0.6;
    pos[i * 3 + 2] = az + Math.sin(ang) * r * (c.sz ?? 1);
    pivot.set(c.pivot, i * 3);
    part[i] = c.part;
    for (let k = 0; k < 4; k++) rand[i * 4 + k] = rnd();
  }
  return { pos, pivot, part, rand };
}

const GHOST_VERT = /* glsl */ `
uniform float uTime;
uniform float uWalk;
uniform float uWalkAmt;
uniform float uTalk;
uniform float uGesture;
uniform float uFade;
uniform float uSize;
uniform float uPix;
uniform float uMotion;
uniform float uGlowPass;
attribute vec3 aPivot;
attribute float aPart;
attribute vec4 aRand;
varying float vA;
varying float vHot;

vec3 rotX(vec3 p, vec3 o, float a) {
  vec3 q = p - o;
  float c = cos(a), s = sin(a);
  return o + vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
}
vec3 rotZ(vec3 p, vec3 o, float a) {
  vec3 q = p - o;
  float c = cos(a), s = sin(a);
  return o + vec3(q.x * c - q.y * s, q.x * s + q.y * c, q.z);
}

void main() {
  float t = uTime * uMotion;
  vec3 p = position;
  float swing = sin(uWalk) * 0.42 * uWalkAmt;
  if (aPart > 1.5 && aPart < 2.5) p = rotX(p, aPivot, -swing * 0.7);
  if (aPart > 2.5 && aPart < 3.5) {
    // right arm: swings, or rises in a gesture while speaking
    float g = uGesture * (0.9 + 0.25 * sin(t * 2.1));
    p = rotX(p, aPivot, swing * 0.7 - g * 1.25);
    p = rotZ(p, aPivot, g * 0.35);
  }
  if (aPart > 3.5 && aPart < 4.5) p = rotX(p, aPivot, swing);
  if (aPart > 4.5 && aPart < 5.5) p = rotX(p, aPivot, -swing);
  if (aPart > 5.5 && aPart < 6.5) p = rotX(p, aPivot, abs(swing) * 0.15);
  if (aPart < 0.5 || aPart > 6.5) p = rotX(p, aPivot, sin(t * 6.5) * 0.07 * uTalk + 0.06);
  // breathing and smoky turbulence
  p.y += sin(t * 1.6) * 0.01 * step(0.5, aPart);
  vec3 j = vec3(sin(t * 1.3 + aRand.x * 40.0), sin(t * 1.1 + aRand.y * 40.0), cos(t * 1.7 + aRand.z * 40.0));
  p += j * (0.012 + 0.03 * uTalk * aRand.w);
  float alpha = 1.0;
  // some particles peel off and rise like smoke
  if (aRand.w > 0.82) {
    float life = fract(t * (0.18 + aRand.x * 0.2) + aRand.y);
    p.y += life * (0.7 + aRand.z);
    p.xz += (aRand.yz - 0.5) * life * 0.9;
    alpha = (1.0 - life) * 0.8;
  }
  // feet dissolve into the ground mist
  alpha *= smoothstep(0.02, 0.45, position.y);
  // materialise / dissolve: particles stream in from (and out to) a drifting cloud
  float f = clamp(uFade * 1.35 - aRand.x * 0.35, 0.0, 1.0);
  f = f * f * (3.0 - 2.0 * f);
  vec3 cloud = (aRand.xyz - 0.5) * vec3(2.4, 1.2, 2.4) + vec3(0.0, 1.2 + aRand.w * 1.5, 0.0);
  p = mix(cloud + j * 0.2, p, f);
  alpha *= f;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  float sz = uGlowPass > 1.5 ? 0.24 + 0.3 * aRand.z : uGlowPass > 0.5 ? 0.02 + 0.025 * aRand.z : 0.07 + 0.08 * aRand.z;
  // the halo pass uses only a few particles
  if (uGlowPass > 1.5 && aRand.y > 0.22) alpha = 0.0;
  gl_PointSize = clamp(sz * uSize * uPix / max(dist, 0.5), 1.0, 160.0);
  vA = alpha;
  vHot = uTalk;
}
`;

const GHOST_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uGlowPass;
varying float vA;
varying float vHot;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = dot(q, q);
  float soft = exp(-d * 3.5) * (1.0 - smoothstep(0.7, 1.0, d));
  float a = soft * vA * uAlpha;
  if (uGlowPass > 1.5) {
    a *= 0.07 + 0.1 * vHot;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor * a, a);
  } else if (uGlowPass > 0.5) {
    a *= 0.35 + 0.8 * vHot;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor * a, a);
  } else {
    a *= 0.15;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor, a);
  }
}
`;

function ghostMaterial(pass: 0 | 1 | 2, color: Color): ShaderMaterial {
  const glow = pass > 0;
  return new ShaderMaterial({
    vertexShader: GHOST_VERT,
    fragmentShader: GHOST_FRAG,
    uniforms: {
      uTime: atmosphere.uTime,
      uPix: chronikUniforms.uPix,
      uMotion: chronikUniforms.uMotion,
      uWalk: { value: 0 },
      uWalkAmt: { value: 0 },
      uTalk: { value: 0 },
      uGesture: { value: 0 },
      uFade: { value: 0 },
      uSize: { value: 1 },
      uAlpha: { value: 1 },
      uGlowPass: { value: pass },
      uColor: { value: color },
    },
    transparent: true,
    depthWrite: false,
    blending: glow ? AdditiveBlending : NormalBlending,
  });
}

/** One silhouette. Drive it with the public fields; call `apply()` once per frame. */
export class GhostFigure {
  readonly object = new Group();
  private readonly body: ShaderMaterial;
  private readonly glow: ShaderMaterial;
  private readonly halo: ShaderMaterial;
  walk = 0;
  walkAmt = 0;
  talk = 0;
  gesture = 0;
  fade = 0;
  alpha = 1;

  constructor(seed: number, opts: { hat: boolean; dress: boolean; night: boolean; count?: number }) {
    const n = opts.count ?? 4200;
    const d = sampleFigure(n, seed, opts);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(d.pos, 3));
    g.setAttribute('aPivot', new BufferAttribute(d.pivot, 3));
    g.setAttribute('aPart', new BufferAttribute(d.part, 1));
    g.setAttribute('aRand', new BufferAttribute(d.rand, 4));
    g.computeBoundingSphere();
    this.body = ghostMaterial(0, opts.night ? lin(0x1c2836, 1) : lin(0x27323f, 1));
    this.glow = ghostMaterial(1, opts.night ? lin(0xa9d4ff, 1.5) : lin(0xd8ecff, 1.1));
    this.halo = ghostMaterial(2, opts.night ? lin(0x7fb4ff, 1.2) : lin(0xcfe4ff, 1.0));
    const a = new Points(g, this.body);
    const b = new Points(g, this.glow);
    const c = new Points(g, this.halo);
    a.frustumCulled = b.frustumCulled = c.frustumCulled = false;
    a.renderOrder = 7;
    b.renderOrder = 8;
    c.renderOrder = 9;
    this.object.add(a, b, c);
    this.object.name = 'echo-figure';
  }

  apply(): void {
    for (const m of [this.body, this.glow, this.halo]) {
      const u = m.uniforms;
      u.uWalk!.value = this.walk;
      u.uWalkAmt!.value = this.walkAmt;
      u.uTalk!.value = this.talk;
      u.uGesture!.value = this.gesture;
      u.uFade!.value = this.fade;
      u.uAlpha!.value = this.alpha;
    }
  }

  dispose(): void {
    const pts = this.object.children as Points[];
    pts[0]?.geometry.dispose();
    this.body.dispose();
    this.glow.dispose();
    this.halo.dispose();
    this.object.removeFromParent();
  }
}
