import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { SCREENS } from './helpers/common';

/**
 * Hunt extensions + the menagerie: snow tracks (Ch. 2), the driving pack (Ch. 4), the finale at
 * the kennel (W8), persistence of the pack, and the escaped animals (cassowary, dromedaries,
 * jaguar). Deterministic stepping with `?manual`. Screenshots: test-results/screens/hunt-ext-*.png
 * and menagerie-*.png — look at them after visual changes.
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

async function shot(page: Page, name: string): Promise<void> {
  // the story's ambient dialogue (Laub reacting to the horn) would cover the feature views
  await page.addStyleTag({ content: '.kqs-dlg { visibility: hidden !important; }' });
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${SCREENS}/${name}.png`, timeout: 150_000 });
}

/** Apfelallee (frost night of 1793-02). */
const ALLEE = { x: 1452, z: -640, yaw: 330 };
/** The way north to the kennel (Ch. 4 drive) and the kennel itself (W8). */
const HOHLWEG = { x: 1212, z: -1330 };
const ZWINGER = { x: 1216, z: -1571 };

test.describe('hunt extensions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq !== undefined && window.kq.hunt !== undefined && window.kq.menagerie !== undefined, null, { timeout: 90_000 });
  });

  test('snow tracks: your prints, the pack crossing them, reading them', async ({ page }) => {
    const errors = trackErrors(page);
    const r = await page.evaluate((a) => {
      const k = window.kq!;
      k.setEra('1793-02');
      k.teleport(a.x, a.z, a.yaw, -24);
      k.lantern!.toggle(true);
      const pl = k.ctx.player;
      const fx = -Math.sin(pl.yaw);
      const fz = -Math.cos(pl.yaw);
      const rx = Math.cos(pl.yaw);
      const rz = -Math.sin(pl.yaw);
      // your own trail: from under your feet, ahead and a little to the right
      k.hunt!.walkPrints(a.x + rx * 0.4, a.z + rz * 0.4, a.x + fx * 16 + rx * 3, a.z + fz * 16 + rz * 3, 0.68);
      // a pack (hounds + the horse) crossed it a moment ago, left to right
      k.hunt!.start({ x: a.x, z: a.z, radius: 120, intensity: 0.5, hounds: 4, pikeur: true, seed: 3, snow: true });
      k.hunt!.freeze(true);
      const s = k.hunt!.sim()!;
      for (const ag of s.agents) ag.x += 400; // out of view: only their prints matter here
      const T = s.tracks!;
      const lay = (kind: 'paw' | 'hoof', agent: number, off: number, step: number, lat: number, age: number) => {
        for (let d = -12, side = 1; d <= 12; d += step, side = -side) {
          const x = a.x + fx * off + rx * d + fx * Math.sin(d * 0.2) * 0.6 + fx * lat;
          const z = a.z + fz * off + rz * d + fz * Math.sin(d * 0.2) * 0.6 + fz * lat;
          T.addPack(kind, agent, x + rx * 0.06 * side, z + rz * 0.06 * side, -Math.PI / 2 + pl.yaw, T.now - age, side, 0.8);
        }
      };
      lay('paw', 1, 6, 0.55, 0, 20);
      lay('paw', 2, 6.4, 0.6, 0.5, 18);
      lay('paw', 3, 7.2, 0.5, -0.4, 22);
      lay('hoof', 0, 9.5, 1.4, 0, 30);
      k.step(10);
      return k.hunt!.tracks();
    }, ALLEE);
    expect(r.boot).toBeGreaterThan(15);
    expect(r.paw).toBeGreaterThan(40);
    expect(r.hoof).toBeGreaterThan(10);
    expect(r.snow).toBe(1);
    await shot(page, 'hunt-ext-snow-tracks');

    // Spurenleser: crouch over the hound prints → a reading
    const read = await page.evaluate((a) => {
      const k = window.kq!;
      const pl = k.ctx.player;
      const fx = -Math.sin(pl.yaw);
      const fz = -Math.cos(pl.yaw);
      k.teleport(a.x + fx * 6.2, a.z + fz * 6.2, a.yaw, -50);
      pl.setStance('crouch');
      k.ctx.state.mutable.skills['spurenleser'] = 2;
      k.step(40);
      return k.hunt!.readTracks();
    }, ALLEE);
    expect(read).not.toBeNull();
    expect(read!.count).toBe(3);
    expect(read!.text).toMatch(/Hunde|Reiter/);
    await shot(page, 'hunt-ext-snow-read');
    const names = await page.evaluate(() => window.kq!.hunt!.events().map((e) => e.name));
    expect(names).toContain('hunt:read');
    expect(errors).toEqual([]);
  });

  test('drive mode: the pack herds from behind and the flanks; turning back brings you home', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    const st = await page.evaluate(
      ({ h, z }) => {
        const k = window.kq!;
        k.setEra('today');
        k.story?.look('night');
        k.teleport(h.x, h.z, 0, 0);
        k.hunt!.configure({ active: true, mode: 'drive', intensity: 0.3, center: { x: 1200, z: -1400 }, radius: 400, target: z, seed: 4 });
        // walk north for ~10 s
        k.press('KeyW', 600);
        const pl = k.ctx.player.position;
        const s = k.hunt!.state()!;
        // where do they stand relative to the player's way north?
        const rel = s.agents.map((a) => ({ kind: a.kind, ahead: -(a.z - pl.z), side: a.x - pl.x }));
        return { mode: k.hunt!.mode(), rel, caught: s.caught, saved: k.hunt!.saved() };
      },
      { h: HOHLWEG, z: ZWINGER },
    );
    expect(st.mode?.mode).toBe('drive');
    expect(st.caught).toBeNull();
    const hounds = st.rel.filter((r) => r.kind === 'hound');
    expect(hounds.length).toBe(5);
    for (const hd of hounds) expect(hd.ahead).toBeLessThan(6); // behind or beside, never in front
    expect(st.saved?.opts.mode).toBe('drive');
    // look back at them: the arc of eyes and the rider on the flank
    await page.evaluate(() => {
      const k = window.kq!;
      k.ctx.player.yaw = Math.PI * 0.9;
      k.ctx.player.pitch = -0.02;
      k.hunt!.freeze(true);
      k.step(2);
    });
    await shot(page, 'hunt-ext-drive-flankers');

    // turn back and push through them: brought home, nothing lost (soft)
    const homed = await page.evaluate(() => {
      const k = window.kq!;
      k.hunt!.freeze(false);
      const pl = k.ctx.player;
      pl.yaw = Math.PI; // south, back through the line
      for (let i = 0; i < 40 && !k.hunt!.state()?.caught; i++) k.press('KeyW', 30);
      const c = k.hunt!.state()?.caught ?? null;
      k.step(140);
      const ev = k.hunt!.events().filter((e) => e.name === 'player:caught');
      return { caught: c, ev: ev.map((e) => e.payload) };
    });
    expect(homed.caught).not.toBeNull();
    expect(homed.ev[0]).toEqual({ by: 'pack', soft: true });
    // the story's curtain: "Die Meute hat dich heimgebracht …" (it lifts after 2.4 s real time)
    await shot(page, 'hunt-ext-drive-homed');
    expect(errors).toEqual([]);
  });

  test('finale at the kennel: the circle, lying down with the light, the calm', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    const gathered = await page.evaluate((z) => {
      const k = window.kq!;
      k.setEra('today');
      k.story?.look('night');
      k.teleport(z.x, z.z, 0, -4);
      k.lantern!.toggle(false);
      k.hunt!.configure({ active: true, mode: 'finale', center: { x: 1200, z: -1400 }, radius: 400, target: z, hounds: 5, seed: 8 });
      for (let i = 0; i < 10; i++) k.step(90);
      // look between two neighbouring hounds of the circle
      const pl = k.ctx.player.position;
      const angs = k.hunt!.state()!.agents.filter((a) => a.kind === 'hound').map((a) => Math.atan2(-(a.x - pl.x), -(a.z - pl.z)));
      angs.sort((a, b) => a - b);
      k.ctx.player.yaw = (angs[0]! + angs[1]!) / 2;
      k.step(2);
      return { mode: k.hunt!.mode(), names: k.hunt!.events().map((e) => e.name) };
    }, ZWINGER);
    expect(gathered.mode?.phase).toBe('wait');
    expect(gathered.names).toContain('hunt:finale');
    await shot(page, 'hunt-ext-finale-circle');

    // lie down (X) and light the lantern (L): one by one they lie down, the eyes go out
    const calm = await page.evaluate(() => {
      const k = window.kq!;
      k.press('KeyX', 2);
      k.press('KeyL', 2);
      // look between two neighbouring hounds of the circle
      const pl = k.ctx.player.position;
      const angs = k.hunt!.state()!.agents.filter((a) => a.kind === 'hound').map((a) => Math.atan2(-(a.x - pl.x), -(a.z - pl.z)));
      angs.sort((a, b) => a - b);
      k.ctx.player.yaw = (angs[0]! + angs[1]!) / 2;
      k.ctx.player.pitch = 0.02;
      k.step(60 * 7);
      return { mode: k.hunt!.mode(), lying: k.hunt!.state()!.agents.filter((a) => (a as { lie?: number }).lie! > 0.9).length };
    });
    expect(calm.mode?.phase).toBe('calm');
    expect(calm.lying).toBeGreaterThanOrEqual(3);
    await shot(page, 'hunt-ext-finale-calm');
    const done = await page.evaluate(() => {
      const k = window.kq!;
      for (let i = 0; i < 12; i++) k.step(120);
      return { mode: k.hunt!.mode(), finale: k.hunt!.events().filter((e) => e.name === 'hunt:finale').map((e) => (e.payload as { outcome: string }).outcome) };
    });
    expect(done.finale).toEqual(['gathered', 'calmed', 'faded']);
    await shot(page, 'hunt-ext-finale-faded');
    expect(errors).toEqual([]);
  });

  test('persistence: an active pack config comes back after a load', async ({ page }) => {
    const errors = trackErrors(page);
    const r = await page.evaluate(
      ({ h, z }) => {
        const k = window.kq!;
        k.setEra('today');
        k.teleport(h.x, h.z, 0, 0);
        k.hunt!.configure({ active: true, mode: 'drive', center: { x: 1200, z: -1400 }, radius: 400, target: z });
        k.step(5);
        const saved = JSON.parse(JSON.stringify(k.hunt!.saved()));
        // a load replaces the state: the slice (as saved) holds the pack, the sim is gone
        k.hunt!.stop();
        const slice = k.ctx.state.slice('hunt', () => ({})) as { pack?: unknown };
        slice.pack = saved;
        k.ctx.events.emit('save:loaded', { slot: 'test' });
        k.step(3);
        return { saved, mode: k.hunt!.mode(), after: k.hunt!.saved() };
      },
      { h: HOHLWEG, z: ZWINGER },
    );
    expect(r.saved.era).toBe('today');
    expect(r.saved.opts.target).toEqual(ZWINGER);
    expect(r.mode?.mode).toBe('drive');
    expect(r.after?.opts.mode).toBe('drive');
    expect(errors).toEqual([]);
  });
});

test.describe('menagerie', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq !== undefined && window.kq.menagerie !== undefined, null, { timeout: 90_000 });
  });

  test('cassowary: it charges, you go down, you get up', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    const charge = await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('1789');
      const p = k.menagerie!.places.cassowary;
      // east of its spot on the meadow, looking west towards the amphitheatre
      k.teleport(p.x + 18, p.z, 270, -3);
      const id = k.menagerie!.spawnInView('cassowary', 16, 0, { id: 'kasuar' });
      const trace: string[] = [];
      // until it runs at you
      for (let i = 0; i < 60; i++) {
        k.step(5);
        const a = k.menagerie!.state()[0]!;
        const pl = k.ctx.player.position;
        const d = Math.hypot(a.x - pl.x, a.z - pl.z);
        trace.push(`${a.state}:${d.toFixed(1)}`);
        if (a.state === 'charge' && d < 7.5) break;
      }
      k.menagerie!.freeze(true);
      k.step(1);
      return { id, a: k.menagerie!.state()[0]!, trace: trace.join(' ') };
    });
    expect(charge.a.state, charge.trace).toBe('charge');
    await shot(page, 'menagerie-cassowary-charge');

    const down = await page.evaluate(() => {
      const k = window.kq!;
      k.menagerie!.freeze(false);
      for (let i = 0; i < 40 && !k.menagerie!.down(); i++) k.step(3);
      const d = k.menagerie!.down();
      k.step(25);
      return { d, frozen: k.ctx.player.frozen, stance: k.ctx.player.stance };
    });
    expect(down.d?.kind).toBe('cassowary');
    expect(down.frozen).toBe(true);
    expect(down.stance).toBe('prone');
    await shot(page, 'menagerie-cassowary-down');
    const up = await page.evaluate(() => {
      const k = window.kq!;
      k.step(60 * 4);
      return { frozen: k.ctx.player.frozen, a: k.menagerie!.state()[0]!, ev: k.menagerie!.events().map((e) => e.name) };
    });
    expect(up.frozen).toBe(false);
    expect(['bored', 'idle']).toContain(up.a.state);
    expect(up.ev).toEqual(expect.arrayContaining(['menagerie:seen', 'menagerie:knockdown']));
    expect(errors).toEqual([]);
  });

  test('1793-07: dromedaries on the dam, the jaguar beyond the lantern light', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackErrors(page);
    await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('1793-07');
      const d = k.menagerie!.places.dromedary;
      k.teleport(d.x - 9, d.z + 6, 300, -2);
      // story path: the cue
      k.ctx.events.emit('story:cue' as never, { id: 'menagerie:spawn', data: { animal: 'dromedary', x: 0, z: 0, id: 'tmp' } } as never);
      k.menagerie!.clear('tmp');
      k.menagerie!.spawnInView('dromedary', 8, 0, { id: 'dromedare', count: 2 });
      k.step(60);
    });
    await shot(page, 'menagerie-dromedaries');
    const blocked = await page.evaluate(() => {
      const k = window.kq!;
      const before = k.ctx.player.position.clone();
      k.press('KeyW', 240);
      const after = k.ctx.player.position;
      const ds = k.menagerie!.state().map((a) => Math.hypot(a.x - after.x, a.z - after.z));
      return { moved: before.distanceTo(after), minD: Math.min(...ds), ev: k.menagerie!.events().map((e) => e.name) };
    });
    expect(blocked.minD).toBeGreaterThan(0.9);
    expect(blocked.moved).toBeLessThan(8.5);

    const jag = await page.evaluate(() => {
      const k = window.kq!;
      k.menagerie!.clear();
      const j = k.menagerie!.places.jaguar;
      // facing away from the fire's glow, into the dark
      k.teleport(j.x - 20, j.z + 10, 345, -1);
      k.lantern!.toggle(true);
      k.menagerie!.spawnInView('jaguar', 17, 6, { id: 'jaguar' });
      k.step(60 * 6);
      // keep it in view for the picture: at the edge of the light, staring
      const pl = k.ctx.player;
      const h = pl.yaw - (8 * Math.PI) / 180;
      k.menagerie!.place('jaguar', pl.position.x - Math.sin(h) * 16, pl.position.z - Math.cos(h) * 16, (-(pl.yaw + Math.PI) * 180) / Math.PI);
      k.menagerie!.setState('jaguar', 'stalk');
      k.menagerie!.freeze(true);
      k.step(30);
      const a = k.menagerie!.state()[0]!;
      return { a, d: Math.hypot(a.x - pl.position.x, a.z - pl.position.z), ev: k.menagerie!.events().map((e) => e.name) };
    });
    expect(jag.d).toBeGreaterThan(12);
    expect(jag.ev).toContain('menagerie:seen');
    await shot(page, 'menagerie-jaguar-eyes');

    // persistence: the spawn is in the slice and comes back after a load; other eras don't show it
    const persist = await page.evaluate(() => {
      const k = window.kq!;
      k.ctx.events.emit('save:loaded', { slot: 'test' });
      k.step(2);
      const here = k.menagerie!.state().length;
      k.setEra('1789');
      k.step(2);
      const there = k.menagerie!.state().length;
      return { here, there, slice: k.state().systems['menagerie'] };
    });
    expect(persist.here).toBe(1);
    expect(persist.there).toBe(0);
    expect(errors).toEqual([]);
  });
});
