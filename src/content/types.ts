/**
 * Content schema (TypeScript side). The JSON Schema in content/schema/pack.schema.json mirrors it
 * for editor support; `validateContent` (src/content/validate.ts) is the authority.
 *
 * Content lives in content/**\/*.pack.json. A pack may contain any of the arrays below; all packs
 * are merged and ids must be unique across all packs per kind.
 */
import type { Era } from '../core/era';

/** Evidence/confidence labels (palace catalogue scheme): Documented, Inferred, period Norm, Unknown. */
export type Confidence = 'D' | 'I' | 'N' | 'U';

export interface SourceRef {
  url: string;
  /** Short human label, e.g. "de.wikipedia: Schloss Karlsberg". */
  label?: string;
  /** Page / section / date accessed. */
  note?: string;
}

/** Codex card. Every non-fiction fact needs ≥ 1 source; every fact needs a confidence label. */
export interface Fact {
  id: string;
  title_de: string;
  text_de: string;
  confidence: Confidence;
  /** true = invented for the game (shown with a fiction label). */
  fiction: boolean;
  sources: SourceRef[];
  /** Contested points shown with the card (e.g. two dates). */
  contested_de?: string;
  tags?: string[];
  era?: Era;
  licence?: string;
}

/** A Chronik noun: the tokens players drag into blanks. */
export interface Noun {
  id: string;
  label_de: string;
  category: 'person' | 'place' | 'object' | 'cause' | 'time' | 'action' | 'group' | 'other';
  /** Plural display form, used by blanks with `plural: true` (e.g. "Ausbruchgräben"). */
  plural_de?: string;
}

export interface ClueWhere {
  /** Local frame x/z (x = E − 381000, z = −(N − 5465000)). */
  x: number;
  z: number;
  /** Trigger radius in metres. */
  radius: number;
  /** Era(s) in which the clue exists. */
  era: Era | Era[];
  /** Optional: anchor ids for tooling (POI id, building KB-Bxx, room id). */
  anchor?: string;
}

export interface Clue {
  id: string;
  title_de: string;
  text_de?: string;
  kind: 'object' | 'echo' | 'document' | 'relief' | 'map' | 'dialogue';
  where: ClueWhere;
  /** What finding it gives the player. */
  reveals: { nouns?: string[]; facts?: string[]; flags?: string[] };
  /** Preconditions (skills, scan mode, other clues). */
  requires?: { clues?: string[]; skill?: string; scanMode?: 1 | 2 | 3; flags?: string[] };
  fiction?: boolean;
  /** Echo shown at a date that is not a playable era (e.g. "November 1840"); `where.era` is the nearest playable era. */
  echoDate_de?: string;
  /** Only findable with the lantern lit. */
  needsLantern?: boolean;
  /** The E prompt for this clue instead of „Untersuchen“ (a thing you take: „Rock nehmen“). */
  prompt_de?: string;
  /** Story chapter this clue belongs to (e.g. 'p', 'k1' … 'k4'); for tooling and story flow. */
  chapter?: string;
  /**
   * What the card's "Lageskizze" shows, when that is not where the clue is found (a printout at the
   * field station showing the Ehrenhof): centre and optional size (m, default 70).
   */
  sketch?: { x: number; z: number; size?: number };
}

export interface Blank {
  id: string;
  /** Category filter for the noun picker (optional). */
  category?: Noun['category'];
  /** Explicit list of nouns offered (optional; defaults to all known nouns of the category). */
  accepts?: string[];
  /** Fact entries: the correct noun. Readings: omitted (no right answer). */
  correct?: string;
  /** Fact entries: further nouns that also count as correct (e.g. a more specific place). */
  alsoCorrect?: string[];
  /** Show the nouns' `plural_de` instead of `label_de` in this blank. */
  plural?: boolean;
  /** Per-blank display override by noun id (e.g. with article/case: "dem Naturalienkabinett"). */
  labels_de?: Record<string, string>;
}

export interface CaseEntry {
  id: string;
  /** 'fact' entries are confirmed in batches of three; 'reading' entries are never confirmed. */
  kind: 'fact' | 'reading';
  /** Sentence with blanks as {blankId}, e.g. "Am {when} floh {who} nach {where}." */
  text_de: string;
  blanks: Blank[];
  /** Codex card unlocked when this fact entry is confirmed. */
  factId?: string;
  /** Reading entries: story flag set to the chosen noun id (or 'offen' if left empty). */
  flag?: string;
}

export interface ChronikCase {
  id: string;
  title_de: string;
  intro_de?: string;
  entries: CaseEntry[];
}

export interface DialogueLine {
  id: string;
  speaker: string;
  text_de: string;
  /** Event name + simple conditions, e.g. { event: 'era:change', era: '1789' }. */
  trigger: { event: string; [k: string]: unknown };
  once?: boolean;
  /** Lines of historical persons must cite a source (their words come from sources only). */
  sources?: SourceRef[];
  priority?: number;
}

export interface Speaker {
  id: string;
  name_de: string;
  /**
   * The name after a dative preposition, as in „Mit {name} sprechen“: „dem Hofgärtner“, „einem
   * Gardisten“. Needed when the name starts with an article or is declined; default `name_de`.
   */
  dative_de?: string;
  /** true for historical persons (their lines then need sources). */
  historical: boolean;
}

export interface Hint {
  id: string;
  caseId: string;
  entryId?: string;
  /** 1 gentle nudge … 3 strong nudge (never the solution). */
  level: 1 | 2 | 3;
  text_de: string;
  afterSeconds?: number;
}

export interface ContentPack {
  $schema?: string;
  pack: string;
  /** Placeholder/example content, excluded from production builds' checks for completeness. */
  placeholder?: boolean;
  facts?: Fact[];
  nouns?: Noun[];
  clues?: Clue[];
  cases?: ChronikCase[];
  speakers?: Speaker[];
  dialogue?: DialogueLine[];
  hints?: Hint[];
}
