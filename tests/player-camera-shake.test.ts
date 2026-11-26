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

function combatFixture() {
  const { canvas, doc, win, input, player, events } = playerFixture();
  const kq: Partial<Window['kq']> = {};
  Object.assign(win, { kq, innerWidth: 800, innerHeight: 600 });
  const layer = () => ({ append() {}, remove() {}, classList: { toggle() {} }, replaceChildren() {}, dataset: {} });
  Object.assign(doc, { createElement: layer, head: layer() });

  const state = new GameStateStore(createInitialState());
  const settings = new SettingsStore(new MemoryStorage());
  const camera = new PerspectiveCamera();
  const loop = { manual: true, tick: 0, time: 0 };
  const ctx = {
    input, player, events, state, settings, camera, scene: new Scene(),
    era: { current: 'today', info: { night: false } },
    loop,
    world: { heightAt: () => 0, look: { disc: 'sun', sky: { stars: 0 }, sun: { elevation: 20 } } },
    audio: { ctx: null, unlocked: false, noise: () => null },
    quality: { level: 'low', listeners: [] },
    pause: { reasons: new Set() },
    renderer: { domElement: canvas },
    ui: { layer, hud: { staged: false, el: { querySelector: () => null } }, cards: { source() {} }, modals: { count: 0 } },
  } as unknown as GameContext;
  const savedPose = { ...actionPose };
  const savedHints = { ...cameraHints };
  const damaged = vi.fn();
  events.on('player:damaged', damaged);
  combat.init(ctx);
  const tick = (frames = 1) => {
    for (let i = 0; i < frames; i++) {
      combat.update(PLAYER_DT);
      input.endStep();
      loop.tick++;
      loop.time += PLAYER_DT;
    }
  };
  const dispose = () => {
    combat.dispose();
    input.dispose();
    Object.assign(cameraHints, savedHints);
    Object.assign(actionPose, savedPose);
  };
  return { canvas, doc, win, input, player, events, settings, camera, kq, damaged, tick, dispose };
}

it('plays hit shake in normal motion and leaves the camera still during the same hit with reduced motion', () => {
  const { player, events, settings, camera, kq, damaged, dispose } = combatFixture();
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
    dispose();
  }
});

it.each(['Pause unlock', 'browser blur'] as const)('discards a held mouse attack after %s without a mouseup', (cancel) => {
  const { canvas, doc, win, input, kq, player, tick, dispose } = combatFixture();
  try {
    doc.pointerLockElement = canvas;
    doc.dispatchEvent(new Event('pointerlockchange'));
    canvas.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0 }));
    tick(50);
    combat.frame(PLAYER_DT);
    expect(actionPose.charge).toBeGreaterThan(0);
    expect(player.moveScale).toBeLessThan(1);
    const stamina = kq.combat!.state().stamina;

    if (cancel === 'Pause unlock') {
      // The paused loop does not update while the menu releases the pointer lock.
      input.enabled = false;
      input.releaseLock();
      expect(doc.exitPointerLock).toHaveBeenCalledOnce();
      doc.pointerLockElement = null;
      doc.dispatchEvent(new Event('pointerlockchange'));
      // Closing Pause with the keyboard can resume play before the pointer is locked again.
      input.enabled = true;
      expect(input.locked).toBe(false);
    } else {
      win.dispatchEvent(new Event('blur'));
    }
    expect(input.isDown('attack')).toBe(false);
    tick();
    combat.frame(PLAYER_DT);
    expect.soft(actionPose.charge).toBeNull();
    expect.soft(actionPose.swing).toBeNull();
    expect.soft(kq.combat!.state().stamina).toBe(stamina);
    expect(player.moveScale).toBe(1);

    // A new press and real release still fire a heavy attack.
    input.simulate('KeyK', true);
    tick(50);
    input.simulate('KeyK', false);
    tick();
    combat.frame(PLAYER_DT);
    expect(actionPose.swing?.kind).toBe('heavy');
    expect(kq.combat!.state().stamina).toBeLessThan(stamina);
  } finally {
    dispose();
  }
});
