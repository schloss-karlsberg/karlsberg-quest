import type { WebGLRenderer } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VIEW_B_TARGET_MS, captureForestTick, compareShadowSamples, samplePhoneFrames, type ShadowSample } from '../e2e/helpers/forest-shadows';
import { FixedStepLoop, frameCap } from '../src/core/loop';
import { runBench } from '../src/debug/bench';
import { PERF_BUDGET, PerfMonitor, frameStats } from '../src/render/perf';

const VIEW = { id: 'today-forest-b', x: 1632, z: -1640, yaw: 260, pitch: -6 };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('paired forest benchmark', () => {
  const rendererInfo = { render: { calls: 12, triangles: 100 }, memory: { geometries: 3, textures: 2 } };

  it('uses the player camera in B/C and keeps the sweep and flight callbacks', async () => {
    vi.stubGlobal('navigator', { userAgent: 'test' });
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { queueMicrotask(callback); });
    const renderer = {
      info: { ...rendererInfo, reset: vi.fn() },
      getContext: () => ({ getExtension: () => null }),
      domElement: { width: 1, height: 1 }, getPixelRatio: () => 1,
    };
    const perf = new PerfMonitor(renderer as unknown as WebGLRenderer);
    const k = {
      ctx: {
        era: { current: 'today' },
        player: { position: { x: 0, z: 0 }, pitch: 0, yaw: 0, setFlying: vi.fn(), teleport: vi.fn() },
        settings: { state: { graphics: 'high' } },
        renderer,
        world: { forest: { invalidate: vi.fn() } },
        loop: { requestRender: () => { perf.begin(); perf.end(); } },
      },
      teleport: vi.fn(),
    };
    const setCamera = vi.fn();
    const bench = await runBench(k as unknown as Parameters<typeof runBench>[0], perf, setCamera, {
      only: ['today-fly', 'today-forest', VIEW.id, 'today-forest-c'], warmup: 1, frames: 2, log: false,
    });
    expect(bench.scenes.map(({ id }) => id)).toEqual(['today-fly', 'today-forest', VIEW.id, 'today-forest-c']);
    expect(k.teleport).toHaveBeenCalledWith(VIEW.x, VIEW.z, VIEW.yaw, VIEW.pitch);
    const overrides = setCamera.mock.calls.flat();
    expect(overrides.slice(0, 4)).toEqual([expect.any(Function), null, expect.any(Function), null]);
    expect(overrides.slice(4)).toEqual([null, null, null, null, null]);
    expect(bench.scenes.map(({ frames }) => frames)).toEqual([2, 2, 2, 2]);
  });

  it('averages GPU queries from the timed window only', () => {
    let queryMs = 0;
    class TestGl {
      TIME_ELAPSED_EXT = 1;
      GPU_DISJOINT_EXT = 2;
      QUERY_RESULT_AVAILABLE = 3;
      QUERY_RESULT = 4;
      getExtension = () => this;
      getParameter = () => false;
      createQuery = () => ({ ns: 0 });
      beginQuery = (_target: number, query: { ns: number }) => { query.ns = queryMs * 1e6; };
      endQuery = () => {};
      getQueryParameter = (query: { ns: number }, key: number) => key === this.QUERY_RESULT_AVAILABLE ? true : query.ns;
    }
    vi.stubGlobal('WebGL2RenderingContext', TestGl);
    const renderer = { info: { ...rendererInfo, reset: vi.fn() }, getContext: () => new TestGl() };
    const perf = new PerfMonitor(renderer as unknown as WebGLRenderer);
    const draw = (ms: number) => { queryMs = ms; perf.begin(); perf.end(); };
    perf.enableGpuTimer(true);
    draw(90);
    perf.startGpuSample();
    draw(4);
    draw(6);
    draw(8);
    expect(perf.finishGpuSample()).toEqual({ ms: 5, frames: 2 });
    perf.startGpuSample();
    draw(1);
    draw(3);
    expect(perf.finishGpuSample()).toEqual({ ms: 1, frames: 1 });
  });

  const sample = (on: boolean, gpuMs: number, frameMsValue: number, gpuFrames = 238): ShadowSample => ({
    shadowMap: on, when: '', userAgent: '', renderer: '', pixelRatio: 1, size: [1, 1], quality: 'high', budget: PERF_BUDGET,
    scenes: [{
      id: VIEW.id, label: '', frames: 240, frameMs: frameStats([frameMsValue]), cpuMs: frameStats([1]),
      gpuMs, gpuFrames, calls: { avg: 1, max: 1 }, triangles: { avg: 100, max: 200 },
      geometries: 1, textures: 1, programs: 1, withinBudget: true,
    }],
  });
  const baseline = [sample(true, 9, 12), sample(false, 3, 8), sample(false, 2, 7), sample(true, 7, 12), sample(true, 24, 40), sample(false, 6, 10)];
  const branch = [sample(true, 4, 11), sample(false, 2, 8), sample(false, 3, 10), sample(true, 6, 16), sample(true, 5, 14), sample(false, 3, 9)];

  it('takes the median of the per-pair shadow costs and detects slower view B results', () => {
    const [result] = compareShadowSamples(baseline, branch, [VIEW.id]);
    expect(result).toMatchObject({
      metric: 'GPU ms', before: { pairedDeltas: [6, 5, 18], medianShadowMs: 6, frameP95: 12, trianglesMax: 200 },
      after: { pairedDeltas: [2, 3, 2], medianShadowMs: 2, frameP95: 14, trianglesMax: 200 }, reductionMs: 4,
    });
    expect(result!.reductionMs).toBeGreaterThanOrEqual(VIEW_B_TARGET_MS);
    const [slower] = compareShadowSamples(branch, baseline, [VIEW.id]);
    expect(slower!.reductionMs).toBeLessThan(VIEW_B_TARGET_MS);
    expect(() => compareShadowSamples(baseline.slice(1), branch, [VIEW.id])).toThrow('three shadow on/off pairs');
  });

  it('uses wall-frame time on both revisions when even one mode lacks GPU query coverage', () => {
    const missing = [sample(true, 4, 11, 100), ...branch.slice(1)];
    const [result] = compareShadowSamples(baseline, missing, [VIEW.id]);
    expect(result).toMatchObject({ metric: 'frame ms', before: { medianShadowMs: 5 }, after: { medianShadowMs: 5 }, reductionMs: 0 });
  });
});

describe('forest stills and phone control', () => {
  it('advances a fresh manual session to the same tick for each visual capture', () => {
    const loop = { manual: false, tick: 0 };
    const kq = { ctx: { loop }, step: vi.fn(() => { loop.tick++; }), teleport: vi.fn() };
    vi.stubGlobal('window', { kq });
    expect(() => captureForestTick({ view: VIEW, tick: 20 })).toThrow('fresh manual');
    loop.manual = true;
    expect(captureForestTick({ view: VIEW, tick: 20 })).toBe(20);
    expect(kq.teleport).toHaveBeenCalledExactlyOnceWith(VIEW.x, VIEW.z, VIEW.yaw, VIEW.pitch);
    expect(kq.step.mock.calls).toHaveLength(20);
    expect(() => captureForestTick({ view: VIEW, tick: 20 })).toThrow('fresh manual');
  });

  it('records paced renders without requesting frames or including the warm-up interval', async () => {
    vi.useFakeTimers();
    const perf: Pick<PerfMonitor, 'onFrame'> = { onFrame: null };
    const loop = new FixedStepLoop({
      update: vi.fn(),
      render: (dt) => perf.onFrame?.(dt * 1000, 2, 9, 25),
    });
    loop.pace = () => frameCap(60, true);
    const requestRender = vi.spyOn(loop, 'requestRender');
    vi.stubGlobal('window', { kq: { ctx: { perf, loop } } });
    let now = 0;
    const raf = setInterval(() => loop.frame(now += 1 / 120), 8);
    try {
      const result = samplePhoneFrames({ warmupMs: 192, durationMs: 960 });
      await vi.advanceTimersByTimeAsync(1152);
      const sample = await result;
      expect(sample.intervals).toHaveLength(29);
      expect(frameStats(sample.intervals).avg).toBeCloseTo(1000 / 30);
      expect(sample).toMatchObject({ callsMax: 9, trianglesMax: 25 });
      expect(perf.onFrame).toBeNull();
      expect(requestRender).not.toHaveBeenCalled();
    } finally {
      clearInterval(raf);
    }
  });
});
