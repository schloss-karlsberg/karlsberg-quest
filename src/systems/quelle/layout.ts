/**
 * The Karlsbergquelle (NEXT-SESSION §3.6): where the spring is and how its pieces sit, as pure
 * data and math (no three.js), shared by the scenery set (stone, wood) and the quelle system
 * (water, motes, the touch).
 *
 * Position: OpenStreetMap node 368031320 "Karlsbergquelle" (natural=spring, 49.3338291 N,
 * 7.3766361 E → UTM 32N → local 1061.0 / −834.5); the OSM Karlsbergbach starts at the same point
 * (public/data/paths.json) and the information board stands 5 m away. The LiDAR shows a small
 * ravine there running SSE → NNW down to the Karlsbergweiher; the spring sits at the foot of its
 * north-east flank, 59 m below the Orangerie terrace. So the stonework backs into that slope and
 * faces south-west (compass 234°) across the ravine floor, where the trail comes up from the
 * Weiher and climbs on the left (north-west) — as on the reference photo: path in front, steps on
 * the left, the trough before a low dry wall, the little arched spring house up the slope behind.
 *
 * Local frame of the set: u = to the right of a viewer facing the spring (≈ up the ravine, SE),
 * w = towards that viewer (SW), y up. `toWorld(u, w)` maps it (the kit's `face(234)` frame).
 */
import type { Era } from '../../core/era';

export const QUELLE = {
  x: 1061.0,
  z: -834.5,
  /** Compass facing of the spring's front (the viewer stands this way). */
  facing: 234,
} as const;

const YAW = Math.PI - (QUELLE.facing * Math.PI) / 180;
const CY = Math.cos(YAW);
const SY = Math.sin(YAW);

/** Local (u right, w towards the viewer) → world x/z. */
export function toWorld(u: number, w: number): [number, number] {
  return [QUELLE.x + u * CY + w * SY, QUELLE.z - u * SY + w * CY];
}

/** World x/z → local (u, w). */
export function toLocal(x: number, z: number): [number, number] {
  const dx = x - QUELLE.x;
  const dz = z - QUELLE.z;
  return [dx * CY - dz * SY, dx * SY + dz * CY];
}

/** Which look the stonework has in an era. */
export type QuelleLook = 'today' | 'baroque' | 'winter' | 'fire' | 'ruin';

export function lookFor(era: Era): QuelleLook {
  switch (era) {
    case 'today':
      return 'today';
    case '1793-02':
      return 'winter';
    case '1793-07':
      return 'fire';
    case '1796':
      return 'ruin';
    default:
      return 'baroque';
  }
}

/** The pieces in local coordinates (metres). */
export const PIECES = {
  /** Today: the hollowed log on two stumps, its axis along u. */
  trough: { u: 0.1, w: 1.15, len: 2.3, r: 0.29, inner: 0.22, stump: 0.36 },
  /** 1789…1796: the dressed stone basin before the Brunnenstube front. */
  basin: { u: 0.1, w: 1.0, len: 1.7, depth: 0.72, h: 0.62, wall: 0.12 },
  /** The low retaining wall (today) / the dressed front (baroque) behind the water. */
  wall: { u0: -2.7, u1: 2.7, w: 0.15, h: 1.12, thick: 0.55 },
  /** Where the pipe / spout leaves the wall, and how far it reaches. */
  pipe: { u: 0.25, y: 1.02, reach: 0.62 },
  /** The arched spring house up the slope behind (the Brunnenstube proper). */
  house: { u: 0.7, w: -4.3, width: 1.9, height: 1.55, depth: 1.6 },
  /** Steps on the left (north-west), climbing into the slope. */
  steps: { u: -3.35, w0: 1.1, n: 6, run: 0.62, width: 1.05 },
  /** The trail edge in front (mossy blocks). */
  edge: { w: 2.75, u0: -3.4, u1: 3.4 },
} as const;

type HeightAt = (x: number, z: number) => number;

/** The ground under local (u, w). */
export function groundLocal(h: HeightAt, u: number, w: number): number {
  const [x, z] = toWorld(u, w);
  return h(x, z);
}

/** Today's trough: the ground under both stumps and the log's axis height. */
export function troughFrame(h: HeightAt): { gl: number; gr: number; axisY: number } {
  const T = PIECES.trough;
  const gl = groundLocal(h, T.u - T.len * 0.33, T.w);
  const gr = groundLocal(h, T.u + T.len * 0.33, T.w);
  return { gl, gr, axisY: Math.max(gl, gr) + T.stump + T.r * 0.62 };
}

/** Base height of the stone basin (1789–1796). */
export function basinBase(h: HeightAt): number {
  const B = PIECES.basin;
  return Math.max(groundLocal(h, B.u - B.len / 2, B.w), groundLocal(h, B.u + B.len / 2, B.w)) - 0.1;
}

/** Base height of the dry wall / baroque front (lowest ground along its foot). */
export function wallBase(h: HeightAt, look: QuelleLook): number {
  const W = PIECES.wall;
  if (look === 'today') return groundLocal(h, PIECES.pipe.u, W.w - 0.2) - 0.08;
  return Math.min(groundLocal(h, -1.65, W.w - 0.2), groundLocal(h, 1.65, W.w - 0.2), groundLocal(h, 0, W.w - 0.2)) - 0.1;
}

/** The trough log's flat cut above its axis (m). */
export const TROUGH_CUT = 0.1;

export interface WaterSpec {
  /** Centre (world). */
  x: number;
  y: number;
  z: number;
  /** Along u / along w (m). */
  len: number;
  wid: number;
  look: QuelleLook;
}

/** The still water the player touches: in the log (today) or the basin (past eras). */
export function waterSpec(h: HeightAt, era: Era): WaterSpec {
  const look = lookFor(era);
  if (look === 'today') {
    const T = PIECES.trough;
    const { axisY } = troughFrame(h);
    const y = axisY + TROUGH_CUT - 0.05;
    const dy = y - axisY;
    const [x, z] = toWorld(T.u, T.w);
    return { x, y, z, len: T.len - 0.24, wid: 2 * Math.sqrt(Math.max(0.01, T.inner * T.inner - dy * dy)) - 0.01, look };
  }
  const B = PIECES.basin;
  const base = basinBase(h);
  const [x, z] = toWorld(B.u, B.w);
  return { x, y: base + (look === 'ruin' ? 0.3 : B.h - 0.1), z, len: B.len - 2 * B.wall, wid: B.depth - 2 * B.wall, look };
}

/** Where the water leaves the pipe / spout (world), or null (1796: the spout was torn out). */
export function outlet(h: HeightAt, era: Era): { x: number; y: number; z: number; u: number; w: number } | null {
  const look = lookFor(era);
  const P = PIECES.pipe;
  const W = PIECES.wall;
  if (look === 'ruin') return null;
  if (look === 'today') {
    const w = W.w + P.reach;
    const [x, z] = toWorld(P.u, w);
    return { x, y: wallBase(h, look) + P.y - 0.035, z, u: P.u, w };
  }
  const w = W.w + P.reach * 0.55;
  const [x, z] = toWorld(P.u, w);
  return { x, y: wallBase(h, look) + P.y + 0.04, z, u: P.u, w };
}

/** Touch point: the middle of the water surface (local u, w). */
export function touchLocal(era: Era): [number, number] {
  return lookFor(era) === 'today' ? [PIECES.trough.u, PIECES.trough.w] : [PIECES.basin.u, PIECES.basin.w];
}

/** Interaction reach (m, horizontal) from the touch point. */
export const REACH = 2.1;

/** Is a player at x/z facing yaw (radians, three.js: forward = (−sin, −cos)) able to touch the water? */
export function canTouch(px: number, pz: number, yaw: number, era: Era): boolean {
  const [tu, tw] = touchLocal(era);
  const [tx, tz] = toWorld(tu, tw);
  const dx = tx - px;
  const dz = tz - pz;
  const d = Math.hypot(dx, dz);
  if (d > REACH) return false;
  if (d < 0.7) return true;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return (dx * fx + dz * fz) / d > 0.35;
}

/** Yaw (three.js) that faces the water from x/z. */
export function yawToWater(px: number, pz: number, era: Era): number {
  const [tu, tw] = touchLocal(era);
  const [tx, tz] = toWorld(tu, tw);
  return Math.atan2(-(tx - px), -(tz - pz));
}

/**
 * The Karlsbergbach below the spring: OSM line (paths.json, "Karlsbergbach") from the overflow
 * down the ravine. The first two points are the runnel from the trough's low end.
 */
export const BROOK_OSM: readonly [number, number][] = [
  [1039, -849],
  [1021, -855],
  [996, -864],
  [991, -865],
];

/** Length of brook drawn (m along the line). */
export const BROOK_LEN = 46;

/**
 * Brook centre line as world x/z samples every `step` m: from the trough's overflow along the
 * runnel, then the OSM line, each sample pulled to the lowest ground within ±`snap` m across the
 * line (the OSM line is a few metres off the LiDAR's ravine floor) and smoothed.
 */
export function brookLine(heightAt: (x: number, z: number) => number, era: Era, step = 1, snap = 3): [number, number][] {
  const look = lookFor(era);
  const start = look === 'today' ? toWorld(PIECES.trough.u - PIECES.trough.len / 2 - 0.15, PIECES.trough.w + 0.1) : toWorld(PIECES.basin.u - PIECES.basin.len / 2 - 0.2, PIECES.basin.w + 0.1);
  const runnel = toWorld(-2.3, 1.95);
  const pts: [number, number][] = [start, runnel, ...BROOK_OSM];
  // resample by arc length
  const out: [number, number][] = [];
  let carry = 0;
  let total = 0;
  for (let i = 0; i + 1 < pts.length && total < BROOK_LEN; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    for (let s = carry; s < len && total < BROOK_LEN; s += step, total += step) {
      const t = s / len;
      out.push([ax + (bx - ax) * t, az + (bz - az) * t]);
    }
    carry = ((carry - len) % step + step) % step;
  }
  // pull to the ravine floor (never the first few: they leave the trough where it stands)
  const snapped = out.map(([x, z], i) => {
    if (i < 4) return [x, z] as [number, number];
    const [px, pz] = out[Math.max(0, i - 1)]!;
    const [nx, nz] = out[Math.min(out.length - 1, i + 1)]!;
    let ux = nx - px;
    let uz = nz - pz;
    const l = Math.hypot(ux, uz) || 1;
    ux /= l;
    uz /= l;
    let best: [number, number] = [x, z];
    let bh = heightAt(x, z);
    for (let o = -snap; o <= snap; o += 0.5) {
      const qx = x - uz * o;
      const qz = z + ux * o;
      const h = heightAt(qx, qz) + Math.abs(o) * 0.02; // prefer the line when it is a tie
      if (h < bh) {
        bh = h;
        best = [qx, qz];
      }
    }
    return best;
  });
  // smooth (3 passes, ends pinned)
  let cur = snapped;
  for (let p = 0; p < 3; p++) {
    cur = cur.map((q, i) => {
      if (i === 0 || i === cur.length - 1) return q;
      const a = cur[i - 1]!;
      const b = cur[i + 1]!;
      return [(a[0] + q[0] * 2 + b[0]) / 4, (a[1] + q[1] * 2 + b[1]) / 4] as [number, number];
    });
  }
  return cur;
}

/** Keep clear of trees / scattered props / caches: centres (world) and radii. */
export function clearings(): [number, number, number][] {
  const [ax, az] = toWorld(0, 1.6);
  const [fx, fz] = toWorld(0.4, 6.5);
  const [hx, hz] = toWorld(PIECES.house.u, PIECES.house.w - 0.6);
  const [sx, sz] = toWorld(PIECES.steps.u, -0.6);
  return [
    [ax, az, 5.2],
    [fx, fz, 3.5],
    [hx, hz, 4.5],
    [sx, sz, 2.0],
  ];
}
