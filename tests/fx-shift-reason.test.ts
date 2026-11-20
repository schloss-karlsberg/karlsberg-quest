import { describe, expect, it } from 'vitest';
import type { Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import '../src/systems/contracts';
import { type InstantShiftCtx, instantShift } from '../src/systems/fx/shift/instant';

function fakeCtx(start: Era = '1789') {
  const events = new EventBus();
  const era = { current: start, set(to: Era) { era.current = to; } };
  const meta = { shifts: 0 };
  const ctx = { events, era, state: { mutable: { meta } } } as unknown as InstantShiftCtx;
  return { ctx, events, era, meta };
}

describe("'shift:done' carries the request's reason (tour C4)", () => {
  it("passes 'return' through (Q-hold back to the present)", () => {
    const { ctx, events, era, meta } = fakeCtx('1789');
    const done: unknown[] = [];
    events.on('shift:done', (p) => done.push(p));
    instantShift(ctx, 'today', 'return');
    expect(done).toEqual([{ from: '1789', to: 'today', reason: 'return' }]);
    expect(era.current).toBe('today');
    expect(meta.shifts).toBe(1);
  });

  it('keeps old listeners working when no reason is given', () => {
    const { ctx, events } = fakeCtx('today');
    let seen: { from: Era; to: Era; reason?: string } | null = null;
    events.on('shift:done', (p) => (seen = p));
    instantShift(ctx, '1796');
    expect(seen).toMatchObject({ from: 'today', to: '1796' });
    expect(seen!.reason).toBeUndefined();
  });

  it("does not count 'caught' as a player shift", () => {
    const { ctx, events, meta } = fakeCtx('1793-07');
    let reason: string | undefined;
    events.on('shift:done', (p) => (reason = p.reason));
    instantShift(ctx, 'today', 'caught');
    expect(reason).toBe('caught');
    expect(meta.shifts).toBe(0);
  });
});
