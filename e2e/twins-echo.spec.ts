/**
 * The Chronik echoes route Mannlich and the Duke through the twin hook (src/systems/npc/twins.ts
 * twinEcho). Until the authored twin models land the hook returns null, so both still render the
 * smoke silhouette: (a) Mannlich's Bauliste in the Pfeilersaal (k1), (b) the k2 Kabinett door
 * with the Duke seated at his desk.
 * Screenshots: test-results/screens/twins-echo-*.png
 */
import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { SCREENS } from './helpers/common';

mkdirSync(SCREENS, { recursive: true });
const IGNORED = [/GPU stall/i, /pointer ?lock/i, /WebGL.*(performance|ReadPixels)/i, /AudioContext was not allowed/i];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

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
  await page.evaluate(() => {
    document.querySelectorAll('[data-testid="story-card"]').forEach((e) => e.remove());
    window.kq!.step(2);
  });
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${SCREENS}/twins-echo-${name}.png`, timeout: ciScale(150_000) });
}

/** The figures on the echo stage: smoke silhouettes are Points groups, a twin would be an npc-* figure. */
async function stageFigures(page: Page): Promise<{ name: string; smoke: boolean; y: number }[]> {
  return page.evaluate(() => {
    const g = window.kq!.ctx.scene.getObjectByName('chronik-echo');
    return (g?.children ?? [])
      .filter((c) => c.type === 'Group')
      .map((c) => ({ name: c.name, smoke: c.children.some((m) => (m as unknown as { isPoints?: boolean }).isPoints === true), y: c.position.y }));
  });
}

test.describe('Chronik echoes: the twin hook keeps the smoke silhouette', () => {
  test.describe.configure({ timeout: ciScale(600_000) });
  test.beforeEach(async ({ page }) => {
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => !!window.kq?.story && !!window.kq?.chronik && !!(window.kq as Any)?.stage, null, { timeout: 180_000 });
  });

  test('k1: Mannlich in the Pfeilersaal is still the smoke figure', async ({ page }) => {
    const errors = trackErrors(page);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.ctx.state.mutable.flags['barks.quiet'] = true;
      k.story.start('Alex');
      k.story.goto('k1', 'k1_5');
      k.step(4);
      k.story.flush?.();
      k.ctx.ui.modals.closeAll();
      if (k.ctx.era.current !== '1789') k.setEra('1789');
      // the clue is at 1245.4 / −958.5 (B10.1 Pfeilersaal); look south at it
      k.teleport(1245.5, -965, 180, -3);
      k.step(6);
    });
    expect(await page.evaluate(() => window.kq!.chronik!.listen('clue.k1.mannlich'))).toBe(true);
    await page.evaluate(() => {
      window.kq!.chronik!.advanceEcho(3.5);
      window.kq!.step(2);
    });
    const figs = await stageFigures(page);
    expect(figs).toHaveLength(1);
    expect(figs.every((f) => f.smoke && !f.name.startsWith('npc-'))).toBe(true);
    await shot(page, 'k1-mannlich');
    await page.evaluate(() => {
      window.kq!.chronik!.advanceEcho(240);
      window.kq!.step(2);
      window.kq!.ctx.ui.modals.closeAll();
    });
    // the memory is over: the figure is gone with the stage
    expect(await stageFigures(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('k2: the seated Duke at the Kabinett desk is still the smoke figure', async ({ page }) => {
    const errors = trackErrors(page);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.ctx.state.mutable.flags['barks.quiet'] = true;
      k.story.start('Alex');
      k.story.goto('k2', 'k2_5');
      k.step(4);
      if (k.ctx.era.current !== '1793-02') k.setEra('1793-02');
      k.teleport(1268, -1113.5, 0, 0);
      k.step(4);
      k.story.flush?.();
      k.ctx.ui.modals.closeAll();
      k.press('KeyE', 70);
    });
    expect(await page.evaluate(() => window.kq!.chronik!.echo().id)).toBe('clue.k2.warnung');
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.chronik.advanceEcho(1.2);
      k.stage.advance(1.2);
      k.step(2);
    });
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.chronik.advanceEcho(3.0);
      k.stage.advance(3.0);
      k.step(2);
    });
    const figs = await stageFigures(page);
    // the Duke, Schügens, Rose, Pfeffel: all smoke figures (no twin, no servant figure)
    expect(figs.length).toBeGreaterThanOrEqual(2);
    expect(figs.every((f) => f.smoke && !f.name.startsWith('npc-'))).toBe(true);
    const py = await page.evaluate(() => window.kq!.ctx.player.position.y);
    // seated: the director lowers the Duke by the seat height (0.42) below the storey floor
    expect(figs.some((f) => Math.abs(f.y - (py - 0.42)) < 0.01)).toBe(true);
    await shot(page, 'k2-herzog-sitzt');
    // the other crack: the Duke from the side
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.ctx.input.simulate('KeyD', true);
      k.stage.advance(0.1);
      k.ctx.input.simulate('KeyD', false);
      k.stage.advance(1.2);
      k.step(2);
    });
    await shot(page, 'k2-herzog-sitzt-rechts');
    expect(errors).toEqual([]);
  });
});
