import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

/**
 * Chapter 2 "Die Flucht" (content/story/02-kapitel-2.story.json, bible 03-kapitel-2), played
 * headless through window.kq with the real content packs:
 *
 *   field station (Marlene, anchor A) → Q at the park fence → the Warner's trail in the hoarfrost,
 *   the scrap of wool (lantern) → W3 eyes in the fog (lantern off, crouch: they lose interest) →
 *   Orangerie echo → Wachhaus echo + Wachbuch → round the locked gate, through the south wing's
 *   Durchfahrt and the vestibule to the Kabinett door (walked, not teleported) → the warning, the
 *   farewell → back home, first confirmed set (Spurenleser 2) → anchor B → the departure, the
 *   choice at the gate (lantern) → Hanne and Jost → the par force hunt, run by a bot along the
 *   escape route (Durchfahrt, terrace, round the walls, W4 "Das sind Kalköfen" with the pack
 *   holding still, down the slope to the pond) → the dam → home → case complete → cliffhanger.
 *
 * A second test: caught by the hunt → the station, the finds since the last confirmation are
 * gone, anchor B leads straight back and the horn sounds again.
 *
 * Screenshots: test-results/screens/ch-k2-*.png.
 */
const SCREENS = 'test-results/screens';
mkdirSync(SCREENS, { recursive: true });
const URL = './?notitle&nosave&fresh&manual';
const CASE = 'case.k2';

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

type Ev = [string, unknown];
async function recordEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { k2Events: [string, unknown][] };
    w.k2Events = [];
    const quiet = new Set(['player:step', 'hunt:alert', 'lantern:oil', 'fire:progress', 'oblivion:progress', 'hunt:read']);
    window.kq!.ctx.events.onAny((name, payload) => {
      if (!quiet.has(name)) w.k2Events.push([name, structuredClone(payload)]);
    });
  });
}
const events = (page: Page, name: string) =>
  page.evaluate((name) => (window as unknown as { k2Events: [string, unknown][] }).k2Events.filter(([n]) => n === name), name) as Promise<Ev[]>;
const payloads = async (page: Page, name: string) => (await events(page, name)).map(([, p]) => p);
const said = async (page: Page) => ((await payloads(page, 'dialogue:say')) as { id?: string }[]).map((p) => p.id ?? '');

/** Screenshots at 1280×720; in between the game renders small (headless software GL is slow). */
const SMALL = { width: 480, height: 270 };
async function shot(page: Page, name: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SCREENS}/ch-k2-${name}.png`, timeout: 150_000 });
  await page.setViewportSize(SMALL);
}

const story = (page: Page) => page.evaluate(() => window.kq!.story!.state());
const clues = (page: Page) => page.evaluate(() => window.kq!.state().inventory.clues);

/** Let queued story lines and actions run out (game time). */
async function settle(page: Page, seconds = 6): Promise<void> {
  await page.evaluate((s) => {
    const k = window.kq!;
    for (let i = 0; i < s * 4; i++) {
      k.step(15);
      k.story!.finishTyping();
    }
  }, seconds);
}

/** Q in the present at an anchor, fx transition run to its end. */
async function shiftAt(page: Page, x: number, z: number, yaw: number): Promise<void> {
  await page.evaluate(
    ([x, z, yaw]) => {
      const k = window.kq!;
      k.teleport(x, z, yaw, 0);
      k.step(4);
      k.press('KeyQ', 1);
      k.fx!.shiftAt(3.6);
      k.fx!.freeze(false);
      k.step(8);
    },
    [x, z, yaw] as const,
  );
}

/** Hold Q in the past (return home). */
async function holdQ(page: Page): Promise<void> {
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.input.simulate('KeyQ', true);
    k.step(90);
    k.ctx.input.simulate('KeyQ', false);
    k.fx!.shiftAt(3.6);
    k.fx!.freeze(false);
    k.step(8);
  });
}

/** Listen to an echo with E held (as a player would), then let it play out. */
async function listen(page: Page, clue: string): Promise<void> {
  expect(await page.evaluate((c) => window.kq!.chronik!.status(c), clue)).toBe('available');
  await page.evaluate(() => window.kq!.press('KeyE', 70));
  expect((await page.evaluate(() => window.kq!.chronik!.echo())).id).toBe(clue);
}
async function endEcho(page: Page): Promise<void> {
  await page.evaluate(() => {
    const k = window.kq!;
    k.chronik!.advanceEcho(200);
    k.step(2);
    k.ctx.ui.modals.closeAll();
    k.step(2);
  });
}

interface WalkLog {
  reached: boolean;
  x: number;
  z: number;
  room: string;
  caught: boolean;
  beat: string;
  t: number;
}
/**
 * Walk (or sprint) along waypoints with the movement keys, like a player holding W and steering.
 * Stops early when caught or (optionally) when the story leaves `beat`.
 */
async function walk(page: Page, pts: [number, number][], o: { sprint?: boolean; crouch?: boolean; chunk?: number; maxSeconds?: number; dodge?: boolean } = {}): Promise<WalkLog> {
  return page.evaluate(
    ([pts, o]) => {
      const k = window.kq!;
      const P = k.ctx.player;
      const chunk = o.chunk ?? 20;
      const max = ((o.maxSeconds ?? 240) * 60) / chunk;
      let i = 0;
      let n = 0;
      let last = { x: P.position.x, z: P.position.z };
      let stuck = 0;
      let caught = false;
      const t0 = k.ctx.loop.time;
      while (i < pts.length && n++ < max) {
        const [tx, tz] = pts[i]!;
        const p = P.position;
        if (Math.hypot(tx - p.x, tz - p.z) < 1.6) {
          i++;
          continue;
        }
        let yaw = Math.atan2(-(tx - p.x), -(tz - p.z));
        // dodge: a rider or hound right ahead → veer off a little (what a player does)
        if (o.dodge) {
          const sim = k.hunt!.sim();
          for (const a of sim?.agents ?? []) {
            const dx = a.x - p.x;
            const dz = a.z - p.z;
            const d = Math.hypot(dx, dz);
            if (d > 9) continue;
            const fwd = -(Math.sin(yaw) * dx + Math.cos(yaw) * dz) / d;
            if (fwd > 0.5) yaw += (Math.sin(yaw) * dz - Math.cos(yaw) * dx > 0 ? -0.6 : 0.6) * (1 - d / 9);
          }
        }
        P.yaw = yaw;
        k.ctx.input.simulate('KeyW', true);
        k.ctx.input.simulate('ShiftLeft', !!o.sprint);
        k.step(chunk);
        const h = k.hunt!.state();
        if (h?.caught) {
          caught = true;
          break;
        }
        const q = P.position;
        if (Math.hypot(q.x - last.x, q.z - last.z) < 0.02 * chunk) stuck++;
        else stuck = 0;
        last = { x: q.x, z: q.z };
        if (stuck > 12) break;
      }
      k.ctx.input.simulate('KeyW', false);
      k.ctx.input.simulate('ShiftLeft', false);
      k.step(1);
      const p = P.position;
      return {
        reached: i >= pts.length,
        x: Math.round(p.x * 10) / 10,
        z: Math.round(p.z * 10) / 10,
        room: String(k.ctx.state.state.flags['interior.room'] ?? ''),
        caught,
        beat: k.story!.state().beat ?? '',
        t: Math.round(k.ctx.loop.time - t0),
      };
    },
    [pts, o] as const,
  );
}

async function boot(page: Page): Promise<void> {
  await page.goto(URL);
  await page.waitForFunction(() => !!window.kq?.story && !!window.kq?.chronik && !!window.kq?.hunt && !!window.kq?.fx && !!window.kq?.npc && !!window.kq?.lantern && !!window.kq?.skills, null, {
    timeout: 180_000,
  });
  await recordEvents(page);
  await page.setViewportSize(SMALL);
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.state.mutable.flags['barks.quiet'] = true; // clean pictures, deterministic lines
    // what the prologue and chapter 1 leave behind (no unlock cards over the pictures)
    for (const [id, tier] of [['relief', 2], ['kartograf', 2], ['baumeister', 1], ['spurenleser', 1]] as const) k.skills!.grant(id, tier, true);
    k.story!.start('Alex');
    k.story!.goto('k2', 'k2_0');
    k.step(4);
  });
}

// the escape route of the par force hunt (walls B11 / B12 are solid; checked against the footprints)
const ESCAPE: [number, number][] = [
  [1233, -1104],
  [1234, -1092],
  [1235, -1080],
  [1237, -1066],
  [1265, -1035],
  [1290, -1022],
  [1290, -1000],
  [1272, -990],
  [1278, -968],
  [1290, -958],
  [1318, -954],
  [1320, -940],
  [1324, -926],
  [1290, -914],
  [1250, -914],
  [1200, -912],
  [1100, -905],
  [1000, -895],
  [955, -888],
  [930, -884],
];

test('chapter 2: Die Flucht, played through', async ({ page }) => {
  test.setTimeout(2_700_000); // headless software GL: the 1280×720 pictures take a while
  const errors = trackErrors(page);
  await boot(page);

  // ---- 2.0 field station: Marlene, the anchor at the park fence ------------------------------
  await settle(page, 30);
  let s = await story(page);
  expect(s).toMatchObject({ chapter: 'k2', beat: 'k2_0', era: 'today' });
  expect(s.objective).toMatchObject({ id: 'k2.zaun', x: 1680, z: -400 });
  expect(await clues(page)).toContain('clue.k2.marlene');
  expect(await said(page)).toEqual(expect.arrayContaining(['marlene.k2.morgen', 'marlene.k2.pfeiffer', 'laub.k2.start']));
  expect(await page.evaluate(() => window.kq!.state().inventory.nouns)).toEqual(expect.arrayContaining(['n.pfeiffer', 'n.3_februar']));
  await page.evaluate(() => window.kq!.teleport(757.5, -899, 4, -3));
  await shot(page, '01-station');

  // ---- 2.1 Q at the fence: the frost night, 7 min of oil, the Warner's trail -----------------
  await shiftAt(page, 1684, -398, 270);
  s = await story(page);
  expect(s.era).toBe('1793-02');
  expect(s.beat).toBe('k2_1');
  await settle(page, 2);
  const meters = await page.evaluate(() => window.kq!.story!.meters());
  expect(meters['oil']).toMatchObject({ id: 'oil', seconds: 420, era: '1793-02' });
  const tr = await page.evaluate(() => window.kq!.hunt!.tracks());
  expect(tr.boot).toBeGreaterThan(300); // the Warner's prints, fence → Wachhaus
  expect(await page.evaluate(() => window.kq!.lantern!.state().lit)).toBe(true);
  // the scrap of wool needs the lantern; E examines it
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1674, -405.5, 323, -24);
    for (let i = 0; i < 16; i++) k.step(1); // markers refresh per rendered frame
  });
  expect(await page.evaluate(() => window.kq!.chronik!.status('clue.k2.zaun'))).toBe('available');
  await shot(page, '02-zaun');
  await page.evaluate(() => {
    window.kq!.press('KeyE', 2);
    window.kq!.step(3);
  });
  await expect(page.getByTestId('chronik-card')).toHaveAttribute('data-clue', 'clue.k2.zaun');
  await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
  await settle(page, 10);
  s = await story(page);
  expect(s.beat).toBe('k2_2');
  expect(await said(page)).toEqual(expect.arrayContaining(['laub.k2.zaun', 'laub.k2.richtung']));
  // the trail up the avenue, seen from the fence (Relief 1 lights the prints)
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1560, -440, 318, -32);
    k.step(4);
  });
  await shot(page, '03-spur');

  // ---- 2.2 W3: the horn, eyes in the fog; lantern off + crouch → they lose interest ----------
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1532, -484, 330, 0); // further up the avenue, on the trail
    k.step(4);
  });
  const w3 = await walk(page, [
    [1520, -506],
    [1503, -536],
  ]);
  expect(w3.reached).toBe(true);
  // Laub's warning first, then the eyes open 30 m to the right
  await page.evaluate(() => {
    const k = window.kq!;
    k.step(120);
    k.story!.finishTyping();
  });
  expect(await said(page)).toContain('laub.k2.augen');
  await page.evaluate(() => {
    const k = window.kq!;
    k.lantern!.toggle(false);
    k.press('KeyC', 1);
    k.step(240);
  });
  let hunt = await page.evaluate(() => window.kq!.hunt!.state());
  expect(hunt?.active).toBe(true);
  expect(hunt?.state).not.toBe('chasing');
  expect(await page.evaluate(() => window.kq!.state().flags['chronik.noLoss'])).toBe(true);
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.player.yaw = (-48 * Math.PI) / 180;
    k.step(40);
  });
  await shot(page, '04-augen');
  await page.evaluate(() => window.kq!.step(60 * 8));
  expect(await said(page)).toContain('laub.k2.weg');
  expect(await page.evaluate(() => window.kq!.hunt!.state())).toBeNull();
  await page.evaluate(() => window.kq!.press('KeyC', 1));

  // ---- 2.3 / 2.4: the avenue to the Orangerie (walked), its echo, the Wachhaus ---------------
  const allee = await walk(page, [
    [1480, -580],
    [1460, -615],
  ]);
  expect(allee.reached).toBe(true);
  // (the avenue in between is the same open slope; the last stretch round the wall is walked)
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1347, -817, 330, 0);
    k.step(4);
  });
  const mauer = await walk(page, [
    [1300, -905],
    [1320, -940],
    [1300, -956],
  ], { sprint: true });
  expect(mauer.reached).toBe(true);
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 40 && !k.chronik!.echo().id; i++) k.step(15);
  });
  s = await story(page);
  expect(s.beat).toBe('k2_3');
  expect((await page.evaluate(() => window.kq!.chronik!.echo())).id).toBe('clue.k2.orangerie');
  await page.evaluate(() => {
    const k = window.kq!;
    k.chronik!.advanceEcho(8);
    k.step(2);
  });
  await shot(page, '05-orangerie');
  await endEcho(page);
  expect(await clues(page)).toContain('clue.k2.orangerie');
  await settle(page, 3);
  expect((await story(page)).beat).toBe('k2_4');
  // the trail turns north: round the wall B11, the terrace, past the west end of the south wing
  const zurWache = await walk(page, [
    [1272, -990],
    [1287, -1000],
    [1287, -1020],
    [1262, -1035],
    [1240, -1062],
    [1200, -1074],
    [1188, -1084],
    [1186, -1098],
    [1184, -1113],
  ], { sprint: true });
  expect(zurWache.reached).toBe(true);
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 40 && !k.chronik!.echo().id; i++) {
      k.step(15);
      k.story!.finishTyping();
    }
  });
  expect((await page.evaluate(() => window.kq!.chronik!.echo())).id).toBe('clue.k2.wache');
  await page.evaluate(() => {
    const k = window.kq!;
    k.chronik!.advanceEcho(10);
    k.step(2);
  });
  await shot(page, '06-wache');
  await endEcho(page);
  expect(await clues(page)).toContain('clue.k2.wache');
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1181.5, -1121.5, 225, -25);
    for (let i = 0; i < 16; i++) k.step(1); // markers refresh per rendered frame
  });
  expect(await page.evaluate(() => window.kq!.chronik!.status('clue.k2.wachbuch'))).toBe('available');
  await page.evaluate(() => {
    window.kq!.press('KeyE', 2);
    window.kq!.step(3);
  });
  await expect(page.getByTestId('chronik-card')).toHaveAttribute('data-clue', 'clue.k2.wachbuch');
  await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
  await settle(page, 20);
  expect(await clues(page)).toEqual(expect.arrayContaining(['clue.k2.wachbuch', 'clue.k2.horstmann']));
  s = await story(page);
  expect(s.beat).toBe('k2_5');
  expect(await said(page)).toEqual(expect.arrayContaining(['laub.k2.horstmann', 'laub.k2.gitter']));

  // ---- 2.6 into the palace (walked): Durchfahrt → court → vestibule → bedroom → Kabinett door --
  const insSchloss = await walk(page, [
    [1186, -1098],
    [1188, -1084],
    [1200, -1074],
    [1235, -1076],
    [1235, -1084],
    [1234, -1092],
    [1233, -1102],
    [1240, -1118],
    [1250, -1125],
    [1258, -1125],
    [1266, -1124],
    [1267, -1119],
    [1268, -1113.5],
  ], { sprint: true });
  expect(insSchloss).toMatchObject({ reached: true, room: 'B01.1.eg-schlafzimmer' });
  expect(((await payloads(page, 'room:enter')) as { roomId: string }[]).map((r) => r.roomId)).toEqual(
    expect.arrayContaining(['B02.1.eg-durchfahrt', 'B01.1.eg-vestibuel', 'B01.1.eg-schlafzimmer']),
  );
  expect(await said(page)).toContain('laub.k2.vestibuel');
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.player.yaw = 0;
    k.step(10);
  });
  await listen(page, 'clue.k2.warnung');
  await page.evaluate(() => {
    const k = window.kq!;
    k.chronik!.advanceEcho(14);
    k.step(2);
  });
  await shot(page, '07-warnung');
  await endEcho(page);
  await settle(page, 20);
  expect(await clues(page)).toContain('clue.k2.warnung');
  expect(await said(page)).toEqual(expect.arrayContaining(['laub.k2.schnupfen', 'laub.k2.dukat']));
  expect(await page.evaluate(() => window.kq!.state().flags['k2.anker_b'])).toBe(true);
  expect((await story(page)).beat).toBe('k2_6');
  await listen(page, 'clue.k2.abschied');
  await endEcho(page);
  await settle(page, 14);
  expect(await said(page)).toContain('laub.k2.sichern');
  expect((await story(page)).beat).toBe('k2_7');
  // the empty outline in the dust
  expect(await page.evaluate(() => window.kq!.chronik!.examine('clue.k2.jagdmesser'))).toBe(true);
  await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
  await settle(page, 10);
  expect(await said(page)).toEqual(expect.arrayContaining(['laub.k2.jagdmesser', 'laub.k2.jagdmesser.b']));

  // ---- Laub's advice: go home and secure → first confirmed set → Spurenleser 2 ----------------
  await holdQ(page);
  s = await story(page);
  expect(s.era).toBe('today');
  expect(s.objective).toMatchObject({ id: 'k2.heim', x: 1222, z: -1118 });
  await settle(page, 6);
  expect(await clues(page)).toContain('clue.k2.laub_treue');
  const first = await page.evaluate((c) => {
    const k = window.kq!.chronik!;
    k.fill(c, 'entry.k2.1', 'wann', 'n.9_februar');
    k.fill(c, 'entry.k2.2', 'wer', 'n.pfeiffer');
    k.fill(c, 'entry.k2.3', 'wo', 'n.parkzaun');
    k.fill(c, 'entry.k2.4', 'wie', 'n.unglaubwuerdig');
    k.fill(c, 'entry.k2.4', 'was', 'n.dukaten');
    k.fill(c, 'entry.k2.5', 'was', 'n.galerie_sammlung');
    return k.check(c);
  }, CASE);
  expect(first?.correct).toBe(true);
  expect(first?.confirmed.length).toBeGreaterThanOrEqual(3);
  await settle(page, 4);
  expect(await page.evaluate(() => window.kq!.state().skills['spurenleser'])).toBe(2);
  await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
  await settle(page, 8); // the unlock card has its moment

  // ---- 2.7 anchor B: the departure, the choice at the gate (lantern up) ------------------------
  await shiftAt(page, 1214, -1117, 270);
  await settle(page, 4);
  s = await story(page);
  expect(s.era).toBe('1793-02');
  expect(s.beat).toBe('k2_8');
  expect(await page.evaluate(() => window.kq!.npc!.list().map((n) => n.npc))).toContain('hanne');
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 40 && !k.chronik!.echo().id; i++) {
      k.step(15);
      k.story!.finishTyping();
    }
  });
  expect((await page.evaluate(() => window.kq!.chronik!.echo())).id).toBe('clue.k2.fackeln');
  await page.evaluate(() => {
    const k = window.kq!;
    k.lantern!.toggle(true);
    k.chronik!.advanceEcho(10);
    k.step(2);
  });
  await expect(page.locator('.kqs-choice')).toBeVisible();
  await shot(page, '08-abfahrt');
  await endEcho(page);
  await settle(page, 4);
  expect(await page.evaluate(() => window.kq!.state().flags['flag.k2_tor'])).toBe('leuchten');
  s = await story(page);
  expect(s.beat).toBe('k2_9');
  expect(await clues(page)).toEqual(expect.arrayContaining(['clue.k2.fackeln', 'clue.k2.esebeck']));

  // ---- Hanne and Jost: talk (readings), then the horn --------------------------------------------
  await settle(page, 4);
  await page.evaluate(() => {
    const k = window.kq!;
    k.npc!.talk('hanne');
    k.npc!.drain();
    for (const tp of ['bauer', 'warnen', 'rohrbach']) {
      k.npc!.ask(tp);
      k.npc!.drain();
    }
    k.npc!.close();
    k.step(10);
  });
  expect(await clues(page)).toContain('clue.k2.hanne');
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1218, -1126, 160, 0);
    k.npc!.talk('jost');
    k.npc!.drain();
    for (const tp of ['bauer', 'fuehrer']) {
      k.npc!.ask(tp);
      k.npc!.drain();
    }
    k.step(2);
  });
  await shot(page, '09-jost');
  await page.evaluate(() => {
    const k = window.kq!;
    k.npc!.close();
    k.step(10);
  });
  expect(await clues(page)).toContain('clue.k2.jost');
  expect((await story(page)).beat).toBe('k2_10');

  // ---- 2.8 the par force hunt: horn, five hounds and the Pikeur; run! ---------------------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1224, -1116, 200, 0);
    for (let i = 0; i < 160 && !k.hunt!.state(); i++) {
      k.step(15);
      k.story!.finishTyping();
    }
  });
  hunt = await page.evaluate(() => window.kq!.hunt!.state());
  expect(hunt?.active).toBe(true);
  expect(await page.evaluate(() => window.kq!.hunt!.mode()?.mode)).toBe('parforce');
  expect(await said(page)).toEqual(expect.arrayContaining(['jost.k2.04', 'jost.k2.06']));
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.player.yaw = (-20 * Math.PI) / 180;
    k.step(150);
  });
  await shot(page, '10-pikeur');
  // a player who gets caught wakes at the station and comes straight back through anchor B
  // (bible 2.8 "Gestellt"); the bot gets three runs, a person usually needs one or two
  let escaped = false;
  let runs = 0;
  let sawHold = false;
  while (!escaped && runs < 3) {
    runs++;
    if (runs > 1) {
      await page.evaluate(() => {
        const k = window.kq!;
        for (let i = 0; i < 60 && k.story!.state().era !== 'today'; i++) k.step(10);
        k.step(200);
        k.ctx.ui.modals.closeAll();
      });
      s = await story(page);
      expect(s).toMatchObject({ era: 'today', beat: 'k2_10' });
      expect(s.objective).toMatchObject({ id: 'k2.heim', x: 1222, z: -1118 });
      await shiftAt(page, 1222, -1118, 270);
      await page.evaluate(() => {
        const k = window.kq!;
        k.teleport(1224, -1116, 200, 0);
        for (let i = 0; i < 160 && !k.hunt!.state(); i++) {
          k.step(15);
          k.story!.finishTyping();
        }
        k.step(150);
      });
      expect(await page.evaluate(() => window.kq!.hunt!.mode()?.mode)).toBe('parforce');
    }
    const legA = await walk(page, ESCAPE.slice(0, 9), { sprint: true, dodge: true, chunk: 8 });
    if (legA.caught) {
      console.log('[k2] caught (to the parterre):', JSON.stringify(legA));
      continue;
    }
    expect(legA.reached).toBe(true);
    if (!sawHold) {
      // W4 fired at the parterre: the pack holds still, the memory plays
      expect(await payloads(page, 'story:cue')).toContainEqual({ id: 'hunt:hold', data: { seconds: 8 } });
      expect(await page.evaluate(() => window.kq!.hunt!.sim()?.frozen)).toBe(true);
      await shot(page, '11-kalkoefen');
      sawHold = true;
    }
    const legB = await walk(page, ESCAPE.slice(9), { sprint: true, dodge: true, chunk: 8 });
    if (legB.caught) {
      console.log('[k2] caught (to the dam):', JSON.stringify(legB));
      continue;
    }
    escaped = true;
  }
  console.log(`[k2] par force hunt: escaped on run ${runs}`);
  expect(escaped).toBe(true);
  await page.evaluate(() => {
    const k = window.kq!;
    k.chronik!.advanceEcho(200);
    k.ctx.ui.modals.closeAll();
    k.step(30);
  });
  expect((await payloads(page, 'hunt:goal')).length).toBe(1);
  expect(await clues(page)).toEqual(expect.arrayContaining(['clue.k2.landremont', 'clue.k2.laterne']));
  expect(await said(page)).toContain('laub.k2.lichter_licht');
  s = await story(page);
  expect(s.beat).toBe('k2_11');
  await settle(page, 20);
  expect(await said(page)).toEqual(expect.arrayContaining(['laub.k2.wasser', 'laub.k2.kalkoefen', 'laub.k2.tor_licht']));
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(905, -900, 60, -4);
    k.step(4);
  });
  await shot(page, '12-damm');

  // ---- 2.10 home: the rest of the case, the cliffhanger ------------------------------------------
  await holdQ(page);
  await settle(page, 8);
  s = await story(page);
  expect(s.beat).toBe('k2_12');
  expect(await said(page)).toContain('marlene.k2.abend');
  const hanne = (await clues(page)).includes('clue.k2.hanne');
  const second = await page.evaluate(([c, hanne]) => {
    const k = window.kq!.chronik!;
    for (const [e, b, n] of [
      ['entry.k2.1', 'wann', 'n.9_februar'],
      ['entry.k2.2', 'wer', 'n.pfeiffer'],
      ['entry.k2.3', 'wo', 'n.parkzaun'],
      ['entry.k2.4', 'wie', 'n.unglaubwuerdig'],
      ['entry.k2.4', 'was', 'n.dukaten'],
      ['entry.k2.5', 'was', 'n.galerie_sammlung'],
      ['entry.k2.6', 'was', 'n.kalkoefen'],
      ['entry.k2.7', 'was', 'n.r_laterne'],
      ['entry.k2.8', 'warum', hanne ? 'n.r_dorf' : 'n.r_treu'], // Hanne's reading is lost if the pack caught you
      ['entry.k2.9', 'wie', 'n.r_gewarnt'],
    ] as const)
      k.fill(c, e, b, n);
    k.open(c);
    return k.check(c);
  }, [CASE, hanne] as const);
  expect(second?.correct).toBe(true);
  await page.waitForTimeout(600);
  await shot(page, '13-chronik');
  await page.evaluate(() => {
    const k = window.kq!;
    k.chronik!.close();
    k.ctx.ui.modals.closeAll();
  });
  await settle(page, 6);
  expect(await page.evaluate(() => window.kq!.state().skills['kartograf'])).toBe(3);
  s = await story(page);
  expect(s.beat).toBe('k2_13');
  await page.evaluate(() => window.kq!.teleport(757.5, -899, 4, -3));
  await settle(page, 4);
  await shot(page, '14-rauch');
  expect(await said(page)).toEqual(expect.arrayContaining(['laub.k2.ende', 'laub.k2.ende.b']));
  await settle(page, 16);
  s = await story(page);
  expect(s.chapter).toBe('k3');
  expect(errors).toEqual([]);
});

test('chapter 2: caught in the hunt → home, finds lost, anchor B back into the hunt', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('k2', 'k2_10');
    k.step(4);
    // as if played: the Wachbuch read (unconfirmed) → anchor B free
    k.chronik!.examine('clue.k2.wachbuch');
    k.ctx.ui.modals.closeAll();
    k.step(10);
  });
  expect(await page.evaluate(() => window.kq!.state().flags['k2.anker_b'])).toBe(true);
  await shiftAt(page, 1222, -1118, 270);
  expect((await story(page)).era).toBe('1793-02');
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 160 && !k.hunt!.state(); i++) {
      k.step(15);
      k.story!.finishTyping();
    }
  });
  expect(await page.evaluate(() => window.kq!.hunt!.mode()?.mode)).toBe('parforce');
  // out on the terrace, standing still: they get you
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1225, -1068, 270, 0);
    for (let i = 0; i < 200 && !k.hunt!.state()?.caught; i++) k.step(15);
  });
  expect(await page.evaluate(() => window.kq!.hunt!.state()?.caught)).toBeTruthy();
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 60 && k.story!.state().era !== 'today'; i++) k.step(10);
    k.step(200);
  });
  const s = await story(page);
  expect(s.era).toBe('today');
  expect(s.beat).toBe('k2_10');
  expect(await clues(page)).not.toContain('clue.k2.wachbuch');
  expect(s.objective).toMatchObject({ id: 'k2.heim', x: 1222, z: -1118 });
  // anchor B: straight back into the court, the horn sounds again
  await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
  await shiftAt(page, 1222, -1118, 270);
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 160 && !k.hunt!.state(); i++) {
      k.step(15);
      k.story!.finishTyping();
    }
  });
  expect(await page.evaluate(() => window.kq!.hunt!.mode()?.mode)).toBe('parforce');
  expect((await payloads(page, 'hunt:start')).length).toBe(2);
  expect(errors).toEqual([]);
});
