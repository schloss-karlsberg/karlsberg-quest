import { expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { trackErrors } from './helpers/common';
import { boot } from './helpers/k1';
import { QUELLE_STAND, flag, holdHome, story } from './helpers/prolog';
import { PIECES, QUELLE, REACH, toLocal, toWorld, touchLocal } from '../src/systems/quelle/layout';
import { HOME } from '../src/systems/story/hub/home';

/**
 * At the tour's break (t17), E at the trough triggers the touch scene on game time. It is the one
 * touch of the game: after the shift to 1789 the player can move again, the tour hands over to
 * „Der Hof“ right there, and holding Q returns to the spring, where the water asks for nothing more.
 *
 * The fx transition runs on rendered frames (real time), so the test pins its clock with
 * `kq.fx.shiftAt` to look at the moments in between. Screenshot (for the record, no comparison):
 * the still moment, in this test's output folder.
 */
test.describe.configure({ timeout: ciScale(600_000) }); // software WebGL, a whole new game

test('Karlsbergquelle: E at the trough, the still moment, the one shift to 1789, Q home', async ({ page }, info) => {
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    const log: string[] = [];
    (window as unknown as { __qlog: string[] }).__qlog = log;
    for (const n of ['quelle:dip', 'quelle:touch', 'shift:begin', 'era:change', 'shift:midpoint', 'shift:done'] as const)
      k.ctx.events.on(n, (p: unknown) => log.push(`${n}${n.startsWith('quelle') ? `:${(p as { era: string }).era}` : ''}`));
    k.story!.flush();
    k.ctx.ui.modals.closeAll();
    // the break at the spring: the Bussole is found, Laub leads to the water
    k.story!.goto('tour', 't17');
    k.teleport(760, -902, 0);
    k.step(4);
  });
  const qlog = () => page.evaluate(() => (window as unknown as { __qlog: string[] }).__qlog.slice());
  const info0 = () => page.evaluate(() => window.kq!.quelle!.info());
  for (let i = 0; i < 60 && !(await flag(page, 'quelle.call')); i++) await page.evaluate(() => (window.kq!.story!.finishTyping(), window.kq!.step(60)));

  // ---- The spring calls. -----------------------------------------------------------------
  expect(await story(page)).toMatchObject({ chapter: 'tour', beat: 't17', era: 'today' });
  expect(await flag(page, 'quelle.call')).toBe(true);
  expect(await flag(page, 'quelle.guide')).toBe(true);
  await page.evaluate(() => {
    (window as unknown as { __qlog: string[] }).__qlog.length = 0;
  });
  // Far from the spring, nothing is built and there is no prompt.
  expect(await info0()).toMatchObject({ prompt: false, scene: null });

  // ---- the prompt: only in front of the trough, facing the water --------------------------------
  const at = (x: number, z: number, yaw: number) =>
    page.evaluate(
      ([x, z, yaw]) => {
        const k = window.kq!;
        (window as unknown as { __cna: { tidy(): void } }).__cna.tidy();
        k.teleport(x, z, yaw, -14);
        k.step(6);
        const i = k.quelle!.info();
        const p = k.ctx.player.position;
        return { prompt: i.prompt, built: i.built, look: i.water?.look ?? null, dy: p.y - (i.water?.y ?? 0), x: p.x, z: p.z };
      },
      [x, z, yaw] as const,
    );
  // facing away (the way the spring's own front looks): no
  expect((await at(QUELLE_STAND.x, QUELLE_STAND.z, QUELLE_STAND.yaw + 180)).prompt).toBe(false);
  // Pressing E while facing away leaves the world view in place.
  await page.evaluate(() => window.kq!.press('KeyE', 2));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // on the slope behind the wall, turned to the water (+w = the spring's facing), within reach: no (the wall is between)
  const behind = await at(...toWorld(touchLocal('today')[0], PIECES.wall.w - PIECES.wall.thick - 0.45), QUELLE.facing);
  const [bu, bw] = toLocal(behind.x, behind.z);
  expect(bw).toBeLessThan(PIECES.wall.w - PIECES.wall.thick);
  expect(Math.hypot(bu - touchLocal('today')[0], bw - touchLocal('today')[1])).toBeLessThan(REACH);
  expect(behind.prompt).toBe(false);
  // before the trough, facing it: yes
  const front = await at(QUELLE_STAND.x, QUELLE_STAND.z, QUELLE_STAND.yaw);
  expect(front).toMatchObject({ prompt: true, built: 'today', look: 'today' });
  expect(Math.abs(front.dy)).toBeLessThan(2.5);
  await expect(page.locator('.kq-prompt')).toContainText('Wasser berühren');

  // ---- E: the touch scene, on game time ---------------------------------------------------------
  const samples = await page.evaluate(() => {
    const k = window.kq!;
    k.press('KeyE', 2);
    const out: { t: number; magic: number; freeze: number; flow: number; frozen: boolean; prompt: boolean }[] = [];
    // to just before the touch (2.7 s): a sample every 0.25 s
    for (let j = 0; j < 40; j++) {
      const i = k.quelle!.info();
      out.push({ t: i.scene ?? -1, magic: i.magic, freeze: i.freeze, flow: i.flow, frozen: k.ctx.player.frozen, prompt: i.prompt });
      if ((i.scene ?? 0) > 2.45) break;
      k.step(15);
    }
    return out;
  });
  console.log('[quelle] scene:', samples.map((s) => `${s.t.toFixed(2)} m${s.magic.toFixed(2)} f${s.freeze.toFixed(2)} q${s.flow.toFixed(2)}`).join(' | '));
  expect(samples[0]!.t).toBeGreaterThan(0); // E started it
  for (let j = 1; j < samples.length; j++) expect(samples[j]!.t).toBeGreaterThan(samples[j - 1]!.t);
  expect(samples.every((s) => s.frozen && !s.prompt)).toBe(true);
  const at15 = samples.find((s) => s.t >= 1.5)!;
  const last = samples[samples.length - 1]!;
  expect(samples[0]!.magic).toBeLessThan(0.1);
  expect(samples[0]!.freeze).toBeLessThan(0.1);
  expect(at15.magic).toBeGreaterThan(0.5);
  expect(last.magic).toBeGreaterThan(0.8);
  expect(last.freeze).toBeGreaterThan(0.8);
  expect(last.flow).toBeLessThan(0); // the brook runs backwards
  expect(await qlog()).toEqual(['quelle:dip:today']);
  expect((await story(page)).beat).toBe('t17');
  expect(await page.evaluate(() => window.kq!.story!.state().era)).toBe('today');
  // the still moment: for the record (the chapter title card runs out on rendered frames, which
  // `?manual` stepping barely produces: out of the picture, as in helpers/prolog.ts cna())
  await page.evaluate(() => {
    window.kq!.story!.finishTyping();
    const st = document.createElement('style');
    st.id = 'quelle-hide';
    st.textContent = '.kqs-card { visibility: hidden !important; }';
    document.head.append(st);
  });
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: info.outputPath('quelle-still-moment.png'), timeout: ciScale(90_000) });
  await page.evaluate(() => document.getElementById('quelle-hide')?.remove());

  // ---- the touch: the story shifts (t17 → t18); the player stays held -------------------------------
  const touched = await page.evaluate(() => {
    const k = window.kq!;
    for (let j = 0; j < 120 && !k.fx!.state().shift.active; j++) k.step(2);
    // the transition runs on rendered frames: pin its clock before the midpoint
    k.fx!.shiftAt(1.0);
    return { shift: k.fx!.state().shift, beat: k.story!.state().beat, era: k.story!.state().era, frozen: k.ctx.player.frozen, scene: k.quelle!.info().scene };
  });
  expect(touched.shift).toMatchObject({ active: true, from: 'today', to: '1789' });
  expect(touched.beat).toBe('t18');
  expect(touched.era).toBe('today');
  expect(touched.frozen).toBe(true);
  expect(touched.scene).toBeGreaterThanOrEqual(2.7);
  expect(await qlog()).toEqual(['quelle:dip:today', 'quelle:touch:today', 'shift:begin']);
  expect(await flag(page, 'quelle.call')).toBeUndefined();

  // past the midpoint: 1789, still held (game time goes on, the shift is not done)
  const mid = await page.evaluate(() => {
    const k = window.kq!;
    k.fx!.shiftAt(2.2);
    k.step(30);
    return { era: k.story!.state().era, beat: k.story!.state().beat, frozen: k.ctx.player.frozen, scene: k.quelle!.info().scene, active: k.fx!.state().shift.active, built: k.quelle!.info().built };
  });
  expect(mid).toMatchObject({ era: '1789', beat: 't18', frozen: true, active: true, built: '1789' });
  expect(mid.scene).not.toBeNull();
  // the shift is done: let go
  const done = await page.evaluate(() => {
    const k = window.kq!;
    k.fx!.shiftAt(3.6);
    k.fx!.freeze(false);
    k.step(6);
    const i = k.quelle!.info();
    return { era: k.story!.state().era, beat: k.story!.state().beat, frozen: k.ctx.player.frozen, look: k.ctx.player.lookLocked, scene: i.scene, water: i.water?.look ?? null };
  });
  expect(done).toMatchObject({ era: '1789', beat: 't18', frozen: false, look: false, scene: null, water: 'baroque' });
  expect(await qlog()).toEqual(['quelle:dip:today', 'quelle:touch:today', 'shift:begin', 'era:change', 'shift:midpoint', 'shift:done']);
  // free to move in 1789 as soon as the shift is done, while Laub still talks (a step back from the basin)
  const moved = await page.evaluate(() => {
    const k = window.kq!;
    const p0 = k.ctx.player.position.clone();
    k.press('KeyS', 30);
    return Math.hypot(k.ctx.player.position.x - p0.x, k.ctx.player.position.z - p0.z);
  });
  expect(moved).toBeGreaterThan(0.3);
  // the arrival lines, then „Der Hof“ begins where the player stands: no way back, no second touch
  for (let i = 0; i < 80 && (await story(page)).beat !== 'k1_0b'; i++) await page.evaluate(() => (window.kq!.story!.finishTyping(), window.kq!.step(60)));
  expect(await story(page)).toMatchObject({ chapter: 'k1', beat: 'k1_0b', era: '1789' });
  expect(await qlog()).toEqual(['quelle:dip:today', 'quelle:touch:today', 'shift:begin', 'era:change', 'shift:midpoint', 'shift:done']);
  await page.evaluate(() => {
    window.kq!.story!.flush();
    window.kq!.step(30);
  });
  await expect(page.getByTestId('objective')).toContainText('Bleiche');
  await expect(page.getByTestId('quest-tracker')).not.toContainText('das Wasser berühren');
  expect(await info0()).toMatchObject({ built: '1789', prompt: false, scene: null });

  // Hold Q to return home. The K1 objective points back to the spring's anchor.
  await holdHome(page);
  expect(await story(page)).toMatchObject({ era: 'today', beat: 'k1_0b', objective: { id: 'k1.zurueck-q' } });
  const home = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
  expect(Math.hypot(home.x - HOME.spawn.x, home.z - HOME.spawn.z)).toBeLessThan(1);
  expect(await page.evaluate(() => window.kq!.quelle!.info())).toMatchObject({ built: 'today', prompt: false, scene: null });
  expect((await story(page)).inHub).toBe(true);
  expect(errors).toEqual([]);
});

test('the title backdrop of a save that rests at home shows the spring (TASK-087)', async ({ page }) => {
  const errors = trackErrors(page);
  // the title holds the fixed steps: the home set and its water are built per frame there
  await page.goto(`./?nosave&fresh&x=${QUELLE_STAND.x}&z=${QUELLE_STAND.z}`);
  await expect(page.getByTestId('title-new')).toBeEnabled({ timeout: ciScale(120_000) });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const k = window.kq;
          return { title: !!k?.ctx.pause.reasons.has('title'), sets: k?.scenery?.built() ?? [], water: k?.quelle?.info().visible ?? false, look: k?.quelle?.info().water?.look ?? null };
        }),
      { timeout: ciScale(60_000) },
    )
    .toEqual({ title: true, sets: ['karlsbergquelle'], water: true, look: 'today' });
  expect(errors).toEqual([]);
});
