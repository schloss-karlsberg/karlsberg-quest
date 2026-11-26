import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../src/core/state';
import interiors from '../src/systems/interiors';
import { PlanQuery } from '../src/systems/interiors/collide';
import { cataloguePlan, interiorGame, savedRoom } from './interiors-runtime-fixture';

afterEach(() => { interiors.dispose(); vi.unstubAllGlobals(); });

const ground = 'B01.1.eg-kabinett';
const hall = 'B01.2.og-festsaal';
const audience = 'B01.2.og-audienzzimmer';
const vestibule = 'B01.1.eg-vestibuel';
const past = () => ({ ...createInitialState(), era: '1793-07' as const });
const hallDoor = cataloguePlan.doors.find(d => cataloguePlan.rooms[d.a]?.roomId === audience && cataloguePlan.rooms[d.b]?.roomId === hall)!;
const catalogue = new PlanQuery(cataloguePlan);

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

  it('keeps the occupied storey in a tab-hidden autosave while the palace loads', () => {
    const g = interiorGame(past(), false);
    // Load an upstairs slot while boot can still ground the player only on terrain.
    const slot = savedRoom(hall);
    const savedFloor = slot.player.y;
    g.state.replace(slot);
    g.save.save('manual');
    expect(g.save.load('manual')).toBe(true);
    g.fixedStep();
    expect(g.save.autosave('hidden', true)).toBe(true);
    expect(g.save.peek()?.player.y).toBeCloseTo(savedFloor);
    expect(g.save.load()).toBe(true);
    g.finishShell();
    g.fixedStep();
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

  it('restores an upstairs doorway outside both room polygons', () => {
    const { cx, cz, nx, nz, depth, floor } = hallDoor;
    const x = cx + nx * depth / 2;
    const z = cz + nz * depth / 2;
    expect(catalogue.roomAt(x, z, floor)).toBe(-1);
    expect(catalogue.floorAt(x, z, floor, 0)).toBeCloseTo(floor);
    const slot = savedRoom(hall);
    Object.assign(slot.player, { x, y: floor, z });
    const g = interiorGame(slot);
    expect(g.player.position.y).toBeCloseTo(floor);
    expect(g.hooks.room()).toBeNull();
  });

  it('keeps steps from the Audienzzimmer into the Festsaal while its shell loads', () => {
    const { cx, cz, nx, nz, floor } = hallDoor;
    const slot = savedRoom(audience);
    Object.assign(slot.player, { x: cx - nx * 0.05, y: floor, z: cz - nz * 0.05, yaw: Math.atan2(-nx, -nz) });
    const g = interiorGame(slot, false);
    g.input.isDown.mockImplementation(action => action === 'forward');
    for (let i = 0; i < 6; i++) g.fixedStep();
    const { x, z } = g.player.position;
    expect(catalogue.roomAt(x, z, floor)).toBe(hallDoor.b);
    g.finishShell();
    expect(g.player.position.x).toBeCloseTo(x);
    expect(g.player.position.z).toBeCloseTo(z);
    expect(g.player.position.y).toBeCloseTo(floor);
    expect(g.hooks.room()?.roomId).toBe(hall);
  });

  it('blocks walking through the exterior wall while the shell is absent', () => {
    const room = cataloguePlan.rooms[hallDoor.b]!;
    const { ax, az, bx, bz, nx, nz } = room.edges[room.ext[0]!.edge]!;
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    const slot = savedRoom(hall);
    Object.assign(slot.player, { x: x - nx * 0.5, z: z - nz * 0.5, yaw: Math.atan2(-nx, -nz) });
    const g = interiorGame(slot, false);
    expect(g.ctx.world.collider.hits(x, z, 0.35)).toBe(true);
    g.input.isDown.mockImplementation(action => action === 'forward');
    for (let i = 0; i < 120; i++) g.fixedStep();
    const p = g.player.position;
    expect((p.x - x) * nx + (p.z - z) * nz).toBeCloseTo(-0.35);
    expect(p.y).toBeCloseTo(room.floor);
    expect(g.ctx.world.collider.hits(x, z, 0.35)).toBe(true);
  });

  it('keeps a teleport directly below the saved Festsaal when the shell finishes loading', () => {
    const slot = savedRoom(hall);
    const g = interiorGame(slot, false);
    const { x, z } = slot.player;
    const downstairs = savedRoom(vestibule).player.y;
    g.player.position.y = downstairs; // select the destination storey, as the room teleport hook does
    g.player.teleport(x, z);
    g.finishShell();
    g.fixedStep();
    expect(g.player.position.x).toBeCloseTo(x);
    expect(g.player.position.z).toBeCloseTo(z);
    expect(g.player.position.y).toBeCloseTo(downstairs);
    expect(g.hooks.room()?.roomId).toBe(vestibule);
    expect(g.log).toEqual(['enter KB-B01/' + vestibule]);
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

  it('removes the objects and prompt on departure and restores the pending choice on return', () => {
    const g = interiorGame(past());
    g.events.emit('story:cue', { id: 'festsaal:objects' });
    const spots = g.hooks.festsaal().spots;
    const coin = spots.find(p => p.key === 'dukat')!;
    g.player.position.set(coin.x, coin.y - 1.1, coin.z + 0.8);
    g.player.yaw = 0;
    g.step();
    expect(g.state.state.flags['e.owner']).toBe('festsaal');
    g.shift('today');
    expect(g.hooks.festsaal().spots).toEqual([]);
    expect(g.state.state.flags['e.owner']).toBeUndefined();
    expect(g.ui.cards.hold).toHaveBeenLastCalledWith('festsaal', false);
    g.shift('1793-07');
    g.step();
    expect(g.hooks.festsaal().spots).toEqual(spots);
    expect(g.state.state.flags['e.owner']).toBe('festsaal');
    g.input.wasPressed.mockReturnValue(true);
    g.step();
    expect(g.state.state.flags['festsaal.took']).toBe('dukat');
    g.shift('today');
    g.shift('1793-07');
    g.step();
    expect(g.hooks.festsaal().active).toBe(false);
    expect(g.state.state.flags['festsaal.took']).toBe('dukat');
  });

  it('keeps a choice queued across shell completion in the wrong era', () => {
    const g = interiorGame(past(), false);
    g.events.emit('story:cue', { id: 'festsaal:objects' });
    g.shift('1789');
    g.finishShell();
    g.step();
    expect(g.hooks.festsaal().active).toBe(false);
    g.shift('1793-07');
    g.step();
    expect(g.hooks.festsaal().spots).toHaveLength(4);
  });
});
