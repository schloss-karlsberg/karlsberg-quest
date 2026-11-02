/** Small, pure 2D helpers on the local x/z frame (polygons are open rings of [x, z]). */
export type Pt = [number, number];
export type Poly = Pt[];

export function pointInPolygon(x: number, z: number, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** Distance from a point to the polygon outline (0 on the edge; does not check containment). */
export function distToOutline(x: number, z: number, poly: Poly): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    d = Math.min(d, distToSegment(x, z, poly[j]![0], poly[j]![1], poly[i]![0], poly[i]![1]));
  }
  return d;
}

/** Signed-ish distance: 0 inside, else distance to the outline. */
export function distToPolygon(x: number, z: number, poly: Poly): number {
  return pointInPolygon(x, z, poly) ? 0 : distToOutline(x, z, poly);
}

/** Smallest distance between two polygons (0 if they touch or overlap). */
export function polygonGap(a: Poly, b: Poly): number {
  let d = Infinity;
  for (const [x, z] of a) d = Math.min(d, distToPolygon(x, z, b));
  for (const [x, z] of b) d = Math.min(d, distToPolygon(x, z, a));
  return d;
}

/** True if the polygons overlap in plan by more than a sliver (vertical neighbours). */
export function polygonsOverlap(a: Poly, b: Poly): boolean {
  const ca = centroid(a);
  const cb = centroid(b);
  if (pointInPolygon(ca[0], ca[1], b) || pointInPolygon(cb[0], cb[1], a)) return true;
  let inside = 0;
  for (const [x, z] of a) if (pointInPolygon(x, z, b)) inside++;
  return inside >= 2;
}

export function area(poly: Poly): number {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += poly[j]![0] * poly[i]![1] - poly[i]![0] * poly[j]![1];
  return Math.abs(s) / 2;
}

export function centroid(poly: Poly): Pt {
  let x = 0;
  let z = 0;
  for (const p of poly) {
    x += p[0];
    z += p[1];
  }
  return [x / poly.length, z / poly.length];
}

export function bbox(poly: Poly): { x0: number; z0: number; x1: number; z1: number } {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of poly) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  return { x0, z0, x1, z1 };
}

/** Deterministic PRNG (mulberry32). */
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

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeInOut = (t: number): number => {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};
export const easeOut = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
export const easeIn = (t: number): number => Math.pow(clamp01(t), 3);
