/**
 * Fläschchen (docs/IDEAS-ROUND11.md §4, src/systems/flaschen): the 24 spots and their rules, and
 * the label switch (content/collectibles/flaschen.json → `label`) being the ONE place its text lives.
 *
 *  - 24 spots, unique ids, per era 6 / 6 / 4 / 3 / 5, each within 40 m of its anchor;
 *  - ≥ 6 m from every clue, NPC talk circle and quest pickup / objective place of every story and
 *    quest file (in the bottle's era; places without an era count in every era);
 *  - never in a memorial (story `memorial` circles), never inside a building that stands in its era
 *    (the fire rooms are rooms of those), never in a boss fight's place, far from the bomb crater;
 *  - on the terrain: inside the map, dry, not inside a scenery set's solid;
 *  - the label text appears in no other file of the repo's sources and docs (swap = one edit).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scene, Vector3 } from 'three';
import type { GameContext } from '../src/core/context';
import { ERA_INFO, type Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SaveManager } from '../src/core/save';
import { createInitialState, GameStateStore } from '../src/core/state';
import { cosmetics, FLASCHENGRUEN } from '../src/player/cosmetics';
import { ENEMIES } from '../src/rpg/enemies';
import flaschen, { type FlaschenHooks, type FlaschenSlice } from '../src/systems/flaschen';
import { FLASCHEN, countByEra } from '../src/systems/flaschen/spots';
import { SetBuilder } from '../src/systems/scenery/builder';
import { SETS } from '../src/systems/scenery/sets';
import { FootprintCollider, type Ring } from '../src/world/collision';
import { RUIN_KEEP } from '../src/world/palace';
// @ts-expect-error plain JS helper shared with the content builders
import { loadTerrain, pointInRing } from '../scripts/content-build/terrain.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const json = <T>(p: string): T => JSON.parse(readFileSync(join(ROOT, p), 'utf8')) as T;
type Obj = Record<string, unknown>;

function* walk(v: unknown, path = ''): Generator<[Obj, string]> {
  if (Array.isArray(v)) for (const x of v) yield* walk(x, path);
  else if (v && typeof v === 'object') {
    yield [v as Obj, path];
    for (const [k, x] of Object.entries(v)) yield* walk(x, `${path}.${k}`);
  }
}

/** Story, quest and pack files of the game (the 99-test fixtures are not part of it). */
function contentFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith('.json') && !f.startsWith('99'))
    .map((f) => `${dir}/${f}`);
}

interface Place {
  what: string;
  x: number;
  z: number;
  era?: string;
}

/** Clues (packs), NPC spawns (story), quest pickups and objective places (quests). */
const PLACES: Place[] = (() => {
  const out: Place[] = [];
  for (const f of [...contentFiles('content/story'), ...contentFiles('content/quests'), ...contentFiles('content/packs')]) {
    for (const [o, p] of walk(json(f))) {
      if (typeof o.x !== 'number' || typeof o.z !== 'number') continue;
      const clue = /\.clues\.where$/.test(p);
      const quest = /\.objectives\.(place|where)$/.test(p);
      const npc = o.do === 'npc' || o.do === 'loot';
      if (clue || quest || npc) out.push({ what: `${f}${p} ${String(o.do ?? '')}`, x: o.x, z: o.z, era: typeof o.era === 'string' ? o.era : undefined });
    }
  }
  return out;
})();

const sameEra = (era: Era, other?: string) => !other || other === era;
const ERAS: Era[] = ['today', '1789', '1793-02', '1793-07', '1796'];

describe('Fläschchen save round trips', () => {
  function setup(slice?: FlaschenSlice) {
    const state = new GameStateStore(createInitialState());
    if (slice) state.mutable.systems.flaschen = slice;
    const events = new EventBus();
    const save = new SaveManager(state, new MemoryStorage(), events, () => 0);
    const window = { kq: {} as { flaschen: FlaschenHooks } };
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', { createElement: () => ({ dataset: {} }), head: { append: () => {}, querySelector: () => null } });
    const ctx = {
      state, events, save, scene: new Scene(),
      era: { current: 'today' }, player: { position: new Vector3(0, 0, 0) },
      world: { collider: { setSolids: () => {} } }, audio: { bus: () => null },
      ui: { toast: () => {}, hud: { subtitle: () => {} } },
    } as unknown as GameContext;
    save.autosave('previous-checkpoint', true);
    flaschen.init(ctx);
    flaschen.update(0);
    return { state, events, save, bottles: window.kq.flaschen };
  }

  afterEach(() => {
    flaschen.dispose();
    cosmetics.lanternGlass = null;
    vi.unstubAllGlobals();
  });

  it('keeps a shaken-down bottle and a pickup made inside the autosave cooldown', () => {
    const { bottles, save } = setup();
    const hanging = FLASCHEN.find((spot) => spot.hang)!.id;
    bottles.drop(hanging);
    expect(save.load()).toBe(true);
    expect(bottles.state().dropped).toEqual([hanging]);
    expect(bottles.pick(hanging)).toBe(true);
    expect(save.load()).toBe(true);
    expect(bottles.state().found).toEqual([hanging]);
    expect(bottles.pick(hanging)).toBe(false);
  });

  it('restores a fully collected old save that is missing the final reward', () => {
    const { state, events, save, bottles } = setup({ found: FLASCHEN.map((spot) => spot.id), dropped: [], said: ['past', 'marlene', 'laub', 'all'] });
    const unlocked = vi.fn();
    events.on('codex:unlocked', unlocked);
    expect(save.load()).toBe(true);
    expect(bottles.state().said.filter((key) => key === 'all')).toHaveLength(1);
    expect(state.state.codex.facts).toContain('cx.47');
    expect(cosmetics.lanternGlass).toBe(FLASCHENGRUEN);
    expect(unlocked).toHaveBeenCalledTimes(1);
    save.autosave('repair', true);
    expect(save.load()).toBe(true);
    expect(unlocked).toHaveBeenCalledTimes(1);
  });
});

describe('Fläschchen: the 24 spots', () => {
  it('24 unique spots: today 6, 1789 6, February 1793 4, July 1793 3, 1796 5', () => {
    expect(FLASCHEN.length).toBe(24);
    expect(new Set(FLASCHEN.map((s) => s.id)).size).toBe(24);
    for (const s of FLASCHEN) expect(s.id, s.id).toMatch(/^fl\.(heute|1789|179302|179307|1796)\.[a-z]+$/);
    expect(countByEra([]).map((e) => [e.era, e.total])).toEqual([
      ['today', 6],
      ['1789', 6],
      ['1793-02', 4],
      ['1793-07', 3],
      ['1796', 5],
    ]);
    expect(countByEra(['fl.heute.quelle', 'fl.1796.quelle']).map((e) => e.found)).toEqual([1, 0, 0, 0, 1]);
    // the spring holds one in every year (the motif)
    for (const era of ERAS) expect(FLASCHEN.filter((s) => s.era === era && /quelle|Brunnenstube/i.test(s.anchor)).length, era).toBe(1);
  });

  it('each lies within 40 m of its anchor (and hangs within reach of where it lands)', () => {
    for (const s of FLASCHEN) {
      expect(Math.hypot(s.x - s.ax, s.z - s.az), s.id).toBeLessThanOrEqual(40);
      if (s.hang) expect(Math.hypot(s.x - s.hang.x, s.z - s.hang.z), s.id).toBeLessThan(2);
      if (s.verb === 'wucht') expect(s.hang, s.id).toBeDefined();
    }
  });

  it('keeps ≥ 6 m from every clue, NPC and quest place of its era', () => {
    expect(PLACES.length).toBeGreaterThan(150);
    const bad: string[] = [];
    for (const s of FLASCHEN)
      for (const p of PLACES) {
        if (!sameEra(s.era, p.era)) continue;
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        if (d < 6) bad.push(`${s.id} ${d.toFixed(1)} m from ${p.what}`);
      }
    expect(bad).toEqual([]);
  });

  it('never in a memorial, a standing building (fire rooms), a boss fight, or the bomb crater', () => {
    const memorials: { id: string; x: number; z: number; r: number; era?: string }[] = [];
    const bosses = new Set(ENEMIES.filter((e) => e.boss).map((e) => e.id));
    const fights: Place[] = [];
    for (const f of [...contentFiles('content/story'), ...contentFiles('content/quests')])
      for (const [o] of walk(json(f))) {
        if (o.do === 'memorial' && typeof o.x === 'number') memorials.push({ id: String(o.id), x: o.x, z: o.z as number, r: (o.r as number) ?? 20, era: o.era as string | undefined });
        if ((o.do === 'enemy' || typeof o.kind === 'string') && bosses.has(String(o.kind)) && typeof o.x === 'number') fights.push({ what: String(o.kind), x: o.x, z: o.z as number, era: o.era as string | undefined });
      }
    expect(memorials.map((m) => m.id)).toEqual(expect.arrayContaining(['k1.rondell', 'k4.zwinger']));
    expect(fights.length).toBeGreaterThan(2);
    const fps = json<{ buildings: { id: string; ring: Ring }[] }>('public/data/palace/footprints.json').buildings;
    const pois = json<{ id: string; name_de: string; x: number; z: number }[] | { pois: { id: string; name_de: string; x: number; z: number }[] }>('public/data/pois.json');
    const craters = (Array.isArray(pois) ? pois : pois.pois).filter((p) => /Bombentrichter/i.test(p.name_de));
    for (const s of FLASCHEN) {
      for (const m of memorials) if (sameEra(s.era, m.era)) expect(Math.hypot(m.x - s.x, m.z - s.z), `${s.id} in ${m.id}`).toBeGreaterThan(m.r + 6);
      for (const b of fights) if (sameEra(s.era, b.era)) expect(Math.hypot(b.x - s.x, b.z - s.z), `${s.id} at ${b.what}`).toBeGreaterThan(30);
      for (const c of craters) expect(Math.hypot(c.x - s.x, c.z - s.z), s.id).toBeGreaterThan(30);
      const palace = ERA_INFO[s.era].palace;
      const standing = palace === 'intact' ? fps : palace === 'ruin' ? fps.filter((f) => RUIN_KEEP.includes(f.id)) : [];
      for (const f of standing) expect(pointInRing(s.x, s.z, f.ring) as boolean, `${s.id} inside ${f.id}`).toBe(false);
    }
  });

  it('sits on the terrain: inside the map, dry, not inside a scenery solid', { timeout: 30_000 }, () => {
    const T = loadTerrain(ROOT.replace(/\/$/, ''));
    for (const s of FLASCHEN) {
      const p = T.probe(s.x, s.z) as { h2025: number; h1789: number; ground: string };
      const h = s.era === 'today' ? p.h2025 : p.h1789;
      expect(Number.isFinite(h), s.id).toBe(true);
      expect(p.ground, s.id).not.toBe('water');
      expect(p.ground, s.id).not.toBe('oob');
      // resting on the ground (not a ledge or the spring's stonework): no set's solid under it
      if (s.base && s.base !== 'terrain') continue;
      if ((s.dy ?? 0) > 0.3) continue;
      for (const def of SETS) {
        if (!def.eras.includes(s.era) || Math.hypot(def.x - s.x, def.z - s.z) > def.range + 50) continue;
        const b = new SetBuilder(() => 300);
        def.build(b, { era: s.era, gateOpen: 0 });
        const c = new FootprintCollider([]);
        c.setSolids(def.id, b.build(def.id).solids);
        expect(c.solidAt(s.x, s.z, 0.1), `${s.id} inside ${def.id}`).toBe(false);
      }
    }
  });
});

describe('Fläschchen: the label lives in ONE file (swap = one edit)', () => {
  const FILE = 'content/collectibles/flaschen.json';
  const data = json<{ label: { lines: string[]; placeholder?: boolean; note?: string }; fallback: { lines: string[] } }>(FILE);

  /** Every text file under the given top-level folders (sources, content, docs, scripts, tests). */
  function files(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(join(ROOT, dir))) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const rel = `${dir}/${name}`;
      const st = statSync(join(ROOT, rel));
      if (st.isDirectory()) files(rel, out);
      else if (/\.(ts|mjs|js|json|md|css|html|txt)$/.test(name) && st.size < 4_000_000) out.push(rel);
    }
    return out;
  }

  it('the switch file has the label (two short lines, a placeholder note) and the invented fallback', () => {
    expect(Array.isArray(data.label.lines)).toBe(true);
    expect(data.label.lines.length).toBeGreaterThanOrEqual(1);
    expect(data.label.lines.length).toBeLessThanOrEqual(3);
    for (const l of data.label.lines) expect(l.length).toBeLessThanOrEqual(24);
    expect(typeof data.label.placeholder).toBe('boolean');
    expect(typeof data.label.note).toBe('string');
    expect(data.fallback.lines.length).toBeGreaterThan(0);
    // the invented label never carries the place name (it would read as the brand)
    for (const l of data.fallback.lines) expect(l.toLowerCase()).not.toContain('karlsberg');
  });

  it('the label text appears in no other file under content/, src/, docs/, scripts/, tests/, e2e/', () => {
    const lines = data.label.lines.map((l) => l.trim()).filter(Boolean);
    // What must not leak: the whole label (its lines joined), and each line on its own — EXCEPT a
    // line that is the game's own place name (read from the game title in index.html, never typed
    // here): the brand line of the real label is the same word as the hill the whole game is named
    // after, used in hundreds of places, so only the full label and the product line are checked.
    // A line equal to an invented fallback line is not a brand either and is not checked alone.
    const title = (readFileSync(join(ROOT, 'index.html'), 'utf8').match(/<title>([^<]*)<\/title>/)?.[1] ?? '').toLowerCase();
    const titleWords = new Set(title.split(/\s+/).filter(Boolean));
    const fallback = new Set(data.fallback.lines.map((l) => l.toLowerCase()));
    const needles = [lines.join(' '), ...lines.filter((l) => !titleWords.has(l.toLowerCase()) && !fallback.has(l.toLowerCase()))];
    expect(needles.length).toBeGreaterThanOrEqual(1);
    const leaks: string[] = [];
    for (const dir of ['content', 'src', 'docs', 'scripts', 'tests', 'e2e'])
      for (const f of files(dir)) {
        if (f === FILE) continue;
        const text = readFileSync(join(ROOT, f), 'utf8').toLowerCase();
        for (const n of needles) if (text.includes(n.toLowerCase())) leaks.push(`${f}: label text`);
      }
    expect(leaks).toEqual([]);
  });
});
