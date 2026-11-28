/** Tour C5: the shy roe deer core (src/systems/animals/deer.ts). */
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { GameEvents } from '../src/core/events';
import { DEER, calmHerd, createDeer, grazeClip, headingOf, hitDeer, isSneaking, leaveDeer, noticeRadius, restoreDeer, serializeDeer, startleDeer, stepDeerHerd, type Deer, type DeerInput, type DeerPlayer } from '../src/systems/animals/deer';
import { restoreAnimals, serializeAnimals } from '../src/systems/animals/save';
import { toRequest, type AnimalAction, type AnimalEvent } from '../src/systems/animals/types';

const DT = 1 / 60;

function herd(): Deer[] {
  const ricke = createDeer({ op: 'spawn', id: 'ricke', kind: 'reh', look: 'ricke', x: 0, z: 0, yaw: 0, shy: { notice: 30, flee: 20, settle: 25 } });
  const kitz = createDeer({ op: 'spawn', id: 'kitz', kind: 'reh', look: 'kitz', follow: 'animal:ricke', spacing: 1.5 }, { x: 0, z: -1.5 });
  return [ricke, kitz];
}

/** A player walking from z0 toward where the doe stood at the start, stopping `stopAt` m short of it. */
function approach(stance: DeerPlayer['stance'], speed: number, z0 = 40, stopAt = 5) {
  const p: DeerPlayer = { x: 0, z: z0, speed, stance };
  let home: { x: number; z: number } | null = null;
  return (h: Deer[]): DeerPlayer => {
    home ??= { x: h[0]!.x, z: h[0]!.z };
    const d = Math.hypot(p.x - home.x, p.z - home.z);
    if (d > stopAt && p.speed > 0) p.z -= speed * DT;
    else p.speed = 0;
    return p;
  };
}

interface RunLog { events: AnimalEvent[]; minDist: number; maxFawnGap: number }

function run(h: Deer[], seconds: number, player: (h: Deer[], t: number) => DeerPlayer, extra: Partial<DeerInput> = {}, each?: (h: Deer[]) => void, log: RunLog = { events: [], minDist: Infinity, maxFawnGap: 0 }): RunLog {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    each?.(h);
    const p = player(h, i * DT);
    log.events.push(...stepDeerHerd(h, DT, { player: p, ...extra }));
    const doe = h[0]!;
    log.minDist = Math.min(log.minDist, Math.hypot(p.x - doe.x, p.z - doe.z));
    if (h[1]) log.maxFawnGap = Math.max(log.maxFawnGap, Math.hypot(h[1].x - doe.x, h[1].z - doe.z));
  }
  return log;
}

const count = (ev: AnimalEvent[], type: AnimalEvent['type'], id: string) => ev.filter((e) => e.type === type && 'id' in e && e.id === id).length;

describe('deer: constants and perception', () => {
  it('a crouched, slow player shrinks the notice radius below the photo range', () => {
    const shy = { notice: DEER.NOTICE, flee: DEER.FLEE, settle: DEER.SETTLE };
    const sneak: DeerPlayer = { x: 0, z: 0, speed: 1.5, stance: 'crouch' };
    expect(isSneaking(sneak)).toBe(true);
    expect(noticeRadius(shy, sneak)).toBe(15);
    expect(isSneaking({ ...sneak, stance: 'stand' })).toBe(false);
    expect(noticeRadius(shy, { ...sneak, stance: 'stand', speed: 3.2 })).toBe(30);
  });

  it('the request event is animal:request carrying an AnimalAction', () => {
    expectTypeOf<GameEvents['animal:request']>().toEqualTypeOf<AnimalAction>();
    expectTypeOf<GameEvents>().not.toHaveProperty('animal:spawn');
  });

  it('narrows a flat C5 action to its op', () => {
    expect(toRequest({ op: 'run', id: 'diane', path: [[0, 0], [1, 1]], bark: true, back: true })).toMatchObject({ op: 'run', id: 'diane', back: true });
    expect(toRequest({ op: 'run', id: 'diane', path: [[0, 0]] })).toBeNull();
    expect(toRequest({ op: 'spawn', id: 'ricke' })).toBeNull();
  });
});

describe('deer: approach', () => {
  it('a walking, upright approach alerts, then the deer flee 25 m and settle', () => {
    const h = herd();
    const log = run(h, 20, approach('stand', 3.2));
    const kinds = log.events.filter((e) => e.id === 'ricke').map((e) => e.type);
    expect(kinds).toEqual(['animal:alert', 'animal:fled', 'animal:settled']);
    const fled = log.events.find((e) => e.type === 'animal:fled' && e.id === 'ricke');
    expect(fled).toMatchObject({ by: 'player' });
    expect((fled as { dist: number }).dist).toBeLessThanOrEqual(DEER.FLEE);
    expect((fled as { dist: number }).dist).toBeGreaterThan(14);
    // bounded 25 m away from the player (player came from +z → deer went toward −z), after her one step aside
    expect(h[0]!.z).toBeLessThan(-24);
    expect(Math.hypot(h[0]!.x, h[0]!.z)).toBeGreaterThan(25 - 0.5);
    expect(Math.hypot(h[0]!.x, h[0]!.z)).toBeLessThan(25 + DEER.STEP_LEN + 0.5);
  });

  it('the alert precedes the flight by at least the 1.5 s tell', () => {
    const h = herd();
    let t = 0;
    let tAlert = -1;
    let tFled = -1;
    const step = approach('stand', 3.2);
    for (let i = 0; i < 20 / DT; i++, t += DT) {
      for (const e of stepDeerHerd(h, DT, { player: step(h) })) {
        if (e.id !== 'ricke') continue;
        if (e.type === 'animal:alert') tAlert = t;
        if (e.type === 'animal:fled') tFled = t;
      }
    }
    expect(tAlert).toBeGreaterThan(0);
    expect(tFled - tAlert).toBeGreaterThanOrEqual(DEER.TELL_S - 1e-9);
  });

  it('a sneaking approach reaches photo range without an alert or a flight', () => {
    const h = herd();
    const log = run(h, 40, approach('crouch', 1.5, 40, 22));
    expect(log.minDist).toBeLessThanOrEqual(22);
    expect(log.events).toEqual([]);
    expect(h[0]!.state).toBe('graze');
    expect(h[0]!.meter).toBe(0);
  });

  it('a nearby runner and an upright player build alert faster than a crouching player', () => {
    const running = herd();
    const standing = herd();
    const crouching = herd();
    const player: DeerPlayer = { x: 0, z: 13, speed: 0, stance: 'stand' };

    run(running, 0.5, () => ({ ...player, speed: 4 }));
    run(standing, 0.5, () => player);
    run(crouching, 0.5, () => ({ ...player, speed: 1.6, stance: 'crouch' }));
    expect(running[0]!.state).toBe('alert');
    expect(standing[0]!.meter).toBeCloseTo(0.375);
    expect(crouching[0]!.meter).toBeGreaterThan(0);
    expect(crouching[0]!.meter).toBeLessThan(0.1);

    expect(count(run(standing, 2, () => player).events, 'animal:fled', 'ricke')).toBe(1);
    expect(count(run(crouching, 2, () => ({ ...player, stance: 'crouch' })).events, 'animal:fled', 'ricke')).toBe(0);
    expect(crouching[0]!.state).toBe('graze');
  });

  it('prone and slow works too; crouched but rushing does not', () => {
    const prone = run(herd(), 60, approach('prone', 0.6, 30, 12));
    expect(prone.events).toEqual([]);
    const rush = run(herd(), 20, approach('crouch', 3.8, 40, 8));
    expect(count(rush.events, 'animal:fled', 'ricke')).toBe(1);
  });

  it('the alert decays when the player freezes', () => {
    const h = herd();
    const p: DeerPlayer = { x: 0, z: 40, speed: 3.2, stance: 'stand' };
    const log = run(h, 15, () => {
      if (h[0]!.state === 'alert' || p.speed === 0) p.speed = 0;
      else p.z -= p.speed * DT;
      return p;
    });
    expect(p.z).toBeGreaterThan(DEER.FLEE); // froze outside the flee radius
    expect(count(log.events, 'animal:alert', 'ricke')).toBe(1);
    expect(count(log.events, 'animal:fled', 'ricke')).toBe(0);
    expect(h[0]!.state).toBe('graze');
    expect(h[0]!.meter).toBeLessThan(DEER.CLEAR_AT);
  });

  it('the alert decays when the player backs off', () => {
    const h = herd();
    const p: DeerPlayer = { x: 0, z: 40, speed: 3.2, stance: 'stand' };
    let backing = false;
    const log = run(h, 15, () => {
      if (h[0]!.state === 'alert') backing = true;
      p.z += (backing ? 1 : -1) * p.speed * DT;
      return p;
    });
    expect(count(log.events, 'animal:fled', 'ricke')).toBe(0);
    expect(h[0]!.state).toBe('graze');
  });

  it('scripted calm prevents the flight while active; running breaks it', () => {
    const h = herd();
    const log = run(h, 20, approach('stand', 3.2, 40, 9), {}, (hh) => calmHerd(hh, 0.1));
    expect(log.minDist).toBeLessThan(10);
    expect(count(log.events, 'animal:fled', 'ricke')).toBe(0);
    expect(h[0]!.meter).toBeLessThanOrEqual(DEER.CALM_CAP);
    // calm runs out → they bolt
    const after = run(h, 5, () => ({ x: 0, z: 9, speed: 0, stance: 'stand' }));
    expect(count(after.events, 'animal:fled', 'ricke')).toBe(1);

    const h2 = herd();
    const sprint = run(h2, 15, approach('stand', 6, 40, 6), {}, (hh) => calmHerd(hh, 0.1));
    expect(count(sprint.events, 'animal:fled', 'ricke')).toBe(1);
  });

  it('noise events alert even without line of sight; masking helps', () => {
    const loud = run(herd(), 1, () => ({ x: 0, z: 40, speed: 0, stance: 'crouch' }), { los: false, noise: [{ x: 0, z: 5, loud: 1 }] });
    expect(count(loud.events, 'animal:alert', 'ricke')).toBe(1);
    const h = herd();
    const masked = run(h, 1 / 60, () => ({ x: 0, z: 40, speed: 0, stance: 'crouch' }), { noise: [{ x: 0, z: 5, loud: 0.5 }], mask: 1 });
    expect(masked.events).toEqual([]);
  });

  it('a scripted startle flees by cue', () => {
    const h = herd();
    const ev = startleDeer(h[0]!, { x: 10, z: 0 });
    expect(ev).toEqual([{ type: 'animal:fled', id: 'ricke', by: 'cue', dist: 10 }]);
    const log = run(h, 6, () => ({ x: 100, z: 100, speed: 0, stance: 'stand' }));
    expect(h[0]!.x).toBeCloseTo(-25, 0);
    expect(count(log.events, 'animal:settled', 'ricke')).toBe(1);
  });

  it('flees around unwalkable ground', () => {
    const h = herd();
    const walkable = (x: number, z: number) => !(z < -5 && Math.abs(x) < 8); // a pond straight behind
    const log = run(h, 20, approach('stand', 3.2), { walkable });
    expect(count(log.events, 'animal:fled', 'ricke')).toBe(1);
    expect(walkable(h[0]!.x, h[0]!.z)).toBe(true);
    expect(Math.hypot(h[0]!.x, h[0]!.z)).toBeGreaterThan(25 - DEER.STEP_LEN - 0.5);
    expect(Math.hypot(h[0]!.x, h[0]!.z)).toBeLessThan(25 + DEER.STEP_LEN + 0.5);
  });
});

describe('deer: reactions a watcher can read (TASK-080)', () => {
  const far: DeerPlayer = { x: 0, z: 200, speed: 0, stance: 'stand' };
  /** Angle between where the body faces and a point (radians, 0 = straight ahead). */
  const offAhead = (d: Deer, x: number, z: number) => {
    const a = headingOf(x - d.x, z - d.z) - d.yaw;
    return Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
  };

  it('grazing: the head comes up for a look around every few seconds, and nothing else changes', () => {
    expect(grazeClip(0)).toBe('graze');
    expect(grazeClip(DEER.GLANCE_EVERY - DEER.GLANCE_S + 0.1)).toBe('idle');
    expect(grazeClip(DEER.GLANCE_EVERY + 0.1)).toBe('graze');
    const h = herd();
    run(h, 3, () => far); // the fawn walks to its place behind her
    const clips = new Set<string>();
    const log = run(h, 2 * DEER.GLANCE_EVERY, () => far, {}, (hh) => {
      clips.add(hh[0]!.motion.clip);
      expect(hh[1]!.motion.clip).toBe(hh[0]!.motion.clip);
    });
    expect([...clips].sort()).toEqual(['graze', 'idle']);
    expect(log.events).toEqual([]);
    expect(h.map((d) => [d.state, d.meter])).toEqual([['graze', 0], ['graze', 0]]);
    expect([h[0]!.x, h[0]!.z, h[0]!.yaw]).toEqual([0, 0, 0]);
    expect(h[0]!.motion.gaze).toBeNull();
  });

  it('an upright walker is noticed early: head up beyond 26 m, flight only inside the flee radius, 2 s later or more', () => {
    const h = herd();
    const step = approach('stand', 3.2);
    let alertAt = -1;
    let fledAt = -1;
    let alertDist = 0;
    let fledDist = 0;
    for (let i = 0; i < 20 / DT; i++) {
      const p = step(h);
      for (const e of stepDeerHerd(h, DT, { player: p })) {
        if (e.id !== 'ricke') continue;
        if (e.type === 'animal:alert') [alertAt, alertDist] = [i * DT, Math.hypot(p.x - h[0]!.x, p.z - h[0]!.z)];
        if (e.type === 'animal:fled') [fledAt, fledDist] = [i * DT, e.dist];
      }
    }
    expect(alertDist).toBeGreaterThan(26);
    expect(fledDist).toBeLessThanOrEqual(DEER.FLEE);
    expect(fledAt - alertAt).toBeGreaterThanOrEqual(2);
  });

  it('outside the flee radius she only watches: an upright player pacing at 24 m never makes her bolt', () => {
    const h = herd();
    const p: DeerPlayer = { x: 0, z: 24, speed: 3.2, stance: 'stand' };
    let dir = 1;
    const log = run(h, 30, () => {
      if (Math.abs(p.x) > 4) dir = -Math.sign(p.x);
      p.x += dir * p.speed * DT;
      return p;
    });
    expect(count(log.events, 'animal:alert', 'ricke')).toBe(1);
    expect(count(log.events, 'animal:fled', 'ricke')).toBe(0);
    expect(h[0]!.state).toBe('alert');
    expect(h[0]!.meter).toBeLessThanOrEqual(DEER.HOLD_CAP);
    // and one more step toward her is enough
    const closer = run(h, 4, approach('stand', 3.2, 24, 15));
    expect(count(closer.events, 'animal:fled', 'ricke')).toBe(1);
  });

  it('alert: she looks at the player, and the body turns only as far as the neck needs', () => {
    // the doe faces −z (yaw 0); a player to her right front needs no turn at all
    const front = herd();
    const p: DeerPlayer = { x: 6, z: -8, speed: 0, stance: 'stand' };
    run(front, 1, () => p);
    expect(front[0]!.state).toBe('alert');
    expect(front[0]!.yaw).toBe(0);
    expect(front[0]!.motion.gaze).toEqual({ x: 6, z: -8, h: 1.65 });
    expect(front[1]!.motion.gaze).toEqual(front[0]!.motion.gaze);
    // a player straight behind her: she turns until the neck can do the rest, never face-on
    const behind = herd();
    const q: DeerPlayer = { x: 0, z: 10, speed: 0, stance: 'crouch' };
    run(behind, 0.2, () => ({ ...q, stance: 'stand' }));
    run(behind, 0.6, () => ({ ...q, stance: 'stand' }));
    expect(behind[0]!.state).toBe('alert');
    expect(offAhead(behind[0]!, q.x, q.z)).toBeCloseTo(DEER.HEAD_TURN, 5);
    expect(behind[0]!.motion.yaw).toBe(behind[0]!.yaw);
    // a crouched player is looked at lower
    run(behind, 0.1, () => q);
    expect(behind[0]!.motion.gaze).toMatchObject({ h: 1.05 });
  });

  it('the ladder of a careless sneak: head up, one step aside away from the player, then the flight', () => {
    const h = herd();
    const step = approach('crouch', 1.6, 16, 2);
    const seen: string[] = [];
    let stepped = 0;
    let before = { x: 0, z: 0 };
    let playerAtStep: DeerPlayer | null = null;
    for (let i = 0; i < 25 / DT && h[0]!.state !== 'flee'; i++) {
      const p = step(h);
      const was = { x: h[0]!.x, z: h[0]!.z };
      for (const e of stepDeerHerd(h, DT, { player: p })) if (e.id === 'ricke') seen.push(e.type);
      const moved = Math.hypot(h[0]!.x - was.x, h[0]!.z - was.z);
      if (moved > 0 && h[0]!.state === 'alert') {
        if (!stepped) {
          before = was;
          playerAtStep = { ...p };
          seen.push('step');
        }
        stepped += moved;
        expect(h[0]!.motion.speed).toBe(DEER.WALK);
        expect(h[0]!.motion.clip).toBe('alert');
      }
    }
    expect(seen).toEqual(['animal:alert', 'step', 'animal:fled']);
    // (the flight may cut the last centimetres of the step short)
    expect(stepped).toBeGreaterThan(DEER.STEP_LEN * 0.8);
    expect(stepped).toBeLessThanOrEqual(DEER.STEP_LEN + 1e-9);
    // away from the player, at an angle: farther off than before, but not straight away
    const d0 = Math.hypot(before.x - playerAtStep!.x, before.z - playerAtStep!.z);
    const gained = Math.hypot(h[0]!.flee!.fx - playerAtStep!.x, h[0]!.flee!.fz - playerAtStep!.z) - d0;
    expect(gained).toBeGreaterThan(0.5);
    expect(gained).toBeLessThan(DEER.STEP_LEN);
  });

  it('freezing when she looks up ends the alert; a second alert has its own step', () => {
    const h = herd();
    const p: DeerPlayer = { x: 0, z: 14, speed: 1.6, stance: 'crouch' };
    const sneakUntilAlert = () => {
      for (let i = 0; i < 20 / DT && h[0]!.state !== 'alert'; i++) {
        p.z -= p.speed * DT;
        stepDeerHerd(h, DT, { player: p });
      }
    };
    sneakUntilAlert();
    expect(h[0]!.state).toBe('alert');
    const held = run(h, 2, () => ({ ...p, speed: 0 }));
    expect(held.events).toEqual([]);
    expect(h[0]!.state).toBe('graze');
    expect([h[0]!.x, h[0]!.z]).toEqual([0, 0]);
    sneakUntilAlert();
    let moved = 0;
    for (let i = 0; i < 4 / DT && h[0]!.state === 'alert'; i++) {
      p.z -= p.speed * DT;
      stepDeerHerd(h, DT, { player: p });
      if (h[0]!.state === 'alert') moved = Math.hypot(h[0]!.x, h[0]!.z);
    }
    // closer this time, so the flight may cut the step short: still a step anyone can see
    expect(moved).toBeGreaterThan(DEER.STEP_LEN * 0.5);
  });

  it('a chestnut landing beside her: she looks toward it for a few seconds and does not bolt', () => {
    const h = herd();
    const nut = { x: 4, z: -1, loud: 0.7 };
    const first = stepDeerHerd(h, DT, { player: far, los: false, noise: [nut] });
    expect(first.filter((e) => e.id === 'ricke')).toEqual([
      { type: 'animal:heard', id: 'ricke', x: 4, z: -1 },
      { type: 'animal:alert', id: 'ricke' },
    ]);
    expect(h.map((d) => d.state)).toEqual(['alert', 'alert']);
    expect(h[0]!.motion.gaze).toEqual({ x: 4, z: -1, h: 0.2 });
    expect(h[0]!.motion.clip).toBe('alert');
    // the look outlasts the meter: still watching the spot after 5 s, grazing again after LOOK_S
    const watching = run(h, 5, () => far, { los: false });
    expect(h[0]!.meter).toBeLessThan(DEER.CLEAR_AT);
    expect(h[0]!.state).toBe('alert');
    expect(h[1]!.motion.gaze).toEqual({ x: 4, z: -1, h: 0.2 });
    expect(offAhead(h[0]!, 4, -1)).toBeLessThanOrEqual(DEER.HEAD_TURN + 1e-9);
    const after = run(h, DEER.LOOK_S - 5 + 0.2, () => far, { los: false });
    expect(h[0]!.state).toBe('graze');
    expect(h[0]!.motion.gaze).toBeNull();
    expect([...watching.events, ...after.events]).toEqual([]);
    expect([h[0]!.x, h[0]!.z]).toEqual([0, 0]);
  });

  it('noises alone never fill the meter: three chestnuts in a row are three looks, no flight', () => {
    const h = herd();
    const log: RunLog = { events: [], minDist: Infinity, maxFawnGap: 0 };
    for (const x of [3, -3, 2]) {
      log.events.push(...stepDeerHerd(h, DT, { player: far, noise: [{ x, z: 2, loud: 0.7 }] }));
      run(h, 0.5, () => far, {}, undefined, log);
    }
    run(h, 3, () => far, {}, undefined, log);
    expect(count(log.events, 'animal:heard', 'ricke')).toBe(3);
    expect(count(log.events, 'animal:alert', 'ricke')).toBe(1);
    expect(count(log.events, 'animal:fled', 'ricke')).toBe(0);
    expect(h[0]!.motion.gaze).toMatchObject({ x: 2, z: 2 });
  });

  it('a chestnut far from her (or a faint noise) does not turn her head', () => {
    const h = herd();
    const log = run(h, DT, () => far, { noise: [{ x: 0, z: 15, loud: 0.7 }] });
    expect(log.events).toEqual([]);
    expect(h[0]!.state).toBe('graze');
    expect(h[0]!.meter).toBeGreaterThan(0);
    expect(h[0]!.motion.gaze).toBeNull();
  });

  it('a hit: both bolt at once, cause "hit", away from where it came from; the save keeps the cause', () => {
    const h = herd();
    const ev = hitDeer(h[0]!, { x: 0, z: 12 });
    expect(ev).toEqual([{ type: 'animal:fled', id: 'ricke', by: 'hit', dist: 12 }]);
    const log = run(h, 0.1, () => ({ x: 0, z: 12, speed: 0, stance: 'crouch' }));
    expect(log.events).toEqual([{ type: 'animal:fled', id: 'kitz', by: 'hit', dist: expect.any(Number) }]);
    expect(restoreDeer(serializeDeer(h[0]!)).flee).toMatchObject({ by: 'hit' });
    run(h, 6, () => ({ x: 0, z: 12, speed: 0, stance: 'crouch' }), {}, undefined, log);
    expect(h[0]!.z).toBeCloseTo(-25, 0);
    expect(count(log.events, 'animal:settled', 'ricke')).toBe(1);
    // already running: a second hit changes nothing
    const again = herd();
    hitDeer(again[0]!, { x: 0, z: 12 });
    expect(hitDeer(again[0]!, { x: 5, z: 0 })).toEqual([]);
  });

  it('the flight ends in the open where it can: the first direction without undergrowth at its end', () => {
    // straight away (−z) ends in ferns, 30° to one side is open
    const clutter = (x: number, z: number) => (Math.abs(x) < 3 && z < -20 ? 3 : 0);
    const h = herd();
    startleDeer(h[0]!, { x: 0, z: 10 }, undefined, clutter);
    const f = h[0]!.flee!;
    expect(clutter(f.tx, f.tz)).toBe(0);
    expect(Math.hypot(f.tx, f.tz)).toBeCloseTo(25, 5);
    expect(Math.abs(Math.atan2(f.tx, -f.tz))).toBeCloseTo(Math.PI / 6, 5);
    // overgrown everywhere: the least overgrown end, still on walkable ground
    const thick = (x: number, _z: number) => 2 + Math.abs(x - 12.5) / 10;
    const walkable = (x: number, _z: number) => x < 20;
    const g = herd();
    startleDeer(g[0]!, { x: 0, z: 10 }, walkable, thick);
    expect(g[0]!.flee!.tx).toBeCloseTo(12.5, 1);
    // no clutter function: straight away, as before
    const plain = herd();
    startleDeer(plain[0]!, { x: 0, z: 10 });
    expect(plain[0]!.flee).toMatchObject({ tx: 0, tz: -25 });
  });
});

describe('deer: fawn', () => {
  it('stays within 2 m of the doe through graze, alert, flight and settle, and mirrors her events', () => {
    const h = herd();
    const log = run(h, 25, approach('stand', 3.2));
    expect(log.maxFawnGap).toBeLessThanOrEqual(DEER.FAWN_MAX + 1e-9);
    const kitz = log.events.filter((e) => e.id === 'kitz').map((e) => e.type);
    expect(kitz).toEqual(['animal:alert', 'animal:fled', 'animal:settled']);
    expect(h[1]!.motion.clip).toBe(h[0]!.motion.clip);
  });

  it('every transition fires exactly once per deer, across two flights', () => {
    const h = herd();
    const log = run(h, 20, approach('stand', 3.2));
    // let them settle and graze again, then walk at them a second time
    run(h, DEER.SETTLE_DWELL + 1, () => ({ x: 0, z: 200, speed: 0, stance: 'stand' }), {}, undefined, log);
    const z0 = h[0]!.z + 40;
    run(h, 20, approach('stand', 3.2, z0), {}, undefined, log);
    for (const id of ['ricke', 'kitz']) {
      expect(count(log.events, 'animal:alert', id)).toBe(2);
      expect(count(log.events, 'animal:fled', id)).toBe(2);
      expect(count(log.events, 'animal:settled', id)).toBe(2);
    }
    expect(log.maxFawnGap).toBeLessThanOrEqual(DEER.FAWN_MAX + 1e-9);
  });

  it('a fawn without its doe leads itself', () => {
    const kitz = createDeer({ op: 'spawn', id: 'kitz', kind: 'reh', look: 'kitz', follow: 'animal:ricke' }, { x: 0, z: 0 });
    const log = run([kitz], 20, approach('stand', 3.2));
    expect(count(log.events, 'animal:fled', 'kitz')).toBe(1);
  });
});

describe('deer: save', () => {
  it('round-trips mid-flee and finishes the flight identically, settling once', () => {
    const a = herd();
    const step = approach('stand', 3.2);
    let p: DeerPlayer = { x: 0, z: 40, speed: 0, stance: 'stand' };
    for (let i = 0; i < 30 / DT; i++) {
      p = step(a);
      const ev = stepDeerHerd(a, DT, { player: p });
      if (ev.some((e) => e.type === 'animal:fled')) break;
    }
    run(a, 0.5, () => p); // half a second into the bound
    expect(a[0]!.state).toBe('flee');
    const saved = JSON.parse(JSON.stringify(serializeAnimals(a, []))) as ReturnType<typeof serializeAnimals>;
    const b = restoreAnimals(saved).deer;
    expect(b.map(serializeDeer)).toEqual(a.map(serializeDeer));
    const la = run(a, 6, () => p);
    const lb = run(b, 6, () => p);
    expect(lb.events).toEqual(la.events);
    expect(count(lb.events, 'animal:settled', 'ricke')).toBe(1);
    expect(count(lb.events, 'animal:settled', 'kitz')).toBe(1);
    expect(count(lb.events, 'animal:fled', 'ricke')).toBe(0);
    expect(b[0]!.x).toBeCloseTo(a[0]!.x, 6);
    expect(b[0]!.z).toBeCloseTo(a[0]!.z, 6);
    expect(lb.maxFawnGap).toBeLessThanOrEqual(DEER.FAWN_MAX + 1e-9);
  });

  it('restores defensively', () => {
    const d = restoreDeer({ ...serializeDeer(herd()[0]!), state: 'flee' }); // flee without a flight
    expect(d.state).toBe('settled');
    expect(restoreAnimals(null)).toEqual({ deer: [], dogs: [] });
  });

  it('keeps a departing fawn with the doe across a save, until both are gone', () => {
    const pair = herd();
    const watcher = () => ({ x: 0, z: 10, speed: 0, stance: 'stand' as const });
    leaveDeer(pair[0]!);
    run(pair, 2, watcher);
    expect(pair.map((deer) => deer.state)).toEqual(['leave', 'leave']);
    const snapshot = serializeAnimals(pair, []);
    expect(restoreAnimals({ ...snapshot, deer: [snapshot.deer[1]!] }).deer[0]?.state).toBe('gone');
    const resumed = restoreAnimals(JSON.parse(JSON.stringify(snapshot))).deer;
    expect(resumed.map((deer) => deer.state)).toEqual(['leave', 'leave']);
    expect(startleDeer(resumed[0]!, watcher())).toEqual([]);
    expect(run(resumed, 30, watcher).events).toEqual([]);
    run(pair, 30, watcher);
    expect(resumed.map((deer) => deer.state)).toEqual(['gone', 'gone']);
    expect(resumed.map(serializeDeer)).toEqual(pair.map(serializeDeer));
    expect(startleDeer(resumed[1]!, watcher())).toEqual([]);
  });

  it('restores a departing follow chain only if it ends at a deer with a destination', () => {
    const pair = herd();
    const tail = createDeer({ op: 'spawn', id: 'tail', kind: 'reh', look: 'kitz', follow: 'animal:kitz' });
    const chain = [tail, pair[1]!, pair[0]!];
    const watcher = () => ({ x: 0, z: 10, speed: 0, stance: 'stand' as const });
    leaveDeer(pair[0]!);
    run(chain, 1, watcher);
    const saved = serializeAnimals(chain, []);
    const resumed = restoreAnimals(saved).deer;
    expect(resumed.map((deer) => deer.state)).toEqual(['leave', 'leave', 'leave']);
    run(resumed, 30, watcher);
    expect(resumed.map((deer) => deer.state)).toEqual(['gone', 'gone', 'gone']);

    delete saved.deer[2]!.away;
    expect(restoreAnimals(saved).deer.map((deer) => deer.state)).toEqual(['gone', 'gone', 'gone']);
    saved.deer[2]!.follow = 'animal:kitz';
    const cycle = restoreAnimals(saved).deer;
    expect(cycle.map((deer) => deer.state)).toEqual(['gone', 'gone', 'gone']);
    run(cycle, 1, watcher);
    expect(cycle.map((deer) => deer.state)).toEqual(['gone', 'gone', 'gone']);
  });
});
