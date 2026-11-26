import { PerspectiveCamera, Scene } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { MemoryStorage, SettingsStore } from '../src/core/save';
import { createInitialState, GameStateStore } from '../src/core/state';
import { cameraHints } from '../src/player/camera';
import { actionPose } from '../src/player/pose';
import combat from '../src/systems/combat';
import { PLAYER_DT, playerFixture } from './player-fixture';

vi.mock('../src/systems/combat/hud', () => ({
  CombatHud: class {
    hurt() {}
    vitalNumber() {}
    setVitals() {}
    setSkills() {}
    setBoss() {}
    frame() {}
  },
}));

afterEach(() => vi.unstubAllGlobals());

it('plays hit shake in normal motion and leaves the camera still during the same hit with reduced motion', () => {
  const { canvas, doc, win, input, player, events } = playerFixture();
  const kq: Partial<Window['kq']> = {};
  Object.assign(win, { kq, innerWidth: 800, innerHeight: 600 });
  const layer = () => ({ append() {}, remove() {}, classList: { toggle() {} }, replaceChildren() {}, dataset: {} });
  Object.assign(doc, { createElement: layer, head: layer() });

  const state = new GameStateStore(createInitialState());
  const settings = new SettingsStore(new MemoryStorage());
  const camera = new PerspectiveCamera();
  const ctx = {
    input, player, events, state, settings, camera, scene: new Scene(),
    era: { current: 'today', info: { night: false } },
    loop: { manual: true, tick: 0, time: 0 },
    world: { heightAt: () => 0, look: { disc: 'sun', sky: { stars: 0 }, sun: { elevation: 20 } } },
    audio: { ctx: null, unlocked: false, noise: () => null },
    quality: { level: 'low', listeners: [] },
    pause: { reasons: new Set() },
    renderer: { domElement: canvas },
    ui: { layer, hud: { staged: false }, cards: { source() {} }, modals: { count: 0 } },
  } as unknown as GameContext;
  const savedPose = { ...actionPose };
  const savedHints = { ...cameraHints };
  const damaged = vi.fn();
  events.on('player:damaged', damaged);
  combat.init(ctx);
  try {
    player.applyCamera(camera, 1, PLAYER_DT);
    const baseRotation = camera.quaternion.clone();
    const basePosition = camera.position.clone();
    combat.frame(PLAYER_DT);
    expect(kq.combat?.shake()).toBe(0);

    kq.combat!.hurt(10);
    combat.update(PLAYER_DT);
    combat.frame(PLAYER_DT);
    expect(damaged).toHaveBeenCalledTimes(1);
    expect(kq.combat!.shake()).toBeGreaterThan(0);
    expect(camera.quaternion.angleTo(baseRotation)).toBeGreaterThan(0.001);
    expect(camera.position.distanceTo(basePosition)).toBeGreaterThan(0.001);

    settings.update((s) => { s.reducedMotion = true; });
    events.emit('settings:change', { key: 'reducedMotion' });
    kq.combat!.hurt(10);
    combat.update(PLAYER_DT);
    // The normal render path first replaces the previous frame's view with the player's rig.
    player.applyCamera(camera, 1, PLAYER_DT);
    combat.frame(PLAYER_DT);
    expect(damaged).toHaveBeenCalledTimes(2);
    expect(kq.combat!.shake()).toBe(0);
    expect(camera.quaternion.toArray()).toEqual(baseRotation.toArray());
    expect(camera.position.toArray()).toEqual(basePosition.toArray());
  } finally {
    combat.dispose();
    Object.assign(cameraHints, savedHints);
    Object.assign(actionPose, savedPose);
  }
});
