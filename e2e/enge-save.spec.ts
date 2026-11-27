import { type Page, expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { SAVE_KEY } from '../src/core/save';
import { openPause, waitForHooks } from './helpers/pause';

const FIRST = 'k1.enge';
const SECOND = 'k1.enge.2';
const URL = './?manual&q=low';
const REGULAR_XP = 15;
const ELITE_XP = 45;

function live(page: Page, group: string) {
  return page.evaluate((id) => window.kq!.combat!.enemies()
    .filter((enemy) => enemy.group === id && enemy.state !== 'dissolve'), group);
}

function rewards(page: Page) {
  return page.evaluate(() => {
    const { xp, drops } = window.kq!.progression!.state();
    return { xp, drops };
  });
}

async function saveAndContinue(page: Page, defeated: number | undefined): Promise<void> {
  await openPause(page);
  await page.getByTestId('pause-save').click();
  await expect(page.getByText('Spielstand gespeichert.', { exact: true })).toBeVisible();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY('auto'));
  expect(saved.systems.story.beat).toBe('k1_14b');
  expect(saved.systems.combat.groups[FIRST]?.killed).toBe(3);
  expect(saved.systems.combat.groups[SECOND]?.killed).toBe(defeated);

  await page.goto(URL);
  const resume = page.getByTestId('title-continue');
  await expect(resume).toBeEnabled({ timeout: 180_000 });
  await resume.click();
  await expect(page.getByTestId('title')).toBeHidden();
  await waitForHooks(page, ['story', 'combat', 'progression']);
  await page.evaluate(() => window.kq!.combat!.god(true));
}

test('Die Enge resumes between waves and after two reinforcements fall', async ({ page }) => {
  test.setTimeout(ciScale(300_000));
  await page.goto(`${URL}&notitle&fresh`);
  await waitForHooks(page, ['story', 'combat', 'progression']);
  const firstKills = await page.evaluate((group) => {
    const k = window.kq!;
    k.story!.start('Alex');
    k.story!.goto('k1', 'k1_14b');
    k.setEra('1789');
    k.teleport(1810, 274);
    k.combat!.god(true);
    k.story!.flush();
    k.step(4);
    const killed = k.combat!.kill(group);
    k.step(4);
    return killed;
  }, FIRST);
  expect(firstKills).toBe(3);
  const firstRewards = await rewards(page);
  expect(firstRewards.drops).toBe(3);

  await saveAndContinue(page, undefined);
  await page.evaluate(() => window.kq!.step(120));
  expect(await live(page, FIRST)).toHaveLength(0);
  const reinforcements = await live(page, SECOND);
  expect(reinforcements).toHaveLength(4);
  expect(await rewards(page)).toEqual(firstRewards);

  await page.evaluate((ids) => {
    const k = window.kq!;
    for (const id of ids) k.combat!.kill(id);
    k.step(4);
  }, reinforcements.slice(0, 2).map((enemy) => enemy.id));
  const partialRewards = await rewards(page);
  expect(partialRewards.drops).toBe(5);

  await saveAndContinue(page, 2);
  await page.evaluate(() => window.kq!.step(120));
  expect(await live(page, SECOND)).toHaveLength(2);
  expect(await rewards(page)).toEqual(partialRewards);

  const result = await page.evaluate((group) => {
    const k = window.kq!;
    const beats: string[] = [];
    const xpGains: number[] = [];
    const offBeat = k.ctx.events.on('story:beat', ({ beat }) => beats.push(beat));
    const offXp = k.ctx.events.on('xp:gain', ({ amount, reason }) => {
      if (reason === 'enemy:streuner') xpGains.push(amount);
    });
    const killed = k.combat!.kill(group);
    k.step(8);
    offBeat();
    offXp();
    return { killed, beats, beat: k.story!.state().beat, xpGains };
  }, SECOND);
  expect(result).toEqual({ killed: 2, beats: ['k1_14c'], beat: 'k1_14c', xpGains: [REGULAR_XP, ELITE_XP] });
  const finalRewards = await rewards(page);
  expect(finalRewards.drops).toBe(7);
  expect(finalRewards.xp - partialRewards.xp).toBe(REGULAR_XP + ELITE_XP);
});
