import { mkdirSync, readFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { ciScale, desktopViewport, isCI } from './helpers/ci';
import { openPause } from './helpers/pause';
import { SCREENS } from './helpers/common';

/**
 * Smoke + visual tests. Screenshots land in test-results/screens/*.png — look at them after a
 * change to the world look. Deterministic: `?manual` stops the real-time loop, the scene only
 * advances with `kq.step(n)`; `?nosave&fresh` keeps localStorage out of it.
 */
mkdirSync(SCREENS, { recursive: true });

function holdRequest() {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  return { pending, release };
}

/** Console noise that is not an error of ours (software WebGL perf warnings, pointer lock in headless). */
const IGNORED = [/GPU stall/i, /pointer ?lock/i, /WebGL.*(performance|ReadPixels)/i, /AudioContext was not allowed/i];

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.some((r) => r.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    if (!IGNORED.some((r) => r.test(e.message))) errors.push(`pageerror: ${e.message}`);
  });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
  });
  return errors;
}

interface View {
  era?: string;
  x: number;
  z: number;
  /** degrees, 0 = north, 90 = east */
  yaw: number;
  pitch?: number;
  scan?: number;
  map?: number;
  /** fly height above ground (spirit view) */
  fly?: number;
}

async function show(page: Page, v: View): Promise<void> {
  await page.evaluate((v) => {
    const k = window.kq!;
    k.setEra((v.era ?? 'today') as never);
    const p = k.ctx.player;
    // spirit view only exists today; for aerial shots of other eras just lift the camera after the steps
    p.setFlying(!!v.fly && v.era === 'today');
    k.teleport(v.x, v.z, v.yaw, v.pitch ?? 0);
    k.setScanMode(v.scan ?? 0);
    k.setMapMix(v.map ?? 0);
    k.step(2);
    if (v.fly) p.position.y = k.ctx.world.heightAt(v.x, v.z) + v.fly;
  }, v);
  await page.evaluate(() => window.kq!.screenshotReady());
}

async function shoot(page: Page, name: string, v: View): Promise<void> {
  await show(page, v);
  await page.screenshot({ path: `${SCREENS}/${name}.png` });
}

test('the tour starts with audio and Continue restores the read-only autosave', async ({ page }) => {
  const errors = trackErrors(page);
  const legacy = JSON.parse(readFileSync(new URL('../tests/fixtures/saves/v0.8.0.json', import.meta.url), 'utf8'));
  delete legacy.meta.savedAt;
  const stored = JSON.stringify(legacy);
  await page.addInitScript((raw) => localStorage.setItem('kq.save.v1.auto', raw), stored);
  await page.goto('./?nosave&fresh');
  await expect(page.getByTestId('title')).toBeVisible();
  const start = page.getByTestId('title-new');
  await expect(start).toBeEnabled({ timeout: 90_000 });
  await expect(start).toHaveText('Neues Spiel');
  await expect(start.locator('svg')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Schloss Karlsberg Tour', exact: true })).toBeVisible();
  await page.waitForTimeout(500); // let the backdrop draw a few frames
  await page.screenshot({ path: `${SCREENS}/title.png` });

  // version + build, and „Neuigkeiten“ with its unseen badge (cleared once opened)
  await expect(page.getByTestId('title-version')).toContainText(/Version \d+\.\d+\.\d+ · Stand \S+/);
  const badge = page.locator('.kq-news-badge');
  await expect(badge).toBeVisible();
  await page.getByTestId('title-news').click();
  await expect(page.getByTestId('news')).toContainText('Erste öffentliche Version');
  await expect(page.getByTestId('news')).toBeVisible();
  await page.locator('.kq-modal .actions button').click();
  await expect(page.getByTestId('news')).toBeHidden();
  await expect(badge).toBeHidden();

  // new game: content warning → name → tour map (story feature's title flow)
  await start.click();
  await expect(page.getByTestId('content-warning')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ja', exact: true })).toHaveCount(0);
  await page.getByTestId('warning-accept').click();
  await page.getByTestId('name-confirm').click();
  const map = page.getByRole('dialog', { name: 'Die Route der Führung' });
  await expect(map.getByRole('button')).toHaveCount(1);
  const tourStart = map.getByTestId('start-tour');
  await expect(tourStart).toHaveAccessibleName('Tour starten');
  await expect(tourStart).toBeFocused();
  expect(await page.evaluate(() => window.kq!.ctx.audio.ctx === null)).toBe(true);
  await tourStart.click();
  // (the fade-out runs on real time: generous on a busy machine with software WebGL)
  await expect(page.getByTestId('title')).toBeHidden({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.kq!.ctx.audio.unlocked)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('kq.save.v1.auto'))).toBe(stored);
  expect(await page.evaluate(() => window.kq!.story!.state().chapter)).toBe('tour');
  expect(await page.evaluate(() => window.kq!.ctx.pause.paused)).toBe(false);

  await openPause(page);
  await page.getByTestId('pause-menu').getByRole('button', { name: 'Zum Titelbild' }).click();
  const resume = page.getByTestId('title-continue');
  await expect(resume).toBeVisible();
  const k1Entries = await page.evaluateHandle(() => {
    const { events, pause } = window.kq!.ctx;
    const entries: Array<{ beat: string; onTitle: boolean }> = [];
    events.on('story:beat', ({ chapter, beat }) => {
      if (chapter === 'k1') entries.push({ beat, onTitle: pause.reasons.has('title') });
    });
    return entries;
  });
  await resume.click();
  await expect(page.getByTestId('title')).toBeHidden({ timeout: 30_000 });
  // The v0.8.0 slot migrates from the retired prologue to K1 at the spring.
  expect(await page.evaluate(() => window.kq!.story!.state())).toMatchObject({ chapter: 'k1', beat: 'k1_0' });
  expect(await k1Entries.jsonValue()).toEqual([{ beat: 'k1_0', onTitle: false }]);
  expect(await page.evaluate(() => localStorage.getItem('kq.save.v1.auto'))).toBe(stored);
  expect(errors).toEqual([]);
});

test('the title protects an unreadable autosave when New Game is cancelled', async ({ page }) => {
  const stored = '{\n  "version": 999,\n  "flags": { "future": true }\n}\n';
  const readAutosave = () => page.evaluate(() => localStorage.getItem('kq.save.v1.auto'));
  await page.addInitScript((raw) => localStorage.setItem('kq.save.v1.auto', raw), stored);
  await page.goto('./');
  const title = page.getByTestId('title');
  const start = title.getByTestId('title-new');
  await expect(start).toBeEnabled({ timeout: 90_000 });
  await expect(title.getByTestId('title-continue')).toBeHidden();
  await expect(title.getByRole('status')).toHaveText(/Spielstand.*neueren Spielversion/);
  expect(await readAutosave()).toBe(stored);

  await start.click();
  await expect(page.getByText(/Der bisherige Spielstand wird überschrieben/)).toBeVisible();
  await page.getByRole('button', { name: 'Nein', exact: true }).click();
  await expect(title).toBeVisible();
  await expect(title.getByRole('status')).toBeVisible();
  await expect(page.getByTestId('content-warning')).toBeHidden();
  expect(await readAutosave()).toBe(stored);
});

test('the title asks before replacing an autosave that appears during name entry', async ({ page }) => {
  const stored = readFileSync(new URL('../tests/fixtures/saves/v0.8.0.json', import.meta.url), 'utf8');
  await page.goto('./');
  const title = page.getByTestId('title');
  const start = title.getByTestId('title-new');
  const resume = title.getByTestId('title-continue');
  await expect(start).toBeEnabled({ timeout: 90_000 });
  await expect(resume).toBeHidden();

  await start.click();
  await page.getByTestId('warning-accept').click();
  await page.getByTestId('player-name').fill('Neuer Name');
  await page.evaluate((raw) => localStorage.setItem('kq.save.v1.auto', raw), stored);
  await page.getByTestId('name-confirm').click();
  await page.getByTestId('start-tour').click();

  await expect(page.getByText(/Der bisherige Spielstand wird überschrieben/)).toBeVisible();
  await page.getByRole('button', { name: 'Nein', exact: true }).click();
  await expect(resume).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('kq.save.v1.auto'))).toBe(stored);
  await resume.click();
  await expect(title).toBeHidden();
  expect(await page.evaluate(() => window.kq!.story!.state())).toMatchObject({ chapter: 'k1', beat: 'k1_0', name: 'Mara' });
});

for (const view of [
  { name: 'desktop', viewport: desktopViewport, mobile: false },
  { name: 'phone', viewport: { width: 667, height: 375 }, mobile: true },
]) {
  test.describe(view.name, () => {
    test.use({ viewport: view.viewport, hasTouch: view.mobile, isMobile: view.mobile, deviceScaleFactor: view.mobile ? 3 : 1 });

    test('title screen takes over the first-paint Bussole in place', async ({ page }) => {
      const bundle = holdRequest();
      const meta = holdRequest();
      const terrain = holdRequest();
      await page.route(/\/app\/index-[^/]+\.js$/, async (route) => {
        await bundle.pending;
        await route.fallback();
      });
      await page.route('**/data/terrain/meta.json', async (route) => {
        await meta.pending;
        await route.fallback();
      });
      await page.route('**/data/terrain/h2025.u16.deflate', async (route) => {
        await terrain.pending;
        await route.fallback();
      });
      if (view.mobile) {
        await page.addInitScript(() => localStorage.setItem('kq.settings.v1', JSON.stringify({ reducedMotion: true })));
      } else {
        await page.emulateMedia({ reducedMotion: 'reduce' });
      }

      try {
        await page.goto('./?nosave&fresh', { waitUntil: 'commit' });
        const indicator = page.getByTestId('title-loading');
        const dial = indicator.locator('svg');
        const needle = dial.locator('.kq-loader-needle');
        await expect(page.getByTestId('title')).toHaveCount(0);
        await expect(indicator).toBeVisible();
        await expect(indicator).toHaveAccessibleName('Lädt …');
        await expect(indicator).not.toHaveAttribute('aria-valuenow', /.+/);
        await expect(needle).toHaveCSS('animation-name', view.mobile ? 'kq-needle' : 'none');
        const before = await dial.boundingBox();
        await page.screenshot({ path: `${SCREENS}/title-first-paint-${view.name}.png`, timeout: ciScale(60_000) });

        bundle.release();
        await expect(page.getByTestId('title').getByTestId('title-loading')).toBeVisible();
        await expect(needle).toHaveCSS('animation-name', 'none');
        expect(await dial.boundingBox()).toEqual(before);
        await expect(page.getByTestId('title-new')).toBeDisabled();

        meta.release();
        const region = page.locator('#boot-loader');
        await expect(region).toHaveAttribute('aria-busy', 'true');
        await expect(indicator).toHaveAccessibleName('Gelände wird geladen …');
        await expect(indicator).toHaveAttribute('aria-valuenow', '89');
        await expect(indicator).toHaveText('Gelände wird geladen … 89 %');
        expect(await dial.boundingBox()).toEqual(before);
        await page.screenshot({ path: `${SCREENS}/title-loading-${view.name}.png`, timeout: ciScale(60_000) });

        terrain.release();
        await expect(page.getByTestId('title-new')).toBeFocused({ timeout: 90_000 });
        await expect(indicator).toBeHidden();
        await expect(region).not.toHaveAttribute('aria-busy', /.+/);
      } finally {
        bundle.release();
        meta.release();
        terrain.release();
      }
    });
  });
}

test('title screen clears busy state if terrain loading fails', async ({ page }) => {
  await page.route('**/data/terrain/meta.json', (route) => route.fulfill({ status: 503 }));
  await page.goto('./?nosave&fresh');
  await expect(page.getByTestId('title').getByRole('alert')).toHaveText('Das Spiel konnte nicht geladen werden.');
  await expect(page.locator('#boot-loader')).not.toHaveAttribute('aria-busy', /.+/);
  await expect(page.getByTestId('title-new')).toBeDisabled();
});

test('title screen startup reports a renderer error before the title mounts', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...options: unknown[]) {
      return type.startsWith('webgl') ? null : Reflect.apply(getContext, this, [type, ...options]);
    } as typeof getContext;
  });
  await page.goto('./?nosave&fresh');
  await expect(page.getByTestId('title')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveText('Das Spiel konnte nicht geladen werden.');
  await expect(page.locator('#boot-loader')).not.toHaveAttribute('aria-busy', /.+/);
});

test.describe('world', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq !== undefined, null, { timeout: 90_000 });
  });

  test('renders every era and scan mode without errors', async ({ page }) => {
    // twelve full-frame screenshots on SwiftShader: past 2 min when the suite runs in parallel
    test.setTimeout(ciScale(360_000));
    if (isCI) await page.setViewportSize(desktopViewport); // Preserve the reference screenshots.
    const errors = trackErrors(page);
    // today: forest over the ruin of the main palace (POI r03-01)
    await shoot(page, 'today-ruin', { era: 'today', x: 1240, z: -1060, yaw: 250, pitch: -4 });
    await shoot(page, 'today-ruin-air', { era: 'today', x: 1000, z: -1100, yaw: 95, pitch: -20, fly: 90 });
    // 1789: the palace on the avenue axis (default spawn)
    await shoot(page, '1789-palace', { era: '1789', x: 1138, z: -1120, yaw: 90, pitch: 2 });
    await shoot(page, '1789-palace-air', { era: '1789', x: 1080, z: -1180, yaw: 60, pitch: -18, fly: 40 });
    await shoot(page, '1793-02-night', { era: '1793-02', x: 1138, z: -1120, yaw: 90, pitch: 2 });
    await shoot(page, '1793-07-fire', { era: '1793-07', x: 1125, z: -1120, yaw: 90, pitch: 3 });
    await shoot(page, '1796-ruin', { era: '1796', x: 1138, z: -1120, yaw: 90, pitch: 0 });
    // relief scan modes at the ruin (trees inside the scan radius drop away)
    for (const scan of [1, 2, 3]) await shoot(page, `scan${scan}`, { era: 'today', x: 1150, z: -1050, yaw: 120, pitch: -14, scan });
    await shoot(page, 'scan1-air', { era: 'today', x: 1100, z: -1050, yaw: 110, pitch: -40, scan: 1, fly: 70 });
    // 1840 map lens over the palace site (the lens also clears the trees within the scan radius)
    await shoot(page, 'map1840', { era: 'today', x: 1150, z: -1100, yaw: 100, pitch: -60, map: 0.85, fly: 160 });

    const info = await page.evaluate(() => {
      const k = window.kq!;
      return {
        era: k.state().era,
        h: k.ctx.world.heightAt(1194.79, -1095.34),
        trees: k.ctx.world.forest.stats.total,
        failed: k.ctx.systems.stats().filter((s) => s.failed).map((s) => s.id),
      };
    });
    expect(info.era).toBe('today');
    expect(info.h).toBeGreaterThan(330); // palace ruin POI ~343 m
    expect(info.h).toBeLessThan(355);
    expect(info.trees).toBeGreaterThan(10_000);
    expect(info.failed).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('player walks, crouches, uses spirit view only today, and state saves', async ({ page }) => {
    const errors = trackErrors(page);
    const r = await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('today');
      k.teleport(1138, -1120, 90, 0);
      const x0 = k.ctx.player.position.x;
      k.press('KeyW', 60); // one second walking east
      const walked = k.ctx.player.position.x - x0;
      k.press('KeyC');
      const crouch = k.state().player.stance;
      k.press('KeyC');
      k.press('Digit1');
      const flyToday = k.ctx.player.flying;
      k.press('Digit1');
      k.setEra('1789');
      k.press('Digit1');
      const fly1789 = k.ctx.player.flying;
      // save round trip into a throwaway slot
      const sm = k.ctx.save;
      sm.enabled = true;
      sm.save('e2e', 'test');
      const raw = localStorage.getItem('kq.save.v1.e2e');
      sm.delete('e2e');
      return { walked, crouch, flyToday, fly1789, saved: raw !== null && JSON.parse(raw).era === '1789' };
    });
    expect(r.walked).toBeGreaterThan(0.8);
    expect(r.walked).toBeLessThan(4.5); // walk speed ≈ 3.2 m/s
    expect(r.crouch).toBe('crouch');
    expect(r.flyToday).toBe(true);
    expect(r.fly1789).toBe(false);
    expect(r.saved).toBe(true);
    expect(errors).toEqual([]);
  });
});
