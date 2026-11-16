import { type Page, expect } from '@playwright/test';
import { type PlayOptions, SCREENS } from './common';
import { cna, fight, flag, holdHome, installQuestPlay, pickUp, qn, qs, talkQuest, until, untilQuest } from './prolog';

/**
 * Chapter 1 "Der Hof" as an action-RPG quest chain (docs/ACTION-RPG.md §11.1), played through
 * headless (`?manual`, driven through window.kq):
 *
 *   Teil A (1789, day → dusk)  station → "Zu Fuß, außer einem" (Q at the Ehrenhof, the guard's
 *   echo) → "Der Kanzlist zählt" (walk into the Registratur, Soll gives the quest, three papers,
 *   six Mahnbriefe in the Küchenhof, the turn-in with its history and sources) → "Matthes' Lohn"
 *   (Hanne, the mason's mark, Soll asked, the Schuldbuch at dusk on the Bauplatz, the wage slip,
 *   the stance) → "Tausend Hunde" (Jost: hiding, meat for the kennel, three Streuner) → home.
 *   Teil B (night)  "Die Karlslust bei Nacht": the terrace (Q), the Rund counted on foot, the bear
 *   boxes, the lights over the Schwanenweiher, the patrol passed along the water, the Rondell
 *   (memorial: quiet, no enemies), the page, the par force run to the Tosbecken, Q home → chapter 2.
 *
 * Routes in 1789 are walked with the real player controller where they matter (the Registratur,
 * the Rund, the water); fights are short real exchanges finished through the combat hook. The
 * side quests' givers (servant, gardener) are checked for their glyphs.
 * Used by e2e/chapter-k1.spec.ts and e2e/campaign.spec.ts. Screenshots: ch-k1-*.png, cna-k1-*.png.
 */
let SHOTS = true;
export const URL = './?notitle&nosave&fresh&manual';

export interface Walked {
  x: number;
  z: number;
  d: number;
  beat: string | null;
}
export interface K1Helpers {
  upd(n: number): void;
  walk(x: number, z: number, o?: { sprint?: boolean; tol?: number; max?: number; until?: string }): Walked;
  path(pts: [number, number][], o?: { sprint?: boolean; tol?: number; until?: string }): Walked;
  face(x: number, z: number): void;
  settle(): void;
  hold(code: string, steps: number): void;
  minHound: number;
  ev: [string, unknown][];
}
export type W = { __k1: K1Helpers };

/** Walking helpers: W (+ Shift) towards a point, re-aiming every 10 fixed updates. */
export const HELPERS = `(() => {
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


export async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SCREENS}/ch-k1-${name}.png`, timeout: 400_000 });
}

export const story = (page: Page) => page.evaluate(() => window.kq!.story!.state());
export const beat = async (page: Page) => (await story(page)).beat;
export const inv = (page: Page) => page.evaluate(() => window.kq!.state().inventory);
export const flags = (page: Page) => page.evaluate(() => window.kq!.state().flags);
export const walk = async (page: Page, pts: [number, number][], o: { sprint?: boolean; tol?: number; until?: string } = {}): Promise<Walked> => {
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
export const upd = (page: Page, n: number) =>
  page.evaluate((n) => {
    (window as unknown as W).__k1.upd(n);
    window.kq!.step(1);
  }, n);

/** n fixed updates with a render every 10 (the era shift transition runs on rendered frames too). */
export const frames = (page: Page, n: number) =>
  page.evaluate((n) => {
    for (let i = 0; i < n; i += 10) window.kq!.step(10);
    (window as unknown as W).__k1.settle();
  }, n);

/** Say lines / typing out of the way (they do not block anything, but keep screenshots clean). */
export const flush = (page: Page) => page.evaluate(() => window.kq!.story!.flush());

/** Q at an anchor in the present → the fx transition → 1789. */
export async function shiftToPast(page: Page): Promise<void> {
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
export async function holdQ(page: Page): Promise<void> {
  await installQuestPlay(page);
  await holdHome(page);
  await frames(page, 60);
  expect((await story(page)).era).toBe('today');
}
/** E next to a clue → its card → close. */
export async function examine(page: Page, id: string): Promise<void> {
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
export async function listen(page: Page, id: string, screenshot?: string): Promise<void> {
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
export async function talk(page: Page, npc: string, topics: string[]): Promise<string[]> {
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

/** Install the in-page walking helpers (once per page load). */
export async function ensureHelpers(page: Page): Promise<void> {
  if (!(await page.evaluate(() => !!(window as unknown as Partial<W>).__k1))) await page.evaluate(HELPERS);
}

export async function boot(page: Page, b?: string): Promise<void> {
  await page.goto(URL);
  await page.waitForFunction(() => !!window.kq?.story && !!window.kq?.chronik && !!window.kq?.npc && !!window.kq?.hunt && !!window.kq?.menagerie && !!window.kq?.quests && !!window.kq?.combat, null, { timeout: 180_000 });
  await ensureHelpers(page);
  await installQuestPlay(page);
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
    // a chapter boot: the prologue was not played here, its open quests leave the tracker
    for (const id of k.quests!.ids()) if (id.startsWith('q.p.') && k.quests!.state().quests[id]?.state !== 'done') k.quests!.reset(id);
    k.step(10);
  }, b);
}

/** Quest glyph over an NPC right now (offer / offer-main / active / ready / null). */
export const mark = (page: Page, npc: string) => page.evaluate((npc) => window.kq!.quests!.mark(npc), npc);
/** Face an NPC from a few metres and take the giver picture (its glyph overhead). */
export async function giverShot(page: Page, npc: string, from: [number, number], name: string): Promise<void> {
  await page.evaluate(
    ([npc, x, z]) => {
      const k = window.kq!;
      const n = k.npc!.list().find((f) => f.npc === npc)!;
      k.teleport(x, z, 0, 0);
      (window as unknown as W).__k1.face(n.x, n.z);
      k.ctx.player.pitch = -0.04;
      k.step(30);
      k.story!.flush();
    },
    [npc, from[0], from[1]] as const,
  );
  await cna(page, name);
}

/** The chapter's main playthrough (shared with e2e/campaign.spec.ts). */
export async function playK1(page: Page, o: PlayOptions = {}): Promise<void> {
  SHOTS = o.shots ?? true;
  await ensureHelpers(page);
  await installQuestPlay(page);
  let s = await story(page);
  expect(s).toMatchObject({ chapter: 'k1', beat: 'k1_0', era: 'today' });
  await expect(page.getByTestId('story-card')).toContainText('Der Hof');
  await o.at?.('k1:start');
  await ensureHelpers(page);
  await installQuestPlay(page);
  const npcs = await page.evaluate(() => window.kq!.npc!.list().map((n) => `${n.npc}@${n.era}`));
  expect(npcs.sort()).toEqual(['diener@1789', 'gaertner@1789', 'hanne@1789', 'jost@1789', 'soll@1789']);
  await upd(page, 400);
  expect(await qs(page, 'q.k1.ankunft')).toBe('active');
  // the Messstab comes along (the prologue's; in a chapter boot it is handed over quietly)
  expect(await page.evaluate(() => window.kq!.progression!.state().equipped.weapon)).toBeTruthy();

  // ======================= Teil A: the day =======================================================
  // ---- "Zu Fuß, außer einem": Q at the Ehrenhof, the guard at the gate --------------------------
  await page.evaluate(() => {
    window.kq!.teleport(1224, -1117, 80, 0);
    window.kq!.step(2);
  });
  await flush(page);
  await shiftToPast(page);
  expect(await beat(page)).toBe('k1_1');
  expect(await qn(page, 'q.k1.ankunft', 'wechsel')).toBe(1);
  await upd(page, 120);
  await shot(page, '01-ehrenhof-1789');
  await walk(page, [[1207, -1115]]);
  await upd(page, 30);
  expect((await page.evaluate(() => window.kq!.chronik!.echo())).id).toBe('clue.k1.wache');
  await page.evaluate(() => {
    window.kq!.chronik!.advanceEcho(120);
    window.kq!.step(2);
    window.kq!.ctx.ui.modals.closeAll();
    window.kq!.step(4);
  });
  expect(await untilQuest(page, 'q.k1.ankunft', 'done', 12)).toBe('done');
  expect(await until(page, 'k1_2', 6)).toBe('k1_2');

  // ---- "Der Kanzlist zählt": into the Registratur (walked), Soll gives his quest -------------------
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
  expect(await mark(page, 'soll')).toBe('offer-main');
  await walk(page, [[1200.5, -1152.6]], { tol: 0.5 });
  await page.evaluate(() => {
    (window as unknown as W).__k1.face(1198.8, -1152.6);
    window.kq!.ctx.player.pitch = -0.05;
    window.kq!.step(30);
  });
  await flush(page);
  await cna(page, 'k1-giver-soll');
  await talkQuest(page, 'soll', 'q.k1.registratur');
  expect(await qs(page, 'q.k1.registratur')).toBe('active');
  // the three papers in the room
  await walk(page, [[1203.9, -1154.4]], { tol: 0.3 });
  await examine(page, 'clue.k1.rechenbrett');
  await walk(page, [[1201.6, -1155.3]], { tol: 0.3 });
  await examine(page, 'clue.k1.schloezer');
  await walk(page, [[1205, -1151.6]], { tol: 0.3 });
  await examine(page, 'clue.k1.kaufbrief');
  expect(await qn(page, 'q.k1.registratur', 'heft')).toBe(1);
  // the window bangs open: six Mahnbriefe flutter out into the Küchenhof
  w = await walk(page, [
    [1202.3, -1148.6],
    [1203.2, -1147.4],
    [1215, -1149.3],
    [1216.6, -1149.9],
    [1219, -1150.3],
    [1218.2, -1159.1],
    [1218.5, -1164],
  ]);
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1214, -1172, 180, -4);
    (window as unknown as { __cna: { until(f: () => boolean, s: number): boolean } }).__cna.until(() => k.combat!.enemies().filter((e) => e.kind === 'mahnbrief').length >= 6, 10);
  });
  expect(await page.evaluate(() => window.kq!.combat!.enemies().filter((e) => e.kind === 'mahnbrief').length)).toBe(6);
  await fight(page, 'mahnbrief', { hits: 4, shot: 'k1-mahnbriefe' });
  expect(await qn(page, 'q.k1.registratur', 'briefe')).toBe(6);
  expect(await qs(page, 'q.k1.registratur')).toBe('ready');
  expect(await mark(page, 'soll')).toBe('ready');
  // back to Soll: the turn-in — his words, then the history with its sources (codex cards)
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1200.5, -1152.6, 0, 0);
    (window as unknown as W).__k1.face(1198.8, -1152.6);
    k.step(20);
    k.npc!.talk('soll');
    k.npc!.drain();
    k.npc!.ask('q:q.k1.registratur');
    k.npc!.drain();
    // the turn-in card: „Übergeben“, the reward card away, then the history moment
    k.npc!.choose('qt:q.k1.registratur');
    for (let i = 0; i < 6 && k.quests!.reward(); i++) {
      k.press('KeyE', 1);
      k.step(2);
    }
    for (let i = 0; i < 30 && !String(k.npc!.state().line?.id ?? '').startsWith('quest.10'); i++) k.npc!.advance();
    k.npc!.finish();
    k.step(2);
  });
  expect((await page.evaluate(() => window.kq!.npc!.state().line?.id)) ?? '').toMatch(/^quest\.10/);
  await cna(page, 'k1-turnin-history-source');
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 30; i++) k.npc!.drain();
    k.npc!.close();
    k.step(4);
  });
  expect(await untilQuest(page, 'q.k1.registratur', 'done', 6)).toBe('done');
  expect(await page.evaluate(() => window.kq!.progression!.state().inventory['item.charm.rechenpfennig'])).toBe(1);
  expect(await until(page, 'k1_3', 6)).toBe('k1_3');

  // ---- "Matthes' Lohn": Hanne, Soll, the mark — and at dusk the Schuldbuch --------------------
  expect(await mark(page, 'hanne')).toBe('offer-main');
  await giverShot(page, 'hanne', [1283.2, -1221.2], 'k1-giver-hanne');
  await talkQuest(page, 'hanne', 'q.k1.lohn');
  expect(await qs(page, 'q.k1.lohn')).toBe('active');
  await page.evaluate(() => {
    window.kq!.teleport(1262.3, -1216.4, 180, -10);
    window.kq!.step(10);
  });
  await walk(page, [[1262.3, -1217.6]], { tol: 0.4 });
  await examine(page, 'clue.k1.zeichen');
  expect(await page.evaluate(() => window.kq!.progression!.state().inventory['item.k1.zeichen'])).toBe(1);
  // ask the Kanzlist about Matthes ("angewiesen")
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1200.5, -1152.6, 0, 0);
    k.step(20);
    k.npc!.talk('soll');
    k.npc!.drain();
    k.npc!.ask('matthes');
    k.npc!.drain();
    k.npc!.close();
    k.step(6);
  });
  expect(await qn(page, 'q.k1.lohn', 'soll')).toBe(1);
  // dusk falls on the Bauplatz: a ledger rises from the grass
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1278, -1238, 90, -2);
    (window as unknown as { __cna: { until(f: () => boolean, s: number): boolean } }).__cna.until(() => k.combat!.enemies().some((e) => e.kind === 'schuldbuch'), 10);
  });
  expect((await story(page)).lookPast).toEqual({ era: '1789', time: 'dusk' });
  await page.evaluate(() => {
    const k = window.kq!;
    const e = k.combat!.enemies().find((x) => x.kind === 'schuldbuch')!;
    k.combat!.place(e.id, 1290, -1236, true);
    (window as unknown as W).__k1.face(1290, -1236);
    k.combat!.windup(e.id);
    k.combat!.freeze(true);
    k.step(20);
    k.story!.flush();
  });
  await cna(page, 'k1-schuldbuch-dusk');
  await page.evaluate(() => window.kq!.combat!.freeze(false));
  await fight(page, 'schuldbuch', { hits: 3 });
  expect(await qn(page, 'q.k1.lohn', 'buch')).toBe(1);
  // the wage slip from its pages
  const slip = await page.evaluate(() => window.kq!.progression!.pickups().find((p) => p.item === 'item.k1.lohnzettel'));
  expect(slip).toBeTruthy();
  await pickUp(page, slip!.x, slip!.z);
  expect(await qs(page, 'q.k1.lohn')).toBe('ready');
  await page.evaluate(() => {
    window.kq!.teleport(1284, -1224, 0, 0);
    window.kq!.step(10);
  });
  await talkQuest(page, 'hanne', 'q.k1.lohn', 'creuzer');
  expect(await untilQuest(page, 'q.k1.lohn', 'done', 6)).toBe('done');
  // no stance: the deed is the quest itself (the epilogue reads quest.q.k1.lohn = done)
  expect(await flag(page, 'flag.k1_lohn')).toBeUndefined();
  expect(await page.evaluate(() => window.kq!.progression!.state().equipped.weapon)).toBe('item.stab.eisen');
  expect(await until(page, 'k1_5', 8)).toBe('k1_5');
  // the side quests' givers have their glyphs now: the servant in the Pfeilersaal
  expect(await mark(page, 'diener')).toBe('offer');
  await giverShot(page, 'diener', [1245.5, -964], 'k1-giver-diener');

  // ---- "Tausend Hunde": Jost at the kennel ---------------------------------------------------------
  await page.evaluate(() => window.kq!.lantern!.setOil(1));
  expect(await mark(page, 'jost')).toBe('offer-main');
  await giverShot(page, 'jost', [1172.5, -1568], 'k1-giver-jost');
  await talkQuest(page, 'jost', 'q.k1.zwinger');
  expect(await qs(page, 'q.k1.zwinger')).toBe('active');
  await page.evaluate(() => {
    const k = window.kq!;
    k.npc!.talk('jost');
    k.npc!.drain();
    k.npc!.ask('verstecken');
    k.npc!.drain();
    k.npc!.close();
    k.step(4);
  });
  expect(await qn(page, 'q.k1.zwinger', 'lehre')).toBe(1);
  for (const [x, z] of [[1212, -1626], [1206, -1630], [1216, -1618], [1208, -1612], [1214, -1634]] as [number, number][]) await pickUp(page, x, z);
  expect(await qn(page, 'q.k1.zwinger', 'fleisch')).toBe(5);
  await page.evaluate(() => {
    window.kq!.teleport(1176, -1571, 90, 0);
    window.kq!.step(10);
  });
  expect(await qn(page, 'q.k1.zwinger', 'bringen')).toBe(1);
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1170, -1626, 180, -2);
    (window as unknown as { __cna: { until(f: () => boolean, s: number): boolean } }).__cna.until(() => k.combat!.enemies().filter((e) => e.kind === 'streuner').length >= 3, 10);
  });
  await fight(page, 'streuner', { hits: 4 });
  expect(await qn(page, 'q.k1.zwinger', 'streuner')).toBe(3);
  await page.evaluate(() => {
    window.kq!.teleport(1174.6, -1571, 90, 0);
    window.kq!.step(10);
  });
  await talkQuest(page, 'jost', 'q.k1.zwinger');
  expect(await untilQuest(page, 'q.k1.zwinger', 'done', 6)).toBe('done');
  expect(await page.evaluate(() => window.kq!.skills!.levels().spurenleser)).toBe(1);
  expect(await until(page, 'k1_6', 8)).toBe('k1_6');

  // ---- home: Q held, the station at dusk ----------------------------------------------------------
  await holdQ(page);
  await upd(page, 60);
  s = await story(page);
  expect(s.beat).toBe('k1_7');
  expect(s.look).toBe('dusk');
  expect(await qs(page, 'q.k1.karlslust')).toBe('active');
  await o.at?.('k1:teil-a-done');
  await ensureHelpers(page);
  await installQuestPlay(page);

  // ======================= Teil B: the Karlslust by night ========================================
  await page.evaluate(() => {
    window.kq!.teleport(1822, 70, 175, 0);
    window.kq!.step(2);
  });
  await upd(page, 60);
  await flush(page);
  await shiftToPast(page);
  expect(await beat(page)).toBe('k1_8');
  expect(await qn(page, 'q.k1.karlslust', 'terrasse')).toBe(1);
  await upd(page, 120);
  // the gardener by the Rund: the cassowary is out
  expect(await mark(page, 'gaertner')).toBe('offer');
  await giverShot(page, 'gaertner', [1897, 84], 'k1-giver-gaertner');
  await page.evaluate(() => {
    window.kq!.teleport(1860, 86, 90, 0);
    window.kq!.step(4);
  });
  w = await walk(page, [[1899, 87]]);
  expect(await beat(page)).toBe('k1_9');
  await walk(page, [
    [1909, 58],
    [1935, 48],
    [1962, 59],
    [1976, 87],
    [1962, 115],
    [1935, 125],
  ]);
  await upd(page, 30);
  expect((await inv(page)).clues).toContain('clue.k1.amphitheater');
  expect(await beat(page)).toBe('k1_10');
  await walk(page, [[1957.5, 145.5]], { tol: 0.5 });
  await examine(page, 'clue.k1.baerenkaesten');
  await upd(page, 10);
  expect(await beat(page)).toBe('k1_11');
  // night: lights over the Schwanenweiher, then the pack
  await page.evaluate(() => {
    const k = window.kq!;
    k.lantern!.setOil(1);
    k.teleport(1846, 236, 30, -2);
    (window as unknown as { __cna: { until(f: () => boolean, s: number): boolean } }).__cna.until(() => k.combat!.enemies().filter((e) => e.kind === 'irrlicht').length >= 5, 10);
  });
  expect(await page.evaluate(() => window.kq!.hunt!.state())).toBeNull(); // no pack during the fight
  await fight(page, 'irrlicht', { hits: 5, shot: 'k1-irrlichter-schwanenweiher' });
  expect(await qn(page, 'q.k1.karlslust', 'lichter')).toBe(5);
  expect(
    await page.evaluate(() => {
      const k = window.kq!;
      (window as unknown as { __cna: { until(f: () => boolean, s: number): boolean } }).__cna.until(() => k.hunt!.state()?.mode === 'patrol', 60);
      return k.hunt!.state()?.mode;
    }),
  ).toBe('patrol');
  await page.evaluate(() => {
    window.kq!.press('KeyL', 2);
    if (window.kq!.ctx.player.stance !== 'crouch') window.kq!.press('KeyC', 2);
  });
  w = await walk(page, [
    [1822, 236],
    [1818, 300],
    [1816, 338],
  ], { until: 'k1_11' });
  expect(w.beat).toBe('k1_12');

  // ---- the Rondell: a quiet place (memorial): no fight, no bark, the echo ---------------------------
  await walk(page, [[1815, 341]]);
  await flush(page);
  expect(await page.evaluate(() => window.kq!.combat!.enemies().filter((e) => Math.hypot(e.x - 1815, e.z - 348) < 60).length)).toBe(0);
  await page.evaluate(() => {
    (window as unknown as W).__k1.face(1815, 300);
    window.kq!.ctx.player.pitch = 0.04;
    window.kq!.step(10);
  });
  await cna(page, 'k1-rondell');
  await listen(page, 'clue.k1.feuerwerk');
  expect(await beat(page)).toBe('k1_13');
  await walk(page, [[1811, 361.5]], { tol: 0.4 });
  await page.evaluate(() => {
    window.kq!.press('KeyL', 2);
    window.kq!.press('Space', 2);
    (window as unknown as W).__k1.face(1811, 366);
    window.kq!.ctx.player.pitch = -0.4;
    window.kq!.step(4);
  });
  await examine(page, 'clue.k1.seite');
  expect(await page.evaluate(() => window.kq!.progression!.state().inventory['item.k1.seite'])).toBe(1);
  await upd(page, 20);
  expect(await beat(page)).toBe('k1_14');
  expect(await page.evaluate(() => window.kq!.hunt!.state()?.mode)).toBe('parforce');
  w = await walk(page, [
    [1818, 330],
    [1818, 260],
    [1814, 214],
    [1812, 203],
  ], { sprint: true, until: 'k1_14' });
  expect(w.beat).toBe('k1_15');
  expect(await qn(page, 'q.k1.karlslust', 'flucht')).toBe(1);
  await shot(page, '02-tosbecken');
  await holdQ(page);
  expect(await untilQuest(page, 'q.k1.karlslust', 'done', 10)).toBe('done');
  expect(await page.evaluate(() => window.kq!.skills!.levels())).toMatchObject({ spurenleser: 1, kartograf: 2 });
  expect(await until(page, 'k1_17', 30)).toBe('k1_17');
  await shot(page, '03-raureif');
  await page.evaluate(() => (window as unknown as { __cna: { until(f: () => boolean, s: number): boolean } }).__cna.until(() => window.kq!.story!.state().chapter === 'k2', 30));
  s = await story(page);
  expect(s.completed).toContain('k1');
  expect(s.chapter).toBe('k2');
  expect(await page.evaluate(() => window.kq!.progression!.state().level)).toBeGreaterThanOrEqual(4);
}
