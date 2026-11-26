/** Drive the registered travel system on flat ground; no renderer, audio device or frame clock. */
import { Scene } from 'three';
import { vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SaveManager } from '../src/core/save';
import { createInitialState, GameStateStore } from '../src/core/state';
import type { Input } from '../src/player/input';
import { Player } from '../src/player/player';
import travel, { type TravelHooks } from '../src/systems/travel';

export function setupTravel() {
  const events = new EventBus();
  const state = new GameStateStore(createInitialState());
  const keys = new Set<string>();
  const pauseReasons = new Set<string>();
  const ground = { heightAt: () => 0, slopeDeg: () => 0 };
  const input = { wasPressed: () => false, isDown: (key: string) => keys.has(key) };
  const player = new Player({
    heightAt: ground.heightAt,
    collide: (x, z) => ({ x, z, hit: false }),
    bounds: () => ({ x0: -3000, x1: 3000, z0: -3000, z1: 3000 }),
    surfaceAt: () => 'meadow', coverAt: () => 0, canFly: () => true,
  }, input as unknown as Input, events);
  player.teleport(-2000, -2000);
  player.writeState(state.mutable.player);
  vi.spyOn(player, 'teleport');
  // Match boot's player restore before the feature systems handle the load event.
  events.on('save:loaded', () => player.readState(state.state.player));
  const heal = vi.fn();
  const kq: { travel?: TravelHooks; combat: { state(): { hp: number }; heal(): void } } = {
    combat: { state: () => ({ hp: 15 }), heal },
  };
  vi.stubGlobal('window', { kq });
  const createElement = () => ({
    dataset: {}, classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
    append: vi.fn(), remove: vi.fn(),
  });
  const body = { append: vi.fn<(element: ReturnType<typeof createElement>) => void>() };
  vi.stubGlobal('document', { createElement, head: { append: vi.fn() }, body });
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const storage = new MemoryStorage();
  const save = new SaveManager(state, storage, events);
  vi.spyOn(save, 'autosave');
  const loop = { manual: true };
  const ctx = {
    events, state, player, loop, save, scene: new Scene(), era: { current: 'today' },
    settings: { state: { reducedMotion: true } }, params: new URLSearchParams(),
    input,
    pause: { push: (r: string) => pauseReasons.add(r), pop: (r: string) => pauseReasons.delete(r) },
    ui: { add: vi.fn(), toast: vi.fn(), cards: { claim: () => true, release: vi.fn() }, modals: { count: 0 }, hud: {} },
    audio: { bus: () => null, noise: () => null }, post: { uniforms: { uShift: { value: 0 } } },
    quality: { hold: vi.fn() },
    world: {
      heightfields: { '1789': ground, '2025': ground }, heightAt: ground.heightAt,
      surfaceAt: () => 'meadow', collider: { footprintAt: () => -1 }, forest: { invalidate: vi.fn() },
    },
  } as unknown as GameContext;
  travel.init(ctx);
  const step = (dt = 1 / 60) => travel.update(dt, ctx);
  step();
  return { hooks: kq.travel!, events, player, keys, step, state, pauseReasons, save, storage, loop, heal, body };
}

export function disposeTravel(): void {
  travel.dispose();
  vi.unstubAllGlobals();
}
