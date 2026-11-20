/**
 * Travel (src/systems/travel): survey points (placement, rules), route POIs (spacing, clear of the
 * story's places and of buildings, every Fundstück once, guards per era), the travel rules, and
 * the way-finding A* (world/route.ts) round a wall and through a gap.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Footprint } from '../src/data/types';
import { LORE } from '../src/systems/travel/lore';
import { ACTIVATE_RADIUS, ANNOUNCE_MIN, SURVEY_POINTS, activateRadius, announceFor, knownPoints, pointById, travelBlock, wayLineBlocked } from '../src/systems/travel/points';
import { KEEP_CLEAR, KEEP_CLEAR_R, POI_SPACING, ROUTES, cacheLoot, generatePois } from '../src/systems/travel/pois';
import { ENEMIES } from '../src/rpg/enemies';
import { FootprintCollider, type Ring } from '../src/world/collision';
import { findRoute, lineFree, pathLength } from '../src/world/route';
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

  it('only the field station is known at the start; walked or announced points join', () => {
    expect(knownPoints([], []).map((p) => p.id)).toEqual(['feldstation']);
    expect(knownPoints(['zwinger'], ['karlslust']).map((p) => p.id).sort()).toEqual(['feldstation', 'karlslust', 'zwinger']);
  });

  it('Laub announces the point beside a far goal, never a near one', () => {
    expect(announceFor({ x: 1822, z: 70 }, { x: 1165, z: -1571 }, [])?.id).toBe('karlslust');
    expect(announceFor({ x: 1822, z: 70 }, { x: 1800, z: 0 }, [])).toBeNull();
    expect(announceFor({ x: 1822, z: 70 }, { x: 1165, z: -1571 }, ['karlslust'])).toBeNull();
    expect(announceFor({ x: 600, z: -1600 }, { x: 1800, z: 0 }, [])).toBeNull();
  });

  it('announces from 400 m (playtest round 10): the Feldstation → Ehrenhof leg qualifies, 350 m does not', () => {
    expect(ANNOUNCE_MIN).toBe(400);
    // K1 start: from the Feldstation tripod to the Ehrenhof Q spot, ~496 m (> 400, < the old 600)
    const fs = pointById('feldstation')!;
    expect(announceFor({ x: 1222, z: -1119 }, { x: fs.x, z: fs.z }, [])?.id).toBe('ehrenhof');
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
      for (const [x, z] of KEEP_CLEAR) expect(Math.hypot(p.x - x, p.z - z), p.id).toBeGreaterThanOrEqual(KEEP_CLEAR_R);
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
    expect(r.straight).toBe(true);
    expect(r.points).toHaveLength(2);
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

  it('adding p-weiher (last in ROUTES) leaves every saved POI id where it was', () => {
    expect(ROUTES[ROUTES.length - 1]!.id).toBe('p-weiher');
    const before = generatePois(ROUTES.filter((r) => r.id !== 'p-weiher'), { blocked: runtimeBlocked });
    expect(live.filter((p) => !p.id.startsWith('poi.p-weiher.'))).toEqual(before);
  });
});

describe('the Ehrenhof point is eingemessen at the Q spot (playtest round 10, A2)', () => {
  it('takes 16 m, so the compass rose where the story asks for Q lies inside', () => {
    const e = pointById('ehrenhof')!;
    expect(activateRadius(e)).toBe(16);
    // the Ehrenhof time anchor (centre) and the prologue's "Q in der Mitte des Ehrenhofs" spot
    for (const [x, z] of [[1222, -1119], [1218, -1118]] as const) expect(Math.hypot(e.x - x, e.z - z)).toBeLessThan(activateRadius(e));
    // the quest file says the same: the wechsel objective's place is inside the radius
    const q = JSON.parse(readFileSync(new URL('../content/quests/00-prolog.quests.json', import.meta.url), 'utf8')) as { quests: { id: string; objectives: { id: string; where?: { x: number; z: number } }[] }[] };
    const w = q.quests.find((x) => x.id === 'q.p.punktwolke')!.objectives.find((o) => o.id === 'wechsel')!.where!;
    expect(Math.hypot(e.x - w.x, e.z - w.z)).toBeLessThan(activateRadius(e));
  });

  it('every other point keeps the plain 7 m, and no radius reaches another point', () => {
    for (const p of SURVEY_POINTS) {
      if (p.id !== 'ehrenhof') expect(activateRadius(p), p.id).toBe(ACTIVATE_RADIUS);
      for (const q of SURVEY_POINTS) if (q !== p) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(activateRadius(p) + activateRadius(q));
    }
  });
});
