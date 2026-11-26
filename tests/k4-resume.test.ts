import { describe, expect, it } from 'vitest';
import chapter from '../content/story/04-kapitel-4.story.json';
import quests from '../content/quests/04-kapitel-4.quests.json';
import type { Era } from '../src/core/era';
import { MemoryStorage, SaveManager } from '../src/core/save';
import { createInitialState, GameStateStore } from '../src/core/state';
import type { QuestFile } from '../src/rpg/types';
import { questsInPlay } from '../src/systems/quests/data';
import { createQuestSlice, QuestBook, seededRng } from '../src/systems/quests/logic';
import { createStorySlice, runsOnResume, StoryEngine } from '../src/systems/story/engine';
import { HOME } from '../src/systems/story/hub/home';
import type { Action, StoryFile } from '../src/systems/story/types';

const { quests: defs } = questsInPlay([{ data: quests as QuestFile }], false);
const kennel = { x: 1216, z: -1571 };
const well = { x: 1386, z: -1477 };
const hall = { x: 1216, z: -1114 };
const standpunkt = 'q.k4.standpunkt';
const stellen = 'q.k4.stellen';

function play(storage = new MemoryStorage()) {
  const store = new GameStateStore(createInitialState());
  const save = new SaveManager(store, storage);
  const loaded = save.load();
  const state = store.mutable;
  const slice = store.slice('story', createStorySlice);
  const grants: string[] = [];
  const book = new QuestBook(defs, store.slice('quests', createQuestSlice), {
    flags: state.flags, codex: state.codex.facts, now: () => 0, rng: seededRng(4),
    emit: (name, payload) => {
      if (name === 'item:grant') grants.push((payload as { item: string }).item);
    },
  });
  book.mirror();
  const pending: { at: number; action: Action }[] = [];
  let time = 0;
  const execute = (action: Action) => {
    switch (action.do) {
      case 'quest':
        if (action.op === 'start') book.accept(action.id);
        if (action.op === 'progress' && action.objective) book.progress(action.id, action.objective, action.n, true);
        if (action.op === 'fail') book.fail(action.id);
        break;
      case 'shift': state.era = action.to; break;
      case 'teleport': Object.assign(state.player, { x: action.x, z: action.z }); break;
      case 'grant':
        if (!state.inventory.clues.includes(action.clue)) state.inventory.clues.push(action.clue);
        break;
    }
  };
  const engine = new StoryEngine([chapter as StoryFile], () => slice, {
    run: (actions, { resume }) => {
      let at = time;
      for (const action of actions) {
        if (resume && !runsOnResume(action)) continue;
        at += action.delay ?? 0;
        if (at === time) execute(action);
        else pending.push({ at, action });
      }
    },
    chapterEntered: () => {}, beatEntered: () => {}, chapterCompleted: () => {},
  });
  if (loaded) engine.resume();
  const place = (era: Era, { x, z }: { x: number; z: number }) => {
    state.era = era;
    Object.assign(state.player, { x, z });
  };
  const tick = (dt = 1 / 60) => {
    time += dt;
    pending.sort((left, right) => left.at - right.at);
    while (pending[0] && pending[0].at <= time) execute(pending.shift()!.action);
    const where = { era: state.era, x: state.player.x, z: state.player.z };
    engine.tick(dt, {
      ...where, flags: state.flags, inventory: state.inventory, chronik: state.chronik,
      scan: 0, map: false, stance: 'stand', lantern: false, caseFacts: () => null,
    });
    book.tick(dt, where);
    book.settleKnown((clue) => state.inventory.clues.includes(clue));
  };
  const reload = () => {
    expect(save.autosave('beat', true)).toBe(true);
    return play(storage);
  };
  return { book, engine, grants, place, reload, slice, state, tick };
}

describe('Chapter 4 progress across beat autosaves', () => {
  it('accepts the note quest when the note was read before its offer', () => {
    const game = play();
    game.engine.goto('k4');
    game.state.inventory.clues.push('clue.k4.marlene');
    game.tick();
    expect(game.slice.beat).toBe('k4_1');

    const resumed = game.reload();
    resumed.place('1796', { x: 497, z: -900 });
    resumed.tick();
    resumed.tick();
    expect(resumed.book.state('q.k4.zettel')).toBe('done');
    expect(resumed.slice.beat).toBe('k4_2');
  });

  it('starts the Steinplatz quest when arrival skips the approach delay', () => {
    const game = play();
    game.place('1796', hall);
    game.engine.goto('k4', 'k4_5');
    game.tick();
    expect(game.slice.beat).toBe('k4_6');

    const resumed = game.reload();
    resumed.tick();
    resumed.book.handle('clue:found', { id: 'clue.k4.anschlag' });
    expect(resumed.book.openObjectives(defs.get('q.k4.steinplatz')!).map(({ id }) => id)).toContain('brecher');
  });

  it('restores Standpunkt siebzehn after saving as the trench quest ends', () => {
    const game = play();
    game.engine.goto('k4', 'k4_7');
    game.book.complete('q.k4.steinplatz', true);
    game.tick();
    expect(game.slice.beat).toBe('k4_8');

    const resumed = game.reload();
    resumed.place('1796', well);
    resumed.tick();
    resumed.book.handle('echo:end', { id: 'clue.k4.laub_1840' });
    resumed.tick();
    expect(resumed.slice.beat).toBe('k4_9');
  });

  it('finishes the shift into the present after saving on the drive beat', () => {
    const game = play();
    game.place('1796', well);
    game.engine.goto('k4', 'k4_8');
    game.book.accept(standpunkt);
    game.book.accept('q.k4.pacht');
    game.tick();
    game.book.handle('echo:end', { id: 'clue.k4.laub_1840' });
    game.tick();
    expect(game.slice.beat).toBe('k4_9');
    expect(game.state.era).toBe('1796');

    const resumed = game.reload();
    resumed.tick(20);
    expect(resumed.state.era).toBe('today');
    expect(resumed.book.state('q.k4.pacht')).toBe('failed');
    resumed.place('today', kennel);
    resumed.tick();
    expect(resumed.book.state(standpunkt)).toBe('done');
  });

  it('keeps the kennel quest and pays the horn once after an immediate-arrival save', () => {
    const game = play();
    game.place('today', kennel);
    game.engine.goto('k4', 'k4_11');
    game.tick();
    expect(game.slice.beat).toBe('k4_12');

    const resumed = game.reload();
    resumed.tick();
    resumed.book.handle('hunt:finale', { outcome: 'calmed' });
    resumed.engine.onEvent('hunt:finale', { outcome: 'faded' });
    resumed.tick();
    expect(resumed.slice.beat).toBe('k4_13');
    resumed.book.handle('npc:talk', { npc: 'pikeur' });
    expect(resumed.book.state(stellen)).toBe('ready');
    expect(resumed.book.complete(stellen)).not.toBeNull();
    expect(resumed.book.complete(stellen)).toBeNull();
    expect(resumed.grants).toEqual(['item.horn']);
  });

  it('credits the finished finale in an older Jost save without bypassing the talk', () => {
    const game = play();
    game.engine.goto('k4');
    game.slice.beat = 'k4_13';
    game.slice.doneBeats.push('k4/k4_11', 'k4/k4_12');
    game.book.accept(stellen);
    game.book.progress(stellen, 'zwinger');

    const resumed = game.reload();
    expect(resumed.book.count(stellen, 'hinlegen')).toBe(1);
    expect(resumed.book.state(stellen)).toBe('active');
    resumed.book.handle('npc:talk', { npc: 'pikeur' });
    expect(resumed.book.state(stellen)).toBe('ready');
  });

  it('restores the spring arrival and both dawn clues before leaving Chapter 4', () => {
    const game = play();
    game.place('today', kennel);
    game.engine.goto('k4', 'k4_14');

    const resumed = game.reload();
    resumed.tick(60);
    expect(resumed.state.player).toMatchObject({ x: HOME.spawn.x, z: HOME.spawn.z });
    expect(resumed.state.inventory.clues).toEqual(expect.arrayContaining(['clue.k4.foto', 'clue.k4.nur_steine']));
    expect(resumed.slice.beat).toBe('k4_15');
  });
});
