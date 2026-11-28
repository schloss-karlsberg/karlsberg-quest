import { Scene, Vector3 } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { ERAS, type Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { createInitialState, GameStateStore } from '../src/core/state';
import travel, { type TravelHooks } from '../src/systems/travel';
import { pointById } from '../src/systems/travel/points';

afterEach(() => {
  travel.dispose?.();
  vi.unstubAllGlobals();
});

it('streams and discovers survey tripods only in the present across era changes', () => {
  const kq: { travel?: TravelHooks } = {};
  vi.stubGlobal('window', { kq });
  const scene = new Scene();
  const events = new EventBus();
  const era = { current: 'today' as Era };
  const point = pointById('ehrenhof')!;
  const position = new Vector3(point.x + 20, 0, point.z);
  const heightfield = { heightAt: () => 0, slopeDeg: () => 0 };
  const ctx = {
    scene, events, era,
    state: new GameStateStore(createInitialState()),
    player: { position, stats: {}, moveScale: 1 },
    input: { wasPressed: () => false, isDown: () => false },
    world: {
      heightfields: { '1789': heightfield, '2025': heightfield },
      heightAt: heightfield.heightAt,
      collider: { footprintAt: () => -1 },
      surfaceAt: () => 'grass',
    },
    ui: { hud: {} },
    audio: { bus: () => null },
    save: { autosave: vi.fn() },
  } as unknown as GameContext;
  travel.init(ctx);
  const step = () => travel.update?.(1 / 60, ctx);
  const tripod = () => scene.getObjectByName('travel-tripod');
  const discoveries: string[] = [];
  events.on('travel:activated', ({ id }) => discoveries.push(id));

  step();
  expect(tripod()).toBeDefined();
  position.x = point.x;
  const shift = (to: Era) => {
    const from = era.current;
    era.current = to;
    events.emit('era:change', { from, to });
  };
  for (const past of ERAS.filter((e) => e !== 'today')) {
    shift(past);
    expect(tripod()).toBeUndefined();
    step();
    kq.travel!.activate(point.id);
    expect(tripod()).toBeUndefined();
    expect(discoveries).toEqual([]);
  }

  shift('today');
  // Defer the DOM banner while still allowing proximity discovery.
  events.emit('photo:open', {});
  step();
  expect(tripod()).toBeDefined();
  expect(discoveries).toEqual([point.id]);

  shift('1789');
  events.emit('photo:close', {});
  step();
  expect(tripod()).toBeUndefined();
  expect(kq.travel!.points().find((p) => p.id === point.id)?.activated).toBe(true);
});
