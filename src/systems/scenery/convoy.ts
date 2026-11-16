/**
 * The stone convoy of 1796 (bible 4.1: "Karren mit behauenen Steinen rollen nach Westen"):
 * playtest round 2 found the parked carts dead — now two ox carts actually roll along the valley
 * road past the Taleingang, wheels turning with the distance they cover, the ox nodding, a carter
 * walking beside. They loop (they leave the road out of sight in the west and come back from the
 * east). Nothing here is solid: they pass, the player steps aside or walks through the dust.
 */
import { Group, Mesh, type ShaderMaterial } from 'three';
import { propMaterial } from './material';
import { Kit, rng, tint } from './kit';
import { C, type CartLoad, cart, wheel } from './props';

/** The valley road (local frame), east → west; traced on the 2025 tracks and the 1840 sheet. */
export const CONVOY_ROAD: readonly [number, number][] = [
  [700, -912],
  [620, -906],
  [560, -902],
  [512, -906],
  [470, -904],
  [430, -909],
  [370, -904],
  [300, -906],
  [230, -903],
];

const SPEED = 1.25;
const WHEEL_R = 0.62;
const AXLE: [number, number] = [0.72 - 0.1, -0.1];

interface Rig {
  group: Group;
  wheels: Group[];
  ox: Group;
  carter: Group;
  s: number;
}

function meshOf(build: (k: Kit) => void, mat: ShaderMaterial): Mesh {
  const k = new Kit();
  build(k);
  return new Mesh(k.build(), mat);
}

function ox(k: Kit, seed: number): void {
  const r = rng(seed);
  const hide = tint(0x8a6a4a, r, 0.12);
  k.box(0.8, 0.75, 2.0, 0, 0.75, 0, hide);
  k.box(0.5, 0.5, 0.6, 0, 1.05, 1.15, hide, [0.3, 0, 0]);
  k.box(0.32, 0.3, 0.3, 0, 0.98, 1.5, tint(0x5a4232, r, 0.1));
  for (const s of [-1, 1]) k.beam(s * 0.2, 1.35, 1.2, s * 0.55, 1.6, 1.25, 0.05, 0xd8ccb0, 0.03);
  for (const [x, z] of [[-0.28, 0.7], [0.28, 0.7], [-0.28, -0.75], [0.28, -0.75]] as const) k.box(0.16, 0.8, 0.16, x, 0, z, tint(0x5a4232, r, 0.08));
  // the yoke
  k.box(1.2, 0.1, 0.12, 0, 1.45, 0.9, C.woodDark);
}

function carter(k: Kit, seed: number): void {
  const r = rng(seed);
  k.box(0.36, 0.85, 0.22, 0, 0, 0, tint(0x3a3a3a, r, 0.15));
  k.box(0.46, 0.62, 0.28, 0, 0.85, 0, tint(0x6a5038, r, 0.15));
  k.box(0.2, 0.22, 0.2, 0, 1.5, 0, 0xc9a07a);
  k.cyl(0.2, 0.2, 0.06, 0, 1.7, 0, 0x2a2420, undefined, 10);
  k.pole(0.3, 0.6, 0.15, 0.4, 1.9, 0.35, 0.02, C.woodDark, 4);
}

export class Convoy {
  readonly group = new Group();
  private readonly rigs: Rig[] = [];
  private readonly mat = propMaterial();
  private readonly lens: number[] = [];
  private readonly total: number;

  constructor(private readonly heightAt: (x: number, z: number) => number) {
    this.group.name = 'scenery-convoy';
    let t = 0;
    for (let i = 0; i + 1 < CONVOY_ROAD.length; i++) {
      const [ax, az] = CONVOY_ROAD[i]!;
      const [bx, bz] = CONVOY_ROAD[i + 1]!;
      t += Math.hypot(bx - ax, bz - az);
      this.lens.push(t);
    }
    this.total = t;
    const loads: CartLoad[] = ['blocks', 'stones', 'marked'];
    for (let i = 0; i < 3; i++) {
      const g = new Group();
      g.add(meshOf((k) => cart(k, 61 + i, loads[i]!, false), this.mat));
      const wheels: Group[] = [];
      for (const sx of [-0.86, 0.86]) {
        const w = new Group();
        w.position.set(0, WHEEL_R, AXLE[1]);
        w.add(meshOf((k) => wheel(k, sx, 0, 0, WHEEL_R, C.woodDark), this.mat));
        g.add(w);
        wheels.push(w);
      }
      const o = new Group();
      o.add(meshOf((k) => ox(k, 71 + i), this.mat));
      o.position.set(0, 0, 3.7);
      g.add(o);
      const c = new Group();
      c.add(meshOf((k) => carter(k, 81 + i), this.mat));
      c.position.set(1.3, 0, 2.6);
      g.add(c);
      this.group.add(g);
      this.rigs.push({ group: g, wheels, ox: o, carter: c, s: i * (this.total / 3) });
    }
    this.place(0);
  }

  /** Point and heading at distance `s` along the road. */
  private at(s: number): [number, number, number] {
    s = ((s % this.total) + this.total) % this.total;
    let i = 0;
    while (i < this.lens.length - 1 && this.lens[i]! < s) i++;
    const s0 = i ? this.lens[i - 1]! : 0;
    const [ax, az] = CONVOY_ROAD[i]!;
    const [bx, bz] = CONVOY_ROAD[i + 1]!;
    const f = (s - s0) / (this.lens[i]! - s0);
    return [ax + (bx - ax) * f, az + (bz - az) * f, Math.atan2(bx - ax, bz - az)];
  }

  private place(time: number): void {
    for (const r of this.rigs) {
      const [x, z, yaw] = this.at(r.s);
      const [fx, fz] = this.at(r.s + 3);
      const y = this.heightAt(x, z);
      const yf = this.heightAt(fx, fz);
      r.group.position.set(x, y, z);
      r.group.rotation.set(0, 0, 0);
      r.group.rotateY(yaw);
      r.group.rotateX(-Math.atan2(yf - y, 3));
      for (const w of r.wheels) w.rotation.x = r.s / WHEEL_R;
      r.ox.rotation.x = Math.sin(time * 2.2 + r.s) * 0.03;
      r.ox.position.y = Math.abs(Math.sin(time * 2.2 + r.s)) * 0.04;
      r.carter.position.y = Math.abs(Math.sin(time * 4.4 + r.s)) * 0.05;
    }
  }

  /** Advance (fixed step). `reducedMotion` keeps them rolling, only slower bobbing. */
  update(dt: number, time: number): void {
    for (const r of this.rigs) r.s = (r.s + SPEED * dt) % this.total;
    this.place(time);
  }

  /** Distances (debug hook). */
  positions(): [number, number][] {
    return this.rigs.map((r) => [r.group.position.x, r.group.position.z]);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => (o as Mesh).geometry?.dispose());
    this.mat.dispose();
  }
}
