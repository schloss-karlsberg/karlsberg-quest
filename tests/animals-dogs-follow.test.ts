/**
 * Jost's dogs following the tour group (owner playtest: "moved backwards and so on", glitchy). The
 * runtime against a leader whose people root moves only on rendered frames, as the walk syncs its
 * bodies in the frame hook: at 30 fps or with uneven frame pacing the root jumps on one tick and
 * stands on the next. The dog bodies must face where they go, never move backwards, and not flicker
 * between speeds and clips.
 */
import { describe, expect, it } from 'vitest';
import type { Animal, AnimalSpawnOpts } from '../src/systems/fauna/types';
import { createCinematicBridge, createPhotoBridge } from '../src/systems/animals/photoBridge';
import { AnimalsRuntime, type AnimalsBus, type PersonLike } from '../src/systems/animals/runtime';
import { DOGS, applyDogRequest, createDog, dogSlot, headingOf, stepDog, type DogTarget } from '../src/systems/animals/dogs';
import { FACE_SECONDS, easeYaw, wrapPi } from '../src/systems/people/locomotion';

const DT = 1 / 60;
const DEG = 180 / Math.PI;

class Bus implements AnimalsBus {
  private readonly handlers = new Map<string, ((p: never) => void)[]>();
  on(name: string, fn: (p: never) => void): void {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), fn]);
  }
  emit(name: string, payload: unknown): void {
    for (const fn of this.handlers.get(name) ?? []) fn(payload as never);
  }
}

/** What a dog body shows: where the runtime put its root, the yaw it faces, the speeds and clips it got. */
interface Body {
  x: number;
  z: number;
  yaw: number;
  /** Every face() call asked for an exact facing (seconds 0). */
  exact: boolean;
  speeds: number[];
  clips: string[];
}

function fauna(bodies: Map<string, Body>) {
  return {
    spawn(specId: string, o: AnimalSpawnOpts): Animal {
      const b: Body = { x: o.x, z: o.z, yaw: o.yaw ?? 0, exact: true, speeds: [], clips: [] };
      bodies.set(o.name ?? specId, b);
      const pos = { x: o.x, y: 0, z: o.z, set(x: number, _y: number, z: number) { b.x = pos.x = x; b.z = pos.z = z; } };
      return {
        id: o.name ?? specId,
        specId,
        root: { position: pos } as unknown as Animal['root'],
        info: { specId, length: 1, height: 0.6, radius: 0.3, headHeight: 0.7, speeds: { walk: 1.3, run: 6 }, clips: ['idle', 'walk', 'run', 'sniff', 'sit'] },
        ready: Promise.resolve(true),
        setSpeed: (v) => b.speeds.push(v),
        play: (c) => b.clips.push(c),
        face: (y, f) => {
          b.yaw = y;
          if (f?.seconds !== 0) b.exact = false;
        },
        lookAt: () => {},
        headWorld: (out) => Object.assign(out, { x: pos.x, y: 0.7, z: pos.z }),
        setEyeShine: () => {},
        setVisible: () => {},
        dispose: () => {},
      };
    },
  };
}

/** The leader's true walk: speed and heading over time (a tour leg, a bend, a stop with a turn round, a slow restart). */
function plan(t: number): { v: number; h: number } {
  if (t < 6) return { v: 1.3, h: 0 };
  if (t < 9) return { v: 1.3, h: ((t - 6) / 3) * (Math.PI / 2) };
  if (t < 12) return { v: 1.3, h: Math.PI / 2 };
  if (t < 13) return { v: 1.3 * (13 - t), h: Math.PI / 2 };
  if (t < 18.5) return { v: 0, h: t < 13.5 ? Math.PI / 2 : -Math.PI / 2 }; // turns round to face the group
  return { v: 0.5, h: -Math.PI / 2 };
}

interface Metrics {
  /** Rendered frames on which a dog moved against its facing (> 90° off). */
  backwards: number;
  /** Largest angle between body yaw and the direction of travel on frames above 0.5 m/s (deg). */
  maxErr: number;
  /** Largest change of the body speed between two rendered frames (m/s). */
  maxDSpeed: number;
  /** Clip changes per dog. */
  clips: number;
  /** The same two checks on the core (`state(id).yaw` against its move between steps), per tick. */
  coreBackwards: number;
  coreMaxErr: number;
  exact: boolean;
  states: Record<string, string>;
  gaps: number[];
}

/**
 * Run the leg. `gaps`: fixed ticks between rendered frames, cycled (the walk moves Jost's root and
 * the animals sync the dog bodies only on those frames).
 */
function walkLeg(gaps: number[], seconds = 24): Metrics {
  const jost = { specId: 'double.jost', root: { position: { x: 0, z: 0 }, rotation: { y: 0 } } };
  const people: PersonLike[] = [jost];
  const bus = new Bus();
  const bodies = new Map<string, Body>();
  const rt = new AnimalsRuntime({
    bus,
    fauna: () => fauna(bodies),
    load: () => undefined,
    save: () => {},
    log: () => {},
    photo: createPhotoBridge({}),
    cinematic: createCinematicBridge({}),
    world: { heightAt: () => 0, era: () => 'today', player: () => ({ x: 0, z: 60, speed: 0, stance: 'stand' }), los: () => true, people: () => people, npcs: () => [] },
  });
  bus.emit('animal:request', { op: 'spawn', kind: 'hund', look: 'diane', id: 'diane', x: -1, z: 1.5, follow: 'npc:double.jost' });
  bus.emit('animal:request', { op: 'spawn', kind: 'hund', look: 'bijou', id: 'bijou', x: 1, z: 2, follow: 'npc:double.jost' });
  const walker = { x: 0, z: 0 };
  const m: Metrics = { backwards: 0, maxErr: 0, maxDSpeed: 0, clips: 0, coreBackwards: 0, coreMaxErr: 0, exact: true, states: {}, gaps: [] };
  const last = new Map<string, { x: number; z: number; speed: number }>();
  const core = new Map<string, { x: number; z: number }>();
  let frame = 0;
  let next = gaps[0]!;
  let since = 0;
  const n = Math.round(seconds / DT);
  for (let i = 1; i <= n; i++) {
    const t = i * DT;
    const p = plan(t);
    walker.x -= Math.sin(p.h) * p.v * DT;
    walker.z -= Math.cos(p.h) * p.v * DT;
    rt.update(DT);
    for (const id of ['diane', 'bijou']) {
      const st = rt.state(id)!;
      const [x, z, yaw] = [st['x'], st['z'], st['yaw']] as number[];
      const l = core.get(id);
      if (l) {
        const v = Math.hypot(x! - l.x, z! - l.z) / DT;
        const err = Math.abs(wrapPi(yaw! - headingOf(x! - l.x, z! - l.z))) * DEG;
        if (v > 0.05 && err > 90) m.coreBackwards++;
        if (v > 0.5) m.coreMaxErr = Math.max(m.coreMaxErr, err);
      }
      core.set(id, { x: x!, z: z! });
    }
    since++;
    if (since < next) continue;
    // a rendered frame: the walk puts Jost's root where he is (his body turns smoothly), then the dog bodies sync
    const fdt = since * DT;
    jost.root.position.x = walker.x;
    jost.root.position.z = walker.z;
    jost.root.rotation.y = easeYaw(jost.root.rotation.y, p.h, fdt, FACE_SECONDS);
    rt.sync();
    for (const id of ['diane', 'bijou']) {
      const b = bodies.get(id)!;
      const speed = b.speeds.at(-1) ?? 0;
      const l = last.get(id);
      if (l) {
        const dx = b.x - l.x;
        const dz = b.z - l.z;
        const v = Math.hypot(dx, dz) / fdt;
        const err = Math.abs(wrapPi(b.yaw - headingOf(dx, dz))) * DEG;
        if (v > 0.05 && err > 90) m.backwards++;
        if (v > 0.5) m.maxErr = Math.max(m.maxErr, err);
        m.maxDSpeed = Math.max(m.maxDSpeed, Math.abs(speed - l.speed));
      }
      last.set(id, { x: b.x, z: b.z, speed });
    }
    since = 0;
    next = gaps[++frame % gaps.length]!;
  }
  for (const id of ['diane', 'bijou']) {
    const b = bodies.get(id)!;
    m.clips = Math.max(m.clips, b.clips.length);
    m.exact &&= b.exact;
    m.states[id] = String(rt.state(id)!['state']);
    m.gaps.push(Math.hypot(b.x - walker.x, b.z - walker.z));
  }
  return m;
}

describe('dogs follow a walking leader (rendered-frame root)', () => {
  const cases: [string, number[]][] = [
    ['60 fps', [1]],
    ['30 fps', [2]],
    ['uneven frame pacing (about 38 fps)', [2, 1, 2, 2, 1, 3, 2, 1]],
    ['20 fps', [3]],
  ];
  for (const [name, gaps] of cases) {
    it(`${name}: the bodies face where they go (within 15° above 0.5 m/s), never move backwards, no speed or clip flicker`, () => {
      const m = walkLeg(gaps);
      expect(m.exact).toBe(true);
      expect(m.backwards).toBe(0);
      expect(m.maxErr).toBeLessThan(15);
      expect(m.coreBackwards).toBe(0);
      expect(m.coreMaxErr).toBeLessThan(15);
      // speed changes are eased: at most DECEL over the longest frame gap (plus the sit / stand steps)
      expect(m.maxDSpeed).toBeLessThanOrEqual(DOGS.DECEL * DT * Math.max(...gaps) + 0.55);
      expect(m.clips).toBeLessThan(16);
      // still with the group at the end of the slow leg
      for (const g of m.gaps) expect(g).toBeLessThan(3);
    });
  }

  it('sit beside Jost at the stop after he turned round', () => {
    const m = walkLeg([2], 18.4);
    expect(m.states).toEqual({ diane: 'sit', bijou: 'sit' });
    expect(m.backwards).toBe(0);
  });
});

describe('dogs land in their places when the leader jumps (a fade warp, kq.walk.snap, a teleport)', () => {
  function rig() {
    const jost = { specId: 'double.jost', root: { position: { x: 0, z: 0 }, rotation: { y: 0 } } };
    const player = { x: 5, z: 5, speed: 0, stance: 'stand' as const };
    const bus = new Bus();
    const bodies = new Map<string, Body>();
    const rt = new AnimalsRuntime({
      bus,
      fauna: () => fauna(bodies),
      load: () => undefined,
      save: () => {},
      log: () => {},
      photo: createPhotoBridge({}),
      cinematic: createCinematicBridge({}),
      world: { heightAt: () => 0, era: () => 'today', player: () => player, los: () => true, people: () => [jost], npcs: () => [] },
    });
    const step = (n: number, each?: () => void) => {
      for (let i = 0; i < n; i++) {
        each?.();
        rt.update(DT);
        rt.sync();
      }
    };
    return { jost, player, bus, bodies, rt, step };
  }

  it("Jost's root warps 150 m (the walk's snap moves the people): both dogs are in their slots on the next tick", () => {
    const { jost, bus, bodies, rt, step } = rig();
    bus.emit('animal:request', { op: 'spawn', kind: 'hund', look: 'diane', id: 'diane', x: -1, z: 1.5, follow: 'npc:double.jost' });
    bus.emit('animal:request', { op: 'spawn', kind: 'hund', look: 'bijou', id: 'bijou', x: 1, z: 2, follow: 'npc:double.jost' });
    step(120, () => (jost.root.position.z -= 1.2 * DT));
    jost.root.position.x += 120;
    jost.root.position.z -= 90;
    jost.root.rotation.y = 1;
    step(1);
    const t: DogTarget = { x: jost.root.position.x, z: jost.root.position.z, yaw: 1, speed: 0 };
    for (const [id, slot] of [['diane', 0], ['bijou', 1]] as const) {
      const s = dogSlot(t, slot, DOGS.SPACING);
      const b = bodies.get(id)!;
      expect(Math.hypot(b.x - s.x, b.z - s.z)).toBeLessThan(0.1);
      expect(Math.abs(wrapPi(b.yaw - 1))).toBeLessThan(0.1); // facing the way Jost faces
      expect(rt.state(id)!['speed']).toBe(0);
    }
    // and they stay there with him: no gallop afterwards
    step(60);
    for (const id of ['diane', 'bijou']) expect(rt.state(id)!['speed'] as number).toBeLessThan(1);
  });

  it('a player teleport lands the dogs that follow the player; a dog near its new place just walks', () => {
    const { player, bus, bodies, step } = rig();
    bus.emit('animal:request', { op: 'spawn', kind: 'hund', look: 'diane', id: 'diane', x: 4, z: 7, follow: 'player' });
    step(120);
    player.x += 150;
    step(1);
    expect(Math.hypot(bodies.get('diane')!.x - player.x, bodies.get('diane')!.z - player.z)).toBeLessThan(3);
    // a 1 m jump (a small correction): no landing, the dog walks over
    const d = createDog({ op: 'spawn', id: 'bijou', kind: 'hund', look: 'bijou', x: 0, z: 1.95, follow: 'player' });
    const before = { x: d.x, z: d.z };
    stepDog(d, DT, () => ({ x: 1, z: 0, yaw: 0, speed: 0, jumped: true }));
    expect(Math.hypot(d.x - before.x, d.z - before.z)).toBeLessThan(0.05);
  });

  it('the core: a dog on its way back, or lying at the feet of a target, lands too (the return reports animal:returned)', () => {
    const far: DogTarget = { x: 300, z: 300, yaw: 0, speed: 0, jumped: true };
    const back = createDog({ op: 'spawn', id: 'diane', kind: 'hund', look: 'diane', x: 0, z: 0, follow: 'npc:double.jost' });
    back.state = 'return';
    const ev = stepDog(back, DT, () => far);
    expect(ev).toEqual([{ type: 'animal:returned', id: 'diane' }]);
    expect(back.state).toBe('follow');
    expect(Math.hypot(back.x - 300, back.z - 300)).toBeLessThan(3);
    const lie = createDog({ op: 'spawn', id: 'bijou', kind: 'hund', look: 'bijou', x: 0, z: 0, follow: 'player' });
    applyDogRequest(lie, { op: 'lie', id: 'bijou', follow: 'player' });
    stepDog(lie, DT, () => far);
    expect(Math.hypot(lie.x - 300, lie.z - 300)).toBeLessThan(1.5);
    expect(lie.motion.clip).toBe('lie');
  });
});

describe('dogs: the core moves a dog only forward along its yaw', () => {
  it('in every state (follow through a stop and turn, the bolt with its U-turn, the return, the lie), turning at most TURN', () => {
    const jost: DogTarget = { x: 0, z: 0, yaw: 0, speed: 0 };
    const player: DogTarget = { x: 6, z: 3, yaw: Math.PI / 2, speed: 0 };
    const resolve = (r: string) => (r === 'npc:double.jost' ? jost : r === 'player' ? player : null);
    const dogs = [
      createDog({ op: 'spawn', id: 'diane', kind: 'hund', look: 'diane', x: 3, z: 3, follow: 'npc:double.jost' }),
      createDog({ op: 'spawn', id: 'bijou', kind: 'hund', look: 'bijou', x: -3, z: -2, yaw: 180, follow: 'npc:double.jost' }),
    ];
    let worst = 0;
    let turn = 0;
    let moved = 0;
    const tick = (t: number): void => {
      for (const d of dogs) {
        const x0 = d.x;
        const z0 = d.z;
        const y0 = d.yaw;
        stepDog(d, DT, resolve);
        const dx = d.x - x0;
        const dz = d.z - z0;
        const l = Math.hypot(dx, dz);
        moved += l;
        if (l > 1e-9) worst = Math.max(worst, Math.abs(wrapPi(d.yaw - headingOf(dx, dz))));
        turn = Math.max(turn, Math.abs(wrapPi(d.yaw - y0)));
      }
      void t;
    };
    const run = (s: number, each?: (t: number) => void): void => {
      for (let i = 0; i < Math.round(s / DT); i++) {
        each?.(i * DT);
        tick(i * DT);
      }
    };
    run(5);
    // Jost walks off, stops, turns round (the slots swing to his other side), walks back
    run(4, () => Object.assign(jost, { speed: 1.4, z: jost.z - 1.4 * DT }));
    run(3, (t) => Object.assign(jost, { speed: 0, yaw: Math.min(Math.PI, t * 3) }));
    run(4, () => Object.assign(jost, { speed: 1.0, z: jost.z + 1.0 * DT }));
    // the t5 bolt: out and back with a U-turn at the far point, then the return to the slot
    applyDogRequest(dogs[0]!, { op: 'run', id: 'diane', path: [[dogs[0]!.x, dogs[0]!.z], [jost.x + 12, jost.z - 15], [jost.x, jost.z]], bark: true, back: true });
    run(14);
    expect(['follow', 'sit']).toContain(dogs[0]!.state);
    // the party lie at the player's feet
    for (const d of dogs) applyDogRequest(d, { op: 'lie', id: d.id, follow: 'player' });
    run(10);
    for (const d of dogs) expect(d.motion.clip).toBe('lie');
    expect(moved).toBeGreaterThan(60);
    expect(worst * DEG).toBeLessThan(1e-6 + 90); // never a step backwards …
    expect(worst * DEG).toBeLessThan(25); // … and only the last few cm onto a point leave the yaw at all
    expect(turn).toBeLessThanOrEqual(DOGS.TURN * DT + 1e-9);
  });
});
