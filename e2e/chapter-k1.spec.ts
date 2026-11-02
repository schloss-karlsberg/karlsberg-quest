import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';

/**
 * Chapter 1 "Der Hof", played through headless (`?manual`, driven through window.kq):
 *
 *   Teil A (1789, Tag)  station → Ehrenhof (Q) → the guard echo at the gate → walk through the
 *   Durchfahrt into the Registratur → Soll (topics unlock with what you found) + desk, shelf,
 *   drawer → out the north door to the building site → Hanne → the mason's mark → around the
 *   palace to the Orangerie → Mannlich's plans + two echoes → back (Q hold) → Zwinger anchor → Jost
 *   → Chronik: the first three sentences.
 *   Teil B (1789, dusk → night)  Tschifflik terrace (Q) → amphitheatre (count the 19 houses on a
 *   walk around it, the cassowary) → bear boxes → night: the patrol, sneak along the water → the
 *   Rondell echo (memorial, pack gone) → the page (needs the lantern) → par force chase to the
 *   Tosbecken → back → the case completed → Raureif → chapter 2.
 *
 * Every route in 1789 is walked with the real player controller (collisions, doors, slopes); only
 * present-day travel (the F flight) is a teleport. Fairness checks: interior routes, clue spots
 * reachable and separate from the NPC talk range, the lantern rule of the page, the patrol can be
 * passed along the water, a sprint escapes the par force, nouns for every sentence are found.
 * A second test: the lantern running dry in Teil A and being caught in Teil B lose nothing.
 * Screenshots: test-results/screens/ch-k1-*.png.
 */
const SCREENS = 'test-results/screens';
mkdirSync(SCREENS, { recursive: true });
const URL = './?notitle&nosave&fresh&manual';
const CASE = 'case.k1';
const IGNORED = [/GPU stall/i, /pointer ?lock/i, /WebGL.*(performance|ReadPixels)/i, /AudioContext was not allowed/i];

interface Walked {
  x: number;
  z: number;
  d: number;
  beat: string | null;
}
interface K1Helpers {
  upd(n: number): void;
  walk(x: number, z: number, o?: { sprint?: boolean; tol?: number; max?: number; until?: string }): Walked;
  path(pts: [number, number][], o?: { sprint?: boolean; tol?: number; until?: string }): Walked;
  face(x: number, z: number): void;
  settle(): void;
  hold(code: string, steps: number): void;
  minHound: number;
  ev: [string, unknown][];
}
type W = { __k1: K1Helpers };

/** Walking helpers: W (+ Shift) towards a point, re-aiming every 10 fixed updates. */
const HELPERS = `(() => {
  const k = window.kq;
  const loop = k.ctx.loop;
  const inp = k.ctx.input;
  const P = () => k.ctx.player.position;
  const h = { minHound: 1e9, ev: [] };
  // fixed updates without a render each (rendering is what is slow in SwiftShader); a step(1) syncs the view
  h.upd = (n) => { for (let i = 0; i < n; i++) { loop.cb.update(loop.dt); loop.tick++; } };
  // the Chronik refreshes its markers / E target every 0.2 s of render time: a dozen frames
  h.settle = () => { for (let i = 0; i < 13; i++) k.step(0); };
  h.face = (x, z) => { const p = P(); k.ctx.player.yaw = Math.atan2(-(x - p.x), -(z - p.z)); };
  const track = () => {
    const s = k.hunt.sim && k.hunt.sim();
    if (!s) return;
    const p = P();
    for (const a of s.agents) h.minHound = Math.min(h.minHound, Math.hypot(a.x - p.x, a.z - p.z));
  };
  h.walk = (x, z, o = {}) => {
    const keys = ['KeyW'].concat(o.sprint ? ['ShiftLeft'] : []);
    const beat0 = k.story.state().beat;
    let mark = { x: P().x, z: P().z, i: 0 };
    for (let i = 0; i < (o.max ?? 1500); i++) {
      const p = P();
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < (o.tol ?? 0.8)) break;
      // stuck against something (a wall, a pillar): give up, the caller checks the distance
      if (i - mark.i >= 40) {
        if (Math.hypot(p.x - mark.x, p.z - mark.z) < 0.4) break;
        mark = { x: p.x, z: p.z, i };
      }
      if (o.until && k.story.state().beat !== beat0) break;
      if (k.ctx.ui.modals.count > 0) break;
      // an echo holds the player (the guard's starts by itself when you walk up)
      if (k.chronik.echo().id) break;
      h.face(x, z);
      for (const c of keys) inp.simulate(c, true);
      // short strides near the goal (one stride of 10 updates is 0.5–1 m)
      h.upd(d < 2 ? 2 : 10);
      for (const c of keys) inp.simulate(c, false);
      track();
    }
    h.settle();
    const p = P();
    return { x: p.x, z: p.z, d: Math.hypot(x - p.x, z - p.z), beat: k.story.state().beat };
  };
  h.path = (pts, o = {}) => {
    let r = null;
    for (const [x, z] of pts) {
      r = h.walk(x, z, o);
      if (o.until && r.beat !== o.until) break;
    }
    return r;
  };
  // hold a key: the Chronik reads the E hold on update, its ring on render
  h.hold = (code, steps) => { inp.simulate(code, true); for (let i = 0; i < steps; i += 10) k.step(10); inp.simulate(code, false); k.step(1); };
  for (const n of ['hunt:goal', 'player:caught', 'hunt:start', 'npc:talk', 'clue:grant', 'menagerie:spawn', 'story:beat', 'era:change', 'shift:request', 'story:meter-full', 'lantern:empty', 'hub:enter'])
    k.ctx.events.on(n, (p) => h.ev.push([n, p]));
  window.__k1 = h;
})()`;

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
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SCREENS}/ch-k1-${name}.png`, timeout: 400_000 });
}

const story = (page: Page) => page.evaluate(() => window.kq!.story!.state());
const beat = async (page: Page) => (await story(page)).beat;
const inv = (page: Page) => page.evaluate(() => window.kq!.state().inventory);
const flags = (page: Page) => page.evaluate(() => window.kq!.state().flags);
const walk = async (page: Page, pts: [number, number][], o: { sprint?: boolean; tol?: number; until?: string } = {}): Promise<Walked> => {
  if (process.env.K1_DEBUG && pts.length > 1) {
    let r: Walked | null = null;
    for (const pt of pts) {
      const one: Walked = await walk(page, [pt], o);
      r = one;
      if (o.until && one.beat !== o.until) break;
    }
    return r!;
  }
  const r = await page.evaluate(([pts, o]) => (window as unknown as W).__k1.path(pts, o), [pts, o] as const);
  if (process.env.K1_DEBUG) console.log('WALK', JSON.stringify(pts.at(-1)), r.d.toFixed(2), r.beat, JSON.stringify(await page.evaluate(() => [window.kq!.story!.state().meters.oil?.value, window.kq!.story!.state().era])));
  return r;
};
const upd = (page: Page, n: number) =>
  page.evaluate((n) => {
    (window as unknown as W).__k1.upd(n);
    window.kq!.step(1);
  }, n);

/** n fixed updates with a render every 10 (the era shift transition runs on rendered frames too). */
const frames = (page: Page, n: number) =>
  page.evaluate((n) => {
    for (let i = 0; i < n; i += 10) window.kq!.step(10);
    (window as unknown as W).__k1.settle();
  }, n);

/** Say lines / typing out of the way (they do not block anything, but keep screenshots clean). */
const flush = (page: Page) => page.evaluate(() => window.kq!.story!.flush());

/** Q at an anchor in the present → the fx transition → 1789. */
async function shiftToPast(page: Page): Promise<void> {
  if (process.env.K1_DEBUG)
    console.log('SHIFT', await page.evaluate(() => JSON.stringify([window.kq!.fx!.state().shift, Object.entries(window.kq!.state().flags).filter(([f]) => f.startsWith('shift.')), window.kq!.story!.state().beat, window.kq!.ctx.player.position])));
  await page.evaluate(() => {
    window.kq!.press('KeyQ', 1);
    // the 3.5 s transition runs on rendered frames: jump past its end
    window.kq!.fx!.shiftAt(3.6);
  });
  await frames(page, 60);
  expect((await story(page)).era).toBe('1789');
}
/** Hold Q in the past → back to today, in place. */
async function holdQ(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as W).__k1.hold('KeyQ', 90);
    window.kq!.fx!.shiftAt(3.6);
  });
  await frames(page, 60);
  expect((await story(page)).era).toBe('today');
}
/** E next to a clue → its card → close. */
async function examine(page: Page, id: string): Promise<void> {
  expect(await page.evaluate(() => window.kq!.chronik!.target())).toBe(id);
  await page.evaluate(() => window.kq!.press('KeyE', 1));
  await expect(page.getByTestId('chronik-card')).toHaveAttribute('data-clue', id);
  await page.evaluate(() => {
    window.kq!.ctx.ui.modals.closeAll();
    window.kq!.step(2);
  });
  expect((await inv(page)).clues).toContain(id);
}
/** Hold E at an echo, let it play out, close its card. */
async function listen(page: Page, id: string, screenshot?: string): Promise<void> {
  await page.evaluate(() => (window as unknown as W).__k1.hold('KeyE', 70));
  expect((await page.evaluate(() => window.kq!.chronik!.echo())).id).toBe(id);
  if (screenshot) {
    await page.evaluate(() => {
      window.kq!.chronik!.advanceEcho(7);
      window.kq!.step(2);
    });
    await shot(page, screenshot);
  }
  await page.evaluate(() => {
    window.kq!.chronik!.advanceEcho(240);
    window.kq!.step(2);
    window.kq!.ctx.ui.modals.closeAll();
    window.kq!.step(2);
  });
  expect((await inv(page)).clues).toContain(id);
}
/** E near an NPC → conversation; ask topics (in order), then goodbye. Returns the offered topics. */
async function talk(page: Page, npc: string, topics: string[]): Promise<string[]> {
  expect(await page.evaluate(() => window.kq!.npc!.state().near)).toBe(npc);
  // never both: talking and examining share E
  expect(await page.evaluate(() => window.kq!.chronik!.target())).toBeNull();
  await page.evaluate(() => window.kq!.press('KeyE', 1));
  await expect(page.getByTestId('npc-talk')).toBeVisible();
  await page.evaluate(() => window.kq!.npc!.drain());
  const offered = (await page.evaluate(() => window.kq!.npc!.state())).topics as string[];
  for (const tp of topics) {
    await page.evaluate((tp) => {
      window.kq!.npc!.ask(tp);
      window.kq!.npc!.drain();
    }, tp);
  }
  await page.evaluate(() => {
    window.kq!.npc!.ask('bye');
    window.kq!.npc!.drain();
    window.kq!.npc!.close();
    window.kq!.step(2);
  });
  await expect(page.getByTestId('npc-talk')).toBeHidden();
  return offered;
}

async function boot(page: Page, b?: string): Promise<void> {
  await page.goto(URL);
  await page.waitForFunction(() => !!window.kq?.story && !!window.kq?.chronik && !!window.kq?.npc && !!window.kq?.hunt && !!window.kq?.menagerie, null, { timeout: 180_000 });
  await page.evaluate(HELPERS);
  await page.evaluate((b) => {
    const k = window.kq!;
    // deterministic screenshots: no random barks
    k.ctx.state.mutable.flags['barks.quiet'] = true;
    // what the prologue leaves behind (quietly: no unlock cards over the first screenshots)
    k.story!.start('Alex');
    // (a fresh game queues the Relief-Blick card; clear it, then grant quietly)
    k.skills!.reset();
    k.skills!.grant('relief', 2, true);
    k.skills!.grant('kartograf', 1, true);
    if (b) k.story!.goto('k1', b);
    else k.story!.goto('k1');
    k.step(10);
  }, b);
}

test('chapter 1 "Der Hof": the whole chapter, both parts', async ({ page }) => {
  test.setTimeout(3_000_000);
  const errors = trackErrors(page);
  await boot(page);
  let s = await story(page);
  expect(s).toMatchObject({ chapter: 'k1', beat: 'k1_0', era: 'today' });
  await expect(page.getByTestId('story-card')).toContainText('Der Hof');
  const npcs = await page.evaluate(() => window.kq!.npc!.list().map((n) => `${n.npc}@${n.era}`));
  expect(npcs.sort()).toEqual(['hanne@1789', 'jost@1789', 'soll@1789']);
  await upd(page, 400);
  expect((await story(page)).said).toContain('marlene.k1.morgen');
  await page.evaluate(() => {
    window.kq!.teleport(757.5, -899, 30, -2);
    window.kq!.step(2);
  });
  await shot(page, '01-morgen');

  // ======================= Teil A ==============================================================
  // ---- 1.1 Ankunft: Q at the Ehrenhof (flown there), the guard echo at the gate ----------------
  await page.evaluate(() => {
    window.kq!.teleport(1224, -1117, 80, 0);
    window.kq!.step(2);
  });
  await flush(page);
  await shiftToPast(page);
  s = await story(page);
  expect(s.beat).toBe('k1_1');
  expect(s.meters.oil).toMatchObject({ seconds: 360 });
  expect(await page.evaluate(() => window.kq!.state().systems.hunt?.lantern)).toMatchObject({ lit: true, seconds: 360 });
  await upd(page, 200);
  await flush(page);
  await shot(page, '02-ehrenhof-1789');
  // walking up to the gate starts the guard's echo by itself (clue.auto)
  await walk(page, [[1207, -1115]]);
  await upd(page, 30);
  expect((await page.evaluate(() => window.kq!.chronik!.echo())).id).toBe('clue.k1.wache');
  await page.evaluate(() => {
    window.kq!.chronik!.advanceEcho(4);
    window.kq!.step(2);
  });
  await shot(page, '03-wache');
  await page.evaluate(() => {
    window.kq!.chronik!.advanceEcho(120);
    window.kq!.step(2);
    window.kq!.ctx.ui.modals.closeAll();
    window.kq!.step(4);
  });
  expect(await beat(page)).toBe('k1_2');
  expect((await inv(page)).clues).toEqual(expect.arrayContaining(['clue.k1.wache', 'clue.k1.fluegel']));

  // ---- 1.2 Registratur: through the Durchfahrt, the west corridor, into the room ----------------
  let w = await walk(page, [
    [1221.2, -1136],
    [1221.2, -1140.8],
    [1216.6, -1149.9],
    [1202.3, -1148.6],
    [1201.6, -1150.6],
  ]);
  expect(w.d).toBeLessThan(1);
  await upd(page, 30);
  expect((await flags(page))['interior.room']).toBe('B03.1.eg-registratur');
  expect((await story(page)).objective?.id).toBe('k1.registratur-suchen');
  await flush(page);
  // Soll: close enough to talk, no clue in reach
  await walk(page, [[1200.5, -1152.6]], { tol: 0.5 });
  await page.evaluate(() => {
    (window as unknown as W).__k1.face(1198.8, -1152.6);
    window.kq!.ctx.player.pitch = -0.05;
    window.kq!.step(30);
  });
  await flush(page);
  await shot(page, '04-registratur-soll');
  let offered = await talk(page, 'soll', ['matthes', 'warum']);
  expect(offered).toEqual(expect.arrayContaining(['matthes', 'warum', 'minister']));
  expect(offered).not.toContain('zahl');
  expect(offered).not.toContain('graues_buch');
  // desk, drawer, shelf
  await walk(page, [[1203.9, -1154.4]], { tol: 0.3 });
  await examine(page, 'clue.k1.rechenbrett');
  await walk(page, [[1202.9, -1155.2]], { tol: 0.3 });
  await examine(page, 'clue.k1.gegenbuch');
  await walk(page, [[1201.6, -1155.3]], { tol: 0.3 });
  await examine(page, 'clue.k1.schloezer');
  // the room from its middle: desk, shelf and the drawer side
  await walk(page, [[1201.8, -1152.4]], { tol: 0.4 });
  await page.evaluate(() => {
    (window as unknown as W).__k1.face(1205.4, -1152.6);
    window.kq!.ctx.player.pitch = -0.2;
    window.kq!.step(4);
  });
  await flush(page);
  await shot(page, '05-registratur-regal');
  await walk(page, [[1205, -1151.6]], { tol: 0.3 });
  await examine(page, 'clue.k1.kaufbrief');
  // what you found opens Soll's other questions
  await walk(page, [[1200.5, -1152.6]], { tol: 0.5 });
  offered = await talk(page, 'soll', ['zahl', 'graues_buch']);
  expect(offered).toEqual(expect.arrayContaining(['zahl', 'graues_buch']));
  await upd(page, 10);
  expect((await inv(page)).clues).toContain('clue.k1.soll_einnahmen');
  expect(await beat(page)).toBe('k1_3');

  // ---- 1.3 Bauplatz: out of the north door, Hanne, the mason's mark ------------------------------
  w = await walk(page, [
    [1202.3, -1148.6],
    [1203.2, -1147.4],
    [1215, -1149.3],
    [1216.6, -1149.9],
    [1219, -1150.3],
    [1218.2, -1159.1],
    [1218.5, -1164],
    [1222, -1192],
    [1236, -1213],
    [1286, -1213],
    [1287.5, -1224.5],
  ]);
  expect(w.d).toBeLessThan(1);
  await flush(page);
  await page.evaluate(() => {
    window.kq!.teleport(1283.2, -1221.2, 150, 2);
    (window as unknown as W).__k1.face(1287, -1228);
    window.kq!.ctx.player.pitch = -0.05;
    window.kq!.step(30);
  });
  await shot(page, '06-bauplatz-hanne');
  await walk(page, [[1285.6, -1226]], { tol: 0.4 });
  offered = await talk(page, 'hanne', ['matthes', 'warten', 'warum']);
  expect(offered).toEqual(expect.arrayContaining(['matthes', 'warten', 'berg', 'warum']));
  await upd(page, 90);
  expect((await story(page)).objective?.id).toBe('k1.zeichen');
  await walk(page, [
    [1284, -1215],
    [1262.3, -1217.6],
  ], { tol: 0.4 });
  await examine(page, 'clue.k1.zeichen');
  await upd(page, 200);
  expect(await beat(page)).toBe('k1_4');

  // ---- 1.4 Orangerie: around the palace (east side) to the Pfeilersaal door --------------------
  w = await walk(page, [
    [1300, -1200],
    [1302, -1060],
    [1286, -1022],
    [1281, -1000],
    [1260, -996],
    [1251, -990],
    [1249.2, -976],
    [1247.6, -968],
    [1243.6, -967.6],
  ], { sprint: true });
  expect(w.d).toBeLessThan(1);
  await upd(page, 30);
  expect((await flags(page))['interior.room']).toBe('B10.1.s-pfeilersaal');
  expect((await inv(page)).clues).toContain('clue.k1.feenschloss');
  // the lantern still burns: one Wechsel carried us through Registratur, Bauplatz and the walk here
  expect((await story(page)).meters.oil?.value ?? 1).toBeLessThan(1);
  await flush(page);
  await walk(page, [[1244.2, -968.4]], { tol: 0.3 });
  await page.evaluate(() => {
    (window as unknown as W).__k1.face(1243.6, -970.5);
    window.kq!.ctx.player.pitch = -0.45;
    window.kq!.step(4);
  });
  await flush(page);
  await shot(page, '07-pfeilersaal-plaene');
  await walk(page, [[1243.6, -970.2]], { tol: 0.3 });
  await examine(page, 'clue.k1.festplan');
  await walk(page, [
    [1245.6, -966],
    [1245.6, -959.8],
  ], { tol: 0.5 });
  await listen(page, 'clue.k1.mannlich', '08-mannlich');
  await listen(page, 'clue.k1.mannlich_lohn');
  expect(await beat(page)).toBe('k1_5');

  // ---- 1.5 Zwinger: back to today, fly to the Zwinger anchor, Q, Jost ---------------------------
  await holdQ(page);
  s = await story(page);
  expect(s.meters.oil).toBeUndefined();
  expect(s.objective?.id).toBe('k1.zurueck-z');
  await page.evaluate(() => {
    window.kq!.teleport(1165, -1571, 90, 0);
    window.kq!.step(2);
  });
  await shiftToPast(page);
  // a fresh lantern for the new Wechsel
  expect((await story(page)).meters.oil?.value ?? 1).toBeLessThan(0.05);
  await walk(page, [[1174.6, -1571]], { tol: 0.3 });
  await upd(page, 60);
  expect((await inv(page)).clues).toContain('clue.k1.gagern');
  await flush(page);
  offered = await talk(page, 'jost', ['verstecken', 'namen', 'meute']);
  expect(offered).toEqual(expect.arrayContaining(['meute', 'verstecken', 'namen']));
  await page.evaluate(() => {
    window.kq!.teleport(1172.5, -1568, 120, 0);
    (window as unknown as W).__k1.face(1177, -1571);
    window.kq!.step(20);
  });
  await flush(page);
  await shot(page, '09-zwinger-jost');
  expect(await beat(page)).toBe('k1_6');
  expect((await flags(page))['k1.a.done']).toBe(true);

  // ---- 1.6 Zurück: the first three sentences ---------------------------------------------------
  await holdQ(page);
  const nounsA = (await inv(page)).nouns;
  // every Teil-A sentence can be filled from what Teil A gave (answer + decoys)
  for (const n of ['n.herzog', 'n.minister', 'n.herzogin', 'n.zwei_tage', 'n.eine_woche', 'n.zahl_14mio', 'n.zahl_35000', 'n.zahl_800000', 'n.tausend', 'n.jagdrevier', 'n.thiergarten', 'n.feenschloss', 'n.karlslust'])
    expect(nounsA, n).toContain(n);
  await page.evaluate((c) => {
    const k = window.kq!.chronik!;
    k.open(c);
    k.fill(c, 'entry.k1.1', 'wer', 'n.herzog');
    k.fill(c, 'entry.k1.2', 'wielange', 'n.zwei_tage');
    k.fill(c, 'entry.k1.3', 'wieviel', 'n.zahl_14mio');
    k.fill(c, 'entry.k1.10', 'warum', 'n.r_will_nicht');
    window.kq!.step(2);
  }, CASE);
  await shot(page, '10-chronik');
  const r1 = await page.evaluate((c) => window.kq!.chronik!.check(c), CASE);
  expect(r1?.correct).toBe(true);
  await page.evaluate(() => {
    window.kq!.chronik!.close();
    window.kq!.step(4);
  });
  await upd(page, 30);
  s = await story(page);
  expect(s.beat).toBe('k1_7');
  expect(s.look).toBe('dusk');

  // ======================= Teil B ==============================================================
  // ---- 1.7 Tschifflik: fly to the Karlslust, Q on the terrace -----------------------------------
  await page.evaluate(() => {
    window.kq!.teleport(1822, 70, 175, 0);
    window.kq!.step(2);
  });
  await upd(page, 60);
  await flush(page);
  await shiftToPast(page);
  s = await story(page);
  expect(s.beat).toBe('k1_8');
  expect(s.meters.oil).toMatchObject({ seconds: 420, lossless: true });
  expect((await flags(page))['chronik.noLoss']).toBe(true);
  await upd(page, 120);
  await page.evaluate(() => {
    (window as unknown as W).__k1.face(1935, 87);
    window.kq!.ctx.player.pitch = -0.08;
    window.kq!.step(10);
  });
  await flush(page);
  await shot(page, '11-tschifflik-abend');
  await flush(page);

  // ---- 1.8 Amphitheater: walk over, count the houses on a round, the Menagerie echo -------------
  w = await walk(page, [
    [1860, 86],
    [1899, 87],
  ]);
  expect(await beat(page)).toBe('k1_9');
  expect((await inv(page)).clues).toContain('clue.k1.insel');
  await flush(page);
  await page.evaluate(() => {
    (window as unknown as W).__k1.face(1935, 87);
    window.kq!.step(10);
  });
  await listen(page, 'echo.k1.mannlich_menagerie', '12-amphitheater-echo');
  await walk(page, [
    [1909, 58],
    [1935, 48],
    [1962, 59],
    [1976, 87],
    [1962, 115],
  ]);
  await page.evaluate(() => {
    (window as unknown as W).__k1.face(1966, 92);
    window.kq!.step(4);
  });
  await flush(page);
  await shot(page, '13-menagerie-kasuar');
  await walk(page, [[1935, 125]]);
  await upd(page, 30);
  expect((await inv(page)).clues).toContain('clue.k1.amphitheater');
  expect(await beat(page)).toBe('k1_10');

  // ---- 1.9 Terrassen ---------------------------------------------------------------------------
  await walk(page, [[1957.5, 145.5]], { tol: 0.5 });
  await examine(page, 'clue.k1.baerenkaesten');
  await upd(page, 10);
  expect(await beat(page)).toBe('k1_11');

  // ---- 1.10 Die Nacht kommt: the patrol; lantern out, crouch, along the water to the Rondell -----
  await upd(page, 300);
  expect((await story(page)).lookPast).toEqual({ era: '1789', time: 'night' });
  expect(await page.evaluate(() => window.kq!.hunt!.state()?.mode)).toBe('patrol');
  await page.evaluate(() => {
    (window as unknown as W).__k1.face(1915, 205);
    window.kq!.step(10);
  });
  await shot(page, '14-nacht');
  await page.evaluate(() => {
    window.kq!.press('KeyL', 2);
    // crouch (C toggles; the cassowary may already have put us on our knees)
    if (window.kq!.ctx.player.stance !== 'crouch') window.kq!.press('KeyC', 2);
  });
  expect(await page.evaluate(() => window.kq!.ctx.player.stance)).toBe('crouch');
  w = await walk(page, [
    [1930, 135],
    [1880, 160],
    [1870, 175],
    [1818, 205],
    [1818, 300],
    [1816, 338],
  ], { until: 'k1_11' });
  expect(await page.evaluate(() => (window as unknown as W).__k1.ev.filter(([n]) => n === 'player:caught').length)).toBe(0);
  expect(w.beat).toBe('k1_12');
  expect((await story(page)).threats.pack?.active).toBe(false);

  // ---- 1.11 Rondell: the fireworks echo (memorial) ---------------------------------------------
  // (the beat turns at the Rondell's edge; the echo is heard from its middle)
  await walk(page, [[1815, 341]]);
  await flush(page);
  await page.evaluate(() => (window as unknown as W).__k1.face(1815, 300));
  await listen(page, 'clue.k1.feuerwerk', '15-rondell-feuerwerk');
  expect((await page.evaluate(() => window.kq!.state().codex.facts))).toContain('entry.k1.gedenk');
  expect(await beat(page)).toBe('k1_13');

  // ---- 1.12 Die Seite: in the dark it cannot be read; lantern on --------------------------------
  await walk(page, [[1811, 361.5]], { tol: 0.4 });
  expect(await page.evaluate(() => window.kq!.chronik!.status('clue.k1.seite'))).toBe('needs-lantern');
  await page.evaluate(() => {
    window.kq!.press('KeyL', 2);
    // stand up (Space): running needs standing
    window.kq!.press('Space', 2);
    window.kq!.step(2);
  });
  expect(await page.evaluate(() => window.kq!.chronik!.status('clue.k1.seite'))).toBe('available');
  await page.evaluate(() => {
    (window as unknown as W).__k1.face(1811, 366);
    window.kq!.ctx.player.pitch = -0.4;
    window.kq!.step(4);
  });
  await shot(page, '16-seite');
  expect(await page.evaluate(() => window.kq!.ctx.player.stance)).toBe('stand');
  await examine(page, 'clue.k1.seite');
  await upd(page, 20);
  expect(await beat(page)).toBe('k1_14');
  expect(await page.evaluate(() => window.kq!.hunt!.state()?.mode)).toBe('parforce');

  // ---- 1.13 Flucht: sprint down to the Tosbecken -----------------------------------------------
  await page.evaluate(() => {
    (window as unknown as W).__k1.minHound = 1e9;
  });
  w = await walk(page, [[1818, 330]], { sprint: true, until: 'k1_14' });
  await page.evaluate(() => {
    (window as unknown as W).__k1.face(1826, 394);
    window.kq!.ctx.player.pitch = 0.05;
    window.kq!.step(2);
  });
  await shot(page, '17-flucht-meute');
  w = await walk(page, [
    [1818, 260],
    [1814, 214],
    [1812, 203],
  ], { sprint: true, until: 'k1_14' });
  const ev = await page.evaluate(() => (window as unknown as W).__k1.ev.map(([n]) => n));
  // (the beat ends at the Tosbecken either way: the hunt's goal reached, or the pack lost the trail
  // first; what matters is that nobody was caught and the hounds never came close)
  expect(ev).not.toContain('player:caught');
  expect(w.beat).toBe('k1_15');
  const closest = await page.evaluate(() => (window as unknown as W).__k1.minHound);
  expect(closest).toBeGreaterThan(8);
  await upd(page, 60);
  await page.evaluate(() => {
    (window as unknown as W).__k1.face(1818, 300);
    window.kq!.step(4);
  });
  await shot(page, '18-tosbecken');

  // ---- 1.14 Feldstation: complete the case → Raureif → chapter 2 --------------------------------
  await holdQ(page);
  await upd(page, 60);
  expect(await beat(page)).toBe('k1_16');
  const nounsB = (await inv(page)).nouns;
  for (const n of ['n.neunzehn', 'n.zwoelf', 'n.herzogsterrassen', 'n.amphitheater', 'n.insel', 'n.einziges_geruest', 'n.drei_abteilungen', 'n.vulkan', 'n.kaskade', 'n.orangeriehof', 'n.zweibruecken'])
    expect(nounsB, n).toContain(n);
  await page.evaluate((c) => {
    const k = window.kq!.chronik!;
    k.fill(c, 'entry.k1.4', 'wieviel', 'n.tausend');
    k.fill(c, 'entry.k1.5', 'was', 'n.jagdrevier');
    k.fill(c, 'entry.k1.6', 'wieviel', 'n.neunzehn');
    k.fill(c, 'entry.k1.7', 'wo', 'n.herzogsterrassen');
    k.fill(c, 'entry.k1.8', 'wo', 'n.karlslust');
    k.fill(c, 'entry.k1.9', 'wie', 'n.einziges_geruest');
  }, CASE);
  const r2 = await page.evaluate((c) => window.kq!.chronik!.check(c), CASE);
  expect(r2?.correct).toBe(true);
  await upd(page, 30);
  expect(await page.evaluate(() => window.kq!.state().skills)).toMatchObject({ spurenleser: 1, kartograf: 2 });
  await upd(page, 200);
  expect(await beat(page)).toBe('k1_17');
  await page.evaluate(() => {
    window.kq!.ctx.player.pitch = 0.1;
    window.kq!.step(4);
  });
  await shot(page, '19-raureif');
  await upd(page, 900);
  s = await story(page);
  expect(s.completed).toContain('k1');
  expect(s.chapter).toBe('k2');
  expect(await page.evaluate(() => window.kq!.npc!.list().length)).toBe(0);
  expect(Object.keys(await flags(page)).filter((f) => f.startsWith('npc.owns.clue.k1.'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('chapter 1: an empty lantern (Teil A) and the pack (Teil B) cost nothing', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = trackErrors(page);
  await boot(page);
  await page.evaluate(() => {
    window.kq!.story!.goto('k1', 'k1_3');
    window.kq!.step(4);
  });
  // Teil A: the lantern runs dry in 1789 → curtain → the station, same beat, the way back is shown
  await page.evaluate(() => {
    window.kq!.teleport(1224, -1117, 80, 0);
    window.kq!.step(2);
  });
  await shiftToPast(page);
  await page.evaluate(() => {
    window.kq!.chronik!.examine('clue.k1.zeichen');
    window.kq!.ctx.ui.modals.closeAll();
    window.kq!.lantern!.setOil(0.002);
  });
  await upd(page, 120);
  await expect(page.getByTestId('story-curtain')).toBeVisible();
  await upd(page, 400);
  let s = await story(page);
  expect(s).toMatchObject({ era: 'today', beat: 'k1_3' });
  expect(s.objective?.id).toBe('k1.zurueck-a');
  expect((await inv(page)).clues).toContain('clue.k1.zeichen');
  await shot(page, 'x1-oel-leer');

  // Teil B: caught by the patrol → "heimgebracht", finds kept, the way back to the Karlslust
  await page.evaluate(() => {
    // through k1_7 (Teil B's flags: the lossless lantern), then on to the night beat
    window.kq!.story!.goto('k1', 'k1_7');
    window.kq!.step(4);
    window.kq!.story!.goto('k1', 'k1_11');
    window.kq!.step(10);
    window.kq!.teleport(1822, 70, 175, 0);
    window.kq!.step(2);
  });
  await shiftToPast(page);
  await upd(page, 400);
  expect(await page.evaluate(() => window.kq!.hunt!.state()?.mode)).toBe('patrol');
  await page.evaluate(() => window.kq!.chronik!.caught());
  await upd(page, 60);
  await expect(page.getByTestId('story-curtain')).toContainText('heimgebracht');
  await upd(page, 400);
  s = await story(page);
  expect(s).toMatchObject({ era: 'today', beat: 'k1_11' });
  expect(s.objective?.id).toBe('k1.zurueck-b');
  expect((await inv(page)).clues).toContain('clue.k1.zeichen');
  // no pack in the present; it comes back with the next Wechsel
  expect(await page.evaluate(() => window.kq!.hunt!.state())).toBeNull();
  await page.evaluate(() => {
    window.kq!.teleport(1822, 70, 175, 0);
    window.kq!.step(2);
  });
  await shiftToPast(page);
  await upd(page, 300);
  expect(await page.evaluate(() => window.kq!.hunt!.state()?.mode)).toBe('patrol');
  expect(errors).toEqual([]);
});
