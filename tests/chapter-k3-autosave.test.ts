import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SaveManager, SAVE_KEY } from '../src/core/save';
import { createInitialState, GameStateStore, type GameState } from '../src/core/state';
import type { QuestFile } from '../src/rpg/types';
import { questsInPlay } from '../src/systems/quests/data';
import { createQuestSlice, need, QuestBook } from '../src/systems/quests/logic';
import { createStorySlice, runsOnResume, StoryEngine } from '../src/systems/story/engine';
import { K3_REQUIRED_OBJECTIVES } from '../src/systems/story/migrate';
import type { StoryFile } from '../src/systems/story/types';

const readContent = <T>(path: string): T => JSON.parse(readFileSync(new URL(`../content/${path}`, import.meta.url), 'utf8'));
const chapter = readContent<StoryFile>('story/03-kapitel-3.story.json');
const { quests } = questsInPlay([{ data: readContent<QuestFile>('quests/03-kapitel-3.quests.json') }], false);
const festsaal = 'q.k3.festsaal';
const hunde = 'q.k3.hunde';

function checkpoint(beat: string): GameState {
  const state = createInitialState();
  state.era = '1793-07';
  state.systems.story = { ...createStorySlice(), chapter: 'k3', active: true, beat };
  return state;
}

function play(state: GameState, storage = new MemoryStorage()) {
  const store = new GameStateStore(state);
  const saves = new SaveManager(store, storage);
  const events = new EventBus();
  const spawnedGroups: string[] = [];
  events.on('enemy:spawn', ({ group }) => spawnedGroups.push(group));
  const xpGrants: number[] = [];
  events.on('xp:grant', ({ amount }) => xpGrants.push(amount));
  const book = new QuestBook(quests, store.slice('quests', createQuestSlice), {
    flags: state.flags,
    codex: state.codex.facts,
    emit: (name, payload) => events.emit(name, payload),
    now: () => state.meta.playSeconds,
    rng: () => 0.5,
  });
  const payouts: string[] = [];
  book.onPayout = ({ id }) => payouts.push(id);
  const dialogue: string[] = [];
  events.on('quest:accepted', ({ id }) => {
    const quest = book.def(id);
    if (quest && 'voice' in quest.giver) dialogue.push(...quest.offer.map((line) => line.text));
  });
  book.mirror();
  book.reassert();
  book.settleKnown((clue) => state.inventory.clues.includes(clue));
  let pendingAutosave = false;
  const engine = new StoryEngine([chapter], () => state.systems.story!, {
    run: (actions, { resume }) => {
      // Capture the first autosave, before any delayed actions or queued dialogue can run.
      for (const action of actions) {
        if (resume && !runsOnResume(action)) continue;
        if ((action.delay ?? 0) > 0) break;
        if (action.do === 'say') {
          dialogue.push(action.line ?? action.id ?? '');
          break;
        }
        if (action.do !== 'quest') continue;
        if (action.op === 'start') book.accept(action.id);
        if (action.op === 'progress' && action.objective) book.progress(action.id, action.objective, action.n, true);
      }
    },
    beatEntered: (_chapter, _beat, { resume }) => { pendingAutosave = !resume; },
    chapterEntered: () => {},
    chapterCompleted: () => {},
  });
  const tick = () => {
    engine.tick(1 / 60, {
      era: state.era,
      x: state.player.x,
      z: state.player.z,
      flags: state.flags,
      inventory: state.inventory,
      chronik: state.chronik,
      scan: 0,
      map: false,
      stance: 'stand',
      lantern: true,
      caseFacts: () => null,
    });
    if (pendingAutosave) {
      pendingAutosave = false;
      saves.autosave('beat', true);
    }
  };
  const reload = () => {
    expect(saves.load()).toBe(true);
    const resumed = play(store.mutable, storage);
    resumed.engine.resume();
    return resumed;
  };
  return { book, dialogue, engine, payouts, saves, spawnedGroups, storage, tick, reload, xpGrants };
}

describe('Chapter 3 quest autosaves', () => {
  it('keeps the save repair\'s required objectives in step with the quest content', () => {
    for (const [id, required] of Object.entries(K3_REQUIRED_OBJECTIVES)) {
      const objectives = quests.get(id)!.objectives.filter((o) => !o.optional);
      expect(Object.fromEntries(objectives.map((o) => [o.id, need(o)])), id).toEqual(required);
    }
  });

  it.each([
    ['k3_2', 'q.k3.strohmann', 'k3_3', festsaal, 'laub.k3.hinauf'],
    ['k3_6', festsaal, 'k3_7', hunde, 'laub.k3.pforte'],
  ])('saves the next quest and queues its introduction first when leaving %s after %s', (from, previous, next, quest, transition) => {
    const game = play(checkpoint(from));
    game.book.complete(previous, true);
    game.tick();

    const bytes = game.storage.getItem(SAVE_KEY('auto'))!;
    const saved = JSON.parse(bytes) as GameState;
    const loaded = game.reload();
    expect(loaded.engine.s.beat).toBe(next);
    expect(loaded.book.state(quest)).toBe('active');
    expect(saved.systems.quests?.quests[quest]?.state).toBe('active');
    expect(game.dialogue).toEqual([transition, ...quests.get(quest)!.offer.map((line) => line.text)]);
    expect(loaded.dialogue).toEqual([]);
  });

  it.each([
    ['k3_3', festsaal],
    ['k3_7', hunde],
  ])('resumes a legacy first autosave at %s with its quest active', (beat, quest) => {
    const game = play(checkpoint(beat));
    game.saves.autosave('beat', true);
    const loaded = game.reload();
    expect(loaded.engine.s.beat).toBe(beat);
    expect(loaded.book.state(quest)).toBe('active');
  });

  it('saves the room and choice objectives in the first Hinaus autosave', () => {
    const state = checkpoint('k3_4');
    const game = play(state);
    game.book.accept(festsaal);
    game.book.progress(festsaal, 'glut', 2);
    state.flags['festsaal.took'] = 'nichts';
    game.tick();

    const saved = JSON.parse(game.storage.getItem(SAVE_KEY('auto'))!) as GameState;
    expect(saved.systems.story?.beat).toBe('k3_5');
    expect(saved.systems.quests?.quests[festsaal]?.counts).toMatchObject({ glut: 2, saal: 1, wahl: 1 });
  });

  it('lets Hanne take a stranded garden quest and preserves its counts and payout across reloads', () => {
    const state = checkpoint('k3_6');
    state.systems.quests = createQuestSlice();
    state.systems.quests.quests[festsaal] = { state: 'hidden', t: 1, counts: {} };
    const game = play(state);
    game.saves.autosave('beat', true);

    const loaded = game.reload();
    expect(loaded.engine.s.beat).toBe('k3_6');
    expect(loaded.book.tracked()).toContain(festsaal);
    expect(loaded.book.progressOf(festsaal)?.counts).toEqual({ saal: 1, wahl: 1, hinaus: 1 });
    loaded.book.tick(1 / 60, { x: 1270, z: -1293, era: '1793-07' });
    expect(loaded.book.topicsFor('hanne')).toContainEqual(expect.objectContaining({ quest: festsaal, kind: 'turnin' }));
    loaded.saves.autosave('quest-progress', true);
    const ready = loaded.reload();
    expect(ready.book.progressOf(festsaal)).toMatchObject({ state: 'ready', counts: { saal: 1, wahl: 1, hinaus: 1, pforte: 1 } });
    expect(ready.book.complete(festsaal)).toMatchObject({ id: festsaal });
    expect(ready.payouts).toEqual([festsaal]);
    ready.saves.autosave('quest-complete', true);
    const done = ready.reload();
    expect(done.book.complete(festsaal)).toBeNull();
    expect(done.payouts).toEqual([]);
    done.tick();
    expect(done.engine.s.beat).toBe('k3_7');
  });

  it('repairs a garden save with an active quest and keeps earned bonus kills', () => {
    const game = play(checkpoint('k3_6'));
    game.book.accept(festsaal);
    game.book.progress(festsaal, 'glut', 3);
    game.saves.autosave('beat', true);

    expect(game.reload().book.progressOf(festsaal)).toMatchObject({
      state: 'active', counts: { glut: 3, saal: 1, wahl: 1, hinaus: 1 },
    });
  });

  it.each([4, 0])('restores Hanne’s turn-in when only the choice was lost and %i bonus kills were credited', (glut) => {
    const state = checkpoint('k3_6');
    state.systems.quests = createQuestSlice();
    state.systems.quests.quests[festsaal] = { state: 'active', t: 1, counts: { saal: 1, hinaus: 1, pforte: 1, glut } };
    const game = play(state);
    game.saves.autosave('beat', true);

    const loaded = game.reload();
    expect(loaded.book.progressOf(festsaal)).toMatchObject({
      state: 'ready', counts: { saal: 1, wahl: 1, hinaus: 1, pforte: 1, glut },
    });
    expect(loaded.book.topicsFor('hanne')).toContainEqual(expect.objectContaining({ quest: festsaal, kind: 'turnin' }));
    expect(loaded.payouts).toEqual([]);
    expect(loaded.xpGrants).toEqual([]);
    expect(loaded.book.complete(festsaal)).toMatchObject({ id: festsaal });
    expect(loaded.payouts).toEqual([festsaal]);
    expect(loaded.xpGrants).toEqual([500]);
    loaded.saves.autosave('quest-complete', true);

    const done = loaded.reload();
    expect(done.book.state(festsaal)).toBe('done');
    expect(done.book.complete(festsaal)).toBeNull();
    expect(done.payouts).toEqual([]);
    expect(done.xpGrants).toEqual([]);
    done.tick();
    expect(done.engine.s.beat).toBe('k3_7');
  });

  it('restores the road fight and an already found clue for a stranded kennel quest', () => {
    const state = checkpoint('k3_8');
    state.inventory.clues.push('clue.k3.jost');
    const game = play(state);
    game.saves.autosave('beat', true);

    const loaded = game.reload();
    expect(loaded.engine.s.beat).toBe('k3_8');
    expect(loaded.book.tracked()).toContain(hunde);
    expect(loaded.spawnedGroups).toContain(`${hunde}.streuner`);
    expect(loaded.book.progressOf(hunde)?.counts).toEqual({ zwinger: 1, tueren: 1 });
    loaded.book.progress(hunde, 'streuner', 2);
    loaded.saves.autosave('quest-progress', true);
    const partial = loaded.reload();
    expect(partial.book.progressOf(hunde)?.counts).toEqual({ zwinger: 1, tueren: 1, streuner: 2 });
    partial.book.progress(hunde, 'streuner');
    expect(partial.book.topicsFor('jost')).toContainEqual(expect.objectContaining({ quest: hunde, kind: 'turnin' }));
    expect(partial.book.complete(hunde)).toMatchObject({ id: hunde });
    expect(partial.payouts).toEqual([hunde]);
    partial.saves.autosave('quest-complete', true);
    const done = partial.reload();
    expect(done.book.complete(hunde)).toBeNull();
    expect(done.payouts).toEqual([]);
    done.tick();
    expect(done.engine.s.beat).toBe('k3_8b');
  });
});
