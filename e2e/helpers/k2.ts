import { type Page, expect } from '@playwright/test';
import { type PlayOptions, SCREENS } from './common';
import { waitForHooks } from './pause';
import { type QW, cna, fight, holdHome, installQuestPlay, putAwayPages, qn, qs, talkQuest, turninMoment, untilQuest } from './prolog';

/**
 * Chapter 2 "Die Flucht" as an action-RPG quest chain (docs/ACTION-RPG.md §11.2), played headless
 * through window.kq with the real content:
 *
 *   station → "Die Spur im Raureif" (Q at the park fence, the scrap of wool, the trail, eyes in the
 *   fog: lantern off and crouch, three Streuner on the trail, the Orangerie's memory) → "Das
 *   Wachbuch" (Irrlichter round the guard fire, then the memory, then the book) → "Die Warnung"
 *   (walked into the palace, the Kabinett door twice, the stance "warum?") → the departure at the
 *   gate (lantern) → Jost's "Die Parforcejagd" (the hunt is run, never fought; W4 "Das sind
 *   Kalköfen"; at the dam the Pikeur stands — struck back, he rides off) → home, the stance "an
 *   seiner Stelle" → the cliffhanger.
 *
 * Used by e2e/chapter-k2.spec.ts and e2e/campaign.spec.ts. Screenshots: ch-k2-*.png, cna-k2-*.png.
 */
let SHOTS = true;
export const URL = './?notitle&nosave&fresh&manual';



type Ev = [string, unknown];
/** Record the bus (once per page load); every call starts a fresh list. */
export async function recordEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { k2Events: [string, unknown][] };
    const installed = Array.isArray(w.k2Events);
    w.k2Events = [];
    if (installed) return;
    const quiet = new Set(['player:step', 'hunt:alert', 'lantern:oil', 'fire:progress', 'oblivion:progress', 'hunt:read']);
    window.kq!.ctx.events.onAny((name, payload) => {
      if (!quiet.has(name)) w.k2Events.push([name, structuredClone(payload)]);
    });
  });
}
export const events = (page: Page, name: string) =>
  page.evaluate((name) => (window as unknown as { k2Events: [string, unknown][] }).k2Events.filter(([n]) => n === name), name) as Promise<Ev[]>;
export const payloads = async (page: Page, name: string) => (await events(page, name)).map(([, p]) => p);
export const said = async (page: Page) => {
  const heard = ((await payloads(page, 'dialogue:say')) as { id?: string }[]).map((p) => p.id ?? '');
  // (plus the story's own record: in the campaign chapter 1 runs on into k2_0 before this recorder starts)
  const story = (await page.evaluate(() => window.kq!.story!.state().said)) as string[];
  return [...new Set([...heard, ...story])];
};

/** Screenshots at 1280×720; in between the game renders small (headless software GL is slow). */
export const SMALL = { width: 480, height: 270 };
export async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SCREENS}/ch-k2-${name}.png`, timeout: 150_000 });
  await page.setViewportSize(SMALL);
}

export const story = (page: Page) => page.evaluate(() => window.kq!.story!.state());
export const clues = (page: Page) => page.evaluate(() => window.kq!.state().inventory.clues);

/** Let queued story lines and actions run out (game time). */
export async function settle(page: Page, seconds = 6): Promise<void> {
  await page.evaluate((s) => {
    const k = window.kq!;
    for (let i = 0; i < s * 4; i++) {
      k.step(15);
      k.story!.finishTyping();
    }
  }, seconds);
}

/** Q in the present at an anchor, fx transition run to its end. */
export async function shiftAt(page: Page, x: number, z: number, yaw: number): Promise<void> {
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
export async function holdQ(page: Page): Promise<void> {
  await installQuestPlay(page);
  await holdHome(page);
}

/** Listen to an echo with E held (as a player would), then let it play out. */
export async function listen(page: Page, clue: string): Promise<void> {
  expect(await page.evaluate((c) => window.kq!.chronik!.status(c), clue)).toBe('available');
  await putAwayPages(page);
  await page.evaluate(() => window.kq!.press('KeyE', 70));
  expect((await page.evaluate(() => window.kq!.chronik!.echo())).id).toBe(clue);
}
export async function endEcho(page: Page): Promise<void> {
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
 *
 * `sneak` (crouched, past sentries): like a player who watches the sight cones on the frost, it
 * steps only where no hound will see or hear it within the next second, veers up to 75° to find
 * such a step, otherwise holds still (silent, smaller) or backs away from the nearest hound.
 */
export async function walk(page: Page, pts: [number, number][], o: { sprint?: boolean; crouch?: boolean; chunk?: number; maxSeconds?: number; dodge?: boolean; sneak?: boolean } = {}): Promise<WalkLog> {
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
        // a field-book page held back by a fight comes up later (src/ui/cards.ts): read, put away
        if (k.ctx.ui.modals.count > 0 && !k.story!.choice()) k.ctx.ui.modals.closeAll();
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
        let go = true;
        const sim = o.sneak ? k.hunt!.sim() : null;
        if (sim) {
          // what the cones show (lastSight: the range a calm hound notices you at right now) and
          // how far crouched steps carry (noise 0.18), with a metre to spare
          const sense = sim.tune.sense;
          const hear = 0.18 * sense.hearing * sense.acuity + 1;
          const watched = (x: number, z: number, moving: boolean) =>
            sim.agents.some((a) => {
              // standing, slow or at the end of its beat: it is looking round
              const turning = a.wait > 0 || a.speed < 0.9 || (!!a.target && Math.hypot(a.target.x - a.x, a.target.z - a.z) < 2.5);
              for (const ahead of [0, 0.5, 1]) {
                const hx = a.x - Math.sin(a.heading) * a.speed * ahead;
                const hz = a.z - Math.cos(a.heading) * a.speed * ahead;
                const dx = x - hx;
                const dz = z - hz;
                const d = Math.hypot(dx, dz);
                if (d < (moving ? Math.max(4, hear) : 4)) return true;
                if (d > sim.lastSight * (moving ? 1.1 : 1) + 1) continue;
                if (turning || (-Math.sin(a.heading) * dx - Math.cos(a.heading) * dz) / d > Math.cos((80 * Math.PI) / 180)) return true;
              }
              return false;
            });
          const look = 1.6;
          const free = (y: number) => !watched(p.x - Math.sin(y) * look, p.z - Math.cos(y) * look, true);
          const turn = [0, 25, -25, 50, -50, 75, -75].find((deg) => free(yaw + (deg * Math.PI) / 180));
          if (turn !== undefined) yaw += (turn * Math.PI) / 180;
          else if (!watched(p.x, p.z, false)) go = false;
          else {
            // seen where you stand: back off where it is clear, else away from the nearest hound
            let best = -Infinity;
            for (let j = 0; j < 16; j++) {
              const y = (j / 16) * Math.PI * 2;
              const qx = p.x - Math.sin(y) * look;
              const qz = p.z - Math.cos(y) * look;
              const near = Math.min(...sim.agents.map((a) => Math.hypot(qx - a.x, qz - a.z)));
              const score = (free(y) ? 100 : 0) + near;
              if (score > best) {
                best = score;
                yaw = y;
              }
            }
          }
        }
        P.yaw = yaw;
        k.ctx.input.simulate('KeyW', go);
        k.ctx.input.simulate('ShiftLeft', !!o.sprint);
        k.step(chunk);
        const h = k.hunt!.state();
        if (h?.caught) {
          caught = true;
          break;
        }
        const q = P.position;
        if (go && Math.hypot(q.x - last.x, q.z - last.z) < 0.02 * chunk) stuck++;
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

export async function boot(page: Page): Promise<void> {
  await page.goto(URL);
  await waitForHooks(page, ['story', 'chronik', 'hunt', 'fx', 'npc', 'lantern', 'skills', 'quests', 'combat']);
  await recordEvents(page);
  await installQuestPlay(page);
  await page.setViewportSize(SMALL);
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.state.mutable.flags['barks.quiet'] = true; // clean pictures, deterministic lines
    // what the tour and chapter 1 leave behind (no unlock cards over the pictures)
    for (const [id, tier] of [['relief', 2], ['kartograf', 2], ['baumeister', 1], ['spurenleser', 1]] as const) k.skills!.grant(id, tier, true);
    k.story!.start('Alex');
    k.story!.goto('k2', 'k2_0');
    // a chapter boot: earlier chapters were not played here, their open quests leave the tracker
    for (const id of k.quests!.ids()) if (/^q\.(p|k1)\./.test(id) && k.quests!.state().quests[id]?.state !== 'done') k.quests!.reset(id);
    k.step(4);
  });
}

// the escape route of the par force hunt (walls B11 / B12 are solid; checked against the footprints)
export const ESCAPE: [number, number][] = [
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

/** Face an NPC and take the giver picture (its glyph overhead), at full size. */
async function giverShot(page: Page, npc: string, from: [number, number], name: string): Promise<void> {
  await page.evaluate(
    ([npc, x, z]) => {
      const k = window.kq!;
      const n = k.npc!.list().find((f) => f.npc === npc)!;
      k.teleport(x, z, 0, 0);
      const p = k.ctx.player.position;
      k.ctx.player.yaw = Math.atan2(-(n.x - p.x), -(n.z - p.z));
      k.ctx.player.pitch = -0.04;
      k.step(30);
      k.story!.flush();
    },
    [npc, from[0], from[1]] as const,
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await cna(page, name);
  await page.setViewportSize(SMALL);
}
async function bigFight(page: Page, target: string, name?: string): Promise<number> {
  if (name) await page.setViewportSize({ width: 1280, height: 720 });
  const n = await fight(page, target, { hits: 4, shot: name });
  await page.setViewportSize(SMALL);
  return n;
}

/** The chapter's main playthrough (shared with e2e/campaign.spec.ts). */
export async function playK2(page: Page, o: PlayOptions = {}): Promise<void> {
  SHOTS = o.shots ?? true;
  await recordEvents(page);
  await installQuestPlay(page);
  await o.at?.('k2:start');
  await installQuestPlay(page);
  await page.setViewportSize(SMALL);
  // ---- home at the Quelle: Marlene, Laub's quest "Die Spur im Raureif" ------------------------------
  await settle(page, 30);
  let s = await story(page);
  expect(s).toMatchObject({ chapter: 'k2', beat: 'k2_0', era: 'today' });
  expect(await qs(page, 'q.k2.spur')).toBe('active');
  expect(await clues(page)).toContain('clue.k2.marlene');
  await page.evaluate(() => window.kq!.teleport(1053, -828, 51, -3));
  await shot(page, '01-station');

  // ---- Q at the fence: the frost night, the scrap of wool, the trail -------------------------------
  await shiftAt(page, 1684, -398, 270);
  s = await story(page);
  expect(s.era).toBe('1793-02');
  expect(s.beat).toBe('k2_1');
  expect(await qn(page, 'q.k2.spur', 'zaun')).toBe(1);
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1674, -405.5, 323, -24);
    for (let i = 0; i < 16; i++) k.step(1);
  });
  expect(await page.evaluate(() => window.kq!.chronik!.status('clue.k2.zaun'))).toBe('available');
  await page.evaluate(() => {
    window.kq!.press('KeyE', 2);
    window.kq!.step(3);
    window.kq!.ctx.ui.modals.closeAll();
  });
  await settle(page, 10);
  expect(await qn(page, 'q.k2.spur', 'fetzen')).toBe(1);
  expect((await story(page)).beat).toBe('k2_2');

  // ---- eyes in the fog: lantern off, crouch, past the hounds' sight cones to the hedge (≤ 60 s) ------
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1532, -484, 330, 0);
    k.step(4);
  });
  const w3 = await walk(page, [
    [1520, -506],
    [1503, -536],
  ]);
  expect(w3.reached).toBe(true);
  expect(await qn(page, 'q.k2.spur', 'allee')).toBe(1);
  await page.evaluate(() => {
    const k = window.kq!;
    k.step(120);
    k.story!.finishTyping();
    k.lantern!.toggle(false);
    k.press('KeyC', 1);
    k.step(240);
  });
  const hunt = await page.evaluate(() => window.kq!.hunt!.state());
  expect(hunt?.active).toBe(true);
  expect(await page.evaluate(() => window.kq!.ctx.state.state.flags['hunt.cones'])).toBe(true);
  // the sentries walk their beats across the way: watch the cones, wait for a gap, slip through
  const sneak = await walk(page, [[1478, -584]], { maxSeconds: 70, sneak: true });
  expect(sneak.reached).toBe(true);
  expect(sneak.caught).toBe(false);
  expect(sneak.t).toBeLessThanOrEqual(60);
  await page.evaluate(() => window.kq!.step(60 * 2));
  // "Sicher. Aufstehen.": the pack is gone, the cones with it
  expect(await page.evaluate(() => window.kq!.hunt!.state())).toBeNull();
  expect(await page.evaluate(() => window.kq!.ctx.state.state.flags['hunt.cones'] ?? null)).toBeNull();
  await page.evaluate(() => window.kq!.press('KeyC', 1));

  // ---- three Streuner on the trail (bonus), the Orangerie, its echo ----------------------------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.lantern!.toggle(true);
    k.teleport(1352, -808, 210, -2);
    (window as unknown as { __cna: { until(f: () => boolean, s: number): boolean } }).__cna.until(() => k.combat!.enemies().filter((e) => e.group === 'k2.spur').length >= 3, 10);
  });
  expect(await bigFight(page, 'k2.spur')).toBe(3);
  expect(await qn(page, 'q.k2.spur', 'streuner')).toBe(3);
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
  expect((await page.evaluate(() => window.kq!.chronik!.echo())).id).toBe('clue.k2.orangerie');
  await endEcho(page);
  expect(await untilQuest(page, 'q.k2.spur', 'done', 10)).toBe('done');
  expect(await page.evaluate(() => window.kq!.skills!.levels().spurenleser)).toBe(2);
  // the servant at the loading yard has work for you now
  // side quests offer themselves on the quests system's 1 s availability tick
  const kisten = await page.evaluate(() => {
    const k = window.kq!;
    (window as unknown as QW).__cna.until(() => k.quests!.mark('diener') === 'offer', 5);
    return { mark: k.quests!.mark('diener'), state: k.quests!.state().quests['q.k2.kisten']?.state ?? 'hidden', era: k.ctx.era.current, chapter: k.story!.state().chapter };
  });
  expect(kisten.mark, JSON.stringify(kisten)).toBe('offer');
  await giverShot(page, 'diener', [1264, -955], 'k2-giver-diener');
  await settle(page, 3);
  expect((await story(page)).beat).toBe('k2_4');
  expect(await qs(page, 'q.k2.wachbuch')).toBe('active');

  // ---- "Das Wachbuch": lights round the fire, then the memory, then the book ------------------------
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
  expect(zurWache.reached, JSON.stringify({ ...zurWache, enemies: await page.evaluate(() => window.kq!.combat!.enemies().map((e) => `${e.kind}:${e.group}@${Math.round(e.x)},${Math.round(e.z)}`)), hunt: await page.evaluate(() => window.kq!.hunt!.state()?.mode ?? null) })).toBe(true);
  await page.evaluate(() => {
    const k = window.kq!;
    (window as unknown as { __cna: { until(f: () => boolean, s: number): boolean } }).__cna.until(() => k.combat!.enemies().filter((e) => e.group === 'k2.wache').length >= 4, 10);
  });
  expect(await page.evaluate(() => window.kq!.chronik!.echo().id)).toBeFalsy(); // no memory while the lights dance
  expect(await bigFight(page, 'k2.wache', 'k2-wachfeuer-irrlichter')).toBe(4);
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1184, -1113, 200, 0);
    for (let i = 0; i < 40 && !k.chronik!.echo().id; i++) {
      k.step(15);
      k.story!.finishTyping();
    }
  });
  expect((await page.evaluate(() => window.kq!.chronik!.echo())).id).toBe('clue.k2.wache');
  await endEcho(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1181.5, -1121.5, 225, -25);
    for (let i = 0; i < 16; i++) k.step(1);
    k.press('KeyE', 2);
    k.step(3);
    k.ctx.ui.modals.closeAll();
  });
  expect(await untilQuest(page, 'q.k2.wachbuch', 'done', 12)).toBe('done');
  await settle(page, 6);
  expect((await story(page)).beat).toBe('k2_5');
  expect(await qs(page, 'q.k2.warnung')).toBe('active');

  // ---- "Die Warnung": into the palace (walked) to the Kabinett door, twice ---------------------------
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
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.player.yaw = 0;
    k.step(10);
  });
  await listen(page, 'clue.k2.warnung');
  await endEcho(page);
  await settle(page, 12);
  expect((await story(page)).beat).toBe('k2_6');
  await listen(page, 'clue.k2.abschied');
  await endEcho(page);
  expect(await untilQuest(page, 'q.k2.warnung', 'done', 10)).toBe('done');
  await page.setViewportSize({ width: 1280, height: 720 });
  expect(await turninMoment(page, 'q.k2.warnung')).toBe('done');
  await page.setViewportSize(SMALL);
  await settle(page, 10);
  expect((await story(page)).beat).toBe('k2_7');

  // ---- the departure, the gate (lantern up) -----------------------------------------------------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1222, -1118, 270, 0);
    k.step(10);
  });
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 60 && !k.chronik!.echo().id; i++) {
      k.step(15);
      k.story!.finishTyping();
    }
    k.lantern!.toggle(true);
  });
  expect((await page.evaluate(() => window.kq!.chronik!.echo())).id).toBe('clue.k2.fackeln');
  await endEcho(page);
  await settle(page, 4);
  expect(await page.evaluate(() => window.kq!.state().flags['flag.k2_tor'])).toBe('leuchten');
  expect((await story(page)).beat).toBe('k2_9');

  // ---- Jost: "Die Parforcejagd" — the quest from the boy at the gate -------------------------------
  await settle(page, 4);
  expect(await qs(page, 'q.k2.parforce')).toBe('offered');
  expect(await page.evaluate(() => window.kq!.quests!.mark('jost'))).toBe('offer-main');
  await giverShot(page, 'jost', [1218, -1128], 'k2-giver-jost');
  await talkQuest(page, 'jost', 'q.k2.parforce');
  expect(await qs(page, 'q.k2.parforce')).toBe('active');
  await page.evaluate(() => {
    const k = window.kq!;
    k.npc!.talk('jost');
    k.npc!.drain();
    k.npc!.ask('bye');
    k.npc!.drain();
    k.npc!.close();
    k.step(10);
  });
  await settle(page, 4);
  expect((await story(page)).beat).toBe('k2_10');

  // ---- the par force hunt: run (the hunt is a threat, never a fight) --------------------------------
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
  let escaped = false;
  let runs = 0;
  while (!escaped && runs < 3) {
    runs++;
    if (runs > 1) {
      await page.evaluate(() => {
        const k = window.kq!;
        for (let i = 0; i < 60 && k.story!.state().era !== 'today'; i++) k.step(10);
        k.step(200);
        k.ctx.ui.modals.closeAll();
      });
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
    }
    const why = () =>
      page.evaluate(() => {
        const k = window.kq!;
        const s = k.hunt!.state();
        return JSON.stringify({ mode: k.hunt!.mode(), by: s?.caught ? s.agents[s.caught.by]?.kind : null });
      });
    if (process.env.K2_PROBE)
      console.log(
        `[k2] run ${runs} start`,
        await page.evaluate(() => {
          const k = window.kq!;
          const P = k.ctx.player;
          const f = k.state().flags;
          return JSON.stringify({ speed: P.stats?.speed, pos: [P.position.x | 0, P.position.z | 0], combat: k.combat?.state(), lantern: f['lanternLit'], hunt: k.hunt!.mode(), agents: k.hunt!.state()?.agents.map((a) => [a.kind, a.x | 0, a.z | 0]) });
        }),
      );
    const legA = await walk(page, ESCAPE.slice(0, 9), { sprint: true, dodge: true, chunk: 8 });
    if (process.env.K2_PROBE) console.log(`[k2] run ${runs} legA`, JSON.stringify(legA), await why());
    if (legA.caught || !legA.reached) console.log(`[k2] run ${runs} leg A`, JSON.stringify(legA), await why());
    if (legA.caught) continue;
    const legB = await walk(page, ESCAPE.slice(9), { sprint: true, dodge: true, chunk: 8 });
    if (legB.caught || !legB.reached) console.log(`[k2] run ${runs} leg B`, JSON.stringify(legB), await why());
    if (legB.caught) continue;
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
  expect(await qn(page, 'q.k2.parforce', 'kalk')).toBe(1);
  expect((await story(page)).beat).toBe('k2_11');

  // ---- the dam: the Pikeur waits; struck back, he rides off ------------------------------------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(842, -878, 270, 0);
    (window as unknown as { __cna: { until(f: () => boolean, s: number): boolean } }).__cna.until(() => k.combat!.enemies().some((e) => e.kind === 'pikeur'), 12);
  });
  expect(await page.evaluate(() => window.kq!.hunt!.state())).toBeNull(); // the pack is gone; one rider stands
  await page.evaluate(() => {
    const k = window.kq!;
    const e = k.combat!.enemies().find((x) => x.kind === 'pikeur')!;
    k.combat!.place(e.id, 832, -874, true);
    const p = k.ctx.player.position;
    k.ctx.player.yaw = Math.atan2(-(832 - p.x), -(-874 - p.z));
    k.combat!.windup(e.id);
    k.combat!.freeze(true);
    k.step(20);
    k.story!.flush();
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await cna(page, 'k2-pikeur-damm');
  await page.setViewportSize(SMALL);
  await page.evaluate(() => window.kq!.combat!.freeze(false));
  await bigFight(page, 'k2.pikeur');
  expect(await qn(page, 'q.k2.parforce', 'pikeur')).toBe(1);
  await settle(page, 12);
  expect(await said(page)).toEqual(expect.arrayContaining(['laub.k2.damm.weg', 'laub.k2.wasser']));

  // ---- home: the turn-in, the cliffhanger--------------------------------------------------------------
  await holdQ(page);
  expect((await story(page)).era).toBe('today');
  expect(await untilQuest(page, 'q.k2.parforce', 'done', 10)).toBe('done');
  await page.setViewportSize({ width: 1280, height: 720 });
  expect(await turninMoment(page, 'q.k2.parforce')).toBe('done');
  await page.setViewportSize(SMALL);
  expect(await page.evaluate(() => window.kq!.skills!.levels().kartograf)).toBe(3);
  expect(await page.evaluate(() => window.kq!.progression!.state().equipped.weapon)).toBe('item.stab.silber');
  await page.evaluate(() => window.kq!.teleport(1053, -828, 51, -3));
  await settle(page, 4);
  expect(['k2_12', 'k2_13']).toContain((await story(page)).beat);
  await shot(page, '14-rauch');
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 240 && k.story!.state().chapter !== 'k3'; i++) {
      k.step(15);
      k.story!.finishTyping();
    }
  });
  expect(await said(page)).toContain('laub.k2.ende');
  s = await story(page);
  expect(s.chapter).toBe('k3');
  await page.setViewportSize({ width: 1280, height: 720 });
}
