import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import tools from '../src/systems/tools';
import { explorationSession } from './exploration-fixture';

vi.mock('../src/ui/dom', () => ({ h: () => document.createElement('div') }));

afterEach(() => {
  tools.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(['era change', 'same-era load'])('cancels an unfinished tape on %s', transition => {
  const { state, events, save, era, element } = explorationSession();
  const camera = new PerspectiveCamera();
  camera.position.set(10, 20, -3);
  camera.rotation.x = -Math.PI / 2;
  const keys = new Set<string>();
  const ctx = {
    state, events, era, camera, params: new URLSearchParams(), scene: new Scene(),
    player: { position: new Vector3() }, data: { meta: {} },
    world: {
      heightfield: { heightAt: () => 0 }, palace: { material: { fragmentShader: '' } },
      forest: { material: { vertexShader: '' } },
    },
    settings: { state: {} }, ui: { layer: element, toast: vi.fn(), hud: { stack: vi.fn() } },
    t: (key: string) => key, input: { wasPressed: (key: string) => keys.has(key) },
  } as unknown as GameContext;
  tools.init(ctx);
  tools.frame(0, ctx);
  const measure = window.kq!.tools!.measure;
  const done = vi.fn();
  events.on('measure:done', done);
  save.save('idle');
  keys.add('measure');
  tools.update(0, ctx);
  expect(measure.state().mode).toBe('a');
  keys.clear();
  keys.add('interact');
  tools.update(0, ctx);
  expect(measure.state()).toMatchObject({ mode: 'b', a: { x: 10, y: 0 }, b: null });
  expect(state.state.flags['tools.measuring']).toBe(true);
  if (transition === 'era change') era.set('1789');
  else save.load('idle');
  keys.clear();
  tools.update(0, ctx);
  expect(measure.state()).toMatchObject({ mode: 'off', a: null, b: null, distance: null });
  expect(state.state.flags['tools.measuring']).toBeUndefined();
  expect(done).not.toHaveBeenCalled();
});
