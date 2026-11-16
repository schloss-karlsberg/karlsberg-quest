/**
 * Combat rules and simulation (docs/ACTION-RPG.md §4–§5): damage with stats / tier / gentle, combo
 * timing, i-frames and the perfect dodge, stamina gating, the Bannlicht cone, the attack-token
 * limit, leash and reset, idempotent groups, respawn, boss phases, the Pikeur's floor, death resets,
 * safe zones and the telegraph minimum of every roster attack.
 */
import { describe, expect, it } from 'vitest';
import { ENEMIES, enemyDef } from '../src/rpg/enemies';
import { BASE_STATS, deriveStats } from '../src/rpg/stats';
import type { EnemyGroupState } from '../src/rpg/types';
import { bossHitMul, chooseBossAttack, summonOf } from '../src/systems/combat/bosses';
import {
  AI,
  AttackTokens,
  CLEAVE,
  COMBO,
  DODGE,
  STATION_XZ,
  type StaminaState,
  applyDamage,
  armorFactor,
  bossPhase,
  bossPhaseFloor,
  canAct,
  dodgeInvulnerable,
  dodgeSpeed,
  enemyDamage,
  enemyHp,
  groupActive,
  groupsToReset,
  heavyCharge,
  hitDamage,
  inCone,
  isPerfectDodge,
  leashBroken,
  nextCombo,
  pikeurLeaves,
  regenStamina,
  safeReason,
  shouldRespawn,
  spend,
  telegraphTime,
  upsertGroup,
} from '../src/systems/combat/rules';
import { CombatSim, type SimInput } from '../src/systems/combat/sim';

const flat = { heightAt: () => 0 };

function input(o: Partial<SimInput> = {}): SimInput {
  return { x: 0, y: 0, z: 0, yaw: 0, moveX: 0, moveZ: 0, attackDown: false, attackPressed: false, bannPressed: false, dodgePressed: false, running: false, blocked: false, safe: null, era: '1789', time: 'day', ...o };
}

function run(sim: CombatSim, seconds: number, inp: Partial<SimInput> = {}): ReturnType<CombatSim['step']> {
  const out: ReturnType<CombatSim['step']> = [];
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) out.push(...sim.step(1 / 60, input(inp)));
  return out;
}

/** Tap the attack key for one step and let the swing play out. */
function tap(sim: CombatSim, inp: Partial<SimInput> = {}): ReturnType<CombatSim['step']> {
  const out = sim.step(1 / 60, input({ ...inp, attackPressed: true, attackDown: false }));
  out.push(...run(sim, 0.45, inp));
  return out;
}

describe('combat rules: damage', () => {
  it('uses the derived stats, the combo finisher, heavy charge, gebannt and armour', () => {
    const s = deriveStats(null);
    expect(hitDamage(s, { kind: 'light', combo: 0 })).toBe(12);
    expect(hitDamage(s, { kind: 'light', combo: 2 })).toBe(Math.round(12 * COMBO.finisher));
    expect(hitDamage(s, { kind: 'heavy', charge: 1 })).toBe(Math.round(12 * 2.2));
    expect(hitDamage(s, { kind: 'heavy', charge: 0 })).toBe(Math.round(12 * 2.2 * 0.75));
    expect(hitDamage(s, { kind: 'light', gebannt: true })).toBe(18);
    expect(hitDamage(s, { kind: 'light', armor: 0.35 })).toBe(Math.round(12 * 0.35));
    expect(hitDamage(s, { kind: 'light', counter: true })).toBe(24);
    // a better weapon and levels raise it
    const lvl = deriveStats({ level: 5, talents: {}, equipped: { weapon: 'item.stab.silber', charms: [] } });
    expect(hitDamage(lvl, { kind: 'light' })).toBeGreaterThan(19);
  });

  it('scales enemies by tier and gentle mode', () => {
    const neb = enemyDef('nebelling')!;
    expect(enemyHp(neb, 1)).toBe(30);
    expect(enemyHp(neb, 3)).toBe(Math.round(30 * 1.9));
    expect(enemyHp(neb, 1, true)).toBe(Math.round(30 * 0.75));
    expect(enemyHp(neb, 0)).toBe(Math.round(30 * 0.6));
    expect(enemyDamage(8, 1)).toBe(8);
    expect(enemyDamage(8, 4)).toBe(11.6);
    // gentle mode halves damage taken through the stats
    expect(enemyDamage(8, 1, deriveStats(null, { gentle: true }).damageTaken)).toBe(4);
  });

  it('frontal armour only applies from the front, and a Wuchthieb breaks it', () => {
    const sf = enemyDef('steinfresser')!;
    const e = { x: 0, z: 0, heading: 0 }; // looks to −z
    expect(armorFactor(sf, 'light', e, { x: 0, z: -2 })).toBe(0.35);
    expect(armorFactor(sf, 'light', e, { x: 0, z: 2 })).toBe(1);
    expect(armorFactor(sf, 'heavy', e, { x: 0, z: -2 })).toBe(1);
    expect(armorFactor(sf, 'light', e, { x: 0, z: -2 }, true)).toBe(1);
  });
});

describe('combat rules: timing', () => {
  it('chains a 3-hit combo inside the window and starts over after it', () => {
    expect(nextCombo(-1, 0)).toBe(0);
    expect(nextCombo(0, 0.1)).toBe(1);
    expect(nextCombo(1, COMBO.chain)).toBe(2);
    expect(nextCombo(2, 0.05)).toBe(0);
    expect(nextCombo(0, COMBO.chain + 0.01)).toBe(0);
    expect(heavyCharge(0.3)).toBeNull();
    expect(heavyCharge(0.45)).toBe(0);
    expect(heavyCharge(1.2)).toBe(1);
  });

  it('has i-frames 0.08–0.33 s and a perfect dodge in the last 0.15 s', () => {
    expect(dodgeInvulnerable(0.05)).toBe(false);
    expect(dodgeInvulnerable(0.08)).toBe(true);
    expect(dodgeInvulnerable(0.3)).toBe(true);
    expect(dodgeInvulnerable(0.34)).toBe(false);
    expect(isPerfectDodge(0.1)).toBe(true);
    expect(isPerfectDodge(0.16)).toBe(false);
    // the roll covers 4.5 m in 0.35 s with a linearly decaying push
    expect((dodgeSpeed() * DODGE.dur) / 2).toBeCloseTo(DODGE.dist, 5);
  });

  it('gates on stamina: exhausted at 0 until back to 25', () => {
    const s: StaminaState = { stamina: 30, max: 100, exhausted: false, idle: 0 };
    expect(canAct(s, 20)).toBe(true);
    spend(s, 20);
    spend(s, 20);
    expect(s.stamina).toBe(0);
    expect(s.exhausted).toBe(true);
    expect(canAct(s, 10)).toBe(false);
    regenStamina(s, 0.5); // still within the delay
    expect(s.stamina).toBe(0);
    for (let i = 0; i < 60; i++) regenStamina(s, 1 / 60);
    expect(s.exhausted).toBe(true);
    for (let i = 0; i < 60; i++) regenStamina(s, 1 / 60);
    expect(s.stamina).toBeGreaterThanOrEqual(25);
    expect(s.exhausted).toBe(false);
  });

  it('every roster telegraph is at least 0.4 s (and gentle mode lengthens it)', () => {
    for (const e of ENEMIES)
      for (const a of e.attacks) {
        expect(a.telegraph, `${e.id}.${a.id}`).toBeGreaterThanOrEqual(0.4);
        expect(telegraphTime(a)).toBeGreaterThanOrEqual(0.4);
        expect(telegraphTime(a, true)).toBeCloseTo(Math.max(0.4, a.telegraph * 1.4), 5);
      }
  });
});

describe('combat rules: geometry, tokens, leash', () => {
  it('Bannlicht cone hit test (60°, 9 m)', () => {
    // yaw 0 looks to −z
    expect(inCone(0, 0, 0, 9, 60, 0, -8)).toBe(true);
    expect(inCone(0, 0, 0, 9, 60, 0, -9.5)).toBe(false);
    expect(inCone(0, 0, 0, 9, 60, 0, 5)).toBe(false);
    expect(inCone(0, 0, 0, 9, 60, 4, -6)).toBe(false); // 33.7° off axis
    expect(inCone(0, 0, 0, 9, 60, 3, -6)).toBe(true); // 26.6°
    // a big body at the edge still counts
    expect(inCone(0, 0, 0, 9, 60, 4, -6, 1.5)).toBe(true);
    // yaw 90° (left) looks to −x
    expect(inCone(0, 0, Math.PI / 2, 9, 60, -5, 0)).toBe(true);
  });

  it('lets at most two enemies attack at once (one in gentle mode)', () => {
    const t = new AttackTokens(AI.tokens);
    expect(t.request('a')).toBe(true);
    expect(t.request('b')).toBe(true);
    expect(t.request('c')).toBe(false);
    expect(t.request('a')).toBe(true);
    t.release('a');
    expect(t.request('c')).toBe(true);
    const g = new AttackTokens(AI.gentleTokens);
    expect(g.request('a')).toBe(true);
    expect(g.request('b')).toBe(false);
  });

  it('breaks the leash when the enemy or the player strays too far', () => {
    const home = { x: 0, z: 0 };
    expect(leashBroken(home, { x: 10, z: 0 }, { x: 12, z: 0 }, 40)).toBe(false);
    expect(leashBroken(home, { x: 41, z: 0 }, { x: 42, z: 0 }, 40)).toBe(true);
    expect(leashBroken(home, { x: 10, z: 0 }, { x: 60, z: 0 }, 40)).toBe(true);
  });
});

describe('combat rules: groups', () => {
  it('spawn requests are idempotent by group (kills survive a re-declare)', () => {
    const groups: Record<string, EnemyGroupState> = {};
    expect(upsertGroup(groups, { group: 'g', kind: 'nebelling', era: '1789', x: 1, z: 2, count: 3 })).toBe(true);
    groups['g']!.killed = 2;
    expect(upsertGroup(groups, { group: 'g', kind: 'nebelling', era: '1789', x: 1, z: 2, count: 3, quest: 'q' })).toBe(false);
    expect(groups['g']!.killed).toBe(2);
    expect(groups['g']!.quest).toBe('q');
    expect(Object.keys(groups)).toHaveLength(1);
  });

  it('never respawns a cleared group unless respawn is set', () => {
    const g: EnemyGroupState = { group: 'g', kind: 'nebelling', era: '1789', x: 0, z: 0, count: 2, killed: 2 };
    expect(shouldRespawn(g, 10, 1000)).toBe(false);
    expect(shouldRespawn({ ...g, respawn: 60 }, 10, 50)).toBe(false);
    expect(shouldRespawn({ ...g, respawn: 60 }, 10, 71)).toBe(true);
    expect(shouldRespawn({ ...g, killed: 1, respawn: 60 }, 10, 71)).toBe(false);
  });

  it('death resets unfinished groups, not cleared ones', () => {
    const groups: Record<string, EnemyGroupState> = {
      a: { group: 'a', kind: 'nebelling', era: '1789', x: 0, z: 0, count: 3, killed: 1 },
      b: { group: 'b', kind: 'nebelling', era: '1789', x: 0, z: 0, count: 2, killed: 2 },
    };
    expect(groupsToReset(groups)).toEqual(['a']);
  });

  it('a group shows only in its era and time of day', () => {
    expect(groupActive({ era: '1789' }, '1789', 'day')).toBe(true);
    expect(groupActive({ era: '1789' }, '1796', 'day')).toBe(false);
    expect(groupActive({ era: '1789', time: 'night' }, '1789', 'dusk')).toBe(false);
    expect(groupActive({ era: '1789', time: 'night' }, '1789', 'night')).toBe(true);
    expect(groupActive({ era: '1789', time: 'dusk' }, '1789', 'night')).toBe(true);
    expect(groupActive({ era: '1789', time: 'dusk' }, '1789', 'day')).toBe(false);
  });
});

describe('combat rules: bosses and safe zones', () => {
  it('boss phases at the HP thresholds', () => {
    expect(bossPhase(1, [0.66, 0.33])).toBe(1);
    // one hit never skips a phase: the floor sits just under the next line, none in the last phase
    expect(bossPhaseFloor(1, 1000, [0.66, 0.33])).toBe(659);
    expect(bossPhase(659 / 1000, [0.66, 0.33])).toBe(2);
    expect(bossPhaseFloor(2, 1000, [0.66, 0.33])).toBe(329);
    expect(bossPhaseFloor(3, 1000, [0.66, 0.33])).toBe(0);
    expect(bossPhase(0.66, [0.66, 0.33])).toBe(2);
    expect(bossPhase(0.5, [0.66, 0.33])).toBe(2);
    expect(bossPhase(0.2, [0.66, 0.33])).toBe(3);
    for (const id of ['schuldbuch', 'pikeur', 'strohmann', 'steinbrecher']) expect(enemyDef(id)!.phases).toHaveLength(2);
  });

  it('the Pikeur never reaches 0 and leaves at his floor', () => {
    let hp = 520;
    for (let i = 0; i < 100; i++) hp = applyDamage('pikeur', hp, 520, 60);
    expect(hp).toBeGreaterThan(0);
    expect(pikeurLeaves(hp, 520)).toBe(true);
    expect(applyDamage('schuldbuch', 10, 420, 60)).toBe(0);
  });

  it('weak points: the open seal, the Strohmann\'s back, the Steinbrecher\'s joints', () => {
    const base = { x: 0, z: 0, heading: 0, phase: 1, stun: 0, cd: {}, adds: 0 };
    const sb = { ...base, kind: 'schuldbuch', sealOpen: 0, attacks: enemyDef('schuldbuch')!.attacks };
    expect(bossHitMul(sb, { x: 0, z: -3 }, 'light').mul).toBeLessThan(0.5);
    expect(bossHitMul({ ...sb, sealOpen: 2 }, { x: 0, z: -3 }, 'light').weak).toBe(true);
    const st = { ...base, kind: 'strohmann', sealOpen: 0, attacks: enemyDef('strohmann')!.attacks };
    expect(bossHitMul(st, { x: 0, z: 3 }, 'light')).toMatchObject({ weak: true, mul: 1.6 });
    expect(bossHitMul(st, { x: 0, z: -3 }, 'light').armored).toBe(true);
    expect(chooseBossAttack({ ...sb, cd: {} }, 4)!.id).toBe('seitenschlag');
    expect(summonOf('steinbrecher', 3)).toEqual({ kind: 'grusling', n: 5 });
  });

  it('safe zones: station, memorials, disabled, talk, modal, NPC radius', () => {
    const base = { x: 1200, z: -1100, era: '1789' };
    expect(safeReason(base)).toBeNull();
    expect(safeReason({ ...base, disabled: true })).toBe('disabled');
    expect(safeReason({ ...base, talking: true })).toBe('talking');
    expect(safeReason({ ...base, modal: true })).toBe('modal');
    expect(safeReason({ x: STATION_XZ.x + 30, z: STATION_XZ.z, era: 'today' })).toBe('station');
    expect(safeReason({ x: STATION_XZ.x + 45, z: STATION_XZ.z, era: 'today' })).toBeNull();
    expect(safeReason({ ...base, memorials: [{ active: true, x: 1210, z: -1100, r: 20 }] })).toBe('memorial');
    expect(safeReason({ ...base, memorials: [{ active: false, x: 1210, z: -1100, r: 20 }] })).toBeNull();
    expect(safeReason({ ...base, memorials: [{ active: true, x: 1210, z: -1100, r: 20, era: '1796' }] })).toBeNull();
    expect(safeReason({ ...base, room: 'B06.1.festsaal', memorials: [{ active: true, room: 'B06.1.festsaal' }] })).toBe('memorial');
    expect(safeReason({ ...base, npcs: [{ x: 1204, z: -1100 }] })).toBe('npc');
    expect(safeReason({ ...base, npcs: [{ x: 1210, z: -1100 }] })).toBeNull();
    // a fight on: an NPC's bubble no longer stops it (the Schuldbuch healed next to Hanne)
    expect(safeReason({ ...base, engaged: true, npcs: [{ x: 1204, z: -1100 }] })).toBeNull();
    expect(safeReason({ ...base, engaged: true, modal: true })).toBe('modal');
  });
});

describe('combat simulation', () => {
  function sim(gentle = false) {
    const groups: Record<string, EnemyGroupState> = {};
    const s = new CombatSim(flat, groups, { gentle, reducedMotion: false, stats: deriveStats(null, { gentle }), sweep: false, konter: false, waerme: false, dritter: false });
    return { s, groups };
  }

  it('a Nebelling in front is undone by staff hits; the group clears and never comes back', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'n', kind: 'nebelling', era: '1789', x: 0, z: -2, count: 1 });
    s.step(1 / 60, input());
    expect(s.live()).toHaveLength(1);
    const e = s.live()[0]!;
    e.x = 0;
    e.z = -2;
    const evs = [...tap(s), ...tap(s), ...tap(s)];
    expect(evs.filter((v) => v.type === 'hit').length).toBeGreaterThanOrEqual(2);
    expect(evs.some((v) => v.type === 'killed')).toBe(true);
    expect(evs.some((v) => v.type === 'cleared')).toBe(true);
    expect(groups['n']!.killed).toBe(1);
    run(s, 3);
    expect(s.live()).toHaveLength(0);
  });

  it('cleave: one swing hits the nearest target fully, the next at half, and no more than the cap', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'm', kind: 'mahnbrief', era: '1789', x: 0, z: -2, count: 6, radius: 0.5 });
    s.step(1 / 60, input());
    // the pack's escort (a Nebelweber, combat/packs.ts) stands back: only the group is lined up
    const live = s.live().filter((e) => e.group === 'm');
    expect(live).toHaveLength(6);
    live.forEach((e, i) => {
      e.x = (i - 2.5) * 0.15;
      e.z = -1.6 - i * 0.05;
      e.y = 0;
      e.maxHp = e.hp = 500;
    });
    const hits = tap(s).filter((v) => v.type === 'hit') as { damage: number }[];
    expect(hits).toHaveLength(CLEAVE.light);
    const [a, b] = hits.map((h) => h.damage);
    expect(b!).toBeLessThan(a!);
    expect(b!).toBeCloseTo(a! * CLEAVE.falloff, -0.5);
  });

  it('an Irrlicht is immune until the Bannlicht, then falls and can be hit', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'i', kind: 'irrlicht', era: '1789', x: 0, z: -2, count: 1 });
    s.step(1 / 60, input());
    const e = s.live()[0]!;
    e.blinkT = 99;
    const a = tap(s);
    expect(a.some((v) => v.type === 'immune')).toBe(true);
    expect(e.hp).toBe(e.maxHp);
    e.x = 0;
    e.z = -2;
    const b = s.step(1 / 60, input({ bannPressed: true }));
    expect(b.some((v) => v.type === 'bann' && v.hits === 1)).toBe(true);
    expect(e.state).toBe('gebannt');
    e.x = 0;
    e.z = -2;
    const c = tap(s);
    expect(c.some((v) => v.type === 'hit')).toBe(true);
    expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('the attack-token limit holds in a crowd', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'm', kind: 'nebelling', era: '1789', x: 0, z: -3, count: 6, radius: 2 });
    let max = 0;
    s.p.god = true;
    for (let i = 0; i < 600; i++) {
      s.step(1 / 60, input());
      const attacking = s.live().filter((e) => e.state === 'windup' || e.state === 'strike' || e.state === 'recover').length;
      max = Math.max(max, attacking);
      expect(s.tokens.count).toBeLessThanOrEqual(2);
    }
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(2);
  });

  it('a dodge during the wind-up evades the hit (i-frames); a perfect dodge slows time', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'n', kind: 'nebelling', era: '1789', x: 0, z: -1.8, count: 1 });
    let evs = run(s, 0.1);
    const e = s.live()[0]!;
    // wait until its lunge is about to land
    for (let i = 0; i < 400 && !(e.state === 'windup' && e.windup - e.t <= 0.12); i++) evs = s.step(1 / 60, input());
    expect(e.state).toBe('windup');
    evs = s.step(1 / 60, input({ dodgePressed: true }));
    const dodge = evs.find((v) => v.type === 'dodge');
    expect(dodge && dodge.type === 'dodge' && dodge.perfect).toBe(true);
    expect(s.slowmo).toBeGreaterThan(0);
  });

  it('damage to 0 → died; nothing is lost and the group comes back whole', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'n', kind: 'nebelling', era: '1789', x: 0, z: -2, count: 3 });
    s.step(1 / 60, input());
    groups['n']!.killed = 1;
    const evs: ReturnType<CombatSim['step']> = [];
    for (let i = 0; i < 20 && !s.p.dead; i++) s.hurtPlayer(40, 'nebelling', { x: 0, z: -2 });
    evs.push(...s.step(1 / 60, input()));
    expect(s.p.dead).toBe(true);
    s.dematerialise();
    s.restore();
    expect(s.p.hp).toBe(s.p.max);
    run(s, 0.2);
    expect(groups['n']!.killed).toBe(1);
    expect(s.live().filter((e) => e.group === 'n')).toHaveLength(2);
    for (const e of s.live()) expect(e.hp).toBe(e.maxHp);
  });

  it('a boss restarts at phase 1 and shows its phases', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'b', kind: 'schuldbuch', era: '1789', x: 0, z: -3, count: 1, boss: true });
    s.step(1 / 60, input());
    const b = s.live()[0]!;
    // past its reveal (no harm during the intro)
    expect(b.state).toBe('intro');
    b.state = 'approach';
    b.hp = b.maxHp * 0.5;
    b.sealOpen = 3;
    b.x = 0;
    b.z = -2.5;
    const evs = tap(s);
    expect(evs.some((v) => v.type === 'phase' && v.phase === 2)).toBe(true);
    s.dematerialise();
    s.step(1 / 60, input());
    const again = s.live().find((e) => e.kind === 'schuldbuch')!;
    expect(again.phase).toBe(1);
    expect(again.hp).toBe(again.maxHp);
  });

  it('gentle mode: one attacker, lower HP, longer telegraphs', () => {
    const { s, groups } = sim(true);
    expect(s.tokens.max).toBe(1);
    upsertGroup(groups, { group: 'n', kind: 'nebelling', era: '1789', x: 0, z: -2, count: 1 });
    s.step(1 / 60, input());
    expect(s.live()[0]!.maxHp).toBe(Math.round(30 * 0.75));
  });

  it('no damage and no aggro in a safe zone', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'n', kind: 'nebelling', era: '1789', x: 0, z: -3, count: 1 });
    run(s, 2, { safe: 'station' });
    expect(s.live()[0]!.aggro).toBe(false);
    s.step(1 / 60, input({ safe: 'station' }));
    expect(s.hurtPlayer(20, 'x', { x: 0, z: -1 })).toBe(0);
  });

  it('caps active enemies at 12', () => {
    const { s, groups } = sim();
    upsertGroup(groups, { group: 'a', kind: 'grusling', era: '1789', x: 0, z: -10, count: 20 });
    s.step(1 / 60, input());
    expect(s.live().length).toBe(12);
    expect(BASE_STATS.maxHp).toBe(100);
  });
});
