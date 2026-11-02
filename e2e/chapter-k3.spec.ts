import { expect, test } from '@playwright/test';
import { trackErrors } from './helpers/common';
import { type Any, flags, install, playK3, story } from './helpers/k3';

/**
 * Chapter 3 "Die Nacht", played through headless (`?manual`, driven through window.kq), with the
 * real content (story 03-kapitel-3.story.json + kapitel-3 pack). The playthrough lives in
 * e2e/helpers/k3.ts (shared with e2e/campaign.spec.ts).
 * Screenshots: test-results/screens/ch-k3-*.png.
 */
test('chapter 3 "Die Nacht": played through', async ({ page }) => {
  test.setTimeout(3_600_000);
  const errors = trackErrors(page);
  await page.goto('./?notitle&nosave&fresh&manual');
  await page.waitForFunction(
    () => {
      const k = window.kq as Any;
      return !!k?.story && !!k?.interiors && !!k?.npc && !!k?.chronik && !!k?.hunt && !!k?.fx && !!k?.menagerie && !!k?.tools;
    },
    null,
    { timeout: 180_000 },
  );
  await install(page);
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.ctx.state.mutable.flags['barks.quiet'] = true;
    k.story.start('Alex');
    k.story.goto('k3');
    k.step(4);
  });
  await playK3(page);
  expect(errors).toEqual([]);
});

/** W5 without a choice: after 40 s Hanne takes you by the arm, nothing is saved; that is no failure. */
test('chapter 3: the Festsaal fuse runs out → "nichts", and the table stays empty', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = trackErrors(page);
  await page.goto('./?notitle&nosave&fresh&manual');
  await page.waitForFunction(() => !!(window.kq as Any)?.story && !!(window.kq as Any)?.interiors && !!(window.kq as Any)?.npc, null, { timeout: 180_000 });
  await install(page);
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.ctx.state.mutable.flags['barks.quiet'] = true;
    k.story.start('Alex');
    k.story.goto('k3', 'k3_3');
    k.setEra('1793-07');
    k.step(4);
    k.ctx.events.emit('threat:configure', { kind: 'fire', active: true, seconds: 300 });
    k.ctx.state.mutable.flags['fire.hold'] = false;
    k.ctx.state.mutable.inventory.clues.push('clue.k3.fackel');
    k.interiors.enter('B01.2.og-festsaal', { u: 0.5, v: 0.3 });
    k.step(6);
    // Hanne speaks first, then Laub; the choice opens after them
    for (let i = 0; i < 80 && !k.story.choice(); i++) k.step(30);
  });
  expect((await story(page)).beat).toBe('k3_4');
  expect(await page.evaluate(() => (window.kq as Any).story.choice())).toBe('k3.objekt');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.step(41 * 60);
    k.story.flush();
    k.step(10);
  });
  expect(await flags(page)).toMatchObject({ 'flag.k3_objekt': 'nichts' });
  expect((await story(page)).beat).toBe('k3_5');
  expect(errors).toEqual([]);
});
