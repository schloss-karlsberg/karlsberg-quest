/**
 * The Gittertüren of the Zwinger (K3, bible 3.12: "Jost reißt die Gittertüren auf"): two leaves of
 * iron bars in the east wall of the kennel yard. Closed while the pack paces behind them; when
 * the kennel is released they swing outward with a clang and an overshoot, and stay open.
 * Era 1793-07 only (the night of the fire). Pure geometry helpers are unit-tested.
 */
import { BoxGeometry, BufferGeometry, ConeGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, ShaderMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import type { XZ } from './sim';

export interface GateFrame {
  /** Centre of the opening on the wall line. */
  x: number;
  z: number;
  /** Unit tangent along the wall. */
  tx: number;
  tz: number;
  /** Unit normal pointing out of the yard. */
  nx: number;
  nz: number;
}

/**
 * Where the gate sits: the point of the yard outline nearest to `near` (the pack's first
 * waypoint, just outside), with the wall's tangent and the outward normal. Pure.
 */
export function gateFrame(ring: readonly [number, number][], near: XZ): GateFrame | null {
  let best: GateFrame | null = null;
  let bd = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const l2 = ex * ex + ez * ez;
    if (l2 < 1e-6) continue;
    const k = Math.max(0, Math.min(1, ((near.x - a[0]) * ex + (near.z - a[1]) * ez) / l2));
    const px = a[0] + ex * k;
    const pz = a[1] + ez * k;
    const d = Math.hypot(near.x - px, near.z - pz);
    if (d < bd) {
      bd = d;
      const l = Math.sqrt(l2);
      const tx = ex / l;
      const tz = ez / l;
      // outward: towards `near`
      let nx = -tz;
      let nz = tx;
      if ((near.x - px) * nx + (near.z - pz) * nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      best = { x: px, z: pz, tx, tz, nx, nz };
    }
  }
  return best;
}

/** Opening angle (rad) of a leaf t s after the release: fast, past 100°, back, settles. Pure. */
export function leafAngle(t: number, reducedMotion = false): number {
  const open = (105 * Math.PI) / 180;
  if (t <= 0) return 0;
  if (reducedMotion) return Math.min(1, t / 0.5) * open;
  const k = Math.min(1, t / 0.45);
  const ease = 1 - (1 - k) ** 3;
  const wobble = t > 0.45 ? Math.exp(-(t - 0.45) * 4) * Math.sin((t - 0.45) * 14) * 0.12 : 0;
  return open * (ease * 1.08 - (k >= 1 ? 0.08 : 0)) + wobble;
}

const VERT = /* glsl */ `
varying vec3 vWp;
varying vec3 vN;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${ATMOS_GLSL}
varying vec3 vWp;
varying vec3 vN;
void main() {
  vec3 n = normalize(vN);
  float rust = kqNoise(vWp.xz * 7.0 + vWp.y * 5.0);
  vec3 alb = mix(vec3(0.05, 0.045, 0.04), vec3(0.16, 0.08, 0.04), rust * 0.6);
  vec3 col = kqLight(alb, n, vWp, 1.0, 1.0);
  gl_FragColor = vec4(kqFog(col, vWp), 1.0);
}
`;

/** One leaf, hinged at x = 0, extending along +x, w wide, h high (bars, rails, spear tips). */
function leafGeometry(w: number, h: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const bars = Math.max(4, Math.round(w / 0.13));
  for (let i = 0; i <= bars; i++) {
    const x = (i / bars) * (w - 0.04) + 0.02;
    const b = new BoxGeometry(0.025, h, 0.025);
    b.translate(x, h / 2, 0);
    parts.push(b);
    const tip = new ConeGeometry(0.03, 0.12, 4);
    tip.translate(x, h + 0.06, 0);
    parts.push(tip);
  }
  for (const y of [0.12, h * 0.55, h - 0.08]) {
    const r = new BoxGeometry(w, 0.05, 0.04);
    r.translate(w / 2, y, 0);
    parts.push(r);
  }
  const stile = new BoxGeometry(0.06, h, 0.05);
  stile.translate(0.03, h / 2, 0);
  parts.push(stile);
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  for (const p of parts) p.dispose();
  return g!;
}

export class KennelGate {
  readonly object = new Group();
  private readonly leaves: [Group, Group];
  private readonly mat: ShaderMaterial;
  private openT = -1;
  private readonly hole: Mesh;
  frame: GateFrame | null = null;

  constructor(readonly width = 3.0, readonly height = 2.3) {
    this.object.name = 'hunt-kennel-gate';
    this.mat = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...atmosphere } });
    const half = width / 2;
    const g = leafGeometry(half, height);
    const mk = (mirror: boolean): Group => {
      const pivot = new Group();
      const m = new Mesh(g, this.mat);
      if (mirror) m.scale.x = -1;
      pivot.add(m);
      this.object.add(pivot);
      return pivot;
    };
    this.leaves = [mk(false), mk(true)];
    // the dark passage behind the bars (the yard wall has no hole of its own)
    this.hole = new Mesh(new PlaneGeometry(width, height + 0.1), new MeshBasicMaterial({ color: 0x050302 }));
    this.hole.position.set(0, (height + 0.1) / 2, 0.03);
    this.object.add(this.hole);
    this.object.visible = false;
  }

  /** Place the gate (once the yard outline is known). */
  place(f: GateFrame, groundY: number): void {
    this.frame = f;
    const half = this.width / 2;
    // the object frame: x along the wall tangent, z outward
    this.object.position.set(f.x, groundY, f.z);
    // local +z = outward, local x = along the wall
    this.object.rotation.set(0, Math.atan2(f.nx, f.nz), 0);
    this.leaves[0].position.set(-half, 0, 0.12);
    this.leaves[1].position.set(half, 0, 0.12);
  }

  /** Open from now (or at once, already open). */
  open(already = false): void {
    if (this.openT >= 0) return;
    this.openT = already ? 10 : 0;
  }

  close(): void {
    this.openT = -1;
  }

  get isOpen(): boolean {
    return this.openT >= 0;
  }

  update(dt: number, visible: boolean, reducedMotion: boolean): void {
    this.object.visible = visible && this.frame !== null;
    if (this.openT >= 0) this.openT += dt;
    const a = this.openT >= 0 ? leafAngle(this.openT, reducedMotion) : 0;
    // outward (towards local +z): the left leaf turns one way, the right the other
    this.leaves[0].rotation.y = -a;
    this.leaves[1].rotation.y = a;
  }

  dispose(): void {
    (this.leaves[0].children[0] as Mesh).geometry.dispose();
    this.hole.geometry.dispose();
    (this.hole.material as MeshBasicMaterial).dispose();
    this.mat.dispose();
  }
}
