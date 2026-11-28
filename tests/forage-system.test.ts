import { Group, PerspectiveCamera, Scene, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus, type GameEvents } from '../src/core/events';
import { createInitialState, GameStateStore } from '../src/core/state';
import forage from '../src/systems/forage';
import { NUT, THROW } from '../src/systems/forage/logic';
import npc from '../src/systems/npc';
import { createProgressionSlice } from '../src/systems/progression/logic';
import { FootprintCollider } from '../src/world/collision';
import { inputSurface, PLAYER_DT } from './player-fixture';
import { stubSetPieceDom } from './set-piece-dom';

vi.mock('../src/systems/npc/ui', () => ({ ConversationView: class { close() {} } }));

function setup(collider = new FootprintCollider([]), trunkZ?: number) {
  const { input } = inputSurface();
  const dom = stubSetPieceDom();
  const events = new EventBus();
  const state = new GameStateStore(createInitialState());
  const pack = state.slice('progression', createProgressionSlice).inventory;
  pack[NUT] = 3;
  events.on('item:take', ({ item, count = 1, receipt }) => {
    if (item !== NUT || !receipt || pack[NUT]! < count) return;
    pack[NUT]! -= count;
    receipt.amount = count;
  });
  events.on('combat:aim', ({ receipt }) => Object.assign(receipt, { found: true, x: THROW.handRight, y: 1, z: -5 }));
  const impacts: GameEvents['forage:impact'][] = [];
  events.on('forage:impact', (hit) => impacts.push(hit));
  const ctx = {
    events, state, input,
    player: { position: new Vector3(), yaw: 0, stance: 'stand' },
    scene: new Scene(), camera: new PerspectiveCamera(),
    assets: { peek: () => ({ scene: new Group(), animations: [] }) },
    loop: { requestRender() {} },
    era: { current: '1789' },
    audio: { bus: () => null },
    quality: { level: 'high', listeners: [] },
    settings: { state: { reducedMotion: true } },
    world: {
      heightAt: () => 0, surfaceAt: () => 'meadow', collider, nature: {},
      forest: {
        trunksNear: (_x: number, _z: number, _r: number, visit: (x: number, z: number, r: number, top: number) => void) => {
          if (trunkZ !== undefined) visit(THROW.handRight, trunkZ, 0.3, 3);
        },
      },
    },
    ui: { layer: () => dom.body, modals: { count: 0 }, hud: { dock() {} } },
  } as unknown as GameContext;
  forage.init(ctx);
  forage.frame();
  const step = (frames = 1) => {
    for (let i = 0; i < frames; i++) {
      forage.update(PLAYER_DT);
      input.endStep();
    }
  };
  return { ctx, events, input, impacts, step, hooks: window.kq!.forage! };
}

afterEach(() => {
  forage.dispose();
  npc.dispose();
  vi.unstubAllGlobals();
});

describe('forage projectile collision', () => {
  it.each([
    { wallZ: -0.46, trunkZ: undefined, on: 'wall', z: -0.46 },
    { wallZ: undefined, trunkZ: -0.83, on: 'wood', z: -0.46 },
    { wallZ: -0.51, trunkZ: undefined, on: 'body', z: -0.49 },
  ])('hits $on first when the same flight step also reaches another collider', ({ wallZ, trunkZ, on, z }) => {
    const collider = new FootprintCollider(wallZ === undefined ? [] : [[[-1, wallZ], [1, wallZ], [1, wallZ - 1], [-1, wallZ - 1]]]);
    const s = setup(collider, trunkZ);
    npc.init(s.ctx);
    s.events.emit('npc:spawn', { npc: 'gardist', x: THROW.handRight, z: -0.85, watch: { fov: 70, range: 14 } });

    expect(s.hooks.throw()).toBe(true);
    s.step(1);
    expect(s.impacts).toHaveLength(1);
    expect(s.impacts[0]).toMatchObject({ on, z: expect.closeTo(z, 5) });
    expect(s.impacts[0]?.npc).toBe(on === 'body' ? 'gardist' : undefined);
    s.step(90);
    expect(s.impacts).toHaveLength(1);
  });
});

describe('forage throw input', () => {
  it('cancels a held F aim when another input owner mutes throw', () => {
    const s = setup();
    s.input.simulate('KeyF', true);
    s.step();
    expect(s.hooks.state()).toMatchObject({ holding: true, thrown: 0 });
    s.input.muted.add('throw');
    s.step();
    expect(s.hooks.state()).toMatchObject({ holding: false, thrown: 0, nuts: 3 });
    s.input.muted.delete('throw');
    s.input.simulate('KeyF', false);
    s.step();
    expect(s.hooks.state()).toMatchObject({ holding: false, thrown: 0, nuts: 3 });
  });

  it('drops a buffered touch throw even if the owner releases the mute before cooldown ends', () => {
    const s = setup();
    const tap = () => {
      s.input.press('throw', true);
      s.input.press('throw', false);
      s.step();
    };
    tap();
    s.step(20);
    tap();
    expect(s.hooks.state()).toMatchObject({ thrown: 1, nuts: 2 });
    s.input.muted.add('throw');
    s.step();
    s.input.muted.delete('throw');
    s.step(30);
    expect(s.hooks.state()).toMatchObject({ thrown: 1, nuts: 2 });
    tap();
    expect(s.hooks.state()).toMatchObject({ thrown: 2, nuts: 1 });
  });
});
