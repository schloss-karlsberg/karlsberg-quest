/**
 * The first-person Messstab (the surveyor's red-and-white ranging pole) in the right hand — drawn
 * as a camera overlay: it follows the camera every frame and clears the depth buffer right before
 * it draws (last in the transparent pass), so it never sinks into walls, terrain or smoke.
 *
 * Procedural (D-007): red / white bands, an iron shoe, and the upgrades of the five stages — ash,
 * iron-shod, silver wire, Bann notches, Laub's plumb bob on its chain. Swings have anticipation and
 * follow-through (keyframed poses), a motion trail ribbon, the Wuchthieb charge pulls the pole over
 * the shoulder and the shoe glows; hit-stop freezes the pose.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Euler,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  type PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  BufferGeometry as BG,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';

export type WeaponStage = 'esche' | 'eisen' | 'silber' | 'bann' | 'lot';

export function stageOf(item: string | null | undefined): WeaponStage {
  if (!item) return 'esche';
  if (item.endsWith('.lot')) return 'lot';
  if (item.endsWith('.bann')) return 'bann';
  if (item.endsWith('.silber')) return 'silber';
  if (item.endsWith('.eisen')) return 'eisen';
  return 'esche';
}

const VM_VERT = /* glsl */ `
attribute vec3 color;
attribute float aEm;
varying vec3 vN;
varying vec3 vW;
varying vec3 vCol;
varying float vEm;
varying float vAlong;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vCol = color;
  vEm = aEm;
  vAlong = -position.z;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const VM_FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform vec3 uGlow;      // heavy-charge glow at the shoe / notch glow
uniform float uNotch;
uniform float uFlash;
varying vec3 vN;
varying vec3 vW;
varying vec3 vCol;
varying float vEm;
varying float vAlong;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(uCamPos - vW);
  // painted wood has a little grain along the pole
  float grain = 0.9 + 0.1 * kqNoise(vec2(vAlong * 40.0, n.x * 3.0));
  vec3 col = kqLight(vCol * grain, n, vW, 1.0, 1.0);
  // never pitch black: a little of the sky and the fog on the rim, so it reads at night
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.0);
  col += vCol * uSkyAmbient * 0.12 + uFogColor * rim * 0.22;
  // emissive parts: 1 = shoe (heavy glow), 2 = notches (ember)
  col += uGlow * step(0.5, vEm) * (1.0 - step(1.5, vEm)) ;
  col += vec3(1.0, 0.42, 0.1) * uNotch * step(1.5, vEm);
  col += vec3(1.0, 0.9, 0.7) * uFlash * 0.25;
  gl_FragColor = vec4(col, 1.0);
}
`;

const TRAIL_VERT = /* glsl */ `
attribute float aA;
varying float vA;
varying float vSide;
attribute float aSide;
void main() {
  vA = aA;
  vSide = aSide;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const TRAIL_FRAG = /* glsl */ `
uniform vec3 uCol;
varying float vA;
varying float vSide;
void main() {
  float edge = 1.0 - abs(vSide * 2.0 - 1.0);
  gl_FragColor = vec4(uCol * vA * (0.35 + 0.65 * edge), vA);
}
`;

function colored(g: BufferGeometry, c: [number, number, number], em = 0): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const emA = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
    emA[i] = em;
  }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.setAttribute('aEm', new Float32BufferAttribute(emA, 1));
  if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
  return geo;
}

/** A cylinder along −z from z0 to z1 (pole axis). */
function poleSeg(r0: number, r1: number, z0: number, z1: number, seg = 10): BufferGeometry {
  const g = new CylinderGeometry(r1, r0, Math.abs(z1 - z0), seg, 1, false);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, (z0 + z1) / 2);
  return g;
}

const RED: [number, number, number] = [0.62, 0.07, 0.05];
const WHITE: [number, number, number] = [0.86, 0.83, 0.76];
const IRON: [number, number, number] = [0.13, 0.12, 0.12];
const SILVER: [number, number, number] = [0.75, 0.78, 0.82];
const GLOVE: [number, number, number] = [0.085, 0.055, 0.04];
const SLEEVE: [number, number, number] = [0.1, 0.1, 0.11];

/** The pole: grip at the origin, the shoe end 1.35 m ahead (−z), the butt 0.5 m behind. */
function buildStaff(stage: WeaponStage): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const R = 0.017;
  // 0.25 m bands from the butt to the head
  const z0 = 0.5;
  const z1 = -1.35;
  const band = 0.25;
  let i = 0;
  for (let z = z0; z > z1 + 0.06; z -= band, i++) parts.push(colored(poleSeg(R, R, z, Math.max(z1 + 0.06, z - band)), i % 2 ? WHITE : RED));
  // iron shoe (the striking end)
  const shoeLen = stage === 'esche' ? 0.09 : 0.14;
  parts.push(colored(poleSeg(R * 1.05, R * 0.55, z1 + 0.06, z1 - shoeLen + 0.06, 10), IRON, 1));
  parts.push(colored(poleSeg(R * 0.55, 0.002, z1 - shoeLen + 0.06, z1 - shoeLen + 0.01, 8), IRON, 1));
  // butt cap
  parts.push(colored(poleSeg(R * 1.08, R * 1.08, z0, z0 + 0.025), IRON));
  if (stage !== 'esche') {
    // iron bands near the head, a ferrule at the grip
    for (const z of [-1.05, -1.18, -1.28]) parts.push(colored(poleSeg(R * 1.22, R * 1.22, z, z - 0.03), IRON, 1));
  }
  if (stage === 'silber' || stage === 'bann' || stage === 'lot') {
    // silver wire wound round the grip
    for (let k = 0; k < 14; k++) {
      const t = new TorusGeometry(R * 1.12, 0.0022, 4, 14);
      t.translate(0, 0, 0.12 - k * 0.018);
      parts.push(colored(t, SILVER));
    }
  }
  if (stage === 'bann' || stage === 'lot') {
    // nine notches cut in the night of the fire — they glow faintly
    for (let k = 0; k < 9; k++) parts.push(colored(poleSeg(R * 1.03, R * 1.03, -0.62 - k * 0.045, -0.635 - k * 0.045, 8), [0.08, 0.04, 0.02], 2));
  }
  // the glove round the grip and the coat sleeve going back out of view
  // a gloved fist: rounded, wrapped round the pole
  const glove = new SphereGeometry(0.048, 10, 8);
  glove.scale(1.05, 1.0, 1.35);
  glove.translate(0.012, -0.006, 0.0);
  parts.push(colored(glove, GLOVE));
  const thumb = new CylinderGeometry(0.014, 0.016, 0.06, 6);
  thumb.rotateZ(1.2);
  thumb.translate(-0.03, 0.022, -0.02);
  parts.push(colored(thumb, [0.13, 0.085, 0.06]));
  const sleeve = new CylinderGeometry(0.05, 0.065, 0.42, 10, 1, true);
  sleeve.rotateX(Math.PI / 2 - 0.35);
  sleeve.rotateY(-0.5);
  sleeve.translate(0.1, -0.09, 0.2);
  parts.push(colored(sleeve, SLEEVE));
  const geo = mergeGeometries(parts) as BufferGeometry;
  for (const p of parts) p.dispose();
  return geo;
}

interface Pose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

const REST: Pose = { x: 0.36, y: -0.42, z: -0.48, rx: 0.9, ry: -0.08, rz: -0.34 };

/** Key poses per move: [t (0..1 of the move), pose]. Impact sits at the light swing's 0.34 / heavy 0.36. */
const MOVES: Record<string, [number, Pose][]> = {
  light0: [
    [0, REST],
    [0.18, { x: 0.36, y: -0.28, z: -0.38, rx: 0.12, ry: -0.8, rz: -0.55 }],
    [0.34, { x: 0.24, y: -0.3, z: -0.46, rx: 0.04, ry: 0.15, rz: -0.18 }],
    [0.55, { x: 0.1, y: -0.32, z: -0.42, rx: -0.02, ry: 1.05, rz: 0.12 }],
    [1, REST],
  ],
  light1: [
    [0, REST],
    [0.18, { x: 0.12, y: -0.27, z: -0.4, rx: 0.14, ry: 1.05, rz: 0.45 }],
    [0.34, { x: 0.22, y: -0.3, z: -0.48, rx: 0.05, ry: 0.0, rz: 0.1 }],
    [0.55, { x: 0.38, y: -0.33, z: -0.42, rx: -0.02, ry: -0.95, rz: -0.45 }],
    [1, REST],
  ],
  light2: [
    [0, REST],
    [0.2, { x: 0.26, y: -0.18, z: -0.3, rx: 1.3, ry: 0.12, rz: -0.1 }],
    [0.34, { x: 0.2, y: -0.3, z: -0.62, rx: -0.1, ry: 0.08, rz: 0 }],
    [0.55, { x: 0.2, y: -0.42, z: -0.58, rx: -0.55, ry: 0.06, rz: 0.05 }],
    [1, REST],
  ],
  heavy: [
    [0, { x: 0.44, y: -0.2, z: -0.22, rx: 0.62, ry: -1.15, rz: -0.85 }],
    [0.36, { x: 0.24, y: -0.3, z: -0.52, rx: 0.02, ry: 0.15, rz: -0.12 }],
    [0.62, { x: 0.02, y: -0.36, z: -0.4, rx: -0.12, ry: 1.45, rz: 0.45 }],
    [1, REST],
  ],
};
const CHARGE: Pose = { x: 0.44, y: -0.2, z: -0.22, rx: 0.62, ry: -1.15, rz: -0.85 };
const LOWERED: Pose = { x: 0.32, y: -0.85, z: -0.3, rx: -0.6, ry: 0.3, rz: -0.2 };

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerpPose(a: Pose, b: Pose, t: number, out: Pose): Pose {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.rx = a.rx + (b.rx - a.rx) * t;
  out.ry = a.ry + (b.ry - a.ry) * t;
  out.rz = a.rz + (b.rz - a.rz) * t;
  return out;
}

function sample(keys: [number, Pose][], t: number, out: Pose): Pose {
  for (let i = 1; i < keys.length; i++) {
    const [t1, p1] = keys[i];
    const [t0, p0] = keys[i - 1];
    if (t <= t1) {
      const k = (t - t0) / Math.max(1e-4, t1 - t0);
      // into the impact: accelerate (ease-in); after it: decelerate (ease-out); else smooth
      const e = i === 2 ? k * k : i === 3 ? 1 - (1 - k) * (1 - k) : smooth(k);
      return lerpPose(p0, p1, e, out);
    }
  }
  return lerpPose(keys[keys.length - 1][1], keys[keys.length - 1][1], 0, out);
}

const TRAIL_N = 18;

export interface ViewmodelFrame {
  camera: PerspectiveCamera;
  dt: number;
  time: number;
  /** Hit-stop: hold the pose. */
  frozen: boolean;
  /** Swing in progress: kind, combo, t (s), duration (s). */
  swing: { kind: 'light' | 'heavy'; combo: number; t: number; dur: number } | null;
  /** Wuchthieb being charged: 0..1 (null = not charging). */
  charge: number | null;
  dodge: number | null;
  drink: number;
  /** Bannlicht flare 0..1. */
  flare: number;
  /** Player hit jolt 0..1. */
  hurt: number;
  moving: number;
  /** Not drawn (flying, spirit view) — or lowered (combat disabled: "Du hebst den Stab nicht."). */
  hidden: boolean;
  lowered: boolean;
  reducedMotion: boolean;
  reducedFlash: boolean;
}

export class Viewmodel {
  readonly root = new Group();
  private readonly arm = new Group();
  private staff: Mesh;
  private readonly mat: ShaderMaterial;
  private readonly clearer: Mesh;
  private stage: WeaponStage | null = null;
  private readonly pose: Pose = { ...REST };
  private readonly target: Pose = { ...REST };
  private sway = 0;
  private lower = 1;
  private readonly bob: Mesh;
  private readonly chain: Mesh;
  private readonly bobPos = new Vector3(0, -0.25, -1.35);
  private readonly bobVel = new Vector3();
  private readonly trail: Mesh;
  private readonly trailGeo: BG;
  private readonly trailMat: ShaderMaterial;
  private readonly trailPts: { a: Vector3; b: Vector3; age: number }[] = [];
  private kick = 0;

  constructor() {
    this.root.name = 'combat-viewmodel';
    this.mat = new ShaderMaterial({
      vertexShader: VM_VERT,
      fragmentShader: VM_FRAG,
      uniforms: { ...atmosphere, uGlow: { value: new Color(0, 0, 0) }, uNotch: { value: 0 }, uFlash: { value: 0 } },
      transparent: true,
      depthWrite: true,
      depthTest: true,
    });
    this.staff = new Mesh(new BoxGeometry(0.01, 0.01, 0.01), this.mat);
    this.staff.renderOrder = 1000;
    this.arm.add(this.staff);
    // the plumb bob (Laubs Lot) hangs on a chain from the shoe
    const bobGeo = new ConeGeometry(0.035, 0.08, 10);
    bobGeo.rotateX(Math.PI);
    const top = new SphereGeometry(0.022, 8, 6);
    top.translate(0, 0.04, 0);
    this.bob = new Mesh(mergeGeometries([colored(bobGeo, [0.6, 0.45, 0.2]), colored(top, [0.6, 0.45, 0.2])]) as BufferGeometry, this.mat);
    this.bob.renderOrder = 1000;
    this.chain = new Mesh(colored(new CylinderGeometry(0.0025, 0.0025, 1, 4), [0.3, 0.3, 0.3]), this.mat);
    this.chain.renderOrder = 1000;
    this.root.add(this.arm, this.bob, this.chain);
    // clears the depth buffer right before the viewmodel draws (it is the last thing in the frame)
    this.clearer = new Mesh(new PlaneGeometry(0.001, 0.001), new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false, colorWrite: false }));
    this.clearer.renderOrder = 999;
    this.clearer.frustumCulled = false;
    this.clearer.position.set(0, 0, -0.5);
    this.clearer.onBeforeRender = (renderer) => renderer.clearDepth();
    this.root.add(this.clearer);
    // motion trail of the shoe
    this.trailGeo = new BG();
    const pos = new Float32Array(TRAIL_N * 2 * 3);
    const aA = new Float32Array(TRAIL_N * 2);
    const side = new Float32Array(TRAIL_N * 2);
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_N; i++) {
      side[i * 2] = 0;
      side[i * 2 + 1] = 1;
      if (i < TRAIL_N - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const pa = new Float32BufferAttribute(pos, 3);
    pa.setUsage(DynamicDrawUsage);
    const aa = new Float32BufferAttribute(aA, 1);
    aa.setUsage(DynamicDrawUsage);
    this.trailGeo.setAttribute('position', pa);
    this.trailGeo.setAttribute('aA', aa);
    this.trailGeo.setAttribute('aSide', new Float32BufferAttribute(side, 1));
    this.trailGeo.setIndex(idx);
    this.trailMat = new ShaderMaterial({ vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG, uniforms: { uCol: { value: new Color(1, 0.86, 0.62) } }, transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending });
    this.trail = new Mesh(this.trailGeo, this.trailMat);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 1001;
    this.root.add(this.trail);
    this.root.traverse((o) => (o.frustumCulled = false));
    this.setStage('esche');
  }

  setStage(stage: WeaponStage): void {
    if (stage === this.stage) return;
    this.stage = stage;
    const old = this.staff.geometry;
    this.staff.geometry = buildStaff(stage);
    old.dispose();
    this.bob.visible = stage === 'lot';
    this.chain.visible = stage === 'lot';
  }

  get weapon(): WeaponStage {
    return this.stage ?? 'esche';
  }

  /** A small jolt when the player is hit (the hand takes it). */
  jolt(): void {
    this.kick = 1;
  }

  /** Shoe position in camera space (for the trail). */
  private shoe(out: Vector3, along = -1.35): Vector3 {
    out.set(0, 0, along);
    return this.arm.localToWorld(out).sub(this.root.position).applyQuaternion(_qi.copy(this.root.quaternion).invert());
  }

  frame(f: ViewmodelFrame): void {
    const cam = f.camera;
    this.root.position.copy(cam.position);
    this.root.quaternion.copy(cam.quaternion);
    const dt = f.frozen ? 0 : Math.min(0.1, f.dt);
    const wantLower = f.hidden || f.lowered ? 1 : 0;
    this.lower += (wantLower - this.lower) * Math.min(1, dt * (wantLower ? 5 : 7));
    if (f.hidden && this.lower > 0.97) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    // target pose
    const T = this.target;
    if (f.swing) {
      const keys = f.swing.kind === 'heavy' ? MOVES.heavy : MOVES[`light${Math.min(2, f.swing.combo)}`];
      sample(keys, Math.min(1, f.swing.t / f.swing.dur), T);
    } else if (f.charge !== null) {
      // pull the pole back over the shoulder; it trembles when fully charged
      lerpPose(REST, CHARGE, smooth(Math.min(1, f.charge * 3 + 0.2)), T);
      if (f.charge >= 1 && !f.reducedMotion) {
        T.x += Math.sin(f.time * 60) * 0.004;
        T.y += Math.cos(f.time * 53) * 0.004;
      }
    } else Object.assign(T, REST);
    if (f.dodge !== null) {
      const k = Math.sin(Math.min(1, f.dodge) * Math.PI);
      T.y -= 0.12 * k;
      T.rz += 0.4 * k;
    }
    if (f.drink > 0) lerpPose(T, LOWERED, 0.55, T);
    if (f.flare > 0) {
      T.rx -= 0.15 * f.flare;
      T.y -= 0.04 * f.flare;
    }
    lerpPose(T, LOWERED, smooth(this.lower), T);
    // idle sway and walking bob
    if (!f.reducedMotion) {
      this.sway += dt * (1.3 + f.moving * 6);
      T.x += Math.sin(this.sway) * (0.004 + f.moving * 0.008);
      T.y += Math.abs(Math.cos(this.sway)) * f.moving * 0.012 + Math.sin(f.time * 1.3) * 0.004;
    }
    if (this.kick > 0) {
      T.y -= 0.05 * this.kick;
      T.rz += 0.2 * this.kick;
      this.kick = Math.max(0, this.kick - dt * 4);
    }
    // swings follow their keys exactly (crisp), everything else eases
    const snap = f.swing ? 1 : Math.min(1, dt * 14);
    lerpPose(this.pose, T, snap, this.pose);
    const P = this.pose;
    this.arm.position.set(P.x, P.y, P.z);
    this.arm.quaternion.setFromEuler(_eu.set(P.rx, P.ry, P.rz, 'YXZ'));
    this.root.updateMatrixWorld(true);
    // glow: the shoe heats up while charging; notches burn faintly in the Bann stages
    const g = this.mat.uniforms.uGlow!.value as Color;
    const ch = f.charge ?? 0;
    const glow = ch > 0 ? 0.25 + ch * 1.4 + (ch >= 1 ? 0.4 * Math.sin(f.time * 14) : 0) : f.swing?.kind === 'heavy' ? 0.6 * (1 - f.swing.t / f.swing.dur) : 0;
    g.setRGB(1.0 * glow, 0.62 * glow, 0.25 * glow);
    this.mat.uniforms.uNotch!.value = this.stage === 'bann' || this.stage === 'lot' ? 0.35 + 0.25 * Math.sin(f.time * (f.reducedFlash ? 1 : 2.3)) + glow * 0.5 : 0;
    this.mat.uniforms.uFlash!.value = f.flare;
    this.updateBob(dt);
    this.updateTrail(f, dt);
  }

  /** The plumb bob swings on its chain (a pendulum hung from the shoe). */
  private updateBob(dt: number): void {
    if (this.stage !== 'lot') return;
    const anchor = this.shoe(_v1, -1.38);
    if (dt > 0) {
      const len = 0.26;
      // gravity in camera space
      const grav = _v2.set(0, -9.81, 0).applyQuaternion(_qi.copy(this.root.quaternion).invert());
      this.bobVel.addScaledVector(grav, dt);
      this.bobPos.addScaledVector(this.bobVel, dt);
      const d = _v3.copy(this.bobPos).sub(anchor);
      const l = d.length() || 1;
      d.multiplyScalar(len / l);
      const np = _v4.copy(anchor).add(d);
      this.bobVel.copy(np).sub(this.bobPos).divideScalar(dt).multiplyScalar(0.98);
      this.bobPos.copy(np);
    }
    this.bob.position.copy(this.bobPos);
    const mid = _v3.copy(anchor).add(this.bobPos).multiplyScalar(0.5);
    this.chain.position.copy(mid);
    const dir = _v4.copy(anchor).sub(this.bobPos);
    const l = dir.length();
    this.chain.scale.set(1, Math.max(0.01, l), 1);
    this.chain.quaternion.setFromUnitVectors(_up, dir.normalize());
    this.bob.quaternion.copy(this.chain.quaternion);
  }

  private updateTrail(f: ViewmodelFrame, dt: number): void {
    const active = !!f.swing && f.swing.t / f.swing.dur > 0.12 && f.swing.t / f.swing.dur < 0.66;
    if (dt > 0) {
      for (const p of this.trailPts) p.age += dt;
      if (active) {
        this.trailPts.unshift({ a: this.shoe(new Vector3(), -1.4), b: this.shoe(new Vector3(), -0.85), age: 0 });
        if (this.trailPts.length > TRAIL_N) this.trailPts.length = TRAIL_N;
      }
      while (this.trailPts.length && this.trailPts[this.trailPts.length - 1].age > 0.12) this.trailPts.pop();
    }
    const pos = this.trailGeo.getAttribute('position') as Float32BufferAttribute;
    const al = this.trailGeo.getAttribute('aA') as Float32BufferAttribute;
    const P = pos.array as Float32Array;
    const A = al.array as Float32Array;
    const heavy = f.swing?.kind === 'heavy';
    for (let i = 0; i < TRAIL_N; i++) {
      const p = this.trailPts[Math.min(i, this.trailPts.length - 1)];
      const a = p ? p.a : _zero;
      const b = p ? p.b : _zero;
      P.set([a.x, a.y, a.z], i * 6);
      P.set([b.x, b.y, b.z], i * 6 + 3);
      const k = p && i < this.trailPts.length ? (1 - i / TRAIL_N) * Math.max(0, 1 - p.age / 0.12) : 0;
      const v = k * (heavy ? 0.55 : 0.32) * (f.reducedFlash ? 0.6 : 1);
      A[i * 2] = v;
      A[i * 2 + 1] = v;
    }
    pos.needsUpdate = true;
    al.needsUpdate = true;
    this.trail.visible = this.trailPts.length > 1;
    this.trailMat.uniforms.uCol!.value.setRGB(1, heavy ? 0.72 : 0.88, heavy ? 0.4 : 0.66);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o instanceof Mesh) o.geometry.dispose();
    });
    this.mat.dispose();
    this.trailMat.dispose();
  }
}

const _eu = new Euler();
const _qi = new Quaternion();
const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _v4 = new Vector3();
const _up = new Vector3(0, 1, 0);
const _zero = new Vector3();
