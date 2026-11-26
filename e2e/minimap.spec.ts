import { type Page, expect, test } from '@playwright/test';
import { openPause, waitForHooks } from './helpers/pause';

const PLAY = './?notitle&nosave&fresh&manual';
const NOTICE = 'Codex ergänzt: Die Aufzeichnungen der Vermessungskommission';
const PROMPT = 'Die Aufzeichnungen am Pult untersuchen';
const DIALOGUE = 'Wir treffen uns an der Quelle. Bleib auf dem Weg und geh den Hang hinunter.';

async function sampleMinimap(page: Page, frames: number, shiftToPast = false) {
  return page.getByTestId('minimap').evaluate((node, { frames, shiftToPast }) => {
    const g = (node as HTMLCanvasElement).getContext('2d')!;
    const methods = [
      'fillRect', 'strokeRect', 'drawImage', 'beginPath', 'closePath', 'moveTo', 'lineTo',
      'arc', 'fill', 'stroke', 'save', 'restore', 'translate', 'rotate', 'strokeText', 'fillText',
    ] as const;
    const calls = Object.fromEntries(methods.map((method) => [method, 0])) as Record<typeof methods[number], number>;
    let ms = 0;
    let start = -1;
    for (const method of methods) {
      const original = g[method];
      Object.defineProperty(g, method, {
        configurable: true,
        value(...args: unknown[]) {
          if (method === 'fillRect' && start < 0) start = performance.now();
          calls[method]++;
          Reflect.apply(original, g, args);
          if (method === 'fillText') {
            ms += performance.now() - start;
            start = -1;
          }
        },
      });
    }
    const kq = window.kq!;
    let shiftMs = 0;
    let frameMs: number;
    try {
      if (shiftToPast) {
        const shiftStart = performance.now();
        kq.setEra('1789');
        shiftMs = performance.now() - shiftStart;
      }
      const frameStart = performance.now();
      for (let i = 0; i < frames; i++) kq.ctx.loop.renderOnce(0.1);
      frameMs = performance.now() - frameStart;
    } finally {
      for (const method of methods) Reflect.deleteProperty(g, method);
    }
    return { calls, ms, shiftMs, frameMs };
  }, { frames, shiftToPast });
}

test('minimap hides in other views and remembers the German setting', async ({ page }) => {
  await page.goto(PLAY);
  await waitForHooks(page, ['travel', 'photo']);
  const minimap = page.getByTestId('minimap');
  await expect(minimap).toBeVisible();
  await expect(minimap).toHaveAccessibleName('Minikarte');

  await page.evaluate(() => window.kq!.travel!.map(true));
  await expect(page.getByTestId('travel-map')).toBeVisible();
  await expect(minimap).toBeHidden();
  await page.evaluate(() => window.kq!.travel!.map(false));
  await expect(minimap).toBeVisible();

  expect(await page.evaluate(() => window.kq!.photo!.open())).toBe(true);
  await expect(minimap).toBeHidden();
  await page.evaluate(() => window.kq!.photo!.close());
  await expect(minimap).toBeVisible();

  await openPause(page);
  await expect(minimap).toBeHidden();
  await page.getByTestId('pause-settings').click();
  const toggle = page.getByRole('checkbox', { name: 'Minikarte' });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page.evaluate(() => window.kq!.ctx.ui.modals.closeAll());
  await expect(minimap).toBeHidden();
  await page.reload();
  await waitForHooks(page, ['travel']);
  await expect(minimap).toHaveCount(1);
  await expect(minimap).toBeHidden();
});

test('minimap measures local Canvas 2D draws, routes the Registratur lead and yields to staged HUD', async ({ page }) => {
  await page.goto(PLAY);
  await waitForHooks(page, ['story', 'quests']);
  await page.evaluate(() => window.kq!.teleport(524, -770));
  await expect.poll(async () => (await sampleMinimap(page, 1)).calls.drawImage).toBe(1);
  const frames = 10;
  const { calls, ms } = await sampleMinimap(page, frames);
  const total = Object.values(calls).reduce((sum, count) => sum + count, 0);
  console.log(`[minimap] tour car park, ${frames} redraws, ${total / frames} Canvas 2D calls/redraw, ${(ms / frames).toFixed(3)} ms/redraw`);
  expect(calls.drawImage).toBe(frames);
  expect(calls.closePath).toBe(2 * frames); // one visible footprint and the player arrow
  expect(calls.lineTo).toBe(42 * frames); // 36 path edges, three footprint edges and three arrow edges
  expect(calls.fillText).toBe(frames);

  const approach = await page.evaluate(() => {
    const k = window.kq!;
    k.story!.goto('k1', 'k1_2');
    k.setEra('1789');
    k.teleport(1212, -1166);
    k.step(12);
    k.ctx.loop.renderOnce(0.1);
    const { x, y, z } = k.ctx.player.position;
    const hud = k.ctx.ui.hud;
    const goal = hud.objectiveTarget;
    return {
      story: k.story!.state().objective,
      quest: k.quests!.lead()?.quest,
      interior: !!k.ctx.state.state.flags['interior.room'],
      door: k.ctx.world.routeTo?.(1202, -1153, x, z, y),
      goal: goal && { x: goal.x, z: goal.z },
    };
  });
  expect(approach.story).toMatchObject({ id: 'k1.registratur', x: 1202, z: -1153 });
  expect(approach.quest).toBeNull();
  expect(approach.interior).toBe(false);
  expect(approach.door).toMatchObject({ door: true });
  expect(approach.goal).toEqual({ x: approach.door!.x, z: approach.door!.z });
  expect(approach.goal).not.toEqual({ x: 1202, z: -1153 });
  const past = await sampleMinimap(page, 1);
  expect(past.calls.drawImage).toBe(2); // survey sheet and terrain paths
  expect(past.calls.strokeRect).toBe(1); // goal diamond

  const minimap = page.getByTestId('minimap');
  await page.evaluate(() => window.kq!.ctx.ui.hud.busy('stage-door-crack', true));
  expect((await sampleMinimap(page, 1)).calls.fillText).toBe(0);
  await expect(page.locator('.kq-hud')).toHaveAttribute('data-kq-mode', 'staged');
  await expect(minimap).toBeHidden();
  await page.evaluate(() => {
    const hud = window.kq!.ctx.ui.hud;
    hud.busy('stage-door-crack', false, 0);
    hud.tickCalm(0);
  });
  expect((await sampleMinimap(page, 1)).calls.fillText).toBe(1);
  await expect(minimap).toBeVisible();
});

test.describe('tall landscape touch layout', () => {
  test.use({ viewport: { width: 1024, height: 550 }, isMobile: true, hasTouch: true });

  test('fits a wrapped toast below the minimap and clear of the unlocked skills', async ({ page }) => {
    await page.goto(PLAY);
    await waitForHooks(page, ['progression']);
    const notice = `${NOTICE}. Die Unterlagen sind jetzt in der Chronik unter Vermessung verzeichnet.`;
    await page.evaluate((notice) => {
      const k = window.kq!;
      k.progression!.level(6);
      // Place the notice in the live dock independently of the queued level-up cards.
      k.ctx.ui.hud.showToast(notice);
    }, notice);

    const minimap = page.getByTestId('minimap');
    const toast = page.locator('.kq-toast', { hasText: notice });
    await expect(minimap).toBeVisible();
    await expect(toast).toBeVisible();
    const mapBox = (await minimap.boundingBox())!;
    const toastBox = (await toast.boundingBox())!;
    expect(toastBox.height).toBeGreaterThan(40);
    expect(toastBox.y - (mapBox.y + mapBox.height)).toBeGreaterThanOrEqual(8);
    expect(toastBox.y - (mapBox.y + mapBox.height)).toBeLessThan(24);
    for (const n of [1, 2, 3]) {
      const skill = page.getByTestId(`touch-skill${n}`);
      await expect(skill).toBeVisible();
      const skillBox = (await skill.boundingBox())!;
      expect(toastBox.x + toastBox.width).toBeLessThanOrEqual(skillBox.x - 4);
    }
  });
});

test.describe('small landscape phone', () => {
  test.use({ viewport: { width: 667, height: 375 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  test('minimap fits beside the controls and dialogue inside the safe area', async ({ page }) => {
    await page.goto(PLAY);
    await waitForHooks(page, ['story']);
    await page.addStyleTag({ content: ':root { --kq-safe-t: 0px; --kq-safe-r: 47px; --kq-safe-b: 21px; --kq-safe-l: 47px; }' });
    await expect(page.getByTestId('touch')).toBeVisible();
    const minimap = page.getByTestId('minimap');
    await expect(minimap).toBeVisible();

    await page.evaluate(({ notice, prompt }) => {
      const k = window.kq!;
      k.ctx.ui.hud.prompt('E', prompt, 'minimap-test');
      k.ctx.ui.toast(notice, 30_000);
      k.step();
    }, { notice: NOTICE, prompt: PROMPT });
    const toast = page.locator('.kq-toast', { hasText: NOTICE });
    const action = page.getByTestId('touch-interact');
    await expect(toast).toBeVisible();
    await expect(action).toBeVisible();
    await expect(action).toHaveClass(/\blit\b/);
    await expect(action).toContainText(PROMPT);
    const toastBox = (await toast.boundingBox())!;
    const actionBox = (await action.boundingBox())!;
    expect(actionBox.width).toBeGreaterThan(160);
    expect(toastBox.x).toBeGreaterThanOrEqual(47);
    expect(toastBox.x + toastBox.width).toBeLessThanOrEqual(actionBox.x - 4);

    await page.evaluate(() => {
      const ui = window.kq!.ctx.ui;
      ui.hud.prompt(null, undefined, 'minimap-test');
      ui.cards.clearToasts();
    });
    const survey = page.getByTestId('touch-survey');
    await survey.tap();
    await expect(survey).toHaveAttribute('aria-expanded', 'true');
    await expect(minimap).toBeHidden();
    expect((await sampleMinimap(page, 1)).calls.fillText).toBe(0);
    await survey.tap();
    await expect(minimap).toBeVisible();
    expect((await sampleMinimap(page, 1)).calls.fillText).toBe(1);

    await page.evaluate((line) => {
      const k = window.kq!;
      k.story!.say('laub', line);
      k.step();
    }, DIALOGUE);
    const dialogue = page.getByTestId('dialogue');
    await expect(dialogue).toHaveClass(/kqs-show/);
    const box = (await minimap.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(80);
    expect(box.x).toBeGreaterThanOrEqual(47);
    expect(box.x + box.width).toBeLessThanOrEqual(667 - 47);
    for (const target of [dialogue, ...await page.locator('.kq-t-btn:visible').all()]) {
      const other = await target.boundingBox();
      if (!other) continue;
      const overlaps = box.x < other.x + other.width && box.x + box.width > other.x &&
        box.y < other.y + other.height && box.y + box.height > other.y;
      expect(overlaps, `minimap overlaps ${await target.getAttribute('data-testid')}`).toBe(false);
    }
  });

  test('draws the prepared terrain layer on the first historical frame', async ({ page }) => {
    await page.goto(`${PLAY}&era=today&q=low`);
    await waitForHooks(page, ['story']);
    await expect(page.getByTestId('minimap')).toBeVisible();
    await expect.poll(async () => (await sampleMinimap(page, 1)).calls.drawImage).toBe(1);

    const { calls, ms, shiftMs, frameMs } = await sampleMinimap(page, 1, true);
    expect(calls.drawImage).toBe(2); // survey sheet and prepared paths on the first historical frame
    expect(calls.fillText).toBe(1);
    console.log(`[minimap] 667 × 375 touch, cold era change ${shiftMs.toFixed(3)} ms, first frame ${frameMs.toFixed(3)} ms including ${ms.toFixed(3)} ms of minimap Canvas 2D submission`);
  });
});

test.describe('shortest landscape phone', () => {
  test.use({ viewport: { width: 568, height: 320 }, isMobile: true, hasTouch: true });

  test('a lit action hides the map and returns its space to dialogue and notices', async ({ page }) => {
    await page.goto(PLAY);
    await waitForHooks(page, ['story']);
    await page.evaluate(({ line, notice }) => {
      const k = window.kq!;
      k.story!.say('laub', line);
      k.ctx.ui.hud.prompt('Q', 'Epoche wechseln', 'minimap-test');
      k.ctx.ui.hud.showToast(notice);
    }, { line: DIALOGUE, notice: NOTICE });

    const minimap = page.getByTestId('minimap');
    const dialogue = page.getByTestId('dialogue');
    const toast = page.locator('.kq-toast', { hasText: NOTICE });
    const action = page.getByTestId('touch-interact');
    await expect(minimap).toBeVisible();
    await expect(dialogue).toHaveClass(/kqs-show/);
    await expect(toast).toBeVisible();
    const withMap = { dialogue: (await dialogue.boundingBox())!, toast: (await toast.boundingBox())! };

    await page.evaluate((prompt) => window.kq!.ctx.ui.hud.prompt('E', prompt, 'minimap-test'), PROMPT);
    await expect(action).toHaveClass(/\blit\b/);
    await expect(minimap).toBeHidden();
    expect((await sampleMinimap(page, 1)).calls.fillText).toBe(0);
    const wider = (await dialogue.boundingBox())!;
    const raised = (await toast.boundingBox())!;
    const pill = (await action.boundingBox())!;
    expect(wider.x).toBeCloseTo(withMap.dialogue.x);
    expect(wider.width - withMap.dialogue.width).toBeCloseTo(84);
    expect(raised.y).toBeLessThan(withMap.toast.y - 50);
    expect(raised.x + raised.width).toBeLessThanOrEqual(pill.x - 4);

    await page.evaluate(() => window.kq!.ctx.ui.hud.prompt('Q', 'Epoche wechseln', 'minimap-test'));
    await expect(minimap).toBeVisible();
    expect((await dialogue.boundingBox())!.width).toBeCloseTo(withMap.dialogue.width);
    expect((await toast.boundingBox())!.y).toBeCloseTo(withMap.toast.y);
  });
});
