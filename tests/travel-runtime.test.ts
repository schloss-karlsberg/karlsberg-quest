import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAVE_KEY } from '../src/core/save';
import { serializeState } from '../src/core/state';
import { TRAVEL_DE } from '../src/systems/travel/strings';
import { disposeTravel, setupTravel } from './travel-fixture';

afterEach(disposeTravel);

describe('travel discoveries', () => {
  it.each(['photo', 'another card'])('shows the first map tip once after it was blocked by %s', (blocker) => {
    const { hooks, events, step, save, cards, ui, shift } = setupTravel();
    const present = (text: string) => {
      const banner = vi.mocked(ui.add).mock.lastCall![0];
      const children = vi.mocked(banner.append).mock.calls.map(([el]) => (el as HTMLElement).textContent);
      expect(children).toContain(text);
      expect(banner.classList.toggle).toHaveBeenLastCalledWith('kqt-aside', false);
    };
    if (blocker === 'photo') events.emit('photo:open', {});
    else cards.claim.mockReturnValue(false);
    hooks.activate('ehrenhof');
    step();
    step();
    expect(hooks.state()).toMatchObject({ activated: ['ehrenhof'], tips: [], mapTipPoint: 'ehrenhof' });
    expect(save.save('pending')).toBe(true);
    if (blocker === 'photo') expect(ui.add).not.toHaveBeenCalled();
    else {
      const banner = vi.mocked(ui.add).mock.lastCall![0];
      expect(banner.classList.toggle).toHaveBeenLastCalledWith('kqt-aside', true);
    }

    shift('1789');
    events.emit('photo:close', {});
    cards.claim.mockReturnValue(true);
    vi.mocked(ui.add).mockClear();
    step();
    expect(ui.add).not.toHaveBeenCalled();
    shift('today');
    if (blocker === 'photo') expect(save.load('pending')).toBe(true);
    step();
    step();
    present(TRAVEL_DE.firstMap);
    expect(hooks.state().tips).toEqual(['map']);
    expect(hooks.state().mapTipPoint).toBeUndefined();

    shift('1789');
    shift('today');
    hooks.activate('taleingang');
    step();
    present(TRAVEL_DE.activatedSub);
    expect(hooks.state().tips).toEqual(['map']);
  });

  it('grants lore XP once on foot per slot and restores an uncollected find from an older slot', () => {
    const { hooks, events, player, state, step, save } = setupTravel();
    const lore = hooks.pois().find(p => p.chapter === 'prolog' && p.era === 'today' && p.kind === 'lore')!;
    const xp = vi.fn();
    events.on('xp:grant', xp);
    expect(hooks.state().seen).not.toContain(lore.id);
    player.position.set(lore.x, 0, lore.z);
    player.writeState(state.mutable.player);
    expect(save.save('1')).toBe(true);
    player.flying = true;
    step();
    expect(hooks.state().seen).toContain(lore.id);
    expect(xp).not.toHaveBeenCalled();
    player.flying = false;
    step();
    expect(xp).toHaveBeenCalledExactlyOnceWith({ reason: 'lore', amount: 15, x: lore.x, z: lore.z });
    expect(save.autosave).toHaveBeenCalledWith('lore');
    expect(state.state.systems.travel?.done).toContain(lore.id);
    expect(save.load('1')).toBe(true);
    expect(hooks.pois().find(p => p.id === lore.id)?.state).toBe('hidden');
    step();
    expect(xp).toHaveBeenCalledTimes(2);
    expect(state.state.systems.travel?.done).toContain(lore.id);
    expect(hooks.pois().find(p => p.id === lore.id)).toMatchObject({ state: 'done', built: false });
    step();
    expect(xp).toHaveBeenCalledTimes(2);
  });

  it('uses saved play seconds for a shrine cooldown, including a first heal at time zero', () => {
    const { hooks, events, player, step, state, heal, save, storage } = setupTravel();
    const shrine = hooks.pois().find(p => p.chapter === 'prolog' && p.era === 'today' && p.kind === 'shrine')!;
    const refill = vi.fn();
    events.on('lantern:request', refill);
    events.emit('combat:state', { inCombat: true });
    player.position.set(shrine.x, 0, shrine.z);
    step();
    expect(heal).not.toHaveBeenCalled();
    events.emit('combat:state', { inCombat: false });
    step();
    expect(state.state.systems.travel?.shrineT[shrine.id]).toBe(0);
    expect(refill).toHaveBeenCalledExactlyOnceWith({ lit: false, refill: true });
    const saved = structuredClone(state.state);
    player.writeState(saved.player);
    saved.systems.travel!.shrineT[shrine.id] = 42;
    saved.meta.playSeconds = 161.99;
    storage.setItem(SAVE_KEY('1'), serializeState(saved));

    expect(save.load('1')).toBe(true);
    step();
    expect(heal).toHaveBeenCalledTimes(1);
    state.mutable.meta.playSeconds = 162;
    step();
    expect(heal).toHaveBeenCalledTimes(2);
    expect(state.state.systems.travel?.shrineT[shrine.id]).toBe(162);
  });

  it.todo('decide whether a full-health traveller with a partly empty lantern uses a shrine charge');
});

describe('the outdoor sprint boost', () => {
  it.each([
    [false, TRAVEL_DE.sprint],
    [true, TRAVEL_DE.sprintTouch],
  ])('explains the Laufschritt once in the current input mode (touch %s)', (touch, text) => {
    const { keys, step, input, ui } = setupTravel();
    input.touchMode = touch;
    keys.add('forward');
    keys.add('sprint');
    for (let i = 0; i < 6 * 60; i++) step();
    const tips = vi.mocked(ui.toast).mock.calls.filter(([msg]) => String(msg).startsWith('Laufschritt'));
    expect(tips).toEqual([[text, 4200]]);
  });

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
    expect(player.moveScale).toBeCloseTo(1.45);
    events.emit('combat:state', { inCombat: true });
    player.moveScale = 0.7;
    step();
    expect(player.moveScale).toBe(0.7);
    events.emit('combat:state', { inCombat: false });
    for (let i = 0; i < 59; i++) step();
    expect(player.moveScale).toBe(0.7);
    for (let i = 0; i < 4 * 60; i++) step();
    expect(player.moveScale).toBeCloseTo(0.7 * 1.45);
  });
});
