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
  await page.goto(`./?notitle&nosave&fresh&manual&party=${variant}`);
  await page.waitForFunction(() => {
    const k = window.kq;
    if (!k?.step || k.ctx.pause.reasons.has('title')) return false;
    if (!k.party || !k.cinematic) k.step();
    return k.party?.state().variant != null && !!k.cinematic;
  }, null, { timeout: 180_000 });
  // manual loop: no game time passed yet, so nothing after party:ready / credits:start is missed
  await page.evaluate((src) => {
    const re = new RegExp(src);
    const w = window as unknown as { rec: Rec };
    w.rec = [];
    window.kq!.ctx.events.onAny((n, p) => {
      if (re.test(n)) w.rec.push({ n, p: JSON.parse(JSON.stringify(p ?? null)) });
    });
  }, REC.source);
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

test('party (a): ?party=burn — ready, bodies, credits, spotlights, W hands the camera back, Enter skips, talk to the guide', async ({ page }) => {
  const errors = trackErrors(page);
  const t0 = Date.now();
  await boot(page, 'burn');
  await bodiesIn(page);
  const st = await page.evaluate(() => window.kq!.party!.state());
  expect(st.variant).toBe('burn');
  expect(st.people).toHaveLength(16);
  expect(st.dogs).toEqual(['diane', 'bijou']);
  expect(st.credits).toBe('playing');
  const stats = await page.evaluate(() => window.kq!.party!.stats());
  console.log(`[party a] stats ${JSON.stringify(stats)}`);
  expect(stats.bodies).toBe(16);
  // the set (fest.ts): 3 calls on Niedrig (SwiftShader), 5 on Mittel / Hoch; budget 12
  expect(stats.setDrawCalls).toBeGreaterThanOrEqual(3);
  expect(stats.setDrawCalls).toBeLessThanOrEqual(12);
  // the bodies stand in the clearing and are drawn
  const vis = await page.evaluate(() => window.kq!.ctx.people!.list().filter((p) => p.root.visible).length);
  expect(vis).toBeGreaterThanOrEqual(16);
  expect(st.seconds).toBeGreaterThan(20);
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
  expect(spots[0].who).toMatch(/^(double\.|child\.compass$)/);
  await step(page, 40);
  shots.push(await shot(page, 'credits-strip'));
  await closeModals(page);
  await expect(page.getByTestId('party-credits-hint')).toHaveText('Enter / Esc: Überspringen · Bewegen: selbst umsehen');
  await expect(page.locator('[data-testid="party-credits-skip"]')).toBeVisible();

  // moving hands the orbit camera back: no skip, the strip runs on, the player moved
  const w0 = await page.evaluate(() => ({ ...window.kq!.ctx.player.position }));
  await page.evaluate(() => window.kq!.press('KeyW', 60));
  const w1 = await page.evaluate(() => ({ ...window.kq!.ctx.player.position }));
  expect(Math.hypot(w1.x - w0.x, w1.z - w0.z)).toBeGreaterThan(0.3);
  expect(await page.evaluate(() => window.kq!.cinematic!.playing())).toBeNull();
  expect(await events(page, 'credits:done')).toEqual([]);
  expect(await page.evaluate(() => window.kq!.party!.state().credits)).toBe('playing');
  // the 0.4 s hand-back runs on drawn frames
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.kq!.screenshotReady());
    await page.waitForTimeout(150);
  }
  expect(await page.evaluate(() => window.kq!.ctx.cinematic.cameraOwner)).toBeNull();
  expect(await page.locator('[data-testid="party-credits"]').isVisible()).toBe(true);
  await expect(page.getByTestId('party-credits-hint')).toHaveText('Enter / Esc: Überspringen');
  await step(page, 60);
  expect(await events(page, 'credits:done')).toEqual([]);
  shots.push(await shot(page, 'walking-credits'));
  // the HUD steps aside while the credits roll, even with the camera handed back: nothing sits on the skip button
  const hudVis = () => page.evaluate(() => ['.kqs-bussole', '.kqs-objective'].map((q) => { const e = document.querySelector(q); return e ? getComputedStyle(e).visibility : 'none'; }));
  expect(await hudVis()).not.toContain('visible');
  const covered = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="party-credits-skip"]')!.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return hit?.closest('[data-testid="party-credits-skip"]') ? null : (hit?.className ?? 'nothing');
  });
  expect(covered).toBeNull();

  // Enter skips the whole credits
  await page.keyboard.press('Enter');
  await step(page, 2);
  expect(await events(page, 'credits:done')).toEqual([{ skipped: true }]);
  expect(await page.locator('[data-testid="party-credits"]').count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-kq-credits'))).toBe(false);
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
  await page.evaluate(() => window.kq!.press('KeyW', 120));
  const p1 = await page.evaluate(() => ({ ...window.kq!.ctx.player.position }));
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(1);

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
  // the events of a set and a credits run through the hooks (the dev entry's came before the recorder)
  await page.evaluate(() => {
    window.kq!.party!.set('burn');
    window.kq!.party!.credits(['Eins', 'Zwei']);
  });
  expect((await events(page, 'party:ready')).at(-1)).toEqual({ variant: 'burn' });
  expect((await events(page, 'credits:start')).at(-1).seconds).toBeGreaterThan(20);
  expect(await page.locator('[data-testid="party-credits"]').textContent()).toContain('Zwei');
  await page.evaluate(() => window.kq!.party!.clear());
  expect((await events(page, 'credits:done')).at(-1)).toEqual({ skipped: true });
  expect(await page.evaluate(() => window.kq!.party!.state().people.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('party (c): ?party=museum — the world is quiet: no tripod beam, no marker, no survey toast; all back after', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page, 'museum');
  /** What the world shows near the party: tripods (lit = tall beam), beacons, clue markers, their roots' visibility. */
  const look = () =>
    page.evaluate(() => {
      const kq = window.kq!;
      const sc = kq.ctx.scene;
      const p = kq.ctx.player.position;
      const tripods: { x: number; z: number; d: number; beam: boolean }[] = [];
      sc.getObjectByName('travel')?.traverse((o) => {
        if (o.name !== 'travel-tripod') return;
        const beam = o.children.find((c) => (c as { renderOrder?: number }).renderOrder === 9);
        tripods.push({ x: Math.round(o.position.x), z: Math.round(o.position.z), d: Math.round(Math.hypot(o.position.x - p.x, o.position.z - p.z)), beam: !!beam && beam.scale.y > 3 });
      });
      return {
        roots: ['travel', 'quest-beacons', 'chronik-markers'].map((n) => sc.getObjectByName(n)?.visible ?? null),
        tripods,
        beacons: kq.quests?.beacons() ?? [],
        clues: kq.chronik?.markers().filter((m) => m.vis > 0.01) ?? [],
        travel: kq.travel!.state(),
      };
    });
  await step(page, 60);
  const during = await look();
  console.log(`[party c] during ${JSON.stringify({ ...during, travel: { quiet: during.travel.quiet, activated: during.travel.activated } })}`);
  expect(during.travel.quiet).toBe(true);
  expect(during.roots).toEqual([false, false, false]);
  // a guest walks over to the Ehrenhof tripod (16 m radius) during the credits: not eingemessen, no card
  const was = during.travel.activated.includes('ehrenhof');
  await page.evaluate(() => window.kq!.teleport(1226, -1123, 0, 0));
  await step(page, 60 * 2);
  const held = await page.evaluate(() => window.kq!.travel!.state().activated);
  expect(held.includes('ehrenhof')).toBe(was);
  await expect(page.getByTestId('travel-card-activated')).toHaveCount(0);
  // the credits end: markers back, the point activates normally on the next steps
  await page.evaluate(() => window.kq!.party!.skip());
  await step(page, 30);
  const after = await look();
  expect(after.travel.quiet).toBe(false);
  expect(after.roots[0]).toBe(true);
  expect(after.roots[1]).toBe(true);
  expect(after.roots[2]).toBe(true);
  expect(after.travel.activated).toContain('ehrenhof');
  if (!was) await expect(page.getByTestId('travel-card-activated')).toBeVisible();
  expect(errors).toEqual([]);
});

test('party (b): Escape dismisses the credits and the dogs lie at the player\'s feet', async ({ page }) => {
  const errors = trackErrors(page);
  const t0 = Date.now();
  await boot(page, 'keep');
  expect(await page.evaluate(() => window.kq!.party!.state().variant)).toBe('keep');
  await bodiesIn(page);
  await expect(page.getByTestId('party-credits')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('party-credits')).toHaveCount(0);
  expect(await events(page, 'credits:done')).toEqual([{ skipped: true }]);
  expect(await page.evaluate(() => window.kq!.ctx.pause.paused)).toBe(false);
  await expect(page.getByTestId('resume')).toHaveCount(0);
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

test.describe('landscape phone', () => {
  test.use({ viewport: { width: 667, height: 375 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.setProperty('--kq-safe-l', '47px');
        document.documentElement.style.setProperty('--kq-safe-r', '47px');
        document.documentElement.style.setProperty('--kq-safe-b', '21px');
      });
    });
  });

  test('animated credits fit above the letterbox and a touch drag takes back the camera', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await boot(page, 'burn');
    await bodiesIn(page);
    await step(page, 300);
    const credits = page.getByRole('marquee');
    const touch = page.getByTestId('touch');
    await expect(credits).toBeVisible();
    await expect(touch).toBeVisible();
    await expect(touch.locator('button:visible')).toHaveCount(0);
    const geometry = await credits.evaluate((band) => {
      const track = band.querySelector<HTMLElement>('[data-testid="party-credits-track"]')!;
      const bounds = band.getBoundingClientRect();
      const line = track.getBoundingClientRect();
      const y = (line.top + line.bottom) / 2;
      const left = Math.max(bounds.left, line.left);
      const right = Math.min(bounds.right, line.right);
      // Enable hit testing only for this measurement of the visible crop.
      track.style.pointerEvents = 'auto';
      const hitsTrack = (x: number) => track.contains(document.elementFromPoint(x, y));
      const clipped = {
        left: !hitsTrack(bounds.left - 1),
        inside: left < right && hitsTrack((left + right) / 2),
        right: line.right > bounds.right + 1 && !hitsTrack(bounds.right + 1),
      };
      track.style.removeProperty('pointer-events');
      return {
        clipped,
        insideBand: line.top >= bounds.top && line.bottom <= bounds.bottom,
        insideSafeWidth: bounds.left >= 47 && bounds.right <= innerWidth - 47,
        aboveLetterbox: bounds.bottom <= innerHeight * 0.93 - 21,
      };
    });
    expect(geometry).toEqual({ clipped: { left: true, inside: true, right: true }, insideBand: true, insideSafeWidth: true, aboveLetterbox: true });
    expect(await page.evaluate(() => window.kq!.cinematic!.playing())).toBe('party-credits');
    const skip = page.getByTestId('party-credits-skip');
    for (const control of [credits, skip]) {
      expect(await control.evaluate((el) => {
        const { x, y, width, height } = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(x + width / 2, y + height / 2));
      })).toBe(true);
    }
    const client = await page.context().newCDPSession(page);
    const point = (x: number) => ({ x, y: 150 });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(360)] });
    for (const x of [380, 400, 420, 440]) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(x)] });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await step(page, 60);
    expect(await page.evaluate(() => window.kq!.cinematic!.playing())).toBeNull();
    expect(await events(page, 'credits:done')).toEqual([]);
    await expect(credits).toBeVisible();
  });

  test('OS reduced motion keeps the credits still, swipe scrolls, and tap dismisses', async ({ page }) => {
    const errors = trackErrors(page);
    // Exercise the OS preference even when an older game setting explicitly enables motion.
    await page.addInitScript(() => localStorage.setItem('kq.settings.v1', JSON.stringify({ reducedMotion: false })));
    await boot(page, 'burn');
    const credits = page.getByRole('region', { name: 'Abspann' });
    const track = page.getByTestId('party-credits-track');
    await expect(credits).toBeVisible();
    await expect(track).toContainText('Jan Eric Rippel');
    await expect(track).toContainText('Danke fürs Spielen');
    await step(page, 300);
    await expect(track).toHaveCSS('transform', 'none');
    expect(await page.evaluate(() => window.kq!.cinematic!.playing())).toBeNull();
    expect(await credits.evaluate((el) => el.scrollTop)).toBe(0);

    const bounds = await credits.boundingBox();
    expect(bounds).not.toBeNull();
    const { x, y, width, height } = bounds!;
    expect(x).toBeGreaterThanOrEqual(47);
    expect(x + width).toBeLessThanOrEqual(667 - 47);
    expect(y + height).toBeLessThanOrEqual(375 - 21);
    const client = await page.context().newCDPSession(page);
    const point = (delta: number) => ({ x: Math.round(x + width / 2), y: Math.round(y + height * 0.8 - delta) });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(0)] });
    for (const delta of [20, 40, 60, 80]) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(delta)] });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => credits.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    const skip = page.getByRole('button', { name: 'Überspringen', exact: true });
    expect((await skip.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    const touch = page.getByTestId('touch');
    await expect(touch).toBeVisible();
    await expect(touch.locator('button:visible')).toHaveCount(0);
    await skip.tap();
    await step(page, 2);
    await expect(credits).toHaveCount(0);
    await expect(page.getByTestId('touch-pause')).toBeVisible();
    expect(await events(page, 'credits:done')).toEqual([{ skipped: true }]);
    expect(await page.evaluate(() => window.kq!.ctx.pause.paused)).toBe(false);
    expect(errors).toEqual([]);
  });
});
