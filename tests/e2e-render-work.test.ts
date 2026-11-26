import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleRenderWork } from '../e2e/helpers/render-work';

afterEach(() => vi.unstubAllGlobals());

describe('e2e render work sample', () => {
  it('advances a fixed number of ticks and captures independent peaks from fresh frames', () => {
    const perf = { frames: 42 };
    const renderer = { info: { render: { calls: 999, triangles: 999 } } };
    const draws = [{ calls: 12, triangles: 150 }, { calls: 8, triangles: 220 }, { calls: 6, triangles: 100 }];
    const step = vi.fn((_ticks: number) => {
      renderer.info.render = draws[perf.frames - 42]!;
      perf.frames++;
    });
    vi.stubGlobal('window', { kq: { ctx: { perf, renderer }, step } });

    expect(sampleRenderWork({ frames: 3, ticksPerFrame: 15 })).toEqual({ frames: 3, calls: 12, triangles: 220 });
    expect(step.mock.calls).toEqual([[15], [15], [15]]);
  });
});
