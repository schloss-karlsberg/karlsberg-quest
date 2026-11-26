import { vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import story from '../src/systems/story';
import type { StoryFile } from '../src/systems/story/types';

vi.mock('../src/systems/story/stories', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/systems/story/stories')>(),
  loadBundledStories: () => [{
    file: 'session.story.json',
    story: {
      chapter: 'session', order: 0, title_de: 'Test', start: 'gate',
      checkpoint: { x: 300, z: 500, yaw: 0 },
      beats: [
        { id: 'gate', enter: [{ do: 'objective', text: 'Zum Tor' }], complete: { manual: true } },
        { id: 'yard', enter: [{ do: 'objective', text: 'Zum Hof' }], complete: { manual: true } },
      ],
    } satisfies StoryFile,
  }],
}));

vi.mock('../src/systems/story/dialogue/portraits', () => ({ ensurePortraitDefs: vi.fn() }));
vi.mock('../src/systems/story/objectives', () => ({
  ObjectiveView: class { set() {} frame() {} },
}));

/** Real Story runtime and event listeners, with a two-beat campaign and no rendered objective. */
export async function initStory(ctx: GameContext, element: () => unknown) {
  vi.stubGlobal('fetch', undefined);
  const layer = element() as HTMLElement;
  const storyCtx = {
    ...ctx, params: new URLSearchParams(),
    content: { packs: [], dialogueFor: () => [], dialogue: new Map(), cases: new Map() },
    audio: { ...ctx.audio, bindVoiceEmitter: () => () => {} },
    assets: { licences: async () => null },
    pause: { paused: false },
    ui: {
      ...ctx.ui, layer: () => layer,
      hud: { ...ctx.ui?.hud, stack: vi.fn(), prompt: vi.fn() },
      cards: { soft: vi.fn(), hold: vi.fn() },
    },
    world: { ...ctx.world, applyLook: vi.fn(), forest: { invalidate: vi.fn() } },
  } as unknown as GameContext;
  await story.init(storyCtx);
  return { story, layer };
}
