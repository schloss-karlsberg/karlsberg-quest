/**
 * Check the guided tour's handover and Continue from the supported surveyor release slots.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryStorage, SaveManager, SAVE_KEY } from '../src/core/save';
import { createInitialState, deserializeState, GameStateStore, type GameState } from '../src/core/state';
import type { QuestFile, QuestState } from '../src/rpg/types';
import { questsInPlay } from '../src/systems/quests/data';
import { createQuestSlice, QuestBook } from '../src/systems/quests/logic';
import { createProgressionSlice } from '../src/systems/progression/logic';
import { levelForXp } from '../src/rpg/stats';
import { createStorySlice, StoryEngine, runsOnResume, staysAtHandover } from '../src/systems/story/engine';
import { HOME } from '../src/systems/story/hub/home';
import { storiesInPlay } from '../src/systems/story/stories';
import { loadStoryFiles } from '../src/systems/story/validate-cli';
import type { Action, StoryFile } from '../src/systems/story/types';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const json = <T>(p: string) => JSON.parse(readFileSync(`${ROOT}${p}`, 'utf8')) as T;
const story = (name: string) => json<StoryFile>(`content/story/${name}.story.json`);

describe('saves from before the spring became home', () => {
  it('continues and re-saves the legacy K3 Heimweg slot', () => {
    const bytes = readFileSync(new URL('./fixtures/saves/pre-quelle-k3.json', import.meta.url), 'utf8');
    const original = JSON.parse(bytes) as ReturnType<typeof createInitialState>;
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY('auto'), bytes);
    const store = new GameStateStore(createInitialState());
    const saves = new SaveManager(store, storage, undefined, () => Date.parse(original.meta.savedAt!));
    const preview = saves.peek();
    expect(storage.getItem(SAVE_KEY('auto'))).toBe(bytes);
    expect(saves.load()).toBe(true);
    expect(store.state).toEqual(preview);
    const returnGoal = story('03-kapitel-3').beats.find((beat) => beat.id === 'k3_9')
      ?.enter?.find((action) => action.do === 'objective');
    expect(returnGoal).toMatchObject({ id: 'k3.quelle', text: 'Zur Quelle', x: 1059.3, z: -833.1 });
    expect(store.state.systems.story).toMatchObject({
      name: 'Alex', active: true, chapter: 'k3', beat: 'k3_9', beatTime: 8, look: 'dusk',
      objective: { id: 'k3.quelle', text: 'Zur Quelle', x: 1059.3, z: -833.1 },
      unlocked: original.systems.story!.unlocked, completed: original.systems.story!.completed,
    });
    expect(store.state.systems.travel).toEqual({
      ...original.systems.travel, activated: ['ehrenhof'], announced: ['zwinger'],
    });
    expect(store.state.systems.quests).toEqual(original.systems.quests);
    expect(store.state.systems.progression).toEqual(original.systems.progression);
    expect(store.state.flags).toEqual(original.flags);
    expect(store.state.player).toEqual(original.player);
    expect(store.state.meta).toEqual(original.meta);
    expect(saves.save()).toBe(true);
    expect(saves.load()).toBe(true);
    expect(store.state).toEqual(preview);
  });

  it.each([
    ['k2.heim', 'Q halten: zurück in die Feldstation', 'Q halten: zurück zur Quelle'],
    ['k2.ende', 'Feldstation. Die Nacht ist vorbei.', 'An der Quelle. Die Nacht ist vorbei.'],
    ['k2.heim', 'Zurück in die Nacht: zum Ehrenhof (mit Geisterblick), dort Q', 'Zurück in die Nacht: zum Ehrenhof (mit Geisterblick), dort Q'],
  ])('restores the saved K2 objective %s and keeps the player name', (id, text, expected) => {
    const state = createInitialState();
    state.systems.story = { ...createStorySlice(), name: 'Mara', chapter: 'k2', objective: { id, text } };
    const saved = deserializeState(JSON.stringify(state));
    expect(saved.systems.story).toMatchObject({ name: 'Mara', objective: { id, text: expected } });
  });

  it.each([undefined, '', '  ', 'story.name.suggest'])('uses the visitor default when the saved name is %j', (name) => {
    const state = createInitialState();
    const saved = deserializeState(JSON.stringify({
      ...state, systems: { story: { ...createStorySlice(), name } },
    }));
    expect(createStorySlice().name).toBe('Alex');
    expect(saved.systems.story?.name).toBe('Alex');
  });
});

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

  it('leads into chapter 1 where the player stands in 1789; a replay starts at the Quelle in the present', () => {
    expect(story('00-tour').next).toBe('k1');
    expect(story('01-kapitel-1').continues).toBe(true);
    expect(story('01-kapitel-1').checkpoint).toEqual({ ...HOME.spawn, era: 'today' });
  });

  it('travels once: the touch shifts, the look at 1789 does not fade or return, chapter 1 asks for no touch', () => {
    const tour = story('00-tour');
    const t17 = tour.beats.find((b) => b.id === 't17')!;
    const t18 = tour.beats.find((b) => b.id === 't18')!;
    expect(tour.beats.at(-1)).toBe(t18);
    expect(t17.complete).toEqual({ event: 'quelle:touch' });
    // the shift belongs to the arrival beat, so a Continue from its autosave (era still today) finishes it
    expect(t17.exit!.some((a) => a.do === 'shift')).toBe(false);
    expect(t18.enter![0]).toEqual({ do: 'shift', to: '1789', reason: 'quelle', onResume: true });
    expect(t18.enter!.some((a) => a.do === 'fade')).toBe(false);
    expect(t18.complete).toEqual({ all: [{ flag: 'tour.ende' }, { era: '1789' }] });
    const says = t18.enter!.filter((a) => a.do === 'say');
    expect(says.map((a) => a.id)).toEqual(['player.q.wo', 'laub.t.1789', 'laub.t.seite']);
    expect(says.every((a) => a.onResume === true)).toBe(true);
    expect(JSON.stringify(t18)).not.toContain('genügt ein Blick');
    // nothing after the tour sends the player back or asks for the water again before the court
    const k1 = story('01-kapitel-1');
    const opening = k1.beats.slice(0, k1.beats.findIndex((b) => b.id === 'k1_1'));
    expect(opening.map((b) => b.id)).toEqual(['k1_0', 'k1_0b', 'k1_0c']);
    for (const beat of opening) {
      const actions = [...(beat.enter ?? []), ...(beat.exit ?? []), ...(beat.on ?? []).flatMap((r) => r.do)];
      expect(actions.some((a) => a.do === 'shift' || a.do === 'fade'), beat.id).toBe(false);
      expect(actions.some((a) => a.do === 'flag' && a.set['quelle.call'] === true), beat.id).toBe(false);
      expect(JSON.stringify(beat.complete), beat.id).not.toContain('quelle:touch');
    }
    const ankunft = json<QuestFile>('content/quests/01-kapitel-1.quests.json').quests.find((q) => q.id === 'q.k1.ankunft')!;
    expect(ankunft.objectives.map((o) => o.id)).toEqual(['wechsel', 'wache', 'fluegel']);
    expect(ankunft.objectives.some((o) => o.after?.includes('quelle'))).toBe(false);
    expect(JSON.stringify(ankunft)).not.toMatch(/über Nacht|Erst die Quelle|quelle:touch/);
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

describe('saves from the old opening (a look at 1789, back to the present, a second touch)', () => {
  /** Load a save and run the story on it: shifts, flags and quest commands applied at once, delays ignored. */
  function play(state: GameState) {
    const current = deserializeState(JSON.stringify(state));
    const defs = questsInPlay([{ data: json<QuestFile>('content/quests/01-kapitel-1.quests.json') }], false);
    const quests = (current.systems.quests ??= createQuestSlice());
    const book = new QuestBook(defs.quests, quests, {
      flags: current.flags, codex: current.codex.facts, emit: () => {}, now: () => current.meta.playSeconds, rng: () => 0,
    });
    book.mirror();
    const ran: Action[] = [];
    const slice = () => current.systems.story!;
    const engine = new StoryEngine(storiesInPlay(loadStoryFiles(ROOT).files, new URLSearchParams()), slice, {
      run: (actions, { resume }) => {
        for (const action of actions) {
          if (resume && !runsOnResume(action)) continue;
          ran.push(action);
          if (action.do === 'shift') current.era = action.to;
          if (action.do === 'quest' && action.op === 'offer') book.offer(action.id);
          if (action.do === 'flag') {
            for (const [key, value] of Object.entries(action.set)) {
              if (value === null) delete current.flags[key];
              else current.flags[key] = value;
            }
          }
          if (action.do === 'anchor') {
            if (action.to === null) for (const key of ['shift.allowed', 'shift.target', 'shift.x', 'shift.z', 'shift.r']) delete current.flags[key];
            else Object.assign(current.flags, { 'shift.allowed': true, 'shift.target': action.to, 'shift.x': action.x, 'shift.z': action.z, 'shift.r': action.r });
          }
          if (action.do === 'objective') slice().objective = action.text ? { text: action.text, id: action.id } : null;
        }
      },
      chapterEntered: (file, { resume, handover }) => {
        // src/systems/story/index.ts `chapterEntered`: a new chapter starts in its checkpoint's era,
        // unless it continues where the last one ended
        if (!resume && !staysAtHandover(file, handover === true) && file.checkpoint?.era) current.era = file.checkpoint.era;
      },
      beatEntered: () => {}, chapterCompleted: () => {},
    });
    const tick = (n = 1) => {
      for (let i = 0; i < n; i++) {
        engine.tick(0.5, {
          era: current.era, x: current.player.x, z: current.player.z, flags: current.flags, inventory: current.inventory,
          chronik: current.chronik, scan: 0, map: false, stance: 'stand', lantern: false, caseFacts: () => null,
        });
      }
    };
    engine.resume();
    return { current, engine, book, ran, tick, at: () => `${slice().chapter}/${slice().beat}` };
  }

  /** The saved flags and position of a player standing at the trough in the present. */
  function atSpring(chapter: string, beat: string, flags: GameState['flags'] = {}): GameState {
    const state = createInitialState();
    state.era = 'today';
    Object.assign(state.player, { x: HOME.spawn.x, z: HOME.spawn.z });
    state.flags = { 'story.compass': true, 'story.laub': true, ...flags };
    state.systems.story = { ...createStorySlice(), active: true, chapter, beat, unlocked: ['tour'], name: 'Mara' };
    state.systems.progression = createProgressionSlice();
    return state;
  }

  it('tour/t17 before the touch: one touch, the shift, the hand-over, the coat', () => {
    const game = play(atSpring('tour', 't17', { 'quelle.call': true, 'quelle.guide': true, 'combat.disabled': true }));
    expect(game.at()).toBe('tour/t17');
    game.tick(4);
    expect(game.at()).toBe('tour/t17');
    game.engine.onEvent('quelle:touch', { era: 'today' });
    game.tick();
    expect(game.at()).toBe('tour/t18');
    expect(game.current.era).toBe('1789');
    game.tick(3);
    expect(game.at()).toBe('k1/k1_0b');
    expect(game.current.era).toBe('1789');
    expect(game.current.systems.story!.completed).toContain('tour');
    expect(game.current.flags['quelle.call']).toBeUndefined();
    expect(game.current.flags['combat.disabled']).toBeUndefined();
    expect(game.current.flags['k1.vorspiel']).toBe(true);
    expect(game.book.state('q.k1.ankunft')).toBe('active');
    expect(game.current.systems.story!.objective?.text).toBe('Ein Rock, der nicht leuchtet: hinunter zur Bleiche am Bach');
  });

  it.each(['today', '1789'] as const)('tour/t18 saved in %s (the beat autosave is written before the shift runs): Continue finishes the jump', (era) => {
    const state = atSpring('tour', 't18', { 'combat.disabled': true });
    state.era = era;
    const game = play(state);
    // the resume repeats the shift (a no-op in 1789) and the latch of the lines
    expect(game.ran).toContainEqual({ do: 'shift', to: '1789', reason: 'quelle', onResume: true });
    expect(game.current.era).toBe('1789');
    game.tick(3);
    expect(game.at()).toBe('k1/k1_0b');
    expect(game.current.era).toBe('1789');
    expect(game.ran).toContainEqual({ do: 'xp', amount: 549, reason: 'story:tour' });
    expect(game.ran.some((a) => a.do === 'fade' && a.to === 1)).toBe(false);
  });

  it('k1/k1_0 at dawn in the present, waiting for the second touch: loads in 1789 at the spring and walks on', () => {
    const state = atSpring('k1', 'k1_0', { 'quelle.call': true, 'quelle.guide': true, 'npc.owns.clue.k1.fluegel': true });
    Object.assign(state.player, { x: HOME.spawn.x + 4, z: HOME.spawn.z - 3, stance: 'crouch' });
    Object.assign(state.systems.story!, {
      completed: ['tour'], unlocked: ['tour', 'k1'], look: 'dawn', said: ['marlene.k1.morgen.quelle', 'laub.k1.morgen.quelle'],
      objective: { id: 'k1.quelle', text: 'An der Quelle: E – das Wasser berühren', x: HOME.spawn.x, z: HOME.spawn.z },
    });
    state.systems.quests = { ...createQuestSlice(), tracked: ['q.k1.ankunft'], quests: { 'q.k1.ankunft': { state: 'active', counts: {}, t: 3 } } };
    const loaded = deserializeState(JSON.stringify(state));
    expect(loaded.era).toBe('1789');
    expect(loaded.player).toMatchObject({ x: HOME.spawn.x, z: HOME.spawn.z, yaw: -HOME.spawn.yaw * Math.PI / 180, stance: 'stand' });
    expect(loaded.flags['quelle.call']).toBeUndefined();
    expect(loaded.flags['quelle.guide']).toBeUndefined();
    expect(loaded.systems.story).toMatchObject({ chapter: 'k1', beat: 'k1_0', objective: null });
    // the migration is stable: a re-save loads the same
    expect(deserializeState(JSON.stringify(loaded))).toEqual(loaded);

    const game = play(state);
    expect(game.at()).toBe('k1/k1_0');
    // the dawn of the old opening ends with the resume
    expect(game.ran).toContainEqual({ do: 'look', time: 'day' });
    game.tick(2);
    expect(game.at()).toBe('k1/k1_0b');
    expect(game.current.era).toBe('1789');
    expect(game.current.flags['quelle.call']).toBeUndefined();
    expect(game.book.state('q.k1.ankunft')).toBe('active');
    expect(game.current.systems.story!.objective?.text).toBe('Ein Rock, der nicht leuchtet: hinunter zur Bleiche am Bach');
    // the arrival lines of the next beat are new to this save
    expect(game.ran.filter((a) => a.do === 'say').map((a) => a.id)).toEqual(expect.arrayContaining(['laub.k1.brunnenstube', 'laub.k1.fremde']));
  });

  it.each(['k1_0b', 'k1_0c'])('k1/%s saved in the present after a wake: Q at the spring leads back, no touch', (beat) => {
    const state = atSpring('k1', beat, { 'k1.vorspiel': true, ...(beat === 'k1_0c' ? { 'disguise.coat': true, 'disguise.letter': true } : {}) });
    Object.assign(state.systems.story!, { completed: ['tour'], unlocked: ['tour', 'k1'] });
    // the old arrival quest had counted the second touch
    state.systems.quests = { ...createQuestSlice(), tracked: ['q.k1.ankunft'], quests: { 'q.k1.ankunft': { state: 'active', counts: { quelle: 1 }, t: 3 } } };
    const game = play(state);
    expect(game.current.era).toBe('today');
    game.tick();
    expect(game.at()).toBe(`k1/${beat}`);
    expect(game.current.flags).toMatchObject({ 'shift.allowed': true, 'shift.target': '1789' });
    expect(game.current.flags['quelle.call']).toBeUndefined();
    expect(game.current.systems.story!.objective?.text).toBe('Zurück in den Sommer 1789: Q an der Quelle');
    // the saved count of the retired objective neither blocks nor finishes the quest
    expect(game.book.state('q.k1.ankunft')).toBe('active');
    expect(game.current.systems.quests!.quests['q.k1.ankunft']!.counts.quelle).toBe(1);
    game.current.era = '1789';
    game.tick();
    expect(game.at()).toBe(`k1/${beat}`);
  });

  it('leaves saves of the new flow alone (k1_0 in 1789 or waiting for Q in the present, later beats)', () => {
    const arrived = atSpring('k1', 'k1_0');
    arrived.era = '1789';
    Object.assign(arrived.player, { x: 1040, z: -850 });
    expect(deserializeState(JSON.stringify(arrived))).toMatchObject({ era: '1789', player: { x: 1040, z: -850 } });
    // „Der Hof“ chosen from Pause → Kapitel: at the spring in the present, the Q anchor set, no call
    // of the water. The player decides when to cross; loading must not do it for them.
    const replay = atSpring('k1', 'k1_0', { 'shift.allowed': true, 'shift.target': '1789', 'k1.vorspiel': true });
    Object.assign(replay.player, { x: HOME.spawn.x + 6, z: HOME.spawn.z + 2, stance: 'crouch' });
    replay.systems.story!.objective = { id: 'k1.zurueck-q', text: 'Zurück in den Sommer 1789: Q an der Quelle', x: HOME.spawn.x, z: HOME.spawn.z };
    const loaded = deserializeState(JSON.stringify(replay));
    expect(loaded).toMatchObject({ era: 'today', player: { x: HOME.spawn.x + 6, z: HOME.spawn.z + 2, stance: 'crouch' }, flags: { 'shift.allowed': true } });
    expect(loaded.systems.story!.objective).toMatchObject({ id: 'k1.zurueck-q' });
    // and it still gets there without a touch: Q at the spring, Laub's lines, the prelude
    const game = play(replay);
    game.tick();
    expect(game.at()).toBe('k1/k1_0');
    expect(game.current.flags).toMatchObject({ 'shift.allowed': true, 'shift.target': '1789' });
    game.current.era = '1789';
    game.tick(3);
    expect(game.at()).toBe('k1/k1_0b');
    // an old save is told by the spring's call or by its objective, either is enough
    const byObjective = atSpring('k1', 'k1_0');
    byObjective.systems.story!.objective = { id: 'k1.quelle', text: 'An der Quelle: E – das Wasser berühren' };
    expect(deserializeState(JSON.stringify(byObjective)).era).toBe('1789');
    expect(deserializeState(JSON.stringify(atSpring('k1', 'k1_0', { 'quelle.call': true }))).era).toBe('1789');
    const later = atSpring('k1', 'k1_6', { 'shift.allowed': true, 'shift.target': '1789' });
    Object.assign(later.player, { x: 1300, z: -1200 });
    expect(deserializeState(JSON.stringify(later))).toMatchObject({ era: 'today', player: { x: 1300, z: -1200 }, flags: { 'shift.allowed': true } });
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
    expect(preview.era).toBe('1789');
    expect(preview.player).toMatchObject({ x: HOME.spawn.x, z: HOME.spawn.z, yaw: -HOME.spawn.yaw * Math.PI / 180, stance: 'stand', flying: false });
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
    // no touch: the save arrives in 1789 and the arrival beat hands on
    engine.tick(0.1, {
      era: current.era, x: current.player.x, z: current.player.z, flags: current.flags, inventory: current.inventory,
      chronik: current.chronik, scan: 0, map: false, stance: 'stand', lantern: false, caseFacts: () => null,
    });
    expect(engine.beat()?.id).toBe('k1_0b');
    expect(current.era).toBe('1789');
    expect([...book.tracked()].sort()).toEqual(['q.k1.ankunft', 'q.k1.kleider']);
    expect(book.state('q.k1.ankunft')).toBe('active');

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
      state.systems.quests = {
        ...createQuestSlice(),
        tracked: ['q.k3.festsaal'],
        quests: {
          'q.p.trichter': { state: 'done', counts: { finden: 1, melden: 1 }, t: 40 },
          'q.k3.festsaal': { state: 'active', counts: { saal: 1, wahl: 1 }, t: 75 },
        },
      };
      state.flags['quest.q.p.trichter'] = 'done';
      state.flags['quest.q.k3.festsaal'] = 'active';
      state.flags['quest.q.k3.festsaal.saal'] = 1;
      state.flags['quest.q.k3.festsaal.wahl'] = 1;
    }
    expect(deserializeState(JSON.stringify(state))).toEqual(state);
  });
});
