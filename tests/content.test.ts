import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ContentPack } from '../src/content/types';
import { validateContent, type LoadedPack } from '../src/content/validate';
import { ContentDB } from '../src/content/db';

const example = (): ContentPack =>
  JSON.parse(readFileSync(new URL('../content/examples/example.pack.json', import.meta.url), 'utf8')) as ContentPack;
const run = (pack: ContentPack, extra: LoadedPack[] = []) => validateContent([{ file: 'test.pack.json', pack }, ...extra]);
const messages = (r: ReturnType<typeof run>) => r.errors.map((e) => e.message).join('\n');

describe('content validator', () => {
  it('accepts the example pack', () => {
    const r = run(example());
    expect(messages(r)).toBe('');
    expect(r.ok).toBe(true);
    expect(r.stats.clues).toBeGreaterThan(0);
  });

  it('fails a non-fiction fact without a source', () => {
    const p = example();
    p.facts![0]!.sources = [];
    const r = run(p);
    expect(r.ok).toBe(false);
    expect(messages(r)).toMatch(/no source/);
  });

  it('fails a fact without a confidence label', () => {
    const p = example();
    delete (p.facts![0] as { confidence?: unknown }).confidence;
    expect(messages(run(p))).toMatch(/confidence/);
  });

  it('fails unknown clue / noun / fact references', () => {
    const p = example();
    p.clues![1]!.requires = { clues: ['ex.clue.does-not-exist'] };
    p.clues![0]!.reveals.nouns = ['ex.noun.ghost', ...(p.clues![0]!.reveals.nouns ?? [])];
    p.clues![1]!.reveals.facts = ['ex.fact.ghost'];
    const m = messages(run(p));
    expect(m).toMatch(/requires unknown clue 'ex.clue.does-not-exist'/);
    expect(m).toMatch(/unknown noun 'ex.noun.ghost'/);
    expect(m).toMatch(/unknown fact 'ex.fact.ghost'/);
  });

  it('fails an unsolvable case (correct noun not revealed by any clue)', () => {
    const p = example();
    p.nouns!.push({ id: 'ex.noun.orphan', label_de: 'Waise', category: 'object' });
    p.cases![0]!.entries[0]!.blanks[1]!.correct = 'ex.noun.orphan';
    const m = messages(run(p));
    expect(m).toMatch(/UNSOLVABLE: noun 'ex.noun.orphan'/);
  });

  it('fails a case whose clue is unreachable (requires-cycle)', () => {
    const p = example();
    p.clues![0]!.requires = { clues: ['ex.clue.echo-court'] }; // now the two clues require each other
    const m = messages(run(p));
    expect(m).toMatch(/can never be found/);
    expect(m).toMatch(/UNSOLVABLE/);
  });

  it('fails duplicate ids across packs and historical lines without source', () => {
    const p = example();
    const dup: ContentPack = { pack: 'dup', nouns: [{ id: 'ex.noun.straw', label_de: 'Stroh', category: 'object' }] };
    expect(messages(run(p, [{ file: 'dup.pack.json', pack: dup }]))).toMatch(/duplicate id/);
    p.speakers = [{ id: 'ex.duke', name_de: 'Herzog', historical: true }];
    p.dialogue = [{ id: 'ex.d1', speaker: 'ex.duke', text_de: 'Hallo.', trigger: { event: 'game:start' } }];
    expect(messages(run(p))).toMatch(/historical person/);
  });

  it('respects game-area bounds for clues', () => {
    const r = validateContent([{ file: 't', pack: example() }], { bounds: { x0: 0, z0: 0, x1: 10, z1: 10 } });
    expect(messages(r)).toMatch(/outside the game area/);
  });
});

describe('ContentDB', () => {
  it('indexes merged packs', () => {
    const db = new ContentDB([{ file: 'ex', pack: example() }]);
    expect(db.clues.get('ex.clue.wagon-ruts')?.kind).toBe('relief');
    expect(db.nouns.get('ex.noun.straw')?.label_de).toBe('Stroh');
    expect(db.cluesAt(1151, -1121, 'today').map((c) => c.id)).toEqual(['ex.clue.wagon-ruts']);
    expect(db.cluesAt(1151, -1121, '1796')).toEqual([]);
    expect(db.validate().ok).toBe(true);
  });
});
