import { type Page, expect, test } from '@playwright/test';
import { ciScale } from './helpers/ci';
import { trackErrors } from './helpers/common';
import { openPause, waitForHooks } from './helpers/pause';

/**
 * Forage (TASK-090, docs/ACTION-RPG.md §7.1), in the guided tour where fighting is off: with the
 * staff a swing cuts the fern in front of the player (leaves fly, the plant is a stub, on Niedrig
 * it shows as a stand-in clump), a chestnut rolls out and is picked up by walking over it, F
 * throws it (the count goes down, it lands and makes its noise), a hold aims first, the plant
 * grows back, the touch button is there only with chestnuts, and the count survives a reload.
 */
test.describe.configure({ timeout: ciScale(300_000) });
test.use({ hasTouch: true });

const NUT = 'item.kastanie';
/** Forest floor east of the Felsenpfad, off the tour's own chestnuts. */
const START = { x: 700, z: -640 };

const step = (page: Page, n: number) => page.evaluate((k) => window.kq!.step(k), n);
const count = (page: Page) => page.evaluate((item) => window.kq!.progression!.state().inventory[item] ?? 0, NUT);
const forage = (page: Page) => page.evaluate(() => window.kq!.forage!.state());
const events = (page: Page) => page.evaluate(() => (window as unknown as { __forage: { name: string; p: Record<string, number | string> }[] }).__forage);

test('forage: the staff cuts a fern, a chestnut drops, is picked up and thrown (TASK-090)', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`./?notitle&fresh&manual&x=${START.x}&z=${START.z}`);
  await waitForHooks(page, ['story', 'progression', 'combat', 'forage']);
  await page.evaluate(() => {
    const kq = window.kq!;
    kq.ctx.settings.update((d) => (d.touchControls = 'off'), 'touchControls');
    const w = window as unknown as { __forage: { name: string; p: unknown }[] };
    w.__forage = [];
    for (const name of ['forage:cut', 'forage:throw', 'forage:impact', 'world:noise', 'combat:arc'] as const) kq.ctx.events.on(name, (p) => w.__forage.push({ name, p: { ...p } }));
    kq.story!.start('Alex');
  });
  // the tour's first beat switches fighting off (after the chapter card)
  for (let i = 0; i < 40 && !(await page.evaluate(() => window.kq!.state().flags['tour.slice'] === true)); i++) await step(page, 60);
  expect(await page.evaluate(() => window.kq!.state().flags)).toMatchObject({ 'combat.disabled': true, 'tour.slice': true });

  // stand in front of the nearest standing fern, facing it (yaw 0 looks along −z)
  const plant = await page.evaluate(({ x, z }) => {
    const kq = window.kq!;
    kq.teleport(x, z, 0, -20);
    kq.step(2);
    const p = kq.forage!.plants(60).find((q) => q.kind === 'fern' && q.factor === 1)!;
    kq.teleport(p.x, p.z + 1.5, 0, -20);
    kq.step(5);
    return p;
  }, START);
  expect(plant).toBeTruthy();
  const factor = () => page.evaluate(({ x, z }) => window.kq!.forage!.plants(8).find((q) => Math.hypot(q.x - x, q.z - z) < 0.05)!.factor, plant);
  // Niedrig draws no forest-floor props: the plants show as stand-in clumps
  const low = await page.evaluate(() => window.kq!.ctx.quality.level === 'low');
  await step(page, 30);
  if (low) expect((await forage(page)).brush).toBeGreaterThan(0);

  // without the staff a swing does nothing
  await page.evaluate(() => window.kq!.press('KeyK', 2));
  await step(page, 40);
  expect((await events(page)).filter((e) => e.name === 'combat:arc')).toHaveLength(0);
  expect(await factor()).toBe(1);

  // with it the fern is cut: leaves fly, a chestnut rolls out beyond it
  await page.evaluate(() => {
    window.kq!.progression!.grant('item.stab.esche', 1, true);
    window.kq!.forage!.rig(1);
  });
  await step(page, 5);
  await page.evaluate(() => window.kq!.press('KeyK', 2));
  for (let i = 0; i < 40 && !(await events(page)).some((e) => e.name === 'forage:cut'); i++) await step(page, 2);
  const cut = (await events(page)).find((e) => e.name === 'forage:cut')!;
  expect(cut.p.plants).toBeGreaterThanOrEqual(1);
  expect(cut.p.drops).toBe(1);
  expect(await factor()).toBeCloseTo(0.2, 5);
  const afterCut = await forage(page);
  expect(afterCut.leaves).toBeGreaterThan(0);
  expect(afterCut.circles).toBe(1);
  expect(afterCut.cuts).toBeGreaterThanOrEqual(1);
  const drop = await page.evaluate(() => window.kq!.progression!.pickups().find((p) => p.id.startsWith('forage.'))!);
  expect(drop).toMatchObject({ item: NUT, era: 'today', drop: true });
  const me = await page.evaluate(() => ({ x: window.kq!.ctx.player.position.x, z: window.kq!.ctx.player.position.z }));
  // out of the walk-over radius: it is seen before it is taken
  expect(Math.hypot(drop.x - me.x, drop.z - me.z)).toBeGreaterThan(1.9);
  expect(await count(page)).toBe(0);
  await expect(page.getByTestId('hud-nuts')).toBeHidden();

  // a second swing at the stub finds nothing to cut
  await step(page, 40);
  await page.evaluate(() => window.kq!.press('KeyK', 2));
  await step(page, 40);
  expect((await events(page)).filter((e) => e.name === 'forage:cut')).toHaveLength(1);

  // walking over the chestnut picks it up; the HUD chip shows the key and the count
  await page.evaluate(({ x, z }) => window.kq!.teleport(x, z, 0, -20), drop);
  await step(page, 5);
  expect(await count(page)).toBe(1);
  const chip = page.getByTestId('hud-nuts');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('×1');
  await expect(chip.locator('kbd')).toHaveText('F');

  // one hint for the staff, later one for the throw (each once, when nobody speaks)
  await page.evaluate(() => window.kq!.forage!.rig(0));
  const hints = async () => (await forage(page)).hints;
  for (let i = 0; i < 90 && (await hints()).length < 2; i++) await step(page, 60);
  expect(await hints()).toEqual(['cut', 'throw']);

  // F throws it: the count goes down at once, it flies, lands and makes its noise
  await page.evaluate(({ x, z }) => window.kq!.teleport(x, z + 6, 0, -12), plant);
  await step(page, 5);
  const aim = await page.evaluate(() => window.kq!.forage!.aim());
  const reach = Math.hypot(aim.to.x - aim.from.x, aim.to.z - aim.from.z);
  expect(reach).toBeGreaterThanOrEqual(2);
  expect(reach).toBeLessThanOrEqual(22.01);
  await page.evaluate(() => window.kq!.press('KeyF', 2));
  await step(page, 2);
  expect(await count(page)).toBe(0);
  const thrown = (await events(page)).find((e) => e.name === 'forage:throw')!;
  expect(thrown.p.left).toBe(0);
  expect((await forage(page)).flying).toBe(1);
  await expect(chip).toBeHidden();
  for (let i = 0; i < 60 && !(await events(page)).some((e) => e.name === 'forage:impact'); i++) await step(page, 4);
  const impact = (await events(page)).find((e) => e.name === 'forage:impact')!;
  expect(['ground', 'wood']).toContain(impact.p.on);
  expect((await events(page)).filter((e) => e.name === 'world:noise')).toHaveLength(1);
  await step(page, 240);
  expect((await forage(page)).flying).toBe(0);

  // nothing left: F throws nothing
  await page.evaluate(() => window.kq!.press('KeyF', 2));
  await step(page, 10);
  expect((await events(page)).filter((e) => e.name === 'forage:throw')).toHaveLength(1);

  // a hold aims (nothing leaves the hand), letting go throws; reduced motion: no leaves, no trail
  await page.evaluate(() => {
    const kq = window.kq!;
    kq.ctx.settings.update((d) => (d.reducedMotion = true), 'reducedMotion');
    kq.progression!.grant('item.kastanie', 3, true);
    kq.ctx.input.simulate('KeyF', true);
  });
  await step(page, 20);
  expect(await forage(page)).toMatchObject({ holding: true, nuts: 3, flying: 0 });
  await page.evaluate(() => window.kq!.ctx.input.simulate('KeyF', false));
  await step(page, 3);
  expect(await forage(page)).toMatchObject({ holding: false, nuts: 2, flying: 1 });
  const other = await page.evaluate(({ x, z }) => {
    const kq = window.kq!;
    const p = kq.forage!.plants(60).find((q) => q.factor === 1 && Math.hypot(q.x - x, q.z - z) > 4)!;
    kq.teleport(p.x, p.z + 1.5, 0, -20);
    kq.step(5);
    kq.press('KeyK', 2);
    return p;
  }, plant);
  for (let i = 0; i < 40 && (await events(page)).filter((e) => e.name === 'forage:cut').length < 2; i++) await step(page, 2);
  expect((await events(page)).filter((e) => e.name === 'forage:cut')).toHaveLength(2);
  expect((await forage(page)).leaves).toBe(0);
  expect(await page.evaluate(({ x, z }) => window.kq!.forage!.plants(8).find((q) => Math.hypot(q.x - x, q.z - z) < 0.05)!.factor, other)).toBeCloseTo(0.2, 5);
  await page.evaluate(() => window.kq!.ctx.settings.update((d) => (d.reducedMotion = false), 'reducedMotion'));

  // touch: the button is there only with chestnuts, shows the count and throws
  await page.evaluate(() => window.kq!.ctx.settings.update((d) => (d.touchControls = 'on'), 'touchControls'));
  await step(page, 5);
  const button = page.getByTestId('touch-throw');
  await expect(button).toBeVisible();
  await expect(page.getByTestId('touch-throw-count')).toHaveText('2');
  await expect(chip).toBeHidden();
  await button.tap();
  // (a tap inside the cooldown of the last throw is kept until the arm is free)
  await step(page, 30);
  expect(await count(page)).toBe(1);
  await expect(page.getByTestId('touch-throw-count')).toHaveText('1');
  await step(page, 40);
  await button.tap();
  await step(page, 5);
  expect(await count(page)).toBe(0);
  await expect(button).toBeHidden();
  await page.evaluate(() => window.kq!.ctx.settings.update((d) => (d.touchControls = 'off'), 'touchControls'));

  // plants grow back in steps over 75 s of game time
  const otherFactor = () => page.evaluate(({ x, z }) => window.kq!.forage!.plants(60).find((q) => Math.hypot(q.x - x, q.z - z) < 0.05)!.factor, other);
  await step(page, 60 * 45);
  expect(await otherFactor()).toBeGreaterThan(0.2);
  expect(await otherFactor()).toBeLessThan(1);
  await step(page, 60 * 40);
  expect(await otherFactor()).toBe(1);
  expect(await factor()).toBe(1);
  expect((await forage(page)).circles).toBe(0);

  // Pause → Steuerung lists the real key; the count and the counters survive a reload
  await page.evaluate(() => window.kq!.progression!.grant('item.kastanie', 4, true));
  await step(page, 5);
  const before = await forage(page);
  expect(before.thrown).toBe(4);
  await page.evaluate(() => window.kq!.ctx.save.autosave('e2e', true));
  await page.goto(`./?notitle&manual&x=${START.x}&z=${START.z}`);
  await waitForHooks(page, ['story', 'progression', 'forage']);
  await step(page, 5);
  expect(await count(page)).toBe(4);
  expect(await forage(page)).toMatchObject({ thrown: 4, cuts: before.cuts, found: before.found, hints: ['cut', 'throw'], circles: 0 });
  await expect(page.getByTestId('hud-nuts')).toContainText('×4');
  await openPause(page);
  await page.getByTestId('pause-controls').click();
  await expect(page.getByTestId('key-help').getByRole('row').filter({ hasText: 'Kastanie werfen' })).toContainText('[F]');
  expect(errors).toEqual([]);
});
