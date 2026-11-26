import { afterEach, expect, it, vi } from 'vitest';
import { HuntOverlay } from '../src/systems/hunt/overlay';

afterEach(() => vi.unstubAllGlobals());

it('keeps idle frames free of style writes and updates an arrow on hide, resume and resize', () => {
  const write = vi.fn();
  const query = vi.fn();
  function element() {
    const style = new Proxy<Record<string, string>>({}, {
      set(target, key: string, value: string) {
        write(key, value);
        target[key] = value;
        return true;
      },
    });
    return {
      style, dataset: {}, classList: { remove() {} }, append() {}, setAttribute() {},
      querySelector: query, insertAdjacentHTML() {}, remove() {},
    };
  }
  query.mockReturnValue(element());
  const viewport = { innerWidth: 800, innerHeight: 600 };
  vi.stubGlobal('window', viewport);
  vi.stubGlobal('document', { getElementById: () => true, createElement: element });
  const overlay = new HuntOverlay(element() as unknown as HTMLElement, { caught: '', caughtSub: '' });
  const frame = { dt: 1 / 60, alert: 0, caught: -1, reducedMotion: true, showArrows: true };
  overlay.frame(frame);
  write.mockClear();
  for (let i = 0; i < 60; i++) overlay.frame(frame);
  expect(write).not.toHaveBeenCalled();

  overlay.arrow('sound', 'horn', 90, '', 1);
  query.mockClear();
  overlay.frame(frame);
  expect(write).toHaveBeenCalledWith('left', '720.0px');
  expect(write).toHaveBeenCalledWith('transform', 'rotate(90.0deg)');
  write.mockClear();
  overlay.frame(frame);
  expect(write).not.toHaveBeenCalled();
  frame.showArrows = false;
  overlay.frame(frame);
  expect(write).toHaveBeenCalledWith('opacity', '0.00');
  viewport.innerWidth = 1000;
  frame.showArrows = true;
  overlay.frame(frame);
  expect(write).toHaveBeenCalledWith('left', '900.0px');
  expect(write).toHaveBeenCalledWith('opacity', '1.00');
  expect(query).not.toHaveBeenCalled();

  frame.caught = 2;
  overlay.frame(frame);
  expect(write).toHaveBeenCalledWith('opacity', '1.000');
  frame.caught = -1;
  overlay.frame(frame);
  expect(write).toHaveBeenCalledWith('opacity', '0.000');
});
