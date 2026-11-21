import { describe, expect, it, vi } from 'vitest';
import { TerrainCloudJob, buildTerrainCloud } from '../src/systems/fx/shift/pointcloud';
import { NEXT_FRAME, SliceRunner } from '../src/systems/fx/shift/slices';
import { nextEra, warmEnabled } from '../src/systems/fx/shift/warm';
import type { Heightfield } from '../src/world/heightfield';

/** A fake clock: every job step advances it by `cost` ms. */
function clock() {
  let t = 0;
  return { now: () => t, tick: (ms: number) => (t += ms) };
}

function* steps(log: string[], name: string, n: number, c: ReturnType<typeof clock>, cost = 1) {
  for (let i = 0; i < n; i++) {
    c.tick(cost);
    log.push(`${name}${i}`);
    yield;
  }
}

describe('SliceRunner (era-shift warm-up slices, M-17)', () => {
  it('stops stepping once the frame budget is spent', () => {
    const c = clock();
    const r = new SliceRunner(c.now);
    const log: string[] = [];
    r.add(steps(log, 'a', 10, c, 1));
    expect(r.run(3)).toBe(3);
    expect(log).toEqual(['a0', 'a1', 'a2']);
    r.run(3);
    expect(log.length).toBe(6);
  });

  it('always takes one step, even when that step overruns the budget', () => {
    const c = clock();
    const r = new SliceRunner(c.now);
    const log: string[] = [];
    r.add(steps(log, 'a', 3, c, 50));
    expect(r.run(2)).toBe(1);
    expect(log).toEqual(['a0']);
  });

  it('runs jobs in queue order and drops finished ones', () => {
    const c = clock();
    const r = new SliceRunner(c.now);
    const log: string[] = [];
    r.add(steps(log, 'a', 2, c));
    r.add(steps(log, 'b', 2, c));
    r.run(100);
    expect(log).toEqual(['a0', 'a1', 'b0', 'b1']);
    expect(r.pending).toBe(0);
    expect(r.run(100)).toBe(0);
  });

  it('a job that yields a promise waits for it without blocking the next job', async () => {
    const c = clock();
    const r = new SliceRunner(c.now);
    const log: string[] = [];
    let resolve!: () => void;
    const p = new Promise<void>((res) => (resolve = res));
    r.add(
      (function* () {
        log.push('compile');
        yield p;
        log.push('compiled');
      })(),
    );
    r.add(steps(log, 'b', 2, c));
    r.run(100);
    expect(log).toEqual(['compile', 'b0', 'b1']);
    expect(r.pending).toBe(1);
    r.run(100);
    expect(log).toEqual(['compile', 'b0', 'b1']);
    resolve();
    await p;
    await Promise.resolve();
    r.run(100);
    expect(log).toEqual(['compile', 'b0', 'b1', 'compiled']);
    expect(r.pending).toBe(0);
  });

  it('NEXT_FRAME ends the frame for every job, budget or not', () => {
    const c = clock();
    const r = new SliceRunner(c.now);
    const log: string[] = [];
    r.add(
      (function* () {
        log.push('draw1');
        yield NEXT_FRAME;
        log.push('draw2');
        yield NEXT_FRAME;
      })(),
    );
    r.add(steps(log, 'b', 2, c));
    expect(r.run(100)).toBe(1);
    expect(log).toEqual(['draw1']);
    r.run(100);
    expect(log).toEqual(['draw1', 'draw2']);
    r.run(100);
    expect(log).toEqual(['draw1', 'draw2', 'b0', 'b1']);
    expect(r.pending).toBe(0);
  });

  it('a throwing job is dropped and the others go on', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = clock();
    const r = new SliceRunner(c.now);
    const log: string[] = [];
    r.add(
      (function* () {
        yield;
        throw new Error('boom');
      })(),
    );
    r.add(steps(log, 'b', 1, c));
    r.run(100);
    expect(log).toEqual(['b0']);
    expect(r.pending).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('TerrainCloudJob (era-shift terrain cloud built ahead of the wave, M-17)', () => {
  const hf = (k: number) =>
    ({
      bounds: { x0: -100, x1: 100, z0: -100, z1: 60 },
      heightAt: (x: number, z: number) => Math.sin(x * 0.1) * k + z * 0.01,
      normalAt: (x: number, z: number): [number, number, number] => [Math.cos(x * 0.1) * 0.1, 1, z * 0.001],
    }) as unknown as Heightfield;

  it('built ring by ring, it holds the same points as the one-shot build', () => {
    const ref = buildTerrainCloud(hf(3), hf(5), 10, -20, 150, 64, 1.05);
    const job = new TerrainCloudJob(hf(3), hf(5), 10, -20, 150, 64, 1.05);
    let t = 0;
    let rounds = 0;
    while (!job.done) {
      job.step(1, 0, () => (t += 0.4));
      rounds++;
    }
    expect(rounds).toBeGreaterThan(5);
    const n = ref.getAttribute('position').count;
    expect(job.count).toBe(n);
    expect(job.geometry.drawRange.count).toBe(n);
    for (const name of ['position', 'aH2', 'aShade', 'aRand']) {
      const attr = job.geometry.getAttribute(name);
      const a = Array.from((attr.array as Float32Array).subarray(0, n * attr.itemSize));
      expect(a).toEqual(Array.from(ref.getAttribute(name).array as Float32Array));
    }
    expect(job.builtR).toBe(Infinity);
  });

  it('always builds out to the radius asked for, whatever the budget', () => {
    const job = new TerrainCloudJob(hf(3), hf(5), 0, 0, 300, 32, 1.03);
    job.step(0, 40, () => 0);
    expect(job.builtR).toBeGreaterThan(40);
    expect(job.done).toBe(false);
    // nothing of the full cloud nearer than builtR is missing
    const ref = buildTerrainCloud(hf(3), hf(5), 0, 0, 300, 32, 1.03);
    const rp = ref.getAttribute('position').array as Float32Array;
    let nearer = 0;
    for (let i = 0; i < ref.getAttribute('position').count; i++) if (Math.hypot(rp[i * 3]!, rp[i * 3 + 2]!) < job.builtR) nearer++;
    expect(nearer).toBeGreaterThan(0);
    expect(job.count).toBeGreaterThanOrEqual(nearer);
    const before = job.count;
    job.step(0, 40, () => 0);
    expect(job.count).toBeGreaterThan(before); // one ring per call at least, even over budget
  });
});

describe('era-shift warm-up policy (M-17)', () => {
  it('warms the story target, else today <-> 1789', () => {
    expect(nextEra('today', '1789')).toBe('1789');
    expect(nextEra('today', '1796')).toBe('1796');
    expect(nextEra('today', undefined)).toBe('1789');
    expect(nextEra('1789', 'nonsense')).toBe('today');
    expect(nextEra('1789', '1789')).toBe('today');
  });

  it('runs on a real GPU, not on a software rasteriser, unless the URL says so', () => {
    const p = (q: string) => new URLSearchParams(q);
    expect(warmEnabled(p(''), 'ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version)')).toBe(true);
    expect(warmEnabled(p(''), 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe(false);
    expect(warmEnabled(p('warm'), 'SwiftShader')).toBe(true);
    expect(warmEnabled(p('nowarm'), 'Apple M5 Pro')).toBe(false);
  });
});
