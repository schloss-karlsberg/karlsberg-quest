/**
 * Pure Chronik rules (no DOM, no three.js): clue availability, blank acceptance, batch-of-three
 * confirmation, discovery bookkeeping, loss on capture, hint ladder. Unit-tested in
 * tests/chronik.test.ts. Everything works on plain JSON state so it can be saved as is.
 */
import type { CaseProgress } from '../../core/state';
import type { ChronikCase, CaseEntry, Clue, ContentPack, DialogueLine, Fact, Hint, Noun } from '../../content/types';
import type { ChronikBlank, ChronikClue, ChronikSlice, NounLike } from './types';
import type { Era } from '../../core/era';

// ---------------------------------------------------------------------------------------------
// content view

/** The content the Chronik works with (placeholder packs only when no real content exists). */
export interface ChronikContent {
  facts: Map<string, Fact>;
  nouns: Map<string, Noun>;
  clues: Map<string, ChronikClue>;
  cases: Map<string, ChronikCase>;
  hints: Map<string, Hint>;
  /** Echo lines per echo clue id, in playing order. */
  echoLines: Map<string, DialogueLine[]>;
}

export function hasRealContent(packs: { pack: ContentPack }[]): boolean {
  return packs.some(({ pack }) => !pack.placeholder && ((pack.cases?.length ?? 0) > 0 || (pack.clues?.length ?? 0) > 0));
}

/**
 * Merge packs into the Chronik's view. Placeholder packs (examples, tests) are used only when
 * there is no real content yet, or when explicitly requested (`?placeholder`).
 */
export function buildContent(packs: { pack: ContentPack }[], includePlaceholder = !hasRealContent(packs)): ChronikContent {
  const c: ChronikContent = { facts: new Map(), nouns: new Map(), clues: new Map(), cases: new Map(), hints: new Map(), echoLines: new Map() };
  const lines: { d: DialogueLine; i: number }[] = [];
  let i = 0;
  for (const { pack } of packs) {
    // dialogue (echo lines) and nouns/facts are harmless to include from any pack
    for (const d of pack.dialogue ?? []) lines.push({ d, i: i++ });
    const use = includePlaceholder || !pack.placeholder;
    for (const n of pack.nouns ?? []) c.nouns.set(n.id, n);
    if (!use) continue;
    for (const f of pack.facts ?? []) c.facts.set(f.id, f);
    for (const cl of pack.clues ?? []) c.clues.set(cl.id, cl as ChronikClue);
    for (const cs of pack.cases ?? []) c.cases.set(cs.id, cs);
    for (const h of pack.hints ?? []) c.hints.set(h.id, h);
  }
  const seq = (d: DialogueLine, idx: number) => (typeof d.trigger.seq === 'number' ? (d.trigger.seq as number) : 1000 + idx);
  for (const { d } of lines.sort((a, b) => seq(a.d, a.i) - seq(b.d, b.i))) {
    if (d.trigger.event !== 'echo:start' || typeof d.trigger.id !== 'string') continue;
    const list = c.echoLines.get(d.trigger.id) ?? [];
    list.push(d);
    c.echoLines.set(d.trigger.id, list);
  }
  return c;
}

export function clueEras(c: Clue): Era[] {
  return Array.isArray(c.where.era) ? c.where.era : [c.where.era];
}

// ---------------------------------------------------------------------------------------------
// clues

export interface ClueEnv {
  found: ReadonlySet<string> | readonly string[];
  flags: Readonly<Record<string, boolean | number | string>>;
  skills: Readonly<Record<string, number>>;
  scanMode: number;
  lanternLit: boolean;
  /**
   * Clue chapters that are in the world (`Clue.chapter` ids: 'tour', 'k1' … 'k4'). A clue of any
   * other chapter stays hidden (the tour: no spoilers at the spring). Omitted = all open.
   */
  chapters?: ReadonlySet<string> | null;
}

/**
 * - found          already examined / heard
 * - hidden         preconditions (clues, flags, skill) not met: not in the world at all
 * - needs-scan     a relief feature: invisible without the right Relief-Blick mode
 * - needs-lantern  visible as a faint glint, but only readable with the lantern lit
 * - available      can be examined / listened to
 */
export type ClueStatus = 'found' | 'hidden' | 'needs-scan' | 'needs-lantern' | 'available';

const has = (s: ReadonlySet<string> | readonly string[], id: string) => (s instanceof Set ? s.has(id) : (s as readonly string[]).includes(id));

/** Skill requirement: "relief" (≥ 1) or "relief:2" (≥ 2). */
export function skillMet(req: string | undefined, skills: Readonly<Record<string, number>>): boolean {
  if (!req) return true;
  const [name, lvl] = req.split(':');
  return (skills[name!] ?? 0) >= (lvl ? Number(lvl) : 1);
}

/** Relief clues without an explicit scanMode need any scan mode (≥ 1). */
export function requiredScan(c: ChronikClue): number {
  return c.requires?.scanMode ?? (c.kind === 'relief' ? 1 : 0);
}

export function clueStatus(c: ChronikClue, env: ClueEnv): ClueStatus {
  if (has(env.found, c.id)) return 'found';
  if (c.chapter && env.chapters && !env.chapters.has(c.chapter)) return 'hidden';
  const r = c.requires;
  if (r?.clues?.some((id) => !has(env.found, id))) return 'hidden';
  if (r?.flags?.some((f) => !env.flags[f])) return 'hidden';
  if (!skillMet(r?.skill, env.skills)) return 'hidden';
  const scan = requiredScan(c);
  if (scan > 0 && env.scanMode < scan) return 'needs-scan';
  if ((r?.lantern || c.needsLantern) && !env.lanternLit) return 'needs-lantern';
  return 'available';
}

/** Story chapters in play order, as `Clue.chapter` ids ('enden' has no clues of its own). */
export const CHAPTER_ORDER: readonly string[] = ['tour', 'k1', 'k2', 'k3', 'k4', 'enden'];

/**
 * A clue of a chapter the story has already left (optional notes from chapter 1 while chapter 2
 * runs): its marker retires so the world does not keep pointing at old business. E on the spot
 * still works — nothing becomes unreachable. `running`: the running chapter's clue id ('tour' …), or
 * null without a story (sandbox, tests): nothing retires.
 */
export function clueRetired(c: { chapter?: string }, running: string | null): boolean {
  if (!c.chapter || !running) return false;
  const a = CHAPTER_ORDER.indexOf(c.chapter);
  const b = CHAPTER_ORDER.indexOf(running);
  return a >= 0 && b >= 0 && a < b;
}

/** Distance on the x/z plane. */
export function clueDistance(c: Clue, x: number, z: number): number {
  return Math.hypot(c.where.x - x, c.where.z - z);
}

// ---------------------------------------------------------------------------------------------
// discovery

export interface Inventory {
  clues: string[];
  nouns: string[];
  items: string[];
}

export interface Discovery {
  clue: string;
  newNouns: string[];
  newFacts: string[];
  flags: string[];
}

/**
 * Add a clue's findings to the inventory/codex/flags and remember them in `since` (at risk until
 * the next confirmation). Idempotent: an already found clue returns null.
 */
export function discover(
  clue: ChronikClue,
  s: { inventory: Inventory; codex: { facts: string[] }; flags: Record<string, boolean | number | string> },
  slice: Pick<ChronikSlice, 'since'>,
): Discovery | null {
  if (s.inventory.clues.includes(clue.id)) return null;
  s.inventory.clues.push(clue.id);
  slice.since.clues.push(clue.id);
  const newNouns: string[] = [];
  for (const n of clue.reveals.nouns ?? []) {
    if (s.inventory.nouns.includes(n)) continue;
    s.inventory.nouns.push(n);
    slice.since.nouns.push(n);
    newNouns.push(n);
  }
  const newFacts: string[] = [];
  for (const f of clue.reveals.facts ?? []) {
    if (s.codex.facts.includes(f)) continue;
    s.codex.facts.push(f);
    slice.since.facts.push(f);
    newFacts.push(f);
  }
  const flags = clue.reveals.flags ?? [];
  for (const f of flags) s.flags[f] = true;
  return { clue: clue.id, newNouns, newFacts, flags };
}

// ---------------------------------------------------------------------------------------------
// blanks & entries

/** Labels used by the board for the question each category answers. */
export const CATEGORY_QUESTION: Record<Noun['category'], string> = {
  person: 'wer',
  group: 'wer',
  place: 'wo',
  time: 'wann',
  object: 'was',
  action: 'wie',
  cause: 'warum',
  other: 'wie viel',
};

function categoryFits(want: Noun['category'], got: Noun['category']): boolean {
  if (want === got) return true;
  // "Wer" covers persons and groups (bible §6.4)
  const who = new Set(['person', 'group']);
  return who.has(want) && who.has(got);
}

export function nounFits(blank: ChronikBlank, noun: NounLike): boolean {
  if (blank.accepts?.length) return blank.accepts.includes(noun.id);
  if (blank.category) return categoryFits(blank.category, noun.category);
  return true;
}

export function blankCorrect(blank: ChronikBlank, nounId: string | undefined): boolean {
  if (!nounId || !blank.correct) return false;
  return nounId === blank.correct || (blank.also ?? []).includes(nounId);
}

export function emptyProgress(): CaseProgress {
  return { filled: {}, confirmed: [], readings: {} };
}

/** Values of an entry (facts from `filled`, readings from `readings`). */
export function entryValues(p: CaseProgress, e: CaseEntry): Record<string, string> {
  return (e.kind === 'reading' ? p.readings[e.id] : p.filled[e.id]) ?? {};
}

export function entryComplete(p: CaseProgress, e: CaseEntry): boolean {
  const v = entryValues(p, e);
  return e.blanks.length > 0 && e.blanks.every((b) => !!v[b.id]);
}

export function entryCorrect(p: CaseProgress, e: CaseEntry): boolean {
  if (e.kind !== 'fact') return false;
  const v = entryValues(p, e);
  return entryComplete(p, e) && e.blanks.every((b) => blankCorrect(b as ChronikBlank, v[b.id]));
}

/**
 * Put a noun into a blank (null clears it). Confirmed entries are locked. Returns true when the
 * progress changed. Readings are stored in `readings` (never confirmed).
 */
export function setBlank(p: CaseProgress, e: CaseEntry, blankId: string, nounId: string | null): boolean {
  if (p.confirmed.includes(e.id)) return false;
  if (!e.blanks.some((b) => b.id === blankId)) return false;
  const store = e.kind === 'reading' ? p.readings : p.filled;
  const row = store[e.id] ?? {};
  if ((row[blankId] ?? null) === nounId) return false;
  if (nounId === null) delete row[blankId];
  else row[blankId] = nounId;
  if (Object.keys(row).length) store[e.id] = row;
  else delete store[e.id];
  return true;
}

export interface BatchResult {
  /** At least three complete, unconfirmed fact entries (or all that are left): the "Prüfen" button is active. */
  ready: boolean;
  /** Complete, unconfirmed fact entries (the batch). */
  pending: string[];
  /** All entries of the batch are right. */
  correct: boolean;
  /** Entries confirmed by this check (all of `pending` if correct, else none). */
  confirmed: string[];
  /** Which pending entries are right (only ever shown to the player in gentle mode). */
  rightOnes: string[];
}

export const BATCH = 3;

/** The batch-of-three rule: confirm only if every filled fact entry of the batch is right. */
export function evaluateBatch(cs: ChronikCase, p: CaseProgress): BatchResult {
  const open = cs.entries.filter((e) => e.kind === 'fact' && !p.confirmed.includes(e.id));
  const pending = open.filter((e) => entryComplete(p, e)).map((e) => e.id);
  // the last one or two entries of a case (fewer than three left) may be checked on their own
  const ready = pending.length >= Math.min(BATCH, open.length) && pending.length > 0;
  const byId = new Map(cs.entries.map((e) => [e.id, e]));
  const rightOnes = pending.filter((id) => entryCorrect(p, byId.get(id)!));
  const correct = ready && rightOnes.length === pending.length;
  return { ready, pending, correct, confirmed: correct ? pending : [], rightOnes };
}

/** Apply a batch result; returns the codex facts unlocked by the newly confirmed entries. */
export function applyBatch(cs: ChronikCase, p: CaseProgress, r: BatchResult): string[] {
  const facts: string[] = [];
  for (const id of r.confirmed) {
    if (!p.confirmed.includes(id)) p.confirmed.push(id);
    const f = cs.entries.find((e) => e.id === id)?.factId;
    if (f) facts.push(f);
  }
  return facts;
}

export function factEntries(cs: ChronikCase): CaseEntry[] {
  return cs.entries.filter((e) => e.kind === 'fact' && e.blanks.length > 0);
}

export function caseComplete(cs: ChronikCase, p: CaseProgress | undefined): boolean {
  const facts = factEntries(cs);
  return !!p && facts.length > 0 && facts.every((e) => p.confirmed.includes(e.id));
}

/** Share of confirmed fact entries 0..1 (board tabs, "Chronik complete" percentage). */
export function caseRatio(cs: ChronikCase, p: CaseProgress | undefined): number {
  const facts = factEntries(cs);
  if (!facts.length || !p) return 0;
  return facts.filter((e) => p.confirmed.includes(e.id)).length / facts.length;
}

/** Nouns a case can use (correct answers + offered options). */
export function caseNouns(cs: ChronikCase): Set<string> {
  const s = new Set<string>();
  for (const e of cs.entries)
    for (const b of e.blanks as ChronikBlank[]) {
      if (b.correct) s.add(b.correct);
      for (const a of b.accepts ?? []) s.add(a);
      for (const a of b.also ?? []) s.add(a);
    }
  return s;
}

/** A case page shows up on the board once the player has progress on it or knows one of its nouns. */
export function caseVisible(cs: ChronikCase, chronik: Readonly<Record<string, CaseProgress>>, knownNouns: readonly string[]): boolean {
  if (chronik[cs.id]) return true;
  const ns = caseNouns(cs);
  return knownNouns.some((n) => ns.has(n));
}

// ---------------------------------------------------------------------------------------------
// capture (PRD §3.1): lose what was found since the last confirmation and is not protected

export interface LossResult {
  clues: string[];
  nouns: string[];
  facts: string[];
}

export function loseUnconfirmed(
  s: { inventory: Inventory; codex: { facts: string[] }; chronik: Record<string, CaseProgress> },
  slice: Pick<ChronikSlice, 'since'>,
  content: Pick<ChronikContent, 'clues' | 'cases'>,
): LossResult {
  const dropClues = new Set(slice.since.clues);
  const keptClues = s.inventory.clues.filter((c) => !dropClues.has(c));
  // nouns/facts protected by kept clues
  const protNouns = new Set<string>();
  const protFacts = new Set<string>();
  for (const id of keptClues) {
    const c = content.clues.get(id);
    for (const n of c?.reveals.nouns ?? []) protNouns.add(n);
    for (const f of c?.reveals.facts ?? []) protFacts.add(f);
  }
  // … and by confirmed entries
  for (const [caseId, p] of Object.entries(s.chronik)) {
    const cs = content.cases.get(caseId);
    for (const eid of p.confirmed) {
      for (const n of Object.values(p.filled[eid] ?? {})) protNouns.add(n);
      const f = cs?.entries.find((e) => e.id === eid)?.factId;
      if (f) protFacts.add(f);
    }
  }
  const lostNouns = slice.since.nouns.filter((n) => !protNouns.has(n));
  const lostFacts = slice.since.facts.filter((f) => !protFacts.has(f));
  const ln = new Set(lostNouns);
  const lf = new Set(lostFacts);
  s.inventory.clues = keptClues;
  s.inventory.nouns = s.inventory.nouns.filter((n) => !ln.has(n));
  s.codex.facts = s.codex.facts.filter((f) => !lf.has(f));
  // remove lost nouns from unconfirmed blanks and readings
  for (const p of Object.values(s.chronik)) {
    for (const store of [p.filled, p.readings]) {
      for (const [eid, row] of Object.entries(store)) {
        if (store === p.filled && p.confirmed.includes(eid)) continue;
        for (const [bid, n] of Object.entries(row)) if (ln.has(n)) delete row[bid];
        if (!Object.keys(row).length) delete store[eid];
      }
    }
  }
  const lost = { clues: [...dropClues].filter((c) => !keptClues.includes(c)), nouns: lostNouns, facts: lostFacts };
  slice.since = { clues: [], nouns: [], facts: [] };
  return lost;
}

// ---------------------------------------------------------------------------------------------
// hints

/** Default thresholds (bible §6.6): 4/8/12 min; gentle mode 2/4/6 min. */
export function hintDelay(h: Pick<Hint, 'level' | 'afterSeconds'>, gentle: boolean): number {
  const base = h.afterSeconds ?? [240, 480, 720][h.level - 1] ?? 720;
  return gentle ? base / 2 : base;
}

/** Hints of a case that still make sense (entry not yet confirmed), in ladder order. */
export function caseHints(hints: Iterable<Hint>, caseId: string, p: CaseProgress | undefined): Hint[] {
  return [...hints]
    .filter((h) => h.caseId === caseId && !(h.entryId && p?.confirmed.includes(h.entryId)))
    .sort((a, b) => a.level - b.level || (a.afterSeconds ?? 0) - (b.afterSeconds ?? 0));
}

/** The next hint that is due after `stuck` seconds and was not given yet. */
export function dueHint(hints: Hint[], stuck: number, given: readonly string[], gentle: boolean): Hint | null {
  for (const h of hints) {
    if (given.includes(h.id)) continue;
    return stuck >= hintDelay(h, gentle) ? h : null;
  }
  return null;
}

/**
 * "Laub fragen": the due hint; else the next one early if the player has waited at least half of
 * its delay; else repeat the last one given; else null (Laub declines).
 */
export function askHint(hints: Hint[], stuck: number, given: readonly string[], gentle: boolean): { hint: Hint; fresh: boolean } | null {
  const next = hints.find((h) => !given.includes(h.id));
  if (next && stuck >= hintDelay(next, gentle) / 2) return { hint: next, fresh: true };
  const last = [...hints].reverse().find((h) => given.includes(h.id));
  return last ? { hint: last, fresh: false } : null;
}

// ---------------------------------------------------------------------------------------------
// echo timing

/** Reading time for a subtitle line in ms. */
export function lineMs(text: string): number {
  return Math.round(Math.min(9000, Math.max(2600, 1400 + text.length * 58)));
}

/** Stage directions are written in parentheses: "(Das Summen bricht ab.)". */
export function isStageDirection(text: string): boolean {
  return /^\s*\(.*\)\s*$/s.test(text);
}

/** Which ghost figure a line belongs to: the n-th distinct speaker (except the compass voice). */
export function figureSpeakers(lines: DialogueLine[], skip: readonly string[] = ['laub']): string[] {
  const out: string[] = [];
  for (const l of lines) {
    if (skip.includes(l.speaker) || isStageDirection(l.text_de)) continue;
    if (!out.includes(l.speaker)) out.push(l.speaker);
  }
  return out.slice(0, 4);
}
