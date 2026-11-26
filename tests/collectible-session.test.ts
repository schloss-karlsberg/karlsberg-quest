import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import progression from '../src/systems/progression';
import { explorationSession } from './exploration-fixture';

// Exercise the pickup world, inventory and slot listeners without mounting the pause pages.
vi.mock('../src/systems/progression/hud', () => ({
  ProgressionHud: class {
    clearFloats() {}
    setXp() {}
    setQuick() {}
    line() {}
    gain() {}
    frame() {}
  },
}));
vi.mock('../src/systems/progression/levelup-card', () => ({
  LevelCards: class {
    clear() {}
    frame() {}
  },
}));
vi.mock('../src/systems/progression/pages', () => ({ installProgressionPages: () => ({ refresh() {} }) }));

function setup() {
  const { state, save, events, era, element } = explorationSession();
  const loop = { time: 0 };
  const ctx = {
    state, save, events, era, loop, params: new URLSearchParams(), scene: new Scene(),
    camera: new PerspectiveCamera(), renderer: { domElement: { clientHeight: 720 } },
    world: { heightAt: () => 0 }, player: { position: new Vector3() },
    settings: { state: {} }, input: { wasPressed: () => false }, pause: { reasons: new Set() },
    ui: { layer: element, hud: { promptOwner: () => null, prompt: vi.fn() }, cards: { release: vi.fn() } },
    audio: {},
  } as unknown as GameContext;
  progression.init(ctx);
  const frame = () => { loop.time += 1; progression.frame(1); };
  frame();
  return { state, events, save, era, frame, hooks: window.kq!.progression! };
}

afterEach(() => {
  progression.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const pile = { item: 'item.kastanie', id: 'test.pile', count: 5, era: 'today', x: 0, z: 0 } as const;

it('leaves the uncollected part of a stack visible when the pack fills', () => {
  const { events, frame, hooks } = setup();
  hooks.grant(pile.item, 97);
  events.emit('loot:place', pile);
  progression.update(1 / 60); // walking over the pile fills the two remaining spaces
  frame();
  expect(hooks.state().inventory[pile.item]).toBe(99);
  expect(hooks.state().taken).not.toContain(pile.id);
  expect(hooks.pickups()).toMatchObject([{ id: pile.id, count: 3, vis: 1 }]);
});

it('preserves the remainder when a partial pickup placement replays after reload', () => {
  const { events, save, hooks } = setup();
  hooks.grant(pile.item, 97);
  events.emit('loot:place', pile);
  expect(hooks.take(pile.id)).toBe(2);
  save.save('partial');
  save.load('partial');
  events.emit('loot:place', pile);
  expect(hooks.pickups()).toMatchObject([{ id: pile.id, count: 3 }]);
  expect(hooks.take(pile.id)).toBe(0);
});

it('filters a placed collectible by era before drawing it or awarding it on contact', () => {
  const { events, state, era, frame, hooks } = setup();
  events.emit('loot:place', { ...pile, era: '1789' });
  frame();
  progression.update(1 / 60);
  expect(hooks.pickups()).toMatchObject([{ id: pile.id, vis: 0 }]);
  expect(state.state.systems.progression?.inventory).toEqual({});
  era.set('1789');
  frame();
  expect(hooks.pickups()).toMatchObject([{ id: pile.id, vis: 1 }]);
  progression.update(1 / 60);
  expect(hooks.state().inventory[pile.item]).toBe(5);
  expect(hooks.pickups()).toEqual([]);
  events.emit('loot:place', { ...pile, era: '1789' });
  expect(hooks.pickups()).toEqual([]);
});

it('remembers the collection card’s XP receipt when a slot is loaded again', () => {
  const { events, save, hooks } = setup();
  events.emit('codex:unlocked', { factId: 'cx.47' });
  const xp = hooks.state().xp;
  expect(xp).toBe(10);
  save.save('card');
  save.load('card');
  events.emit('codex:unlocked', { factId: 'cx.47' });
  expect(hooks.state().xp).toBe(xp);
  expect(hooks.state().codexXp).toEqual(['cx.47']);
});
