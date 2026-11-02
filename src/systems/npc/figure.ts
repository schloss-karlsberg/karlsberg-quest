/**
 * A ghostly NPC: a translucent humanoid silhouette built from capsules and cones (no models), lit
 * like an etching. Two passes share one geometry:
 *   body  – sepia smoke, cross-hatched in screen space where the figure turns from the light,
 *           dissolving into curling smoke at the feet (readable in daylight),
 *   glow  – an additive fresnel rim in the figure's tint (warm amber for Hanne, cold and
 *           flickering for the others), breathing with the idle motion.
 * The vertex shader adds the idle motion per body part (breath, sway, a slow head turn, arms
 * hanging). Smoke motes rise around the figure; a faint light pools on the ground.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import { ERA_TINT, type NpcLook } from './roster';

/** sRGB hex → linear colour (the world renders linear HDR before tone mapping). */
function lin(hex: number, k = 1): Color {
  return new Color(hex).convertSRGBToLinear().multiplyScalar(k);
}

// parts: 0 head, 1 torso, 2 arm L, 3 arm R, 4 legs/skirt, 5 hat, 6 prop
interface Piece {
  geo: BufferGeometry;
  part: number;
  pivot: [number, number, number];
}

function seg(r: number, a: Vector3, b: Vector3, part: number, pivot: [number, number, number], sx = 1, sz = 1): Piece {
  const len = a.distanceTo(b);
  const g = new CapsuleGeometry(r, Math.max(0.001, len), 4, 10);
  g.scale(sx, 1, sz);
  const dir = b.clone().sub(a).normalize();
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
  g.applyMatrix4(new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new Vector3(1, 1, 1)));
  return { geo: g, part, pivot };
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

export function figurePieces(look: NpcLook): Piece[] {
  const H = look.height / 1.7;
  const W = look.build;
  const s = (y: number) => y * H;
  const p: Piece[] = [];
  // head + neck
  const head = new SphereGeometry(0.105 * H, 14, 10);
  head.scale(0.92, 1.08, 1);
  head.translate(0, s(1.6), 0.01);
  p.push({ geo: head, part: 0, pivot: [0, s(1.48), 0] });
  p.push(seg(0.05, v(0, s(1.44), 0), v(0, s(1.52), 0), 0, [0, s(1.48), 0]));
  // torso: shoulders → waist
  p.push(seg(0.17 * W, v(0, s(1.04), 0), v(0, s(1.34), 0), 1, [0, s(1.0), 0], 1.08, 0.62));
  // arms (hanging, slightly forward)
  for (const side of [-1, 1]) {
    const part = side < 0 ? 2 : 3;
    const sh = v(side * 0.21 * W, s(1.39), 0);
    const el = v(side * 0.25 * W, s(1.1), 0.04);
    const wr = v(side * 0.24 * W, s(0.86), 0.1);
    p.push(seg(0.048, sh, el, part, [sh.x, sh.y, sh.z]));
    p.push(seg(0.041, el, wr, part, [sh.x, sh.y, sh.z]));
  }
  // lower body
  if (look.dress === 'skirt') {
    const skirt = new ConeGeometry(0.36 * W, s(0.98), 18, 3, true);
    skirt.translate(0, s(0.5), 0);
    skirt.scale(1, 1, 0.82);
    p.push({ geo: skirt, part: 4, pivot: [0, s(1.0), 0] });
    // apron
    const apron = new PlaneGeometry(0.34 * W, s(0.62), 1, 3);
    apron.translate(0, s(0.66), 0.2);
    p.push({ geo: apron, part: 4, pivot: [0, s(1.0), 0] });
  } else {
    for (const side of [-1, 1]) {
      p.push(seg(0.07, v(side * 0.09, s(0.96), 0), v(side * 0.1, s(0.5), 0), 4, [0, s(1.0), 0]));
      p.push(seg(0.055, v(side * 0.1, s(0.5), 0), v(side * 0.1, s(0.08), 0.02), 4, [0, s(1.0), 0]));
    }
    if (look.dress === 'coat') {
      const tails = new ConeGeometry(0.27 * W, s(0.52), 14, 2, true);
      tails.translate(0, s(0.76), -0.03);
      tails.scale(1, 1, 0.7);
      p.push({ geo: tails, part: 4, pivot: [0, s(1.0), 0] });
    }
  }
  // headwear
  const top = s(1.71);
  if (look.hat === 'tricorn') {
    const brim = new CylinderGeometry(0.19, 0.2, 0.03, 3);
    brim.rotateY(Math.PI / 6);
    brim.translate(0, top, 0);
    const crown = new CylinderGeometry(0.09, 0.11, 0.09, 12);
    crown.translate(0, top + 0.05, 0);
    p.push({ geo: brim, part: 5, pivot: [0, s(1.48), 0] }, { geo: crown, part: 5, pivot: [0, s(1.48), 0] });
  } else if (look.hat === 'cap') {
    const cap = new SphereGeometry(0.115, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.7, 1.05);
    cap.translate(0, s(1.66), 0.01);
    p.push({ geo: cap, part: 5, pivot: [0, s(1.48), 0] });
  } else if (look.hat === 'bonnet') {
    const bonnet = new SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
    bonnet.rotateX(-0.35);
    bonnet.translate(0, s(1.62), -0.02);
    p.push({ geo: bonnet, part: 5, pivot: [0, s(1.48), 0] });
  }
  // props
  if (look.prop === 'ledger') {
    const b = new PlaneGeometry(0.22, 0.3);
    b.rotateX(-1.1);
    b.translate(-0.05, s(1.08), 0.2);
    p.push({ geo: b, part: 6, pivot: [0, s(1.1), 0] });
  } else if (look.prop === 'basket') {
    const bk = new CylinderGeometry(0.15, 0.11, 0.14, 12, 1, true);
    bk.translate(0.3 * W, s(0.86), 0.08);
    const handle = new CapsuleGeometry(0.012, 0.18, 2, 6);
    handle.rotateZ(Math.PI / 2);
    handle.translate(0.3 * W, s(0.98), 0.08);
    p.push({ geo: bk, part: 6, pivot: [0.24, s(1.39), 0] }, { geo: handle, part: 6, pivot: [0.24, s(1.39), 0] });
  } else if (look.prop === 'stick') {
    const st = new CylinderGeometry(0.014, 0.018, s(1.2), 6);
    st.translate(0.27 * W, s(0.62), 0.12);
    p.push({ geo: st, part: 6, pivot: [0.24, s(1.39), 0] });
  }
  return p;
}

/** Merge pieces into one non-indexed geometry with aPart / aPivot attributes. */
export function figureGeometry(look: NpcLook): BufferGeometry {
  const pieces = figurePieces(look);
  const pos: number[] = [];
  const nor: number[] = [];
  const part: number[] = [];
  const pivot: number[] = [];
  for (const pc of pieces) {
    const g = pc.geo.index ? pc.geo.toNonIndexed() : pc.geo;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const P = g.getAttribute('position');
    const N = g.getAttribute('normal');
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      part.push(pc.part);
      pivot.push(...pc.pivot);
    }
    if (g !== pc.geo) g.dispose();
    pc.geo.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  out.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  out.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1));
  out.setAttribute('aPivot', new BufferAttribute(new Float32Array(pivot), 3));
  out.computeBoundingSphere();
  return out;
}

const FIG_VERT = /* glsl */ `
uniform float uTime;
uniform float uMotion;
uniform float uSeed;
uniform float uTalk;
uniform float uHeight;
uniform float uFace;
attribute float aPart;
attribute vec3 aPivot;
varying vec3 vN;
varying vec3 vWp;
varying float vY;
varying float vPart;

vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }

void main() {
  float t = uTime * uMotion + uSeed * 7.31;
  vec3 p = position;
  vec3 n = normal;
  float breath = sin(t * 1.35);
  // breathing: torso and shoulders swell, everything above rises a little
  if (aPart < 1.5 && aPart > 0.5) {
    p.x *= 1.0 + 0.018 * breath;
    p.z *= 1.0 + 0.03 * breath;
  }
  if (p.y > uHeight * 0.8) p.y += 0.006 * breath;
  // head: slow look-around, a nod while talking
  if (aPart < 0.5 || abs(aPart - 5.0) < 0.5) {
    vec3 q = p - aPivot;
    q = rotY(q, 0.22 * sin(t * 0.31) * uMotion + uFace);
    q = rotX(q, 0.06 * sin(t * 0.7) + uTalk * 0.08 * sin(uTime * 7.0));
    p = aPivot + q;
    n = rotY(n, 0.22 * sin(t * 0.31) * uMotion + uFace);
  }
  // arms hang and drift; the talking hand lifts
  if (abs(aPart - 2.0) < 0.5 || abs(aPart - 3.0) < 0.5 || abs(aPart - 6.0) < 0.5) {
    float side = aPivot.x < 0.0 ? -1.0 : 1.0;
    vec3 q = p - aPivot;
    float a = 0.05 * sin(t * 0.9 + side) + (side > 0.0 ? uTalk * 0.25 * (0.6 + 0.4 * sin(uTime * 2.1)) : 0.0);
    q = rotX(q, -a);
    q = rotZ(q, side * 0.03 * sin(t * 0.55));
    p = aPivot + q;
  }
  // the whole figure sways like smoke in a slow draught
  float h = clamp(p.y / uHeight, 0.0, 1.0);
  p.x += (0.025 * sin(t * 0.47) + 0.012 * sin(t * 1.7 + p.y * 3.0)) * h;
  p.z += 0.015 * sin(t * 0.38 + 1.3) * h;
  // the feet are already smoke: they curl and spread
  float foot = 1.0 - smoothstep(0.0, 0.32, p.y / uHeight);
  p.x += foot * 0.06 * sin(t * 1.3 + p.z * 9.0);
  p.z += foot * 0.06 * cos(t * 1.1 + p.x * 9.0);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWp = wp.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vY = p.y / uHeight;
  vPart = aPart;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FIG_FRAG_COMMON = /* glsl */ `
${ATMOS_GLSL}
uniform vec3 uTint;
uniform float uAlpha;
uniform float uEerie;
uniform float uSeed;
uniform float uMotion;
varying vec3 vN;
varying vec3 vWp;
varying float vY;
varying float vPart;

float smokeMask() {
  float t = uTime * uMotion;
  // dissolve from the feet up: wisps of noise eat into the lower third
  float n = kqFbm(vec2(vWp.x * 3.1 + vWp.z * 2.3, vY * 5.0 - t * 0.6 + uSeed));
  float m = smoothstep(0.03, 0.5, vY + (n - 0.5) * 0.45);
  // drifting holes in the smoke, the head and shoulders stay clearest
  float holes = kqFbm(vec2(vWp.x * 5.0 - t * 0.21, vWp.y * 4.0 + vWp.z * 3.0 - t * 0.33) + uSeed);
  return m * mix(0.55 + 0.6 * holes, 1.0, smoothstep(0.7, 0.9, vY));
}
float fogKeep() {
  float d = length(vWp - uCamPos);
  return exp(-d * (uFogDensity * 1.6 + 0.004));
}
float flicker() {
  float t = uTime * uMotion;
  float f = 0.86 + 0.14 * sin(t * 1.9 + uSeed);
  // eerie figures stutter like a bad memory
  float s = step(0.93, kqHash12(vec2(floor(t * 9.0), uSeed)));
  return mix(1.0, f * (1.0 - 0.45 * s), uEerie) * (0.92 + 0.08 * sin(t * 0.8));
}
`;

const BODY_FRAG = /* glsl */ `
${FIG_FRAG_COMMON}
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(uCamPos - vWp);
  if (dot(n, v) < 0.0) n = -n;
  float lamb = clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
  // etching: two hatch layers in screen space, denser where the figure turns from the light
  vec2 fc = gl_FragCoord.xy;
  float h1 = abs(fract((fc.x + fc.y) * 0.17) - 0.5);
  float h2 = abs(fract((fc.x - fc.y) * 0.17) - 0.5);
  float dark = 1.0 - lamb;
  float hatch = smoothstep(0.32, 0.2, h1) * step(0.35, dark) + smoothstep(0.32, 0.2, h2) * step(0.62, dark);
  float rim = pow(1.0 - abs(dot(n, v)), 1.4);
  float a = uAlpha * smokeMask() * fogKeep() * (0.14 + 0.34 * hatch + 0.16 * rim) * flicker();
  if (a < 0.004) discard;
  vec3 ink = mix(vec3(0.07, 0.05, 0.035), uTint * 0.08, 0.35);
  gl_FragColor = vec4(ink, a);
}
`;

const GLOW_FRAG = /* glsl */ `
${FIG_FRAG_COMMON}
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(uCamPos - vWp);
  float rim = pow(1.0 - abs(dot(n, v)), 1.9);
  // a soft inner light (heart / lantern of a memory), strongest at the chest
  float core = exp(-pow((vY - 0.72) * 3.2, 2.0)) * 0.12 + 0.05;
  // etched light lines along the silhouette
  float lines = 0.5 + 0.5 * sin((vWp.y * 46.0) + kqNoise(vWp.xz * 8.0) * 4.0);
  float g = (rim * (0.8 + 0.2 * lines) + core) * smokeMask() * fogKeep() * flicker() * uAlpha;
  if (g < 0.003) discard;
  gl_FragColor = vec4(uTint * g, g);
}
`;

export function figureMaterials(look: NpcLook): { body: ShaderMaterial; glow: ShaderMaterial } {
  const shared = {
    uTint: { value: lin(look.tint, look.mood === 'warm' ? 2.0 : 1.6) },
    uAlpha: { value: 0 },
    uEerie: { value: look.mood === 'eerie' ? 1 : look.mood === 'neutral' ? 0.4 : 0 },
    uSeed: { value: look.seed },
    uMotion: { value: 1 },
    uTalk: { value: 0 },
    uHeight: { value: look.height },
    uFace: { value: 0 },
  };
  const body = new ShaderMaterial({
    vertexShader: FIG_VERT,
    fragmentShader: BODY_FRAG,
    uniforms: { ...atmosphere, ...shared },
    transparent: true,
    // the smoke body writes depth: the glow then only lights the front-most surface (no bright
    // seams where the capsules overlap)
    depthWrite: true,
    side: DoubleSide,
    blending: NormalBlending,
  });
  const glow = new ShaderMaterial({
    vertexShader: FIG_VERT,
    fragmentShader: GLOW_FRAG,
    uniforms: { ...atmosphere, ...shared },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  return { body, glow };
}

// ---- smoke motes and the ground glow ---------------------------------------------------------

const MOTE_VERT = /* glsl */ `
uniform float uTime;
uniform float uMotion;
uniform float uHeight;
uniform float uAlpha;
uniform float uPix;
attribute vec4 aSeed;
varying float vA;
void main() {
  float t = uTime * uMotion;
  float life = fract(t * (0.05 + aSeed.x * 0.06) + aSeed.y);
  float ang = aSeed.z * 6.2831853 + t * 0.3 * (aSeed.w - 0.5);
  float r = 0.12 + 0.3 * aSeed.w + life * 0.25;
  vec3 p = vec3(cos(ang) * r, life * uHeight * 1.25, sin(ang) * r * 0.7);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vA = uAlpha * smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.5, 1.0, life));
  gl_PointSize = clamp(uPix * (0.035 + 0.05 * aSeed.x) / max(-mv.z, 0.5), 1.0, 28.0);
}
`;
const MOTE_FRAG = /* glsl */ `
uniform vec3 uTint;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  float a = vA * exp(-d * 3.0);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uTint * a, a);
}
`;

const POOL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const POOL_FRAG = /* glsl */ `
uniform vec3 uTint;
uniform float uAlpha;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 c = vUv - 0.5;
  float d = length(c) * 2.0;
  float a = uAlpha * 0.32 * exp(-d * d * 4.0) * (0.85 + 0.15 * sin(uTime * 0.9));
  if (a < 0.003) discard;
  gl_FragColor = vec4(uTint * a, a);
}
`;

/** A ghost figure in the world. */
export class GhostFigure {
  readonly object = new Group();
  readonly look: NpcLook;
  private readonly mats: ShaderMaterial[];
  private readonly body: ShaderMaterial;
  private readonly glow: ShaderMaterial;
  private readonly motes: ShaderMaterial;
  private readonly pool: ShaderMaterial;
  private readonly geos: BufferGeometry[] = [];
  /** Current and target opacity (fade in / out). */
  alpha = 0;
  target = 1;
  talk = 0;

  constructor(look: NpcLook, era: string) {
    this.look = look;
    const geo = figureGeometry(look);
    this.geos.push(geo);
    const { body, glow } = figureMaterials(look);
    this.body = body;
    this.glow = glow;
    const tint = this.tintFor(era);
    body.uniforms.uTint!.value = tint;
    glow.uniforms.uTint!.value = tint;
    const bodyMesh = new Mesh(geo, body);
    const glowMesh = new Mesh(geo, glow);
    bodyMesh.renderOrder = 6;
    glowMesh.renderOrder = 7;
    bodyMesh.frustumCulled = glowMesh.frustumCulled = false;
    // motes
    const n = 70;
    const seeds = new Float32Array(n * 4);
    let s = look.seed * 9973 + 1;
    const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);
    for (let i = 0; i < n * 4; i++) seeds[i] = rnd();
    const mg = new BufferGeometry();
    mg.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    mg.setAttribute('aSeed', new BufferAttribute(seeds, 4));
    this.geos.push(mg);
    this.motes = new ShaderMaterial({
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      uniforms: { uTime: atmosphere.uTime, uMotion: body.uniforms.uMotion!, uHeight: { value: look.height }, uAlpha: { value: 0 }, uPix: { value: 600 }, uTint: { value: tint } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const motes = new Points(mg, this.motes);
    motes.frustumCulled = false;
    motes.renderOrder = 8;
    // light pooling on the ground
    const pg = new PlaneGeometry(2.6, 2.6);
    pg.rotateX(-Math.PI / 2);
    pg.translate(0, 0.06, 0);
    this.geos.push(pg);
    this.pool = new ShaderMaterial({
      vertexShader: POOL_VERT,
      fragmentShader: POOL_FRAG,
      uniforms: { uTint: { value: tint }, uAlpha: { value: 0 }, uTime: atmosphere.uTime },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const pool = new Mesh(pg, this.pool);
    pool.renderOrder = 5;
    this.object.add(pool, bodyMesh, glowMesh, motes);
    this.object.name = `npc-${look.id}`;
    this.mats = [body, glow, this.motes, this.pool];
  }

  private tintFor(era: string): Color {
    const base = lin(this.look.tint, this.look.mood === 'warm' ? 2.0 : 1.6);
    const e = lin(ERA_TINT[era] ?? 0xffffff);
    return base.multiply(e);
  }

  setEra(era: string): void {
    const c = this.tintFor(era);
    for (const m of this.mats) (m.uniforms.uTint!.value as Color).copy(c);
  }

  /**
   * Per frame: fade, talking gesture, reduced motion, face the player (yaw radians in world).
   * `px` = pixels per metre at distance 1 (point sizes).
   */
  frame(dt: number, o: { reducedMotion: boolean; px: number; face: number }): void {
    const k = Math.min(1, dt * 1.6);
    this.alpha += (this.target - this.alpha) * k;
    if (Math.abs(this.target - this.alpha) < 0.002) this.alpha = this.target;
    const motion = o.reducedMotion ? 0.15 : 1;
    const u = this.body.uniforms;
    u.uAlpha!.value = this.alpha;
    u.uMotion!.value = motion;
    u.uTalk!.value += ((this.talk ? 1 : 0) - (u.uTalk!.value as number)) * Math.min(1, dt * 3);
    u.uFace!.value = o.face;
    this.glow.uniforms.uAlpha!.value = this.alpha;
    this.motes.uniforms.uAlpha!.value = this.alpha * 0.55;
    this.motes.uniforms.uPix!.value = o.px;
    this.pool.uniforms.uAlpha!.value = this.alpha * (this.look.mood === 'warm' ? 1 : 0.6);
    this.object.visible = this.alpha > 0.01;
  }

  dispose(): void {
    this.object.removeFromParent();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
