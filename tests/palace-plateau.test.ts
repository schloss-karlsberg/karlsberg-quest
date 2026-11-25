import { InstancedMesh, Matrix4, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import tour from '../content/routes/p-fuehrung.json';
import { GROUND } from '../src/data/types';
import { clearings, QUELLE } from '../src/systems/quelle/layout';
import { buildPlateauBatch, placePlateauProps, vergeHeight, type PlateauSource } from '../src/systems/scenery/palace-plateau';
import { Polyline } from '../src/systems/walk/route';
import type { Route } from '../src/systems/walk/types';
import { FootprintCollider } from '../src/world/collision';
import { Heightfield } from '../src/world/heightfield';
import { loadWorldData } from './world-data';

function realSource(): PlateauSource {
  const { h2025, ground, paths, graph, footprints } = loadWorldData();
  return { terrain: h2025, ground, paths, graph, footprintAt: (x, z) => footprints.footprintAt(x, z) };
}

function flatSource(x: number, z: number): PlateauSource {
  const grid = { x0: x - 4, z0: z - 4, cols: 5, rows: 5, cell: 2 };
  return {
    terrain: new Heightfield(grid, new Float32Array(25).fill(10)),
    ground: new Uint8Array(25).fill(GROUND.meadow),
    paths: new Float32Array(25),
    graph: { format: 'kq-paths-v1', kinds: [], nodes: [], edges: [], lines: [] },
    footprintAt: () => -1,
  };
}

describe('present-day palace plateau', () => {
  it('repeats the dry verge layout on the shipped terrain and follows the track graph', () => {
    const source = realSource();
    const props = placePlateauProps(source);
    expect(placePlateauProps(source)).toEqual(props);
    expect(props.filter((p) => p.kind === 'bench')).toHaveLength(2);
    expect(props.filter((p) => p.kind === 'wall')).toHaveLength(2);
    expect(props.filter((p) => p.kind === 'edge')).toHaveLength(6);
    expect(placePlateauProps({ ...source, graph: { ...source.graph, edges: [] } })).toEqual([]);

    const { pathAt, water, h2025 } = loadWorldData();
    const route = new Polyline((tour as Route).points);
    for (const { x, y, z, radius } of props) {
      expect(route.project(x, z).dist).toBeGreaterThanOrEqual(2 + radius);
      expect(Math.hypot(x - QUELLE.x, z - QUELLE.z)).toBeGreaterThanOrEqual(12 + radius);
      for (const [cx, cz, r] of clearings()) expect(Math.hypot(x - cx, z - cz)).toBeGreaterThanOrEqual(r + radius);
      for (const dx of [-radius, 0, radius]) {
        for (const dz of [-radius, 0, radius]) {
          expect(water(x + dx, z + dz)).toBe(false);
          expect(pathAt(x + dx, z + dz)).toBeLessThan(0.2);
          const rise = h2025.heightAt(x + dx, z + dz) - y;
          expect(rise).toBeGreaterThanOrEqual(0);
          expect(rise).toBeLessThanOrEqual(0.36);
        }
      }
    }
  });

  it('rejects the group trail and spring even when the ground samples are dry and flat', () => {
    const { x, z } = new Polyline((tour as Route).points).pointAt(35);
    expect(vergeHeight(flatSource(x, z), x, z, 0.5, 0.2)).toBeNull();
    expect(vergeHeight(flatSource(QUELLE.x, QUELLE.z), QUELLE.x, QUELLE.z, 0.5, 0.2)).toBeNull();
  });

  it('rejects a wet or paved raster cell at the footprint edge and ground with too much relief', () => {
    const x = 1300, z = -1120;
    const source = flatSource(x, z);
    expect(vergeHeight(source, x, z, 1.1, 0.2)).toBe(10);
    source.ground[13] = GROUND.water; // the centre is dry, but the east raster cell is wet
    expect(vergeHeight(source, x, z, 1.1, 0.2)).toBeNull();
    source.ground[13] = GROUND.meadow;
    source.paths[13] = 0.4;
    expect(vergeHeight(source, x, z, 1.1, 0.2)).toBeNull();
    source.paths[13] = 0;
    source.terrain.data[13] = 11;
    expect(vergeHeight(source, x, z, 1.1, 0.2)).toBeNull();
  });

  it('keeps one instance batch and the same solids when the preset changes', () => {
    const props = placePlateauProps(realSource());
    const batch = buildPlateauBatch(props);
    const scene = new Scene();
    scene.add(batch.mesh);
    const collider = new FootprintCollider([]);
    collider.setSolids('plateau', batch.solids);
    expect(scene.children).toEqual([batch.mesh]);
    expect(batch.mesh).toBeInstanceOf(InstancedMesh);
    expect(batch.mesh.geometry.getAttribute('position').count / 3).toBe(12);
    const pose = new Matrix4();
    batch.mesh.getMatrixAt(0, pose);
    for (const [level, cap] of [['low', 26], ['medium', 34], ['high', 34], ['low', 26]] as const) {
      batch.setLevel(level);
      expect(batch.mesh.count).toBeGreaterThan(0);
      expect(batch.mesh.count).toBeLessThanOrEqual(cap);
      if (level !== 'low') expect(batch.mesh.count).toBeGreaterThan(26);
      const current = new Matrix4();
      batch.mesh.getMatrixAt(0, current);
      expect(current.equals(pose)).toBe(true);
      expect(batch.solids).toHaveLength(4);
      for (const p of props) expect(collider.solidAt(p.x, p.z)).toBe(p.kind !== 'edge');
    }
    batch.dispose();
    expect(scene.children).toEqual([]);
  });
});
