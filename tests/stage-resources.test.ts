import { Color, PerspectiveCamera, Scene, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { StageDirector } from '../src/systems/fx/stage';
import { disposalCounts } from './disposal-counts';

function setup() {
  vi.stubGlobal('window', {});
  const events = new EventBus();
  const scene = new Scene();
  const applyLook = vi.fn();
  const busy = vi.fn();
  const ctx = {
    events, scene, camera: new PerspectiveCamera(), renderer: { domElement: { height: 360 } },
    settings: { state: { reducedMotion: true } },
    world: { heightAt: () => 0, applyLook }, player: { position: new Vector3(), yaw: 0 },
    audio: { ctx: null, bus: () => null, noise: () => null }, era: { info: { night: false } },
    post: { uniforms: { uLift: { value: new Color() }, uGain: { value: new Color() }, uFlash: { value: new Color() }, uDesaturate: { value: 0 } } },
    ui: { hud: { busy } },
  } as unknown as GameContext;
  return { stage: new StageDirector(ctx), events, scene, applyLook, busy };
}

afterEach(() => vi.unstubAllGlobals());

describe('staged set piece resources', () => {
  it('bounds live paper resources after replacement, capture, chapter load and natural expiry', () => {
    const { stage, events, scene } = setup();
    const counts = disposalCounts();
    const cue = () => events.emit('story:cue', { id: 'k1-papers' });
    const peaks: number[] = [];
    const remaining: number[] = [];

    for (let i = 0; i < 4; i++) {
      cue();
      const first = scene.children[0];
      counts.watchTree(scene);
      cue();
      const replacement = scene.children[1];
      counts.watchTree(scene);
      stage.frame(0.1);
      expect(scene.children).toEqual([replacement]);
      expect(first?.parent).toBeNull();
      peaks.push(counts.live());

      if (i === 0) events.emit('player:caught', { by: 'combat' });
      else if (i === 1) events.emit('save:loaded', { slot: 'checkpoint' });
      else if (i === 2) events.emit('story:cue', { id: 'stage-off', data: { id: 'k1-papers' } });
      else for (let f = 0; f < 150; f++) stage.frame(0.1);
      stage.frame(0.1);
      expect(scene.children).toHaveLength(0);
      remaining.push(counts.live());
    }
    stage.dispose();
    expect(counts.repeated()).toEqual([]);
    expect(peaks).toEqual([3, 3, 3, 3]); // current mesh's instance buffer, geometry and material
    expect(remaining).toEqual([0, 0, 0, 0]);
  });

  it('drops a stone tableau on each shift and keeps unrelated stage pieces alive until cleared', () => {
    const { stage, events, scene } = setup();
    events.emit('story:cue', { id: 'k1-papers' });
    const papers = scene.children[0]!;
    const remaining: number[] = [];
    for (let i = 0; i < 3; i++) {
      const stones = disposalCounts();
      events.emit('story:cue', { id: 'k4-quader' });
      const tableau = scene.children.filter((node) => node !== papers);
      expect(tableau).toHaveLength(2);
      for (const node of tableau) stones.watchTree(node);
      expect(stones.live()).toBe(5);
      events.emit('shift:begin', { from: '1796', to: 'today' });
      stage.frame(0);
      expect(scene.children).toEqual([papers]);
      expect(stones.repeated()).toEqual([]);
      remaining.push(stones.live());
    }
    stage.dispose();
    expect(scene.children).toHaveLength(0);
    expect(remaining).toEqual([0, 0, 0]);
  });

  it('releases the rewind grade, shared cart geometry and instance buffers on load', () => {
    const { stage, events, scene, applyLook, busy } = setup();
    const counts = disposalCounts();
    events.emit('echo:start', { id: 'echo.k4.rueckwaerts' });
    counts.watchTree(scene);
    expect(counts.live()).toBeGreaterThan(5);
    stage.frame(0);
    expect(busy).toHaveBeenLastCalledWith('stage', true, 0);
    events.emit('save:loaded', { slot: 'checkpoint' });
    stage.frame(0);
    expect(scene.children).toHaveLength(0);
    expect(applyLook).toHaveBeenCalledOnce();
    expect(busy).toHaveBeenLastCalledWith('stage', false, 0);
    expect({ live: counts.live(), repeated: counts.repeated() }).toEqual({ live: 0, repeated: [] });
  });
});
