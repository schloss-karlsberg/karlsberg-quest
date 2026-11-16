import { expect, test } from '@playwright/test';
import { trackErrors } from './helpers/common';
import { install, killGroup } from './helpers/k3';
import { beat, boot, events, examineHere, playK4, run, settleShift, shot, story, walk } from './helpers/k4';

/**
 * Chapter 4 „Der Steinbruch" + the endings as a quest chain, played headless through window.kq
 * (`?manual`). The playthrough lives in e2e/helpers/k4.ts (shared with e2e/campaign.spec.ts).
 * Screenshots: test-results/screens/cnb-k4-*.png
 */
// software WebGL on a busy machine: the full chapter takes 13–20 min headless
test.describe.configure({ timeout: 1_800_000 });

test('chapter 4: Der Steinbruch, from the station to the kennel, and the endings', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    // a player arriving at chapter 4 has the survey skills of the earlier chapters
    k.skills!.all(true);
    k.story!.start('Alex');
    k.story!.goto('k4');
  });
  await run(page, 1);
  await playK4(page);
  expect(errors).toEqual([]);
});

test('chapter 4: the threats are fair (Steinfraß catch, soft homecoming, the empty lantern)', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.skills!.all(true);
    k.story!.start('Alex');
    k.story!.goto('k4', 'k4_5');
  });
  await run(page, 1);

  // ---- the Steinfraß fills → back at the station, resume at the Ehrenhof (anchor B) -------------
  await page.evaluate(() => window.kq!.teleport(1216, -1105));
  await run(page, 1);
  await page.evaluate(() => window.kq!.press('KeyQ', 2));
  await run(page, 0.5);
  await settleShift(page);
  await run(page, 2);
  let s = await story(page);
  expect(s.era).toBe('1796');
  expect(s.beat).toBe('k4_6');
  // the notice, then Der Steinbrecher; when it falls, the Steinfraß starts
  await examineHere(page, 'clue.k4.anschlag', 1195, -1110.5);
  await install(page);
  await page.evaluate(() => (window.kq as unknown as { combat: { god(on: boolean): void } }).combat.god(true));
  await killGroup(page, 'q.k4.steinplatz.brecher', 1);
  await run(page, 3);
  for (let i = 0; i < 30 && !(await page.evaluate(() => window.kq!.fx!.state().oblivion.active)); i++) await run(page, 1);
  expect((await page.evaluate(() => window.kq!.fx!.state())).oblivion.active).toBe(true);
  // the player stood still for too long
  await page.evaluate(() => window.kq!.fx!.oblivionT(0.995));
  await run(page, 3);
  expect(await events(page, 'player:caught')).toEqual([expect.objectContaining({ by: 'oblivion' })]);
  await run(page, 3);
  await settleShift(page);
  await run(page, 1);
  s = await story(page);
  expect(s.era).toBe('today');
  expect(s.beat).toBe('k4_5');
  const p = await page.evaluate(() => window.kq!.ctx.player.position);
  expect(Math.hypot(p.x - 760, p.z + 902)).toBeLessThan(10);
  // the boss stays beaten: the quest kept its count
  expect(await page.evaluate(() => window.kq!.state().flags['quest.q.k4.steinplatz.brecher'])).toBe(1);
  expect(await page.evaluate(() => window.kq!.state().flags['shift.x'])).toBe(1216);
  await shot(page, '20-vergessen-station');

  // ---- the drive: pushing past the hounds brings you home, nothing lost -----------------------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.state.update((st) => {
      st.flags['chronik.noLoss'] = true;
    });
    k.story!.goto('k4', 'k4_9');
    k.teleport(1380, -1474, 270);
  });
  await run(page, 3);
  expect((await page.evaluate(() => window.kq!.hunt!.mode()))?.mode).toBe('drive');
  const before = await page.evaluate(() => window.kq!.state().inventory.clues.length);
  await walk(page, 1470, -1440, 4); // away from the kennel, past the pack
  await run(page, 6);
  const caught = (await events(page, 'player:caught')) as { soft?: boolean }[];
  expect(caught.at(-1)?.soft).toBe(true);
  await run(page, 4);
  expect(await page.evaluate(() => window.kq!.state().inventory.clues.length)).toBe(before);
  expect(await beat(page)).toBe('k4_9');

  // ---- the finale with an empty lantern: Laub lends his light ---------------------------------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.lantern!.toggle(false);
    k.lantern!.setOil(0);
    k.story!.goto('k4', 'k4_12');
    k.teleport(1214, -1569, 30);
  });
  await run(page, 16);
  await page.evaluate(() => window.kq!.press('KeyX', 2));
  expect(await page.evaluate(() => window.kq!.lantern!.toggle(true))).toBe(false);
  await run(page, 32);
  expect((await story(page)).said).toContain('laub.k4.x.licht');
  expect(await page.evaluate(() => window.kq!.lantern!.state().lit)).toBe(true);
  await run(page, 30);
  expect((await events(page, 'hunt:finale')).map((x) => (x as { outcome: string }).outcome)).toEqual(expect.arrayContaining(['calmed', 'faded']));
  expect(await beat(page)).toBe('k4_13');
  expect(errors).toEqual([]);
});
