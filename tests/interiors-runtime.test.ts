import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../src/core/state';
import interiors from '../src/systems/interiors';
import { interiorGame, savedRoom } from './interiors-runtime-fixture';

afterEach(() => { interiors.dispose(); vi.unstubAllGlobals(); });

const ground = 'B01.1.eg-kabinett';
const hall = 'B01.2.og-festsaal';
const past = () => ({ ...createInitialState(), era: '1793-07' as const });

describe('occupied palace rooms', () => {
  it('emits each crossing once and clears both story flags outside', () => {
    const g = interiorGame(past());
    g.enter(ground);
    g.step();
    expect(g.log).toEqual(['enter KB-B01/' + ground]);
    expect(g.state.state.flags).toMatchObject({ 'interior.room': ground, 'interior.building': 'KB-B01' });
    g.enter(hall);
    expect(g.log.slice(1)).toEqual(['leave KB-B01/' + ground, 'enter KB-B01/' + hall]);
    g.player.teleport(800, -800);
    g.step();
    g.step();
    expect(g.log.slice(3)).toEqual(['leave KB-B01/' + hall]);
    expect(g.hooks.room()).toBeNull();
    expect(g.state.state.flags).toMatchObject({ 'interior.room': '', 'interior.building': '' });
  });

  it('leaves the original room when its upper storey disappears in the present', () => {
    const g = interiorGame(past());
    g.enter(hall);
    g.shift('today');
    expect(g.log).toEqual(['enter KB-B01/' + hall, 'leave KB-B01/' + hall]);
    expect(g.hooks.room()).toBeNull();
    expect(g.ctx.world.groundOverride!(g.player.position.x, g.player.position.z, 0)).toBeNull();
    expect(g.state.state.flags['interior.room']).toBe('');
  });

  it('keeps the escape door open until the occupant has left a collapsed room', () => {
    const g = interiorGame(past());
    g.enter(ground);
    const door = g.hooks.doors().find(d => d.from === ground && d.kind === 'inner')!;
    const blocked = () => g.ctx.world.collider.overlay!.resolve(door.x, door.z, 0.35).hit;
    expect(blocked()).toBe(false);
    g.events.emit('fire:room', { roomId: ground, state: 'collapsed' });
    expect(blocked()).toBe(false);
    g.enter(door.to!);
    expect(blocked()).toBe(true);
    g.events.emit('threat:configure', { kind: 'fire', active: false });
    expect(blocked()).toBe(false);
  });

  it('resumes on the occupied storey when the palace finishes loading', () => {
    const g = interiorGame(past(), false);
    // Load an upstairs slot while boot can still ground the player only on terrain.
    const slot = savedRoom(hall);
    g.state.replace(slot);
    g.events.emit('save:loaded', { slot: 'manual' });
    const savedFloor = slot.player.y;
    g.player.update(1 / 60); // the old footprint can push the player outside before the shell arrives
    g.player.writeState(g.state.mutable.player);
    g.finishShell();
    g.step();
    expect(g.player.position.y).toBeCloseTo(savedFloor);
    expect(g.hooks.room()?.roomId).toBe(hall);
    expect(g.log).toEqual(['enter KB-B01/' + hall]);
  });

  it('finds the saved storey on a cold start and a different storey on a live slot load', () => {
    const g = interiorGame(savedRoom(hall));
    expect(g.hooks.room()?.roomId).toBe(hall);
    const downstairs = savedRoom(ground);
    g.state.replace(downstairs);
    g.events.emit('save:loaded', { slot: 'manual' });
    g.step();
    expect(g.hooks.room()?.roomId).toBe(ground);
    expect(g.state.state.flags['interior.room']).toBe(ground);
  });

  it('does not repeat a room crossing when a live slot restores the same room', () => {
    const g = interiorGame(savedRoom(hall));
    g.log.length = 0;
    g.state.replace(savedRoom(hall), 'load');
    g.events.emit('save:loaded', { slot: 'manual' });
    g.step();
    expect(g.log).toEqual([]);
    expect(g.hooks.room()?.roomId).toBe(hall);
  });

  it('preserves a step taken within the saved room while its shell is loading', () => {
    const g = interiorGame(savedRoom(hall), false);
    g.player.position.x += 0.5;
    const x = g.player.position.x;
    g.finishShell();
    expect(g.player.position.x).toBeCloseTo(x);
    expect(g.hooks.room()?.roomId).toBe(hall);
  });

  it('keeps a later teleport when the shell finishes loading', () => {
    const g = interiorGame(savedRoom(hall), false);
    g.player.teleport(800, -800);
    g.finishShell();
    expect(g.player.position.x).toBe(800);
    expect(g.player.position.z).toBe(-800);
    expect(g.hooks.room()).toBeNull();
    expect(g.log).toEqual([]);
  });

  it.todo('decide whether staying in the same room across two intact eras should replay its entry cue');
});

describe('Festsaal choice', () => {
  it('claims one object in reach and releases the prompt when the player takes it', () => {
    const g = interiorGame(past());
    g.events.emit('story:cue', { id: 'festsaal:objects' });
    const coin = g.hooks.festsaal().spots.find(p => p.key === 'dukat')!;
    g.player.position.set(coin.x, coin.y - 1.1, coin.z + 0.8);
    g.player.yaw = 0;
    g.step();
    expect(g.state.state.flags['e.owner']).toBe('festsaal');
    g.input.wasPressed.mockReturnValue(true);
    g.step();
    expect(g.state.state.flags['festsaal.took']).toBe('dukat');
    expect(g.state.state.flags['e.owner']).toBeUndefined();
    expect(g.hooks.festsaalTake('uhr')).toBe(false);
    g.events.emit('story:cue', { id: 'festsaal:clear' });
    expect(g.hooks.festsaal().spots).toEqual([]);
  });

  it.each(['era shift', 'fire ends'] as const)('removes the active choice when %s interrupts it', (cause) => {
    const g = interiorGame(past());
    g.events.emit('story:cue', { id: 'festsaal:objects' });
    expect(g.hooks.festsaal().active).toBe(true);
    if (cause === 'era shift') g.shift('1789');
    else g.events.emit('threat:configure', { kind: 'fire', active: false });
    g.step();
    expect(g.hooks.festsaal().active).toBe(false);
    expect(g.hooks.festsaalTake('dukat')).toBe(false);
    expect(g.state.state.flags['festsaal.took']).toBeUndefined();
    expect(g.ui.cards.hold).toHaveBeenLastCalledWith('festsaal', false);
  });

  it('cancels an interrupted choice queued before the shell was ready', () => {
    const g = interiorGame(past(), false);
    g.events.emit('story:cue', { id: 'festsaal:objects' });
    g.shift('1789');
    g.finishShell();
    g.step();
    expect(g.hooks.festsaal().active).toBe(false);
  });
});
