import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { stepPastSkillCards, stepToCard } from './helpers/cards';
import { openPause, waitForHooks } from './helpers/pause';
import { installQuestPlay, touchSpring } from './helpers/prolog';
import { SCREENS } from './helpers/common';

// Cross-system play on the tour and K1, with the Chronik test pack enabled.
mkdirSync(SCREENS, { recursive: true });
const URL = './?nosave&fresh&manual&placeholder';

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

/** Record every cross-feature event (contracts.ts) from now on. */
async function recordEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { intEvents: [string, unknown][] };
    w.intEvents = [];
    const quiet = new Set(['player:step', 'hunt:alert', 'lantern:oil', 'fire:progress', 'oblivion:progress']);
    window.kq!.ctx.events.onAny((name, payload) => {
      if (!quiet.has(name)) w.intEvents.push([name, structuredClone(payload)]);
    });
  });
}

const events = (page: Page, name?: string) =>
  page.evaluate((name) => (window as unknown as { intEvents: [string, unknown][] }).intEvents.filter(([n]) => !name || n === name), name) as Promise<Ev[]>;
const payloads = async (page: Page, name: string) => (await events(page, name)).map(([, p]) => p);

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SCREENS}/int-${name}.png`, timeout: ciScale(150_000) });
}

const story = (page: Page) => page.evaluate(() => window.kq!.story!.state());
const pos = (page: Page) => page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));

test('integration: the tour and K1 across story, fx, hunt and chronik', async ({ page }) => {
  test.setTimeout(ciScale(900_000));
  const errors = trackErrors(page);

  // ---- 1. new game: title → content warning → name → tour map ------------------------
  await page.goto(URL);
  const start = page.getByTestId('title-new');
  await expect(start).toBeEnabled({ timeout: 180_000 });
  await waitForHooks(page, ['story', 'chronik', 'hunt', 'fx', 'quelle', 'skills', 'quests', 'lantern', 'walk']);
  await recordEvents(page);
  await start.click();
  await page.getByTestId('warning-accept').click();
  await page.getByTestId('player-name').fill('Alex');
  await page.getByTestId('name-confirm').click();
  await page.getByTestId('start-tour').click();
  await expect(page.getByTestId('title')).toBeHidden({ timeout: 30_000 });
  await page.evaluate(() => window.kq!.step(30));
  const s = await story(page);
  expect(s).toMatchObject({ active: true, chapter: 'tour', beat: 't1', name: 'Alex', era: 'today' });
  expect(await payloads(page, 'story:chapter')).toEqual([{ id: 'tour' }]);
  await expect(page.getByTestId('story-card')).toContainText('Die Führung');
  await shot(page, '01-new-game');

  // The tour's spring break enters the home ring before the water is called.
  const home = await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('tour', 't16');
    const groupAtSpring = k.walk!.snap('fuehrung', 'quelle');
    k.teleport(1053, -828, 51);
    k.step(4);
    k.press('KeyE', 2);
    return { groupAtSpring, inHub: k.story!.state().inHub, touchingWater: k.quelle!.info().scene !== null };
  });
  expect(home).toEqual({ groupAtSpring: true, inHub: true, touchingWater: false });
  expect(await events(page, 'hub:enter')).toHaveLength(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Relief scan at the hollow way: the FX pulse and a Chronik clue.
  await page.evaluate(() => {
    const k = window.kq!;
    k.skills!.grant('relief', 3, true);
    k.teleport(1163, -1230, 135, -26);
    k.step(4);
    k.press('Digit2', 2);
    k.press('Digit2', 2);
    k.step(4);
  });
  expect(await payloads(page, 'scan:mode')).toContainEqual({ mode: 2 });
  await page.evaluate(() => window.kq!.fx!.pulse(2, 0.9));
  await shot(page, '05-scan');
  await page.evaluate(() => window.kq!.fx!.freeze(false));
  expect(await page.evaluate(() => window.kq!.chronik!.status('ct.clue.hohlweg'))).toBe('available');
  await expect(page.locator('.kq-prompt')).toContainText('Untersuchen');
  await page.evaluate(() => window.kq!.press('KeyE', 2));
  const card = page.getByTestId('chronik-card');
  await expect(card).toHaveAttribute('data-clue', 'ct.clue.hohlweg');
  expect(await payloads(page, 'clue:found')).toContainEqual({ id: 'ct.clue.hohlweg', kind: 'relief' });
  await shot(page, '06-clue');

  // The tour introduces the Bussole; at its trough the spring's E drives the one shift of the opening.
  await installQuestPlay(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.ui.modals.closeAll();
    k.story!.goto('tour', 't17');
    k.step(4);
  });
  // Laub's lines run, then the water is called (touchSpring steps to the trough)
  for (let i = 0; i < 60 && !(await page.evaluate(() => window.kq!.state().flags['quelle.call'])); i++) await page.evaluate(() => (window.kq!.story!.finishTyping(), window.kq!.step(60)));
  expect((await story(page)).objective).toMatchObject({ id: 'tour', text: 'Am Trog das Wasser berühren' });
  await expect(page.getByTestId('bussole')).toHaveClass(/kqs-show/);
  const spring = await touchSpring(page, () => shot(page, '07-spring'));
  expect(spring).toMatchObject({ prompt: true, era: '1789', beat: 't18' });
  expect(spring.scene).toBeGreaterThanOrEqual(1.5);
  expect(await payloads(page, 'shift:request')).toEqual([{ to: '1789', reason: 'quelle' }]);
  // the journey is one-way: the arrival lines, then „Der Hof“ begins right there, in 1789
  for (let i = 0; i < 80 && (await story(page)).beat !== 'k1_0b'; i++) await page.evaluate(() => (window.kq!.story!.finishTyping(), window.kq!.step(60)));
  expect(await story(page)).toMatchObject({ chapter: 'k1', beat: 'k1_0b', era: '1789' });
  expect(await payloads(page, 'shift:request')).toEqual([{ to: '1789', reason: 'quelle' }]);
  const shiftLog = (await events(page)).filter(([n]) => (n.startsWith('shift:') && n !== 'shift:request') || n === 'era:change').map(([n]) => n);
  expect(shiftLog).toEqual(['shift:begin', 'era:change', 'shift:midpoint', 'shift:done']);
  expect(await page.evaluate(() => window.kq!.state().meta.shifts)).toBe(1);
  await shot(page, '08-1789');

  // ---- 7. an echo: the Chronik plays its lines, the story does not repeat them ---------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.flush();
    k.story!.finishTyping();
    k.ctx.events.emit('story:cue', { id: 'court:off', data: { set: 'k1' } });
    k.ctx.ui.modals.closeAll();
    k.teleport(1214, -1113, 90, 4);
    k.step(10);
  });
  await expect(page.locator('.kq-prompt')).toContainText('Lauschen');
  await page.evaluate(() => {
    const k = window.kq!;
    k.press('KeyE', 60);
    k.chronik!.advanceEcho(4.5);
    k.step(1);
  });
  expect(await payloads(page, 'echo:start')).toEqual([{ id: 'ct.echo.diener' }]);
  await expect(page.locator('.ck-memory-label')).toBeVisible();
  const echoSays = ((await payloads(page, 'dialogue:say')) as { id?: string }[]).filter((p) => p.id?.startsWith('ct.echo.'));
  expect(echoSays).toEqual([]);
  // the story's presenter waits out of sight while the echo speaks
  await expect(page.getByTestId('dialogue')).toBeHidden();
  await shot(page, '09-echo');
  await page.evaluate(() => {
    const k = window.kq!;
    k.chronik!.advanceEcho(60);
    k.ctx.ui.modals.closeAll();
    k.step(2);
  });

  // ---- 8. the pack: threat:configure (as the story's chapter beats send it) → hunt ------------
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1452, -640, 330, 0); // the avenue north-east of the palace
    k.step(2);
    const p = k.ctx.player.position;
    k.ctx.events.emit('threat:configure', { kind: 'pack', active: true, intensity: 0.7, center: { x: p.x, z: p.z }, radius: 140, seed: 11 } as never);
    k.step(2);
    [
      [30, 6],
      [16, -10],
      [19, 14],
      [23, -24],
      [26, 28],
    ].forEach(([d, a], i) => k.hunt!.placeInView(i, d!, a!));
    k.lantern!.toggle(true);
    k.step(90);
  });
  expect((await payloads(page, 'hunt:start')).length).toBe(1);
  const chase = await page.evaluate(() => window.kq!.hunt!.state());
  expect(chase?.active).toBe(true);
  expect(chase?.state).toBe('chasing');
  await shot(page, '10-hunt');

  // ---- 9. caught: the hunt's rush, then the story's curtain (one title, not three) ------------
  const caughtAt = await page.evaluate(() => {
    const k = window.kq!;
    let i = 0;
    for (; i < 900 && k.hunt!.state() && !k.hunt!.state()!.caught; i++) k.step(1);
    if (k.hunt!.state() && !k.hunt!.state()!.caught) k.hunt!.catch();
    k.step(50); // ≈ 0.8 s into the rush
    return i;
  });
  expect(caughtAt).toBeLessThan(900);
  await shot(page, '11-rush');
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 120 && !(window as unknown as { intEvents: [string, unknown][] }).intEvents.some(([n]) => n === 'player:caught'); i++) k.step(1);
  });
  expect(await payloads(page, 'player:caught')).toEqual([{ by: 'pack' }]);
  await expect(page.getByTestId('story-curtain')).toHaveClass(/kqs-down/);
  await expect(page.getByTestId('story-curtain')).toContainText('Die Meute hat dich gestellt');
  // hunt and fx leave the words to the story
  const huntTitle = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.kq-hunt-caught h2')!).opacity));
  expect(huntTitle).toBe(0);
  // the curtain stays down 2.4 s of game time (manual mode: until the loop steps)
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SCREENS}/int-12-caught.png` });
  await page.evaluate(() => window.kq!.step(150));
  expect(await page.evaluate(() => window.kq!.story!.state().era)).toBe('today');
  await page.evaluate(() => window.kq!.step(6));
  const back = await page.evaluate(() => ({
    story: window.kq!.story!.state(),
    hunt: window.kq!.hunt!.state(),
    caughtT: document.querySelector<HTMLElement>('.kq-hunt-caught')!.style.opacity,
    frozen: window.kq!.ctx.player.frozen,
  }));
  expect(back.story).toMatchObject({ beat: 'k1_0b', objective: { id: 'k1.zurueck-q' } });
  expect(back.story.inHub).toBe(true);
  expect(back.hunt).toBeNull();
  expect(back.caughtT).toBe('0');
  expect(back.frozen).toBe(false);
  const p = await pos(page);
  expect(Math.hypot(p.x - 1059.3, p.z + 833.1)).toBeLessThan(6);
  expect(await payloads(page, 'hunt:end')).toContainEqual({ reason: 'caught' });
  // nothing is lost when caught any more (docs/ACTION-RPG.md §12)
  expect(await payloads(page, 'chronik:lost')).toEqual([]);
  expect(await page.evaluate(() => window.kq!.state().inventory.clues)).toContain('ct.clue.hohlweg');
  await page.waitForTimeout(2600); // the curtain lifts
  await page.evaluate(() => window.kq!.teleport(1053, -828, 51, -3));
  await shot(page, '13-home');

  // ---- 10. Pause → Codex: the clue facts are there ----------------------------------------
  await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
  await openPause(page);
  const pauseCodex = page.getByTestId('pause-codex');
  await pauseCodex.click();
  await expect(page.getByTestId('page-codex')).toBeVisible();
  expect(await events(page, 'chronik:opened')).toHaveLength(1);
  expect(await page.evaluate(() => window.kq!.ctx.ui.modals.count)).toBe(2);
  const facts = await page.evaluate(() => window.kq!.state().codex.facts);
  expect(facts.length).toBeGreaterThan(0);
  // relief patterns (rm.NN) have their own filter; everything else shows under "Alle"
  const relief = facts.filter((f) => /(^|\.)rm\.\d+/.test(f));
  if (relief[0]) {
    await page.getByTestId('codex-filter-relief').click();
    await expect(page.getByTestId(`codex-card-${relief[0]}`)).toBeVisible();
    await page.getByTestId('codex-filter-all').click();
  }
  const plain = facts.find((f) => !relief.includes(f));
  if (plain) await expect(page.getByTestId(`codex-card-${plain}`)).toBeVisible();
  await shot(page, '14-codex');
  await page.getByTestId('page-codex').getByRole('button', { name: 'Zurück', exact: true }).click();
  await expect(page.getByTestId('page-codex')).toBeHidden();
  await expect(pauseCodex).toBeFocused();
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  // no batches and no hint ladder any more
  expect(await payloads(page, 'chronik:batch')).toEqual([]);

  expect(errors).toEqual([]);
});

/**
 * Round 2 tour, driven by the test chapter's r1–r4 beats (content/story/99-test.story.json,
 * `?storytest`, real content packs): walk through a doorway into the Festsaal 1789 (interiors
 * room:enter → story `room` condition), talk to a ghost placed in that upstairs room (npc on the
 * room's storey), the story's `skill` action → unlock card, measure the gallery in 1793-07
 * (measure:done → story event condition + the Chronik's measuring clue), and the story's pack in
 * 1793-02 leaving snow tracks. Screenshots: test-results/screens/int-r2-*.png.
 */
test('integration: round 2 tour (interiors, npc, skills/tools, snow tracks)', async ({ page }) => {
  test.setTimeout(ciScale(600_000));
  const errors = trackErrors(page);
  await page.goto('./?notitle&nosave&fresh&manual&storytest');
  await waitForHooks(page, ['story', 'interiors', 'npc', 'tools', 'skills', 'hunt', 'chronik']);
  await recordEvents(page);
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.state.mutable.flags['barks.quiet'] = true; // clean pictures
    k.story!.start('Alex');
    k.story!.goto('test', 'r1');
    k.step(4);
  });
  let s = await story(page);
  expect(s.beat).toBe('r1');
  expect(s.era).toBe('1789');
  // the ghost stands on the Festsaal's (upper) storey
  const fest = await page.evaluate(() => window.kq!.interiors!.list().find((r) => r.roomId === 'B01.2.og-festsaal')!);
  const npc = await page.evaluate(() => window.kq!.npc!.list()[0]!);
  expect(npc.npc).toBe('hanne');
  expect(Math.abs(npc.y - fest.floor)).toBeLessThan(0.3);

  // ---- 1. through the doorway from the Gardesaal into the Festsaal ------------------------------
  const door = await page.evaluate(() => window.kq!.interiors!.doors().find((d) => d.from === 'B01.2.og-festsaal' && d.to === 'B01.2.og-gardesaal')!);
  expect(door).toBeTruthy();
  await page.evaluate(
    ({ d }) => {
      const k = window.kq!;
      const back = d.depth + 3;
      const x0 = d.x + d.nx * back;
      const z0 = d.z + d.nz * back;
      // stand on the Gardesaal floor (same storey), facing the door
      k.ctx.player.position.set(x0, d.floor + 0.05, z0);
      k.teleport(x0, z0, (-Math.atan2(d.nx, d.nz) * 180) / Math.PI, 2);
      k.step(2);
      k.interiors!.build();
      k.step(2);
    },
    { d: door },
  );
  expect(await page.evaluate(() => window.kq!.interiors!.room()?.roomId)).toBe('B01.2.og-gardesaal');
  // let a story-start unlock card leave the picture
  await stepPastSkillCards(page);
  await shot(page, 'r2-01-doorway');
  const walked = await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 60 && k.interiors!.room()?.roomId !== 'B01.2.og-festsaal'; i++) k.press('KeyW', 5);
    k.press('KeyW', 20);
    k.step(3);
    return { room: k.interiors!.room()?.roomId ?? null, y: k.ctx.player.position.y };
  });
  expect(walked.room).toBe('B01.2.og-festsaal');
  expect(Math.abs(walked.y - fest.floor)).toBeLessThan(0.3);
  const enters = (await payloads(page, 'room:enter')) as { roomId: string; building: string; id: string }[];
  expect(enters.at(-1)).toMatchObject({ roomId: 'B01.2.og-festsaal', building: 'KB-B01', id: 'KB-B01/B01.2.og-festsaal' });
  expect((await page.evaluate(() => window.kq!.state().flags))['interior.room']).toBe('B01.2.og-festsaal');
  s = await story(page);
  expect(s.beat).toBe('r2'); // the story's { room: 'KB-B01/…festsaal' } condition held

  // ---- 2. the ghost in the Festsaal: same storey, E opens the conversation ----------------------
  const hanne = await page.evaluate(() => {
    const k = window.kq!;
    const n = k.npc!.list()[0]!;
    const p = k.ctx.player.position;
    // two metres in front of her, from the door side
    const dx = p.x - n.x;
    const dz = p.z - n.z;
    const l = Math.hypot(dx, dz) || 1;
    const x = n.x + (dx / l) * 2.1;
    const z = n.z + (dz / l) * 2.1;
    k.teleport(x, z, (Math.atan2(n.x - x, -(n.z - z)) * 180) / Math.PI, 4);
    k.ctx.player.lookLocked = false;
    k.step(2);
    return { near: k.npc!.state().near, py: k.ctx.player.position.y };
  });
  expect(hanne.near).toBe('hanne');
  expect(Math.abs(hanne.py - fest.floor)).toBeLessThan(0.3);
  await page.waitForFunction(() => window.kq!.npc!.list()[0]!.alpha > 0.95, null, { timeout: 30_000 });
  await shot(page, 'r2-02-festsaal-hanne');
  await page.evaluate(() => window.kq!.press('KeyE', 1));
  await expect(page.getByTestId('npc-talk')).toBeVisible();
  await page.evaluate(() => {
    const n = window.kq!.npc!;
    n.finish();
    n.drain();
  });
  await shot(page, 'r2-03-conversation');
  await page.evaluate(() => {
    const n = window.kq!.npc!;
    n.ask('bye');
    n.drain();
    window.kq!.step(4);
  });
  await expect(page.getByTestId('npc-talk')).toBeHidden();
  expect((await page.evaluate(() => window.kq!.state().flags))['talked.k1.hanne']).toBe(true);
  expect(await page.evaluate(() => window.kq!.state().inventory.clues)).toContain('clue.k1.hanne');

  // ---- 3. the story grants Kartograf 3 (unlock card, no second toast) and goes to 1793-07 --------
  await page.evaluate(() => window.kq!.step(6));
  s = await story(page);
  expect(s.beat).toBe('r3');
  expect(s.era).toBe('1793-07');
  expect(await page.evaluate(() => window.kq!.npc!.list())).toEqual([]);
  expect(await page.evaluate(() => window.kq!.state().skills['kartograf'])).toBe(3);
  expect(await payloads(page, 'skill:unlocked')).toContainEqual({ skill: 'kartograf', level: 3 });
  await stepToCard(page, '.kqk-card:not(.kqk-held)', 'present');
  await expect(page.locator('.kqs-card.kqs-show')).toHaveCount(0);
  await expect(page.getByTestId('skill-card')).toBeVisible();
  await expect(page.locator('.kq-toast', { hasText: 'TEST: Messen' })).toHaveCount(0);
  await stepPastSkillCards(page);

  // ---- 4. measure the gallery facade (KB-B06) → story beat + the Chronik's measuring clue --------
  const ring = await page.evaluate(() => window.kq!.ctx.data.footprints.buildings.find((b) => b.id === 'KB-B06')!.ring);
  const [p3, p2] = [ring[3]!, ring[2]!];
  const at = (t: number) => ({ x: p3[0]! + (p2[0]! - p3[0]!) * t, z: p3[1]! + (p2[1]! - p3[1]!) * t - 0.4 });
  await page.evaluate(
    ({ a, b, m }) => {
      const k = window.kq!;
      k.teleport(1236, -1300, 180, 0);
      k.step(2);
      k.tools!.measure.at(a.x, a.z, b.x, b.z, 354.5, 354.5);
      // look at the tape along the facade
      const cam = k.ctx.camera.position;
      const yaw = (Math.atan2(m.x - cam.x, -(m.z - cam.z)) * 180) / Math.PI;
      k.teleport(1236, -1300, yaw, 4);
      k.step(1);
    },
    { a: at(0.02), b: at(0.98), m: at(0.5) },
  );
  const done = (await payloads(page, 'measure:done')) as { building?: string; distance: number }[];
  expect(done).toHaveLength(1);
  expect(done[0]!.building).toBe('KB-B06');
  expect(done[0]!.distance).toBeGreaterThan(70);
  expect((await page.evaluate(() => window.kq!.state().flags))['measured.KB-B06']).toBeGreaterThan(70);
  expect(await page.evaluate(() => window.kq!.ctx.era.current)).toBe('1793-07');
  await shot(page, 'r2-04-measure-gallery');
  // the Chronik's measuring clue: its card comes 1.2 s (game time) after the tape
  await page.evaluate(() => window.kq!.step(90));
  const card = page.getByTestId('chronik-card');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toHaveAttribute('data-clue', 'clue.k3.messen');
  expect(await payloads(page, 'clue:found')).toContainEqual({ id: 'clue.k3.messen', kind: 'object' });
  await shot(page, 'r2-05-measure-clue');
  await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());

  // ---- 5. 1793-02: the story's pack (threat action) and snow tracks --------------------------------
  await page.evaluate(() => window.kq!.step(4));
  s = await story(page);
  expect(s.beat).toBe('r4');
  expect(s.era).toBe('1793-02');
  const tracks = await page.evaluate(() => {
    const k = window.kq!;
    k.hunt!.freeze(true);
    const sim = k.hunt!.sim();
    if (sim) for (const ag of sim.agents) ag.x += 400; // keep the pack out of the picture
    k.teleport(1452, -640, 330, -30);
    k.lantern!.toggle(true);
    k.step(2);
    k.press('KeyW', 300);
    // turn round and look at the trail
    const p = k.ctx.player;
    k.teleport(p.position.x, p.position.z, 150, -34);
    k.step(4);
    return { tracks: k.hunt!.tracks(), active: !!sim };
  });
  expect(tracks.active).toBe(true);
  expect(await page.evaluate(() => window.kq!.tools!.state().measure)).toBe('off'); // the tape stayed in 1793-07
  await page.evaluate(() => window.kq!.story!.flush());
  await page.addStyleTag({ content: '[data-testid="dialogue"]{display:none!important}' });
  expect(tracks.tracks.snow).toBe(1);
  expect(tracks.tracks.boot).toBeGreaterThan(10);
  await shot(page, 'r2-06-snow-tracks');

  // the story's threat config reached the hunt with every field (snow / seed pass through)
  const conf = (await payloads(page, 'threat:configure')) as { kind: string; active: boolean; snow?: boolean; seed?: number }[];
  expect(conf).toContainEqual(expect.objectContaining({ kind: 'pack', active: true, snow: true, seed: 3 }));
  expect(errors).toEqual([]);
});
