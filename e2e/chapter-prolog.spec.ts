import { expect, test } from '@playwright/test';
import { trackErrors } from './helpers/common';
import { beat, newGame, playProlog, said, shot, story, until } from './helpers/prolog';

/**
 * Chapter spec: the whole prologue ("Vermessung", bible 01-prolog.md), played headless through
 * window.kq from the title screen to the chapter-1 title card (the playthrough itself lives in
 * e2e/helpers/prolog.ts, shared with e2e/campaign.spec.ts).
 *
 * A second test plays the bad branch: the oil runs out in 1789 / the pack catches you → curtain,
 * Laub explains gently, back at the station at dusk (checkpoint p10) with the confirmed page kept.
 *
 * Screenshots: test-results/screens/ch-prolog-*.png
 */
test.describe.configure({ timeout: 2_400_000 }); // software WebGL, a whole chapter: slow on a busy machine

test('prolog: the whole chapter, title screen to "Der Hof"', async ({ page }) => {
  const errors = trackErrors(page);
  await newGame(page, 'Mara', true);
  await playProlog(page);
  expect(errors).toEqual([]);
});

test('prolog: oil runs out / the pack catches you: gently explained, the confirmed page stays', async ({ page }) => {
  const errors = trackErrors(page);
  await newGame(page, 'Alex');
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('prolog', 'p8');
    k.ctx.ui.modals.closeAll();
    // what the player carries at p8 (only the prologue's clues: no later chapter's flags)
    for (const id of ['lageplan', 'messtischblatt', 'handbuch', 'laubblatt', 'mauerrest', 'orangeriemauer', 'ehrenhof', 'kartenvergleich', 'hohlweg', 'eiskeller', 'punktwolke', 'seite_eins'])
      k.ctx.events.emit('clue:grant', { id: `clue.p.${id}` });
    k.ctx.ui.modals.closeAll();
    k.chronik!.solve('case.p', 3);
    k.chronik!.check('case.p');
    k.step(4);
  });
  expect(await until(page, 'p9', 4)).toBe('p9');
  // fairness: the anchor is reachable and Q only works there
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1150, -1118, 90, 4);
    k.step(4);
    k.press('KeyQ', 1);
    k.step(4);
  });
  expect((await story(page)).era).toBe('today');
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1205, -1119, 90, 4);
    k.step(4);
    k.press('KeyQ', 1);
    k.fx!.shiftAt(3.6);
    k.fx!.freeze(false);
    k.step(10);
  });
  expect(await beat(page)).toBe('p9b');
  // the oil: 90 s of light, then the curtain (lit lantern, nothing else happening)
  await page.evaluate(() => {
    const k = window.kq!;
    k.lantern!.toggle(true);
    for (let i = 0; i < 260 && !document.querySelector('[data-testid="story-curtain"].kqs-down'); i++) {
      k.ctx.ui.modals.closeAll();
      k.step(30);
    }
  });
  await expect(page.getByTestId('story-curtain')).toHaveClass(/kqs-down/);
  await expect(page.getByTestId('story-curtain')).toContainText('Laterne');
  await shot(page, '30-oil-empty');
  await page.evaluate(() => window.kq!.step(9 * 60));
  await page.waitForTimeout(2600);
  let s = await story(page);
  expect(s.era).toBe('today');
  expect(s.beat).toBe('p10');
  const p = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
  expect(Math.hypot(p.x - 760, p.z + 902)).toBeLessThan(6);
  // the confirmed sentences stay; Laub explains
  expect(await page.evaluate(() => window.kq!.state().chronik['case.p']?.confirmed.length)).toBe(3);
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 40 && !(k.story!.state().said as string[]).includes('laub.p.oel'); i++) k.step(30);
  });
  expect(await said(page)).toContain('laub.p.oel');

  // the pack: back to p9, shift again, get caught → the gentle explanation
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('prolog', 'p9b');
    k.setEra('1789');
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
  s = await story(page);
  expect(s.beat).toBe('p10');
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 40 && !(k.story!.state().said as string[]).includes('laub.p.gestellt'); i++) k.step(15);
  });
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 900 && k.story!.state().dialogue?.speaker !== 'laub'; i++) k.step(10);
    k.story!.finishTyping();
    k.teleport(757.5, -899, 4, -3);
  });
  await shot(page, '32-laub-explains');
  expect(await said(page)).toContain('laub.p.gestellt');
  expect(await page.evaluate(() => window.kq!.state().chronik['case.p']?.confirmed.length)).toBe(3);
  expect(errors).toEqual([]);
});
