/**
 * The Rund of the Karlslust (KL-B40, bible 1.6): nineteen small houses with slate roofs around the
 * ring, a barred door and a feeding hatch each. The set (sets.ts `k1-rund`) builds them; the tally
 * here makes the counting of q.k1 / k1_9 something you see: when the story sets a side's flag
 * (`k1.zaehl.w|n|o|s`), that side's doors light up one after the other and keep a faint chalk glow.
 */
import { Color, InstancedBufferAttribute, Mesh, type ShaderMaterial } from 'three';
import type { SetBuilder } from './builder';
import { rng, tint } from './kit';
import { glowMaterial } from './material';
import { C } from './props';
import { instancedQuad } from './smoke';

/** Centre and radius of the ring wall (footprint KL-B40). */
export const RUND = { x: 1935, z: 87, r: 27, houses: 19 } as const;

export type RundSide = 'w' | 'n' | 'o' | 's';

export interface RundHouse {
  x: number;
  z: number;
  /** Compass facing of the door (outwards). */
  deg: number;
  side: RundSide;
}

/** The 19 houses, evenly round the outside of the ring; each belongs to the nearest counting spot. */
export function rundHouses(): RundHouse[] {
  const out: RundHouse[] = [];
  const rr = RUND.r + 1.25;
  for (let i = 0; i < RUND.houses; i++) {
    const a = ((i + 0.5) / RUND.houses) * Math.PI * 2; // math angle: x = cos, z = sin
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
    // the story's counting spots: w (−x), n (−z), o (+x), s (+z)
    const side: RundSide = Math.abs(dx) >= Math.abs(dz) ? (dx < 0 ? 'w' : 'o') : dz < 0 ? 'n' : 's';
    out.push({ x: RUND.x + dx * rr, z: RUND.z + dz * rr, deg, side });
  }
  return out;
}

/** One house in prop space (+z = the door side, outwards). */
export function rundHouse(b: SetBuilder, h: RundHouse, seed: number): void {
  const k = b.kit;
  const r = rng(seed);
  b.at(h.x, h.z, h.deg, 1.1, 0.12);
  const wall = tint(C.plaster, r, 0.08);
  k.box(2.7, 0.4, 2.6, 0, 0, 0, tint(C.sandstoneRed, r, 0.1));
  k.box(2.5, 2.25, 2.4, 0, 0.4, 0, wall);
  // corner pilasters (sandstone) so the row reads as separate houses from afar
  for (const sx of [-1, 1]) k.box(0.22, 2.25, 0.22, sx * 1.22, 0.4, 1.12, tint(C.sandstone, r, 0.08));
  // the door: dark planks, iron bars in the upper half, no handle (Laub: "keine Klinke innen")
  k.box(0.95, 1.75, 0.08, -0.4, 0.4, 1.21, tint(C.woodDark, r, 0.1));
  k.box(0.75, 0.6, 0.04, -0.4, 1.35, 1.27, 0x120d0a);
  for (let i = 0; i < 5; i++) k.box(0.045, 0.66, 0.045, -0.72 + i * 0.16, 1.32, 1.3, C.iron);
  k.box(1.05, 0.08, 0.12, -0.4, 2.15, 1.24, C.sandstone);
  // the feeding hatch
  k.box(0.46, 0.38, 0.06, 0.72, 1.25, 1.21, tint(C.wood, r, 0.12));
  k.box(0.56, 0.06, 0.1, 0.72, 1.63, 1.24, C.sandstone);
  // slate roof: two slabs, ridge parallel to the ring wall, a ridge cap
  k.push(0, 2.65, 0, 0, 0, 0);
  k.box(2.95, 0.08, 1.62, 0, 0.32, 0.66, tint(C.slate, r, 0.1), [0.52, 0, 0]);
  k.box(2.95, 0.08, 1.62, 0, 0.32, -0.66, tint(C.slate, r, 0.1), [-0.52, 0, 0]);
  k.box(3.0, 0.12, 0.16, 0, 0.74, 0, 0x2c2e33);
  // gable ends
  for (const sx of [-1, 1]) k.box(0.06, 0.62, 1.6, sx * 1.24, 0, 0, wall);
  k.pop();
  // a number board above the door, the way a menagerie keeps its cages
  k.box(0.32, 0.22, 0.04, -0.4, 2.27, 1.26, C.ledger);
  b.box(h.x, h.z, h.deg, 1.38, 1.3);
}

const CHALK = new Color(1.6, 1.25, 0.7);

/** The counted doors: one glow per house, pulsing when its side is counted. */
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
      // in front of the door, at the bars
      const yaw = (h.deg * Math.PI) / 180;
      const x = h.x + Math.sin(yaw) * 1.45 + Math.cos(yaw) * 0.4;
      const z = h.z - Math.cos(yaw) * 1.45 + Math.sin(yaw) * 0.4;
      a.set([x, heightAt(h.x, h.z) + 1.55, z, 2.6], i * 4);
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

  /** Doors counted so far (tests). */
  get counted(): number {
    return this.start.filter((s) => !Number.isNaN(s)).length;
  }

  /**
   * Sides counted now (flags). A side that turns on pulses its doors one by one; `quiet` (a loaded
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
