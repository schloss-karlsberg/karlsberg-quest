import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig, type CameraHints, type CameraWorld, PHOTO_AHEAD, PHOTO_DROP } from '../src/player/camera';

/** The photo-mode hook of the camera rig (src/systems/photo): additive, nothing changes while off. */
const flat: CameraWorld = { heightAt: () => 0, blocked: () => false };
const noHints = (): CameraHints => ({ fight: [], focus: null, boss: 0 });
const input = (o: Partial<Parameters<CameraRig['update']>[1]> = {}) => ({ x: 0, y: 0, z: 0, eye: 1.65, yaw: 0, pitch: 0, dt: 1 / 60, reducedMotion: false, flying: false, ...o });

describe('camera rig: photo mode hook', () => {
  it('off by default: the same camera as a rig that never heard of it', () => {
    const a = new CameraRig();
    const b = new CameraRig();
    b.setPhoto(true);
    b.setPhoto(false);
    b.setFovScale(1);
    const ca = new PerspectiveCamera(70, 16 / 9);
    const cb = new PerspectiveCamera(70, 16 / 9);
    for (let i = 0; i < 120; i++) {
      a.update(ca, input({ yaw: i * 0.01 }), flat, noHints());
      b.update(cb, input({ yaw: i * 0.01 }), flat, noHints());
    }
    expect(cb.position.toArray()).toEqual(ca.position.toArray());
    expect(cb.fov).toBe(70);
  });

  it('on: the lens at the eyes, a hand ahead, looking along the view; the boom is 0 (character hidden)', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera(70, 16 / 9);
    rig.update(cam, input({ x: 5, z: 5 }), flat, noHints());
    rig.setPhoto(true);
    expect(rig.update(cam, input({ x: 5, z: 5, yaw: 0, pitch: -0.1 }), flat, noHints())).toBe(true);
    expect(cam.position.x).toBeCloseTo(5);
    expect(cam.position.z).toBeCloseTo(5 - PHOTO_AHEAD);
    expect(cam.position.y).toBeCloseTo(1.65 - PHOTO_DROP);
    expect(cam.rotation.x).toBeCloseTo(-0.1);
    expect(rig.distance).toBe(0);
  });

  it('a wall right in front of the face keeps the phone at the eyes', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera();
    rig.setPhoto(true);
    rig.update(cam, input(), { heightAt: () => 0, blocked: (_x, z) => z < -0.2 }, noHints());
    expect(cam.position.z).toBeCloseTo(0);
  });

  it('setFovScale(2) doubles the focal length, and 1 gives the settings fov back', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera(70, 16 / 9);
    rig.setPhoto(true);
    rig.setFovScale(2);
    rig.update(cam, input({ reducedMotion: true }), flat, noHints());
    const want = (2 * Math.atan(Math.tan((70 * Math.PI) / 360) / 2) * 180) / Math.PI;
    expect(cam.fov).toBeCloseTo(want, 5);
    // the settings change the fov meanwhile: that becomes the base
    cam.fov = 80;
    rig.update(cam, input({ reducedMotion: true }), flat, noHints());
    expect(cam.fov).toBeCloseTo((2 * Math.atan(Math.tan((80 * Math.PI) / 360) / 2) * 180) / Math.PI, 5);
    rig.setFovScale(1);
    for (let i = 0; i < 120; i++) rig.update(cam, input(), flat, noHints());
    expect(cam.fov).toBeCloseTo(80, 5);
    // handed back: a later settings write is not touched
    cam.fov = 66;
    rig.update(cam, input(), flat, noHints());
    expect(cam.fov).toBe(66);
  });

  it('the wheel switches 1× / 2× while the phone is up and leaves the boom alone', () => {
    const rig = new CameraRig();
    const zoom = rig.zoom;
    rig.setPhoto(true);
    rig.addZoom(-1);
    expect(rig.fovWanted).toBe(2);
    rig.addZoom(1);
    expect(rig.fovWanted).toBe(1);
    expect(rig.zoom).toBe(zoom);
  });

  it('the spirit view ignores photo mode (eye camera as before)', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera();
    rig.setPhoto(true);
    expect(rig.update(cam, input({ flying: true }), flat, noHints())).toBe(false);
    expect(cam.position.toArray()).toEqual([0, 1.65, 0]);
  });
});
