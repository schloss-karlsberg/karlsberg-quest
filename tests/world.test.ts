import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeCanopy, decodeH1789, decodeH2025, quantToMetres } from '../src/data/decode';
import { Heightfield, classAt } from '../src/world/heightfield';
import { FootprintCollider, pointInRing, type Ring } from '../src/world/collision';
import { generateTrees } from '../src/world/forest';
import { GROUND, type TerrainMeta } from '../src/data/types';

const grid = { cols: 4, rows: 3, cell: 2, x0: 10, z0: -4 };
// h = x + 2z-ish plane in sample space: value = c + 10·r
const plane = new Float32Array(Array.from({ length: 12 }, (_, i) => (i % 4) + 10 * Math.floor(i / 4)));

describe('Heightfield', () => {
  const hf = new Heightfield(grid, plane);

  it('samples exactly at nodes and bilinearly between them', () => {
    expect(hf.heightAt(10, -4)).toBe(0);
    expect(hf.heightAt(16, 0)).toBe(23);
    expect(hf.heightAt(11, -4)).toBeCloseTo(0.5);
    expect(hf.heightAt(11, -3)).toBeCloseTo(0.5 + 5);
  });

  it('clamps outside the grid and reports bounds/slope', () => {
    expect(hf.heightAt(-1000, -1000)).toBe(0);
    expect(hf.heightAt(1000, 1000)).toBe(23);
    expect(hf.bounds).toEqual({ x0: 10, z0: -4, x1: 16, z1: 0 });
    expect(hf.inBounds(12, -2)).toBe(true);
    expect(hf.inBounds(17, -2)).toBe(false);
    const g = hf.gradientAt(13, -2);
    expect(g.gx).toBeCloseTo(0.5);
    expect(g.gz).toBeCloseTo(5);
    const n = hf.normalAt(13, -2);
    expect(Math.hypot(...n)).toBeCloseTo(1);
    expect(hf.slopeDeg(13, -2)).toBeCloseTo((Math.atan(Math.hypot(0.5, 5)) * 180) / Math.PI);
    expect(() => new Heightfield(grid, new Float32Array(3))).toThrow();
  });

  it('classAt does nearest-cell lookup', () => {
    const cls = new Uint8Array(12).fill(GROUND.meadow);
    cls[5] = GROUND.forest; // c=1, r=1 → x=12, z=-2
    expect(classAt(grid, cls, 12.4, -2.3)).toBe(GROUND.forest);
    expect(classAt(grid, cls, 10, -4)).toBe(GROUND.meadow);
    expect(classAt(grid, cls, 99, 99)).toBe(0);
  });
});

describe('terrain decoders', () => {
  /** Encoder mirroring scripts/prepare-data.ts (int16 left-delta, first column vs. row above). */
  function encodeH2025(q: Uint16Array, cols: number, rows: number): Uint8Array {
    const d = new Int16Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const prev = c > 0 ? q[i - 1]! : r > 0 ? q[i - cols]! : 0;
        d[i] = ((q[i]! - prev) << 16) >> 16;
      }
    }
    return new Uint8Array(d.buffer);
  }

  it('round-trips heights through delta + zlib', () => {
    const cols = 7;
    const rows = 5;
    const q = new Uint16Array(cols * rows);
    for (let i = 0; i < q.length; i++) q[i] = (i * 7919 + 30000) % 65535; // big jumps exercise wrap-around
    const packed = deflateSync(encodeH2025(q, cols, rows));
    const back = decodeH2025(new Uint8Array(inflateSync(packed)), { cols, rows });
    expect([...back]).toEqual([...q]);

    const diff = new Int16Array(q.length).map((_, i) => (i % 3) - 1);
    const q1789 = decodeH1789(new Uint8Array(diff.buffer), back);
    expect(q1789[0]).toBe((q[0]! - 1) & 0xffff);
    expect(q1789[1]).toBe(q[1]);

    const m = quantToMetres(new Uint16Array([0, 100, 12345]), { hMin: 200, heightScale: 0.01 });
    expect([...m].map((v) => +v.toFixed(2))).toEqual([200, 201, 323.45]);
    expect([...decodeCanopy(new Uint8Array([0, 4, 100]))]).toEqual([0, 1, 25]);
    expect(() => decodeH2025(new Uint8Array(4), { cols, rows })).toThrow();
  });

  it('decodes the prepared public/data terrain consistently', () => {
    const dir = new URL('../public/data/terrain/', import.meta.url);
    const meta = JSON.parse(readFileSync(new URL('meta.json', dir), 'utf8')) as TerrainMeta;
    const q = decodeH2025(new Uint8Array(inflateSync(readFileSync(new URL('h2025.u16.deflate', dir)))), meta);
    const h = quantToMetres(q, meta);
    let mn = Infinity;
    let mx = -Infinity;
    for (const v of h) {
      mn = Math.min(mn, v);
      mx = Math.max(mx, v);
    }
    // Karlsberg area: valley ~230 m, summit ~383 m
    expect(mn).toBeGreaterThan(200);
    expect(mx).toBeLessThan(420);
    expect(mx - mn).toBeGreaterThan(80);
  });
});

describe('FootprintCollider', () => {
  const square: Ring = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  const col = new FootprintCollider([square]);

  it('point-in-polygon', () => {
    expect(pointInRing(5, 5, square)).toBe(true);
    expect(pointInRing(11, 5, square)).toBe(false);
    expect(col.footprintAt(5, 5)).toBe(0);
    expect(col.footprintAt(-3, 5)).toBe(-1);
  });

  it('pushes a circle out of walls and out of the interior', () => {
    const a = col.resolve(-0.2, 5, 0.4);
    expect(a.hit).toBe(true);
    expect(a.x).toBeCloseTo(-0.4);
    const b = col.resolve(1, 5, 0.4); // inside, nearest edge is x=0
    expect(b.hit).toBe(true);
    expect(b.x).toBeLessThanOrEqual(-0.39);
    const c = col.resolve(-5, 5, 0.4);
    expect(c).toEqual({ x: -5, z: 5, hit: false });
  });
});

describe('generateTrees', () => {
  const cols = 65;
  const rows = 65;
  const hf = new Heightfield({ cols, rows, cell: 2, x0: 0, z0: 0 }, new Float32Array(cols * rows).fill(300));
  const canopy = new Float32Array(cols * rows).fill(25);

  it('is deterministic for a seed and respects the source rasters', () => {
    const a = generateTrees({ hf, canopy, spacing: 8, seed: 1 });
    const b = generateTrees({ hf, canopy, spacing: 8, seed: 1 });
    const c = generateTrees({ hf, canopy, spacing: 8, seed: 2 });
    expect(a.count).toBeGreaterThan(20);
    expect(a.count).toBe(b.count);
    expect([...a.tiles.keys()]).toEqual([...b.tiles.keys()]);
    for (const [k, t] of a.tiles) expect([...t]).toEqual([...b.tiles.get(k)!]);
    const flat = (r: typeof a) => [...r.tiles.values()].flatMap((t) => [...t]);
    expect(flat(a)).not.toEqual(flat(c));
    for (let i = 0; i < flat(a).length; i += 7) expect(flat(a)[i + 1]).toBe(300);

    const none = generateTrees({ hf, canopy: new Float32Array(cols * rows), spacing: 8, seed: 1 });
    expect(none.count).toBe(0);
    const ground = new Uint8Array(cols * rows).fill(GROUND.forest);
    expect(generateTrees({ hf, ground, spacing: 8, seed: 1 }).count).toBeGreaterThan(20);
  });
});
