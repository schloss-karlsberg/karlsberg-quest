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

/** Extra solid (set dressing): a circle or an oriented box (centre, unit axis u, half extents). */
export type Solid = { kind: 'circle'; x: number; z: number; r: number } | { kind: 'box'; x: number; z: number; ux: number; uz: number; hu: number; hv: number };

/** A place where one footprint does not block (a gate in a wall): inside the circle its edges are ignored. */
export interface PassZone {
  poly: number;
  x: number;
  z: number;
  r: number;
}

/** Distance past each face in box coordinates; beyond both faces the nearest point is a corner. */
function overlapsBox(x: number, z: number, radius: number, b: Extract<Solid, { kind: 'box' }>): boolean {
  const dx = x - b.x;
  const dz = z - b.z;
  const du = Math.abs(dx * b.ux + dz * b.uz) - b.hu;
  const dv = Math.abs(-dx * b.uz + dz * b.ux) - b.hv;
  if (du >= radius || dv >= radius) return false;
  return du <= 0 || dv <= 0 || du * du + dv * dv < radius * radius;
}

/** Push a circle out of an oriented box (2D); null when not touching. */
export function pushOutOfBox(x: number, z: number, radius: number, b: Extract<Solid, { kind: 'box' }>): [number, number] | null {
  const dx = x - b.x;
  const dz = z - b.z;
  const vx = -b.uz;
  const vz = b.ux;
  const u = dx * b.ux + dz * b.uz;
  const v = dx * vx + dz * vz;
  const cu = Math.max(-b.hu, Math.min(b.hu, u));
  const cv = Math.max(-b.hv, Math.min(b.hv, v));
  const inside = cu === u && cv === v;
  if (inside) {
    // out through the nearest side
    const pu = b.hu - Math.abs(u);
    const pv = b.hv - Math.abs(v);
    let nu = u;
    let nv = v;
    if (pu < pv) nu = Math.sign(u || 1) * (b.hu + radius);
    else nv = Math.sign(v || 1) * (b.hv + radius);
    return [b.x + nu * b.ux + nv * vx, b.z + nu * b.uz + nv * vz];
  }
  const ex = u - cu;
  const ev = v - cv;
  const d = Math.hypot(ex, ev);
  if (d >= radius || d < 1e-9) return null;
  const nu = cu + (ex / d) * radius;
  const nv = cv + (ev / d) * radius;
  return [b.x + nu * b.ux + nv * vx, b.z + nu * b.uz + nv * vz];
}

/** Numeric spatial-hash key of a cell (no string building on the camera's hot path). */
function cellKey(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}

export class FootprintCollider {
  private readonly cells = new Map<string, Edge[]>();
  enabled = true;
  /**
   * Footprints that stay solid while `enabled` is false (the buildings that survive in the 1796
   * ruin: world/palace.ts `RUIN_KEEP`).
   */
  keep: ReadonlySet<number> = new Set();
  /** Set dressing solids by owner (props, gates); resolved after the footprints, in every era. */
  private readonly solids = new Map<string, Solid[]>();
  /** Gates in footprints (by owner): inside a zone that footprint's edges do not block. */
  private readonly passZones = new Map<string, PassZone[]>();
  /**
   * Optional overlay (interiors system): footprints in `passable` stop blocking and `resolve`
   * runs after the footprint pass (also while the footprints are disabled, e.g. ruin walls).
   */
  overlay: {
    passable: ReadonlySet<number>;
    resolve(x: number, z: number, radius: number): { x: number; z: number; hit: boolean };
    /** Allocation-free overlap test (the camera's probes); falls back to `resolve(…).hit`. */
    hits?(x: number, z: number, radius: number): boolean;
  } | null = null;
  /** The same edges keyed by number (allocation-free lookups in `hits`). */
  private readonly cellsN = new Map<number, Edge[]>();
  /** Flat copies of the solids and pass zones (no iterator objects in `hits`). */
  private solidFlat: Solid[] = [];
  private zoneFlat: PassZone[] = [];

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
          const kn = cellKey(cx, cz);
          let ln = this.cellsN.get(kn);
          if (!ln) this.cellsN.set(kn, (ln = []));
          ln.push(e);
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

  /** Replace the solids of one owner ([] removes them). */
  setSolids(owner: string, list: Solid[]): void {
    if (list.length) this.solids.set(owner, list);
    else this.solids.delete(owner);
    this.solidFlat = [...this.solids.values()].flat();
  }

  /** Replace the pass zones (gates) of one owner ([] removes them). */
  setPassZones(owner: string, list: PassZone[]): void {
    if (list.length) this.passZones.set(owner, list);
    else this.passZones.delete(owner);
    this.zoneFlat = [...this.passZones.values()].flat();
  }

  /**
   * Does a circle overlap a footprint edge, a set-dressing solid or an overlay wall? Like
   * `resolve(…).hit` for a circle that moved in from outside (a point deep inside a footprint,
   * far from every edge, is not reported), but without allocating: the third-person camera
   * sweeps its boom with it every frame.
   */
  hits(x: number, z: number, radius: number): boolean {
    if (this.enabled || this.keep.size) {
      const s = this.cellSize;
      const passable = this.overlay?.passable;
      const r2 = radius * radius;
      for (let cz = Math.floor((z - radius) / s); cz <= Math.floor((z + radius) / s); cz++)
        for (let cx = Math.floor((x - radius) / s); cx <= Math.floor((x + radius) / s); cx++) {
          const l = this.cellsN.get(cellKey(cx, cz));
          if (!l) continue;
          for (const e of l) {
            if (!(this.enabled || this.keep.has(e.poly)) || passable?.has(e.poly)) continue;
            const dx = e.bx - e.ax;
            const dz = e.bz - e.az;
            const L2 = dx * dx + dz * dz;
            const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - e.ax) * dx + (z - e.az) * dz) / L2)) : 0;
            const ex = e.ax + t * dx - x;
            const ez = e.az + t * dz - z;
            if (ex * ex + ez * ez >= r2 || this.inZone(e.poly, x, z)) continue;
            return true;
          }
        }
    }
    for (const q of this.solidFlat) {
      if (q.kind === 'circle') {
        if (Math.hypot(x - q.x, z - q.z) < q.r + radius) return true;
      } else if (overlapsBox(x, z, radius, q)) return true;
    }
    const o = this.overlay;
    if (!o) return false;
    return o.hits ? o.hits(x, z, radius) : o.resolve(x, z, radius).hit;
  }

  /** A gate of footprint `poly` contains the point. */
  private inZone(poly: number, x: number, z: number): boolean {
    for (const g of this.zoneFlat) if (g.poly === poly && Math.hypot(x - g.x, z - g.z) < g.r) return true;
    return false;
  }

  /** Is the point inside one of the set-dressing solids (grown by `radius`)? */
  solidAt(x: number, z: number, radius = 0): boolean {
    for (const list of this.solids.values()) {
      for (const s of list) {
        if (s.kind === 'circle') {
          if (Math.hypot(x - s.x, z - s.z) < s.r + radius) return true;
        } else if (overlapsBox(x, z, radius, s)) return true;
      }
    }
    return false;
  }

  /** Push a circle (x, z, radius) out of all footprints (then out of the overlay's walls). */
  resolve(x: number, z: number, radius: number): { x: number; z: number; hit: boolean } {
    const o = this.overlay;
    let base = this.resolveRings(x, z, radius, o?.passable);
    if (this.solids.size) {
      const s = this.resolveSolids(base.x, base.z, radius);
      if (s.hit) base = { x: s.x, z: s.z, hit: true };
    }
    if (!o) return base;
    const r = o.resolve(base.x, base.z, radius);
    return { x: r.x, z: r.z, hit: base.hit || r.hit };
  }

  private resolveSolids(x: number, z: number, radius: number): { x: number; z: number; hit: boolean } {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      let moved = false;
      for (const list of this.solids.values()) {
        for (const s of list) {
          if (s.kind === 'circle') {
            const dx = x - s.x;
            const dz = z - s.z;
            const d = Math.hypot(dx, dz);
            const min = s.r + radius;
            if (d < min) {
              const k = d > 1e-6 ? min / d : 0;
              x = d > 1e-6 ? s.x + dx * k : s.x + min;
              z = d > 1e-6 ? s.z + dz * k : z;
              moved = hit = true;
            }
          } else {
            const q = pushOutOfBox(x, z, radius, s);
            if (q) {
              x = q[0];
              z = q[1];
              moved = hit = true;
            }
          }
        }
      }
      if (!moved) break;
    }
    return { x, z, hit };
  }

  /** Footprints passable at x/z (gates): a zone of that footprint contains the point. */
  private gated(x: number, z: number): Set<number> | null {
    let out: Set<number> | null = null;
    for (const list of this.passZones.values()) {
      for (const g of list) {
        if (Math.hypot(x - g.x, z - g.z) < g.r) (out ??= new Set()).add(g.poly);
      }
    }
    return out;
  }

  private resolveRings(x: number, z: number, radius: number, passable?: ReadonlySet<number>): { x: number; z: number; hit: boolean } {
    if (!this.enabled && !this.keep.size) return { x, z, hit: false };
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      const all = this.nearby(x, z, radius + 0.5);
      const gated = this.passZones.size ? this.gated(x, z) : null;
      const edges = all.filter((e) => (this.enabled || this.keep.has(e.poly)) && !passable?.has(e.poly) && !gated?.has(e.poly));
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
