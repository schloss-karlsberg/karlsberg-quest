import { expect, test } from '@playwright/test';
import { trackErrors } from './helpers/common';
import { QUELLE_STAND, flag, holdHome, newGame, qn, qs, story, until, untilQuest } from './helpers/prolog';
import { PIECES, REACH, toLocal, toWorld, touchLocal } from '../src/systems/quelle/layout';

/**
 * The Karlsbergquelle starts the first time travel (NEXT-SESSION §3.6, prologue beats p3q / p3r,
 * src/systems/quelle): a new game jumps to p3q; before the trough, facing the water, "E Wasser
 * berühren"; the touch scene runs on game time (`?manual` stepping): the dip, the moment standing
 * still (magic and freeze rise), the brook running back, the touch at 2.7 s; the story shifts to
 * 1789 (beat p3r) and the player stays held until the shift is done; hold Q: today, beat p4.
 *
 * The fx transition runs on rendered frames (real time), so the test pins its clock with
 * `kq.fx.shiftAt` to look at the moments in between. Screenshot (for the record, no comparison):
 * the still moment, in this test's output folder.
 */
test.describe.configure({ timeout: 600_000 }); // software WebGL, a whole new game

test('Karlsbergquelle: E at the trough, the still moment, the shift to 1789, Q home', async ({ page }, info) => {
  const errors = trackErrors(page);
  await newGame(page, 'Mara');
  await page.evaluate(() => {
    const k = window.kq!;
    const log: string[] = [];
    (window as unknown as { __qlog: string[] }).__qlog = log;
    for (const n of ['quelle:dip', 'quelle:touch', 'shift:begin', 'era:change', 'shift:midpoint', 'shift:done'] as const)
      k.ctx.events.on(n, (p: unknown) => log.push(`${n}${n.startsWith('quelle') ? `:${(p as { era: string }).era}` : ''}`));
    k.story!.goto('prolog', 'p3q');
    k.ctx.ui.modals.closeAll();
    k.step(4);
  });
  const qlog = () => page.evaluate(() => (window as unknown as { __qlog: string[] }).__qlog.slice());
  const info0 = () => page.evaluate(() => window.kq!.quelle!.info());

  // ---- p3q: Laub hears the water; the call is on, the quest comes ---------------------------------
  expect((await story(page)).beat).toBe('p3q');
  expect(await flag(page, 'quelle.call')).toBe(true);
  expect(await flag(page, 'quelle.guide')).toBe(true);
  expect(await untilQuest(page, 'q.p.quelle', 'active', 20)).toBe('active');
  // far away (the prologue's old start by the forest road): nothing built, no prompt
  expect(await info0()).toMatchObject({ built: null, prompt: false, scene: null });

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
  // facing away (the spring's own front, compass 234): no
  expect((await at(QUELLE_STAND.x, QUELLE_STAND.z, QUELLE_STAND.yaw + 180)).prompt).toBe(false);
  // … and the hub at home keeps its E away from the trough while the spring calls (contract C4)
  expect(await page.evaluate(() => window.kq!.ctx.ui.hud.promptShown()?.owner ?? null)).not.toBe('hub');
  // on the slope behind the wall, turned to the water (+w = compass 234), within reach: no (the wall is between)
  const behind = await at(...toWorld(touchLocal('today')[0], PIECES.wall.w - PIECES.wall.thick - 0.45), 234);
  const [bu, bw] = toLocal(behind.x, behind.z);
  expect(bw).toBeLessThan(PIECES.wall.w - PIECES.wall.thick);
  expect(Math.hypot(bu - touchLocal('today')[0], bw - touchLocal('today')[1])).toBeLessThan(REACH);
  expect(behind.prompt).toBe(false);
  // before the trough, facing it: yes
  const front = await at(QUELLE_STAND.x, QUELLE_STAND.z, QUELLE_STAND.yaw);
  expect(front).toMatchObject({ prompt: true, built: 'today', look: 'today' });
  expect(Math.abs(front.dy)).toBeLessThan(2.5);
  await expect(page.locator('.kq-prompt')).toContainText('Wasser berühren');
  expect(await qn(page, 'q.p.quelle', 'quelle')).toBe(1); // the reach objective: you are there

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
  expect((await story(page)).beat).toBe('p3q');
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
  await page.screenshot({ path: info.outputPath('quelle-still-moment.png'), timeout: 90_000 });
  await page.evaluate(() => document.getElementById('quelle-hide')?.remove());

  // ---- the touch: the story shifts (p3q → p3r); the player stays held -----------------------------
  const touched = await page.evaluate(() => {
    const k = window.kq!;
    for (let j = 0; j < 120 && !k.fx!.state().shift.active; j++) k.step(2);
    // the transition runs on rendered frames: pin its clock before the midpoint
    k.fx!.shiftAt(1.0);
    return { shift: k.fx!.state().shift, beat: k.story!.state().beat, era: k.story!.state().era, frozen: k.ctx.player.frozen, scene: k.quelle!.info().scene };
  });
  expect(touched.shift).toMatchObject({ active: true, from: 'today', to: '1789' });
  expect(touched.beat).toBe('p3r');
  expect(touched.era).toBe('today');
  expect(touched.frozen).toBe(true);
  expect(touched.scene).toBeGreaterThanOrEqual(2.7);
  expect(await qlog()).toEqual(['quelle:dip:today', 'quelle:touch:today', 'shift:begin']);
  expect(await qn(page, 'q.p.quelle', 'beruehren')).toBe(1);
  expect(await flag(page, 'quelle.call')).toBeUndefined();

  // past the midpoint: 1789, still held (game time goes on, the shift is not done)
  const mid = await page.evaluate(() => {
    const k = window.kq!;
    k.fx!.shiftAt(2.2);
    k.step(30);
    return { era: k.story!.state().era, beat: k.story!.state().beat, frozen: k.ctx.player.frozen, scene: k.quelle!.info().scene, active: k.fx!.state().shift.active, built: k.quelle!.info().built };
  });
  expect(mid).toMatchObject({ era: '1789', beat: 'p3r', frozen: true, active: true, built: '1789' });
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
  expect(done).toMatchObject({ era: '1789', beat: 'p3r', frozen: false, look: false, scene: null, water: 'baroque' });
  expect(await qlog()).toEqual(['quelle:dip:today', 'quelle:touch:today', 'shift:begin', 'era:change', 'shift:midpoint', 'shift:done']);
  // the tracker follows: no stale „→ den Hang hinunter zur Karlsbergquelle“ line in 1789
  await expect(page.getByTestId('quest-tracker')).toContainText('Q gedrückt halten');
  await expect(page.getByTestId('quest-via')).toHaveCount(0);
  await expect(page.getByTestId('quest-tracker')).not.toContainText('Hang hinunter');
  // free to move in 1789 (a step back from the basin)
  const moved = await page.evaluate(() => {
    const k = window.kq!;
    const p0 = k.ctx.player.position.clone();
    k.press('KeyS', 30);
    return Math.hypot(k.ctx.player.position.x - p0.x, k.ctx.player.position.z - p0.z);
  });
  expect(moved).toBeGreaterThan(0.3);

  // ---- hold Q: today, the quest done, beat p4 -----------------------------------------------------
  await holdHome(page);
  expect((await story(page)).era).toBe('today');
  expect(await qn(page, 'q.p.quelle', 'heim')).toBe(1);
  expect(await untilQuest(page, 'q.p.quelle', 'done', 10)).toBe('done');
  expect(await until(page, 'p4', 10)).toBe('p4');
  expect(await qs(page, 'q.p.quelle')).toBe('done');
  expect(await page.evaluate(() => window.kq!.quelle!.info())).toMatchObject({ built: 'today', prompt: false, scene: null });
  expect(errors).toEqual([]);
});
