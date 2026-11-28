import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { trackErrors } from '../helpers/common';
import { toWorld } from '../../src/systems/quelle/layout';

/** TASK-087: the Karlsbergquelle on the real GPU, from the tour path and up close. */
const LABEL = process.env.QUELLE_LABEL ?? 'after';
const OUT = `test-results/contribute/TASK-087/${LABEL}`;
const CAM = process.env.QUELLE_CAM ?? 'third';
const GRAPHICS = (process.env.QUELLE_Q ?? 'high') as 'low' | 'medium' | 'high';

/** Stand at local (u, w), looking at local (tu, tw). */
const local = (u: number, w: number, tu: number, tw: number, pitch = -8) => {
  const [x, z] = toWorld(u, w);
  const [tx, tz] = toWorld(tu, tw);
  return { x, z, yaw: (Math.atan2(tx - x, -(tz - z)) * 180) / Math.PI, pitch };
};

const VIEWS = [
  { id: '01-path-far', era: 'today', ...local(22, 11.6, 0, 2) },
  { id: '02-path-mid', era: 'today', ...local(10.5, 7.8, 0, 1.5) },
  { id: '03-forecourt', era: 'today', ...local(0.4, 5.6, 0.2, 0, -12) },
  { id: '04-trough', era: 'today', ...local(0.1, 3.0, 0.1, 0, -22) },
  { id: '05-from-hairpin', era: 'today', ...local(-7.5, 3.1, 0, 1, -10) },
  { id: '06-from-upper-leg', era: 'today', ...local(-2.5, -5.6, 0.5, 1, -28) },
  { id: '07-1789', era: '1789', ...local(0.4, 5.6, 0.2, 0, -12) },
  { id: '08-1789-path', era: '1789', ...local(10.5, 7.8, 0, 1.5) },
  { id: '09-1793-02', era: '1793-02', ...local(1.5, 5.2, 0.2, 0, -12) },
  { id: '10-1796', era: '1796', ...local(-1, 5.4, 0.2, 0, -12) },
] as const;

test.describe.configure({ timeout: 300_000 });

test(`Karlsbergquelle views (${GRAPHICS})`, async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`./?notitle&nosave&fresh&manual&q=${GRAPHICS}&cam=${CAM}`);
  await page.waitForFunction(() => window.kq?.ctx.input.enabled && !window.kq.ctx.loop.paused, null, { timeout: 120_000 });
  await page.addStyleTag({ content: '.kq-bullet-time,.kq-click-to-play{display:none!important}' });
  await page.evaluate(async () => {
    await window.kq!.avatar?.ready();
    await window.kq!.screenshotReady();
  });
  mkdirSync(OUT, { recursive: true });
  const results = [];
  for (const view of VIEWS) {
    await page.evaluate(({ era, x, z, yaw, pitch }) => {
      const k = window.kq!;
      k.setEra(era);
      k.teleport(x, z, yaw, pitch);
      k.step(4);
    }, view);
    await page.waitForFunction(() => window.kq!.scenery!.built().includes('karlsbergquelle') && window.kq!.quelle!.info().visible, null, { timeout: 60_000 });
    await page.waitForTimeout(1500);
    const result = await page.evaluate(async () => {
      const k = window.kq!;
      k.step(2);
      await k.screenshotReady();
      const { calls, triangles } = k.ctx.renderer.info.render;
      const p = k.ctx.player.position;
      return { calls, triangles, built: k.scenery!.built(), quelle: k.quelle!.info(), player: { x: p.x, y: p.y, z: p.z }, gpu: k.ctx.quality.level };
    });
    await page.screenshot({ path: `${OUT}/${GRAPHICS}-${CAM === "third" ? "" : "fp-"}${view.id}.png` });
    results.push({ ...view, ...result });
  }
  writeFileSync(`${OUT}/${GRAPHICS}-views.json`, JSON.stringify(results, null, 2));
  expect(errors).toEqual([]);
});

test(`tour arrival at the Quelle (${GRAPHICS})`, async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`./?notitle&nosave&fresh&manual&q=${GRAPHICS}&cam=${CAM}`);
  await page.waitForFunction(() => window.kq?.ctx.input.enabled && !window.kq.ctx.loop.paused, null, { timeout: 120_000 });
  await page.addStyleTag({ content: '.kq-bullet-time,.kq-click-to-play{display:none!important}' });
  await page.evaluate(async () => {
    const k = window.kq!;
    await k.avatar?.ready();
    k.story!.goto('tour', 't14');
    k.teleport(897.2, -845.3, 100, -6);
    k.step(30);
  });
  mkdirSync(OUT, { recursive: true });
  const beat = () => page.evaluate(() => window.kq!.story!.state().beat as string);
  let n = 0;
  const shoot = async (name: string) => {
    await page.waitForTimeout(600);
    await page.evaluate(async () => {
      window.kq!.step(1);
      await window.kq!.screenshotReady();
    });
    await page.screenshot({ path: `${OUT}/${GRAPHICS}-tour-${String(++n).padStart(2, '0')}-${name}.png` });
  };
  const log: unknown[] = [];
  for (let s = 0; s < 240 && (await beat()) === 't14'; s++) {
    const g = await page.evaluate(() => {
      const k = window.kq!;
      const g = k.walk!.list().find((w) => w.npc === 'imhoff');
      if (g) {
        const fx = -Math.sin(g.yaw);
        const fz = -Math.cos(g.yaw);
        const p = k.ctx.player.position;
        if (Math.hypot(p.x - g.x, p.z - g.z) > 9) k.teleport(g.x - fx * 7, g.z - fz * 7, (-g.yaw * 180) / Math.PI, -6);
      }
      k.story!.finishTyping();
      k.step(60);
      return g ? { x: g.x, z: g.z } : null;
    });
    if (g && g.x > 1020 && s % 4 === 0) {
      log.push(g);
      await shoot('walk');
    }
  }
  expect(await beat()).toBe('t15');
  // the whole group in its slots, seen as the player arrives behind it on the trail
  const arrive = local(9.5, 7.2, 0.5, 2.2, -7);
  await page.evaluate(({ x, z, yaw, pitch }) => {
    const k = window.kq!;
    k.walk!.snap('fuehrung', 'quelle');
    k.teleport(x, z, yaw, pitch);
    k.step(120);
  }, arrive);
  await shoot('t15');
  log.push(await page.evaluate(() => ({ npcs: window.kq!.walk!.list().map((w) => ({ npc: w.npc, x: w.x, z: w.z })), player: window.kq!.ctx.player.position })));
  for (let i = 0; i < 90 && (await beat()) === 't15'; i++) await page.evaluate(() => (window.kq!.story!.finishTyping(), window.kq!.step(60)));
  await shoot('t16');
  // the find: the prompt beside the trough, the back to the water
  const beside = local(1.9, 2.6, 6, 6, -6);
  const find = await page.evaluate(({ x, z, yaw, pitch }) => {
    const k = window.kq!;
    k.teleport(x, z, yaw, pitch);
    for (let i = 0; i < 14 && !k.quelle!.info().find; i++) k.step(60);
    return { find: k.quelle!.info().find, prompt: k.ctx.ui.hud.promptShown(), beat: k.story!.state().beat };
  }, beside);
  log.push(find);
  await shoot('t16-find');
  writeFileSync(`${OUT}/${GRAPHICS}-tour.json`, JSON.stringify(log, null, 2));
  expect(errors).toEqual([]);
});

test(`title backdrop (${GRAPHICS})`, async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`./?nosave&fresh&q=${GRAPHICS}&cam=third&x=1059.3&z=-833.1`);
  await expect(page.getByTestId('title-new')).toBeEnabled({ timeout: 120_000 });
  await page.waitForTimeout(4000);
  mkdirSync(OUT, { recursive: true });
  const info = await page.evaluate(() => {
    const k = window.kq!;
    const p = k.ctx.player.position;
    return { x: p.x, z: p.z, yaw: k.ctx.player.yaw, built: k.scenery?.built() ?? null, quelle: k.quelle?.info() ?? null };
  });
  writeFileSync(`${OUT}/${GRAPHICS}-title.json`, JSON.stringify(info, null, 2));
  await page.screenshot({ path: `${OUT}/${GRAPHICS}-title.png` });
  expect(errors).toEqual([]);
});
