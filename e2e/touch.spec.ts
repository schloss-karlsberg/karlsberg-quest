import { type CDPSession, type Page, devices, expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { SCREENS, trackErrors } from './helpers/common';
import { run } from './helpers/k4';
import { waitForHooks } from './helpers/pause';
import { QUELLE_STAND } from './helpers/prolog';

/**
 * Touch controls (src/ui/touch.ts, phase 1 of docs/PERF-MOBILE-RESEARCH.md §B) on emulated
 * phones and a tablet in landscape: walk with the stick, look by dragging, hit, and navigate
 * Pause, all with real touch events (CDP `Input.dispatchTouchEvent`, so the browser
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
  /**
   * The fingers' own clock (ms since the epoch), sent as each event's timestamp. A touch screen stamps
   * a contact when it happens. Without a timestamp, CDP stamps an event when it dispatches it, after
   * the renderer acknowledged the previous one. On a hosted runner a software-rendered frame holds
   * that acknowledgement for up to a second, so a 60 ms tap lasted over two seconds and missed the
   * 450 ms tap window (src/ui/pointerTap.ts). Each event advances the clock by one 60 Hz frame and a
   * tap by its hold; a contact that starts with no finger down catches up with the wall clock.
   */
  private static clock = 0;
  private static stamp(ms: number): number {
    Finger.clock = Math.max(Finger.clock + ms, Finger.down.size === 0 ? Date.now() : 0);
    return Finger.clock / 1000;
  }
  private points(): { x: number; y: number; id: number }[] {
    return [...Finger.down.entries()].map(([id, p]) => ({ ...p, id }));
  }
  async start(x: number, y: number): Promise<void> {
    const timestamp = Finger.stamp(16);
    Finger.down.set(this.id, { x, y });
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: this.points(), timestamp });
  }
  async move(x: number, y: number, steps = 6): Promise<void> {
    const from = Finger.down.get(this.id)!;
    for (let i = 1; i <= steps; i++) {
      Finger.down.set(this.id, { x: from.x + ((x - from.x) * i) / steps, y: from.y + ((y - from.y) * i) / steps });
      await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: this.points(), timestamp: Finger.stamp(16) });
    }
  }
  async end(holdMs = 16): Promise<void> {
    const timestamp = Finger.stamp(holdMs);
    Finger.down.delete(this.id);
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: this.points(), timestamp });
  }
  async tap(x: number, y: number, holdMs = 60): Promise<void> {
    await this.start(x, y);
    await new Promise((r) => setTimeout(r, holdMs));
    await this.end(holdMs);
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

    test('walk, look, hit and navigate Pause', async ({ page }) => {
      test.setTimeout(ciScale(240_000));
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

      await page.evaluate(() => window.kq!.ctx.settings.update((s) => (s.reducedMotion = true), 'reducedMotion'));
      const pz = await center(page, 'touch-pause');
      const menuFinger = new Finger(cdp, 4);
      await menuFinger.tap(pz.x, pz.y);
      const pause = page.getByTestId('pause-menu');
      await expect(pause).toBeVisible();
      await expect(page.getByTestId('touch')).toBeHidden();
      expect(await page.evaluate(() => window.kq!.ctx.pause.paused)).toBe(true);
      await page.screenshot({ path: `${SCREENS}/touch-${name}-pause.png` });
      const destinations = ['quests', 'codex', 'sets', 'gear', 'karte', 'album', 'chapters'];
      await expect(pause.locator('.kq-pause-destinations button')).toHaveCount(destinations.length);
      for (const id of destinations) {
        await pause.getByTestId(`pause-${id}`).tap();
        const view = page.getByTestId(`page-${id}`);
        await expect(view).toBeVisible();
        if (id === 'sets') await expect(view.getByRole('region', { name: 'Funde', exact: true })).toBeVisible();
        if (id === 'gear') {
          await expect(view.getByRole('heading', { name: 'Ausrüstung', exact: true })).toBeVisible();
          await view.getByRole('button', { name: 'Zu den Talenten', exact: true }).tap();
          await expect(view.getByRole('heading', { name: 'Talente', exact: true })).toBeInViewport();
        }
        await expect(view.locator('xpath=..')).toHaveCSS('animation-name', 'none');
        await view.getByRole('button', { name: 'Zurück', exact: true }).tap();
        await expect(view).toBeHidden();
        await expect(pause).toBeVisible();
      }
      await page.getByTestId('resume').tap();
      await expect(page.getByTestId('resume')).toBeHidden();
      await expect.poll(() => page.evaluate(() => window.kq!.ctx.pause.paused)).toBe(false);
      await expect(page.getByTestId('touch')).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

test.describe('survey tools on a landscape phone', () => {
  test.use({ ...DEVICES['iphone-13'] });

  test('opens one survey menu and uses relief, measurement and spirit view by touch', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootField(page);
    await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('today');
      k.teleport(1452, -640, 330, -25);
    });

    const survey = page.getByTestId('touch-survey');
    const menu = page.getByTestId('touch-survey-pop');
    await expect(page.locator('.kq-t-top button')).toHaveCount(2);
    await expect(menu).toBeHidden();
    await survey.tap();
    await expect(survey).toHaveAttribute('aria-expanded', 'true');
    for (const id of ['fly', 'relief', 'measure', 'xray', 'plans', 'map']) {
      await expect(menu.getByTestId(`touch-${id}`)).toBeVisible();
    }
    await menu.getByTestId('touch-relief').tap();
    await menu.getByTestId('touch-scan2').tap();
    await expect(menu).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.kq!.survey!.state().scan)).toBe(2);
    await survey.tap();
    await menu.getByTestId('touch-relief').tap();
    await menu.getByTestId('touch-scan0').tap();
    await expect.poll(() => page.evaluate(() => window.kq!.survey!.state().scan)).toBe(0);

    await survey.tap();
    await menu.getByTestId('touch-measure').tap();
    await expect.poll(() => page.evaluate(() => window.kq!.tools!.measure.state().mode)).toBe('a');
    await page.touchscreen.tap(460, 174);
    await expect.poll(() => page.evaluate(() => window.kq!.tools!.measure.state().mode)).toBe('b');
    await survey.tap();
    await menu.getByTestId('touch-measure').tap();
    await expect.poll(() => page.evaluate(() => window.kq!.tools!.measure.state().mode)).toBe('off');

    await survey.tap();
    await menu.getByTestId('touch-fly').tap();
    await expect.poll(() => page.evaluate(() => window.kq!.ctx.player.flying)).toBe(true);
    await expect(page.getByTestId('touch-crouch')).toHaveAccessibleName('Sinken');
    await expect(page.getByTestId('touch-prone')).toBeHidden();
    await survey.tap();
    await expect(menu.getByTestId('touch-fly')).toHaveText('Landen');
    await menu.getByTestId('touch-fly').tap();
    await expect.poll(() => page.evaluate(() => window.kq!.ctx.player.flying)).toBe(false);
  });

  test('replaying an ending from Pause refreshes the controls after landing', async ({ page }) => {
    await page.goto('./?notitle&fresh&manual&q=low');
    await waitForHooks(page, ['story']);
    expect(await page.evaluate(() => {
      const { ctx } = window.kq!;
      ctx.player.setStance('prone');
      ctx.player.writeState(ctx.state.mutable.player);
      const saved = ctx.save.save('ending', 'test');
      // Offer the genuine Pause action using a minimal ending-slot fixture.
      ctx.state.mutable.systems.story!.finished = true;
      return saved;
    })).toBe(true);

    const prone = page.getByTestId('touch-prone');
    await expect(prone).toBeVisible();
    await page.getByTestId('touch-survey').tap();
    await page.getByTestId('touch-fly').tap();
    await run(page, 1);
    await expect(page.getByTestId('touch-crouch')).toHaveAccessibleName('Sinken');
    await expect(prone).toBeHidden();

    await page.getByTestId('touch-pause').tap();
    await page.getByTestId('pause-ending-again').tap();
    await expect(prone).toBeVisible();
    await expect(prone).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('touch-crouch')).toHaveAccessibleName('Ducken (Schleichen)');
  });
});

test.describe('notices on a small landscape phone', () => {
  test.use({ ...DEVICES['iphone-13'], viewport: { width: 667, height: 375 } });

  test('outside taps dismiss, while drags, action buttons and modal scrolling still work', async ({ page }) => {
    test.setTimeout(ciScale(240_000));
    await bootField(page);
    const finger = new Finger(await page.context().newCDPSession(page), 1);
    const text = 'Codex ergänzt: Wasser, das sich erinnert – die Aufzeichnungen der Vermessungskommission';
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
    const survey = await center(page, 'touch-survey');
    const handy = await center(page, 'touch-photo');
    const pause = await center(page, 'touch-pause');
    expect(survey.y).toBe(handy.y);
    expect(handy.y).toBe(pause.y);
    expect(survey.x).toBeLessThan(handy.x);
    expect(handy.x).toBeLessThan(pause.x);

    await finger.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(toast).toBeVisible();

    const yaw = await page.evaluate(() => window.kq!.ctx.player.yaw);
    await finger.start(350, 195);
    await finger.move(436, 195);
    await finger.end();
    await expect.poll(() => page.evaluate((startYaw) => Math.abs(window.kq!.ctx.player.yaw - startYaw), yaw)).toBeGreaterThan(0.1);
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
      window.kq!.ctx.ui.modals.open({ title: 'Codex', body });
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

test.describe('touch at the Karlsbergquelle', () => {
  test.use({ ...DEVICES['iphone-13'], reducedMotion: 'reduce' });

  test('uses Pause for chapters and Aktion for the water', async ({ page }) => {
    test.setTimeout(ciScale(240_000));
    await page.goto('./?notitle&nosave&fresh&manual&q=low');
    await waitForHooks(page, ['story', 'quelle']);
    await page.evaluate(({ x, z, yaw }) => {
      const k = window.kq!;
      k.ctx.settings.update((s) => { s.reducedMotion = true; }, 'reducedMotion');
      k.teleport(x, z, yaw, -14);
      k.step(6);
    }, QUELLE_STAND);

    const interact = page.getByTestId('touch-interact');
    await expect(interact).toHaveText('Aktion');
    await interact.tap();
    await page.evaluate(() => window.kq!.step(2));
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByTestId('touch-pause').tap();
    await page.getByTestId('pause-chapters').tap();
    const chapters = page.getByTestId('page-chapters');
    await expect(chapters.getByTestId('chapter-tour')).toBeEnabled();
    await expect(chapters.getByTestId('chapter-k1')).toBeDisabled();
    await chapters.getByRole('button', { name: 'Zurück', exact: true }).tap();
    await page.getByTestId('resume').tap();

    await page.evaluate(() => {
      const k = window.kq!;
      k.ctx.state.mutable.flags['quelle.call'] = true;
      k.step(3);
    });
    await expect(interact).toHaveText('Wasser berühren');
    await interact.tap();
    await page.evaluate(() => window.kq!.step(2));
    expect(await page.evaluate(() => window.kq!.quelle!.info().scene)).not.toBeNull();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('touch at the Chapter 4 kennel', () => {
  test.use({ ...DEVICES['iphone-13'], viewport: { width: 667, height: 375 }, reducedMotion: 'reduce' });

  for (const oneKey of [false, true]) {
    test(oneKey ? 'one Hinlegen tap settles the gathered pack' : 'a stranded save finishes with Hinlegen then Laterne', async ({ page }) => {
      test.setTimeout(240_000);
      await page.goto('./?notitle&fresh&manual&q=low');
      await waitForHooks(page, ['story', 'hunt', 'lantern']);
      await page.evaluate((oneKey) => {
        const k = window.kq!;
        k.ctx.settings.update((s) => {
          s.oneKey = oneKey;
          s.gentleMode = false;
        }, 'oneKey');
        k.story!.goto('k4', 'k4_12');
        k.teleport(1214, -1569, 30);
        k.lantern!.toggle(false);
      }, oneKey);
      await run(page, 23);
      const stance = () => page.evaluate(() => window.kq!.ctx.player.stance);
      const lit = () => page.evaluate(() => window.kq!.lantern!.state().lit);
      const phase = () => page.evaluate(() => window.kq!.hunt!.mode()?.phase);
      expect(await stance()).toBe('stand');
      expect(await lit()).toBe(false);
      expect(await phase()).toBe('wait');

      const crouch = page.getByTestId('touch-crouch');
      const prone = page.getByRole('button', { name: 'Hinlegen', exact: true });
      const lantern = page.getByRole('button', { name: 'Laterne', exact: true });
      const prompt = page.locator('.kq-prompt.show');
      const cue = /\bcue\b/;
      if (!oneKey) {
        await crouch.tap();
        await run(page, 1);
        expect(await stance()).toBe('crouch');
        expect(await phase()).toBe('wait');
        expect(await page.evaluate(() => window.kq!.ctx.save.save())).toBe(true);
        await page.goto('./?manual&q=low');
        await page.getByTestId('title-continue').tap({ timeout: 90_000 });
        await waitForHooks(page, ['story', 'hunt', 'lantern']);
        await run(page, 23);
        expect(await stance()).toBe('crouch');
        expect(await phase()).toBe('wait');
        await expect(prompt).toHaveText('Hinlegen');
        await expect(prone).toHaveClass(cue);

        const survey = page.getByTestId('touch-survey');
        const fly = page.getByTestId('touch-fly');
        await survey.tap();
        await fly.tap();
        await run(page, 1);
        await expect(prone).toBeHidden();
        await expect(prompt).toHaveText('Landen');
        await expect(survey).toHaveClass(cue);
        await survey.tap();
        await expect(fly).toHaveText('Landen');
        await expect(fly).toHaveClass(cue);
        await fly.tap();
        await run(page, 1);
        expect(await stance()).toBe('stand');
        await expect(prompt).toHaveText('Hinlegen');
      }

      await expect(prone).toHaveClass(cue);
      await prone.tap();
      await run(page, 1);
      expect(await stance()).toBe('prone');
      if (!oneKey) {
        expect(await phase()).toBe('wait');
        expect(await lit()).toBe(false);
        await expect(prompt).toHaveText('Laterne an');
        await expect(prone).not.toHaveClass(cue);
        await expect(lantern).toHaveClass(cue);
        await lantern.tap();
        await run(page, 1);
        expect(await stance()).toBe('prone');
      }
      expect(await phase()).toBe('calm');
      expect(await lit()).toBe(true);
      await expect(lantern).not.toHaveClass(cue);
      await run(page, 35);
      expect(await page.evaluate(() => window.kq!.story!.state().beat)).toBe('k4_13');
    });
  }
});

test.describe('touch: title and settings by tap', () => {
  test.use({ ...DEVICES['iphone-13'] });

  test('new game by taps; Touch-Steuerung Aus hides the controls', async ({ page }) => {
    test.setTimeout(ciScale(240_000));
    const errors = trackErrors(page);
    await page.goto('./?nosave&fresh');
    const start = page.getByTestId('title-new');
    await expect(start).toBeEnabled({ timeout: 90_000 });
    await expect(start).toHaveAccessibleName('Neues Spiel');
    await page.screenshot({ path: `${SCREENS}/touch-title.png` });
    await start.tap();
    await page.getByTestId('warning-accept').tap();
    await page.getByTestId('name-confirm').tap();
    const map = page.getByTestId('tour-map');
    await expect(map).toBeInViewport({ ratio: 1 });
    await expect(map.getByTestId('start-tour')).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `${SCREENS}/touch-tour-map.png` });
    await map.getByTestId('start-tour').tap();
    await expect(page.getByTestId('title')).toBeHidden({ timeout: 30_000 });
    await expect.poll(() => page.evaluate(() => window.kq!.ctx.audio.unlocked)).toBe(true);
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
    test.setTimeout(ciScale(240_000));
    await page.setViewportSize({ width: 375, height: 667 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
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
    await expect(page.getByTestId('content-warning')).toHaveCSS('animation-name', 'none');
    await page.getByTestId('warning-accept').tap();
    await page.getByTestId('name-confirm').tap();
    const map = page.getByTestId('tour-map');
    await expect(map).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `${SCREENS}/touch-tour-map-portrait.png` });
    await map.getByTestId('start-tour').tap();
    await expect(page.getByTestId('title')).toBeHidden();
    await expect(page.getByTestId('title')).not.toHaveClass(/fade-out/);
    await expect(rotate).toBeVisible();
    await page.setViewportSize({ width: 667, height: 375 });
    await expect(rotate).toBeHidden();
    await expect(page.getByTestId('touch')).toBeVisible();
  });
});
