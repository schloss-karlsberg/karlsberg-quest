import { BufferGeometry, Float32BufferAttribute } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildDebris, buildInterior, foundationStones, lookOf } from '../src/systems/interiors/builder';
import { PlanQuery } from '../src/systems/interiors/collide';
import { type FullPlan, buildPlan, classifyRoom, ruinTop } from '../src/systems/interiors/layout';
import { bakeLight } from '../src/systems/interiors/lightmap';
import { extractOpenings, isDoor } from '../src/systems/interiors/shell';
import { frameXZ, stairHeight } from '../src/systems/interiors/stairs';
import { readFileSync } from 'node:fs';
import { evaluate } from '../src/systems/story/engine';
import { validateStories } from '../src/systems/story/validate';
import type { Condition, StoryFile } from '../src/systems/story/types';
import { loadPalaceData } from './interiors-fixture';

const d = loadPalaceData();
const t89 = (x: number, z: number) => d.h1789.heightAt(x, z);
let intact: FullPlan;
let ruin: FullPlan;
let today: FullPlan;

beforeAll(() => {
  intact = buildPlan({ rooms: d.rooms, footprints: d.footprints, mode: 'intact', terrain: t89 });
  ruin = buildPlan({ rooms: d.rooms, footprints: d.footprints, mode: 'ruin', terrain: t89 });
  today = buildPlan({ rooms: d.rooms, footprints: d.footprints, mode: 'today', terrain: (x, z) => d.h2025.heightAt(x, z) });
});

const room = (p: FullPlan, id: string) => {
  const r = p.rooms.find((q) => q.roomId === id);
  if (!r) throw new Error(`no room ${id}`);
  return r;
};

describe('interiors layout', () => {
  it('classifies the rooms of the story', () => {
    expect(classifyRoom('B06.1.bildergalerie', 'Bildergalerie', '')).toBe('gallery');
    expect(classifyRoom('B01.2.og-festsaal', 'Festsaal', '')).toBe('festsaal');
    expect(classifyRoom('B06.1.kabinett-ost', 'Tempelzimmer', '')).toBe('temple');
    expect(classifyRoom('B01.1.eg-kabinett', 'Kabinett', '')).toBe('study');
  });

  it('builds the detailed buildings with their walkable storeys', () => {
    const ids = intact.buildings.map((b) => b.id).sort();
    expect(ids).toEqual(['KB-B01', 'KB-B02', 'KB-B03', 'KB-B04', 'KB-B05', 'KB-B06', 'KB-B10']);
    expect(intact.buildings.find((b) => b.id === 'KB-B01')!.storeys).toEqual([1, 2]);
    // every clue room exists in the intact plan
    for (const id of ['B03.1.eg-registratur', 'B10.1.s-pfeilersaal', 'B01.1.eg-kabinett', 'B04.1.eg-waffensammlung', 'B04.2.og-naturalienkabinett', 'B06.1.bildergalerie', 'B06.1.kabinett-ost', 'B01.2.og-festsaal'])
      expect(room(intact, id)).toBeTruthy();
    // ruin and today: ground floor only
    expect(ruin.rooms.every((r) => r.storey === 1 || r.building === 'KB-B10')).toBe(true);
    expect(ruin.rooms.some((r) => r.roomId === 'B01.2.og-festsaal')).toBe(false);
  });

  it('connects ground and upper floor through the stair halls', () => {
    const stairs = intact.rooms.filter((r) => r.stair);
    expect(stairs.length).toBeGreaterThanOrEqual(2);
    const prunk = room(intact, 'B01.1.eg-prunktreppe');
    expect(prunk.stair!.type).toBe('imperial');
    const fest = room(intact, 'B01.2.og-festsaal');
    // a door from the stair hall reaches the Festsaal's floor (directly or through the Gardesaal)
    const upper = intact.doors.filter((x) => x.a === prunk.index && Math.abs(x.floor - fest.floor) < 0.1);
    expect(upper.length).toBeGreaterThan(0);
    // the ramp spans the storey height
    expect(prunk.stair!.low).toBeCloseTo(prunk.floor, 1);
    expect(prunk.stair!.high).toBeCloseTo(fest.floor, 1);
    // the Naturalienkabinett (B04 OG) is reachable: a door at its floor level
    const nat = room(intact, 'B04.2.og-naturalienkabinett');
    expect(intact.doors.some((x) => (x.a === nat.index || x.b === nat.index) && Math.abs(x.floor - nat.floor) < 0.1)).toBe(true);
  });

  it('has entrances from the outside with steps to the terrain', () => {
    const outer = intact.doors.filter((x) => x.b === -1);
    expect(outer.length).toBeGreaterThan(8);
    for (const x of outer) {
      expect(x.stoop).not.toBeNull();
      expect(Math.abs(x.stoop!.ground - x.floor)).toBeLessThan(3.5);
    }
    const gallery = room(intact, 'B06.1.bildergalerie');
    expect(intact.windows.filter((w) => w.room === gallery.index).length).toBeGreaterThan(4);
  });

  it('ruin walls are deterministic stubs, some low enough to climb through', () => {
    const hs = Array.from({ length: 200 }, (_, i) => ruinTop('KB-B06', 1180 + i * 0.5, -1220));
    expect(Math.min(...hs)).toBeGreaterThanOrEqual(0.12);
    expect(Math.max(...hs)).toBeLessThanOrEqual(5.9);
    expect(ruinTop('KB-B06', 1200, -1218)).toBe(ruinTop('KB-B06', 1200, -1218));
    expect(today.walls.length).toBe(0);
    // the K4 route from the Ehrenhof to the trenches stays open through the north wing
    for (let t = 0; t <= 1; t += 0.05) expect(ruinTop('KB-B03', 1220 + 22 * t, -1126 - 66 * t)).toBeLessThan(0.45);
  });
});

describe('interiors collision + floors', () => {
  it('walls block, doors let through', () => {
    const q = new PlanQuery(intact);
    const gal = room(intact, 'B06.1.bildergalerie');
    // walk from the room centre towards each edge: stops 0.35 m before the wall
    const e = gal.edges[0]!;
    const [mx, mz] = [(e.ax + e.bx) / 2, (e.az + e.bz) / 2];
    const ins = { x: mx - e.nx * 1, z: mz - e.nz * 1 };
    const tryX = ins.x + e.nx * 0.85;
    const tryZ = ins.z + e.nz * 0.85;
    const res = q.resolve(tryX, tryZ, 0.35, gal.floor);
    const out = (res.x - mx) * e.nx + (res.z - mz) * e.nz;
    const doorOn = gal.openings.some((o) => o.edge === 0 && o.kind === 'door' && o.s0 < e.len / 2 && o.s1 > e.len / 2);
    if (!doorOn) expect(out).toBeLessThan(-0.3);
    // through an inner door: centre of the passage is free
    const door = intact.doors.find((x) => x.kind === 'inner')!;
    const mid = { x: door.cx + door.nx * (door.depth / 2), z: door.cz + door.nz * (door.depth / 2) };
    const r2 = q.resolve(mid.x, mid.z, 0.35, door.floor);
    expect(Math.hypot(r2.x - mid.x, r2.z - mid.z)).toBeLessThan(0.05);
    // a blocked (collapsed) room shuts its doors
    q.setRoomBlocked(door.a, true);
    const p0 = { x: door.cx - door.nx * 0.6, z: door.cz - door.nz * 0.6 };
    const r3 = q.resolve(door.cx + door.nx * 0.1, door.cz + door.nz * 0.1, 0.35, door.floor);
    expect(Math.hypot(r3.x - p0.x, r3.z - p0.z)).toBeLessThan(1.2);
    q.clearBlocks();
  });

  it('floors: ground floor, upper floor by height hint, stair ramps, door steps', () => {
    const q = new PlanQuery(intact);
    const kab = room(intact, 'B01.1.eg-kabinett');
    expect(q.floorAt(kab.cx, kab.cz, kab.floor, 0)).toBeCloseTo(kab.floor, 3);
    const fest = room(intact, 'B01.2.og-festsaal');
    // below the Festsaal on the ground floor vs. standing in it
    expect(q.floorAt(fest.cx, fest.cz, fest.floor, 0)).toBeCloseTo(fest.floor, 3);
    const below = q.floorAt(fest.cx, fest.cz, fest.floor - 5, 0)!;
    expect(below).toBeLessThan(fest.floor - 2);
    // placed from afar: the clue room's storey wins, else the ground floor
    expect(q.floorAt(fest.cx, fest.cz, -1e9, 0, new Set([fest.index]))).toBeCloseTo(fest.floor, 3);
    expect(q.floorAt(fest.cx, fest.cz, -1e9, 0)).toBeCloseTo(below, 3);
    // the ramp rises monotonically along a flight
    const st = room(intact, 'B01.1.eg-prunktreppe');
    const fl = st.stair!.zones.find((z) => z.kind === 'flight')!;
    const v = (fl.v0 + fl.v1) / 2;
    const hs = [0.1, 0.5, 0.9].map((t) => stairHeight(st.stair!, fl.u0 + (fl.u1 - fl.u0) * t, v)!);
    expect(hs[0]).not.toBe(hs[2]);
    const [sx, sz] = frameXZ(st.frame, fl.u0 + (fl.u1 - fl.u0) * 0.5, v);
    expect(q.floorAt(sx, sz, hs[1]!, 0)).toBeCloseTo(hs[1]!, 2);
    // outdoor steps blend into the terrain
    const out = intact.doors.find((x) => x.b === -1 && x.stoop)!;
    const L = out.stoop!.length;
    const ex = out.cx + out.nx * (out.depth + L - 0.05);
    const ez = out.cz + out.nz * (out.depth + L - 0.05);
    const h = q.floorAt(ex, ez, out.floor, t89(ex, ez))!;
    expect(Math.abs(h - t89(ex, ez))).toBeLessThan(0.15);
    // the room under the player
    expect(q.roomAt(kab.cx, kab.cz, kab.floor)).toBe(kab.index);
    expect(q.roomAt(kab.cx, kab.cz, kab.floor + 30)).toBe(-1);
  });
});

describe('interiors meshes', () => {
  it('builds every building in every era without degenerate data', () => {
    for (const [era, plan] of [
      ['1789', intact],
      ['1793-02', intact],
      ['1793-07', intact],
      ['1796', ruin],
      ['today', today],
    ] as const) {
      for (const b of plan.buildings) {
        const built = buildInterior(plan, b.id, lookOf(era, plan.mode), t89);
        const g = built.geo;
        expect(g.vertices).toBeGreaterThan(20);
        expect(g.pos.every(Number.isFinite)).toBe(true);
        expect(g.idx.every((i) => i < g.vertices)).toBe(true);
        expect(built.rooms.length).toBeLessThanOrEqual(32);
      }
    }
  });

  it('sets the 2025 foundation lines into the ground, also on the Orangerie step (round 10, F-14)', () => {
    const t25 = (x: number, z: number) => d.h2025.heightAt(x, z);
    for (const id of ['KB-B10', 'KB-B01', 'KB-B02']) {
      const g = buildInterior(today, id, lookOf('today', 'today'), t25).geo;
      let worst = -Infinity;
      // side quads of the boxes: vertices 0 and 1 are the bottom edge
      for (let q = 0; q + 3 < g.vertices; q += 4) {
        if (Math.abs(g.nor[q * 3 + 1]!) > 0.01) continue;
        for (const v of [q, q + 1]) worst = Math.max(worst, g.pos[v * 3 + 1]! - t25(g.pos[v * 3]!, g.pos[v * 3 + 2]!));
      }
      // before: up to 0.7 m of air under the downhill ends of the Orangerie's runs
      expect(worst, id).toBeLessThan(0);
    }
  });

  it('steps a foundation run down a slope in short stones', () => {
    const slope = (x: number) => 300 - 0.8 * x; // 39°, falling along +x
    const stones = foundationStones(0, 0, 1, 0, 1.56, 0.8, (x) => slope(x));
    expect(stones.length).toBeGreaterThan(3);
    for (const s of stones) {
      expect(s.y0).toBeLessThanOrEqual(slope(s.x + s.len / 2) - 0.25);
      expect(s.top).toBeGreaterThan(slope(s.x));
      expect(s.top - (slope(s.x + s.len / 2))).toBeLessThan(0.45);
    }
    // flat ground: one stone, as before
    expect(foundationStones(0, 0, 1, 0, 1.56, 0.4, () => 300)).toHaveLength(1);
    // along the contour: still one long stone, sunk below its downhill edge
    const along = foundationStones(0, 0, 0, 1, 1.56, 0.8, (x) => slope(x));
    expect(along).toHaveLength(1);
    expect(along[0]!.y0).toBeLessThanOrEqual(slope(0.4) - 0.25);
  });

  it('lights candles in 1789, one candle in February 1793, none in July 1793', () => {
    const b01 = (era: '1789' | '1793-02' | '1793-07') => buildInterior(intact, 'KB-B01', lookOf(era, 'intact'), t89);
    expect(b01('1789').lights.length).toBeGreaterThan(6);
    expect(b01('1793-02').lights.length).toBe(1);
    expect(b01('1793-07').lights.length).toBe(0);
    expect(b01('1789').flames.filter((f) => f.kind === 0).length).toBeGreaterThan(20);
    // fire spots in every room of the building (flames, embers, smoke through doors)
    const fire = b01('1793-07').flames.filter((f) => f.kind === 1);
    expect(new Set(fire.map((f) => f.room)).size).toBe(intact.buildings.find((b) => b.id === 'KB-B01')!.rooms.length);
  });

  it('builds collapse debris and bakes window light', () => {
    const fest = room(intact, 'B01.2.og-festsaal');
    expect(buildDebris(intact, fest.index, 0).vertices).toBeGreaterThan(50);
    const grid = bakeLight(intact, 'KB-B06', { x: 0.3, y: 0.6, z: -0.7 });
    expect(grid.data.some((v) => v > 50)).toBe(true);
    expect(grid.split).toBeGreaterThan(1e5);
    expect(bakeLight(intact, 'KB-B01', { x: 0.3, y: 0.6, z: -0.7 }).split).toBeLessThan(400);
  });
});

describe('interiors shell', () => {
  it('extracts window panes and door leaves per building', () => {
    // a 1.2 x 2 m window (two triangles, black) and a 1.4 x 2.6 m door (brown) in building 3
    const pos: number[] = [];
    const col: number[] = [];
    const bld: number[] = [];
    const quad = (x0: number, x1: number, y0: number, y1: number, z: number, c: [number, number, number], b: number) => {
      const v = [
        [x0, y0, z],
        [x1, y0, z],
        [x1, y1, z],
        [x0, y0, z],
        [x1, y1, z],
        [x0, y1, z],
      ];
      for (const p of v) {
        pos.push(...p);
        col.push(...c);
        bld.push(b);
      }
    };
    quad(0, 1.2, 1, 3, 5, [0.02, 0.02, 0.03], 3);
    // the door leaf is a slab: front and back (the research-wave model's red-brown shade)
    quad(3, 4.4, 0, 2.6, 5, [0.15, 0.07, 0.03], 3);
    quad(3, 4.4, 0, 2.6, 5.03, [0.17, 0.06, 0.03], 3);
    // a lone painted reveal of the same hue is no door
    quad(7, 7.3, 0, 2.6, 5, [0.15, 0.07, 0.03], 3);
    quad(10, 11, 1, 3, 5, [0.02, 0.02, 0.03], 4); // another building
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    g.setAttribute('aBld', new Float32BufferAttribute(bld, 1));
    const ops = extractOpenings(g, new Map([[3, 'KB-B01']]));
    expect(ops.length).toBe(2);
    const w = ops.find((o) => o.kind === 'window')!;
    expect(Math.hypot(w.bx - w.ax, w.bz - w.az)).toBeCloseTo(1.2, 3);
    expect(w.y1 - w.y0).toBeCloseTo(2, 3);
    const d = ops.find((o) => o.kind === 'door')!;
    expect(d.building).toBe('KB-B01');
    expect(Math.hypot(d.bx - d.ax, d.bz - d.az)).toBeCloseTo(1.4, 3);
  });

  it('door paint: brown and red-brown leaves, not the red plinth, tiles or green paint', () => {
    expect(isDoor(0.15, 0.07, 0.03)).toBe(true);
    expect(isDoor(0.129, 0.059, 0.027)).toBe(true);
    expect(isDoor(0.2, 0.06, 0.035)).toBe(true);
    expect(isDoor(0.38, 0.114, 0.067)).toBe(false); // red sandstone plinth
    expect(isDoor(0.06, 0.09, 0.05)).toBe(false); // green shutters
    expect(isDoor(0.04, 0.02, 0.01)).toBe(false); // near black
  });
});

describe('story room condition', () => {
  const env = (room: string, building: string) =>
    ({ flags: { 'interior.room': room, 'interior.building': building } }) as unknown as Parameters<typeof evaluate>[1];
  it('matches catalogue id, full id and building', () => {
    const e = env('B06.1.bildergalerie', 'KB-B06');
    for (const room of ['B06.1.bildergalerie', 'KB-B06/B06.1.bildergalerie', 'KB-B06']) expect(evaluate({ room } as Condition, e, {}, 'k', 0)).toBe(true);
    expect(evaluate({ room: 'B01.2.og-festsaal' } as Condition, e, {}, 'k', 0)).toBe(false);
    expect(evaluate({ room: 'KB-B06' } as Condition, env('', ''), {}, 'k', 0)).toBe(false);
  });
});

describe('story room condition: example beats (content/test, not bundled)', () => {
  it('validates', () => {
    const story = JSON.parse(readFileSync(new URL('../content/test/interiors-test.story.json', import.meta.url), 'utf8')) as StoryFile;
    const r = validateStories([{ file: 'interiors-test.story.json', story }]);
    expect(r.errors).toEqual([]);
    const bad = structuredClone(story);
    (bad.beats[0]!.complete as unknown as { room: string }).room = 'Festsaal!';
    expect(validateStories([{ file: 'bad.story.json', story: bad }]).errors.length).toBeGreaterThan(0);
  });
});
