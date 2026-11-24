import { expect, test } from '@playwright/test';
import { SCREENS, trackErrors } from './helpers/common';
import { waitForHooks } from './helpers/pause';
import { newGame } from './helpers/prolog';
import { openTourHub } from './helpers/tour';

// Tour onboarding, queued clue pages and the order in which Escape dismisses UI.
test.describe.configure({ timeout: 600_000 });

async function shot(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady()).catch(() => undefined);
  await page.screenshot({ path: `${SCREENS}/s5-pacing-${name}.png`, timeout: 90_000 }).catch(() => undefined);
}

test('the tour gives the player movement during its opening card', async ({ page }) => {
  const errors = trackErrors(page);
  await newGame(page, 'Mara');
  await expect(page.getByTestId('story-card')).toContainText('Die Führung');
  const opening = await page.evaluate(() => {
    const k = window.kq!;
    const p = k.ctx.player.position.clone();
    const t = k.ctx.loop.time;
    k.press('KeyW', 60);
    return {
      moved: Math.hypot(k.ctx.player.position.x - p.x, k.ctx.player.position.z - p.z),
      seconds: k.ctx.loop.time - t,
      combat: k.combat!.state().inCombat,
      chapter: k.story!.state().chapter,
    };
  });
  expect(opening.chapter).toBe('tour');
  expect(opening.seconds).toBeLessThanOrEqual(1.1);
  expect(opening.moved).toBeGreaterThan(0.5);
  expect(opening.combat).toBe(false);
  await shot(page, '01-tour-control');
  expect(errors).toEqual([]);
});

test('the test quest holds its payout during combat and shares the notice slot', async ({ page }) => {
  const errors = trackErrors(page);
  await newGame(page, 'Mara', false, './?nosave&fresh&manual&storytest');
  await waitForHooks(page, ['skills']);
  const quest = 'q.test.lohnzettel';
  // Turning in the test quest removes its own enemies. Keep a separate fight active.
  const group = 'pacing.mahnbrief';
  await page.evaluate(({ quest, group }) => {
    const k = window.kq!;
    k.story!.goto('test', 'q1');
    k.setEra('1789');
    k.teleport(1270, -1215, 0);
    k.step(420);
    k.quests!.accept(quest);
    k.combat!.god(true);
    k.combat!.spawn('mahnbrief', { group, x: 1270, z: -1217, radius: 0 });
    k.combat!.windup(group);
    k.step(2);
  }, { quest, group });
  expect(await page.evaluate(() => window.kq!.combat!.state().inCombat)).toBe(true);
  const during = await page.evaluate((id) => {
    const k = window.kq!;
    k.quests!.complete(id);
    k.skills!.grant('relief', 1);
    k.step(1);
    return {
      inCombat: k.combat!.state().inCombat,
      rewardOpen: k.quests!.reward(),
      rewardPending: k.quests!.rewardPending(),
    };
  }, quest);
  expect(during).toEqual({ inCombat: true, rewardOpen: false, rewardPending: 1 });
  await page.evaluate((id) => window.kq!.combat!.kill(id), group);
  await page.waitForFunction(() => {
    const k = window.kq!;
    k.story!.finishTyping();
    k.step(15);
    return !k.combat!.state().inCombat && k.quests!.reward();
  });
  expect(await page.evaluate(() => window.kq!.ctx.ui.cards.showing)).toBe('reward');
  expect(await page.evaluate(() => window.kq!.skills!.card())).toBeNull();
  expect(await page.evaluate((id) => window.kq!.quests!.state().quests[id]?.state, quest)).toBe('done');
  expect(errors).toEqual([]);
});

test('two clue pages at the hub open one at a time', async ({ page }) => {
  const errors = trackErrors(page);
  await newGame(page, 'Alex', false, './?nosave&fresh&manual&placeholder');
  await waitForHooks(page, ['chronik']);
  await openTourHub(page);
  const hub = page.getByTestId('hub');
  await page.evaluate(() => {
    const k = window.kq!;
    k.chronik!.examine('ct.clue.hohlweg');
    k.chronik!.examine('ct.clue.orangeriemauer');
    k.step(2);
  });
  const card = page.getByTestId('chronik-card');
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute('data-clue', 'ct.clue.hohlweg');
  await shot(page, '04-one-card');

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    window.kq!.step(1);
    return document.querySelector('[data-testid="chronik-card"]')?.getAttribute('data-clue') === 'ct.clue.orangeriemauer';
  });
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute('data-clue', 'ct.clue.orangeriemauer');
  await page.keyboard.press('Escape');
  await expect(hub).toBeVisible();
  await expect(card).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Escape handles the top panel, then the visible toast, then pause', async ({ page }) => {
  await page.goto('./?notitle&nosave&fresh&manual&idle&x=1452&z=-640');
  await waitForHooks(page, ['travel', 'notes']);
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.ui.toast('Karte ergänzt', 30000);
    k.ctx.ui.toast('Aufgabe erfüllt', 30000);
    k.step(1);
  });
  const activeToast = page.locator('.kq-toast:not(.kq-notice-out)');
  await expect(activeToast).toHaveText('Karte ergänzt');

  await page.keyboard.press('e');
  await page.keyboard.press('Space');
  const bindingsReached = await page.evaluate(() => {
    const { input } = window.kq!.ctx;
    return input.wasPressed('listen') && input.wasPressed('dodge');
  });
  expect(bindingsReached).toBe(true);
  await expect(activeToast).toHaveText('Karte ergänzt');

  await page.evaluate(() => window.kq!.travel!.map(true));
  const map = page.getByTestId('travel-map');
  await expect(map).toBeVisible();
  await expect(activeToast).toBeHidden();
  await page.keyboard.down('Escape');
  await expect(map).toBeHidden();
  await expect(activeToast).toBeVisible();
  await page.keyboard.down('Escape'); // held key, delivered as a repeat
  await page.keyboard.up('Escape');
  await expect(activeToast).toHaveText('Karte ergänzt');
  await expect(page.getByTestId('resume')).toBeHidden();

  await page.keyboard.press('F8');
  const notesText = page.getByTestId('notes-text');
  await expect(notesText).toBeFocused();
  await notesText.fill('Eintrag');
  await page.keyboard.press('Space');
  await expect(notesText).toHaveValue('Eintrag ');
  await expect(activeToast).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(notesText).toBeHidden();
  await expect(activeToast).toHaveText('Karte ergänzt');

  await page.evaluate(() => {
    window.kq!.ctx.ui.modals.open({
      title: 'Eine Wahl treffen',
      closable: false,
      actions: [{ label: 'Auswählen' }],
    });
  });
  const choice = page.getByRole('button', { name: 'Auswählen' });
  await expect(choice).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(choice).toBeFocused();
  await expect(activeToast).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(choice).toBeHidden();
  await expect(activeToast).toBeVisible();

  await page.keyboard.down('Escape');
  await expect(activeToast).toHaveCount(0);
  await page.evaluate(() => {
    for (let i = 0; i < 24; i++) window.kq!.step(1);
  });
  await expect(activeToast).toHaveText('Aufgabe erfüllt');
  await page.keyboard.down('Escape');
  await page.keyboard.up('Escape');
  await expect(activeToast).toHaveText('Aufgabe erfüllt');

  await page.keyboard.press('Enter');
  await expect(activeToast).toHaveCount(0);
  const resume = page.getByTestId('resume');
  await expect(resume).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(resume).toBeVisible();
});
