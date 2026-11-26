import { Scene, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus, type EventName } from '../src/core/events';
import { MemoryStorage, SaveManager } from '../src/core/save';
import { createInitialState, GameStateStore } from '../src/core/state';
import court from '../src/systems/court';
import { EJECT_FADE } from '../src/systems/court/logic';
import { COURT_K1_DE } from '../src/systems/court-k1';
import type { NpcSlice } from '../src/systems/npc';
import { stubSetPieceDom } from './set-piece-dom';

const INSPECTOR = 'gardist-tor';
const IN_COURT = { x: 1212, z: -1116 };
const GATE = { x: 1194.6, z: -1114.6 };
const EXIT = { x: 1180, z: -1112 };

function setup() {
  const dom = stubSetPieceDom();
  const events = new EventBus();
  const log: [EventName, unknown][] = [];
  events.onAny((name, payload) => log.push([name, payload]));
  const initial = createInitialState();
  initial.era = '1789';
  initial.flags['disguise.coat'] = true;
  const state = new GameStateStore(initial);
  const save = new SaveManager(state, new MemoryStorage(), events, () => 100_000);
  const era: { current: GameContext['era']['current'] } = { current: '1789' };
  const player = {
    position: new Vector3(IN_COURT.x, 0, IN_COURT.z),
    frozen: false, pitch: 0, stance: 'stand', stats: { speed: 0 },
    teleport: vi.fn((x: number, z: number) => player.position.set(x, 0, z)),
    setStance: vi.fn(),
  };
  events.on('save:loaded', () => {
    const { x, z } = state.state.player;
    player.teleport(x, z);
  });
  const keys = new Set<string>();
  const cards = { modal: vi.fn() };
  const hud = { el: dom.body, dock: vi.fn(), prompt: vi.fn(), subtitle: vi.fn() };
  const loop = { time: 0 };
  const ctx = {
    events, state, era, player, scene: new Scene(), loop,
    input: { isDown: (key: string) => keys.has(key), wasPressed: () => false },
    data: { footprints: { buildings: [] } },
    world: { heightAt: () => 0, surfaceAt: () => 'meadow', coverAt: () => 0 },
    ui: { hud, cards, modals: { count: 0 }, toast: vi.fn(), layer: () => dom.body },
  } as unknown as GameContext;
  const step = (dt = 1 / 60) => {
    loop.time += dt;
    court.update(dt);
  };
  const setNpc = (id: string, x: number, z: number, inspector = false) => {
    const slice = state.slice('npc', () => ({ placed: {} }) as NpcSlice);
    slice.placed[id] = {
      npc: id, x, z, era: '1789', yaw: 270,
      watch: { fov: 70, range: 14, set: 'test', inspector },
    };
  };
  const activate = () => events.emit('story:cue', { id: 'court:on', data: { set: 'test' } });
  const startEjection = () => {
    setNpc('gardist', 1222, IN_COURT.z);
    activate();
    events.emit('court:take', {});
    step();
  };
  const named = (name: EventName) => log.filter(([n]) => n === name).map(([, payload]) => payload);
  court.init(ctx);
  step();
  return { state, save, era, events, player, step, setNpc, activate, startEjection, keys, cards, hud, named, hooks: dom.window.kq.court! };
}

afterEach(() => {
  court.dispose();
  vi.unstubAllGlobals();
});

describe('court runtime', () => {
  it('offers the inspection to the player, requires a continuous hold and opens the gate once', () => {
    const s = setup();
    s.setNpc(INSPECTOR, GATE.x, GATE.z, true);
    s.player.position.set(GATE.x - 3, 0, GATE.z);
    s.step();
    expect(s.hooks.watchers()).toEqual([]);
    expect(s.hud.prompt).not.toHaveBeenCalled();
    s.activate();
    s.activate();
    s.step();
    expect(s.hooks.state()).toMatchObject({ sets: ['test'], inspector: INSPECTOR, admitted: false });
    expect(s.state.state.flags['npc.hush']).toBe(INSPECTOR);
    s.keys.add('listen');
    s.step(0.75);
    s.keys.delete('listen');
    s.step();
    s.keys.add('listen');
    s.step(0.5);
    expect(s.hooks.state().hold).toBeCloseTo(0.5);
    expect(s.named('court:refused')).toEqual([]);
    s.step(0.5);
    expect(s.named('court:refused')).toEqual([{ reason: 'letter', watcher: INSPECTOR }]);
    expect(s.player.frozen).toBe(false);
    expect(s.hud.subtitle).toHaveBeenLastCalledWith('Wache', COURT_K1_DE['court.refused.letter.1'], 3600);
    s.state.mutable.flags['disguise.letter'] = true;
    s.step(1);
    s.keys.delete('listen');
    expect(s.hooks.state().ring).toBe(0);
    s.step(2.49);
    expect(s.named('court:admitted')).toEqual([]);
    s.step(0.02);
    s.step();
    expect(s.named('court:admitted')).toEqual([{ watcher: INSPECTOR }]);
    expect(s.named('story:cue')).toContainEqual({ id: 'scenery:gate', data: { open: true } });
    expect(s.hooks.state()).toMatchObject({ admitted: true, ring: null, inspector: null });
    expect(s.state.state.flags['npc.hush']).toBeUndefined();
    expect(s.hud.prompt).toHaveBeenLastCalledWith(null, undefined, 'court');
  });

  it('escorts a witnessed pickup once, wraps the chapter line and keeps the player’s progress', () => {
    const s = setup();
    s.state.mutable.flags['court.ejected'] = 8;
    s.state.mutable.inventory.items.push('item.k1.rock');
    const inventory = structuredClone(s.state.state.inventory);
    s.startEjection();
    expect(s.hooks.state().ejecting).toBe(true);
    expect(s.player.frozen).toBe(true);
    s.step(EJECT_FADE - 0.1);
    expect(s.player.teleport).not.toHaveBeenCalled();
    s.step(0.11);
    expect(s.player.position.toArray()).toEqual([EXIT.x, 0, EXIT.z]);
    expect(s.named('court:ejected')).toEqual([{ zone: 'court.ehrenhof', n: 9, tell: 'take' }]);
    expect(s.hud.subtitle).toHaveBeenLastCalledWith('Wache', COURT_K1_DE['court.eject.court.ehrenhof.1'], 4200);
    expect(s.cards.modal).toHaveBeenCalledOnce();
    s.step(0.6);
    expect(s.hooks.state()).toMatchObject({ ejecting: false, max: 0, hinted: true, ejected: 9 });
    expect(s.player.frozen).toBe(false);
    s.player.position.set(IN_COURT.x, 0, IN_COURT.z);
    s.startEjection();
    s.step(1.2);
    expect(s.named('court:ejected').at(-1)).toEqual({ zone: 'court.ehrenhof', n: 10, tell: 'take' });
    expect(s.cards.modal).toHaveBeenCalledOnce();
    expect(s.state.state.inventory).toEqual(inventory);
    expect(s.state.state.era).toBe('1789');
  });

  it('restores court flags and watcher sets but resets an unfinished inspection on reload', () => {
    const s = setup();
    s.setNpc(INSPECTOR, GATE.x, GATE.z, true);
    s.activate();
    s.state.mutable.flags['disguise.letter'] = true;
    s.state.mutable.flags['court.ejected'] = 4;
    s.state.mutable.systems.court!.hinted = true;
    s.player.position.set(GATE.x - 3, 0, GATE.z);
    expect(s.hooks.inspect()).toBe('ring');
    s.step(0.7);
    s.save.save('during-inspection');
    s.events.emit('story:cue', { id: 'court:off', data: { set: 'test' } });
    delete s.state.mutable.flags['disguise.letter'];
    expect(s.save.load('during-inspection')).toBe(true);
    expect(s.hooks.state()).toMatchObject({
      sets: ['test'], ring: null, hold: 0, max: 0,
      letter: true, coat: true, admitted: false, ejected: 4, hinted: true, costume: 'court',
    });
    s.step(3);
    expect(s.named('court:admitted')).toEqual([]);
    expect(s.named('court:ejected')).toEqual([]);
  });

  it.each(['load', 'era change', 'dispose'] as const)('releases an interrupted escort on %s', (reason) => {
    const s = setup();
    s.state.mutable.player.x = 900;
    s.state.mutable.player.z = -800;
    s.save.save('before-escort');
    s.startEjection();
    s.step(EJECT_FADE / 2);
    expect(s.player.frozen).toBe(true);
    if (reason === 'load') {
      expect(s.save.load('before-escort')).toBe(true);
    } else if (reason === 'era change') {
      s.era.current = 'today';
      s.events.emit('era:change', { from: '1789', to: 'today' });
    } else {
      court.dispose();
    }
    expect.soft(s.player.frozen).toBe(false);
    expect.soft(s.hooks.state().ejecting).toBe(false);
    s.step(1.2);
    const position = reason === 'load' ? [900, 0, -800] : [IN_COURT.x, 0, IN_COURT.z];
    expect(s.player.position.toArray()).toEqual(position);
    expect(s.named('court:ejected')).toEqual([]);
    expect(s.state.state.flags['court.ejected']).toBeUndefined();
    expect(s.cards.modal).not.toHaveBeenCalled();
  });

  it.todo('decide which set piece owns input when a court escort and cinematic overlap');
});
