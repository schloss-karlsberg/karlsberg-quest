/**
 * The Bleiche (1789 laundry green by the brook, src/systems/bleiche + scenery/bleiche.ts) on the
 * real terrain: inside the data, on open meadow, clear of the brook bed, the lines and their linen
 * in order, the coat where the story needs it; and the Gardisten's pike (court/props.ts).
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  BLEICHE,
  clearings,
  COAT,
  COAT_ITEM,
  COAT_REACH,
  COAT_XZ,
  coatWorld,
  EXTENT,
  ITEMS,
  LIESE,
  LIESE_FREE,
  LINES,
  mown,
  PIECES,
  ropeAt,
  ropeWorld,
  toLocal,
  toWorld,
  TUB_SPOT,
} from '../src/systems/bleiche/layout';
import { PIKE_LENGTH, pikeGeometry } from '../src/systems/court/props';
import { BROOK_OSM } from '../src/systems/quelle/layout';
import { bleicheSet, coatVisible, setCoatVisible } from '../src/systems/scenery/bleiche';
import { SetBuilder } from '../src/systems/scenery/builder';
import { KEEP_CLEAR } from '../src/systems/travel/pois';
import { FootprintCollider } from '../src/world/collision';
import { loadPalaceData } from './interiors-fixture';

const { h1789 } = loadPalaceData();
const heightAt = (x: number, z: number) => h1789.heightAt(x, z);
const meta = JSON.parse(readFileSync(new URL('../public/data/terrain/meta.json', import.meta.url), 'utf8')) as { cols: number; cell: number; origin: { x: number; z: number } };
const ground = new Uint8Array(inflateSync(readFileSync(new URL('../public/data/terrain/ground.u8.deflate', import.meta.url))));
const groundAt = (x: number, z: number) => ground[Math.round((z - meta.origin.z) / meta.cell) * meta.cols + Math.round((x - meta.origin.x) / meta.cell)];
const FOREST = 6;
const WATER = 5;

/** Distance from x/z to a polyline. */
function lineDist(x: number, z: number, line: readonly (readonly [number, number])[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i]!;
    const [bx, bz] = line[i + 1]!;
    const vx = bx - ax;
    const vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return best;
}

/** Every place on the green something stands or lies, in local u/w (posts, pieces, the flat linen's corners, the hanging linen's ends). */
function footprint(): { name: string; u: number; w: number }[] {
  const out: { name: string; u: number; w: number }[] = [];
  LINES.forEach((l, i) => l.posts.forEach(([u, w], j) => out.push({ name: `post ${i}.${j}`, u, w })));
  for (const k of ['tub', 'board', 'bench', 'bucket', 'basket', 'scoop'] as const) out.push({ name: k, u: PIECES[k].u, w: PIECES[k].w });
  PIECES.flat.forEach((f, i) => {
    const a = (f.yaw * Math.PI) / 180;
    for (const [su, sw] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const du = (su * f.lu) / 2;
      const dw = (sw * f.lw) / 2;
      out.push({ name: `flat ${i}`, u: f.u + du * Math.cos(a) - dw * Math.sin(a), w: f.w + du * Math.sin(a) + dw * Math.cos(a) });
    }
  });
  ITEMS.forEach((it, i) => {
    for (const u of [it.u0, it.u0 + it.width]) out.push({ name: `item ${i}`, u, w: ropeAt(it.line, u)!.w });
  });
  return out;
}

describe('bleiche layout', () => {
  it('local frame round-trips and faces the way the set says', () => {
    for (const [u, w] of [[0, 0], [3, -2], [-7.3, 2.4]] as const) {
      const [x, z] = toWorld(u, w);
      const [u2, w2] = toLocal(x, z);
      expect(u2).toBeCloseTo(u, 6);
      expect(w2).toBeCloseTo(w, 6);
    }
    expect(toWorld(0, 0)).toEqual([BLEICHE.x, BLEICHE.z]);
  });

  it('lies inside the terrain data, within EXTENT, on gentle open meadow (no forest, no water)', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of footprint()) {
      const [x, z] = toWorld(p.u, p.w);
      expect(Math.hypot(p.u, p.w), p.name).toBeLessThanOrEqual(EXTENT);
      expect(h1789.inBounds(x, z, 50), p.name).toBe(true);
      expect(groundAt(x, z), `${p.name} ground class`).not.toBe(FOREST);
      expect(groundAt(x, z), `${p.name} ground class`).not.toBe(WATER);
      const h = heightAt(x, z);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    // a bleaching green is flat ground: under 1.5 m over its whole spread
    expect(hi - lo).toBeLessThan(1.5);
  });

  it('keeps off the brook bed (the OSM line, snapped up to 3 m to the ravine floor, plus the bed)', () => {
    for (const p of footprint()) {
      const [x, z] = toWorld(p.u, p.w);
      expect(lineDist(x, z, BROOK_OSM), p.name).toBeGreaterThan(4.5);
    }
    for (const s of [LIESE, TUB_SPOT, COAT_REACH]) expect(lineDist(s.x, s.z, BROOK_OSM)).toBeGreaterThan(4.5);
    // the bed roughly as quelle/layout.ts brookLine() draws it, the whole OSM line long: samples
    // every metre pulled to the lowest ground within ±3 m across (brookLine also keeps out of the
    // green's clearings; tests/quelle.test.ts checks the drawn line's bank against the linen)
    const bed: [number, number][] = [];
    for (let i = 0; i + 1 < BROOK_OSM.length; i++) {
      const [ax, az] = BROOK_OSM[i]!;
      const [bx, bz] = BROOK_OSM[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      for (let s = 0; s < len; s += 1) {
        const x = ax + ux * s;
        const z = az + uz * s;
        let best: [number, number] = [x, z];
        let bh = heightAt(x, z);
        for (let o = -3; o <= 3; o += 0.5) {
          const h = heightAt(x - uz * o, z + ux * o) + Math.abs(o) * 0.02;
          if (h < bh) {
            bh = h;
            best = [x - uz * o, z + ux * o];
          }
        }
        bed.push(best);
      }
    }
    // the water ribbon (quelle/water.ts brookMesh) is up to 0.72 m either side: keep a bank beyond it
    // (the wash corner may sit close by — washing was done at the brook — but never in it)
    for (const p of footprint()) {
      const [x, z] = toWorld(p.u, p.w);
      expect(Math.min(...bed.map(([bx, bz]) => Math.hypot(x - bx, z - bz))), `${p.name} to the bed`).toBeGreaterThan(1.6);
    }
  });

  it('hangs the linen along its line, between the posts, nothing overlapping', () => {
    for (let li = 0; li < LINES.length; li++) {
      const items = ITEMS.filter((i) => i.line === li).sort((a, b) => a.u0 - b.u0);
      const posts = LINES[li]!.posts.map(([u]) => u);
      for (const it of items) {
        expect(ropeAt(li, it.u0), `item at ${it.u0}`).not.toBeNull();
        expect(ropeAt(li, it.u0 + it.width), `item at ${it.u0}`).not.toBeNull();
        // no item hangs across a post (a post is 0.12 m thick)
        for (const pu of posts) expect(pu > it.u0 - 0.06 && pu < it.u0 + it.width + 0.06, `item ${it.kind}@${it.u0} on post ${pu}`).toBe(false);
        // and its hem stays well off the ground
        expect(ropeAt(li, it.u0 + it.width / 2)!.above - it.drop).toBeGreaterThan(0.3);
      }
      for (let i = 0; i + 1 < items.length; i++) expect(items[i]!.u0 + items[i]!.width).toBeLessThanOrEqual(items[i + 1]!.u0);
    }
  });

  it('hangs the coat on line B where the story looks for it', () => {
    const it = ITEMS[COAT_ITEM]!;
    expect(it.kind).toBe('coat');
    const c = coatWorld(heightAt);
    expect(c.x).toBeCloseTo(COAT_XZ[0], 1);
    expect(c.z).toBeCloseTo(COAT_XZ[1], 1);
    const rope = ropeWorld(heightAt, it.line, COAT.u)!;
    expect(rope.y - c.y).toBeCloseTo(it.drop * 0.45, 5);
    // chest height above its ground, reachable from the coat-reach spot
    const above = c.y - heightAt(c.x, c.z);
    expect(above).toBeGreaterThan(1.0);
    expect(above).toBeLessThan(1.8);
    expect(Math.hypot(COAT_REACH.x - c.x, COAT_REACH.z - c.z)).toBeLessThan(1.3);
  });

  it('builds with the real heights and leaves the spots free; clearings and mown circles cover the green', () => {
    const b = new SetBuilder(heightAt);
    bleicheSet.build(b, { era: '1789', gateOpen: 0 });
    const built = b.build(bleicheSet.id);
    expect(built.group.children.length).toBeGreaterThan(0);
    const c = new FootprintCollider([]);
    c.setSolids('set', built.solids);
    for (const [x, z, r] of bleicheSet.keepFree ?? []) expect(c.solidAt(x, z, r), `blocks ${x}/${z}`).toBe(false);
    expect(c.solidAt(LIESE.x, LIESE.z, LIESE_FREE)).toBe(false);
    // the tub, the bench, the bucket are solid
    const [tx, tz] = toWorld(PIECES.tub.u, PIECES.tub.w);
    expect(c.solidAt(tx, tz)).toBe(true);
    for (const p of footprint()) {
      const [x, z] = toWorld(p.u, p.w);
      expect(clearings().some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) <= r + 0.5), `${p.name} not cleared`).toBe(true);
    }
    expect(mown().some(([x, z]) => Math.hypot(x - BLEICHE.x, z - BLEICHE.z) < 2)).toBe(true);
    expect(KEEP_CLEAR.some(([x, z]) => Math.hypot(x - BLEICHE.x, z - BLEICHE.z) < 1)).toBe(true);
  });

  it('places the 16.6k-triangle CC0 basket on high only (the procedural one on medium and low)', () => {
    const baskets = (detailed: boolean, high: boolean) => {
      const b = new SetBuilder(heightAt, detailed, high);
      bleicheSet.build(b, { era: '1789', gateOpen: 0 });
      return b.models.filter((m) => m.id === 'architecture.basket').length;
    };
    expect(baskets(true, true)).toBe(1);
    expect(baskets(true, false)).toBe(0);
    expect(baskets(false, false)).toBe(0);
  });

  it('only stands in 1789', () => {
    expect(bleicheSet.eras).toEqual(['1789']);
  });

  it('shows and hides the coat', () => {
    setCoatVisible(false);
    expect(coatVisible()).toBe(false);
    setCoatVisible(true);
    expect(coatVisible()).toBe(true);
  });
});

describe('court pike', () => {
  it('is a 2.42 m upright pike, butt at the origin, slim', () => {
    const g = pikeGeometry();
    const box = g.boundingBox!;
    expect(box.min.y).toBeCloseTo(0, 2);
    expect(box.max.y).toBeCloseTo(PIKE_LENGTH, 2);
    expect(box.max.x - box.min.x).toBeLessThan(0.4);
    expect(box.max.z - box.min.z).toBeLessThan(0.15);
    expect(g.getAttribute('position').count).toBeGreaterThan(0);
  });
});
