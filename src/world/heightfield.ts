/**
 * CPU height queries on a regular grid (pure, no three.js).
 * Sample (c, r) sits at local (x0 + c·cell, z0 + r·cell); row 0 is the north edge (smallest z).
 */
export interface GridDesc {
  cols: number;
  rows: number;
  cell: number;
  x0: number;
  z0: number;
}

export class Heightfield implements GridDesc {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  readonly x0: number;
  readonly z0: number;
  readonly min: number;
  readonly max: number;

  constructor(
    desc: GridDesc,
    readonly data: Float32Array,
  ) {
    this.cols = desc.cols;
    this.rows = desc.rows;
    this.cell = desc.cell;
    this.x0 = desc.x0;
    this.z0 = desc.z0;
    if (data.length !== desc.cols * desc.rows) throw new Error('Heightfield: data size mismatch');
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = 0; i < data.length; i++) {
      const v = data[i]!;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    this.min = mn;
    this.max = mx;
  }

  /** Local x/z extent covered by sample centres. */
  get bounds() {
    return { x0: this.x0, z0: this.z0, x1: this.x0 + (this.cols - 1) * this.cell, z1: this.z0 + (this.rows - 1) * this.cell };
  }

  inBounds(x: number, z: number, margin = 0): boolean {
    const b = this.bounds;
    return x >= b.x0 + margin && x <= b.x1 - margin && z >= b.z0 + margin && z <= b.z1 - margin;
  }

  /** Raw sample with edge clamping. */
  sample(c: number, r: number): number {
    const cc = c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
    const rr = r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
    return this.data[rr * this.cols + cc]!;
  }

  /** Bilinear height at local x/z (clamped to the grid). */
  heightAt(x: number, z: number): number {
    let fc = (x - this.x0) / this.cell;
    let fr = (z - this.z0) / this.cell;
    const maxC = this.cols - 1;
    const maxR = this.rows - 1;
    fc = fc < 0 ? 0 : fc > maxC ? maxC : fc;
    fr = fr < 0 ? 0 : fr > maxR ? maxR : fr;
    let c = Math.floor(fc);
    let r = Math.floor(fr);
    if (c >= maxC) c = maxC - 1;
    if (r >= maxR) r = maxR - 1;
    const tx = fc - c;
    const ty = fr - r;
    const i = r * this.cols + c;
    const d = this.data;
    const h00 = d[i]!;
    const h10 = d[i + 1]!;
    const h01 = d[i + this.cols]!;
    const h11 = d[i + this.cols + 1]!;
    return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
  }

  /** Surface gradient (dh/dx, dh/dz) by central differences over one cell. */
  gradientAt(x: number, z: number): { gx: number; gz: number } {
    const e = this.cell;
    return {
      gx: (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e),
      gz: (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e),
    };
  }

  /** Slope angle in degrees. */
  slopeDeg(x: number, z: number): number {
    const { gx, gz } = this.gradientAt(x, z);
    return (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI;
  }

  /** Unit surface normal [nx, ny, nz]. */
  normalAt(x: number, z: number): [number, number, number] {
    const { gx, gz } = this.gradientAt(x, z);
    const l = Math.hypot(gx, 1, gz);
    return [-gx / l, 1 / l, -gz / l];
  }
}

/** Nearest-cell lookup into a byte raster on the same grid (land cover). */
export function classAt(grid: GridDesc, data: Uint8Array, x: number, z: number): number {
  const c = Math.round((x - grid.x0) / grid.cell);
  const r = Math.round((z - grid.z0) / grid.cell);
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return 0;
  return data[r * grid.cols + c]!;
}
