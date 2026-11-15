/**
 * Feature "progression" — XP and levels (1–12), talents, inventory, equipment (Messstab upgrades,
 * charms), consumables on the quick-use key, loot drops, glowing world pickups, collections, the
 * level-up card and the XP bar (docs/ACTION-RPG.md §6–§7). STUB: registered and compiling; the
 * progression track fills it in.
 *
 * Contract (src/systems/contracts.ts, "progression"): listens to xp:grant, item:grant, loot:place
 * / clear, enemy:killed (loot tables), settings:change (gentle / Rauhnacht); emits xp:gain,
 * level:up, item:pickup / use, loot:drop, equip:change, talent:learned, stats:changed. Mirrors
 * `flags['rpg.level']` (story `level` condition). Pure rules: src/rpg/stats.ts, src/rpg/items.ts.
 * State: `state.systems.progression` (ProgressionSlice, src/rpg/types.ts).
 */
import '../contracts';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import type { ProgressionSlice } from '../../rpg/types';

declare module '../../core/state' {
  interface SystemStates {
    progression: ProgressionSlice;
  }
}

export interface ProgressionHooks {
  state(): ProgressionSlice;
}

declare module '../../debug/hooks' {
  interface KqHooks {
    progression?: ProgressionHooks;
  }
}

export function createProgressionSlice(): ProgressionSlice {
  return { xp: 0, level: 1, points: 0, talents: {}, inventory: {}, equipped: { weapon: null, charms: [] }, quick: null, taken: [], completedSets: [] };
}

/** window.kq is installed after the systems' init: the hooks go in on the first frame. */
let hooks: ProgressionHooks | null = null;

export default defineSystem({
  id: 'progression',
  init(ctx: GameContext) {
    const slice = () => ctx.state.slice('progression', createProgressionSlice);
    slice();
    hooks = { state: () => structuredClone(slice()) };
  },
  frame() {
    if (hooks && typeof window !== 'undefined' && window.kq && window.kq.progression !== hooks) window.kq.progression = hooks;
  },
});
