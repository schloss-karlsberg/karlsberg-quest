/**
 * Chapter 1's disguise opening (docs/IDEAS-ROUND11.md §2, story k1_0b / k1_0c): the two quests, the
 * clues behind them, the court lines, the XP budget and the content rules (no spectral spawn in a
 * court zone while the k1 watchers count; the prelude stays compact).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLEICHE, COAT_REACH, LIESE } from '../src/systems/bleiche/layout';
import { ZONES, inZoneGround } from '../src/systems/court/zones';
import { t } from '../src/i18n';
import { COURT_K1_DE } from '../src/systems/court-k1';
import type { StoryFile } from '../src/systems/story/types';
import type { QuestDef } from '../src/rpg/types';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = <T>(f: string): T => JSON.parse(readFileSync(`${ROOT}/${f}`, 'utf8')) as T;
const quests = read<{ quests: QuestDef[] }>('content/quests/01-kapitel-1.quests.json').quests;
const pack = read<{ clues: { id: string; where: { x: number; z: number; radius: number }; requires?: { clues?: string[] } }[]; dialogue: { id: string; speaker: string; text_de: string }[] }>('content/packs/kapitel-1.pack.json');
const codex = read<{ facts: { id: string; tags: string[]; contested_de?: string; fiction: boolean; text_de: string }[] }>('content/packs/codex.pack.json').facts;
const q = (id: string) => quests.find((x) => x.id === id)!;
const clue = (id: string) => pack.clues.find((c) => c.id === id)!;

describe('k1 disguise: quests', () => {
  it('q.k1.kleider: the coat by taking (manual, set by the story) or by Liese’s favour (optional)', () => {
    const k = q('q.k1.kleider');
    expect(k).toMatchObject({ kind: 'main', era: '1789', giver: { voice: 'laub' }, turnin: 'auto' });
    const ob = Object.fromEntries(k.objectives.map((o) => [o.id, o]));
    expect(ob.rock).toMatchObject({ type: 'manual', where: { x: COAT_REACH.x, z: COAT_REACH.z } });
    expect(ob.rock!.optional).toBeUndefined();
    expect(ob.bitte).toMatchObject({ type: 'talk', npc: 'liese', topic: 'rock', optional: true });
    expect(ob.zettel).toMatchObject({ type: 'kill', enemy: 'mahnbrief', count: 3, optional: true, after: ['bitte'] });
    // the favour's fight stays out of Liese's talk bubble (≥ 19.4 m, the quests validator)
    const sp = ob.zettel!.spawn![0]!;
    expect(Math.hypot(sp.x - LIESE.x, sp.z - LIESE.z)).toBeGreaterThan(19.4);
    expect(k.rewards).toMatchObject({ xp: 60, items: [{ item: 'item.k1.rock' }] });
  });

  it('q.k1.brief: paper from the Hofgärtner, Laub writes at his table', () => {
    const b = q('q.k1.brief');
    expect(b).toMatchObject({ kind: 'main', era: '1789', giver: { voice: 'laub' }, turnin: 'auto' });
    expect(b.objectives.map((o) => [o.id, o.type])).toEqual([['papier', 'talk'], ['schreiben', 'examine']]);
    expect(b.objectives[1]).toMatchObject({ clue: 'clue.k1.brief', after: ['papier'] });
    expect(b.rewards).toMatchObject({ xp: 70, items: [{ item: 'item.k1.empfehlung' }] });
    // the history teaches the real access rule, the disputed travel letter and the false prince
    expect(b.history!.map((h) => h.fact)).toEqual(['cx.44', 'cx.43', 'cx.45']);
  });

  it('130 XP moved from later chapter-1 quests to the disguise', () => {
    expect(q('q.k1.registratur').rewards!.xp).toBe(100);
    expect(q('q.k1.zwinger').rewards!.xp).toBe(120);
    expect(q('q.k1.karlslust').rewards!.xp).toBe(180);
    expect((q('q.k1.kleider').rewards!.xp ?? 0) + (q('q.k1.brief').rewards!.xp ?? 0)).toBe(130);
  });
});

describe('k1 disguise: places', () => {
  it('the coat is taken from behind line B; the letter table is out of the Hofgärtner’s talk reach', () => {
    const r = clue('clue.k1.rock');
    expect(Math.hypot(r.where.x - COAT_REACH.x, r.where.z - COAT_REACH.z)).toBeLessThan(0.01);
    expect(Math.hypot(r.where.x - LIESE.x, r.where.z - LIESE.z)).toBeGreaterThan(10);
    const tisch = clue('clue.k1.brief');
    const hg = clue('clue.k1.papier');
    expect(tisch.requires?.clues).toEqual(['clue.k1.papier']);
    expect(Math.hypot(tisch.where.x - hg.where.x, tisch.where.z - hg.where.z)).toBeGreaterThan(4.3);
    // the table and the Hofgärtner stand in the teaching zone (the coat is what lets you walk there)
    const orangerie = ZONES.find((z) => z.id === 'court.orangerie')!;
    expect(inZoneGround(orangerie, tisch.where.x, tisch.where.z)).toBe(true);
    expect(inZoneGround(orangerie, hg.where.x, hg.where.z)).toBe(true);
    // the Bleiche is no court zone
    for (const z of ZONES) expect(inZoneGround(z, LIESE.x, LIESE.z)).toBe(false);
  });

  it('points to the coat interaction spot and briefs the player on the approach', () => {
    const file = read<StoryFile>('content/story/01-kapitel-1.story.json');
    for (const id of ['k1_0', 'k1_0b']) {
      const goal = file.beats.find((b) => b.id === id)?.on?.flatMap((r) => r.do).find((a) => a.do === 'objective' && a.id === 'k1.rock');
      expect(goal).toMatchObject({ x: COAT_REACH.x, z: COAT_REACH.z });
    }
    const brief = file.on?.find((r) => r.id === 'k1_0b.bleiche');
    expect(brief?.when).toMatchObject({ all: expect.arrayContaining([
      { enter: { x: BLEICHE.x, z: BLEICHE.z, r: 30, era: '1789' } },
    ]) });
    expect(brief?.do).toContainEqual(expect.objectContaining({ do: 'say', id: 'laub.k1.bleiche' }));
  });

  it('the guard’s echo plays only inside the gitter (never over the Musterung outside)', () => {
    const w = clue('clue.k1.wache');
    // the gitter line at the gate is at x ≈ 1192.4
    expect(w.where.x - w.where.radius).toBeGreaterThan(1192.5);
  });

  it('no spectral enemy spawns in a court zone before the k1 watchers stop (k1_2: registratur and earlier)', () => {
    for (const id of ['q.k1.ankunft', 'q.k1.kleider', 'q.k1.brief'])
      for (const o of q(id).objectives) for (const s of o.spawn ?? []) for (const z of ZONES) expect(inZoneGround(z, s.x, s.z), `${id}/${o.id}`).toBe(false);
  });
});

describe('k1 disguise: lines and codex', () => {
  it('describes the default red jacket in Laub’s arrival and the coat quest', () => {
    const file = read<StoryFile>('content/story/01-kapitel-1.story.json');
    const lines = file.beats[0]?.on?.flatMap((r) => r.do);
    const arrival = lines?.find((a) => a.do === 'say' && a.id === 'laub.k1.brunnenstube');
    expect(arrival).toMatchObject({ text: expect.stringContaining('Und mittendrin Sie. In Rot.') });
    expect(pack.dialogue.find((line) => line.id === 'laub.k1.brunnenstube')?.text_de).toBe(arrival?.do === 'say' ? arrival.text : undefined);
    expect(q('q.k1.kleider').summary_de).toContain('In Rot kommt niemand an den Hof.');
  });

  it('the court lines override the system placeholders (court-k1 loads after court/strings)', () => {
    expect(t('court.inspect.ok')).toBe(COURT_K1_DE['court.inspect.ok']);
    expect(t('court.inspect.ok')).toContain('Hofrat Amsel');
    for (const zone of ['court.ehrenhof', 'court.orangerie']) for (let i = 1; i <= 8; i++) expect(COURT_K1_DE[`court.eject.${zone}.${i}`], `${zone} ${i}`).toBeTruthy();
    // never a letter in Knigge's name (IDEAS-ROUND11 §2.3, owner decision K2)
    for (const v of Object.values(COURT_K1_DE)) expect(v).not.toMatch(/Knigge/);
  });

  it('cx.43 is STRITTIG with the dispute; cx.44/45 FAKT; cx.46 FIKTION; cx.07 no longer makes Knigge the visitor', () => {
    const c = (id: string) => codex.find((f) => f.id === id)!;
    expect(c('cx.43').tags).toContain('label:STRITTIG');
    expect(c('cx.43').contested_de).toMatch(/Herausgeber/);
    expect(c('cx.44').tags).toContain('label:FAKT');
    expect(c('cx.45').tags).toContain('label:FAKT');
    expect(c('cx.46')).toMatchObject({ fiction: true });
    expect(c('cx.07').text_de).toContain('In Knigges Reisebriefen (1793)');
    expect(c('cx.07').text_de).not.toContain('Adolph von Knigge, nannte');
    expect(c('cx.38').text_de).toContain('Hofrat Justus Amsel');
  });

  it('every new speaker has lines and never quotes Knigge’s Umgang (only Laub may, IDEAS-ROUND11 §2.2)', () => {
    for (const sp of ['liese', 'hofgaertner', 'gardist', 'gardist-tor', 'lakai']) expect(pack.dialogue.some((d) => d.speaker === sp), sp).toBe(true);
    const wahr = pack.dialogue.filter((d) => /wahrhaftig/.test((d as unknown as { text_de: string }).text_de));
    expect(wahr.map((d) => d.speaker)).toEqual(['laub']);
  });
});
