import { PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, DEFAULT_SPAWN } from '../src/core/state';
import { PITCH_MAX_3P, PITCH_REST_3P } from '../src/player/camera';
import { STANCES } from '../src/player/stance';
import { PLAYER_DT, playerFixture } from './player-fixture';

afterEach(() => vi.unstubAllGlobals());

describe('player placement and simulation', () => {
  it('grounds the initial pose and uses the clamped destination for a respawn teleport', () => {
    const { player, events, step } = playerFixture({
      heightAt: (x, z) => (x - z) / 100,
    });
    const teleported = vi.fn();
    events.on('player:teleport', teleported);
    player.readState(createInitialState().player);
    expect(player.position.toArray()).toEqual([DEFAULT_SPAWN.x, 22.58, DEFAULT_SPAWN.z]);
    expect(player.yaw).toBe(DEFAULT_SPAWN.yaw);
    expect(player.stance).toBe('stand');

    player.impulse(10, 0, 1);
    player.teleport(3000, -3000, 0.75);
    expect(teleported).toHaveBeenLastCalledWith({ x: 2000, z: -2000 });
    expect(player.pushed).toBe(false);
    expect(player.yaw).toBe(0.75);
    player.cameraMode = 'first';
    const camera = new PerspectiveCamera();
    player.applyCamera(camera, 0, PLAYER_DT);
    expect(player.renderPos.toArray()).toEqual([2000, 40, -2000]);
    expect(camera.position.toArray()).toEqual([2000, 41.65, -2000]);
    step();
    expect(player.stats.speed).toBe(0);
  });

  it('resumes a mid-climb save at the terrain height with the saved facing and a level third-person view', () => {
    const { player, input, step } = playerFixture({ heightAt: () => 12 });
    player.teleport(6, -7, 0.6);
    input.press('fly', true);
    input.press('up', true);
    step(30);
    expect(player.position.y).toBeGreaterThan(20);
    expect(player.flying).toBe(true);
    player.pitch = 1;
    const saved = createInitialState().player;
    player.writeState(saved);
    expect(saved).toMatchObject({ flying: true, pitch: 1 });
    input.press('fly', false);
    input.press('up', false);

    player.readState(saved);
    expect(player.position.toArray()).toEqual([6, 12, -7]);
    expect(player.flying).toBe(false);
    expect(player.pitch).toBe(PITCH_REST_3P);
    expect(player.yaw).toBe(0.6);
    step(30);
    expect(player.position.y).toBe(12);
  });

  it.each(['teleport', 'reload'] as const)('restarts footstep distance and eye bob on %s', (arrival) => {
    const { player, input, events, step } = playerFixture();
    const footstep = vi.fn();
    events.on('player:step', footstep);
    const camera = new PerspectiveCamera();
    player.cameraMode = 'first';
    input.press('forward', true);
    step(14);
    expect(footstep).not.toHaveBeenCalled();
    player.applyCamera(camera, 1, PLAYER_DT);
    expect(Math.abs(camera.position.y - player.eyeHeight)).toBeGreaterThan(0.005);

    if (arrival === 'reload') player.readState({ ...createInitialState().player, x: 10, z: 10, yaw: 0 });
    else player.teleport(10, 10);
    player.applyCamera(camera, 0.5, PLAYER_DT);
    expect.soft(camera.position.y).toBe(player.eyeHeight);
    step(2);
    expect(footstep).not.toHaveBeenCalled();
    step(14);
    expect(footstep).toHaveBeenCalledTimes(1);
    expect(footstep).toHaveBeenCalledWith(expect.objectContaining({ x: 10, surface: 'grass', running: false }));
  });

  it('leaves spirit view when the new era forbids it and runs from the new ground', () => {
    let past = false;
    const { player, input, events, step } = playerFixture({
      canFly: () => !past,
      heightAt: () => past ? 8 : 0,
    });
    const flew = vi.fn();
    const toast = vi.fn();
    events.on('player:fly', flew);
    events.on('ui:toast', toast);
    player.setStance('prone');
    player.setFlying(true);
    input.press('sprint', true);
    input.press('forward', true);
    step(25);
    expect(player.stance).toBe('stand');
    expect(player.stats.speed).toBeGreaterThan(STANCES.stand.sprint);
    expect(player.position.y).toBeGreaterThan(8);

    // The era adapter lands the player before re-grounding the pose.
    past = true;
    player.setFlying(false);
    player.teleport(7, 3);
    step();
    expect(player.position.y).toBe(8);
    expect(player.position.z).toBeCloseTo(3 - STANCES.stand.sprint * PLAYER_DT);
    expect(player.stats.speed).toBeCloseTo(STANCES.stand.sprint);
    expect(flew.mock.calls).toEqual([[{ flying: true }], [{ flying: false }]]);
    player.setFlying(true);
    expect(player.flying).toBe(false);
    expect(toast).toHaveBeenCalledWith({ text: 'toast.noSpirit' });
  });

  it('carries a crouched save through reload and uses the up press to stand on foot', () => {
    const { player, input, events, step } = playerFixture();
    const changed = vi.fn();
    events.on('player:stance', changed);
    player.cameraMode = 'first';
    player.readState({ ...createInitialState().player, x: 0, z: 0, stance: 'crouch', pitch: 1.2 });
    expect(player.eyeHeight).toBe(STANCES.crouch.eye);
    expect(player.pitch).toBe(0.4);
    input.press('sprint', true);
    input.press('forward', true);
    step();
    expect(player.stats.speed).toBeCloseTo(STANCES.crouch.speed);
    input.press('up', true);
    step();
    expect(player.stance).toBe('stand');
    expect(player.position.y).toBe(0);
    expect(changed.mock.calls).toEqual([[{ stance: 'stand', previous: 'crouch' }]]);
    expect(player.stats.speed).toBeCloseTo(STANCES.stand.sprint);
    player.canSprint = false;
    step();
    expect(player.stats.speed).toBeCloseTo(STANCES.stand.speed);
  });

  it('keeps diagonal speed bounded and slides along an uphill slope limit', () => {
    const { player, input, step } = playerFixture({ heightAt: (x) => 2 * x });
    player.teleport(0, 0);
    input.press('forward', true);
    input.press('left', true);
    step();
    expect(player.stats.speed).toBeCloseTo(STANCES.stand.speed);
    expect(player.stats.onSlopeLimit).toBe(false);

    player.teleport(0, 0);
    input.press('left', false);
    input.press('right', true);
    step();
    expect(player.position.x).toBe(0);
    expect(player.position.z).toBeLessThan(0);
    expect(player.stats.onSlopeLimit).toBe(true);
  });
});

describe('player look and camera follow', () => {
  it('interpolates horizontal follow from the last fixed step before placing the third-person boom', () => {
    const { player, input, step } = playerFixture();
    const camera = new PerspectiveCamera();
    player.teleport(4, 5);
    input.press('forward', true);
    step();
    player.applyCamera(camera, 0, PLAYER_DT);
    const start = camera.position.clone();
    player.applyCamera(camera, 0.5, PLAYER_DT);
    const move = STANCES.stand.speed * PLAYER_DT;
    expect(player.renderPos.z).toBeCloseTo(5 - move / 2);
    expect(camera.position.x).toBeCloseTo(start.x);
    expect(camera.position.z).toBeCloseTo(start.z - move / 2);
    player.applyCamera(camera, 1, PLAYER_DT);
    expect(camera.position.z).toBeCloseTo(start.z - move);
  });

  it('clamps drag pitch and only self-levels after unopposed third-person walking', () => {
    const { player, input, step } = playerFixture();
    input.addLook(0, -2000);
    player.look();
    expect(player.pitch).toBe(PITCH_MAX_3P);
    step(90);
    expect(player.pitch).toBe(PITCH_MAX_3P);
    input.press('forward', true);
    player.lookLocked = true;
    input.addLook(40, 30);
    input.press('lookRight', true);
    player.look();
    step(90);
    expect(player.yaw).toBe(0);
    expect(player.pitch).toBe(PITCH_MAX_3P);

    player.lookLocked = false;
    input.press('lookRight', false);
    player.look();
    step(60);
    expect(player.yaw).toBe(0);
    expect(player.pitch).toBeLessThan(PITCH_MAX_3P);
    expect(player.pitch).toBeGreaterThan(PITCH_REST_3P);
  });

  it('suppresses walking bob as soon as reduced motion is enabled and keeps tracking the feet', () => {
    const { player, input, step } = playerFixture();
    const camera = new PerspectiveCamera();
    player.cameraMode = 'first';
    input.press('forward', true);
    step(3);
    player.applyCamera(camera, 1, PLAYER_DT);
    expect(Math.abs(camera.position.y - player.eyeHeight)).toBeGreaterThan(0.01);

    player.reducedMotion = true;
    step(3);
    player.applyCamera(camera, 0.5, PLAYER_DT);
    expect(camera.position.y).toBe(player.renderPos.y + player.eyeHeight);
    expect(camera.position.z).toBe(player.renderPos.z);
    expect(camera.position.z).toBeLessThan(-3 * STANCES.stand.speed * PLAYER_DT);
  });
});
