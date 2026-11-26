import type { GameState } from '../../core/state';
import { enemyDef } from '../../rpg/enemies';
import { itemDef, lootTable } from '../../rpg/items';
import { ProgressionCore, dropSpot, normalizeSlice } from '../progression/logic';

/** Finish the legacy Schuldbuch reward batch before the loaded systems see it. */
export function migrateSchuldbuchRewards(state: GameState): void {
  const { combat, progression, quests } = state.systems;
  const quest = quests?.quests?.['q.k1.lohn'];
  const boss = combat?.groups?.['q.k1.lohn.buch'];
  if (!quests || !progression || quest?.state !== 'active' || (quest.counts?.buch ?? 0) > 0 ||
    boss?.kind !== 'schuldbuch' || boss.quest !== 'q.k1.lohn' || boss.objective !== 'buch' || boss.count !== 1 || boss.killed !== 1 ||
    (quests.bestiary?.schuldbuch ?? 0) > 0) return;

  // The old loot listener incremented the roll counter and saved at the first loot:place,
  // before the other drops, bestiary credit, quest progress or XP had been applied.
  const roll = (progression.drops ?? 0) - 1;
  if (!Number.isSafeInteger(roll) || roll < 0) return;
  const prefix = `drop.${roll}.`;
  const firstId = `${prefix}0`;
  const first = progression.placed?.[firstId];
  if (!first?.drop || first.id !== firstId || first.item !== 'item.balsam' || first.count !== 1 || first.era !== boss.era ||
    Math.hypot(first.x - boss.x, first.z - boss.z) > (boss.leash ?? 45) + 10) return;
  if (Object.keys(progression.placed ?? {}).some((id) => id.startsWith(prefix) && id !== first.id) ||
    progression.taken?.some((id) => id.startsWith(prefix))) return;

  const def = enemyDef(boss.kind);
  const table = def?.loot ? lootTable(def.loot) : undefined;
  if (!def || !table) return;
  normalizeSlice(progression);
  const core = new ProgressionCore(() => progression, {
    emit: () => {}, item: itemDef, setMembers: () => [], statOptions: () => ({}),
    setLevelFlag: (level) => { state.flags['rpg.level'] = level; },
  });
  const offset = dropSpot(0, 0, 0, roll);
  table.entries.slice(1).forEach((entry, i) => {
    // All Schuldbuch drops are guaranteed single items. Reuse the original roll and kill position.
    const index = i + 1;
    const at = dropSpot(first.x - offset.x, first.z - offset.z, index, roll);
    core.place({ id: `${prefix}${index}`, item: entry.item, count: 1, ...at, era: boss.era, drop: true });
  });
  core.grantXp(def.xp, `enemy:${boss.kind}`);
  (quests.bestiary ??= {}).schuldbuch = 1;
}
