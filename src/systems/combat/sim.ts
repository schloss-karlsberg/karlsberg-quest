/**
 * The combat simulation (docs/ACTION-RPG.md §4–§5): the player's resources and moves, enemy groups,
 * the AI with its telegraphs, projectiles, ground rings and the bosses. Pure TypeScript — no
 * three.js, no DOM, no events bus: the system (index.ts) feeds it input and turns its `SimEvent`s
 * into contract events, sound, particles and HUD. Deterministic for a given input sequence.
 *
 * Hit-stop is LOCAL: `freeze` stops this simulation (enemies, projectiles, the swing) for a few
 * frames; the game loop, the player's walking and every other system keep running.
 */
import { ELITES, ENEMIES, enemyDef } from '../../rpg/enemies';
import { BASE_STATS } from '../../rpg/stats';
import type { DerivedStats, EnemyAttackDef, EnemyDef, EnemyGroupState } from '../../rpg/types';
import { eliteIndex, escortHost, escortsOf } from './packs';
import { BOSS_TURN, type BossView, bossCooldown, bossHitMul, chooseBossAttack, sealBolts, sparkRain, summonOf } from './bosses';
import {
  AI,
  AttackTokens,
  BANN,
  COMBO,
  COST,
  DODGE,
  CLEAVE,
  HEAVY,
  bossPhaseFloor,
  HITSTOP,
  HP_REGEN,
  KNOCK,
  type SafeReason,
  type StaminaState,
  applyDamage,
  armorFactor,
  assistYaw,
  attackTokens,
  bossPhase,
  canAct,
  dodgeInvulnerable,
  dodgeSpeed,
  enemyDamage,
  enemyHp,
  forwardOf,
  groupActive,
  headingOf,
  heavyCharge,
  hitDamage,
  inCone,
  isCleared,
  isPerfectDodge,
  leashBroken,
  nextCombo,
  pikeurLeaves,
  regenStamina,
  remaining,
  shouldRespawn,
  spend,
  telegraphTime,
  wrapAngle,
} from './rules';

export type EnemyState = 'idle' | 'notice' | 'intro' | 'approach' | 'circle' | 'retreat' | 'windup' | 'strike' | 'recover' | 'gebannt' | 'stagger' | 'flee' | 'return' | 'roar' | 'leave' | 'dissolve';
export type KillBy = 'light' | 'heavy' | 'bann' | 'item' | 'env';
export type TimeOfDay = 'day' | 'dusk' | 'night';

export interface Enemy {
  id: string;
  group: string;
  kind: string;
  def: EnemyDef;
  boss: boolean;
  tier: number;
  /** Summoned by a boss (not part of a persisted group). */
  add: boolean;
  x: number;
  y: number;
  z: number;
  /** Hover height above ground (Irrlicht, Mahnbrief). */
  hover: number;
  heading: number;
  vx: number;
  vz: number;
  radius: number;
  hp: number;
  maxHp: number;
  state: EnemyState;
  t: number;
  home: { x: number; z: number };
  leash: number;
  attack: EnemyAttackDef | null;
  windup: number;
  /** Where a lunge / charge / area is aimed. */
  aim: { x: number; z: number };
  dash: { vx: number; vz: number; t: number; hit: boolean } | null;
  cd: Record<string, number>;
  stun: number;
  stagger: number;
  phase: number;
  sealOpen: number;
  armorBroken: number;
  poise: number;
  orbit: number;
  orbitDir: number;
  /** 0..1 hit flash (visuals). */
  flash: number;
  aggro: boolean;
  /** Raffschatten: fled already (fights when cornered). */
  fled: number;
  blinkT: number;
  /** Seconds since the last token attempt. */
  tryT: number;
  seed: number;
  by: KillBy;
  quest?: string;
  objective?: string;
  /** Rings this enemy owns (removed at strike / interrupt). */
  rings: number[];
  /** Boss: the player has been close at least once (boss bar shows). */
  engaged: boolean;
  /** The pack's elite (named, glowing, an extra move; finishable below 25 %). */
  elite: boolean;
  /** Elite name ("Leithund"), shown over its bar. */
  title?: string;
  /** An escort of another kind walking with a group (`<group>+escort`): XP, no objective. */
  escort: boolean;
  /** Damage multiplier (elites). */
  dmgMul: number;
  /** Visual / body scale (elites). */
  size: number;
  /** Bearing (rad, atan2 z/x around the player) this enemy works towards: packs surround. */
  slot: number;
  /** Elite below half strength: quicker. */
  enraged: boolean;
  /** Elite below a quarter: a Wuchthieb finishes it. */
  finishable: boolean;
  /** Nebelweber: seconds until it can slip back again. */
  slipCd: number;
  /** Escort without its group: seconds until it drifts off. */
  orphan: number;
  /** Direction of the last staff hit (visual flinch). */
  hitX: number;
  hitZ: number;
}

export interface Projectile {
  id: number;
  kind: string;
  owner: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  life: number;
  damage: number;
  tier: number;
  /** Lobbed (Quader): lands at tx/tz after `life` s and hits within r. */
  lob: boolean;
  tx: number;
  tz: number;
  r: number;
  ring: number;
}

export interface Ring {
  id: number;
  x: number;
  z: number;
  r: number;
  t: number;
  dur: number;
  owner: string;
  kind: 'area' | 'landing' | 'rain';
}

export interface Swing {
  kind: 'light' | 'heavy';
  combo: number;
  t: number;
  dur: number;
  impact: number;
  yaw: number;
  charge: number;
  resolved: boolean;
  hits: number;
}

export interface PlayerCombat {
  hp: number;
  max: number;
  st: StaminaState;
  bann: number;
  bannMax: number;
  bannT: number;
  /** Seconds since the last damage taken (regeneration). */
  calm: number;
  inCombat: boolean;
  swing: Swing | null;
  lastCombo: number;
  sinceSwing: number;
  /** Seconds the attack button is held (−1 = not holding). */
  hold: number;
  queued: boolean;
  charging: boolean;
  chargeFull: boolean;
  dodge: { t: number; perfect: boolean } | null;
  counter: boolean;
  /** Quick-use animation lock (s). */
  drink: number;
  flare: number;
  dead: boolean;
  god: boolean;
}

export type SimEvent =
  | { type: 'spawned'; e: Enemy }
  | { type: 'aggro'; e: Enemy; on: boolean }
  | { type: 'telegraph'; e: Enemy; attack: EnemyAttackDef; dur: number }
  | { type: 'strike'; e: Enemy; attack: EnemyAttackDef }
  | { type: 'swing'; kind: 'light' | 'heavy'; combo: number; charge: number }
  | { type: 'whiff'; kind: 'light' | 'heavy' }
  | { type: 'hit'; e: Enemy; damage: number; heavy: boolean; finisher: boolean; weak: boolean; armored: boolean; gebannt: boolean; dirX: number; dirZ: number }
  | { type: 'immune'; e: Enemy }
  | { type: 'killed'; e: Enemy; by: KillBy }
  | { type: 'cleared'; group: string; kind: string }
  | { type: 'playerHit'; damage: number; by: string; x: number; z: number; pushX: number; pushZ: number; heavy: boolean }
  /** The player stands inside a big body (a boss, a Steinfresser): push them out (m/s). */
  | { type: 'bump'; vx: number; vz: number }
  | { type: 'evade'; by: string }
  | { type: 'died'; by: string }
  | { type: 'dodge'; vx: number; vz: number; perfect: boolean }
  | { type: 'bann'; x: number; z: number; yaw: number; range: number; angle: number; hits: number }
  | { type: 'stun'; e: Enemy; seconds: number }
  | { type: 'phase'; e: Enemy; phase: number }
  | { type: 'summon'; e: Enemy; kind: string; n: number }
  | { type: 'shot'; p: Projectile }
  | { type: 'impact'; p: Projectile; hitPlayer: boolean }
  | { type: 'balk'; e: Enemy }
  | { type: 'block'; e: Enemy; x: number; y: number; z: number }
  | { type: 'leave'; e: Enemy }
  | { type: 'burst'; e: Enemy }
  | { type: 'blink'; e: Enemy; fromX: number; fromZ: number }
  | { type: 'tired' }
  | { type: 'noBann' }
  | { type: 'charge'; on: boolean }
  | { type: 'chargeFull' }
  | { type: 'combat'; on: boolean }
  | { type: 'heal'; amount: number; by: string }
  | { type: 'resetGroup'; group: string }
  /** A boss is met for the first time: the reveal (camera, title card, sting). */
  | { type: 'intro'; e: Enemy; dur: number }
  /** An elite is low: a Wuchthieb will finish it. */
  | { type: 'finishable'; e: Enemy }
  /** The Gnadenstoß: a low elite undone by a Wuchthieb. */
  | { type: 'finisher'; e: Enemy }
  /** An elite at half strength turns furious. */
  | { type: 'enrage'; e: Enemy }
  /** A pack noticed the player together (one call for all). */
  | { type: 'packAlert'; e: Enemy; n: number }
  /** An escort drifts off once its group is undone. */
  | { type: 'drift'; e: Enemy };

export interface SimWorld {
  heightAt(x: number, z: number): number;
  /** Running / standing water (the Pikeur balks at it). */
  isWater?(x: number, z: number): boolean;
  /** Can a walking enemy stand here (buildings, steep rock: no)? */
  walkable?(x: number, z: number): boolean;
}

export interface SimInput {
  x: number;
  /** Feet height. */
  y: number;
  z: number;
  yaw: number;
  /** Move wish in world space (0,0 = none). */
  moveX: number;
  moveZ: number;
  attackDown: boolean;
  attackPressed: boolean;
  bannPressed: boolean;
  dodgePressed: boolean;
  /** Sprinting and moving (Atem drain in combat). */
  running: boolean;
  /** Attacks / dodge / Bannlicht are ignored (measuring, modal, flying, spirit view, input off, interact target). */
  blocked: boolean;
  /** Dodge only (Space) is ignored (e.g. flying). */
  noDodge?: boolean;
  safe: SafeReason;
  era: string;
  time: TimeOfDay;
}

export interface SimOptions {
  gentle: boolean;
  reducedMotion: boolean;
  stats: DerivedStats;
  /** Laubs Lot: the Wuchthieb sweeps all round. */
  sweep: boolean;
  /** Talents that change rules (not just numbers). */
  konter: boolean;
  waerme: boolean;
  dritter: boolean;
}

/** Body radius and hover per kind. */
const BODY: Record<string, { r: number; hover: number; aggro: number; turn: number }> = {
  nebelling: { r: 0.55, hover: 0, aggro: 15, turn: 5 },
  irrlicht: { r: 0.4, hover: 1.7, aggro: 18, turn: 6 },
  streuner: { r: 0.55, hover: 0, aggro: 22, turn: 7 },
  mahnbrief: { r: 0.4, hover: 1.35, aggro: 16, turn: 8 },
  raffschatten: { r: 0.55, hover: 0, aggro: 14, turn: 5 },
  glutling: { r: 0.4, hover: 0, aggro: 16, turn: 7 },
  grusling: { r: 0.42, hover: 0, aggro: 14, turn: 8 },
  steinfresser: { r: 0.95, hover: 0, aggro: 14, turn: 2.2 },
  nebelweber: { r: 0.5, hover: 0.35, aggro: 20, turn: 6 },
  schuldbuch: { r: 1.5, hover: 0.6, aggro: 26, turn: BOSS_TURN['schuldbuch']! },
  // big bosses keep a stand-off that matches their size (the camera stays outside the smoke horse,
  // the straw arms, the blocks; playtest round 2); the staff's reach grows with it (inCone + radius)
  pikeur: { r: 2.2, hover: 0, aggro: 30, turn: BOSS_TURN['pikeur']! },
  strohmann: { r: 2.4, hover: 0, aggro: 26, turn: BOSS_TURN['strohmann']! },
  steinbrecher: { r: 2.7, hover: 0, aggro: 26, turn: BOSS_TURN['steinbrecher']! },
};
const bodyOf = (kind: string) => BODY[kind] ?? { r: 0.6, hover: 0, aggro: AI.aggro, turn: 5 };

/** Seconds of a boss's reveal (it turns, rises and roars; it neither attacks nor takes harm). */
export const BOSS_INTRO = 2.6;
/** Kinds that strike and fall back a few metres before they come again (hit and run). */
const HIT_AND_RUN = new Set(['streuner', 'mahnbrief', 'raffschatten', 'nebelling']);
/** Kinds that keep their distance and throw (they never take a surround slot). */
const KITERS = new Set(['nebelweber', 'irrlicht']);
/** Kinds that drift towards the player's back while closing in (flankers). */
const FLANKERS = new Set(['streuner', 'raffschatten', 'grusling']);
/** Gap between two pack wind-ups (s): attacks come in a rhythm, not all at once. */
const ATTACK_GAP = { min: 0.45, spread: 0.3, gentle: 0.9, land: 0.85, gentleLand: 1.3 } as const;

/** Distance an enemy wants to keep while closing in for `a`. */
function wantDist(a: EnemyAttackDef): number {
  switch (a.kind) {
    case 'melee':
      return Math.max(1.2, a.range * 0.8);
    case 'lunge':
      return Math.max(1.5, a.range * 0.75);
    case 'area':
      return Math.max(1.4, a.range * 0.55);
    case 'ranged':
      return Math.min(a.range * 0.75, 11);
    case 'charge':
      return a.range * 0.6;
    case 'summon':
      return 99;
  }
}

function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export class CombatSim {
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly rings: Ring[] = [];
  readonly tokens: AttackTokens;
  readonly p: PlayerCombat;
  /** Local hit-stop (s): the whole simulation holds still. */
  freeze = 0;
  /** Perfect-dodge slow motion (s). */
  slowmo = 0;
  time = 0;
  /** Seconds since start (unscaled); groups cleared at (for respawn). */
  private readonly clearedAt = new Map<string, number>();
  private readonly seq = new Map<string, number>();
  private readonly out: SimEvent[] = [];
  private idSeq = 0;
  private tick = 0;
  /** Last player position seen (for adds and projectiles). */
  private px = 0;
  private py = 0;
  private pz = 0;
  private safe: SafeReason = null;
  /** Groups whose escorts are out (rebuilt with the group). */
  private readonly escorted = new Set<string>();
  /** Boss groups whose reveal has played (once per session). */
  private readonly introSeen = new Set<string>();
  /** No pack wind-up starts before this time (staggered attacks). */
  private nextAttackAt = 0;
  /** When the last pack blow lands (s): the next lands at least ATTACK_GAP.land later — one roll each. */
  private lastLand = -9;
  /** Player's view yaw (the flankers' "back"). */
  private pyaw = 0;

  constructor(
    readonly world: SimWorld,
    /** Persisted groups (the combat slice's `groups`). */
    public groups: Record<string, EnemyGroupState>,
    public opt: SimOptions = { gentle: false, reducedMotion: false, stats: { ...BASE_STATS }, sweep: false, konter: false, waerme: false, dritter: false },
  ) {
    this.tokens = new AttackTokens(attackTokens(opt.gentle));
    const s = opt.stats;
    this.p = {
      hp: s.maxHp,
      max: s.maxHp,
      st: { stamina: s.maxStamina, max: s.maxStamina, exhausted: false, idle: 9 },
      bann: s.bannCharges,
      bannMax: s.bannCharges,
      bannT: 0,
      calm: 99,
      inCombat: false,
      swing: null,
      lastCombo: -1,
      sinceSwing: 99,
      hold: -1,
      queued: false,
      charging: false,
      chargeFull: false,
      dodge: null,
      counter: false,
      drink: 0,
      flare: 0,
      dead: false,
      god: false,
    };
  }

  // ---- options -------------------------------------------------------------------------------

  setStats(stats: DerivedStats): void {
    this.opt.stats = stats;
    const p = this.p;
    const fracHp = p.max > 0 ? p.hp / p.max : 1;
    p.max = Math.max(1, Math.round(stats.maxHp));
    p.hp = Math.min(p.max, Math.max(p.dead ? 0 : 1, Math.round(fracHp * p.max)));
    p.st.max = stats.maxStamina;
    p.st.stamina = Math.min(p.st.max, p.st.stamina);
    p.bannMax = Math.max(1, Math.round(stats.bannCharges));
    p.bann = Math.min(p.bannMax, p.bann);
  }

  setGentle(on: boolean): void {
    this.opt.gentle = on;
    this.tokens.max = attackTokens(on);
  }

  /** Movement multiplier for the player (charging a Wuchthieb, drinking). */
  get moveScale(): number {
    if (this.p.charging) return HEAVY.moveScale;
    if (this.p.drink > 0) return 0.6;
    return 1;
  }

  get canSprint(): boolean {
    return !this.p.st.exhausted;
  }

  /** Live (not dissolving) enemies. */
  live(): Enemy[] {
    return this.enemies.filter((e) => e.state !== 'dissolve');
  }

  // ---- groups ------------------------------------------------------------------------------

  /** Remove a group without a fight ('*' = all). */
  despawn(group: string): void {
    const all = group === '*';
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (all || e.group === group || e.group === `${group}+adds` || e.group === `${group}+escort`) this.removeEnemy(i);
    }
    if (all) {
      for (const k of Object.keys(this.groups)) delete this.groups[k];
      this.clearedAt.clear();
      this.escorted.clear();
    } else {
      delete this.groups[group];
      this.clearedAt.delete(group);
      this.escorted.delete(group);
    }
  }

  /** Drop every runtime enemy (era change, load, death): groups rebuild at full strength. */
  dematerialise(group?: string): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (group === undefined || e.group === group || e.group === `${group}+adds` || e.group === `${group}+escort`) this.removeEnemy(i);
    }
    if (group === undefined) {
      this.projectiles.length = 0;
      this.rings.length = 0;
      this.tokens.clear();
      this.escorted.clear();
    } else this.escorted.delete(group);
  }

  private removeEnemy(i: number): void {
    const e = this.enemies[i];
    this.tokens.release(e.id);
    this.dropRings(e);
    this.enemies.splice(i, 1);
  }

  private dropRings(e: Enemy): void {
    for (const id of e.rings) {
      const k = this.rings.findIndex((r) => r.id === id);
      if (k >= 0) this.rings.splice(k, 1);
    }
    e.rings = [];
  }

  /** Materialise groups near the player in their era / time; respawn; reinforcements under the cap. */
  sync(era: string, time: TimeOfDay, px: number, pz: number): void {
    for (const g of Object.values(this.groups)) {
      const active = groupActive(g, era, time);
      const d = Math.hypot(px - g.x, pz - g.z);
      const live = this.enemies.filter((e) => e.group === g.group && e.state !== 'dissolve');
      if (!active || d > AI.materialiseOff) {
        if (live.length) this.dematerialise(g.group);
        continue;
      }
      if (isCleared(g)) {
        if (shouldRespawn(g, this.clearedAt.get(g.group), this.time)) {
          g.killed = 0;
          this.clearedAt.delete(g.group);
        } else continue;
      }
      if (d > AI.materialise && !live.length) continue;
      let need = remaining(g) - live.length;
      while (need > 0 && this.live().length < AI.maxActive) {
        this.makeMember(g);
        need--;
      }
      // mixed packs: the escorts step out with the group (once per materialisation)
      if (!this.escorted.has(g.group) && remaining(g) >= 2 && this.enemies.some((e) => e.group === g.group && e.state !== 'dissolve')) {
        this.escorted.add(g.group);
        this.makeEscorts(g);
      }
    }
  }

  private makeEscorts(g: EnemyGroupState): void {
    const list = escortsOf(g);
    let i = 0;
    const total = list.reduce((n, x) => n + x.n, 0);
    for (const x of list) {
      const def = enemyDef(x.kind);
      if (!def) continue;
      for (let k = 0; k < x.n; k++, i++) {
        if (this.live().length >= AI.maxActive) return;
        // casters stand back, behind the group as seen from its spawn; melee escorts mingle
        const back = KITERS.has(x.kind) ? 5.5 : 2.4;
        const a = hashStr(g.group) * 6.283 + Math.PI + ((i + 0.5) / Math.max(1, total) - 0.5) * 2.2;
        const r = (g.radius ?? 3) + back;
        this.makeEnemy(def, `${g.group}+escort#${this.idSeq++}`, `${g.group}+escort`, g.x + Math.cos(a) * r, g.z + Math.sin(a) * r, { boss: false, tier: g.tier ?? 1, leash: g.leash ?? AI.leash, home: { x: g.x, z: g.z }, add: true, escort: true });
      }
    }
  }

  private makeMember(g: EnemyGroupState): Enemy | null {
    const def = enemyDef(g.kind);
    if (!def) return null;
    const n = this.seq.get(g.group) ?? 0;
    this.seq.set(g.group, n + 1);
    const idx = g.killed + this.enemies.filter((e) => e.group === g.group && e.state !== 'dissolve').length;
    const count = Math.max(1, g.count);
    const r = g.count > 1 ? (g.radius ?? 3 + count * 0.8) : 0;
    const a = (idx / count) * Math.PI * 2 + hashStr(g.group) * 6.283;
    const rr = r * (0.55 + 0.45 * hash01(idx + hashStr(g.group) * 97));
    const elite = idx === eliteIndex(g);
    const e = this.makeEnemy(def, `${g.group}#${n}`, g.group, g.x + Math.cos(a) * rr, g.z + Math.sin(a) * rr, { boss: g.boss === true || def.boss === true, tier: g.tier ?? 1, leash: g.leash ?? AI.leash, home: { x: g.x, z: g.z }, quest: g.quest, objective: g.objective, elite });
    return e;
  }

  private makeEnemy(base: EnemyDef, id: string, group: string, x: number, z: number, o: { boss: boolean; tier: number; leash: number; home: { x: number; z: number }; add?: boolean; escort?: boolean; quest?: string; objective?: string; elite?: boolean }): Enemy {
    const b = bodyOf(base.id);
    const el = o.elite ? ELITES[base.id] : undefined;
    // an elite is its kind, stronger, with one move of its own (and three times the XP)
    const def: EnemyDef = el ? { ...base, hp: base.hp * el.hpMul, xp: base.xp * 3, attacks: [...base.attacks, el.extra] } : base;
    const size = el ? el.size : 1;
    const hp = enemyHp(def, o.tier, this.opt.gentle);
    const seed = hashStr(id);
    const e: Enemy = {
      id,
      group,
      kind: def.id,
      def,
      boss: o.boss,
      tier: o.tier,
      add: o.add === true,
      x,
      y: this.world.heightAt(x, z) + b.hover,
      z,
      hover: b.hover,
      heading: seed * Math.PI * 2,
      vx: 0,
      vz: 0,
      radius: b.r * (el ? Math.min(1.35, size) : 1),
      hp,
      maxHp: hp,
      state: 'idle',
      t: 0,
      home: { ...o.home },
      leash: o.leash,
      attack: null,
      windup: 0,
      aim: { x, z },
      dash: null,
      cd: {},
      stun: 0,
      stagger: 0,
      phase: 1,
      sealOpen: 0,
      armorBroken: 0,
      poise: 0,
      orbit: seed * Math.PI * 2,
      orbitDir: seed > 0.5 ? 1 : -1,
      flash: 0,
      aggro: false,
      fled: 0,
      blinkT: 2 + seed * 3,
      tryT: 0,
      seed,
      by: 'light',
      rings: [],
      engaged: false,
      elite: !!el,
      escort: o.escort === true,
      dmgMul: el ? el.dmgMul : 1,
      size,
      slot: Math.atan2(z - this.pz, x - this.px),
      enraged: false,
      finishable: false,
      slipCd: 0,
      orphan: 0,
      hitX: 0,
      hitZ: 0,
    };
    if (el) e.title = el.name_de;
    if (o.quest) e.quest = o.quest;
    if (o.objective) e.objective = o.objective;
    // stagger the first attacks a little so a group doesn't strike in unison
    for (const a of def.attacks) e.cd[a.id] = a.kind === 'summon' ? a.cooldown * 0.5 : 0.4 + seed * 1.2;
    this.enemies.push(e);
    this.out.push({ type: 'spawned', e });
    return e;
  }

  /** Debug / tests: an enemy right here, in its own ad-hoc group. */
  spawnAt(kind: string, x: number, z: number, o: { group?: string; boss?: boolean; tier?: number; era: string; count?: number } = { era: 'today' }): EnemyGroupState | null {
    const def = enemyDef(kind);
    if (!def) return null;
    const group = o.group ?? `debug.${kind}.${this.idSeq++}`;
    this.groups[group] = { group, kind, era: o.era as EnemyGroupState['era'], x, z, count: o.count ?? 1, killed: 0, boss: o.boss ?? def.boss === true, tier: o.tier ?? 1, radius: 3 };
    return this.groups[group];
  }

  // ---- the step ------------------------------------------------------------------------------

  step(dt: number, inp: SimInput): SimEvent[] {
    this.tick++;
    this.time += dt;
    this.px = inp.x;
    this.py = inp.y;
    this.pz = inp.z;
    this.safe = inp.safe;
    this.pyaw = inp.yaw;
    const p = this.p;
    if (!p.dead) this.playerResources(dt, inp);
    if (this.freeze > 0) {
      this.freeze = Math.max(0, this.freeze - dt);
      return this.flush();
    }
    let edt = dt;
    if (this.slowmo > 0) {
      this.slowmo = Math.max(0, this.slowmo - dt);
      edt = dt * DODGE.slowScale;
    }
    if (!p.dead) this.playerMoves(dt, inp);
    this.sync(inp.era, inp.time, inp.x, inp.z);
    this.assignSlots(inp, edt);
    for (const e of [...this.enemies]) this.think(e, edt, inp);
    this.separate();
    if (!p.dead && !p.dodge) this.bumpPlayer(inp);
    this.updateProjectiles(edt);
    for (const r of this.rings) r.t += edt;
    // combat state
    const inCombat = !p.dead && this.enemies.some((e) => e.aggro && e.state !== 'dissolve' && e.state !== 'return' && Math.hypot(e.x - inp.x, e.z - inp.z) < 45);
    if (inCombat !== p.inCombat) {
      p.inCombat = inCombat;
      this.out.push({ type: 'combat', on: inCombat });
    }
    return this.flush();
  }

  private flush(): SimEvent[] {
    const r = this.out.slice();
    this.out.length = 0;
    return r;
  }

  // ---- the player --------------------------------------------------------------------------------

  private playerResources(dt: number, inp: SimInput): void {
    const p = this.p;
    const s = this.opt.stats;
    const runCost = p.inCombat && inp.running && !inp.blocked;
    if (runCost) spend(p.st, COST.runPerS * s.staminaCost * dt);
    else regenStamina(p.st, dt);
    if (p.st.exhausted && runCost) {
      /* stays exhausted */
    }
    // Lebenskraft: out of combat after 6 s
    p.calm += dt;
    if (!p.inCombat && p.calm >= HP_REGEN.delay && p.hp < p.max) p.hp = Math.min(p.max, p.hp + HP_REGEN.perS * dt);
    // Bannlicht charges
    if (p.bann < p.bannMax) {
      p.bannT += dt;
      if (p.bannT >= s.bannRecharge) {
        p.bannT = 0;
        p.bann++;
      }
    } else p.bannT = 0;
    if (p.flare > 0) p.flare = Math.max(0, p.flare - dt);
    if (p.drink > 0) p.drink = Math.max(0, p.drink - dt);
  }

  private playerMoves(dt: number, inp: SimInput): void {
    const p = this.p;
    if (p.dodge) {
      p.dodge.t += dt;
      if (p.dodge.t >= DODGE.dur) p.dodge = null;
    }
    // the swing runs on (hit-stop holds it: we only get here when not frozen)
    if (p.swing) {
      const w = p.swing;
      w.t += dt;
      if (!w.resolved && w.t >= w.impact) this.resolveSwing(w, inp);
      if (w.t >= w.dur) {
        p.swing = null;
        p.lastCombo = w.kind === 'light' ? w.combo : -1;
        p.sinceSwing = 0;
        if (p.queued) {
          p.queued = false;
          this.startLight(inp);
        }
      }
    } else p.sinceSwing += dt;
    if (inp.blocked) {
      if (p.hold >= 0) this.endCharge();
      p.queued = false;
      return;
    }
    if (inp.dodgePressed && !inp.noDodge) this.tryDodge(inp);
    if (inp.bannPressed) this.tryBann(inp);
    // attack: tap = Hieb, hold ≥ 0.45 s = Wuchthieb
    if (inp.attackPressed) {
      if (p.swing) p.queued = p.swing.kind === 'light' && p.swing.dur - p.swing.t <= COMBO.buffer + 0.15;
      else if (!inp.attackDown) this.startLight(inp);
      else p.hold = 0;
    }
    if (p.hold >= 0 && !p.swing) {
      if (inp.attackDown) {
        p.hold += dt;
        if (p.hold >= HEAVY.tap && !p.charging) {
          if (canAct(p.st, COST.heavy)) {
            p.charging = true;
            this.out.push({ type: 'charge', on: true });
          }
        }
        if (p.charging && !p.chargeFull && p.hold >= HEAVY.full) {
          p.chargeFull = true;
          this.out.push({ type: 'chargeFull' });
        }
      } else {
        const held = p.hold;
        const charge = heavyCharge(held);
        const wasCharging = p.charging;
        this.endCharge();
        if (charge !== null && wasCharging) this.startHeavy(inp, charge);
        else this.startLight(inp);
      }
    } else if (p.hold >= 0 && p.swing && !inp.attackDown) p.hold = -1;
  }

  private endCharge(): void {
    const p = this.p;
    p.hold = -1;
    if (p.charging) this.out.push({ type: 'charge', on: false });
    p.charging = false;
    p.chargeFull = false;
  }

  private aimYaw(inp: SimInput, reach: number): number {
    const deg = this.opt.gentle ? COMBO.gentleAssistDeg : COMBO.assistDeg;
    const targets = this.enemies.filter((e) => e.state !== 'dissolve' && e.state !== 'leave');
    return assistYaw(inp.x, inp.z, inp.yaw, targets, reach, deg);
  }

  private startLight(inp: SimInput): void {
    const p = this.p;
    if (!canAct(p.st, COST.light)) {
      this.out.push({ type: 'tired' });
      return;
    }
    spend(p.st, COST.light * this.opt.stats.staminaCost);
    const combo = nextCombo(p.lastCombo, p.sinceSwing);
    p.swing = { kind: 'light', combo, t: 0, dur: COMBO.swing, impact: COMBO.impact, yaw: this.aimYaw(inp, COMBO.reach), charge: 0, resolved: false, hits: 0 };
    p.drink = 0;
    this.out.push({ type: 'swing', kind: 'light', combo, charge: 0 });
  }

  private startHeavy(inp: SimInput, charge: number): void {
    const p = this.p;
    if (!canAct(p.st, COST.heavy)) {
      this.out.push({ type: 'tired' });
      return;
    }
    spend(p.st, COST.heavy * this.opt.stats.staminaCost);
    p.swing = { kind: 'heavy', combo: 0, t: 0, dur: HEAVY.swing, impact: HEAVY.impact, yaw: this.aimYaw(inp, HEAVY.reach), charge, resolved: false, hits: 0 };
    p.lastCombo = -1;
    p.drink = 0;
    this.out.push({ type: 'swing', kind: 'heavy', combo: 0, charge });
  }

  private resolveSwing(w: Swing, inp: SimInput): void {
    w.resolved = true;
    const heavy = w.kind === 'heavy';
    const sweep = heavy && this.opt.sweep;
    const reach = heavy ? (sweep ? HEAVY.sweepReach : HEAVY.reach) : COMBO.reach;
    const arc = sweep ? 360 : heavy ? HEAVY.arcDeg : COMBO.arcDeg;
    // re-aim at impact (the target moved during the anticipation)
    const yaw = this.aimYaw({ ...inp, yaw: w.yaw }, reach);
    let hits = 0;
    let killed = false;
    // the nearest target in the arc takes the full hit, the next ones less (CLEAVE)
    const inArc = this.enemies
      .filter((e) => e.state !== 'dissolve' && e.state !== 'leave' && e.y - inp.y <= 3.2 && inCone(inp.x, inp.z, yaw, reach, arc, e.x, e.z, e.radius))
      .sort((a, b) => Math.hypot(a.x - inp.x, a.z - inp.z) - Math.hypot(b.x - inp.x, b.z - inp.z))
      .slice(0, sweep ? CLEAVE.sweep : heavy ? CLEAVE.heavy : CLEAVE.light);
    for (const e of inArc) {
      // flying things are reachable (the staff is 2 m long); only very high ones are out of reach
      if (this.hitEnemy(e, w, inp, hits === 0 ? 1 : CLEAVE.falloff)) killed = true;
      hits++;
    }
    w.hits = hits;
    if (!hits) this.out.push({ type: 'whiff', kind: w.kind });
    else {
      const rm = this.opt.reducedMotion ? 0.5 : 1;
      this.freeze = Math.max(this.freeze, (heavy || killed ? HITSTOP.heavy : HITSTOP.light) * rm);
    }
  }

  /** Apply one staff hit. Returns true if it undid the enemy. */
  private hitEnemy(e: Enemy, w: Swing, inp: SimInput, cleave = 1): boolean {
    const p = this.p;
    const dx = e.x - inp.x;
    const dz = e.z - inp.z;
    const d = Math.hypot(dx, dz) || 1;
    const dirX = dx / d;
    const dirZ = dz / d;
    if (this.safe) {
      this.out.push({ type: 'immune', e });
      return false;
    }
    if (e.def.needsBann && e.stun <= 0) {
      this.out.push({ type: 'immune', e });
      this.wake(e);
      return false;
    }
    const heavy = w.kind === 'heavy';
    const finisher = !heavy && w.combo >= COMBO.hits - 1;
    let mul = 1;
    let weak = false;
    let armored = false;
    let armor = 1;
    if (e.boss) {
      const b = bossHitMul(this.bossView(e), { x: inp.x, z: inp.z }, w.kind);
      mul = b.mul;
      weak = b.weak;
      armored = b.armored;
    } else {
      armor = armorFactor(e.def, w.kind, e, { x: inp.x, z: inp.z }, e.armorBroken > 0);
      armored = armor < 1;
      if (heavy && e.def.armor && e.def.armorFrontal) e.armorBroken = 6;
    }
    // a boss rising into its next phase (roar) or revealing itself cannot be hurt
    if (e.boss && (e.state === 'roar' || e.state === 'intro')) {
      this.out.push({ type: 'immune', e });
      return false;
    }
    e.hitX = dirX;
    e.hitZ = dirZ;
    // the Gnadenstoß: a low elite and a Wuchthieb
    if (e.elite && e.finishable && heavy && e.state !== 'dissolve') {
      const dmg = Math.ceil(e.hp);
      e.hp = 0;
      e.flash = 1;
      e.by = 'heavy';
      p.counter = false;
      this.freeze = Math.max(this.freeze, HITSTOP.heavy * 1.8 * (this.opt.reducedMotion ? 0.5 : 1));
      if (!this.opt.reducedMotion) this.slowmo = Math.max(this.slowmo, 0.4);
      this.out.push({ type: 'hit', e, damage: dmg, heavy: true, finisher: true, weak: true, armored: false, gebannt: e.stun > 0, dirX, dirZ });
      this.out.push({ type: 'finisher', e });
      this.kill(e, 'heavy');
      return true;
    }
    const counter = p.counter;
    p.counter = false;
    const dmg = hitDamage(this.opt.stats, { kind: w.kind, combo: w.combo, charge: w.charge, gebannt: e.stun > 0 && !e.boss, armor, counter, mul: mul * cleave, jitter: hash01(this.tick * 13 + e.seed * 1000) });
    e.hp = applyDamage(e.kind, e.hp, e.maxHp, dmg);
    // one hit crosses at most one phase line (playtest: the Steinbrecher's phase 3 lasted 0 s)
    if (e.boss && e.hp > 0) e.hp = Math.max(e.hp, bossPhaseFloor(e.phase, e.maxHp, e.def.phases ?? []));
    else if (e.boss && e.def.phases?.length && e.phase <= e.def.phases.length) e.hp = Math.max(1, bossPhaseFloor(e.phase, e.maxHp, e.def.phases));
    e.flash = 1;
    e.by = heavy ? 'heavy' : 'light';
    this.wake(e);
    // knockback (bosses barely move) and stagger
    const kb = (heavy ? KNOCK.heavy : finisher ? KNOCK.finisher : KNOCK.light) * (e.boss ? 0.12 : e.kind === 'steinfresser' ? 0.35 : 1);
    e.vx += dirX * kb * 8;
    e.vz += dirZ * kb * 8;
    if (!e.boss && (heavy || (finisher && this.opt.dritter) || (finisher && e.def.hp <= 25 && !e.elite))) this.staggerEnemy(e, heavy ? (e.elite ? 0.45 : 0.6) : 0.4);
    if (e.boss) {
      e.poise += dmg * this.opt.stats.stagger;
      if (e.poise > e.maxHp * 0.16) {
        e.poise = 0;
        this.staggerEnemy(e, 0.9);
      }
    }
    this.out.push({ type: 'hit', e, damage: dmg, heavy, finisher, weak, armored, gebannt: e.stun > 0, dirX, dirZ });
    if (e.elite && e.hp > 0) {
      if (!e.enraged && e.hp <= e.maxHp * 0.5) {
        e.enraged = true;
        this.out.push({ type: 'enrage', e });
      }
      if (!e.finishable && e.hp <= e.maxHp * 0.25) {
        e.finishable = true;
        this.out.push({ type: 'finishable', e });
      }
    }
    if (e.kind === 'steinbrecher' && (weak || heavy) && dmg >= 10) this.out.push({ type: 'block', e, x: e.x, y: e.y + 2.2, z: e.z });
    if (e.boss) this.checkPhase(e);
    if (e.kind === 'pikeur' && pikeurLeaves(e.hp, e.maxHp) && e.state !== 'leave') {
      this.setState(e, 'leave');
      this.tokens.release(e.id);
      this.dropRings(e);
      this.out.push({ type: 'leave', e });
      return false;
    }
    if (e.hp <= 0) {
      this.kill(e, e.by);
      return true;
    }
    return false;
  }

  private staggerEnemy(e: Enemy, s: number): void {
    if (e.state === 'dissolve' || e.state === 'leave' || e.state === 'roar') return;
    this.tokens.release(e.id);
    this.dropRings(e);
    e.dash = null;
    e.stagger = s;
    this.setState(e, 'stagger');
  }

  private tryDodge(inp: SimInput): void {
    const p = this.p;
    if (p.dodge) return;
    if (!canAct(p.st, COST.dodge)) {
      this.out.push({ type: 'tired' });
      return;
    }
    spend(p.st, COST.dodge * this.opt.stats.staminaCost);
    let dx = inp.moveX;
    let dz = inp.moveZ;
    const l = Math.hypot(dx, dz);
    if (l < 0.01) {
      const f = forwardOf(inp.yaw);
      dx = -f.x;
      dz = -f.z;
    } else {
      dx /= l;
      dz /= l;
    }
    const perfect = this.incomingWithin(inp, DODGE.perfect);
    p.dodge = { t: 0, perfect };
    p.drink = 0;
    if (p.hold >= 0) this.endCharge();
    const v = dodgeSpeed();
    if (perfect) {
      this.slowmo = this.opt.reducedMotion ? 0 : DODGE.slowmo;
      if (this.opt.konter) p.counter = true;
    }
    this.out.push({ type: 'dodge', vx: dx * v, vz: dz * v, perfect });
  }

  /** Will a telegraphed hit land on the player within `s` seconds (perfect-dodge window)? */
  private incomingWithin(inp: SimInput, s: number): boolean {
    for (const e of this.enemies) {
      if (e.state !== 'windup' || !e.attack) continue;
      const left = e.windup - e.t;
      const a = e.attack;
      const d = Math.hypot(e.x - inp.x, e.z - inp.z);
      const reach = a.kind === 'area' ? a.range + 0.5 : a.kind === 'ranged' || a.kind === 'summon' ? -1 : a.range + 1.5;
      if (reach > 0 && d <= reach && isPerfectDodge(left)) return true;
      if (a.kind === 'area' && e.rings.length && isPerfectDodge(left)) {
        for (const id of e.rings) {
          const r = this.rings.find((x) => x.id === id);
          if (r && Math.hypot(r.x - inp.x, r.z - inp.z) <= r.r + 0.5) return true;
        }
      }
    }
    for (const e of this.enemies) if (e.dash && !e.dash.hit && Math.hypot(e.x - inp.x, e.z - inp.z) < Math.hypot(e.dash.vx, e.dash.vz) * s + 1.5) return true;
    for (const pr of this.projectiles) {
      const left = pr.life - pr.t;
      if (pr.lob) {
        if (isPerfectDodge(left) && Math.hypot(pr.tx - inp.x, pr.tz - inp.z) < pr.r + 0.5) return true;
      } else {
        const d = Math.hypot(pr.x - inp.x, pr.z - inp.z);
        const v = Math.hypot(pr.vx, pr.vz) || 1;
        if (isPerfectDodge(d / v)) return true;
      }
    }
    return false;
  }

  private tryBann(inp: SimInput): void {
    const p = this.p;
    const s = this.opt.stats;
    if (p.bann < 1) {
      this.out.push({ type: 'noBann' });
      return;
    }
    p.bann--;
    p.flare = BANN.flare;
    let hits = 0;
    for (const e of this.enemies) {
      if (e.state === 'dissolve' || e.state === 'leave') continue;
      if (!inCone(inp.x, inp.z, inp.yaw, s.bannRange, s.bannAngle, e.x, e.z, e.radius)) continue;
      if (e.y - inp.y > 4) continue;
      hits++;
      this.wake(e);
      if (e.kind === 'schuldbuch') {
        e.sealOpen = BANN.sealOpen;
        e.stun = 1.2;
        this.staggerEnemy(e, 1.2);
        this.out.push({ type: 'stun', e, seconds: BANN.sealOpen });
        continue;
      }
      if (e.def.bannStun <= 0) continue;
      const sec = e.def.bannStun * s.bannStun * (e.boss ? 0.6 : 1);
      e.stun = sec;
      this.tokens.release(e.id);
      this.dropRings(e);
      e.dash = null;
      this.setState(e, 'gebannt');
      this.out.push({ type: 'stun', e, seconds: sec });
      if (this.opt.waerme) {
        const amt = Math.min(p.max - p.hp, 4);
        if (amt > 0) {
          p.hp += amt;
          this.out.push({ type: 'heal', amount: amt, by: 'laternenwaerme' });
        }
      }
    }
    this.out.push({ type: 'bann', x: inp.x, z: inp.z, yaw: inp.yaw, range: s.bannRange, angle: s.bannAngle, hits });
  }

  /** Quick-use animation lock (progression consumed the item). */
  drink(): void {
    this.p.drink = 0.6;
    if (this.p.hold >= 0) this.endCharge();
  }

  heal(amount: number, by: string): number {
    const p = this.p;
    if (p.dead) return 0;
    const a = Math.max(0, Math.min(p.max - p.hp, amount));
    p.hp += a;
    if (a > 0) this.out.push({ type: 'heal', amount: a, by });
    return a;
  }

  /** Full heal (field station, anchors, wake). */
  restore(): void {
    const p = this.p;
    p.hp = p.max;
    p.st.stamina = p.st.max;
    p.st.exhausted = false;
    p.bann = p.bannMax;
    p.dead = false;
  }

  /** Kalkstaub: stun spectral enemies within r around the player. */
  burst(r: number): number {
    let n = 0;
    for (const e of this.enemies) {
      if (e.state === 'dissolve' || e.state === 'leave' || e.def.bannStun <= 0) continue;
      if (Math.hypot(e.x - this.px, e.z - this.pz) > r + e.radius) continue;
      e.stun = Math.max(e.stun, e.def.bannStun * (e.boss ? 0.5 : 1));
      this.tokens.release(e.id);
      this.dropRings(e);
      this.setState(e, 'gebannt');
      this.out.push({ type: 'stun', e, seconds: e.stun });
      n++;
    }
    return n;
  }

  /**
   * Damage the player. Returns the damage dealt (0: evaded, god mode, safe, dead).
   */
  /** Kind of the last enemy that hurt the player (the curtain names the family). */
  lastHitBy = '';

  hurtPlayer(raw: number, by: string, from: { x: number; z: number }, tier = 1, heavy = false): number {
    const p = this.p;
    if (p.dead || this.safe) return 0;
    if (p.dodge && dodgeInvulnerable(p.dodge.t)) {
      this.out.push({ type: 'evade', by });
      return 0;
    }
    const amount = enemyDamage(raw, tier, this.opt.stats.damageTaken);
    if (amount <= 0) return 0;
    this.lastHitBy = by;
    let dx = this.px - from.x;
    let dz = this.pz - from.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const push = (2 * 1.2) / 0.25;
    p.calm = 0;
    p.drink = 0;
    if (p.hold >= 0) this.endCharge();
    if (!p.god) p.hp = Math.max(0, p.hp - amount);
    const rm = this.opt.reducedMotion ? 0.5 : 1;
    this.freeze = Math.max(this.freeze, HITSTOP.player * rm);
    this.out.push({ type: 'playerHit', damage: amount, by, x: from.x, z: from.z, pushX: dx * push, pushZ: dz * push, heavy });
    if (p.hp <= 0) {
      p.dead = true;
      p.swing = null;
      p.dodge = null;
      p.queued = false;
      this.out.push({ type: 'died', by });
    }
    return amount;
  }

  // ---- enemies -------------------------------------------------------------------------------

  private setState(e: Enemy, s: EnemyState): void {
    e.state = s;
    e.t = 0;
  }

  /** Being hit / flared wakes an enemy up (aggro). */
  private wake(e: Enemy): void {
    if (e.aggro || e.state === 'dissolve' || e.state === 'leave') return;
    e.aggro = true;
    if (e.boss) e.engaged = true;
    this.out.push({ type: 'aggro', e, on: true });
    if (e.state === 'idle' || e.state === 'return') this.setState(e, 'approach');
  }

  private bossView(e: Enemy): BossView {
    return { kind: e.kind, x: e.x, z: e.z, heading: e.heading, phase: e.phase, sealOpen: e.sealOpen, stun: e.stun, cd: e.cd, attacks: e.def.attacks, adds: this.enemies.filter((x) => x.add && x.group === `${e.group}+adds` && x.state !== 'dissolve').length };
  }

  private checkPhase(e: Enemy): void {
    const ph = bossPhase(e.hp / e.maxHp, e.def.phases ?? []);
    if (ph <= e.phase) return;
    e.phase = ph;
    this.out.push({ type: 'phase', e, phase: ph });
    if (e.state !== 'leave' && e.hp > 0) {
      this.tokens.release(e.id);
      this.dropRings(e);
      e.dash = null;
      this.setState(e, 'roar');
    }
  }

  private kill(e: Enemy, by: KillBy): void {
    if (e.state === 'dissolve') return;
    this.tokens.release(e.id);
    this.dropRings(e);
    // the Pikeur is never undone: he keeps his last strength and rides off
    if (e.kind !== 'pikeur') e.hp = 0;
    e.dash = null;
    e.aggro = false;
    this.setState(e, 'dissolve');
    this.out.push({ type: 'killed', e, by });
    if (!e.add) {
      const g = this.groups[e.group];
      if (g) {
        if (e.elite) g.eliteDown = true;
        g.killed = Math.min(g.count, g.killed + 1);
        if (isCleared(g)) {
          this.clearedAt.set(g.group, this.time);
          this.out.push({ type: 'cleared', group: g.group, kind: g.kind });
        }
      }
    }
    if (e.boss) {
      // the boss's adds come apart with it
      for (const a of this.enemies) if (a.add && a.group === `${e.group}+adds` && a.state !== 'dissolve') this.kill(a, 'env');
    }
  }

  /** Debug: undo an enemy (or every member of a group). */
  killNow(target?: string): number {
    let n = 0;
    for (const e of [...this.enemies]) {
      if (e.state === 'dissolve') continue;
      if (target && e.id !== target && e.group !== target && e.kind !== target && e.group !== `${target}+escort`) continue;
      if (e.kind === 'pikeur') {
        e.hp = Math.ceil(e.maxHp * 0.12);
        this.setState(e, 'leave');
        this.out.push({ type: 'leave', e });
      } else this.kill(e, 'light');
      n++;
    }
    return n;
  }

  private canAggro(e: Enemy, d: number): boolean {
    if (this.safe || this.p.dead) return false;
    return d < bodyOf(e.kind).aggro;
  }

  private turnTo(e: Enemy, h: number, rate: number, dt: number): void {
    const diff = wrapAngle(h - e.heading);
    const m = rate * dt;
    e.heading = wrapAngle(e.heading + Math.max(-m, Math.min(m, diff)));
  }

  private moveBy(e: Enemy, mx: number, mz: number): void {
    const nx = e.x + mx;
    const nz = e.z + mz;
    const fly = e.hover > 0.5;
    if (!fly && this.world.walkable && !this.world.walkable(nx, nz)) {
      if (this.world.walkable(nx, e.z)) e.x = nx;
      else if (this.world.walkable(e.x, nz)) e.z = nz;
      return;
    }
    e.x = nx;
    e.z = nz;
  }

  private moveToward(e: Enemy, tx: number, tz: number, speed: number, dt: number, arrive = 0.2): number {
    const dx = tx - e.x;
    const dz = tz - e.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) this.turnTo(e, headingOf(dx, dz), bodyOf(e.kind).turn, dt);
    if (d <= arrive) return d;
    const step = Math.min(d - arrive, speed * dt);
    this.moveBy(e, (dx / d) * step, (dz / d) * step);
    return d - step;
  }

  private think(e: Enemy, dt: number, inp: SimInput): void {
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt * 5);
    for (const k in e.cd) if (e.cd[k] > 0) e.cd[k] = Math.max(0, e.cd[k] - dt);
    if (e.sealOpen > 0) e.sealOpen = Math.max(0, e.sealOpen - dt);
    if (e.armorBroken > 0) e.armorBroken = Math.max(0, e.armorBroken - dt);
    if (e.slipCd > 0) e.slipCd = Math.max(0, e.slipCd - dt);
    // an escort whose group is undone (or gone) drifts off into the fog
    if (e.escort && e.state !== 'dissolve') {
      const host = this.groups[escortHost(e.group) ?? ''];
      const hostLive = this.enemies.some((x) => x.group === host?.group && x.state !== 'dissolve');
      if (!host || (isCleared(host) && !hostLive)) {
        e.orphan += dt;
        if (e.orphan > 1.1) {
          this.out.push({ type: 'drift', e });
          this.kill(e, 'env');
          return;
        }
      } else e.orphan = 0;
    }
    // knockback velocity
    if (Math.abs(e.vx) + Math.abs(e.vz) > 0.01) {
      this.moveBy(e, e.vx * dt, e.vz * dt);
      const k = Math.exp(-8 * dt);
      e.vx *= k;
      e.vz *= k;
    }
    if (e.state === 'dissolve') {
      if (e.t > 1.6) {
        const i = this.enemies.indexOf(e);
        if (i >= 0) this.enemies.splice(i, 1);
      }
      return;
    }
    const px = inp.x;
    const pz = inp.z;
    const dx = px - e.x;
    const dz = pz - e.z;
    const d = Math.hypot(dx, dz);
    const toP = headingOf(dx, dz);
    const sp = e.def.speed;
    const ground = this.world.heightAt(e.x, e.z);
    let hover = e.hover;
    // gebannt light / paper lies on the ground
    if (e.stun > 0 && (e.kind === 'irrlicht' || e.kind === 'mahnbrief')) hover = 0.25;
    e.y += (ground + hover - e.y) * Math.min(1, dt * (e.stun > 0 ? 6 : 4));
    if (e.stun > 0) {
      e.stun = Math.max(0, e.stun - dt);
      if (e.stun <= 0 && e.state === 'gebannt') this.setState(e, e.aggro ? 'approach' : 'idle');
    }
    // leash: too far from home, or the player walked away / into safety
    if (e.aggro && e.state !== 'leave' && e.state !== 'gebannt' && (leashBroken(e.home, e, inp, e.leash) || this.safe)) {
      e.aggro = false;
      this.tokens.release(e.id);
      this.dropRings(e);
      e.dash = null;
      this.out.push({ type: 'aggro', e, on: false });
      this.setState(e, 'return');
    }
    switch (e.state) {
      case 'idle': {
        // drift about the spawn
        const wx = e.home.x + Math.cos(e.orbit + this.time * 0.15) * 1.5;
        const wz = e.home.z + Math.sin(e.orbit + this.time * 0.15) * 1.5;
        this.moveToward(e, wx, wz, sp * 0.25, dt, 0.3);
        if (this.canAggro(e, d) && !leashBroken(e.home, e, inp, e.leash)) {
          e.aggro = true;
          if (e.boss) e.engaged = true;
          // a boss met for the first time reveals itself (camera, title card, sting)
          if (e.boss && !this.introSeen.has(e.group)) {
            this.introSeen.add(e.group);
            this.setState(e, 'intro');
            this.out.push({ type: 'intro', e, dur: BOSS_INTRO });
          } else this.setState(e, 'notice');
          this.out.push({ type: 'aggro', e, on: true });
          if (!e.boss) this.alertPack(e);
        }
        break;
      }
      case 'notice':
        this.turnTo(e, toP, bodyOf(e.kind).turn, dt);
        if (e.t >= AI.notice) this.setState(e, e.kind === 'raffschatten' && e.fled === 0 ? 'flee' : 'approach');
        break;
      case 'intro':
        // the reveal: it turns to you and rises; nothing hurts it, it hurts nothing
        this.turnTo(e, toP, 2.2, dt);
        if (e.t >= BOSS_INTRO) this.setState(e, 'approach');
        break;
      case 'retreat': {
        // hit and run: fall back a few metres, then come again
        const l = d || 1;
        this.moveToward(e, e.x - (dx / l) * 3, e.z - (dz / l) * 3, sp * 0.85, dt, 0);
        this.turnTo(e, toP, bodyOf(e.kind).turn, dt);
        if (e.t > 0.55 + e.seed * 0.4 || d > 7) this.setState(e, 'approach');
        break;
      }
      case 'return': {
        const left = this.moveToward(e, e.home.x, e.home.z, sp * 1.2, dt, 1);
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.5 * dt);
        if (left <= 1.05 || e.t > 12) {
          e.hp = e.maxHp;
          if (e.boss) {
            e.phase = 1;
            e.sealOpen = 0;
          }
          this.setState(e, 'idle');
        }
        break;
      }
      case 'flee': {
        // Raffschatten: runs off with what it grabbed; fights when cornered
        const away = { x: e.x - dx, z: e.z - dz };
        this.moveToward(e, away.x, away.z, sp * 1.15, dt, 0);
        const fromHome = Math.hypot(e.x - e.home.x, e.z - e.home.z);
        const blocked = this.world.walkable ? !this.world.walkable(e.x - (dx / (d || 1)) * 1.2, e.z - (dz / (d || 1)) * 1.2) : false;
        // one short dash away (playtest round 2: a long chase across the field was a chore)
        if (e.t > 1.4 || d < 2.2 || blocked || fromHome > e.leash * 0.6) {
          e.fled++;
          this.setState(e, 'approach');
        }
        break;
      }
      case 'approach':
      case 'circle':
        this.approach(e, dt, inp, d, toP);
        break;
      case 'windup':
        this.windupStep(e, dt, inp, d, toP);
        break;
      case 'strike':
        this.strikeStep(e, dt, inp);
        break;
      case 'recover': {
        const rec = e.boss ? 0.95 : e.kind === 'streuner' ? 0.85 : e.kind === 'grusling' ? 0.4 : AI.recover;
        if (e.t >= rec) {
          this.tokens.release(e.id);
          // hit and run: some fall back after a blow and come again from another side
          const run = HIT_AND_RUN.has(e.kind) && hash01(this.tick * 7 + e.seed * 131) > 0.4;
          this.setState(e, run ? 'retreat' : 'approach');
          if (run) e.slot += e.orbitDir * 0.9;
          // the Raffschatten runs only once (a second chase across the field was a chore, playtest round 2)
        }
        break;
      }
      case 'gebannt':
        // stays put, a little drift; the stun timer above ends it
        if (e.stun <= 0) this.setState(e, 'approach');
        break;
      case 'stagger':
        e.stagger -= dt;
        if (e.stagger <= 0) this.setState(e, e.aggro ? 'approach' : 'idle');
        break;
      case 'roar':
        // phase change: rises, calls, summons (invulnerable to nothing — but doesn't attack)
        this.turnTo(e, toP, 1.5, dt);
        if (e.t > 1.3) {
          const s = summonOf(e.kind, e.phase);
          this.summon(e, s.kind, Math.max(1, s.n - 1));
          this.setState(e, 'approach');
        }
        break;
      case 'leave': {
        // Pikeur: "verloren" — rides off into the fog
        const away = headingOf(-dx, -dz);
        this.turnTo(e, away, 3, dt);
        const f = forwardOf(e.heading);
        e.x += f.x * 9 * dt;
        e.z += f.z * 9 * dt;
        if (e.t > 3.2) this.kill(e, e.by);
        break;
      }
      default:
        break;
    }
  }

  private pickAttack(e: Enemy, d: number): EnemyAttackDef | null {
    if (e.boss) return chooseBossAttack(this.bossView(e), d);
    let best: EnemyAttackDef | null = null;
    for (const a of e.def.attacks) {
      if ((e.cd[a.id] ?? 0) > 0) continue;
      if (a.kind === 'summon') continue;
      // prefer the attack whose range fits the distance best
      if (!best || Math.abs(wantDist(a) - d) < Math.abs(wantDist(best) - d)) best = a;
    }
    return best;
  }

  /**
   * Surround (fun pass): the melee enemies near the player spread round them — each works towards
   * a bearing of its own, pushed apart from its neighbours; flankers lean towards the player's back.
   * Casters keep their own distance and take no slot.
   */
  private assignSlots(inp: SimInput, dt: number): void {
    const L = this.enemies.filter((e) => e.aggro && !e.boss && !KITERS.has(e.kind) && e.state !== 'dissolve' && e.state !== 'leave' && Math.hypot(e.x - inp.x, e.z - inp.z) < 18);
    const n = L.length;
    if (!n) return;
    const sep = Math.max(0.75, Math.min(2.0, ((Math.PI * 2) / n) * 0.9));
    // the player's back as a bearing (forward = (−sin yaw, −cos yaw))
    const back = Math.atan2(Math.cos(this.pyaw), Math.sin(this.pyaw));
    for (let i = 0; i < n; i++) {
      const e = L[i]!;
      const bear = Math.atan2(e.z - inp.z, e.x - inp.x);
      let want = e.slot;
      let push = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = wrapAngle(L[j]!.slot - want);
        const ad = Math.abs(d);
        if (ad < sep) push -= (d === 0 ? (e.seed > L[j]!.seed ? -1 : 1) : Math.sign(d)) * (sep - ad) * 0.5;
      }
      want += push;
      if (n >= 2 && (FLANKERS.has(e.kind) || e.elite)) want += wrapAngle(back - want) * 0.25;
      // a slot never runs far from where the body is (it walks round, it does not teleport)
      want = bear + Math.max(-1.6, Math.min(1.6, wrapAngle(want - bear)));
      e.slot = wrapAngle(e.slot + wrapAngle(want - e.slot) * Math.min(1, dt * 3));
    }
  }

  /** One of a pack noticed the player: the others (and the escorts) come too. */
  private alertPack(e: Enemy): void {
    const root = escortHost(e.group) ?? e.group;
    let n = 0;
    for (const o of this.enemies) {
      if (o === e || o.aggro || o.state !== 'idle') continue;
      if (o.group !== root && o.group !== `${root}+escort`) continue;
      if (Math.hypot(o.x - e.x, o.z - e.z) > 26) continue;
      o.aggro = true;
      this.setState(o, 'notice');
      o.t = -0.15 - o.seed * 0.35;
      this.out.push({ type: 'aggro', e: o, on: true });
      n++;
    }
    if (n) this.out.push({ type: 'packAlert', e, n });
  }

  private approach(e: Enemy, dt: number, inp: SimInput, d: number, toP: number): void {
    if (!e.aggro) {
      this.setState(e, 'idle');
      return;
    }
    const sp = e.def.speed * (e.enraged ? 1.25 : 1);
    const a = this.pickAttack(e, d);
    let want = a ? wantDist(a) : 3.5;
    // a boss keeps a stand-off that matches its size (the camera never sits inside it)
    if (e.boss) want = Math.max(want, e.radius + 1.5);
    e.tryT += dt;
    // Irrlicht: blinks sideways now and then
    if (e.kind === 'irrlicht') {
      e.blinkT -= dt;
      if (e.blinkT <= 0) {
        e.blinkT = 3 + hash01(this.tick + e.seed * 50) * 2.5;
        const fx = e.x;
        const fz = e.z;
        const side = hash01(this.tick * 3 + e.seed) > 0.5 ? 1 : -1;
        const r = Math.cos(toP) * side * 4;
        const q = -Math.sin(toP) * side * 4;
        e.x += r;
        e.z += q;
        this.out.push({ type: 'blink', e, fromX: fx, fromZ: fz });
      }
    }
    // Nebelweber: come close and it slips back into the fog (retreat and return)
    if (e.kind === 'nebelweber' && d < 4.2 && e.slipCd <= 0) {
      const fx = e.x;
      const fz = e.z;
      // away from the player, a little to its side
      const b = Math.atan2(e.z - inp.z, e.x - inp.x) + e.orbitDir * 0.5;
      let nx = inp.x + Math.cos(b) * 8.5;
      let nz = inp.z + Math.sin(b) * 8.5;
      if (this.world.walkable && !this.world.walkable(nx, nz)) {
        const l = d || 1;
        nx = e.x + ((e.x - inp.x) / l) * 4;
        nz = e.z + ((e.z - inp.z) / l) * 4;
      }
      e.x = nx;
      e.z = nz;
      e.slipCd = 6 + e.seed * 2;
      this.out.push({ type: 'blink', e, fromX: fx, fromZ: fz });
      return;
    }
    const inRange = a ? (a.kind === 'summon' ? true : d <= want + (a.kind === 'ranged' ? 3 : 0.4) && (a.kind !== 'ranged' || d > 3)) : false;
    // attacks come in a rhythm: one pack wind-up at a time starts, the next a moment later
    const land = a ? this.time + telegraphTime(a, this.opt.gentle) + (a.kind === 'ranged' ? Math.min(1.1, d / 15) : 0) : 0;
    const gapOk = e.boss || a?.kind === 'summon' || (this.time >= this.nextAttackAt && land >= this.lastLand + (this.opt.gentle ? ATTACK_GAP.gentleLand : ATTACK_GAP.land));
    if (a && inRange && e.tryT > 0.25 && gapOk) {
      e.tryT = 0;
      const token = e.boss || a.kind === 'summon' || this.tokens.request(e.id);
      if (token) {
        this.beginWindup(e, a, inp);
        if (!e.boss) {
          this.nextAttackAt = this.time + (this.opt.gentle ? ATTACK_GAP.gentle : ATTACK_GAP.min + hash01(this.tick + e.seed * 7) * ATTACK_GAP.spread);
          this.lastLand = Math.max(this.lastLand, land);
        }
        return;
      }
    }
    const kiter = KITERS.has(e.kind);
    // close in, or wait round the player at its slot while somebody else attacks
    const holding = a && !e.boss && !kiter && this.tokens.count >= this.tokens.max && !this.tokens.has(e.id);
    if (holding || (e.state === 'circle' && d < 7)) {
      if (e.state !== 'circle') this.setState(e, 'circle');
      const r = Math.max(want + 1.4, 3.6);
      const b = Math.atan2(e.z - inp.z, e.x - inp.x);
      const nb = b + Math.max(-0.5, Math.min(0.5, wrapAngle(e.slot - b)));
      this.moveToward(e, inp.x + Math.cos(nb) * r, inp.z + Math.sin(nb) * r, sp * 0.7, dt, 0.3);
      this.turnTo(e, toP, bodyOf(e.kind).turn, dt);
      if (!holding && e.t > 0.5) this.setState(e, 'approach');
      return;
    }
    if (e.state === 'circle') this.setState(e, 'approach');
    if (a && a.kind === 'ranged' && d < want - 2) {
      // too close for a ranged attacker: back off a little
      this.moveToward(e, e.x - (inp.x - e.x), e.z - (inp.z - e.z), sp * 0.6, dt, 0);
      this.turnTo(e, toP, bodyOf(e.kind).turn * 2, dt);
      return;
    }
    let tx = inp.x;
    let tz = inp.z;
    let arrive = want * 0.9;
    if (!e.boss && !kiter && d > want + 0.6) {
      // walk round towards its slot while closing in (the pack surrounds; flankers come from behind)
      const b = Math.atan2(e.z - inp.z, e.x - inp.x);
      const nb = b + Math.max(-0.55, Math.min(0.55, wrapAngle(e.slot - b)));
      const rr = Math.max(want * 0.85, d - 2.2);
      tx = inp.x + Math.cos(nb) * rr;
      tz = inp.z + Math.sin(nb) * rr;
      arrive = 0.1;
    }
    const swarm = e.kind === 'grusling' || e.kind === 'mahnbrief';
    if (swarm) {
      tx += Math.cos(e.orbit + this.time * 1.7) * 1.1;
      tz += Math.sin(e.orbit + this.time * 1.7) * 1.1;
    }
    if (d > want) {
      this.moveToward(e, tx, tz, sp, dt, arrive);
      if (arrive < 0.2) this.turnTo(e, toP, bodyOf(e.kind).turn * 0.5, dt);
    } else {
      this.turnTo(e, toP, bodyOf(e.kind).turn, dt);
      // a boss right on top of the player steps back to its stand-off
      if (e.boss && d < e.radius + 0.9) this.moveToward(e, e.x - (inp.x - e.x), e.z - (inp.z - e.z), sp * 0.5, dt, 0);
    }
  }

  private beginWindup(e: Enemy, a: EnemyAttackDef, inp: SimInput): void {
    const dur = telegraphTime(a, this.opt.gentle);
    e.attack = a;
    e.windup = dur;
    e.aim = { x: inp.x, z: inp.z };
    this.setState(e, 'windup');
    // area attacks draw a ground ring that fills up
    if (a.kind === 'area') {
      if (e.kind === 'strohmann') {
        for (const s of sparkRain(inp.x, inp.z, e.phase, hash01(this.tick + e.seed))) this.addRing(e, s.x, s.z, 2.4, dur, 'rain');
      } else this.addRing(e, e.x, e.z, a.range, dur, 'area');
    }
    // a boss's swing draws its reach on the ground too: up close its body may fill the view
    if (e.boss && (a.kind === 'melee' || a.kind === 'lunge')) this.addRing(e, e.x, e.z, a.range + 0.4, dur, 'landing');
    this.out.push({ type: 'telegraph', e, attack: a, dur });
  }

  private addRing(e: Enemy, x: number, z: number, r: number, dur: number, kind: Ring['kind']): number {
    const id = ++this.idSeq;
    this.rings.push({ id, x, z, r, t: 0, dur, owner: e.id, kind });
    e.rings.push(id);
    return id;
  }

  private windupStep(e: Enemy, dt: number, inp: SimInput, d: number, toP: number): void {
    const a = e.attack;
    if (!a) {
      this.setState(e, 'approach');
      return;
    }
    // track the player until 70 % of the wind-up, then commit (the dodge window)
    if (e.t < e.windup * 0.7) {
      this.turnTo(e, toP, bodyOf(e.kind).turn * 1.5, dt);
      e.aim = { x: inp.x, z: inp.z };
    }
    // area rings follow their owner (self-centred slams)
    if ((a.kind === 'area' && e.kind !== 'strohmann') || (e.boss && (a.kind === 'melee' || a.kind === 'lunge'))) for (const id of e.rings) {
      const r = this.rings.find((x) => x.id === id);
      if (r && r.kind !== 'rain') {
        r.x = e.x;
        r.z = e.z;
      }
    }
    void d;
    if (e.t >= e.windup) this.strike(e, a, inp);
  }

  private strike(e: Enemy, a: EnemyAttackDef, inp: SimInput): void {
    this.setState(e, 'strike');
    this.out.push({ type: 'strike', e, attack: a });
    e.cd[a.id] = e.boss ? bossCooldown(a.cooldown, e.phase) : a.cooldown * (e.enraged ? 0.7 : 1);
    const by = e.kind;
    const dmg = a.damage * e.dmgMul;
    const d = Math.hypot(inp.x - e.x, inp.z - e.z);
    switch (a.kind) {
      case 'melee': {
        const arc = e.kind === 'strohmann' ? 170 : 110;
        if (inCone(e.x, e.z, e.heading, a.range + 0.4, arc, inp.x, inp.z, 0.35)) this.hurtPlayer(dmg, by, e, e.tier, e.boss);
        break;
      }
      case 'area': {
        for (const id of e.rings) {
          const r = this.rings.find((x) => x.id === id);
          if (r && Math.hypot(inp.x - r.x, inp.z - r.z) <= r.r + 0.3) {
            this.hurtPlayer(dmg, by, r, e.tier, true);
            break;
          }
        }
        this.dropRings(e);
        if (e.kind === 'glutling') {
          // it bursts itself: the player's kill only if the staff had already struck it
          this.out.push({ type: 'burst', e });
          this.kill(e, e.hp < e.maxHp ? e.by : 'env');
        }
        break;
      }
      case 'lunge': {
        const dist = Math.max(1.5, Math.min(a.range + 1, d + 0.8));
        const T = 0.22;
        const f = forwardOf(e.heading);
        e.dash = { vx: (f.x * dist) / T, vz: (f.z * dist) / T, t: T, hit: false };
        break;
      }
      case 'charge': {
        const dist = Math.max(8, Math.min(a.range, d + 6));
        const v = 16;
        const f = forwardOf(headingOf(e.aim.x - e.x, e.aim.z - e.z));
        e.heading = headingOf(f.x, f.z);
        e.dash = { vx: f.x * v, vz: f.z * v, t: dist / v, hit: false };
        break;
      }
      case 'ranged':
        this.shoot(e, a, inp);
        break;
      case 'summon': {
        const s = summonOf(e.kind, e.phase);
        this.summon(e, s.kind, s.n);
        break;
      }
    }
  }

  private shoot(e: Enemy, a: EnemyAttackDef, inp: SimInput): void {
    if (e.kind === 'steinbrecher' || a.id === 'frostkugel' || a.id === 'brocken') {
      // a block / a ball of frost lobbed at where you stand, with a landing ring: move!
      const life = e.kind === 'steinbrecher' ? 1.15 : 1.05;
      const r = a.id === 'frostkugel' ? 1.9 : 1.8;
      const pr = this.addProjectile(e, a, e.x, e.y + (e.kind === 'steinbrecher' ? 3.2 : 1.4), e.z, (inp.x - e.x) / life, 4.5, (inp.z - e.z) / life, life, true, inp.x, inp.z, r);
      pr.damage *= e.dmgMul;
      pr.ring = this.addRing(e, inp.x, inp.z, r, life, 'landing');
      e.rings = e.rings.filter((id) => id !== pr.ring);
      return;
    }
    const n = e.kind === 'schuldbuch' ? sealBolts(e.phase) : a.id === 'funkenfaecher' ? 3 : 1;
    const speed = e.kind === 'irrlicht' ? 13 : a.id === 'eisnadel' ? 18 : 15;
    const sy = e.y + (e.boss ? 1.6 : 0.2);
    const base = headingOf(inp.x - e.x, inp.z - e.z);
    for (let i = 0; i < n; i++) {
      const h = base + (n > 1 ? (i / (n - 1) - 0.5) * 0.9 : 0);
      const f = forwardOf(h);
      const d = Math.hypot(inp.x - e.x, inp.z - e.z);
      const life = Math.min(2.2, (a.range + 4) / speed);
      const vy = (inp.y + 1.3 - sy) / Math.max(0.3, d / speed);
      const pr = this.addProjectile(e, a, e.x + f.x * e.radius, sy, e.z + f.z * e.radius, f.x * speed, vy, f.z * speed, life, false, 0, 0, 0.75);
      pr.damage *= e.dmgMul;
    }
  }

  private addProjectile(e: Enemy, a: EnemyAttackDef, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, lob: boolean, tx: number, tz: number, r: number): Projectile {
    const p: Projectile = { id: ++this.idSeq, kind: `${e.kind}.${a.id}`, owner: e.id, x, y, z, vx, vy, vz, t: 0, life, damage: a.damage, tier: e.tier, lob, tx, tz, r, ring: -1 };
    this.projectiles.push(p);
    this.out.push({ type: 'shot', p });
    return p;
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.t += dt;
      pr.x += pr.vx * dt;
      pr.z += pr.vz * dt;
      if (pr.lob) {
        pr.vy -= 9.81 * dt * 0.8;
        pr.y += pr.vy * dt;
        if (pr.t >= pr.life) {
          const hit = Math.hypot(this.px - pr.tx, this.pz - pr.tz) <= pr.r + 0.3;
          const dealt = hit ? this.hurtPlayer(pr.damage, pr.kind.split('.')[0], { x: pr.tx, z: pr.tz }, pr.tier, true) : 0;
          this.out.push({ type: 'impact', p: pr, hitPlayer: dealt > 0 });
          const k = this.rings.findIndex((r) => r.id === pr.ring);
          if (k >= 0) this.rings.splice(k, 1);
          this.projectiles.splice(i, 1);
        }
        continue;
      }
      pr.y += pr.vy * dt;
      const g = this.world.heightAt(pr.x, pr.z);
      if (pr.y < g + 0.6) {
        pr.y = g + 0.6;
        pr.vy = 0;
      }
      const dy = pr.y - (this.py + 1.2);
      const hitP = Math.hypot(pr.x - this.px, pr.z - this.pz) < pr.r && Math.abs(dy) < 1.4;
      if (hitP || pr.t >= pr.life) {
        const dealt = hitP ? this.hurtPlayer(pr.damage, pr.kind.split('.')[0], { x: pr.x - pr.vx * 0.1, z: pr.z - pr.vz * 0.1 }, pr.tier) : 0;
        this.out.push({ type: 'impact', p: pr, hitPlayer: dealt > 0 });
        this.projectiles.splice(i, 1);
      }
    }
  }

  private strikeStep(e: Enemy, dt: number, inp: SimInput): void {
    const a = e.attack;
    if (e.dash) {
      const D = e.dash;
      const step = Math.min(dt, D.t);
      const nx = e.x + D.vx * step;
      const nz = e.z + D.vz * step;
      // the Pikeur cannot cross running water: his charge balks at the overflow
      if (e.kind === 'pikeur' && this.world.isWater) {
        const f = Math.hypot(D.vx, D.vz) || 1;
        if (this.world.isWater(nx + (D.vx / f) * 1.6, nz + (D.vz / f) * 1.6)) {
          e.dash = null;
          this.out.push({ type: 'balk', e });
          e.stun = 3;
          this.staggerEnemy(e, 3);
          return;
        }
      }
      this.moveBy(e, nx - e.x, nz - e.z);
      D.t -= step;
      if (!D.hit && Math.hypot(inp.x - e.x, inp.z - e.z) < e.radius + (a?.kind === 'charge' ? 0.9 : 0.6)) {
        D.hit = true;
        this.hurtPlayer((a?.damage ?? 8) * e.dmgMul, e.kind, { x: e.x - D.vx * 0.05, z: e.z - D.vz * 0.05 }, e.tier, a?.kind === 'charge');
      }
      if (D.t <= 0) e.dash = null;
      return;
    }
    if (e.t >= AI.strike) this.setState(e, 'recover');
  }

  private summon(e: Enemy, kind: string, n: number): void {
    const def = enemyDef(kind);
    if (!def) return;
    let made = 0;
    for (let i = 0; i < n; i++) {
      if (this.live().length >= AI.maxActive) break;
      const a = e.heading + Math.PI + (i - (n - 1) / 2) * 0.8;
      const r = e.radius + 2.2;
      const x = e.x - Math.sin(a) * r;
      const z = e.z - Math.cos(a) * r;
      const add = this.makeEnemy(def, `${e.group}+adds#${this.idSeq++}`, `${e.group}+adds`, x, z, { boss: false, tier: e.tier, leash: e.leash, home: { ...e.home }, add: true });
      add.aggro = true;
      add.state = 'approach';
      made++;
    }
    if (made) this.out.push({ type: 'summon', e, kind, n: made });
  }

  /** The player cannot walk into a body: the camera would sit inside it (playtest: Steinbrecher). */
  private bumpPlayer(inp: SimInput): void {
    let vx = 0;
    let vz = 0;
    for (const e of this.enemies) {
      if (e.state === 'dissolve' || e.state === 'leave' || ((e.def.family === 'mist' || e.def.family === 'light') && !e.boss)) continue;
      if (Math.abs(e.y - inp.y) > 2.5) continue;
      const dx = inp.x - e.x;
      const dz = inp.z - e.z;
      const d = Math.hypot(dx, dz);
      const min = e.radius + (e.boss ? 0.6 : 0.45);
      if (d >= min || d < 1e-4) continue;
      const k = ((min - d) / min) * (e.boss || e.radius > 0.9 ? 9 : 4);
      vx += (dx / d) * k;
      vz += (dz / d) * k;
    }
    if (vx || vz) this.out.push({ type: 'bump', vx, vz });
  }

  /** Keep bodies apart (O(n²), n ≤ 12). */
  private separate(): void {
    const L = this.enemies;
    for (let i = 0; i < L.length; i++)
      for (let j = i + 1; j < L.length; j++) {
        const a = L[i];
        const b = L[j];
        if (a.state === 'dissolve' || b.state === 'dissolve') continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        // a little air between bodies, so a pack reads as several and one swing does not find all
        const min = (a.radius + b.radius) * 1.05 + (a.boss || b.boss ? 0 : 0.3);
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) * 0.5;
        const wa = a.boss ? 0.1 : 1;
        const wb = b.boss ? 0.1 : 1;
        a.x -= (dx / d) * push * wa;
        a.z -= (dz / d) * push * wa;
        b.x += (dx / d) * push * wb;
        b.z += (dz / d) * push * wb;
      }
  }

  /** Boss currently fought (engaged, nearest) for the boss bar. */
  boss(): Enemy | null {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (!e.boss || !e.engaged) continue;
      if (e.state === 'dissolve' && e.t > 1.2) continue;
      const d = Math.hypot(e.x - this.px, e.z - this.pz);
      if (d < bd && d < 70) {
        bd = d;
        best = e;
      }
    }
    return best;
  }
}

/** Every roster id (for debug hooks). */
export const KINDS: readonly string[] = ENEMIES.map((e) => e.id);
