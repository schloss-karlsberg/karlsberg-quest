import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { SCREENS } from './helpers/common';

/**
 * Die Meute + der Pikeur + die Laterne. Drives the hunt system through `window.kq.hunt` /
 * `window.kq.lantern` with `?manual` (deterministic stepping). Screenshots:
 * test-results/screens/hunt-*.png — look at them after visual changes.
 */
mkdirSync(SCREENS, { recursive: true });

const IGNORED = [/GPU stall/i, /pointer ?lock/i, /WebGL.*(performance|ReadPixels)/i, /AudioContext was not allowed/i];

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

/** On the Apfelallee (TF-14), looking up the avenue to the north-west: bible W3 "Augen im Nebel". */
const ALLEE = { x: 1452, z: -640, yaw: 330 };

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  // the caught rush is heavy for SwiftShader on a loaded machine: give the capture time
  await page.screenshot({ path: `${SCREENS}/${name}.png`, timeout: ciScale(150_000) });
}

test.describe('hunt', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq !== undefined && window.kq.hunt !== undefined, null, { timeout: 90_000 });
  });

  test('eyes in the fog, lantern, the Pikeur and his horn', async ({ page }) => {
    const errors = trackErrors(page);
    // W3: frost fog on the avenue, eyes come on to the right
    await page.evaluate((a) => {
      const k = window.kq!;
      k.setEra('1793-02');
      k.teleport(a.x, a.z, a.yaw, 1);
      k.hunt!.start({ x: a.x, z: a.z, radius: 140, intensity: 0.5, hounds: 6, pikeur: false, seed: 3 });
      k.hunt!.freeze(true);
      const spots: [number, number][] = [
        [11, 24],
        [13.5, 31],
        [16, 18],
        [19, 36],
        [23, 27],
        [27, 40],
      ];
      spots.forEach(([d, ang], i) => k.hunt!.placeInView(i, d, ang));
      // two of them stand side-on, sniffing the air
      const s = k.hunt!.sim()!;
      s.agents[2]!.heading = k.ctx.player.yaw + Math.PI / 2;
      s.agents[4]!.heading = k.ctx.player.yaw - Math.PI / 2.4;
      k.step(30);
    }, ALLEE);
    await shot(page, 'hunt-fog-eyes');

    // the lantern: warm light, the smoke bodies show in it
    const lit = await page.evaluate(() => {
      const k = window.kq!;
      k.lantern!.toggle(true);
      const spots: [number, number][] = [
        [4.5, -12],
        [6, 14],
        [7.5, -30],
        [9, 34],
        [12, 4],
        [15, -22],
      ];
      spots.forEach(([d, ang], i) => k.hunt!.placeInView(i, d, ang));
      k.step(20);
      return k.lantern!.state();
    });
    expect(lit.lit).toBe(true);
    expect(lit.light).toBeGreaterThan(0.5);
    await shot(page, 'hunt-lantern');

    // the Pikeur: a rider of smoke with a brass horn that glows when it sounds
    await page.evaluate((a) => {
      const k = window.kq!;
      k.lantern!.toggle(false);
      k.hunt!.start({ x: a.x, z: a.z, radius: 140, intensity: 0.8, hounds: 4, pikeur: true, seed: 5 });
      k.hunt!.freeze(true);
      k.hunt!.placeInView(0, 11, 8, false);
      const s = k.hunt!.sim()!;
      // side-on: the rider crosses the view from left to right
      s.agents[0]!.heading = k.ctx.player.yaw - Math.PI / 2;
      [
        [7, -18],
        [8.5, 22],
        [10, -6],
        [12.5, 30],
      ].forEach(([d, ang], i) => k.hunt!.placeInView(i + 1, d!, ang!));
      k.step(10);
      k.hunt!.horn('search');
      k.step(20);
    }, ALLEE);
    await shot(page, 'hunt-pikeur');
    expect(errors).toEqual([]);
  });

  test('chase and caught sequence', async ({ page }) => {
    test.setTimeout(ciScale(360_000));
    const errors = trackErrors(page);
    const chase = await page.evaluate((a) => {
      const k = window.kq!;
      k.setEra('1793-02');
      k.teleport(a.x, a.z, a.yaw, 0);
      k.hunt!.start({ x: a.x, z: a.z, radius: 140, intensity: 0.7, hounds: 5, pikeur: true, seed: 11 });
      const spots: [number, number][] = [
        [30, 6],
        [16, -10],
        [19, 14],
        [23, -24],
        [26, 28],
        [21, 2],
      ];
      spots.forEach(([d, ang], i) => k.hunt!.placeInView(i, d, ang));
      k.lantern!.toggle(true);
      k.step(90);
      return k.hunt!.state()!;
    }, ALLEE);
    expect(chase.state).toBe('chasing');
    await shot(page, 'hunt-chase');

    // keep standing: the pack closes in and catches
    const caught = await page.evaluate(() => {
      const k = window.kq!;
      for (let i = 0; i < 600 && k.hunt!.state() && !k.hunt!.state()!.caught; i++) k.step(1);
      const st = k.hunt!.state();
      k.step(54); // ≈ 0.9 s into the sequence
      return { caught: st?.caught ?? null };
    });
    expect(caught.caught).not.toBeNull();
    await shot(page, 'hunt-caught-rush');
    // ≈ 2.1 s: player:caught; with the story feature present its curtain carries the title
    await page.evaluate(() => window.kq!.step(72));
    if (await page.evaluate(() => !!window.kq!.story)) await expect(page.getByTestId('story-curtain')).toHaveClass(/kqs-down/);
    await page.waitForTimeout(1300);
    await shot(page, 'hunt-caught');
    const after = await page.evaluate(() => {
      const k = window.kq!;
      k.step(60);
      const names = k.hunt!.events().map((e) => e.name);
      return { names, active: k.hunt!.state() !== null };
    });
    expect(after.names).toContain('player:caught');
    expect(after.active).toBe(false);
    expect(errors).toEqual([]);
  });
  test('story activation, determinism and the lantern oil', async ({ page }) => {
    const errors = trackErrors(page);
    // the story switches the pack on through the contract event only
    const run = (seed: number) =>
      page.evaluate(
        ({ a, seed }) => {
          const k = window.kq!;
          k.setEra('1793-02');
          k.teleport(a.x, a.z, a.yaw, 0);
          k.ctx.events.emit('threat:configure', { kind: 'pack', active: false });
          k.ctx.events.emit('threat:configure', { kind: 'pack', active: true, intensity: 0.7, center: { x: a.x + 60, z: a.z - 40 }, radius: 120, seconds: 300, seed });
          k.step(240);
          const st = k.hunt!.state()!;
          return { state: st.state, agents: st.agents.map((g) => [g.kind, g.x.toFixed(3), g.z.toFixed(3)].join(':')) };
        },
        { a: ALLEE, seed },
      );
    const viaEvent = await page.evaluate(() => {
      const k = window.kq!;
      return k.hunt!.events().filter((e) => e.name === 'hunt:start').length;
    });
    expect(viaEvent).toBe(0);
    const one = await run(42);
    const two = await run(42);
    expect(two).toEqual(one);
    expect(one.agents.length).toBeGreaterThanOrEqual(4);
    const started = await page.evaluate(() => window.kq!.hunt!.events().filter((e) => e.name === 'hunt:start').length);
    expect(started).toBe(2);

    // deactivation through the same contract
    const off = await page.evaluate(() => {
      const k = window.kq!;
      k.ctx.events.emit('threat:configure', { kind: 'pack', active: false });
      k.step(2);
      return k.hunt!.state();
    });
    expect(off).toBeNull();

    // the lantern: L toggles it, oil drains while lit, empties, and the hub refills it
    const lamp = await page.evaluate(() => {
      const k = window.kq!;
      k.lantern!.refill();
      k.lantern!.setSeconds(5);
      k.press('KeyL');
      k.step(2);
      const litAfterKey = k.lantern!.state().lit;
      k.step(150); // half of the 5 s minimum burn time
      const half = k.lantern!.state().oil;
      k.step(200);
      const empty = k.lantern!.state();
      const names = k.hunt!.events().map((e) => e.name);
      k.ctx.events.emit('hub:enter', {});
      k.step(1);
      return { litAfterKey, half, empty, names, refilled: k.lantern!.state().oil };
    });
    expect(lamp.litAfterKey).toBe(true);
    expect(lamp.half).toBeGreaterThan(0.2);
    expect(lamp.half).toBeLessThan(0.8);
    expect(lamp.empty.oil).toBe(0);
    expect(lamp.empty.lit).toBe(false);
    expect(lamp.names).toEqual(expect.arrayContaining(['lantern:toggle', 'lantern:oil', 'lantern:empty']));
    expect(lamp.refilled).toBe(1);
    expect(errors).toEqual([]);
  });
});
