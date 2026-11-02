import { describe, expect, it } from 'vitest';
import type { PlayerSense } from '../src/systems/hunt/perception';
import { makeMode } from '../src/systems/hunt/modes';
import { type PackOptions, PackSim, type SimWorld } from '../src/systems/hunt/sim';
import { TrackField } from '../src/systems/hunt/tracks';

/**
 * Chapter 2 additions to the hunt: the Warner's trail in the hoarfrost (someone else's prints),
 * the scent line that takes a chasing hound round a wall instead of into it, and the W4 hold
 * (a frozen pack never catches).
 */
const DT = 1 / 60;

/** Flat meadow at 300 m with one thin wall x ∈ [−1, 1], z ∈ [−20, 20]. */
function walledWorld(): SimWorld {
  const inWall = (x: number, z: number, r: number) => Math.abs(x) < 1 + r && Math.abs(z) < 20 + r;
  return {
    heightAt: () => 300,
    surfaceAt: () => 'meadow',
    coverAt: () => 0,
    bounds: () => ({ x0: -3000, z0: -3000, x1: 3000, z1: 3000 }),
    trailBreakAt: () => null,
    collide: (x, z, r) => {
      if (!inWall(x, z, r)) return { x, z };
      // out on the nearer side
      const dx = (x < 0 ? -1 - r : 1 + r) - x;
      const dz = (z < 0 ? -20 - r : 20 + r) - z;
      return Math.abs(dx) < Math.abs(dz) ? { x: x + dx, z } : { x, z: z + dz };
    },
  };
}

function player(o: Partial<PlayerSense> = {}): PlayerSense {
  return { x: 0, y: 300, z: 0, stance: 'stand', noise: 0, visibility: 1, lanternLit: false, speed: 0, flying: false, ...o };
}

function opts(o: Partial<PackOptions> = {}): PackOptions {
  return { x: -30, z: 0, radius: 300, intensity: 0.7, hounds: 4, pikeur: false, seed: 11, sight: 15, beacon: 65, gentle: false, rauhnacht: false, ...o };
}

describe('the Warner’s trail (TrackField.addTrail)', () => {
  it('lays alternating boot prints along a path, skips ground that takes none, and never counts as the player’s trail', () => {
    const T = new TrackField();
    const n = T.addTrail(
      [
        { x: 0, z: 0 },
        { x: 0, z: -30 },
        { x: 20, z: -30 },
      ],
      0,
      1.5,
      0.9,
      600,
      (x) => x < 10, // "water" beyond x = 10
    );
    expect(n).toBeGreaterThan(20);
    expect(T.prints.every((p) => p.kind === 'boot' && p.agent === -2 && p.seg === -1)).toBe(true);
    expect(T.prints.every((p) => p.x < 10)).toBe(true);
    // feet alternate left / right of the line
    expect(new Set(T.prints.slice(0, 6).map((p) => Math.sign(p.x)))).toEqual(new Set([-1, 1]));
    // the hold keeps them fresh: still there long after the normal life
    T.tick(T.life + 100);
    T.prune();
    expect(T.prints.length).toBe(n);
    // the pack never mistakes them for the player's trail
    expect(T.playerPrintNear(0, -10, 5, T.now)).toBeNull();
  });
});

describe('the scent line: chasing round a wall', () => {
  /** The player runs from the pack's side round the wall's end and stops behind it. */
  const path = [
    { x: -12, z: 0 },
    { x: -12, z: 26 },
    { x: 12, z: 26 },
    { x: 12, z: 0 },
  ];
  function at(t: number): PlayerSense {
    const speed = 6.2;
    let s = t * speed;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (s <= d) return player({ x: a.x + ((b.x - a.x) * s) / d, z: a.z + ((b.z - a.z) * s) / d, speed, noise: 1 });
      s -= d;
    }
    return player({ x: 12, z: 0, speed: 0 });
  }

  it('a hound pressed against the wall follows where the player went and closes in behind it', () => {
    const sim = new PackSim(walledWorld(), null, opts({ mode: 'parforce', headStart: 1, from: { x: -30, z: 0 } }), { x: -12, z: 30 }, null, makeMode);
    // the pack held back (frozen) while the player runs round the wall's end and stops behind it
    sim.frozen = true;
    for (let i = 0; i < 14 / DT; i++) sim.update(DT, at(sim.time));
    expect(sim.scent.length).toBeGreaterThan(20);
    sim.frozen = false;
    // he keeps panting behind it: heard, never seen
    const p = player({ x: 12, z: 0, speed: 2, noise: 1, visibility: 0 });
    let usedLine = false;
    let minD = Infinity;
    for (let i = 0; i < 40 / DT && !sim.caught; i++) {
      sim.update(DT, p);
      if (sim.agents.some((a) => a.scentI >= 0)) usedLine = true;
      for (const a of sim.hounds) minD = Math.min(minD, Math.hypot(a.x - p.x, a.z - p.z));
    }
    expect(usedLine).toBe(true);
    // without the line they would stand at x = −1 behind the wall, 13 m away for ever
    expect(sim.caught !== null || minD < 5).toBe(true);
  });

  it('a frozen pack (W4 hold) does not catch', () => {
    const sim = new PackSim(walledWorld(), null, opts({ x: 30, z: 80, mode: 'parforce', headStart: 0.5, from: { x: 30, z: 80 }, target: { x: 0, z: 2000 } }), { x: 30, z: 82 }, null, makeMode);
    const p = player({ x: 30, z: 84, speed: 0 });
    sim.frozen = true;
    for (let i = 0; i < 8 / DT; i++) sim.update(DT, p);
    expect(sim.caught).toBeNull();
    // let go: they have him in seconds
    sim.frozen = false;
    for (let i = 0; i < 8 / DT && !sim.caught; i++) sim.update(DT, p);
    expect(sim.caught).not.toBeNull();
  });
});
