/**
 * Baked window light of one building (pure numbers + a DataTexture wrapper).
 *
 * A top-down grid (~0.4 m) over the building, two layers (ground floor / upper floor):
 * R/G = sky light, B/A = sun light through the windows of the room a cell lies in. Each window
 * contributes by its area, the angle under which the cell sees it and 1/d²; sun light only from
 * windows facing the sun's azimuth. Rooms without windows get a little light through their doors.
 */
import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType, Vector4 } from 'three';
import { pointInPoly } from './geom';
import type { FullPlan } from './layout';

export interface LightGrid {
  x0: number;
  z0: number;
  cols: number;
  rows: number;
  cell: number;
  /** Height splitting the two layers (m a.s.l.); +∞ for single-storey buildings. */
  split: number;
  data: Uint8Array;
}

export function bakeLight(plan: FullPlan, building: string, sun: { x: number; y: number; z: number }, cell = 0.4): LightGrid {
  const bp = plan.buildings.find((b) => b.id === building)!;
  const rooms = bp.rooms.map((i) => plan.rooms[i]!);
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const r of rooms)
    for (const [x, z] of r.poly) {
      x0 = Math.min(x0, x);
      z0 = Math.min(z0, z);
      x1 = Math.max(x1, x);
      z1 = Math.max(z1, z);
    }
  x0 -= 1;
  z0 -= 1;
  x1 += 1;
  z1 += 1;
  const cols = Math.max(2, Math.ceil((x1 - x0) / cell));
  const rows = Math.max(2, Math.ceil((z1 - z0) / cell));
  const data = new Uint8Array(cols * rows * 4);
  const upperFloor = Math.min(...rooms.filter((r) => r.storey > bp.storeys[0]!).map((r) => r.floor));
  const split = Number.isFinite(upperFloor) ? upperFloor - 0.3 : 1e6;
  const sl = Math.hypot(sun.x, sun.z) || 1;
  const sunUp = Math.max(0, sun.y);
  const sunK = Math.min(1, sunUp * 3) * (1 - Math.min(1, sunUp) * 0.35);
  const wins = rooms.map((r) => plan.windows.filter((w) => w.room === r.index));
  // door spill: rooms without windows borrow from their neighbours
  const level = (layer: 0 | 1) => rooms.filter((r) => (layer === 0 ? r.storey === bp.storeys[0] || r.stair !== null : r.storey > bp.storeys[0]! || r.stair !== null));
  for (const layer of [0, 1] as const) {
    if (layer === 1 && split > 1e5) break;
    const lv = level(layer);
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const x = x0 + (col + 0.5) * cell;
        const z = z0 + (row + 0.5) * cell;
        const r = lv.find((q) => pointInPoly(x, z, q.poly));
        let sky = 0;
        let sn = 0;
        if (r) {
          const ws = wins[rooms.indexOf(r)]!;
          for (const w of ws) {
            const dx = x - w.cx;
            const dz = z - w.cz;
            const d2 = dx * dx + dz * dz;
            const d = Math.sqrt(d2) || 1e-3;
            // inward = −normal of the room edge
            const cos = Math.max(0, (-w.nx * dx - w.nz * dz) / d);
            const a = w.width * (w.y1 - w.y0);
            const k = (a * (0.25 + 0.75 * cos)) / (d2 + 3);
            sky += k;
            const facing = Math.max(0, (w.nx * sun.x + w.nz * sun.z) / sl);
            sn += k * facing * sunK * (0.4 + 0.6 * cos);
          }
          if (!ws.length) sky += 0.05;
        }
        const i = (row * cols + col) * 4;
        const S = 1 - Math.exp(-sky * 1.6);
        const N = 1 - Math.exp(-sn * 2.2);
        data[i + layer] = Math.round(S * 255);
        data[i + 2 + layer] = Math.round(N * 255);
      }
  }
  blur(data, cols, rows);
  return { x0, z0, cols, rows, cell, split, data };
}

function blur(d: Uint8Array, cols: number, rows: number): void {
  const src = d.slice();
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      for (let ch = 0; ch < 4; ch++) {
        let s = 0;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
            s += src[(rr * cols + cc) * 4 + ch]!;
            n++;
          }
        d[(r * cols + c) * 4 + ch] = Math.round(s / n);
      }
}

export function lightTexture(g: LightGrid): { tex: DataTexture; box: Vector4 } {
  const tex = new DataTexture(g.data, g.cols, g.rows, RGBAFormat, UnsignedByteType);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return { tex, box: new Vector4(g.x0, g.z0, g.cols * g.cell, g.rows * g.cell) };
}
