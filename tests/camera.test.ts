import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { BOOM_MIN, CameraRig, type CameraHints, type CameraWorld, ZOOM_MAX, ZOOM_MIN } from '../src/player/camera';
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

  it('a tree trunk on the boom stops it in front of the trunk', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera();
    const w: CameraWorld = { heightAt: () => 0, blocked: () => false, trunks: (_x, _z, _r, fn) => fn(0.55, 2.5, 0.35, 12) };
    settle(rig, cam, w);
    expect(Math.hypot(cam.position.x - 0.55, cam.position.z - 2.5)).toBeGreaterThan(0.35);
    expect(cam.position.z).toBeLessThan(2.5);
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

  it('the wheel zooms within limits', () => {
    const rig = new CameraRig();
    rig.addZoom(-100);
    expect(rig.zoom).toBe(ZOOM_MIN);
    rig.addZoom(100);
    expect(rig.zoom).toBe(ZOOM_MAX);
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
