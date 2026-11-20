/** Pure raster helpers used to build the terrain textures on the CPU at load time. */
import { GROUND } from '../data/types';
import type { GridDesc } from './heightfield';

/** Separable box blur (running sums), edge-clamped. Returns a new array. */
export function boxBlur(src: Float32Array, cols: number, rows: number, radius: number, passes = 2): Float32Array {
  let a = Float32Array.from(src);
  const tmp = new Float32Array(src.length);
  const w = 2 * radius + 1;
  for (let p = 0; p < passes; p++) {
    // horizontal
    for (let r = 0; r < rows; r++) {
      const o = r * cols;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += a[o + Math.min(cols - 1, Math.max(0, k))]!;
      for (let c = 0; c < cols; c++) {
        tmp[o + c] = sum / w;
        const add = Math.min(cols - 1, c + radius + 1);
        const sub = Math.max(0, c - radius);
        sum += a[o + add]! - a[o + sub]!;
      }
    }
    // vertical
    const out = new Float32Array(src.length);
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += tmp[Math.min(rows - 1, Math.max(0, k)) * cols + c]!;
      for (let r = 0; r < rows; r++) {
        out[r * cols + c] = sum / w;
        const add = Math.min(rows - 1, r + radius + 1);
        const sub = Math.max(0, r - radius);
        sum += tmp[add * cols + c]! - tmp[sub * cols + c]!;
      }
    }
    a = out;
  }
  return a;
}

const toByte = (v: number) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));

/**
 * Surface texture (RGBA8, same grid as the heights):
 *  R,G = surface normal x/z (·0.5+0.5), B = local relief h − mean(≈12 m) in ±3 m,
 *  A = fine relief h − mean(≈4 m) in ±1 m.
 */
export function buildSurface(h: Float32Array, g: GridDesc): Uint8Array {
  const { cols, rows, cell } = g;
  const out = new Uint8Array(cols * rows * 4);
  const coarse = boxBlur(h, cols, rows, 3, 2); // 2 passes of 7 cells ≈ ±12 m
  const fine = boxBlur(h, cols, rows, 1, 2); // ≈ ±4 m
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const hl = h[r * cols + Math.max(0, c - 1)]!;
      const hr = h[r * cols + Math.min(cols - 1, c + 1)]!;
      const hu = h[Math.max(0, r - 1) * cols + c]!;
      const hd = h[Math.min(rows - 1, r + 1) * cols + c]!;
      const gx = (hr - hl) / (2 * cell);
      const gz = (hd - hu) / (2 * cell);
      const l = Math.hypot(gx, 1, gz);
      const o = i * 4;
      out[o] = toByte(-gx / l * 0.5 + 0.5);
      out[o + 1] = toByte(-gz / l * 0.5 + 0.5);
      out[o + 2] = toByte((h[i]! - coarse[i]!) / 6 + 0.5);
      out[o + 3] = toByte((h[i]! - fine[i]!) / 2 + 0.5);
    }
  }
  return out;
}

/** Rasterise polylines (local x/z pairs) with a given half-width into a 0..1 coverage grid. */
export function rasterLines(target: Float32Array, g: GridDesc, pts: ArrayLike<number>, halfWidth: number, value = 1): void {
  const { cols, rows, cell, x0, z0 } = g;
  const rCells = Math.max(0.5, halfWidth / cell);
  const ri = Math.ceil(rCells);
  for (let k = 2; k < pts.length; k += 2) {
    const ax = pts[k - 2]!;
    const az = pts[k - 1]!;
    const bx = pts[k]!;
    const bz = pts[k + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / (cell * 0.5)));
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      const fc = (ax + (bx - ax) * t - x0) / cell;
      const fr = (az + (bz - az) * t - z0) / cell;
      const c0 = Math.round(fc);
      const r0 = Math.round(fr);
      for (let dr = -ri; dr <= ri; dr++) {
        for (let dc = -ri; dc <= ri; dc++) {
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
          const d = Math.hypot(c - fc, r - fr);
          const v = value * Math.min(1, Math.max(0, rCells + 0.5 - d));
          const i = r * cols + c;
          if (v > target[i]!) target[i] = v;
        }
      }
    }
  }
}

export interface CoverInputs {
  ground: Uint8Array;
  /** Canopy height in metres (today) or null for the historic eras. */
  canopy: Float32Array | null;
  /** 0..1 path coverage (today: OSM ways). */
  paths: Float32Array | null;
}

/**
 * Land-cover texture (RGBA8): R forest, G water, B bare ground (paths, gravel, cobbles, sand,
 * building grounds), A lawn/garden. Meadow is what's left.
 */
export function buildCover(g: GridDesc, inp: CoverInputs): Uint8Array {
  const n = g.cols * g.rows;
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  const B = new Float32Array(n);
  const A = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const cls = inp.ground[i]!;
    G[i] = cls === GROUND.water ? 1 : 0;
    if (inp.canopy) {
      const ch = inp.canopy[i]!;
      R[i] = Math.min(1, Math.max(0, (ch - 2) / 6));
      B[i] = inp.paths ? inp.paths[i]! : 0;
    } else {
      R[i] = cls === GROUND.forest ? 1 : 0;
      B[i] = cls === GROUND.gravel || cls === GROUND.cobbles || cls === GROUND.sand || cls === GROUND.parterre_sand ? 1 : cls === GROUND.building ? 0.8 : 0;
      A[i] = cls === GROUND.lawn || cls === GROUND.kitchen_garden ? 1 : 0;
    }
  }
  const out = new Uint8Array(n * 4);
  const rb = boxBlur(R, g.cols, g.rows, 1, 1);
  const gb = boxBlur(G, g.cols, g.rows, 1, 1);
  const bb = boxBlur(B, g.cols, g.rows, 1, 1);
  const ab = boxBlur(A, g.cols, g.rows, 1, 1);
  for (let i = 0; i < n; i++) {
    out[i * 4] = toByte(rb[i]!);
    out[i * 4 + 1] = toByte(gb[i]!);
    out[i * 4 + 2] = toByte(Math.max(bb[i]!, B[i]! * 0.85));
    out[i * 4 + 3] = toByte(ab[i]!);
  }
  return out;
}

/**
 * The OSM walk graph (public/data/paths.json) as a 0..1 coverage raster on the terrain grid: path
 * 0.9 m half-width at 0.6, track 1.4 m and road 2.4 m at 0.85. The ground textures, the tree
 * placement and the Wegweiser's route costs (world/route.ts) read it.
 */
export function buildPathRaster(g: GridDesc, P: { nodes: ArrayLike<number>; edges: ArrayLike<number> }): Float32Array {
  const paths = new Float32Array(g.cols * g.rows);
  const halfW = [0.9, 1.4, 2.4]; // path, track, road
  for (let k = 0; k < P.edges.length; k += 4) {
    const a = P.edges[k]!;
    const b = P.edges[k + 1]!;
    const kind = P.edges[k + 2]!;
    rasterLines(paths, g, [P.nodes[a * 3]!, P.nodes[a * 3 + 2]!, P.nodes[b * 3]!, P.nodes[b * 3 + 2]!], halfW[kind] ?? 1, kind === 0 ? 0.6 : 0.85);
  }
  return paths;
}

/** Nearest-cell lookup into a float raster on the grid (0 outside). */
export function rasterAt(g: GridDesc, data: Float32Array, x: number, z: number): number {
  const c = Math.round((x - g.x0) / g.cell);
  const r = Math.round((z - g.z0) / g.cell);
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return 0;
  return data[r * g.cols + c]!;
}
