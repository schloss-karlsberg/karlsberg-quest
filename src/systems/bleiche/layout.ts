/**
 * The Bleiche (docs/IDEAS-ROUND11.md §2): the laundress Liese's bleaching green by the Karlsbergbach
 * in 1789, where Kaspar's dark-blue coat hangs on the line (`q.k1.kleider`). Pure data and math (no
 * three.js), shared by the scenery set (src/systems/scenery/bleiche.ts) and whoever places Liese,
 * the coat pickup and the fight.
 *
 * Position (checked against the LiDAR 1789 terrain and the brook): the design's 1004/−857 lies on
 * the steep south bank (281.9 m, ~35 % slope) four metres south of the OSM Karlsbergbach. Across the
 * brook the ravine opens into a flat meadow (land cover 1789: meadow / hay, no forest; 279.3–280.4 m,
 * ~5 % down to the west towards the Karlsbergweiher). The trail from the spring down to the Weiher
 * crosses that meadow (OSM path 1035.7/−855.1 → 1013.9/−867.5 → 992.8/−863.8). So the green lies on
 * the flat meadow just north of the trail, 11–14 m from the brook's line, with the wash corner at its
 * brook side. Its front faces east-south-east (compass 120°), the way you come down from the spring:
 * the drying lines stand across that view, white sheets broadside to the approach.
 *
 * Local frame: u = to the right of a viewer facing the green's front (≈ north-north-east), w = towards
 * that viewer (≈ east-south-east), y up. `toWorld(u, w)` maps it like the scenery kit's `face(120)`.
 */

export const BLEICHE = {
  x: 1001.5,
  z: -876.5,
  /** Compass facing of the front (the viewer stands this way; 0 = north, 90 = east). */
  facing: 120,
} as const;

const YAW = Math.PI - (BLEICHE.facing * Math.PI) / 180;
const CY = Math.cos(YAW);
const SY = Math.sin(YAW);

/** Local (u right, w towards the viewer) → world x/z. */
export function toWorld(u: number, w: number): [number, number] {
  return [BLEICHE.x + u * CY + w * SY, BLEICHE.z - u * SY + w * CY];
}

/** World x/z → local (u, w). */
export function toLocal(x: number, z: number): [number, number] {
  const dx = x - BLEICHE.x;
  const dz = z - BLEICHE.z;
  return [dx * CY - dz * SY, dx * SY + dz * CY];
}

/** Compass degrees of a local direction (du, dw). */
export function compassOf(du: number, dw: number): number {
  const [x0, z0] = toWorld(0, 0);
  const [x1, z1] = toWorld(du, dw);
  return ((Math.atan2(x1 - x0, -(z1 - z0)) * 180) / Math.PI + 360) % 360;
}

type HeightAt = (x: number, z: number) => number;

/** The ground under local (u, w). */
export function groundLocal(h: HeightAt, u: number, w: number): number {
  const [x, z] = toWorld(u, w);
  return h(x, z);
}

/** A drying line: its posts (local u, w) in order; the rope runs post to post. */
export interface DryingLine {
  posts: readonly (readonly [number, number])[];
}

/** Rope height above the ground at a post (m) and the sag in the middle of a span. */
export const ROPE = { top: 2.16, sag: 0.17 } as const;

/** Two lines across the approach: A in front, B behind (the coat hangs on B). */
export const LINES: readonly DryingLine[] = [
  {
    posts: [
      [-5.0, 1.4],
      [-0.4, 1.6],
      [4.2, 1.5],
    ],
  },
  {
    posts: [
      [-3.6, -1.6],
      [1.0, -1.5],
      [5.6, -1.7],
    ],
  },
];

export type ItemKind = 'sheet' | 'shirt' | 'cloth' | 'apron' | 'coat';

/** Something hanging on a line: from `u0` to `u0 + width` along the line (local u). */
export interface HangItem {
  line: number;
  kind: ItemKind;
  u0: number;
  width: number;
  /** How far it hangs below the rope (m; a folded sheet's longer side). */
  drop: number;
  /** sRGB colour. */
  color: number;
}

const WHITE = 0xf4f4f1;
const CREAM = 0xece8dc;
const RAW = 0xddd5c2; // unbleached linen
const KERCHIEF = 0xa84a3c;
const OCHRE = 0xc8a86c;
/** Kaspar's coat: dark blue wool (the court costume's coat colour), brass buttons. */
export const COAT_BLUE = 0x2f4377;

export const ITEMS: readonly HangItem[] = [
  // line A (front): sheets folded over the rope, shirts threaded on by the sleeves
  { line: 0, kind: 'sheet', u0: -4.8, width: 2.0, drop: 1.52, color: WHITE },
  { line: 0, kind: 'shirt', u0: -2.7, width: 1.1, drop: 0.86, color: CREAM },
  { line: 0, kind: 'cloth', u0: -1.5, width: 0.6, drop: 0.55, color: WHITE },
  { line: 0, kind: 'sheet', u0: -0.2, width: 2.1, drop: 1.55, color: WHITE },
  { line: 0, kind: 'apron', u0: 2.0, width: 0.75, drop: 0.92, color: RAW },
  { line: 0, kind: 'shirt', u0: 2.9, width: 1.1, drop: 0.86, color: WHITE },
  // line B (behind): a sheet, shirts, the kerchief, Kaspar's coat at the right, a cloth beyond it
  { line: 1, kind: 'sheet', u0: -3.4, width: 1.95, drop: 1.5, color: CREAM },
  { line: 1, kind: 'cloth', u0: -1.35, width: 0.5, drop: 0.48, color: KERCHIEF },
  { line: 1, kind: 'shirt', u0: -0.75, width: 1.1, drop: 0.84, color: WHITE },
  { line: 1, kind: 'sheet', u0: 1.2, width: 1.55, drop: 1.45, color: RAW },
  { line: 1, kind: 'coat', u0: 2.85, width: 1.5, drop: 1.1, color: COAT_BLUE },
  { line: 1, kind: 'cloth', u0: 4.5, width: 0.75, drop: 0.62, color: OCHRE },
];

/** Index of the coat in ITEMS. */
export const COAT_ITEM = ITEMS.findIndex((i) => i.kind === 'coat');

/** Rope height above a straight ground line at fraction t of a span (0…1): a parabola, sag in the middle. */
export function ropeDrop(t: number): number {
  return ROPE.sag * 4 * t * (1 - t);
}

/**
 * Where a line's rope is at local u (between its first and last post): the local w on the rope and
 * the rope's height above the ground under it (ground-relative; the scenery adds the terrain). Null
 * beyond the end posts.
 */
export function ropeAt(line: number, u: number): { w: number; above: number; span: number; t: number } | null {
  const posts = LINES[line]?.posts;
  if (!posts) return null;
  for (let i = 0; i + 1 < posts.length; i++) {
    const [u0, w0] = posts[i]!;
    const [u1, w1] = posts[i + 1]!;
    if (u < u0 - 1e-6 || u > u1 + 1e-6) continue;
    const t = (u - u0) / (u1 - u0);
    return { w: w0 + (w1 - w0) * t, above: ROPE.top - ropeDrop(t), span: i, t };
  }
  return null;
}

/** A local direction (du, dw) as a world x/z vector (same length). */
export function dirWorld(du: number, dw: number): [number, number] {
  return [du * CY + dw * SY, -du * SY + dw * CY];
}

/**
 * The rope of line `line` at local u in the world: x/z, its height y (post tops at ROPE.top over the
 * ground at each post, the sag between them), and the horizontal normal of that span towards the
 * front (+w side) as world nx/nz. Null beyond the end posts.
 */
export function ropeWorld(h: HeightAt, line: number, u: number): { x: number; y: number; z: number; nx: number; nz: number } | null {
  const r = ropeAt(line, u);
  if (!r) return null;
  const posts = LINES[line]!.posts;
  const [u0, w0] = posts[r.span]!;
  const [u1, w1] = posts[r.span + 1]!;
  const g0 = groundLocal(h, u0, w0);
  const g1 = groundLocal(h, u1, w1);
  const [x, z] = toWorld(u, r.w);
  const du = u1 - u0;
  const dw = w1 - w0;
  const l = Math.hypot(du, dw) || 1;
  const [nx, nz] = dirWorld(-dw / l, du / l);
  return { x, y: g0 + (g1 - g0) * r.t + ROPE.top - ropeDrop(r.t), z, nx, nz };
}

/** Fixed pieces on the green (local u, w; facing in compass degrees where it matters). */
export const PIECES = {
  /** The coopered wash tub on its low stand (radius, height of the rim above the ground). */
  tub: { u: -7.3, w: 2.4, r: 0.48, h: 0.62 },
  /** The beating board leans into the tub from its brook side. */
  board: { u: -7.95, w: 2.95 },
  /** The washing bench (along w), a paddle and folded linen on it. */
  bench: { u: -8.9, w: 1.1, len: 1.9, h: 0.46 },
  /** A bucket beside the tub. */
  bucket: { u: -6.55, w: 3.5 },
  /** The laundry basket by line A's first post (CC0 wicker basket, scaled). */
  basket: { u: -4.6, w: 2.35 },
  /** Linen laid out flat on the grass to bleach (centre, size along u × w, yaw in degrees). */
  flat: [
    { u: 0.4, w: -4.9, lu: 2.7, lw: 1.5, yaw: 3 },
    { u: 3.6, w: -4.6, lu: 2.3, lw: 1.35, yaw: -6 },
    { u: 8.0, w: 0.6, lu: 1.5, lw: 2.6, yaw: 8 },
    { u: 7.7, w: -2.7, lu: 1.15, lw: 1.15, yaw: 20 },
  ],
  /** The long-handled scoop for sprinkling the bleaching linen. */
  scoop: { u: 1.9, w: -6.1 },
} as const;

/** A spot to stand at: world x/z and the compass facing. */
export interface Spot {
  x: number;
  z: number;
  /** Compass degrees (0 = north, 90 = east), the `yaw` of an npc spawn. */
  facing: number;
}

function spot(u: number, w: number, facing: number): Spot {
  const [x, z] = toWorld(u, w);
  return { x: round(x), z: round(z), facing: Math.round(facing) };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Liese's place: in the open before the green, by the basket, facing the way you come down. */
export const LIESE: Spot = spot(-3.7, 6.0, BLEICHE.facing);

/** Standing at the tub to wash, on its far side from the lines: the back is turned to the coat. */
export const TUB_SPOT: Spot = spot(PIECES.tub.u + 0.98, PIECES.tub.w - 0.24, compassOf(-1, 0.25));

/** Kaspar's coat on line B: local u of its middle, the rope there, the coat's centre above the ground. */
export const COAT = (() => {
  const it = ITEMS[COAT_ITEM]!;
  const u = it.u0 + it.width / 2;
  const r = ropeAt(it.line, u)!;
  return { u, w: r.w, /** height of its middle above the ground (m) */ above: r.above - it.drop * 0.45, ropeAbove: r.above, drop: it.drop };
})();

/** The coat's middle in world x/z (y: `coatWorld`). */
export const COAT_XZ: readonly [number, number] = (() => {
  const [x, z] = toWorld(COAT.u, COAT.w);
  return [round(x), round(z)] as const;
})();

/** The coat's middle in the world (on its rope, half its length down). */
export function coatWorld(h: HeightAt): { x: number; y: number; z: number } {
  const r = ropeWorld(h, ITEMS[COAT_ITEM]!.line, COAT.u)!;
  return { x: r.x, y: r.y - COAT.drop * 0.45, z: r.z };
}

/** Where you stand to lift the coat off the line: behind line B, facing the coat (out of Liese's view). */
export const COAT_REACH: Spot = spot(COAT.u, COAT.w - 0.95, compassOf(0, 1));

/** Talk circle kept free of solids around Liese (the npc talk radius is 2.8 m). */
export const LIESE_FREE = 3.2;

/** Keep clear of trees / scattered props / caches: centres (world) and radii. */
export function clearings(): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const [u, w, r] of [
    [0.6, -1.4, 7.6], // lines and the flat linen behind them
    [-7.2, 2.3, 3.6], // the wash corner
    [8.0, -0.6, 3.0], // the flat linen at the right
    [-3.7, 6.0, 3.2], // Liese
  ] as const) {
    const [x, z] = toWorld(u, w);
    out.push([round(x), round(z), r]);
  }
  return out;
}

/**
 * Where the ground cover is mown or cleared (1789): x, z, radius, the grass height kept (0 = none:
 * under the linen laid on the grass, the tub, the bucket, the basket).
 */
export function mown(): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const add = (u: number, w: number, r: number, keep: number) => {
    const [x, z] = toWorld(u, w);
    out.push([round(x), round(z), r, keep]);
  };
  for (const [x, z, r] of clearings()) {
    const [u, w] = toLocal(x, z);
    add(u, w, r, 0.4);
  }
  for (const f of PIECES.flat) add(f.u, f.w, Math.hypot(f.lu, f.lw) / 2 + 0.2, 0);
  add(PIECES.tub.u, PIECES.tub.w, PIECES.tub.r + 0.3, 0);
  add(PIECES.bucket.u, PIECES.bucket.w, 0.45, 0);
  add(PIECES.basket.u, PIECES.basket.w, 0.6, 0);
  return out;
}

/** Everything the set builds lies within this radius of BLEICHE (m). */
export const EXTENT = 10.5;
