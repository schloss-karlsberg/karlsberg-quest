import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { StoryFile, ThreatAction } from '../src/systems/story/types';
import { validateStories } from '../src/systems/story/validate';
import { DriveMode, FINALE, FinaleMode, ParforceMode, makeMode } from '../src/systems/hunt/modes';
import type { PlayerSense } from '../src/systems/hunt/perception';
import { type PackOptions, PackSim, type SimEvent, type SimWorld } from '../src/systems/hunt/sim';
import { TrackField, ageWord, compassWord } from '../src/systems/hunt/tracks';

/**
 * Hunt extensions: snow tracks, drive, finale, the long par force chase (fairness by simulated
 * runs). Flat synthetic world at 300 m with a water band (the trail / the chase ends there).
 */
const DT = 1 / 60;

function flatWorld(water: (x: number, z: number) => boolean): SimWorld {
  return {
    heightAt: () => 300,
    surfaceAt: (x, z) => (water(x, z) ? 'water' : 'meadow'),
    coverAt: () => 0,
    bounds: () => ({ x0: -3000, z0: -3000, x1: 3000, z1: 3000 }),
    trailBreakAt: (x, z) => (water(x, z) ? 'water' : null),
  };
}

function player(o: Partial<PlayerSense> = {}): PlayerSense {
  return { x: 0, y: 300, z: 0, stance: 'stand', noise: 0, visibility: 1, lanternLit: false, speed: 0, flying: false, ...o };
}

function opts(o: Partial<PackOptions> = {}): PackOptions {
  return { x: 0, z: 0, radius: 150, intensity: 0.5, hounds: 4, pikeur: true, seed: 7, sight: 15, beacon: 65, gentle: false, rauhnacht: false, ...o };
}

function run(sim: PackSim, seconds: number, p: PlayerSense | ((t: number) => PlayerSense), log: SimEvent[] = [], until?: () => boolean): SimEvent[] {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    const pp = typeof p === 'function' ? p(sim.time) : p;
    log.push(...sim.update(DT, pp));
    if (until?.()) break;
  }
  return log;
}

// =============================================================================================

describe('snow tracks: TrackField', () => {
  it('lays a trail in segments; a break (water, stone …) starts a new one', () => {
    const T = new TrackField();
    for (let x = 0; x < 10; x += 0.7) T.addPlayer(x, 0, -Math.PI / 2, 0, 1, 0.7, null);
    expect(T.prints.length).toBe(15);
    expect(T.segmentEnded(0)).toBe(false);
    expect(T.addPlayer(10.5, 0, 0, 0, 1, 0.7, 'water')).toBeNull();
    expect(T.segmentEnded(0)).toBe(true);
    expect(T.lastBreak?.why).toBe('water');
    T.addPlayer(14, 0, 0, 0, 1, 0.7, null);
    expect(T.seg).toBe(1);
    expect(T.segmentEnd(0)!.x).toBeCloseTo(9.8, 5);
    // following: the next print ≥ 2.5 m on, never across into the new segment
    const nx = T.next(0, 0, 0, 0);
    expect(nx!.x).toBeGreaterThanOrEqual(2.5);
    expect(T.next(0, T.segmentEnd(0)!.seq, 9.8, 0)).toBeNull();
  });

  it('prints fade out after their life time', () => {
    const T = new TrackField({ life: 30 });
    T.addPlayer(0, 0, 0, 0, 1, 1, null);
    T.tick(20);
    T.addPack('paw', 1, 1, 1, 0, T.now, 1, 1);
    T.tick(25);
    T.prune();
    expect(T.prints.map((p) => p.kind)).toEqual(['paw']);
  });

  it('reads the pack: kind, count, the rider, direction, age (Spurenleser)', () => {
    const T = new TrackField();
    const east = -Math.PI / 2; // forward = (−sin h, −cos h) = (1, 0)
    for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) T.addPack('paw', i + 1, k * 0.5, i * 0.3, east, 10 + k, 1, 0.8);
    T.addPack('hoof', 0, 1, 0.5, east, 12, 1, 1);
    const r = T.readPack(0.5, 0.3, 2.4, 40)!;
    expect(r.count).toBe(3);
    expect(r.hasPikeur).toBe(true);
    expect(r.kind).toBe('paw');
    expect(compassWord(r.heading)).toBe('Osten');
    expect(r.age).toBeCloseTo(27, 5);
    expect(ageWord(r.age)).toBe('frisch');
    expect(T.readPack(30, 30, 2.4, 40)).toBeNull();
    expect(compassWord(0)).toBe('Norden');
    expect(compassWord(Math.PI)).toBe('Süden');
  });
});

describe('snow tracks: the pack follows your prints until the trail breaks', () => {
  // water band x ∈ [80, 90]
  const world = flatWorld((x) => x >= 80 && x <= 90);

  it('a hound crossing the Warner’s boots only sounds the found horn for a real player trail', () => {
    const field = new TrackField();
    field.addTrail([{ x: -40, z: 0 }, { x: -30, z: 0 }], 0, 1.4, 1, 600);
    const sim = new PackSim(world, null, opts({ x: -40, z: 0, hounds: 1, pikeur: false, seed: 11 }), { x: 140, z: 0 }, field, makeMode);
    const hidden = player({ x: 140, z: 0, stance: 'prone', visibility: 0.05 });
    sim.place(0, -40, 0);
    const crossing = run(sim, 0.5, hidden);
    expect(crossing.filter((event) => event.type === 'tracking')).toEqual([]);
    expect(crossing).not.toContainEqual(expect.objectContaining({ type: 'horn', signal: 'found' }));
    const hound = sim.hounds[0]!;
    field.addPlayer(hound.x, hound.z, 0, field.now, 1, 1, null);
    expect(run(sim, 0.5, hidden)).toContainEqual(expect.objectContaining({ type: 'tracking', on: true }));
  });

  function trailSim(seed: number) {
    const T = new TrackField();
    // your trail from (−40, 0) east to the water, then on the far bank to (140, 0)
    for (let x = -40; x <= 140; x += 0.7) T.addPlayer(x, 0, -Math.PI / 2, 0, x % 1.4 < 0.7 ? 1 : -1, 0.7, world.trailBreakAt!(x, 0));
    const sim = new PackSim(world, null, opts({ x: -60, z: 40, radius: 120, pikeur: false, hounds: 3, seed }), { x: 140, z: 0 }, T, makeMode);
    // a hound crosses the start of the trail
    sim.place(0, -39, 0.4);
    return { sim, T };
  }

  it('picks the trail up, follows it, loses it at the water', () => {
    for (const seed of [1, 2, 3]) {
      const { sim } = trailSim(seed);
      const hidden = player({ x: 140, z: 0, stance: 'prone', visibility: 0.05 });
      const log = run(sim, 120, hidden);
      const tr = log.filter((e): e is Extract<SimEvent, { type: 'tracking' }> => e.type === 'tracking');
      expect(tr[0]?.on, `seed ${seed}`).toBe(true);
      const off = tr.find((e) => !e.on);
      expect(off?.why, `seed ${seed}`).toBe('water');
      expect(off!.x).toBeGreaterThan(70);
      expect(off!.x).toBeLessThan(80);
      // the horn: two short when they pick it up, the falling run when it breaks
      const horns = log.filter((e) => e.type === 'horn').map((e) => (e as { signal: string }).signal);
      expect(horns).toContain('found');
      expect(horns).toContain('lost');
      // they never found you on the far bank
      expect(sim.caught).toBeNull();
      for (const h of sim.hounds) expect(h.x).toBeLessThan(92);
    }
  });

  it('hounds leave paw prints, the horse hoof prints — none in the water', () => {
    const T = new TrackField();
    const sim = new PackSim(world, null, opts({ x: 60, z: 0, radius: 60, seed: 4 }), { x: 0, z: 0 }, T, makeMode);
    run(sim, 60, player({ x: 300, z: 300 }));
    const paws = T.prints.filter((p) => p.kind === 'paw');
    const hooves = T.prints.filter((p) => p.kind === 'hoof');
    expect(paws.length).toBeGreaterThan(20);
    expect(hooves.length).toBeGreaterThan(5);
    for (const p of T.prints) expect(p.x >= 80 && p.x <= 90).toBe(false);
  });
});

// =============================================================================================

describe('drive mode (Ch. 4): the pack herds, never stalls', () => {
  const world = flatWorld(() => false);
  const target = { x: 0, z: -300 };
  const make = (seed = 3) => new PackSim(world, null, opts({ mode: 'drive', target, hounds: 5, seed }), { x: 0, z: 0 }, null, makeMode);

  it('walking on: hounds stay behind and to the flanks, no catch, the goal is reached', () => {
    const sim = make();
    expect(sim.ctl).toBeInstanceOf(DriveMode);
    const p = player({ speed: 2.5, noise: 0.4 });
    const log: SimEvent[] = [];
    let behind = 0;
    let samples = 0;
    let minD = Infinity;
    for (let i = 0; i < 140 * 60; i++) {
      p.z -= 2.5 * DT; // north, towards the target
      log.push(...sim.update(DT, p));
      if (sim.time > 8) {
        for (const h of sim.hounds) {
          const d = Math.hypot(h.x - p.x, h.z - p.z);
          minD = Math.min(minD, d);
          samples++;
          if (h.z > p.z - 4) behind++; // south of (behind) the player or beside
        }
      }
      if (log.some((e) => e.type === 'goal')) break;
    }
    expect(sim.caught).toBeNull();
    expect(log.some((e) => e.type === 'goal')).toBe(true);
    expect(behind / samples).toBeGreaterThan(0.9);
    expect(minD).toBeGreaterThan(6);
    // horn from behind every 14–22 s
    expect(log.filter((e) => e.type === 'horn').length).toBeGreaterThanOrEqual(4);
  });

  it('turning back: they give way a little, then bring you home (soft catch)', () => {
    const sim = make(5);
    const p = player({ speed: 3, noise: 0.5 });
    run(sim, 20, () => {
      p.z -= 2 * DT;
      return p;
    });
    expect(sim.caught).toBeNull();
    const log: SimEvent[] = [];
    run(
      sim,
      40,
      () => {
        p.z += 3 * DT; // back south, through the line
        return p;
      },
      log,
      () => sim.caught !== null,
    );
    const c = log.find((e): e is Extract<SimEvent, { type: 'caught' }> => e.type === 'caught');
    expect(c?.soft).toBe(true);
  });
});

// =============================================================================================

describe('finale (W8 at the kennel)', () => {
  const world = flatWorld(() => false);
  const c = { x: 1216, z: -1571 };
  const make = (oneKey = false, seed = 2) => new PackSim(world, null, opts({ x: c.x, z: c.z, mode: 'finale', target: c, hounds: 5, seed, oneKey }), { x: c.x, z: c.z }, null, makeMode);
  const at = (o: Partial<PlayerSense> = {}) => player({ x: c.x, z: c.z, ...o });

  it('gathers in a circle, waits without time pressure, calms down with prone + lantern', () => {
    const sim = make();
    const ctl = sim.ctl as FinaleMode;
    const log = run(sim, 16, at());
    expect(log.some((e) => e.type === 'finale' && e.outcome === 'gathered')).toBe(true);
    for (const h of sim.hounds) expect(Math.abs(Math.hypot(h.x - c.x, h.z - c.z) - FINALE.circle)).toBeLessThan(0.8);
    // no time pressure: a minute standing, a minute lying without the light — nothing happens
    run(sim, 60, at(), log);
    run(sim, 60, at({ stance: 'prone' }), log);
    expect(ctl.phase).toBe('wait');
    expect(sim.caught).toBeNull();
    // the lantern: they lie down one by one, the eyes dim, then they fade
    run(sim, 1, at({ stance: 'prone', lanternLit: true }), log);
    expect(ctl.phase).toBe('calm');
    run(sim, FinaleMode.duration(5) + 1, at({ stance: 'prone', lanternLit: true }), log);
    expect(log.filter((e) => e.type === 'lie').length).toBe(5);
    const outcomes = log.filter((e) => e.type === 'finale').map((e) => (e as { outcome: string }).outcome);
    expect(outcomes).toEqual(['gathered', 'calmed', 'faded']);
    for (const a of sim.agents) expect(a.gone).toBe(1);
    expect(ctl.calm).toBe(1);
    expect(sim.alert).toBe(0);
  });

  it('the order does not matter: lantern first, then lying down', () => {
    const sim = make(false, 9);
    run(sim, 16, at({ lanternLit: true }));
    expect((sim.ctl as FinaleMode).phase).toBe('wait');
    run(sim, 1, at({ lanternLit: true, stance: 'prone' }));
    expect((sim.ctl as FinaleMode).phase).toBe('calm');
  });

  it('one key (accessibility / gentle): lying flat alone is enough', () => {
    const sim = make(true);
    const log = run(sim, 16, at());
    run(sim, 1, at({ stance: 'prone' }), log);
    expect(log.some((e) => e.type === 'finale' && e.outcome === 'calmed')).toBe(true);
  });

  it('running off brings you back into the circle', () => {
    const sim = make();
    const log = run(sim, 16, at());
    run(sim, 1, at({ x: c.x + 14, speed: 6 }), log);
    const r = log.find((e) => e.type === 'finale' && e.outcome === 'returned') as Extract<SimEvent, { type: 'finale' }> | undefined;
    expect(r).toBeDefined();
    expect(r!.x).toBe(c.x);
    expect(sim.caught).toBeNull();
  });

  it('switching a driving pack to the finale keeps the hounds where they are', () => {
    const sim = new PackSim(world, null, opts({ x: c.x, z: c.z + 200, mode: 'drive', target: c, hounds: 4 }), { x: c.x, z: c.z + 200 }, null, makeMode);
    const p = at({ z: c.z + 40, speed: 2 });
    run(sim, 10, p);
    const before = sim.hounds.map((h) => ({ x: h.x, z: h.z }));
    sim.switchMode({ mode: 'finale', target: c }, makeMode);
    expect(sim.ctl).toBeInstanceOf(FinaleMode);
    sim.hounds.forEach((h, i) => expect(Math.hypot(h.x - before[i]!.x, h.z - before[i]!.z)).toBeLessThan(0.01));
    const log = run(sim, 30, at());
    expect(log.some((e) => e.type === 'finale' && e.outcome === 'gathered')).toBe(true);
  });
});

// =============================================================================================

/**
 * Ch. 2 "Die Flucht" (Parforcejagd): simulated runs of a player who sprints for the water along
 * a winding route and side-steps the rider. Fairness targets (bible 03 §9): 60–90 s chase, a
 * sprinting player who keeps going escapes most of the time, a walker does not, breathers and a
 * rider from the flank happen in every run.
 */
describe('par force: long chase fairness (simulated runs)', () => {
  const world = flatWorld((x) => x >= 470 && x <= 500);
  const route = [
    { x: 120, z: -60 },
    { x: 260, z: 40 },
    { x: 485, z: 10 },
  ];

  function chase(seed: number, speed: number, intensity: number, gentle = false) {
    const o = opts({ x: 200, z: 0, radius: 400, intensity, hounds: 5, seed, sight: 15, gentle, mode: 'parforce', target: { x: 485, z: 10 }, from: { x: 0, z: -90 }, goalRadius: 20 });
    const sim = new PackSim(world, null, o, { x: 0, z: 0 }, null, makeMode);
    const ctl = sim.ctl as ParforceMode;
    let wi = 0;
    const p = player({ noise: 0.87, speed });
    const log: SimEvent[] = [];
    let t = 0;
    while (t < 200 && !sim.caught && ctl.phase !== 'escaped') {
      const w = route[wi]!;
      let dx = w.x - p.x;
      let dz = w.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 4 && wi < route.length - 1) wi++;
      dx /= d || 1;
      dz /= d || 1;
      const pk = sim.pikeur!;
      const pd = Math.hypot(pk.x - p.x, pk.z - p.z);
      if (pd < 16) {
        // side-step the rider
        const ax = (p.x - pk.x) / pd;
        const az = (p.z - pk.z) / pd;
        dx = dx * 0.4 + ax * 0.6;
        dz = dz * 0.4 + az * 0.6;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l;
        dz /= l;
      }
      p.x += dx * speed * DT;
      p.z += dz * speed * DT;
      log.push(...sim.update(DT, p));
      t += DT;
    }
    const horns = log.filter((e) => e.type === 'horn').map((e) => (e as { signal: string }).signal);
    return { escaped: ctl.phase === 'escaped', caught: !!sim.caught, dur: t - ctl.stats.releasedAt, rests: ctl.stats.rests, rideIns: ctl.stats.rideIns, minPikeur: ctl.stats.minPikeur, horns, log };
  }

  it('a sprinting player escapes most runs, in 60–90 s on average, with breathers and a rider', () => {
    const rs = Array.from({ length: 10 }, (_, i) => chase(100 + i, 6.2, 0.7));
    const esc = rs.filter((r) => r.escaped);
    expect(esc.length).toBeGreaterThanOrEqual(7);
    const mean = esc.reduce((s, r) => s + r.dur, 0) / esc.length;
    expect(mean).toBeGreaterThan(60);
    expect(mean).toBeLessThan(95);
    for (const r of esc) {
      expect(r.rests).toBeGreaterThanOrEqual(1);
      expect(r.rideIns).toBeGreaterThanOrEqual(1);
      // two short calls at the release, the hunt never calls itself off
      expect(r.horns[0]).toBe('found');
      const goal = r.log.findIndex((e) => e.type === 'goal');
      expect(goal).toBeGreaterThan(0);
      expect(r.log.slice(0, goal).some((e) => e.type === 'horn' && e.signal === 'call-off')).toBe(false);
    }
  });

  it('it is a real chase: walking gets you caught; the pack is not unbeatable at high intensity', () => {
    const walk = Array.from({ length: 6 }, (_, i) => chase(200 + i, 3.2, 0.7));
    expect(walk.filter((r) => r.caught).length).toBeGreaterThanOrEqual(5);
    const hard = Array.from({ length: 10 }, (_, i) => chase(100 + i, 6.2, 0.9));
    const n = hard.filter((r) => r.escaped).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThan(10);
  });

  it('gentle mode is kinder', () => {
    const normal = Array.from({ length: 6 }, (_, i) => chase(400 + i, 6.2, 0.85)).filter((r) => r.escaped).length;
    const gentle = Array.from({ length: 6 }, (_, i) => chase(400 + i, 6.2, 0.85, true)).filter((r) => r.escaped).length;
    expect(gentle).toBeGreaterThanOrEqual(normal);
    expect(gentle).toBeGreaterThanOrEqual(5);
  });
});

// =============================================================================================

describe('test story (content/test/hunt-menagerie.test.story.json)', () => {
  const story = JSON.parse(readFileSync(new URL('../content/test/hunt-menagerie.test.story.json', import.meta.url), 'utf8')) as StoryFile;

  it('is a valid story file (example beats for the chapter wiring)', () => {
    const r = validateStories([{ file: 'content/test/hunt-menagerie.test.story.json', story }]);
    expect(r.errors).toEqual([]);
  });

  it('threat actions carry the pack extras (mode, target, via, from …) through', () => {
    const threats = story.beats.flatMap((b) => b.enter ?? []).filter((a): a is ThreatAction => a.do === 'threat');
    expect(threats.map((t) => t.mode ?? 'patrol')).toEqual(['patrol', 'parforce', 'drive', 'finale']);
    const drive = threats.find((t) => t.mode === 'drive')!;
    expect(drive.target).toEqual({ x: 1216, z: -1571 });
    expect(drive.via?.length).toBe(1);
  });
});
