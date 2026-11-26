/**
 * Travel (src/systems/travel): survey points (placement, rules), route POIs (spacing, clear of the
 * story's places and of buildings, every Fundstück once, guards per era), the travel rules, and
 * the way-finding A* (world/route.ts) round a wall and through a gap.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Footprint } from '../src/data/types';
import { LAUF_DELAY, SPRINT_BOOST, laufschrittTarget } from '../src/systems/travel/laufschritt';
import { LORE } from '../src/systems/travel/lore';
import { QUELLE, REACH, canTouch, toWorld, touchLocal } from '../src/systems/quelle/layout';
import { decodeH2025, quantToMetres } from '../src/data/decode';
import type { TerrainMeta } from '../src/data/types';
import { Heightfield } from '../src/world/heightfield';
import { ACTIVATE_RADIUS, ANNOUNCE_MIN, SURVEY_POINTS, TRIPOD_SEED_BASE, activateRadius, announceFor, cardMayTakeE, knownPoints, livePointIds, pointById, travelBlock, wayLineBlocked } from '../src/systems/travel/points';
import { KEEP_CLEAR, KEEP_CLEAR_R, POI_SPACING, ROUTES, cacheLoot, generatePois } from '../src/systems/travel/pois';
import { ENEMIES } from '../src/rpg/enemies';
import { FootprintCollider, type Ring } from '../src/world/collision';
import { PATH_COST, findRoute, lineFree, pathGroundCost, pathLength } from '../src/world/route';
import { loadWorldData } from './world-data';

const footprints = (JSON.parse(readFileSync(new URL('../public/data/palace/footprints.json', import.meta.url), 'utf8')) as { buildings: Footprint[] }).buildings;
const collider = new FootprintCollider(footprints.map((f) => f.ring as Ring));
const inBuilding = (x: number, z: number) => collider.footprintAt(x, z) >= 0;

/** Every x/z the story and quest files use (anchors, NPCs, objectives, clues). */
function contentPlaces(): { x: number; z: number; r?: number; npc?: boolean }[] {
  const out: { x: number; z: number; r?: number; npc?: boolean }[] = [];
  const walk = (o: unknown, npc = false): void => {
    if (!o || typeof o !== 'object') return;
    const r = o as Record<string, unknown>;
    if (typeof r.x === 'number' && typeof r.z === 'number') out.push({ x: r.x, z: r.z, r: typeof r.r === 'number' ? r.r : undefined, npc: npc || r.do === 'npc' });
    for (const v of Object.values(r)) walk(v, npc || r.do === 'npc');
  };
  for (const dir of ['content/story', 'content/quests']) {
    for (const f of readdirSync(new URL(`../${dir}`, import.meta.url))) {
      if (!f.endsWith('.json') || f.startsWith('99')) continue;
      walk(JSON.parse(readFileSync(new URL(`../${dir}/${f}`, import.meta.url), 'utf8')));
    }
  }
  return out;
}

describe('survey points', () => {
  it('stand outside every building, inside the land, apart from each other', () => {
    for (const p of SURVEY_POINTS) {
      expect(inBuilding(p.x, p.z), p.id).toBe(false);
      expect(p.x).toBeGreaterThan(160);
      expect(p.x).toBeLessThan(2290);
      for (const q of SURVEY_POINTS) if (q !== p) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(90);
    }
  });

  it('keep 4 m from the NPC places and lie inside the time anchors they serve', () => {
    const places = contentPlaces();
    for (const p of SURVEY_POINTS) {
      for (const c of places) if (c.npc) expect(Math.hypot(c.x - p.x, c.z - p.z), `${p.id} vs npc ${c.x}/${c.z}`).toBeGreaterThan(4);
    }
    // the anchors where Q works (ehrenhof, zwinger, torhaus, taleingang, karlslust)
    const anchors: [string, number, number, number][] = [
      ['ehrenhof', 1222, -1119, 16],
      ['zwinger', 1165, -1571, 15],
      ['torhaus', 1680, -400, 30],
      ['taleingang', 497, -900, 25],
      ['karlslust', 1822, 70, 14],
      ['standpunkt', 1386, -1477, 60],
    ];
    for (const [id, x, z, r] of anchors) {
      const p = SURVEY_POINTS.find((s) => s.id === id)!;
      const d = Math.hypot(p.x - x, p.z - z);
      expect(d, id).toBeLessThan(r);
      expect(d, id).toBeGreaterThan(4);
    }
  });

  it('only the Karlsbergquelle (home) is known at the start; walked or announced points join', () => {
    expect(knownPoints([], []).map((p) => p.id)).toEqual(['karlsbergquelle']);
    expect(knownPoints(['zwinger'], ['karlslust']).map((p) => p.id).sort()).toEqual(['karlsbergquelle', 'karlslust', 'zwinger']);
  });

  it('the Feldstation point is retired: gone from the list, and an old save that knew it still loads', () => {
    expect(pointById('feldstation')).toBeUndefined();
    // an old save's travel slice: the retired id (and junk) drop out, the rest keeps its order
    const old = ['feldstation', 'ehrenhof', 'feldstation', 'zwinger', 'ehrenhof', 42, 'nirgendwo'];
    expect(livePointIds(old)).toEqual(['ehrenhof', 'zwinger']);
    expect(livePointIds(undefined)).toEqual([]);
    expect(knownPoints(['feldstation', 'ehrenhof'], ['feldstation']).map((p) => p.id).sort()).toEqual(['ehrenhof', 'karlsbergquelle']);
    // Laub never announces a retired point
    expect(announceFor({ x: 776, z: -902 }, { x: 1800, z: 0 }, [])).toBeNull();
  });

  it('the remaining tripods keep their look (seed = old list index)', () => {
    // the Ehrenhof was index 1 (+3) while the Feldstation stood first: now index 0 (+4)
    expect(SURVEY_POINTS.findIndex((p) => p.id === 'ehrenhof') + TRIPOD_SEED_BASE).toBe(4);
    expect(SURVEY_POINTS.findIndex((p) => p.id === 'karlsbergquelle') + TRIPOD_SEED_BASE).toBe(14);
  });

  it('Laub announces the point beside a far goal, never a near one', () => {
    expect(announceFor({ x: 1822, z: 70 }, { x: 1165, z: -1571 }, [])?.id).toBe('karlslust');
    expect(announceFor({ x: 1822, z: 70 }, { x: 1800, z: 0 }, [])).toBeNull();
    expect(announceFor({ x: 1822, z: 70 }, { x: 1165, z: -1571 }, ['karlslust'])).toBeNull();
    expect(announceFor({ x: 600, z: -1600 }, { x: 1800, z: 0 }, [])).toBeNull();
  });

  it('announces a point near the goal once the player is at least 400 m away', () => {
    expect(ANNOUNCE_MIN).toBe(400);
    expect(announceFor({ x: 1222, z: -1119 }, { x: 1222 - 350, z: -1119 }, [])).toBeNull();
    expect(announceFor({ x: 1222, z: -1119 }, { x: 1222 - 410, z: -1119 }, [])?.id).toBe('ehrenhof');
  });

  it('journeys: free in the present, in the past only while nothing holds you', () => {
    const w = { era: 'today', inCombat: false, hunt: 'calm', threat: false, locked: false, busy: false, flying: false };
    expect(travelBlock(w)).toBeNull();
    expect(travelBlock({ ...w, threat: true })).toBeNull();
    expect(travelBlock({ ...w, era: '1789', threat: true })).toBe('threat');
    expect(travelBlock({ ...w, era: '1789' })).toBeNull();
    expect(travelBlock({ ...w, inCombat: true })).toBe('combat');
    expect(travelBlock({ ...w, hunt: 'chasing' })).toBe('hunt');
    expect(travelBlock({ ...w, era: '1793-02', locked: true })).toBe('locked');
    expect(travelBlock({ ...w, busy: true })).toBe('busy');
  });
});

describe('route POIs', () => {
  const pois = generatePois(ROUTES, { blocked: inBuilding });

  it('fill every route about every 120 m with all three kinds', () => {
    for (const r of ROUTES) {
      const mine = pois.filter((p) => p.id.startsWith(`poi.${r.id}.`));
      let L = 0;
      for (let i = 0; i + 1 < r.pts.length; i++) L += Math.hypot(r.pts[i + 1]![0] - r.pts[i]![0], r.pts[i + 1]![1] - r.pts[i]![1]);
      expect(mine.length, r.id).toBeGreaterThanOrEqual(Math.floor(L / POI_SPACING) - 2);
    }
    for (const kind of ['cache', 'lore', 'shrine'] as const) expect(pois.filter((p) => p.kind === kind).length, kind).toBeGreaterThan(8);
    for (const era of ['today', '1789', '1793-02', '1793-07', '1796']) expect(pois.some((p) => p.era === era && p.kind === 'cache'), era).toBe(true);
  });

  it('keep clear of buildings, of each other and of every place the story uses', () => {
    const places = contentPlaces();
    for (const p of pois) {
      expect(inBuilding(p.x, p.z), p.id).toBe(false);
      for (const [x, z, e] of KEEP_CLEAR) if (!e || e === p.era) expect(Math.hypot(p.x - x, p.z - z), p.id).toBeGreaterThanOrEqual(KEEP_CLEAR_R);
      for (const c of places) expect(Math.hypot(p.x - c.x, p.z - c.z), `${p.id} vs ${c.x}/${c.z}`).toBeGreaterThan(Math.max(18, c.r !== undefined && c.r <= 40 ? c.r * 0.5 : 0));
      for (const q of pois) if (q !== p && q.era === p.era) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(POI_SPACING * 0.5);
    }
  });

  it('use every Fundstück at most once, in its own era; caches have guards of that era', () => {
    const lore = pois.filter((p) => p.lore).map((p) => p.lore!);
    expect(new Set(lore).size).toBe(lore.length);
    for (const p of pois) {
      if (p.lore) expect(LORE.find((l) => l.id === p.lore)!.era).toBe(p.era);
      if (p.kind === 'cache') {
        const e = ENEMIES.find((x) => x.id === p.enemy);
        expect(e, p.enemy).toBeDefined();
        expect(e!.boss ?? false).toBe(false);
        expect(e!.eras).toContain(p.era);
        expect(p.count).toBeGreaterThanOrEqual(2);
        expect(p.count).toBeLessThanOrEqual(4);
      }
    }
    expect(lore.length).toBeGreaterThan(14);
  });

  it('is deterministic, and a cache holds one or two supplies', () => {
    expect(generatePois(ROUTES, { blocked: inBuilding })).toEqual(pois);
    for (const p of pois.filter((x) => x.kind === 'cache')) {
      const l = cacheLoot(p.id);
      expect(l.length).toBeGreaterThanOrEqual(1);
      expect(l.length).toBeLessThanOrEqual(2);
    }
  });
});

describe('way-finding (world/route.ts)', () => {
  // a wall from z = −20 to z = 20 at x = 0, with a gap at z ∈ [30, 34] beyond its end
  const wall = (x: number, z: number) => Math.abs(x) < 1 && z > -20 && z < 20;

  it('goes straight when the line is free', () => {
    const r = findRoute(-10, 30, 10, 30, wall);
    expect(r).toEqual({ points: [[-10, 30], [10, 30]], complete: true, straight: true, expanded: 0 });
  });

  it('returns only the start when the player is enclosed', () => {
    const enclosure = (x: number, z: number) => {
      const d = Math.max(Math.abs(x), Math.abs(z));
      return d >= 0.75 && d <= 2;
    };
    const r = findRoute(0, 0, 8, 0, enclosure);
    expect(r).toMatchObject({ points: [[0, 0]], complete: false, straight: false });
  });

  it('does not complete a straight route to a blocked goal half a metre away', () => {
    const blocked = (x: number, z: number) => Math.hypot(x - 0.5, z) < 0.1;
    const r = findRoute(0, 0, 0.5, 0, blocked);
    expect(r).toMatchObject({ points: [[0, 0]], complete: false, straight: false });
  });

  it('stops at the reachable approach to a blocked goal', () => {
    const barrier = (x: number) => x >= 5 && x <= 7;
    const r = findRoute(0, 0, 6, 0, barrier);
    expect(r).toMatchObject({ points: [[0, 0], [4, 0]], complete: false, straight: false });
  });

  it('ends a partial route at the closest reachable point on its side of a wall', () => {
    const barrier = (x: number) => x >= 5 && x <= 7;
    const r = findRoute(0, 0, 10, 0, barrier);
    expect(r).toMatchObject({ points: [[0, 0], [4, 0]], complete: false, straight: false });
  });

  it('checks the last leg from the search grid to an off-grid goal', () => {
    const barrier = (x: number) => x >= 4.2 && x <= 4.8;
    const r = findRoute(0, 0, 4.9, 0, barrier);
    expect(r).toMatchObject({ points: [[0, 0], [4, 0]], complete: false, straight: false });
  });

  it('checks the only available grid leg when a thin wall misses its midpoint', () => {
    const thin = (x: number) => x >= 0.3 && x <= 0.7;
    const r = findRoute(0, 0, 8, 0, thin, { margin: 0 });
    expect(r).toMatchObject({ points: [[0, 0]], complete: false, straight: false });
  });

  it('walks round a wall instead of through it, and every leg is free', () => {
    const r = findRoute(-10, 0, 10, 0, wall);
    expect(r.complete).toBe(true);
    expect(r.straight).toBe(false);
    for (let i = 0; i + 1 < r.points.length; i++) expect(lineFree(r.points[i]![0], r.points[i]![1], r.points[i + 1]![0], r.points[i + 1]![1], wall, 0.5)).toBe(true);
    expect(pathLength(r.points)).toBeGreaterThan(40);
    expect(pathLength(r.points)).toBeLessThan(60);
  });

  it('never steps through a thin wall between two free cells: it takes the door', () => {
    // a 0.6 m wall on the half-cell between grid cells (x = 1), a 3 m door at z ∈ [8, 11]
    const thin = (x: number, z: number) => Math.abs(x - 1) < 0.3 && !(z > 8 && z < 11) && z > -30 && z < 30;
    const r = findRoute(-6, -2, 8, -2, thin);
    expect(r.complete).toBe(true);
    for (let i = 0; i + 1 < r.points.length; i++) expect(lineFree(r.points[i]![0], r.points[i]![1], r.points[i + 1]![0], r.points[i + 1]![1], thin, 0.1)).toBe(true);
    expect(r.points.some(([x, z]) => z > 6 && z < 13 && Math.abs(x - 1) < 4)).toBe(true);
  });

  it('finds the palace way round the east wing to the gallery\'s end (real footprints)', () => {
    const blocked = (x: number, z: number) => collider.resolve(x, z, 0.45).hit;
    // from the garden side of the Corps de logis to Hanne at the gallery's east pavilion
    const r = findRoute(1262, -1158, 1287, -1228, blocked);
    expect(r.complete).toBe(true);
    for (let i = 0; i + 1 < r.points.length; i++) expect(lineFree(r.points[i]![0], r.points[i]![1], r.points[i + 1]![0], r.points[i + 1]![1], blocked, 0.5)).toBe(true);
  });
});

describe('prologue routes (playtest round 5)', () => {
  it('no guard on a prologue route needs the Bannlicht (it is taught at the prologue’s end)', () => {
    const p = generatePois().filter((x) => x.chapter === 'prolog' && x.kind === 'cache');
    expect(p.length).toBeGreaterThan(0);
    for (const x of p) expect(x.enemy, x.id).not.toBe('irrlicht');
  });
});

describe('the Wegweiser straight-line check (playtest round 10, F-10)', () => {
  // a lake round (0, 20) r 8, and a tree trunk at (0, 5)
  const water = (x: number, z: number) => Math.hypot(x, z - 20) < 8;
  const blocked = (x: number, z: number) => water(x, z) || Math.hypot(x, z - 5) < 0.5;

  it('in the present day only water counts: the lake detour shows, a tree does not', () => {
    expect(wayLineBlocked(true, { x: 0, z: 0 }, { x: 0, z: 30 }, blocked, water)).toBe(true);
    expect(wayLineBlocked(true, { x: 0, z: 0 }, { x: 0, z: 10 }, blocked, water)).toBe(false);
  });

  it('in the past everything that stops the player counts', () => {
    expect(wayLineBlocked(false, { x: 0, z: 0 }, { x: 0, z: 10 }, blocked, water)).toBe(true);
    expect(wayLineBlocked(false, { x: 20, z: 0 }, { x: 20, z: 30 }, blocked, water)).toBe(false);
  });
});

describe('the Weiher walk on real terrain (playtest round 10, F-10)', () => {
  const w = loadWorldData();
  // the runtime filter of the travel system (src/systems/travel/index.ts constructor)
  const runtimeBlocked = (x: number, z: number) => w.footprints.footprintAt(x, z) >= 0 || w.h1789.slopeDeg(x, z) > 26 || w.water(x, z);
  const live = generatePois(ROUTES, { blocked: runtimeBlocked });
  const nearPath = (x: number, z: number, r: number) => {
    for (let dz = -r; dz <= r; dz += 1) for (let dx = -r; dx <= r; dx += 1) if (Math.hypot(dx, dz) <= r && w.pathAt(x + dx, z + dz) > 0.3) return true;
    return false;
  };

  it('every p-hang POI survives the terrain filter (p-hang.1 stands on the shore, not in the Weiher)', () => {
    const hang = live.filter((p) => p.id.startsWith('poi.p-hang.')).map((p) => p.id);
    expect(hang).toEqual(['poi.p-hang.1', 'poi.p-hang.2', 'poi.p-hang.3', 'poi.p-hang.4']);
    for (const p of live) expect(w.water(p.x, p.z), p.id).toBe(false);
  });

  it('p-weiher puts POIs on the walk round the shore, one beside the Waldweg', () => {
    const weiher = live.filter((p) => p.id.startsWith('poi.p-weiher.'));
    expect(weiher.length).toBeGreaterThanOrEqual(2);
    for (const p of weiher) {
      expect(p.era).toBe('today');
      expect(p.chapter).toBe('prolog');
      for (const q of live) if (q !== p && q.era === p.era) expect(Math.hypot(p.x - q.x, p.z - q.z), `${p.id} vs ${q.id}`).toBeGreaterThan(POI_SPACING * 0.5);
    }
    expect(weiher.some((p) => nearPath(p.x, p.z, 20)), 'a POI within 20 m of the OSM path').toBe(true);
    // the route itself follows the path: its shore points lie on path cells
    const route = ROUTES.find((r) => r.id === 'p-weiher')!;
    for (const [x, z] of route.pts.slice(0, 6)) expect(nearPath(x, z, 4), `${x}/${z}`).toBe(true);
  });

  it('adding p-weiher (then p-fuehrung, appended last) leaves every saved POI id where it was', () => {
    expect(ROUTES[ROUTES.length - 2]!.id).toBe('p-weiher');
    const before = generatePois(ROUTES.filter((r) => r.id !== 'p-weiher' && r.id !== 'p-fuehrung'), { blocked: runtimeBlocked });
    expect(live.filter((p) => !p.id.startsWith('poi.p-weiher.') && !p.id.startsWith('poi.p-fuehrung.'))).toEqual(before);
  });

  it('the tour route p-fuehrung is appended last and stays inert until its stops are authored', () => {
    // the old prologue routes keep their order (saved ids are poi.<route>.<n>)
    const ids = ROUTES.map((r) => r.id);
    expect(ids.indexOf('p-hang')).toBeLessThan(ids.indexOf('p-garten'));
    expect(ids.indexOf('p-garten')).toBeLessThan(ids.indexOf('p-weiher'));
    expect(ids[ids.length - 1]).toBe('p-fuehrung');
    const tour = ROUTES.find((r) => r.id === 'p-fuehrung')!;
    expect(tour).toMatchObject({ chapter: 'prolog', era: 'today' });
    // an empty route yields nothing and moves nothing
    expect(generatePois([tour])).toEqual([]);
    expect(generatePois(ROUTES.filter((r) => r.id !== 'p-fuehrung'), { blocked: runtimeBlocked })).toEqual(live);
  });
});

describe('the Ehrenhof point is eingemessen at the Q spot (playtest round 10, A2)', () => {
  it('takes 16 m, so the compass rose where the story asks for Q lies inside', () => {
    const e = pointById('ehrenhof')!;
    expect(activateRadius(e)).toBe(16);
    // The K1 time anchor and return waypoint both lie inside the tripod's activation radius.
    for (const [x, z] of [[1222, -1119], [1218, -1118]] as const) expect(Math.hypot(e.x - x, e.z - z)).toBeLessThan(activateRadius(e));
  });

  it('every other point keeps the plain 7 m, and no radius reaches another point', () => {
    for (const p of SURVEY_POINTS) {
      if (p.id !== 'ehrenhof') expect(activateRadius(p), p.id).toBe(ACTIVATE_RADIUS);
      for (const q of SURVEY_POINTS) if (q !== p) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(activateRadius(p) + activateRadius(q));
    }
  });
});

describe('the Laufschritt ramp (playtest round 10, D1)', () => {
  it('begins after 1.0 s of held sprint (was 1.8 s) and reaches ×1.45 by 2.4 s', () => {
    expect(LAUF_DELAY).toBe(1.0);
    expect(laufschrittTarget(0.99)).toBe(0);
    expect(laufschrittTarget(1.7)).toBeCloseTo(SPRINT_BOOST * 0.5, 5);
    expect(laufschrittTarget(2.4)).toBeCloseTo(SPRINT_BOOST, 5);
    expect(laufschrittTarget(10)).toBe(SPRINT_BOOST);
  });

  it('with the travel system easing (×3 per s), the speed is past ×1.3 within 3 s of holding Shift', () => {
    // the same easing as TravelSystem.sprintBoost
    let held = 0;
    let boost = 0;
    let t = 0;
    const dt = 1 / 60;
    while (boost < 0.3 && t < 10) {
      held += dt;
      boost += (laufschrittTarget(held) - boost) * Math.min(1, dt * 3);
      t += dt;
    }
    expect(t).toBeLessThan(3.0);
    expect(t).toBeGreaterThan(LAUF_DELAY);
  });
});

describe('the Wegweiser follows the paths (playtest round 10, B2)', () => {
  /** Share of the polyline (sampled every 1 m, up to `upto` m) within `r` m of a path cell. */
  function onPathShare(pts: readonly [number, number][], pathAt: (x: number, z: number) => number, upto = Infinity, r = 2): number {
    const near = (x: number, z: number) => {
      for (let dz = -r; dz <= r; dz += 1) for (let dx = -r; dx <= r; dx += 1) if (pathAt(x + dx, z + dz) > 0.3) return true;
      return false;
    };
    let on = 0;
    let all = 0;
    for (let i = 0; i + 1 < pts.length && all < upto; i++) {
      const [ax, az] = pts[i]!;
      const [bx, bz] = pts[i + 1]!;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
      for (let k = 0; k < n && all < upto; k++) {
        const t = (k + 0.5) / n;
        all++;
        if (near(ax + (bx - ax) * t, az + (bz - az) * t)) on++;
      }
    }
    return all ? on / all : 0;
  }

  // synthetic: a pond in the middle; a 2 m path runs round its north side in a wide bow
  const pond = (x: number, z: number) => Math.hypot(x, z) < 20;
  const onBow = (x: number, z: number) => {
    // the bow: from (-30, 0) up to z = -24, across, and down to (30, 0): 108 m × 0.6 beats the 74 m round the pond
    if (Math.abs(z + 24) < 1.5 && Math.abs(x) <= 30) return 1;
    if (Math.abs(Math.abs(x) - 30) < 1.5 && z <= 0 && z >= -24) return 1;
    return 0;
  };

  it('without costs the route hugs the pond; with the path discount it takes the path bow', () => {
    const plain = findRoute(-30, 0, 30, 0, pond);
    expect(onPathShare(plain.points, onBow, Infinity, 1)).toBeLessThan(0.5);
    const r = findRoute(-30, 0, 30, 0, pond, { cost: pathGroundCost(onBow), minCost: PATH_COST });
    expect(r.complete).toBe(true);
    expect(onPathShare(r.points, onBow, Infinity, 1)).toBeGreaterThan(0.9);
    // every leg is free, and the string pulling did not cut the bow's corners across the grass
    for (let i = 0; i + 1 < r.points.length; i++) expect(lineFree(r.points[i]![0], r.points[i]![1], r.points[i + 1]![0], r.points[i + 1]![1], pond, 0.5)).toBe(true);
    expect(pathLength(r.points)).toBeGreaterThan(100);
  });

  it('a free straight line stays straight with costs too (no search, no price)', () => {
    const r = findRoute(-30, 30, 30, 30, pond, { cost: pathGroundCost(onBow), minCost: PATH_COST });
    expect(r.straight).toBe(true);
    expect(r.expanded).toBe(0);
  });

  it('real data: from the Damm towards the hohe Stufe the route takes the Waldweg round the Weiher, in a few ms', { timeout: 30_000 }, () => {
    const w = loadWorldData();
    const water = w.water;
    const cost = pathGroundCost(w.pathAt);
    // warm-up (JIT), then the measured run
    findRoute(816, -884, 1237, -966, water, { maxExpand: 40000, cost, minCost: PATH_COST });
    const t0 = performance.now();
    const runs = 5;
    let r = findRoute(816, -884, 1237, -966, water, { maxExpand: 40000, cost, minCost: PATH_COST });
    for (let k = 1; k < runs; k++) r = findRoute(816, -884, 1237, -966, water, { maxExpand: 40000, cost, minCost: PATH_COST });
    const ms = (performance.now() - t0) / runs;
    const plain = findRoute(816, -884, 1237, -966, water, { maxExpand: 40000 });
    console.info(`[B2] Damm -> hohe Stufe: ${ms.toFixed(1)} ms per route, ${r.expanded} cells expanded (plain ${plain.expanded}); on path: first 70 m ${(onPathShare(r.points, w.pathAt, 70) * 100).toFixed(0)} %, all ${(onPathShare(r.points, w.pathAt) * 100).toFixed(0)} % (plain ${(onPathShare(plain.points, w.pathAt) * 100).toFixed(0)} %)`);
    expect(r.straight).toBe(false);
    expect(r.expanded).toBeLessThan(40000);
    // the motes show the first 70 m: all of it on the north-shore path
    expect(onPathShare(r.points, w.pathAt, 70)).toBeGreaterThan(0.9);
    expect(onPathShare(r.points, w.pathAt)).toBeGreaterThan(0.6);
    expect(onPathShare(r.points, w.pathAt)).toBeGreaterThan(onPathShare(plain.points, w.pathAt) + 0.3);
    // it goes round the north shore, never into the water
    for (let i = 0; i + 1 < r.points.length; i++) expect(lineFree(r.points[i]![0], r.points[i]![1], r.points[i + 1]![0], r.points[i + 1]![1], water, 0.5)).toBe(true);
    expect(r.points.some(([x, z]) => x > 840 && x < 940 && z < -900)).toBe(true);
    // performance budget (measured ~10 ms on a laptop; generous for CI)
    expect(ms).toBeLessThan(150);
  });
});

describe('the Karlsbergquelle tripod keeps clear of the spring (playtest round 10, A4)', () => {
  const p = pointById('karlsbergquelle')!;
  // the story's spring spot (prologue P3q objective and its 5 m "vor den Trog stellen" step)
  const STORY = { x: 1059.3, z: -833.1, r: 5 };
  // where a journey puts the player (TravelSystem.go: beside the tripod, +2.2 / +2.2)
  const arrival = { x: p.x + 2.2, z: p.z + 2.2 };

  it('stands ≥ 4 m from the anchor, and its 7 m circle never reaches the trough\'s E zone', () => {
    expect(p).toBeDefined();
    expect(SURVEY_POINTS[SURVEY_POINTS.length - 1]!.id).toBe('karlsbergquelle');
    expect(Math.hypot(p.x - QUELLE.x, p.z - QUELLE.z)).toBeGreaterThan(4);
    for (const era of ['today', '1789'] as const) {
      const [tx, tz] = toWorld(...touchLocal(era));
      const d = Math.hypot(p.x - tx, p.z - tz);
      // nowhere a player can touch the water is the tripod activated (no card pops at the trough)
      expect(d, era).toBeGreaterThan(activateRadius(p) + REACH);
      // and an arriving traveller stands well outside the reach
      expect(Math.hypot(arrival.x - tx, arrival.z - tz), era).toBeGreaterThan(REACH + 8);
      for (let a = 0; a < 360; a += 15) {
        const yaw = (a * Math.PI) / 180;
        expect(canTouch(arrival.x, arrival.z, yaw, era)).toBe(false);
        expect(canTouch(p.x, p.z, yaw, era)).toBe(false);
      }
    }
    // the story's 5 m step zone at the spring lies outside the activation circle too
    expect(Math.hypot(p.x - STORY.x, p.z - STORY.z)).toBeGreaterThan(activateRadius(p) + STORY.r);
    // and it is still the spring's point: within 20 m, Laub's "Wasser" line plays inside 12 m of it
    expect(Math.hypot(p.x - STORY.x, p.z - STORY.z)).toBeLessThan(20);
  });

  it('the card never takes E while the spring (or a door, or an NPC) owns it', () => {
    expect(cardMayTakeE({})).toBe(true);
    expect(cardMayTakeE({ 'e.owner': 'quelle' })).toBe(false);
    expect(cardMayTakeE({ 'npc.near': 'laub' })).toBe(false);
  });

  it('stands on walkable ground in the present and in 1789 (real terrain), not in the brook', () => {
    const w = loadWorldData();
    const dir = new URL('../public/data/terrain/', import.meta.url);
    const meta = JSON.parse(readFileSync(new URL('meta.json', dir), 'utf8')) as TerrainMeta;
    const h2025 = new Heightfield(w.grid, quantToMetres(decodeH2025(new Uint8Array(inflateSync(readFileSync(new URL('h2025.u16.deflate', dir)))), meta), meta));
    for (const [x, z] of [[p.x, p.z], [arrival.x, arrival.z]] as const) {
      expect(w.water(x, z)).toBe(false);
      expect(h2025.slopeDeg(x, z)).toBeLessThan(26);
      expect(w.h1789.slopeDeg(x, z)).toBeLessThan(26);
      expect(w.footprints.footprintAt(x, z)).toBe(-1);
    }
  });
});
