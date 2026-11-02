import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

/**
 * Integration: the four feature systems (story, fx, hunt, chronik) working together along the
 * prologue, headless and deterministic (`?manual`, driven through window.kq):
 *
 *   new game (title flow) → field station hub → Pinnwand opens the Chronik → objective + Bussole
 *   → relief scan (fx pulse) → story clue + Chronik clue → Q at the anchor (story) → fx shift
 *   → 1789 → echo (Chronik subtitles only, no story duplicates) → threat:configure → hunt chase
 *   → caught (hunt hands over to the story curtain) → back at the station, today, beat checkpoint
 *   → hub → Chronik board → batch of three confirmed with the test pack → Laub's hint via the
 *   story's dialogue presenter.
 *
 * Content: the story's prologue + the Chronik test pack (content/test, forced with ?placeholder).
 * Screenshots: test-results/screens/int-*.png.
 */
const SCREENS = 'test-results/screens';
mkdirSync(SCREENS, { recursive: true });
const URL = './?nosave&fresh&manual&placeholder';
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

type Ev = [string, unknown];

/** Record every cross-feature event (contracts.ts) from now on. */
async function recordEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { intEvents: [string, unknown][] };
    w.intEvents = [];
    const quiet = new Set(['player:step', 'hunt:alert', 'lantern:oil', 'fire:progress', 'oblivion:progress']);
    window.kq!.ctx.events.onAny((name, payload) => {
      if (!quiet.has(name)) w.intEvents.push([name, structuredClone(payload)]);
    });
  });
}

const events = (page: Page, name?: string) =>
  page.evaluate((name) => (window as unknown as { intEvents: [string, unknown][] }).intEvents.filter(([n]) => !name || n === name), name) as Promise<Ev[]>;
const payloads = async (page: Page, name: string) => (await events(page, name)).map(([, p]) => p);

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SCREENS}/int-${name}.png`, timeout: 150_000 });
}

const story = (page: Page) => page.evaluate(() => window.kq!.story!.state());
const pos = (page: Page) => page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));

test('integration: the prologue across story, fx, hunt and chronik', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = trackErrors(page);

  // ---- 1. new game: title → content warning → name → light the lantern ------------------------
  await page.goto(URL);
  const start = page.getByTestId('title-new');
  await expect(start).toBeEnabled({ timeout: 180_000 });
  await page.waitForFunction(() => !!window.kq?.story && !!window.kq?.chronik && !!window.kq?.hunt && !!window.kq?.fx, null, { timeout: 180_000 });
  await recordEvents(page);
  await start.click();
  await page.getByTestId('warning-accept').click();
  await page.getByTestId('player-name').fill('Alex');
  await page.getByTestId('name-confirm').click();
  await page.getByTestId('light-lantern').click();
  await expect(page.getByTestId('title')).toBeHidden({ timeout: 30_000 });
  await page.evaluate(() => window.kq!.step(30));
  let s = await story(page);
  expect(s).toMatchObject({ active: true, chapter: 'prolog', beat: 'p1', name: 'Alex', era: 'today' });
  expect(await payloads(page, 'story:chapter')).toEqual([{ id: 'prolog' }]);
  await expect(page.getByTestId('story-card')).toContainText('Vermessung');
  await page.evaluate(() => window.kq!.teleport(757.5, -899, 4, -3));
  await shot(page, '01-new-game');

  // ---- 2. field station: hub:enter, E opens the hub, the Pinnwand opens the Chronik -------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.flush();
    k.story!.finishTyping();
    k.teleport(760, -905, 0);
    k.step(4);
  });
  s = await story(page);
  expect(s.inHub).toBe(true);
  expect((await events(page, 'hub:enter')).length).toBeGreaterThan(0);
  await page.evaluate(() => window.kq!.press('KeyE', 2));
  await expect(page.getByTestId('hub')).toBeVisible();
  await shot(page, '02-hub');
  await page.getByTestId('hub-drawer').click();
  await page.getByTestId('hub-chronik').click();
  // story → chronik:open → the Chronik closes the hub and opens its board
  await expect(page.locator('.ck-board')).toBeVisible();
  await expect(page.getByTestId('hub')).toBeHidden();
  expect(await payloads(page, 'hub:use')).toEqual(expect.arrayContaining([{ item: 'drawer' }, { item: 'chronik' }]));
  expect((await events(page, 'chronik:open')).length).toBe(1);
  expect((await events(page, 'chronik:opened')).length).toBe(1);
  await shot(page, '03-hub-chronik');
  await page.evaluate(() => window.kq!.chronik!.close());
  await expect(page.locator('.ck-board')).toBeHidden();

  // ---- 3. objective: p1 done (Laub's leaf + Lageplan) → p2, the dam ---------------------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.step(10);
    k.story!.flush();
    k.step(4);
  });
  s = await story(page);
  expect(s.beat).toBe('p2');
  expect(s.objective).toMatchObject({ id: 'damm', x: 819, z: -875 });
  expect(await payloads(page, 'objective:set')).toContainEqual(expect.objectContaining({ id: 'damm', x: 819, z: -875 }));
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(780, -860, 90, -2);
    k.step(4);
  });
  await expect(page.getByTestId('objective')).toHaveClass(/kqs-show/);
  await expect(page.getByTestId('objective')).toContainText('Damm');
  await expect(page.getByTestId('bussole')).toHaveClass(/kqs-show/);
  await shot(page, '04-objective');

  // ---- 4. relief scan at the wall remains: story clue + fx scan pulse ------------------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.finishTyping();
    k.teleport(813, -903, 200, -18);
    k.step(4);
    k.press('Digit2', 2);
    k.step(4);
  });
  expect(await payloads(page, 'scan:mode')).toContainEqual({ mode: 2 });
  await page.evaluate(() => window.kq!.fx!.pulse(2, 0.9));
  s = await story(page);
  expect(s.beat).toBe('p3');
  expect(await page.evaluate(() => window.kq!.state().inventory.clues)).toContain('clue.p.mauerrest');
  expect(await payloads(page, 'clue:found')).toContainEqual({ id: 'clue.p.mauerrest', kind: 'relief' });
  await shot(page, '05-scan');
  await page.evaluate(() => window.kq!.fx!.freeze(false));

  // ---- 5. a Chronik clue: the hollow way only shows in Relief-Blick 2, E examines it ---------
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('prolog', 'p5');
    k.teleport(1166, -1232, 135, -26);
    k.setScanMode(2);
    k.step(30);
  });
  expect(await page.evaluate(() => window.kq!.chronik!.status('ct.clue.hohlweg'))).toBe('available');
  await expect(page.locator('.kq-prompt')).toContainText('Untersuchen');
  await page.evaluate(() => window.kq!.press('KeyE', 2));
  await expect(page.getByTestId('chronik-card')).toHaveAttribute('data-clue', 'ct.clue.hohlweg');
  expect(await payloads(page, 'clue:found')).toContainEqual({ id: 'ct.clue.hohlweg', kind: 'relief' });
  await shot(page, '06-clue');
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.ui.modals.closeAll();
    k.setScanMode(0);
    k.step(4);
  });
  // the same spot is the story's hollow way (scan 2 + place): beat p5 completes
  expect((await story(page)).beat).toBe('p6');

  // ---- 6. Q at the anchor (story owns the key) → shift:request → fx transition → 1789 ---------
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('prolog', 'p9');
    k.story!.flush();
    k.teleport(1150, -1118, 88, 4);
    k.step(4);
    k.press('KeyQ', 1); // outside the anchor radius: "Die Nadel steht nicht hier."
  });
  expect(await payloads(page, 'shift:request')).toEqual([]);
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1188, -1118, 88, 4);
    k.step(4);
  });
  await expect(page.locator('.kq-prompt')).toContainText('Zeitwechsel');
  await page.evaluate(() => {
    const k = window.kq!;
    k.press('KeyQ', 1);
    k.fx!.shiftAt(2.55);
  });
  expect(await payloads(page, 'shift:request')).toEqual([{ to: '1789', reason: 'anchor' }]);
  expect(await page.evaluate(() => window.kq!.fx!.state().shift)).toMatchObject({ active: true, from: 'today', to: '1789' });
  await shot(page, '07-shift-rise');
  await page.evaluate(() => {
    const k = window.kq!;
    k.fx!.shiftAt(3.6); // past the end: finishes
    k.fx!.freeze(false);
    k.step(6);
  });
  // (onAny listeners run after the direct ones, so the request is logged after fx's nested shift:begin)
  const shiftLog = (await events(page)).filter(([n]) => (n.startsWith('shift:') && n !== 'shift:request') || n === 'era:change').map(([n]) => n);
  expect(shiftLog).toEqual(['shift:begin', 'era:change', 'shift:midpoint', 'shift:done']);
  s = await story(page);
  expect(s.era).toBe('1789');
  expect(s.beat).toBe('p9b');
  expect(await page.evaluate(() => window.kq!.state().meta.shifts)).toBe(1);
  // the prologue's first visit is a 90 s oil timer, not the chapter-4 Steinfraß
  expect(await page.evaluate(() => window.kq!.fx!.state().oblivion.active)).toBe(false);
  await shot(page, '08-1789');

  // ---- 7. an echo: the Chronik plays its lines, the story does not repeat them ---------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.flush();
    k.story!.finishTyping();
    k.teleport(1214, -1113, 90, 4);
    k.step(10);
  });
  await expect(page.locator('.kq-prompt')).toContainText('Lauschen');
  await page.evaluate(() => {
    const k = window.kq!;
    k.press('KeyE', 60);
    k.chronik!.advanceEcho(4.5);
    k.step(1);
  });
  expect(await payloads(page, 'echo:start')).toEqual([{ id: 'ct.echo.diener' }]);
  await expect(page.locator('.ck-memory-label')).toBeVisible();
  const echoSays = ((await payloads(page, 'dialogue:say')) as { id?: string }[]).filter((p) => p.id?.startsWith('ct.echo.'));
  expect(echoSays).toEqual([]);
  // the story's presenter waits out of sight while the echo speaks
  await expect(page.getByTestId('dialogue')).toBeHidden();
  await shot(page, '09-echo');
  await page.evaluate(() => {
    const k = window.kq!;
    k.chronik!.advanceEcho(60);
    k.ctx.ui.modals.closeAll();
    k.step(2);
  });

  // ---- 8. the pack: threat:configure (as the story's chapter beats send it) → hunt ------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1452, -640, 330, 0); // the avenue north-east of the palace
    k.step(2);
    const p = k.ctx.player.position;
    k.ctx.events.emit('threat:configure', { kind: 'pack', active: true, intensity: 0.7, center: { x: p.x, z: p.z }, radius: 140, seed: 11 } as never);
    k.step(2);
    [
      [30, 6],
      [16, -10],
      [19, 14],
      [23, -24],
      [26, 28],
    ].forEach(([d, a], i) => k.hunt!.placeInView(i, d!, a!));
    k.lantern!.toggle(true);
    k.step(90);
  });
  expect((await payloads(page, 'hunt:start')).length).toBe(1);
  const chase = await page.evaluate(() => window.kq!.hunt!.state());
  expect(chase?.active).toBe(true);
  expect(chase?.state).toBe('chasing');
  await shot(page, '10-hunt');

  // ---- 9. caught: the hunt's rush, then the story's curtain (one title, not three) ------------
  const caughtAt = await page.evaluate(() => {
    const k = window.kq!;
    let i = 0;
    for (; i < 900 && k.hunt!.state() && !k.hunt!.state()!.caught; i++) k.step(1);
    if (k.hunt!.state() && !k.hunt!.state()!.caught) k.hunt!.catch();
    k.step(50); // ≈ 0.8 s into the rush
    return i;
  });
  expect(caughtAt).toBeLessThan(900);
  await shot(page, '11-rush');
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 120 && !(window as unknown as { intEvents: [string, unknown][] }).intEvents.some(([n]) => n === 'player:caught'); i++) k.step(1);
  });
  expect(await payloads(page, 'player:caught')).toEqual([{ by: 'pack' }]);
  await expect(page.getByTestId('story-curtain')).toHaveClass(/kqs-down/);
  await expect(page.getByTestId('story-curtain')).toContainText('Die Meute hat dich gestellt');
  // hunt and fx leave the words to the story
  const huntTitle = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.kq-hunt-caught h2')!).opacity));
  expect(huntTitle).toBe(0);
  // the curtain stays down 2.4 s (real time): capture it without waiting for extra frames
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SCREENS}/int-12-caught.png` });
  await page.waitForFunction(() => window.kq!.story!.state().era === 'today', null, { timeout: 60_000 });
  await page.evaluate(() => window.kq!.step(6));
  const back = await page.evaluate(() => ({
    story: window.kq!.story!.state(),
    hunt: window.kq!.hunt!.state(),
    caughtT: document.querySelector<HTMLElement>('.kq-hunt-caught')!.style.opacity,
    frozen: window.kq!.ctx.player.frozen,
  }));
  expect(back.story.beat).toBe('p9'); // checkpoint of p9b
  expect(back.story.inHub).toBe(true);
  expect(back.hunt).toBeNull();
  expect(back.caughtT).toBe('0');
  expect(back.frozen).toBe(false);
  const p = await pos(page);
  expect(Math.hypot(p.x - 760, p.z + 902)).toBeLessThan(6);
  expect(await payloads(page, 'hunt:end')).toContainEqual({ reason: 'caught' });
  // the Chronik drops unconfirmed finds (not in gentle mode)
  expect(((await payloads(page, 'chronik:lost')) as { clues: string[] }[])[0]?.clues).toEqual(expect.arrayContaining(['ct.clue.hohlweg']));
  await page.waitForTimeout(2600); // the curtain lifts
  await page.evaluate(() => window.kq!.teleport(757.5, -899, 4, -3));
  await shot(page, '13-station');

  // ---- 10. hub → Chronik board → a batch of three confirmed (test pack) -----------------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.ui.modals.closeAll();
    k.teleport(760, -905, 0);
    k.step(2);
    k.press('KeyE', 2);
  });
  await expect(page.getByTestId('hub')).toBeVisible();
  await page.getByTestId('hub-chronik').click();
  const board = page.locator('.ck-board');
  await expect(board).toBeVisible();
  await page.evaluate(() => window.kq!.chronik!.grantAll());
  await page.locator(`.ck-case-tab[data-case="${CASE}"]`).click({ force: true });
  await expect(page.locator(`.ck-page[data-case="${CASE}"]`)).toBeVisible();
  await page.evaluate((c) => {
    const k = window.kq!.chronik!;
    k.fill(c, 'p1', 'wo', 'ct.n.ehrenhof');
    k.fill(c, 'p2', 'wo', 'ct.n.orangerie');
    k.fill(c, 'p3', 'was', 'ct.n.hohlweg');
  }, CASE);
  const check = page.getByTestId('chronik-check');
  await expect(check).toBeEnabled();
  await check.click({ force: true });
  await expect(page.getByTestId('chronik-msg')).toContainText('Bestätigt');
  expect(await page.evaluate((c) => window.kq!.state().chronik[c]?.confirmed, CASE)).toEqual(['p1', 'p2', 'p3']);
  expect(await payloads(page, 'chronik:batch')).toEqual([{ caseId: CASE, correct: true, confirmed: ['p1', 'p2', 'p3'] }]);
  await page.evaluate(() => document.querySelector('.ck-page-wrap')?.scrollTo(0, 0));
  await page.waitForTimeout(800);
  await shot(page, '14-confirmed');

  // ---- 11. Laub's hint: Chronik → dialogue:say → the story's presenter (compass portrait) -----
  await page.evaluate((c) => {
    const k = window.kq!;
    k.chronik!.close();
    k.ctx.ui.modals.closeAll();
    k.teleport(757.5, -899, 4, -3);
    k.chronik!.solve(c, 3); // fill the next three (unchecked) so the case stays open
    k.chronik!.stuck(c, 250);
    k.step(4);
  }, CASE);
  await page.waitForFunction(() => window.kq!.story!.state().dialogue?.speaker === 'laub', null, { timeout: 20_000 });
  await page.evaluate(() => window.kq!.story!.finishTyping());
  await expect(page.getByTestId('dialogue')).toHaveAttribute('data-portrait', 'compass');
  const hint = ((await payloads(page, 'dialogue:say')) as { speaker: string; id?: string }[]).filter((p) => p.speaker === 'laub' && p.id?.startsWith('ct.hint.'));
  expect(hint.length).toBeGreaterThan(0);
  // no second copy of the line as a plain subtitle
  const hintText = ((await payloads(page, 'dialogue:say')) as { speaker: string; text: string; id?: string }[]).find((p) => p.id?.startsWith('ct.hint.'))!.text;
  expect(await page.locator('.kq-subtitles').innerText()).not.toContain(hintText.slice(0, 24));
  await shot(page, '15-laub-hint');

  expect(errors).toEqual([]);
});
