import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

/**
 * World track (playtest round 2, "fewer empty walks, more wow"): the survey points (activate,
 * the map, fast travel, the rules), the route POIs (a guarded cache, a Fundstück, a Wegstein),
 * the Wegweiser around buildings, the open park gate at the Torhaus, and the new set pieces
 * (Apfelallee, menagerie, Festsaal, the Zwinger today, the rolling carts, the Westblick).
 * Screenshots: test-results/screens/fun-world-*.png.
 */
const SCREENS = 'test-results/screens';
mkdirSync(SCREENS, { recursive: true });

const IGNORED = [/GPU stall/i, /pointer ?lock/i, /WebGL.*(performance|ReadPixels)/i, /AudioContext was not allowed/i];

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.some((r) => r.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    if (!IGNORED.some((r) => r.test(e.message))) errors.push(`pageerror: ${e.message}`);
  });
  return errors;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${SCREENS}/fun-world-${name}.png` });
}

/** Stand at x/z looking at tx/tz. */
async function look(page: Page, era: string, x: number, z: number, tx: number, tz: number, pitch = 0, steps = 6): Promise<void> {
  await page.evaluate(
    ({ era, x, z, tx, tz, pitch, steps }) => {
      const k = window.kq!;
      if (k.ctx.era.current !== era) k.setEra(era as never);
      k.teleport(x, z, (Math.atan2(tx - x, -(tz - z)) * 180) / Math.PI, pitch);
      k.step(steps);
    },
    { era, x, z, tx, tz, pitch, steps },
  );
}

test.describe('world', () => {
  test.describe.configure({ timeout: 480_000 });
  test.beforeEach(async ({ page }) => {
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq?.travel !== undefined && window.kq?.scenery !== undefined, null, { timeout: 90_000 });
    await page.evaluate(() => {
      window.kq!.story?.look('day');
      window.kq!.step(2);
    });
  });

  test('survey points: walk up to one, open the map, travel there, blocked in a fight', async ({ page }) => {
    const errors = trackErrors(page);
    const known = await page.evaluate(() => window.kq!.travel!.points().filter((p) => p.known).map((p) => p.id));
    expect(known).toContain('feldstation');
    // walking up to the Ehrenhof tripod measures it in (the beam rises, a card says so)
    await look(page, '1789', 1214, -1112, 1230, -1127, 4);
    expect(await page.evaluate(() => window.kq!.travel!.state().activated)).not.toContain('ehrenhof');
    await page.evaluate(() => {
      const k = window.kq!;
      k.teleport(1229, -1125, 135, 0);
      k.step(4);
    });
    expect(await page.evaluate(() => window.kq!.travel!.state().activated)).toContain('ehrenhof');
    await expect(page.getByTestId('travel-card-activated')).toBeVisible();
    await look(page, '1789', 1214, -1112, 1230, -1127, 4, 10);
    await shot(page, 'tripod-activated');
    // the map: M opens it, the activated points have a "Hinreisen" button
    await page.evaluate(() => window.kq!.travel!.map(true));
    await expect(page.getByTestId('travel-go-ehrenhof')).toBeVisible();
    await shot(page, 'map');
    await page.evaluate(() => window.kq!.travel!.map(false));
    // travel from far away: lands beside the tripod
    await look(page, '1789', 760, -915, 1230, -1127);
    expect(await page.evaluate(() => window.kq!.travel!.go('ehrenhof'))).toBe(true);
    const at = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
    expect(Math.hypot(at.x - 1230, at.z + 1127)).toBeLessThan(5);
    // not in a fight
    await page.evaluate(() => {
      const k = window.kq!;
      k.combat!.spawn('streuner', { count: 2 });
      k.step(30);
    });
    expect(await page.evaluate(() => window.kq!.travel!.state().block)).toMatch(/Kampf/);
    expect(await page.evaluate(() => window.kq!.travel!.go('feldstation'))).toBe(false);
    await page.evaluate(() => {
      window.kq!.combat!.kill();
      window.kq!.step(10);
    });
    expect(errors).toEqual([]);
  });

  test('route POIs: a guarded cache opens when its guards fall, a Fundstück, a Wegstein heals', async ({ page }) => {
    const errors = trackErrors(page);
    const pois = await page.evaluate(() => window.kq!.travel!.pois());
    expect(pois.length).toBeGreaterThan(40);
    // a cache in 1789 (needs a weapon in hand)
    await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('1789');
      // route caches arm only in their own chapter (travel): the 1789 routes are chapter 1's
      const sys = k.ctx.state.mutable.systems as Record<string, Record<string, unknown> | undefined>;
      sys['story'] = { ...(sys['story'] ?? {}), chapter: 'k1' };
      k.progression!.grant('item.stab.esche', 1, true);
      k.progression!.equip('item.stab.esche');
      k.step(2);
    });
    const cache = (await page.evaluate(() => window.kq!.travel!.nearest('cache')))!;
    expect(cache).not.toBeNull();
    // guards rise after the 3 s arrival grace of a teleport (travel ARRIVAL_GRACE)
    await look(page, '1789', cache.x - 10, cache.z + 10, cache.x, cache.z, -6, 220);
    const guards = await page.evaluate((g) => window.kq!.combat!.enemies().filter((e) => e.group === g).length, `poi:${cache.id}`);
    const any = await page.evaluate(() => window.kq!.combat!.enemies().length);
    expect(Math.max(guards, any)).toBeGreaterThanOrEqual(2);
    await shot(page, 'cache-guarded');
    await page.evaluate(() => {
      window.kq!.combat!.kill();
      window.kq!.step(60);
    });
    expect(await page.evaluate(() => window.kq!.travel!.state().done)).toContain(cache.id);
    // a Fundstück: walk onto it, a card with the text
    const lore = (await page.evaluate(() => window.kq!.travel!.nearest('lore')))!;
    await look(page, '1789', lore.x - 4, lore.z + 4, lore.x, lore.z, -10, 10);
    await shot(page, 'fundstueck');
    await page.evaluate((l) => {
      window.kq!.teleport(l.x, l.z + 0.5, 0, 0);
      window.kq!.step(4);
    }, lore);
    await expect(page.getByTestId('travel-card-lore')).toBeVisible();
    expect(await page.evaluate(() => window.kq!.travel!.state().done)).toContain(lore.id);
    // a Wegstein heals out of a fight
    const shrine = (await page.evaluate(() => window.kq!.travel!.nearest('shrine')))!;
    await page.evaluate((s) => {
      const k = window.kq!;
      k.combat!.hurt(40);
      k.teleport(s.x, s.z + 1.2, 180, -8);
      k.step(10);
    }, shrine);
    const hp = await page.evaluate(() => window.kq!.combat!.state().hp);
    expect(hp).toBeGreaterThanOrEqual(99);
    await shot(page, 'wegstein');
    expect(errors).toEqual([]);
  });

  test('wayfinding: the park gate stands open, the Wegweiser goes round the palace', async ({ page }) => {
    const errors = trackErrors(page);
    // from the Torhaus anchor straight north through the open park gate
    await look(page, '1793-02', 1676, -398, 1676, -420, 0);
    const walked = await page.evaluate(() => {
      const k = window.kq!;
      k.press('KeyW', 420);
      return { x: k.ctx.player.position.x, z: k.ctx.player.position.z };
    });
    expect(walked.z).toBeLessThan(-416);
    await look(page, '1793-02', 1676, -392, 1676, -420, -2);
    await shot(page, 'torhaus-gate');
    // a route from the Ehrenhof to Hanne goes round the wings, not through them
    const route = await page.evaluate(() => {
      const k = window.kq!;
      if (k.ctx.era.current !== '1789') k.setEra('1789');
      k.teleport(1222, -1119, 0, 0);
      k.step(2);
      return k.travel!.route(1287, -1228);
    });
    const end = route[route.length - 1]!;
    expect(Math.hypot(end[0] - 1287, end[1] + 1228)).toBeLessThan(3);
    expect(route.length).toBeGreaterThan(2);
    // round 3: the route goes through the north wing's Durchfahrt, never into the corner where
    // the Corps de logis meets the wing (testers ran into it)
    expect(route.some(([x, z]) => x > 1212 && x < 1228 && z < -1138 && z > -1162)).toBe(true);
    expect(route.some(([x, z]) => x > 1244 && x < 1256 && z < -1140 && z > -1152)).toBe(false);
    expect(await page.evaluate(() => window.kq!.scenery!.built())).toContain('ehrenhof-weg');
    // standing in that corner with Hanne as the goal (bearing ≈ 25°, through the wall): the
    // compass gets a blue "Weg" marker towards a door (the vestibule or the Durchfahrt) instead
    const way = await page.evaluate(() => {
      const k = window.kq!;
      k.teleport(1246, -1141, 40, 0);
      k.ctx.events.emit('objective:set', { text: 'Hanne', x: 1287, z: -1228, id: 'test.way' });
      k.step(80);
      return k.travel!.way();
    });
    expect(way.blocked).toBe(true);
    expect(way.bearing).not.toBeNull();
    expect(Math.abs(((way.bearing! - 25 + 540) % 360) - 180)).toBeGreaterThan(60);
    await look(page, '1789', 1236, -1124, 1243.5, -1139.2, 0, 20);
    await page.evaluate(() => window.kq!.travel!.trail(true));
    await page.evaluate(() => window.kq!.step(4));
    await shot(page, 'ehrenhof-weg');
    expect(errors).toEqual([]);
  });

  test('set pieces: Apfelallee, menagerie, Festsaal, the Zwinger today, rolling carts, the Westblick', async ({ page }) => {
    const errors = trackErrors(page);
    await look(page, '1789', 1500, -548, 1443, -700, -2, 30);
    expect(await page.evaluate(() => window.kq!.scenery!.built())).toContain('apfelallee');
    await shot(page, 'apfelallee-1789');
    await look(page, '1793-02', 1500, -548, 1443, -700, -2, 30);
    await shot(page, 'apfelallee-winter');
    await look(page, '1789', 1862, 74, 1872, 74, 0, 30);
    expect(await page.evaluate(() => window.kq!.scenery!.built())).toContain('karlslust-menagerie');
    await shot(page, 'menagerie-board');
    await look(page, '1789', 1945, 165, 1975, 160, -4, 20);
    await shot(page, 'menagerie-baeren');
    await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('1793-07');
      k.teleport(1269, -1124, 250, -15);
      k.step(30);
    });
    expect(await page.evaluate(() => window.kq!.scenery!.built())).toContain('k3-festsaal');
    await shot(page, 'festsaal');
    // round 3: the hung room — the portraits and pier glass on the north wall, the chandelier
    await page.evaluate(() => {
      const k = window.kq!;
      k.teleport(1266.5, -1124.5, 330, 8);
      k.step(10);
    });
    await shot(page, 'festsaal-hung');
    await look(page, 'today', 1205, -1570, 1215, -1582, -14, 30);
    expect(await page.evaluate(() => window.kq!.scenery!.built())).toContain('zwinger-heute');
    await shot(page, 'zwinger-heute');
    // 1796: the carts roll west
    await look(page, '1796', 520, -895, 470, -904, -3, 4);
    const a = await page.evaluate(() => window.kq!.scenery!.convoy());
    expect(a.length).toBe(3);
    await page.evaluate(() => window.kq!.step(120));
    const b = await page.evaluate(() => window.kq!.scenery!.convoy());
    expect(Math.hypot(b[0]![0] - a[0]![0], b[0]![1] - a[0]![1])).toBeGreaterThan(1.5);
    const c0 = b[0]!;
    await look(page, '1796', c0[0] - 9, c0[1] + 9, c0[0], c0[1], -4, 2);
    await shot(page, 'carts-1796');
    // the Westblick: the haze lifts, the Hohenburg stands clear
    await look(page, '1796', 210, -905, -1320, 585, 2, 120);
    expect(await page.evaluate(() => window.kq!.scenery!.fogLift())).toBeGreaterThan(0.6);
    // round 3: the castle hill is drawn larger there (it was a smudge)
    expect((await page.evaluate(() => window.kq!.scenery!.hohenburg())).mag).toBeGreaterThan(2);
    expect((await page.evaluate(() => window.kq!.scenery!.hohenburg())).vis).toBeGreaterThan(0.6);
    await shot(page, 'westblick-1796');
    expect(errors).toEqual([]);
  });
});
