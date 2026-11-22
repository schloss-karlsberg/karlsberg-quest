import { type Page, expect, test } from '@playwright/test';
import type { SkinnedMesh } from 'three';
import { trackErrors } from './helpers/common';

/**
 * The authored MPFB player behind `?avatar=mpfb` (src/player/avatar.ts): the model loads, its
 * outfit pieces share one skeleton, its fade bounds are measured, and one costume round trip runs
 * through the story's path ('player:costume'): the court pieces dither in, the default ones out,
 * and back. The surveyor stays the default avatar (covered by the combat / camera specs).
 */

/** Visibility of the costume pieces (`avatar-<costume>-<piece>`) under the player avatar. */
async function pieces(page: Page): Promise<{ default: boolean[]; court: boolean[] }> {
  return page.evaluate(() => {
    const out = { default: [] as boolean[], court: [] as boolean[] };
    window.kq!.ctx.scene.getObjectByName('player-avatar')?.traverse((o) => {
      const m = /^avatar-(default|court)-/.exec(o.name);
      if (m && (o as SkinnedMesh).isMesh) out[m[1] as 'default' | 'court'].push(o.visible);
    });
    return out;
  });
}

test('the MPFB avatar loads and swaps into the court costume and back', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackErrors(page);
  await page.goto('./?avatar=mpfb&notitle&nosave&fresh&manual');
  await page.waitForFunction(() => window.kq?.avatar !== undefined, null, { timeout: 120_000 });
  const loaded = await page.evaluate(async () => {
    const k = window.kq!;
    await k.avatar!.ready();
    const w = window as unknown as { costumes: string[] };
    w.costumes = [];
    k.ctx.events.on('player:costume', ({ costume }) => w.costumes.push(costume));
    k.step(5);
    const root = k.ctx.scene.getObjectByName('player-avatar')!;
    const skeletons = new Set<unknown>();
    let skinned = 0;
    root.traverse((o) => {
      const m = o as SkinnedMesh;
      if (m.isSkinnedMesh) {
        skinned++;
        skeletons.add(m.skeleton);
      }
    });
    const s = k.avatar!.state();
    return { model: s.model, visible: root.visible, costume: s.costume, fade: s.fadeBounds, skinned, skeletons: skeletons.size };
  });
  expect(loaded.model).toBe('mpfb');
  expect(loaded.visible).toBe(true);
  expect(loaded.costume).toBe('default');
  // all the body and outfit meshes on one skeleton (one bone update per frame)
  expect(loaded.skinned).toBeGreaterThan(4);
  expect(loaded.skeletons).toBe(1);
  // measured on the model, not the surveyor's defaults (1.45 / 0.45)
  expect(loaded.fade.head).toBeGreaterThan(1.5);
  expect(loaded.fade.head).toBeLessThan(1.65);
  expect(loaded.fade.halfWidth).toBeLessThan(0.45);
  const before = await pieces(page);
  expect(before.court.length).toBeGreaterThan(0);
  expect(before.default.length).toBeGreaterThan(0);
  expect(before.court.every((v) => !v)).toBe(true);
  expect(before.default.every((v) => v)).toBe(true);

  // to court: the dither dip (~0.3 s) runs on drawn frames, one tick each
  const swap = (c: 'court' | 'default') =>
    page.evaluate((costume) => {
      const k = window.kq!;
      k.avatar!.setCostume(costume);
      for (let i = 0; i < 40; i++) k.step(1);
      return k.avatar!.costume();
    }, c);
  expect(await swap('court')).toBe('court');
  const court = await pieces(page);
  expect(court.court.every((v) => v)).toBe(true);
  expect(court.default.every((v) => !v)).toBe(true);

  expect(await swap('default')).toBe('default');
  const back = await pieces(page);
  expect(back.court.every((v) => !v)).toBe(true);
  expect(back.default.every((v) => v)).toBe(true);

  const seen = await page.evaluate(() => (window as unknown as { costumes: string[] }).costumes);
  expect(seen).toEqual(['court', 'default']);
  expect(errors).toEqual([]);
});
