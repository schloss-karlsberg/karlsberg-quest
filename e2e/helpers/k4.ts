import { type Page, expect } from '@playwright/test';
import { type PlayOptions, SCREENS } from './common';

/**
 * Chapter 4 „Der Steinbruch" + the endings, played headless through window.kq (`?manual`):
 *
 *   station at night (Marlene's note, Laub's confession) → Q at the valley entrance → 1796 (the
 *   carts echo) → the Westblick (Hohenburg, Merburg, the carts run backwards: a glimpse of 1789)
 *   → the Baumagazin (Soll, Peter, Pachtbrief, Matthes' stone, Jägersburg wood) → anchor B →
 *   Ehrenhof: the Steinfraß (anschlag, napoleon) → the Gräben → Standpunkt 17 (echo 1840,
 *   confession 2) → today: the pack drives you to the kennel → "Noch nicht" until the 2nd
 *   confirmation → the finale (lie flat + lantern, the hounds fade) → Jost and the horn → dawn at
 *   the station (photo, "nur Steine") → gaps ("Leer lassen") → the endings chapter → choice →
 *   scene → epilogue → credits.
 *
 * Every clue is found where the player stands (the Chronik's own target / E prompt), not by id.
 * Used by e2e/chapter-k4.spec.ts and e2e/campaign.spec.ts. Screenshots: test-results/screens/ch-k4-*.png
 */
let SHOTS = true;



export async function boot(page: Page): Promise<void> {
  await page.goto('./?notitle&nosave&fresh&manual');
  await page.waitForFunction(() => !!window.kq?.story && !!window.kq?.chronik && !!window.kq?.hunt && !!window.kq?.npc, null, { timeout: 180_000 });
  await recordEvents(page);
}

/** Record the bus (once per page load); every call starts a fresh list. */
export async function recordEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { k4Events: [string, unknown][] };
    const installed = Array.isArray(w.k4Events);
    w.k4Events = [];
    if (installed) return;
    const quiet = new Set(['player:step', 'hunt:alert', 'lantern:oil', 'fire:progress', 'oblivion:progress']);
    window.kq!.ctx.events.onAny((name, payload) => {
      if (!quiet.has(name)) w.k4Events.push([name, structuredClone(payload)]);
    });
  });
}

export const events = (page: Page, name: string) =>
  page.evaluate((name) => (window as unknown as { k4Events: [string, unknown][] }).k4Events.filter(([n]) => n === name).map(([, p]) => p), name);

export async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) {
    await page.evaluate(() => window.kq!.story!.finishTyping());
    return;
  }
  await page.evaluate(() => {
    window.kq!.story!.finishTyping();
    return window.kq!.screenshotReady();
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SCREENS}/ch-k4-${name}.png`, timeout: 150_000 });
}

/** Seconds of game time (60 Hz fixed steps), in chunks so the page stays responsive. */
export async function run(page: Page, seconds: number): Promise<void> {
  let left = Math.round(seconds * 60);
  while (left > 0) {
    const n = Math.min(600, left);
    await page.evaluate((n) => window.kq!.step(n), n);
    left -= n;
  }
}

/** `n` single steps, each with a render (frame-driven systems: Chronik markers/target, prompts). */
export async function frames(page: Page, n = 16): Promise<void> {
  await page.evaluate((n) => {
    for (let i = 0; i < n; i++) window.kq!.step(1);
  }, n);
}

/** Run until the presenter shows line `id` (or give up after `maxSeconds`). */
export async function untilLine(page: Page, id: string, maxSeconds = 40): Promise<boolean> {
  for (let t = 0; t < maxSeconds; t += 0.5) {
    if ((await page.evaluate(() => window.kq!.story!.state().dialogue?.id ?? null)) === id) return true;
    await run(page, 0.5);
  }
  return false;
}

/** Read every queued line (story presenter) without waiting for typing. */
export async function drainLines(page: Page, maxSeconds = 120): Promise<void> {
  for (let t = 0; t < maxSeconds; t += 2) {
    const busy = await page.evaluate(() => {
      const s = window.kq!.story!.state();
      return !!s.dialogue || s.pendingLines > 0 || s.scheduled > 0;
    });
    if (!busy) return;
    await run(page, 2);
  }
}

/** Era shifts run on real time (fx): finish a running one. */
export async function settleShift(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const active = await page.evaluate(() => window.kq!.fx!.state().shift.active);
    if (!active) return;
    await page.evaluate(() => window.kq!.fx!.shiftAt(3.6));
    await run(page, 0.3);
  }
}

export const story = (page: Page) => page.evaluate(() => window.kq!.story!.state());
export const beat = async (page: Page) => (await story(page)).beat;
export const has = (page: Page, clue: string) => page.evaluate((c) => window.kq!.state().inventory.clues.includes(c), clue);

/** Walk (teleport in short hops, ground-following) from the current spot to x/z. */
export async function walk(page: Page, x: number, z: number, hop = 6): Promise<void> {
  await page.evaluate(
    ({ x, z, hop }) => {
      const k = window.kq!;
      const p = k.ctx.player.position;
      const d = Math.hypot(x - p.x, z - p.z);
      const n = Math.max(1, Math.ceil(d / hop));
      const x0 = p.x;
      const z0 = p.z;
      const yaw = (Math.atan2(x - x0, -(z - z0)) * 180) / Math.PI;
      for (let i = 1; i <= n; i++) {
        k.teleport(x0 + ((x - x0) * i) / n, z0 + ((z - z0) * i) / n, yaw);
        k.step(30);
      }
    },
    { x, z, hop },
  );
}

/** Stand at x/z, check the Chronik offers `clue` there (marker + E), press E, close the card. */
export async function examineHere(page: Page, clue: string, x: number, z: number): Promise<void> {
  await page.evaluate(({ x, z }) => window.kq!.teleport(x, z), { x, z });
  await frames(page);
  const near = await page.evaluate(() => {
    const k = window.kq!;
    const p = k.ctx.player.position;
    return { t: k.chronik!.target(), x: p.x, z: p.z, at: k.ctx.content.cluesAt(p.x, p.z, k.ctx.era.current).map((c) => c.id) };
  });
  expect(near.t, JSON.stringify(near)).toBe(clue);
  await page.evaluate(() => window.kq!.press('KeyE', 2));
  await run(page, 0.3);
  const after = await page.evaluate((c) => {
    const k = window.kq!;
    return { has: k.state().inventory.clues.includes(c), status: k.chronik!.status(c), echo: k.chronik!.echo(), modals: k.ctx.ui.modals.count, beat: k.story!.state().beat };
  }, clue);
  expect(after.has, JSON.stringify(after)).toBe(true);
  await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
  await run(page, 0.3);
}

/** Hold E on an echo where the player stands; play it to the end. */
export async function listenHere(page: Page, clue: string): Promise<void> {
  expect(await page.evaluate((c) => window.kq!.chronik!.status(c), clue)).toBe('available');
  expect(await page.evaluate((c) => window.kq!.chronik!.listen(c), clue)).toBe(true);
  for (let i = 0; i < 20 && (await page.evaluate(() => window.kq!.chronik!.echo().id)); i++) {
    await page.evaluate(() => window.kq!.chronik!.advanceEcho(6));
    await run(page, 0.2);
  }
  await run(page, 0.5);
  await closeCards(page);
}

/** Close the clue card an echo leaves behind (the player clicks it away). */
export async function closeCards(page: Page): Promise<void> {
  await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
  await run(page, 0.2);
}

/** The chapter's main playthrough (moved here from chapter-k4.spec.ts so the campaign can chain it). */
export async function playK4(page: Page, o: PlayOptions = {}): Promise<void> {
  SHOTS = o.shots ?? true;
  await recordEvents(page);
  await o.at?.('k4:start');
  // ---- 4.0 station at night: Marlene's note ---------------------------------------------------
  let s = await story(page);
  expect(s.chapter).toBe('k4');
  expect(s.beat).toBe('k4_0');
  expect(s.era).toBe('today');
  await run(page, 4);
  await shot(page, '00-station-night');
  await examineHere(page, 'clue.k4.marlene', 760, -906);
  await run(page, 0.5);
  expect(await beat(page)).toBe('k4_1');
  await drainLines(page);
  const said = (await story(page)).said;
  expect(said).toContain('laub.k4.gestaendnis_1');

  // ---- 4.1 Q at the valley entrance → 1796 ----------------------------------------------------
  await walk(page, 497, -893, 12);
  await run(page, 1);
  await page.evaluate(() => window.kq!.press('KeyQ', 2));
  await run(page, 0.5);
  await settleShift(page);
  await run(page, 1);
  s = await story(page);
  expect(s.era).toBe('1796');
  expect(s.beat).toBe('k4_2');
  // the carts echo plays by itself
  for (let i = 0; i < 20 && !(await page.evaluate(() => window.kq!.chronik!.echo().id)); i++) await run(page, 1);
  expect(await page.evaluate(() => window.kq!.chronik!.echo().id)).toBe('clue.k4.karren');
  await page.evaluate(() => window.kq!.teleport(470, -903, 95, 0));
  await shot(page, '01-taleingang-1796');
  for (let i = 0; i < 12 && (await page.evaluate(() => window.kq!.chronik!.echo().id)); i++) {
    await page.evaluate(() => window.kq!.chronik!.advanceEcho(6));
    await run(page, 0.2);
  }
  await run(page, 1);
  await closeCards(page);
  expect(await has(page, 'clue.k4.karren')).toBe(true);
  expect(await beat(page)).toBe('k4_3');
  await drainLines(page);

  // ---- 4.2 the Westblick ---------------------------------------------------------------------
  await walk(page, 205, -900, 15);
  await run(page, 1);
  await examineHere(page, 'clue.k4.hohenburg', 200, -905);
  await page.evaluate(() => window.kq!.teleport(200, -905, 226, 2));
  expect(await untilLine(page, 'laub.k4.westblick')).toBe(true);
  await shot(page, '02-westblick-hohenburg');
  await examineHere(page, 'clue.k4.merburg', 198, -884);
  await page.evaluate(() => window.kq!.teleport(200, -905, 226, 2));
  await drainLines(page);
  expect(await page.evaluate(() => window.kq!.chronik!.status('echo.k4.rueckwaerts'))).toBe('available');
  await listenHere(page, 'echo.k4.rueckwaerts');
  await run(page, 1.5);
  await settleShift(page);
  await run(page, 1);
  s = await story(page);
  expect(s.beat).toBe('k4_4');
  expect(s.era).toBe('1789');
  expect(await untilLine(page, 'laub.k4.x.gerueste', 20)).toBe(true);
  await shot(page, '03-rueckwaerts-1789');
  await drainLines(page);
  await run(page, 3);
  await settleShift(page);
  await drainLines(page);
  expect((await story(page)).era).toBe('1796');
  expect(await page.evaluate(() => window.kq!.state().flags['flag.stein_3'])).toBeTruthy();

  // ---- 4.3 the Baumagazin --------------------------------------------------------------------
  await walk(page, 485, -838, 15);
  await run(page, 1);
  expect(await has(page, 'clue.k4.baumagazin')).toBe(true);
  const npcs = await page.evaluate(() => window.kq!.npc!.list().map((n) => `${n.npc}:${n.visible}`));
  expect(npcs).toEqual(expect.arrayContaining(['soll:true', 'peter:true']));
  await page.evaluate(() => window.kq!.teleport(484, -836, 95, -3));
  await drainLines(page);
  await shot(page, '04-baumagazin-hof');
  await examineHere(page, 'clue.k4.pacht', 495, -845.5);
  // Soll at his table
  await page.evaluate(() => window.kq!.teleport(494.5, -844, 143, -4));
  await run(page, 0.5);
  expect(await page.evaluate(() => window.kq!.npc!.state().near)).toBe('soll');
  await page.evaluate(() => window.kq!.press('KeyE', 2));
  await run(page, 0.5);
  expect(await page.evaluate(() => window.kq!.npc!.state().open)).toBe(true);
  await page.evaluate(() => window.kq!.npc!.drain());
  await shot(page, '05-soll');
  for (const topic of ['pacht', 'geld', 'raub', 'schuld', 'buch']) {
    expect(await page.evaluate((t) => window.kq!.npc!.ask(t), topic)).toBe(true);
    await page.evaluate(() => window.kq!.npc!.drain());
  }
  await page.evaluate(() => window.kq!.npc!.ask('bye'));
  await page.evaluate(() => window.kq!.npc!.drain());
  await run(page, 1);
  expect(await has(page, 'clue.k4.soll')).toBe(true);
  // Peter and his cart
  await page.evaluate(() => window.kq!.npc!.talk('peter'));
  await page.evaluate(() => window.kq!.npc!.drain());
  for (const topic of ['hanne', 'schuld', 'bye']) {
    await page.evaluate((t) => window.kq!.npc!.ask(t), topic);
    await page.evaluate(() => window.kq!.npc!.drain());
  }
  await run(page, 1);
  expect(await has(page, 'clue.k4.peter')).toBe(true);
  await examineHere(page, 'clue.k4.jaegersburg', 490, -834);
  await examineHere(page, 'clue.k4.stein_karren', 496.5, -823.5);
  await run(page, 1);
  expect(await beat(page)).toBe('k4_5');
  await drainLines(page);
  expect(await page.evaluate(() => window.kq!.state().flags['shift.x'])).toBe(1216);

  // ---- anchor B: Q back to today, then Q at the Ehrenhof → 1796 -------------------------------
  await page.evaluate(() => window.kq!.press('KeyQ', 90));
  await run(page, 0.5);
  await settleShift(page);
  await run(page, 1);
  expect((await story(page)).era).toBe('today');
  await page.evaluate(() => window.kq!.teleport(1216, -1100));
  await run(page, 1);
  await page.evaluate(() => window.kq!.press('KeyQ', 2));
  await run(page, 0.5);
  await settleShift(page);
  await run(page, 1);
  s = await story(page);
  expect(s.era).toBe('1796');
  expect(s.beat).toBe('k4_6');

  // ---- 4.4 the Steinfraß ---------------------------------------------------------------------
  await run(page, 20);
  const fx = await page.evaluate(() => window.kq!.fx!.state());
  expect(fx.oblivion.active).toBe(true);
  expect((await story(page)).meters.vergessen).toBeTruthy();
  await page.evaluate(() => window.kq!.teleport(1210, -1095, 200, 4));
  await shot(page, '06-steinfrass');
  await examineHere(page, 'clue.k4.anschlag', 1195, -1110.5);
  await run(page, 6);
  expect(await has(page, 'clue.k4.napoleon')).toBe(true);
  expect(await beat(page)).toBe('k4_7');
  await drainLines(page);

  // ---- 4.5 the Gräben --------------------------------------------------------------------------
  await examineHere(page, 'clue.k4.graben', 1238, -1180);
  expect(await beat(page)).toBe('k4_8');
  await drainLines(page);

  // ---- 4.6 Standpunkt 17 ------------------------------------------------------------------------
  await walk(page, 1380, -1470, 20);
  await run(page, 1);
  expect((await page.evaluate(() => window.kq!.fx!.state())).oblivion.active).toBe(false);
  await drainLines(page);
  await page.evaluate(() => window.kq!.teleport(1380, -1470, 135));
  await page.evaluate(() => window.kq!.chronik!.listen('clue.k4.laub_1840'));
  await page.evaluate(() => window.kq!.chronik!.advanceEcho(12));
  await run(page, 0.3);
  await shot(page, '07-brunnen-1840');
  await listenHere(page, 'clue.k4.laub_1840').catch(() => undefined);
  for (let i = 0; i < 12 && (await page.evaluate(() => window.kq!.chronik!.echo().id)); i++) {
    await page.evaluate(() => window.kq!.chronik!.advanceEcho(6));
    await run(page, 0.2);
  }
  await run(page, 1);
  await closeCards(page);
  expect(await has(page, 'clue.k4.laub_1840')).toBe(true);
  await drainLines(page);
  await run(page, 2);
  await settleShift(page);
  await run(page, 1);
  s = await story(page);
  expect(s.era).toBe('today');
  expect(s.beat).toBe('k4_9');
  expect(await page.evaluate(() => window.kq!.state().flags['chronik.noLoss'])).toBe(true);

  // ---- 4.7 the pack drives -----------------------------------------------------------------------
  await run(page, 3);
  const hs = await page.evaluate(() => window.kq!.hunt!.state());
  expect(hs?.active).toBe(true);
  expect((await page.evaluate(() => window.kq!.hunt!.mode()))?.mode).toBe('drive');
  await page.evaluate(() => window.kq!.teleport(1375, -1474, 270));
  await run(page, 6);
  await shot(page, '08-drive');
  for (const [x, z] of [
    [1300, -1472],
    [1240, -1494],
    [1200, -1530],
    [1214, -1566],
  ] as const) {
    await walk(page, x, z, 3);
  }
  await run(page, 2);
  expect(await events(page, 'hunt:goal')).toEqual([expect.objectContaining({ mode: 'drive' })]);
  await drainLines(page);
  expect((await story(page)).said).toEqual(expect.arrayContaining(['laub.k4.erkenntnis', 'laub.k4.herr', 'laub.k4.abgeblasen']));

  // ---- 4.8 not yet: the second confirmation ------------------------------------------------------
  s = await story(page);
  expect(s.beat).toBe('k4_10');
  expect(s.said).toContain('laub.k4.noch_nicht');
  expect(await page.evaluate(() => window.kq!.hunt!.state()?.active ?? false)).toBe(false);
  // everything for the six facts was found on the way: fill and confirm with the player's nouns
  const nouns = await page.evaluate(() => window.kq!.state().inventory.nouns);
  expect(nouns).toEqual(expect.arrayContaining(['n.vierzehn', 'n.9_millionen', 'n.abreissen', 'n.hohenburg', 'n.baumagazin', 'n.ausbruchgraben']));
  await page.evaluate(() => window.kq!.chronik!.open('case.k4'));
  await page.evaluate(() => {
    const c = window.kq!.chronik!;
    c.fill('case.k4', 'entry.k4.1', 'wieviel', 'n.vierzehn');
    c.fill('case.k4', 'entry.k4.2', 'wieviel', 'n.9_millionen');
    c.fill('case.k4', 'entry.k4.3', 'wie', 'n.abreissen');
  });
  expect((await page.evaluate(() => window.kq!.chronik!.check('case.k4')))?.correct).toBe(true);
  await page.evaluate(() => {
    const c = window.kq!.chronik!;
    c.fill('case.k4', 'entry.k4.4', 'wo', 'n.hohenburg');
    c.fill('case.k4', 'entry.k4.5', 'was', 'n.baumagazin');
    c.fill('case.k4', 'entry.k4.6', 'was', 'n.ausbruchgraben');
  });
  expect((await page.evaluate(() => window.kq!.chronik!.check('case.k4')))?.correct).toBe(true);
  await page.evaluate(() => window.kq!.chronik!.fill('case.k4', 'entry.k4.7', 'wer', 'n.r_steintraeger'));
  await run(page, 0.3);
  await shot(page, '09-chronik-steinbruch');
  await page.evaluate(() => window.kq!.chronik!.close());
  await run(page, 2);
  expect(['k4_11', 'k4_12']).toContain(await beat(page));
  await run(page, 2);

  // ---- 4.9 the finale -----------------------------------------------------------------------------
  expect(await beat(page)).toBe('k4_12');
  await page.evaluate(() => window.kq!.teleport(1214, -1569, 30));
  await run(page, 16);
  expect(await events(page, 'hunt:finale')).toEqual([{ outcome: 'gathered' }]);
  await drainLines(page, 20);
  await page.evaluate(() => window.kq!.teleport(1214, -1569, 30, -6));
  await run(page, 1);
  await shot(page, '10-finale-kreis');
  // running away: brought back into the circle
  await page.evaluate(() => window.kq!.teleport(1214, -1590));
  await run(page, 4);
  expect((await events(page, 'hunt:finale')).map((p) => (p as { outcome: string }).outcome)).toContain('returned');
  await run(page, 4);
  // lie flat, lantern on
  await page.evaluate(() => window.kq!.press('KeyX', 2));
  await page.evaluate(() => window.kq!.lantern!.toggle(true));
  await run(page, 8);
  expect((await events(page, 'hunt:finale')).map((p) => (p as { outcome: string }).outcome)).toContain('calmed');
  await page.waitForTimeout(2500); // the return blink fades on real time
  await shot(page, '11-finale-hinlegen');
  await run(page, 24);
  expect((await events(page, 'hunt:finale')).map((p) => (p as { outcome: string }).outcome)).toContain('faded');
  await run(page, 3);
  s = await story(page);
  expect(s.beat).toBe('k4_13');
  expect(await page.evaluate(() => window.kq!.state().flags['flag.k4_finale'])).toBe(true);

  // ---- Jost ---------------------------------------------------------------------------------------
  await page.evaluate(() => window.kq!.press('KeyX', 2)); // stand up (X toggles prone)
  await drainLines(page, 30);
  await page.evaluate(() => window.kq!.teleport(1217.5, -1568, 35));
  await run(page, 1);
  expect(await page.evaluate(() => window.kq!.npc!.state().near)).toBe('pikeur');
  await page.evaluate(() => window.kq!.npc!.talk('pikeur'));
  await page.evaluate(() => window.kq!.npc!.drain());
  await shot(page, '12-jost');
  const topics = await page.evaluate(() => window.kq!.npc!.state().topics);
  expect(topics).toEqual(expect.arrayContaining(['stellen', 'meute', 'berg', 'namen']));
  for (const topic of ['stellen', 'meute', 'berg', 'namen', 'bye']) {
    await page.evaluate((t) => window.kq!.npc!.ask(t), topic);
    await page.evaluate(() => window.kq!.npc!.drain());
  }
  await run(page, 2);
  expect(await has(page, 'clue.k4.jost')).toBe(true);
  expect(await page.evaluate(() => window.kq!.state().inventory.items)).toContain('item.horn');
  expect(await untilLine(page, 'jost.k4.08', 20)).toBe(true);
  await shot(page, '13-horn');

  // ---- dawn at the station ------------------------------------------------------------------------
  expect(await untilLine(page, 'marlene.end.morgen', 60)).toBe(true);
  s = await story(page);
  expect(s.beat).toBe('k4_14');
  const p = await page.evaluate(() => window.kq!.ctx.player.position);
  expect(Math.hypot(p.x - 760, p.z + 902)).toBeLessThan(10);
  await shot(page, '14-morgen');
  expect(await untilLine(page, 'marlene.k4.foto', 40)).toBe(true);
  expect(await untilLine(page, 'laub.k4.nur_steine', 40)).toBe(true);
  expect(await has(page, 'clue.k4.foto')).toBe(true);
  expect(await has(page, 'clue.k4.nur_steine')).toBe(true);
  expect(await page.evaluate(() => window.kq!.state().flags['flag.stein_4'])).toBeTruthy();

  // ---- gaps: "Leer lassen" ------------------------------------------------------------------------
  for (let i = 0; i < 30 && !(await page.evaluate(() => window.kq!.story!.choice())); i++) await run(page, 1);
  expect(await page.evaluate(() => window.kq!.story!.choice())).toBe('k4.luecken');
  expect((await story(page)).said).toContain('laub.end.luecken');
  await shot(page, '15-luecken');
  await page.evaluate(() => window.kq!.story!.choose(1));
  await run(page, 12);
  const fl = await page.evaluate(() => window.kq!.state().flags);
  expect(fl['flag.k4_zerstoerer']).toBe('n.r_steintraeger');
  expect(fl['flag.p_spuren']).toBe('offen');

  // ---- the endings chapter ------------------------------------------------------------------------
  s = await story(page);
  expect(s.chapter).toBe('enden');
  await run(page, 10);
  await drainLines(page, 30);
  await run(page, 3);
  await expect(page.getByTestId('ending')).toBeVisible({ timeout: 30_000 });
  await shot(page, '16-wahl');
  await o.at?.('ending:choice');
  await page.getByTestId('ending-keep').click();
  await page.getByRole('button', { name: 'Ja', exact: true }).click();
  await expect(page.getByTestId('ending-next')).toBeVisible();
  await shot(page, '17-behalten');
  await page.getByTestId('ending-next').click();
  await expect(page.getByTestId('epilogue')).toBeVisible();
  const epi = await page.getByTestId('epilogue').innerText();
  expect(epi).toContain('Abgetragen haben ihn die Leute aus Homburg');
  expect(epi).toContain('Diane, Sultan, Fanfare, Rauhreif und Bijou');
  await shot(page, '18-epilog');
  await o.at?.('ending:epilogue');
  await page.getByTestId('ending-credits').click();
  await expect(page.getByTestId('credits')).toBeVisible();
  await o.at?.('ending:credits');
  await page.getByTestId('credits-back').click();
  await run(page, 4);
  s = await story(page);
  expect(s.ending).toBe('keep');
  const f2 = await page.evaluate(() => window.kq!.state().flags);
  expect(f2['flag.end']).toBe('behalten');
  // ending C: Q stays open (to 1789, anywhere)
  expect(f2['shift.allowed']).toBe(true);
  expect(f2['shift.target']).toBe('1789');
}
