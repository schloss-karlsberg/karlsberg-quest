import { afterEach, describe, expect, it, vi } from 'vitest';
import { FixedStepLoop } from '../src/core/loop';
import { MemoryStorage, SETTINGS_KEY, SettingsStore } from '../src/core/save';
import { GameStateStore, createInitialState, deserializeState, serializeState } from '../src/core/state';

afterEach(() => { vi.unstubAllGlobals(); });

describe('game state transitions', () => {
  it('notifies after an update or replacement and lets a system detach before the next game', () => {
    const store = new GameStateStore(createInitialState());
    const seen: string[] = [];
    const off = store.subscribe((s, reason) => seen.push(`${reason} ${s.era} ${s.meta.shifts}`));
    store.mutable.meta.playSeconds = 2;
    expect(seen).toEqual([]);
    store.update((s) => {
      s.era = '1789';
      s.meta.shifts++;
    }, 'shift');
    expect(seen).toEqual(['shift 1789 1']);
    store.replace(createInitialState(), 'new');
    expect(seen).toEqual(['shift 1789 1', 'new today 0']);
    expect(store.state.meta.playSeconds).toBe(0);
    off();
    store.notify('refresh');
    expect(seen).toHaveLength(2);
  });

  it('resumes saved progress mid-action and gives new games their own inventory and slices', () => {
    const store = new GameStateStore(createInitialState());
    const previous = store.slice('hold', () => ({ ticks: 12 }));
    store.mutable.inventory.items.push('item.bussole');
    const checkpoint = serializeState(store.mutable);
    previous.ticks = 24;
    store.replace(deserializeState(checkpoint));
    const init = vi.fn(() => ({ ticks: 0 }));
    const resumed = store.slice('hold', init);
    expect(init).not.toHaveBeenCalled();
    expect(resumed).toEqual({ ticks: 12 });
    previous.ticks++;
    expect(resumed.ticks).toBe(12);
    expect(store.state.inventory.items).toEqual(['item.bussole']);
    store.replace(createInitialState());
    expect(store.state.inventory.items).toEqual([]);
    expect(store.slice('hold', init)).toEqual({ ticks: 0 });
    expect(init).toHaveBeenCalledOnce();
  });

  it('resumes fixed updates without replaying time spent paused', () => {
    const update = vi.fn();
    const loop = new FixedStepLoop({ update, render: () => {} }, 4);
    loop.frame(0);
    expect(loop.tick).toBe(1);
    loop.paused = true;
    loop.frame(15);
    loop.frame(60);
    expect(loop.time).toBe(0.25);
    loop.paused = false;
    loop.frame(60.125);
    expect(loop.tick).toBe(1);
    loop.frame(60.25);
    expect(loop.tick).toBe(2);
    expect(update.mock.calls).toEqual([[0.25], [0.25]]);
  });
});

describe('settings defaults and migrations', () => {
  it('uses independent OS preferences on first run and preserves explicit saved choices', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    const storage = new MemoryStorage();
    const first = new SettingsStore(storage);
    expect(first.state).toMatchObject({ reducedMotion: true, reducedFlash: true, highContrast: false });
    first.update((s) => { s.reducedMotion = false; });
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-contrast: more)' }));
    const restored = new SettingsStore(storage);
    expect(restored.state).toMatchObject({ reducedMotion: false, reducedFlash: true, highContrast: false });
    expect(new SettingsStore(new MemoryStorage()).state).toMatchObject({ reducedMotion: false, reducedFlash: false, highContrast: true });
  });

  it('carries mute, an empty key binding and disabled captions through a legacy settings update', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_KEY, JSON.stringify({
      volume: { master: 0 }, subtitleBg: 0, subtitles: false, bindings: { fly: ['KeyF'], measure: [] },
    }));
    const settings = new SettingsStore(storage);
    expect(settings.state.bindings).toEqual({ measure: [] });
    expect(settings.state.volume).toEqual({ master: 0, music: 0.7, sfx: 0.9, ambience: 0.8, voice: 0.9 });
    expect(settings.state.subtitleBg).toBe(0);
    settings.update((s) => { s.volume.music = 0; });
    const restored = new SettingsStore(storage).state;
    expect(restored.bindings).toEqual({ measure: [] });
    expect(restored.volume).toMatchObject({ master: 0, music: 0 });
    expect(restored.subtitles).toBe(false);
  });
});
