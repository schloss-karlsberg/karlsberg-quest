/**
 * Combat balance at the intended builds (playtest 2026-11-16: every regular fight was over in
 * seconds without a scratch). A dumb bot fights with real inputs through the simulation — it faces
 * the nearest enemy and taps the attack, never dodges, never uses the Bannlicht — and the fight must
 * take a while and cost some Lebenskraft, without being unwinnable.
 */
import { describe, expect, it } from 'vitest';
import { deriveStats } from '../src/rpg/stats';
import type { EnemyGroupState } from '../src/rpg/types';
import { upsertGroup } from '../src/systems/combat/rules';
import { CombatSim, type SimInput } from '../src/systems/combat/sim';

const flat = { heightAt: () => 0 };

function fight(o: { level: number; weapon: string; talents?: Record<string, number>; kind: string; count: number; tier: number; era: string; heavy?: boolean }) {
  const groups: Record<string, EnemyGroupState> = {};
  const stats = deriveStats({ level: o.level, talents: o.talents ?? {}, equipped: { weapon: o.weapon, charms: [] } });
  const sim = new CombatSim(flat, groups, { gentle: false, reducedMotion: false, stats, sweep: false, konter: false, waerme: false, dritter: false });
  upsertGroup(groups, { group: 'g', kind: o.kind, era: o.era as never, x: 0, z: -9, count: o.count, radius: 3, tier: o.tier });
  const dt = 1 / 30;
  let t = 0;
  let cd = 0;
  let killed = 0;
  const max = sim.p.max;
  for (; t < 120; t += dt) {
    const live = sim.live();
    let yaw = 0;
    if (live.length) {
      const e = live.reduce((a, b) => (Math.hypot(a.x, a.z) <= Math.hypot(b.x, b.z) ? a : b));
      // forward = (−sin yaw, −cos yaw)
      yaw = Math.atan2(-e.x, -e.z);
    }
    cd -= dt;
    const near = live.some((e) => Math.hypot(e.x, e.z) < 3.4);
    // light: a tap every 0.42 s · heavy: hold 1.0 s, release, breathe
    let press = false;
    let down = false;
    if (o.heavy) {
      if (cd <= 0 && near) {
        press = true;
        down = true;
        cd = 1.6;
      } else down = cd > 0.6;
    } else if (cd <= 0 && near) {
      press = true;
      cd = 0.42;
    }
    const inp: SimInput = { x: 0, y: 0, z: 0, yaw, moveX: 0, moveZ: 0, attackDown: down, attackPressed: press, bannPressed: false, dodgePressed: false, running: false, blocked: false, safe: null, era: o.era, time: 'day' };
    for (const ev of sim.step(dt, inp)) {
      if (ev.type === 'killed') killed++;
      if (process.env.KQ_DBG && (ev.type === 'swing' || ev.type === 'hit' || ev.type === 'whiff' || ev.type === 'tired')) console.log(t.toFixed(2), ev.type, (ev as { kind?: string }).kind, (ev as { damage?: number }).damage, (ev as { e?: { hp: number } }).e?.hp);
    }
    if (sim.p.dead || killed >= o.count) break;
  }
  return { seconds: t, lost: max - sim.p.hp, max, dead: sim.p.dead, killed };
}

describe('combat balance (a bot that never dodges)', () => {
  it('K2: four Streuner (tier 2) against level 6 with the iron Messstab take time and hurt', () => {
    const r = fight({ level: 6, weapon: 'item.stab.eisen', kind: 'streuner', count: 4, tier: 2, era: '1793-02' });
    expect(r.dead, JSON.stringify(r)).toBe(false);
    expect(r.killed).toBe(4);
    expect(r.seconds, JSON.stringify(r)).toBeGreaterThan(7);
    expect(r.lost, JSON.stringify(r)).toBeGreaterThan(r.max * 0.12);
  });

  it('K4: three Steinfresser (tier 4) against level 10 with the Bannstab punish face-tanking', () => {
    const r = fight({ level: 10, weapon: 'item.stab.bann', talents: { 'stab.wucht': 3 }, kind: 'steinfresser', count: 3, tier: 4, era: '1796', heavy: true });
    // standing in front of three of them and only swinging is not enough any more: the bot
    // either loses most of its Lebenskraft or goes down (playtest: one Wuchthieb killed all three)
    expect(r.killed, JSON.stringify(r)).toBeGreaterThanOrEqual(1);
    expect(r.seconds, JSON.stringify(r)).toBeGreaterThan(12);
    expect(r.lost, JSON.stringify(r)).toBeGreaterThan(r.max * 0.5);
  });
});
