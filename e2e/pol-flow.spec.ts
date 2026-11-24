import { type Page, expect, test } from '@playwright/test';
import { waitForHooks } from './helpers/pause';
import { SCREENS, throughParty, trackErrors } from './helpers/common';
import { boot as bootK1, ensureHelpers, flush, story, upd, walk } from './helpers/k1';

/**
 * Story flow, UX and HUD polish (docs/ARCHITECTURE.md §5 HUD column, §13 story flow):
 * - the HUD's top-left column (era, status, room, objective, gauges) never overlaps the skill
 *   cards, the compass, the dialogue card or the subtitles — at 1280×720, 1920×1080 and 1024×768;
 * - chapter 1: the guard calls out a runner in the Ehrenhof (running joke), being caught in
 *   Teil B wakes you at the Tschifflik terrace (not the field station);
 * - the archived printout card sketches the palace site, not the field station;
 * - the epilogue fits 1280×720 with its button visible; after an ending the main menu offers
 *   "Ende noch einmal wählen"; ending C lets the five hounds follow you at night.
 * Screenshots: test-results/screens/pol-flow-*.png.
 */
test.describe.configure({ timeout: 600_000 });

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SCREENS}/pol-flow-${name}.png` });
}

type Box = { x: number; y: number; w: number; h: number; name: string };
/** Visible HUD boxes (screen px) of the elements that must not overlap. */
const boxes = (page: Page) =>
  page.evaluate(() => {
    const out: Box[] = [];
    const add = (name: string, el: Element | null) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 2 || r.height < 2 || cs.display === 'none' || cs.visibility === 'hidden') return;
      out.push({ name, x: r.x, y: r.y, w: r.width, h: r.height });
    };
    // the column's own lines (its box spans the widest line; the era label alone sits beside the compass)
    document.querySelectorAll('[data-testid="hud-topleft"] > *').forEach((el, i) => add(`topleft-${i}-${el.className.split(' ')[0]}`, el));
    document.querySelectorAll('.kqk-card').forEach((el, i) => add(`skill-card-${i}`, el));
    add('compass', document.querySelector('.kq-compass'));
    add('bussole', document.querySelector('[data-testid="bussole"]'));
    add('dialogue', document.querySelector('[data-testid="dialogue"].kqs-show'));
    add('subtitles', document.querySelector('.kq-subtitles:not(:empty)'));
    add('fx-gauges', document.querySelector('.kq-fx-gauges'));
    // Action-RPG docks (docs/ACTION-RPG.md §10): vitals (XP bar, quick slot, combat's bars), boss bar, feed
    add('hud-vitals', document.querySelector('[data-testid="hud-vitals"]'));
    add('hud-boss', document.querySelector('[data-testid="hud-boss"]'));
    add('hud-feed', document.querySelector('[data-testid="hud-feed"]'));
    add('level-card', document.querySelector('[data-testid="level-card"]'));
    // the quest tracker (quests track) lives in the top-left column; only check it on its own when it is elsewhere
    const tracker = document.querySelector('[data-testid="quest-tracker"]');
    if (tracker && !tracker.closest('[data-testid="hud-topleft"]')) add('quest-tracker', tracker);
    return out;
  });

function overlaps(bs: Box[]): string[] {
  const hit: string[] = [];
  for (let i = 0; i < bs.length; i++)
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i]!;
      const b = bs[j]!;
      if (a.name.startsWith('skill-card') && b.name.startsWith('skill-card')) continue;
      if (a.name.startsWith('topleft') && b.name.startsWith('topleft')) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 1 && oy > 1) hit.push(`${a.name} × ${b.name}`);
    }
  return hit;
}

test('HUD: the top-left column, skill cards, dialogue and subtitles do not overlap (3 sizes)', async ({ page }) => {
  const errors = trackErrors(page);
  await bootK1(page, 'k1_2');
  // final positions, not mid-transition (the cards slide in; manual frames do not run CSS time)
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
  // in the Registratur in 1789: room name (Baumeister 1), objective, oil gauge
  await page.evaluate(() => {
    const k = window.kq!;
    k.skills!.grant('baumeister', 1, true);
    k.ctx.era.set('1789');
    k.teleport(1221.2, -1128, 180, 0);
    k.step(10);
  });
  await ensureHelpers(page);
  const w = await walk(page, [
    [1221.2, -1136],
    [1221.2, -1140.8],
    [1216.6, -1149.9],
    [1202.3, -1148.6],
    [1201.6, -1150.6],
  ]);
  expect(w.d).toBeLessThan(1.5);
  await upd(page, 60);
  await flush(page);
  // the chapter's title card (it counts rendered frames; the walk ran on fixed updates) holds the
  // skill cards back: take it away for the layout check
  await page.evaluate(() => document.querySelectorAll('.kqs-card').forEach((el) => el.remove()));
  for (const [vw, vh] of [
    [1280, 720],
    [1920, 1080],
    [1024, 768],
  ] as const) {
    await page.setViewportSize({ width: vw, height: vh });
    await page.evaluate(() => {
      const k = window.kq!;
      // a skill unlock card (not quiet), a Laub line and a captioned sound at once
      k.skills!.grant('spurenleser', 1);
      k.story!.say('laub', 'Hier hat er gesessen. Zähl die Fächer, bevor du den Kasten aufmachst; der Kanzlist hat das auch getan.');
      k.step(20);
      // a fresh unlock settles for 0.45 s of rendered frames before it asks for the centre slot
      // (src/ui/cards.ts: one card at a time, unlocks that come together share one card); Laub's
      // line holds it back as a soft reason for at most SOFT_MAX (8 s of rendered frames): the
      // card clock is pushed on a little per frame, so the card comes up beside the line without
      // 480 slow SwiftShader frames
      for (let i = 0; i < 80 && !document.querySelector('.kqk-card'); i++) {
        k.ctx.ui.cards.tick(0.2);
        k.step(1);
      }
      k.story!.finishTyping();
      // the real-time parts last (their timers run on the wall clock): a captioned sound and a
      // pickup line in the feed dock (the vitals dock always shows the XP bar)
      k.ctx.ui.hud.subtitle(null, '[Draußen im Hof: Schritte auf Kies, dann eine Tür]', 8000);
      k.progression?.grant('item.balsam', 1);
      k.step(2);
    });
    await expect(page.getByTestId('room-tag')).toBeVisible();
    await expect(page.getByTestId('dialogue')).toHaveClass(/kqs-show/);
    await page.waitForTimeout(300);
    const bs = await boxes(page);
    expect(bs.map((b) => b.name)).toEqual(expect.arrayContaining(['dialogue', 'subtitles']));
    expect(bs.filter((b) => b.name.startsWith('topleft')).length).toBeGreaterThanOrEqual(3); // era, room, objective
    expect(bs.some((b) => b.name.startsWith('skill-card'))).toBe(true);
    expect(bs.map((b) => b.name)).toEqual(expect.arrayContaining(['hud-vitals', 'hud-feed']));
    expect(overlaps(bs), `${vw}×${vh}: ${JSON.stringify(bs)}`).toEqual([]);
    await shot(page, `hud-${vw}x${vh}`);
    await page.evaluate(() => {
      const k = window.kq!;
      // the next size gets a fresh unlock card (Baumeister stays for the room name)
      k.skills!.reset();
      k.skills!.grant('baumeister', 1, true);
      k.story!.flush();
    });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  expect(errors).toEqual([]);
});

test('chapter 1: the guard calls out a runner; caught in Teil B → awake at the Tschifflik terrace', async ({ page }) => {
  const errors = trackErrors(page);
  await bootK1(page, 'k1_1');
  await page.evaluate(() => {
    const k = window.kq!;
    // the guard's echo at the gate already heard (it would hold the dialogue while it plays)
    k.ctx.state.update((s) => s.inventory.clues.push('clue.k1.wache'), 'test');
    k.ctx.era.set('1789');
    k.teleport(1240, -1117, 270, 0);
    k.step(10);
    k.story!.flush();
  });
  await ensureHelpers(page);
  await page.evaluate(() => {
    const w = window as unknown as { __said: string[] };
    w.__said = [];
    window.kq!.ctx.events.on('dialogue:say', (p) => w.__said.push(`${p.id}|${p.text}`));
  });
  // sprint across the court
  await walk(page, [[1196, -1117]], { sprint: true, tol: 2 });
  expect(await page.evaluate(() => window.kq!.story!.state().sayCount?.['wache.k1.rennen'])).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __said: string[] }).__said)).toContain('wache.k1.rennen|Langsam! Hier rennt nur das Geld davon.');
  // show it (lines before it skipped)
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 24 && k.story!.state().dialogue?.id !== 'wache.k1.rennen'; i++) {
      k.story!.finishTyping();
      k.step(30);
    }
    k.step(1);
    k.story!.finishTyping();
  });
  const cur = await page.evaluate(() => {
    const s = window.kq!.story!.state();
    return { id: s.dialogue?.id ?? null, text: s.dialogue?.text ?? null, pending: s.pendingLines };
  });
  expect(cur, JSON.stringify(cur)).toMatchObject({ id: 'wache.k1.rennen', text: 'Langsam! Hier rennt nur das Geld davon.' });
  await expect(page.locator('.kqs-dlg-text')).toContainText('Langsam! Hier rennt nur das Geld davon.');
  // (the chapter card counts rendered frames; the walk ran on fixed updates)
  await page.evaluate(() => document.querySelectorAll('.kqs-card').forEach((el) => el.remove()));
  await shot(page, 'k1-wache-rennen');
  // walking back: no second call (walking is fine; and the cooldown)
  await walk(page, [[1236, -1117]], { tol: 2 });
  expect(await page.evaluate(() => window.kq!.story!.state().sayCount?.['wache.k1.rennen'])).toBe(1);

  // Teil B, the chase: caught → the present, at the terrace
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('k1', 'k1_14');
    // the terrace anchor, as the chapter set it at k1_7 (goto skips there; a stale Ehrenhof anchor
    // would wake you at the Ehrenhof)
    k.ctx.state.update((st) => {
      Object.assign(st.flags, { 'shift.allowed': true, 'shift.target': '1789', 'shift.x': 1822, 'shift.z': 70, 'shift.r': 14 });
    }, 'test');
    k.ctx.era.set('1789');
    k.teleport(1811, 363, 180, 0);
    k.step(10);
    k.story!.caught('pack');
    for (let i = 0; i < 80 && k.story!.state().era !== 'today'; i++) k.step(10);
    k.step(120);
  });
  const s = await story(page);
  expect(s.era).toBe('today');
  // the chase is not over: back into the night from the terrace, then to the basin
  expect(s.beat).toBe('k1_14');
  expect(s.objective?.id).toBe('k1.zurueck-b');
  const p = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
  expect(Math.hypot(p.x - 1822, p.z - 70)).toBeLessThan(20);
  await expect(page.locator('body')).toContainText('Tschifflik-Terrasse');
  await shot(page, 'k1-caught-wake');
  expect(errors).toEqual([]);
});

test('the printout card sketches the palace site', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./?notitle&nosave&fresh&manual');
  await waitForHooks(page, ['story', 'chronik']);
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.state.mutable.flags['barks.quiet'] = true;
    k.story!.start('Alex');
    k.story!.flush();
    k.ctx.ui.modals.closeAll();
    k.step(4);
    k.chronik!.examine('clue.p.lageplan');
    k.step(4);
  });
  const card = page.getByTestId('chronik-card');
  await expect(card).toHaveAttribute('data-clue', 'clue.p.lageplan');
  // the sketch is centred on the palace site (Corps de logis), not on the trailer at (760, −915)
  // (round 3: the caption names the place, never raw coordinates)
  await expect(card.locator('figcaption')).toContainText('der Ort, um den es geht');
  await expect(card.locator('figcaption')).not.toContainText('/ -');
  await shot(page, 'card-lageplan');
  expect(errors).toEqual([]);
});

test('endings: epilogue fits 1280×720, "Ende noch einmal wählen", ending C: the hounds follow', async ({ page }) => {
  const errors = trackErrors(page);
  // saving on: the field book before the choice goes to the 'ending' slot
  await page.goto('./?notitle&fresh&manual');
  await waitForHooks(page, ['story', 'hunt']);
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.state.mutable.flags['barks.quiet'] = true;
    k.story!.start('Alex');
    k.story!.goto('enden');
    k.ctx.state.update((s) => {
      s.flags['quest.q.k1.hundenamen'] = 'done';
      s.flags['flag.k3_objekt'] = 'uhr';
    });
    k.step(2);
    k.story!.flush();
    k.step(2);
  });
  await expect(page.getByTestId('ending')).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => window.kq!.ctx.save.has('ending'))).toBe(true);
  await page.getByTestId('ending-keep').click();
  await page.getByRole('button', { name: 'Ja', exact: true }).click();
  // the ending is staged in the engine first (endings/stage.ts): skip it
  await page.getByTestId('ending-stage-skip').click();
  await expect(page.getByTestId('ending-next')).toBeVisible();
  await page.getByTestId('ending-next').click();
  await expect(page.getByTestId('epilogue')).toBeVisible();
  // the button to the credits is on screen without scrolling the page
  const btn = page.getByTestId('ending-credits');
  await expect(btn).toBeInViewport();
  await shot(page, 'epilogue-1280x720');
  await btn.click();
  await throughParty(page);
  await page.evaluate(() => window.kq!.step(4));
  expect(await page.evaluate(() => window.kq!.story!.state().ending)).toBe('keep');

  // ending C afterword: the past at night, five hounds follow at a distance
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1222, -1060, 0, 0);
    k.ctx.era.set('1789');
    for (let i = 0; i < 40; i++) k.step(15);
  });
  const h = await page.evaluate(() => window.kq!.hunt!.state());
  expect(h?.mode).toBe('follow');
  expect(h?.agents.filter((a) => a.kind === 'hound').length).toBe(5);
  expect(h?.caught).toBeFalsy();
  // walk on a while (W), then look back at them
  await page.evaluate(() => {
    const k = window.kq!;
    k.press('KeyW', 300);
    const s = k.hunt!.state()!;
    const p = k.ctx.player.position;
    const near = s.agents.reduce((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b));
    k.ctx.player.yaw = Math.atan2(-(near.x - p.x), -(near.z - p.z));
    k.step(10);
  });
  const after = await page.evaluate(() => window.kq!.hunt!.state());
  expect(after?.caught).toBeFalsy();
  await shot(page, 'ending-c-follow');
  await page.evaluate(() => window.kq!.ctx.save.save('auto', 'test'));

  // post-game, the pause menu: „Ende noch einmal wählen“ loads the slot and the table opens again
  // (playtest round 4: the slot loaded but the choice card never came)
  const autoKey = await page.evaluate(() => Object.keys(localStorage).find((k) => k.endsWith('save.v1.auto')) ?? '');
  const autoRaw = await page.evaluate((k) => localStorage.getItem(k), autoKey);
  await page.evaluate(() => {
    const { cards } = window.kq!.ctx.ui;
    cards.clearToasts();
    cards.dismissNotice();
  });
  await page.keyboard.press('Escape');
  await page.getByTestId('pause-ending-again').click();
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 30 && !document.querySelector('[data-testid="ending"]'); i++) k.step(10);
  });
  await expect(page.getByTestId('ending')).toBeVisible({ timeout: 20_000 });
  await shot(page, 'pause-ending-again-choice');
  // the post-game save stays what the title test below needs (written on the title screen: leaving
  // the running game autosaves on visibilitychange and would overwrite it again)
  await page.goto('./?manual');
  await page.evaluate(([k, raw]) => raw && localStorage.setItem(k!, raw), [autoKey, autoRaw] as const);

  // the main menu: "Ende noch einmal wählen" loads the field book before the table
  await page.reload();
  const again = page.getByTestId('title-ending-again');
  await expect(again).toBeVisible({ timeout: 180_000 });
  await expect(again).toBeEnabled({ timeout: 180_000 });
  await shot(page, 'title-ending-again');
  await again.click();
  await waitForHooks(page, ['story'], 60_000);
  // the table again: the choice opens 1.2 s into the resumed beat
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 30 && k.ctx.ui.modals.count === 0; i++) k.step(10);
  });
  await expect(page.getByTestId('ending')).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => window.kq!.story!.state().ending ?? null)).toBeNull();
  await shot(page, 'ending-again-choice');
  expect(errors).toEqual([]);
});
