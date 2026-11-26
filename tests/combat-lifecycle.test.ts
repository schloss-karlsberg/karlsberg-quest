import { describe, expect, it } from 'vitest';
import type { EnemyGroupState } from '../src/rpg/types';
import { CombatSim, type SimEvent, type SimInput } from '../src/systems/combat/sim';

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
    caster.time = 'night';
    const bystander = sim.spawnAt('irrlicht', 0, 8, { group: 'bystander', era: input.era })!;
    sim.sync(input.era, input.time, input.x, input.z);
    // Start both at the end of their windups so the shared attack cadence cannot stagger the shots.
    for (const enemy of sim.live()) {
      enemy.state = 'windup';
      enemy.attack = enemy.def.attacks[0]!;
      enemy.windup = enemy.attack.telegraph;
      enemy.t = enemy.windup;
    }
    sim.step(DT, input);
    const casterId = sim.live().find((enemy) => enemy.group === caster.group)!.id;
    const bystanderId = sim.live().find((enemy) => enemy.group === bystander.group)!.id;
    const removed = sim.projectiles.find((shot) => shot.owner === casterId);
    const surviving = sim.projectiles.find((shot) => shot.owner === bystanderId);
    expect(removed).toBeDefined();
    expect(surviving).toBeDefined();

    sim[remove](caster.group);
    expect(sim.live().map((enemy) => enemy.group)).toEqual(['bystander']);
    expect(sim.groups[caster.group]).toBe(remove === 'despawn' ? undefined : caster);
    expect(sim.projectiles.map((shot) => shot.id)).toEqual([surviving!.id]);

    // Stay in the line of fire. Daytime keeps the dematerialised caster from respawning.
    const events: SimEvent[] = [];
    for (let n = 0; n < 90; n++) events.push(...sim.step(DT, { ...input, time: 'day' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'impact', p: expect.objectContaining({ id: surviving!.id }), hitPlayer: true }));
    expect(events.filter((event) => event.type === 'playerHit')).toEqual([expect.objectContaining({ src: bystanderId })]);
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'impact', p: expect.objectContaining({ id: removed!.id }) }));
  });

  it.each(['despawn', 'dematerialise', 'despawn all'] as const)('%s cancels a pack’s pending falling stone', (remove) => {
    const sim = new CombatSim({ heightAt: () => 0 }, {});
    const stoneInput = { ...input, era: '1796' };
    const pack = sim.spawnAt('grusling', 0, -8, { group: 'pack', era: stoneInput.era, count: 4 })!;
    pack.time = 'night';
    sim.p.god = true;
    for (let n = 0; n < 720 && !sim.hazards.length; n++) sim.step(DT, stoneInput);
    expect(sim.hazards).toHaveLength(1);
    const hazard = sim.hazards[0]!;
    expect(hazard.kind).toBe('stone');
    expect(sim.rings).toContainEqual(expect.objectContaining({ id: hazard.ring }));
    expect(sim.projectiles).toContainEqual(expect.objectContaining({ kind: 'hazard.stein' }));

    // Removing an unrelated, materialised encounter leaves the warning active.
    sim.spawnAt('grusling', 0, -30, { group: 'bystander', era: stoneInput.era });
    sim.sync(stoneInput.era, stoneInput.time, stoneInput.x, stoneInput.z);
    expect(sim.live().some((enemy) => enemy.group === 'bystander')).toBe(true);
    sim.despawn('bystander');
    expect(sim.hazards).toEqual([hazard]);
    expect(sim.rings).toContainEqual(expect.objectContaining({ id: hazard.ring }));
    expect(sim.projectiles).toContainEqual(expect.objectContaining({ kind: 'hazard.stein' }));

    if (remove === 'dematerialise') {
      const other = sim.spawnAt('grusling', 0, -14, { group: 'other-pack', era: stoneInput.era, count: 3 })!;
      other.time = 'night';
      other.aggro = true;
      other.escorts = [];
      sim.sync(stoneInput.era, stoneInput.time, stoneInput.x, stoneInput.z);
      expect(sim.live().filter((enemy) => enemy.group === other.group && enemy.aggro)).toHaveLength(3);
    }

    if (remove === 'despawn all') sim.despawn('*');
    else sim[remove](pack.group);
    expect(new Set(sim.live().map((enemy) => enemy.group))).toEqual(new Set(remove === 'dematerialise' ? ['other-pack'] : []));
    const pending = { hazards: [...sim.hazards], rings: [...sim.rings], projectiles: [...sim.projectiles] };

    sim.p.god = false;
    const hp = sim.p.hp;
    const events: SimEvent[] = [];
    for (let n = 0; n < 120; n++) events.push(...sim.step(DT, { ...stoneInput, time: 'day' }));
    expect(sim.p.hp).toBe(hp);
    expect(events.some((event) => event.type === 'hazardHit' || event.type === 'playerHit')).toBe(false);
    expect(pending).toEqual({ hazards: [], rings: [], projectiles: [] });
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
