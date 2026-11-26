import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SAVE_KEY, SaveManager } from '../src/core/save';
import { createInitialState, GameStateStore } from '../src/core/state';

afterEach(() => vi.restoreAllMocks());

describe('save checkpoints', () => {
  it('keeps the last successful timestamp and permits retry after a rejected write', () => {
    let now = 0;
    const state = new GameStateStore(createInitialState());
    const storage = new MemoryStorage();
    const events = new EventBus();
    const saves = new SaveManager(state, storage, events, () => now);
    const written = vi.fn();
    events.on('save:written', written);
    saves.autosave('start');
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
    expect(state.state.meta.savedAt).toBe(new Date(now).toISOString());
    expect(written).toHaveBeenLastCalledWith({ slot: 'auto', reason: 'retry' });
    expect(saves.autosave('same step')).toBe(false);
  });
});
