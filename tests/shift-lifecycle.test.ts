import { Color, Group, Line, Mesh, PerspectiveCamera, Points, Scene, Vector3, type WebGLRenderer, WebGLRenderTarget } from 'three';
import { WebGLAttributes } from 'three/src/renderers/webgl/WebGLAttributes.js';
import { WebGLBindingStates } from 'three/src/renderers/webgl/WebGLBindingStates.js';
import { WebGLGeometries } from 'three/src/renderers/webgl/WebGLGeometries.js';
import { WebGLInfo } from 'three/src/renderers/webgl/WebGLInfo.js';
import { WebGLObjects } from 'three/src/renderers/webgl/WebGLObjects.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tour from '../content/story/00-tour.story.json';
import { createInitialState, deserializeState } from '../src/core/state';
import type { GameContext } from '../src/core/context';
import type { Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { SunShadows } from '../src/render/shadows';
import { Quality } from '../src/systems/fx/quality';
import { ShiftEffect } from '../src/systems/fx/shift/shift';
import { SHIFT_DURATION, SHIFT_DURATION_REDUCED, SHIFT_MID, SHIFT_MID_REDUCED } from '../src/systems/fx/shift/timeline';
import { ShiftWarmer } from '../src/systems/fx/shift/warm';
import type { FxUI } from '../src/systems/fx/ui';
import quelle from '../src/systems/quelle';
import { ARRIVAL_PITCH, arrivalSpot } from '../src/systems/quelle/layout';
import { createStorySlice, runsOnResume, StoryEngine } from '../src/systems/story/engine';
import { HOME } from '../src/systems/story/hub/home';
import type { StoryFile } from '../src/systems/story/types';
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
      palace: { object: new Group(), triangles: 1, setMode: vi.fn(), uniforms: { uRuin: { value: 0 } } },
      forest: { object: new Group() }, heightfields: { '1789': flat, '2025': flat },
    },
    post: { uniforms: { uShift: { value: 0 }, uFlash: { value: new Color() }, uDesaturate: { value: 0 } } },
  };
  const ui = { caption: vi.fn(), setCompass: vi.fn() };
  const effect = new ShiftEffect(ctx as unknown as GameContext, ui as unknown as FxUI, new Quality('low'));
  return { ctx, effect, events, era, player, meta, scene };
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
    expect(phases[1]).toEqual(['shift:midpoint', 'today', true, 7, { ...journey, reason: 'return' }]);
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

it.each([false, true])('Continue at tour/t18 faces the palace and releases movement (reduced motion: %s)', (reduced) => {
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const { ctx, events, effect, era, player } = setup();
  const saved = createInitialState();
  Object.assign(saved.player, HOME.spawn);
  saved.systems.story = { ...createStorySlice(), active: true, chapter: 'tour', beat: 't18' };
  const restored = deserializeState(JSON.stringify(saved));
  era.set(restored.era);
  const { x, z } = restored.player;
  player.position.set(x, 0, z);
  const teleport = vi.fn((x: number, z: number) => player.position.set(x, 0, z));
  Object.assign(player, { teleport, pitch: 0, lookLocked: false });
  const clearing = { addClearing: vi.fn() };
  Object.assign(ctx.world.forest, clearing);
  Object.assign(ctx.world, { nature: { props: clearing, cover: clearing } });
  quelle.init(ctx as unknown as GameContext);
  try {
    const dip = vi.fn();
    events.on('quelle:dip', dip);
    const engine = new StoryEngine([tour as StoryFile], () => restored.systems.story!, {
      run: (actions, { resume }) => {
        for (const a of actions) if (a.do === 'shift' && (!resume || runsOnResume(a))) void effect.start(a.to, { reduced, reason: a.reason });
      },
      chapterEntered: () => {},
      beatEntered: () => {},
      chapterCompleted: () => {},
    });

    engine.resume();
    const midpoint = reduced ? SHIFT_MID_REDUCED : SHIFT_MID;
    effect.setTime(midpoint - 0.01);
    expect(era.current).toBe('today');
    expect(player.frozen).toBe(true);
    expect(teleport).not.toHaveBeenCalled();

    effect.setTime(midpoint);
    const arrival = arrivalSpot(x, z);
    expect(era.current).toBe('1789');
    expect(player.frozen).toBe(true);
    expect(teleport).toHaveBeenCalledExactlyOnceWith(arrival.x, arrival.z, arrival.yaw);
    expect(player).toMatchObject({ pitch: ARRIVAL_PITCH });

    effect.setTime(reduced ? SHIFT_DURATION_REDUCED : SHIFT_DURATION);
    expect(dip).not.toHaveBeenCalled();
    expect(player).toMatchObject({ frozen: false, lookLocked: false });
    expect(teleport).toHaveBeenCalledTimes(1);

    // A later ordinary trip into 1789 does not restage the spring arrival.
    era.set('today');
    void effect.start('1789', { reduced, reason: 'key' });
    effect.finish();
    expect(teleport).toHaveBeenCalledTimes(1);
  } finally {
    effect.dispose();
    quelle.dispose();
  }
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

it('deletes every shift buffer uploaded during warm-up when disposed before the first shift', async () => {
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const { ctx, effect } = setup();
  const createBuffer = vi.fn(() => ({}));
  const deleteBuffer = vi.fn<(buffer: WebGLBuffer) => void>();
  const gl = {
    ARRAY_BUFFER: 0x8892, ELEMENT_ARRAY_BUFFER: 0x8893, FLOAT: 0x1406,
    UNSIGNED_SHORT: 0x1403, MAX_VERTEX_ATTRIBS: 0x8869,
    createBuffer, deleteBuffer, getParameter: () => 8, bindBuffer() {}, bufferData() {},
  } as unknown as WebGLRenderingContext;
  const attributes = new WebGLAttributes(gl);
  const info = new WebGLInfo(gl);
  const bindingStates = new WebGLBindingStates(gl, attributes);
  // three.js takes bindingStates as its fourth argument, which its declaration omits.
  const geometries = Reflect.construct(WebGLGeometries, [gl, attributes, info, bindingStates]) as WebGLGeometries;
  const objects = new WebGLObjects(gl, geometries, attributes, bindingStates, info);
  const effectGeometries = effect.warmObjects().map((object) => (object as Mesh).geometry);
  const originalRanges = effectGeometries.map((geometry) => ({ ...geometry.drawRange }));
  const drawCounts: number[] = [];
  Object.assign(ctx.renderer, {
    compileAsync: async () => {},
    getRenderTarget: () => null,
    setRenderTarget() {},
    properties: { get: () => ({}) },
    render(scene: Scene) {
      info.render.frame++;
      scene.traverse((object) => {
        if (!(object instanceof Mesh || object instanceof Points || object instanceof Line)) return;
        const geometry = objects.update(object);
        drawCounts.push(geometry.drawRange.count);
        // Index buffers are uploaded by the renderer's vertex binding step.
        if (geometry.index) attributes.update(geometry.index, gl.ELEMENT_ARRAY_BUFFER);
      });
    },
  });
  const warmer = new ShiftWarmer(ctx as unknown as GameContext, {
    effect: () => effect.warmObjects(),
    extraTextures: () => [], templates: async () => [], registered: () => [],
  });

  for (let frame = 0; frame < 16 && warmer.stats.passes === 0; frame++) {
    warmer.frame(1, effect.active);
    await Promise.resolve();
  }
  expect(warmer.stats.passes).toBe(1);
  expect(warmer.stats.drawn).toBe(effect.warmObjects().length);
  expect(drawCounts).toEqual([1, 1, 1, 2, 3, 3, 3]);
  expect(effectGeometries.map((geometry) => geometry.drawRange)).toEqual(originalRanges);
  expect(createBuffer).toHaveBeenCalled();
  expect(deleteBuffer).not.toHaveBeenCalled();

  effect.dispose();
  expect(deleteBuffer).toHaveBeenCalledTimes(createBuffer.mock.calls.length);
  const deleted = new Set(deleteBuffer.mock.calls.map(([buffer]) => buffer));
  for (const { value } of createBuffer.mock.results) expect(deleted.has(value)).toBe(true);
  expect(info.memory.geometries).toBe(0);
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
