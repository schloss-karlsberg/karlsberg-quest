// Dev helper: VIEWS='[...]' node scripts/dev/look.mjs <outdir> [baseUrl]
// Like shots.mjs, plus per view: `js` (code run in the page before the shot, `k` = window.kq),
// `steps` (fixed steps after teleport), `fly` (metres above ground), `wait` (ms real time).
import { chromium } from 'playwright';
const [outDir, base = 'http://127.0.0.1:5602/'] = process.argv.slice(2);
const views = JSON.parse(process.env.VIEWS ?? '[]');
const query = process.env.QUERY ?? '?debug&nosave&fresh&manual';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => m.type() !== 'debug' && !m.text().includes('GPU stall') && console.log(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(`${base}${query}`);
await page.waitForFunction(() => window.kq !== undefined && window.kq.ctx, null, { timeout: 120000 });
await page.addStyleTag({ content: '.kq-debug{display:none}' });
for (const v of views) {
  const out = await page.evaluate(async (v) => {
    const k = window.kq;
    if (v.era) k.setEra(v.era);
    const p = k.ctx.player;
    p.setFlying(!!v.fly);
    if (v.x !== undefined) k.teleport(v.x, v.z, v.yaw ?? 90, v.pitch ?? 0);
    if (v.fly) p.position.y = k.ctx.world.heightAt(v.x, v.z) + v.fly;
    k.step(v.steps ?? 2);
    let r = null;
    if (v.js) r = await new Function('k', `return (async () => { ${v.js} })()`)(k);
    return r;
  }, v);
  if (out !== null && out !== undefined) console.log(v.name, JSON.stringify(out));
  if (v.wait) await page.waitForTimeout(v.wait);
  await page.evaluate(() => window.kq.screenshotReady());
  await page.screenshot({ path: `${outDir}/${v.name}.png` });
}
await browser.close();
