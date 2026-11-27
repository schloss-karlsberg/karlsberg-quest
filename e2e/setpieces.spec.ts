/**
 * Set pieces, climaxes and endings in the engine (docs/ACTION-RPG.md §14): the K1 par force hunt
 * (eight hounds, the rider far up the slope, the stand at the narrows), the fireworks echo, the
 * Festsaal choice as things in the room, the Steinfraß edge, and the three endings staged in the
 * world before their card. Screenshots: test-results/screens/fun-setpieces-*.png
 */
import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { SCREENS } from './helpers/common';

mkdirSync(SCREENS, { recursive: true });
const IGNORED = [/GPU stall/i, /pointer ?lock/i, /WebGL.*(performance|ReadPixels)/i, /AudioContext was not allowed/i];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  await page.screenshot({ path: `${SCREENS}/fun-setpieces-${name}.png`, timeout: ciScale(150_000) });
}

async function place(page: Page, era: string, x: number, z: number, yaw: number, pitch = 0): Promise<void> {
  await page.evaluate(
    ({ era, x, z, yaw, pitch }) => {
      const k = window.kq!;
      if (k.ctx.era.current !== era) k.setEra(era as never);
      k.teleport(x, z, yaw, pitch);
      k.step(4);
    },
    { era, x, z, yaw, pitch },
  );
}

const PACK = { kind: 'pack', active: true, intensity: 0.45, hounds: 8, pikeur: true, sight: 30, center: { x: 1815, z: 290 }, radius: 170, lunges: true, flankers: 2 };

test.describe('set pieces', () => {
  test.describe.configure({ timeout: ciScale(600_000) });
  test.beforeEach(async ({ page }) => {
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => !!window.kq?.hunt && !!window.kq?.scenery && !!window.kq?.story && !!(window.kq as Any)?.interiors, null, { timeout: 180_000 });
  });

  test('K1: the par force hunt down the cascade, the stand at the narrows', async ({ page }) => {
    const errors = trackErrors(page);
    await place(page, '1789', 1816, 336, 180, 4);
    await page.evaluate((PACK) => {
      const k = window.kq!;
      k.story?.look('night', '1789' as never);
      k.ctx.events.emit('threat:configure', { ...PACK, mode: 'parforce', pikeurFar: 38, from: { x: 1819, z: 384 }, target: { x: 1812, z: 203 }, goalRadius: 12, headStart: 3, heel: 9, burst: 1.3, keepPace: true } as never);
      k.step(380);
    }, PACK);
    const s = await page.evaluate(() => window.kq!.hunt!.state());
    expect(s?.mode).toBe('parforce');
    expect(s!.agents.filter((a: Any) => a.kind === 'hound').length).toBe(8);
    expect(s!.agents.some((a: Any) => a.kind === 'pikeur')).toBe(true);
    await shot(page, 'k1-jagd');
    // the narrows: the pack stands you, the arc behind, two across the way out
    await place(page, '1789', 1810, 280, 180, 2);
    await page.evaluate((PACK) => {
      const k = window.kq!;
      k.ctx.events.emit('threat:configure', { ...PACK, mode: 'stand', target: { x: 1810, z: 274 }, from: { x: 1812, z: 300 } } as never);
      k.step(480);
    }, PACK);
    expect(await page.evaluate(() => window.kq!.hunt!.mode())).toMatchObject({ mode: 'stand' });
    await shot(page, 'k1-enge');
    expect(errors).toEqual([]);
  });

  test('K1: the fireworks echo fills the sky over the Rondell', async ({ page }) => {
    const errors = trackErrors(page);
    await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('1789' as never);
      k.story?.look('night', '1789' as never);
      k.ctx.events.emit('echo:start', { id: 'clue.k1.feuerwerk' } as never);
    });
    await place(page, '1789', 1815, 348, 92, 9);
    await page.evaluate(() => window.kq!.step(420));
    await shot(page, 'feuerwerk-festlich');
    await page.evaluate(() => {
      window.kq!.scenery!.fireworks.phase('climax');
      window.kq!.step(150);
    });
    expect((await page.evaluate(() => window.kq!.scenery!.fireworks.state())).sparks).toBeGreaterThan(400);
    await shot(page, 'feuerwerk-finale');
    expect(errors).toEqual([]);
  });

  test('K3: the Festsaal — four things in the burning hall, E on one', async ({ page }) => {
    const errors = trackErrors(page);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.ctx.state.mutable.flags['barks.quiet'] = true;
      k.story.start('Alex');
      k.story.goto('k3', 'k3_3');
      k.setEra('1793-07');
      k.step(4);
      k.ctx.events.emit('threat:configure', { kind: 'fire', active: true, seconds: 300 });
      k.ctx.state.mutable.inventory.clues.push('clue.k3.fackel');
      k.interiors.enter('B01.2.og-festsaal', { u: 0.5, v: 0.3 });
      k.step(6);
      for (let i = 0; i < 40 && !k.interiors.festsaal().active; i++) k.step(30);
      k.step(240);
      k.story.flush?.();
    });
    const fest = await page.evaluate(() => (window.kq as Any).interiors.festsaal());
    expect(fest.active).toBe(true);
    // stand back from the clock and look at it (the console, the gilt case, the glint)
    await page.evaluate(() => {
      const k = window.kq as Any;
      const u = k.interiors.festsaal().spots.find((s: Any) => s.key === 'uhr');
      const p = k.ctx.player.position;
      const d = Math.hypot(u.x - p.x, u.z - p.z) || 1;
      p.x = u.x - ((u.x - p.x) / d) * 1.5;
      p.z = u.z - ((u.z - p.z) / d) * 1.5;
      k.ctx.player.yaw = Math.atan2(-(u.x - p.x), -(u.z - p.z));
      k.ctx.player.pitch = -0.3;
      k.step(4);
    });
    await shot(page, 'festsaal-uhr');
    expect(await page.locator('.kq-prompt').textContent()).toContain('Uhr');
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.press('KeyE', 1);
      k.step(6);
    });
    expect(await page.evaluate(() => window.kq!.state().flags)).toMatchObject({ 'festsaal.took': 'uhr', 'flag.k3_objekt': 'uhr' });
    expect(errors).toEqual([]);
  });

  test('K4: the Steinfraß eats in from the edge', async ({ page }) => {
    const errors = trackErrors(page);
    await place(page, '1796', 1200, -1112, 92, 2);
    await page.evaluate(() => {
      const k = window.kq!;
      k.ctx.events.emit('threat:configure', { kind: 'oblivion', active: true, seconds: 120 });
      k.fx!.oblivionT(0.45);
      k.step(90);
    });
    await shot(page, 'steinfrass');
    expect(errors).toEqual([]);
  });

  for (const id of ['museum', 'burn', 'keep'] as const) {
    test(`ending staged in the engine: ${id}`, async ({ page }) => {
      const errors = trackErrors(page);
      await place(page, 'today', 760, -902, 0, 0);
      await page.evaluate((id) => {
        const k = window.kq!;
        k.story!.look(id === 'museum' ? 'dawn' : 'night');
        k.story!.ending(id, true);
      }, id);
      await expect(page.getByTestId('ending-stage')).toBeVisible({ timeout: 20_000 });
      // hold the picture mid-way (a software renderer's frames are too slow to catch it running);
      // the hounds and the pages keep their own real-time clocks
      await page.evaluate((at) => (window.kq as Any).story.stageHold(at), id === 'keep' ? 8 : 6.5);
      await page.waitForTimeout(5000);
      expect(await page.evaluate(() => (window.kq as Any).story.stage().active)).toBe(true);
      await shot(page, `ende-${id}`);
      await page.getByTestId('ending-stage-skip').click();
      await expect(page.getByTestId('ending-stage')).toHaveCount(0);
      await expect(page.getByTestId('ending-next')).toBeVisible({ timeout: 30_000 });
      expect(errors).toEqual([]);
    });
  }
});
