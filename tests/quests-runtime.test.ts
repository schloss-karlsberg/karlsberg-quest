import { Scene } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SaveManager } from '../src/core/save';
import { GameStateStore, createInitialState } from '../src/core/state';
import { itemDef } from '../src/rpg/items';
import { ProgressionCore, createProgressionSlice } from '../src/systems/progression/logic';
import quests, { createQuestSlice } from '../src/systems/quests';
import { RewardNotice } from '../src/systems/quests/hud';

// Only the DOM nodes are stubbed. Quest, reward queue, events and saves use the real code.
vi.mock('../src/ui/dom', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/ui/dom')>(),
  h: () => ({
    classList: { add() {}, remove() {}, toggle() {} },
    dataset: {}, style: {}, append() {}, remove() {}, replaceChildren() {}, querySelector: () => null,
  }),
  svg: () => ({}),
}));

const JAGUAR = 'q.k3.jaguar';
const OIL = 'item.lampenoel';

function setup(stranded = false) {
  const state = new GameStateStore(createInitialState());
  const events = new EventBus();
  const save = new SaveManager(state, new MemoryStorage(), events);
  const reasons = new Set([stranded ? 'title' : 'modal']);
  state.mutable.systems.menagerie = { animals: [], calmed: ['k3.jaguar'] };
  state.mutable.codex.facts.push('cx.12');
  const dialogue: string[] = [];
  // Story registers before quests and clears its presenter on start and on an in-game load.
  events.on('game:start', () => { dialogue.length = 0; });
  events.on('save:loaded', () => { dialogue.length = 0; });
  events.on('dialogue:say', ({ speaker }) => dialogue.push(speaker));
  const progression = new ProgressionCore(() => state.slice('progression', createProgressionSlice), {
    emit: (name, payload) => events.emit(name, payload),
    item: itemDef,
    setMembers: () => [],
    statOptions: () => ({}),
    setLevelFlag: () => {},
  });
  events.on('xp:grant', ({ amount, reason, receipt }) => {
    const gained = progression.grantXp(amount, reason);
    if (receipt) receipt.amount = gained;
  });
  events.on('item:grant', ({ item, count, receipt }) => {
    const gained = progression.grantItem(item, count);
    if (receipt) receipt.amount = gained;
  });
  events.on('codex:unlocked', ({ factId }) => progression.codex(factId));
  if (stranded) {
    state.slice('quests', createQuestSlice).quests[JAGUAR] = { state: 'active', counts: { jaguar: 0 }, t: 0 };
    save.save();
    save.load();
  }
  const pushReward = vi.spyOn(RewardNotice.prototype, 'push');
  quests.init({
    events, state, save,
    params: new URLSearchParams(),
    pause: { reasons, get paused() { return reasons.size > 0; } },
    scene: new Scene(),
    world: { heightAt: () => 0 },
    audio: { ctx: null },
    content: { speakers: new Map() },
    ui: {
      hud: { stack() {}, dock() {}, noticeDock: {} },
      layer: () => ({ classList: { add() {}, remove() {} }, style: {} }),
    },
  } as unknown as GameContext);

  const payout = () => ({ xp: progression.slice().xp, oil: progression.count(OIL) });
  const start = (resumed: boolean) => {
    reasons.delete('title');
    events.emit('game:start', { resumed });
  };
  return { events, state, save, dialogue, pushReward, payout, start };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('CSS', { escape: (value: string) => value });
});
afterEach(() => {
  quests.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('jaguar quest runtime', () => {
  it('writes the completed quest and its payout in the acceptance autosave while paused', () => {
    const { events, save, payout } = setup();
    const acceptanceSaves: ReturnType<typeof save.peek>[] = [];
    events.on('save:written', ({ reason }) => {
      if (reason === 'quest-accept') acceptanceSaves.push(save.peek());
    });

    events.emit('quest:accept', { id: JAGUAR, npc: 'hanne' });

    expect(acceptanceSaves).toHaveLength(1);
    expect(acceptanceSaves[0]?.systems.quests?.quests[JAGUAR]).toMatchObject({ state: 'done', counts: { jaguar: 1 } });
    expect(acceptanceSaves[0]?.systems.progression).toMatchObject({ xp: 200, inventory: { [OIL]: 2 } });
    expect(payout()).toEqual({ xp: 200, oil: 2 });
  });

  it('recovers exactly one payout on boot and presents it on Continue', () => {
    const { dialogue, pushReward, payout, save, start } = setup(true);

    expect(payout()).toEqual({ xp: 200, oil: 2 });
    expect(save.peek()?.systems.quests?.quests[JAGUAR]).toMatchObject({ state: 'done', counts: { jaguar: 1 } });
    expect(dialogue).toEqual([]);
    expect(pushReward).not.toHaveBeenCalled();

    // „Weiter“ reloads the slot (title.ts) before the game starts
    save.load();
    expect(pushReward).not.toHaveBeenCalled();
    start(true);
    expect(dialogue).toEqual(['laub', 'laub']);
    expect(pushReward).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ title: 'Der Jaguar', xp: 200, codex: 0 }));
    expect(payout()).toEqual({ xp: 200, oil: 2 });

    save.load();
    expect(payout()).toEqual({ xp: 200, oil: 2 });
    expect(dialogue).toEqual([]);
    expect(pushReward).toHaveBeenCalledTimes(1);
  });

  it('discards a recovered payout presentation when starting a new game', () => {
    const { events, state, dialogue, pushReward, payout, save, start } = setup(true);
    save.delete();
    state.replace(createInitialState(), 'new');
    events.emit('save:loaded', { slot: 'new' });
    start(false);

    expect(state.state.systems.quests?.quests[JAGUAR]).toBeUndefined();
    expect(payout()).toEqual({ xp: 0, oil: 0 });
    expect(dialogue).toEqual([]);
    expect(pushReward).not.toHaveBeenCalled();
  });
});
