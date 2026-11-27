import { describe, expect, it } from 'vitest';
import chapter from '../content/story/04-kapitel-4.story.json';
import quests from '../content/quests/04-kapitel-4.quests.json';
import chapterPack from '../content/packs/kapitel-4.pack.json';
import endingsPack from '../content/packs/enden.pack.json';
import type { Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SaveManager } from '../src/core/save';
import { createInitialState, GameStateStore } from '../src/core/state';
import type { QuestFile } from '../src/rpg/types';
import { questsInPlay } from '../src/systems/quests/data';
import { createQuestSlice, QuestBook, seededRng } from '../src/systems/quests/logic';
import { holdSeconds } from '../src/systems/story/dialogue/presenter';
import { createStorySlice, runTeleport, runsOnResume, StoryEngine } from '../src/systems/story/engine';
import { HOME } from '../src/systems/story/hub/home';
import { keepsOnBeatExit, retireScheduled, takeDueActions, type Scheduled } from '../src/systems/story/schedule';
import type { Action, StoryFile } from '../src/systems/story/types';

const { quests: defs } = questsInPlay([{ data: quests as QuestFile }], false);
const lines = new Map([...chapterPack.dialogue, ...endingsPack.dialogue].map((line) => [line.id, line.text_de]));
const kennel = { x: 1216, z: -1571 };
const well = { x: 1386, z: -1477 };
const hall = { x: 1216, z: -1114 };
const note = 'clue.k4.marlene';
const echo = 'clue.k4.laub_1840';
const photo = 'clue.k4.foto';
const finalClue = 'clue.k4.nur_steine';
const zettel = 'q.k4.zettel';
const steinplatz = 'q.k4.steinplatz';
const standpunkt = 'q.k4.standpunkt';
const stellen = 'q.k4.stellen';
const pacht = 'q.k4.pacht';
const dawnArrival = 'k4.dawn.arrived';

function play(storage = new MemoryStorage(), story = chapter as StoryFile) {
  const store = new GameStateStore(createInitialState());
  const events = new EventBus();
  const savedReasons: string[] = [];
  events.on('save:written', ({ reason }) => savedReasons.push(reason));
  const save = new SaveManager(store, storage, events);
  const loaded = save.load();
  const state = store.mutable;
  const slice = store.slice('story', createStorySlice);
  const grants: string[] = [];
  const completions: { id: string; xp: number }[] = [];
  const failures: string[] = [];
  let settle = false;
  const book = new QuestBook(defs, store.slice('quests', createQuestSlice), {
    flags: state.flags, codex: state.codex.facts, now: () => 0, rng: seededRng(4),
    emit: (name, payload) => {
      if (name === 'quest:accepted' || name === 'quest:objective') settle = true;
      if (name === 'quest:completed') completions.push(payload as { id: string; xp: number });
      if (name === 'quest:failed') failures.push((payload as { id: string }).id);
      if (name === 'item:grant') grants.push((payload as { item: string }).item);
    },
  });
  book.mirror();
  const settleKnown = () => book.settleKnown((clue) => state.inventory.clues.includes(clue));
  if (loaded) settleKnown();
  book.onChange = (why) => {
    save.autosave(`quest-${why}`, why === 'accept' || why === 'complete' || why === 'fail');
  };

  const pending: Scheduled[] = [];
  let time = 0;
  let beatAutosave = false;
  const execute = (action: Action) => {
    switch (action.do) {
      case 'quest':
        if (action.op === 'start') book.accept(action.id);
        if (action.op === 'progress' && action.objective) book.progress(action.id, action.objective, action.n, true);
        if (action.op === 'fail') book.close(action.id);
        break;
      case 'flag':
        for (const [key, value] of Object.entries(action.set)) {
          if (value === null) delete state.flags[key];
          else state.flags[key] = value;
        }
        break;
      case 'say': {
        const id = action.id ?? action.line;
        if (id && !slice.said.includes(id)) slice.said.push(id);
        break;
      }
      case 'shift':
        state.era = action.to;
        break;
      case 'teleport':
        runTeleport(action, state.flags, (x, z, yaw) => {
          Object.assign(state.player, { x, z });
          if (yaw !== undefined) state.player.yaw = (-yaw * Math.PI) / 180;
        });
        break;
      case 'grant':
        if (!state.inventory.clues.includes(action.clue)) state.inventory.clues.push(action.clue);
        break;
    }
  };
  const engine = new StoryEngine([story], () => slice, {
    run: (actions, { resume, beat }) => {
      let at = time;
      for (const action of actions) {
        if (resume && !runsOnResume(action)) continue;
        at += action.delay ?? 0;
        const id = action.do === 'say' ? action.id ?? action.line : undefined;
        const text = action.do === 'say' && (!id || !slice.said.includes(id) || action.repeat)
          ? action.text ?? lines.get(id ?? '') : undefined;
        if (at === time) execute(action);
        else pending.push({ at, gen: 0, fn: () => execute(action), beat: beat ?? null, keep: keepsOnBeatExit(action) });
        if (text && action.do === 'say') at += text.length / 42 + holdSeconds(text, action.ms) + 0.4;
      }
    },
    chapterEntered: () => {},
    beatEntered: (_chapter, beat, { resume }) => {
      retireScheduled(pending, beat.id, 0);
      if (!resume) beatAutosave = true;
    },
    chapterCompleted: () => {},
  });
  if (loaded) engine.resume();
  const place = (era: Era, { x, z }: { x: number; z: number }, yaw = state.player.yaw) => {
    state.era = era;
    Object.assign(state.player, { x, z, yaw });
  };
  const tick = (dt = 1 / 60) => {
    time += dt;
    for (const action of takeDueActions(pending, time)) action.fn();
    const where = { era: state.era, x: state.player.x, z: state.player.z };
    engine.tick(dt, {
      ...where, flags: state.flags, inventory: state.inventory, chronik: state.chronik,
      scan: 0, map: false, stance: 'stand', lantern: false, caseFacts: () => null,
    });
    if (beatAutosave) {
      beatAutosave = false;
      save.autosave('beat', true);
    }
    if (settle) {
      settle = false;
      settleKnown();
    }
    book.tick(dt, where);
  };
  const continueGame = () => play(storage, story);
  const saveAndContinue = () => {
    expect(save.save()).toBe(true);
    return continueGame();
  };
  return { book, completions, continueGame, engine, failures, grants, place, save, saveAndContinue, savedReasons, slice, state, tick };
}

/** Set the persisted beat directly so its patched enter list cannot run before the save. */
function seedBeat(beat: string) {
  const game = play();
  Object.assign(game.slice, { chapter: 'k4', beat, active: true });
  return game;
}

describe('Chapter 4 progress across beat autosaves', () => {
  it.each([
    { from: 'k4_0', to: 'k4_1', quest: zettel, era: 'today', position: HOME.spawn, clue: note },
    { from: 'k4_5', to: 'k4_6', quest: steinplatz, era: '1796', position: hall },
    { from: 'k4_11', to: 'k4_12', quest: stellen, era: 'today', position: kennel },
  ] as const)('retires the delayed $quest start before the $to autosave', ({ from, to, quest, era, position, clue }) => {
    const story = structuredClone(chapter) as StoryFile;
    const receivingBeat = story.beats.find((beat) => beat.id === to)!;
    // The receiving beat's extra start would mask a failure to run the preceding beat's action.
    receivingBeat.enter = receivingBeat.enter!.filter((a) => !(a.do === 'quest' && a.op === 'start' && a.id === quest));
    const game = play(undefined, story);
    game.place(era, position);
    game.engine.goto('k4', from);
    expect(game.book.state(quest)).toBe('hidden');
    if (clue) game.state.inventory.clues.push(clue);
    game.tick();
    expect(game.slice.beat).toBe(to);
    expect(game.savedReasons.at(-1)).toBe('beat');
    expect(game.continueGame().book.state(quest)).toBe('active');
  });

  it('restores the missing note quest from a legacy valley save', () => {
    const game = seedBeat('k4_1');
    game.state.inventory.clues.push(note);
    expect(game.book.progressOf(zettel)).toBeUndefined();

    const resumed = game.saveAndContinue();
    expect(resumed.book.state(zettel)).toBe('active');
    resumed.place('1796', { x: 497, z: -900 });
    resumed.tick();
    resumed.tick();
    expect(resumed.book.state(zettel)).toBe('done');
    expect(resumed.slice.beat).toBe('k4_2');
  });

  it('restores the missing Steinplatz quest from a legacy boss save', () => {
    const game = seedBeat('k4_6');
    game.place('1796', hall);
    expect(game.book.progressOf(steinplatz)).toBeUndefined();

    const resumed = game.saveAndContinue();
    expect(resumed.book.state(steinplatz)).toBe('active');
    resumed.tick();
    expect(resumed.book.openObjectives(defs.get(steinplatz)!).map(({ id }) => id)).not.toContain('brecher');
    resumed.book.handle('clue:found', { id: 'clue.k4.anschlag' });
    expect(resumed.book.openObjectives(defs.get(steinplatz)!).map(({ id }) => id)).toContain('brecher');
  });

  it('restores the missing Standpunkt quest from a legacy well save', () => {
    const game = seedBeat('k4_8');
    game.book.complete(steinplatz, true);
    expect(game.book.progressOf(standpunkt)).toBeUndefined();

    const resumed = game.saveAndContinue();
    expect(resumed.book.state(standpunkt)).toBe('active');
    resumed.tick();
    expect(resumed.book.count(standpunkt, 'brunnen')).toBe(0);
    expect(resumed.slice.beat).toBe('k4_8');
    resumed.place('1796', well);
    resumed.tick();
    resumed.book.handle('echo:end', { id: echo });
    resumed.tick();
    expect(resumed.slice.beat).toBe('k4_9');
  });

  it('credits the well before shifting if its echo was heard before the trench quest ended', () => {
    const game = play();
    game.place('1796', hall);
    game.engine.goto('k4', 'k4_7');
    game.state.inventory.clues.push(echo);
    game.book.complete(steinplatz, true);
    game.tick();
    expect(game.slice.beat).toBe('k4_8');
    expect(game.book.count(standpunkt, 'brunnen')).toBe(0);

    const resumed = game.continueGame();
    resumed.tick();
    expect(resumed.book.count(standpunkt, 'brunnen')).toBe(1);
    expect(resumed.book.count(standpunkt, 'echo')).toBe(1);
    expect(resumed.slice.beat).toBe('k4_9');
    expect(resumed.state.era).toBe('1796');

    resumed.tick(30);
    expect(resumed.state.era).toBe('today');
    resumed.place('today', kennel);
    resumed.tick();
    expect(resumed.book.state(standpunkt)).toBe('done');
    resumed.tick();
    expect(resumed.slice.beat).toBe('k4_11');
  });

  it.each(['k4_9', 'k4_10'])('repairs missing well credit in a save already at %s', (beat) => {
    const game = seedBeat(beat);
    game.place('today', kennel);
    game.book.accept(standpunkt);
    game.book.progress(standpunkt, 'echo', 1, true);
    if (beat === 'k4_10') game.book.progress(standpunkt, 'treiben', 1, true);
    expect(game.book.count(standpunkt, 'brunnen')).toBe(0);
    expect(game.book.state(standpunkt)).toBe('active');

    const resumed = game.saveAndContinue();
    resumed.tick();
    expect(resumed.book.progressOf(standpunkt)?.counts).toMatchObject({ brunnen: 1, echo: 1, treiben: 1 });
    expect(resumed.book.state(standpunkt)).toBe('done');
    resumed.tick();
    expect(['k4_11', 'k4_12']).toContain(resumed.slice.beat);
    expect(resumed.completions.filter(({ id }) => id === standpunkt)).toEqual([expect.objectContaining({ id: standpunkt, xp: 350 })]);
  });

  it('finishes the shift into the present after saving on the drive beat', () => {
    const game = play();
    game.place('1796', well);
    game.engine.goto('k4', 'k4_8');
    game.book.accept(pacht);
    game.tick();
    game.book.handle('echo:end', { id: echo });
    game.tick();
    expect(game.slice.beat).toBe('k4_9');
    expect(game.state.era).toBe('1796');

    const resumed = game.continueGame();
    resumed.tick(20);
    expect(resumed.state.era).toBe('today');
    expect(resumed.book.state(pacht)).toBe('failed');
    expect(resumed.failures).toEqual([pacht]);
    expect(resumed.savedReasons).toContain('quest-fail');

    const continuedAgain = resumed.continueGame();
    continuedAgain.tick(20);
    expect(continuedAgain.book.state(pacht)).toBe('failed');
    expect(continuedAgain.failures).toEqual([]);
    expect(continuedAgain.savedReasons).not.toContain('quest-fail');
  });

  it('pays a ready Pacht quest at the drive cutoff exactly once', () => {
    const game = seedBeat('k4_9');
    game.place('1796', well);
    game.book.accept(pacht);
    game.book.progress(pacht, 'fresser', 3);
    game.book.progress(pacht, 'zettel', 3);
    expect(game.book.state(pacht)).toBe('ready');

    const resumed = game.saveAndContinue();
    resumed.tick(20);
    expect(resumed.book.state(pacht)).toBe('done');
    expect(resumed.completions).toEqual([expect.objectContaining({ id: pacht, xp: 250 })]);
    expect(resumed.failures).toEqual([]);
    const continuedAgain = resumed.continueGame();
    continuedAgain.tick(20);
    expect(continuedAgain.book.state(pacht)).toBe('done');
    expect(continuedAgain.completions).toEqual([]);
  });

  it('restores a missing kennel quest and pays the horn once from a legacy finale save', () => {
    const game = seedBeat('k4_12');
    game.place('today', kennel);
    expect(game.book.progressOf(stellen)).toBeUndefined();

    const resumed = game.saveAndContinue();
    expect(resumed.book.state(stellen)).toBe('active');
    expect(resumed.book.count(stellen, 'zwinger')).toBe(1);
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
    const game = seedBeat('k4_13');
    game.slice.doneBeats.push('k4/k4_11', 'k4/k4_12');
    game.book.accept(stellen);
    game.book.progress(stellen, 'zwinger');

    const resumed = game.saveAndContinue();
    expect(resumed.book.count(stellen, 'hinlegen')).toBe(1);
    expect(resumed.book.state(stellen)).toBe('active');
    resumed.book.handle('npc:talk', { npc: 'pikeur' });
    expect(resumed.book.state(stellen)).toBe('ready');
  });

  it('restores an interrupted spring arrival and both dawn clues before leaving Chapter 4', () => {
    const game = play();
    game.place('today', kennel);
    game.engine.goto('k4', 'k4_14');
    game.tick();
    expect(game.state.flags[dawnArrival]).toBe(false);
    expect(game.state.player).toMatchObject(kennel);

    const resumed = game.continueGame();
    resumed.tick(2);
    expect(resumed.state.flags[dawnArrival]).toBe(true);
    expect(resumed.state.player).toMatchObject({ x: HOME.spawn.x, z: HOME.spawn.z, yaw: (-HOME.spawn.yaw * Math.PI) / 180 });
    expect(resumed.slice.beat).toBe('k4_14');
    resumed.tick(60);
    expect(resumed.state.inventory.clues).toEqual(expect.arrayContaining([photo, finalClue]));
    expect(resumed.slice.beat).toBe('k4_15');
  });

  it('preserves the saved pose after the dawn teleport, before either clue is granted', () => {
    const game = play();
    game.place('today', kennel);
    game.engine.goto('k4', 'k4_14');
    game.tick(6.2);
    expect(game.state.flags[dawnArrival]).toBe(true);
    expect(game.state.inventory.clues).not.toContain(photo);
    const savedPose = { x: HOME.spawn.x + 5, z: HOME.spawn.z - 2, yaw: 1.4 };
    game.place('today', savedPose, savedPose.yaw);

    const resumed = game.saveAndContinue();
    resumed.tick(60);
    expect(resumed.state.player).toMatchObject(savedPose);
    expect(resumed.state.inventory.clues).toEqual(expect.arrayContaining([photo, finalClue]));
    expect(resumed.slice.beat).toBe('k4_15');
  });

  it.each(['dialogue', 'photo'])('preserves the saved pose when a legacy dawn save has %s after arrival', (evidence) => {
    const game = seedBeat('k4_14');
    const savedPose = { x: HOME.spawn.x + 5, z: HOME.spawn.z - 2, yaw: 1.4 };
    game.place('today', savedPose, savedPose.yaw);
    if (evidence === 'dialogue') game.slice.said.push('marlene.end.morgen');
    else game.state.inventory.clues.push(photo);
    expect(game.state.flags[dawnArrival]).toBeUndefined();

    const resumed = game.saveAndContinue();
    resumed.tick(60);
    expect(resumed.state.flags[dawnArrival]).toBe(true);
    expect(resumed.state.player).toMatchObject(savedPose);
    expect(resumed.state.inventory.clues).toEqual(expect.arrayContaining([photo, finalClue]));
    expect(resumed.slice.beat).toBe('k4_15');
  });
});
