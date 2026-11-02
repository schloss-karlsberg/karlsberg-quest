import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

/**
 * Chronik: clue markers + examine cards, relief finds behind the scan modes, echoes (hold E),
 * the board (batch of three, drag & drop, click-select, gentle marks, present-day rule), the
 * codex, Laub's hints, loss on capture and the save round trip.
 * Screenshots: test-results/screens/chronik-*.png. `?placeholder` forces the test pack
 * (content/test/chronik-test.pack.json) even once real content exists.
 */
const SCREENS = 'test-results/screens';
mkdirSync(SCREENS, { recursive: true });
const URL = './?notitle&nosave&fresh&manual&placeholder';
const CASE = 'ct.case.vermessung';

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
  await page.waitForFunction(() => window.kq?.chronik !== undefined, null, { timeout: 120_000 });
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

    // --- caught: everything since the last confirmation is gone
    const lost = await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('today');
      k.chronik!.caught();
      return { inv: k.state().inventory, since: k.chronik!.slice().since };
    });
    expect(lost.inv.clues).toEqual([]);
    expect(lost.inv.nouns).toEqual([]);
    expect(lost.since).toEqual({ clues: [], nouns: [], facts: [] });
    const lostEv = (await events(page, 'chronik:lost')) as { clues: string[] }[];
    expect(lostEv[0]?.clues.sort()).toEqual(['ct.clue.lageplan', 'ct.echo.diener']);

    expect(errors).toEqual([]);
  });

  test('board: batch of three, drag & drop, gentle marks, hints, codex, save', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('today');
      k.teleport(1150, -1129, 100, -10);
      k.chronik!.grantAll();
      k.press('KeyJ', 1);
    });
    const board = page.locator('.ck-board');
    await expect(board).toBeVisible();
    expect((await events(page, 'chronik:opened')).length).toBe(1);
    await page.locator(`.ck-case-tab[data-case="${CASE}"]`).click();
    await expect(page.locator(`.ck-page[data-case="${CASE}"]`)).toBeVisible();
    const check = page.getByTestId('chronik-check');
    const msg = page.getByTestId('chronik-msg');
    await expect(check).toBeDisabled();

    // three entries, one wrong: nothing is confirmed
    await page.evaluate((c) => {
      const k = window.kq!.chronik!;
      k.fill(c, 'p1', 'wo', 'ct.n.ehrenhof');
      k.fill(c, 'p2', 'wo', 'ct.n.galerie');
      k.fill(c, 'p3', 'was', 'ct.n.hohlweg');
    }, CASE);
    await expect(check).toBeEnabled();
    await check.click({ force: true });
    await expect(msg).toContainText('Mindestens eine Angabe stimmt nicht');
    await shot(page, 'board-wrong');
    expect(await events(page, 'chronik:batch')).toEqual([{ caseId: CASE, correct: false, confirmed: [] }]);
    expect(await page.evaluate((c) => window.kq!.state().chronik[c]?.confirmed, CASE)).toEqual([]);
    await expect(page.locator('.ck-entry .tick')).toHaveCount(0);

    // gentle mode shows which entries are right
    await page.evaluate(() => window.kq!.ctx.settings.update((d) => void (d.gentleMode = true), 'gentleMode'));
    await page.evaluate((c) => window.kq!.chronik!.check(c), CASE);
    await expect(page.locator('.ck-entry .tick')).toHaveCount(2);
    await expect(page.locator('.ck-entry[data-entry="p1"] .tick')).toBeVisible();
    await page.evaluate(() => window.kq!.ctx.settings.update((d) => void (d.gentleMode = false), 'gentleMode'));

    // drag the right noun into the wrong blank
    const noun = page.locator('.ck-noun[data-noun="ct.n.orangerie"]');
    const slot = page.locator('.ck-slot[data-entry="p2"]');
    await noun.scrollIntoViewIfNeeded();
    await slot.scrollIntoViewIfNeeded();
    const a = (await noun.boundingBox())!;
    const b = (await slot.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + 30, a.y - 40, { steps: 4 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
    await expect(page.locator('.ck-drag')).toBeVisible();
    await page.mouse.up();
    await expect(slot).toHaveAttribute('data-noun', 'ct.n.orangerie');

    // present-day rule: confirmation only today
    await page.evaluate(() => window.kq!.setEra('1789'));
    const blocked = await page.evaluate((c) => window.kq!.chronik!.check(c), CASE);
    expect(blocked).toMatchObject({ blocked: true, confirmed: [] });
    await page.evaluate(() => window.kq!.setEra('today'));

    await check.click({ force: true });
    await expect(msg).toContainText('Bestätigt');
    await expect(page.locator('.ck-stamp')).toHaveCount(3);
    expect(await page.evaluate((c) => window.kq!.state().chronik[c]?.confirmed, CASE)).toEqual(['p1', 'p2', 'p3']);
    const unlocked = ((await events(page, 'codex:unlocked')) as { factId: string }[]).map((e) => e.factId);
    expect(unlocked).toEqual(expect.arrayContaining(['ct.cx.01', 'ct.cx.40', 'ct.rm.04']));
    await page.evaluate(() => document.querySelector('.ck-page-wrap')?.scrollTo(0, 0));
    await page.waitForTimeout(800); // stamps settle
    await shot(page, 'board-confirmed');

    // a reading by click-select: noun first, then the blank; stored as reading + flag, never confirmed
    const wild = page.locator('.ck-noun[data-noun="ct.n.wild"]');
    await wild.scrollIntoViewIfNeeded();
    await wild.click();
    await expect(wild).toHaveAttribute('aria-pressed', 'true');
    const reading = page.locator('.ck-slot[data-entry="p7"]');
    await reading.scrollIntoViewIfNeeded();
    await reading.click();
    const st = await page.evaluate(() => window.kq!.state());
    expect(st.chronik[CASE]?.readings.p7).toEqual({ wer: 'ct.n.wild' });
    expect(st.flags[`reading.${CASE}.p7`]).toBe('ct.n.wild');

    // Laub: hint 1 after being stuck, then "Laub fragen" repeats it
    await page.evaluate((c) => window.kq!.chronik!.stuck(c, 250), CASE);
    await page.evaluate(() => window.kq!.screenshotReady());
    const note = page.getByTestId('chronik-laub-note');
    await expect(note).toContainText('Ein Geometer schaut zuerst');
    const says = (await events(page, 'dialogue:say')) as { speaker: string; id: string }[];
    expect(says.some((s) => s.speaker === 'laub' && s.id === 'ct.hint.1')).toBe(true);
    // asked after half of the next delay, Laub gives hint 2 early
    await page.getByTestId('chronik-ask').click({ force: true });
    await expect(note).toContainText('Der Lageplan kennt die Namen');

    // finish the case: the rest in one batch
    await page.evaluate((c) => window.kq!.chronik!.solve(c, 3), CASE);
    await check.click({ force: true });
    await expect(page.locator('.ck-stamp')).toHaveCount(6);
    expect(await events(page, 'chronik:case-complete')).toEqual([{ caseId: CASE }]);

    // codex: legend, cards, FIKTION, relief patterns
    await page.locator('.ck-tab[data-tab="codex"]').click();
    await expect(page.locator('.ck-legend')).toContainText('belegt');
    await expect(page.locator('.ck-cx[data-fact="ct.cx.01"]')).toBeVisible();
    await expect(page.locator('.ck-cx[data-fact="ct.cx.laub"]')).toContainText('Fiktion');
    await shot(page, 'codex');
    await page.getByTestId('codex-relief').click();
    await page.locator('.ck-cx[data-fact="ct.rm.02"]').click();
    await expect(page.getByTestId('codex-detail')).toContainText('Ringwall');
    await shot(page, 'codex-relief');

    // close (J) and the save round trip
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('codex-detail')).toBeHidden();
    await page.keyboard.press('KeyJ');
    await expect(board).toBeHidden();
    expect((await events(page, 'chronik:closed')).length).toBe(1);
    const saved = await page.evaluate((c) => {
      const k = window.kq!;
      const sm = k.ctx.save;
      sm.enabled = true;
      sm.save('e2e-chronik', 'test');
      const raw = JSON.parse(localStorage.getItem('kq.save.v1.e2e-chronik') ?? '{}');
      k.chronik!.caught(); // nothing at risk any more after the last confirmation
      const loaded = sm.load('e2e-chronik');
      sm.delete('e2e-chronik');
      sm.enabled = false;
      const s = k.state();
      return {
        raw: raw.chronik?.[c]?.confirmed?.length,
        rawSlice: !!raw.systems?.chronik,
        loaded,
        confirmed: s.chronik[c]?.confirmed.length,
        reading: s.chronik[c]?.readings.p7,
        given: k.chronik!.slice().hints[c]?.given,
      };
    }, CASE);
    expect(saved).toEqual({ raw: 6, rawSlice: true, loaded: true, confirmed: 6, reading: { wer: 'ct.n.wild' }, given: ['ct.hint.1', 'ct.hint.2'] });

    expect(errors).toEqual([]);
  });
});
