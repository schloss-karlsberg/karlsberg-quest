/** TASK-082: the player slides round standing tour members; held / waiting groups leave a lane on the path. */
import { describe, expect, it } from 'vitest';
import tour from '../content/story/00-tour.story.json';
import route from '../content/routes/p-fuehrung.json';
import { EventBus } from '../src/core/events';
import { Player, type PlayerWorld } from '../src/player/player';
import { laneSlots, LANE_OFFSET, straightBehind } from '../src/systems/walk/group';
import { buildRoute } from '../src/systems/walk/route';
import { WalkRuntime, type WalkBus } from '../src/systems/walk/runtime';
import type { Route, WalkRequest, WalkSlice } from '../src/systems/walk/types';
import { MIN_SLIDE, PLAYER_RADIUS, VISITOR_RADIUS, slideThroughCrowd, type CrowdCircle, type WallResolve } from '../src/world/crowd';

const R = PLAYER_RADIUS + VISITOR_RADIUS;
const person = (x: number, z: number): CrowdCircle => ({ x, y: 0, z, radius: VISITOR_RADIUS });

/** Walk `ticks` steps of (dx, dz) from (x, z) through the crowd; returns every position. */
function walk(start: { x: number; z: number }, dx: number, dz: number, circles: CrowdCircle[], ticks: number, walls?: WallResolve) {
  const out: { x: number; z: number }[] = [];
  let p = { ...start };
  for (let i = 0; i < ticks; i++) {
    const body = { x: p.x + dx, y: 0, z: p.z + dz, radius: PLAYER_RADIUS };
    slideThroughCrowd(body, circles, p, walls);
    p = { x: body.x, z: body.z };
    out.push(p);
  }
  return out;
}

function expectNeverInside(path: { x: number; z: number }[], circles: CrowdCircle[]) {
  for (const p of path) for (const c of circles) expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThan(R - 1e-6);
}

/** Direction changes of the sideways motion (jitter shows as many sign flips). */
function sideFlips(path: { x: number }[]): number {
  let flips = 0;
  let last = 0;
  for (let i = 1; i < path.length; i++) {
    const d = path[i]!.x - path[i - 1]!.x;
    if (Math.abs(d) < 1e-6) continue;
    const s = Math.sign(d);
    if (last && s !== last) flips++;
    last = s;
  }
  return flips;
}

const STEP = 4.5 / 60; // a jog at a 60 Hz fixed step

describe('slideThroughCrowd (TASK-082)', () => {
  it('head-on: walks round the person to one side, never inside, no jitter', () => {
    const c = [person(0, -2)];
    const path = walk({ x: 0, z: 0 }, 0, -STEP, c, 120);
    expectNeverInside(path, c);
    expect(path.at(-1)!.z).toBeLessThan(-2 - R);
    expect(sideFlips(path)).toBeLessThanOrEqual(1);
  });

  it('head-on next to another person: slides to the free side', () => {
    const c = [person(0, -2), person(-0.9, -2.2)];
    const path = walk({ x: 0, z: 0 }, 0, -STEP, c, 120);
    expectNeverInside(path, c);
    expect(Math.max(...path.map((p) => p.x))).toBeGreaterThan(0.3);
    expect(path.at(-1)!.z).toBeLessThan(-2.5);
  });

  it('glancing (5° off): keeps at least MIN_SLIDE of the step while in contact and gets past', () => {
    const a = (5 * Math.PI) / 180;
    const c = [person(0, -2)];
    const path = walk({ x: 0, z: 0 }, Math.sin(a) * STEP, -Math.cos(a) * STEP, c, 120);
    expectNeverInside(path, c);
    for (let i = 1; i < path.length; i++) {
      const moved = Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z);
      expect(moved).toBeGreaterThan(MIN_SLIDE * STEP * 0.98);
    }
    expect(path.at(-1)!.z).toBeLessThan(-2 - R);
    expect(sideFlips(path)).toBe(0);
  });

  it('never tunnels through a person, however long the step', () => {
    const c = [person(0, -2)];
    const body = { x: 0, y: 0, z: -4, radius: PLAYER_RADIUS };
    slideThroughCrowd(body, c, { x: 0, z: 0 });
    expect(body.z).toBeGreaterThan(-2);
    expectNeverInside([body], c);
  });

  it('corner between two people closer than the player is wide: stops still, no jitter', () => {
    const c = [person(-0.5, -2), person(0.5, -2)];
    const path = walk({ x: 0, z: 0 }, 0, -STEP, c, 120);
    expectNeverInside(path, c);
    const end = path.at(-1)!;
    expect(end.z).toBeGreaterThan(-2);
    for (const p of path.slice(-40)) expect(Math.hypot(p.x - end.x, p.z - end.z)).toBeLessThan(1e-6);
  });

  it('a gap wider than the player lets it through', () => {
    const c = [person(-0.7, -2), person(0.7, -2)];
    const path = walk({ x: 0.05, z: 0 }, 0, -STEP, c, 80);
    expectNeverInside(path, c);
    expect(path.at(-1)!.z).toBeLessThan(-3);
  });

  it('person next to a wall: never through the wall or the person; steering away gets round', () => {
    // a wall along x = 1 (the body centre stays at x ≤ 1 − r)
    const walls: WallResolve = (x, z, r) => ({ x: Math.min(x, 1 - r), z });
    const c = [person(0.2, -2)];
    const start = { x: 1 - PLAYER_RADIUS, z: 0 };
    const along = walk(start, 0, -STEP, c, 90, walls);
    expectNeverInside(along, c);
    for (const p of along) expect(p.x).toBeLessThanOrEqual(1 - PLAYER_RADIUS + 1e-9);
    const stuck = along.at(-1)!;
    expect(stuck.z).toBeGreaterThan(-2);
    for (const p of along.slice(-30)) expect(Math.hypot(p.x - stuck.x, p.z - stuck.z)).toBeLessThan(1e-6);
    // steer 30° away from the wall: round the person's free side
    const a = (30 * Math.PI) / 180;
    const away = walk(stuck, -Math.sin(a) * STEP, -Math.cos(a) * STEP, c, 90, walls);
    expectNeverInside(away, c);
    for (const p of away) expect(p.x).toBeLessThanOrEqual(1 - PLAYER_RADIUS + 1e-9);
    expect(away.at(-1)!.z).toBeLessThan(-2 - R);
    expect(sideFlips(away)).toBeLessThanOrEqual(1);
  });

  it('head-on into a person by a wall: rounds the open side, away from the wall', () => {
    const walls: WallResolve = (x, z, r) => ({ x: Math.min(x, 1 - r), z });
    const c = [person(0.2, -2)];
    const path = walk({ x: 0.2, z: 0 }, 0, -STEP, c, 120, walls);
    expectNeverInside(path, c);
    expect(Math.min(...path.map((p) => p.x))).toBeLessThan(-0.3);
    expect(path.at(-1)!.z).toBeLessThan(-2 - R);
    expect(sideFlips(path)).toBeLessThanOrEqual(1);
  });

  it('pushes the start out when a person walked into the body', () => {
    const c = [person(0, -0.3)];
    const body = { x: 0, y: 0, z: 0, radius: PLAYER_RADIUS };
    slideThroughCrowd(body, c, { x: 0, z: 0 });
    expectNeverInside([body], c);
  });
});

describe('player against a standing person (TASK-082)', () => {
  function setup(circles: CrowdCircle[]) {
    const world: PlayerWorld = {
      heightAt: () => 0,
      collide: (x, z) => ({ x, z, hit: false }),
      separate: (x, z, r, from) => {
        const body = { x, y: from.y, z, radius: r };
        slideThroughCrowd(body, circles, from);
        return body;
      },
      bounds: () => ({ x0: -20, z0: -20, x1: 20, z1: 20 }),
      surfaceAt: () => 'meadow',
      coverAt: () => 0,
      canFly: () => false,
    };
    const keys = new Set<string>();
    const input = { isDown: (key: string) => keys.has(key), wasPressed: () => false } as unknown as ConstructorParameters<typeof Player>[1];
    const player = new Player(world, input, new EventBus());
    return { player, keys };
  }

  // the touch stick and a gamepad end up as the same move keys plus the view's yaw: any world angle
  it.each([
    { name: 'keyboard W, a few degrees off', keys: ['forward'], yaw: (3 * Math.PI) / 180 },
    { name: 'stick pushed at an odd angle', keys: ['forward'], yaw: (-11 * Math.PI) / 180 },
    { name: 'diagonal W + D', keys: ['forward', 'right'], yaw: Math.PI / 4 },
  ])('$name: gets past the person in front, never inside', ({ keys: down, yaw }) => {
    const c = [person(0, -3)];
    const { player, keys } = setup(c);
    player.yaw = yaw;
    for (const k of down) keys.add(k);
    for (let i = 0; i < 240; i++) {
      player.update(1 / 60);
      expect(Math.hypot(player.position.x - c[0]!.x, player.position.z - c[0]!.z)).toBeGreaterThan(R - 1e-6);
    }
    expect(player.position.z).toBeLessThan(-3 - R);
  });
});

describe('wait slots beside the path (TASK-082)', () => {
  it('two files on a narrow straight path leave a lane the player fits through', () => {
    for (const n of [6, 14]) {
      const slots = laneSlots(n, straightBehind({ x: 0, z: 0, yaw: 0 }), 7);
      expect(slots).toHaveLength(n);
      for (const s of slots) {
        // the path runs along z through x = 0: every member stands beside it, within a 3 m path
        expect(Math.abs(s.x)).toBeCloseTo(LANE_OFFSET, 6);
        expect(Math.abs(s.x) + VISITOR_RADIUS).toBeLessThan(1.5 + 1e-6);
        // lane: the player walking the centre line clears every member
        expect(Math.abs(s.x) - VISITOR_RADIUS).toBeGreaterThan(PLAYER_RADIUS + 0.4);
        // behind the leader (heading −z), not in front of him
        expect(s.z).toBeGreaterThan(0.5);
      }
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(Math.hypot(slots[i]!.x - slots[j]!.x, slots[i]!.z - slots[j]!.z)).toBeGreaterThanOrEqual(0.6);
      // and the slide agrees: the player walks the lane from behind to the leader untouched
      const circles = slots.map((s) => person(s.x, s.z));
      const path = walk({ x: 0, z: 20 }, 0, -STEP, circles, Math.ceil(19 / STEP));
      expect(path.at(-1)!.z).toBeLessThan(1);
      expect(path.every((p) => p.x === 0)).toBe(true);
    }
  });

  it('follows a bend of the path', () => {
    const rt = buildRoute(route as Route);
    const line = rt.line;
    const s0 = rt.stopS.get('damm')!;
    const pt = { x: 0, z: 0, dirX: 0, dirZ: -1 };
    const slots = laneSlots(14, (d) => ({ ...line.pointAt(s0 - d, pt) }), 3);
    for (const s of slots) {
      const q = line.project(s.x, s.z);
      expect(Math.abs(q.dist - LANE_OFFSET)).toBeLessThan(0.2);
    }
  });

  it('a held group warped onto the dam stands beside the path, the player walks through to the guide', () => {
    const bus = new EventBus();
    const player = { x: 800, z: -840 };
    const slice: WalkSlice = { walkers: [], groups: [] };
    const rt = new WalkRuntime({
      bus: bus as unknown as WalkBus,
      routes: new Map([[route.id, route as Route]]),
      slice: () => slice,
      log: () => {},
      world: { heightAt: () => 300, player: () => player, era: () => 'today', reducedMotion: () => false },
      bodies: () => ({ setPos() {}, face() {}, setSpeed() {}, play() {}, setVisible() {}, dispose() {} }),
    });
    const members = Array.from({ length: 14 }, (_, i) => `extra.m${i}`);
    const req = (r: Record<string, unknown>) => bus.emit('npc:walk', r as never);
    req({ op: 'group', group: 'fuehrung', leader: 'imhoff', members });
    req({ op: 'walk', npc: 'imhoff', route: 'p-fuehrung', to: 'reh', speed: 1.9 });
    req({ op: 'warp', group: 'fuehrung', to: 'reh' });
    // the tour (t10 → t11): hold, walk on with a leash, warp the held group to the dam
    req({ op: 'hold', group: 'fuehrung' });
    req({ op: 'walk', npc: 'imhoff', route: 'p-fuehrung', to: 'weiher', speed: 1.9, wait: { for: 'player', r: 25 } });
    req({ op: 'warp', group: 'fuehrung', to: 'damm' });
    const line = buildRoute(route as Route).line;
    for (const m of members) {
      const n = rt.npcs.get(m)!;
      expect(Math.abs(line.project(n.x, n.z).dist - LANE_OFFSET)).toBeLessThan(0.15);
    }
    // the guide walks on and waits; the members hold beside the path
    player.x = 822.9;
    player.z = -837.6;
    for (let i = 0; i < 60 * 20; i++) rt.update(1 / 60);
    const L = rt.npcs.get('imhoff')!;
    expect(rt.walkers.get('imhoff')!.waiting).toBe(true);
    expect(Math.hypot(L.x - 837, L.z - -839.5)).toBeGreaterThan(8);
    // the player walks the path from behind the held group up to the guide
    const s0 = line.project(player.x, player.z).s;
    const sGuide = line.project(L.x, L.z).s;
    const pt = { x: 0, z: 0, dirX: 0, dirZ: -1 };
    let p = { x: line.pointAt(s0, pt).x, z: pt.z };
    let stuck = 0;
    for (let s = s0; s < sGuide - 3; s += STEP) {
      line.pointAt(s + STEP, pt);
      const body = { x: pt.x, y: 300, z: pt.z, radius: PLAYER_RADIUS };
      slideThroughCrowd(body, rt.tourVisitors(), p);
      if (Math.hypot(body.x - pt.x, body.z - pt.z) > 1e-6) stuck++;
      p = { x: body.x, z: body.z };
    }
    expect(stuck).toBe(0);
    // the playtest spot (2026-11-28, main f8a75ff7: W held 90 s without moving): from there straight
    // at the waiting guide, the player walks clear of the held group
    const spot = { x: 832.8, z: -838.8 };
    const crowd = rt.tourVisitors().map((c) => ({ ...c, y: 0 }));
    let q = { ...spot };
    let ticks = 0;
    for (; ticks < 600 && Math.hypot(L.x - q.x, L.z - q.z) > 3; ticks++) {
      // W held, the view on the guide
      const d = Math.hypot(L.x - q.x, L.z - q.z);
      const body = { x: q.x + ((L.x - q.x) / d) * STEP, y: 0, z: q.z + ((L.z - q.z) / d) * STEP, radius: PLAYER_RADIUS };
      slideThroughCrowd(body, crowd, q);
      expect(Math.hypot(body.x - q.x, body.z - q.z)).toBeGreaterThan(MIN_SLIDE * STEP * 0.98);
      q = { x: body.x, z: body.z };
    }
    expect(Math.hypot(L.x - q.x, L.z - q.z)).toBeLessThanOrEqual(3);
    expect(ticks * STEP).toBeLessThan(20);
  });
});

describe('the car park gathering (F2)', () => {
  it('lets the player cross the group from the playtest approach and exit from inside', () => {
    const player = tour.checkpoint;
    const slice: WalkSlice = { walkers: [], groups: [] };
    const rt = new WalkRuntime({
      bus: new EventBus() as unknown as WalkBus,
      routes: new Map([[route.id, route as Route]]),
      slice: () => slice,
      log: () => {},
      world: { heightAt: () => 0, player: () => player, era: () => 'today', reducedMotion: () => false },
      bodies: () => ({ setPos() {}, face() {}, setSpeed() {}, play() {}, setVisible() {}, dispose() {} }),
    });
    for (const { do: action, ...op } of tour.beats[0]!.enter) {
      if (action === 'npc') rt.request(op as WalkRequest);
    }
    for (let i = 0; i < 60 * 10; i++) rt.update(1 / 60);
    const circles = [...rt.tourVisitors()];
    expect(circles).toHaveLength(15);

    const check = (start: { x: number; z: number }, dx: number, dz: number, distance: number) => {
      const path = walk(start, dx * STEP, dz * STEP, circles, 360);
      expectNeverInside(path, circles);
      const end = path.at(-1)!;
      expect((end.x - start.x) * dx + (end.z - start.z) * dz).toBeGreaterThan(distance);
    };
    const length = Math.hypot(516 - player.x, -762 - player.z);
    check(player, (516 - player.x) / length, (-762 - player.z) / length, length);
    const center = { x: 522, z: -768.9 };
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const dx = Math.cos(a), dz = Math.sin(a);
      check({ x: center.x - dx * 9, z: center.z - dz * 9 }, dx, dz, 17);
      check(center, dx, dz, 8);
    }
  });
});

it.each((route as Route).stops.filter((stop) => stop.slots))('leaves a player-width gap at the authored $id stop', (stop) => {
  const positions = [[stop.x, stop.z], ...stop.slots!];
  for (const [i, [x, z]] of positions.entries()) {
    for (const [ox, oz] of positions.slice(i + 1)) expect(Math.hypot(x - ox, z - oz)).toBeGreaterThan(2 * R + 0.07);
  }
});
