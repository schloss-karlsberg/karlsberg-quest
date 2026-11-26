import { expect, it } from 'vitest';
import { GROUND } from '../src/data/types';
import { Heightfield } from '../src/world/heightfield';
import { Sky } from '../src/world/sky';
import { Water } from '../src/world/water';

it('uses the shore of the occupied pond in a cascade, including after a freeze and thaw', () => {
  const grid = { cols: 22, rows: 16, x0: 10, z0: -50, cell: 2 };
  const heights = new Float32Array(grid.cols * grid.rows).fill(100);
  const ground = new Uint8Array(heights.length).fill(GROUND.meadow);
  for (let r = 3; r <= 12; r++) {
    for (let c = 2; c <= 14; c++) {
      const i = r * grid.cols + c;
      ground[i] = GROUND.water;
      if (c >= 8) heights[i] = 103;
    }
  }
  const hf = new Heightfield(grid, heights);
  const sky = new Sky();
  const water = new Water(ground, grid, { '2025': hf, '1789': hf }, sky);
  const depth = (col: number) => water.depthInside(grid.x0 + col * grid.cell, grid.z0 + 7 * grid.cell);
  expect(water.bodies.map(b => b.level)).toEqual([100, 103]);
  expect(depth(1)).toBe(-1); // first dry cell west of the lower pond
  expect(depth(1.5)).toBe(0);
  expect(depth(5)).toBeGreaterThan(4);
  expect(depth(9)).toBe(3); // inside the upper pond, also within the lower pond's shore band
  expect(depth(20)).toBe(-Infinity);
  water.setEra('1793-02', '1789');
  expect(depth(9)).toBe(-Infinity);
  water.setEra('1793-07', '1789');
  expect(depth(9)).toBe(3);
  water.dispose();
  sky.mesh.geometry.dispose();
  sky.material.dispose();
});
