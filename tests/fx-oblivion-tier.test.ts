import { BoxGeometry, Mesh, PerspectiveCamera, Points, Scene, ShaderMaterial } from 'three';
import { expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { OblivionController } from '../src/systems/fx/oblivion/oblivion';
import { Quality } from '../src/systems/fx/quality';
import type { FxUI } from '../src/systems/fx/ui';
import { ERA_LOOKS } from '../src/world/eraPresets';

it('resizes an active Steinfraß effect in both directions while preserving the threat meter', () => {
  const scene = new Scene();
  const quality = new Quality('high');
  const terrain = { bounds: { x0: -500, x1: 500, z0: -500, z1: 500 }, heightAt: () => 0, normalAt: () => [0, 1, 0] };
  const palace = { object: new Mesh(new BoxGeometry()), material: new ShaderMaterial(), setMode: vi.fn(), uniforms: { uRuin: { value: 0 } } };
  const ctx = {
    scene, camera: new PerspectiveCamera(), renderer: { domElement: { height: 300 } },
    world: { palace, heightfields: { '2025': terrain }, heightAt: terrain.heightAt, look: ERA_LOOKS['1796'], applyLook: vi.fn() },
    audio: { onUnlock: vi.fn() }, settings: { state: { reducedMotion: false } }, era: { info: { palace: 'ruin' } },
  };
  const ui = { caption: vi.fn(), setGauge: vi.fn() };
  const effect = new OblivionController(ctx as unknown as GameContext, ui as unknown as FxUI, quality);
  const layer = (attribute: string) => scene.children.find((o): o is Points => o instanceof Points && o.geometry.hasAttribute(attribute))!;
  const counts = () => ['aCol', 'aBase', 'aH2'].map(attr => {
    const g = layer(attr).geometry;
    return Math.min(g.drawRange.count, g.getAttribute('position').count);
  });
  try {
    effect.start(120, 0.4);
    effect.frame(0);
    const high = counts();
    expect(high[0]).toBe(2600);
    expect(high[1]).toBeGreaterThan(0);
    expect(high[2]).toBeGreaterThan(0);
    quality.set('low');
    effect.frame(0);
    const low = counts();
    expect.soft(low[0]).toBe(1200);
    expect.soft(low[1]).toBe(Math.floor(high[1]! * 0.45));
    expect.soft(low[2]).toBeLessThan(high[2]!);
    expect(effect.slice()).toEqual({ active: true, seconds: 120, t: 0.4 });
    quality.set('high');
    effect.frame(0);
    expect(counts()).toEqual(high);
    effect.stop();
    quality.set('low');
    expect(scene.children.filter(o => o instanceof Points)).toHaveLength(0);
  } finally {
    effect.dispose();
  }
});
