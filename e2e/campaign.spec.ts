import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { ciScale, desktopViewport, isCI } from './helpers/ci';
import { SCREENS, throughParty, trackErrors } from './helpers/common';
import { K1_START, distTo, playK1 } from './helpers/k1';
import { playK2 } from './helpers/k2';
import { playK3 } from './helpers/k3';
import { playK4 } from './helpers/k4';
import { waitForHooks } from './helpers/pause';
import { newGame } from './helpers/prolog';
import { expectHandover, throughTour } from './helpers/tour';

/**
 * The whole campaign in one go, the way a player meets it: a new game from the title screen
 * (content warning, name, lantern), then the tour → chapter 1 → 2 → 3 → 4 → the ending →
 * epilogue → credits, each chapter played by the same steps as its chapter spec
 * (e2e/helpers/<chapter>.ts) but on the state the previous chapters really left behind (skills,
 * clues, flags, inventory) instead of a chapter-select start.
 *
 * On top of the chapter checks:
 *   - every chapter hands over to the next one (completed list, first beat, title card);
 *   - saves are on: in the middle of chapter 1 (Teil A done, at dusk) the page is reloaded, the
 *     title offers "Weiterspielen", and the game continues from the autosave with the same beat,
 *     clues, quest states (active / done, objective counts), level and XP, era and evening light;
 *     the chapter then plays on;
 *   - no console errors over the whole run (reload included).
 *
 * A second test plays each of the three endings (museum / burn / keep) from a story shortcut
 * and checks that its scene, epilogue and credits render.
 *
 * The tour runs on its fast path (e2e/helpers/tour.ts `throughTour`; its walk is e2e/tour-slice.spec.ts).
 * `CAMPAIGN_TO=k1` stops once chapter 1 has begun (the new-game path alone: title → tour → k1).
 *
 * Chapters 3 and 4 are quest chains (contentB): `CAMPAIGN_FROM=k3` starts there, from the kept save
 * of an earlier run or, without one, from a new game with the skills and level of that point.
 *
 * Screenshots: test-results/screens/campaign-*.png (each chapter's start, the reload, the ending).
 * CAMPAIGN_FASTSTEP=0 runs the same checks with ordinary manual drawing and voice playback.
 */
test.describe.configure({ timeout: ciScale(4 * 3_600_000) });
const fastStep = process.env.CAMPAIGN_FASTSTEP !== '0';
const clockParams = fastStep ? 'manual&faststep' : 'manual';

async function shot(page: Page, name: string): Promise<void> {
  // software WebGL on a loaded machine: a frame can stall; one retry, then go on
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (!isCI) await page.setViewportSize(desktopViewport);
      await page.evaluate(() => window.kq!.screenshotReady());
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${SCREENS}/campaign-${name}.png`, timeout: ciScale(150_000) });
      return;
    } catch (e) {
      if (attempt === 1) console.warn(`screenshot ${name} skipped: ${(e as Error).message.split('\n')[0]}`);
    }
  }
}

const story = (page: Page) => page.evaluate(() => window.kq!.story!.state());

/**
 * The chapter after `prev` has begun: completed list, first beat, at home (the Quelle) in the present,
 * standing, and nothing of the previous chapter still being said. (Quick: the chapter's own play
 * function checks its title card next, which fades after 5.5 s of real time; the picture is taken
 * by the chapter's 'start' hook.)
 */
async function chapterStart(page: Page, prev: string, chapter: string, first: string): Promise<void> {
  const s = await story(page);
  expect(s.completed, `${prev} completed`).toContain(prev);
  expect(s.chapter).toBe(chapter);
  expect(s.beat, `${chapter} starts at its first beat`).toBe(first);
  expect(s.era).toBe('today');
  expect(s.finished).toBeFalsy();
  expect(s.dialogue?.id ?? '', 'no line of the previous chapter runs on').not.toMatch(new RegExp(`\\.${prev === 'tour' ? 't' : prev}\\.`));
  expect(await page.evaluate(() => window.kq!.ctx.player.stance)).toBe('stand');
  console.log(`[campaign] ${chapter} starts · ${Math.round(await page.evaluate(() => window.kq!.state().meta.playSeconds))} s of game time so far`);
}

/** The chapter's 'start' hook: its first picture. */
const startShot = (page: Page, label: string, name: string) => async (l: string) => {
  if (l === label) await shot(page, name);
};

interface Snapshot {
  chapter: string | null;
  beat: string | null;
  era: string;
  clues: string[];
  nouns: string[];
  /** quest id → state (the quest log), and the objective counts of the running ones. */
  quests: Record<string, string>;
  counts: Record<string, Record<string, number>>;
  level: number;
  xp: number;
  skills: Record<string, number>;
  look: string | undefined;
}

/** What the autosave in localStorage holds (the slot "Weiterspielen" continues). */
function savedSnapshot(page: Page): Promise<Snapshot | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('kq.save.v1.auto');
    if (!raw) return null;
    // the quest log: every quest's state, and the counts of those still running
    const questsOf = (q: unknown) => {
      const all = ((q as { quests?: Record<string, { state: string; counts: Record<string, number> }> } | undefined)?.quests ?? {}) as Record<string, { state: string; counts: Record<string, number> }>;
      const quests: Record<string, string> = {};
      const counts: Record<string, Record<string, number>> = {};
      for (const [id, p] of Object.entries(all)) {
        quests[id] = p.state;
        if (p.state === 'active' || p.state === 'ready') counts[id] = { ...p.counts };
      }
      return { quests, counts };
    };
    // biome-ignore lint/suspicious/noExplicitAny: the raw save
    const s = JSON.parse(raw) as any;
    const st = s.systems?.story ?? {};
    return {
      chapter: st.chapter ?? null,
      beat: st.beat ?? null,
      era: s.era,
      clues: [...s.inventory.clues].sort(),
      nouns: [...s.inventory.nouns].sort(),
      ...questsOf(s.systems?.quests),
      level: s.systems?.progression?.level ?? 1,
      xp: s.systems?.progression?.xp ?? 0,
      skills: s.skills ?? {},
      look: st.look,
    };
  });
}
function liveSnapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const k = window.kq!;
    const s = k.state();
    const st = k.story!.state();
    // the quest log: every quest's state, and the counts of those still running
    const questsOf = (q: unknown) => {
      const all = ((q as { quests?: Record<string, { state: string; counts: Record<string, number> }> } | undefined)?.quests ?? {}) as Record<string, { state: string; counts: Record<string, number> }>;
      const quests: Record<string, string> = {};
      const counts: Record<string, Record<string, number>> = {};
      for (const [id, p] of Object.entries(all)) {
        quests[id] = p.state;
        if (p.state === 'active' || p.state === 'ready') counts[id] = { ...p.counts };
      }
      return { quests, counts };
    };
    return {
      chapter: st.chapter,
      beat: st.beat,
      era: s.era,
      clues: [...s.inventory.clues].sort(),
      nouns: [...s.inventory.nouns].sort(),
      ...questsOf((s.systems as Record<string, unknown>).quests),
      level: ((s.systems as Record<string, { level?: number }>).progression?.level ?? 1) as number,
      xp: ((s.systems as Record<string, { xp?: number }>).progression?.xp ?? 0) as number,
      skills: { ...s.skills } as Record<string, number>,
      look: st.look,
    };
  });
}

/**
 * Close the tab mid-chapter and come back: no manual save, only what the game autosaved (beat
 * changes and quest turn-ins are forced saves). The title offers "Weiterspielen".
 */
async function reloadAndContinue(page: Page): Promise<void> {
  const live = await liveSnapshot(page);
  const saved = await savedSnapshot(page);
  expect(saved, 'an autosave exists').not.toBeNull();
  // the beat change / quest turn-in just before were forced saves: the slot is up to date
  expect(saved).toMatchObject({ chapter: live.chapter, beat: live.beat, era: live.era, quests: live.quests, level: live.level });
  await page.goto(`./?${clockParams}`);
  const cont = page.getByTestId('title-continue');
  await expect(cont).toBeVisible({ timeout: 180_000 });
  await expect(cont).toBeEnabled({ timeout: 180_000 });
  await waitForHooks(page, ['story', 'chronik', 'hunt', 'npc', 'menagerie']);
  await shot(page, '02b-reload-title');
  const resumed = page.evaluate(() => new Promise<boolean>((res) => window.kq!.ctx.events.on('game:start', ({ resumed }) => res(resumed))));
  await cont.click();
  await expect(page.getByTestId('title')).toBeHidden({ timeout: 30_000 });
  expect(await resumed, 'game:start reports a resumed game').toBe(true);
  await page.evaluate(() => window.kq!.step(30));
  const after = await liveSnapshot(page);
  expect(after).toMatchObject({ chapter: saved!.chapter, beat: saved!.beat, era: saved!.era, quests: saved!.quests, counts: saved!.counts, level: saved!.level, xp: saved!.xp, clues: saved!.clues, nouns: saved!.nouns, look: saved!.look });
  expect(after.skills).toMatchObject(saved!.skills);
  // the present-day evening light comes back with the save
  expect(after.look).toBe('dusk');
  // the case's objective / HUD are back (the story resynced), and nothing of the title remains
  expect(await page.evaluate(() => window.kq!.story!.state().active)).toBe(true);
  await page.evaluate(() => window.kq!.teleport(757.5, -899, 30, -2));
  await page.evaluate(() => window.kq!.step(10));
  await shot(page, '02c-continued');
}

/** Where each chapter's starting save is kept (for `CAMPAIGN_FROM`). */
const SAVES = 'test-results/campaign-saves';

/**
 * Keep the save at a chapter's start (test-results/campaign-saves/<chapter>.json). Development:
 * `CAMPAIGN_FROM=k2 pnpm exec playwright test e2e/campaign.spec.ts` continues from that save
 * instead of replaying everything before it.
 */
async function keepSave(page: Page, chapter: string): Promise<void> {
  const raw = await page.evaluate(() => {
    window.kq!.ctx.save.save('auto', 'campaign');
    return localStorage.getItem('kq.save.v1.auto');
  });
  mkdirSync(SAVES, { recursive: true });
  if (raw) writeFileSync(`${SAVES}/${chapter}.json`, raw);
}

/**
 * Continue the kept save of `chapter` from the title screen and start that chapter afresh. With no
 * kept save (`CAMPAIGN_FROM=k3` on a clean checkout) the chapter starts from a new game that has
 * what the chapters before it give: the survey skills and the level the §6.1 curve expects there.
 */
async function resumeFrom(page: Page, chapter: string): Promise<void> {
  if (!existsSync(`${SAVES}/${chapter}.json`)) {
    const level: Record<string, number> = { k1: 3, k2: 5, k3: 8, k4: 10 };
    await page.goto(`./?notitle&fresh&${clockParams}`);
    await waitForHooks(page, ['story', 'chronik', 'hunt', 'npc', 'menagerie']);
    await page.evaluate(
      ({ c, lvl }) => {
        const k = window.kq!;
        k.ctx.state.mutable.flags['barks.quiet'] = true;
        k.skills!.all(true);
        k.story!.start('Mara');
        (k as unknown as { progression?: { level(n: number): void } }).progression?.level(lvl);
        k.story!.goto(c);
        k.step(4);
      },
      { c: chapter, lvl: level[chapter] ?? 1 },
    );
    return;
  }
  const raw = readFileSync(`${SAVES}/${chapter}.json`, 'utf8');
  await page.addInitScript((raw) => {
    if (!sessionStorage.getItem('kq.campaign.seeded')) {
      localStorage.setItem('kq.save.v1.auto', raw);
      sessionStorage.setItem('kq.campaign.seeded', '1');
    }
  }, raw);
  await page.goto(`./?${clockParams}`);
  const cont = page.getByTestId('title-continue');
  await expect(cont).toBeEnabled({ timeout: 180_000 });
  await waitForHooks(page, ['story', 'chronik', 'hunt', 'npc', 'menagerie']);
  await cont.click();
  await expect(page.getByTestId('title')).toBeHidden({ timeout: 30_000 });
  await page.evaluate((c) => {
    window.kq!.story!.goto(c);
    window.kq!.step(4);
  }, chapter);
}

const ORDER = ['tour', 'k1', 'k2', 'k3', 'k4'] as const;

test('campaign: new game → tour → chapters 1–4 → ending → credits', async ({ page }) => {
  const errors = trackErrors(page);
  const t0 = Date.now();
  const lap = (what: string) => console.log(`[campaign] ${what} after ${Math.round((Date.now() - t0) / 60_000)} min`);
  const from = (process.env.CAMPAIGN_FROM ?? 'tour') as (typeof ORDER)[number];
  expect(ORDER).toContain(from);
  const play = (c: (typeof ORDER)[number]) => ORDER.indexOf(c) >= ORDER.indexOf(from);
  let s;

  if (from === 'tour') {
    // ---- a new game from the title screen, with saves on: it opens with the tour ----------------
    await newGame(page, 'Mara', false, `./?${clockParams}`);
    s = await story(page);
    expect(s).toMatchObject({ active: true, chapter: 'tour', beat: 't1', name: 'Mara', era: 'today' });
    expect(await page.evaluate(() => window.kq!.ctx.save.has())).toBe(true);
    await page.waitForTimeout(1500);
    await shot(page, '00-tour-start');

    // ---- the tour (fast path) and the hand-over -------------------------------------------------
    await throughTour(page);
    if (fastStep) {
      const voice = await page.evaluate(() => window.kq!.story!.voice.stats());
      expect(voice.manifest).toBe('none');
      expect(voice.clips).toBe(0);
      expect(voice.murmured).toBeGreaterThan(0);
    }
    lap('tour');
    await chapterStart(page, 'tour', 'k1', 'k1_0');
    // chapter 1 opens at the Karlsbergquelle (its checkpoint)
    expect(await distTo(page, K1_START.x, K1_START.z), 'k1 starts at the spring').toBeLessThan(30);
    // what the old prologue left behind, now from the tour (tests/tour-handover.test.ts)
    await expectHandover(page);
    if (process.env.CAMPAIGN_TO === 'k1') {
      expect(errors).toEqual([]);
      return;
    }
    // from here on, as in the chapter specs: no random barks (deterministic lines; barks have their own specs)
    await page.evaluate(() => {
      window.kq!.ctx.state.mutable.flags['barks.quiet'] = true;
    });
  } else await resumeFrom(page, from);

  // ---- chapter 1, with a reload in the middle ------------------------------------------------------
  if (play('k1')) {
    await keepSave(page, 'k1');
    let reloaded = false;
    await playK1(page, {
      shots: false,
      at: async (label) => {
        await startShot(page, 'k1:start', '01-k1-start')(label);
        if (label !== 'k1:teil-a-done') return;
        await reloadAndContinue(page);
        reloaded = true;
      },
    });
    expect(reloaded).toBe(true);
    lap('chapter 1');
    await chapterStart(page, 'k1', 'k2', 'k2_0');
  }

  // ---- chapter 2 ------------------------------------------------------------------------------------
  if (play('k2')) {
    await keepSave(page, 'k2');
    await playK2(page, { shots: false, at: startShot(page, 'k2:start', '03-k2-start') });
    lap('chapter 2');
    await chapterStart(page, 'k2', 'k3', 'k3_0');
  }

  // ---- chapter 3 ------------------------------------------------------------------------------------
  if (play('k3')) {
    await keepSave(page, 'k3');
    await playK3(page, { shots: false, at: startShot(page, 'k3:start', '04-k3-start') });
    lap('chapter 3');
    await chapterStart(page, 'k3', 'k4', 'k4_0');
  }

  // ---- chapter 4, the ending, the credits -----------------------------------------------------------
  await keepSave(page, 'k4');
  await playK4(page, {
    shots: false,
    at: async (label) => {
      await startShot(page, 'k4:start', '05-k4-start')(label);
      if (label === 'ending:choice') {
        s = await story(page);
        expect(s.completed).toEqual(expect.arrayContaining(from === 'tour' ? ['tour', 'k1', 'k2', 'k3', 'k4'] : ['k4']));
        expect(s.chapter).toBe('enden');
        await shot(page, '06-ending-choice');
      } else if (label === 'ending:epilogue') {
        // the epilogue is told from this run's deeds: side quests done, the saved object of chapter 3 …
        const epi = await page.getByTestId('epilogue').innerText();
        expect(epi.length).toBeGreaterThan(200);
        await shot(page, '07-epilogue');
      } else if (label === 'ending:credits') {
        // the credits strip over the party (bible 06-enden §8; content/party/credits.json); the
        // strip carries no player name, so the name is checked in the story state instead
        await expect(page.getByTestId('party-credits')).toBeVisible();
        await expect(page.getByTestId('party-credits-track')).toContainText('Open-Kirrberg');
        expect(await page.evaluate(() => window.kq!.party!.state().variant)).toBe('keep');
        expect((await story(page)).name).toBe('Mara');
        await shot(page, '08-credits');
      }
    },
  });
  lap('chapter 4 and the ending');
  s = await story(page);
  expect(s.ending).toBe('keep');
  expect(s.finished).toBe(true);
  // the finished game is saved
  const saved = await savedSnapshot(page);
  expect(saved?.chapter).toBe('enden');
  const playMinutes = Math.round((await page.evaluate(() => window.kq!.state().meta.playSeconds)) / 60);
  console.log(`[campaign] game time over the whole campaign: ${playMinutes} min (headless: walks are partly flown, reading is skipped)`);
  expect(errors).toEqual([]);
});

const ENDINGS = [
  { id: 'museum', flag: 'museum' },
  { id: 'burn', flag: 'verbrennen' },
  { id: 'keep', flag: 'behalten' },
] as const;

test('campaign: all three endings render their scene, epilogue and credits', async ({ page }) => {
  test.setTimeout(ciScale(1_800_000));
  const errors = trackErrors(page);
  for (const e of ENDINGS) {
    await page.goto(`./?notitle&nosave&fresh&${clockParams}`);
    await waitForHooks(page, ['story', 'chronik']);
    await page.evaluate(() => {
      const k = window.kq!;
      k.ctx.state.mutable.flags['barks.quiet'] = true;
      k.story!.start('Mara');
      // deeds of a played game (the epilogue is told from them)
      k.ctx.state.update((s) => {
        s.flags['quest.q.k1.hundenamen'] = 'done';
        s.flags['quest.q.k3.lehnstuhl'] = 'done';
        s.flags['flag.k2_tor'] = 'leuchten';
        s.flags['flag.k3_objekt'] = 'uhr';
      });
      k.story!.goto('enden');
      k.step(2);
      k.story!.flush();
      k.step(2);
    });
    // Laub's line, then the choice (game time)
    await page.evaluate(() => {
      const k = window.kq!;
      for (let i = 0; i < 40 && !document.querySelector('[data-testid="ending"]'); i++) k.step(30);
    });
    await expect(page.getByTestId('ending')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`ending-${e.id}`)).toBeVisible();
    // from the finale through the endings the staff stays down
    expect(await page.evaluate(() => window.kq!.state().flags['combat.disabled'])).toBe(true);
    await page.getByTestId(`ending-${e.id}`).click();
    await page.getByRole('button', { name: 'Ja', exact: true }).click();
    // the ending is staged in the engine first (endings/stage.ts): skip it
    await page.getByTestId('ending-stage-skip').click();
    await expect(page.getByTestId('ending-next')).toBeVisible();
    const scene = await page.getByTestId('ending').innerText();
    expect(scene, `${e.id}: scene text`).toContain('Laub');
    expect(scene).toContain('Marlene');
    await shot(page, `end-${e.id}-scene`);
    await page.getByTestId('ending-next').click();
    const epi = page.getByTestId('epilogue');
    await expect(epi).toBeVisible();
    const parts = await page.evaluate(() => ({
      intro: document.querySelector('.kqs-epi-intro')?.textContent?.trim() ?? '',
      lines: [...document.querySelectorAll('.kqs-epi-line')].map((n) => n.textContent?.trim() ?? '').filter(Boolean).length,
      outro: document.querySelector('.kqs-epi-outro')?.textContent?.trim() ?? '',
      object: document.querySelector('.kqs-epi-object')?.textContent?.trim() ?? '',
    }));
    expect(parts.intro, `${e.id}: epilogue intro`).not.toBe('');
    expect(parts.lines, `${e.id}: epilogue lines`).toBeGreaterThanOrEqual(3);
    expect(parts.outro, `${e.id}: epilogue outro`).not.toBe('');
    // no unreplaced placeholders anywhere in the ending pages
    expect(await epi.innerText()).not.toMatch(/\{[A-Za-z_]+\}|undefined|null/);
    await shot(page, `end-${e.id}-epilogue`);
    await page.getByTestId('ending-credits').click();
    await throughParty(page);
    await page.evaluate(() => window.kq!.step(4));
    const st = await page.evaluate(() => ({ story: window.kq!.story!.state(), flags: window.kq!.state().flags }));
    expect(st.story.ending).toBe(e.id);
    expect(st.story.finished).toBe(true);
    expect(st.flags['flag.end']).toBe(e.flag);
    if (e.id === 'keep') {
      expect(st.flags['shift.allowed']).toBe(true);
      expect(st.flags['shift.target']).toBe('1789');
    }
  }
  expect(errors).toEqual([]);
});
