import { Box3, Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { FULL_RING_AGL, forestCullMode, tileSpheres } from '../src/world/forest';
import { COVER_NEAR, FAR_TUFT, coverPick } from '../src/world/vegetation/groundcover';
import { ViewCone, frustumCornerAngle } from '../src/world/viewCone';
import { REFLECT_DIST, ReflectionSchedule, reflectionDistance } from '../src/world/water';

/** A camera at (x, y, z) looking along yaw (0 = -z, 90 = +x) and pitch (degrees, negative = down). */
function cam(x: number, y: number, z: number, yawDeg: number, pitchDeg: number, fov = 80, aspect = 16 / 9): PerspectiveCamera {
  const c = new PerspectiveCamera(fov, aspect, 0.1, 3000);
  c.position.set(x, y, z);
  c.rotation.order = 'YXZ';
  c.rotation.set((pitchDeg * Math.PI) / 180, (-yawDeg * Math.PI) / 180, 0);
  c.updateMatrixWorld(true);
  return c;
}

function frustumOf(c: PerspectiveCamera): Frustum {
  return new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse));
}

/** A flat water box (y = 0) of half size h around (x, z). */
const lake = (x: number, z: number, h = 20) => new Box3(new Vector3(x - h, 0, z - h), new Vector3(x + h, 0, z + h));

describe('water reflection: only a body on screen and near', () => {
  const c = cam(0, 3, 0, 0, -6); // looking along -z
  const f = frustumOf(c);

  it('a lake ahead within range reflects, with its distance', () => {
    expect(reflectionDistance(f, lake(0, -80), c.position, REFLECT_DIST)).toBeCloseTo(60, 5);
  });

  it('a lake behind the camera or off to the side does not, even when near', () => {
    expect(reflectionDistance(f, lake(0, 80), c.position, REFLECT_DIST)).toBe(-1);
    expect(reflectionDistance(f, lake(300, -60), c.position, 450)).toBe(-1);
  });

  it('a lake on screen beyond the range does not', () => {
    expect(reflectionDistance(f, lake(0, -200), c.position, REFLECT_DIST)).toBe(-1);
    expect(reflectionDistance(f, lake(0, -200), c.position, 250)).toBeCloseTo(180, 5);
  });

  it('standing on the shore (inside the box) the distance is 0', () => {
    const b = new Box3(new Vector3(-50, 0, -50), new Vector3(50, 0, 10));
    expect(reflectionDistance(f, b, c.position, REFLECT_DIST)).toBe(0);
  });
});

describe('water reflection schedule: off-phase with the shadow map', () => {
  const pos = new Vector3(10, 2, 10);
  const dir = new Vector3(0, 0, -1);

  it('with shadows every 2nd frame, no frame renders both and the reflection never stands 2 frames', () => {
    const s = new ReflectionSchedule();
    s.due(true, pos, dir, 0); // first frame: a cut (no image yet)
    let lastRefl = 0;
    for (let i = 1; i < 40; i++) {
      const shadow = i % 2 === 0;
      const refl = s.due(shadow, pos.clone().setX(10 + i * 0.05), dir, 0);
      expect(shadow && refl).toBe(false);
      if (refl) lastRefl = i;
      expect(i - lastRefl).toBeLessThanOrEqual(1);
    }
  });

  it('shadows every frame (sprint, fight): the reflection every 2nd frame', () => {
    const s = new ReflectionSchedule();
    const r = Array.from({ length: 8 }, () => s.due(true, pos, dir, 0));
    expect(r).toEqual([true, false, true, false, true, false, true, false]);
  });

  it('a cut forces a render: teleport, a sharp turn, another body, invalidate', () => {
    const s = new ReflectionSchedule();
    s.due(false, pos, dir, 0);
    expect(s.due(true, pos.clone().setX(200), dir, 0)).toBe(true);
    expect(s.due(true, pos.clone().setX(200), new Vector3(1, 0, 0), 0)).toBe(true);
    expect(s.due(true, pos.clone().setX(200), new Vector3(1, 0, 0), 3)).toBe(true);
    s.invalidate();
    expect(s.due(true, pos.clone().setX(200), new Vector3(1, 0, 0), 3)).toBe(true);
    // … and without a cut, the shadow frame right after a render skips
    expect(s.due(true, pos.clone().setX(200), new Vector3(1, 0, 0), 3)).toBe(false);
  });
});

describe('view cone', () => {
  it('half angle = frustum corner + margin; corner of 80° fov at 16:9 ≈ 60°', () => {
    expect((frustumCornerAngle(80, 16 / 9) * 180) / Math.PI).toBeCloseTo(59.7, 0);
  });

  it('keeps what is ahead and near, drops what lies behind', () => {
    const k = new ViewCone();
    k.set(cam(0, 2, 0, 0, -6), 0.7);
    expect(k.keeps(0, 0, -100, 1)).toBe(true);
    expect(k.keeps(0, 0, 100, 1)).toBe(false);
    expect(k.keeps(0, 0, 2.5, 0.1, 3)).toBe(true);
    expect(k.turned(cam(0, 2, 0, 10, -6), 0.35)).toBe(false);
    expect(k.turned(cam(0, 2, 0, 30, -6), 0.35)).toBe(true);
  });
});

describe('forest: looking steeply down', () => {
  it('keeps the full ring only high above the ground (or with culling off)', () => {
    expect(forestCullMode(true, -0.1, 0)).toBe('sector');
    expect(forestCullMode(true, -0.8, 2)).toBe('cone');
    expect(forestCullMode(true, -0.8, FULL_RING_AGL + 5)).toBe('full');
    expect(forestCullMode(false, -0.8, 2)).toBe('full');
    expect(forestCullMode(false, -0.1, 2)).toBe('full');
  });

  it('tile selection: tiles in the 3D view cone stay, the near ones always, the ones behind go', () => {
    // one tree (x, y, z, height, rot, kind, var) in the middle of each 64 m tile of a 9 × 9 block
    const tiles = new Map<string, Float32Array>();
    for (let tz = -4; tz <= 4; tz++) for (let tx = -4; tx <= 4; tx++) tiles.set(`${tx}_${tz}`, new Float32Array([tx * 64 + 32, 0, tz * 64 + 32, 25, 0, 0, 0.5]));
    const sp = tileSpheres(tiles);
    const s = sp.get('0_0')!;
    expect(s[0]).toBe(32);
    expect(s[1]).toBeCloseTo(12.5);
    expect(s[3]).toBeGreaterThan(45);
    const k = new ViewCone();
    // in a ravine, 2 m above the ground, looking 45° down along -z
    k.set(cam(32, 2, 32, 0, -45), 0.7);
    const keep = (key: string) => {
      const v = sp.get(key)!;
      return k.keeps(v[0]!, v[1]!, v[2]!, v[3]!, 30 + 64 * 0.71);
    };
    expect(keep('0_0')).toBe(true); // the camera's own tile
    expect(keep('0_-3')).toBe(true); // ahead
    expect(keep('0_4')).toBe(false); // behind
    expect(keep('3_3')).toBe(false); // behind, to the side
    const kept = [...sp.keys()].filter(keep).length;
    expect(kept).toBeLessThan(sp.size * 0.75);
    expect(kept).toBeGreaterThan(sp.size * 0.3);
  });
});

describe('ground cover: view culling and the distance tuft', () => {
  const k = new ViewCone();
  k.set(cam(0, 1.7, 0, 0, -6), 0.7);

  it('everything within the near radius stays, whatever the view', () => {
    expect(coverPick(k, 0, 0, 2.5, 2.5, 0.5, true)).toBe('near');
    expect(coverPick(k, -2, 0, 2, Math.hypot(2, 2), 0.5, false)).toBe('near');
    expect(COVER_NEAR).toBeGreaterThanOrEqual(3);
  });

  it('behind the camera beyond the near radius is culled, ahead is kept', () => {
    expect(coverPick(k, 0, 0, 8, 8, 0.5, true)).toBe(null);
    expect(coverPick(k, 0, 0, -8, 8, 0.5, true)).toBe('near');
  });

  it('grass beyond the threshold takes the distance tuft (dithered ±2 m), flowers and reeds never', () => {
    expect(coverPick(k, 0, 0, -(FAR_TUFT - 3), FAR_TUFT - 3, 0.99, true)).toBe('near');
    expect(coverPick(k, 0, 0, -(FAR_TUFT + 3), FAR_TUFT + 3, 0.01, true)).toBe('far');
    expect(coverPick(k, 0, 0, -FAR_TUFT, FAR_TUFT, 0.0, true)).toBe('far');
    expect(coverPick(k, 0, 0, -FAR_TUFT, FAR_TUFT, 1.0, true)).toBe('near');
    expect(coverPick(k, 0, 0, -25, 25, 0.5, false)).toBe('near');
  });
});
