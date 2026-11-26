import { vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import story from '../src/systems/story';

/**
 * Real Story runtime and event listeners. The calling test file mocks the bundled stories, the
 * portraits and the objective view (vi.mock is hoisted only in test files): see
 * tests/hunt-session.test.ts.
 */
export async function initStory(ctx: GameContext, element: () => unknown) {
  vi.stubGlobal('fetch', undefined);
  const layer = element() as HTMLElement;
  const storyCtx = {
    ...ctx, params: new URLSearchParams(),
    content: { packs: [], dialogueFor: () => [], dialogue: new Map(), cases: new Map() },
    audio: { ...ctx.audio, bindVoiceEmitter: () => () => {} },
    assets: { licences: async () => null },
    pause: { paused: false },
    input: { ...ctx.input, isDown: () => false },
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
