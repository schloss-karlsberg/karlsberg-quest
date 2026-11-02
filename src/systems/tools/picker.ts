import { type BufferGeometry, type Mesh, type Object3D, Raycaster, Vector3 } from 'three';
import type { GameContext } from '../../core/context';
import { ERA_INFO } from '../../core/era';
import { type V3, rayAabb, rayHeightfield, rayTriangle } from './geom';

export interface PickHit {
  point: V3;
  /** 'terrain' | 'palace' | 'object' */
  on: 'terrain' | 'palace' | 'object';
  /** Palace building id (footprint id) when on the palace. */
  building?: string;
  distance: number;
}

interface BuildingTris {
  id: string;
  min: V3;
  max: V3;
  tris: Uint32Array;
  /** Base height (ruin cut-off reference). */
  base: number;
}

/**
 * Picks what the measuring tape touches: the terrain (heightfield march), the 1789 palace (its
 * merged mesh split per building into AABB + triangle lists on first use, so a ray tests only
 * the buildings it passes), and any scene mesh flagged `userData.measurable = true` (interiors,
 * colliders of later features; plain three.js raycast).
 */
export class Picker {
  private buildings: BuildingTris[] | null = null;
  private positions: Float32Array | null = null;
  private readonly ray = new Raycaster();

  constructor(private readonly ctx: GameContext) {}

  private buildPalace(): void {
    const mesh = this.ctx.world.palace.object.getObjectByName('palace-merged') as Mesh | undefined;
    if (!mesh) return;
    const g = mesh.geometry as BufferGeometry;
    const pos = g.getAttribute('position');
    const bld = g.getAttribute('aBld');
    if (!pos || !bld) return;
    this.positions = pos.array as Float32Array;
    const idx = g.index ? (g.index.array as ArrayLike<number>) : null;
    const triCount = idx ? idx.length / 3 : pos.count / 3;
    const per = new Map<number, number[]>();
    for (let t = 0; t < triCount; t++) {
      const a = idx ? idx[t * 3]! : t * 3;
      const b = bld.getX(a);
      let list = per.get(b);
      if (!list) per.set(b, (list = []));
      list.push(a, idx ? idx[t * 3 + 1]! : t * 3 + 1, idx ? idx[t * 3 + 2]! : t * 3 + 2);
    }
    const p = this.positions;
    const out: BuildingTris[] = [];
    for (const [b, list] of per) {
      const min = { x: Infinity, y: Infinity, z: Infinity };
      const max = { x: -Infinity, y: -Infinity, z: -Infinity };
      for (const v of list) {
        min.x = Math.min(min.x, p[v * 3]!);
        min.y = Math.min(min.y, p[v * 3 + 1]!);
        min.z = Math.min(min.z, p[v * 3 + 2]!);
        max.x = Math.max(max.x, p[v * 3]!);
        max.y = Math.max(max.y, p[v * 3 + 1]!);
        max.z = Math.max(max.z, p[v * 3 + 2]!);
      }
      const info = this.ctx.world.palace.buildings[b];
      out.push({ id: info?.id ?? `#${b}`, min, max, tris: Uint32Array.from(list), base: info?.baseH ?? min.y });
    }
    this.buildings = out;
  }

  /** Nearest palace hit (respects hidden palace and the ruin cut-off). */
  palace(o: V3, dir: V3, maxDist: number): PickHit | null {
    const mode = ERA_INFO[this.ctx.era.current].palace;
    if (mode === 'hidden' || !this.ctx.world.palace.object.visible) return null;
    if (!this.buildings) this.buildPalace();
    const bs = this.buildings;
    const p = this.positions;
    if (!bs || !p) return null;
    let best = maxDist;
    let hitB: BuildingTris | null = null;
    // order buildings by AABB entry so we can stop early
    const cand: [number, BuildingTris][] = [];
    for (const b of bs) {
      const t = rayAabb(o, dir, b.min, b.max);
      if (t !== null && t < best) cand.push([t, b]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [entry, b] of cand) {
      if (entry > best) break;
      const tr = b.tris;
      for (let i = 0; i < tr.length; i += 3) {
        const t = rayTriangle(o, dir, p, tr[i]!, tr[i + 1]!, tr[i + 2]!);
        if (t === null || t >= best) continue;
        // ruin: walls are cut to stubs in the shader (≈ base + 0.8…4 m); don't hit what's not drawn
        if (mode === 'ruin' && o.y + dir.y * t > b.base + 2.2) continue;
        best = t;
        hitB = b;
      }
    }
    if (!hitB) return null;
    return { point: { x: o.x + dir.x * best, y: o.y + dir.y * best, z: o.z + dir.z * best }, on: 'palace', building: hitB.id, distance: best };
  }

  /** Meshes other features flagged `userData.measurable` (interiors). */
  objects(o: V3, dir: V3, maxDist: number): PickHit | null {
    const list: Object3D[] = [];
    this.ctx.scene.traverseVisible((obj) => {
      if ((obj.userData as { measurable?: boolean }).measurable && (obj as Mesh).isMesh) list.push(obj);
    });
    if (!list.length) return null;
    this.ray.set(new Vector3(o.x, o.y, o.z), new Vector3(dir.x, dir.y, dir.z));
    this.ray.far = maxDist;
    const hit = this.ray.intersectObjects(list, false)[0];
    if (!hit) return null;
    return { point: { x: hit.point.x, y: hit.point.y, z: hit.point.z }, on: 'object', distance: hit.distance };
  }

  terrain(o: V3, dir: V3, maxDist: number): PickHit | null {
    const hf = this.ctx.world.heightfield;
    const t = rayHeightfield(o, dir, (x, z) => hf.heightAt(x, z), maxDist);
    if (t === null) return null;
    const x = o.x + dir.x * t;
    const z = o.z + dir.z * t;
    return { point: { x, y: hf.heightAt(x, z), z }, on: 'terrain', distance: t };
  }

  /** Nearest of terrain, palace and flagged objects. `withPalace=false` skips the triangle test (live preview throttling). */
  pick(o: V3, dir: V3, maxDist = 600, withPalace = true): PickHit | null {
    let best: PickHit | null = this.terrain(o, dir, maxDist);
    const lim = best ? best.distance : maxDist;
    if (withPalace) {
      const p = this.palace(o, dir, lim);
      if (p && (!best || p.distance < best.distance)) best = p;
    }
    const ob = this.objects(o, dir, best ? best.distance : maxDist);
    if (ob && (!best || ob.distance < best.distance)) best = ob;
    return best;
  }

  /** Ray through the screen centre (crosshair). */
  centreRay(): { o: V3; dir: V3 } {
    const cam = this.ctx.camera;
    const d = new Vector3();
    cam.getWorldDirection(d);
    return { o: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, dir: { x: d.x, y: d.y, z: d.z } };
  }
}
