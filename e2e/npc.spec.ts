import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { waitForHooks } from './helpers/pause';
import { SCREENS } from './helpers/common';

/**
 * Round 2: ghostly NPCs (Hanne at the building site 1789), conversations, story conditions and
 * actions (talked, inline + modal choices, meters, readings, rooms, memorials, lossless capture,
 * epilogue assembly), and barks (idle, gap, memorial quiet).
 * Runs the test chapter content/story/99-test.story.json (`?storytest`).
 * Screenshots: test-results/screens/npc-*.png
 */
mkdirSync(SCREENS, { recursive: true });
test.describe.configure({ timeout: 300_000 });

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

type Rec = { n: string; p: unknown }[];

async function boot(page: Page, extra = ''): Promise<void> {
  await page.goto(`./?notitle&nosave&fresh&manual${extra}`);
  await waitForHooks(page, ['story', 'npc', 'barks', 'chronik']);
  await page.evaluate(() => {
    const w = window as unknown as { rec: Rec };
    w.rec = [];
    window.kq!.ctx.events.onAny((n, p) => {
      if (n !== 'player:step' && n !== 'lantern:oil') w.rec.push({ n, p: JSON.parse(JSON.stringify(p ?? null)) });
    });
  });
}

async function events(page: Page, name: string): Promise<unknown[]> {
  return page.evaluate((n) => (window as unknown as { rec: Rec }).rec.filter((e) => e.n === n).map((e) => e.p), name);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SCREENS}/npc-${name}.png` });
}

const flags = (page: Page) => page.evaluate(() => window.kq!.state().flags);
const story = (page: Page) => page.evaluate(() => window.kq!.story!.state());

test('npc: Hanne at the building site (1789) – ghost, conversation, clue; story conditions and actions', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page, '&storytest');
  const shiftsBefore = await page.evaluate(() => window.kq!.state().meta.shifts);
  await page.evaluate(() => {
    const k = window.kq!;
    // clean screenshots of the ghost: no barks for now (flag barks.quiet)
    k.ctx.state.mutable.flags['barks.quiet'] = true;
    k.story!.start('Mara');
    k.story!.goto('test');
    k.step(4);
  });
  let s = await story(page);
  expect(s.chapter).toBe('test');
  expect(s.beat).toBe('t1');
  expect(s.era).toBe('1789');
  // the oil meter lit and refilled the lantern with a 90 s burn time
  const lantern = await page.evaluate(() => (window.kq!.state().systems as Record<string, { lantern?: { lit: boolean; seconds: number } }>).hunt?.lantern);
  expect(lantern).toMatchObject({ lit: true, seconds: 90 });
  expect(Object.keys(await page.evaluate(() => window.kq!.story!.meters()))).toContain('oil');

  // ---- the ghost -----------------------------------------------------------------------------
  const list = await page.evaluate(() => window.kq!.npc!.list());
  expect(list).toEqual([expect.objectContaining({ npc: 'hanne', x: 1287, z: -1228, era: '1789', visible: true })]);
  // her talk clue belongs to the conversation now (no Chronik marker / E for it)
  expect((await flags(page))['npc.owns.clue.k1.hanne']).toBe(true);
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1284.5, -1223.6, 34, 2);
    k.ctx.player.lookLocked = false;
    k.step(2);
  });
  await page.waitForFunction(() => window.kq!.npc!.list()[0]!.alpha > 0.95, null, { timeout: 30_000 });
  await shot(page, 'hanne-1789');
  // a closer look, slightly from the side
  await page.evaluate(() => {
    window.kq!.teleport(1285.3, -1225.0, 38, 4);
    window.kq!.step(1);
  });
  await page.waitForTimeout(600);
  await shot(page, 'hanne-close');

  // ---- approach → E → conversation ---------------------------------------------------------------
  await page.evaluate(() => {
    window.kq!.teleport(1285.8, -1225.9, 30, -4);
    window.kq!.step(2);
  });
  expect(await page.evaluate(() => window.kq!.npc!.state().near)).toBe('hanne');
  await expect(page.locator('.kq-prompt')).toContainText('Mit Hanne sprechen');
  await page.evaluate(() => window.kq!.press('KeyE', 1));
  await expect(page.getByTestId('npc-talk')).toBeVisible();
  let n = await page.evaluate(() => window.kq!.npc!.state());
  expect(n).toMatchObject({ open: true, npc: 'hanne', chapter: 'k1', busy: true });
  expect(n.line?.id).toBe('hanne.k1.01');
  expect(await events(page, 'npc:conversation')).toEqual([{ npc: 'hanne', open: true }]);
  expect(await events(page, 'npc:talk')).toEqual([{ npc: 'hanne', chapter: 'k1', topic: 'greet' }]);
  expect(await events(page, 'clue:grant')).toEqual([{ id: 'clue.k1.hanne' }]);
  expect(await page.evaluate(() => window.kq!.state().inventory.clues)).toContain('clue.k1.hanne');
  expect((await flags(page))['talked.k1.hanne']).toBe(true);
  await expect(page.locator('.kqn-tag')).toHaveText('erfunden');
  await page.evaluate(() => window.kq!.npc!.finish());
  await shot(page, 'conversation');

  // greeting read → the questions
  await page.evaluate(() => window.kq!.npc!.drain());
  n = await page.evaluate(() => window.kq!.npc!.state());
  expect(n.busy).toBe(false);
  expect(n.topics).toEqual(['matthes', 'warten', 'berg', 'warum', 'bye']);
  await shot(page, 'topics');
  // a stepped answer: both lines in order
  await page.getByTestId('npc-topic-matthes').click();
  n = await page.evaluate(() => window.kq!.npc!.state());
  expect(n.line?.id).toBe('hanne.k1.02');
  await page.evaluate(() => {
    window.kq!.npc!.finish();
    window.kq!.npc!.advance();
  });
  expect((await page.evaluate(() => window.kq!.npc!.state())).line?.id).toBe('hanne.k1.03');
  await page.evaluate(() => window.kq!.npc!.drain());
  expect((await flags(page))['talked.k1.hanne.matthes']).toBe(true);
  await expect(page.getByTestId('npc-topic-matthes')).toHaveClass(/kqn-asked/);
  // goodbye
  await page.evaluate(() => window.kq!.npc!.ask('bye'));
  await page.evaluate(() => window.kq!.npc!.drain());
  await expect(page.getByTestId('npc-talk')).toBeHidden();
  expect((await events(page, 'npc:conversation')).at(-1)).toEqual({ npc: 'hanne', open: false });
  // the npc system speaks these lines itself: the story runner did not repeat them
  expect(((await events(page, 'dialogue:say')) as { id?: string }[]).filter((d) => d.id?.startsWith('hanne.k1.'))).toEqual([]);

  // ---- talked → t2: inline choice resolved by the lit lantern → t3: modal choice ------------------
  await page.evaluate(() => window.kq!.step(3));
  s = await story(page);
  expect(s.beat).toBe('t3');
  let f = await flags(page);
  expect(f['choice.test.tor']).toBe('leuchten');
  expect(f['flag.test_tor']).toBe('leuchten');
  expect(await events(page, 'story:choice')).toEqual([{ id: 'test.tor', option: 'leuchten' }]);
  await expect(page.getByTestId('story-choice')).toBeVisible();
  expect(await page.evaluate(() => window.kq!.story!.choice())).toBe('test.objekt');
  await page.evaluate(() => window.kq!.step(60)); // the fuse burns on game time
  await expect(page.getByTestId('story-choice').locator('.kqs-fuse-label')).toHaveText(/Noch 29 s/);
  await shot(page, 'choice');
  await page.keyboard.press('Digit1');
  await expect(page.getByTestId('story-choice')).toBeHidden();
  f = await flags(page);
  expect(f['choice.test.objekt']).toBe('tuergriff');
  expect(f['flag.k3_objekt']).toBe('tuergriff');

  // ---- t4: a custom gauge on game time (lossless) -----------------------------------------------
  await page.evaluate(() => window.kq!.step(3));
  expect((await story(page)).beat).toBe('t4');
  expect((await flags(page))['chronik.noLoss']).toBe(true);
  await page.evaluate(() => window.kq!.step(300));
  const half = (await page.evaluate(() => window.kq!.story!.meters())).atem!.value;
  expect(half).toBeGreaterThan(0.4);
  expect(half).toBeLessThan(0.6);
  await expect(page.getByTestId('gauge-atem')).toBeVisible();
  await shot(page, 'gauge');
  await page.evaluate(() => window.kq!.step(320));
  expect(await events(page, 'story:meter-full')).toEqual([{ id: 'atem' }]);

  // ---- t5: the readings action (old saves only: deeds need no blanks); {jahre:1793}; a memorial; a room
  await page.evaluate(() => window.kq!.step(3));
  s = await story(page);
  expect(s.beat).toBe('t5');
  f = await flags(page);
  // the test story still declares an old reading: the kept action fills it (old saves); the
  // campaign's epilogue reads deeds (docs/ACTION-RPG.md §8.6)
  expect(f['flag.k1_lohn']).toBe('offen');
  const said = (await events(page, 'dialogue:say')) as { id?: string; text: string }[];
  expect(said.find((d) => d.id === 'test.jahre')?.text).toContain('{jahre:1793}');
  await page.evaluate(() => window.kq!.story!.finishTyping());
  await expect(page.getByTestId('dialogue')).toContainText(/Nach (zweihundert\S+|über zweihundert) Jahren, Mara\./);
  // the memorial follows the line (an opening line takes its time before the beat's next action)
  const quiet = await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 40 && k.barks!.state().quiet !== 'memorial:test.gedenk'; i++) k.step(30);
    return k.barks!.state().quiet;
  });
  expect(quiet).toBe('memorial:test.gedenk');
  await page.evaluate(() => {
    window.kq!.story!.room('B03.1.eg-registratur');
    window.kq!.step(2);
  });
  s = await story(page);
  expect(s.room).toBe('B03.1.eg-registratur');
  expect(s.beat).toBe('t6');
  expect(await page.evaluate(() => window.kq!.npc!.list())).toEqual([]);
  expect((await flags(page))['npc.owns.clue.k1.hanne']).toBeUndefined();
  expect(await page.evaluate(() => window.kq!.barks!.state().memorials)).toEqual([]);

  // ---- caught under the lossless rule: game-time curtain, nothing lost, no extra shift -------------
  await page.evaluate(() => window.kq!.story!.caught('pack', 2000));
  await expect(page.getByTestId('story-curtain')).toHaveClass(/kqs-down/);
  await expect(page.getByTestId('story-curtain')).toContainText('Die Meute hat dich heimgebracht');
  await page.waitForTimeout(400);
  // no real time passes for the curtain in manual mode
  expect((await story(page)).era).toBe('1789');
  await page.evaluate(() => window.kq!.step(125));
  s = await story(page);
  expect(s.era).toBe('today');
  expect(await page.evaluate(() => window.kq!.ctx.player.frozen)).toBe(false);
  expect(await events(page, 'chronik:lost')).toEqual([]);
  expect(await page.evaluate(() => window.kq!.state().inventory.clues)).toContain('clue.k1.hanne');
  expect(await page.evaluate(() => window.kq!.state().meta.shifts)).toBe(shiftsBefore);

  // ---- epilogue from the endings pack ----------------------------------------------------------
  const ep = await page.evaluate(() => window.kq!.story!.epilogue('museum'));
  expect(ep!.object).toContain('Türgriff');
  // told from deeds: no side quest done here → the open sentence of the slot
  expect(ep!.variants.hof).toBe('offen');
  expect(ep!.intro).toMatch(/^(Karlsberg bei Homburg|Dieses Feldbuch)/);
  expect(errors).toEqual([]);
});

test('barks: one per 45 s, idle after 60 s, quiet at the Rondell; Codex from the Pinnwand returns to the hub', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  const spoken = () => page.evaluate(() => window.kq!.barks!.state().spoken.map((s) => s.id));
  await page.evaluate(() => {
    const k = window.kq!;
    k.step(5);
    k.barks!.advance(60);
    k.teleport(1216, -1180, 180);
    k.setEra('1789');
    k.step(3);
  });
  expect((await spoken()).at(-1)).toMatch(/^laub\.bark\.enter_1789\.\d\d$/);
  await page.evaluate(() => window.kq!.story!.finishTyping());
  await expect(page.getByTestId('dialogue')).toHaveAttribute('data-speaker', 'laub');
  await shot(page, 'bark');
  // the global gap: a scan bark waits …
  const before = (await spoken()).length;
  await page.evaluate(() => {
    window.kq!.ctx.events.emit('scan:mode', { mode: 2 });
    window.kq!.step(3);
  });
  expect((await spoken()).length).toBe(before);
  expect(await page.evaluate(() => window.kq!.barks!.state().pending)).toEqual(['scan:mode']);
  // … and goes once 45 s have passed (and the line on screen is gone)
  await page.evaluate(() => {
    window.kq!.barks!.advance(46);
    window.kq!.step(2);
  });
  expect((await spoken()).at(-1)).toMatch(/^laub\.bark\.scan\.0[24]$/);

  // memorial: no barks at the Rondell, the request expires
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1815, 350, 0);
    k.step(2);
    k.barks!.advance(60);
    k.ctx.events.emit('scan:mode', { mode: 3 });
    k.step(2);
  });
  expect(await page.evaluate(() => window.kq!.barks!.state().quiet)).toBe('memorial:rondell');
  const atRondell = (await spoken()).length;
  await page.evaluate(() => window.kq!.step(600));
  expect((await spoken()).length).toBe(atRondell);
  expect(await page.evaluate(() => window.kq!.barks!.state().pending)).toEqual([]);

  // idle: 60 s of game time without input
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1216, -1180, 90);
    k.step(2);
    k.barks!.advance(60);
    for (let i = 0; i < 37; i++) k.step(100);
  });
  expect((await events(page, 'bark:idle')).length).toBe(1);
  expect((await spoken()).at(-1)).toMatch(/^laub\.bark\.idle\.\d\d$/);

  expect(errors).toEqual([]);
});
