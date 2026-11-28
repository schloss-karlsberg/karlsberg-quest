import { readFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { SAVE_KEY } from '../src/core/save';
import { createInitialState } from '../src/core/state';
import { ARRIVAL_PITCH, arrivalSpot } from '../src/systems/quelle/layout';
import { createStorySlice } from '../src/systems/story/engine';
import { HOME } from '../src/systems/story/hub/home';
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

  test('Continue during the first shift arrives facing the palace and gives back control', async ({ page }) => {
    const errors = trackErrors(page);
    const { x, z, yaw } = HOME.spawn;
    const state = createInitialState();
    Object.assign(state.player, { x, z, yaw: -yaw * Math.PI / 180 });
    state.meta.savedAt = new Date().toISOString();
    state.systems.story = { ...createStorySlice(), active: true, chapter: 'tour', beat: 't18' };
    await page.addInitScript(({ key, bytes }) => localStorage.setItem(key, bytes), {
      key: SAVE_KEY('auto'), bytes: JSON.stringify(state),
    });
    await page.goto('./?manual&idle&q=low');
    await continueGame(page);
    await page.evaluate(() => window.kq!.step(120));
    await page.waitForFunction(() => {
      const k = window.kq!;
      return k.ctx.era.current === '1789' && !k.fx!.state().shift.active && !k.ctx.player.frozen;
    });
    const arrived = await page.evaluate(() => {
      const { position, yaw, pitch, lookLocked } = window.kq!.ctx.player;
      return { x: position.x, z: position.z, yaw, pitch, lookLocked, scene: window.kq!.quelle!.info().scene };
    });
    const expected = arrivalSpot(x, z);
    expect(Math.hypot(arrived.x - expected.x, arrived.z - expected.z)).toBeLessThan(0.5);
    expect(arrived.yaw).toBeCloseTo(expected.yaw, 2);
    expect(arrived.pitch).toBeCloseTo(ARRIVAL_PITCH, 2);
    expect(arrived).toMatchObject({ lookLocked: false, scene: null });
    expect(errors).toEqual([]);
  });

  test('a release slot resumes at the K1 spring in 1789, saves and reloads', async ({ page }) => {
    const errors = trackErrors(page);
    const bytes = readFileSync(new URL('../tests/fixtures/saves/v0.8.0.json', import.meta.url), 'utf8');
    await page.addInitScript(({ key, bytes }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, bytes);
    }, { key: SAVE_KEY('auto'), bytes });
    await page.goto('./?manual&q=low');
    await continueGame(page);
    // the old surveyor slot continues where the tour's touch leaves a new player: 1789, the prelude
    await page.waitForFunction(() => {
      const k = window.kq!;
      k.step(6);
      k.story!.flush();
      return k.story!.state().beat === 'k1_0b' && k.story!.state().objective?.id === 'k1.rock' && k.quests!.state().quests['q.k1.ankunft']?.state === 'active';
    });
    expect(await story(page)).toMatchObject({ chapter: 'k1', beat: 'k1_0b', era: '1789', name: 'Mara', completed: ['tour'] });
    expect(await page.evaluate(() => window.kq!.quelle!.info().prompt), 'no touch is asked for').toBe(false);
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
    expect([...counts.tracker].sort()).toEqual(['q.k1.ankunft', 'q.k1.kleider']);
    expect(counts.retiredGroups).toEqual([]);
    expect(counts.xp).toBe(549);

    expect(await page.evaluate(() => window.kq!.quests!.state().quests['q.k1.ankunft']?.counts.quelle)).toBeUndefined();

    await page.getByTestId('touch-pause').tap();
    await page.getByTestId('pause-save').tap();
    await expect(page.getByText('Spielstand gespeichert.', { exact: true })).toBeVisible();
    await page.reload();
    await continueGame(page);
    expect(await story(page)).toMatchObject({ chapter: 'k1', beat: 'k1_0b', era: '1789', name: 'Mara' });
    expect(await page.evaluate(() => window.kq!.quests!.state().quests['q.k1.ankunft']?.state)).toBe('active');
    expect(await page.evaluate(() => window.kq!.progression!.state().xp)).toBe(549);
    expect(errors).toEqual([]);
  });
});
