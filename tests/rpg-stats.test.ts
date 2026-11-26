import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/rpg/enemies';
import { collectionDef, lootTable } from '../src/rpg/items';
import { deriveStats, levelProgress, weaponPower } from '../src/rpg/stats';
import { mulberry32, rollLoot } from '../src/systems/progression/logic';

describe('RPG catalogues and stat boundaries', () => {
  it('uses each staff’s spectral damage and gives the sweeping upgrade priority', () => {
    const stages = [
      ['esche', 12],
      ['eisen', 16],
      ['silber', 19 * 1.15],
      ['bann', 23 * 1.2],
      ['lot', 26 * 1.25],
    ] as const;
    for (const [stage, damage] of stages) {
      const weapon = `item.stab.${stage}`;
      expect(deriveStats({ level: 1, talents: {}, equipped: { weapon, charms: [] } }).damage).toBeCloseTo(damage);
      expect(weaponPower(weapon)).toBeCloseTo(damage * (stage === 'lot' ? 1.05 : 1));
    }
  });

  it('bounds XP progress and tolerates obsolete equipment in a save', () => {
    expect(levelProgress(-10)).toBe(0);
    expect(levelProgress(9600)).toBe(1);
    expect(levelProgress(20_000)).toBe(1);
    const weapon = 'item.old.staff';
    expect(weaponPower(weapon)).toBe(0);
    expect(deriveStats({ level: 1, talents: {}, equipped: { weapon, charms: ['item.old.charm'] } })).toEqual(deriveStats(null));
    expect(lootTable('loot.old')).toBeUndefined();
    expect(collectionDef('steinzeichen')?.reward?.xp).toBe(150);
  });

  it('caps talent ranks and composes charm, novice, gentle and Rauhnacht modifiers', () => {
    const stats = deriveStats({
      level: 2,
      talents: { 'feldbuch.kraeuter': 8, 'feldbuch.atem': 2, 'laterne.glut': 2 },
      equipped: { weapon: null, charms: ['item.charm.rechenpfennig', 'item.charm.hundemarke'] },
    }, { gentle: true, rauhnacht: true });
    expect(stats.loot).toBeCloseTo(0.2);
    expect(stats.healing).toBeCloseTo(1.2 ** 2 * 0.8);
    expect(stats.maxStamina).toBe(123);
    expect(stats.staminaCost).toBeCloseTo(0.88 ** 2 * 0.7);
    expect(stats.bannRecharge).toBeCloseTo(11 * 0.85 ** 2);
    expect(stats.damageTaken).toBeCloseTo(0.92 * 0.75 * 0.5 * 1.3);
  });

  it('always awards one Balsam in the boss loot roll without a loot bonus', () => {
    for (const boss of ENEMIES.filter((enemy) => enemy.boss)) {
      const table = lootTable(boss.loot ?? '');
      expect(table, boss.id).toBeDefined();
      const drops = rollLoot(table!, mulberry32(2201));
      expect(drops.filter((drop) => drop.item === 'item.balsam'), boss.id).toEqual([{ item: 'item.balsam', count: 1 }]);
    }
  });
});
