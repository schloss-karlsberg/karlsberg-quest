import { type Page, expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import type { SkinnedMesh } from 'three';
import { trackErrors } from './helpers/common';

/**
 * The authored MPFB player, the default avatar (src/player/avatar.ts; `?avatar=mpfb` is explicit here): the model loads, its
 * outfit pieces share one skeleton, its fade bounds are measured, and one costume round trip runs
 * through the story's path ('player:costume'): the court pieces dither in, the default ones out,
 * and back. `?avatar=surveyor` falls back to the CC0 surveyor.
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
  test.setTimeout(ciScale(180_000));
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

/** Heights (m) of the head, hips and ankles above the ground under the player, and the playing clip. */
async function bodyPose(page: Page): Promise<{ head: number; hips: number; feet: number[]; clip: string }> {
  return page.evaluate(() => {
    const k = window.kq!;
    const root = k.ctx.scene.getObjectByName('player-avatar')!;
    const y = (name: string) => root.getObjectByName(name)!.matrixWorld.elements[13]! - k.ctx.player.position.y;
    return { head: y('head'), hips: y('pelvis'), feet: [y('foot_l'), y('foot_r')], clip: k.avatar!.state().clip };
  });
}

test('crouched idle keeps the head over the hips and the feet on the ground, in both outfits', async ({ page }) => {
  test.setTimeout(ciScale(180_000));
  const errors = trackErrors(page);
  await page.goto('./?avatar=mpfb&notitle&nosave&fresh&manual');
  await page.waitForFunction(() => window.kq?.avatar !== undefined, null, { timeout: 120_000 });
  await page.evaluate(async () => {
    const k = window.kq!;
    await k.avatar!.ready();
    k.step(30);
  });
  const stand = await bodyPose(page);
  expect(stand.head - stand.hips).toBeGreaterThan(0.5);

  /** Crouch for 150 drawn frames, then let the browser draw frames without game time. */
  const crouch = async () => {
    await page.evaluate(() => {
      const k = window.kq!;
      k.ctx.player.setStance('crouch');
      for (let i = 0; i < 150; i++) k.step(1);
    });
    const stepped = await bodyPose(page);
    await page.evaluate(async () => {
      for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
    });
    return { stepped, held: await bodyPose(page) };
  };
  const check = (p: { head: number; hips: number; feet: number[]; clip: string }) => {
    expect(p.clip).toBe('Idle');
    // lower than standing, the trunk still upright over the hips (the fold put the head at knee height)
    expect(p.hips).toBeLessThan(stand.hips - 0.1);
    expect(p.head).toBeLessThan(stand.head - 0.15);
    expect(p.head - p.hips).toBeGreaterThan((stand.head - stand.hips) * 0.75);
    // knees bent, not the body sunk into the ground
    p.feet.forEach((f, i) => expect(Math.abs(f - stand.feet[i]!)).toBeLessThan(0.05));
  };

  const def = await crouch();
  check(def.stepped);
  check(def.held);
  // one pose: frames without game time (pause, bullet time) must not add the lean again
  expect(Math.abs(def.held.head - def.stepped.head)).toBeLessThan(0.03);

  // the court costume: same skeleton, same pose
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.player.setStance('stand');
    k.avatar!.setCostume('court');
    for (let i = 0; i < 60; i++) k.step(1);
  });
  expect(await page.evaluate(() => window.kq!.avatar!.costume())).toBe('court');
  const court = await crouch();
  check(court.stepped);
  check(court.held);

  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.player.setStance('stand');
    for (let i = 0; i < 90; i++) k.step(1);
  });
  const up = await bodyPose(page);
  expect(Math.abs(up.head - stand.head)).toBeLessThan(0.03);
  expect(Math.abs(up.hips - stand.hips)).toBeLessThan(0.03);
  expect(errors).toEqual([]);
});
