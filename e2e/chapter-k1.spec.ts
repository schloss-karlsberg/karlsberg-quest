import { expect, test } from '@playwright/test';
import { trackErrors } from './helpers/common';
import { boot, inv, playK1, shiftToPast, shot, story, upd } from './helpers/k1';

/**
 * Chapter 1 "Der Hof", played through headless (`?manual`, driven through window.kq). The
 * playthrough lives in e2e/helpers/k1.ts (shared with e2e/campaign.spec.ts); this spec boots the
 * chapter directly with what the prologue leaves behind.
 * A second test: the lantern running dry in Teil A and being caught in Teil B lose nothing.
 * Screenshots: test-results/screens/ch-k1-*.png.
 */
test('chapter 1 "Der Hof": the whole chapter, both parts', async ({ page }) => {
  test.setTimeout(3_000_000);
  const errors = trackErrors(page);
  await boot(page);
  await playK1(page);
  expect(errors).toEqual([]);
});


test('chapter 1: an empty lantern (Teil A) and the pack (Teil B) cost nothing', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    window.kq!.story!.goto('k1', 'k1_3');
    window.kq!.step(4);
  });
  // Teil A: the lantern runs dry in 1789 → curtain → the station, same beat, the way back is shown
  await page.evaluate(() => {
    window.kq!.teleport(1224, -1117, 80, 0);
    window.kq!.step(2);
  });
  await shiftToPast(page);
  await page.evaluate(() => {
    window.kq!.chronik!.examine('clue.k1.zeichen');
    window.kq!.ctx.ui.modals.closeAll();
    window.kq!.lantern!.setOil(0.002);
  });
  await upd(page, 120);
  await expect(page.getByTestId('story-curtain')).toBeVisible();
  await upd(page, 400);
  let s = await story(page);
  expect(s).toMatchObject({ era: 'today', beat: 'k1_3' });
  expect(s.objective?.id).toBe('k1.zurueck-a');
  expect((await inv(page)).clues).toContain('clue.k1.zeichen');
  await shot(page, 'x1-oel-leer');

  // Teil B: caught by the patrol → "heimgebracht", finds kept, the way back to the Karlslust
  await page.evaluate(() => {
    // through k1_7 (Teil B's flags: the lossless lantern), then on to the night beat
    window.kq!.story!.goto('k1', 'k1_7');
    window.kq!.step(4);
    window.kq!.story!.goto('k1', 'k1_11');
    window.kq!.step(10);
    window.kq!.teleport(1822, 70, 175, 0);
    window.kq!.step(2);
  });
  await shiftToPast(page);
  await upd(page, 400);
  expect(await page.evaluate(() => window.kq!.hunt!.state()?.mode)).toBe('patrol');
  await page.evaluate(() => window.kq!.chronik!.caught());
  await upd(page, 60);
  await expect(page.getByTestId('story-curtain')).toContainText('heimgebracht');
  await upd(page, 400);
  s = await story(page);
  expect(s).toMatchObject({ era: 'today', beat: 'k1_11' });
  expect(s.objective?.id).toBe('k1.zurueck-b');
  expect((await inv(page)).clues).toContain('clue.k1.zeichen');
  // no pack in the present; it comes back with the next Wechsel
  expect(await page.evaluate(() => window.kq!.hunt!.state())).toBeNull();
  await page.evaluate(() => {
    window.kq!.teleport(1822, 70, 175, 0);
    window.kq!.step(2);
  });
  await shiftToPast(page);
  await upd(page, 300);
  expect(await page.evaluate(() => window.kq!.hunt!.state()?.mode)).toBe('patrol');
  expect(errors).toEqual([]);
});
