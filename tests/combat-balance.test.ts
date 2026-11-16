/**
 * Combat balance at the intended build of each chapter (fun pass 2026-11-16; docs/ACTION-RPG.md
 * §5.4–§5.5). Two bots fight a chapter's standard encounter — the pack as content places it, with
 * the elite and the escorts combat adds — through the real simulation, on flat ground, with the
 * player's position integrated from walking, the dodge roll and the knock-backs:
 *
 *  - the **tank** faces the nearest enemy and swings, never dodges, never moves: it must lose at
 *    least 40 % of its Lebenskraft (or go down) — standing still and swinging is not a strategy;
 *  - the **dancer** reads the telegraphs (wind-ups, rings, bolts, landing rings) and rolls out of
 *    them, walks in to strike, uses the Bannlicht on the untouchable and the Wuchthieb on armour:
 *    it must win and keep some Lebenskraft.
 *
 * The prologue's first pack (the present, a tutorial: no elite, no escorts) asks less of the tank.
 */
import { describe, expect, it } from 'vitest';
import { deriveStats } from '../src/rpg/stats';
import type { EnemyGroupState } from '../src/rpg/types';
import { DODGE, HEAVY, headingOf, upsertGroup } from '../src/systems/combat/rules';
import { CombatSim, type Enemy, type SimInput } from '../src/systems/combat/sim';

const flat = { heightAt: () => 0 };

export interface Build {
  level: number;
  weapon: string;
  talents?: Record<string, number>;
}

export interface Encounter {
  kind: string;
  count: number;
  tier: number;
  era: string;
  /** Distance of the pack's spawn (m, straight ahead). */
  dist?: number;
}

export interface FightResult {
  seconds: number;
  lost: number;
  max: number;
  dead: boolean;
  killed: number;
  left: number;
  dodges: number;
  hitsTaken: number;
  kinds: string[];
}

/** A chapter's standard encounter at its intended build (levels, staff and talents per §6, §11). */
export const CHAPTERS: Record<string, { build: Build; enc: Encounter }> = {
  prolog: { build: { level: 2, weapon: 'item.stab.esche' }, enc: { kind: 'nebelling', count: 4, tier: 1, era: 'today' } },
  k1: { build: { level: 4, weapon: 'item.stab.eisen', talents: { 'stab.wucht': 1, 'stab.standfest': 1, 'laterne.weit': 1 } }, enc: { kind: 'streuner', count: 3, tier: 1, era: '1789' } },
  k2: { build: { level: 6, weapon: 'item.stab.eisen', talents: { 'stab.wucht': 2, 'stab.standfest': 1, 'laterne.weit': 1, 'feldbuch.atem': 1 } }, enc: { kind: 'streuner', count: 4, tier: 2, era: '1793-02' } },
  k3: { build: { level: 8, weapon: 'item.stab.silber', talents: { 'stab.wucht': 3, 'stab.dritter': 1, 'stab.standfest': 2, 'laterne.weit': 1 } }, enc: { kind: 'raffschatten', count: 4, tier: 3, era: '1793-07' } },
  k4: { build: { level: 10, weapon: 'item.stab.bann', talents: { 'stab.wucht': 3, 'stab.dritter': 1, 'stab.standfest': 2, 'stab.konter': 1, 'laterne.weit': 2 } }, enc: { kind: 'steinfresser', count: 3, tier: 4, era: '1796' } },
};

function live(sim: CombatSim): Enemy[] {
  return sim.live().filter((e) => e.state !== 'leave');
}

/** A telegraphed blow about to land on (px, pz): the direction to roll, or null. */
function threat(sim: CombatSim, px: number, pz: number): { x: number; z: number } | null {
  const away = (x: number, z: number) => {
    const l = Math.hypot(px - x, pz - z) || 1;
    return { x: (px - x) / l, z: (pz - z) / l };
  };
  const side = (vx: number, vz: number) => {
    const l = Math.hypot(vx, vz) || 1;
    return { x: -vz / l, z: vx / l };
  };
  for (const e of sim.enemies) {
    if (e.state === 'dissolve') continue;
    if (e.state === 'windup' && e.attack && e.attack.kind !== 'summon' && e.attack.kind !== 'ranged') {
      const left = e.windup - e.t;
      if (left > 0.2) continue;
      const a = e.attack;
      const d = Math.hypot(e.x - px, e.z - pz);
      if (a.kind === 'area') {
        for (const r of sim.rings) if (r.owner === e.id && Math.hypot(r.x - px, r.z - pz) <= r.r + 0.6) return away(r.x, r.z);
        continue;
      }
      // only what is aimed at us: the body faces the player
      const facing = Math.abs(Math.atan2(Math.sin(headingOf(px - e.x, pz - e.z) - e.heading), Math.cos(headingOf(px - e.x, pz - e.z) - e.heading)));
      if (facing > (a.kind === 'melee' ? 1.1 : 0.6)) continue;
      if ((a.kind === 'charge' || a.kind === 'lunge') && d <= a.range + e.radius + 1.6) {
        // roll across the line of the leap, to the side it is not already turning to
        const s = side(px - e.x, pz - e.z);
        return e.seed > 0.5 ? s : { x: -s.x, z: -s.z };
      }
      if (d <= a.range + 1.2) return away(e.x, e.z);
    }
    if (e.dash && !e.dash.hit && Math.hypot(e.x - px, e.z - pz) < Math.hypot(e.dash.vx, e.dash.vz) * 0.22 + e.radius + 0.8) return side(e.dash.vx, e.dash.vz);
  }
  for (const p of sim.projectiles) {
    if (p.lob) {
      if (p.life - p.t <= 0.24 && Math.hypot(p.tx - px, p.tz - pz) <= p.r + 0.5) return away(p.tx, p.tz);
      continue;
    }
    const d = Math.hypot(p.x - px, p.z - pz);
    const v = Math.hypot(p.vx, p.vz) || 1;
    const closing = (px - p.x) * p.vx + (pz - p.z) * p.vz > 0;
    if (closing && d / v <= 0.2) return side(p.vx, p.vz);
  }
  return null;
}

export function fight(build: Build, enc: Encounter, bot: 'tank' | 'dancer', o: { seconds?: number; gentle?: boolean } = {}): FightResult {
  const groups: Record<string, EnemyGroupState> = {};
  const stats = deriveStats({ level: build.level, talents: build.talents ?? {}, equipped: { weapon: build.weapon, charms: [] } }, { gentle: o.gentle });
  const t = build.talents ?? {};
  const sim = new CombatSim(flat, groups, { gentle: !!o.gentle, reducedMotion: false, stats, sweep: build.weapon === 'item.stab.lot', konter: (t['stab.konter'] ?? 0) > 0, waerme: (t['laterne.waerme'] ?? 0) > 0, dritter: (t['stab.dritter'] ?? 0) > 0 });
  upsertGroup(groups, { group: 'g', kind: enc.kind, era: enc.era as never, x: 0, z: -(enc.dist ?? 10), count: enc.count, radius: 3, tier: enc.tier });
  const dt = 1 / 30;
  let px = 0;
  let pz = 0;
  let push = { vx: 0, vz: 0, t: 0, dur: 1 };
  let cd = 0;
  let hold = -1;
  let dodges = 0;
  let hitsTaken = 0;
  let killed = 0;
  let sec = 0;
  const kinds = new Set<string>();
  const max = sim.p.max;
  const limit = o.seconds ?? 150;
  for (; sec < limit; sec += dt) {
    const L = live(sim);
    for (const e of L) kinds.add(e.elite ? `${e.kind}*` : e.kind);
    if (sec > 1 && !L.length) break;
    let yaw = 0;
    let moveX = 0;
    let moveZ = 0;
    let running = false;
    let press = false;
    let down = false;
    let bann = false;
    let dodge = false;
    cd -= dt;
    // the nearest enemy; the dancer prefers what it can hit (an untouchable light only with a charge)
    const near = (e: Enemy) => Math.hypot(e.x - px, e.z - pz);
    let target: Enemy | null = null;
    // the dancer goes for an opening (a recovering, stunned or staggered enemy) before the nearest
    const open = (e: Enemy) => e.state === 'recover' || e.state === 'gebannt' || e.state === 'stagger' || e.state === 'idle';
    const score = (e: Enemy) => near(e) - (bot === 'dancer' && open(e) && near(e) < 7 ? 4 : 0);
    for (const e of L) {
      if (bot === 'dancer' && e.def.needsBann && e.stun <= 0 && sim.p.bann < 1 && L.some((x) => !x.def.needsBann || x.stun > 0)) continue;
      if (!target || score(e) < score(target)) target = e;
    }
    if (target) yaw = headingOf(target.x - px, target.z - pz);
    const d = target ? near(target) : 99;
    if (bot === 'tank') {
      if (target && d < 3.4 && cd <= 0) {
        press = true;
        cd = 0.42;
      }
    } else if (target) {
      const th = sim.p.st.stamina >= 20 && !sim.p.st.exhausted && !sim.p.dodge ? threat(sim, px, pz) : null;
      if (th) {
        dodge = true;
        moveX = th.x;
        moveZ = th.z;
        hold = -1;
        dodges++;
      } else if (sim.p.bann >= 1 && cd <= 0 && L.filter((e) => e.stun <= 0 && near(e) < 6.5 && Math.abs(Math.atan2(Math.sin(headingOf(e.x - px, e.z - pz) - yaw), Math.cos(headingOf(e.x - px, e.z - pz) - yaw))) < 0.5).length >= 2) {
        // a pack in front: the Bannlicht holds them down for a moment
        bann = true;
        cd = 0.3;
      } else if (target.def.needsBann && target.stun <= 0) {
        if (d > 7) {
          moveX = (target.x - px) / d;
          moveZ = (target.z - pz) / d;
        } else if (sim.p.bann >= 1 && cd <= 0) {
          bann = true;
          cd = 0.3;
        }
      } else if (d > 2.2 + target.radius * 0.6) {
        // walk in on an opening, a caster or a far one; let the others come (they always do)
        const kiter = target.kind === 'nebelweber' || target.kind === 'irrlicht';
        const meleeNear = L.some((e) => e !== target && !e.def.needsBann && e.kind !== 'nebelweber' && near(e) < 8);
        if (open(target) || (kiter && !meleeNear) || d > 8 || target.def.armor || sim.p.st.stamina >= sim.p.st.max * 0.7) {
          moveX = (target.x - px) / d;
          moveZ = (target.z - pz) / d;
          running = d > 5 && sim.p.st.stamina > 50;
        }
      } else if (sim.p.st.stamina > (open(target) ? 25 : 45)) {
        const armoured = !!target.def.armor && target.armorBroken <= 0;
        const finish = target.elite && target.finishable;
        if (armoured || finish) {
          if (hold < 0 && cd <= 0) {
            hold = 0;
            press = true;
            down = true;
          } else if (hold >= 0) {
            hold += dt;
            down = hold < HEAVY.min + 0.08;
            if (!down) {
              hold = -1;
              cd = 0.35;
            }
          }
        } else if (cd <= 0) {
          press = true;
          cd = 0.42;
        }
      }
    }
    const inp: SimInput = { x: px, y: 0, z: pz, yaw, moveX, moveZ, attackDown: down, attackPressed: press, bannPressed: bann, dodgePressed: dodge, running, blocked: false, safe: null, era: enc.era, time: 'night' };
    for (const ev of sim.step(dt, inp)) {
      if (ev.type === 'killed' && ev.e.group === 'g') killed++;
      if (ev.type === 'dodge') push = { vx: ev.vx, vz: ev.vz, t: DODGE.dur, dur: DODGE.dur };
      if (ev.type === 'playerHit') {
        hitsTaken++;
        if (!sim.p.dodge) push = { vx: ev.pushX, vz: ev.pushZ, t: 0.25, dur: 0.25 };
      }
      if (ev.type === 'bump' && push.t <= 0) push = { vx: ev.vx, vz: ev.vz, t: 0.12, dur: 0.12 };
    }
    // the player's feet: walking (bots walk while not swinging) plus the decaying push
    const speed = sim.p.swing ? 1.2 : running ? 6.2 : 3.2;
    px += moveX * speed * sim.moveScale * dt;
    pz += moveZ * speed * sim.moveScale * dt;
    if (push.t > 0) {
      const k = push.t / push.dur;
      px += push.vx * k * dt;
      pz += push.vz * k * dt;
      push.t -= dt;
    }
    if (sim.p.dead) break;
  }
  return { seconds: Math.round(sec * 10) / 10, lost: Math.round(max - sim.p.hp), max, dead: sim.p.dead, killed, left: live(sim).length, dodges, hitsTaken, kinds: [...kinds].sort() };
}

describe('combat balance per chapter: face-tanking hurts, dancing wins', () => {
  for (const [ch, { build, enc }] of Object.entries(CHAPTERS)) {
    const need = ch === 'prolog' ? 0.2 : 0.4;
    it(`${ch}: ${enc.count} × ${enc.kind} (tier ${enc.tier}) at level ${build.level} — the tank loses ≥ ${need * 100} %`, () => {
      const r = fight(build, enc, 'tank');
      expect(r.dead || r.lost >= r.max * need, JSON.stringify(r)).toBe(true);
    });
    it(`${ch}: the dancer wins and keeps its feet`, () => {
      const r = fight(build, enc, 'dancer');
      expect(r.dead, JSON.stringify(r)).toBe(false);
      expect(r.killed, JSON.stringify(r)).toBe(enc.count);
      expect(r.left, JSON.stringify(r)).toBe(0);
      expect(r.lost, JSON.stringify(r)).toBeLessThan(r.max * 0.85);
      expect(r.dodges, JSON.stringify(r)).toBeGreaterThanOrEqual(2);
    });
  }

  it('a chapter fight takes a while and is a mixed pack with an elite (not one swing, not one kind)', () => {
    for (const ch of ['k1', 'k2', 'k3', 'k4']) {
      const { build, enc } = CHAPTERS[ch]!;
      const r = fight(build, enc, 'dancer');
      expect(r.seconds, `${ch} ${JSON.stringify(r)}`).toBeGreaterThan(9);
      expect(r.kinds.some((k) => k.endsWith('*')), `${ch} elite ${JSON.stringify(r)}`).toBe(true);
      expect(new Set(r.kinds.map((k) => k.replace('*', ''))).size, `${ch} mixed ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('gentle mode: even the tank gets through the K2 pack', () => {
    const { build, enc } = CHAPTERS.k2!;
    const r = fight(build, enc, 'tank', { gentle: true });
    expect(r.dead, JSON.stringify(r)).toBe(false);
  });
});
