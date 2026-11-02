import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ParforceMode, makeMode } from '../src/systems/hunt/modes';
import type { PlayerSense } from '../src/systems/hunt/perception';
import { type PackOptions, PackSim, type SimWorld } from '../src/systems/hunt/sim';
import type { StoryFile, ThreatAction } from '../src/systems/story/types';

/**
 * Chapter 1's only real chase (bible 02 §9: "Die Seite am Rondell (1.12) ist der einzige Moment
 * echter Verfolgung, und das Tosbecken ist nur 160 m entfernt"): from the Tempelplatz steps down
 * to the Tosbecken. Simulated with the story file's own threat configuration on a flat meadow with
 * the basin as water. Tuning target: tense (the hounds close in, the player sees them) but won on
 * the first try by an average player — one who needs a moment to get up, runs a slightly crooked
 * line, slows on the stairs and looks back once; gentle mode forgives a real stop.
 */
const DT = 1 / 60;

const story = JSON.parse(readFileSync(new URL('../content/story/01-kapitel-1.story.json', import.meta.url), 'utf8')) as StoryFile;
const chaseCfg = (): ThreatAction => {
  const b = story.beats.find((x) => x.id === 'k1_14')!;
  const a = b.on!.flatMap((r) => r.do).find((x) => x.do === 'threat') as ThreatAction;
  return a;
};

/** Tempelplatz steps (the page) → the Tosbecken; the basin is water. */
const START = { x: 1811, z: 363 };
const BASIN = { x: 1812, z: 203 };
const world: SimWorld = {
  heightAt: () => 300,
  surfaceAt: (x, z) => (Math.hypot(x - BASIN.x, z - BASIN.z) < 14 ? 'water' : 'meadow'),
  coverAt: () => 0,
  bounds: () => ({ x0: 1000, z0: -500, x1: 2600, z1: 1200 }),
  trailBreakAt: () => null,
};

interface Player {
  /** Seconds standing still at the start (getting up, finding the way). */
  wake: number;
  /** Running speed on the way (stairs and slope slow you below the 6.2 m/s sprint). */
  speed: number;
  /** Sideways wobble of the line (m): a crooked route is longer. */
  wobble: number;
  /** One look back: stop for `stop` s when `at` (0..1) of the way is done. */
  stop?: { at: number; s: number };
}

function chase(seed: number, pl: Player, gentle = false) {
  const c = chaseCfg();
  const o: PackOptions = {
    x: c.center!.x,
    z: c.center!.z,
    radius: c.radius!,
    intensity: c.intensity!,
    hounds: c.hounds as number,
    pikeur: c.pikeur as boolean,
    seed,
    sight: c.sight as number,
    beacon: 65,
    gentle,
    rauhnacht: false,
    mode: 'parforce',
    target: c.target as { x: number; z: number },
    from: c.from as { x: number; z: number },
    goalRadius: c.goalRadius as number,
    headStart: c.headStart as number,
    heel: c.heel,
    burst: c.burst,
    keepPace: c.keepPace,
  };
  const sim = new PackSim(world, null, o, START, null, makeMode);
  const ctl = sim.ctl as ParforceMode;
  const p: PlayerSense = { x: START.x, y: 300, z: START.z, stance: 'stand', noise: 0.87, visibility: 1, lanternLit: true, speed: 0, flying: false };
  const total = Math.hypot(BASIN.x - START.x, BASIN.z - START.z);
  let t = 0;
  let stopped = 0;
  let minGap = Infinity;
  while (t < 120 && !sim.caught && ctl.phase !== 'escaped') {
    const done = 1 - Math.hypot(BASIN.x - p.x, BASIN.z - p.z) / total;
    let v = pl.speed;
    if (t < pl.wake) v = 0;
    else if (pl.stop && done >= pl.stop.at && stopped < pl.stop.s) {
      v = 0;
      stopped += DT;
    }
    const dx = BASIN.x - p.x;
    const dz = BASIN.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    // a crooked line: sideways drift that comes and goes
    const side = Math.sin(t * 0.9 + seed) * pl.wobble * 0.12;
    p.x += ((dx / d) * v + side * v * 0.15) * DT;
    p.z += (dz / d) * v * DT;
    p.speed = v;
    sim.update(DT, p);
    if (ctl.phase === 'hunt') for (const h of sim.hounds) minGap = Math.min(minGap, Math.hypot(h.x - p.x, h.z - p.z));
    t += DT;
  }
  const r = { escaped: ctl.phase === 'escaped', caught: !!sim.caught, t, minGap };
  return r;
}

const AVERAGE: Player = { wake: 2.5, speed: 5.6, wobble: 6, stop: { at: 0.45, s: 1.5 } };

describe('chapter 1: the chase from the Rondell to the Tosbecken', () => {
  it('the story configures a short par force chase without a rider', () => {
    const c = chaseCfg();
    expect(c.mode).toBe('parforce');
    expect(c.pikeur).toBe(false);
    expect(c.hounds).toBe(3);
    // they come out of the release hard and then hold the gap behind a runner
    expect(c.keepPace).toBe(true);
    expect(c.burst).toBeGreaterThan(1);
  });

  it('an average player escapes on the first try (≥ 9 of 10 runs), but the hounds come close', () => {
    const rs = Array.from({ length: 10 }, (_, i) => chase(500 + i, AVERAGE));
    expect(rs.filter((r) => r.escaped).length).toBeGreaterThanOrEqual(9);
    // tense: in most runs a hound gets within 12 m
    expect(rs.filter((r) => r.minGap < 12).length).toBeGreaterThanOrEqual(5);
  });

  it('a slower runner (stairs, a crooked line, a late start) still makes it', () => {
    const slower: Player = { wake: 3.5, speed: 5.1, wobble: 9, stop: { at: 0.5, s: 1.5 } };
    const rs = Array.from({ length: 8 }, (_, i) => chase(550 + i, slower));
    expect(rs.filter((r) => r.escaped).length).toBeGreaterThanOrEqual(7);
  });

  it('it is still a chase: walking, or standing around, gets you caught', () => {
    const walk = Array.from({ length: 6 }, (_, i) => chase(600 + i, { wake: 1, speed: 3.2, wobble: 0 }));
    expect(walk.filter((r) => r.caught).length).toBeGreaterThanOrEqual(5);
    const dawdle = Array.from({ length: 6 }, (_, i) => chase(650 + i, { ...AVERAGE, stop: { at: 0.4, s: 7 } }));
    expect(dawdle.filter((r) => r.caught).length).toBeGreaterThanOrEqual(4);
  });

  it('gentle mode is noticeably easier: even a long stop is forgiven', () => {
    const slow = { wake: 4, speed: 4.6, wobble: 8, stop: { at: 0.4, s: 5 } };
    const normal = Array.from({ length: 6 }, (_, i) => chase(700 + i, slow)).filter((r) => r.escaped).length;
    const gentle = Array.from({ length: 6 }, (_, i) => chase(700 + i, slow, true)).filter((r) => r.escaped).length;
    expect(gentle).toBeGreaterThanOrEqual(5);
    expect(gentle).toBeGreaterThan(normal);
  });
});
