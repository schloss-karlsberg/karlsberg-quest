// Run in an archive of the release, as described in README.md.
import { writeFileSync } from 'node:fs';
import { MemoryStorage, SaveManager, SAVE_KEY } from '../../../src/core/save';
import { type GameState, createInitialState, GameStateStore } from '../../../src/core/state';
import { createProgressionSlice } from '../../../src/systems/progression/logic';
import { createQuestSlice } from '../../../src/systems/quests/logic';
import { type StorySlice, createStorySlice } from '../../../src/systems/story/engine';

export function generateReleaseSlot(tag: string, output: string): void {
  if (!['v0.6.0', 'v0.7.0', 'v0.8.0'].includes(tag)) throw new Error(`Unexpected tag: ${tag}`);
  const state = createInitialState();
  const story = createStorySlice();
  const quests = createQuestSlice();
  const progression = createProgressionSlice();
  Object.assign(state.systems, { story, quests, progression });
  Object.assign(story, { active: true, chapter: 'prolog', beat: 'p1', name: 'Mara', unlocked: ['prolog'] });
  Object.assign(state.player, { x: 760, z: -902, yaw: 0 });

  if (tag !== 'v0.6.0') {
    Object.assign(story, {
      beat: 'p2', beatTime: 14, chapterTime: 83, doneBeats: ['p1'], said: ['marlene.p.01b'],
      objective: { id: 'damm', text: 'Zum Damm des Karlsbergweihers', x: 819, z: -875 },
    });
    Object.assign(state.player, { x: 819, z: -875 });
    state.meta.playSeconds = 83;
    state.inventory.items.push('item.bussole');
    state.codex.facts.push('cx.34', 'cx.35');
    Object.assign(state.flags, { 'story.compass': true, 'laub.silent': true, 'rpg.level': 2, 'quest.q.p.feldstation': 'done' });
    state.skills.kartograf = 1;
    Object.assign(progression, {
      xp: 173, level: 2, points: 0, talents: { 'stab.wucht': 1 },
      inventory: { 'item.stab.esche': 1, 'item.balsam': 2 },
      equipped: { weapon: 'item.stab.esche', charms: [] }, codexXp: ['cx.34', 'cx.35'],
    });
    quests.quests['q.p.feldstation'] = { state: 'done', counts: { stab: 1, nebel: 3 }, t: 69 };
    quests.quests['q.p.relief'] = { state: 'active', counts: { damm: 1, mauer: 1, nebel: 0, stufe: 0 }, t: 69 };
    quests.tracked.push('q.p.relief');
  }

  if (tag === 'v0.8.0') {
    const quest = 'q.p.relief';
    const group = `${quest}.nebel`;
    state.systems.combat = {
      hp: 61, stamina: 92, bann: 2, deaths: 1,
      groups: { [group]: { group, quest, objective: 'nebel', kind: 'nebelling', era: 'today', x: 820, z: -875, count: 1, killed: 0 } },
    };
    state.systems.photo = { album: [], good: ['test-photo'], granted: [], cards: [], best: {}, near: {} };
    progression.placed = {
      'drop.0.0': { id: 'drop.0.0', item: 'item.balsam', x: 820, z: -875, era: 'today', drop: true },
    };
  }

  writeSlot(state, Date.UTC(2026, 10, 24, 12), output);
}

/** Set up the Heimweg beat as it ran before the hub moved to the spring. */
export function generateStationSlot(output: string): void {
  const state = createInitialState();
  Object.assign(state.player, { x: 812, z: -875 });
  state.meta.playSeconds = 12450;
  state.flags['quest.q.p.feldstation'] = 'done';
  const story: StorySlice = {
    ...createStorySlice(), active: true, chapter: 'k3', beat: 'k3_9', beatTime: 8,
    name: 'Vermesser*in', look: 'dusk', unlocked: ['prolog', 'k1', 'k2', 'k3'],
    completed: ['prolog', 'k1', 'k2'],
    objective: { id: 'k3.station', text: 'Zur Feldstation', x: 760.6, z: -910.4 },
  };
  const travel = {
    activated: ['feldstation', 'ehrenhof'], announced: ['zwinger', 'feldstation'],
    seen: ['poi.p-hang.0'], done: ['poi.p-hang.0'], shrineT: {}, tips: [],
  };
  const quests = createQuestSlice();
  quests.quests['q.p.feldstation'] = { state: 'done', counts: { stab: 1, nebel: 3 }, t: 69 };
  const progression = Object.assign(createProgressionSlice(), {
    xp: 3200, level: 8, talents: { 'feldbuch.atem': 1 },
    inventory: { 'item.stab.esche': 1, 'item.balsam': 3 }, equipped: { weapon: 'item.stab.esche', charms: [] },
  });
  Object.assign(state.systems, { story, travel, quests, progression });
  writeSlot(state, Date.UTC(2026, 10, 20, 14), output);
}

function writeSlot(state: GameState, savedAt: number, output: string): void {
  const storage = new MemoryStorage();
  const save = new SaveManager(new GameStateStore(state), storage, undefined, () => savedAt);
  if (!save.save('auto')) throw new Error('Release slot could not be saved');
  writeFileSync(output, storage.getItem(SAVE_KEY('auto'))!);
}
