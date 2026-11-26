import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { SCREENS } from './helpers/common';

/**
 * Combat variety pass (docs/ACTION-RPG.md §4.2, §5.1, §5.5): the Foliant's guard, the Scherbling's
 * mirror, the Rufer's call, the veil, a second wave from another side, an era hazard, and the three
 * abilities (Ausfall, Erdstoß, Wirbel) with their HUD slots and cooldown rings.
 * Screenshots: test-results/screens/s5-combat-*.png — look at them after visual changes.
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

/** A meadow south of the Apfelallee, far from the field station and from NPCs. */
const FIELD = { x: 1452, z: -640, yaw: 330 };

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${SCREENS}/s5-combat-${name}.png`, timeout: 150_000 });
}

async function arrive(page: Page, era: string, level = 6, pitch = -4): Promise<void> {
  await page.evaluate(
    ({ era, at, pitch, level }) => {
      const k = window.kq!;
      const c = k.combat!;
      k.progression!.level(level);
      k.progression!.grant('item.stab.eisen', 1, true);
      k.progression!.equip('item.stab.eisen');
      c.kill();
      k.step(240);
      k.setEra(era as never);
      k.teleport(at.x, at.z, at.yaw, pitch);
      k.step(10);
      c.kill();
      c.god(true);
      c.heal();
      k.step(5);
    },
    { era, at: FIELD, pitch, level },
  );
}

test.describe('combat variety', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq !== undefined && window.kq.combat !== undefined, null, { timeout: 90_000 });
  });

  test('the Foliant blocks, the Wuchthieb breaks its guard; the ability row shows', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = trackErrors(page);
    await arrive(page, '1789');
    // three slots at level 6, keys T / Z(Y) / U
    const slots = page.getByTestId('combat-skills').locator('.kqc-skill');
    await expect(slots).toHaveCount(3);
    const r = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      c.spawn('foliant', { dist: 2.6, group: 'cv.foliant' });
      c.freeze(true);
      k.step(20);
      c.hit(1);
      const blocked = c.sim()!.enemies.some((e) => e.kind === 'foliant' && e.hp >= e.maxHp - 0.01);
      return { blocked };
    });
    expect(r.blocked).toBe(true);
    await shot(page, 'foliant-guard');
    const broke = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      // hold the attack into a Wuchthieb
      k.step(30);
      k.ctx.input.simulate('KeyK', true);
      k.step(40);
      k.ctx.input.simulate('KeyK', false);
      k.step(14);
      const f = c.sim()!.enemies.find((e) => e.kind === 'foliant')!;
      return { broken: f.guardBroken > 0, state: f.state };
    });
    expect(broke.broken).toBe(true);
    await shot(page, 'foliant-broken');
    expect(errors).toEqual([]);
  });

  test('abilities: Erdstoß ring, Wirbel, Ausfall; cooldown rings fill', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = trackErrors(page);
    await arrive(page, '1789');
    const out = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      c.spawn('nebelling', { dist: 2.4, count: 4, radius: 1.2, group: 'cv.slam' });
      c.freeze(true);
      k.step(10);
      const why = c.skill('erdstoss');
      k.step(26);
      return { why, hurt: c.sim()!.enemies.filter((e) => e.group === 'cv.slam' && e.hp < e.maxHp).length };
    });
    expect(out.why).toBe('ok');
    expect(out.hurt).toBeGreaterThanOrEqual(2);
    await shot(page, 'erdstoss');
    const w = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      k.step(40);
      c.kill();
      c.spawn('nebelling', { dist: 2, count: 3, radius: 1, group: 'cv.whirl' });
      k.step(10);
      const why = c.skill('wirbel');
      k.step(20);
      return why;
    });
    expect(w).toBe('ok');
    await shot(page, 'wirbel');
    const a = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      k.step(60);
      c.kill();
      c.spawn('rufer', { dist: 6.5, group: 'cv.lunge' });
      k.step(10);
      const pp = k.ctx.player.position;
      const before = { x: pp.x, z: pp.z };
      const why = c.skill('ausfall');
      k.step(8);
      const after = { x: pp.x, z: pp.z };
      return { why, moved: Math.hypot(after.x - before.x, after.z - before.z) };
    });
    expect(a.why).toBe('ok');
    expect(a.moved).toBeGreaterThan(2);
    // all three on cooldown: rings partly filled, seconds shown
    const cds = await page.locator('[data-testid="combat-skills"] .kqc-skill:not(.ready)').count();
    expect(cds).toBeGreaterThanOrEqual(2);
    await page.locator('[data-testid="combat-skills"]').screenshot({ path: `${SCREENS}/s5-combat-skill-row.png` });
    expect(errors).toEqual([]);
  });

  test('the Scherbling throws the Bannlicht back', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = trackErrors(page);
    await arrive(page, '1793-07', 6, 2);
    const ref = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      c.spawn('scherbling', { dist: 4, group: 'cv.mirror' });
      c.freeze(true);
      k.step(20);
      c.bann();
      k.step(3);
      return { dazzle: c.sim()!.p.dazzle, refl: c.events().length };
    });
    expect(ref.dazzle).toBeGreaterThan(0);
    await shot(page, 'scherbling-reflect');
    expect(errors).toEqual([]);
  });

  test('the summer rains embers; the Rufer calls out of the fog', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = trackErrors(page);
    await arrive(page, '1793-07', 6, 2);
    // the summer's ember rain: a pack fight with hazards
    const hz = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      c.spawn('glutling', { dist: 9, count: 4, radius: 2, group: 'cv.hz' });
      for (let i = 0; i < 40 && !c.sim()!.hazards.length; i++) k.step(20);
      k.step(30);
      return c.sim()!.hazards.length + c.sim()!.rings.filter((r) => r.owner === 'hazard').length;
    });
    expect(hz).toBeGreaterThan(0);
    await shot(page, 'hazard-fire');
    await arrive(page, '1793-02', 6, 2);
    const call = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      c.spawn('rufer', { dist: 9, group: 'cv.call' });
      k.step(10);
      c.windup('cv.call', 'ruf', 0.75);
      k.step(60);
      return c.sim()!.enemies.filter((e) => e.called).length;
    });
    expect(call).toBeGreaterThan(0);
    await shot(page, 'rufer-call');
    expect(errors).toEqual([]);
  });

  test('a pack worth the name brings a second wave from another side', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = trackErrors(page);
    await arrive(page, '1789', 6, 2);
    const w = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      c.spawn('streuner', { dist: 10, count: 3, tier: 1, radius: 2.5, group: 'cv.wave' });
      let seen = false;
      for (let i = 0; i < 40 && !seen; i++) {
        k.step(30);
        seen = c.sim()!.enemies.some((e) => e.wave);
      }
      k.step(40);
      return { seen, n: c.sim()!.enemies.filter((e) => e.wave).length };
    });
    expect(w.seen).toBe(true);
    await shot(page, 'wave');
    expect(errors).toEqual([]);
  });
});
