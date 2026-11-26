import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { ContentDB } from '../src/content/db';
import type { GameContext } from '../src/core/context';
import { ERA_INFO, type Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { defaultSettings, MemoryStorage, SaveManager } from '../src/core/save';
import { GameStateStore, createInitialState } from '../src/core/state';
import combat, { type CombatHooks } from '../src/systems/combat';
import progression from '../src/systems/progression';
import story, { lookFor } from '../src/systems/story';
import { createStorySlice } from '../src/systems/story/engine';

vi.mock('../src/systems/combat/hud', () => ({
  CombatHud: class { caption() {} clearWorld() {} hideTitle() {} },
}));
vi.mock('../src/systems/combat/targeting', () => ({
  Targeting: class { update() {} aimYaw() { return null; } dispose() {} },
}));
vi.mock('../src/systems/combat/visuals', async () => {
  const { Group } = await import('three');
  return {
    CombatVisuals: class {
      object = new Group();
      setQuality() {}
      setAssets() {}
      hullOf() { return { r: 1, f: 1 }; }
      topOf() { return 1; }
      pop() {}
      dissolve() {}
      clearParticles() {}
      dispose() {}
    },
  };
});
vi.mock('../src/systems/progression/hud', () => ({
  ProgressionHud: class { clearFloats() {} setXp() {} setQuick() {} float() {} gain() {} },
}));
vi.mock('../src/systems/progression/levelup-card', () => ({
  LevelCards: class { clear() {} push() {} },
}));
vi.mock('../src/systems/progression/pages', () => ({
  installProgressionPages: () => ({ refresh() {} }),
}));
vi.mock('../src/systems/story/dialogue/presenter', async (original) => ({
  ...await original<typeof import('../src/systems/story/dialogue/presenter')>(),
  DialoguePresenter: class { clear() {} retireBeat() {} enqueue() {} update() {} },
}));
vi.mock('../src/systems/story/objectives', async (original) => ({
  ...await original<typeof import('../src/systems/story/objectives')>(),
  ObjectiveView: class { set() {} },
}));
vi.mock('../src/systems/story/overlays', async (original) => ({
  ...await original<typeof import('../src/systems/story/overlays')>(),
  StoryOverlays: class { fade() {} gauge() {} tickCard() {} tickChoice() {} },
}));

const FIRST = 'k1.enge';
const SECOND = 'k1.enge.2';
const WARNING = 'laub.k1.enge.2';
const REGULAR_XP = 15;
const ELITE_XP = 45;
const position = { x: 1810, y: 0, z: 274 };
const wake = { x: 1817, y: 0, z: 76 };

function disposeEncounter() {
  story.dispose();
  combat.dispose();
  progression.dispose();
}

afterEach(() => {
  disposeEncounter();
  vi.unstubAllGlobals();
});

async function encounter(storage = new MemoryStorage(), continued?: 'auto' | 'manual') {
  const noop = () => {};
  const hooks: { combat?: CombatHooks } = {};
  vi.stubGlobal('window', { addEventListener: noop, removeEventListener: noop, setInterval: noop, kq: hooks });
  vi.stubGlobal('fetch', undefined);
  const initial = createInitialState();
  initial.era = '1789';
  Object.assign(initial.player, position);
  initial.systems.story = { ...createStorySlice(), active: true, chapter: 'k1', beat: 'k1_14b' };
  const state = new GameStateStore(initial);
  const events = new EventBus();
  let now = 0;
  const save = new SaveManager(state, storage, events, () => now);
  if (continued) expect(save.load(continued)).toBe(true);
  const playerPosition = { ...state.state.player };
  const beats: string[] = [];
  const clears: string[] = [];
  const lines: (string | undefined)[] = [];
  const autosaves: { killed: number | undefined; xp: number | undefined; drops: number | undefined }[] = [];
  events.on('story:beat', ({ beat }) => beats.push(beat));
  events.on('enemy:cleared', ({ group }) => clears.push(group));
  events.on('dialogue:say', ({ id }) => lines.push(id));
  events.on('save:written', ({ slot }) => {
    if (slot !== 'auto') return;
    const snapshot = save.peek()!.systems;
    autosaves.push({ killed: snapshot.combat?.groups[FIRST]?.killed, xp: snapshot.progression?.xp, drops: snapshot.progression?.drops });
  });

  const context = {
    events, state, save, content: new ContentDB([]), params: new URLSearchParams(),
    assets: { licences: async () => null }, audio: { bindVoiceEmitter: () => noop, noise: () => null },
    input: { isDown: () => false, wasPressed: () => false },
    loop: { manual: true, time: 0, tick: 0 }, pause: { paused: false }, settings: { state: defaultSettings() },
    era: { get current() { return state.state.era; }, get info() { return ERA_INFO[state.state.era]; } },
    player: { position: playerPosition, stance: 'stand', yaw: 0, stats: { speed: 0 } },
    world: { look: lookFor('night', '1789'), applyLook: noop, heightAt: () => 0, surfaceAt: () => 'ground', collider: { enabled: false }, heightfield: { slopeDeg: () => 0 } },
    scene: new Scene(), camera: new PerspectiveCamera(), quality: { level: 'low', listeners: [] },
    renderer: { domElement: { addEventListener: noop } },
    systems: { get: () => undefined },
    ui: {
      layer: () => ({ classList: { add: noop, remove: noop }, style: {} }),
      cards: { soft: noop, hold: noop, source: noop },
      hud: { busy: noop }, modals: { count: 0 }, toast: noop,
    },
  } as unknown as GameContext;
  progression.init(context);
  combat.init(context);
  await story.init(context);
  events.emit('game:start', { resumed: true });

  const tick = (seconds = 1 / 60) => {
    now += seconds * 1000;
    story.update(seconds);
    combat.update(1 / 60);
  };
  const live = (group: string) => hooks.combat!.sim()!.live().filter((enemy) => enemy.group === group);
  const writeSave = () => {
    expect(save.save('manual')).toBe(true);
  };
  const reload = () => {
    writeSave();
    expect(save.load('manual')).toBe(true);
  };
  const rewards = () => {
    const { xp, drops, placed } = state.state.systems.progression!;
    return structuredClone({ xp, drops, placed });
  };
  const shift = (to: Era, destination: typeof position) => {
    const from = state.state.era;
    state.mutable.era = to;
    Object.assign(state.mutable.player, destination);
    Object.assign(playerPosition, destination);
    events.emit('era:change', { from, to });
  };
  tick();
  hooks.combat!.god(true);
  return {
    autosaves, beats, clears, lines, live, tick, writeSave, reload, rewards, shift,
    combat: () => state.state.systems.combat!,
    kill: (id: string) => hooks.combat!.kill(id),
  };
}

describe('Die Enge save and resume', () => {
  it('restores four reinforcements from a save made after the first group cleared', async () => {
    const storage = new MemoryStorage();
    const game = await encounter(storage);
    expect(game.kill(FIRST)).toBe(3);
    game.tick();
    game.tick();
    expect(game.lines).toContain(WARNING);
    expect(game.combat().groups[FIRST]?.killed).toBe(3);
    expect(game.combat().groups[SECOND]).toBeUndefined();
    const rewards = game.rewards();
    expect(rewards.drops).toBe(3);
    expect(game.clears).toEqual([FIRST]);

    game.writeSave();
    disposeEncounter();
    const resumed = await encounter(storage, 'manual');
    resumed.tick(8);
    expect(resumed.live(FIRST)).toHaveLength(0);
    expect(resumed.live(SECOND)).toHaveLength(4);
    expect(resumed.lines).not.toContain(WARNING);
    expect(resumed.clears).toEqual([]);
    expect(resumed.rewards()).toEqual(rewards);
  });

  it('resumes from a combat autosave with every reward from the kill tick', async () => {
    const storage = new MemoryStorage();
    const game = await encounter(storage);
    const [first, second, elite] = game.live(FIRST);
    expect(first?.elite).toBe(false);
    expect(second?.elite).toBe(false);
    expect(elite?.elite).toBe(true);
    expect(game.kill(first!.id)).toBe(1);
    expect(game.kill(second!.id)).toBe(1);
    game.tick();
    expect(game.autosaves).toEqual([{ killed: 2, xp: 2 * REGULAR_XP, drops: 2 }]);

    expect(game.kill(elite!.id)).toBe(1);
    game.tick(5);
    const rewards = game.rewards();
    expect(rewards).toMatchObject({ xp: 2 * REGULAR_XP + ELITE_XP, drops: 3 });
    expect(game.autosaves).toEqual([
      { killed: 2, xp: 2 * REGULAR_XP, drops: 2 },
      { killed: 3, xp: rewards.xp, drops: 3 },
    ]);

    disposeEncounter();
    const resumed = await encounter(storage, 'auto');
    resumed.tick(8);
    expect(resumed.live(FIRST)).toHaveLength(0);
    expect(resumed.live(SECOND)).toHaveLength(4);
    expect(resumed.rewards()).toEqual(rewards);
  });

  it('holds the unheard reinforcement warning until a player at the wake point returns to 1789', async () => {
    const storage = new MemoryStorage();
    const game = await encounter(storage);
    expect(game.kill(FIRST)).toBe(3);
    game.tick();
    game.shift('today', wake);
    expect(game.lines).not.toContain(WARNING);
    game.writeSave();

    disposeEncounter();
    const resumed = await encounter(storage, 'manual');
    resumed.tick(8);
    expect(resumed.lines).not.toContain(WARNING);
    expect(resumed.combat().groups[SECOND]).toBeUndefined();

    resumed.shift('1789', position);
    resumed.tick();
    expect(resumed.lines.filter((line) => line === WARNING)).toHaveLength(1);
    resumed.tick(8);
    expect(resumed.live(SECOND)).toHaveLength(4);
    expect(resumed.lines.filter((line) => line === WARNING)).toHaveLength(1);
  });

  it('restores two survivors and advances once after the last two defeats', async () => {
    const game = await encounter();
    expect(game.kill(FIRST)).toBe(3);
    game.tick();
    game.tick();
    game.tick(8);
    expect(game.live(SECOND)).toHaveLength(4);
    const wave = game.live(SECOND);
    expect(game.kill(wave[0]!.id)).toBe(1);
    expect(game.kill(wave[1]!.id)).toBe(1);
    game.tick();
    expect(game.combat().groups[SECOND]?.killed).toBe(2);
    const rewards = game.rewards();
    expect(rewards.drops).toBe(5);

    game.reload();
    game.tick();
    game.tick(8);
    expect(game.live(FIRST)).toHaveLength(0);
    expect(game.live(SECOND)).toHaveLength(2);
    expect(game.beats).not.toContain('k1_14c');
    expect(game.rewards()).toEqual(rewards);

    expect(game.live(SECOND).map((enemy) => enemy.elite)).toEqual([false, true]);
    expect(game.kill(SECOND)).toBe(2);
    game.tick();
    game.tick();
    game.tick();
    expect(game.beats.filter((beat) => beat === 'k1_14c')).toHaveLength(1);
    expect(game.clears).toEqual([FIRST, SECOND]);
    expect(game.rewards()).toMatchObject({ xp: rewards.xp + REGULAR_XP + ELITE_XP, drops: 7 });
  });

  it('finishes a saved beat whose second group was already cleared', async () => {
    const game = await encounter();
    expect(game.kill(FIRST)).toBe(3);
    game.tick();
    game.tick();
    game.tick(8);
    expect(game.kill(SECOND)).toBe(4);
    game.tick();
    expect(game.beats).not.toContain('k1_14c');
    const rewards = game.rewards();

    game.reload();
    game.tick();
    game.tick(8);
    expect(game.beats.filter((beat) => beat === 'k1_14c')).toHaveLength(1);
    expect(game.live(SECOND)).toHaveLength(0);
    expect(game.clears).toEqual([FIRST, SECOND]);
    expect(game.rewards()).toEqual(rewards);
  });
});
