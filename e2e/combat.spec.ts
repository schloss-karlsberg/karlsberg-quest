import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

/**
 * Combat: the Messstab, the dodge, the Bannlicht, spectral enemies, the four bosses, dying without
 * loss. Drives `window.kq.combat` with `?manual` (deterministic stepping). Screenshots:
 * test-results/screens/rpg-combat-*.png — look at them after visual changes.
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

/** A meadow south of the Apfelallee, far from the field station and from NPCs. */
const FIELD = { x: 1452, z: -640, yaw: 330 };

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${SCREENS}/rpg-combat-${name}.png`, timeout: 150_000 });
}

async function setup(page: Page, era = '1789', at = FIELD): Promise<void> {
  await page.evaluate(
    ({ era, at }) => {
      const k = window.kq!;
      // the staff shows only once one is in hand (a new game picks it up at the trailer)
      k.progression!.grant('item.stab.esche', 1, true);
      k.progression!.equip('item.stab.esche');
      k.setEra(era as never);
      k.teleport(at.x, at.z, at.yaw, -7);
      k.step(10);
      k.combat!.kill();
      k.step(5);
    },
    { era, at },
  );
}

/** Events of a kind seen since the start of the test. */
async function events(page: Page, name: string): Promise<{ name: string; payload: Record<string, unknown>; tick: number }[]> {
  return page.evaluate((n) => window.kq!.combat!.events().filter((e) => e.name === n) as never, name);
}

test.describe('combat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq !== undefined && window.kq.combat !== undefined, null, { timeout: 90_000 });
  });

  test('the staff, a Nebelling undone, the dodge, vitals', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = trackErrors(page);
    await setup(page);
    const idle = await page.evaluate(() => {
      const k = window.kq!;
      k.step(30);
      const vm = k.ctx.scene.getObjectByName('combat-viewmodel');
      return { visible: !!vm && vm.visible, children: vm?.children.length ?? 0 };
    });
    expect(idle.visible).toBe(true);
    expect(idle.children).toBeGreaterThan(2);
    await shot(page, 'idle');

    // a Nebelling right ahead; two hits, a screenshot mid-swing with the hit particles
    const mid = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      c.god(true);
      c.spawn('nebelling', { dist: 2.1, group: 'test.nebel' });
      c.freeze(true);
      k.step(2);
      c.hit(1);
      // the second swing: stop just after its impact (hit-stop + particles in the air)
      k.ctx.input.simulate('KeyK', true);
      k.step(1);
      k.ctx.input.simulate('KeyK', false);
      k.step(11);
      return c.enemies().map((e) => ({ kind: e.kind, hp: e.hp, max: e.max }));
    });
    expect(mid.length).toBe(1);
    expect(mid[0]!.hp).toBeLessThan(mid[0]!.max);
    await shot(page, 'hit');
    const hits = await events(page, 'combat:hit');
    expect(hits.some((h) => h.payload.target === 'enemy' && h.payload.kind === 'nebelling')).toBe(true);

    // finish it: it dissolves into mist (screenshot during the dissolve)
    const killed = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      // the last blow: stop shortly after it lands, while it comes apart
      for (let i = 0; i < 8 && c.enemies().some((e) => e.state !== 'dissolve' && e.hp > 8); i++) c.hit(1);
      k.ctx.input.simulate('KeyK', true);
      k.step(1);
      k.ctx.input.simulate('KeyK', false);
      for (let i = 0; i < 40 && !c.enemies().some((e) => e.state === 'dissolve'); i++) k.step(1);
      for (let i = 0; i < 18; i++) k.step(1);
      const dis = c.enemies().filter((e) => e.state === 'dissolve').length;
      return { dis, groups: c.groups() };
    });
    expect(killed.dis).toBe(1);
    expect(killed.groups['test.nebel']!.killed).toBe(1);
    await shot(page, 'dissolve');
    const k1 = await events(page, 'enemy:killed');
    expect(k1.some((e) => e.payload.group === 'test.nebel' && e.payload.kind === 'nebelling')).toBe(true);
    expect((await events(page, 'enemy:cleared')).some((e) => e.payload.group === 'test.nebel')).toBe(true);

    // the dodge carries the player at least 3 m
    const dodge = await page.evaluate(() => {
      const k = window.kq!;
      k.step(60);
      const p = k.ctx.player.position;
      const a = { x: p.x, z: p.z };
      k.ctx.input.simulate('KeyD', true);
      k.step(1);
      k.combat!.dodge();
      k.step(30);
      k.ctx.input.simulate('KeyD', false);
      k.step(10);
      const b = k.ctx.player.position;
      return Math.hypot(b.x - a.x, b.z - a.z);
    });
    expect(dodge).toBeGreaterThanOrEqual(3);

    // vitals after a blow: Lebenskraft down, Atem spent
    await page.evaluate(() => {
      const k = window.kq!;
      k.combat!.god(false);
      k.combat!.hurt(34);
      k.step(20);
    });
    await expect(page.getByTestId('combat-vitals')).toBeVisible();
    await expect(page.getByTestId('combat-bann')).toBeVisible();
    await shot(page, 'vitals');
    expect(errors).toEqual([]);
  });

  test('Irrlicht: untouchable until the Bannlicht; a telegraph with its ground ring', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = trackErrors(page);
    await setup(page);
    const r = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      c.god(true);
      c.spawn('irrlicht', { dist: 2.2, group: 'test.irr' });
      c.freeze(true);
      k.step(2);
      c.hit(1);
      const before = c.enemies()[0]!;
      c.bann();
      k.step(8);
      const after = c.enemies()[0]!;
      return { hp0: before.hp, max: before.max, stun: after.stun };
    });
    expect(r.hp0).toBe(r.max);
    expect(r.stun).toBeGreaterThan(0);
    expect((await events(page, 'combat:bann')).length).toBe(1);
    await shot(page, 'gebannt');
    const done = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      for (let i = 0; i < 6 && c.enemies().some((e) => e.state !== 'dissolve'); i++) c.hit(1);
      k.step(30);
      return c.groups()['test.irr']!.killed;
    });
    expect(done).toBe(1);

    // a Steinfresser stamps: the area ring on the ground, the pose and the caption
    await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      c.spawn('steinfresser', { dist: 5.5, group: 'test.stein' });
      c.freeze(true);
      k.step(2);
      c.windup('test.stein', 'stampfen', 0.65);
      k.step(2);
    });
    await shot(page, 'telegraph');
    expect(errors).toEqual([]);
  });

  test('undone at 0 Lebenskraft: caught by combat, wake, nothing lost', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = trackErrors(page);
    await setup(page);
    const r = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      // one group cleared (stays cleared), one unfinished (comes back whole)
      c.god(true);
      c.spawn('mahnbrief', { dist: 2, group: 'test.done' });
      c.freeze(true);
      k.step(2);
      for (let i = 0; i < 6 && c.enemies().some((e) => e.state !== 'dissolve'); i++) c.hit(1);
      k.step(60);
      c.spawn('streuner', { dist: 9, count: 2, group: 'test.open' });
      k.step(2);
      const inv = structuredClone(k.state().systems.progression ?? null);
      c.god(false);
      c.hurt(1000);
      for (let i = 0; i < 200; i++) k.step(1);
      return { st: c.state(), groups: c.groups(), inv };
    });
    const died = await events(page, 'player:died');
    const caught = await events(page, 'player:caught');
    expect(died.length).toBe(1);
    expect(caught.length).toBe(1);
    expect(caught[0]!.payload.by).toBe('combat');
    expect(r.groups['test.done']!.killed).toBe(1);
    // wake: the story's curtain brings the player back; else combat gets up on its own
    const woke = await page.evaluate(async () => {
      const k = window.kq!;
      for (let i = 0; i < 1200 && k.combat!.state().dead; i++) k.step(1);
      k.step(30);
      return { st: k.combat!.state(), inv: structuredClone(k.state().systems.progression ?? null) };
    });
    expect(woke.st.dead).toBe(false);
    expect(woke.st.hp).toBeGreaterThanOrEqual(99);
    expect(woke.st.groups['test.done']!.killed).toBe(1);
    expect(woke.st.deaths).toBe(1);
    expect(JSON.stringify(woke.inv)).toBe(JSON.stringify(r.inv));
    expect((await events(page, 'player:healed')).some((e) => e.payload.by === 'wake')).toBe(true);
    expect(errors).toEqual([]);
  });

  test('reduced motion keeps the camera still; reduced flash keeps hits local', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = trackErrors(page);
    await setup(page);
    const r = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      k.ctx.settings.update((s) => {
        s.reducedMotion = true;
        s.reducedFlash = true;
      }, 'reducedMotion');
      c.god(true);
      c.spawn('raffschatten', { dist: 2.2, group: 'test.rm' });
      c.freeze(true);
      k.step(2);
      const q0 = k.ctx.camera.quaternion.toArray();
      let maxShake = 0;
      let maxDev = 0;
      for (let i = 0; i < 3; i++) {
        k.ctx.input.simulate('KeyK', true);
        k.step(1);
        k.ctx.input.simulate('KeyK', false);
        for (let j = 0; j < 24; j++) {
          k.step(1);
          maxShake = Math.max(maxShake, c.shake());
          const q = k.ctx.camera.quaternion.toArray();
          maxDev = Math.max(maxDev, ...q.map((v, n) => Math.abs(v - q0[n]!)));
        }
      }
      // stop right after an impact for the screenshot
      k.ctx.input.simulate('KeyK', true);
      k.step(1);
      k.ctx.input.simulate('KeyK', false);
      k.step(10);
      return { maxShake, maxDev, hits: c.events().filter((e) => e.name === 'combat:hit').length };
    });
    expect(r.hits).toBeGreaterThan(0);
    expect(r.maxShake).toBe(0);
    expect(r.maxDev).toBeLessThan(1e-6);
    await shot(page, 'reduced-flash-hit');
    expect(errors).toEqual([]);
  });

  test('the four bosses and the boss bar', async ({ page }) => {
    test.setTimeout(420_000);
    const errors = trackErrors(page);
    await setup(page);
    for (const [kind, era] of [
      ['schuldbuch', '1789'],
      ['pikeur', '1793-02'],
      ['strohmann', '1793-07'],
      ['steinbrecher', '1796'],
    ] as const) {
      await page.evaluate(
        ({ kind, era, at }) => {
          const k = window.kq!;
          const c = k.combat!;
          c.kill();
          k.step(90);
          k.setEra(era as never);
          k.teleport(at.x, at.z, at.yaw, 4);
          k.step(10);
          c.god(true);
          c.spawn(kind, { boss: true, dist: kind === 'pikeur' ? 13 : 9, group: `test.boss.${kind}` });
          c.freeze(true);
          k.step(30);
        },
        { kind, era, at: FIELD },
      );
      const bar = page.getByTestId('combat-boss');
      if (kind === 'schuldbuch') {
        await expect(bar).toBeVisible();
        await expect(bar).toContainText('Schuldbuch');
      } else await expect(bar).toBeVisible();
      const st = await page.evaluate(() => window.kq!.combat!.state().boss);
      expect(st?.kind).toBe(kind);
      await shot(page, `boss-${kind}`);
    }
    await page.evaluate(() => window.kq!.combat!.kill());
    expect(errors).toEqual([]);
  });

  test('the Bannlicht scatters the hounds; they take no damage', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = trackErrors(page);
    await setup(page, '1793-02');
    const r = await page.evaluate((a) => {
      const k = window.kq!;
      k.hunt!.start({ x: a.x, z: a.z, radius: 140, intensity: 0.5, hounds: 4, pikeur: false, seed: 3 });
      k.hunt!.freeze(true);
      [
        [4, -8],
        [5, 10],
        [6, 0],
        [7, -20],
      ].forEach(([d, ang], i) => k.hunt!.placeInView(i, d!, ang!));
      k.step(5);
      k.hunt!.freeze(false);
      const s = k.hunt!.sim()!;
      const p = k.ctx.player.position;
      const d0 = s.agents.map((x) => Math.hypot(x.x - p.x, x.z - p.z));
      k.combat!.bann();
      k.step(2);
      const scattered = s.agents.filter((x) => (x.scatterT ?? 0) > 3).length;
      const bann = k.combat!.events().filter((e) => e.name === 'combat:bann').length;
      // a staff swing passes through them: nothing
      k.combat!.hit(1);
      const enemyHits = k.combat!.events().filter((e) => e.name === 'combat:hit').length;
      k.step(70);
      const d1 = s.agents.map((x) => Math.hypot(x.x - p.x, x.z - p.z));
      return { bann, frozen: k.ctx.player.frozen, scattered, enemyHits, farther: d1.filter((d, i) => d > d0[i]! + 2).length, caught: !!k.hunt!.state()?.caught };
    }, FIELD);
    expect(r.bann, JSON.stringify(r)).toBe(1);
    expect(r.scattered).toBeGreaterThanOrEqual(3);
    expect(r.enemyHits).toBe(0);
    expect(r.farther).toBeGreaterThanOrEqual(3);
    expect(r.caught).toBe(false);
    await page.evaluate(() => window.kq!.hunt!.stop?.());
    expect(errors).toEqual([]);
  });
});
