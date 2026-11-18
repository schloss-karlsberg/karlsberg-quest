import { type Page, expect } from '@playwright/test';
import { type PlayOptions, SCREENS } from './common';

/**
 * Chapter 3 "Die Nacht" as a chain of quests, played through headless (`?manual`, driven through
 * window.kq), with the real content (story 03-kapitel-3 + quests 03-kapitel-3 + kapitel-3 pack):
 *
 *   Feldstation → Q at the Ehrenhof → q.k3.nachmittag (straw echo, the armchair, five Raffschatten
 *   with Hanne's basket, turn-in with her stance) · side q.k3.lehnstuhl (Peter's chair, escort) →
 *   q.k3.buch from Soll (shades at the Durchfahrt, Waffensammlung, Naturalienkabinett, the gallery
 *   echo + tape, the trapdoor, the grey book, the one page) · side q.k3.kabinett (labels) → dusk:
 *   q.k3.strohmann (the boss in the Ehrenhof, then the torch) → q.k3.festsaal (Glutlinge on the
 *   Prunktreppe, the quiet Festsaal, W5 choice → charm, the escape, the gate, Hanne) · side
 *   q.k3.jaguar (calmed with light) → q.k3.hunde (Streuner, the Zwinger, Jost: Messstab IV) →
 *   today → the object on the table → cliffhanger → chapter 4.
 *
 * Enemies are struck down with kq.combat.kill (the real enemy:killed path), pickups taken with
 * kq.progression.take, turn-ins and stances go through the conversation. The player is in god mode.
 * Used by e2e/chapter-k3.spec.ts and e2e/campaign.spec.ts. Screenshots: test-results/screens/cnb-k3-*.png.
 */
// biome-ignore lint/suspicious/noExplicitAny: test glue
export type Any = any;
let SHOTS = true;



/** Put away a reward card (a click, as a player would) and let a level card run out, so the scene shows. */
export async function clearCards(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const busy = await page.evaluate(() => {
      const k = window.kq as Any;
      const r = document.querySelector('[data-testid="quest-reward"]:not(.kqq-out)');
      if (r) r.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      if (k.progression?.card()) k.step(60);
      return !!r || !!k.progression?.card();
    });
    if (!busy) break;
    await page.waitForTimeout(400);
  }
}

export async function shot(page: Page, name: string): Promise<void> {
  // let a skill card (real-time HUD card) leave the picture
  await page.waitForFunction(() => (window.kq as Any).skills?.card() === null, null, { timeout: 60_000 }).catch(() => undefined);
  if (!SHOTS) return;
  await clearCards(page);
  await page.evaluate(() => (window.kq as Any).story?.finishTyping());
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SCREENS}/cnb-k3-${name}.png`, timeout: 150_000 });
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
          // a field-book page held back by a fight or a staged moment comes up later: put it away
          if (k.ctx.ui.modals.count > 0 && !k.story.choice()) k.ctx.ui.modals.closeAll();
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

// ---- quests ------------------------------------------------------------------------------------

export const quest = (page: Page, id: string) => page.evaluate((id) => (window.kq as Any).quests.state().quests[id]?.state ?? 'hidden', id);
export const items = (page: Page) => page.evaluate(() => (window.kq as Any).progression.state().inventory as Record<string, number>);

/**
 * A quest exchange with an NPC (E, the quest topic, then the answer button): 'qa' accepts (the
 * offer card); otherwise the turn-in card is handed over ('qt'). Puts the reward card away.
 */
export async function questTalk(page: Page, npc: string, id: string, answer?: string): Promise<string[]> {
  const near = await page.evaluate((npc) => (window as Any).k3h.faceNpc(npc), npc);
  expect(near, `${npc} in reach`).toBe(npc);
  const r = await page.evaluate(
    ({ id, answer }) => {
      const k = window.kq as Any;
      const heard: string[] = [];
      const drain = () => {
        for (let i = 0; i < 80; i++) {
          const l = k.npc.state().line;
          if (l && heard[heard.length - 1] !== l.id) heard.push(l.id);
          if (!k.npc.state().busy) break;
          k.npc.finish();
          k.npc.advance();
        }
      };
      // a page still queued behind a fight (src/ui/cards.ts) would open over the talk: let it come, put it away
      for (let i = 0; i < 12 && (k.ctx.ui.cards.pending > 0 || k.ctx.ui.modals.count > 0) && !k.story.choice(); i++) {
        k.ctx.ui.modals.closeAll();
        k.step(10);
      }
      k.press('KeyE', 1);
      drain();
      const topics0 = k.npc.state().topics as string[];
      const asked = k.npc.ask(`q:${id}`);
      drain();
      const topics1 = k.npc.state().topics as string[];
      let chose = true;
      if (answer === 'qa') chose = k.npc.choose(`qa:${id}`);
      else if (topics1.includes(`qt:${id}`)) chose = k.npc.choose(`qt:${id}`);
      drain();
      k.step(2);
      for (let i = 0; i < 6 && k.quests.reward(); i++) {
        k.press('KeyE', 1);
        k.step(2);
      }
      if (k.npc.state().open) {
        if (k.npc.state().topics.includes('bye')) {
          k.npc.ask('bye');
          drain();
        }
        k.npc.close();
      }
      k.step(4);
      return { heard, asked, chose, topics0, topics1 };
    },
    { id, answer },
  );
  // the reward card may come after the conversation; in play E would talk again, so click it away
  await page.evaluate(() => (window.kq as Any).step(30));
  await clearCards(page);
  expect(r.asked, `${npc}: topic q:${id} in ${JSON.stringify(r.topics0)}`).toBe(true);
  expect(r.chose, `${npc}: ${answer} in ${JSON.stringify(r.topics1)}`).toBe(true);
  return r.heard;
}

/** A quest's enemy group is there; strike it down (the real kill path: enemy:killed → the quest). */
export async function killGroup(page: Page, group: string, min = 1): Promise<number> {
  const n = await page.evaluate(
    ({ group }) => {
      const k = window.kq as Any;
      for (let i = 0; i < 30 && !Object.keys(k.combat.groups()).includes(group); i++) k.step(10);
      const seen = k.combat.enemies().filter((e: Any) => e.group?.startsWith(group)).map((e: Any) => `${e.kind}:${e.state}:${Math.round(e.hp ?? -1)}`);
      const n = k.combat.kill(group);
      k.step(60);
      const p = k.ctx.player.position;
      return { n, seen, at: [Math.round(p.x), Math.round(p.z)], era: k.state().era, groups: k.combat.groups(), all: k.combat.enemies().map((e: Any) => `${e.group}:${e.kind}:${e.state}`) };
    },
    { group },
  );
  // a group already struck down on the way (a sweep, a hazard, the fight next door) counts as well
  const done = Math.max(n.n, (n.groups as Any)[group]?.killed ?? 0);
  expect(done, `${group} killed: ${JSON.stringify(n)}`).toBeGreaterThanOrEqual(min);
  return n.n;
}

/** Pick up every placed pickup whose id starts with `prefix` (as if walked over). */
export async function takeAll(page: Page, prefix: string): Promise<number> {
  return page.evaluate((prefix) => {
    const k = window.kq as Any;
    k.step(6);
    let n = 0;
    for (const p of k.progression.pickups() as { id: string }[]) if (p.id.startsWith(prefix)) n += k.progression.take(p.id) > 0 ? 1 : 0;
    k.step(6);
    return n;
  }, prefix);
}

/** A voice turn-in (Laub in the compass): a short moment, no stance card any more (round 3). */
export async function voiceStance(page: Page, _label?: string): Promise<void> {
  await page.evaluate(() => {
    const k = window.kq as Any;
    for (let i = 0; i < 12; i++) k.step(30);
  });
  expect(await page.locator('[data-testid="quest-stance"]').count()).toBe(0);
}

/** The chapter's main playthrough, now a chain of quests (shared with e2e/campaign.spec.ts). */
export async function playK3(page: Page, o: PlayOptions = {}): Promise<void> {
  SHOTS = o.shots ?? true;
  await install(page);
  await page.evaluate(() => {
    const k = window.kq as Any;
    const w = window as Any;
    const installed = Array.isArray(w.k3events);
    w.k3events = [] as [string, unknown][];
    // the walker is no fighter: enemies may swing, the player does not fall
    k.combat.god(true);
    if (installed) return;
    const keep = new Set(['clue:found', 'clue:grant', 'story:beat', 'story:choice', 'player:caught', 'menagerie:seen', 'menagerie:calmed', 'fire:room', 'hunt:alert', 'npc:talk', 'room:enter', 'hub:enter', 'quest:accepted', 'quest:completed', 'quest:failed', 'enemy:spawn', 'enemy:killed', 'item:grant', 'skill:grant', 'hunt:release']);
    k.ctx.events.onAny((n: string, p: unknown) => keep.has(n) && w.k3events.push([n, structuredClone(p)]));
  });
  await o.at?.('k3:start');
  const said = () => page.evaluate(() => (window.kq as Any).story.state().said as string[]);
  const events = (name: string) => page.evaluate((name) => ((window as Any).k3events as [string, Any][]).filter(([n]) => n === name).map(([, p]) => p), name);

  // K3_FROM=strohmann (development): skip to dusk with the afternoon's quests done
  let s = await story(page);
  if (process.env.K3_FROM !== 'strohmann') {
    // ---- 3.0 Feldstation: Laub sends us to July 1793 (q.k3.nachmittag) --------------------------------
    s = await story(page);
    expect(s.chapter).toBe('k3');
    expect(s.beat).toBe('k3_0');
    await page.evaluate(() => (window as Any).k3h.settle(160));
    expect((await inv(page)).clues).toContain('clue.k3.marlene');
    expect(await quest(page, 'q.k3.nachmittag')).toBe('active');
    await page.waitForFunction(() => (window.kq as Any).skills.card() === null, null, { timeout: 120_000 });
    await shot(page, '01-station');

    // ---- 3.1 Q at the Ehrenhof → 28 July 1793 -------------------------------------------------------
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
    await page.evaluate(() => (window as Any).k3h.settle(20));
    const qs = await page.evaluate(() => (window.kq as Any).quests.state().quests);
    expect(qs['q.k3.nachmittag'].counts).toMatchObject({ ehrenhof: 1, stroh: 1, stuhl: 1 });

    // side: Peter carries one of the 104 gilded chairs for his mother → three Raffschatten → the gate
    expect(await quest(page, 'q.k3.lehnstuhl')).toBe('offered');
    await questTalk(page, 'peter', 'q.k3.lehnstuhl', 'qa');
    expect(await quest(page, 'q.k3.lehnstuhl')).toBe('active');
    await killGroup(page, 'q.k3.lehnstuhl.schatten', 3);
    const escort = await page.evaluate(() => {
      const k = window.kq as Any;
      const h = (window as Any).k3h;
      h.faceNpc('peter');
      k.step(30);
      const w = h.walk([[1197, -1110], [1192, -1113, 1.2]], { chunk: 6 });
      for (let i = 0; i < 20 && k.quests.state().quests['q.k3.lehnstuhl'].state !== 'ready'; i++) k.step(30);
      const n = k.npc.list().find((f: Any) => f.npc === 'peter');
      return { w, state: k.quests.state().quests['q.k3.lehnstuhl'].state, peter: n && Math.hypot(n.x - k.ctx.player.position.x, n.z - k.ctx.player.position.z) };
    });
    expect(escort.state, JSON.stringify(escort)).toBe('ready');
    await questTalk(page, 'peter', 'q.k3.lehnstuhl');
    expect(await quest(page, 'q.k3.lehnstuhl')).toBe('done');

    // ---- 3.2 Küchenhof: five Raffschatten have Hanne's basket ------------------------------------------
    const toKh = await page.evaluate(() => (window as Any).k3h.walk([[1221, -1132], [1221.2, -1140.8], [1218.2, -1159.1], [1214, -1170]], { chunk: 12 }));
    expect(toKh.stuck, JSON.stringify(toKh)).toBe(false);
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.step(30);
      const e = k.combat.enemies().filter((x: Any) => x.group === 'q.k3.nachmittag.schatten');
      if (e[0]) (window as Any).k3h.look(e[0].x, e[0].z, 4);
    });
    await shot(page, '03-raffschatten');
    await killGroup(page, 'q.k3.nachmittag.schatten', 4);
    expect(await takeAll(page, 'q.k3.nachmittag.korb')).toBe(1);
    expect(await quest(page, 'q.k3.nachmittag')).toBe('ready');
    // turn in at Hanne: the basket, the history, then her question (an opinion, never graded)
    const heardHanne = await questTalk(page, 'hanne', 'q.k3.nachmittag', 'qs:retteten');
    expect(heardHanne.length).toBeGreaterThan(2);
    expect(await flags(page)).toMatchObject({ 'quest.q.k3.nachmittag': 'done' });
    expect((await flags(page))['flag.k3_pluenderer']).toBeUndefined();
    expect(await page.evaluate(() => (window.kq as Any).state().codex.facts)).toContain('cx.23');
    await page.evaluate(() => (window as Any).k3h.settle(60));
    expect(await quest(page, 'q.k3.buch')).toBe('offered');

    // ---- 3.3 Registratur: Soll gives "Das graue Buch" ---------------------------------------------------
    const toReg = await page.evaluate(() => {
      const h = (window as Any).k3h;
      const a = h.walk([[1218.2, -1160.5], [1218.2, -1157.5]], { chunk: 4 });
      if (a.stuck) return a;
      return h.go('B03.1.eg-registratur');
    });
    expect(toReg.error ?? null, JSON.stringify(toReg)).toBeNull();
    expect(toReg.room).toBe('B03.1.eg-registratur');
    await questTalk(page, 'soll', 'q.k3.buch', 'qa');
    expect(await quest(page, 'q.k3.buch')).toBe('active');
    await shot(page, '04-registratur-soll');
    // the crate-carrying shades at the Durchfahrt
    await killGroup(page, 'q.k3.buch.schatten', 3);

    // ---- 3.4 Sammlungsflügel: Waffensammlung (EG), Naturalienkabinett (OG) -------------------------
    const toWaffen = await page.evaluate(() => (window as Any).k3h.go('B04.1.eg-waffensammlung'));
    expect(toWaffen.error ?? null, JSON.stringify(toWaffen)).toBeNull();
    expect(toWaffen.room).toBe('B04.1.eg-waffensammlung');
    await examineAt(page, 'clue.k3.waffen', [1185.3, -1197.1]);
    await page.evaluate(() => (window as Any).k3h.settle(20));
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
    await page.evaluate(() => (window as Any).k3h.look(1188.6, -1178.2, -8));
    await shot(page, '05-naturalienkabinett');
    await listenAt(page, 'clue.k3.koenig', [1184.6, -1177.3]);
    await page.evaluate(() => (window as Any).k3h.settle(30));

    // ---- 3.5 Die Galerie: echo, tape, trapdoor, the grey book, the one page -----------------------------
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
    await listenAt(page, 'clue.k3.galerie', [1215, -1216.5], '06-galerie-echo');
    const ring = await page.evaluate(() => (window.kq as Any).ctx.data.footprints.buildings.find((b: Any) => b.id === 'KB-B06').ring as number[][]);
    await page.evaluate(
      ({ a, b }) => {
        const k = window.kq as Any;
        k.tools.measure.at(a[0], a[1], b[0], b[1], 350.5, 350.5);
        k.step(90);
        k.tools.measure.stop();
        k.ctx.ui.modals.closeAll();
        (window as Any).k3h.settle(30);
      },
      { a: [ring[0]![0]! + 0.5, ring[0]![1]! + 0.4], b: [ring[1]![0]! - 0.5, ring[1]![1]! + 0.4] },
    );
    expect((await inv(page)).clues).toContain('clue.k3.messen');
    // the Tempelzimmer at the east end first (a bonus: a way out for later)
    const toTempel = await page.evaluate(() => (window as Any).k3h.walk([[1240, -1221.5], [1262.2, -1225.4]], { sprint: true, chunk: 12 }));
    expect(toTempel.stuck, JSON.stringify(toTempel)).toBe(false);
    await examineAt(page, 'clue.k3.papier', [1265.6, -1226]);
    await page.evaluate(() => (window as Any).k3h.settle(60));
    await page.evaluate(() => (window as Any).k3h.walk([[1230, -1218], [1204, -1217]], { sprint: true, chunk: 12 }));
    await examineAt(page, 'clue.k3.falltuer', [1201.5, -1216.6]);
    await page.evaluate(() => (window as Any).k3h.settle(30));
    await examineAt(page, 'clue.k3.chronik', [1201.5, -1216.6]);
    await page.evaluate(() => (window as Any).k3h.settle(30));
    await page.evaluate(() => (window as Any).k3h.look(1205, -1216, -25));
    await shot(page, '07-falltuer-seite');
    expect(await takeAll(page, 'q.k3.buch.seite')).toBe(1);
    await page.evaluate(() => (window as Any).k3h.settle(60));
    expect(await quest(page, 'q.k3.buch')).toBe('done');
    expect((await items(page))['item.k3.seite']).toBe(1);
    // at least 2 (a campaign started from a fresh save may already have every skill)
    expect((await page.evaluate(() => window.kq!.state().skills)).baumeister ?? 0).toBeGreaterThanOrEqual(2);
    expect(await flags(page)).toMatchObject({ 'flag.k3_teil_b': true });
    const xpBuch = (await events('quest:completed')).find((p: Any) => p.id === 'q.k3.buch');
    expect(xpBuch).toMatchObject({ xp: 400, main: true });

    // side: Soll's labels (the shades in the Küchenhof drop them)
    expect(await quest(page, 'q.k3.kabinett')).toBe('offered');
    await page.evaluate(() => (window.kq as Any).quests.accept('q.k3.kabinett'));
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.teleport(1218, -1166, 180, 2);
      k.step(10);
    });
    await killGroup(page, 'q.k3.kabinett.schatten', 4);
    expect(await takeAll(page, 'q.k3.kabinett.etiketten')).toBe(4);
    expect(await quest(page, 'q.k3.kabinett')).toBe('ready');
    await page.evaluate(() => (window.kq as Any).quests.turnin('q.k3.kabinett'));
    expect(await quest(page, 'q.k3.kabinett')).toBe('done');
  } else {
    await page.evaluate(() => {
      const k = window.kq as Any;
      k.story.goto('k3', 'k3_1');
      k.setEra('1793-07');
      k.step(4);
      for (const id of ['stroh', 'lehnstuhl', 'waffen', 'kisten', 'galerie', 'falltuer', 'chronik']) k.ctx.events.emit('clue:grant', { id: `clue.k3.${id}` });
      k.quests.complete('q.k3.nachmittag');
      k.quests.offer('q.k3.buch');
      k.quests.complete('q.k3.buch');
      k.step(30);
      k.story.flush();
      k.step(30);
      (window as Any).k3h.settle(30);
    });
    s = await story(page);
    expect(s.beat).toBe('k3_2');
  }

  // ---- 3.6 Der Strohmann: dusk, the straw carts rise -------------------------------------------------
  s = await story(page);
  expect(s.beat).toBe('k3_2');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.ctx.ui.modals.closeAll();
    k.teleport(1221, -1132, 0, 2);
    k.step(30);
    (window as Any).k3h.settle(30);
  });
  expect(await quest(page, 'q.k3.strohmann')).toBe('active');
  const boss = await page.evaluate(() => {
    const k = window.kq as Any;
    for (let i = 0; i < 30 && !k.combat.enemies().some((e: Any) => e.kind === 'strohmann'); i++) k.step(10);
    const e = k.combat.enemies().find((x: Any) => x.kind === 'strohmann');
    if (!e) return null;
    k.combat.freeze(true);
    k.teleport(1220, -1119, 0, 2);
    k.combat.place(e.id, 1215, -1112, true);
    k.step(4);
    (window as Any).k3h.look(1215, -1112, 14);
    k.combat.windup(e.id);
    k.step(6);
    return { kind: e.kind, max: e.max };
  });
  expect(boss?.kind).toBe('strohmann');
  await shot(page, 'strohmann');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.combat.freeze(false);
  });
  await killGroup(page, 'q.k3.strohmann.strohmann', 1);
  await page.evaluate(() => (window as Any).k3h.settle(60));
  expect((await events('enemy:killed')).some((p: Any) => p.kind === 'strohmann')).toBe(true);
  // only then the torch: the fire cannot be stopped
  await listenAt(page, 'clue.k3.fackel', [1224, -1119], '08-fackel');
  await page.evaluate(() => (window as Any).k3h.settle(20));
  expect(await quest(page, 'q.k3.strohmann')).toBe('done');
  s = await story(page);
  expect(s.beat).toBe('k3_3');
  expect((await page.evaluate(() => (window.kq as Any).fx.state().fire)).active).toBe(true);
  expect(await quest(page, 'q.k3.festsaal')).toBe('active');

  // ---- 3.7 Hinauf: the burning vestibule, Glutlinge on the Prunktreppe ----------------------------------
  const toVest = await page.evaluate(() => (window as Any).k3h.walk([[1250, -1125], [1254.8, -1125, 0.5], [1258.5, -1126.5]], { sprint: true, chunk: 4 }));
  expect(toVest.room, JSON.stringify(toVest)).toBe('B01.1.eg-vestibuel');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.step(20);
    const g = k.combat.enemies().filter((e: Any) => e.kind === 'glutling');
    k.combat.freeze(true);
    // at the foot of the stair, on the vestibule floor in front of the player
    g.forEach((e: Any, i: number) => k.combat.place(e.id, 1257.2 + i * 1.3, -1129 - (i % 2) * 0.8, true));
    k.step(2);
    (window as Any).k3h.look(1259, -1129.4, -10);
  });
  expect(await page.evaluate(() => (window.kq as Any).combat.enemies().filter((e: Any) => e.kind === 'glutling').length)).toBe(4);
  await shot(page, 'glutlinge-treppe');
  await page.evaluate(() => (window.kq as Any).combat.freeze(false));
  await killGroup(page, 'q.k3.festsaal.glut', 4);
  const up = await page.evaluate(() =>
    (window as Any).k3h.walk([[1261.8, -1129.5], [1261.6, -1132], [1261.4, -1142], [1266.6, -1142], [1266.6, -1132.2], [1265.6, -1130.2], [1265.8, -1127.5]], { sprint: true, chunk: 4 }),
  );
  expect(up.stuck, JSON.stringify(up)).toBe(false);
  expect(up.smokeMax).toBeLessThan(0.95);
  await page.evaluate(() => {
    (window.kq as Any).step(4);
    (window as Any).k3h.settle(4);
  });
  s = await story(page);
  expect(s.beat).toBe('k3_4');
  expect(await flags(page)).toMatchObject({ 'fire.hold': true });
  // the Festsaal is a memorial: no enemy here, the staff stays down
  expect(await page.evaluate(() => (window.kq as Any).combat.enemies().length)).toBe(0);
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.step(90);
    const n = k.npc.list().find((f: Any) => f.npc === 'hanne');
    (window as Any).k3h.look(n.x, n.z, 2);
  });
  await shot(page, 'festsaal-still');

  // ---- 3.8 Die Wahl (the fire stands still) → the charm: four things in the room, E on one -------------
  const fest = await page.evaluate(() => (window.kq as Any).interiors.festsaal());
  expect(fest.active).toBe(true);
  expect(fest.spots.map((s: Any) => s.key).sort()).toEqual(['dukat', 'nichts', 'tuergriff', 'uhr']);
  const clock0 = (await page.evaluate(() => (window.kq as Any).fx.state().fire)).clock;
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.step(120);
    // walk up to the clock on its console, look at it
    const u = k.interiors.festsaal().spots.find((s: Any) => s.key === 'uhr');
    const p = k.ctx.player.position;
    const d = Math.hypot(u.x - p.x, u.z - p.z) || 1;
    const x = u.x - ((u.x - p.x) / d) * 1.2;
    const z = u.z - ((u.z - p.z) / d) * 1.2;
    p.x = x;
    p.z = z;
    k.ctx.player.yaw = Math.atan2(-(u.x - x), -(u.z - z));
    k.ctx.player.pitch = -0.25;
    k.step(4);
  });
  await shot(page, '09-wahl');
  expect(await page.locator('.kq-prompt').textContent()).toContain('Uhr');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.press('KeyE', 1);
    k.step(4);
  });
  expect((await page.evaluate(() => (window.kq as Any).fx.state().fire)).clock - clock0).toBeLessThan(0.2);
  expect(await flags(page)).toMatchObject({ 'flag.k3_objekt': 'uhr', 'choice.k3.objekt': 'uhr' });
  expect((await items(page))['item.charm.uhr']).toBe(1);
  s = await story(page);
  expect(s.beat).toBe('k3_5');

  // ---- 3.9 Hinaus: down the stair, through the smoke, into the garden ---------------------------------
  const escape = await page.evaluate(() => {
    const k = window.kq as Any;
    const h = (window as Any).k3h;
    k.story.flush();
    k.step(10);
    const down = h.walk(
      [[1265.6, -1130.2], [1266.6, -1132.2], [1266.6, -1142], [1261.4, -1142], [1261.6, -1132], [1261.8, -1129.5], [1265, -1126], [1270.3, -1125.1], [1276, -1125]],
      { sprint: true, chunk: 4 },
    );
    k.step(10);
    return { rooms: down.rooms, out: down, smokeMax: down.smokeMax };
  });
  expect(escape.out.caught, JSON.stringify(escape)).toBe(false);
  expect(escape.smokeMax).toBeLessThan(0.95);
  s = await story(page);
  expect(s.beat, JSON.stringify(escape)).toBe('k3_6');

  // ---- 3.10 Der Garten: the pack hunts by ear; Hanne at the gate ---------------------------------------
  await page.evaluate(() => {
    const k = window.kq as Any;
    (window as Any).k3h.walk([[1288, -1130]], { chunk: 12 });
    k.step(150);
  });
  const hunt0 = await page.evaluate(() => (window.kq as Any).hunt.state());
  expect(hunt0?.active).toBe(true);
  const sneak = await page.evaluate(() => {
    const k = window.kq as Any;
    const h = (window as Any).k3h;
    const w = h.walk([[1290, -1180], [1285, -1238], [1267, -1252], [1266.5, -1285], [1270.5, -1290.5]], { crouch: true, chunk: 24, max: 3000, wary: 18 });
    k.step(30);
    return { w, beat: k.story.state().beat };
  });
  expect(sneak.w.caught, JSON.stringify(sneak)).toBe(false);
  expect(await quest(page, 'q.k3.festsaal')).toBe('ready');
  expect(await page.evaluate(() => (window.kq as Any).hunt.state())).toBeNull();
  await questTalk(page, 'hanne', 'q.k3.festsaal');
  await page.evaluate(() => (window as Any).k3h.settle(30));
  expect(await quest(page, 'q.k3.festsaal')).toBe('done');
  s = await story(page);
  expect(s.beat).toBe('k3_7');
  await page.evaluate(() => (window as Any).k3h.settle(300));
  expect(await quest(page, 'q.k3.hunde')).toBe('active');

  // side: the jaguar (Hanne asks: no blow, only light)
  expect(await quest(page, 'q.k3.jaguar')).toBe('offered');
  await questTalk(page, 'hanne', 'q.k3.jaguar', 'qa');
  const calm = await page.evaluate(() => {
    const k = window.kq as Any;
    const h = (window as Any).k3h;
    k.ctx.events.emit('lantern:request', { lit: true });
    h.walk([[1268, -1340], [1268, -1395]], { crouch: true, chunk: 24, max: 3000, wary: 16 });
    const p = k.ctx.player.position;
    const flares: number[] = [];
    for (let i = 0; i < 6 && k.quests.state().quests['q.k3.jaguar'].state === 'active'; i++) {
      // it circles back to the edge of the light: face it, then a flare (the charges refill in between)
      k.menagerie.place('k3.jaguar', p.x + 1, p.z - 5, 180);
      k.step(2);
      (window as Any).k3h.look(p.x + 1, p.z - 5, -4);
      k.combat.bann();
      k.step(20);
      flares.push(i);
      k.step(600);
    }
    return { flares: flares.length, state: k.quests.state().quests['q.k3.jaguar'].state, jaguar: k.menagerie.state().find((a: Any) => a.id === 'k3.jaguar') };
  });
  console.log(`[k3] jaguar: ${JSON.stringify(calm)}`);
  expect(calm.state, JSON.stringify(calm)).toBe('done');
  expect((await events('menagerie:calmed')).length).toBeGreaterThan(0);

  // ---- 3.11 north to the Zwinger: Streuner on the road, then Jost --------------------------------------
  const north = await page.evaluate(() => (window as Any).k3h.walk([[1262, -1450], [1262, -1505]], { crouch: true, chunk: 24, max: 3000, wary: 16 }));
  expect(north.caught, JSON.stringify(north)).toBe(false);
  await killGroup(page, 'q.k3.hunde.streuner', 3);
  const north2 = await page.evaluate(() => (window as Any).k3h.walk([[1262, -1530], [1258, -1563]], { crouch: true, chunk: 24, max: 3000, wary: 16 }));
  expect(north2.caught, JSON.stringify(north2)).toBe(false);
  s = await story(page);
  expect(s.beat).toBe('k3_8');
  // 3.12: nothing is granted before the gates open; E at the Gittertüren (outside, 3–7.5 m)
  await page.evaluate(() => (window as Any).k3h.settle(30));
  expect((await inv(page)).clues).not.toContain('clue.k3.jost');
  expect(await said()).not.toContain('beat.k3.hunde');
  const atGate = await page.evaluate(() => {
    const k = window.kq as Any;
    const h = (window as Any).k3h;
    h.walk([[1257, -1576]], { chunk: 12, max: 900 });
    // a quest's reward card or a page held back by the fight comes up now: put it away first
    for (let i = 0; i < 12 && (k.ctx.ui.cards.pending > 0 || k.ctx.ui.modals.count > 0) && !k.story.choice(); i++) {
      k.ctx.ui.modals.closeAll();
      k.step(10);
    }
    const g = k.hunt.kennel();
    // the gate answers from 3 to 7.5 m: if the walk stopped beyond that, one step in (not further:
    // the hounds' way out passes a few metres from where the player stands)
    const p = k.ctx.player.position;
    const d = Math.hypot(p.x - g.x, p.z - g.z);
    if (d > 7.4) k.teleport(g.x + ((p.x - g.x) / d) * 7, g.z + ((p.z - g.z) / d) * 7);
    h.look(g.x, g.z - 1, 2);
    k.step(4);
    const q = k.ctx.player.position;
    return { ...k.hunt.kennel(), at: [q.x, q.z], d0: d };
  });
  console.log(`[k3] kennel gate: ${JSON.stringify(atGate)}`);
  expect(atGate?.prompt, JSON.stringify(atGate)).toBe(true);
  expect(atGate.open).toBe(false);
  await shot(page, '10-zwinger-gate');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.press('KeyE', 1);
    k.step(Math.round(60 * 1.9));
  });
  await shot(page, '10b-zwinger-burst');
  const out = await page.evaluate(() => {
    const k = window.kq as Any;
    k.step(60 * 6);
    return k.hunt.kennel();
  });
  console.log(`[k3] kennel release: ${JSON.stringify(out)}`);
  expect(out.open).toBe(true);
  expect(out.nearest, JSON.stringify(out)).toBeGreaterThanOrEqual(3);
  expect(out.nearest, JSON.stringify(out)).toBeLessThanOrEqual(6);
  expect((await events('hunt:release')).length).toBe(1);
  await page.evaluate(() => (window as Any).k3h.settle(60));
  expect((await inv(page)).clues).toContain('clue.k3.jost');
  expect(await said()).toEqual(expect.arrayContaining(['beat.k3.hunde']));
  expect(await quest(page, 'q.k3.hunde')).toBe('ready');
  await page.evaluate(() => {
    const k = window.kq as Any;
    const n = k.npc.list().find((f: Any) => f.npc === 'jost');
    if (n) (window as Any).k3h.look(n.x, n.z, 2);
  });
  await shot(page, '10-zwinger-jost');
  await questTalk(page, 'jost', 'q.k3.hunde');
  await page.evaluate(() => (window as Any).k3h.settle(30));
  expect(await quest(page, 'q.k3.hunde')).toBe('done');
  expect((await items(page))['item.stab.bann']).toBe(1);
  const sk = await page.evaluate(() => window.kq!.state().skills);
  expect(sk.baumeister ?? 0).toBeGreaterThanOrEqual(2);
  expect(sk.roentgen ?? 0).toBeGreaterThanOrEqual(1);
  s = await story(page);
  expect(s.beat).toBe('k3_8b');
  // Jost runs after them with his lantern (k3:jost-run), the horn far off, then Laub
  await page.evaluate(() => (window as Any).k3h.settle(60 * 15));
  expect(await said()).toEqual(expect.arrayContaining(['jost.k3.04', 'laub.k3.alle']));

  // ---- back to today (hold Q), home to the field station --------------------------------------------
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
  await shot(page, '11-tisch-uhr');
  // no Pinnwand: the chapter goes on by itself
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.step(17 * 60);
    k.story.flush();
    k.step(10);
  });
  s = await story(page);
  expect(s.beat).toBe('k3_11');
  expect(await said()).toContain('laub.k3.ende');
  await page.evaluate(() => {
    const k = window.kq as Any;
    k.step(14 * 60 + 30);
    k.story.flush();
    k.step(10);
  });
  s = await story(page);
  expect(s.chapter).toBe('k4');
  const done = await page.evaluate(() => (window.kq as Any).quests.state().quests);
  const afternoonSides = process.env.K3_FROM === 'strohmann' ? [] : ['q.k3.kabinett', 'q.k3.lehnstuhl'];
  for (const id of ['q.k3.nachmittag', 'q.k3.buch', 'q.k3.strohmann', 'q.k3.festsaal', 'q.k3.hunde', 'q.k3.jaguar', ...afternoonSides]) expect(done[id]?.state, id).toBe('done');
  const lvl = await page.evaluate(() => (window.kq as Any).progression.state().level);
  console.log(`[k3] level at the end: ${lvl}`);
}
