/**
 * TASK-076: at the tour stops after the first conversation the guide still offered „E Mit … sprechen“,
 * and E opened a dialogue with no text, only „Auf Wiedersehen“. A person offers a conversation only
 * while it has something to say (a greeting, a topic, a quest topic).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DialogueLine } from '../src/content/types';
import { answer, GREET, hasWords, talkLines } from '../src/systems/npc/logic';

const pack = JSON.parse(readFileSync('content/packs/tour.pack.json', 'utf8')) as { dialogue: DialogueLine[] };
// at the car park (t2): the greetings need `tour.station1.ready`, which t2's exit clears
const c = { era: 'today', flags: { 'tour.station1.ready': true }, chapter: 'tour', beat: null, clues: [] } as never;

describe('a person offers a conversation only with something to say', () => {
  const lines = talkLines(pack.dialogue, 'imhoff', 'tour');

  it('the guide greets at the first stop (t2 stays as it was)', () => {
    expect(lines.length).toBeGreaterThan(0);
    expect(hasWords(lines, 'imhoff', 'tour', c, new Set(), 0)).toBe(true);
  });

  it('after his first conversation he has nothing left: no talk prompt at the later stops', () => {
    const said = new Set(answer(lines, 'imhoff', 'tour', GREET, c, new Set()).map((l) => l.id));
    for (let i = 0; i < 5; i++) for (const l of answer(lines, 'imhoff', 'tour', GREET, c, said)) said.add(l.id);
    expect(hasWords(lines, 'imhoff', 'tour', c, said, 0)).toBe(false);
    // a quest topic is something to say
    expect(hasWords(lines, 'imhoff', 'tour', c, said, 1)).toBe(true);
  });

  it('a person without any lines keeps the silent look („Schweigt und sieht dich an.“)', () => {
    expect(hasWords([], 'niemand', 'tour', c, new Set(), 0)).toBe(true);
  });

  it('Marlene at the Weiher has words about the staff she lends, as often as asked', () => {
    // playtest 2026-11-28: E on her right after the loan opened „(Schweigt und sieht dich an.)“
    const marlene = talkLines(pack.dialogue, 'marlene', 'tour');
    const first = answer(marlene, 'marlene', 'tour', GREET, c, new Set());
    expect(first.map((l) => l.id)).toEqual(['marlene.t.stab', 'marlene.t.stab.b']);
    expect(hasWords(marlene, 'marlene', 'tour', c, new Set(first.map((l) => l.id)), 0)).toBe(true);
  });
});
