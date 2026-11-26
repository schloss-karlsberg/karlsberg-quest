import { afterEach, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import survey, { SCAN_AUTO_OFF_S, SCAN_RADIUS } from '../src/systems/survey';
import type { ScanMode } from '../src/world/world';
import { explorationSession } from './exploration-fixture';

function setup() {
  const { events, state, save, era } = explorationSession();
  const world = {
    scanMode: 0 as ScanMode, mapMix: 0,
    terrain: { uniforms: { uMap: { value: {} } } },
    setScanMode(mode: ScanMode) { this.scanMode = mode; },
    setMapMix(mix: number) { this.mapMix = mix; },
    setScanArea: vi.fn(),
  };
  const keys = new Set<string>();
  const params = new URLSearchParams('skills=strict');
  const toast = vi.fn();
  const player = { position: { x: 12, z: -8 } };
  const ctx = {
    world, events, state, params, player, era, systems: { get: () => ({ id: 'travel' }) },
    input: { bindings: {}, wasPressed: (key: string) => keys.has(key), wasPressedWithShift: () => false },
    settings: { state: { reducedMotion: true }, subscribe: vi.fn() },
    ui: { hud: { setStatus: vi.fn() }, toast }, t: (key: string) => key,
  } as unknown as GameContext;
  survey.init(ctx);
  const tick = (dt: number, key?: string) => {
    if (key) keys.add(key);
    survey.update(dt, ctx);
    keys.clear();
  };
  const frame = (dt: number) => survey.frame(dt, ctx);
  return { events, state, save, world, toast, tick, frame, params, player };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('rejects locked direct scans and lets the player leave an active mode with the same key', () => {
  const { events, state, world, toast, tick } = setup();
  const changed = vi.fn();
  events.on('scan:mode', changed);
  state.mutable.skills.relief = 1;
  tick(0, 'scan2');
  expect(world.scanMode).toBe(0);
  expect(changed).not.toHaveBeenCalled();
  expect(toast).toHaveBeenCalledWith('skills.locked.scan');
  tick(0, 'scan1');
  expect(world.scanMode).toBe(1);
  tick(0, 'scan1');
  expect(changed.mock.calls.map(([e]) => e.mode)).toEqual([1, 0]);
});

it('auto-exits four simulation seconds after the latest find, including the exact boundary', () => {
  const { events, state, world, tick, frame, toast } = setup();
  state.mutable.skills.relief = 1;
  tick(0, 'scan1');
  events.emit('clue:found', { id: 'one', kind: 'relief' });
  tick(3);
  events.emit('clue:found', { id: 'two', kind: 'relief' });
  tick(SCAN_AUTO_OFF_S - 0.25);
  frame(60); // a paused game can still render
  expect(world.scanMode).toBe(1);
  tick(0.25);
  expect(world.scanMode).toBe(0);
  tick(2);
  expect(toast.mock.calls.filter(([key]) => key === 'scan.auto0')).toHaveLength(1);
});

it('cancels the pending exit when the player chooses another unlocked scan', () => {
  const { events, state, world, tick } = setup();
  state.mutable.skills.relief = 2;
  tick(0, 'scan1');
  events.emit('clue:found', { id: 'one', kind: 'relief' });
  tick(2, 'scan2');
  tick(SCAN_AUTO_OFF_S + 1);
  expect(world.scanMode).toBe(2);
});

it('honours the map handoff, skill limit and explicit off request', () => {
  const { events, state, world, toast, tick } = setup();
  state.mutable.skills.kartograf = 1;
  tick(0, 'map');
  expect(world.mapMix).toBe(0);
  events.emit('survey:cycle-map', {});
  tick(0);
  expect(world.mapMix).toBeGreaterThan(0);
  events.emit('survey:show-map', { layer: 1935 });
  expect(toast).toHaveBeenLastCalledWith('skills.locked.map');
  expect(world.mapMix).toBeGreaterThan(0);
  events.emit('survey:show-map', { layer: 0 });
  expect(world.mapMix).toBe(0);
});

it('removes a scan and map the loaded slot has not unlocked', () => {
  const { events, state, save, world, tick } = setup();
  save.save('untrained');
  state.mutable.skills.relief = 3;
  state.mutable.skills.kartograf = 1;
  tick(0, 'scan3');
  events.emit('survey:show-map', { layer: 1840 });
  expect(world.scanMode).toBe(3);
  expect(world.mapMix).toBeGreaterThan(0);
  save.load('untrained');
  tick(1 / 60);
  expect(world.scanMode).toBe(0);
  expect(world.mapMix).toBe(0);
});

it('centres the relief scan at the player on each frame', () => {
  const { world, frame, player, params } = setup();
  frame(0);
  expect(world.setScanArea).toHaveBeenLastCalledWith(12, -8, SCAN_RADIUS);
  player.position.x = 91;
  params.set('scanall', '');
  frame(0);
  expect(world.setScanArea).toHaveBeenLastCalledWith(91, -8, 1e6);
});

it('drops an unconsumed map handoff when another slot loads before the next tick', () => {
  const { events, state, save, world, tick } = setup();
  state.mutable.skills.kartograf = 1;
  save.save('other');
  events.emit('survey:cycle-map', {});
  save.load('other');
  tick(1 / 60);
  expect(world.mapMix).toBe(0);
});

it.todo('decide whether to save the selected scan and map per slot when both slots have access');

it('rechecks free-survey overlays once the new story has started', () => {
  const { events, state, world, tick, params } = setup();
  params.delete('skills');
  tick(0, 'scan2');
  events.emit('survey:show-map', { layer: 1840 });
  expect(world.scanMode).toBe(2);
  events.emit('game:start', { resumed: false });
  // Story starts after survey in the registry.
  state.slice('story', () => ({ active: true }));
  tick(1 / 60);
  expect(world.scanMode).toBe(0);
  expect(world.mapMix).toBe(0);
});

it('keeps the remaining relief countdown through Continue from the title', () => {
  const { events, state, world, tick } = setup();
  state.mutable.skills.relief = 1;
  tick(0, 'scan1');
  events.emit('clue:found', { id: 'one', kind: 'relief' });
  tick(3);
  // back to the title (paused: no ticks), then „Weiter“ in the same game
  events.emit('game:start', { resumed: true });
  tick(SCAN_AUTO_OFF_S - 3 - 0.25);
  expect(world.scanMode).toBe(1);
  tick(0.25);
  expect(world.scanMode).toBe(0);
});

it('still rechecks the skills on Continue', () => {
  const { events, state, world, tick } = setup();
  state.mutable.skills.relief = 1;
  tick(0, 'scan1');
  state.mutable.skills.relief = 0;
  events.emit('game:start', { resumed: true });
  tick(1 / 60);
  expect(world.scanMode).toBe(0);
});
