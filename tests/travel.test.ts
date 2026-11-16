/**
 * Travel (src/systems/travel): survey points (placement, rules), route POIs (spacing, clear of the
 * story's places and of buildings, every Fundstück once, guards per era), the travel rules, and
 * the way-finding A* (world/route.ts) round a wall and through a gap.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Footprint } from '../src/data/types';
import { LORE } from '../src/systems/travel/lore';
import { SURVEY_POINTS, announceFor, knownPoints, travelBlock } from '../src/systems/travel/points';
import { KEEP_CLEAR, KEEP_CLEAR_R, POI_SPACING, ROUTES, cacheLoot, generatePois } from '../src/systems/travel/pois';
import { ENEMIES } from '../src/rpg/enemies';
import { FootprintCollider, type Ring } from '../src/world/collision';
import { findRoute, lineFree, pathLength } from '../src/world/route';

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

  it('finds the palace way round the east wing to the gallery\'s end (real footprints)', () => {
    const blocked = (x: number, z: number) => collider.resolve(x, z, 0.45).hit;
    // from the garden side of the Corps de logis to Hanne at the gallery's east pavilion
    const r = findRoute(1262, -1158, 1287, -1228, blocked);
    expect(r.complete).toBe(true);
    for (let i = 0; i + 1 < r.points.length; i++) expect(lineFree(r.points[i]![0], r.points[i]![1], r.points[i + 1]![0], r.points[i + 1]![1], blocked, 0.5)).toBe(true);
  });
});
