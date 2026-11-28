import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { QUELLE, toWorld, touchLocal } from '../../src/systems/quelle/layout';
import { HOME } from '../../src/systems/story/hub/home';

/**
 * Real-GPU frame strip of the one time travel (TASK-089) for the owner: the touch at the trough,
 * the shift, the arrival in 1789 with the player free to move, the hand-over into „Der Hof“ (the
 * chapter card, the level card, the toasts) and Laub's first lines there. It runs in real time
 * (no `?manual`), so cards, toasts and the transition take the time a player sees.
 * Out: test-results/gpu/arrival-<nn>.png (one frame every 1.5 s from the touch) and
 * test-results/gpu/arrival.json (per frame: time, era, beat, the card on the slot, the line).
 * A contact sheet: ffmpeg -i test-results/gpu/arrival-%02d.png -vf "scale=640:-1,tile=4x6" strip-%d.png
 */
const OUT = 'test-results/gpu';
mkdirSync(OUT, { recursive: true });
test.describe.configure({ timeout: 600_000 });

test('gpu: the touch, the arrival in 1789 and the first lines of „Der Hof“', async ({ page }) => {
  const query = process.env.ARRIVAL_QUERY ?? 'notitle&nosave&fresh&q=high';
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`./?${query}`);
  await page.waitForFunction(() => !!window.kq?.story && !!window.kq.quelle && !!window.kq.fx, null, { timeout: 180_000 });
  // the hand reaches the water at the layout's touch point; the story's objective marks where to stand
  const [wx, wz] = toWorld(...touchLocal('today'));
  const spot = { ...HOME.spawn, wx, wz };
  await page.evaluate((spot) => {
    const k = window.kq!;
    k.ctx.state.mutable.flags['barks.quiet'] = true;
    k.story!.start('Mara');
    k.story!.goto('tour', 't17');
    k.teleport(spot.x, spot.z, spot.yaw, -10);
  }, spot);
  // Laub's introduction (about a minute in real time), then the trough offers the touch
  await page.waitForFunction((spot) => {
    const k = window.kq!;
    if (!k.state().flags['quelle.call']) return false;
    if (!k.quelle!.info().prompt) {
      // in front of the trough (the objective's marker), facing the water
      const o = k.story!.state().objective;
      const x = o?.x ?? spot.x;
      const z = o?.z ?? spot.z;
      k.teleport(x, z, spot.yaw, -10);
      k.ctx.player.yaw = Math.atan2(-(spot.wx - x), -(spot.wz - z));
    }
    return k.quelle!.info().prompt;
  }, spot, { timeout: 150_000, polling: 500 });
  await page.screenshot({ path: `${OUT}/arrival-00.png` });
  const t0 = Date.now();
  await page.evaluate(() => {
    const input = window.kq!.ctx.input;
    input.simulate('KeyE', true);
    window.setTimeout(() => input.simulate('KeyE', false), 120);
  });
  const log: unknown[] = [];
  let walked = false;
  for (let i = 1; i <= 48; i++) {
    await page.waitForTimeout(Math.max(0, t0 + i * 1500 - Date.now()));
    const state = await page.evaluate(() => {
      const k = window.kq!;
      const s = k.story!.state();
      const p = k.ctx.player.position;
      return {
        era: s.era, chapter: s.chapter, beat: s.beat, line: s.dialogue?.id ?? null, objective: s.objective?.text ?? null,
        card: k.ctx.ui.cards.showing, held: k.ctx.ui.cards.holdReasons(), frozen: k.ctx.player.frozen,
        x: +p.x.toFixed(1), z: +p.z.toFixed(1),
        chapterCard: !!document.querySelector('.kqs-card.kqs-show'), fade: document.querySelector<HTMLElement>('[data-testid="story-fade"]')?.dataset['to'] ?? null,
      };
    });
    log.push({ t: +((Date.now() - t0) / 1000).toFixed(1), ...state });
    await page.screenshot({ path: `${OUT}/arrival-${String(i).padStart(2, '0')}.png` });
    // once the shift is done the player may walk: a few steps back from the basin while Laub talks
    if (!walked && state.era === '1789' && !state.frozen) {
      walked = true;
      await page.evaluate(() => {
        const input = window.kq!.ctx.input;
        input.simulate('KeyS', true);
        window.setTimeout(() => input.simulate('KeyS', false), 1200);
      });
    }
  }
  writeFileSync(`${OUT}/arrival.json`, JSON.stringify(log, null, 1));
  const end = await page.evaluate(() => window.kq!.story!.state());
  // one journey: still in 1789, in „Der Hof“, never faded to black
  expect(end).toMatchObject({ chapter: 'k1', era: '1789' });
  expect((log as { fade: string | null }[]).some((f) => f.fade === '1')).toBe(false);
  expect((log as { era: string; t: number }[]).filter((f) => f.t > 8).every((f) => f.era === '1789')).toBe(true);
});

/**
 * Stills of the way on from the arrival, for a look after the spring moves (TASK-087): the 1789
 * fountain from the trail, the first objective seen from the spring, the Bleiche with the marker on
 * the coat, and the walk up towards the gate. `?manual`, placed with the debug hooks.
 * Out: test-results/gpu/arrival-weg-<n>-<name>.png.
 */
test('gpu: from the spring in 1789 to the Bleiche and towards the gate', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./?notitle&nosave&fresh&manual&q=high');
  await page.waitForFunction(() => !!window.kq?.story && !!window.kq.quelle && !!window.kq.fx && !!window.kq.npc, null, { timeout: 180_000 });
  await page.addStyleTag({ content: '.kq-bullet-time { display: none !important; }' });
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.state.mutable.flags['barks.quiet'] = true;
    k.story!.start('Mara');
    k.skills!.grant('relief', 3, true);
    k.skills!.grant('kartograf', 1, true);
    k.story!.goto('k1');
    k.setEra('1789');
    // as a player gets there: the card runs out on game time, Laub's two lines, then the quests.
    // (No `flush()` here: it runs the timeline under the card. And `?manual` steps game time far
    // ahead of the card's fade, which is CSS on real time: the wait below lets the card leave the
    // picture, or a still shows it under a quest banner that no player ever sees with it.)
    for (let i = 0; i < 400 && k.story!.state().beat !== 'k1_0b'; i++) {
      k.story!.finishTyping();
      k.step(30);
    }
    for (let i = 0; i < 40; i++) {
      k.story!.finishTyping();
      k.step(30);
    }
    k.ctx.ui.modals.closeAll();
    k.step(120);
  });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.kq!.step(240));
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.kq!.story!.state())).toMatchObject({ chapter: 'k1', beat: 'k1_0b', era: '1789', objective: { id: 'k1.rock' } });
  expect(await page.evaluate(() => !!document.querySelector('.kqs-card')), 'the chapter card has left the picture').toBe(false);
  const objective = await page.evaluate(() => window.kq!.story!.state().objective!);
  const toward = (x: number, z: number, tx: number, tz: number) => (Math.atan2(tx - x, -(tz - z)) * 180) / Math.PI;
  const back = { x: HOME.spawn.x + (HOME.spawn.x - QUELLE.x) * 4, z: HOME.spawn.z + (HOME.spawn.z - QUELLE.z) * 4 };
  const views: { name: string; x: number; z: number; yaw: number; pitch: number }[] = [
    // the fountain, seen from a few steps before the trough stand
    { name: '1-brunnenstube', ...back, yaw: toward(back.x, back.z, QUELLE.x, QUELLE.z), pitch: -4 },
    // standing at the trough stand, turned to the first objective
    { name: '2-ziel-von-der-quelle', x: HOME.spawn.x, z: HOME.spawn.z, yaw: toward(HOME.spawn.x, HOME.spawn.z, objective.x!, objective.z!), pitch: -3 },
    // half way down the trail
    { name: '3-weg-zur-bleiche', x: 1035.7, z: -855.1, yaw: toward(1035.7, -855.1, objective.x!, objective.z!), pitch: -4 },
    // before the green: Liese, the lines, the marker on the coat
    { name: '4-bleiche', x: 1013.9, z: -867.5, yaw: toward(1013.9, -867.5, objective.x!, objective.z!), pitch: -5 },
    // the walk up: from the trail west of the Orangerie towards the gate
    { name: '5-zum-gitter', x: 1150, z: -920, yaw: toward(1150, -920, 1191, -1113), pitch: 2 },
    { name: '6-vor-dem-gitter', x: 1172, z: -1085, yaw: toward(1172, -1085, 1191, -1113), pitch: 0 },
  ];
  for (const v of views) {
    await page.evaluate((v) => {
      const k = window.kq!;
      k.teleport(v.x, v.z, v.yaw, v.pitch);
      k.step(30);
    }, v);
    await page.waitForTimeout(600);
    await page.evaluate(() => window.kq!.screenshotReady());
    await page.screenshot({ path: `${OUT}/arrival-weg-${v.name}.png` });
  }
  // nobody stands at the spring
  const nearest = await page.evaluate((s) => Math.min(...window.kq!.npc!.list().map((n) => Math.hypot(n.x - s.x, n.z - s.z))), HOME.spawn);
  expect(nearest).toBeGreaterThan(40);
});
