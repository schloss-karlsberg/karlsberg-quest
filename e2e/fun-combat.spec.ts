import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { SCREENS } from './helpers/common';

/**
 * Combat fun pass (docs/ACTION-RPG.md §5.2, §5.5): the bosses reveal themselves (camera, title card,
 * sting), a boss comes apart (slow motion, burst, loot fountain), packs with a named elite and an
 * escort, the Nebelweber, red/white telegraphs on pale and dark ground, the Gnadenstoß.
 * Screenshots: test-results/screens/fun-combat-*.png — look at them after visual changes.
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
  await page.screenshot({ path: `${SCREENS}/fun-combat-${name}.png`, timeout: ciScale(150_000) });
}

async function arrive(page: Page, era: string, pitch = -4): Promise<void> {
  await page.evaluate(
    ({ era, at, pitch }) => {
      const k = window.kq!;
      const c = k.combat!;
      k.progression!.grant('item.stab.eisen', 1, true);
      k.progression!.equip('item.stab.eisen');
      c.kill();
      k.step(240);
      k.setEra(era as never);
      k.teleport(at.x, at.z, at.yaw, pitch);
      k.step(10);
      c.kill();
      c.god(true);
      k.step(5);
    },
    { era, at: FIELD, pitch },
  );
}

test.describe('combat fun pass', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq !== undefined && window.kq.combat !== undefined, null, { timeout: 90_000 });
  });

  test('the four bosses reveal themselves; one comes apart', async ({ page }) => {
    test.setTimeout(ciScale(480_000));
    const errors = trackErrors(page);
    for (const [kind, era, title] of [
      ['schuldbuch', '1789', 'Schuldbuch'],
      ['pikeur', '1793-02', 'Pikeur'],
      ['strohmann', '1793-07', 'Strohmann'],
      ['steinbrecher', '1796', 'Steinbrecher'],
    ] as const) {
      await arrive(page, era, 2);
      const st = await page.evaluate((kind) => {
        const k = window.kq!;
        const c = k.combat!;
        c.spawn(kind, { boss: true, dist: kind === 'pikeur' ? 12 : 11, group: `fun.boss.${kind}` });
        k.step(70);
        const b = c.sim()!.enemies.find((e) => e.boss)!;
        return { state: b.state, intro: c.sim()!.enemies.some((e) => e.boss && e.state === 'intro') };
      }, kind);
      expect(st.state).toBe('intro');
      const card = page.getByTestId('combat-title');
      await expect(card).toBeVisible();
      await expect(card).toContainText(title);
      await shot(page, `intro-${kind}`);
    }
    // the Steinbrecher comes apart: slow motion, the burst, the loot fountain
    const r = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      k.step(200);
      c.freeze(true);
      const n = c.kill('fun.boss.steinbrecher');
      k.step(14);
      return { n, killed: c.events().filter((e) => e.name === 'enemy:killed').length };
    });
    expect(r.n).toBe(1);
    expect(r.killed).toBeGreaterThan(0);
    await shot(page, 'boss-death');
    expect(errors).toEqual([]);
  });

  test('a pack with its elite and escort; the Nebelweber; telegraphs on sand and in the night', async ({ page }) => {
    test.setTimeout(ciScale(420_000));
    const errors = trackErrors(page);
    await arrive(page, '1793-02');
    const pack = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      c.spawn('streuner', { dist: 8, count: 4, radius: 2.5, tier: 2, group: 'fun.pack' });
      c.freeze(true);
      k.step(40);
      const live = c.sim()!.enemies.filter((e) => e.state !== 'dissolve');
      return { kinds: live.map((e) => e.kind), elite: live.find((e) => e.elite)?.title ?? null, escorts: live.filter((e) => e.escort).length };
    });
    expect(pack.elite).toBe('Leithund');
    expect(pack.escorts).toBeGreaterThan(0);
    expect(pack.kinds).toContain('nebelling'); // 1793-02: the Streuner's company of frost mist
    await expect(page.locator('.kqc-pips.elite').first()).toBeVisible();
    await shot(page, 'pack-elite');

    // the Nebelweber spins its frost (a landing ring where you stand)
    await arrive(page, '1789');
    await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      c.spawn('nebelweber', { dist: 9, group: 'fun.weber' });
      c.freeze(true);
      c.windup('fun.weber', 'frostkugel', 0.7);
      k.step(3);
    });
    await shot(page, 'nebelweber');

    // red/white telegraphs: on pale ground and at night
    for (const [era, name] of [
      ['1796', 'telegraph-sand'],
      ['1793-07', 'telegraph-night'],
    ] as const) {
      await arrive(page, era, -14);
      await page.evaluate(() => {
        const k = window.kq!;
        const c = k.combat!;
        c.spawn('steinfresser', { dist: 6, group: 'fun.tele' });
        c.freeze(true);
        c.windup('fun.tele', 'stampfen', 0.6);
        k.step(3);
      });
      await shot(page, name);
    }
    expect(errors).toEqual([]);
  });

  test('the Gnadenstoß: a reeling elite falls to one Wuchthieb', async ({ page }) => {
    test.setTimeout(ciScale(300_000));
    const errors = trackErrors(page);
    await arrive(page, '1793-07', -8);
    const id = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      c.spawn('raffschatten', { dist: 10, count: 3, tier: 3, group: 'fun.gnade' });
      c.freeze(true);
      k.step(5);
      const el = c.sim()!.enemies.find((e) => e.elite)!;
      const p = k.ctx.player.position;
      const yaw = k.ctx.player.yaw;
      c.place(el.id, p.x - Math.sin(yaw) * 3.4, p.z - Math.cos(yaw) * 3.4);
      el.hp = el.maxHp * 0.2;
      el.finishable = true;
      el.state = 'stagger';
      el.stagger = 6;
      k.step(20);
      return el.id;
    });
    await expect(page.locator('.kqc-pips.finish').first()).toBeVisible();
    await shot(page, 'finishable');
    const r = await page.evaluate((id) => {
      const k = window.kq!;
      const p = k.ctx.player.position;
      const yaw = k.ctx.player.yaw;
      k.combat!.place(id, p.x - Math.sin(yaw) * 2, p.z - Math.cos(yaw) * 2);
      k.ctx.input.simulate('KeyK', true);
      k.step(42);
      k.ctx.input.simulate('KeyK', false);
      k.step(30);
      const e = k.combat!.sim()!.enemies.find((x) => x.id === id);
      return { gone: !e || e.state === 'dissolve' };
    }, id);
    expect(r.gone).toBe(true);
    await shot(page, 'finisher');
    expect(errors).toEqual([]);
  });
});
