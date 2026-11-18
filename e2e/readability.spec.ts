/**
 * Round 6 — readability and HUD layout (docs/ACTION-RPG.md §10, §14): enemies at range and up close
 * in each era (ink outline, eyes, the Steinfresser against the 1796 sand), damage numbers beside
 * their target, a big body never wedging the camera, the K2 sight cones under the frost fog at
 * 25–40 m, the HUD zones at 1280×720, 1366×768 and 1920×1080 in a busy fight, no edge markers
 * while a boss reveals itself, and the carts echo turning the view.
 * Screenshots: test-results/screens/r6-read-*.png — look at them after visual changes.
 */
import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

const SCREENS = 'test-results/screens';
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
    return window.kq!.screenshotReady();
  });
  await page.screenshot({ path: `${SCREENS}/r6-read-${name}.png`, timeout: 150_000 });
}

/** Let a few real frames render (frame() work: camera clearance, dither, numbers, HUD). */
async function frames(page: Page, n = 6): Promise<void> {
  await page.evaluate(
    (n) =>
      new Promise<void>((res) => {
        let i = 0;
        const f = () => (++i >= n ? res() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    n,
  );
}

async function arrive(page: Page, era: string, at: { x: number; z: number; yaw: number }, pitch = -4, level = 6): Promise<void> {
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
    { era, at, pitch, level },
  );
}

/** A meadow south of the Apfelallee, far from the field station and from NPCs. */
const FIELD = { x: 1452, z: -640, yaw: 330 };
/** The 1796 valley by the guard houses (sand and dressed stone). */
const VALLEY = { x: 560, z: -915, yaw: 90 };

test.describe('round 6 readability', () => {
  test.describe.configure({ timeout: 600_000 });
  test.beforeEach(async ({ page }) => {
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq !== undefined && window.kq.combat !== undefined && !!window.kq.hunt, null, { timeout: 180_000 });
  });

  test('enemies at range and up close; numbers beside the target; no camera inside a big body', async ({ page }) => {
    const errors = trackErrors(page);
    // the Steinfresser against the sand: one near, one at 22 m
    await arrive(page, '1796', VALLEY, -3);
    await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      c.spawn('steinfresser', { dist: 6, angle: -12, group: 'r6.sf.near' });
      c.spawn('steinfresser', { dist: 22, angle: 10, group: 'r6.sf.far' });
      c.freeze(true);
      k.step(20);
    });
    await shot(page, 'steinfresser-sand');

    // the night of 1793-02 and the day of 1789: a near Streuner pack and a far one
    for (const [era, kind] of [
      ['1793-02', 'streuner'],
      ['1789', 'foliant'],
    ] as const) {
      await arrive(page, era, FIELD, -2);
      await page.evaluate((kind) => {
        const k = window.kq!;
        const c = k.combat!;
        c.spawn(kind, { dist: 5, angle: -10, group: 'r6.near' });
        c.spawn(kind, { dist: 28, angle: 12, count: 2, group: 'r6.far' });
        c.freeze(true);
        k.step(20);
      }, kind);
      await shot(page, `range-${era}`);
    }

    // a damage number sits beside its target, not on it
    await arrive(page, '1789', FIELD, -4);
    const num = await page.evaluate(async () => {
      const k = window.kq!;
      const c = k.combat!;
      c.spawn('foliant', { dist: 2.4, group: 'r6.num' });
      c.freeze(true);
      k.step(10);
      // hit from behind its guard: the side (the number shows either way, '–' on the guard)
      c.hit(2);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const e = c.sim()!.enemies.find((x) => x.group === 'r6.num')!;
      const cam = k.ctx.camera;
      const V = cam.position.constructor as Any;
      const v = new V(e.x, e.y + 1, e.z).project(cam);
      const cx = (v.x * 0.5 + 0.5) * innerWidth;
      const cy = (-v.y * 0.5 + 0.5) * innerHeight;
      const nums = [...document.querySelectorAll('.kqc-num:not(.kqc-vnum)')].map((n) => n.getBoundingClientRect());
      return { cx, cy, nums: nums.map((r) => ({ l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height })) };
    });
    expect(num.nums.length).toBeGreaterThan(0);
    for (const r of num.nums) {
      // never over the body's centre line, and no taller than the cap
      expect(num.cx < r.l || num.cx > r.r).toBe(true);
      expect(r.h).toBeLessThan(48);
    }
    await shot(page, 'number-beside');

    // the Steinbrecher: the player shoved inside its hull — the camera eases out, the body dithers
    await arrive(page, '1796', VALLEY, 0);
    const wedge = await page.evaluate(async () => {
      const k = window.kq!;
      const c = k.combat!;
      c.spawn('steinbrecher', { boss: true, dist: 9, group: 'r6.boss' });
      k.step(220);
      c.freeze(true);
      const b = c.sim()!.enemies.find((x) => x.boss)!;
      const p = k.ctx.player;
      // stand 1.2 m from its axis, looking at it
      const ang = Math.atan2(p.position.x - b.x, p.position.z - b.z);
      const x = b.x + Math.sin(ang) * 1.2;
      const z = b.z + Math.cos(ang) * 1.2;
      p.teleport(x, z);
      p.yaw = Math.atan2(-(b.x - x), -(b.z - z));
      for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r));
      const cam = k.ctx.camera.position;
      const v = c.view();
      return { pull: v.pull, camD: Math.hypot(cam.x - b.x, cam.z - b.z), vis: v.vis[b.id] };
    });
    expect(wedge.pull).toBeGreaterThan(0.3);
    expect(wedge.camD).toBeGreaterThan(1.5);
    await shot(page, 'boss-wedge');
    expect(errors).toEqual([]);
  });

  test('HUD zones: tracker, vitals, abilities, feed and boss bar never overlap (three sizes)', async ({ page }) => {
    const errors = trackErrors(page);
    for (const [w, h] of [
      [1280, 720],
      [1366, 768],
      [1920, 1080],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await arrive(page, '1789', FIELD, -2, 8);
      await page.evaluate((tag) => {
        const k = window.kq as Any;
        k.ctx.state.mutable.flags['barks.quiet'] = true;
        for (const id of ['q.k1.karlslust', 'q.k1.lohn', 'q.k1.zwinger', 'q.k1.hundenamen']) {
          k.quests.offer(id);
          k.quests.accept(id);
        }
        k.progression.grant('item.balsam', 3, true);
        const c = k.combat;
        // groups are idempotent (a cleared one never comes back): a fresh name per size
        c.spawn('streuner', { dist: 4, count: 3, radius: 1.5, group: `r6.hud.${tag}` });
        c.spawn('schuldbuch', { boss: true, dist: 14, group: `r6.hud.boss.${tag}` });
        // past the reveal, into the fight
        for (let i = 0; i < 60 && !(c.state().inCombat && !k.ctx.ui.hud.staged); i++) k.step(10);
        c.hurt(30);
        c.freeze(true);
        k.step(4);
      }, `${w}x${h}`);
      await frames(page, 8);
      const lay = await page.evaluate(() => {
        const rect = (el: Element | null) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none' ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
        };
        const tl = document.querySelector('[data-testid="hud-topleft"]')!;
        // the column's visible extent (its max-height cuts it)
        const tlR = rect(tl);
        const vit = [...document.querySelectorAll('[data-testid="hud-vitals"] > *')].map(rect).filter(Boolean);
        const boss = rect(document.querySelector('[data-testid="combat-boss"]'));
        const feed = rect(document.querySelector('[data-testid="hud-feed"]'));
        const mode = (document.querySelector('.kq-hud') as HTMLElement).dataset.kqMode ?? '';
        return { tl: tlR, vit, boss, feed, mode, inCombat: window.kq!.combat!.state().inCombat };
      });
      expect(lay.inCombat).toBe(true);
      expect(lay.mode).toBe('combat');
      const over = (a: Any, b: Any) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      for (const v of lay.vit) expect(over(lay.tl, v), `topleft over vitals at ${w}×${h}`).toBeFalsy();
      expect(over(lay.tl, lay.boss), `topleft over boss bar at ${w}×${h}`).toBeFalsy();
      expect(over(lay.tl, lay.feed), `topleft over feed at ${w}×${h}`).toBeFalsy();
      for (const v of lay.vit) expect(over(lay.boss, v)).toBeFalsy();
      await shot(page, `hud-${w}x${h}`);
      await page.evaluate(() => {
        const k = window.kq as Any;
        k.combat.freeze(false);
        k.combat.kill();
        k.step(300);
      });
    }
    expect(errors).toEqual([]);
  });

  test('no edge markers during a boss reveal; the tracker steps back', async ({ page }) => {
    const errors = trackErrors(page);
    await arrive(page, '1796', VALLEY, 2);
    const r = await page.evaluate(async () => {
      const k = window.kq as Any;
      const c = k.combat;
      k.quests.offer('q.k4.karren');
      k.quests.accept('q.k4.karren');
      // an attacker behind you, then the boss rises in front
      c.spawn('streuner', { dist: 6, angle: 160, group: 'r6.behind' });
      c.spawn('steinbrecher', { boss: true, dist: 12, group: 'r6.reveal' });
      k.step(70);
      const intro = c.sim().enemies.some((e: Any) => e.boss && e.state === 'intro');
      c.windup('r6.behind', 'pounce', 0.4);
      k.step(2);
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const arrows = document.querySelectorAll('.kqc-arrow').length;
      const staged = k.ctx.ui.hud.staged;
      const mode = (document.querySelector('.kq-hud') as HTMLElement).dataset.kqMode ?? '';
      return { intro, arrows, staged, mode };
    });
    expect(r.intro).toBe(true);
    expect(r.staged).toBe(true);
    expect(r.mode).toBe('staged');
    expect(r.arrows).toBe(0);
    await shot(page, 'reveal-clean');
    // after the reveal the arrows come back
    const after = await page.evaluate(async () => {
      const k = window.kq as Any;
      const c = k.combat;
      k.step(200);
      // put the attacker back behind the player, then its wind-up
      const p = k.ctx.player;
      const bx = p.position.x + Math.sin(p.yaw) * 6;
      const bz = p.position.z + Math.cos(p.yaw) * 6;
      c.freeze(true);
      c.place('r6.behind', bx, bz);
      c.windup('r6.behind', 'pounce', 0.4);
      k.step(2);
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      return { staged: k.ctx.ui.hud.staged, arrows: document.querySelectorAll('.kqc-arrow').length };
    });
    expect(after.staged).toBe(false);
    expect(after.arrows).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('K2 sight cones read under the frost fog at 25 and 40 m', async ({ page }) => {
    const errors = trackErrors(page);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.ctx.state.mutable.flags['barks.quiet'] = true;
      k.story.start('Alex');
      k.story.goto('k2', 'k2_2');
      k.step(4);
      k.setEra('1793-02');
      k.teleport(1503, -536, 205, -8);
      k.step(120);
      k.story.finishTyping();
      k.lantern.toggle(false);
      k.press('KeyC', 1);
      k.step(90);
    });
    expect(await page.evaluate(() => window.kq!.ctx.state.state.flags['hunt.cones'])).toBe(true);
    for (const dist of [25, 40]) {
      await page.evaluate((dist) => {
        const k = window.kq as Any;
        k.story.flush();
        const p = k.ctx.player.position;
        const hs = k.hunt.sim().agents.filter((a: Any) => a.kind === 'hound');
        hs.sort((a: Any, b: Any) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        const h = hs[0];
        // behind the hound, off its flank (outside its cone), looking at it and its fan
        const back = h.heading + Math.PI * 0.75;
        const x = h.x - Math.sin(back) * dist;
        const z = h.z - Math.cos(back) * dist;
        k.hunt.freeze(true);
        k.ctx.player.teleport(x, z);
        k.ctx.player.yaw = Math.atan2(-(h.x - x), -(h.z - z));
        k.ctx.player.pitch = -0.12;
        k.step(2);
      }, dist);
      await page.evaluate(() => {
        let st = document.getElementById('r6-hide-dlg');
        if (!st) {
          st = document.createElement('style');
          st.id = 'r6-hide-dlg';
          document.head.append(st);
        }
        st.textContent = '.kqs-dlg { display: none !important; }';
      });
      await shot(page, `k2-cones-${dist}m`);
      await page.evaluate(() => (window.kq as Any).hunt.freeze(false));
    }
    expect(errors).toEqual([]);
  });

  test('the carts echo turns the view to the carts', async ({ page }) => {
    const errors = trackErrors(page);
    const r = await page.evaluate(() => {
      const k = window.kq as Any;
      k.setEra('1796');
      // at the memory (497 / −900), looking north, away from the road
      k.teleport(497, -896, 0, 0);
      k.step(10);
      k.ctx.events.emit('echo:start', { id: 'clue.k4.karren' });
      k.step(150);
      const p = k.ctx.player;
      const carts: [number, number][] = k.scenery.convoy();
      let best = Infinity;
      let off = Math.PI;
      for (const [x, z] of carts) {
        const d = Math.hypot(x - p.position.x, z - p.position.z);
        if (d < best) {
          best = d;
          const want = Math.atan2(-(x - p.position.x), -(z - p.position.z));
          off = Math.abs(Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw)));
        }
      }
      return { best, off };
    });
    expect(r.best).toBeLessThan(80);
    expect(r.off).toBeLessThan(0.35);
    await shot(page, 'carts-echo');
    expect(errors).toEqual([]);
  });
});
