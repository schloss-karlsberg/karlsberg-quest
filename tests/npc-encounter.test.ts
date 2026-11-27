import { Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { createInitialState, GameStateStore } from '../src/core/state';
import npc from '../src/systems/npc';

const { say } = vi.hoisted(() => ({ say: vi.fn() }));
vi.mock('../src/systems/npc/ui', () => ({
  ConversationView: class {
    open = false;
    onClose?: () => void;
    show(_title: string, onClose: () => void) { this.open = true; this.onClose = onClose; }
    close() { if (this.open) { this.open = false; this.onClose?.(); } }
    say = say;
    setTopics() {}
  },
}));

afterEach(() => { npc.dispose(); vi.unstubAllGlobals(); say.mockClear(); });

function encounter() {
  vi.stubGlobal('window', {});
  const events = new EventBus();
  const state = new GameStateStore(createInitialState());
  const clue = 'clue.k1.soll';
  const line = { id: 'test.greet', speaker: 'soll', text_de: 'Guten Tag.', once: true, trigger: { event: 'npc:talk', npc: 'soll', chapter: 'k1', topic: 'greet' } };
  const hold = vi.fn();
  const grants = vi.fn();
  events.on('clue:grant', grants);
  const ctx = {
    events, state, scene: new Scene(), era: { current: '1789' }, quality: { level: 'low', listeners: [] },
    player: { position: { x: 0, y: 10, z: 0 } }, input: { wasPressed: () => true },
    content: { dialogue: new Map([[line.id, line]]), speakers: new Map(), clues: new Set([clue]) },
    world: { heightAt: (_x: number, _z: number, floor?: number) => floor ?? 10 },
    ui: { layer: () => ({ style: {}, classList: { add() {}, remove() {} } }), cards: { hold }, modals: { count: 0 }, hud: { prompt() {}, el: { querySelector: () => null } } },
    save: { autosave() {} },
  };
  npc.init(ctx as unknown as GameContext);
  return { events, state, clue, hold, grants, ctx };
}

describe('campaign NPC encounters', () => {
  it('awards a first-talk clue and greeting once, including after reloading and replacing the placement', () => {
    const { events, state, clue, hold, grants } = encounter();
    events.emit('npc:spawn', { npc: 'soll', chapter: 'k1', x: 1, z: 0 });
    expect(state.state.flags[`npc.owns.${clue}`]).toBe(true);
    npc.update(1 / 60);
    expect(grants.mock.calls).toEqual([[{ id: clue }]]);
    expect(state.state.flags['talked.k1.soll']).toBe(true);
    expect(state.state.systems.npc?.said).toEqual(['test.greet']);
    expect(hold).toHaveBeenLastCalledWith('talk', true);
    events.emit('player:caught', { by: 'pack' });
    expect(hold).toHaveBeenLastCalledWith('talk', false);
    const snapshot = state.toJSON();
    events.emit('npc:despawn', { npc: 'soll' });
    expect(state.state.systems.npc?.placed).toEqual({});
    npc.update(1 / 60);
    expect(hold.mock.calls).toEqual([['talk', true], ['talk', false]]);

    state.replace(JSON.parse(snapshot));
    events.emit('save:loaded', { slot: 'auto' });
    npc.update(1 / 60);
    // the greeting is said and there is no topic: no new conversation, not an empty one (TASK-076)
    expect(hold.mock.calls).toEqual([['talk', true], ['talk', false]]);
    expect(grants).toHaveBeenCalledTimes(1);
    expect(say).toHaveBeenCalledTimes(1);
    events.emit('npc:spawn', { npc: 'soll', chapter: 'k2', x: 1, z: 0 });
    expect(state.state.flags[`npc.owns.${clue}`]).toBeUndefined();
    events.emit('npc:despawn', { npc: '*' });
    expect(state.state.systems.npc?.placed).toEqual({});
  });

  it('a placement in another era or on another floor cannot be talked to from here', () => {
    const { events, ctx, grants } = encounter();
    events.emit('npc:spawn', { npc: 'soll', chapter: 'k1', era: '1793-02', x: 0, y: 10, z: 0 });
    npc.update(1 / 60);
    expect(grants).not.toHaveBeenCalled();
    ctx.era.current = '1793-02';
    ctx.player.position.y = 15;
    events.emit('era:change', { from: '1789', to: '1793-02' });
    npc.update(1 / 60);
    expect(grants).not.toHaveBeenCalled();
    ctx.player.position.y = 10;
    npc.update(1 / 60);
    expect(grants).toHaveBeenCalledTimes(1);
  });

  it('the talk prompt puts a name with an article in the dative; other names stay as they are (TASK-078)', () => {
    const named = encounter();
    const prompt = vi.fn();
    named.ctx.ui.hud.prompt = prompt;
    named.ctx.content.speakers.set('soll', { id: 'soll', name_de: 'Der Kanzlist', dative_de: 'dem Kanzlisten', historical: false });
    named.events.emit('npc:spawn', { npc: 'soll', chapter: 'k1', x: 1, z: 0 });
    npc.update(1 / 60);
    expect(prompt).toHaveBeenCalledWith('E', 'Mit dem Kanzlisten sprechen', 'npc');
    npc.dispose();

    const plain = encounter();
    plain.ctx.ui.hud.prompt = prompt;
    prompt.mockClear();
    plain.events.emit('npc:spawn', { npc: 'soll', chapter: 'k1', x: 1, z: 0 });
    npc.update(1 / 60);
    expect(prompt).toHaveBeenCalledWith('E', 'Mit Kanzlist Gottlob Soll sprechen', 'npc');
  });
});
