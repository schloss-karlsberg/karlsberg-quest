/**
 * Builds one set (props + workers + smoke + glows + solids) into a three.js group. Sets are
 * described in sets.ts as plain functions over this builder; coordinates are the local frame,
 * facings in compass degrees (0 = north, 90 = east) like the debug hooks.
 */
import { Color, Group, InstancedBufferAttribute, Mesh, type ShaderMaterial } from 'three';
import type { Solid } from '../../world/collision';
import { Kit } from './kit';
import { glowMaterial, propMaterial } from './material';
import { type ModelPlacement, placeMatrix } from './models';
import { type SignSpec, signMesh } from './signs';
import { instancedQuad, type SmokeSource, smokeMesh } from './smoke';
import { type WorkerSpec, STRIKE_PERIOD, workersMesh } from './workers';

/** Compass degrees (0 north, 90 east) → kit yaw (local +z points that way). */
export const face = (deg: number): number => Math.PI - (deg * Math.PI) / 180;

export interface Glow {
  x: number;
  y: number;
  z: number;
  size: number;
  color: Color;
}

export interface Strike {
  x: number;
  y: number;
  z: number;
  period: number;
  phase: number;
}

export interface BuiltSet {
  group: Group;
  solids: Solid[];
  strikes: Strike[];
  materials: ShaderMaterial[];
  /** CC0 prop models to instance into `group` (medium / high tier; empty on low). */
  models: ModelPlacement[];
}

export class SetBuilder {
  readonly kit = new Kit();
  readonly solids: Solid[] = [];
  readonly workers: WorkerSpec[] = [];
  readonly smoke: SmokeSource[] = [];
  readonly glows: Glow[] = [];
  readonly signs: SignSpec[] = [];
  readonly models: ModelPlacement[] = [];
  /** Extra meshes with their own shader (the Bleiche's swaying linen), added to the set's group as they are. */
  readonly extras: Mesh[] = [];

  /**
   * @param detailed place CC0 prop models (`model()`); false (low tier, tests) builds the
   *   procedural fallbacks into the kit instead.
   * @param high also place the costly models marked `high` (high tier); false builds their
   *   fallbacks on medium too.
   */
  constructor(
    readonly heightAt: (x: number, z: number) => number,
    readonly detailed = false,
    readonly high = false,
  ) {}

  /**
   * A CC0 prop model at the kit's current frame (set by `at()` / `kit.place()`), offset by x/y/z
   * and yawed (radians) / scaled in that frame. Without `detailed` (or, for a model marked `high`,
   * without `high`), `fallback` builds the old procedural prop into the kit at the same frame
   * instead.
   */
  model(id: string, fallback?: () => void, o: { x?: number; y?: number; z?: number; yaw?: number; scale?: number; tiltX?: number; tiltZ?: number; high?: boolean } = {}): this {
    if (!this.detailed || (o.high && !this.high)) {
      fallback?.();
      return this;
    }
    const m = this.kit.frameMatrix().multiply(placeMatrix(o.x ?? 0, o.y ?? 0, o.z ?? 0, o.yaw ?? 0, o.scale ?? 1, o.tiltX ?? 0, o.tiltZ ?? 0));
    this.models.push({ id, matrix: m });
    return this;
  }

  /** Same as `model` at a world position (yaw radians). */
  modelAt(id: string, x: number, y: number, z: number, yaw = 0, scale = 1): this {
    if (this.detailed) this.models.push({ id, matrix: placeMatrix(x, y, z, yaw, scale) });
    return this;
  }

  /** Place the kit at x/z on the ground (lowest of a few samples around, `sink` m deeper). */
  at(x: number, z: number, deg = 0, spread = 0.8, sink = 0.05): number {
    let y = Infinity;
    for (const [dx, dz] of [[0, 0], [spread, 0], [-spread, 0], [0, spread], [0, -spread]] as const) y = Math.min(y, this.heightAt(x + dx, z + dz));
    this.kit.place(x, y - sink, z, face(deg));
    return y - sink;
  }

  circle(x: number, z: number, r: number): this {
    this.solids.push({ kind: 'circle', x, z, r });
    return this;
  }

  /** Oriented box solid: centre, facing (compass deg) of its local +z, half width (x) / depth (z). */
  box(x: number, z: number, deg: number, hw: number, hd: number): this {
    const yaw = face(deg);
    // local x axis in world: (cos yaw, −sin yaw)
    this.solids.push({ kind: 'box', x, z, ux: Math.cos(yaw), uz: -Math.sin(yaw), hu: hw, hv: hd });
    return this;
  }

  worker(w: Omit<WorkerSpec, 'yaw'> & { deg: number }): this {
    this.workers.push({ ...w, yaw: face(w.deg) });
    return this;
  }

  /** A lettered board / framed picture face at world x/y/z facing compass `deg` (see signs.ts). */
  sign(x: number, y: number, z: number, deg: number, w: number, h: number, o: Omit<SignSpec, 'x' | 'y' | 'z' | 'yaw' | 'w' | 'h'>): this {
    this.signs.push({ x, y, z, yaw: face(deg), w, h, ...o });
    return this;
  }

  glow(x: number, y: number, z: number, size: number, color: Color): this {
    this.glows.push({ x, y, z, size, color });
    return this;
  }

  build(name: string): BuiltSet {
    const group = new Group();
    group.name = `scenery-${name}`;
    const materials: ShaderMaterial[] = [];
    if (!this.kit.empty) {
      const m = propMaterial();
      const mesh = new Mesh(this.kit.build(), m);
      mesh.name = `scenery-${name}-props`;
      mesh.userData.measurable = true;
      group.add(mesh);
      materials.push(m);
    }
    const strikes: Strike[] = [];
    if (this.workers.length) {
      const mesh = workersMesh(this.workers, this.heightAt);
      group.add(mesh);
      materials.push(mesh.material as ShaderMaterial);
      this.workers.forEach((w, wi) => {
        const period = STRIKE_PERIOD[w.pose];
        if (!period) return;
        const yaw = w.yaw;
        const x = w.x + Math.sin(yaw) * 1.2;
        const z = w.z + Math.cos(yaw) * 1.2;
        strikes.push({ x, y: (w.y ?? this.heightAt(x, z)) + 0.3, z, period, phase: w.phase ?? wi * 0.77 });
      });
    }
    if (this.smoke.length) {
      const mesh = smokeMesh(this.smoke);
      group.add(mesh);
      materials.push(mesh.material as ShaderMaterial);
    }
    for (const mesh of this.extras) {
      group.add(mesh);
      materials.push(mesh.material as ShaderMaterial);
    }
    const signs = signMesh(this.signs);
    if (signs) {
      signs.name = `scenery-${name}-signs`;
      group.add(signs);
      materials.push(signs.material as ShaderMaterial);
    }
    if (this.glows.length) {
      const g = instancedQuad();
      const a = new Float32Array(this.glows.length * 4);
      const t = new Float32Array(this.glows.length * 4);
      this.glows.forEach((gl, i) => {
        a.set([gl.x, gl.y, gl.z, gl.size], i * 4);
        t.set([gl.color.r, gl.color.g, gl.color.b, i * 0.37], i * 4);
      });
      g.setAttribute('aSprite', new InstancedBufferAttribute(a, 4));
      g.setAttribute('aTint', new InstancedBufferAttribute(t, 4));
      g.instanceCount = this.glows.length;
      const m = glowMaterial(1);
      const mesh = new Mesh(g, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = 9;
      mesh.name = `scenery-${name}-glow`;
      group.add(mesh);
      materials.push(m);
    }
    return { group, solids: this.solids, strikes, materials, models: this.models };
  }
}
