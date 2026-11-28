import { type Page, expect } from '@playwright/test';
import { ciScale } from './ci';
import { waitForHooks } from './pause';
import { SCREENS } from './common';

// Shared opening, spring and quest controls for the chapter playthroughs.
async function snap(page: Page, file: string): Promise<void> {
  // software WebGL on a loaded machine: a frame can stall; one retry, then go on (pictures are
  // for review, the assertions carry the test)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.evaluate(() => window.kq!.screenshotReady());
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${SCREENS}/${file}.png`, timeout: ciScale(90_000) });
      return;
    } catch (e) {
      if (attempt === 1) console.warn(`screenshot ${file} skipped: ${(e as Error).message.split('\n')[0]}`);
    }
  }
}
/** The action-RPG review screenshots (test-results/screens/cna-*.png), taken in every mode. */
export async function cna(page: Page, name: string): Promise<void> {
  await page.evaluate(() => {
    const cards = window.kq!.ctx.ui.cards;
    if (cards.showing === 'reward') cards.dismissNotice();
  });
  // level / skill / chapter-title cards run out on rendered frames, which `?manual` stepping
  // barely produces: in a real session they are long gone by now, so they stay out of the review set
  await page.evaluate(() => {
    const st = document.createElement('style');
    window.kq?.story?.finishTyping();
    st.id = 'cna-hide';
    st.textContent = '[data-testid="level-card"], [data-testid="skill-card"], .kqs-card { visibility: hidden !important; }';
    document.head.append(st);
  });
  await snap(page, `cna-${name}`);
  await page.evaluate(() => document.getElementById('cna-hide')?.remove());
}

export const story = (page: Page) => page.evaluate(() => window.kq!.story!.state());
export const flag = (page: Page, f: string) => page.evaluate((f) => window.kq!.state().flags[f], f);

// ---------------------------------------------------------------------------------------------
// quest play (shared with k1.ts / k2.ts)
// ---------------------------------------------------------------------------------------------

export interface QuestPlay {
  /** Close cards and dialogs. */
  tidy(): void;
  /** Game seconds pass in half-second steps (tidying in between). */
  run(seconds: number): void;
  /** Step until `fn()` holds or `seconds` pass; returns whether it held. */
  until(fn: () => boolean, seconds: number): boolean;
  q(id: string): string;
  n(id: string, objective: string): number;
}
export type QW = { __cna: QuestPlay };

export const QUEST_PLAY = `(() => {
  const k = window.kq;
  const h = {};
  h.tidy = () => {
    const stack = k.ctx.ui.modals.stack || [];
    for (const m of [...stack]) m.close();
    if (k.story) k.story.finishTyping();
  };
  h.run = (seconds) => { for (let t = 0; t < seconds; t += 0.5) { h.tidy(); k.step(30); } };
  h.until = (fn, seconds) => { for (let t = 0; t < seconds; t += 0.5) { if (fn()) return true; h.tidy(); k.step(30); } return !!fn(); };
  h.q = (id) => (k.quests.state().quests[id] || { state: 'hidden' }).state;
  h.n = (id, o) => ((k.quests.state().quests[id] || { counts: {} }).counts[o] || 0);
  window.__cna = h;
})()`;

export async function installQuestPlay(page: Page): Promise<void> {
  await page.evaluate(QUEST_PLAY);
}
/** Game seconds pass (cards closed). */
export const run = (page: Page, seconds: number) => page.evaluate((s) => (window as unknown as QW).__cna.run(s), seconds);
/** The quest's state (hidden / offered / active / ready / done). */
export const qs = (page: Page, id: string) => page.evaluate((id) => (window as unknown as QW).__cna.q(id), id);
/** An objective's count. */
export const qn = (page: Page, id: string, o: string) => page.evaluate(([id, o]) => (window as unknown as QW).__cna.n(id, o), [id, o] as const);
/** Step until the quest reaches `state` (default done). */
export async function untilQuest(page: Page, id: string, state = 'done', seconds = 60): Promise<string> {
  await page.evaluate(
    ([id, state, seconds]) => {
      const h = (window as unknown as QW).__cna;
      h.until(() => h.q(id) === state, Number(seconds));
    },
    [id, state, seconds] as const,
  );
  return qs(page, id);
}
/** Step until the story reaches beat `id` (or `seconds` of game time pass). */
export async function until(page: Page, id: string, seconds = 60): Promise<string> {
  return page.evaluate(
    ({ id, seconds }) => {
      const h = (window as unknown as QW).__cna;
      h.until(() => window.kq!.story!.state().beat === id, seconds);
      return window.kq!.story!.state().beat as string;
    },
    { id, seconds },
  );
}
/**
 * A voice turn-in is a short moment, never a stance card (playtest round 3): no card opens; the
 * quest's deed is its state. Returns the quest state.
 */
export async function turninMoment(page: Page, quest: string): Promise<unknown> {
  await run(page, 3);
  expect(await page.locator('[data-testid="quest-stance"]').count()).toBe(0);
  return qs(page, quest);
}

/** Talk a quest through with an NPC giver: accept (the offer card) or hand in (the turn-in card). */
export async function talkQuest(page: Page, npc: string, quest: string, value?: string): Promise<void> {
  // an open page blocks the conversation (npc open() refuses while a modal is up)
  await putAwayPages(page);
  await page.evaluate(
    ([npc, quest, value]) => {
      const k = window.kq!;
      const n = k.npc!;
      n.talk(npc);
      n.drain();
      n.ask(`q:${quest}`);
      for (let i = 0; i < 40 && n.state().busy; i++) n.drain();
      n.drain();
      if (n.state().topics.includes(`qa:${quest}`)) n.choose(`qa:${quest}`);
      else if (n.state().topics.includes(`qt:${quest}`)) n.choose(`qt:${quest}`);
      void value;
      for (let i = 0; i < 20; i++) n.drain();
      if (n.state().open) n.close();
      k.step(2);
    },
    [npc, quest, value ?? ''] as const,
  );
}

/**
 * A short real fight, then the rest: the enemies of `target` (a kind or a group) are lured in
 * front of the player, struck with the Bannlicht and the Messstab, and whatever still stands is
 * undone through the combat hook (SwiftShader frames are slow; the combat itself is unit-tested).
 */
export async function fight(page: Page, target: string, o: { hits?: number; shot?: string } = {}): Promise<number> {
  const before = await page.evaluate((t) => window.kq!.combat!.enemies().filter((e) => e.kind === t || e.group === t).length, target);
  await page.evaluate(
    ([t, hits]) => {
      const k = window.kq!;
      const c = k.combat!;
      // a card on screen would pause the fight: read it away first
      (window as unknown as Partial<QW>).__cna?.tidy();
      c.god(true);
      const p = k.ctx.player.position;
      const yaw = k.ctx.player.yaw;
      const ahead = (d: number) => ({ x: p.x - Math.sin(yaw) * d, z: p.z - Math.cos(yaw) * d });
      for (const e of c.enemies().filter((e) => e.kind === t || e.group === t)) {
        const a = ahead(2.2);
        c.place(e.id, a.x, a.z, true);
      }
      k.step(2);
      c.bann();
      k.step(6);
      c.hit(Number(hits));
      (window as unknown as Partial<QW>).__cna?.tidy();
    },
    [target, o.hits ?? 4] as const,
  );
  if (o.shot) await cna(page, o.shot);
  await page.evaluate((t) => {
    const k = window.kq!;
    const c = k.combat!;
    const groups = new Set(c.enemies().filter((e) => e.kind === t || e.group === t).map((e) => e.group));
    c.kill(t);
    // a kind target leaves its packs' escorts (`<group>+escort`) standing: they go too (a cleared
    // group sends no second wave)
    for (const e of c.enemies()) if ([...groups].some((g) => e.group === `${g}+escort`)) c.kill(e.id);
    for (let i = 0; i < 20; i++) k.step(10);
    c.god(false);
  }, target);
  return before;
}

/** Hold Q (back to today, home to the Quelle — WP-04): the long press, then the transition played through. */
export async function holdHome(page: Page): Promise<void> {
  const log = await page.evaluate(() => {
    const k = window.kq!;
    const out: string[] = [];
    // like a player: hold Q; if the pack has you in sight ("not while someone is watching"),
    // put the lantern out, lie flat a moment and try again
    const h = (window as unknown as QW).__cna;
    for (let i = 0; i < 4 && k.story!.state().era !== 'today'; i++) {
      // a card on screen pauses the game (and Q with it): read it away first
      h.tidy();
      if (i > 0) {
        out.push(JSON.stringify(k.hunt!.state()));
        k.lantern!.toggle(false);
        if (k.ctx.player.stance !== 'prone') k.press('KeyX', 2);
        k.step(240);
      }
      k.ctx.input.simulate('KeyQ', true);
      k.step(100);
      k.ctx.input.simulate('KeyQ', false);
      k.fx!.shiftAt(3.6);
      k.fx!.freeze(false);
      k.step(12);
    }
    if (k.ctx.player.stance === 'prone') k.press('Space', 2);
    return out;
  });
  if (log.length) console.log('[holdHome] retried:', log.join(' | '));
}
/** Before the Karlsbergquelle's trough, facing the water. */
export const QUELLE_STAND = { x: 1059.3, z: -833.1, yaw: 204 } as const;

/**
 * The Karlsbergquelle (src/systems/quelle): stand before the trough facing the water,
 * wait for "E Wasser berühren", press E, let the touch scene run on game time (the dip, the
 * stillness, the brook running back; the touch at 2.7 s) until the story's shift starts, then play
 * the transition through. `atScene` runs once the moment stands still (a screenshot). Returns what
 * the spring did (the scene time it reached; -1 if E never started it) and where the story is.
 */
export async function touchSpring(page: Page, atScene?: () => Promise<void>): Promise<{ scene: number; prompt: boolean; era: string; beat: string; tries: number }> {
  let r = { scene: -1, prompt: false, era: '', beat: '', tries: 0 };
  // a card on screen pauses the game (and E with it): read it away first, then press E
  for (let i = 0; i < 3 && r.era !== '1789'; i++) {
    r = await page.evaluate(
      ({ at, i }) => {
        const k = window.kq!;
        const h = (window as unknown as QW).__cna;
        h.tidy();
        k.setScanMode(0);
        k.teleport(at.x, at.z, at.yaw, -14);
        k.step(6);
        const prompt = h.until(() => !!k.quelle?.info().prompt, 6);
        h.tidy();
        k.press('KeyE', 2);
        // the moment stands still (the ripple freezes, the stream hangs): one picture there
        for (let j = 0; j < 90 && (k.quelle?.info().scene ?? -1) < 1.5; j++) k.step(5);
        const scene = k.quelle?.info().scene ?? -1;
        return { scene, prompt, era: k.story!.state().era as string, beat: k.story!.state().beat as string, tries: i + 1 };
      },
      { at: QUELLE_STAND, i },
    );
    if (r.scene < 0) continue;
    if (atScene) await atScene();
    r = await page.evaluate(
      (r) => {
        const k = window.kq!;
        // on to the touch (2.7 s): the story answers with the shift to 1789; play it through
        for (let j = 0; j < 120 && !k.fx!.state().shift.active && k.story!.state().era === 'today'; j++) k.step(5);
        k.fx!.shiftAt(3.6);
        k.fx!.freeze(false);
        k.step(12);
        (window as unknown as QW).__cna.tidy();
        return { ...r, era: k.story!.state().era as string, beat: k.story!.state().beat as string };
      },
      r,
    );
  }
  return r;
}

/** Walk-free pickup: stand on it (the pickup radius is 1.3 m). */
export async function pickUp(page: Page, x: number, z: number): Promise<void> {
  await page.evaluate(
    ([x, z]) => {
      const k = window.kq!;
      k.teleport(x, z, 0, -20);
      k.step(20);
    },
    [x, z] as const,
  );
}
/** Start the tour from the title screen. */
export async function newGame(page: Page, name: string, shots = false, url = './?nosave&fresh&manual'): Promise<void> {
  await page.goto(url);
  const start = page.getByTestId('title-new');
  await expect(start).toBeEnabled({ timeout: 180_000 });
  await waitForHooks(page, ['story', 'quests', 'combat', 'fx'], 180_000);
  await start.click();
  await expect(page.getByTestId('content-warning')).toBeVisible();
  await expect(page.getByTestId('content-warning')).toContainText('16');
  if (shots) await snap(page, 'opening-00a-warning');
  await page.getByTestId('warning-accept').click();
  await page.getByTestId('player-name').fill(name);
  if (shots) await snap(page, 'opening-00b-name');
  await page.getByTestId('name-confirm').click();
  await expect(page.getByTestId('start-tour')).toBeVisible();
  if (shots) await snap(page, 'opening-00c-tour-map');
  await page.getByTestId('start-tour').click();
  await expect(page.getByTestId('title')).toBeHidden({ timeout: 30_000 });
  await installQuestPlay(page);
}

/**
 * A field-book page held back by a fight or a staged moment (src/ui/cards.ts) comes up a little
 * later; before pressing E on something new a player reads it and puts it away.
 */
export async function putAwayPages(page: Page): Promise<void> {
  await page.evaluate(() => {
    const k = window.kq!;
    const { cards, modals } = k.ctx.ui;
    // what keeps the queue shut (soft reasons and the story's extra hold only delay slide-in cards)
    const blocked = () => cards.holdReasons().some((r) => !r.startsWith('soft:') && r !== 'story');
    // one frame per step: the card gap runs on presented frames (drawn or only prepared, see
    // src/debug/stepGate.ts), so k.step(10) opened one page at most
    for (let i = 0; i < 240 && (modals.count > 0 || (cards.pending > 0 && !blocked())) && !k.story?.choice(); i++) {
      modals.closeAll();
      k.step(1);
    }
  });
}
