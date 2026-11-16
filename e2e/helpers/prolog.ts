import { type Page, expect } from '@playwright/test';
import { type PlayOptions, SCREENS } from './common';

/**
 * The prologue ("Vermessung", bible 01-prolog.md) as an action-RPG quest chain (docs/ACTION-RPG.md
 * §11.0), played headless through window.kq from the first frame after the title flow to the
 * chapter-1 title card:
 *
 *   p1 field station: Marlene's quest "Die Feldstation" (Pinnwand, Regal, Schublade) + the Messstab
 *   outside → p2/p3 "Was der Wald verbirgt" (the dam wall in Relief 2, the Orangerie step in VAT,
 *   Laub speaks) → p4–p6 "Die Bussole spricht" (Ehrenhof, the 1840 map, the hollow way, the pit —
 *   and the first fight: four Nebelinge rise from the Eiskeller) → p7–p9b "Spuren in der
 *   Punktwolke" (the point cloud, J: the field book, Q at the Ehrenhof → 1789, the servant's echo,
 *   a Streuner: Bannlicht + Messstab, Q home) → the stance "Was war das?" → p10 dusk → p11 night,
 *   the Feldbett → "Kapitel 1 · Der Hof".
 *
 * No Chronik board, no sentences to fill: the quests gate the beats. The shared quest helpers
 * (`installQuestPlay`, `qs`, `stance`, `fight`, `shiftTo`, `cna`) are used by k1.ts and k2.ts too.
 * Used by e2e/chapter-prolog.spec.ts and e2e/campaign.spec.ts. Screenshots: ch-prolog-*.png and
 * the action-RPG review set cna-*.png.
 */
let SHOTS = true;

async function snap(page: Page, file: string): Promise<void> {
  // software WebGL on a loaded machine: a frame can stall; one retry, then go on (pictures are
  // for review, the assertions carry the test)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.evaluate(() => window.kq!.screenshotReady());
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${SCREENS}/${file}.png`, timeout: 90_000 });
      return;
    } catch (e) {
      if (attempt === 1) console.warn(`screenshot ${file} skipped: ${(e as Error).message.split('\n')[0]}`);
    }
  }
}
export async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await snap(page, `ch-prolog-${name}`);
}
/** The action-RPG review screenshots (test-results/screens/cna-*.png), taken in every mode. */
export async function cna(page: Page, name: string): Promise<void> {
  // an earlier reward card is clicked away (as a player would) so it does not cover the scene
  await page.evaluate(() => document.querySelector('[data-testid="quest-reward"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  // level / skill / chapter-title cards run out on rendered frames, which `?manual` stepping
  // barely produces: in a real session they are long gone by now, so they stay out of the review set
  await page.evaluate(() => {
    const st = document.createElement('style');
    window.kq?.story?.finishTyping();
    st.id = 'cna-hide';
    st.textContent = '[data-testid="level-card"], [data-testid="skill-card"], .kqs-card { visibility: hidden !important; }';
    document.head.append(st);
  });
  await snap(page, `cna-${name}`);
  await page.evaluate(() => document.getElementById('cna-hide')?.remove());
}

export const story = (page: Page) => page.evaluate(() => window.kq!.story!.state());
export const beat = async (page: Page) => (await story(page)).beat;
export const clues = (page: Page) => page.evaluate(() => window.kq!.state().inventory.clues);
export const said = (page: Page) => page.evaluate(() => window.kq!.story!.state().said as string[]);
export const flag = (page: Page, f: string) => page.evaluate((f) => window.kq!.state().flags[f], f);

// ---------------------------------------------------------------------------------------------
// quest play (shared with k1.ts / k2.ts)
// ---------------------------------------------------------------------------------------------

export interface QuestPlay {
  /** Close cards and dialogs. */
  tidy(): void;
  /** Game seconds pass in half-second steps (tidying in between). */
  run(seconds: number): void;
  /** Step until `fn()` holds or `seconds` pass; returns whether it held. */
  until(fn: () => boolean, seconds: number): boolean;
  q(id: string): string;
  n(id: string, objective: string): number;
}
export type QW = { __cna: QuestPlay };

export const QUEST_PLAY = `(() => {
  const k = window.kq;
  const h = {};
  h.tidy = () => {
    const stack = k.ctx.ui.modals.stack || [];
    for (const m of [...stack]) m.close();
    if (k.story) k.story.finishTyping();
  };
  h.run = (seconds) => { for (let t = 0; t < seconds; t += 0.5) { h.tidy(); k.step(30); } };
  h.until = (fn, seconds) => { for (let t = 0; t < seconds; t += 0.5) { if (fn()) return true; h.tidy(); k.step(30); } return !!fn(); };
  h.q = (id) => (k.quests.state().quests[id] || { state: 'hidden' }).state;
  h.n = (id, o) => ((k.quests.state().quests[id] || { counts: {} }).counts[o] || 0);
  window.__cna = h;
})()`;

export async function installQuestPlay(page: Page): Promise<void> {
  await page.evaluate(QUEST_PLAY);
}
/** Game seconds pass (cards closed). */
export const run = (page: Page, seconds: number) => page.evaluate((s) => (window as unknown as QW).__cna.run(s), seconds);
/** The quest's state (hidden / offered / active / ready / done). */
export const qs = (page: Page, id: string) => page.evaluate((id) => (window as unknown as QW).__cna.q(id), id);
/** An objective's count. */
export const qn = (page: Page, id: string, o: string) => page.evaluate(([id, o]) => (window as unknown as QW).__cna.n(id, o), [id, o] as const);
/** Step until the quest reaches `state` (default done). */
export async function untilQuest(page: Page, id: string, state = 'done', seconds = 60): Promise<string> {
  await page.evaluate(
    ([id, state, seconds]) => {
      const h = (window as unknown as QW).__cna;
      h.until(() => h.q(id) === state, Number(seconds));
    },
    [id, state, seconds] as const,
  );
  return qs(page, id);
}
/** Step until the story reaches beat `id` (or `seconds` of game time pass). */
export async function until(page: Page, id: string, seconds = 60): Promise<string> {
  return page.evaluate(
    ({ id, seconds }) => {
      const h = (window as unknown as QW).__cna;
      h.until(() => window.kq!.story!.state().beat === id, seconds);
      return window.kq!.story!.state().beat as string;
    },
    { id, seconds },
  );
}
/** Let game time pass like a player who reads every card (kept for the campaign). */
export const play = (page: Page, seconds: number) => run(page, seconds);

/**
 * A voice turn-in is a short moment, never a stance card (playtest round 3): no card opens; the
 * quest's deed is its state. Returns the quest state.
 */
export async function turninMoment(page: Page, quest: string): Promise<unknown> {
  await run(page, 3);
  expect(await page.locator('[data-testid="quest-stance"]').count()).toBe(0);
  return qs(page, quest);
}

/** Talk a quest through with an NPC giver: accept (the offer card) or hand in (the turn-in card). */
export async function talkQuest(page: Page, npc: string, quest: string, value?: string): Promise<void> {
  await page.evaluate(
    ([npc, quest, value]) => {
      const k = window.kq!;
      const n = k.npc!;
      n.talk(npc);
      n.drain();
      n.ask(`q:${quest}`);
      for (let i = 0; i < 40 && n.state().busy; i++) n.drain();
      n.drain();
      if (n.state().topics.includes(`qa:${quest}`)) n.choose(`qa:${quest}`);
      else if (n.state().topics.includes(`qt:${quest}`)) n.choose(`qt:${quest}`);
      void value;
      for (let i = 0; i < 20; i++) n.drain();
      if (n.state().open) n.close();
      k.step(2);
    },
    [npc, quest, value ?? ''] as const,
  );
}

/**
 * A short real fight, then the rest: the enemies of `target` (a kind or a group) are lured in
 * front of the player, struck with the Bannlicht and the Messstab, and whatever still stands is
 * undone through the combat hook (SwiftShader frames are slow; the combat itself is unit-tested).
 */
export async function fight(page: Page, target: string, o: { hits?: number; shot?: string } = {}): Promise<number> {
  const before = await page.evaluate((t) => window.kq!.combat!.enemies().filter((e) => e.kind === t || e.group === t).length, target);
  await page.evaluate(
    ([t, hits]) => {
      const k = window.kq!;
      const c = k.combat!;
      // a card on screen would pause the fight: read it away first
      (window as unknown as Partial<QW>).__cna?.tidy();
      c.god(true);
      const p = k.ctx.player.position;
      const yaw = k.ctx.player.yaw;
      const ahead = (d: number) => ({ x: p.x - Math.sin(yaw) * d, z: p.z - Math.cos(yaw) * d });
      for (const e of c.enemies().filter((e) => e.kind === t || e.group === t)) {
        const a = ahead(2.2);
        c.place(e.id, a.x, a.z, true);
      }
      k.step(2);
      c.bann();
      k.step(6);
      c.hit(Number(hits));
      (window as unknown as Partial<QW>).__cna?.tidy();
    },
    [target, o.hits ?? 4] as const,
  );
  if (o.shot) await cna(page, o.shot);
  await page.evaluate((t) => {
    const k = window.kq!;
    k.combat!.kill(t);
    for (let i = 0; i < 20; i++) k.step(10);
    k.combat!.god(false);
  }, target);
  return before;
}

/** Stand at the anchor and press Q: the shift into `era`, the transition played through. */
export async function shiftTo(page: Page, x: number, z: number, yaw: number): Promise<void> {
  await page.evaluate(
    ([x, z, yaw]) => {
      const k = window.kq!;
      const h = (window as unknown as Partial<QW>).__cna;
      const era0 = k.story!.state().era;
      // a card on screen pauses the game (and Q with it): read it away first, then press Q
      for (let i = 0; i < 3 && k.story!.state().era === era0; i++) {
        h?.tidy();
        k.teleport(x, z, yaw, 2);
        k.step(6);
        h?.tidy();
        k.press('KeyQ', 1);
        k.fx!.shiftAt(3.6);
        k.fx!.freeze(false);
        k.step(12);
      }
    },
    [x, z, yaw] as const,
  );
}
/** Hold Q (back to today): the long press, then the transition played through. */
export async function holdHome(page: Page): Promise<void> {
  const log = await page.evaluate(() => {
    const k = window.kq!;
    const out: string[] = [];
    // like a player: hold Q; if the pack has you in sight ("not while someone is watching"),
    // put the lantern out, lie flat a moment and try again
    const h = (window as unknown as QW).__cna;
    for (let i = 0; i < 4 && k.story!.state().era !== 'today'; i++) {
      // a card on screen pauses the game (and Q with it): read it away first
      h.tidy();
      if (i > 0) {
        out.push(JSON.stringify(k.hunt!.state()));
        k.lantern!.toggle(false);
        if (k.ctx.player.stance !== 'prone') k.press('KeyX', 2);
        k.step(240);
      }
      k.ctx.input.simulate('KeyQ', true);
      k.step(100);
      k.ctx.input.simulate('KeyQ', false);
      k.fx!.shiftAt(3.6);
      k.fx!.freeze(false);
      k.step(12);
    }
    if (k.ctx.player.stance === 'prone') k.press('Space', 2);
    return out;
  });
  if (log.length) console.log('[holdHome] retried:', log.join(' | '));
}
/** Walk-free pickup: stand on it (the pickup radius is 1.3 m). */
export async function pickUp(page: Page, x: number, z: number): Promise<void> {
  await page.evaluate(
    ([x, z]) => {
      const k = window.kq!;
      k.teleport(x, z, 0, -20);
      k.step(20);
    },
    [x, z] as const,
  );
}
/** Stand at (x, z) facing `yaw`, set the relief mode and press E on what the Chronik targets. */
export async function examine(page: Page, x: number, z: number, yaw: number, pitch: number, scan: number, clue: string): Promise<void> {
  await page.evaluate(
    ([x, z, yaw, pitch, scan]) => {
      const k = window.kq!;
      k.teleport(x, z, yaw, pitch);
      k.setScanMode(scan);
      k.step(30);
    },
    [x, z, yaw, pitch, scan] as const,
  );
  expect(await page.evaluate(() => window.kq!.chronik!.target())).toBe(clue);
  await page.evaluate(() => window.kq!.press('KeyE', 2));
  await expect.poll(() => clues(page)).toContain(clue);
  await page.evaluate(() => (window as unknown as QW).__cna.tidy());
}

export async function newGame(page: Page, name: string, shots = false, url = './?nosave&fresh&manual'): Promise<void> {
  await page.goto(url);
  const start = page.getByTestId('title-new');
  await expect(start).toBeEnabled({ timeout: 180_000 });
  await page.waitForFunction(() => !!window.kq?.story && !!window.kq?.quests && !!window.kq?.combat && !!window.kq?.fx, null, { timeout: 180_000 });
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
  await installQuestPlay(page);
}

/** The chapter's main playthrough (shared with e2e/campaign.spec.ts). */
export async function playProlog(page: Page, o: PlayOptions = {}): Promise<void> {
  SHOTS = o.shots ?? true;
  await installQuestPlay(page);
  // ---- p1: the field station: "Die Feldstation" ---------------------------------------------------
  let s = await story(page);
  expect(s).toMatchObject({ active: true, chapter: 'prolog', beat: 'p1', era: 'today' });
  await expect(page.getByTestId('story-card')).toContainText('Vermessung');
  await page.evaluate(() => window.kq!.step(70));
  await shot(page, '01-card');
  await o.at?.('prolog:card');
  await installQuestPlay(page);
  // Marlene greets first, then gives the quest by radio (a voice giver: taken at once)
  expect(await untilQuest(page, 'q.p.feldstation', 'active', 40)).toBe('active');
  await page.evaluate(() => window.kq!.step(200));
  await expect(page.getByTestId('quest-tracker')).toContainText('Feldstation');
  await shot(page, '02-tracker');
  await run(page, 16);
  // the door: the hub (E) — Pinnwand, Regal, Schublade
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(760, -905, 0);
    k.step(4);
    k.press('KeyE', 2);
  });
  await expect(page.getByTestId('hub')).toBeVisible();
  for (const item of ['chronik', 'shelf', 'drawer']) {
    await page.getByTestId(`hub-${item}`).click({ force: true });
    await page.evaluate(() => {
      const k = window.kq!;
      k.step(4);
      (window as unknown as QW).__cna.tidy();
      k.press('KeyE', 2);
      k.step(2);
    });
    if (!(await page.getByTestId('hub').isVisible()))
      await page.evaluate(() => {
        window.kq!.teleport(760, -905, 0);
        window.kq!.step(4);
        window.kq!.press('KeyE', 2);
      });
  }
  await page.evaluate(() => (window as unknown as QW).__cna.tidy());
  expect(await clues(page)).toEqual(expect.arrayContaining(['clue.p.lageplan', 'clue.p.handbuch', 'clue.p.laubblatt']));
  expect(await qn(page, 'q.p.feldstation', 'schublade')).toBe(1);
  // the Messstab leans outside the trailer: walk over it
  expect(await beat(page)).toBe('p1');
  await pickUp(page, 763, -900);
  await expect.poll(() => page.evaluate(() => window.kq!.progression!.state().equipped?.weapon ?? null)).toBe('item.stab.esche');
  expect(await untilQuest(page, 'q.p.feldstation', 'done', 10)).toBe('done');
  expect(await until(page, 'p2', 10)).toBe('p2');
  expect(await page.evaluate(() => window.kq!.skills!.levels().kartograf ?? 0)).toBeGreaterThanOrEqual(1); // the quest's reward

  // ---- p2 / p3: "Was der Wald verbirgt": the dam wall, the Orangerie step -------------------------
  expect(await qs(page, 'q.p.relief')).toBe('active');
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(812, -880, 180, -18);
    k.step(30);
  });
  await run(page, 6);
  await examine(page, 813, -892, 180, -22, 2, 'clue.p.mauerrest');
  await shot(page, '03-relief2-mauerrest');
  // the first fight: one weak Nebelling rises from the wall
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 60 && !k.combat!.enemies().some((e) => e.group === 'q.p.relief.nebel'); i++) k.step(10);
  });
  expect(await fight(page, 'q.p.relief.nebel', { shot: '03b-first-nebelling' })).toBeGreaterThanOrEqual(1);
  expect(await qn(page, 'q.p.relief', 'nebel')).toBe(1);
  expect(await until(page, 'p3', 10)).toBe('p3');
  await page.evaluate(() => {
    const k = window.kq!;
    k.setScanMode(0);
    k.teleport(1186, -962, 90, -6);
    k.step(10);
    k.setScanMode(3);
    k.step(30);
  });
  await shot(page, '04-vat-orangerie');
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1222, -966, 90, -10);
    k.step(10);
  });
  expect(await untilQuest(page, 'q.p.relief', 'done', 10)).toBe('done');
  expect(await until(page, 'p4', 8)).toBe('p4');
  // Laub speaks for the first time, and gives his quest
  await page.evaluate(() => {
    const k = window.kq!;
    k.setScanMode(0);
    for (let i = 0; i < 900 && k.story!.state().dialogue?.speaker !== 'laub'; i++) k.step(10);
    k.story!.finishTyping();
  });
  await expect(page.getByTestId('dialogue')).toHaveAttribute('data-portrait', 'compass');
  await shot(page, '05-laub-speaks');
  expect(await qs(page, 'q.p.bussole')).toBe('active');

  // ---- p4–p6: "Die Bussole spricht" ----------------------------------------------------------------
  await run(page, 16);
  await examine(page, 1200, -1110, 90, -12, 2, 'clue.p.ehrenhof');
  await run(page, 6);
  await page.evaluate(() => {
    const k = window.kq!;
    k.setScanMode(0);
    k.teleport(1185, -1112, 90, -8);
    k.press('KeyM', 2);
    k.step(60);
  });
  await shot(page, '06-kartenvergleich');
  expect(await until(page, 'p5', 10)).toBe('p5');
  await page.evaluate(() => {
    const k = window.kq!;
    k.press('KeyM', 2);
    k.setMapMix(0);
  });
  await run(page, 8);
  await examine(page, 1166, -1222, 180, -20, 2, 'clue.p.hohlweg');
  expect(await until(page, 'p6', 8)).toBe('p6');
  await run(page, 4);
  await examine(page, 1496, -1296, 90, -24, 3, 'clue.p.eiskeller');
  // the pit breathes out fog with eyes: the first fight
  await page.evaluate(() => {
    const k = window.kq!;
    k.setScanMode(0);
    k.teleport(1494, -1300, 70, -6);
    for (let i = 0; i < 40 && k.combat!.enemies().filter((e) => e.kind === 'nebelling').length < 4; i++) k.step(15);
  });
  expect(await page.evaluate(() => window.kq!.combat!.enemies().filter((e) => e.kind === 'nebelling').length)).toBe(4);
  await fight(page, 'nebelling', { hits: 5, shot: 'p-eiskeller-fight' });
  expect(await qn(page, 'q.p.bussole', 'nebel')).toBe(4);
  expect(await untilQuest(page, 'q.p.bussole', 'done', 10)).toBe('done');
  expect(await until(page, 'p7', 8)).toBe('p7');
  // the history went to the codex: the Ehrenhof and the Eiskeller cards
  expect(await page.evaluate(() => window.kq!.progression!.state().xp)).toBeGreaterThan(150);

  // ---- p7–p9b: "Spuren in der Punktwolke" -----------------------------------------------------------
  expect(await qs(page, 'q.p.punktwolke')).toBe('active');
  expect(await until(page, 'p8', 150)).toBe('p8');
  expect(await clues(page)).toEqual(expect.arrayContaining(['clue.p.punktwolke', 'clue.p.seite_eins']));
  expect(await page.evaluate(() => window.kq!.progression!.state().inventory['item.p.seite'] ?? 0)).toBe(1);
  // J: the field book (quests, finds, codex) instead of a board of blanks
  await page.evaluate(() => window.kq!.quests!.journal());
  await shot(page, '07-journal');
  await page.evaluate(() => window.kq!.quests!.closeJournal());
  expect(await until(page, 'p9', 60)).toBe('p9');
  await run(page, 12);
  await shiftTo(page, 1205, -1119, 90);
  s = await story(page);
  expect(s.era).toBe('1789');
  expect(s.beat).toBe('p9b');
  await shot(page, '08-1789-palace');
  expect(await qn(page, 'q.p.punktwolke', 'wechsel')).toBe(1);
  // the servant's echo, then a growl at the west edge of the court
  await page.evaluate(() => {
    const k = window.kq!;
    const h = (window as unknown as QW).__cna;
    h.until(() => k.chronik!.echo().id === 'echo.p.diener', 30);
    k.chronik!.advanceEcho(200);
    k.step(4);
    h.until(() => !k.chronik!.echo().id, 10);
    h.until(() => !!k.state().flags['story.p.heulen'], 30);
    (window as unknown as QW).__cna.until(() => k.combat!.enemies().some((e) => e.kind === 'streuner'), 10);
  });
  expect(await qn(page, 'q.p.punktwolke', 'echo')).toBe(1);
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1192, -1114, 270, -4);
    k.step(20);
  });
  await fight(page, 'streuner', { hits: 4, shot: 'p-streuner-bannlicht' });
  expect(await qn(page, 'q.p.punktwolke', 'streuner')).toBe(1);
  // hold Q (no one is looking yet): home, at dusk; Laub asks what it was
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1216, -1114, 180, 2);
    k.step(2);
  });
  await holdHome(page);
  expect((await story(page)).era).toBe('today');
  expect(await untilQuest(page, 'q.p.punktwolke', 'done', 10)).toBe('done');
  expect(await turninMoment(page, 'q.p.punktwolke')).toBe('done');
  expect(await until(page, 'p10', 10)).toBe('p10');

  // ---- p10 / p11: dusk, home, the night, the Feldbett -> chapter 1 ----------------------------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(757, -899, 10, -3);
    k.step(30);
  });
  expect(await until(page, 'p11', 12)).toBe('p11');
  await page.evaluate(() => {
    const k = window.kq!;
    (window as unknown as QW).__cna.until(() => (k.story!.state().said as string[]).includes('laub.p.ende'), 90);
    k.story!.finishTyping();
    k.teleport(754, -899, 22, -3);
    k.step(2);
  });
  await shot(page, '09-night');
  expect(await said(page)).toEqual(expect.arrayContaining(['laptop.p.neu', 'laub.p.ende']));
  // level 3 is in reach after the side quests; the main chain alone gives level 2 at least
  expect(await page.evaluate(() => window.kq!.progression!.state().level)).toBeGreaterThanOrEqual(2);
  await run(page, 10);
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(760, -905, 0);
    k.step(4);
    k.press('KeyE', 2);
  });
  await expect(page.getByTestId('hub')).toBeVisible();
  await page.getByTestId('hub-bed').click();
  await page.evaluate(() => (window as unknown as QW).__cna.until(() => window.kq!.story!.state().chapter !== 'prolog', 30));
  s = await story(page);
  expect(s.chapter).toBe('k1');
  await expect(page.getByTestId('story-card')).toContainText('Der Hof');
  if (SHOTS) await page.screenshot({ path: `${SCREENS}/ch-prolog-10-kapitel1.png`, timeout: 90_000 }).catch(() => undefined);
  expect((await story(page)).objective).toBeFalsy();
}
