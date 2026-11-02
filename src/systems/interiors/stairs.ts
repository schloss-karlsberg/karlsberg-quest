/**
 * Stair halls as walkable 2.5D ramps (pure). A double-height stair hall of the catalogue becomes
 * a straight flight, a dog-leg (half landing at the far end) or an imperial stair (central flight
 * up, two side flights back), whichever connects the most neighbouring rooms at their floor
 * heights. Floors are piecewise linear in the room frame; flights stay below 36° so the player's
 * 42° slope limit lets you walk up. Lanes at different heights are separated by full-height
 * dividers (balustrade walls) for the 2D collision.
 */
import type { RoomFrame, StairPlan, StairZone } from './types';

/** Max flight gradient (rise / run): 0.72 ≈ 36°; servant stairs 0.8 ≈ 39° (player limit 42°). */
export const MAX_GRADIENT = 0.72;
const MAX_GRADIENT_TIGHT = 0.8;
/** Flat pad at the bottom / top of each lane (room for a door on the long side). */
const PAD = 1.9;
/** Tight servant stairs: short pads, doors only on the end walls. */
const PAD_TIGHT = 0.45;

export function frameUV(f: RoomFrame, x: number, z: number): [number, number] {
  const dx = x - f.ox;
  const dz = z - f.oz;
  return [dx * f.ux + dz * f.uz, dx * f.vx + dz * f.vz];
}

export function frameXZ(f: RoomFrame, u: number, v: number): [number, number] {
  return [f.ox + f.ux * u + f.vx * v, f.oz + f.uz * u + f.vz * v];
}

/** Floor height of a stair plan at room-frame (u, v); null outside every zone. */
export function stairHeight(p: StairPlan, u: number, v: number): number | null {
  const eps = 0.02;
  for (const z of p.zones) {
    if (u >= z.u0 - eps && u <= z.u1 + eps && v >= z.v0 - eps && v <= z.v1 + eps) {
      const uu = Math.min(z.u1, Math.max(z.u0, u));
      return z.h0 + z.k * (uu - z.u0);
    }
  }
  return null;
}

/** Candidate stair layouts for a hall of length L (along u) and width W. */
export function stairConfigs(L: number, W: number, low: number, high: number): StairPlan[] {
  const rise = high - low;
  const mid = (low + high) / 2;
  const out: StairPlan[] = [];
  // straight: pad, flight, pad
  const run = L - 2 * PAD;
  if (run > 0 && rise / run <= MAX_GRADIENT) {
    out.push({
      type: 'straight',
      low,
      mid,
      high,
      dividers: [],
      zones: [
        { u0: 0, u1: PAD, v0: 0, v1: W, h0: low, k: 0, kind: 'landing' },
        { u0: PAD, u1: L - PAD, v0: 0, v1: W, h0: low, k: rise / run, kind: 'flight' },
        { u0: L - PAD, u1: L, v0: 0, v1: W, h0: high, k: 0, kind: 'landing' },
      ],
    });
  }
  // half landing at the far end, lanes back and forth
  for (const tight of [false, true]) {
    const pad = tight ? PAD_TIGHT : PAD;
    const D = tight ? 1.65 : Math.min(2.4, Math.max(1.6, W * 0.22));
    const F = L - D; // u where the landing starts
    const frun = F - pad;
    if (frun <= 0 || rise / 2 / frun > (tight ? MAX_GRADIENT_TIGHT : MAX_GRADIENT)) continue;
    const lanes = (up: [number, number][], back: [number, number][], type: StairPlan['type']): StairPlan => {
      const zones: StairZone[] = [];
      for (const [v0, v1] of up) {
        zones.push({ u0: 0, u1: pad, v0, v1, h0: low, k: 0, kind: 'landing' });
        zones.push({ u0: pad, u1: F, v0, v1, h0: low, k: (mid - low) / frun, kind: 'flight' });
      }
      for (const [v0, v1] of back) {
        zones.push({ u0: 0, u1: pad, v0, v1, h0: high, k: 0, kind: 'landing' });
        zones.push({ u0: pad, u1: F, v0, v1, h0: high, k: -(high - mid) / frun, kind: 'flight' });
      }
      zones.push({ u0: F, u1: L, v0: 0, v1: W, h0: mid, k: 0, kind: 'landing' });
      const cuts = new Set<number>();
      for (const [v0, v1] of [...up, ...back]) {
        if (v0 > 0.01) cuts.add(+v0.toFixed(4));
        if (v1 < W - 0.01) cuts.add(+v1.toFixed(4));
      }
      return { type, low, mid, high, zones, dividers: [...cuts].map((v) => ({ u0: 0, v0: v, u1: F, v1: v })) };
    };
    if (W >= 3.0) {
      out.push(lanes([[0, W / 2]], [[W / 2, W]], 'dogleg'));
      out.push(lanes([[W / 2, W]], [[0, W / 2]], 'dogleg'));
    }
    if (W >= 7.5 && !tight) out.push(lanes([[W / 3, (2 * W) / 3]], [[0, W / 3], [(2 * W) / 3, W]], 'imperial'));
  }
  return out;
}
