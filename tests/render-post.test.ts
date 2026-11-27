import { AdditiveBlending, Mesh, OrthographicCamera, PerspectiveCamera, Scene, ShaderMaterial, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PostFX } from '../src/render/post';

function draw(post: PostFX, camera: PerspectiveCamera | OrthographicCamera = new PerspectiveCamera(), autoClear = true) {
  const scene = new Scene();
  let target: WebGLRenderTarget | null = null;
  const passes: { target: WebGLRenderTarget | null; additive: boolean; clear: boolean }[] = [];
  const renderer = {
    autoClear,
    setRenderTarget(t: WebGLRenderTarget | null) { target = t; },
    render(object: Scene | Mesh) {
      const additive = object instanceof Mesh && (object.material as ShaderMaterial).blending === AdditiveBlending;
      passes.push({ target, additive, clear: this.autoClear });
    },
  };
  post.render(renderer as unknown as WebGLRenderer, scene, camera, 3);
  return { passes, renderer };
}

describe('post-processing targets and passes', () => {
  it.todo('Decide whether PostFX.enabled should bypass the HDR composite or only disable optional passes.');

  it('sizes the HDR frame, AO and bloom in physical pixels, including an empty viewport', () => {
    const post = new PostFX();
    post.setFeatures({ ao: true });
    post.setSize(103, 51, 1.25);
    expect(post.uniforms.uResolution!.value.toArray()).toEqual([128, 63]);
    expect(post.uniforms.uAOTexel!.value.toArray()).toEqual([1 / 64, 1 / 31]);
    expect(draw(post).passes.map(({ target }) => target && [target.width, target.height])).toEqual([
      [128, 63], [64, 31], [64, 31], [32, 15], [16, 7], [8, 3], [4, 1],
      [8, 3], [16, 7], [32, 15], [64, 31], null,
    ]);
    post.setSize(0, 0, 0.75);
    expect(post.uniforms.uAOTexel!.value.toArray()).toEqual([1, 1]);
    expect(draw(post).passes.every(({ target }) => !target || (target.width === 1 && target.height === 1))).toBe(true);
  });

  it('keeps the finer bloom level under each additive upsample and restores the caller’s clear mode', () => {
    const post = new PostFX();
    const { passes, renderer } = draw(post);
    expect(passes.filter(p => p.additive).map(p => p.clear)).toEqual([false, false, false, false]);
    expect(passes.filter(p => !p.additive).every(p => p.clear)).toBe(true);
    expect(renderer.autoClear).toBe(true);
    expect(draw(post, new PerspectiveCamera(), false).renderer.autoClear).toBe(false);
  });

  it('switches off passes on a tier change and retains the era look for the return to high', () => {
    const post = new PostFX();
    post.bloomStrength = 0.7;
    post.setFeatures({ bloom: false, ao: false, grade: false });
    expect(draw(post).passes.map(p => p.target)).toEqual([post.target, null]);
    expect(post.uniforms.uGradeX!.value).toBe(0);
    expect(post.uniforms.uBloom!.value).toBe(0);
    post.setFeatures({ ao: true });
    expect(draw(post).passes).toHaveLength(3);
    expect(post.uniforms.uAO!.value).toBe(1);
    expect(draw(post, new OrthographicCamera()).passes).toHaveLength(2);
    expect(post.uniforms.uAO!.value).toBe(0);
    post.setFeatures({ bloom: true, grade: true });
    draw(post);
    expect(post.uniforms.uBloom!.value).toBe(0.7);
    expect(post.uniforms.uGradeX!.value).toBe(1);
    post.bloomStrength = post.aoStrength = 0;
    expect(draw(post).passes).toHaveLength(2);
  });

  it('reallocates MSAA buffers only when the sample count changes and keeps the size', () => {
    const post = new PostFX(4);
    post.setSize(40, 20, 1);
    const released = vi.fn();
    post.target.addEventListener('dispose', released);
    post.setSamples(4);
    expect(released).not.toHaveBeenCalled();
    post.setSamples(0);
    expect(post.samples).toBe(0);
    expect(released).toHaveBeenCalledTimes(1);
    expect([post.target.width, post.target.height]).toEqual([40, 20]);
  });
});
