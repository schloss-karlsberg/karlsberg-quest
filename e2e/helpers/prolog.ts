import { type Page, expect } from '@playwright/test';
import { type PlayOptions, SCREENS } from './common';

/**
 * The prologue ("Vermessung", bible 01-prolog.md), played headless through window.kq from the
 * first frame after the title flow to the chapter-1 title card:
 *
 *   p1 field station (Pinnwand, Regal, Schublade: cards, Bussole) → p2 dam (Relief 1/2, E on the
 *   wall remains) → p3 Orangerie (Geisterblick, VAT, Laub speaks) → p4 Ehrenhof (E, map overlay)
 *   → p5 hollow way → p6 ice cellar → p7 point cloud + Seite eins → p8 first Chronik batch → p9
 *   the first shift (the palace rises) → p9b 1789 (echo, howl, 90 s oil, the pack) → Q hold back
 *   → p10 dusk, the rest of the case → p11 night, horn, Feldbett → "Kapitel 1 · Der Hof".
 *
 * Used by e2e/chapter-prolog.spec.ts and e2e/campaign.spec.ts. Screenshots: ch-prolog-*.png
 */
export const CASE = 'case.p';
let SHOTS = true;

export async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  // software WebGL on a loaded machine: a frame can stall; one retry, then go on (pictures are
  // for review, the assertions carry the test)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.evaluate(() => window.kq!.screenshotReady());
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${SCREENS}/ch-prolog-${name}.png`, timeout: 90_000 });
      return;
    } catch (e) {
      if (attempt === 1) console.warn(`screenshot ${name} skipped: ${(e as Error).message.split('\n')[0]}`);
    }
  }
}

export const story = (page: Page) => page.evaluate(() => window.kq!.story!.state());
export const beat = async (page: Page) => (await story(page)).beat;
export const clues = (page: Page) => page.evaluate(() => window.kq!.state().inventory.clues);

/**
 * Let game time pass (seconds) like a player who reads every card and closes it: open cards and
 * other modals are closed between steps, the dialogue keeps running.
 */
export async function play(page: Page, seconds: number, opts: { keepModals?: boolean } = {}): Promise<void> {
  await page.evaluate(
    ({ seconds, keep }) => {
      const k = window.kq!;
      for (let t = 0; t < seconds; t += 0.5) {
        if (!keep) k.ctx.ui.modals.closeAll();
        k.step(30);
      }
    },
    { seconds, keep: !!opts.keepModals },
  );
}

/** Step until the story reaches `id` (or `seconds` of game time pass). */
export async function until(page: Page, id: string, seconds = 60): Promise<string> {
  return page.evaluate(
    ({ id, seconds }) => {
      const k = window.kq!;
      for (let t = 0; t < seconds && k.story!.state().beat !== id; t += 0.5) {
        k.ctx.ui.modals.closeAll();
        k.step(30);
      }
      return k.story!.state().beat as string;
    },
    { id, seconds },
  );
}

/** Seen Laub / Marlene lines (ids spoken by the story or the pack runner). */
export const said = (page: Page) => page.evaluate(() => window.kq!.story!.state().said as string[]);

export async function newGame(page: Page, name: string, shots = false, url = './?nosave&fresh&manual'): Promise<void> {
  await page.goto(url);
  const start = page.getByTestId('title-new');
  await expect(start).toBeEnabled({ timeout: 180_000 });
  await page.waitForFunction(() => !!window.kq?.story && !!window.kq?.chronik && !!window.kq?.hunt && !!window.kq?.fx, null, { timeout: 180_000 });
  await start.click();
  await expect(page.getByTestId('content-warning')).toBeVisible();
  await expect(page.getByTestId('content-warning')).toContainText('16');
  if (shots) await shot(page, '00a-warning');
  await page.getByTestId('warning-accept').click();
  await page.getByTestId('player-name').fill(name);
  if (shots) await shot(page, '00b-name');
  await page.getByTestId('name-confirm').click();
  await expect(page.getByTestId('light-lantern')).toBeVisible();
  if (shots) await shot(page, '00c-lantern');
  await page.getByTestId('light-lantern').click();
  await expect(page.getByTestId('title')).toBeHidden({ timeout: 30_000 });
}

/** The chapter's main playthrough (moved here from chapter-prolog.spec.ts so the campaign can chain it). */
export async function playProlog(page: Page, o: PlayOptions = {}): Promise<void> {
  SHOTS = o.shots ?? true;
  // ---- p1: the field station ------------------------------------------------------------------
  let s = await story(page);
  expect(s).toMatchObject({ active: true, chapter: 'prolog', beat: 'p1', name: 'Mara', era: 'today' });
  await expect(page.getByTestId('story-card')).toContainText('Vermessung');
  await page.evaluate(() => window.kq!.step(70));
  await shot(page, '01-card');
  await o.at?.('prolog:card');
  // Laub is silent until the Orangerie: no bark, no hint, no compass portrait yet
  expect(await page.evaluate(() => window.kq!.state().flags['laub.silent'])).toBe(true);
  await page.evaluate(() => window.kq!.step(200));
  await expect(page.getByTestId('dialogue')).toHaveAttribute('data-speaker', 'marlene', { timeout: 10_000 });
  await page.evaluate(() => window.kq!.story!.finishTyping());
  await expect(page.getByTestId('dialogue')).toContainText('Mara');
  await expect(page.locator('.kq-prompt, [data-testid="story-prompt"]').first()).toBeVisible();
  await shot(page, '02-station-marlene');
  await play(page, 18);
  s = await story(page);
  expect(s.objective).toMatchObject({ id: 'station' });

  // walk to the door: the hub (E). The other chapters' station notes are not there yet.
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(760, -905, 0);
    k.step(4);
  });
  expect((await story(page)).inHub).toBe(true);
  expect(await page.evaluate(() => window.kq!.chronik!.target())).toBeNull();
  await page.evaluate(() => window.kq!.press('KeyE', 2));
  await expect(page.getByTestId('hub')).toBeVisible();
  await shot(page, '03-hub');
  // Pinnwand: two cards, stacked on the hub (no Chronik board yet: it opens in p8)
  await page.getByTestId('hub-chronik').click();
  await expect(page.getByTestId('chronik-card').last()).toBeVisible();
  await shot(page, '04-card-pinnwand');
  expect(await clues(page)).toEqual(expect.arrayContaining(['clue.p.messtischblatt', 'clue.p.lageplan']));
  // read on (Escape closes the top card): the hub is still there underneath
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('chronik-card')).toBeHidden();
  await expect(page.getByTestId('hub')).toBeVisible();
  await page.getByTestId('hub-shelf').click();
  await expect(page.getByTestId('chronik-card')).toHaveAttribute('data-clue', 'clue.p.handbuch');
  await page.keyboard.press('Escape');
  await page.getByTestId('hub-back').click();
  await page.getByTestId('hub-drawer').click();
  await expect(page.getByTestId('chronik-card')).toHaveAttribute('data-clue', 'clue.p.laubblatt');
  await shot(page, '05-card-laubblatt');
  const inv = await page.evaluate(() => window.kq!.state().inventory);
  expect(inv.items).toContain('item.bussole');
  expect(inv.clues).toEqual(expect.arrayContaining(['clue.p.lageplan', 'clue.p.handbuch', 'clue.p.laubblatt']));
  // the Ehrenhof noun from the Lageplan is in the inventory: the case can be filled later
  expect(inv.nouns).toEqual(expect.arrayContaining(['n.ehrenhof', 'n.orangerie', 'n.hohlweg', 'n.eiskeller', 'n.jahr_1840']));
  await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
  expect(await until(page, 'p2', 10)).toBe('p2');

  // ---- p2: the dam -------------------------------------------------------------------------------
  await play(page, 4);
  s = await story(page);
  expect(s.objective).toMatchObject({ id: 'damm', x: 819, z: -875 });
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(782, -872, 90, -6);
    k.setScanMode(1);
    k.step(60);
  });
  await shot(page, '06-relief1-dam');
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(812, -880, 180, -18);
    k.step(30);
  });
  await play(page, 6);
  expect((await story(page)).objective).toMatchObject({ id: 'mauerrest' });
  // Relief 2 and E: the straight edges at the foot of the dam
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(813, -892, 180, -22);
    k.setScanMode(2);
    k.step(30);
  });
  expect(await page.evaluate(() => window.kq!.chronik!.status('clue.p.mauerrest'))).toBe('available');
  expect(await page.evaluate(() => window.kq!.chronik!.target())).toBe('clue.p.mauerrest');
  await shot(page, '07-relief2-mauerrest');
  await page.evaluate(() => window.kq!.press('KeyE', 2));
  await expect(page.getByTestId('chronik-card')).toHaveAttribute('data-clue', 'clue.p.mauerrest');
  expect(await until(page, 'p3', 10)).toBe('p3');

  // ---- p3: up the hill, the Geisterblick, VAT at the Orangerie wall ---------------------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.setScanMode(0);
    k.teleport(1120, -950, 90, -4);
    k.step(4);
  });
  await play(page, 40); // the walk up the hill (minutes on foot, one on the Geisterblick)
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1186, -962, 90, -6); // 50 m off: the wall before the find
    k.step(10);
    k.setScanMode(3);
    k.step(30);
  });
  await shot(page, '08-vat-orangerie');
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1222, -966, 90, -10);
    k.step(10);
  });
  expect(await until(page, 'p4', 6)).toBe('p4');
  expect(await clues(page)).toContain('clue.p.orangeriemauer');
  // Laub speaks for the first time
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.ui.modals.closeAll();
    k.setScanMode(0);
    k.step(150);
  });
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 900 && k.story!.state().dialogue?.speaker !== 'laub'; i++) k.step(10);
    k.story!.finishTyping();
    k.teleport(1205, -966, 90, -6);
    k.step(1);
  });
  await expect(page.getByTestId('dialogue')).toHaveAttribute('data-portrait', 'compass');
  await shot(page, '09-laub-speaks');
  expect(await page.evaluate(() => window.kq!.state().flags['laub.silent'])).toBeFalsy();

  // ---- p4: the Ehrenhof, the 1840 map ------------------------------------------------------------
  await play(page, 20);
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1200, -1110, 90, -12);
    k.setScanMode(2);
    k.step(30);
  });
  expect(await page.evaluate(() => window.kq!.chronik!.status('clue.p.ehrenhof'))).toBe('available');
  await page.evaluate(() => window.kq!.press('KeyE', 2));
  await expect(page.getByTestId('chronik-card')).toHaveAttribute('data-clue', 'clue.p.ehrenhof');
  await play(page, 6);
  await page.evaluate(() => {
    const k = window.kq!;
    k.setScanMode(0);
    k.teleport(1185, -1112, 90, -8);
    k.press('KeyM', 2);
    k.step(60);
  });
  expect(await page.evaluate(() => window.kq!.ctx.world.mapMix)).toBeGreaterThan(0.5);
  await shot(page, '10a-kartenvergleich');
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.ui.modals.closeAll();
    k.teleport(1150, -1112, 90, -14);
    k.step(30);
  });
  await shot(page, '10b-map-1840');
  expect(await until(page, 'p5', 8)).toBe('p5');
  expect(await clues(page)).toContain('clue.p.kartenvergleich');
  await page.evaluate(() => {
    const k = window.kq!;
    k.press('KeyM', 2);
    k.setMapMix(0);
  });

  // ---- p5: the hollow way ------------------------------------------------------------------------
  await play(page, 10);
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1166, -1222, 180, -20);
    k.setScanMode(2);
    k.step(30);
  });
  expect(await page.evaluate(() => window.kq!.chronik!.status('clue.p.hohlweg'))).toBe('available');
  await shot(page, '11-hohlweg');
  await page.evaluate(() => window.kq!.press('KeyE', 2));
  await expect(page.getByTestId('chronik-card')).toHaveAttribute('data-clue', 'clue.p.hohlweg');
  expect(await until(page, 'p6', 6)).toBe('p6');

  // ---- p6: the ice cellar ------------------------------------------------------------------------
  await play(page, 6);
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1496, -1296, 90, -24);
    k.setScanMode(3);
    k.step(30);
  });
  expect(await page.evaluate(() => window.kq!.chronik!.status('clue.p.eiskeller'))).toBe('available');
  await shot(page, '12-eiskeller');
  await page.evaluate(() => window.kq!.press('KeyE', 2));
  await expect(page.getByTestId('chronik-card')).toHaveAttribute('data-clue', 'clue.p.eiskeller');
  expect(await until(page, 'p7', 6)).toBe('p7');

  // ---- p7: the point cloud, Seite eins -----------------------------------------------------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.ui.modals.closeAll();
    k.setScanMode(0);
    k.step(4);
  });
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 120 && !document.querySelector('[data-testid="chronik-card"][data-clue="clue.p.punktwolke"]'); i++) k.step(15);
  });
  await expect(page.getByTestId('chronik-card')).toHaveAttribute('data-clue', 'clue.p.punktwolke');
  await shot(page, '13-punktwolke');
  expect(await until(page, 'p8', 90)).toBe('p8');
  expect(await clues(page)).toContain('clue.p.seite_eins');
  expect(await said(page)).toEqual(expect.arrayContaining(['laub.p.punktwolke', 'kollege.p.punktwolke']));

  // ---- p8: the Chronik opens: three sentences, one batch ------------------------------------------
  // the Seite-eins card offers the Chronik itself; else Tab
  const fromCard = page.getByRole('button', { name: 'Chronik öffnen' });
  if (await fromCard.isVisible()) await fromCard.click();
  else
    await page.evaluate(() => {
      window.kq!.ctx.ui.modals.closeAll();
      window.kq!.press('Tab', 2);
    });
  await expect(page.locator('.ck-board')).toBeVisible();
  await page.locator(`.ck-case-tab[data-case="${CASE}"]`).click({ force: true });
  await expect(page.locator(`.ck-page[data-case="${CASE}"]`)).toBeVisible();
  await page.evaluate((c) => {
    const k = window.kq!.chronik!;
    k.fill(c, 'entry.p.1', 'wo', 'n.ehrenhof');
    k.fill(c, 'entry.p.2', 'wo', 'n.orangerie');
    k.fill(c, 'entry.p.3', 'was', 'n.hohlweg');
  }, CASE);
  await shot(page, '14-chronik-filled');
  const check = page.getByTestId('chronik-check');
  await expect(check).toBeEnabled();
  await check.click({ force: true });
  await expect(page.getByTestId('chronik-msg')).toContainText('Bestätigt');
  await shot(page, '15-chronik-confirmed');
  await page.evaluate(() => {
    const k = window.kq!;
    k.chronik!.close();
    k.ctx.ui.modals.closeAll();
  });
  expect(await until(page, 'p9', 4)).toBe('p9');

  // ---- p9: the first shift -----------------------------------------------------------------------
  await play(page, 20);
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1205, -1119, 90, 3);
    k.step(30);
  });
  await expect(page.locator('.kq-prompt').first()).toContainText('Zeitwechsel');
  await shot(page, '16-anchor-today');
  await page.evaluate(() => {
    const k = window.kq!;
    k.press('KeyQ', 1);
    k.fx!.shiftAt(2.6);
  });
  await shot(page, '17a-shift-rising');
  await page.evaluate(() => window.kq!.fx!.shiftAt(3.1));
  await shot(page, '17b-shift-rising');
  await page.evaluate(() => {
    const k = window.kq!;
    k.fx!.shiftAt(3.6);
    k.fx!.freeze(false);
    k.step(10);
  });
  s = await story(page);
  expect(s.era).toBe('1789');
  expect(s.beat).toBe('p9b');
  await page.evaluate(() => window.kq!.step(30));
  await shot(page, '18-1789-palace');
  expect(await page.evaluate(() => window.kq!.story!.meters())).toMatchObject({ oil: expect.anything() });

  // ---- p9b: the echo, the howl, the pack -------------------------------------------------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.step(60);
    k.chronik!.advanceEcho(3);
    k.step(2);
  });
  if (await page.evaluate(() => !!window.kq!.chronik!.echo().id)) await shot(page, '19-echo');
  await page.evaluate(() => {
    const k = window.kq!;
    k.chronik!.advanceEcho(60);
    k.ctx.ui.modals.closeAll();
    k.step(4);
  });
  // the howl (after the echo, at the latest after 44 s), then 40 s until the pack comes
  await page.evaluate(() => {
    const k = window.kq!;
    k.lantern!.toggle(false); // the player saves oil, as Laub says
    for (let i = 0; i < 120 && !k.state().flags['story.p.heulen']; i++) {
      k.ctx.ui.modals.closeAll();
      k.step(30);
    }
  });
  expect(await page.evaluate(() => window.kq!.state().flags['story.p.heulen'])).toBe(true);
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 100 && !k.hunt!.state(); i++) k.step(30);
  });
  const hunt = await page.evaluate(() => window.kq!.hunt!.state());
  expect(hunt?.active).toBe(true);
  // a gentle first pack: it searches, it is not on top of the player
  expect(hunt?.state).not.toBe('chasing');
  await page.evaluate(() => {
    const k = window.kq!;
    // lantern out, flat on the ground, the hounds searching down the slope (out of sight range)
    k.teleport(1222, -1121, 270, 0);
    k.press('KeyX', 2);
    k.step(30);
    k.hunt!.placeInView(0, 30, 4, false);
    k.hunt!.placeInView(1, 35, -12, false);
    k.hunt!.placeInView(2, 39, 15, false);
    k.step(6);
  });
  await shot(page, '20-meute');
  expect(await page.evaluate(() => window.kq!.hunt!.state()?.state)).not.toBe('chasing');
  // hold Q (the pack is not chasing yet): back to today, in place, at dusk
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1216, -1114, 180, 2);
    k.step(2);
    k.press('KeyQ', 90);
    k.fx!.shiftAt(3.6);
    k.fx!.freeze(false);
    k.step(20);
  });
  s = await story(page);
  expect(s.era).toBe('today');
  expect(s.beat).toBe('p10');
  expect(await page.evaluate(() => window.kq!.hunt!.state())).toBeNull();

  // ---- p10: dusk, back home, the rest of the case ------------------------------------------------
  await play(page, 6);
  await page.evaluate(() => window.kq!.teleport(1216, -1114, 250, 4));
  await page.evaluate(() => window.kq!.step(20));
  await shot(page, '21-dusk-ehrenhof');
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(757, -899, 10, -3);
    k.step(30);
  });
  await play(page, 10);
  expect((await story(page)).objective).toMatchObject({ id: 'chronik' });
  expect(await beat(page)).toBe('p10');
  await page.evaluate(() => {
    window.kq!.ctx.ui.modals.closeAll();
    window.kq!.press('Tab', 2);
  });
  await expect(page.locator('.ck-board')).toBeVisible();
  await page.locator(`.ck-case-tab[data-case="${CASE}"]`).click({ force: true });
  await page.evaluate((c) => {
    const k = window.kq!.chronik!;
    k.fill(c, 'entry.p.4', 'was', 'n.eiskeller');
    k.fill(c, 'entry.p.5', 'wann', 'n.jahr_1840');
    k.fill(c, 'entry.p.6', 'wieviel', 'n.versatz_50');
  }, CASE);
  await page.getByTestId('chronik-check').click({ force: true });
  await expect(page.getByTestId('chronik-msg')).toContainText('Bestätigt');
  await shot(page, '22-case-complete');
  await page.evaluate(() => {
    const k = window.kq!;
    k.chronik!.close();
    k.ctx.ui.modals.closeAll();
  });
  expect(await until(page, 'p11', 4)).toBe('p11');

  // ---- p11: night, the horn, the Feldbett -> chapter 1 -------------------------------------------
  // the laptop, the frost, the horn, then Laub (about half a minute)
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 180 && !(k.story!.state().said as string[]).includes('laub.p.ende'); i++) {
      k.ctx.ui.modals.closeAll();
      k.step(30);
    }
    k.story!.finishTyping();
    k.teleport(754, -899, 22, -3);
    k.step(2);
  });
  await shot(page, '23-night');
  expect(await said(page)).toEqual(expect.arrayContaining(['laptop.p.neu', 'laub.p.ende']));
  await play(page, 10);
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(760, -905, 0);
    k.step(4);
    k.press('KeyE', 2);
  });
  await expect(page.getByTestId('hub')).toBeVisible();
  await page.getByTestId('hub-bed').click();
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 60 && k.story!.state().chapter === 'prolog'; i++) {
      k.ctx.ui.modals.closeAll();
      k.step(30);
    }
  });
  s = await story(page);
  expect(s.chapter).toBe('k1');
  expect((await page.evaluate(() => window.kq!.state().flags)) as Record<string, unknown>).toBeTruthy();
  await expect(page.getByTestId('story-card')).toContainText('Der Hof');
  if (SHOTS) await page.screenshot({ path: `${SCREENS}/ch-prolog-24-kapitel1.png`, timeout: 90_000 }).catch(() => undefined);
  // the night's objective does not leak into chapter 1
  expect((await story(page)).objective).toBeFalsy();
}
