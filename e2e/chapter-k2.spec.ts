import { expect, test } from '@playwright/test';
import { trackErrors } from './helpers/common';
import { boot, clues, payloads, playK2, shiftAt, story } from './helpers/k2';

/**
 * Chapter 2 "Die Flucht" (content/story/02-kapitel-2.story.json, bible 03-kapitel-2), played
 * headless through window.kq with the real content packs. The playthrough lives in
 * e2e/helpers/k2.ts (shared with e2e/campaign.spec.ts).
 *
 * A second test: caught by the hunt → the station, the finds since the last confirmation are
 * gone, anchor B leads straight back and the horn sounds again.
 *
 * Screenshots: test-results/screens/ch-k2-*.png.
 */
test('chapter 2: Die Flucht, played through', async ({ page }) => {
  test.setTimeout(2_700_000); // headless software GL: the 1280×720 pictures take a while
  const errors = trackErrors(page);
  await boot(page);
  await playK2(page);
  expect(errors).toEqual([]);
});


test('chapter 2: caught in the hunt → home, finds lost, anchor B back into the hunt', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('k2', 'k2_10');
    k.step(4);
    // as if played: the Wachbuch read (unconfirmed) → anchor B free
    k.chronik!.examine('clue.k2.wachbuch');
    k.ctx.ui.modals.closeAll();
    k.step(10);
  });
  expect(await page.evaluate(() => window.kq!.state().flags['k2.anker_b'])).toBe(true);
  await shiftAt(page, 1222, -1118, 270);
  expect((await story(page)).era).toBe('1793-02');
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 160 && !k.hunt!.state(); i++) {
      k.step(15);
      k.story!.finishTyping();
    }
  });
  expect(await page.evaluate(() => window.kq!.hunt!.mode()?.mode)).toBe('parforce');
  // out on the terrace, standing still: they get you
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1225, -1068, 270, 0);
    for (let i = 0; i < 200 && !k.hunt!.state()?.caught; i++) k.step(15);
  });
  expect(await page.evaluate(() => window.kq!.hunt!.state()?.caught)).toBeTruthy();
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 60 && k.story!.state().era !== 'today'; i++) k.step(10);
    k.step(200);
  });
  const s = await story(page);
  expect(s.era).toBe('today');
  expect(s.beat).toBe('k2_10');
  expect(await clues(page)).not.toContain('clue.k2.wachbuch');
  expect(s.objective).toMatchObject({ id: 'k2.heim', x: 1222, z: -1118 });
  // anchor B: straight back into the court, the horn sounds again
  await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
  await shiftAt(page, 1222, -1118, 270);
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 160 && !k.hunt!.state(); i++) {
      k.step(15);
      k.story!.finishTyping();
    }
  });
  expect(await page.evaluate(() => window.kq!.hunt!.mode()?.mode)).toBe('parforce');
  expect((await payloads(page, 'hunt:start')).length).toBe(2);
  expect(errors).toEqual([]);
});
