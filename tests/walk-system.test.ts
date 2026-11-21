/** WP-16 tour walk: the walk system's runtime (src/systems/walk/runtime.ts) with fake bodies and a fake bus. */
import { describe, expect, it, vi } from 'vitest';
import route from '../content/routes/p-fuehrung.json';
import { PEOPLE_MISSING, walkBodies, type PeopleApiLike } from '../src/systems/walk/bodies';
import { WalkRuntime, memberLooks, specFor, type Body, type BodyFactory, type BodySpawn, type WalkBus } from '../src/systems/walk/runtime';
import type { Route, WalkRequest, WalkSlice } from '../src/systems/walk/types';

const ROUTE = route as Route;
const DT = 1 / 60;
const MEMBERS_14 = ['double.herzog', 'double.mannlich', 'double.hanne', 'double.peter', 'double.jost', 'double.soll', 'double.liese', 'extra.mats', 'extra.mutter', 'extra.paar_a', 'extra.paar_b', 'extra.wanderin_a', 'extra.wanderin_b', 'extra.student'];
const MEMBERS = ['double.herzog', 'double.mannlich', 'double.hanne', 'extra.mats', 'extra.mutter', 'extra.student'];

class FakeBus implements WalkBus {
  readonly handlers = new Map<string, ((p: never) => void)[]>();
  readonly log: { n: string; p: any }[] = [];
  on(name: string, fn: (p: never) => void): void {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), fn]);
  }
  emit(name: string, payload: unknown): void {
    this.log.push({ n: name, p: payload });
    for (const fn of this.handlers.get(name) ?? []) fn(payload as never);
  }
  of(name: string): any[] {
    return this.log.filter((e) => e.n === name).map((e) => e.p);
  }
}

interface FakeBody extends Body {
  spawn: BodySpawn;
  pos: [number, number, number];
  yaw: number;
  visible: boolean;
  disposed: boolean;
  clips: string[];
}

function setup(slice: WalkSlice = { walkers: [], groups: [] }, factory?: BodyFactory) {
  const bus = new FakeBus();
  const player = { x: 524, z: -765 };
  const world = { era: 'today' };
  const bodies: FakeBody[] = [];
  const rt = new WalkRuntime({
    bus,
    routes: new Map([[ROUTE.id, ROUTE]]),
    slice: () => slice,
    log: () => {},
    world: {
      heightAt: () => 300,
      player: () => player,
      era: () => world.era,
      // one trunk right on the route, 30 m in
      trunksNear: (x, z, r, fn) => {
        if (Math.hypot(x - 512, z - -740) < r + 1) fn(512, -740, 0.5, 20);
      },
    },
    bodies: factory ?? ((o) => {
      const b: FakeBody = {
        spawn: o,
        pos: [o.x, o.y, o.z],
        yaw: o.yaw,
        visible: true,
        disposed: false,
        clips: [],
        setPos(x, y, z) {
          b.pos = [x, y, z];
        },
        face(y) {
          b.yaw = y;
        },
        setSpeed() {},
        play(c) {
          b.clips.push(c);
        },
        setVisible(on) {
          b.visible = on;
        },
        dispose() {
          b.disposed = true;
        },
      };
      bodies.push(b);
      return b;
    }),
  });
  const step = (seconds: number, follow?: (w: { x: number; z: number }) => void) => {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) {
      if (follow) {
        const L = rt.npcs.get('imhoff');
        if (L) follow(L);
      }
      rt.update(DT);
      rt.sync();
    }
    rt.sync();
  };
  const req = (r: WalkRequest) => bus.emit('npc:walk', r);
  return { bus, player, world, bodies, rt, step, req, slice };
}

function demo(s: ReturnType<typeof setup>, to = 'abzweig', wait = true) {
  s.req({ op: 'group', group: 'fuehrung', leader: 'imhoff', members: MEMBERS });
  s.req({ op: 'follow', group: 'fuehrung', leader: 'imhoff' });
  s.req({ op: 'walk', npc: 'imhoff', route: 'p-fuehrung', to, ...(wait ? { wait: { for: 'player', r: 25, bark: 'imhoff.bark.wait' } } : {}) });
}

describe('walk system', () => {
  it('maps npc ids to people specs', () => {
    expect(specFor('imhoff')).toBe('guide');
    expect(specFor('double.herzog')).toBe('double.herzog');
    expect(specFor('extra.3')).toBe('extra.3');
    expect(specFor('extra.mats')).toMatch(/^extra\.[1-7]$/);
    expect(specFor('extra.mats')).toBe(specFor('extra.mats'));
  });

  it('member looks: spec ids pass through, other ids take the free extras in order, then wrap with a new seed', () => {
    const members = ['double.hanne', 'extra.2', 'extra.mats', 'extra.mutter', 'child.compass', 'extra.paar_a', 'extra.paar_b', 'extra.wanderin_a', 'extra.wanderin_b', 'extra.student', 'extra.x'];
    const looks = memberLooks(members, undefined, 'imhoff');
    expect(looks.map((l) => l.spec)).toEqual(['double.hanne', 'extra.2', 'extra.1', 'extra.3', 'child.compass', 'extra.4', 'extra.5', 'extra.6', 'extra.7', 'extra.1', 'extra.2']);
    // no two members share spec and seed
    expect(new Set(looks.map((l) => `${l.spec}|${l.seed}`)).size).toBe(members.length);
    // the wrapped ones differ in seed from the first holder of their spec
    expect(looks[9]!.seed).not.toBe(looks[2]!.seed);
    expect(looks[10]!.seed).not.toBe(looks[1]!.seed);
    // deterministic per group
    expect(memberLooks(members, undefined, 'imhoff')).toEqual(looks);
    // the contract's 14 tour members: 14 different looks, the 7 named extras on extra.1…7
    const tour = memberLooks(MEMBERS_14, undefined, 'imhoff');
    expect(new Set(tour.map((l) => l.spec)).size).toBe(14);
    // the runtime spawns with them, and a restore gives the same looks
    const s = setup();
    s.req({ op: 'group', group: 'fuehrung', leader: 'imhoff', members: MEMBERS_14 });
    const specs = MEMBERS_14.map((m) => s.bodies.find((b) => b.spawn.npc === m)!.spawn.spec);
    expect(specs).toEqual(tour.map((l) => l.spec));
    s.rt.writeSlice();
    const b = setup(JSON.parse(JSON.stringify(s.slice)));
    b.rt.restore();
    expect(MEMBERS_14.map((m) => b.bodies.find((x) => x.spawn.npc === m)!.spawn.spec)).toEqual(specs);
  });

  it('group: a body for the leader (guide, speaker imhoff) and each member in a ring', () => {
    const s = setup();
    s.req({ op: 'group', group: 'fuehrung', leader: 'imhoff', members: MEMBERS });
    expect(s.bodies).toHaveLength(MEMBERS.length + 1);
    const guide = s.bodies.find((b) => b.spawn.npc === 'imhoff')!;
    expect(guide.spawn.spec).toBe('guide');
    expect(guide.spawn.speaker).toBe('imhoff');
    expect(guide.spawn.tier).toBe('hero');
    expect(s.bodies.find((b) => b.spawn.npc === 'double.hanne')!.spawn.tier).toBe('featured');
    expect(s.bodies.find((b) => b.spawn.npc === 'extra.mats')!.spawn.tier).toBe('extra');
    const L = s.rt.npcs.get('imhoff')!;
    for (const m of MEMBERS) {
      const n = s.rt.npcs.get(m)!;
      const d = Math.hypot(n.x - L.x, n.z - L.z);
      expect(d).toBeGreaterThanOrEqual(1.1);
      expect(d).toBeLessThanOrEqual(4.1);
    }
    expect(s.rt.groupList()).toEqual([{ group: 'fuehrung', leader: 'imhoff', at: '', waiting: false }]);
  });

  it('walk + follow: the guide reaches the stop once, the group follows behind him', () => {
    const s = setup();
    demo(s);
    // the player keeps pace beside the guide
    s.step(60, (L) => {
      s.player.x = L.x + 5;
      s.player.z = L.z;
    });
    expect(s.bus.of('npc:arrived')).toEqual([{ npc: 'imhoff', at: 'abzweig', route: 'p-fuehrung', skipped: false }]);
    const L = s.rt.npcs.get('imhoff')!;
    expect(Math.hypot(L.x - 515.2, L.z - -729.9)).toBeLessThan(0.5);
    s.step(5);
    for (const m of MEMBERS) {
      const n = s.rt.npcs.get(m)!;
      expect(Math.hypot(n.x - L.x, n.z - L.z)).toBeLessThan(7);
      // never inside the trunk
      expect(Math.hypot(n.x - 512, n.z - -740)).toBeGreaterThanOrEqual(0.79);
    }
    // bodies stand on the ground and are visible
    const b = s.bodies.find((x) => x.spawn.npc === 'double.peter' || x.spawn.npc === 'double.herzog')!;
    expect(b.pos[1]).toBe(300);
    expect(b.visible).toBe(true);
    expect(b.clips).toContain('walk');
    expect(s.rt.groupList()[0]!.at).toBe('abzweig');
  });

  it('the group keeps up with a fast leader (1.9 m/s pace, catch-up with the player close behind)', () => {
    const s = setup();
    s.req({ op: 'group', group: 'fuehrung', leader: 'imhoff', members: MEMBERS });
    s.req({ op: 'follow', group: 'fuehrung', leader: 'imhoff' });
    s.req({ op: 'walk', npc: 'imhoff', route: 'p-fuehrung', to: 'abzweig', speed: 1.9, wait: { for: 'player', r: 25 } });
    let worst = 0;
    for (let i = 0; i < 60 * 40 && !s.bus.of('npc:arrived').length; i++) {
      // the player 4 m behind the guide: he hurries (2.85 m/s)
      const w = s.rt.walkers.get('imhoff')!;
      s.player.x = w.x + Math.sin(w.yaw) * 4;
      s.player.z = w.z + Math.cos(w.yaw) * 4;
      s.rt.update(DT);
      if (i > 60 * 3) for (const m of MEMBERS) worst = Math.max(worst, Math.hypot(s.rt.npcs.get(m)!.x - w.x, s.rt.npcs.get(m)!.z - w.z));
    }
    expect(s.bus.of('npc:arrived')).toHaveLength(1);
    expect(worst).toBeLessThan(8);
  });

  it('leash: waiting + bark when the player stays behind, resumed when close; no bark in a conversation', () => {
    const s = setup();
    demo(s, 'einstieg');
    s.step(40);
    const waiting = s.bus.of('group:waiting');
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ group: 'fuehrung', leader: 'imhoff' });
    expect(waiting[0].dist).toBeGreaterThanOrEqual(25);
    expect(s.bus.of('walk:bark')).toEqual([{ npc: 'imhoff', id: 'imhoff.bark.wait' }]);
    expect(s.rt.groupList()[0]!.waiting).toBe(true);
    // a conversation is open: the 20 s re-bark stays silent
    s.bus.emit('npc:conversation', { npc: 'hanne', open: true });
    s.step(25);
    expect(s.bus.of('walk:bark')).toHaveLength(1);
    s.bus.emit('npc:conversation', { npc: 'hanne', open: false });
    const L = s.rt.npcs.get('imhoff')!;
    s.player.x = L.x + 3;
    s.player.z = L.z;
    s.step(0.2);
    expect(s.bus.of('group:resumed')).toEqual([{ group: 'fuehrung', leader: 'imhoff' }]);
  });

  it('pauses while the player talks to the guide', () => {
    const s = setup();
    demo(s, 'einstieg', false);
    s.step(3);
    const before = s.rt.walkers.get('imhoff')!.s;
    s.bus.emit('npc:conversation', { npc: 'imhoff', open: true });
    // hands off the guide's body while the npc system turns it to the player
    const gb = s.bodies.find((b) => b.spawn.npc === 'imhoff')!;
    gb.yaw = 42;
    s.step(5);
    expect(gb.yaw).toBe(42);
    expect(s.rt.walkers.get('imhoff')!.s).toBeCloseTo(before, 6);
    expect(s.rt.npcs.get('double.hanne')!.speed).toBe(0);
    s.bus.emit('npc:conversation', { npc: 'imhoff', open: false });
    s.step(2);
    expect(s.rt.walkers.get('imhoff')!.s).toBeGreaterThan(before + 2);
  });

  it('story:cue {id: walk} is bridged to the request handler', () => {
    const s = setup();
    s.bus.emit('story:cue', { id: 'walk', data: { op: 'walk', npc: 'imhoff', route: 'p-fuehrung', to: 'abzweig' } });
    s.bus.emit('story:cue', { id: 'other', data: { op: 'walk', npc: 'x', route: 'p-fuehrung' } });
    expect([...s.rt.walkers.keys()]).toEqual(['imhoff']);
    expect(s.rt.npcs.get('imhoff')!.spec).toBe('guide');
  });

  it('gather: a half circle in front of the guide, facing him; hold freezes; release follows again', () => {
    const s = setup();
    demo(s, 'abzweig', false);
    s.step(50);
    s.req({ op: 'gather', group: 'fuehrung', around: 'imhoff', face: 'imhoff', r: [3, 6] });
    s.step(15);
    const L = s.rt.npcs.get('imhoff')!;
    for (const m of MEMBERS) {
      const n = s.rt.npcs.get(m)!;
      const d = Math.hypot(n.x - L.x, n.z - L.z);
      expect(d).toBeGreaterThan(2.4);
      expect(d).toBeLessThan(7.5);
      // facing the guide (heading convention: atan2(-dx, -dz))
      const want = Math.atan2(-(L.x - n.x), -(L.z - n.z));
      expect(Math.abs(Math.atan2(Math.sin(n.yaw - want), Math.cos(n.yaw - want)))).toBeLessThan(0.35);
    }
    s.req({ op: 'hold', group: 'fuehrung' });
    const held = MEMBERS.map((m) => ({ ...s.rt.npcs.get(m)! }));
    s.req({ op: 'walk', npc: 'imhoff', route: 'p-fuehrung', to: 'einstieg' });
    s.step(5);
    MEMBERS.forEach((m, i) => expect(s.rt.npcs.get(m)!.x).toBeCloseTo(held[i]!.x, 6));
    s.req({ op: 'release', group: 'fuehrung' });
    s.step(1);
    expect(MEMBERS.some((m) => s.rt.npcs.get(m)!.speed > 0)).toBe(true);
  });

  it('despawn disposes the whole group', () => {
    const s = setup();
    demo(s);
    s.req({ op: 'despawn', group: 'fuehrung' });
    expect(s.bodies.every((b) => b.disposed)).toBe(true);
    expect(s.rt.groupList()).toEqual([]);
    expect(s.rt.stats().bodies).toBe(0);
  });

  it('exists only in era today: hidden and paused elsewhere', () => {
    const s = setup();
    demo(s, 'abzweig', false);
    s.step(2);
    const at = s.rt.walkers.get('imhoff')!.s;
    s.world.era = '1789';
    s.step(5);
    expect(s.bodies.every((b) => !b.visible)).toBe(true);
    expect(s.rt.walkers.get('imhoff')!.s).toBe(at);
    s.world.era = 'today';
    s.step(1);
    expect(s.bodies.every((b) => b.visible)).toBe(true);
    expect(s.rt.walkers.get('imhoff')!.s).toBeGreaterThan(at);
  });

  it('teleport > 60 m ahead: the leader snaps to the stop ahead nearest the player (skipped)', () => {
    const s = setup();
    demo(s, 'damm', false);
    s.step(1);
    // the player jumps next to 'felsen' (s ≈ 456)
    s.player.x = 683;
    s.player.z = -598;
    s.bus.emit('player:teleport', { x: 683, z: -598 });
    s.step(DT);
    expect(s.bus.of('npc:arrived')).toEqual([{ npc: 'imhoff', at: 'felsen', route: 'p-fuehrung', skipped: true }]);
    const L = s.rt.npcs.get('imhoff')!;
    expect(Math.hypot(L.x - 682.9, L.z - -596.1)).toBeLessThan(1);
    // the members landed around him, no long run
    for (const m of MEMBERS) expect(Math.hypot(s.rt.npcs.get(m)!.x - L.x, s.rt.npcs.get(m)!.z - L.z)).toBeLessThan(6);
    // the walk goes on to its target
    expect(s.rt.walkers.get('imhoff')!.arrived).toBe(false);
    // a jump without the event (a > 20 m move in one step) works as well
    s.player.x = 837;
    s.player.z = -839;
    s.step(DT);
    expect(s.bus.of('npc:arrived').at(-1)).toEqual({ npc: 'imhoff', at: 'damm', route: 'p-fuehrung', skipped: true });
    expect(s.rt.walkers.get('imhoff')!.arrived).toBe(true);
  });

  it('warp: arrives skipped once, members land in their slots, never backward, may pass the target', () => {
    const s = setup();
    demo(s, 'abzweig', false);
    s.step(60, (L) => {
      s.player.x = L.x + 5;
      s.player.z = L.z;
    });
    expect(s.rt.walkers.get('imhoff')!.arrived).toBe(true);
    s.bus.log.length = 0;
    // beyond the arrived target
    s.req({ op: 'warp', group: 'fuehrung', to: 'einstieg' });
    expect(s.bus.of('npc:arrived')).toEqual([{ npc: 'imhoff', at: 'einstieg', route: 'p-fuehrung', skipped: true }]);
    const w = s.rt.walkers.get('imhoff')!;
    expect(w.to).toBe('einstieg');
    expect(w.arrived).toBe(true);
    const L = s.rt.npcs.get('imhoff')!;
    expect(Math.hypot(L.x - 623.4, L.z - -485.9)).toBeLessThan(1);
    for (const m of MEMBERS) {
      const n = s.rt.npcs.get(m)!;
      expect(Math.hypot(n.x - L.x, n.z - L.z)).toBeLessThan(6);
      expect(n.speed).toBe(0);
    }
    // no catch-up run after the fade
    s.step(0.5);
    expect(MEMBERS.every((m) => s.rt.npcs.get(m)!.speed < 2)).toBe(true);
    // backward: refused, nothing emitted
    s.bus.log.length = 0;
    s.req({ op: 'warp', group: 'fuehrung', to: 'abzweig' });
    expect(s.bus.of('npc:arrived')).toEqual([]);
    expect(Math.hypot(L.x - 623.4, L.z - -485.9)).toBeLessThan(1);
    // short of a live target: the walk continues from the stop
    s.req({ op: 'walk', npc: 'imhoff', route: 'p-fuehrung', to: 'damm' });
    s.req({ op: 'warp', group: 'fuehrung', to: 'felsen' });
    const w2 = s.rt.walkers.get('imhoff')!;
    expect(w2.to).toBe('damm');
    expect(w2.arrived).toBe(false);
    expect(s.bus.of('npc:arrived')).toEqual([{ npc: 'imhoff', at: 'felsen', route: 'p-fuehrung', skipped: true }]);
  });

  it('warp without a live walker uses the given route', () => {
    const s = setup();
    s.req({ op: 'group', group: 'g', leader: 'imhoff', members: ['extra.1'] });
    s.req({ op: 'warp', group: 'g', to: 'quelle', route: 'p-fuehrung' });
    expect(s.bus.of('npc:arrived')).toEqual([{ npc: 'imhoff', at: 'quelle', route: 'p-fuehrung', skipped: true }]);
    expect(s.rt.walkers.get('imhoff')!.arrived).toBe(true);
  });

  it('save slice round trip: walkers, groups and poses come back, no events, no instant bark', () => {
    const a = setup();
    demo(a, 'einstieg');
    a.req({ op: 'gather', group: 'fuehrung', around: 'imhoff', r: [3, 6] });
    // walk 10 s with the player close, then stay behind until the guide waits
    a.step(10, (L) => {
      a.player.x = L.x + 4;
      a.player.z = L.z;
    });
    a.step(30);
    expect(a.rt.walkers.get('imhoff')!.waiting).toBe(true);
    a.rt.writeSlice();
    const saved: WalkSlice = JSON.parse(JSON.stringify(a.slice));
    expect(saved.walkers).toHaveLength(1);
    expect(saved.walkers[0]).toMatchObject({ npc: 'imhoff', route: 'p-fuehrung', to: 'einstieg', waiting: true, wait: { r: 25 } });
    expect(saved.groups[0]).toMatchObject({ group: 'fuehrung', leader: 'imhoff', members: MEMBERS, mode: 'gather', around: 'imhoff', r: [3, 6], route: 'p-fuehrung' });

    const b = setup(saved);
    b.player.x = a.player.x;
    b.player.z = a.player.z;
    b.rt.restore();
    expect(b.bus.log).toEqual([]);
    expect(b.rt.walkers.get('imhoff')!.s).toBeCloseTo(a.rt.walkers.get('imhoff')!.s, 2);
    expect(b.rt.walkers.get('imhoff')!.waiting).toBe(true);
    expect(b.bodies.filter((x) => !x.disposed)).toHaveLength(MEMBERS.length + 1);
    const L = b.rt.npcs.get('imhoff')!;
    for (const m of MEMBERS) expect(Math.hypot(b.rt.npcs.get(m)!.x - L.x, b.rt.npcs.get(m)!.z - L.z)).toBeLessThan(8);
    // still waiting: no instant bark, no waiting event again
    b.step(5);
    expect(b.bus.of('walk:bark')).toEqual([]);
    expect(b.bus.of('group:waiting')).toEqual([]);
    b.step(20);
    expect(b.bus.of('walk:bark')).toHaveLength(1);
    // the slice the restored runtime writes equals the saved one (modulo float rounding of poses)
    b.rt.writeSlice();
    expect(b.slice.walkers).toEqual(saved.walkers);
    expect(b.slice.groups.map((g) => ({ ...g, at: undefined }))).toEqual(saved.groups.map((g) => ({ ...g, at: undefined })));
  });

  it('no people API: no bodies, one loud error, the walk still arrives', () => {
    const report = vi.fn();
    const s = setup(undefined, walkBodies(() => null, report));
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(PEOPLE_MISSING);
    expect(PEOPLE_MISSING).toBe('[walk] people API missing: walk bodies disabled');
    demo(s, 'abzweig', false);
    s.step(60, (L) => {
      s.player.x = L.x + 5;
      s.player.z = L.z;
    });
    expect(s.bus.of('npc:arrived')).toEqual([{ npc: 'imhoff', at: 'abzweig', route: 'p-fuehrung', skipped: false }]);
    expect(s.rt.npcs.size).toBe(MEMBERS.length + 1);
    expect([...s.rt.npcs.values()].every((n) => n.body === null)).toBe(true);
    expect(s.rt.stats().bodies).toBe(0);
    // the save slice keeps working, a restore stays bodiless and silent
    s.rt.writeSlice();
    expect(s.slice.walkers[0]).toMatchObject({ npc: 'imhoff', to: 'abzweig' });
    s.rt.restore();
    expect(s.rt.stats().bodies).toBe(0);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('the default report is console.error', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const f = walkBodies(() => null);
      f({ npc: 'imhoff', spec: 'guide', x: 0, y: 0, z: 0, yaw: 0, tier: 'hero', seed: 1 });
      expect(err).toHaveBeenCalledTimes(1);
      expect(err).toHaveBeenCalledWith(PEOPLE_MISSING);
    } finally {
      err.mockRestore();
    }
  });

  it('with a people API: a person per npc, moved, turned and disposed through it', () => {
    const spawned: { spec: string; opts: any; pos: number[]; face: number[]; disposed: boolean }[] = [];
    const api = {
      specs: () => ['guide', 'double.hanne', 'extra.1', 'extra.2', 'extra.3'],
      spawn: (spec: string, opts: any) => {
        const rec = { spec, opts, pos: [] as number[], face: [] as number[], disposed: false };
        spawned.push(rec);
        return {
          root: { position: { set: (x: number, y: number, z: number) => (rec.pos = [x, y, z]) } },
          face: (v: number) => rec.face.push(v),
          setSpeed: () => {},
          setVisible: () => {},
          dispose: () => (rec.disposed = true),
        };
      },
    } as unknown as PeopleApiLike;
    const report = vi.fn();
    const s = setup(undefined, walkBodies(() => api, report));
    demo(s, 'abzweig', false);
    expect(report).not.toHaveBeenCalled();
    expect(spawned).toHaveLength(MEMBERS.length + 1);
    const guide = spawned.find((p) => p.opts.name === 'imhoff')!;
    expect(guide.spec).toBe('guide');
    expect(guide.opts).toMatchObject({ speaker: 'imhoff', tier: 'hero', look: 'solid' });
    expect(s.rt.stats().bodies).toBe(MEMBERS.length + 1);
    s.step(3);
    expect(guide.pos[1]).toBe(300);
    expect(guide.face.length).toBeGreaterThan(0);
    s.req({ op: 'despawn', group: 'fuehrung' });
    expect(spawned.every((p) => p.disposed)).toBe(true);
  });
});
