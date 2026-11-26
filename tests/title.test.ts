import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SAVE_KEY, SaveManager } from '../src/core/save';
import { createInitialState, GameStateStore } from '../src/core/state';
import { createStorySlice } from '../src/systems/story/engine';
import { TitleScreen, titleHooks } from '../src/ui/title';

const clicks = new Map<string, () => void | Promise<void>>();

vi.mock('../src/ui/dom', () => ({
  h: (_sel: string, props?: { onclick?: () => void | Promise<void>; 'data-testid'?: string }) => {
    if (props?.onclick && props['data-testid']) clicks.set(props['data-testid'], props.onclick);
    return { classList: { toggle() {}, remove() {} }, focus() {}, replaceChildren() {} };
  },
}));

const stored = readFileSync(new URL('./fixtures/saves/v0.8.0.json', import.meta.url), 'utf8');

function setup(enabled: boolean, hasSave = true) {
  const storage = new MemoryStorage();
  if (hasSave) storage.setItem(SAVE_KEY('auto'), stored);
  const state = new GameStateStore(createInitialState());
  const events = new EventBus();
  const save = new SaveManager(state, storage, events);
  save.enabled = enabled;
  const onStart = vi.fn();
  const confirm = vi.fn(async (_text: string) => false);
  const title = new TitleScreen({ save, onStart, confirm, onLicences() {} });
  title.setReady(save.has());
  return { confirm, events, onStart, save, state, storage, title };
}

afterEach(() => {
  delete titleHooks.beforeNewGame;
  delete titleHooks.extraActions;
  clicks.clear();
});

describe('title actions', () => {
  it('loads the autosave before Continue starts play, even after a read-only new game', async () => {
    const { events, onStart, save, state, storage, title } = setup(false);
    let loadedSlot: string | undefined;
    events.on('save:loaded', ({ slot }) => { loadedSlot = slot; });
    onStart.mockImplementation((mode) => {
      if (mode === 'new') state.mutable.systems.story = { ...createStorySlice(), active: true, chapter: 'tour', beat: 't1' };
      else {
        expect(loadedSlot).toBe('auto');
        expect(state.state.systems.story).toMatchObject({ chapter: 'k1', beat: 'k1_0' });
      }
    });
    await clicks.get('title-new')!();
    expect(state.state.systems.story?.chapter).toBe('tour');
    title.show();
    title.setReady(save.has());
    await clicks.get('title-continue')!();
    expect(onStart.mock.calls).toEqual([['new'], ['continue']]);
    expect(storage.getItem(SAVE_KEY('auto'))).toBe(stored);
  });

  it('stays on the title when the advertised autosave disappears', async () => {
    const { onStart, storage } = setup(true);
    storage.removeItem(SAVE_KEY('auto'));
    await clicks.get('title-continue')!();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('keeps the state prepared by an extra title action', async () => {
    const { onStart, save, state, title } = setup(true);
    state.mutable.era = '1796';
    save.save('ending');
    state.mutable.era = 'today';
    titleHooks.extraActions = () => [{ label: 'Ende noch einmal wählen', testid: 'title-ending-again', run: () => save.load('ending') }];
    title.setReady(true);
    await clicks.get('title-ending-again')!();
    expect(onStart).toHaveBeenCalledWith('extra');
    expect(state.state.era).toBe('1796');
  });

  it.each([[false, true], [true, false]])('opens the new-game flow directly (writes enabled=%s, has save=%s)', async (enabled, hasSave) => {
    const { confirm, onStart } = setup(enabled, hasSave);
    const warning = vi.fn(async () => true);
    titleHooks.beforeNewGame = warning;
    await clicks.get('title-new')!();
    expect(confirm).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledWith('new');
  });

  it('requires confirmation before opening the new-game flow over a writable save', async () => {
    const { confirm, onStart } = setup(true);
    const warning = vi.fn(async () => true);
    titleHooks.beforeNewGame = warning;
    await clicks.get('title-new')!();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('überschrieben'));
    expect(warning).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();

    confirm.mockResolvedValueOnce(true);
    await clicks.get('title-new')!();
    expect(warning).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledWith('new');
  });
});
