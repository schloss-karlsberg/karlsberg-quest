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
    expect(prolog.beats.map((b) => b.id)).toEqual(['p1', 'p2', 'p3', 'p3q', 'p3r', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p9b', 'p10', 'p11']);
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
    expect(h.slice.beat).toBe('p3q'); // Laub hears the water: down to the Karlsbergquelle
    step({ ...inv(), x: 1059.3, z: -833.1 });
    expect(h.slice.beat).toBe('p3q'); // at the trough: the touch is the player's
    h.engine.onEvent('quelle:touch', { era: 'today' });
    step({ ...inv(), x: 1059.3, z: -833.1 });
    expect(h.slice.beat).toBe('p3r'); // the shift to 1789 (fx), the Brunnenstube
    step({ ...inv(), era: '1789', x: 1059.3, z: -833.1 }, 4);
    expect(h.slice.beat).toBe('p3r');
    step({ ...inv(), ...quest('q.p.quelle'), era: 'today', x: 1059.3, z: -833.1 });
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
    // home by the map (playtest round 10 F-30: no 470 m walk for one bed): the journey lands beside
    // the Feldstation tripod (776/−902 + 2.2 m), outside the 22 m circle; the arrival itself counts
    h.engine.onEvent('travel:arrived', { id: 'feldstation', from: { x: 1218, z: -1118 } });
    step({ ...inv(), flags: { ...flags }, x: 778.2, z: -899.8 });
    expect(h.rec.runs.some((r) => r.source === 'prolog/b:daheim')).toBe(true); // „Feierabend“ + Marlene
    expect(h.slice.beat).toBe('p10'); // the dusk lasts at least 9 s
    step({ ...inv(), flags: { ...flags }, x: 778.2, z: -899.8 }, 20);
    expect(h.slice.beat).toBe('p11');
    step({}, 20);
    expect(h.slice.chapter).toBe('prolog'); // the night lasts a little
    h.engine.onEvent('hub:use', { item: 'bed' });
    step({}, 60);
    expect(h.slice.chapter).toBe('k1');
    expect(h.slice.completed).toContain('prolog');
  });

  it('prologue pacing (playtest round 10): the file before the radio, Geisterblick after the wall, Marlene halfway, home by the map', () => {
    const pro = files.find((f) => f.story.chapter === 'prolog')!.story;
    const b = (id: string) => pro.beats.find((x) => x.id === id)!;
    // p7: the clue is granted before Marlene's radio lines (the tracker never points at the portable clue's station)
    const p7 = b('p7').enter!;
    const grant = p7.findIndex((a) => a.do === 'grant' && a.clue === 'clue.p.punktwolke');
    const radio = p7.findIndex((a) => a.do === 'say' && a.line === 'marlene.p.punkte');
    expect(grant).toBeGreaterThanOrEqual(0);
    expect(grant).toBeLessThan(radio);
    expect(p7.findIndex((a) => a.do === 'objective')).toBeLessThan(grant);
    // p3: F is taught once the wall's Nebelling is gone (not during that fight), and stays in the objective
    const p3 = b('p3');
    expect(p3.enter!.some((a) => a.do === 'say' && a.line === 'marlene.p.flug')).toBe(false);
    const flug = p3.on!.find((r) => r.id === 'flug')!;
    expect(JSON.stringify(flug.when)).toContain('"objective":"nebel"');
    expect(flug.do.some((a) => a.do === 'say' && a.line === 'marlene.p.flug')).toBe(true);
    expect(flug.do.some((a) => a.do === 'objective' && /F: /.test(a.text ?? ''))).toBe(true);
    // halfway up the Waldweg: a line, no fight (the prologue's XP budget is untouched)
    const half = p3.on!.find((r) => r.id === 'halbweg')!;
    expect(half.do.map((a) => a.do)).toEqual(['say']);
    // p10: the objective offers the map at once
    expect(b('p10').enter!.some((a) => a.do === 'objective' && /M – Karte/.test(a.text ?? '') && a.delay === undefined)).toBe(true);
  });

  it('opens chapter 1 at the Karlsbergquelle at dawn: touch, summer 1789, the walk up, the court', () => {
    let slice: StorySlice = createStorySlice();
    const runs: { source: string; resume: boolean; actions: Action[] }[] = [];
    const host: StoryHost = {
      run: (actions, o) => runs.push({ source: o.source, resume: o.resume, actions: actions.filter((a) => !o.resume || runsOnResume(a)) }),
      chapterEntered: () => {},
      beatEntered: () => {},
      chapterCompleted: () => {},
    };
    const engine = new StoryEngine(
      files.map((f) => f.story),
      () => slice,
      host,
    );
    const step = (e: Partial<StoryEnv>, n = 1) => {
      for (let i = 0; i < n; i++) engine.tick(0.5, env(e));
    };
    const all = () => runs.flatMap((r) => r.actions);
    const SPRING = { x: 1059.3, z: -833.1 };
    const k1 = files.find((f) => f.story.chapter === 'k1')!.story;
    // the chapter checkpoint is the spring (chapterEntered teleports there from the station bed)
    expect(k1.checkpoint).toEqual({ x: 1059.3, z: -833.1, yaw: 50, era: 'today' });
    expect(k1.beats.slice(0, 3).map((b) => b.id)).toEqual(['k1_0', 'k1_0b', 'k1_1']);
    engine.goto('k1');
    expect(slice.beat).toBe('k1_0');
    // dawn, no Q anywhere, the spring calls (guide motes + the E prompt)
    const k0 = all();
    expect(k0).toContainEqual({ do: 'look', time: 'dawn' });
    expect(k0).toContainEqual({ do: 'anchor', to: null });
    expect(k0.some((a) => a.do === 'anchor' && a.to !== null)).toBe(false);
    expect(k0.some((a) => a.do === 'flag' && a.set['quelle.call'] === true && a.set['quelle.guide'] === true)).toBe(true);
    expect(k0.some((a) => a.do === 'objective' && a.text === 'An der Quelle: E – das Wasser berühren' && a.x === SPRING.x && a.z === SPRING.z)).toBe(true);
    const says = k0.filter((a): a is Extract<Action, { do: 'say' }> => a.do === 'say').map((a) => a.id);
    expect(says).toEqual(['marlene.k1.morgen.quelle', 'laub.k1.morgen.quelle']);
    // Q at the Ehrenhof does not count: only the touch
    step({ era: '1789', x: 1222, z: -1119 }, 4);
    expect(slice.beat).toBe('k1_0');
    runs.length = 0;
    engine.onEvent('quelle:touch', { era: 'today' });
    step({ ...SPRING });
    expect(slice.beat).toBe('k1_0b');
    // the exit shifts to 1789 through the spring, the dawn ends, the prelude pauses the lantern
    const exit = all();
    expect(exit).toContainEqual({ do: 'shift', to: '1789', reason: 'quelle' });
    expect(exit).toContainEqual({ do: 'look', time: 'day' });
    expect(exit.some((a) => a.do === 'flag' && a.set['k1.vorspiel'] === true && a.set['quelle.call'] === null)).toBe(true);
    step({ era: '1789', ...SPRING, flags: { 'k1.vorspiel': true } }, 6);
    expect(slice.beat).toBe('k1_0b');
    // back to today on the walk: Q at the spring takes you back, never the Ehrenhof
    runs.length = 0;
    step({ era: 'today', x: 1150, z: -1000, flags: { 'k1.vorspiel': true } });
    expect(all()).toContainEqual({ do: 'anchor', to: '1789', x: 1061, z: -834.5, r: 10 });
    expect(all().some((a) => a.do === 'anchor' && a.to !== null && a.x === 1222)).toBe(false);
    step({ era: '1789', x: 1150, z: -1000, flags: { 'k1.vorspiel': true } }, 4);
    expect(slice.beat).toBe('k1_0b');
    runs.length = 0;
    step({ era: '1789', x: 1195, z: -1116, flags: { 'k1.vorspiel': true } }); // at the gate of the court
    expect(slice.beat).toBe('k1_1');
    // k1_1: admitted to the court, the prelude ends (the lantern's reaction rises again)
    expect(all().some((a) => a.do === 'flag' && a.set['k1.vorspiel'] === null && a.set['court.admitted'] === true)).toBe(true);
    // the anchor rule: not admitted → the spring; admitted → the Ehrenhof
    runs.length = 0;
    step({ era: 'today', x: 1195, z: -1116 });
    expect(all()).toContainEqual({ do: 'anchor', to: '1789', x: 1061, z: -834.5, r: 10 });
    step({ era: '1789', x: 1195, z: -1116 });
    runs.length = 0;
    step({ era: 'today', x: 1195, z: -1116, flags: { 'court.admitted': true } });
    expect(all()).toContainEqual({ do: 'anchor', to: '1789', x: 1222, z: -1119, r: 16 });
    expect(all().some((a) => a.do === 'anchor' && a.x === 1061)).toBe(false);
    // caught in the prelude: you wake at the spring
    const k0b = k1.beats.find((b) => b.id === 'k1_0b')!;
    expect(k0b.wake).toEqual({ x: 1059.3, z: -833.1, yaw: 50, era: 'today', text: 'Du kommst an der Quelle zu dir, im Heute. Nichts ist verloren.' });
    // the chapter's oil and return-tip reactions wait for the end of the prelude
    for (const id of ['oel-a', 'oel-b', 'lauf-zurueck']) expect(JSON.stringify(k1.on!.find((r) => r.id === id)!.when)).toContain('"not":{"flag":"k1.vorspiel"}');
    // every Ehrenhof anchor in k1 waits for court.admitted
    for (const b of k1.beats)
      for (const r of b.on ?? [])
        if (r.do.some((a) => a.do === 'anchor' && a.x === 1222)) expect(JSON.stringify(r.when), `${b.id} ${r.id}`).toContain('"flag":"court.admitted"');
  });

  it('a chapter-1 save from before the spring opening resumes at the spring (old Ehrenhof anchor cleared)', () => {
    // an old save: k1_0 running at the station, the old morning lines said, the Ehrenhof anchor in the flags
    let slice: StorySlice = { ...createStorySlice(), active: true, chapter: 'k1', beat: 'k1_0', said: ['marlene.k1.morgen', 'laub.k1.morgen'] };
    const runs: { resume: boolean; actions: Action[] }[] = [];
    const host: StoryHost = {
      run: (actions, o) => runs.push({ resume: o.resume, actions: actions.filter((a) => !o.resume || runsOnResume(a)) }),
      chapterEntered: () => {},
      beatEntered: () => {},
      chapterCompleted: () => {},
    };
    const engine = new StoryEngine(
      files.map((f) => f.story),
      () => slice,
      host,
    );
    slice = JSON.parse(JSON.stringify(slice)) as StorySlice;
    engine.resume(true);
    expect(slice.beat).toBe('k1_0');
    const acts = runs.flatMap((r) => r.actions);
    // chapterEntered(resume) does not teleport: the beat's own teleport does (onResume)
    expect(acts).toContainEqual({ do: 'teleport', x: 1059.3, z: -833.1, yaw: 50, onResume: true });
    // the old anchor (shift.* flags) goes, the spring's flags come, the objective points at it
    expect(acts).toContainEqual({ do: 'anchor', to: null });
    expect(acts.indexOf(acts.find((a) => a.do === 'anchor')!)).toBeLessThan(acts.findIndex((a) => a.do === 'teleport'));
    expect(acts.some((a) => a.do === 'anchor' && a.to !== null)).toBe(false);
    expect(acts.some((a) => a.do === 'flag' && a.set['quelle.call'] === true)).toBe(true);
    expect(acts).toContainEqual({ do: 'look', time: 'dawn' });
    expect(acts.some((a) => a.do === 'objective' && a.x === 1059.3 && a.z === -833.1)).toBe(true);
    // the old completion (era 1789 by Q at the Ehrenhof) no longer ends the morning
    for (let i = 0; i < 4; i++) engine.tick(0.5, env({ era: '1789', x: 1222, z: -1119 }));
    expect(slice.beat).toBe('k1_0');
    engine.onEvent('quelle:touch', { era: 'today' });
    engine.tick(0.5, env({ x: 1059.3, z: -833.1 }));
    expect(slice.beat).toBe('k1_0b');
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

  it('epilogue (story fallback): deeds tell the sentence, "offen" otherwise', () => {
    const { files } = loadStoryFiles(ROOT);
    const data = files.find((f) => f.story.epilogue)!.story.epilogue!;
    const e = composeEpilogue(data, 'museum', {
      chronik: {},
      flags: { 'quest.q.k1.hundenamen': 'done', 'quest.q.p.meiler': 'failed', 'flag.k3_objekt': 'uhr', 'flag.k2_tor': 'dunkel' },
    });
    expect(e.variants.hof).toBe('deed:0');
    expect(e.variants.vermessung).toBe('offen');
    expect(e.variants.flucht).toBe('deed:1');
    expect(e.variants['meute-namen']).toBe('deed:0');
    expect(e.lines.join(' ')).toMatch(/Diane, Sultan/);
    expect(e.lines.join(' ')).toMatch(/Hundemarken/);
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
