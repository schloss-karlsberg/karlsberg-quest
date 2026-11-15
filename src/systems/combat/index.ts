/**
 * Feature "combat" — the player's Lebenskraft / Atem, the Messstab (light / heavy hits), the
 * dodge roll, the Bannlicht, spectral enemies, bosses, hit-stop and screen shake
 * (docs/ACTION-RPG.md §4–§5). STUB: registered and compiling; the combat track fills it in.
 *
 * Contract (src/systems/contracts.ts, "combat"): listens to enemy:spawn / despawn (quests, story),
 * stats:changed (progression), era:change, memorial:set, game:start, save:loaded; emits
 * enemy:spawned / killed / cleared / aggro, boss:phase, combat:hit / state / bann,
 * player:damaged / healed / died, menagerie:calmed, xp:grant (kills) and player:caught
 * {by:'combat'} (the story shows the curtain and wakes the player).
 * Input actions: attack (LMB / K; hold = Wuchthieb), bannlicht (RMB / G), dodge (Space),
 * quickUse (H) is progression's. Respect `flags['combat.disabled']` (finale W8, memorials).
 * State: `state.systems.combat` (CombatSlice, src/rpg/types.ts).
 */
import '../contracts';
import type { GameContext } from '../../core/context';
import { defineSystem } from '../../core/systems';
import type { CombatSlice } from '../../rpg/types';

declare module '../../core/state' {
  interface SystemStates {
    combat: CombatSlice;
  }
}

export interface CombatHooks {
  state(): CombatSlice;
}

declare module '../../debug/hooks' {
  interface KqHooks {
    combat?: CombatHooks;
  }
}

export function createCombatSlice(): CombatSlice {
  return { hp: 100, stamina: 100, bann: 2, groups: {}, deaths: 0 };
}

/** window.kq is installed after the systems' init: the hooks go in on the first frame. */
let hooks: CombatHooks | null = null;

export default defineSystem({
  id: 'combat',
  after: ['hunt', 'menagerie', 'progression'],
  init(ctx: GameContext) {
    const slice = () => ctx.state.slice('combat', createCombatSlice);
    slice();
    hooks = { state: () => structuredClone(slice()) };
  },
  frame() {
    if (hooks && typeof window !== 'undefined' && window.kq && window.kq.combat !== hooks) window.kq.combat = hooks;
  },
});
