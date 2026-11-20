/**
 * Fight metrics (`fightlog.ts`, `kq.combat.report()`) and a fast smoke test of the human-like
 * balance bot (`combat-human.ts`; the full ~50× table is `pnpm sim:combat`, docs/BALANCE.md).
 */
import { describe, expect, it } from 'vitest';
import { deriveStats } from '../src/rpg/stats';
import type { EnemyGroupState } from '../src/rpg/types';
import { FightLog, REACTION_S } from '../src/systems/combat/fightlog';
import { upsertGroup } from '../src/systems/combat/rules';
import { CombatSim, type SimInput } from '../src/systems/combat/sim';
import { CHAPTERS } from './combat-bots';
import { contentEncounters } from './combat-encounters';
import { cameraModel, humanFight } from './combat-human';

const feedback = { sound: true, particles: true, shake: true, numbers: true };

/** A player who stands still and swings at whatever is in front (the camera is a parameter). */
function standAndSwing(onScreen: (x: number, y: number, z: number) => boolean, seconds = 40) {
  const groups: Record<string, EnemyGroupState> = {};
  const stats = deriveStats({ level: 3, talents: {}, equipped: { weapon: 'item.stab.esche', charms: [] } }, {});
  const sim = new CombatSim({ heightAt: () => 0 }, groups, { gentle: false, reducedMotion: false, stats, sweep: false, konter: false, waerme: false, dritter: false });
  upsertGroup(groups, { group: 'g', kind: 'nebelling', era: 'today', x: 0, z: -6, count: 2, tier: 1, radius: 1 });
  const log = new FightLog();
  const dt = 1 / 30;
  let cd = 0;
  for (let t = 0; t < seconds && !sim.p.dead; t += dt) {
    cd -= dt;
    const press = cd <= 0 && sim.live().some((e) => Math.hypot(e.x, e.z) < 3);
    if (press) cd = 0.45;
    const near = sim.live().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    const yaw = near ? Math.atan2(-near.x, -near.z) : 0;
    const inp: SimInput = { x: 0, y: 0, z: 0, yaw, moveX: 0, moveZ: 0, attackDown: false, attackPressed: press, bannPressed: false, dodgePressed: false, running: false, blocked: false, safe: null, era: 'today', time: 'night' };
    log.observe(dt, sim.step(dt, inp), { sim, onScreen, feedback });
    if (t > 2 && !sim.live().length && !sim.enemies.length) break;
  }
  // a few quiet seconds so the log closes the fight
  for (let i = 0; i < 30; i++) log.observe(1 / 30, sim.step(1 / 30, { x: 0, y: 0, z: 0, yaw: 0, moveX: 0, moveZ: 0, attackDown: false, attackPressed: false, bannPressed: false, dodgePressed: false, running: false, blocked: false, safe: null, era: 'today', time: 'night' }), { sim, onScreen, feedback });
  return { log, sim };
}

describe('fight metrics (FightLog)', () => {
  it('cuts one fight from aggro to the last KO and measures it', () => {
    const { log } = standAndSwing(() => true);
    const r = log.report();
    expect(r.reaction).toBe(REACTION_S);
    expect(r.fights.length).toBe(1);
    const f = r.fights[0]!;
    expect(f.outcome).toBe('won');
    expect(f.kinds).toEqual({ nebelling: 2 });
    expect(f.timeToKill).toBeGreaterThan(1);
    expect(f.hitsTaken).toBeGreaterThan(0);
    expect(f.damageTaken).toBeCloseTo(f.hpStart - f.hpEnd, 0);
    // everything was in view: no unfair hit; every wind-up was measured
    expect(f.unfairHits).toBe(0);
    expect(f.windups['nebelling.lunge']!.min).toBeGreaterThanOrEqual(0.4);
    expect(f.windups['nebelling.lunge']!.belowReaction).toBe(0);
    // every staff hit froze the fight, flashed and (a small enemy) was knocked back
    expect(f.feedback.hits).toBeGreaterThan(2);
    expect(f.feedback.hitStop).toBe(f.feedback.hits);
    expect(f.feedback.flash).toBe(f.feedback.hits);
    expect(f.feedback.knockback).toBeGreaterThan(0);
    expect(f.feedback.hitStopMs).toBeGreaterThanOrEqual(60);
    expect(r.totals.won).toBe(1);
  });

  it('a blow whose attacker never was on screen is unfair (off screen)', () => {
    const { log } = standAndSwing(() => false);
    const t = log.report().totals;
    expect(t.hitsTaken).toBeGreaterThan(0);
    expect(t.unfairHits).toBe(t.hitsTaken);
    expect(t.unfair.offscreen).toBe(t.hitsTaken);
  });

  it('the player going down ends the fight as lost; reset clears it', () => {
    const { log, sim } = standAndSwing(() => true, 4);
    sim.hurtPlayer(9999, 'debug', { x: 0, z: -1 }, 1, false, { id: 'x', attack: 'y' });
    log.observe(1 / 30, [], { sim, onScreen: () => true, feedback });
    expect(log.report().fights.at(-1)!.outcome).toBe('lost');
    log.reset();
    expect(log.report().fights).toEqual([]);
  });

  it('the modelled camera sees ahead, not behind', () => {
    const see = cameraModel(0, 0, 0, 0);
    expect(see(0, 1, -6)).toBe(true);
    expect(see(0, 1, 6)).toBe(false);
    expect(see(-12, 1, -1)).toBe(false);
  });
});

describe('human-like bot (smoke)', () => {
  it('fights the prologue pack and a boss through the real simulation, deterministically per seed', () => {
    const enc = contentEncounters().find((c) => c.id === 'q.p.bussole.nebel')!;
    const a = humanFight(enc.build, enc.enc, 1);
    const b = humanFight(enc.build, enc.enc, 1);
    expect(a).toEqual(b);
    expect(a.won).toBe(true);
    expect(a.fights.length).toBeGreaterThan(0);
    expect(a.dodges).toBeGreaterThan(0);
    expect(a.dodgesOk).toBeLessThanOrEqual(a.dodges);
    const boss = humanFight(CHAPTERS.k3!.build, { kind: 'strohmann', count: 1, tier: 1, era: '1793-07' }, 3, { seconds: 30 });
    expect(boss.fights[0]?.boss).toBe('strohmann');
    expect(boss.learnt).not.toBeNull();
  });
});
