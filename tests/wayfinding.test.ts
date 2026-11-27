/**
 * Wayfinding (docs/ACTION-RPG.md §8.3, "always know what to do"): every objective with a place
 * resolves to a marker target (also an examine step that only names a clue: the lake's Mauerrest
 * had no marker, the playtest's stuck point), the hint after a stall names keys and direction,
 * and the stall clock counts only real standstill.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { QuestObjective } from '../src/rpg/types';
import { StallWatch, bearingTo, directionWord, distanceText, hintFor, objectiveTarget, targetVisible, type WayDeps } from '../src/systems/quests/wayfinding';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const deps = (over: Partial<WayDeps> = {}): WayDeps => ({
  era: 'today',
  player: { x: 0, z: 0 },
  clue: () => null,
  npc: () => null,
  pickups: () => [],
  ...over,
});
const Q = { id: 'q.t', era: 'today' as const };
const obj = (o: Partial<QuestObjective> & { type: QuestObjective['type'] }): QuestObjective => ({ id: 'o', text_de: 'x', ...o }) as QuestObjective;

describe('objectiveTarget', () => {
  it('an examine step without a place points at its clue', () => {
    const t = objectiveTarget(Q, obj({ type: 'examine', clue: 'clue.a' }), deps({ clue: () => ({ x: 10, z: -20, r: 15, eras: ['today'], scan: 2 }) }));
    expect(t).toMatchObject({ x: 10, z: -20, kind: 'clue', era: 'today' });
    expect(t!.r).toBeLessThan(6);
  });

  it('a portable clue gives no world target', () => {
    const clue = () => ({ x: 760, z: -915, r: 1, eras: ['today'], anchor: 'portable' });
    expect(objectiveTarget(Q, obj({ type: 'examine', clue: 'clue.k2.laterne' }), deps({ player: { x: 1150, z: -1000 }, clue }))).toBeNull();
    expect(objectiveTarget(Q, obj({ type: 'echo', clue: 'clue.k2.laterne' }), deps({ clue }))).toBeNull();
    // an anchored clue still has its marker
    const anchored = () => ({ x: 816, z: -884, r: 9, eras: ['today'], anchor: 'loc.test.damm' });
    expect(objectiveTarget(Q, obj({ type: 'examine', clue: 'clue.a' }), deps({ clue: anchored }))).toMatchObject({ x: 816, z: -884 });
  });

  it('the chapter 2 lantern clue is portable in the content pack', () => {
    const pack = JSON.parse(readFileSync(`${ROOT}content/packs/kapitel-2.pack.json`, 'utf8')) as { clues: { id: string; where: { anchor?: string } }[] };
    expect(pack.clues.find((c) => c.id === 'clue.k2.laterne')?.where.anchor).toBe('portable');
  });

  it('collect points at the nearest pickup still lying in this era', () => {
    const t = objectiveTarget(
      Q,
      obj({ type: 'collect' }),
      deps({
        pickups: () => [
          { x: 100, z: 0 },
          { x: 5, z: 5, era: '1789' },
          { x: 20, z: 0 },
        ],
      }),
    );
    expect(t).toMatchObject({ x: 20, z: 0, kind: 'pickup' });
  });

  it('talk follows the npc; noMarker gives none', () => {
    expect(objectiveTarget(Q, obj({ type: 'talk', npc: 'n' } as never), deps({ npc: () => ({ x: 3, z: 4, era: 'today' }) }))).toMatchObject({ x: 3, z: 4, kind: 'npc' });
    expect(objectiveTarget(Q, obj({ type: 'kill', where: { x: 1, z: 1 }, noMarker: true } as never), deps())).toBeNull();
  });

  it('a target in another era or in a room is not shown', () => {
    expect(targetVisible({ x: 0, z: 0, r: 4, era: '1789', kind: 'zone' }, 'today')).toBe(false);
    expect(targetVisible({ x: 0, z: 0, r: 4, room: 'saal', kind: 'zone' }, 'today')).toBe(false);
    expect(targetVisible({ x: 0, z: 0, r: 4, kind: 'zone' }, 'today')).toBe(true);
  });

  it('a reach place ("there: Q") shows from every era, with a hint to shift there (TASK-083)', () => {
    const o = obj({ type: 'reach', text_de: 'Im Ehrenhof: Q – in den Juli 1793', where: { x: 1210, z: -1114, r: 30, era: '1793-07' } } as never);
    const t = objectiveTarget(Q, o, deps());
    expect(targetVisible(t, 'today')).toBe(true);
    expect(targetVisible(t, '1793-07')).toBe(true);
    const h = hintFor(o, { target: t, player: { x: 1200, z: -800 }, otherEra: '1793-07' });
    expect(h).toMatch(/^Zur Markierung gehen \(.*Norden.*\), dort Q halten/);
    // other kinds still hide in another era
    expect(targetVisible(objectiveTarget(Q, obj({ type: 'kill', where: { x: 1, z: 1, era: '1789' } } as never), deps()), 'today')).toBe(false);
  });
});

describe('hint text', () => {
  it('names compass words and distances on the grid (x east, z south)', () => {
    expect(directionWord(bearingTo(0, 0, 0, -100))).toBe('Norden');
    expect(directionWord(bearingTo(0, 0, 100, 0))).toBe('Osten');
    expect(directionWord(bearingTo(0, 0, -50, 50))).toBe('Südwesten');
    expect(distanceText(1234)).toBe('1,2 km');
    expect(distanceText(123)).toBe('125 m');
  });

  it('an objective hint_de wins, otherwise keys are named', () => {
    const t = { x: 0, z: -200, r: 4, kind: 'clue' as const };
    expect(hintFor(obj({ type: 'examine', hint_de: 'Eigener Tipp' } as never), { target: t, player: { x: 0, z: 0 } })).toBe('Eigener Tipp');
    const h = hintFor(obj({ type: 'examine' }), { target: t, player: { x: 0, z: 0 }, scan: 2 });
    expect(h).toContain('Taste 2');
    expect(h).toContain('Norden');
    expect(hintFor(obj({ type: 'kill' }), { target: t, player: { x: 0, z: 0 }, needsBann: true })).toContain('Bannlicht');
    expect(hintFor(obj({ type: 'kill' }), { target: t, player: { x: 0, z: 0 }, otherEra: '1789' })).toContain('Q halten');
  });
});

describe('StallWatch', () => {
  it('fires after the limit without progress, then later again', () => {
    const w = new StallWatch(60);
    let fired = 0;
    for (let i = 0; i < 600; i++) if (w.tick(0.1, 'k', 50)) fired++;
    expect(fired).toBe(1);
    for (let i = 0; i < 850; i++) if (w.tick(0.1, 'k', 50)) fired++;
    expect(fired).toBe(1);
    for (let i = 0; i < 60; i++) if (w.tick(0.1, 'k', 50)) fired++;
    expect(fired).toBe(2);
  });

  it('walking closer or a new objective key restarts the clock; a paused game does not count', () => {
    const w = new StallWatch(60);
    for (let i = 0; i < 500; i++) w.tick(0.1, 'k', 100);
    w.tick(0.1, 'k', 80);
    expect(w.idle).toBeLessThan(1);
    for (let i = 0; i < 500; i++) w.tick(0.1, 'k', 80);
    w.tick(0.1, 'k2', 80);
    expect(w.idle).toBeLessThan(1);
    for (let i = 0; i < 2000; i++) expect(w.tick(0, 'k2', 80)).toBe(false);
  });
});

describe('chapter 1 content', () => {
  it('every examine/echo step of the chapter 1 main quests resolves to a place', () => {
    const quests = JSON.parse(readFileSync(`${ROOT}content/quests/01-kapitel-1.quests.json`, 'utf8')) as { quests: { id: string; kind: string; objectives: QuestObjective[] }[] };
    for (const q of quests.quests.filter((x) => x.kind === 'main')) {
      for (const o of q.objectives) {
        if (o.type !== 'examine' && o.type !== 'echo') continue;
        expect(o.where ?? (o as { clue?: string }).clue, `${q.id}.${o.id}`).toBeTruthy();
      }
    }
  });
});
