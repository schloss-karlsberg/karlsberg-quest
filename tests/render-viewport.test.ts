import { PerspectiveCamera, type WebGLRenderer } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostFX } from '../src/render/post';
import { pixelRatioFor } from '../src/render/quality';
import { bindViewport } from '../src/render/viewport';

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
    setPixelRatio(r: number) { ratio = r; },
    getPixelRatio: () => ratio,
  };
  const post = new PostFX();
  const camera = new PerspectiveCamera();
  const redraw = vi.fn();
  bindViewport(renderer as unknown as WebGLRenderer, post, camera,
    () => pixelRatioFor('high', 0.8, win.devicePixelRatio), redraw);
  function moveDisplay(dpr: number) {
    const old = win.devicePixelRatio;
    win.devicePixelRatio = dpr;
    queries.get(`(resolution: ${old}dppx)`)?.dispatchEvent(new Event('change'));
  }
  return { win, camera, renderer, post, redraw, moveDisplay };
}

afterEach(() => vi.unstubAllGlobals());

describe('render viewport', () => {
  it('resizes CSS and physical targets together and redraws a held view', () => {
    const { win, camera, renderer, post, redraw } = viewport();
    expect(camera.aspect).toBe(2);
    win.innerWidth = 120;
    win.innerHeight = 150;
    win.dispatchEvent(new Event('resize'));
    expect(renderer.setSize).toHaveBeenLastCalledWith(120, 150, false);
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
    const { moveDisplay, renderer, post, redraw } = viewport();
    expect(renderer.getPixelRatio()).toBe(0.8);
    moveDisplay(2);
    expect(renderer.getPixelRatio()).toBe(1);
    expect(post.target.width).toBe(200);
    moveDisplay(0.75);
    expect(renderer.getPixelRatio()).toBeCloseTo(0.6);
    expect(post.target.width).toBe(120);
    expect(redraw).toHaveBeenCalledTimes(3);
  });
});
