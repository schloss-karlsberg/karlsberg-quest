import { afterEach, expect, it, vi } from 'vitest';
import { itemDef } from '../src/rpg/items';
import { MAX_LEVEL } from '../src/rpg/stats';
import { createProgressionSlice, ProgressionCore } from '../src/systems/progression/logic';
import { installProgressionPages } from '../src/systems/progression/pages';
import * as dom from '../src/ui/dom';
import { ModalManager } from '../src/ui/modal';
import { openPausePage, pausePages } from '../src/ui/pause-pages';
import { installPageDom, PageNode } from './ui-fixture';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function gear() {
  const root = installPageDom();
  vi.spyOn(dom, 'svg').mockImplementation(() => new PageNode('svg') as unknown as SVGSVGElement);
  const modals = new ModalManager(root.element);
  let slice = createProgressionSlice();
  let home = false;
  const core = new ProgressionCore(() => slice, { emit: vi.fn(), item: itemDef, statOptions: () => ({}), setMembers: () => [], setLevelFlag: vi.fn() });
  const changed = vi.fn((_reason: string) => page.refresh());
  const page = installProgressionPages({ core, changed, atHome: () => home, item: itemDef, name: id => itemDef(id)?.name_de ?? id, quickKey: () => 'V', use: (id) => { if (!core.use(id)) return false; changed('use'); return true; } });
  const handle = openPausePage(modals, 'gear')!;
  const badge = () => pausePages().find(entry => entry.id === 'gear')!.badge!();
  return { root, core, badge, changed, handle, refresh: page.refresh,
    atHome: () => { home = true; page.refresh(); }, reset: () => { slice = createProgressionSlice(); page.refresh(); } };
}

it('refreshes both halves of the gear page after using a supply or replacing the save', () => {
  const { root, core, changed, handle, refresh, reset } = gear();
  const use = () => root.byId('gear-use-item.riechsalz');
  const supply = () => root.byId('gear-supply-item.riechsalz');
  expect(use().disabled).toBe(true);
  expect(supply().textContent).toContain('0 / 5');
  core.grantItem('item.riechsalz', 1); refresh();
  expect(use().disabled).toBe(false);
  root.byId('gear-quick-item.riechsalz').click();
  expect(root.byId('gear-quick-item.riechsalz').getAttribute('aria-pressed')).toBe('true');
  expect(root.byId('gear-quick-item.balsam').getAttribute('aria-pressed')).toBe('false');
  expect(supply().textContent).toContain('Auf V ✓');
  use().click();
  expect(changed.mock.calls).toEqual([['quick'], ['use']]);
  expect(use().disabled).toBe(true);
  core.setLevel(MAX_LEVEL); refresh();
  expect(root.byId('journal-talents').textContent).toContain('Höchststufe');
  reset();
  expect(root.byId('journal-talents').textContent).not.toContain('Höchststufe');
  expect(root.byId('gear-quick-item.balsam').getAttribute('aria-pressed')).toBe('true');
  handle.close();
});

it('updates points, prerequisites, max ranks and home-only respec from the same slice as the pause badge', () => {
  const { root, core, badge, handle, refresh, atHome } = gear();
  const learn = (id: string) => root.byId(`talent-learn-stab.${id}`);
  const points = () => root.byId('talent-points').dataset.points;
  expect(learn('wucht').disabled).toBe(true);
  core.setLevel(4); refresh();
  expect(badge()).toBe(3);
  expect(learn('dritter').disabled).toBe(true);
  learn('wucht').click();
  expect(points()).toBe('2');
  expect(learn('dritter').disabled).toBe(false);
  learn('dritter').click();
  expect(learn('dritter').disabled).toBe(true);
  expect(learn('dritter').textContent).toBe('Gelernt');
  expect(badge()).toBe(1);
  expect(root.byId('talent-respec').disabled).toBe(true);
  atHome();
  expect(root.byId('talent-respec').disabled).toBe(false);
  root.byId('talent-respec').click();
  expect(points()).toBe('3');
  expect(learn('dritter').disabled).toBe(true);
  expect(root.byId('talent-respec').disabled).toBe(true);
  handle.close();
});
