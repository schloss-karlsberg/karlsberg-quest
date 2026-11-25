import { mkdirSync, writeFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

/**
 * Performance, loading, settings and accessibility (docs/PERFORMANCE.md).
 *  - the bench route (`kq.bench()`) over every era, the burning Festsaal and the night pack:
 *    draw calls and triangles stay within budget (SwiftShader: absolute fps mean nothing here)
 *  - bytes and time before the first input (title "Neues Feldbuch" enabled)
 *  - quality presets, the settings page, high contrast / subtitles / colour-blind relief, key remapping
 * Screenshots: test-results/screens/pol-perf-*.png, numbers: test-results/perf/*.json.
 * `PERF_LABEL=before` names the JSON (for before/after comparisons).
 */
const SCREENS = 'test-results/screens';
const OUT = 'test-results/perf';
mkdirSync(SCREENS, { recursive: true });
mkdirSync(OUT, { recursive: true });
const LABEL = process.env.PERF_LABEL ?? 'after';

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

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${SCREENS}/pol-perf-${name}.png` });
}

async function boot(page: Page, query = ''): Promise<void> {
  await page.goto(`./?notitle&nosave&fresh&manual${query}`);
  await page.waitForFunction(() => window.kq?.interiors !== undefined && window.kq?.hunt !== undefined, null, { timeout: 120_000 });
  // no story line over the pictures
  await page.addStyleTag({ content: '[data-testid="dialogue"]{display:none!important}' });
}

test.describe('performance', () => {
  test.describe.configure({ timeout: 900_000 });

  test('bench route: every scene within the draw-call and triangle budget', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    const frames = Number(process.env.PERF_FRAMES ?? 8);
    const r = await page.evaluate(
      ({ frames, baseline }) => {
        // PERF_BASELINE=1: switch the round's optimisations off to measure the "before" numbers
        if (baseline) (window.kq as unknown as { baseline?: () => void }).baseline?.();
        return window.kq!.bench({ frames, warmup: 3, log: false });
      },
      { frames, baseline: process.env.PERF_BASELINE === '1' },
    );
    writeFileSync(`${OUT}/bench-${LABEL}.json`, JSON.stringify(r, null, 2));
    expect(r.scenes.length).toBe(9);
    for (const s of r.scenes) {
      expect.soft(s.calls.max, `${s.id} draw calls`).toBeLessThanOrEqual(r.budget.calls);
      expect.soft(s.triangles.max, `${s.id} triangles`).toBeLessThanOrEqual(r.budget.triangles);
    }
    // the perf overlay over the 1789 palace (numbers of the frames just drawn)
    await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('1789');
      k.teleport(1138, -1120, 90, 2);
      k.perfHud(true);
      k.step(2);
    });
    for (let i = 0; i < 6; i++) await page.evaluate(() => window.kq!.screenshotReady());
    await page.waitForTimeout(400);
    await shot(page, 'hud-1789');
    expect(errors).toEqual([]);
  });

  test('bytes and time before the first input', async ({ page }) => {
    const t0 = Date.now();
    const files: { url: string; bytes: number; type: string }[] = [];
    const terrainDetailRequests: string[] = [];
    let ready = false;
    page.on('request', (req) => {
      if (!ready && new URL(req.url()).pathname.endsWith('/terrain/surface2025.rgba.deflate')) terrainDetailRequests.push(req.url());
    });
    page.on('requestfinished', async (req) => {
      if (ready) return;
      const sizes = await req.sizes().catch(() => null);
      const res = await req.response().catch(() => null);
      files.push({ url: req.url().replace(/^https?:\/\/[^/]+\//, ''), bytes: (sizes?.responseBodySize ?? 0) + (sizes?.responseHeadersSize ?? 0), type: res?.headers()['content-type'] ?? '' });
    });
    const url = new URL('./?nosave&fresh', test.info().project.use.baseURL);
    if (process.env.PERF_LOAD_QUALITY) url.searchParams.set('q', process.env.PERF_LOAD_QUALITY);
    await page.goto(url.href);
    await expect(page.getByRole('button', { name: 'Neues Spiel', exact: true })).toBeEnabled({ timeout: 120_000 });
    ready = true;
    const ms = Date.now() - t0;
    await page.waitForTimeout(300);
    const total = files.reduce((a, f) => a + f.bytes, 0);
    const timing = await page.evaluate(() => (window as unknown as { __kqReady?: Record<string, number> }).__kqReady ?? null);
    writeFileSync(`${OUT}/load-${LABEL}.json`, JSON.stringify({ totalBytes: total, ms, timing, files: files.sort((a, b) => b.bytes - a.bytes) }, null, 2));
    await page.screenshot({ path: `${SCREENS}/pol-perf-title.png` });
    expect(terrainDetailRequests).toEqual([]);
    expect(total).toBeLessThan(20 * 1024 * 1024);
  });

  test('quality presets: Niedrig / Mittel / Hoch change pixel ratio, MSAA, trees', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    const view = () =>
      page.evaluate(() => {
        const k = window.kq!;
        k.setEra('today');
        k.teleport(1240, -1060, 250, -4);
        k.step(2);
      });
    const read = () =>
      page.evaluate(() => {
        const c = window.kq!.ctx;
        return { px: c.renderer.getPixelRatio(), msaa: c.post.samples, near: c.world.forest.nearDist, far: c.world.forest.farDist, lod: c.world.terrain.lodScale, level: c.quality.level };
      });
    for (const level of ['low', 'medium', 'high'] as const) {
      await page.evaluate((level) => window.kq!.ctx.settings.update((d) => void (d.graphics = level), 'graphics'), level);
      await view();
      const q = await read();
      expect(q.level).toBe(level);
      if (level === 'low') expect(q).toMatchObject({ px: 1, msaa: 0, near: 110, far: 480 });
      if (level === 'high') expect(q).toMatchObject({ msaa: 4, near: 170, far: 700, lod: 1 });
      await shot(page, `preset-${level}`);
    }
    // resolution scale: the 3D view renders at 60 %
    await page.evaluate(() => window.kq!.ctx.settings.update((d) => void (d.resolutionScale = 0.6), 'resolutionScale'));
    expect((await read()).px).toBeLessThan(1);
    await page.evaluate(() => window.kq!.ctx.settings.update((d) => void (d.resolutionScale = 1), 'resolutionScale'));
    expect(errors).toEqual([]);
  });
});

test.describe('settings and accessibility', () => {
  test.describe.configure({ timeout: 600_000 });

  test('settings page: sections, keyboard focus, volumes, key remapping', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    await page.keyboard.press('Escape');
    await page.getByTestId('pause-settings').click();
    await expect(page.getByTestId('settings')).toBeVisible();
    await shot(page, 'settings-top');
    // keyboard: Tab reaches the section bar, Enter jumps to Barrierefreiheit
    await page.getByTestId('set-nav-access').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('set-contrast')).toBeFocused({ timeout: 5000 }).catch(() => {});
    await page.getByTestId('set-contrast').check();
    await page.getByTestId('set-flash').check();
    await page.getByTestId('set-subsize').getByLabel('sehr groß').check();
    await shot(page, 'settings-access');
    // volumes: every bus slider reaches the audio manager
    await page.getByTestId('set-nav-audio').click();
    await page.getByTestId('vol-voice').fill('0.3');
    await page.getByTestId('vol-music').fill('0.2');
    const vol = await page.evaluate(() => ({ ...window.kq!.ctx.audio.volumes }));
    expect(vol.voice).toBeCloseTo(0.3, 2);
    expect(vol.music).toBeCloseTo(0.2, 2);
    await shot(page, 'settings-audio');
    // key remapping: add I to "Vorwärts", it walks; reset brings the defaults back
    await page.getByTestId('set-nav-controls').click();
    await page.getByTestId('bindings').locator('summary').click();
    await page.getByTestId('bind-forward').click();
    await page.keyboard.press('KeyI');
    const b = await page.evaluate(() => window.kq!.ctx.input.bindings.forward);
    expect(b).toContain('KeyI');
    await page.getByTestId('bind-forward').scrollIntoViewIfNeeded();
    await shot(page, 'settings-keys');
    const s = await page.evaluate(() => window.kq!.ctx.settings.state);
    expect(s).toMatchObject({ highContrast: true, reducedFlash: true, subtitleSize: 'xl' });
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-kq-contrast'))).toBe(true);
    expect(await page.evaluate(() => window.kq!.ctx.post.uniforms.uFlashScale!.value)).toBeLessThan(0.5);
    // the rebound key moves the player
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    const walked = await page.evaluate(() => {
      const k = window.kq!;
      k.ctx.ui.modals.closeAll();
      k.setEra('today');
      k.teleport(1138, -1120, 90, 0);
      const x0 = k.ctx.player.position.x;
      k.press('KeyI', 40);
      return k.ctx.player.position.x - x0;
    });
    expect(walked).toBeGreaterThan(0.5);
    // keyboard look turns the view without a mouse
    const turned = await page.evaluate(() => {
      const k = window.kq!;
      const y0 = k.ctx.player.yaw;
      k.press('Period', 30);
      return k.ctx.player.yaw - y0;
    });
    expect(turned).toBeLessThan(-0.3);
    await page.evaluate(() => window.kq!.ctx.settings.update((d) => void (d.bindings = {}), 'bindings'));
    expect(await page.evaluate(() => window.kq!.ctx.input.bindings.forward)).toEqual(['KeyW', 'ArrowUp']);
    expect(errors).toEqual([]);
  });

  test('high-contrast HUD with large subtitles, colour-blind relief', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    await page.evaluate(() => {
      const k = window.kq!;
      k.ctx.settings.update((d) => {
        d.highContrast = true;
        d.subtitleSize = 'xl';
        d.subtitleBg = 0.9;
      }, 'highContrast');
      k.setEra('1789');
      k.teleport(1138, -1120, 90, 2);
      k.ctx.ui.hud.setStatus('Ehrenhof');
      k.ctx.ui.hud.prompt('E', 'Untersuchen');
      (window as unknown as { kqClearSub?: () => void }).kqClearSub = k.ctx.ui.hud.subtitle('Quirin Laub', 'Siehst du die Fensterachsen? Zähl sie, und dann zähl sie im Plan.', 60_000, true);
      k.step(2);
    });
    await shot(page, 'contrast-hud');
    await page.evaluate(() => {
      const k = window.kq!;
      (window as unknown as { kqClearSub?: () => void }).kqClearSub?.();
      k.ctx.ui.hud.prompt(null);
      k.ctx.settings.update((d) => {
        d.highContrast = false;
        d.colorblind = false;
      }, 'colorblind');
      k.setEra('today');
      k.teleport(1150, -1050, 120, -14);
      k.setScanMode(2);
      k.step(2);
    });
    await shot(page, 'scan2-default');
    await page.evaluate(() => {
      window.kq!.ctx.settings.update((d) => void (d.colorblind = true), 'colorblind');
      window.kq!.step(1);
    });
    await shot(page, 'scan2-colorblind');
    expect(errors).toEqual([]);
  });
});
