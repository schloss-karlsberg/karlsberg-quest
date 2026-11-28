import { expect, test } from '@playwright/test';
import { COAT_REACH } from '../src/systems/bleiche/layout';
import { ciScale } from './helpers/ci';
import { trackErrors } from './helpers/common';
import { fight, qn, qs, untilQuest } from './helpers/prolog';
import { DISGUISE_SPOTS, boot, flags, playDisguise, shot, story, talk, upd } from './helpers/k1';

/**
 * Chapter 1's disguise opening (story k1_0b → k1_0c, docs/IDEAS-ROUND11.md §2, the court system
 * src/systems/court): in orange the Gardist at the gitter sends you out; Kaspar's coat lifted off
 * Liese's line unseen, the paper from the Hofgärtner, the letter, the Musterung → admitted; and the
 * other way to the coat: Liese asked, three Mahnbriefe chased out of her linen.
 * Screenshots: test-results/screens/ch-k1-0b-*.png, ch-k1-0c-*.png.
 */
test.describe.configure({ timeout: ciScale(600_000) });

async function startInSummer(page: import('@playwright/test').Page): Promise<void> {
  await boot(page, 'k1_0b');
  await page.evaluate(() => {
    const k = window.kq!;
    k.ctx.era.set('1789');
    k.teleport(1059.3, -833.1, 204, 0);
    k.step(4);
  });
  // A direct chapter jump shows the chapter card. Its hold includes the court cue and quest offer.
  await upd(page, 420);
  expect(await story(page)).toMatchObject({ era: '1789', beat: 'k1_0b' });
  expect(await page.evaluate(() => window.kq!.court!.state().sets)).toContain('k1');
}

/** Every subtitle shown since `recordSubs` (lines last 3–4 s; the checks come later). */
type SubW = { __subs?: string[] };
const recordSubs = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const w = window as unknown as SubW;
    if (w.__subs) return;
    w.__subs = [];
    const hud = window.kq!.ctx.ui.hud;
    const orig = hud.subtitle.bind(hud);
    hud.subtitle = (...args: Parameters<typeof hud.subtitle>) => {
      w.__subs!.push(args[1]);
      return orig(...args);
    };
  });
const subs = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as SubW).__subs ?? []);

test('k1 disguise: orange is refused at the gitter; coat taken unseen, letter, Musterung → admitted', async ({ page }) => {
  const errors = trackErrors(page);
  await startInSummer(page);
  await recordSubs(page);
  expect((await story(page)).objective).toMatchObject({ id: 'k1.rock', x: COAT_REACH.x, z: COAT_REACH.z });
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1023, -864, 0, 0);
    k.step(6);
  });
  for (let i = 0; i < 10 && !(await page.evaluate(() => window.kq!.story!.shown().includes('laub.k1.bleiche'))); i++) await upd(page, 60);
  expect(await page.evaluate(() => window.kq!.story!.shown())).toContain('laub.k1.bleiche');
  await page.evaluate(() => window.kq!.teleport(1059.3, -833.1, 204, 0));
  const npcs = await page.evaluate(() => window.kq!.npc!.list().map((n) => n.npc));
  for (const id of ['liese', 'hofgaertner', 'gardist-tor', 'gardist', 'lakai']) expect(npcs).toContain(id);
  // in the hi-vis vest at the gate: the Gardist sees the costume and escorts you to the forecourt
  await page.evaluate((g) => {
    const k = window.kq!;
    k.teleport(g.x, g.z, 0, 0);
    k.step(4);
  }, { x: DISGUISE_SPOTS.toGate.at(-1)![0], z: DISGUISE_SPOTS.toGate.at(-1)![1] });
  await upd(page, 10);
  expect(await page.evaluate(() => window.kq!.court!.inspect('gardist-tor'))).toBe('eject');
  expect((await subs(page)).some((l) => l.includes('vom Theater'))).toBe(true);
  await upd(page, 80);
  let c = await page.evaluate(() => window.kq!.court!.state());
  expect(c.ejected).toBe(1);
  expect(c.admitted).toBe(false);
  await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
  await upd(page, 10);
  expect((await story(page)).beat).toBe('k1_0b');
  // the steal path, the paper, the letter, the Musterung (with its own checks)
  c = await playDisguise(page);
  expect(c.admitted).toBe(true);
  expect(c.costume).toBe('court');
  expect((await subs(page)).some((l) => l.includes('Hofrat Amsel'))).toBe(true);
  const f = await flags(page);
  expect(f['flag.k1_kleid']).toBe('genommen');
  // the gate stands open; the lantern burns from the court on
  expect(!!(await story(page)).meters.oil).toBe(true);
  await shot(page, '0c-eingelassen');
  expect(errors).toEqual([]);
});

test('k1 disguise: the favour — Liese asked, three Mahnbriefe out of her linen, the coat lent', async ({ page }) => {
  const errors = trackErrors(page);
  await startInSummer(page);
  expect(await qs(page, 'q.k1.kleider')).toBe('active');
  // in front of Liese (her talk radius is 2.8 m)
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(1006.3, -872.2, 0, 0);
    (window as unknown as { __k1: { face(x: number, z: number): void } }).__k1.face(1004.85, -870.3);
    k.step(6);
  });
  const offered = await talk(page, 'liese', ['rock']);
  expect(offered).toContain('rock');
  await upd(page, 30);
  expect(await qn(page, 'q.k1.kleider', 'bitte')).toBe(1);
  // the Mahnbriefe rise on the meadow north of the green
  await page.evaluate(() => {
    const k = window.kq!;
    k.teleport(998, -886, 180, 0);
    k.step(30);
  });
  expect(await page.evaluate(() => window.kq!.combat!.enemies().filter((e) => e.kind === 'mahnbrief').length)).toBe(3);
  await fight(page, 'mahnbrief', { hits: 3 });
  await upd(page, 60);
  expect(await qn(page, 'q.k1.kleider', 'zettel')).toBe(3);
  const f = await flags(page);
  expect(f['disguise.coat']).toBe(true);
  expect(f['flag.k1_kleid']).toBe('geliehen');
  expect(await page.evaluate(() => window.kq!.scenery?.coat().visible ?? true)).toBe(false);
  expect(await untilQuest(page, 'q.k1.kleider', 'done', 10)).toBe('done');
  expect(await untilQuest(page, 'q.k1.brief', 'active', 10)).toBe('active');
  expect(errors).toEqual([]);
});
