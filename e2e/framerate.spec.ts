import { type Page, expect, test } from '@playwright/test';
import { warnIfShared } from '../scripts/dev/heavy-env.mjs';
import { trackErrors } from './helpers/common';
import { observeRenderFrames } from './helpers/render-pacing';

/**
 * Render pacing (src/core/loop.ts `renderRate` / `FramePacer`, docs/PERFORMANCE.md §5): the
 * pause menu draws at most 15 frames a second (with `?idle`, the policy a player gets: none at
 * all, its last frame is held), bullet time draws only on request while `kq.step`, the pilot and
 * `screenshotReady` still get fresh frames, and the „Bildrate“ / „Energiesparen“ settings exist,
 * persist and act. Check the active policy and observe held/resumed draws over browser callbacks.
 * Exercise the cadence with synthetic animation-frame timestamps in tests/core.test.ts.
 */

// Drain the queued requests (normally one or two frames) before measuring unprompted draws.
const OBSERVATION = { drain: 4, callbacks: 60 };
// Asynchronous redraw requests can each draw one frame while the view is held: a streamed asset
// arriving after the teleport, or the delayed camera-zoom settings save. A redraw requested on
// every animation frame draws about 60 times in the window.
const STRAY_DRAWS = 2;

async function expectHeldFrame(page: Page, state: string): Promise<void> {
  const { before, after } = await page.evaluate(observeRenderFrames, OBSERVATION);
  expect(after - before, `${state} should hold its last frame`).toBeLessThanOrEqual(STRAY_DRAWS);
}

async function boot(page: Page, query: string): Promise<void> {
  await page.goto(`./?nosave&fresh&${query}`);
  await page.waitForFunction(() => window.kq?.pilot !== undefined && !!(window as unknown as { __kqReady?: Record<string, number> }).__kqReady?.ready, null, { timeout: 120_000 });
}

test.describe('render pacing', () => {
  test.describe.configure({ timeout: 300_000 });
  test.beforeAll(() => warnIfShared('framerate.spec.ts')); // frame rates need heavy.sh --exclusive

  test('pause menu: at most 15 fps, and with ?idle its frame is held', async ({ page }) => {
    const errors = trackErrors(page);
    for (const idle of [false, true]) {
      await boot(page, `notitle${idle ? '&idle' : ''}`);
      // real time (no ?manual): a story card the opening may have shown would take the Escape
      await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
      await page.evaluate(() => window.kq!.screenshotReady());
      await page.keyboard.press('Escape');
      await expect(page.locator('.kq-pause')).toBeVisible();
      expect(await page.evaluate(() => window.kq!.ctx.loop.pace()), `pause menu cap (idle=${idle})`).toBe(idle ? 0 : 15);
      // a screenshot still gets fresh frames while the menu holds the view
      const drawn = await page.evaluate(async () => {
        const f0 = window.kq!.ctx.perf.frames;
        await window.kq!.screenshotReady();
        return window.kq!.ctx.perf.frames - f0;
      });
      expect(drawn).toBeGreaterThanOrEqual(3);
      if (idle) await expectHeldFrame(page, 'Pause');
      await page.keyboard.press('Escape');
      await expect(page.locator('.kq-pause')).toBeHidden();
      // back in play the normal cap applies
      expect(await page.evaluate(() => window.kq!.ctx.loop.pace())).toBe(60);
    }
    expect(errors).toEqual([]);
  });

  test('title: at most 30 fps', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page, 'idle');
    await expect(page.getByRole('button', { name: 'Neues Spiel', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => window.kq!.ctx.loop.pace())).toBe(30);
    expect(errors).toEqual([]);
  });

  test('bullet time with ?idle: frames only on request; step, pilot and screenshotReady still draw', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page, 'notitle&manual&idle');
    expect(await page.evaluate(() => window.kq!.ctx.loop.pace())).toBe(0);
    await page.evaluate(() => window.kq!.screenshotReady());
    const r = await page.evaluate(async () => {
      const k = window.kq!;
      const perf = k.ctx.perf;
      const f0 = perf.frames;
      k.step(3);
      const afterStep = perf.frames - f0;
      const o = k.pilot.act({ hold: ['KeyW'], steps: 12, frames: 2 });
      const afterAct = perf.frames - f0;
      await k.screenshotReady();
      const afterShot = perf.frames - f0;
      k.teleport(1452, -640, 330, -7);
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(null))));
      const afterTeleport = perf.frames - f0;
      return { afterStep, afterAct, afterShot, afterTeleport, frames: o.frames.length, len: o.frames[0]?.length ?? 0 };
    });
    expect(r.afterStep).toBe(1);
    expect(r.frames).toBe(2);
    expect(r.len).toBeGreaterThan(1000);
    expect(r.afterAct).toBe(3);
    expect(r.afterShot).toBeGreaterThanOrEqual(6);
    expect(r.afterTeleport).toBeGreaterThan(r.afterShot);
    expect(await page.evaluate(() => window.kq!.ctx.loop.pace())).toBe(0);
    await expectHeldFrame(page, 'Bullet time');
    const cap = await page.evaluate(() => {
      const k = window.kq!;
      k.pilot.bulletTime(false);
      return k.ctx.loop.pace();
    });
    expect(cap).toBe(60);
    // Disabling bullet time requests a badge redraw. Measure additional draws after it drains.
    const resumed = await page.evaluate(observeRenderFrames, OBSERVATION);
    expect(resumed.after - resumed.before, 'Normal rendering should continue after the forced frame').toBeGreaterThanOrEqual(2);
    expect(errors).toEqual([]);
  });

  test('without ?idle (e2e default) bullet time keeps paced rendering', async ({ page }) => {
    await boot(page, 'notitle&manual');
    const policy = await page.evaluate(() => {
      const { loop } = window.kq!.ctx;
      return { cap: loop.pace(), drawn: loop.drawn };
    });
    expect(policy.cap).toBe(60);
    await page.waitForFunction((drawn) => window.kq!.ctx.loop.drawn > drawn, policy.drawn, { timeout: 120_000 });
  });

  test('settings: Bildrate 30 / 60 / unbegrenzt (default 60) and Energiesparen persist and act', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page, 'notitle&manual&q=high');
    await page.keyboard.press('Escape');
    await page.getByTestId('pause-settings').click();
    await page.getByTestId('set-nav-graphics').click();
    const fps = page.getByTestId('set-fps');
    await expect(fps).toBeVisible();
    await expect(fps.getByLabel('60')).toBeChecked();
    await expect(fps.getByLabel('unbegrenzt')).not.toBeChecked();
    await fps.getByLabel('30').check();
    expect(await page.evaluate(() => window.kq!.ctx.settings.state.fpsCap)).toBe(30);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kq.settings.v1')!).fpsCap)).toBe(30);
    await fps.getByLabel('unbegrenzt').check();
    expect(await page.evaluate(() => window.kq!.ctx.settings.state.fpsCap)).toBe(0);
    // Energiesparen: pixel ratio ≤ 1, no AO, no water reflection (even on Hoch)
    await page.getByTestId('set-powersave').check();
    const s = await page.evaluate(() => {
      const c = window.kq!.ctx;
      return { save: c.settings.state.powerSave, pr: c.renderer.getPixelRatio(), refl: c.world.water.reflections, cap: c.quality.capFps, level: c.quality.level };
    });
    expect(s).toMatchObject({ save: true, refl: false, cap: 30, level: 'high' });
    expect(s.pr).toBeLessThanOrEqual(1);
    await page.getByTestId('set-powersave').uncheck();
    expect(await page.evaluate(() => window.kq!.ctx.world.water.reflections)).toBe(true);
    // a new session reads the saved cap back
    await fps.getByLabel('30').check();
    await page.reload();
    await page.waitForFunction(() => window.kq?.ctx !== undefined, null, { timeout: 120_000 });
    expect(await page.evaluate(() => ({ cap: window.kq!.ctx.settings.state.fpsCap, q: window.kq!.ctx.quality.capFps }))).toEqual({ cap: 30, q: 30 });
    expect(errors).toEqual([]);
  });
});
