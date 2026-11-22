import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

/**
 * Real-GPU screenshots of finding the group (src/systems/walk/find.ts) for the owner: the guide on
 * the compass while far from the group (facing it, and facing away: the mark waits at the edge),
 * the „Zur Gruppe“ offer, and the player behind the group after the hold.
 * Out: test-results/gpu/find-*.png.
 */
const OUT = 'test-results/gpu';
mkdirSync(OUT, { recursive: true });
test.describe.configure({ timeout: 300_000 });

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${OUT}/find-${name}.png` });
}

/** The player `d` m from the guide on the side away from the group; facing him (off 0) or turned by `off` deg. */
async function away(page: Page, d: number, off = 0): Promise<void> {
  await page.evaluate(
    ({ dd, o }) => {
      const k = window.kq!;
      const g = k.walk!.list().find((n) => n.npc === 'imhoff')!;
      const p = k.ctx.player.position;
      const l = Math.hypot(p.x - g.x, p.z - g.z) || 1;
      const x = g.x + ((p.x - g.x) / l) * dd;
      const z = g.z + ((p.z - g.z) / l) * dd;
      k.teleport(x, z, (Math.atan2(g.x - x, -(g.z - z)) * 180) / Math.PI + o, -4);
    },
    { dd: d, o: off },
  );
}

test('gpu: finding the group — compass marker, „Zur Gruppe“, back behind the group', async ({ page }) => {
  await page.goto('./?notitle&nosave&fresh&manual&x=524&z=-764');
  await page.waitForFunction(() => !!window.kq?.walk, null, { timeout: 180_000 });
  // the ?manual chip sits where the compass label goes; a player never sees it
  await page.addStyleTag({ content: '.kq-bullet-time { display: none !important; }' });
  await page.evaluate(() => {
    const k = window.kq!;
    k.walk!.demo({ to: 'einstieg' });
    k.teleport(524, -768, 0, 0);
  });
  // the group walks off, the guide waits on the leash
  for (let s = 0; s < 40; s++) await page.evaluate(() => window.kq!.step(60));
  await away(page, 55, 25);
  await page.evaluate(() => window.kq!.step(30));
  expect(await page.evaluate(() => window.kq!.walk!.find().marker)).toBe(true);
  await shot(page, '1-kompass-gruppe');
  await away(page, 55, 160);
  await page.evaluate(() => window.kq!.step(10));
  await shot(page, '2-kompass-rand');
  for (let s = 0; s < 70 && !(await page.evaluate(() => window.kq!.walk!.find().prompt)); s++) await page.evaluate(() => window.kq!.step(60));
  await away(page, 55, 25);
  await page.evaluate(() => window.kq!.step(5));
  expect(await page.evaluate(() => window.kq!.walk!.find().prompt)).toBe(true);
  // the prompt fades in on CSS time (real time): let it land
  await page.waitForTimeout(800);
  await shot(page, '3-zur-gruppe');
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.input.simulate('KeyQ', true);
    k.step(90);
    k.ctx.input.simulate('KeyQ', false);
    k.step(120);
  });
  await page.waitForTimeout(1200);
  await shot(page, '4-hinter-der-gruppe');
  expect(await page.evaluate(() => window.kq!.walk!.find().prompt)).toBe(false);
});
