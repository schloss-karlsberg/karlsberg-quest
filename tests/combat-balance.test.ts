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
 *
 * The prologue's first pack (the present, a tutorial: no elite, no escorts, three more Nebelinge
 * from behind) asks less of the tank and the masher.
 */
import { describe, expect, it } from 'vitest';
import { CHAPTERS, fight } from './combat-bots';

describe('combat balance per chapter: mashing hurts, skill wins', () => {
  for (const [ch, { build, enc }] of Object.entries(CHAPTERS)) {
    const tutorial = ch === 'prolog';
    const need = tutorial ? 0.2 : 0.4;
    it(`${ch}: ${enc.count} × ${enc.kind} (tier ${enc.tier}) at level ${build.level} — the tank loses ≥ ${need * 100} %`, () => {
      const r = fight(build, enc, 'tank');
      expect(r.dead || r.lost >= r.max * need, JSON.stringify(r)).toBe(true);
    });
    it(`${ch}: the masher takes ≥ ${tutorial ? 12 : 15} s and loses ≥ ${need * 100} %`, () => {
      const r = fight(build, enc, 'masher');
      expect(r.dead || r.lost >= r.max * need, JSON.stringify(r)).toBe(true);
      expect(r.seconds, JSON.stringify(r)).toBeGreaterThanOrEqual(tutorial ? 12 : 15);
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
