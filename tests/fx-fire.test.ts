import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Footprint, Room } from '../src/data/types';
import { FLAME_STRIDE, SRC_STRIDE, WIN_STRIDE, buildEmitters } from '../src/systems/fx/fire/emitters';
import { FireMap, rasterizeUnits } from '../src/systems/fx/fire/firemap';
import {
  FIRE_BASE_SECONDS,
  type FireUnit,
  burnIntensity,
  buildFireGraph,
  createFireSchedule,
  smokeDensity,
  sootAt,
  unitStateAt,
} from '../src/systems/fx/fire/schedule';
import { FireSim, SMOKE_RATES } from '../src/systems/fx/fire/sim';
import { distToOutline } from '../src/systems/fx/geom';

const rooms = (JSON.parse(readFileSync('public/data/palace/rooms.json', 'utf8')) as { rooms: Room[] }).rooms;
const footprints = (JSON.parse(readFileSync('public/data/palace/footprints.json', 'utf8')) as { buildings: Footprint[] }).buildings;
const units = createFireSchedule(rooms, footprints);

const ofBuilding = (b: string, storey?: number) => units.filter((u) => u.building === b && (storey === undefined || u.storey === storey));
const igniteRange = (list: FireUnit[]) => [Math.min(...list.map((u) => u.ignite)), Math.max(...list.map((u) => u.ignite))];

describe('fire schedule (bible 04-kapitel-3 §9 "Teil B")', () => {
  it('builds rooms of the burning palace plus small buildings, deterministically', () => {
    expect(units.length).toBeGreaterThan(60);
    expect(units.some((u) => u.kind === 'room')).toBe(true);
    expect(units.every((u) => Number.isFinite(u.ignite) && u.ignite >= 0 && u.ignite <= FIRE_BASE_SECONDS)).toBe(true);
    // no cellars: vaults hold
    expect(units.every((u) => u.kind === 'building' || u.storey >= 1)).toBe(true);
    const again = createFireSchedule(rooms, footprints);
    expect(again.map((u) => [u.id, u.ignite, u.collapse])).toEqual(units.map((u) => [u.id, u.ignite, u.collapse]));
  });

  it('starts in the ground floor of the Corps de logis and the north wing at 0 s', () => {
    const first = units.filter((u) => u.ignite === 0);
    expect(first.length).toBeGreaterThan(0);
    expect(new Set(first.map((u) => u.building))).toEqual(new Set(['KB-B01', 'KB-B03']));
    expect(first.every((u) => u.storey === 1)).toBe(true);
  });

  it('follows the timeline: EG by 30 s, upper floors from 90 s, wings and gallery late', () => {
    for (const b of ['KB-B01', 'KB-B03']) {
      const eg = ofBuilding(b, 1).filter((u) => !u.slow);
      if (eg.length) expect(igniteRange(eg)[1]).toBeLessThanOrEqual(30);
      const og = ofBuilding(b, 2).filter((u) => !u.slow);
      if (og.length) expect(igniteRange(og)[0]).toBeGreaterThanOrEqual(90);
    }
    const b04 = ofBuilding('KB-B04').filter((u) => !u.slow);
    if (b04.length) expect(igniteRange(b04)[0]).toBeGreaterThanOrEqual(180);
    const b06 = ofBuilding('KB-B06').filter((u) => !u.slow);
    if (b06.length) {
      const [lo, hi] = igniteRange(b06);
      expect(lo).toBeGreaterThanOrEqual(240);
      expect(hi).toBeLessThanOrEqual(265);
    }
    const b05 = ofBuilding('KB-B05').filter((u) => !u.slow);
    if (b05.length) expect(igniteRange(b05)[0]).toBeGreaterThanOrEqual(285);
  });

  it('roofs (top storeys) collapse after they ignite; lower storeys stay standing', () => {
    for (const u of units) {
      if (u.collapse !== null) expect(u.collapse).toBeGreaterThan(u.ignite);
      if (!u.top && !u.slow) expect(u.collapse).toBeNull();
    }
    expect(units.some((u) => u.top && u.collapse !== null)).toBe(true);
  });

  it('graph links are symmetric with positive costs', () => {
    const adj = buildFireGraph(units);
    adj.forEach((list, i) => {
      for (const [j, c] of list) {
        expect(c).toBeGreaterThan(0);
        expect(adj[j]!.some(([k]) => k === i)).toBe(true);
      }
    });
  });

  it('unit state, burn, smoke and soot run in order and scale with the duration', () => {
    const u = units.find((x) => x.collapse !== null && x.ignite > 20)!;
    expect(unitStateAt(u, 0)).toBe('none');
    expect(unitStateAt(u, u.ignite - u.smokeLead + 0.01)).toBe('smoke');
    expect(unitStateAt(u, u.ignite + 0.01)).toBe('burning');
    expect(unitStateAt(u, u.collapse! + 0.01)).toBe('collapsed');
    // gentle mode: the same fire 1.5× slower
    expect(unitStateAt(u, (u.ignite + 0.01) * 1.5, FIRE_BASE_SECONDS * 1.5)).toBe('burning');
    expect(unitStateAt(u, u.ignite + 0.01, FIRE_BASE_SECONDS * 1.5)).not.toBe('burning');
    expect(burnIntensity(u, u.ignite - 1)).toBe(0);
    expect(burnIntensity(u, u.ignite + 30)).toBe(1);
    expect(burnIntensity(u, u.collapse! + 200)).toBeLessThan(0.5);
    expect(smokeDensity(u, u.ignite)).toBeGreaterThan(0.3);
    expect(sootAt(u, u.ignite)).toBe(0);
    expect(sootAt(u, u.ignite + 45)).toBe(1);
  });
});

describe('FireSim ("Rauch statt Öl")', () => {
  const burning = units.findIndex((u) => u.ignite === 0 && u.kind === 'room');
  const u = units[burning]!;
  const inside = (sim: FireSim) => sim.exposure(u.cx, u.floor + 0.1, u.cz);

  it('reports every state change once, in order, even across a big jump', () => {
    const sim = new FireSim(units, FIRE_BASE_SECONDS);
    const all = sim.setClock(FIRE_BASE_SECONDS + 200);
    const mine = all.filter((c) => c.index === burning).map((c) => c.state);
    // the seed room skips nothing: smoke → burning (→ collapsed for a top storey)
    expect(mine.slice(0, 2)).toEqual(['smoke', 'burning']);
    expect(new Set(mine).size).toBe(mine.length);
    expect(sim.advance(1)).toEqual([]);
    expect(sim.states.every((s) => s !== 'none')).toBe(true);
  });

  it('fills the smoke meter in a burning room in ~12 s; crouching halves, gentle slows', () => {
    const run = (low: boolean, gentle: boolean) => {
      const sim = new FireSim(units, FIRE_BASE_SECONDS);
      sim.setClock(5);
      const e = inside(sim);
      expect(e.inside).toBeGreaterThanOrEqual(0);
      expect(e.state).toBe('burning');
      let t = 0;
      while (!sim.breathe(1 / 60, e, low, gentle) && t < 200) t += 1 / 60;
      return t;
    };
    const stand = run(false, false);
    expect(stand).toBeCloseTo(1 / SMOKE_RATES.burning, 0);
    expect(run(true, false)).toBeCloseTo(stand * 2, 0);
    expect(run(false, true)).toBeCloseTo(stand * 1.5, 0);
  });

  it('recovers in fresh air, a collapse knocks the breath out, hold stops the clock', () => {
    const sim = new FireSim(units, FIRE_BASE_SECONDS);
    sim.smoke = 0.5;
    sim.breathe(1, sim.exposure(0, 0, 0), false, false);
    expect(sim.smoke).toBeCloseTo(0.5 - SMOKE_RATES.recover);
    sim.hit();
    expect(sim.smoke).toBeCloseTo(0.5 - SMOKE_RATES.recover + SMOKE_RATES.collapseHit);
    sim.hold = true;
    sim.advance(10);
    expect(sim.clock).toBe(0);
  });
});

describe('fire emitters', () => {
  const em = buildEmitters(units, footprints);
  const fp = new Map(footprints.map((f) => [f.id, f]));

  it('has windows, flames and smoke sources with consistent strides', () => {
    expect(em.counts.windows).toBeGreaterThan(100);
    expect(em.counts.flames).toBeGreaterThan(100);
    expect(em.counts.sources).toBeGreaterThan(5);
    expect(em.windows.length).toBe(em.counts.windows * WIN_STRIDE);
    expect(em.flames.length).toBe(em.counts.flames * FLAME_STRIDE);
    expect(em.sources.length).toBe(em.counts.sources * SRC_STRIDE);
    for (let i = 0; i < em.counts.sources; i++) expect(em.sources[i * SRC_STRIDE + 4]!).toBeLessThan(units.length);
  });

  it('puts the windows of rooms on the facade (building outline)', () => {
    let far = 0;
    for (let i = 0; i < em.counts.windows; i++) {
      const o = i * WIN_STRIDE;
      const u = units[em.windows[o + 7]!]!;
      if (u.kind !== 'room') continue;
      const ring = fp.get(u.building)!.ring;
      if (distToOutline(em.windows[o]!, em.windows[o + 2]!, ring) > 0.6) far++;
      // normals are unit length
      expect(Math.hypot(em.windows[o + 3]!, em.windows[o + 4]!)).toBeCloseTo(1, 4);
    }
    expect(far / em.counts.windows).toBeLessThan(0.05);
  });
});

describe('fire map (palace window glow)', () => {
  const sq = (x0: number, z0: number, s: number): [number, number][] => [
    [x0, z0],
    [x0 + s, z0],
    [x0 + s, z0 + s],
    [x0, z0 + s],
  ];
  const unit = (id: string, storey: number, floor: number): FireUnit => ({
    id,
    kind: 'room',
    building: 'B',
    storey,
    polygon: sq(0, 0, 10),
    cx: 5,
    cz: 5,
    floor,
    ceiling: floor + 4,
    eaves: 108,
    ridge: 112,
    top: storey === 2,
    slow: false,
    ignite: 0,
    collapse: null,
    smokeLead: 10,
  });

  it('rasterises ground and upper floors with the split at the upper floor, grown over the walls', () => {
    const r = rasterizeUnits([unit('eg', 1, 100), unit('og', 2, 104)], 1, 2);
    const at = (x: number, z: number) => Math.floor((z - r.z0) / r.cell) * r.w + Math.floor((x - r.x0) / r.cell);
    expect(r.lower[at(5, 5)]).toBe(0);
    expect(r.upper[at(5, 5)]).toBe(1);
    expect(r.split[at(5, 5)]).toBe(104);
    // one cell outside the room (the wall) is still covered, far away is not
    expect(r.lower[at(10.5, 5)]).toBe(0);
    expect(r.lower[at(-2.5, 5)]).toBe(-1);
  });

  it('fills burn, split and soot as bytes', () => {
    const map = new FireMap(rasterizeUnits([unit('eg', 1, 100), unit('og', 2, 104)], 1, 1));
    const r = map.r;
    expect(map.fill((i) => (i === 0 ? 1 : 0.5), () => 0.25)).toBe(true);
    const c = Math.floor((5 - r.z0) / r.cell) * r.w + Math.floor((5 - r.x0) / r.cell);
    expect(map.data[c * 4]).toBe(255);
    expect(map.data[c * 4 + 1]).toBe(128);
    expect(r.y0 + (map.data[c * 4 + 2]! / 255) * r.yRange).toBeCloseTo(104, 0);
    expect(map.data[c * 4 + 3]).toBe(64);
    const [x0, z0, w, d] = map.box();
    expect(x0).toBe(r.x0);
    expect(z0).toBe(r.z0);
    expect(w).toBe(r.w * r.cell);
    expect(d).toBe(r.h * r.cell);
  });

  it('skips an unchanged upload, resolves each unit once and clears previous glow', () => {
    const map = new FireMap(rasterizeUnits([unit('eg', 1, 100), unit('og', 2, 104)], 1, 1));
    expect(map.fill(() => 0, () => 0)).toBe(false);
    const sampled: number[] = [];
    expect(map.fill((i) => {
      sampled.push(i);
      return 0.8;
    }, (i) => i === 1 ? 0.8 : 0.4)).toBe(true);
    expect(sampled).toEqual([0, 1]);
    const before = map.data.slice();
    expect(map.fill(() => 0.8001, (i) => i === 1 ? 0.8001 : 0.4001)).toBe(false);
    expect(map.data).toEqual(before);
    expect(map.fill(() => 0, () => 0)).toBe(true);
    expect(map.data.every((v, i) => i % 4 === 2 ? v === before[i] : v === 0)).toBe(true);
  });
});
