/**
 * Runtime queries on a Plan (pure): height-aware 2D wall collision, floor height (rooms, stair
 * ramps, door passages, outdoor steps), which room the player stands in. A spatial hash keeps
 * every query to the walls of a few 4 m cells. Collapsed rooms (fire) block their doors.
 */
import { closestOnSeg, pointInPoly } from './geom';
import { roomFloorAt } from './layout';
import type { Plan, Wall } from './types';

/** Body above the feet that walls block: knee to head (low rubble and sills under 0.45 m are stepped over). */
const BODY_LOW = 0.45;
const BODY_HIGH = 1.7;
/** Highest step up the floor choice accepts. */
const STEP_UP = 0.75;

export class PlanQuery {
  private readonly cells = new Map<number, Wall[]>();
  private readonly cell = 4;
  private dynamic: Wall[] = [];
  private readonly blockedDoors = new Set<number>();
  /** Prop outlines of the built buildings (tables, crates, tubs …), by building. */
  private readonly solids = new Map<string, Wall[]>();
  private solidList: Wall[] = [];

  /** Bounds of the ground rects (door passages, steps) for a cheap rejection. */
  private readonly groundBox: Float64Array;

  constructor(readonly plan: Plan) {
    for (const w of plan.walls) this.insert(w);
    this.groundBox = new Float64Array(plan.ground.length * 4);
    plan.ground.forEach((g, i) => {
      const xs = g.poly.map((p) => p[0]);
      const zs = g.poly.map((p) => p[1]);
      this.groundBox.set([Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)], i * 4);
    });
  }

  private key(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096);
  }

  private insert(w: Wall): void {
    const s = this.cell;
    const x0 = Math.floor(Math.min(w.ax, w.bx) / s);
    const x1 = Math.floor(Math.max(w.ax, w.bx) / s);
    const z0 = Math.floor(Math.min(w.az, w.bz) / s);
    const z1 = Math.floor(Math.max(w.az, w.bz) / s);
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) {
        const k = this.key(cx, cz);
        let l = this.cells.get(k);
        if (!l) this.cells.set(k, (l = []));
        l.push(w);
      }
  }

  /** True if x/z lies within any building's bounds (cheap pre-check). */
  inBounds(x: number, z: number): boolean {
    for (const b of this.plan.buildings) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return true;
    return false;
  }

  private nearby(x: number, z: number, r: number): Wall[] {
    const out: Wall[] = [];
    const seen = new Set<Wall>();
    const s = this.cell;
    for (let cz = Math.floor((z - r) / s); cz <= Math.floor((z + r) / s); cz++)
      for (let cx = Math.floor((x - r) / s); cx <= Math.floor((x + r) / s); cx++) {
        const l = this.cells.get(this.key(cx, cz));
        if (l)
          for (const w of l)
            if (!seen.has(w)) {
              seen.add(w);
              out.push(w);
            }
      }
    for (const w of this.dynamic) if (!seen.has(w)) out.push(w);
    for (const w of this.solidList) {
      if (Math.max(w.ax, w.bx) < x - r || Math.min(w.ax, w.bx) > x + r || Math.max(w.az, w.bz) < z - r || Math.min(w.az, w.bz) > z + r) continue;
      out.push(w);
    }
    return out;
  }

  /** Push a circle at feet height `y` out of every wall its body overlaps. */
  resolve(x: number, z: number, radius: number, y: number): { x: number; z: number; hit: boolean } {
    let hit = false;
    const lo = y + BODY_LOW;
    const hi = y + BODY_HIGH;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const w of this.nearby(x, z, radius + 0.5)) {
        if (w.y1 <= lo || w.y0 >= hi) continue;
        const [qx, qz] = closestOnSeg(x, z, w.ax, w.az, w.bx, w.bz);
        const dx = x - qx;
        const dz = z - qz;
        const d = Math.hypot(dx, dz);
        if (d < radius) {
          if (d > 1e-6) {
            x = qx + (dx / d) * radius;
            z = qz + (dz / d) * radius;
          } else {
            // exactly on the wall: push along its normal
            const L = Math.hypot(w.bx - w.ax, w.bz - w.az) || 1;
            x = qx + ((w.az - w.bz) / L) * radius;
            z = qz + ((w.bx - w.ax) / L) * radius;
          }
          hit = moved = true;
        }
      }
      if (!moved) break;
    }
    return { x, z, hit };
  }

  /**
   * Floor height at x/z for someone at height `yHint`: the highest floor reachable from there
   * (stacked storeys), or null outside every room / passage / step. `prefer` (room indices)
   * wins when the hint is outside the building (clue markers on an upper floor).
   */
  floorAt(x: number, z: number, yHint: number, terrain: number, prefer?: ReadonlySet<number>): number | null {
    if (!this.inBounds(x, z)) return null;
    let best: number | null = null;
    let lowest: number | null = null;
    let preferred: number | null = null;
    const consider = (h: number) => {
      if (lowest === null || h < lowest) lowest = h;
      if (h <= yHint + STEP_UP && (best === null || h > best)) best = h;
    };
    for (const b of this.plan.buildings) {
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      for (const ri of b.rooms) {
        const r = this.plan.rooms[ri]!;
        if (!pointInPoly(x, z, r.poly)) continue;
        const h = roomFloorAt(r, x, z);
        if (h === null) continue;
        consider(h);
        if (prefer?.has(ri)) preferred = h;
      }
    }
    const gb = this.groundBox;
    for (let i = 0; i < this.plan.ground.length; i++) {
      if (x < gb[i * 4]! || z < gb[i * 4 + 1]! || x > gb[i * 4 + 2]! || z > gb[i * 4 + 3]!) continue;
      const g = this.plan.ground[i]!;
      if (!pointInPoly(x, z, g.poly)) continue;
      if (g.stoop) {
        const t = Math.min(1, Math.max(0, ((x - g.ox) * g.dx + (z - g.oz) * g.dz) / g.k));
        consider(g.h0 + (terrain - g.h0) * t);
      } else consider(g.h0);
    }
    if (preferred !== null && yHint < (lowest ?? Infinity) - 0.6) return preferred;
    if (best === null && lowest === null) {
      // in the wall mass (a breach in the ruin, the reveal of a door): the building's ground floor
      for (const b of this.plan.buildings) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && pointInPoly(x, z, b.ring)) return b.floor;
    }
    return best ?? lowest;
  }

  /** Room (index) whose floor zone holds the point at about height y, or −1. */
  roomAt(x: number, z: number, y: number): number {
    if (!this.inBounds(x, z)) return -1;
    let found = -1;
    let bestDy = Infinity;
    for (const b of this.plan.buildings) {
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      for (const ri of b.rooms) {
        const r = this.plan.rooms[ri]!;
        if (!pointInPoly(x, z, r.poly)) continue;
        const h = roomFloorAt(r, x, z);
        if (h === null) continue;
        const dy = Math.abs(y - h);
        if (dy < 1.2 && dy < bestDy) {
          bestDy = dy;
          found = ri;
        }
      }
    }
    return found;
  }

  /** Block (or reopen) every door of a room, e.g. when it collapses in the fire. */
  setRoomBlocked(room: number, blocked: boolean): void {
    for (const d of this.plan.doors) {
      if (d.a !== room && d.b !== room) continue;
      if (blocked) this.blockedDoors.add(d.index);
      else this.blockedDoors.delete(d.index);
    }
    this.rebuildDynamic();
  }

  setSolids(building: string, walls: Wall[]): void {
    if (walls.length) this.solids.set(building, walls);
    else this.solids.delete(building);
    this.solidList = [...this.solids.values()].flat();
  }

  clearSolids(): void {
    this.solids.clear();
    this.solidList = [];
  }

  clearBlocks(): void {
    this.blockedDoors.clear();
    this.rebuildDynamic();
  }

  get blocked(): ReadonlySet<number> {
    return this.blockedDoors;
  }

  private rebuildDynamic(): void {
    this.dynamic = [];
    for (const i of this.blockedDoors) {
      const d = this.plan.doors[i]!;
      for (const off of [0.05, d.depth - 0.05]) {
        const mx = d.cx + d.nx * off;
        const mz = d.cz + d.nz * off;
        this.dynamic.push({
          ax: mx - d.tx * (d.width / 2 + 0.05),
          az: mz - d.tz * (d.width / 2 + 0.05),
          bx: mx + d.tx * (d.width / 2 + 0.05),
          bz: mz + d.tz * (d.width / 2 + 0.05),
          y0: d.floor - 1,
          y1: d.top + 5,
          kind: 'block',
          building: d.building,
        });
      }
    }
  }
}
