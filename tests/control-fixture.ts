import { vi } from 'vitest';
import * as dom from '../src/ui/dom';

/** Record the controls built by h() so Node tests can dispatch events to their real handlers. */
export function recordControls() {
  const controls = new Map<string, ReturnType<typeof make>>();
  function make() {
    return Object.assign(new EventTarget(), {
      value: '', checked: false, textContent: '',
      attributes: new Map<string, string>(),
      setAttribute(key: string, value: string) { this.attributes.set(key, value); },
      getAttribute(key: string) { return this.attributes.get(key) ?? null; },
      scrollIntoView: vi.fn(),
      append() {}, replaceChildren() {}, setPointerCapture() {},
      matches: () => false, querySelector: () => null, querySelectorAll: () => [],
      classList: { add() {}, remove() {}, toggle() {} },
    });
  }
  const build = (_selector: string, props?: Record<string, unknown>) => {
    const el = make();
    if (props && typeof props === 'object') {
      for (const [key, value] of Object.entries(props)) {
        if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value as EventListener);
        if (key === 'data-testid' || key === 'data-section') controls.set(String(value), el);
        if (key === 'value') el.value = String(value);
        if (key === 'checked') el.checked = Boolean(value);
        if (key.startsWith('aria-') || key === 'role') el.setAttribute(key, String(value));
      }
    }
    return el;
  };
  vi.spyOn(dom, 'h').mockImplementation(build as unknown as typeof dom.h);
  vi.spyOn(dom, 'svg').mockImplementation(() => make() as unknown as SVGSVGElement);
  return (id: string) => {
    const el = controls.get(id);
    if (!el) throw new Error(`Control '${id}' was not rendered`);
    return el;
  };
}
