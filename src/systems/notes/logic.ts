/**
 * Pure parts of the F8 notes and the passive telemetry (docs/NEXT-SESSION.md §3.3, docs/ARCHITECTURE.md
 * "Notizen & Telemetrie"): the event ring buffer and the telemetry bookkeeping. No DOM, no
 * IndexedDB, no network: tested in tests/notes-turn.test.ts.
 */

/** Seconds of events a note keeps. */
export const RING_SECONDS = 30;
/** Hard cap of events in the ring (a busy fight). */
export const RING_MAX = 400;
/** A payload longer than this (JSON characters) is cut. */
export const PAYLOAD_MAX = 240;
/** Active play without objective progress that counts as a stuck episode (s). */
export const STUCK_SECONDS = 180;
/** Telemetry list caps (oldest dropped), so a long play never grows without bound. */
export const TELEMETRY_CAP = 500;

/**
 * Per-frame or per-step events that would drown everything else in 30 s (footsteps, meters,
 * oil, the fire's progress …).
 */
export const NOISY_EVENTS: ReadonlySet<string> = new Set([
  'player:step',
  'fire:progress',
  'oblivion:progress',
  'lantern:oil',
  'stats:changed',
  'hunt:alert',
  'hunt:tracking',
  'combat:swing',
  'echo:line',
  'npc:topics',
  'npc:marker',
  'settings:change',
  'save:written',
]);

export interface RingEvent {
  /** Seconds (wall clock, performance.now based) when it fired. */
  t: number;
  name: string;
  /** JSON of the payload, cut to PAYLOAD_MAX. */
  p: string;
}

/** Short JSON of a payload: numbers rounded to 0.1, long strings and arrays cut. */
export function trimPayload(payload: unknown, max = PAYLOAD_MAX): string {
  let s: string;
  try {
    s =
      JSON.stringify(payload, (_k, v: unknown) => {
        if (typeof v === 'number') return Math.round(v * 10) / 10;
        if (typeof v === 'string' && v.length > 80) return `${v.slice(0, 77)}…`;
        if (Array.isArray(v) && v.length > 8) return [...v.slice(0, 8), `…+${v.length - 8}`];
        return v;
      }) ?? '';
  } catch {
    s = '"<unserialisable>"';
  }
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Ring buffer of the last `seconds` of game events (noisy ones dropped). */
export class EventRing {
  private readonly items: RingEvent[] = [];
  constructor(
    readonly seconds = RING_SECONDS,
    readonly max = RING_MAX,
    private readonly skip: ReadonlySet<string> = NOISY_EVENTS,
  ) {}

  push(t: number, name: string, payload: unknown): void {
    if (this.skip.has(name)) return;
    this.items.push({ t, name, p: trimPayload(payload) });
    this.prune(t);
  }

  prune(now: number): void {
    const from = now - this.seconds;
    let i = 0;
    while (i < this.items.length && this.items[i]!.t < from) i++;
    if (i) this.items.splice(0, i);
    if (this.items.length > this.max) this.items.splice(0, this.items.length - this.max);
  }

  /** The events of the last `seconds` before `now`, with `t` made relative (≤ 0 s). */
  snapshot(now: number): RingEvent[] {
    this.prune(now);
    return this.items.map((e) => ({ t: Math.round((e.t - now) * 10) / 10, name: e.name, p: e.p }));
  }

  get size(): number {
    return this.items.length;
  }
}

// ---- telemetry ------------------------------------------------------------------------------

export interface QuestTime {
  id: string;
  /** Active play seconds (meta.playSeconds) at accept / turn-in. */
  start: number;
  end: number;
  seconds: number;
  main: boolean;
  /** ISO time of the turn-in. */
  at: string;
}

export interface DeathRecord {
  kind: 'died' | 'caught';
  /** Who did it: enemy kind / threat kind ('combat', 'hound' …). */
  by: string;
  family?: string;
  boss?: boolean;
  x: number;
  z: number;
  era: string;
  quest: string | null;
  objective: string | null;
  play: number;
  at: string;
}

export interface StuckEpisode {
  /** Active play seconds when the episode started (STUCK_SECONDS after the last progress). */
  play: number;
  /** Active seconds without progress (grows while it is open). */
  seconds: number;
  x: number;
  z: number;
  era: string;
  quest: string | null;
  objective: string | null;
  /** False while it runs; true once progress ended it. */
  ended: boolean;
  at: string;
}

export interface TelemetryState {
  version: 1;
  /** Open quests: id → active play seconds at accept. */
  open: Record<string, number>;
  quests: QuestTime[];
  deaths: DeathRecord[];
  stuck: StuckEpisode[];
  /** Active seconds since the last objective progress (only counted while there is an objective). */
  sinceProgress: number;
}

export function createTelemetry(): TelemetryState {
  return { version: 1, open: {}, quests: [], deaths: [], stuck: [], sinceProgress: 0 };
}

/** Accept a stored telemetry object (IndexedDB) or start fresh. */
export function normaliseTelemetry(v: unknown): TelemetryState {
  const d = createTelemetry();
  if (!v || typeof v !== 'object') return d;
  const o = v as Partial<TelemetryState>;
  return {
    version: 1,
    open: o.open && typeof o.open === 'object' ? { ...o.open } : {},
    quests: Array.isArray(o.quests) ? o.quests.slice(-TELEMETRY_CAP) : [],
    deaths: Array.isArray(o.deaths) ? o.deaths.slice(-TELEMETRY_CAP) : [],
    stuck: Array.isArray(o.stuck) ? o.stuck.slice(-TELEMETRY_CAP) : [],
    sinceProgress: typeof o.sinceProgress === 'number' ? o.sinceProgress : 0,
  };
}

/** Where the player is and what they are after (given by the system each call). */
export interface Situation {
  x: number;
  z: number;
  era: string;
  quest: string | null;
  objective: string | null;
  play: number;
  at: string;
}

const cap = <T>(a: T[]) => {
  if (a.length > TELEMETRY_CAP) a.splice(0, a.length - TELEMETRY_CAP);
};

/** Bookkeeping on top of a `TelemetryState` (mutated in place). `dirty` says it needs saving. */
export class Telemetry {
  dirty = false;
  constructor(public s: TelemetryState = createTelemetry()) {}

  questAccepted(id: string, play: number): void {
    if (this.s.open[id] === undefined) {
      this.s.open[id] = play;
      this.dirty = true;
    }
    this.progress();
  }

  questCompleted(id: string, main: boolean, play: number, at: string): QuestTime | null {
    this.progress();
    const start = this.s.open[id];
    if (start === undefined) return null;
    delete this.s.open[id];
    const q: QuestTime = { id, start: r1(start), end: r1(play), seconds: r1(Math.max(0, play - start)), main, at };
    this.s.quests.push(q);
    cap(this.s.quests);
    this.dirty = true;
    return q;
  }

  /** A quest reset / failed: it does not count. */
  questDropped(id: string): void {
    if (this.s.open[id] !== undefined) {
      delete this.s.open[id];
      this.dirty = true;
    }
  }

  death(kind: DeathRecord['kind'], by: string, at: Situation, extra: { family?: string; boss?: boolean } = {}): DeathRecord {
    const d: DeathRecord = { kind, by, ...(extra.family ? { family: extra.family } : {}), ...(extra.boss ? { boss: true } : {}), x: r1(at.x), z: r1(at.z), era: at.era, quest: at.quest, objective: at.objective, play: r1(at.play), at: at.at };
    this.s.deaths.push(d);
    cap(this.s.deaths);
    this.dirty = true;
    return d;
  }

  /** Objective progress of any kind: the stuck clock starts over, an open episode ends. */
  progress(): void {
    const open = this.openStuck();
    if (open) {
      open.ended = true;
      open.seconds = r1(this.s.sinceProgress);
      this.dirty = true;
    }
    this.s.sinceProgress = 0;
  }

  /**
   * Active play (fixed step, not paused). Counts only while there is an objective to make progress
   * on; opens a stuck episode after STUCK_SECONDS. Returns the episode when one opened this call.
   */
  tick(dt: number, at: Situation, hasObjective: boolean): StuckEpisode | null {
    if (!hasObjective) return null;
    this.s.sinceProgress += dt;
    const open = this.openStuck();
    if (open) {
      open.seconds = r1(this.s.sinceProgress);
      return null;
    }
    if (this.s.sinceProgress < STUCK_SECONDS) return null;
    const e: StuckEpisode = { play: r1(at.play), seconds: r1(this.s.sinceProgress), x: r1(at.x), z: r1(at.z), era: at.era, quest: at.quest, objective: at.objective, ended: false, at: at.at };
    this.s.stuck.push(e);
    cap(this.s.stuck);
    this.dirty = true;
    return e;
  }

  openStuck(): StuckEpisode | null {
    const last = this.s.stuck[this.s.stuck.length - 1];
    return last && !last.ended ? last : null;
  }

  /** A new game: open quest clocks and the stuck clock start over (the records stay). */
  newGame(): void {
    this.progress();
    if (Object.keys(this.s.open).length) this.dirty = true;
    this.s.open = {};
  }

  reset(): void {
    this.s = createTelemetry();
    this.dirty = true;
  }
}

const r1 = (v: number) => Math.round(v * 10) / 10;
