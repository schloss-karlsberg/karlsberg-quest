import { describe, expect, it } from 'vitest';
import { GROUND } from '../src/data/types';
import { Heightfield } from '../src/world/heightfield';
import { findWaterBodies, shoreDistance } from '../src/world/water';
import { COVER_LOOKS, flowerChance, grassChance, hash2, reedChance, valueNoise } from '../src/world/vegetation/scatter';
import { GROUND_LAYERS, GROUND_TILE_M, BARK_LAYERS } from '../src/world/vegetation/strips';
import { PROP_KINDS } from '../src/world/vegetation/props';
import NATURE1 from '../src/assets/manifests/nature';
import NATURE2 from '../src/assets/manifests/nature2';
import { FAMILY_CROWN, TREE_VARIANTS, pickVariant, treeLevels, treeScaleY } from '../src/world/vegetation/trees';

const NATURE_ASSETS = [...NATURE1, ...NATURE2];

/** 12 × 8 grid, 2 m cells: a 4 × 3 pond at 10 m and a 2 × 2 puddle at 12 m on 15 m land. */
function pondWorld() {
  const cols = 12;
  const rows = 8;
  const h = new Float32Array(cols * rows).fill(15);
  const g = new Uint8Array(cols * rows).fill(GROUND.meadow);
  const set = (c: number, r: number, height: number) => {
    h[r * cols + c] = height;
    g[r * cols + c] = GROUND.water;
  };
  for (let r = 2; r < 5; r++) for (let c = 1; c < 5; c++) set(c, r, 10 + 0.05 * c);
  for (let r = 5; r < 7; r++) for (let c = 8; c < 10; c++) set(c, r, 12);
  return { hf: new Heightfield({ cols, rows, cell: 2, x0: 0, z0: 0 }, h), g, cols, rows };
}

describe('water bodies', () => {
  it('finds the flat pond, drops the tiny puddle and labels the cells', () => {
    const { hf, g, cols } = pondWorld();
    const { bodies, label } = findWaterBodies(g, hf, { minCells: 6 });
    expect(bodies).toHaveLength(1);
    const b = bodies[0]!;
    expect(b.cells).toBe(12);
    expect(b.level).toBeGreaterThanOrEqual(10);
    expect(b.level).toBeLessThan(10.3);
    expect([b.x0, b.z0, b.x1, b.z1]).toEqual([2, 4, 8, 8]);
    expect(label[3 * cols + 2]).toBe(0);
    expect(label[5 * cols + 8]).toBe(-1); // puddle below minCells
    expect(label[0]).toBe(-1);
  });

  it('splits a cascade into one body per level', () => {
    const cols = 10;
    const rows = 4;
    const h = new Float32Array(cols * rows).fill(20);
    const g = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        g[r * cols + c] = GROUND.water;
        h[r * cols + c] = c < 5 ? 10 : 11; // two terraces 1 m apart
      }
    const { bodies } = findWaterBodies(g, new Heightfield({ cols, rows, cell: 1, x0: 0, z0: 0 }, h), { minCells: 4 });
    expect(bodies.map((b) => b.level)).toEqual([10, 11]);
  });

  it('signed shore distance: positive inside, negative outside, zero-crossing at the edge', () => {
    const { hf, g, cols, rows } = pondWorld();
    const { label } = findWaterBodies(g, hf, { minCells: 6 });
    const box = { c0: 0, r0: 0, c1: cols - 1, r1: rows - 1 };
    const d = shoreDistance(label, cols, rows, 2, 0, box, 12);
    const at = (c: number, r: number) => d[r * cols + c]!;
    expect(at(2, 3)).toBeGreaterThan(0);
    expect(at(0, 0)).toBeLessThan(0);
    expect(at(2, 3)).toBeGreaterThanOrEqual(at(1, 3)); // deeper inside than at the edge
    expect(at(11, 7)).toBeLessThan(at(6, 3)); // further out is more negative
    for (const v of d) expect(Math.abs(v)).toBeLessThanOrEqual(12);
  });
});

describe('nature scatter', () => {
  const today = COVER_LOOKS.today!;
  it('is deterministic and in range', () => {
    expect(hash2(3, 4, 5)).toBe(hash2(3, 4, 5));
    expect(hash2(3, 4, 5)).not.toBe(hash2(4, 3, 5));
    for (let i = 0; i < 200; i++) {
      const v = hash2(i, -i * 7, 11);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = valueNoise(i * 0.37, i * 0.11, 3);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });

  it('grass grows on open meadow, not in water, on bare paths or on cliffs', () => {
    const meadow = { forest: 0, water: 0, bare: 0, lawn: 0 };
    expect(grassChance(meadow, 5, 0.6, today)).toBeGreaterThan(0.5);
    expect(grassChance({ ...meadow, water: 0.5 }, 5, 0.6, today)).toBe(0);
    expect(grassChance({ ...meadow, bare: 0.8 }, 5, 0.6, today)).toBe(0);
    expect(grassChance(meadow, 50, 0.6, today)).toBe(0);
    expect(grassChance({ ...meadow, forest: 1 }, 5, 0.6, today)).toBeLessThan(grassChance(meadow, 5, 0.6, today));
    // February 1793: a few dry stalks out of the snow
    expect(grassChance(meadow, 5, 0.6, COVER_LOOKS['1793-02']!)).toBeLessThan(0.3);
  });

  it('reeds stand in the shore band only; flowers only on meadows (none in the snow)', () => {
    expect(reedChance({ forest: 0, water: 0, bare: 0, lawn: 0 }, today)).toBe(0);
    expect(reedChance({ forest: 0, water: 0.3, bare: 0, lawn: 0 }, today)).toBeGreaterThan(0.5);
    expect(reedChance({ forest: 0, water: 1, bare: 0, lawn: 0 }, today)).toBe(0);
    expect(flowerChance({ forest: 0, water: 0, bare: 0, lawn: 0 }, COVER_LOOKS['1789']!)).toBeGreaterThan(0);
    expect(flowerChance({ forest: 0.8, water: 0, bare: 0, lawn: 0 }, COVER_LOOKS['1789']!)).toBe(0);
    expect(flowerChance({ forest: 0, water: 0, bare: 0, lawn: 0 }, COVER_LOOKS['1793-02']!)).toBe(0);
  });

  it('props keep off water and paths', () => {
    const look = today;
    for (const k of PROP_KINDS) {
      expect(k.chance({ forest: 1, water: 0.5, bare: 0, lawn: 0 }, 5, 1, look, 1)).toBe(0);
      expect(k.chance({ forest: 1, water: 0, bare: 0.9, lawn: 0 }, 5, 1, look, 1)).toBe(0);
    }
    const fern = PROP_KINDS.find((k) => k.id === 'fern')!;
    expect(fern.chance({ forest: 1, water: 0, bare: 0, lawn: 0 }, 5, 1, look, 1)).toBeGreaterThan(0);
    expect(fern.chance({ forest: 0, water: 0, bare: 0, lawn: 0 }, 5, 1, look, 1)).toBe(0);
  });
});

describe('nature assets', () => {
  it('texture strips match their layer tables', () => {
    expect(GROUND_LAYERS).toHaveLength(8);
    expect(GROUND_TILE_M).toHaveLength(GROUND_LAYERS.length);
    expect(BARK_LAYERS).toHaveLength(3);
  });

  it('every prop names a manifest model with a licence, none loads on the low tier by era prefetch', () => {
    for (const k of PROP_KINDS) {
      const e = NATURE_ASSETS.find((a) => a.id === k.asset);
      expect(e, k.asset).toBeTruthy();
      expect(e!.kind).toBe('model');
      expect(e!.licence).toMatch(/^(polyhaven|quaternius)\./);
      // the stump from the art foundation is also a scenery prop of 'today' / '1796'
      if (k.asset !== 'nature.stump.01') expect(e!.eras ?? []).toEqual([]);
    }
  });
});

describe('model trees (nature round 2)', () => {
  it('every variant exists in the set and families pick sensibly', () => {
    expect(TREE_VARIANTS.length).toBe(16);
    // spruce stands get pines, winter broadleaf goes bare, snags are dead in every season
    const fam = (k: number, v: number, snag: number, winter: boolean) => TREE_VARIANTS[pickVariant(k, v, snag, winter, 0.05)]!.family;
    expect(fam(1, 0.3, 0.9, false)).toBe(1);
    expect(fam(0, 0.3, 0.9, true)).toBe(3);
    expect(fam(0, 0.3, 0.01, false)).toBe(3);
  });

  it('LOD levels cross-fade in a band and stay complementary', () => {
    const out: number[] = [];
    treeLevels(10, 1, out);
    expect(out[0]).toBe(0);
    out.length = 0;
    treeLevels(400, 1, out);
    expect(out[0]).toBe(2);
    // inside the lod0/lod1 band both levels are drawn with complementary dither ranges
    out.length = 0;
    treeLevels(30, 1, out);
    expect(out.length).toBe(6);
    expect(out[0]).toBe(0);
    expect(out[3]).toBe(1);
    // the nearer level keeps [t, 2), the farther [0, t): every pixel is drawn by exactly one
    expect(out[1]).toBeCloseTo(out[5]!, 6);
  });

  it('the stand height maps the crown base and keeps the crown size', () => {
    const [k, max] = FAMILY_CROWN[0]!;
    const h = 28;
    const C = Math.min(h * k, max);
    expect(treeScaleY(0, 0.35, h, k, max)).toBeCloseTo(0, 6);
    expect(treeScaleY(1, 0.35, h, k, max)).toBeCloseTo(h, 4);
    // the crown above the base keeps its proportion (C per unit)
    expect(treeScaleY(0.9, 0.35, h, k, max) - treeScaleY(0.5, 0.35, h, k, max)).toBeCloseTo(0.4 * C, 4);
  });
});
