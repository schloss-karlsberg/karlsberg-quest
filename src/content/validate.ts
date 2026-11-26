/**
 * Content validator (pure; used by `pnpm validate`, the vitest suite and dev builds).
 * FAILS (errors) on: facts without source (non-fiction) or confidence label, unknown id
 * references, malformed entries, and Chronik cases that cannot be solved from placed clues.
 */
import { ERAS } from '../core/era';
import type { ChronikCase, Clue, ContentPack, Noun } from './types';

export interface Issue {
  level: 'error' | 'warning';
  file: string;
  id?: string;
  message: string;
}

export interface LoadedPack {
  file: string;
  pack: ContentPack;
}

export interface ValidateOptions {
  /** Walkable extent of the game area; clues outside it are errors. */
  bounds?: { x0: number; z0: number; x1: number; z1: number };
}

export interface ValidationResult {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  stats: Record<string, number>;
}

const ID_RE = /^[a-z0-9][a-z0-9._-]*$/i;
const CONF = new Set(['D', 'I', 'N', 'U']);
const NOUN_CATS = new Set(['person', 'place', 'object', 'cause', 'time', 'action', 'group', 'other']);
const CLUE_KINDS = new Set(['object', 'echo', 'document', 'relief', 'map', 'dialogue']);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isUrl = (v: unknown) => typeof v === 'string' && /^https?:\/\/\S+$/.test(v);

export function validateContent(packs: LoadedPack[], opts: ValidateOptions = {}): ValidationResult {
  const issues: Issue[] = [];
  const err = (file: string, id: string | undefined, message: string) => issues.push({ level: 'error', file, id, message });
  const warn = (file: string, id: string | undefined, message: string) => issues.push({ level: 'warning', file, id, message });

  type Kind = 'facts' | 'nouns' | 'clues' | 'cases' | 'speakers' | 'dialogue' | 'hints';
  const kinds: Kind[] = ['facts', 'nouns', 'clues', 'cases', 'speakers', 'dialogue', 'hints'];
  const ids: Record<Kind, Map<string, string>> = Object.fromEntries(kinds.map((k) => [k, new Map()])) as Record<Kind, Map<string, string>>;
  const all = {
    facts: [] as [string, NonNullable<ContentPack['facts']>[number]][],
    nouns: [] as [string, Noun][],
    clues: [] as [string, Clue][],
    cases: [] as [string, ChronikCase][],
    speakers: [] as [string, NonNullable<ContentPack['speakers']>[number]][],
    dialogue: [] as [string, NonNullable<ContentPack['dialogue']>[number]][],
    hints: [] as [string, NonNullable<ContentPack['hints']>[number]][],
  };

  // ---- pass 1: structure + id registry
  for (const { file, pack } of packs) {
    if (!pack || typeof pack !== 'object') {
      err(file, undefined, 'pack is not an object');
      continue;
    }
    if (!isStr(pack.pack)) err(file, undefined, 'pack: missing "pack" name');
    for (const k of kinds) {
      const arr = (pack as unknown as Record<string, unknown>)[k];
      if (arr === undefined) continue;
      if (!Array.isArray(arr)) {
        err(file, undefined, `"${k}" must be an array`);
        continue;
      }
      for (const item of arr as { id?: unknown }[]) {
        if (!item || typeof item !== 'object' || !isStr(item.id) || !ID_RE.test(item.id)) {
          err(file, String(item?.id ?? '?'), `${k}: missing or malformed id`);
          continue;
        }
        const prev = ids[k].get(item.id);
        if (prev) err(file, item.id, `${k}: duplicate id (also in ${prev})`);
        ids[k].set(item.id, file);
        (all[k] as [string, unknown][]).push([file, item]);
      }
    }
  }

  // ---- facts
  for (const [file, f] of all.facts) {
    if (!isStr(f.title_de)) err(file, f.id, 'fact: missing title_de');
    if (!isStr(f.text_de)) err(file, f.id, 'fact: missing text_de');
    if (!CONF.has(f.confidence as string)) err(file, f.id, 'fact: missing or invalid confidence label (D/I/N/U)');
    if (typeof f.fiction !== 'boolean') err(file, f.id, 'fact: "fiction" flag must be true or false');
    const sources = Array.isArray(f.sources) ? f.sources : [];
    if (!Array.isArray(f.sources)) err(file, f.id, 'fact: "sources" must be an array');
    if (!f.fiction && sources.length === 0) err(file, f.id, 'fact: no source (every non-fiction fact needs at least one)');
    for (const s of sources) if (!isUrl(s?.url)) err(file, f.id, `fact: source without valid http(s) url (${JSON.stringify(s)})`);
    for (const s of sources) if (/(?:saar-lidar-|research\/\d|\b[\w-]+\/[\w-]+\.md\b)/.test(`${s?.label ?? ''} ${(s as { note?: string })?.note ?? ''}`)) err(file, f.id, 'fact: source note shows a repo path (players read it in the codex)');
    if (f.era !== undefined && !(ERAS as readonly string[]).includes(f.era)) err(file, f.id, `fact: unknown era '${f.era}'`);
  }

  // ---- nouns
  for (const [file, n] of all.nouns) {
    if (!isStr(n.label_de)) err(file, n.id, 'noun: missing label_de');
    if (!NOUN_CATS.has(n.category)) err(file, n.id, `noun: unknown category '${n.category}'`);
    if (n.plural_de !== undefined && !isStr(n.plural_de)) err(file, n.id, 'noun: "plural_de" must be a non-empty string');
  }
  const nounById = new Map(all.nouns.map(([, n]) => [n.id, n]));

  // ---- clues
  const b = opts.bounds;
  for (const [file, c] of all.clues) {
    if (!isStr(c.title_de)) err(file, c.id, 'clue: missing title_de');
    if (!CLUE_KINDS.has(c.kind)) err(file, c.id, `clue: unknown kind '${c.kind}'`);
    const w = c.where;
    if (!w || !isNum(w.x) || !isNum(w.z) || !isNum(w.radius) || w.radius <= 0) err(file, c.id, 'clue: "where" needs numeric x, z and radius > 0');
    else if (b && (w.x < b.x0 || w.x > b.x1 || w.z < b.z0 || w.z > b.z1)) err(file, c.id, `clue: position (${w.x}, ${w.z}) is outside the game area`);
    const eras = w ? (Array.isArray(w.era) ? w.era : [w.era]) : [];
    if (!eras.length) err(file, c.id, 'clue: "where.era" missing');
    for (const e of eras) if (!(ERAS as readonly string[]).includes(e)) err(file, c.id, `clue: unknown era '${e}'`);
    if (!c.reveals || typeof c.reveals !== 'object') err(file, c.id, 'clue: missing "reveals"');
    for (const n of c.reveals?.nouns ?? []) if (!ids.nouns.has(n)) err(file, c.id, `clue: reveals unknown noun '${n}'`);
    for (const f of c.reveals?.facts ?? []) if (!ids.facts.has(f)) err(file, c.id, `clue: reveals unknown fact '${f}'`);
    for (const r of c.requires?.clues ?? []) if (!ids.clues.has(r)) err(file, c.id, `clue: requires unknown clue '${r}'`);
    if (!(c.reveals?.nouns?.length || c.reveals?.facts?.length || c.reveals?.flags?.length)) warn(file, c.id, 'clue: reveals nothing');
    if (c.requires?.scanMode !== undefined && ![1, 2, 3].includes(c.requires.scanMode)) err(file, c.id, 'clue: requires.scanMode must be 1, 2 or 3');
    for (const fl of [...(c.requires?.flags ?? []), ...(c.reveals?.flags ?? [])]) if (!isStr(fl)) err(file, c.id, 'clue: flags must be non-empty strings');
    if (c.echoDate_de !== undefined && !isStr(c.echoDate_de)) err(file, c.id, 'clue: "echoDate_de" must be a non-empty string');
    if (c.needsLantern !== undefined && typeof c.needsLantern !== 'boolean') err(file, c.id, 'clue: "needsLantern" must be true or false');
    if (c.chapter !== undefined && !isStr(c.chapter)) err(file, c.id, 'clue: "chapter" must be a non-empty string');
    if (c.sketch !== undefined) {
      const sk = c.sketch;
      if (!sk || !isNum(sk.x) || !isNum(sk.z) || (sk.size !== undefined && (!isNum(sk.size) || sk.size <= 0))) err(file, c.id, 'clue: "sketch" needs numeric x, z (and size > 0)');
      else if (b && (sk.x < b.x0 || sk.x > b.x1 || sk.z < b.z0 || sk.z > b.z1)) err(file, c.id, `clue: sketch (${sk.x}, ${sk.z}) is outside the game area`);
    }
  }

  // reachable clues: fixed point over `requires.clues` (cycles are unreachable)
  const reachable = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [, c] of all.clues) {
      if (reachable.has(c.id)) continue;
      if ((c.requires?.clues ?? []).every((r) => reachable.has(r))) {
        reachable.add(c.id);
        grew = true;
      }
    }
  }
  for (const [file, c] of all.clues) if (!reachable.has(c.id)) err(file, c.id, 'clue: can never be found (requires a clue cycle or an unreachable clue)');
  const obtainable = new Map<string, string[]>(); // noun -> clue ids
  for (const [, c] of all.clues) {
    if (!reachable.has(c.id)) continue;
    for (const n of c.reveals?.nouns ?? []) obtainable.set(n, [...(obtainable.get(n) ?? []), c.id]);
  }

  // ---- cases (+ solvability)
  for (const [file, cs] of all.cases) {
    if (!isStr(cs.title_de)) err(file, cs.id, 'case: missing title_de');
    if (!Array.isArray(cs.entries) || cs.entries.length === 0) {
      err(file, cs.id, 'case: needs at least one entry');
      continue;
    }
    const entryIds = new Set<string>();
    let facts = 0;
    for (const e of cs.entries) {
      const where = `${cs.id}/${e.id}`;
      if (!isStr(e.id)) err(file, cs.id, 'case entry: missing id');
      if (entryIds.has(e.id)) err(file, where, 'case entry: duplicate id');
      entryIds.add(e.id);
      if (e.kind !== 'fact' && e.kind !== 'reading') err(file, where, `case entry: kind must be 'fact' or 'reading'`);
      if (!isStr(e.text_de)) err(file, where, 'case entry: missing text_de');
      const inText = new Set([...(e.text_de ?? '').matchAll(/\{(\w[\w-]*)\}/g)].map((m) => m[1]!));
      const blanks = Array.isArray(e.blanks) ? e.blanks : [];
      if (!blanks.length) err(file, where, 'case entry: needs at least one blank');
      for (const bl of blanks) {
        if (!inText.has(bl.id)) err(file, where, `blank '${bl.id}' is not used in text_de`);
        inText.delete(bl.id);
        for (const a of bl.accepts ?? []) if (!ids.nouns.has(a)) err(file, where, `blank '${bl.id}' accepts unknown noun '${a}'`);
        if (bl.category && !NOUN_CATS.has(bl.category)) err(file, where, `blank '${bl.id}': unknown category '${bl.category}'`);
        if (bl.plural !== undefined && typeof bl.plural !== 'boolean') err(file, where, `blank '${bl.id}': "plural" must be true or false`);
        if (bl.plural === true)
          for (const a of bl.accepts ?? []) if (nounById.has(a) && !nounById.get(a)!.plural_de) warn(file, where, `blank '${bl.id}' is plural but noun '${a}' has no plural_de`);
        if (bl.labels_de !== undefined) {
          if (!bl.labels_de || typeof bl.labels_de !== 'object' || Array.isArray(bl.labels_de)) err(file, where, `blank '${bl.id}': "labels_de" must be an object`);
          else
            for (const [n, lbl] of Object.entries(bl.labels_de)) {
              if (!ids.nouns.has(n)) err(file, where, `blank '${bl.id}': labels_de for unknown noun '${n}'`);
              else if (bl.accepts && !bl.accepts.includes(n)) err(file, where, `blank '${bl.id}': labels_de for noun '${n}' that is not in accepts`);
              if (!isStr(lbl)) err(file, where, `blank '${bl.id}': labels_de['${n}'] must be a non-empty string`);
            }
        }
        if (bl.alsoCorrect !== undefined) {
          if (e.kind !== 'fact') err(file, where, `blank '${bl.id}': "alsoCorrect" is only allowed in fact entries`);
          if (!Array.isArray(bl.alsoCorrect)) err(file, where, `blank '${bl.id}': "alsoCorrect" must be an array`);
          else
            for (const a of bl.alsoCorrect) {
              if (!ids.nouns.has(a)) err(file, where, `blank '${bl.id}': alsoCorrect unknown noun '${a}'`);
              else if (bl.accepts && !bl.accepts.includes(a)) err(file, where, `blank '${bl.id}': alsoCorrect noun '${a}' is not in accepts`);
            }
        }
        if (e.kind === 'fact') {
          if (!isStr(bl.correct)) err(file, where, `fact blank '${bl.id}' has no correct noun`);
          else if (!ids.nouns.has(bl.correct)) err(file, where, `blank '${bl.id}': correct noun '${bl.correct}' is unknown`);
          else {
            if (bl.accepts && !bl.accepts.includes(bl.correct)) err(file, where, `blank '${bl.id}': correct noun '${bl.correct}' is not in accepts`);
            if (!obtainable.has(bl.correct)) err(file, where, `UNSOLVABLE: noun '${bl.correct}' (blank '${bl.id}') is not revealed by any placed, reachable clue`);
          }
        } else {
          if (bl.correct !== undefined) warn(file, where, `reading blank '${bl.id}' has a 'correct' noun; readings are never confirmed`);
          const options = bl.accepts ?? [];
          if (options.length && !options.some((n) => obtainable.has(n))) err(file, where, `UNSOLVABLE: no noun accepted by reading blank '${bl.id}' can be obtained from clues`);
        }
      }
      for (const left of inText) err(file, where, `text_de uses {${left}} but there is no such blank`);
      if (e.flag !== undefined) {
        if (!isStr(e.flag)) err(file, where, 'case entry: "flag" must be a non-empty string');
        if (e.kind !== 'reading') err(file, where, 'case entry: "flag" is only allowed on reading entries');
      }
      if (e.kind === 'fact') {
        facts++;
        if (e.factId !== undefined && !ids.facts.has(e.factId)) err(file, where, `entry unlocks unknown fact '${e.factId}'`);
      }
    }
    if (facts > 0 && facts < 3) warn(file, cs.id, `case has ${facts} fact entries; confirmation works in batches of three`);
  }

  // ---- speakers & dialogue
  const speakers = new Map(all.speakers.map(([, s]) => [s.id, s]));
  for (const [file, s] of all.speakers) {
    if (!isStr(s.name_de)) err(file, s.id, 'speaker: missing name_de');
    if (typeof s.historical !== 'boolean') err(file, s.id, 'speaker: "historical" must be true or false');
  }
  for (const [file, d] of all.dialogue) {
    if (!isStr(d.text_de)) err(file, d.id, 'dialogue: missing text_de');
    if (!isStr(d.speaker)) err(file, d.id, 'dialogue: missing speaker');
    else if (!speakers.has(d.speaker)) err(file, d.id, `dialogue: unknown speaker '${d.speaker}'`);
    else if (speakers.get(d.speaker)!.historical && !(d.sources ?? []).some((s) => isUrl(s?.url)))
      err(file, d.id, `dialogue: '${d.speaker}' is a historical person; the line needs a source`);
    if (!d.trigger || !isStr(d.trigger.event)) err(file, d.id, 'dialogue: trigger.event missing');
  }

  // ---- hints
  const caseById = new Map(all.cases.map(([, c]) => [c.id, c]));
  for (const [file, hnt] of all.hints) {
    const cs = caseById.get(hnt.caseId);
    if (!cs) err(file, hnt.id, `hint: unknown case '${hnt.caseId}'`);
    else if (hnt.entryId && !cs.entries.some((e) => e.id === hnt.entryId)) err(file, hnt.id, `hint: unknown entry '${hnt.entryId}' in case '${hnt.caseId}'`);
    if (![1, 2, 3].includes(hnt.level)) err(file, hnt.id, 'hint: level must be 1, 2 or 3');
    if (!isStr(hnt.text_de)) err(file, hnt.id, 'hint: missing text_de');
  }

  const errors = issues.filter((i) => i.level === 'error');
  return {
    ok: errors.length === 0,
    errors,
    warnings: issues.filter((i) => i.level === 'warning'),
    stats: Object.fromEntries(kinds.map((k) => [k, all[k].length])),
  };
}

export function formatIssues(r: Pick<ValidationResult, 'errors' | 'warnings'>): string {
  const line = (i: Issue) => `${i.level === 'error' ? 'ERROR' : 'warn '} ${i.file}${i.id ? ` [${i.id}]` : ''}: ${i.message}`;
  return [...r.errors, ...r.warnings].map(line).join('\n');
}
