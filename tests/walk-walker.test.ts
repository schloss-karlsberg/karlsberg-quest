/** WP-16 tour walk: the walker state machine (src/systems/walk/walker.ts). */
import { describe, expect, it } from 'vitest';
import { buildRoute } from '../src/systems/walk/route';
import type { Route } from '../src/systems/walk/types';
import { BARK_EVERY, CATCH_UP, WALK_SPEED, createWalker, figureYaw, restoreWalker, serializeWalker, snapAhead, stepWalker, type WalkEvent, type Walker } from '../src/systems/walk/walker';
import { yawToward } from '../src/systems/npc/logic';

// straight east, 100 m, a point every 10 m
const ROUTE: Route = {
  id: 'p-test',
  points: Array.from({ length: 11 }, (_, i) => [1000 + i * 10, -1000] as [number, number]),
  stops: [
    { id: 'start', x: 1000, z: -1000 },
    { id: 'eins', x: 1030, z: -1000 },
    { id: 'zwei', x: 1060, z: -1000 },
    { id: 'drei', x: 1100, z: -1000 },
  ],
};
const RT = buildRoute(ROUTE);
const DT = 1 / 60;

/** Run ticks with the player given per tick; collect all events. */
function run(w: Walker, seconds: number, player: (w: Walker, t: number) => { x: number; z: number }, t0 = 0): WalkEvent[] {
  const evs: WalkEvent[] = [];
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * DT;
    evs.push(...stepWalker(w, DT, player(w, t), t));
  }
  return evs;
}
/** A player keeping pace 10 m to the side (never "behind", never far). */
const beside = (w: Walker) => ({ x: w.x, z: w.z + 10 });

describe('walker', () => {
  it('walks to the stop and emits arrived exactly once', () => {
    const w = createWalker({ npc: 'imhoff', route: RT, to: 'zwei' });
    expect(w.targetS).toBeCloseTo(60);
    const evs = run(w, 60, beside);
    const arr = evs.filter((e) => e.type === 'arrived');
    expect(arr).toEqual([{ type: 'arrived', at: 'zwei', skipped: false }]);
    expect(w.s).toBeCloseTo(60);
    expect(w.x).toBeCloseTo(1060);
    expect(w.moving).toBe(false);
    expect(w.speedNow).toBe(0);
    // ~60 m at 1.6 m/s
    const w2 = createWalker({ npc: 'imhoff', route: RT, to: 'zwei' });
    run(w2, 30, beside);
    expect(w2.s).toBeCloseTo(30 * WALK_SPEED, 0);
  });

  it('a raw path arrives at "end"; the heading follows the path', () => {
    const w = createWalker({ npc: 'x', path: [[1000, -1000], [1000, -1010], [1010, -1010]] });
    run(w, 2, beside);
    // walking north (−z): heading 0, the figure turned to face the same way
    expect(w.yaw).toBeCloseTo(0);
    expect(figureYaw(w.yaw)).toBeCloseTo(yawToward(0, 0, 0, -1));
    const evs = run(w, 30, beside);
    expect(evs.filter((e) => e.type === 'arrived')).toEqual([{ type: 'arrived', at: 'end', skipped: false }]);
    // last segment runs east (+x): heading −π/2
    expect(w.yaw).toBeCloseTo(-Math.PI / 2);
  });

  it('the leash waits beyond r and resumes within r − 13, without flapping at the edge', () => {
    const w = createWalker({ npc: 'imhoff', route: RT, to: 'drei', wait: { for: 'player', r: 25 } });
    const evs: WalkEvent[] = [];
    let t = 0;
    const tick = (px: number) => {
      evs.push(...stepWalker(w, DT, { x: px, z: -1000 }, t));
      t += DT;
    };
    // player stands at the start; the guide walks away until 25 m
    for (let i = 0; i < 60 * 30; i++) tick(1000);
    expect(evs.filter((e) => e.type === 'waiting').length).toBe(1);
    expect(w.waiting).toBe(true);
    expect(w.s).toBeGreaterThan(24.9);
    expect(w.s).toBeLessThan(25.1);
    const sWait = w.s;
    // the player jitters around the boundary band (between 12 and 25 m): no resume, no new wait
    for (let i = 0; i < 600; i++) tick(w.x - 13 - (i % 10) * 1.2);
    expect(evs.filter((e) => e.type === 'resumed').length).toBe(0);
    expect(evs.filter((e) => e.type === 'waiting').length).toBe(1);
    expect(w.s).toBe(sWait);
    // facing the player while waiting (player to the west → heading +π/2)
    expect(w.yaw).toBeCloseTo(Math.PI / 2);
    // at 12 m: resume
    tick(w.x - 12);
    expect(evs.filter((e) => e.type === 'resumed').length).toBe(1);
    expect(w.waiting).toBe(false);
    // walking on with the player at 12–24 m: no second wait
    for (let i = 0; i < 600; i++) tick(w.x - 12 - (i % 13));
    expect(evs.filter((e) => e.type === 'waiting').length).toBe(1);
    expect(w.s).toBeGreaterThan(sWait);
  });

  it('honours an explicit resume distance', () => {
    const w = createWalker({ npc: 'g', route: RT, to: 'drei', wait: { for: 'player', r: 20, resume: 18 } });
    run(w, 30, () => ({ x: 1000, z: -1000 }));
    expect(w.waiting).toBe(true);
    const e1 = stepWalker(w, DT, { x: w.x - 18.5, z: -1000 }, 31);
    expect(e1).toEqual([]);
    const e2 = stepWalker(w, DT, { x: w.x - 18, z: -1000 }, 31.1);
    expect(e2).toEqual([{ type: 'resumed' }]);
  });

  it('barks on entering the wait, then at most every 20 s', () => {
    const w = createWalker({ npc: 'imhoff', route: RT, to: 'drei', wait: { for: 'player', r: 25, bark: 'imhoff.bark.wait' } });
    const evs = run(w, 15.6 + 65, () => ({ x: 1000, z: -1000 }));
    const barks = evs.filter((e) => e.type === 'bark');
    expect(barks[0]).toEqual({ type: 'bark', id: 'imhoff.bark.wait' });
    // waiting starts at ~15.6 s (25 m / 1.6 m/s); ~65 s of waiting → barks at 0, 20, 40, 60 s
    expect(barks.length).toBe(4);
    // the first bark comes in the same tick as the waiting event
    const iw = evs.findIndex((e) => e.type === 'waiting');
    expect(evs[iw + 1]?.type).toBe('bark');
    // re-check the spacing with explicit clocks
    const w2 = createWalker({ npc: 'g', route: RT, to: 'drei', wait: { for: 'player', r: 25, bark: 'b' } });
    const far = { x: 1100, z: -900 };
    expect(stepWalker(w2, DT, far, 100).map((e) => e.type)).toEqual(['waiting', 'bark']);
    expect(stepWalker(w2, DT, far, 100 + BARK_EVERY - 0.01)).toEqual([]);
    expect(stepWalker(w2, DT, far, 100 + BARK_EVERY)).toEqual([{ type: 'bark', id: 'b' }]);
  });

  it('hurries (1.5×) when the player is close behind, not when ahead or far', () => {
    const w = createWalker({ npc: 'g', route: RT, to: 'drei', s: 30 });
    stepWalker(w, 1, { x: 1026, z: -1000 }, 0); // 4 m behind
    expect(w.speedNow).toBeCloseTo(WALK_SPEED * CATCH_UP);
    const w2 = createWalker({ npc: 'g', route: RT, to: 'drei', s: 30 });
    stepWalker(w2, 1, { x: 1034, z: -1000 }, 0); // 4 m ahead
    expect(w2.speedNow).toBeCloseTo(WALK_SPEED);
    const w3 = createWalker({ npc: 'g', route: RT, to: 'drei', s: 30 });
    stepWalker(w3, 1, { x: 1020, z: -1000 }, 0); // 10 m behind
    expect(w3.speedNow).toBeCloseTo(WALK_SPEED);
    expect(w.moving && w2.moving && w3.moving).toBe(true);
  });

  it('snapAhead never moves backward and clamps at the target', () => {
    // at s 40, target 'drei' (100): the player at the start → nearest stop ahead is 'zwei', not 'eins'
    const w = createWalker({ npc: 'g', route: RT, to: 'drei', s: 40 });
    const r = snapAhead(w, { x: 1000, z: -1000 });
    expect(r).toEqual({ at: 'zwei', events: [] });
    expect(w.s).toBeCloseTo(60);
    expect(w.arrived).toBe(false);
    // target 'eins' (30) but the player is at 'drei': clamp to 'eins', which counts as a skipped arrival
    const w2 = createWalker({ npc: 'g', route: RT, to: 'eins', s: 10 });
    const r2 = snapAhead(w2, { x: 1100, z: -1000 });
    expect(r2).toEqual({ at: 'eins', events: [{ type: 'arrived', at: 'eins', skipped: true }] });
    expect(w2.s).toBeCloseTo(30);
    expect(w2.arrived).toBe(true);
    // arrival is final: neither a step nor another snap re-emits it
    expect(stepWalker(w2, DT, { x: 0, z: 0 }, 0)).toEqual([]);
    expect(snapAhead(w2, { x: 1100, z: -1000 })).toBeNull();
    // never behind, for any player position
    for (let px = 950; px <= 1150; px += 7) {
      const w3 = createWalker({ npc: 'g', route: RT, to: 'drei', s: 45 });
      snapAhead(w3, { x: px, z: -990 });
      expect(w3.s).toBeGreaterThanOrEqual(45);
      expect(w3.s).toBeLessThanOrEqual(100);
    }
    // a raw path snaps to its end
    const w4 = createWalker({ npc: 'g', path: [[1000, -1000], [1020, -1000]] });
    expect(snapAhead(w4, { x: 0, z: 0 })?.events).toEqual([{ type: 'arrived', at: 'end', skipped: true }]);
  });

  it('serialize / restore round-trips mid-walk', () => {
    const wait = { for: 'player' as const, r: 25, bark: 'imhoff.bark.wait' };
    const w = createWalker({ npc: 'imhoff', route: RT, to: 'drei', speed: 1.4, wait });
    run(w, 30, () => ({ x: 1000, z: -1000 }));
    expect(w.waiting).toBe(true);
    const save = JSON.parse(JSON.stringify(serializeWalker(w)));
    expect(save).toMatchObject({ npc: 'imhoff', route: 'p-test', to: 'drei', waiting: true, speed: 1.4 });
    const r = restoreWalker(save, (id) => (id === ROUTE.id ? ROUTE : undefined))!;
    expect(r).not.toBeNull();
    expect(r.s).toBeCloseTo(w.s, 2);
    expect(r.x).toBeCloseTo(w.x, 2);
    expect(r.waiting).toBe(true);
    expect(r.wait).toEqual(wait);
    expect(r.arrived).toBe(false);
    // both continue identically once the player catches up
    const a = run(w, 80, beside, 100);
    const b = run(r, 80, beside, 100);
    expect(b.map((e) => e.type)).toEqual(a.map((e) => e.type));
    expect(r.s).toBeCloseTo(w.s, 2);
    // a raw path keeps its points; an unknown route gives null
    const p = createWalker({ npc: 'x', path: [[1000, -1000], [1000, -1020]] });
    run(p, 3, beside);
    const rp = restoreWalker(serializeWalker(p), () => undefined)!;
    expect(rp.z).toBeCloseTo(p.z);
    expect(restoreWalker({ npc: 'y', route: 'gone', to: 'a', s: 1, waiting: false }, () => undefined)).toBeNull();
    // saved at the target → restored as arrived, nothing re-emitted
    const done = restoreWalker({ npc: 'y', route: 'p-test', to: 'eins', s: 30, waiting: false }, () => RT)!;
    expect(done.arrived).toBe(true);
    expect(stepWalker(done, DT, { x: 0, z: 0 }, 0)).toEqual([]);
  });

  it('rejects an unknown stop', () => {
    expect(() => createWalker({ npc: 'g', route: RT, to: 'nirgends' })).toThrow(/no stop/);
  });
});
