import { expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { trackErrors } from './helpers/common';
import { type Any, flags, install, playK3, story } from './helpers/k3';
import { openPause, waitForHooks } from './helpers/pause';

/**
 * Chapter 3 "Die Nacht" as a quest chain, played through headless (`?manual`, driven through window.kq), with the
 * real content (story 03-kapitel-3.story.json + kapitel-3 pack). The playthrough lives in
 * e2e/helpers/k3.ts (shared with e2e/campaign.spec.ts).
 * Screenshots: test-results/screens/cnb-k3-*.png.
 */
test('chapter 3 "Die Nacht": played through', async ({ page }) => {
  test.setTimeout(ciScale(3_600_000));
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

test('chapter 3 replay from Pause leaves time to accept Peter’s chair quest', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./?notitle&nosave&fresh&manual');
  await waitForHooks(page, ['story', 'npc', 'quests', 'fx']);
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.start('Alex');
    const state = k.ctx.state.mutable;
    state.systems.story!.unlocked.push('k3');
    state.systems.story!.completed.push('k3');
    for (const id of ['q.k3.nachmittag', 'q.k3.buch', 'q.k3.strohmann']) {
      state.systems.quests!.quests[id] = { state: 'done', counts: {}, t: 0 };
      state.flags[`quest.${id}`] = 'done';
    }
  });
  await openPause(page);
  await page.getByTestId('pause-chapters').click();
  await page.getByTestId('chapter-k3').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ja', exact: true }).click();
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.flush();
    k.teleport(1208, -1114, 90, 2);
    k.step(4);
    k.press('KeyQ', 1);
    k.fx!.shiftAt(3.6);
    k.fx!.freeze(false);
    k.step(120);
  });
  expect(await story(page)).toMatchObject({ era: '1793-07', beat: 'k3_1' });
  const topics = await page.evaluate(() => window.kq!.quests!.topics('peter'));
  const chair = 'q.k3.lehnstuhl';
  expect(topics).toContainEqual(expect.objectContaining({ quest: chair, kind: 'offer' }));
  await page.evaluate((id) => window.kq!.ctx.events.emit('quest:accept', { id, npc: 'peter' }), chair);
  expect(await flags(page)).toMatchObject({ [`quest.${chair}`]: 'active' });
  expect(errors).toEqual([]);
});

/** W5 without a choice: after 40 s Hanne takes you by the arm, nothing is saved; that is no failure. */
test('chapter 3: the Festsaal fuse runs out → "nichts", and the table stays empty', async ({ page }) => {
  test.setTimeout(ciScale(600_000));
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
    // the four things are placed as the beat opens
    for (let i = 0; i < 40 && !k.interiors.festsaal().active; i++) k.step(30);
  });
  expect((await story(page)).beat).toBe('k3_4');
  expect(await page.evaluate(() => (window.kq as Any).interiors.festsaal().active)).toBe(true);
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.step(51 * 60);
    k.story.flush();
    k.step(10);
  });
  expect(await flags(page)).toMatchObject({ 'flag.k3_objekt': 'nichts' });
  expect((await story(page)).beat).toBe('k3_5');
  expect(errors).toEqual([]);
});

/** Continue in the undecided Festsaal: the things are restaged on the saved storey (TASK-043). */
test('chapter 3: Continue on a fresh page restores the Festsaal floor and allows a pickup', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = trackErrors(page);
  await page.goto('./?notitle&nosave&fresh&manual');
  await page.waitForFunction(() => !!(window.kq as Any)?.story && !!(window.kq as Any)?.interiors && !!(window.kq as Any)?.npc, null, { timeout: 180_000 });
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
    k.interiors.enter('B01.2.og-festsaal');
    k.step(6);
    // the four things are placed as the beat opens
    for (let i = 0; i < 40 && !k.interiors.festsaal().active; i++) k.step(30);
  });
  expect((await story(page)).beat).toBe('k3_4');
  expect(await page.evaluate(() => (window.kq as Any).interiors.festsaal().active)).toBe(true);
  const saved = await page.evaluate(() => {
    const k = window.kq as Any;
    const room = k.interiors.list().find((r: Any) => r.roomId === 'B01.2.og-festsaal');
    const handle = k.interiors.festsaal().spots.find((s: Any) => s.key === 'tuergriff');
    const p = k.ctx.player.position;
    k.ctx.player.yaw = Math.atan2(p.x - handle.x, p.z - handle.z);
    k.step(1);
    k.ctx.save.enabled = true;
    return { written: k.ctx.save.save('auto', 'manual'), floor: room.floor, y: p.y };
  });
  expect(saved.written).toBe(true);
  expect(saved.y).toBeCloseTo(saved.floor, 2);

  await page.goto('./?manual&nosave');
  const resume = page.getByTestId('title-continue');
  await expect(resume).toBeEnabled({ timeout: 180_000 });
  await resume.click();
  await expect(page.getByTestId('title')).toBeHidden();
  await page.waitForFunction(() => !!window.kq?.story && !!window.kq?.interiors, null, { timeout: 180_000 });
  await page.evaluate(() => window.kq!.step(6));
  expect((await story(page)).beat).toBe('k3_4');
  expect(await page.evaluate(() => window.kq!.ctx.player.position.y)).toBeCloseTo(saved.floor, 2);
  await expect(page.locator('.kq-prompt')).toContainText('Türgriff');

  await page.keyboard.press('e');
  await page.evaluate(() => window.kq!.step(4));
  expect(await flags(page)).toMatchObject({ 'flag.k3_objekt': 'tuergriff', 'choice.k3.objekt': 'tuergriff' });
  expect((await story(page)).beat).toBe('k3_5');
  expect(errors).toEqual([]);
});
