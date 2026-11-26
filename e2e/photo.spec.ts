import { type CDPSession, type Page, devices, expect, test } from '@playwright/test';
import { SCREENS, trackErrors } from './helpers/common';
import { openPause } from './helpers/pause';

/**
 * Smartphone photo mode (src/systems/photo, WP-14): N raises the phone at the car park, the attack key
 * shoots the placeholder board (photo.parkplatz), the card shows stars, the album has the entry;
 * in 1789 there is no signal („Kein Netz“, a white picture, nothing in the album); on a phone the
 * top-row camera button opens it and the attack button is the shutter.
 */

/** 11 m south of the car-park board (528 / −806, face to the south), looking north at it. */
const STAND = { x: 528, z: -795, yaw: 0, pitch: -2 };

async function boot(page: Page, extra = ''): Promise<void> {
  await page.goto(`./?notitle&nosave&fresh${extra}`);
  await page.waitForFunction(() => window.kq?.photo !== undefined && window.kq?.quests !== undefined, null, { timeout: 120_000 });
  await page.addStyleTag({ content: '[data-testid="dialogue"]{display:none!important}' });
}

async function standAtBoard(page: Page): Promise<void> {
  await page.evaluate(async (at) => {
    const k = window.kq!;
    k.setEra('today');
    k.ctx.ui.modals.closeAll();
    k.teleport(at.x, at.z, at.yaw, at.pitch);
    k.combat?.kill?.();
    await k.screenshotReady();
  }, STAND);
}

async function expectGameplayHud(page: Page, visible: boolean): Promise<void> {
  const hud = page.locator('.kq-hud');
  if (visible) await expect(hud).toBeVisible();
  else await expect(hud).toBeHidden();
  const beacons = await page.evaluate(() => window.kq!.ctx.scene.getObjectByName('quest-beacons')?.visible);
  expect(beacons).toBe(visible);
}

test.describe('photo mode', () => {
  test.describe.configure({ timeout: 240_000 });

  test('N at the car park, shoot the board: stars, then the album has one entry', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    await standAtBoard(page);
    await expectGameplayHud(page, true);
    expect(await page.evaluate(() => window.kq!.photo!.targets().find((t) => t.id === 'photo.parkplatz')?.inWorld)).toBe(true);
    await page.keyboard.press('KeyN');
    await expect.poll(() => page.evaluate(() => window.kq!.photo!.state().open)).toBe(true);
    await expect(page.getByTestId('photo')).toBeVisible();
    await expectGameplayHud(page, false);
    await expect(page.getByTestId('photo-nonet')).toBeHidden();
    // hold still for the steadiness window, then look through the phone
    await page.waitForTimeout(600);
    await page.evaluate(() => window.kq!.screenshotReady());
    const judged = await page.evaluate(() => window.kq!.photo!.judge('photo.parkplatz'));
    expect(judged, JSON.stringify(judged)).toMatchObject({ inFrame: true });
    await page.screenshot({ path: `${SCREENS}/photo-frame.png` });
    // the 2× chip and back
    await page.evaluate(() => window.kq!.photo!.zoom(2));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENS}/photo-frame-2x.png` });
    await page.evaluate(() => window.kq!.photo!.zoom(1));
    await page.waitForTimeout(600);
    // The phone uses the attack binding as its shutter.
    await page.keyboard.press('KeyK');
    await expect(page.getByTestId('photo-card')).toBeVisible();
    const shot = await page.evaluate(() => window.kq!.photo!.state().lastShot);
    expect(shot, JSON.stringify(shot?.details)).not.toBeNull();
    expect(shot!.good).toContain('photo.parkplatz');
    expect(shot!.stars).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId('photo-card').locator('[data-stars]')).toHaveAttribute('data-stars', String(shot!.stars));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SCREENS}/photo-result.png` });
    const album = await page.evaluate(() => window.kq!.photo!.album());
    expect(album).toHaveLength(1);
    expect(album[0]).toMatchObject({ id: 'photo.parkplatz', era: 'today', thumb: true });
    expect(await page.evaluate(() => window.kq!.photo!.has('photo.parkplatz'))).toBe(true);
    // the placeholder's grant (a flag) fired once
    expect(await page.evaluate(() => window.kq!.state().flags['photo.demo.parkplatz'])).toBe(true);
    // N puts the phone away; Pause → Album shows the entry
    await page.keyboard.press('KeyN');
    await expect.poll(() => page.evaluate(() => window.kq!.photo!.state().open)).toBe(false);
    await expect(page.getByTestId('photo')).toBeHidden();
    await expectGameplayHud(page, true);
    await openPause(page);
    await page.getByTestId('pause-album').click();
    await expect(page.getByTestId('album-entry-photo.parkplatz')).toBeVisible();
    await expect(page.getByTestId('album-entry-photo.parkplatz')).toHaveAttribute('data-thumb', 'true');
    await page.screenshot({ path: `${SCREENS}/photo-album.png` });
    expect(errors).toEqual([]);
  });

  test('1789: „Kein Netz“, the picture comes out white, nothing in the album', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    await standAtBoard(page);
    await page.evaluate(async () => {
      window.kq!.setEra('1789');
      await window.kq!.screenshotReady();
    });
    expect(await page.evaluate(() => window.kq!.photo!.open())).toBe(true);
    await expect(page.getByTestId('photo-nonet')).toBeVisible();
    await expect(page.getByTestId('photo-nonet')).toHaveText('Kein Netz');
    await page.waitForTimeout(400);
    const events = await page.evaluate(() => {
      const log: string[] = [];
      const k = window.kq!;
      k.ctx.events.onAny((n, p) => {
        if (n.startsWith('photo:')) log.push(`${n} ${JSON.stringify(p)}`);
      });
      const r = k.photo!.shoot();
      return { r, log };
    });
    expect(events.r!.signal).toBe(false);
    expect(events.r!.targets).toEqual([]);
    expect(events.log.some((l) => l.startsWith('photo:shot') && l.includes('"noSignal":true'))).toBe(true);
    expect(events.log.some((l) => l.startsWith('photo:good'))).toBe(false);
    await expect(page.getByTestId('photo-verdict')).toHaveText('Kein Netz');
    await expect(page.getByTestId('photo-card-img')).toHaveAttribute('data-white', 'true');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SCREENS}/photo-keinnetz.png` });
    expect(await page.evaluate(() => window.kq!.photo!.album())).toHaveLength(0);
    // Esc puts it away (no pause menu while the phone was up)
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.kq!.photo!.state().open)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('blocked while the camera is taken over: a toast, the phone stays down', async ({ page }) => {
    await boot(page);
    await standAtBoard(page);
    // a cinematic holds the camera (kq.setCamera is the slot WP-15 will use)
    const r = await page.evaluate(() => {
      const k = window.kq! as unknown as { setCamera?: (fn: unknown) => void; ctx: { events: { emit(n: string, p: unknown): void } }; photo: { open(): boolean; state(): { open: boolean } } };
      k.ctx.events.emit('camera:override', { active: true });
      const opened = k.photo.open();
      k.ctx.events.emit('camera:override', { active: false });
      return { opened, open: k.photo.state().open, again: k.photo.open() };
    });
    expect(r.opened).toBe(false);
    expect(r.open).toBe(false);
    expect(r.again).toBe(true);
  });
});

const strip = <T extends { defaultBrowserType?: unknown }>(d: T) => {
  const { defaultBrowserType: _ignored, ...rest } = d;
  return rest;
};

async function tap(cdp: CDPSession, x: number, y: number): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await new Promise((r) => setTimeout(r, 70));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function center(page: Page, testid: string): Promise<{ x: number; y: number }> {
  const box = (await page.getByTestId(testid).boundingBox())!;
  expect(box, testid).not.toBeNull();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe('photo mode on a phone (iPhone 13 landscape)', () => {
  test.use({ ...strip(devices['iPhone 13 landscape']) });
  test.describe.configure({ timeout: 240_000 });

  test('the top-row camera button opens it, the attack button is the shutter', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    await standAtBoard(page);
    await expect(page.getByTestId('touch')).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const cam = await center(page, 'touch-photo');
    await tap(cdp, cam.x, cam.y);
    await expect.poll(() => page.evaluate(() => window.kq!.photo!.state().open)).toBe(true);
    await expectGameplayHud(page, false);
    await expect(page.getByTestId('touch-pause')).toBeHidden();
    await expect(page.getByTestId('touch-crouch')).toBeHidden();
    await expect(page.getByTestId('photo-zoom-2')).toBeVisible();
    await expect(page.getByTestId('touch-attack')).toHaveAttribute('aria-label', 'Auslöser: Foto machen');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SCREENS}/photo-touch-frame.png` });
    const shutter = await center(page, 'touch-attack');
    await tap(cdp, shutter.x, shutter.y);
    await expect(page.getByTestId('photo-card')).toBeVisible();
    const shot = await page.evaluate(() => window.kq!.photo!.state().lastShot);
    expect(shot, JSON.stringify(shot?.details)).not.toBeNull();
    expect(shot!.good).toContain('photo.parkplatz');
    expect(await page.evaluate(() => window.kq!.photo!.album())).toHaveLength(1);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SCREENS}/photo-touch-result.png` });
    // the camera button again: the phone goes down, the attack button is the staff again
    await tap(cdp, cam.x, cam.y);
    await expect.poll(() => page.evaluate(() => window.kq!.photo!.state().open)).toBe(false);
    await expectGameplayHud(page, true);
    await expect(page.getByTestId('touch-pause')).toBeVisible();
    await expect(page.getByTestId('touch-attack')).toHaveAttribute('aria-label', 'Hieb (halten: Wuchthieb)');
    expect(errors).toEqual([]);
  });
});
