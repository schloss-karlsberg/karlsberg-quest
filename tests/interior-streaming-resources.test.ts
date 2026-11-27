import { BufferGeometry, Group, Mesh, Scene, ShaderMaterial, Vector3 } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { ERA_INFO, type Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { createInitialState, GameStateStore } from '../src/core/state';
import interiors, { type InteriorHooks } from '../src/systems/interiors';
import { disposalCounts } from './disposal-counts';
import { loadPalaceData } from './interiors-fixture';

function setup() {
  const kq: { interiors?: InteriorHooks } = {};
  vi.stubGlobal('window', { kq });
  const { rooms, footprints, h1789, h2025 } = loadPalaceData();
  const building = footprints.find((b) => b.id === 'KB-B01')!;
  const events = new EventBus();
  const scene = new Scene();
  const position = new Vector3(-2000, 0, -2000);
  const shell = new Mesh(new BufferGeometry(), new ShaderMaterial());
  const palace = new Group().add(shell);
  const era = { current: '1789' as Era, get info() { return ERA_INFO[this.current]; } };
  const state = new GameStateStore(createInitialState());
  const ctx = {
    events, scene, era, state,
    player: { position, teleport: (x: number, z: number) => { position.x = x; position.z = z; } },
    camera: { position }, settings: { state: { graphics: 'low', reducedMotion: true } },
    params: new URLSearchParams(), quality: { level: 'low' },
    data: { rooms: rooms.filter((r) => r.building === building.id), footprints: { buildings: [building] } },
    post: { uniforms: {} }, ui: { cards: { hold() {} } },
    world: {
      palace: { object: palace, buildings: [{ id: building.id, index: 0 }] },
      heightfields: { '1789': h1789, '2025': h2025 }, heightAt: (x: number, z: number) => h1789.heightAt(x, z),
      collider: {}, forest: { invalidate() {} },
    },
  } as unknown as GameContext;
  interiors.init(ctx);
  const frame = () => interiors.frame?.(1 / 60, ctx);
  const shift = (to: Era) => {
    const from = era.current;
    era.current = to;
    events.emit('era:change', { from, to });
  };
  return { ctx, events, scene, position, state, frame, shift, shell, hooks: kq.interiors! };
}

afterEach(() => {
  interiors.dispose?.();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('drops streamed meshes and lightmaps when leaving range or switching era', () => {
  const { ctx, events, scene, position, state, frame, shift, shell, hooks } = setup();
  const transitions: string[] = [];
  events.on('room:enter', ({ roomId }) => transitions.push(`enter ${roomId}`));
  events.on('room:leave', ({ roomId }) => transitions.push(`leave ${roomId}`));
  const room = 'B01.2.og-festsaal';
  const counts = disposalCounts();
  const shellCounts = disposalCounts();
  shellCounts.watchTree(shell);
  frame();
  expect(scene.children).toHaveLength(0);
  for (let cycle = 0; cycle < 4; cycle++) {
    expect(hooks.enter(room)).toBe(true);
    frame();
    const building = scene.getObjectByName('interior-KB-B01') as Mesh<BufferGeometry, ShaderMaterial>;
    const lightmap = building.material.uniforms.uLightMap!.value;
    counts.watchTree(scene);
    counts.watch(lightmap);
    expect(counts.live()).toBeGreaterThanOrEqual(5);
    expect(state.state.flags['interior.room']).toBe(room);

    position.set(-2000, 0, -2000);
    interiors.update?.(1 / 60, ctx);
    if (cycle % 2) shift('today');
    else frame();
    expect(scene.children).toHaveLength(0);
    expect(building.parent).toBeNull();
    expect(counts.live()).toBe(0);
    if (cycle % 2) shift('1789');
  }
  expect(transitions).toEqual(Array.from({ length: 4 }, () => [`enter ${room}`, `leave ${room}`]).flat());
  expect(counts.repeated()).toEqual([]);
  expect(shellCounts.live()).toBe(2);
});

it('releases the old building records from the distance cache on every era change', () => {
  const { frame, shift } = setup();
  // Observe the private cache for one frame. Disposal events do not reveal retained CPU records.
  const insert = vi.spyOn(Map.prototype, 'set');
  frame();
  const index = insert.mock.calls.findIndex(([key]) => typeof key === 'object' && key !== null && 'lightTex' in key && 'bp' in key);
  const cache = insert.mock.contexts[index] as Map<object, number>;
  insert.mockRestore();

  expect(index).toBeGreaterThanOrEqual(0);
  expect(cache.size).toBe(1);
  const sizes: number[] = [];
  for (const to of ['1796', '1789', '1793-02', '1789'] as const) {
    shift(to);
    frame();
    sizes.push(cache.size);
  }
  expect(sizes).toEqual([1, 1, 1, 1]);
  interiors.dispose?.();
  expect(cache.size).toBe(0);
});
