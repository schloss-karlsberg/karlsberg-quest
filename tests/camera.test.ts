import { PerspectiveCamera, Vector3, Vector4 } from 'three';
import { describe, expect, it } from 'vitest';
import { BOOM_MIN, CameraRig, type CameraHints, type CameraWorld, CRANE_MAX, INDOOR_BOOM, NEAR_COMFORT, RISE_MAX, ZOOM_MAX, ZOOM_MIN, frameTilt, squeezeRise, twoShot } from '../src/player/camera';
import { CharacterFade, FADE_FIGHT_FLOOR, FADE_NEAR_MIN, FADE_TARGET, SEE_CONE, SEE_HALF, SEE_HALF_FIGHT, applySeeThrough, characterFadeWant, seeAmount } from '../src/player/seeThrough';
import { FootprintCollider } from '../src/world/collision';
import { clamp01, dirXZ, finite3, finiteOr, loop01, ribbonStep, safeDt, turnToward, usablePos } from '../src/player/guards';
import { lensVis } from '../src/systems/combat/visuals';
import { DEFAULT_BINDINGS, REBINDABLE } from '../src/player/input';
import { pickTarget, type TargetCandidate } from '../src/systems/combat/targeting';

const flat: CameraWorld = { heightAt: () => 0, blocked: () => false };
const noHints = (): CameraHints => ({ fight: [], focus: null, boss: 0 });
const input = (o: Partial<Parameters<CameraRig['update']>[1]> = {}) => ({ x: 0, y: 0, z: 0, eye: 1.65, yaw: 0, pitch: 0, dt: 1 / 60, reducedMotion: false, flying: false, ...o });

function settle(rig: CameraRig, cam: PerspectiveCamera, w: CameraWorld, o = input(), h = noHints(), n = 240): void {
  for (let i = 0; i < n; i++) rig.update(cam, o, w, h);
}

describe('third-person camera rig', () => {
  it('first person puts the camera at the eye', () => {
    const rig = new CameraRig();
    rig.mode = 'first';
    const cam = new PerspectiveCamera();
    expect(rig.update(cam, input({ x: 3, z: 4 }), flat, noHints())).toBe(false);
    expect(cam.position.toArray()).toEqual([3, 1.65, 4]);
    expect(rig.thirdPerson).toBe(false);
  });

  it('the spirit view is always first person', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera();
    expect(rig.update(cam, input({ flying: true }), flat, noHints())).toBe(false);
  });

  it('over the shoulder: behind the view, right of the head, at the zoom distance', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera();
    settle(rig, cam, flat);
    // yaw 0 looks to −z: behind is +z, the right shoulder is +x
    expect(cam.position.z).toBeGreaterThan(3);
    expect(cam.position.x).toBeGreaterThan(0.4);
    expect(cam.position.y).toBeGreaterThan(1.6);
    expect(rig.distance).toBeCloseTo(rig.zoom, 1);
  });

  it('a wall behind pulls the camera in, never through it', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera();
    const wall: CameraWorld = { heightAt: () => 0, blocked: (_x, z, r) => z + r > 1.5 };
    settle(rig, cam, wall);
    expect(cam.position.z).toBeLessThan(1.5);
    expect(rig.distance).toBeLessThan(2);
    expect(rig.distance).toBeGreaterThanOrEqual(BOOM_MIN);
  });

  it('a thin trunk on the boom does not pull the camera into the head (it dithers instead, round 10)', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera();
    const w: CameraWorld = { heightAt: () => 0, blocked: () => false, trunks: (_x, _z, _r, fn) => fn(0.55, 2.5, 0.35, 12) };
    settle(rig, cam, w);
    expect(rig.distance).toBeCloseTo(rig.zoom, 1);
    expect(cam.position.z).toBeGreaterThan(3);
  });

  it('rising ground behind lifts the camera above it', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera();
    const slope: CameraWorld = { heightAt: (_x, z) => Math.max(0, z) * 0.6, blocked: () => false };
    settle(rig, cam, slope, input({ pitch: 0.3 }));
    expect(cam.position.y).toBeGreaterThan(slope.heightAt(cam.position.x, cam.position.z) + 0.3);
  });

  it('indoors the camera stays under the ceiling', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera();
    const room: CameraWorld = { heightAt: () => 0, blocked: () => false, ceiling: () => 3 };
    settle(rig, cam, room, input({ pitch: -1.2 }));
    expect(cam.position.y).toBeLessThan(3);
  });

  it('a fight pulls the camera back and up so the enemies fit', () => {
    const cam = new PerspectiveCamera();
    const calm = new CameraRig();
    settle(calm, cam, flat);
    const d0 = calm.distance;
    const fight = new CameraRig();
    const h: CameraHints = { fight: [{ x: 6, z: -4, r: 0.6, top: 2 }, { x: -5, z: 2, r: 0.5, top: 1.5 }], focus: null, boss: 0 };
    settle(fight, cam, flat, input(), h);
    expect(fight.distance).toBeGreaterThan(d0 + 0.8);
  });

  it('a conversation turns the view onto the speaker', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera();
    const h: CameraHints = { fight: [], focus: { x: 4, y: 1.6, z: -2 }, boss: 0 };
    settle(rig, cam, flat, input(), h);
    const fwd = cam.getWorldDirection(cam.position.clone());
    const to = { x: 4 - cam.position.x, z: -2 - cam.position.z };
    const l = Math.hypot(to.x, to.z);
    expect((fwd.x * to.x + fwd.z * to.z) / (Math.hypot(fwd.x, fwd.z) * l)).toBeGreaterThan(0.98);
  });

  it('a wall right behind: the camera rises over the shoulder, the head stays in frame (F-07)', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera(70, 16 / 9, 0.2, 1000);
    const wall: CameraWorld = { heightAt: () => 0, blocked: (_x, z, r) => z + r > 0.75 };
    settle(rig, cam, wall, input({ pitch: -0.21 }));
    expect(rig.distance).toBeLessThan(NEAR_COMFORT);
    expect(rig.debug.rise).toBeGreaterThan(0.2);
    // lens over the head, not in it
    expect(cam.position.y).toBeGreaterThan(1.65 + 0.4);
    expect(rig.debug.head).toBeGreaterThan(0.8);
    cam.updateMatrixWorld();
    const head = new Vector3(0, 1.65, 0).project(cam);
    expect(head.z).toBeLessThan(1);
    expect(Math.abs(head.x)).toBeLessThan(0.95);
    expect(head.y).toBeGreaterThan(-0.95);
    expect(head.y).toBeLessThan(0.95);
  });

  it('rising ground behind (the hohe Stufe): the boom cranes up instead of shortening into the head (F-07)', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera(70, 16 / 9, 0.2, 1000);
    // 40° rising behind the player (+z), flat in front
    const step: CameraWorld = { heightAt: (_x, z) => Math.max(0, z - 0.5) * 0.84, blocked: () => false };
    settle(rig, cam, step, input({ pitch: -0.21 }));
    expect(rig.distance).toBeGreaterThan(2.5);
    expect(rig.debug.crane).toBeGreaterThan(0.3);
    expect(rig.debug.crane).toBeLessThanOrEqual(CRANE_MAX + 1e-6);
    expect(cam.position.y).toBeGreaterThan(step.heightAt(cam.position.x, cam.position.z) + 0.3);
    // the straight line from the lens to the head clears the ground
    for (let t = 0.1; t < 1; t += 0.1) {
      const x = cam.position.x * (1 - t);
      const z = cam.position.z * (1 - t);
      const y = cam.position.y + (1.65 - cam.position.y) * t;
      expect(y).toBeGreaterThan(step.heightAt(x, z));
    }
    cam.updateMatrixWorld();
    const head = new Vector3(0, 1.6, 0).project(cam);
    expect(Math.abs(head.y)).toBeLessThan(0.9);
    expect(Math.abs(head.x)).toBeLessThan(0.9);
  });

  it("the boom never leaves the character's space: no lens through a door into a building (F-35)", () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera();
    // outdoors (−1); a walkable building (room 4) from z = 1.6 on, its walls passable for the player
    const w: CameraWorld = { heightAt: () => 0, blocked: () => false, space: (_x, z) => (z > 1.6 ? 4 : -1) };
    settle(rig, cam, w);
    expect(cam.position.z).toBeLessThan(1.6);
    expect(rig.debug.lensSpace).toBe(-1);
    // and from inside the room the boom stays in the room
    const inside = new CameraRig();
    const w2: CameraWorld = { heightAt: () => 0, blocked: () => false, space: (_x, z) => (z > 2 ? -1 : 3) };
    settle(inside, cam, w2);
    expect(cam.position.z).toBeLessThan(2);
    expect(inside.debug.lensSpace).toBe(3);
  });

  it('standing in a door reveal (space −2), the side behind the character counts', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera();
    const w: CameraWorld = { heightAt: () => 0, blocked: () => false, space: (_x, z) => (z < -0.3 ? 2 : z < 0.3 ? -2 : z < 1.8 ? -1 : 7) };
    settle(rig, cam, w);
    expect(rig.debug.space).toBe(-1);
    expect(cam.position.z).toBeLessThan(1.8);
  });

  it('indoors: a closer, higher boom (F-31)', () => {
    const cam = new PerspectiveCamera(70, 16 / 9, 0.2, 1000);
    const room: CameraWorld = { heightAt: () => 0, blocked: () => false, ceiling: () => 4.2 };
    const ind = new CameraRig();
    settle(ind, cam, room, input({ pitch: -0.21 }));
    expect(ind.distance).toBeLessThanOrEqual(INDOOR_BOOM + 1e-6);
    expect(ind.debug.indoor).toBeCloseTo(1, 2);
    // higher over the head relative to the boom: the head sits lower on screen, not in the middle
    cam.updateMatrixWorld();
    const head = new Vector3(0, 1.65, 0).project(cam);
    expect(head.y).toBeLessThan(-0.15);
    expect(head.y).toBeGreaterThan(-0.8);
    expect(ind.debug.head).toBeGreaterThan(1.6);
    expect(cam.position.y).toBeLessThan(4.2);
  });

  it('an enemy passing the lens lifts the camera over it (F-08)', () => {
    const cam = new PerspectiveCamera();
    const calm = new CameraRig();
    const far = { x: 6, z: -6, r: 0.5, top: 1 };
    settle(calm, cam, flat, input({ pitch: 0.3 }), { fight: [far], focus: null, boss: 0 });
    const y0 = cam.position.y;
    const c0 = { x: cam.position.x, z: cam.position.z };
    const rig = new CameraRig();
    settle(rig, cam, flat, input({ pitch: 0.3 }), { fight: [far, { x: c0.x, z: c0.z - 0.3, r: 0.5, top: 1.4 }], focus: null, boss: 0 });
    expect(rig.debug.enemyLift).toBeGreaterThan(0.2);
    expect(cam.position.y).toBeGreaterThan(y0 + 0.2);
  });

  it('a conversation frames a two-shot: character left, speaker right, both heads above the dialogue box (F-31)', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera(70, 16 / 9, 0.2, 1000);
    const focus = { x: 0.6, y: 1.7, z: -2 };
    settle(rig, cam, flat, input({ yaw: 0.4 }), { fight: [], focus, boss: 0 });
    cam.updateMatrixWorld();
    const me = new Vector3(0, 1.65, 0).project(cam);
    const sp = new Vector3(focus.x, focus.y, focus.z).project(cam);
    expect(me.z).toBeLessThan(1);
    expect(sp.z).toBeLessThan(1);
    expect(me.x).toBeLessThan(sp.x - 0.2);
    expect(Math.abs(me.x)).toBeLessThan(0.85);
    expect(Math.abs(sp.x)).toBeLessThan(0.85);
    expect(me.y).toBeGreaterThan(-0.15);
    expect(sp.y).toBeGreaterThan(-0.15);
    expect(me.y).toBeLessThan(0.8);
    expect(rig.debug.head).toBeGreaterThan(1.5);
  });

  it('the two-shot takes the side with room (a wall on the right)', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera(70, 16 / 9, 0.2, 1000);
    // speaker straight ahead (−z); the right of that line is +x: a wall at x = 0.6
    const w: CameraWorld = { heightAt: () => 0, blocked: (x, _z, r) => x + r > 0.6 };
    settle(rig, cam, w, input(), { fight: [], focus: { x: 0, y: 1.7, z: -2 }, boss: 0 });
    expect(cam.position.x).toBeLessThan(0);
    cam.updateMatrixWorld();
    const me = new Vector3(0, 1.65, 0).project(cam);
    const sp = new Vector3(0, 1.7, -2).project(cam);
    expect(Math.abs(me.x - sp.x)).toBeGreaterThan(0.2);
  });

  it('the wheel zooms within limits', () => {
    const rig = new CameraRig();
    rig.addZoom(-100);
    expect(rig.zoom).toBe(ZOOM_MIN);
    rig.addZoom(100);
    expect(rig.zoom).toBe(ZOOM_MAX);
  });
});

describe('camera maths (round 10)', () => {
  it('squeezeRise: nothing from 1.2 m out, the full rise at the shortest boom', () => {
    expect(squeezeRise(3)).toBe(0);
    expect(squeezeRise(NEAR_COMFORT)).toBe(0);
    expect(squeezeRise(BOOM_MIN)).toBeCloseTo(RISE_MAX, 6);
    expect(squeezeRise(0.9)).toBeGreaterThan(0);
    expect(squeezeRise(0.9)).toBeLessThan(RISE_MAX);
  });

  it('frameTilt: tilts down only as far as needed to keep a point in frame', () => {
    // camera 1 m above and 0.5 m behind the head, looking level: tilt down
    const t = frameTilt(0, 2.65, 0.5, 0, 1.65, 0, 0, 0, 70);
    expect(t).toBeLessThan(-0.5);
    const cam = new PerspectiveCamera(70, 16 / 9, 0.2, 100);
    cam.position.set(0, 2.65, 0.5);
    cam.rotation.set(t, 0, 0, 'YXZ');
    cam.updateMatrixWorld();
    const p = new Vector3(0, 1.65, 0).project(cam);
    expect(p.y).toBeCloseTo(-0.62, 1);
    // a point already in frame: no tilt
    expect(frameTilt(0, 1.8, 3.6, 0, 1.65, 0, 0, -0.1, 70)).toBe(0);
    // the view tilted far up past it: back down
    expect(frameTilt(0, 3.4, 0.6, 0, 1.65, 0, 0, 0.6, 70)).toBeLessThan(0);
  });

  it('twoShot: both heads in the frame, the character on the side the shot asks for', () => {
    const o = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    for (const D of [1.2, 2, 3.5]) {
      for (const side of [1, -1]) {
        twoShot(0, 1.65, 0, D, 1.7, 0, side, 70, o);
        const cam = new PerspectiveCamera(70, 16 / 9, 0.2, 100);
        cam.position.set(o.x, o.y, o.z);
        cam.rotation.set(o.pitch, o.yaw, 0, 'YXZ');
        cam.updateMatrixWorld();
        const a = new Vector3(0, 1.65, 0).project(cam);
        const b = new Vector3(D, 1.7, 0).project(cam);
        expect(Math.abs(a.x)).toBeLessThan(0.8);
        expect(Math.abs(b.x)).toBeLessThan(0.8);
        expect(side * (b.x - a.x)).toBeGreaterThan(0.2);
        expect(a.y).toBeGreaterThan(0);
        expect(Math.hypot(o.x, o.z)).toBeGreaterThan(1.3);
      }
    }
  });
});

describe('see-through (round 10)', () => {
  const U = () => ({ uSeeCam: { value: new Vector4() }, uSeeP: { value: new Vector4() }, uSeeT: { value: new Vector4() }, uSeeK: { value: new Vector4() } });
  const view = (u: ReturnType<typeof U>) => ({ cam: u.uSeeCam.value, p: u.uSeeP.value, t: u.uSeeT.value, k: u.uSeeK.value });

  it('off in first person / cut-scenes; the fight widens the cone; a target or speaker adds one', () => {
    const u = U();
    applySeeThrough({ on: false, cam: { x: 0, y: 2, z: 4 }, chest: { x: 0, y: 1, z: 0 }, fight: false, subject: null }, u);
    expect(u.uSeeCam.value.w).toBe(0);
    applySeeThrough({ on: true, cam: { x: 0, y: 2, z: 4 }, chest: { x: 0, y: 1, z: 0 }, fight: false, subject: null }, u);
    expect(u.uSeeCam.value.w).toBeGreaterThan(4);
    expect(u.uSeeP.value.w).toBe(SEE_HALF);
    expect(u.uSeeT.value.w).toBe(0);
    applySeeThrough({ on: true, cam: { x: 0, y: 2, z: 4 }, chest: { x: 0, y: 1, z: 0 }, fight: true, subject: { x: 0, y: 1, z: -9, w: 0.8 } }, u);
    expect(u.uSeeP.value.w).toBe(SEE_HALF_FIGHT);
    expect(u.uSeeT.value.w).toBeCloseTo(0.8, 6);
    expect(u.uSeeCam.value.w).toBeGreaterThan(13);
  });

  it('a trunk between the lens and the character thins; one beside the view or behind the character does not', () => {
    const u = U();
    applySeeThrough({ on: true, cam: { x: 0, y: 2.1, z: 4 }, chest: { x: 0, y: 1, z: 0 }, fight: false, subject: null }, u);
    const v = view(u);
    const at = (x: number, z: number, y = 1.5) => seeAmount(v, { x, y: 0, z }, 0.3, 20, { x: x + 0.3, y, z });
    expect(at(0.2, 2)).toBeCloseTo(SEE_CONE, 2);
    expect(at(3, 2)).toBe(0);
    expect(at(0, -2)).toBe(0);
    // pressed against the lens: gone entirely
    expect(at(0.2, 4.3)).toBe(1);
    // the crowns overhead stay (the fragment side fades the effect out above uSeeK.w)
    expect(u.uSeeK.value.w).toBeCloseTo(2.1 + 2.2, 6);
  });

  it('a low fern under the sight line to the feet hides nothing; a tall one in front of the character does', () => {
    const u = U();
    applySeeThrough({ on: true, cam: { x: 0, y: 2.6, z: 5 }, chest: { x: 0, y: 1, z: 0 }, fight: true, subject: null }, u);
    const v = view(u);
    expect(seeAmount(v, { x: 0, y: 0.3, z: 3 }, 0.25, 0.3, { x: 0, y: 0.3, z: 3 })).toBe(0);
    expect(seeAmount(v, { x: 0.3, y: 1.1, z: 1 }, 0.25, 1.1, { x: 0.3, y: 1.1, z: 1 })).toBeGreaterThan(0.5);
  });

  it('the fight target gets its own cone', () => {
    const u = U();
    applySeeThrough({ on: true, cam: { x: 0, y: 2.4, z: 5 }, chest: { x: 0, y: 1, z: 0 }, fight: true, subject: { x: 4, y: 0.9, z: -6, w: 0.8 } }, u);
    const v = view(u);
    // on the line lens → target, well clear of the character's cone
    const bx = 4 * 0.45;
    const bz = 5 - 11 * 0.45;
    expect(seeAmount(v, { x: bx, y: 0, z: bz }, 0.3, 20, { x: bx, y: 1.5, z: bz })).toBeGreaterThan(0.5);
    u.uSeeT.value.w = 0;
    expect(seeAmount(v, { x: bx, y: 0, z: bz }, 0.3, 20, { x: bx, y: 1.5, z: bz })).toBeLessThan(0.05);
  });
});

describe('camera probes against footprints (round 10)', () => {
  it('hits() agrees with resolve().hit for a probe moving in from outside, and skips passable footprints', () => {
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const c = new FootprintCollider([square]);
    for (let x = -2; x <= 0.2; x += 0.05) expect(c.hits(x, 5, 0.22)).toBe(c.resolve(x, 5, 0.22).hit);
    c.setSolids('crate', [{ kind: 'circle', x: -5, z: -5, r: 0.5 }]);
    expect(c.hits(-5.6, -5, 0.2)).toBe(true);
    expect(c.hits(-6, -5, 0.2)).toBe(false);
    c.overlay = { passable: new Set([0]), resolve: (x, z) => ({ x, z, hit: false }), hits: () => false };
    expect(c.hits(0, 5, 0.22)).toBe(false);
    c.overlay = { passable: new Set([0]), resolve: (x, z) => ({ x, z, hit: false }), hits: (x) => Math.abs(x - 3) < 0.2 };
    expect(c.hits(3, 5, 0.22)).toBe(true);
    c.overlay = null;
    c.setPassZones('gate', [{ poly: 0, x: 0, z: 5, r: 1.5 }]);
    expect(c.hits(0, 5, 0.22)).toBe(false);
    expect(c.hits(0, 8, 0.22)).toBe(true);
  });
});

describe('NaN guards (F-15)', () => {
  const fin = (c: PerspectiveCamera) => finite3(c.position) && Number.isFinite(c.rotation.x + c.rotation.y + c.rotation.z);

  it('the pure helpers: dt, clamps, zero-length directions, angles, loops', () => {
    expect(safeDt(Number.NaN)).toBe(0);
    expect(safeDt(-1)).toBe(0);
    expect(safeDt(0)).toBe(0);
    expect(safeDt(Number.POSITIVE_INFINITY)).toBe(0);
    expect(safeDt(5)).toBe(0.1);
    expect(safeDt(1 / 60)).toBeCloseTo(1 / 60, 9);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clamp01(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(clamp01(0.3)).toBe(0.3);
    expect(finiteOr(Number.NaN, 2)).toBe(2);
    expect(finiteOr(-3, 2)).toBe(-3);
    const o = { x: 9, z: 9 };
    expect(dirXZ(0, 0, o)).toEqual({ x: 0, z: -1 });
    expect(dirXZ(Number.NaN, 1, o, 1, 0)).toEqual({ x: 1, z: 0 });
    expect(dirXZ(1e-12, 0, o)).toEqual({ x: 0, z: -1 });
    dirXZ(3, 4, o);
    expect(o.x).toBeCloseTo(0.6, 9);
    expect(o.z).toBeCloseTo(0.8, 9);
    // turning: a NaN wish keeps the facing, a NaN facing restarts at the fallback, dt 0 holds
    expect(turnToward(1, Number.NaN, 11, 1 / 60, 0)).toBe(1);
    expect(turnToward(Number.NaN, 1, 11, 1 / 60, 0.5)).toBeGreaterThan(0.5);
    expect(turnToward(1, 2, 11, 0, 0)).toBe(1);
    expect(turnToward(1, 2, 11, Number.NaN, 0)).toBe(1);
    // the short way round, over ±π (not back through 0)
    const t = turnToward(3, -3, 1000, 0.1, 0);
    expect(t).toBeGreaterThan(3);
    expect(Math.cos(t + 3)).toBeCloseTo(1, 6);
    expect(loop01(1.5, 1)).toBeCloseTo(0.5, 9);
    expect(loop01(-0.25, 1)).toBeCloseTo(0.75, 9);
    expect(loop01(3, 0)).toBe(0);
    expect(loop01(Number.NaN, 2)).toBe(0);
    expect(loop01(Number.POSITIVE_INFINITY, 2)).toBe(0);
  });

  it('the camera maths never return NaN', () => {
    expect(squeezeRise(Number.NaN)).toBe(0);
    // the point exactly at the lens, a NaN point, a NaN fov
    expect(frameTilt(0, 1.65, 0, 0, 1.65, 0, 0, 0, 70)).toBe(0);
    expect(frameTilt(0, 2, 3, Number.NaN, 1.65, 0, 0, 0, 70)).toBe(0);
    expect(frameTilt(0, 2, 3, 0, 1.65, 0, 0, 0, Number.NaN)).toBe(0);
    const o = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
    // the speaker on the character's spot, a NaN speaker
    for (const s of [
      [0, 1.7, 0],
      [Number.NaN, 1.7, -2],
      [0, Number.POSITIVE_INFINITY, -2],
    ] as const) {
      twoShot(0, 1.65, 0, s[0], s[1], s[2], 1, 70, o);
      expect(Number.isFinite(o.x + o.y + o.z + o.yaw + o.pitch)).toBe(true);
      expect(Math.hypot(o.x, o.z)).toBeGreaterThan(1);
    }
    // a NaN side, a NaN fov
    twoShot(0, 1.65, 0, 0, 1.7, -2, Number.NaN, Number.NaN, o);
    expect(Number.isFinite(o.x + o.y + o.z + o.yaw + o.pitch)).toBe(true);
    // a NaN character: nothing to frame, the shot is left as it was
    const before = { ...o };
    twoShot(Number.NaN, 1.65, 0, 0, 1.7, -2, 1, 70, o);
    expect(o).toEqual(before);
  });

  it('the rig with dt 0, a NaN dt and a huge dt stays finite and settled', () => {
    for (const dt of [0, Number.NaN, 30, -1]) {
      const rig = new CameraRig();
      const cam = new PerspectiveCamera(70, 16 / 9, 0.2, 1000);
      settle(rig, cam, flat, input());
      const z0 = cam.position.z;
      for (let i = 0; i < 30; i++) rig.update(cam, input({ dt }), flat, noHints());
      expect(fin(cam)).toBe(true);
      expect(cam.position.z).toBeCloseTo(z0, 3);
    }
  });

  it('a NaN position or look holds the last good camera, and the rig recovers next frame', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera(70, 16 / 9, 0.2, 1000);
    settle(rig, cam, flat, input());
    const p0 = cam.position.clone();
    for (const bad of [{ x: Number.NaN }, { y: Number.POSITIVE_INFINITY }, { yaw: Number.NaN }, { pitch: Number.NaN }, { eye: Number.NaN }]) {
      rig.update(cam, input(bad), flat, noHints());
      expect(fin(cam)).toBe(true);
      expect(cam.position.distanceTo(p0)).toBeLessThan(1e-9);
    }
    settle(rig, cam, flat, input({ x: 5 }), noHints(), 120);
    expect(fin(cam)).toBe(true);
    expect(cam.position.x).toBeGreaterThan(4);
  });

  it('NaN from the world or the hints never reaches the camera', () => {
    const cam = new PerspectiveCamera(70, 16 / 9, 0.2, 1000);
    const worlds: CameraWorld[] = [
      { heightAt: () => Number.NaN, blocked: () => false },
      { heightAt: (_x, z) => (z > 2 ? Number.POSITIVE_INFINITY : 0), blocked: () => false },
      { heightAt: () => 0, blocked: () => false, ceiling: () => Number.NaN },
      { heightAt: () => 0, blocked: () => false, space: () => Number.NaN },
    ];
    for (const w of worlds) {
      const rig = new CameraRig();
      settle(rig, cam, flat, input(), noHints(), 10);
      settle(rig, cam, w, input(), noHints(), 60);
      expect(fin(cam)).toBe(true);
    }
    const nan = Number.NaN;
    const hints: CameraHints[] = [
      { fight: [{ x: nan, z: 1, r: 0.5, top: 1 }], focus: null, boss: 0 },
      { fight: [{ x: 1, z: 1, r: nan, top: nan }], focus: null, boss: nan },
      { fight: [], focus: { x: nan, y: 1.7, z: -2 }, boss: 0 },
      { fight: [], focus: { x: 0, y: 1.7, z: 0 }, boss: 0 },
      { fight: [], focus: null, boss: 0, bodies: [{ x: 0, z: 2, r: nan, top: 3 }] },
    ];
    for (const h of hints) {
      const rig = new CameraRig();
      settle(rig, cam, flat, input(), h, 60);
      expect(fin(cam)).toBe(true);
    }
    // a NaN zoom from outside, and NaN wheel notches
    const rig = new CameraRig();
    rig.addZoom(Number.NaN);
    expect(rig.zoom).toBe(3.6);
    rig.zoom = Number.NaN;
    settle(rig, cam, flat, input(), noHints(), 30);
    expect(fin(cam)).toBe(true);
    expect(rig.zoom).toBe(3.6);
  });

  it('the see-through switches off on a NaN lens, ignores a NaN subject; lensVis keeps a body drawn', () => {
    const u = { uSeeCam: { value: new Vector4() }, uSeeP: { value: new Vector4() }, uSeeT: { value: new Vector4() }, uSeeK: { value: new Vector4() } };
    applySeeThrough({ on: true, cam: { x: Number.NaN, y: 2, z: 4 }, chest: { x: 0, y: 1, z: 0 }, fight: false, subject: null }, u);
    expect(u.uSeeCam.value.w).toBe(0);
    applySeeThrough({ on: true, cam: { x: 0, y: 2, z: 4 }, chest: { x: 0, y: 1, z: 0 }, fight: true, subject: { x: Number.NaN, y: 1, z: -5, w: 0.8 } }, u);
    expect(u.uSeeT.value.w).toBe(0);
    for (const c of [u.uSeeCam.value, u.uSeeP.value, u.uSeeK.value]) expect(Number.isFinite(c.x + c.y + c.z + c.w)).toBe(true);
    const e = { x: 0, y: 0, z: 0, heading: 0, radius: 0.5 };
    const v = { hull: { r: 0.5, f: 0.5 }, t: { top: 1.5 } };
    expect(lensVis(e, v, { x: Number.NaN, y: 1, z: 0 })).toBe(1);
    expect(lensVis({ ...e, x: Number.NaN }, v, { x: 0, y: 1, z: 0 })).toBe(1);
    // the lens at the body's axis (zero distance): hidden, not NaN
    expect(lensVis(e, v, { x: 0, y: 1, z: 0 })).toBe(0);
    expect(lensVis(e, v, { x: 3, y: 1, z: 0 })).toBe(1);
  });
});

describe('lock-on targeting', () => {
  const c = (id: string, x: number, z: number, o: Partial<TargetCandidate> = {}): TargetCandidate => ({ id, x, y: 0, z, r: 0.5, top: 1.5, boss: false, windup: false, aggro: true, ...o });
  it('prefers near and in front of the view', () => {
    const list = [c('behind', 0, 3), c('front-far', 0, -9), c('front', 0.5, -4)];
    expect(pickTarget(list, 0, 0, 0, 24, 120)?.id).toBe('front');
  });
  it('respects range, cone and exclusion', () => {
    const list = [c('a', 0, -4), c('b', 2, -5), c('far', 0, -40)];
    expect(pickTarget(list, 0, 0, 0, 24, 120, 'a')?.id).toBe('b');
    expect(pickTarget([c('side', 5, 0)], 0, 0, 0, 24, 60)).toBeNull();
    expect(pickTarget([c('far', 0, -40)], 0, 0, 0, 24, 120)).toBeNull();
  });
  it('lock-on keys: Tab and the middle mouse button, rebindable; the journal stays on J', () => {
    expect(DEFAULT_BINDINGS.lockOn).toEqual(['Tab', 'Mouse1']);
    expect(DEFAULT_BINDINGS.journal).toEqual(['KeyJ']);
    expect(REBINDABLE).toContain('lockOn');
    expect(REBINDABLE).toContain('cameraMode');
  });
});

describe('the character fade (camera side of src/player/avatar.ts)', () => {
  const feet = { x: 0, y: 0, z: 0 };
  /** A camera behind the character (+z), looking at the head. */
  const camAt = (z: number, y = 1.6): PerspectiveCamera => {
    const c = new PerspectiveCamera(70, 16 / 9, 0.2, 1000);
    c.position.set(0, y, z);
    c.lookAt(0, 1.45, 0);
    c.updateMatrixWorld(true);
    return c;
  };

  it('is solid with the lens at a normal distance, thins as the lens nears the head', () => {
    expect(characterFadeWant(camAt(3.6), feet, null, false)).toBe(1);
    const mid = characterFadeWant(camAt(0.9), feet, null, false);
    expect(mid).toBeGreaterThan(FADE_NEAR_MIN);
    expect(mid).toBeLessThan(1);
    expect(characterFadeWant(camAt(0.4), feet, null, false)).toBeCloseTo(FADE_NEAR_MIN, 6);
  });

  it('thins when it hides the fight target on screen, never under the floor in a fight (F-07)', () => {
    const cam = camAt(3.6);
    expect(characterFadeWant(cam, feet, { x: 0, z: -4 }, false)).toBe(FADE_TARGET);
    // the target off to the side: not hidden
    expect(characterFadeWant(cam, feet, { x: 4, z: -4 }, false)).toBe(1);
    expect(characterFadeWant(cam, feet, { x: 0, z: -4 }, true)).toBe(FADE_FIGHT_FLOOR);
    expect(characterFadeWant(camAt(0.4), feet, null, true)).toBe(FADE_FIGHT_FLOOR);
  });

  it('eases, snaps to solid above 0.98 and restarts solid on a NaN lens (F-15)', () => {
    const f = new CharacterFade();
    const near = camAt(0.4);
    const o1 = f.step(near, feet, null, false, 1 / 60);
    expect(o1).toBeLessThan(1);
    expect(o1).toBeGreaterThan(0.8);
    for (let i = 0; i < 120; i++) f.step(near, feet, null, false, 1 / 60);
    expect(f.value).toBeCloseTo(FADE_NEAR_MIN, 3);
    // dt 0 (paused) holds
    expect(f.step(camAt(3.6), feet, null, false, 0)).toBeCloseTo(FADE_NEAR_MIN, 3);
    for (let i = 0; i < 120; i++) f.step(camAt(3.6), feet, null, false, 1 / 60);
    expect(f.step(camAt(3.6), feet, null, false, 1 / 60)).toBe(1);
    const bad = camAt(3.6);
    bad.position.x = Number.NaN;
    f.value = Number.NaN;
    expect(f.step(bad, feet, { x: 0, z: -4 }, false, 1 / 60)).toBe(1);
    expect(f.step(camAt(3.6), { x: Number.NaN, y: 0, z: 0 }, null, false, 1 / 60)).toBe(1);
  });

  it('usablePos holds on a NaN position and restarts a NaN last position', () => {
    const last = { x: 1, y: 2, z: 3 };
    expect(usablePos({ x: Number.NaN, y: 0, z: 0 }, last)).toBe(false);
    expect(last).toEqual({ x: 1, y: 2, z: 3 });
    const bad = { x: Number.NaN, y: 0, z: Number.POSITIVE_INFINITY };
    expect(usablePos({ x: 4, y: 5, z: 6 }, bad)).toBe(true);
    expect(bad).toEqual({ x: 4, y: 5, z: 6 });
  });

  it('ribbonStep drops a NaN point and restarts across a teleport', () => {
    const a = { x: 0, y: 1, z: 0 };
    const b = { x: 0, y: 1.5, z: 0 };
    expect(ribbonStep(undefined, a, b)).toBe('add');
    expect(ribbonStep({ x: 0.5, y: 1, z: 0 }, a, b)).toBe('add');
    expect(ribbonStep({ x: 50, y: 1, z: 0 }, a, b)).toBe('restart');
    expect(ribbonStep({ x: Number.NaN, y: 1, z: 0 }, a, b)).toBe('restart');
    expect(ribbonStep({ x: 0, y: 1, z: 0 }, { x: Number.NaN, y: 1, z: 0 }, b)).toBe('drop');
    expect(ribbonStep(undefined, a, { x: 0, y: Number.POSITIVE_INFINITY, z: 0 })).toBe('drop');
  });
});
