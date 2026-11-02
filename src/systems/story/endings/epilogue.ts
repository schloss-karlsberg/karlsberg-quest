/**
 * Epilogue composer (pure, unit-tested): builds the epilogue page from the endings data
 * (content/story/05-enden.story.json → `epilogue`) and the player's READINGS (LESARTEN) in
 * `state.chronik[*].readings`, with flags as fallback. Bible: content/bible/06-enden.md §6.
 */
import type { CaseProgress } from '../../../core/state';
import type { EndingId, EpilogueData, EpilogueReading, FlagValue } from '../types';

export interface EpilogueSource {
  chronik: Readonly<Record<string, CaseProgress>>;
  flags: Readonly<Record<string, FlagValue>>;
}

export interface Epilogue {
  ending: EndingId;
  intro: string;
  lines: string[];
  object: string;
  outro: string;
  coda: string;
  /** Reading id → chosen variant (for tests and the debug hook). */
  variants: Record<string, string>;
}

/** Normalise a noun id to a variant key: explicit map, else strip "n.r_" / "n.". */
export function nounToVariant(nounId: string, map?: Record<string, string>): string {
  if (map?.[nounId]) return map[nounId]!;
  return nounId.replace(/^n\.r_/, '').replace(/^n\./, '');
}

export function readingVariant(r: EpilogueReading, src: EpilogueSource): string {
  let v: string | undefined;
  if (r.entry) {
    for (const c of Object.values(src.chronik)) {
      const blanks = c.readings?.[r.entry] ?? undefined;
      const noun = blanks ? Object.values(blanks)[0] : undefined;
      if (noun) {
        v = nounToVariant(noun, r.nouns);
        break;
      }
    }
  }
  if (v === undefined) {
    for (const f of r.flags ?? []) {
      const fv = src.flags[f];
      if (typeof fv === 'string' && fv) {
        v = fv;
        break;
      }
    }
  }
  return v !== undefined && v in r.text ? v : 'offen';
}

export function objectVariant(data: EpilogueData, src: EpilogueSource): string {
  for (const f of data.object.flags) {
    const fv = src.flags[f];
    if (typeof fv === 'string' && fv in data.object.text) return fv;
  }
  return 'nichts';
}

export function composeEpilogue(data: EpilogueData, ending: EndingId, src: EpilogueSource): Epilogue {
  const variants: Record<string, string> = {};
  const lines: string[] = [];
  for (const r of data.readings) {
    const v = readingVariant(r, src);
    variants[r.id] = v;
    const s = r.text[v] ?? '';
    if (s) lines.push(s);
    if (r.always) lines.push(r.always);
  }
  const obj = objectVariant(data, src);
  variants.object = obj;
  return {
    ending,
    intro: data.intro[ending],
    lines,
    object: data.object.text[obj]?.[ending] ?? '',
    outro: data.outro[ending],
    coda: data.coda?.[ending] ?? '',
    variants,
  };
}
