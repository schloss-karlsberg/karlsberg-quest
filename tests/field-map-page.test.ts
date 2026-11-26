import { afterEach, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import { type MapModel, renderMap } from '../src/systems/travel/map';
import { installPageDom, PageNode } from './ui-fixture';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mapPage(distance: number, block: string | null = null) {
  const root = installPageDom();
  const panel = new EventTarget();
  Object.assign(root, { closest: () => panel, isConnected: true });
  const canvas = Object.assign(new PageNode('canvas'), {
    getContext: () => null, setPointerCapture: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 520 }),
  });
  vi.spyOn(document, 'createElement').mockImplementation(tag => (tag === 'canvas' ? canvas : new PageNode(tag)).element);
  vi.stubGlobal('requestAnimationFrame', () => 17);
  const cancelFrame = vi.fn();
  vi.stubGlobal('cancelAnimationFrame', cancelFrame);
  const model: MapModel = {
    player: { x: 0, z: 0, yaw: 0 }, goal: null, block, layers: [], pois: [],
    known: [{ id: 'near', x: distance, z: 0, name: 'Hof', note: '' }], unknown: [],
  };
  const travel = vi.fn();
  const close = renderMap({} as GameContext, root.element, () => model, { travel, layer: vi.fn() });
  const pick = () => {
    for (const type of ['pointerdown', 'pointerup']) {
      canvas.dispatchEvent(Object.assign(new Event(type), { clientX: 320, clientY: 260, pointerId: 1 }));
    }
  };
  const enter = () => {
    const key = Object.assign(new Event('keydown'), { key: 'Enter' });
    Object.defineProperty(key, 'target', { value: canvas });
    panel.dispatchEvent(key);
  };
  return { root, travel, pick, enter, close, cancelFrame };
}

it('Enter cannot travel to the point marked as already here', () => {
  const page = mapPage(24.9);
  page.pick();
  expect(page.root.byId('travel-go-near').disabled).toBe(true);
  page.enter();
  expect(page.travel).not.toHaveBeenCalled();
  page.close();
});

it('allows Enter at exactly 25 m only after selection, and detaches input and redraw on close', () => {
  const page = mapPage(25);
  expect(page.root.byId('travel-go-near').disabled).toBe(false);
  page.enter();
  expect(page.travel).not.toHaveBeenCalled();
  page.pick(); page.enter();
  expect(page.travel.mock.calls).toEqual([['near']]);
  page.close(); page.enter();
  expect(page.travel).toHaveBeenCalledTimes(1);
  expect(page.cancelFrame).toHaveBeenCalledWith(17);
});

it('keeps blocked destinations selectable for inspection but not travel', () => {
  const page = mapPage(25, 'Im Kampf');
  page.pick();
  expect(page.root.byId('travel-block').textContent).toBe('Im Kampf');
  expect(page.root.byId('travel-go-near').disabled).toBe(true);
  page.enter();
  expect(page.travel).not.toHaveBeenCalled();
  page.close();
});
