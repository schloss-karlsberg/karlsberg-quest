/**
 * Round-2 integration rules (pure parts): room conditions across interiors flags / the story slice /
 * latched events, the validator for room ids and pack modes, key bindings without clashes, bark
 * memorials by any room id, and the horn trigger of the driving pack.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { matchTrigger } from '../src/content/triggers';
import type { ContentPack } from '../src/content/types';
import { DEFAULT_BINDINGS } from '../src/player/input';
import { memorialAt } from '../src/systems/barks/rules';
import { type StoryEnv, evaluate, roomIdMatches, roomMatchKey, walkEvents } from '../src/systems/story/engine';
import type { Action, StoryFile } from '../src/systems/story/types';
import { validateStories } from '../src/systems/story/validate';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VOICES = (JSON.parse(readFileSync(`${ROOT}content/packs/voices.pack.json`, 'utf8')) as ContentPack).dialogue ?? [];

function env(over: Partial<StoryEnv> = {}): StoryEnv {
  return {
    era: '1789',
    x: 0,
    z: 0,
    flags: {},
    inventory: { clues: [], nouns: [], items: [] },
    chronik: {},
    scan: 0,
    map: false,
    stance: 'stand',
    lantern: false,
    caseFacts: () => null,
    ...over,
  };
}
const ev = (c: Parameters<typeof evaluate>[0], e: StoryEnv, latched: Record<string, number> = {}) => evaluate(c, e, latched, 'k', 0);
const file = (beats: StoryFile['beats']) => ({ file: 't.story.json', story: { chapter: 't', order: 0, title_de: 'T', start: beats[0]!.id, beats } as StoryFile });

describe('room condition (interiors ⇄ story)', () => {
  const inFestsaal = env({ flags: { 'interior.room': 'B01.2.og-festsaal', 'interior.building': 'KB-B01' } });
  it('matches the catalogue id, the full id and the building from the interiors flags', () => {
    expect(ev({ room: 'B01.2.og-festsaal' }, inFestsaal)).toBe(true);
    expect(ev({ room: 'KB-B01/B01.2.og-festsaal' }, inFestsaal)).toBe(true);
    expect(ev({ room: 'KB-B01' }, inFestsaal)).toBe(true);
    expect(ev({ room: 'KB-B06' }, inFestsaal)).toBe(false);
    expect(ev({ room: 'B01.1.eg-kabinett' }, inFestsaal)).toBe(false);
    expect(ev({ room: 'B01.2.og-festsaal' }, env({ flags: { 'interior.room': '', 'interior.building': '' } }))).toBe(false);
  });
  it('also reads the story slice room (stand-in) and the latch', () => {
    expect(ev({ room: 'B03.1.eg-registratur' }, env({ room: 'B03.1.eg-registratur' }))).toBe(true);
    expect(ev({ room: 'KB-B03' }, env({ room: 'KB-B03/B03.1.eg-registratur' }))).toBe(true);
    expect(ev({ room: 'KB-B03' }, env(), { k: 1 })).toBe(true);
  });
  it('latches room:enter on the payload field the id names', () => {
    expect(roomMatchKey('B06.1.bildergalerie')).toBe('roomId');
    expect(roomMatchKey('KB-B06/B06.1.bildergalerie')).toBe('id');
    expect(roomMatchKey('KB-B06')).toBe('building');
    const seen: string[] = [];
    walkEvents({ any: [{ room: 'KB-B06' }, { room: 'KB-B01/B01.2.og-festsaal' }] }, 'k', (e) => seen.push(JSON.stringify(e.match)));
    expect(seen).toEqual(['{"building":"KB-B06"}', '{"id":"KB-B01/B01.2.og-festsaal"}']);
    expect(roomIdMatches('KB-B06', 'B06.1.bildergalerie', 'KB-B06')).toBe(true);
  });
});

describe('validator (round-2 integration)', () => {
  it('accepts NPCs in rooms, memorial rooms and the hunt modes', () => {
    const r = validateStories([
      file([
        {
          id: 'a',
          enter: [
            { do: 'npc', op: 'spawn', npc: 'hanne', room: 'B01.2.og-festsaal', era: '1789' },
            { do: 'memorial', id: 'w5', room: 'B01.2.og-festsaal', era: '1793-07' },
            { do: 'threat', kind: 'pack', active: true, mode: 'drive', intensity: 0.3, center: { x: 1200, z: -1400 }, radius: 400, via: [{ x: 1210, z: -1300 }], target: { x: 1216, z: -1571 }, goalRadius: 20 } as Action,
            { do: 'threat', kind: 'pack', active: true, mode: 'finale', target: { x: 1216, z: -1571 } } as Action,
          ],
          complete: { any: [{ room: 'KB-B01' }, { event: 'measure:done', match: { building: 'KB-B06' } }, { event: 'hunt:finale', match: { outcome: 'faded' } }] },
        },
      ]),
    ]);
    expect(r.errors.map((e) => e.message)).toEqual([]);
  });
  it('rejects malformed room ids and pack modes', () => {
    const r = validateStories([
      file([
        {
          id: 'a',
          enter: [
            { do: 'npc', op: 'spawn', npc: 'hanne', room: 'festsaal' } as Action,
            { do: 'memorial', id: 'w5', room: 'b01.festsaal' } as Action,
            { do: 'threat', kind: 'pack', active: true, mode: 'hetzjagd' } as unknown as Action,
            { do: 'threat', kind: 'pack', active: true, mode: 'drive' } as Action,
          ],
          complete: { room: 'saal' },
        },
      ]),
    ]);
    const msgs = r.errors.map((e) => e.message).join('\n');
    expect(msgs).toMatch(/npc: room needs a room id \(not a building\): 'festsaal'/);
    expect(msgs).toMatch(/memorial: malformed room id 'b01.festsaal'/);
    expect(msgs).toMatch(/unknown pack mode 'hetzjagd'/);
    expect(msgs).toMatch(/mode drive needs target/);
    expect(msgs).toMatch(/room: malformed room id 'saal'/);
  });
});

describe('key bindings', () => {
  it('no key code drives two actions (except C: crouch on foot, down while flying)', () => {
    const owner = new Map<string, string[]>();
    for (const [action, codes] of Object.entries(DEFAULT_BINDINGS)) for (const c of codes) owner.set(c, [...(owner.get(c) ?? []), action]);
    const clashes = [...owner].filter(([, a]) => a.length > 1).map(([c, a]) => `${c}: ${a.join('+')}`);
    expect(clashes).toEqual(['KeyC: crouch+down']);
    expect(DEFAULT_BINDINGS.xray).toEqual(['KeyV', 'Digit4']);
    expect(DEFAULT_BINDINGS.plans).toEqual(['KeyB']);
  });
});

describe('barks and the hunt in rooms', () => {
  it('a memorial room may be named by catalogue id, full id or building', () => {
    const here = ['B01.2.og-festsaal', 'KB-B01/B01.2.og-festsaal', 'KB-B01'];
    for (const room of here) expect(memorialAt([{ id: 'w5', room, era: '1793-07' }], 0, 0, '1793-07', here)).toBe('w5');
    expect(memorialAt([{ id: 'w5', room: 'KB-B06' }], 0, 0, '1793-07', here)).toBeNull();
  });
  it("Laub's 'die Jagd beginnt' answers a patrol or par force horn, not the driving pack", () => {
    const line = VOICES.find((l) => l.id === 'laub.horn.search')!;
    const c = { era: '1793-02', flags: {}, chapter: null, beat: null };
    expect(matchTrigger(line, 'hunt:horn', { signal: 'search', x: 0, z: 0, mode: 'patrol' }, c)).toBe(true);
    expect(matchTrigger(line, 'hunt:horn', { signal: 'search', x: 0, z: 0, mode: 'parforce' }, c)).toBe(true);
    expect(matchTrigger(line, 'hunt:horn', { signal: 'search', x: 0, z: 0, mode: 'drive' }, c)).toBe(false);
  });
});
