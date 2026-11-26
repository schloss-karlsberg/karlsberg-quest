/** WP-16 tour walk: group layout (src/systems/walk/group.ts). */
import { describe, expect, it } from 'vitest';
import { assignSlots, followSlots, gatherSlots, pushOutOfTrunks, separate, stepMember, type TrunksNear, type XZ } from '../src/systems/walk/group';

function minPairDist(p: XZ[]): number {
  let m = Infinity;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) m = Math.min(m, Math.hypot(p[i]!.x - p[j]!.x, p[i]!.z - p[j]!.z));
  return m;
}

/** A fake forest: trunks on a 3 m grid, radius 0.4, same callback shape as forest.trunksNear. */
const GRID = 3;
const TR = 0.4;
const trunks: TrunksNear = (x, z, r, fn) => {
  for (let gx = Math.floor((x - r - 1) / GRID); gx <= Math.ceil((x + r + 1) / GRID); gx++)
    for (let gz = Math.floor((z - r - 1) / GRID); gz <= Math.ceil((z + r + 1) / GRID); gz++) {
      const tx = gx * GRID;
      const tz = gz * GRID;
      if (Math.abs(tx - x) <= r + TR && Math.abs(tz - z) <= r + TR) fn(tx, tz, TR, 10);
    }
};
const insideTrunk = (p: XZ, body = 0.3) => {
  let hit = false;
  trunks(p.x, p.z, 2, (tx, tz, tr) => {
    if (Math.hypot(p.x - tx, p.z - tz) < tr + body - 1e-6) hit = true;
  });
  return hit;
};

describe('gatherSlots', () => {
  it('14 slots stand ≥ 0.6 m apart, in front of the guide, facing the guide', () => {
    const guide = { x: 1200, z: -1100, yaw: 0.7 };
    const s = gatherSlots(14, guide, undefined, [3, 7]);
    expect(s.length).toBe(14);
    expect(minPairDist(s)).toBeGreaterThanOrEqual(0.6);
    const fx = -Math.sin(guide.yaw);
    const fz = -Math.cos(guide.yaw);
    for (const p of s) {
      const dx = p.x - guide.x;
      const dz = p.z - guide.z;
      const d = Math.hypot(dx, dz);
      expect(d).toBeGreaterThanOrEqual(3 - 1e-9);
      // the front half
      expect(dx * fx + dz * fz).toBeGreaterThan(0);
      // facing the guide: heading toward (guide − slot)
      expect(p.yaw).toBeCloseTo(Math.atan2(-(guide.x - p.x), -(guide.z - p.z)));
    }
    // two rings for 14
    const radii = new Set(s.map((p) => Math.round(Math.hypot(p.x - guide.x, p.z - guide.z) * 10)));
    expect(radii.size).toBe(2);
  });

  it('large groups stay apart too', () => {
    for (const n of [1, 2, 5, 30]) expect(minPairDist(gatherSlots(n, { x: 0, z: 0, yaw: 0 }))).toBeGreaterThanOrEqual(0.6);
  });
});

describe('followSlots', () => {
  it('is deterministic per seed and all slots are behind the leader', () => {
    const leader = { x: 1000, z: -1000, yaw: -1.1 };
    const a = followSlots(14, leader, [1.2, 4], 42);
    const b = followSlots(14, leader, [1.2, 4], 42);
    const c = followSlots(14, leader, [1.2, 4], 43);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    const fx = -Math.sin(leader.yaw);
    const fz = -Math.cos(leader.yaw);
    for (const seed of [1, 2, 3, 42, 99]) {
      const s = followSlots(14, leader, [1.2, 4], seed);
      expect(s.length).toBe(14);
      for (const p of s) expect((p.x - leader.x) * fx + (p.z - leader.z) * fz).toBeLessThan(0);
      expect(minPairDist(s)).toBeGreaterThanOrEqual(0.6 - 1e-6);
    }
    // a small group stays within the given depth (plus jitter)
    for (const p of followSlots(3, leader, [1.2, 4], 7)) expect(Math.hypot(p.x - leader.x, p.z - leader.z)).toBeLessThan(4 + 1.5);
  });
});

describe('separate', () => {
  it('reaches the minimum distance, also for coincident points', () => {
    const pts: XZ[] = [];
    for (let i = 0; i < 16; i++) pts.push({ x: (i % 4) * 0.2, z: Math.floor(i / 4) * 0.2 });
    pts.push({ x: 0, z: 0 }); // a duplicate
    separate(pts, 0.6, 50);
    expect(minPairDist(pts)).toBeGreaterThanOrEqual(0.6);
  });
});

describe('pushOutOfTrunks', () => {
  it('leaves no member inside a trunk', () => {
    let pushed = 0;
    for (let x = -3; x <= 3; x += 0.13)
      for (let z = -3; z <= 3; z += 0.17) {
        const p = { x, z };
        if (pushOutOfTrunks(p, trunks)) pushed++;
        expect(insideTrunk(p)).toBe(false);
      }
    expect(pushed).toBeGreaterThan(0);
    const exact = { x: 3, z: 3 }; // dead centre of a trunk
    pushOutOfTrunks(exact, trunks);
    expect(insideTrunk(exact)).toBe(false);
  });
});

describe('assignSlots', () => {
  it('greedy nearest first, then stable', () => {
    const slots = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }];
    const members = [{ x: 19, z: 1 }, { x: 1, z: 0 }, { x: 9, z: 0 }];
    const a = assignSlots(members, slots);
    expect(a).toEqual([2, 0, 1]);
    // the slots move (the leader turned): the assignment is kept
    const moved = [{ x: 20, z: 0 }, { x: 10, z: 0 }, { x: 0, z: 0 }];
    expect(assignSlots(members, moved, a)).toEqual(a);
    // an invalid previous assignment is recomputed
    expect(assignSlots(members, slots, [0, 0, 1])).toEqual([2, 0, 1]);
  });
});

describe('stepMember', () => {
  it('walks, runs beyond 8 m, teleports beyond 60 m', () => {
    const p = { x: 0, z: 0 };
    expect(stepMember(p, { x: 5, z: 0 }, 0.5)).toBeCloseTo(1.6);
    expect(p.x).toBeCloseTo(0.8);
    const q = { x: 0, z: 0 };
    expect(stepMember(q, { x: 20, z: 0 }, 0.5)).toBeCloseTo(2.4);
    const r = { x: 0, z: 0 };
    expect(stepMember(r, { x: 70, z: 0 }, 0.5)).toBe(0);
    expect(r).toEqual({ x: 70, z: 0 });
    const s = { x: 0, z: 0 };
    expect(stepMember(s, { x: 0.02, z: 0 }, 0.5)).toBe(0);
    // no overshoot
    const u = { x: 0, z: 0 };
    stepMember(u, { x: 0.3, z: 0 }, 1);
    expect(u.x).toBeCloseTo(0.3);
  });

  it('a 16-member group keeps up within its trunk search budget over 1,000 ticks', () => {
    const n = 16;
    const ticks = 1000;
    let searches = 0;
    const countTrunks: TrunksNear = (...args) => {
      searches++;
      trunks(...args);
    };
    const members: XZ[] = Array.from({ length: n }, (_, i) => ({ x: 1000 + (i % 4), z: -1000 + Math.floor(i / 4) }));
    let assign: number[] | undefined;
    const leader = { x: 1000, z: -1000, yaw: 0 };
    for (let tick = 0; tick < ticks; tick++) {
      leader.z -= 1.6 / 60;
      const slots = followSlots(n, leader, [1.2, 4], 7);
      assign = assignSlots(members, slots, assign);
      for (let i = 0; i < n; i++) {
        stepMember(members[i]!, slots[assign[i]!]!, 1 / 60);
        pushOutOfTrunks(members[i]!, countTrunks);
      }
      separate(members, 0.6, 2);
    }
    expect(searches).toBeGreaterThanOrEqual(n * ticks);
    expect(searches).toBeLessThanOrEqual(2 * n * ticks);
    // they kept up with the leader
    for (const m of members) expect(Math.hypot(m.x - leader.x, m.z - leader.z)).toBeLessThan(12);
  });
});
