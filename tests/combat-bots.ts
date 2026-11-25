/**
 * Balance bots (docs/ACTION-RPG.md §5.4–§5.5): a chapter's standard encounter — the pack as content
 * places it, with the elite, the escorts, the second wave and the era's hazards combat adds — fought
 * through the real simulation on flat ground, the player's position integrated from walking, the
 * dodge roll, the Ausfall and the knock-backs. Not a test file itself (vitest picks up *.test.ts):
 * `combat-balance.test.ts` and probes import it.
 *
 *  - **tank**: faces the nearest enemy and swings, never moves, never dodges;
 *  - **masher** (combat variety pass): what a button-masher does — runs at the nearest enemy and
 *    hammers the attack key, flares the Bannlicht whenever it has a charge, never dodges, never uses
 *    an ability, never minds a ring on the ground;
 *  - **skilled**: reads the telegraphs and rolls out of them (and out of the hazards), takes the
 *    caller and the veil-weaver first, breaks a shield with a Wuchthieb or gets round it, cracks the
 *    mirror before it flares, tears veils with the Bannlicht, and uses the Ausfall, the Erdstoß and
 *    the Wirbel when they pay.
 */
import { deriveStats, MAX_LEVEL } from '../src/rpg/stats';
import type { EnemyGroupState } from '../src/rpg/types';
import { HEAVY, SKILLS, type SkillId, headingOf, inCone, isFrontal, skillsForLevel, upsertGroup, wrapAngle } from '../src/systems/combat/rules';
import { CombatSim, type Enemy, type SimInput } from '../src/systems/combat/sim';

const flat = { heightAt: () => 0 };

export type Bot = 'tank' | 'masher' | 'skilled';

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
  /** Content's pack overrides and binding (escorts, wave, aggro, veiled, quest …). */
  extra?: Partial<EnemyGroupState>;
}

export interface FightResult {
  seconds: number;
  lost: number;
  max: number;
  dead: boolean;
  /** Members of the content group undone. */
  killed: number;
  /** Everything undone (escorts, wave, called ones too). */
  undone: number;
  left: number;
  dodges: number;
  hitsTaken: number;
  kinds: string[];
  /** Abilities used, by id. */
  skills: Partial<Record<SkillId, number>>;
  /** Blows that bounced off a guard; Bannlicht thrown back; veils; calls; waves; hazards that hit you. */
  blocked: number;
  reflected: number;
  veils: number;
  calls: number;
  waves: number;
  hazardHits: number;
  /** Lebenskraft lost, by what dealt it. */
  hurtBy: Record<string, number>;
}

/** A chapter's standard encounter at its intended build (levels, staff and talents per §6, §11). */
export const CHAPTERS: Record<string, { build: Build; enc: Encounter }> = {
  k1: { build: { level: 4, weapon: 'item.stab.eisen', talents: { 'stab.wucht': 1, 'stab.standfest': 1, 'laterne.weit': 1 } }, enc: { kind: 'streuner', count: 3, tier: 1, era: '1789' } },
  k2: { build: { level: 6, weapon: 'item.stab.eisen', talents: { 'stab.wucht': 2, 'stab.standfest': 1, 'laterne.weit': 1, 'feldbuch.atem': 1 } }, enc: { kind: 'streuner', count: 4, tier: 2, era: '1793-02' } },
  k3: { build: { level: 8, weapon: 'item.stab.silber', talents: { 'stab.wucht': 3, 'stab.dritter': 1, 'stab.standfest': 2, 'laterne.weit': 1 } }, enc: { kind: 'raffschatten', count: 4, tier: 3, era: '1793-07' } },
  k4: { build: { level: 10, weapon: 'item.stab.bann', talents: { 'stab.wucht': 3, 'stab.dritter': 1, 'stab.standfest': 2, 'stab.konter': 1, 'laterne.weit': 2 } }, enc: { kind: 'steinfresser', count: 3, tier: 4, era: '1796' } },
};

function live(sim: CombatSim): Enemy[] {
  return sim.live().filter((e) => e.state !== 'leave');
}

const angleTo = (px: number, pz: number, yaw: number, e: { x: number; z: number }) => Math.abs(wrapAngle(headingOf(e.x - px, e.z - pz) - yaw));

/** A telegraphed blow (or a hazard) about to land on (px, pz): the direction to roll, or null. */
function threat(sim: CombatSim, px: number, pz: number): { x: number; z: number } | null {
  const away = (x: number, z: number) => {
    const l = Math.hypot(px - x, pz - z) || 1;
    return { x: (px - x) / l, z: (pz - z) / l };
  };
  const side = (vx: number, vz: number) => {
    const l = Math.hypot(vx, vz) || 1;
    return { x: -vz / l, z: vx / l };
  };
  for (const h of sim.hazards) if (h.dur - h.t <= 0.3 && Math.hypot(h.x - px, h.z - pz) <= h.r + 0.5) return away(h.x, h.z);
  for (const e of sim.enemies) {
    if (e.state === 'dissolve') continue;
    if (e.state === 'windup' && e.attack && e.attack.kind !== 'summon' && e.attack.kind !== 'ranged') {
      const left = e.windup - e.t;
      if (left > (e.attack.kind === 'lunge' || e.attack.kind === 'charge' ? 0.22 : 0.15)) continue;
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
    if (p.owner === 'hazard') continue;
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

/** A hazard ring filling up under (px, pz): the way out, or null. */
function inHazard(sim: CombatSim, px: number, pz: number): { x: number; z: number } | null {
  for (const h of sim.hazards) {
    const d = Math.hypot(px - h.x, pz - h.z);
    if (d <= h.r + 0.6) {
      const l = d || 1;
      return d < 0.05 ? { x: 1, z: 0 } : { x: (px - h.x) / l, z: (pz - h.z) / l };
    }
  }
  return null;
}

export function fight(build: Build, enc: Encounter, bot: Bot, o: { seconds?: number; gentle?: boolean; skills?: boolean } = {}): FightResult {
  const groups: Record<string, EnemyGroupState> = {};
  const stats = deriveStats({ level: build.level, talents: build.talents ?? {}, equipped: { weapon: build.weapon, charms: [] } }, { gentle: o.gentle });
  const t = build.talents ?? {};
  const skills = skillsForLevel(Math.min(MAX_LEVEL, build.level));
  const sim = new CombatSim(flat, groups, { gentle: !!o.gentle, reducedMotion: false, stats, sweep: build.weapon === 'item.stab.lot', konter: (t['stab.konter'] ?? 0) > 0, waerme: (t['laterne.waerme'] ?? 0) > 0, dritter: (t['stab.dritter'] ?? 0) > 0, skills });
  upsertGroup(groups, { radius: 3, ...enc.extra, group: 'g', kind: enc.kind, era: enc.era as never, x: 0, z: -(enc.dist ?? 10), count: enc.count, tier: enc.tier });
  const useSkills = bot === 'skilled' && o.skills !== false;
  const dt = 1 / 30;
  let px = 0;
  let pz = 0;
  let push = { vx: 0, vz: 0, t: 0, dur: 1 };
  let cd = 0;
  let bannCd = 0;
  let hold = -1;
  const r: FightResult = { seconds: 0, lost: 0, max: sim.p.max, dead: false, killed: 0, undone: 0, left: 0, dodges: 0, hitsTaken: 0, kinds: [], skills: {}, blocked: 0, reflected: 0, veils: 0, calls: 0, waves: 0, hazardHits: 0, hurtBy: {} };
  const kinds = new Set<string>();
  const limit = o.seconds ?? 150;
  let sec = 0;
  for (; sec < limit; sec += dt) {
    const L = live(sim);
    for (const e of L) kinds.add(e.elite ? `${e.kind}*` : e.kind);
    if (sec > 1 && !L.length && !sim.enemies.some((e) => e.state !== 'dissolve')) break;
    let yaw = 0;
    let moveX = 0;
    let moveZ = 0;
    let running = false;
    let press = false;
    let down = false;
    let bann = false;
    let dodge = false;
    let skill: SkillId | null = null;
    cd -= dt;
    bannCd -= dt;
    const near = (e: Enemy) => Math.hypot(e.x - px, e.z - pz);
    const open = (e: Enemy) => e.state === 'recover' || e.state === 'gebannt' || e.state === 'stagger' || e.state === 'idle';
    const untouchable = (e: Enemy) => e.def.needsBann === true && e.stun <= 0;
    let target: Enemy | null = null;
    if (bot === 'skilled') {
      // the caller and the veil-weaver first, then an opening, then the nearest
      const score = (e: Enemy) => {
        let s = near(e);
        if (e.kind === 'rufer' && near(e) < 12) s -= 6;
        if (e.kind === 'nebelweber' && near(e) < 9) s -= 3;
        if (open(e) && near(e) < 7) s -= 4;
        if (e.ward > 0) s += 3;
        if (untouchable(e) && sim.p.bann < 1) s += 50;
        return s;
      };
      for (const e of L) if (!target || score(e) < score(target)) target = e;
    } else for (const e of L) if (!target || near(e) < near(target)) target = e;
    if (target) yaw = headingOf(target.x - px, target.z - pz);
    const d = target ? near(target) : 99;
    if (bot === 'tank') {
      if (target && d < 3.4 && cd <= 0) {
        press = true;
        cd = 0.42;
      }
    } else if (bot === 'masher') {
      if (target) {
        if (d > 2.2 + target.radius * 0.6) {
          moveX = (target.x - px) / d;
          moveZ = (target.z - pz) / d;
          running = d > 4;
        }
        if (d < 3.6 && cd <= 0) {
          press = true;
          cd = 0.14;
        }
        // the flare whenever there is a charge and something in front
        if (sim.p.bann >= 1 && bannCd <= 0 && L.some((e) => near(e) < 7 && angleTo(px, pz, yaw, e) < 0.5)) {
          bann = true;
          bannCd = 0.6;
        }
      }
    } else if (target) {
      const out = inHazard(sim, px, pz);
      const th = sim.p.st.stamina >= 20 && !sim.p.st.exhausted && !sim.p.dodge && !sim.p.skill ? threat(sim, px, pz) : null;
      const ready = (id: SkillId) => useSkills && sim.skillReady(id) === 'ok' && sim.p.st.stamina >= SKILLS[id].cost + 20;
      const close = L.filter((e) => near(e) < 4.2 && !untouchable(e));
      const guarded = (e: Enemy) => !!e.def.guard && e.guardBroken <= 0 && !open(e) && e.state !== 'windup' && isFrontal(e, { x: px, z: pz });
      const mirrorInCone = L.some((e) => e.def.reflectsBann && !e.cracked && inCone(px, pz, yaw, sim.opt.stats.bannRange, sim.opt.stats.bannAngle, e.x, e.z, e.radius));
      if (th) {
        dodge = true;
        moveX = th.x;
        moveZ = th.z;
        hold = -1;
        r.dodges++;
      } else if (out && hold < 0) {
        // walk out of the ring before it lands
        moveX = out.x;
        moveZ = out.z;
        running = true;
      } else if (ready('erdstoss') && (close.length >= 2 || close.some(guarded) || L.some((e) => e.kind === 'rufer' && e.state === 'windup' && near(e) < 4.5))) {
        skill = 'erdstoss';
      } else if (ready('wirbel') && L.filter((e) => near(e) < 3.2 && !untouchable(e) && !guarded(e)).length >= 2) {
        skill = 'wirbel';
      } else if (ready('ausfall') && ((d > 3.5 && d < 8.5 && (target.kind === 'rufer' || target.kind === 'nebelweber' || open(target))) || (guarded(target) && d < 4.5))) {
        // straight at the caller, or past the shield to its back
        skill = 'ausfall';
      } else if (sim.p.bann >= 1 && cd <= 0 && !mirrorInCone && (L.some((e) => e.ward > 0 && near(e) < 7 && angleTo(px, pz, yaw, e) < 0.5) || (untouchable(target) && d < 7) || L.filter((e) => e.stun <= 0 && near(e) < 6.5 && angleTo(px, pz, yaw, e) < 0.5).length >= 3)) {
        bann = true;
        cd = 0.3;
      } else if (sim.p.st.stamina < 42 && !open(target) && close.length >= 1) {
        // out of breath: back off from the pack until the next roll is there
        let ax = 0;
        let az = 0;
        for (const e of close) {
          ax += (px - e.x) / (near(e) || 1);
          az += (pz - e.z) / (near(e) || 1);
        }
        const l = Math.hypot(ax, az) || 1;
        moveX = ax / l;
        moveZ = az / l;
      } else if (untouchable(target)) {
        if (d > 6) {
          moveX = (target.x - px) / d;
          moveZ = (target.z - pz) / d;
        } else if (mirrorInCone) {
          // step round so the mirror is out of the cone
          moveX = -(target.z - pz) / d;
          moveZ = (target.x - px) / d;
        }
      } else if (d > 2.2 + target.radius * 0.6) {
        const kiter = target.kind === 'nebelweber' || target.kind === 'irrlicht' || target.kind === 'rufer';
        const crowd = L.filter((e) => near(e) < 4 && !e.def.needsBann && e.kind !== 'nebelweber' && e.kind !== 'rufer').length;
        if (open(target) || kiter || crowd < 3 || d > 8 || target.def.armor || sim.p.st.stamina >= sim.p.st.max * 0.6) {
          moveX = (target.x - px) / d;
          moveZ = (target.z - pz) / d;
          running = d > 8 && sim.p.st.stamina > 60;
        }
      } else if (sim.p.st.stamina > (open(target) ? 30 : 42)) {
        const armoured = !!target.def.armor && target.armorBroken <= 0;
        const finish = target.elite && target.finishable;
        const mirror = !!target.def.reflectsBann && !target.cracked;
        if (armoured || finish || guarded(target) || mirror) {
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
    const inp: SimInput = { x: px, y: 0, z: pz, yaw, moveX, moveZ, attackDown: down, attackPressed: press, bannPressed: bann, dodgePressed: dodge, running, blocked: false, safe: null, era: enc.era, time: 'night', skill };
    for (const ev of sim.step(dt, inp)) {
      if (ev.type === 'killed') {
        if (ev.e.group === 'g') r.killed++;
        if (ev.by !== 'env') r.undone++;
      }
      if (ev.type === 'dodge') push = { vx: ev.vx, vz: ev.vz, t: ev.dur, dur: ev.dur };
      if (ev.type === 'step') push = { vx: ev.vx, vz: ev.vz, t: ev.dur, dur: ev.dur };
      if (ev.type === 'skill') {
        r.skills[ev.id] = (r.skills[ev.id] ?? 0) + 1;
        if (ev.vx || ev.vz) push = { vx: ev.vx, vz: ev.vz, t: ev.dur, dur: ev.dur };
      }
      if (ev.type === 'playerHit') {
        r.hitsTaken++;
        r.hurtBy[ev.by] = Math.round((r.hurtBy[ev.by] ?? 0) + ev.damage);
        if (!sim.p.dodge && !sim.p.skill) push = { vx: ev.pushX, vz: ev.pushZ, t: 0.25, dur: 0.25 };
      }
      if (ev.type === 'bump' && push.t <= 0) push = { vx: ev.vx, vz: ev.vz, t: 0.12, dur: 0.12 };
      if (ev.type === 'blocked') r.blocked++;
      if (ev.type === 'reflect') r.reflected++;
      if (ev.type === 'ward') r.veils++;
      if (ev.type === 'call') r.calls++;
      if (ev.type === 'waveIncoming') r.waves++;
      if (ev.type === 'hazardHit' && ev.player) r.hazardHits++;
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
  r.seconds = Math.round(sec * 10) / 10;
  r.lost = Math.round(r.max - sim.p.hp);
  r.dead = sim.p.dead;
  r.left = live(sim).length;
  r.kinds = [...kinds].sort();
  return r;
}
