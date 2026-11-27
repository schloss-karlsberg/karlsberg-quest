/**
 * TASK-078: the talk prompt „Mit {name} sprechen“ read „Mit Der Hofgärtner sprechen“. A speaker's
 * optional `dative_de` („dem Hofgärtner“) goes after the preposition; other names stay as they are.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ContentDB } from '../src/content/db';
import type { ContentPack, Speaker } from '../src/content/types';
import { speakerDative, speakerMeta } from '../src/systems/story/dialogue/speakers';

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as unknown;
const SPEAKERS: Speaker[] = readdirSync('content/packs')
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => (json(`content/packs/${f}`) as ContentPack).speakers ?? []);
/** Names that start with an article need their dative form after „Mit“. */
const ARTICLE = /^(Der|Die|Das|Ein|Eine|Zweite|Zweiter) /;

const db = (...speakers: Speaker[]) => ({ speakers: new Map(speakers.map((s) => [s.id, s])) }) as unknown as ContentDB;

describe('speakerDative', () => {
  it('uses the dative form of a name with an article', () => {
    const content = db({ id: 'hofgaertner', name_de: 'Der Hofgärtner', dative_de: 'dem Hofgärtner', historical: false });
    expect(speakerDative('hofgaertner', content)).toBe('dem Hofgärtner');
    // the dialogue box keeps the name as it is
    expect(speakerMeta('hofgaertner', content).name).toBe('Der Hofgärtner');
  });

  it('keeps a plain name unchanged', () => {
    expect(speakerDative('hanne', db({ id: 'hanne', name_de: 'Hanne', historical: false }))).toBe('Hanne');
    // built-in names without a pack entry, and unknown ids, fall back to the display name
    expect(speakerDative('imhoff')).toBe('Gerold Imhoff');
    expect(speakerDative('niemand', db())).toBe(speakerMeta('niemand', db()).name);
  });
});

describe('dative forms in the content (TASK-078)', () => {
  const content = db(...SPEAKERS);

  it('every speaker named with an article has a dative form, written in lower case', () => {
    const named = SPEAKERS.filter((s) => ARTICLE.test(s.name_de));
    expect(named.length).toBeGreaterThan(10);
    expect(named.filter((s) => !s.dative_de).map((s) => s.id)).toEqual([]);
    expect(named.filter((s) => !/^(dem|der|einem|einer) /.test(s.dative_de!)).map((s) => `${s.id}: ${s.dative_de}`)).toEqual([]);
  });

  it('the people in the game read right after „Mit“', () => {
    expect(speakerDative('hofgaertner', content)).toBe('dem Hofgärtner');
    expect(speakerDative('gardist', content)).toBe('einem Gardisten');
    expect(speakerDative('lakai', content)).toBe('einem Lakaien');
    expect(speakerDative('gaertner', content)).toBe('dem zweiten Gärtner');
    expect(speakerDative('diener', content)).toBe('dem Diener');
    expect(speakerDative('solld', content)).toBe('Herrn Soll');
    expect(speakerDative('hanne', content)).toBe('Hanne');
    expect(speakerDative('imhoff', content)).toBe('Gerold Imhoff · Führung');
    // every placed person (story npc spawn), built-in names included
    const placed = new Set<string>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (!v || typeof v !== 'object') return;
      const o = v as Record<string, unknown>;
      if (o.do === 'npc' && o.op === 'spawn' && typeof o.npc === 'string') placed.add(o.npc);
      Object.values(o).forEach(walk);
    };
    for (const f of readdirSync('content/story').filter((f) => f.endsWith('.json'))) walk(json(`content/story/${f}`));
    expect(placed.size).toBeGreaterThan(10);
    expect([...placed].filter((id) => ARTICLE.test(speakerDative(id, content)))).toEqual([]);
  });
});
