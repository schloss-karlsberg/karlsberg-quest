import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentDB } from '../src/content/db';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SaveManager } from '../src/core/save';
import { GameStateStore, createInitialState } from '../src/core/state';
import { deriveStats } from '../src/rpg/stats';
import { upsertGroup } from '../src/systems/combat/rules';
import { CombatSim, type SimInput } from '../src/systems/combat/sim';
import { createProgressionSlice, ProgressionCore } from '../src/systems/progression/logic';
import story from '../src/systems/story';
import { createStorySlice } from '../src/systems/story/engine';

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
const era = '1789';
const position = { x: 1810, y: 0, z: 274 };
const input: SimInput = {
  ...position, yaw: 0, moveX: 0, moveZ: 0, attackDown: false, attackPressed: false,
  bannPressed: false, dodgePressed: false, running: false, blocked: false, safe: null, era, time: 'night',
};

afterEach(() => {
  story.dispose();
  vi.unstubAllGlobals();
});

async function encounter(storage = new MemoryStorage(), continued = false) {
  const noop = () => {};
  vi.stubGlobal('window', { addEventListener: noop, removeEventListener: noop, setInterval: noop });
  vi.stubGlobal('fetch', undefined);
  const initial = createInitialState();
  initial.era = era;
  Object.assign(initial.player, position);
  initial.systems.story = { ...createStorySlice(), active: true, chapter: 'k1', beat: 'k1_14b' };
  initial.systems.combat = { hp: 100, stamina: 100, bann: 2, groups: {}, deaths: 0 };
  initial.systems.progression = createProgressionSlice();
  const state = new GameStateStore(initial);
  const events = new EventBus();
  const save = new SaveManager(state, storage, events);
  if (continued) expect(save.load('manual')).toBe(true);
  const combat = () => state.state.systems.combat!;
  const progression = new ProgressionCore(() => state.mutable.systems.progression!, {
    emit: events.emit.bind(events), item: () => undefined, setMembers: () => [],
    statOptions: () => ({}), setLevelFlag: noop,
  });
  const makeSim = () => new CombatSim({ heightAt: () => 0 }, combat().groups, {
    gentle: false, reducedMotion: false, stats: deriveStats(null), sweep: false, konter: false, waerme: false, dritter: false,
  });
  let sim = makeSim();
  const beats: string[] = [];
  const clears: string[] = [];
  const lines: (string | undefined)[] = [];
  events.on('story:beat', ({ beat }) => beats.push(beat));
  events.on('enemy:cleared', ({ group }) => clears.push(group));
  events.on('enemy:spawn', (request) => upsertGroup(combat().groups, request));
  events.on('dialogue:say', ({ id }) => lines.push(id));
  events.on('save:loaded', () => { sim = makeSim(); });
  await story.init({
    events, state, save, content: new ContentDB([]), params: new URLSearchParams(),
    assets: { licences: async () => null }, audio: { bindVoiceEmitter: () => noop },
    input: { isDown: () => false }, loop: { manual: true }, pause: { paused: false }, settings: { state: {} },
    era: { current: initial.era }, player: { position, stance: 'stand', stats: {} }, world: {},
    systems: { get: () => undefined },
    ui: { layer: () => ({ classList: { remove: noop } }), cards: { soft: noop, hold: noop } },
  } as unknown as GameContext);
  events.emit('game:start', { resumed: true });

  const tick = (seconds = 1 / 60) => {
    story.update(seconds);
    for (const event of sim.step(1 / 60, input)) {
      if (event.type === 'cleared') events.emit('enemy:cleared', { group: event.group, kind: event.kind });
      if (event.type === 'killed') {
        const { id, group, kind, x, z, boss, def } = event.e;
        progression.enemyKilled({ id, group, kind, x, z, boss, era, by: 'light' }, def);
        progression.grantXp(def.xp, `enemy:${kind}`);
      }
    }
  };
  const live = (group: string) => sim.live().filter((enemy) => enemy.group === group);
  const writeSave = () => {
    expect(save.save('manual')).toBe(true);
  };
  const reload = () => {
    writeSave();
    expect(save.load('manual')).toBe(true);
  };
  const rewards = () => {
    const { xp, drops, placed } = progression.slice();
    return structuredClone({ xp, drops, placed });
  };
  tick();
  return { beats, clears, lines, live, tick, writeSave, reload, combat, rewards, kill: (id: string) => sim.killNow(id) };
}

describe('Die Enge save and resume', () => {
  it('restores four reinforcements from a save made after the first group cleared', async () => {
    const storage = new MemoryStorage();
    const game = await encounter(storage);
    expect(game.kill(FIRST)).toBe(3);
    game.tick();
    game.tick();
    expect(game.lines).toContain('laub.k1.enge.2');
    expect(game.combat().groups[FIRST]?.killed).toBe(3);
    expect(game.combat().groups[SECOND]).toBeUndefined();
    const rewards = game.rewards();
    expect(rewards.drops).toBe(3);
    expect(game.clears).toEqual([FIRST]);

    game.writeSave();
    story.dispose();
    const resumed = await encounter(storage, true);
    resumed.tick(8);
    expect(resumed.live(FIRST)).toHaveLength(0);
    expect(resumed.live(SECOND)).toHaveLength(4);
    expect(resumed.lines).not.toContain('laub.k1.enge.2');
    expect(resumed.clears).toEqual([]);
    expect(resumed.rewards()).toEqual(rewards);
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

    const remainingXp = game.live(SECOND).reduce((xp, enemy) => xp + enemy.def.xp, 0);
    expect(game.kill(SECOND)).toBe(2);
    game.tick();
    game.tick();
    game.tick();
    expect(game.beats.filter((beat) => beat === 'k1_14c')).toHaveLength(1);
    expect(game.clears).toEqual([FIRST, SECOND]);
    expect(game.rewards()).toMatchObject({ xp: rewards.xp + remainingXp, drops: 7 });
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
