import type { Page } from '@playwright/test';

type CardTarget = { selector: string; state: 'present' | 'absent' } | 'skills idle';

/** Fixed updates age skill and level cards. An explicit presentation frame ages the shared
 * slot's gap and soft holds. Return to the browser between batches so input and DOM callbacks run. */
async function advanceTo(page: Page, target: CardTarget): Promise<void> {
  const batch = 15;
  const budget = 60 * 30; // chapter title, dialogue hold and a multi-unlock card
  for (let ticks = 0; ticks <= budget; ticks += batch) {
    const reached = await page.evaluate(({ target, steps }) => {
      const { loop, pause } = window.kq!.ctx;
      for (let i = 0; i < steps && !pause.paused; i++) loop.advance(1);
      if (steps) loop.renderOnce(steps * loop.dt);
      if (target === 'skills idle') return !window.kq!.skills!.cardsBusy();
      return !!document.querySelector(target.selector) === (target.state === 'present');
    }, { target, steps: ticks ? batch : 0 });
    if (reached) return;
  }
  const blocking = await page.evaluate(() => {
    const { ui, pause } = window.kq!.ctx;
    return { slot: ui.cards.showing, holds: ui.cards.holdReasons(), pause: [...pause.reasons] };
  });
  throw new Error(`Expected ${JSON.stringify(target)} within ${budget} ticks. ${JSON.stringify(blocking)}`);
}

export function stepToCard(page: Page, selector: string, state: 'present' | 'absent'): Promise<void> {
  return advanceTo(page, { selector, state });
}

export function stepPastSkillCards(page: Page): Promise<void> {
  return advanceTo(page, 'skills idle');
}
