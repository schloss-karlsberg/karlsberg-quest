/**
 * Building-local plan frame [s, t] of the palace catalogue, re-implemented (read-only reference:
 * ../saar-lidar-explorer/schloss-karlsberg/model/src/layout/footprint.ts + geom.ts + site.ts).
 * We never import sister code; this is a small, tested copy of the maths so room polygons
 * (given in [s, t]) can be converted to EPSG:25832 and our local frame.
 */
export type P2 = [number, number];

export function openRing(ring: readonly P2[]): P2[] {
  if (ring.length > 1) {
    const a = ring[0]!;
    const b = ring[ring.length - 1]!;
    if (a[0] === b[0] && a[1] === b[1]) return ring.slice(0, -1);
  }
  return ring.slice();
}

export function signedArea(pts: readonly P2[]): number {
  const p = openRing(pts);
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]!;
    const [x1, y1] = p[(i + 1) % p.length]!;
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

export function ensureCCW(pts: readonly P2[]): P2[] {
  const o = openRing(pts);
  return signedArea(o) >= 0 ? o : o.reverse();
}

export function centroid(pts: readonly P2[]): P2 {
  const p = openRing(pts);
  const A = signedArea(p);
  if (Math.abs(A) < 1e-9) {
    return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]!;
    const [x1, y1] = p[(i + 1) % p.length]!;
    const f = x0 * y1 - x1 * y0;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  return [cx / (6 * A), cy / (6 * A)];
}

function convexHull(pts: readonly P2[]): P2[] {
  const p = openRing(pts)
    .map((q) => [q[0], q[1]] as P2)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: P2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function minAreaRect(pts: readonly P2[]): { centre: P2; axis: P2 } {
  const h = convexHull(pts);
  let best: { centre: P2; axis: P2; area: number } | null = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i]!;
    const b = h[(i + 1) % h.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-9) continue;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const q of h) {
      const u = q[0] * ux + q[1] * uy;
      const v = -q[0] * uy + q[1] * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area - 1e-9) {
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      const centre: P2 = [cu * ux - cv * uy, cu * uy + cv * ux];
      const lu = maxU - minU;
      const lv = maxV - minV;
      best = lu >= lv ? { centre, axis: [ux, uy], area } : { centre, axis: [-uy, ux], area };
    }
  }
  if (!best) throw new Error('minAreaRect: degenerate footprint');
  return best;
}

function circleEstimate(pts: readonly P2[]): { centre: P2; cv: number } {
  const p = openRing(pts);
  const c = centroid(p);
  const r = p.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1]));
  const mean = r.reduce((s, x) => s + x, 0) / r.length;
  const sd = Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / r.length);
  return { centre: c, cv: mean > 0 ? sd / mean : 0 };
}

export interface PlanFrame {
  centreEN: P2;
  sDir: P2;
  tDir: P2;
}

/** Same result as the catalogue generator's `buildingFrame(ring, { courtToward })`. */
export function planFrame(ring: readonly P2[], courtToward?: P2): PlanFrame {
  const pts = ensureCCW(ring);
  const ref: P2 = [pts[0]![0], pts[0]![1]];
  const rel = pts.map((p) => [p[0] - ref[0], p[1] - ref[1]] as P2);
  const circ = circleEstimate(rel);
  const round = rel.length >= 12 && circ.cv < 0.04;
  const r = minAreaRect(rel);
  let centre = r.centre;
  const axis = r.axis;
  if (round) centre = circ.centre;
  let tDir: P2 = [-axis[1], axis[0]];
  const centreEN: P2 = [centre[0] + ref[0], centre[1] + ref[1]];
  if (courtToward) {
    const d: P2 = [courtToward[0] - centreEN[0], courtToward[1] - centreEN[1]];
    if (d[0] * tDir[0] + d[1] * tDir[1] < 0) tDir = [-tDir[0], -tDir[1]];
  } else {
    const sTry: P2 = [tDir[1], -tDir[0]];
    const az = ((Math.atan2(sTry[0], sTry[1]) * 180) / Math.PI + 360) % 360;
    if (az >= 180) tDir = [-tDir[0], -tDir[1]];
  }
  const sDir: P2 = [tDir[1], -tDir[0]];
  return { centreEN, sDir, tDir };
}

export function stToEN(f: PlanFrame, p: P2): P2 {
  return [f.centreEN[0] + p[0] * f.sDir[0] + p[1] * f.tDir[0], f.centreEN[1] + p[0] * f.sDir[1] + p[1] * f.tDir[1]];
}

export function nearestOnLine(line: readonly P2[], p: P2): P2 {
  let best: P2 = line[0]!;
  let bd = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    const q: P2 = [a[0] + t * dx, a[1] + t * dy];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}
