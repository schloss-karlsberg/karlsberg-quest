import { PerspectiveCamera, type WebGLRenderer } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage, SettingsStore } from '../src/core/save';
import { PostFX } from '../src/render/post';
import { QualityManager } from '../src/render/quality';
import { bindViewport } from '../src/render/viewport';
import type { World } from '../src/world/world';

function viewport() {
  const queries = new Map<string, EventTarget>();
  const win = Object.assign(new EventTarget(), {
    innerWidth: 200, innerHeight: 100, devicePixelRatio: 1,
    matchMedia(query: string) {
      const result = new EventTarget();
      queries.set(query, result);
      return result;
    },
  });
  vi.stubGlobal('window', win);
  let ratio = 1;
  const renderer = {
    setSize: vi.fn(),
    setPixelRatio: vi.fn((r: number) => { ratio = r; }),
    setDrawingBufferSize: vi.fn((_width: number, _height: number, r: number) => { ratio = r; }),
    getPixelRatio: () => ratio,
  };
  const post = new PostFX();
  const camera = new PerspectiveCamera();
  const redraw = vi.fn();
  const settings = new SettingsStore(new MemoryStorage());
  settings.update(s => { s.resolutionScale = 0.8; });
  const world = { terrain: { lodScale: 0 }, forest: { setDistances: vi.fn() }, water: { reflections: false } };
  const quality = new QualityManager({
    world: world as unknown as World, post, settings, resize: () => resize(), notify: vi.fn(),
  });
  const resize = bindViewport(renderer as unknown as WebGLRenderer, post, camera, () => quality.pixelRatio, redraw);
  function moveDisplay(dpr: number) {
    const old = win.devicePixelRatio;
    win.devicePixelRatio = dpr;
    queries.get(`(resolution: ${old}dppx)`)?.dispatchEvent(new Event('change'));
  }
  return { win, camera, renderer, post, redraw, moveDisplay, quality, settings };
}

afterEach(() => vi.unstubAllGlobals());

describe('render viewport', () => {
  it('resizes CSS and physical targets together and redraws a held view', () => {
    const { win, camera, renderer, post, redraw } = viewport();
    expect(camera.aspect).toBe(2);
    win.innerWidth = 120;
    win.innerHeight = 150;
    win.dispatchEvent(new Event('resize'));
    expect(renderer.setDrawingBufferSize).toHaveBeenLastCalledWith(120, 150, 0.8);
    expect(camera.aspect).toBe(0.8);
    expect([post.target.width, post.target.height]).toEqual([96, 120]);
    expect(redraw).toHaveBeenCalledTimes(2);
    win.innerWidth = win.innerHeight = 0;
    win.dispatchEvent(new Event('resize'));
    expect(camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
    expect(redraw).toHaveBeenCalledTimes(2);
    win.innerWidth = 400;
    win.innerHeight = 100;
    win.dispatchEvent(new Event('resize'));
    expect(camera.aspect).toBe(4);
    expect(post.target.width).toBe(320);
  });

  it('tracks successive DPR-only display moves under the active tier and resolution slider', () => {
    const { win, moveDisplay, renderer, post, redraw } = viewport();
    expect(renderer.getPixelRatio()).toBe(0.8);
    moveDisplay(2);
    expect(renderer.getPixelRatio()).toBe(1);
    expect(post.target.width).toBe(200);
    win.dispatchEvent(new Event('resize'));
    moveDisplay(3); // Still at the tier's DPR cap.
    moveDisplay(0.75);
    expect(renderer.getPixelRatio()).toBeCloseTo(0.6);
    expect(post.target.width).toBe(120);
    expect(renderer.setDrawingBufferSize.mock.calls).toEqual([
      [200, 100, 0.8],
      [200, 100, 1],
      [200, 100, 0.75 * 0.8],
    ]);
    expect(renderer.setPixelRatio).not.toHaveBeenCalled();
    expect(renderer.setSize).not.toHaveBeenCalled();
    expect(redraw).toHaveBeenCalledTimes(3);
  });

  it('applies a quality change through the same single buffer update', () => {
    const { quality, settings, renderer, redraw, post } = viewport();
    renderer.setDrawingBufferSize.mockClear();
    quality.apply();
    expect(renderer.setDrawingBufferSize).not.toHaveBeenCalled();
    settings.update(s => { s.resolutionScale = 0.5; });
    quality.apply();
    expect(renderer.setDrawingBufferSize).toHaveBeenCalledExactlyOnceWith(200, 100, 0.5);
    expect(renderer.setPixelRatio).not.toHaveBeenCalled();
    expect(renderer.setSize).not.toHaveBeenCalled();
    expect([post.target.width, post.target.height]).toEqual([100, 50]);
    expect(redraw).toHaveBeenCalledTimes(2);
  });
});
