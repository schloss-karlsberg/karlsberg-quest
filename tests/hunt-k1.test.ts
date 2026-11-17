import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ParforceMode, StandMode, makeMode } from '../src/systems/hunt/modes';
import type { PlayerSense } from '../src/systems/hunt/perception';
import { Rng } from '../src/systems/hunt/rng';
import { LUNGE, type PackOptions, PackSim, type SimWorld, type XZ } from '../src/systems/hunt/sim';
import type { StoryFile, ThreatAction } from '../src/systems/story/types';

/**
 * Chapter 1's finale, "Die Parforcejagd" (docs/ACTION-RPG.md §11.1): eight hounds and the Pikeur
 * far up on the flank chase you from the Tempelplatz down the cascade; two of them run ahead on the
 * flanks and lunge (crouch + growl + eyes = the telegraph, a dodge roll beats it, a bite costs
 * ground, the third bite ends it); at the narrows the pack stands you (a ring, two across the way
 * out) while the strays come in two waves; then the ring breaks and it is sixty metres to the
 * Tosbecken. Simulated with the story file's own threat configurations on a flat meadow with the
 * basin as water. Tuning target: tense (hounds close, lunges every few seconds) but won on the first
 * try by an average player — one who needs a moment to get up, runs a slightly crooked line, looks
 * back once and dodges about half of the lunges; gentle mode forgives a real stop and no dodging.
 */
const DT = 1 / 60;

const story = JSON.parse(readFileSync(new URL('../content/story/01-kapitel-1.story.json', import.meta.url), 'utf8')) as StoryFile;
const threatOf = (beat: string): ThreatAction => {
  const b = story.beats.find((x) => x.id === beat)!;
  return [...(b.enter ?? []), ...(b.on ?? []).flatMap((r) => r.do)].find((x) => x.do === 'threat' && (x as ThreatAction).active) as ThreatAction;
};

/** Tempelplatz steps (the page) → the narrows → the Tosbecken; the basin is water. */
const START = { x: 1811, z: 363 };
const BASIN = { x: 1812, z: 203 };
const world: SimWorld = {
  heightAt: () => 300,
  surfaceAt: (x, z) => (Math.hypot(x - BASIN.x, z - BASIN.z) < 14 ? 'water' : 'meadow'),
  coverAt: () => 0,
  bounds: () => ({ x0: 1000, z0: -500, x1: 2600, z1: 1200 }),
  trailBreakAt: () => null,
};

function optsOf(c: ThreatAction, seed: number, gentle: boolean): PackOptions {
  const x = c as unknown as Record<string, unknown>;
  return {
    x: c.center!.x,
    z: c.center!.z,
    radius: c.radius!,
    intensity: c.intensity!,
    hounds: x.hounds as number,
    pikeur: x.pikeur as boolean,
    seed,
    sight: x.sight as number,
    beacon: 65,
    gentle,
    rauhnacht: false,
    mode: x.mode as PackOptions['mode'],
    target: x.target as XZ,
    from: x.from as XZ,
    goalRadius: x.goalRadius as number,
    headStart: x.headStart as number,
    heel: x.heel as number,
    burst: x.burst as number,
    keepPace: x.keepPace as boolean,
    flankers: x.flankers as number,
    lunges: x.lunges as boolean,
    pikeurFar: x.pikeurFar as number,
  };
}

interface Player {
  /** Seconds standing still at the start (getting up, finding the way). */
  wake: number;
  /** Running speed on the way (stairs and slope slow you below the 6.2 m/s sprint). */
  speed: number;
  /** Sideways wobble of the line (m): a crooked route is longer. */
  wobble: number;
  /** One look back: stop for `stop` s when `at` (0..1) of the way is done. */
  stop?: { at: number; s: number };
  /** Share of lunges answered with a dodge roll in time. */
  dodge: number;
}

interface Run {
  escaped: boolean;
  caught: boolean;
  t: number;
  minGap: number;
  lunges: number;
  bites: number;
  p: PlayerSense;
}

/** Run from `from` to `goal` (arrival radius r) with the pack in `sim`; lunges answered by `pl.dodge`. */
function run(sim: PackSim, from: XZ, goal: XZ, r: number, pl: Player, seed: number): Run {
  const rng = new Rng(seed * 7 + 3);
  const p: PlayerSense = { x: from.x, y: 300, z: from.z, stance: 'stand', noise: 0.87, visibility: 1, lanternLit: true, speed: 0, flying: false, dodging: false };
  const total = Math.hypot(goal.x - from.x, goal.z - from.z);
  let t = 0;
  let stopped = 0;
  let minGap = Infinity;
  let stumble = 0;
  let bites = 0;
  let lunges = 0;
  const dodges: [number, number][] = [];
  const done = () => Math.hypot(goal.x - p.x, goal.z - p.z) < r;
  while (t < 90 && !sim.caught && !done()) {
    const prog = 1 - Math.hypot(goal.x - p.x, goal.z - p.z) / total;
    let v = pl.speed;
    if (t < pl.wake || stumble > 0) v = 0;
    else if (pl.stop && prog >= pl.stop.at && stopped < pl.stop.s) {
      v = 0;
      stopped += DT;
    }
    stumble = Math.max(0, stumble - DT);
    const dx = goal.x - p.x;
    const dz = goal.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const side = Math.sin(t * 0.9 + seed) * pl.wobble * 0.12;
    p.x += ((dx / d) * v + side * v * 0.15) * DT;
    p.z += (dz / d) * v * DT;
    p.speed = v;
    p.dodging = dodges.some(([a, b]) => t >= a && t <= b);
    for (const e of sim.update(DT, p)) {
      if (e.type === 'lunge' && e.phase === 'wind') {
        lunges++;
        // a reaction: the roll's i-frames cover the leap
        if (rng.next() < pl.dodge) dodges.push([t + LUNGE.wind - 0.05, t + LUNGE.wind + 0.32]);
      }
      if (e.type === 'bite') {
        bites++;
        // pulled off the line: a stumble and a shove
        stumble = 0.3;
        p.x += -e.dz * 1.2;
        p.z += e.dx * 1.2 - 0.6 * Math.sign(dz);
      }
    }
    for (const h of sim.hounds) minGap = Math.min(minGap, Math.hypot(h.x - p.x, h.z - p.z));
    t += DT;
  }
  return { escaped: done() && !sim.caught, caught: !!sim.caught, t, minGap, lunges, bites, p };
}

const chaseCfg = () => threatOf('k1_14');
const standCfg = () => threatOf('k1_14b');
const dashCfg = () => threatOf('k1_14c');
const NARROWS = () => (standCfg() as unknown as { target: XZ }).target;

function chase(seed: number, pl: Player, gentle = false): Run {
  const sim = new PackSim(world, null, optsOf(chaseCfg(), seed, gentle), START, null, makeMode);
  return run(sim, START, NARROWS(), 9, pl, seed);
}

/** The stand (engaged at the narrows), then the dash from the same pack. */
function stand(seed: number, gentle = false): PackSim {
  const n = NARROWS();
  const sim = new PackSim(world, null, optsOf(standCfg(), seed, gentle), n, null, makeMode);
  const p: PlayerSense = { x: n.x, y: 300, z: n.z, stance: 'stand', noise: 0.6, visibility: 1, lanternLit: true, speed: 0, flying: false };
  for (let i = 0; i < 5 * 60; i++) sim.update(DT, p);
  return sim;
}
function dash(seed: number, pl: Player, gentle = false): Run {
  const sim = stand(seed, gentle);
  const c = dashCfg() as unknown as Record<string, unknown>;
  sim.switchMode({ mode: 'parforce', target: c.target as XZ, from: c.from as XZ, headStart: c.headStart as number, goalRadius: c.goalRadius as number, pikeurFar: c.pikeurFar as number, flankers: c.flankers as number }, makeMode);
  return run(sim, NARROWS(), BASIN, 12, { ...pl, wake: 0.3 }, seed);
}

const AVERAGE: Player = { wake: 2.5, speed: 5.6, wobble: 6, stop: { at: 0.45, s: 1.2 }, dodge: 0.5 };

describe('chapter 1 finale: the par force hunt down the cascade', () => {
  it('the story stages a real pack: eight hounds, the rider far off, flankers and lunges', () => {
    const c = chaseCfg() as unknown as Record<string, unknown>;
    expect(c.mode).toBe('parforce');
    expect(c.hounds).toBeGreaterThanOrEqual(8);
    expect(c.pikeur).toBe(true);
    expect(c.pikeurFar).toBeGreaterThanOrEqual(30);
    expect(c.flankers).toBe(2);
    expect(c.lunges).toBe(true);
    // they come out of the release hard and then hold the gap behind a runner
    expect(c.keepPace).toBe(true);
    expect(c.burst).toBeGreaterThan(1);
    // the stand and the dash re-configure the same pack in place (no hounds popping in)
    for (const k of [standCfg(), dashCfg()]) {
      expect(k.center).toEqual(chaseCfg().center);
      expect(k.radius).toBe(chaseCfg().radius);
    }
    expect((standCfg() as unknown as { mode: string }).mode).toBe('stand');
  });

  it('the chase: an average player reaches the narrows on the first try, with lunges to answer', () => {
    const rs = Array.from({ length: 10 }, (_, i) => chase(500 + i, AVERAGE));
    if (process.env.K1_DEBUG) console.log(rs.map((r) => [r.escaped, r.caught, r.t.toFixed(1), r.minGap.toFixed(1), r.lunges, r.bites].join(" ")));
    expect(rs.filter((r) => r.escaped).length).toBeGreaterThanOrEqual(9);
    // tense: hounds come close and they spring at you
    expect(rs.filter((r) => r.minGap < 8).length).toBeGreaterThanOrEqual(7);
    expect(rs.reduce((n, r) => n + r.lunges, 0)).toBeGreaterThanOrEqual(10);
    expect(rs.filter((r) => r.bites > 0).length).toBeGreaterThanOrEqual(3);
  });

  it('a slower runner who never dodges still makes it (the bites cost ground, not the run)', () => {
    const slower: Player = { wake: 3.5, speed: 5.1, wobble: 9, stop: { at: 0.5, s: 1.2 }, dodge: 0 };
    const rs = Array.from({ length: 8 }, (_, i) => chase(550 + i, slower));
    if (process.env.K1_DEBUG) console.log(rs.map((r) => [r.escaped, r.caught, r.t.toFixed(1), r.minGap.toFixed(1), r.lunges, r.bites].join(" ")));
    expect(rs.filter((r) => r.escaped).length).toBeGreaterThanOrEqual(6);
  });

  it('it is still a chase: walking, or standing around, gets you caught', () => {
    const walk = Array.from({ length: 6 }, (_, i) => chase(600 + i, { wake: 1, speed: 3.2, wobble: 0, dodge: 0.5 }));
    expect(walk.filter((r) => r.caught).length).toBeGreaterThanOrEqual(5);
    const dawdle = Array.from({ length: 6 }, (_, i) => chase(650 + i, { ...AVERAGE, stop: { at: 0.4, s: 7 } }));
    expect(dawdle.filter((r) => r.caught).length).toBeGreaterThanOrEqual(4);
  });

  it('the stand holds you without a catch while you fight in the ring; breaking out is punished', () => {
    for (let seed = 0; seed < 4; seed++) {
      const sim = stand(800 + seed);
      expect(sim.ctl).toBeInstanceOf(StandMode);
      expect((sim.ctl as StandMode).engaged).toBe(true);
      // forty seconds of fighting in the ring: stepping about, never far
      const n = NARROWS();
      const p: PlayerSense = { x: n.x, y: 300, z: n.z, stance: 'stand', noise: 0.8, visibility: 1, lanternLit: true, speed: 2, flying: false };
      for (let i = 0; i < 40 * 60; i++) {
        p.x = n.x + Math.sin(i / 90) * 4;
        p.z = n.z + Math.cos(i / 130) * 4;
        sim.update(DT, p);
      }
      expect(sim.caught).toBeNull();
      expect(sim.lungeStats.started).toBe(0);
      // all eight stay out in the ring (none on top of you)
      for (const h of sim.hounds) expect(Math.hypot(h.x - p.x, h.z - p.z)).toBeGreaterThan(5);
    }
    // standing at the ring's back edge (where you arrive from the cascade) and being shoved about by
    // the strays' blows is not slipping away: no lunge while you step back in
    {
      const n = NARROWS();
      const sim = new PackSim(world, null, optsOf(standCfg(), 850, false), n, null, makeMode);
      const p: PlayerSense = { x: n.x, y: 300, z: n.z + 9, stance: 'stand', noise: 0.8, visibility: 1, lanternLit: true, speed: 0, flying: false };
      for (let i = 0; i < 10 * 60; i++) sim.update(DT, p);
      expect((sim.ctl as StandMode).engaged).toBe(true);
      for (let i = 0; i < 3 * 60; i++) {
        p.z -= 1.5 * DT;
        sim.update(DT, p);
      }
      expect(sim.lungeStats.started).toBe(0);
    }
    // run back up the slope through them: lunges, then the pack has you
    const sim = stand(900);
    const n = NARROWS();
    const p: PlayerSense = { x: n.x, y: 300, z: n.z, stance: 'stand', noise: 0.9, visibility: 1, lanternLit: true, speed: 5, flying: false };
    for (let i = 0; i < 20 * 60 && !sim.caught; i++) {
      p.z += 5 * DT;
      sim.update(DT, p);
    }
    expect(sim.caught).not.toBeNull();
    expect(sim.lungeStats.started).toBeGreaterThanOrEqual(1);
  });

  it('the dash: the ring breaks and an average player reaches the water', () => {
    const rs = Array.from({ length: 10 }, (_, i) => dash(700 + i, AVERAGE));
    if (process.env.K1_DEBUG) console.log(rs.map((r) => [r.escaped, r.caught, r.t.toFixed(1), r.minGap.toFixed(1), r.lunges, r.bites].join(" ")));
    expect(rs.filter((r) => r.escaped).length).toBeGreaterThanOrEqual(9);
    expect(rs.every((r) => (r as Run).t < 30)).toBe(true);
    const sim = stand(777);
    sim.switchMode({ mode: 'parforce', target: BASIN, headStart: 1.5 }, makeMode);
    expect(sim.ctl).toBeInstanceOf(ParforceMode);
  });

  it('the dash from the ring\'s back edge (where the cascade path arrives): the hounds at your heels fall back', () => {
    const rs = Array.from({ length: 6 }, (_, i) => {
      const n = NARROWS();
      const edge = { x: n.x + 1, z: n.z + 9 };
      const sim = new PackSim(world, null, optsOf(standCfg(), 760 + i, false), n, null, makeMode);
      const p: PlayerSense = { x: edge.x, y: 300, z: edge.z, stance: 'stand', noise: 0.6, visibility: 1, lanternLit: true, speed: 0, flying: false };
      for (let k = 0; k < 20 * 60; k++) sim.update(DT, p);
      const c = dashCfg() as unknown as Record<string, unknown>;
      sim.switchMode({ mode: 'parforce', target: c.target as XZ, from: c.from as XZ, headStart: c.headStart as number, goalRadius: c.goalRadius as number, pikeurFar: c.pikeurFar as number, flankers: c.flankers as number }, makeMode);
      // a straight sprint, no dodging (the e2e walker)
      return run(sim, edge, BASIN, 12, { wake: 0.2, speed: 6.2, wobble: 0, dodge: 0 }, 760 + i);
    });
    if (process.env.K1_DEBUG) console.log(rs.map((r) => [r.escaped, r.caught, r.t.toFixed(1), r.minGap.toFixed(1), r.lunges, r.bites].join(' ')));
    expect(rs.filter((r) => r.escaped).length).toBeGreaterThanOrEqual(5);
  });

  it('gentle mode is noticeably easier: a long stop and no dodging are forgiven', () => {
    const slow: Player = { wake: 4, speed: 4.6, wobble: 8, stop: { at: 0.4, s: 5 }, dodge: 0 };
    const normal = Array.from({ length: 6 }, (_, i) => chase(720 + i, slow)).filter((r) => r.escaped).length;
    const gentle = Array.from({ length: 6 }, (_, i) => chase(720 + i, slow, true)).filter((r) => r.escaped).length;
    if (process.env.K1_DEBUG) console.log(Array.from({ length: 6 }, (_, i) => chase(720 + i, slow, true)).map((r) => [r.escaped, r.caught, r.t.toFixed(1), r.minGap.toFixed(1), r.lunges, r.bites].join(" ")));
    expect(gentle).toBeGreaterThanOrEqual(5);
    expect(gentle).toBeGreaterThan(normal);
  });
});
