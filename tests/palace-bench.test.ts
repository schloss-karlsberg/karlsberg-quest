import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import type { Era } from '../src/core/era';
import { runBench } from '../src/debug/bench';
import type { PerfMonitor } from '../src/render/perf';

function fixture({ stuck = false, frameMs = 16.7 } = {}) {
  const hall = { building: 'KB-B01', roomId: 'B01.2.og-festsaal' };
  let room: typeof hall | null = hall;
  let teleported = false;
  const events: string[] = [];
  const fire = { active: false, clock: 0 };
  const renderClocks: number[] = [];
  const perf = {
    onFrame: null as PerfMonitor['onFrame'],
    enableGpuTimer() {},
    resetClock() {},
  };
  const ctx = {
    era: { current: '1789' as Era },
    player: { position: { x: 0, z: 0 }, teleport() {}, setFlying() {} },
    world: { forest: { invalidate() {} } },
    renderer: {
      getContext: () => ({ getExtension: () => null, getParameter: () => 'test renderer' }),
      getPixelRatio: () => 1,
      domElement: { width: 1440, height: 900 },
      info: { memory: { geometries: 2, textures: 1 } },
    },
    settings: { state: { graphics: 'high' } },
    loop: { manual: true, dt: 1 / 60, requestRender() {} },
    events: { emit() {} },
  };
  const k: Parameters<typeof runBench>[0] = {
    ctx: ctx as unknown as GameContext,
    setEra: (era) => { ctx.era.current = era; },
    setScanMode() {},
    teleport(x) {
      teleported = true;
      events.push(`teleport ${x}`);
    },
    step(n) {
      events.push(`step ${n}`);
      if (teleported && !stuck) room = null;
    },
    interiors: {
      enter() {
        teleported = false;
        room = hall;
        return true;
      },
      fire() {},
      list: () => [],
      room() {
        events.push('room');
        return room;
      },
    },
    fx: {
      fire(on, opts) {
        fire.active = on;
        fire.clock = Number(opts?.clock ?? 0);
      },
      fireTime(t) { fire.clock = t; },
      state: () => ({ fire }),
    },
  };
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queueMicrotask(() => {
      events.push('frame');
      renderClocks.push(fire.clock);
      perf.onFrame?.(frameMs, 2, 1, 10);
      callback(0);
    });
  });
  return { k, events, renderClocks, perf: perf as unknown as PerfMonitor };
}

afterEach(() => vi.unstubAllGlobals());

describe('palace benchmark', () => {
  it.each([['1789-palace-front', 1184], ['1789-palace-plateau', 1216]])('steps out of the Festsaal before warming up %s', async (id, x) => {
    const { k, events, perf } = fixture();
    const result = await runBench(k, perf, () => {}, { only: ['1789-festsaal', id], warmup: 1, frames: 2, log: false });
    expect(result.scenes.map((scene) => scene.id)).toEqual(['1789-festsaal', id]);
    expect(events.slice(events.indexOf(`teleport ${x}`))).toEqual([`teleport ${x}`, 'step 1', 'room', 'frame', 'frame', 'frame']);
  });

  it('fails before rendering an exterior sample if room tracking is still in the Festsaal', async () => {
    const { k, events, perf } = fixture({ stuck: true });
    await expect(runBench(k, perf, () => {}, { only: ['1789-palace-front'], log: false })).rejects.toThrow('B01.2.og-festsaal');
    expect(events).toEqual(['teleport 1184', 'step 1', 'room']);
  });

  it.each(['1793-07-festsaal-fire', '1793-07-fire-outside'])('pairs the fixed clock with four seconds of fire advancement in %s', async (id) => {
    for (const fireClock of ['fixed', 'advancing'] as const) {
      const { k, perf, renderClocks } = fixture();
      const result = await runBench(k, perf, () => {}, { only: [id], fireClock, frames: 240, warmup: 2, log: false });
      const advances = fireClock === 'advancing';
      expect(result.scenes[0]!.fireClock).toEqual({ start: 120, end: advances ? 124 : 120 });
      expect(renderClocks.slice(0, 2)).toEqual([120, 120]);
      expect(renderClocks.slice(2)).toEqual(Array.from({ length: 240 }, (_, i) => advances ? 120 + (i + 1) / 60 : 120));
    }
  });

  it.each([[16.7, true], [35, false]])('evaluates a %s ms frame p95 against the frame target', async (frameMs, passes) => {
    const { k, perf } = fixture({ frameMs });
    const result = await runBench(k, perf, () => {}, { only: ['1793-07-festsaal-fire'], frames: 2, warmup: 1, log: false });
    expect(result.scenes[0]).toMatchObject({ withinBudget: true, withinFrameTarget: passes });
  });
});
