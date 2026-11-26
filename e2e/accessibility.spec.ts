import { type Locator, expect, test } from '@playwright/test';
import { openPause, waitForHooks } from './helpers/pause';

test.use({ reducedMotion: 'no-preference' });

async function expectVisibleFocus(control: Locator): Promise<void> {
  await expect(control).toBeFocused();
  await expect(control).toHaveCSS('outline-style', 'solid');
  await expect(control).not.toHaveCSS('outline-width', '0px');
}

async function expectNamedControls(scope: Locator): Promise<void> {
  const controls = await scope.locator('button:visible, a[href]:visible, input:visible, select:visible, textarea:visible, summary:visible, canvas[tabindex]:visible').all();
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) await expect(control).toHaveAccessibleName(/\S/);
}

test('title, settings and new-game screens follow the keyboard and the saved motion setting', async ({ page }) => {
  await page.goto('./?nosave&fresh&q=low&nowarm');
  const title = page.getByTestId('title');
  const start = page.getByTestId('title-new');
  const settings = page.getByTestId('title-settings');
  await expect(start).toBeEnabled({ timeout: 90_000 });
  await expectNamedControls(title);
  await expect(start).toBeFocused();
  await page.keyboard.press('Tab');
  await expectVisibleFocus(settings);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Einstellungen' });
  await expectNamedControls(dialog);
  await expectVisibleFocus(dialog.getByTestId('set-nav-game'));

  const access = dialog.getByTestId('set-nav-access');
  for (let tab = 0; tab < 3; tab++) await page.keyboard.press('Tab');
  await expectVisibleFocus(access);
  await page.keyboard.press('Enter');
  await expectVisibleFocus(dialog.getByRole('radio', { name: 'mittel', exact: true }));
  await page.keyboard.press('Tab');
  await expectVisibleFocus(dialog.getByTestId('set-subbg'));
  await page.keyboard.press('Tab');
  const motion = dialog.getByTestId('set-motion');
  await expectVisibleFocus(motion);
  await page.keyboard.press('Space');
  await expect(motion).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-kq-reduced-motion', '');
  await expect(page.locator('.kq-modal-layer')).toHaveCSS('animation-name', 'none');
  expect(await page.evaluate(() => window.kq!.ctx.post.uniforms.uFlashScale!.value)).toBe(0);

  await page.keyboard.press('Escape');
  await expectVisibleFocus(settings);
  await page.keyboard.press('Shift+Tab');
  await expectVisibleFocus(start);
  await page.keyboard.press('Enter');
  const accept = page.getByTestId('warning-accept');
  await expectVisibleFocus(accept);
  await page.keyboard.press('Tab');
  await expectVisibleFocus(page.getByTestId('warning-gentle'));
  await page.keyboard.press('Shift+Tab');
  await expectVisibleFocus(accept);
  await page.keyboard.press('Enter');
  const name = page.getByTestId('player-name');
  await expectVisibleFocus(name);
  await expect(name).toHaveAccessibleName(/Name/);
  await page.keyboard.press('Escape');
  await expectVisibleFocus(start);
});

test('pause and journal restore focus after opening pages and changing a filter', async ({ page }) => {
  await page.goto('./?notitle&nosave&fresh&manual&q=low&nowarm');
  await waitForHooks(page, []);
  await openPause(page);
  const pause = page.getByRole('dialog', { name: 'Pause' });
  await expectNamedControls(pause);
  const resume = pause.getByTestId('resume');
  await expectVisibleFocus(resume);
  await page.keyboard.press('Shift+Tab');
  await expectVisibleFocus(pause.getByRole('button', { name: 'Schließen', exact: true }));
  await page.keyboard.press('Tab');
  await expectVisibleFocus(resume);

  const settings = pause.getByTestId('pause-settings');
  await settings.press('Enter');
  let dialog = page.getByRole('dialog', { name: 'Einstellungen' });
  await expectVisibleFocus(dialog.getByTestId('set-nav-game'));
  await dialog.getByTestId('bindings').locator('summary').press('Enter');
  const bind = dialog.getByTestId('bind-forward');
  await bind.press('Enter');
  await expect(bind).toHaveAccessibleName(/Taste drücken/);
  await page.keyboard.press('Escape');
  await expectVisibleFocus(bind);
  await dialog.getByRole('button', { name: 'Zurück', exact: true }).press('Enter');
  await expectVisibleFocus(settings);

  const opener = pause.getByTestId('pause-codex');
  await opener.press('Enter');
  dialog = page.getByRole('dialog', { name: 'Codex' });
  await expectNamedControls(dialog);
  await expectVisibleFocus(dialog.getByTestId('codex-filter-all'));
  await page.keyboard.press('Tab');
  const filter = dialog.getByTestId('codex-filter-new');
  await expectVisibleFocus(filter);
  await page.keyboard.press('Enter');
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  await expectVisibleFocus(filter);
  await page.keyboard.press('Escape');
  await expectVisibleFocus(opener);
});
