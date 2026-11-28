import { Group, PerspectiveCamera } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { atmosphere } from '../src/world/atmosphere';
import { dirFromAzEl } from '../src/world/eraPresets';
import { Forest, shadowInSector, tileInReach } from '../src/world/forest';
import { CAST_MAX, CAST_STRETCH, type ModelTrees, SHADOW_REACH, castGap, shadowLength } from '../src/world/vegetation/trees';

/** A camera at (x, y, z) looking along yaw (0 = -z, 90 = +x) and pitch (degrees, negative = down). */
function cam(x: number, y: number, z: number, yawDeg: number, pitchDeg = -6): PerspectiveCamera {
  const c = new PerspectiveCamera(70, 16 / 9, 0.1, 3000);
  c.position.set(x, y, z);
  c.rotation.order = 'YXZ';
  c.rotation.set((pitchDeg * Math.PI) / 180, (-yawDeg * Math.PI) / 180, 0);
  c.updateMatrixWorld(true);
  return c;
}

/** The present day's afternoon sun: from the south-west (x east, z south), 19° up. */
const SUN = dirFromAzEl(222, 19);
/** Height (m) of every tree of the test stand. */
const H = 24;

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
      byTile.get(key)!.push(x, 0, z, H, 0, 0, 0.5);
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

/** The stand's trees that cast into a box of half extent `range` around (fx, fz), as keys. */
function castersOf(trees: [number, number][], fx: number, fz: number, range: number): string[] {
  return trees.filter(([x, z]) => castGap(x, z, H, fx, fz, ...SUN) <= range + SHADOW_REACH).map(([x, z]) => `${x}|${z}`);
}

/** Horizontal half field of view (rad) of the test camera (70° vertical, 16:9). */
const HALF_FOV = Math.atan(Math.tan((35 * Math.PI) / 180) * (16 / 9));

/**
 * Does the shadow of the tree at (x, z) reach the picture of a camera at `c` looking along
 * `yawDeg`: any point of it, a crown wide (`SHADOW_REACH`), inside the horizontal field of view?
 * Checked metre by metre, not the way the forest does it.
 */
function shadowOnScreen(x: number, z: number, c: PerspectiveCamera, yawDeg: number): boolean {
  const a = (yawDeg * Math.PI) / 180;
  const fx = Math.sin(a);
  const fz = -Math.cos(a);
  const sl = Math.hypot(SUN[0], SUN[2]);
  const len = shadowLength(H, SUN[1]);
  for (let t = 0; t <= len; t += 1) {
    const vx = x - (SUN[0] / sl) * t - c.position.x;
    const vz = z - (SUN[2] / sl) * t - c.position.z;
    const d = Math.hypot(vx, vz);
    if (d <= SHADOW_REACH) return true;
    const off = Math.acos(Math.min(1, Math.max(-1, (vx * fx + vz * fz) / d))) - HALF_FOV;
    if (off <= 0 || d * Math.sin(Math.min(off, Math.PI / 2)) <= SHADOW_REACH) return true;
  }
  return false;
}

describe('shadow reach: a tree casts while its shadow can fall into the box', () => {
  it('the shadow is as long as the sun is low, with room for falling ground, and capped', () => {
    expect(shadowLength(20, Math.sin((19 * Math.PI) / 180))).toBeCloseTo((CAST_STRETCH * 20) / Math.tan((19 * Math.PI) / 180), 3);
    expect(shadowLength(20, Math.sin((38 * Math.PI) / 180))).toBeCloseTo((CAST_STRETCH * 20) / Math.tan((38 * Math.PI) / 180), 3);
    expect(shadowLength(38, 0.2)).toBe(CAST_MAX);
    expect(shadowLength(20, 0)).toBe(CAST_MAX);
    expect(shadowLength(20, 1)).toBe(0);
  });

  it('the gap runs from the point to the shadow: its foot, its side or its tip', () => {
    // sun in the west (−x), 45° up: a 20 m tree at the origin throws 23 m to the east
    const s = Math.SQRT1_2;
    const L = shadowLength(20, s);
    expect(L).toBeCloseTo(23, 5);
    expect(castGap(0, 0, 20, -30, 0, -s, s, 0)).toBeCloseTo(30, 5); // on the sun's side: the foot
    expect(castGap(0, 0, 20, 10, 7, -s, s, 0)).toBeCloseTo(7, 5); // beside the shadow
    expect(castGap(0, 0, 20, 50, 0, -s, s, 0)).toBeCloseTo(50 - L, 5); // past the tip
    // … so a tree 60 m towards the sun casts into a box that a tree 60 m down-sun has left
    const low = dirFromAzEl(270, 19);
    expect(castGap(-60, 0, 25, 0, 0, ...low)).toBeCloseTo(0, 5);
    expect(castGap(60, 0, 25, 0, 0, ...low)).toBeCloseTo(60, 5);
    // straight overhead there is no direction: the foot's distance
    expect(castGap(3, 4, 20, 0, 0, 0, 1, 0)).toBe(5);
  });

  it('a focus that moves by d changes the gap by at most d (the lists allow for the drift)', () => {
    for (let i = 0; i < 200; i++) {
      const r = (k: number) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1) * 150;
      const g0 = castGap(r(1), r(2), 24, r(3), r(4), ...SUN);
      const g1 = castGap(r(1), r(2), 24, r(3) + 9, r(4) - 12, ...SUN);
      expect(Math.abs(g1 - g0)).toBeLessThanOrEqual(15 + 1e-9);
    }
  });
});

describe('forest: shadow casters do not depend on the view', () => {
  const RANGE = 75;
  beforeEach(() => void atmosphere.uSunDir.value.set(...SUN));

  it('whole tiles are rejected by their square: the gap plus the longest shadow', () => {
    expect(tileInReach(0, 0, 32, 32, 1)).toBe(true); // the focus stands in the tile
    expect(tileInReach(4, 0, 32, 32, 223 - CAST_MAX)).toBe(false); // the tile starts at x = 256: 224 m away
    expect(tileInReach(4, 0, 32, 32, 224 - CAST_MAX)).toBe(true);
    expect(tileInReach(-3, -3, 0, 0, 181 - CAST_MAX)).toBe(false); // nearest corner (-128, -128): 181.02 m
    expect(tileInReach(-3, -3, 0, 0, 182 - CAST_MAX)).toBe(true);
  });

  it('a tree behind the camera is not shown but still casts; far behind it does neither', () => {
    const { f, rec } = forest(true);
    // looking north-east, the sun at the back
    f.update(cam(0, 2, 0, 42), 2);
    expect(rec.shown.has('36|-36')).toBe(true); // ahead
    expect(rec.shown.has('-36|36')).toBe(false); // behind, past the 30 m everything is kept within
    expect(rec.casters.has('-36|36')).toBe(true);
    expect(rec.casters.has('-48|48')).toBe(true); // 68 m behind: its shadow still ends in the box
    expect(rec.casters.has('-216|216')).toBe(false);
    expect(f.stats.culled).toBeGreaterThan(0);
  });

  it("down-sun of the box a tree casts away from it: no caster past a crown's width", () => {
    const { f, rec } = forest(true);
    const c = cam(0, 2, 0, 42);
    f.update(c, 2);
    const [fx, fz] = focusOf(c, 42, RANGE);
    // (the lists themselves are 24 m wider, for the focus's drift)
    const far = [...rec.casters].map((k) => k.split('|').map(Number) as [number, number]).filter(([x, z]) => !rec.shown.has(`${x}|${z}`) && Math.hypot(x - fx, z - fz) > RANGE + SHADOW_REACH + 24);
    expect(far.length).toBeGreaterThan(20);
    // all of them stand towards the sun
    for (const [x, z] of far) expect((x - fx) * SUN[0] + (z - fz) * SUN[2]).toBeGreaterThan(0);
  });

  it('a shadow that points away behind the camera is not drawn: looking into the sun costs what it did', () => {
    const { f, rec } = forest(true);
    // looking south-west, into the sun: the trees behind throw their shadows further back
    f.update(cam(0, 2, 0, 222), 2);
    expect(rec.shown.has('36|-36')).toBe(false);
    expect(rec.casters.has('36|-36')).toBe(false); // 51 m behind, in the box, shading nothing in view
    expect(rec.casters.has('-36|36')).toBe(true); // ahead
    const behind = [...rec.casters].filter((k) => !rec.shown.has(k));
    // what stays of the unseen ones stands beside the camera, within a crown of the sector's edge
    for (const k of behind) {
      const [x, z] = k.split('|').map(Number) as [number, number];
      // (the view direction is (−0.67, 0.74): how far behind the camera's line the tree stands)
      expect(-(x * -0.669 + z * 0.743), k).toBeLessThan(26);
    }
    // … and with the sun at the back they all cast into the picture
    f.update(cam(0, 2, 0, 42), 2);
    expect([...rec.casters].filter((k) => !rec.shown.has(k)).length).toBeGreaterThan(behind.length * 2);
  });

  it('the shadow test: a point of the shadow in the sector, near it, or near the camera', () => {
    // camera at the origin looking along −z, sector ± 90°; shadows run 40 m
    const at = (x: number, z: number, ax: number, az: number, margin = 0) => shadowInSector(x, z, 40, ax, az, 0, 0, 0, -1, Math.PI / 2, margin);
    expect(at(0, 30, 0, 1)).toBe(false); // behind, pointing back
    expect(at(0, 30, 0, -1)).toBe(true); // behind, pointing forward: its tip lies 10 m ahead
    expect(at(0, 60, 0, -1)).toBe(false); // too far behind to get there
    expect(at(0, 60, 0, -1, 20)).toBe(true); // … but for a margin of 20 m
    expect(at(50, 20, 0, -1)).toBe(true); // crosses the sector's edge
    expect(at(50, 20, 0, 1)).toBe(false);
    expect(at(50, 20, 0, 1, 20)).toBe(true); // … but within a margin of 20 m of it
    expect(at(10, -80, 1, 0)).toBe(true); // in front: always
    // a narrow sector (a long lens): a shadow that crosses it with both ends outside
    expect(shadowInSector(-60, -100, 120, 1, 0, 0, 0, 0, -1, 0.3, 0)).toBe(true);
    expect(shadowInSector(-60, 100, 120, 1, 0, 0, 0, 0, -1, 0.3, 0)).toBe(false);
  });

  it('without sun shadows (Niedrig) the view alone decides', () => {
    const { f, rec } = forest(false);
    f.update(cam(0, 2, 0, 42), 2);
    expect(rec.casters.has('-36|36')).toBe(false);
    expect([...rec.casters].every((k) => rec.shown.has(k))).toBe(true);
  });

  it('every tree whose shadow the picture can show casts, whichever way the view points', () => {
    const { f, rec, trees } = forest(true);
    let most = 0;
    let least = Infinity;
    for (let yaw = 0; yaw < 360; yaw += 10) {
      const c = cam(6, 2, -4, yaw);
      f.invalidate();
      f.update(c, 2);
      // the lists stand while the view turns up to 20° either way and the focus drifts with it
      for (const turn of [-19, 0, 19]) {
        const [fx, fz] = focusOf(c, yaw + turn, RANGE);
        const want = castersOf(trees, fx, fz, RANGE).filter((k) => {
          const [x, z] = k.split('|').map(Number) as [number, number];
          return shadowOnScreen(x, z, c, yaw + turn);
        });
        expect(want.length).toBeGreaterThan(100);
        expect(want.filter((k) => !rec.casters.has(k)), `yaw ${yaw} turned ${turn}`).toEqual([]);
      }
      const unseen = rec.casters.size - rec.shown.size;
      most = Math.max(most, unseen);
      least = Math.min(least, unseen);
    }
    // looking down-sun every tree behind casts into the picture, looking into the sun few do
    expect(least).toBeGreaterThan(0);
    expect(most).toBeGreaterThan(least * 2);
  });

  it('… and when the camera walks 8 m without a rebuild', () => {
    const { f, rec, trees } = forest(true);
    for (const yaw of [42, 132, 222, 312]) {
      f.invalidate();
      f.update(cam(0, 2, 0, yaw), 2);
      const built = rec.casters;
      for (const [dx, dz] of [[7.9, 0], [-7.9, 0], [0, 7.9], [0, -7.9]] as const) {
        const c = cam(dx, 2, dz, yaw);
        f.update(c, 2);
        expect(rec.casters).toBe(built);
        const [fx, fz] = focusOf(c, yaw, RANGE);
        const want = castersOf(trees, fx, fz, RANGE).filter((k) => {
          const [x, z] = k.split('|').map(Number) as [number, number];
          return shadowOnScreen(x, z, c, yaw);
        });
        expect(want.filter((k) => !rec.casters.has(k)), `yaw ${yaw} moved ${dx}, ${dz}`).toEqual([]);
      }
    }
  });

  it('looking steeply down (whole tiles leave the view cone) every tree in reach casts', () => {
    const { f, rec, trees } = forest(true);
    for (let yaw = 0; yaw < 360; yaw += 30) {
      const c = cam(6, 2, -4, yaw, -50);
      f.invalidate();
      f.update(c, 2);
      const [fx, fz] = focusOf(c, yaw, RANGE);
      const want = castersOf(trees, fx, fz, RANGE);
      expect(want.length).toBeGreaterThan(200);
      expect(want.filter((k) => !rec.casters.has(k)), `yaw ${yaw}`).toEqual([]);
    }
  });

  it("the lists follow the sun: another era's light, the party's dusk", () => {
    const { f, rec } = forest(true);
    const c = cam(0, 2, 0, 42);
    f.update(c, 2);
    expect(rec.casters.has('-72|72')).toBe(true); // 128 m from the focus, its shadow 80 m long
    const before = rec.casters;
    // two degrees: the lists stand
    atmosphere.uSunDir.value.set(...dirFromAzEl(224, 19));
    f.update(c, 2);
    expect(rec.casters).toBe(before);
    // the sun moves to the north-east: the trees behind cast away from the box, the ones ahead into it
    atmosphere.uSunDir.value.set(...dirFromAzEl(42, 19));
    f.update(c, 2);
    expect(rec.casters).not.toBe(before);
    expect(rec.casters.has('-72|72')).toBe(false);
    expect(rec.casters.has('120|-120')).toBe(true);
  });

  it('switching the shadows on rebuilds the lists', () => {
    const { f, rec } = forest(false);
    let on = false;
    f.casting = () => on;
    const c = cam(0, 2, 0, 42);
    f.update(c, 2);
    expect(rec.casters.has('-36|36')).toBe(false);
    on = true;
    f.update(c, 2);
    expect(rec.casters.has('-36|36')).toBe(true);
  });
});
