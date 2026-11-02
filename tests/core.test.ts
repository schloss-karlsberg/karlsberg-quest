import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/events';
import { FixedStepLoop } from '../src/core/loop';
import { GameStateStore, createInitialState, deserializeState, serializeState } from '../src/core/state';
import { MemoryStorage, SAVE_KEY, SETTINGS_KEY, SaveManager, SettingsStore } from '../src/core/save';
import { SystemRegistry, defineSystem, sortByDeps, type GameSystem } from '../src/core/systems';
import type { GameContext } from '../src/core/context';

describe('EventBus', () => {
  it('delivers typed payloads, supports off/once/onAny', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    const off = bus.on('era:change', (p) => seen.push(`${p.from}->${p.to}`));
    bus.once('scan:mode', (p) => seen.push(`scan${p.mode}`));
    const any: string[] = [];
    bus.onAny((n) => any.push(n));
    bus.emit('era:change', { from: 'today', to: '1789' });
    bus.emit('scan:mode', { mode: 2 });
    bus.emit('scan:mode', { mode: 3 });
    off();
    bus.emit('era:change', { from: '1789', to: 'today' });
    expect(seen).toEqual(['today->1789', 'scan2']);
    expect(any).toEqual(['era:change', 'scan:mode', 'scan:mode', 'era:change']);
  });

  it('isolates throwing handlers', () => {
    const bus = new EventBus();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let reached = false;
    bus.on('game:pause', () => {
      throw new Error('boom');
    });
    bus.on('game:pause', () => (reached = true));
    bus.emit('game:pause', { paused: true });
    expect(reached).toBe(true);
    spy.mockRestore();
  });
});

describe('FixedStepLoop', () => {
  it('runs a fixed number of updates for a given wall time (deterministic)', () => {
    const run = (frames: number[]) => {
      let ticks = 0;
      const loop = new FixedStepLoop({ update: () => ticks++, render: () => {} }, 60, () => 0, () => {});
      for (const t of frames) loop.frame(t);
      return ticks;
    };
    // 1 s of wall time in uneven frames → 60 updates (±1 for the first frame)
    const uneven = [0, 0.013, 0.05, 0.051, 0.12, 0.2, 0.33, 0.41, 0.5, 0.61, 0.72, 0.8, 0.9, 1.0];
    const even = Array.from({ length: 61 }, (_, i) => i / 60);
    expect(Math.abs(run(uneven) - run(even))).toBeLessThanOrEqual(1);
  });

  it('pause stops updates but keeps rendering; step(n) is exact', () => {
    let ticks = 0;
    let renders = 0;
    const loop = new FixedStepLoop({ update: () => ticks++, render: () => renders++ }, 60, () => 0, () => {});
    loop.paused = true;
    loop.frame(0);
    loop.frame(0.5);
    expect(ticks).toBe(0);
    expect(renders).toBe(2);
    loop.step(10);
    expect(ticks).toBe(10);
    expect(loop.tick).toBe(10);
    expect(loop.time).toBeCloseTo(10 / 60);
  });

  it('caps catch-up steps after a stall', () => {
    let ticks = 0;
    const loop = new FixedStepLoop({ update: () => ticks++, render: () => {} }, 60, () => 0, () => {});
    loop.frame(0);
    loop.frame(10);
    expect(ticks).toBeLessThanOrEqual(loop.maxStepsPerFrame + 1);
  });
});

describe('GameState + SaveManager', () => {
  it('round-trips through JSON and fills missing fields of old saves', () => {
    const s = createInitialState();
    s.era = '1793-07';
    s.inventory.clues.push('c1');
    s.systems.hunt = { alert: 0.5 };
    // a null default (savedAt) must take the saved value: "Weiterspielen" checks it to resume
    s.meta.savedAt = '2026-11-02T12:00:00.000Z';
    const back = deserializeState(serializeState(s));
    expect(back).toEqual(s);
    expect(back.meta.savedAt).toBe('2026-11-02T12:00:00.000Z');

    const old = deserializeState(JSON.stringify({ version: 0, era: 'nonsense', player: { x: 5 } }));
    expect(old.era).toBe('today');
    expect(old.player.x).toBe(5);
    expect(old.player.stance).toBe('stand');
    expect(old.inventory.nouns).toEqual([]);
    expect(() => deserializeState(JSON.stringify({ version: 999 }))).toThrow();
    expect(() => deserializeState('[]')).toThrow();
  });

  it('slice() lazily creates and returns a stable system state', () => {
    const store = new GameStateStore(createInitialState());
    const a = store.slice('demo', () => ({ n: 1 }));
    a.n = 2;
    expect(store.slice('demo', () => ({ n: 99 })).n).toBe(2);
  });

  it('saves under kq. keys, throttles autosave and loads back', () => {
    const storage = new MemoryStorage();
    const bus = new EventBus();
    let now = 1_000_000;
    const store = new GameStateStore(createInitialState());
    const saves = new SaveManager(store, storage, bus, () => now);
    const written: string[] = [];
    bus.on('save:written', (p) => written.push(p.reason));

    store.update((s) => (s.flags.met = true));
    expect(saves.autosave('a')).toBe(true);
    now += 1000;
    expect(saves.autosave('b')).toBe(false);
    expect(saves.autosave('c', true)).toBe(true);
    now += 6000;
    expect(saves.autosave('d')).toBe(true);
    expect(written).toEqual(['a', 'c', 'd']);
    expect(SAVE_KEY('auto').startsWith('kq.')).toBe(true);
    expect(storage.getItem(SAVE_KEY('auto'))).toContain('"met":true');

    const other = new GameStateStore(createInitialState());
    const loader = new SaveManager(other, storage);
    expect(loader.load()).toBe(true);
    expect(other.state.flags.met).toBe(true);
    expect(loader.load('missing')).toBe(false);
    storage.setItem(SAVE_KEY('bad'), '{not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loader.load('bad')).toBe(false);
    warn.mockRestore();

    saves.enabled = false;
    expect(saves.save('x')).toBe(false);
    expect(saves.has('x')).toBe(false);
  });

  it('persists settings', () => {
    const storage = new MemoryStorage();
    const a = new SettingsStore(storage);
    a.update((s) => (s.volume.music = 0.25));
    expect(SETTINGS_KEY.startsWith('kq.')).toBe(true);
    const b = new SettingsStore(storage);
    expect(b.state.volume.music).toBe(0.25);
    expect(b.state.volume.master).toBe(a.state.volume.master);
  });
});

describe('SystemRegistry', () => {
  const ctx = {} as GameContext;
  const sys = (id: string, after?: string[], extra: Partial<GameSystem> = {}): GameSystem => defineSystem({ id, after, ...extra });

  it('orders systems by dependencies, stable otherwise', () => {
    const order = sortByDeps([sys('c', ['b']), sys('a'), sys('b', ['a']), sys('d')].map((s) => ({ sys: s }))).map((e) => e.sys.id);
    expect(order).toEqual(['a', 'b', 'c', 'd']);
    expect(() => sortByDeps([sys('x', ['y']), sys('y', ['x'])].map((s) => ({ sys: s })))).toThrow(/cycle/);
  });

  it('disables a system that throws without stopping the others', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reg = new SystemRegistry();
    const calls: string[] = [];
    reg.registerSystem(sys('bad', undefined, { update: () => { throw new Error('x'); } }));
    reg.registerSystem(sys('good', ['bad'], { init: () => void calls.push('init'), update: () => void calls.push('u') }));
    expect(() => reg.registerSystem(sys('good'))).toThrow(/twice/);
    await reg.initAll(ctx);
    reg.update(1 / 60, ctx);
    reg.update(1 / 60, ctx);
    expect(calls).toEqual(['init', 'u', 'u']);
    expect(reg.stats().find((s) => s.id === 'bad')?.failed).toBe(true);
    err.mockRestore();
  });
});
