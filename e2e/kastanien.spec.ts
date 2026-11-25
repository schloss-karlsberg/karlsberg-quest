import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { trackErrors } from './helpers/common';

/**
 * The tour's chestnuts (TASK-002, content/story/00-tour.story.json): t3 places the first three by
 * the path from the car park. One is picked with E, one by walking over it, one with the touch
 * interact button; the feed counts them, Gerold remarks on the first; the count and the taken ones
 * survive a save and a reload; the tour's end clears the ones left lying. Screens in
 * test-results/kastanien/.
 */
const OUT = 'test-results/kastanien';
mkdirSync(OUT, { recursive: true });
test.describe.configure({ timeout: 300_000 });
test.use({ hasTouch: true });

const NUT = 'item.kastanie';
/** The three t3 chestnuts (00-tour.story.json). */
const K1 = { id: 'tour.kastanie.01', x: 509.2, z: -760.1 };
const K2 = { id: 'tour.kastanie.02', x: 510.9, z: -758.5 };
const K3 = { id: 'tour.kastanie.03', x: 505.9, z: -754 };

const step = (page: Page, n: number) => page.evaluate((k) => window.kq!.step(k), n);
const count = (page: Page) => page.evaluate((item) => window.kq!.progression!.state().inventory[item] ?? 0, NUT);
const lying = (page: Page) =>
  page.evaluate(() => window.kq!.progression!.pickups().filter((p) => p.id.startsWith('tour.kastanie.')).map((p) => p.id).sort());
const shot = async (page: Page, name: string) => {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${OUT}/${name}.png` });
};
/** Stand at an offset from a chestnut (inside E's 2.7 m, outside the 1.3 m walk-over) and let the prompt settle. */
const standBy = async (page: Page, k: { x: number; z: number }, dx: number, dz: number) => {
  await page.evaluate(({ x, z }) => window.kq!.teleport(x, z, 0, -25), { x: k.x + dx, z: k.z + dz });
  await step(page, 10);
};

test('kastanien: E, walking over and the touch button pick them up; the count is saved; the tour end clears the rest (TASK-002)', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`./?notitle&fresh&manual&x=${K1.x}&z=${K1.z + 6}`);
  await page.waitForFunction(() => !!window.kq?.story && !!window.kq?.progression, null, { timeout: 180_000 });
  // desktop first (the touch context would switch the touch controls on by itself)
  await page.evaluate(() => window.kq!.ctx.settings.update((d) => (d.touchControls = 'off'), 'touchControls'));
  await page.evaluate(() => window.kq!.story!.start('Alex'));
  await page.evaluate(() => window.kq!.story!.goto('tour', 't3'));
  // the beat's actions wait for the chapter card to fade (game time)
  for (let i = 0; i < 40 && (await lying(page)).length < 3; i++) await step(page, 60);
  expect(await lying(page)).toEqual([K1.id, K2.id, K3.id]);
  // a chestnut is a plain pickup: no light column, small glow
  expect(await page.evaluate(() => window.kq!.progression!.pickups().find((p) => p.id === 'tour.kastanie.01')?.item)).toBe(NUT);
  await page.evaluate(({ x, z }) => window.kq!.teleport(x, z + 7, 0, -18), K1);
  await step(page, 20);
  await shot(page, 'kastanien-t3');

  // E: the prompt names the action, E takes the nearest one (here K1, 2 m off; K2 is 4.3 m away)
  await standBy(page, K1, -1.4, -1.4);
  await expect(page.locator('.kq-prompt')).toContainText('Kastanie aufheben');
  await page.keyboard.press('KeyE');
  await step(page, 5);
  expect(await count(page)).toBe(1);
  expect(await lying(page)).toEqual([K2.id, K3.id]);
  // Gerold says his line on the first one
  await step(page, 30);
  expect(await page.evaluate(() => window.kq!.state().systems.story?.fired)).toContain('c:kastanie-1');

  // walking over one picks it up; the feed counts
  await page.evaluate(({ x, z }) => window.kq!.teleport(x, z, 0, -25), K2);
  await step(page, 5);
  expect(await count(page)).toBe(2);
  const feed = await page.evaluate(() => window.kq!.progression!.feed());
  expect(feed.filter((l) => l.startsWith('+ Kastanie'))).toEqual(['+ Kastanie', '+ Kastanie ×1 (2)']);
  await shot(page, 'kastanien-feed');

  // touch: the interact button carries the prompt and takes it
  await page.evaluate(() => window.kq!.ctx.settings.update((d) => (d.touchControls = 'on'), 'touchControls'));
  await standBy(page, K3, 0, 2);
  const interact = page.getByTestId('touch-interact');
  await expect(interact).toBeVisible();
  await expect(interact).toContainText('Kastanie aufheben');
  await interact.tap();
  await step(page, 5);
  expect(await count(page)).toBe(3);
  expect(await lying(page)).toEqual([]);
  await page.evaluate(() => window.kq!.ctx.settings.update((d) => (d.touchControls = 'off'), 'touchControls'));

  // save, reload: the count and the taken chestnuts stay; a fresh t3 entry does not bring them back
  expect(await page.evaluate(() => window.kq!.ctx.save.autosave('e2e-kastanien', true))).toBe(true);
  await page.goto(`./?notitle&manual&x=${K1.x}&z=${K1.z + 6}`);
  await page.waitForFunction(() => !!window.kq?.story && !!window.kq?.progression, null, { timeout: 180_000 });
  await step(page, 5);
  expect(await count(page)).toBe(3);
  expect(await page.evaluate(() => window.kq!.state().systems.story?.fired)).toContain('c:kastanie-1');
  // t3 placing them again (a jump back) asks for the taken ids: they never come back
  await page.evaluate(() => {
    const w = window as unknown as { placed: string[] };
    w.placed = [];
    window.kq!.ctx.events.on('loot:place', (p) => w.placed.push(p.id));
    window.kq!.story!.goto('tour', 't3');
  });
  for (let i = 0; i < 40 && !(await page.evaluate(() => (window as unknown as { placed: string[] }).placed.length)); i++) await step(page, 60);
  expect(await page.evaluate(() => (window as unknown as { placed: string[] }).placed)).toEqual([K1.id, K2.id, K3.id]);
  await step(page, 5);
  expect(await lying(page)).toEqual([]);
  expect(await count(page)).toBe(3);

  // the next sections place theirs; the end of the tour clears what is still lying
  await page.evaluate(() => window.kq!.story!.goto('tour', 't5'));
  for (let i = 0; i < 40 && (await lying(page)).length < 6; i++) await step(page, 60);
  expect((await lying(page)).length).toBe(6);
  await page.evaluate(() => window.kq!.story!.goto('k1'));
  await step(page, 30);
  expect(await lying(page)).toEqual([]);
  expect(await count(page)).toBe(3);
  expect(errors).toEqual([]);
});
