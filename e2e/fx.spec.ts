import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { SCREENS } from './helpers/common';

/**
 * fx system: era shift, scan pulse, fire, Steinfraß, era ambience. Drives everything through
 * window.kq.fx; effect clocks are frozen at chosen times for the screenshots
 * (test-results/screens/fx-*.png).
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

async function ready(page: Page): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
}

async function shot(page: Page, name: string): Promise<void> {
  await ready(page);
  await page.screenshot({ path: `${SCREENS}/fx-${name}.png` });
}

async function place(page: Page, v: { era: string; x: number; z: number; yaw: number; pitch?: number; lift?: number }): Promise<void> {
  await page.evaluate((v) => {
    const k = window.kq!;
    k.setEra(v.era as never);
    k.teleport(v.x, v.z, v.yaw, v.pitch ?? 0);
    k.step(2);
    if (v.lift) k.ctx.player.position.y += v.lift;
  }, v);
}

test.describe('fx', () => {
  // software WebGL: the point-cloud and fire scenes take a few seconds per frame
  test.describe.configure({ timeout: ciScale(300_000) });
  test.beforeEach(async ({ page }) => {
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq?.fx !== undefined, null, { timeout: 90_000 });
    await page.evaluate(() => window.kq!.fx!.quality('high'));
  });

  test('era shift: today → 1789, the palace rises out of the LiDAR ground', async ({ page }) => {
    const errors = trackErrors(page);
    // west of the Ehrenhof (bible anchor TF-01), looking east at where the Corps de logis stood
    await place(page, { era: 'today', x: 1150, z: -1118, yaw: 88, pitch: 4 });
    await shot(page, 'shift-0-before');
    const events: string[] = await page.evaluate(() => {
      const k = window.kq!;
      const log: string[] = [];
      (window as unknown as { __fxlog: string[] }).__fxlog = log;
      for (const e of ['shift:begin', 'shift:midpoint', 'shift:done'] as const) k.ctx.events.on(e, (p) => log.push(`${e}:${p.from}>${p.to}`));
      void k.fx!.shift('1789');
      k.fx!.shiftAt(0.01);
      return log.slice();
    });
    expect(events).toEqual(['shift:begin:today>1789']);
    for (const [t, name] of [
      [0.45, 'shift-1-wave'],
      [0.95, 'shift-2-dissolve'],
      [1.6, 'shift-3-void'],
      [2.25, 'shift-4-morph'],
      [2.55, 'shift-5-rise'],
      [2.85, 'shift-6-walls'],
      [3.25, 'shift-7-land'],
    ] as const) {
      await page.evaluate((t) => window.kq!.fx!.shiftAt(t), t);
      await shot(page, name);
    }
    const st = await page.evaluate(() => {
      const k = window.kq!;
      k.fx!.shiftAt(3.6);
      return { era: k.state().era, log: (window as unknown as { __fxlog: string[] }).__fxlog, shifts: k.state().meta.shifts, active: k.fx!.state().shift.active };
    });
    expect(st.era).toBe('1789');
    expect(st.log).toEqual(['shift:begin:today>1789', 'shift:midpoint:today>1789', 'shift:done:today>1789']);
    expect(st.shifts).toBe(1);
    expect(st.active).toBe(false);
    await shot(page, 'shift-8-after');
    expect(errors).toEqual([]);
  });

  test('era shift: 1789 → 1796 seen from the air, instant and reduced-motion variants', async ({ page }) => {
    const errors = trackErrors(page);
    await place(page, { era: '1789', x: 1110, z: -1190, yaw: 62, pitch: -16, lift: 45 });
    await page.evaluate(() => {
      const k = window.kq!;
      void k.fx!.shift('1796');
      k.fx!.shiftAt(1.2);
    });
    await shot(page, 'shift-air-cloud');
    await page.evaluate(() => {
      const k = window.kq!;
      k.fx!.shiftAt(2.7);
      // the midpoint re-grounds the player: lift the camera again
      for (let i = 0; i < 2; i++) {
        k.ctx.player.position.y = k.ctx.world.heightAt(1110, -1190) + 45;
        k.step(1);
      }
    });
    await shot(page, 'shift-air-ruin');
    const r = await page.evaluate(async () => {
      const k = window.kq!;
      k.fx!.shiftAt(4);
      const log: string[] = [];
      for (const e of ['shift:begin', 'shift:midpoint', 'shift:done'] as const) k.ctx.events.on(e, () => log.push(e));
      // instant: no effect, all three events at once
      k.ctx.events.emit('shift:request', { to: 'today', instant: true });
      const instant = { era: k.state().era, log: log.slice() };
      // reduced motion: a short crossfade
      log.length = 0;
      void k.fx!.shift('1789', { reduced: true });
      k.fx!.shiftAt(0.6);
      const mid = { era: k.state().era, log: log.slice() };
      k.fx!.shiftAt(2);
      return { instant, mid, end: { era: k.state().era, log: log.slice() } };
    });
    expect(r.instant).toEqual({ era: 'today', log: ['shift:begin', 'shift:midpoint', 'shift:done'] });
    expect(r.mid).toEqual({ era: 'today', log: ['shift:begin'] });
    expect(r.end).toEqual({ era: '1789', log: ['shift:begin', 'shift:midpoint', 'shift:done'] });
    expect(errors).toEqual([]);
  });

  test('Q shifts only when the story allows it', async ({ page }) => {
    const r = await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('today');
      const reqs: string[] = [];
      k.ctx.events.on('shift:request', (p) => reqs.push(p.to));
      k.press('KeyQ');
      const before = reqs.length;
      k.ctx.state.mutable.flags['shift.allowed'] = true;
      k.ctx.state.mutable.flags['shift.target'] = '1789';
      k.press('KeyQ');
      const st = k.fx!.state().shift;
      k.fx!.shiftAt(5);
      return { before, reqs, active: st.active, to: st.to, era: k.state().era };
    });
    expect(r.before).toBe(0);
    expect(r.reqs).toEqual(['1789']);
    expect(r.active).toBe(true);
    expect(r.era).toBe('1789');
  });

  test('scan pulse runs over the relief', async ({ page }) => {
    const errors = trackErrors(page);
    await place(page, { era: 'today', x: 1150, z: -1050, yaw: 120, pitch: -14 });
    await page.evaluate(() => {
      const k = window.kq!;
      k.setScanMode(2);
      k.fx!.pulse(2, 0.75);
    });
    await shot(page, 'pulse-relief');
    await place(page, { era: 'today', x: 1100, z: -1050, yaw: 110, pitch: -38, lift: 60 });
    await page.evaluate(() => {
      const k = window.kq!;
      k.ctx.player.setFlying(true);
      k.ctx.player.position.y = k.ctx.world.heightAt(1100, -1050) + 60;
      k.setScanMode(3);
      k.fx!.pulse(3, 0.9);
    });
    await shot(page, 'pulse-air');
    expect(errors).toEqual([]);
  });

  test('fire: the palace burns, rooms follow the schedule, smoke catches the player', async ({ page }) => {
    const errors = trackErrors(page);
    await place(page, { era: '1793-07', x: 1125, z: -1120, yaw: 90, pitch: 3 });
    const rooms = await page.evaluate(() => {
      const k = window.kq!;
      const seen: Record<string, string> = {};
      k.ctx.events.on('fire:room', (p) => (seen[p.roomId] = p.state));
      const prog: number[] = [];
      k.ctx.events.on('fire:progress', (p) => prog.push(p.t));
      k.ctx.events.emit('threat:configure', { kind: 'fire', active: true, seconds: 300 });
      k.step(2);
      const at0 = Object.keys(seen).length;
      k.fx!.fireTime(150);
      k.step(2);
      return { at0, at150: Object.entries(seen).filter(([, s]) => s === 'burning' || s === 'collapsed').length, prog: prog.length, st: k.fx!.state().fire };
    });
    expect(rooms.at0).toBeGreaterThan(0);
    expect(rooms.at150).toBeGreaterThan(20);
    expect(rooms.prog).toBeGreaterThan(1);
    expect(rooms.st.active).toBe(true);
    await page.evaluate(() => {
      const k = window.kq!;
      k.fx!.fireTime(40);
      k.step(30);
    });
    await shot(page, 'fire-1-start');
    await page.evaluate(() => {
      const k = window.kq!;
      k.fx!.fireTime(175);
      k.step(30);
    });
    await shot(page, 'fire-2-blaze');
    // close: the Ehrenhof between the burning wings
    await place(page, { era: '1793-07', x: 1222, z: -1122, yaw: 80, pitch: 12 });
    await page.evaluate(() => window.kq!.step(20));
    await shot(page, 'fire-3-ehrenhof');
    // the whole palace from above the gardens
    await place(page, { era: '1793-07', x: 1100, z: -1000, yaw: 50, pitch: -15, lift: 60 });
    await page.evaluate(() => {
      const k = window.kq!;
      k.fx!.fireTime(270);
      k.step(30);
      k.ctx.player.position.y = k.ctx.world.heightAt(1100, -1000) + 60;
      k.step(1);
      k.ctx.player.position.y = k.ctx.world.heightAt(1100, -1000) + 60;
    });
    await shot(page, 'fire-4-air');
    // smoke: stand inside the burning Corps de logis until the smoke throws you back
    const caught = await page.evaluate(() => {
      const k = window.kq!;
      const by: string[] = [];
      k.ctx.events.on('player:caught', (p) => by.push(p.by));
      k.fx!.fireTime(60);
      k.ctx.world.collider.enabled = false;
      k.teleport(1262, -1126, 90, 0);
      for (let i = 0; i < 6 && by.length === 0; i++) k.step(600);
      return { by, smoke: k.fx!.state().fire.smoke };
    });
    await shot(page, 'fire-5-smoke');
    expect(caught.by).toEqual(['fire']);
    // leaving the era puts the fire out
    const off = await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('today');
      return k.fx!.state().fire.active;
    });
    expect(off).toBe(false);
    expect(errors).toEqual([]);
  });

  test('Steinfraß: the ruin dissolves, the grey closes in, oblivion catches the player', async ({ page }) => {
    const errors = trackErrors(page);
    await place(page, { era: '1796', x: 1200, z: -1112, yaw: 92, pitch: 2 });
    await page.evaluate(() => {
      const k = window.kq!;
      k.ctx.events.emit('threat:configure', { kind: 'oblivion', active: true, seconds: 120 });
      k.fx!.oblivionT(0.3);
      k.step(60);
    });
    await shot(page, 'oblivion-1');
    await page.evaluate(() => {
      const k = window.kq!;
      k.fx!.oblivionT(0.72);
      k.step(90);
    });
    await shot(page, 'oblivion-2');
    const r = await page.evaluate(() => {
      const k = window.kq!;
      const by: string[] = [];
      const prog: number[] = [];
      k.ctx.events.on('player:caught', (p) => by.push(p.by));
      k.ctx.events.on('oblivion:progress', (p) => prog.push(p.t));
      k.fx!.oblivionT(0.9);
      k.ctx.events.emit('clue:found', { id: 'x', kind: 'object' });
      const afterClue = k.fx!.state().oblivion.t;
      for (let i = 0; i < 8 && by.length === 0; i++) k.step(450);
      return { by, afterClue, prog: prog.length };
    });
    expect(r.afterClue).toBeLessThan(0.8);
    expect(r.by).toEqual(['oblivion']);
    expect(r.prog).toBeGreaterThan(3);
    expect(errors).toEqual([]);
  });

  test('era ambience: snow, fireflies, mist', async ({ page }) => {
    const errors = trackErrors(page);
    await place(page, { era: '1793-02', x: 1138, z: -1120, yaw: 90, pitch: 2 });
    await page.evaluate(() => window.kq!.step(30));
    await shot(page, 'ambient-snow');
    await place(page, { era: '1789', x: 1300, z: -1000, yaw: 250, pitch: -3 });
    await page.evaluate(() => window.kq!.step(30));
    await shot(page, 'ambient-1789');
    await place(page, { era: 'today', x: 1240, z: -1060, yaw: 250, pitch: -4 });
    await page.evaluate(() => window.kq!.step(30));
    await shot(page, 'ambient-mist');
    expect(errors).toEqual([]);
  });
});
