/**
 * Playtest round 10, F-30 / F-41: the main quest vanished from the HUD tracker and from the
 * Feldbuch's „Laufend“ list. Replays the report on the real prologue + chapter 1 quest files with
 * the pure QuestBook: a running main quest is always tracked, a main quest on offer is the next main
 * step (tracker + journal), and the journal list never drops either.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FlagValue, QuestFile, QuestSlice } from '../src/rpg/types';
import { questsInPlay } from '../src/systems/quests/data';
import { QuestBook, type QuestDefIn, type QuestEnv, createQuestSlice, journalRunning, normaliseSlice, seededRng } from '../src/systems/quests/logic';

const file = (name: string) => JSON.parse(readFileSync(new URL(`../content/quests/${name}`, import.meta.url), 'utf8')) as QuestFile;

function book(slice: QuestSlice = createQuestSlice()) {
  const { quests } = questsInPlay([{ data: file('00-prolog.quests.json') }, { data: file('01-kapitel-1.quests.json') }], false);
  const e: QuestEnv & { flags: Record<string, FlagValue> } = { flags: {}, codex: [], emit: () => {}, now: () => 0, rng: seededRng(3) };
  const b = new QuestBook(quests as Map<string, QuestDefIn>, slice, e);
  const laufend = () => journalRunning([...b.defs.values()], (id) => b.progressOf(id)).map((q) => q.id);
  return { b, laufend };
}

describe('the main quest stays in the tracker and the Feldbuch (F-30 / F-41)', () => {
  it('an accepted main quest is tracked first and listed, even with three side quests', () => {
    const { b, laufend } = book();
    for (const id of ['q.p.meiler', 'q.p.trichter', 'q.p.irrlichter']) b.offer(id);
    expect(b.tracked()).toHaveLength(3);
    b.offer('q.p.punktwolke');
    expect(b.state('q.p.punktwolke')).toBe('active');
    expect(b.tracked()[0]).toBe('q.p.punktwolke');
    expect(b.tracked()).toHaveLength(3);
    expect(laufend()[0]).toBe('q.p.punktwolke');
    // a later side quest never pushes the main quest out
    b.offer('q.k1.kasuar');
    b.accept('q.k1.kasuar');
    expect(b.tracked()).toContain('q.p.punktwolke');
  });

  it('a running main quest cannot be untracked (journal toggle)', () => {
    const { b } = book();
    b.offer('q.p.punktwolke');
    b.track('q.p.punktwolke', false);
    expect(b.tracked()).toContain('q.p.punktwolke');
    // a side quest can be
    b.offer('q.p.meiler');
    b.track('q.p.meiler', false);
    expect(b.tracked()).not.toContain('q.p.meiler');
  });

  it('a save whose tracker lost the running main quest heals on read', () => {
    const slice = normaliseSlice({
      quests: { 'q.k1.lohn': { state: 'active', counts: {}, t: 5 }, 'q.p.meiler': { state: 'active', counts: {}, t: 6 } },
      tracked: ['q.p.meiler'],
      unseen: [],
    });
    const { b, laufend } = book(slice);
    expect(b.tracked()).toEqual(['q.k1.lohn', 'q.p.meiler']);
    expect(laufend()).toEqual(['q.k1.lohn', 'q.p.meiler']);
  });

  it('F-41: after „Der Kanzlist zählt“ the main quest on offer is the next main step', () => {
    const { b, laufend } = book();
    b.chapter = 'k1';
    b.offer('q.p.meiler');
    b.offer('q.k1.registratur');
    b.accept('q.k1.registratur');
    expect(b.mainOffer()).toBeNull();
    b.complete('q.k1.registratur', true);
    // the story's k1_3 beat offers both chapter-1 main quests at their givers
    b.offer('q.k1.lohn');
    b.offer('q.k1.zwinger');
    // before the fix: tracker and „Laufend“ held the side quest only
    expect(b.mainOffer()?.id).toBe('q.k1.lohn');
    expect(laufend().slice(0, 2).sort()).toEqual(['q.k1.lohn', 'q.k1.zwinger']);
    expect(laufend()).toContain('q.p.meiler');
    expect(laufend()).not.toContain('q.k1.registratur');
    // taken: it runs, is tracked first, and the offer step goes away
    b.accept('q.k1.lohn');
    expect(b.tracked()[0]).toBe('q.k1.lohn');
    expect(b.mainOffer()).toBeNull();
    expect(laufend()[0]).toBe('q.k1.lohn');
  });

  it('F-30: a finished main quest leaves the tracker; nothing on offer → no stale main entry', () => {
    const { b, laufend } = book();
    b.chapter = 'prolog';
    b.offer('q.p.punktwolke');
    b.offer('q.p.meiler');
    b.complete('q.p.punktwolke', true);
    expect(b.tracked()).toEqual(['q.p.meiler']);
    // the next main step is the story's line (the journal shows it as „Hauptweg“)
    expect(b.mainOffer()).toBeNull();
    expect(laufend()).toEqual(['q.p.meiler']);
  });

  it('the offer of the current chapter wins over a stray one', () => {
    const { b } = book();
    b.offer('q.k1.zwinger');
    b.chapter = 'k1';
    expect(b.mainOffer()?.id).toBe('q.k1.zwinger');
    b.chapter = 'k2';
    expect(b.mainOffer()?.id).toBe('q.k1.zwinger');
  });
});
