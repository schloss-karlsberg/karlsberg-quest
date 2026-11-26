import { afterEach, describe, expect, it, vi } from 'vitest';
import endingChapter from '../content/story/05-enden.story.json';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SaveManager } from '../src/core/save';
import { createInitialState, deserializeState, GameStateStore } from '../src/core/state';
import story from '../src/systems/story';
import { createStorySlice } from '../src/systems/story/engine';
import type { EndingId } from '../src/systems/story/types';
import { titleHooks } from '../src/ui/title';

// Exercise the story runtime and ending screen in Node with a stand-in for the DOM builder.
class ElementStub extends EventTarget {
  readonly dataset: Record<string, string> = {};
  readonly style = {};
  readonly classList = { add() {}, remove() {} };
  constructor(readonly selector = '', readonly props: Record<string, unknown> = {}, readonly children: unknown[] = []) {
    super();
  }
  append() {}
  prepend() {}
  querySelector() { return null; }
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
  const modal = { el: new ElementStub(), closed: false, setBody: vi.fn<(body: ElementStub[]) => void>() };
  const open = vi.fn(() => {
    modal.closed = false;
    return { ...modal, get closed() { return modal.closed; }, close: () => { modal.closed = true; } };
  });
  const ctx = {
    state,
    events,
    params: new URLSearchParams(),
    assets: { licences: async () => null },
    systems: { get: () => undefined },
    content: { packs: [], cases: new Map(), dialogue: new Map(), dialogueFor: () => [] },
    era: { current: 'today' },
    world: { applyLook() {} },
    audio: { bindVoiceEmitter: () => () => {} },
    input: { touchMode: false },
    ui: { layer: () => new ElementStub(), hud: { stack() {}, setMarker() {} }, modals: { open } },
    save,
  } as unknown as GameContext;
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {}, setInterval() {} });
  vi.stubGlobal('fetch', undefined);
  await story.init(ctx);
  return { events, state, save, modal, open };
}

afterEach(() => {
  story.dispose();
  vi.unstubAllGlobals();
});

describe('continuing a saved epilogue', () => {
  it.each(['museum', 'burn', 'keep'] as const)('restores the %s epilogue and hands off to the party once', async (ending) => {
    const { events, state, modal, open } = await boot(ending);
    events.emit('game:start', { resumed: true });

    expect(open).toHaveBeenCalledTimes(1);
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

  it('leaves an e2 save with a pending party handoff ready to advance', async () => {
    const { events, open } = await boot('museum', { 'story.party': 'museum' });
    events.emit('game:start', { resumed: true });
    expect(open).not.toHaveBeenCalled();
  });

  it('leaves an e3 save at the party', async () => {
    const { events, open } = await boot('keep', { 'story.party': 'keep' }, 'e3');
    events.emit('game:start', { resumed: true });
    expect(open).not.toHaveBeenCalled();
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
