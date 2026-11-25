import { CylinderGeometry } from 'three';
import { SURF } from '../../world/surfaces';
import type { SetDef } from './sets';

// The old field-station site below the dam. The door faces the forest path to the south.
export const BAUWAGEN_SITE = { x: 760, z: -915, clearing: 6.5 } as const;
const LENGTH = 7.2;
const WIDTH = 2.5;
const FLOOR = 0.78;
const WALL = 2.15;
const DOOR_X = 0.6;
const DOOR_Z = WIDTH / 2 + 0.13;
export const BAUWAGEN_DOOR = { x: BAUWAGEN_SITE.x + DOOR_X, z: BAUWAGEN_SITE.z + DOOR_Z } as const;

/** The original green trailer, as a single static set on every graphics profile. */
export const BAUWAGEN_SET: SetDef = {
  id: 'bauwagen', eras: ['today'], x: BAUWAGEN_SITE.x, z: BAUWAGEN_SITE.z, range: 50,
  build(b) {
    const { x, z } = BAUWAGEN_SITE;
    const k = b.kit;
    const base = b.heightAt(x, z) - 0.08;
    k.place(x, base, z);

    const steel = 0x393530;
    const frame = 0x4e3928;
    const boards = 0x5c7050;
    const roofY = FLOOR + WALL;

    k.surface = SURF.IRON;
    k.box(LENGTH + 0.1, 0.15, WIDTH - 0.2, 0, FLOOR - 0.15, 0, steel);
    for (const axle of [-2.2, 2.2]) {
      for (const side of [-1, 1]) {
        const wheelZ = side * 1.16;
        const ground = b.heightAt(x + axle, z + wheelZ) - base;
        k.pole(axle, ground + 0.4, wheelZ - 0.15, axle, ground + 0.4, wheelZ + 0.15, 0.42, 0x32302b, 12);
        k.pole(axle, ground + 0.4, wheelZ - 0.16, axle, ground + 0.4, wheelZ + 0.16, 0.23, 0x793d32, 10);
      }
    }
    for (const side of [-1, 1]) k.beam(-3.5, 0.66, side * 0.65, -5.25, 0.61, 0, 0.09, steel);
    k.cyl(0.1, 0.1, 0.06, -5.28, 0.59, 0, steel);

    k.surface = SURF.PAINTED;
    k.box(LENGTH, WALL, WIDTH, 0, FLOOR, 0, boards);
    for (const side of [-1, 1]) {
      k.box(LENGTH + 0.12, 0.12, 0.07, 0, FLOOR, side * 1.27, frame);
      for (const dx of [-3.56, -2.7, -1.8, -0.9, 0, 1.8, 2.7, 3.56]) {
        k.box(0.06, WALL, 0.055, dx, FLOOR, side * 1.265, 0x49583e);
      }
    }

    k.surface = SURF.IRON;
    const roof = new CylinderGeometry(1.43, 1.43, LENGTH + 0.45, 16, 1, false, 0, Math.PI);
    roof.rotateZ(Math.PI / 2).scale(1, 0.32, 1).translate(0, roofY, 0);
    k.add(roof, 0x4b4943);
    k.cyl(0.08, 0.08, 0.75, -2.4, roofY + 0.26, -0.4, steel);
    k.cyl(0.16, 0.08, 0.1, -2.4, roofY + 1.01, -0.4, steel);

    k.surface = SURF.PLANKS;
    k.box(1.07, 2, 0.09, DOOR_X, FLOOR, 1.28, frame);
    k.box(0.91, 1.87, 0.07, DOOR_X, FLOOR + 0.04, 1.32, 0x7d5c3e);
    k.box(0.09, 0.06, 0.07, DOOR_X + 0.33, FLOOR + 0.9, 1.39, 0xa18653);
    k.box(1.1, 0.09, 0.34, DOOR_X, FLOOR - 0.28, 1.59, frame);
    k.box(1.1, 0.09, 0.34, DOOR_X, FLOOR - 0.56, 1.91, frame);
    k.beam(0.12, FLOOR - 0.06, 1.28, 0.12, 0.12, 2.03, 0.1, frame);
    k.beam(1.08, FLOOR - 0.06, 1.28, 1.08, 0.12, 2.03, 0.1, frame);

    for (const [dx, side] of [[-1.9, 1], [2.35, 1], [-1.5, -1], [1.6, -1]] as const) {
      k.box(1.16, 0.83, 0.09, dx, FLOOR + 0.89, side * 1.28, frame);
      k.surface = SURF.NONE;
      k.box(1, 0.68, 0.03, dx, FLOOR + 0.96, side * 1.335, 0xa28356);
      k.surface = SURF.PLANKS;
      k.box(0.045, 0.72, 0.035, dx, FLOOR + 0.94, side * 1.365, frame);
      k.box(1.25, 0.06, 0.17, dx, FLOOR + 0.89, side * 1.32, frame);
    }
    // A scrap of paper tucked behind the door's wooden crossbar.
    k.surface = SURF.NONE;
    k.box(0.22, 0.26, 0.018, DOOR_X - 0.17, FLOOR + 1.08, DOOR_Z, 0xd4c29a, [0, 0, -0.09]);
    k.surface = SURF.PLANKS;
    k.box(0.88, 0.08, 0.055, DOOR_X, FLOOR + 1.04, DOOR_Z, frame);

    b.box(x, z, 180, LENGTH / 2 + 0.1, WIDTH / 2 + 0.12);
  },
};
