import { Scene, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoadedModel } from '../src/assets/loader';
import type { GameContext } from '../src/core/context';
import fauna, { type FaunaHooks } from '../src/systems/fauna';

function faunaGame() {
  let rejectLoad!: (error: Error) => void;
  const model = new Promise<LoadedModel>((_, reject) => { rejectLoad = reject; });
  const scene = new Scene();
  const camera = { position: new Vector3() };
  const kq: { fauna?: FaunaHooks } = {};
  vi.stubGlobal('window', { kq });
  const ctx = {
    scene, camera, settings: { state: { reducedMotion: false } },
    assets: { model: () => model, peek: () => null },
    world: { heightAt: () => 0 }, loop: { requestRender: vi.fn() },
  } as unknown as GameContext;
  fauna.init(ctx);
  const frame = () => fauna.frame(1 / 60, ctx);
  frame();
  return { ctx, scene, camera, api: ctx.fauna!, kq, frame, rejectLoad };
}

afterEach(() => { fauna.dispose(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('fauna bodies across loading and visibility changes', () => {
  it('keeps the owner and distance visibility decisions while a fallback body arrives', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const g = faunaGame();
    const animal = g.api.spawn('reh.kitz', { x: 0, z: 0, seed: 4 });
    animal.setVisible(false);
    g.camera.position.z = 65;
    g.frame();
    g.rejectLoad(new Error('missing body'));
    expect(await animal.ready).toBe(false);
    expect(animal.root.visible).toBe(false);
    animal.setVisible(true);
    expect(animal.root.visible).toBe(false); // owner permits it, distance still hides it
    g.camera.position.z = 0;
    g.frame();
    expect(animal.root.visible).toBe(true);
    expect(g.kq.fauna!.stats()).toMatchObject({ count: 1, visible: 1, drawCalls: 1 });
    animal.setVisible(false);
    g.camera.position.z = 65;
    g.frame();
    g.camera.position.z = 0;
    g.frame();
    expect(animal.root.visible).toBe(false);
    expect(g.kq.fauna!.stats()).toMatchObject({ count: 1, visible: 0, drawCalls: 0 });
  });

  it('clears all pending bodies and keeps a late load from repopulating the scene', async () => {
    const g = faunaGame();
    expect(g.api.list()).toEqual([]);
    const first = g.api.spawn('reh.ricke', { x: 0, z: 0, seed: 5 });
    const second = g.api.spawn('reh.kitz', { x: 3, z: 0, seed: 6 });
    expect(g.scene.children).toEqual([first.root, second.root]);
    g.api.clear();
    expect(await Promise.all([first.ready, second.ready])).toEqual([false, false]);
    // A model load can finish after the behaviour layer has rebuilt its animals.
    const replacement = g.api.spawn('reh.kitz', { x: 10, z: 0, seed: 6 });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    g.rejectLoad(new Error('offline'));
    await replacement.ready;
    expect(g.api.get(second.id)).toBeUndefined();
    expect(g.api.list()).toEqual([replacement]);
    expect(g.scene.children).toEqual([replacement.root]);
    expect(replacement.root.visible).toBe(true);
    fauna.dispose();
    expect(g.scene.children).toEqual([]);
    expect(g.ctx.fauna).toBeUndefined();
    expect(g.kq.fauna).toBeUndefined();
  });
});
