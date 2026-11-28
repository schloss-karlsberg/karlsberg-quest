import { type CDPSession, type Page, devices, expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { SCREENS, trackErrors } from './helpers/common';
import { openPause, waitForHooks } from './helpers/pause';

/**
 * Smartphone photo mode (src/systems/photo, WP-14): N raises the phone at the car park, the attack key
 * shoots the placeholder board (photo.parkplatz), the card shows stars, the album has the entry;
 * in 1789 there is no signal („Kein Netz“, a white picture, nothing in the album); on a phone the
 * top-row camera button opens it and the attack button is the shutter. N and the button take the
 * phone out of the pocket first (TASK-005): about a second until camera mode, the shutter skips it.
 */

/** 11 m south of the car-park board (528 / −806, face to the south), looking north at it. */
const STAND = { x: 528, z: -795, yaw: 0, pitch: -2 };

async function boot(page: Page, extra = ''): Promise<void> {
  await page.goto(`./?notitle&nosave&fresh${extra}`);
  await page.waitForFunction(() => window.kq?.photo !== undefined && window.kq?.quests !== undefined, null, { timeout: 120_000 });
  await page.addStyleTag({ content: '[data-testid="dialogue"]{display:none!important}' });
}

/** `?manual&holdvisuals`: frame time moves only through `kq.step` (the hooks appear after the first ticks). */
async function bootManual(page: Page): Promise<void> {
  await page.goto('./?notitle&nosave&fresh&manual&holdvisuals');
  await waitForHooks(page, ['photo', 'avatar', 'quests'], 120_000);
  await page.addStyleTag({ content: '[data-testid="dialogue"]{display:none!important}' });
}

/** N / the touch button: wait until the phone is up (camera mode), as a shot needs. */
async function phoneUp(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.kq!.photo!.state().phase)).toBe('open');
}

/** `?manual`: n fixed ticks, one 1/60 s frame each (the phone's move runs on frame time). */
async function ticks(page: Page, n: number): Promise<void> {
  await page.evaluate((count) => {
    for (let i = 0; i < count; i++) window.kq!.step(1);
  }, n);
}

/** What the phone's move looks like now: its phase, the camera glide, the character and the phone in hand. */
function look(page: Page) {
  return page.evaluate(() => {
    const k = window.kq!;
    const a = k.avatar!.state();
    return { phase: k.photo!.state().phase, glide: k.ctx.player.rig.photoGlide, lens: k.ctx.player.rig.photoMode, phone: a.phone === true, visible: a.visible, upper: a.upper };
  });
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
  test.describe.configure({ timeout: ciScale(240_000) });

  test('N at the car park, shoot the board: stars, then the album has one entry', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    await standAtBoard(page);
    await expectGameplayHud(page, true);
    expect(await page.evaluate(() => window.kq!.photo!.targets().find((t) => t.id === 'photo.parkplatz')?.inWorld)).toBe(true);
    await page.keyboard.press('KeyN');
    await expect.poll(() => page.evaluate(() => window.kq!.photo!.state().open)).toBe(true);
    await phoneUp(page);
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
    // a white picture is not kept in the gallery either (TASK-006)
    expect(await page.evaluate(async () => (await window.kq!.photo!.gallery.settled(), window.kq!.photo!.gallery.count()))).toBe(0);
    // Esc puts it away (no pause menu while the phone was up)
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.kq!.photo!.state().open)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('N takes the phone out of the pocket: hand, glide, viewfinder; N skips; an era change mid-move snaps shut (TASK-005)', async ({ page }) => {
    const errors = trackErrors(page);
    // frame time only through kq.step: one 1/60 s frame per tick, so the move is the same on any machine
    await bootManual(page);
    await standAtBoard(page);
    await page.evaluate(() => window.kq!.avatar!.ready());
    await ticks(page, 30);
    expect(await look(page)).toMatchObject({ phase: 'closed', lens: false, phone: false, visible: true });
    await page.keyboard.press('KeyN');
    await ticks(page, 1);
    expect(await look(page)).toMatchObject({ phase: 'opening', glide: 0, phone: false, visible: true });
    // 0.4 s: the phone is out of the pocket, the character still in view
    await ticks(page, 24);
    const mid = await look(page);
    expect(mid).toMatchObject({ phase: 'opening', phone: true, visible: true, upper: 'phone' });
    expect(mid.glide).toBeGreaterThan(0);
    expect(mid.glide).toBeLessThan(1);
    await ticks(page, 12);
    await page.evaluate(() => window.kq!.screenshotReady());
    await page.screenshot({ path: `${SCREENS}/photo-raise-mid.png` });
    // about a second: camera mode, the character hidden, the viewfinder up
    await ticks(page, 24);
    expect(await look(page)).toMatchObject({ phase: 'open', glide: 1, lens: true, visible: false });
    await expect(page.getByTestId('photo')).toBeVisible();
    await expect(page.getByTestId('photo')).toHaveCSS('opacity', '1');
    // N: back into the pocket; N again during that skips to the end
    await page.keyboard.press('KeyN');
    await ticks(page, 1);
    expect((await look(page)).phase).toBe('closing');
    await page.keyboard.press('KeyN');
    await ticks(page, 1);
    expect(await look(page)).toMatchObject({ phase: 'closed', lens: false, phone: false });
    await expect(page.getByTestId('photo')).toBeHidden();
    // the shutter while it comes up: camera mode at once, no picture
    await page.keyboard.press('KeyN');
    await ticks(page, 6);
    await page.keyboard.press('KeyK');
    await ticks(page, 1);
    expect(await look(page)).toMatchObject({ phase: 'open', glide: 1 });
    expect(await page.evaluate(() => window.kq!.photo!.state().lastShot)).toBeNull();
    await page.keyboard.press('KeyN');
    await ticks(page, 60);
    expect((await look(page)).phase).toBe('closed');
    // an era change in the middle of the move: shut at once, never half way
    await page.keyboard.press('KeyN');
    await ticks(page, 30);
    expect((await look(page)).phase).toBe('opening');
    await page.evaluate(() => window.kq!.setEra('1789'));
    expect(await look(page)).toMatchObject({ phase: 'closed', lens: false, phone: false });
    await expect(page.getByTestId('photo')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('reduced motion: N cuts straight to camera mode, no glide and no phone in hand (TASK-005)', async ({ page }) => {
    const errors = trackErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootManual(page);
    await standAtBoard(page);
    await page.evaluate(() => window.kq!.avatar!.ready());
    await ticks(page, 30);
    await page.keyboard.press('KeyN');
    await ticks(page, 1);
    expect(await look(page)).toMatchObject({ glide: 1, lens: true, phone: false, visible: false });
    await ticks(page, 12);
    expect((await look(page)).phase).toBe('open');
    expect(errors).toEqual([]);
  });

  test('gallery: every shot is kept on the device (IndexedDB); G opens it; full size, share / download, Album button, delete (TASK-006)', async ({ page }) => {
    // many steps under SwiftShader (two shots, downloads, the album): more than the describe's 4 min
    test.setTimeout(480_000);
    const errors = trackErrors(page);
    await boot(page);
    await standAtBoard(page);
    await page.keyboard.press('KeyN');
    await expect.poll(() => page.evaluate(() => window.kq!.photo!.state().open)).toBe(true);
    await phoneUp(page);
    // the phone bar: 1× 2× and the gallery button; the hint names G (the pointer is locked on desktop)
    await expect(page.getByTestId('photo-gallery')).toHaveText('Galerie');
    await expect(page.getByTestId('photo')).toContainText('G: Galerie');
    await page.waitForTimeout(600);
    // two shots (the hook skips the cooldown), stored in order
    await page.evaluate(() => {
      window.kq!.photo!.shoot();
      window.kq!.photo!.shoot();
    });
    const stored = await page.evaluate(async () => {
      const g = window.kq!.photo!.gallery;
      await g.settled();
      return { kind: await g.kind(), list: await g.list() };
    });
    expect(stored.kind).toBe('idb');
    expect(stored.list).toHaveLength(2);
    expect(stored.list[0]!.id).toBeGreaterThan(stored.list[1]!.id);
    expect(stored.list[0]).toMatchObject({ era: 'today', good: ['photo.parkplatz'], targets: ['photo.parkplatz'] });
    expect(stored.list[0]!.width).toBeGreaterThan(0);
    expect(stored.list[0]!.width).toBeLessThanOrEqual(1920);
    // G: the phone goes down, the gallery opens on the grid
    await page.keyboard.press('KeyG');
    await expect(page.getByTestId('gallery')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.kq!.photo!.state().open)).toBe(false);
    await expect(page.getByTestId('gallery-count')).toHaveText('2 von 100 Fotos');
    await expect(page.getByTestId('gallery-hint')).toHaveAttribute('data-store', 'idb');
    await expect(page.getByTestId('gallery-hint')).toContainText('nur auf diesem Gerät');
    await expect(page.locator('[data-testid^="gallery-item-"]')).toHaveCount(2);
    await page.screenshot({ path: `${SCREENS}/photo-gallery.png` });
    // full size, newest first; next / previous
    await page.getByTestId(`gallery-item-${stored.list[0]!.id}`).click();
    const full = page.getByTestId('gallery-full');
    await expect(full).toBeVisible();
    await expect.poll(() => full.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(stored.list[0]!.width);
    await expect(page.getByTestId('gallery-pos')).toHaveText('1 / 2');
    await expect(page.getByTestId('gallery-prev')).toBeDisabled();
    await page.getByTestId('gallery-next').click();
    await expect(page.getByTestId('gallery-pos')).toHaveText('2 / 2');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('gallery-pos')).toHaveText('1 / 2');
    await page.screenshot({ path: `${SCREENS}/photo-gallery-viewer.png` });
    // Herunterladen: a JPEG named after the shot's time
    const name = /^karlsberg-quest-\d{4}-\d\d-\d\d-\d\d-\d\d-\d\d\.jpg$/;
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('gallery-download').click()]);
    expect(dl.suggestedFilename()).toMatch(name);
    // Teilen without file sharing falls back to the download …
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    });
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByTestId('gallery-share').click()]);
    expect(dl2.suggestedFilename()).toMatch(name);
    // … and with it, hands the file to the share sheet
    await page.evaluate(() => {
      const w = window as unknown as { shared?: { name: string; type: string }[] };
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d: { files?: File[] }) => !!d.files?.length });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async (d: { files: File[] }) => void (w.shared = d.files.map((f) => ({ name: f.name, type: f.type }))) });
    });
    await page.getByTestId('gallery-share').click();
    const shared = await page.evaluate(() => (window as unknown as { shared?: { name: string; type: string }[] }).shared);
    expect(shared).toHaveLength(1);
    expect(shared![0]!.name).toMatch(name);
    expect(shared![0]!.type).toBe('image/jpeg');

    // the photos are in IndexedDB itself, picture and thumbnail (what the next load reads back; an
    // in-place reload of the game page under SwiftShader is slow enough to be aborted here, on a
    // real GPU it takes ~3 s and keeps them: TASK-006 progress log)
    const raw = await page.evaluate(
      () =>
        new Promise<{ photos: number; full: number; blobs: boolean; thumbs: boolean }>((resolve, reject) => {
          const r = indexedDB.open('kq-photos');
          r.onerror = () => reject(r.error);
          r.onsuccess = () => {
            const db = r.result;
            const tx = db.transaction(['photos', 'full']);
            const a = tx.objectStore('photos').getAll();
            const b = tx.objectStore('full').getAll();
            tx.oncomplete = () => {
              const rows = a.result as { thumb: Blob }[];
              const full = b.result as Blob[];
              resolve({ photos: rows.length, full: full.length, blobs: full.every((x) => x instanceof Blob && x.type === 'image/jpeg' && x.size > 2000), thumbs: rows.every((x) => x.thumb instanceof Blob && x.thumb.size > 500) });
              db.close();
            };
          };
        }),
    );
    expect(raw).toEqual({ photos: 2, full: 2, blobs: true, thumbs: true });
    await page.getByTestId('gallery').getByRole('button', { name: 'Schließen' }).click();
    // Pause → Album → „Galerie öffnen“
    await openPause(page);
    await page.getByTestId('pause-album').click();
    await page.getByTestId('album-gallery').click();
    await expect(page.getByTestId('gallery-count')).toHaveText('2 von 100 Fotos');
    // Löschen asks once („Wirklich?“, same place), then the next photo moves in; the last one leaves the empty grid
    await page.locator('[data-testid^="gallery-item-"]').first().click();
    await page.getByTestId('gallery-delete').click();
    await expect(page.getByTestId('gallery-delete')).toHaveText('Wirklich?');
    await expect(page.getByTestId('gallery-delete')).toHaveAttribute('aria-label', 'Wirklich löschen?');
    expect(await page.evaluate(() => window.kq!.photo!.gallery.count())).toBe(2);
    await page.getByTestId('gallery-delete').click();
    await expect(page.getByTestId('gallery-pos')).toHaveText('1 / 1');
    expect(await page.evaluate(() => window.kq!.photo!.gallery.count())).toBe(1);
    await page.getByTestId('gallery-delete').click();
    await page.getByTestId('gallery-delete').click();
    await expect(page.getByTestId('gallery-empty')).toBeVisible();
    await expect(page.getByTestId('gallery-count')).toHaveText('0 von 100 Fotos');
    expect(await page.evaluate(() => window.kq!.photo!.gallery.count())).toBe(0);
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

  test('the viewfinder hides an active measuring tool and a visible quest giver glyph', async ({ page }) => {
    await boot(page);
    await standAtBoard(page);
    const before = await page.evaluate(({ x, z }) => {
      const k = window.kq!;
      k.skills!.grant('kartograf', 3, true);
      k.tools!.measure.at(x - 2, z - 5, x + 2, z - 9);
      k.npc!.spawn({ npc: 'marlene', x: x + 2, z: z - 7, era: 'today' });
      k.ctx.events.emit('npc:marker', { npc: 'marlene', mark: 'offer' });
      return k.tools!.measure.state();
    }, STAND);
    expect(before.mode).toBe('done');
    const overlays = ['measure-reticle', 'measure-sheet', 'npc-glyph-marlene'].map((id) => page.getByTestId(id));
    for (const overlay of overlays) await expect(overlay).toBeVisible();
    const tapeVisible = () => page.evaluate(() => window.kq!.ctx.scene.getObjectByName('kq-measure')?.visible);
    expect(await tapeVisible()).toBe(true);

    expect(await page.evaluate(() => window.kq!.photo!.open())).toBe(true);
    expect(await tapeVisible()).toBe(false);
    for (const overlay of overlays) await expect(overlay).toBeHidden();

    await page.evaluate(() => window.kq!.photo!.close());
    expect(await tapeVisible()).toBe(true);
    for (const overlay of overlays) await expect(overlay).toBeVisible();
    expect(await page.evaluate(() => window.kq!.tools!.measure.state())).toEqual(before);
  });

  test('survey activation stays live and its banner waits for the phone to close', async ({ page }) => {
    await boot(page);
    await standAtBoard(page);
    const point = await page.evaluate(() => window.kq!.travel!.points().find((p) => p.id === 'taleingang')!);
    expect(point.activated).toBe(false);
    expect(await page.evaluate(({ x, z }) => {
      const k = window.kq!;
      if (!k.photo!.open()) return false;
      k.teleport(x, z, 0);
      return true;
    }, point)).toBe(true);

    const banner = page.getByTestId('travel-card-activated');
    await expect.poll(() => page.evaluate((id) => window.kq!.travel!.state().activated.includes(id), point.id)).toBe(true);
    expect(await page.evaluate(() => window.kq!.photo!.state().open)).toBe(true);
    await expect(banner).toHaveCount(0);
    await page.evaluate(() => window.kq!.photo!.close());
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(point.name);
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
  test.describe.configure({ timeout: ciScale(240_000) });

  test('the top-row camera button opens it, the attack button is the shutter', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    await standAtBoard(page);
    const measurement = await page.evaluate(({ x, z }) => {
      const k = window.kq!;
      k.skills!.grant('kartograf', 3, true);
      k.tools!.measure.at(x - 2, z - 5, x + 2, z - 9);
      return k.tools!.measure.state();
    }, STAND);
    await expect(page.getByTestId('touch')).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const cam = await center(page, 'touch-photo');
    await tap(cdp, cam.x, cam.y);
    await expect.poll(() => page.evaluate(() => window.kq!.photo!.state().open)).toBe(true);
    await phoneUp(page);
    await expectGameplayHud(page, false);
    await expect(page.getByTestId('touch-pause')).toBeHidden();
    await expect(page.getByTestId('touch-crouch')).toBeHidden();
    await expect(page.getByTestId('photo-zoom-2')).toBeVisible();
    await expect(page.getByTestId('touch-attack')).toHaveAttribute('aria-label', 'Auslöser: Foto machen');
    await page.waitForTimeout(700);
    const surface = { x: 460, y: 174 };
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('data-testid'), surface)).toBe('touch');
    await tap(cdp, surface.x, surface.y);
    await page.evaluate(() => window.kq!.screenshotReady());
    expect(await page.evaluate(() => window.kq!.photo!.state().lastShot)).toBeNull();
    expect(await page.evaluate(() => window.kq!.tools!.measure.state())).toEqual(measurement);
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
    expect(await page.evaluate(() => window.kq!.tools!.measure.state())).toEqual(measurement);
    expect(errors).toEqual([]);
  });

  test('the phone bar’s „Galerie“ opens the gallery by touch; a photo opens full-size and is deleted by taps (TASK-006)', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    await standAtBoard(page);
    const cdp = await page.context().newCDPSession(page);
    const cam = await center(page, 'touch-photo');
    await tap(cdp, cam.x, cam.y);
    await expect.poll(() => page.evaluate(() => window.kq!.photo!.state().open)).toBe(true);
    await phoneUp(page);
    await page.waitForTimeout(700);
    const shutter = await center(page, 'touch-attack');
    await tap(cdp, shutter.x, shutter.y);
    await expect(page.getByTestId('photo-card')).toBeVisible();
    await page.evaluate(() => window.kq!.photo!.gallery.settled());
    // the bar's buttons are full-size tap targets on touch
    for (const id of ['photo-zoom-1', 'photo-zoom-2', 'photo-gallery']) expect((await page.getByTestId(id).boundingBox())!.height, id).toBeGreaterThanOrEqual(44);
    const btn = await center(page, 'photo-gallery');
    await tap(cdp, btn.x, btn.y);
    await expect(page.getByTestId('gallery')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.kq!.photo!.state().open)).toBe(false);
    await expect(page.getByTestId('gallery-count')).toHaveText('1 von 100 Fotos');
    const item = (await page.locator('[data-testid^="gallery-item-"]').first().boundingBox())!;
    await tap(cdp, item.x + item.width / 2, item.y + item.height / 2);
    await expect(page.getByTestId('gallery-full')).toBeVisible();
    for (const id of ['gallery-back', 'gallery-share', 'gallery-download', 'gallery-delete']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.height, id).toBeGreaterThanOrEqual(44);
      expect(b.y + b.height, `${id} on screen`).toBeLessThanOrEqual(page.viewportSize()!.height);
    }
    await page.screenshot({ path: `${SCREENS}/photo-touch-gallery.png` });
    let del = await center(page, 'gallery-delete');
    await tap(cdp, del.x, del.y);
    await expect(page.getByTestId('gallery-delete')).toHaveText('Wirklich?');
    del = await center(page, 'gallery-delete');
    await tap(cdp, del.x, del.y);
    await expect(page.getByTestId('gallery-empty')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
