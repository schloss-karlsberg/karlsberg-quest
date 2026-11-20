import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Route { id: string; stops: { id: string; x: number; z: number }[]; points: [number, number][] }

const DIR = new URL('../content/routes/', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));

/** Distance from q to the polyline and the arc length of its projection. */
function project(pts: [number, number][], q: [number, number]): { d: number; s: number } {
  let best = { d: Infinity, s: 0 };
  let acc = 0;
  for (let k = 1; k < pts.length; k++) {
    const [ax, az] = pts[k - 1]!;
    const [bx, bz] = pts[k]!;
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const t = len > 0 ? Math.max(0, Math.min(1, ((q[0] - ax) * dx + (q[1] - az) * dz) / (len * len))) : 0;
    const d = Math.hypot(q[0] - (ax + t * dx), q[1] - (az + t * dz));
    if (d < best.d - 1e-9) best = { d, s: acc + t * len };
    acc += len;
  }
  return best;
}

describe('content/routes (scripts/content-build/routes.mjs)', () => {
  it('has the draft tour route', () => expect(files).toContain('p-fuehrung.json'));

  for (const f of files) {
    const r = JSON.parse(readFileSync(new URL(f, DIR), 'utf8')) as Route;
    it(`${f}: id matches, steps 3–30 m, points in the extent`, () => {
      expect(`${r.id}.json`).toBe(f);
      for (let k = 1; k < r.points.length; k++) {
        const [ax, az] = r.points[k - 1]!;
        const [bx, bz] = r.points[k]!;
        const d = Math.hypot(bx - ax, bz - az);
        expect(d).toBeLessThanOrEqual(30.15);
        expect(d).toBeGreaterThanOrEqual(2.9);
      }
      for (const [x, z] of r.points) {
        expect(x >= 150 && x <= 2300 && z >= -2150 && z <= 500).toBe(true);
      }
    });
    it(`${f}: stops lie on the polyline, in route order, with unique ids`, () => {
      expect(new Set(r.stops.map((s) => s.id)).size).toBe(r.stops.length);
      let last = -1;
      for (const st of r.stops) {
        const p = project(r.points, [st.x, st.z]);
        expect(p.d, st.id).toBeLessThanOrEqual(3);
        expect(p.s, st.id).toBeGreaterThanOrEqual(last);
        last = p.s;
      }
    });
  }
});
