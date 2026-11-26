import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/events';

afterEach(() => { vi.restoreAllMocks(); });

describe('event delivery', () => {
  it('finishes the current named listeners in order before observers, then uses the new subscriptions', () => {
    const bus = new EventBus();
    const calls: string[] = [];
    bus.once('game:pause', () => {
      calls.push('first');
      offSecond();
      bus.on('game:pause', () => calls.push('new'));
    });
    const offSecond = bus.on('game:pause', ({ paused }) => calls.push(`second:${paused}`));
    const offObserver = bus.onAny((name) => calls.push(name));

    bus.emit('game:pause', { paused: true });
    expect(calls).toEqual(['first', 'second:true', 'game:pause']);
    calls.length = 0;
    bus.emit('game:pause', { paused: false });
    expect(calls).toEqual(['new', 'game:pause']);
    offObserver();
    calls.length = 0;
    bus.emit('game:pause', { paused: true });
    expect(calls).toEqual(['new']);
  });

  it('removes a once listener before it emits a nested event of the same type', () => {
    const bus = new EventBus();
    const seen: number[] = [];
    bus.once('scan:mode', () => bus.emit('scan:mode', { mode: 0 }));
    bus.on('scan:mode', ({ mode }) => seen.push(mode));
    bus.emit('scan:mode', { mode: 3 });
    expect(seen).toEqual([0, 3]);
  });

  it('keeps delivering events to gameplay observers when another all-event observer throws', () => {
    const bus = new EventBus();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const seen = vi.fn();
    bus.onAny(() => { throw new Error('observer failure'); });
    bus.onAny(seen);

    bus.emit('era:change', { from: 'today', to: '1789' });
    expect(seen).toHaveBeenCalledExactlyOnceWith('era:change', { from: 'today', to: '1789' });
    expect(error).toHaveBeenCalledOnce();
    bus.clear();
    bus.emit('game:title', {});
    expect(seen).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
