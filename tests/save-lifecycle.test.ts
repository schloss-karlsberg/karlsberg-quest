import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SaveManager } from '../src/core/save';
import { createInitialState, deserializeState, GameStateStore, serializeState } from '../src/core/state';
import { MAX_LEVEL } from '../src/rpg/stats';
import { createProgressionSlice, XP_CAP } from '../src/systems/progression/logic';
import { createQuestSlice } from '../src/systems/quests/logic';
import { createStorySlice } from '../src/systems/story/engine';

describe('checkpoint lifecycle', () => {
  it('writes the final era after both holds end and keeps a manual save made during the hold', () => {
    const store = new GameStateStore(createInitialState());
    const events = new EventBus();
    const saves = new SaveManager(store, new MemoryStorage(), events, () => 1000);
    const writes: string[] = [];
    events.on('save:written', ({ slot, reason }) => writes.push(`${slot}/${reason}`));
    saves.autosave('start');
    saves.hold('cinematic', true);
    saves.hold('shift', true);
    expect(saves.autosave('era', true)).toBe(false);
    expect(saves.autosave('objective')).toBe(false);
    expect(saves.save('checkpoint')).toBe(true);
    store.mutable.era = '1789';
    saves.hold('cinematic', false);
    saves.hold('cinematic', false);
    expect(saves.held).toBe(true);
    expect(saves.peek()?.era).toBe('today');
    saves.hold('shift', false);
    expect(saves.held).toBe(false);
    expect(saves.peek()?.era).toBe('1789');
    expect(writes).toEqual(['auto/start', 'checkpoint/manual', 'auto/objective']);
    saves.delete();
    expect(saves.peek()).toBeNull();
    expect(saves.peek('checkpoint')?.era).toBe('today');
  });

  it.todo('Decide whether a held, unforced autosave released inside the five-second throttle window must write immediately');

  it('restores the saved inventory before notifying systems, even when the coordinates and item count are zero', () => {
    const store = new GameStateStore(createInitialState());
    const events = new EventBus();
    const saves = new SaveManager(store, new MemoryStorage(), events, () => 0);
    store.mutable.player.x = 0;
    const beforeLoad = store.slice('progression', createProgressionSlice);
    beforeLoad.inventory['item.balsam'] = 0;
    saves.save('checkpoint');
    beforeLoad.inventory['item.balsam'] = 2;
    store.mutable.player.x = 100;
    const seen: string[] = [];
    store.subscribe((state, reason) => seen.push(`${reason}: x=${state.player.x}`));
    events.on('save:loaded', ({ slot }) => {
      const restored = store.slice('progression', createProgressionSlice);
      seen.push(`${slot}: balsam=${restored.inventory['item.balsam']}`);
    });
    expect(saves.load('checkpoint')).toBe(true);
    expect(seen).toEqual(['load: x=0', 'checkpoint: balsam=0']);
    beforeLoad.inventory['item.balsam'] = 9;
    expect(store.state.systems.progression?.inventory['item.balsam']).toBe(0);
  });

  it('settles a legacy turn-in at the item and XP caps, preserving earned talents and read history', () => {
    const state = createInitialState();
    state.systems.story = { ...createStorySlice(), chapter: 'prolog', beat: 'p3' };
    state.systems.quests = { ...createQuestSlice(), quests: {
      'q.p.relief': { state: 'ready', counts: { damm: 1, mauer: 1, nebel: 1, stufe: 1 }, t: 42 },
    } };
    state.systems.progression = {
      ...createProgressionSlice(), xp: XP_CAP - 1, level: MAX_LEVEL - 1, points: 8,
      talents: { 'stab.wucht': 2 }, inventory: { 'item.balsam': 8 }, codexXp: ['rm.07'],
    };
    state.codex.facts.push('rm.07');
    const migrated = deserializeState(serializeState(state));
    expect(migrated.systems.progression).toMatchObject({
      xp: XP_CAP, level: MAX_LEVEL, points: 9, talents: { 'stab.wucht': 2 }, inventory: { 'item.balsam': 9 },
    });
    expect(migrated.systems.quests?.quests['q.p.relief'].state).toBe('done');
    expect(migrated.codex.facts).toEqual(['rm.07', 'rm.08']);
    expect(migrated.systems.quests?.unseen).not.toContain('rm.07');
    expect(migrated.systems.quests?.unseen).toContain('rm.08');
    expect(deserializeState(serializeState(migrated))).toEqual(migrated);
  });
});
