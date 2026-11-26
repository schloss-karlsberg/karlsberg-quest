import { expect, test } from '@playwright/test';
import { trackErrors } from './helpers/common';
import { boot, endEcho, listen, payloads, settle, story } from './helpers/k2';
import { qn, qs } from './helpers/prolog';

test('chapter 2 credits the Pikeur after a late echo and repairs a stalled save', async ({ page }) => {
  const errors = trackErrors(page);
  const quest = 'q.k2.parforce';
  const group = 'k2.pikeur';
  await boot(page);
  await page.evaluate((quest) => {
    const k = window.kq!;
    k.quests!.offer(quest);
    k.quests!.accept(quest);
    k.ctx.state.mutable.inventory.clues.push('clue.k2.fackeln');
    k.setEra('1793-02');
    k.teleport(842, -878, 270, 0);
    k.story!.goto('k2', 'k2_11'); // straight to the dam, as if the player bypassed the parterre
    k.combat!.god(true);
  }, quest);
  await settle(page, 8);
  expect(await page.evaluate((group) => window.kq!.combat!.kill(group), group)).toBe(1);
  await settle(page, 8);
  expect(await page.evaluate((group) => window.kq!.combat!.groups()[group]?.killed, group)).toBe(1);
  expect(await qn(page, quest, 'kalk')).toBe(0);
  expect(await qn(page, quest, 'pikeur')).toBe(0);

  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1275, -960);
    k.step(30);
  });
  await listen(page, 'clue.k2.landremont');
  await endEcho(page);
  expect(await qn(page, quest, 'kalk')).toBe(1);
  expect(await qn(page, quest, 'pikeur')).toBe(1);

  // Save the old stalled state and load it through the game's normal save path.
  expect(await page.evaluate((quest) => {
    const { save, state } = window.kq!.ctx;
    state.mutable.systems.quests!.quests[quest]!.counts.pikeur = 0;
    state.mutable.flags[`quest.${quest}.pikeur`] = 0;
    save.enabled = true;
    const written = save.save('pikeur-regression');
    save.enabled = false;
    return written && save.load('pikeur-regression');
  }, quest)).toBe(true);
  expect(await qn(page, quest, 'pikeur')).toBe(1);
  expect((await payloads(page, 'xp:grant')).filter((p) => (p as { reason: string }).reason === 'enemy:pikeur')).toHaveLength(1);
  await page.evaluate(() => {
    const k = window.kq!;
    k.setEra('today');
    k.step(10);
  });
  expect(await qs(page, quest)).toBe('done');
  expect((await story(page)).beat).toBe('k2_12');
  expect(errors).toEqual([]);
});
