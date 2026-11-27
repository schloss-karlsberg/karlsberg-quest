/**
 * Bark rules (pure, unit-tested in tests/story-ext.test.ts), bible 08-stimmen §1.1 / §2.1:
 *   - every group (line id without its number: "laub.bark.idle") is drawn at random,
 *   - the same line at the earliest after 10 minutes,
 *   - at most one ordinary bark per 45 s (guide call-outs have a shorter dedicated cooldown),
 *   - no barks during echoes, dialogues (spoken lines, conversations, modals), at memorial places
 *     (Rondell 1785, Festsaal during W5, the finale: flag `barks.quiet`), or under the curtain.
 * Several groups answering the same event (hub:enter: Laub's return lines and Marlene's radio
 * lines) take turns: the group silent the longest goes first, priority breaks ties. Inside a
 * group the highest-priority eligible lines are drawn from.
 * All times are game seconds (the barks clock, persisted).
 */
import type { DialogueLine } from '../../content/types';
import { barkGroup } from '../../content/triggers';

export const LINE_COOLDOWN = 600;
export const GLOBAL_GAP = 45;
/** A stray player can hear the guide again soon, across both variants of the call-out. */
export const CALLOUT_COOLDOWN = 15;

export function calloutGroup(line: DialogueLine): string | null {
  const group = barkGroup(line.id);
  return line.trigger?.event === 'walk:bark' && group.endsWith('.bark.hier') ? group : null;
}
export const IDLE_AFTER = 60;
/** A bark request waits this long for a quiet moment, then it is dropped. */
export const REQUEST_TTL = 8;

export interface BarkMemory {
  /** line id → time last spoken */
  lines: Record<string, number>;
  /** group → time last spoken */
  groups: Record<string, number>;
  /** time of the last bark */
  last: number;
}

export const NEVER = -1e9;

export function newMemory(): BarkMemory {
  return { lines: {}, groups: {}, last: NEVER };
}

export function ready(mem: BarkMemory, now: number, gap = GLOBAL_GAP): boolean {
  return now - mem.last >= gap;
}

export function requestReady(mem: BarkMemory, now: number, callout: string | null): boolean {
  return callout === null ? ready(mem, now) : now - (mem.groups[callout] ?? NEVER) >= CALLOUT_COOLDOWN;
}

export function lineFree(mem: BarkMemory, id: string, now: number, cooldown = LINE_COOLDOWN): boolean {
  const t = mem.lines[id];
  return t === undefined || now - t >= cooldown;
}

/** Pick one bark from the lines matching an event (already trigger-matched), or null. */
export function chooseBark(lines: DialogueLine[], mem: BarkMemory, now: number, rng: () => number, cooldown = LINE_COOLDOWN): DialogueLine | null {
  const free = lines.filter((l) => lineFree(mem, l.id, now, cooldown));
  if (!free.length) return null;
  const groups = new Map<string, DialogueLine[]>();
  for (const l of free) {
    const g = barkGroup(l.id);
    const list = groups.get(g);
    if (list) list.push(l);
    else groups.set(g, [l]);
  }
  const prio = (ls: DialogueLine[]) => Math.max(...ls.map((l) => l.priority ?? 0));
  const order = [...groups.entries()].sort((a, b) => (mem.groups[a[0]] ?? NEVER) - (mem.groups[b[0]] ?? NEVER) || prio(b[1]) - prio(a[1]));
  const [, list] = order[0]!;
  const top = prio(list);
  const best = list.filter((l) => (l.priority ?? 0) === top);
  return best[Math.min(best.length - 1, Math.floor(rng() * best.length))] ?? null;
}

export function record(mem: BarkMemory, line: DialogueLine, now: number): void {
  mem.lines[line.id] = now;
  mem.groups[barkGroup(line.id)] = now;
  mem.last = now;
}

export interface QuietState {
  echo: boolean;
  conversation: boolean;
  /** A story line is still being shown (estimated from dialogue:say). */
  dialogue: boolean;
  modal: boolean;
  curtain: boolean;
  memorial: string | null;
  /** Flag `barks.quiet` (finale, cut-scenes). */
  flag: boolean;
}

/** Why barks must wait, or null. */
export function quietReason(q: QuietState): string | null {
  if (q.memorial) return `memorial:${q.memorial}`;
  if (q.flag) return 'flag';
  if (q.echo) return 'echo';
  if (q.conversation) return 'conversation';
  if (q.curtain) return 'curtain';
  if (q.modal) return 'modal';
  if (q.dialogue) return 'dialogue';
  return null;
}

export interface MemorialZone {
  id: string;
  x?: number;
  z?: number;
  r?: number;
  /** Only in this era (default: every era). */
  era?: string;
  /** Or: inside this room (room:enter). */
  room?: string;
}

/** Built-in memorial places (bible 02-kapitel-1 §1.11: the Rondell, TF-36, 1815/348 r 20). */
export const BUILTIN_MEMORIALS: MemorialZone[] = [{ id: 'rondell', x: 1815, z: 348, r: 20 }];

/**
 * The memorial the player stands in, or null. `room`: the current room's ids (catalogue id, full id,
 * building id — a memorial `room` may name any of them).
 */
export function memorialAt(zones: Iterable<MemorialZone>, x: number, z: number, era: string, room: string | readonly string[] | null): string | null {
  const rooms = room === null ? [] : typeof room === 'string' ? [room] : room;
  for (const m of zones) {
    if (m.era && m.era !== era) continue;
    if (m.room && rooms.includes(m.room)) return m.id;
    if (m.x !== undefined && m.z !== undefined && Math.hypot(x - m.x, z - m.z) <= (m.r ?? 20)) return m.id;
  }
  return null;
}

/** Seconds a spoken line occupies the screen (same estimate as the story presenter). */
export function lineSeconds(text: string, ms?: number): number {
  const hold = ms !== undefined ? ms / 1000 : Math.min(9, Math.max(2.2, 1.4 + text.length * 0.045));
  return text.length / 42 + hold;
}

/** Deterministic RNG (mulberry32) for tests and replays. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
