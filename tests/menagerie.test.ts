import { describe, expect, it } from 'vitest';
import { CASSOWARY, DROMEDARY, JAGUAR, Menagerie, type MenagerieEvent, type MenageriePlayer, createAnimals, groupId } from '../src/systems/menagerie/logic';

const DT = 1 / 60;

function player(o: Partial<MenageriePlayer> = {}): MenageriePlayer {
  return { x: 0, z: 0, speed: 0, stance: 'stand', lanternLit: false, lightRadius: 4, down: false, ...o };
}

function run(m: Menagerie, seconds: number, p: MenageriePlayer | ((t: number) => MenageriePlayer), log: MenagerieEvent[] = [], until?: (e: MenagerieEvent[]) => boolean): MenagerieEvent[] {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    const ev = m.update(DT, typeof p === 'function' ? p(i * DT) : p);
    log.push(...ev);
    if (until?.(ev)) break;
  }
  return log;
}

const types = (log: MenagerieEvent[]) => log.map((e) => e.type);

describe('cassowary: charges, overshoots, gets bored — never catches', () => {
  it('a player standing still is knocked down once, then left alone', () => {
    const m = new Menagerie();
    m.add({ kind: 'cassowary', x: 0, z: -15, id: 'kasuar' });
    const p = player();
    const log = run(m, 12, p);
    const t = types(log);
    expect(t.indexOf('notice')).toBeLessThan(t.indexOf('charge'));
    const kd = log.filter((e) => e.type === 'knockdown');
    expect(kd.length).toBe(1);
    expect((kd[0] as Extract<MenagerieEvent, { type: 'knockdown' }>).seconds).toBe(CASSOWARY.knockdown);
    const a = m.animals[0]!;
    expect(a.state === 'bored' || a.state === 'idle').toBe(true);
    expect(a.cool).toBeGreaterThan(0);
    // bored: no further encounter while the cooldown runs, even standing right there
    const later = run(m, CASSOWARY.cooldown - 13, p);
    expect(later.some((e) => e.type === 'charge' || e.type === 'knockdown')).toBe(false);
  });

  it('side-stepping makes it miss; after a few charges it gives up', () => {
    const m = new Menagerie();
    m.add({ kind: 'cassowary', x: 0, z: -18, id: 'kasuar' });
    const p = player();
    let dir = 1;
    const log: MenagerieEvent[] = [];
    run(m, 40, () => {
      const a = m.animals[0]!;
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      if (a.state === 'charge' && d < 10) {
        // sprint sideways, across its line
        const fx = -Math.sin(a.h);
        const fz = -Math.cos(a.h);
        p.x += -fz * dir * 6.2 * DT;
        p.z += fx * dir * 6.2 * DT;
        p.speed = 6.2;
      } else {
        p.speed = 0;
        if (a.state === 'turn') dir = -dir;
      }
      return p;
    }, log);
    expect(log.some((e) => e.type === 'knockdown')).toBe(false);
    expect(log.filter((e) => e.type === 'miss').length).toBeGreaterThanOrEqual(1);
    expect(log.filter((e) => e.type === 'charge').length).toBeLessThanOrEqual(CASSOWARY.maxCharges);
    expect(log.some((e) => e.type === 'bored')).toBe(true);
  });

  it('a player who is down is never charged again', () => {
    const m = new Menagerie();
    m.add({ kind: 'cassowary', x: 0, z: -15, id: 'k' });
    const log = run(m, 20, player({ down: true }));
    expect(log.some((e) => e.type === 'charge')).toBe(false);
  });

  it('gentle mode: slower, shorter knockdown', () => {
    const m = new Menagerie({}, { gentle: true });
    m.add({ kind: 'cassowary', x: 0, z: -15, id: 'k' });
    const log = run(m, 12, player());
    const kd = log.find((e) => e.type === 'knockdown') as Extract<MenagerieEvent, { type: 'knockdown' }> | undefined;
    expect(kd?.seconds).toBe(CASSOWARY.gentleKnockdown);
  });
});

describe('dromedaries: they block the path, grumble, and yield to patience', () => {
  it('stand side by side across the path', () => {
    const list = createAnimals({ kind: 'dromedary', x: 10, z: 0, id: 'drom', heading: 0 }, 2);
    expect(list.map((a) => a.id)).toEqual(['drom#0', 'drom#1']);
    expect(groupId(list[1]!.id)).toBe('drom');
    // heading 0 = path runs north–south: the two stand east / west of the spot
    expect(Math.abs(list[0]!.x - list[1]!.x)).toBeCloseTo(DROMEDARY.spacing, 5);
  });

  it('you cannot walk through them; shoving makes them grumble', () => {
    const m = new Menagerie();
    m.add({ kind: 'dromedary', x: 0, z: -5, id: 'drom', heading: 0 }, 2);
    const p = player({ speed: 3 });
    const log: MenagerieEvent[] = [];
    let minD = Infinity;
    run(m, 8, () => {
      // walking north into them
      p.z -= 3 * DT;
      const c = m.collide(p.x, p.z, 0.35);
      p.x = c.x;
      p.z = c.z;
      for (const a of m.animals) minD = Math.min(minD, Math.hypot(a.x - p.x, a.z - p.z));
      return p;
    }, log);
    expect(p.z).toBeGreaterThan(-5); // never got past the line
    expect(minD).toBeGreaterThan(0.9);
    expect(log.some((e) => e.type === 'grumble')).toBe(true);
  });

  it('waiting calmly near them: they amble aside and the path is free', () => {
    const m = new Menagerie();
    m.add({ kind: 'dromedary', x: 0, z: -5, id: 'drom', heading: 0 }, 2);
    const log = run(m, DROMEDARY.patientT + 25, player({ x: 0, z: 0 }));
    expect(log.filter((e) => e.type === 'yield').length).toBe(2);
    for (const a of m.animals) expect(Math.hypot(a.x, a.z + 5)).toBeGreaterThan(DROMEDARY.yieldDist * 0.7);
    // the path (x = 0) is free
    expect(m.collide(0, -5, 0.35).hit).toBeNull();
  });
});

describe('jaguar: the edge of the light', () => {
  it('with the lantern lit it circles outside the light and never comes in', () => {
    const m = new Menagerie();
    m.add({ kind: 'jaguar', x: 30, z: 0, id: 'jag' });
    const R = 12;
    const p = player({ lanternLit: true, lightRadius: R });
    let minD = Infinity;
    const log: MenagerieEvent[] = [];
    run(m, 90, (t) => {
      // the player wanders about; also walks straight at it for a while
      const a = m.animals[0]!;
      if (t > 30 && t < 40) {
        const d = Math.hypot(a.x - p.x, a.z - p.z) || 1;
        p.x += ((a.x - p.x) / d) * 2.5 * DT;
        p.z += ((a.z - p.z) / d) * 2.5 * DT;
        p.speed = 2.5;
      } else p.speed = 0;
      if (t > 15) minD = Math.min(minD, Math.hypot(a.x - p.x, a.z - p.z));
      return p;
    }, log);
    expect(log.some((e) => e.type === 'seen')).toBe(true);
    expect(log.some((e) => e.type === 'knockdown' || e.type === 'growl')).toBe(false);
    expect(minD).toBeGreaterThan(R);
  });

  it('in the dark it creeps closer and shoves you over; then it is gone for a while', () => {
    const m = new Menagerie();
    m.add({ kind: 'jaguar', x: 25, z: 0, id: 'jag' });
    const log = run(m, 60, player(), [], (ev) => ev.some((e) => e.type === 'knockdown'));
    expect(types(log)).toContain('growl');
    const kd = log.find((e) => e.type === 'knockdown') as Extract<MenagerieEvent, { type: 'knockdown' }>;
    expect(kd.seconds).toBe(JAGUAR.knockdown);
    const a = m.animals[0]!;
    expect(a.state).toBe('retreat');
    run(m, 4, player({ down: true }));
    expect(Math.hypot(a.x, a.z)).toBeGreaterThan(15);
  });

  it('lighting the lantern drives it back', () => {
    const m = new Menagerie();
    m.add({ kind: 'jaguar', x: 25, z: 0, id: 'jag' });
    run(m, 60, player(), [], () => m.animals[0]!.state === 'creep' && Math.hypot(m.animals[0]!.x, m.animals[0]!.z) < 6);
    const log = run(m, 6, player({ lanternLit: true, lightRadius: 12 }));
    expect(types(log)).toContain('hiss');
    expect(log.some((e) => e.type === 'knockdown')).toBe(false);
    expect(Math.hypot(m.animals[0]!.x, m.animals[0]!.z)).toBeGreaterThan(12);
  });

  it('gentle mode: it never shoves', () => {
    const m = new Menagerie({}, { gentle: true });
    m.add({ kind: 'jaguar', x: 25, z: 0, id: 'jag' });
    let minD = Infinity;
    const log = run(m, 90, () => {
      const a = m.animals[0]!;
      minD = Math.min(minD, Math.hypot(a.x, a.z));
      return player();
    });
    expect(log.some((e) => e.type === 'knockdown')).toBe(false);
    expect(minD).toBeGreaterThan(JAGUAR.gentleCreepTo - 0.5);
  });

  it('switching to gentle mode during a pounce prevents the pending knockdown', () => {
    const sim = new Menagerie();
    const [cat] = sim.add({ kind: 'jaguar', x: 0, z: -1, id: 'cat' });
    run(sim, 1, player(), [], () => cat!.state === 'pounce');
    expect(cat!.state).toBe('pounce');
    sim.gentle = true;
    expect(types(run(sim, 3, player()))).not.toContain('knockdown');
    expect(cat!.state).not.toBe('pounce');
  });

  it('far from its spot it only prowls there', () => {
    const m = new Menagerie();
    m.add({ kind: 'jaguar', x: 0, z: 0, id: 'jag' });
    const log = run(m, 30, player({ x: 200, z: 0 }));
    expect(log.some((e) => e.type === 'seen')).toBe(false);
    expect(Math.hypot(m.animals[0]!.x, m.animals[0]!.z)).toBeLessThan(10);
  });
});

describe('animal bodies', () => {
  it.each([0, 0.01, 0.8])('separates overlapping animals without throwing either across the path (gap %s)', (gap) => {
    const sim = new Menagerie();
    const [first] = sim.add({ id: 'left', kind: 'dromedary', x: 0, z: 4 });
    const [second] = sim.add({ id: 'right', kind: 'dromedary', x: gap, z: 4 });
    sim.update(DT, player({ x: 100 }));
    expect(Math.hypot(first!.x - second!.x, first!.z - second!.z)).toBeCloseTo(first!.radius + second!.radius);
    expect((first!.x + second!.x) / 2).toBeCloseTo(gap / 2);
    expect((first!.z + second!.z) / 2).toBeCloseTo(4);
  });

  it('replaces a group at the cap, leaves other species alone and clears an empty pen safely', () => {
    const sim = new Menagerie();
    const spec = { id: 'dam', kind: 'dromedary', x: 10, z: 20 } as const;
    expect(sim.add(spec, 99).map((animal) => animal.id)).toEqual(['dam#0', 'dam#1', 'dam#2', 'dam#3']);
    sim.add({ ...spec, kind: 'cassowary', id: 'bird' }, 4);
    sim.add(spec, 0);
    expect(sim.animals.map((animal) => animal.id)).toEqual(['bird', 'dam']);
    sim.remove('dam');
    expect(sim.animals.map((animal) => animal.id)).toEqual(['bird']);
    sim.remove();
    expect(sim.collide(10, 20, 0.35)).toEqual({ x: 10, z: 20, hit: null });
  });
});

describe('world: animals avoid water', () => {
  it.each([-1, 1])('separates coincident animals toward the dry side of a bank (side %s)', (side) => {
    const walkable = (x: number) => x * side >= 0;
    const sim = new Menagerie({ walkable });
    const [first] = sim.add({ id: 'first', kind: 'dromedary', x: 0.1 * side, z: 4 });
    const [second] = sim.add({ id: 'second', kind: 'dromedary', x: 0.1 * side, z: 4 });
    sim.update(DT, player({ x: 100 }));
    expect(sim.animals.every((a) => walkable(a.x))).toBe(true);
    expect(Math.hypot(first!.x - second!.x, first!.z - second!.z)).toBeCloseTo(first!.radius + second!.radius);
  });

  it.each([0.2, 2])('separates along a narrow path when neither side has room for the full push (width %s)', (width) => {
    const walkable = (x: number) => x >= 0 && x < width;
    const sim = new Menagerie({ walkable });
    const [first] = sim.add({ id: 'first', kind: 'dromedary', x: 0.1, z: 4 });
    const [second] = sim.add({ id: 'second', kind: 'dromedary', x: 0.1, z: 4 });
    sim.update(DT, player({ x: 100 }));
    expect(sim.animals.every((a) => walkable(a.x))).toBe(true);
    expect(Math.abs(first!.z - second!.z)).toBeCloseTo(first!.radius + second!.radius);
  });

  it('keeps animals on their spot when the surrounding terrain blocks separation', () => {
    const sim = new Menagerie({ walkable: (x, z) => x === 0 && z === 4 });
    sim.add({ id: 'first', kind: 'dromedary', x: 0, z: 4 });
    sim.add({ id: 'second', kind: 'dromedary', x: 0, z: 4 });
    sim.update(DT, player({ x: 100 }));
    expect(sim.animals.map(({ x, z }) => ({ x, z }))).toEqual([{ x: 0, z: 4 }, { x: 0, z: 4 }]);
  });

  it('a charge stops at the bank', () => {
    const m = new Menagerie({ walkable: (_x, z) => z > -8 || z < -12 });
    m.add({ kind: 'cassowary', x: 0, z: -20, id: 'k', heading: Math.PI });
    run(m, 15, player());
    expect(m.animals[0]!.z).toBeLessThan(-11.5);
  });
});
