import type { Era } from '../core/era';
import type { ChronikCase, Clue, ContentPack, DialogueLine, Fact, Hint, Noun, Speaker } from './types';
import { type LoadedPack, validateContent } from './validate';

/** Read-only, merged view of all content packs, with small query helpers for systems. */
export class ContentDB {
  readonly facts = new Map<string, Fact>();
  readonly nouns = new Map<string, Noun>();
  readonly clues = new Map<string, Clue>();
  readonly cases = new Map<string, ChronikCase>();
  readonly speakers = new Map<string, Speaker>();
  readonly dialogue = new Map<string, DialogueLine>();
  readonly hints = new Map<string, Hint>();
  readonly packs: LoadedPack[];

  constructor(packs: LoadedPack[]) {
    this.packs = packs;
    for (const { pack } of packs) {
      for (const f of pack.facts ?? []) this.facts.set(f.id, f);
      for (const n of pack.nouns ?? []) this.nouns.set(n.id, n);
      for (const c of pack.clues ?? []) this.clues.set(c.id, c);
      for (const c of pack.cases ?? []) this.cases.set(c.id, c);
      for (const s of pack.speakers ?? []) this.speakers.set(s.id, s);
      for (const d of pack.dialogue ?? []) this.dialogue.set(d.id, d);
      for (const h of pack.hints ?? []) this.hints.set(h.id, h);
    }
  }

  /** Clues that exist in an era. */
  cluesInEra(era: Era): Clue[] {
    return [...this.clues.values()].filter((c) => (Array.isArray(c.where.era) ? c.where.era : [c.where.era]).includes(era));
  }

  /** Clues of an era whose trigger radius contains (x, z). */
  cluesAt(x: number, z: number, era: Era): Clue[] {
    return this.cluesInEra(era).filter((c) => Math.hypot(c.where.x - x, c.where.z - z) <= c.where.radius);
  }

  dialogueFor(event: string): DialogueLine[] {
    return [...this.dialogue.values()].filter((d) => d.trigger.event === event).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  validate(bounds?: { x0: number; z0: number; x1: number; z1: number }) {
    return validateContent(this.packs, { bounds });
  }
}

/** All content packs bundled by Vite (content/**\/*.pack.json). */
export function loadBundledContent(): ContentDB {
  const mods = import.meta.glob<ContentPack>('/content/**/*.pack.json', { eager: true, import: 'default' });
  const packs: LoadedPack[] = Object.entries(mods)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, pack]) => ({ file: file.replace(/^\//, ''), pack }));
  return new ContentDB(packs);
}
