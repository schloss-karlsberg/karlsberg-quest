import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage, SettingsStore } from '../src/core/save';
import { TouchControls, type TouchDeps } from '../src/ui/touch';
import { playerFixture } from './player-fixture';

// Renderless elements retain real event listeners so the surface handlers run as registered.
vi.mock('../src/ui/dom', () => {
  class Element extends EventTarget {
    classList = { add() {}, remove() {}, toggle() {} };
    style = {};
    append() {}
    replaceChildren() {}
    querySelector() { return null; }
    querySelectorAll() { return []; }
    setAttribute() {}
    setPointerCapture() {}
  }
  return { h: () => new Element(), svg: () => new Element() };
});

afterEach(() => vi.unstubAllGlobals());

function touchFixture() {
  const fixture = playerFixture();
  Object.assign(fixture.win, { innerWidth: 1000, innerHeight: 600 });
  Object.assign(fixture.doc, { documentElement: { toggleAttribute: vi.fn() } });
  vi.stubGlobal('MutationObserver', class { observe() {} });
  const settings = new SettingsStore(new MemoryStorage());
  settings.update((s) => { s.touchControls = 'on'; });
  const touch = new TouchControls({
    input: fixture.input,
    settings,
    hud: { setTouchIcons: vi.fn() } as unknown as TouchDeps['hud'],
    events: fixture.events,
    root: { append() {}, querySelector: () => null } as unknown as HTMLElement,
    openPause: vi.fn(),
    dismissNoticeAt: vi.fn(),
    canFly: () => true,
    flying: () => false,
    measuring: () => false,
  });
  touch.setPlaying(true);
  const pointer = (type: string, pointerId: number, clientX: number, clientY: number) => {
    const event = new Event(type, { cancelable: true });
    touch.el.dispatchEvent(Object.assign(event, { pointerType: 'touch', pointerId, clientX, clientY }));
  };
  return { ...fixture, touch, pointer };
}

describe('touch camera drag', () => {
  it('tracks look fingers independently of the stick and consumes the deltas in Player.look', () => {
    const { input, player, pointer, canvas } = touchFixture();
    input.requestLock();
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
    pointer('pointerdown', 1, 200, 300);
    pointer('pointermove', 1, 200, 230);
    expect(input.isDown('forward')).toBe(true);
    expect(input.isDown('sprint')).toBe(true);

    pointer('pointermove', 99, 765, 260);
    pointer('pointerdown', 2, 700, 300);
    pointer('pointerdown', 3, 800, 330);
    pointer('pointermove', 2, 720, 290);
    pointer('pointermove', 3, 795, 335);
    pointer('pointerup', 2, 720, 290);
    pointer('pointermove', 2, 790, 290);
    player.look();
    expect(player.yaw).toBeCloseTo(-15 * 1.8 * 0.0022);
    expect(player.pitch).toBeCloseTo(5 * 1.8 * 0.0022);
    expect(input.takeMouse()).toEqual({ dx: 0, dy: 0 });
    expect(input.isDown('forward')).toBe(true);

    pointer('pointermove', 3, 800, 335);
    expect(input.takeMouse()).toEqual({ dx: 9, dy: 0 });
    pointer('pointerup', 1, 200, 230);
    expect(input.isDown('forward')).toBe(false);
    expect(input.isDown('sprint')).toBe(false);
  });

  it.each(['pointercancel', 'lostpointercapture'])('ends only the affected look on %s', (event) => {
    const { input, pointer } = touchFixture();
    pointer('pointerdown', 2, 700, 300);
    pointer('pointerdown', 3, 800, 300);
    pointer(event, 2, 700, 300);
    pointer('pointermove', 2, 750, 350);
    pointer('pointermove', 3, 810, 295);
    expect(input.takeMouse()).toEqual({ dx: 18, dy: -9 });
    expect(input.takeMouse()).toEqual({ dx: 0, dy: 0 });
  });

  it('rebases reused pointer IDs after a pause', () => {
    const { input, touch, pointer } = touchFixture();
    pointer('pointerdown', 2, 700, 300);
    touch.setPlaying(false);
    touch.setPlaying(true);
    pointer('pointermove', 2, 860, 400);
    expect(input.takeMouse()).toEqual({ dx: 0, dy: 0 });
    pointer('pointerdown', 2, 880, 300);
    pointer('pointermove', 2, 870, 305);
    expect(input.takeMouse()).toEqual({ dx: -18, dy: 9 });
  });

  it.todo('confirm whether a released look drag should coast and how reduced motion affects it');
});
