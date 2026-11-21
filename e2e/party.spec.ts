import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { trackErrors } from './helpers/common';

/**
 * The end-of-game party (src/systems/party, bible 06 §8): `?party=burn` boots onto today's plateau
 * at dusk, the party stands (16 people, the dogs, the set), the credits roll (strip + a camera way
 * round the party with a spotlight per double), a key skips (credits:done {skipped: true}), then
 * the player walks and the guide is talkable. `?party=keep`: the dogs lie at the player's feet.
 * Screenshots: test-results/party/party-*.png.
 */
const OUT = 'test-results/party';
mkdirSync(OUT, { recursive: true });
test.describe.configure({ timeout: 300_000 });

type Rec = { n: string; p: any }[];
const REC = /^(party:|credits:|cinematic:)/;

async function boot(page: Page, variant: string): Promise<void> {
  // record from the very start: the dev entry emits party:ready right after game:start
  await page.addInitScript((src) => {
    const re = new RegExp(src);
    const w = window as unknown as { rec: Rec; kq?: { ctx?: { events: { onAny(fn: (n: string, p: unknown) => void): void } } } };
    w.rec = [];
    const t = setInterval(() => {
      const ev = w.kq?.ctx?.events;
      if (!ev) return;
      clearInterval(t);
      ev.onAny((n, p) => {
        if (re.test(n)) w.rec.push({ n, p: JSON.parse(JSON.stringify(p ?? null)) });
      });
    }, 2);
  }, REC.source);
  await page.goto(`./?notitle&nosave&fresh&manual&party=${variant}`);
  await page.waitForFunction(() => window.kq?.party?.state().variant != null && !!window.kq?.cinematic, null, { timeout: 180_000 });
  await closeModals(page);
}

async function closeModals(page: Page): Promise<void> {
  await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
}

const events = (page: Page, name: string): Promise<any[]> => page.evaluate((n) => (window as unknown as { rec: Rec }).rec.filter((e) => e.n === n).map((e) => e.p), name);
const step = (page: Page, n: number) => page.evaluate((k) => window.kq!.step(k), n);

async function shot(page: Page, name: string): Promise<string> {
  await page.evaluate(() => window.kq!.screenshotReady());
  const path = `${OUT}/party-${name}.png`;
  await page.screenshot({ path });
  return path;
}

/** Wait for the people's meshes (the handles are invisible until their GLB is in). */
async function bodiesIn(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const people = window.kq!.ctx.people!;
    await Promise.all(people.list().map((p) => p.ready));
  });
}

test('party (a): ?party=burn — ready, bodies, credits, spotlights, skip, then walk and talk to the guide', async ({ page }) => {
  const errors = trackErrors(page);
  const t0 = Date.now();
  await boot(page, 'burn');
  expect(await events(page, 'party:ready')).toEqual([{ variant: 'burn' }]);
  await bodiesIn(page);
  const st = await page.evaluate(() => window.kq!.party!.state());
  expect(st.people).toHaveLength(16);
  expect(st.dogs).toEqual(['diane', 'bijou']);
  expect(st.credits).toBe('playing');
  const stats = await page.evaluate(() => window.kq!.party!.stats());
  console.log(`[party a] stats ${JSON.stringify(stats)}`);
  expect(stats.bodies).toBe(16);
  expect(stats.setDrawCalls).toBe(2);
  // the bodies stand in the clearing and are drawn
  const vis = await page.evaluate(() => window.kq!.ctx.people!.list().filter((p) => p.root.visible).length);
  expect(vis).toBeGreaterThanOrEqual(16);
  const [start] = await events(page, 'credits:start');
  expect(start.seconds).toBeGreaterThan(20);
  expect(await page.evaluate(() => window.kq!.cinematic!.playing())).toBe('party-credits');
  // the opening of the camera way: wide over the party, the strip along the bottom
  await step(page, 50);
  const shots = [await shot(page, 'wide')];
  expect(await page.locator('[data-testid="party-credits"]').isVisible()).toBe(true);
  // on to the first spotlight
  for (let i = 0; i < 40 && !(await events(page, 'party:spotlight')).length; i++) await step(page, 30);
  const spots = await events(page, 'party:spotlight');
  expect(spots.length).toBeGreaterThanOrEqual(1);
  expect(spots[0]).toMatchObject({ i: 0 });
  expect(spots[0].who).toMatch(/^double\./);
  await step(page, 40);
  shots.push(await shot(page, 'credits-strip'));
  // skip: a real key after the grace (the cinematic's skip) → credits:done {skipped: true}
  await closeModals(page);
  await page.keyboard.press('KeyX');
  await step(page, 2);
  expect(await events(page, 'credits:done')).toEqual([{ skipped: true }]);
  expect(await page.evaluate(() => window.kq!.cinematic!.playing())).toBeNull();
  await step(page, 40);
  expect(await page.evaluate(() => window.kq!.ctx.cinematic.cameraOwner)).toBeNull();
  expect(await page.locator('[data-testid="party-credits"]').count()).toBe(0);
  // the party still stands
  expect(await page.evaluate(() => window.kq!.party!.state().people.length)).toBe(16);

  // the fire bowl, low and close
  await page.evaluate(() => {
    window.kq!.teleport(1217.2 - 4.2, -1117.6 + 3.2, 53, -4);
    window.kq!.step(30);
  });
  shots.push(await shot(page, 'fire-bowl'));

  // the player walks
  const p0 = await page.evaluate(() => ({ ...window.kq!.ctx.player.position }));
  await page.evaluate(() => window.kq!.press('KeyW', 45));
  const p1 = await page.evaluate(() => ({ ...window.kq!.ctx.player.position }));
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(0.5);

  // the guide is talkable: the story's placement for 'imhoff' (simulated here) binds to his body
  const g = await page.evaluate(() => window.kq!.party!.state().people.find((p) => p.who === 'guide')!);
  await page.evaluate(({ x, z }) => {
    const k = window.kq!;
    k.ctx.events.emit('npc:spawn', { npc: 'imhoff', x: x + 30, z: z + 30, era: 'today' });
    // stand 1.6 m in front of him, facing him
    k.teleport(x, z - 1.6, 180, -5);
    k.step(20);
  }, g);
  const near = await page.evaluate(() => window.kq!.npc!.state().near);
  expect(near).toBe('imhoff');
  await expect(page.locator('.kq-prompt')).toBeVisible();
  console.log(`[party a] prompt "${await page.locator('.kq-prompt').textContent()}", ${((Date.now() - t0) / 1000).toFixed(1)} s wall`);
  console.log(`[party a] screenshots ${shots.join(', ')}`);
  expect(errors).toEqual([]);
});

test('party (b): ?party=keep — the dogs lie at the player\'s feet with an eye glint', async ({ page }) => {
  const errors = trackErrors(page);
  const t0 = Date.now();
  await boot(page, 'keep');
  expect(await events(page, 'party:ready')).toEqual([{ variant: 'keep' }]);
  await bodiesIn(page);
  // skip the credits through the debug hook (the key path is test a)
  await page.evaluate(() => window.kq!.party!.skip());
  expect(await events(page, 'credits:done')).toEqual([{ skipped: true }]);
  // the player at the keep bench, the dogs come and lie down
  await page.evaluate(() => {
    window.kq!.teleport(1205.6, -1119.2, 210, -14);
  });
  await step(page, 60 * 8);
  const r = await page.evaluate(() => {
    const p = window.kq!.ctx.player.position;
    return window.kq!.animals!.list().map((a) => ({ id: a.id, state: a.state, d: Math.hypot(a.x - p.x, a.z - p.z) }));
  });
  console.log(`[party b] dogs ${JSON.stringify(r)}`);
  for (const id of ['diane', 'bijou']) {
    const d = r.find((a) => a.id === id)!;
    expect(d.state).toBe('lie');
    expect(d.d).toBeLessThan(2.5);
  }
  const stats = await page.evaluate(() => window.kq!.party!.stats());
  console.log(`[party b] stats ${JSON.stringify(stats)}`);
  const path = await shot(page, 'keep-dogs');
  console.log(`[party b] screenshot ${path}, ${((Date.now() - t0) / 1000).toFixed(1)} s wall`);
  expect(errors).toEqual([]);
});
