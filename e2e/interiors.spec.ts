import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

/**
 * interiors system: walkable palace rooms. Drives window.kq.interiors; screenshots to
 * test-results/screens/interiors-*.png (Festsaal candle-lit 1789, gallery 1789, Festsaal burning
 * 1793-07, gallery as a ruin 1796, the doorway from outside), plus walking in through a door.
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
  // no story line over the picture
  await page.addStyleTag({ content: '[data-testid="dialogue"]{display:none!important}' });
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${SCREENS}/interiors-${name}.png` });
}

type EnterOpts = { u?: number; v?: number; toU?: number; toV?: number; pitch?: number; yaw?: number };

async function enter(page: Page, era: string, room: string, o: EnterOpts): Promise<{ ok: boolean; room: string | null; built: string[] }> {
  return page.evaluate(
    ({ era, room, o }) => {
      const k = window.kq!;
      if (k.ctx.era.current !== era) k.setEra(era as never);
      k.step(1);
      const ok = k.interiors!.enter(room, o);
      k.step(3);
      return { ok, room: k.interiors!.room()?.roomId ?? null, built: k.interiors!.state().built };
    },
    { era, room, o },
  );
}

test.describe('interiors', () => {
  test.describe.configure({ timeout: 300_000 });
  test.beforeEach(async ({ page }) => {
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq?.interiors !== undefined, null, { timeout: 90_000 });
  });

  test('Festsaal 1789: candle-lit, mirrors, parquet', async ({ page }) => {
    const errors = trackErrors(page);
    const st = await page.evaluate(() => {
      window.kq!.setEra('1789');
      return window.kq!.interiors!.state();
    });
    expect(st.ready).toBe(true);
    expect(st.rooms).toBeGreaterThan(40);
    const r = await enter(page, '1789', 'B01.2.og-festsaal', { u: 0.08, v: 0.5, toU: 1, toV: 0.5, pitch: 3 });
    expect(r.ok).toBe(true);
    expect(r.room).toBe('B01.2.og-festsaal');
    expect(r.built).toContain('KB-B01');
    const flags = await page.evaluate(() => window.kq!.state().flags);
    expect(flags['interior.room']).toBe('B01.2.og-festsaal');
    expect(flags['interior.building']).toBe('KB-B01');
    await shot(page, 'festsaal-1789');
    expect(errors).toEqual([]);
  });

  test('Bildergalerie 1789: the salon hang on green damask', async ({ page }) => {
    const errors = trackErrors(page);
    const r = await enter(page, '1789', 'B06.1.bildergalerie', { u: 0.04, v: 0.5, toU: 1, toV: 0.5, pitch: 2 });
    expect(r.room).toBe('B06.1.bildergalerie');
    await shot(page, 'galerie-1789');
    expect(errors).toEqual([]);
  });

  test('Festsaal 28 July 1793: burning, smoke under the ceiling', async ({ page }) => {
    const errors = trackErrors(page);
    const r = await enter(page, '1793-07', 'B01.2.og-festsaal', { u: 0.1, v: 0.5, toU: 1, toV: 0.5, pitch: 6 });
    expect(r.room).toBe('B01.2.og-festsaal');
    await page.evaluate(() => {
      const k = window.kq!;
      k.interiors!.fire('B01.2.og-festsaal', 'burning');
      for (const id of k.interiors!.list().filter((x) => x.building === 'KB-B01' && x.storey === 2 && x.roomId !== 'B01.2.og-festsaal')) k.interiors!.fire(id.id, 'smoke');
      k.step(2);
    });
    await shot(page, 'festsaal-fire');
    for (const graphics of ['medium', 'high', 'low'] as const) {
      const active = await page.evaluate(async (graphics) => {
        const k = window.kq!;
        k.ctx.settings.update((s) => { s.graphics = graphics; }, 'graphics');
        await k.screenshotReady();
        return { graphics: k.ctx.quality.level, room: k.interiors!.room()?.roomId };
      }, graphics);
      expect(active).toEqual({ graphics, room: 'B01.2.og-festsaal' });
    }
    // a collapsed room blocks its doors once the player is out
    const blocked = await page.evaluate(() => {
      const k = window.kq!;
      const events: string[] = [];
      k.ctx.events.on('room:leave', (e) => events.push(`leave:${e.roomId}`));
      k.interiors!.fire('B01.2.og-gardesaal', 'collapsed');
      return events;
    });
    expect(blocked).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Bildergalerie 1796: a ruin under the open sky', async ({ page }) => {
    const errors = trackErrors(page);
    const r = await enter(page, '1796', 'B06.1.bildergalerie', { u: 0.08, v: 0.5, toU: 1, toV: 0.5, pitch: 6 });
    expect(r.ok).toBe(true);
    const st = await page.evaluate(() => window.kq!.interiors!.state());
    expect(st.mode).toBe('ruin');
    expect(st.built).toContain('KB-B06');
    await shot(page, 'galerie-1796');
    expect(errors).toEqual([]);
  });

  test('doorway: walk in from outside, room:enter fires', async ({ page }) => {
    const errors = trackErrors(page);
    const door = await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('1789');
      k.step(1);
      const ds = k.interiors!.doors().filter((d) => d.kind === 'outer' && d.stoop && d.building === 'KB-B01');
      return ds.find((d) => /vestib/.test(d.from)) ?? ds[0]!;
    });
    expect(door).toBeTruthy();
    const back = door.depth + door.stoop!.length + 3.2;
    const x0 = door.x + door.nx * back;
    const z0 = door.z + door.nz * back;
    // stand outside, face the door (−normal), let the building come up
    await page.evaluate(
      ({ x0, z0, nx, nz }) => {
        const k = window.kq!;
        const yaw = (Math.atan2(nx, nz) * 180) / Math.PI;
        k.teleport(x0, z0, -yaw, 4);
        k.step(2);
        k.interiors!.build();
      },
      { x0, z0, nx: door.nx, nz: door.nz },
    );
    await shot(page, 'doorway');
    const res = await page.evaluate(() => {
      const k = window.kq!;
      const events: string[] = [];
      k.ctx.events.on('room:enter', (e) => events.push(e.roomId));
      k.press('KeyW', 150);
      k.step(2);
      return { events, room: k.interiors!.room()?.roomId ?? null, y: k.ctx.player.position.y };
    });
    expect(res.events.length).toBeGreaterThan(0);
    expect(res.events[0]).toBe(door.from);
    expect(Math.abs(res.y - door.floor)).toBeLessThan(0.3);
    await shot(page, 'doorway-inside');
    expect(errors).toEqual([]);
  });

  test('walls hold, doors open onto the Prunktreppe, the stair ramp leads down', async ({ page }) => {
    const fest = await enter(page, '1789', 'B01.2.og-festsaal', { u: 0.5, v: 0.5, toU: 1, toV: 0.5, pitch: 0 });
    expect(fest.room).toBe('B01.2.og-festsaal');
    const res = await page.evaluate(() => {
      const k = window.kq!;
      const p = k.ctx.player.position;
      // 1) into the end wall: the player stops in the room, on the floor
      const floor = p.y;
      k.press('KeyW', 300);
      const wall = { room: k.interiors!.room()?.roomId ?? null, dy: p.y - floor };
      // 2) through the door on the court side and down the stairs
      k.interiors!.enter('B01.2.og-festsaal', { u: 0.5, v: 0.5, toU: 0.5, toV: 0 });
      const ys: number[] = [];
      const rooms = new Set<string>();
      for (let i = 0; i < 24; i++) {
        k.press('KeyW', 10);
        ys.push(p.y);
        rooms.add(k.interiors!.room()?.roomId ?? '-');
      }
      return { wall, ys, rooms: [...rooms], floor };
    });
    expect(res.wall.room).toBe('B01.2.og-festsaal');
    expect(Math.abs(res.wall.dy)).toBeLessThan(0.05);
    expect(res.rooms).toContain('B01.1.eg-prunktreppe');
    // the ramp: never a jump of more than a step, and well down from the Festsaal floor
    for (let i = 1; i < res.ys.length; i++) expect(Math.abs(res.ys[i]! - res.ys[i - 1]!)).toBeLessThan(0.35);
    expect(res.ys[res.ys.length - 1]!).toBeLessThan(res.floor - 1.5);
  });
});
