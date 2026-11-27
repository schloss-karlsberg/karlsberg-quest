import type { Page } from '@playwright/test';
import { afterEach, expect, it, vi } from 'vitest';
import { waitForHooks } from '../e2e/helpers/pause';

afterEach(() => vi.unstubAllGlobals());

it('can wait for hooks behind the title without advancing the saved game', async () => {
  const step = vi.fn();
  const hooks = { story: false, quests: false };
  const renderOnce = vi.fn(() => {
    if (hooks.story) hooks.quests = true;
    hooks.story = true;
  });
  vi.stubGlobal('window', {
    kq: Object.assign(hooks, {
      step,
      ctx: {
        loop: { manual: true, renderOnce },
        params: new URLSearchParams('manual'),
        pause: { reasons: new Set(['title']) },
      },
    }),
  });
  const page = {
    waitForFunction: (poll: (args: unknown) => boolean, args: unknown) => {
      expect(poll(args)).toBe(false);
      expect(poll(args)).toBe(true);
    },
  } as unknown as Page;

  await waitForHooks(page, ['story', 'quests'], undefined, 'render');

  expect(renderOnce).toHaveBeenCalledTimes(2);
  expect(step).not.toHaveBeenCalled();
});
