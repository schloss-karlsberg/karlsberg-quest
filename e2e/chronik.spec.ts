import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

/**
 * Chronik and Journal (Action-RPG rework, docs/ACTION-RPG.md §8.4 / §12): clue markers + examine
 * cards, relief finds behind the scan modes, echoes (hold E), nothing lost when caught; the
 * Journal that replaced the deduction board: J opens it, the tabs are keyboard-reachable,
 * clue facts land in its codex, the Pinnwand at the field station opens it. No board, no blanks,
 * no noun selection, no batches, no hint ladder.
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
  await page.waitForFunction(() => window.kq?.chronik !== undefined && window.kq?.quests !== undefined, null, { timeout: 120_000 });
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

  test('journal: J opens it, the tabs are keyboard-reachable, clue facts land in the codex; no board', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    // a clue with a codex fact: examined in the world, its card goes to the journal's codex
    await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('today');
      k.setScanMode(0);
      k.teleport(1150, -1129, 100, -20);
      k.step(20);
    });
    await page.evaluate(() => window.kq!.screenshotReady());
    await expect.poll(() => page.evaluate(() => { window.kq!.step(2); return window.kq!.chronik!.target(); }), { timeout: 30_000 }).toBe('ct.clue.lageplan');
    await page.evaluate(() => window.kq!.press('KeyE', 2));
    await expect(page.getByTestId('chronik-card')).toBeVisible();
    // the card no longer lists nouns ("Neu im Feldbuch") — no word inventory for the player
    await expect(page.getByTestId('chronik-card')).not.toContainText('Neu im Feldbuch');
    await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
    const facts = await page.evaluate(() => window.kq!.state().codex.facts);

    // J opens the journal on its first tab
    await page.evaluate(() => window.kq!.press('KeyJ', 1));
    const journal = page.getByTestId('journal');
    await expect(journal).toBeVisible();
    await expect(page.getByTestId('journal-tab-quests')).toHaveAttribute('aria-selected', 'true');
    expect(await events(page, 'chronik:opened')).toHaveLength(1);
    await expect(page.locator('.ck-board')).toHaveCount(0);
    await expect(page.getByTestId('chronik-check')).toHaveCount(0);
    await shot(page, 'journal');

    // keyboard: → / ← move between tabs, digits jump, focus stays inside (Tab cycles)
    await page.getByTestId('journal-tab-quests').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('journal-tab-codex')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('journal-tab-codex')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('journal-tab-sets')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('journal-tab-codex')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Digit3');
    await expect(page.getByTestId('journal-panel-sets')).toBeVisible();
    await page.keyboard.press('Digit2');
    await expect(page.getByTestId('journal-panel-codex')).toBeVisible();
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="journal"]'))).toBe(true);

    // the codex: the examined clue's facts are there, with confidence and label
    for (const f of facts) await expect(page.getByTestId(`codex-card-${f}`)).toBeVisible();
    if (facts[0]) {
      await page.getByTestId(`codex-card-${facts[0]}`).click();
      await expect(page.getByTestId('codex-detail')).toHaveAttribute('data-fact', facts[0]);
      await expect(page.getByTestId('codex-detail').locator('.kqq-conf')).toHaveText(/^[DINU]$/);
    }
    await shot(page, 'journal-codex');

    // J closes and opens again (Tab is the lock-on now, docs/ACTION-RPG.md §3), Esc closes
    await page.keyboard.press('KeyJ');
    await expect(journal).toBeHidden();
    expect(await events(page, 'chronik:closed')).toHaveLength(1);
    await page.evaluate(() => window.kq!.press('KeyJ', 1));
    await expect(journal).toBeVisible();
    await expect(page.getByTestId('journal-tab-codex')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
    await expect(journal).toBeHidden();
    // the old hooks open the journal too
    await page.evaluate(() => window.kq!.chronik!.open());
    await expect(journal).toBeVisible();
    expect(await page.evaluate(() => window.kq!.chronik!.isOpen())).toBe(true);
    await page.evaluate(() => window.kq!.chronik!.close());
    await expect(journal).toBeHidden();
    // no case batches, no hints from Laub any more
    expect(await events(page, 'chronik:batch')).toEqual([]);
    expect(((await events(page, 'dialogue:say')) as { id?: string }[]).filter((d) => /hint/.test(d.id ?? ''))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('journal: the Pinnwand at the field station opens it and returns to the hub', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    await page.waitForFunction(() => !!window.kq?.story && !!window.kq?.quests, null, { timeout: 180_000 });
    await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('today');
      k.teleport(760, -905, 0);
      k.step(3);
      k.ctx.ui.modals.closeAll();
      k.story!.hub(true);
    });
    await expect(page.getByTestId('hub')).toBeVisible();
    await page.getByTestId('hub-chronik').click();
    await expect(page.getByTestId('journal')).toBeVisible();
    await expect(page.getByTestId('hub')).toBeHidden();
    await expect(page.locator('.ck-board')).toHaveCount(0);
    await shot(page, 'pinnwand-journal');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('journal')).toBeHidden();
    await expect(page.getByTestId('hub')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
