import { Vector3 } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import type { PlayerState } from '../src/core/state';
import { PARTY_CHECKPOINT } from '../src/systems/party/placements';
import { PartyRuntime, type PartyBus } from '../src/systems/party/runtime';
import story from '../src/systems/story';
import { createStorySlice } from '../src/systems/story/engine';
import { HOME } from '../src/systems/story/hub/home';
import { explorationSession } from './exploration-fixture';
import { initStory } from './story-session-fixture';

vi.mock('../src/systems/story/dialogue/portraits', () => ({ ensurePortraitDefs: vi.fn() }));
vi.mock('../src/systems/story/objectives', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/systems/story/objectives')>(),
  ObjectiveView: class { set() {} },
}));

const quelle = { x: HOME.spawn.x, z: HOME.spawn.z, yaw: -HOME.spawn.yaw * Math.PI / 180 };
const arrival = { ...PARTY_CHECKPOINT, yaw: -40 * Math.PI / 180 };

function session() {
  const { events, state, save, era, element } = explorationSession();
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const player = {
    position: new Vector3(), yaw: 0, stance: 'stand', flying: false,
    stats: { speed: 0, lanternLit: false },
    teleport(x: number, z: number, yaw?: number) {
      this.position.set(x, 0, z);
      if (yaw !== undefined) this.yaw = yaw;
    },
    writeState(s: PlayerState) {
      Object.assign(s, pose());
    },
  };
  const pose = () => ({ x: player.position.x, z: player.position.z, yaw: player.yaw });
  const restore = () => {
    const { x, z, yaw } = state.state.player;
    player.teleport(x, z, yaw);
  };
  events.on('save:loaded', restore);
  const ctx = {
    events, state, save, era, player,
    loop: { manual: true },
    pause: { reasons: new Set() },
    systems: { get: () => undefined },
    input: { touchMode: true, wasPressed: () => false },
    settings: { state: { reducedMotion: true } },
    ui: { toast: vi.fn() },
  } as unknown as GameContext;
  const buildSet = vi.fn(() => null);
  const init = async () => {
    await initStory(ctx, element);
    // Boot registers the party after the story. Its credits resume listener must still run.
    return new PartyRuntime({
      bus: events as unknown as PartyBus,
      people: () => undefined,
      buildSet,
      world: { heightAt: () => 0, player: pose, era: () => era.current },
      slice: () => state.slice('party', () => ({ variant: null, credits: 'none' })),
      defaultLines: [],
      reduced: () => true,
      cinematic: { available: () => true },
    });
  };
  const seed = (beat: 'e2' | 'e3') => {
    state.mutable.systems.story = { ...createStorySlice(), active: true, chapter: 'enden', beat, ending: 'museum', look: beat === 'e3' ? 'dusk' : 'dawn', beatTime: beat === 'e3' ? 30 : 0 };
    Object.assign(state.mutable.flags, { 'flag.end': 'museum', 'story.party': 'museum' });
    Object.assign(state.mutable.player, quelle);
    restore();
  };
  return { events, state, save, pose, init, seed, buildSet };
}

afterEach(() => {
  story.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('repairs the e3 autosave written at the Quelle before the arrival runs', async () => {
  const { events, state, save, pose, init, seed, buildSet } = session();
  await init();
  seed('e2');
  events.emit('game:start', { resumed: true });
  story.update(1 / 60);
  expect(save.peek()?.systems.story).toMatchObject({ beat: 'e3' });
  expect(save.peek()?.player).toMatchObject(quelle);

  expect(save.load()).toBe(true);
  // the arrival step (0.4 s) runs again after the load
  for (let i = 0; i < 40; i++) story.update(1 / 60);
  expect(pose()).toEqual(arrival);
  expect(save.peek()?.player).toMatchObject(arrival);
  expect(state.state.systems.story?.look).toBe('dusk');
  story.update(1 / 60);
  expect(buildSet).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'museum');
});

it.each(['boot', 'in-session load'])('%s restores the e3 party and skips saved playing credits once', async (entry) => {
  const { events, state, save, pose, init, seed, buildSet } = session();
  seed('e3');
  state.mutable.systems.party = { variant: 'museum', credits: 'playing' };
  save.save();
  if (entry === 'boot') expect(save.load()).toBe(true);
  const party = await init();
  const done = vi.fn();
  const camera = vi.fn();
  events.on('credits:done', done);
  events.on('cinematic:play', camera);

  if (entry === 'boot') events.emit('game:start', { resumed: true });
  else expect(save.load()).toBe(true);
  expect(pose()).toEqual(arrival);
  expect(state.state.systems.story).toMatchObject({ look: 'dusk', finished: true });
  expect(buildSet).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'museum');
  expect(done).toHaveBeenCalledExactlyOnceWith({ skipped: true });
  expect(party.quiet).toBe(false);
  expect(camera).not.toHaveBeenCalled();
});

it('preserves the pose after walking back to the Quelle once the credits are done', async () => {
  const { events, state, save, pose, init, seed, buildSet } = session();
  await init();
  seed('e3');
  events.emit('game:start', { resumed: true });
  // The credits checkpoint can still be in e3 until the next fixed step completes the beat.
  Object.assign(state.mutable.systems.story!, { finished: true, look: 'dusk' });
  state.mutable.flags['story.credits'] = true;
  state.mutable.systems.party = { variant: 'museum', credits: 'done' };
  Object.assign(state.mutable.player, quelle);
  save.save('free-play');

  expect(save.load('free-play')).toBe(true);
  expect(pose()).toEqual(quelle);
  expect(buildSet).toHaveBeenLastCalledWith(expect.anything(), 'museum');
});
