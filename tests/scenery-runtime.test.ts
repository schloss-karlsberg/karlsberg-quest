import { Color, Float32BufferAttribute, Group, Mesh, PlaneGeometry, Scene, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import type { Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { createInitialState, GameStateStore } from '../src/core/state';
import scenery, { type SceneryHooks } from '../src/systems/scenery';
import { BAUWAGEN_SET, BAUWAGEN_SITE } from '../src/systems/scenery/bauwagen';
import { GATE_CENTER } from '../src/systems/scenery/sets';
import { FootprintCollider } from '../src/world/collision';
import { loadPalaceFootprints } from './interiors-fixture';

const windowFootprint = { id: 'KB-B10', ring: [[-2, 0], [2, 0], [2, 4], [-2, 4]] as [number, number][] };
const gateFootprint = loadPalaceFootprints().find(f => f.id === 'KB-B39')!;
const footprints = [windowFootprint, gateFootprint];

function sceneryGame(start: Era = 'today', beforeScenery?: (events: EventBus) => void) {
  const state = new GameStateStore(createInitialState());
  const events = new EventBus();
  beforeScenery?.(events);
  const kq: { scenery?: SceneryHooks } = {};
  vi.stubGlobal('window', { kq });
  const scene = new Scene();
  const player = { position: new Vector3(-1000, 0, -1000), yaw: 0 };
  const era = { current: start };
  const collider = new FootprintCollider(footprints.map(f => f.ring));
  const terrain = { heightAt: () => 0, bounds: { x0: -2000, z0: -2000, x1: 3000, z1: 3000 } };
  // A single pane is enough to distinguish the full and zero shares of light.
  const glass = new PlaneGeometry(1.2, 2).translate(0, 2, 0);
  glass.setAttribute('color', new Float32BufferAttribute(new Float32Array(12), 3));
  glass.setAttribute('aBld', new Float32BufferAttribute(new Float32Array(4), 1));
  const palace = new Group().add(new Mesh(glass));
  const ctx = {
    era, state, events, scene, player, camera: { position: new Vector3() },
    data: { footprints: { buildings: footprints } },
    quality: { level: 'low' }, settings: { state: { reducedMotion: true } },
    content: { facts: new Map() }, input: {}, ui: { hud: { prompt: vi.fn() } },
    world: {
      collider, heightfield: terrain, heightfields: { '1789': terrain, '2025': terrain },
      palace: { object: palace, buildings: [{ id: 'KB-B10', index: 0 }] },
      look: { disc: 'sun', sun: { elevation: 20 }, fog: { density: 0, heightDensity: 0 } },
      sky: { uniforms: { uHorizon: { value: new Color() }, uTime: { value: 0 } } },
      forest: { addClearing: vi.fn() }, nature: { props: { addClearing: vi.fn() }, cover: { addClearing: vi.fn() } },
    },
  } as unknown as GameContext;
  scenery.init(ctx);
  const step = () => scenery.update(1 / 60, ctx);
  step();
  return {
    state, events, collider, player, hooks: kq.scenery!, step,
    shift(to: Era) {
      const from = era.current;
      era.current = to;
      events.emit('era:change', { from, to });
    },
    lit: () => scene.getObjectByName('scenery-windows-KB-B10')?.visible,
    lights(on: boolean, share: number) {
      events.emit('story:cue', { id: 'scenery:windows', data: { building: 'KB-B10', era: '1793-02', on, share } });
    },
  };
}
afterEach(() => { scenery.dispose(); vi.unstubAllGlobals(); });

describe('era-specific scenery', () => {
  it('streams the present-day trailer and its obstacle over the approach and departure distances', () => {
    const g = sceneryGame();
    const { x, z } = BAUWAGEN_SITE;
    const walk = (dx: number) => { g.player.position.set(x + dx, 0, z); g.step(); };
    walk(BAUWAGEN_SET.range + 1);
    expect(g.hooks.built()).not.toContain('bauwagen');
    walk(BAUWAGEN_SET.range - 1);
    expect(g.hooks.built()).toContain('bauwagen');
    expect(g.collider.solidAt(x, z)).toBe(true);
    walk(BAUWAGEN_SET.range + 10);
    expect(g.hooks.built()).toContain('bauwagen');
    walk(BAUWAGEN_SET.range + 81);
    expect(g.hooks.built()).not.toContain('bauwagen');
    expect(g.collider.solidAt(x, z)).toBe(false);
    walk(0);
    g.shift('1793-02');
    expect(g.hooks.built()).not.toContain('bauwagen');
    expect(g.collider.solidAt(x, z)).toBe(false);
    g.shift('today');
    g.step();
    expect(g.hooks.built()).toContain('bauwagen');
    expect(g.collider.solidAt(x, z)).toBe(true);
  });

  it('keeps the Orangerie lit only in the requested era until the lights are turned off', () => {
    const g = sceneryGame('1793-02');
    g.lights(true, 1);
    expect(g.lit()).toBe(true);
    g.shift('today');
    expect(g.lit()).toBe(false);
    g.step();
    g.shift('1793-02');
    expect(g.lit()).toBe(true);
    g.lights(false, 1);
    expect(g.lit()).toBeUndefined();
    expect(g.state.state.systems.scenery?.windows).toEqual([]);
  });

  it('applies a new share to already-lit windows in the same era', () => {
    const g = sceneryGame('1793-02');
    g.lights(true, 1);
    expect(g.lit()).toBe(true);
    g.lights(true, 0);
    expect(g.lit()).toBeUndefined();
    g.lights(true, 1);
    expect(g.lit()).toBe(true);
  });

  it('loads a different window share from a slot with the same building and era', () => {
    const g = sceneryGame('1793-02');
    g.lights(true, 1);
    const slot = createInitialState();
    slot.era = '1793-02';
    slot.systems.scenery = { windows: [{ building: 'KB-B10', era: '1793-02', share: 0 }], gate: 0 };
    g.state.replace(slot);
    g.events.emit('game:start', { resumed: true });
    expect(g.lit()).toBeUndefined();
  });

  it('records a resumed story cue in the loaded slot before the next tick', () => {
    const g = sceneryGame('1789', events => {
      // Story subscribes before scenery and can issue cues while resuming a beat.
      events.on('save:loaded', () => events.emit('story:cue', { id: 'scenery:coat', data: { visible: false } }));
    });
    const previous = g.state.state.systems.scenery!;
    const slot = createInitialState();
    slot.era = '1789';
    g.state.replace(slot, 'load');
    g.events.emit('save:loaded', { slot: 'manual' });
    expect(g.state.state.systems.scenery?.coatTaken).toBe(true);
    expect(g.hooks.coat().visible).toBe(false);
    expect(previous.coatTaken).toBeUndefined();
  });

  it('restores the coat, gate and windows when a slot is loaded during play', () => {
    const g = sceneryGame('1793-02');
    const gateBlocked = () => g.collider.resolve(...GATE_CENTER, 0.35).hit;
    expect(gateBlocked()).toBe(true);
    g.hooks.coat(false);
    g.hooks.gate(true);
    expect(gateBlocked()).toBe(false);
    g.lights(true, 1);
    const slot = createInitialState(); // older save with no scenery slice
    slot.era = '1793-02';
    g.state.replace(slot);
    g.events.emit('save:loaded', { slot: 'manual' });
    expect(gateBlocked()).toBe(true);
    expect(g.hooks.coat().visible).toBe(true);
    expect(g.lit()).toBeUndefined();
    expect(g.state.state.systems.scenery).toEqual({ windows: [], gate: 0 });
  });
});
