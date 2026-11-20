/**
 * Fight metrics (docs/NEXT-SESSION.md §3.2, docs/BALANCE.md): a passive observer of the combat
 * simulation's events that cuts play into fights and measures each one — time to kill, damage and
 * hits taken, hits that came with **no on-screen telegraph**, every wind-up against human reaction
 * time, dodges tried and dodges that worked, and the feedback each blow of the staff gave.
 *
 * Pure TypeScript (no three.js, no DOM): the game feeds it from `combat/index.ts` with the real
 * camera frustum (`kq.combat.report()` / `reset()`), the headless balance harness
 * (`tests/combat-human.ts`, `pnpm sim:combat`) with a modelled third-person camera. It never
 * changes the fight.
 *
 * A fight starts when an enemy aggroes or the first blow lands (either way), and ends when every
 * enemy engaged in it is undone or gone (`won`), the player goes down (`lost`) or nothing has
 * happened for `idle` seconds (`timeout`: a leash reset, a walk away).
 *
 * A hit counts as **unfair** (no on-screen telegraph) when the attacker's wind-up was seen for
 * less than the reaction time before it landed: the attacker (or the ground ring / bolt it made)
 * was off screen the whole time (`offscreen`), the attack had no wind-up at all (`noWindup`), or
 * its wind-up was shorter than the reaction time (`shortWindup`).
 */
import type { CombatSim, SimEvent } from './sim';

/** Human reaction time (s) that wind-ups are measured against. */
export const REACTION_S = 0.25;
/** Seconds without any combat event that end a fight. */
export const FIGHT_IDLE_S = 8;
/** Fights kept for the report. */
export const FIGHTS_KEPT = 30;
/** How long after a dodge a blow it was meant for may still land (s). */
const DODGE_WINDOW = 1.1;

/** What the game does on each staff hit (per platform settings: damage numbers, reduced motion). */
export interface HitFeedbackFlags {
  sound: boolean;
  particles: boolean;
  shake: boolean;
  numbers: boolean;
}

/** What the log reads each step besides the events. */
export interface FightView {
  sim: Pick<CombatSim, 'enemies' | 'projectiles' | 'rings' | 'hazards' | 'p' | 'freeze'>;
  /** Is this world point inside the camera frustum? */
  onScreen(x: number, y: number, z: number): boolean;
  feedback: HitFeedbackFlags;
}

export interface AttackStat {
  /** Wind-ups started. */
  n: number;
  /** Wind-up seconds (min / mean). */
  min: number;
  mean: number;
  /** Wind-ups shorter than the reaction time. */
  belowReaction: number;
  /** Wind-ups that began with the attacker off screen. */
  offscreenStart: number;
}

export interface HitStat {
  hits: number;
  damage: number;
  unfair: number;
  /** Mean seconds the attack was visible before it landed. */
  seen: number;
}

export interface FeedbackStat {
  /** Staff hits dealt. */
  hits: number;
  hitStop: number;
  flash: number;
  knockback: number;
  sound: number;
  particles: number;
  shake: number;
  numbers: number;
  /** Mean hit-stop per hit (ms). */
  hitStopMs: number;
}

export interface DodgeStat {
  attempted: number;
  /** A blow aimed at you missed (i-frames or distance). */
  successful: number;
  /** Rolled with nothing coming. */
  noThreat: number;
  perfect: number;
}

export interface UnfairStat {
  offscreen: number;
  shortWindup: number;
  noWindup: number;
}

export interface FightRecord {
  id: number;
  /** Seconds since the log started (or was reset). */
  start: number;
  seconds: number;
  outcome: 'won' | 'lost' | 'timeout' | 'open';
  /** Enemies engaged, by kind ("streuner*" = elite). */
  kinds: Record<string, number>;
  boss: string | null;
  /** Seconds until the last engaged enemy fell (won fights only). */
  timeToKill: number | null;
  hpStart: number;
  hpEnd: number;
  hpMax: number;
  damageTaken: number;
  hitsTaken: number;
  unfairHits: number;
  unfair: UnfairStat;
  /** Hits taken by `kind.attack`. */
  hitsBy: Record<string, HitStat>;
  /** Wind-ups by `kind.attack`. */
  windups: Record<string, AttackStat>;
  dodges: DodgeStat;
  damageDealt: number;
  feedback: FeedbackStat;
}

export interface FightReport {
  reaction: number;
  fights: FightRecord[];
  totals: {
    fights: number;
    won: number;
    lost: number;
    timeout: number;
    seconds: number;
    damageTaken: number;
    hitsTaken: number;
    unfairHits: number;
    unfair: UnfairStat;
    dodges: DodgeStat;
    hitsBy: Record<string, HitStat>;
    windups: Record<string, AttackStat>;
    feedback: FeedbackStat;
  };
}

interface Windup {
  key: string;
  start: number;
  dur: number;
  /** Seconds the attack (attacker, its ring or its bolt) was on screen since the wind-up began. */
  seen: number;
}

interface PendingDodge {
  t: number;
  threats: Set<string>;
  evaded: boolean;
  hit: boolean;
  perfect: boolean;
}

interface Open extends FightRecord {
  engaged: Set<string>;
  lastActive: number;
  lastKill: number;
}

const emptyFeedback = (): FeedbackStat => ({ hits: 0, hitStop: 0, flash: 0, knockback: 0, sound: 0, particles: 0, shake: 0, numbers: 0, hitStopMs: 0 });
const emptyDodges = (): DodgeStat => ({ attempted: 0, successful: 0, noThreat: 0, perfect: 0 });
const emptyUnfair = (): UnfairStat => ({ offscreen: 0, shortWindup: 0, noWindup: 0 });

const r2 = (x: number) => Math.round(x * 100) / 100;

export class FightLog {
  private now = 0;
  private seq = 0;
  private cur: Open | null = null;
  private readonly done: FightRecord[] = [];
  /** The latest wind-up per enemy id. */
  private readonly windup = new Map<string, Windup>();
  private readonly dodges: PendingDodge[] = [];
  /** Enemy id → its kind (for hits from bolts whose owner is already gone). */
  private readonly kindOf = new Map<string, string>();

  constructor(readonly reaction = REACTION_S, readonly idle = FIGHT_IDLE_S, readonly keep = FIGHTS_KEPT) {}

  reset(): void {
    this.now = 0;
    this.cur = null;
    this.done.length = 0;
    this.windup.clear();
    this.dodges.length = 0;
    this.kindOf.clear();
  }

  /** Feed one simulation step (`dt` real seconds) and the events it produced. */
  observe(dt: number, events: readonly SimEvent[], view: FightView): void {
    this.now += dt;
    const sim = view.sim;
    for (const ev of events) this.event(ev, view);
    // visibility of every wind-up in progress: the body, its rings, its bolts in the air
    for (const [id, w] of this.windup) {
      if (this.now - w.start > 4) {
        this.windup.delete(id);
        continue;
      }
      if (this.visible(id, view)) w.seen += dt;
    }
    this.settleDodges(false);
    const f = this.cur;
    if (!f) return;
    if (sim.p.dead) return this.finish('lost', sim.p.hp);
    const gone = (id: string) => {
      const e = sim.enemies.find((x) => x.id === id);
      return !e || e.state === 'dissolve' || e.state === 'leave';
    };
    const aggro = sim.enemies.some((e) => e.aggro && e.state !== 'dissolve' && e.state !== 'leave' && e.state !== 'return');
    if (f.engaged.size && [...f.engaged].every(gone) && !aggro) return this.finish('won', sim.p.hp);
    if (this.now - f.lastActive >= this.idle) this.finish('timeout', sim.p.hp);
  }

  report(): FightReport {
    const fights = [...this.done];
    if (this.cur) fights.push(this.snapshot(this.cur, 'open'));
    const t: FightReport['totals'] = { fights: fights.length, won: 0, lost: 0, timeout: 0, seconds: 0, damageTaken: 0, hitsTaken: 0, unfairHits: 0, unfair: emptyUnfair(), dodges: emptyDodges(), hitsBy: {}, windups: {}, feedback: emptyFeedback() };
    let stopMs = 0;
    for (const f of fights) {
      if (f.outcome === 'won') t.won++;
      else if (f.outcome === 'lost') t.lost++;
      else if (f.outcome === 'timeout') t.timeout++;
      t.seconds += f.seconds;
      t.damageTaken += f.damageTaken;
      t.hitsTaken += f.hitsTaken;
      t.unfairHits += f.unfairHits;
      for (const k of Object.keys(t.unfair) as (keyof UnfairStat)[]) t.unfair[k] += f.unfair[k];
      for (const k of Object.keys(t.dodges) as (keyof DodgeStat)[]) t.dodges[k] += f.dodges[k];
      for (const k of Object.keys(t.feedback) as (keyof FeedbackStat)[]) if (k !== 'hitStopMs') t.feedback[k] += f.feedback[k];
      stopMs += f.feedback.hitStopMs * f.feedback.hits;
      for (const [k, h] of Object.entries(f.hitsBy)) {
        const o = (t.hitsBy[k] ??= { hits: 0, damage: 0, unfair: 0, seen: 0 });
        o.seen = (o.seen * o.hits + h.seen * h.hits) / Math.max(1, o.hits + h.hits);
        o.hits += h.hits;
        o.damage += h.damage;
        o.unfair += h.unfair;
      }
      for (const [k, w] of Object.entries(f.windups)) {
        const o = (t.windups[k] ??= { n: 0, min: Infinity, mean: 0, belowReaction: 0, offscreenStart: 0 });
        o.mean = (o.mean * o.n + w.mean * w.n) / Math.max(1, o.n + w.n);
        o.n += w.n;
        o.min = Math.min(o.min, w.min);
        o.belowReaction += w.belowReaction;
        o.offscreenStart += w.offscreenStart;
      }
    }
    t.feedback.hitStopMs = t.feedback.hits ? Math.round(stopMs / t.feedback.hits) : 0;
    t.seconds = r2(t.seconds);
    t.damageTaken = r2(t.damageTaken);
    for (const h of Object.values(t.hitsBy)) {
      h.damage = r2(h.damage);
      h.seen = r2(h.seen);
    }
    for (const w of Object.values(t.windups)) w.mean = r2(w.mean);
    return { reaction: this.reaction, fights: structuredClone(fights), totals: t };
  }

  // ---- internals --------------------------------------------------------------------------------

  private open(view: FightView): Open {
    if (this.cur) return this.cur;
    const p = view.sim.p;
    this.cur = {
      id: ++this.seq,
      start: r2(this.now),
      seconds: 0,
      outcome: 'open',
      kinds: {},
      boss: null,
      timeToKill: null,
      hpStart: r2(p.hp),
      hpEnd: r2(p.hp),
      hpMax: p.max,
      damageTaken: 0,
      hitsTaken: 0,
      unfairHits: 0,
      unfair: emptyUnfair(),
      hitsBy: {},
      windups: {},
      dodges: emptyDodges(),
      damageDealt: 0,
      feedback: emptyFeedback(),
      engaged: new Set(),
      lastActive: this.now,
      lastKill: this.now,
    };
    return this.cur;
  }

  private engage(f: Open, e: { id: string; kind: string; elite: boolean; boss: boolean }): void {
    this.kindOf.set(e.id, e.kind);
    if (f.engaged.has(e.id)) return;
    f.engaged.add(e.id);
    const k = e.elite ? `${e.kind}*` : e.kind;
    f.kinds[k] = (f.kinds[k] ?? 0) + 1;
    if (e.boss) f.boss = e.kind;
  }

  private visible(id: string, view: FightView): boolean {
    const sim = view.sim;
    const e = sim.enemies.find((x) => x.id === id);
    if (e && view.onScreen(e.x, e.y + Math.max(0.5, e.radius * 0.6), e.z)) return true;
    for (const r of sim.rings) if (r.owner === id && view.onScreen(r.x, (e?.y ?? 0) - (e?.hover ?? 0), r.z)) return true;
    for (const p of sim.projectiles) if (p.owner === id && view.onScreen(p.x, p.y, p.z)) return true;
    return false;
  }

  private event(ev: SimEvent, view: FightView): void {
    const sim = view.sim;
    switch (ev.type) {
      case 'aggro': {
        if (!ev.on) return;
        const f = this.open(view);
        this.engage(f, ev.e);
        f.lastActive = this.now;
        return;
      }
      case 'telegraph': {
        const e = ev.e;
        this.kindOf.set(e.id, e.kind);
        const key = `${e.kind}.${ev.attack.id}`;
        const onAtStart = view.onScreen(e.x, e.y + Math.max(0.5, e.radius * 0.6), e.z);
        this.windup.set(e.id, { key, start: this.now, dur: ev.dur, seen: 0 });
        const f = this.cur;
        if (!f || ev.attack.damage <= 0) return;
        f.lastActive = this.now;
        const w = (f.windups[key] ??= { n: 0, min: Infinity, mean: 0, belowReaction: 0, offscreenStart: 0 });
        w.mean = (w.mean * w.n + ev.dur) / (w.n + 1);
        w.n++;
        w.min = Math.min(w.min, ev.dur);
        if (ev.dur < this.reaction) w.belowReaction++;
        if (!onAtStart) w.offscreenStart++;
        return;
      }
      case 'strike':
      case 'shot':
        if (this.cur) this.cur.lastActive = this.now;
        return;
      case 'hit': {
        const f = this.open(view);
        this.engage(f, ev.e);
        f.lastActive = this.now;
        f.damageDealt += ev.damage;
        const fb = f.feedback;
        const stop = sim.freeze;
        fb.hitStopMs = (fb.hitStopMs * fb.hits + stop * 1000) / (fb.hits + 1);
        fb.hits++;
        if (stop > 0) fb.hitStop++;
        if (ev.e.flash > 0) fb.flash++;
        if (Math.hypot(ev.e.vx, ev.e.vz) > 1) fb.knockback++;
        if (view.feedback.sound) fb.sound++;
        if (view.feedback.particles) fb.particles++;
        if (view.feedback.shake) fb.shake++;
        if (view.feedback.numbers) fb.numbers++;
        return;
      }
      case 'playerHit': {
        const f = this.open(view);
        f.lastActive = this.now;
        f.damageTaken = r2(f.damageTaken + ev.damage);
        f.hitsTaken++;
        const id = ev.src ?? '';
        const attacker = sim.enemies.find((x) => x.id === id);
        if (attacker) this.engage(f, attacker);
        const kind = id === 'hazard' ? 'hazard' : (attacker?.kind ?? this.kindOf.get(id) ?? ev.by);
        const key = `${kind}.${ev.attack ?? '?'}`;
        let seen = 0;
        let why: keyof UnfairStat | null = null;
        if (id === 'hazard') {
          // an era hazard fills up on the ground where it will land: fair if that spot is in view
          const h = sim.hazards.find((x) => Math.hypot(x.x - ev.x, x.z - ev.z) < 0.01);
          const dur = h?.dur ?? 1;
          seen = view.onScreen(ev.x, 0, ev.z) ? dur : 0;
          if (dur < this.reaction) why = 'shortWindup';
          else if (seen < this.reaction) why = 'offscreen';
        } else if (ev.attack === 'reflect') {
          // the player's own flare thrown back by a mirror in the cone: in view by construction
          seen = 1;
        } else {
          const w = this.windup.get(id);
          if (!w || w.key !== key) why = 'noWindup';
          else {
            seen = w.seen;
            if (w.dur < this.reaction) why = 'shortWindup';
            else if (w.seen < this.reaction) why = 'offscreen';
          }
        }
        const h = (f.hitsBy[key] ??= { hits: 0, damage: 0, unfair: 0, seen: 0 });
        h.seen = r2((h.seen * h.hits + seen) / (h.hits + 1));
        h.hits++;
        h.damage = r2(h.damage + ev.damage);
        if (why) {
          h.unfair++;
          f.unfairHits++;
          f.unfair[why]++;
        }
        for (const d of this.dodges) if (d.threats.has(id) && this.now - d.t <= DODGE_WINDOW) d.hit = true;
        return;
      }
      case 'dodge': {
        const f = this.open(view);
        f.lastActive = this.now;
        f.dodges.attempted++;
        if (ev.perfect) f.dodges.perfect++;
        this.dodges.push({ t: this.now, threats: this.threats(view), evaded: false, hit: false, perfect: ev.perfect });
        return;
      }
      case 'evade': {
        const d = this.dodges[this.dodges.length - 1];
        if (d && this.now - d.t <= 0.5) {
          d.evaded = true;
          if (ev.src) d.threats.add(ev.src);
        }
        return;
      }
      case 'killed':
        if (this.cur?.engaged.has(ev.e.id)) {
          this.cur.lastKill = this.now;
          this.cur.lastActive = this.now;
        }
        return;
      default:
        return;
    }
  }

  /** What could hurt the player in the next moment (ids): wind-ups, leaps under way, bolts closing in, hazards. */
  private threats(view: FightView): Set<string> {
    const sim = view.sim;
    const out = new Set<string>();
    for (const e of sim.enemies) {
      if (e.state === 'dissolve') continue;
      if (e.state === 'windup' && e.attack && e.attack.damage > 0) out.add(e.id);
      if (e.dash && !e.dash.hit) out.add(e.id);
    }
    for (const p of sim.projectiles) if (p.owner !== 'hazard') out.add(p.owner);
    for (const h of sim.hazards) if (h.dur - h.t < 1) out.add('hazard');
    return out;
  }

  private settleDodges(all: boolean): void {
    const f = this.cur;
    while (this.dodges.length && (all || this.now - this.dodges[0]!.t > DODGE_WINDOW)) {
      const d = this.dodges.shift()!;
      if (!f) continue;
      if (d.evaded || (d.threats.size > 0 && !d.hit)) f.dodges.successful++;
      else if (d.threats.size === 0) f.dodges.noThreat++;
    }
  }

  private snapshot(f: Open, outcome: FightRecord['outcome']): FightRecord {
    const { engaged: _e, lastActive: _a, lastKill: _k, ...rec } = f;
    void _e;
    void _a;
    void _k;
    const out: FightRecord = structuredClone({ ...rec, outcome, seconds: r2(this.now - f.start) });
    for (const w of Object.values(out.windups)) w.mean = r2(w.mean);
    out.feedback.hitStopMs = Math.round(out.feedback.hitStopMs);
    return out;
  }

  private finish(outcome: 'won' | 'lost' | 'timeout', hp: number): void {
    const f = this.cur;
    if (!f) return;
    this.settleDodges(true);
    f.hpEnd = r2(hp);
    if (outcome === 'won') f.timeToKill = r2(f.lastKill - f.start);
    const rec = this.snapshot(f, outcome);
    if (outcome === 'timeout') rec.seconds = r2(f.lastActive - f.start);
    this.done.push(rec);
    while (this.done.length > this.keep) this.done.shift();
    this.cur = null;
  }
}
