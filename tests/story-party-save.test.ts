import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SaveManager } from '../src/core/save';
import { createInitialState, GameStateStore, type GameState } from '../src/core/state';
import type { StoryHooks } from '../src/systems/story';
import storySystem from '../src/systems/story';
import { createStorySlice } from '../src/systems/story/engine';
import type { EndingId } from '../src/systems/story/types';

const showEnding = vi.fn();
const showEpilogue = vi.fn();
let chooseEnding: (id: EndingId) => void;
let goToParty: (id: EndingId) => void;
vi.mock('../src/systems/story/endings/ui', () => ({ EndingScreen: class {
  constructor(deps: { chosen: typeof chooseEnding; party: typeof goToParty }) {
    chooseEnding = deps.chosen;
    goToParty = deps.party;
  }
  show = showEnding;
  showEpilogue = showEpilogue;
  close() {}
} }));
vi.mock('../src/systems/story/endings/stage', () => ({ EndingStage: class { dispose() {} } }));
vi.mock('../src/systems/story/dialogue/voiceClips', () => ({ VoiceClips: class { init() {} preload() {} } }));
vi.mock('../src/systems/story/dialogue/presenter', async (original) => ({
  ...await original<typeof import('../src/systems/story/dialogue/presenter')>(),
  DialoguePresenter: class { clear() {} retireBeat() {} update() {} enqueue() {} },
}));
vi.mock('../src/systems/story/objectives', async (original) => ({
  ...await original<typeof import('../src/systems/story/objectives')>(),
  ObjectiveView: class { set() {} },
}));
vi.mock('../src/systems/story/overlays', async (original) => ({
  ...await original<typeof import('../src/systems/story/overlays')>(),
  StoryOverlays: class { fade() {} card() {} tickCard() {} tickChoice() {} closeChoice() {} dropCard() {} clearCurtain() {} },
}));

function endingSave(beat: string | null, extra: Partial<ReturnType<typeof createStorySlice>> = {}): GameState {
  const state = createInitialState();
  state.systems.story = { ...createStorySlice(), active: beat !== null, chapter: 'enden', beat, unlocked: ['enden'], ...extra };
  Object.assign(state.player, { x: 1059.3, z: -833.1 });
  return state;
}

async function setup(initial: GameState) {
  showEnding.mockClear();
  showEpilogue.mockClear();
  const state = new GameStateStore(initial);
  const events = new EventBus();
  const save = new SaveManager(state, new MemoryStorage(), events);
  const player = {
    position: { ...initial.player }, stance: 'stand', stats: {},
    teleport(x: number, z: number) { Object.assign(this.position, { x, z }); },
    writeState(target: GameState['player']) { Object.assign(target, this.position); },
  };
  events.on('save:loaded', () => Object.assign(player.position, state.state.player));
  const ctx = {
    state, events, save, player, params: new URLSearchParams(),
    era: { current: 'today' }, world: { applyLook() {}, forest: { invalidate() {} } },
    audio: { bindVoiceEmitter: () => () => {} }, settings: { state: {} },
    assets: { async licences() { return { assets: [] }; } }, data: { attribution: { items: [] } },
    content: { packs: [], cases: new Map(), dialogue: new Map(), dialogueFor: () => [] },
    systems: { get() {} }, loop: { manual: true }, pause: { paused: false }, input: { wasPressed: () => false },
    ui: { layer: () => ({ classList: { remove() {} } }), hud: {}, cards: { hold() {}, soft() {} }, toast() {} },
  } as unknown as GameContext;
  const browser = { kq: {} as { story?: StoryHooks }, addEventListener() {}, removeEventListener() {}, setInterval: vi.fn(), clearInterval() {} };
  vi.stubGlobal('window', browser);
  await storySystem.init?.(ctx);
  browser.setInterval.mock.calls[0]![0]();
  const step = (count = 1) => {
    for (let step = 0; step < count; step++) {
      storySystem.update?.(1 / 60);
      player.writeState(state.mutable.player);
    }
  };
  return { state, events, save, step, player, hooks: browser.kq.story!, resume: () => events.emit('game:start', { resumed: true }) };
}

afterEach(() => {
  storySystem.dispose?.();
  vi.unstubAllGlobals();
});

describe('ending save round-trips', () => {
  it('keeps a confirmed choice saved before e1 advances and opens that scene', async () => {
    const initial = endingSave('e1', { ending: 'burn', latched: { 'b:e1': 1 } });
    initial.flags['flag.end'] = 'verbrennen';
    const game = await setup(initial);
    expect(game.save.save()).toBe(true);
    expect(game.save.load()).toBe(true);
    game.resume();
    game.step(120);
    expect(game.hooks.state()).toMatchObject({ beat: 'e2', ending: 'burn' });
    expect(showEnding.mock.calls.map(([id]) => id)).toEqual(['burn']);
  });

  it('recovers an e3 autosave from before the plateau teleport without rewinding a later position', async () => {
    const initial = endingSave('e1');
    const game = await setup(initial);
    game.resume();
    // The browser can click through the confirmed scene and epilogue without stepping in manual mode.
    chooseEnding('keep');
    goToParty('keep');
    game.step();
    expect(game.hooks.state().beat).toBe('e2');
    for (let i = 0; i < 60 && game.hooks.state().beat !== 'e3'; i++) game.step();
    expect(game.save.peek()?.systems.story?.beat).toBe('e3');
    expect(game.save.peek()?.flags['story.party.arrived']).toBeUndefined();
    expect(game.save.load()).toBe(true);
    game.step(40);
    expect(game.player.position).toMatchObject({ x: 1200, z: -1095 });
    expect(game.save.peek()?.player).toMatchObject({ x: 1200, z: -1095 });
    game.player.teleport(1170, -1099);
    game.step();
    expect(game.save.save()).toBe(true);
    expect(game.save.load()).toBe(true);
    game.step(40);
    expect(game.player.position).toMatchObject({ x: 1170, z: -1099 });
  });

  it('continues a legacy e2 replay with a matching party handoff', async () => {
    const initial = endingSave('e2', { ending: 'burn', finished: true, completed: ['enden'] });
    initial.flags = { 'flag.end': 'verbrennen', 'story.party': 'burn', 'story.credits': true };
    initial.systems.party = { variant: null, credits: 'done' };
    const game = await setup(initial);
    expect(game.save.save()).toBe(true);
    expect(game.save.load()).toBe(true);
    game.resume();
    game.step(120);
    expect(game.hooks.state()).toMatchObject({ active: true, beat: 'e3', ending: 'burn', finished: false });
    expect(showEpilogue).not.toHaveBeenCalled();
  });

  it.each([undefined, 'keep'])('reopens the e2 epilogue on load with an ambiguous handoff (%s)', async (handoff) => {
    const initial = endingSave('e2', { ending: 'burn', finished: true, completed: ['enden'] });
    initial.flags = { 'flag.end': 'verbrennen', 'story.credits': true };
    if (handoff) initial.flags['story.party'] = handoff;
    initial.systems.party = { variant: null, credits: 'done' };
    const game = await setup(initial);
    expect(game.save.save()).toBe(true);
    expect(game.save.load()).toBe(true);
    game.resume();
    game.step(120);
    expect(game.hooks.state()).toMatchObject({ beat: 'e2', ending: 'burn' });
    expect(showEpilogue).toHaveBeenCalledExactlyOnceWith('burn');
    goToParty('burn');
    game.step();
    expect(game.hooks.state().beat).toBe('e3');
  });

  it.each(['keep', null] as const)('restores an unconfirmed e1 replay even with old party variant %s', async (variant) => {
    const initial = endingSave('e1', { ending: 'keep', finished: true, completed: ['enden'] });
    initial.flags = { 'flag.end': 'behalten', 'story.party': 'keep', 'story.credits': true };
    initial.systems.party = { variant, credits: 'done' };
    const game = await setup(initial);
    expect(game.save.save()).toBe(true);
    expect(game.save.load()).toBe(true);
    game.resume();
    game.step(120);
    expect(game.hooks.state()).toMatchObject({ active: true, beat: 'e1', ending: null, finished: false });
    expect(showEnding).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(game.state.state.flags['story.party']).toBeUndefined();
  });

  it('re-establishes the Keep route after completing a repaired e1 replay', async () => {
    const initial = endingSave('e1', { ending: 'keep', finished: true, completed: ['enden'], fired: ['c:behalten-q'] });
    initial.flags = {
      'flag.end': 'behalten', 'story.party': 'keep', 'story.credits': true,
      'shift.allowed': true, 'shift.target': '1789', 'shift.x': 1059, 'shift.z': -833, 'shift.r': 30,
    };
    initial.systems.party = { variant: null, credits: 'done' };
    const game = await setup(initial);
    expect(game.save.save()).toBe(true);
    expect(game.save.load()).toBe(true);
    expect(Object.keys(game.state.state.flags).filter((flag) => flag.startsWith('shift.'))).toEqual([]);
    game.resume();
    chooseEnding('keep');
    game.step();
    goToParty('keep');
    game.step(40);
    game.events.emit('credits:done', { skipped: true });
    expect(game.save.peek()?.systems.story).toMatchObject({ beat: null, finished: true });
    expect(game.save.peek()?.flags).toMatchObject({ 'shift.allowed': true, 'shift.target': '1789' });
    expect(game.save.peek()?.flags['shift.x']).toBeUndefined();
  });

  it.each([
    { name: 'at the spring', x: 1059.3, z: -833.1, arrived: false },
    { name: 'after walking away from the party', x: 1170, z: -1099, arrived: true },
  ])('recovers a legacy e3 save $name', async ({ x, z, arrived }) => {
    const initial = endingSave('e3', { ending: 'museum', beatTime: 4 });
    initial.flags = { 'flag.end': 'museum', 'story.party': 'museum' };
    initial.systems.party = { variant: 'museum', credits: 'none' };
    Object.assign(initial.player, { x, z, yaw: 2, pitch: 0.3 });
    const game = await setup(initial);
    expect(game.save.save()).toBe(true);
    expect(game.save.load()).toBe(true);
    expect(game.state.state.flags['story.party.arrived']).toBe(arrived ? true : undefined);
    game.resume();
    game.step(40);
    if (arrived) {
      expect(game.player.position).toMatchObject({ x, z, yaw: 2, pitch: 0.3 });
    } else {
      expect(game.player.position).toMatchObject({ x: 1200, z: -1095 });
      expect(game.save.peek()?.flags['story.party.arrived']).toBe(true);
    }
  });

  it('saves free play, NPC placement, and the Keep route when credits are dismissed', async () => {
    const initial = endingSave('e3', { ending: 'keep' });
    initial.flags = { 'flag.end': 'behalten', 'story.party': 'keep', 'combat.disabled': true };
    const game = await setup(initial);
    const placed: string[] = [];
    game.events.on('npc:spawn', ({ npc }) => {
      placed.push(npc);
      // a system slice must be an object (deserializeState rejects anything else)
      game.state.mutable.systems.testPlaced = { npcs: [...placed] };
    });
    game.resume();
    game.events.emit('credits:done', { skipped: true });
    expect(game.save.load()).toBe(true);
    expect(game.state.state.systems.story).toMatchObject({ active: false, beat: null, finished: true, completed: ['enden'], objective: { id: 'end.frei' } });
    expect(game.state.state.systems.testPlaced).toMatchObject({ npcs: expect.any(Array) });
    expect((game.state.state.systems.testPlaced as { npcs: string[] }).npcs).toHaveLength(8);
    expect(game.state.state.flags).toMatchObject({ 'combat.disabled': false, 'shift.allowed': true, 'shift.target': '1789' });
  });

  it('checkpoints an old autosave taken between credits dismissal and the e3 exit', async () => {
    const initial = endingSave('e3', { ending: 'keep', finished: true });
    initial.flags = { 'flag.end': 'behalten', 'story.party': 'keep', 'story.credits': true, 'combat.disabled': true };
    initial.systems.party = { variant: 'keep', credits: 'done' };
    const game = await setup(initial);
    expect(game.save.save()).toBe(true);
    expect(game.save.load()).toBe(true);
    game.resume();
    game.step();
    expect(game.save.peek()?.systems.story).toMatchObject({ active: false, beat: null, finished: true, objective: { id: 'end.frei' } });
    expect(game.save.peek()?.flags).toMatchObject({ 'combat.disabled': false, 'shift.allowed': true });
  });

  it('starts a new ending run from chapter replay without inheriting the old party or credits', async () => {
    const initial = endingSave(null, { ending: 'keep', finished: true, completed: ['enden'] });
    initial.flags = { 'flag.end': 'behalten', 'story.party': 'keep', 'story.credits': true, 'quest.q.k1.hundenamen': 'done' };
    const game = await setup(initial);
    game.resume();
    game.hooks.goto('enden');
    game.step(60 * 20);
    expect(game.hooks.state()).toMatchObject({ active: true, beat: 'e1', ending: null, finished: false, completed: ['enden'] });
    expect(game.state.state.flags).not.toHaveProperty(['story.party']);
    expect(game.state.state.flags).not.toHaveProperty(['story.credits']);
    expect(game.state.state.flags['quest.q.k1.hundenamen']).toBe('done');
    expect(game.save.peek('ending')?.systems.story).toMatchObject({ beat: 'e1', ending: null });
  });

  it.each([true, false])('replays finale dialogue only for a fresh chapter run (%s)', async (replay) => {
    const finale = ['imhoff.end.ankunft', 'imhoff.end.museum_1', 'herzogd.fest'];
    const unrelated = 'imhoff.tour.unrelated';
    const initial = endingSave(replay ? null : 'e3', {
      ending: 'museum', finished: replay, completed: ['enden'], said: [...finale, unrelated],
    });
    initial.flags = { 'flag.end': 'museum', 'story.party': 'museum', 'story.party.arrived': true };
    const game = await setup(initial);
    const spoken: string[] = [];
    game.events.on('dialogue:say', ({ id }) => { if (id) spoken.push(id); });
    expect(game.save.save()).toBe(true);
    expect(game.save.load()).toBe(true);
    game.resume();
    if (replay) {
      game.hooks.goto('enden');
      expect(game.hooks.state().said).toEqual([unrelated]);
      chooseEnding('museum');
      game.step();
      goToParty('museum');
    }
    game.step(60 * 12);
    game.events.emit('party:spotlight', { who: 'double.herzog', i: 0 });
    game.step();
    expect(game.hooks.state().said).toEqual(expect.arrayContaining([...finale, unrelated]));
    expect(spoken.filter((id) => finale.includes(id))).toEqual(replay ? finale : []);
  });

  it('restores the free-play hint on a completed save with a missing objective', async () => {
    const initial = endingSave(null, { ending: 'keep', finished: true, completed: ['enden'] });
    initial.flags = { 'flag.end': 'behalten', 'story.party': 'keep', 'story.credits': true };
    const game = await setup(initial);
    const objectives: string[] = [];
    game.events.on('objective:set', ({ id }) => { if (id) objectives.push(id); });
    expect(game.save.save('ending')).toBe(true);
    expect(game.save.save()).toBe(true);
    expect(game.save.load()).toBe(true);
    game.resume();
    expect(game.hooks.state().objective).toMatchObject({ id: 'end.frei', text: expect.stringContaining('Ende noch einmal wählen') });
    expect(objectives).toEqual(['end.frei']);
    expect(game.hooks.state()).toMatchObject({ active: false, beat: null, finished: true });
  });

  it('does not skip the party in an old e3 replay carrying the last run’s credits flag', async () => {
    const initial = endingSave('e3', { ending: 'burn', finished: true, completed: ['enden'] });
    initial.flags = { 'flag.end': 'verbrennen', 'story.party': 'burn', 'story.credits': true };
    initial.systems.party = { variant: null, credits: 'done' };
    const game = await setup(initial);
    expect(game.save.save()).toBe(true);
    expect(game.save.load()).toBe(true);
    game.resume();
    game.step(40);
    expect(game.hooks.state()).toMatchObject({ active: true, beat: 'e3', ending: 'burn', finished: false });
    expect(game.state.state.flags).not.toHaveProperty(['story.credits']);
  });
});
