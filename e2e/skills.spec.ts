import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { SCREENS } from './helpers/common';

/**
 * Skills + survey tools: gating (Relief-Blick, Kartograf), the unlock card with Laub's line, the
 * 1840 / 1935 maps (M), measuring the gallery (R), the Baumeister plan sheet and confidence
 * view (B), Röntgenblick (V), Spurenleser horn meaning + pack routes and the settings / key help.
 * Screenshots: test-results/screens/skills-*.png.
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

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${SCREENS}/skills-${name}.png`, timeout: 150_000 });
}

/** Record events of the given types into window.__ev. */
async function record(page: Page, types: string[]): Promise<void> {
  await page.evaluate((ts) => {
    const w = window as unknown as { __ev: { type: string; payload: unknown }[] };
    w.__ev = [];
    for (const t of ts) window.kq!.ctx.events.on(t as 'scan:mode', (p: unknown) => w.__ev.push({ type: t, payload: p }));
  }, types);
}
const events = (page: Page, type: string) =>
  page.evaluate((t) => (window as unknown as { __ev: { type: string; payload: unknown }[] }).__ev.filter((e) => e.type === t).map((e) => e.payload), type);

/** Point the camera from the player's eye at a world point (yaw 0 = north, degrees). */
async function aimAt(page: Page, x: number, y: number, z: number): Promise<void> {
  await page.evaluate(
    ([x, y, z]) => {
      const k = window.kq!;
      const cam = k.ctx.camera.position;
      const dx = x! - cam.x;
      const dz = z! - cam.z;
      const yawDeg = (Math.atan2(dx, -dz) * 180) / Math.PI;
      const pitchDeg = (Math.atan2(y! - cam.y, Math.hypot(dx, dz)) * 180) / Math.PI;
      const p = k.ctx.player.position;
      k.teleport(p.x, p.z, yawDeg, pitchDeg);
      k.step(1);
    },
    [x, y, z],
  );
}

/** Point the camera at the ground at x/z. */
async function aimAtGround(page: Page, x: number, z: number): Promise<void> {
  const y = await page.evaluate(([x, z]) => window.kq!.ctx.world.heightAt(x!, z!), [x, z]);
  await aimAt(page, x, y, z);
}

/** Skip the dialogue lines on screen (Enter), so they do not cover the picture. */
async function clearDialogue(page: Page): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const busy = await page.evaluate(() => {
      const s = window.kq!.story?.state();
      return !!s && (s.dialogue !== null || s.pendingLines > 0);
    });
    if (!busy) return;
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
  }
}

test.describe('skills and survey tools', () => {
  test.beforeEach(async ({ page }) => {
    // the survey tools aim from the eye: first person (cam=first) keeps the crosshair maths exact
    await page.goto('./?notitle&nosave&fresh&manual&skills=strict&cam=first');
    await page.waitForFunction(() => window.kq !== undefined && window.kq.tools !== undefined && window.kq.skills !== undefined, null, { timeout: 120_000 });
  });

  test('gating, unlock card with Laub, maps 1840 and 1935', async ({ page }) => {
    const errors = trackErrors(page);
    await record(page, ['scan:mode', 'skill:unlocked', 'dialogue:say']);
    // strict gating: nothing learned yet, every key leaves a note instead
    await page.evaluate(() => {
      const k = window.kq!;
      k.teleport(1150, -1050, 120, -14);
      k.press('Digit2', 2);
      k.press('KeyM', 2);
      k.press('Digit3', 2);
      k.press('Digit4', 2);
      k.press('Digit5', 2);
      // (M opens the travel map now; the survey layer stays off)
      k.travel?.map(false);
    });
    expect(await events(page, 'scan:mode')).toEqual([]);
    expect(await page.evaluate(() => window.kq!.survey!.state().map)).toBe(0);
    expect(await page.evaluate(() => window.kq!.tools!.state())).toMatchObject({ measure: 'off', xray: false, plans: 'off' });

    // skill:grant (the contract event) → state.skills, card, Laub
    await page.evaluate(() => window.kq!.ctx.events.emit('skill:grant', { skill: 'relief', level: 2 }));
    expect(await page.evaluate(() => window.kq!.state().skills)).toMatchObject({ relief: 2 });
    const card = page.getByTestId('skill-card');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-skill', 'relief');
    await expect(card).toContainText('Lokales Relief');
    expect(await events(page, 'skill:unlocked')).toEqual([{ skill: 'relief', level: 2 }]);
    // the stamp lands after ~1.2 s of card time (frame clock, slow under software GL), then Laub speaks
    await expect(card).toHaveClass(/kqk-in/);
    await page.waitForFunction(() => window.kq!.skills!.said().length > 0, null, { timeout: 60_000 });
    expect((await events(page, 'dialogue:say')).map((d) => (d as { speaker: string }).speaker)).toContain('laub');
    await shot(page, 'unlock-card');
    await page.evaluate(() => {
      const k = window.kq!;
      k.press('Digit2', 2);
      k.press('Digit2', 2);
      k.press('Digit2', 2);
    });
    expect(await events(page, 'scan:mode')).toEqual([{ mode: 1 }, { mode: 2 }, { mode: 0 }]);
    await page.keyboard.press('Shift+Digit2');
    await page.evaluate(() => window.kq!.step(2));
    expect(await page.evaluate(() => window.kq!.survey!.state().scan)).toBe(2);
    await page.keyboard.press('Backquote');
    await page.evaluate(() => window.kq!.step(2));
    expect(await page.evaluate(() => window.kq!.survey!.state().scan)).toBe(0);

    // Kartograf 2: the map's layer buttons lay off → 1840 → 1935 → off on the terrain (seen from
    // the air over the palace site; the buttons send survey:show-map)
    await page.evaluate(() => {
      const k = window.kq!;
      k.skills!.grant('kartograf', 2, true);
      k.setScanMode(0);
      const p = k.ctx.player;
      p.setFlying(true);
      k.teleport(1150, -1100, 100, -60);
      k.step(2);
      p.position.y = k.ctx.world.heightAt(1150, -1100) + 160;
      k.ctx.events.emit('survey:show-map', { layer: 1840 });
      k.step(40);
    });
    expect(await page.evaluate(() => window.kq!.survey!.state().map)).toBe(1840);
    await page.waitForFunction(() => window.kq!.skills!.card() === null, null, { timeout: 120_000 }); // let the card leave
    await clearDialogue(page);
    await shot(page, 'map1840');
    await page.evaluate(() => {
      const k = window.kq!;
      k.ctx.events.emit('survey:show-map', { layer: 1935 });
      k.step(40);
    });
    expect(await page.evaluate(() => window.kq!.survey!.state().map)).toBe(1935);
    await page.waitForFunction(() => {
      const tex = window.kq!.ctx.world.terrain.uniforms.uMap!.value as { image?: { width?: number } } | null;
      return (tex?.image?.width ?? 0) > 0;
    });
    await page.evaluate(() => window.kq!.step(2));
    await clearDialogue(page);
    await shot(page, 'map1935');
    await page.evaluate(() => {
      window.kq!.ctx.events.emit('survey:show-map', { layer: 0 });
      window.kq!.step(2);
    });
    expect(await page.evaluate(() => window.kq!.survey!.state().map)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('an unlock card steps aside while a story title card shows (no overlap)', async ({ page }) => {
    const errors = trackErrors(page);
    await page.evaluate(() => window.kq!.teleport(1150, -1050, 120, -4));
    await page.evaluate(() => window.kq!.ctx.events.emit('skill:grant', { skill: 'relief', level: 2 }));
    const card = page.getByTestId('skill-card');
    await expect(card).toHaveClass(/kqk-in/);
    // a chapter title card comes up (the story's .kqs-card): the unlock card hides and waits
    await page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'kqs-card kqs-show';
      el.id = 'fake-title';
      document.body.append(el);
      window.kq!.step(30);
    });
    await expect(card).toHaveClass(/kqk-held/);
    const held = await page.evaluate(() => window.kq!.skills!.card());
    expect(held).toMatchObject({ skill: 'relief', level: 2 });
    await page.evaluate(() => {
      document.getElementById('fake-title')!.remove();
      window.kq!.step(2);
    });
    await expect(card).not.toHaveClass(/kqk-held/);
    await shot(page, 'card-after-title');
    expect(errors).toEqual([]);
  });

  test('measuring the gallery (Kartograf 3) gives the model length', async ({ page }) => {
    const errors = trackErrors(page);
    await record(page, ['measure:done']);
    await page.evaluate(() => {
      const k = window.kq!;
      k.skills!.grant('kartograf', 3, true);
      k.setEra('1789');
      k.teleport(1230, -1250, 0, 0);
      k.step(2);
      k.press('Digit3', 2);
    });
    expect(await page.evaluate(() => window.kq!.tools!.state().measure)).toBe('a');
    // the facade of the gallery wing that faces the Gärtnerei: just inside both corners, just under the eaves (above the low KB-B40 at the west end)
    const ring = await page.evaluate(() => window.kq!.ctx.data.footprints.buildings.find((b) => b.id === 'KB-B06')!.ring);
    const [p3, p2] = [ring[3]!, ring[2]!];
    const at = (t: number): [number, number, number] => [p3[0]! + (p2[0]! - p3[0]!) * t, 354.5, p3[1]! + (p2[1]! - p3[1]!) * t];
    const into = ([x, y, z]: [number, number, number]): [number, number, number] => [x, y, z + 0.3]; // a little into the wall
    await aimAt(page, ...into(at(0.02)));
    const a = await page.evaluate(() => window.kq!.tools!.measure.pick());
    expect(a).toMatchObject({ on: 'palace', building: 'KB-B06' });
    await page.evaluate(() => window.kq!.press('Mouse0', 2));
    await aimAt(page, ...into(at(0.98)));
    await page.evaluate(() => window.kq!.press('Mouse0', 2));
    const st = await page.evaluate(() => window.kq!.tools!.measure.state());
    expect(st.mode).toBe('done');
    expect(st.building).toBe('KB-B06');
    // footprint KB-B06 is ≈ 83 m long; 2 % in from each corner the tape reads ≈ 78 m: the model, not a fixed number
    expect(st.distance!).toBeGreaterThan(76);
    expect(st.distance!).toBeLessThan(85);
    const done = (await events(page, 'measure:done')) as { distance: number; building?: string }[];
    expect(done).toHaveLength(1);
    expect(done[0]!.building).toBe('KB-B06');
    expect(done[0]!.distance).toBeCloseTo(st.distance!, 2);
    expect(await page.evaluate(() => window.kq!.state().flags['measured.KB-B06'])).toBeCloseTo(st.distance!, 0);
    await expect(page.getByTestId('measure-distance')).toContainText(' m');
    // step back for the picture: the tape along the facade, above the Gärtnerei roofs
    await page.evaluate(() => {
      const k = window.kq!;
      k.teleport(1236, -1300, 180, 0);
      k.step(2);
    });
    await aimAt(page, ...at(0.5));
    await clearDialogue(page);
    await shot(page, 'measure-gallery');

    // terrain measurement with the height profile (today, down the Schlossberg slope)
    await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('today');
      k.ctx.player.setFlying(true);
      k.teleport(1112, -936, 0, 0);
      k.step(2);
      k.ctx.player.position.y = k.ctx.world.heightAt(1112, -936) + 34;
      k.tools!.measure.at(1100, -1000, 1040, -930);
      k.step(4);
    });
    await aimAtGround(page, 1068, -962);
    const t = await page.evaluate(() => window.kq!.tools!.measure.state());
    expect(t.distance!).toBeGreaterThan(90);
    await expect(page.locator('.kqt-profile')).toBeVisible();
    await shot(page, 'measure-terrain');
    await page.evaluate(() => window.kq!.press('Digit3', 2));
    expect(await page.evaluate(() => window.kq!.tools!.state().measure)).toBe('off');
    expect(errors).toEqual([]);
  });

  test('Baumeister: plan sheet and confidence view', async ({ page }) => {
    const errors = trackErrors(page);
    await page.evaluate(() => {
      const k = window.kq!;
      k.skills!.grant('baumeister', 3, true);
      const p = k.ctx.player;
      p.setFlying(true);
      k.teleport(1130, -1125, 95, -42);
      k.step(2);
      p.position.y = k.ctx.world.heightAt(1130, -1125) + 115;
      k.press('Digit5', 2);
      k.step(30);
    });
    expect(await page.evaluate(() => window.kq!.tools!.state().plans)).toBe('plan');
    await page.waitForTimeout(300);
    await shot(page, 'plan-sheet');
    await page.evaluate(() => {
      const k = window.kq!;
      k.press('Digit5', 2);
      k.step(40);
    });
    expect(await page.evaluate(() => window.kq!.tools!.state().plans)).toBe('conf');
    await expect(page.getByTestId('conf-legend')).toBeVisible();
    // today: the palace stands as a ghost in confidence colours
    expect(await page.evaluate(() => window.kq!.ctx.world.palace.object.visible)).toBe(true);
    await page.waitForTimeout(300);
    await shot(page, 'confidence-today');
    // 1789: the intact palace in Okabe-Ito colours
    await page.evaluate(() => {
      const k = window.kq!;
      k.ctx.player.setFlying(false);
      k.setEra('1789');
      k.teleport(1236, -1300, 180, 0);
      k.step(40);
    });
    await aimAt(page, 1236, 357, -1200);
    await page.waitForFunction(() => (window.kq!.ctx.world.palace.uniforms.uConfMix!.value as number) > 0.95, null, { timeout: 60_000 });
    await clearDialogue(page);
    await shot(page, 'confidence-1789');
    await page.evaluate(() => {
      const k = window.kq!;
      k.press('Digit5', 2);
      k.step(60);
    });
    expect(await page.evaluate(() => window.kq!.tools!.state().plans)).toBe('off');
    await page.waitForFunction(() => (window.kq!.ctx.world.palace.uniforms.uConfMix!.value as number) === 0, null, { timeout: 60_000 });
    expect(errors).toEqual([]);
  });

  test('Röntgenblick: ground points under the canopy, trees fade', async ({ page }) => {
    const errors = trackErrors(page);
    await expect(page.getByTestId('title-loading')).toBeHidden();
    await page.evaluate(() => {
      const k = window.kq!;
      k.skills!.grant('roentgen', 1, true);
      k.teleport(1160, -1060, 150, -16);
      k.step(2);
    });
    await shot(page, 'xray-before');
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const cloud = '**/data/pointcloud/ground.kqp.deflate';
    await page.route(cloud, async (route) => {
      await pending;
      await route.fallback();
    });
    const indicator = page.getByRole('progressbar', { name: 'Punktwolke wird geladen …' });
    try {
      const requested = page.waitForRequest(cloud);
      await page.evaluate(() => window.kq!.press('Digit4', 2));
      await requested;
      expect(await page.evaluate(() => window.kq!.tools!.state().xray)).toBe(true);
      await expect(indicator).toBeVisible();
      await expect(indicator).not.toHaveAttribute('aria-valuenow', /.+/);
      await page.evaluate(() => window.kq!.press('Digit4', 2));
      await expect(indicator).toBeHidden();
      expect(await page.evaluate(() => window.kq!.tools!.state().xray)).toBe(false);
      const response = page.waitForResponse(cloud);
      release();
      expect((await response).ok()).toBe(true);
      await expect(indicator).toBeHidden();
    } finally {
      release();
    }
    const r = await page.evaluate(() => window.kq!.tools!.xray(true));
    expect(r.loaded).toBe(true);
    expect(r.points).toBeGreaterThan(5000);
    await expect(indicator).toBeHidden();
    await page.evaluate(() => window.kq!.step(90));
    await page.waitForTimeout(1600);
    expect(await page.evaluate(() => window.kq!.tools!.state().clear)).toBeGreaterThan(0.9);
    await shot(page, 'xray');
    // the paw prints (fiction) cross the Ehrenhof
    await page.evaluate(() => {
      const k = window.kq!;
      k.teleport(1210, -1135, 10, -30);
      k.step(10);
    });
    await page.waitForTimeout(1200);
    await shot(page, 'xray-paws');
    await page.evaluate(() => window.kq!.press('Digit4', 2));
    expect(await page.evaluate(() => window.kq!.tools!.state().xray)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('Spurenleser: horn meaning and pack routes', async ({ page }) => {
    const errors = trackErrors(page);
    await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('1793-02');
      // the pack runs on the avenue, the player watches from 120 m (nobody gets caught here)
      k.teleport(1452, -760, 330, -8);
      k.hunt!.start({ x: 1452, z: -640, radius: 90, intensity: 0.3, hounds: 4, pikeur: true, seed: 5, sight: 20 });
      k.step(120);
      k.hunt!.horn('found');
      k.step(2);
    });
    await expect(page.locator('body')).toContainText('[Horn: zwei kurze Töne]');
    expect(await page.evaluate(() => document.body.innerText)).not.toContain('sie haben deine Fährte');
    expect(await page.evaluate(() => window.kq!.tools!.tracks().on)).toBe(false);
    await page.evaluate(() => {
      const k = window.kq!;
      k.skills!.grant('spurenleser', 2, true);
      k.step(200);
      k.hunt!.horn('found');
      k.step(2);
    });
    await expect(page.locator('body')).toContainText('[Horn: zwei kurze Töne – sie haben deine Fährte]');
    await page.waitForFunction(() => window.kq!.tools!.tracks().lines > 0, null, { timeout: 30_000 });
    const tr = await page.evaluate(() => window.kq!.tools!.tracks());
    expect(tr.on).toBe(true);
    expect(tr.pack!.agents.length).toBeGreaterThan(0);
    // let the trails grow (they are sampled on the frame clock), then look down on a hound
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.kq!.step(24));
      await page.waitForTimeout(450);
    }
    const hound = await page.evaluate(() => {
      const k = window.kq!;
      k.hunt!.freeze(true);
      const ag = k.tools!.tracks().pack!.agents;
      const a = ag.find((g) => g.kind === 'hound') ?? ag[0]!;
      k.teleport(a.x + 9, a.z + 9, 0, 0);
      k.step(2);
      return a;
    });
    await aimAtGround(page, hound.x + 2, hound.z + 2);
    await page.waitForTimeout(1200);
    await clearDialogue(page);
    await shot(page, 'pack-routes');
    await page.evaluate(() => window.kq!.hunt!.stop());
    expect(errors).toEqual([]);
  });

  test('settings: Rauhnacht, captions, indicators, graphics; key help', async ({ page }) => {
    const errors = trackErrors(page);
    await page.keyboard.press('Escape');
    await page.getByTestId('pause-settings').click();
    await expect(page.getByTestId('set-rauhnacht')).toBeVisible();
    await page.getByTestId('set-rauhnacht').check();
    await page.getByTestId('set-subtitles').uncheck();
    await page.getByTestId('set-graphics').getByLabel('niedrig').check();
    const s = await page.evaluate(() => window.kq!.ctx.settings.state);
    expect(s).toMatchObject({ rauhnacht: true, subtitles: false, graphics: 'low' });
    expect(await page.evaluate(() => window.kq!.ctx.renderer.getPixelRatio())).toBe(1);
    expect(await page.evaluate(() => window.kq!.fx!.state().quality)).toBe('low');
    await shot(page, 'settings');
    await page.getByRole('button', { name: 'Zurück' }).click();
    await page.getByTestId('pause-controls').click();
    const help = page.getByTestId('key-help');
    const scanKeys = help.getByRole('row').filter({ hasText: 'Relief-Blick wechseln' }).locator('.k');
    const xrayKeys = help.getByRole('row').filter({ hasText: 'Röntgenblick' }).locator('.k');
    await expect(help).toContainText('Messen: Strecke und Höhenprofil');
    await expect(help.getByRole('row').filter({ hasText: 'Planblatt' })).toContainText('[5]');
    await expect(scanKeys).toHaveText('[2] / [Umschalt+2]');
    await expect(xrayKeys).toHaveText('[4]');
    await help.locator('tr').last().scrollIntoViewIfNeeded();
    await shot(page, 'key-help');

    await page.getByRole('button', { name: 'Zurück' }).click();
    await page.getByTestId('pause-settings').click();
    const bindings = page.getByTestId('bindings');
    await bindings.locator('summary').click();
    await page.getByTestId('bind-scan').click();
    await page.keyboard.press('F6');
    await bindings.getByRole('row').filter({ has: page.getByTestId('bind-xray') })
      .getByRole('button', { name: '4 entfernen' }).click();
    await page.getByRole('button', { name: 'Zurück' }).click();
    await page.getByTestId('pause-controls').click();
    await expect(scanKeys).toHaveText('[2] / [F6] / [Umschalt+2] / [Umschalt+F6]');
    await expect(xrayKeys).toHaveText('—');

    await page.getByRole('button', { name: 'Zurück' }).click();
    await page.getByTestId('pause-settings').click();
    await bindings.locator('summary').click();
    await page.getByTestId('bind-reset').click();
    await page.getByRole('button', { name: 'Zurück' }).click();
    await page.getByTestId('pause-controls').click();
    await expect(scanKeys).toHaveText('[2] / [Umschalt+2]');
    await expect(xrayKeys).toHaveText('[4]');
    expect(errors).toEqual([]);
  });
});
