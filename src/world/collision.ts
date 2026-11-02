/**
 * 2D collision of a circle (the player) against building footprints (pure, no three.js).
 * Footprints are open rings of [x, z]. A spatial hash keeps queries O(nearby edges).
 */
export type Ring = readonly (readonly [number, number])[];

interface Edge {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  poly: number;
}

export function pointInRing(x: number, z: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function closestOnSeg(px: number, pz: number, e: Edge): [number, number] {
  const dx = e.bx - e.ax;
  const dz = e.bz - e.az;
  const L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - e.ax) * dx + (pz - e.az) * dz) / L2)) : 0;
  return [e.ax + t * dx, e.az + t * dz];
}

export class FootprintCollider {
  private readonly cells = new Map<string, Edge[]>();
  enabled = true;

  constructor(
    readonly rings: Ring[],
    private readonly cellSize = 16,
  ) {
    rings.forEach((ring, poly) => {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const e: Edge = { ax: a[0], az: a[1], bx: b[0], bz: b[1], poly };
        const x0 = Math.floor(Math.min(a[0], b[0]) / cellSize);
        const x1 = Math.floor(Math.max(a[0], b[0]) / cellSize);
        const z0 = Math.floor(Math.min(a[1], b[1]) / cellSize);
        const z1 = Math.floor(Math.max(a[1], b[1]) / cellSize);
        for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
          const k = `${cx}_${cz}`;
          let l = this.cells.get(k);
          if (!l) this.cells.set(k, (l = []));
          l.push(e);
        }
      }
    });
  }

  private nearby(x: number, z: number, r: number): Edge[] {
    const out = new Set<Edge>();
    const s = this.cellSize;
    for (let cz = Math.floor((z - r) / s); cz <= Math.floor((z + r) / s); cz++) {
      for (let cx = Math.floor((x - r) / s); cx <= Math.floor((x + r) / s); cx++) {
        const l = this.cells.get(`${cx}_${cz}`);
        if (l) for (const e of l) out.add(e);
      }
    }
    return [...out];
  }

  /** Index of the footprint containing the point, or −1. */
  footprintAt(x: number, z: number): number {
    const polys = new Set(this.nearby(x, z, 0.01).map((e) => e.poly));
    for (const p of polys) if (pointInRing(x, z, this.rings[p]!)) return p;
    // a point deep inside a big footprint may be far from all edges: brute-force fallback
    for (let p = 0; p < this.rings.length; p++) if (!polys.has(p) && pointInRing(x, z, this.rings[p]!)) return p;
    return -1;
  }

  /** Push a circle (x, z, radius) out of all footprints. */
  resolve(x: number, z: number, radius: number): { x: number; z: number; hit: boolean } {
    if (!this.enabled) return { x, z, hit: false };
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      const edges = this.nearby(x, z, radius + 0.5);
      if (!edges.length) break;
      let moved = false;
      // inside a footprint: move to the nearest edge, then out by the radius
      const inside = new Set<number>();
      for (const e of edges) if (!inside.has(e.poly) && pointInRing(x, z, this.rings[e.poly]!)) inside.add(e.poly);
      for (const poly of inside) {
        let best: [number, number] | null = null;
        let bd = Infinity;
        for (const e of edges) {
          if (e.poly !== poly) continue;
          const q = closestOnSeg(x, z, e);
          const d = Math.hypot(q[0] - x, q[1] - z);
          if (d < bd) {
            bd = d;
            best = q;
          }
        }
        if (best) {
          const dx = best[0] - x;
          const dz = best[1] - z;
          const l = Math.hypot(dx, dz) || 1;
          x = best[0] + (dx / l) * radius;
          z = best[1] + (dz / l) * radius;
          hit = moved = true;
        }
      }
      for (const e of edges) {
        const q = closestOnSeg(x, z, e);
        const dx = x - q[0];
        const dz = z - q[1];
        const d = Math.hypot(dx, dz);
        if (d < radius && d > 1e-6) {
          x = q[0] + (dx / d) * radius;
          z = q[1] + (dz / d) * radius;
          hit = moved = true;
        }
      }
      if (!moved) break;
    }
    return { x, z, hit };
  }
}
