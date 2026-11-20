/** Tour C5: the shy roe deer core (src/systems/animals/deer.ts). */
import { describe, expect, it } from 'vitest';
import { DEER, calmHerd, createDeer, isSneaking, noticeRadius, restoreDeer, serializeDeer, startleDeer, stepDeerHerd, type Deer, type DeerInput, type DeerPlayer } from '../src/systems/animals/deer';
import { restoreAnimals, serializeAnimals } from '../src/systems/animals/save';
import { toRequest, type AnimalEvent } from '../src/systems/animals/types';

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
    expect(noticeRadius(shy, sneak)).toBeCloseTo(30 * 0.35);
    expect(noticeRadius(shy, sneak)).toBeLessThan(DEER.PHOTO_RANGE);
    expect(isSneaking({ ...sneak, stance: 'stand' })).toBe(false);
    expect(noticeRadius(shy, { ...sneak, stance: 'stand', speed: 3.2 })).toBe(30);
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
    expect((fled as { dist: number }).dist).toBeGreaterThan(DEER.PHOTO_RANGE);
    // bounded 25 m away from the player (player came from +z → deer went toward −z)
    expect(h[0]!.z).toBeCloseTo(-25, 0);
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
    const log = run(h, 40, approach('crouch', 1.5, 40, 12));
    expect(log.minDist).toBeLessThanOrEqual(DEER.PHOTO_RANGE);
    expect(log.events).toEqual([]);
    expect(h[0]!.state).toBe('graze');
    expect(h[0]!.meter).toBe(0);
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

  it('calm() (phone up) prevents the flight while active; running breaks it', () => {
    const h = herd();
    const log = run(h, 20, approach('stand', 3.2, 40, 9), {}, (hh) => calmHerd(hh, 0.1));
    expect(log.minDist).toBeLessThan(10);
    expect(count(log.events, 'animal:fled', 'ricke')).toBe(0);
    expect(h[0]!.meter).toBeLessThanOrEqual(DEER.CALM_CAP);
    // calm runs out → they bolt
    const after = run(h, 5, (hh) => ({ x: 0, z: hh[0]!.z + 9, speed: 3.2, stance: 'stand' }));
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
    run(h, 20, approach('stand', 3.2), { walkable });
    expect(walkable(h[0]!.x, h[0]!.z)).toBe(true);
    expect(Math.hypot(h[0]!.x, h[0]!.z)).toBeCloseTo(25, 0);
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
});
