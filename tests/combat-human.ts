/**
 * A headless, human-like player for balance numbers (docs/NEXT-SESSION.md §3.2, docs/BALANCE.md).
 * Not a test file itself: `pnpm sim:combat` (scripts/sim-combat.ts) runs it ~50× per encounter and
 * `combat-human.test.ts` smoke-tests it.
 *
 * Real game code: the whole fight is the game's own `CombatSim` (enemy AI, packs, elites, escorts,
 * waves, hazards, bosses and their phases, tokens, telegraphs, projectiles, the player's moveset,
 * stamina, i-frames, hit-stop) with the player's real derived stats (`deriveStats`, level, staff,
 * talents) and the fight metrics of `FightLog` (the same class `kq.combat.report()` uses).
 *
 * Modelled here (approximations, see docs/BALANCE.md §2): flat ground (no walls, no trees, the
 * Pikeur's dam is a 2 m strip of water), the player's feet (walk 3.2 / run 6.2 m/s, the roll and
 * knock-back pushes integrated as in `combat-bots.ts`), the over-the-shoulder camera (FOV 70°
 * at 16:9, boom 3.6 m plus the fight pull-back of `camera.ts`, shoulder 1.1 m) and the human:
 *
 *  - sees a wind-up when the attacker, its ground ring or its bolt is on screen, notices an
 *    off-screen one (sound, edge chevron) only `offscreenNotice` of the time and later;
 *  - reacts `reaction` s (250 ms) after seeing it, plus Gaussian jitter (σ 60 ms), and times the roll
 *    for the moment it expects the blow (aiming for the middle of the i-frames, σ 70 ms);
 *  - misreads or ignores `misread` (15 %) of the telegraphs it does see;
 *  - aims with a wandering error (σ 12°, the game's soft aim assist covers 25°) and keeps an
 *    imprecise distance;
 *  - uses the real moveset: Hieb combos, the Wuchthieb (on what it has learnt is armoured or
 *    guarded, and now and then anyway), the roll (Atem permitting), the Bannlicht (once the game
 *    has told it a thing needs it, or by habit when the cone is full), the abilities its level knows,
 *    and Balsam below 35 % (a limited number, at most one per 2 s, the real 0.6 s drink lock);
 *  - learns a boss's way in only from what the game shows: the hint caption after the reveal
 *    (`BOSS_HINT`, read with 85 % probability) or the "Vorne prallt alles ab" caption after four
 *    bounces (`bossWayAfter`). `hint: 'bounce'` misses the title caption (learns only from the
 *    bounces), `hint: 'never'` never learns it — to see what each hint is worth.
 */
import { deriveStats, MAX_LEVEL } from '../src/rpg/stats';
import type { EnemyGroupState } from '../src/rpg/types';
import { FightLog, type FightRecord } from '../src/systems/combat/fightlog';
import { DODGE, HEAVY, SKILLS, type SkillId, forwardOf, headingOf, inCone, isFrontal, skillsForLevel, upsertGroup, wrapAngle } from '../src/systems/combat/rules';
import { BOSS_INTRO, CombatSim, type Enemy, type SimInput } from '../src/systems/combat/sim';
import { BOSS_BOUNCE_AFTER } from '../src/systems/combat/strings';
import type { Build, Encounter } from './combat-bots';

export interface HumanProfile {
  /** Reaction time (s) and its Gaussian jitter (σ, s). */
  reaction: number;
  jitter: number;
  /** Share of seen telegraphs misread or ignored. */
  misread: number;
  /** Share of off-screen wind-ups noticed anyway (sound, chevrons), and the extra delay (s). */
  offscreenNotice: number;
  offscreenDelay: number;
  /** Aim error σ (degrees). */
  aimDeg: number;
  /** Timing error σ of the roll against the expected blow (s). */
  timing: number;
  /** Balsam in the pocket. */
  balsam: number;
  /** Chance to read a boss hint caption. */
  readHint: number;
  /** Flares by habit when the charges are full and two or more enemies are in the cone. */
  habitFlare: boolean;
  /** Bounces in a row before the game says the way in (strings.ts `BOSS_BOUNCE_AFTER`: 2). */
  bossWayAfter: number;
}

export const HUMAN: HumanProfile = { reaction: 0.25, jitter: 0.06, misread: 0.15, offscreenNotice: 0.3, offscreenDelay: 0.15, aimDeg: 12, timing: 0.07, balsam: 2, readHint: 0.85, habitFlare: true, bossWayAfter: BOSS_BOUNCE_AFTER };

export interface HumanResult {
  won: boolean;
  dead: boolean;
  seconds: number;
  hp: number;
  max: number;
  /** All the fights the log cut (usually one). */
  fights: FightRecord[];
  /** Summed over the fights. */
  hitsTaken: number;
  unfair: number;
  damageTaken: number;
  dodges: number;
  dodgesOk: number;
  timeToKill: number | null;
  /** Unfair hits by `kind.attack`. */
  unfairBy: Record<string, number>;
  /** Damage by `kind.attack`. */
  hurtBy: Record<string, number>;
  /** Did the bot learn the boss's way in (and when, s)? */
  learnt: number | null;
  balsamUsed: number;
  /** Boss: staff blows thrown back by its armour or seal ("Abgeprallt"). */
  bounced: number;
  /** Boss: blows during its reveal or phase roar (the game shows the "immune" glance and caption). */
  bossImmune: number;
}

export interface HumanOpts {
  seconds?: number;
  profile?: Partial<HumanProfile>;
  /** How the boss's way in can be learnt: the caption after the title (and the bounce caption), only the bounce caption, or never. */
  hint?: 'title' | 'bounce' | 'never';
}

// ---- small helpers ----------------------------------------------------------------------------

/** mulberry32: a seeded RNG (0..1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number): number {
  const u = Math.max(1e-9, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/** Horizontal half field of view of the 70° (vertical) camera at 16:9. */
const H_HALF = Math.atan(Math.tan((35 * Math.PI) / 180) * (16 / 9));
const SHOULDER_FIGHT = 1.1;
const BOOM = 3.6;

/** The modelled over-the-shoulder camera: is (x, z) in the picture? */
export function cameraModel(px: number, pz: number, yaw: number, pull: number): (x: number, y: number, z: number) => boolean {
  const f = forwardOf(yaw);
  const rx = -f.z;
  const rz = f.x;
  // right of the forward (−sin, −cos) is (cos, −sin): (−f.z, f.x) = (cos h, −sin h)
  const boom = BOOM + pull;
  const cx = px - f.x * boom + rx * SHOULDER_FIGHT;
  const cz = pz - f.z * boom + rz * SHOULDER_FIGHT;
  return (x, _y, z) => {
    const vx = x - cx;
    const vz = z - cz;
    const fw = vx * f.x + vz * f.z;
    if (fw < 0.3) return false;
    const lat = vx * rx + vz * rz;
    return Math.abs(Math.atan2(lat, fw)) <= H_HALF * 0.95;
  };
}

/** The fight pull-back of camera.ts (enemies within 16 m fit the frame; a boss adds its size). */
function pullFor(sim: CombatSim, px: number, pz: number): number {
  let spread = 0;
  let boss = 0;
  for (const e of sim.enemies) {
    if (!e.aggro || e.state === 'dissolve') continue;
    const d = Math.hypot(e.x - px, e.z - pz) + e.radius;
    if (d <= 16) spread = Math.max(spread, d);
    if (e.boss) boss = Math.max(boss, e.radius);
  }
  let pull = spread > 0 ? Math.min(3.4, 0.8 + Math.max(0, spread - 2.5) * 0.32) : 0;
  if (boss) pull = Math.max(pull, Math.min(4.5, 1.2 + boss * 0.6));
  return pull;
}

interface Threat {
  id: string;
  /** Sim time the human acts (rolls or steps). */
  at: number;
  dir: { x: number; z: number };
  /** Expected moment of the blow (s). */
  impact: number;
}

/** A human (see the file comment) fights `enc` at `build`; `seed` varies the human and the approach. */
export function humanFight(build: Build, enc: Encounter, seed: number, o: HumanOpts = {}): HumanResult {
  const P: HumanProfile = { ...HUMAN, ...o.profile };
  const R = rng(seed * 7919 + 17);
  const groups: Record<string, EnemyGroupState> = {};
  const t = build.talents ?? {};
  const stats = deriveStats({ level: build.level, talents: t, equipped: { weapon: build.weapon, charms: [] } }, {});
  const skills = skillsForLevel(Math.min(MAX_LEVEL, build.level));
  const isBoss = ['schuldbuch', 'pikeur', 'strohmann', 'steinbrecher'].includes(enc.kind);
  // the Pikeur's arena: a dam with an overflow, here a 2 m strip of running water at x = 7
  const water = enc.kind === 'pikeur' ? (x: number) => Math.abs(x - 7) < 1 : null;
  const world = { heightAt: () => 0, ...(water ? { isWater: (x: number) => water(x) } : {}) };
  const sim = new CombatSim(world, groups, { gentle: false, reducedMotion: false, stats, sweep: build.weapon === 'item.stab.lot', konter: (t['stab.konter'] ?? 0) > 0, waerme: (t['laterne.waerme'] ?? 0) > 0, dritter: (t['stab.dritter'] ?? 0) > 0, skills });
  // the approach varies: 8–12 m, ±25° off straight ahead
  const dist = (enc.dist ?? 10) + (R() - 0.5) * 4;
  const ang = (R() - 0.5) * 0.9;
  upsertGroup(groups, { radius: 3, ...enc.extra, group: 'g', kind: enc.kind, era: enc.era as never, x: Math.sin(ang) * dist, z: -Math.cos(ang) * dist, count: enc.count, tier: enc.tier, ...(isBoss ? { boss: true } : {}) });
  const log = new FightLog();
  const dt = 1 / 30;
  let px = 0;
  let pz = 0;
  let camYaw = 0;
  let push = { vx: 0, vz: 0, t: 0, dur: 1 };
  let aimErr = 0;
  let aimT = 0;
  let cd = 0;
  let hold = -1;
  let holdFor = 0;
  let balsam = P.balsam;
  let lastBalsam = -99;
  let skillT = 0;
  let habitT = 0;
  let distErr = 0;
  // what the human has learnt from the game's own feedback
  const needsBann = new Set<string>();
  const armoured = new Set<string>();
  const mirrors = new Set<string>();
  let wayIn: number | null = null;
  let hintAt = -1;
  let bounces = 0;
  let bounced = 0;
  let bossImmune = 0;
  const threats: Threat[] = [];
  /** Wind-ups already judged (seen / missed / misread): enemy id → wind-up start. */
  const judged = new Map<string, number>();
  const pendingOff = new Map<string, number>();
  const unfairBy: Record<string, number> = {};
  const hurtBy: Record<string, number> = {};
  const limit = o.seconds ?? (isBoss ? 240 : 150);
  let sec = 0;
  let won = false;

  const live = () => sim.live().filter((e) => e.state !== 'leave');
  const near = (e: { x: number; z: number }) => Math.hypot(e.x - px, e.z - pz);
  const touch = (e: Enemy) => !((e.def.needsBann && e.stun <= 0) || e.veil);

  /** When a seen wind-up of e will hurt, and which way to roll. */
  function plan(e: Enemy, seenAt: number): Threat | null {
    const a = e.attack;
    if (!a || a.damage <= 0 || a.kind === 'summon') return null;
    const end = sim.time + (e.windup - e.t);
    const d = near(e);
    const away = (x: number, z: number) => {
      const l = Math.hypot(px - x, pz - z) || 1;
      return { x: (px - x) / l, z: (pz - z) / l };
    };
    const side = (x: number, z: number) => {
      const l = Math.hypot(px - x, pz - z) || 1;
      const s = R() < 0.5 ? 1 : -1;
      return { x: (-(pz - z) / l) * s, z: ((px - x) / l) * s };
    };
    let impact = end;
    let dir = away(e.x, e.z);
    switch (a.kind) {
      case 'melee':
        if (d > a.range + e.radius + 2) return null;
        break;
      case 'area': {
        const ring = sim.rings.find((r) => r.owner === e.id);
        if (ring && Math.hypot(ring.x - px, ring.z - pz) > ring.r + 1.2) return null;
        if (ring) dir = away(ring.x, ring.z);
        break;
      }
      case 'lunge':
        if (d > a.range + e.radius + 3) return null;
        impact = end + Math.min(0.22, d / 20);
        dir = side(e.x, e.z);
        break;
      case 'charge':
        impact = end + Math.max(0, d - e.radius) / 16;
        dir = side(e.x, e.z);
        break;
      case 'ranged': {
        const lob = e.kind === 'steinbrecher' || a.id === 'frostkugel' || a.id === 'brocken';
        impact = end + (lob ? (e.kind === 'steinbrecher' ? 1.15 : 1.05) : d / (e.kind === 'irrlicht' ? 13 : a.id === 'eisnadel' ? 18 : 15));
        dir = side(e.x, e.z);
        break;
      }
    }
    const react = seenAt + Math.max(0.12, P.reaction + gauss(R) * P.jitter);
    // aim the roll so the blow falls in the middle of the i-frames (0.08–0.33 s into it)
    const ideal = impact - (DODGE.iStart + DODGE.iEnd) / 2 + gauss(R) * P.timing;
    // aim error on the direction too
    const k = gauss(R) * 0.35;
    const c = Math.cos(k);
    const s = Math.sin(k);
    return { id: e.id, at: Math.max(react, ideal), dir: { x: dir.x * c - dir.z * s, z: dir.x * s + dir.z * c }, impact };
  }

  for (; sec < limit; sec += dt) {
    const L = live();
    if (sec > 1 && !L.length && !sim.enemies.some((e) => e.state !== 'dissolve')) {
      won = true;
      break;
    }
    const pull = pullFor(sim, px, pz);
    const onScreen = cameraModel(px, pz, camYaw, pull);
    // ---- perception: wind-ups seen (or heard) become planned rolls
    for (const e of sim.enemies) {
      if (e.state !== 'windup' || !e.attack) continue;
      const start = sim.time - e.t;
      if (judged.get(e.id) === start) continue;
      const vis = onScreen(e.x, e.y, e.z) || sim.rings.some((r) => r.owner === e.id && onScreen(r.x, 0, r.z));
      if (vis) {
        judged.set(e.id, start);
        if (R() < P.misread) continue;
        const th = plan(e, sim.time);
        if (th) threats.push(th);
      } else if (!pendingOff.has(e.id) || pendingOff.get(e.id) !== start) {
        pendingOff.set(e.id, start);
        if (R() < P.offscreenNotice) {
          judged.set(e.id, start);
          const th = plan(e, sim.time + P.offscreenDelay);
          if (th) threats.push(th);
        }
      }
    }
    // the boss's way in: the hint caption after the reveal (game: index.ts, BOSS_HINT)
    if ((o.hint ?? 'title') === 'title' && hintAt >= 0 && sim.time >= hintAt && wayIn === null) {
      hintAt = -1;
      if (R() < P.readHint) wayIn = sim.time;
    }
    habitT -= dt;
    skillT -= dt;
    cd -= dt;
    aimT -= dt;
    if (aimT <= 0) {
      aimErr = (gauss(R) * P.aimDeg * Math.PI) / 180;
      distErr = gauss(R) * 0.35;
      aimT = 0.35 + R() * 0.3;
    }
    let moveX = 0;
    let moveZ = 0;
    let running = false;
    let press = false;
    let down = false;
    let bann = false;
    let dodge = false;
    let skill: SkillId | null = null;
    // target: the nearest thing it can hurt, in front first
    const score = (e: Enemy) => near(e) + Math.abs(wrapAngle(headingOf(e.x - px, e.z - pz) - camYaw)) * 2 + (!touch(e) && !(needsBann.has(e.kind) && sim.p.bann >= 1) ? 40 : 0);
    let target: Enemy | null = null;
    for (const e of L) if (!target || score(e) < score(target)) target = e;
    const st = sim.p.st;
    const busy = !!sim.p.skill || sim.p.drink > 0;
    // ---- defence first: a roll that is due
    const due = threats.findIndex((th) => sim.time >= th.at);
    if (due >= 0) {
      const th = threats.splice(due, 1)[0]!;
      const stillComing = sim.enemies.some((e) => e.id === th.id && e.state !== 'dissolve' && (e.state === 'windup' || e.state === 'strike' || e.dash)) || sim.projectiles.some((p) => p.owner === th.id);
      // (out of Atem the roll is a stumble: shorter, short i-frames — a human still presses it)
      const dk = sim.dodgeKind();
      if (stillComing && dk && (dk === 'stumble' || (st.stamina >= 20 && !st.exhausted)) && !busy) {
        dodge = true;
        moveX = th.dir.x;
        moveZ = th.dir.z;
        hold = -1;
      }
    }
    for (let i = threats.length - 1; i >= 0; i--) if (sim.time > threats[i]!.impact + 0.5) threats.splice(i, 1);
    // hazard rings filling up underfoot: walk out (misread like a telegraph, decided once per ring)
    const hz = sim.hazards.find((h) => Math.hypot(px - h.x, pz - h.z) <= h.r + 0.6 && h.t > P.reaction && (h.ring * 9301 + seed) % 100 >= P.misread * 100);
    // Balsam below 35 %
    if (!dodge && balsam > 0 && sim.p.hp < sim.p.max * 0.35 && sim.time - lastBalsam >= 2 && !busy && !sim.p.dead) {
      balsam--;
      lastBalsam = sim.time;
      sim.drink();
      sim.heal(45 * stats.healing, 'item.balsam');
    }
    if (!dodge && target && !busy) {
      const d = near(target);
      const bearing = headingOf(target.x - px, target.z - pz);
      const boss = target.boss;
      let reach = 2.0 + target.radius * 0.6 + distErr;
      // where to stand: in reach, behind a frontal boss once it knows, across the water from the Pikeur
      let goal: { x: number; z: number } | null = null;
      if (boss && wayIn !== null && (target.kind === 'strohmann' || target.kind === 'steinbrecher')) {
        const f = forwardOf(target.heading);
        const r = target.radius + 1.3;
        const back = { x: target.x - f.x * r, z: target.z - f.z * r };
        if (isFrontal(target, { x: px, z: pz }) || Math.hypot(back.x - px, back.z - pz) > 1.5) {
          // walk round on the ring, not through the body
          const a = Math.atan2(pz - target.z, px - target.x);
          const ab = Math.atan2(back.z - target.z, back.x - target.x);
          const step = Math.sign(wrapAngle(ab - a)) * 0.6;
          goal = { x: target.x + Math.cos(a + step) * r, z: target.z + Math.sin(a + step) * r };
        }
      }
      if (boss && wayIn !== null && target.kind === 'pikeur' && target.stun <= 0 && d > 5) {
        // stand just east of the overflow with the rider to the west
        goal = { x: 9.2, z: Math.max(-12, Math.min(12, target.z * 0.5)) };
        if (Math.hypot(goal.x - px, goal.z - pz) < 0.6) goal = null;
        reach = 0;
      }
      if (hz) {
        moveX = (px - hz.x) / (Math.hypot(px - hz.x, pz - hz.z) || 1);
        moveZ = (pz - hz.z) / (Math.hypot(px - hz.x, pz - hz.z) || 1);
        running = true;
      } else if (goal) {
        const gl = Math.hypot(goal.x - px, goal.z - pz) || 1;
        moveX = (goal.x - px) / gl;
        moveZ = (goal.z - pz) / gl;
        running = gl > 3 && st.stamina > 50;
      } else if (d > reach && reach > 0) {
        moveX = (target.x - px) / d;
        moveZ = (target.z - pz) / d;
        running = d > 7 && st.stamina > 55;
      }
      const inFront = Math.abs(wrapAngle(bearing - camYaw)) < 0.45;
      const cone = (e: Enemy) => inCone(px, pz, camYaw, stats.bannRange, stats.bannAngle, e.x, e.z, e.radius);
      const mirrorInCone = L.some((e) => mirrors.has(e.kind) && e.def.reflectsBann && !e.cracked && cone(e));
      const ready = (id: SkillId) => skills.includes(id) && sim.skillReady(id) === 'ok' && st.stamina >= SKILLS[id].cost + 15;
      const close = L.filter((e) => near(e) < 4 && touch(e));
      // the Bannlicht: what it has been told needs it, the Schuldbuch's seal once it knows, or by habit
      const wantBann =
        (!touch(target) && needsBann.has(target.kind) && d < 8) ||
        (target.kind === 'schuldbuch' && wayIn !== null && target.sealOpen <= 0 && d < stats.bannRange) ||
        (P.habitFlare && habitT <= 0 && sim.p.bann >= sim.p.bannMax && L.filter(cone).length >= 2);
      if (habitT <= 0) habitT = 1;
      if (sim.p.bann >= 1 && cd <= 0 && wantBann && !mirrorInCone && inFront && sim.p.dazzle <= 0) {
        bann = true;
        cd = 0.35;
      } else if (skillT <= 0 && ready('erdstoss') && close.length >= 2) {
        skill = 'erdstoss';
        skillT = 1.5 + R() * 2;
      } else if (skillT <= 0 && ready('wirbel') && L.filter((e) => near(e) < 3.1 && touch(e)).length >= 2) {
        skill = 'wirbel';
        skillT = 1.5 + R() * 2;
      } else if (skillT <= 0 && ready('ausfall') && d > 4 && d < 8 && touch(target) && inFront) {
        skill = 'ausfall';
        skillT = 2 + R() * 3;
      } else if (d <= reach + 0.6 + (reach === 0 ? 3 : 0) && (touch(target) || !needsBann.has(target.kind)) && st.stamina > 22) {
        // (a newcomer swings at a light too, until the game says the staff goes through it)
        // the staff: a Wuchthieb on armour / guard / mirror it has learnt about (and now and then)
        const heavyFor = armoured.has(target.kind) || (target.elite && target.finishable) || (boss && wayIn === null && R() < 0.02);
        if (hold >= 0) {
          hold += dt;
          down = hold < holdFor;
          if (!down) {
            hold = -1;
            cd = 0.3 + R() * 0.15;
          }
        } else if (cd <= 0 && inFront) {
          press = true;
          if ((heavyFor || R() < 0.12) && st.stamina > 35) {
            hold = 0;
            down = true;
            holdFor = HEAVY.min + 0.05 + R() * 0.3;
          } else cd = 0.38 + Math.abs(gauss(R)) * 0.08;
        }
      }
    }
    if (hold >= 0 && !press && !down && !dodge) hold = -1;
    // the view follows the aim (a mouse turns at most ~7 rad/s)
    if (target) {
      const want = headingOf(target.x - px, target.z - pz) + aimErr;
      const dy = wrapAngle(want - camYaw);
      camYaw = wrapAngle(camYaw + Math.max(-7 * dt, Math.min(7 * dt, dy)));
    }
    const inp: SimInput = { x: px, y: 0, z: pz, yaw: camYaw, moveX, moveZ, attackDown: down, attackPressed: press, bannPressed: bann, dodgePressed: dodge, running, blocked: false, safe: null, era: enc.era, time: enc.era === '1789' && isBoss ? 'dusk' : 'night', skill };
    const evs = sim.step(dt, inp);
    log.observe(dt, evs, { sim, onScreen, feedback: { sound: true, particles: true, shake: true, numbers: true } });
    for (const ev of evs) {
      if (ev.type === 'dodge') push = { vx: ev.vx, vz: ev.vz, t: ev.dur, dur: ev.dur };
      if (ev.type === 'step') push = { vx: ev.vx, vz: ev.vz, t: ev.dur, dur: ev.dur };
      if (ev.type === 'skill' && (ev.vx || ev.vz)) push = { vx: ev.vx, vz: ev.vz, t: ev.dur, dur: ev.dur };
      if (ev.type === 'playerHit') {
        const key = `${ev.src === 'hazard' ? 'hazard' : ev.by}.${ev.attack ?? '?'}`;
        hurtBy[key] = Math.round((hurtBy[key] ?? 0) + ev.damage);
        if (!sim.p.dodge && !sim.p.skill) push = { vx: ev.pushX, vz: ev.pushZ, t: 0.25, dur: 0.25 };
      }
      if (ev.type === 'bump' && push.t <= 0) push = { vx: ev.vx, vz: ev.vz, t: 0.12, dur: 0.12 };
      // learning from what the game says
      if (ev.type === 'immune' || ev.type === 'immuneHint') for (const e of L) if (e.def.needsBann) needsBann.add(e.kind);
      if (ev.type === 'immune') needsBann.add(ev.e.kind);
      if (ev.type === 'blocked') armoured.add(ev.e.kind);
      if (ev.type === 'hit' && ev.armored && !ev.e.boss) armoured.add(ev.e.kind);
      if (ev.type === 'reflect') mirrors.add(ev.e.kind);
      if (ev.type === 'intro') hintAt = sim.time + BOSS_INTRO;
      if ((ev.type === 'immune' || ev.type === 'bossGuard') && ev.e.boss) bossImmune++;
      if (ev.type === 'hit' && ev.e.boss && ev.armored) {
        bounced++;
        bounces++;
        if (bounces >= P.bossWayAfter && wayIn === null && o.hint !== 'never' && R() < P.readHint) wayIn = sim.time;
        if (bounces >= P.bossWayAfter) bounces = 0;
      }
    }
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
  // close the log's open fight
  const rep = log.report();
  const fights = rep.fights;
  const r: HumanResult = {
    won: won && !sim.p.dead,
    dead: sim.p.dead,
    seconds: Math.round(sec * 10) / 10,
    hp: Math.max(0, Math.round(sim.p.hp)),
    max: sim.p.max,
    fights,
    hitsTaken: rep.totals.hitsTaken,
    unfair: rep.totals.unfairHits,
    damageTaken: rep.totals.damageTaken,
    dodges: rep.totals.dodges.attempted,
    dodgesOk: rep.totals.dodges.successful,
    timeToKill: won ? Math.round(sec * 10) / 10 : null,
    unfairBy,
    hurtBy,
    learnt: wayIn,
    balsamUsed: P.balsam - balsam,
    bounced,
    bossImmune,
  };
  for (const f of fights) for (const [k, h] of Object.entries(f.hitsBy)) if (h.unfair) unfairBy[k] = (unfairBy[k] ?? 0) + h.unfair;
  return r;
}
