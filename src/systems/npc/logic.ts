/**
 * Conversation rules (pure, unit-tested in tests/story-ext.test.ts).
 *
 * Content: dialogue lines with the trigger { event: 'npc:talk', npc, chapter, topic, step?,
 * flag?, value?, hasClue? } (scripts/content-build). Per (npc, chapter):
 *   - 'greet' opens the conversation (once lines: the first time only; a higher-priority greet
 *     line with `hasClue` wins once the player knows more),
 *   - every other topic except 'bye' is a question in the menu, in pack order; a topic whose lines
 *     need a flag / clue the player lacks stays hidden; `step` lines play in order as one answer,
 *   - 'bye' closes it (may be missing: the conversation simply ends).
 * Flags written by the npc system: talked.<chapter>.<npc> (any talk) and
 * talked.<chapter>.<npc>.<topic>. The first talk grants clue.<chapter>.<npc> when it exists.
 */
import type { DialogueLine } from '../../content/types';
import { type TriggerContext, matchTrigger, pickSequence } from '../../content/triggers';

export const GREET = 'greet';
export const BYE = 'bye';

export function talkLines(all: Iterable<DialogueLine>, npc: string, chapter: string): DialogueLine[] {
  const out: DialogueLine[] = [];
  for (const l of all) {
    const t = l.trigger;
    if (t.event === 'npc:talk' && t.npc === npc && t.chapter === chapter) out.push(l);
  }
  return out;
}

export function payloadFor(npc: string, chapter: string, topic: string): { npc: string; chapter: string; topic: string } {
  return { npc, chapter, topic };
}

/** Topics of the menu (pack order, or `order` first), only those with a line the player may hear now. */
export function availableTopics(lines: DialogueLine[], npc: string, chapter: string, c: TriggerContext, order?: string[]): string[] {
  const topics: string[] = [];
  for (const l of lines) {
    const tp = String(l.trigger.topic ?? '');
    if (!tp || tp === GREET || tp === BYE || topics.includes(tp)) continue;
    topics.push(tp);
  }
  if (order?.length) topics.sort((a, b) => rank(order, a) - rank(order, b));
  return topics.filter((tp) => lines.some((l) => l.trigger.topic === tp && matchTrigger(l, 'npc:talk', payloadFor(npc, chapter, tp), c) && !isFollowUp(l)));
}

const rank = (order: string[], t: string) => {
  const i = order.indexOf(t);
  return i < 0 ? 999 : i;
};

/** A step > 1 alone does not make a topic available (it continues an answer). */
function isFollowUp(l: DialogueLine): boolean {
  const s = Number(l.trigger.step ?? l.trigger.seq);
  return Number.isFinite(s) && s > 1;
}

/**
 * The lines of one answer, in order. `said` = ids already spoken (once lines are skipped);
 * non-once lines may be asked again (no cooldown inside a conversation).
 */
export function answer(lines: DialogueLine[], npc: string, chapter: string, topic: string, c: TriggerContext, said: ReadonlySet<string>): DialogueLine[] {
  const own = lines.filter((l) => l.trigger.topic === topic);
  return pickSequence(own, 'npc:talk', payloadFor(npc, chapter, topic), c, said, new Map(), 0, 0);
}

/**
 * Whether a placed person offers E now (TASK-076: no empty conversation box). True when a greeting
 * can still play (the same rule as `answer`), a menu topic is available, or quests gave it a topic;
 * also for a silent figure without any lines (it answers „(Schweigt und sieht dich an.)“). False
 * once everything it had was said, e.g. the guide after the car-park talk. Allocation-light: runs
 * per frame for the person within talk range.
 */
export function offersTalk(lines: readonly DialogueLine[], npc: string, chapter: string, c: TriggerContext, said: readonly string[], questTopics = 0): boolean {
  if (!lines.length || questTopics > 0) return true;
  const greet = { npc, chapter, topic: GREET };
  for (const l of lines) {
    const tp = String(l.trigger.topic ?? '');
    if (!tp || tp === BYE) continue;
    if (tp === GREET) {
      if (l.once && said.includes(l.id)) continue;
      if (matchTrigger(l, 'npc:talk', greet, c)) return true;
    } else if (!isFollowUp(l) && matchTrigger(l, 'npc:talk', payloadFor(npc, chapter, tp), c)) return true;
  }
  return false;
}

export function talkedFlag(chapter: string, npc: string, topic?: string): string {
  return `talked.${chapter}.${npc}${topic ? `.${topic}` : ''}`;
}

export function clueFor(chapter: string, npc: string): string {
  return `clue.${chapter}.${npc}`;
}

/** Topics asked already (flags) — shown dimmed in the menu, still askable. */
export function askedTopics(flags: Readonly<Record<string, unknown>>, chapter: string, npc: string, topics: string[]): Set<string> {
  return new Set(topics.filter((tp) => !!flags[talkedFlag(chapter, npc, tp)]));
}

// ---- turning to the player (playtest round 10, F-33: Soll talked with his back to the player) ----

/** Seconds a person takes to turn round to the player when a conversation opens. */
export const TALK_TURN_S = 0.4;
/** Seconds back to the idle heading after the talk. */
export const IDLE_TURN_S = 1.2;
/** Seconds of the slow turn towards a player who comes close (procedural figures: no head look). */
export const NEAR_TURN_S = 1.8;

/** Signed shortest arc from `from` to `to` (radians, in [−π, π)). */
export function shortestArc(from: number, to: number): number {
  const d = (((to - from) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI);
  return d - Math.PI;
}

/** The object yaw at which a figure at (x, z) faces (tx, tz) — the figure faces +z (rotation.y = 0). */
export function yawToward(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(tx - x, tz - z);
}

/**
 * One step of a turn from `current` towards `target` along the shortest arc: an exponential
 * approach that has covered 95 % of the angle after `seconds` (frame-rate independent). `snap`
 * (reduced motion) or `seconds <= 0` lands on the target at once. The result is wrapped to [−π, π).
 */
export function approachYaw(current: number, target: number, dt: number, seconds: number, snap = false): number {
  const arc = shortestArc(current, target);
  const k = snap || seconds <= 0 ? 1 : 1 - Math.exp((-3 * Math.max(0, dt)) / seconds);
  return shortestArc(0, current + arc * k);
}

/**
 * A watcher's sweep (court, "Unauffällig"): the heading in degrees (0 = north, 90 = east) at game
 * time `t`, easing back and forth between `sweep[0]` and `sweep[1]` along the shorter arc once per
 * `period` seconds (default 8). Without a sweep: `base` (the placement yaw, default 180).
 */
export function sweepYaw(watch: { sweep?: [number, number]; period?: number } | undefined, base: number | undefined, t: number): number {
  const b = base ?? 180;
  const sw = watch?.sweep;
  if (!sw) return b;
  const period = watch.period && watch.period > 0 ? watch.period : 8;
  let arc = (sw[1] - sw[0]) % 360;
  if (arc > 180) arc -= 360;
  if (arc < -180) arc += 360;
  const k = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / period);
  return sw[0] + arc * k;
}
