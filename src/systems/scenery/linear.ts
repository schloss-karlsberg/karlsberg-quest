/**
 * Linear set pieces in world space: the park fence (Lattenzaun with posts) following the terrain,
 * the Ehrenhof railing (iron bars between the piers of the model's low wall) and its two-winged
 * gate. Each returns the solids it needs.
 */
import type { Solid } from '../../world/collision';
import type { Kit } from './kit';
import { rng, tint } from './kit';
import { C } from './props';

type H = (x: number, z: number) => number;

/** A paling fence along a polyline: posts every ~2.4 m, two rails, laths every 0.15 m. */
/** A broken stretch of a fence (segment index, from / to metres along it): no laths, no solid. */
export interface FenceGap {
  seg: number;
  s0: number;
  s1: number;
}

export function fence(k: Kit, pts: [number, number][], h: H, seed: number, height = 1.55, gaps: FenceGap[] = []): Solid[] {
  const r = rng(seed);
  const solids: Solid[] = [];
  k.place(0, 0, 0, 0);
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 2.4));
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    // thin box solids (the fence blocks), split around the gaps
    const segGaps = gaps.filter((g) => g.seg === i).sort((p, q) => p.s0 - q.s0);
    let from = 0;
    const inGap = (s: number) => segGaps.some((g) => s > g.s0 && s < g.s1);
    for (const g of [...segGaps, { seg: i, s0: len, s1: len }]) {
      if (g.s0 - from > 0.05) solids.push({ kind: 'box', x: ax + ux * (from + g.s0) * 0.5, z: az + uz * (from + g.s0) * 0.5, ux, uz, hu: (g.s0 - from) / 2, hv: 0.12 });
      from = g.s1;
    }
    for (let j = 0; j <= n; j++) {
      if (j === n && i + 2 < pts.length) continue;
      const t = j / n;
      if (j > 0 && j < n && inGap(len * t)) continue;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const y = h(x, z);
      const lean = (r() - 0.5) * 0.06;
      k.beam(x, y - 0.4, z, x + lean, y + height + 0.15, z + lean * 0.5, 0.13, tint(C.woodDark, r, 0.15));
      if (j === n) continue;
      const x2 = ax + (bx - ax) * ((j + 1) / n);
      const z2 = az + (bz - az) * ((j + 1) / n);
      const y2 = h(x2, z2);
      const sA = len * (j / n);
      const sB = len * ((j + 1) / n);
      const broken = segGaps.some((g) => g.s0 < sB && g.s1 > sA);
      if (!broken) for (const ry of [0.35, height - 0.25]) k.beam(x, y + ry, z, x2, y2 + ry, z2, 0.06, tint(C.woodGrey, r, 0.1), 0.09);
      else {
        // the lower rail hangs down, a few laths lie in the grass
        k.beam(x, y + 0.35, z, x2, y2 + 0.05, z2, 0.06, tint(C.woodGrey, r, 0.1), 0.09);
        for (let q = 0; q < 4; q++) {
          const s = (q + 0.5) / 4;
          const lx = x + (x2 - x) * s + uz * (0.5 + r());
          const lz = z + (z2 - z) * s - ux * (0.5 + r());
          k.beam(lx, h(lx, lz) + 0.03, lz, lx + ux * 1.2, h(lx, lz) + 0.05, lz + uz * 1.2 + 0.3, 0.025, tint(C.woodGrey, r, 0.18), 0.07);
        }
      }
      // laths, slightly ragged
      const seg = Math.hypot(x2 - x, z2 - z);
      const m = Math.floor(seg / 0.15);
      for (let q = 1; q < m; q++) {
        if (r() < 0.04) continue; // a missing lath here and there
        if (inGap(sA + (sB - sA) * (q / m))) continue;
        const s = q / m;
        const lx = x + (x2 - x) * s + uz * 0.06;
        const lz = z + (z2 - z) * s - ux * 0.06;
        const ly = y + (y2 - y) * s;
        const top = height - 0.05 + (r() - 0.5) * 0.08;
        k.beam(lx, ly + 0.05, lz, lx, ly + top, lz, 0.025, tint(C.woodGrey, r, 0.18), 0.07);
        // pointed tops
        k.beam(lx, ly + top, lz, lx, ly + top + 0.07, lz, 0.012, tint(C.woodGrey, r, 0.18), 0.03);
      }
    }
  }
  return solids;
}

/** Iron railing between consecutive piers (centres), from `y0` up `height`, spear-tipped bars. */
export function railing(k: Kit, piers: [number, number][], y0: number, height: number, skip: Set<number>, pierHalf = 0.5): void {
  k.place(0, 0, 0, 0);
  for (let i = 0; i + 1 < piers.length; i++) {
    if (skip.has(i)) continue;
    const [ax, az] = piers[i]!;
    const [bx, bz] = piers[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    const s0 = pierHalf;
    const s1 = len - pierHalf;
    const p = (s: number): [number, number] => [ax + ux * s, az + uz * s];
    const [x0, z0] = p(s0);
    const [x1, z1] = p(s1);
    for (const ry of [0.12, height - 0.25]) k.beam(x0, y0 + ry, z0, x1, y0 + ry, z1, 0.04, C.iron, 0.05);
    const n = Math.floor((s1 - s0) / 0.13);
    for (let q = 1; q < n; q++) {
      const [x, z] = p(s0 + ((s1 - s0) * q) / n);
      k.pole(x, y0, z, x, y0 + height, z, 0.013, C.iron, 4);
      k.cone(0.03, 0.12, x, y0 + height, z, C.iron, 4);
    }
  }
}

/**
 * Two gate wings between the inner faces of two piers. `open` 0 closed … 1 swung inwards
 * (towards `inward`, a unit vector). Returns the closed-gate solid (a thin box) when closed.
 */
export function gate(k: Kit, a: [number, number], b: [number, number], y0: number, height: number, open: number, inward: [number, number], pierHalf = 0.62): Solid | null {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len;
  const uz = (b[1] - a[1]) / len;
  const span = len - pierHalf * 2;
  const wing = span / 2;
  const ang = open * 1.45;
  for (const side of [0, 1]) {
    // hinge at the pier face, the wing points to the middle
    const hx = side === 0 ? a[0] + ux * pierHalf : b[0] - ux * pierHalf;
    const hz = side === 0 ? a[1] + uz * pierHalf : b[1] - uz * pierHalf;
    const dirX = side === 0 ? ux : -ux;
    const dirZ = side === 0 ? uz : -uz;
    const wx = dirX * Math.cos(ang) + inward[0] * Math.sin(ang);
    const wz = dirZ * Math.cos(ang) + inward[1] * Math.sin(ang);
    const end = (s: number): [number, number] => [hx + wx * s, hz + wz * s];
    const [ex, ez] = end(wing - 0.03);
    // frame
    for (const ry of [0.05, 0.9, height - 0.35]) k.beam(hx, y0 + ry, hz, ex, y0 + ry, ez, 0.05, C.iron, 0.06);
    k.beam(hx, y0, hz, hx, y0 + height, hz, 0.07, C.iron);
    k.beam(ex, y0, ez, ex, y0 + height - 0.2, ez, 0.06, C.iron);
    // bars, the middle ones rise to a curve
    const n = Math.floor(wing / 0.12);
    for (let q = 1; q < n; q++) {
      const s = (wing * q) / n;
      const [x, z] = end(s);
      const rise = Math.sin((s / wing) * Math.PI * 0.5) * 0.45;
      const top = height - 0.15 + (side === 0 ? rise : rise);
      k.pole(x, y0 + 0.05, z, x, y0 + top, z, 0.014, C.iron, 4);
      k.cone(0.032, 0.13, x, y0 + top, z, 0x8a6a2a, 4);
    }
    // a gilt boss in the middle panel
    const [mx, mz] = end(wing * 0.5);
    k.cyl(0.14, 0.14, 0.03, mx, y0 + 1.55, mz, 0x9a7a32, [Math.PI / 2, Math.atan2(wx, wz), 0], 10);
  }
  if (open > 0.2) return null;
  const cx = (a[0] + b[0]) / 2;
  const cz = (a[1] + b[1]) / 2;
  return { kind: 'box', x: cx, z: cz, ux, uz, hu: span / 2, hv: 0.15 };
}
