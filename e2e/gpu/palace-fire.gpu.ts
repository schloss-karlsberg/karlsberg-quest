import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

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
const scenes = [
  'today-forest', '1789-ehrenhof', '1789-festsaal', '1789-palace-front', '1789-palace-plateau',
  '1793-07-festsaal-fire', '1793-07-fire-outside',
];

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
      await page.goto(`./?notitle&nosave&fresh&manual&cam=third&q=${graphics}`);
      await page.waitForFunction(() => window.kq?.interiors?.state().ready, null, { timeout: 120_000 });
      await page.addStyleTag({ content: '.kq-bullet-time,.kq-click-to-play,[data-testid="dialogue"]{display:none!important}' });
      const result = await page.evaluate(async ({ graphics, phone, scenes }) => {
        const k = window.kq!;
        k.ctx.settings.update((s) => {
          s.graphics = graphics;
          s.fov = 80;
          s.cameraZoom = 3.6;
          s.fpsCap = 0;
          s.powerSave = false;
          s.reducedMotion = phone;
        }, 'graphics');
        await k.avatar?.ready();
        await k.screenshotReady();
        const bench = await k.bench({ only: scenes, frames: 240, warmup: 90, warmupSeconds: 8, log: false });
        return { ...bench, touch: k.ctx.input.touchMode };
      }, { graphics, phone, scenes });
      mkdirSync(out, { recursive: true });
      writeFileSync(`${out}/${graphics}.json`, JSON.stringify(result, null, 2));
      expect(result.renderer).toMatch(/metal/i);
      expect(result.renderer).not.toMatch(/swiftshader|software/i);
      expect(result).toMatchObject({ quality: graphics, pixelRatio: 1, size: phone ? [667, 375] : [1440, 900], touch: phone });
      expect(result.scenes.map((s) => s.id).sort()).toEqual([...scenes].sort());

      for (const era of ['1789', '1793-07'] as const) {
        await page.evaluate(async (era) => {
          const k = window.kq!;
          k.setEra(era);
          k.step(1);
          if (!k.interiors!.enter('B01.2.og-festsaal', { u: 0.1, v: 0.5, toU: 1, toV: 0.5, pitch: 6 })) {
            throw new Error('Could not enter the Festsaal');
          }
          if (era === '1793-07') {
            k.fx!.fire(true, { seconds: 300 });
            k.fx!.fireTime(120);
            k.interiors!.fire('B01.2.og-festsaal', 'burning');
            for (const room of k.interiors!.list()) {
              if (room.building === 'KB-B01' && room.storey === 2 && room.roomId !== 'B01.2.og-festsaal') k.interiors!.fire(room.id, 'smoke');
            }
            // Stabilize the eased room fire and smoke before the still.
            const until = performance.now() + 8000;
            while (performance.now() < until) await new Promise<void>((done) => requestAnimationFrame(() => done()));
          }
          await k.screenshotReady();
        }, era);
        await page.screenshot({ path: `${out}/${graphics}-${era}-festsaal.png` });
        await page.evaluate(async (era) => {
          const k = window.kq!;
          if (era === '1789') k.teleport(1184, -1126, 90, -6);
          else k.teleport(1125, -1120, 90, 3);
          k.step(3);
          await k.screenshotReady();
        }, era);
        await page.screenshot({ path: `${out}/${graphics}-${era}-outside.png` });
      }
      expect(errors).toEqual([]);
    });
  });
}
