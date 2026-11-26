import { PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import endingChapter from '../content/story/05-enden.story.json';
import { startPlay } from '../src/boot';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SaveManager } from '../src/core/save';
import { createInitialState, deserializeState, GameStateStore } from '../src/core/state';
import story from '../src/systems/story';
import { STAGE_SECONDS_REDUCED } from '../src/systems/story/endings/stage';
import { createStorySlice } from '../src/systems/story/engine';
import type { EndingId } from '../src/systems/story/types';
import { titleHooks } from '../src/ui/title';
import { ERA_LOOKS } from '../src/world/eraPresets';

// Exercise the story runtime and ending screen in Node with a stand-in for the DOM builder.
class ElementStub extends EventTarget {
  readonly dataset: Record<string, string> = {};
  readonly style = {};
  readonly classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  constructor(readonly selector = '', readonly props: Record<string, unknown> = {}, readonly children: unknown[] = []) {
    super();
  }
  append() {}
  prepend() {}
  querySelector() { return null; }
  remove() {}
  replaceChildren() {}
}

vi.mock('../src/ui/dom', () => ({
  h: (selector: string, ...args: unknown[]) => {
    const first = args[0];
    const props = first && typeof first === 'object' && !Array.isArray(first) && !(first instanceof ElementStub)
      ? args.shift() as Record<string, unknown>
      : {};
    return new ElementStub(selector, props, args.flat());
  },
  svg: () => new ElementStub('svg'),
}));

async function boot(ending: EndingId, flags: Record<string, string> = {}, beat = 'e2') {
  const saved = createInitialState();
  saved.systems.story = { ...createStorySlice(), active: true, chapter: 'enden', beat, ending };
  saved.flags = flags;
  const state = new GameStateStore(deserializeState(JSON.stringify(saved)));
  const events = new EventBus();
  const save = new SaveManager(state, new MemoryStorage(), events);
  const modal = { el: new ElementStub(), closed: true, setBody: vi.fn<(body: ElementStub[]) => void>() };
  const open = vi.fn(() => {
    modal.closed = false;
    return { ...modal, get closed() { return modal.closed; }, close: () => { modal.closed = true; } };
  });
  const requestLock = vi.fn();
  const hooks: Pick<NonNullable<Window['kq']>, 'story'> = {};
  const ctx = {
    state,
    events,
    params: new URLSearchParams(),
    settings: { state: { reducedMotion: true } },
    assets: { licences: async () => null },
    systems: { get: () => undefined },
    content: { packs: [], cases: new Map(), dialogue: new Map(), dialogueFor: () => [] },
    era: { current: 'today' },
    world: { look: structuredClone(ERA_LOOKS.today), heightAt: () => 0, applyLook() {} },
    player: { position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, stance: 'stand', stats: { lanternLit: false, speed: 0 } },
    camera: new PerspectiveCamera(),
    loop: { manual: true },
    pause: { paused: false },
    audio: { bindVoiceEmitter: () => () => {} },
    input: { touchMode: false, requestLock, wasPressed: () => false },
    ui: {
      layer: () => new ElementStub(),
      hud: { el: new ElementStub(), stack() {}, setMarker() {}, show() {} },
      cards: { soft() {}, hold() {} },
      modals: { open, get count() { return modal.closed ? 0 : 1; } },
    },
    save,
  } as unknown as GameContext;
  vi.stubGlobal('window', { kq: hooks, addEventListener() {}, removeEventListener() {}, setInterval() {} });
  vi.stubGlobal('fetch', undefined);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  await story.init(ctx);
  return { ctx, events, state, save, modal, open, requestLock, hooks };
}

afterEach(() => {
  story.dispose();
  vi.unstubAllGlobals();
});

describe('continuing a saved epilogue', () => {
  it.each(['museum', 'burn', 'keep'] as const)('restores the %s epilogue and hands off to the party once', async (ending) => {
    const { ctx, state, modal, open, requestLock } = await boot(ending);
    startPlay(ctx, true);

    expect(open).toHaveBeenCalledTimes(1);
    expect(requestLock).not.toHaveBeenCalled();
    expect(modal.el.dataset.stage).toBe('epilogue');
    const body = modal.setBody.mock.lastCall![0];
    const [epilogue, actions] = body;
    expect(epilogue?.props['data-testid']).toBe('epilogue');
    const [plate] = epilogue!.children as ElementStub[];
    const intro = (plate!.children as ElementStub[]).find((node) => node.selector === 'p.kqs-epi-intro');
    expect(intro?.children).toEqual([endingChapter.epilogue.intro[ending]]);
    const [button] = actions!.children as ElementStub[];
    expect(button?.props['data-testid']).toBe('ending-credits');
    expect(state.state.flags['story.party']).toBeUndefined();

    const onParty = vi.fn();
    state.subscribe((s) => onParty(s.flags['story.party']));
    const click = button!.props.onclick as () => void;
    click();
    click();
    expect(modal.closed).toBe(true);
    expect(onParty.mock.calls).toEqual([[ending]]);
  });

  it.each([
    { beat: 'e2', ending: 'museum', flag: 'museum' },
    { beat: 'e3', ending: 'keep', flag: 'behalten' },
  ] as const)('continues $beat at the $ending celebration without reopening the epilogue', async ({ beat, ending, flag }) => {
    const { ctx, events, state, modal, open, requestLock } = await boot(ending, { 'story.party': ending, 'flag.end': flag }, beat);
    const onParty = vi.fn();
    events.on('story:cue', ({ id, data }) => {
      if (id === 'party:set') onParty(data);
    });

    startPlay(ctx, true);
    for (let i = 0; i < 3; i++) story.update(1 / 60);

    expect(state.state.systems.story?.beat).toBe('e3');
    expect(onParty.mock.calls).toEqual([[{ variant: ending }]]);
    expect(open).not.toHaveBeenCalled();
    expect(modal.closed).toBe(true);
    expect(requestLock).toHaveBeenCalledTimes(1);
  });

  it.each(['active', 'finished'] as const)('leaves the ending card available when the skip hook runs with the scene %s', async (scene) => {
    const { hooks, modal } = await boot('museum');
    vi.stubGlobal('document', Object.assign(new EventTarget(), { body: { appendChild() {} }, querySelector: () => null }));
    story.frame(0);
    const debugStory = hooks.story!;
    debugStory.ending('museum', true);
    expect(debugStory.stage().active).toBe(true);

    if (scene === 'finished') {
      debugStory.stageHold(STAGE_SECONDS_REDUCED);
      story.frame(0);
      expect(debugStory.stage().active).toBe(false);
    }
    debugStory.stageSkip();

    expect(debugStory.stage().active).toBe(false);
    expect(modal.el.dataset.stage).toBe('scene');
    expect(modal.setBody).toHaveBeenCalledTimes(1);
    const actions = modal.setBody.mock.lastCall![0].at(-1)!;
    const [next] = actions.children as ElementStub[];
    expect(next?.props['data-testid']).toBe('ending-next');
  });

  it('loads the separate pre-choice slot for Ende noch einmal wählen', async () => {
    const { events, state, save, open } = await boot('burn');
    save.save('auto');
    const afterChoice = state.mutable.systems.story!;
    state.mutable.systems.story = { ...afterChoice, beat: 'e1', ending: null };
    save.save('ending');
    state.mutable.systems.story = afterChoice;

    const replay = titleHooks.extraActions?.().find((action) => action.testid === 'title-ending-again');
    expect(await replay?.run()).toBe(true);
    const onBeat = vi.fn();
    events.on('story:beat', onBeat);
    events.emit('game:start', { resumed: true });
    expect(onBeat.mock.calls).toEqual([[{ chapter: 'enden', beat: 'e1' }]]);
    expect(state.state.systems.story?.ending).toBeNull();
    expect(save.peek('auto')?.systems.story?.ending).toBe('burn');
    expect(open).not.toHaveBeenCalled();
  });
});
