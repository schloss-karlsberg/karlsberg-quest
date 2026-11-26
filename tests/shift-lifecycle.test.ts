import { Color, Scene, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import type { Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { Quality } from '../src/systems/fx/quality';
import { ShiftEffect } from '../src/systems/fx/shift/shift';
import { SHIFT_DURATION_REDUCED, SHIFT_MID_REDUCED } from '../src/systems/fx/shift/timeline';
import type { FxUI } from '../src/systems/fx/ui';

function setup(frozen = false) {
  const events = new EventBus();
  const player = { position: new Vector3(), frozen };
  const meta = { shifts: 7 };
  const era = { current: '1789' as Era, set(to: Era) { era.current = to; } };
  const ctx = {
    events, player, era, scene: new Scene(), audio: {}, state: { mutable: { meta } },
    world: { palace: { setMode: vi.fn() } },
    post: { uniforms: { uShift: { value: 0 }, uFlash: { value: new Color() }, uDesaturate: { value: 0 } } },
  };
  const ui = { caption: vi.fn(), setCompass: vi.fn() };
  const effect = new ShiftEffect(ctx as unknown as GameContext, ui as unknown as FxUI, new Quality('low'));
  return { effect, events, era, player, meta };
}

describe('reduced-motion shift lifecycle', () => {
  it('switches once at the midpoint and restores movement before announcing completion', async () => {
    const { effect, events, era, player, meta } = setup();
    const phases: unknown[] = [];
    events.onAny((name, payload) => phases.push([name, era.current, player.frozen, meta.shifts, payload]));
    const end = effect.start('today', { reduced: true, reason: 'return' });
    const journey = { from: '1789', to: 'today' };
    expect(phases).toEqual([['shift:begin', '1789', true, 7, journey]]);
    effect.advance(SHIFT_MID_REDUCED - 0.01);
    effect.frozen = true;
    effect.advance(SHIFT_DURATION_REDUCED);
    expect(era.current).toBe('1789');
    expect(effect.t).toBeCloseTo(SHIFT_MID_REDUCED - 0.01);
    effect.frozen = false;
    effect.setTime(SHIFT_MID_REDUCED);
    expect(phases[1]).toEqual(['shift:midpoint', 'today', true, 7, journey]);
    expect(effect.holdRadius).toBe(0);
    effect.setTime(0);
    effect.setTime(SHIFT_MID_REDUCED);
    effect.advance(SHIFT_DURATION_REDUCED);
    await end;
    effect.finish();
    expect(phases.slice(2)).toEqual([['shift:done', 'today', false, 8, { ...journey, reason: 'return' }]]);
    expect(effect.active).toBe(false);
    effect.dispose();
  });

  it('finishes an early capture return without counting a player shift or unlocking story movement', async () => {
    const { effect, events, era, player, meta } = setup(true);
    const done = vi.fn();
    events.on('shift:done', done);
    const end = effect.start('today', { reduced: true, reason: 'caught' });
    effect.finish();
    await end;
    expect(done).toHaveBeenCalledExactlyOnceWith({ from: '1789', to: 'today', reason: 'caught' });
    expect(era.current).toBe('today');
    expect(player.frozen).toBe(true);
    expect(meta.shifts).toBe(7);
    effect.dispose();
  });
});
