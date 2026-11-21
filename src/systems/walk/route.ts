/**
 * Polylines and routes for the tour walk (pure, no three.js). A route is a polyline with named
 * stops; walkers move along its arc length `s` (metres from the first point).
 */
import type { Route } from './types';

export interface PolyPoint { x: number; z: number; dirX: number; dirZ: number }
export interface Extent { x: [number, number]; z: [number, number] }

/** The playable terrain (docs/ARCHITECTURE.md §2). */
export const PLAY_EXTENT: Extent = { x: [150, 2300], z: [-2150, 500] };
/** Validator limits (contract C2). */
export const MAX_SEGMENT = 30;
export const MAX_STOP_OFF = 3;

export class Polyline {
  readonly xs: Float64Array;
  readonly zs: Float64Array;
  /** cum[i] = arc length at point i. */
  readonly cum: Float64Array;
  readonly length: number;

  constructor(points: readonly (readonly [number, number])[]) {
    const n = points.length;
    if (n < 1) throw new Error('Polyline needs at least one point');
    this.xs = new Float64Array(n);
    this.zs = new Float64Array(n);
    this.cum = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.xs[i] = points[i]![0];
      this.zs[i] = points[i]![1];
      if (i > 0) this.cum[i] = this.cum[i - 1]! + Math.hypot(this.xs[i]! - this.xs[i - 1]!, this.zs[i]! - this.zs[i - 1]!);
    }
    this.length = this.cum[n - 1]!;
  }

  get count(): number {
    return this.xs.length;
  }

  /** Index i of the segment [i, i+1] containing s (binary search; degenerate lines give 0). */
  private segmentAt(s: number): number {
    const n = this.xs.length;
    if (n < 2) return 0;
    let lo = 0;
    let hi = n - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid]! <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** The point at arc length s (clamped to [0, length]) and the unit direction of its segment. */
  pointAt(s: number, out: PolyPoint = { x: 0, z: 0, dirX: 0, dirZ: -1 }): PolyPoint {
    const n = this.xs.length;
    if (n < 2) {
      out.x = this.xs[0]!;
      out.z = this.zs[0]!;
      out.dirX = 0;
      out.dirZ = -1;
      return out;
    }
    const c = Math.max(0, Math.min(this.length, s));
    let i = this.segmentAt(c);
    // skip zero-length segments for the direction
    while (i < n - 2 && this.cum[i + 1]! - this.cum[i]! < 1e-9) i++;
    const ax = this.xs[i]!;
    const az = this.zs[i]!;
    const dx = this.xs[i + 1]! - ax;
    const dz = this.zs[i + 1]! - az;
    const len = this.cum[i + 1]! - this.cum[i]!;
    const f = len > 1e-9 ? Math.max(0, Math.min(1, (c - this.cum[i]!) / len)) : 0;
    out.x = ax + dx * f;
    out.z = az + dz * f;
    if (len > 1e-9) {
      out.dirX = dx / len;
      out.dirZ = dz / len;
    }
    return out;
  }

  /** The nearest point on the line to (x, z): its arc length and the distance. */
  project(x: number, z: number): { s: number; dist: number } {
    const n = this.xs.length;
    if (n < 2) return { s: 0, dist: Math.hypot(x - this.xs[0]!, z - this.zs[0]!) };
    let bestD2 = Infinity;
    let bestS = 0;
    for (let i = 0; i < n - 1; i++) {
      const ax = this.xs[i]!;
      const az = this.zs[i]!;
      const dx = this.xs[i + 1]! - ax;
      const dz = this.zs[i + 1]! - az;
      const l2 = dx * dx + dz * dz;
      const f = l2 > 1e-12 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      const px = ax + dx * f - x;
      const pz = az + dz * f - z;
      const d2 = px * px + pz * pz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestS = this.cum[i]! + f * (this.cum[i + 1]! - this.cum[i]!);
      }
    }
    return { s: bestS, dist: Math.sqrt(bestD2) };
  }
}

export interface RouteStop { id: string; x: number; z: number; s: number }
export interface BuiltRoute {
  id: string;
  line: Polyline;
  /** Stop id → arc length of its projection onto the line. */
  stopS: Map<string, number>;
  /** Stops in route order with their s. */
  stops: RouteStop[];
}

export function buildRoute(route: Route): BuiltRoute {
  const line = new Polyline(route.points);
  const stopS = new Map<string, number>();
  const stops: RouteStop[] = [];
  for (const st of route.stops) {
    const s = line.project(st.x, st.z).s;
    stopS.set(st.id, s);
    stops.push({ id: st.id, x: st.x, z: st.z, s });
  }
  return { id: route.id, line, stopS, stops };
}

/** Stops at or ahead of s (tolerance 1 cm), in route order. */
export function stopsAhead(rt: BuiltRoute, s: number): RouteStop[] {
  return rt.stops.filter((st) => st.s >= s - 0.01);
}

/** Of the stops at or ahead of s, the one closest to (x, z); null when none is ahead. */
export function nearestStopAhead(rt: BuiltRoute, s: number, x: number, z: number): RouteStop | null {
  let best: RouteStop | null = null;
  let bestD = Infinity;
  for (const st of stopsAhead(rt, s)) {
    const d = Math.hypot(st.x - x, st.z - z);
    if (d < bestD) {
      bestD = d;
      best = st;
    }
  }
  return best;
}

/** Validation for a raw polyline: ≥ 2 points, all inside the extent, consecutive points ≤ 30 m apart. */
export function checkPath(path: readonly (readonly [number, number])[], extent: Extent = PLAY_EXTENT, label = 'path'): string[] {
  const errs: string[] = [];
  if (!Array.isArray(path) || path.length < 2) {
    errs.push(`${label}: needs at least 2 points (has ${Array.isArray(path) ? path.length : 0})`);
    if (!Array.isArray(path)) return errs;
  }
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    const [x, z] = p;
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      errs.push(`${label}: point ${i} is not a number pair`);
      continue;
    }
    if (x < extent.x[0] || x > extent.x[1] || z < extent.z[0] || z > extent.z[1])
      errs.push(`${label}: point ${i} (${x}, ${z}) is outside the extent x ${extent.x[0]}…${extent.x[1]}, z ${extent.z[0]}…${extent.z[1]}`);
    if (i > 0) {
      const q = path[i - 1]!;
      const d = Math.hypot(x - q[0], z - q[1]);
      if (d > MAX_SEGMENT) errs.push(`${label}: points ${i - 1}→${i} are ${d.toFixed(1)} m apart (max ${MAX_SEGMENT})`);
    }
  }
  return errs;
}

/** Validation for a route file: the path rules plus stops (unique ids, ≤ 3 m off the line, in order). */
export function checkRoute(route: Route, extent: Extent = PLAY_EXTENT): string[] {
  const label = `route ${route.id}`;
  const errs = checkPath(route.points, extent, label);
  if (!route.points?.length) return errs;
  const line = new Polyline(route.points);
  const seen = new Set<string>();
  let prevS = -Infinity;
  let prevId = '';
  for (const st of route.stops ?? []) {
    if (seen.has(st.id)) errs.push(`${label}: duplicate stop id '${st.id}'`);
    seen.add(st.id);
    const { s, dist } = line.project(st.x, st.z);
    if (dist > MAX_STOP_OFF) errs.push(`${label}: stop '${st.id}' is ${dist.toFixed(1)} m from the polyline (max ${MAX_STOP_OFF})`);
    if (s <= prevS) errs.push(`${label}: stop '${st.id}' (s ${s.toFixed(1)}) is not after '${prevId}' (s ${prevS.toFixed(1)})`);
    prevS = s;
    prevId = st.id;
  }
  return errs;
}
