import { expect, test } from '@playwright/test';
import { ciScale, ciViewport, desktopViewport, isCI } from './helpers/ci';

/**
 * Turning the view on the spot must not make the picture lighter or darker (TASK-088). The sweep
 * that measures every yaw on a real GPU is e2e/gpu/turn-luma.gpu.ts; these are its two cheapest
 * cases for the hosted runner:
 *
 * - the haze under the trees is taken where the character stands, not under the lens that circles
 *   them (it swung through the tree cover and the whole picture's haze went with it);
 * - the trees a rebuild of the forest's instance lists leaves out of the picture (every 20° of a
 *   turn) keep casting sun shadows (the ground in view lit up or went dark in one frame: on the
 *   palace plateau a quarter of the frame's brightness).
 */
test.describe('turning: light', () => {
  test.use({ viewport: desktopViewport });

  test('the haze under the trees stays as it is while the view turns (forest edge, Niedrig)', async ({ page }) => {
    // on the path north of the car park: the forest's edge runs through the lens's circle
    await page.goto('./?notitle&nosave&fresh&manual&x=524&z=-688');
    await page.waitForFunction(() => window.kq?.ctx);
    const r = await page.evaluate(() => {
      const k = window.kq!;
      const ctx = k.ctx;
      const haze = ctx.world.forest.material.uniforms.uUnderCanopy as { value: number };
      k.teleport(524, -688, 0, -8);
      const byYaw: number[] = [];
      const underLens: number[] = [];
      for (let yaw = 0; yaw < 360; yaw += 45) {
        ctx.player.yaw = (-yaw * Math.PI) / 180;
        // five seconds without drawing: the haze eases in over about one
        for (let i = 0; i < 300; i++) ctx.loop.step(1, false);
        byYaw.push(haze.value);
        underLens.push(ctx.world.coverAt(ctx.camera.position.x, ctx.camera.position.z));
      }
      return { third: ctx.player.thirdPerson, byYaw, underLens };
    });
    console.log(`[turn-light] haze by yaw ${JSON.stringify(r.byYaw.map((v) => +v.toFixed(3)))}, cover under the lens ${JSON.stringify(r.underLens.map((v) => +v.toFixed(2)))}`);
    expect(r.third).toBe(true);
    // the spot is one where the lens does cross the edge …
    expect(Math.max(...r.underLens) - Math.min(...r.underLens)).toBeGreaterThan(0.5);
    // … and the haze does not follow it
    expect(Math.max(...r.byYaw) - Math.min(...r.byYaw)).toBeLessThan(0.005);
  });

  test('a rebuild of the tree lists leaves the sun shadows in view as they were (plateau, Mittel)', async ({ page }) => {
    test.setTimeout(ciScale(240_000));
    // Mittel draws a shadow pass: slow on a hosted SwiftShader runner. `&idle` draws only the
    // frames asked for, at the hosted viewport.
    if (isCI) await page.setViewportSize(ciViewport);
    // the palace plateau: open ground, the low afternoon sun behind the trees to the south-west
    await page.goto('./?notitle&nosave&fresh&manual&idle&q=medium&x=1216&z=-1114');
    await page.waitForFunction(() => window.kq?.ctx);
    await page.waitForFunction(() => window.kq!.ctx.world.forest.usesModels, null, { timeout: ciScale(120_000) });
    const r = await page.evaluate(async () => {
      const k = window.kq!;
      const ctx = k.ctx;
      const gl = ctx.renderer.getContext();
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const buf = new Uint8Array(w * h * 4);
      /** Draw one frame; its mean display luminance (0..255). */
      const frame = () => {
        k.step(1, { draw: true });
        ctx.renderer.setRenderTarget(null);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let s = 0;
        for (let o = 0; o < buf.length; o += 4) s += 0.2126 * buf[o]! + 0.7152 * buf[o + 1]! + 0.0722 * buf[o + 2]!;
        return s / (w * h);
      };
      const face = (deg: number) => (ctx.player.yaw = (-deg * Math.PI) / 180);
      /** Lists built for 112°, the view turned on by 18° (no rebuild yet), then the rebuild at that yaw. */
      const turn = () => {
        face(112);
        ctx.world.forest.invalidate();
        k.step(1, { draw: true });
        face(130);
        // the camera comes to rest without drawing
        for (let i = 0; i < 60; i++) ctx.loop.step(1, false);
        const turned = frame();
        ctx.world.forest.invalidate();
        const rebuilt = frame();
        return { turned, rebuilt };
      };
      k.teleport(1216, -1114, 112, -8);
      k.step(2, { draw: true });
      await k.screenshotReady();
      const fixed = turn();
      // the control, as it was before the fix: trees out of view do not cast
      ctx.world.forest.casting = () => false;
      const before = turn();
      return { level: ctx.quality.level, shadows: ctx.world.shadows.enabled, fixed, before };
    });
    console.log(`[turn-light] ${JSON.stringify(r)}`);
    expect(r).toMatchObject({ level: 'medium', shadows: true });
    // the control: without the out-of-view casters this turn is one that jumps
    expect(Math.abs(r.before.rebuilt - r.before.turned)).toBeGreaterThan(5);
    // … and with them the rebuild leaves the picture as it was
    expect(Math.abs(r.fixed.rebuilt - r.fixed.turned)).toBeLessThan(1);
  });
});
