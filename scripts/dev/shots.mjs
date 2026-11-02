// Dev helper: node scripts/dev/shots.mjs <outdir> [baseUrl] — several views in one session.
import { chromium } from 'playwright';
const [outDir, base = 'http://localhost:5280/'] = process.argv.slice(2);
const views = JSON.parse(process.env.VIEWS ?? '[]');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => m.type() !== 'debug' && !m.text().includes('GPU stall') && console.log(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(`${base}?debug&nosave&fresh&manual`);
await page.waitForFunction(() => window.kq !== undefined, null, { timeout: 90000 });
await page.addStyleTag({ content: '.kq-debug{display:none}' });
for (const v of views) {
  await page.evaluate((v) => {
    const k = window.kq;
    k.setEra(v.era ?? 'today');
    const p = k.ctx.player;
    if (v.fly) p.setFlying(true); else p.setFlying(false);
    k.teleport(v.x, v.z, v.yaw ?? 90, v.pitch ?? 0);
    if (v.fly) p.position.y = k.ctx.world.heightAt(v.x, v.z) + v.fly;
    k.setScanMode(v.scan ?? 0);
    k.setMapMix(v.map ?? 0);
    k.step(2);
  }, v);
  await page.evaluate(() => window.kq.screenshotReady());
  await page.screenshot({ path: `${outDir}/${v.name}.png` });
}
await browser.close();
