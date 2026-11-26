import { expect, test } from '@playwright/test';
import { throughParty } from './helpers/common';
import { waitForHooks } from './helpers/pause';

for (const ending of ['museum', 'burn', 'keep'] as const) {
  test(`Weiter restores the ${ending} epilogue and its celebration`, async ({ page }) => {
    await page.goto('./?notitle&fresh&manual&q=low');
    await waitForHooks(page, ['story', 'party']);
    await page.evaluate(() => {
      const k = window.kq!;
      k.story!.start('Alex');
      k.story!.goto('enden');
      k.ctx.state.update((s) => { s.flags['flag.k3_objekt'] = 'uhr'; });
      k.step(2);
      k.story!.flush();
      k.step(2);
    });

    await page.getByTestId(`ending-${ending}`).click();
    await page.getByRole('button', { name: 'Ja', exact: true }).click();
    await page.evaluate(() => window.kq!.story!.stageSkip());
    await page.getByTestId('ending-next').click();
    const epilogue = page.getByTestId('epilogue');
    const text = await epilogue.innerText();
    expect(await page.evaluate(() => {
      const k = window.kq!;
      k.step(2);
      return k.ctx.save.peek('auto')?.systems.story;
    })).toMatchObject({
      chapter: 'enden', beat: 'e2', ending,
    });

    // Navigate back through the title while the epilogue is still open.
    await page.goto('./?manual&q=low');
    await page.getByTestId('title-continue').click({ timeout: 60_000 });
    await expect(epilogue).toBeVisible();
    expect(await page.evaluate(() => window.kq!.ctx.input.locked)).toBe(false);
    expect(await epilogue.innerText()).toBe(text);
    await expect(page.getByTestId('ending-stage')).toHaveCount(0);
    await page.getByTestId('ending-credits').click();
    await expect(epilogue).toHaveCount(0);
    await throughParty(page);
    expect(await page.evaluate(() => window.kq!.party!.state().variant)).toBe(ending);

    if (ending === 'keep') {
      await page.reload();
      await page.getByTestId('title-ending-again').click({ timeout: 60_000 });
      await waitForHooks(page, ['story']);
      await page.evaluate(() => window.kq!.step(120));
      await expect(page.getByTestId('ending-keep')).toBeVisible();
      await expect(epilogue).toHaveCount(0);
      expect(await page.evaluate(() => window.kq!.story!.state())).toMatchObject({ beat: 'e1', ending: null });
    }
  });
}
