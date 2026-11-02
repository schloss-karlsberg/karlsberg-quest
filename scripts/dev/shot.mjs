// Dev helper: node scripts/dev/shot.mjs <url> <out.png> [js to eval before shot]
import { chromium } from 'playwright';
const [url, out, js] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => window.kq !== undefined, null, { timeout: 90000 });
if (js) await page.evaluate(js);
await page.evaluate(() => window.kq.screenshotReady());
await page.screenshot({ path: out });
console.log(logs.join('\n'));
await browser.close();
