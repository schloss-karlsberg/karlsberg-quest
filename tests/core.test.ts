import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/events';
import { FixedStepLoop, FramePacer, IDLE_RENDER, type PaceState, frameCap, renderRate } from '../src/core/loop';
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

describe('render pacing (frame cap)', () => {
  /** Which of `n` animation frames at `hz` (with ± `jitter` s on the timestamps) the pacer draws at `fps`. */
  const pattern = (hz: number, fps: number, n: number, jitter = 0, seed = 7) => {
    const p = new FramePacer();
    let x = seed;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      x = (x * 1664525 + 1013904223) >>> 0;
      const j = jitter * ((x / 4294967296) * 2 - 1);
      if (p.tick(i / hz + j, fps)) out.push(i);
    }
    return out;
  };
  const gaps = (idx: number[]) => idx.slice(1).map((v, i) => v - idx[i]!);

  it('60 fps on a 120 Hz screen: exactly every 2nd frame; 30 fps: every 4th', () => {
    const d60 = pattern(120, 60, 240);
    expect(d60.length).toBe(120);
    expect(new Set(gaps(d60))).toEqual(new Set([2]));
    const d30 = pattern(120, 30, 240);
    expect(d30.length).toBe(60);
    expect(new Set(gaps(d30))).toEqual(new Set([4]));
  });

  it('steady under timestamp jitter (±1.5 ms at 120 Hz)', () => {
    expect(new Set(gaps(pattern(120, 60, 600, 0.0015)))).toEqual(new Set([2]));
    expect(new Set(gaps(pattern(120, 30, 600, 0.0015)))).toEqual(new Set([4]));
  });

  it('60 Hz screen: 60 fps draws every frame (even with jitter), 30 fps every 2nd', () => {
    expect(pattern(60, 60, 120, 0.003).length).toBe(120);
    expect(new Set(gaps(pattern(60, 30, 120)))).toEqual(new Set([2]));
  });

  it('144 Hz: averages to the cap; slower screens and unbegrenzt draw every frame; 0 draws nothing', () => {
    const d = pattern(144, 60, 1440);
    expect(d.length).toBeGreaterThanOrEqual(598);
    expect(d.length).toBeLessThanOrEqual(602);
    expect(new Set(gaps(d))).toEqual(new Set([2, 3]));
    expect(pattern(50, 60, 100).length).toBe(100);
    expect(pattern(120, Infinity, 100).length).toBe(100);
    expect(pattern(120, 0, 100).length).toBe(0);
  });

  it('the first frame after an idle phase is drawn at once, then the pacing resumes', () => {
    const p = new FramePacer();
    for (let i = 0; i < 10; i++) p.tick(i / 120, 0);
    expect(p.tick(10 / 120, 60)).toBe(true);
    expect(p.tick(11 / 120, 60)).toBe(false);
    expect(p.tick(12 / 120, 60)).toBe(true);
  });

  it('the fixed 60 Hz simulation does not depend on the render cap', () => {
    const run = (fps: number) => {
      let ticks = 0;
      let renders = 0;
      const loop = new FixedStepLoop({ update: () => ticks++, render: () => renders++ }, 60, () => 0, () => {});
      loop.pace = () => fps;
      for (let i = 0; i <= 240; i++) loop.frame(i / 120); // 2 s on a 120 Hz screen
      return { ticks, renders, tick: loop.tick };
    };
    const free = run(Infinity);
    const c60 = run(60);
    const c30 = run(30);
    expect(c60.ticks).toBe(free.ticks);
    expect(c30.ticks).toBe(free.ticks);
    expect(Math.abs(free.ticks - 120)).toBeLessThanOrEqual(1);
    expect(free.renders).toBe(241);
    expect(c60.renders).toBe(121);
    expect(c30.renders).toBe(61);
  });

  it('render frameDt is the time since the previous drawn frame; requests force frames', () => {
    const dts: number[] = [];
    const loop = new FixedStepLoop({ update: () => {}, render: (dt) => dts.push(dt) }, 60, () => 0, () => {});
    let fps = 30;
    loop.pace = () => fps;
    for (let i = 0; i <= 8; i++) loop.frame(i / 120);
    expect(dts.length).toBe(3);
    expect(dts[1]).toBeCloseTo(1 / 30, 5);
    // on demand: nothing until asked, then exactly the frames asked for
    fps = 0;
    dts.length = 0;
    for (let i = 9; i <= 30; i++) loop.frame(i / 120);
    expect(dts.length).toBe(0);
    loop.requestRender(2);
    for (let i = 31; i <= 40; i++) loop.frame(i / 120);
    expect(dts.length).toBe(2);
    // after a held view the visuals go on with one fixed step, not the idle gap
    expect(dts[0]).toBeCloseTo(1 / 60, 5);
    expect(dts[1]).toBeCloseTo(1 / 120, 5);
  });

  it('kq.step / renderOnce render at once whatever the pacing; manual stops the simulation', () => {
    let ticks = 0;
    let renders = 0;
    const loop = new FixedStepLoop({ update: () => ticks++, render: () => renders++ }, 60, () => 0, () => {});
    loop.pace = () => 0;
    loop.manual = true;
    for (let i = 0; i < 60; i++) loop.frame(i / 60);
    expect(ticks).toBe(0);
    expect(renders).toBe(0);
    loop.step(5);
    expect(ticks).toBe(5);
    expect(renders).toBe(1);
    loop.renderOnce(0.1);
    expect(renders).toBe(2);
  });

  it('keeps the visual clock at the explicitly rendered time during manual capture', () => {
    const deltas: number[] = [];
    const loop = new FixedStepLoop({ update: () => {}, render: (dt) => deltas.push(dt) });
    loop.manual = true;
    loop.holdVisualTime = true;
    loop.frame(0);
    loop.frame(0.22);
    loop.advance(3);
    loop.renderOnce(0.1);
    loop.renderOnce(0.1);
    loop.frame(1.5);
    expect(deltas).toEqual([0, 0, 0.1, 0.1, 0]);
    expect(loop.tick).toBe(3);
    loop.manual = false;
    loop.frame(1.7);
    expect(deltas.at(-1)).toBeCloseTo(0.2);
  });

  it('parks the rAF loop while nothing moves and nothing is asked for; wakes on a request', () => {
    // a fake requestAnimationFrame whose cancel really removes the callback
    const queue = new Map<number, FrameRequestCallback>();
    let id = 0;
    const loop = new FixedStepLoop(
      { update: () => {}, render: () => {} },
      60,
      (fn) => (queue.set(++id, fn), id),
      (i) => void queue.delete(i),
    );
    let fps = 0;
    loop.pace = () => fps;
    loop.paused = true;
    loop.start();
    let t = 0;
    const pump = () => {
      const [k, fn] = [...queue][0] ?? [];
      if (k === undefined || !fn) return false;
      queue.delete(k);
      fn((t += 1000 / 120));
      return true;
    };
    expect(pump()).toBe(true);
    // paused, nothing to draw: parked, no animation frame pending
    expect(queue.size).toBe(0);
    expect(loop.drawn).toBe(0);
    loop.requestRender();
    expect(queue.size).toBe(1);
    pump();
    expect(loop.drawn).toBe(1);
    expect(queue.size).toBe(0);
    // un-pausing wakes it and it keeps running
    fps = 60;
    loop.paused = false;
    for (let i = 0; i < 4; i++) expect(pump()).toBe(true);
    expect(queue.size).toBe(1);
    expect(loop.drawn).toBe(3);
    loop.stop();
    expect(queue.size).toBe(0);
  });

  it('policy: cap while playing, ≤ 30 on the title, menus 15 or held, bullet time on request, hidden nothing', () => {
    const base: PaceState = { cap: 60, hidden: false, manual: false, hold: true, title: false, modal: 'none', modalAge: 10, paused: false };
    const r = (o: Partial<PaceState>) => renderRate({ ...base, ...o });
    expect(r({})).toBe(60);
    expect(r({ cap: Infinity })).toBe(Infinity);
    expect(r({ cap: 30 })).toBe(30);
    expect(r({ title: true, paused: true })).toBe(IDLE_RENDER.titleFps);
    expect(r({ title: true, cap: Infinity })).toBe(30);
    expect(r({ title: true, cap: 30 })).toBe(30);
    // pause menu / journal / map: the paused view cannot change, its frame is held
    expect(r({ modal: 'still', paused: true })).toBe(0);
    // a live modal (dialogue) renders at the cap while its camera settles, then at 15
    expect(r({ modal: 'live', paused: true, modalAge: 0.2 })).toBe(60);
    expect(r({ modal: 'live', paused: true })).toBe(IDLE_RENDER.modalFps);
    // a modal over the title: the drift goes on behind it, slowly
    expect(r({ modal: 'still', title: true, paused: true })).toBe(15);
    expect(r({ paused: true })).toBe(15);
    expect(r({ manual: true })).toBe(0);
    expect(r({ hidden: true })).toBe(0);
    // WebDriver without ?idle: bullet time renders as before (the cap), still menus at 15
    expect(r({ manual: true, hold: false })).toBe(60);
    expect(r({ modal: 'still', paused: true, hold: false })).toBe(15);
    expect(r({ hidden: true, hold: false })).toBe(0);
  });

  it('frameCap: Bildrate 30 / 60 / unbegrenzt, Energiesparen caps at 30', () => {
    expect(frameCap(60, false)).toBe(60);
    expect(frameCap(30, false)).toBe(30);
    expect(frameCap(0, false)).toBe(Infinity);
    expect(frameCap(0, true)).toBe(30);
    expect(frameCap(60, true)).toBe(30);
    expect(frameCap(undefined, undefined)).toBe(60);
    expect(frameCap(Number.NaN, false)).toBe(60);
    expect(frameCap(5, false)).toBe(15);
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
    const saves = new SaveManager(store, storage, bus, () => now, () => now);
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

  it('preserves saved slots through a nosave new game and allows deletion when enabled', () => {
    const storage = new MemoryStorage();
    const store = new GameStateStore(createInitialState());
    const saves = new SaveManager(store, storage);
    store.mutable.flags.played = true;
    saves.save();
    saves.save('ending');
    const original = storage.getItem(SAVE_KEY('auto'));
    const ending = storage.getItem(SAVE_KEY('ending'));
    saves.enabled = false;
    saves.delete();
    saves.delete('ending');
    store.replace(createInitialState(), 'new');
    expect(saves.autosave('start', true)).toBe(false);
    expect(store.state.flags.played).toBeUndefined();
    expect(storage.getItem(SAVE_KEY('auto'))).toBe(original);
    expect(storage.getItem(SAVE_KEY('ending'))).toBe(ending);
    saves.enabled = true;
    saves.delete();
    expect(saves.has()).toBe(false);
    expect(saves.has('ending')).toBe(true);
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
