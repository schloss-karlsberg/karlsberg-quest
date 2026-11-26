/**
 * A top-down raster of the burning palace for the palace shader: per cell which fire unit is
 * the ground floor and which the upper floors (and where the split lies), so the real windows of
 * the 1789 model can glow room by room and the walls blacken where the fire has been.
 * `FireMap.fill` updates an RGBA8 buffer when a contributing room's quantized state changes:
 *   R = ground-floor burn, G = upper-floor burn, B = split height, A = soot.
 */
import { bbox, pointInPolygon } from '../geom';
import type { FireUnit } from './schedule';

export interface FireRaster {
  x0: number;
  z0: number;
  cell: number;
  w: number;
  h: number;
  /** Lowest floor and height range (for the split-height encoding). */
  y0: number;
  yRange: number;
  /** Per cell: ground / upper unit index (-1 = none) and split height (m a.s.l.). */
  lower: Int32Array;
  upper: Int32Array;
  split: Float32Array;
}

const isLower = (u: FireUnit): boolean => u.kind === 'building' || u.storey <= 1;
const isUpper = (u: FireUnit): boolean => u.kind === 'building' || u.storey >= 2;

/** Rasterise unit polygons at `cell` m; empty cells take their neighbours (`grow` passes) so the facades are covered. */
export function rasterizeUnits(units: FireUnit[], cell = 1.5, grow = 2): FireRaster {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const u of units) {
    const b = bbox(u.polygon);
    x0 = Math.min(x0, b.x0);
    z0 = Math.min(z0, b.z0);
    x1 = Math.max(x1, b.x1);
    z1 = Math.max(z1, b.z1);
    y0 = Math.min(y0, u.floor);
    y1 = Math.max(y1, u.ridge);
  }
  if (!units.length) {
    x0 = z0 = y0 = 0;
    x1 = z1 = y1 = 1;
  }
  const pad = cell * (grow + 1);
  x0 -= pad;
  z0 -= pad;
  const w = Math.max(1, Math.ceil((x1 + pad - x0) / cell));
  const h = Math.max(1, Math.ceil((z1 + pad - z0) / cell));
  const lower = new Int32Array(w * h).fill(-1);
  const upper = new Int32Array(w * h).fill(-1);
  const split = new Float32Array(w * h).fill(1e4);
  units.forEach((u, i) => {
    const b = bbox(u.polygon);
    const i0 = Math.max(0, Math.floor((b.x0 - x0) / cell));
    const i1 = Math.min(w - 1, Math.ceil((b.x1 - x0) / cell));
    const j0 = Math.max(0, Math.floor((b.z0 - z0) / cell));
    const j1 = Math.min(h - 1, Math.ceil((b.z1 - z0) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let k = i0; k <= i1; k++) {
        if (!pointInPolygon(x0 + (k + 0.5) * cell, z0 + (j + 0.5) * cell, u.polygon)) continue;
        const c = j * w + k;
        if (isLower(u) && (lower[c]! < 0 || units[lower[c]!]!.floor > u.floor)) lower[c] = i;
        if (isUpper(u)) {
          if (upper[c]! < 0 || units[upper[c]!]!.floor < u.floor) upper[c] = i;
          if (u.kind === 'room') split[c] = Math.min(split[c]!, u.floor);
        }
      }
    }
  });
  // grow into the wall ring around the rooms
  for (let pass = 0; pass < grow; pass++) {
    const L = lower.slice();
    const U = upper.slice();
    const S = split.slice();
    for (let j = 0; j < h; j++) {
      for (let k = 0; k < w; k++) {
        const c = j * w + k;
        if (L[c]! >= 0 || U[c]! >= 0) continue;
        for (const [dk, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const kk = k + dk;
          const jj = j + dj;
          if (kk < 0 || jj < 0 || kk >= w || jj >= h) continue;
          const n = jj * w + kk;
          if (L[n]! < 0 && U[n]! < 0) continue;
          lower[c] = L[n]!;
          upper[c] = U[n]!;
          split[c] = S[n]!;
          break;
        }
      }
    }
  }
  return { x0, z0, cell, w, h, y0, yRange: Math.max(1, y1 - y0), lower, upper, split };
}

/** Raster + per-frame RGBA8 fill from unit burn intensities and soot. */
export class FireMap {
  readonly data: Uint8Array;
  private readonly units: number[];
  private readonly burn: Uint8Array;
  private readonly soot: Uint8Array;

  constructor(readonly r: FireRaster) {
    this.data = new Uint8Array(r.w * r.h * 4);
    const units = new Set<number>();
    let last = -1;
    for (let c = 0; c < r.w * r.h; c++) {
      this.data[c * 4 + 2] = Math.round(255 * Math.max(0, Math.min(1, (r.split[c]! - r.y0) / r.yRange)));
      units.add(r.lower[c]!);
      units.add(r.upper[c]!);
      last = Math.max(last, r.lower[c]!, r.upper[c]!);
    }
    units.delete(-1);
    this.units = [...units];
    this.burn = new Uint8Array(last + 1);
    this.soot = new Uint8Array(last + 1);
  }

  /** x0, z0, width, depth (m) of the raster, for the shader's uv. */
  box(): [number, number, number, number] {
    return [this.r.x0, this.r.z0, this.r.w * this.r.cell, this.r.h * this.r.cell];
  }

  /** Resolve each room once. Keep the previous texture when its input bytes match. */
  fill(intensity: (i: number) => number, soot: (i: number) => number): boolean {
    let dirty = false;
    for (const i of this.units) {
      const burnByte = Math.round(255 * Math.min(1, intensity(i)));
      const sootByte = Math.round(255 * soot(i));
      if (this.burn[i] === burnByte && this.soot[i] === sootByte) continue;
      this.burn[i] = burnByte;
      this.soot[i] = sootByte;
      dirty = true;
    }
    if (!dirty) return false;
    const { lower, upper } = this.r;
    const d = this.data;
    for (let c = 0; c < lower.length; c++) {
      const li = lower[c]!;
      const ui = upper[c]!;
      d[c * 4] = this.burn[li] ?? 0;
      d[c * 4 + 1] = this.burn[ui] ?? 0;
      d[c * 4 + 3] = Math.max(this.soot[li] ?? 0, this.soot[ui] ?? 0);
    }
    return true;
  }
}
