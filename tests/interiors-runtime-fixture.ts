import { BufferGeometry, Group, Mesh, Scene, ShaderMaterial, Vector3 } from 'three';
import { vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { ERA_INFO, type Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SaveManager } from '../src/core/save';
import { createInitialState, GameStateStore, type GameState } from '../src/core/state';
import type { Input } from '../src/player/input';
import { FootprintCollider } from '../src/world/collision';
import { Player } from '../src/player/player';
import { centroid } from '../src/systems/interiors/geom';
import { buildPlan } from '../src/systems/interiors/layout';
import interiors, { type InteriorHooks } from '../src/systems/interiors';
import { loadPalaceData } from './interiors-fixture';

const { rooms, footprints, h1789, h2025 } = loadPalaceData();
export const cataloguePlan = buildPlan({ rooms, footprints, mode: 'intact', terrain: (x, z) => h1789.heightAt(x, z) });

export function savedRoom(roomId: string): GameState {
  const room = rooms.find(r => r.roomId === roomId)!;
  const [x, z] = centroid(room.polygon);
  const slot = createInitialState();
  slot.era = '1793-07';
  slot.meta.savedAt = '2026-11-26T12:00:00.000Z';
  Object.assign(slot.player, { x, y: room.floor_h, z });
  slot.flags['interior.room'] = roomId;
  slot.flags['interior.building'] = room.building;
  return slot;
}

export function interiorGame(initial: GameState = createInitialState(), shellReady = true) {
  const state = new GameStateStore(initial);
  const events = new EventBus();
  const save = new SaveManager(state, new MemoryStorage(), events);
  const era = { current: initial.era, get info() { return ERA_INFO[this.current]; } };
  const kq: { interiors?: InteriorHooks } = {};
  vi.stubGlobal('window', { kq });
  const palace = new Group();
  const mesh = new Mesh(new BufferGeometry(), new ShaderMaterial());
  if (shellReady) palace.add(mesh);
  const world = {
    palace: { object: palace, buildings: footprints.map(({ id }, index) => ({ id, index })) },
    heightfields: { '1789': h1789, '2025': h2025 },
    get heightfield() { return this.heightfields[era.info.terrain]; },
    groundOverride: null as GameContext['world']['groundOverride'],
    heightAt(x: number, z: number, yHint?: number) {
      const h = this.heightfield.heightAt(x, z);
      return this.groundOverride?.(x, z, h, yHint) ?? h;
    },
    collider: new FootprintCollider(footprints.map(f => f.ring)), forest: { invalidate: vi.fn() },
  };
  const input = { isDown: vi.fn<(action: string) => boolean>(() => false), wasPressed: vi.fn(() => false) };
  const player = new Player({
    heightAt: (x, z) => world.heightAt(x, z), bounds: () => h1789.bounds,
    collide: (x, z, r) => world.collider.resolve(x, z, r), canFly: () => false,
    surfaceAt: () => 'wood', coverAt: () => 0,
  }, input as unknown as Input, events);
  player.readState(initial.player);
  events.on('save:loaded', () => player.readState(state.state.player));
  const log: string[] = [];
  events.on('room:enter', ({ id }) => log.push('enter ' + id));
  events.on('room:leave', ({ id }) => log.push('leave ' + id));
  const ui = { cards: { hold: vi.fn() }, hud: { prompt: vi.fn(), subtitle: vi.fn() }, toast: vi.fn() };
  const ctx = {
    world, data: { rooms, footprints: { buildings: footprints } }, scene: new Scene(), era, player,
    state, events, input, ui, params: new URLSearchParams(), quality: { level: 'low' },
    content: { clues: new Map() }, settings: { state: { reducedMotion: true } },
    camera: { position: new Vector3() }, post: { uniforms: {} },
  } as unknown as GameContext;
  interiors.init(ctx);
  return {
    ctx, state, player, events, ui, log, input, save,
    get hooks() { return kq.interiors!; },
    enter(roomId: string) {
      const p = ctx.world.roomAnchor!(roomId)!;
      player.position.set(p.x, p.y, p.z);
      player.teleport(p.x, p.z);
      interiors.update(1 / 60, ctx);
    },
    step: () => interiors.update(1 / 60, ctx),
    fixedStep() {
      player.update(1 / 60);
      interiors.update(1 / 60, ctx);
      player.writeState(state.mutable.player);
    },
    finishShell() { palace.add(mesh); interiors.frame(0, ctx); },
    shift(to: Era) {
      const from = era.current;
      era.current = to;
      events.emit('era:change', { from, to });
    },
  };
}
