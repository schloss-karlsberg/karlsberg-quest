import { type Page, expect } from '@playwright/test';

/**
 * The tour (content/story/00-tour.story.json), the opening of a new game, on the fast path: from
 * wherever the tour is (a new game stands at t1) straight to the break at the Quelle (t17: the
 * Bussole, Laub), the hand into the water, the shift to 1789 and the hand-over into chapter 1.
 * The walk with the group itself is covered by e2e/tour-slice.spec.ts; what chapter 1 reads is
 * granted in t17 and at the tour's end (t18 exit, the chapter's `leave`), so the state at k1_0 is the
 * same as after the full walk (tests/tour-handover.test.ts checks the authored grants).
 *
 * Ends with the story at k1 / k1_0, in the present, at the Quelle.
 */
export async function throughTour(page: Page): Promise<void> {
  const st = await page.evaluate(() => window.kq!.story!.state());
  expect(st.chapter, 'a new game opens with the tour').toBe('tour');
  await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('tour', 't17');
    k.teleport(1059.3, -833.1, 204, -10);
    k.step(60);
  });
  // Laub's lines run, then the Quelle's own E („das Wasser berühren“)
  for (let i = 0; i < 60 && !(await page.evaluate(() => window.kq!.quelle!.info().prompt)); i++) await page.evaluate(() => (window.kq!.story!.finishTyping(), window.kq!.step(60)));
  expect(await page.evaluate(() => window.kq!.quelle!.info().prompt), 'the trough offers the touch').toBeTruthy();
  await page.evaluate(() => window.kq!.press('KeyE', 2));
  const beat = () => page.evaluate(() => window.kq!.story!.state().beat as string);
  for (let i = 0; i < 30 && (await beat()) !== 't18'; i++) await page.evaluate(() => window.kq!.step(30));
  expect(await beat()).toBe('t18');
  // under webdriver the era shift runs on frame time, not on kq.step (core/bullet.ts): scrub it
  await page.evaluate(() => {
    const k = window.kq!;
    k.step(10);
    k.fx!.shiftAt(1.9);
    k.fx!.shiftAt(3.6);
  });
  for (let i = 0; i < 10 && (await page.evaluate(() => window.kq!.story!.state().era)) !== '1789'; i++) await page.evaluate(() => window.kq!.step(60));
  expect(await page.evaluate(() => window.kq!.story!.state().era)).toBe('1789');
  // a look round in 1789, then the hand-over
  const chapter = () => page.evaluate(() => window.kq!.story!.state().chapter as string);
  for (let i = 0; i < 80 && (await chapter()) === 'tour'; i++) await page.evaluate(() => (window.kq!.story!.finishTyping(), window.kq!.step(60)));
  const s = await page.evaluate(() => window.kq!.story!.state());
  expect(s.completed).toContain('tour');
  expect(s.chapter).toBe('k1');
  expect(s.beat).toBe('k1_0');
}

/** The opening grants expected in chapter 1 after {@link throughTour}. */
export async function expectHandover(page: Page): Promise<void> {
  const st = await page.evaluate(() => {
    const k = window.kq!;
    const s = k.state();
    const sys = s.systems as Record<string, { level?: number; inventory?: Record<string, number> }>;
    return { skills: s.skills as Record<string, number>, flags: s.flags, items: s.inventory.items, era: k.ctx.era.current, level: sys.progression?.level, inv: sys.progression?.inventory ?? {} };
  });
  expect(st.era).toBe('today');
  expect(st.skills['relief']).toBe(3);
  expect(st.skills['kartograf'] ?? 0).toBeGreaterThanOrEqual(1);
  expect(st.items).toContain('item.bussole');
  expect(st.flags['story.compass']).toBe(true);
  expect(st.flags['story.laub']).toBe(true);
  for (const f of ['laub.silent', 'combat.disabled', 'tour.slice']) expect(st.flags[f], f).toBeFalsy();
  expect(st.level).toBe(3);
  expect(st.inv['item.p.seite'] ?? 0).toBeGreaterThanOrEqual(1);
}
