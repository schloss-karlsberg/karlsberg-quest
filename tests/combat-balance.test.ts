/**
 * Combat balance at the intended build of each chapter (fun pass 2026-11-16, combat variety pass
 * 2026-11-17; docs/ACTION-RPG.md §5.4–§5.5). Bots from `combat-bots.ts` fight a chapter's standard
 * encounter — the pack as content places it, with the elite, the escorts, the second wave and the
 * era's hazards — through the real simulation:
 *
 *  - the **tank** faces the nearest enemy and swings, never moves, never dodges: it must lose at
 *    least 40 % of its Lebenskraft (or go down);
 *  - the **masher** runs at the nearest enemy, hammers the attack, flares the Bannlicht whenever it
 *    can, never dodges, never uses an ability: it must not clear the fight in under 15 s and must
 *    lose at least 40 % (or go down) — a regular fight is not five seconds of clicking;
 *  - the **skilled** bot rolls out of telegraphs and hazards, takes the Rufer and the Nebelweberin
 *    first, breaks guards and mirrors with the Wuchthieb, tears veils with the Bannlicht and uses
 *    the Ausfall, the Erdstoß and the Wirbel: it must win comfortably (more than a third of its
 *    Lebenskraft left) in a fight that still takes a while.
 */
import { describe, expect, it } from 'vitest';
import { CHAPTERS, fight } from './combat-bots';
import { FIRST, contentEncounters } from './combat-encounters';

describe('combat balance per chapter: mashing hurts, skill wins', () => {
  for (const [ch, { build, enc }] of Object.entries(CHAPTERS)) {
    const need = 0.4;
    it(`${ch}: ${enc.count} × ${enc.kind} (tier ${enc.tier}) at level ${build.level} — the tank loses ≥ ${need * 100} %`, () => {
      const r = fight(build, enc, 'tank');
      expect(r.dead || r.lost >= r.max * need, JSON.stringify(r)).toBe(true);
    });
    it(`${ch}: the masher takes ≥ 15 s and loses ≥ ${need * 100} %`, () => {
      const r = fight(build, enc, 'masher');
      expect(r.dead || r.lost >= r.max * need, JSON.stringify(r)).toBe(true);
      expect(r.seconds, JSON.stringify(r)).toBeGreaterThanOrEqual(15);
    });
    it(`${ch}: the skilled bot wins comfortably`, () => {
      const r = fight(build, enc, 'skilled');
      expect(r.dead, JSON.stringify(r)).toBe(false);
      expect(r.killed, JSON.stringify(r)).toBe(enc.count);
      expect(r.left, JSON.stringify(r)).toBe(0);
      expect(r.lost, JSON.stringify(r)).toBeLessThan(r.max * 0.66);
      expect(r.dodges, JSON.stringify(r)).toBeGreaterThanOrEqual(2);
      expect(r.seconds, JSON.stringify(r)).toBeGreaterThanOrEqual(18);
      expect(r.seconds, JSON.stringify(r)).toBeLessThanOrEqual(75);
    });
  }

  it('from K1 on the skilled bot uses its abilities, and a fight is a mixed pack with an elite and a second wave', () => {
    for (const ch of ['k1', 'k2', 'k3', 'k4']) {
      const { build, enc } = CHAPTERS[ch]!;
      const r = fight(build, enc, 'skilled');
      const used = Object.values(r.skills).reduce((a, b) => a + (b ?? 0), 0);
      expect(used, `${ch} ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(2);
      expect(r.waves, `${ch} wave ${JSON.stringify(r)}`).toBe(1);
      expect(r.kinds.some((k) => k.endsWith('*')), `${ch} elite ${JSON.stringify(r)}`).toBe(true);
      expect(new Set(r.kinds.map((k) => k.replace('*', ''))).size, `${ch} mixed ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('the new kinds turn up in their chapters: Foliant K1, Rufer K2 and K4, Scherbling K3', () => {
    expect(fight(CHAPTERS.k1!.build, CHAPTERS.k1!.enc, 'tank').kinds).toContain('foliant');
    expect(fight(CHAPTERS.k2!.build, CHAPTERS.k2!.enc, 'tank').kinds).toContain('rufer');
    expect(fight(CHAPTERS.k3!.build, CHAPTERS.k3!.enc, 'tank').kinds).toContain('scherbling');
    expect(fight(CHAPTERS.k4!.build, CHAPTERS.k4!.enc, 'tank').kinds).toContain('rufer');
  });

  it('the masher bounces off the Foliant and throws its Bannlicht into the Scherbling', () => {
    expect(fight(CHAPTERS.k1!.build, CHAPTERS.k1!.enc, 'masher').blocked).toBeGreaterThan(0);
    expect(fight(CHAPTERS.k3!.build, CHAPTERS.k3!.enc, 'masher').reflected).toBeGreaterThan(0);
  });

  it('gentle mode: the masher gets through the K2 pack and the tank does not go down', () => {
    const { build, enc } = CHAPTERS.k2!;
    const m = fight(build, enc, 'masher', { gentle: true });
    expect(m.dead, JSON.stringify(m)).toBe(false);
    expect(m.left, JSON.stringify(m)).toBe(0);
    const t = fight(build, enc, 'tank', { gentle: true });
    expect(t.dead, JSON.stringify(t)).toBe(false);
  });
});

/**
 * Every fight content places (playtest round 5): the chapter's first fight must not kill a
 * button-masher (the K3 basket fight did, at the intended build); the escorts fit the scene (hounds
 * with hounds, no paper in a hound fight); a pair of
 * Irrlichter is not three seconds of clicking any more.
 */
describe('combat balance per content encounter', () => {
  const all = contentEncounters();
  const regular = all.filter((c) => !c.boss);

  it('finds the content encounters (quests and story)', () => {
    expect(all.length).toBeGreaterThan(30);
    expect(all.filter((c) => c.first).length).toBe(FIRST.length);
    expect(all.some((c) => c.id.includes('k1.rund'))).toBe(true);
  });

  for (const c of all.filter((x) => x.first)) {
    it(`${c.id}: a masher comes through the chapter's first fight (≥ 10 % left), the skilled bot in ≤ 50 s`, () => {
      const m = fight(c.build, c.enc, 'masher');
      expect(m.dead, JSON.stringify(m)).toBe(false);
      expect(m.max - m.lost, JSON.stringify(m)).toBeGreaterThanOrEqual(m.max * 0.1);
      const s = fight(c.build, c.enc, 'skilled');
      expect(s.dead, JSON.stringify(s)).toBe(false);
      expect(s.seconds, JSON.stringify(s)).toBeLessThanOrEqual(50);
    });
  }

  it('every regular fight: the skilled bot wins with a third left, within 75 s', () => {
    const bad: string[] = [];
    for (const c of regular) {
      const r = fight(c.build, c.enc, 'skilled');
      if (r.dead || r.left > 0 || r.lost > r.max * 0.66 || r.seconds > 75) bad.push(`${c.id} ${JSON.stringify({ s: r.seconds, lost: r.lost, max: r.max, dead: r.dead, left: r.left })}`);
    }
    expect(bad).toEqual([]);
  });

  it('a pair of Irrlichter brings company: no longer over for a masher in seconds', () => {
    for (const c of regular.filter((x) => x.enc.kind === 'irrlicht' && x.enc.count === 2)) {
      const r = fight(c.build, c.enc, 'masher');
      // (round 9: a light the flare pressed down is reached a little further and snapped to first —
      // "Lichter am Weiher" was lost three times — so the masher is quicker; still not a few seconds)
      expect(r.seconds, `${c.id} ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(9);
      expect(r.waves, c.id).toBe(1);
    }
  });

  it('hounds fight with hounds and the K3 basket thieves are Raffschatten', () => {
    for (const c of regular.filter((x) => x.enc.kind === 'streuner' && (x.chapter === 'k1' || x.chapter === 'k3'))) {
      const r = fight(c.build, c.enc, 'tank', { seconds: 30 });
      expect(r.kinds.map((k) => k.replace('*', '')).filter((k) => k !== 'streuner'), c.id).toEqual([]);
    }
    const k3 = all.find((x) => x.id === 'q.k3.nachmittag.schatten')!;
    expect([...new Set(fight(k3.build, k3.enc, 'tank', { seconds: 40 }).kinds.map((k) => k.replace('*', '')))]).toEqual(['raffschatten']);
  });

  it('a veiled Streuner resists staff blows until a Bannlicht lands', () => {
    const { build, enc } = CHAPTERS.k1!;
    const veiled = { ...enc, count: 1, extra: { veiled: true } };
    // the tank never flares: it cannot undo it
    const t = fight(build, veiled, 'tank', { seconds: 20 });
    expect(t.killed).toBe(0);
    // the masher flares and then wins
    const m = fight(build, veiled, 'masher');
    expect(m.killed).toBe(1);
  });
});
