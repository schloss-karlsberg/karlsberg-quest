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
