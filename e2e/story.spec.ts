import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

/**
 * Story feature: new-game flow, dialogue presenter, field station (day/night), hub overlay,
 * objectives + Bussole, being caught, endings and credits. Screenshots: test-results/screens/story-*.png
 */
const SCREENS = 'test-results/screens';
mkdirSync(SCREENS, { recursive: true });
// software WebGL on a busy machine can be slow: generous budgets
test.describe.configure({ timeout: 300_000 });

const IGNORED = [/GPU stall/i, /pointer ?lock/i, /WebGL.*(performance|ReadPixels)/i, /AudioContext was not allowed/i];

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.some((r) => r.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    if (!IGNORED.some((r) => r.test(e.message))) errors.push(`pageerror: ${e.message}`);
  });
  return errors;
}

async function boot(page: Page, extra = ''): Promise<void> {
  await page.goto(`./?notitle&nosave&fresh&manual${extra}`);
  await page.waitForFunction(() => !!window.kq?.story, null, { timeout: 180_000 });
}

async function ready(page: Page): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
}

async function shot(page: Page, name: string): Promise<void> {
  await ready(page);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SCREENS}/story-${name}.png` });
}

/** Show the current dialogue line fully typed. */
async function typed(page: Page): Promise<void> {
  await page.evaluate(() => window.kq!.story!.finishTyping());
  await expect(page.getByTestId('dialogue')).toHaveClass(/kqs-show/);
}

test('story: new game flow (warning → name → lantern) starts the prologue', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./?nosave&fresh');
  const start = page.getByTestId('title-new');
  await expect(start).toBeEnabled({ timeout: 180_000 });
  await start.click();
  await expect(page.getByTestId('content-warning')).toBeVisible();
  await expect(page.getByTestId('content-warning')).toContainText('16');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENS}/story-warning.png` });
  await page.getByTestId('warning-accept').click();
  const name = page.getByTestId('player-name');
  await expect(name).toBeVisible();
  await name.fill('Mara');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENS}/story-name.png` });
  await page.getByTestId('name-confirm').click();
  await expect(page.getByTestId('light-lantern')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENS}/story-lantern.png` });
  await page.getByTestId('light-lantern').click();
  await expect(page.getByTestId('title')).toBeHidden({ timeout: 30_000 });
  const s = await page.evaluate(() => window.kq!.story!.state());
  expect(s.active).toBe(true);
  expect(s.chapter).toBe('prolog');
  expect(s.beat).toBe('p1');
  expect(s.name).toBe('Mara');
  // the prologue starts at the field station
  const p = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
  expect(Math.hypot(p.x - 760, p.z + 902)).toBeLessThan(5);
  await expect(page.getByTestId('story-card')).toContainText('Vermessung');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SCREENS}/story-prolog-card.png` });
  expect(errors).toEqual([]);
});

test('story: field station by day and night, dialogue portraits', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.start('Alex');
    k.step(200);
  });
  // Marlene on the radio, with her portrait and the fiction label
  await expect(page.getByTestId('dialogue')).toHaveAttribute('data-speaker', 'marlene', { timeout: 10_000 });
  await typed(page);
  await expect(page.getByTestId('dialogue')).toContainText('Alex');
  await page.evaluate(() => window.kq!.teleport(757.5, -899, 4, -3));
  await shot(page, 'dialogue-marlene');

  // Laub (brass compass with a face)
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('prolog', 'p4');
    k.story!.say('laub', 'Fünfzig Meter. Ich sehe es selbst. Ich möchte festhalten, dass mein Blatt 1840 vollkommen in Ordnung war.');
    k.ctx.player.teleport(1150, -1112, -Math.PI / 2);
    k.step(4);
  });
  await page.waitForFunction(() => window.kq!.story!.state().dialogue?.speaker === 'laub', null, { timeout: 15_000 });
  await typed(page);
  await expect(page.getByTestId('dialogue')).toHaveAttribute('data-portrait', 'compass');
  await shot(page, 'dialogue-laub');

  // the station, day and night
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('prolog', 'p10');
    k.story!.look('day');
    k.teleport(754, -900, 22, -3);
    k.step(2);
  });
  await shot(page, 'station-day');
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.look('night');
    k.step(2);
  });
  await page.waitForTimeout(600);
  await shot(page, 'station-night');
  expect(errors).toEqual([]);
});

test('story: hub overlay, objective and Bussole', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.start('Alex');
    k.step(4);
    k.story!.flush();
    k.teleport(760, -905, 0);
    k.step(4);
  });
  expect(await page.evaluate(() => window.kq!.story!.state().inHub)).toBe(true);
  await page.evaluate(() => window.kq!.press('KeyE', 2));
  // the station's own clues (Marlene's note and stories from the chapter packs) take E first:
  // read them, then the hub
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 8 && !document.querySelector('[data-testid="hub"]'); i++) {
      k.ctx.ui.modals.closeAll();
      k.step(2);
      k.press('KeyE', 2);
    }
  });
  await expect(page.getByTestId('hub')).toBeVisible();
  await shot(page, 'hub');
  await page.getByTestId('hub-chronik').click();
  // prologue p1: the Pinnwand hands out two cards (Messtischblatt, Lageplan) on top of the hub;
  // the Chronik board itself opens from the Pinnwand once the cards are read (p8: Tab)
  if (await page.evaluate(() => !!window.kq!.chronik)) {
    await expect(page.getByTestId('chronik-card').last()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('hub')).toBeVisible();
  }
  await page.getByTestId('hub-shelf').click();
  await page.evaluate(() => {
    // the Handbuch card on top of the shelf page
    if (document.querySelector('[data-testid="chronik-card"]')) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  });
  await page.getByTestId('hub-back').click();
  await page.getByTestId('hub-drawer').click();
  await page.evaluate(() => {
    if (document.querySelector('[data-testid="chronik-card"]')) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  });
  await page.getByTestId('hub-radio').click();
  await page.waitForTimeout(1500);
  await shot(page, 'hub-radio');
  await page.getByTestId('hub-map').click();
  await expect(page.getByTestId('chapter-prolog')).toBeVisible();
  await shot(page, 'hub-map');
  await page.getByTestId('hub-continue').click();
  await page.evaluate(() => window.kq!.step(10));
  // the three items examined → p1 complete → p2 (the dam)
  const s = await page.evaluate(() => window.kq!.story!.state());
  expect(s.beat).toBe('p2');
  const inv = await page.evaluate(() => window.kq!.state().inventory);
  expect(inv.items).toContain('item.bussole');
  expect(inv.clues).toContain('clue.p.laubblatt');

  // objective towards the Orangerie, facing it: the needle glows
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('prolog', 'p3');
    k.story!.flush();
    k.teleport(1150, -966, 90, 2);
    k.step(4);
  });
  await expect(page.getByTestId('objective')).toHaveClass(/kqs-show/);
  await expect(page.getByTestId('bussole')).toHaveClass(/kqs-show/);
  await page.waitForTimeout(1500);
  await shot(page, 'objective');
  const glow = await page.evaluate(() => Number(getComputedStyle(document.querySelector('[data-testid="bussole"]')!).getPropertyValue('--glow')));
  expect(glow).toBeGreaterThan(0.3);
  expect(errors).toEqual([]);
});

test('story: caught by the pack → back at the field station', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.start('Alex');
    k.story!.goto('prolog', 'p9b');
    k.setEra('1789');
    k.teleport(1216, -1180, 180);
    k.step(2);
    k.story!.caught('pack', 9000);
  });
  await expect(page.getByTestId('story-curtain')).toHaveClass(/kqs-down/);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SCREENS}/story-caught.png` });
  // the curtain runs on game time: nothing happens until the loop steps (9 s hold)
  expect(await page.evaluate(() => window.kq!.story!.state().era)).toBe('1789');
  await page.evaluate(() => window.kq!.step(9 * 60 + 5));
  expect(await page.evaluate(() => window.kq!.story!.state().era)).toBe('today');
  const p = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
  expect(Math.hypot(p.x - 760, p.z + 902)).toBeLessThan(5);
  // resumed at the checkpoint beat (p10: back at the station at dusk; the prologue's 1789 visit is over)
  expect(await page.evaluate(() => window.kq!.story!.state().beat)).toBe('p10');

  // a timed choice in the burning hall (chapter 3): field-book modal with a fuse
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('k3', 'k3_3');
    k.setEra('1793-07');
    k.teleport(1266, -1129, 0);
    k.step(4);
  });
  await expect(page.getByTestId('story-choice')).toBeVisible({ timeout: 20_000 });
  await shot(page, 'choice');
  await page.getByTestId('choice-2').click();
  expect(await page.evaluate(() => window.kq!.state().flags['flag.k3_objekt'])).toBe('uhr');
  expect(errors).toEqual([]);
});

test('story: ending, epilogue and credits', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.start('Alex');
    k.story!.goto('enden');
    k.state();
    k.ctx.state.update((s) => {
      s.flags['flag.k1_lohn'] = 'will_nicht';
      s.flags['flag.k3_objekt'] = 'uhr';
    });
    k.step(2);
    k.story!.flush();
    k.step(2);
  });
  await expect(page.getByTestId('ending')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(300);
  await shot(page, 'ending-choice');
  await page.getByTestId('ending-museum').click();
  await page.getByRole('button', { name: 'Ja', exact: true }).click();
  await expect(page.getByTestId('ending-next')).toBeVisible();
  await shot(page, 'ending-scene');
  await page.getByTestId('ending-next').click();
  await expect(page.getByTestId('epilogue')).toBeVisible();
  await shot(page, 'epilogue');
  await page.getByTestId('ending-credits').click();
  await expect(page.getByTestId('credits')).toBeVisible();
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${SCREENS}/story-credits.png` });
  await page.getByTestId('credits-back').click();
  await page.evaluate(() => window.kq!.step(4));
  const st = await page.evaluate(() => ({ story: window.kq!.story!.state(), flags: window.kq!.state().flags }));
  expect(st.story.ending).toBe('museum');
  expect(st.story.finished).toBe(true);
  expect(st.flags['flag.end']).toBe('museum');
  expect(errors).toEqual([]);
});
