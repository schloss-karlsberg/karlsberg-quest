import { readFileSync, writeFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { SCREENS, trackErrors } from './helpers/common';

/**
 * docs/NEXT-SESSION.md §3.3 / §3.4: F8 feedback notes (IndexedDB, pause-menu export / delete,
 * passive telemetry) and arrow-key turning (← / → turn, ↑ / ↓ walk, Bild↑ / Bild↓ tilt).
 */
async function boot(page: Page): Promise<void> {
  await page.goto('./?notitle&nosave&fresh&manual');
  await page.waitForFunction(() => window.kq?.notes !== undefined && window.kq?.quests !== undefined, null, { timeout: 120_000 });
  await page.addStyleTag({ content: '[data-testid="dialogue"]{display:none!important}' });
  // a clean IndexedDB for this run
  await page.evaluate(() => window.kq!.notes!.clear());
}

test.describe('F8 notes and arrow-key turning', () => {
  test.describe.configure({ timeout: ciScale(240_000) });

  test('arrow keys turn the view (third and first person), PageUp / PageDown tilt, A / D still strafe', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    const turn = (code: string, steps = 30) =>
      page.evaluate(
        ({ code, steps }) => {
          const k = window.kq!;
          const p = k.ctx.player;
          k.teleport(1138, -1120, 90, 0);
          k.step(2);
          const y0 = p.yaw;
          const pi0 = p.pitch;
          const x0 = p.position.x;
          const z0 = p.position.z;
          k.press(code, steps);
          // let the eased rate run out
          k.step(30);
          return { dYaw: p.yaw - y0, dPitch: p.pitch - pi0, moved: Math.hypot(p.position.x - x0, p.position.z - z0) };
        },
        { code, steps },
      );
    const right = await turn('ArrowRight');
    expect(right.dYaw).toBeLessThan(-0.5);
    expect(right.moved).toBeLessThan(0.05);
    const left = await turn('ArrowLeft');
    expect(left.dYaw).toBeGreaterThan(0.5);
    expect(left.moved).toBeLessThan(0.05);
    // ≈ 120°/s: 0.5 s held turns about 50–60° in all (ease in + coast)
    expect((left.dYaw * 180) / Math.PI).toBeGreaterThan(45);
    expect((left.dYaw * 180) / Math.PI).toBeLessThan(70);
    const up = await turn('PageUp', 20);
    expect(up.dPitch).toBeGreaterThan(0.1);
    // A still strafes, ArrowUp still walks
    expect((await turn('KeyA')).moved).toBeGreaterThan(0.3);
    expect((await turn('ArrowUp')).moved).toBeGreaterThan(0.3);

    // the real keyboard path (no pointer lock in headless) and first person
    await page.evaluate(() => window.kq!.avatar!.setMode('first'));
    const y0 = await page.evaluate(() => window.kq!.ctx.player.yaw);
    await page.keyboard.down('ArrowLeft');
    await page.evaluate(() => window.kq!.step(30));
    await page.keyboard.up('ArrowLeft');
    const y1 = await page.evaluate(() => window.kq!.ctx.player.yaw);
    expect(y1 - y0).toBeGreaterThan(0.5);
    await page.evaluate(() => window.kq!.avatar!.setMode('third'));
    expect(errors).toEqual([]);
  });

  test('F8 saves a note with screenshot and context; Esc cancels; the pause menu exports and deletes', async ({ page }) => {
    const errors = trackErrors(page);
    await boot(page);
    await page.evaluate(() => {
      const k = window.kq!;
      k.teleport(1138, -1120, 90, 0);
      k.step(5);
      k.ctx.events.emit('ui:toast', { text: 'Testereignis', ms: 10 });
    });

    // F8 → the field, Enter saves
    await page.keyboard.press('F8');
    const modal = page.getByTestId('notes-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Notiz an die Entwickler');
    await expect(page.getByTestId('notes-text')).toBeFocused();
    expect(await page.evaluate(() => window.kq!.ctx.pause.paused)).toBe(true);
    await page.keyboard.type('Hier hängt man am Zaun fest.');
    await page.keyboard.press('Enter');
    await expect(modal).toHaveCount(0);
    await page.waitForFunction(() => window.kq!.notes!.count() === 1);
    const notes = await page.evaluate(() => window.kq!.notes!.list());
    expect(notes).toHaveLength(1);
    const n = notes[0]!;
    expect(n.text).toBe('Hier hängt man am Zaun fest.');
    expect(n.screenshot ?? '').toMatch(/^data:image\/jpeg;base64,/);
    expect(n.screenshot!.length).toBeGreaterThan(2000);
    writeFileSync(`${SCREENS}/notes-shot.jpg`, Buffer.from(n.screenshot!.split(',')[1]!, 'base64'));
    expect(Math.abs(n.pos.x - 1138)).toBeLessThan(3);
    expect(n.heading).toBeGreaterThanOrEqual(0);
    expect(n.era).toBe('today');
    expect(n.quality.level).toBeTruthy();
    expect(Array.isArray(n.events)).toBe(true);
    expect(n.events.some((e) => e.name === 'ui:toast' && e.p.includes('Testereignis'))).toBe(true);
    expect(n.events.some((e) => e.name === 'player:step')).toBe(false);
    expect(n).toHaveProperty('story');
    expect(n).toHaveProperty('quest');
    expect(n.player).toHaveProperty('level');

    // Give the cancel flow one visible notice, independent of the saved-note confirmation.
    await page.evaluate(() => {
      const { ui } = window.kq!.ctx;
      ui.cards.clearToasts();
      ui.toast('Hinweis zum Codex', 30_000);
    });
    const notice = page.locator('.kq-toast:not(.kq-notice-out)', { hasText: 'Hinweis zum Codex' });
    const pauseMenu = page.locator('.kq-pause');
    await expect(notice).toBeVisible();

    // F8 + Esc cancels the modal and returns to the notice.
    await page.keyboard.press('F8');
    await expect(modal).toBeVisible();
    await expect(notice).toBeHidden();
    await page.keyboard.type('verwerfen');
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(notice).toBeVisible();
    await expect(pauseMenu).toHaveCount(0);
    expect(await page.evaluate(() => window.kq!.notes!.count())).toBe(1);

    // telemetry: stuck episode, deaths list, summary
    const tele = await page.evaluate(() => {
      window.kq!.telemetry!.idle(200);
      return window.kq!.telemetry!.state();
    });
    expect(tele.stuck).toHaveLength(1);
    expect(tele.summary.stuckEpisodes).toBe(1);
    expect(Array.isArray(tele.deaths)).toBe(true);

    // The next Escape dismisses the notice. A separate press opens pause for export.
    await page.keyboard.press('Escape');
    await expect(notice).toHaveCount(0);
    await expect(pauseMenu).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(pauseMenu).toBeVisible();
    const exp = page.getByTestId('pause-notes-export');
    await expect(exp).toHaveText('Notizen exportieren (1)');
    const [dl] = await Promise.all([page.waitForEvent('download'), exp.click()]);
    expect(dl.suggestedFilename()).toMatch(/^karlsberg-notizen-.*\.json$/);
    const json = JSON.parse(readFileSync((await dl.path())!, 'utf8'));
    expect(json.format).toBe('kq-notes');
    expect(json.notes).toHaveLength(1);
    expect(json.notes[0].text).toBe('Hier hängt man am Zaun fest.');
    expect(json.telemetry.summary.stuckEpisodes).toBe(1);
    const viaHook = await page.evaluate(() => window.kq!.notes!.export());
    expect(viaHook.notes).toHaveLength(1);

    // … and delete (with a confirm)
    await page.getByTestId('pause-notes-clear').click();
    await page.getByRole('button', { name: 'Ja' }).click();
    await expect(exp).toHaveText('Notizen exportieren (0)');
    expect(await page.evaluate(() => window.kq!.notes!.count())).toBe(0);
    expect(await page.evaluate(() => window.kq!.telemetry!.state().stuck.length)).toBe(0);
    expect(errors).toEqual([]);
  });
});
