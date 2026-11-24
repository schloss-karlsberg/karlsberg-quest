import { type Era, isEra } from './era';
import { migrateLegacyPrologue } from './legacy-prologue';
import type { Stance } from '../player/stance';

/**
 * Central, serialisable game state. Everything here must survive JSON round-trips.
 *
 * Feature systems keep their own slice under `systems[<systemId>]` and declare its type by
 * declaration merging (in their own folder):
 *
 *   declare module '../../core/state' {
 *     interface SystemStates { hunt: { alert: number } }
 *   }
 *   const s = ctx.state.slice('hunt', () => ({ alert: 0 }));
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SystemStates {}

export interface PlayerState {
  x: number;
  y: number;
  z: number;
  /** Radians, 0 = looking towards −z (north), positive = turning left (counter-clockwise from above). */
  yaw: number;
  pitch: number;
  stance: Stance;
  flying: boolean;
}

export interface CaseProgress {
  /** entryId -> blankId -> nounId */
  filled: Record<string, Record<string, string>>;
  /** Confirmed (fact) entry ids. */
  confirmed: string[];
  /** Committed readings: entryId -> blankId -> nounId */
  readings: Record<string, Record<string, string>>;
}

export interface GameState {
  version: number;
  era: Era;
  player: PlayerState;
  /** Generic story flags (feature systems may use them for simple triggers). */
  flags: Record<string, boolean | number | string>;
  inventory: { clues: string[]; nouns: string[]; items: string[] };
  codex: { facts: string[] };
  chronik: Record<string, CaseProgress>;
  skills: Record<string, number>;
  systems: Partial<SystemStates> & Record<string, unknown>;
  meta: { playSeconds: number; savedAt: string | null; shifts: number };
}

export const STATE_VERSION = 1;

/** Default spawn: on the avenue west of the Ehrenhof, looking east at the Corps de logis. */
export const DEFAULT_SPAWN = { x: 1138, z: -1120, yaw: -Math.PI / 2 };

export function createInitialState(): GameState {
  return {
    version: STATE_VERSION,
    era: 'today',
    player: { x: DEFAULT_SPAWN.x, y: 0, z: DEFAULT_SPAWN.z, yaw: DEFAULT_SPAWN.yaw, pitch: 0, stance: 'stand', flying: false },
    flags: {},
    inventory: { clues: [], nouns: [], items: [] },
    codex: { facts: [] },
    chronik: {},
    skills: {},
    systems: {},
    meta: { playSeconds: 0, savedAt: null, shifts: 0 },
  };
}

type Listener<T> = (state: Readonly<T>, reason: string) => void;

/** Minimal observable store. `update` mutates in place and then notifies subscribers. */
export class Store<T extends object> {
  private s: T;
  private readonly listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.s = initial;
  }

  get state(): Readonly<T> {
    return this.s;
  }

  /** Mutable access for systems that update every tick (no notification). Prefer `update`. */
  get mutable(): T {
    return this.s;
  }

  update(fn: (draft: T) => void, reason = 'update'): void {
    fn(this.s);
    this.notify(reason);
  }

  replace(next: T, reason = 'replace'): void {
    this.s = next;
    this.notify(reason);
  }

  subscribe(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(reason: string): void {
    for (const fn of [...this.listeners]) fn(this.s, reason);
  }
}

export class GameStateStore extends Store<GameState> {
  /** Get (and lazily create) a feature system's state slice. */
  slice<K extends keyof SystemStates>(id: K, init: () => SystemStates[K]): SystemStates[K];
  slice<V>(id: string, init: () => V): V;
  slice(id: string, init: () => unknown): unknown {
    const sys = this.mutable.systems as Record<string, unknown>;
    if (sys[id] === undefined) sys[id] = init();
    return sys[id];
  }

  toJSON(): string {
    return JSON.stringify(this.state);
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep-merge `src` onto `base` (only keys/types present in base are type-checked; extra keys kept). */
function mergeDefaults<T>(base: T, src: unknown): T {
  if (!isObj(base) || !isObj(src)) return (src === undefined ? base : (src as T));
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(src)) {
    const b = (base as Record<string, unknown>)[k];
    // (a null default takes any saved value: meta.savedAt was dropped, so "Weiterspielen" never resumed)
    if (b === undefined || b === null) out[k] = v;
    else if (isObj(b)) out[k] = isObj(v) ? mergeDefaults(b, v) : b;
    else if (Array.isArray(b)) out[k] = Array.isArray(v) ? v : b;
    else out[k] = typeof v === typeof b ? v : b;
  }
  return out as T;
}

/** Parse + migrate a saved state. Throws on garbage. Unknown future versions are rejected. */
export function deserializeState(json: string): GameState {
  const raw = JSON.parse(json) as unknown;
  if (!isObj(raw)) throw new Error('save: not an object');
  const version = typeof raw.version === 'number' ? raw.version : 0;
  if (version > STATE_VERSION) throw new Error(`save: version ${version} is newer than this game (${STATE_VERSION})`);
  // v0 -> v1: nothing structural yet; mergeDefaults fills new fields.
  const s = mergeDefaults(createInitialState(), raw);
  s.version = STATE_VERSION;
  if (!isEra(s.era)) s.era = 'today';
  migrateLegacyPrologue(s);
  return s;
}

export function serializeState(s: GameState): string {
  return JSON.stringify(s);
}
