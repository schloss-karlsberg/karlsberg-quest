import { mkdirSync, writeFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { trackErrors } from './helpers/common';
import { waitForHooks } from './helpers/pause';
import { expectHandover } from './helpers/tour';

/**
 * The tour (content/story/00-tour.story.json, the opening of a new game): a smoke run from the
 * car park to the shift to 1789 and the hand-over into chapter 1. The player keeps behind the guide by debug teleports (as a player
 * walking along would be), talks to Gerold, crouches for a 2× deer photo from about 23 m,
 * steps to the trough and touches the water. Game seconds per beat are written to
 * test-results/tour/timings.json (the walking pace is the group's, so they approximate a player who
 * keeps up and does not dawdle). Screenshots: test-results/tour/tour-*.png.
 */
const OUT = 'test-results/tour';
mkdirSync(OUT, { recursive: true });
test.describe.configure({ timeout: 600_000 });

type K = NonNullable<typeof window.kq>;
const beat = (page: Page) => page.evaluate(() => window.kq!.story!.state().beat as string);
const time = (page: Page) => page.evaluate(() => window.kq!.ctx.loop.time);
const shown = (page: Page, pattern: string) =>
  page.evaluate((prefix) => window.kq!.story!.shown().filter((id) => id.startsWith(prefix)), pattern);

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${OUT}/tour-${name}.png` });
}

const ORDER = [...Array.from({ length: 18 }, (_, i) => `t${i + 1}`), 'k1_0'];
const beatsSoFar = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { tourRec?: { n: string; p: { beat?: string }; t: number }[] }).tourRec
      ?.filter((r) => r.n === 'story:beat')
      .map((r) => `${r.p.beat}@${r.t.toFixed(1)}`)
      .join(' '),
  );

/** Step game time (1 s per call) until the beat is `id` (or later: logged), keeping the player behind the guide. */
async function follow(page: Page, id: string, maxS = 240, behind = 4): Promise<void> {
  for (let s = 0; s < maxS; s++) {
    const b = await beat(page);
    if (b === id) return;
    if (ORDER.indexOf(b) > ORDER.indexOf(id)) {
      console.log(`[tour] wanted ${id}, already at ${b}; beats ${await beatsSoFar(page)}`);
      return;
    }
    await page.evaluate((b) => {
      const k = window.kq! as K;
      const g = k.walk!.list().find((n) => n.npc === 'imhoff');
      if (g) {
        const fx = -Math.sin(g.yaw);
        const fz = -Math.cos(g.yaw);
        const p = k.ctx.player.position;
        // only when the player fell behind (a fade or a stop keeps the player where the story put them)
        if (Math.hypot(p.x - g.x, p.z - g.z) > 12) k.teleport(g.x - fx * b, g.z - fz * b, (-g.yaw * 180) / Math.PI, -6);
      }
      // dialogue cards and centre cards never block the run
      k.story!.finishTyping();
      k.step(60);
    }, behind);
  }
  throw new Error(`beat ${id} not reached (at ${await beat(page)}); beats ${await beatsSoFar(page)}`);
}

/** Third-person view onto the group: the player stands `d` m ahead of the guide, looking back. */
async function viewGroup(page: Page, d = 10): Promise<void> {
  await page.evaluate((dd) => {
    const k = window.kq!;
    const g = k.walk!.list().find((n) => n.npc === 'imhoff')!;
    const fx = -Math.sin(g.yaw);
    const fz = -Math.cos(g.yaw);
    k.teleport(g.x + fx * dd - fz * 2.5, g.z + fz * dd + fx * 2.5, ((Math.PI - g.yaw) * 180) / Math.PI + 10, -6);
    k.step(2);
  }, d);
}

test('tour: car park → Felsenpfad → wind and dogs → the deer photo → Weiher → Quelle → 1789 → chapter 1', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./?notitle&nosave&fresh&manual');
  try {
    await waitForHooks(page, ['story', 'walk', 'npc', 'photo', 'animals', 'progression', 'cinematic'], 120_000);
    await page.waitForFunction(() => {
      window.kq!.step(1);
      return window.kq!.animals?.ready === true;
    }, null, { timeout: 20_000 });
  } catch (e) {
    const have = await page.evaluate(() => Object.keys(window.kq ?? {}).join(','));
    console.log(`[tour] boot: kq has ${have}; errors ${JSON.stringify(errors)}`);
    throw e;
  }
  await page.evaluate(() => {
    const w = window as unknown as { tourRec: { n: string; p: unknown; t: number }[] };
    w.tourRec = [];
    const k = window.kq!;
    k.ctx.events.onAny((n, p) => {
      if (n === 'story:beat' || n.startsWith('animal:') || n === 'photo:good' || n === 'npc:arrived' || n === 'cinematic:end' || n === 'walk:bark' || n.startsWith('group:') || n.startsWith('shift:') || n.startsWith('quelle:'))
        w.tourRec.push({ n, p: JSON.parse(JSON.stringify(p ?? null)), t: k.ctx.loop.time });
    });
    k.story!.start('Testerin');
    k.step(30);
  });
  const t0 = await time(page);
  const s0 = await page.evaluate(() => window.kq!.story!.state());
  expect(s0.chapter).toBe('tour');
  expect(s0.beat).toBe('t1');
  // the animals system is the real one (main's animals system, kq.animals.ready), with the dogs at Jost's heels
  expect(await page.evaluate(() => window.kq!.animals?.ready)).toBe(true);
  await page.evaluate(() => window.kq!.step(120));
  expect(await page.evaluate(() => window.kq!.walk!.stats().bodies)).toBe(15);
  await shot(page, '01-treffpunkt');

  // t1 → t2: walk up to the group; t2: talk to Gerold (E)
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(526, -773, 215, -4);
    k.step(30);
  });
  await follow(page, 't2', 30);
  expect(await shown(page, 'imhoff.t.01')).toEqual(['imhoff.t.01', 'imhoff.t.01b']);
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 30 && !k.ctx.state.state.flags['tour.station1.ready']; i++) k.step(60);
    const g = k.walk!.list().find((n) => n.npc === 'imhoff')!;
    k.teleport(g.x + 1.6, g.z + 1.2, (Math.atan2(g.x - (g.x + 1.6), -(g.z - (g.z + 1.2))) * 180) / Math.PI, -4);
    k.step(10);
    k.press('KeyE', 2);
  });
  await expect.poll(() => page.evaluate(() => window.kq!.npc!.state().open), { timeout: 15_000 }).toBe(true);
  expect(await beat(page)).toBe('t2');
  await shot(page, '02-gerold-station1');
  const greeting = await page.evaluate(() => {
    const n = window.kq!.npc!;
    const ids = [];
    for (let i = 0; i < 6 && n.state().busy; i++) {
      ids.push(n.state().line?.id);
      n.finish();
      n.advance();
    }
    n.close();
    window.kq!.step(30);
    return ids;
  });
  expect(greeting).toEqual(['imhoff.t.station1', 'imhoff.t.station1a', 'imhoff.t.station1b']);
  await follow(page, 't3', 70);
  await follow(page, 't4', 120);
  // the fade: Gerold's line, black, the group warped to the Felsenpfad entry, the player behind it
  for (let i = 0; i < 20 && (await beat(page)) === 't4'; i++) await page.evaluate(() => window.kq!.step(30));
  await page.evaluate(() => window.kq!.step(60));
  await shot(page, '03-nach-der-abkuerzung');
  const p4 = await page.evaluate(() => window.kq!.ctx.player.position);
  expect(Math.hypot(p4.x - 623.4, p4.z + 485.9)).toBeLessThan(15);
  await follow(page, 't6', 200);
  await viewGroup(page);
  await shot(page, '04-felsenpfad-station2');
  await follow(page, 't8', 200);
  expect(await shown(page, 'imhoff.t.station2')).toEqual(['imhoff.t.station2', 'imhoff.t.station2a', 'imhoff.t.station2b', 'imhoff.t.station2c']);
  await page.evaluate(() => window.kq!.step(150));
  await expect(page.locator('.kq-subtitles').getByText('[Diane und Bijou bellen]')).toBeVisible();
  await shot(page, '05-wind-hunde');
  await follow(page, 't9', 60);
  await follow(page, 't10', 240);
  const tDeer0 = await time(page);
  expect(await page.evaluate(() => window.kq!.cinematic!.playing())).toBe('tour.reh');
  await expect(page.locator('.kq-subtitles').getByText('[Leises Rascheln im Laub]')).toBeVisible();
  await page.evaluate(() => window.kq!.step(180));
  await shot(page, '06-reh-sicht');
  await page.evaluate(() => window.kq!.step(181));
  expect(await page.evaluate(() => window.kq!.cinematic!.playing())).toBeNull();
  // The cinematic ends inside step(181). Its camera hand-back still holds the override slot (photo
  // blocked: 'scene') for HANDBACK_S of wall-clock time and only finishes on a drawn frame. Draw
  // frames without simulating, so the guide's lines do not advance while the camera settles.
  await page.waitForFunction(() => {
    const k = window.kq!;
    k.ctx.loop.requestRender();
    return k.photo!.state().blocked !== 'scene';
  });
  const instructions = await page.evaluate(() => {
    const k = window.kq!;
    const blocked = k.photo!.state().blocked;
    const opened = k.photo!.open();
    for (let i = 0; i < 20 && k.photo!.state().blocked === 'dialog'; i++) k.step(60);
    return { blocked, opened, ready: k.photo!.state().blocked === null, shown: k.story!.shown() };
  });
  expect(instructions).toMatchObject({ blocked: 'dialog', opened: false, ready: true });
  expect(instructions.shown.filter((id) => id === 'imhoff.t.reh1' || id === 'imhoff.t.reh2')).toEqual(['imhoff.t.reh1', 'imhoff.t.reh2']);
  const opened = await page.evaluate(() => {
    const k = window.kq!;
    const targets = k.photo!.targets();
    const ricke = targets.find((d) => d.id === 'reh.ricke')?.at;
    const kitz = targets.find((d) => d.id === 'reh.kitz')?.at;
    if (!ricke || !kitz) throw new Error('Both deer must be available for the tour photo');
    // Frame the pair from the route side at 23 m, with ordinary crouching and the 2× lens.
    const cx = (ricke.x + kitz.x) / 2;
    const cz = (ricke.z + kitz.z) / 2;
    const dx = 727.4 - cx;
    const dz = -751.5 - cz;
    const len = Math.hypot(dx, dz);
    const px = cx + (dx / len) * 23;
    const pz = cz + (dz / len) * 23;
    const cy = (ricke.y + kitz.y) / 2;
    const yaw = (Math.atan2(cx - px, pz - cz) * 180) / Math.PI;
    k.ctx.player.setStance('crouch');
    const pitch = (Math.atan2(cy - k.ctx.world.heightAt(px, pz) - 1.05, 23) * 180) / Math.PI;
    k.teleport(px, pz, yaw, pitch);
    k.step(20);
    const opened = k.photo!.open();
    k.photo!.zoom(2);
    k.step(40);
    return opened;
  });
  expect(opened).toBe(true);
  // A bullet-time step advances the simulation but only draws one frame of the zoom animation.
  const scale = await page.evaluate(() => {
    const { loop, player: { rig } } = window.kq!.ctx;
    const fixedDt = loop.dt;
    for (let i = 0; i < 32 && rig.fovScale !== 2; i++) loop.renderOnce(fixedDt);
    return rig.fovScale;
  });
  expect(scale).toBe(2);
  const judge = await page.evaluate(() => window.kq!.photo!.judge('reh.ricke'));
  expect(judge, JSON.stringify(judge)).toMatchObject({ good: true, stars: 2 });
  expect(judge!.dist).toBeGreaterThanOrEqual(20);
  expect(judge!.dist).toBeLessThanOrEqual(25);
  await shot(page, '07-reh-handy');
  const res = await page.evaluate(() => window.kq!.photo!.shoot());
  expect(res, JSON.stringify(res)).toMatchObject({ good: ['reh.ricke', 'reh.kitz'], stars: 2 });
  const reaction = await page.evaluate(() => {
    const k = window.kq!;
    const praise = ['imhoff.t.reh3', 'imhoff.t.reh.alert'];
    const master = k.ctx.audio.volumes.master;
    k.ctx.audio.setVolumes({ master: 0 });
    let viewfinderUp: boolean | null = null;
    let reopened: boolean | null = null;
    const off = k.ctx.events.on('dialogue:say', ({ id }) => {
      if (id && praise.includes(id)) {
        viewfinderUp = k.photo!.state().open;
        reopened = k.photo!.open();
      }
    });
    k.step(900);
    off();
    k.ctx.audio.setVolumes({ master });
    k.ctx.player.setStance('stand');
    return { viewfinderUp, reopened, shown: k.story!.shown().some((id) => praise.includes(id)) };
  });
  expect(reaction).toEqual({ viewfinderUp: false, reopened: false, shown: true });
  expect(await page.evaluate(() => window.kq!.photo!.has('reh.ricke'))).toBe(true);
  const tDeer = await time(page);
  await follow(page, 't12', 120);
  const staffVisible = () => page.evaluate(() => window.kq!.ctx.scene.getObjectByName('player-staff')?.visible === true);
  expect(await staffVisible()).toBe(false);
  await shot(page, '08-damm');
  // The grant runs on entry to t13, inside a kq.step, and the feed line expires on wall time
  // (4.2 s, and a fourth line pushes it out): polling the DOM for it raced the steps on a loaded
  // machine. Record each feed line as it is added, with whether it is visible right then.
  await page.evaluate(() => {
    const w = window as unknown as { feedSeen: { text: string; visible: boolean }[] };
    w.feedSeen = [];
    const dock = document.querySelector('[data-testid="hud-feed-lines"]')!;
    new MutationObserver((muts) => {
      for (const m of muts)
        for (const n of m.addedNodes)
          if (n instanceof HTMLElement && n.dataset.testid === 'feed-line')
            w.feedSeen.push({ text: n.querySelector('.kqp-line-text')?.textContent ?? '', visible: n.checkVisibility() });
    }).observe(dock, { childList: true });
  });
  await follow(page, 't13', 120);
  const feedSeen = await page.evaluate(() => (window as unknown as { feedSeen: { text: string; visible: boolean }[] }).feedSeen);
  expect(feedSeen, JSON.stringify(feedSeen)).toContainEqual({ text: '+ Messstab', visible: true });
  expect(await beat(page)).toBe('t13');
  const progression = await page.evaluate(() => window.kq!.progression!.state());
  expect(progression.inventory['item.stab.esche']).toBe(1);
  expect(progression.equipped.weapon).toBe('item.stab.esche');
  await viewGroup(page);
  expect(await staffVisible()).toBe(true);
  await shot(page, '09-weiher-station3');
  await page.evaluate(() => {
    const k = window.kq!;
    for (let i = 0; i < 20 && k.story!.state().dialogue?.id !== 'imhoff.t.station3'; i++) k.step(60);
  });
  for (const id of ['imhoff.t.station3', 'imhoff.t.station3a', 'imhoff.t.station3b', 'imhoff.t.station3c']) {
    expect(await beat(page)).toBe('t13');
    expect(await page.evaluate(() => window.kq!.story!.state().dialogue?.id)).toBe(id);
    await page.evaluate(() => window.kq!.story!.finishTyping());
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.kq!.step(1));
  }
  expect(await beat(page)).toBe('t14');
  // round 2 (owner: lost the group): on the way up to the Quelle the player falls 45 m behind and
  // stays: Gerold waits (leash), shows on the compass, calls once; a minute on, „Zur Gruppe“ (hold Q)
  await follow(page, 't14', 120);
  await page.evaluate(() => window.kq!.step(240));
  const tStray0 = await time(page);
  await page.evaluate(() => {
    const k = window.kq!;
    const g = k.walk!.list().find((n) => n.npc === 'imhoff')!;
    const fx = -Math.sin(g.yaw);
    const fz = -Math.cos(g.yaw);
    k.teleport(g.x - fx * 45, g.z - fz * 45, (-g.yaw * 180) / Math.PI + 150, -4);
    k.step(60);
  });
  for (let i = 0; i < 20 && !(await page.evaluate(() => window.kq!.walk!.find().called)); i++) await page.evaluate(() => (window.kq!.story!.finishTyping(), window.kq!.step(60)));
  const stray = await page.evaluate(() => ({ find: window.kq!.walk!.find(), walker: window.kq!.walk!.walker('imhoff') }));
  console.log(`[tour] stray: ${JSON.stringify(stray)}`);
  expect(stray.walker!.waiting).toBe(true);
  expect(stray.find.marker).toBe(true);
  expect(stray.find.called).toBe(true);
  await shot(page, '09b-gruppe-verloren');
  for (let i = 0; i < 80 && !(await page.evaluate(() => window.kq!.walk!.find().prompt)); i++) await page.evaluate(() => (window.kq!.story!.finishTyping(), window.kq!.step(60)));
  expect(await page.evaluate(() => window.kq!.walk!.find().prompt)).toBe(true);
  await page.waitForTimeout(800);
  await shot(page, '09c-zur-gruppe');
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.input.simulate('KeyQ', true);
    k.step(90);
    k.ctx.input.simulate('KeyQ', false);
    k.step(90);
  });
  const back = await page.evaluate(() => {
    const k = window.kq!;
    const g = k.walk!.list().find((n) => n.npc === 'imhoff')!;
    const p = k.ctx.player.position;
    return { dist: Math.hypot(p.x - g.x, p.z - g.z), era: k.ctx.era.current };
  });
  console.log(`[tour] back with the group: ${JSON.stringify(back)}`);
  expect(back.dist).toBeLessThan(30);
  expect(back.era).toBe('today');
  const strayS = (await time(page)) - tStray0;
  await follow(page, 't15', 240);
  await viewGroup(page, 8);
  await shot(page, '10-quelle-station4');
  await follow(page, 't16', 90);
  expect(await shown(page, 'imhoff.t.station4')).toEqual(['imhoff.t.station4', 'imhoff.t.station4a', 'imhoff.t.station4b', 'imhoff.t.station4c']);
  expect(await shown(page, 'imhoff.t.pause')).toEqual(['imhoff.t.pause']);
  // the break: alone at the trough
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1059.3, -833.1, 50, -10);
    k.step(60);
  });
  for (let i = 0; i < 40 && (await beat(page)) !== 't17'; i++) await page.evaluate(() => window.kq!.step(60));
  expect(await beat(page)).toBe('t17');
  await expect(page.locator('.kq-subtitles').getByText('[Messing klirrt auf Stein]')).toBeVisible();
  await page.evaluate(() => window.kq!.step(240));
  await shot(page, '11-bussole-laub');
  expect(await page.evaluate(() => window.kq!.state().flags['story.compass'])).toBe(true);
  expect(await page.evaluate(() => window.kq!.walk!.stats().bodies)).toBe(0);
  // Laub's lines run, then the hand into the water (the Quelle's own E)
  for (let i = 0; i < 60 && !(await page.evaluate(() => window.kq!.quelle!.info().prompt)); i++) await page.evaluate(() => (window.kq!.story!.finishTyping(), window.kq!.step(60)));
  const tTouch = await time(page);
  await page.evaluate(() => window.kq!.press('KeyE', 2));
  for (let i = 0; i < 30 && (await beat(page)) !== 't18'; i++) await page.evaluate(() => window.kq!.step(30));
  expect(await beat(page)).toBe('t18');
  // under webdriver the era shift runs on frame time, not on kq.step (core/bullet.ts): scrub it
  // through like e2e/fx.spec.ts, then let the story see shift:done
  await page.evaluate(() => {
    const k = window.kq!;
    k.step(10);
    k.fx!.shiftAt(1.9);
    k.fx!.shiftAt(3.6);
  });
  for (let i = 0; i < 10 && (await page.evaluate(() => window.kq!.story!.state().era)) !== '1789'; i++) await page.evaluate(() => window.kq!.step(60));
  const era = await page.evaluate(() => window.kq!.story!.state().era);
  if (era !== '1789') {
    const tail = await page.evaluate(() =>
      (window as unknown as { tourRec: { n: string; p: unknown; t: number }[] }).tourRec
        .filter((r) => r.n !== 'walk:bark')
        .slice(-14)
        .map((r) => `${r.n}${JSON.stringify(r.p)}@${r.t.toFixed(1)}`),
    );
    console.log(`[tour] no shift: era ${era}, ctx era ${await page.evaluate(() => window.kq!.ctx.era.current)}; last events ${tail.join(' | ')}`);
  }
  expect(era).toBe('1789');
  await page.evaluate(() => window.kq!.step(300));
  await shot(page, '12-1789');
  // a look round in 1789, then the hand-over into chapter 1 (no „Fortsetzung folgt“)
  for (let i = 0; i < 80 && (await page.evaluate(() => window.kq!.story!.state().chapter)) === 'tour'; i++) await page.evaluate(() => (window.kq!.story!.finishTyping(), window.kq!.step(60)));
  const s1 = await page.evaluate(() => window.kq!.story!.state());
  expect(s1.completed).toContain('tour');
  expect(s1.chapter).toBe('k1');
  expect(s1.beat).toBe('k1_0');
  await expectHandover(page);
  // the deer photo is a tour-only extra on top
  expect(await page.evaluate(() => window.kq!.photo!.has('reh.ricke'))).toBe(true);
  await page.evaluate(() => window.kq!.step(120));
  await shot(page, '13-k1-start');

  const rec = await page.evaluate(() => (window as unknown as { tourRec: { n: string; p: { beat?: string }; t: number }[] }).tourRec);
  const beats = rec.filter((r) => r.n === 'story:beat').map((r) => ({ beat: r.p.beat, t: +(r.t - t0).toFixed(1) }));
  const out = { beats, deerStart: +(tDeer0 - t0).toFixed(1), deerPhoto: +(tDeer - t0).toFixed(1), touch: +(tTouch - t0 - strayS).toFixed(1), strayS: +strayS.toFixed(1), barks: rec.filter((r) => r.n === 'walk:bark').map((r) => (r.p as unknown as { id: string }).id) };
  writeFileSync(`${OUT}/timings.json`, JSON.stringify(out, null, 2));
  console.log(`[tour] timings ${JSON.stringify(out)}`);
  expect(errors).toEqual([]);
});
