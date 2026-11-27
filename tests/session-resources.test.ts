import { PerspectiveCamera, Scene } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/core/context';
import type { Era } from '../src/core/era';
import { EventBus } from '../src/core/events';
import { MemoryStorage } from '../src/core/save';
import { createInitialState, GameStateStore } from '../src/core/state';
import { FestPartySet } from '../src/systems/party/fest';
import { partyLayout } from '../src/systems/party/placements';
import { CreditsStrip } from '../src/systems/party/strip';
import photo, { type PhotoHooks } from '../src/systems/photo';
import { TitleScreen, type TitleCallbacks } from '../src/ui/title';
import { disposalCounts } from './disposal-counts';

class Element extends EventTarget {
  readonly children: Element[] = [];
  readonly attributes = new Map<string, string>();
  readonly style: Record<string, string> = {};
  parent: Element | null = null;
  className = '';
  textContent = '';
  readonly classList = {
    contains: (name: string) => this.className.split(' ').includes(name),
    add: (...names: string[]) => { this.className = [...new Set([...this.className.split(' '), ...names])].join(' '); },
    remove: (...names: string[]) => { this.className = this.className.split(' ').filter((name) => !names.includes(name)).join(' '); },
    toggle: (name: string, on = !this.classList.contains(name)) => {
      if (on) this.classList.add(name);
      else this.classList.remove(name);
      return on;
    },
  };

  appendChild(node: Element) { this.append(node); }
  append(...nodes: Element[]) {
    for (const node of nodes) {
      node.remove();
      node.parent = this;
      this.children.push(node);
    }
  }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  replaceChildren(...nodes: Element[]) {
    for (const child of [...this.children]) child.remove();
    this.append(...nodes);
  }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  toggleAttribute(name: string, on: boolean) {
    if (on) this.setAttribute(name, '');
    else this.removeAttribute(name);
  }
  querySelector(selector: string): Element | null {
    for (const child of this.children) {
      if (child.classList.contains(selector.slice(1))) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  contains(node: unknown): boolean {
    return node === this || this.children.some((child) => child.contains(node));
  }
  focus() {}
  getContext() { return null; }
}

function setupDom() {
  const body = new Element();
  const documentElement = new Element();
  const kq: { photo?: PhotoHooks } = {};
  const window = Object.assign(new EventTarget(), { kq });
  vi.stubGlobal('Node', Element);
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', {
    body, documentElement,
    createElement: () => new Element(),
    createTextNode: (textContent: string) => Object.assign(new Element(), { textContent }),
  });
  return { body, documentElement, kq, window };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A save slot with a readable autosave, so the title offers „Weiter“. */
function readableSave(): TitleCallbacks['save'] {
  return { enabled: true, availability: () => 'readable', readRaw: () => '{}', load: () => true };
}

it('reuses a single title menu through animated and reduced-motion start and return', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const { body } = setupDom();
  const onStart = vi.fn();
  const title = new TitleScreen({ save: readableSave(), onStart, onLicences() {}, confirm: async () => true });
  const el = title.el as unknown as Element;
  body.append(el);
  const continueButton = el.querySelector('.primary')!;

  for (const reduced of [false, true, false, true]) {
    title.show();
    title.setReady();
    expect(el.classList.contains('kq-hidden')).toBe(false);
    const calls = onStart.mock.calls.length;
    continueButton.dispatchEvent(new Event('click'));
    expect(onStart).toHaveBeenCalledTimes(calls + 1);
    expect(onStart).toHaveBeenLastCalledWith('continue');
    title.hide(reduced);
    expect(vi.getTimerCount()).toBe(reduced ? 0 : 1);
    vi.advanceTimersByTime(950);
    expect(el.classList.contains('kq-hidden')).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(body.children).toEqual([el]);
  }
});

it('keeps a reopened title visible past the interrupted fade deadline', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  setupDom();
  const title = new TitleScreen({ save: readableSave(), onStart() {}, onLicences() {}, confirm: async () => true });

  title.hide();
  vi.advanceTimersByTime(475);
  expect(title.el.classList.contains('fade-out')).toBe(true);
  title.show();
  expect(title.el.classList.contains('fade-out')).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(500);
  expect(title.el.classList.contains('kq-hidden')).toBe(false);
});

it('reuses the phone chrome and key handler through repeated forced closes', () => {
  const { body, documentElement, kq, window } = setupDom();
  const addKey = vi.spyOn(window, 'addEventListener');
  const removeKey = vi.spyOn(window, 'removeEventListener');
  const events = new EventBus();
  const onClose = vi.fn();
  events.on('photo:close', onClose);
  const rig = { setPhoto: vi.fn(), setPhotoBlend: vi.fn(), setFovScale: vi.fn(), snapFov: vi.fn() };
  const muted = new Set(['walk']);
  const era = { current: 'today' as Era };
  const state = new GameStateStore(createInitialState());
  const cardHold = vi.fn();
  const scene = new Scene();
  const ctx = {
    state, events, scene, era, player: { rig }, camera: new PerspectiveCamera(),
    world: { heightAt: () => 0 }, pause: { paused: false }, input: { enabled: true, muted },
    ui: { root: body, cards: { hold: cardHold }, modals: { count: 0 }, toast() {} },
  } as unknown as GameContext;
  photo.init(ctx);
  try {
    const chrome = [...body.children];
    expect(chrome).toHaveLength(4);
    expect(addKey).toHaveBeenCalledExactlyOnceWith('keydown', expect.any(Function), { capture: true });
    for (const [i, cause] of ['pause', 'camera', 'era', 'pause'].entries()) {
      expect(kq.photo!.open()).toBe(true);
      kq.photo!.zoom(2);
      expect(muted.has('attack')).toBe(true);
      expect(documentElement.attributes.has('data-kq-photo')).toBe(true);
      if (cause === 'pause') events.emit('game:pause', { paused: true });
      if (cause === 'camera') {
        events.emit('camera:override', { active: true });
        events.emit('camera:override', { active: false });
      }
      if (cause === 'era') {
        era.current = '1789';
        events.emit('era:change', { from: 'today', to: '1789' });
      }
      expect(onClose).toHaveBeenCalledTimes(i + 1);
      expect(rig.snapFov).toHaveBeenCalledTimes(i + 1);
      expect(muted).toEqual(new Set(['walk']));
      expect(cardHold).toHaveBeenLastCalledWith('photo', false);
      expect(documentElement.attributes.has('data-kq-photo')).toBe(false);
      expect(body.children.every((node, index) => node === chrome[index])).toBe(true);
      expect(body.children).toHaveLength(chrome.length);
    }
    expect(addKey).toHaveBeenCalledTimes(1);
  } finally {
    photo.dispose?.();
  }
  expect(removeKey).toHaveBeenCalledExactlyOnceWith(...addKey.mock.calls[0]!);
  expect(body.children).toHaveLength(0);
  expect(scene.children).toHaveLength(0);
});

it('drops every credits strip and restores the party set to its resource baseline', () => {
  const { body, documentElement } = setupDom();
  const strip = new CreditsStrip({ label: 'Abspann', hint: '', hintCamera: '', button: 'Weiter' }, () => {});
  const set = new FestPartySet(() => 0, () => 'low');
  const scene = new Scene();
  const counts = disposalCounts();
  for (const [i, variant] of (['museum', 'burn', 'keep', 'burn'] as const).entries()) {
    const handle = set.build(scene, partyLayout(variant), variant);
    counts.watchTree(scene);
    const reduced = i % 2 === 0;
    strip.show(['Ende'], reduced);
    expect(body.children).toHaveLength(2);
    expect(documentElement.attributes.get('data-kq-credits')).toBe(reduced ? 'static' : 'crawl');
    const liveSet = counts.live();
    expect(liveSet).toBeGreaterThan(0);
    strip.hide();
    expect(documentElement.attributes.has('data-kq-credits')).toBe(false);
    expect(body.children).toHaveLength(0);
    expect(counts.live()).toBe(liveSet);
    handle.dispose();
    expect(scene.children).toHaveLength(0);
    expect(counts.live()).toBe(0);
  }
  expect(counts.repeated()).toEqual([]);
});

it.todo('Define whether a title round trip resumes a half-heard Chronik echo or retires its stage and audio.');
