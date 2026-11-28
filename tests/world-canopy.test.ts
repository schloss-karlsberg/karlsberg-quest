import { PerspectiveCamera, Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { atmosphere } from '../src/world/atmosphere';
import { World, canopyHaze } from '../src/world/world';

/**
 * `World.frame` on a stand-in world whose tree cover is closed east of x = 0 and open west of it
 * (a forest edge along a path), everything else switched off.
 */
function edgeWorld() {
  const noop = () => {};
  return {
    heightAt: () => 300,
    coverAt: (x: number) => (x > 0 ? 1 : 0),
    terrain: { uniforms: { uScanMix: { value: 0 }, uMapMix: { value: 0 } }, update: noop },
    scanTarget: 0,
    mapTarget: 0,
    sky: { follow: noop, uniforms: { uGlowDir: { value: new Vector3() } } },
    forest: { update: noop },
    nature: { frame: noop },
    water: { frame: noop },
  };
}

/** The over-the-shoulder lens: 3.6 m behind the character at (px, pz), 2 m up, looking along yaw. */
function lens(px: number, pz: number, yawDeg: number): PerspectiveCamera {
  const a = (yawDeg * Math.PI) / 180;
  const c = new PerspectiveCamera(70, 16 / 9, 0.1, 3000);
  c.position.set(px - Math.sin(a) * 3.6, 302, pz + Math.cos(a) * 3.6);
  return c;
}

/** The haze after the view has rested (ten seconds of frames: it eases in over about one). */
function settle(world: ReturnType<typeof edgeWorld>, camera: PerspectiveCamera, stand?: { x: number; z: number } | null): number {
  for (let i = 0; i < 600; i++) World.prototype.frame.call(world as unknown as World, camera, 1 / 60, i / 60, stand);
  return atmosphere.uUnderCanopy.value;
}

describe('haze under the canopy', () => {
  beforeEach(() => void (atmosphere.uUnderCanopy.value = 0));

  it('open ground keeps a share, closed cover is full, a high lens has none', () => {
    expect(canopyHaze(0, 2)).toBeCloseTo(0.45, 6);
    expect(canopyHaze(1, 2)).toBe(1);
    expect(canopyHaze(1, 8)).toBe(1);
    expect(canopyHaze(1, 15)).toBeCloseTo(0.5, 6);
    expect(canopyHaze(1, 30)).toBe(0);
  });

  it('a turn on the spot does not change it: it is taken where the character stands', () => {
    const world = edgeWorld();
    // on the path, a metre from the forest edge: the lens swings into the trees and out again
    const stand = { x: -1, z: 0 };
    const values = [0, 90, 180, 270].map((yaw) => settle(world, lens(stand.x, stand.z, yaw), stand));
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(1e-6);
    expect(values[0]).toBeCloseTo(0.45, 3);
  });

  it('without a character to circle (a cut-scene camera, first person) it is taken under the lens', () => {
    const world = edgeWorld();
    // facing west the lens is 3.6 m east of the character: under the trees
    expect(settle(world, lens(-1, 0, 270), null)).toBeCloseTo(1, 3);
    expect(settle(world, lens(-1, 0, 90))).toBeCloseTo(0.45, 3);
  });

  it('walking under the trees still brings the haze, eased in', () => {
    const world = edgeWorld();
    const camera = lens(-1, 0, 0);
    settle(world, camera, { x: -1, z: 0 });
    World.prototype.frame.call(world as unknown as World, camera, 1 / 60, 0, { x: 2, z: 0 });
    const first = atmosphere.uUnderCanopy.value;
    expect(first).toBeGreaterThan(0.45);
    expect(first).toBeLessThan(0.5);
    expect(settle(world, camera, { x: 2, z: 0 })).toBeCloseTo(1, 3);
  });
});
