/**
 * The Karlsbergquelle (NEXT-SESSION §3.6): where the spring is and how its pieces sit, as pure
 * data and math (no three.js), shared by the scenery set (stone, wood) and the quelle system
 * (water, motes, the touch).
 *
 * Position (TASK-087): the spring sits on the RIGHT of the ravine as the tour walks up it from the
 * Karlsbergweiher, at the foot of the south-west flank.
 *  - OpenStreetMap node 368031320 "Karlsbergquelle" (natural=spring, 49.3338291 N, 7.3766361 E →
 *    UTM 32N → local 1061.0 / −834.5) lies 2.3 m to the right of the OSM footpath that comes up
 *    from the Weiher (public/data/paths.json, 1046.6/−848.4 → 1064.2/−835.0), and the OSM
 *    Karlsbergbach, which starts at the node, stays on that side of the path all the way down.
 *    The path then turns right in a hairpin (apex 1066.6/−830.8) and climbs back along the
 *    south-west flank, so the spring lies inside the bend.
 *  - The 1 m LiDAR terrain shows a flat bench about 8 m wide on the ravine floor (the path) and,
 *    along the foot of the south-west bank, a channel that starts in a small hollow at
 *    1058.5 / −830.5 and runs north-west to the Weiher (x − z ≈ 1889).
 * So the stonework backs into the south-west flank at that hollow, 4 m from the OSM node, and
 * faces north-north-east (compass 24°) across the ravine floor: the path in front, coming up from
 * the Weiher on the right and climbing away round the hairpin on the left, the steps on the left
 * up to the path's upper leg, the trough before a low dry wall, the little arched spring house up
 * the slope behind, the brook leaving to the right. That is the reference photo's arrangement.
 * (Until TASK-087 the same set stood at the node itself, backed into the north-east flank and
 * facing 234°: on the left of the people walking up, its end towards them.)
 *
 * Local frame of the set: u = to the right of a viewer facing the spring (≈ down the ravine, NW),
 * w = towards that viewer (NNE), y up. `toWorld(u, w)` maps it (the kit's `face(24)` frame).
 */
import type { Era } from '../../core/era';
import { clearings as bleicheClearings } from '../bleiche/layout';

export const QUELLE = {
  x: 1058.5,
  z: -831.0,
  /** Compass facing of the spring's front (the viewer stands this way). */
  facing: 24,
} as const;

/** The OpenStreetMap node of the spring (local frame): the reference the position is checked against. */
export const OSM_SPRING = { x: 1061.0, z: -834.5 } as const;

/**
 * The OSM footpath the tour walks up the ravine, to the hairpin's apex above the spring
 * (paths.json nodes, world x/z, in walking order): the reference for "which side of the gorge".
 */
export const TOUR_PATH: readonly (readonly [number, number])[] = [
  [1013.9, -867.5],
  [1035.7, -855.1],
  [1046.6, -848.4],
  [1064.2, -835.0],
  [1066.6, -830.8],
];

/**
 * How far (m) world x/z lies to the right of the tour path's nearest leg, for people walking up
 * from the Weiher (negative: on their left).
 */
export function rightOfTourPath(x: number, z: number): number {
  let best = Infinity;
  let side = 0;
  for (let i = 0; i + 1 < TOUR_PATH.length; i++) {
    const [ax, az] = TOUR_PATH[i]!;
    const [bx, bz] = TOUR_PATH[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const l = Math.hypot(dx, dz);
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (l * l)));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) {
      best = d;
      // east is +x and south is +z, so the right-hand normal of a heading (dx, dz) is (−dz, dx)
      side = ((x - ax) * -dz + (z - az) * dx) / l;
    }
  }
  return side;
}

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
  /** Steps on the left (south-east, up the ravine), climbing the slope towards the path's upper leg. */
  steps: { u: -3.35, w0: 1.1, n: 6, run: 0.62, width: 1.05 },
  /** The trail edge in front (mossy blocks). */
  edge: { w: 2.75, u0: -3.4, u1: 3.4 },
} as const;

type HeightAt = (x: number, z: number) => number;

/** The terrain grid (public/data/terrain/meta.json: origin, cell; the 2025 and 1789 heights share it). */
export const TERRAIN_GRID = { x0: 151, z0: -2149, cell: 2 } as const;

/**
 * The ground as the terrain mesh draws it: LOD 0 splits each 2 m cell along its (x1, z0)–(x0, z1)
 * diagonal (world/terrain.ts `lodGeometry`), so between the samples it is two flat triangles, not
 * the bilinear patch `heightAt` gives (up to ~10 cm apart on a ravine floor). Ground decals (the
 * brook, the trail) and slabs laid on the ground sample this, so they lie on the triangles.
 */
export function meshGround(h: HeightAt, x: number, z: number, grid: { x0: number; z0: number; cell: number } = TERRAIN_GRID): number {
  const fc = (x - grid.x0) / grid.cell;
  const fr = (z - grid.z0) / grid.cell;
  const c = Math.floor(fc);
  const r = Math.floor(fr);
  const tx = fc - c;
  const ty = fr - r;
  const x0 = grid.x0 + c * grid.cell;
  const z0 = grid.z0 + r * grid.cell;
  const h10 = h(x0 + grid.cell, z0);
  const h01 = h(x0, z0 + grid.cell);
  if (tx + ty <= 1) {
    const h00 = h(x0, z0);
    return h00 + (h10 - h00) * tx + (h01 - h00) * ty;
  }
  const h11 = h(x0 + grid.cell, z0 + grid.cell);
  return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - ty);
}

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
/** The tour uses the trail-side forecourt, including the approach outside the mossy edge. */
export const TOUR_REACH = 3.25;

/** Is a player at x/z facing yaw (radians, three.js: forward = (−sin, −cos)) able to touch the water? */
export function canTouch(px: number, pz: number, yaw: number, era: Era, reach = REACH): boolean {
  // only from the front: on the slope behind the wall the water is still within REACH, but the
  // wall (1.1 m high, 0.55 m thick) stands between
  if (toLocal(px, pz)[1] < PIECES.wall.w) return false;
  const [tu, tw] = touchLocal(era);
  const [tx, tz] = toWorld(tu, tw);
  const dx = tx - px;
  const dz = tz - pz;
  const d = Math.hypot(dx, dz);
  if (d > reach) return false;
  if (d < 0.7) return true;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return (dx * fx + dz * fz) / d > 0.35;
}

/**
 * Is a player at x/z close enough before the trough to look into it, whichever way they face
 * (the tour's find, E „Untersuchen“)? Only from the front, like `canTouch`.
 */
export function canFind(px: number, pz: number, era: Era, reach = TOUR_REACH): boolean {
  if (toLocal(px, pz)[1] < PIECES.wall.w) return false;
  const [tu, tw] = touchLocal(era);
  const [tx, tz] = toWorld(tu, tw);
  return Math.hypot(tx - px, tz - pz) <= reach;
}

/**
 * Today's overflow: the water runs over a lip at the trough's low end (its right, +u) and falls to
 * the runnel. Where it leaves (world) and the ground it falls to; null in the other eras (the
 * basin drains below ground).
 */
export function overflow(h: HeightAt, era: Era): { x: number; y: number; z: number; toY: number } | null {
  if (lookFor(era) !== 'today') return null;
  const T = PIECES.trough;
  const u = T.u + T.len / 2 + OVERFLOW_LIP;
  const [x, z] = toWorld(u, T.w);
  return { x, y: waterSpec(h, era).y - 0.015, z, toY: groundLocal(h, u + 0.2, T.w) + 0.03 };
}

/** How far the overflow lip stands out of the trough's end (m). */
export const OVERFLOW_LIP = 0.14;

/** Yaw (three.js) that faces the water from x/z. */
export function yawToWater(px: number, pz: number, era: Era): number {
  const [tu, tw] = touchLocal(era);
  const [tx, tz] = toWorld(tu, tw);
  return Math.atan2(-(tx - px), -(tz - pz));
}

/**
 * The Karlsbergbach below the spring: OSM line (paths.json, "Karlsbergbach") from the overflow
 * down the ravine and out past the Bleiche's meadow towards the Weiher. The first two points are
 * the runnel from the trough's low end (its right, down the ravine).
 */
export const BROOK_OSM: readonly [number, number][] = [
  [1039, -849],
  [1021, -855],
  [996, -864],
  [991, -865],
  [966, -873],
];

/** Where the runnel from the trough's low end turns down the ravine (local u, w). */
export const RUNNEL = [2.3, 1.95] as const;

/**
 * Length of brook drawn (m along the line): down the ravine and on past the 1789 Bleiche, whose
 * wash corner stands on its bank; the last 6 m fade out beyond the green (water.ts BROOK_FRAG).
 */
export const BROOK_LEN = 80;

/** The length the touch scene's pulses were tuned on (water.ts stretches them to the drawn length). */
export const BROOK_REF = 46;

/** Half width of the brook's ground ribbon once it has grown (m; the wet bed fades out inside it). */
export const BROOK_HALF = 0.92;

/**
 * Where the drawn brook keeps off (world x, z, radius): the Bleiche's clearings, 0.3 m wider. In
 * 1789 the LiDAR-free meadow there falls away northwards, so the snap would pull the bed towards
 * the green; it stays out of the clearings instead, the wash corner on its bank.
 */
const KEEP_OFF: readonly (readonly [number, number, number])[] = bleicheClearings().map(([x, z, r]) => [x, z, r + 0.3] as const);

const keptOff = (x: number, z: number) => KEEP_OFF.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r);

/**
 * OSM footpaths beside and across the brook below the spring (paths.json walk graph; the terrain
 * draws them today, 0.9 m half width): the bank stones and ferns keep off them.
 */
export const BROOK_PATHS: readonly (readonly (readonly [number, number])[])[] = [
  [
    [1066.6, -830.8],
    [1064.2, -835.0],
    [1046.6, -848.4],
    [1035.7, -855.1],
    [1013.9, -867.5],
    [992.8, -863.8],
    [967.9, -859.4],
  ],
  [
    [1007.9, -848.0],
    [1026.3, -860.8],
  ],
];

/** Half width of an OSM footpath as the terrain draws it (world/world.ts paths raster). */
export const PATH_HALF = 0.9;

/**
 * Brook centre line as world x/z samples every `step` m: from the trough's overflow along the
 * runnel, then the OSM line, each sample pulled to the lowest ground within ±`snap` m across the
 * line (the OSM line is a few metres off the LiDAR's ravine floor), never into the Bleiche's
 * clearings (`KEEP_OFF`), and smoothed.
 */
export function brookLine(heightAt: (x: number, z: number) => number, era: Era, step = 1, snap = 3): [number, number][] {
  const look = lookFor(era);
  const start = look === 'today' ? toWorld(PIECES.trough.u + PIECES.trough.len / 2 + 0.15, PIECES.trough.w + 0.1) : toWorld(PIECES.basin.u + PIECES.basin.len / 2 + 0.2, PIECES.basin.w + 0.1);
  const runnel = toWorld(RUNNEL[0], RUNNEL[1]);
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
    let bh = keptOff(x, z) ? Infinity : heightAt(x, z);
    for (let o = -snap; o <= snap; o += 0.5) {
      const qx = x - uz * o;
      const qz = z + ux * o;
      if (keptOff(qx, qz)) continue;
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

/** One strand of the trail: local (u, w, half width m) control points. */
export type TrailStrand = readonly (readonly [number, number, number])[];

/**
 * The red sandy trail of the reference photo (local u, w, half width). The main strand comes up
 * the ravine on the OSM footpath (from the Weiher, on the viewer's right), forks off it down onto
 * the floor beside the brook, passes the front of the spring and climbs to the hairpin's apex on
 * the left, then a little way up the path's upper leg behind the spring. The others: the open
 * forecourt before the water (between the trough and the mossy edge blocks), the branch to the
 * steps, and the few metres from the top step to the upper leg.
 */
export const TRAIL: readonly TrailStrand[] = [
  [
    [26, 12.1, 0.75],
    [22, 11.6, 0.8],
    [18, 11.0, 0.8],
    [14, 9.6, 0.85],
    [10.5, 7.8, 0.85],
    [7.5, 6.1, 0.9],
    [4.8, 4.9, 0.95],
    [2.4, 4.1, 0.95],
    [0.2, 3.75, 0.95],
    [-2, 3.6, 0.9],
    [-4.4, 3.45, 0.85],
    [-6.4, 3.3, 0.8],
    [-7.9, 2.6, 0.75],
    [-8.8, 0.9, 0.7],
    [-8.3, -1.8, 0.7],
    [-5.6, -3.6, 0.7],
  ],
  [
    [-1.9, 2.35, 0.75],
    [0.15, 2.3, 0.95],
    [2.2, 2.45, 0.75],
  ],
  [
    [-3.7, 3.5, 0.55],
    [-3.5, 2.6, 0.5],
    [-3.35, 1.55, 0.5],
  ],
  [
    [-3.35, -2.3, 0.45],
    [-3.7, -3.4, 0.45],
    [-4.4, -4.2, 0.5],
  ],
];

/** A trail strand as world samples about every `step` m (Catmull–Rom through its points), with half widths. */
export function trailLine(strand: TrailStrand, step = 0.5): { x: number; z: number; half: number }[] {
  const out: { x: number; z: number; half: number }[] = [];
  const n = strand.length;
  for (let i = 0; i + 1 < n; i++) {
    const p0 = strand[Math.max(0, i - 1)]!;
    const p1 = strand[i]!;
    const p2 = strand[i + 1]!;
    const p3 = strand[Math.min(n - 1, i + 2)]!;
    const segs = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let s = 0; s < segs || (i + 2 === n && s === segs); s++) {
      const t = s / segs;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const [x, z] = toWorld(cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]));
      out.push({ x, z, half: p1[2] + (p2[2] - p1[2]) * t });
    }
  }
  return out;
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
