import { type Page, expect, test } from '@playwright/test';
import { SCREENS, trackErrors } from './helpers/common';

/**
 * Third-person camera, playtest round 10 (src/player/camera.ts, src/player/seeThrough.ts):
 * the F-03 slope fight among the trunks (and the model trees + ferns on Mittel), the F-07 dodges
 * on the slope below the hohe Stufe, a Streuner at the lens (F-08), the Küchenhof by the
 * Nordflügel stairs (F-35), the Registratur and a conversation with Soll (F-31).
 * `kq.step(n)` draws one frame at its end, and the rig moves only when a frame is drawn, so the
 * settling below steps one tick per frame. Screenshots: test-results/screens/camera-<tag>-*.png
 * (KQ_CAM_TAG, default "after"; "before" runs the probe without the assertions).
 */
const TAG = process.env.KQ_CAM_TAG ?? 'after';
const AFTER = TAG !== 'before';

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${SCREENS}/camera-${TAG}-${name}.png` });
}

interface View {
  /** The character's head / chest in normalised screen coordinates. */
  headX: number;
  headY: number;
  chestY: number;
  inFrame: boolean;
  /** Lens to the head (m). */
  head: number;
  dist: number;
  /** The lens's walkable space (−1 outdoors) and the character's. */
  lensSpace: number;
  space: number;
  indoor: number;
  rise: number;
  crane: number;
  enemyLift: number;
  focus: number;
  fightHints: number;
  see: boolean;
}

async function view(page: Page): Promise<View> {
  return page.evaluate(() => {
    const k = window.kq!;
    const cam = k.ctx.camera;
    cam.updateMatrixWorld();
    const p = k.ctx.player.renderPos;
    const eye = k.ctx.player.eyeHeight;
    const h = cam.position.clone().set(p.x, p.y + eye, p.z).project(cam);
    const c = cam.position.clone().set(p.x, p.y + eye * 0.6, p.z).project(cam);
    const st = k.camera?.state() ?? { indoor: -1, rise: -1, crane: -1, enemyLift: -1, focus: -1, fightHints: -1, see: false };
    const r = (v: number) => Math.round(v * 100) / 100;
    return {
      headX: r(h.x),
      headY: r(h.y),
      chestY: r(c.y),
      inFrame: Math.abs(h.x) < 0.95 && Math.abs(h.y) < 0.95 && h.z < 1 && Math.abs(c.y) < 0.98,
      head: r(Math.hypot(cam.position.x - p.x, cam.position.y - (p.y + eye), cam.position.z - p.z)),
      dist: r(k.ctx.player.rig.distance),
      lensSpace: k.ctx.world.spaceAt?.(cam.position.x, cam.position.z, p.y) ?? -1,
      space: k.ctx.world.spaceAt?.(p.x, p.z, p.y) ?? -1,
      indoor: r(st.indoor),
      rise: r(st.rise),
      crane: r(st.crane),
      enemyLift: r(st.enemyLift),
      focus: r(st.focus),
      fightHints: st.fightHints,
      see: st.see,
    };
  });
}

/** Advance `n` ticks, drawing a frame after each (the camera eases per drawn frame). */
async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate((n) => {
    for (let i = 0; i < n; i++) window.kq!.step(1);
  }, n);
}

test.describe('third-person camera (round 10)', () => {
  test.describe.configure({ timeout: 420_000 });

  test('F-03 / F-07 / F-08: fights on the forest slopes', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq?.combat !== undefined, null, { timeout: 90_000 });
    await page.evaluate(() => {
      // the staff in hand (a new game picks it up at the trailer): a real fight stance
      const k = window.kq!;
      k.progression!.grant('item.stab.esche', 1, true);
      k.progression!.equip('item.stab.esche');
    });
    // F-03: the slope from the Bauwagen down to the Damm, three Nebellinge, several views. The
    // reported spot (790 / −900) lies inside the Feldstation's 40 m safe ring (no fight starts
    // there); the other two are just outside it, where the fight is on
    for (const [i, at] of [
      { x: 790, z: -900, yaw: 200, fight: false },
      { x: 800, z: -893, yaw: 160, fight: true },
      { x: 803, z: -900, yaw: 250, fight: true },
    ].entries()) {
      await page.evaluate((at) => {
        const k = window.kq!;
        if (k.ctx.era.current !== 'today') k.setEra('today');
        k.combat!.kill();
        k.combat!.god(true);
        k.teleport(at.x, at.z, at.yaw, -12);
        k.step(10);
        const g = `cam.f03.${at.x}`;
        k.combat!.spawn('nebelling', { dist: 4, count: 3, group: g });
        k.step(3);
        // they have seen the character: the fight is on (the camera pulls back and lifts)
        k.combat!.windup(g, undefined, 0.05);
      }, at);
      await frames(page, 45);
      const v = await view(page);
      console.log(TAG, 'F-03', i, JSON.stringify(v));
      await shot(page, `f03-${i}`);
      if (AFTER) {
        expect(v.inFrame, JSON.stringify(v)).toBe(true);
        expect(v.head).toBeGreaterThan(0.8);
        expect(v.see).toBe(true);
        if (at.fight) expect(v.fightHints).toBeGreaterThan(0);
      }
    }
    // F-07: dodges on the slope below the hohe Stufe with two Streuner; the character stays in frame
    await page.evaluate(() => {
      const k = window.kq!;
      k.combat!.kill();
      k.teleport(1210, -960, 200, -12);
      k.step(10);
      k.combat!.spawn('streuner', { dist: 5, count: 2, group: 'cam.f07' });
    });
    await frames(page, 40);
    const dodges: View[] = [];
    for (const [i, key] of ['KeyA', 'KeyS', 'KeyD', 'KeyW', 'KeyS', 'KeyA'].entries()) {
      await page.evaluate((key) => {
        const k = window.kq!;
        k.ctx.input.simulate(key, true);
        k.combat!.dodge();
        for (let j = 0; j < 6; j++) k.step(1);
        k.ctx.input.simulate(key, false);
        for (let j = 0; j < 8; j++) k.step(1);
      }, key);
      const v = await view(page);
      dodges.push(v);
      if (i === 2) await shot(page, 'f07-dodge');
    }
    console.log(TAG, 'F-07', JSON.stringify(dodges.map((d) => [d.inFrame, d.headY, d.head, d.crane, d.rise])));
    if (AFTER) for (const d of dodges) expect(d.inFrame, JSON.stringify(d)).toBe(true);
    // F-08: looking up (a low lens), a Streuner walks into it: the camera lifts over the body
    const placed = await page.evaluate(() => {
      const k = window.kq!;
      const c = k.combat!;
      const e = c.enemies().find((x) => x.group === 'cam.f07');
      if (!e) return null;
      c.freeze(true);
      k.ctx.player.pitch = 0.45;
      for (let j = 0; j < 30; j++) k.step(1);
      const cam = k.ctx.camera.position;
      const y0 = cam.y;
      c.place(e.id, cam.x, cam.z, true);
      return { y0, enemy: e.kind };
    });
    if (placed) {
      await frames(page, 30);
      const lens = await page.evaluate(() => ({ lift: window.kq!.camera?.state().enemyLift ?? -1, hints: window.kq!.camera?.state().fightHints ?? -1, y: window.kq!.ctx.camera.position.y }));
      console.log(TAG, 'F-08', JSON.stringify({ ...placed, ...lens }));
      await shot(page, 'f08-lens');
      if (AFTER && lens.hints > 0) expect(lens.lift).toBeGreaterThan(0.2);
    }
    await page.evaluate(() => window.kq!.combat!.freeze(false));
    expect(errors).toEqual([]);
  });

  test('F-03 on Mittel: model trees and ferns dither in front of the character', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('./?notitle&nosave&fresh&manual&q=med');
    await page.waitForFunction(() => window.kq?.combat !== undefined, null, { timeout: 90_000 });
    await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('today');
      k.combat!.god(true);
      k.teleport(1512, -1300, 230, -10);
      k.step(10);
      k.combat!.spawn('nebelling', { dist: 4.5, count: 3, group: 'cam.grube' });
    });
    await frames(page, 45);
    const v = await view(page);
    console.log(TAG, 'F-21 med', JSON.stringify(v));
    await shot(page, 'f21-med');
    if (AFTER) {
      expect(v.inFrame).toBe(true);
      expect(v.see).toBe(true);
    }
    expect(errors).toEqual([]);
  });

  test('F-35: the Küchenhof by the Nordflügel stairs, a fight with the boom zoomed out', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq?.combat !== undefined && window.kq?.interiors !== undefined, null, { timeout: 90_000 });
    await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('1789');
      k.step(2);
      k.combat!.god(true);
    });
    const bad: string[] = [];
    let n = 0;
    for (const at of [
      { x: 1213, z: -1161.5 },
      { x: 1216, z: -1162.5 },
      { x: 1210, z: -1160.5 },
    ]) {
      for (const yaw of [0, 60, 120, 180, 240, 300]) {
        await page.evaluate(
          ({ at, yaw }) => {
            const k = window.kq!;
            k.combat!.kill();
            k.teleport(at.x, at.z, yaw, -14);
            k.interiors!.build();
            // the longest boom (the wheel all the way out) on top of the fight's pull-back
            k.ctx.player.rig.zoom = 8;
            k.step(4);
            k.combat!.spawn('mahnbrief', { dist: 5, count: 3, group: `cam.f35.${yaw}` });
            k.combat!.freeze(true);
            for (let j = 0; j < 12; j++) k.step(1);
          },
          { at, yaw },
        );
        const v = await view(page);
        if (v.lensSpace !== -1 || !v.inFrame) bad.push(`${at.x}/${at.z} yaw ${yaw}: ${JSON.stringify(v)}`);
        if (yaw === 180 || yaw === 0) await shot(page, `f35-${n++}`);
      }
    }
    console.log(TAG, 'F-35 bad', bad.length, bad.join('\n'));
    if (AFTER) expect(bad).toEqual([]);
    await page.evaluate(() => {
      window.kq!.ctx.player.rig.zoom = 3.6;
      window.kq!.combat!.freeze(false);
    });
    expect(errors).toEqual([]);
  });

  test('F-31: the Registratur and a conversation with Soll', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('./?notitle&nosave&fresh&manual');
    await page.waitForFunction(() => window.kq?.npc !== undefined && window.kq?.interiors !== undefined, null, { timeout: 90_000 });
    const ok = await page.evaluate(() => {
      const k = window.kq!;
      k.setEra('1789');
      k.step(1);
      return k.interiors!.enter('B03.1.eg-registratur', { u: 0.2, v: 0.5, toU: 1, toV: 0.5, pitch: -5 });
    });
    expect(ok).toBe(true);
    await frames(page, 45);
    const room = await view(page);
    console.log(TAG, 'F-31 room', JSON.stringify(room));
    await shot(page, 'f31-room');
    if (AFTER) {
      expect(room.indoor).toBeGreaterThan(0.9);
      expect(room.lensSpace).toBe(room.space);
      expect(room.inFrame).toBe(true);
      expect(room.head).toBeGreaterThan(0.9);
    }
    // a second view: turned towards the window wall
    await page.evaluate(() => {
      window.kq!.ctx.player.yaw += Math.PI / 2;
    });
    await frames(page, 40);
    const room2 = await view(page);
    console.log(TAG, 'F-31 room2', JSON.stringify(room2));
    await shot(page, 'f31-room2');
    if (AFTER) {
      expect(room2.lensSpace).toBe(room2.space);
      expect(room2.inFrame).toBe(true);
    }
    // the conversation: both faces in the frame, above the dialogue box
    const opened = await page.evaluate(() => {
      const k = window.kq!;
      k.ctx.player.yaw -= Math.PI / 2;
      const p = k.ctx.player.position;
      const f = k.ctx.player.forward();
      k.npc!.spawn({ npc: 'soll', x: p.x + f.x * 1.8, z: p.z + f.z * 1.8, era: '1789', yaw: 0, room: 'B03.1.eg-registratur', chapter: 'k1' });
      k.step(10);
      return k.npc!.talk('soll');
    });
    expect(opened).toBe(true);
    await frames(page, 100);
    const talk = await page.evaluate(() => {
      const k = window.kq!;
      const n = k.npc!.list().find((x) => x.npc === 'soll')!;
      const cam = k.ctx.camera;
      cam.updateMatrixWorld();
      const pl = k.ctx.player.renderPos;
      const me = cam.position.clone().set(pl.x, pl.y + k.ctx.player.eyeHeight, pl.z).project(cam);
      const sp = cam.position.clone().set(n.x, n.y + 1.6, n.z).project(cam);
      const r = (v: number) => Math.round(v * 100) / 100;
      return { me: { x: r(me.x), y: r(me.y), z: me.z }, sp: { x: r(sp.x), y: r(sp.y), z: sp.z }, focus: k.camera?.state().focus ?? -1, lensSpace: k.camera?.state().lensSpace ?? -9, space: k.camera?.state().space ?? -9 };
    });
    console.log(TAG, 'F-31 talk', JSON.stringify(talk));
    await shot(page, 'f31-talk');
    if (AFTER) {
      expect(talk.focus).toBeGreaterThan(0.9);
      expect(talk.lensSpace).toBe(talk.space);
      for (const q of [talk.me, talk.sp]) {
        expect(q.z).toBeLessThan(1);
        expect(Math.abs(q.x)).toBeLessThan(0.92);
        // above the dialogue box (it covers the lower third)
        expect(q.y).toBeGreaterThan(-0.3);
      }
      expect(Math.abs(talk.me.x - talk.sp.x)).toBeGreaterThan(0.2);
    }
    expect(errors).toEqual([]);
  });
});
