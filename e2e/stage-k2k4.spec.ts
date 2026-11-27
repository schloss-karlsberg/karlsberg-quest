/**
 * Staged K2 / K4 / ending set pieces (docs/ACTION-RPG.md §14, playtest round 4: "climaxes are
 * told in captions, not shown"): the rewind at the Westblick, Laub's night of 1840, Jost kneeling
 * by his hounds after W8, the prints in the hoarfrost, the Kabinett door crack, the frost on the
 * compass, the burn ending's memories. Screenshots: test-results/screens/s5-k2k4stage-*.png
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

async function shot(page: Page, name: string, hideDialogue = false): Promise<void> {
  // the chapter card of a jumped-to chapter would cover the picture (and Laub, when he talks over it)
  await page.evaluate((d) => {
    document.querySelectorAll('[data-testid="story-card"]').forEach((e) => e.remove());
    let st = document.getElementById('s5-hide-dlg');
    if (!st) {
      st = document.createElement('style');
      st.id = 's5-hide-dlg';
      document.head.append(st);
    }
    st.textContent = d ? '.kqs-dlg { display: none !important; }' : '';
  }, hideDialogue);
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${SCREENS}/s5-k2k4stage-${name}.png`, timeout: ciScale(150_000) });
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

/** Advance the running memory and the set pieces together (game frames are slow headless). */
async function advance(page: Page, seconds: number): Promise<void> {
  await page.evaluate((s) => {
    const k = window.kq as Any;
    k.chronik?.advanceEcho(s);
    k.stage.advance(s);
    k.step(2);
  }, seconds);
}

test.describe('staged set pieces (K2 / K4 / endings)', () => {
  test.describe.configure({ timeout: ciScale(600_000) });
  test.beforeEach(async ({ page }) => {
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => !!window.kq?.hunt && !!(window.kq as Any)?.stage && !!window.kq?.story && !!window.kq?.chronik, null, { timeout: 180_000 });
  });

  test('K4: the rewind — carts roll backwards uphill, the stones fly back into the wall', async ({ page }) => {
    const errors = trackErrors(page);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.ctx.state.mutable.flags['barks.quiet'] = true;
      k.story.start('Alex');
      k.story.goto('k4', 'k4_3');
      k.step(4);
      k.story.flush?.();
      k.ctx.ui.modals.closeAll();
      k.step(400);
    });
    await place(page, '1796', 200, -905, 226, 2);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.ctx.state.mutable.inventory.clues.push('clue.k4.hohenburg');
      k.step(2);
      k.chronik.listen('echo.k4.rueckwaerts');
      k.step(2);
    });
    expect((await page.evaluate(() => window.kq!.chronik!.echo())).id).toBe('echo.k4.rueckwaerts');
    expect(await page.evaluate(() => (window.kq as Any).stage.active())).toContain('k4-rewind');
    await advance(page, 3.2);
    await shot(page, 'k4-rewind-carts');
    await advance(page, 4.2);
    await shot(page, 'k4-rewind-stones');
    await page.evaluate(() => (window.kq as Any).stage.advance(2.6));
    const st = await page.evaluate(() => (window.kq as Any).stage.state('k4-rewind'));
    expect(st.built).toBeGreaterThan(0.95);
    await shot(page, 'k4-rewind-wall');
    expect(errors).toEqual([]);
  });

  test('K4: November 1840 — Laub at the theodolite, twelve pairs of eyes, he runs', async ({ page }) => {
    const errors = trackErrors(page);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.ctx.state.mutable.flags['barks.quiet'] = true;
      k.story.start('Alex');
      k.story.goto('k4', 'k4_8');
      k.step(4);
    });
    await place(page, '1796', 1380, -1470, 135, 0);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.story.look('night', '1796');
      k.step(2);
      k.chronik.listen('clue.k4.laub_1840');
      k.step(2);
    });
    expect((await page.evaluate(() => window.kq!.chronik!.echo())).id).toBe('clue.k4.laub_1840');
    await advance(page, 4);
    await shot(page, 'k4-1840-theodolit');
    // up to the eyes: they open one after another
    for (let i = 0; i < 30; i++) {
      const s = await page.evaluate(() => (window.kq as Any).stage.state('k4-1840'));
      if (s?.open >= 12) break;
      await advance(page, 1);
    }
    expect((await page.evaluate(() => (window.kq as Any).stage.state('k4-1840'))).open).toBe(12);
    await shot(page, 'k4-1840-augen');
    for (let i = 0; i < 30; i++) {
      const s = await page.evaluate(() => (window.kq as Any).stage.state('k4-1840'));
      if (s?.running) break;
      await advance(page, 1);
    }
    await advance(page, 1.2);
    await shot(page, 'k4-1840-flucht');
    expect(errors).toEqual([]);
  });

  test('K4: after W8 — the hounds lie round Jost, he kneels by one; prints in the hoarfrost', async ({ page }) => {
    const errors = trackErrors(page);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.ctx.state.mutable.flags['barks.quiet'] = true;
      k.story.start('Alex');
      k.story.goto('k4', 'k4_13');
      k.step(4);
      // the beat's resting-pack cue waits for the chapter card (M-11): run its timeline now
      k.story.flush();
    });
    await place(page, 'today', 1223.5, -1564, 294, -6);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.story.look('dawn');
      k.step(200);
    });
    expect((await page.evaluate(() => window.kq!.hunt!.tableau()))?.kind).toBe('rest');
    await shot(page, 'k4-jost-kniet');
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.ctx.events.emit('story:cue', { id: 'hunt:tableau', data: { kind: 'off' } });
      k.ctx.events.emit('npc:despawn', { npc: 'pikeur' });
      k.teleport(1216, -1571, 200, -38);
      k.stage.cue('end-prints', { n: 5, r: 1.7 });
      k.stage.advance(3);
      k.step(30);
    });
    await shot(page, 'k4-abdruecke');
    expect(errors).toEqual([]);
  });

  test('K2: the Kabinett door — the eye at the crack, the room behind it, the other crack; the frost on the compass', async ({ page }) => {
    const errors = trackErrors(page);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.ctx.state.mutable.flags['barks.quiet'] = true;
      k.story.start('Alex');
      k.story.goto('k2', 'k2_5');
      k.step(4);
    });
    // frost on the Bussole: came with the chapter (story:beat), visible on the compass
    expect(await page.evaluate(() => (window.kq as Any).stage.state('k2-frost')?.on)).toBe(true);
    await place(page, '1793-02', 1268, -1113.5, 0, 0);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.story.flush?.();
      k.ctx.ui.modals.closeAll();
      k.press('KeyE', 70);
    });
    expect(await page.evaluate(() => window.kq!.chronik!.echo().id)).toBe('clue.k2.warnung');
    const total1 = await page.evaluate(() => window.kq!.chronik!.echo().total);
    await advance(page, 1.2);
    expect(await page.evaluate(() => (window.kq as Any).stage.state('k2-door'))).toMatchObject({ peeking: true, lit: 0 });
    await expect(page.getByTestId('door-crack')).toBeVisible();
    await advance(page, 4.5);
    await shot(page, 'k2-tuerspalt');
    // A / D: the other crack
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.ctx.input.simulate('KeyD', true);
      k.stage.advance(0.1);
      k.ctx.input.simulate('KeyD', false);
      k.stage.advance(1.2);
      k.step(2);
    });
    expect(await page.evaluate(() => (window.kq as Any).stage.state('k2-door')?.lit)).toBe(1);
    await shot(page, 'k2-tuerspalt-rechts');
    await advance(page, 30);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.stage.advance(1);
      k.step(2);
      k.ctx.ui.modals.closeAll();
      k.story.flush?.();
      k.step(30);
    });
    expect(await page.evaluate(() => window.kq!.ctx.player.frozen)).toBe(false);
    // the farewell, through the other crack
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.teleport(1268, -1113.5, 0, 0);
      k.step(4);
      k.press('KeyE', 70);
    });
    expect(await page.evaluate(() => window.kq!.chronik!.echo().id)).toBe('clue.k2.abschied');
    const total2 = await page.evaluate(() => window.kq!.chronik!.echo().total);
    // playtest round 4: 68 s at the door → under 20 s for both
    expect(total1 + total2).toBeLessThanOrEqual(20);
    await advance(page, 3.6);
    await shot(page, 'k2-abschied');
    await advance(page, 30);
    expect(errors).toEqual([]);
  });

  test('K2: the sneak — sight cones of the hounds, then "Sicher. Aufstehen."; the candle; the thaw', async ({ page }) => {
    const errors = trackErrors(page);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.ctx.state.mutable.flags['barks.quiet'] = true;
      k.story.start('Alex');
      k.story.goto('k2', 'k2_2');
      k.step(4);
    });
    await place(page, '1793-02', 1503, -536, 205, -8);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.step(120);
      k.story.finishTyping();
      k.lantern.toggle(false);
      k.press('KeyC', 1);
      k.step(90);
    });
    expect(await page.evaluate(() => window.kq!.ctx.state.state.flags['hunt.cones'])).toBe(true);
    // look at the nearest hound (its cone on the frost)
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.story.flush();
      const p = k.ctx.player.position;
      const hs = k.hunt.sim().agents.filter((a: Any) => a.kind === 'hound');
      hs.sort((a: Any, b: Any) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      const h = hs[0];
      // 14 m off its flank (outside its cone: crouched, lantern out), looking at it
      const side = h.heading + Math.PI / 2;
      const x = h.x - Math.sin(side) * 14;
      const z = h.z - Math.cos(side) * 14;
      k.hunt.freeze(true);
      k.ctx.player.teleport(x, z);
      k.ctx.player.yaw = Math.atan2(-(h.x - x), -(h.z - z));
      k.ctx.player.pitch = -0.22;
      k.step(2);
      void p;
    });
    await shot(page, 'k2-schleichen-kegel', true);
    await page.evaluate(() => (window.kq as Any).hunt.freeze(false));
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.teleport(1478, -584, 205, -4);
      k.step(30);
    });
    expect(await page.evaluate(() => window.kq!.ctx.state.state.flags['hunt.cones'] ?? null)).toBeNull();
    await shot(page, 'k2-sicher', true);
    // the candle behind the gallery windows
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.teleport(1212, -1196, 336, 6);
      k.stage.cue('k2-candle', { x: 1203, z: -1216 });
      k.stage.advance(2.5);
      k.step(4);
    });
    expect(await page.evaluate(() => (window.kq as Any).stage.state('k2-candle')?.lit)).toBe(1);
    await shot(page, 'k2-kerze', true);
    // the thaw: the frost melts off the compass, smoke rises
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.stage.cue('k2-thaw');
      k.step(2);
    });
    await expect(page.getByTestId('frost-glass')).toHaveClass(/melting/);
    expect(errors).toEqual([]);
  });

  test('K2: the departure — wagons and torches roll out north and go small in the fog', async ({ page }) => {
    const errors = trackErrors(page);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.ctx.state.mutable.flags['barks.quiet'] = true;
      k.story.start('Alex');
      k.story.goto('k2', 'k2_7');
      k.step(4);
    });
    await place(page, '1793-02', 1222, -1100, 0, -2);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.story.flush();
      k.ctx.ui.modals.closeAll();
      k.chronik.listen('clue.k2.fackeln');
    });
    await advance(page, 2.2);
    await advance(page, 3);
    expect(await page.evaluate(() => (window.kq as Any).stage.active())).toContain('k2-abfahrt');
    await shot(page, 'k2-abfahrt');
    await advance(page, 60);
    expect(errors).toEqual([]);
  });

  test('K2: Landremont — the riders gallop past you up to the palace (no caption)', async ({ page }) => {
    const errors = trackErrors(page);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.ctx.state.mutable.flags['barks.quiet'] = true;
      k.story.start('Alex');
      k.story.goto('k2', 'k2_7');
      k.step(4);
    });
    // at the Orangerie-Parterre, looking up towards the palace, a little to the right
    await place(page, '1793-02', 1275, -960, 5, -3);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.story.flush();
      k.ctx.ui.modals.closeAll();
      k.chronik.listen('clue.k2.landremont');
    });
    // through the general's question and the craftsman's answer: the gallop begins
    for (let i = 0; i < 6 && !(await page.evaluate(() => JSON.stringify((window.kq as Any).stage.active()))).includes('k2-reiter'); i++) await advance(page, 1.5);
    expect(await page.evaluate(() => (window.kq as Any).stage.active())).toContain('k2-reiter');
    await page.evaluate(() => (window.kq as Any).stage.line('echo.k2.landremont.02'));
    await page.evaluate(() => (window.kq as Any).stage.advance(2.4));
    await page.evaluate(() => window.kq!.step(2));
    await shot(page, 'k2-reiter', true);
    await page.evaluate(() => (window.kq as Any).stage.advance(2.2));
    await page.evaluate(() => window.kq!.step(2));
    await shot(page, 'k2-reiter-away', true);
    await page.evaluate(() => (window.kq as Any).stage.advance(12));
    await page.evaluate(() => window.kq!.step(2));
    expect(await page.evaluate(() => (window.kq as Any).stage.active())).not.toContain('k2-reiter');
    expect(errors).toEqual([]);
  });

  test('Endings: the burn shows its memories through the burning pages; the museum needle; the keep prints', async ({ page }) => {
    const errors = trackErrors(page);
    await place(page, 'today', 1059.3, -833.1, 50, 0);
    await page.evaluate(() => {
      const k = window.kq!;
      k.story!.look('night');
      k.story!.ending('burn', true);
    });
    await expect(page.getByTestId('ending-stage')).toBeVisible({ timeout: 20_000 });
    for (const [at, name] of [
      [4.6, 'ende-burn-ehrenhof'],
      [7.8, 'ende-burn-feuerwerk'],
      [10.6, 'ende-burn-jagd'],
    ] as const) {
      await page.evaluate((at) => (window.kq as Any).story.stageHold(at), at);
      // the hounds' eyes open on their own (real-time) clock: give the slow renderer time
      await page.waitForTimeout(name.endsWith('jagd') ? 16000 : 5000);
      await expect(page.getByTestId('ending-memory')).toHaveCSS('opacity', '1');
      await shot(page, name);
    }
    await page.getByTestId('ending-stage-skip').click();
    await expect(page.getByTestId('ending-next')).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test('Endings: the museum needle settles north; the keep ending leaves prints before the step', async ({ page }) => {
    const errors = trackErrors(page);
    await place(page, 'today', 1059.3, -833.1, 50, 0);
    await page.evaluate(() => {
      const k = window.kq!;
      k.story!.look('dawn');
      k.story!.ending('museum', true);
    });
    await expect(page.getByTestId('ending-stage')).toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => (window.kq as Any).story.stageHold(8.5));
    await page.waitForTimeout(5000);
    await expect(page.getByTestId('ending-bussole')).toBeVisible();
    await shot(page, 'ende-museum-nadel');
    await page.getByTestId('ending-stage-skip').click();
    await expect(page.getByTestId('ending-next')).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await page.waitForFunction(() => !!(window.kq as Any)?.stage && !!window.kq?.story, null, { timeout: 180_000 });
    await place(page, 'today', 1059.3, -833.1, 50, -14);
    await page.evaluate(() => {
      const k = window.kq!;
      k.story!.look('dusk');
      k.story!.ending('keep', true);
    });
    await expect(page.getByTestId('ending-stage')).toBeVisible({ timeout: 20_000 });
    expect(await page.evaluate(() => (window.kq as Any).stage.active())).toContain('end-prints');
    await page.evaluate(() => (window.kq as Any).story.stageHold(2.4));
    await page.waitForTimeout(4000);
    await shot(page, 'ende-keep-abdruecke');
    expect(errors).toEqual([]);
  });
  test('Bussole cues (lid, needle, ticking) and the Registratur papers; the passing frost', async ({ page }) => {
    const errors = trackErrors(page);
    await place(page, 'today', 1059.3, -833.1, 50, 0);
    const cue = (id: string, data: Record<string, unknown> = {}) =>
      page.evaluate(({ id, data }) => window.kq!.ctx.events.emit('story:cue', { id, data } as never), { id, data });
    // the lid springs open and a page rises out of it (the Bussole shows for the cue)
    await cue('bussole:open');
    await page.evaluate(() => window.kq!.step(2));
    await page.waitForTimeout(1300);
    await expect(page.getByTestId('bussole')).toHaveClass(/kqs-open/);
    await expect(page.getByTestId('bussole-page')).toBeVisible();
    // the lid and the page run on CSS time: hold them at 1.6 s (the slow renderer's shot takes longer)
    await page.evaluate(() => {
      for (const a of document.getAnimations()) {
        const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
        if (t?.closest('[data-testid="bussole"]')) {
          a.pause();
          a.currentTime = 1600;
        }
      }
    });
    await shot(page, 'bussole-deckel');
    await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
    // the needle is flung round and settles on the Ehrenhof
    await cue('bussole:jolt', { x: 1218, z: -1118, hold: 6 });
    await page.evaluate(() => window.kq!.step(40));
    await expect(page.getByTestId('bussole')).toHaveClass(/kqs-show/);
    // the passing frost: on the glass and the edges of the view, thawing on its own
    await cue('frost-breath', { s: 6 });
    await page.evaluate(() => (window.kq as Any).stage.advance(4.5));
    await expect(page.getByTestId('frost-glass')).toBeVisible();
    await shot(page, 'reif');
    await page.evaluate(() => (window.kq as Any).stage.advance(8));
    // the reminders whirl up off the desk and stream out towards the courtyard
    await place(page, '1789', 1218, -1100, 0, 4);
    await cue('k1-papers', { tx: 1212, tz: -1180 });
    expect(await page.evaluate(() => (window.kq as Any).stage.active())).toContain('k1-papers');
    await page.evaluate(() => (window.kq as Any).stage.advance(1.3));
    await page.evaluate(() => (window.kq as Any).stage.hold(true));
    await shot(page, 'k1-papiere');
    await page.evaluate(() => (window.kq as Any).stage.hold(false));
    await page.evaluate(() => {
      (window.kq as Any).stage.advance(5);
      window.kq!.step(2);
    });
    expect(await page.evaluate(() => (window.kq as Any).stage.active())).not.toContain('k1-papers');
    expect(errors).toEqual([]);
  });
});
