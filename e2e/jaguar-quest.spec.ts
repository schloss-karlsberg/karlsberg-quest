import { expect, test, type Page } from '@playwright/test';
import { trackErrors } from './helpers/common';
import { waitForHooks } from './helpers/pause';

const QUEST = 'q.k3.jaguar';

async function boot(page: Page, fresh: boolean, title = false): Promise<void> {
  await page.goto(`./?manual&q=low${title ? '' : '&notitle'}${fresh ? '&fresh' : ''}`);
  await waitForHooks(page, ['quests', 'menagerie', 'progression', 'npc', 'story']);
  if (title) await expect(page.getByTestId('title-continue')).toBeEnabled({ timeout: 180_000 });
}

async function result(page: Page) {
  return page.evaluate((id) => {
    const k = window.kq!;
    const progression = k.progression!.state();
    return {
      quest: k.quests!.state().quests[id],
      jaguarPresent: k.menagerie!.state().some((animal) => animal.id === 'k3.jaguar'),
      xp: progression.xp,
      oil: progression.inventory['item.lampenoel'] ?? 0,
    };
  }, QUEST);
}

test('accepting after three flares credits the saved calm exactly once', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  await boot(page, true);
  const outcomes = await page.evaluate((id) => {
    const k = window.kq!;
    const { events, state } = k.ctx;
    k.setEra('1793-07');
    events.emit('menagerie:spawn', { id: 'k3.jaguar', animal: 'jaguar', x: 1276, z: -1418 });
    const before = k.menagerie!.state().some((animal) => animal.id === 'k3.jaguar');
    for (let i = 0; i < 3; i++) events.emit('combat:bann', { x: 1276, z: -1418, yaw: 0, range: 8, angle: 60 });
    const calmed = state.state.systems.menagerie?.calmed;
    const offered = k.quests!.offer(id);
    k.npc!.spawn({ npc: 'hanne', x: 1270.5, z: -1293, era: '1793-07', chapter: 'k3g' });
    const talking = k.npc!.talk('hanne');
    k.npc!.drain();
    state.mutable.codex.facts.push('cx.12');
    return { before, offered, calmed, talking };
  }, QUEST);
  expect(outcomes).toEqual({ before: true, offered: true, calmed: ['k3.jaguar'], talking: true });
  const talk = page.getByTestId('npc-talk');
  await expect(talk).toBeVisible();
  await page.getByTestId(`npc-topic-q:${QUEST}`).click();
  await page.evaluate(() => window.kq!.npc!.drain());
  const before = await result(page);
  await page.getByTestId(`npc-topic-qa:${QUEST}`).click();

  await expect(talk).toBeVisible();
  const after = await result(page);
  expect(after).toMatchObject({ quest: { state: 'done', counts: { jaguar: 1 } }, jaguarPresent: false });
  expect(after.xp - before.xp).toBe(200);
  expect(after.oil - before.oil).toBe(2);
  const autosave = await page.evaluate((id) => {
    const k = window.kq!;
    const saved = k.ctx.save.peek()!.systems;
    return { paused: k.ctx.pause.paused, quest: saved.quests!.quests[id], xp: saved.progression!.xp, oil: saved.progression!.inventory['item.lampenoel'] };
  }, QUEST);
  expect(autosave).toEqual({ paused: true, quest: after.quest, xp: after.xp, oil: after.oil });
  expect(errors).toEqual([]);
});

test('loading a stranded save pays once even after the jaguar spawn was cleared', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = trackErrors(page);
  await boot(page, true);
  const saved = await page.evaluate((id) => {
    const k = window.kq!;
    k.setEra('1793-07');
    k.quests!.accept(id);
    k.ctx.state.mutable.systems.menagerie = { animals: [], calmed: ['k3.jaguar'] };
    k.ctx.state.mutable.codex.facts.push('cx.12');
    return k.ctx.save.save();
  }, QUEST);
  expect(saved).toBe(true);
  const stranded = await result(page);
  expect(stranded).toMatchObject({ quest: { state: 'active' }, jaguarPresent: false, oil: 0 });

  await boot(page, false, true);
  const recovered = await result(page);
  expect(recovered).toMatchObject({ quest: { state: 'done', counts: { jaguar: 1 } }, jaguarPresent: false, oil: 2 });
  expect(recovered.xp - stranded.xp).toBe(200);

  const presentation = () => page.evaluate(() => {
    const k = window.kq!;
    const { dialogue, pendingLines } = k.story!.state();
    return { speaker: dialogue?.speaker ?? null, pendingLines, reward: k.quests!.rewardPending() + Number(k.quests!.reward()) };
  });
  expect(await presentation()).toEqual({ speaker: null, pendingLines: 0, reward: 0 });
  await page.getByTestId('title-continue').click();
  await expect(page.getByTestId('title')).toBeHidden();
  expect(await presentation()).toMatchObject({ speaker: 'laub', reward: 1 });

  await boot(page, false);
  const reloaded = await result(page);
  expect(reloaded.xp - recovered.xp).toBe(0);
  expect(reloaded).toEqual(recovered);
  expect(await presentation()).toMatchObject({ reward: 0 });
  expect(errors).toEqual([]);
});
