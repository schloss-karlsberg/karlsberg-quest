import { type Page, expect } from '@playwright/test';
import { ciScale } from './ci';
import { type PlayOptions, SCREENS, throughParty } from './common';
import { type Any, clearCards, install, killGroup, questTalk, takeAll, voiceStance } from './k3';
import { waitForHooks } from './pause';
import { putAwayPages } from './prolog';

/**
 * Chapter 4 „Der Steinbruch" + the endings as a chain of quests, played headless through
 * window.kq (`?manual`):
 *
 *   q.k4.zettel (Marlene's note, Q at the valley entrance → 1796) → q.k4.karren (the carts echo,
 *   three Steinfresser at the guard houses, the Westblick, the carts backwards: 1789) →
 *   q.k4.baumagazin from Soll (lease, Matthes' stone, four Steinfresser at the stock, then Gruslinge) · sides
 *   q.k4.zeichen (Peter) and q.k4.pacht (the lairs on the slope) → q.k4.steinplatz (the notice,
 *   Der Steinbrecher, W7 Steinfraß, the trench, the page: Messstab V) · side q.k4.graeben (three
 *   trenches, Relief 3 today) · the fourth stone from the road (stance) → q.k4.standpunkt
 *   (Brunnen 1840, the drive, Laub's question) → q.k4.stellen (W8: lie down, lantern, no fight;
 *   Jost, his question, the horn) → dawn → Lücken ("offen", no blanks) → the endings chapter →
 *   choice → epilogue → credits.
 *
 * Used by e2e/chapter-k4.spec.ts and e2e/campaign.spec.ts. Screenshots: test-results/screens/cnb-k4-*.png
 */
let SHOTS = true;



export async function boot(page: Page): Promise<void> {
  await page.goto('./?notitle&nosave&fresh&manual');
  await waitForHooks(page, ['story', 'chronik', 'hunt', 'npc']);
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
  await clearCards(page);
  await page.evaluate(() => {
    window.kq!.story!.finishTyping();
    return window.kq!.screenshotReady();
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SCREENS}/cnb-k4-${name}.png`, timeout: ciScale(150_000) });
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

/** The line was on screen after `mark` (a count of `story.shown()`), or comes within `maxSeconds`. */
export async function shownSince(page: Page, mark: number, id: string, maxSeconds = 20): Promise<boolean> {
  if ((await page.evaluate((m) => window.kq!.story!.shown().slice(m), mark)).includes(id)) return true;
  return untilLine(page, id, maxSeconds);
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
        // a field-book page held back by a fight comes up on the way: read it, put it away
        if (k.ctx.ui.modals.count > 0 && !k.story!.choice()) k.ctx.ui.modals.closeAll();
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
  await putAwayPages(page);
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

const quest = (page: Page, id: string) => page.evaluate((id) => (window.kq as Any).quests.state().quests[id]?.state ?? 'hidden', id);
const items = (page: Page) => page.evaluate(() => (window.kq as Any).progression.state().inventory as Record<string, number>);
const flags = (page: Page) => page.evaluate(() => window.kq!.state().flags);

/** Run game time until the quest is in `state` (story actions with delays start them). */
async function untilQuest(page: Page, id: string, state: string, seconds = 30): Promise<void> {
  for (let i = 0; i < seconds && (await quest(page, id)) !== state; i++) await run(page, 1);
  expect(await quest(page, id), id).toBe(state);
}

/** Q here (either direction), finish the shift. */
async function shiftQ(page: Page): Promise<void> {
  await putAwayPages(page);
  const before = await page.evaluate(() => window.kq!.ctx.era.current);
  // today: a press at the anchor; in the past: hold Q (1.2 s) to come home
  await page.evaluate(() => window.kq!.press('KeyQ', window.kq!.ctx.era.current === 'today' ? 2 : 90));
  const took = await page.evaluate(() => {
    const k = window.kq!;
    return { era: k.ctx.era.current, shift: k.fx!.state().shift.active, input: k.ctx.input.enabled, modals: k.ctx.ui.modals.count, pending: k.ctx.ui.cards.pending, holds: k.ctx.ui.cards.holdReasons() };
  });
  expect(took.shift || took.era !== before, `Q did not start a shift: ${JSON.stringify(took)}`).toBe(true);
  await run(page, 0.5);
  await settleShift(page);
  await run(page, 1);
}

/** The chapter's main playthrough as a chain of quests (shared with e2e/campaign.spec.ts). */
export async function playK4(page: Page, o: PlayOptions = {}): Promise<void> {
  SHOTS = o.shots ?? true;
  await recordEvents(page);
  await install(page);
  await page.evaluate(() => (window.kq as Any).combat.god(true));
  await o.at?.('k4:start');
  // ---- 4.0 the Quelle at night: Marlene's note by the steps (q.k4.zettel) ----------------------
  let s = await story(page);
  expect(s.chapter).toBe('k4');
  expect(s.beat).toBe('k4_0');
  expect(s.era).toBe('today');
  await untilQuest(page, 'q.k4.zettel', 'active');
  await shot(page, '00-station-night');
  await examineHere(page, 'clue.k4.marlene', 1056.4, -835.4);
  await run(page, 0.5);
  expect(await beat(page)).toBe('k4_1');
  await drainLines(page);
  expect((await story(page)).said).toContain('laub.k4.gestaendnis_1');

  // ---- 4.1 Q at the valley entrance → 1796; the carts and the Steinfresser (q.k4.karren) ----------
  await walk(page, 497, -893, 12);
  await run(page, 1);
  await shiftQ(page);
  s = await story(page);
  expect(s.era).toBe('1796');
  expect(await quest(page, 'q.k4.zettel')).toBe('done');
  expect(s.beat).toBe('k4_2');
  await run(page, 2);
  await untilQuest(page, 'q.k4.karren', 'active');
  // the carts echo plays by itself
  for (let i = 0; i < 20 && !(await page.evaluate(() => window.kq!.chronik!.echo().id)); i++) await run(page, 1);
  expect(await page.evaluate(() => window.kq!.chronik!.echo().id)).toBe('clue.k4.karren');
  for (let i = 0; i < 12 && (await page.evaluate(() => window.kq!.chronik!.echo().id)); i++) {
    await page.evaluate(() => window.kq!.chronik!.advanceEcho(6));
    await run(page, 0.2);
  }
  await run(page, 1);
  await closeCards(page);
  expect(await has(page, 'clue.k4.karren')).toBe(true);
  // three Steinfresser gnaw at the guard houses
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.teleport(495, -900, 90, 0);
    k.step(30);
    const e = k.combat.enemies().find((x: Any) => x.kind === 'steinfresser');
    if (e) {
      k.combat.freeze(true);
      k.combat.place(e.id, 501, -899, true);
      (window as Any).k3h.look(501, -899, 2);
    }
  });
  await shot(page, '01-steinfresser-taleingang');
  await page.evaluate(() => (window.kq as Any).combat.freeze(false));
  await killGroup(page, 'q.k4.karren.fresser', 3);
  await run(page, 1);
  expect(await beat(page)).toBe('k4_3');
  await drainLines(page);

  // ---- 4.2 the Westblick ---------------------------------------------------------------------
  await walk(page, 205, -900, 15);
  await run(page, 1);
  await examineHere(page, 'clue.k4.hohenburg', 200, -905);
  await page.evaluate(() => window.kq!.teleport(200, -905, 226, 2));
  await drainLines(page);
  expect(await page.evaluate(() => window.kq!.chronik!.status('echo.k4.rueckwaerts'))).toBe('available');
  await listenHere(page, 'echo.k4.rueckwaerts');
  await run(page, 1.5);
  await settleShift(page);
  await run(page, 1);
  expect(await quest(page, 'q.k4.karren')).toBe('done');
  s = await story(page);
  expect(s.beat).toBe('k4_4');
  expect(s.era).toBe('1789');
  expect(await untilLine(page, 'laub.k4.x.gerueste', 20)).toBe(true);
  await shot(page, '02-rueckwaerts-1789');
  await drainLines(page);
  await run(page, 3);
  await settleShift(page);
  await drainLines(page);
  expect((await story(page)).era).toBe('1796');

  // ---- 4.3 the Baumagazin: Soll's stock (q.k4.baumagazin) ------------------------------------------
  await walk(page, 485, -838, 15);
  await run(page, 1);
  await untilQuest(page, 'q.k4.baumagazin', 'offered');
  await questTalk(page, 'soll', 'q.k4.baumagazin', 'qa');
  await untilQuest(page, 'q.k4.baumagazin', 'active');
  await examineHere(page, 'clue.k4.pacht', 495, -845.5);
  await examineHere(page, 'clue.k4.stein_karren', 496.5, -823.5);
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.teleport(486, -846, 250, 0);
    k.step(30);
    (window as Any).k3h.look(478, -852, 0);
  });
  await shot(page, '03-baumagazin-lager');
  await killGroup(page, 'q.k4.baumagazin.fresser', 3);
  await killGroup(page, 'q.k4.baumagazin.krumen', 6);
  expect(await quest(page, 'q.k4.baumagazin')).toBe('ready');
  await questTalk(page, 'soll', 'q.k4.baumagazin');
  expect(await quest(page, 'q.k4.baumagazin')).toBe('done');
  await run(page, 2);
  expect(await beat(page)).toBe('k4_5');
  // the side quests of the yard: Peter's father's stones, Soll's lost notices
  await run(page, 3);
  await untilQuest(page, 'q.k4.zeichen', 'offered');
  await untilQuest(page, 'q.k4.pacht', 'offered');
  await questTalk(page, 'peter', 'q.k4.zeichen', 'qa');
  await run(page, 1);
  // stone 2 was seen on the cart before the task: it counts
  expect((await flags(page))['quest.q.k4.zeichen.zwei']).toBe(1);
  await questTalk(page, 'soll', 'q.k4.pacht', 'qa');
  for (const [x, z, g] of [
    [652, -928, 'q.k4.pacht.fresser'],
    [802, -958, 'q.k4.pacht.fresser.1'],
    [1002, -998, 'q.k4.pacht.fresser.2'],
  ] as const) {
    await page.evaluate(({ x, z }) => window.kq!.teleport(x, z), { x, z });
    await run(page, 1);
    await killGroup(page, g, 1);
  }
  expect(await takeAll(page, 'q.k4.pacht.zettel')).toBe(3);
  expect(await quest(page, 'q.k4.pacht')).toBe('ready');
  await page.evaluate(() => (window.kq as Any).quests.turnin('q.k4.pacht'));
  expect(await quest(page, 'q.k4.pacht')).toBe('done');

  // ---- 4.4 the Ehrenhof 1796: the notice, Der Steinbrecher (q.k4.steinplatz) -----------------------
  await walk(page, 1210, -1100, 30);
  await run(page, 2);
  s = await story(page);
  expect(s.beat).toBe('k4_6');
  await untilQuest(page, 'q.k4.steinplatz', 'active');
  await examineHere(page, 'clue.k4.anschlag', 1195, -1110.5);
  await run(page, 2);
  const brecher = await page.evaluate(() => {
    const k = window.kq as Any;
    for (let i = 0; i < 30 && !k.combat.enemies().some((e: Any) => e.kind === 'steinbrecher'); i++) k.step(10);
    const e = k.combat.enemies().find((x: Any) => x.kind === 'steinbrecher');
    if (!e) return null;
    k.combat.freeze(true);
    k.combat.place(e.id, 1224, -1114, true);
    k.teleport(1210, -1108, 0, 4);
    k.step(4);
    (window as Any).k3h.look(1224, -1114, 10);
    k.combat.windup(e.id);
    k.step(6);
    return e.kind;
  });
  expect(brecher).toBe('steinbrecher');
  // the old Steinfraß does not start before the boss falls
  expect((await page.evaluate(() => window.kq!.fx!.state())).oblivion.active).toBe(false);
  await shot(page, 'steinbrecher');
  await page.evaluate(() => (window.kq as Any).combat.freeze(false));
  // the stone gnawers of Peter's task are in the rubble here too
  await killGroup(page, 'q.k4.steinplatz.brecher', 1);
  await run(page, 4);
  expect(await beat(page)).toBe('k4_7');
  // W7: when it falls, the Steinfraß wakes
  for (let i = 0; i < 10 && !(await page.evaluate(() => window.kq!.fx!.state().oblivion.active)); i++) await run(page, 1);
  expect((await page.evaluate(() => window.kq!.fx!.state())).oblivion.active).toBe(true);
  for (let i = 0; i < 30 && !(await has(page, 'clue.k4.napoleon')); i++) await run(page, 1);
  expect(await has(page, 'clue.k4.napoleon')).toBe(true);
  await page.evaluate(() => window.kq!.teleport(1236, -1100));
  await run(page, 1);
  await killGroup(page, 'q.k4.zeichen.krumen', 8);
  expect(await takeAll(page, 'q.k4.zeichen.drei')).toBe(1);

  // ---- 4.5 the trench and the page ------------------------------------------------------------------
  await examineHere(page, 'clue.k4.graben', 1238, -1180);
  expect(await takeAll(page, 'q.k4.steinplatz.seite')).toBe(1);
  await run(page, 2);
  expect(await quest(page, 'q.k4.steinplatz')).toBe('done');
  expect((await items(page))['item.stab.lot']).toBe(1);
  expect(await beat(page)).toBe('k4_8');
  await drainLines(page);
  // side: Gruslinge in the three trenches (Laub's voice, taken at once)
  await run(page, 3);
  await untilQuest(page, 'q.k4.graeben', 'active');
  // a player walks into each trench: the escorts (Nebelweber, Rufer) kite and can draw you off,
  // and the Gruslinge only come out of the mortar where you stand
  for (const [g, x, z] of [['west', 1232, -1188], ['nord', 1236, -1180], ['sued', 1226, -1194]] as const) {
    await page.evaluate(({ x, z }) => window.kq!.teleport(x + 3, z + 3), { x, z });
    await killGroup(page, `q.k4.graeben.${g}`, 5);
  }
  // today: the Relief view 3 over the trench; Peter's fourth stone, from the road
  await shiftQ(page);
  expect((await story(page)).era).toBe('today');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.setScanMode(3);
    k.step(10);
  });
  await examineHere(page, 'clue.k4.graben_heute', 1240, -1193);
  await page.evaluate(() => (window.kq as Any).setScanMode(0));
  await run(page, 1);
  expect(await quest(page, 'q.k4.graeben')).toBe('done');
  await page.evaluate(() => window.kq!.teleport(483, -839, 120, 0));
  await run(page, 2);
  await voiceStance(page, 'Der Lohn, der nie gezahlt wurde.');
  expect(await quest(page, 'q.k4.zeichen')).toBe('done');
  expect((await items(page))['item.charm.winkel']).toBe(1);

  // ---- 4.6 Standpunkt 17 ------------------------------------------------------------------------
  await page.evaluate(() => window.kq!.teleport(1380, -1470, 135));
  await run(page, 1);
  await shiftQ(page);
  expect((await story(page)).era).toBe('1796');
  await drainLines(page);
  expect((await page.evaluate(() => window.kq!.fx!.state())).oblivion.active).toBe(false);
  await page.evaluate(() => window.kq!.chronik!.listen('clue.k4.laub_1840'));
  await page.evaluate(() => window.kq!.chronik!.advanceEcho(12));
  await run(page, 0.3);
  await shot(page, '04-brunnen-1840');
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

  // ---- 4.7 the pack drives (no fight: it brings you home) ----------------------------------------
  await run(page, 3);
  expect((await page.evaluate(() => window.kq!.hunt!.mode()))?.mode).toBe('drive');
  await page.evaluate(() => window.kq!.teleport(1375, -1474, 270));
  await run(page, 6);
  await putAwayPages(page);
  await shot(page, 'drive');
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
  // Laub's question: who destroyed the Karlsberg? (a stance, never graded)
  await voiceStance(page, 'Die Steinträger aus Homburg.');
  expect(await quest(page, 'q.k4.standpunkt')).toBe('done');
  await drainLines(page);
  await run(page, 2);
  expect(['k4_11', 'k4_12']).toContain(await beat(page));

  // ---- 4.8 the finale (W8): no fight ---------------------------------------------------------------
  await run(page, 2);
  expect(await beat(page)).toBe('k4_12');
  expect((await flags(page))['combat.disabled']).toBe(true);
  await untilQuest(page, 'q.k4.stellen', 'active');
  await page.evaluate(() => window.kq!.teleport(1214, -1569, 30));
  await run(page, 16);
  expect(await events(page, 'hunt:finale')).toEqual([{ outcome: 'gathered' }]);
  await drainLines(page, 20);
  // the staff stays down here: no combat state, no hits
  const safe = await page.evaluate(() => {
    const k = window.kq as Any;
    const n0 = k.combat.events().length;
    k.combat.hit(2);
    return { inCombat: k.combat.state().inCombat, hits: k.combat.events().slice(n0).filter((e: Any) => e.name === 'combat:hit' || e.name === 'combat:bann').length };
  });
  expect(safe).toEqual({ inCombat: false, hits: 0 });
  await page.evaluate(() => window.kq!.press('KeyX', 2));
  await page.evaluate(() => window.kq!.lantern!.toggle(true));
  await run(page, 8);
  expect((await events(page, 'hunt:finale')).map((p) => (p as { outcome: string }).outcome)).toContain('calmed');
  if (SHOTS) await page.waitForTimeout(2500);
  await shot(page, 'w8-finale');
  await run(page, 24);
  expect((await events(page, 'hunt:finale')).map((p) => (p as { outcome: string }).outcome)).toContain('faded');
  await run(page, 3);
  s = await story(page);
  expect(s.beat).toBe('k4_13');

  // ---- Jost: the hat, the stance, the horn ------------------------------------------------------------
  await page.evaluate(() => window.kq!.press('KeyX', 2));
  await drainLines(page, 30);
  await page.evaluate(() => window.kq!.teleport(1217.5, -1568, 35));
  await run(page, 1);
  expect(await page.evaluate(() => window.kq!.npc!.state().near)).toBe('pikeur');
  await page.evaluate(() => {
    const k = window.kq!;
    k.npc!.talk('pikeur');
    k.npc!.drain();
  });
  await shot(page, '05-jost');
  await page.evaluate(() => {
    const k = window.kq!;
    k.npc!.ask('bye');
    k.npc!.drain();
    k.npc!.close();
  });
  await run(page, 1);
  expect(await quest(page, 'q.k4.stellen')).toBe('ready');
  // Jost's farewell plays while the reward and level cards are clicked away (their real-time animation
  // costs game time): count it if it was on screen at any point after the turn-in
  const shownMark = await page.evaluate(() => window.kq!.story!.shown().length);
  await questTalk(page, 'pikeur', 'q.k4.stellen');
  await run(page, 2);
  expect(await quest(page, 'q.k4.stellen')).toBe('done');
  expect((await items(page))['item.horn']).toBe(1);
  expect(await has(page, 'clue.k4.jost')).toBe(true);
  expect(await shownSince(page, shownMark, 'jost.k4.08', 20)).toBe(true);

  // ---- dawn at the Quelle -------------------------------------------------------------------------
  expect(await untilLine(page, 'marlene.end.morgen', 60)).toBe(true);
  s = await story(page);
  expect(s.beat).toBe('k4_14');
  expect((await flags(page))['combat.disabled']).toBe(true);
  await shot(page, '06-morgen');
  expect(await untilLine(page, 'laub.k4.nur_steine', 70)).toBe(true);
  expect(await has(page, 'clue.k4.foto')).toBe(true);

  // ---- the last beat: Laub on the field book (deeds, no blanks) -------------------------------------
  for (let i = 0; i < 30 && (await beat(page)) !== 'k4_15' && (await story(page)).chapter === 'k4'; i++) await run(page, 1);
  await run(page, 12);
  const fl = await page.evaluate(() => window.kq!.state().flags);
  expect(fl['quest.q.k4.zeichen']).toBe('done');
  // (the Chronik's old reading flags still read „offen“ after k4_15; nothing reads them any more)
  expect(['offen', undefined]).toContain(fl['flag.k4_zerstoerer']);
  expect(await page.evaluate(() => window.kq!.story!.choice())).toBeNull();

  // ---- the endings chapter ------------------------------------------------------------------------
  s = await story(page);
  expect(s.chapter).toBe('enden');
  expect((await flags(page))['combat.disabled']).toBe(true);
  await run(page, 10);
  await drainLines(page, 30);
  await run(page, 3);
  await expect(page.getByTestId('ending')).toBeVisible({ timeout: 30_000 });
  await shot(page, '07-wahl');
  await o.at?.('ending:choice');
  await page.getByTestId('ending-keep').click();
  await page.getByRole('button', { name: 'Ja', exact: true }).click();
  // the ending is staged in the engine first (endings/stage.ts): skip it
  await page.getByTestId('ending-stage-skip').click();
  await expect(page.getByTestId('ending-next')).toBeVisible();
  await page.getByTestId('ending-next').click();
  await expect(page.getByTestId('epilogue')).toBeVisible();
  const epi = await page.getByTestId('epilogue').innerText();
  // told from deeds: Matthes' stone (q.k4.zeichen done), the night at the Zwinger; a story, no flags
  expect(epi).toContain('Matthes’ Zeichen');
  expect(epi).toContain('Jost nahm den Hut ab');
  expect(epi).not.toMatch(/Wird fortgesetzt\.|Jost war auch da|Fortgesetzt im November/);
  await shot(page, 'epilog');
  await o.at?.('ending:epilogue');
  await page.getByTestId('ending-credits').click();
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 90 && k.party?.state().credits !== 'playing'; i++) k.step(60);
  });
  await o.at?.('ending:credits');
  await throughParty(page);
  await run(page, 4);
  s = await story(page);
  expect(s.ending).toBe('keep');
  const f2 = await page.evaluate(() => window.kq!.state().flags);
  expect(f2['flag.end']).toBe('behalten');
  expect(f2['shift.allowed']).toBe(true);
  expect(f2['shift.target']).toBe('1789');
  expect(f2['combat.disabled']).toBe(false);
  const qs = await page.evaluate(() => (window.kq as Any).quests.state().quests);
  for (const id of ['q.k4.zettel', 'q.k4.karren', 'q.k4.baumagazin', 'q.k4.steinplatz', 'q.k4.standpunkt', 'q.k4.stellen', 'q.k4.zeichen', 'q.k4.graeben', 'q.k4.pacht']) expect(qs[id]?.state, id).toBe('done');
  console.log(`[k4] level at the end: ${await page.evaluate(() => (window.kq as Any).progression.state().level)}`);
}
