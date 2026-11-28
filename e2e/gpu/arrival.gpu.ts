import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { QUELLE } from '../../src/systems/quelle/layout';
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
  const spot = { ...HOME.spawn, wx: QUELLE.x, wz: QUELLE.z };
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
      // in front of the trough, facing the water
      k.teleport(spot.x, spot.z, spot.yaw, -10);
      k.ctx.player.yaw = Math.atan2(-(spot.wx - spot.x), -(spot.wz - spot.z));
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
