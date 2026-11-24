import { type Page, expect } from '@playwright/test';
import type { KqHooks } from '../../src/debug/hooks';

export async function waitForHooks(page: Page, hooks: (keyof KqHooks)[], timeout = 180_000): Promise<void> {
  await page.waitForFunction((names) => {
    const k = window.kq;
    if (!k) return false;
    if (k.ctx.loop.manual && names.some((name) => !k[name])) k.step(1);
    if (k.ctx.params.has('notitle') && k.ctx.pause.reasons.has('title')) return false;
    return names.every((name) => !!k[name]);
  }, hooks, { timeout });
}

export async function openPause(page: Page): Promise<void> {
  const pause = page.getByTestId('pause-menu');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  // In play, Escape may dismiss a HUD notice before it opens Pause.
  if (!(await pause.isVisible())) await page.keyboard.press('Escape');
  await expect(pause).toBeVisible();
}
