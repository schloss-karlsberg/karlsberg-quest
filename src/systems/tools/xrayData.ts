import type { PointCloudMeta } from '../../data/types';

/**
 * kq-pts-v1 decoder (format: scripts/prepare-data.ts, Röntgenblick section). Pure.
 * Layout (little endian, inflated): u32 offsets[cells + 1] | u16 dx[n] | u16 dz[n] | i8 res[n] | u8 cls[n].
 */
export interface GroundPoints {
  count: number;
  /** Local x / z (m). */
  xs: Float32Array;
  zs: Float32Array;
  /** Height above the 2025 DTM (m). */
  res: Float32Array;
  cls: Uint8Array;
  /** First point of each cell (cells + 1 entries). */
  offsets: Uint32Array;
  meta: Pick<PointCloudMeta, 'x0' | 'z0' | 'cell' | 'cols' | 'rows'>;
}

export function decodeGroundPoints(bytes: Uint8Array, meta: Pick<PointCloudMeta, 'x0' | 'z0' | 'cell' | 'cols' | 'rows' | 'xyScale' | 'resScale'>): GroundPoints {
  const cells = meta.cols * meta.rows;
  const offBytes = (cells + 1) * 4;
  if (bytes.length < offBytes) throw new Error('kq-pts: truncated header');
  const buf = bytes.byteOffset % 4 === 0 ? bytes : bytes.slice();
  const offsets = new Uint32Array(buf.buffer, buf.byteOffset, cells + 1).slice();
  const n = offsets[cells]!;
  if (bytes.length !== offBytes + n * 6) throw new Error(`kq-pts: expected ${offBytes + n * 6} bytes, got ${bytes.length}`);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const xs = new Float32Array(n);
  const zs = new Float32Array(n);
  const res = new Float32Array(n);
  const cls = new Uint8Array(n);
  let X = 0;
  let Z = 0;
  const oX = offBytes;
  const oZ = offBytes + n * 2;
  const oR = offBytes + n * 4;
  const oC = offBytes + n * 5;
  for (let i = 0; i < n; i++) {
    X = (X + dv.getUint16(oX + i * 2, true)) & 0xffff;
    Z = (Z + dv.getUint16(oZ + i * 2, true)) & 0xffff;
    xs[i] = meta.x0 + X * meta.xyScale;
    zs[i] = meta.z0 + Z * meta.xyScale;
    res[i] = dv.getInt8(oR + i) * meta.resScale;
    cls[i] = dv.getUint8(oC + i);
  }
  return { count: n, xs, zs, res, cls, offsets, meta };
}

/** Encoder (tests + tooling), mirror of prepare-data. Points must already be sorted by cell, z, x. */
export function encodeGroundPoints(
  pts: readonly { x: number; z: number; res: number; cls: number }[],
  meta: Pick<PointCloudMeta, 'x0' | 'z0' | 'cell' | 'cols' | 'rows' | 'xyScale' | 'resScale'>,
): Uint8Array {
  const cells = meta.cols * meta.rows;
  const n = pts.length;
  const out = new Uint8Array((cells + 1) * 4 + n * 6);
  const dv = new DataView(out.buffer);
  const counts = new Uint32Array(cells + 1);
  const q = pts.map((p) => {
    const X = Math.round((p.x - meta.x0) / meta.xyScale);
    const Z = Math.round((p.z - meta.z0) / meta.xyScale);
    const cell = Math.floor((Z * meta.xyScale) / meta.cell) * meta.cols + Math.floor((X * meta.xyScale) / meta.cell);
    return { X, Z, cell, r: Math.max(-127, Math.min(127, Math.round(p.res / meta.resScale))), c: p.cls };
  });
  for (const p of q) counts[p.cell + 1]!++;
  for (let i = 0; i < cells; i++) counts[i + 1]! += counts[i]!;
  for (let i = 0; i <= cells; i++) dv.setUint32(i * 4, counts[i]!, true);
  const o = (cells + 1) * 4;
  let pX = 0;
  let pZ = 0;
  q.forEach((p, i) => {
    dv.setUint16(o + i * 2, (p.X - pX) & 0xffff, true);
    dv.setUint16(o + n * 2 + i * 2, (p.Z - pZ) & 0xffff, true);
    dv.setInt8(o + n * 4 + i, p.r);
    dv.setUint8(o + n * 5 + i, p.c);
    pX = p.X;
    pZ = p.Z;
  });
  return out;
}

/** Cells (indices) whose square intersects the disc (x, z, r). */
export function cellsInRadius(meta: Pick<PointCloudMeta, 'x0' | 'z0' | 'cell' | 'cols' | 'rows'>, x: number, z: number, r: number): number[] {
  const out: number[] = [];
  const c0 = Math.max(0, Math.floor((x - r - meta.x0) / meta.cell));
  const c1 = Math.min(meta.cols - 1, Math.floor((x + r - meta.x0) / meta.cell));
  const r0 = Math.max(0, Math.floor((z - r - meta.z0) / meta.cell));
  const r1 = Math.min(meta.rows - 1, Math.floor((z + r - meta.z0) / meta.cell));
  for (let rr = r0; rr <= r1; rr++) {
    for (let cc = c0; cc <= c1; cc++) {
      const cx = Math.max(meta.x0 + cc * meta.cell, Math.min(x, meta.x0 + (cc + 1) * meta.cell));
      const cz = Math.max(meta.z0 + rr * meta.cell, Math.min(z, meta.z0 + (rr + 1) * meta.cell));
      if ((cx - x) ** 2 + (cz - z) ** 2 <= r * r) out.push(rr * meta.cols + cc);
    }
  }
  return out;
}
