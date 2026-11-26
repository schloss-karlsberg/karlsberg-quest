import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { openPause, waitForHooks } from './helpers/pause';

/**
 * Chronik and Codex (docs/ACTION-RPG.md §8.4 / §12): world clues, relief and echoes, and facts
 * in Codex. The clue card, Pause and the Pinnwand all lead there.
 * Screenshots: test-results/screens/chronik-*.png. `?placeholder` forces the test pack
 * (content/test/chronik-test.pack.json) even once real content exists.
 */
const SCREENS = 'test-results/screens';
mkdirSync(SCREENS, { recursive: true });
const URL = './?notitle&nosave&fresh&manual&placeholder';

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

async function boot(page: Page): Promise<void> {
  await page.goto(URL);
  await waitForHooks(page, ['chronik', 'quests', 'story', 'travel'], 120_000);
  // record every event the Chronik emits or listens to
  await page.evaluate(() => {
    const w = window as unknown as { kqEvents: [string, unknown][] };
    w.kqEvents = [];
    const names = [
      'clue:found',
      'noun:learned',
      'codex:unlocked',
      'echo:start',
      'echo:end',
      'echo:play',
      'chronik:opened',
      'chronik:closed',
      'chronik:fill',
      'chronik:batch',
      'chronik:case-complete',
      'chronik:lost',
      'dialogue:say',
    ];
    const ev = window.kq!.ctx.events as unknown as { on(n: string, f: (p: unknown) => void): unknown };
    for (const n of names) ev.on(n, (p) => w.kqEvents.push([n, p]));
  });
}

const events = (page: Page, name: string) =>
  page.evaluate((name) => (window as unknown as { kqEvents: [string, unknown][] }).kqEvents.filter(([n]) => n === name).map(([, p]) => p), name);

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${SCREENS}/chronik-${name}.png`, timeout: 150_000 });
}

test.describe('chronik', () => {
  test.setTimeout(900_000);

  test('world: markers, examine card, relief scan, lantern, echo, capture', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);

    // --- object clue at the survey station: marker, prompt, E opens the card
    await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('today');
      k.setScanMode(0);
      k.teleport(1150, -1129, 100, -20);
      k.step(20);
    });
    await page.evaluate(() => window.kq!.screenshotReady());
    const near = await page.evaluate(() => ({ target: window.kq!.chronik!.target(), markers: window.kq!.chronik!.markers() }));
    expect(near.target).toBe('ct.clue.lageplan');
    expect(near.markers.find((m) => m.id === 'ct.clue.lageplan')?.status).toBe('available');
    await expect(page.locator('.kq-prompt')).toContainText('Untersuchen');
    await shot(page, 'world');

    await page.evaluate(() => window.kq!.press('KeyE', 2));
    const card = page.getByTestId('chronik-card');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-clue', 'ct.clue.lageplan');
    await expect(card).toContainText('Ehrenhof');
    await shot(page, 'card');
    expect(await events(page, 'clue:found')).toEqual([{ id: 'ct.clue.lageplan', kind: 'document' }]);
    expect((await events(page, 'noun:learned')).length).toBe(8);
    await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());

    // --- relief finds only show up in the right Relief-Blick mode
    const relief = await page.evaluate(() => {
      const k = window.kq!;
      k.teleport(1157, -1222, 45, -26);
      const before = k.chronik!.status('ct.clue.hohlweg');
      k.setScanMode(1);
      const scan1 = k.chronik!.status('ct.clue.hohlweg');
      k.setScanMode(2);
      k.step(30);
      return { before, scan1, scan2: k.chronik!.status('ct.clue.hohlweg') };
    });
    expect(relief).toEqual({ before: 'needs-scan', scan1: 'needs-scan', scan2: 'available' });
    await page.evaluate(() => window.kq!.screenshotReady());
    await page.evaluate(() => window.kq!.step(2));
    expect((await page.evaluate(() => window.kq!.chronik!.markers())).some((m) => m.id === 'ct.clue.hohlweg' && m.vis > 0)).toBe(true);
    await shot(page, 'relief');
    await page.evaluate(() => window.kq!.setScanMode(0));

    // --- lantern-only find glints until the lantern is lit (1793, night)
    const lantern = await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('1793-02');
      return k.chronik!.status('ct.clue.wachbuch');
    });
    expect(lantern).toBe('needs-lantern');

    // --- echo: hold E in the 1789 Ehrenhof
    await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('1789');
      k.teleport(1214, -1113, 90, 4);
      k.step(10);
    });
    await expect(page.locator('.kq-prompt')).toContainText('Lauschen');
    await page.evaluate(() => window.kq!.press('KeyE', 60)); // one second held
    expect(await events(page, 'echo:start')).toEqual([{ id: 'ct.echo.diener' }]);
    await page.evaluate(() => {
      window.kq!.chronik!.advanceEcho(4.5);
      window.kq!.step(1);
    });
    await expect(page.locator('.ck-memory-label')).toBeVisible();
    await expect(page.locator('.ck-memory-label')).toContainText('Fiktion');
    await expect(page.locator('.kq-subtitles')).not.toBeEmpty();
    await shot(page, 'echo');
    await page.evaluate(() => window.kq!.chronik!.advanceEcho(60));
    expect(await events(page, 'echo:end')).toEqual([{ id: 'ct.echo.diener' }]);
    await expect(card).toHaveAttribute('data-clue', 'ct.echo.diener');
    await expect(card).toContainText('Serenissimus');
    await shot(page, 'echo-card');
    await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());

    // --- caught: nothing is lost any more (docs/ACTION-RPG.md §12)
    const kept = await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('today');
      k.chronik!.caught();
      k.step(2);
      return k.state().inventory.clues;
    });
    expect(kept.sort()).toEqual(['ct.clue.lageplan', 'ct.echo.diener']);
    expect(await events(page, 'chronik:lost')).toEqual([]);

    expect(errors).toEqual([]);
  });

  test('Codex opens from a clue or Pause and returns focus on Back and Escape', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('today');
      k.setScanMode(0);
      k.teleport(1144, -1124, 100, -20);
      k.step(20);
    });
    await expect.poll(() => page.evaluate(() => {
      window.kq!.step(2);
      return window.kq!.chronik!.target();
    }), { timeout: 30_000 }).toBe('ct.clue.laubblatt');
    await page.keyboard.press('KeyE');
    await page.evaluate(() => window.kq!.step(1));
    const card = page.getByTestId('chronik-card');
    await expect(card).toContainText('Neu im Codex');
    await page.getByRole('button', { name: 'Codex öffnen' }).click();
    const codex = page.getByTestId('page-codex');
    await expect(card).toBeHidden();
    await expect(codex).toBeVisible();
    const fact = page.getByTestId('codex-card-ct.cx.laub');
    await expect(fact).toBeVisible();
    expect(await events(page, 'chronik:opened')).toHaveLength(1);
    await page.keyboard.press('Escape');
    await expect(codex).toBeHidden();
    expect(await events(page, 'chronik:closed')).toHaveLength(1);

    await page.keyboard.press('KeyJ');
    await page.evaluate(() => window.kq!.step(1));
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await openPause(page);
    const pause = page.getByTestId('pause-menu');
    const entry = pause.getByTestId('pause-codex');
    await entry.focus();
    await page.keyboard.press('Enter');
    await expect(codex).toBeVisible();
    const back = codex.getByRole('button', { name: 'Zurück', exact: true });
    const close = codex.getByRole('button', { name: 'Schließen', exact: true });
    await back.focus();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(back).toBeFocused();
    await fact.click();
    await expect(page.getByTestId('codex-detail')).toHaveAttribute('data-fact', 'ct.cx.laub');
    await expect(page.getByTestId('codex-detail').locator('.kqq-conf')).toHaveText('U');
    await shot(page, 'codex');

    await back.click();
    await expect(codex).toBeHidden();
    await expect(pause).toBeVisible();
    await expect(entry).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(codex).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(codex).toBeHidden();
    await expect(entry).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(pause).toBeHidden();

    await page.evaluate(() => window.kq!.chronik!.open());
    await expect(codex).toBeVisible();
    expect(await page.evaluate(() => window.kq!.chronik!.isOpen())).toBe(true);
    await page.evaluate(() => window.kq!.chronik!.close());
    await expect(codex).toBeHidden();
    await expect(page.locator('.ck-board')).toHaveCount(0);
    await expect(page.getByTestId('chronik-check')).toHaveCount(0);
    expect(await events(page, 'chronik:batch')).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Karte opens from M or Pause and Back only closes the map', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const k = window.kq!;
      k.setMapMix(0);
      k.ctx.state.mutable.flags['map.compare'] = false;
    });
    await page.keyboard.press('KeyM');
    await page.evaluate(() => window.kq!.step(1));
    const map = page.getByTestId('page-karte');
    await expect(map.getByTestId('travel-map-canvas')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(map).toBeHidden();
    await openPause(page);
    const entry = page.getByTestId('pause-karte');
    await entry.click();
    await expect(map.getByTestId('travel-map-canvas')).toHaveCount(1);
    await page.keyboard.press('Digit1');
    await map.getByRole('button', { name: 'Zurück', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(map).toBeHidden();
    await expect(entry).toBeFocused();
  });
});
