import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBundledContent } from '../src/content/db';
import type { GameContext } from '../src/core/context';
import type { Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SaveManager } from '../src/core/save';
import { createInitialState, GameStateStore } from '../src/core/state';
import type { KqHooks } from '../src/debug/hooks';
import storySystem from '../src/systems/story';
import { createStorySlice } from '../src/systems/story/engine';

const night = '1793-02';
const noop = () => {};

class TestElement extends EventTarget {
  readonly dataset = {};
  readonly style = {};
  readonly classList = { add: noop, remove: noop, toggle: noop };
  get content() { return { firstElementChild: new TestElement() }; }
  appendChild() {}
  append() {}
  prepend() {}
  replaceChildren() {}
  setAttribute() {}
  removeAttribute() {}
  querySelector() { return null; }
  remove() {}
}

let hooks: Pick<KqHooks, 'story'>;

beforeEach(() => {
  vi.useFakeTimers();
  hooks = {};
  vi.stubGlobal('Node', TestElement);
  vi.stubGlobal('document', {
    body: new TestElement(),
    createElement: () => new TestElement(),
    createTextNode: () => new TestElement(),
  });
  vi.stubGlobal('window', Object.assign(new EventTarget(), { kq: hooks, setInterval, clearInterval, setTimeout, clearTimeout }));
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => run());
  vi.stubGlobal('fetch', undefined);
});

afterEach(() => {
  storySystem.dispose();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** The real story runtime in Chapter 2's hunt beat, with a stand-in hunt system that spawns the pack. */
async function setup() {
  const state = new GameStateStore(createInitialState());
  const initial = state.mutable;
  initial.era = night;
  initial.systems.story = { ...createStorySlice(), active: true, chapter: 'k2', beat: 'k2_10', said: ['marlene.k2.morgen'] };
  initial.systems.hunt = { pack: null } as unknown as NonNullable<typeof initial.systems.hunt>;
  const events = new EventBus();
  let clock = 0;
  const save = new SaveManager(state, new MemoryStorage(), events, () => 1_700_000_000_000 + clock, () => clock);
  const packSpawned = vi.fn();
  events.on('threat:configure', (config) => {
    if (config.kind !== 'pack' || !config.active) return;
    state.mutable.systems.hunt!.pack = { era: state.state.era, opts: { mode: config.mode } };
    packSpawned(state.state.era);
  });
  const ctx = {
    state, save, events, content: loadBundledContent(), params: new URLSearchParams(),
    era: { get current() { return state.state.era; } },
    player: { position: { x: 1222, y: 0, z: -1118 }, stance: 'stand', stats: { lanternLit: true, speed: 0 } },
    settings: { state: { reducedMotion: true } },
    audio: { ctx: null, bus: () => null, bindVoiceEmitter: () => noop, createSource3D: () => null },
    world: { applyLook: noop, mapMix: 0, scanMode: 0 },
    assets: { licences: async () => null },
    systems: { get: () => undefined },
    input: { enabled: true, touchMode: false, wasPressed: () => false, wasCancelled: () => false, isDown: () => false },
    pause: { paused: false, reasons: new Set<string>() },
    loop: { manual: true },
    ui: {
      toast: noop, layer: () => new TestElement(), modals: { count: 0 },
      hud: { stack: noop, acting: () => false, setEraLabel: noop, setMarker: noop, subtitle: noop, prompt: noop, busy: noop },
      cards: { hold: noop, soft: noop },
    },
  } as unknown as GameContext;
  await storySystem.init(ctx);
  vi.advanceTimersByTime(25);
  const story = hooks.story!;
  const start = () => events.emit('game:start', { resumed: true });
  start();
  const step = (seconds = 1 / 60) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      clock += 1000 / 60;
      storySystem.update(1 / 60);
    }
  };
  const changeEra = (to: Era) => {
    const from = state.state.era;
    events.emit('shift:begin', { from, to });
    state.mutable.era = to;
    events.emit('era:change', { from, to });
    events.emit('shift:done', { from, to });
  };
  return { state, save, events, story, start, step, changeEra, packSpawned };
}

describe('Chapter 2 story runtime: the parforce hunt', () => {
  it('restarts the horn after title Continue drops its scheduled spawn', async () => {
    const { state, save, story, start, step, events, packSpawned } = await setup();
    step(3);
    expect(state.state.flags['k2.jagd_laeuft']).toBe(true);
    expect(story.shown()).toContain('jost.k2.04');
    expect(packSpawned).not.toHaveBeenCalled();
    const liveState = state.mutable;
    save.autosave('title', true);
    start();
    expect(state.mutable).toBe(liveState);
    expect(state.state.flags['k2.jagd_laeuft']).toBeUndefined();
    step();
    expect(state.state.flags['k2.wieder_da']).toBe(true);
    events.emit('npc:conversation', { npc: 'jost', open: false });
    step(35);
    expect(packSpawned).toHaveBeenCalledOnce();
    expect(state.state.systems.hunt?.pack?.opts.mode).toBe('parforce');
    events.emit('hunt:goal', { mode: 'parforce', x: 819, z: -875 });
    step();
    expect(story.state().beat).toBe('k2_11');
  });

  it('keeps the running pack when continuing from the title', async () => {
    const { state, save, start, step, packSpawned } = await setup();
    step(35);
    expect(packSpawned).toHaveBeenCalledOnce();
    const pack = state.state.systems.hunt?.pack;
    save.autosave('title', true);
    start();
    step(35);
    expect(state.state.flags['k2.jagd_laeuft']).toBe(true);
    expect(state.state.systems.hunt?.pack).toBe(pack);
    expect(packSpawned).toHaveBeenCalledOnce();
  });

  it('does not set the pack loose in the present when the player shifts during Jost’s lead-in', async () => {
    const { state, step, changeEra, packSpawned } = await setup();
    step(3);
    expect(state.state.flags['k2.jagd_laeuft']).toBe(true);
    changeEra('today');
    step(35);
    expect(packSpawned).not.toHaveBeenCalled();

    // back at the Ehrenhof: Hanne and Jost wait, and the horn sounds once the wait is over
    changeEra(night);
    step();
    expect(state.state.flags['k2.wieder_da']).toBe(true);
    step(40);
    expect(packSpawned).toHaveBeenCalledExactlyOnceWith(night);
  });
});
