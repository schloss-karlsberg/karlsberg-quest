import { PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import chapterTwo from '../content/story/02-kapitel-2.story.json';
import type { GameContext } from '../src/core/context';
import { installPilot } from '../src/debug/pilot';
import { CombatHud } from '../src/systems/combat/hud';
import { EndingScreen, type EndingDeps } from '../src/systems/story/endings/ui';
import { StoryOverlays } from '../src/systems/story/overlays';
import type { ChoiceAction, StoryFile } from '../src/systems/story/types';
import { ModalManager } from '../src/ui/modal';
import { openNews } from '../src/ui/news';

function dom() {
  let active: ElementStub | null = null;
  class ElementStub extends EventTarget {
    parent: ElementStub | null = null;
    children: ElementStub[] = [];
    dataset: Record<string, string> = {};
    attrs = new Map<string, string>();
    style: Record<string, string> = {};
    className = '';
    focusOptions: FocusOptions | undefined;
    scrollTop = 0;
    constructor(readonly tag: string, private text = '') { super(); }
    get textContent(): string { return this.text + this.children.map((child) => child.textContent).join(''); }
    set textContent(value: string) { this.text = value; this.children = []; }
    get firstChild() { return this.children[0]; }
    get tabIndex() { return Number(this.attrs.get('tabindex') ?? (this.tag === 'button' ? 0 : -1)); }
    get classList() {
      const tokens = new Set(this.className.split(/\s+/).filter(Boolean));
      const toggle = (name: string, on: boolean) => {
        if (on) tokens.add(name); else tokens.delete(name);
        this.className = [...tokens].join(' ');
      };
      return { add: (...names: string[]) => names.forEach((name) => toggle(name, true)),
        remove: (name: string) => toggle(name, false), contains: (name: string) => tokens.has(name), toggle };
    }
    setAttribute(name: string, value: string) {
      this.attrs.set(name, value);
      if (name === 'data-testid') this.dataset.testid = value;
    }
    getAttribute(name: string) { return this.attrs.get(name) ?? null; }
    hasAttribute(name: string) { return this.attrs.has(name); }
    removeAttribute(name: string) {
      this.attrs.delete(name);
      if (name === 'data-testid') delete this.dataset.testid;
    }
    toggleAttribute(name: string, on: boolean) { if (on) this.setAttribute(name, ''); else this.removeAttribute(name); }
    appendChild(child: ElementStub) { this.append(child); }
    append(...nodes: ElementStub[]) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    removeChild(child: ElementStub) { this.children = this.children.filter((node) => node !== child); child.parent = null; }
    remove() { this.parent?.removeChild(this); }
    contains(node: ElementStub | null): boolean { return !!node && (node === this || this.children.some((child) => child.contains(node))); }
    matches(selector: string): boolean {
      if (selector === ':disabled') return this.hasAttribute('disabled');
      const part = /^(\w+|\.[\w-]+)?(?:\[([\w-]+)(?:="([^"]+)")?\])?$/.exec(selector);
      if (!part) throw new Error(`Unsupported test selector ${selector}`);
      const [, base, attr, value] = part;
      if (base && !(base.startsWith('.') ? this.classList.contains(base.slice(1)) : this.tag === base)) return false;
      return !attr || (value === undefined ? this.hasAttribute(attr) : this.getAttribute(attr) === value);
    }
    querySelectorAll(selector: string): ElementStub[] {
      const selectors = selector.split(', ');
      const children = this.children.filter((el) => el.tag !== '#text');
      if (selector === ':scope > h2') return children.filter((el) => el.tag === 'h2');
      return children.flatMap((child) => [...(selectors.some((s) => child.matches(s)) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
    closest(selector: string): ElementStub | null { return this.matches(selector) ? this : this.parent?.closest(selector) ?? null; }
    getClientRects() { return [1]; }
    focus(options?: FocusOptions) { active = this; this.focusOptions = options; }
  }
  const body = new ElementStub('body');
  const document = {
    body, head: new ElementStub('head'), get activeElement() { return active; },
    createElement: (tag: string) => new ElementStub(tag),
    createTextNode: (text: string) => new ElementStub('#text', text),
    querySelectorAll: (selector: string) => body.querySelectorAll(selector),
    querySelector: (selector: string) => body.querySelector(selector),
  };
  const window = new EventTarget();
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', Object.assign(window, { setTimeout, innerWidth: 920, innerHeight: 420 }));
  for (const type of ['Node', 'HTMLElement', 'HTMLInputElement']) vi.stubGlobal(type, ElementStub);
  vi.stubGlobal('getComputedStyle', () => ({ visibility: 'visible' }));
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { callback(); return 1; });
  const root = body as unknown as HTMLElement;
  return { body, document, window, root, modals: new ModalManager(root) };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('accessible UI', () => {
  it('focuses the release notes panel without scrolling to its dismissal button', async () => {
    const { document, modals } = dom();
    const notes = openNews(modals);
    await Promise.resolve();
    expect(document.activeElement).toBe(notes.el);
    expect(document.activeElement?.focusOptions).toEqual({ preventScroll: true });
    expect(notes.el.scrollTop).toBe(0);
    expect(notes.el.querySelector('.actions')?.textContent).toBe('Schließen');
  });

  it('opens the fallback credits as a static list when the OS requests it', () => {
    const { body, modals } = dom();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    new EndingScreen({ modals, credits: [], reducedMotion: () => false } as unknown as EndingDeps).credits();
    const credits = body.querySelector('.kqs-cr-view');
    expect(credits?.classList.contains('kqs-static')).toBe(true);
    expect(credits?.scrollTop).toBe(0);
  });

  it('keeps the dazzle status visible at full strength until the debuff expires', () => {
    const { body, root } = dom();
    const hud = new CombatHud({ dock: () => {} }, root);
    const status = body.querySelector('.kqc-dazzle')!;
    const frame = (dazzle: number) => hud.frame({ dt: 1 / 60, camera: new PerspectiveCamera(), reducedFlash: false,
      reducedMotion: true, lowHp: 0, pips: [], dazzle });
    for (const seconds of [1.2, 0.01]) {
      frame(seconds);
      expect(status.classList.contains('steady')).toBe(true);
      expect(status.textContent).toBe('Geblendet');
      expect(status.style.opacity).toBe('1');
    }
    frame(0);
    expect(status.classList.contains('steady')).toBe(false);
    expect(status.style.opacity).toBe('0');
  });

  it('applies the chapter-two inline branch through the story choice API before timeout', () => {
    vi.useFakeTimers();
    const { root, window, modals } = dom();
    const overlays = new StoryOverlays(root, modals);
    const chapter = chapterTwo as StoryFile;
    const action = chapter.beats.find((b) => b.id === 'k2_8')?.on?.flatMap((r) => r.do).find((a): a is ChoiceAction => a.do === 'choice');
    expect(action).toBeDefined();
    const flags: Record<string, unknown> = {};
    overlays.openChoice(action!, (i) => Object.assign(flags, action!.options[i]?.set));
    const choose = vi.fn((_index: number) => false);
    Object.assign(window, { kq: { story: { choose } } });
    const pilot = installPilot({ loop: { time: 0, manual: true }, ui: { hud: { setBulletTime: () => {} } } } as unknown as GameContext);
    expect(pilot.choose(1)).toBeNull();
    expect(overlays.choiceId).toBe('k2.tor');
    choose.mockImplementation((i: number) => overlays.pickChoice(i));
    expect(pilot.choose(1)).toBe('Ihnen leuchten (Laterne an)');
    expect(choose).toHaveBeenLastCalledWith(0);
    expect(overlays.choiceId).toBeNull();
    overlays.tickChoice(60);
    expect(flags['flag.k2_tor']).toBe('leuchten');
  });
});
