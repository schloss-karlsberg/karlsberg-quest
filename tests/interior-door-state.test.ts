import { describe, expect, it } from 'vitest';
import { PlanQuery } from '../src/systems/interiors/collide';
import { buildPlan } from '../src/systems/interiors/layout';
import type { Wall } from '../src/systems/interiors/types';
import { loadPalaceData } from './interiors-fixture';

const { rooms, footprints, h1789 } = loadPalaceData();
const plan = buildPlan({ rooms, footprints, mode: 'intact', terrain: (x, z) => h1789.heightAt(x, z) });
const door = plan.doors.find(d => d.kind === 'inner')!;
const x = door.cx + door.nx * 0.05;
const z = door.cz + door.nz * 0.05;

describe('dynamic palace obstacles', () => {
  it('keeps a shared door blocked until both adjoining rooms are clear', () => {
    const query = new PlanQuery(plan);
    const blocked = () => query.resolve(x, z, 0.35, door.floor).hit;
    expect(blocked()).toBe(false);
    query.setRoomBlocked(door.a, true);
    query.setRoomBlocked(door.b, true);
    query.setRoomBlocked(door.b, true);
    expect(blocked()).toBe(true);
    query.setRoomBlocked(door.a, false);
    expect(blocked()).toBe(true);
    query.setRoomBlocked(door.b, false);
    expect(blocked()).toBe(false);
    query.setRoomBlocked(door.a, true);
    query.clearBlocks();
    query.setRoomBlocked(door.b, true);
    query.setRoomBlocked(door.b, false);
    expect(query.blocked.size).toBe(0);
    expect(blocked()).toBe(false);
  });

  it('only collides with furniture at body height and removes it with its building', () => {
    const query = new PlanQuery(plan);
    const wall: Wall = { ax: -2, bx: 2, az: 0, bz: 0, y0: 4, y1: 5, kind: 'block', building: 'west' };
    query.setSolids('west', [wall]);
    query.setSolids('east', [{ ...wall, building: 'east', az: 9, bz: 9 }]);
    expect(query.resolve(0, 0, 0.3, 0).hit).toBe(false);
    expect(query.resolve(0, 0, 0.3, 4)).toEqual({ x: 0, z: 0.3, hit: true });
    query.setSolids('west', []);
    expect(query.hits(0, 0, 0.3, 4, 5)).toBe(false);
    expect(query.hits(0, 9, 0.3, 4, 5)).toBe(true);
    query.clearSolids();
    expect(query.hits(0, 9, 0.3, 4, 5)).toBe(false);
  });
});
