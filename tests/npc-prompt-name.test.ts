/**
 * TASK-078: the talk prompt „Mit {name} sprechen“ read „Mit Der Hofgärtner sprechen“. A speaker's
 * optional `dative_de` („dem Hofgärtner“) goes after the preposition; other names stay as they are.
 */
import { describe, expect, it } from 'vitest';
import type { ContentDB } from '../src/content/db';
import type { Speaker } from '../src/content/types';
import { speakerDative, speakerMeta } from '../src/systems/story/dialogue/speakers';

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
