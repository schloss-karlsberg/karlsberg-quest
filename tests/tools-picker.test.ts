import { BoxGeometry, Group, Mesh, Scene } from 'three';
import { expect, it } from 'vitest';
import type { GameContext } from '../src/core/context';
import { heightProfile, measure, profileStats } from '../src/systems/tools/geom';
import { Picker } from '../src/systems/tools/picker';

function groundPicker() {
  const scene = new Scene();
  const ctx = {
    scene, era: { current: 'today' },
    world: { heightfield: { heightAt: () => 0 } },
  } as unknown as GameContext;
  return { picker: new Picker(ctx), scene };
}

const down = { x: 0, y: -1, z: 0 };

it('can place the tape on terrain at its range limit, including the final partial ray step', () => {
  const { picker } = groundPicker();
  const origin = { x: 4, y: 600, z: 8 };
  expect(picker.pick(origin, down, 599.99)).toBeNull();
  const hit = picker.pick(origin, down);
  expect(hit?.point).toEqual({ x: 4, y: 0, z: 8 });
  expect(hit?.distance).toBeCloseTo(600, 5);
  expect(picker.pick({ ...origin, y: 0.1 }, down, 0.2)?.distance).toBeCloseTo(0.1, 5);
});

it('selects the nearest visible measurable surface before the terrain', () => {
  const { picker, scene } = groundPicker();
  const parent = new Group();
  const target = new Mesh(new BoxGeometry(2, 2, 2));
  target.position.y = 4;
  parent.add(target);
  scene.add(parent);
  scene.updateMatrixWorld(true);
  const origin = { x: 0, y: 10, z: 0 };
  expect(picker.pick(origin, down)?.on).toBe('terrain');
  target.userData.measurable = true;
  expect(picker.pick(origin, down)).toMatchObject({ on: 'object', distance: 5, point: { x: 0, y: 5, z: 0 } });
  parent.visible = false;
  expect(picker.pick(origin, down)?.on).toBe('terrain');
});

it('measures vertical and coincident endpoints without an infinite grade or invented climb', () => {
  const a = { x: 1, y: 4, z: 2 };
  const b = { ...a, y: -2 };
  expect(measure(a, b)).toEqual({ distance: 6, horizontal: 0, rise: -6, grade: 0 });
  expect(measure(a, a)).toEqual({ distance: 0, horizontal: 0, rise: 0, grade: 0 });
  const profile = heightProfile(a, b, () => 7, 0);
  expect(profile).toEqual([{ s: 0, h: 7 }, { s: 0, h: 7 }]);
  expect(profileStats(profile)).toEqual({ min: 7, max: 7, climb: 0, descent: 0 });
});
