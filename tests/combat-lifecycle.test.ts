import { describe, expect, it } from 'vitest';
import type { EnemyGroupState } from '../src/rpg/types';
import { CombatSim, type SimInput } from '../src/systems/combat/sim';

const DT = 1 / 60;
const input: SimInput = {
  x: 0, y: 0, z: 0, yaw: 0, moveX: 0, moveZ: 0,
  attackDown: false, attackPressed: false, dodgePressed: false, bannPressed: false,
  running: false, blocked: false, noDodge: false, safe: null, era: '1789', time: 'night',
};

describe('combat encounter lifecycle', () => {
  it.each(['despawn', 'dematerialise'] as const)('%s clears the encounter’s airborne attack', (remove) => {
    const sim = new CombatSim({ heightAt: () => 0 }, {});
    const caster = sim.spawnAt('irrlicht', 0, -8, { group: 'caster', era: input.era })!;
    sim.spawnAt('nebelling', 0, -25, { group: 'bystander', era: input.era });
    for (let n = 0; n < 240 && !sim.projectiles.length; n++) sim.step(DT, input);
    const owner = sim.live().find((enemy) => enemy.group === caster.group)!;
    expect(sim.projectiles).toContainEqual(expect.objectContaining({ owner: owner.id }));

    sim[remove](caster.group);
    expect(sim.live().map((enemy) => enemy.group)).toEqual(['bystander']);
    expect(sim.groups[caster.group]).toBe(remove === 'despawn' ? undefined : caster);
    expect(sim.projectiles).toHaveLength(0);

    const events = sim.step(DT, { ...input, era: 'today' });
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'playerHit' }));
    expect(sim.p.hp).toBe(sim.p.max);
  });

  it('rebuilds saved groups with the earned kills and reached boss phase', () => {
    const world = { heightAt: () => 0 };
    const sim = new CombatSim(world, {});
    sim.spawnAt('nebelling', 0, -8, { group: 'quest-pack', era: input.era, count: 2 });
    const boss = sim.spawnAt('schuldbuch', 0, -24, { group: 'boss', era: input.era })!;
    sim.sync(input.era, input.time, 0, 0);
    const member = sim.live().find((enemy) => enemy.group === 'quest-pack')!;
    expect(sim.killNow(member.id)).toBe(1);
    boss.bossPhase = 2;
    const saved = JSON.parse(JSON.stringify(sim.groups)) as Record<string, EnemyGroupState>;
    const resumed = new CombatSim(world, saved);

    resumed.sync('today', input.time, 0, 0);
    expect(resumed.live()).toHaveLength(0);
    resumed.sync(input.era, input.time, 0, 0);
    expect(resumed.live().filter((enemy) => enemy.group === 'quest-pack')).toHaveLength(1);
    expect(resumed.groups['quest-pack']?.killed).toBe(1);
    const rebuiltBoss = resumed.live().find((enemy) => enemy.group === boss.group)!;
    expect(rebuiltBoss).toMatchObject({ phase: 2, attack: null });
    expect(rebuiltBoss.hp).toBe(Math.round(rebuiltBoss.maxHp * 0.66));
    expect(resumed.projectiles).toHaveLength(0);
  });

  // An in-flight lob currently outlives a defeated caster even though its landing ring is removed.
  it.todo('decide whether a lob should land with its warning after the caster is defeated');
});

describe('combat vitals', () => {
  it('refills empty Bannlicht one charge at a time and caps at full', () => {
    const sim = new CombatSim({ heightAt: () => 0 }, {});
    sim.step(DT, { ...input, bannPressed: true });
    sim.step(DT, { ...input, bannPressed: true });
    expect(sim.p.bann).toBe(0);
    expect(sim.step(DT, { ...input, bannPressed: true })).not.toContainEqual(expect.objectContaining({ type: 'bann' }));

    const recharge = sim.opt.stats.bannRecharge;
    sim.step(recharge - sim.p.bannT - 0.25, input);
    expect(sim.p.bann).toBe(0);
    sim.step(0.25, input);
    expect(sim.p.bann).toBe(1);
    sim.step(recharge, input);
    expect(sim.p.bann).toBe(2);
    sim.step(recharge, input);
    expect(sim.p.bann).toBe(2);
    expect(sim.p.bannT).toBe(0);
  });

  it('caps healing and emits only actual healing, and ignores it while down', () => {
    const sim = new CombatSim({ heightAt: () => 0 }, {});
    expect(sim.heal(45, 'test')).toBe(0);
    expect(sim.hurtPlayer(20, 'test', { x: 0, z: 1 })).toBe(20);
    expect(sim.heal(45, 'test')).toBe(20);
    expect(sim.p.hp).toBe(sim.p.max);
    const events = sim.step(DT, input);
    expect(events.filter((event) => event.type === 'heal')).toEqual([{ type: 'heal', amount: 20, by: 'test' }]);
    sim.hurtPlayer(200, 'test', { x: 0, z: 1 });
    expect(sim.p.dead).toBe(true);
    expect(sim.heal(45, 'test')).toBe(0);
    expect(sim.p.hp).toBe(0);
  });
});
