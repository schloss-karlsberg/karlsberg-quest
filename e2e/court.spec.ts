import { mkdirSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { SCREENS } from './helpers/common';

/**
 * "Unauffällig" (src/systems/court, docs/IDEAS-ROUND11.md §2.6): watchers placed through the npc
 * API with a `watch` block, the attention meter, the caption naming the tell, the lossless
 * ejection with the first-time hint card, the running and staff tells, the gate inspection
 * (refused / ejected / thrown out during the ring / passed → gate open), the costume per era and
 * the fast-travel arrival outside the gitter. Screenshots: test-results/screens/court-*.png.
 */
mkdirSync(SCREENS, { recursive: true });
test.describe.configure({ timeout: 300_000 });

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

async function boot(page: Page, { idle = false } = {}): Promise<void> {
  await page.goto(`./?notitle&nosave&fresh&manual${idle ? '&idle' : ''}`);
  await page.waitForFunction(() => !!window.kq?.court && !!window.kq?.npc && !!window.kq?.travel, null, { timeout: 180_000 });
  await page.evaluate(() => {
    const k = window.kq!;
    const w = window as unknown as { rec: Rec };
    w.rec = [];
    k.ctx.events.onAny((n, p) => {
      if (n.startsWith('court:') || n === 'npc:yaw' || n === 'player:costume' || n === 'story:cue' || n === 'shift:done') {
        w.rec.push({ n, p: JSON.parse(JSON.stringify(p ?? null)) });
      }
    });
    k.story?.look('day');
    if (k.ctx.era.current !== '1789') k.setEra('1789');
    k.step(2);
  });
}

async function events(page: Page, name: string): Promise<unknown[]> {
  return page.evaluate((n) => (window as unknown as { rec: Rec }).rec.filter((e) => e.n === n).map((e) => e.p), name);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SCREENS}/court-${name}.png` });
}

const court = (page: Page) => page.evaluate(() => window.kq!.court!.state());
const subs = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.kq-subtitles .line')].map((e) => e.textContent ?? ''));
const step = (page: Page, n: number) => page.evaluate((n) => window.kq!.step(n), n);
const setFlags = (page: Page, f: Record<string, boolean>) =>
  page.evaluate((f) => {
    const k = window.kq!;
    k.ctx.state.update((s) => {
      for (const [key, v] of Object.entries(f)) {
        if (v) s.flags[key] = true;
        else delete s.flags[key];
      }
    }, 'e2e');
  }, f);

/** A Gardist in the Ehrenhof, 10 m east of the court's centre, looking west at it. */
const COURT_WATCHER = { npc: 'gardist', x: 1222, z: -1116, era: '1789', yaw: 270, watch: { fov: 70, range: 14, set: 'test', who: 'Ein Gardist' } };
/** The gate's inspector, just inside the gitter, looking out (west). */
const GATE = { npc: 'gardist-tor', x: 1194.6, z: -1114.6, era: '1789', yaw: 270, watch: { fov: 70, range: 12, set: 'test', inspector: true, who: 'Ein Gardist' } };

async function spawn(page: Page, p: unknown): Promise<void> {
  await page.evaluate((p) => {
    const k = window.kq!;
    k.npc!.spawn(p as never);
    k.court!.on('test');
    k.step(2);
  }, p);
}

async function place(page: Page, x: number, z: number, yaw: number, pitch = -8): Promise<void> {
  await page.evaluate(
    ({ x, z, yaw, pitch }) => {
      const k = window.kq!;
      k.teleport(x, z, yaw, pitch);
      k.step(3);
      k.court!.set(0);
      k.step(1);
    },
    { x, z, yaw, pitch },
  );
}

/** HP, oil, XP, level, era — what an ejection must not touch. */
async function lossless(page: Page): Promise<string> {
  return page.evaluate(() => {
    const s = window.kq!.state();
    const sys = s.systems as Record<string, unknown>;
    const combat = sys.combat as { hp?: number; stamina?: number; bann?: number } | undefined;
    return JSON.stringify({ era: s.era, hp: combat?.hp, bann: combat?.bann, hunt: sys.hunt ?? null, progression: sys.progression ?? null, items: s.inventory.items });
  });
}

test('court: holding Q through the escort fade lets the player walk after the reduced-motion shift', async ({ page }) => {
  await boot(page, { idle: true }); // Advance the shift on fixed steps under WebDriver.
  await setFlags(page, { 'disguise.coat': true });
  await spawn(page, COURT_WATCHER);
  await place(page, 1212, -1116, 0);
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.settings.update((s) => (s.reducedMotion = true), 'reducedMotion');
    k.ctx.input.simulate('KeyQ', true);
    k.step(60);
    k.ctx.events.emit('court:take', {});
    k.step(1);
  });
  expect((await court(page)).ejecting).toBe(true);
  const duringShift = await page.evaluate(() => {
    const k = window.kq!;
    k.step(24);
    k.ctx.input.simulate('KeyQ', false);
    return { escorting: k.court!.state().ejecting, frozen: k.ctx.player.frozen, era: k.ctx.era.current };
  });
  expect(duringShift).toEqual({ escorting: false, frozen: true, era: '1789' });
  await step(page, 90);
  expect(await events(page, 'shift:done')).toEqual([{ from: '1789', to: 'today', reason: 'return' }]);
  expect(await events(page, 'court:ejected')).toEqual([]);
  const walked = await page.evaluate(() => {
    const k = window.kq!;
    const { x, z } = k.ctx.player.position;
    k.press('KeyS', 30); // Walk away from the trough the player faces after returning.
    return Math.hypot(k.ctx.player.position.x - x, k.ctx.player.position.z - z);
  });
  expect(walked).toBeGreaterThan(0.5);
});

test('court: a watcher sees the hi-vis vest — meter, caption, lossless ejection with the first-time hint', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await spawn(page, COURT_WATCHER);
  await place(page, 1212, -1116, 75);
  const before = await lossless(page);
  let st = await court(page);
  expect(st.zone).toBe('court.ehrenhof');
  expect(st.on).toBe(true);
  expect(st.coat).toBe(false);
  // 0.5 s in view: Blick (hi-vis fills in 1.2 s at ≤ 10 m)
  await step(page, 30);
  st = await court(page);
  expect(st.stage).toBe('blick');
  expect(st.meter).toBe(true);
  await expect(page.getByTestId('court-meter')).toBeVisible();
  expect((await subs(page)).some((l) => l.includes('Ein Gardist sieht herüber') && l.includes('die Warnweste'))).toBe(true);
  // the head turns to the player (npc:yaw)
  expect((await events(page, 'npc:yaw')).length).toBeGreaterThan(0);
  await shot(page, 'blick-meter-fan-caption');
  // Misstrauen: a barked line
  await step(page, 22);
  st = await court(page);
  expect(st.stage).toBe('misstrauen');
  await shot(page, 'misstrauen');
  // Aufgefallen → the fade → outside the gitter
  await step(page, 20);
  st = await court(page);
  expect(st.ejecting).toBe(true);
  await step(page, 40);
  const p = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
  expect(Math.hypot(p.x - 1180, p.z + 1112)).toBeLessThan(1.5);
  st = await court(page);
  expect(st.ejected).toBe(1);
  expect(st.max).toBe(0);
  expect(st.zone).toBeNull();
  const ej = (await events(page, 'court:ejected')) as { zone: string; n: number; tell: string }[];
  expect(ej).toEqual([{ zone: 'court.ehrenhof', n: 1, tell: 'hivis' }]);
  // the first ejection explains itself
  await expect(page.getByTestId('court-hint')).toBeVisible();
  await expect(page.getByTestId('court-hint')).toContainText('die Warnweste');
  await shot(page, 'first-hint');
  await page.getByTestId('court-hint').getByRole('button', { name: 'Verstanden' }).click();
  await step(page, 40);
  expect(await lossless(page)).toBe(before);
  expect(await page.evaluate(() => window.kq!.ctx.player.frozen)).toBe(false);
  // a second ejection brings no card
  await place(page, 1212, -1116, 75);
  await step(page, 140);
  st = await court(page);
  expect(st.ejected).toBe(2);
  expect(await page.getByTestId('court-hint').count()).toBe(0);
  expect(await lossless(page)).toBe(before);
  expect(errors).toEqual([]);
});

test('court: running and the staff are tells; in the coat walking is not', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await spawn(page, COURT_WATCHER);
  await setFlags(page, { 'disguise.coat': true });
  // walking calmly across the fan in the coat: nothing
  await place(page, 1213, -1121, 180);
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.input.simulate('KeyW', true);
    k.step(60);
    k.ctx.input.simulate('KeyW', false);
  });
  let st = await court(page);
  expect(st.max).toBe(0);
  // running across it
  await place(page, 1213, -1121, 180);
  const run = await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.input.simulate('KeyW', true);
    k.ctx.input.simulate('ShiftLeft', true);
    let top = 0;
    let peak = 0;
    const log: string[] = [];
    for (let i = 0; i < 70; i++) {
      k.step(1);
      top = Math.max(top, k.ctx.player.stats.speed);
      const w = k.court!.watchers()[0]!;
      peak = Math.max(peak, w.level);
      const p = k.ctx.player.position;
      if (i % 7 === 0) log.push(`${i}: v=${k.ctx.player.stats.speed.toFixed(2)} lvl=${w.level.toFixed(2)} sees=${w.sees} zone=${k.court!.state().zone} p=${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    }
    k.ctx.input.simulate('KeyW', false);
    k.ctx.input.simulate('ShiftLeft', false);
    return { top, peak, log, w: k.court!.watchers()[0]! };
  });
  console.log('[court] run', JSON.stringify(run, null, 1));
  expect(run.top).toBeGreaterThanOrEqual(4.8);
  expect(run.w.level).toBeGreaterThan(0.35);
  expect(run.w.tell).toBe('running');
  expect((await subs(page)).some((l) => l.includes('du rennst'))).toBe(true);
  await shot(page, 'running');
  // the staff (lock-on / charge): +1.0/s
  await place(page, 1212, -1116, 90);
  await page.evaluate(() => {
    window.kq!.court!.signal('staff');
    window.kq!.step(30);
  });
  let w = (await page.evaluate(() => window.kq!.court!.watchers()))[0]!;
  expect(w.level).toBeGreaterThan(0.35);
  expect(w.tell).toBe('staff');
  expect((await subs(page)).some((l) => l.includes('der Stab in deiner Hand'))).toBe(true);
  // a blow struck in view: instant Aufgefallen
  await place(page, 1212, -1116, 90);
  await page.evaluate(() => {
    const k = window.kq!;
    k.combat?.hit(1);
    k.step(2);
  });
  st = await court(page);
  const swung = (await page.evaluate(() => window.kq!.combat?.events().some((e) => e.name === 'combat:swing'))) === true;
  if (!swung) {
    // no swing outside a fight in this build: the signal stands in for the blow
    await page.evaluate(() => {
      window.kq!.court!.signal('attack');
      window.kq!.step(2);
    });
    st = await court(page);
  }
  expect(st.ejecting || st.ejected > 0).toBe(true);
  await step(page, 60);
  w = (await page.evaluate(() => window.kq!.court!.watchers()))[0]!;
  expect(w.level).toBe(0);
  expect(errors).toEqual([]);
});

test('court: the gate inspection — no letter refused, no coat ejected, running in the ring ejected, a pass opens the gate', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await spawn(page, GATE);
  await setFlags(page, { 'disguise.coat': true });
  // the inspector's calm fan on the light stone outside the gate (readability check)
  await place(page, 1181, -1114.5, 82, -16);
  await step(page, 4);
  await shot(page, 'inspector-calm-fan');
  // outside the gitter, 3.5 m from the inspector: E "Brief vorzeigen"
  await place(page, 1191, -1114.2, 80);
  let st = await court(page);
  expect(st.zone).toBeNull();
  expect(st.inspector).toBe('gardist-tor');
  expect(await page.evaluate(() => document.querySelector('.kq-prompt')?.textContent ?? '')).toContain('Brief vorzeigen');
  await shot(page, 'inspect-prompt');
  // hold E for a second without a letter: refused, not ejected
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.input.simulate('KeyE', true);
    k.step(66);
    k.ctx.input.simulate('KeyE', false);
    k.step(2);
  });
  expect(await events(page, 'court:refused')).toEqual([{ reason: 'letter', watcher: 'gardist-tor' }]);
  st = await court(page);
  expect(st.ejected).toBe(0);
  expect(st.ejecting).toBe(false);
  // no conversation opened on that E
  expect(await page.evaluate(() => window.kq!.npc!.state().open)).toBe(false);
  // no coat: ejected
  await setFlags(page, { 'disguise.coat': false, 'disguise.letter': true });
  expect(await page.evaluate(() => window.kq!.court!.inspect())).toBe('eject');
  await step(page, 70);
  st = await court(page);
  expect(st.ejected).toBe(1);
  await page.evaluate(() => (window.kq!.ctx.ui.modals as unknown as { closeAll(): void }).closeAll());
  // coat and letter, but running during the ring: ejected
  await setFlags(page, { 'disguise.coat': true });
  await place(page, 1189.6, -1118, 180);
  expect(await page.evaluate(() => window.kq!.court!.inspect('gardist-tor'))).toBe('ring');
  await step(page, 2);
  await shot(page, 'ring');
  const ringRun = await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.input.simulate('KeyW', true);
    k.ctx.input.simulate('ShiftLeft', true);
    const log: string[] = [];
    for (let i = 0; i < 80; i++) {
      k.step(1);
      const s = k.court!.state();
      const w = k.court!.watchers()[0];
      const p = k.ctx.player.position;
      if (i % 8 === 0) log.push(`${i}: v=${k.ctx.player.stats.speed.toFixed(2)} lvl=${w?.level.toFixed(2)} sees=${w?.sees} ring=${s.ring} ej=${s.ejecting} p=${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    }
    k.ctx.input.simulate('KeyW', false);
    k.ctx.input.simulate('ShiftLeft', false);
    return log;
  });
  console.log('[court] ring run', JSON.stringify(ringRun, null, 1));
  st = await court(page);
  expect(st.ejected).toBe(2);
  expect(st.admitted).toBe(false);
  await step(page, 40);
  // standing still through the ring: through
  await place(page, 1191, -1114.2, 80);
  expect(await page.evaluate(() => window.kq!.court!.inspect())).toBe('ring');
  await step(page, 160);
  st = await court(page);
  expect(st.admitted).toBe(true);
  expect(st.ejected).toBe(2);
  expect(await events(page, 'court:admitted')).toEqual([{ watcher: 'gardist-tor' }]);
  const cues = (await events(page, 'story:cue')) as { id: string; data?: { open?: boolean } }[];
  expect(cues.some((c) => c.id === 'scenery:gate' && c.data?.open === true)).toBe(true);
  expect(await page.evaluate(() => (window.kq!.state().systems.scenery as { gate?: number } | undefined)?.gate)).toBe(1);
  // admitted: no more inspection prompt
  await step(page, 4);
  expect((await court(page)).inspector).toBeNull();
  await shot(page, 'gate-open');
  expect(errors).toEqual([]);
});

test('court: the costume follows the coat and the era; fast travel lands outside until admitted', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  const costume = () => page.evaluate(() => window.kq!.avatar?.costume());
  await step(page, 2);
  expect(await costume()).toBe('default');
  await setFlags(page, { 'disguise.coat': true });
  await step(page, 2);
  expect(await costume()).toBe('court');
  await page.evaluate(() => {
    window.kq!.setEra('today');
    window.kq!.step(2);
  });
  expect(await costume()).toBe('default');
  await page.evaluate(() => {
    window.kq!.setEra('1789');
    window.kq!.step(2);
  });
  expect(await costume()).toBe('court');
  const sent = (await events(page, 'player:costume')) as { costume: string }[];
  expect(sent.map((c) => c.costume).slice(-3)).toEqual(['court', 'default', 'court']);
  // fast travel to the Ehrenhof while the court watches and you are not admitted: outside the gitter
  await spawn(page, GATE);
  await page.evaluate(() => {
    const k = window.kq!;
    k.travel!.go('ehrenhof', true);
    k.step(4);
  });
  let p = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
  expect(Math.hypot(p.x - 1180, p.z + 1112)).toBeLessThan(1.5);
  await expect(page.locator('.kq-toast', { hasText: 'vor dem Gitter' })).toBeVisible();
  // admitted: the tripod as before
  await setFlags(page, { 'court.admitted': true });
  await page.evaluate(() => {
    const k = window.kq!;
    k.travel!.go('ehrenhof', true);
    k.step(4);
  });
  p = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
  expect(Math.hypot(p.x - 1232.2, p.z + 1124.8)).toBeLessThan(1.5);
  // every zone exit is a place to stand in 1789: on the ground, not steep, not inside a building
  const exits = await page.evaluate(() => {
    const k = window.kq!;
    const w = k.ctx.world;
    return k.court!.zones().map((z) => {
      const h = (dx: number, dz: number) => w.heightAt(z.exit.x + dx, z.exit.z + dz);
      const slope = Math.max(Math.abs(h(1.5, 0) - h(-1.5, 0)), Math.abs(h(0, 1.5) - h(0, -1.5))) / 3;
      k.teleport(z.exit.x, z.exit.z, z.exit.yaw, 0);
      k.step(6);
      const pl = k.ctx.player.position;
      return { id: z.id, slope, moved: Math.hypot(pl.x - z.exit.x, pl.z - z.exit.z), y: pl.y, ground: h(0, 0) };
    });
  });
  console.log('[court] exits', JSON.stringify(exits));
  for (const e of exits) {
    expect(e.slope, e.id).toBeLessThan(0.45);
    expect(e.moved, e.id).toBeLessThan(0.6);
    expect(Math.abs(e.y - e.ground), e.id).toBeLessThan(0.6);
  }
  expect(errors).toEqual([]);
});
