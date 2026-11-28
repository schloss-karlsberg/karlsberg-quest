import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import type { Material, Mesh, Object3D, Points } from 'three';
import { ciScale } from './helpers/ci';
import { waitForHooks } from './helpers/pause';
import { SCREENS } from './helpers/common';

/**
 * Round 2: NPCs (Hanne at the building site 1789; solid people, one ghost), conversations, story conditions and
 * actions (talked, inline + modal choices, meters, readings, rooms, memorials, lossless capture,
 * epilogue assembly), and barks (idle, gap, memorial quiet).
 * Runs the test chapter content/story/99-test.story.json (`?storytest`).
 * Screenshots: test-results/screens/npc-*.png
 */
mkdirSync(SCREENS, { recursive: true });
test.describe.configure({ timeout: ciScale(300_000) });

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

type Rec = { n: string; p: unknown }[];

async function boot(page: Page, extra = ''): Promise<void> {
  await page.goto(`./?notitle&nosave&fresh&manual${extra}`);
  await waitForHooks(page, ['story', 'npc', 'barks', 'chronik']);
  await page.evaluate(() => {
    const w = window as unknown as { rec: Rec };
    w.rec = [];
    window.kq!.ctx.events.onAny((n, p) => {
      if (n !== 'player:step' && n !== 'lantern:oil') w.rec.push({ n, p: JSON.parse(JSON.stringify(p ?? null)) });
    });
  });
}

async function events(page: Page, name: string): Promise<unknown[]> {
  return page.evaluate((n) => (window as unknown as { rec: Rec }).rec.filter((e) => e.n === n).map((e) => e.p), name);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SCREENS}/npc-${name}.png` });
}

const flags = (page: Page) => page.evaluate(() => window.kq!.state().flags);
const story = (page: Page) => page.evaluate(() => window.kq!.story!.state());

test('npc: Hanne at the building site (1789) – figure, conversation, clue; story conditions and actions', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page, '&storytest');
  const shiftsBefore = await page.evaluate(() => window.kq!.state().meta.shifts);
  await page.evaluate(() => {
    const k = window.kq!;
    // clean screenshots of the figure: no barks for now (flag barks.quiet)
    k.ctx.state.mutable.flags['barks.quiet'] = true;
    k.story!.start('Mara');
    k.story!.goto('test');
    k.step(4);
  });
  let s = await story(page);
  expect(s.chapter).toBe('test');
  expect(s.beat).toBe('t1');
  expect(s.era).toBe('1789');
  // the oil meter lit and refilled the lantern with a 90 s burn time
  const lantern = await page.evaluate(() => (window.kq!.state().systems as Record<string, { lantern?: { lit: boolean; seconds: number } }>).hunt?.lantern);
  expect(lantern).toMatchObject({ lit: true, seconds: 90 });
  expect(Object.keys(await page.evaluate(() => window.kq!.story!.meters()))).toContain('oil');

  // ---- the figure ----------------------------------------------------------------------------
  const list = await page.evaluate(() => window.kq!.npc!.list());
  expect(list).toEqual([expect.objectContaining({ npc: 'hanne', x: 1287, z: -1228, era: '1789', visible: true })]);
  // her talk clue belongs to the conversation now (no Chronik marker / E for it)
  expect((await flags(page))['npc.owns.clue.k1.hanne']).toBe(true);
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1284.5, -1223.6, 34, 2);
    k.ctx.player.lookLocked = false;
    k.step(2);
  });
  await page.waitForFunction(() => window.kq!.npc!.list()[0]!.alpha > 0.95, null, { timeout: 30_000 });
  await shot(page, 'hanne-1789');
  // a closer look, slightly from the side
  await page.evaluate(() => {
    window.kq!.teleport(1285.3, -1225.0, 38, 4);
    window.kq!.step(1);
  });
  await page.waitForTimeout(600);
  await shot(page, 'hanne-close');

  // ---- approach → E → conversation ---------------------------------------------------------------
  await page.evaluate(() => {
    window.kq!.teleport(1285.8, -1225.9, 30, -4);
    window.kq!.step(2);
  });
  expect(await page.evaluate(() => window.kq!.npc!.state().near)).toBe('hanne');
  await expect(page.locator('.kq-prompt')).toContainText('Mit Hanne sprechen');
  await page.evaluate(() => window.kq!.press('KeyE', 1));
  await expect(page.getByTestId('npc-talk')).toBeVisible();
  let n = await page.evaluate(() => window.kq!.npc!.state());
  expect(n).toMatchObject({ open: true, npc: 'hanne', chapter: 'k1', busy: true });
  expect(n.line?.id).toBe('hanne.k1.01');
  expect(await events(page, 'npc:conversation')).toEqual([{ npc: 'hanne', open: true }]);
  expect(await events(page, 'npc:talk')).toEqual([{ npc: 'hanne', chapter: 'k1', topic: 'greet' }]);
  expect(await events(page, 'clue:grant')).toEqual([{ id: 'clue.k1.hanne' }]);
  expect(await page.evaluate(() => window.kq!.state().inventory.clues)).toContain('clue.k1.hanne');
  expect((await flags(page))['talked.k1.hanne']).toBe(true);
  await expect(page.locator('.kqn-tag')).toHaveText('erfunden');
  await page.evaluate(() => window.kq!.npc!.finish());
  await shot(page, 'conversation');

  // greeting read → the questions
  await page.evaluate(() => window.kq!.npc!.drain());
  n = await page.evaluate(() => window.kq!.npc!.state());
  expect(n.busy).toBe(false);
  expect(n.topics).toEqual(['matthes', 'warten', 'berg', 'warum', 'bye']);
  await shot(page, 'topics');
  // a stepped answer: both lines in order
  await page.getByTestId('npc-topic-matthes').click();
  n = await page.evaluate(() => window.kq!.npc!.state());
  expect(n.line?.id).toBe('hanne.k1.02');
  await page.evaluate(() => {
    window.kq!.npc!.finish();
    window.kq!.npc!.advance();
  });
  expect((await page.evaluate(() => window.kq!.npc!.state())).line?.id).toBe('hanne.k1.03');
  await page.evaluate(() => window.kq!.npc!.drain());
  expect((await flags(page))['talked.k1.hanne.matthes']).toBe(true);
  await expect(page.getByTestId('npc-topic-matthes')).toHaveClass(/kqn-asked/);
  // goodbye
  await page.evaluate(() => window.kq!.npc!.ask('bye'));
  await page.evaluate(() => window.kq!.npc!.drain());
  await expect(page.getByTestId('npc-talk')).toBeHidden();
  expect((await events(page, 'npc:conversation')).at(-1)).toEqual({ npc: 'hanne', open: false });
  // the npc system speaks these lines itself: the story runner did not repeat them
  expect(((await events(page, 'dialogue:say')) as { id?: string }[]).filter((d) => d.id?.startsWith('hanne.k1.'))).toEqual([]);

  // ---- talked → t2: inline choice resolved by the lit lantern → t3: modal choice ------------------
  await page.evaluate(() => window.kq!.step(3));
  s = await story(page);
  expect(s.beat).toBe('t3');
  let f = await flags(page);
  expect(f['choice.test.tor']).toBe('leuchten');
  expect(f['flag.test_tor']).toBe('leuchten');
  expect(await events(page, 'story:choice')).toEqual([{ id: 'test.tor', option: 'leuchten' }]);
  await expect(page.getByTestId('story-choice')).toBeVisible();
  expect(await page.evaluate(() => window.kq!.story!.choice())).toBe('test.objekt');
  await page.evaluate(() => window.kq!.step(60)); // the fuse burns on game time
  await expect(page.getByTestId('story-choice').locator('.kqs-fuse-label')).toHaveText(/Noch 29 s/);
  await shot(page, 'choice');
  await page.keyboard.press('Digit1');
  await expect(page.getByTestId('story-choice')).toBeHidden();
  f = await flags(page);
  expect(f['choice.test.objekt']).toBe('tuergriff');
  expect(f['flag.k3_objekt']).toBe('tuergriff');

  // ---- t4: a custom gauge on game time (lossless) -----------------------------------------------
  await page.evaluate(() => window.kq!.step(3));
  expect((await story(page)).beat).toBe('t4');
  expect((await flags(page))['chronik.noLoss']).toBe(true);
  await page.evaluate(() => window.kq!.step(300));
  const half = (await page.evaluate(() => window.kq!.story!.meters())).atem!.value;
  expect(half).toBeGreaterThan(0.4);
  expect(half).toBeLessThan(0.6);
  await expect(page.getByTestId('gauge-atem')).toBeVisible();
  await shot(page, 'gauge');
  await page.evaluate(() => window.kq!.step(320));
  expect(await events(page, 'story:meter-full')).toEqual([{ id: 'atem' }]);

  // ---- t5: the readings action (old saves only: deeds need no blanks); {jahre:1793}; a memorial; a room
  await page.evaluate(() => window.kq!.step(3));
  s = await story(page);
  expect(s.beat).toBe('t5');
  f = await flags(page);
  // the test story still declares an old reading: the kept action fills it (old saves); the
  // campaign's epilogue reads deeds (docs/ACTION-RPG.md §8.6)
  expect(f['flag.k1_lohn']).toBe('offen');
  const said = (await events(page, 'dialogue:say')) as { id?: string; text: string }[];
  expect(said.find((d) => d.id === 'test.jahre')?.text).toContain('{jahre:1793}');
  await page.evaluate(() => window.kq!.story!.finishTyping());
  await expect(page.getByTestId('dialogue')).toContainText(/Nach (zweihundert\S+|über zweihundert) Jahren, Mara\./);
  // the memorial follows the line (an opening line takes its time before the beat's next action)
  const quiet = await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 40 && k.barks!.state().quiet !== 'memorial:test.gedenk'; i++) k.step(30);
    return k.barks!.state().quiet;
  });
  expect(quiet).toBe('memorial:test.gedenk');
  await page.evaluate(() => {
    window.kq!.story!.room('B03.1.eg-registratur');
    window.kq!.step(2);
  });
  s = await story(page);
  expect(s.room).toBe('B03.1.eg-registratur');
  expect(s.beat).toBe('t6');
  expect(await page.evaluate(() => window.kq!.npc!.list())).toEqual([]);
  expect((await flags(page))['npc.owns.clue.k1.hanne']).toBeUndefined();
  expect(await page.evaluate(() => window.kq!.barks!.state().memorials)).toEqual([]);

  // ---- caught under the lossless rule: game-time curtain, nothing lost, no extra shift -------------
  await page.evaluate(() => window.kq!.story!.caught('pack', 2000));
  await expect(page.getByTestId('story-curtain')).toHaveClass(/kqs-down/);
  await expect(page.getByTestId('story-curtain')).toContainText('Die Meute hat dich heimgebracht');
  await page.waitForTimeout(400);
  // no real time passes for the curtain in manual mode
  expect((await story(page)).era).toBe('1789');
  await page.evaluate(() => window.kq!.step(125));
  s = await story(page);
  expect(s.era).toBe('today');
  expect(await page.evaluate(() => window.kq!.ctx.player.frozen)).toBe(false);
  expect(await events(page, 'chronik:lost')).toEqual([]);
  expect(await page.evaluate(() => window.kq!.state().inventory.clues)).toContain('clue.k1.hanne');
  expect(await page.evaluate(() => window.kq!.state().meta.shifts)).toBe(shiftsBefore);

  // ---- epilogue from the endings pack ----------------------------------------------------------
  const ep = await page.evaluate(() => window.kq!.story!.epilogue('museum'));
  expect(ep!.object).toContain('Türgriff');
  // told from deeds: no side quest done here → the open sentence of the slot
  expect(ep!.variants.hof).toBe('offen');
  expect(ep!.intro).toMatch(/^(Karlsberg bei Homburg|Dieses Feldbuch)/);
  expect(errors).toEqual([]);
});

/** How one placed NPC is drawn right now: the materials of every mesh / point cloud that is visible. */
interface Drawn {
  look: string;
  alpha: number;
  parts: number;
  /** Parts drawn with blending or without depth write (a ghost's shader, mist, motes). */
  blended: number;
  /** Lowest opacity over the parts (`uAlpha` on a ghost's shader material). */
  opacity: number;
}

async function drawnNpc(page: Page, npc: string): Promise<Drawn | null> {
  return page.evaluate((id) => {
    const k = window.kq!;
    const info = k.npc!.list().find((n) => n.npc === id);
    const root = k.ctx.scene.getObjectByName(`npc-${id}`);
    if (!info || !root) return null;
    const out = { look: info.look, alpha: info.alpha, parts: 0, blended: 0, opacity: 1 };
    const walk = (o: Object3D) => {
      if (!o.visible) return;
      const m = o as Mesh;
      if (m.isMesh || (o as Points).isPoints) {
        const mat = (Array.isArray(m.material) ? m.material[0]! : m.material) as Material & { uniforms?: Record<string, { value: unknown }> };
        out.parts++;
        if (mat.transparent || !mat.depthWrite) out.blended++;
        const a = mat.uniforms?.uAlpha;
        out.opacity = Math.min(out.opacity, a ? (a.value as number) : mat.opacity);
      }
      for (const c of o.children) walk(c);
    };
    walk(root);
    return out;
  }, npc);
}

test('npc: people are drawn solid (Marlene today, the Hofgärtner in 1789); a ghost only where it is asked for', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page, '&x=893&z=-849');
  // Marlene at the pond, where tour beat t13 puts her
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.state.mutable.flags['barks.quiet'] = true;
    k.npc!.spawn({ npc: 'marlene', x: 895.5, z: -843.5, era: 'today', chapter: 'tour' });
    k.teleport(895.2, -847.6, 5, -6);
  });
  /** Game time for the fade (0.35 s) on a fixed tick budget, once the model is in. */
  const settle = async (npc: string) => {
    await page.waitForFunction((id) => (window.kq!.ctx.scene.getObjectByName(`npc-${id}`)?.children.length ?? 0) > 0, npc, { timeout: 60_000 });
    await page.evaluate(() => {
      for (let i = 0; i < 60; i++) window.kq!.step(1);
    });
  };
  await settle('marlene');
  const marlene = await drawnNpc(page, 'marlene');
  expect(marlene).toMatchObject({ look: 'solid', alpha: 1, blended: 0, opacity: 1 });
  expect(marlene!.parts).toBeGreaterThan(3);
  await shot(page, 'marlene-solid');
  // she stays solid: ten more seconds of game time
  await page.evaluate(() => {
    for (let i = 0; i < 10; i++) window.kq!.step(60);
  });
  expect(await drawnNpc(page, 'marlene')).toMatchObject({ alpha: 1, blended: 0, opacity: 1 });

  // the Hofgärtner on the Orangerie lawn in 1789 (story beat k1_0b)
  await page.evaluate(() => {
    const k = window.kq!;
    k.npc!.despawn('*');
    k.setEra('1789');
    k.npc!.spawn({ npc: 'hofgaertner', x: 1221, z: -993, era: '1789', chapter: 'k1', yaw: 110 });
    k.teleport(1223.6, -996.2, 320, -6);
  });
  await settle('hofgaertner');
  const gardener = await drawnNpc(page, 'hofgaertner');
  expect(gardener).toMatchObject({ look: 'solid', alpha: 1, blended: 0, opacity: 1 });
  expect(gardener!.parts).toBeGreaterThan(3);
  await shot(page, 'hofgaertner-solid');

  // leaving his era he is gone, not a shade; back in 1789 he is solid again
  await page.evaluate(() => {
    const k = window.kq!;
    k.setEra('today');
    for (let i = 0; i < 60; i++) k.step(1);
  });
  expect(await drawnNpc(page, 'hofgaertner')).toMatchObject({ alpha: 0, parts: 0 });
  await page.evaluate(() => {
    const k = window.kq!;
    k.setEra('1789');
    for (let i = 0; i < 60; i++) k.step(1);
  });
  expect(await drawnNpc(page, 'hofgaertner')).toMatchObject({ alpha: 1, blended: 0, opacity: 1 });

  // the deliberate ghost: the old Pikeur kneeling at the kennel today (story beat k4_13)
  await page.evaluate(() => {
    const k = window.kq!;
    k.npc!.despawn('*');
    k.setEra('today');
    k.npc!.spawn({ npc: 'pikeur', x: 1219, z: -1566, era: 'today', yaw: 210, chapter: 'k4', mood: 'warm', pose: 'kneel', look: 'ghost' });
    k.teleport(1221.2, -1562.6, 215, -8);
    k.step(2);
  });
  await page.waitForFunction(() => window.kq!.npc!.list()[0]!.alpha > 0.95, null, { timeout: 30_000 });
  const ghost = await drawnNpc(page, 'pikeur');
  expect(ghost!.look).toBe('ghost');
  expect(ghost!.parts).toBeGreaterThan(1);
  expect(ghost!.blended).toBe(ghost!.parts);
  expect(errors).toEqual([]);
});

test('barks: one per 45 s, idle after 60 s, quiet at the Rondell; Codex from the Pinnwand returns to the hub', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  const spoken = () => page.evaluate(() => window.kq!.barks!.state().spoken.map((s) => s.id));
  await page.evaluate(() => {
    const k = window.kq!;
    k.step(5);
    k.barks!.advance(60);
    k.teleport(1216, -1180, 180);
    k.setEra('1789');
    k.step(3);
  });
  expect((await spoken()).at(-1)).toMatch(/^laub\.bark\.enter_1789\.\d\d$/);
  await page.evaluate(() => window.kq!.story!.finishTyping());
  await expect(page.getByTestId('dialogue')).toHaveAttribute('data-speaker', 'laub');
  await shot(page, 'bark');
  // the global gap: a scan bark waits …
  const before = (await spoken()).length;
  await page.evaluate(() => {
    window.kq!.ctx.events.emit('scan:mode', { mode: 2 });
    window.kq!.step(3);
  });
  expect((await spoken()).length).toBe(before);
  expect(await page.evaluate(() => window.kq!.barks!.state().pending)).toEqual(['scan:mode']);
  // … and goes once 45 s have passed (and the line on screen is gone)
  await page.evaluate(() => {
    window.kq!.barks!.advance(46);
    window.kq!.step(2);
  });
  expect((await spoken()).at(-1)).toMatch(/^laub\.bark\.scan\.0[24]$/);

  // memorial: no barks at the Rondell, the request expires
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1815, 350, 0);
    k.step(2);
    k.barks!.advance(60);
    k.ctx.events.emit('scan:mode', { mode: 3 });
    k.step(2);
  });
  expect(await page.evaluate(() => window.kq!.barks!.state().quiet)).toBe('memorial:rondell');
  const atRondell = (await spoken()).length;
  await page.evaluate(() => window.kq!.step(600));
  expect((await spoken()).length).toBe(atRondell);
  expect(await page.evaluate(() => window.kq!.barks!.state().pending)).toEqual([]);

  // idle: 60 s of game time without input
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1216, -1180, 90);
    k.step(2);
    k.barks!.advance(60);
    for (let i = 0; i < 37; i++) k.step(100);
  });
  expect((await events(page, 'bark:idle')).length).toBe(1);
  expect((await spoken()).at(-1)).toMatch(/^laub\.bark\.idle\.\d\d$/);

  expect(errors).toEqual([]);
});
