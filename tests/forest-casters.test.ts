import { Group, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { Forest, casterInReach, tileInReach } from '../src/world/forest';
import { type ModelTrees, SHADOW_REACH } from '../src/world/vegetation/trees';

/** A camera at (x, y, z) looking along yaw (0 = -z, 90 = +x) and pitch (degrees, negative = down). */
function cam(x: number, y: number, z: number, yawDeg: number, pitchDeg = -6): PerspectiveCamera {
  const c = new PerspectiveCamera(70, 16 / 9, 0.1, 3000);
  c.position.set(x, y, z);
  c.rotation.order = 'YXZ';
  c.rotation.set((pitchDeg * Math.PI) / 180, (-yawDeg * Math.PI) / 180, 0);
  c.updateMatrixWorld(true);
  return c;
}

/** Stands in for the model trees: records what the forest shows and what it only lets cast. */
class Recorder {
  readonly object = new Group();
  readonly stats = { lod0: 0, lod1: 0, imp: 0, calls: 0 };
  shown = new Set<string>();
  casters = new Set<string>();
  begin(): void {
    this.shown = new Set();
    this.casters = new Set();
  }
  push(x: number, _y: number, z: number): void {
    this.shown.add(`${x}|${z}`);
    this.casters.add(`${x}|${z}`);
  }
  cast(x: number, _y: number, z: number): void {
    this.casters.add(`${x}|${z}`);
  }
  end(): void {}
  setAlphaToCoverage(): void {}
  shadowPass(): number {
    return 0;
  }
}

/** A stand on a 12 m grid, ± 240 m around the origin (x, y, z, height, rotation, kind, variation). */
function stand(): { tiles: Map<string, Float32Array>; trees: [number, number][] } {
  const byTile = new Map<string, number[]>();
  const trees: [number, number][] = [];
  for (let x = -240; x <= 240; x += 12)
    for (let z = -240; z <= 240; z += 12) {
      const key = `${Math.floor(x / 64)}_${Math.floor(z / 64)}`;
      if (!byTile.has(key)) byTile.set(key, []);
      byTile.get(key)!.push(x, 0, z, 24, 0, 0, 0.5);
      trees.push([x, z]);
    }
  return { tiles: new Map([...byTile].map(([k, v]) => [k, new Float32Array(v)])), trees };
}

/** The forest with the recorder as its model trees (shadow box: its initial ± 75 m). */
function forest(casting: boolean): { f: Forest; rec: Recorder; trees: [number, number][] } {
  const f = new Forest();
  const rec = new Recorder();
  const { tiles, trees } = stand();
  f.setTrees(tiles, 'today');
  f.setModels(rec as unknown as ModelTrees);
  f.casting = () => casting;
  return { f, rec, trees };
}

/** Where boot.ts puts the shadow focus: ahead of the camera by 0.35 × the box's half extent. */
function focusOf(c: PerspectiveCamera, yawDeg: number, range: number): [number, number] {
  const a = (yawDeg * Math.PI) / 180;
  return [c.position.x + Math.sin(a) * range * 0.35, c.position.z - Math.cos(a) * range * 0.35];
}

describe('forest: shadow casters do not depend on the view', () => {
  const RANGE = 75;

  it('reach: a disc around the expected focus, whole tiles rejected by their square', () => {
    expect(casterInReach(100, 0, 0, 0, 100)).toBe(true);
    expect(casterInReach(100.1, 0, 0, 0, 100)).toBe(false);
    expect(tileInReach(0, 0, 32, 32, 1)).toBe(true); // the focus stands in the tile
    expect(tileInReach(2, 0, 32, 32, 95)).toBe(false); // the tile starts at x = 128: 96 m away
    expect(tileInReach(2, 0, 32, 32, 96)).toBe(true);
    expect(tileInReach(-2, -2, 0, 0, 90)).toBe(false); // nearest corner (-64, -64): 90.5 m
    expect(tileInReach(-2, -2, 0, 0, 91)).toBe(true);
  });

  it('a tree behind the camera is not shown but still casts; far behind it does neither', () => {
    const { f, rec } = forest(true);
    f.update(cam(0, 2, 0, 0), 2);
    expect(rec.shown.has('0|-48')).toBe(true); // ahead
    expect(rec.shown.has('0|48')).toBe(false); // behind, past the 30 m everything is kept within
    expect(rec.casters.has('0|48')).toBe(true);
    expect(rec.casters.has('0|216')).toBe(false);
    expect(f.stats.culled).toBeGreaterThan(0);
  });

  it('without sun shadows (Niedrig) the view alone decides', () => {
    const { f, rec } = forest(false);
    f.update(cam(0, 2, 0, 0), 2);
    expect(rec.casters.has('0|48')).toBe(false);
    expect([...rec.casters].every((k) => rec.shown.has(k))).toBe(true);
  });

  for (const pitch of [-6, -50]) {
    it(`every tree in the shadow box's reach casts, whichever way the view points (pitch ${pitch}°)`, () => {
      const { f, rec, trees } = forest(true);
      for (let yaw = 0; yaw < 360; yaw += 10) {
        const c = cam(6, 2, -4, yaw, pitch);
        f.invalidate();
        f.update(c, 2);
        const [fx, fz] = focusOf(c, yaw, RANGE);
        const want = trees.filter(([x, z]) => Math.hypot(x - fx, z - fz) <= RANGE + SHADOW_REACH).map(([x, z]) => `${x}|${z}`);
        expect(want.length).toBeGreaterThan(200);
        expect(want.filter((k) => !rec.casters.has(k)), `yaw ${yaw}`).toEqual([]);
      }
    });
  }

  it('a turn between two rebuilds keeps them too (the lists are built 24 m wider)', () => {
    const { f, rec, trees } = forest(true);
    f.update(cam(0, 2, 0, 90), 2);
    // 19° on: no rebuild yet (20°), the focus has moved 8.7 m
    const c = cam(0, 2, 0, 109);
    const before = rec.casters;
    f.update(c, 2);
    expect(rec.casters).toBe(before);
    const [fx, fz] = focusOf(c, 109, RANGE);
    const want = trees.filter(([x, z]) => Math.hypot(x - fx, z - fz) <= RANGE + SHADOW_REACH).map(([x, z]) => `${x}|${z}`);
    expect(want.filter((k) => !rec.casters.has(k))).toEqual([]);
  });

  it('switching the shadows on rebuilds the lists', () => {
    const { f, rec } = forest(false);
    let on = false;
    f.casting = () => on;
    const c = cam(0, 2, 0, 0);
    f.update(c, 2);
    expect(rec.casters.has('0|48')).toBe(false);
    on = true;
    f.update(c, 2);
    expect(rec.casters.has('0|48')).toBe(true);
  });
});
