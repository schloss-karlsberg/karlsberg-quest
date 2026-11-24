import { expect, test } from '@playwright/test';
import { SCREENS, trackErrors } from './helpers/common';
import { newGame } from './helpers/prolog';

/**
 * Onboarding, pacing and card discipline (playtest round 4, docs/ACTION-RPG.md §14):
 *
 *  1. From "Neues Spiel" the player is in control at once and in a first small fight within 60 s:
 *     a simulated player who only walks where the Bussole points (no menus, no reading pauses)
 *     takes the Messstab off the trailer and meets three Nebelinge rising at the dam.
 *  2. One notice at a time: the fight's payout and skill cards come one after the other
 *     (and not during the fight), the Pinnwand's two field-book pages open one after the other.
 *
 * Screenshots: test-results/screens/s5-pacing-*.png
 */
// SwiftShader under a parallel suite: the card sampling and screenshots alone can take 15 min
test.describe.configure({ timeout: 1_800_000 });

/** The cards and notices visible now (the same selectors as CardDirector.visible()). */
const CARDS_JS = `(() => {
  const vis = (sel) => [...document.querySelectorAll(sel)].some((el) => {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05 && r.width > 2 && r.height > 2;
  });
  const out = [];
  if (vis('[data-testid="chronik-card"]')) out.push('clue');
  if (vis('.kqq-reward:not(.kq-notice-out):not([hidden])')) out.push('reward');
  if (vis('.kq-toast:not(.kq-notice-out):not([hidden])')) out.push('toast');
  if (vis('.kqp-card:not(.kqp-out):not(.kqp-held)')) out.push('level');
  if (vis('.kqk-card:not(.kqk-out):not(.kqk-held)')) out.push('skill');
  return out;
})()`;

async function shot(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady()).catch(() => undefined);
  await page.screenshot({ path: `${SCREENS}/s5-pacing-${name}.png`, timeout: 90_000 }).catch(() => undefined);
}

test('first 60 seconds: in control at once, a first fight before a minute is up, one card at a time', async ({ page }) => {
  const errors = trackErrors(page);
  await newGame(page, 'Mara');
  await shot(page, '01-control');

  // a player who walks where the Bussole points: W (+ Shift), re-aiming every quarter second
  const run = await page.evaluate(
    ({ CARDS }) => {
      const k = window.kq!;
      const ctx = k.ctx;
      const inp = ctx.input;
      const P = () => ctx.player.position;
      const t0 = ctx.loop.time;
      let fightAt = -1;
      let stabAt = -1;
      let maxCards = 0;
      const seen: string[] = [];
      const off = ctx.events.on('combat:state', (e: { inCombat: boolean }) => {
        if (e.inCombat && fightAt < 0) fightAt = ctx.loop.time - t0;
      });
      let goal: { x: number; z: number } | null = null;
      const offObj = ctx.events.on('objective:set', (o: { x?: number; z?: number }) => {
        if (typeof o.x === 'number' && typeof o.z === 'number') goal = { x: o.x, z: o.z };
      });
      for (let i = 0; i < 4 * 60 && fightAt < 0; i++) {
        const cards = (0, eval)(CARDS) as string[];
        maxCards = Math.max(maxCards, cards.length);
        for (const c of cards) if (!seen.includes(c)) seen.push(c);
        // a field-book page that came up is read and put away (a click)
        for (const m of [...((ctx.ui.modals as unknown as { stack: { close(): void }[] }).stack ?? [])]) m.close();
        if (stabAt < 0 && k.progression!.state().equipped?.weapon === 'item.stab.esche') stabAt = ctx.loop.time - t0;
        if (goal) {
          const p = P();
          const g = goal as { x: number; z: number };
          ctx.player.yaw = Math.atan2(-(g.x - p.x), -(g.z - p.z));
          inp.simulate('KeyW', true);
          inp.simulate('ShiftLeft', Math.hypot(g.x - p.x, g.z - p.z) > 6);
        }
        k.step(15);
        inp.simulate('KeyW', false);
        inp.simulate('ShiftLeft', false);
      }
      off();
      offObj();
      return { fightAt, stabAt, maxCards, seen, beat: k.story!.state().beat, quest: k.quests!.state().quests['q.p.feldstation']?.state };
    },
    { CARDS: CARDS_JS },
  );
  console.log('[pacing] first 60 s:', JSON.stringify(run));
  await shot(page, '02-first-fight');
  // the Messstab is the first thing, a few metres from the door
  expect(run.stabAt).toBeGreaterThanOrEqual(0);
  expect(run.stabAt).toBeLessThan(20);
  // the title flow (warning, name, lantern) takes a player ~10 s; the fight starts well inside the minute
  expect(run.fightAt).toBeGreaterThan(0);
  expect(run.fightAt).toBeLessThanOrEqual(45);
  expect(run.maxCards).toBeLessThanOrEqual(1);

  // the fight: three easy Nebelinge; while it runs no card comes up; afterwards reward and skill
  // cards come one after the other
  const fight = await page.evaluate(
    ({ CARDS }) => {
      const k = window.kq!;
      const c = k.combat!;
      const samples: string[][] = [];
      c.god(true);
      const group = 'q.p.feldstation.nebel';
      const n = c.enemies().filter((e) => e.group === group).length;
      // swing at them like a player (the Messstab, then the hook for what still stands)
      for (const e of c.enemies().filter((e) => e.group === group)) {
        const p = k.ctx.player.position;
        c.place(e.id, p.x - Math.sin(k.ctx.player.yaw) * 2, p.z - Math.cos(k.ctx.player.yaw) * 2, true);
      }
      k.step(2);
      c.hit(3);
      for (let i = 0; i < 6; i++) {
        samples.push((0, eval)(CARDS) as string[]);
        k.step(10);
      }
      const during = samples.flat();
      c.kill(group);
      return { n, during };
    },
    { CARDS: CARDS_JS },
  );
  // the reward / skill cards run on rendered frames (one per step) and CSS time: sample like a
  // player watching, a frame batch at a time with real time in between
  const samples: string[][] = [];
  const shots = new Set<string>();
  // (a spoken line holds slide-in cards up to SOFT_MAX s, so reward and skill may come in either order)
  for (let i = 0; i < 300 && (i < 110 || !samples.some((x) => x.includes('reward'))); i++) {
    samples.push(
      await page.evaluate((CARDS) => {
        const k = window.kq!;
        for (let j = 0; j < 6; j++) k.step(j === 0 ? 6 : 1);
        return (0, eval)(CARDS) as string[];
      }, CARDS_JS),
    );
    const last = samples[samples.length - 1]!;
    for (const kind of last) if (!shots.has(kind) && shots.size < 3) {
      shots.add(kind);
      await shot(page, `03-card-${kind}`);
    }
    await page.waitForTimeout(40);
  }
  const after = {
    ...fight,
    max: Math.max(...samples.map((s) => s.length)),
    kinds: [...new Set(samples.flat())],
    ...(await page.evaluate(() => {
      const k = window.kq!;
      k.combat!.god(false);
      return { quest: k.quests!.state().quests['q.p.feldstation']?.state, beat: k.story!.state().beat };
    })),
  };
  console.log('[pacing] after the fight:', JSON.stringify(after));
  expect(after.n).toBe(3);
  expect(after.during.filter((x) => x !== 'clue')).toEqual([]);
  expect(after.quest).toBe('done');
  expect(after.beat).toBe('p2');
  expect(after.kinds).toEqual(expect.arrayContaining(['reward']));
  expect(after.max).toBeLessThanOrEqual(1);
  await shot(page, '03-after-fight');
  expect(errors).toEqual([]);
});

test('the Pinnwand hands out two field-book pages: they come one after the other, never stacked', async ({ page }) => {
  const errors = trackErrors(page);
  await newGame(page, 'Alex');
  await page.evaluate(() => {
    const k = window.kq!;
    k.step(60);
    k.teleport(1059.3, -833.1, 50);
    k.step(4);
    k.press('KeyE', 2);
  });
  await expect(page.getByTestId('hub')).toBeVisible();
  await page.getByTestId('hub-chronik').click({ force: true });
  await page.evaluate(() => window.kq!.step(2));
  await expect(page.getByTestId('chronik-card')).toHaveCount(1);
  const first = await page.getByTestId('chronik-card').getAttribute('data-clue');
  await shot(page, '04-pinnwand-one-card');
  // put it away: the second page follows after a short beat
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })));
  await page.evaluate(() => {
    for (let i = 0; i < 40 && !document.querySelector('[data-testid="chronik-card"]'); i++) window.kq!.step(1);
  });
  await expect(page.getByTestId('chronik-card')).toHaveCount(1);
  expect(await page.getByTestId('chronik-card').getAttribute('data-clue')).not.toBe(first);
  const clues = await page.evaluate(() => window.kq!.state().inventory.clues);
  expect(clues).toEqual(expect.arrayContaining(['clue.p.lageplan', 'clue.p.messtischblatt']));
  expect(errors).toEqual([]);
});

test('Escape handles the top panel, then the visible toast, then pause', async ({ page }) => {
  await page.goto('./?notitle&nosave&fresh&manual&idle&x=1452&z=-640');
  await page.waitForFunction(() => !!window.kq?.travel && !!window.kq?.notes && !window.kq.ctx.pause.reasons.has('title'));
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.ui.toast('Karte ergänzt', 30000);
    k.ctx.ui.toast('Aufgabe erfüllt', 30000);
    k.step(1);
  });
  const activeToast = page.locator('.kq-toast:not(.kq-notice-out)');
  await expect(activeToast).toHaveText('Karte ergänzt');

  await page.keyboard.press('e');
  await page.keyboard.press('Space');
  const bindingsReached = await page.evaluate(() => {
    const { input } = window.kq!.ctx;
    return input.wasPressed('listen') && input.wasPressed('dodge');
  });
  expect(bindingsReached).toBe(true);
  await expect(activeToast).toHaveText('Karte ergänzt');

  await page.evaluate(() => window.kq!.travel!.map(true));
  const map = page.getByTestId('travel-map');
  await expect(map).toBeVisible();
  await expect(activeToast).toBeHidden();
  await page.keyboard.down('Escape');
  await expect(map).toBeHidden();
  await expect(activeToast).toBeVisible();
  await page.keyboard.down('Escape'); // held key, delivered as a repeat
  await page.keyboard.up('Escape');
  await expect(activeToast).toHaveText('Karte ergänzt');
  await expect(page.getByTestId('resume')).toBeHidden();

  await page.keyboard.press('F8');
  const notesText = page.getByTestId('notes-text');
  await expect(notesText).toBeFocused();
  await notesText.fill('Eintrag');
  await page.keyboard.press('Space');
  await expect(notesText).toHaveValue('Eintrag ');
  await expect(activeToast).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(notesText).toBeHidden();
  await expect(activeToast).toHaveText('Karte ergänzt');

  await page.evaluate(() => {
    window.kq!.ctx.ui.modals.open({
      title: 'Eine Wahl treffen',
      closable: false,
      actions: [{ label: 'Auswählen' }],
    });
  });
  const choice = page.getByRole('button', { name: 'Auswählen' });
  await expect(choice).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(choice).toBeFocused();
  await expect(activeToast).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(choice).toBeHidden();
  await expect(activeToast).toBeVisible();

  await page.keyboard.down('Escape');
  await expect(activeToast).toHaveCount(0);
  await page.evaluate(() => {
    for (let i = 0; i < 24; i++) window.kq!.step(1);
  });
  await expect(activeToast).toHaveText('Aufgabe erfüllt');
  await page.keyboard.down('Escape');
  await page.keyboard.up('Escape');
  await expect(activeToast).toHaveText('Aufgabe erfüllt');

  await page.keyboard.press('Enter');
  await expect(activeToast).toHaveCount(0);
  const resume = page.getByTestId('resume');
  await expect(resume).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(resume).toBeVisible();
});
