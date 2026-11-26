import { type Page, expect, test } from '@playwright/test';
import { openPause, waitForHooks } from './helpers/pause';
import { SCREENS, trackErrors } from './helpers/common';

/**
 * Progression (docs/ACTION-RPG.md §6–§7, §10): XP bar + level-up stamp card (and how it steps
 * aside for a story title card), `flags['rpg.level']`, a glowing pickup in the test chapter
 * (walk over it → feed → H uses it), enemy loot drops, and the combined equipment and talents page.
 * Runs the test chapter (`?storytest`, beat q1). Screenshots: test-results/screens/prg-*.png.
 */
test.describe.configure({ timeout: 420_000 });

type Rec = { n: string; p: Record<string, unknown> }[];

async function boot(page: Page): Promise<void> {
  await page.goto('./?notitle&nosave&fresh&manual&storytest');
  await waitForHooks(page, ['story', 'progression', 'skills', 'npc']);
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.state.mutable.flags['barks.quiet'] = true;
    k.story!.start('Alex');
    k.skills!.reset();
    k.story!.goto('test', 'q1');
    k.step(6);
    k.story!.flush();
    k.setEra('1789');
    k.step(2);
    const w = window as unknown as { rec: Rec };
    w.rec = [];
    k.ctx.events.onAny((n, p) => {
      if (n !== 'player:step' && n !== 'lantern:oil') w.rec.push({ n, p: JSON.parse(JSON.stringify(p ?? null)) });
    });
  });
}

const events = (page: Page, name: string) => page.evaluate((n) => (window as unknown as { rec: Rec }).rec.filter((e) => e.n === n).map((e) => e.p), name);
const flags = (page: Page) => page.evaluate(() => window.kq!.state().flags);
const prog = (page: Page) => page.evaluate(() => window.kq!.progression!.state());

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SCREENS}/prg-${name}.png`, timeout: 200_000 });
}

/** Skip dialogue lines so they do not cover the picture. */
async function quiet(page: Page): Promise<void> {
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.flush();
    k.ctx.ui.hud.prompt(null, undefined, 'story');
    document.querySelectorAll('.kqs-card').forEach((el) => el.remove());
  });
}

type Box = { name: string; x: number; y: number; w: number; h: number };
const boxes = (page: Page, sels: [string, string][]) =>
  page.evaluate((sels) => {
    const out: Box[] = [];
    for (const [name, sel] of sels)
      document.querySelectorAll(sel).forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width < 2 || r.height < 2 || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return;
        out.push({ name: `${name}-${i}`, x: r.x, y: r.y, w: r.width, h: r.height });
      });
    return out;
  }, sels);
function overlaps(bs: Box[]): string[] {
  const hit: string[] = [];
  for (let i = 0; i < bs.length; i++)
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i]!;
      const b = bs[j]!;
      if (a.name.split('-')[0] === b.name.split('-')[0]) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 1 && oy > 1) hit.push(`${a.name} × ${b.name}`);
    }
  return hit;
}
const HUD_BOXES: [string, string][] = [
  ['vitals', '[data-testid="hud-vitals"]'],
  ['feed', '[data-testid="hud-feed"]'],
  ['levelcard', '[data-testid="level-card"]'],
  ['skillcard', '.kqk-card'],
  ['topleft', '[data-testid="hud-topleft"] > *'],
  ['compass', '.kq-compass'],
  ['bussole', '[data-testid="bussole"]'],
  ['toasts', '.kq-toast'],
  ['dialogue', '[data-testid="dialogue"].kqs-show'],
  ['oil', '.kq-oil:not(.kq-hidden)'],
];

test('XP bar, level-up stamp card (steps aside for a title card), rpg.level flag', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  expect((await flags(page))['rpg.level']).toBe(1);
  await quiet(page);
  await page.evaluate(() => window.kq!.teleport(1262, -1200, 200, 2));
  const xp = page.getByTestId('hud-xp');
  await expect(xp).toHaveAttribute('data-level', '1');
  const fill0 = await page.locator('.kqp-bar-fill').evaluate((el) => (el as HTMLElement).style.width);

  await page.evaluate(() => {
    window.kq!.progression!.xp(500);
    window.kq!.step(2);
  });
  const s = await prog(page);
  expect(s).toMatchObject({ xp: 500, level: 3, points: 2 });
  expect(await events(page, 'level:up')).toEqual([
    { level: 2, points: 1 },
    { level: 3, points: 2 },
  ]);
  expect(await events(page, 'xp:gain')).toEqual([{ amount: 500, total: 500, reason: 'debug' }]);
  expect((await flags(page))['rpg.level']).toBe(3);
  await expect(xp).toHaveAttribute('data-level', '3');
  await expect(xp).toContainText('100 / 350 EP');
  // the bar moves (fill catches up after the ghost)
  await page.waitForFunction(() => Math.abs(parseFloat((document.querySelector('.kqp-bar-fill') as HTMLElement).style.width) - (100 / 350) * 100) < 0.5, null, { timeout: 20_000 });
  // the rendered fill has moved too (CSS transition done)
  await page.waitForFunction(
    () => {
      const f = document.querySelector('.kqp-bar-fill')!.getBoundingClientRect().width;
      const b = document.querySelector('.kqp-bar')!.getBoundingClientRect().width;
      return Math.abs(f / b - 100 / 350) < 0.03;
    },
    null,
    { timeout: 20_000 },
  );
  expect(parseFloat(fill0 || '0')).toBe(0);

  const card = page.getByTestId('level-card');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-level', '3');
  await expect(card).toContainText('Stufe III');
  await expect(card).toContainText('2 Talentpunkte frei');
  await page.waitForFunction(() => !!document.querySelector('.kqp-card.kqp-stamped'), null, { timeout: 60_000 });
  // and the quick slot shows the default item (none yet)
  await expect(page.getByTestId('hud-quick')).toHaveAttribute('data-item', 'item.balsam');
  await page.evaluate(() => window.kq!.progression!.grant('item.balsam', 3));
  await expect(page.getByTestId('hud-quick')).toHaveAttribute('data-count', '3');
  await page.waitForTimeout(700);
  await shot(page, 'levelup-card');
  await page.locator('[data-testid="hud-vitals"]').screenshot({ path: `${SCREENS}/prg-vitals.png` });

  // a story title card comes up: the level card steps aside (and does not overlap it)
  await page.addStyleTag({ content: '.kqp-card, .kqp-card * { transition: none !important; }' });
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'kqs-card kqs-show';
    el.id = 'fake-title';
    el.style.cssText = 'position:fixed;left:50%;top:30%;transform:translate(-50%,-50%);width:520px;height:160px;background:#111;color:#eee;z-index:20;display:grid;place-items:center;font:32px serif';
    el.textContent = 'Kapitel Test';
    document.body.append(el);
    window.kq!.step(20);
  });
  await expect(card).toHaveClass(/kqp-held/);
  expect(await page.evaluate(() => window.kq!.progression!.card())).toEqual({ level: 3, held: true });
  const both = await boxes(page, [
    ['title', '#fake-title'],
    ['levelcard', '[data-testid="level-card"]'],
  ]);
  expect(both.map((b) => b.name)).toEqual(['title-0']);
  await page.evaluate(() => {
    document.getElementById('fake-title')!.remove();
    window.kq!.step(2);
  });
  await expect(card).not.toHaveClass(/kqp-held/);

  // HUD boxes: no overlap at 1280×720 and 1024×768
  for (const [vw, vh] of [
    [1280, 720],
    [1024, 768],
  ] as const) {
    await page.setViewportSize({ width: vw, height: vh });
    await page.evaluate(() => {
      window.kq!.progression!.grant('item.lampenoel', 2);
      window.kq!.ctx.ui.toast('Gespeichert.');
      window.kq!.step(2);
    });
    await page.waitForTimeout(400);
    const bs = await boxes(page, HUD_BOXES);
    expect(bs.some((b) => b.name.startsWith('vitals'))).toBe(true);
    expect(bs.some((b) => b.name.startsWith('feed'))).toBe(true);
    expect(overlaps(bs), `${vw}×${vh}: ${JSON.stringify(bs)}`).toEqual([]);
    await shot(page, `hud-${vw}x${vh}`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  // flags follow every level change, also downwards (debug) and from a level-up by quest XP
  await page.evaluate(() => window.kq!.progression!.level(5));
  expect((await flags(page))['rpg.level']).toBe(5);
  await page.evaluate(() => window.kq!.ctx.events.emit('xp:grant', { amount: 700, reason: 'quest' }));
  expect((await prog(page)).level).toBe(6);
  expect((await flags(page))['rpg.level']).toBe(6);
  expect(errors).toEqual([]);
});

test('a glowing pickup at dusk: walk over it → feed → H uses it; E picks up; enemy loot drops', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.look('dusk', '1789');
    k.teleport(1262, -1196, 0, -3);
    k.step(4);
  });
  await quiet(page);
  // a pickup 14 m ahead, one in the distance
  await page.evaluate(() => {
    const k = window.kq!;
    k.progression!.place('t1', 'item.balsam', 1262, -1210, '1789');
    k.progression!.place('t9', 'item.test.marke', 1274, -1226, '1789');
    k.step(6);
  });
  await page.waitForFunction(() => window.kq!.progression!.pickups().find((p) => p.id === 't1')!.vis > 0.9, null, { timeout: 60_000 });
  await shot(page, 'pickup-dusk');

  // walk over it
  const picked = await page.evaluate(() => {
    const k = window.kq!;
    const inp = k.ctx.input;
    inp.simulate('KeyW', true);
    for (let i = 0; i < 80 && k.progression!.pickups().some((p) => p.id === 't1'); i++) k.step(3);
    inp.simulate('KeyW', false);
    k.step(1);
    return !k.progression!.pickups().some((p) => p.id === 't1');
  });
  expect(picked).toBe(true);
  expect(await events(page, 'item:pickup')).toEqual([expect.objectContaining({ item: 'item.balsam', count: 1, total: 1, id: 't1' })]);
  await expect(page.getByTestId('feed-line').filter({ hasText: '+ Kräuterbalsam' })).toBeVisible();
  // a few more lines in the feed for the picture (the lines fade after ~4 s of real time)
  await page.evaluate(() => {
    const k = window.kq!;
    // software GL renders a frame in seconds: keep the new lines long enough to be photographed
    const st = window.setTimeout;
    (window as unknown as { setTimeout: typeof setTimeout }).setTimeout = ((fn: () => void, ms?: number) => st(fn, (ms ?? 0) > 2000 ? (ms ?? 0) * 20 : ms)) as typeof setTimeout;
    k.progression!.grant('item.kalkstaub');
    k.progression!.grant('item.lampenoel', 2);
    k.step(2);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCREENS}/prg-feed.png` });
  // H uses it
  await page.evaluate(() => window.kq!.press('KeyH', 2));
  expect(await events(page, 'item:use')).toEqual([{ item: 'item.balsam' }]);
  expect((await prog(page)).inventory['item.balsam']).toBeUndefined();
  await expect(page.getByTestId('hud-quick')).toHaveAttribute('data-count', '0');
  // H with nothing left: nothing happens but a note
  await page.evaluate(() => window.kq!.press('KeyH', 2));
  expect((await events(page, 'item:use')).length).toBe(1);

  // E picks up from a step away (no NPC / clue prompt here)
  await page.evaluate(() => {
    const k = window.kq!;
    const p = k.ctx.player.position;
    k.progression!.place('t2', 'item.riechsalz', p.x, p.z - 2.1, '1789');
    k.step(3);
  });
  await expect(page.locator('.kq-prompt')).toContainText('Riechsalz aufheben');
  await page.evaluate(() => window.kq!.press('KeyE', 2));
  expect((await prog(page)).inventory['item.riechsalz']).toBe(1);
  expect((await events(page, 'item:pickup')).at(-1)).toMatchObject({ item: 'item.riechsalz', id: 't2' });
  // taken ids never come back
  await page.evaluate(() => window.kq!.progression!.place('t2', 'item.riechsalz', 1262, -1200, '1789'));
  expect((await page.evaluate(() => window.kq!.progression!.pickups())).some((p) => p.id === 't2')).toBe(false);

  // an undone Mahnbrief drops loot (seeded; bad-luck protection makes it come within a few)
  const drops = await page.evaluate(() => {
    const k = window.kq!;
    const p = k.ctx.player.position;
    for (let i = 0; i < 12; i++) {
      k.ctx.events.emit('enemy:killed', { id: `test.m.${i}`, group: 'test.m', kind: 'mahnbrief', x: p.x + 1.5, z: p.z - 6, era: '1789', boss: false, by: 'light' });
      if (k.progression!.pickups().some((x) => x.drop)) return i + 1;
    }
    return 0;
  });
  expect(drops).toBeGreaterThan(0);
  const drop = await events(page, 'loot:drop');
  expect(drop[0]).toMatchObject({ era: '1789', from: 'mahnbrief' });
  expect((await events(page, 'loot:place')).length).toBeGreaterThan(0);
  await page.waitForFunction(() => window.kq!.progression!.pickups().filter((p) => p.drop).every((p) => p.vis > 0.8), null, { timeout: 60_000 });
  await page.evaluate(() => window.kq!.step(2));
  await shot(page, 'drop');
  // not in another era
  await page.evaluate(() => {
    window.kq!.setEra('today');
    window.kq!.step(30);
  });
  await page.waitForFunction(() => window.kq!.progression!.pickups().every((p) => p.vis < 0.05), null, { timeout: 60_000 });
  expect(errors).toEqual([]);
});

test('I and Pause open Ausrüstung & Talente, and learning a talent changes the stats', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await quiet(page);
  await page.evaluate(() => {
    const k = window.kq!;
    const p = k.progression!;
    p.grant('item.stab.eisen');
    p.grant('item.balsam', 4);
    p.grant('item.lampenoel', 2);
    p.grant('item.kalkstaub');
    p.grant('item.charm.hundemarke');
    p.grant('item.charm.uhr');
    p.grant('item.test.zettel');
    p.grant('item.test.marke');
    p.grant('item.p.seite', 1, true);
    p.xp(500, { x: 1262, z: -1210 });
    k.step(4);
  });
  const s = await prog(page);
  expect(s.equipped).toEqual({ weapon: 'item.stab.eisen', charms: ['item.charm.hundemarke'] });
  // the Messstab I (granted quietly by the beat) is weaker: Eisen stays in the hand
  await page.evaluate(() => {
    window.kq!.ctx.events.emit('item:grant', { item: 'item.stab.esche', quiet: true });
    window.kq!.step(2);
  });
  expect((await prog(page)).equipped.weapon).toBe('item.stab.eisen');

  await page.evaluate(() => window.kq!.press('KeyI', 2));
  const progression = page.getByRole('dialog', { name: 'Ausrüstung & Talente', exact: true });
  const gear = progression.getByRole('region', { name: 'Ausrüstung', exact: true });
  const talents = progression.getByRole('region', { name: 'Talente', exact: true });
  await expect(progression).toBeVisible();
  await expect(gear).toHaveAttribute('data-testid', 'journal-gear');
  await expect(talents).toHaveAttribute('data-testid', 'journal-talents');
  await expect(page.getByTestId('gear-weapon')).toContainText('Messstab mit Eisenbeschlag');
  await expect(page.getByTestId('gear-supply-item.balsam')).toContainText('4 / 9');
  await expect(page.getByTestId('gear-quest-item.test.zettel')).toBeVisible();
  await expect(page.getByTestId('gear-lore-item.test.marke')).toBeVisible();
  await expect(gear.getByTestId('gear-lore-item.p.seite')).toContainText('FIKTION');
  // put Lampenöl on H
  await page.getByTestId('gear-quick-item.lampenoel').click();
  expect((await prog(page)).quick).toBe('item.lampenoel');
  await expect(page.getByTestId('gear-quick-item.lampenoel')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('gear-lore-item.test.marke').locator('summary').click();
  await page.waitForTimeout(200);
  await shot(page, 'gear');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(300);
  await shot(page, 'gear-1024');
  await page.setViewportSize({ width: 1280, height: 720 });

  await gear.getByRole('button', { name: 'Zu den Talenten', exact: true }).press('Enter');
  const talentHeading = talents.getByRole('heading', { name: 'Talente', exact: true });
  await expect(talentHeading).toBeFocused();
  await expect(talentHeading).toBeInViewport();
  await progression.getByRole('button', { name: 'Zurück', exact: true }).click();
  await expect(progression).toBeHidden();
  await openPause(page);
  const progressionEntry = page.getByTestId('pause-gear');
  const badge = progressionEntry.locator('.kq-pause-badge');
  await expect(progressionEntry).toContainText('Ausrüstung & Talente');
  await expect(badge).toHaveText('2');
  await progressionEntry.press('Enter');
  await expect(progression).toBeVisible();
  await expect(gear).toBeVisible();
  await expect(talents).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wissen Erkundung und Vorrat' })).toBeVisible();
  await expect(page.getByTestId('talent-points')).toHaveAttribute('data-points', '2');
  await expect(page.getByTestId('talent-learn-stab.dritter')).toBeDisabled();
  const before = (await events(page, 'stats:changed')).length;
  await page.getByTestId('talent-learn-stab.standfest').click();
  expect(await events(page, 'talent:learned')).toEqual([{ talent: 'stab.standfest', rank: 1 }]);
  const after = await events(page, 'stats:changed');
  expect(after.length).toBe(before + 1);
  expect((after.at(-1)!.stats as { maxHp: number }).maxHp).toBe(100 + 2 * 12 + 15);
  await expect(page.getByTestId('talent-points')).toHaveAttribute('data-points', '1');
  await expect(page.getByTestId('talent-stab.standfest')).toHaveAttribute('data-rank', '1');
  await page.getByTestId('talent-learn-laterne.weit').click();
  // Respec requires the present-day home ring at the spring.
  await expect(page.getByTestId('talent-respec')).toBeDisabled();
  await shot(page, 'talents');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(300);
  await shot(page, 'talents-1024');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.keyboard.press('Escape');
  await expect(progression).toBeHidden();
  await expect(badge).toBeHidden();
  await expect(progressionEntry).toBeFocused();
  await page.keyboard.press('Escape');
  // H now pours half a tank and lights the lantern.
  const lantern = await page.evaluate(() => {
    const k = window.kq!;
    k.lantern!.toggle(false);
    k.lantern!.setOil(0.2);
    k.press('KeyH', 2);
    return k.lantern!.state();
  });
  expect(await events(page, 'item:use')).toEqual([{ item: 'item.lampenoel' }]);
  expect(await events(page, 'lantern:request')).toContainEqual({ lit: true, refill: 0.5 });
  expect(lantern.lit).toBe(true);
  expect(lantern.oil).toBeCloseTo(0.7);
  expect((await prog(page)).inventory['item.lampenoel']).toBe(1);
  // the codex pays once per fact
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.events.emit('codex:unlocked', { factId: 'cx.08' });
    k.ctx.events.emit('codex:unlocked', { factId: 'cx.08' });
  });
  expect((await events(page, 'xp:gain')).filter((g) => g.reason === 'codex').length).toBe(1);
  expect((await flags(page))['rpg.level']).toBe((await prog(page)).level);
  await page.evaluate(() => {
    const k = window.kq!;
    k.setEra('today');
    k.teleport(1059.3, -833.1, 50);
    k.step(4);
  });
  await openPause(page);
  await progressionEntry.click();
  await expect(page.getByTestId('talent-respec')).toBeEnabled();
  expect(errors).toEqual([]);
});
