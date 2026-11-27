import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DialogueLine } from '../src/content/types';
import { createInitialState, deserializeState, serializeState, type GameState } from '../src/core/state';
import type { QuestFile } from '../src/rpg/types';
import { holdSeconds, substituteName } from '../src/systems/story/dialogue/presenter';
import { speakerKey, speakerMeta } from '../src/systems/story/dialogue/speakers';
import { matchTrigger, pickLine } from '../src/systems/story/dialogue/triggers';
import { syllableStarts } from '../src/systems/story/dialogue/voice';
import { type StoryEnv, type StoryHost, StoryEngine, type StorySlice, createStorySlice, evaluate, runsOnResume } from '../src/systems/story/engine';
import { composeEpilogue, nounToVariant } from '../src/systems/story/endings/epilogue';
import { endingScenes, yearsSpelled } from '../src/systems/story/endings/scenes';
import { HOME, atHome, bringHome } from '../src/systems/story/hub/home';
import { REACH, canTouch, toLocal, toWorld, touchLocal } from '../src/systems/quelle/layout';
import { angleDiff, bearingDeg } from '../src/systems/story/objectives';
import { HORN_SIGNALS } from '../src/systems/story/sfx';
import { storiesInPlay } from '../src/systems/story/stories';
import type { Action, Beat, NpcAction, StoryFile } from '../src/systems/story/types';
import { validateStories } from '../src/systems/story/validate';
import { loadStoryFiles } from '../src/systems/story/validate-cli';
import { questsInPlay } from '../src/systems/quests/data';
import { createQuestSlice, QuestBook } from '../src/systems/quests/logic';

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
    beat('a1', { event: 'quest:completed', match: { id: 'q.test.note' } }, { checkpoint: 'a1' }),
    beat('a2', { all: [{ enter: { x: 100, z: 0, r: 10 } }, { scan: 2 }] }),
    beat('a3', { timer: 5 }, { checkpoint: 'a2', enter: [say('a3'), { do: 'objective', text: 'go' }, { do: 'teleport', x: 1, z: 2 }] }),
  ],
  on: [{ id: 'note', when: { flag: 'seen' }, do: [{ do: 'toast', text: 'seen' }] }],
};
const chapterB: StoryFile = { chapter: 'b', order: 1, title_de: 'B', start: 'b1', beats: [beat('b1', { manual: true })] };

describe('story engine', () => {
  it('advances an echo gate only after hearing the required memory', () => {
    const first = beat('a1', { event: 'echo:end', match: { id: 'clue.test.echo' } });
    const h = harness([{ ...chapterA, beats: [first, beat('a2', { manual: true })] }, chapterB]);
    h.engine.goto('a');
    h.engine.onEvent('echo:end', { id: 'clue.test.echo', aborted: true });
    h.engine.tick(1, env());
    expect(h.slice.beat).toBe('a1');
    h.engine.onEvent('echo:end', { id: 'clue.test.other' });
    h.engine.tick(1, env());
    expect(h.slice.beat).toBe('a1');
    h.engine.onEvent('echo:end', { id: 'clue.test.echo' });
    h.engine.tick(1, env());
    expect(h.slice.beat).toBe('a2');
    expect(h.slice.doneBeats).toEqual(['a/a1']);
  });

  it('runs beats in order: events, zones, timers, chapter completion and unlocks', () => {
    const h = harness([chapterB, chapterA]);
    expect(h.engine.first?.chapter).toBe('a');
    h.engine.goto('a');
    expect(h.slice.beat).toBe('a1');
    h.engine.tick(0.1, env());
    expect(h.slice.beat).toBe('a1');
    h.engine.onEvent('quest:completed', { id: 'q.test.other' });
    h.engine.tick(0.1, env());
    expect(h.slice.beat).toBe('a1');
    h.engine.onEvent('quest:completed', { id: 'q.test.note' });
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
      chronik: { 'case.example': { confirmed: ['entry.example.1', 'entry.example.2', 'entry.example.3'] }, other: { confirmed: ['entry.example.4'] } },
      caseFacts: (id) => (id === 'case.example' ? ['entry.example.1', 'entry.example.2', 'entry.example.3'] : null),
    });
    const ev = (c: Parameters<typeof evaluate>[0]) => evaluate(c, e, {}, 'k', 3);
    expect(ev({ flag: 'a' })).toBe(true);
    expect(ev({ flag: 'b' })).toBe(false);
    expect(ev({ flag: 's', eq: 'x' })).toBe(true);
    expect(ev({ have: { clue: 'c1', item: 'item.bussole' } })).toBe(true);
    expect(ev({ have: { noun: 'n' } })).toBe(false);
    expect(ev({ confirmed: { prefix: 'entry.example.', n: 4 } })).toBe(true);
    expect(ev({ confirmed: { case: 'case.example', n: 4 } })).toBe(false);
    expect(ev({ caseComplete: 'case.example' })).toBe(true);
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

  function chapterOne(state: GameState) {
    const data = JSON.parse(readFileSync(`${ROOT}content/quests/01-kapitel-1.quests.json`, 'utf8')) as QuestFile;
    const story = state.systems.story ??= createStorySlice();
    const book = new QuestBook(questsInPlay([{ data }], false).quests, state.systems.quests ??= createQuestSlice(), {
      flags: state.flags, codex: state.codex.facts, now: () => 0, rng: () => 0,
      emit: () => {},
    });
    book.mirror();
    const engine = new StoryEngine(files.map((file) => file.story), () => story, {
      chapterEntered: () => {}, beatEntered: () => {}, chapterCompleted: () => {},
      run(actions, options) {
        for (const action of actions) {
          if (options.resume && !runsOnResume(action)) continue;
          if (action.do === 'grant') state.inventory.clues.push(action.clue);
          if (action.do === 'flag') {
            for (const [key, value] of Object.entries(action.set)) {
              if (value === null) delete state.flags[key];
              else state.flags[key] = value;
            }
          }
          if (action.do === 'quest' && action.op === 'offer') book.offer(action.id);
          if (action.do === 'quest' && action.op === 'progress' && action.objective) book.progress(action.id, action.objective, action.n, true);
          if (action.do === 'enemy' && action.op === 'despawn' && action.group && state.systems.combat) delete state.systems.combat.groups[action.group];
        }
      },
    });
    return { engine, book, story, tick() {
      engine.tick(0.1, env({ era: state.era, flags: state.flags, inventory: state.inventory }));
      book.settleKnown((clue) => state.inventory.clues.includes(clue));
    } };
  }

  it('resumes a pre-Quelle arrival save without requiring a second spring touch', () => {
    const state = createInitialState();
    state.era = '1789';
    state.systems.story = { ...createStorySlice(), active: true, chapter: 'k1', beat: 'k1_1' };
    state.systems.quests = createQuestSlice();
    state.systems.quests.quests['q.k1.ankunft'] = { state: 'active', counts: { wechsel: 1, wache: 1 }, t: 0 };
    state.inventory.clues.push('clue.k1.wache');

    const { engine, book, story, tick } = chapterOne(deserializeState(serializeState(state)));
    engine.resume();
    tick();
    tick();
    expect(book.state('q.k1.ankunft')).toBe('done');
    expect(story.beat).toBe('k1_2');
    expect(book.state('q.k1.registratur')).toBe('offered');
  });

  it('clears both completed Die Enge packs on a chapter replay, not on resume', () => {
    const state = createInitialState();
    const groups = ['k1.enge', 'k1.enge.2', 'another.group'];
    state.systems.story = { ...createStorySlice(), active: true, chapter: 'k1', beat: 'k1_14b' };
    state.systems.combat = { hp: 100, stamina: 100, bann: 100, deaths: 0, groups: Object.fromEntries(groups.map((group) =>
      [group, { group, kind: 'streuner', era: '1789', x: 1811, z: 270, count: 3, killed: 3 }],
    )) };
    const loaded = deserializeState(serializeState(state));
    const { engine } = chapterOne(loaded);
    engine.resume();
    expect(Object.keys(loaded.systems.combat!.groups)).toEqual(groups);
    engine.goto('k2');
    engine.goto('k1');
    expect(Object.keys(loaded.systems.combat!.groups)).toEqual(['another.group']);

    state.systems.story.doneBeats.push('k1/k1_14b');
    const oldReplay = deserializeState(serializeState(state));
    expect(Object.keys(oldReplay.systems.combat!.groups)).toEqual(['another.group']);
    state.systems.story.fired.push('b:k1_14b.welle');
    const currentWave = deserializeState(serializeState(state));
    expect(Object.keys(currentWave.systems.combat!.groups)).toEqual(groups);
  });

  it.each(['k1_0', 'k1_13', 'k1_14'])('discards a lone stale Die Enge clear before the encounter at %s', (beat) => {
    const state = createInitialState();
    state.systems.story = { ...createStorySlice(), active: true, chapter: 'k1', beat };
    const first = { group: 'k1.enge', kind: 'streuner', era: '1789' as const, x: 1811, z: 270, count: 3, killed: 3 };
    state.systems.combat = { hp: 100, stamina: 100, bann: 100, deaths: 0, groups: { [first.group]: first } };

    const loaded = deserializeState(serializeState(state));
    expect(loaded.systems.combat!.groups).toEqual({});
  });

  it.each(['k1_14c', 'k1_15', 'k1_17'])('preserves both Die Enge clears after the encounter at %s', (beat) => {
    const state = createInitialState();
    state.systems.story = { ...createStorySlice(), active: true, chapter: 'k1', beat, doneBeats: ['k1/k1_14b'] };
    const first = { group: 'k1.enge', kind: 'streuner', era: '1789' as const, x: 1811, z: 270, count: 3, killed: 3 };
    const second = { ...first, group: 'k1.enge.2', x: 1803, z: 266, count: 4, killed: 4 };
    const groups = { [first.group]: first, [second.group]: second };
    state.systems.combat = { hp: 100, stamina: 100, bann: 100, deaths: 0, groups };

    const loaded = deserializeState(serializeState(state));
    expect(loaded.systems.combat!.groups).toEqual(groups);
  });

  it('parse and validate (prologue + four chapters + endings)', () => {
    expect(parseErrors).toEqual([]);
    // items declared by the quest files (content/quests/*.quests.json) are known to the story
    const questItems = new Set<string>();
    for (const f of readdirSync(`${ROOT}content/quests`).filter((n) => n.endsWith('.quests.json')))
      for (const it of (JSON.parse(readFileSync(`${ROOT}content/quests/${f}`, 'utf8')) as { items?: { id: string }[] }).items ?? []) questItems.add(it.id);
    const r = validateStories(files, { items: questItems });
    expect(r.errors.map((e) => `${e.file} ${e.id ?? ''}: ${e.message}`)).toEqual([]);
    // tour (the opening) + four chapters + endings
    // + the test chapter (99-test.story.json, "test": true; loaded only with ?storytest)
    expect(r.stats.chapters).toBe(7);
    expect(files.filter((f) => f.story.dev).map((f) => f.story.chapter)).toEqual([]);
    expect(files.filter((f) => f.story.test).map((f) => f.story.chapter)).toEqual(['test']);
    expect(r.stats.beats).toBeGreaterThan(35);
    // Playable chapters start with the tour and chain to the endings.
    const { engine, rec } = harness(storiesInPlay(files, new URLSearchParams('classic')));
    const order = engine.order;
    expect(() => engine.goto('prolog', 'p1')).toThrow("unknown chapter 'prolog'");
    engine.goto(engine.first!.chapter);
    expect(rec.beats).toEqual(['tour/t1']);
    expect(order[0]!.chapter).toBe('tour');
    for (let i = 0; i < order.length - 1; i++) expect(order[i]!.next).toBe(order[i + 1]!.chapter);
    expect(order.at(-1)!.epilogue).toBeTruthy();
  });

  it('includes test and dev chapters only with their switches', () => {
    const files = [...loadStoryFiles(ROOT).files, { story: { ...chapterA, dev: 'storydev' } }];
    const normal = storiesInPlay(files, new URLSearchParams());
    expect(normal.map((f) => f.chapter)).not.toContain('test');
    expect(normal).not.toContainEqual(expect.objectContaining({ dev: 'storydev' }));
    const enabled = storiesInPlay(files, new URLSearchParams('storytest&storydev&classic'));
    expect(enabled.map((f) => f.chapter)).toEqual(expect.arrayContaining(['test', 'a', 'tour']));
    expect(enabled.map((f) => f.chapter)).not.toContain('prolog');
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

  it('home is the Quelle in every chapter: checkpoints and wakes at HOME.spawn', () => {
    const at = (c: { x: number; z: number } | undefined) => !!c && Math.hypot(c.x - HOME.spawn.x, c.z - HOME.spawn.z) < 0.01;
    for (const { story } of files) {
      if (story.test) continue;
      if (story.chapter === 'tour') {
        // the tour slice starts at the car park and wakes at the Quelle
        expect(at(story.checkpoint)).toBe(false);
        expect(at(story.wake)).toBe(true);
        continue;
      }
      expect(at(story.checkpoint), story.chapter).toBe(true);
      // nothing in the story points at the old trailer any more (760/−915 r 15, spawn 760/−902)
      const old = JSON.stringify(story.beats).match(/"x":\s*76[02](\.\d)?,\s*"z":\s*-9(0[2-9]|1\d)/g) ?? [];
      expect(old, story.chapter).toEqual([]);
    }
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
    const k0bWake = { x: 1059.3, z: -833.1, yaw: 50, era: 'today', text: 'Du kommst an der Quelle zu dir, im Heute. Nichts ist verloren.' };
    const k1 = files.find((f) => f.story.chapter === 'k1')!.story;
    // the chapter checkpoint is the spring (chapterEntered teleports there from the station bed)
    expect(k1.checkpoint).toEqual({ x: 1059.3, z: -833.1, yaw: 50, era: 'today' });
    expect(k1.beats.slice(0, 4).map((b) => b.id)).toEqual(['k1_0', 'k1_0b', 'k1_0c', 'k1_1']);
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
    // k1_0b: the disguise (IDEAS-ROUND11 §2): the court's k1 watchers on, the coat quest offered, Liese
    // at her Bleiche, the Gardist at the gate inspects letters, the Hofgärtner watches the Orangerie
    const k0bEnter = k1.beats.find((b) => b.id === 'k1_0b')!.enter!;
    expect(k0bEnter).toContainEqual({ do: 'cue', id: 'court:on', data: { set: 'k1' } });
    expect(k0bEnter).toContainEqual({ do: 'quest', op: 'offer', id: 'q.k1.kleider', onResume: true });
    const spawns = k0bEnter.filter((a): a is NpcAction => a.do === 'npc' && 'npc' in a);
    expect(spawns.map((a) => a.npc).sort()).toEqual(['gardist', 'gardist-tor', 'hofgaertner', 'lakai', 'liese']);
    expect(spawns.find((a) => a.npc === 'liese')).toMatchObject({ x: 1004.85, z: -870.3, era: '1789' });
    expect(spawns.find((a) => a.npc === 'liese')!.watch).toBeUndefined();
    expect(spawns.find((a) => a.npc === 'gardist-tor')!.watch).toMatchObject({ inspector: true, set: 'k1' });
    expect(spawns.find((a) => a.npc === 'hofgaertner')!.watch).toMatchObject({ set: 'k1', zone: 'court.orangerie' });
    for (const a of spawns) if (a.watch) expect(a.watch.set).toBe('k1');
    // walking up to the gate in orange no longer lets you in: the Musterung does
    runs.length = 0;
    step({ era: '1789', x: 1195, z: -1116, flags: { 'k1.vorspiel': true } }, 4);
    expect(slice.beat).toBe('k1_0b');
    // the steal path: E behind line B → the coat flag, the coat off the line, the court's take tell
    step({ era: '1789', x: 1001.08, z: -880.9, flags: { 'k1.vorspiel': true }, inventory: { clues: ['clue.k1.rock'], nouns: [], items: [] } });
    expect(all().some((a) => a.do === 'flag' && a.set['disguise.coat'] === true && a.set['flag.k1_kleid'] === 'genommen')).toBe(true);
    expect(all()).toContainEqual({ do: 'cue', id: 'scenery:coat', data: { visible: false } });
    expect(all()).toContainEqual({ do: 'cue', id: 'court:take', data: { what: 'rock' } });
    expect(all()).toContainEqual({ do: 'quest', op: 'progress', id: 'q.k1.kleider', objective: 'rock', n: 1, onResume: true });
    expect(slice.beat).toBe('k1_0b');
    // the coat alone is not enough; the coat and the letter end the walk-in: k1_0c, the Musterung
    step({ era: '1789', x: 1190, z: -1113, flags: { 'k1.vorspiel': true, 'disguise.coat': true } }, 2);
    expect(slice.beat).toBe('k1_0b');
    step({ era: '1789', x: 1190, z: -1113, flags: { 'k1.vorspiel': true, 'disguise.coat': true, 'disguise.letter': true } }, 2);
    expect(slice.beat).toBe('k1_0c');
    // still the prelude: the lantern waits, being caught wakes you at the spring, Q anchors there
    expect(k1.beats.find((b) => b.id === 'k1_0c')!.wake).toEqual(k0bWake);
    runs.length = 0;
    step({ era: 'today', x: 1190, z: -1113, flags: { 'k1.vorspiel': true, 'disguise.coat': true, 'disguise.letter': true } });
    expect(all()).toContainEqual({ do: 'anchor', to: '1789', x: 1061, z: -834.5, r: 10 });
    step({ era: '1789', x: 1190, z: -1113, flags: { 'k1.vorspiel': true, 'disguise.coat': true, 'disguise.letter': true } }, 4);
    expect(slice.beat).toBe('k1_0c');
    // the court system sets court.admitted when the Musterung is passed → k1_1
    runs.length = 0;
    step({ era: '1789', x: 1195, z: -1116, flags: { 'k1.vorspiel': true, 'disguise.coat': true, 'disguise.letter': true, 'court.admitted': true } });
    expect(slice.beat).toBe('k1_1');
    // the Registratur ends the court section (k1_2 switches the k1 watchers off)
    expect(k1.beats.find((b) => b.id === 'k1_2')!.enter).toContainEqual({ do: 'cue', id: 'court:off', data: { set: 'k1' } });
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
  const ctx = { era: 'today', flags: { 'story.laub': true }, chapter: 'tour', beat: 't17' };

  it('matches triggers on event, era (payload.to), flags, chapter and payload keys', () => {
    expect(matchTrigger(line('a', { event: 'era:change', era: '1789' }), 'era:change', { from: 'today', to: '1789' }, ctx)).toBe(true);
    expect(matchTrigger(line('a', { event: 'era:change', era: '1789' }), 'era:change', { from: '1789', to: 'today' }, ctx)).toBe(false);
    expect(matchTrigger(line('a', { event: 'item:pickup', item: ['item.balsam', 'item.kastanie'] }), 'item:pickup', { item: 'item.kastanie' }, ctx)).toBe(true);
    expect(matchTrigger(line('a', { event: 'hub:enter', flag: 'story.laub', chapter: 'tour' }), 'hub:enter', {}, ctx)).toBe(true);
    expect(matchTrigger(line('a', { event: 'hub:enter', flag: 'nope' }), 'hub:enter', {}, ctx)).toBe(false);
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

describe('objectives, home, endings', () => {
  it('bearing: 0 = north (−z), 90 = east', () => {
    expect(bearingDeg(0, 0, 0, -10)).toBeCloseTo(0);
    expect(bearingDeg(0, 0, 10, 0)).toBeCloseTo(90);
    expect(bearingDeg(0, 0, 0, 10)).toBeCloseTo(180);
    expect(bearingDeg(0, 0, -10, 0)).toBeCloseTo(270);
    expect(angleDiff(10, 350)).toBeCloseTo(20);
    expect(angleDiff(350, 10)).toBeCloseTo(-20);
  });

  it('the wake spot is inside the home ring and within reach of the water', () => {
    const sp = HOME.spawn;
    expect(Math.hypot(sp.x - HOME.x, sp.z - HOME.z)).toBeLessThan(HOME.r);
    const [x, z] = toWorld(...touchLocal('today'));
    const d = Math.hypot(sp.x - x, sp.z - z);
    expect(d).toBeLessThan(REACH);
    expect(d).toBeGreaterThan(0.7); // in front of the log, not in the water
    // facing the water (story yaw degrees → three.js radians), in today and in 1789
    const yaw = (-sp.yaw * Math.PI) / 180;
    expect(canTouch(sp.x, sp.z, yaw, 'today')).toBe(true);
    expect(canTouch(sp.x, sp.z, yaw, '1789')).toBe(true);
  });

  it('counts a player on foot in the present-day spring ring as home', () => {
    expect(atHome(HOME.x + 5, HOME.z - 4, 'today', false)).toBe(true);
    expect(atHome(HOME.spawn.x, HOME.spawn.z, 'today', false)).toBe(true);
    expect(atHome(HOME.x + 5, HOME.z - 4, '1789', false)).toBe(false);
    expect(atHome(HOME.spawn.x, HOME.spawn.z, '1793-02', false)).toBe(false);
    expect(atHome(HOME.x + 13, HOME.z, 'today', false)).toBe(false);
    expect(atHome(HOME.x, HOME.z, 'today', true)).toBe(false);
    expect(atHome(760, -915, 'today', false)).toBe(false);
  });

  it('the notes at home sit at the Quelle, never in the trough E zone (moved from the field station)', () => {
    type PackClue = { id: string; where: { x: number; z: number; radius: number; era: string; anchor?: string } };
    const home: PackClue[] = [];
    for (const f of ['kapitel-2', 'kapitel-3', 'kapitel-4']) {
      const pack = JSON.parse(readFileSync(`${ROOT}content/packs/${f}.pack.json`, 'utf8')) as { clues: PackClue[] };
      for (const c of pack.clues) {
        expect(c.where.anchor, c.id).not.toBe('loc.p.station');
        if (c.where.anchor === 'loc.quelle') home.push(c);
      }
    }
    expect(home.map((c) => c.id)).toEqual(expect.arrayContaining(['clue.k2.marlene', 'clue.k3.marlene', 'clue.k4.marlene', 'clue.k4.foto']));
    const [waterX, waterZ] = toWorld(...touchLocal('today'));
    for (const c of home) {
      const { x, z, radius } = c.where;
      expect(Math.hypot(x - HOME.x, z - HOME.z), c.id).toBeLessThan(HOME.r + 1);
      // either inside the wall (unreachable, granted by the story) or clear of the trough's E zone
      // (the wall: local w 0.15 at its face, 0.55 thick, u ±2.7; the player keeps 0.6 m off it)
      const [u, w] = toLocal(x, z);
      const inWall = radius <= 0.5 && Math.abs(u) + radius < 2.7 && w + radius < 0.15 + 0.6 && w - radius > 0.15 - 0.55 - 0.6;
      if (!inWall) expect(Math.hypot(x - waterX, z - waterZ) - radius, c.id).toBeGreaterThan(REACH);
    }
  });

  it('holding Q brings you home (WP-04): return → HOME.spawn + home:arrived; caught and other shifts stay put', () => {
    const run = (e: { to: string; reason?: string }, caught = false) => {
      const log: string[] = [];
      const went = bringHome(e, { caught, teleport: (x, z, yaw) => log.push(`tp ${x}/${z}/${yaw}`), arrived: (r) => log.push(`home:arrived ${r}`) });
      return { went, log };
    };
    expect(run({ to: 'today', reason: 'return' })).toEqual({ went: true, log: [`tp ${HOME.spawn.x}/${HOME.spawn.z}/${HOME.spawn.yaw}`, 'home:arrived return'] });
    // being caught shifts to today with its own reason and wakes by itself: no second teleport
    expect(run({ to: 'today', reason: 'caught' }, true)).toEqual({ went: false, log: [] });
    expect(run({ to: 'today', reason: 'return' }, true)).toEqual({ went: false, log: [] });
    // content shifts without a reason, the spring, anchors, echoes, endings, the Steinfraß: stay put
    for (const reason of [undefined, 'quelle', 'anchor', 'echo', 'ending', 'oblivion', 'key']) expect(run({ to: 'today', reason }).went, String(reason)).toBe(false);
    // into the past never
    expect(run({ to: '1789', reason: 'return' }).went).toBe(false);
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

describe('chapter-three basket cue', () => {
  it('fires at four kills before pickup and stays silent after resuming a post-pickup save', () => {
    const { story } = loadStoryFiles(ROOT).files.find(f => f.story.chapter === 'k3')!;
    const flags = { 'quest.q.k3.nachmittag.schatten': 4, 'quest.q.k3.nachmittag.korb': 0 };
    const fired = 'k3/c:korb';
    const current = harness([story]);
    current.engine.goto('k3', 'k3_1');
    current.engine.tick(0.1, env({ flags: { ...flags, 'quest.q.k3.nachmittag.schatten': 3 }, era: '1793-07' }));
    expect(current.rec.runs.map(r => r.source)).not.toContain(fired);
    current.engine.tick(0.1, env({ flags, era: '1793-07' }));
    expect(current.rec.runs.map(r => r.source)).toContain(fired);

    const older = harness([story]);
    older.engine.goto('k3', 'k3_5');
    older.reload();
    older.engine.resume();
    older.engine.tick(0.1, env({ flags: { ...flags, 'quest.q.k3.nachmittag.korb': 1 }, era: '1793-07' }));
    expect(older.rec.runs.map(r => r.source)).not.toContain(fired);
  });
});
