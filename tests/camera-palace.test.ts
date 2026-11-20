import { PerspectiveCamera } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { CameraRig, type CameraWorld } from '../src/player/camera';
import { PlanQuery } from '../src/systems/interiors/collide';
import { type FullPlan, buildPlan } from '../src/systems/interiors/layout';
import { loadPalaceData } from './interiors-fixture';

/**
 * Playtest round 10, F-35 / F-31: the third-person camera against the real 1789 palace plan —
 * the Küchenhof by the Nordflügel's Durchfahrt stoop, and the Registratur.
 */
const d = loadPalaceData();
const t89 = (x: number, z: number) => d.h1789.heightAt(x, z);
let plan: FullPlan;
let q: PlanQuery;

beforeAll(() => {
  plan = buildPlan({ rooms: d.rooms, footprints: d.footprints, mode: 'intact', terrain: t89 });
  q = new PlanQuery(plan);
});

/** The camera world the game wires in boot.ts, on the plan alone (walls, spaces, ceilings, floors). */
function world(feet: () => number): CameraWorld {
  return {
    heightAt: (x, z, y) => q.floorAt(x, z, y ?? feet(), t89(x, z)) ?? t89(x, z),
    blocked: (x, z, r) => q.hits(x, z, r, feet() + 0.45, feet() + 3.4),
    ceiling: (x, z, y) => {
      const ri = q.roomAt(x, z, y);
      return ri < 0 ? null : plan.rooms[ri]!.ceiling;
    },
    space: (x, z, y) => q.spaceAt(x, z, y),
  };
}

describe('camera against the palace plan (round 10)', () => {
  it('spaceAt: the Küchenhof is outdoors, the Registratur a room, the Durchfahrt door reveal neither', () => {
    expect(q.spaceAt(1212, -1166, t89(1212, -1166))).toBe(-1);
    const reg = plan.rooms.find((r) => r.roomId === 'B03.1.eg-registratur')!;
    expect(q.spaceAt(reg.cx, reg.cz, reg.floor)).toBe(reg.index);
    const door = plan.doors.find((x) => x.kind === 'outer' && Math.hypot(x.cx - 1218.15, x.cz + 1159.1) < 1.5)!;
    expect(door).toBeTruthy();
    const mid = { x: door.cx + door.nx * (door.depth / 2), z: door.cz + door.nz * (door.depth / 2) };
    expect([-2, ...plan.rooms.filter((r) => r.building === 'KB-B03').map((r) => r.index)]).toContain(q.spaceAt(mid.x, mid.z, door.floor));
  });

  it('F-35: in the Küchenhof by the Nordflügel stairs the lens never ends up inside the wing', () => {
    for (const at of [
      { x: 1213, z: -1161.5 },
      { x: 1216, z: -1162.5 },
      { x: 1210, z: -1160.5 },
      { x: 1218, z: -1163 },
    ]) {
      const feet = t89(at.x, at.z);
      const w = world(() => feet);
      for (let deg = 0; deg < 360; deg += 30) {
        const rig = new CameraRig();
        rig.zoom = 6;
        const cam = new PerspectiveCamera(70, 16 / 9, 0.2, 1000);
        const yaw = (deg * Math.PI) / 180;
        // a fight's pull-back and lift on top
        const fight = { fight: [{ x: at.x - Math.sin(yaw) * 5, z: at.z - Math.cos(yaw) * 5, r: 0.6, top: 1.2 }], focus: null, boss: 0 };
        for (let i = 0; i < 200; i++) rig.update(cam, { x: at.x, y: feet, z: at.z, eye: 1.65, yaw, pitch: -0.25, dt: 1 / 60, reducedMotion: false, flying: false }, w, fight);
        expect(q.spaceAt(cam.position.x, cam.position.z, feet), `lens at yaw ${deg}° from ${at.x}/${at.z}`).toBe(-1);
        expect(cam.position.y).toBeGreaterThan(w.heightAt(cam.position.x, cam.position.z, feet) + 0.25);
      }
    }
  });

  it('F-31: in the Registratur the lens stays in the room, closer and higher', () => {
    const reg = plan.rooms.find((r) => r.roomId === 'B03.1.eg-registratur')!;
    const w = world(() => reg.floor);
    for (let deg = 0; deg < 360; deg += 45) {
      const rig = new CameraRig();
      const cam = new PerspectiveCamera(70, 16 / 9, 0.2, 1000);
      const yaw = (deg * Math.PI) / 180;
      for (let i = 0; i < 200; i++) rig.update(cam, { x: reg.cx, y: reg.floor, z: reg.cz, eye: 1.65, yaw, pitch: -0.21, dt: 1 / 60, reducedMotion: false, flying: false }, w, { fight: [], focus: null, boss: 0 });
      expect(q.spaceAt(cam.position.x, cam.position.z, reg.floor)).toBe(reg.index);
      expect(cam.position.y).toBeLessThan(reg.ceiling);
      expect(rig.debug.indoor).toBeGreaterThan(0.95);
      expect(rig.debug.head).toBeGreaterThan(0.8);
    }
  });
});
