/** Tour C5: the animal system's runtime (src/systems/animals/runtime.ts) with a fake fauna, bus and world. */
import { describe, expect, it } from 'vitest';
import tour from '../content/story/00-tour.story.json';
import type { Stance } from '../src/player/stance';
import type { Animal, AnimalSpawnOpts } from '../src/systems/fauna/types';
import { createCinematicBridge, createPhotoBridge, type PhotoTargetHooks } from '../src/systems/animals/photoBridge';
import { AnimalsRuntime, type AnimalsBus, type PersonLike } from '../src/systems/animals/runtime';
import type { AnimalAction, AnimalSave } from '../src/systems/animals/types';
import type { StoryFile } from '../src/systems/story/types';
import { DOG_RADIUS, PLAYER_RADIUS, VISITOR_RADIUS, type CrowdCircle } from '../src/world/crowd';

const DT = 1 / 60;

class FakeBus implements AnimalsBus {
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
  animalEvents(): { n: string; p: any }[] {
    return this.log.filter((e) => e.n.startsWith('animal:') && e.n !== 'animal:request');
  }
}

interface FakeAnimal extends Animal {
  opts: AnimalSpawnOpts;
  visible: boolean;
  disposed: boolean;
  clips: string[];
  speeds: number[];
  yaws: number[];
  shine: number[];
}

function fakeFauna() {
  const spawned: FakeAnimal[] = [];
  let n = 0;
  const fauna = {
    spawn(specId: string, o: AnimalSpawnOpts): Animal {
      const pos = { x: o.x, y: o.y ?? 0, z: o.z, set(x: number, y: number, z: number) { pos.x = x; pos.y = y; pos.z = z; } };
      const a: FakeAnimal = {
        id: `a${++n}`,
        specId,
        opts: o,
        root: { position: pos } as unknown as Animal['root'],
        info: { specId, length: 1, height: 0.75, radius: 0.3, headHeight: 0.95, speeds: { walk: 1.2, run: 8 }, clips: ['idle'] },
        ready: Promise.resolve(true),
        visible: true,
        disposed: false,
        clips: [],
        speeds: [],
        yaws: [],
        shine: [],
        setSpeed: (v) => a.speeds.push(v),
        play: (c) => a.clips.push(c),
        face: (y) => a.yaws.push(y),
        lookAt: () => {},
        headWorld: (out) => {
          out.x = pos.x;
          out.y = pos.y + 0.95;
          out.z = pos.z;
        },
        setEyeShine: (k) => a.shine.push(k),
        setVisible: (v) => (a.visible = v),
        dispose: () => (a.disposed = true),
      };
      spawned.push(a);
      return a;
    },
  };
  return { fauna, spawned };
}

function setup(opts: { save?: AnimalSave; photoMods?: Record<string, unknown>; people?: PersonLike[]; npcs?: { npc: string; x: number; z: number }[]; visitors?: CrowdCircle[] } = {}) {
  const bus = new FakeBus();
  const { fauna, spawned } = fakeFauna();
  const player = { x: 0, z: 40, speed: 0, stance: 'stand' as Stance };
  const world = { era: 'today', los: true };
  let slice: AnimalSave | undefined = opts.save;
  const photoTargets = new Map<string, PhotoTargetHooks>();
  const rt = new AnimalsRuntime({
    bus,
    fauna: () => fauna,
    load: () => slice,
    save: (s) => {
      slice = s;
    },
    log: () => {},
    photo: createPhotoBridge(opts.photoMods ?? {}),
    cinematic: createCinematicBridge({}),
    world: {
      heightAt: () => 300,
      era: () => world.era,
      player: () => player,
      los: () => world.los,
      people: () => opts.people ?? [],
      npcs: () => opts.npcs ?? [],
      tourVisitors: () => opts.visitors ?? [],
    },
  });
  const step = (seconds: number, each?: () => void) => {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) {
      each?.();
      rt.update(DT);
      rt.sync();
    }
  };
  return { bus, rt, spawned, player, world, step, slice: () => slice, photoTargets };
}

const RICKE: AnimalAction = { do: 'animal', op: 'spawn', kind: 'reh', look: 'ricke', id: 'ricke', x: 0, z: 0, yaw: 0, era: 'today', shy: { notice: 30, flee: 20, settle: 25 } };
const KITZ: AnimalAction = { do: 'animal', op: 'spawn', kind: 'reh', look: 'kitz', id: 'kitz', follow: 'animal:ricke', spacing: 1.5, era: 'today' };

describe('animals runtime (C5)', () => {
  it('pushes a tour dog clear of a visitor before syncing the body', () => {
    const visitors: CrowdCircle[] = [];
    const { rt, step, spawned, player } = setup({ npcs: [{ npc: 'double.jost', x: 0, z: 0 }], visitors });
    rt.request({ do: 'animal', op: 'spawn', kind: 'hund', look: 'diane', id: 'diane', follow: 'npc:double.jost' });
    const dog = rt.dogs[0]!;
    const visitor = { x: dog.x, y: 300, z: dog.z, radius: 0.32 };
    visitors.push(visitor);
    step(DT);
    const p = spawned[0]!.root.position;
    expect(Math.hypot(p.x - visitor.x, p.z - visitor.z)).toBeGreaterThanOrEqual(0.58);
    Object.assign(player, { x: p.x, z: p.z });
    step(DT);
    expect(Math.hypot(p.x - player.x, p.z - player.z)).toBeGreaterThanOrEqual(0.61);
    expect(rt.tourDogs()[0]).toMatchObject({ x: p.x, z: p.z });
  });

  it('returns both Wind dogs before the timeout when the player and a visitor occupy waypoints', () => {
    const visitors = Array.from({ length: 15 }, (_, i) => ({ x: 674 - (i % 5), y: 300, z: -632 + Math.floor(i / 5), radius: VISITOR_RADIUS }));
    const visitor = { x: 701.15, y: 300, z: -642, radius: VISITOR_RADIUS };
    visitors[14] = visitor;
    const { bus, rt, step, player } = setup({ npcs: [{ npc: 'double.jost', x: 674, z: -635 }], visitors });
    Object.assign(player, { x: 700, z: -640 });
    const wind = (tour as StoryFile).beats.find((beat) => beat.id === 't8')!;
    for (const id of ['diane', 'bijou'] as const) {
      rt.request({ do: 'animal', op: 'spawn', kind: 'hund', look: id, id, follow: 'npc:double.jost' });
      const run = wind.enter!.find((action) => action.do === 'animal' && action.op === 'run' && action.id === id);
      rt.request(run as AnimalAction);
      if (id === 'diane') step(0.4);
    }
    step(28, () => {
      for (const dog of rt.dogs) {
        expect(Math.hypot(dog.x - player.x, dog.z - player.z)).toBeGreaterThanOrEqual(DOG_RADIUS + PLAYER_RADIUS);
        expect(Math.hypot(dog.x - visitor.x, dog.z - visitor.z)).toBeGreaterThanOrEqual(DOG_RADIUS + visitor.radius);
      }
    });
    expect(bus.of('animal:returned').map(({ id }) => id).sort()).toEqual(['bijou', 'diane']);
  });

  it('an animal:request spawns bodies through the fauna API (spec ids, ground y, the fawn at the doe)', () => {
    const { bus, rt, spawned } = setup();
    bus.emit('animal:request', RICKE);
    bus.emit('animal:request', KITZ);
    bus.emit('story:cue', { id: 'animal', data: { op: 'spawn', kind: 'hund', look: 'bijou', id: 'bijou', x: 5, z: 5 } });
    expect(spawned.map((a) => a.specId)).toEqual(['reh.ricke', 'reh.kitz', 'dog.bijou']);
    expect(spawned[0]!.opts).toMatchObject({ x: 0, z: 0, y: 300, name: 'ricke' });
    expect(Math.hypot(spawned[1]!.opts.x, spawned[1]!.opts.z)).toBeLessThanOrEqual(2);
    expect(rt.list().map((r) => [r.id, r.kind])).toEqual([['ricke', 'reh'], ['kitz', 'reh'], ['bijou', 'hund']]);
    // keepAlive from the request reaches the body; a bad request spawns nothing
    bus.emit('animal:request', { op: 'spawn', kind: 'hund', look: 'diane', id: 'diane', x: 1, z: 1, keepAlive: true });
    expect(spawned[3]!.opts.keepAlive).toBe(true);
    bus.emit('animal:request', { op: 'spawn', id: 'x' });
    expect(spawned).toHaveLength(4);
    // despawn disposes
    bus.emit('animal:request', { op: 'despawn', id: 'bijou' });
    expect(spawned[2]!.disposed).toBe(true);
    expect(rt.list()).toHaveLength(3);
  });

  it('maps the core events 1:1 onto the bus and drives the bodies (clip only on change)', () => {
    const { bus, step, player, spawned } = setup();
    bus.emit('animal:request', RICKE);
    bus.emit('animal:request', KITZ);
    // walk upright straight at the deer at 3.2 m/s
    player.speed = 3.2;
    step(20, () => {
      if (player.z > 3) player.z -= 3.2 * DT;
    });
    const names = bus.animalEvents().map((e) => `${e.n}:${e.p.id}`);
    expect(names.slice(0, 4)).toEqual(['animal:alert:ricke', 'animal:alert:kitz', 'animal:fled:ricke', 'animal:fled:kitz']);
    expect(names).toContain('animal:settled:ricke');
    const fled = bus.of('animal:fled')[0];
    expect(fled).toEqual({ id: 'ricke', by: 'player', dist: expect.any(Number) });
    expect(fled.type).toBeUndefined();
    const doe = spawned[0]!;
    expect(doe.clips.slice(0, 3)).toEqual(['graze', 'alert', 'run']);
    // no clip repeated back to back
    for (let i = 1; i < doe.clips.length; i++) expect(doe.clips[i]).not.toBe(doe.clips[i - 1]);
    expect(Math.max(...doe.speeds)).toBe(8);
    expect(doe.root.position.y).toBe(300);
  });

  it('routes bark cues of a bolt to one-shots and reports animal:returned per dog', () => {
    const { bus, step, spawned, player } = setup();
    player.z = 0;
    bus.emit('animal:request', { op: 'spawn', kind: 'hund', look: 'diane', id: 'diane', follow: 'player' });
    bus.emit('animal:request', { op: 'spawn', kind: 'hund', look: 'bijou', id: 'bijou', follow: 'player' });
    step(3);
    bus.emit('animal:request', { op: 'run', id: 'diane', path: [[0, 0], [20, -30], [0, 0]], bark: true, back: true });
    bus.emit('animal:request', { op: 'run', id: 'bijou', path: [[1, 0], [15, -30], [1, 0]], bark: true, back: true });
    expect(spawned[0]!.clips).toContain('bark');
    step(30);
    expect(bus.of('animal:returned')).toEqual(expect.arrayContaining([{ id: 'diane' }, { id: 'bijou' }]));
    expect(bus.of('animal:returned')).toHaveLength(2);
    expect(spawned[1]!.clips.filter((c) => c === 'bark').length).toBeGreaterThanOrEqual(2);
  });

  it('era: hidden and paused outside today, back where they were in today', () => {
    const { bus, rt, step, spawned, world, player } = setup();
    bus.emit('animal:request', RICKE);
    world.era = '1789';
    player.z = 10;
    player.speed = 6;
    step(5);
    expect(rt.paused).toBe(true);
    expect(spawned[0]!.visible).toBe(false);
    expect(bus.animalEvents()).toEqual([]);
    expect(rt.list()[0]).toMatchObject({ x: 0, z: 0, state: 'graze' });
    expect(rt.centreOf('ricke')).toBeNull();
    world.era = 'today';
    player.speed = 0;
    player.z = 60;
    step(0.1);
    expect(rt.paused).toBe(false);
    expect(spawned[0]!.visible).toBe(true);
  });

  it('save / restore re-spawns the bodies in their states without events', () => {
    const a = setup();
    a.bus.emit('animal:request', RICKE);
    a.bus.emit('animal:request', KITZ);
    a.bus.emit('animal:request', { op: 'spawn', kind: 'hund', look: 'diane', id: 'diane', x: 3, z: 3 });
    a.rt.startle('ricke');
    a.step(0.5);
    const saved = a.slice()!;
    expect(saved.deer.map((d) => d.state)).toEqual(['flee', 'flee']);
    expect(saved.dogs).toHaveLength(1);
    const b = setup({ save: JSON.parse(JSON.stringify(saved)) });
    b.rt.restore();
    expect(b.spawned.map((s) => s.specId)).toEqual(['reh.ricke', 'reh.kitz', 'dog.diane']);
    expect(b.rt.list().map((r) => r.state)).toEqual(['flee', 'flee', 'idle']);
    expect(b.bus.animalEvents()).toEqual([]);
    // a second restore (save:loaded) disposes the old bodies first
    b.bus.emit('save:loaded', { slot: 'auto' });
    expect(b.spawned.slice(0, 3).every((s) => s.disposed)).toBe(true);
    expect(b.spawned).toHaveLength(6);
    expect(b.bus.animalEvents()).toEqual([]);
  });

  it("a dog's leader 'npc:double.jost' resolves through the people API (specId + root)", () => {
    const jost = { specId: 'double.jost', root: { position: { x: 50, z: 50 }, rotation: { y: 0 } } };
    const other = { specId: 'double.hanne', root: { position: { x: -50, z: -50 }, rotation: { y: 0 } } };
    const { bus, step, rt } = setup({ people: [other, jost] });
    bus.emit('animal:request', { op: 'spawn', kind: 'hund', look: 'diane', id: 'diane', x: 40, z: 40, follow: 'npc:double.jost' });
    step(1);
    jost.root.position.z -= 5; // Jost walks north
    step(6, () => {
      jost.root.position.z -= 1.2 * DT;
    });
    const d = rt.list()[0]!;
    expect(Math.hypot(d.x - jost.root.position.x, d.z - jost.root.position.z)).toBeLessThan(3);
    expect(rt.state('diane')!['state']).toMatch(/follow|sit/);
    // an npc-system leader, and an unknown one: the dog idles where it is
    const n = setup({ npcs: [{ npc: 'jost', x: 10, z: 10 }] });
    n.bus.emit('animal:request', { op: 'spawn', kind: 'hund', look: 'bijou', id: 'bijou', x: 0, z: 0, follow: 'npc:jost' });
    n.step(5);
    expect(Math.hypot(n.rt.list()[0]!.x - 10, n.rt.list()[0]!.z - 10)).toBeLessThan(3);
    const u = setup();
    u.bus.emit('animal:request', { op: 'spawn', kind: 'hund', look: 'bijou', id: 'bijou', x: 0, z: 0, follow: 'npc:nobody' });
    u.step(2);
    expect(u.rt.list()[0]).toMatchObject({ x: 0, z: 0, state: 'idle' });
  });

  it('photo bridge: dormant without the photo module; active, the deer calm is false only while fleeing', () => {
    const dormant = createPhotoBridge({});
    expect(dormant.active).toBe(false);
    expect(typeof dormant.attach('x', { at: () => null })).toBe('function');

    const attached = new Map<string, PhotoTargetHooks>();
    let undone = 0;
    const mods = {
      '../photo/index.ts': {
        attachTarget: (id: string, t: PhotoTargetHooks) => {
          attached.set(id, t);
          return () => undone++;
        },
      },
    };
    const { bus, rt, step, player } = setup({ photoMods: mods });
    expect(rt.stats().photo).toBe('active');
    bus.emit('animal:request', RICKE);
    bus.emit('animal:request', KITZ);
    expect([...attached.keys()]).toEqual(['reh.ricke', 'reh.kitz']);
    const doe = attached.get('reh.ricke')!;
    expect(doe.state!()).toBe('graze');
    expect(doe.calm!()).toBe(true);
    expect(doe.at!()).toEqual({ x: 0, y: 300 + 0.75 * 0.7, z: 0 });
    // walk at them: alert is still calm (a valid photo), flee is not
    player.speed = 3.2;
    const seen: [string, boolean][] = [];
    step(14, () => {
      if (player.z > 3) player.z -= 3.2 * DT;
      const s = doe.state!();
      if (!seen.length || seen[seen.length - 1]![0] !== s) seen.push([s, doe.calm!()]);
    });
    expect(seen).toEqual(expect.arrayContaining([['graze', true], ['alert', true], ['flee', false], ['settled', true]]));
    for (const [s, c] of seen) expect(c).toBe(s !== 'flee');
    bus.emit('animal:request', { op: 'despawn', id: 'kitz' });
    expect(undone).toBe(1);
  });

  it('calm is script-only and holds the doe below the flight; photo events do not calm', () => {
    const { bus, rt, step, player } = setup();
    bus.emit('animal:request', RICKE);
    bus.emit('photo:open', {});
    player.z = 12;
    player.speed = 1.0;
    step(4);
    expect(bus.of('animal:fled')).toHaveLength(1); // upright inside flee: the phone did not help
    const c = setup();
    c.bus.emit('animal:request', RICKE);
    expect(c.rt.calm('ricke', 30)).toBe(true);
    c.player.z = 12;
    c.player.speed = 1.0;
    c.step(4);
    expect(c.bus.of('animal:fled')).toHaveLength(0);
    expect(rt.calm('nobody', 1)).toBe(false);
  });

  it("op 'shine' sets the body's eye glint (clamped), rejects unknown ids and bad k", () => {
    const { bus, rt, spawned } = setup();
    bus.emit('animal:request', { op: 'spawn', kind: 'hund', look: 'diane', id: 'diane', x: 1, z: 1 });
    expect(rt.request({ op: 'shine', id: 'diane', k: 0.6 })).toBe(true);
    expect(spawned[0]!.shine).toEqual([0.6]);
    bus.emit('story:cue', { id: 'animal', data: { op: 'shine', id: 'diane', k: 3 } });
    expect(spawned[0]!.shine).toEqual([0.6, 1]);
    expect(rt.request({ op: 'shine', id: 'nobody', k: 0.5 })).toBe(false);
    expect(rt.request({ op: 'shine', id: 'diane' })).toBe(false);
    expect(rt.slots.get('diane')!.shine).toBe(1);
  });
});
