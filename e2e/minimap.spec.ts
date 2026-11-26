import { expect, test } from '@playwright/test';
import { openPause, waitForHooks } from './helpers/pause';

const PLAY = './?notitle&nosave&fresh&manual';

test('minimap hides in other views and remembers the German setting', async ({ page }) => {
  await page.goto(PLAY);
  await waitForHooks(page, ['travel', 'photo']);
  const minimap = page.getByTestId('minimap');
  await expect(minimap).toBeVisible();
  await expect(minimap).toHaveAccessibleName('Minikarte');

  await page.evaluate(() => window.kq!.travel!.map(true));
  await expect(page.getByTestId('travel-map')).toBeVisible();
  await expect(minimap).toBeHidden();
  await page.evaluate(() => window.kq!.travel!.map(false));
  await expect(minimap).toBeVisible();

  expect(await page.evaluate(() => window.kq!.photo!.open())).toBe(true);
  await expect(minimap).toBeHidden();
  await page.evaluate(() => window.kq!.photo!.close());
  await expect(minimap).toBeVisible();

  await openPause(page);
  await expect(minimap).toBeHidden();
  await page.getByTestId('pause-settings').click();
  const toggle = page.getByRole('checkbox', { name: 'Minikarte' });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
  await expect(minimap).toBeHidden();
  await page.reload();
  await waitForHooks(page, ['travel']);
  await expect(minimap).toHaveCount(1);
  await expect(minimap).toBeHidden();
});

test.describe('small landscape phone', () => {
  test.use({ viewport: { width: 667, height: 375 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  test('minimap fits beside the controls and dialogue inside the safe area', async ({ page }) => {
    await page.goto(PLAY);
    await waitForHooks(page, ['story']);
    await page.addStyleTag({ content: ':root { --kq-safe-t: 0px; --kq-safe-r: 47px; --kq-safe-b: 21px; --kq-safe-l: 47px; }' });
    await expect(page.getByTestId('touch')).toBeVisible();
    const minimap = page.getByTestId('minimap');
    await expect(minimap).toBeVisible();
    await page.evaluate(() => {
      const k = window.kq!;
      k.story!.say('laub', 'Wir treffen uns an der Quelle. Bleib auf dem Weg und geh den Hang hinunter.');
      k.step();
    });
    const dialogue = page.getByTestId('dialogue');
    await expect(dialogue).toHaveClass(/kqs-show/);
    const box = (await minimap.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(80);
    expect(box.x).toBeGreaterThanOrEqual(47);
    expect(box.x + box.width).toBeLessThanOrEqual(667 - 47);
    for (const target of [dialogue, ...await page.locator('.kq-t-btn:visible').all()]) {
      const other = await target.boundingBox();
      if (!other) continue;
      const overlaps = box.x < other.x + other.width && box.x + box.width > other.x &&
        box.y < other.y + other.height && box.y + box.height > other.y;
      expect(overlaps, `minimap overlaps ${await target.getAttribute('data-testid')}`).toBe(false);
    }
  });
});
