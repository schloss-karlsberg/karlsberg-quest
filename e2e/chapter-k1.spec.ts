import { expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { trackErrors } from './helpers/common';
import { boot, inv, playK1, shiftToPast, shot, story, upd } from './helpers/k1';
import { openPause } from './helpers/pause';
import { qn, qs } from './helpers/prolog';

/**
 * Chapter 1 "Der Hof" as quests (docs/ACTION-RPG.md §11.1), played through headless (`?manual`,
 * driven through window.kq). The playthrough lives in e2e/helpers/k1.ts (shared with
 * e2e/campaign.spec.ts); this spec boots the chapter directly with what the prologue leaves behind.
 * A second test: the lantern running dry in Teil A and being caught in Teil B lose nothing (the
 * quests keep their counts); you wake in the present at that part's anchor, not the station.
 * Screenshots: test-results/screens/ch-k1-*.png, cna-k1-*.png.
 */
test('chapter 1 "Der Hof": the whole chapter as quests, both parts', async ({ page }) => {
  test.setTimeout(ciScale(3_000_000));
  const errors = trackErrors(page);
  await boot(page);
  await playK1(page);
  await openPause(page);
  await page.getByTestId('pause-chapters').click();
  await page.getByTestId('chapter-k1').click();
  const confirm = page.getByRole('dialog').filter({ hasText: '„Der Hof“ (neu) beginnen?' });
  await confirm.getByRole('button', { name: 'Ja', exact: true }).click();
  await upd(page, 420);
  expect(await story(page)).toMatchObject({ chapter: 'k1', beat: 'k1_0', era: 'today' });
  expect(await page.evaluate(() => Object.keys(window.kq!.combat!.groups()))).not.toContain('k1.enge');
  expect(await page.evaluate(() => Object.keys(window.kq!.combat!.groups()))).not.toContain('k1.enge.2');
  expect(await qs(page, 'q.k1.karlslust')).toBe('done');
  expect(errors).toEqual([]);
});

test('chapter 1: an empty lantern (Teil A) and the pack (Teil B) cost nothing, you wake at the anchor', async ({ page }) => {
  test.setTimeout(ciScale(600_000));
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    window.kq!.story!.goto('k1', 'k1_3');
    window.kq!.step(4);
  });
  expect(await qs(page, 'q.k1.lohn')).toBe('offered');
  await page.evaluate(() => window.kq!.quests!.accept('q.k1.lohn'));
  // Teil A: the lantern runs dry in 1789 → curtain → the Ehrenhof today (beat `wake`), same beat
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
  expect(await qn(page, 'q.k1.lohn', 'zeichen')).toBe(1); // the quest keeps it
  const at = () => page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
  let p = await at();
  expect(Math.hypot(p.x - 1222, p.z + 1119)).toBeLessThan(20);
  await shot(page, 'x1-oel-leer');

  // Teil B: caught by the patrol → "heimgebracht", finds kept, awake at the Tschifflik terrace today
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('k1', 'k1_7');
    k.step(4);
    k.story!.goto('k1', 'k1_11');
    k.step(10);
    // the lights over the water are already out: the patrol walks
    k.quests!.progress('q.k1.karlslust', 'lichter', 5);
    k.step(4);
    k.teleport(1822, 70, 175, 0);
    k.step(2);
  });
  await shiftToPast(page);
  const patrol = () =>
    page.evaluate(() => {
      const k = window.kq!;
      (window as unknown as { __cna: { until(f: () => boolean, s: number): boolean } }).__cna.until(() => k.hunt!.state()?.mode === 'patrol', 60);
      return k.hunt!.state()?.mode;
    });
  expect(await patrol()).toBe('patrol');
  await page.evaluate(() => window.kq!.chronik!.caught());
  await upd(page, 60);
  await expect(page.getByTestId('story-curtain')).toContainText('heimgebracht');
  await upd(page, 400);
  s = await story(page);
  expect(s).toMatchObject({ era: 'today', beat: 'k1_11' });
  expect(s.objective?.id).toBe('k1.zurueck-b');
  p = await at();
  expect(Math.hypot(p.x - 1822, p.z - 70)).toBeLessThan(20);
  expect((await inv(page)).clues).toContain('clue.k1.zeichen');
  expect(await qn(page, 'q.k1.karlslust', 'lichter')).toBe(5);
  expect(await page.evaluate(() => window.kq!.hunt!.state())).toBeNull();
  await page.evaluate(() => {
    window.kq!.teleport(1822, 70, 175, 0);
    window.kq!.step(2);
  });
  await shiftToPast(page);
  expect(await patrol()).toBe('patrol');
  expect(errors).toEqual([]);
});
