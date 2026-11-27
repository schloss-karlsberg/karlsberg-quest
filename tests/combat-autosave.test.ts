import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { SaveManager, defaultSettings } from '../src/core/save';
import { GameStateStore, createInitialState } from '../src/core/state';
import type { KqHooks } from '../src/debug/hooks';
import { itemDef } from '../src/rpg/items';
import { LEVEL_XP } from '../src/rpg/stats';
import combatSystem from '../src/systems/combat';
import { ProgressionCore, createProgressionSlice } from '../src/systems/progression/logic';

vi.mock('../src/systems/combat/hud', () => ({ CombatHud: class {} }));
vi.mock('../src/systems/combat/targeting', () => ({ Targeting: class {
  update() {}
  aimYaw() { return null; }
  dispose() {}
} }));

afterEach(() => {
  combatSystem.dispose();
  vi.unstubAllGlobals();
});

it('writes updated HP, stamina and Bannlicht in the autosave from a level-up kill', () => {
  const state = new GameStateStore(createInitialState());
  const events = new EventBus();
  const write = vi.fn((_key: string, _value: string) => {});
  const save = new SaveManager(state, { getItem: () => null, setItem: write, removeItem: () => {} }, events, () => 10_000, () => 10_000);
  const hold = vi.spyOn(save, 'hold');
  const progression = new ProgressionCore(() => state.slice('progression', createProgressionSlice), {
    emit: (name, payload) => events.emit(name, payload), item: itemDef, setMembers: () => [],
    statOptions: () => ({}), setLevelFlag: (level) => { state.mutable.flags['rpg.level'] = level; },
  });
  progression.slice().xp = LEVEL_XP[1]! - 1;
  events.on('enemy:killed', () => { save.autosave('progression-loot'); });
  events.on('xp:grant', ({ amount, reason }) => {
    progression.grantXp(amount, reason);
    save.autosave('progression-xp');
  });
  const debug: Pick<KqHooks, 'combat'> = {};
  vi.stubGlobal('window', { kq: debug });
  const ctx = {
    state, events, save, scene: new Scene(), camera: new PerspectiveCamera(), audio: { unlocked: false, noise: () => null },
    settings: { state: defaultSettings() }, quality: { level: 'low', listeners: [] },
    player: { position: new Vector3(), yaw: 0, stats: { speed: 0 }, impulse() {} },
    input: { enabled: true, isDown: () => false, wasPressed: () => false, wasCancelled: () => false },
    era: { current: '1789', info: { night: false } }, loop: { tick: 0, time: 0 },
    world: {
      heightAt: () => 0, surfaceAt: () => 'grass', collider: { enabled: false },
      heightfield: { slopeDeg: () => 0 }, look: { sky: { stars: 0 }, sun: { elevation: 30 } },
    },
    ui: { layer: () => null, modals: { count: 0 }, cards: { source() {} } },
    renderer: { domElement: { addEventListener() {} } },
  } as unknown as GameContext;
  combatSystem.init(ctx);
  combatSystem.update(1 / 60);
  const group = debug.combat!.spawn('streuner', { x: 0, z: -6 });
  const sim = debug.combat!.sim()!;
  expect(sim.p.hp).toBe(sim.p.max);
  sim.p.st.stamina = 60;
  sim.p.bann = 1;
  expect(debug.combat!.kill(group)).toBe(1);
  combatSystem.update(1 / 60);

  expect(write).toHaveBeenCalledTimes(1);
  const snapshot = JSON.parse(write.mock.calls[0]![1]);
  expect(snapshot.systems.progression.level).toBe(2);
  expect(snapshot.systems.combat).toMatchObject({ hp: 112, stamina: 60, bann: 1 });
  expect(snapshot.systems.combat.groups[group].killed).toBe(1);
  expect(hold.mock.calls.every(([reason]) => reason === 'combat:step')).toBe(true);
});
