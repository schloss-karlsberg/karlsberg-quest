import { PerspectiveCamera, Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import k2 from '../content/story/02-kapitel-2.story.json';
import type { GameContext } from '../src/core/context';
import { EventBus } from '../src/core/events';
import { CameraRig } from '../src/player/camera';
import { phonePose } from '../src/player/pose';
import { CLOSE_S, OPEN_S } from '../src/systems/photo/raise';
import photoSystem, { showViewfinder, type PhotoHooks } from '../src/systems/photo';
import { DialoguePresenter } from '../src/systems/story/dialogue/presenter';
import { speakerMeta } from '../src/systems/story/dialogue/speakers';
import { StoryOverlays } from '../src/systems/story/overlays';
import type { StoryFile } from '../src/systems/story/types';
import { MeasureTool } from '../src/systems/tools/measure';
import type { Picker } from '../src/systems/tools/picker';
import type { ModalManager } from '../src/ui/modal';

class TestElement extends EventTarget {
  classList = { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() };
  dataset = {};
  style = {};
  content = { firstElementChild: null };
  append = vi.fn();
  appendChild = vi.fn();
  remove = vi.fn();
  replaceChildren = vi.fn();
  removeAttribute = vi.fn();
  setAttribute = vi.fn();
  toggleAttribute = vi.fn();
  querySelector = () => null;
  getContext = () => null;
}

/** `player`: extra player fields (thirdPerson, reducedMotion, …); `pressed`: the actions pressed this tick. */
function phoneHarness(player: Record<string, unknown> = {}) {
  const root = new TestElement();
  const win = Object.assign(new EventTarget(), { kq: {} as { photo: PhotoHooks }, setTimeout: vi.fn() });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', {
    body: new TestElement(),
    documentElement: root,
    createElement: () => new TestElement(),
    createTextNode: () => new TestElement(),
  });
  vi.stubGlobal('Node', TestElement);
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const events = new EventBus();
  const rig = new CameraRig();
  const pressed = new Set<string>();
  const modals = { count: 0 } as ModalManager;
  photoSystem.init({
    events,
    era: { current: 'today' },
    player: { rig, position: { x: 0, y: 0, z: 0 }, ...player },
    input: { enabled: true, muted: new Set(), wasPressed: (a: string) => pressed.has(a) },
    pause: { paused: false },
    ui: { root: new TestElement(), modals, cards: { hold: vi.fn() }, toast: vi.fn() },
    world: { heightAt: () => 0 },
    state: { subscribe: vi.fn(), state: { meta: { playSeconds: 0 } }, slice: (_id: string, make: () => unknown) => make() },
    scene: new Scene(),
    camera: new PerspectiveCamera(),
  } as unknown as GameContext);
  /** One game tick with these actions pressed. */
  const tick = (...actions: string[]) => {
    for (const a of actions) pressed.add(a);
    photoSystem.update!(1 / 60);
    pressed.clear();
  };
  /** Frames of wall-clock time. */
  const frames = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) photoSystem.frame!(1 / 60);
  };
  return { photo: win.kq.photo, events, rig, root, modals, tick, frames };
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

it('lowers the phone for required dialogue and blocks reopening until it finishes', () => {
  const { photo, events, root } = phoneHarness();
  const closed = vi.fn();
  events.on('photo:close', closed);
  expect(photo.open()).toBe(true);
  events.emit('story:phone-block', { active: true });
  expect(photo.state().open).toBe(false);
  expect(root.toggleAttribute).toHaveBeenLastCalledWith('data-kq-photo', false);
  expect(closed).toHaveBeenCalledOnce();
  expect(photo.open()).toBe(false);
  events.emit('story:phone-block', { active: false });
  expect(photo.open()).toBe(true);
});

it('reports the camera hand-back after a cinematic as scene, then the guide line as dialog', () => {
  // The tour deer cinematic queues the guide's phone-down lines while it still holds the camera.
  // Its 0.4 s hand-back keeps the override slot until a drawn frame frees it (e2e/tour-slice).
  const { photo, events } = phoneHarness();
  events.emit('camera:override', { active: true });
  events.emit('story:phone-block', { active: true });
  expect(photo.state().blocked).toBe('scene');
  expect(photo.open()).toBe(false);
  events.emit('camera:override', { active: false });
  expect(photo.state().blocked).toBe('dialog');
  expect(photo.open()).toBe(false);
  events.emit('story:phone-block', { active: false });
  expect(photo.state().blocked).toBeNull();
  expect(photo.open()).toBe(true);
});

it('freezes a visible caption and keeps incoming captions queued while the phone is up', () => {
  phoneHarness();
  const shown = vi.fn();
  const presenter = new DialoguePresenter({
    layer: document.createElement('div'),
    meta: (speaker) => speakerMeta(speaker),
    voice: null,
    reducedMotion: () => true,
    name: () => 'Alex',
    onShow: shown,
  });
  const first = { id: 'first', speaker: 'imhoff', text: 'Hier entlang.', ms: 2_000 };
  const second = { id: 'second', speaker: 'imhoff', text: 'Dort ist der Weiher.' };
  presenter.enqueue(first);
  presenter.update(0.5);
  presenter.setSuspended(true);
  presenter.enqueue(second);
  presenter.update(60);
  presenter.skip();
  expect(presenter.current).toMatchObject(first);
  expect(shown).toHaveBeenCalledOnce();
  presenter.setSuspended(false);
  presenter.update(1.4);
  expect(presenter.current).toMatchObject(first);
  presenter.update(0.2);
  expect(presenter.current).toMatchObject(second);

  presenter.clear();
  presenter.setSuspended(true);
  presenter.enqueue(first);
  presenter.update(60);
  expect(presenter.current).toBeNull();
  expect(presenter.pending).toBe(1);
  presenter.setSuspended(false);
  presenter.update(0.01);
  expect(presenter.current).toMatchObject(first);
});

it('suspends the measuring scene and ignores picks without clearing the first endpoint', () => {
  phoneHarness();
  const hit = { point: { x: 2, y: 3, z: 4 }, on: 'terrain', distance: 5 };
  const pick = vi.fn(() => hit);
  const measure = new MeasureTool(
    { t: (key: string) => key } as GameContext,
    { centreRay: () => ({}), pick } as unknown as Picker,
    document.createElement('div'),
  );
  try {
    measure.start();
    measure.click();
    expect(measure.group.visible).toBe(true);
    expect(measure.mode).toBe('b');
    expect(measure.a).toBe(hit);

    measure.suspend(true);
    measure.click();
    measure.frame(1);
    expect(measure.group.visible).toBe(false);
    expect(pick).toHaveBeenCalledOnce();
    expect(measure.b).toBeNull();

    measure.suspend(false);
    expect(measure.group.visible).toBe(true);
    expect(measure.mode).toBe('b');
    expect(measure.a).toBe(hit);
  } finally {
    measure.dispose();
  }
});

describe('the phone comes out of the pocket (TASK-005)', () => {
  const walking = { thirdPerson: true, reducedMotion: false, flying: false };

  it('N plays the move: the hand out of the pocket, the camera glides in, then camera mode', () => {
    const { photo, rig, tick, frames } = phoneHarness(walking);
    tick('photo');
    expect(photo.state().open).toBe(true);
    expect(rig.photoMode).toBe(true);
    expect(rig.photoGlide).toBe(0);
    expect(phonePose.inHand).toBe(false);
    frames(0.45);
    expect(phonePose.inHand).toBe(true);
    expect(rig.photoGlide).toBeGreaterThan(0);
    expect(rig.photoGlide).toBeLessThan(1);
    frames(OPEN_S);
    expect(rig.photoGlide).toBe(1);
    expect(phonePose).toEqual({ raise: 1, inHand: true });
  });

  it('N or the shutter during the move skips to camera mode; the shutter takes no picture then', () => {
    const a = phoneHarness(walking);
    a.tick('photo');
    a.frames(0.2);
    a.tick('photo');
    expect(a.rig.photoGlide).toBe(1);
    expect(a.photo.state().open).toBe(true);
    photoSystem.dispose();
    const b = phoneHarness(walking);
    b.tick('photo');
    b.frames(0.2);
    b.tick('attack');
    expect(b.rig.photoGlide).toBe(1);
    expect(b.photo.state().lastShot).toBeNull();
  });

  it('N in camera mode plays it backwards; the phone is gone and photo mode off at the end', () => {
    const { photo, events, rig, root, tick, frames } = phoneHarness(walking);
    const closed = vi.fn();
    events.on('photo:close', closed);
    tick('photo');
    frames(OPEN_S + 0.05);
    tick('photo');
    expect(photo.state().open).toBe(false);
    expect(closed).toHaveBeenCalledOnce();
    // still gliding out
    expect(rig.photoMode).toBe(true);
    frames(0.3);
    expect(rig.photoGlide).toBeLessThan(1);
    expect(root.toggleAttribute).toHaveBeenLastCalledWith('data-kq-photo', false);
    frames(CLOSE_S);
    expect(rig.photoMode).toBe(false);
    expect(phonePose).toEqual({ raise: 0, inHand: false });
  });

  it('a forced close in the middle of either move snaps shut in the same call', () => {
    for (const mid of ['opening', 'closing'] as const) {
      const { events, rig, root, tick, frames } = phoneHarness(walking);
      tick('photo');
      if (mid === 'closing') {
        frames(OPEN_S + 0.05);
        tick('photo');
      }
      frames(0.3);
      expect(rig.photoMode).toBe(true);
      events.emit('era:change', { from: 'today', to: '1789' });
      expect(rig.photoMode).toBe(false);
      expect(phonePose).toEqual({ raise: 0, inHand: false });
      expect(root.toggleAttribute).toHaveBeenLastCalledWith('data-kq-photo', false);
      photoSystem.dispose();
    }
  });

  it('reduced motion and first person cut straight to the lens, with no phone in hand', () => {
    for (const player of [{ ...walking, reducedMotion: true }, { ...walking, thirdPerson: false }]) {
      const { rig, tick } = phoneHarness(player);
      tick('photo');
      expect(rig.photoMode).toBe(true);
      expect(rig.photoGlide).toBe(1);
      expect(phonePose.inHand).toBe(false);
      photoSystem.dispose();
    }
  });

  it('the kq.photo.open() hook stays instant for tests', () => {
    const { photo, rig } = phoneHarness(walking);
    expect(photo.open()).toBe(true);
    expect(rig.photoGlide).toBe(1);
  });
});
