import { type Page, expect } from '@playwright/test';
import type { KqHooks } from '../../src/debug/hooks';

export async function waitForHooks(page: Page, hooks: (keyof KqHooks)[], timeout = 180_000, mode: 'step' | 'render' = 'step'): Promise<void> {
  await page.waitForFunction(({ names, mode }) => {
    const k = window.kq;
    if (!k) return false;
    if (k.ctx.loop.manual && names.some((name) => !k[name])) {
      if (mode === 'render') k.ctx.loop.renderOnce();
      else k.step(1);
    }
    if (k.ctx.params.has('notitle') && k.ctx.pause.reasons.has('title')) return false;
    return names.every((name) => !!k[name]);
  }, { names: hooks, mode }, { timeout });
}

/**
 * More presses than notices can wait: a payout or two, the toast on screen and the six queued
 * toasts (src/ui/cards.ts).
 */
const MAX_ESCAPES = 12;

/**
 * Open Pause with Escape, as a player does. In play each Escape dismisses the visible payout or
 * toast, or opens Pause when the slot is clear (docs/ACTION-RPG.md §10, src/ui/playDismissal.ts).
 * The next queued notice takes the slot CARD_GAP later on the UI clock, and under WebDriver even
 * `?manual` keeps drawing frames, so it can come up between two presses: a chapter end can leave a
 * payout and seven toasts waiting, and on a slow hosted runner their holds lapse at any moment.
 * The game handles each press before `press` resolves (also under pointer lock), so press again
 * only while Pause is still closed: one notice per press, and never a press that closes Pause.
 */
export async function openPause(page: Page): Promise<void> {
  const pause = page.getByTestId('pause-menu');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (let i = 0; i < MAX_ESCAPES && !(await pause.isVisible()); i++) await page.keyboard.press('Escape');
  await expect(pause).toBeVisible();
}
