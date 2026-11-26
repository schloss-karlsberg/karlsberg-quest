/** Drive the registered travel system on flat ground; no renderer, audio device or frame clock. */
import { Scene, Vector3 } from 'three';
import { vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { createInitialState, GameStateStore } from '../src/core/state';
import travel, { type TravelHooks } from '../src/systems/travel';

export function setupTravel() {
  const events = new EventBus();
  const state = new GameStateStore(createInitialState());
  const keys = new Set<string>();
  const pauseReasons = new Set<string>();
  const player = {
    position: new Vector3(-2000, 0, -2000), moveScale: 1, stance: 'stand', canSprint: true, flying: false,
    stats: { lanternLit: false }, setStance: vi.fn(),
    teleport: vi.fn((x: number, z: number) => {
      player.position.set(x, 0, z);
      events.emit('player:teleport', { x, z });
    }),
  };
  const heal = vi.fn();
  const kq: { travel?: TravelHooks; combat: { state(): { hp: number }; heal(): void } } = {
    combat: { state: () => ({ hp: 15 }), heal },
  };
  vi.stubGlobal('window', { kq });
  vi.stubGlobal('document', {
    createElement: () => ({
      dataset: {}, classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
      append: vi.fn(), remove: vi.fn(),
    }),
    head: { append: vi.fn() }, body: { append: vi.fn() },
  });
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const ground = { heightAt: () => 0, slopeDeg: () => 0 };
  const save = { autosave: vi.fn() };
  const loop = { manual: true };
  const ctx = {
    events, state, player, loop, save, scene: new Scene(), era: { current: 'today' },
    settings: { state: { reducedMotion: true } }, params: new URLSearchParams(),
    input: { wasPressed: () => false, isDown: (key: string) => keys.has(key) },
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
  return { hooks: kq.travel!, events, player, keys, step, state, pauseReasons, save, loop, heal };
}

export function disposeTravel(): void {
  travel.dispose();
  vi.unstubAllGlobals();
}
