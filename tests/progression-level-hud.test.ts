import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { LEVEL_XP } from '../src/rpg/stats';
import progression from '../src/systems/progression';
import { explorationSession } from './exploration-fixture';

const setXp = vi.fn();
vi.mock('../src/systems/progression/hud', () => ({
  ProgressionHud: class {
    clearFloats() {}
    setXp(...args: unknown[]) { setXp(...args); }
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
    push() {}
  },
}));
vi.mock('../src/systems/progression/pages', () => ({ installProgressionPages: () => ({ refresh() {} }) }));

afterEach(() => {
  progression.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// `?kapitel=4` jumps to level 9 through kq.progression.level, which grants no XP event: the XP
// widget showed „Stufe 1 · 0 / 150 EP“ until the first XP came in (TASK-086).
it('a debug level jump shows the new level and XP in the XP widget at once', () => {
  const { state, save, events, era, element } = explorationSession();
  const ctx = {
    state, save, events, era, loop: { time: 0 }, params: new URLSearchParams(), scene: new Scene(),
    camera: new PerspectiveCamera(), renderer: { domElement: { clientHeight: 720 } },
    world: { heightAt: () => 0 }, player: { position: new Vector3() },
    settings: { state: {} }, input: { wasPressed: () => false }, pause: { reasons: new Set() },
    ui: { layer: element, hud: { promptOwner: () => null, prompt: vi.fn() }, cards: { release: vi.fn() } },
    audio: {},
  } as unknown as GameContext;
  progression.init(ctx);
  progression.frame(1); // installs window.kq.progression
  setXp.mockClear();
  window.kq!.progression!.level(9);
  // no frame in between: the bar is current straight after the jump
  expect(setXp).toHaveBeenLastCalledWith(9, 0, LEVEL_XP[9]! - LEVEL_XP[8]!, LEVEL_XP[8], false);
  window.kq!.progression!.level(3);
  expect(setXp).toHaveBeenLastCalledWith(3, 0, LEVEL_XP[3]! - LEVEL_XP[2]!, LEVEL_XP[2], false);
});
