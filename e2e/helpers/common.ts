import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';

/**
 * Shared glue for the chapter playthroughs (e2e/helpers/<chapter>.ts). Each chapter spec boots
 * its chapter directly and calls its play function; e2e/campaign.spec.ts chains all of them from
 * a new game on the title screen.
 */
export const SCREENS = 'test-results/screens';
mkdirSync(SCREENS, { recursive: true });

export const IGNORED = [/GPU stall/i, /pointer ?lock/i, /WebGL.*(performance|ReadPixels)/i, /AudioContext was not allowed/i];

export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.some((r) => r.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    if (!IGNORED.some((r) => r.test(e.message))) errors.push(`pageerror: ${e.message}`);
  });
  return errors;
}

export interface PlayOptions {
  /** Take the chapter's own screenshots (ch-<chapter>-*.png). Default true. */
  shots?: boolean;
  /**
   * Called at named moments of a playthrough (e.g. 'k1:teil-a-done', 'ending:choice'). The
   * campaign uses it for its own screenshots and for the save / reload / continue check; after
   * the hook the play function re-installs its in-page helpers if a reload removed them.
   */
  at?: (label: string) => Promise<void>;
}

/**
 * After the epilogue's `ending-credits` button (bible 06-enden §8): beat e3 builds the party,
 * Gerold speaks, the credits strip rolls. Steps game time until the strip runs, then skips it (the
 * story turns `credits:done` into `story.credits`). Resolves once the story is finished.
 */
export async function throughParty(page: Page): Promise<void> {
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 90 && k.party?.state().credits !== 'playing'; i++) k.step(60);
  });
  await page.locator('[data-testid="party-credits"]').waitFor({ state: 'visible', timeout: 10_000 });
  await page.evaluate(() => {
    window.kq!.party!.skip();
    window.kq!.step(30);
  });
  await page.waitForFunction(() => window.kq!.story!.state().finished === true, undefined, { timeout: 10_000 });
}
