import { afterEach, describe, expect, it, vi } from 'vitest';
import { deserializeState } from '../src/core/state';
import { disposeTravel, setupTravel } from './travel-fixture';

afterEach(disposeTravel);

describe('travel discoveries', () => {
  it('grants lore XP on foot once and keeps the find when loading the save', () => {
    const { hooks, events, player, state, step, save } = setupTravel();
    const lore = hooks.pois().find(p => p.chapter === 'prolog' && p.era === 'today' && p.kind === 'lore')!;
    const xp = vi.fn();
    events.on('xp:grant', xp);
    expect(hooks.state().seen).not.toContain(lore.id);
    player.position.set(lore.x, 0, lore.z);
    player.flying = true;
    step();
    expect(hooks.state().seen).toContain(lore.id);
    expect(xp).not.toHaveBeenCalled();
    player.flying = false;
    step();
    expect(xp).toHaveBeenCalledExactlyOnceWith({ reason: 'lore', amount: 15, x: lore.x, z: lore.z });
    expect(save.autosave).toHaveBeenCalledWith('lore');
    state.replace(deserializeState(state.toJSON()));
    step();
    expect(hooks.pois().find(p => p.id === lore.id)).toMatchObject({ state: 'done', built: false });
    expect(xp).toHaveBeenCalledTimes(1);
  });

  it('uses saved play seconds for a shrine cooldown, including a first heal at time zero', () => {
    const { hooks, events, player, step, state, heal } = setupTravel();
    const shrine = hooks.pois().find(p => p.chapter === 'prolog' && p.era === 'today' && p.kind === 'shrine')!;
    const refill = vi.fn();
    events.on('lantern:request', refill);
    events.emit('combat:state', { inCombat: true });
    player.position.set(shrine.x, 0, shrine.z);
    step();
    expect(heal).not.toHaveBeenCalled();
    events.emit('combat:state', { inCombat: false });
    step();
    expect(hooks.state().shrineT[shrine.id]).toBe(0);
    expect(refill).toHaveBeenCalledExactlyOnceWith({ lit: false, refill: true });
    state.replace(deserializeState(state.toJSON()));
    state.mutable.meta.playSeconds = 119.99;
    step();
    expect(heal).toHaveBeenCalledTimes(1);
    state.mutable.meta.playSeconds = 120;
    step();
    expect(heal).toHaveBeenCalledTimes(2);
    expect(hooks.state().shrineT[shrine.id]).toBe(120);
  });

  it.todo('decide whether a full-health traveller with a partly empty lantern uses a shrine charge');
});

describe('the outdoor sprint boost', () => {
  it('loses the boost on releasing sprint even after a minute on the trail', () => {
    const { keys, player, step } = setupTravel();
    keys.add('forward');
    keys.add('sprint');
    for (let i = 0; i < 60 * 60; i++) step();
    expect(player.moveScale).toBeCloseTo(1.45);
    keys.delete('sprint');
    for (let i = 0; i < 3 * 60; i++) step();
    expect(player.moveScale).toBe(1);
  });

  it('hands movement back to combat immediately, then requires a fresh outdoor run-up', () => {
    const { keys, events, player, step } = setupTravel();
    keys.add('forward');
    keys.add('sprint');
    for (let i = 0; i < 4 * 60; i++) step();
    events.emit('combat:state', { inCombat: true });
    player.moveScale = 0.7;
    step();
    expect(player.moveScale).toBe(0.7);
    events.emit('combat:state', { inCombat: false });
    for (let i = 0; i < 59; i++) step();
    expect(player.moveScale).toBe(0.7);
  });
});
