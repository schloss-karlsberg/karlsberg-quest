import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Match PERFORMANCE §3.1a. The phone profile exercises the Niedrig rendering path with touch.
test.use({
  headless: false,
  launchOptions: {
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
  },
});
test.setTimeout(300_000);

const label = process.env.PERF_LABEL ?? 'after';
const out = `test-results/palace-fire-gpu/${label}`;
const palaceScenes = ['today-forest', '1789-ehrenhof', '1789-festsaal', '1789-palace-front', '1789-palace-plateau'];
const fireScenes = ['1793-07-festsaal-fire', '1793-07-fire-outside'];
const frames = 240;

type Graphics = 'high' | 'medium' | 'low';

async function prepare(page: Page, graphics: Graphics, still = false) {
  await page.goto(`./?notitle&nosave&fresh&manual&cam=third&q=${graphics}${still ? '&holdvisuals' : ''}`);
  await page.waitForFunction(() => window.kq?.fx && window.kq.interiors?.state().ready, null, { timeout: 120_000 });
  await page.addStyleTag({ content: '.kq-bullet-time,.kq-click-to-play,.kq-subtitles,[data-testid="dialogue"]{display:none!important}' });
  await page.evaluate(async (graphics) => {
    const k = window.kq!;
    k.ctx.settings.update((s) => {
      s.graphics = graphics;
      s.fov = 80;
      s.cameraZoom = 3.6;
      s.fpsCap = 0;
      s.powerSave = false;
      s.reducedMotion = graphics === 'low';
    }, 'graphics');
    await k.avatar?.ready();
    await k.screenshotReady();
  }, graphics);
}

for (const graphics of ['high', 'medium', 'low'] as const) {
  const phone = graphics === 'low';
  test.describe(graphics, () => {
    test.use(phone
      ? { viewport: { width: 667, height: 375 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, reducedMotion: 'reduce' }
      : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

    test('records palace and Festsaal performance and look', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !/GPU stall|pointer ?lock|AudioContext was not allowed/i.test(msg.text())) errors.push(msg.text());
      });
      await prepare(page, graphics);
      const result = await page.evaluate(async ({ palaceScenes, fireScenes, frames }) => {
        const k = window.kq!;
        const opts = { frames, warmup: 90, warmupSeconds: 8, log: false };
        const bench = await k.bench({ ...opts, only: palaceScenes });
        const fixed = [];
        const advancing = [];
        // Each call restores the starting era. Both modes stage each fire scene independently.
        for (const id of fireScenes) {
          fixed.push(...(await k.bench({ ...opts, only: [id], fireClock: 'fixed' })).scenes);
          advancing.push(...(await k.bench({ ...opts, only: [id], fireClock: 'advancing' })).scenes);
        }
        return { ...bench, scenes: [...bench.scenes, ...fixed], advancing, touch: k.ctx.input.touchMode };
      }, { palaceScenes, fireScenes, frames });
      mkdirSync(out, { recursive: true });
      writeFileSync(`${out}/${graphics}.json`, JSON.stringify(result, null, 2));
      expect(result.renderer).toMatch(/metal/i);
      expect(result.renderer).not.toMatch(/swiftshader|software/i);
      expect(result).toMatchObject({ quality: graphics, pixelRatio: 1, size: phone ? [667, 375] : [1440, 900], touch: phone });
      expect(result.scenes.map((s) => s.id).sort()).toEqual([...palaceScenes, ...fireScenes].sort());
      expect(result.advancing.map((s) => s.id)).toEqual(fireScenes);
      for (const scene of [...result.scenes, ...result.advancing]) {
        expect(scene.frames, scene.id).toBe(frames);
        expect(scene.frameMs.n, scene.id).toBe(frames - 1);
      }
      for (const scene of result.scenes.filter((s) => fireScenes.includes(s.id))) {
        expect(scene.fireClock, scene.id).toEqual({ start: 120, end: 120 });
      }
      for (const scene of result.advancing) {
        expect(scene.fireClock, scene.id).toEqual({ start: 120, end: 124 });
      }

      for (const era of ['1789', '1793-07'] as const) {
        for (const view of ['festsaal', 'outside'] as const) {
          // A fresh document starts visual time at zero. Its rAF renders have zero delta.
          await prepare(page, graphics, true);
          await page.evaluate(async ({ era, view }) => {
            const k = window.kq!;
            const loop = k.ctx.loop;
            const hall = 'B01.2.og-festsaal';
            k.setEra(era);
            if (view === 'festsaal') {
              if (!k.interiors!.enter(hall, { u: 0.1, v: 0.5, toU: 1, toV: 0.5, pitch: 6 })) throw new Error('Could not enter the Festsaal');
            } else if (era === '1789') {
              k.teleport(1184, -1126, 90, -6);
            } else {
              k.teleport(1125, -1120, 90, 3);
            }
            loop.advance(3);
            const inside = k.interiors!.room();
            if (view === 'festsaal' ? inside?.roomId !== hall : inside?.building === 'KB-B01') throw new Error(`Unexpected room for ${era} ${view}`);
            if (era === '1793-07') {
              k.fx!.fire(true, { seconds: 300, clock: 120 });
              if (view === 'festsaal') {
                k.interiors!.fire(hall, 'burning');
                for (const room of k.interiors!.list()) {
                  if (room.building === 'KB-B01' && room.storey === 2 && room.roomId !== hall) k.interiors!.fire(room.id, 'smoke');
                }
              }
            }
            // Ease the room fire, smoke and camera over eight visual seconds.
            for (let i = 0; i < 80; i++) loop.renderOnce(0.1);
            await k.screenshotReady();
            loop.stop();
          }, { era, view });
          await page.screenshot({ path: `${out}/${graphics}-${era}-${view}.png` });
        }
      }
      if (graphics === 'high' && label !== 'before') {
        expect(result.renderer).toMatch(/Apple M5 Pro/i);
        for (const scene of [...result.scenes, ...result.advancing]) {
          if (scene.id === 'today-forest') continue;
          const firing = scene.fireClock ? `, fire ${scene.fireClock.start}–${scene.fireClock.end} s` : '';
          expect.soft(scene.withinFrameTarget, `${scene.id}${firing} p95 ${scene.frameMs.p95.toFixed(2)} ms (target ${result.budget.frameMs} ms)`).toBe(true);
        }
      }
      expect(errors).toEqual([]);
    });
  });
}
