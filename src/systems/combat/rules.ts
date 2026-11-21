/**
 * Combat rules (docs/ACTION-RPG.md §4–§5): pure numbers and functions, no three.js, no DOM.
 * Everything the unit tests pin down lives here — damage, combo timing, dodge windows, stamina,
 * the Bannlicht cone, the attack-token limit, leash / reset, group bookkeeping, respawn, boss
 * phases, safe zones and telegraph times. The simulation (sim.ts) only calls into this file.
 */
import { homeSpot } from '../home';
import type { DerivedStats, EnemyAttackDef, EnemyDef, EnemyGroupState } from '../../rpg/types';

// ---- tuning --------------------------------------------------------------------------------

/** Atem costs (×stats.staminaCost). Running drains only while in combat. */
export const COST = { light: 10, heavy: 25, dodge: 20, runPerS: 8 } as const;
/** Atem regeneration: 25/s after 0.8 s without spending; exhausted at 0 until back to 25. */
export const STAMINA = { regen: 25, delay: 0.8, recover: 25 } as const;
/** Lebenskraft: out of combat after 6 s, 4/s. */
export const HP_REGEN = { delay: 6, perS: 4 } as const;

/** Hieb: 3-hit combo, 0.38 s per swing; the hit lands at `impact` into the swing. */
export const COMBO = {
  hits: 3,
  swing: 0.38,
  /** Anticipation (the staff goes back) before the arc. */
  windup: 0.07,
  /** Seconds into the swing when the arc is resolved. */
  impact: 0.13,
  /** After the swing ends, a press within this time continues the combo. */
  chain: 0.32,
  /** A press this long before the swing ends is buffered as the next hit. */
  buffer: 0.2,
  arcDeg: 70,
  reach: 2.6,
  assistDeg: 25,
  gentleAssistDeg: 40,
  finisher: 1.4,
} as const;

/**
 * Cleave: one swing hits the nearest target in its arc fully; further targets take `falloff` of
 * the damage, at most `light` / `heavy` / `sweep` targets in all (playtest: six Mahnbriefe or three
 * Steinfresser fell to one swing).
 */
export const CLEAVE = { light: 2, heavy: 3, sweep: 4, falloff: 0.5 } as const;

/** Wuchthieb: hold 0.45–1.0 s (move ×0.5), release. */
export const HEAVY = { min: 0.45, full: 1.0, moveScale: 0.5, tap: 0.18, arcDeg: 110, reach: 3.0, sweepReach: 3.4, swing: 0.55, impact: 0.2 } as const;

/** Ausweichen: 0.35 s roll of 4.5 m; i-frames 0.08–0.33 s; perfect in the last 0.15 s before a hit (combat variety pass: a perfect one gives back 12 Atem). */
export const DODGE = { dur: 0.35, dist: 4.5, iStart: 0.08, iEnd: 0.33, perfect: 0.15, slowmo: 0.25, slowScale: 0.3, perfectRefund: 12 } as const;

/**
 * Playtest round 10 (F-12): out of Atem the roll still comes out, as a short stumble — 2.5 m,
 * i-frames only 0.10–0.25 s, never perfect (no refund, no slow motion), and at most one per
 * `cd` s. It costs nothing (there is nothing left) and does not delay the Atem coming back.
 * Hits and the Wuchthieb stay blocked while exhausted.
 */
export const STUMBLE = { dist: 2.5, iStart: 0.1, iEnd: 0.25, cd: 1.1 } as const;

/**
 * Playtest round 10 (F-23): a press of attack or dodge is kept this long (s) when it cannot act yet
 * (hit-stop, a swing not yet in its last part, a roll still rolling) and fires as soon as it can. An
 * ability still owns the hands: presses during one are dropped.
 */
export const INPUT_BUFFER = 0.25;

/**
 * Playtest round 10 (F-06, F-37): the light Hieb steps in up to `max` m towards the swing's target
 * (the locked or soft-aimed enemy) when its body is just out of reach, over `dur` s (before the
 * impact), and the staff reaches `tol` m further against that one target.
 */
export const STEP_IN = { max: 1, dur: 0.12, tol: 0.4 } as const;

/**
 * Playtest round 10 (F-05): a fight does not end on one roll away. The leash (or a safe zone) must
 * stay broken for `grace` s before an enemy gives up; no leash is shorter than `minLeash` m; a
 * returned enemy heals only after `regenDelay` s back at home, by `regenPerS` of its strength per
 * second — and quest, escort, wave and prologue (tier 0) enemies keep their wounds (`keepsWounds`).
 * Bosses still reset in full when they get home (phase 1, seal shut).
 */
export const RESET = { grace: 4.5, minLeash: 15, regenDelay: 6, regenPerS: 0.1 } as const;

/** Does this enemy keep its wounds after a reset (no regeneration at all)? */
export function keepsWounds(e: { boss: boolean; tier: number; quest?: string; escort?: boolean; wave?: boolean }): boolean {
  return !e.boss && (e.quest !== undefined || e.escort === true || e.wave === true || e.tier <= 0);
}

/**
 * Bannlicht: gebannte enemies take ×1.3 (×1.5 made the flare a kill button); the flare lasts 0.45 s
 * on screen. Combat variety pass (playtest round 4: "the Bannlicht one-shots paper"): it is a tool,
 * not a nuke — the bonus counts for ONE blow per enemy and that blow wakes it (`wakeOnHit`; an
 * Irrlicht stays down, it needs the flare to be hit at all), an enemy flared again within `repeat`
 * seconds is held for half as long, and a charge takes 11 s (BASE_STATS.bannRecharge).
 */
export const BANN = { damageMul: 1.3, flare: 0.45, sealOpen: 4, repeat: 8, repeatMul: 0.5 } as const;

// ---- combat variety pass (2026-11-17): guard, veil, mirror, caller, waves, hazards -------------

/**
 * Deckung (the Foliant): while it is not attacking, light blows from its front half bounce off
 * (0 damage, the swing recoils and costs `blockStamina` Atem). A Wuchthieb or the Erdstoß from any
 * side breaks the guard: a long stagger and `breakFor` s with no guard and ×`brokenMul` damage.
 * Blows to flank and back land ×`flankMul`.
 */
export const GUARD = { blockStamina: 6, breakFor: 5, breakStagger: 1.4, brokenMul: 1.25, flankMul: 1.15, turn: 2.2 } as const;
/** Schleier (the Nebelweber): up to `max` of its pack within `radius` m take ×`mul` from the staff for `dur` s; the Bannlicht tears it. */
export const WARD = { dur: 9, mul: 0.25, radius: 10, max: 3 } as const;
/** Spiegel (the Scherbling): a Bannlicht on it dazzles you (`dazzle` s: no flare, dim view) and hurts; light blows ×`glassMul`; a heavy one cracks it (then ×`crackedMul`). */
export const REFLECT = { dazzle: 1.5, damage: 6, glassMul: 0.6, crackedMul: 1.3 } as const;
/** Ruf (the Rufer): calls `n` of its pack out of the fog, at most `max` of its callers alive. */
export const CALL = { n: 1, max: 2, dist: 9 } as const;
/** The second wave: `after` s into the fight (or the first of the pack falls), it comes `delay` s later from another side, `dist` m out. */
export const WAVE = { after: 12, delay: 1.8, dist: 10.5 } as const;
/** Hazards of a pack fight by era: one every `every` s (± spread); fire rings and falling stones also hurt the enemies inside. */
export const HAZARD = {
  every: 6.5,
  spread: 2.5,
  fire: { r: 2.3, tele: 1.4, damage: 10, enemyFrac: 0.3, n: 2 },
  stone: { r: 2.1, tele: 1.5, damage: 14, enemyFrac: 0.45, n: 1 },
} as const;

/** Is a light blow from `from` turned aside by the enemy's guard? (front half, guard up, not broken) */
export function guardBlocks(def: Pick<EnemyDef, 'guard'>, kind: 'light' | 'heavy', enemy: { x: number; z: number; heading: number }, from: { x: number; z: number }, open: boolean): boolean {
  if (def.guard !== 'front' || open || kind === 'heavy') return false;
  return isFrontal(enemy, from);
}

// ---- abilities (combat variety pass) ------------------------------------------------------------

export type SkillId = 'ausfall' | 'erdstoss' | 'wirbel';
export const SKILL_IDS: readonly SkillId[] = ['ausfall', 'erdstoss', 'wirbel'];

/**
 * The Messstab's three moves beyond the swing, learnt with the levels (docs/ACTION-RPG.md §4.2):
 *  - **Ausfall** (L2): a lunge of `dist` m along the aim, through the pack (i-frames all the way);
 *    everything in its path takes ×`mul`, the first one staggers — it gets you round a shield;
 *  - **Erdstoß** (L4): the staff into the ground, a shock ring of `radius` m: ×`mul`, thrown back,
 *    staggered; breaks guards, cracks mirrors, cuts a call short;
 *  - **Wirbel** (L6): a spin with three blows all round (`hits` s into it), ×`mul` each; bolts that
 *    reach you while it spins are knocked out of the air.
 * Cooldowns ×0.8 in gentle mode.
 */
export const SKILLS = {
  ausfall: { level: 2, cd: 7, cost: 15, dur: 0.3, dist: 6.5, width: 1.15, mul: 1.7, stagger: 0.7 },
  erdstoss: { level: 4, cd: 11, cost: 25, dur: 0.78, impact: 0.42, radius: 4.6, mul: 1.5, stagger: 1.1, knock: 3 },
  wirbel: { level: 6, cd: 13, cost: 28, dur: 0.95, hits: [0.18, 0.45, 0.72], radius: 3.3, mul: 0.85, moveScale: 0.75 },
} as const;

/** The abilities a level has learnt. */
export function skillsForLevel(level: number): SkillId[] {
  return SKILL_IDS.filter((id) => level >= SKILLS[id].level);
}

/** Cooldown of an ability (gentle mode shorter). */
export function skillCooldown(id: SkillId, gentle = false): number {
  return SKILLS[id].cd * (gentle ? 0.8 : 1);
}

/** Distance from p to the segment a→b, and how far along it (0..1). */
export function segmentDistance(ax: number, az: number, bx: number, bz: number, px: number, pz: number): { d: number; t: number } {
  const vx = bx - ax;
  const vz = bz - az;
  const l2 = vx * vx + vz * vz || 1e-6;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2));
  return { d: Math.hypot(px - (ax + vx * t), pz - (az + vz * t)), t };
}

/** Juice (§4.3); halved with reduced motion. */
export const HITSTOP = { light: 0.06, heavy: 0.11, player: 0.08 } as const;
export const SHAKE = { light: 0.03, heavy: 0.12, player: 0.15 } as const;
/** Knockback distance (m) on enemies; the player is pushed 1.2 m. */
export const KNOCK = { light: 0.4, finisher: 1.2, heavy: 2.6, player: 1.2 } as const;

/** Enemy AI (§4.4). */
export const AI = {
  /** At most this many enemies attack at once (gentle: 1). */
  tokens: 2,
  gentleTokens: 1,
  /** Default leash (m) around the group's spawn. */
  leash: 40,
  /** Groups materialise within this distance (and leave beyond `materialiseOff`). */
  materialise: 90,
  materialiseOff: 130,
  /** Max enemies alive at once (performance budget). */
  maxActive: 12,
  aggro: 15,
  bossAggro: 26,
  notice: 0.55,
  /** Strike phase (s) and the opening after it. */
  strike: 0.16,
  recover: 0.7,
  /** Gentle mode: telegraphs ×1.4, enemy HP ×0.75. */
  gentleTelegraph: 1.4,
  gentleHp: 0.75,
} as const;

/** Safe zones (§4.6). */
/** `homeR`: the no-fight ring around the home base in the present (centre: `homeSpot()`, src/systems/home.ts). */
export const SAFE = { homeR: 40, npcR: 6 } as const;

/** The Pikeur never reaches 0: at this fraction he blows "verloren" and leaves. */
export const PIKEUR_LEAVE = 0.12;

// ---- difficulty ----------------------------------------------------------------------------

/**
 * HP of an enemy: ×(1 + 0.45 (tier − 1)), gentle ×0.75; prologue (tier 0) = tier 1 at 60 %.
 * (0.35 until the 2026-11-16 playtests: K2–K4 packs fell to one swing at the intended levels.)
 */
export const TIER_HP = 0.45;
export function enemyHp(def: Pick<EnemyDef, 'hp'>, tier = 1, gentle = false): number {
  const t = Math.max(0, Math.min(4, tier));
  const base = t === 0 ? def.hp * 0.6 : def.hp * (1 + TIER_HP * (t - 1));
  return Math.max(1, Math.round(base * (gentle ? AI.gentleHp : 1)));
}

/**
 * Damage of an enemy attack: ×(1 + 0.15 (tier − 1)) (tier 0 = 60 %) × the player's damageTaken.
 * (0.25 on paper until 2026-11-16, never applied: quest spawns ran at tier 1. With chapter tiers
 * live, 0.15 keeps a non-dodging level-10 player alive against three tier-4 Steinfresser, barely.)
 */
export const TIER_DAMAGE = 0.15;
export function enemyDamage(raw: number, tier = 1, damageTaken = 1): number {
  const t = Math.max(0, Math.min(4, tier));
  const k = t === 0 ? 0.6 : 1 + TIER_DAMAGE * (t - 1);
  return Math.max(0, Math.round(raw * k * damageTaken * 10) / 10);
}

/**
 * Shortest wind-up (s). Balance round 2026-11-20 (docs/BALANCE.md): 0.4 → 0.5 s, so a human with
 * 0.25 s reaction keeps ≥ 0.17 s to decide before the roll's i-frames (0.08 s) start.
 */
export const TELEGRAPH_MIN = 0.5;

/** Wind-up of an attack the player can read (gentle ×1.4); never below `TELEGRAPH_MIN`. */
export function telegraphTime(a: Pick<EnemyAttackDef, 'telegraph'>, gentle = false): number {
  return Math.max(TELEGRAPH_MIN, a.telegraph * (gentle ? AI.gentleTelegraph : 1));
}

export function attackTokens(gentle: boolean): number {
  return gentle ? AI.gentleTokens : AI.tokens;
}

// ---- player damage ---------------------------------------------------------------------------

export interface HitSpec {
  kind: 'light' | 'heavy';
  /** Combo index 0..2 (2 = finisher, ×1.4). */
  combo?: number;
  /** Heavy charge 0..1 (0.45 s … 1.0 s held). */
  charge?: number;
  /** Target is gebannt (stunned by the Bannlicht): ×BANN.damageMul. */
  gebannt?: boolean;
  /** Armour factor of the target for this hit (1 = none) — see `armorFactor`. */
  armor?: number;
  /** Konterschritt: the next hit after a perfect dodge counts double. */
  counter?: boolean;
  /** Extra multiplier (boss weak points: the open seal, the Strohmann's back). */
  mul?: number;
  /** Deterministic ±6 % variation seed (0..1); 0.5 = none. */
  jitter?: number;
}

/** Damage of one staff hit from the derived stats. */
export function hitDamage(stats: Pick<DerivedStats, 'damage' | 'heavy'>, h: HitSpec): number {
  let d = stats.damage;
  if (h.kind === 'heavy') d *= heavyMultiplier(stats.heavy, h.charge ?? 1);
  else if ((h.combo ?? 0) >= COMBO.hits - 1) d *= COMBO.finisher;
  if (h.gebannt) d *= BANN.damageMul;
  d *= h.armor ?? 1;
  if (h.counter) d *= 2;
  d *= h.mul ?? 1;
  if (h.jitter !== undefined) d *= 0.94 + 0.12 * Math.max(0, Math.min(1, h.jitter));
  return Math.max(1, Math.round(d));
}

/** Wuchthieb multiplier: 75 % of `heavy` at 0.45 s, the full value at 1.0 s held. */
export function heavyMultiplier(heavy: number, charge: number): number {
  const c = Math.max(0, Math.min(1, charge));
  return heavy * (0.75 + 0.25 * c);
}

/** Charge 0..1 from the hold time (null = a tap / light hit). */
export function heavyCharge(held: number): number | null {
  if (held < HEAVY.min) return null;
  return Math.min(1, (held - HEAVY.min) / (HEAVY.full - HEAVY.min));
}

/**
 * Armour: frontal armour (Steinfresser, Steinbrecher) applies only when the hit comes from the
 * front half; a Wuchthieb breaks it (×1). `facing` = enemy heading, `fromX/Z` = attacker.
 */
export function armorFactor(def: Pick<EnemyDef, 'armor' | 'armorFrontal'>, kind: 'light' | 'heavy', enemy: { x: number; z: number; heading: number }, from: { x: number; z: number }, broken = false): number {
  const a = def.armor ?? 0;
  if (a <= 0 || broken || kind === 'heavy') return 1;
  if (!def.armorFrontal) return a;
  return isFrontal(enemy, from) ? a : 1;
}

/** Is `from` in front of the enemy (within ±90° of its heading)? Heading: forward = (−sin h, −cos h). */
export function isFrontal(enemy: { x: number; z: number; heading: number }, from: { x: number; z: number }): boolean {
  const fx = -Math.sin(enemy.heading);
  const fz = -Math.cos(enemy.heading);
  return (from.x - enemy.x) * fx + (from.z - enemy.z) * fz > 0;
}

// ---- combo / dodge / stamina -----------------------------------------------------------------

/** Next combo index for a press `since` seconds after the last swing ENDED (−1 = never swung). */
export function nextCombo(last: number, since: number): number {
  if (last < 0 || since > COMBO.chain || last >= COMBO.hits - 1) return 0;
  return last + 1;
}

/** Dodge i-frames: t seconds into the roll (a stumble out of Atem has a shorter window). */
export function dodgeInvulnerable(t: number, stumble = false): boolean {
  return stumble ? t >= STUMBLE.iStart && t <= STUMBLE.iEnd : t >= DODGE.iStart && t <= DODGE.iEnd;
}

/** A dodge started `before` seconds before an incoming hit lands is perfect if ≤ 0.15 s. */
export function isPerfectDodge(before: number): boolean {
  return before >= 0 && before <= DODGE.perfect;
}

/** Dodge impulse speed so the decaying push covers `dist` in `dur` (linear decay → ½ v·t). */
export function dodgeSpeed(dist: number = DODGE.dist, dur: number = DODGE.dur): number {
  return (2 * dist) / dur;
}

export interface StaminaState {
  stamina: number;
  max: number;
  exhausted: boolean;
  /** Seconds since the last spend. */
  idle: number;
}

/** Can the player afford an action now? Exhausted (hit 0, not yet back to 25) blocks heavy, running and hits; the roll becomes a stumble (STUMBLE). */
export function canAct(s: StaminaState, _cost: number): boolean {
  return !s.exhausted && s.stamina > 0;
}

/** Spend Atem; at 0 the player is exhausted. */
export function spend(s: StaminaState, cost: number): void {
  s.stamina = Math.max(0, s.stamina - cost);
  s.idle = 0;
  if (s.stamina <= 0) s.exhausted = true;
}

/** Regenerate Atem for `dt` s; exhaustion ends at 25. */
export function regenStamina(s: StaminaState, dt: number): void {
  s.idle += dt;
  if (s.idle >= STAMINA.delay) s.stamina = Math.min(s.max, s.stamina + STAMINA.regen * dt);
  if (s.exhausted && s.stamina >= STAMINA.recover) s.exhausted = false;
}

// ---- geometry ------------------------------------------------------------------------------

/** Forward vector for a yaw (player convention: yaw 0 looks to −z). */
export function forwardOf(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Heading (player-yaw convention) that looks along dx/dz. */
export function headingOf(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/**
 * Cone / arc hit test: is p within `range` (+ `radius` of the target) of the origin and within
 * ±angle/2 of the yaw? Targets right at the origin always count.
 */
export function inCone(ox: number, oz: number, yaw: number, range: number, angleDeg: number, px: number, pz: number, radius = 0): boolean {
  const dx = px - ox;
  const dz = pz - oz;
  const d = Math.hypot(dx, dz);
  if (d > range + radius) return false;
  if (d < 0.35 + radius * 0.5) return true;
  const diff = Math.abs(wrapAngle(headingOf(dx, dz) - yaw));
  // a big target near the edge still counts if its body reaches into the cone
  const slack = Math.atan2(radius, Math.max(d, 0.01));
  return diff <= (angleDeg * Math.PI) / 360 + slack;
}

/**
 * Soft aim assist: the yaw to swing along — towards the nearest target within ±assist°, else the
 * view yaw. Returns the original yaw when nothing qualifies.
 */
export function assistYaw(ox: number, oz: number, yaw: number, targets: readonly { x: number; z: number }[], range: number, assistDeg: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const dx = t.x - ox;
    const dz = t.z - oz;
    const d = Math.hypot(dx, dz);
    if (d > range + 1.2) continue;
    const diff = Math.abs(wrapAngle(headingOf(dx, dz) - yaw));
    if (diff > (assistDeg * Math.PI) / 180) continue;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) return yaw;
  const t = targets[best];
  return headingOf(t.x - ox, t.z - oz);
}

// ---- tokens ----------------------------------------------------------------------------------

/** At most `max` enemies attack at once; the others circle and wait. */
export class AttackTokens {
  private readonly holders = new Set<string>();
  constructor(public max: number) {}
  request(id: string): boolean {
    if (this.holders.has(id)) return true;
    if (this.holders.size >= this.max) return false;
    this.holders.add(id);
    return true;
  }
  release(id: string): void {
    this.holders.delete(id);
  }
  has(id: string): boolean {
    return this.holders.has(id);
  }
  get count(): number {
    return this.holders.size;
  }
  clear(): void {
    this.holders.clear();
  }
}

// ---- leash -------------------------------------------------------------------------------------

/** Enemies give up when they or the player stray beyond the leash from the group's spawn (never under RESET.minLeash). */
export function leashBroken(home: { x: number; z: number }, enemy: { x: number; z: number }, player: { x: number; z: number }, leash: number = AI.leash): boolean {
  leash = Math.max(RESET.minLeash, leash);
  return Math.hypot(enemy.x - home.x, enemy.z - home.z) > leash || Math.hypot(player.x - home.x, player.z - home.z) > leash + 12;
}

// ---- groups --------------------------------------------------------------------------------

export type SpawnRequest = Omit<EnemyGroupState, 'killed' | 'count'> & { count?: number };

/**
 * Idempotent spawn by group id: a new group starts with nothing killed; an existing one keeps what
 * is already undone (its spec — place, era, count — may be re-declared). Returns true if new.
 */
export function upsertGroup(groups: Record<string, EnemyGroupState>, req: SpawnRequest): boolean {
  const prev = groups[req.group];
  const g: EnemyGroupState = {
    group: req.group,
    kind: req.kind,
    era: req.era,
    x: req.x,
    z: req.z,
    count: Math.max(1, Math.round(req.count ?? 1)),
    killed: prev ? Math.min(prev.killed, Math.max(1, Math.round(req.count ?? 1))) : 0,
  };
  for (const k of ['radius', 'boss', 'tier', 'leash', 'quest', 'objective', 'respawn', 'time', 'room', 'escorts', 'wave', 'aggro', 'veiled'] as const) {
    const v = req[k];
    if (v !== undefined) (g as unknown as Record<string, unknown>)[k] = v;
  }
  // a fallen elite stays fallen when content re-declares the group
  if (prev?.eliteDown) g.eliteDown = true;
  if (prev?.bossPhase) g.bossPhase = prev.bossPhase;
  groups[req.group] = g;
  return !prev;
}

export function remaining(g: EnemyGroupState): number {
  return Math.max(0, g.count - g.killed);
}

export function isCleared(g: EnemyGroupState): boolean {
  return g.killed >= g.count;
}

/** A cleared group comes back only with `respawn` > 0, that many seconds after its clear. */
export function shouldRespawn(g: EnemyGroupState, clearedAt: number | undefined, now: number): boolean {
  if (!isCleared(g) || !g.respawn || g.respawn <= 0 || clearedAt === undefined) return false;
  return now - clearedAt >= g.respawn;
}

/**
 * After the player is undone: nothing is lost. Unfinished groups keep their kills and come back
 * at full strength (the runtime members are rebuilt; bosses at phase 1); cleared groups stay
 * cleared. Returns the ids of the groups to rebuild.
 */
export function groupsToReset(groups: Record<string, EnemyGroupState>): string[] {
  return Object.values(groups)
    .filter((g) => !isCleared(g))
    .map((g) => g.group);
}

/** Is a group shown now: its era, and its time of day ('dusk' also holds at night). */
export function groupActive(g: Pick<EnemyGroupState, 'era' | 'time'>, era: string, time: 'day' | 'dusk' | 'night'): boolean {
  if (g.era !== era) return false;
  if (!g.time || g.time === 'any') return true;
  if (g.time === 'night') return time === 'night';
  return time === 'dusk' || time === 'night';
}

// ---- bosses ----------------------------------------------------------------------------------

/** Boss phase (1-based) for an HP fraction and the thresholds (e.g. [0.66, 0.33]). */
export function bossPhase(frac: number, thresholds: readonly number[] = []): number {
  let p = 1;
  for (const t of thresholds) if (frac <= t) p++;
  return p;
}

/**
 * The lowest HP a hit may leave a boss in `phase` (1-based): just under the next phase line, so one
 * hit opens the next phase but never skips it. 0 in the last phase.
 */
export function bossPhaseFloor(phase: number, max: number, thresholds: readonly number[] = []): number {
  const next = thresholds[phase - 1];
  if (next === undefined) return 0;
  return Math.max(1, Math.floor(next * max) - 1);
}

/** HP after damage, honouring the Pikeur's floor (he never reaches 0). */
export function applyDamage(kind: string, hp: number, max: number, dmg: number): number {
  const next = hp - dmg;
  if (kind === 'pikeur') return Math.max(Math.ceil(max * PIKEUR_LEAVE), next);
  return Math.max(0, next);
}

/** The Pikeur leaves (blows "verloren") once he is down to his floor. */
export function pikeurLeaves(hp: number, max: number): boolean {
  return hp <= Math.ceil(max * PIKEUR_LEAVE);
}

// ---- safe zones ----------------------------------------------------------------------------

export interface SafeInput {
  x: number;
  z: number;
  era: string;
  /** flags['combat.disabled'] */
  disabled?: boolean;
  /** In the hub (between hub:enter and hub:leave). */
  hub?: boolean;
  /** A conversation is open. */
  talking?: boolean;
  /** A modal is open. */
  modal?: boolean;
  memorials?: readonly { x?: number; z?: number; r?: number; era?: string; room?: string; active: boolean }[];
  /** Current palace room (interiors) for room memorials. */
  room?: string;
  /** Placed NPCs (the 6 m talk radius). */
  npcs?: readonly { x: number; z: number; era?: string }[];
  /** A fight is on (an enemy has the player): NPC bubbles do not stop it (a boss never heals mid-fight). */
  engaged?: boolean;
}

export type SafeReason = 'disabled' | 'home' | 'memorial' | 'talking' | 'modal' | 'npc' | null;

/** Why no fighting can happen here (null = fighting allowed). */
export function safeReason(s: SafeInput): SafeReason {
  if (s.disabled) return 'disabled';
  if (s.modal) return 'modal';
  if (s.talking) return 'talking';
  const home = homeSpot();
  if (s.hub || (s.era === 'today' && Math.hypot(s.x - home.x, s.z - home.z) <= SAFE.homeR)) return 'home';
  for (const m of s.memorials ?? []) {
    if (!m.active) continue;
    if (m.era && m.era !== s.era) continue;
    if (m.room) {
      if (s.room && (s.room === m.room || s.room.endsWith(m.room) || m.room.endsWith(s.room))) return 'memorial';
      continue;
    }
    if (m.x === undefined || m.z === undefined) return 'memorial';
    if (Math.hypot(s.x - m.x, s.z - m.z) <= (m.r ?? 25)) return 'memorial';
  }
  for (const n of s.engaged ? [] : (s.npcs ?? [])) {
    if (n.era && n.era !== s.era) continue;
    if (Math.hypot(s.x - n.x, s.z - n.z) <= SAFE.npcR) return 'npc';
  }
  return null;
}
