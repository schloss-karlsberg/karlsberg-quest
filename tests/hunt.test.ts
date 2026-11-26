import { describe, expect, it } from 'vitest';
import { PathGraph } from '../src/systems/hunt/graph';
import { burnSeconds, drain, newLantern, refill, toggle } from '../src/systems/hunt/lanternLogic';
import { type PlayerSense, hearRange, hollowness, lineOfSight, sightRange } from '../src/systems/hunt/perception';
import { Rng } from '../src/systems/hunt/rng';
import { type HornSignal, type PackOptions, PackSim, type SimEvent, type SimWorld, headingTo } from '../src/systems/hunt/sim';

/**
 * Synthetic 600 × 600 m world, flat at 300 m:
 *  - a 6 m high ridge along x = 100 (z −50…50)
 *  - a 3 m deep hollow way along z = −150 (x −200…200), 6 m wide
 *  - a water band x ∈ [180, 200]
 *  - forest for x < −150
 */
const world: SimWorld = {
  heightAt(x, z) {
    let h = 300;
    if (Math.abs(x - 100) < 3 && Math.abs(z) < 50) h += 6 * (1 - Math.abs(x - 100) / 3);
    const dz = Math.abs(z + 150);
    if (Math.abs(x) < 200 && dz < 5) h -= dz < 3 ? 3 : 3 * (1 - (dz - 3) / 2);
    return h;
  },
  surfaceAt(x) {
    return x >= 180 && x <= 200 ? 'water' : x < -150 ? 'forest' : 'meadow';
  },
  coverAt(x) {
    return x < -150 ? 1 : 0;
  },
  bounds: () => ({ x0: -300, z0: -300, x1: 300, z1: 300 }),
};

/** Grid path graph, 20 m spacing over ±240 m. */
function gridGraph(): PathGraph {
  const nodes: number[] = [];
  const edges: number[] = [];
  const N = 25;
  const id = (i: number, j: number) => i * N + j;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) nodes.push(-240 + j * 20, 300, -240 + i * 20);
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      if (j + 1 < N) edges.push(id(i, j), id(i, j + 1), 0, 20);
      if (i + 1 < N) edges.push(id(i, j), id(i + 1, j), 0, 20);
    }
  return new PathGraph({ nodes, edges });
}
const graph = gridGraph();

function player(o: Partial<PlayerSense> = {}): PlayerSense {
  return { x: 0, y: 300, z: 0, stance: 'stand', noise: 0, visibility: 1, lanternLit: false, speed: 0, flying: false, ...o };
}

function opts(o: Partial<PackOptions> = {}): PackOptions {
  return { x: 0, z: 0, radius: 150, intensity: 0.5, hounds: 4, pikeur: true, seed: 7, sight: 30, beacon: 40, gentle: false, rauhnacht: false, ...o };
}

const DT = 1 / 60;
function run(sim: PackSim, seconds: number, p: PlayerSense | ((t: number) => PlayerSense), log: SimEvent[] = []): SimEvent[] {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    const pp = typeof p === 'function' ? p(sim.time) : p;
    if (pp.y === 300) pp.y = world.heightAt(pp.x, pp.z);
    log.push(...sim.update(DT, pp));
    if (sim.caught) break;
  }
  return log;
}
const horns = (log: SimEvent[]) => log.filter((e): e is Extract<SimEvent, { type: 'horn' }> => e.type === 'horn').map((e) => e.signal as HornSignal);

/** Put the whole pack 'dist' m north of the player, looking at it. */
function packInFront(sim: PackSim, p: PlayerSense, dist: number) {
  sim.agents.forEach((a, i) => sim.place(i, p.x + (i - 2) * 1.5, p.z - dist - (a.kind === 'pikeur' ? 4 : 0), headingTo(0, 1)));
}

describe('hunt: rng + graph', () => {
  it('rng is deterministic per seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const sa = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(sa);
    expect(sa.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('builds adjacency, finds nearest nodes and A* paths', () => {
    expect(graph.size).toBe(625);
    const a = graph.nearest(-239, -241);
    const b = graph.nearest(239, 241);
    expect(graph.xs[a]).toBe(-240);
    const path = graph.findPath(a, b)!;
    expect(path[0]).toBe(a);
    expect(path.at(-1)).toBe(b);
    expect(path.length).toBe(49); // Manhattan on a grid: 48 steps
    // forbidding the middle column forces nothing impossible but a detour
    const blocked = graph.findPath(a, b, (i) => graph.xs[i] !== 0 || graph.zs[i] === 240);
    expect(blocked).not.toBeNull();
    expect(blocked!.some((i) => graph.xs[i] === 0 && graph.zs[i] === 240)).toBe(true);
  });
});

describe('hunt: perception', () => {
  it('terrain blocks the line of sight, forest attenuates it', () => {
    expect(lineOfSight(world, 80, 300.75, 0, 120, 301.45, 0)).toBe(0); // ridge between
    expect(lineOfSight(world, 80, 300.75, 80, 120, 301.45, 80)).toBe(1); // open meadow
    const forest = lineOfSight(world, -160, 300.75, 0, -200, 301.45, 0);
    expect(forest).toBeGreaterThan(0);
    expect(forest).toBeLessThan(0.5);
  });

  it('hollow ways and lying flat strongly reduce detection', () => {
    expect(hollowness(world, 0, -150)).toBeGreaterThan(0.7);
    expect(hollowness(world, 0, 100)).toBe(0);
    const tune = { sight: 30, beacon: 40, hearing: 34, acuity: 1 };
    const stand = sightRange(player(), tune, 0);
    const prone = sightRange(player({ stance: 'prone', visibility: 0.22 }), tune, 0);
    const lit = sightRange(player({ lanternLit: true, visibility: 1 }), tune, 0);
    expect(stand).toBeCloseTo(30, 0);
    expect(prone).toBeLessThan(5);
    expect(lit).toBeGreaterThan(65);
    expect(sightRange(player(), tune, 1)).toBeLessThan(stand * 0.5);
    // hearing: walking ≈ 15 m, running ≈ 30 m, prone ≈ 0, wading is loud, hollow way halves it
    expect(hearRange(player({ noise: 0.45 }), tune, 0, false)).toBeCloseTo(15.3, 0);
    expect(hearRange(player({ noise: 0.87 }), tune, 0, false)).toBeGreaterThan(28);
    expect(hearRange(player({ noise: 0.0 }), tune, 0, false)).toBe(0);
    expect(hearRange(player({ noise: 0.1, speed: 1 }), tune, 0, true)).toBeGreaterThan(20);
    expect(hearRange(player({ noise: 0.87 }), tune, 1, false)).toBeLessThan(16);
  });
});

describe('hunt: pack simulation', () => {
  it('is deterministic: same seed + same inputs ⇒ same state', () => {
    const script = (t: number) => player({ x: Math.sin(t) * 20, z: 60 + t * 2, noise: 0.4, speed: 2 });
    const a = new PackSim(world, graph, opts(), { x: 0, z: 60 });
    const b = new PackSim(world, graph, opts(), { x: 0, z: 60 });
    run(a, 20, script);
    run(b, 20, script);
    expect(a.snapshot()).toEqual(b.snapshot());
    const c = new PackSim(world, graph, opts({ seed: 8 }), { x: 0, z: 60 });
    run(c, 20, script);
    expect(c.snapshot()).not.toEqual(a.snapshot());
  });

  it('spawns up to 10 hounds (+ Pikeur) away from the player and patrols inside the area', () => {
    const sim = new PackSim(world, graph, opts({ hounds: 12, pikeur: true }), { x: 0, z: 0 });
    expect(sim.hounds.length).toBe(10);
    expect(sim.pikeur).not.toBeNull();
    expect(Math.hypot(sim.leader.x, sim.leader.z)).toBeGreaterThan(40);
    const start = sim.agents.map((a) => [a.x, a.z]);
    // player far outside, silent
    const far = player({ x: 280, z: 280 });
    run(sim, 60, far);
    expect(sim.state).toBe('calm');
    const moved = sim.agents.map((a, i) => Math.hypot(a.x - start[i]![0]!, a.z - start[i]![1]!));
    expect(Math.max(...moved)).toBeGreaterThan(10);
    for (const a of sim.agents) expect(Math.hypot(a.x, a.z)).toBeLessThan(150 * 1.3);
    const only3 = new PackSim(world, graph, opts({ hounds: 3, pikeur: false }), { x: 0, z: 0 });
    expect(only3.agents.length).toBe(3);
    expect(only3.pikeur).toBeNull();
  });

  it('announces itself with the horn (Anblasen = search)', () => {
    const sim = new PackSim(world, graph, opts(), { x: 0, z: 0 });
    expect(horns(sim.update(DT, player({ x: 280, z: 280 })))).toEqual(['search']);
  });

  it('a lit, standing player in front of the pack is found and chased', () => {
    const sim = new PackSim(world, graph, opts(), { x: 0, z: 100 });
    sim.update(DT, player({ x: 0, z: 100 }));
    const p = player({ x: 0, z: 100, lanternLit: true, visibility: 1 });
    packInFront(sim, p, 45);
    sim.frozen = true;
    const log = run(sim, 4, p);
    expect(sim.state).toBe('chasing');
    expect(horns(log)).toContain('found');
    expect(sim.alert).toBeGreaterThan(0.75);
  });

  it('a player lying flat and still, unlit, is not noticed at 15 m', () => {
    const sim = new PackSim(world, graph, opts(), { x: 0, z: 100 });
    const p = player({ x: 0, z: 100, stance: 'prone', visibility: 0.22, noise: 0 });
    packInFront(sim, p, 15);
    sim.frozen = true;
    run(sim, 10, p);
    expect(sim.state).toBe('calm');
    expect(sim.alert).toBeLessThan(0.15);
  });

  it('hears a running player behind it and gets suspicious', () => {
    const sim = new PackSim(world, graph, opts({ pikeur: false }), { x: 0, z: 100 });
    // pack 18 m north of the player but looking away (north)
    sim.agents.forEach((_, i) => sim.place(i, (i - 1) * 1.5, 100 - 18, 0));
    sim.frozen = true;
    run(sim, 2.5, player({ x: 0, z: 100, noise: 0.87, speed: 6, visibility: 1 }));
    expect(['suspicious', 'chasing']).toContain(sim.state);
    expect(sim.lastNoise).not.toBeNull();
  });

  it('water breaks the trail: chase → search → call-off; the Pikeur never enters water', () => {
    const sim = new PackSim(world, graph, opts({ x: 150, z: 0, radius: 120 }), { x: 150, z: 0 });
    const log: SimEvent[] = [];
    let p = player({ x: 150, z: 0, lanternLit: true });
    packInFront(sim, p, 30);
    // get spotted, then run east into the water band (x 180…200) and stand there
    run(sim, 3, p, log);
    expect(sim.state).toBe('chasing');
    p = player({ x: 190, z: 0, lanternLit: false, visibility: 1, stance: 'stand' });
    let wet = false;
    for (let i = 0; i < 60 * 40 && !sim.caught; i++) {
      log.push(...sim.update(DT, p));
      for (const a of sim.agents) if (world.surfaceAt(a.x, a.z) === 'water') wet = true;
      if (sim.state === 'calm' && horns(log).includes('call-off')) break;
    }
    expect(sim.caught).toBeNull();
    expect(wet).toBe(false);
    const hs = horns(log);
    expect(hs.indexOf('found')).toBeGreaterThan(hs.indexOf('search'));
    expect(hs.indexOf('lost')).toBeGreaterThan(hs.indexOf('found'));
    expect(hs.indexOf('call-off')).toBeGreaterThan(hs.indexOf('lost'));
  });

  it('catches a player who stands still during the chase', () => {
    const sim = new PackSim(world, graph, opts(), { x: 0, z: 100 });
    const p = player({ x: 0, z: 100, lanternLit: true });
    packInFront(sim, p, 30);
    const log = run(sim, 20, p);
    expect(sim.caught).not.toBeNull();
    expect(log.some((e) => e.type === 'caught')).toBe(true);
  });

  it('gentle mode is slower and less perceptive; Rauhnacht is faster', () => {
    const n = new PackSim(world, graph, opts(), { x: 0, z: 0 }).tune;
    const g = new PackSim(world, graph, opts({ gentle: true }), { x: 0, z: 0 }).tune;
    const r = new PackSim(world, graph, opts({ rauhnacht: true }), { x: 0, z: 0 }).tune;
    expect(g.speed.chase).toBeLessThan(n.speed.chase * 0.75);
    expect(g.sense.acuity).toBeLessThan(n.sense.acuity);
    expect(r.speed.chase).toBeGreaterThan(n.speed.chase);
    expect(n.speed.chase).toBeLessThan(6.2 + 0.01); // a sprinting player can just outrun them at medium intensity
  });

  it('without paths in the area the pack still roams', () => {
    const sim = new PackSim(world, null, opts({ pikeur: false }), { x: 0, z: 0 });
    const x0 = sim.leader.x;
    run(sim, 20, player({ x: 280, z: 280 }));
    expect(Math.abs(sim.leader.x - x0) + Math.abs(sim.leader.z)).toBeGreaterThan(1);
  });
});

describe('hunt: lantern oil', () => {
  const mode = { gentle: false, rauhnacht: false };
  it('drains only while lit and goes dark when empty', () => {
    const s = newLantern();
    s.seconds = 10;
    expect(drain(s, 5, mode).emptied).toBe(false);
    expect(s.oil).toBe(1);
    expect(toggle(s)).toBe(true);
    let emptied = false;
    for (let i = 0; i < 60 * 11; i++) emptied = drain(s, 1 / 60, mode).emptied || emptied;
    expect(emptied).toBe(true);
    expect(s.oil).toBe(0);
    expect(s.lit).toBe(false);
    expect(toggle(s, true)).toBeNull(); // can't light an empty lantern
    refill(s);
    expect(s.oil).toBe(1);
  });
  it.each([[0.2, 0.7], [0.8, 1]])('adds half a tank to %s oil, capped at capacity', (oil, expected) => {
    const s = { ...newLantern(), oil };
    refill(s, 0.5);
    expect(s.oil).toBeCloseTo(expected);
  });
  it('gentle mode burns 50 % longer, Rauhnacht 30 % shorter', () => {
    const s = newLantern();
    s.seconds = 100;
    expect(burnSeconds(s, { gentle: true, rauhnacht: false })).toBe(150);
    expect(burnSeconds(s, { gentle: false, rauhnacht: true })).toBeCloseTo(70);
  });
});
