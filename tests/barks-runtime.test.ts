import { afterEach, expect, it, vi } from 'vitest';
import { ContentDB } from '../src/content/db';
import type { DialogueLine } from '../src/content/types';
import type { GameContext } from '../src/core/context';
import type { Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SaveManager } from '../src/core/save';
import { createInitialState, GameStateStore } from '../src/core/state';
import barks, { type BarksHooks } from '../src/systems/barks';
import { seededRng } from '../src/systems/barks/rules';

function setupBarks() {
  const kq: { barks?: BarksHooks } = {};
  const window = Object.assign(new EventTarget(), { kq });
  vi.stubGlobal('window', window);
  vi.spyOn(Math, 'random').mockImplementation(seededRng(54));
  const events = new EventBus();
  const said = vi.fn();
  events.on('dialogue:say', said);
  const idle = vi.fn();
  events.on('bark:idle', idle);
  const state = new GameStateStore(createInitialState());
  const save = new SaveManager(state, new MemoryStorage(), events, () => 0);
  const content = new ContentDB([]);
  const line = (id: string, event: string, speaker = 'laub') => {
    const entry: DialogueLine = { id, speaker, text_de: 'Hier entlang.', trigger: { event } };
    content.dialogue.set(id, entry);
  };
  const era: { current: Era } = { current: 'today' };
  const modals = { count: 0 };
  const subtitle = vi.fn();
  const ctx = { events, state, content, era, params: new URLSearchParams(), systems: new Map(),
    player: { position: { x: 0, z: 0 }, yaw: 0, pitch: 0 }, ui: { modals, hud: { subtitle } } } as unknown as GameContext;
  barks.init(ctx);
  barks.frame();
  return { window, events, state, save, line, modals, subtitle, idle, said, hooks: kq.barks!, step: (dt: number) => barks.update(dt) };
}

afterEach(() => {
  barks.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('waits for quiet, drops requests after eight seconds, and respects Laub silence', () => {
  const { events, line, step, modals, subtitle, said, state, hooks } = setupBarks();
  line('laub.bark.scan.1', 'scan:mode');
  line('marlene.bark.fly.1', 'player:fly', 'marlene');
  events.emit('game:start', { resumed: false });
  events.emit('scan:mode', { mode: 1 });
  expect(hooks.state().pending).toEqual([]);
  step(12);

  modals.count = 1;
  events.emit('scan:mode', { mode: 1 });
  step(8);
  expect(hooks.state()).toMatchObject({ pending: ['scan:mode'], quiet: 'modal' });
  expect(said).not.toHaveBeenCalled();
  step(0.01);
  expect(hooks.state().pending).toEqual([]);
  modals.count = 0;

  state.mutable.flags['laub.silent'] = true;
  events.emit('scan:mode', { mode: 2 });
  expect(hooks.state().pending).toEqual([]);
  events.emit('player:fly', { flying: true });
  events.emit('player:fly', { flying: false });
  expect(hooks.state().pending).toEqual(['player:fly']);
  step(0.1);
  expect(said).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'marlene.bark.fly.1' }));
  expect(subtitle).toHaveBeenCalledExactlyOnceWith('marlene', 'Hier entlang.', expect.any(Number), true);
});

it('counts idle game time once until input and excludes time in a modal', () => {
  const { window, step, modals, idle } = setupBarks();
  step(59);
  expect(idle).not.toHaveBeenCalled();
  modals.count = 1;
  step(10);
  expect(idle).not.toHaveBeenCalled();
  modals.count = 0;
  step(1);
  step(60);
  expect(idle).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('keydown'));
  step(59);
  expect(idle).toHaveBeenCalledTimes(1);
  step(1);
  expect(idle).toHaveBeenCalledTimes(2);
});

it.each([
  { reason: 'load', elapsed: 59 },
  { reason: 'load', elapsed: 60 },
  { reason: 'new', elapsed: 59 },
  { reason: 'new', elapsed: 60 },
])('restarts idle detection on $reason after $elapsed seconds idle', ({ reason, elapsed }) => {
  const { events, state, save, line, step, idle, said } = setupBarks();
  const id = 'laub.bark.idle.1';
  line(id, 'bark:idle');
  expect(save.save('same-pose')).toBe(true);
  step(elapsed);
  expect(idle).toHaveBeenCalledTimes(elapsed === 60 ? 1 : 0);
  idle.mockClear();
  said.mockClear();

  if (reason === 'load') expect(save.load('same-pose')).toBe(true);
  else {
    state.replace(createInitialState(), 'new');
    events.emit('game:start', { resumed: false });
  }
  step(1);
  expect(idle).not.toHaveBeenCalled();
  step(58);
  expect(said).not.toHaveBeenCalled();
  expect(idle).not.toHaveBeenCalled();
  step(1);
  expect(idle).toHaveBeenCalledOnce();
  expect(said).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id }));
});

it('discards the previous slot’s waiting barks and dialogue deadline while preserving loaded cooldowns', () => {
  const { events, line, step, modals, said, save, hooks } = setupBarks();
  line('laub.bark.scan.1', 'scan:mode');
  line('marlene.bark.fly.1', 'player:fly', 'marlene');
  line('marlene.bark.move.1', 'player:teleport', 'marlene');
  events.emit('scan:mode', { mode: 1 });
  step(1);
  expect(save.save('earlier')).toBe(true);
  step(100);
  modals.count = 1;
  events.emit('player:fly', { flying: true });
  events.emit('dialogue:say', { speaker: 'laub', text: 'Wir warten.', ms: 9000 });
  said.mockClear();

  expect(save.load('earlier')).toBe(true);
  modals.count = 0;
  expect(hooks.state()).toMatchObject({ t: 1, last: 1, pending: [], quiet: null });
  events.emit('player:teleport', { x: 0, z: 0 });
  step(1);
  expect(said).not.toHaveBeenCalled();
  step(43);
  events.emit('player:teleport', { x: 0, z: 0 });
  step(1);
  expect(said).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'marlene.bark.move.1' }));
});

it('uses the loaded clock for a new line emitted by a save-loaded listener', () => {
  const { events, line, step, said, save, hooks } = setupBarks();
  line('laub.bark.scan.1', 'scan:mode');
  expect(save.save('earlier')).toBe(true);
  step(100);
  events.emit('game:start', { resumed: false });
  events.emit('player:caught', { by: 'pack' });
  events.on('save:loaded', () => events.emit('dialogue:say', { speaker: 'laub', text: 'Hallo.', ms: 1000 }));

  expect(save.load('earlier')).toBe(true);
  said.mockClear();
  expect(hooks.state().quiet).toBe('dialogue');
  events.emit('scan:mode', { mode: 1 });
  expect(hooks.state().pending).toEqual(['scan:mode']);
  step(2);
  expect(said).toHaveBeenCalledOnce();
});

it('restarts the bark deadlines when a new game replaces the state', () => {
  const { events, step, state, hooks } = setupBarks();
  step(100);
  events.emit('dialogue:say', { speaker: 'laub', text: 'Hallo.' });
  expect(hooks.state().quiet).toBe('dialogue');
  state.replace(createInitialState(), 'new');
  events.emit('game:start', { resumed: false });
  expect(hooks.state()).toMatchObject({ t: 0, quiet: null });
});
