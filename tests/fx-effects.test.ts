import { describe, expect, it } from 'vitest';
import { Heightfield } from '../src/world/heightfield';
import { area, centroid, distToOutline, pointInPolygon, polygonGap, polygonsOverlap, rng, type Poly } from '../src/systems/fx/geom';
import { OBLIVION_RULES, OblivionSim, oblivionRadius } from '../src/systems/fx/oblivion/sim';
import { drapeGrid } from '../src/systems/fx/scan/pulse';
import { buildTerrainCloud, hillshade } from '../src/systems/fx/shift/pointcloud';
import {
  SHIFT_DURATION,
  SHIFT_DURATION_REDUCED,
  SHIFT_MID,
  cutForLook,
  reducedCurves,
  ruinForCut,
  shiftCurves,
  waveRadius,
} from '../src/systems/fx/shift/timeline';
import { Quality } from '../src/systems/fx/quality';

const square: Poly = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

describe('fx geometry helpers', () => {
  it('point in polygon, outline distance, area, centroid', () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
    expect(pointInPolygon(11, 5, square)).toBe(false);
    expect(distToOutline(5, 1, square)).toBeCloseTo(1);
    expect(area(square)).toBeCloseTo(100);
    expect(centroid(square)).toEqual([5, 5]);
  });

  it('gap and overlap between polygons', () => {
    const right: Poly = square.map(([x, z]) => [x + 12, z]);
    const inside: Poly = square.map(([x, z]) => [x * 0.5 + 2, z * 0.5 + 2]);
    expect(polygonGap(square, right)).toBeCloseTo(2);
    expect(polygonsOverlap(square, right)).toBe(false);
    expect(polygonsOverlap(square, inside)).toBe(true);
  });

  it('seeded rng is deterministic and in [0, 1)', () => {
    const a = rng(5);
    const b = rng(5);
    const xs = Array.from({ length: 100 }, () => a());
    expect(xs).toEqual(Array.from({ length: 100 }, () => b()));
    expect(xs.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

describe('era-shift timeline', () => {
  it('maps cut heights to the palace shader uRuin (incl. rising above ground)', () => {
    expect(ruinForCut(cutForLook('intact'))).toBe(0);
    expect(ruinForCut(cutForLook('ruin'))).toBeCloseTo(1);
    // below the stubs: uRuin extrapolates past 1 (walls cut under the ground)
    expect(ruinForCut(cutForLook('hidden'))).toBeGreaterThan(1);
  });

  it('the scan wave starts slow at the player and races to the horizon', () => {
    expect(waveRadius(0)).toBeCloseTo(1.5);
    expect(waveRadius(1)).toBeGreaterThan(2000);
    for (let x = 0; x < 1; x += 0.05) expect(waveRadius(x + 0.05)).toBeGreaterThan(waveRadius(x));
  });

  it('runs veil out → full → in, with the brass flash at the midpoint', () => {
    expect(shiftCurves(0, 'hidden', 'intact').veil).toBe('none');
    expect(shiftCurves(0.6, 'hidden', 'intact').veil).toBe('out');
    expect(shiftCurves(SHIFT_MID, 'hidden', 'intact').veil).toBe('full');
    expect(shiftCurves(2.5, 'hidden', 'intact').veil).toBe('in');
    expect(shiftCurves(SHIFT_MID, 'hidden', 'intact').flash).toBeCloseTo(1);
    expect(shiftCurves(0.5, 'hidden', 'intact').flash).toBeLessThan(0.01);
    const end = shiftCurves(SHIFT_DURATION - 0.001, 'hidden', 'intact');
    expect(end.points).toBeLessThan(0.01);
    expect(end.veilAlpha).toBeLessThan(0.01);
    expect(end.whirl).toBe(0);
  });

  it('the palace rises out of the ground: point line first, walls behind it, intact at the end', () => {
    let lastCut = -Infinity;
    for (let t = 1.9; t <= 3.1; t += 0.1) {
      const c = shiftCurves(t, 'hidden', 'intact');
      expect(c.palCut).toBeGreaterThanOrEqual(lastCut - 1e-9);
      expect(c.palSolid).toBeLessThanOrEqual(c.palCut);
      lastCut = c.palCut;
    }
    expect(shiftCurves(SHIFT_DURATION - 0.01, 'hidden', 'intact').palSolid).toBe(cutForLook('intact'));
    expect(shiftCurves(SHIFT_DURATION - 0.01, 'intact', 'ruin').palSolid).toBe(cutForLook('ruin'));
    // intact → hidden: the walls are gone below the ground after the midpoint
    expect(shiftCurves(2.5, 'intact', 'hidden').palSolid).toBe(cutForLook('hidden'));
  });

  it('the land morphs around the midpoint, old trees sink, new trees grow', () => {
    expect(shiftCurves(1.0, 'hidden', 'intact').morph).toBe(0);
    expect(shiftCurves(2.5, 'hidden', 'intact').morph).toBe(1);
    expect(shiftCurves(0.2, 'hidden', 'intact').treesOut).toBe(0);
    expect(shiftCurves(1.6, 'hidden', 'intact').treesOut).toBe(1);
    expect(shiftCurves(2.0, 'hidden', 'intact').treesIn).toBe(0);
    expect(shiftCurves(3.3, 'hidden', 'intact').treesIn).toBeCloseTo(1, 1);
  });

  it('reduced motion is a plain crossfade', () => {
    expect(reducedCurves(0).alpha).toBe(0);
    expect(reducedCurves(0.7).alpha).toBe(1);
    expect(reducedCurves(SHIFT_DURATION_REDUCED).alpha).toBe(0);
  });
});

describe('Steinfraß (oblivion) meter', () => {
  it('fills over its seconds, faster when standing still, slower in gentle mode', () => {
    const run = (still: boolean, gentle: boolean) => {
      const s = new OblivionSim(100);
      let t = 0;
      while (!s.advance(0.5, still, gentle)) t += 0.5;
      return t + 0.5;
    };
    const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
    near(run(false, false), 100);
    near(run(true, false), 100 / OBLIVION_RULES.still);
    near(run(false, true), 100 * OBLIVION_RULES.gentle);
  });

  it('remembering drops the meter, never below zero', () => {
    const s = new OblivionSim(100);
    s.t = 0.5;
    s.remember(OBLIVION_RULES.clue);
    expect(s.t).toBeCloseTo(0.35);
    s.remember(1);
    expect(s.t).toBe(0);
  });

  it('the clear radius shrinks monotonically from far to near', () => {
    expect(oblivionRadius(0, 700, 14)).toBe(700);
    expect(oblivionRadius(1, 700, 14)).toBeCloseTo(14);
    for (let i = 0; i < 10; i++) expect(oblivionRadius((i + 1) / 10)).toBeLessThan(oblivionRadius(i / 10));
  });
});

describe('point clouds and the scan drape', () => {
  // 101×101 samples at 2 m: a ramp (era A) and a flat (era B)
  const grid = { cols: 101, rows: 101, cell: 2, x0: 0, z0: 0 };
  const ramp = new Heightfield(grid, new Float32Array(101 * 101).map((_, i) => (i % 101) * 0.5));
  const flat = new Heightfield(grid, new Float32Array(101 * 101).fill(10));

  it('terrain cloud: scanner rings with both era heights, clipped to the grid', () => {
    const g = buildTerrainCloud(ramp, flat, 100, 100, 60, 64, 1.1);
    const n = g.getAttribute('position').count;
    let rings = 0;
    for (let r = 2; r <= 60; r *= 1.1) rings++;
    expect(n).toBe(rings * 64);
    const p = g.getAttribute('position');
    const h2 = g.getAttribute('aH2');
    for (let i = 0; i < n; i += 37) {
      expect(p.getY(i)).toBeCloseTo(ramp.heightAt(p.getX(i), p.getZ(i)), 4);
      expect(h2.getX(i)).toBe(10);
      const s = g.getAttribute('aShade').getX(i);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
    // near the grid corner part of each ring falls outside and is dropped
    expect(buildTerrainCloud(ramp, flat, 0, 0, 60, 64, 1.1).getAttribute('position').count).toBeLessThan(n / 2);
  });

  it('hillshade: lit slopes facing north-west are brighter than flat ground facing away', () => {
    const facing = { normalAt: () => [-0.3, 0.9, -0.3] as [number, number, number] };
    const away = { normalAt: () => [0.3, 0.9, 0.3] as [number, number, number] };
    const level = { normalAt: () => [0, 1, 0] as [number, number, number] };
    expect(hillshade(facing, 0, 0)).toBeGreaterThan(hillshade(level, 0, 0));
    expect(hillshade(away, 0, 0)).toBeLessThan(hillshade(level, 0, 0));
  });

  it('drape grid follows the ground and reports local relief', () => {
    const d = drapeGrid(ramp, 100, 100, 20, 2);
    expect(d.n).toBe(21);
    expect(d.pos.length).toBe(d.n * d.n * 3);
    expect(d.index.length).toBe((d.n - 1) * (d.n - 1) * 6);
    expect(d.pos[1]).toBeCloseTo(ramp.heightAt(d.pos[0]!, d.pos[2]!) + 0.12, 4);
    // a plane has no local relief
    for (let i = 0; i < d.relief.length; i += 17) expect(Math.abs(d.relief[i]!)).toBeLessThan(1e-4);
    // a bump does
    const bump = new Heightfield(grid, new Float32Array(101 * 101).map((_, i) => (i === 50 * 101 + 50 ? 5 : 0)));
    const b = drapeGrid(bump, 100, 100, 10, 2);
    expect(Math.max(...b.relief)).toBeGreaterThan(4);
  });
});

describe('fx quality', () => {
  it('?fxq forces a level and turns auto off', () => {
    expect(new Quality('low').high).toBe(false);
    expect(new Quality('low').auto).toBe(false);
    const q = new Quality(null);
    expect(q.high).toBe(true);
    expect(q.auto).toBe(true);
  });
});
