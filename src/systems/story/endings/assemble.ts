/**
 * Epilogue assembly from the endings pack (pure, unit-tested). The pack transcribes bible
 * 06-enden.md §6 as dialogue lines with the custom trigger
 *   { event: 'epilog:line', block, ending?, flag?, value? }
 * One sentence per block, blocks in pack order: intro → readings (spuren, lohn, warner,
 * warner-stelle, warner-tor, pluenderer, zerstoerer, zerstoerer-steine, meute, meute-namen) →
 * objekt → schluss → schluss-nachsatz. A block with flag lines takes the line whose `value`
 * equals the flag (reading flags hold the chosen noun id; "n.r_x" ≡ "x"), else its 'offen' line
 * (missing reading = "offen", bible §6), else nothing (add-on sentences like warner-stelle).
 * The object block falls back to 'nichts' (nothing rescued).
 */
import type { DialogueLine } from '../../../content/types';
import { type TriggerFlag, flagMatches, valueKey } from '../../../content/triggers';
import type { EndingId } from '../types';
import type { Epilogue } from './epilogue';

const ROLE: Record<string, 'intro' | 'object' | 'outro' | 'coda'> = {
  intro: 'intro',
  einleitung: 'intro',
  objekt: 'object',
  gegenstand: 'object',
  schluss: 'outro',
  'schluss-nachsatz': 'coda',
};

export interface AssembleOptions {
  /** Placeholder filler ({Name}, {jahre:1793}). */
  fill?: (text: string) => string;
}

export function epilogueLines(all: Iterable<DialogueLine>): DialogueLine[] {
  return [...all].filter((l) => l.trigger.event === 'epilog:line' && typeof l.trigger.block === 'string');
}

export function assembleEpilogue(lines: DialogueLine[], ending: EndingId, flags: Readonly<Record<string, TriggerFlag>>, o: AssembleOptions = {}): Epilogue | null {
  const ep = epilogueLines(lines);
  if (!ep.length) return null;
  const fill = o.fill ?? ((s: string) => s);
  const blocks: string[] = [];
  for (const l of ep) if (!blocks.includes(String(l.trigger.block))) blocks.push(String(l.trigger.block));
  const out: Epilogue = { ending, intro: '', lines: [], object: '', outro: '', coda: '', variants: {} };
  for (const b of blocks) {
    const cands = ep.filter((l) => l.trigger.block === b && (l.trigger.ending === undefined || l.trigger.ending === ending));
    if (!cands.length) continue;
    const flagged = cands.filter((l) => l.trigger.flag !== undefined);
    let pick: DialogueLine | undefined;
    if (flagged.length) {
      pick = flagged.find((l) => flagMatches(flags, l.trigger.flag, l.trigger.value));
      if (!pick) pick = flagged.find((l) => valueKey(l.trigger.value) === 'offen') ?? flagged.find((l) => valueKey(l.trigger.value) === 'nichts');
      out.variants[b] = pick ? valueKey(pick.trigger.value) : 'offen';
    } else pick = cands[0];
    if (!pick) continue;
    const text = fill(pick.text_de);
    const role = ROLE[b];
    if (role === 'intro') out.intro = text;
    else if (role === 'object') out.object = text;
    else if (role === 'outro') out.outro = text;
    else if (role === 'coda') out.coda = out.coda ? `${out.coda} ${text}` : text;
    else out.lines.push(text);
  }
  if (out.variants.objekt !== undefined) out.variants.object = out.variants.objekt;
  return out;
}
