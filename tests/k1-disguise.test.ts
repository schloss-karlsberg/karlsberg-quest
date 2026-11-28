/**
 * Chapter 1's disguise opening (docs/IDEAS-ROUND11.md §2, story k1_0b / k1_0c): the two quests, the
 * clues behind them, the court lines, the XP budget and the content rules (no spectral spawn in a
 * court zone while the k1 watchers count; the prelude stays compact).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLEICHE, COAT_REACH, COAT_XZ, LIESE, toWorld } from '../src/systems/bleiche/layout';
import { clueStatus } from '../src/systems/chronik/logic';
import type { ChronikClue } from '../src/systems/chronik/types';
import { ZONES, inZoneGround } from '../src/systems/court/zones';
import { t } from '../src/i18n';
import { COURT_K1_DE } from '../src/systems/court-k1';
import type { QuestDef } from '../src/rpg/types';
import { type StorySlice, StoryEngine, createStorySlice } from '../src/systems/story/engine';
import type { Action, StoryFile } from '../src/systems/story/types';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = <T>(f: string): T => JSON.parse(readFileSync(`${ROOT}/${f}`, 'utf8')) as T;
const quests = read<{ quests: QuestDef[] }>('content/quests/01-kapitel-1.quests.json').quests;
const pack = read<{ clues: { id: string; where: { x: number; z: number; radius: number }; requires?: { clues?: string[]; flags?: string[] }; prompt_de?: string }[]; dialogue: { id: string; speaker: string; text_de: string }[] }>('content/packs/kapitel-1.pack.json');
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

describe('k1 disguise: the coat is findable, promptable and the sneak has stakes (playtest 2026-11-28, F8)', () => {
  const k1 = read<StoryFile>('content/story/01-kapitel-1.story.json');
  const k0b = k1.beats.find((b) => b.id === 'k1_0b')!;
  const sees = k0b.on!.find((r) => r.id === 'k1_0b.liese-sieht')!;
  const calm = k0b.on!.find((r) => r.id === 'k1_0b.liese-ruhig')!;
  const zone = (sees.when as { all: { enter?: { x: number; z: number; r: number } }[] }).all[0]!.enter!;
  const inZone = (x: number, z: number) => Math.hypot(x - zone.x, z - zone.z) < zone.r;

  it('the marker points behind the line and the prompt says „Rock nehmen“', () => {
    const tour = read<StoryFile>('content/story/00-tour.story.json');
    const marks = [...tour.beats.find((b) => b.id === 't18')!.on!, ...k1.beats[0]!.on!, ...k0b.on!].flatMap((r) => r.do).filter((a): a is Extract<Action, { do: 'objective' }> => a.do === 'objective' && a.id === 'k1.rock');
    // the arrival beat sets it while Laub speaks, the prelude keeps it, Liese's two reactions restate it
    expect(marks.length).toBe(5);
    for (const m of marks) expect(m, m.text ?? '').toMatchObject({ x: COAT_REACH.x, z: COAT_REACH.z });
    const where = q('q.k1.kleider').objectives.find((o) => o.id === 'rock')!.where!;
    expect(where).toMatchObject({ x: COAT_REACH.x, z: COAT_REACH.z });
    // standing at the coat on either side of the line you are inside the pickup's reach or a step from it
    expect(Math.hypot(COAT_XZ[0] - COAT_REACH.x, COAT_XZ[1] - COAT_REACH.z)).toBeLessThan(clue('clue.k1.rock').where.radius);
    expect(clue('clue.k1.rock')).toMatchObject({ prompt_de: 'Rock nehmen', requires: { flags: ['k1.rock.frei'] } });
  });

  it('the coat can be taken only while Liese has not caught you at her lines', () => {
    const c = clue('clue.k1.rock') as unknown as ChronikClue;
    const e = { found: [], flags: {}, skills: {}, scanMode: 0, lanternLit: false };
    expect(clueStatus(c, e)).toBe('hidden');
    expect(clueStatus(c, { ...e, flags: { 'k1.rock.frei': true } })).toBe('available');
    // the beat frees it on entry and on every resume (flags repeat), so no save starts locked
    expect(k0b.enter!.find((a) => a.do === 'flag')).toMatchObject({ set: { 'k1.rock.frei': true } });
  });

  it('her eyes are on the front of the green: the lines before her, not the way round behind line B', () => {
    // the zone lies before line A, between Liese and the lines
    const [zx, zz] = toWorld(0.3, 2.2);
    expect(Math.hypot(zone.x - zx, zone.z - zz)).toBeLessThan(0.1);
    expect(zone.r).toBe(3.6);
    // walking straight in from the trail, through the sheets to the coat: seen
    const [fx, fz] = toWorld(1.5, 9);
    const straight = Array.from({ length: 21 }, (_, i) => [fx + ((COAT_XZ[0] - fx) * i) / 20, fz + ((COAT_XZ[1] - fz) * i) / 20] as const);
    expect(straight.some(([x, z]) => inZone(x, z))).toBe(true);
    // talking to her, standing behind line B and the walk round the green's end stay out of it
    expect(Math.hypot(LIESE.x - zone.x, LIESE.z - zone.z)).toBeGreaterThan(zone.r + 1.5);
    expect(inZone(COAT_REACH.x, COAT_REACH.z)).toBe(false);
    for (const [x, z] of [[1047, -845], [1035.7, -855.1], [1018, -866], [1013.9, -867.5], [1010.5, -879], [1008.6, -882.8], [1003.9, -883.8]] as const) expect(inZone(x, z), `${x}/${z}`).toBe(false);
  });

  it('upright between the lines she calls out and the coat is out of reach until you back off; crouched she sees nothing', () => {
    let slice: StorySlice = { ...createStorySlice(), active: true, chapter: 'k1', beat: 'k1_0b' };
    const flags: Record<string, string | number | boolean> = { 'k1.vorspiel': true, 'k1.rock.frei': true };
    const ran: Action[] = [];
    const engine = new StoryEngine([k1], () => slice, {
      run: (actions) => {
        for (const a of actions) {
          ran.push(a);
          if (a.do !== 'flag') continue;
          for (const [key, value] of Object.entries(a.set)) {
            if (value === null) delete flags[key];
            else flags[key] = value;
          }
        }
      },
      chapterEntered: () => {}, beatEntered: () => {}, chapterCompleted: () => {},
    });
    slice = JSON.parse(JSON.stringify(slice)) as StorySlice;
    const at = (x: number, z: number, stance: string) => {
      ran.length = 0;
      engine.tick(0.5, { era: '1789', x, z, flags, inventory: { clues: [], nouns: [], items: [] }, chronik: {}, scan: 0, map: false, stance, lantern: false, caseFacts: () => null });
      return ran.filter((a) => a.do === 'say' || a.do === 'objective');
    };
    at(1013.9, -867.5, 'stand');
    // sneaking through the front of the green: nothing
    expect(at(zone.x, zone.z, 'crouch').filter((a) => a.do === 'say')).toEqual([]);
    expect(flags['k1.rock.frei']).toBe(true);
    at(1013.9, -867.5, 'crouch');
    // upright: she calls out, the coat is hers to watch, the objective says what to do
    const seen = at(zone.x, zone.z, 'stand');
    expect(seen.find((a) => a.do === 'say')).toMatchObject({ id: 'liese.k1.sieht', speaker: 'liese' });
    expect(seen.find((a) => a.do === 'objective')).toMatchObject({ id: 'k1.rock', text: expect.stringContaining('Liese hat dich gesehen') });
    expect(flags['k1.rock.frei']).toBeUndefined();
    // going round behind the line now does not help
    expect(at(COAT_REACH.x, COAT_REACH.z, 'crouch')).toEqual([]);
    expect(flags['k1.rock.frei']).toBeUndefined();
    // off the green: she turns back to the trail, the objective is the coat again
    const back = at(1035.7, -855.1, 'stand');
    expect(flags['k1.rock.frei']).toBe(true);
    expect(back.find((a) => a.do === 'objective')).toMatchObject({ id: 'k1.rock', text: 'Ein Rock, der nicht leuchtet: hinunter zur Bleiche am Bach' });
    // she can catch you again
    expect(at(zone.x, zone.z, 'stand').some((a) => a.do === 'say')).toBe(true);
    // once asked for the coat she lets you walk her green (the favour's fight is next to it)
    at(1035.7, -855.1, 'stand');
    flags['talked.k1.liese.rock'] = true;
    expect(at(zone.x, zone.z, 'stand')).toEqual([]);
    expect(flags['k1.rock.frei']).toBe(true);
    // both reactions leave a coat already worn alone
    expect(JSON.stringify(sees.when)).toContain('{"not":{"flag":"disguise.coat"}}');
    expect(JSON.stringify(calm.when)).toContain('{"not":{"flag":"disguise.coat"}}');
  });
});
