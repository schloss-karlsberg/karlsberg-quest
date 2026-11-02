import { type Page, expect } from '@playwright/test';
import { type PlayOptions, SCREENS } from './common';

/**
 * Chapter 3 "Die Nacht", played through headless (`?manual`, driven through window.kq), with the
 * real content (story 03-kapitel-3.story.json + kapitel-3 pack):
 *
 *   Feldstation → Q at the Ehrenhof → Teil A (stroh echo, Lehnstuhl, Küchenhof + Hanne, Soll in
 *   the Registratur, Waffensammlung, Naturalienkabinett, the gallery: echo, tape, trapdoor, the
 *   grey book, Tempelzimmer) → the Kommissär's torch → the fire: up the Prunktreppe into the
 *   burning Festsaal → the choice (one object) → down and out through the smoke → the garden and
 *   the pack (by ear) → the Gärtnerei gate → north past the jaguar to the Zwinger → Jost → back
 *   to today → the object on the table → the case page confirmed → cliffhanger → chapter 4.
 *
 * Every clue is examined at its place (the Chronik's E target must be that clue there), rooms
 * are walked through their doors (only stair halls are skipped with `interiors.enter`), and the
 * escape from the fire and the sneak past the pack are walked with the real smoke / hunt.
 * Used by e2e/chapter-k3.spec.ts and e2e/campaign.spec.ts. Screenshots: test-results/screens/ch-k3-*.png.
 */
// biome-ignore lint/suspicious/noExplicitAny: test glue
export type Any = any;
let SHOTS = true;



export async function shot(page: Page, name: string): Promise<void> {
  // let a skill card (real-time HUD card) leave the picture
  await page.waitForFunction(() => (window.kq as Any).skills?.card() === null, null, { timeout: 60_000 }).catch(() => undefined);
  if (!SHOTS) return;
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SCREENS}/ch-k3-${name}.png`, timeout: 150_000 });
}

/**
 * In-page helpers (window.k3h): a walker that steers the player with the real input (W, Shift,
 * C) along waypoints, a door router over the interiors' door graph (same storey only), and small
 * conveniences. Installed once per page.
 */
export async function install(page: Page): Promise<void> {
  await page.evaluate(() => {
    if ((window as Any).k3h) return;
    // biome-ignore lint/suspicious/noExplicitAny: test glue
    const k = window.kq as any;
    const p = k.ctx.player.position;
    const room = () => k.interiors.room()?.roomId ?? null;
    const caughtFlag = { v: false };
    k.ctx.events.on('player:caught', () => (caughtFlag.v = true));
    const walk = (pts: [number, number, number?][], o: { sprint?: boolean; crouch?: boolean; chunk?: number; max?: number; until?: () => boolean; wary?: number } = {}) => {
      let stuck = false;
      let smokeMax = 0;
      const rooms: string[] = [];
      const trace: string[] = [];
      let waited = 0;
      caughtFlag.v = false;
      if (!k.story.choice()) k.ctx.ui.modals.closeAll();
      const chunk = o.chunk ?? 10;
      if (o.crouch) k.ctx.input.simulate('KeyC', true), k.step(1), k.ctx.input.simulate('KeyC', false);
      for (const t of pts) {
        let best = 1e9;
        let still = 0;
        let dodges = 0;
        for (let i = 0; i < (o.max ?? 900); i++) {
          if (caughtFlag.v || (o.until && o.until())) break;
          const dx = t[0] - p.x;
          const dz = t[1] - p.z;
          const d = Math.hypot(dx, dz);
          if (d < (t[2] ?? 0.7)) break;
          // wary: a player who sees a hound close by (its marker) keeps still until it turns away
          if (o.wary && waited < 3600) {
            const h = k.hunt.state();
            const near = h ? Math.min(...h.agents.map((a: { x: number; z: number }) => Math.hypot(a.x - p.x, a.z - p.z))) : 1e9;
            if (near < o.wary || (h && h.alert > 0.45 && near < o.wary * 1.6)) {
              k.ctx.input.simulate('KeyW', false);
              k.ctx.input.simulate('ShiftLeft', false);
              k.step(chunk);
              waited += chunk;
              i--;
              continue;
            }
          }
          k.ctx.player.yaw = -Math.atan2(dx, -dz);
          k.ctx.input.simulate('KeyW', true);
          if (o.sprint) k.ctx.input.simulate('ShiftLeft', true);
          k.step(chunk);
          const f = k.fx.state().fire;
          if (f.active) smokeMax = Math.max(smokeMax, f.smoke);
          const rm = room();
          if (rm && rooms[rooms.length - 1] !== rm) rooms.push(rm);
          if (d < best - 0.04) {
            best = d;
            still = 0;
          } else if (++still > Math.max(8, 72 / chunk)) {
            // blocked (a table, a column): side-step like a player would, then try again
            if (dodges < 6) {
              const side = dodges % 2 === 0 ? 'KeyA' : 'KeyD';
              k.ctx.input.simulate('KeyW', false);
              k.ctx.input.simulate('KeyS', true);
              k.step(10);
              k.ctx.input.simulate('KeyS', false);
              k.ctx.input.simulate(side, true);
              k.step(20 + 15 * dodges);
              k.ctx.input.simulate(side, false);
              dodges++;
              still = 0;
              best = 1e9;
              continue;
            }
            stuck = true;
            break;
          }
        }
        k.ctx.input.simulate('KeyW', false);
        k.ctx.input.simulate('ShiftLeft', false);
        trace.push(`${t[0]},${t[1]}: ${room() ?? '-'} smoke ${k.fx.state().fire.smoke.toFixed(2)} clock ${k.fx.state().fire.clock.toFixed(1)}`);
        if (stuck || caughtFlag.v || (o.until && o.until())) break;
      }
      if (o.crouch) k.ctx.input.simulate('KeyC', true), k.step(1), k.ctx.input.simulate('KeyC', false);
      return { x: p.x, z: p.z, y: p.y, room: room(), stuck, caught: caughtFlag.v, smokeMax, rooms, trace, waited };
    };
    /** Rooms → doors path on the player's storey (|Δfloor| < 0.8) from the current room to `target` ('OUT' = an outer door; `via` picks the outer door nearest to a point). */
    const route = (target: string, via?: { x: number; z: number }) => {
      const doors = k.interiors.doors() as { from: string; to: string | null; x: number; z: number; nx: number; nz: number; floor: number; stoop: { length: number } | null; kind: string }[];
      const start = room();
      if (!start) return null;
      const prev = new Map<string, { r: string; d: (typeof doors)[number] } | null>([[start, null]]);
      const queue = [start];
      let found: string | null = null;
      while (queue.length) {
        const r = queue.shift()!;
        if (r === target) {
          found = r;
          break;
        }
        if (r === 'OUT') continue;
        const outs = doors.filter((d) => d.from === r || d.to === r);
        if (target === 'OUT' && via) outs.sort((a, b) => Math.hypot(a.x - via.x, a.z - via.z) - Math.hypot(b.x - via.x, b.z - via.z));
        for (const d of outs) {
          const nb = d.from === r ? (d.to ?? 'OUT') : d.from;
          if (nb === 'OUT' && target !== 'OUT') continue;
          if (nb === 'OUT' && via && Math.hypot(d.x - via.x, d.z - via.z) > 12) continue;
          if (prev.has(nb)) continue;
          prev.set(nb, { r, d });
          queue.push(nb);
        }
      }
      if (!found) return null;
      const steps: { r: string; d: (typeof doors)[number] }[] = [];
      for (let c = found; prev.get(c); c = prev.get(c)!.r) steps.unshift({ ...prev.get(c)!, r: c });
      // keep to one storey: a door whose floor jumps is a stair the walker cannot climb
      const pts: [number, number, number][] = [];
      let floor = p.y;
      for (const s of steps) {
        if (Math.abs(s.d.floor - floor) > 0.8 && s.d.kind !== 'outer') return { blocked: s.d, pts };
        floor = s.d.floor;
        const forward = s.d.to === s.r || (s.d.to === null && s.r === 'OUT');
        const sx = forward ? s.d.nx : -s.d.nx;
        const sz = forward ? s.d.nz : -s.d.nz;
        const out = s.d.stoop ? s.d.stoop.length + 1.6 : 1.1;
        pts.push([s.d.x - sx * 1.1, s.d.z - sz * 1.1, 0.45], [s.d.x + sx * out, s.d.z + sz * out, 0.45]);
      }
      return { pts };
    };
    const go = (target: string, o: { sprint?: boolean; via?: { x: number; z: number } } = {}) => {
      const r = route(target, o.via);
      if (!r || 'blocked' in r) return { error: r ? `stair at ${JSON.stringify(r.blocked)}` : `no route ${room()} → ${target}` };
      return walk(r.pts, { sprint: o.sprint, chunk: o.sprint ? 4 : 6 });
    };
    /** Stand 2 m in front of an NPC, facing it. */
    const faceNpc = (id: string) => {
      const n = k.npc.list().find((f: { npc: string }) => f.npc === id);
      if (!n) return null;
      const dx = p.x - n.x;
      const dz = p.z - n.z;
      const l = Math.hypot(dx, dz) || 1;
      const x = n.x + (dx / l) * 2;
      const z = n.z + (dz / l) * 2;
      k.teleport(x, z, (Math.atan2(n.x - x, -(n.z - z)) * 180) / Math.PI, 2);
      k.step(2);
      return k.npc.state().near;
    };
    const look = (x: number, z: number, pitch = 4) => {
      k.ctx.player.yaw = -Math.atan2(x - p.x, -(z - p.z));
      k.ctx.player.pitch = (pitch * Math.PI) / 180;
      k.step(1);
    };
    /** Close cards/boards (never the choice) and drain the story's queue. */
    const lines = () => {
      for (let i = 0; i < 80; i++) {
        const st = k.story.state();
        if (!st.dialogue && !st.pendingLines) break;
        if (k.ctx.ui.modals.count > 0 && !k.story.choice()) k.ctx.ui.modals.closeAll();
        k.story.finishTyping();
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }));
        k.step(2);
      }
    };
    const settle = (n = 30) => {
      if (!k.story.choice()) k.ctx.ui.modals.closeAll();
      k.story.flush();
      lines();
      k.step(n);
      k.story.flush();
      lines();
      if (!k.story.choice()) k.ctx.ui.modals.closeAll();
    };
    // biome-ignore lint/suspicious/noExplicitAny: test glue
    (window as any).k3h = { walk, route, go, faceNpc, look, settle, lines, room };
  });
}

export const story = (page: Page) => page.evaluate(() => window.kq!.story!.state());
export const inv = (page: Page) => page.evaluate(() => window.kq!.state().inventory);
export const flags = (page: Page) => page.evaluate(() => window.kq!.state().flags);

/** Walk to a clue's place: the Chronik's E target must be this clue, then examine it (tap E). */
export async function examineAt(page: Page, id: string, at: [number, number], o: { floor?: number } = {}): Promise<void> {
  const r = await page.evaluate(
    ({ id, at, o }) => {
      const k = window.kq as Any;
      const h = (window as Any).k3h;
      if (o.floor !== undefined) {
        k.ctx.player.position.set(k.ctx.player.position.x, o.floor + 0.05, k.ctx.player.position.z);
      }
      const w = h.walk([[at[0], at[1], 0.6]], { chunk: 8 });
      // the Chronik picks its E target in the render frame, every 0.2 s: each step() call renders
      // one frame of 1/60 s, so draw 15 of them (rAF may stall on a busy software renderer)
      for (let i = 0; i < 15; i++) k.step(1);
      return { target: k.chronik.target() as string | null, status: k.chronik.status(id), w };
    },
    { id, at, o },
  );
  expect(r.status, `${id} available at ${at}`).toBe('available');
  expect(r.target, `${id} is the E target at ${JSON.stringify(r.w)}`).toBe(id);
  await page.evaluate((id) => {
    const k = window.kq as Any;
    k.chronik.examine(id);
    k.step(4);
    k.ctx.ui.modals.closeAll();
    k.step(2);
  }, id);
  expect((await inv(page)).clues).toContain(id);
}

/** Hold E at an echo: it must be the E target there; plays it to the end. */
export async function listenAt(page: Page, id: string, at: [number, number] | null, screenshot?: string): Promise<void> {
  if (screenshot) await page.waitForFunction(() => (window.kq as Any).skills?.card() === null, null, { timeout: 60_000 }).catch(() => undefined);
  const r = await page.evaluate(
    ({ id, at }) => {
      const k = window.kq as Any;
      const h = (window as Any).k3h;
      if (at) h.walk([[at[0], at[1], 0.8]], { chunk: 12 });
      k.step(3);
      return { status: k.chronik.status(id), started: k.chronik.listen(id) };
    },
    { id, at },
  );
  expect(r.status, `${id} available`).toBe('available');
  expect(r.started).toBe(true);
  if (screenshot) {
    await page.evaluate(() => (window.kq as Any).chronik.advanceEcho(5));
    await shot(page, screenshot);
  }
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.chronik.advanceEcho(120);
    k.step(3);
    k.ctx.ui.modals.closeAll();
    k.step(2);
  });
  expect((await inv(page)).clues).toContain(id);
}

/** Talk to an NPC (E): greet, the given topics, bye. Returns the ids of the lines heard. */
export async function talk(page: Page, npc: string, topics: string[]): Promise<string[]> {
  const near = await page.evaluate((npc) => (window as Any).k3h.faceNpc(npc), npc);
  expect(near, `${npc} in reach`).toBe(npc);
  return page.evaluate(
    ({ topics }) => {
      const k = window.kq as Any;
      const heard: string[] = [];
      const drain = () => {
        for (let i = 0; i < 60; i++) {
          const l = k.npc.state().line;
          if (l && heard[heard.length - 1] !== l.id) heard.push(l.id);
          if (!k.npc.state().busy) break;
          k.npc.finish();
          k.npc.advance();
        }
      };
      k.press('KeyE', 1);
      drain();
      for (const t of topics) {
        if (!k.npc.state().topics.includes(t)) continue;
        k.npc.ask(t);
        drain();
      }
      if (k.npc.state().topics.includes('bye')) {
        k.npc.ask('bye');
        drain();
      }
      k.npc.close();
      k.step(4);
      return heard;
    },
    { topics },
  );
}

/** The chapter's main playthrough (moved here from chapter-k3.spec.ts so the campaign can chain it). */
export async function playK3(page: Page, o: PlayOptions = {}): Promise<void> {
  SHOTS = o.shots ?? true;
  await install(page);
  await page.evaluate(() => {
    const k = window.kq as Any;
    const w = window as Any;
    const installed = Array.isArray(w.k3events);
    w.k3events = [] as [string, unknown][];
    if (installed) return;
    const keep = new Set(['clue:found', 'clue:grant', 'story:beat', 'story:choice', 'player:caught', 'menagerie:seen', 'menagerie:knockdown', 'fire:room', 'hunt:alert', 'npc:talk', 'room:enter', 'chronik:batch', 'hub:enter', 'dialogue:say']);
    k.ctx.events.onAny((n: string, p: unknown) => keep.has(n) && w.k3events.push([n, structuredClone(p)]));
  });
  await o.at?.('k3:start');
  const said = () => page.evaluate(() => (window.kq as Any).story.state().said as string[]);

  // K3_FROM=fackel (development): skip part A with its clues granted, start at the Kommissär
  let s = await story(page);
  if (process.env.K3_FROM !== 'fackel') {
    // ---- 3.0 Feldstation -------------------------------------------------------------------------
    s = await story(page);
    expect(s.chapter).toBe('k3');
    expect(s.beat).toBe('k3_0');
    await page.evaluate(() => (window as Any).k3h.settle(60));
    expect((await inv(page)).clues).toContain('clue.k3.marlene');
    expect(await page.evaluate(() => window.kq!.state().skills['kartograf'])).toBe(3);
    await page.waitForFunction(() => (window.kq as Any).skills.card() === null, null, { timeout: 120_000 });
    await shot(page, '01-station');

    // ---- 3.1 Q at the Ehrenhof → 28 July 1793 ----------------------------------------------------
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.teleport(1208, -1114, 90, 2);
      k.step(4);
      k.press('KeyQ', 1);
      k.fx.shiftAt(3.6);
      k.fx.freeze(false);
      k.step(8);
      (window as Any).k3h.settle(20);
    });
    s = await story(page);
    expect(s.era).toBe('1793-07');
    expect(s.beat).toBe('k3_1');
    await page.evaluate(() => (window as Any).k3h.look(1225, -1118, 6));
    await shot(page, '02-ehrenhof');

    // the straw echo, Horstmann's dates, the man with the armchair
    await listenAt(page, 'clue.k3.stroh', [1212, -1116]);
    await page.evaluate(() => (window as Any).k3h.settle(120));
    expect((await inv(page)).clues).toContain('clue.k3.horstmann');
    await examineAt(page, 'clue.k3.lehnstuhl', [1205, -1110]);

    // ---- 3.2 Küchenhof: through the north wing's passage; plunder echo; Hanne ----------------------
    const toKh = await page.evaluate(() => (window as Any).k3h.walk([[1221, -1132], [1221.2, -1140.8], [1218.2, -1159.1], [1214, -1176]], { chunk: 12 }));
    expect(toKh.stuck, JSON.stringify(toKh)).toBe(false);
    await listenAt(page, 'clue.k3.kuechenhof', [1212, -1178]);
    await talk(page, 'hanne', ['pluenderung', 'peter', 'matthes']);
    expect((await inv(page)).clues).toContain('clue.k3.hanne');
    await page.evaluate(() => (window as Any).k3h.look(1215, -1185, 2));
    await shot(page, '03-kuechenhof-hanne');

    // ---- 3.3 Registratur: Soll counts what is missing ---------------------------------------------
    const toReg = await page.evaluate(() => {
      const h = (window as Any).k3h;
      const a = h.walk([[1218.2, -1160.5], [1218.2, -1157.5]], { chunk: 4 });
      if (a.stuck) return a;
      return h.go('B03.1.eg-registratur');
    });
    expect(toReg.error ?? null, JSON.stringify(toReg)).toBeNull();
    expect(toReg.room).toBe('B03.1.eg-registratur');
    await talk(page, 'soll', ['pluenderung', 'siegel', 'buch', 'pluenderer']);
    expect((await inv(page)).clues).toContain('clue.k3.soll');
    expect(await flags(page)).toMatchObject({ 'talked.k3.soll': true });
    await shot(page, '04-registratur-soll');

    // ---- 3.4 Sammlungsflügel: Waffensammlung (EG), Naturalienkabinett (OG) -------------------------
    const toWaffen = await page.evaluate(() => (window as Any).k3h.go('B04.1.eg-waffensammlung'));
    expect(toWaffen.error ?? null, JSON.stringify(toWaffen)).toBeNull();
    expect(toWaffen.room).toBe('B04.1.eg-waffensammlung');
    await examineAt(page, 'clue.k3.waffen', [1185.3, -1197.1]);
    await page.evaluate(() => (window as Any).k3h.settle(20));
    // up the Treppenhaus Nord (the stair hall is skipped), along the OG chain into the cabinet
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.interiors.enter('B04.2.og-bibliothek', { x: 1185.3, z: -1204.4, yaw: 0 });
      k.step(3);
    });
    const toNat = await page.evaluate(() => (window as Any).k3h.go('B04.2.og-naturalienkabinett'));
    expect(toNat.error ?? null, JSON.stringify(toNat)).toBeNull();
    expect(toNat.room).toBe('B04.2.og-naturalienkabinett');
    await examineAt(page, 'clue.k3.kisten', [1188.6, -1178.2]);
    await page.evaluate(() => (window as Any).k3h.settle(20));
    await examineAt(page, 'clue.k3.holandre', [1192.4, -1176.4]);
    await page.evaluate(() => (window as Any).k3h.settle(20));
    await page.evaluate(() => (window as Any).k3h.look(1188.6, -1178.2, -8));
    await shot(page, '05-naturalienkabinett');
    await listenAt(page, 'clue.k3.koenig', [1184.6, -1177.3]);
    await page.evaluate(() => (window as Any).k3h.settle(30));

    // ---- 3.5 Die Galerie: echo, tape, trapdoor, the grey book ------------------------------------
    // down the Treppenhaus Nord (skipped) into the Vorraum, then through the door into the gallery
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.interiors.enter('B06.1.vorraum-west', { x: 1191.5, z: -1212.6, yaw: 90 });
      k.step(3);
    });
    const toGal = await page.evaluate(() => (window as Any).k3h.go('B06.1.bildergalerie'));
    expect(toGal.error ?? null, JSON.stringify(toGal)).toBeNull();
    expect(toGal.room).toBe('B06.1.bildergalerie');
    await page.evaluate(() => (window as Any).k3h.settle(30));
    expect(await said()).toContain('laub.k3.galerie_leer');
    await page.evaluate(() => (window as Any).k3h.look(1262, -1226, 3));
    await shot(page, '06-galerie');
    await listenAt(page, 'clue.k3.galerie', [1215, -1216.5], '07-galerie-echo');
    // R: measure the gallery (Kartograf 3) → Mannlich's "cent pas"
    const ring = await page.evaluate(() => (window.kq as Any).ctx.data.footprints.buildings.find((b: Any) => b.id === 'KB-B06').ring as number[][]);
    await page.evaluate(
      ({ a, b }) => {
        const k = window.kq as Any;
        k.tools.measure.at(a[0], a[1], b[0], b[1], 350.5, 350.5);
        k.step(90);
        k.tools.measure.stop(); // R: put the tape away again
        k.ctx.ui.modals.closeAll();
        (window as Any).k3h.settle(30);
      },
      { a: [ring[0]![0]! + 0.5, ring[0]![1]! + 0.4], b: [ring[1]![0]! - 0.5, ring[1]![1]! + 0.4] },
    );
    expect((await inv(page)).clues).toContain('clue.k3.messen');
    // the loose board at the west end; under it the grey book
    await examineAt(page, 'clue.k3.falltuer', [1201.5, -1216.6]);
    await page.evaluate(() => (window as Any).k3h.settle(30));
    await examineAt(page, 'clue.k3.chronik', [1201.5, -1216.6]);
    await page.evaluate(() => (window as Any).k3h.settle(60));
    await page.evaluate(() => (window as Any).k3h.look(1205, -1216, -25));
    await shot(page, '08-falltuer');
    s = await story(page);
    expect(s.beat).toBe('k3_2');
    expect(await flags(page)).toMatchObject({ 'flag.k3_teil_b': true });

    // ---- 3.6 Tempelzimmer: east end of the gallery ------------------------------------------------
    const toTempel = await page.evaluate(() => (window as Any).k3h.walk([[1240, -1221.5], [1262.2, -1225.4]], { sprint: true, chunk: 12 }));
    expect(toTempel.stuck, JSON.stringify(toTempel)).toBe(false);
    await examineAt(page, 'clue.k3.papier', [1265.6, -1226]);
    await page.evaluate(() => (window as Any).k3h.settle(120));
    await page.evaluate(() => (window as Any).k3h.look(1270.3, -1226.8, 4));
    await shot(page, '09-tempelzimmer');

  } else {
    await page.evaluate(() => {
      const k = window.kq as Any;
      const ids = ['marlene', 'stroh', 'horstmann', 'lehnstuhl', 'kuechenhof', 'hanne', 'soll', 'waffen', 'kisten', 'holandre', 'koenig', 'galerie', 'messen', 'falltuer', 'chronik', 'papier'];
      k.story.goto('k3', 'k3_2');
      k.setEra('1793-07');
      for (const id of ids) k.ctx.events.emit('clue:grant', { id: `clue.k3.${id}` });
      k.ctx.state.mutable.flags['flag.k3_teil_b'] = true;
      k.teleport(1221, -1132, 180, 2);
      k.step(4);
      (window as Any).k3h.settle(20);
    });
  }

  // ---- 3.7 Die Fackel: back to the Ehrenhof, the Kommissär ---------------------------------------
  // the way back (gallery, Vorraum, Sammlungsflügel, Küchenhof) is known: skip it
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.teleport(1221, -1132, 180, 2);
    k.step(4);
    (window as Any).k3h.settle(20);
  });
  await listenAt(page, 'clue.k3.fackel', [1224, -1119], '10-fackel');
  await page.evaluate(() => (window as Any).k3h.settle(20));
  s = await story(page);
  expect(s.beat).toBe('k3_3');
  const fire0 = await page.evaluate(() => (window.kq as Any).fx.state().fire);
  expect(fire0.active).toBe(true);
  expect(await flags(page)).toMatchObject({ 'chronik.noLoss': true });

  // ---- 3.8 Hinauf: into the burning vestibule, up the Prunktreppe ------------------------------------
  const toVest = await page.evaluate(() => (window as Any).k3h.walk([[1250, -1125], [1254.8, -1125, 0.5], [1258.5, -1126.5]], { sprint: true, chunk: 4 }));
  expect(toVest.room, JSON.stringify(toVest)).toBe('B01.1.eg-vestibuel');
  await page.evaluate(() => (window as Any).k3h.look(1261.5, -1140, 12));
  await shot(page, '11-vestibuel-brennt');
  // up the imperial stair: the middle flight, the half landing, the east flight to the Festsaal door
  const up = await page.evaluate(() =>
    (window as Any).k3h.walk([[1261.8, -1129.5], [1261.6, -1132], [1261.4, -1142], [1266.6, -1142], [1266.6, -1132.2], [1265.6, -1130.2], [1265.8, -1127.5]], { sprint: true, chunk: 4 }),
  );
  console.log(`[k3] up: ${JSON.stringify(up)}`);
  expect(up.stuck, JSON.stringify(up)).toBe(false);
  expect(up.rooms).toContain('B01.1.eg-prunktreppe');
  expect(up.smokeMax).toBeLessThan(0.95);
  await page.evaluate(() => {
    (window.kq as Any).step(4);
    (window as Any).k3h.settle(4);
  });
  s = await story(page);
  expect(s.beat).toBe('k3_4');
  expect(await flags(page)).toMatchObject({ 'fire.hold': true });
  expect((await inv(page)).clues).toContain('clue.k3.feuer');
  expect((await inv(page)).clues).toContain('clue.k3.festsaal');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.step(90);
    const n = k.npc.list().find((f: Any) => f.npc === 'hanne');
    (window as Any).k3h.look(n.x, n.z, 2);
  });
  await shot(page, '12-festsaal-hanne');

  // ---- 3.9 Die Wahl (the fire stands still) -----------------------------------------------------
  // Hanne speaks, Laub counts to one, then the field-book card (game time, no flush)
  await page.evaluate(() => {
    const k = window.kq as Any;
    for (let i = 0; i < 80 && !k.story.choice(); i++) k.step(30);
  });
  if (!(await page.evaluate(() => (window.kq as Any).story.choice()))) {
    const dbg = await page.evaluate(() => {
      const k = window.kq as Any;
      const ev = ((window as Any).k3events as [string, Any][]).filter(([n]) => n !== 'dialogue:say' && n !== 'fire:room').slice(-25);
      return { ev, st: { ...k.story.state(), said: undefined, latched: undefined }, fire: k.fx.state().fire, meters: k.story.meters() };
    });
    console.log(`[k3] no choice: ${JSON.stringify(dbg).slice(0, 4000)}`);
  }
  expect(await page.evaluate(() => (window.kq as Any).story.choice())).toBe('k3.objekt');
  const clock0 = (await page.evaluate(() => (window.kq as Any).fx.state().fire)).clock;
  await shot(page, '13-wahl');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.step(120);
    k.story.choose(2); // the clock with the alabaster
    k.step(4);
  });
  // 2 s of choosing: the fire's timeline stood still (bible W5)
  expect((await page.evaluate(() => (window.kq as Any).fx.state().fire)).clock - clock0).toBeLessThan(0.2);
  expect(await flags(page)).toMatchObject({ 'flag.k3_objekt': 'uhr', 'choice.k3.objekt': 'uhr' });
  expect((await inv(page)).clues).toContain('clue.k3.retten');
  s = await story(page);
  expect(s.beat).toBe('k3_5');

  // ---- 3.10 Hinaus: down the Prunktreppe, through the burning vestibule, out into the garden -----
  const escape = await page.evaluate(() => {
    const k = window.kq as Any;
    const h = (window as Any).k3h;
    k.story.flush();
    k.step(10);
    let smokeMax = 0;
    const off = k.ctx.events.on('fire:progress', () => (smokeMax = Math.max(smokeMax, k.fx.state().fire.smoke)));
    // back down the way up: east flight, landing, middle flight, through the vestibule, out east
    const down = h.walk(
      [[1265.6, -1130.2], [1266.6, -1132.2], [1266.6, -1142], [1261.4, -1142], [1261.6, -1132], [1261.8, -1129.5], [1265, -1126], [1270.3, -1125.1], [1276, -1125]],
      { sprint: true, chunk: 4 },
    );
    const rooms = down.rooms;
    const out = down;
    smokeMax = Math.max(smokeMax, down.smokeMax);
    off?.();
    k.step(10);
    return { rooms, out, smokeMax, smoke: k.fx.state().fire.smoke, clock: k.fx.state().fire.clock };
  });
  expect(escape.out.error ?? null, JSON.stringify(escape)).toBeNull();
  expect(escape.out.caught, JSON.stringify(escape)).toBe(false);
  expect(escape.rooms).toContain('B01.1.eg-prunktreppe');
  expect(escape.smokeMax).toBeLessThan(0.95);
  s = await story(page);
  expect(s.beat, JSON.stringify(escape)).toBe('k3_6');
  console.log(`[k3] escape: ${JSON.stringify({ rooms: escape.rooms, smokeMax: escape.smokeMax.toFixed(2), clock: escape.clock.toFixed(0), trace: escape.out.trace })}`);

  // ---- 3.11 Der Garten: the pack hunts by ear ----------------------------------------------------
  await page.evaluate(() => {
    const k = window.kq as Any;
    (window as Any).k3h.walk([[1288, -1130]], { chunk: 12 });
    k.step(150); // the pack is configured 2 s after the reaction
    (window as Any).k3h.look(1262, -1126, 14);
  });
  await shot(page, '14-garten-brand');
  const hunt0 = await page.evaluate(() => (window.kq as Any).hunt.state());
  expect(hunt0?.active).toBe(true);
  expect(hunt0.agents.filter((a: Any) => a.kind === 'hound')).toHaveLength(5);
  // sneak (crouched) along the east side of the garden to the Gärtnerei gate
  const sneak = await page.evaluate(() => {
    const k = window.kq as Any;
    const h = (window as Any).k3h;
    let maxState = 'calm';
    let maxLevel = 0;
    const order = ['calm', 'suspicious', 'searching', 'chasing'];
    const off = k.ctx.events.on('hunt:alert', (e: Any) => {
      maxLevel = Math.max(maxLevel, e.level);
      if (order.indexOf(e.state) > order.indexOf(maxState)) maxState = e.state;
    });
    const w = h.walk([[1290, -1180], [1285, -1238], [1267, -1252], [1266.5, -1285], [1270.5, -1291.5]], { crouch: true, chunk: 24, max: 3000, wary: 18 });
    off?.();
    return { w, maxState, maxLevel, beat: k.story.state().beat };
  });
  console.log(`[k3] garden: ${JSON.stringify(sneak)}`);
  expect(sneak.w.caught, JSON.stringify(sneak)).toBe(false);
  expect(sneak.beat).toBe('k3_7');
  await page.evaluate(() => (window as Any).k3h.settle(30));
  expect(await page.evaluate(() => (window.kq as Any).hunt.state())).toBeNull();

  // at the gate: Hanne made it out; the gardener's notes; the outbuildings
  expect(await talk(page, 'hanne', [])).toContain('hanne.k3.09');
  await page.evaluate(() => {
    // from inside the gate: Hanne, and behind her the burning palace
    const k = window.kq as Any;
    const n = k.npc.list().find((f: Any) => f.npc === 'hanne');
    k.teleport(n.x + 1, n.z - 3.6, 0, 0);
    k.step(2);
    (window as Any).k3h.look(n.x - 0.4, n.z, -3);
  });
  await shot(page, '15-pforte-hanne');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.teleport(1270.3, -1290.6, 0, 0);
    k.step(2);
  });
  await examineAt(page, 'clue.k3.gaertner', [1266.5, -1291.5]);
  await page.evaluate(() => (window as Any).k3h.settle(30));
  await examineAt(page, 'clue.k3.wirtschaft', [1274, -1302]);
  await page.evaluate(() => (window as Any).k3h.settle(30));

  // ---- 3.12 north to the Zwinger, past the jaguar (lantern lit) ---------------------------------
  const north = await page.evaluate(() => {
    const k = window.kq as Any;
    const h = (window as Any).k3h;
    k.step(420); // the objective comes after a breath
    k.ctx.events.emit('lantern:request', { lit: true });
    const w1 = h.walk([[1268, -1340], [1263, -1395]], { crouch: true, chunk: 24, max: 3000, wary: 16 });
    return { w1, beat: k.story.state().beat, hounds: k.hunt.state()?.agents.length ?? 0 };
  });
  expect(north.w1.caught, JSON.stringify(north.w1)).toBe(false);
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.step(30);
    // screenshot staging: the jaguar at the edge of the lantern light, on the path ahead
    const p = k.ctx.player.position;
    const j = k.menagerie.state().find((a: Any) => a.id === 'k3.jaguar');
    if (j) {
      k.menagerie.place('k3.jaguar', p.x + 1.5, p.z - 8, 180);
      k.step(2);
    }
    (window as Any).k3h.look(p.x + 1.5, p.z - 8, -4);
  });
  await shot(page, '16-jaguar');
  const north2 = await page.evaluate(() => {
    const h = (window as Any).k3h;
    return h.walk([[1262, -1450], [1262, -1520], [1258, -1563]], { crouch: true, chunk: 24, max: 3000, wary: 16 });
  });
  console.log(`[k3] north: ${JSON.stringify(north2)}`);
  expect(north2.caught, JSON.stringify(north2)).toBe(false);
  s = await story(page);
  expect(s.beat).toBe('k3_8');
  const seenJaguar = await page.evaluate(() => ((window as Any).k3events as [string, Any][]).some(([n, p]) => n === 'menagerie:seen' && p.animal === 'jaguar'));
  expect(seenJaguar).toBe(true);
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.step(60);
    const n = k.npc.list().find((f: Any) => f.npc === 'jost');
    if (n) (window as Any).k3h.look(n.x, n.z, 2);
  });
  await shot(page, '17-zwinger-jost');
  await page.evaluate(() => (window as Any).k3h.settle(60));
  expect((await inv(page)).clues).toContain('clue.k3.jost');
  expect(await said()).toEqual(expect.arrayContaining(['jost.k3.01', 'jost.k3.04', 'beat.k3.hunde']));

  // ---- back to today (hold Q), home to the field station ----------------------------------------
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.press('KeyQ', 90);
    k.fx.shiftAt(3.6);
    k.fx.freeze(false);
    k.step(10);
    (window as Any).k3h.settle(30);
  });
  s = await story(page);
  expect(s.era).toBe('today');
  expect(s.beat).toBe('k3_9');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.teleport(760.6, -905, 0, 0);
    k.step(4);
    (window as Any).k3h.walk([[760.6, -910.6, 0.5]], { chunk: 4 });
    k.step(20);
    k.story.flush();
    k.step(120);
  });
  s = await story(page);
  expect(s.beat).toBe('k3_10');
  expect((await inv(page)).items).toContain('item.k3.uhr');
  expect(await said()).toContain('laub.k3.heute.uhr');
  await page.evaluate(() => (window.kq as Any).story.hub(false));
  await page.evaluate(() => (window as Any).k3h.look(760, -915, -10));
  await shot(page, '18-tisch-uhr');

  // ---- the case page: every correct noun was found on the way; confirm in batches of three -------
  const coverage = await page.evaluate(() => {
    const k = window.kq as Any;
    const known = new Set(k.state().inventory.nouns as string[]);
    const cs = k.ctx.content.cases.get('case.k3');
    const missing: string[] = [];
    for (const e of cs.entries) for (const b of e.blanks) if (b.correct && !known.has(b.correct)) missing.push(`${e.id}:${b.correct}`);
    const readings = cs.entries.filter((e: Any) => e.kind === 'reading').flatMap((e: Any) => e.blanks.flatMap((b: Any) => b.accepts.filter((n: string) => known.has(n))));
    return { missing, readings };
  });
  expect(coverage.missing).toEqual([]);
  expect(coverage.readings.length).toBeGreaterThan(0);
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.chronik.open('case.k3');
    for (let i = 0; i < 4; i++) {
      k.chronik.solve('case.k3', 3);
      k.chronik.check('case.k3');
    }
    k.chronik.fill('case.k3', 'entry.k3.10', 'wie', 'n.r_alle');
    k.chronik.check('case.k3');
    k.step(4);
  });
  await shot(page, '19-fallseite');
  const progress = await page.evaluate(() => (window.kq as Any).state().chronik['case.k3']);
  expect(progress.confirmed.length).toBeGreaterThanOrEqual(9);
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.chronik.close();
    k.ctx.ui.modals.closeAll();
    k.step(10);
    k.story.flush();
    k.step(30);
  });
  s = await story(page);
  expect(s.beat).toBe('k3_11');
  await page.evaluate(() => (window.kq as Any).story.flush());
  await shot(page, '20-kalter-rauch');
  expect(await said()).toContain('laub.k3.ende');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.step(14 * 60 + 30);
    k.story.flush();
    k.step(10);
  });
  s = await story(page);
  expect(s.chapter).toBe('k4');
  const skills = await page.evaluate(() => window.kq!.state().skills);
  expect(skills).toMatchObject({ baumeister: 2, roentgen: 1 });
}
