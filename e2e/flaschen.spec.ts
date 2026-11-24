import { type Page, expect, test } from '@playwright/test';
import { openPause, waitForHooks } from './helpers/pause';
import { SCREENS, trackErrors } from './helpers/common';
import { FLASCHENGRUEN } from '../src/player/cosmetics';

/**
 * Fläschchen (docs/IDEAS-ROUND11.md §4): every one of the 24 bottles in its era, looked at from a
 * few metres (test-results/screens/fl-<id>.png), and one pickup end to end: E → 1/24 → the toast →
 * the Sammlungen row in Pause → the Regal → saved in the `flaschen` slice.
 */

/**
 * Where the eye stands for each shot (first person): compass bearing FROM the bottle (deg, 0 =
 * north / −z) and distance (m); the pitch aims at the bottle. Chosen so the bottle is in view (the
 * spots are hidden from the main path on purpose: these views are the "found it" angle).
 */
const VIEW: Record<string, { from: number; d: number }> = {
  'fl.heute.quelle': { from: 200, d: 2.6 },
  'fl.heute.eiskeller': { from: 0, d: 2.4 },
  'fl.heute.gipfel': { from: 180, d: 1.2 },
  'fl.heute.grenzstein': { from: 180, d: 2.4 },
  'fl.heute.westblick': { from: 290, d: 2.4 },
  'fl.heute.tschifflik': { from: 270, d: 2.4 },
  'fl.1789.quelle': { from: 234, d: 2.4 },
  'fl.1789.orangerie': { from: 110, d: 2.4 },
  'fl.1789.gitter': { from: 270, d: 2.8 },
  'fl.1789.bauplatz': { from: 180, d: 2.6 },
  'fl.1789.rund': { from: 90, d: 2.6 },
  'fl.1789.allee': { from: 90, d: 3.2 },
  'fl.179302.quelle': { from: 234, d: 3.0 },
  'fl.179302.torhaus': { from: 200, d: 2.4 },
  'fl.179302.allee': { from: 90, d: 3.2 },
  'fl.179302.wachhaus': { from: 270, d: 2.4 },
  'fl.179307.gaertnerei': { from: 90, d: 2.0 },
  'fl.179307.zwinger': { from: 270, d: 2.4 },
  'fl.179307.quelle': { from: 234, d: 2.8 },
  'fl.1796.baumagazin': { from: 270, d: 2.4 },
  'fl.1796.taleingang': { from: 270, d: 2.2 },
  'fl.1796.steinplatz': { from: 0, d: 2.6 },
  'fl.1796.westblick': { from: 270, d: 2.4 },
  'fl.1796.quelle': { from: 200, d: 2.2 },
};

async function boot(page: Page): Promise<void> {
  await page.goto('./?notitle&nosave&fresh&manual');
  await waitForHooks(page, ['flaschen', 'scenery'], 90_000);
  await page.evaluate(() => {
    window.kq!.story?.look('day');
    window.kq!.step(2);
  });
}

test.describe('Fläschchen', () => {
  test.describe.configure({ timeout: 900_000 });

  test('all 24 bottles stand in their eras, on a surface, in view', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    const spots = await page.evaluate(() => window.kq!.flaschen!.spots());
    expect(spots.length).toBe(24);
    const report: string[] = [];
    for (const s0 of spots) {
      const v = VIEW[s0.id] ?? { from: 180, d: 2.6 };
      const info = await page.evaluate(
        ({ s0, v }) => {
          const k = window.kq!;
          if (k.ctx.era.current !== s0.era) k.setEra(s0.era as never);
          k.ctx.settings.update((d) => (d.cameraMode = 'first'), 'cameraMode');
          // the lantern: lit for the lantern spots, out for the one seen only in the dark
          if ((s0.verb === 'lantern') !== k.ctx.player.stats.lanternLit) k.ctx.events.emit('lantern:request', { lit: s0.verb === 'lantern', refill: true });
          // stand near so the bottle builds, then at the view point
          k.teleport(s0.x + 1, s0.z + 1);
          k.step(3);
          // hanging bottles: the shot shows where they hang
          const s = k.flaschen!.spots().find((x) => x.id === s0.id)!;
          const a = (v.from * Math.PI) / 180;
          const vx = s.x + Math.sin(a) * v.d;
          const vz = s.z - Math.cos(a) * v.d;
          const yaw = (Math.atan2(s.x - vx, -(s.z - vz)) * 180) / Math.PI;
          k.teleport(vx, vz, yaw, 0);
          k.step(4);
          const cam = k.ctx.camera.position;
          const pitch = (Math.atan2(s.y + 0.06 - cam.y, Math.hypot(s.x - cam.x, s.z - cam.z)) * 180) / Math.PI;
          k.teleport(vx, vz, yaw, pitch);
          k.step(4);
          const t = k.flaschen!.spots().find((x) => x.id === s0.id)!;
          const ground = k.ctx.world.heightAt(t.x, t.z);
          return { ...t, ground };
        },
        { s0, v },
      );
      await page.evaluate(() => window.kq!.screenshotReady());
      await page.screenshot({ path: `${SCREENS}/fl-${s0.id.replace(/^fl\./, '')}.png` });
      report.push(`${info.id} ${info.era} built=${info.built} visible=${info.visible} y=${info.y.toFixed(2)} ground=${info.ground.toFixed(2)} hanging=${info.hanging}`);
      expect(info.built, info.id).toBe(true);
      expect(info.visible, info.id).toBe(true);
      expect(Number.isFinite(info.y), info.id).toBe(true);
      // on a surface: never below the ground, never floating more than a ledge / a fork above it
      expect(info.y, info.id).toBeGreaterThan(info.ground - 0.05);
      expect(info.y - info.ground, info.id).toBeLessThan(2.6);
    }
    console.log(report.join('\n'));
    expect(errors).toEqual([]);
  });

  test('one pickup end to end: E, 1/24, toast, Sammlungen row, Regal, saved in the slice', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    const id = 'fl.heute.grenzstein';
    await page.evaluate((id) => {
      const k = window.kq!;
      if (k.ctx.era.current !== 'today') k.setEra('today');
      const s = k.flaschen!.spots().find((x) => x.id === id)!;
      k.teleport(s.x + 1, s.z + 1);
      k.step(3);
      // 1 m south of it, facing north
      k.teleport(s.x, s.z + 1, 0, -30);
      k.step(4);
    }, id);
    expect(await page.evaluate(() => window.kq!.flaschen!.prompt())).toBe(id);
    await expect(page.locator('.kq-prompt.show').getByText('Fläschchen aufheben')).toBeVisible();
    await page.evaluate(() => window.kq!.press('KeyE', 2));
    const st = await page.evaluate(() => window.kq!.flaschen!.state());
    expect(st.found).toEqual([id]);
    expect(st.count).toBe(1);
    await expect(page.getByText('Fläschchen 1/24')).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/fl-pickup-toast.png` });
    // the bottle is gone from the world
    expect((await page.evaluate((id) => window.kq!.flaschen!.spots().find((x) => x.id === id)!.built, id))).toBe(false);
    // saved in the state slice
    const slice = await page.evaluate(() => (window.kq!.state().systems as Record<string, { found?: string[] }>).flaschen);
    expect(slice?.found).toEqual([id]);
    // the Sammlungen row in Pause: counts only
    await openPause(page);
    await page.getByTestId('pause-sets').click();
    const row = page.getByTestId('flaschen-row');
    await expect(row).toBeVisible();
    await expect(row).toContainText('Fläschchen 1/24 · heute 1/6 · 1789 0/6');
    await page.screenshot({ path: `${SCREENS}/fl-sammlungen-row.png` });
    await page.getByTestId('page-sets').getByRole('button', { name: 'Zurück', exact: true }).click();
    await page.getByTestId('resume').click();
    // the shelf (Mauerkante) of the hub at the Quelle shows the one bottle
    await page.evaluate(() => window.kq!.story!.hub(true));
    await page.getByTestId('hub-shelf').click();
    const shelf = page.getByTestId('flaschen-shelf');
    await expect(shelf).toBeVisible();
    await expect(shelf.locator('.kqf-shelf-bottle')).toHaveCount(1);
    await page.screenshot({ path: `${SCREENS}/fl-shelf.png` });
    // all 24 (debug hook): the lantern glass turns Flaschengrün through the player:lantern-tint event
    expect(await page.evaluate(() => window.kq!.avatar!.lanternTint())).toBeNull();
    await page.evaluate(() => {
      const k = window.kq!;
      for (const s of k.flaschen!.spots()) k.flaschen!.pick(s.id);
    });
    expect((await page.evaluate(() => window.kq!.flaschen!.state())).count).toBe(24);
    expect(await page.evaluate(() => window.kq!.avatar!.lanternTint())).toBe(FLASCHENGRUEN);
    expect(errors).toEqual([]);
  });
});
