/**
 * Playtest round 10, F-33: a person turns round to the player when a conversation opens (~0.4 s),
 * back to its idle heading afterwards; reduced motion snaps. The angle math (src/systems/npc/logic.ts).
 */
import { describe, expect, it } from 'vitest';
import { IDLE_TURN_S, TALK_TURN_S, approachYaw, shortestArc, yawToward } from '../src/systems/npc/logic';

const PI = Math.PI;
const deg = (d: number) => (d * PI) / 180;

/** Simulate a turn at 60 fps for `s` seconds. */
function turn(from: number, to: number, s: number, seconds: number, snap = false): number {
  let y = from;
  for (let i = 0; i < Math.round(s * 60); i++) y = approachYaw(y, to, 1 / 60, seconds, snap);
  return y;
}

describe('shortestArc', () => {
  it('takes the short way round and stays in [−π, π)', () => {
    expect(shortestArc(0, deg(90))).toBeCloseTo(deg(90));
    expect(shortestArc(deg(170), deg(-170))).toBeCloseTo(deg(20));
    expect(shortestArc(deg(-170), deg(170))).toBeCloseTo(deg(-20));
    expect(shortestArc(0, 4 * PI + deg(10))).toBeCloseTo(deg(10));
    expect(shortestArc(0, PI)).toBeCloseTo(-PI);
    for (let a = -10; a <= 10; a += 0.7) {
      const r = shortestArc(0.3, a);
      expect(r).toBeGreaterThanOrEqual(-PI);
      expect(r).toBeLessThan(PI);
    }
  });
});

describe('yawToward', () => {
  it('faces +z at yaw 0, +x at π/2 (the figure faces +z)', () => {
    expect(yawToward(0, 0, 0, 5)).toBeCloseTo(0);
    expect(yawToward(0, 0, 5, 0)).toBeCloseTo(PI / 2);
    expect(Math.abs(yawToward(10, 10, 10, 5))).toBeCloseTo(PI);
  });
});

describe('approachYaw', () => {
  it('turns round in ~0.4 s when a talk opens (95 % of the arc)', () => {
    expect(TALK_TURN_S).toBeGreaterThanOrEqual(0.3);
    expect(TALK_TURN_S).toBeLessThanOrEqual(0.5);
    // back to the player: 180° minus a little, so the arc has one short side
    const target = deg(175);
    const y = turn(0, target, TALK_TURN_S, TALK_TURN_S);
    expect(Math.abs(shortestArc(y, target))).toBeLessThan(deg(175) * 0.06);
    // half way there after a third of the time (not a snap)
    expect(Math.abs(shortestArc(turn(0, target, TALK_TURN_S / 6, TALK_TURN_S), target))).toBeGreaterThan(deg(60));
  });

  it('crosses ±π along the short side, never the long way', () => {
    let y = deg(170);
    const target = deg(-170);
    for (let i = 0; i < 60; i++) {
      y = approachYaw(y, target, 1 / 60, TALK_TURN_S);
      // always within the 20° wedge around the back, never through 0
      expect(Math.abs(shortestArc(y, PI))).toBeLessThanOrEqual(deg(10) + 1e-9);
    }
    expect(shortestArc(y, target)).toBeCloseTo(0, 3);
  });

  it('is frame-rate independent', () => {
    let a = 0;
    let b = 0;
    for (let i = 0; i < 30; i++) a = approachYaw(a, 1.5, 1 / 30, TALK_TURN_S);
    for (let i = 0; i < 144; i++) b = approachYaw(b, 1.5, 1 / 144, TALK_TURN_S);
    expect(a).toBeCloseTo(b, 6);
  });

  it('reduced motion (or no time) snaps; dt 0 holds still', () => {
    expect(approachYaw(0, 2, 1 / 60, TALK_TURN_S, true)).toBeCloseTo(2);
    expect(approachYaw(0, 2, 1 / 60, 0)).toBeCloseTo(2);
    expect(approachYaw(0.5, 2, 0, TALK_TURN_S)).toBeCloseTo(0.5);
  });

  it('goes back to the idle heading after the talk', () => {
    const idle = deg(-90);
    const y = turn(deg(120), idle, IDLE_TURN_S * 1.5, IDLE_TURN_S);
    expect(Math.abs(shortestArc(y, idle))).toBeLessThan(deg(2));
  });
});
