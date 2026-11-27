import { expect, test, type Page } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { SAVE_KEY } from '../src/core/save';
import { createInitialState, type GameState } from '../src/core/state';
import { createQuestSlice } from '../src/systems/quests/logic';
import { createStorySlice } from '../src/systems/story/engine';
import { trackErrors } from './helpers/common';
import { waitForHooks } from './helpers/pause';

test.use({ reducedMotion: 'reduce' });

async function continueGame(page: Page, beat: string): Promise<void> {
  await waitForHooks(page, ['story', 'quests'], undefined, 'render');
  const button = page.getByTestId('title-continue');
  await expect(button).toHaveText('Weiter');
  await button.click();
  await expect(page.getByTestId('title')).toBeHidden();
  expect(await page.evaluate(() => window.kq!.story!.state().beat)).toBe(beat);
}

for (const { from, previous, next, quest, x, z } of [
  { from: 'k3_2', previous: 'q.k3.strohmann', next: 'k3_3', quest: 'q.k3.festsaal', x: 1224, z: -1119 },
  { from: 'k3_6', previous: 'q.k3.festsaal', next: 'k3_7', quest: 'q.k3.hunde', x: 1270, z: -1293 },
]) {
  test(`Chapter 3 Continue starts ${quest} in the first ${next} autosave`, async ({ page }) => {
    test.setTimeout(ciScale(360_000));
    const errors = trackErrors(page);
    const state = createInitialState();
    state.era = '1793-07';
    Object.assign(state.player, { x, z });
    state.meta.savedAt = new Date(0).toISOString();
    state.systems.story = { ...createStorySlice(), chapter: 'k3', active: true, beat: from };
    state.systems.quests = createQuestSlice();
    state.systems.quests.quests[previous] = { state: 'done', counts: {}, t: 0 };

    await page.addInitScript(({ key, bytes }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, bytes);
    }, { key: SAVE_KEY('auto'), bytes: JSON.stringify(state) });
    await page.goto('./?manual&q=low');
    await continueGame(page, from);

    // Read the first transition save before any later update can replace it.
    const saved = await page.evaluate((key) => {
      window.kq!.step(1);
      return JSON.parse(localStorage.getItem(key)!) as GameState;
    }, SAVE_KEY('auto'));
    expect(saved.systems.story?.beat).toBe(next);
    expect(saved.systems.quests?.quests[quest]?.state).toBe('active');

    await page.reload();
    await continueGame(page, next);
    expect(await page.evaluate((id) => {
      const k = window.kq!;
      return { beat: k.story!.state().beat, quest: k.quests!.state().quests[id]?.state };
    }, quest)).toEqual({ beat: next, quest: 'active' });
    expect(errors).toEqual([]);
  });
}
