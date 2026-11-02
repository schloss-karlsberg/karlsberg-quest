/**
 * Chronik feature: types, private events and the state slice (declaration merging only; no
 * runtime code here so the pure logic stays importable from vitest).
 */
import type { Blank, Clue, Noun } from '../../content/types';

/** The chronik system's own state slice (`state.systems.chronik`). JSON only. */
export interface ChronikSlice {
  v: 1;
  /**
   * Discoveries since the last confirmed batch (PRD §3.1): these are lost when the player is
   * caught (unless gentle mode is on, or they are protected by a confirmed entry).
   */
  since: { clues: string[]; nouns: string[]; facts: string[] };
  /** Hint ladder per case: seconds stuck since the last confirmation, ids of hints already given. */
  hints: Record<string, { stuck: number; given: string[] }>;
  /** Gentle mode: entries known to be correct after a failed check (caseId -> entryIds). */
  marks: Record<string, string[]>;
  /** Case pages the player has been told about (toast "Neue Seite"). */
  seen: string[];
  /** Echo clue ids that have been listened to completely. */
  echoes: string[];
  /** Last case shown on the board. */
  lastCase: string | null;
}

export function createSlice(): ChronikSlice {
  return { v: 1, since: { clues: [], nouns: [], facts: [] }, hints: {}, marks: {}, seen: [], echoes: [], lastCase: null };
}

/**
 * Optional content fields the chronik understands beyond the shared schema (all optional, read
 * defensively; the JSON schema allows them on clues/blanks):
 *  - clue.requires.lantern: true   → only readable while the lantern is lit
 *  - clue.prop: 'chest' | 'book' | 'paper' | 'scroll' | 'jar' | 'stone' | 'tablet' | 'compass' | 'horn'
 *  - clue.auto: true               → echo plays by itself when the player enters its radius
 *  - blank.also: string[]          → synonyms that also count as correct (bible: "auch richtig")
 *  - dialogue trigger { event: 'echo:start', id, seq?: number, figure?: number }
 */
export type PropKind = 'chest' | 'book' | 'paper' | 'scroll' | 'jar' | 'stone' | 'tablet' | 'compass' | 'horn';

export type ChronikClue = Clue & {
  requires?: Clue['requires'] & { lantern?: boolean };
  prop?: PropKind;
  auto?: boolean;
};

export type ChronikBlank = Blank & { also?: string[] };

export type NounLike = Pick<Noun, 'id' | 'category'>;

declare module '../../core/state' {
  interface SystemStates {
    chronik: ChronikSlice;
  }
}

declare module '../../core/events' {
  interface GameEvents {
    /** Request: play an echo now (e.g. story's automatic echoes). Owner: anyone → chronik. */
    'echo:play': { id: string };
    /** The board was opened / closed (story can pause barks, hub can animate the pin board). */
    'chronik:opened': { caseId: string | null };
    'chronik:closed': Record<string, never>;
    /** A noun was placed into / removed from a blank (nounId null = cleared). */
    'chronik:fill': { caseId: string; entryId: string; blankId: string; nounId: string | null };
    /** Clues/nouns lost after being caught (PRD §3.1). */
    'chronik:lost': { clues: string[]; nouns: string[] };
  }
}
