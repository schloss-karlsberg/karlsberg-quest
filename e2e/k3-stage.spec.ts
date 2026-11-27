/**
 * K3 staged in the engine (docs/ACTION-RPG.md §14, playtest round 4): the living Ehrenhof in the
 * afternoon, the commissioner's torch (arc, impact, the ground floor lighting window by window),
 * the fire seen from the park and the Zwinger, the Gittertüren and the pack running past, Jost
 * running off with his lantern. Screenshots: test-results/screens/s5-k3stage-*.png
 */
import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { SCREENS } from './helpers/common';

mkdirSync(SCREENS, { recursive: true });
const IGNORED = [/GPU stall/i, /pointer ?lock/i, /WebGL.*(performance|ReadPixels)/i, /AudioContext was not allowed/i];
// biome-ignore lint/suspicious/noExplicitAny: test glue
type Any = any;

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.some((r) => r.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    if (!IGNORED.some((r) => r.test(e.message))) errors.push(`pageerror: ${e.message}`);
  });
  return errors;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${SCREENS}/s5-k3stage-${name}.png`, timeout: ciScale(150_000) });
}

const state = (page: Page) => page.evaluate(() => (window.kq as Any).fx.k3.state());

test('K3 on stage: Ehrenhof, torch, fire from outside, Zwinger', async ({ page }) => {
  test.setTimeout(ciScale(900_000));
  const errors = trackErrors(page);
  await page.goto('./?notitle&nosave&fresh&manual');
  await page.waitForFunction(() => !!(window.kq as Any)?.story && !!(window.kq as Any)?.fx?.k3, null, { timeout: 180_000 });

  // ---- the afternoon: carts, bale bearers, plunderers, soldiers --------------------------------
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.setEra('1793-07');
    k.fx.k3.phase('afternoon');
    k.fx.k3.clock(20);
    k.teleport(1203, -1118, 95, 2);
    k.step(30);
  });
  const aft = await state(page);
  console.log(`[k3stage] afternoon ${JSON.stringify(aft)}`);
  expect(aft.phase).toBe('afternoon');
  expect(aft.crowd.cart).toBeGreaterThanOrEqual(3);
  expect(aft.crowd.soldier + aft.crowd.bale + aft.crowd.painting + aft.crowd.chair + aft.crowd.bundle).toBeGreaterThanOrEqual(10);
  await shot(page, 'afternoon');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.teleport(1226, -1117, 80, 0);
    k.step(4);
  });
  await shot(page, 'afternoon-close');

  // ---- dusk: the commissioner on his cart, the torch raised; the throw; the windows -------------
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.story.look('dusk', '1793-07');
    k.fx.k3.phase('dusk');
    k.fx.k3.torch(-1, 1);
    k.teleport(1214, -1108, 72, 6);
    k.step(10);
  });
  const dusk = await state(page);
  expect(dusk.commissioner).toBe(true);
  await shot(page, 'dusk');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.fx.k3.torch(0.6);
    k.step(2);
  });
  await shot(page, 'flight');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.fx.k3.torch(3.2);
    k.step(2);
  });
  const win = await state(page);
  console.log(`[k3stage] windows ${JSON.stringify(win)}`);
  expect(win.windows).toBeGreaterThanOrEqual(12);
  expect(win.lit).toBeGreaterThan(0.05);
  await shot(page, 'windows');

  // ---- the fire from outside: the court, the park, the Zwinger ----------------------------------
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.fx.k3.phase(null);
    k.fx.k3.torch(null);
    k.fx.fire(true, { seconds: 300, clock: 60 });
    k.fx.k3.phase('fire');
    k.teleport(1205, -1118, 95, 4);
    k.step(60);
  });
  await shot(page, 'fire-court');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.teleport(1272, -1300, 180, 10);
    k.fx.fireTime(150);
    k.step(60);
  });
  const park = await state(page);
  console.log(`[k3stage] park ${JSON.stringify(park)}`);
  expect(park.columns).toBeGreaterThanOrEqual(2);
  await shot(page, 'fire-park');

  // ---- the Zwinger: the gate closed, E, the doors swing, the pack runs past ---------------------
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.hunt.configure({
      active: true, mode: 'kennel', hounds: 7, pikeur: false, intensity: 0.4, sight: 14, center: { x: 1222, z: -1572 }, radius: 12,
      target: { x: 1220, z: -1572 }, via: [{ x: 1252, z: -1579 }, { x: 1272, z: -1604 }, { x: 1300, z: -1650 }], seed: 53,
    });
    k.teleport(1257, -1576, 0, 2);
    k.step(20);
    const g = k.hunt.kennel();
    k.ctx.player.yaw = -Math.atan2(g.x - 1257, -(g.z + 1576));
    k.step(30);
  });
  const gate = await page.evaluate(() => (window.kq as Any).hunt.kennel());
  console.log(`[k3stage] gate ${JSON.stringify(gate)}`);
  expect(gate.prompt).toBe(true);
  expect(gate.open).toBe(false);
  await shot(page, 'zwinger-gate');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.press('KeyE', 1);
    k.step(Math.round(60 * 1.7));
  });
  await shot(page, 'zwinger-burst');
  await page.evaluate(() => (window.kq as Any).step(60 * 1.2));
  await shot(page, 'zwinger-past');
  const rel = await page.evaluate(() => {
    const k = window.kq as Any;
    k.step(60 * 6);
    return k.hunt.kennel();
  });
  console.log(`[k3stage] release ${JSON.stringify(rel)}`);
  expect(rel.open).toBe(true);
  expect(rel.nearest).toBeGreaterThanOrEqual(3);
  expect(rel.nearest).toBeLessThanOrEqual(6);
  // Jost runs off after them with his lantern (story k3_8b)
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.teleport(1266, -1566, 335, 3);
    k.ctx.events.emit('story:cue', { id: 'k3:jost-run', data: { x: 1250, z: -1568, toX: 1150, toZ: -1700 } });
    k.step(60 * 4);
  });
  expect((await state(page)).run).toBeGreaterThan(3);
  await shot(page, 'zwinger-jost-run');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.teleport(1258, -1566, 180, 12);
    k.step(30);
  });
  await shot(page, 'fire-zwinger');
  expect(errors).toEqual([]);
});
