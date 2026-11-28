/**
 * The Karlsbergquelle as a place (TASK-087): it exists in every era, it is registered, it lies on
 * the right of the ravine for the tour walking up from the Weiher, and everything that hangs on
 * its position (home, wakes, the tour's stop and markers, the brook) agrees with it. A change that
 * drops, hides or moves the spring fails here first.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ERAS } from '../src/core/era';
import { homeSpot } from '../src/systems/home';
import {
  OSM_SPRING,
  OVERFLOW_LIP,
  PIECES,
  QUELLE,
  REACH,
  RUNNEL,
  TOUR_PATH,
  TOUR_REACH,
  TRAIL,
  brookLine,
  canFind,
  canTouch,
  lookFor,
  overflow,
  rightOfTourPath,
  toLocal,
  toWorld,
  touchLocal,
  trailLine,
  waterSpec,
} from '../src/systems/quelle/layout';
import { SetBuilder } from '../src/systems/scenery/builder';
import { BOARD_AT, quelleSet } from '../src/systems/scenery/quelle';
import { SETS } from '../src/systems/scenery/sets';
import { HOME } from '../src/systems/story/hub/home';
import { loadPalaceData } from './interiors-fixture';

const ROOT = new URL('../', import.meta.url);
const text = (path: string) => readFileSync(new URL(path, ROOT), 'utf8');
const json = <T>(path: string) => JSON.parse(text(path)) as T;

const { h2025 } = loadPalaceData();
const heightAt = (x: number, z: number) => h2025.heightAt(x, z);
const yawOf = (deg: number) => (-deg * Math.PI) / 180;

interface Route { stops: { id: string; x: number; z: number; slots?: [number, number][] }[]; points: [number, number][] }
const fuehrung = json<Route>('content/routes/p-fuehrung.json');
const aufstieg = json<Route>('content/routes/p-aufstieg.json');

describe('the spring exists', () => {
  it('is a registered scenery set in all five eras, built from 150 m', () => {
    expect(SETS).toContain(quelleSet);
    expect(quelleSet).toMatchObject({ id: 'karlsbergquelle', x: QUELLE.x, z: QUELLE.z });
    expect([...quelleSet.eras].sort()).toEqual([...ERAS].sort());
    expect(quelleSet.range).toBeGreaterThanOrEqual(120);
    // the living water (and the touch) is a registered system
    expect(text('src/systems/index.ts')).toMatch(/import\('\.\/quelle'\)/);
  });

  it.each(ERAS)('builds stonework, a plate or front, and solids in %s', (era) => {
    for (const detailed of [false, true]) {
      const b = new SetBuilder(heightAt, detailed, detailed);
      quelleSet.build(b, { era, gateOpen: 0 });
      const geo = b.kit.build();
      const triangles = (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
      // the wall or front, the trough or basin, the spring house, the steps: thousands of faces
      expect(triangles, `${era} detailed=${detailed}`).toBeGreaterThan(3000);
      // and a budget: the procedural stonework stays a small share of a frame
      expect(triangles, `${era} detailed=${detailed}`).toBeLessThan(60_000);
      // wall, water vessel and spring house stop the player
      expect(b.solids.length, era).toBeGreaterThanOrEqual(3);
      if (era === 'today') {
        expect(b.signs.map((s) => s.text)).toEqual(expect.arrayContaining(['Karlsberg-\nquelle', 'Karlsbergquelle\nWaldPark Schloss Karlsberg']));
      }
      if (detailed) expect(b.models.length, era).toBeGreaterThan(5);
      geo.dispose();
    }
  });

  it.each(ERAS)('has water to touch in %s, level with a standing player', (era) => {
    const s = waterSpec(heightAt, era);
    const [tx, tz] = toWorld(...touchLocal(era));
    expect(Math.hypot(s.x - tx, s.z - tz)).toBeLessThan(0.01);
    const above = s.y - heightAt(s.x, s.z);
    expect(above, era).toBeGreaterThan(0.15);
    expect(above, era).toBeLessThan(1.3);
    expect(s.len * s.wid, era).toBeGreaterThan(0.5);
  });
});

describe('the spring is on the right of the gorge, walking up from the Weiher', () => {
  it('the reference path is the tour route and the OSM footpath', () => {
    // the tour walks these OSM nodes up the ravine (the last route leg forks off to the forecourt)
    const toRoute = (x: number, z: number) => {
      let best = Infinity;
      for (let i = 0; i + 1 < fuehrung.points.length; i++) {
        const [ax, az] = fuehrung.points[i]!;
        const [bx, bz] = fuehrung.points[i + 1]!;
        const l2 = (bx - ax) ** 2 + (bz - az) ** 2;
        const t = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
        best = Math.min(best, Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t));
      }
      return best;
    };
    for (const [x, z] of TOUR_PATH.slice(0, 3)) expect(toRoute(x, z), `${x}/${z}`).toBeLessThan(1);
    const nodes = json<{ nodes: number[] }>('public/data/paths.json').nodes;
    for (const [x, z] of TOUR_PATH) {
      let best = Infinity;
      for (let i = 0; i < nodes.length; i += 3) best = Math.min(best, Math.hypot(nodes[i]! - x, nodes[i + 2]! - z));
      expect(best, `${x}/${z}`).toBeLessThan(0.15);
    }
    // it climbs: the Weiher end is the low end
    expect(heightAt(...TOUR_PATH[0]!)).toBeLessThan(heightAt(...TOUR_PATH.at(-1)!) - 3);
  });

  it('the OSM spring node, the stonework and the water all lie to the right of that path', () => {
    expect(rightOfTourPath(OSM_SPRING.x, OSM_SPRING.z)).toBeGreaterThan(1.5);
    expect(rightOfTourPath(QUELLE.x, QUELLE.z)).toBeGreaterThan(4);
    const H = PIECES.house;
    const W = PIECES.wall;
    for (const [u, w] of [touchLocal('today'), touchLocal('1789'), [W.u0, W.w], [W.u1, W.w], [H.u, H.w], [PIECES.steps.u, PIECES.steps.w0]] as const) {
      expect(rightOfTourPath(...toWorld(u, w)), `${u}/${w}`).toBeGreaterThan(3);
    }
    // a point on the other flank is on the left (the sign of the helper)
    expect(rightOfTourPath(1066, -842)).toBeLessThan(-3);
  });

  it('stands at the foot of the south-west flank, within 5 m of the OSM node, facing the path', () => {
    expect(Math.hypot(QUELLE.x - OSM_SPRING.x, QUELLE.z - OSM_SPRING.z)).toBeLessThan(5);
    // the ground rises behind the wall (−w) and is nearly level across the forecourt (+w)
    const at = (u: number, w: number) => heightAt(...toWorld(u, w));
    expect(at(0, -4) - at(0, 2)).toBeGreaterThan(1.5);
    expect(Math.abs(at(0, 4) - at(0, 2))).toBeLessThan(0.4);
    // the front looks at the tour path: the path's nearest point is in front (+w), 4–9 m away
    const [, w] = toLocal(1064.2, -835.0);
    expect(w).toBeGreaterThan(4);
    expect(w).toBeLessThan(9);
    // the path's upper leg passes behind and above the spring house
    const [, wUp] = toLocal(1053.3, -825.1);
    expect(wUp).toBeLessThan(PIECES.house.w - PIECES.house.depth);
    expect(heightAt(1053.3, -825.1)).toBeGreaterThan(at(PIECES.house.u, PIECES.house.w) + 1);
  });

  it('the brook leaves the trough to the right and stays on the spring\'s side of the path', () => {
    for (const era of ERAS) {
      const line = brookLine(heightAt, era);
      const [u0] = toLocal(...line[0]!);
      expect(u0, era).toBeGreaterThan(touchLocal(era)[0]);
      expect(Math.min(...line.slice(0, 4).map(([x, z]) => Math.hypot(toLocal(x, z)[0] - RUNNEL[0], toLocal(x, z)[1] - RUNNEL[1]))), era).toBeLessThan(0.6);
      // down the ravine: every later sample is further right (+u) than the trough
      for (const [x, z] of line.slice(3)) expect(toLocal(x, z)[0], era).toBeGreaterThan(RUNNEL[0]);
      // beside the path, never across it, through the hollow
      for (const [x, z] of line.slice(0, 30)) expect(rightOfTourPath(x, z), `${era} ${x.toFixed(1)}/${z.toFixed(1)}`).toBeGreaterThan(0.9);
    }
  });

  it('today the trough runs over at its low end: a visible fall to the runnel', () => {
    const o = overflow(heightAt, 'today')!;
    expect(toLocal(o.x, o.z)[0]).toBeCloseTo(PIECES.trough.u + PIECES.trough.len / 2 + OVERFLOW_LIP, 6);
    expect(o.y - o.toY).toBeGreaterThan(0.3);
    expect(o.y).toBeLessThan(waterSpec(heightAt, 'today').y);
    for (const era of ERAS) if (lookFor(era) !== 'today') expect(overflow(heightAt, era), era).toBeNull();
  });

  it('the trail leads from the path to the forecourt and on to the hairpin, clear of the stonework', () => {
    const main = trailLine(TRAIL[0]!, 0.5);
    // it starts on the tour path below the spring and ends on the path's upper leg behind it
    expect(Math.abs(rightOfTourPath(main[0]!.x, main[0]!.z))).toBeLessThan(1);
    const local = main.map((p) => toLocal(p.x, p.z));
    expect(local[0]![0]).toBeGreaterThan(20);
    expect(local.at(-1)![1]).toBeLessThan(-2);
    // it passes the front of the trough within a few steps
    const front = Math.min(...local.map(([u, w]) => Math.hypot(u - PIECES.trough.u, w - PIECES.trough.w)));
    expect(front).toBeLessThan(3.2);
    expect(front).toBeGreaterThan(1.8);
    // never through the wall, the trough, the spring house or the board
    const W = PIECES.wall;
    const [bx, bz] = toWorld(BOARD_AT.u, BOARD_AT.w);
    for (const strand of TRAIL) {
      for (const p of trailLine(strand, 0.25)) {
        const [u, w] = toLocal(p.x, p.z);
        if (Math.abs(u) < W.u1 + 0.3) expect(w > PIECES.trough.w + 0.6 || w < PIECES.house.w - 2, `${u.toFixed(1)}/${w.toFixed(1)}`).toBe(true);
        expect(Math.hypot(p.x - bx, p.z - bz), 'board').toBeGreaterThan(p.half * 0.6);
      }
    }
  });
});

describe('what hangs on the position', () => {
  it('home is the spring: the ring around it, the wake spot before the trough, facing the water', () => {
    expect(homeSpot()).toMatchObject({ x: QUELLE.x, z: QUELLE.z });
    const { x, z, yaw } = HOME.spawn;
    expect(Math.hypot(x - QUELLE.x, z - QUELLE.z)).toBeLessThan(HOME.r);
    const [u, w] = toLocal(x, z);
    expect(Math.abs(u - PIECES.trough.u)).toBeLessThan(0.6);
    expect(w).toBeGreaterThan(PIECES.trough.w + PIECES.trough.r + 0.5);
    for (const era of ERAS) expect(canTouch(x, z, yawOf(yaw), era), era).toBe(true);
    // not from behind
    expect(canTouch(x, z, yawOf(yaw + 180), 'today')).toBe(false);
  });

  it('every chapter wakes and checkpoints at the spring face the water', () => {
    const files = ['00-tour', '01-kapitel-1', '02-kapitel-2', '03-kapitel-3', '04-kapitel-4', '05-enden'];
    let seen = 0;
    const walk = (o: unknown, where: string): void => {
      if (Array.isArray(o)) return o.forEach((v, i) => walk(v, `${where}[${i}]`));
      if (!o || typeof o !== 'object') return;
      const p = o as { x?: unknown; z?: unknown; yaw?: unknown; era?: unknown };
      if (typeof p.x === 'number' && typeof p.z === 'number' && typeof p.yaw === 'number' && Math.hypot(p.x - QUELLE.x, p.z - QUELLE.z) < HOME.r) {
        seen++;
        const era = p.era === '1789' ? '1789' : 'today';
        expect(canTouch(p.x, p.z, yawOf(p.yaw), era), where).toBe(true);
      }
      for (const [k, v] of Object.entries(o)) walk(v, `${where}.${k}`);
    };
    for (const f of files) walk(json(`content/story/${f}.story.json`), f);
    expect(seen).toBeGreaterThanOrEqual(8);
  });

  it('the tour stops before the spring: the guide on the trail, the group across it, the trough free', () => {
    const stop = fuehrung.stops.find((s) => s.id === 'quelle')!;
    expect(fuehrung.points.at(-1)).toEqual([stop.x, stop.z]);
    expect(aufstieg.stops[0]).toMatchObject({ id: 'quelle', x: stop.x, z: stop.z });
    expect(aufstieg.points[0]).toEqual([stop.x, stop.z]);
    const [u, w] = toLocal(stop.x, stop.z);
    // in front of the wall, beside the forecourt, a few steps from the water
    expect(w).toBeGreaterThan(PIECES.edge.w);
    expect(Math.hypot(u - PIECES.trough.u, w - PIECES.trough.w)).toBeLessThan(5);
    expect(Math.hypot(stop.x - HOME.spawn.x, stop.z - HOME.spawn.z)).toBeGreaterThan(1.5);
    // the last route legs come down the trail, never over the stonework
    for (const [x, z] of fuehrung.points.slice(-3)) expect(toLocal(x, z)[1]).toBeGreaterThan(PIECES.edge.w);
    // 14 members: on the far side of the trail, clear of the way to the water and of the guide
    expect(stop.slots).toHaveLength(14);
    for (const [x, z] of stop.slots!) {
      const [su, sw] = toLocal(x, z);
      expect(sw, `${x}/${z}`).toBeGreaterThan(5);
      expect(sw, `${x}/${z}`).toBeLessThan(9);
      expect(Math.abs(su), `${x}/${z}`).toBeLessThan(8);
      expect(Math.hypot(x - stop.x, z - stop.z), `${x}/${z}`).toBeGreaterThan(1.2);
      expect(Math.hypot(x - HOME.spawn.x, z - HOME.spawn.z), `${x}/${z}`).toBeGreaterThan(2.5);
    }
    const slots = stop.slots!;
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) expect(Math.hypot(slots[i]![0] - slots[j]![0], slots[i]![1] - slots[j]![1])).toBeGreaterThan(1.1);
  });

  it('the tour\'s markers at the trough are reachable and the find has a prompt (TASK-081)', () => {
    interface Beat { id: string; enter?: unknown[]; exit?: unknown[]; on?: { do: unknown[] }[]; complete?: unknown }
    const tour = json<{ beats: Beat[]; wake: { x: number; z: number; yaw: number }; leave: unknown[] }>('content/story/00-tour.story.json');
    expect(tour.wake).toMatchObject(HOME.spawn);
    const beat = (id: string) => tour.beats.find((b) => b.id === id)!;
    const objectives = (b: Beat) =>
      [...(b.enter ?? []), ...(b.exit ?? []), ...(b.on ?? []).flatMap((r) => r.do)].filter((a): a is { do: 'objective'; x: number; z: number; text: string } => (a as { do?: string }).do === 'objective' && typeof (a as { x?: unknown }).x === 'number');
    const marks = ['t14', 't15', 't16', 't17'].flatMap((id) => objectives(beat(id)));
    expect(marks.length).toBeGreaterThanOrEqual(4);
    for (const m of marks) {
      const [u, w] = toLocal(m.x, m.z);
      // on the forecourt: before the trough (never behind the wall or in the log), inside the find reach
      expect(w, m.text).toBeGreaterThan(PIECES.trough.w + PIECES.trough.r + 0.4);
      expect(Math.abs(u), m.text).toBeLessThan(1.5);
      expect(canFind(m.x, m.z, 'today'), m.text).toBe(true);
      // and on the trail side: a straight walk from the guide's stop reaches it
      expect(rightOfTourPath(m.x, m.z), m.text).toBeGreaterThan(0);
    }
    // the find: the glint sets the flag the E prompt needs; E or walking up completes it
    const t16 = beat('t16');
    expect(JSON.stringify(t16.on)).toContain('"quelle.find":true');
    expect(t16.complete).toMatchObject({ any: [{ event: 'quelle:find' }, { all: [{ enter: { r: 1.45, era: 'today' } }, { timer: 10 }] }] });
    expect(JSON.stringify(t16.exit)).toContain('"quelle.find":null');
    expect(JSON.stringify(tour.leave)).toContain('"quelle.find":null');
  });

  it('the find prompt asks for no facing: anywhere before the trough, never from behind the wall', () => {
    const [tu, tw] = touchLocal('today');
    for (const [du, dw] of [[0, 1.1], [1.6, 1.2], [-1.8, 1.0], [0, TOUR_REACH - 0.1], [2.2, 2.2]] as const) {
      const [x, z] = toWorld(tu + du, tw + dw);
      expect(canFind(x, z, 'today'), `${du}/${dw}`).toBe(true);
    }
    expect(TOUR_REACH).toBeGreaterThan(REACH);
    expect(canFind(...toWorld(tu, tw + TOUR_REACH + 0.3), 'today')).toBe(false);
    expect(canFind(...toWorld(tu, PIECES.wall.w - 1), 'today')).toBe(false);
  });
});
