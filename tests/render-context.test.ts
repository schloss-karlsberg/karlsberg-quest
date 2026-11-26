import { Mesh, MeshStandardMaterial, PMREMGenerator, Vector3, WebGLCubeRenderTarget, type WebGLRenderer } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerfMonitor } from '../src/render/perf';
import { bindRenderContext } from '../src/render/context';
import { ShadowReuse } from '../src/render/shadows';
import { EnvLight, kqStandard } from '../src/render/standard';
import { ReflectionSchedule } from '../src/world/water';

class TimerGL {
  getExtension = vi.fn(() => ({ TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 }));
  createQuery = () => ({});
  beginQuery = vi.fn();
  endQuery = vi.fn();
  getQueryParameter = vi.fn(() => false);
}

function context() {
  vi.stubGlobal('WebGL2RenderingContext', TimerGL);
  const gl = new TimerGL();
  const canvas = new EventTarget();
  const renderer = {
    domElement: canvas,
    info: { reset: vi.fn(), render: { calls: 0, triangles: 0 } },
    getRenderTarget: () => null, setRenderTarget: vi.fn(), getContext: () => gl,
  } as unknown as WebGLRenderer;
  const perf = new PerfMonitor(renderer);
  const env = new EnvLight(new Mesh());
  const shadows = new ShadowReuse();
  const reflections = new ReflectionSchedule();
  const redraw = vi.fn();
  bindRenderContext(canvas, { env, shadows, reflections, perf, redraw });
  const lose = () => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  const restore = () => canvas.dispatchEvent(new Event('webglcontextrestored'));
  return { renderer, env, shadows, reflections, perf, gl, redraw, lose, restore };
}

afterEach(() => {
  EnvLight.texture = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('WebGL context restoration', () => {
  it('regenerates the same era’s sky for patched materials and redraws even a held view', () => {
    const { env, renderer, redraw, lose, restore } = context();
    const capture = vi.spyOn(PMREMGenerator.prototype, 'fromScene').mockImplementation(() => new WebGLCubeRenderTarget(1));
    const material = kqStandard(new MeshStandardMaterial());
    try {
      env.update(renderer, 7);
      const old = material.envMap;
      expect(old).not.toBeNull();
      env.update(renderer, 7);
      expect(capture).toHaveBeenCalledTimes(1);
      lose();
      restore();
      env.update(renderer, 7);
      expect(capture).toHaveBeenCalledTimes(2);
      expect(material.envMap).not.toBe(old);
      expect(material.envMap).toBe(EnvLight.texture);
      expect(redraw).toHaveBeenCalledTimes(1);
      env.update(renderer, 7);
      expect(capture).toHaveBeenCalledTimes(2);
      env.update(renderer, 8);
      expect(capture).toHaveBeenCalledTimes(3);
    } finally {
      material.dispose();
    }
  });

  it('draws fresh shadow and reflection maps for a stationary camera after restoration', () => {
    const { shadows, reflections, lose, restore } = context();
    const focus = new Vector3();
    const dir = new Vector3(0, 1, 0);
    shadows.every = 2;
    expect(shadows.reuse(focus, dir, 0.016, 0.1)).toBe(false);
    expect(reflections.due(true, focus, dir, 3)).toBe(true);
    lose();
    restore();
    expect.soft(shadows.reuse(focus, dir, 0.016, 0.1)).toBe(false);
    expect.soft(reflections.due(true, focus, dir, 3)).toBe(true);
    expect(shadows.every).toBe(2);
  });

  it('drops outstanding GPU timer queries and reacquires the extension only when enabled', () => {
    vi.spyOn(performance, 'now').mockReturnValue(10);
    const { perf, gl, lose, restore } = context();
    perf.enableGpuTimer(true);
    perf.begin();
    perf.end();
    lose();
    perf.begin();
    perf.end();
    expect.soft(gl.beginQuery).toHaveBeenCalledTimes(1);
    restore();
    perf.begin();
    perf.end();
    expect.soft(gl.getExtension).toHaveBeenCalledTimes(2);
    expect.soft(gl.getQueryParameter).not.toHaveBeenCalled();
    perf.enableGpuTimer(false);
    lose();
    restore();
    expect(gl.getExtension).toHaveBeenCalledTimes(2);
  });

  it.todo('Decide whether to freeze gameplay and threat clocks while the WebGL context is lost.');
});
