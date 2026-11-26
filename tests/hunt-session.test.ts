import { Scene, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import hunt from '../src/systems/hunt';
import { explorationSession } from './exploration-fixture';

function setup() {
  const { events, state, save, era, element } = explorationSession();
  const modals = { count: 0 };
  const player = {
    frozen: false, lookLocked: false, position: new Vector3(), stance: 'stand', yaw: 0, flying: false,
    stats: { speed: 0, noise: 0, visibility: 1, lanternLit: false },
  };
  const ceilingAt = vi.fn<() => number | null>(() => null);
  const loop = { time: 0, tick: 0 };
  const ctx = {
    state, events, save, era, loop, player, scene: new Scene(), audio: { bus: () => null, noise: () => null },
    systems: { get: () => undefined }, post: { uniforms: { uDesaturate: { value: 0 } } },
    data: { paths: { nodes: [], edges: [], kinds: [] } },
    ui: { layer: element, modals, toast: vi.fn(), hud: { busy: vi.fn() }, cards: { soft: vi.fn() } },
    world: {
      heightAt: () => 0, ceilingAt, surfaceAt: () => 'meadow', coverAt: () => 0,
      bounds: () => ({ x0: -500, x1: 500, z0: -500, z1: 500 }),
      collider: { enabled: false, resolve: (x: number, z: number) => ({ x, z, hit: false }) },
      look: { snow: 0 },
    },
    t: (key: string) => key, input: { wasPressed: () => false },
    settings: { state: { gentleMode: false, subtitles: false, soundIndicators: false } },
  } as unknown as GameContext;
  hunt.init(ctx);
  const step = (dt: number) => { loop.time += dt; loop.tick++; hunt.update(dt); };
  step(0);
  return { events, state, save, era, modals, player, ceilingAt, step, pack: window.kq!.hunt!, lamp: window.kq!.lantern! };
}

afterEach(() => {
  hunt.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the lantern during exploration', () => {
  it('burns only on active time in the past, at half speed indoors', () => {
    const { events, era, modals, ceilingAt, step, lamp } = setup();
    lamp.setSeconds(100);
    events.emit('lantern:request', { lit: true });
    step(10);
    expect(lamp.state().oil).toBe(1);
    era.set('1789');
    step(10);
    expect(lamp.state().oil).toBeCloseTo(0.9);
    events.emit('npc:conversation', { npc: 'test', open: true });
    step(25);
    expect(lamp.state().oil).toBeCloseTo(0.9);
    events.emit('npc:conversation', { npc: 'test', open: false });
    modals.count = 1;
    step(25);
    expect(lamp.state().oil).toBeCloseTo(0.9);
    modals.count = 0;
    ceilingAt.mockReturnValue(3);
    step(10);
    expect(lamp.state().oil).toBeCloseTo(0.85);
  });

  it('emits one exhaustion and restores both the flame and its visibility flag on load', () => {
    const { events, state, save, era, player, step, lamp } = setup();
    const empty = vi.fn();
    const toggle = vi.fn();
    events.on('lantern:empty', empty);
    events.on('lantern:toggle', toggle);
    era.set('1789');
    lamp.setSeconds(10);
    events.emit('lantern:request', { lit: true });
    step(5);
    save.save('1');
    step(5);
    step(5);
    expect(empty).toHaveBeenCalledTimes(1);
    expect(toggle.mock.calls.map(([e]) => e.lit)).toEqual([true, false]);
    expect(player.stats.lanternLit).toBe(false);
    expect(state.state.flags.lanternLit).toBe(false);
    save.load('1');
    expect(lamp.state()).toMatchObject({ lit: true, oil: 0.5, seconds: 10 });
    expect(player.stats.lanternLit).toBe(true);
    expect(state.state.flags.lanternLit).toBe(true);
  });
});

describe('loading a configured hunt', () => {
  it('cancels a pending capture when the loaded slot has no hunt', () => {
    const { era, events, save, player, step, pack } = setup();
    era.set('1789');
    save.save('safe');
    const caught = vi.fn();
    events.on('player:caught', caught);
    pack.start({ seed: 17 });
    pack.catch();
    expect(player.frozen).toBe(true);
    save.load('safe');
    step(2);
    expect(caught).not.toHaveBeenCalled();
    expect(player.frozen).toBe(false);
    expect(player.lookLocked).toBe(false);
    expect(pack.sim()).toBeNull();
  });

  it.each(['same', 'different'])('restores the saved pack over a live pack in the %s era', (where) => {
    const { era, events, save, step, pack } = setup();
    era.set('1789');
    events.emit('threat:configure', { kind: 'pack', active: true, hounds: 3, seed: 123 });
    expect(pack.sim()?.opt.seed).toBe(123);
    save.save('1');
    if (where === 'different') era.set('today');
    events.emit('threat:configure', { kind: 'pack', active: true, hounds: 5, seed: 456 });
    expect(pack.sim()?.opt.seed).toBe(456);
    save.load('1');
    step(1 / 60);
    expect(era.current).toBe('1789');
    expect(pack.sim()?.opt).toMatchObject({ seed: 123, hounds: 3 });
    expect(pack.saved()?.opts.seed).toBe(123);
    era.set('1796');
    expect(pack.sim()).toBeNull();
    expect(pack.saved()).toBeNull();
  });
});

it.each(['retune', 'switch mode'])('saves the effective pack configuration after a same-area %s', change => {
  const { pack, save, events, step } = setup();
  pack.start({ x: 80, z: 20, radius: 60, hounds: 7, pikeur: false, intensity: 0.2, seed: 410 });
  const mode = change === 'retune' ? 'patrol' : 'drive';
  events.emit('threat:configure', { kind: 'pack', active: true, mode, intensity: 0.8, target: mode === 'drive' ? { x: 90, z: 30 } : undefined });
  const expected = { mode, x: 80, z: 20, radius: 60, hounds: 7, pikeur: false, seed: 410, intensity: 0.8 };
  expect(pack.sim()?.opt).toMatchObject(expected);
  save.save('encounter');
  pack.stop();
  save.load('encounter');
  step(1 / 60);
  expect(pack.sim()?.opt).toMatchObject(expected);
});
