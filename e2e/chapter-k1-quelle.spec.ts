import { expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { trackErrors } from './helpers/common';
import { canTouch, REACH, toWorld, touchLocal } from '../src/systems/quelle/layout';
import { K1_START, SPRING, SPRING_WATER, boot, distTo, frames, openAtSpring, playDisguise, shiftToPast, shot, story, upd, walk } from './helpers/k1';

/**
 * Chapter 1 at the Karlsbergquelle (story k1_0 → k1_0b → k1_0c → k1_1). After the tour it goes on
 * in 1789 where the touch left the player (e2e/tour-slice.spec.ts, e2e/quelle.spec.ts). Booted
 * directly, as here and as a chapter replay does, it starts at the spring in the present: no dawn,
 * no second touch, Q at the spring (never at the Ehrenhof) leads into summer 1789, then the walk up
 * on foot past the Bleiche and the Orangerie (the disguise: coat, letter; no enemies on the way,
 * the lantern waits for the court), the Musterung, in through the gate.
 * Being caught on the walk wakes you at the spring in the present, where Q takes you back.
 * Screenshots: test-results/screens/ch-k1-00-*.png, ch-k1-x0-*.png.
 */
test('chapter 1 at the Karlsbergquelle: no second touch, Q into summer 1789, the walk up to the court', async ({ page }) => {
  test.setTimeout(ciScale(600_000));
  const errors = trackErrors(page);
  await boot(page);
  // Advance through the chapter card and its fade.
  await upd(page, 420);
  const s = await story(page);
  expect(s).toMatchObject({ chapter: 'k1', beat: 'k1_0', era: 'today' });
  expect(s.objective?.id).toBe('k1.zurueck-q');
  expect(await distTo(page, K1_START.x, K1_START.z), 'the chapter opens at the spring').toBeLessThan(30);
  // the water offers nothing: the journey has happened, Q is the way back
  await page.evaluate(() => {
    for (let i = 0; i < 6; i++) window.kq!.step(2);
  });
  expect(await page.evaluate(() => window.kq!.quelle!.info().prompt), 'no "Wasser berühren"').toBe(false);
  expect(await page.evaluate(() => window.kq!.state().flags['quelle.call'])).toBeUndefined();
  // nobody stands on the arriving player (the servant waits in the Pfeilersaal of the Orangerie)
  const people = await page.evaluate(() => {
    const p = window.kq!.ctx.player.position;
    return window.kq!.npc!.list().map((n) => ({ npc: n.npc, x: n.x, z: n.z, d: Math.hypot(n.x - p.x, n.z - p.z) })).sort((a, b) => a.d - b.d);
  });
  expect(people[0]!.d, `${people[0]!.npc} is the nearest person`).toBeGreaterThan(40);
  // Q at the Ehrenhof opens nothing before the court has let you in (the anchor is the spring)
  await page.evaluate(() => {
    window.kq!.teleport(1222, -1119, 80, 0);
    window.kq!.step(2);
    window.kq!.press('KeyQ', 1);
    window.kq!.step(10);
  });
  expect((await story(page)).era).toBe('today');
  const near = await openAtSpring(page);
  expect(near, 'no enemy within 40 m of the walk').toBeGreaterThan(40);
  // in 1789 the servant is in his room, not at the spring
  const diener = await page.evaluate(() => window.kq!.npc!.list().find((n) => n.npc === 'diener')!);
  expect(Math.hypot(diener.x - 1241.9, diener.z + 967.1), 'the servant stands in the Pfeilersaal').toBeLessThan(1);
  expect(errors).toEqual([]);
});

test('chapter 1: caught on the walk up, you wake at the spring and Q there takes you back', async ({ page }) => {
  test.setTimeout(ciScale(600_000));
  const errors = trackErrors(page);
  await boot(page, 'k1_0b');
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.era.set('1789');
    k.teleport(1150, -920, 0, 0);
    k.step(4);
  });
  // Let the chapter entry enable the court before being caught retires its pending timeline.
  await upd(page, 420);
  expect(await page.evaluate(() => window.kq!.court!.state().sets)).toContain('k1');
  // the prelude: the lantern is out (k1.vorspiel)
  let s = await story(page);
  expect(s).toMatchObject({ era: '1789', beat: 'k1_0b' });
  expect(await page.evaluate(() => window.kq!.state().flags['k1.vorspiel'])).toBe(true);
  expect(!!s.meters.oil, 'no lantern in the prelude').toBe(false);
  await page.evaluate(() => window.kq!.story!.caught('pack'));
  await expect(page.getByTestId('story-curtain')).toBeVisible();
  await upd(page, 400);
  await frames(page, 40);
  s = await story(page);
  expect(s).toMatchObject({ era: 'today', beat: 'k1_0b' });
  expect(s.objective?.id).toBe('k1.zurueck-q');
  // awake within reach of the water: quelle.call is off in k1_0b (no prompt), so check the touch
  // geometry itself (src/systems/quelle/layout.ts: distance to today's touch point ≤ REACH, and canTouch)
  const pl = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z, yaw: window.kq!.ctx.player.yaw }));
  const [tx, tz] = toWorld(...touchLocal('today'));
  expect(Math.hypot(tx - pl.x, tz - pl.z), 'woke within reach of the water').toBeLessThanOrEqual(REACH);
  expect(canTouch(pl.x, pl.z, pl.yaw, 'today'), 'woke facing the water').toBe(true);
  expect(await distTo(page, SPRING.x, SPRING.z)).toBeLessThan(1);
  // the anchor is the spring, never the Ehrenhof before the court has let you in
  const f = await page.evaluate(() => window.kq!.state().flags);
  expect([f['shift.x'], f['shift.z']]).toEqual([SPRING_WATER.x, SPRING_WATER.z]);
  // awake in the present, the water still asks for nothing: Q is the way back
  expect(f['quelle.call']).toBeUndefined();
  expect(await page.evaluate(() => window.kq!.quelle!.info().prompt)).toBe(false);
  await shot(page, 'x0-quelle-wach');
  await walk(page, [[SPRING.x, SPRING.z]]);
  await shiftToPast(page);
  expect(await story(page)).toMatchObject({ era: '1789', beat: 'k1_0b' });
  // the disguise (short jumps between its places), the Musterung: k1_1, admitted, the lantern burns
  await playDisguise(page, { shots: false });
  await upd(page, 20);
  s = await story(page);
  expect(s.beat).toBe('k1_1');
  expect(await page.evaluate(() => window.kq!.state().flags['court.admitted'])).toBe(true);
  expect(!!s.meters.oil, 'the lantern burns in k1_1').toBe(true);
  expect(errors).toEqual([]);
});
