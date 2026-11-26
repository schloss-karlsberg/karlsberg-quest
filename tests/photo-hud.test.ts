import { readFileSync } from 'node:fs';
import { PerspectiveCamera, Scene } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import k2 from '../content/story/02-kapitel-2.story.json';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { CameraRig } from '../src/player/camera';
import photoSystem, { showViewfinder, type PhotoHooks } from '../src/systems/photo';
import { StoryOverlays } from '../src/systems/story/overlays';
import type { StoryFile } from '../src/systems/story/types';
import type { ModalManager } from '../src/ui/modal';

class TestElement extends EventTarget {
  classList = { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
  style = {};
  append = vi.fn();
  appendChild = vi.fn();
  remove = vi.fn();
  removeAttribute = vi.fn();
  setAttribute = vi.fn();
  toggleAttribute = vi.fn();
  querySelector = () => null;
  getContext = () => null;
}

function phoneHarness() {
  const root = new TestElement();
  const win = Object.assign(new EventTarget(), { kq: {} as { photo: PhotoHooks }, setTimeout: vi.fn() });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', {
    documentElement: root,
    createElement: () => new TestElement(),
    createTextNode: () => new TestElement(),
  });
  vi.stubGlobal('Node', TestElement);
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const events = new EventBus();
  const rig = new CameraRig();
  const modals = { count: 0 } as ModalManager;
  photoSystem.init({
    events,
    era: { current: 'today' },
    player: { rig },
    input: { enabled: true, muted: new Set() },
    pause: { paused: false },
    ui: { root: new TestElement(), modals, cards: { hold: vi.fn() }, toast: vi.fn() },
    world: { heightAt: () => 0 },
    state: { subscribe: vi.fn() },
    scene: new Scene(),
    camera: new PerspectiveCamera(),
  } as unknown as GameContext);
  return { photo: win.kq.photo, events, rig, root, modals };
}

afterEach(() => {
  photoSystem.dispose();
  vi.unstubAllGlobals();
});

it('switches the shared HUD-hidden state and both phone controls on entry and exit', () => {
  const root = { toggleAttribute: vi.fn() };
  const frame = { classList: { toggle: vi.fn() } as unknown as DOMTokenList };
  const zoom = { classList: { toggle: vi.fn() } as unknown as DOMTokenList };

  showViewfinder(true, root, frame, zoom);
  showViewfinder(false, root, frame, zoom);

  expect(root.toggleAttribute.mock.calls).toEqual([['data-kq-photo', true], ['data-kq-photo', false]]);
  for (const el of [frame, zoom]) {
    expect(el.classList.toggle).toHaveBeenNthCalledWith(1, 'kq-hidden', false);
    expect(el.classList.toggle).toHaveBeenNthCalledWith(2, 'kq-hidden', true);
  }
});

it('hides already visible tool and giver layers only while the viewfinder is up', () => {
  const css = readFileSync(new URL('../src/systems/photo/photo.css', import.meta.url), 'utf8');
  const rule = css.match(/html\[data-kq-photo\] :is\(([^)]*)\)\s*\{\s*display:\s*none;/)?.[1];
  const layers = ['tools', 'npc-glyphs'].map((name) => ({ selector: `[data-layer="${name}"]`, visible: true }));
  const attributes = new Set<string>();
  const root = {
    toggleAttribute: (name: string, force?: boolean) => {
      if (force) attributes.add(name);
      else attributes.delete(name);
      return !!force;
    },
  };
  const visible = () => layers.map((layer) => layer.visible && !(attributes.has('data-kq-photo') && rule?.includes(layer.selector)));

  expect(visible()).toEqual([true, true]);
  showViewfinder(true, root);
  expect(visible()).toEqual([false, false]);
  showViewfinder(false, root);
  expect(visible()).toEqual([true, true]);
});

it('lowers the phone for the lantern choice and blocks reopening through the fuse or an answer', () => {
  const { photo, events, rig, modals } = phoneHarness();
  const overlays = new StoryOverlays(new TestElement() as unknown as HTMLElement, modals, (open) => events.emit('story:inline-choice', { open }));
  const choice = (k2 as StoryFile).beats.find((beat) => beat.id === 'k2_8')?.on
    ?.flatMap((reaction) => reaction.do).find((action) => action.do === 'choice' && action.id === 'k2.tor');
  if (!choice || choice.do !== 'choice') throw new Error('Missing k2.tor choice');
  const apply = vi.fn();

  expect(photo.open()).toBe(true);
  photo.zoom(2);
  overlays.openChoice(choice, apply);
  expect(overlays.choiceId).toBe('k2.tor');
  expect(photo.state().open).toBe(false);
  expect(rig.fovWanted).toBe(1);
  expect(photo.open()).toBe(false);
  overlays.tickChoice(choice.seconds! - 1);
  expect(apply).not.toHaveBeenCalled();
  expect(photo.open()).toBe(false);
  overlays.tickChoice(1);
  expect(apply).toHaveBeenCalledWith(choice.fallback);
  expect(photo.open()).toBe(true);

  overlays.openChoice(choice, apply);
  expect(photo.open()).toBe(false);
  expect(overlays.pickChoice(0)).toBe(true);
  expect(photo.open()).toBe(true);

  overlays.openChoice(choice, apply);
  overlays.closeChoice();
  expect(photo.open()).toBe(true);
});

it('a story cue lowers the phone before the deer reaction can begin', () => {
  const { photo, events, root } = phoneHarness();
  const closed = vi.fn();
  events.on('photo:close', closed);
  expect(photo.open()).toBe(true);
  events.emit('story:cue', { id: 'photo:lower' });
  expect(photo.state().open).toBe(false);
  expect(root.toggleAttribute).toHaveBeenLastCalledWith('data-kq-photo', false);
  expect(closed).toHaveBeenCalledOnce();
});
