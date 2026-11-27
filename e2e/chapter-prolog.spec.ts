import { readFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { SAVE_KEY } from '../src/core/save';
import { trackErrors } from './helpers/common';
import { newGame, story } from './helpers/prolog';
import { waitForHooks } from './helpers/pause';
import { expectHandover } from './helpers/tour';

test.describe.configure({ timeout: ciScale(600_000) });

test('an old classic bookmark starts the tour and the legacy chapter is unavailable', async ({ page }) => {
  const errors = trackErrors(page);
  await newGame(page, 'Mara', false, './?classic&nosave&fresh&manual&q=low');
  expect(await story(page)).toMatchObject({ chapter: 'tour', beat: 't1', name: 'Mara', era: 'today' });
  await expect(page.getByTestId('story-card')).toContainText('Die Führung');
  const jump = await page.evaluate(() => {
    try {
      window.kq!.story!.goto('prolog', 'p1');
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  });
  expect(jump).toContain("unknown chapter 'prolog'");
  expect((await story(page)).chapter).toBe('tour');
  expect(errors).toEqual([]);
});

async function continueGame(page: Page): Promise<void> {
  await waitForHooks(page, ['story', 'quests', 'combat', 'progression', 'fx', 'quelle']);
  const button = page.getByTestId('title-continue');
  await expect(button).toHaveText('Weiter');
  await button.tap();
  await expect(page.getByTestId('title')).toBeHidden();
}

test.describe('landscape touch Continue with reduced motion', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

  test('a release slot resumes at the K1 spring, crosses, saves and reloads', async ({ page }) => {
    const errors = trackErrors(page);
    const bytes = readFileSync(new URL('../tests/fixtures/saves/v0.8.0.json', import.meta.url), 'utf8');
    await page.addInitScript(({ key, bytes }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, bytes);
    }, { key: SAVE_KEY('auto'), bytes });
    await page.goto('./?manual&q=low');
    await continueGame(page);
    await page.waitForFunction(() => {
      const k = window.kq!;
      k.step(1);
      return k.quelle!.info().prompt && k.story!.state().objective?.id === 'k1.quelle';
    });
    expect(await story(page)).toMatchObject({ chapter: 'k1', beat: 'k1_0', era: 'today', name: 'Mara', completed: ['tour'] });
    await expectHandover(page);
    const counts = await page.evaluate(() => {
      const k = window.kq!;
      return {
        quests: k.quests!.state().quests,
        tracker: k.quests!.tracked(),
        retiredGroups: Object.keys(k.state().systems.combat?.groups ?? {}).filter((id) => id.startsWith('q.p.')),
        xp: k.progression!.state().xp,
      };
    });
    expect(counts.quests).toMatchObject({
      'q.p.feldstation': { state: 'done', counts: { stab: 1, nebel: 3 } },
      'q.p.relief': { state: 'active', counts: { damm: 1, mauer: 1 } },
      'q.k1.ankunft': { state: 'active' },
    });
    expect(counts.tracker).toEqual(['q.k1.ankunft']);
    expect(counts.retiredGroups).toEqual([]);
    expect(counts.xp).toBe(549);

    await page.getByTestId('touch-interact').tap();
    await page.evaluate(() => {
      const k = window.kq!;
      for (let i = 0; i < 60 && !k.fx!.state().shift.active; i++) k.step(6);
      k.fx!.shiftAt(3.6);
      k.fx!.freeze(false);
      k.step(12);
    });
    expect(await story(page)).toMatchObject({ chapter: 'k1', beat: 'k1_0b', era: '1789' });
    expect(await page.evaluate(() => window.kq!.quests!.state().quests['q.k1.ankunft']?.counts.quelle)).toBe(1);

    await page.getByTestId('touch-pause').tap();
    await page.getByTestId('pause-save').tap();
    await expect(page.getByText('Spielstand gespeichert.', { exact: true })).toBeVisible();
    await page.reload();
    await continueGame(page);
    expect(await story(page)).toMatchObject({ chapter: 'k1', beat: 'k1_0b', era: '1789', name: 'Mara' });
    expect(await page.evaluate(() => window.kq!.quests!.state().quests['q.k1.ankunft']?.counts.quelle)).toBe(1);
    expect(await page.evaluate(() => window.kq!.progression!.state().xp)).toBe(549);
    expect(errors).toEqual([]);
  });
});
