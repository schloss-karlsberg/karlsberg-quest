import type { BenchResult } from '../../src/debug/bench';

export interface ForestView {
  id: string;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
}

export type ShadowSample = BenchResult & { shadowMap: boolean };

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

export const VIEW_B_TARGET_MS = 3;

/** Keep pair order meaningful even when the off run comes first. Use one metric across revisions. */
export function compareShadowSamples(before: ShadowSample[], after: ShadowSample[], ids: string[]) {
  const pairs = (samples: ShadowSample[], id: string) => {
    if (samples.length !== 6) throw new Error('Expected three shadow on/off pairs');
    return [0, 2, 4].map((i) => {
      const a = samples[i]!;
      const b = samples[i + 1]!;
      if (a.shadowMap === b.shadowMap) throw new Error('Expected one on and one off run per pair');
      const on = (a.shadowMap ? a : b).scenes.find((scene) => scene.id === id);
      const off = (a.shadowMap ? b : a).scenes.find((scene) => scene.id === id);
      if (!on || !off || [on, off].some(({ frames }) => frames < 200)) throw new Error(`Incomplete sample for ${id}`);
      return { on, off };
    });
  };
  return ids.map((id) => {
    const baseline = pairs(before, id);
    const branch = pairs(after, id);
    const gpu = [...baseline, ...branch].every(({ on, off }) =>
      [on, off].every((scene) => scene.gpuMs !== null && scene.gpuFrames >= scene.frames * 0.9));
    const summarize = (runs: typeof baseline) => {
      const pairedDeltas = runs.map(({ on, off }) => gpu ? on.gpuMs! - off.gpuMs! : on.frameMs.avg - off.frameMs.avg);
      return {
        pairedDeltas,
        medianShadowMs: median(pairedDeltas),
        frameP95: median(runs.map(({ on }) => on.frameMs.p95)),
        trianglesMax: Math.max(...runs.map(({ on }) => on.triangles.max)),
      };
    };
    const previous = summarize(baseline);
    const current = summarize(branch);
    return { id, metric: gpu ? 'GPU ms' : 'frame ms', before: previous, after: current, reductionMs: previous.medianShadowMs - current.medianShadowMs };
  });
}

/** Serialized by Playwright. Run after loading and settling a fresh ?manual session. */
export function captureForestTick({ view, tick }: { view?: ForestView; tick: number }): number {
  const k = window.kq!;
  if (!k.ctx.loop.manual || k.ctx.loop.tick !== 0) throw new Error('Expected a fresh manual session');
  if (view) k.teleport(view.x, view.z, view.yaw, view.pitch);
  for (let i = 0; i < tick; i++) k.step(1);
  return k.ctx.loop.tick;
}

/** Serialized by Playwright. Use rendered-frame intervals without waking or forcing the loop. */
export async function samplePhoneFrames({ warmupMs, durationMs }: { warmupMs: number; durationMs: number }) {
  const { perf } = window.kq!.ctx;
  const intervals: number[] = [];
  const cpu: number[] = [];
  let callsMax = 0;
  let trianglesMax = 0;
  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  await wait(warmupMs);
  const previous = perf.onFrame;
  const start = performance.now();
  perf.onFrame = (frameMs, cpuMs, calls, triangles) => {
    intervals.push(frameMs);
    cpu.push(cpuMs);
    callsMax = Math.max(callsMax, calls);
    trianglesMax = Math.max(trianglesMax, triangles);
  };
  try {
    await wait(durationMs);
    intervals.shift(); // The previous render preceded the sample window.
    cpu.shift();
    return { intervals, cpu, callsMax, trianglesMax, elapsedMs: performance.now() - start };
  } finally {
    perf.onFrame = previous;
  }
}
