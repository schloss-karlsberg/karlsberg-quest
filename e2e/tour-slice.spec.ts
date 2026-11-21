import { mkdirSync, writeFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { trackErrors } from './helpers/common';

/**
 * Tour slice v0 (content/story/00-tour.story.json, dev entry `?tour`): a smoke run from the car
 * park to the shift to 1789. The player keeps behind the guide by debug teleports (as a player
 * walking along would be), talks to Gerold, takes the deer photo from 12 m (calm via
 * kq.animals), steps to the trough and touches the water. Game seconds per beat are written to
 * test-results/tour/timings.json (the walking pace is the group's, so they approximate a player who
 * keeps up and does not dawdle). Screenshots: test-results/tour/tour-*.png.
 */
const OUT = 'test-results/tour';
mkdirSync(OUT, { recursive: true });
test.describe.configure({ timeout: 600_000 });

type K = NonNullable<typeof window.kq>;
const beat = (page: Page) => page.evaluate(() => window.kq!.story!.state().beat as string);
const time = (page: Page) => page.evaluate(() => window.kq!.ctx.loop.time);

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.kq!.screenshotReady());
  await page.screenshot({ path: `${OUT}/tour-${name}.png` });
}

const ORDER = Array.from({ length: 18 }, (_, i) => `t${i + 1}`);
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

test('tour slice v0: car park → Felsenpfad → wind and dogs → the deer photo → Weiher → Quelle → 1789', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./?notitle&nosave&fresh&manual&tour');
  try {
    await page.waitForFunction(() => !!window.kq?.story && !!window.kq?.walk && !!window.kq?.npc, null, { timeout: 120_000 });
    // photo mode publishes its hooks on its first update (none run in ?manual until a step)
    await page.evaluate(() => window.kq!.step(2));
    await page.waitForFunction(() => !!window.kq?.photo && !!window.kq?.animals, null, { timeout: 20_000 });
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
      if (n === 'story:beat' || n.startsWith('animal:') || n === 'photo:good' || n === 'npc:arrived' || n === 'cinematic:end' || n === 'walk:bark' || n.startsWith('shift:') || n.startsWith('quelle:'))
        w.tourRec.push({ n, p: JSON.parse(JSON.stringify(p ?? null)), t: k.ctx.loop.time });
    });
    k.story!.start('Testerin');
    k.step(30);
  });
  const t0 = await time(page);
  const s0 = await page.evaluate(() => window.kq!.story!.state());
  expect(s0.chapter).toBe('tour');
  expect(s0.beat).toBe('t1');
  // the animals system is the real one (tour/animals-system), with the dogs at Jost's heels
  expect(await page.evaluate(() => !!window.kq!.animals)).toBe(true);
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
  await page.evaluate(() => {
    const k = window.kq!;
    const g = k.walk!.list().find((n) => n.npc === 'imhoff')!;
    k.teleport(g.x + 1.6, g.z + 1.2, (Math.atan2(g.x - (g.x + 1.6), -(g.z - (g.z + 1.2))) * 180) / Math.PI, -4);
    k.step(10);
    k.press('KeyE', 2);
  });
  await expect.poll(() => page.evaluate(() => window.kq!.npc!.state().open), { timeout: 15_000 }).toBe(true);
  await shot(page, '02-gerold-station1');
  await page.evaluate(() => {
    const n = window.kq!.npc!;
    for (let i = 0; i < 40 && n.state().busy; i++) n.drain();
    n.close();
    window.kq!.step(30);
  });
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
  await page.evaluate(() => window.kq!.step(150));
  await shot(page, '05-wind-hunde');
  await follow(page, 't9', 60);
  await follow(page, 't10', 240);
  const tDeer0 = await time(page);
  await shot(page, '06-reh-sicht');
  // the deer are there, off the route, and the photo works from 12 m (calm: no flight on teleport)
  const deer = await page.evaluate(() => window.kq!.animals!.list());
  const ricke = deer.find((d) => d.id === 'ricke')!;
  expect(ricke).toBeTruthy();
  expect(deer.find((d) => d.id === 'kitz')).toBeTruthy();
  const shotRes = await page.evaluate(
    ({ x, z }) => {
      const k = window.kq!;
      k.animals!.calm('ricke', 60);
      k.animals!.calm('kitz', 60);
      const s = k.animals!.list().find((d) => d.id === 'ricke')!;
      const kz = k.animals!.list().find((d) => d.id === 'kitz')!;
      // 12 m from the pair, on the side towards the route stop, crouched, looking at their middle
      const cx = (s.x + kz.x) / 2;
      const cz = (s.z + kz.z) / 2;
      const dx = 727.4 - cx;
      const dz = -751.5 - cz;
      const l = Math.hypot(dx, dz);
      const px = cx + (dx / l) * 12;
      const pz = cz + (dz / l) * 12;
      const yaw = (Math.atan2(cx - px, -(cz - pz)) * 180) / Math.PI;
      k.teleport(px, pz, yaw, -4);
      k.ctx.player.setStance('crouch');
      k.step(20);
      k.photo!.open();
      k.step(40);
      return { judge: k.photo!.judge('reh.ricke'), at: { x, z } };
    },
    { x: ricke.x, z: ricke.z },
  );
  console.log(`[tour] deer judge ${JSON.stringify(shotRes.judge)}`);
  await shot(page, '07-reh-handy');
  const res = await page.evaluate(() => window.kq!.photo!.shoot());
  console.log(`[tour] deer shot ${JSON.stringify(res)}`);
  await page.evaluate(() => {
    const k = window.kq!;
    k.step(30);
    k.photo!.close();
    k.ctx.player.setStance('stand');
  });
  expect(await page.evaluate(() => window.kq!.photo!.has('reh.ricke'))).toBe(true);
  const tDeer = await time(page);
  await follow(page, 't12', 120);
  await shot(page, '08-damm');
  await follow(page, 't13', 120);
  await viewGroup(page);
  await shot(page, '09-weiher-station3');
  await follow(page, 't15', 240);
  await viewGroup(page, 8);
  await shot(page, '10-quelle-station4');
  await follow(page, 't16', 90);
  // the break: alone at the trough
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1059.3, -833.1, 50, -10);
    k.step(60);
  });
  for (let i = 0; i < 40 && (await beat(page)) !== 't17'; i++) await page.evaluate(() => window.kq!.step(60));
  expect(await beat(page)).toBe('t17');
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
  await shot(page, '12-1789-fortsetzung');

  const rec = await page.evaluate(() => (window as unknown as { tourRec: { n: string; p: { beat?: string }; t: number }[] }).tourRec);
  const beats = rec.filter((r) => r.n === 'story:beat').map((r) => ({ beat: r.p.beat, t: +(r.t - t0).toFixed(1) }));
  const out = { beats, deerStart: +(tDeer0 - t0).toFixed(1), deerPhoto: +(tDeer - t0).toFixed(1), touch: +(tTouch - t0).toFixed(1), barks: rec.filter((r) => r.n === 'walk:bark').length };
  writeFileSync(`${OUT}/timings.json`, JSON.stringify(out, null, 2));
  console.log(`[tour] timings ${JSON.stringify(out)}`);
  expect(errors).toEqual([]);
});
