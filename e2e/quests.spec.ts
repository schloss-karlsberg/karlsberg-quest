import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

/**
 * Action-RPG quests (docs/ACTION-RPG.md §8): Hanne gives a task (! over her head) → accept in the
 * conversation (the quest card: title, giver, pitch, goals, reward) → the tracker counts three
 * Mahnbriefe → the Lohnzettel → ? → turn in (the turn-in card, „Übergeben“), the reward card, one
 * history line told with its source, „Erzähl mehr“ for the rest — no stance card → the story moves on
 * → the Journal (J) shows the task, the history and the new codex cards. No Chronik board ever.
 * Test chapter content/story/99-test.story.json + content/quests/99-test.quests.json (?storytest).
 * Screenshots: test-results/screens/qst-*.png
 */
const SCREENS = 'test-results/screens';
mkdirSync(SCREENS, { recursive: true });
test.describe.configure({ timeout: 300_000 });

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
  await page.waitForFunction(() => !!window.kq?.story && !!window.kq?.npc && !!window.kq?.quests, null, { timeout: 180_000 });
  await page.evaluate(() => {
    const w = window as unknown as { rec: Rec; board: boolean };
    w.rec = [];
    w.board = false;
    window.kq!.ctx.events.onAny((n, p) => {
      if (n !== 'player:step' && n !== 'lantern:oil') w.rec.push({ n, p: JSON.parse(JSON.stringify(p ?? null)) });
    });
    // the old Chronik board must never show up again
    new MutationObserver(() => {
      if (document.querySelector('.ck-board')) w.board = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
}

/** Recorded payloads of `name` — without the prologue's quests (story.start offers and takes the
 * first one, Marlene's voice, before the jump into the test chapter drops it again). */
async function events(page: Page, name: string): Promise<unknown[]> {
  return page.evaluate(
    (n) =>
      (window as unknown as { rec: Rec }).rec
        .filter((e) => e.n === n)
        .map((e) => e.p)
        .filter((p) => !String((p as { id?: unknown } | null)?.id ?? '').startsWith('q.p.')),
    name,
  );
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SCREENS}/qst-${name}.png` });
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

test('quests: Hanne gives a task, the tracker counts, the turn-in tells the history; the journal keeps it', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.state.mutable.flags['barks.quiet'] = true;
    k.story!.start('Mara');
    k.story!.goto('test', 'q1');
    k.step(4);
  });
  // the chapter title card runs on the frame clock: let it pass
  await expect(page.getByTestId('story-card')).toHaveCount(0, { timeout: 60_000 });
  expect(await page.evaluate(() => window.kq!.story!.state().beat)).toBe('q1');
  expect(await page.evaluate((q) => window.kq!.quests!.state().quests[q]?.state, Q)).toBe('offered');
  expect((await flags(page))[`quest.${Q}`]).toBe('offered');
  // (story.start offered the prologue's first quest before the jump into the test chapter)
  expect(((await events(page, 'quest:offered')) as { id: string }[]).filter((e) => e.id === Q)).toEqual([{ id: Q, giver: 'hanne', main: true }]);
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
  await expect(page.getByTestId('quest-banner')).toContainText('TEST: Der Lohnzettel');
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
  await expect(tracker.locator('[data-obj="briefe"]')).toHaveClass(/kqq-done/);
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
    k.step(12);
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
  await page.getByTestId(`npc-topic-qt:${Q}`).click();
  expect((await flags(page))['flag.test_lohn']).toBeUndefined();

  // ---- the reward card ------------------------------------------------------------------------
  expect(await events(page, 'quest:turnin')).toEqual([{ id: Q, npc: 'hanne' }]);
  expect(await events(page, 'quest:completed')).toEqual([{ id: Q, xp: 120, main: true }]);
  expect(await events(page, 'xp:grant')).toContainEqual({ amount: 120, reason: `quest:${Q}` });
  expect(await events(page, 'item:grant')).toContainEqual({ item: 'item.balsam', count: 2, reason: `quest:${Q}` });
  expect(await events(page, 'codex:unlocked')).toEqual(expect.arrayContaining([{ factId: 'cx.08' }, { factId: 'cx.10' }]));
  expect(await page.evaluate(() => window.kq!.state().codex.facts)).toEqual(expect.arrayContaining(['cx.08', 'cx.10']));
  const reward = page.getByTestId('quest-reward');
  await expect(reward).toBeVisible();
  await expect(reward).toContainText('Aufgabe erfüllt');
  await expect(page.getByTestId('quest-reward-xp')).toHaveText('+120 EP');
  await expect(reward).toContainText('Kräuterbalsam');
  await expect(page.getByTestId('quest-reward-codex')).toContainText('Neu im Codex');
  await expect(page.getByTestId('quest-reward-codex').locator('.kqq-conf').first()).toHaveText('D');
  await page.waitForTimeout(700);
  await shot(page, 'reward');
  // E takes the card away (the conversation keeps its keys for afterwards)
  await page.keyboard.press('KeyE');
  await expect(reward).toBeHidden();
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

  // ---- the story moves on --------------------------------------------------------------------
  await page.evaluate(() => window.kq!.step(4));
  expect(await page.evaluate(() => window.kq!.story!.state().beat)).toBe('q2');
  expect((await flags(page))[`quest.${Q}`]).toBe('done');
  await expect(page.getByTestId('npc-glyph-hanne')).toHaveCount(0);
  await expect(tracker).toContainText('Lichter über dem Bauplatz');
  await expect(tracker).not.toContainText('Der Lohnzettel');

  // ---- the journal (J) ---------------------------------------------------------------------------
  await page.evaluate(() => window.kq!.press('KeyJ', 1));
  const journal = page.getByTestId('journal');
  await expect(journal).toBeVisible();
  await expect(page.getByTestId('journal-tab-quests')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('journal-panel-quests')).toContainText('Laufend');
  await page.getByTestId(`journal-quest-${Q}`).click();
  const detail = page.getByTestId('journal-quest-detail');
  await expect(detail).toContainText('TEST: Der Lohnzettel');
  await expect(page.getByTestId('journal-history')).toContainText('zwei Tage für einen Gulden');
  await expect(page.getByTestId('journal-history')).toContainText('en.wikipedia: Karlsberg Castle');
  await expect(detail).not.toContainText('Deine Haltung');
  await shot(page, 'journal-quests');
  await page.getByTestId('journal-tab-codex').click();
  await expect(page.getByTestId('codex-card-cx.08')).toBeVisible();
  await expect(page.getByTestId('codex-card-cx.08')).toContainText('neu');
  await expect(page.getByTestId('codex-card-cx.08').locator('.kqq-lab')).toHaveText(/Fakt/i);
  await page.getByTestId('codex-card-cx.08').click();
  await expect(page.getByTestId('codex-detail')).toContainText('Zwei Tage für einen Gulden');
  await expect(page.getByTestId('codex-detail')).toContainText('Quellen');
  await shot(page, 'journal-codex');
  await page.getByTestId('journal-tab-sets').click();
  await expect(page.getByTestId('bestiary')).toContainText('Mahnbrief');
  await expect(page.getByTestId('set-hundemarken')).toContainText('TEST: Hundemarke');
  await shot(page, 'journal-sets');
  await page.keyboard.press('KeyJ');
  await expect(journal).toBeHidden();

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
