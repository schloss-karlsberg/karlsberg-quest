/**
 * The tour's chestnuts (TASK-002, content/story/00-tour.story.json): 24 `item.kastanie` pickups
 * along the sections the group walks, placed when that walk starts, clear of the stops, the deer
 * and the Fläschchen; three chapter-wide lines on the 1st, 12th and last; the leftovers cleared when
 * the tour ends. No XP and no item grant (the level band and the handover stay as they are).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createInitialState, deserializeState, serializeState } from '../src/core/state';
import { itemDef } from '../src/rpg/items';
import { FLASCHEN } from '../src/systems/flaschen/spots';
import { createProgressionSlice } from '../src/systems/progression/logic';
import { type StoryEnv, type StorySlice, StoryEngine, createStorySlice } from '../src/systems/story/engine';
import { missingTourChestnuts } from '../src/systems/story/stories';
import type { Action, LootAction, Reaction, SayAction, StoryFile } from '../src/systems/story/types';
import type { Route } from '../src/systems/walk/types';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tour = JSON.parse(readFileSync(`${ROOT}content/story/00-tour.story.json`, 'utf8')) as StoryFile;
const route = JSON.parse(readFileSync(`${ROOT}content/routes/p-fuehrung.json`, 'utf8')) as Route;

const ITEM = 'item.kastanie';
const GROUP = 'tour.kastanien';
/** The beat that walks each section (from stop → to stop) and how many chestnuts lie there. */
const SECTIONS: Record<string, { from: string; to: string; n: number }> = {
  t3: { from: 'parkplatz', to: 'abzweig', n: 3 },
  t5: { from: 'einstieg', to: 'felsen', n: 6 },
  t7: { from: 'felsen', to: 'wind', n: 3 },
  t9: { from: 'wind', to: 'reh', n: 6 },
  t12: { from: 'damm', to: 'weiher', n: 2 },
  t14: { from: 'weiher', to: 'quelle', n: 4 },
};

const stop = (id: string) => route.stops.find((s) => s.id === id)!;
const pointIndex = (id: string) => route.points.findIndex(([x, z]) => Math.hypot(x - stop(id).x, z - stop(id).z) < 0.01);
/** Distance from (x, z) to the route line between two stops. */
function toSection(x: number, z: number, from: string, to: string): number {
  const pts = route.points.slice(pointIndex(from), pointIndex(to) + 1);
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const L2 = (bx - ax) ** 2 + (bz - az) ** 2;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / L2));
    best = Math.min(best, Math.hypot(x - (ax + t * (bx - ax)), z - (az + t * (bz - az))));
  }
  return best;
}

const chestnuts = tour.beats.flatMap((b) =>
  (b.enter ?? []).filter((a): a is LootAction => a.do === 'loot' && a.item === ITEM).map((a) => ({ beat: b.id, a })),
);
const reactions = (tour.on ?? []).filter((r) => JSON.stringify(r.when).includes(ITEM));

describe('the tour chestnuts (TASK-002)', () => {
  it('a plain collectible: stacks, no use, German name', () => {
    const def = itemDef(ITEM)!;
    expect(def).toMatchObject({ kind: 'collectible', name_de: 'Kastanie' });
    expect(def.effect).toBeUndefined();
  });

  it('24 chestnuts, placed in the beat whose walk they line, all of era today and one group', () => {
    expect(chestnuts.length).toBe(24);
    const ids = chestnuts.map(({ a }) => a.id);
    expect(new Set(ids).size).toBe(24);
    for (const { a } of chestnuts) {
      expect(a.id).toMatch(/^tour\.kastanie\.\d\d$/);
      expect(a).toMatchObject({ era: 'today', group: GROUP });
      expect(typeof a.x === 'number' && typeof a.z === 'number').toBe(true);
    }
    const perBeat = Object.fromEntries(Object.keys(SECTIONS).map((b) => [b, chestnuts.filter((c) => c.beat === b).length]));
    expect(perBeat).toEqual(Object.fromEntries(Object.entries(SECTIONS).map(([b, s]) => [b, s.n])));
    // only in those beats' enter, nowhere else in the story (exits, reactions, leave)
    const everywhere = [
      ...tour.beats.flatMap((b) => [...(b.enter ?? []), ...(b.exit ?? []), ...(b.on ?? []).flatMap((r) => r.do)]),
      ...(tour.on ?? []).flatMap((r) => r.do),
      ...(tour.leave ?? []),
    ];
    expect(everywhere.filter((a) => a.do === 'loot' && (a as LootAction).item === ITEM).length).toBe(24);
  });

  it('near the path (≤ 12 m, most ≤ 4 m), clear of the stops, the deer and the Fläschchen', () => {
    const t9 = tour.beats.find((b) => b.id === 't9')!;
    const doe = (t9.enter ?? []).find((a) => a.do === 'animal' && (a as { id?: string }).id === 'ricke') as unknown as { x: number; z: number };
    const bottles = FLASCHEN.filter((f) => f.era === 'today');
    let near = 0;
    for (const { beat, a } of chestnuts) {
      const s = SECTIONS[beat]!;
      const d = toSection(a.x!, a.z!, s.from, s.to);
      expect(d, `${a.id} to its section`).toBeLessThanOrEqual(12);
      if (d <= 4) near++;
      for (const st of route.stops) expect(Math.hypot(a.x! - st.x, a.z! - st.z), `${a.id} to stop ${st.id}`).toBeGreaterThanOrEqual(8);
      expect(Math.hypot(a.x! - doe.x, a.z! - doe.z), `${a.id} to the doe`).toBeGreaterThanOrEqual(40);
      expect(Math.hypot(a.x! - stop('reh').x, a.z! - stop('reh').z), `${a.id} to the reh stop`).toBeGreaterThanOrEqual(15);
      for (const f of bottles) expect(Math.hypot(a.x! - f.x, a.z! - f.z), `${a.id} to ${f.id}`).toBeGreaterThanOrEqual(6);
    }
    // mostly near the path, a few off it
    expect(near).toBeGreaterThanOrEqual(16);
    expect(chestnuts.length - near).toBeGreaterThanOrEqual(3);
    // two never share a spot (walking over one picks one)
    for (const p of chestnuts) for (const q of chestnuts) if (p !== q) expect(Math.hypot(p.a.x! - q.a.x!, p.a.z! - q.a.z!), `${p.a.id} / ${q.a.id}`).toBeGreaterThan(1.4);
  });

  it('three lines, on the first, the twelfth and the last; no XP, no items; leftovers cleared at the end', () => {
    expect(reactions.map((r) => r.id)).toEqual(['kastanie-1', 'kastanie-12', 'kastanie-24']);
    const totals = reactions.map((r) => (r.when as { gte?: { total?: number } }).gte?.total ?? 1);
    expect(totals).toEqual([1, 12, chestnuts.length]);
    for (const r of reactions as Reaction[]) {
      expect(r.repeat).toBeFalsy();
      expect(r.when).toMatchObject({ event: 'item:pickup', match: { item: ITEM } });
      for (const a of r.do as Action[]) {
        expect(a.do).toBe('say');
        expect(['imhoff', 'solld']).toContain((a as SayAction).speaker);
        expect((a as SayAction).text).toMatch(/[äöüßÄÖÜ]|Kastanie|Eichhörnchen/);
      }
    }
    const all = [...tour.beats.flatMap((b) => [...(b.enter ?? []), ...(b.exit ?? []), ...(b.on ?? []).flatMap((r) => r.do)]), ...(tour.on ?? []).flatMap((r) => r.do)];
    expect(all.some((a) => (a.do === 'item' || a.do === 'give') && (a as { item?: string }).item === ITEM)).toBe(false);
    expect(reactions.flatMap((r) => r.do).some((a) => a.do === 'xp')).toBe(false);
    const leave = tour.leave ?? [];
    const clear = leave.findIndex((a) => a.do === 'loot' && (a as LootAction).clear && (a as LootAction).group === GROUP);
    expect(clear).toBeGreaterThanOrEqual(0);
    expect(clear).toBeLessThan(leave.findIndex((a) => a.do === 'fade'));
  });

  it('restores completed walks in an older tour save and preserves placed and taken chestnuts', () => {
    const state = createInitialState();
    state.systems.story = {
      ...createStorySlice(), active: true, chapter: 'tour', beat: 't5',
      doneBeats: ['tour/t1', 'tour/t2', 'tour/t3', 'tour/t4'],
    };
    const saved = deserializeState(serializeState(state));
    const story = saved.systems.story!;
    const ids = () => missingTourChestnuts(tour, story, saved.systems.progression).map((a) => a.id);
    expect(ids()).toEqual(['tour.kastanie.01', 'tour.kastanie.02', 'tour.kastanie.03']);

    const progression = saved.systems.progression = createProgressionSlice();
    progression.taken.push('tour.kastanie.01');
    progression.inventory[ITEM] = 1;
    progression.placed = {
      'tour.kastanie.02': { id: 'tour.kastanie.02', item: ITEM, x: 510.9, z: -758.5, era: 'today', quest: GROUP },
    };
    expect(ids()).toEqual(['tour.kastanie.03']);
    expect(progression.inventory[ITEM]).toBe(1);
    expect(missingTourChestnuts({ ...tour, chapter: 'k1' }, story, progression)).toEqual([]);
  });

  it('the engine says each line once, when the count gets there', () => {
    let slice: StorySlice = createStorySlice();
    const said: string[] = [];
    const placed: string[] = [];
    const engine = new StoryEngine([tour], () => slice, {
      run: (actions) => {
        for (const a of actions) {
          if (a.do === 'say') said.push(a.id ?? '?');
          if (a.do === 'loot' && a.item === ITEM) placed.push(a.id!);
        }
      },
      chapterEntered: () => {},
      beatEntered: () => {},
      chapterCompleted: () => {},
    });
    const env = (): StoryEnv => ({ era: 'today', x: 529, z: -777, flags: {}, inventory: { clues: [], nouns: [], items: [] }, chronik: {}, scan: 0, map: false, stance: 'stand', lantern: false, caseFacts: () => null });
    engine.goto('tour', 't3');
    engine.tick(0.5, env());
    expect(placed).toEqual(['tour.kastanie.01', 'tour.kastanie.02', 'tour.kastanie.03']);
    const ours = () => said.filter((id) => id.includes('kastanie'));
    const pick = (total: number) => {
      engine.onEvent('item:pickup', { item: ITEM, count: 1, total, id: `tour.kastanie.${String(total).padStart(2, '0')}`, reason: 'pickup' });
      engine.tick(0.1, env());
    };
    // another item does not count
    engine.onEvent('item:pickup', { item: 'item.balsam', count: 1, total: 30 });
    engine.tick(0.1, env());
    expect(ours()).toEqual([]);
    pick(1);
    expect(ours()).toEqual(['imhoff.t.kastanie1']);
    for (let n = 2; n <= 11; n++) pick(n);
    expect(ours()).toEqual(['imhoff.t.kastanie1']);
    pick(12);
    pick(13);
    expect(ours()).toEqual(['imhoff.t.kastanie1', 'solld.t.kastanie12']);
    // the reactions are chapter-wide: the beats go on as in play (not a goto, which restarts the
    // chapter's reactions) and a later beat still hears them; a line said stays said
    for (let i = 0; i < 20 && slice.beat !== 't14'; i++) {
      engine.skip();
      engine.tick(0.1, env());
    }
    expect(slice.beat).toBe('t14');
    pick(14);
    expect(ours()).toEqual(['imhoff.t.kastanie1', 'solld.t.kastanie12']);
    for (let n = 15; n <= 24; n++) pick(n);
    expect(ours()).toEqual(['imhoff.t.kastanie1', 'solld.t.kastanie12', 'imhoff.t.kastanie24']);
    slice = createStorySlice();
  });
});
