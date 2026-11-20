/** WP-16 tour walk: polylines, routes and the route/path validator (src/systems/walk/route.ts). */
import { describe, expect, it } from 'vitest';
import { Polyline, buildRoute, checkPath, checkRoute, nearestStopAhead, stopsAhead } from '../src/systems/walk/route';
import type { Route } from '../src/systems/walk/types';

// an L: 20 m east, then 10 m south
const L: [number, number][] = [
  [1000, -1000],
  [1020, -1000],
  [1020, -990],
];

const route = (over: Partial<Route> = {}): Route => ({
  id: 'r',
  points: L,
  stops: [
    { id: 'a', x: 1000, z: -1000 },
    { id: 'b', x: 1015, z: -1001 },
    { id: 'c', x: 1020, z: -990 },
  ],
  ...over,
});

describe('Polyline', () => {
  it('measures cumulative length', () => {
    const p = new Polyline(L);
    expect(p.length).toBeCloseTo(30);
    expect(Array.from(p.cum)).toEqual([0, 20, 30]);
  });

  it('pointAt interpolates, clamps and gives the segment direction', () => {
    const p = new Polyline(L);
    const a = p.pointAt(5);
    expect(a.x).toBeCloseTo(1005);
    expect(a.z).toBeCloseTo(-1000);
    expect(a.dirX).toBeCloseTo(1);
    expect(a.dirZ).toBeCloseTo(0);
    const b = p.pointAt(25);
    expect(b.x).toBeCloseTo(1020);
    expect(b.z).toBeCloseTo(-995);
    expect(b.dirZ).toBeCloseTo(1);
    expect(p.pointAt(-3).x).toBeCloseTo(1000);
    const e = p.pointAt(99);
    expect([e.x, e.z]).toEqual([1020, -990]);
  });

  it('projects onto the nearest segment', () => {
    const p = new Polyline(L);
    const a = p.project(1010, -1004);
    expect(a.s).toBeCloseTo(10);
    expect(a.dist).toBeCloseTo(4);
    const b = p.project(1023, -994);
    expect(b.s).toBeCloseTo(26);
    expect(b.dist).toBeCloseTo(3);
    const c = p.project(990, -1000); // before the start
    expect(c.s).toBe(0);
    expect(c.dist).toBeCloseTo(10);
  });
});

describe('routes', () => {
  it('buildRoute maps stops to s; stopsAhead / nearestStopAhead never look back', () => {
    const rt = buildRoute(route());
    expect(rt.stopS.get('a')).toBeCloseTo(0);
    expect(rt.stopS.get('b')).toBeCloseTo(15);
    expect(rt.stopS.get('c')).toBeCloseTo(30);
    expect(stopsAhead(rt, 10).map((s) => s.id)).toEqual(['b', 'c']);
    expect(stopsAhead(rt, 15).map((s) => s.id)).toEqual(['b', 'c']);
    // the player stands at 'a', but 'a' is behind: the nearest stop ahead is 'b'
    expect(nearestStopAhead(rt, 10, 1000, -1000)?.id).toBe('b');
    expect(nearestStopAhead(rt, 31, 1000, -1000)).toBeNull();
  });

  it('a good route passes', () => {
    expect(checkRoute(route())).toEqual([]);
    expect(checkPath(L)).toEqual([]);
  });

  it('catches each error class', () => {
    const has = (errs: string[], re: RegExp) => expect(errs.some((e) => re.test(e)), errs.join('\n')).toBe(true);
    has(checkRoute(route({ points: [[100, -1000], [110, -1000]], stops: [] })), /outside the extent/);
    has(checkRoute(route({ points: [[1000, 600], [1000, 590]], stops: [] })), /outside the extent/);
    has(checkRoute(route({ points: [[1000, -1000]], stops: [] })), /at least 2 points/);
    has(checkRoute(route({ points: [[1000, -1000], [1040, -1000]], stops: [] })), /40\.0 m apart/);
    has(checkRoute(route({ stops: [{ id: 'a', x: 1010, z: -1005 }] })), /'a' is 5\.0 m from the polyline/);
    has(checkRoute(route({ stops: [{ id: 'a', x: 1000, z: -1000 }, { id: 'a', x: 1020, z: -990 }] })), /duplicate stop id 'a'/);
    has(checkRoute(route({ stops: [{ id: 'c', x: 1020, z: -990 }, { id: 'b', x: 1015, z: -1000 }] })), /'b' .* is not after 'c'/);
    has(checkPath([[1000, -1000]]), /at least 2 points/);
    has(checkPath([[1000, -1000], [1000, -1031]]), /31\.0 m apart/);
    has(checkPath([[1000, -1000], [1000, -2160]]), /outside the extent/);
    has(checkPath([[1000, -1000], [Number.NaN, 0]]), /not a number pair/);
  });

  it('takes a custom extent', () => {
    expect(checkPath(L, { x: [0, 10], z: [0, 10] }).length).toBe(3);
  });
});
