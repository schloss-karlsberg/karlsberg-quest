/**
 * Check the guided tour's handover and Continue from the supported surveyor release slots.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryStorage, SaveManager, SAVE_KEY } from '../src/core/save';
import { createInitialState, deserializeState, GameStateStore } from '../src/core/state';
import type { QuestFile, QuestState } from '../src/rpg/types';
import { questsInPlay } from '../src/systems/quests/data';
import { createQuestSlice, QuestBook } from '../src/systems/quests/logic';
import { createProgressionSlice } from '../src/systems/progression/logic';
import { levelForXp } from '../src/rpg/stats';
import { createStorySlice, StoryEngine, runsOnResume } from '../src/systems/story/engine';
import { storiesInPlay } from '../src/systems/story/stories';
import { loadStoryFiles } from '../src/systems/story/validate-cli';
import type { StoryFile } from '../src/systems/story/types';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const json = <T>(p: string) => JSON.parse(readFileSync(`${ROOT}${p}`, 'utf8')) as T;
const story = (name: string) => json<StoryFile>(`content/story/${name}.story.json`);

describe('the tour hands over into chapter 1', () => {
  it('grants the handover items, survey skills and level 3 XP', () => {
    const tour = story('00-tour');
    const actions = tour.beats.flatMap((beat) => [
      ...(beat.enter ?? []), ...(beat.on ?? []).flatMap((reaction) => reaction.do), ...(beat.exit ?? []),
    ]);
    const items = actions.flatMap((a) => a.do === 'item' ? [[a.item, a.count ?? 1]] : a.do === 'give' && a.item ? [[a.item, 1]] : []);
    const skills = actions.flatMap((a) => a.do === 'skill' ? [[a.id, a.tier]] : []);
    const xp = actions.reduce((total, a) => total + (a.do === 'xp' ? a.amount : 0), 0);
    expect(Object.fromEntries(items)).toEqual({
      'item.bussole': 1, 'item.stab.esche': 1, 'item.p.seite': 1, 'item.balsam': 4, 'item.lampenoel': 1,
    });
    expect(Object.fromEntries(skills)).toEqual({ relief: 3, kartograf: 1 });
    expect(xp).toBe(549);
    expect(levelForXp(xp)).toBe(3);
    expect(actions).toContainEqual({ do: 'unlock', chapter: 'k1' });

    const tourFlags = Object.assign({}, ...[...actions, ...(tour.leave ?? [])].flatMap((a) => a.do === 'flag' ? [a.set] : []));
    expect(tourFlags).toMatchObject({ 'story.compass': true, 'story.laub': true });
    for (const id of ['laub.silent', 'combat.disabled', 'barks.quiet', 'quelle.guide', 'quelle.call', 'map.compare', 'tour.slice']) {
      expect(tourFlags[id] ?? null, id).toBeNull();
    }
  });

  it('leads into chapter 1 at the Quelle in the present', () => {
    expect(story('00-tour').next).toBe('k1');
    expect(story('01-kapitel-1').checkpoint).toMatchObject({ x: 1059.3, z: -833.1, yaw: 50, era: 'today' });
  });

  it.each(['t12', 't13', 't17', 't18'])('continues a tour slot at %s with the correct staff ownership', (beat) => {
    const state = createInitialState();
    state.systems.story = { ...createStorySlice(), active: true, chapter: 'tour', beat };
    state.systems.progression = createProgressionSlice();
    const saved = deserializeState(JSON.stringify(state));
    expect(saved.systems.story!.beat).toBe(beat);
    expect(saved.systems.progression!.inventory['item.stab.esche']).toBe(beat === 't12' ? undefined : 1);
    expect(saved.systems.progression!.equipped.weapon).toBe(beat === 't12' ? null : 'item.stab.esche');
    expect(saved.systems.progression!.xp).toBe(0);
    expect(deserializeState(JSON.stringify(saved))).toEqual(saved);
  });
});

describe('retired prologue saves', () => {
  it.each(['v0.6.0', 'v0.7.0', 'v0.8.0'])('continues and re-saves the unmodified %s auto slot', (tag) => {
    const bytes = readFileSync(new URL(`./fixtures/saves/${tag}.json`, import.meta.url), 'utf8');
    const original = JSON.parse(bytes) as ReturnType<typeof createInitialState>;
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY('auto'), bytes);
    const store = new GameStateStore(createInitialState());
    const saves = new SaveManager(store, storage, undefined, () => Date.parse(original.meta.savedAt!));

    const preview = saves.peek()!;
    expect(storage.getItem(SAVE_KEY('auto'))).toBe(bytes);
    expect(saves.load()).toBe(true);
    expect(store.state).toEqual(preview);
    expect(preview.era).toBe('today');
    expect(preview.player).toMatchObject({ x: 1059.3, z: -833.1, yaw: -50 * Math.PI / 180, stance: 'stand', flying: false });
    expect(preview.systems.story).toMatchObject({
      active: true, chapter: 'k1', beat: 'k1_0', name: 'Mara', completed: ['tour'], unlocked: ['prolog', 'k1'],
      doneBeats: original.systems.story!.doneBeats, said: original.systems.story!.said, objective: null,
    });
    expect(preview.meta).toEqual(original.meta);
    expect(preview.codex).toEqual(original.codex);
    expect(preview.systems.quests?.quests).toEqual(original.systems.quests?.quests);
    expect(preview.systems.quests?.tracked).toEqual([]);
    expect(preview.systems.photo).toEqual(original.systems.photo);
    if (tag === 'v0.8.0') {
      expect(preview.systems.combat).toMatchObject({ hp: 61, deaths: 1, groups: {} });
      expect(preview.systems.progression?.placed).toEqual(original.systems.progression?.placed);
    }
    expect(preview.skills).toMatchObject({ relief: 3, kartograf: 1 });
    expect(preview.flags).toMatchObject({ 'story.compass': true, 'story.laub': true, 'rpg.level': 3 });
    expect(preview.inventory.items).toEqual(['item.bussole']);
    expect(preview.systems.progression).toMatchObject({
      xp: 549, level: 3, points: tag === 'v0.6.0' ? 2 : 1, talents: original.systems.progression!.talents,
      equipped: { weapon: 'item.stab.esche', charms: [] },
      inventory: { 'item.stab.esche': 1, 'item.p.seite': 1, 'item.balsam': 4, 'item.lampenoel': 1 },
    });
    const current = store.mutable;
    const defs = questsInPlay([{ data: json<QuestFile>('content/quests/01-kapitel-1.quests.json') }], false);
    const book = new QuestBook(defs.quests, current.systems.quests!, {
      flags: current.flags, codex: current.codex.facts, emit: () => {}, now: () => current.meta.playSeconds, rng: () => 0,
    });
    const engine = new StoryEngine(storiesInPlay(loadStoryFiles(ROOT).files, new URLSearchParams()), () => current.systems.story!, {
      run: (actions, { resume }) => {
        for (const action of actions) {
          if (resume && !runsOnResume(action)) continue;
          if (action.do === 'quest' && action.op === 'offer') book.offer(action.id);
          if (action.do === 'shift') current.era = action.to;
        }
      },
      chapterEntered: () => {}, beatEntered: () => {}, chapterCompleted: () => {},
    });
    engine.resume();
    expect(engine.beat()?.id).toBe('k1_0');
    expect(book.tracked()).toEqual(['q.k1.ankunft']);
    expect(book.state('q.k1.ankunft')).toBe('active');
    engine.onEvent('quelle:touch', { era: 'today' });
    engine.tick(0.1, {
      era: current.era, x: current.player.x, z: current.player.z, flags: current.flags, inventory: current.inventory,
      chronik: current.chronik, scan: 0, map: false, stance: 'stand', lantern: false, caseFacts: () => null,
    });
    expect(engine.beat()?.id).toBe('k1_0b');
    expect(current.era).toBe('1789');

    expect(saves.save()).toBe(true);
    expect(saves.load()).toBe(true);
    expect(store.state).toEqual(current);
  });

  const beats = ['p1', 'p2', 'p3', 'p3q', 'p3r', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p9b', 'p10', 'p11'];
  const questStates = [undefined, 'hidden', 'offered', 'active', 'ready', 'done', 'failed'] as const satisfies readonly (QuestState | undefined)[];
  it.each(beats)('moves %s regardless of quest status', (beat) => {
    for (const status of questStates) {
      const state = createInitialState();
      state.era = '1789';
      state.flags = { 'shift.allowed': true, 'shift.target': '1789', 'shift.x': 1, 'barks.quiet': true };
      state.systems.story = Object.assign(createStorySlice(), {
        active: true, chapter: 'prolog', beat, beatTime: 90, chapterTime: 400, latched: { 'c:touch': 1 }, fired: ['c:foo'],
        objective: { text: 'Alt' }, completed: ['test'], room: 'old-room',
        threats: { pack: { kind: 'pack', active: true } },
        meters: { oil: { id: 'oil', value: 0.5, seconds: 120, full: 'caught' } },
      });
      state.systems.hunt = { alert: 0.6, caught: 2, pack: { era: '1789', opts: {} } };
      const quests = state.systems.quests = createQuestSlice();
      if (status) {
        quests.quests['q.p.irrlichter'] = { state: status, counts: { lichter: status === 'ready' ? 3 : 1 }, t: 12 };
        quests.tracked.push('q.p.irrlichter');
      }
      const migrated = deserializeState(JSON.stringify(state));
      expect(migrated.systems.story).toMatchObject({
        chapter: 'k1', beat: 'k1_0', beatTime: 0, chapterTime: 0, latched: {}, fired: [], objective: null,
        completed: ['test', 'tour'], room: null, threats: {}, meters: {},
      });
      expect(migrated.systems.hunt).toEqual({ alert: 0, caught: 2, pack: null });
      for (const key of Object.keys(state.flags)) expect(migrated.flags[key]).toBeUndefined();
      expect(migrated.systems.quests?.tracked).toEqual([]);
      expect(migrated.systems.quests?.quests['q.p.irrlichter']?.state).toBe(status === 'ready' ? 'done' : status);
      expect(migrated.systems.quests?.quests['q.p.irrlichter']?.counts).toEqual(quests.quests['q.p.irrlichter']?.counts);
    }
  });

  it('pays earned quest rewards once and retains gear, skills and progression above the floor', () => {
    const state = createInitialState();
    state.systems.story = Object.assign(createStorySlice(), { active: true, chapter: 'prolog', beat: 'p9b' });
    state.skills = { relief: 4, kartograf: 2 };
    state.systems.progression = Object.assign(createProgressionSlice(), {
      xp: 1150, level: 4, points: 1, talents: { 'stab.wucht': 2 },
      inventory: { 'item.stab.esche': 1, 'item.balsam': 7, 'item.lampenoel': 2, 'item.stab.eiche': 1 },
      equipped: { weapon: 'item.stab.eiche', charms: ['charm.example'] },
      placed: {
        old: { id: 'old', x: 0, z: 0, era: 'today', item: 'item.balsam', quest: 'q.p.relief' },
        other: { id: 'other', x: 1, z: 1, era: 'today', item: 'item.balsam' },
      },
    });
    state.systems.quests = { ...createQuestSlice(), tracked: ['q.p.irrlichter', 'q.k1.kasuar'], quests: {
      'q.p.irrlichter': { state: 'active', counts: { lichter: 4 }, t: 12 },
      'q.p.trichter': { state: 'done', counts: { finden: 1, melden: 1 }, t: 8 },
    }};
    const migrated = deserializeState(JSON.stringify(state));
    expect(migrated.systems.progression).toMatchObject({
      xp: 1210, level: 5, points: 2, talents: { 'stab.wucht': 2 },
      inventory: { 'item.balsam': 7, 'item.lampenoel': 4, 'item.p.seite': 1 },
      equipped: state.systems.progression.equipped,
    });
    expect(migrated.systems.progression?.placed).toEqual({ other: state.systems.progression.placed!.other });
    expect(migrated.skills).toEqual(state.skills);
    expect(migrated.systems.quests?.tracked).toEqual(['q.k1.kasuar']);
    expect(migrated.codex.facts).toEqual(['rm.08']);
    expect(migrated.flags).toMatchObject({ 'quest.q.p.irrlichter': 'done', 'quest.q.p.trichter': 'done' });
    expect(deserializeState(JSON.stringify(migrated))).toEqual(migrated);
  });

  it.each([['tour', 't12'], ['k1', 'k1_3'], ['k3', 'k3_5']])('preserves a save in %s', (chapter, beat) => {
    const state = createInitialState();
    state.systems.story = Object.assign(createStorySlice(), { active: true, chapter, beat });
    state.systems.progression = Object.assign(createProgressionSlice(), { xp: 123, inventory: { 'item.balsam': 1 } });
    state.skills.relief = 1;
    if (chapter === 'k3') {
      state.systems.story.completed = ['prolog', 'k1', 'k2'];
      state.systems.quests = { ...createQuestSlice(), quests: { 'q.p.trichter': { state: 'done', counts: { finden: 1, melden: 1 }, t: 40 } } };
      state.flags['quest.q.p.trichter'] = 'done';
    }
    expect(deserializeState(JSON.stringify(state))).toEqual(state);
  });
});
