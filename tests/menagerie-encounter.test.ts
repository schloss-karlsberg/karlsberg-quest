import { Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { createInitialState, GameStateStore } from '../src/core/state';
import menagerie from '../src/systems/menagerie';

afterEach(() => { menagerie.dispose(); vi.unstubAllGlobals(); });

function pen() {
  vi.stubGlobal('document', { createElement: () => ({ style: {}, remove() {} }) });
  vi.stubGlobal('window', { kq: {} });
  const events = new EventBus();
  const state = new GameStateStore(createInitialState());
  const era = { current: '1789' };
  const position = { x: 0, y: 0, z: 0 };
  const interact = vi.fn(() => false);
  const ctx = {
    state, events, era, scene: new Scene(), loop: { tick: 0, time: 0 }, audio: { unlocked: false },
    settings: { state: { subtitles: false, gentleMode: false } }, t: (key: string) => key,
    ui: { layer: () => ({ append() {} }), hud: { prompt() {} } },
    player: { position, stats: { lanternLit: false, speed: 0 }, stance: 'stand' }, input: { wasPressed: interact },
    world: { heightAt: () => 0, surfaceAt: () => 'meadow', collider: { enabled: false, solidAt: () => false }, heightfield: { slopeDeg: () => 50 } },
  };
  menagerie.init(ctx as unknown as GameContext);
  const step = () => { ctx.loop.tick++; ctx.loop.time += 1 / 60; menagerie.update(1 / 60); };
  step();
  const hooks = window.kq!.menagerie!;
  const calmed = vi.fn();
  events.on('menagerie:calmed', calmed);
  const flare = (yaw = 0, range = 12) => events.emit('combat:bann', { x: 0, z: 0, yaw, range, angle: 60 });
  const miss = () => { hooks.setState('bird', 'charge'); step(); };
  return { events, state, era, position, calmed, flare, hooks, step, miss, interact };
}

describe('menagerie encounters', () => {
  it('only in-era, in-range flares facing the jaguar count; a calmed jaguar stays gone on replay and load', () => {
    const { events, state, era, calmed, hooks, flare } = pen();
    events.emit('menagerie:spawn', { animal: 'jaguar', id: 'cat', x: 0, z: -10 });
    expect(hooks.state()).toMatchObject([{ id: 'cat', state: 'lurk' }]);
    flare(Math.PI);
    flare(0, 1);
    expect(hooks.state()[0]?.state).toBe('lurk');
    era.current = 'today';
    events.emit('era:change', { from: '1789', to: 'today' });
    expect(hooks.state()).toEqual([]);
    flare();
    era.current = '1789';
    events.emit('era:change', { from: 'today', to: '1789' });
    flare(); flare();
    expect(hooks.state()[0]?.state).toBe('retreat');
    expect(calmed).not.toHaveBeenCalled();
    flare();
    expect(calmed.mock.calls).toEqual([[{ animal: 'jaguar', id: 'cat' }]]);
    expect(state.state.systems.menagerie?.calmed).toEqual(['cat']);
    state.replace(JSON.parse(state.toJSON()));
    events.emit('save:loaded', { slot: 'auto' });
    events.emit('menagerie:spawn', { animal: 'jaguar', id: 'cat', x: 0, z: -10 });
    expect(hooks.state()).toEqual([]);
    flare();
    expect(calmed).toHaveBeenCalledTimes(1);
  });

  it('does not carry flares from the discarded timeline into a save made before the encounter', () => {
    const { events, state, calmed, flare } = pen();
    events.emit('menagerie:spawn', { animal: 'jaguar', id: 'cat', x: 0, z: -8 });
    const before = state.toJSON();
    flare(); flare();
    state.replace(JSON.parse(before));
    events.emit('save:loaded', { slot: 'manual' });
    flare();
    expect(calmed).not.toHaveBeenCalled();
    flare(); flare();
    expect(calmed.mock.calls).toEqual([[{ animal: 'jaguar', id: 'cat' }]]);
  });

  it('only leads the cassowary home nearby, after three misses in this timeline', () => {
    const { events, state, position, calmed, miss, step, interact } = pen();
    events.emit('menagerie:spawn', { animal: 'cassowary', id: 'bird', x: 0, z: -3 });
    const before = state.toJSON();
    miss(); miss();
    state.replace(JSON.parse(before));
    events.emit('save:loaded', { slot: 'manual' });
    miss();
    interact.mockReturnValue(true);
    step();
    expect(calmed).not.toHaveBeenCalled();
    position.z = 15;
    miss(); miss(); step();
    expect(calmed).not.toHaveBeenCalled();
    position.z = 0;
    interact.mockReturnValue(false);
    step();
    expect(calmed).not.toHaveBeenCalled();
    interact.mockReturnValue(true);
    step(); step();
    expect(calmed.mock.calls).toEqual([[{ animal: 'cassowary', id: 'bird' }]]);
    expect(state.state.systems.menagerie?.calmed).toEqual(['bird']);
  });

  it.todo('Design: should a save made after one or two flares/misses remember partial calming progress?');
});
