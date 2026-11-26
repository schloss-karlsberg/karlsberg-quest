import { expect, test } from '@playwright/test';
import { openPause, waitForHooks } from './helpers/pause';

test.use({ reducedMotion: 'reduce' });

test('going to the title during fast travel keeps the departure autosave', async ({ page }) => {
  await page.goto('./?notitle&fresh');
  await waitForHooks(page, ['travel']);
  await openPause(page);

  const result = await page.getByRole('button', { name: 'Zum Titelbild' }).evaluate((button: HTMLButtonElement) => {
    const k = window.kq!;
    const { x, z } = k.ctx.state.state.player;
    const began = k.travel!.go('karlsbergquelle');
    const pending = k.ctx.pause.reasons.has('travel');
    let curtainAtSave: boolean | undefined;
    const stop = k.ctx.events.on('save:written', ({ reason }) => {
      if (reason === 'title') curtainAtSave = document.querySelector('[data-testid="travel-curtain"]') !== null;
    });
    // Start the journey and click in the same browser task so the arrival timer cannot win.
    button.click();
    stop();
    return { began, pending, curtainAtSave, departure: { x, z }, pauses: [...k.ctx.pause.reasons] };
  });
  expect(result).toMatchObject({ began: true, pending: true, curtainAtSave: false, pauses: ['title'] });
  await expect(page.getByTestId('title')).toBeVisible();
  await expect(page.getByTestId('travel-curtain')).toHaveCount(0);

  // Let the arrival deadline pass before checking the autosave.
  const saved = await page.evaluate(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 1200));
    return window.kq!.ctx.save.peek()?.player;
  });
  expect(saved).toMatchObject(result.departure);
});
