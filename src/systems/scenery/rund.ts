/**
 * The Rund of the Karlslust (KL-B40, bible 1.6). The palace model (research wave) carries the
 * nineteen square slate-roofed houses and the loge on the ring of house centres (r 24.8, facing the
 * moat, the loge on the north axis); what it leaves out are the iron grilles of the yards (catalogue:
 * "each yard = house + two radial grilles to the water + a grille closing it behind"). The set
 * (sets.ts `k1-rund`) builds those grilles; the tally here makes the counting of q.k1 / k1_9
 * something you see: when the story sets a side's flag (`k1.zaehl.w|n|o|s`), that side's houses light
 * up one after the other (a chalk mark on the back wall, the side you walk past) and keep a glow.
 */
import { Color, InstancedBufferAttribute, Mesh, type ShaderMaterial } from 'three';
import type { Kit } from './kit';
import { rng, tint } from './kit';
import { glowMaterial } from './material';
import { C } from './props';
import { instancedQuad } from './smoke';

/**
 * Centre and outer radius of the ring (footprint KL-B40, the LiDAR ring KL-01), the radius of the
 * house centres and the loge's compass bearing (catalogue KL-B40 facade.menagerie.ring).
 */
export const RUND = { x: 1935, z: 87, r: 27, ring: 24.8, houses: 19, logeDeg: 0 } as const;

/** The model's ring houses: 3.6 m square walls, radially 23.0 … 26.6 m from the centre. */
const HOUSE_HALF = 1.8;
const HOUSE_BACK = 26.6;
/** Half the loge's width. */
const LOGE_HALF = 2.8;
/** The moat's water's edge (catalogue moat_radius 22). */
const MOAT = 22.2;

export type RundSide = 'w' | 'n' | 'o' | 's';

export interface RundHouse {
  x: number;
  z: number;
  /** Compass bearing from the ring's centre (the loge stands at RUND.logeDeg). */
  az: number;
  /** Compass facing of the door: towards the moat. */
  deg: number;
  side: RundSide;
}

/** Unit vector (x, z) of a compass bearing (0 north = −z, 90 east = +x). */
function dir(deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [Math.sin(a), -Math.cos(a)];
}

/** The model's 19 houses (the loge's slot left out); each belongs to the nearest counting spot. */
export function rundHouses(): RundHouse[] {
  const out: RundHouse[] = [];
  const step = 360 / (RUND.houses + 1);
  for (let i = 1; i <= RUND.houses; i++) {
    const az = (RUND.logeDeg + i * step) % 360;
    const [dx, dz] = dir(az);
    // the story's counting spots: w (−x), n (−z), o (+x), s (+z)
    const side: RundSide = Math.abs(dx) >= Math.abs(dz) ? (dx < 0 ? 'w' : 'o') : dz < 0 ? 'n' : 's';
    out.push({ x: RUND.x + dx * RUND.ring, z: RUND.z + dz * RUND.ring, az, deg: (az + 180) % 360, side });
  }
  return out;
}

/** The point at radius r on bearing az, shifted t metres sideways (clockwise positive). */
export function ringPoint(az: number, r: number, t: number): [number, number] {
  const [dx, dz] = dir(az);
  return [RUND.x + dx * r - dz * t, RUND.z + dz * r + dx * t];
}

/** An iron grille from a to b on the ground: bars every `step` m, two rails, three posts. */
function grille(k: Kit, a: [number, number], b: [number, number], h: (x: number, z: number) => number, height: number, step: number, seed: number): void {
  const r = rng(seed);
  const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  const y = (s: number) => h(a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s);
  const iron = tint(C.iron, r, 0.06);
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const x = a[0] + (b[0] - a[0]) * s;
    const z = a[1] + (b[1] - a[1]) * s;
    const post = i === 0 || i === n || i === Math.round(n / 2);
    k.beam(x, y(s) - 0.3, z, x, y(s) + height + (post ? 0.08 : 0), z, post ? 0.07 : 0.035, iron);
  }
  for (const ry of [0.12, height - 0.1]) k.beam(a[0], y(0) + ry, a[1], b[0], y(1) + ry, b[1], 0.05, iron, 0.025);
}

/**
 * The yards' grilles round the model's houses: in every gap between two houses (and beside the loge)
 * one grille closes the gap behind, flush with the back walls, and one runs radially down to the
 * water and parts the two neighbours' yards. Ground-following; no solids (the ring footprint holds).
 */
export function rundGrilles(k: Kit, h: (x: number, z: number) => number, seed: number): void {
  k.place(0, 0, 0, 0);
  const step = 360 / (RUND.houses + 1);
  const back = HOUSE_BACK - 0.15;
  for (let i = 0; i <= RUND.houses; i++) {
    const az0 = RUND.logeDeg + i * step;
    const az1 = az0 + step;
    const half0 = i === 0 ? LOGE_HALF : HOUSE_HALF;
    const half1 = i === RUND.houses ? LOGE_HALF : HOUSE_HALF;
    grille(k, ringPoint(az0, back, half0), ringPoint(az1, back, -half1), h, 2.3, 0.22, seed + i * 2);
    const mid = az0 + step / 2;
    grille(k, ringPoint(mid, back - 0.4, 0), ringPoint(mid, MOAT, 0), h, 2.0, 0.3, seed + i * 2 + 1);
  }
}

const CHALK = new Color(1.6, 1.25, 0.7);

/** The counted houses: one glow per house, pulsing when its side is counted. */
export class RundTally {
  readonly mesh: Mesh;
  private readonly tints: InstancedBufferAttribute;
  private readonly houses = rundHouses();
  /** Per house: glow now, and the time (s) its pulse starts (NaN: not counted). */
  private readonly level: number[];
  private readonly start: number[];
  private readonly seen = new Set<RundSide>();
  private clock = 0;

  constructor(heightAt: (x: number, z: number) => number) {
    const g = instancedQuad();
    const a = new Float32Array(this.houses.length * 4);
    const t = new Float32Array(this.houses.length * 4);
    this.houses.forEach((h, i) => {
      // a chalk mark on the back wall: the doors face the moat, the counting spots are outside
      const [x, z] = ringPoint(h.az, HOUSE_BACK + 0.25, 0);
      a.set([x, heightAt(x, z) + 1.7, z, 2.6], i * 4);
      t.set([0, 0, 0, i * 0.37], i * 4);
    });
    g.setAttribute('aSprite', new InstancedBufferAttribute(a, 4));
    this.tints = new InstancedBufferAttribute(t, 4);
    g.setAttribute('aTint', this.tints);
    g.instanceCount = this.houses.length;
    const m = glowMaterial(0);
    this.mesh = new Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.name = 'scenery-rund-tally';
    this.level = this.houses.map(() => 0);
    this.start = this.houses.map(() => Number.NaN);
  }

  get material(): ShaderMaterial {
    return this.mesh.material as ShaderMaterial;
  }

  /** Houses counted so far (tests). */
  get counted(): number {
    return this.start.filter((s) => !Number.isNaN(s)).length;
  }

  /**
   * Sides counted now (flags). A side that turns on pulses its houses one by one; `quiet` (a loaded
   * save) lights them without the pulse.
   */
  update(dt: number, sides: Record<RundSide, boolean>, quiet = false): void {
    this.clock += dt;
    for (const side of ['w', 'n', 'o', 's'] as const) {
      if (!sides[side] || this.seen.has(side)) continue;
      this.seen.add(side);
      let n = 0;
      this.houses.forEach((h, i) => {
        if (h.side !== side) return;
        this.start[i] = quiet ? -100 : this.clock + 0.28 * n++;
      });
    }
    let dirty = false;
    this.houses.forEach((_, i) => {
      const s = this.start[i]!;
      let v = 0;
      if (!Number.isNaN(s)) {
        const t = this.clock - s;
        // a bright flash, then the chalk mark stays
        v = t < 0 ? 0 : t < 0.18 ? (t / 0.18) * 2.4 : 0.42 + 1.98 * Math.exp(-(t - 0.18) * 2.2);
      }
      if (Math.abs(v - this.level[i]!) > 0.004) {
        this.level[i] = v;
        this.tints.setXYZ(i, CHALK.r * v, CHALK.g * v, CHALK.b * v);
        dirty = true;
      }
    });
    if (dirty) this.tints.needsUpdate = true;
  }

  /** Forget the count (a new game, another save). */
  reset(): void {
    this.seen.clear();
    this.start.fill(Number.NaN);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
