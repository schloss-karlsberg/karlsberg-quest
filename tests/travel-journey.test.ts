import { afterEach, expect, it, vi } from 'vitest';
import { createInitialState } from '../src/core/state';
import { pointById } from '../src/systems/travel/points';
import { disposeTravel, setupTravel } from './travel-fixture';

afterEach(() => {
  disposeTravel();
  vi.useRealTimers();
});

it('refuses an unknown destination and arrives once beside a known point during manual play', () => {
  const { hooks, events, player, pauseReasons, save } = setupTravel();
  const arrived = vi.fn();
  events.on('travel:arrived', arrived);
  expect(hooks.go('zwinger')).toBe(false);
  expect(player.teleport).not.toHaveBeenCalled();
  const home = pointById('karlsbergquelle')!;
  const { x, z } = player.position;
  expect(hooks.go(home.id)).toBe(true);
  expect(player.position.x).toBeCloseTo(home.x + 2.2);
  expect(player.position.z).toBeCloseTo(home.z + 2.2);
  expect(arrived).toHaveBeenCalledExactlyOnceWith({ id: home.id, from: { x, z } });
  expect(save.autosave).toHaveBeenCalledExactlyOnceWith('travel', true);
  expect(pauseReasons.size).toBe(0);
});

it('abandons a pending arrival when a different game is loaded under the curtain', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const { hooks, events, player, pauseReasons, save, loop, state } = setupTravel();
  loop.manual = false;
  const arrived = vi.fn();
  events.on('travel:arrived', arrived);
  expect(hooks.go('karlsbergquelle')).toBe(true);
  expect(pauseReasons.has('travel')).toBe(true);
  expect(hooks.go('karlsbergquelle')).toBe(false);
  const loaded = createInitialState();
  loaded.player.x = 75;
  loaded.player.z = 20;
  state.replace(loaded);
  player.position.set(loaded.player.x, 0, loaded.player.z);
  events.emit('save:loaded', { slot: '1' });
  vi.runAllTimers();
  expect(player.position.toArray()).toEqual([75, 0, 20]);
  expect(arrived).not.toHaveBeenCalled();
  expect(save.autosave).not.toHaveBeenCalled();
  expect(pauseReasons.has('travel')).toBe(false);
  expect(hooks.state().block).toBeNull();
});

it('keeps a replacement journey paused when the earlier curtain would have opened', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const { hooks, player, pauseReasons, save, loop, state } = setupTravel();
  loop.manual = false;
  hooks.go('karlsbergquelle');
  vi.advanceTimersByTime(450); // the first journey arrived; its curtain is still up
  state.replace(createInitialState());
  vi.advanceTimersByTime(100);
  expect(hooks.go('karlsbergquelle')).toBe(true);
  vi.advanceTimersByTime(150); // the old journey would release the shared pause reason now
  expect(pauseReasons.has('travel')).toBe(true);
  vi.runAllTimers();
  expect(pauseReasons.has('travel')).toBe(false);
  expect(player.teleport).toHaveBeenCalledTimes(2);
  expect(save.autosave).toHaveBeenCalledTimes(2);
});
