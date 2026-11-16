/**
 * Peter's gilded armchair (chapter 3, q.k3.lehnstuhl: "Peter mit dem Stuhl zum Hoftor bringen"):
 * playtest round 2 — the quest talked about a chair nobody could see. A Louis-Seize Lehnstuhl
 * (gilt frame, faded green damask) that stands beside Peter wherever the npc system puts him in
 * July 1793, dragged along a step behind him while he moves. Not solid.
 */
import { Group, Mesh } from 'three';
import { Kit } from './kit';
import { propMaterial } from './material';

const GILT = 0xc9a24a;
const DAMASK = 0x3e6a4a;

function lehnstuhl(k: Kit): void {
  // seat, legs (slightly splayed), back with a carved crest, arms with padded rests
  k.box(0.62, 0.1, 0.56, 0, 0.42, 0, GILT);
  k.box(0.56, 0.08, 0.5, 0, 0.52, 0.0, DAMASK);
  for (const [x, z] of [[-0.27, -0.24], [0.27, -0.24], [-0.27, 0.24], [0.27, 0.24]] as const) k.box(0.05, 0.44, 0.05, x, 0, z, GILT, [z > 0 ? 0.06 : -0.06, 0, x > 0 ? -0.05 : 0.05]);
  k.box(0.62, 0.62, 0.07, 0, 0.5, -0.27, GILT, [-0.1, 0, 0]);
  k.box(0.5, 0.5, 0.03, 0, 0.56, -0.23, DAMASK, [-0.1, 0, 0]);
  k.box(0.3, 0.08, 0.06, 0, 1.13, -0.33, GILT, [-0.1, 0, 0], 0.4);
  for (const s of [-1, 1]) {
    k.box(0.05, 0.22, 0.05, s * 0.3, 0.5, 0.18, GILT);
    k.box(0.07, 0.05, 0.46, s * 0.3, 0.72, -0.02, GILT);
    k.box(0.06, 0.03, 0.3, s * 0.3, 0.76, -0.02, DAMASK);
  }
}

export class Lehnstuhl {
  readonly group = new Group();
  private readonly mat = propMaterial();
  private x = Number.NaN;
  private z = Number.NaN;
  private yaw = 0;

  constructor() {
    const k = new Kit();
    lehnstuhl(k);
    this.group.add(new Mesh(k.build(), this.mat));
    this.group.name = 'scenery-lehnstuhl';
  }

  /** Follow Peter (x/z of the npc), staying 1.1 m behind his walking direction. */
  follow(px: number, pz: number, heightAt: (x: number, z: number) => number, dt: number): void {
    if (Number.isNaN(this.x)) {
      this.x = px + 0.9;
      this.z = pz + 0.6;
    }
    const dx = px - this.x;
    const dz = pz - this.z;
    const d = Math.hypot(dx, dz);
    if (d > 1.15) {
      const f = Math.min(1, (d - 1.1) / d);
      this.x += dx * f * Math.min(1, dt * 6);
      this.z += dz * f * Math.min(1, dt * 6);
      this.yaw = Math.atan2(-dx, -dz);
    }
    if (d > 12) {
      // he was moved (a teleport, a save): the chair goes with him
      this.x = px + 0.9;
      this.z = pz + 0.6;
    }
    this.group.position.set(this.x, heightAt(this.x, this.z), this.z);
    this.group.rotation.set(0, this.yaw, 0);
  }

  position(): [number, number] {
    return [this.x, this.z];
  }

  dispose(): void {
    this.group.removeFromParent();
    (this.group.children[0] as Mesh).geometry.dispose();
    this.mat.dispose();
  }
}
