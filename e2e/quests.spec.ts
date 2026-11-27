import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { stepToCard } from './helpers/cards';
import { openPause, waitForHooks } from './helpers/pause';
import { SCREENS } from './helpers/common';

/**
 * Action-RPG quests (docs/ACTION-RPG.md §8): Hanne gives a task (! over her head) → accept in the
 * conversation (the quest card: title, giver, pitch, goals, reward) → the tracker counts three
 * Mahnbriefe → the Lohnzettel → ? → turn in (the turn-in card, „Übergeben“), the payout notice, one
 * history line told with its source, „Erzähl mehr“ for the rest — no stance card → the story moves on
 * → Pause → Aufgaben shows the task, the history and the new codex cards. No Chronik board ever.
 * Test chapter content/story/99-test.story.json + content/quests/99-test.quests.json (?storytest).
 * Screenshots: test-results/screens/qst-*.png
 */
mkdirSync(SCREENS, { recursive: true });
test.describe.configure({ timeout: ciScale(300_000) });

const IGNORED = [/GPU stall/i, /pointer ?lock/i, /WebGL.*(performance|ReadPixels)/i, /AudioContext was not allowed/i];
const Q = 'q.test.lohnzettel';

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

type Rec = { n: string; p: unknown }[];

async function boot(page: Page): Promise<void> {
  await page.goto('./?notitle&nosave&fresh&manual&storytest');
  await waitForHooks(page, ['story', 'npc', 'quests']);
  await page.evaluate(() => {
    const w = window as unknown as { rec: Rec; board: boolean; banners: string[] };
    w.rec = [];
    w.board = false;
    w.banners = [];
    window.kq!.ctx.events.onAny((n, p) => {
      if (n !== 'player:step' && n !== 'lantern:oil') w.rec.push({ n, p: JSON.parse(JSON.stringify(p ?? null)) });
    });
    const seen = new WeakSet<Element>();
    new MutationObserver(() => {
      // the old Chronik board must never show up again
      if (document.querySelector('.ck-board')) w.board = true;
      // a „Neue Aufgabe“ stamp leaves after 3.4–4.2 s of wall clock: read each one as it appears
      for (const b of document.querySelectorAll('[data-testid="quest-banner"]')) {
        if (seen.has(b)) continue;
        seen.add(b);
        w.banners.push(b.textContent ?? '');
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}

/** Texts of the quest banners shown since boot (src/systems/quests/hud.ts `showBanner`). */
async function banners(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { banners: string[] }).banners);
}

/** Recorded payloads of `name`. */
async function events(page: Page, name: string): Promise<unknown[]> {
  return page.evaluate(
    (n) =>
      (window as unknown as { rec: Rec }).rec
        .filter((e) => e.n === n)
        .map((e) => e.p),
    name,
  );
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SCREENS}/fun-quests-${name}.png` });
}

const flags = (page: Page) => page.evaluate(() => window.kq!.state().flags);

/** Undo one enemy: the combat hook when combat is in, else the fact itself (as combat would emit it). */
async function killOne(page: Page, i: number): Promise<void> {
  await page.evaluate((i) => {
    const k = window.kq! as unknown as { combat?: { kill?: (group: string) => unknown }; ctx: NonNullable<typeof window.kq>["ctx"]; step(n: number): void };
    const group = 'q.test.lohnzettel.briefe';
    const done = k.combat?.kill?.(group);
    if (!done)
      k.ctx.events.emit('enemy:killed', { id: `brief.${i}`, group, kind: 'mahnbrief', x: 1270 + i, z: -1215, era: '1789', boss: false, by: 'light', quest: 'q.test.lohnzettel', objective: 'briefe' });
    k.step(2);
  }, i);
}

test('quests: Hanne gives a task, the tracker counts, the turn-in tells the history; the quest log keeps it', async ({ page }) => {
  test.setTimeout(ciScale(900_000));
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.state.mutable.flags['barks.quiet'] = true;
    k.story!.start('Mara');
    k.story!.goto('test', 'q1');
    k.step(4);
  });
  // Advance the chapter title and its hold on the opening beat.
  await page.evaluate(() => window.kq!.step(390));
  await expect(page.locator('.kqs-card.kqs-show')).toHaveCount(0);
  // the opening beat's timeline (Hanne's offer) starts once the card has faded (M-11): a step runs it
  await page.evaluate((q) => {
    const k = window.kq!;
    for (let i = 0; i < 120 && k.quests!.state().quests[q]?.state !== 'offered'; i++) k.step(1);
  }, Q);
  expect(await page.evaluate(() => window.kq!.story!.state().beat)).toBe('q1');
  expect(await page.evaluate((q) => window.kq!.quests!.state().quests[q]?.state, Q)).toBe('offered');
  expect((await flags(page))[`quest.${Q}`]).toBe('offered');
  expect(await events(page, 'quest:offered')).toEqual([{ id: Q, giver: 'hanne', main: true }]);
  expect(await events(page, 'npc:marker')).toContainEqual({ npc: 'hanne', mark: 'offer-main' });

  // ---- the giver: ! in a ring over her head ------------------------------------------------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1294, -1218.5, 322, 5);
    k.ctx.player.lookLocked = false;
    k.step(2);
  });
  await page.waitForFunction(() => window.kq!.npc!.list()[0]!.alpha > 0.95, null, { timeout: 30_000 });
  await expect(page.getByTestId('npc-glyph-hanne')).toBeVisible();
  await expect(page.getByTestId('npc-glyph-hanne')).toHaveAttribute('data-mark', 'offer-main');
  expect(await page.evaluate(() => window.kq!.npc!.mark('hanne'))).toEqual({ mark: 'offer-main', shown: true });
  // the compass points at her ("!" ringed)
  await page.evaluate(() => window.kq!.step(10));
  await expect.poll(() => page.evaluate(() => window.kq!.quests!.markers()), { timeout: 30_000 }).toContainEqual(expect.objectContaining({ id: 'kqq:npc:hanne', kind: 'offer-main' }));
  await expect(page.locator('.kqq-cm-offer-main')).toHaveCount(1);
  await shot(page, 'giver');

  // ---- walk up, E: the task first in the menu ------------------------------------------------
  await page.evaluate(() => {
    window.kq!.teleport(1285.8, -1225.9, 30, -4);
    window.kq!.step(2);
  });
  expect(await page.evaluate(() => window.kq!.npc!.state().near)).toBe('hanne');
  await page.evaluate(() => window.kq!.press('KeyE', 1));
  await expect(page.getByTestId('npc-talk')).toBeVisible();
  await page.evaluate(() => window.kq!.npc!.drain());
  const topics = await page.evaluate(() => window.kq!.npc!.state().topics);
  expect(topics[0]).toBe(`q:${Q}`);
  await expect(page.getByTestId(`npc-topic-q:${Q}`)).toContainText('Der Lohnzettel');
  await expect(page.getByTestId(`npc-topic-q:${Q}`).locator('.kqn-qg-offer-main')).toHaveText('!');
  await page.getByTestId(`npc-topic-q:${Q}`).click();
  await expect(page.locator('.kqn-typed')).toContainText('TEST: Die Papiere');
  await page.evaluate(() => window.kq!.npc!.drain());
  // the quest card: title, giver, pitch, goals (the bonus marked), the reward preview
  const offerCard = page.getByTestId('quest-card-offer');
  await expect(offerCard).toBeVisible();
  await expect(offerCard).toContainText('TEST: Der Lohnzettel');
  await expect(offerCard).toContainText('von Hanne');
  await expect(offerCard).toContainText('Mahnbriefe am Bauplatz zerreißen');
  await expect(offerCard).toContainText('Bonus');
  await expect(offerCard).toContainText('+120 EP');
  await expect(offerCard).toContainText('Kräuterbalsam');
  // a main task: accept only (no "Später")
  await expect(page.getByTestId(`npc-topic-qa:${Q}`)).toHaveText(/Annehmen.*Ich hole ihn dir\./);
  await expect(page.getByTestId(`npc-topic-qd:${Q}`)).toHaveCount(0);
  await shot(page, 'offer');
  await page.getByTestId(`npc-topic-qa:${Q}`).click();
  expect(await events(page, 'quest:accept')).toEqual([{ id: Q, npc: 'hanne' }]);
  expect(await events(page, 'quest:accepted')).toEqual([{ id: Q }]);
  expect(await events(page, 'enemy:spawn')).toEqual([expect.objectContaining({ group: `${Q}.briefe`, kind: 'mahnbrief', count: 3, quest: Q, objective: 'briefe', era: '1789' })]);
  expect(((await events(page, 'loot:place')) as { id: string }[]).map((p) => p.id)).toEqual([`${Q}.marke.0`]);
  // (a few slow software frames for the round trips above outlast the stamp itself)
  await expect.poll(() => banners(page)).toContainEqual(expect.stringContaining('TEST: Der Lohnzettel'));
  // back in the menu: the task now answers with progress lines (grey ?)
  await expect(page.getByTestId(`npc-topic-q:${Q}`).locator('.kqn-qg-active')).toHaveText('?');
  await page.evaluate(() => window.kq!.npc!.ask('bye'));
  await page.evaluate(() => window.kq!.npc!.drain());
  await page.evaluate(() => window.kq!.npc!.close());
  await expect(page.getByTestId('npc-talk')).toBeHidden();

  // ---- the tracker ----------------------------------------------------------------------------
  const tracker = page.getByTestId('quest-tracker');
  await expect(tracker).toBeVisible();
  await expect(tracker).toContainText('TEST: Der Lohnzettel');
  await expect(tracker.locator('[data-obj="briefe"]')).toContainText(/Mahnbriefe.*0\/3/);
  await expect(page.getByTestId('npc-glyph-hanne')).toHaveAttribute('data-mark', 'active');
  // a beacon over the Bauplatz zone, the compass diamond to it
  await page.evaluate(() => {
    window.kq!.teleport(1300, -1180, 319, 4);
    window.kq!.step(30);
  });
  await expect.poll(() => page.evaluate(() => window.kq!.quests!.markers()), { timeout: 30_000 }).toContainEqual(expect.objectContaining({ id: 'kqq:obj', kind: 'obj' }));
  await page.waitForFunction(() => window.kq!.quests!.beacons().some((b) => b.alpha > 0.5), null, { timeout: 30_000 });
  await shot(page, 'tracker');

  // ---- three Mahnbriefe → the Zettel → ready ----------------------------------------------------
  for (let i = 0; i < 3; i++) await killOne(page, i);
  expect(((await events(page, 'quest:progress')) as { count: number }[]).map((p) => p.count)).toEqual([1, 2, 3]);
  expect((await flags(page))[`quest.${Q}.briefe`]).toBe(3);
  // a done goal is struck through, then folds away (playtest round 4)
  const briefe = tracker.locator('[data-obj="briefe"]');
  if (await briefe.count()) await expect(briefe).toHaveClass(/kqq-done/);
  expect(((await events(page, 'loot:place')) as { id: string }[]).map((p) => p.id)).toContain(`${Q}.zettel.0`);
  await expect(tracker.locator('[data-obj="zettel"]')).toContainText('Lohnzettel');
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.events.emit('item:pickup', { item: 'item.test.zettel', count: 1, total: 1, id: 'q.test.lohnzettel.zettel.0' });
    k.step(2);
  });
  expect((await flags(page))[`quest.${Q}`]).toBe('ready');
  expect(await events(page, 'quest:ready')).toEqual([{ id: Q }]);
  // the bonus objective (optional) still counts while ready and pays its bonus XP
  await expect(tracker.locator('[data-obj="marke"]')).toContainText('Hundemarke');
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.events.emit('item:pickup', { item: 'item.test.marke', count: 1, total: 1, id: 'q.test.lohnzettel.marke.0' });
    // without the progression system nothing keeps the inventory: put the collar in by hand
    const pr = k.ctx.state.mutable.systems.progression as { inventory?: Record<string, number> } | undefined;
    if (pr?.inventory && !pr.inventory['item.test.marke']) pr.inventory['item.test.marke'] = 1;
    k.step(2);
  });
  expect(await events(page, 'quest:objective')).toContainEqual({ id: Q, objective: 'marke', optional: true });
  expect(await events(page, 'xp:grant')).toContainEqual({ amount: 20, reason: `quest:${Q}:marke` });
  await expect(tracker.locator('[data-obj="marke"]')).toHaveCount(0);
  await expect(tracker.locator('.kqq-turnin')).toContainText('Zurück zu Hanne');
  await expect(page.getByTestId('quest-feed')).toContainText('bereit zur Abgabe');

  // ---- back to Hanne: ? ---------------------------------------------------------------------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1294, -1218.5, 322, 5);
    // Let progression's 1.5 s startup cooldown for inventory warnings elapse in manual mode.
    k.step(96);
  });
  await expect(page.getByTestId('npc-glyph-hanne')).toHaveAttribute('data-mark', 'ready');
  await expect(page.getByTestId('npc-glyph-hanne')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.kq!.quests!.markers()), { timeout: 30_000 }).toContainEqual(expect.objectContaining({ id: 'kqq:npc:hanne', kind: 'ready' }));
  await shot(page, 'ready');
  await page.evaluate(() => {
    window.kq!.teleport(1285.8, -1225.9, 30, -4);
    window.kq!.step(2);
    window.kq!.press('KeyE', 1);
  });
  await expect(page.getByTestId('npc-talk')).toBeVisible();
  await page.evaluate(() => window.kq!.npc!.drain());
  await expect(page.getByTestId(`npc-topic-q:${Q}`).locator('.kqn-qg-ready')).toHaveText('?');
  await page.getByTestId(`npc-topic-q:${Q}`).click();
  await expect(page.locator('.kqn-typed')).toContainText('Angewiesen. Nicht ausgezahlt.');
  await page.evaluate(() => window.kq!.npc!.drain());
  // the turn-in card: every goal ticked, the reward, one button — no stance, no quiz
  const turnCard = page.getByTestId('quest-card-turnin');
  await expect(turnCard).toBeVisible();
  await expect(turnCard.locator('.kqn-qc-done')).toHaveCount(3);
  await expect(page.locator('[data-testid^="npc-topic-qs:"]')).toHaveCount(0);
  await shot(page, 'turnin-card');
  expect(await events(page, 'quest:completed')).toEqual([]);
  // The two-balm reward only has room for one.
  const balsamFeedBefore = await page.evaluate(() => {
    const k = window.kq!;
    const owned = k.progression!.state().inventory['item.balsam'] ?? 0;
    if (owned < 8) k.progression!.grant('item.balsam', 8 - owned, true);
    return k.progression!.feed().filter((line) => line === '+ Kräuterbalsam').length;
  });
  await page.getByTestId(`npc-topic-qt:${Q}`).click();
  expect((await flags(page))['flag.test_lohn']).toBeUndefined();

  // ---- the payout -----------------------------------------------------------------------------
  expect(await events(page, 'quest:turnin')).toEqual([{ id: Q, npc: 'hanne' }]);
  expect(await events(page, 'quest:completed')).toEqual([{ id: Q, xp: 120, main: true }]);
  expect(await events(page, 'xp:grant')).toContainEqual({ amount: 120, reason: `quest:${Q}`, receipt: { amount: 120 } });
  expect(await events(page, 'item:grant')).toContainEqual({ item: 'item.balsam', count: 2, reason: `quest:${Q}`, receipt: { amount: 1 } });
  expect(await events(page, 'item:pickup')).toContainEqual(expect.objectContaining({
    item: 'item.balsam', count: 1, total: 9, reason: `quest:${Q}`,
  }));
  const inventory = await page.evaluate(() => {
    const p = window.kq!.progression!;
    return { balsam: p.state().inventory['item.balsam'], feed: p.feed() };
  });
  expect(inventory.balsam).toBe(9);
  expect(inventory.feed.filter((line) => line === '+ Kräuterbalsam')).toHaveLength(balsamFeedBefore);
  expect(inventory.feed).toContain('Kein Platz mehr: Kräuterbalsam (9)');
  expect(await events(page, 'codex:unlocked')).toEqual(expect.arrayContaining([{ factId: 'cx.08' }, { factId: 'cx.10' }]));
  expect(await page.evaluate(() => window.kq!.state().codex.facts)).toEqual(expect.arrayContaining(['cx.08', 'cx.10']));
  // The payout waits while Hanne talks.
  const reward = page.getByTestId('quest-reward');
  await page.evaluate(() => window.kq!.step(4));
  await expect(reward).toHaveCount(0);
  expect(await page.evaluate(() => window.kq!.quests!.rewardPending())).toBe(1);
  await expect(page.getByTestId('npc-talk')).toBeVisible();
  // the turn-in moment: ONE history line, with its source and codex card (no four-line lecture)
  await page.evaluate(() => window.kq!.npc!.finish());
  await expect(page.locator('.kqn-typed')).toContainText('zwei Tage für einen Gulden');
  await expect(page.locator('.kqn-src')).toHaveText('Quelle: en.wikipedia: Karlsberg Castle');
  await expect(page.getByTestId('npc-note')).toContainText('Zwei Tage für einen Gulden');
  await expect(page.locator('.kqn-text')).toHaveClass(/kqn-history/);
  await shot(page, 'history');
  await page.evaluate(() => window.kq!.npc!.drain());
  // the rest when the player wants it: „Erzähl mehr“
  await expect(page.getByTestId(`npc-topic-q:${Q}`)).toContainText('Erzähl mehr');
  await page.getByTestId(`npc-topic-q:${Q}`).click();
  await page.evaluate(() => window.kq!.npc!.finish());
  await expect(page.locator('.kqn-typed')).toContainText('die Kassen waren leer');
  await page.evaluate(() => window.kq!.npc!.drain());
  expect(await events(page, 'quest:told')).toEqual([{ id: Q, npc: 'hanne' }]);
  await expect(page.getByTestId(`npc-topic-q:${Q}`)).toHaveCount(0);
  // the next task: Laub's voice, accepted at once
  expect(await page.evaluate(() => window.kq!.quests!.state().quests['q.test.irrlichter']?.state)).toBe('active');
  await page.evaluate(() => window.kq!.npc!.close());

  // ---- the payout notice, after the conversation ------------------------------------------------
  // The level card gets extra reading time for the Ausfall unlock. Render until the payout takes the slot.
  await stepToCard(page, '[data-testid="quest-reward"]', 'present');
  expect(await page.getByTestId('level-card').count()).toBe(0);
  await expect(reward).toBeVisible();
  await expect(reward).toHaveAttribute('role', 'status');
  await expect(reward).toContainText('Aufgabe erfüllt');
  await expect(page.getByTestId('quest-reward-xp')).toHaveText('+120 EP');
  await expect(reward.locator('.kqq-r-gains')).toHaveText('Kräuterbalsam');
  await expect(page.getByTestId('quest-reward-codex')).toHaveText('Neu im Codex (2)');
  await expect(reward).toContainText('Mehr dazu unter Pause → Aufgaben');
  await page.waitForTimeout(700);
  await shot(page, 'reward');

  const pose = () => page.evaluate(() => {
    const p = window.kq!.ctx.player;
    return { x: p.position.x, z: p.position.z, yaw: p.yaw };
  });
  const before = await pose();
  await page.keyboard.down('w');
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => window.kq!.step(24));
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('w');
  const after = await pose();
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.1);
  expect(Math.abs(after.yaw - before.yaw)).toBeGreaterThan(0.1);
  await expect(reward).toBeVisible();
  // walking away takes it away by itself
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 90; i++) k.step(1);
    const p = k.ctx.player.position;
    k.teleport(p.x + 6, p.z, 0);
    for (let i = 0; i < 4; i++) k.step(1);
  });
  await expect(reward).toBeHidden();

  // ---- the story moves on --------------------------------------------------------------------
  await page.evaluate(() => window.kq!.step(4));
  expect(await page.evaluate(() => window.kq!.story!.state().beat)).toBe('q2');
  expect((await flags(page))[`quest.${Q}`]).toBe('done');
  await expect(page.getByTestId('npc-glyph-hanne')).toHaveCount(0);
  await expect(tracker).toContainText('Lichter über dem Bauplatz');
  await expect(tracker).not.toContainText('Der Lohnzettel');

  // ---- the Pause pages ---------------------------------------------------------------------------
  await openPause(page);
  await page.getByTestId('pause-quests').click();
  const quests = page.getByTestId('page-quests');
  await expect(quests).toContainText('Laufend');
  await page.getByTestId(`journal-quest-${Q}`).click();
  const detail = page.getByTestId('journal-quest-detail');
  await expect(detail).toContainText('TEST: Der Lohnzettel');
  await expect(page.getByTestId('journal-history')).toContainText('zwei Tage für einen Gulden');
  await expect(page.getByTestId('journal-history')).toContainText('en.wikipedia: Karlsberg Castle');
  await expect(detail).not.toContainText('Deine Haltung');
  await shot(page, 'journal-quests');
  await quests.getByRole('button', { name: 'Zurück', exact: true }).click();
  await page.getByTestId('pause-codex').click();
  await expect(page.getByTestId('codex-card-cx.08')).toBeVisible();
  await expect(page.getByTestId('codex-card-cx.08')).toContainText('neu');
  await expect(page.getByTestId('codex-card-cx.08').locator('.kqq-lab')).toHaveText(/Fakt/i);
  await expect(page.getByTestId('codex-card-cx.08').locator('.kqq-conf')).toHaveText('D');
  await page.getByTestId('codex-card-cx.08').click();
  await expect(page.getByTestId('codex-detail')).toContainText('Zwei Tage für einen Gulden');
  await expect(page.getByTestId('codex-detail')).toContainText('Quellen');
  await shot(page, 'journal-codex');
  await page.keyboard.press('Escape');
  await page.getByTestId('pause-sets').click();
  await expect(page.getByTestId('bestiary')).toContainText('Mahnbrief');
  await expect(page.getByTestId('set-hundemarken')).toContainText('TEST: Hundemarke');
  await shot(page, 'journal-sets');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('page-sets')).toBeHidden();
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeHidden();

  // no Chronik board, no noun quiz, anywhere on the way
  expect(await page.evaluate(() => (window as unknown as { board: boolean }).board)).toBe(false);
  expect(await events(page, 'chronik:batch')).toEqual([]);
  expect(errors).toEqual([]);
});

test('quests: save and load keep the task and its count; reset withdraws the world', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./?notitle&fresh&manual&storytest');
  await page.waitForFunction(() => !!window.kq?.story && !!window.kq?.quests && !!window.kq?.npc, null, { timeout: 180_000 });
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.state.mutable.flags['barks.quiet'] = true;
    k.story!.start('Mara');
    k.story!.goto('test', 'q1');
    k.step(4);
    k.quests!.accept('q.test.lohnzettel');
    k.quests!.progress('q.test.lohnzettel', 'briefe', 2);
    k.step(2);
  });
  await expect(page.getByTestId('quest-tracker').locator('[data-obj="briefe"]')).toContainText('2/3');
  // save → reload → the task and its count are back, the tracker too
  await page.evaluate(() => window.kq!.ctx.save.save('auto'));
  await page.goto('./?notitle&manual&storytest');
  await page.waitForFunction(() => !!window.kq?.quests, null, { timeout: 180_000 });
  await page.evaluate(() => window.kq!.step(2));
  expect(await page.evaluate(() => window.kq!.quests!.state().quests['q.test.lohnzettel'])).toMatchObject({ state: 'active', counts: { briefe: 2 } });
  expect(await page.evaluate(() => window.kq!.state().flags['quest.q.test.lohnzettel.briefe'])).toBe(2);
  await expect(page.getByTestId('quest-tracker').locator('[data-obj="briefe"]')).toContainText('2/3');
  // reset: counts gone, the group and pickups withdrawn
  const rec = await page.evaluate(() => {
    const out: { n: string; p: unknown }[] = [];
    const off = window.kq!.ctx.events.onAny((n, p) => out.push({ n, p }));
    window.kq!.quests!.reset('q.test.lohnzettel');
    off();
    return out.map((x) => x.n);
  });
  expect(rec).toEqual(expect.arrayContaining(['enemy:despawn', 'loot:clear']));
  expect(await page.evaluate(() => window.kq!.state().flags['quest.q.test.lohnzettel'])).toBeUndefined();
  await page.evaluate(() => window.kq!.ctx.save.delete('auto'));
  expect(errors).toEqual([]);
});

// TASK-083: the chapter 3 and 4 openers ask for a walk and then a Q shift. Their places are tagged
// with the destination era; the marker must still show in the present, before the shift.
for (const [kapitel, quest, objective, before] of [
  [3, 'q.k3.nachmittag', 'ehrenhof', null],
  [4, 'q.k4.zettel', 'tal', 'zettel'],
] as const) {
  test(`chapter ${kapitel} opener: the "there: Q" place has its marker in the present`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(`./?notitle&nosave&fresh&manual&kapitel=${kapitel}`);
    await waitForHooks(page, ['story', 'quests']);
    // The opener starts its quest on game time: the chapter card, then a delayed cue (chapter 4:
    // about 10 s). Real time runs at most 8 fixed updates a frame, so a slow software renderer
    // stretched that past a minute. Step a fixed budget of 40 s instead.
    const state = await page.evaluate((q) => {
      const k = window.kq!;
      for (let i = 0; i < 2400 && k.quests!.state().quests[q]?.state !== 'active'; i += 10) k.step(10);
      return k.quests!.state().quests[q]?.state;
    }, quest);
    expect(state).toBe('active');
    if (before) await page.evaluate(([q, o]) => window.kq!.quests!.progress(q, o), [quest, before] as const);
    await page.waitForFunction(
      ([q, o]) => {
        const k = window.kq!;
        const lead = k.quests!.lead();
        return k.ctx.era.current === 'today' && lead?.quest === q && lead.objective === o && lead.x !== null;
      },
      [quest, objective] as const,
      { polling: 200, timeout: 30_000 },
    );
    // the waymark box is 0×0 (its icon, distance and label are placed around the point): check the icon
    const mark = page.getByTestId('waymark');
    await expect(mark.locator('.kq-wm-icon')).toBeVisible();
    await expect.poll(() => mark.evaluate((el) => Number((el as HTMLElement).style.opacity))).toBeGreaterThan(0.5);
    await expect(mark.locator('.kq-wm-dist')).toHaveText(/\d+ m|km/);
    await page.screenshot({ path: `${SCREENS}/qst-k${kapitel}-opener-marker.png` });
    expect(errors).toEqual([]);
  });
}
