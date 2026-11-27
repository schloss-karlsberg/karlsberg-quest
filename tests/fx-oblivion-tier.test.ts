import { BoxGeometry, Mesh, PerspectiveCamera, Points, Scene, ShaderMaterial } from 'three';
import { expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { OblivionController } from '../src/systems/fx/oblivion/oblivion';
import { Quality } from '../src/systems/fx/quality';
import type { FxUI } from '../src/systems/fx/ui';
import { ERA_LOOKS } from '../src/world/eraPresets';

function fixture() {
  const scene = new Scene();
  const quality = new Quality('high');
  let samples = 0;
  const terrain = {
    bounds: { x0: -500, x1: 500, z0: -500, z1: 500 },
    heightAt: () => { samples++; return 0; },
    normalAt: () => [0, 1, 0],
  };
  const palace = { object: new Mesh(new BoxGeometry()), material: new ShaderMaterial(), setMode: vi.fn(), uniforms: { uRuin: { value: 0 } } };
  const loop = { paused: true, manual: false, pace: () => 0, requestRender: vi.fn() };
  const ctx = {
    scene, loop, camera: new PerspectiveCamera(), renderer: { domElement: { height: 300 } },
    world: { palace, heightfields: { '2025': terrain }, heightAt: () => 0, look: ERA_LOOKS['1796'], applyLook: vi.fn() },
    audio: { onUnlock: vi.fn() }, settings: { state: { reducedMotion: false } }, era: { info: { palace: 'ruin' } },
  };
  const ui = { caption: vi.fn(), setGauge: vi.fn() };
  const effect = new OblivionController(ctx as unknown as GameContext, ui as unknown as FxUI, quality);
  const layer = (attribute: string) => scene.children.find((o): o is Points => o instanceof Points && o.geometry.hasAttribute(attribute))!;
  return { scene, quality, loop, samples: () => samples, effect, layer };
}

it('replaces the active Steinfraß relief in slices while keeping the current cloud visible', () => {
  const { quality, loop, samples, effect, layer } = fixture();
  const counts = () => ['aCol', 'aBase', 'aH2'].map(attr => {
    const g = layer(attr).geometry;
    return Math.min(g.drawRange.count, g.getAttribute('position').count);
  });
  let now = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now++);
  const finishReplacement = () => {
    const old = layer('aH2').geometry;
    for (let i = 0; i < 200 && layer('aH2').geometry === old; i++) effect.frame(0);
    expect(layer('aH2').geometry.id).not.toBe(old.id);
  };
  try {
    effect.start(120, 0.4);
    effect.frame(0);
    const high = counts();
    expect(high[0]).toBe(2600);
    expect(high[1]).toBeGreaterThan(0);
    expect(high[2]).toBeGreaterThan(0);
    const relief = layer('aH2');
    const highGeometry = relief.geometry;
    const disposeHigh = vi.fn();
    highGeometry.addEventListener('dispose', disposeHigh);
    quality.set('low');
    const before = samples();
    effect.frame(0);
    expect(layer('aH2').id).toBe(relief.id);
    expect(relief.geometry.id).toBe(highGeometry.id);
    expect(relief.visible).toBe(true);
    expect(disposeHigh).not.toHaveBeenCalled();
    expect(samples() - before).toBeGreaterThan(0);
    expect(samples() - before).toBeLessThan(4000);
    expect(loop.requestRender).toHaveBeenCalledTimes(1);
    expect(counts().slice(0, 2)).toEqual([1200, Math.floor(high[1]! * 0.45)]);
    finishReplacement();
    expect(disposeHigh).toHaveBeenCalledTimes(1);
    const low = counts();
    expect.soft(low[0]).toBe(1200);
    expect.soft(low[1]).toBe(Math.floor(high[1]! * 0.45));
    expect.soft(low[2]).toBeLessThan(high[2]!);
    expect(effect.slice()).toEqual({ active: true, seconds: 120, t: 0.4 });
    quality.set('high');
    finishReplacement();
    expect(counts()).toEqual(high);
  } finally {
    clock.mockRestore();
    effect.dispose();
  }
});

it('discards a pending relief when the tier changes back or the threat stops', () => {
  const { scene, quality, samples, effect, layer } = fixture();
  let now = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now++);
  try {
    effect.start(120, 0.4);
    effect.frame(0);
    const high = layer('aH2').geometry;
    quality.set('low');
    effect.frame(0);
    expect(layer('aH2').geometry.id).toBe(high.id);
    quality.set('high');
    for (let i = 0; i < 200; i++) effect.frame(0);
    expect(layer('aH2').geometry.id).toBe(high.id);
    quality.set('low');
    effect.frame(0);
    effect.stop();
    const before = samples();
    effect.frame(0);
    quality.set('high');
    expect(samples()).toBe(before);
    expect(scene.children.filter(o => o instanceof Points)).toHaveLength(0);
    quality.set('low');
    effect.start(120, 0.4);
    effect.frame(0);
    expect(layer('aH2').geometry.drawRange.count).toBe(34560);
  } finally {
    clock.mockRestore();
    effect.dispose();
  }
});
