import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SAVE_KEY, SaveManager } from '../src/core/save';
import { createInitialState, GameStateStore, STATE_VERSION } from '../src/core/state';
import { createStorySlice } from '../src/systems/story/engine';
import { TitleScreen, titleHooks } from '../src/ui/title';

const clicks = new Map<string, () => void | Promise<void>>();
const elements = new Map<string, { disabled: boolean; textContent: string; classes: Set<string> }>();

vi.mock('../src/ui/dom', () => ({
  h: (selector: string, props?: { onclick?: () => void | Promise<void>; disabled?: boolean; 'data-testid'?: string }) => {
    const classes = new Set(selector.split('.').slice(1));
    const el = {
      disabled: props?.disabled ?? false,
      textContent: '',
      classes,
      classList: {
        toggle(name: string, on: boolean) { if (on) classes.add(name); else classes.delete(name); },
        remove(...names: string[]) { for (const name of names) classes.delete(name); },
      },
      focus() {},
      contains() { return false; },
      replaceChildren() {},
    };
    const id = props?.['data-testid'];
    if (id) {
      elements.set(id, el);
      if (props?.onclick) clicks.set(id, props.onclick);
    }
    return el;
  },
}));

const stored = readFileSync(new URL('./fixtures/saves/v0.8.0.json', import.meta.url), 'utf8');
const futureSave = JSON.stringify({ ...createInitialState(), version: STATE_VERSION + 1 }, null, 2) + '\n';

function setup(enabled: boolean, raw: string | null = stored) {
  const body = {};
  vi.stubGlobal('document', { body, activeElement: body });
  const storage = new MemoryStorage();
  if (raw !== null) storage.setItem(SAVE_KEY('auto'), raw);
  const state = new GameStateStore(createInitialState());
  const events = new EventBus();
  const save = new SaveManager(state, storage, events);
  save.enabled = enabled;
  const onStart = vi.fn();
  const confirm = vi.fn(async (_text: string) => false);
  const title = new TitleScreen({ save, onStart, confirm, onLicences() {} });
  title.setReady();
  return { confirm, events, onStart, save, state, storage, title };
}

function setupReplay(enabled = true) {
  const finished = createInitialState();
  finished.systems.story = { ...createStorySlice(), ending: 'burn', finished: true };
  const game = setup(enabled, JSON.stringify(finished));
  const { save, storage, title } = game;
  storage.setItem(SAVE_KEY('ending'), JSON.stringify({ ...createInitialState(), era: '1796' }));
  const replay = vi.fn(() => save.load('ending'));
  titleHooks.extraActions = () => [{ label: 'Ende noch einmal wählen', testid: 'title-ending-again', run: replay }];
  title.setReady();
  return { ...game, replay, chooseEnding: clicks.get('title-ending-again')! };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete titleHooks.beforeNewGame;
  delete titleHooks.extraActions;
  clicks.clear();
  elements.clear();
});

describe('title actions', () => {
  it('offers Continue for a current save and loads its chapter and progress only on selection', async () => {
    const current = createInitialState();
    current.systems.story = { ...createStorySlice(), active: true, chapter: 'k2', beat: 'k2_4' };
    current.flags['test.progress'] = true;
    current.inventory.clues.push('clue.k1.wache');
    const raw = JSON.stringify(current);
    const { onStart, state, storage } = setup(true, raw);
    expect(elements.get('title-continue')!.disabled).toBe(false);
    expect(elements.get('title-continue')!.classes.has('kq-hidden')).toBe(false);
    expect(elements.get('title-save-status')!.classes.has('kq-hidden')).toBe(true);
    expect(state.state.systems.story).toBeUndefined();
    expect(storage.getItem(SAVE_KEY('auto'))).toBe(raw);

    onStart.mockImplementation(() => {
      expect(state.state.systems.story).toMatchObject({ chapter: 'k2', beat: 'k2_4' });
      expect(state.state.flags['test.progress']).toBe(true);
      expect(state.state.inventory.clues).toContain('clue.k1.wache');
    });
    await clicks.get('title-continue')!();
    expect(onStart).toHaveBeenCalledExactlyOnceWith('continue');
  });

  it('loads the autosave before Continue starts play, even after a read-only new game', async () => {
    const { events, onStart, state, storage, title } = setup(false);
    expect(elements.get('title-continue')!.disabled).toBe(false);
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
    await clicks.get('title-continue')!();
    expect(onStart.mock.calls).toEqual([['new'], ['continue']]);
    expect(storage.getItem(SAVE_KEY('auto'))).toBe(stored);
  });

  it('stays on the title when the advertised autosave disappears', async () => {
    const { onStart, storage } = setup(true);
    storage.removeItem(SAVE_KEY('auto'));
    await clicks.get('title-continue')!();
    expect(onStart).not.toHaveBeenCalled();
    expect(elements.get('title-continue')!.classes.has('kq-hidden')).toBe(true);
    expect(elements.get('title-save-status')!.classes.has('kq-hidden')).toBe(true);
  });

  it('refreshes the title when a readable autosave is replaced by a newer version', async () => {
    const { onStart, storage } = setup(true);
    storage.setItem(SAVE_KEY('auto'), futureSave);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await clicks.get('title-continue')!();
    } finally {
      warn.mockRestore();
    }
    expect(onStart).not.toHaveBeenCalled();
    expect(elements.get('title-continue')!.disabled).toBe(true);
    expect(elements.get('title-save-status')!.classes.has('kq-hidden')).toBe(false);
    expect(storage.getItem(SAVE_KEY('auto'))).toBe(futureSave);
  });

  it('keeps the state prepared by an extra title action without prompting for the advertised autosave', async () => {
    const { confirm, onStart, state, chooseEnding } = setupReplay();
    await chooseEnding();
    expect(confirm).not.toHaveBeenCalled();
    expect(onStart).toHaveBeenCalledWith('extra');
    expect(state.state.era).toBe('1796');
  });

  it.each([true, false])('rechecks a stale ending replay before loading or writing (writes enabled=%s)', async (enabled) => {
    const { confirm, onStart, save, state, storage, replay, chooseEnding } = setupReplay(enabled);
    storage.setItem(SAVE_KEY('auto'), futureSave);
    const latest = futureSave + '\n';
    confirm.mockImplementationOnce(async () => {
      storage.setItem(SAVE_KEY('auto'), latest);
      return true;
    });
    onStart.mockImplementation(() => save.autosave('start', true));

    await chooseEnding();

    if (enabled) {
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('überschrieben'));
      expect(replay).not.toHaveBeenCalled();
      expect(onStart).not.toHaveBeenCalled();
      expect(state.state.era).toBe('today');
      expect(storage.getItem(SAVE_KEY('auto'))).toBe(latest);
      expect(elements.get('title-continue')!.disabled).toBe(true);
      expect(elements.get('title-save-status')!.classes.has('kq-hidden')).toBe(false);
    } else {
      expect(confirm).not.toHaveBeenCalled();
      expect(replay).toHaveBeenCalledOnce();
      expect(onStart).toHaveBeenCalledExactlyOnceWith('extra');
      expect(state.state.era).toBe('1796');
      expect(storage.getItem(SAVE_KEY('auto'))).toBe(futureSave);
    }
  });

  it('loads the ending and autosaves after replacement is confirmed', async () => {
    const { confirm, onStart, save, state, storage, replay, chooseEnding } = setupReplay();
    storage.setItem(SAVE_KEY('auto'), futureSave);
    confirm.mockImplementationOnce(async () => {
      expect(replay).not.toHaveBeenCalled();
      expect(storage.getItem(SAVE_KEY('auto'))).toBe(futureSave);
      return true;
    });
    onStart.mockImplementation(() => save.autosave('start', true));

    await chooseEnding();

    expect(confirm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('überschrieben'));
    expect(replay).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledExactlyOnceWith('extra');
    expect(state.state.era).toBe('1796');
    expect(save.peek()?.era).toBe('1796');
  });

  it.each([[false, stored], [true, null]] as const)('opens the new-game flow directly (writes enabled=%s)', async (enabled, raw) => {
    const { confirm, onStart, save } = setup(enabled, raw);
    if (raw === null) {
      expect(save.availability()).toBe('empty');
      expect(elements.get('title-continue')!.disabled).toBe(true);
      expect(elements.get('title-save-status')!.classes.has('kq-hidden')).toBe(true);
    }
    const warning = vi.fn(async () => true);
    titleHooks.beforeNewGame = warning;
    await clicks.get('title-new')!();
    expect(confirm).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledWith('new');
  });

  it.each([
    ['malformed JSON', '{ "version":\n'],
    ['a newer version', futureSave],
    ['an occupied slot with an empty value', ''],
    ['a null story slice', '{"version":1,"systems":{"story":null}}'],
    ['null story reactions', '{"version":1,"systems":{"story":{"active":true,"chapter":"k1","beat":"k1_0","fired":null}}}'],
    ['a non-string story reaction', '{"version":1,"systems":{"story":{"fired":[null]}}}'],
    ['malformed story latches', '{"version":1,"systems":{"story":{"latched":[]}}}'],
    ['a null story meter', '{"version":1,"systems":{"story":{"meters":{"oil":null}}}}'],
    ['a malformed story objective', '{"version":1,"systems":{"story":{"objective":{"text":42}}}}'],
    ['an invalid story look', '{"version":1,"systems":{"story":{"look":null}}}'],
    ['an invalid past story look', '{"version":1,"systems":{"story":{"lookPast":{"era":"1789"}}}}'],
    ['an invalid story ending', '{"version":1,"systems":{"story":{"ending":"unknown","finished":true}}}'],
    ['an array slice', '{"version":1,"systems":{"travel":[]}}'],
    ['a scalar slice', '{"version":1,"systems":{"combat":1}}'],
    ['a malformed systems record', '{"version":1,"systems":[]}'],
  ])('protects an unreadable autosave containing %s until replacement is confirmed', async (_kind, raw) => {
    const { confirm, events, onStart, save, state, storage } = setup(true, raw);
    const warning = vi.fn(async () => true);
    titleHooks.beforeNewGame = warning;
    onStart.mockImplementation(() => save.autosave('start', true));

    const initial = state.state;
    const loaded = vi.fn();
    events.on('save:loaded', loaded);
    expect(save.availability()).toBe('unreadable');
    expect(save.peek()).toBeNull();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(save.load()).toBe(false);
    } finally {
      warn.mockRestore();
    }
    expect(state.state).toBe(initial);
    expect(loaded).not.toHaveBeenCalled();
    expect(elements.get('title-continue')!.disabled).toBe(true);
    expect(elements.get('title-continue')!.classes.has('kq-hidden')).toBe(true);
    const status = elements.get('title-save-status')!;
    expect(status.classes.has('kq-hidden')).toBe(false);
    expect(status.textContent).toMatch(/beschädigt.*neueren Spielversion/);
    expect(storage.getItem(SAVE_KEY('auto'))).toBe(raw);
    await clicks.get('title-continue')!();
    expect(onStart).not.toHaveBeenCalled();

    await clicks.get('title-new')!();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('überschrieben'));
    expect(warning).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    expect(storage.getItem(SAVE_KEY('auto'))).toBe(raw);

    confirm.mockResolvedValue(true);
    warning.mockResolvedValueOnce(false);
    await clicks.get('title-new')!();
    expect(onStart).not.toHaveBeenCalled();
    expect(storage.getItem(SAVE_KEY('auto'))).toBe(raw);

    await clicks.get('title-new')!();
    expect(onStart).toHaveBeenCalledExactlyOnceWith('new');
    expect(save.availability()).toBe('readable');
  });

  it('fills missing legacy story fields when loading a saved chapter', async () => {
    const story = { active: true, chapter: 'k1', beat: 'k1_0', said: ['past-line'] };
    const raw = JSON.stringify({ version: 1, systems: { story } });
    const { onStart, state } = setup(true, raw);
    await clicks.get('title-continue')!();
    expect(onStart).toHaveBeenCalledExactlyOnceWith('continue');
    expect(state.state.systems.story).toEqual({ ...createStorySlice(), ...story });
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

  it('keeps an autosave written during an initially empty new-game flow when replacement is declined', async () => {
    const { confirm, onStart, save, storage } = setup(true, null);
    const prepare = vi.fn();
    titleHooks.beforeNewGame = async () => {
      expect(confirm).not.toHaveBeenCalled();
      storage.setItem(SAVE_KEY('auto'), stored);
      return prepare;
    };
    onStart.mockImplementation(() => save.autosave('start', true));

    await clicks.get('title-new')!();

    expect(confirm).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('überschrieben'));
    expect(prepare).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    expect(storage.getItem(SAVE_KEY('auto'))).toBe(stored);
    expect(elements.get('title-continue')!.disabled).toBe(false);
  });

  it('offers Continue after backing out of setup when another tab saved in the meantime', async () => {
    const { confirm, onStart, state, storage } = setup(true, null);
    expect(elements.get('title-continue')!.classes.has('kq-hidden')).toBe(true);
    titleHooks.beforeNewGame = async () => {
      storage.setItem(SAVE_KEY('auto'), stored);
      return false;
    };

    await clicks.get('title-new')!();

    expect(confirm).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    expect(storage.getItem(SAVE_KEY('auto'))).toBe(stored);
    expect(elements.get('title-continue')!.classes.has('kq-hidden')).toBe(false);
    await clicks.get('title-continue')!();
    expect(onStart).toHaveBeenCalledExactlyOnceWith('continue');
    expect(state.state.systems.story?.chapter).toBe('k1');
  });

  it('reconfirms changed bytes, including a write while the late prompt is open', async () => {
    const { confirm, onStart, save, storage } = setup(true);
    const changed = stored + '\n';
    const latest = changed + ' ';
    const prepare = vi.fn();
    titleHooks.beforeNewGame = async () => {
      expect(confirm).toHaveBeenCalledTimes(1);
      storage.setItem(SAVE_KEY('auto'), changed);
      return prepare;
    };
    confirm.mockResolvedValueOnce(true).mockImplementationOnce(async () => {
      expect(storage.getItem(SAVE_KEY('auto'))).toBe(changed);
      storage.setItem(SAVE_KEY('auto'), latest);
      return true;
    }).mockImplementationOnce(async () => {
      expect(storage.getItem(SAVE_KEY('auto'))).toBe(latest);
      expect(prepare).not.toHaveBeenCalled();
      return true;
    });
    onStart.mockImplementation(() => {
      expect(prepare).toHaveBeenCalledOnce();
      save.autosave('start', true);
    });

    await clicks.get('title-new')!();

    expect(confirm).toHaveBeenCalledTimes(3);
    expect(onStart).toHaveBeenCalledExactlyOnceWith('new');
    expect(storage.getItem(SAVE_KEY('auto'))).not.toBe(latest);
  });

  it('preserves the exact autosave bytes when the confirmed new-game flow rejects', async () => {
    const { confirm, onStart, save, storage } = setup(true, futureSave);
    const failure = new Error('new-game flow failed');
    titleHooks.beforeNewGame = vi.fn().mockRejectedValue(failure);
    confirm.mockResolvedValue(true);
    onStart.mockImplementation(() => save.autosave('start', true));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await clicks.get('title-new')!();
      expect(error).toHaveBeenCalledWith('[title] new-game flow failed', failure);
    } finally {
      error.mockRestore();
    }

    expect(confirm).toHaveBeenCalledOnce();
    expect(onStart).not.toHaveBeenCalled();
    expect(storage.getItem(SAVE_KEY('auto'))).toBe(futureSave);
    expect(elements.get('title-new')!.disabled).toBe(false);
    titleHooks.beforeNewGame = async () => true;
    await clicks.get('title-new')!();
    expect(onStart).toHaveBeenCalledExactlyOnceWith('new');
  });
});
