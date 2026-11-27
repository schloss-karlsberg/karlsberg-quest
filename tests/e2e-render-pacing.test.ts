import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeRenderFrames } from '../e2e/helpers/render-pacing';
import { FixedStepLoop } from '../src/core/loop';

afterEach(() => vi.unstubAllGlobals());

const OBSERVATION = { drain: 4, callbacks: 12 };

function browserFrames(render: () => void = () => {}) {
  const queued = new Map<number, FrameRequestCallback>();
  let id = 0;
  let time = 0;
  const request = (fn: FrameRequestCallback) => {
    queued.set(++id, fn);
    return id;
  };
  const loop = new FixedStepLoop({ update: () => {}, render }, 60, request, (key) => queued.delete(key));
  vi.stubGlobal('window', { kq: { ctx: { loop } } });
  vi.stubGlobal('requestAnimationFrame', request);
  const animate = async (frames: number) => {
    for (let i = 0; i < frames; i++) {
      time += 1000 / 60;
      for (const key of [...queued.keys()]) {
        const fn = queued.get(key);
        queued.delete(key);
        fn?.(time);
      }
      await Promise.resolve();
    }
  };
  const observe = async () => {
    const sample = observeRenderFrames(OBSERVATION);
    await animate(OBSERVATION.drain + OBSERVATION.callbacks);
    return sample;
  };
  return { loop, animate, observe };
}

describe('e2e browser render observations', () => {
  it.each(['paused', 'manual'] as const)('detects a repeating redraw request while %s at a zero cap', async (held) => {
    let repeat = false;
    const { loop, observe } = browserFrames(() => {
      if (repeat) loop.requestRender();
    });
    loop[held] = true;
    loop.pace = () => 0;
    loop.start();
    loop.requestRender(2);
    expect(await observe()).toEqual({ before: 2, after: 2 });

    repeat = true;
    loop.requestRender();
    const sample = await observe();
    expect(sample.after - sample.before).toBe(OBSERVATION.callbacks);
  });

  it('excludes the forced wake-up frame from resumed rendering', async () => {
    const { loop, animate, observe } = browserFrames();
    loop.manual = true;
    loop.pace = () => loop.manual ? 0 : 60;
    loop.start();
    await animate(1);

    const brokenPacer = vi.spyOn(loop.pacer, 'tick').mockReturnValue(false);
    loop.manual = false;
    loop.requestRender(); // the redraw requested by pilot.bulletTime(false)
    expect(loop.pace()).toBe(60);
    expect(await observe()).toEqual({ before: 1, after: 1 });

    brokenPacer.mockRestore();
    const sample = await observe();
    expect(sample.after - sample.before).toBeGreaterThanOrEqual(2);
  });
});
