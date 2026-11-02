/**
 * 2D helpers on the local x/z plane (pure, no three.js). Polygons are open rings of [x, z].
 * "CCW" here means positive shoelace area in (x, z): the interior lies to the LEFT of every edge,
 * i.e. at (−t.z, t.x) of the edge tangent t; the outward normal is (t.z, −t.x).
 */
export type P2 = readonly [number, number];
export type Poly = readonly P2[];

export function signedArea(p: Poly): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, z1] = p[i]!;
    const [x2, z2] = p[(i + 1) % p.length]!;
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

/** Same ring with positive signed area. */
export function ccw(p: Poly): [number, number][] {
  const out = p.map((q) => [q[0], q[1]] as [number, number]);
  return signedArea(out) < 0 ? out.reverse() : out;
}

export function centroid(p: Poly): [number, number] {
  let cx = 0;
  let cz = 0;
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, z1] = p[i]!;
    const [x2, z2] = p[(i + 1) % p.length]!;
    const f = x1 * z2 - x2 * z1;
    a += f;
    cx += (x1 + x2) * f;
    cz += (z1 + z2) * f;
  }
  if (Math.abs(a) < 1e-9) return [p[0]![0], p[0]![1]];
  return [cx / (3 * a), cz / (3 * a)];
}

export function pointInPoly(x: number, z: number, p: Poly): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i]!;
    const [xj, zj] = p[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export interface Edge {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Unit tangent a→b. */
  tx: number;
  tz: number;
  /** Outward unit normal (for a CCW polygon). */
  nx: number;
  nz: number;
  len: number;
}

export function edgeOf(a: P2, b: P2): Edge {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1e-9;
  const tx = dx / len;
  const tz = dz / len;
  return { ax: a[0], az: a[1], bx: b[0], bz: b[1], tx, tz, nx: tz, nz: -tx, len };
}

export function edgesOf(p: Poly): Edge[] {
  return p.map((a, i) => edgeOf(a, p[(i + 1) % p.length]!));
}

/** Point at parameter s (metres from a) along an edge. */
export function along(e: Edge, s: number): [number, number] {
  return [e.ax + e.tx * s, e.az + e.tz * s];
}

/** Parameter (metres from a) of the projection of a point onto the edge line. */
export function paramOf(e: Edge, x: number, z: number): number {
  return (x - e.ax) * e.tx + (z - e.az) * e.tz;
}

/** Signed distance of a point from the edge line, positive outward. */
export function outDist(e: Edge, x: number, z: number): number {
  return (x - e.ax) * e.nx + (z - e.az) * e.nz;
}

/**
 * Two edges facing each other across a wall: `o` lies outside `e` (gap = distance along e's
 * outward normal, measured at the overlap) and runs antiparallel. Returns the overlap interval
 * as parameters along `e`, or null.
 */
export function facing(e: Edge, o: Edge, maxGap: number, minGap = -0.08): { gap: number; s0: number; s1: number } | null {
  const dot = e.tx * o.tx + e.tz * o.tz;
  if (dot > -0.97) return null;
  const s0 = Math.max(0, Math.min(paramOf(e, o.ax, o.az), paramOf(e, o.bx, o.bz)));
  const s1 = Math.min(e.len, Math.max(paramOf(e, o.ax, o.az), paramOf(e, o.bx, o.bz)));
  if (s1 - s0 <= 0) return null;
  const [mx, mz] = along(e, (s0 + s1) / 2);
  // distance from e to o's line, measured at the middle of the overlap
  const q = paramOf(o, mx, mz);
  const ox = o.ax + o.tx * q;
  const oz = o.az + o.tz * q;
  const gap = outDist(e, ox, oz);
  if (gap < minGap || gap > maxGap) return null;
  return { gap, s0, s1 };
}

/** Same-direction parallel edge outside `e` (e.g. a room edge and the footprint ring behind it). */
export function behind(e: Edge, o: Edge, maxGap: number): { gap: number; s0: number; s1: number } | null {
  const dot = e.tx * o.tx + e.tz * o.tz;
  if (dot < 0.97) return null;
  const s0 = Math.max(0, Math.min(paramOf(e, o.ax, o.az), paramOf(e, o.bx, o.bz)));
  const s1 = Math.min(e.len, Math.max(paramOf(e, o.ax, o.az), paramOf(e, o.bx, o.bz)));
  if (s1 - s0 <= 0) return null;
  const [mx, mz] = along(e, (s0 + s1) / 2);
  const q = paramOf(o, mx, mz);
  const gap = outDist(e, o.ax + o.tx * q, o.az + o.tz * q);
  if (gap < 0.05 || gap > maxGap) return null;
  return { gap, s0, s1 };
}

/** Closest point on segment ab to p. */
export function closestOnSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): [number, number] {
  const dx = bx - ax;
  const dz = bz - az;
  const L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0;
  return [ax + t * dx, az + t * dz];
}

/**
 * Parameter interval [t0, t1] (0..1 along a→b) of the part of segment ab strictly inside a
 * convex CCW polygon, or null (Cyrus–Beck).
 */
export function clipSegConvex(ax: number, az: number, bx: number, bz: number, poly: Poly): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  for (let i = 0; i < poly.length; i++) {
    const e = edgeOf(poly[i]!, poly[(i + 1) % poly.length]!);
    // inside: outDist < 0
    const num = (ax - e.ax) * e.nx + (az - e.az) * e.nz;
    const den = dx * e.nx + dz * e.nz;
    if (Math.abs(den) < 1e-12) {
      if (num >= 0) return null;
      continue;
    }
    const t = -num / den;
    if (den < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 >= t1) return null;
  }
  return t1 - t0 > 1e-6 ? [t0, t1] : null;
}

/** Oriented rectangle as a CCW polygon: centre, unit axis (u), half extents along u and v. */
export function orientedRect(cx: number, cz: number, ux: number, uz: number, hu: number, hv: number): [number, number][] {
  const vx = -uz;
  const vz = ux;
  const pts: [number, number][] = [
    [cx - ux * hu - vx * hv, cz - uz * hu - vz * hv],
    [cx + ux * hu - vx * hv, cz + uz * hu - vz * hv],
    [cx + ux * hu + vx * hv, cz + uz * hu + vz * hv],
    [cx - ux * hu + vx * hv, cz - uz * hu + vz * hv],
  ];
  return ccw(pts);
}

/** Deterministic hash → [0, 1). */
export function hash1(a: number, b = 0, c = 0): number {
  let h = Math.imul((a * 73856093) ^ (b * 19349663) ^ (c * 83492791), 0x27d4eb2d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Hash of a string id → 32-bit seed. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
