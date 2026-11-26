/**
 * Pure geometry for the survey tools (no three.js): ray vs heightfield / AABB / triangle,
 * height profiles, polygons, distance formatting. Unit-tested in tests/tools.test.ts.
 */
export interface V3 {
  x: number;
  y: number;
  z: number;
}

export type HeightFn = (x: number, z: number) => number;

/**
 * First hit of a ray with a heightfield surface: march in `step` metres, then bisect.
 * `dir` must be normalised. Returns the distance along the ray or null (no hit within maxDist).
 */
export function rayHeightfield(o: V3, dir: V3, heightAt: HeightFn, maxDist = 800, step = 0.5): number | null {
  const above = (t: number) => o.y + dir.y * t - heightAt(o.x + dir.x * t, o.z + dir.z * t);
  let prev = 0;
  if (above(0) <= 0) return 0;
  // larger steps far away (terrain is 2 m grid), always ≤ 2 m
  while (prev < maxDist) {
    const t = Math.min(maxDist, prev + Math.min(2, step + prev * 0.004));
    const f = above(t);
    if (f <= 0) {
      let lo = prev;
      let hi = t;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (above(mid) > 0) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
    prev = t;
  }
  return null;
}

/** Slab test: entry distance of a ray into an AABB (≥ 0) or null. */
export function rayAabb(o: V3, dir: V3, min: V3, max: V3): number | null {
  let t0 = 0;
  let t1 = Infinity;
  for (const k of ['x', 'y', 'z'] as const) {
    const d = dir[k];
    if (Math.abs(d) < 1e-12) {
      if (o[k] < min[k] || o[k] > max[k]) return null;
      continue;
    }
    let a = (min[k] - o[k]) / d;
    let b = (max[k] - o[k]) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}

/** Möller–Trumbore, double-sided. Vertices ia/ib/ic of the xyz array `p`. Returns t > eps or null. */
export function rayTriangle(o: V3, dir: V3, p: ArrayLike<number>, ia: number, ib: number, ic: number): number | null {
  const ax = p[ia * 3]!;
  const ay = p[ia * 3 + 1]!;
  const az = p[ia * 3 + 2]!;
  const e1x = p[ib * 3]! - ax;
  const e1y = p[ib * 3 + 1]! - ay;
  const e1z = p[ib * 3 + 2]! - az;
  const e2x = p[ic * 3]! - ax;
  const e2y = p[ic * 3 + 1]! - ay;
  const e2z = p[ic * 3 + 2]! - az;
  const px = dir.y * e2z - dir.z * e2y;
  const py = dir.z * e2x - dir.x * e2z;
  const pz = dir.x * e2y - dir.y * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const tx = o.x - ax;
  const ty = o.y - ay;
  const tz = o.z - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return null;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dir.x * qx + dir.y * qy + dir.z * qz) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 1e-4 ? t : null;
}

export interface Measurement {
  distance: number;
  horizontal: number;
  /** b.y − a.y */
  rise: number;
  /** Rise over run in percent (0 when vertical). */
  grade: number;
}

export function measure(a: V3, b: V3): Measurement {
  const horizontal = Math.hypot(b.x - a.x, b.z - a.z);
  const rise = b.y - a.y;
  return { distance: Math.hypot(horizontal, rise), horizontal, rise, grade: horizontal > 1e-6 ? (rise / horizontal) * 100 : 0 };
}

export interface ProfileSample {
  /** Metres along the horizontal line from a. */
  s: number;
  h: number;
}

/** Terrain profile along a → b (n + 1 samples, n ≥ 1). */
export function heightProfile(a: V3, b: V3, heightAt: HeightFn, n = 64): ProfileSample[] {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const out: ProfileSample[] = [];
  const k = Math.max(1, Math.round(n));
  for (let i = 0; i <= k; i++) {
    const f = i / k;
    out.push({ s: f * len, h: heightAt(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f) });
  }
  return out;
}

/** Profile summary: min/max height, total climb and descent (m). */
export function profileStats(p: ProfileSample[]): { min: number; max: number; climb: number; descent: number } {
  let min = Infinity;
  let max = -Infinity;
  let climb = 0;
  let descent = 0;
  for (let i = 0; i < p.length; i++) {
    const h = p[i]!.h;
    min = Math.min(min, h);
    max = Math.max(max, h);
    if (i > 0) {
      const d = h - p[i - 1]!.h;
      if (d > 0) climb += d;
      else descent -= d;
    }
  }
  return { min, max, climb, descent };
}

/** Point in polygon (open ring of [x, z]). */
export function pointInPolygon(x: number, z: number, ring: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from a point to a polygon outline (0 inside). */
export function distanceToPolygon(x: number, z: number, ring: readonly (readonly [number, number])[]): number {
  if (pointInPolygon(x, z, ring)) return 0;
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[j]!;
    const [bx, bz] = ring[i]!;
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

/** German number: 82.94 → "82,9" (digits after the comma). */
export function fmtDe(v: number, digits = 1): string {
  return v.toFixed(digits).replace('-', '−').replace('.', ',');
}

/** Distance label: < 10 m with 2 decimals, < 1 km with 1, else km. */
export function fmtDistance(m: number): string {
  if (m >= 1000) return `${fmtDe(m / 1000, 2)} km`;
  return `${fmtDe(m, m < 10 ? 2 : 1)} m`;
}

/** Nice axis step for a span (1, 2, 5 × 10^k) giving about `target` ticks. */
export function niceStep(span: number, target = 5): number {
  const raw = Math.max(1e-6, span / target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / mag;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
}
