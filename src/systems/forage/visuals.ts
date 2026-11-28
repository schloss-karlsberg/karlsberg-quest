/**
 * Forage visuals (three.js, procedural only): the chestnuts in flight with a short trail, the aim
 * arc with its landing ring, and one small pool of flying leaves, shell bits and drops. Three draw
 * calls at most while something happens, none otherwise. With reduced motion nothing flies: no
 * trail, no leaves, and the arc is drawn without its crawl.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { mulberry32 } from '../progression/logic';
import { type Nut, THROW, type V3 } from './logic';

/** sRGB hex → linear colour × k (the world renders linear before tone mapping). */
function lin(hex: number, k = 1): Color {
  return new Color(hex).convertSRGBToLinear().multiplyScalar(k);
}

export type BurstKind = 'fern' | 'bush' | 'flowers' | 'grass' | 'shell' | 'splash';

const PALETTES: Record<BurstKind, Color[]> = {
  // mid-November: fronds gone gold and rust, some still green
  fern: [lin(0x8a8f34), lin(0xb58a2c), lin(0x9c6a24), lin(0x66752c), lin(0xc9a13a)],
  bush: [lin(0x5f6f2a), lin(0x7d7a2c), lin(0xa86b26), lin(0x4f5d27)],
  flowers: [lin(0x7f8c36), lin(0xe9e2c8), lin(0xe3b93a), lin(0x9a78c8)],
  grass: [lin(0xb9a760), lin(0x9c9a4a), lin(0xcdb672)],
  shell: [lin(0x6b3a1c), lin(0x8a5a2e), lin(0xd8c39a)],
  splash: [lin(0xdfeaf2), lin(0xb9cfe0)],
};

const NUTS = 4;
const TRAIL = 7;
const ARC = 20;
const LEAVES = 120;

interface Leaf {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ax: number;
  ay: number;
  az: number;
  spin: number;
  rot: number;
  life: number;
  max: number;
  size: number;
  floor: number;
  drag: number;
  c: Color;
}

export class ForageVisuals {
  readonly group = new Group();
  private readonly nuts: Mesh[] = [];
  private readonly trail: Points;
  private readonly trailPos: Float32Array;
  private readonly history: Float32Array[] = [];
  private readonly arc: Points;
  private readonly arcPos: Float32Array;
  private readonly ring: Mesh;
  private readonly leaves: InstancedMesh;
  private readonly live: Leaf[] = [];
  private readonly rng = mulberry32(0x4b61);
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly axis = new Vector3();
  private readonly pos = new Vector3();
  private readonly scale = new Vector3();
  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    this.group.name = 'forage';
    this.group.userData.noShadow = true;
    const keep = <T extends { dispose(): void }>(x: T): T => {
      this.disposables.push(x);
      return x;
    };

    // the chestnut: glossy brown, lighter on top, with its pale scar
    const nutGeo = keep(new SphereGeometry(THROW.radius, 12, 9));
    nutGeo.scale(1, 0.86, 0.94);
    const np = nutGeo.getAttribute('position');
    const col = new Float32Array(np.count * 3);
    const dark = lin(0x4a2412);
    const light = lin(0xa5622c);
    const scar = lin(0xe6d2a8);
    const c = new Color();
    for (let i = 0; i < np.count; i++) {
      const up = np.getY(i) / (THROW.radius * 0.86);
      c.copy(dark).lerp(light, Math.min(1, Math.max(0, up * 0.6 + 0.5)));
      if (np.getZ(i) > THROW.radius * 0.6) c.copy(scar);
      col.set([c.r, c.g, c.b], i * 3);
    }
    nutGeo.setAttribute('color', new BufferAttribute(col, 3));
    const nutMat = keep(new MeshBasicMaterial({ vertexColors: true }));
    for (let i = 0; i < NUTS; i++) {
      const m = new Mesh(nutGeo, nutMat);
      m.visible = false;
      m.frustumCulled = false;
      this.nuts.push(m);
      this.group.add(m);
      this.history.push(new Float32Array(TRAIL * 3));
    }

    // a short trail of fading dots behind each one
    this.trailPos = new Float32Array(NUTS * TRAIL * 3);
    const trailGeo = keep(new BufferGeometry());
    const tp = new BufferAttribute(this.trailPos, 3);
    tp.setUsage(DynamicDrawUsage);
    trailGeo.setAttribute('position', tp);
    const tc = new Float32Array(NUTS * TRAIL * 3);
    const warm = lin(0xf2d9a0);
    for (let n = 0; n < NUTS; n++)
      for (let i = 0; i < TRAIL; i++) {
        const k = (1 - i / TRAIL) * 0.8;
        tc.set([warm.r * k, warm.g * k, warm.b * k], (n * TRAIL + i) * 3);
      }
    trailGeo.setAttribute('color', new BufferAttribute(tc, 3));
    trailGeo.setDrawRange(0, 0);
    this.trail = new Points(trailGeo, keep(new PointsMaterial({ size: 0.075, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false })));
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    this.group.add(this.trail);

    // the aim: dots along the arc and a ring where it lands
    this.arcPos = new Float32Array(ARC * 3);
    const arcGeo = keep(new BufferGeometry());
    const ap = new BufferAttribute(this.arcPos, 3);
    ap.setUsage(DynamicDrawUsage);
    arcGeo.setAttribute('position', ap);
    this.arc = new Points(arcGeo, keep(new PointsMaterial({ size: 0.085, sizeAttenuation: true, color: lin(0xfff0c8), transparent: true, opacity: 0.9, depthWrite: false })));
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    const ringGeo = keep(new RingGeometry(0.3, 0.4, 28));
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new Mesh(ringGeo, keep(new MeshBasicMaterial({ color: lin(0xfff0c8), transparent: true, opacity: 0.85, depthWrite: false, side: DoubleSide })));
    this.ring.visible = false;
    this.ring.renderOrder = 3;
    this.group.add(this.arc, this.ring);

    // leaves, shell bits, drops: one instanced pool of small diamond cards
    const leafGeo = keep(new BufferGeometry());
    leafGeo.setAttribute('position', new BufferAttribute(new Float32Array([-0.5, 0, 0, 0, 0, 0.26, 0.5, 0, 0, 0, 0, -0.26]), 3));
    leafGeo.setIndex([0, 1, 2, 0, 2, 3]);
    this.leaves = new InstancedMesh(leafGeo, keep(new MeshBasicMaterial({ side: DoubleSide })), LEAVES);
    this.leaves.instanceMatrix.setUsage(DynamicDrawUsage);
    this.leaves.count = 0;
    this.leaves.visible = false;
    this.leaves.frustumCulled = false;
    this.leaves.setColorAt(0, lin(0xffffff));
    this.group.add(this.leaves);
  }

  /** Leaves fly from a cut plant (or bits from a landing chestnut). `dx`/`dz`: the blow's direction. */
  burst(kind: BurstKind, x: number, y: number, z: number, n: number, power = 1, dx = 0, dz = 0): void {
    const pal = PALETTES[kind];
    const small = kind === 'shell' || kind === 'splash';
    for (let i = 0; i < n; i++) {
      if (this.live.length >= LEAVES) this.live.shift();
      const r = this.rng;
      const a = r() * Math.PI * 2;
      const sp = (0.8 + 1.9 * r()) * power;
      const leaf: Leaf = {
        x: x + (r() - 0.5) * (small ? 0.1 : 0.5),
        y: y + (small ? 0.05 : 0.15 + 0.5 * r()),
        z: z + (r() - 0.5) * (small ? 0.1 : 0.5),
        vx: Math.cos(a) * sp * 0.7 + dx * sp * 1.1,
        vy: (small ? 1.2 : 1.6) + 2.2 * r() * power,
        vz: Math.sin(a) * sp * 0.7 + dz * sp * 1.1,
        ax: r() - 0.5,
        ay: r() - 0.5,
        az: r() - 0.5,
        spin: (4 + 9 * r()) * (r() < 0.5 ? -1 : 1),
        rot: r() * 6.28,
        life: 0,
        max: small ? 0.45 + 0.25 * r() : 0.9 + 0.8 * r(),
        size: small ? 0.04 + 0.04 * r() : kind === 'grass' ? 0.14 + 0.1 * r() : 0.11 + 0.11 * r(),
        floor: y + 0.02,
        // leaves flutter down, bits and drops fall
        drag: small ? 0.6 : 2.4,
        c: pal[Math.floor(r() * pal.length)]!,
      };
      this.live.push(leaf);
    }
  }

  /** Chestnuts in flight (index = slot). */
  setNuts(nuts: readonly Nut[], reduced: boolean): void {
    let trail = 0;
    for (let i = 0; i < NUTS; i++) {
      const n = nuts[i];
      const m = this.nuts[i]!;
      const on = !!n && n.alive;
      const h = this.history[i]!;
      if (!on) {
        if (m.visible) h.fill(Number.NaN);
        m.visible = false;
        continue;
      }
      // lying still: it sinks into the litter before it is gone
      const lying = n.rest >= 0 ? Math.max(0, 1 - n.rest / THROW.rest) : 1;
      if (!m.visible) for (let k = 0; k < TRAIL; k++) h.set([n.x, n.y, n.z], k * 3);
      m.visible = true;
      m.position.set(n.x, n.y - (1 - lying) * THROW.radius * 1.6, n.z);
      m.scale.setScalar(0.6 + 0.4 * lying);
      if (n.rest < 0) m.rotation.set(n.age * 11, n.age * 3, n.age * 7);
      h.copyWithin(3, 0, (TRAIL - 1) * 3);
      h.set([n.x, n.y, n.z], 0);
      if (!reduced && n.rest < 0) {
        this.trailPos.set(h, trail * 3);
        trail += TRAIL;
      }
    }
    const geo = this.trail.geometry;
    geo.setDrawRange(0, trail);
    this.trail.visible = trail > 0;
    if (trail > 0) (geo.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  /** The aim preview: `n` arc points (x, y, z) and the landing point; null hides it. */
  aim(points: Float32Array | null, n: number, target: V3 | null, time: number, reduced: boolean): void {
    const on = !!points && !!target && n > 0;
    this.arc.visible = on;
    this.ring.visible = on;
    if (!on) return;
    const count = Math.min(ARC, n);
    this.arcPos.set(points!.subarray(0, count * 3));
    const geo = this.arc.geometry;
    geo.setDrawRange(0, count);
    (geo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    this.ring.position.set(target!.x, target!.y + 0.06, target!.z);
    this.ring.scale.setScalar(reduced ? 1 : 1 + 0.08 * Math.sin(time * 6));
  }

  frame(dt: number): void {
    const L = this.live;
    if (!L.length) {
      if (this.leaves.visible) {
        this.leaves.visible = false;
        this.leaves.count = 0;
      }
      return;
    }
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i]!;
      p.life += dt;
      if (p.life >= p.max) continue;
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vz *= damp;
      p.vy = p.vy * Math.exp(-p.drag * 0.5 * dt) - 7.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < p.floor) {
        p.y = p.floor;
        p.vx = p.vy = p.vz = 0;
        p.spin = 0;
      }
      p.rot += p.spin * dt;
      L[w] = p;
      const k = p.life / p.max;
      const s = p.size * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
      this.axis.set(p.ax, p.ay + 0.001, p.az).normalize();
      this.q.setFromAxisAngle(this.axis, p.rot);
      this.pos.set(p.x, p.y, p.z);
      this.scale.set(s, s, s);
      this.m4.compose(this.pos, this.q, this.scale);
      this.leaves.setMatrixAt(w, this.m4);
      this.leaves.setColorAt(w, p.c);
      w++;
    }
    L.length = w;
    this.leaves.count = w;
    this.leaves.visible = w > 0;
    this.leaves.instanceMatrix.needsUpdate = true;
    if (this.leaves.instanceColor) this.leaves.instanceColor.needsUpdate = true;
  }

  /** Leaves in the air (tests, the e2e spec). */
  get leafCount(): number {
    return this.live.length;
  }

  clear(): void {
    this.live.length = 0;
    this.leaves.count = 0;
    this.leaves.visible = false;
    for (const m of this.nuts) m.visible = false;
    this.trail.visible = false;
    this.arc.visible = false;
    this.ring.visible = false;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.leaves.dispose();
    this.group.removeFromParent();
  }
}
