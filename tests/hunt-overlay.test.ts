import { afterEach, expect, it, vi } from 'vitest';
import { HuntOverlay } from '../src/systems/hunt/overlay';

afterEach(() => vi.unstubAllGlobals());

function setupOverlay() {
  const write = vi.fn();
  const query = vi.fn();
  class FakeElement {
    readonly style = new Proxy<Record<string, string>>({}, {
      set(target, key: string, value: string) {
        write(key, value);
        target[key] = value;
        return true;
      },
    });
    readonly dataset = {};
    readonly classList = { remove() {} };
    readonly children: FakeElement[] = [];
    className = '';
    svg: FakeElement | null = null;

    constructor(readonly remove = () => {}) {}

    append(...children: FakeElement[]) { this.children.push(...children); }
    setAttribute() {}

    querySelector(selector: string) {
      query(selector);
      return selector === 'svg' ? this.svg : null;
    }

    insertAdjacentHTML(position: string, markup: string) {
      if (position === 'afterbegin' && markup.startsWith('<svg ')) {
        this.svg = new FakeElement(() => { this.svg = null; });
      }
    }
  }
  const viewport = { innerWidth: 800, innerHeight: 600 };
  vi.stubGlobal('window', viewport);
  vi.stubGlobal('document', { getElementById: () => true, createElement: () => new FakeElement() });
  const layer = new FakeElement();
  const overlay = new HuntOverlay(layer as unknown as HTMLElement, { caught: '', caughtSub: '' });
  const frame = { dt: 1 / 60, alert: 0, caught: -1, reducedMotion: true, showArrows: true };
  return { overlay, root: layer.children[0]!, frame, viewport, query, write };
}

it('keeps idle frames free of style writes and updates an inserted arrow on hide, resume and resize', () => {
  const { overlay, root, frame, viewport, query, write } = setupOverlay();
  overlay.frame(frame);
  write.mockClear();
  for (let i = 0; i < 60; i++) overlay.frame(frame);
  expect(write).not.toHaveBeenCalled();

  const arrow = root.children.find((el) => el.className === 'kq-hunt-arrow')!;
  expect(arrow.svg).toBeNull();
  overlay.arrow('sound', 'horn', 90, '', 1);
  const svg = arrow.svg;
  query.mockClear();
  overlay.frame(frame);
  expect(write).toHaveBeenCalledWith('left', '720.0px');
  expect(svg?.style.transform).toBe('rotate(90.0deg)');
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

it('writes the reduced-motion vignette only when its displayed opacity changes', () => {
  const { overlay, root, frame, write } = setupOverlay();
  const vignette = root.children.find((el) => el.className === 'kq-hunt-vignette')!;
  frame.alert = 0.9996;
  overlay.frame(frame);
  expect(vignette.style.opacity).toBe('0.750');
  write.mockClear();

  overlay.beat();
  for (let i = 0; i < 180; i++) {
    frame.alert += (1 - frame.alert) * frame.dt * 4;
    overlay.frame(frame);
  }
  expect(write).not.toHaveBeenCalled();
  expect(vignette.style.opacity).toBe('0.750');

  frame.alert = 0.9994;
  overlay.frame(frame);
  expect(vignette.style.opacity).toBe('0.749');
  expect(write.mock.calls).toEqual([['opacity', '0.749']]);
});
