import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../src/core/loop';
import { lensDown } from '../src/systems/photo/core';
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

  it('manual render frames settle 2× zoom with motion enabled and no rAF or extra simulation', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera(95, 16 / 9);
    const loop = new FixedStepLoop({
      update: () => {},
      render: (dt) => rig.update(cam, input({ dt }), flat, noHints()),
    }, 60, () => 0, () => {});
    loop.manual = true;
    rig.setPhoto(true);
    rig.setFovScale(2);
    loop.step(40);
    expect(rig.fovScale).toBeLessThan(2);
    for (let i = 0; i < 32 && rig.fovScale !== 2; i++) loop.renderOnce(loop.dt);
    expect(rig.fovScale).toBe(2);
    expect(cam.fov).toBeCloseTo(zoomed(95));
    expect(loop.tick).toBe(40);
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

  /** The 2×-narrowed fov of a base fov. */
  const zoomed = (base: number) => (2 * Math.atan(Math.tan((base * Math.PI) / 360) / 2) * 180) / Math.PI;
  /** A rig with the phone up at 2×, settled, then half-way eased back towards 1× (a few frames). */
  const midZoom = (cam: PerspectiveCamera) => {
    const rig = new CameraRig();
    rig.setPhoto(true);
    rig.setFovScale(2);
    for (let i = 0; i < 120; i++) rig.update(cam, input(), flat, noHints());
    expect(cam.fov).toBeCloseTo(zoomed(70), 5);
    rig.setFovScale(1);
    for (let i = 0; i < 3; i++) rig.update(cam, input(), flat, noHints());
    expect(rig.fovScale).toBeGreaterThan(1.1);
    expect(cam.fov).toBeLessThan(69);
    return rig;
  };

  it('scale 1 and photo off: update never writes camera.fov (the takeover hand-back relies on it)', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera(70, 16 / 9);
    let writes = 0;
    let fov = 70;
    Object.defineProperty(cam, 'fov', {
      get: () => fov,
      set: (v: number) => {
        writes++;
        fov = v;
      },
    });
    for (let i = 0; i < 60; i++) rig.update(cam, input({ yaw: i * 0.01 }), flat, noHints());
    rig.setPhoto(true);
    rig.setPhoto(false);
    for (let i = 0; i < 60; i++) rig.update(cam, input({ reducedMotion: i % 2 === 0 }), flat, noHints());
    expect(writes).toBe(0);
  });

  it('a forced close mid-zoom (lensDown forced → snapFov) puts the base fov on the camera in the same call', () => {
    const cam = new PerspectiveCamera(70, 16 / 9);
    const rig = midZoom(cam);
    const before = cam.projectionMatrix.elements[5];
    lensDown(rig, cam, true);
    expect(cam.fov).toBe(70);
    expect(rig.fovScale).toBe(1);
    expect(rig.fovWanted).toBe(1);
    expect(rig.photoMode).toBe(false);
    expect(cam.projectionMatrix.elements[5]).not.toBe(before);
  });

  it('after a forced close update() leaves camera.fov alone (no lingering ease)', () => {
    const cam = new PerspectiveCamera(70, 16 / 9);
    const rig = midZoom(cam);
    lensDown(rig, cam, true);
    // a cinematic now owns the lens and narrows it: the rig must not pull it back
    cam.fov = 40;
    for (let i = 0; i < 60; i++) rig.update(cam, input(), flat, noHints());
    expect(cam.fov).toBe(40);
  });

  it('snapFov keeps a settings fov written mid-zoom as the base', () => {
    const cam = new PerspectiveCamera(70, 16 / 9);
    const rig = midZoom(cam);
    cam.fov = 85;
    rig.snapFov(cam);
    expect(cam.fov).toBe(85);
  });

  it('snapFov on a rig that never narrowed the lens does not touch it', () => {
    const rig = new CameraRig();
    const cam = new PerspectiveCamera(55, 16 / 9);
    rig.snapFov(cam);
    expect(cam.fov).toBe(55);
  });

  it('a normal close (the player: N / Esc / right click) still eases back to 1×', () => {
    const cam = new PerspectiveCamera(70, 16 / 9);
    const rig = midZoom(cam);
    lensDown(rig, cam, false);
    const mid = cam.fov;
    expect(mid).toBeLessThan(69);
    rig.update(cam, input(), flat, noHints());
    expect(cam.fov).toBeGreaterThan(mid);
    expect(cam.fov).toBeLessThan(70);
    for (let i = 0; i < 120; i++) rig.update(cam, input(), flat, noHints());
    expect(cam.fov).toBeCloseTo(70, 5);
  });

  it('reduced motion: a normal close snaps on the next frame', () => {
    const cam = new PerspectiveCamera(70, 16 / 9);
    const rig = midZoom(cam);
    lensDown(rig, cam, false);
    rig.update(cam, input({ reducedMotion: true }), flat, noHints());
    expect(cam.fov).toBe(70);
  });

  it('takeover order: the phone closes on camera:override, then a takeover captures the base fov', () => {
    const cam = new PerspectiveCamera(70, 16 / 9);
    const rig = midZoom(cam);
    // as the photo system's camera:override listener, then the takeover capturing the lens
    lensDown(rig, cam, true);
    const baseFov = cam.fov;
    expect(baseFov).toBe(70);
    // the takeover drives the lens (the rig still updates underneath), then hands it back
    for (let i = 0; i < 30; i++) {
      cam.fov = 50;
      rig.update(cam, input(), flat, noHints());
      expect(cam.fov).toBe(50);
    }
    cam.fov = baseFov;
    rig.update(cam, input(), flat, noHints());
    expect(cam.fov).toBe(70);
  });
});

describe('camera rig: the phone coming out (TASK-005)', () => {
  const settle = (rig: CameraRig, cam: PerspectiveCamera, n = 120) => {
    for (let i = 0; i < n; i++) rig.update(cam, input({ x: 3, z: 4, yaw: 0.4, pitch: -0.05 }), flat, noHints());
  };

  it('glide 0 is the third-person camera, 1 the lens, and in between on the line from one to the other', () => {
    const plain = new CameraRig();
    const camP = new PerspectiveCamera(70, 16 / 9);
    settle(plain, camP);
    const third = camP.position.clone();
    const lensRig = new CameraRig();
    const camL = new PerspectiveCamera(70, 16 / 9);
    lensRig.setPhoto(true);
    settle(lensRig, camL, 2);
    const lens = camL.position.clone();

    const rig = new CameraRig();
    const cam = new PerspectiveCamera(70, 16 / 9);
    settle(rig, cam);
    rig.setPhoto(true, true);
    rig.setPhotoBlend(0);
    settle(rig, cam, 1);
    expect(cam.position.distanceTo(third)).toBeLessThan(1e-6);
    // half way: between the two, and the character is still drawn (the boom keeps its length)
    rig.setPhotoBlend(0.5);
    settle(rig, cam, 1);
    const mid = third.clone().lerp(lens, 0.5);
    expect(cam.position.distanceTo(mid)).toBeLessThan(1e-6);
    expect(rig.distance).toBeGreaterThan(1);
    // there: the lens, looking along the player's view, the character hidden
    rig.setPhotoBlend(1);
    settle(rig, cam, 1);
    expect(cam.position.distanceTo(lens)).toBeLessThan(1e-6);
    expect(cam.rotation.x).toBeCloseTo(-0.05);
    expect(cam.rotation.y).toBeCloseTo(0.4);
    expect(rig.distance).toBe(0);
  });

  it('gliding out ends on the same third-person camera, with no jump when photo mode goes off', () => {
    const plain = new CameraRig();
    const camP = new PerspectiveCamera(70, 16 / 9);
    settle(plain, camP);
    const rig = new CameraRig();
    const cam = new PerspectiveCamera(70, 16 / 9);
    settle(rig, cam);
    rig.setPhoto(true, true);
    for (let i = 0; i <= 30; i++) {
      rig.setPhotoBlend(i / 30);
      settle(rig, cam, 1);
    }
    for (let i = 30; i >= 0; i--) {
      rig.setPhotoBlend(i / 30);
      settle(rig, cam, 1);
    }
    const before = cam.position.clone();
    rig.setPhoto(false, true);
    settle(rig, cam, 1);
    expect(cam.position.distanceTo(before)).toBeLessThan(1e-3);
    settle(plain, camP, 32);
    expect(cam.position.distanceTo(camP.position)).toBeLessThan(1e-3);
  });

  it('first person cuts to the lens whatever the glide', () => {
    const rig = new CameraRig();
    rig.mode = 'first';
    const cam = new PerspectiveCamera(70, 16 / 9);
    rig.setPhoto(true, true);
    rig.setPhotoBlend(0.2);
    rig.update(cam, input({ x: 5, z: 5 }), flat, noHints());
    expect(cam.position.x).toBeCloseTo(5);
    expect(cam.position.z).toBeCloseTo(5 - PHOTO_AHEAD);
  });

  it('a broken glide value means the lens', () => {
    const rig = new CameraRig();
    rig.setPhotoBlend(Number.NaN);
    expect(rig.photoGlide).toBe(1);
    rig.setPhotoBlend(-2);
    expect(rig.photoGlide).toBe(0);
  });
});
