/**
 * Progression rules (src/systems/progression/logic.ts, docs/ACTION-RPG.md §6–§7): XP and levels,
 * talents, items and equipment, consumables, loot rolls, world pickups, collections, codex XP,
 * restore from a save and the `rpg.level` flag mirror.
 */
import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/rpg/enemies';
import { COLLECTIONS, ITEMS, LOOT, itemDef } from '../src/rpg/items';
import { LEVEL_XP, MAX_LEVEL, TALENTS, charmSlots, deriveStats, weaponPower } from '../src/rpg/stats';
import type { CollectionSet, ItemDef, ProgressionSlice } from '../src/rpg/types';
import { CODEX_XP, MAX_DROPS, ProgressionCore, XP_CAP, createProgressionSlice, hashString, mulberry32, normalizeSlice, rollLoot, stackLimit } from '../src/systems/progression/logic';

type Ev = { type: string; p: Record<string, unknown> };

const QUEST_ITEMS: ItemDef[] = [
  { id: 'item.t.zettel', kind: 'quest', name_de: 'Zettel', text_de: '…' },
  { id: 'item.t.marke1', kind: 'lore', set: 'hundemarken', name_de: 'Marke Diane', text_de: '…' },
  { id: 'item.t.marke2', kind: 'lore', set: 'hundemarken', name_de: 'Marke Sultan', text_de: '…' },
];

function setup(opts: { gentle?: boolean; rauhnacht?: boolean; slice?: ProgressionSlice } = {}) {
  let slice = opts.slice ?? createProgressionSlice();
  const events: Ev[] = [];
  const flags: Record<string, number> = {};
  const sets: { set: CollectionSet; xp: number }[] = [];
  const env = {
    emit: (type: string, p: unknown) => events.push({ type, p: p as Record<string, unknown> }),
    item: (id: string) => itemDef(id) ?? QUEST_ITEMS.find((i) => i.id === id),
    setMembers: (set: string) => [...ITEMS, ...QUEST_ITEMS].filter((i) => i.set === set).map((i) => i.id),
    statOptions: () => ({ gentle: !!opts.gentle, rauhnacht: !!opts.rauhnacht }),
    setLevelFlag: (n: number) => (flags['rpg.level'] = n),
    onCollection: (set: CollectionSet, xp: number) => sets.push({ set, xp }),
  };
  const core = new ProgressionCore(() => slice, env as never);
  const of = (type: string) => events.filter((e) => e.type === type).map((e) => e.p);
  return { core, events, of, flags, sets, get slice() { return slice; }, set slice(s: ProgressionSlice) { slice = s; } };
}

describe('XP and levels', () => {
  it('several level-ups at once: one level:up and one point each, flag in sync, stats announced', () => {
    const t = setup();
    t.core.restore();
    expect(t.flags['rpg.level']).toBe(1);
    expect(t.core.grantXp(500, 'test')).toBe(500);
    expect(t.of('xp:gain')).toEqual([{ amount: 500, total: 500, reason: 'test' }]);
    expect(t.of('level:up')).toEqual([
      { level: 2, points: 1 },
      { level: 3, points: 2 },
    ]);
    expect(t.slice.level).toBe(3);
    expect(t.slice.points).toBe(2);
    expect(t.flags['rpg.level']).toBe(3);
    const st = t.of('stats:changed');
    expect(st.length).toBe(2); // restore + level-up
    expect((st[1]!.stats as { maxHp: number }).maxHp).toBe(100 + 2 * 12);
    // more on top, no level crossed: no level:up
    t.core.grantXp(100, 'kill');
    expect(t.of('level:up').length).toBe(2);
  });

  it('caps at level 12: XP stops at the curve end, no level beyond 12', () => {
    const t = setup();
    t.core.grantXp(1e6, 'big');
    expect(t.slice.xp).toBe(XP_CAP);
    expect(t.slice.level).toBe(MAX_LEVEL);
    expect(t.slice.points).toBe(MAX_LEVEL - 1);
    expect(t.of('level:up').length).toBe(MAX_LEVEL - 1);
    expect(t.core.grantXp(50, 'more')).toBe(0);
    expect(t.of('xp:gain').length).toBe(1);
    expect(t.flags['rpg.level']).toBe(12);
  });

  it('XP is multiplied by stats.xp (Gedächtnis, Dukat)', () => {
    const t = setup();
    t.slice.talents['feldbuch.gedaechtnis'] = 1;
    t.slice.inventory['item.charm.dukat'] = 1;
    t.slice.equipped.charms = ['item.charm.dukat'];
    expect(t.core.grantXp(100, 'q')).toBe(Math.round(100 * 1.1 * 1.1));
    expect(t.core.grantXp(100, 'debug', true)).toBe(100);
  });

  it('codex: +10 XP once per fact', () => {
    const t = setup();
    expect(t.core.codex('cx.08')).toBe(CODEX_XP);
    expect(t.core.codex('cx.08')).toBe(0);
    expect(t.core.codex('cx.10')).toBe(CODEX_XP);
    expect(t.slice.xp).toBe(20);
    expect(t.of('xp:gain').map((p) => p.reason)).toEqual(['codex', 'codex']);
  });

  it('setLevel (debug) up and down keeps points honest', () => {
    const t = setup();
    t.core.setLevel(5);
    expect(t.slice).toMatchObject({ level: 5, points: 4, xp: LEVEL_XP[4] });
    t.core.learn('stab.wucht');
    t.core.setLevel(2);
    expect(t.slice).toMatchObject({ level: 2, points: 1, talents: {} });
    expect(t.flags['rpg.level']).toBe(2);
  });
});

describe('talents', () => {
  it('points, maxRank, requirements, respec', () => {
    const t = setup();
    t.core.setLevel(6); // 5 points
    expect(t.core.learn('stab.dritter')).toBe(false); // needs Wucht
    expect(t.core.learn('stab.wucht')).toBe(true);
    expect(t.core.learn('stab.dritter')).toBe(true);
    expect(t.core.learn('stab.dritter')).toBe(false); // max 1
    expect(t.core.learn('stab.wucht')).toBe(true);
    expect(t.core.learn('stab.wucht')).toBe(true);
    expect(t.core.learn('stab.wucht')).toBe(false); // max 3
    expect(t.slice.points).toBe(1);
    expect(t.core.learn('laterne.weit')).toBe(true);
    expect(t.slice.points).toBe(0);
    expect(t.core.learn('laterne.glut')).toBe(false); // no points
    expect(t.core.learn('magie')).toBe(false);
    expect(t.of('talent:learned')).toEqual([
      { talent: 'stab.wucht', rank: 1 },
      { talent: 'stab.dritter', rank: 1 },
      { talent: 'stab.wucht', rank: 2 },
      { talent: 'stab.wucht', rank: 3 },
      { talent: 'laterne.weit', rank: 1 },
    ]);
    expect(t.core.stats().heavy).toBeCloseTo(2.2 + 0.75);
    expect(t.core.respec()).toBe(5);
    expect(t.slice).toMatchObject({ points: 5, talents: {} });
    expect(t.core.stats().heavy).toBeCloseTo(2.2);
    expect(t.core.respec()).toBe(0);
  });

  it('every talent can be filled with the points of the campaign', () => {
    expect(TALENTS.reduce((n, x) => n + x.maxRank, 0)).toBeGreaterThanOrEqual(MAX_LEVEL - 1);
  });
});

describe('items and equipment', () => {
  it('stack limits: consumables, weapons, quest items, unknown quest items', () => {
    const t = setup();
    expect(stackLimit(itemDef('item.balsam'))).toBe(9);
    expect(stackLimit(itemDef('item.stab.esche'))).toBe(1);
    expect(stackLimit(QUEST_ITEMS[0])).toBe(99);
    expect(stackLimit(undefined)).toBe(99);
    expect(t.core.grantItem('item.balsam', 7)).toBe(7);
    expect(t.core.grantItem('item.balsam', 5)).toBe(2);
    expect(t.core.grantItem('item.balsam', 1)).toBe(0);
    expect(t.slice.inventory['item.balsam']).toBe(9);
    expect(t.core.grantItem('item.riechsalz', 9)).toBe(5);
    expect(t.core.grantItem('item.k9.raetsel', 3)).toBe(3); // opaque quest item
    expect(t.of('item:pickup').at(-1)).toMatchObject({ item: 'item.k9.raetsel', count: 3, total: 3 });
  });

  it('the tour staff grant emits the pickup before auto-equipping the staff', () => {
    const t = setup();
    const staff = 'item.stab.esche';
    expect(t.core.grantItem(staff, 1, { reason: 'story:tour' })).toBe(1);
    expect(t.events.slice(0, 2)).toEqual([
      { type: 'item:pickup', p: { item: staff, count: 1, total: 1, reason: 'story:tour' } },
      { type: 'equip:change', p: { slot: 'weapon', item: staff } },
    ]);
    expect(t.slice.inventory[staff]).toBe(1);
    expect(t.slice.equipped.weapon).toBe(staff);
  });

  it('a weapon equips itself only when it is stronger', () => {
    const t = setup();
    t.core.grantItem('item.stab.esche');
    expect(t.slice.equipped.weapon).toBe('item.stab.esche');
    t.core.grantItem('item.stab.silber');
    expect(t.slice.equipped.weapon).toBe('item.stab.silber');
    t.core.grantItem('item.stab.eisen'); // weaker than Silber
    expect(t.slice.equipped.weapon).toBe('item.stab.silber');
    expect(t.of('equip:change')).toEqual([
      { slot: 'weapon', item: 'item.stab.esche' },
      { slot: 'weapon', item: 'item.stab.silber' },
    ]);
    expect(weaponPower('item.stab.lot')).toBeGreaterThan(weaponPower('item.stab.bann'));
    // manual equip of the weaker one works
    expect(t.core.equip('item.stab.eisen')).toBe(true);
    expect(t.core.stats().damage).toBeCloseTo(16);
  });

  it('charms fill charmSlots(level): one slot, two from level 6', () => {
    const t = setup();
    t.core.grantItem('item.charm.hundemarke');
    t.core.grantItem('item.charm.uhr');
    expect(t.slice.equipped.charms).toEqual(['item.charm.hundemarke']);
    expect(t.core.equip('item.charm.uhr')).toBe(true); // replaces
    expect(t.slice.equipped.charms).toEqual(['item.charm.uhr']);
    expect(t.core.equip('item.charm.dukat')).toBe(false); // not owned
    t.core.setLevel(6);
    expect(charmSlots(t.slice.level)).toBe(2);
    t.core.equip('item.charm.hundemarke');
    expect(t.slice.equipped.charms).toEqual(['item.charm.uhr', 'item.charm.hundemarke']);
    expect(t.core.stats().damageTaken).toBeCloseTo(0.92);
    expect(t.core.unequip('item.charm.hundemarke')).toBe(true);
    expect(t.core.stats().damageTaken).toBeCloseTo(1);
  });

  it('quick use: default Kräuterbalsam, item:use, Lampenöl asks the lantern, empty does nothing', () => {
    const t = setup();
    expect(t.core.use()).toBe(false);
    t.core.grantItem('item.balsam', 2);
    expect(t.core.use()).toBe(true);
    expect(t.of('item:use')).toEqual([{ item: 'item.balsam' }]);
    expect(t.slice.inventory['item.balsam']).toBe(1);
    t.core.grantItem('item.lampenoel');
    expect(t.core.setQuick('item.lampenoel')).toBe(true);
    expect(t.core.setQuick('item.stab.esche')).toBe(false);
    expect(t.core.use()).toBe(true);
    expect(t.of('lantern:request')).toEqual([{ lit: true, refill: true }]);
    expect(t.core.use()).toBe(false);
    expect(t.core.use('item.balsam')).toBe(true);
    expect(t.slice.inventory['item.balsam']).toBeUndefined();
  });
});

describe('derived stats integration', () => {
  it('gentle, Rauhnacht, charms and talents feed deriveStats', () => {
    const t = setup({ gentle: true, rauhnacht: true });
    t.core.grantItem('item.stab.esche');
    t.core.grantItem('item.charm.winkel');
    t.core.setLevel(3);
    t.core.learn('feldbuch.atem');
    const s = t.core.stats();
    expect(s.damageTaken).toBeCloseTo(0.5 * 1.3);
    expect(s.staminaCost).toBeCloseTo(0.85 * 0.88 * 0.7);
    expect(s.maxStamina).toBe(100 + 2 * 3 + 10);
    expect(s.healing).toBeCloseTo(0.8);
    expect(s).toEqual(deriveStats(t.slice, { gentle: true, rauhnacht: true }));
    // the last stats:changed carries exactly these stats
    expect(t.of('stats:changed').at(-1)!.stats).toEqual(s);
  });
});

describe('loot', () => {
  const mahnbrief = ENEMIES.find((e) => e.id === 'mahnbrief')!;
  const kill = (id: string) => ({ id, group: 'g', kind: 'mahnbrief', x: 10, z: 20, era: '1789' as const, boss: false, by: 'light' as const });

  it('a seeded roll is deterministic', () => {
    const table = LOOT.find((l) => l.id === 'loot.boss')!;
    expect(rollLoot(table, mulberry32(42))).toEqual(rollLoot(table, mulberry32(42)));
    const a = setup();
    const b = setup();
    const ra = Array.from({ length: 12 }, (_, i) => a.core.enemyKilled(kill(`e${i}`), mahnbrief));
    const rb = Array.from({ length: 12 }, (_, i) => b.core.enemyKilled(kill(`e${i}`), mahnbrief));
    expect(ra).toEqual(rb);
    expect(ra.flat().length).toBeGreaterThan(0);
    expect(hashString('abc')).toBe(hashString('abc'));
  });

  it('respects the table weights (independent entries, bonus adds)', () => {
    const table = { id: 't', entries: [{ item: 'a', chance: 0.5 }, { item: 'b', chance: 0.1 }, { item: 'c', chance: 1, min: 2, max: 3 }] };
    const rng = mulberry32(7);
    const n = 20000;
    const hits: Record<string, number> = { a: 0, b: 0, c: 0 };
    const counts = new Set<number>();
    for (let i = 0; i < n; i++)
      for (const r of rollLoot(table, rng)) {
        hits[r.item]!++;
        if (r.item === 'c') counts.add(r.count);
      }
    expect(hits.a! / n).toBeCloseTo(0.5, 1);
    expect(hits.b! / n).toBeGreaterThan(0.08);
    expect(hits.b! / n).toBeLessThan(0.12);
    expect(hits.c).toBe(n);
    expect([...counts].sort()).toEqual([2, 3]);
    let withBonus = 0;
    for (let i = 0; i < n; i++) withBonus += rollLoot(table, rng, 0.2).filter((r) => r.item === 'b').length;
    expect(withBonus / n).toBeCloseTo(0.3, 1);
  });

  it('enemy:killed → loot:drop then one loot:place per item; bad-luck protection guarantees a drop', () => {
    const t = setup();
    let drops: ReturnType<typeof t.core.enemyKilled> = [];
    let kills = 0;
    while (!drops.length && kills < 30) drops = t.core.enemyKilled(kill(`m${kills++}`), mahnbrief);
    expect(drops.length).toBeGreaterThan(0);
    expect(kills).toBeLessThan(12); // +6 % per empty roll
    const types = t.events.map((e) => e.type).filter((x) => x.startsWith('loot:'));
    expect(types[0]).toBe('loot:drop');
    expect(types.slice(1).every((x) => x === 'loot:place')).toBe(true);
    expect(t.of('loot:drop')[0]).toMatchObject({ era: '1789', from: 'mahnbrief' });
    expect(t.core.pickups().length).toBe(drops.length);
    expect(t.slice.dry).toBe(0);
    // grusling has no table
    expect(t.core.enemyKilled(kill('x'), ENEMIES.find((e) => e.id === 'grusling'))).toEqual([]);
  });
});

describe('world pickups', () => {
  it('place is idempotent, take grants with the pickup id, taken ids never come back, clear by quest', () => {
    const t = setup();
    expect(t.core.place({ id: 't1', item: 'item.balsam', x: 1, z: 2, era: '1789' })).toBe(true);
    expect(t.core.place({ id: 't1', item: 'item.balsam', x: 1, z: 2, era: '1789' })).toBe(true);
    expect(t.core.pickups().length).toBe(1);
    expect(t.core.take('t1')).toBe(1);
    expect(t.of('item:pickup').at(-1)).toMatchObject({ item: 'item.balsam', count: 1, total: 1, id: 't1', x: 1, z: 2 });
    expect(t.core.place({ id: 't1', item: 'item.balsam', x: 1, z: 2, era: '1789' })).toBe(false);
    t.core.place({ id: 'q1', item: 'item.t.zettel', x: 0, z: 0, era: '1789', quest: 'q.t' });
    t.core.place({ id: 'q2', item: 'item.t.zettel', x: 0, z: 0, era: '1789', quest: 'q.t' });
    expect(t.core.clear({ quest: 'q.t' }).sort()).toEqual(['q1', 'q2']);
    expect(t.core.pickups()).toEqual([]);
  });

  it('a full stack leaves the pickup lying; old drops are pruned', () => {
    const t = setup();
    t.core.grantItem('item.riechsalz', 5);
    t.core.place({ id: 'r', item: 'item.riechsalz', x: 0, z: 0, era: 'today' });
    expect(t.core.take('r')).toBe(0);
    expect(t.core.pickups().length).toBe(1);
    for (let i = 0; i < MAX_DROPS + 5; i++) t.core.place({ id: `d${i}`, item: 'item.balsam', x: 0, z: 0, era: 'today', drop: true });
    expect(t.core.pickups().filter((p) => p.drop).length).toBe(MAX_DROPS);
    expect(t.core.pickups().some((p) => p.id === 'd0')).toBe(false);
  });
});

describe('collections', () => {
  it('completes once, with the set reward', () => {
    const t = setup();
    const set = COLLECTIONS.find((c) => c.id === 'hundemarken')!;
    t.core.grantItem('item.t.marke1');
    expect(t.slice.completedSets).toEqual([]);
    t.core.grantItem('item.t.marke2');
    expect(t.slice.completedSets).toEqual(['hundemarken']);
    expect(t.sets).toEqual([{ set, xp: set.reward!.xp }]);
    expect(t.of('xp:gain').at(-1)).toMatchObject({ reason: 'collection', amount: set.reward!.xp });
    // again: nothing
    expect(t.core.checkCollections()).toEqual([]);
    t.core.grantItem('item.t.zettel');
    expect(t.sets.length).toBe(1);
  });
});

describe('restore', () => {
  it('a saved slice (older shape) comes back filled, flag and stats in sync', () => {
    const saved = JSON.parse(
      JSON.stringify({ xp: 800, level: 4, points: 1, talents: { 'stab.wucht': 2 }, inventory: { 'item.stab.eisen': 1, 'item.balsam': 3 }, equipped: { weapon: 'item.stab.eisen', charms: [] }, quick: null, taken: ['t1'], completedSets: [] }),
    ) as ProgressionSlice;
    const t = setup({ slice: saved });
    t.core.restore();
    expect(t.flags['rpg.level']).toBe(4);
    expect(t.slice.placed).toEqual({});
    expect(t.slice.codexXp).toEqual([]);
    const st = t.of('stats:changed');
    expect(st.length).toBe(1);
    expect((st[0]!.stats as { heavy: number }).heavy).toBeCloseTo(2.7);
    expect(t.core.place({ id: 't1', item: 'item.balsam', x: 0, z: 0, era: 'today' })).toBe(false);
    // inconsistent level is lifted to what the XP says
    expect(normalizeSlice({ ...createProgressionSlice(), xp: 1300, level: 2 }).level).toBe(5);
  });
});
