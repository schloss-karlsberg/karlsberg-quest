import { expect, test } from '@playwright/test';
import { trackErrors } from './helpers/common';
import { beat, newGame, playProlog, qn, qs, said, shiftTo, shot, story, until } from './helpers/prolog';

/**
 * Chapter spec: the whole prologue ("Vermessung") as a quest chain (docs/ACTION-RPG.md §11.0),
 * played headless through window.kq from the title screen to the chapter-1 title card (the
 * playthrough itself lives in e2e/helpers/prolog.ts, shared with e2e/campaign.spec.ts).
 *
 * A second test plays the bad branch: the pack catches you in 1789 → curtain, Laub explains
 * gently, home at the Quelle; nothing is lost (the quest keeps its progress), the anchor waits.
 *
 * Screenshots: test-results/screens/ch-prolog-*.png, cna-p-*.png
 */
test.describe.configure({ timeout: 2_400_000 }); // software WebGL, a whole chapter: slow on a busy machine

test('prolog: the whole chapter as quests, title screen to "Der Hof"', async ({ page }) => {
  const errors = trackErrors(page);
  await newGame(page, 'Mara', true);
  await playProlog(page);
  expect(errors).toEqual([]);
});

test('prolog: the pack catches you in 1789: gently explained, nothing lost, the Ehrenhof waits', async ({ page }) => {
  const errors = trackErrors(page);
  await newGame(page, 'Alex');
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('prolog', 'p7');
    k.ctx.ui.modals.closeAll();
    k.step(4);
  });
  expect(await qs(page, 'q.p.punktwolke')).toBe('active');
  expect(await until(page, 'p9', 150)).toBe('p9');
  expect(await qn(page, 'q.p.punktwolke', 'wolke')).toBe(1);
  // fairness: Q only works at the anchor
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1150, -1118, 90, 4);
    k.step(4);
    k.press('KeyQ', 1);
    k.step(4);
  });
  expect((await story(page)).era).toBe('today');
  await shiftTo(page, 1205, -1119, 90);
  expect(await beat(page)).toBe('p9b');
  // caught by the pack → the curtain, home at the Quelle, the checkpoint p9
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1216, -1180, 180);
    k.step(2);
    k.story!.caught('pack', 6000);
  });
  await expect(page.getByTestId('story-curtain')).toHaveClass(/kqs-down/);
  await expect(page.getByTestId('story-curtain')).toContainText('gestellt');
  await page.waitForTimeout(900);
  await shot(page, '31-caught');
  await page.evaluate(() => window.kq!.step(6 * 60 + 10));
  await page.waitForTimeout(2600);
  const s = await story(page);
  expect(s.era).toBe('today');
  expect(s.beat).toBe('p9');
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 60 && !(k.story!.state().said as string[]).includes('laub.p.gestellt'); i++) k.step(15);
    for (let i = 0; i < 900 && k.story!.state().dialogue?.speaker !== 'laub'; i++) k.step(10);
    k.story!.finishTyping();
    k.teleport(1053, -828, 51, -3);
  });
  await shot(page, '32-laub-explains');
  expect(await said(page)).toContain('laub.p.gestellt');
  await expect(page.getByTestId('dialogue')).not.toContainText('bestätigt');
  // nothing lost: the quest still runs with what was done
  expect(await qs(page, 'q.p.punktwolke')).toBe('active');
  expect(await qn(page, 'q.p.punktwolke', 'wolke')).toBe(1);
  expect(await qn(page, 'q.p.punktwolke', 'wechsel')).toBe(1);
  // and the way back is the same: the Ehrenhof, Q
  await shiftTo(page, 1205, -1119, 90);
  expect(await beat(page)).toBe('p9b');
  expect(errors).toEqual([]);
});
