/**
 * Where the fire shows: glowing windows along the outer walls of every room, flame tongues out of
 * those windows, flames over the roofs of the top storeys, smoke/ember sources over each roof.
 * Pure (unit-tested); positions in the local frame.
 */
import type { Footprint } from '../../../data/types';
import { type Poly, area, centroid, distToOutline, pointInPolygon, rng } from '../geom';
import type { FireUnit } from './schedule';

/** Per window: x, y, z, nx, nz, w, h, unit. */
export const WIN_STRIDE = 8;
/** Per flame: x, y, z, w, h, unit, seed, kind (0 roof, 1 window tongue). */
export const FLAME_STRIDE = 8;
/** Per smoke source: x, y, z, radius, unit. */
export const SRC_STRIDE = 5;

export interface FireEmitters {
  windows: Float32Array;
  flames: Float32Array;
  sources: Float32Array;
  counts: { windows: number; flames: number; sources: number };
}

function roofHeight(fp: Footprint | undefined, u: FireUnit, x: number, z: number): number {
  const ring = fp?.ring ?? u.polygon;
  const halfW = Math.max(2, (2 * area(ring)) / perimeter(ring));
  const d = distToOutline(x, z, ring);
  return u.eaves + (u.ridge - u.eaves) * Math.min(1, d / halfW);
}

function perimeter(p: Poly): number {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += Math.hypot(p[i]![0] - p[j]![0], p[i]![1] - p[j]![1]);
  return s;
}

export function buildEmitters(units: FireUnit[], footprints: Footprint[], opts: { windowSpacing?: number; roofSpacing?: number; seed?: number } = {}): FireEmitters {
  const winSp = opts.windowSpacing ?? 3.4;
  const roofSp = opts.roofSpacing ?? 4.6;
  const r = rng(opts.seed ?? 17);
  const fpById = new Map(footprints.map((f) => [f.id, f]));
  const windows: number[] = [];
  const flames: number[] = [];
  const sources: number[] = [];
  const srcPerBuilding = new Map<string, [number, number][]>();

  units.forEach((u, ui) => {
    const fp = fpById.get(u.building);
    const ring = fp?.ring ?? u.polygon;
    const [bcx, bcz] = centroid(ring);
    // storeys (building units have no rooms: split by ~4.2 m)
    const levels: [number, number][] = [];
    if (u.kind === 'room') levels.push([u.floor, u.ceiling]);
    else {
      const n = Math.max(1, Math.round((u.eaves - u.floor) / 4.2));
      const hgt = (u.eaves - u.floor) / n;
      for (let k = 0; k < n; k++) levels.push([u.floor + k * hgt, u.floor + (k + 1) * hgt]);
    }
    const poly = u.polygon;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, az] = poly[j]!;
      const [bx, bz] = poly[i]!;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 2.2) continue;
      // exterior wall: on the building outline
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      if (u.kind === 'room' && (distToOutline(mx, mz, ring) > 1.2 || distToOutline(ax, az, ring) > 1.6 || distToOutline(bx, bz, ring) > 1.6)) continue;
      let nx = (bz - az) / len;
      let nz = -(bx - ax) / len;
      if (nx * (mx - bcx) + nz * (mz - bcz) < 0) {
        nx = -nx;
        nz = -nz;
      }
      const count = Math.max(1, Math.floor((len - 1.2) / winSp));
      // the facade is the building outline; room walls sit up to a wall's thickness inside it
      const out = u.kind === 'room' && pointInPolygon(mx, mz, ring) ? Math.min(1.6, distToOutline(mx, mz, ring)) : 0;
      for (const [f0, f1] of levels) {
        const hgt = f1 - f0;
        const wh = Math.min(2.5, Math.max(1.2, hgt * 0.52));
        const wy = f0 + Math.min(hgt * 0.5, 0.9 + wh / 2);
        for (let k = 0; k < count; k++) {
          const s = (k + 0.5) / count;
          const x = ax + (bx - ax) * s + nx * out;
          const z = az + (bz - az) * s + nz * out;
          windows.push(x + nx * 0.14, wy, z + nz * 0.14, nx, nz, 1.25, wh, ui);
          // a flame licking out of every other window, up the facade
          if (r() < 0.55) flames.push(x + nx * 0.6, wy + wh * 0.35, z + nz * 0.6, 1.8 + r() * 0.9, 3.2 + r() * 2.4, ui, r(), 1);
        }
      }
    }
    // roof flames over the top storey (the roof burns with it)
    if (u.top) {
      let minX = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxZ = -Infinity;
      for (const [x, z] of poly) {
        minX = Math.min(minX, x);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxZ = Math.max(maxZ, z);
      }
      for (let x = minX + roofSp / 2; x < maxX; x += roofSp) {
        for (let z = minZ + roofSp / 2; z < maxZ; z += roofSp) {
          const jx = x + (r() - 0.5) * roofSp * 0.7;
          const jz = z + (r() - 0.5) * roofSp * 0.7;
          if (!pointInPolygon(jx, jz, poly)) continue;
          const y = roofHeight(fp, u, jx, jz) - 0.6;
          flames.push(jx, y, jz, 3.6 + r() * 2.6, 5.5 + r() * 5.5, ui, r(), 0);
        }
      }
      // smoke / ember sources: one per ~18 m of roof per building
      const list = srcPerBuilding.get(u.building) ?? [];
      const [cx, cz] = centroid(poly);
      if (!list.some(([x, z]) => Math.hypot(x - cx, z - cz) < 18)) {
        list.push([cx, cz]);
        srcPerBuilding.set(u.building, list);
        const rad = Math.min(14, Math.sqrt(area(poly)) * 0.45);
        sources.push(cx, roofHeight(fp, u, cx, cz), cz, rad, ui);
      }
    }
  });
  return {
    windows: new Float32Array(windows),
    flames: new Float32Array(flames),
    sources: new Float32Array(sources),
    counts: { windows: windows.length / WIN_STRIDE, flames: flames.length / FLAME_STRIDE, sources: sources.length / SRC_STRIDE },
  };
}
