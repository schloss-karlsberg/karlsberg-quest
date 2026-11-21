import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

/**
 * scenery system: set dressing per era (the 1796 quarry at the Baumagazin, the 1789 building site,
 * the kennels, the park fence, the Ehrenhof railing and gate), the Hohenburg on the horizon, the
 * fireworks echo, Mannlich's lit windows, the passage out of the Tempelzimmer, no snow in the
 * rooms, and the dawn look. Screenshots: test-results/screens/pol-set-*.png.
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
  await page.screenshot({ path: `${SCREENS}/pol-set-${name}.png` });
}

interface Place {
  era: string;
  x: number;
  z: number;
  yaw: number;
  pitch?: number;
  lift?: number;
  steps?: number;
}

async function place(page: Page, v: Place): Promise<void> {
  await page.evaluate((v) => {
    const k = window.kq!;
    if (k.ctx.era.current !== v.era) k.setEra(v.era as never);
    k.teleport(v.x, v.z, v.yaw, v.pitch ?? 0);
    k.step(v.steps ?? 4);
    if (v.lift) k.ctx.player.position.y += v.lift;
  }, v);
}

/** Walk (W held) for n steps facing `yaw`; returns where the player ended up. */
async function walk(page: Page, yaw: number, steps: number): Promise<{ x: number; z: number }> {
  return page.evaluate(
    ({ yaw, steps }) => {
      const k = window.kq!;
      const p = k.ctx.player.position;
      k.teleport(p.x, p.z, yaw, 0);
      k.press('KeyW', steps);
      return { x: k.ctx.player.position.x, z: k.ctx.player.position.z };
    },
    { yaw, steps },
  );
}

test.describe('scenery', () => {
  test.describe.configure({ timeout: 420_000 });
  test.beforeEach(async ({ page }) => {
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq?.scenery !== undefined, null, { timeout: 90_000 });
    await page.evaluate(() => {
      window.kq!.story?.look('day');
      window.kq!.step(2);
    });
  });

  test('1796: the quarry at the Baumagazin, its wall holds, the Hohenburg in the west', async ({ page }) => {
    const errors = trackErrors(page);
    await place(page, { era: '1796', x: 474, z: -818, yaw: 10, pitch: -6, steps: 10 });
    const built = await page.evaluate(() => window.kq!.scenery!.built());
    expect(built).toContain('k4-baumagazin');
    expect(await page.evaluate(() => window.kq!.scenery!.solids())).toBeGreaterThan(20);
    await shot(page, 'quarry-yard');
    await place(page, { era: '1796', x: 496, z: -873, yaw: 335, pitch: -5 });
    await shot(page, 'quarry-south');
    // walking into the Baumagazin's west facade: stopped at the wall (it stands in the ruin)
    await place(page, { era: '1796', x: 492, z: -838, yaw: 72 });
    const at = await walk(page, 72, 240);
    // the facade runs at x ≈ 502.1 here
    expect(at.x).toBeLessThan(502);
    expect(at.x).toBeGreaterThan(499);
    // the props are solid too: the big heap of broken stone (r 2.1 at 481.5/−836)
    // (z grows southwards: walk south from 6 m north of it)
    await place(page, { era: '1796', x: 481.5, z: -842, yaw: 180 });
    const t = await walk(page, 180, 150);
    expect(t.z).toBeLessThan(-838.4);
    // the Hohenburg from the west edge (bible 4.2)
    await place(page, { era: '1796', x: 210, z: -905, yaw: 226, pitch: 2 });
    await page.evaluate(() => window.kq!.step(90));
    expect((await page.evaluate(() => window.kq!.scenery!.hohenburg())).vis).toBeGreaterThan(0.6);
    await shot(page, 'hohenburg-1796');
    expect(errors).toEqual([]);
  });

  test('1789: building site, kennels, the passage out of the Tempelzimmer, the Ehrenhof gate, fireworks', async ({ page }) => {
    const errors = trackErrors(page);
    // the building site at the gallery's east pavilion
    await place(page, { era: '1789', x: 1321, z: -1241, yaw: 292, pitch: 3 });
    expect(await page.evaluate(() => window.kq!.scenery!.built())).toContain('k1-bauplatz');
    await shot(page, 'bauplatz');
    // the kennels by the Zwinger
    await place(page, { era: '1789', x: 1172, z: -1585, yaw: 70, pitch: -4 });
    expect(await page.evaluate(() => window.kq!.scenery!.built())).toContain('zwinger');
    await shot(page, 'zwinger');
    // the rotunda KB-B07 going up: no dome yet, its centering and a scaffold round the drum
    await place(page, { era: '1789', x: 1300.9, z: -1237.9, yaw: 246, pitch: 6 });
    await shot(page, 'rotunda-1789');
    // out through the Tempelzimmer's glass doors: the colonnade, up the steps, through the round
    // room, out by the portico and down into the garden
    expect((await page.evaluate(() => window.kq!.scenery!.passage())).open).toBe(true);
    await place(page, { era: '1789', x: 1268.9, z: -1226.5, yaw: 80.5 });
    await shot(page, 'passage-door');
    const out = await walk(page, 80.5, 420);
    const s = (out.x - 1270.34) * 0.98643 + (out.z + 1226.78) * -0.16416;
    expect(s).toBeGreaterThan(20);
    await place(page, { era: '1789', x: 1293.03, z: -1230.56, yaw: 260.5, pitch: 3 });
    await shot(page, 'passage-garden');
    // the Ehrenhof railing: the gate is shut, then opened by the cue
    await place(page, { era: '1789', x: 1178, z: -1112, yaw: 100, pitch: 2 });
    await shot(page, 'gitter-closed');
    await place(page, { era: '1789', x: 1186, z: -1114.6, yaw: 98 });
    const shut = await walk(page, 98, 200);
    expect(shut.x).toBeLessThan(1192.5);
    await page.evaluate(() => {
      window.kq!.ctx.events.emit('story:cue', { id: 'scenery:gate', data: { open: true } });
      window.kq!.step(4);
    });
    await place(page, { era: '1789', x: 1186, z: -1114.6, yaw: 98 });
    const open = await walk(page, 98, 300);
    expect(open.x).toBeGreaterThan(1196);
    await place(page, { era: '1789', x: 1178, z: -1112, yaw: 100, pitch: 2 });
    await shot(page, 'gitter-open');
    // the fireworks echo at the Rondell (as when the Chronik plays clue.k1.feuerwerk)
    await page.evaluate(() => {
      const k = window.kq!;
      k.story?.look('night', '1789' as never);
      k.ctx.events.emit('echo:start', { id: 'clue.k1.feuerwerk' } as never);
    });
    await place(page, { era: '1789', x: 1815, z: 348, yaw: 92, pitch: 9 });
    await page.evaluate(() => window.kq!.step(240));
    const fw = await page.evaluate(() => window.kq!.scenery!.fireworks.state());
    expect(fw.phase).toBe('festive');
    expect(fw.lamps).toBeGreaterThan(50);
    await shot(page, 'fireworks-festive');
    await page.evaluate(() => {
      window.kq!.scenery!.fireworks.phase('climax');
      window.kq!.step(150);
    });
    expect((await page.evaluate(() => window.kq!.scenery!.fireworks.state())).sparks).toBeGreaterThan(100);
    await shot(page, 'fireworks-climax');
    await page.evaluate(() => {
      window.kq!.scenery!.fireworks.phase('return');
      window.kq!.step(200);
    });
    await shot(page, 'fireworks-return');
    await page.evaluate(() => {
      window.kq!.ctx.events.emit('echo:end', { id: 'clue.k1.feuerwerk' } as never);
      window.kq!.step(10);
    });
    expect((await page.evaluate(() => window.kq!.scenery!.fireworks.state())).phase).toBe('off');
    expect(errors).toEqual([]);
  });

  test('February 1793: the park fence, Mannlich’s windows, no snow in the gallery', async ({ page }) => {
    const errors = trackErrors(page);
    await page.evaluate(() => window.kq!.setEra('1793-02' as never));
    // the broken fence by the Torhaus (where he climbed over) and the park barrier
    await place(page, { era: '1793-02', x: 1688, z: -394, yaw: 285, pitch: -8 });
    expect(await page.evaluate(() => window.kq!.scenery!.built())).toContain('parkzaun');
    await shot(page, 'parkzaun');
    await place(page, { era: '1793-02', x: 1616, z: -392, yaw: 25, pitch: -3 });
    await shot(page, 'parkschranke');
    // Mannlich's windows in the Orangerie (chapter 2's cue)
    const n = await page.evaluate(() => {
      window.kq!.ctx.events.emit('story:cue', { id: 'scenery:windows', data: { building: 'KB-B10', era: '1793-02', share: 0.55 } });
      window.kq!.step(2);
      return window.kq!.state().systems.scenery?.windows.length ?? 0;
    });
    expect(n).toBe(1);
    await place(page, { era: '1793-02', x: 1290, z: -965, yaw: 268, pitch: 6 });
    await shot(page, 'orangerie-windows');
    // inside the gallery: the snow stays outside the windows
    await place(page, { era: '1793-02', x: 1215, z: -1215, yaw: 100 });
    await shot(page, 'gallery-no-snow');
    // the rotunda KB-B07 finished (dome and pediment), no scaffold
    await place(page, { era: '1793-02', x: 1300.9, z: -1237.9, yaw: 246, pitch: 6 });
    expect(await page.evaluate(() => window.kq!.scenery!.built())).not.toContain('k1-bauplatz');
    await shot(page, 'rotunda-1793');
    expect(errors).toEqual([]);
  });

  test('dawn: Morgengrauen at the Quelle', async ({ page }) => {
    const errors = trackErrors(page);
    await place(page, { era: 'today', x: 1053, z: -828, yaw: 51, pitch: 4 });
    await page.evaluate(() => {
      window.kq!.story!.look('dawn');
      window.kq!.step(4);
    });
    const look = await page.evaluate(() => ({ sun: window.kq!.ctx.world.look.sun, story: window.kq!.state().systems.story?.look }));
    expect(look.story).toBe('dawn');
    expect(look.sun.elevation).toBeLessThan(8);
    await shot(page, 'dawn-station');
    expect(errors).toEqual([]);
  });
});
