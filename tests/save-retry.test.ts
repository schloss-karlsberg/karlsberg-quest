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
    const saves = new SaveManager(state, storage, events, () => now);
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
    const saves = new SaveManager(state, storage, undefined, () => now);
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
});
