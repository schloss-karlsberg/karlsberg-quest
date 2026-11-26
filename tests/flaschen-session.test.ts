import { Group, Scene, Sprite, Vector3 } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { cosmetics, FLASCHENGRUEN } from '../src/player/cosmetics';
import { newMemory } from '../src/systems/barks/rules';
import bottles from '../src/systems/flaschen';
import { FLASCHEN, type FlaschenSpot, countByEra } from '../src/systems/flaschen/spots';
import { explorationSession } from './exploration-fixture';

// Canvas textures need a browser. Keep actual spot logic, group positions and solid registration.
vi.mock('../src/systems/flaschen/model', () => ({
  buildBottle: () => ({ group: new Group(), glint: new Sprite() }),
  buildCover: () => ({ group: new Group(), r: 0.4 }),
  disposeCover: vi.fn(),
}));

function setup() {
  const { events, state, save, era } = explorationSession();
  const player = { position: new Vector3(), stats: { lanternLit: false }, yaw: 0, frozen: false };
  const look = { disc: 'sun' };
  const setSolids = vi.fn();
  const keys = new Set<string>();
  const ctx = {
    events, state, save, era, player, scene: new Scene(), audio: { bus: () => null },
    ui: { toast: vi.fn(), hud: { prompt: vi.fn(), subtitle: vi.fn() }, modals: { count: 0 } },
    world: { look, heightAt: () => 0, heightfield: { heightAt: () => 0 }, collider: { setSolids } },
    input: { enabled: true, wasPressed: (key: string) => keys.has(key) },
    settings: { state: { subtitles: false } },
  } as unknown as GameContext;
  bottles.init(ctx);
  const step = () => { bottles.update(1 / 60); keys.clear(); };
  step();
  const hooks = window.kq!.flaschen!;
  const visit = (spot: FlaschenSpot) => {
    era.set(spot.era);
    player.position.set(spot.x, spot.dy ?? 0, spot.z);
    step();
  };
  const spotState = (id: string) => hooks.spots().find(s => s.id === id)!;
  return { events, state, save, era, player, look, keys, setSolids, hooks, visit, step, spotState };
}

afterEach(() => {
  bottles.dispose();
  cosmetics.lanternGlass = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('builds only the local era and checks the lantern and night before offering a pickup', () => {
  const { hooks, visit, era, step, look, player, spotState } = setup();
  const tor = FLASCHEN.find(s => s.id === 'fl.179302.torhaus')!;
  look.disc = 'moon';
  visit(tor);
  expect(spotState(tor.id)).toMatchObject({ built: true, visible: false });
  expect(hooks.prompt()).toBeNull();
  player.stats.lanternLit = true;
  step();
  expect(hooks.prompt()).toBe(tor.id);
  player.stats.lanternLit = false;
  look.disc = 'sun';
  step();
  expect(spotState(tor.id).visible).toBe(true);
  era.set('today');
  step();
  expect(spotState(tor.id).built).toBe(false);
  expect(hooks.prompt()).toBeNull();

  const fire = FLASCHEN.find(s => s.verb === 'dark')!;
  visit(fire);
  expect(spotState(fire.id).visible).toBe(true);
  player.stats.lanternLit = true;
  step();
  expect(spotState(fire.id).visible).toBe(false);
});

it('restores a shaken bottle on the ground after a mid-fall save and takes it only once', () => {
  const { events, state, save, hooks, visit, step, keys, spotState } = setup();
  const apple = FLASCHEN.find(s => s.id === 'fl.1789.allee')!;
  visit(apple);
  expect(spotState(apple.id).hanging).toBe(true);
  expect(hooks.prompt()).toBeNull();
  const swing = { x: apple.hang!.x, z: apple.hang!.z, yaw: 0 };
  events.emit('combat:swing', { ...swing, reach: 2.6 });
  expect(hooks.state().dropped).toEqual([]);
  events.emit('combat:swing', { ...swing, reach: 3 });
  step();
  expect(spotState(apple.id).hanging).toBe(true);
  expect(hooks.state().dropped).toEqual([apple.id]);
  save.save('fall');
  save.load('fall');
  step();
  expect(spotState(apple.id)).toMatchObject({ hanging: false, x: apple.x, z: apple.z });
  expect(hooks.prompt()).toBe(apple.id);
  const found = vi.fn();
  events.on('flaschen:found', found);
  keys.add('listen');
  step();
  expect(found).toHaveBeenCalledExactlyOnceWith({ id: apple.id, count: 1, total: 24 });
  expect(save.peek('auto')?.systems.flaschen?.found).toEqual([apple.id]);
  expect(hooks.pick(apple.id)).toBe(false);
  save.load('auto');
  step();
  expect(spotState(apple.id).built).toBe(false);
  expect(state.state.systems.flaschen?.found).toEqual([apple.id]);
  expect(found).toHaveBeenCalledTimes(1);
});

it('awards milestone lines, green glass and the codex card once in the collecting slot', () => {
  const { hooks, events, save, state } = setup();
  const unlock = vi.fn();
  const lines = vi.fn();
  events.on('codex:unlocked', unlock);
  events.on('dialogue:say', lines);
  expect(hooks.state().count).toBe(0);
  expect(hooks.pick('missing')).toBe(false);
  save.save('empty');
  for (const spot of FLASCHEN.slice(0, 7)) hooks.pick(spot.id);
  expect(hooks.state().said).toEqual(['past']);
  hooks.pick(FLASCHEN[7]!.id);
  expect(hooks.state().said).toEqual(['past', 'marlene']);
  for (const spot of FLASCHEN.slice(8, 15)) hooks.pick(spot.id);
  expect(lines).toHaveBeenCalledTimes(2);
  hooks.pick(FLASCHEN[15]!.id);
  expect(lines.mock.calls.map(([e]) => e.speaker)).toEqual(['laub', 'marlene', 'laub']);
  for (const spot of FLASCHEN.slice(16, -1)) hooks.pick(spot.id);
  expect(unlock).not.toHaveBeenCalled();
  expect(cosmetics.lanternGlass).toBeNull();
  const last = FLASCHEN.at(-1)!;
  hooks.pick(last.id);
  expect(hooks.state()).toMatchObject({ count: 24, said: ['past', 'marlene', 'laub', 'all'] });
  expect(cosmetics.lanternGlass).toBe(FLASCHENGRUEN);
  expect(unlock).toHaveBeenCalledExactlyOnceWith({ factId: 'cx.47' });
  expect(countByEra(hooks.state().found).map(row => row.found)).toEqual([6, 6, 4, 3, 5]);
  save.save('complete');
  save.load('empty');
  expect(hooks.state().count).toBe(0);
  expect(cosmetics.lanternGlass).toBeNull();
  expect(state.state.codex.facts).toEqual([]);
  save.load('complete');
  expect(hooks.pick(last.id)).toBe(false);
  expect(state.state.codex.facts).toEqual(['cx.47']);
  expect(cosmetics.lanternGlass).toBe(FLASCHENGRUEN);
  expect(unlock).toHaveBeenCalledTimes(1);
  expect(lines).toHaveBeenCalledTimes(3);
});

it('removes the last solid bottle cover when changing eras', () => {
  const { visit, setSolids, era, step } = setup();
  const stump = FLASCHEN.find(s => s.cover?.kind === 'stump')!;
  visit(stump);
  expect(setSolids).toHaveBeenLastCalledWith('flaschen', [expect.objectContaining({ x: stump.cover!.x, z: stump.cover!.z })]);
  era.set('1796');
  step();
  expect(setSolids).toHaveBeenLastCalledWith('flaschen', []);
});

it.each(['boss', 'pack', 'memorial'])('releases a bottle hidden by a %s when loading a peaceful slot', hold => {
  const { events, save, hooks, visit, step } = setup();
  const spot = FLASCHEN[0]!;
  visit(spot);
  expect(hooks.prompt()).toBe(spot.id);
  save.save('peaceful');
  if (hold === 'boss') events.emit('boss:phase', { id: 'test', kind: 'test', phase: 1, hp: 30 });
  if (hold === 'pack') events.emit('threat:configure', { kind: 'pack', active: true, center: spot, radius: 40 });
  if (hold === 'memorial') events.emit('memorial:set', { id: 'test', active: true, x: spot.x, z: spot.z });
  step();
  expect(hooks.prompt()).toBeNull();
  save.load('peaceful');
  step();
  expect(hooks.prompt()).toBe(spot.id);
});

it('restores the saved slot’s memorial until it is deactivated', () => {
  const { events, state, save, hooks, visit, step } = setup();
  const spot = FLASCHEN[0]!;
  visit(spot);
  // The barks slice owns the persisted memorial catalogue.
  state.mutable.systems.barks = { t: 0, mem: newMemory(), memorials: [{ id: 'test', x: spot.x, z: spot.z, era: spot.era }] };
  save.save('memorial');
  save.load('memorial');
  step();
  expect(hooks.prompt()).toBeNull();
  events.emit('memorial:set', { id: 'test', active: false });
  step();
  expect(hooks.prompt()).toBe(spot.id);
});

it('hides the bottle while a restored pack holds its arena, even if a fire ends', () => {
  const { events, hooks, visit, step } = setup();
  const spot = FLASCHEN[0]!;
  visit(spot);
  // Hunt emits start when restoring its saved encounter without a fresh story configuration.
  events.emit('hunt:start', { x: spot.x, z: spot.z, radius: 40, hounds: 3, pikeur: false });
  events.emit('threat:configure', { kind: 'fire', active: false });
  step();
  expect(hooks.prompt()).toBeNull();
  events.emit('hunt:end', { reason: 'hub' });
  step();
  expect(hooks.prompt()).toBe(spot.id);
});
