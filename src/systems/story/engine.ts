/**
 * Data-driven chapter/beat state machine (pure: no DOM, no three.js; unit-tested).
 *
 * The engine owns the persisted `StorySlice` (in GameState.systems.story) and tells a `StoryHost`
 * what to do: run action lists, announce chapter/beat changes. The host (src/systems/story/index.ts)
 * turns actions into events, UI and sound.
 */
import type { Era } from '../../core/era';
import type { ThreatConfig } from '../contracts';
import { valueKey } from '../../content/triggers';
import type { Action, Beat, Condition, EndingId, EventCond, FlagValue, LookTime, Reaction, StoryFile } from './types';

export interface ObjectiveState {
  text: string;
  x?: number;
  z?: number;
  id?: string;
}

/** Persisted story progress (JSON only). */
export interface StorySlice {
  /** The story runs (false before the prologue starts and after the credits). */
  active: boolean;
  chapter: string | null;
  beat: string | null;
  beatTime: number;
  chapterTime: number;
  /** Latched event conditions: key → count (beat keys reset per beat, chapter keys per chapter). */
  latched: Record<string, number>;
  /** Reactions that already fired: "b:<id>" (beat scope) / "c:<id>" (chapter scope). */
  fired: string[];
  unlocked: string[];
  completed: string[];
  doneBeats: string[];
  /** Player (surveyor) name. */
  name: string;
  /** Dialogue line ids already spoken (once-lines). */
  said: string[];
  objective: ObjectiveState | null;
  /** Last threat configuration per kind (re-sent after a reload). */
  threats: Record<string, ThreatConfig>;
  /** Present-day time of day at the field station. */
  look: LookTime;
  /** Time of day of one past era (look action with `era`); null = that era's preset. */
  lookPast?: { era: string; time: Exclude<LookTime, 'day'> } | null;
  ending: EndingId | null;
  /** Credits seen. */
  finished: boolean;
  /** Story meters (oil, smoke, vergessen, custom gauges), see meters.ts. */
  meters: Record<string, MeterState>;
  /** Room the player is in (room:enter / room:leave from the interiors feature). */
  room: string | null;
  /** How often a `say` with `variants` was told, by id (running jokes). */
  sayCount?: Record<string, number>;
}

/** A chapter meter (persisted). value 0 = empty gauge … 1 = full (out of time). */
export interface MeterState {
  id: string;
  value: number;
  seconds: number;
  label?: string;
  full: 'return' | 'caught' | 'none';
  text?: string;
  lossless?: boolean;
  /** Extra fill factor while standing still (custom gauges). */
  still?: number;
  /** Era the meter belongs to (it only runs there). */
  era?: string;
  /** Already reported full (one return per fill). */
  done?: boolean;
}

export function createStorySlice(): StorySlice {
  return {
    active: false,
    chapter: null,
    beat: null,
    beatTime: 0,
    chapterTime: 0,
    latched: {},
    fired: [],
    unlocked: [],
    completed: [],
    doneBeats: [],
    name: '',
    said: [],
    objective: null,
    threats: {},
    look: 'day',
    ending: null,
    finished: false,
    meters: {},
    room: null,
  };
}

/** Everything a condition may look at (assembled by the host each tick). */
export interface StoryEnv {
  era: Era;
  x: number;
  z: number;
  flags: Readonly<Record<string, FlagValue>>;
  inventory: { clues: readonly string[]; nouns: readonly string[]; items: readonly string[] };
  chronik: Readonly<Record<string, { confirmed: readonly string[] }>>;
  scan: number;
  map: boolean;
  stance: string;
  lantern: boolean;
  /** Fact entry ids of a case (ContentDB), or null when the case is unknown. */
  caseFacts(caseId: string): string[] | null;
  /** Room the player is in (interiors), null outside. */
  room?: string | null;
  /** Seconds since the chapter started. */
  chapterTime?: number;
  /** The running chapter (filled in by the engine). */
  chapter?: string | null;
  /** Meter values 0..1 by id (story meters and the fx/hunt meters they wrap). */
  meters?: Readonly<Record<string, number>>;
  /** Reading entry id → its story flag (CaseEntry.flag), for `reading` conditions by entry id. */
  readingFlag?(entryId: string): string | null;
  /** Horizontal speed of the player (m/s; 0 while flying). */
  speed?: number;
}

export interface RunOptions {
  /** Re-entering a beat after a reload / being caught: one-shot actions are skipped. */
  resume: boolean;
  /** Debug label, e.g. "prolog/p3:enter". */
  source: string;
  /**
   * The beat these actions belong to: a beat's `enter` and its reactions → that beat; its `exit`
   * → the beat that follows (exit lines bridge into it); chapter reactions → null (chapter-wide).
   * The host retires delayed actions and queued lines of a beat when it ends.
   */
  beat?: string | null;
  /** The place a reaction is about (its first `enter` circle): lines about it go stale elsewhere. */
  where?: { x: number; z: number; r: number } | null;
}

export interface StoryHost {
  run(actions: Action[], opts: RunOptions): void;
  chapterEntered(file: StoryFile, opts: { resume: boolean }): void;
  beatEntered(chapter: string, beat: Beat, opts: { resume: boolean }): void;
  chapterCompleted(file: StoryFile): void;
}

/** Actions that are NOT repeated when a beat is resumed (unless `onResume: true`). */
// (RPG: quest commands, xp and items are granted once; enemy groups and pickups are idempotent by id)
const ONE_SHOT = new Set(['say', 'shift', 'teleport', 'card', 'sound', 'toast', 'cue', 'chronik', 'ending', 'echo', 'grant', 'quest', 'xp', 'item']);

export function runsOnResume(a: Action): boolean {
  return a.onResume ?? !ONE_SHOT.has(a.do);
}

// ---------------------------------------------------------------------------------------------
// condition helpers (pure)
// ---------------------------------------------------------------------------------------------

/** Visit every event-like leaf of a condition with its stable latch key. */
export function walkEvents(c: Condition, key: string, fn: (ev: EventCond, key: string) => void): void {
  if ('all' in c) c.all.forEach((s, i) => walkEvents(s, `${key}.${i}`, fn));
  else if ('any' in c) c.any.forEach((s, i) => walkEvents(s, `${key}.${i}`, fn));
  else if ('not' in c) walkEvents(c.not, `${key}.n`, fn);
  else if ('event' in c) fn(c, key);
  else if ('hub' in c) fn({ event: 'hub:use', match: { item: c.hub } }, key);
  else if ('caseComplete' in c) fn({ event: 'chronik:case-complete', match: { caseId: c.caseComplete } }, key);
  else if ('room' in c) fn({ event: 'room:enter', match: { [roomMatchKey(c.room)]: c.room } }, key);
}

/** Which `room:enter` payload field a room condition id names: full id, building or catalogue id. */
export function roomMatchKey(id: string): 'id' | 'building' | 'roomId' {
  if (id.includes('/')) return 'id';
  return /^KB-[A-Z0-9]+$/.test(id) ? 'building' : 'roomId';
}

/** Does a room condition id match the room the player is in (catalogue id / full id / building)? */
export function roomIdMatches(want: string, room: string, building: string): boolean {
  if (!room) return false;
  if (want === room) return true;
  if (room.includes('/')) {
    // a full id in the slice ('KB-B06/B06.1.x')
    const [b, r] = room.split('/');
    return want === b || want === r;
  }
  return !!building && (want === building || want === `${building}/${room}`);
}

/** The first `enter` circle of a condition (not under a `not`): where a reaction happens. */
export function whereOf(c: Condition): { x: number; z: number; r: number } | null {
  if ('enter' in c) return { x: c.enter.x, z: c.enter.z, r: c.enter.r };
  if ('all' in c) {
    for (const s of c.all) {
      const w = whereOf(s);
      if (w) return w;
    }
    return null;
  }
  if ('any' in c) {
    // every alternative must name a place, else the reaction is not bound to one
    const ws = c.any.map(whereOf);
    return ws.length && ws.every((w) => w) ? ws[0]! : null;
  }
  return null;
}

export function eventMatches(ev: EventCond, name: string, payload: unknown): boolean {
  if (ev.event !== name) return false;
  const p = (payload ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(ev.match ?? {})) if (p[k] !== v) return false;
  for (const [k, v] of Object.entries(ev.gte ?? {})) if (!(typeof p[k] === 'number' && (p[k] as number) >= v)) return false;
  for (const [k, v] of Object.entries(ev.lte ?? {})) if (!(typeof p[k] === 'number' && (p[k] as number) <= v)) return false;
  return true;
}

function truthy(v: FlagValue | undefined): boolean {
  return v !== undefined && v !== false && v !== 0 && v !== '';
}

export function countConfirmed(env: StoryEnv, opt: { case?: string; prefix?: string }): number {
  if (opt.case && env.chronik[opt.case]) {
    const list = env.chronik[opt.case]!.confirmed;
    return opt.prefix ? list.filter((e) => e.startsWith(opt.prefix!)).length : list.length;
  }
  if (!opt.prefix) return 0;
  const seen = new Set<string>();
  for (const c of Object.values(env.chronik)) for (const e of c.confirmed) if (e.startsWith(opt.prefix)) seen.add(e);
  return seen.size;
}

export function evaluate(c: Condition, env: StoryEnv, latched: Record<string, number>, key: string, time: number): boolean {
  if ('all' in c) return c.all.every((s, i) => evaluate(s, env, latched, `${key}.${i}`, time));
  if ('any' in c) return c.any.some((s, i) => evaluate(s, env, latched, `${key}.${i}`, time));
  if ('not' in c) return !evaluate(c.not, env, latched, `${key}.n`, time);
  if ('manual' in c) return false;
  if ('enter' in c) {
    const e = c.enter;
    return (!e.era || env.era === e.era) && Math.hypot(env.x - e.x, env.z - e.z) <= e.r;
  }
  if ('leave' in c) return Math.hypot(env.x - c.leave.x, env.z - c.leave.z) > c.leave.r;
  if ('event' in c) return (latched[key] ?? 0) >= (c.times ?? 1);
  if ('hub' in c) return (latched[key] ?? 0) >= 1;
  if ('flag' in c) return c.eq === undefined ? truthy(env.flags[c.flag]) : env.flags[c.flag] === c.eq;
  if ('timer' in c) return time >= c.timer;
  if ('era' in c) return env.era === c.era;
  if ('have' in c) {
    const h = c.have;
    return (!h.clue || env.inventory.clues.includes(h.clue)) && (!h.noun || env.inventory.nouns.includes(h.noun)) && (!h.item || env.inventory.items.includes(h.item));
  }
  if ('confirmed' in c) return countConfirmed(env, c.confirmed) >= c.confirmed.n;
  if ('caseComplete' in c) {
    if ((latched[key] ?? 0) >= 1) return true;
    const facts = env.caseFacts(c.caseComplete);
    const prog = env.chronik[c.caseComplete];
    return !!facts && facts.length > 0 && !!prog && facts.every((f) => prog.confirmed.includes(f));
  }
  if ('scan' in c) return env.scan >= c.scan;
  if ('map' in c) return env.map;
  if ('stance' in c) return env.stance === c.stance;
  if ('lantern' in c) return env.lantern === c.lantern;
  if ('room' in c) {
    const room = env.flags['interior.room'];
    const bld = env.flags['interior.building'];
    if (room && roomIdMatches(c.room, String(room), String(bld ?? ''))) return true;
    if (env.room && roomIdMatches(c.room, env.room, '')) return true;
    return (latched[key] ?? 0) >= 1;
  }
  if ('talked' in c) {
    const t = c.talked;
    const ch = t.chapter ?? env.chapter ?? '';
    return truthy(env.flags[`talked.${String(ch)}.${t.npc}${t.topic ? `.${t.topic}` : ''}`]);
  }
  if ('reading' in c) {
    const flag = c.reading.startsWith('entry.') ? env.readingFlag?.(c.reading) ?? null : c.reading;
    const v = flag ? env.flags[flag] : undefined;
    if (typeof v !== 'string' || !v) return false;
    return c.eq === undefined || v === c.eq || valueKey(v) === valueKey(c.eq);
  }
  if ('meter' in c) {
    const v = env.meters?.[c.meter.id];
    if (v === undefined) return false;
    if (c.meter.full) return v >= 1;
    return (c.meter.gte === undefined || v >= c.meter.gte) && (c.meter.lte === undefined || v <= c.meter.lte);
  }
  if ('chosen' in c) {
    const v = env.flags[`choice.${c.chosen}`];
    if (v === undefined) return false;
    return c.option === undefined || String(v) === String(c.option);
  }
  if ('chapterTimer' in c) return (env.chapterTime ?? 0) >= c.chapterTimer;
  if ('speed' in c) {
    const v = env.speed ?? 0;
    return (c.speed.gte === undefined || v >= c.speed.gte) && (c.speed.lte === undefined || v <= c.speed.lte);
  }
  if ('quest' in c) return questHolds(c.quest, env.flags);
  if ('level' in c) return Number(env.flags['rpg.level'] ?? 1) >= c.level;
  return false;
}

/**
 * The `quest` condition over the quests system's flag mirror (`quest.<id>` = state,
 * `quest.<id>.<objective>` = count). Default state 'done'; 'active' also holds while 'ready'.
 */
export function questHolds(q: { id: string; state?: string; objective?: string; gte?: number }, flags: Readonly<Record<string, FlagValue>>): boolean {
  if (q.objective) return Number(flags[`quest.${q.id}.${q.objective}`] ?? 0) >= (q.gte ?? 1);
  const st = String(flags[`quest.${q.id}`] ?? 'hidden');
  const want = q.state ?? 'done';
  return st === want || (want === 'active' && st === 'ready');
}

// ---------------------------------------------------------------------------------------------
// engine
// ---------------------------------------------------------------------------------------------

export class StoryEngine {
  readonly chapters = new Map<string, StoryFile>();
  /** Chapters in play order. */
  readonly order: StoryFile[];
  /** Last value of repeatable reactions (edge detection; not persisted). */
  private readonly edges = new Map<string, boolean>();
  /** Last firing time (chapter seconds) of repeatable reactions with a cooldown (not persisted). */
  private readonly lastFired = new Map<string, number>();

  constructor(
    files: StoryFile[],
    private readonly slice: () => StorySlice,
    private readonly host: StoryHost,
  ) {
    for (const f of files) this.chapters.set(f.chapter, f);
    this.order = [...files].sort((a, b) => a.order - b.order);
  }

  get first(): StoryFile | undefined {
    return this.order[0];
  }

  get s(): StorySlice {
    return this.slice();
  }

  chapter(): StoryFile | undefined {
    const id = this.s.chapter;
    return id ? this.chapters.get(id) : undefined;
  }

  beat(): Beat | undefined {
    const f = this.chapter();
    return f?.beats.find((b) => b.id === this.s.beat);
  }

  /** Start a chapter at its start beat (or `beatId`). */
  goto(chapterId: string, beatId?: string, opts: { resume?: boolean } = {}): void {
    const f = this.chapters.get(chapterId);
    if (!f) throw new Error(`story: unknown chapter '${chapterId}'`);
    const beat = beatId ?? f.start;
    if (!f.beats.some((b) => b.id === beat)) throw new Error(`story: chapter '${chapterId}' has no beat '${beat}'`);
    const s = this.s;
    const resume = !!opts.resume;
    s.active = true;
    s.chapter = chapterId;
    s.chapterTime = 0;
    for (const k of Object.keys(s.latched)) delete s.latched[k];
    s.fired = [];
    if (!s.unlocked.includes(chapterId)) s.unlocked.push(chapterId);
    this.host.chapterEntered(f, { resume });
    this.enterBeat(beat, resume);
  }

  /** Re-enter the current beat (after a reload or being caught), optionally at its checkpoint. */
  resume(useCheckpoint = false): void {
    const f = this.chapter();
    const b = this.beat();
    if (!this.s.active || !f || !b) return;
    const target = useCheckpoint && b.checkpoint && f.beats.some((x) => x.id === b.checkpoint) ? b.checkpoint : b.id;
    this.host.chapterEntered(f, { resume: true });
    this.enterBeat(target, true);
  }

  private enterBeat(id: string, resume: boolean): void {
    const f = this.chapter()!;
    const b = f.beats.find((x) => x.id === id)!;
    const s = this.s;
    s.beat = id;
    s.beatTime = 0;
    for (const k of Object.keys(s.latched)) if (!k.startsWith('c:')) delete s.latched[k];
    s.fired = s.fired.filter((r) => r.startsWith('c:'));
    this.host.beatEntered(f.chapter, b, { resume });
    if (b.enter?.length) this.host.run(b.enter, { resume, source: `${f.chapter}/${b.id}:enter`, beat: id });
  }

  /** Force the current beat complete (debug / `kq.story.skip()`). */
  skip(): void {
    if (this.s.active && this.beat()) this.completeBeat();
  }

  private completeBeat(): void {
    const f = this.chapter()!;
    const b = this.beat()!;
    const s = this.s;
    const tag = `${f.chapter}/${b.id}`;
    if (!s.doneBeats.includes(tag)) s.doneBeats.push(tag);
    const idx = f.beats.indexOf(b);
    const next = b.next ?? f.beats[idx + 1]?.id;
    // exit actions bridge into the following beat (a delayed exit line belongs to it)
    if (b.exit?.length) this.host.run(b.exit, { resume: false, source: `${tag}:exit`, beat: next ?? null });
    if (next) {
      this.enterBeat(next, false);
      return;
    }
    // chapter complete
    if (!s.completed.includes(f.chapter)) s.completed.push(f.chapter);
    for (const u of [...(f.unlocks ?? []), ...(f.next ? [f.next] : [])]) if (!s.unlocked.includes(u)) s.unlocked.push(u);
    this.host.chapterCompleted(f);
    if (f.next && this.chapters.has(f.next)) this.goto(f.next);
    else {
      s.active = false;
      s.beat = null;
    }
  }

  /** Feed every game event (latches event conditions of the running beat and reactions). */
  onEvent(name: string, payload: unknown): void {
    const s = this.s;
    const f = this.chapter();
    const b = this.beat();
    if (!s.active || !f || !b) return;
    const bump = (ev: EventCond, key: string) => {
      if (eventMatches(ev, name, payload)) s.latched[key] = (s.latched[key] ?? 0) + 1;
    };
    walkEvents(b.complete, `b:${b.id}`, bump);
    for (const r of b.on ?? []) walkEvents(r.when, `br:${r.id}`, bump);
    for (const r of f.on ?? []) walkEvents(r.when, `c:${r.id}`, bump);
  }

  /** Advance timers, fire reactions, complete at most one beat. */
  tick(dt: number, env: StoryEnv): void {
    const s = this.s;
    if (!s.active) return;
    const f = this.chapter();
    const b = this.beat();
    if (!f || !b) return;
    s.beatTime += dt;
    s.chapterTime += dt;
    env = { ...env, chapterTime: s.chapterTime, chapter: s.chapter };
    this.react(f.on ?? [], 'c', env, s.chapterTime);
    if (this.s.beat !== b.id || this.s.chapter !== f.chapter) return; // a reaction switched beats
    this.react(b.on ?? [], 'b', env, s.beatTime);
    if (this.s.beat !== b.id || this.s.chapter !== f.chapter) return;
    if (evaluate(b.complete, env, s.latched, `b:${b.id}`, s.beatTime)) this.completeBeat();
  }

  private react(list: Reaction[], scope: 'b' | 'c', env: StoryEnv, time: number): void {
    const s = this.s;
    for (const r of list) {
      const tag = `${scope}:${r.id}`;
      if (s.fired.includes(tag)) continue;
      const key = scope === 'c' ? `c:${r.id}` : `br:${r.id}`;
      const now = evaluate(r.when, env, s.latched, key, time);
      if (r.repeat) {
        // repeatable reactions fire on the rising edge only (and not again within `cooldown` s)
        const was = this.edges.get(tag) ?? false;
        this.edges.set(tag, now);
        if (!now || was) continue;
        for (const k of Object.keys(s.latched)) if (k === key || k.startsWith(`${key}.`)) delete s.latched[k];
        if (r.cooldown) {
          const last = this.lastFired.get(tag);
          if (last !== undefined && s.chapterTime - last < r.cooldown && s.chapterTime >= last) continue;
          this.lastFired.set(tag, s.chapterTime);
        }
      } else {
        if (!now) continue;
        s.fired.push(tag);
      }
      this.host.run(r.do, { resume: false, source: `${this.s.chapter}/${tag}`, beat: scope === 'b' ? s.beat : null, where: whereOf(r.when) });
    }
  }
}
