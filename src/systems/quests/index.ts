/**
 * Feature "quests" — quest givers, objectives, turn-in, the Journal (J) and the HUD tracker
 * (docs/ACTION-RPG.md §8–§9). STUB: registered and compiling; the quests track fills it in.
 *
 * Contract (src/systems/contracts.ts, "quests"): listens to quest:command (story), quest:accept /
 * decline / turnin / stance (npc), enemy:killed, item:pickup, npc:talk, room:enter, clue:found,
 * echo:end, menagerie:calmed, item:use, story:chapter, chronik:open (→ opens the Journal);
 * emits quest:offered / accepted / progress / objective / ready / completed / failed, npc:topics,
 * npc:marker, codex:unlocked, and the requests enemy:spawn / despawn, loot:place / clear,
 * xp:grant, item:grant, skill:grant. Mirrors `flags['quest.<id>']` (state) and
 * `flags['quest.<id>.<objective>']` (count) for the story's `quest` condition.
 * State: `state.systems.quests` (QuestSlice, src/rpg/types.ts).
 */
import '../contracts';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import type { QuestSlice } from '../../rpg/types';
import { loadBundledQuests, questsInPlay } from './data';

declare module '../../core/state' {
  interface SystemStates {
    quests: QuestSlice;
  }
}

export interface QuestsHooks {
  /** The quest slice (deep copy). */
  state(): QuestSlice;
  /** Quest ids in play (test files only with ?storytest). */
  ids(): string[];
}

declare module '../../debug/hooks' {
  interface KqHooks {
    quests?: QuestsHooks;
  }
}

export function createQuestSlice(): QuestSlice {
  return { quests: {}, tracked: [], unseen: [] };
}

/** window.kq is installed after the systems' init: the hooks go in on the first frame. */
let hooks: QuestsHooks | null = null;

export default defineSystem({
  id: 'quests',
  after: ['story', 'npc', 'chronik'],
  init(ctx: GameContext) {
    const slice = () => ctx.state.slice('quests', createQuestSlice);
    slice();
    const { quests } = questsInPlay(loadBundledQuests(), ctx.params.has('storytest'));
    hooks = { state: () => structuredClone(slice()), ids: () => [...quests.keys()] };
  },
  frame() {
    if (hooks && typeof window !== 'undefined' && window.kq && window.kq.quests !== hooks) window.kq.quests = hooks;
  },
});
