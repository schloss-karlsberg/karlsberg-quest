import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

/**
 * Story feature: new-game flow, dialogue presenter, home at the Quelle (day/night), hub overlay,
 * objectives + Bussole, being caught, endings and credits. Screenshots: test-results/screens/story-*.png
 */
const SCREENS = 'test-results/screens';
mkdirSync(SCREENS, { recursive: true });
// software WebGL on a busy machine can be slow: generous budgets
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

async function boot(page: Page, extra = ''): Promise<void> {
  // story.start() here means the retired surveyor prologue (`?classic`); the tour has its own specs
  await page.goto(`./?notitle&nosave&fresh&manual&classic${extra}`);
  await page.waitForFunction(() => {
    const k = window.kq;
    if (!k?.step || k.ctx.pause.reasons.has('title')) return false;
    if (!k.story || !k.party) k.step();
    return !!k.story && !!k.party;
  }, null, { timeout: 180_000 });
}

async function ready(page: Page): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
}

async function shot(page: Page, name: string): Promise<void> {
  await ready(page);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SCREENS}/story-${name}.png` });
}

/** Show the current dialogue line fully typed. */
async function typed(page: Page): Promise<void> {
  await page.evaluate(() => window.kq!.story!.finishTyping());
  await expect(page.getByTestId('dialogue')).toHaveClass(/kqs-show/);
}

test('story: new game flow (warning → name → lantern) starts the tour', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./?nosave&fresh');
  const start = page.getByTestId('title-new');
  await expect(start).toBeEnabled({ timeout: 180_000 });
  await start.click();
  await expect(page.getByTestId('content-warning')).toBeVisible();
  await expect(page.getByTestId('content-warning')).toContainText('16');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENS}/story-warning.png` });
  await page.getByTestId('warning-accept').click();
  const name = page.getByTestId('player-name');
  await expect(name).toBeVisible();
  await name.fill('Mara');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENS}/story-name.png` });
  await page.getByTestId('name-confirm').click();
  await expect(page.getByTestId('light-lantern')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENS}/story-lantern.png` });
  await page.getByTestId('light-lantern').click();
  await expect(page.getByTestId('title')).toBeHidden({ timeout: 30_000 });
  const s = await page.evaluate(() => window.kq!.story!.state());
  expect(s.active).toBe(true);
  expect(s.chapter).toBe('tour');
  expect(s.beat).toBe('t1');
  expect(s.name).toBe('Mara');
  // the tour starts at the Wanderparkplatz (its checkpoint), with its own title card, once
  const p = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
  expect(Math.hypot(p.x - 529, p.z + 777)).toBeLessThan(5);
  await expect(page.getByTestId('story-card')).toContainText('Die Führung');
  expect(await page.evaluate(() => window.kq!.state().flags['combat.disabled'])).toBe(true);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SCREENS}/story-tour-card.png` });
  expect(errors).toEqual([]);
});

test('story: home at the Quelle by day and night, dialogue portraits', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.start('Alex');
    // the opening beat waits for the chapter card (5.5 s + 0.8 s of its fade, M-11); the radio
    // quest offer follows 0.7 s after that
    k.step(500);
  });
  // Marlene on the radio, with her portrait and the fiction label
  await expect(page.getByTestId('dialogue')).toHaveAttribute('data-speaker', 'marlene', { timeout: 10_000 });
  // the quest's own line ("Nimm den Messstab mit …") comes first, while you walk; then the greeting
  await page.evaluate(() => {
    const k = window.kq!;
    const dlg = () => document.querySelector('[data-testid="dialogue"]')?.textContent ?? '';
    for (let i = 0; i < 240 && !dlg().includes('Alex'); i++) {
      k.story!.finishTyping();
      k.step(10);
    }
  });
  await typed(page);
  await expect(page.getByTestId('dialogue')).toContainText('Alex');
  await page.evaluate(() => window.kq!.teleport(757.5, -899, 4, -3));
  await shot(page, 'dialogue-marlene');

  // Laub (brass compass with a face)
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('prolog', 'p4');
    k.story!.say('laub', 'Fünfzig Meter. Ich sehe es selbst. Ich möchte festhalten, dass mein Blatt 1840 vollkommen in Ordnung war.');
    k.ctx.player.teleport(1150, -1112, -Math.PI / 2);
    k.step(4);
  });
  await page.waitForFunction(() => window.kq!.story!.state().dialogue?.speaker === 'laub', null, { timeout: 15_000 });
  await typed(page);
  await expect(page.getByTestId('dialogue')).toHaveAttribute('data-portrait', 'compass');
  await shot(page, 'dialogue-laub');

  // home at the Quelle, day and night
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('prolog', 'p10');
    k.story!.look('day');
    k.teleport(1053, -828, 51, -3);
    k.step(2);
  });
  await shot(page, 'home-day');
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.look('night');
    k.step(2);
  });
  await page.waitForTimeout(600);
  await shot(page, 'home-night');
  expect(errors).toEqual([]);
});

test('story: hub overlay, objective and Bussole', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.start('Alex');
    k.step(4);
    k.story!.flush();
    k.teleport(1059.3, -833.1, 50);
    k.step(4);
  });
  expect(await page.evaluate(() => window.kq!.story!.state().inHub)).toBe(true);
  await page.evaluate(() => window.kq!.press('KeyE', 2));
  // clues at home (Marlene's notes from the chapter packs) may take E first:
  // read them, then the hub
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 8 && !document.querySelector('[data-testid="hub"]'); i++) {
      k.ctx.ui.modals.closeAll();
      k.step(2);
      k.press('KeyE', 2);
    }
  });
  await expect(page.getByTestId('hub')).toBeVisible();
  await shot(page, 'hub');
  await page.getByTestId('hub-chronik').click();
  // prologue p1: the Pinnwand hands out two cards (Messtischblatt, Lageplan) on top of the hub;
  // the Chronik board itself opens from the Pinnwand once the cards are read (p8: Tab)
  if (await page.evaluate(() => !!window.kq!.chronik)) {
    await expect(page.getByTestId('chronik-card')).toHaveCount(1);
    await page.evaluate(() => {
    // one field-book page at a time (src/ui/cards.ts): read each away, the next follows after a beat
    for (let i = 0; i < 8; i++) {
      if (document.querySelector('[data-testid="chronik-card"]')) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
      for (let j = 0; j < 30 && !document.querySelector('[data-testid="chronik-card"]'); j++) window.kq!.step(1);
      if (!document.querySelector('[data-testid="chronik-card"]') && !window.kq!.ctx.ui.cards.pending) break;
    }
    });
    await expect(page.getByTestId('hub')).toBeVisible();
  }
  await page.getByTestId('hub-shelf').click();
  await page.evaluate(() => {
    // the Handbuch card on top of the shelf page
    if (document.querySelector('[data-testid="chronik-card"]')) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  });
  // the Regal in RPG terms (round 3): level, quests, spirits — no "Begriffe" / "Chronik-Einträge"
  await expect(page.getByTestId('hub')).toContainText('Aufgaben erledigt');
  await expect(page.getByTestId('hub')).not.toContainText('Begriffe gefunden');
  await page.screenshot({ path: `${SCREENS}/fun-quests-regal.png` });
  await page.getByTestId('hub-back').click();
  await page.getByTestId('hub-drawer').click();
  await page.evaluate(() => {
    if (document.querySelector('[data-testid="chronik-card"]')) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  });
  await page.getByTestId('hub-phone').click();
  await page.waitForTimeout(1500);
  await shot(page, 'hub-phone');
  await page.getByTestId('hub-map').click();
  await expect(page.getByTestId('chapter-prolog')).toBeVisible();
  await shot(page, 'hub-map');
  await page.getByTestId('hub-continue').click();
  // the Messstab by the forest road: Marlene's quest "Der Messstab" is complete
  await page.evaluate(() => {
    const k = window.kq!;
    const pr = k.progression!;
    const stab = pr.pickups().find((x) => x.item === 'item.stab.esche');
    if (stab) pr.take(stab.id);
    k.step(4);
  });
  // the first fight (playtest round 4): three Nebelinge rise on the way down to the dam
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(792, -893, 75, -4);
    for (let i = 0; i < 40 && k.combat!.enemies().filter((e) => e.group === 'q.p.feldstation.nebel').length < 3; i++) k.step(15);
    k.combat!.kill('q.p.feldstation.nebel');
    k.step(10);
  });
  await expect.poll(() => page.evaluate(() => window.kq!.quests!.state().quests['q.p.feldstation']?.state), { timeout: 60_000 }).toBe('done');
  await page.evaluate(() => window.kq!.step(10));
  // the three items examined and the Messstab taken → p1 complete → p2 (the dam)
  const s = await page.evaluate(() => window.kq!.story!.state());
  expect(s.beat).toBe('p2');
  const inv = await page.evaluate(() => window.kq!.state().inventory);
  expect(inv.items).toContain('item.bussole');
  expect(inv.clues).toContain('clue.p.laubblatt');

  // objective towards the Orangerie, facing it: the needle glows (the jump leaves the p2 quests
  // tracked; while a main quest leads, the needle follows the tracker, so they are closed here)
  await page.evaluate(() => {
    const k = window.kq!;
    for (const id of k.quests?.tracked() ?? []) k.quests!.complete(id);
    k.story!.goto('prolog', 'p3');
    k.story!.flush();
    k.teleport(1150, -966, 90, 2);
    k.step(4);
  });
  await expect(page.getByTestId('objective')).toHaveClass(/kqs-show/);
  await expect(page.getByTestId('bussole')).toHaveClass(/kqs-show/);
  await page.waitForTimeout(1500);
  await shot(page, 'objective');
  const glow = await page.evaluate(() => Number(getComputedStyle(document.querySelector('[data-testid="bussole"]')!).getPropertyValue('--glow')));
  expect(glow).toBeGreaterThan(0.3);
  expect(errors).toEqual([]);
});

test('story: caught by the pack → home at the Quelle', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.start('Alex');
    k.story!.goto('prolog', 'p9b');
    k.setEra('1789');
    k.teleport(1216, -1180, 180);
    k.step(2);
    k.story!.caught('pack', 9000);
  });
  await expect(page.getByTestId('story-curtain')).toHaveClass(/kqs-down/);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SCREENS}/story-caught.png` });
  // the curtain runs on game time: nothing happens until the loop steps (9 s hold)
  expect(await page.evaluate(() => window.kq!.story!.state().era)).toBe('1789');
  await page.evaluate(() => window.kq!.step(9 * 60 + 5));
  expect(await page.evaluate(() => window.kq!.story!.state().era)).toBe('today');
  const p = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
  expect(Math.hypot(p.x - 1059.3, p.z + 833.1)).toBeLessThan(5);
  // resumed at the checkpoint beat (p9: the first shift again — the 1789 visit with its Streuner and
  // the Bannlicht lesson is played once more; contentA moved it from p10)
  expect(await page.evaluate(() => window.kq!.story!.state().beat)).toBe('p9');

  // the choice in the burning hall (chapter 3): four things in the room, E on one (the fuse: 40 s
  // after the offer, Hanne takes you by the arm; chapter-k3.spec.ts)
  await page.waitForFunction(() => !!window.kq?.interiors && !!window.kq?.npc && !!window.kq?.fx, null, { timeout: 180_000 });
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('k3', 'k3_3');
    k.setEra('1793-07');
    k.step(4);
    k.ctx.events.emit('threat:configure', { kind: 'fire', active: true, seconds: 300 });
    k.ctx.state.mutable.inventory.clues.push('clue.k3.fackel');
    k.interiors!.enter('B01.2.og-festsaal', { u: 0.5, v: 0.3 });
    k.step(6);
    for (let i = 0; i < 80 && !k.interiors!.festsaal().active; i++) k.step(30);
    k.step(120);
  });
  expect(await page.evaluate(() => window.kq!.interiors!.festsaal().spots.length)).toBe(4);
  await shot(page, 'choice');
  await page.evaluate(() => {
    const k = window.kq!;
    k.interiors!.festsaalTake('uhr');
    k.step(6);
  });
  expect(await page.evaluate(() => window.kq!.state().flags['flag.k3_objekt'])).toBe('uhr');
  expect(errors).toEqual([]);
});

test('story: ending, epilogue and credits', async ({ page }) => {
  const errors = trackErrors(page);
  await page.route('**/assets/LICENSES.json', async (route) => {
    const response = await route.fetch();
    const manifest = await response.json();
    manifest.assets.push({ author: 'Testautor A, Testautor B', source: 'https://polyhaven.com/a/test', licence: 'CC0-1.0' });
    await route.fulfill({ response, json: manifest });
  });
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.start('Alex');
    k.story!.goto('enden');
    k.state();
    k.ctx.state.update((s) => {
      s.flags['quest.q.k1.hundenamen'] = 'done';
      s.flags['flag.k3_objekt'] = 'uhr';
    });
    k.step(2);
    k.story!.flush();
    k.step(2);
  });
  await expect(page.getByTestId('ending')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(300);
  await shot(page, 'ending-choice');
  await page.getByTestId('ending-museum').click();
  await page.getByRole('button', { name: 'Ja', exact: true }).click();
  // the ending is staged in the engine first (endings/stage.ts): skip it
  await page.getByTestId('ending-stage-skip').click();
  await expect(page.getByTestId('ending-next')).toBeVisible();
  await shot(page, 'ending-scene');
  await page.getByTestId('ending-next').click();
  await expect(page.getByTestId('epilogue')).toBeVisible();
  await shot(page, 'epilogue');
  await page.getByTestId('ending-credits').click();
  // the party (bible 06-enden §8): Gerold's speech, then the credits strip over the party
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 90 && k.party!.state().credits !== 'playing'; i++) k.step(60);
  });
  const track = page.getByTestId('party-credits-track');
  await expect(track).toContainText('Sebastian Heußer');
  await expect(track).toContainText('Testautor A, Testautor B');
  await expect.poll(() => page.evaluate(() => window.kq!.ctx.input.locked)).toBe(false);
  await page.getByTestId('party-credits-skip').click();
  await expect(page.getByTestId('party-credits')).toHaveCount(0);
  await page.evaluate(() => window.kq!.step(4));
  const st = await page.evaluate(() => ({ story: window.kq!.story!.state(), flags: window.kq!.state().flags }));
  expect(st.story.ending).toBe('museum');
  expect(st.story.finished).toBe(true);
  expect(st.flags['flag.end']).toBe('museum');

  await page.evaluate(() => window.kq!.story!.credits());
  const fallback = page.getByTestId('credits');
  await expect(fallback).toContainText('Sebastian Heußer');
  await expect(fallback).toContainText('Testautor A, Testautor B');
  await page.keyboard.press('Escape');
  await expect(fallback).toHaveCount(0);
  expect(errors).toEqual([]);
});
