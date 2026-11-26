import { expect, test, type Page } from '@playwright/test';
import { trackErrors } from './helpers/common';

const QUEST = 'q.k3.jaguar';

async function boot(page: Page, fresh: boolean): Promise<void> {
  await page.goto(`./?notitle&manual&q=low${fresh ? '&fresh' : ''}`);
  await page.waitForFunction(() => !!window.kq?.quests && !!window.kq?.menagerie && !!window.kq?.progression, null, { timeout: 180_000 });
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
    const grants: number[] = [];
    events.on('xp:grant', ({ reason, amount }) => {
      if (reason === `quest:${id}`) grants.push(amount);
    });
    k.setEra('1793-07');
    events.emit('menagerie:spawn', { id: 'k3.jaguar', animal: 'jaguar', x: 1276, z: -1418 });
    const before = k.menagerie!.state().some((animal) => animal.id === 'k3.jaguar');
    for (let i = 0; i < 3; i++) events.emit('combat:bann', { x: 1276, z: -1418, yaw: 0, range: 8, angle: 60 });
    const calmed = state.state.systems.menagerie?.calmed;
    const offered = k.quests!.offer(id);
    events.emit('quest:accept', { id, npc: 'hanne' });
    k.step(4);
    return { before, offered, calmed, grants };
  }, QUEST);
  expect(outcomes).toEqual({ before: true, offered: true, calmed: ['k3.jaguar'], grants: [200] });
  expect(await result(page)).toMatchObject({ quest: { state: 'done', counts: { jaguar: 1 } }, jaguarPresent: false, oil: 2 });
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
    return k.ctx.save.save();
  }, QUEST);
  expect(saved).toBe(true);
  const stranded = await result(page);
  expect(stranded).toMatchObject({ quest: { state: 'active' }, jaguarPresent: false, oil: 0 });

  await boot(page, false);
  const recovered = await result(page);
  expect(recovered).toMatchObject({ quest: { state: 'done', counts: { jaguar: 1 } }, jaguarPresent: false, oil: 2 });
  expect(recovered.xp - stranded.xp).toBeGreaterThanOrEqual(200);

  await boot(page, false);
  expect(await result(page)).toEqual(recovered);
  expect(errors).toEqual([]);
});
