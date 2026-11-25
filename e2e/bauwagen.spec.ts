import { devices, expect, test } from '@playwright/test';
import { trackErrors } from './helpers/common';

const { defaultBrowserType: _browser, ...phone } = devices['iPhone 13 landscape'];
test.use({ ...phone, reducedMotion: 'reduce' });

test('the hidden Bauwagen is a local Codex discovery on a Niedrig touch profile', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./?notitle&fresh&manual&q=low&x=760&z=-899');
  await expect(page.getByTestId('touch')).toBeVisible();
  const interact = page.getByTestId('touch-interact');
  const prompt = 'Zettel am Bauwagen untersuchen';
  const guide = () => page.evaluate(() => {
    const k = window.kq!;
    return { lead: k.quests!.lead(), tracked: k.quests!.tracked(), goal: k.travel!.state().goal };
  });

  const onPath = await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.settings.update((s) => { s.reducedMotion = true; }, 'reducedMotion');
    k.step(3);
    return { quality: k.ctx.quality.level, built: k.scenery!.built() };
  });
  expect(onPath.quality).toBe('low');
  expect(onPath.built).toContain('bauwagen');
  await expect(interact).not.toContainText(prompt);

  const atDoor = await page.evaluate(() => {
    const k = window.kq!;
    k.setEra('1789');
    k.teleport(760.6, -911, 0);
    k.step(3);
    return k.scenery!.built();
  });
  expect(atDoor).not.toContain('bauwagen');
  await expect(interact).not.toContainText(prompt);

  await page.evaluate(() => {
    const k = window.kq!;
    k.setEra('today');
    k.teleport(760.6, -911, 0);
    k.step(3);
  });
  const before = await guide();
  await expect(interact).toContainText(prompt);
  await interact.tap();
  await page.evaluate(() => window.kq!.step(3));
  await expect(page.getByTestId('quest-feed')).toContainText('Neu im Codex: Die letzte Messung');
  await expect(interact).not.toContainText(prompt);
  expect(await guide()).toEqual(before);
  expect(await page.evaluate(() => window.kq!.ctx.save.peek()?.codex.facts)).toContain('cx.48');

  await page.getByTestId('touch-pause').tap();
  await page.getByTestId('pause-codex').tap();
  const card = page.getByTestId('codex-card-cx.48');
  await expect(card).toContainText('Die letzte Messung');
  await expect(card).toContainText('Fiktion');
  expect(errors).toEqual([]);
});
