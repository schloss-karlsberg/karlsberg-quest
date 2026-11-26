import { afterEach, expect, it, vi } from 'vitest';
import { playerFixture } from './player-fixture';

afterEach(() => vi.unstubAllGlobals());

it('holds the spirit view in place while movement is frozen and resumes the climb afterward', () => {
  const { player, input, step } = playerFixture();
  player.setFlying(true);
  input.press('forward', true);
  step(15);
  const before = player.position.clone();
  player.frozen = true;
  input.press('up', true);
  input.addLook(20, 10);
  player.look();
  expect(player.yaw).toBeCloseTo(-0.044);
  expect(player.pitch).toBeCloseTo(-0.022);
  step(20);
  expect(player.position.toArray()).toEqual(before.toArray());
  expect(player.stats.speed).toBe(0);
  expect(player.flying).toBe(true);
  player.frozen = false;
  step();
  expect(player.position.y).toBeGreaterThan(before.y);
  expect(player.position.z).toBeLessThan(before.z);
});
