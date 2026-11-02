/**
 * Round 2 story features (pure parts): new conditions and actions, meters, choices, epilogue
 * assembly from the endings pack, shared dialogue triggers / text placeholders, NPC
 * conversation rules and bark rules.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { barkGroup, fillText, germanNumber, isBarkLine, matchTrigger, pickSequence, valueKey } from '../src/content/triggers';
import type { ContentPack, DialogueLine } from '../src/content/types';
import { BUILTIN_MEMORIALS, GLOBAL_GAP, LINE_COOLDOWN, chooseBark, memorialAt, newMemory, quietReason, ready, record, seededRng } from '../src/systems/barks/rules';
import { answer, availableTopics, askedTopics, clueFor, talkLines, talkedFlag } from '../src/systems/npc/logic';
import { lookFor, topicLabel } from '../src/systems/npc/roster';
import { substituteName } from '../src/systems/story/dialogue/presenter';
import { type StoryEnv, type StorySlice, StoryEngine, createStorySlice, evaluate, runsOnResume, walkEvents } from '../src/systems/story/engine';
import { assembleEpilogue, epilogueLines } from '../src/systems/story/endings/assemble';
import { isWrapped, meterSeconds, newMeter, relieve, tickMeter } from '../src/systems/story/meters';
import type { Action, StoryFile } from '../src/systems/story/types';
import { validateStories } from '../src/systems/story/validate';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const pack = (name: string) => JSON.parse(readFileSync(`${ROOT}content/packs/${name}.pack.json`, 'utf8')) as ContentPack;
const K1 = pack('kapitel-1').dialogue ?? [];
const K3 = pack('kapitel-3').dialogue ?? [];
const VOICES = pack('voices').dialogue ?? [];
const ENDEN = pack('enden').dialogue ?? [];

function env(over: Partial<StoryEnv> = {}): StoryEnv {
  return {
    era: 'today',
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
const line = (id: string, trigger: DialogueLine['trigger'], extra: Partial<DialogueLine> = {}): DialogueLine => ({ id, speaker: 'laub', text_de: id, trigger, ...extra });

describe('story conditions (round 2)', () => {
  it('room: current room or latched room:enter while the beat ran', () => {
    expect(ev({ room: 'b03.saal' }, env({ room: 'b03.saal' }))).toBe(true);
    expect(ev({ room: 'b03.saal' }, env({ room: null }))).toBe(false);
    expect(ev({ room: 'b03.saal' }, env(), { k: 1 })).toBe(true);
    const seen: string[] = [];
    walkEvents({ all: [{ room: 'x' }, { flag: 'a' }] }, 'k', (e) => seen.push(`${e.event}:${JSON.stringify(e.match)}`));
    expect(seen).toEqual(['room:enter:{"roomId":"x"}']);
  });

  it('talked: talked.<chapter>.<npc>[.<topic>] (chapter defaults to the running one)', () => {
    const e = env({ chapter: 'k1', flags: { 'talked.k1.hanne': true, 'talked.k1.hanne.matthes': true } });
    expect(ev({ talked: { npc: 'hanne' } }, e)).toBe(true);
    expect(ev({ talked: { npc: 'hanne', topic: 'matthes' } }, e)).toBe(true);
    expect(ev({ talked: { npc: 'hanne', topic: 'berg' } }, e)).toBe(false);
    expect(ev({ talked: { npc: 'soll' } }, e)).toBe(false);
    expect(ev({ talked: { npc: 'hanne', chapter: 'k2' } }, e)).toBe(false);
  });

  it('reading: by story flag or entry id; eq accepts noun ids and bare keys', () => {
    const e = env({ flags: { 'flag.k1_lohn': 'n.r_will_nicht' }, readingFlag: (id) => (id === 'entry.k1.lohn' ? 'flag.k1_lohn' : null) });
    expect(ev({ reading: 'flag.k1_lohn' }, e)).toBe(true);
    expect(ev({ reading: 'flag.k1_lohn', eq: 'will_nicht' }, e)).toBe(true);
    expect(ev({ reading: 'flag.k1_lohn', eq: 'n.r_will_nicht' }, e)).toBe(true);
    expect(ev({ reading: 'flag.k1_lohn', eq: 'creuzer' }, e)).toBe(false);
    expect(ev({ reading: 'entry.k1.lohn', eq: 'will_nicht' }, e)).toBe(true);
    expect(ev({ reading: 'flag.k2_warner' }, e)).toBe(false);
  });

  it('meter, chosen and chapterTimer', () => {
    const e = env({ meters: { oil: 0.4, atem: 1 }, flags: { 'choice.k2.tor': 'dunkel', 'choice.k3.x': 0 }, chapterTime: 95 });
    expect(ev({ meter: { id: 'oil', gte: 0.3 } }, e)).toBe(true);
    expect(ev({ meter: { id: 'oil', lte: 0.3 } }, e)).toBe(false);
    expect(ev({ meter: { id: 'atem', full: true } }, e)).toBe(true);
    expect(ev({ meter: { id: 'smoke', gte: 0 } }, e)).toBe(false);
    expect(ev({ chosen: 'k2.tor' }, e)).toBe(true);
    expect(ev({ chosen: 'k2.tor', option: 'dunkel' }, e)).toBe(true);
    expect(ev({ chosen: 'k2.tor', option: 'leuchten' }, e)).toBe(false);
    expect(ev({ chosen: 'k3.x', option: 0 }, e)).toBe(true);
    expect(ev({ chapterTimer: 90 }, e)).toBe(true);
    expect(ev({ chapterTimer: 120 }, e)).toBe(false);
  });

  it('the engine gives conditions the chapter time and chapter', () => {
    const f: StoryFile = { chapter: 'c', order: 0, title_de: 'C', start: 'c1', beats: [{ id: 'c1', complete: { chapterTimer: 2 }, next: 'c2' }, { id: 'c2', complete: { talked: { npc: 'jost' } } }] };
    let slice: StorySlice = createStorySlice();
    const engine = new StoryEngine([f], () => slice, { run: () => {}, chapterEntered: () => {}, beatEntered: () => {}, chapterCompleted: () => {} });
    engine.goto('c');
    for (let i = 0; i < 19; i++) engine.tick(0.1, env());
    expect(slice.beat).toBe('c1');
    engine.tick(0.15, env());
    expect(slice.beat).toBe('c2');
    engine.tick(0.1, env({ flags: { 'talked.c.jost': true } }));
    expect(slice.completed).toContain('c');
    slice = createStorySlice();
  });

  it('echo and grant run once (not again when a beat resumes); npc / meter / memorial do', () => {
    const mk = (a: Partial<Action> & { do: Action['do'] }) => a as Action;
    expect(runsOnResume(mk({ do: 'echo', id: 'x' } as Action))).toBe(false);
    expect(runsOnResume(mk({ do: 'grant', clue: 'x' } as Action))).toBe(false);
    expect(runsOnResume(mk({ do: 'npc', op: 'spawn', npc: 'hanne' } as Action))).toBe(true);
    expect(runsOnResume(mk({ do: 'meter', id: 'oil', active: true } as Action))).toBe(true);
    expect(runsOnResume(mk({ do: 'memorial', id: 'r', x: 1, z: 2 } as Action))).toBe(true);
  });
});

describe('story validator (round 2)', () => {
  const file = (beats: StoryFile['beats']): { file: string; story: StoryFile } => ({ file: 't.story.json', story: { chapter: 't', order: 0, title_de: 'T', start: beats[0]!.id, beats } });

  it('accepts the new conditions and actions', () => {
    const r = validateStories([
      file([
        {
          id: 'a',
          enter: [
            { do: 'npc', op: 'spawn', npc: 'hanne', x: 1287, z: -1228, era: '1789', chapter: 'k1' },
            { do: 'meter', id: 'oil', active: true, seconds: 90 },
            { do: 'meter', id: 'atem', active: true, seconds: 30, label: 'Atem', full: 'return', lossless: true },
            { do: 'echo', id: 'echo.k1.feuerwerk' },
            { do: 'memorial', id: 'rondell', x: 1815, z: 348, r: 20 },
            { do: 'readings', fill: 'offen' },
            { do: 'grant', clue: 'clue.k1.soll' },
            { do: 'say', speaker: 'laub', text: 'x', text_by_era: { today: 'y {jahre:1793}' } },
            { do: 'choice', id: 'k2.tor', modal: false, prompt: 'Tor', options: [{ label: 'a', key: 'leuchten', set: {}, when: { lantern: true } }, { label: 'b', key: 'dunkel', set: {}, when: { lantern: false }, then: [{ do: 'toast', text: 'dunkel' }] }] },
          ],
          complete: { all: [{ room: 'B03.1.eg-registratur' }, { talked: { npc: 'hanne' } }, { reading: 'flag.k1_lohn', eq: 'creuzer' }, { meter: { id: 'oil', gte: 0.5 } }, { chosen: 'k2.tor', option: 'dunkel' }, { chapterTimer: 3 }] },
        },
      ]),
    ]);
    expect(r.errors.map((e) => e.message)).toEqual([]);
  });

  it('rejects broken ones', () => {
    const r = validateStories([
      file([
        {
          id: 'a',
          enter: [
            { do: 'npc', op: 'wave', npc: 'hanne' } as unknown as Action,
            { do: 'meter', id: 'atem', active: true } as Action,
            { do: 'memorial', id: 'm' } as Action,
            { do: 'readings', fill: 'alles' } as unknown as Action,
            { do: 'say', speaker: 'laub', text: 'x', text_by_era: { morgen: 'y' } } as unknown as Action,
            { do: 'choice', id: 'c', prompt: 'p', options: [{ label: 'a', set: {}, when: { nonsense: 1 } }, { label: 'b', set: {} }] } as unknown as Action,
          ],
          complete: { all: [{ meter: { id: 'oil' } }, { talked: {} }, { chapterTimer: -1 }] } as unknown as StoryFile['beats'][0]['complete'],
        },
      ]),
    ]);
    const msgs = r.errors.map((e) => e.message).join('\n');
    expect(msgs).toMatch(/npc needs op/);
    expect(msgs).toMatch(/meter 'atem' needs seconds/);
    expect(msgs).toMatch(/memorial needs x\/z/);
    expect(msgs).toMatch(/readings needs fill/);
    expect(msgs).toMatch(/text_by_era\.morgen/);
    expect(msgs).toMatch(/condition needs exactly one/);
    expect(msgs).toMatch(/meter 'oil' needs gte, lte or full/);
    expect(msgs).toMatch(/talked needs/);
    expect(msgs).toMatch(/chapterTimer needs/);
  });
});

describe('meters', () => {
  const tick = { era: '1789', still: false, hold: false, gentle: false, rauhnacht: false };
  it('custom gauges fill on game time, only in their era, not while held; full once', () => {
    const m = newMeter('atem', { seconds: 10, era: '1789' });
    for (let i = 0; i < 99; i++) expect(tickMeter(m, 0.1, tick)).toBe(false);
    expect(tickMeter(m, 0.1, { ...tick, era: 'today' })).toBe(false);
    expect(tickMeter(m, 0.1, { ...tick, hold: true })).toBe(false);
    expect(m.value).toBeCloseTo(0.99, 5);
    expect(tickMeter(m, 0.2, tick)).toBe(true);
    expect(tickMeter(m, 0.2, tick)).toBe(false);
    relieve(m, 0.5);
    expect(m.done).toBe(false);
    expect(m.value).toBeCloseTo(0.5, 5);
  });
  it('standing still fills faster; gentle +50 %, Rauhnacht −30 %; wrapped meters only mirror', () => {
    const m = newMeter('vergessen.k4', { seconds: 10, still: 3 });
    tickMeter(m, 1, { ...tick, still: true });
    expect(m.value).toBeCloseTo(0.3, 5);
    expect(meterSeconds({ seconds: 90 }, { gentle: true, rauhnacht: false })).toBe(135);
    expect(meterSeconds({ seconds: 100 }, { gentle: false, rauhnacht: true })).toBeCloseTo(70, 5);
    const oil = newMeter('oil', { seconds: 90 });
    expect(isWrapped('oil') && isWrapped('smoke') && isWrapped('vergessen')).toBe(true);
    expect(tickMeter(oil, 50, tick)).toBe(false);
    expect(oil.value).toBe(0);
  });
});

describe('epilogue assembly (endings pack, bible 06-enden §6)', () => {
  const fill = (s: string) => substituteName(s, 'Mara', 2026);
  it('one sentence per block in pack order; flags pick the variant, else offen / nichts', () => {
    expect(epilogueLines(ENDEN).length).toBeGreaterThan(30);
    const e = assembleEpilogue(ENDEN, 'museum', { 'flag.k1_lohn': 'n.r_will_nicht', 'flag.k3_objekt': 'tuergriff' }, { fill })!;
    expect(e.intro).toMatch(/^Karlsberg bei Homburg/);
    expect(e.object).toMatch(/Türgriff/);
    expect(e.variants.lohn).toBe('will_nicht');
    expect(e.variants.object).toBe('tuergriff');
    expect(e.lines.some((l) => l.startsWith('Hanne, Witwe'))).toBe(true);
    expect(e.outro.length).toBeGreaterThan(10);
    const none = assembleEpilogue(ENDEN, 'burn', {}, { fill })!;
    expect(none.variants.lohn).toBe('offen');
    expect(none.object).toMatch(/nichts/);
    expect(none.intro).not.toBe(e.intro);
    // no placeholder survives
    for (const t of [e.intro, ...e.lines, e.object, e.outro, e.coda]) expect(t).not.toMatch(/\{[A-Za-z]/);
  });
  it('a pack without epilog lines yields null (fallback: the story file data)', () => {
    expect(assembleEpilogue(K1, 'keep', {})).toBeNull();
  });
});

describe('dialogue triggers and placeholders', () => {
  it('fillText: {Name}, {jahre:1793} in words with a fallback, {jahr}', () => {
    expect(fillText('Nach {jahre:1793} Jahren, {name}.', { name: 'Mara', year: 2026 })).toBe('Nach zweihundertdreiunddreißig Jahren, Mara.');
    expect(fillText('Nach {jahre:1793} Jahren.', { name: '', year: 1999 })).toBe('Nach über zweihundert Jahren.');
    expect(fillText('{Name} {jahr}', { name: '', year: 2030, fallbackName: 'Feldmesserin' })).toBe('Feldmesserin 2030');
    expect(germanNumber(233)).toBe('zweihundertdreiunddreißig');
    expect(germanNumber(101)).toBe('einhunderteins');
    expect(germanNumber(240)).toBe('zweihundertvierzig');
    expect(substituteName('{Name}? {jahre:1793}', 'Alex', 2027)).toBe('Alex? zweihundertvierunddreißig');
  });
  it('the endings line uses the year placeholder (no hard-coded 233)', () => {
    const l = ENDEN.find((x) => x.id === 'laub.end.museum_1');
    expect(l?.text_de).toContain('{jahre:1793}');
  });
  it('matchTrigger: flag values (n.r_x ≡ x), below, hasClue, chapter from the payload', () => {
    const flags = { 'flag.k1_lohn': 'n.r_creuzer' };
    const c = { era: '1789', flags, chapter: 'k1', beat: null, clues: ['clue.k1.soll'] };
    expect(matchTrigger(line('a', { event: 'x', flag: 'flag.k1_lohn', value: 'creuzer' }), 'x', {}, c)).toBe(true);
    expect(matchTrigger(line('a', { event: 'x', flag: 'flag.k1_lohn', value: 'will_nicht' }), 'x', {}, c)).toBe(false);
    expect(matchTrigger(line('a', { event: 'lantern:oil', below: 0.2 }), 'lantern:oil', { oil: 0.1 }, c)).toBe(true);
    expect(matchTrigger(line('a', { event: 'lantern:oil', below: 0.2 }), 'lantern:oil', { oil: 0.5 }, c)).toBe(false);
    expect(matchTrigger(line('a', { event: 'npc:talk', hasClue: 'clue.k1.soll' }), 'npc:talk', {}, c)).toBe(true);
    expect(matchTrigger(line('a', { event: 'npc:talk', chapter: 'k2' }), 'npc:talk', { chapter: 'k2' }, c)).toBe(true);
    expect(matchTrigger(line('a', { event: 'npc:talk', chapter: 'k2' }), 'npc:talk', {}, c)).toBe(false);
    expect(valueKey('n.r_will_nicht')).toBe('will_nicht');
  });
  it('pickSequence: stepped lines play in order as one answer', () => {
    const c = { era: '1789', flags: {}, chapter: 'k1', beat: null };
    const seq = pickSequence(K1, 'npc:talk', { npc: 'jost', chapter: 'k1', topic: 'verstecken' }, c, new Set(), new Map(), 0);
    expect(seq.map((l) => l.id)).toEqual(['jost.k1.05', 'jost.k1.06', 'jost.k1.07', 'jost.k1.08']);
  });
  it('bark lines and groups', () => {
    expect(isBarkLine('laub.bark.idle.03')).toBe(true);
    expect(isBarkLine('marlene.gen.12')).toBe(true);
    expect(isBarkLine('laub.k1.03')).toBe(false);
    expect(barkGroup('laub.bark.idle.03')).toBe('laub.bark.idle');
  });
});

describe('npc conversations', () => {
  const c = (over: Partial<{ flags: Record<string, string | boolean>; clues: string[] }> = {}) => ({ era: '1789', flags: over.flags ?? {}, chapter: 'k1', beat: null, clues: over.clues ?? [] });
  it('topics in pack order, follow-up steps do not add topics, flag-gated topics stay hidden', () => {
    const hanne = talkLines(K1, 'hanne', 'k1');
    expect(availableTopics(hanne, 'hanne', 'k1', c())).toEqual(['matthes', 'warten', 'berg', 'warum']);
    const jost = talkLines(K1, 'jost', 'k1');
    expect(availableTopics(jost, 'jost', 'k1', c(), ['namen', 'meute'])).toEqual(['namen', 'meute', 'futter', 'hunger', 'verstecken', 'stellen']);
    const soll3 = talkLines(K3, 'soll', 'k3');
    const plain = answer(soll3, 'soll', 'k3', 'buch', { ...c(), chapter: 'k3' }, new Set());
    const more = answer(soll3, 'soll', 'k3', 'buch', { ...c({ flags: { 'flag.k2_versteck_gesehen': true } }), chapter: 'k3' }, new Set());
    expect(more.length).toBeGreaterThan(plain.length);
    expect(more.some((l) => l.speaker === 'laub')).toBe(true);
  });
  it('greet: once; the clue-aware greeting wins once Soll was asked', () => {
    const hanne = talkLines(K1, 'hanne', 'k1');
    expect(answer(hanne, 'hanne', 'k1', 'greet', c(), new Set()).map((l) => l.id)).toEqual(['hanne.k1.01']);
    expect(answer(hanne, 'hanne', 'k1', 'greet', c(), new Set(['hanne.k1.01']))).toEqual([]);
    expect(answer(hanne, 'hanne', 'k1', 'greet', c({ clues: ['clue.k1.soll'] }), new Set(['hanne.k1.01'])).map((l) => l.id)).toEqual(['hanne.k1.09']);
    expect(answer(hanne, 'hanne', 'k1', 'matthes', c(), new Set()).map((l) => l.id)).toEqual(['hanne.k1.02', 'hanne.k1.03']);
  });
  it('flags, clue ids, labels, looks', () => {
    expect(talkedFlag('k1', 'hanne')).toBe('talked.k1.hanne');
    expect(talkedFlag('k1', 'hanne', 'berg')).toBe('talked.k1.hanne.berg');
    expect(clueFor('k1', 'jost')).toBe('clue.k1.jost');
    expect([...askedTopics({ 'talked.k1.hanne.berg': true }, 'k1', 'hanne', ['berg', 'warum'])]).toEqual(['berg']);
    expect(topicLabel('verstecken')).toBe('Wie versteckt man sich?');
    expect(topicLabel('neu_thema')).toBe('Nach neu thema fragen');
    expect(lookFor('hanne').mood).toBe('warm');
    expect(lookFor('soll').mood).toBe('eerie');
    expect(lookFor('fremder').mood).toBe('neutral');
    expect(lookFor('soll', 'warm').mood).toBe('warm');
  });
});

describe('bark rules (bible 08-stimmen)', () => {
  const idle = VOICES.filter((l) => l.trigger.event === 'bark:idle');
  const hub = VOICES.filter((l) => l.trigger.event === 'hub:enter' && isBarkLine(l.id));
  it('one line per group, never the same line within 10 minutes, at most one bark per 45 s', () => {
    const mem = newMemory();
    const rng = seededRng(7);
    let now = 0;
    const said: string[] = [];
    for (let i = 0; i < idle.length; i++) {
      expect(ready(mem, now)).toBe(true);
      const l = chooseBark(idle, mem, now, rng)!;
      expect(said).not.toContain(l.id);
      said.push(l.id);
      record(mem, l, now);
      expect(ready(mem, now + GLOBAL_GAP - 1)).toBe(false);
      now += GLOBAL_GAP;
    }
    // every idle line spoken within 10 min: nothing left
    expect(now).toBeLessThan(LINE_COOLDOWN);
    expect(chooseBark(idle, mem, now, rng)).toBeNull();
    // after the cooldown the first one is free again
    expect(chooseBark(idle, mem, LINE_COOLDOWN + 1, rng)).not.toBeNull();
  });
  it('groups answering the same event take turns (Laub returns, then Marlene)', () => {
    const mem = newMemory();
    const rng = seededRng(3);
    const a = chooseBark(hub, mem, 0, rng)!;
    expect(barkGroup(a.id)).toBe('laub.bark.return');
    record(mem, a, 0);
    const b = chooseBark(hub, mem, 50, rng)!;
    expect(barkGroup(b.id)).toBe('marlene.gen');
  });
  it('quiet at memorials, during echoes, conversations and lines', () => {
    expect(memorialAt(BUILTIN_MEMORIALS, 1815, 350, '1789', null)).toBe('rondell');
    expect(memorialAt(BUILTIN_MEMORIALS, 1700, 350, '1789', null)).toBeNull();
    expect(memorialAt([{ id: 'w5', room: 'b01.festsaal', era: '1793-07' }], 0, 0, '1793-07', 'b01.festsaal')).toBe('w5');
    expect(memorialAt([{ id: 'w5', room: 'b01.festsaal', era: '1793-07' }], 0, 0, '1789', 'b01.festsaal')).toBeNull();
    const q = { echo: false, conversation: false, dialogue: false, modal: false, curtain: false, memorial: null, flag: false };
    expect(quietReason(q)).toBeNull();
    expect(quietReason({ ...q, echo: true })).toBe('echo');
    expect(quietReason({ ...q, memorial: 'rondell' })).toBe('memorial:rondell');
    expect(quietReason({ ...q, conversation: true })).toBe('conversation');
    expect(quietReason({ ...q, dialogue: true })).toBe('dialogue');
  });
});
