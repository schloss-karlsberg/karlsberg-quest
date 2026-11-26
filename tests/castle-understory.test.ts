import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { InstancedMesh, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import tour from '../content/routes/p-fuehrung.json';
import { decodeCanopy } from '../src/data/decode';
import { GROUND } from '../src/data/types';
import { BROOK_HALF, brookLine, clearings, QUELLE, TRAIL, trailLine } from '../src/systems/quelle/layout';
import { BAUWAGEN_SITE } from '../src/systems/scenery/bauwagen';
import { createCastleUnderstory, placeUnderstory, type UnderstorySource } from '../src/systems/scenery/castle-understory';
import { placePlateauProps } from '../src/systems/scenery/palace-plateau';
import { Polyline } from '../src/systems/walk/route';
import { rasterAt } from '../src/world/rasters';
import { loadWorldData } from './world-data';

const SITES = [
  ['weiher', 897.2, -845.3],
  ['quelle', QUELLE.x, QUELLE.z],
  ['plateau', 1216, -1114],
] as const;

let cached: UnderstorySource | undefined;
function source(): UnderstorySource {
  if (cached) return cached;
  const { h2025, ground, paths, graph, footprints } = loadWorldData();
  const canopy = decodeCanopy(inflateSync(readFileSync(new URL('../public/data/terrain/canopy.u8.deflate', import.meta.url))));
  return cached = { terrain: h2025, ground, paths, graph, canopy, footprintAt: (x, z) => footprints.footprintAt(x, z) };
}

describe('present-day castle understory', () => {
  it.each(SITES)('selects reproducible, dry %s plants with room for the tour and fittings', (site, cx, cz) => {
    const src = source();
    const plants = placeUnderstory(src, site);
    expect(placeUnderstory(src, site)).toEqual(plants);
    const route = new Polyline(tour.points as [number, number][]);
    const brook = brookLine((x, z) => src.terrain.heightAt(x, z), 'today');
    const trail = TRAIL.flatMap((strand) => trailLine(strand));
    const blocks = placePlateauProps(src);
    const keepClear = [
      ...clearings(),
      ...tour.stops.map(({ x, z }) => [x, z, 4] as const),
      ...blocks.map(({ x, z, radius }) => [x, z, radius] as const),
      ...brook.map(([x, z]) => [x, z, BROOK_HALF + 0.5] as const),
      ...trail.map(({ x, z, half }) => [x, z, half + 0.3] as const),
      [BAUWAGEN_SITE.x, BAUWAGEN_SITE.z, BAUWAGEN_SITE.clearing],
      [QUELLE.x, QUELLE.z, 12],
      [896.3, -850.3, 2.2], [903.1, -850.3, 2.2],
    ] as const;

    expect(plants.filter((p) => p.kind === 'shrub' && p.low)).toHaveLength(5);
    expect(plants.some((p) => p.kind === 'seedHeads' && p.low)).toBe(true);
    expect(plants.length).toBeLessThanOrEqual(24);
    for (const [i, p] of plants.entries()) {
      expect(Math.hypot(p.x - cx, p.z - cz)).toBeLessThanOrEqual(28);
      expect(route.project(p.x, p.z).dist).toBeGreaterThanOrEqual(2 + p.radius);
      for (const [x, z, r] of keepClear) expect(Math.hypot(p.x - x, p.z - z)).toBeGreaterThanOrEqual(r + p.radius);
      for (const q of plants.slice(0, i)) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(p.radius + q.radius);

      const { terrain, ground, paths, canopy } = src;
      const col = (x: number) => Math.round((x - terrain.x0) / terrain.cell);
      const row = (z: number) => Math.round((z - terrain.z0) / terrain.cell);
      for (let r = row(p.z - p.radius); r <= row(p.z + p.radius); r++) {
        for (let c = col(p.x - p.radius); c <= col(p.x + p.radius); c++) {
          expect(ground[r * terrain.cols + c]).not.toBe(GROUND.water);
          expect(paths[r * terrain.cols + c]).toBeLessThan(0.2);
        }
      }
      const heights = [-4, 0, 4].flatMap((dx) => [-4, 0, 4].map((dz) => rasterAt(terrain, canopy, p.x + dx, p.z + dz)));
      const tallest = Math.max(...heights);
      if (p.kind === 'seedHeads') {
        expect(heights[4]).toBeLessThanOrEqual(18);
        if (heights[4]! >= 4) expect(tallest - heights[4]!).toBeGreaterThanOrEqual(9);
      } else {
        expect(tallest - Math.min(...heights)).toBeGreaterThanOrEqual(7);
      }
      expect(p.y).toBe(terrain.heightAt(p.x, p.z));
      expect(terrain.slopeDeg(p.x, p.z)).toBeLessThanOrEqual(p.kind === 'shrub' ? 28 : 20);
    }
  });

  it('rejects uniform high canopy, inundated ground and blocked path cells', () => {
    const src = source();
    expect(placeUnderstory({ ...src, canopy: new Float32Array(src.canopy.length).fill(30) }, 'plateau')).toEqual([]);
    expect(placeUnderstory({ ...src, ground: new Uint8Array(src.ground.length).fill(GROUND.water) }, 'plateau')).toEqual([]);
    expect(placeUnderstory({ ...src, paths: new Float32Array(src.paths.length).fill(1) }, 'plateau')).toEqual([]);
  });

  it('shows one capped batch with the same core transforms across presets and travel', () => {
    const src = source();
    const layer = createCastleUnderstory(src);
    const visible = () => layer.object.children.filter((m) => m.visible) as InstancedMesh[];
    layer.update(false, 'today', 'low', 897.2, -845.3);
    expect(layer.object.children).toHaveLength(0);

    for (const [site, x, z] of SITES) {
      layer.update(true, 'today', 'low', x, z);
      expect(visible()).toHaveLength(1);
      const mesh = visible()[0]!;
      expect(mesh).toBeInstanceOf(InstancedMesh);
      expect(mesh.name).toBe(`castle-understory-${site}`);
      expect(mesh.userData.noShadow).toBe(true);
      const triangles = mesh.geometry.getAttribute('position').count / 3;
      const lowCount = mesh.count;
      expect(lowCount * triangles).toBeLessThanOrEqual(780);
      expect(lowCount).toBeGreaterThan(0);
      const pose = new Matrix4();
      const updated = new Matrix4();
      mesh.getMatrixAt(0, pose);
      for (const level of ['medium', 'high'] as const) {
        layer.update(true, 'today', level, x, z);
        expect(visible()).toEqual([mesh]);
        expect(mesh.count).toBeGreaterThan(lowCount);
        expect(mesh.count * triangles).toBeLessThanOrEqual(2680);
        mesh.getMatrixAt(0, updated);
        expect(updated.equals(pose)).toBe(true);
      }
      const plants = placeUnderstory(src, site);
      const position = mesh.geometry.getAttribute('position');
      const world = new Vector3();
      for (let instance = 0; instance < mesh.count; instance++) {
        mesh.getMatrixAt(instance, updated);
        for (let vertex = 0; vertex < position.count; vertex++) {
          world.fromBufferAttribute(position, vertex).applyMatrix4(updated);
          expect(plants.some((p) => Math.hypot(world.x - p.x, world.z - p.z) <= p.radius)).toBe(true);
        }
      }
      layer.update(true, '1789', 'high', x, z);
      expect(visible()).toEqual([]);
      layer.update(true, 'today', 'low', x, z);
      expect(visible()).toEqual([mesh]);
      expect(mesh.count).toBe(lowCount);
    }
    layer.update(true, 'today', 'low', BAUWAGEN_SITE.x, BAUWAGEN_SITE.z);
    expect(visible()).toEqual([]);
    layer.dispose();
    expect(layer.object.children).toEqual([]);
  });
});
