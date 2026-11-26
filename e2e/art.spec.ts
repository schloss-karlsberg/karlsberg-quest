import { expect, test } from '@playwright/test';
import { SCREENS } from './helpers/common';

/**
 * Art foundation (docs/ART-DIRECTION.md): quality tiers (SwiftShader → low, ?q=high), sun
 * shadows and post features per tier, the CC0 asset loader and the „Lizenzen & Quellen“ list.
 * Look is judged on a real GPU (headed Chromium); here only the wiring is checked.
 */
test.describe('art foundation', () => {
  test('SwiftShader starts on the low tier: no shadows, no bloom / AO', async ({ page }) => {
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq?.ctx);
    await page.evaluate(() => window.kq!.screenshotReady());
    const s = await page.evaluate(() => {
      const c = window.kq!.ctx;
      return { level: c.quality.level, shadows: c.world.shadows.enabled, bloom: c.post.features.bloom, ao: c.post.features.ao };
    });
    expect(s).toEqual({ level: 'low', shadows: false, bloom: false, ao: false });
  });

  test('?q=high: sun shadows render, bloom and AO on; a CC0 model loads and is lit by the world', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && /shader|program|webgl/i.test(m.text())) errors.push(m.text());
    });
    await page.goto('./?notitle&nosave&fresh&manual&q=high&x=790&z=-905&yaw=60');
    await page.waitForFunction(() => window.kq?.ctx);
    await page.evaluate(() => window.kq!.screenshotReady());
    const s = await page.evaluate(async () => {
      const k = window.kq!;
      const c = k.ctx;
      const id = await k.spawnAsset('nature.stump.01', 794, -907);
      await k.screenshotReady();
      const o = c.scene.getObjectByProperty('uuid', id);
      let patched = 0;
      o?.traverse((m) => {
        const mat = (m as unknown as { material?: { userData?: { kqStandard?: boolean } } }).material;
        if (mat?.userData?.kqStandard) patched++;
      });
      const sp = (c.world as unknown as { shadows: unknown }).shadows as { enabled: boolean };
      return {
        level: c.quality.level,
        shadows: sp.enabled,
        bloom: c.post.features.bloom,
        ao: c.post.features.ao,
        patched,
        loaded: c.assets.peek('nature.stump.01') !== null,
      };
    });
    expect(s).toMatchObject({ level: 'high', shadows: true, bloom: true, ao: true, loaded: true });
    expect(s.patched).toBeGreaterThan(0);
    await page.screenshot({ path: `${SCREENS}/art-high-stump.png` });
    expect(errors).toEqual([]);
  });

  test('„Lizenzen & Quellen“ lists the CC0 art assets from LICENSES.json', async ({ page }) => {
    await page.goto('./?nosave&fresh');
    await page.getByRole('button', { name: 'Lizenzen & Quellen' }).click();
    const list = page.getByTestId('asset-licences');
    await expect(list).toBeVisible();
    await expect(list).toContainText('Tree Stump 01');
    await expect(list).toContainText('CC0-1.0');
    await expect(list).toContainText('Bänke und Sandstein am Schlossplateau (FIKTION): Karlsberg Quest — CC0-1.0');
    await expect(list).toContainText('Herbststräucher und trockene Blütenstände (FIKTION): Karlsberg Quest — CC0-1.0');
    await expect(list.locator('a').first()).toHaveAttribute('href', /^https:\/\/polyhaven\.com\//);
    const voiceSummary = page.getByTestId('voice-licences-summary');
    await expect(voiceSummary).toContainText('Stimmen von Quirin Laub, Marlene, Gerold Imhoff, Herr Soll, Jost Fendel und Mats: synthetisch, lokal erzeugt mit MOSS-TTS-v1.5 (Apache-2.0); Ausgabe CC0. Keine echte Person, keine nachgeahmte Stimme.');
    await expect(voiceSummary).toContainText('Die Stimme von Jan Eric Rippel wird mit Erlaubnis des Sprechers verwendet, ist nicht unter CC0 lizenziert und darf außerhalb von Karlsberg Quest nicht weiterverwendet werden.');
    await expect(page.getByTestId('voice-licences')).toContainText('Seed 102, Referenz 537c2310');
  });
});
