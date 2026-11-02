import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ContentPack, DialogueLine, Hint } from '../src/content/types';
import type { CaseProgress } from '../src/core/state';
import {
  applyBatch,
  askHint,
  buildContent,
  caseComplete,
  caseRatio,
  caseVisible,
  clueRetired,
  clueStatus,
  discover,
  dueHint,
  emptyProgress,
  evaluateBatch,
  figureSpeakers,
  hasRealContent,
  hintDelay,
  isStageDirection,
  loseUnconfirmed,
  nounFits,
  setBlank,
  skillMet,
  type ClueEnv,
} from '../src/systems/chronik/logic';
import { createSlice, type ChronikClue } from '../src/systems/chronik/types';

const testPack = (): ContentPack =>
  JSON.parse(readFileSync(new URL('../content/test/chronik-test.pack.json', import.meta.url), 'utf8')) as ContentPack;

const content = () => buildContent([{ pack: testPack() }], true);
const CASE = 'ct.case.vermessung';
const theCase = () => content().cases.get(CASE)!;
const entry = (id: string) => theCase().entries.find((e) => e.id === id)!;

const fill = (p: CaseProgress, map: Record<string, [string, string]>) => {
  for (const [eid, [bid, nid]] of Object.entries(map)) setBlank(p, entry(eid), bid, nid);
};

const env = (over: Partial<ClueEnv> = {}): ClueEnv => ({ found: [], flags: {}, skills: {}, scanMode: 0, lanternLit: false, ...over });

describe('chronik content view', () => {
  it('uses placeholder packs only without real content (or on request)', () => {
    const ph = testPack();
    expect(hasRealContent([{ pack: ph }])).toBe(false);
    expect(buildContent([{ pack: ph }]).cases.size).toBe(1);
    const real: ContentPack = { pack: 'real', clues: [{ ...ph.clues![0]!, id: 'real.clue' }] };
    expect(hasRealContent([{ pack: ph }, { pack: real }])).toBe(true);
    const c = buildContent([{ pack: ph }, { pack: real }]);
    expect(c.cases.size).toBe(0);
    expect([...c.clues.keys()]).toEqual(['real.clue']);
    expect(buildContent([{ pack: ph }, { pack: real }], true).cases.size).toBe(1);
  });

  it('collects echo lines per clue in seq order', () => {
    const pack = testPack();
    pack.dialogue = [...pack.dialogue!].reverse();
    const lines = buildContent([{ pack }], true).echoLines.get('ct.echo.diener')!;
    expect(lines.map((l) => l.id)).toEqual(['ct.echo.diener.1', 'ct.echo.diener.2', 'ct.echo.diener.3', 'ct.echo.diener.4', 'ct.echo.diener.5']);
  });

  it('assigns ghost figures to distinct speakers, skipping stage directions and Laub', () => {
    const l = (speaker: string, text_de: string): DialogueLine => ({ id: speaker + text_de, speaker, text_de, trigger: { event: 'echo:start' } });
    expect(isStageDirection('(Das Summen bricht ab.)')).toBe(true);
    expect(isStageDirection('Kein (Zwischen)ruf')).toBe(false);
    expect(figureSpeakers([l('a', 'Hallo'), l('laub', 'Hm'), l('b', '(Schweigen.)'), l('c', 'Ja'), l('a', 'Nein')])).toEqual(['a', 'c']);
  });
});

describe('clue status', () => {
  const clues = () => content().clues;

  it('gates relief clues by scan mode', () => {
    const c = clues().get('ct.clue.hohlweg')!;
    expect(clueStatus(c, env())).toBe('needs-scan');
    expect(clueStatus(c, env({ scanMode: 1 }))).toBe('needs-scan');
    expect(clueStatus(c, env({ scanMode: 2 }))).toBe('available');
    expect(clueStatus(c, env({ scanMode: 2, found: ['ct.clue.hohlweg'] }))).toBe('found');
  });

  it('hides clues of chapters that are not in the world (the prologue: no spoilers at the station)', () => {
    const c: ChronikClue = { ...clues().get('ct.clue.hohlweg')!, chapter: 'k2' };
    expect(clueStatus(c, env({ scanMode: 2 }))).toBe('available');
    expect(clueStatus(c, env({ scanMode: 2, chapters: new Set(['p']) }))).toBe('hidden');
    expect(clueStatus(c, env({ scanMode: 2, chapters: new Set(['p', 'k2']) }))).toBe('available');
    expect(clueStatus(c, env({ scanMode: 2, chapters: new Set(['p']), found: new Set(['ct.clue.hohlweg']) }))).toBe('found');
  });

  it('hides clues behind flags, clues and skills; lantern clues glint until lit', () => {
    const map = clues().get('ct.clue.kartenvergleich')!;
    expect(clueStatus(map, env())).toBe('hidden');
    expect(clueStatus(map, env({ flags: { 'ct.flag.map': true } }))).toBe('available');
    const cloud = clues().get('ct.clue.punktwolke')!;
    expect(clueStatus(cloud, env())).toBe('hidden');
    expect(clueStatus(cloud, env({ found: new Set(['ct.clue.kartenvergleich']) }))).toBe('available');
    const book = clues().get('ct.clue.wachbuch')!;
    expect(clueStatus(book, env())).toBe('needs-lantern');
    expect(clueStatus(book, env({ lanternLit: true }))).toBe('available');
    // packs write the lantern rule as `needsLantern` (content schema), not requires.lantern
    const packLantern: ChronikClue = { ...book, requires: undefined, needsLantern: true };
    expect(clueStatus(packLantern, env())).toBe('needs-lantern');
    expect(clueStatus(packLantern, env({ lanternLit: true }))).toBe('available');
    const skilled: ChronikClue = { ...book, requires: { skill: 'relief:2' } };
    expect(clueStatus(skilled, env({ skills: { relief: 1 } }))).toBe('hidden');
    expect(clueStatus(skilled, env({ skills: { relief: 2 } }))).toBe('available');
    expect(skillMet('relief', { relief: 1 })).toBe(true);
    expect(skillMet('relief', {})).toBe(false);
  });
});

describe('discover', () => {
  it('adds nouns/facts/flags once and remembers them as at risk', () => {
    const s = { inventory: { clues: [] as string[], nouns: ['ct.n.ehrenhof'], items: [] as string[] }, codex: { facts: [] as string[] }, flags: {} as Record<string, boolean> };
    const slice = createSlice();
    const leaf = content().clues.get('ct.clue.laubblatt')!;
    const d = discover(leaf, s, slice)!;
    expect(d.newNouns).toEqual(['ct.n.jahr_1840', 'ct.n.jahr_1836_41']);
    expect(d.newFacts).toEqual(['ct.cx.laub']);
    expect(s.flags['ct.flag.map']).toBe(true);
    expect(slice.since.clues).toEqual(['ct.clue.laubblatt']);
    expect(discover(leaf, s, slice)).toBeNull();
    const plan = discover(content().clues.get('ct.clue.lageplan')!, s, slice)!;
    expect(plan.newNouns).not.toContain('ct.n.ehrenhof');
    expect(slice.since.nouns).not.toContain('ct.n.ehrenhof');
  });
});

describe('batch of three', () => {
  it('needs three complete fact entries before checking', () => {
    const p = emptyProgress();
    fill(p, { p1: ['wo', 'ct.n.ehrenhof'], p2: ['wo', 'ct.n.orangerie'] });
    expect(evaluateBatch(theCase(), p).ready).toBe(false);
    // a reading never counts toward the batch
    setBlank(p, entry('p7'), 'wer', 'ct.n.hunde');
    expect(evaluateBatch(theCase(), p).ready).toBe(false);
    expect(p.readings.p7).toEqual({ wer: 'ct.n.hunde' });
    expect(p.filled.p7).toBeUndefined();
  });

  it('confirms nothing if one entry is wrong, and reveals which are right', () => {
    const p = emptyProgress();
    fill(p, { p1: ['wo', 'ct.n.ehrenhof'], p2: ['wo', 'ct.n.galerie'], p3: ['was', 'ct.n.hohlweg'] });
    const r = evaluateBatch(theCase(), p);
    expect(r.ready).toBe(true);
    expect(r.correct).toBe(false);
    expect(r.confirmed).toEqual([]);
    expect(r.rightOnes).toEqual(['p1', 'p3']);
    expect(applyBatch(theCase(), p, r)).toEqual([]);
    expect(p.confirmed).toEqual([]);
  });

  it('confirms all filled entries at once when all are right (synonyms count)', () => {
    const p = emptyProgress();
    fill(p, { p1: ['wo', 'ct.n.ehrenhof'], p2: ['wo', 'ct.n.orangerie'], p3: ['was', 'ct.n.hohlweg'], p5: ['wann', 'ct.n.jahr_1836_41'] });
    const r = evaluateBatch(theCase(), p);
    expect(r.correct).toBe(true);
    expect(r.confirmed).toEqual(['p1', 'p2', 'p3', 'p5']);
    expect(applyBatch(theCase(), p, r)).toEqual(['ct.cx.01', 'ct.cx.40', 'ct.rm.04', 'ct.cx.33']);
    expect(caseRatio(theCase(), p)).toBeCloseTo(4 / 6);
    expect(caseComplete(theCase(), p)).toBe(false);
    // confirmed entries are locked
    expect(setBlank(p, entry('p1'), 'wo', 'ct.n.galerie')).toBe(false);
    fill(p, { p4: ['was', 'ct.n.eiskeller'] });
    expect(evaluateBatch(theCase(), p).ready).toBe(false); // one of the two left
    // the last two of a case may be checked on their own (else four confirmed would be a dead end)
    fill(p, { p6: ['wieviel', 'ct.n.versatz_50'] });
    expect(evaluateBatch(theCase(), p).ready).toBe(true);
  });

  it('completes a case when every fact entry is confirmed', () => {
    const p = emptyProgress();
    p.confirmed = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    expect(caseComplete(theCase(), p)).toBe(true);
    expect(caseComplete(theCase(), undefined)).toBe(false);
  });

  it('lets "Wer" blanks take persons and groups, and clears blanks with null', () => {
    const wer = { id: 'w', category: 'person' as const };
    expect(nounFits(wer, { id: 'x', category: 'group' })).toBe(true);
    expect(nounFits(wer, { id: 'x', category: 'place' })).toBe(false);
    expect(nounFits({ id: 'a', accepts: ['n1'] }, { id: 'n2', category: 'place' })).toBe(false);
    const p = emptyProgress();
    expect(setBlank(p, entry('p1'), 'wo', 'ct.n.ehrenhof')).toBe(true);
    expect(setBlank(p, entry('p1'), 'wo', 'ct.n.ehrenhof')).toBe(false);
    expect(setBlank(p, entry('p1'), 'nope', 'ct.n.ehrenhof')).toBe(false);
    expect(setBlank(p, entry('p1'), 'wo', null)).toBe(true);
    expect(p.filled.p1).toBeUndefined();
  });

  it('shows a case page once one of its nouns is known', () => {
    expect(caseVisible(theCase(), {}, [])).toBe(false);
    expect(caseVisible(theCase(), {}, ['ct.n.eiskeller'])).toBe(true);
    expect(caseVisible(theCase(), { [CASE]: emptyProgress() }, [])).toBe(true);
  });
});

describe('capture loses unconfirmed finds', () => {
  it('drops clues/nouns/facts since the last confirmation, except protected ones', () => {
    const c = content();
    const s = {
      inventory: { clues: [] as string[], nouns: [] as string[], items: [] as string[] },
      codex: { facts: [] as string[] },
      flags: {} as Record<string, boolean>,
      chronik: {} as Record<string, CaseProgress>,
    };
    const slice = createSlice();
    discover(c.clues.get('ct.clue.lageplan')!, s, slice);
    // confirm a batch: nothing found so far is at risk any more
    const p = (s.chronik[CASE] = emptyProgress());
    p.confirmed.push('p1');
    p.filled.p1 = { wo: 'ct.n.ehrenhof' };
    slice.since = { clues: [], nouns: [], facts: [] };
    // new finds after the confirmation
    discover(c.clues.get('ct.clue.handbuch')!, s, slice);
    discover(c.clues.get('ct.clue.hohlweg')!, s, slice); // only reveals ct.n.hohlweg (also from the handbook)
    setBlank(p, entry('p3'), 'was', 'ct.n.hohlweg');
    setBlank(p, entry('p2'), 'wo', 'ct.n.orangerie');
    const lost = loseUnconfirmed(s, slice, c);
    expect(lost.clues.sort()).toEqual(['ct.clue.handbuch', 'ct.clue.hohlweg']);
    expect(lost.nouns).toContain('ct.n.hohlweg');
    expect(lost.facts).toContain('ct.rm.04');
    expect(s.inventory.clues).toEqual(['ct.clue.lageplan']);
    expect(s.inventory.nouns).toContain('ct.n.orangerie'); // from the kept Lageplan
    expect(s.inventory.nouns).not.toContain('ct.n.hohlweg');
    expect(s.codex.facts).toEqual([]);
    expect(p.filled.p3).toBeUndefined(); // the lost noun left its blank
    expect(p.filled.p2).toEqual({ wo: 'ct.n.orangerie' });
    expect(p.filled.p1).toEqual({ wo: 'ct.n.ehrenhof' });
    expect(slice.since).toEqual({ clues: [], nouns: [], facts: [] });
  });
});

describe('Laub hints', () => {
  const hints = (): Hint[] => [...content().hints.values()].sort((a, b) => a.level - b.level);

  it('halves the delays in gentle mode', () => {
    expect(hintDelay({ level: 1 }, false)).toBe(240);
    expect(hintDelay({ level: 2 }, true)).toBe(240);
    expect(hintDelay({ level: 3, afterSeconds: 100 }, true)).toBe(50);
  });

  it('gives the ladder in order once due', () => {
    const h = hints();
    expect(dueHint(h, 100, [], false)).toBeNull();
    expect(dueHint(h, 240, [], false)?.id).toBe('ct.hint.1');
    expect(dueHint(h, 240, ['ct.hint.1'], false)).toBeNull();
    expect(dueHint(h, 480, ['ct.hint.1'], false)?.id).toBe('ct.hint.2');
    expect(dueHint(h, 240, ['ct.hint.1'], true)?.id).toBe('ct.hint.2');
  });

  it('answers "Laub fragen" early, repeats, or declines', () => {
    const h = hints();
    expect(askHint(h, 10, [], false)).toBeNull();
    expect(askHint(h, 120, [], false)).toEqual({ hint: h[0], fresh: true });
    expect(askHint(h, 130, ['ct.hint.1'], false)).toEqual({ hint: h[0], fresh: false });
    expect(askHint(h, 240, ['ct.hint.1'], false)?.hint.id).toBe('ct.hint.2');
  });
});

describe('past chapters retire their markers', () => {
  it('only clues of an earlier chapter than the running one retire', () => {
    expect(clueRetired({ chapter: 'p' }, 'k2')).toBe(true);
    expect(clueRetired({ chapter: 'k1' }, 'k2')).toBe(true);
    expect(clueRetired({ chapter: 'k2' }, 'k2')).toBe(false);
    expect(clueRetired({ chapter: 'k3' }, 'k2')).toBe(false);
    expect(clueRetired({ chapter: 'k4' }, 'enden')).toBe(true);
    // no story (sandbox / tests), clues without a chapter, unknown chapters: nothing retires
    expect(clueRetired({ chapter: 'p' }, null)).toBe(false);
    expect(clueRetired({}, 'k4')).toBe(false);
    expect(clueRetired({ chapter: 'p' }, 'test')).toBe(false);
  });

  it('no clue depends on a clue of an earlier chapter (a retired marker blocks nothing)', () => {
    const packs = ['prolog', 'kapitel-1', 'kapitel-2', 'kapitel-3', 'kapitel-4'].map(
      (n) => JSON.parse(readFileSync(`content/packs/${n}.pack.json`, 'utf8')) as ContentPack,
    );
    const chapterOf = new Map<string, string | undefined>();
    for (const p of packs) for (const c of p.clues ?? []) chapterOf.set(c.id, c.chapter);
    for (const p of packs)
      for (const c of p.clues ?? [])
        for (const r of c.requires?.clues ?? []) expect(clueRetired({ chapter: chapterOf.get(r) }, c.chapter ?? null), `${c.id} needs ${r}`).toBe(false);
  });
});
