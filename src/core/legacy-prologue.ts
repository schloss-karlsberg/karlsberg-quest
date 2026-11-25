import { ITEMS, itemDef } from '../rpg/items';
import { levelForXp } from '../rpg/stats';
import { createProgressionSlice, normalizeSlice, ProgressionCore } from '../systems/progression/logic';
import { createQuestSlice, normaliseSlice, QuestBook, type QuestDefIn } from '../systems/quests/logic';
import { createStorySlice } from '../systems/story/engine';
import { EventBus } from './events';
import { legacyPrologueQuests } from './legacy-prologue-quests';
import type { GameState } from './state';

// Capture the migration destination without pulling chapter 1's full script into the boot bundle.
const CHAPTER_ONE = { chapter: 'k1', beat: 'k1_0', x: 1059.3, z: -833.1, yaw: 50 } as const;
const questDefs = new Map<string, QuestDefIn>(legacyPrologueQuests.map((q) => [q.id, q]));
const retiredObjective = (id: string | undefined) => id?.startsWith('q.p.') ?? false;

function clearRetiredObjectives(state: GameState): void {
  const quests = state.systems.quests;
  if (Array.isArray(quests?.tracked)) quests.tracked = quests.tracked.filter((id) => !retiredObjective(id));
  const groups = state.systems.combat?.groups;
  for (const [id, group] of Object.entries(groups ?? {})) {
    if (retiredObjective(id) || retiredObjective(group.quest)) delete groups![id];
  }
  const pickups = state.systems.progression?.placed;
  for (const [id, pickup] of Object.entries(pickups ?? {})) {
    if (retiredObjective(id) || retiredObjective(pickup.quest)) delete pickups![id];
  }
}

/** Settle completed objectives using the same quest and progression rules as an in-game turn-in. */
function settleRewards(state: GameState): void {
  const slice = state.systems.quests;
  if (!slice) return;
  const events = new EventBus();
  const progression = new ProgressionCore(() => state.systems.progression!, {
    emit: () => {},
    item: itemDef,
    setMembers: (set) => ITEMS.filter((item) => item.set === set).map((item) => item.id),
    statOptions: () => ({}),
    setLevelFlag: (level) => { state.flags['rpg.level'] = level; },
  });
  events.on('xp:grant', ({ amount, reason, receipt }) => {
    const gained = progression.grantXp(amount, reason);
    if (receipt) receipt.amount = gained;
  });
  events.on('item:grant', ({ item, count, reason, receipt }) => {
    const gained = progression.grantItem(item, count, { reason });
    if (receipt) receipt.amount = gained;
  });
  events.on('codex:unlocked', ({ factId }) => progression.codex(factId));
  events.on('skill:grant', ({ skill, level }) => {
    state.skills[skill] = Math.max(state.skills[skill] ?? 0, level);
  });
  const book = new QuestBook(questDefs, { ...normaliseSlice(slice), tracked: [] }, {
    flags: state.flags, codex: state.codex.facts, emit: events.emit.bind(events),
    now: () => state.meta.playSeconds, rng: () => 0,
  });
  book.mirror();
  for (const q of questDefs.values()) {
    const status = book.state(q.id);
    if (status === 'ready' || (status === 'active' && book.requiredDone(q))) book.complete(q.id, true);
  }
}

/** Retire surveyor objectives before systems rebuild from a loaded state. */
export function migrateLegacyPrologue(state: GameState): void {
  clearRetiredObjectives(state);
  const saved = state.systems.story;
  if (saved?.chapter !== 'prolog') return;

  const story = Object.assign(createStorySlice(), saved, {
    active: true, chapter: CHAPTER_ONE.chapter, beat: CHAPTER_ONE.beat,
    beatTime: 0, chapterTime: 0, latched: {}, fired: [],
    objective: null, threats: {}, meters: {}, room: null,
  });
  story.completed = [...new Set([...(story.completed ?? []), 'tour'])];
  story.unlocked = [...new Set([...(story.unlocked ?? []), CHAPTER_ONE.chapter])];
  state.systems.story = story;

  const { x, z, yaw } = CHAPTER_ONE;
  state.era = 'today';
  Object.assign(state.player, { x, y: 0, z, yaw: -yaw * Math.PI / 180, pitch: 0, stance: 'stand', flying: false });
  for (const key of [
    'shift.allowed', 'shift.target', 'shift.x', 'shift.z', 'shift.r',
    'laub.silent', 'barks.quiet', 'map.compare', 'quelle.call', 'quelle.guide', 'story.p.flug', 'story.p.heulen',
  ]) delete state.flags[key];
  if (state.systems.hunt) {
    state.systems.hunt.pack = null;
    state.systems.hunt.alert = 0;
  }

  state.systems.quests ??= createQuestSlice();
  const progression = state.systems.progression = normalizeSlice(state.systems.progression ?? createProgressionSlice());
  settleRewards(state);

  // The full tour's handover is the floor for the opening. Pay earned quest rewards first.
  progression.xp = Math.max(549, progression.xp);
  const level = Math.max(progression.level, levelForXp(progression.xp));
  progression.points += level - progression.level;
  progression.level = level;
  state.flags['rpg.level'] = level;

  for (const [item, count] of Object.entries({
    'item.stab.esche': 1, 'item.p.seite': 1, 'item.balsam': 4, 'item.lampenoel': 1,
  })) progression.inventory[item] = Math.max(progression.inventory[item] ?? 0, count);
  progression.equipped.weapon ??= 'item.stab.esche';

  state.skills.relief = Math.max(state.skills.relief ?? 0, 3);
  state.skills.kartograf = Math.max(state.skills.kartograf ?? 0, 1);
  if (!state.inventory.items.includes('item.bussole')) state.inventory.items.push('item.bussole');
  state.flags['story.compass'] = true;
  state.flags['story.laub'] = true;
}

/** A saved tour can already be at or past the Weiher when the loan is introduced. */
export function restoreTourStaff(state: GameState): void {
  const story = state.systems.story;
  if (story?.chapter !== 'tour' || !/^t1[3-8]$/.test(story.beat ?? '')) return;
  const progression = state.systems.progression = normalizeSlice(state.systems.progression ?? createProgressionSlice());
  const staff = 'item.stab.esche';
  if ((progression.inventory[staff] ?? 0) > 0) return;
  progression.inventory[staff] = 1;
  progression.equipped.weapon ??= staff;
}
