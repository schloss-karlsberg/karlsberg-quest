import { afterEach, expect, it, vi } from 'vitest';
import { playerFixture } from './player-fixture';

afterEach(() => vi.unstubAllGlobals());

it('holds the spirit view in place while movement is frozen and resumes the climb afterward', () => {
  const { player, input, step } = playerFixture();
  player.setFlying(true);
  input.press('forward', true);
  input.press('sprint', true);
  step(45);
  const before = player.position.clone();
  expect(before.z).toBeLessThan(-40);
  player.frozen = true;
  input.press('up', true);
  input.addLook(20, 10);
  player.look();
  expect(player.yaw).toBeCloseTo(-0.044);
  expect(player.pitch).toBeCloseTo(-0.022);
  step(90);
  input.press('forward', false);
  input.press('sprint', false);
  input.press('up', false);
  step(90);
  expect(player.position.toArray()).toEqual(before.toArray());
  expect(player.stats.speed).toBe(0);
  expect(player.flying).toBe(true);
  player.frozen = false;
  step();
  expect.soft(player.position.x).toBe(before.x);
  expect.soft(player.position.z).toBe(before.z);
  expect.soft(player.position.y).toBeGreaterThan(before.y);
  step(120);
  expect.soft(player.position.x).toBe(before.x);
  expect(player.position.z).toBe(before.z);
});
