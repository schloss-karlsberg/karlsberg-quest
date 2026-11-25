/**
 * Dialogue trigger matching (pure, shared by the story runner, the NPC conversations and the
 * barks; unit-tested in tests/story-ext.test.ts). A line `{ trigger: { event, ...conditions } }`
 * matches when `event` is the emitted event and every extra key holds:
 *
 *   era        → the era after the event (payload.to for era:change, else the current era)
 *   flag       → a state flag is truthy (string), every flag in a list is truthy;
 *                with `value`: the flag equals the value (reading flags: noun id or 'offen';
 *                'n.r_x' and 'x' count as the same value)
 *   value      → only together with `flag`
 *   below      → a numeric payload field (oil | t | level | value) is < below; `above` → >
 *   hasClue    → the clue (or every clue of a list) is in the inventory
 *   chapter, beat → payload[key] when the event carries it (story:beat, npc:talk), else the
 *                running story chapter / beat
 *   step, seq  → no condition: position inside a sequence (see `pickSequence`)
 *   any other key → payload[key] equals the value (or is one of a list)
 */
import type { DialogueLine } from './types';

export type TriggerFlag = boolean | number | string;

export interface TriggerContext {
  era: string;
  flags: Readonly<Record<string, TriggerFlag>>;
  chapter: string | null;
  beat: string | null;
  /** Clue ids in the inventory (for `hasClue`). */
  clues?: readonly string[];
}

const eq = (want: unknown, got: unknown) => (Array.isArray(want) ? want.includes(got) : want === got);
const truthy = (v: TriggerFlag | undefined) => v !== undefined && v !== false && v !== 0 && v !== '';
/** Reading values: noun ids ("n.r_will_nicht", "n.eiskeller") and bare keys ("will_nicht") are the same. */
export const valueKey = (v: unknown) => String(v).replace(/^n\.r_/, '').replace(/^n\./, '');
const NUMERIC = ['oil', 't', 'level', 'value'] as const;
const SEQ_KEYS = new Set(['event', 'step', 'seq', 'value']);

function numericOf(p: Record<string, unknown>): number | null {
  for (const k of NUMERIC) if (typeof p[k] === 'number') return p[k] as number;
  return null;
}

export function flagMatches(flags: Readonly<Record<string, TriggerFlag>>, flag: unknown, value?: unknown): boolean {
  if (value !== undefined && !Array.isArray(flag)) {
    const got = flags[String(flag)];
    if (got === undefined) return false;
    return Array.isArray(value) ? value.some((v) => got === v || valueKey(got) === valueKey(v)) : got === value || valueKey(got) === valueKey(value);
  }
  const list = Array.isArray(flag) ? flag : [flag];
  return list.every((f) => truthy(flags[String(f)]));
}

export function matchTrigger(line: DialogueLine, name: string, payload: unknown, c: TriggerContext): boolean {
  const tr = line.trigger;
  if (tr.event !== name) return false;
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(tr)) {
    if (SEQ_KEYS.has(k)) continue;
    if (k === 'era') {
      const era = typeof p.to === 'string' ? p.to : c.era;
      if (!eq(v, era)) return false;
    } else if (k === 'flag') {
      if (!flagMatches(c.flags, v, tr.value)) return false;
    } else if (k === 'below' || k === 'above') {
      const n = numericOf(p);
      if (n === null || typeof v !== 'number') return false;
      if (k === 'below' ? !(n < v) : !(n > v)) return false;
    } else if (k === 'hasClue') {
      const list = Array.isArray(v) ? v : [v];
      if (!list.every((id) => (c.clues ?? []).includes(String(id)))) return false;
    } else if (k === 'chapter' || k === 'beat') {
      const got = k in p ? p[k] : k === 'chapter' ? c.chapter : c.beat;
      if (!eq(v, got)) return false;
    } else if (!eq(v, p[k])) return false;
  }
  return true;
}

export function stepOf(l: DialogueLine): number | null {
  const s = l.trigger.step;
  return typeof s === 'number' && Number.isFinite(s) ? s : null;
}

/**
 * Pick the single line to speak for an event. `lines` = ContentDB.dialogueFor(name)
 * (priority-sorted). `said` = once-lines already spoken; `lastSaid` = id → time (s) for the
 * repeat cooldown of non-once lines.
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

/**
 * The lines to speak for an event, in order. Lines carrying a `step` form a sequence (one scene):
 * every matching step plays in ascending order, the best plain (step-less) line counts as step 1
 * (bible pattern: "Soll answers, Laub interjects (step 2), Soll is offended (step 3)"). Among
 * alternatives of one step (e.g. flag value variants) the highest priority wins. Without any
 * stepped line this is `pickLine` (one line). `cooldown` 0 = no repeat cooldown (conversations).
 */
export function pickSequence(
  lines: DialogueLine[],
  name: string,
  payload: unknown,
  c: TriggerContext,
  said: ReadonlySet<string>,
  lastSaid: ReadonlyMap<string, number>,
  now: number,
  cooldown = 45,
): DialogueLine[] {
  const usable = (l: DialogueLine) => {
    if (!matchTrigger(l, name, payload, c)) return false;
    if (l.once && said.has(l.id)) return false;
    const t = lastSaid.get(l.id);
    return l.once || cooldown <= 0 || t === undefined || now - t >= cooldown;
  };
  const matching = lines.filter(usable);
  if (!matching.some((l) => stepOf(l) !== null)) {
    const one = pickLine(matching, name, payload, c, said, lastSaid, now, cooldown);
    return one ? [one] : [];
  }
  const bySlot = new Map<number, DialogueLine>();
  for (const l of matching) {
    const slot = stepOf(l) ?? 1;
    const cur = bySlot.get(slot);
    // a plain line yields slot 1 to an explicit step 1
    if (!cur || (l.priority ?? 0) > (cur.priority ?? 0) || (stepOf(cur) === null && stepOf(l) !== null && (l.priority ?? 0) >= (cur.priority ?? 0))) bySlot.set(slot, l);
  }
  return [...bySlot.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l);
}

/** Barks (bible 08-stimmen §1.1, §2.1): played by the barks system, never by the story runner. */
export const BARK_LINE = /\.bark\.|^marlene\.gen\./;
export function isBarkLine(id: string): boolean {
  return BARK_LINE.test(id);
}
/** Bark group = line id without its running number ("laub.bark.idle.03" → "laub.bark.idle"). */
export function barkGroup(id: string): string {
  return id.replace(/\.\d+$/, '');
}

/** German number words 0…999 (for "zweihundertdreiunddreißig Jahren"). */
export function germanNumber(n: number): string {
  const ones = ['null', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'];
  const teens = ['zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
  const tens = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];
  n = Math.max(0, Math.min(999, Math.round(n)));
  if (n === 0) return 'null';
  if (n === 1) return 'eins';
  const h = Math.floor(n / 100);
  const r = n % 100;
  let out = h ? `${h === 1 ? 'ein' : ones[h]}hundert` : '';
  if (r === 0) return out;
  if (r === 1) return out + 'eins';
  if (r < 10) return out + ones[r];
  if (r < 20) return out + teens[r - 10];
  const o = r % 10;
  const tw = tens[Math.floor(r / 10)]!;
  out += o ? `${ones[o]}und${tw}` : tw;
  return out;
}

/**
 * Text placeholders for spoken lines and the epilogue:
 *   {Name} / {name}     → the player's name
 *   {jahre:1793}        → years since 1793 in words ("zweihundertdreiunddreißig"); without a
 *                          plausible current year (clock before 2025 / after 2200) the bible's
 *                          fallback "über zweihundert"
 *   {jahr}              → the current year
 */
export function fillText(text: string, o: { name: string; year?: number | null; fallbackName?: string }): string {
  const year = o.year ?? null;
  const plausible = year !== null && year >= 2025 && year <= 2200;
  return text
    .replace(/\{[Nn]ame\}/g, o.name || o.fallbackName || '')
    .replace(/\{jahre:(\d{3,4})\}/g, (_, from: string) => {
      const n = plausible ? year! - Number(from) : NaN;
      if (!plausible || n < 0 || n > 999) return Number(from) < 1900 ? 'über zweihundert' : 'vielen';
      return germanNumber(n);
    })
    .replace(/\{jahr\}/g, plausible ? String(year) : 'heute');
}
