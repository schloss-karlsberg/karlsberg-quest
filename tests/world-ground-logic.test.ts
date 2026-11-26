import { describe, expect, it, vi } from 'vitest';
import { GROUND } from '../src/data/types';
import { FootprintCollider } from '../src/world/collision';
import { generateTrees } from '../src/world/forest';
import { classAt, Heightfield } from '../src/world/heightfield';
import { buildPathRaster, rasterAt } from '../src/world/rasters';

describe('outdoor ground queries', () => {
  it('keeps slope, normal and clamped heights in world metres on a shifted grid', () => {
    const grid = { cols: 5, rows: 4, x0: -50, z0: 100, cell: 2 };
    // h = 10 + 0.5 * (x - x0) - (z - z0)
    const heights = Float32Array.from({ length: 20 }, (_, i) => 10 + i % 5 - 2 * Math.floor(i / 5));
    const hf = new Heightfield(grid, heights);
    expect(hf.gradientAt(-46, 102)).toEqual({ gx: 0.5, gz: -1 });
    const [nx, ny, nz] = hf.normalAt(-46, 102);
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1);
    expect(nx / ny).toBeCloseTo(-0.5);
    expect(nz / ny).toBeCloseTo(1);
    expect(hf.heightAt(-80, 103)).toBeCloseTo(7);
    expect(hf.heightAt(-45, 200)).toBeCloseTo(6.5);
  });

  it('keeps seeded trees off the path tread and water cells in both era datasets', () => {
    const grid = { cols: 35, rows: 35, cell: 2, x0: -36, z0: 20 };
    const hf = new Heightfield(grid, new Float32Array(grid.cols * grid.rows).fill(300));
    const ground = new Uint8Array(hf.data.length).fill(GROUND.forest);
    const canopy = new Float32Array(ground.length).fill(24);
    const water = ground.map((_, i) => i % grid.cols > 20 ? GROUND.water : GROUND.meadow);
    const paths = buildPathRaster(grid, { nodes: [-36, 315, 52, 32, 310, 52], edges: [0, 1, 2, 0] });
    expect(rasterAt(grid, paths, -10, 52)).toBeCloseTo(0.85);
    expect(rasterAt(grid, paths, -10, 48)).toBe(0);
    for (const source of [{ ground }, { canopy }]) {
      const trees = generateTrees({ ...source, hf, paths, noTreesOnWater: water, seed: 15, spacing: 3 });
      const positions: [number, number][] = [];
      for (const tile of trees.tiles.values()) {
        for (let i = 0; i < tile.length; i += 7) positions.push([tile[i]!, tile[i + 2]!]);
      }
      expect(positions.some(([, z]) => z < 48)).toBe(true);
      expect(positions.some(([, z]) => z > 56)).toBe(true);
      expect(positions.every(([x, z]) => rasterAt(grid, paths, x, z) <= 0.25)).toBe(true);
      expect(positions.every(([x, z]) => classAt(grid, water, x, z) !== GROUND.water)).toBe(true);
    }
  });

  it('lets an interior replace its footprint while independent scenery solids still block the opening', () => {
    const collider = new FootprintCollider([[[0, 0], [10, 0], [10, 10], [0, 10]]]);
    const overlay = { passable: new Set([0]), resolve: vi.fn((x: number, z: number) => ({ x, z, hit: false })) };
    collider.overlay = overlay;
    expect(collider.hits(5, 0, 0.35)).toBe(false);
    expect(overlay.resolve).toHaveBeenCalledWith(5, 0, 0.35);
    collider.setSolids('crate', [{ kind: 'circle', x: 5, z: 0, r: 1 }]);
    expect(collider.resolve(5, 0, 0.35)).toEqual({ x: 6.35, z: 0, hit: true });
    collider.enabled = false;
    expect(collider.hits(5, 0, 0.35)).toBe(true);
    collider.setSolids('crate', []);
    expect(collider.resolve(5, 0, 0.35)).toEqual({ x: 5, z: 0, hit: false });
  });
});

it('lets a circular body pass the corner of a rotated prop when it clears both faces', () => {
  const collider = new FootprintCollider([]);
  const axis = Math.SQRT1_2;
  collider.setSolids('cart', [{ kind: 'box', x: 10, z: -3, ux: axis, uz: axis, hu: 2, hv: 1 }]);
  // Probe diagonally beyond the corner in the cart's local frame.
  const at = (u: number, v: number): [number, number] => [10 + axis * (u - v), -3 + axis * (u + v)];
  const clear = at(2.25, 1.25);
  const clipped = at(2.15, 1.15);
  expect(collider.resolve(...clear, 0.3).hit).toBe(false);
  expect(collider.solidAt(...clear, 0.3)).toBe(false);
  expect(collider.hits(...clear, 0.3)).toBe(false);
  expect(collider.resolve(...clipped, 0.3).hit).toBe(true);
  expect(collider.solidAt(...clipped, 0.3)).toBe(true);
  expect(collider.hits(...clipped, 0.3)).toBe(true);
  expect(collider.solidAt(10, -3)).toBe(true);
});
