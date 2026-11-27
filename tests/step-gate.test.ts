import { describe, expect, it } from 'vitest';
import { type FenceGl, StepDrawGate } from '../src/debug/stepGate';

/** A WebGL2 stand-in whose fences signal only when the test says the GPU caught up. */
function fakeGl() {
  const fences = new Map<object, boolean>();
  let lost = false;
  const gl = {
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    SYNC_STATUS: 0x9114,
    SIGNALED: 0x9119,
    fenceSync: () => {
      const f = {};
      fences.set(f, false);
      return f as WebGLSync;
    },
    getSyncParameter: (f: WebGLSync) => (fences.get(f) ? 0x9119 : 0x9118),
    deleteSync: (f: WebGLSync | null) => {
      if (f) fences.delete(f);
    },
    flush: () => {},
    isContextLost: () => lost,
  } as unknown as FenceGl;
  return {
    gl,
    gpuDone: () => fences.forEach((_, f) => fences.set(f, true)),
    lose: () => (lost = true),
    live: () => fences.size,
  };
}

describe('StepDrawGate (TASK-075)', () => {
  it('lets a stepping loop draw once while the GPU is still busy', () => {
    const g = fakeGl();
    const gate = new StepDrawGate(g.gl);
    let draws = 0;
    for (let i = 0; i < 45; i++) {
      if (gate.ready()) {
        draws++;
        gate.drew();
      }
    }
    expect(draws).toBe(1);
    g.gpuDone();
    expect(gate.ready()).toBe(true);
    expect(g.live()).toBe(0);
  });

  it('keeps at most one fence alive', () => {
    const g = fakeGl();
    const gate = new StepDrawGate(g.gl);
    gate.drew();
    gate.drew();
    expect(g.live()).toBe(1);
  });

  it('never blocks without WebGL2 or after a lost context', () => {
    expect(new StepDrawGate(null).ready()).toBe(true);
    const g = fakeGl();
    const gate = new StepDrawGate(g.gl);
    gate.drew();
    expect(gate.ready()).toBe(false);
    g.lose();
    expect(gate.ready()).toBe(true);
  });
});
