import { EventBus } from '../src/core/events';
import { Input } from '../src/player/input';
import { Player, type PlayerWorld } from '../src/player/player';
import { vi } from 'vitest';

export const PLAYER_DT = 1 / 60;

export function inputSurface() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    pointerLockElement: null as EventTarget | null,
    exitPointerLock: vi.fn(),
  });
  const canvas = Object.assign(new EventTarget(), { requestPointerLock: vi.fn<() => Promise<void> | undefined>() });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  const input = new Input(canvas as unknown as HTMLElement);
  return { win, doc, canvas, input };
}

export function playerFixture(overrides: Partial<PlayerWorld> = {}) {
  const surface = inputSurface();
  const events = new EventBus();
  const player = new Player({
    heightAt: () => 0,
    collide: (x, z) => ({ x, z, hit: false }),
    bounds: () => ({ x0: -2000, z0: -2000, x1: 2000, z1: 2000 }),
    surfaceAt: () => 'grass',
    coverAt: () => 0,
    canFly: () => true,
    ...overrides,
  }, surface.input, events);
  const step = (frames = 1) => {
    for (let i = 0; i < frames; i++) {
      player.update(PLAYER_DT);
      surface.input.endStep();
    }
  };
  return { ...surface, player, events, step };
}
