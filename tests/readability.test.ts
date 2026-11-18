import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { bodyTemplate } from '../src/systems/combat/bodies';
import { placeNumber } from '../src/systems/combat/hud';
import type { Enemy } from '../src/systems/combat/sim';
import { hullDistance, hullOf, occlusionVis } from '../src/systems/combat/visuals';

/** Round 6 readability: numbers beside the target, bodies in the lens dither, the camera's hull test. */
describe('damage numbers keep beside the target', () => {
  const base = { cy: 360, topY: 250, baseY: 470, t: 0.2, lift: 6, W: 1280, H: 720, floor: 24, w: 40 };
  it('sits outside the projected body, on the side its drift picked', () => {
    for (const side of [-1, 1]) {
      const q = placeNumber({ ...base, cx: 640, half: 80, side });
      expect(Math.abs(q.x - 640)).toBeGreaterThan(80 + 20);
      expect(Math.sign(q.x - 640)).toBe(side);
    }
  });
  it('switches sides at the screen edge and stays on screen', () => {
    const q = placeNumber({ ...base, cx: 1230, half: 60, side: 1 });
    expect(q.x).toBeLessThan(1230 - 60);
    expect(q.x).toBeGreaterThan(0);
  });
  it('a body filling the view: the number goes above its crown, below the boss bar', () => {
    const q = placeNumber({ ...base, cx: 640, half: 900, side: 1, topY: 200, floor: 140 });
    expect(q.y).toBeLessThanOrEqual(200);
    expect(q.y).toBeGreaterThanOrEqual(140);
    expect(q.x).toBeLessThanOrEqual(1280 - 28);
  });
});

function enemy(kind: string, o: Partial<Enemy> = {}): Enemy {
  return { id: 'e1', kind, x: 0, y: 0, z: 0, heading: 0, radius: 0.95, ...o } as Enemy;
}

describe('bodies in the way of the lens', () => {
  const st = bodyTemplate('steinbrecher', 0.4, 1);
  const hull = hullOf(st);
  it('the hull covers the arms and is wider than the collision radius of a small foe', () => {
    const sf = hullOf(bodyTemplate('steinfresser', 0.2, 1));
    expect(Math.max(sf.r, sf.f)).toBeGreaterThan(0.95);
    expect(Math.max(hull.r, hull.f)).toBeGreaterThan(2.5);
  });
  it('hullDistance: < 1 inside, > 1 outside, in the body frame', () => {
    const e = enemy('steinbrecher', { radius: 3.2, heading: 0.7 });
    expect(hullDistance(e, hull, 0.5, 0.2)).toBeLessThan(1);
    expect(hullDistance(e, hull, 9, 0)).toBeGreaterThan(1);
  });
  it('a camera wedged into a big body dithers it; one outside does not', () => {
    const e = enemy('steinfresser');
    const v = { hull: hullOf(bodyTemplate('steinfresser', 0.2, 1)), t: { top: 2.2 } };
    const cam = new PerspectiveCamera();
    cam.position.set(0.3, 1.6, 0.2);
    expect(occlusionVis(e, v, { camera: cam })).toBeLessThan(0.5);
    cam.position.set(4, 1.6, 0);
    expect(occlusionVis(e, v, { camera: cam })).toBe(1);
  });
  it('a body between the reveal camera and the boss thins; the boss itself does not', () => {
    const e = enemy('streuner', { x: 0, z: -5, radius: 0.55 });
    const v = { hull: hullOf(bodyTemplate('streuner', 0.2, 1)), t: { top: 1.35 } };
    const cam = new PerspectiveCamera();
    cam.position.set(0, 1.6, 0);
    const focus = [{ x: 0, y: 2, z: -12, id: 'boss' }];
    expect(occlusionVis(e, v, { camera: cam, focus })).toBeLessThan(0.6);
    expect(occlusionVis({ ...e, id: 'boss' } as Enemy, v, { camera: cam, focus })).toBe(1);
    // beside the line: untouched
    expect(occlusionVis({ ...e, x: 6 } as Enemy, v, { camera: cam, focus })).toBe(1);
  });
});
