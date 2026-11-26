import type { Page } from '@playwright/test';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs')>(),
  mkdirSync: () => { throw new Error('checkout is read-only'); },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('imports the chapter helper in a read-only checkout', async () => {
  await expect(import('../e2e/helpers/k3')).resolves.toHaveProperty('playK3', expect.any(Function));
});

it('leaves the K3 station with a skill card still visible when chapter shots are disabled', async () => {
  const { playK3 } = await import('../e2e/helpers/k3');
  vi.stubEnv('K3_FROM', undefined);
  const reachedEhrenhof = new Error('reached the next station');
  const step = vi.fn();
  const card = vi.fn(() => ({ id: 'baumeister' }));
  vi.stubGlobal('window', {
    k3h: { settle: vi.fn() },
    kq: {
      ctx: { params: new URLSearchParams('manual&faststep'), events: { onAny() {} } },
      combat: { god() {} },
      story: { state: () => ({ chapter: 'k3', beat: 'k3_0' }) },
      state: () => ({ inventory: { clues: ['clue.k3.marlene'] } }),
      quests: { state: () => ({ quests: { 'q.k3.nachmittag': { state: 'active' } } }) },
      skills: { card },
      step,
      teleport: () => { throw reachedEhrenhof; },
    },
  });
  const page = {
    evaluate: async (fn: (arg?: unknown) => unknown, arg?: unknown) => fn(arg),
    waitForFunction: vi.fn(async (fn: () => unknown) => fn()),
    screenshot: vi.fn(),
  };

  // Stop at the first gameplay action after the shot, before simulating the rest of the chapter.
  await expect(playK3(page as unknown as Page, { shots: false })).rejects.toBe(reachedEhrenhof);
  expect(page.waitForFunction).not.toHaveBeenCalled();
  expect(page.screenshot).not.toHaveBeenCalled();
  expect(card).not.toHaveBeenCalled();
  expect(step).not.toHaveBeenCalled();
});
