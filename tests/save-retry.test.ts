import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SAVE_KEY, SaveManager } from '../src/core/save';
import * as gameState from '../src/core/state';

afterEach(() => vi.restoreAllMocks());

describe('save checkpoints', () => {
  it('keeps the last successful timestamp and permits retry after a rejected write', () => {
    let now = 0;
    const state = new gameState.GameStateStore(gameState.createInitialState());
    const storage = new MemoryStorage();
    const events = new EventBus();
    const saves = new SaveManager(state, storage, events, () => now, () => now);
    const written = vi.fn();
    events.on('save:written', written);
    expect(saves.autosave('start')).toBe(true);
    expect(saves.peek()?.meta.savedAt).toBe(new Date(now).toISOString());
    const original = storage.getItem(SAVE_KEY('auto'));

    now = saves.minIntervalMs;
    state.mutable.era = '1789';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(storage, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    expect(saves.autosave('era')).toBe(false);
    expect(storage.getItem(SAVE_KEY('auto'))).toBe(original);
    expect(written).toHaveBeenCalledTimes(1);
    expect.soft(state.state.meta.savedAt).toBe(new Date(0).toISOString());

    expect(saves.autosave('retry')).toBe(true);
    expect(saves.peek()?.era).toBe('1789');
    expect(saves.peek()?.meta.savedAt).toBe(new Date(now).toISOString());
    expect(state.state.meta.savedAt).toBe(new Date(now).toISOString());
    expect(written).toHaveBeenLastCalledWith({ slot: 'auto', reason: 'retry' });
    expect(saves.autosave('same step')).toBe(false);
  });

  it('backs off after two consecutive failures and resets after storage recovers', () => {
    let now = 0;
    const state = new gameState.GameStateStore(gameState.createInitialState());
    const storage = new MemoryStorage();
    const saves = new SaveManager(state, storage, undefined, () => now, () => now);
    const serialize = vi.spyOn(gameState, 'serializeState');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const write = vi.spyOn(storage, 'setItem');
    const fail = () => { throw new Error('quota'); };
    write.mockImplementation(fail);

    for (let i = 0; i < 6; i++) {
      expect(saves.autosave('chestnut', i % 2 === 1)).toBe(false);
    }
    expect.soft(serialize).toHaveBeenCalledTimes(2);
    expect.soft(write).toHaveBeenCalledTimes(2);
    expect.soft(warn).toHaveBeenCalledTimes(2);

    now = 999;
    expect(saves.autosave('before backoff ends')).toBe(false);
    expect(write).toHaveBeenCalledTimes(2);

    now = 1000;
    expect(saves.autosave('storage still unavailable')).toBe(false);
    expect(write).toHaveBeenCalledTimes(3);
    expect(saves.autosave('renewed backoff', true)).toBe(false);
    expect(write).toHaveBeenCalledTimes(3);

    write.mockRestore();
    now = 2000;
    expect(saves.autosave('storage recovered')).toBe(true);

    now += saves.minIntervalMs;
    vi.spyOn(storage, 'setItem').mockImplementationOnce(fail);
    expect(saves.autosave('new failure')).toBe(false);
    expect(saves.autosave('immediate retry after recovery')).toBe(true);
  });

  it('uses elapsed time for backoff and throttling after the wall clock moves backwards', () => {
    let elapsed = 0;
    const wallClock = vi.spyOn(Date, 'now').mockReturnValue(3_600_000);
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const state = new gameState.GameStateStore(gameState.createInitialState());
    const storage = new MemoryStorage();
    const saves = new SaveManager(state, storage);
    const fail = () => { throw new Error('quota'); };
    const write = vi.spyOn(storage, 'setItem').mockImplementationOnce(fail).mockImplementationOnce(fail);

    expect(saves.autosave('start', true)).toBe(false);
    expect(saves.autosave('retry', true)).toBe(false);
    wallClock.mockReturnValue(0);
    elapsed = 999;
    expect(saves.autosave('before recovery', true)).toBe(false);
    expect(write).toHaveBeenCalledTimes(2);
    elapsed = 1000;
    expect(saves.autosave('era', true)).toBe(true);
    expect(saves.peek()?.meta.savedAt).toBe(new Date(0).toISOString());
    wallClock.mockReturnValue(7_200_000);
    expect(saves.autosave('same step')).toBe(false);
    elapsed += saves.minIntervalMs;
    expect(saves.autosave('interval')).toBe(true);
    expect(saves.peek()?.meta.savedAt).toBe(new Date(7_200_000).toISOString());
  });

  it('retries a forced checkpoint when backoff expires after a cinematic', () => {
    let elapsed = 0;
    const state = new gameState.GameStateStore(gameState.createInitialState());
    const storage = new MemoryStorage();
    const events = new EventBus();
    const saves = new SaveManager(state, storage, events, () => 0, () => elapsed);
    const written = vi.fn();
    events.on('save:written', written);
    expect(saves.autosave('start', true)).toBe(true);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fail = () => { throw new Error('quota'); };
    const write = vi.spyOn(storage, 'setItem').mockImplementationOnce(fail).mockImplementationOnce(fail);
    saves.autosave('first failure', true);
    saves.autosave('second failure', true);

    saves.hold('cinematic', true);
    state.mutable.era = '1789';
    expect(saves.autosave('era', true)).toBe(false);
    saves.hold('cinematic', false);
    expect(saves.peek()?.era).toBe('today');
    elapsed = 999;
    saves.retryAutosave();
    expect(write).toHaveBeenCalledTimes(2);

    elapsed = 1000;
    state.mutable.player.x = 42;
    saves.retryAutosave();
    expect(saves.peek()).toMatchObject({ era: '1789', player: { x: 42 } });
    expect(written).toHaveBeenLastCalledWith({ slot: 'auto', reason: 'era' });
    saves.retryAutosave();
    expect(write).toHaveBeenCalledTimes(3);
  });

  it.each(['hidden', 'title'])('gives %s one immediate attempt during storage backoff', (reason) => {
    const state = new gameState.GameStateStore(gameState.createInitialState());
    const storage = new MemoryStorage();
    const saves = new SaveManager(state, storage, undefined, () => 0, () => 0);
    expect(saves.autosave('start', true)).toBe(true);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fail = () => { throw new Error('quota'); };
    const write = vi.spyOn(storage, 'setItem').mockImplementationOnce(fail).mockImplementationOnce(fail);
    saves.autosave('first failure', true);
    saves.autosave('second failure', true);

    saves.hold('cinematic', true);
    state.mutable.era = '1789';
    expect(saves.flushAutosave(reason)).toBe(false);
    expect(write).toHaveBeenCalledTimes(2);
    saves.hold('cinematic', false);
    expect(saves.peek()?.era).toBe('today');
    expect(saves.autosave('ending', true)).toBe(false);

    write.mockImplementationOnce(fail);
    expect(saves.flushAutosave(reason)).toBe(false);
    expect(write).toHaveBeenCalledTimes(3);
    saves.retryAutosave();
    expect(write).toHaveBeenCalledTimes(3);
    expect(saves.peek()?.era).toBe('today');

    expect(saves.flushAutosave(reason)).toBe(true);
    expect(write).toHaveBeenCalledTimes(4);
    expect(saves.peek()?.era).toBe('1789');
  });

  it.each(['load', 'delete'])('discards pending autosaves on %s before the next session', (transition) => {
    let elapsed = 0;
    const state = new gameState.GameStateStore(gameState.createInitialState());
    const storage = new MemoryStorage();
    const saves = new SaveManager(state, storage, undefined, () => 0, () => elapsed);
    expect(saves.autosave('start', true)).toBe(true);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fail = () => { throw new Error('quota'); };
    const write = vi.spyOn(storage, 'setItem').mockImplementationOnce(fail).mockImplementationOnce(fail);
    saves.autosave('first failure', true);
    saves.autosave('second failure', true);
    saves.hold('cinematic', true);
    saves.autosave('ending', true);

    if (transition === 'load') expect(saves.load()).toBe(true);
    else saves.delete();
    elapsed = 1000;
    saves.hold('cinematic', false);
    saves.retryAutosave();
    expect(write).toHaveBeenCalledTimes(2);
  });
});
