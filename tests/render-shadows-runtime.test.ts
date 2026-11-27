import { Scene, Vector3, WebGLRenderTarget, type WebGLRenderer } from 'three';
import { expect, it, vi } from 'vitest';
import { SunShadows } from '../src/render/shadows';
import { atmosphere, NO_SHADOW_TEX } from '../src/world/atmosphere';

it('replaces the shadow map on a tier change and renders it before allowing reuse', () => {
  const shadows = new SunShadows();
  const previous = new WebGLRenderTarget(20, 10);
  const setTarget = vi.fn<(target: WebGLRenderTarget) => void>();
  const renderer = {
    getRenderTarget: () => previous, setRenderTarget: setTarget, clear: vi.fn(), render: vi.fn(),
  } as unknown as WebGLRenderer;
  const scene = new Scene();
  const focus = new Vector3(0, 1, 0);
  const frame = () => shadows.update(renderer, scene, focus, 1 / 60);
  try {
    shadows.every = 2;
    shadows.configure(2048, 75, 9);
    frame();
    const high = setTarget.mock.calls[0]![0];
    const release = vi.fn();
    high.addEventListener('dispose', release);
    expect(high.width).toBe(2048);
    expect(atmosphere.uShadowMap.value).toBe(high.depthTexture);
    expect(shadows.camera.right).toBe(75);
    expect(atmosphere.uShadowParams.value.toArray()).toEqual([1, 1 / 2048, 9, shadows.strength]);
    expect(setTarget).toHaveBeenLastCalledWith(previous);
    frame();
    expect(shadows.stats).toEqual({ drawn: 1, reused: 1 });
    shadows.configure(0, 0, 0);
    frame();
    expect(release).toHaveBeenCalledTimes(1);
    expect(shadows.enabled).toBe(false);
    expect(shadows.stats.drawn).toBe(1);
    expect(atmosphere.uShadowMap.value).toBe(NO_SHADOW_TEX);
    expect(atmosphere.uShadowParams.value.x).toBe(0);
    shadows.configure(1024, 55, 4);
    frame();
    expect(shadows.enabled).toBe(true);
    expect(shadows.stats.drawn).toBe(2);
    expect(shadows.camera.right).toBe(55);
    expect(atmosphere.uShadowParams.value.toArray()).toEqual([1, 1 / 1024, 4, shadows.strength]);
  } finally {
    shadows.configure(0, 0, 0);
    previous.dispose();
  }
});
