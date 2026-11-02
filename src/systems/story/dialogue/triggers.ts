/**
 * ContentDB dialogue triggers (pure, unit-tested). A line `{ trigger: { event, ...conditions } }`
 * fires when `event` is emitted and every extra key matches:
 *   era      → the era after the event (payload.to for era:change, else the current era)
 *   flag     → a state flag is truthy (string) / every flag in a list is truthy
 *   chapter, beat → the running story chapter / beat
 *   any other key → payload[key] equals the value (or is one of a list)
 * `once` lines are spoken a single time (persisted); others have a cooldown. Among matches the
 * highest `priority` wins.
 */
import type { DialogueLine } from '../../../content/types';
import type { FlagValue } from '../types';

export interface TriggerContext {
  era: string;
  flags: Readonly<Record<string, FlagValue>>;
  chapter: string | null;
  beat: string | null;
}

const eq = (want: unknown, got: unknown) => (Array.isArray(want) ? want.includes(got) : want === got);
const truthy = (v: FlagValue | undefined) => v !== undefined && v !== false && v !== 0 && v !== '';

export function matchTrigger(line: DialogueLine, name: string, payload: unknown, c: TriggerContext): boolean {
  if (line.trigger.event !== name) return false;
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(line.trigger)) {
    if (k === 'event') continue;
    if (k === 'era') {
      const era = typeof p.to === 'string' ? p.to : c.era;
      if (!eq(v, era)) return false;
    } else if (k === 'flag') {
      const list = Array.isArray(v) ? v : [v];
      if (!list.every((f) => truthy(c.flags[String(f)]))) return false;
    } else if (k === 'chapter') {
      if (!eq(v, c.chapter)) return false;
    } else if (k === 'beat') {
      if (!eq(v, c.beat)) return false;
    } else if (!eq(v, p[k])) return false;
  }
  return true;
}

/**
 * Pick the line to speak for an event. `lines` = ContentDB.dialogueFor(name) (priority-sorted).
 * `said` = once-lines already spoken; `lastSaid` = id → time (s) for the repeat cooldown.
 */
export function pickLine(
  lines: DialogueLine[],
  name: string,
  payload: unknown,
  c: TriggerContext,
  said: ReadonlySet<string>,
  lastSaid: ReadonlyMap<string, number>,
  now: number,
  cooldown = 45,
): DialogueLine | null {
  let best: DialogueLine | null = null;
  for (const l of lines) {
    if (!matchTrigger(l, name, payload, c)) continue;
    if (l.once && said.has(l.id)) continue;
    const t = lastSaid.get(l.id);
    if (!l.once && t !== undefined && now - t < cooldown) continue;
    if (!best || (l.priority ?? 0) > (best.priority ?? 0)) best = l;
  }
  return best;
}
