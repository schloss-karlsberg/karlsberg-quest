import { type CDPSession, type Page, devices, expect, test } from '@playwright/test';
import { SCREENS, trackErrors } from './helpers/common';

/**
 * Touch controls (src/ui/touch.ts, phase 1 of docs/PERF-MOBILE-RESEARCH.md §B) on emulated
 * phones and a tablet in landscape: walk with the stick, look by dragging, hit, open and close the
 * field book, pause, all with real touch events (CDP `Input.dispatchTouchEvent`, so the browser
 * makes the pointer events itself). Plus the title and the settings by tap.
 */

/** A meadow south of the Apfelallee, far from the field station and from NPCs (as e2e/pilot.spec.ts). */
const FIELD = { x: 1452, z: -640, yaw: 330 };

const strip = <T extends { defaultBrowserType?: unknown }>(d: T) => {
  const { defaultBrowserType: _ignored, ...rest } = d;
  return rest;
};
const DEVICES = {
  'iphone-13': strip(devices['iPhone 13 landscape']),
  'pixel-7': strip(devices['Pixel 7 landscape']),
  'ipad-pro-11': strip(devices['iPad Pro 11 landscape']),
} as const;

/** Real touch: start, moves, end, for one finger id (CDP keeps the other fingers as given). */
class Finger {
  constructor(
    private readonly cdp: CDPSession,
    readonly id: number,
  ) {}
  private static down = new Map<number, { x: number; y: number }>();
  private points(): { x: number; y: number; id: number }[] {
    return [...Finger.down.entries()].map(([id, p]) => ({ ...p, id }));
  }
  async start(x: number, y: number): Promise<void> {
    Finger.down.set(this.id, { x, y });
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: this.points() });
  }
  async move(x: number, y: number, steps = 6): Promise<void> {
    const from = Finger.down.get(this.id)!;
    for (let i = 1; i <= steps; i++) {
      Finger.down.set(this.id, { x: from.x + ((x - from.x) * i) / steps, y: from.y + ((y - from.y) * i) / steps });
      await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: this.points() });
    }
  }
  async end(): Promise<void> {
    Finger.down.delete(this.id);
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: this.points() });
  }
  async tap(x: number, y: number, holdMs = 60): Promise<void> {
    await this.start(x, y);
    await new Promise((r) => setTimeout(r, holdMs));
    await this.end();
  }
}

async function center(page: Page, testid: string): Promise<{ x: number; y: number }> {
  const box = (await page.getByTestId(testid).boundingBox())!;
  expect(box, testid).not.toBeNull();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function bootField(page: Page): Promise<void> {
  await page.goto('./?notitle&nosave&fresh');
  await page.waitForFunction(() => window.kq?.combat !== undefined && window.kq?.ctx.loop !== undefined, null, { timeout: 90_000 });
  await page.evaluate(async (at) => {
    const k = window.kq!;
    k.progression!.grant('item.stab.esche', 1, true);
    k.progression!.equip('item.stab.esche');
    k.setEra('1789');
    k.teleport(at.x, at.z, at.yaw, -7);
    k.combat!.kill();
    k.ctx.ui.modals.closeAll();
    await k.screenshotReady();
  }, FIELD);
  await expect(page.getByTestId('touch')).toBeVisible();
}

for (const [name, device] of Object.entries(DEVICES)) {
  test.describe(`touch on ${name}`, () => {
    test.use({ ...device });

    test('walk, look, hit, field book, pause', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = trackErrors(page);
      await bootField(page);
      const cdp = await page.context().newCDPSession(page);
      const vp = page.viewportSize()!;

      // touch mode is on by itself (coarse pointer), no pointer-lock chip, touch icons in prompts
      expect(await page.evaluate(() => document.documentElement.hasAttribute('data-kq-touch'))).toBe(true);
      await expect(page.getByTestId('click-to-look')).toBeHidden();
      expect(await page.evaluate(() => window.kq!.ctx.input.touchMode)).toBe(true);
      await page.screenshot({ path: `${SCREENS}/touch-${name}-hud.png` });

      // walk: push the stick forward for a moment
      const p0 = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
      const stick = new Finger(cdp, 1);
      const sx = vp.width * 0.18;
      const sy = vp.height * 0.7;
      await stick.start(sx, sy);
      await stick.move(sx, sy - 45);
      expect(await page.evaluate(() => window.kq!.ctx.input.isDown('forward'))).toBe(true);
      await expect(page.locator('.kq-t-stick')).toBeVisible();
      await page.screenshot({ path: `${SCREENS}/touch-${name}-stick.png` });
      await page.waitForTimeout(1500);
      await stick.end();
      expect(await page.evaluate(() => window.kq!.ctx.input.isDown('forward'))).toBe(false);
      const p1 = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
      expect(Math.hypot(p1.x - p0.x, p1.z - p0.z), 'walked with the stick').toBeGreaterThan(0.5);

      // look: drag on the right half turns the view
      const yaw0 = await page.evaluate(() => window.kq!.ctx.player.yaw);
      const look = new Finger(cdp, 2);
      await look.start(vp.width * 0.55, vp.height * 0.4);
      await look.move(vp.width * 0.55 + 120, vp.height * 0.4, 8);
      await look.end();
      await page.waitForTimeout(300);
      const yaw1 = await page.evaluate(() => window.kq!.ctx.player.yaw);
      expect(Math.abs(yaw1 - yaw0), 'drag turned the view').toBeGreaterThan(0.1);

      // walk and look at once (two fingers)
      await stick.start(sx, sy);
      await stick.move(sx + 40, sy - 30);
      await look.start(vp.width * 0.55, vp.height * 0.35);
      await look.move(vp.width * 0.55 - 60, vp.height * 0.35, 4);
      expect(await page.evaluate(() => window.kq!.ctx.input.isDown('forward') && window.kq!.ctx.input.isDown('right'))).toBe(true);
      await look.end();
      await stick.end();

      // hit: a tap on the Hieb button swings the staff
      await page.evaluate(() => {
        const w = window as unknown as { __swings: number };
        w.__swings = 0;
        window.kq!.ctx.events.on('combat:swing' as never, () => w.__swings++);
      });
      const atk = await center(page, 'touch-attack');
      await new Finger(cdp, 3).tap(atk.x, atk.y);
      await expect.poll(() => page.evaluate(() => (window as unknown as { __swings: number }).__swings), { timeout: 10_000 }).toBeGreaterThan(0);

      // field book: open by its button, close by the modal's × (a tap)
      const book = await center(page, 'touch-journal');
      await new Finger(cdp, 4).tap(book.x, book.y);
      await expect.poll(() => page.evaluate(() => window.kq!.ctx.ui.modals.count), { timeout: 10_000 }).toBeGreaterThan(0);
      await expect(page.getByTestId('touch')).toBeHidden();
      await page.screenshot({ path: `${SCREENS}/touch-${name}-journal.png` });
      const close = page.locator('.kq-modal-layer button.close').last();
      await close.tap();
      await expect.poll(() => page.evaluate(() => window.kq!.ctx.ui.modals.count)).toBe(0);
      await expect(page.getByTestId('touch')).toBeVisible();

      // pause: the button opens the pause menu (pause is otherwise unreachable on touch)
      const pz = await center(page, 'touch-pause');
      await new Finger(cdp, 5).tap(pz.x, pz.y);
      await expect(page.getByTestId('resume')).toBeVisible();
      expect(await page.evaluate(() => window.kq!.ctx.pause.paused)).toBe(true);
      await page.screenshot({ path: `${SCREENS}/touch-${name}-pause.png` });
      await page.getByTestId('resume').tap();
      await expect(page.getByTestId('resume')).toBeHidden();
      await expect.poll(() => page.evaluate(() => window.kq!.ctx.pause.paused)).toBe(false);
      await expect(page.getByTestId('touch')).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

test.describe('notices on a small landscape phone', () => {
  test.use({ ...DEVICES['iphone-13'], viewport: { width: 667, height: 375 } });

  test('outside taps dismiss, while drags, action buttons and modal scrolling still work', async ({ page }) => {
    test.setTimeout(240_000);
    await bootField(page);
    const finger = new Finger(await page.context().newCDPSession(page), 1);
    const text = 'Feldbuch ergänzt: Wasser, das sich erinnert – die Aufzeichnungen der Vermessungskommission';
    await page.evaluate((message) => {
      const k = window.kq!;
      k.ctx.settings.update((s) => (s.reducedMotion = true), 'reducedMotion');
      k.ctx.ui.toast(message, 30000);
    }, text);
    const toast = page.locator('.kq-toast', { hasText: text });
    await expect(toast).toBeVisible();
    await expect(toast).toHaveCSS('animation-name', 'none');
    const bounds = (await toast.boundingBox())!;
    expect(bounds.x).toBeGreaterThan(0);
    expect(bounds.x + bounds.width).toBeLessThan(667);
    const topButtons = (await page.locator('.kq-t-top').boundingBox())!;
    expect(bounds.y).toBeGreaterThan(topButtons.y + topButtons.height);

    await finger.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(toast).toBeVisible();

    const yaw = await page.evaluate(() => window.kq!.ctx.player.yaw);
    await finger.start(350, 195);
    await finger.move(436, 195);
    await finger.end();
    await expect.poll(() => page.evaluate(() => Math.abs(window.kq!.ctx.player.yaw - yaw), yaw)).toBeGreaterThan(0.1);
    await expect(toast).toBeVisible();

    await finger.start(90, 250);
    await finger.move(90, 200);
    expect(await page.evaluate(() => window.kq!.ctx.input.isDown('forward'))).toBe(true);
    await finger.end();
    await expect(toast).toBeVisible();

    const action = await center(page, 'touch-interact');
    await finger.start(action.x, action.y);
    expect(await page.evaluate(() => window.kq!.ctx.input.isDown('listen'))).toBe(true);
    await finger.end();
    await expect(toast).toBeVisible();

    await page.evaluate(() => {
      const body = document.createElement('div');
      body.style.height = '1100px';
      window.kq!.ctx.ui.modals.open({ title: 'Feldbuch', body });
    });
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(toast).toBeHidden();
    await finger.start(334, 255);
    await finger.move(334, 115);
    await finger.end();
    await expect.poll(() => modal.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect(modal).toBeVisible();

    // A short drag on the backdrop preserves the modal. A subsequent tap dismisses that layer.
    await finger.start(4, 140);
    await finger.move(4, 215);
    await finger.end();
    await expect(modal).toBeVisible();
    await finger.tap(4, 140);
    await expect(modal).toBeHidden();
    await expect(toast).toBeVisible();

    await finger.start(360, 195);
    await expect(toast).toBeVisible();
    await finger.end();
    await expect(toast).toHaveCount(0); // reduced motion removes the element without an exit fade
  });
});

test.describe('touch: title and settings by tap', () => {
  test.use({ ...DEVICES['iphone-13'] });

  test('new game by taps; Touch-Steuerung Aus hides the controls', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    await page.goto('./?nosave&fresh');
    const start = page.getByTestId('title-new');
    await expect(start).toBeEnabled({ timeout: 90_000 });
    await page.screenshot({ path: `${SCREENS}/touch-title.png` });
    await start.tap();
    await page.getByTestId('warning-accept').tap();
    await page.getByTestId('name-confirm').tap();
    await page.getByTestId('light-lantern').tap();
    await expect(page.getByTestId('title')).toBeHidden({ timeout: 30_000 });
    await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
    await expect(page.getByTestId('touch')).toBeVisible();

    // settings from the pause menu: the touch row is there; Aus hides the controls
    await page.getByTestId('touch-pause').tap();
    await page.getByTestId('pause-settings').tap();
    const row = page.getByTestId('set-touch');
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SCREENS}/touch-settings.png` });
    await row.getByLabel('Aus').tap();
    expect(await page.evaluate(() => window.kq!.ctx.settings.state.touchControls)).toBe('off');
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-kq-touch'))).toBe(false);
    await row.getByLabel('Auto').tap();
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-kq-touch'))).toBe(true);
    await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
    await expect(page.getByTestId('touch')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('portrait keeps title menus usable and shows the rotate overlay during play', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('./?nosave&fresh');
    const start = page.getByTestId('title-new');
    const rotate = page.getByTestId('rotate');
    await expect(start).toBeEnabled({ timeout: 90_000 });
    await expect(rotate).toBeHidden();
    await page.getByTestId('title-settings').tap();
    await expect(page.getByTestId('settings')).toBeVisible();
    await expect(rotate).toBeHidden();
    await page.locator('.kq-modal button.close').tap();
    await start.tap();
    await page.getByTestId('warning-accept').tap();
    await page.getByTestId('name-confirm').tap();
    await page.getByTestId('light-lantern').tap();
    await expect(page.getByTestId('title')).toBeHidden();
    await expect(rotate).toBeVisible();
    await page.setViewportSize({ width: 667, height: 375 });
    await expect(rotate).toBeHidden();
    await expect(page.getByTestId('touch')).toBeVisible();
  });
});
