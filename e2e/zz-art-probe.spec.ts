import { expect, test } from '@playwright/test';
import { ciViewport, desktopViewport } from './helpers/ci';

// TEMPORARY hosted timing probe for the ?q=high art test (removed again before review): the old
// and the new flow alternate on the same runner. Each test fails on purpose so the GitHub reporter
// prints its phase timings.
test.use({ viewport: desktopViewport });

type Flow = 'old' | 'new';

async function run(page: import('@playwright/test').Page, flow: Flow): Promise<string> {
  const t0 = Date.now();
  const marks: string[] = [];
  const mark = (l: string) => marks.push(`${l}=${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (flow === 'new') await page.setViewportSize(ciViewport);
  const url = flow === 'old'
    ? './?notitle&nosave&fresh&manual&q=high&x=790&z=-905&yaw=60'
    : './?notitle&nosave&fresh&manual&idle&q=high&x=790&z=-905&yaw=-60';
  await page.goto(url);
  await page.waitForFunction(() => window.kq?.ctx);
  mark('ctx');
  if (flow === 'old') {
    await page.evaluate(() => window.kq!.screenshotReady());
    mark('ready1');
  }
  const s = await page.evaluate(async () => {
    const k = window.kq!;
    await k.spawnAsset('nature.stump.01', 794, -907);
    await k.screenshotReady();
    return { level: k.ctx.quality.level, drawn: k.ctx.loop.drawn };
  });
  mark('eval');
  await page.screenshot({ path: `test-results/probe-${flow}.png` });
  mark('shot');
  return `${flow} ${s.level} drawn=${s.drawn} ${marks.join(' ')}`;
}

for (const [i, flow] of (['new', 'old', 'new', 'old'] as Flow[]).entries()) {
  test(`probe ${i + 1}: ${flow} flow`, async ({ page }) => {
    test.setTimeout(900_000);
    const line = await run(page, flow);
    expect(`PROBE ${line}`).toBe('probe (fails on purpose)');
  });
}
