import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import tourRoute from '../content/routes/p-fuehrung.json';
import { createInitialState } from '../src/core/state';
import { pointById } from '../src/systems/travel/points';
import { WalkRuntime, type WalkBus } from '../src/systems/walk/runtime';
import type { Route } from '../src/systems/walk/types';
import { disposeTravel, setupTravel } from './travel-fixture';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));

afterEach(() => {
  disposeTravel();
  vi.useRealTimers();
});

it.each([true, false])('autosaves the arrival pose with manual play set to %s', (manual) => {
  const { hooks, events, player, pauseReasons, save, loop, state, body } = setupTravel();
  loop.manual = manual;
  player.setStance('crouch');
  player.pitch = 0.3;
  player.writeState(state.mutable.player);
  const arrived = vi.fn();
  events.on('travel:arrived', arrived);
  expect(hooks.go('zwinger')).toBe(false);
  expect(player.teleport).not.toHaveBeenCalled();
  const home = pointById('karlsbergquelle')!;
  const { x, z } = player.position;
  expect(hooks.go(home.id)).toBe(true);
  const [curtain] = body.append.mock.lastCall!;
  if (!manual) {
    expect(save.has()).toBe(false);
    vi.advanceTimersByTime(450);
    expect(pauseReasons.has('travel')).toBe(true);
  }
  expect(player.position.x).toBeCloseTo(home.x + 2.2);
  expect(player.position.z).toBeCloseTo(home.z + 2.2);
  expect(arrived).toHaveBeenCalledExactlyOnceWith({ id: home.id, from: { x, z } });
  expect(save.autosave).toHaveBeenCalledExactlyOnceWith('travel', true);
  expect(save.peek()?.player).toMatchObject({
    x: home.x + 2.2, y: 0, z: home.z + 2.2, yaw: player.yaw, pitch: 0, stance: 'stand',
  });
  vi.runAllTimers();
  expect(pauseReasons.size).toBe(0);
  expect(curtain.remove).toHaveBeenCalledTimes(1);
});

it('returning to the title cancels a pending journey before saving the departure pose', () => {
  const { hooks, events, player, pauseReasons, save, loop, body } = setupTravel();
  loop.manual = false;
  const { x, z } = player.position;
  const arrived = vi.fn();
  events.on('travel:arrived', arrived);
  expect(hooks.go('karlsbergquelle')).toBe(true);
  const [curtain] = body.append.mock.lastCall!;
  expect(pauseReasons.has('travel')).toBe(true);

  pauseReasons.add('title');
  events.emit('game:title', {});
  expect(curtain.remove).toHaveBeenCalledTimes(1);
  expect([...pauseReasons]).toEqual(['title']);
  expect(save.autosave('title', true)).toBe(true);
  const departure = save.peek();
  expect(departure?.player).toMatchObject({ x, z });

  vi.runAllTimers();
  expect(player.position.toArray()).toEqual([x, 0, z]);
  expect(arrived).not.toHaveBeenCalled();
  expect(save.autosave).toHaveBeenCalledExactlyOnceWith('title', true);
  expect(save.peek()).toEqual(departure);
});

it('replays the tour group’s snap on the first tick after reloading the spring arrival save', () => {
  const { hooks, events, player, pauseReasons, save, loop, state } = setupTravel();
  loop.manual = false;
  const route = tourRoute as Route;
  const walk = new WalkRuntime({
    bus: events as unknown as WalkBus,
    routes: new Map([[route.id, route]]),
    slice: () => state.slice('walk', () => ({ walkers: [], groups: [] })),
    bodies: () => null,
    world: { heightAt: () => 0, player: () => player.position, era: () => state.state.era },
  });
  events.on('save:loaded', () => walk.restore());
  const weiher = route.stops.find(stop => stop.id === 'weiher')!;
  const quelle = route.stops.find(stop => stop.id === 'quelle')!;
  player.teleport(weiher.x, weiher.z);
  walk.ensureNpc('imhoff', weiher.x, weiher.z);
  events.emit('npc:walk', { op: 'group', group: 'fuehrung', leader: 'imhoff', members: ['extra.mats'] });
  events.emit('npc:walk', { op: 'follow', group: 'fuehrung', leader: 'imhoff' });
  events.emit('npc:walk', { op: 'walk', npc: 'imhoff', route: route.id, to: quelle.id, speed: 1.9, wait: { for: 'player', r: 25 } });
  walk.update(1 / 60);

  const arrivals = vi.fn();
  events.on('npc:arrived', arrivals);
  expect(hooks.go('karlsbergquelle')).toBe(true);
  vi.advanceTimersByTime(450);
  expect(pauseReasons.has('travel')).toBe(true);
  expect(arrivals).not.toHaveBeenCalled();
  expect(save.load()).toBe(true);
  expect(pauseReasons.has('travel')).toBe(false);
  expect(walk.walkers.get('imhoff')?.arrived).toBe(false);

  walk.update(1 / 60);
  const guide = walk.walkers.get('imhoff')!;
  const member = walk.npcs.get('extra.mats')!;
  expect(guide.arrived).toBe(true);
  expect(Math.hypot(guide.x - quelle.x, guide.z - quelle.z)).toBeLessThan(1);
  expect(Math.hypot(member.x - guide.x, member.z - guide.z)).toBeLessThan(6);
  expect(state.state.systems.walk?.pendingTravelSnap).toBeUndefined();
  expect(arrivals).toHaveBeenCalledExactlyOnceWith({ npc: 'imhoff', at: quelle.id, route: route.id, skipped: true });
});

it('abandons a pending arrival when a different game is loaded under the curtain', () => {
  const { hooks, events, player, pauseReasons, save, loop, state } = setupTravel();
  loop.manual = false;
  player.teleport(75, 20);
  player.writeState(state.mutable.player);
  expect(save.save('1')).toBe(true);
  player.teleport(-2000, -2000);
  player.writeState(state.mutable.player);
  const arrived = vi.fn();
  events.on('travel:arrived', arrived);
  expect(hooks.go('karlsbergquelle')).toBe(true);
  expect(pauseReasons.has('travel')).toBe(true);
  expect(hooks.go('karlsbergquelle')).toBe(false);
  expect(save.load('1')).toBe(true);
  vi.runAllTimers();
  expect(player.position.toArray()).toEqual([75, 0, 20]);
  expect(arrived).not.toHaveBeenCalled();
  expect(save.autosave).not.toHaveBeenCalled();
  expect(pauseReasons.has('travel')).toBe(false);
  expect(hooks.state().block).toBeNull();
});

it('keeps a replacement journey paused when the earlier curtain would have opened', () => {
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

it.each(['load', 'game start', 'disposal'] as const)('removes a fading travel curtain immediately on %s', (action) => {
  const { hooks, events, pauseReasons, save, loop, body } = setupTravel();
  loop.manual = false;
  expect(hooks.go('karlsbergquelle')).toBe(true);
  const [curtain] = body.append.mock.lastCall!;
  vi.advanceTimersByTime(700);
  expect(pauseReasons.has('travel')).toBe(false);
  expect(curtain.classList.remove).toHaveBeenCalledWith('on');
  expect(curtain.remove).not.toHaveBeenCalled();

  if (action === 'load') expect(save.load()).toBe(true);
  else if (action === 'game start') events.emit('game:start', { resumed: false });
  else disposeTravel();

  expect(curtain.remove).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
