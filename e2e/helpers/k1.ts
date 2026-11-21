import { type Page, expect } from '@playwright/test';
import { type PlayOptions, SCREENS } from './common';
import { cna, fight, flag, holdHome, installQuestPlay, pickUp, qn, qs, talkQuest, until, untilQuest } from './prolog';

/**
 * Chapter 1 "Der Hof" as an action-RPG quest chain (docs/ACTION-RPG.md §11.1), played through
 * headless (`?manual`, driven through window.kq):
 *
 *   Teil A (1789, day → dusk)  dawn at the spring → "Zu Fuß, außer einem" (the Karlsbergquelle: E
 *   at the trough, the shift; in 1789 a jump to the Ehrenhof gate, the guard's echo) → "Der
 *   Kanzlist zählt" (walk into the Registratur, Soll gives the quest, three papers,
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
  // one centre card at a time (src/ui/cards.ts): the page waits while something fights you — a
  // straggler from an earlier group swatting at the player: clear it and let the 3 s linger pass
  const held = await page.evaluate(() => {
    const k = window.kq!;
    const reasons = k.ctx.ui.cards.holdReasons();
    if (!document.querySelector('[data-testid="chronik-card"]') && reasons.length) {
      const p = k.ctx.player.position;
      for (const e of k.combat?.enemies() ?? []) if (Math.hypot(e.x - p.x, e.z - p.z) < 30) k.combat!.kill(e.id);
      for (let i = 0; i < 240 && !document.querySelector('[data-testid="chronik-card"]'); i++) k.step(1);
    }
    return reasons;
  });
  if (held.length) console.log(`[k1] ${id}: the page waited for ${held.join(', ')}`);
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

/** In front of the Karlsbergquelle's trough, facing the water (the touch reaches 2.1 m from it; prologue spot). */
export const SPRING = { x: 1059.3, z: -833.1, yaw: 50 } as const;
/** The chapter's checkpoint and the k1_0b wake (story 01-kapitel-1): the same spot, within reach of the water. */
export const K1_START = SPRING;
/** The water in the trough (what the player faces for the E prompt). */
export const SPRING_WATER = { x: 1061, z: -834.5 } as const;
/** The walk up in 1789: the trail out of the hollow, west of the Orangerie, in through the Ehrenhof gate. */
export const SPRING_TO_COURT: [number, number][] = [
  [1100, -870],
  [1150, -920],
  [1190, -980],
  [1185, -1050],
  [1172, -1085],
  [1170, -1112],
  [1190, -1116],
];

/** Distance of the player from a point (x/z), in metres. */
export const distTo = (page: Page, x: number, z: number) =>
  page.evaluate(([x, z]) => Math.hypot(window.kq!.ctx.player.position.x - x, window.kq!.ctx.player.position.z - z), [x, z] as const);

/**
 * The touch at the Karlsbergquelle (k1_0; shaped to move to helpers/prolog.ts later: it needs only
 * the page and window.kq). Steps to the trough (unless `stay`: k1 opens within reach), faces the water, expects the
 * spring's E prompt, presses E, runs the ~2.7 s touch scene on game time, jumps past the fx shift
 * transition and expects 1789 with the quest objective counted (`quest`/`objective`, default
 * q.k1.ankunft/quelle).
 */
export async function touchSpring(page: Page, o: { stay?: boolean; quest?: string; objective?: string; screenshot?: (name: string) => Promise<void> } = {}): Promise<void> {
  await page.evaluate(
    ([spot, water, stay]) => {
      const k = window.kq!;
      if (!stay) k.teleport(spot.x, spot.z, spot.yaw, 0);
      const p = k.ctx.player.position;
      k.ctx.player.yaw = Math.atan2(-(water.x - p.x), -(water.z - p.z));
      k.ctx.player.pitch = 0;
      k.step(4);
    },
    [SPRING, SPRING_WATER, !!o.stay] as const,
  );
  expect(await page.evaluate(() => window.kq!.quelle!.info().prompt), 'E "Wasser berühren" at the trough').toBe(true);
  await o.screenshot?.('quelle-heute');
  await page.evaluate(() => window.kq!.press('KeyE', 1));
  // the touch scene runs ~2.7 s of game time (fixed updates without renders), then the story shifts
  await page.evaluate(() => {
    // fixed updates without a render each (as K1Helpers.upd; the loop's callback is private)
    const loop = window.kq!.ctx.loop as unknown as { cb: { update(dt: number): void }; dt: number; tick: number };
    for (let i = 0; i < 200; i++) {
      loop.cb.update(loop.dt);
      loop.tick++;
    }
    window.kq!.step(1);
    // the fx transition runs on rendered frames: jump past its end
    window.kq!.fx!.shiftAt(3.6);
    for (let i = 0; i < 60; i += 10) window.kq!.step(10);
  });
  expect(await page.evaluate(() => window.kq!.ctx.era.current)).toBe('1789');
  const n = await page.evaluate(
    ([id, ob]) => (window.kq!.quests!.state().quests[id] ?? { counts: {} as Record<string, number> }).counts[ob] ?? 0,
    [o.quest ?? 'q.k1.ankunft', o.objective ?? 'quelle'] as const,
  );
  expect(n, 'the touch counts the quest objective').toBe(1);
}

/**
 * The chapter's opening the long way (story k1_0 → k1_0b → k1_1): the touch at the spring, then the
 * walk up to the court on foot with the real controller. Returns the nearest enemy seen on the way (m).
 */
export async function openAtSpring(page: Page, o: { shots?: boolean } = {}): Promise<number> {
  await ensureHelpers(page);
  expect(await page.evaluate(() => window.kq!.state().flags['quelle.call'])).toBe(true);
  await touchSpring(page, { screenshot: o.shots === false ? undefined : (n) => shot(page, `00-${n}`) });
  let s = await story(page);
  expect(s).toMatchObject({ era: '1789', beat: 'k1_0b' });
  // the lantern waits for the court (the fresh drop carries the walk)
  expect(!!s.meters.oil).toBe(false);
  await upd(page, 60);
  if (o.shots !== false) await shot(page, '00-quelle-1789');
  // the walk up passes the Bleiche and the Orangerie: the disguise (coat, letter, the Musterung)
  let near = 1e9;
  const track = async () => {
    near = Math.min(near, ...(await page.evaluate(() => { const p = window.kq!.ctx.player.position; return window.kq!.combat!.enemies().map((e) => Math.hypot(e.x - p.x, e.z - p.z)); })));
  };
  await track();
  await playDisguise(page, { walk: true, shots: o.shots !== false });
  await track();
  await upd(page, 20);
  s = await story(page);
  expect(s.beat).toBe('k1_1');
  expect(await qn(page, 'q.k1.ankunft', 'wechsel')).toBe(1);
  expect(!!s.meters.oil, 'the lantern burns from the court on').toBe(true);
  return near;
}

/**
 * The disguise opening (story k1_0b → k1_0c, docs/IDEAS-ROUND11.md §2; the court system
 * src/systems/court): from the spring in 1789 down to Liese's Bleiche, Kaspar's coat lifted off line
 * B unseen (behind the lines, out of her view), up to the Hofgärtner on the Orangerie lawn (the
 * teaching zone: watched, nothing happens to a calm player in the coat), paper by asking, the letter
 * at his table, then the Musterung at the gitter (E held 1 s, 2.5 s standing still) → court.admitted,
 * the gate open, k1_1. `walk` walks the legs with the real controller (else short jumps between the
 * places, for the campaign). Returns the court's state at the end.
 */
export const DISGUISE_SPOTS = {
  /** From the spring down the trail to the front of the Bleiche, round its right end, behind line B. */
  toBleiche: [
    [1047, -845],
    [1035.7, -855.1],
    [1018, -866],
    [1013.9, -867.5],
    [1010.5, -879],
    [1008.6, -882.8],
    [1003.9, -883.8],
  ] as [number, number][],
  /** COAT_REACH (src/systems/bleiche/layout.ts): behind line B, facing the coat. */
  coatReach: { x: 1001.08, z: -880.9 },
  coat: { x: 1001.9, z: -880.42 },
  /** Back up the trail, west of the Orangerie, onto its lawn. */
  toLawn: [
    [1003.9, -883.8],
    [1013.9, -867.5],
    [1035.7, -855.1],
    [1100, -870],
    [1150, -920],
    [1190, -980],
    [1195, -1000],
    [1208, -1004],
    [1215, -1000],
    [1219.3, -994.6],
  ] as [number, number][],
  hofgaertner: { x: 1221, z: -993 },
  /** Before his table (clue.k1.brief at 1226/−1003, r 2.5). */
  tisch: { x: 1225.1, z: -1002.3, face: [1226, -1003] as [number, number] },
  /** Down off the lawn and along the trail to the forecourt, in front of the gate's Gardist. */
  toGate: [
    [1215, -1003],
    [1200, -1005],
    [1195, -1010],
    [1190, -1030],
    [1185, -1050],
    [1172, -1085],
    [1170, -1112],
    [1191.2, -1113],
  ] as [number, number][],
  gardist: { x: 1194.6, z: -1111.5 },
} as const;

export async function playDisguise(page: Page, o: { walk?: boolean; shots?: boolean } = {}): Promise<ReturnType<NonNullable<NonNullable<typeof window.kq>['court']>['state']>> {
  const D = DISGUISE_SPOTS;
  const shots = o.shots !== false;
  await ensureHelpers(page);
  await installQuestPlay(page);
  expect(await beat(page)).toBe('k1_0b');
  expect(await page.evaluate(() => window.kq!.court!.state().sets)).toContain('k1');
  // ejections so far (a spec may have been sent out once before): the disguise itself adds none
  const ejected0 = await page.evaluate(() => window.kq!.court!.state().ejected);
  const go = async (pts: [number, number][], end: { x: number; z: number }) => {
    if (o.walk) {
      const w = await walk(page, pts, { tol: 0.6 });
      expect(Math.hypot(w.x - end.x, w.z - end.z), `walked to ${end.x}/${end.z}`).toBeLessThan(1.2);
    } else
      await page.evaluate((e) => {
        window.kq!.teleport(e.x, e.z, 0, 0);
        window.kq!.step(4);
      }, end);
    await upd(page, 20);
  };
  /** Step towards `t` until `ok()` (or `stop` m from it): a walked leg ends up to ~1 m off its point. */
  const closeIn = async (t: { x: number; z: number }, stop: number, ok: () => Promise<boolean>) => {
    for (let i = 0; i < 3 && !(await ok()); i++) {
      const p = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      const k = Math.max(0, (d - stop) / d);
      const e = { x: p.x + (t.x - p.x) * k, z: p.z + (t.z - p.z) * k };
      if (o.walk) await walk(page, [[e.x, e.z]], { tol: 0.3 });
      else
        await page.evaluate((e) => {
          window.kq!.teleport(e.x, e.z, 0, 0);
          window.kq!.step(4);
        }, e);
      await upd(page, 20);
    }
  };
  const face = (x: number, z: number) =>
    page.evaluate(
      ([x, z]) => {
        (window as unknown as W).__k1.face(x, z);
        window.kq!.ctx.player.pitch = -0.15;
        (window as unknown as W).__k1.settle();
      },
      [x, z] as const,
    );

  // ---- the coat: behind line B, Liese looks at the trail ------------------------------------------
  await upd(page, 120);
  expect(await qs(page, 'q.k1.kleider')).toBe('active');
  await go(D.toBleiche.concat([[D.coatReach.x, D.coatReach.z]]), D.coatReach);
  await face(D.coat.x, D.coat.z);
  await flush(page);
  if (shots) await shot(page, '0b-bleiche');
  await examine(page, 'clue.k1.rock');
  await upd(page, 30);
  let f = await flags(page);
  expect(f['disguise.coat']).toBe(true);
  expect(f['flag.k1_kleid']).toBe('genommen');
  expect(await page.evaluate(() => window.kq!.scenery?.coat().visible ?? true), 'the coat left the line').toBe(false);
  expect(await page.evaluate(() => window.kq!.court!.state().costume)).toBe('court');
  // unseen: nobody escorted you anywhere
  expect(await page.evaluate(() => window.kq!.court!.state().ejected)).toBe(ejected0);
  expect(await untilQuest(page, 'q.k1.kleider', 'done', 10)).toBe('done');
  expect(await untilQuest(page, 'q.k1.brief', 'active', 10)).toBe('active');

  // ---- the paper: the Hofgärtner on the Orangerie lawn (the teaching zone) ------------------------
  await go(D.toLawn, { x: D.toLawn.at(-1)![0], z: D.toLawn.at(-1)![1] });
  // a walk ends within ~1 m of its point: close in until his talk bubble (2.8 m) has you
  await closeIn(D.hofgaertner, 1.6, async () => (await page.evaluate(() => window.kq!.npc!.state().near)) === 'hofgaertner');
  await face(D.hofgaertner.x, D.hofgaertner.z);
  let c = await page.evaluate(() => window.kq!.court!.state());
  expect(c.zone, 'on the lawn: inside the teaching zone').toBe('court.orangerie');
  expect(c.ejected, 'the coat lets a calm player walk where the court looks').toBe(ejected0);
  await flush(page);
  if (shots) await shot(page, '0b-hofgaertner');
  await talk(page, 'hofgaertner', ['papier']);
  await upd(page, 20);
  expect(await qn(page, 'q.k1.brief', 'papier')).toBe(1);
  expect((await inv(page)).clues).toContain('clue.k1.papier');
  // the letter at his table: Laub writes
  await go([[D.tisch.x, D.tisch.z]], D.tisch);
  await face(...D.tisch.face);
  await examine(page, 'clue.k1.brief');
  await upd(page, 30);
  f = await flags(page);
  expect(f['disguise.letter']).toBe(true);
  expect(await untilQuest(page, 'q.k1.brief', 'done', 10)).toBe('done');
  expect(await until(page, 'k1_0c', 6)).toBe('k1_0c');
  expect(!!(await story(page)).meters.oil, 'still the prelude: no lantern').toBe(false);

  // ---- the Musterung: E at the gate's Gardist, then stand still ------------------------------------
  await go(D.toGate, { x: D.toGate.at(-1)![0], z: D.toGate.at(-1)![1] });
  await closeIn(D.gardist, 2.6, async () => (await page.evaluate(() => window.kq!.court!.state().inspector)) === 'gardist-tor');
  await face(D.gardist.x, D.gardist.z);
  await flush(page);
  c = await page.evaluate(() => window.kq!.court!.state());
  expect(c.inspector, 'within reach of the inspecting Gardist').toBe('gardist-tor');
  expect(c.admitted).toBe(false);
  if (shots) await shot(page, '0c-musterung');
  await page.evaluate(() => (window as unknown as W).__k1.hold('KeyE', 70));
  c = await page.evaluate(() => window.kq!.court!.state());
  expect(c.ring, 'the ring runs').not.toBeNull();
  // 2.5 s standing still
  await upd(page, 170);
  c = await page.evaluate(() => window.kq!.court!.state());
  expect(c.admitted).toBe(true);
  expect(c.ejected).toBe(ejected0);
  expect(await until(page, 'k1_1', 6)).toBe('k1_1');
  return page.evaluate(() => window.kq!.court!.state());
}

/** The chapter's main playthrough (shared with e2e/campaign.spec.ts). */
export async function playK1(page: Page, o: PlayOptions = {}): Promise<void> {
  SHOTS = o.shots ?? true;
  await ensureHelpers(page);
  await installQuestPlay(page);
  let s = await story(page);
  expect(s).toMatchObject({ chapter: 'k1', beat: 'k1_0', era: 'today' });
  // the chapter opens at the Karlsbergquelle at dawn (its checkpoint), not in the station bed
  expect(await distTo(page, K1_START.x, K1_START.z), 'k1 starts at the spring').toBeLessThan(30);
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
  // ---- "Zu Fuß, außer einem": the Karlsbergquelle, the guard at the gate ---------------------------
  // the checkpoint is within reach of the water: no step forward
  await touchSpring(page, { stay: true, screenshot: (n) => shot(page, `00-${n}`) });
  s = await story(page);
  expect(s).toMatchObject({ era: '1789', beat: 'k1_0b' });
  expect(!!s.meters.oil, 'no lantern in the prelude').toBe(false);
  // the walk up is e2e/chapter-k1-quelle.spec.ts's: here the disguise with short jumps between its
  // places (coat, paper, letter, the Musterung at the gitter)
  await playDisguise(page, { shots: o.shots });
  await upd(page, 20);
  s = await story(page);
  expect(s.beat).toBe('k1_1');
  expect(await qn(page, 'q.k1.ankunft', 'wechsel')).toBe(1);
  expect(!!s.meters.oil, 'the lantern burns from the court on').toBe(true);
  await flush(page);
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
    (window as unknown as { __cna: { until(f: () => boolean, s: number): boolean } }).__cna.until(() => k.combat!.enemies().filter((e) => e.kind === 'streuner').length >= 4, 10);
  });
  await fight(page, 'streuner', { hits: 4 });
  expect(await qn(page, 'q.k1.zwinger', 'streuner')).toBe(4);
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
  // (walking up to the ring may already have counted it: k1_9 or, a moment later, k1_10)
  expect(['k1_9', 'k1_10']).toContain(await beat(page));
  // no lap round the 19 huts any more (playtest round 4): at the ring the doors light up one after
  // the other, round the circuit, while Laub counts; then dunning letters tear out of the north doors
  await upd(page, 60 * 8);
  expect(await page.evaluate(() => (window.kq as unknown as { scenery?: { rundCounted(): number } }).scenery?.rundCounted() ?? 19)).toBe(19);
  expect((await inv(page)).clues).toContain('clue.k1.amphitheater');
  expect(await beat(page)).toBe('k1_10');
  await page.evaluate(() => {
    const h = (window as unknown as { __cna?: { until(f: () => boolean, s: number): boolean } }).__cna;
    h?.until(() => window.kq!.combat!.enemies().some((e) => e.group === 'k1.rund'), 6);
  });
  expect(await page.evaluate(() => window.kq!.combat!.enemies().filter((e) => e.group === 'k1.rund').length)).toBe(3);
  await fight(page, 'k1.rund', { hits: 4, shot: 'k1-rund-mahnbriefe' });
  // the fight leaves you somewhere in the ring: from the south doors on to the bear pits
  await page.evaluate(() => {
    window.kq!.teleport(1950, 128, 20, 0);
    window.kq!.step(4);
  });
  w = await walk(page, [[1957.5, 145.5]], { tol: 0.5 });
  expect(w.d).toBeLessThan(1.5);
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
  // the par force hunt: eight hounds, the rider far up the slope, flankers that spring — down the
  // cascade to the narrows, where the pack stands you; two waves of strays; then the dash to the water
  w = await walk(page, [
    [1816, 330],
    [1812, 300],
    [1810, 276],
  ], { sprint: true, until: 'k1_14' });
  expect(w.beat).toBe('k1_14b');
  expect(await page.evaluate(() => window.kq!.hunt!.state()?.agents.filter((a) => a.kind === 'hound').length)).toBeGreaterThanOrEqual(8);
  await upd(page, 120);
  expect(await page.evaluate(() => window.kq!.hunt!.mode())).toMatchObject({ mode: 'stand', phase: 'engaged' });
  await page.evaluate(() => {
    (window as unknown as W).__k1.face(1812, 300);
    window.kq!.step(4);
  });
  await shot(page, '02a-enge');
  await fight(page, 'k1.enge', { hits: 4 });
  await upd(page, 150);
  await fight(page, 'k1.enge.2', { hits: 4 });
  await upd(page, 20);
  expect(await beat(page)).toBe('k1_14c');
  expect(await page.evaluate(() => window.kq!.hunt!.state()?.mode)).toBe('parforce');
  w = await walk(page, [
    [1812, 240],
    [1812, 203],
  ], { sprint: true, until: 'k1_14c' });
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
