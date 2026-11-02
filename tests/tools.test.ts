import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Footprint, PointCloudMeta, Room, TerrainMeta } from '../src/data/types';
import {
  distanceToPolygon,
  fmtDistance,
  heightProfile,
  measure,
  niceStep,
  pointInPolygon,
  profileStats,
  rayAabb,
  rayHeightfield,
  rayTriangle,
} from '../src/systems/tools/geom';
import { footprintAt, planLines, roomAt } from '../src/systems/tools/plans';
import { buildRibbons } from '../src/systems/tools/ribbon';
import { packView } from '../src/systems/tools/tracks';
import { pawTrail } from '../src/systems/tools/xray';
import { cellsInRadius, decodeGroundPoints, encodeGroundPoints } from '../src/systems/tools/xrayData';

const DATA = join(__dirname, '..', 'public', 'data');
const json = <T>(rel: string) => JSON.parse(readFileSync(join(DATA, rel), 'utf8')) as T;

describe('tools geometry', () => {
  it('ray marches a heightfield and refines the hit', () => {
    const hill = (x: number) => 100 + Math.max(0, 10 - Math.abs(x - 50) * 0.5);
    const t = rayHeightfield({ x: 0, y: 105, z: 0 }, { x: 1, y: 0, z: 0 }, (x) => hill(x));
    // ground reaches 105 m at x = 40
    expect(t).not.toBeNull();
    expect(t!).toBeCloseTo(40, 2);
    // looking up: no hit
    expect(rayHeightfield({ x: 0, y: 105, z: 0 }, { x: 0, y: 1, z: 0 }, (x) => hill(x), 200)).toBeNull();
    // starting under ground → 0
    expect(rayHeightfield({ x: 50, y: 101, z: 0 }, { x: 1, y: 0, z: 0 }, (x) => hill(x))).toBe(0);
    // steep downward ray on flat ground
    const d = Math.SQRT1_2;
    expect(rayHeightfield({ x: 0, y: 110, z: 0 }, { x: d, y: -d, z: 0 }, () => 100)!).toBeCloseTo(10 * Math.SQRT2, 3);
  });

  it('ray vs AABB and triangle', () => {
    const o = { x: 0, y: 0, z: 0 };
    expect(rayAabb(o, { x: 1, y: 0, z: 0 }, { x: 5, y: -1, z: -1 }, { x: 6, y: 1, z: 1 })).toBeCloseTo(5);
    expect(rayAabb(o, { x: -1, y: 0, z: 0 }, { x: 5, y: -1, z: -1 }, { x: 6, y: 1, z: 1 })).toBeNull();
    const p = [3, -1, -1, 3, 1, -1, 3, 0, 1];
    expect(rayTriangle(o, { x: 1, y: 0, z: 0 }, p, 0, 1, 2)).toBeCloseTo(3);
    expect(rayTriangle(o, { x: 0, y: 1, z: 0 }, p, 0, 1, 2)).toBeNull();
    // double sided
    expect(rayTriangle({ x: 6, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, p, 0, 1, 2)).toBeCloseTo(3);
  });

  it('measures distance, rise and grade; profiles terrain', () => {
    const m = measure({ x: 0, y: 100, z: 0 }, { x: 30, y: 104, z: 40 });
    expect(m.horizontal).toBeCloseTo(50);
    expect(m.rise).toBeCloseTo(4);
    expect(m.distance).toBeCloseTo(Math.hypot(50, 4));
    expect(m.grade).toBeCloseTo(8);
    const prof = heightProfile({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, (x) => (x < 5 ? x : 10 - x), 10);
    expect(prof).toHaveLength(11);
    expect(prof[10]!.s).toBeCloseTo(10);
    expect(profileStats(prof)).toMatchObject({ min: 0, max: 5, climb: 5, descent: 5 });
    expect(fmtDistance(82.94)).toBe('82,9 m');
    expect(fmtDistance(3.456)).toBe('3,46 m');
    expect(fmtDistance(1234)).toBe('1,23 km');
    expect(niceStep(83, 5)).toBe(20);
    expect(niceStep(0.9, 4)).toBe(0.2);
  });

  it('polygons: inside, distance', () => {
    const sq: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(pointInPolygon(5, 5, sq)).toBe(true);
    expect(pointInPolygon(15, 5, sq)).toBe(false);
    expect(distanceToPolygon(5, 5, sq)).toBe(0);
    expect(distanceToPolygon(13, 5, sq)).toBeCloseTo(3);
  });
});

describe('measuring the gallery (bible 04 §2: the model length, not a fixed number)', () => {
  const fps = json<{ buildings: Footprint[] }>('palace/footprints.json').buildings;
  const rooms = json<{ rooms: Room[] }>('palace/rooms.json').rooms;
  const wing = fps.find((f) => f.id === 'KB-B06')!;

  it('gable to gable of the gallery wing is ≈ 83 m and both ends resolve to KB-B06', () => {
    const [p0, p1, p2, p3] = wing.ring as [number, number][];
    // west gable = midpoint of p0/p3, east gable = midpoint of p1/p2 (the long sides run W–E)
    const west = { x: (p0![0] + p3![0]) / 2, z: (p0![1] + p3![1]) / 2 };
    const east = { x: (p1![0] + p2![0]) / 2, z: (p1![1] + p2![1]) / 2 };
    const len = Math.hypot(east.x - west.x, east.z - west.z);
    const ux = (east.x - west.x) / len;
    const uz = (east.z - west.z) / len;
    // the west gable is a wall shared with the Sammlungsflügel (KB-B04): probe just inside the wing
    const wIn = { x: west.x + ux * 0.4, z: west.z + uz * 0.4 };
    const eIn = { x: east.x - ux * 0.4, z: east.z - uz * 0.4 };
    const m = measure({ ...west, y: 350 }, { ...east, y: 350 });
    expect(m.distance).toBeGreaterThan(78);
    expect(m.distance).toBeLessThan(88);
    expect(footprintAt(fps, wIn.x, wIn.z)?.id).toBe('KB-B06');
    expect(footprintAt(fps, eIn.x, eIn.z)?.id).toBe('KB-B06');
  });

  it('inside the gallery room the floor resolves to B06.1.bildergalerie', () => {
    const gal = rooms.find((r) => r.roomId === 'B06.1.bildergalerie')!;
    expect(roomAt(rooms, 1230, gal.floor_h + 0.1, -1220)?.roomId).toBe('B06.1.bildergalerie');
    expect(roomAt(rooms, 1230, gal.floor_h + 30, -1220)).toBeNull();
  });
});

describe('plan sheet', () => {
  const fps = json<{ buildings: Footprint[] }>('palace/footprints.json').buildings;
  const rooms = json<{ rooms: Room[] }>('palace/rooms.json').rooms;
  it('one outline per footprint; confidence colours and dashed low confidence; rooms at level 3', () => {
    const plan = planLines(fps, rooms, 'plan', false);
    expect(plan).toHaveLength(fps.length);
    const conf = planLines(fps, rooms, 'conf', false);
    const low = fps.findIndex((f) => f.confidence === 'low');
    const high = fps.findIndex((f) => f.confidence === 'high');
    expect(conf[low]!.dash).toBeGreaterThan(0);
    expect(conf[high]!.dash).toBe(0);
    expect(conf[low]!.color).not.toEqual(conf[high]!.color);
    expect(planLines(fps, rooms, 'plan', true).length).toBeGreaterThan(fps.length);
  });

  it('ribbons follow the ground and carry along-distance for dashes', () => {
    const a = buildRibbons([{ pts: [[0, 0], [10, 0]], color: [1, 0, 0], width: 1, dash: 2 }], (x) => x * 0.1, 0.1, 2);
    // 5 subdivisions → 6 vertex pairs
    expect(a.position.length / 3).toBe(12);
    expect(a.index.length).toBe(5 * 6);
    // last pair sits on the slope at x ≈ 10.5 (half-width extension), y = 0.1·x + lift
    expect(a.position[11 * 3 + 1]!).toBeCloseTo(a.position[11 * 3]! * 0.1 + 0.1, 5);
    expect(a.extra[11 * 4]!).toBeCloseTo(10);
    expect(a.extra[2]!).toBe(2);
  });
});

describe('Röntgenblick data', () => {
  const meta = { x0: 0, z0: -100, cell: 20, cols: 5, rows: 5, xyScale: 0.02, resScale: 0.02 };
  it('encodes and decodes points per cell', () => {
    const pts = [
      { x: 1, z: -99, res: 0.1, cls: 2 },
      { x: 5.5, z: -95, res: -0.3, cls: 2 },
      { x: 21, z: -99, res: 0.0, cls: 24 },
      { x: 99, z: -1, res: 1.2, cls: 6 },
    ];
    const d = decodeGroundPoints(encodeGroundPoints(pts, meta), meta);
    expect(d.count).toBe(4);
    expect(d.xs[1]).toBeCloseTo(5.5, 2);
    expect(d.zs[3]).toBeCloseTo(-1, 2);
    expect(d.res[1]).toBeCloseTo(-0.3, 2);
    expect(Array.from(d.cls)).toEqual([2, 2, 24, 6]);
    expect(d.offsets[1]).toBe(2);
    expect(d.offsets[25]).toBe(4);
    expect(cellsInRadius(meta, 10, -90, 5)).toEqual([0]);
    expect(cellsInRadius(meta, 20, -80, 1).sort((a, b) => a - b)).toEqual([0, 1, 5, 6]);
  });

  it('the prepared cloud decodes, stays under 3 MB and sits on the 2025 terrain', () => {
    const tmeta = json<TerrainMeta>('terrain/meta.json');
    const pm = tmeta.pointcloud as PointCloudMeta;
    expect(pm.format).toBe('kq-pts-v1');
    const raw = readFileSync(join(DATA, pm.path));
    expect(raw.length).toBeLessThanOrEqual(3 * 1024 * 1024);
    const d = decodeGroundPoints(new Uint8Array(inflateSync(raw)), pm);
    expect(d.count).toBe(pm.count);
    expect(d.count).toBeGreaterThan(500_000);
    // every point inside its cell, residuals small (ground class)
    for (let c = 0; c < pm.cols * pm.rows; c += 97) {
      for (let i = d.offsets[c]!; i < d.offsets[c + 1]!; i += 50) {
        const cc = Math.floor((d.xs[i]! - pm.x0) / pm.cell);
        const rr = Math.floor((d.zs[i]! - pm.z0) / pm.cell);
        expect(rr * pm.cols + cc).toBe(c);
      }
    }
    let big = 0;
    for (let i = 0; i < d.count; i += 101) if (Math.abs(d.res[i]!) > 1) big++;
    expect(big / (d.count / 101)).toBeLessThan(0.02);
  });

  it('the paw trail (fiction) runs from the Ehrenhof to the Zwinger', () => {
    const t = pawTrail(() => 300);
    expect(t.length).toBeGreaterThan(500);
    expect(Math.hypot(t[0]!.x - 1222, t[0]!.z + 1102)).toBeLessThan(1);
    expect(Math.hypot(t[t.length - 1]!.x - 1216, t[t.length - 1]!.z + 1560)).toBeLessThan(2);
  });
});

describe('Spurenleser accessor', () => {
  it('reads agents and the leader route from a PackSim-like object', () => {
    const v = packView({
      agents: [
        { kind: 'pikeur', x: 10, z: 10 },
        { kind: 'hound', x: 12, z: 9 },
      ],
      leader: { x: 10, z: 10, path: [0, 1, 2], pathI: 1 },
      graph: { xs: [0, 20, 40], zs: [0, 0, 5] },
    });
    expect(v!.agents).toHaveLength(2);
    expect(v!.route).toEqual([
      [10, 10],
      [20, 0],
      [40, 5],
    ]);
    expect(packView({ agents: [] })).toBeNull();
    expect(packView({ agents: [{ kind: 'hound', x: 0, z: 0 }] })!.route).toEqual([]);
  });
});
