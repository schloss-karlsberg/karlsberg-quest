/**
 * Group layout for the tour group (pure): slots behind a walking leader, a gathering arc in front
 * of the guide at a stop, separation, trunk push-out, stable slot assignment and one member step.
 * Headings use the walker convention (`yaw = atan2(-dx, -dz)`, 0 = facing −z).
 */

export interface XZ { x: number; z: number }
export interface Slot { x: number; z: number; yaw: number }

/** forest.trunksNear (src/world/forest.ts): fn(trunkX, trunkZ, trunkRadius, topY) per trunk within r. */
export type TrunksNear = (x: number, z: number, r: number, fn: (tx: number, tz: number, tr: number, top: number) => void) => void;

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LATERAL = 1.4;
const MIN_ROW = 1.2;
const JITTER = 0.4;
/** Minimum distance of a follow slot behind the leader (along the heading) after separation. */
const MIN_BEHIND = 0.5;

/**
 * A staggered loose cluster behind the leader: rows of 3 and 2 alternating, the first row
 * `spacing[0]` behind, rows spread so small groups stay within `spacing[1]` (rows never closer
 * than 1.2 m), seeded jitter ±0.4 m. Slots face the leader's heading. Deterministic per seed.
 */
export function followSlots(n: number, leader: { x: number; z: number; yaw: number }, spacing: [number, number] = [1.2, 4], seed = 1): Slot[] {
  const rand = rng(seed);
  const fx = -Math.sin(leader.yaw);
  const fz = -Math.cos(leader.yaw);
  // right-hand vector (forward rotated): x east, z south → right of a −z heading is +x
  const rx = -fz;
  const rz = fx;
  const rows: number[] = [];
  for (let left = n, k = 0; left > 0; k++) {
    const c = Math.min(left, k % 2 === 0 ? 3 : 2);
    rows.push(c);
    left -= c;
  }
  const pitch = Math.max(MIN_ROW, rows.length > 1 ? (spacing[1] - spacing[0]) / (rows.length - 1) : 0);
  const local: { a: number; l: number }[] = [];
  rows.forEach((c, k) => {
    for (let j = 0; j < c; j++) {
      const lat = (j - (c - 1) / 2) * LATERAL;
      const along = spacing[0] + k * pitch;
      local.push({ a: along + (rand() * 2 - 1) * JITTER, l: lat + (rand() * 2 - 1) * JITTER });
    }
  });
  // separate in the leader's frame so "behind" can be kept
  const pts = local.map((p) => ({ x: p.l, z: p.a }));
  separate(pts, 0.6, 12);
  return pts.map((p) => {
    const a = Math.max(MIN_BEHIND, p.z);
    return { x: leader.x - fx * a + rx * p.x, z: leader.z - fz * a + rz * p.x, yaw: leader.yaw };
  });
}

/** Slot pitch along a gathering arc and the gap between rings. */
const ARC_PITCH = 1.1;
const RING_GAP = 1.3;
/** Half-angle of the gathering arc (a little less than a half circle). */
const ARC_HALF = (80 * Math.PI) / 180;

/**
 * A half circle in front of the guide: `center` is the guide (its heading picks the side), the
 * members stand in arcs of radius r[0], r[0] + 1.3, … and face `face` (default the guide).
 * Slot pitch ≥ 1.1 m, so slots are ≥ 0.6 m apart; outer rings take the rest when n is large.
 */
export function gatherSlots(n: number, center: { x: number; z: number; yaw: number }, face?: XZ, r: [number, number] = [3, 7]): Slot[] {
  const out: Slot[] = [];
  const f = face ?? center;
  const base = center.yaw;
  let left = n;
  for (let ring = 0; left > 0; ring++) {
    const R = r[0] + ring * RING_GAP;
    const cap = Math.max(1, Math.floor((2 * ARC_HALF * R) / ARC_PITCH) + 1);
    const c = Math.min(left, cap);
    for (let j = 0; j < c; j++) {
      const t = c === 1 ? 0 : -ARC_HALF + (2 * ARC_HALF * j) / (c - 1);
      const h = base + t;
      const x = center.x - Math.sin(h) * R;
      const z = center.z - Math.cos(h) * R;
      const dx = f.x - x;
      const dz = f.z - z;
      out.push({ x, z, yaw: Math.hypot(dx, dz) > 1e-6 ? Math.atan2(-dx, -dz) : h + Math.PI });
    }
    left -= c;
  }
  return out;
}

/**
 * Push points apart until every pair is ≥ minDist (in place; each pair moves half the overlap each
 * way). Stops early when no pair overlaps. Coincident points are split along a fixed per-index
 * direction, so the result is deterministic. Returns the points.
 */
export function separate<T extends XZ>(positions: T[], minDist = 0.6, iterations = 8): T[] {
  const n = positions.length;
  const md2 = minDist * minDist;
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      const a = positions[i]!;
      for (let j = i + 1; j < n; j++) {
        const b = positions[j]!;
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= md2) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-6) {
          const ang = (i * 7 + j * 13) * 0.61803;
          dx = Math.cos(ang);
          dz = Math.sin(ang);
          d = 1;
          const push = minDist / 2 + 1e-4;
          a.x -= dx * push;
          a.z -= dz * push;
          b.x += dx * push;
          b.z += dz * push;
        } else {
          // a hair over half each, so float rounding never leaves a pair just short
          const push = (minDist - d) / 2 + 1e-4;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          b.x += (dx / d) * push;
          b.z += (dz / d) * push;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return positions;
}

/** Body radius used for the trunk push-out. */
export const BODY_R = 0.3;

/**
 * Move p out of every trunk it overlaps (trunk radius + body radius), in place. `trunksNear` is
 * forest.trunksNear (bound). Returns true when p moved.
 */
export function pushOutOfTrunks(p: XZ, trunksNear: TrunksNear, bodyR = BODY_R): boolean {
  let moved = false;
  // two passes: a push out of one trunk can land in a neighbour
  for (let pass = 0; pass < 2; pass++) {
    let any = false;
    trunksNear(p.x, p.z, bodyR + 1, (tx, tz, tr) => {
      const min = tr + bodyR;
      let dx = p.x - tx;
      let dz = p.z - tz;
      const d = Math.hypot(dx, dz);
      if (d >= min) return;
      if (d < 1e-6) {
        dx = 1;
        dz = 0;
      } else {
        dx /= d;
        dz /= d;
      }
      p.x = tx + dx * (min + 1e-3);
      p.z = tz + dz * (min + 1e-3);
      any = true;
    });
    if (!any) break;
    moved = true;
  }
  return moved;
}

/**
 * Member → slot index. With a valid previous assignment of the same size, it is kept (members
 * don't swap slots every tick as the slots rotate with the leader); otherwise each member in order
 * takes the nearest free slot (greedy).
 */
export function assignSlots(members: readonly XZ[], slots: readonly XZ[], prev?: readonly number[]): number[] {
  const n = members.length;
  if (prev && prev.length === n && slots.length >= n) {
    const seen = new Set<number>();
    let ok = true;
    for (const k of prev) {
      if (!Number.isInteger(k) || k < 0 || k >= slots.length || seen.has(k)) {
        ok = false;
        break;
      }
      seen.add(k);
    }
    if (ok) return prev.slice();
  }
  const free = new Set<number>(slots.map((_, i) => i));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const m = members[i]!;
    let best = -1;
    let bestD = Infinity;
    for (const k of free) {
      const d = (slots[k]!.x - m.x) ** 2 + (slots[k]!.z - m.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best >= 0) free.delete(best);
    out.push(best);
  }
  return out;
}

export interface MemberSpeeds {
  walk: number;
  catchUp: number;
  /** Run (catch-up speed) beyond this distance from the slot. */
  runDist?: number;
  /** Teleport to the slot beyond this distance (out of sight). */
  teleportDist?: number;
}

export const MEMBER_SPEEDS: MemberSpeeds = { walk: 1.6, catchUp: 2.4, runDist: 8, teleportDist: 60 };

/**
 * Move a member toward its slot (in place): walk, run when > 8 m away, teleport when > 60 m.
 * Returns the speed for the animation (m/s; 0 when standing or teleported).
 */
export function stepMember(pos: XZ, slot: XZ, dt: number, speeds: MemberSpeeds = MEMBER_SPEEDS): number {
  const dx = slot.x - pos.x;
  const dz = slot.z - pos.z;
  const d = Math.hypot(dx, dz);
  if (d > (speeds.teleportDist ?? 60)) {
    pos.x = slot.x;
    pos.z = slot.z;
    return 0;
  }
  if (d < 0.05 || dt <= 0) return 0;
  const v = d > (speeds.runDist ?? 8) ? speeds.catchUp : speeds.walk;
  const step = Math.min(d, v * dt);
  pos.x += (dx / d) * step;
  pos.z += (dz / d) * step;
  return step / dt;
}
