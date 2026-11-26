import { Color, Group, PerspectiveCamera, Scene, Vector3, type WebGLRenderer, WebGLRenderTarget } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import type { Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { SunShadows } from '../src/render/shadows';
import { Quality } from '../src/systems/fx/quality';
import { ShiftEffect } from '../src/systems/fx/shift/shift';
import { SHIFT_DURATION, SHIFT_DURATION_REDUCED, SHIFT_MID, SHIFT_MID_REDUCED } from '../src/systems/fx/shift/timeline';
import type { FxUI } from '../src/systems/fx/ui';
import { Heightfield } from '../src/world/heightfield';
import { disposalCounts } from './disposal-counts';

function setup(frozen = false) {
  const events = new EventBus();
  const player = { position: new Vector3(), frozen };
  const meta = { shifts: 7 };
  const era = { current: '1789' as Era, set(to: Era) { era.current = to; } };
  const scene = new Scene();
  const flat = new Heightfield({ cols: 4, rows: 4, cell: 8, x0: -12, z0: -12 }, new Float32Array(16));
  const ctx = {
    events, player, era, scene, audio: {}, state: { mutable: { meta } },
    camera: new PerspectiveCamera(), renderer: { domElement: { height: 360 } }, settings: { state: { reducedFlash: true } },
    world: {
      palace: { object: new Group(), setMode: vi.fn(), uniforms: { uRuin: { value: 0 } } },
      forest: { object: new Group() }, heightfields: { '1789': flat, '2025': flat },
    },
    post: { uniforms: { uShift: { value: 0 }, uFlash: { value: new Color() }, uDesaturate: { value: 0 } } },
  };
  const ui = { caption: vi.fn(), setCompass: vi.fn() };
  const effect = new ShiftEffect(ctx as unknown as GameContext, ui as unknown as FxUI, new Quality('low'));
  return { effect, events, era, player, meta, scene };
}

afterEach(() => vi.restoreAllMocks());

describe('reduced-motion shift lifecycle', () => {
  it('switches once at the midpoint and restores movement before announcing completion', async () => {
    const { effect, events, era, player, meta } = setup();
    const phases: unknown[] = [];
    events.onAny((name, payload) => phases.push([name, era.current, player.frozen, meta.shifts, payload]));
    const end = effect.start('today', { reduced: true, reason: 'return' });
    const journey = { from: '1789', to: 'today' };
    expect(phases).toEqual([['shift:begin', '1789', false, 7, journey]]);
    expect(player.frozen).toBe(true);
    effect.advance(SHIFT_MID_REDUCED - 0.01);
    effect.frozen = true;
    effect.advance(SHIFT_DURATION_REDUCED);
    expect(era.current).toBe('1789');
    expect(effect.t).toBeCloseTo(SHIFT_MID_REDUCED - 0.01);
    effect.frozen = false;
    effect.setTime(SHIFT_MID_REDUCED);
    expect(phases[1]).toEqual(['shift:midpoint', 'today', true, 7, journey]);
    expect(effect.holdRadius).toBe(0);
    effect.setTime(0);
    effect.setTime(SHIFT_MID_REDUCED);
    effect.advance(SHIFT_DURATION_REDUCED);
    await end;
    effect.finish();
    expect(phases.slice(2)).toEqual([['shift:done', 'today', false, 8, { ...journey, reason: 'return' }]]);
    expect(effect.active).toBe(false);
    effect.dispose();
  });

  it('finishes an early capture return without counting a player shift or unlocking story movement', async () => {
    const { effect, events, era, player, meta } = setup(true);
    const done = vi.fn();
    events.on('shift:done', done);
    const end = effect.start('today', { reduced: true, reason: 'caught' });
    effect.finish();
    await end;
    expect(done).toHaveBeenCalledExactlyOnceWith({ from: '1789', to: 'today', reason: 'caught' });
    expect(era.current).toBe('today');
    expect(player.frozen).toBe(true);
    expect(meta.shifts).toBe(7);
    effect.dispose();
  });
});

it('retires the point clouds on full shifts and releases reusable passes only at teardown', async () => {
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const { effect, era, scene } = setup();
  const counts = disposalCounts();
  const warm = effect.warmObjects();
  for (const object of warm) counts.watchTree(object);
  const baseline = counts.live();
  expect(warm.length).toBeGreaterThan(scene.children.length);

  for (const to of ['today', '1789', 'today'] as const) {
    const done = effect.start(to, { reduced: false });
    counts.watchTree(scene);
    const beforeMidpoint = counts.live();
    expect(beforeMidpoint).toBeGreaterThan(baseline);
    effect.setTime(SHIFT_MID);
    expect(era.current).toBe(to);
    effect.advance(0);
    counts.watchTree(scene);
    expect(counts.live()).toBeGreaterThan(beforeMidpoint);
    effect.setTime(SHIFT_DURATION);
    await done;
    expect(scene.children).toHaveLength(3);
    expect(counts.live()).toBe(baseline);
    expect(effect.warmObjects()).toEqual(warm);
  }
  effect.dispose();
  expect(scene.children).toHaveLength(0);
  expect(counts.repeated()).toEqual([]);
  expect(counts.live()).toBe(0);
});

it('keeps one shadow render target across repeated map reconfigurations', () => {
  const shadows = new SunShadows();
  const counts = disposalCounts();
  const saved = new WebGLRenderTarget(1, 1);
  const bind = vi.fn<(target: WebGLRenderTarget | null) => void>();
  const renderer = { getRenderTarget: () => saved, setRenderTarget: bind, render() {} } as unknown as WebGLRenderer;
  const scene = new Scene();

  for (const size of [512, 1024, 512, 1024]) {
    shadows.configure(size, 60, 8);
    bind.mockClear();
    shadows.warm(renderer, scene);
    const target = bind.mock.calls[0]![0]!;
    counts.watch(target);
    expect(target.width).toBe(size);
    expect(target.depthTexture).not.toBeNull();
    expect(bind.mock.calls).toEqual([[target], [saved]]);
    expect(counts.live()).toBe(1);

    shadows.configure(size, 50, 4);
    bind.mockClear();
    shadows.warm(renderer, scene);
    expect(bind.mock.calls[0]![0]).toBe(target);
    expect(counts.calls(target)).toBe(0);
  }
  shadows.configure(0, 50, 4);
  bind.mockClear();
  shadows.warm(renderer, scene);
  expect(shadows.enabled).toBe(false);
  expect(bind).not.toHaveBeenCalled();
  expect(counts.live()).toBe(0);
  expect(counts.repeated()).toEqual([]);
  shadows.dispose();
  saved.dispose();
});
