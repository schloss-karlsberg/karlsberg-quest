import { type Page, expect, test } from '@playwright/test';
import { ciScale, desktopViewport } from './helpers/ci';
import { SCREENS, trackErrors } from './helpers/common';

/**
 * Art polish: period ghost costumes, the procedural forest (species, LOD, seasons), the burning
 * palace interior and the hounds in fog. Screenshots: test-results/screens/pol-art-*.png — look
 * at them after visual changes.
 */
test.describe.configure({ timeout: ciScale(300_000) });
test.use({ viewport: desktopViewport });

const ROSTER = ['hanne', 'soll', 'jost', 'pikeur', 'peter', 'matthes'];

async function boot(page: Page): Promise<void> {
  await page.goto('./?notitle&nosave&fresh&manual');
  await page.waitForFunction(() => !!window.kq?.npc && !!window.kq?.interiors && !!window.kq?.hunt, null, { timeout: 180_000 });
  // no story lines over the pictures
  await page.addStyleTag({ content: '[data-testid="dialogue"]{display:none!important}' });
  await page.evaluate(() => {
    window.kq!.ctx.state.mutable.flags['barks.quiet'] = true;
  });
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${SCREENS}/pol-art-${name}.png`, timeout: ciScale(150_000) });
}

async function view(page: Page, era: string | null, x: number, z: number, yaw: number, pitch: number, fly = 0): Promise<void> {
  await page.evaluate(
    ({ era, x, z, yaw, pitch, fly }) => {
      const k = window.kq!;
      if (era && k.ctx.era.current !== era) k.setEra(era as never);
      k.ctx.player.setFlying(fly > 0);
      k.teleport(x, z, yaw, pitch);
      if (fly > 0) k.ctx.player.position.y = k.ctx.world.heightAt(x, z) + fly;
      k.step(2);
    },
    { era, x, z, yaw, pitch, fly },
  );
}

test('ghosts: period costumes by day and by night', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  const spawn = async (era: string) =>
    page.evaluate(
      async ({ ids, era }) => {
        const k = window.kq!;
        ids.forEach((id, i) => k.npc!.spawn({ npc: id, x: 1283.5 + i * 1.45, z: -1228.5, era: era as never, yaw: 0 }));
        for (let i = 0; i < 400 && k.npc!.list().some((n) => n.alpha < 0.97); i++) await new Promise((r) => requestAnimationFrame(r));
        return k.npc!.list().map((n) => ({ npc: n.npc, alpha: n.alpha }));
      },
      { ids: ROSTER, era },
    );
  await view(page, '1789', 1287, -1222, 0, -4);
  const list = await spawn('1789');
  expect(list.map((n) => n.npc).sort()).toEqual([...ROSTER].sort());
  for (const n of list) expect(n.alpha).toBeGreaterThan(0.9);
  await shot(page, 'npc-row');
  await view(page, null, 1285.5, -1226.4, 0, -6);
  await shot(page, 'npc-soll-close');
  await view(page, null, 1283.6, -1226.2, 0, -6);
  await shot(page, 'npc-hanne-close');
  await view(page, '1793-02', 1287, -1222, 0, -4);
  await spawn('1793-02');
  await shot(page, 'npc-row-night');
  expect(errors).toEqual([]);
});

test('forest: species, LOD and seasons', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await view(page, 'today', 1240, -1060, 250, -4);
  const stats = await page.evaluate(() => window.kq!.ctx.world.forest.stats);
  expect(stats.near).toBeGreaterThan(0);
  expect(stats.mid).toBeGreaterThan(0);
  expect(stats.far).toBeGreaterThan(0);
  // 3 species × 3 LOD batches at most
  expect(stats.drawCalls).toBeLessThanOrEqual(9);
  await shot(page, 'forest-today');
  await view(page, 'today', 1000, -1100, 95, -20, 90);
  await shot(page, 'forest-air');
  for (const era of ['1789', '1793-02', '1796']) {
    await view(page, era, 1287, -1222, 30, 2);
    await shot(page, `forest-${era}`);
  }
  expect(errors).toEqual([]);
});

test('palace fire: the Festsaal threatening on arrival, then burning', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  const arrival = await page.evaluate(() => {
    const k = window.kq!;
    k.setEra('1793-07');
    k.step(1);
    k.interiors!.enter('B01.2.og-festsaal', { u: 0.1, v: 0.5, toU: 1, toV: 0.5, pitch: 8 });
    k.step(3);
    // the fire has the rest of the Beletage, the Festsaal itself not yet
    for (const r of k.interiors!.list().filter((x) => x.building === 'KB-B01' && x.storey === 1 && x.roomId !== 'B01.2.og-festsaal')) k.interiors!.fire(r.id, 'burning');
    k.step(120);
    return { room: k.interiors!.room()?.roomId ?? null, heat: (k.ctx.post.uniforms.uHeat?.value as number) ?? 0 };
  });
  expect(arrival.room).toBe('B01.2.og-festsaal');
  // heat shimmer in the air before any flame is in the room
  expect(arrival.heat).toBeGreaterThan(0);
  await shot(page, 'festsaal-arrival');
  await page.evaluate(() => {
    const k = window.kq!;
    k.interiors!.enter('B01.2.og-festsaal', { u: 0.1, v: 0.5, toU: 1, toV: 0.5, pitch: 8 });
    k.interiors!.fire('B01.2.og-festsaal', 'burning');
    k.step(60);
  });
  await shot(page, 'festsaal-burning');
  await page.evaluate(() => {
    const k = window.kq!;
    k.interiors!.enter('B01.2.og-festsaal', { u: 0.5, v: 0.5, toU: 0.5, toV: 0, pitch: 12 });
    k.step(2);
  });
  await shot(page, 'festsaal-wall');
  expect(errors).toEqual([]);
});

test('hounds: readable in fog at 30–60 m', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  const place = async (era: string, x: number, z: number, yaw: number, spots: [number, number][], pikeur: boolean) => {
    await view(page, era, x, z, yaw, 2);
    return page.evaluate(
      ({ x, z, spots, pikeur }) => {
        const k = window.kq!;
        k.ctx.state.mutable.flags['barks.quiet'] = true;
        k.hunt!.start({ x, z, radius: 140, intensity: 0.5, hounds: spots.length, pikeur, seed: 3 });
        k.hunt!.freeze(true);
        spots.forEach(([d, a], i) => k.hunt!.placeInView(i, d, a));
        const s = k.hunt!.sim()!;
        s.agents[1]!.heading = k.ctx.player.yaw + Math.PI / 2;
        k.step(90);
        const pack = k.ctx.scene.getObjectByName('hunt-pack');
        return { visible: !!pack?.visible, agents: s.agents.length };
      },
      { x, z, spots, pikeur },
    );
  };
  const far: [number, number][] = [
    [30, -14],
    [38, 8],
    [45, -4],
    [52, 15],
    [60, 0],
  ];
  const r = await place('1793-02', 1452, -640, 330, far, false);
  expect(r.visible).toBe(true);
  await shot(page, 'hounds-frost-fog');
  await place('1789', 1262, -1160, 0, far, true);
  await shot(page, 'hounds-1789');
  await place('1793-07', 1262, -1160, 0, far, false);
  await shot(page, 'hounds-fire-night');
  expect(errors).toEqual([]);
});
