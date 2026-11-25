import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { SAVE_KEY } from '../src/core/save';
import { openTourHub, throughTour } from './helpers/tour';
import { openPause, waitForHooks } from './helpers/pause';

/**
 * Story feature: new-game flow, dialogue presenter, home at the Quelle (day/night), hub overlay,
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
  await waitForHooks(page, ['story', 'party']);
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

test('story: new game flow (warning → name → tour map) starts the tour', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./?nosave&fresh');
  const start = page.getByTestId('title-new');
  await expect(start).toBeEnabled({ timeout: 180_000 });
  await expect(start).toHaveText('Neues Spiel');
  await start.click();
  await expect(page.getByTestId('content-warning')).toBeVisible();
  await expect(page.getByTestId('content-warning')).toContainText('16');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENS}/story-warning.png` });
  await page.getByTestId('warning-accept').click();
  const name = page.getByTestId('player-name');
  await expect(name).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dein Name' })).toBeVisible();
  await name.fill('Mara');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENS}/story-name.png` });
  await page.getByTestId('name-confirm').click();
  const map = page.getByTestId('tour-map');
  const stops = ['Karlsberger Hof', 'Felsenpfad', 'Weiher', 'Karlsbergquelle'];
  await expect(map.getByRole('img', { name: stops.join(' → ') })).toBeVisible();
  await expect(map.locator('[data-stop]')).toHaveText(stops);
  const tourStart = map.getByTestId('start-tour');
  await expect(tourStart).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/story-tour-map.png` });
  await tourStart.click();
  await expect(page.getByTestId('title')).toBeHidden({ timeout: 30_000 });
  const s = await page.evaluate(() => window.kq!.story!.state());
  expect(s.active).toBe(true);
  expect(s.chapter).toBe('tour');
  expect(s.beat).toBe('t1');
  expect(s.name).toBe('Mara');
  // the tour starts at the Wanderparkplatz (its checkpoint), with its own title card, once
  const p = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
  expect(Math.hypot(p.x - 529, p.z + 777)).toBeLessThan(5);
  await expect(page.getByTestId('story-card')).toContainText('Die Führung');
  expect(await page.evaluate(() => window.kq!.state().flags['combat.disabled'])).toBe(true);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SCREENS}/story-tour-card.png` });
  expect(errors).toEqual([]);
});

test('story: save from Pause and the bench, cancel overwrite, then continue', async ({ page }) => {
  await page.goto('./?notitle&fresh&manual&q=low');
  await waitForHooks(page, ['story', 'progression']);
  await page.evaluate(() => {
    const k = window.kq!;
    k.progression!.grant('item.balsam', 1, true);
    k.ctx.state.mutable.flags['test.pauseSaved'] = true;
  });
  await openPause(page);
  const save = page.getByTestId('pause-save');
  await expect(save).toHaveText('Speichern');
  await save.click();
  await expect(page.getByText('Spielstand gespeichert.', { exact: true })).toBeVisible();
  const savedFlags = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).flags, SAVE_KEY('auto'));
  expect((await savedFlags())['test.pauseSaved']).toBe(true);
  await page.keyboard.press('Escape');
  await expect(save).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeHidden();

  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1059.3, -833.1, 50);
    k.ctx.state.mutable.flags['test.benchSaved'] = true;
    k.story!.hub(true);
  });
  const bench = page.getByTestId('hub-bench');
  await bench.click();
  await expect(bench).toContainText('Ausgeruht. Spielstand gespeichert.');
  expect((await savedFlags())['test.benchSaved']).toBe(true);

  await page.goto('./?manual&q=low');
  const start = page.getByTestId('title-new');
  const resume = page.getByTestId('title-continue');
  await expect(start).toBeEnabled({ timeout: 180_000 });
  await expect(start).toHaveText('Neues Spiel');
  await expect(resume).toBeEnabled();
  await expect(resume).toHaveText('Weiter');
  await expect(resume.locator('svg')).toHaveCount(0);
  await start.click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText('Der bisherige Spielstand wird überschrieben. Wirklich neu beginnen?');
  await confirm.getByRole('button', { name: 'Nein', exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByTestId('content-warning')).toBeHidden();
  await resume.click();
  await expect(page.getByTestId('title')).toBeHidden();
  await waitForHooks(page, ['story', 'progression']);
  expect(await page.evaluate(() => {
    const k = window.kq!;
    const flags = k.state().flags;
    return { pause: flags['test.pauseSaved'], bench: flags['test.benchSaved'], balsam: k.progression!.state().inventory['item.balsam'] };
  })).toEqual({ pause: true, bench: true, balsam: 1 });
});

test('story: home at the Quelle by day and night, dialogue portraits', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.start('Alex');
    k.story!.goto('k1');
    k.step(380);
  });
  const waitForLine = (lineId: string) => page.waitForFunction((id) => {
    const k = window.kq!;
    if (k.story!.state().dialogue?.id === id) return true;
    k.story!.finishTyping();
    k.step(30);
    return k.story!.state().dialogue?.id === id;
  }, lineId, { timeout: 90_000 });

  // Keep the chapter timeline and let the quest's initial radio line finish first.
  await waitForLine('marlene.k1.morgen.quelle');
  await typed(page);
  await expect(page.getByTestId('dialogue')).toHaveAttribute('data-speaker', 'marlene');
  await expect(page.getByTestId('dialogue')).toContainText('Alex');
  await shot(page, 'dialogue-marlene');

  await waitForLine('laub.k1.morgen.quelle');
  await typed(page);
  await expect(page.getByTestId('dialogue')).toHaveAttribute('data-portrait', 'compass');
  await shot(page, 'dialogue-laub');

  // home at the Quelle, day and night
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.look('day');
    k.teleport(1053, -828, 51, -3);
    k.step(2);
  });
  await shot(page, 'home-day');
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.look('night');
    k.step(2);
  });
  await page.waitForTimeout(600);
  await shot(page, 'home-night');
  expect(errors).toEqual([]);
});

test('story: hub overlay, objective and Bussole', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await waitForHooks(page, ['walk']);
  await page.evaluate(() => window.kq!.story!.start('Alex'));
  await openTourHub(page);
  await shot(page, 'hub');
  await page.getByTestId('hub-chronik').click();
  await expect(page.getByTestId('page-codex')).toBeVisible();
  await page.getByTestId('page-codex').getByRole('button', { name: 'Zurück', exact: true }).click();
  await expect(page.getByTestId('hub-chronik')).toBeFocused();
  await page.getByTestId('hub-shelf').click();
  // the Regal in RPG terms (round 3): level, quests, spirits — no "Begriffe" / "Chronik-Einträge"
  await expect(page.getByTestId('hub')).toContainText('Aufgaben erledigt');
  await expect(page.getByTestId('hub')).not.toContainText('Begriffe gefunden');
  await page.screenshot({ path: `${SCREENS}/fun-quests-regal.png` });
  await page.getByTestId('hub-back').click();
  await page.getByTestId('hub-drawer').click();
  await page.evaluate(() => {
    if (document.querySelector('[data-testid="chronik-card"]')) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  });
  await page.getByTestId('hub-phone').click();
  await page.waitForTimeout(1500);
  await shot(page, 'hub-phone');
  await page.getByTestId('hub-map').click();
  await expect(page.getByTestId('chapter-tour')).toBeVisible();
  await expect(page.getByTestId('chapter-prolog')).toHaveCount(0);
  await shot(page, 'hub-map');
  await page.getByTestId('hub-continue').click();

  await waitForHooks(page, ['quelle', 'fx', 'quests']);
  await throughTour(page);
  expect(await page.evaluate(() => window.kq!.state().inventory.items)).toContain('item.bussole');
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.flush();
    k.teleport(1052, -833.1, 90, 0);
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

test('story: caught by the pack → home at the Quelle', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.start('Alex');
    k.story!.goto('k1', 'k1_0b');
    k.story!.flush();
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
  expect(Math.hypot(p.x - 1059.3, p.z + 833.1)).toBeLessThan(5);
  expect(await page.evaluate(() => window.kq!.story!.state().beat)).toBe('k1_0b');
  expect(await page.evaluate(() => window.kq!.story!.state().objective?.id)).toBe('k1.zurueck-q');

  // the choice in the burning hall (chapter 3): four things in the room, E on one (the fuse: 40 s
  // after the offer, Hanne takes you by the arm; chapter-k3.spec.ts)
  await waitForHooks(page, ['interiors', 'npc', 'fx']);
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('k3', 'k3_3');
    k.setEra('1793-07');
    k.step(4);
    k.ctx.events.emit('threat:configure', { kind: 'fire', active: true, seconds: 300 });
    k.ctx.state.mutable.inventory.clues.push('clue.k3.fackel');
    k.interiors!.enter('B01.2.og-festsaal', { u: 0.5, v: 0.3 });
    k.step(6);
    for (let i = 0; i < 80 && !k.interiors!.festsaal().active; i++) k.step(30);
    k.step(120);
  });
  expect(await page.evaluate(() => window.kq!.interiors!.festsaal().spots.length)).toBe(4);
  await shot(page, 'choice');
  await page.evaluate(() => {
    const k = window.kq!;
    k.interiors!.festsaalTake('uhr');
    k.step(6);
  });
  expect(await page.evaluate(() => window.kq!.state().flags['flag.k3_objekt'])).toBe('uhr');
  expect(errors).toEqual([]);
});

test('story: ending, epilogue and credits', async ({ page }) => {
  const errors = trackErrors(page);
  await page.route('**/assets/LICENSES.json', async (route) => {
    const response = await route.fetch();
    const manifest = await response.json();
    manifest.assets.push({ author: 'Testautor A, Testautor B', source: 'https://polyhaven.com/a/test', licence: 'CC0-1.0' });
    await route.fulfill({ response, json: manifest });
  });
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.start('Alex');
    k.story!.goto('enden');
    k.state();
    k.ctx.state.update((s) => {
      s.flags['quest.q.k1.hundenamen'] = 'done';
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
  // the ending is staged in the engine first (endings/stage.ts): skip it
  await page.getByTestId('ending-stage-skip').click();
  await expect(page.getByTestId('ending-next')).toBeVisible();
  await shot(page, 'ending-scene');
  await page.getByTestId('ending-next').click();
  await expect(page.getByTestId('epilogue')).toBeVisible();
  await shot(page, 'epilogue');
  await page.getByTestId('ending-credits').click();
  // the party (bible 06-enden §8): Gerold's speech, then the credits strip over the party
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 90 && k.party!.state().credits !== 'playing'; i++) k.step(60);
  });
  const track = page.getByTestId('party-credits-track');
  await expect(track).toContainText('Sebastian Heußer');
  await expect(track).toContainText('Testautor A, Testautor B');
  await expect.poll(() => page.evaluate(() => window.kq!.ctx.input.locked)).toBe(false);
  await page.getByTestId('party-credits-skip').click();
  await expect(page.getByTestId('party-credits')).toHaveCount(0);
  await page.evaluate(() => window.kq!.step(4));
  const st = await page.evaluate(() => ({ story: window.kq!.story!.state(), flags: window.kq!.state().flags }));
  expect(st.story.ending).toBe('museum');
  expect(st.story.finished).toBe(true);
  expect(st.flags['flag.end']).toBe('museum');

  await page.evaluate(() => window.kq!.story!.credits());
  const fallback = page.getByTestId('credits');
  await expect(fallback).toContainText('Sebastian Heußer');
  await expect(fallback).toContainText('Testautor A, Testautor B');
  await page.keyboard.press('Escape');
  await expect(fallback).toHaveCount(0);
  expect(errors).toEqual([]);
});
