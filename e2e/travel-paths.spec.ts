import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { SCREENS } from './helpers/common';

/**
 * Playtest round 10 (F-10, "no visible Waldweg to follow"): in the present day the Wegweiser
 * fires at the Weiher (the straight line to the hohe Stufe runs into the water, B1) and its route
 * prefers the OSM path raster (B2), so the motes go round the north shore on the real Waldweg
 * instead of along the crow line. Unit side: tests/travel.test.ts ("the Wegweiser follows the
 * paths"). Screenshot: test-results/screens/travel-paths-damm.png.
 */
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

/** The Damm / Mauerrest at the Weiher's west end, and the hohe Stufe (prologue P3). */
const DAMM = { x: 816, z: -884 };
const STUFE = { x: 1237, z: -966 };

test.describe('travel: the Wegweiser on the Waldweg', () => {
  test.describe.configure({ timeout: 240_000 });
  test.beforeEach(async ({ page }) => {
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq?.travel !== undefined, null, { timeout: 90_000 });
    await page.evaluate(() => {
      window.kq!.story?.look('day');
      window.kq!.step(2);
    });
  });

  test('at the Weiher the motes show and follow the north-shore path, not the crow line', async ({ page }) => {
    const errors = trackErrors(page);
    const res = await page.evaluate(
      ({ DAMM, STUFE }) => {
        const k = window.kq!;
        if (k.ctx.era.current !== 'today') k.setEra('today');
        k.teleport(DAMM.x, DAMM.z, (Math.atan2(STUFE.x - DAMM.x, -(STUFE.z - DAMM.z)) * 180) / Math.PI, 0);
        k.step(2);
        // the goal: the hohe Stufe as the story objective (what P3 sets)
        const story = k.ctx.state.state.systems.story as { objective?: unknown } | undefined;
        if (story) story.objective = { x: STUFE.x, z: STUFE.z, text: 'Zur hohen Stufe' };
        else k.ctx.events.emit('objective:set', { text: 'Zur hohen Stufe', x: STUFE.x, z: STUFE.z, id: 'e2e.stufe' });
        // let the Wegweiser's 1 s straight-line check run
        k.step(150);
        const world = k.ctx.world;
        const nearPath = (x: number, z: number) => {
          for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (world.pathAt(x + dx, z + dz) > 0.3) return true;
          return false;
        };
        /** Share of the first `upto` m of a polyline within 2 m of a path cell; any point in water. */
        const judge = (pts: [number, number][], upto: number) => {
          let on = 0;
          let all = 0;
          let wet = false;
          for (let i = 0; i + 1 < pts.length && all < upto; i++) {
            const [ax, az] = pts[i]!;
            const [bx, bz] = pts[i + 1]!;
            const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
            for (let s = 0; s < n && all < upto; s++) {
              const t = (s + 0.5) / n;
              const x = ax + (bx - ax) * t;
              const z = az + (bz - az) * t;
              all++;
              if (nearPath(x, z)) on++;
              if (world.surfaceAt(x, z) === 'water') wet = true;
            }
          }
          return { share: all ? on / all : 0, wet, metres: all };
        };
        const way = k.travel!.way();
        const trail = k.travel!.trail(true);
        const route = k.travel!.route(STUFE.x, STUFE.z);
        return {
          way,
          visible: trail.visible,
          trail: judge(trail.points, 70),
          route: judge(route, 70),
          routeAll: judge(route, 1e9),
          northShore: route.some(([x, z]) => x > 840 && x < 940 && z < -900),
          pts: route.map(([x, z]) => [Math.round(x), Math.round(z)]),
        };
      },
      { DAMM, STUFE },
    );
    console.log('[travel-paths]', JSON.stringify(res));
    // B1: the lake blocks the straight line in the present day → the Weg marker shows
    expect(res.way.blocked).toBe(true);
    expect(res.way.bearing).not.toBeNull();
    // the motes show, along the first 70 m of the Waldweg (north shore), never over the water
    expect(res.visible).toBe(true);
    expect(res.trail.metres).toBeGreaterThan(50);
    expect(res.trail.share).toBeGreaterThan(0.8);
    expect(res.trail.wet).toBe(false);
    // B2: the whole route takes the path round the north shore
    expect(res.route.share).toBeGreaterThan(0.8);
    expect(res.routeAll.wet).toBe(false);
    expect(res.northShore).toBe(true);
    await page.evaluate(() => window.kq!.screenshotReady());
    await page.screenshot({ path: `${SCREENS}/travel-paths-damm.png` });
    expect(errors).toEqual([]);
  });
});
