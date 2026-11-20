import { describe, expect, it } from 'vitest';
import type { GameContext } from '../src/core/context';
import type { GhostFigure } from '../src/systems/chronik/world/ghosts';
import { ALIASES, ROSTER, TWINS, isTwin, lookFor, rosterId } from '../src/systems/npc/roster';
import { type EchoFigureLike, type EchoTwin, twinEcho } from '../src/systems/npc/twins';

describe('historical twins: identity API', () => {
  it('Mannlich and the Duke are roster figures, flagged historical, heights from the portraits', () => {
    expect([...TWINS]).toEqual(['mannlich', 'herzog']);
    for (const id of TWINS) {
      const l = ROSTER[id]!;
      expect(l.id).toBe(id);
      expect(l.historical).toBe(true);
      expect(l.hat).toBe('none');
      expect(l.hair).toBe('wig');
    }
    expect(ROSTER.mannlich!.height).toBeCloseTo(1.76, 2);
    expect(ROSTER.herzog!.height).toBeCloseTo(1.8, 2);
    expect(ROSTER.mannlich!.build).toBeLessThan(0.95);
    expect(ROSTER.herzog!.build).toBeGreaterThan(1.05);
    // every other roster figure stays fiction
    for (const [id, l] of Object.entries(ROSTER)) if (!TWINS.includes(id as never)) expect(l.historical).toBeUndefined();
  });

  it('karl-ii-august is an alias of herzog', () => {
    expect(ALIASES['karl-ii-august']).toBe('herzog');
    expect(rosterId('karl-ii-august')).toBe('herzog');
    expect(rosterId('herzog')).toBe('herzog');
    expect(rosterId('soll')).toBe('soll');
    expect(rosterId('nobody')).toBe('nobody');
    expect(lookFor('karl-ii-august').id).toBe('herzog');
  });

  it('isTwin knows the twins by id and alias, nobody else', () => {
    expect(isTwin('mannlich')).toBe(true);
    expect(isTwin('herzog')).toBe(true);
    expect(isTwin('karl-ii-august')).toBe(true);
    for (const id of ['soll', 'hanne', 'diener', 'erzaehler', '']) expect(isTwin(id)).toBe(false);
  });

  it('twinEcho returns null until the authored models land (the echo keeps its smoke silhouette)', () => {
    const ctx = {} as GameContext;
    for (const s of ['mannlich', 'herzog', 'karl-ii-august', 'soll', '']) expect(twinEcho(ctx, s)).toBeNull();
    expect(twinEcho(ctx, 'herzog', { mode: 'solid' })).toBeNull();
  });

  it('the Chronik smoke silhouette fits EchoFigureLike (type check: the echo swap compiles)', () => {
    const asEcho = (g: GhostFigure): EchoFigureLike => g;
    const sit = (t: EchoTwin): boolean => t.sit;
    expect(typeof asEcho).toBe('function');
    expect(typeof sit).toBe('function');
  });
});
