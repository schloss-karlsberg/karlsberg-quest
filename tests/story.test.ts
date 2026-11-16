import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DialogueLine } from '../src/content/types';
import { holdSeconds, substituteName } from '../src/systems/story/dialogue/presenter';
import { speakerKey, speakerMeta } from '../src/systems/story/dialogue/speakers';
import { matchTrigger, pickLine } from '../src/systems/story/dialogue/triggers';
import { syllableStarts } from '../src/systems/story/dialogue/voice';
import { type StoryEnv, type StoryHost, StoryEngine, type StorySlice, createStorySlice, evaluate, runsOnResume } from '../src/systems/story/engine';
import { composeEpilogue, nounToVariant } from '../src/systems/story/endings/epilogue';
import { endingScenes, yearsSpelled } from '../src/systems/story/endings/scenes';
import { STATION, FieldStation } from '../src/systems/story/hub/station';
import { angleDiff, bearingDeg } from '../src/systems/story/objectives';
import { HORN_SIGNALS } from '../src/systems/story/sfx';
import type { Action, Beat, StoryFile } from '../src/systems/story/types';
import { validateStories } from '../src/systems/story/validate';
import { loadStoryFiles } from '../src/systems/story/validate-cli';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

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

interface Rec {
  runs: { source: string; resume: boolean; kinds: string[] }[];
  chapters: string[];
  beats: string[];
  completed: string[];
}

function harness(files: StoryFile[]) {
  let slice: StorySlice = createStorySlice();
  const rec: Rec = { runs: [], chapters: [], beats: [], completed: [] };
  const host: StoryHost = {
    run: (actions, o) => rec.runs.push({ source: o.source, resume: o.resume, kinds: actions.filter((a) => !o.resume || runsOnResume(a)).map((a) => a.do) }),
    chapterEntered: (f) => rec.chapters.push(f.chapter),
    beatEntered: (ch, b) => rec.beats.push(`${ch}/${b.id}`),
    chapterCompleted: (f) => rec.completed.push(f.chapter),
  };
  const engine = new StoryEngine(files, () => slice, host);
  return {
    engine,
    rec,
    get slice() {
      return slice;
    },
    reload() {
      slice = JSON.parse(JSON.stringify(slice)) as StorySlice;
    },
  };
}

const say = (text: string): Action => ({ do: 'say', speaker: 'laub', text });
const beat = (id: string, complete: Beat['complete'], extra: Partial<Beat> = {}): Beat => ({ id, complete, enter: [say(id)], ...extra });

const chapterA: StoryFile = {
  chapter: 'a',
  order: 0,
  title_de: 'A',
  start: 'a1',
  next: 'b',
  unlocks: ['x'],
  beats: [
    beat('a1', { event: 'hub:use', match: { item: 'drawer' } }, { checkpoint: 'a1' }),
    beat('a2', { all: [{ enter: { x: 100, z: 0, r: 10 } }, { scan: 2 }] }),
    beat('a3', { timer: 5 }, { checkpoint: 'a2', enter: [say('a3'), { do: 'objective', text: 'go' }, { do: 'teleport', x: 1, z: 2 }] }),
  ],
  on: [{ id: 'note', when: { flag: 'seen' }, do: [{ do: 'toast', text: 'seen' }] }],
};
const chapterB: StoryFile = { chapter: 'b', order: 1, title_de: 'B', start: 'b1', beats: [beat('b1', { manual: true })] };

describe('story engine', () => {
  it('runs beats in order: events, zones, timers, chapter completion and unlocks', () => {
    const h = harness([chapterB, chapterA]);
    expect(h.engine.first?.chapter).toBe('a');
    h.engine.goto('a');
    expect(h.slice.beat).toBe('a1');
    h.engine.tick(0.1, env());
    expect(h.slice.beat).toBe('a1');
    h.engine.onEvent('hub:use', { item: 'radio' });
    h.engine.tick(0.1, env());
    expect(h.slice.beat).toBe('a1');
    h.engine.onEvent('hub:use', { item: 'drawer' });
    h.engine.tick(0.1, env());
    expect(h.slice.beat).toBe('a2');
    h.engine.tick(0.1, env({ x: 100, z: 3, scan: 1 }));
    expect(h.slice.beat).toBe('a2');
    h.engine.tick(0.1, env({ x: 100, z: 3, scan: 2 }));
    expect(h.slice.beat).toBe('a3');
    for (let i = 0; i < 49; i++) h.engine.tick(0.1, env());
    expect(h.slice.beat).toBe('a3');
    h.engine.tick(0.2, env());
    // chapter a complete → unlocks x and b, continues with b
    expect(h.rec.completed).toEqual(['a']);
    expect(h.slice.chapter).toBe('b');
    expect(h.slice.unlocked).toEqual(expect.arrayContaining(['a', 'b', 'x']));
    expect(h.slice.doneBeats).toEqual(['a/a1', 'a/a2', 'a/a3']);
  });

  it('fires chapter reactions once and repeatable ones on each rising edge', () => {
    const file: StoryFile = {
      ...chapterA,
      chapter: 'r',
      start: 'r1',
      next: undefined,
      beats: [beat('r1', { manual: true }, { on: [{ id: 'zone', repeat: true, when: { enter: { x: 0, z: 0, r: 5 } }, do: [{ do: 'prompt', key: 'Q', text: 'x' }] }] })],
    };
    const h = harness([file]);
    h.engine.goto('r');
    const count = (src: string) => h.rec.runs.filter((r) => r.source.endsWith(src)).length;
    h.engine.tick(0.1, env({ flags: { seen: true } }));
    h.engine.tick(0.1, env({ flags: { seen: true } }));
    expect(count('c:note')).toBe(1);
    expect(count('b:zone')).toBe(1); // inside at the start
    h.engine.tick(0.1, env({ x: 50 }));
    h.engine.tick(0.1, env({ x: 1 }));
    h.engine.tick(0.1, env({ x: 1 }));
    expect(count('b:zone')).toBe(2);
  });

  it('survives a save round-trip and resumes at the checkpoint without one-shot actions', () => {
    const h = harness([chapterA, chapterB]);
    h.engine.goto('a', 'a3');
    h.engine.tick(1, env());
    h.reload();
    h.rec.runs.length = 0;
    h.engine.resume(true);
    expect(h.slice.beat).toBe('a2');
    h.engine.goto('a', 'a3');
    h.rec.runs.length = 0;
    h.engine.resume(false);
    expect(h.slice.beat).toBe('a3');
    const last = h.rec.runs.at(-1)!;
    expect(last.resume).toBe(true);
    // say + teleport are one-shots; the objective is restored
    expect(last.kinds).toEqual(['objective']);
  });

  it('skip() completes the current beat; goto() rejects unknown ids', () => {
    const h = harness([chapterA, chapterB]);
    h.engine.goto('a');
    h.engine.skip();
    expect(h.slice.beat).toBe('a2');
    expect(() => h.engine.goto('nope')).toThrow(/unknown chapter/);
    expect(() => h.engine.goto('a', 'zz')).toThrow(/no beat/);
  });

  it('evaluates conditions', () => {
    const e = env({
      flags: { a: 1, b: 0, s: 'x' },
      inventory: { clues: ['c1'], nouns: [], items: ['item.bussole'] },
      chronik: { 'case.p': { confirmed: ['entry.p.1', 'entry.p.2', 'entry.p.3'] }, other: { confirmed: ['entry.p.4'] } },
      caseFacts: (id) => (id === 'case.p' ? ['entry.p.1', 'entry.p.2', 'entry.p.3'] : null),
    });
    const ev = (c: Parameters<typeof evaluate>[0]) => evaluate(c, e, {}, 'k', 3);
    expect(ev({ flag: 'a' })).toBe(true);
    expect(ev({ flag: 'b' })).toBe(false);
    expect(ev({ flag: 's', eq: 'x' })).toBe(true);
    expect(ev({ have: { clue: 'c1', item: 'item.bussole' } })).toBe(true);
    expect(ev({ have: { noun: 'n' } })).toBe(false);
    expect(ev({ confirmed: { prefix: 'entry.p.', n: 4 } })).toBe(true);
    expect(ev({ confirmed: { case: 'case.p', n: 4 } })).toBe(false);
    expect(ev({ caseComplete: 'case.p' })).toBe(true);
    expect(ev({ caseComplete: 'other' })).toBe(false);
    expect(ev({ timer: 2 })).toBe(true);
    expect(ev({ not: { timer: 2 } })).toBe(false);
    expect(ev({ any: [{ flag: 'b' }, { era: 'today' }] })).toBe(true);
    expect(ev({ all: [{ flag: 'a' }, { lantern: true }] })).toBe(false);
    expect(ev({ leave: { x: 10, z: 0, r: 5 } })).toBe(true);
    expect(ev({ enter: { x: 0, z: 0, r: 1, era: '1789' } })).toBe(false);
  });
});

describe('story files', () => {
  const { files, parseErrors } = loadStoryFiles(ROOT);

  it('parse and validate (prologue + four chapters + endings)', () => {
    expect(parseErrors).toEqual([]);
    // items declared by the quest files (content/quests/*.quests.json) are known to the story
    const questItems = new Set<string>();
    for (const f of readdirSync(`${ROOT}content/quests`).filter((n) => n.endsWith('.quests.json')))
      for (const it of (JSON.parse(readFileSync(`${ROOT}content/quests/${f}`, 'utf8')) as { items?: { id: string }[] }).items ?? []) questItems.add(it.id);
    const r = validateStories(files, { items: questItems });
    expect(r.errors.map((e) => `${e.file} ${e.id ?? ''}: ${e.message}`)).toEqual([]);
    // + the test chapter (99-test.story.json, "test": true; loaded only with ?storytest)
    expect(r.stats.chapters).toBe(7);
    expect(files.filter((f) => f.story.test).map((f) => f.story.chapter)).toEqual(['test']);
    expect(r.stats.beats).toBeGreaterThan(35);
    const prolog = files.find((f) => f.story.chapter === 'prolog')!.story;
    expect(prolog.placeholder).toBeFalsy();
    expect(prolog.beats.map((b) => b.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p9b', 'p10', 'p11']);
    // chapters chain to the endings
    const order = files.map((f) => f.story).filter((f) => !f.test).sort((a, b) => a.order - b.order);
    for (let i = 0; i < order.length - 1; i++) expect(order[i]!.next).toBe(order[i + 1]!.chapter);
    expect(order.at(-1)!.epilogue).toBeTruthy();
  });

  it('every non-historical line is marked by a fiction speaker; {Name} only in Marlene/Laub', () => {
    for (const { story } of files)
      for (const b of story.beats)
        for (const a of [...(b.enter ?? []), ...(b.exit ?? [])])
          if (a.do === 'say' && a.text?.includes('{Name}')) expect(['marlene', 'laub']).toContain(a.speaker);
  });

  it('rejects broken files', () => {
    const bad: StoryFile = {
      chapter: 'bad',
      order: 9,
      title_de: 'Bad',
      start: 'nope',
      next: 'missing',
      beats: [
        { id: 'b1', complete: { foo: 1 } as never, enter: [{ do: 'explode' } as never, { do: 'shift', to: '1999' as never }] },
        { id: 'b1', complete: { timer: 1 }, next: 'ghost' },
      ],
    };
    const r = validateStories([{ file: 'bad.story.json', story: bad }]);
    expect(r.ok).toBe(false);
    const msg = r.errors.map((e) => e.message).join('\n');
    expect(msg).toMatch(/start/);
    expect(msg).toMatch(/condition/);
    expect(msg).toMatch(/explode/);
    expect(msg).toMatch(/duplicate|twice/);
    expect(msg).toMatch(/ghost/);
  });

  it('runs the real prologue headlessly from the field station to the cliffhanger', () => {
    const h = harness(files.map((f) => f.story));
    h.engine.goto('prolog');
    const step = (e: Partial<StoryEnv>, n = 1) => {
      for (let i = 0; i < n; i++) h.engine.tick(0.5, env(e));
    };
    // clues are state: the engine grants them (clue:grant), the harness keeps the inventory
    const clues: string[] = [];
    const inv = (...add: string[]) => {
      clues.push(...add);
      return { inventory: { clues: [...clues], nouns: [], items: [] } };
    };
    // quests are state too: the quests system mirrors `quest.<id>` / `quest.<id>.<objective>` into flags
    const flags: Record<string, string | number> = {};
    const quest = (id: string, objective?: string, n = 1) => {
      if (objective) flags[`quest.${id}.${objective}`] = n;
      else flags[`quest.${id}`] = 'done';
      return { flags: { ...flags } };
    };
    for (const item of ['chronik', 'shelf', 'drawer']) h.engine.onEvent('hub:use', { item });
    step(inv('clue.p.lageplan', 'clue.p.laubblatt', 'clue.p.handbuch'));
    expect(h.slice.beat).toBe('p1'); // the Messstab is still leaning outside
    step({ ...inv(), ...quest('q.p.feldstation') });
    expect(h.slice.beat).toBe('p2');
    step({ ...inv(), x: 813, z: -903, scan: 2 });
    expect(h.slice.beat).toBe('p3');
    step({ ...inv('clue.p.mauerrest'), x: 1237, z: -966, scan: 3 });
    expect(h.slice.beat).toBe('p3'); // the step is there, but Marlene's quest wants the dam and the wall first
    step({ ...inv(), ...quest('q.p.relief'), x: 1237, z: -966, scan: 3 });
    expect(h.slice.beat).toBe('p4');
    // the Ehrenhof clue first, then the 1840 map overlay grants the Kartenvergleich
    step({ ...inv('clue.p.orangeriemauer', 'clue.p.ehrenhof'), x: 1216, z: -1114, map: true });
    step({ ...inv('clue.p.kartenvergleich'), x: 1216, z: -1114 });
    expect(h.slice.beat).toBe('p5');
    step({ ...inv(), x: 1172, z: -1238, scan: 2 });
    expect(h.slice.beat).toBe('p6');
    step({ ...inv('clue.p.hohlweg'), x: 1508, z: -1296, scan: 3 });
    expect(h.slice.beat).toBe('p6'); // the pit is found; the Nebelinge are still in it
    step({ ...inv('clue.p.eiskeller'), ...quest('q.p.bussole', 'nebel', 4), ...quest('q.p.bussole') });
    expect(h.slice.beat).toBe('p7');
    step(inv('clue.p.punktwolke', 'clue.p.seite_eins'), 8);
    expect(h.slice.beat).toBe('p8'); // the rules: J opens the field book, no board to fill
    step({ ...inv(), flags: { ...flags } }, 13);
    expect(h.slice.beat).toBe('p9');
    step({ ...inv(), flags: { ...flags }, era: '1789', x: 1216, z: -1114 });
    expect(h.slice.beat).toBe('p9b');
    step({ ...inv(), flags: { ...flags }, era: 'today' });
    expect(h.slice.beat).toBe('p9b'); // home too early: the Streuner still waits at the Ehrenhof
    step({ ...inv(), ...quest('q.p.punktwolke', 'streuner'), era: 'today' });
    expect(h.slice.beat).toBe('p10');
    step({ ...inv(), ...quest('q.p.punktwolke') });
    expect(h.slice.beat).toBe('p10'); // the quest alone is not enough: back home to the station
    step({ ...inv(), flags: { ...flags }, x: 760, z: -905 }, 10); // the dusk walk lasts at least 9 s
    expect(h.slice.beat).toBe('p11');
    step({}, 20);
    expect(h.slice.chapter).toBe('prolog'); // the night lasts a little
    h.engine.onEvent('hub:use', { item: 'bed' });
    step({}, 60);
    expect(h.slice.chapter).toBe('k1');
    expect(h.slice.completed).toContain('prolog');
  });
});

describe('dialogue', () => {
  const line = (id: string, trigger: DialogueLine['trigger'], extra: Partial<DialogueLine> = {}): DialogueLine => ({ id, speaker: 'laub', text_de: id, trigger, ...extra });
  const ctx = { era: 'today', flags: { 'story.laub': true }, chapter: 'prolog', beat: 'p3' };

  it('matches triggers on event, era (payload.to), flags, chapter and payload keys', () => {
    expect(matchTrigger(line('a', { event: 'era:change', era: '1789' }), 'era:change', { from: 'today', to: '1789' }, ctx)).toBe(true);
    expect(matchTrigger(line('a', { event: 'era:change', era: '1789' }), 'era:change', { from: '1789', to: 'today' }, ctx)).toBe(false);
    expect(matchTrigger(line('a', { event: 'hub:use', item: ['radio', 'bed'] }), 'hub:use', { item: 'bed' }, ctx)).toBe(true);
    expect(matchTrigger(line('a', { event: 'hub:use', flag: 'story.laub', chapter: 'prolog' }), 'hub:use', {}, ctx)).toBe(true);
    expect(matchTrigger(line('a', { event: 'hub:use', flag: 'nope' }), 'hub:use', {}, ctx)).toBe(false);
  });

  it('picks the highest priority, honours once and the cooldown', () => {
    const lines = [line('lo', { event: 'x' }), line('hi', { event: 'x' }, { priority: 5, once: true })];
    expect(pickLine(lines, 'x', {}, ctx, new Set(), new Map(), 0)?.id).toBe('hi');
    expect(pickLine(lines, 'x', {}, ctx, new Set(['hi']), new Map(), 0)?.id).toBe('lo');
    expect(pickLine(lines, 'x', {}, ctx, new Set(['hi']), new Map([['lo', 10]]), 20)).toBeNull();
    expect(pickLine(lines, 'x', {}, ctx, new Set(['hi']), new Map([['lo', 10]]), 60)?.id).toBe('lo');
  });

  it('speakers: portraits, labels and voices', () => {
    expect(speakerKey('sp.laub')).toBe('laub');
    const laub = speakerMeta('laub');
    expect(laub.portrait).toBe('compass');
    expect(laub.historical).toBe(false);
    expect(laub.voice.ring).toBe(true);
    expect(speakerMeta('marlene').voice.radio).toBe(true);
    expect(speakerMeta('mannlich').historical).toBe(true);
    expect(speakerMeta('diener').echo).toBe(true);
    expect(speakerMeta('somebody-new').portrait).toBe('cameo');
  });

  it('typing helpers', () => {
    expect(substituteName('{Name}? Hier Marlene.', 'Mara')).toBe('Mara? Hier Marlene.');
    expect(substituteName('{Name}!', '')).not.toContain('{Name}');
    expect(holdSeconds('kurz')).toBeGreaterThanOrEqual(2.2);
    expect(holdSeconds('x'.repeat(500))).toBeLessThanOrEqual(9);
    expect(holdSeconds('x', 3000)).toBe(3);
    const s = syllableStarts('Fünf Meter dreißig. Für Orangen.');
    expect(s.size).toBeGreaterThan(5);
    expect(s.has(1)).toBe(true); // "ü" of "Fünf"
  });
});

describe('objectives, station, endings', () => {
  it('bearing: 0 = north (−z), 90 = east', () => {
    expect(bearingDeg(0, 0, 0, -10)).toBeCloseTo(0);
    expect(bearingDeg(0, 0, 10, 0)).toBeCloseTo(90);
    expect(bearingDeg(0, 0, 0, 10)).toBeCloseTo(180);
    expect(bearingDeg(0, 0, -10, 0)).toBeCloseTo(270);
    expect(angleDiff(10, 350)).toBeCloseTo(20);
    expect(angleDiff(350, 10)).toBeCloseTo(-20);
  });

  it('the trailer pushes the player out of its footprint', () => {
    expect(FieldStation.pushOut(STATION.x + 20, STATION.z)).toBeNull();
    const o = FieldStation.pushOut(STATION.x + 0.3, STATION.z + 1.2)!;
    expect(o).not.toBeNull();
    expect(Math.abs(o.z - STATION.z)).toBeGreaterThan(STATION.halfWid);
    expect(Math.hypot(STATION.spawn.x - STATION.x, STATION.spawn.z - STATION.z)).toBeLessThan(STATION.r);
  });

  it('horn signals are distinct', () => {
    const keys = Object.values(HORN_SIGNALS).map((s) => s.notes.join(','));
    expect(new Set(keys).size).toBe(4);
  });

  it('epilogue: readings from the Chronik, flags as fallback, "offen" otherwise', () => {
    const { files } = loadStoryFiles(ROOT);
    const data = files.find((f) => f.story.epilogue)!.story.epilogue!;
    const e = composeEpilogue(data, 'museum', {
      chronik: { 'case.p': { filled: {}, confirmed: [], readings: { 'entry.p.7': { b1: 'n.hunde' } } }, 'case.k4': { filled: {}, confirmed: [], readings: { 'entry.k4.8': { b: 'n.r_herr_suchen' } } } },
      flags: { 'flag.k1_lohn': 'will_nicht', 'flag.k3_objekt': 'uhr', k2_tor: 'unbekannt' },
    });
    expect(e.variants.p_spuren).toBe('hunde');
    expect(e.variants.k4_meute).toBe('herr');
    expect(e.variants.k1_lohn).toBe('will_nicht');
    expect(e.variants.k2_tor).toBe('offen');
    expect(e.variants.k2_pfeiffer).toBe('offen');
    expect(e.variants.object).toBe('uhr');
    expect(e.object).toMatch(/Uhr/);
    expect(e.intro.length).toBeGreaterThan(10);
    expect(e.lines.join(' ')).not.toMatch(/undefined/);
    const burn = composeEpilogue(data, 'burn', { chronik: {}, flags: {} });
    expect(burn.variants.object).toBe('nichts');
    expect(burn.outro).not.toBe(e.outro);
    expect(nounToVariant('n.r_will_nicht')).toBe('will_nicht');
  });

  it('three ending scenes with Laub and Marlene', () => {
    const s = endingScenes(2026);
    expect(Object.keys(s)).toEqual(['museum', 'burn', 'keep']);
    expect(s.museum.laub[0]).toContain('zweihundertdreiunddreißig');
    expect(yearsSpelled(2031)).toContain('über zweihundert');
    for (const e of Object.values(s)) {
      expect(e.laub.length).toBe(3);
      expect(e.marlene.length).toBeGreaterThan(10);
    }
  });
});
