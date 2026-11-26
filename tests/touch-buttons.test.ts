import { afterEach, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/events';
import { MemoryStorage, SettingsStore } from '../src/core/save';
import { Input } from '../src/player/input';
import type { Hud } from '../src/ui/hud';
import { TouchControls } from '../src/ui/touch';
import { recordControls } from './control-fixture';

function touchOverlay() {
  vi.useFakeTimers({ now: 0 });
  vi.stubGlobal('window', Object.assign(new EventTarget(), { innerWidth: 800, innerHeight: 400, setTimeout }));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { documentElement: { toggleAttribute() {} } }));
  vi.stubGlobal('MutationObserver', class { observe() {} });
  const control = recordControls();
  const input = new Input(new EventTarget() as HTMLElement);
  const settings = new SettingsStore(new MemoryStorage());
  settings.update((s) => { s.touchControls = 'on'; });
  const overlay = new TouchControls({
    input, settings, events: new EventBus(),
    hud: { setTouchIcons() {} } as unknown as Hud,
    root: { append() {}, querySelector: () => null } as unknown as HTMLElement,
    canFly: () => false, flying: () => false, measuring: () => false,
    openPause() {}, dismissNoticeAt() {},
  });
  overlay.setPlaying(true);
  function pointer(button: string, type: string, pointerId: number) {
    control(`touch-${button}`).dispatchEvent(Object.assign(new Event(type), { pointerId }));
  }
  return { overlay, input, pointer, settings };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('charges one attack until the last finger leaves the button', () => {
  const { input, pointer } = touchOverlay();
  pointer('attack', 'pointerdown', 1);
  expect(input.wasPressed('attack')).toBe(true);
  input.endStep();
  pointer('attack', 'pointerdown', 2);
  expect.soft(input.wasPressed('attack')).toBe(false);
  pointer('attack', 'pointerup', 1);
  pointer('attack', 'lostpointercapture', 1);
  expect.soft(input.isDown('attack')).toBe(true);
  expect.soft(input.isDown('interact')).toBe(true);
  pointer('attack', 'pointercancel', 2);
  expect(input.isDown('attack')).toBe(false);
  expect(input.isDown('interact')).toBe(false);
});

it('drops queued touch actions when controls switch off between ticks and still delivers keyboard input', () => {
  const { input, overlay, pointer, settings } = touchOverlay();
  input.simulate('KeyM', true);
  pointer('balm', 'pointerdown', 1);
  pointer('balm', 'pointerup', 1);
  pointer('shift', 'pointerdown', 2);
  settings.update((s) => { s.touchControls = 'off'; }, 'touchControls');
  expect(overlay.active).toBe(false);
  expect(input.touchMode).toBe(false);
  expect(input.isDown('shift')).toBe(false);
  expect.soft(input.wasPressed('quickUse')).toBe(false);
  expect.soft(input.wasPressed('shift')).toBe(false);
  expect(input.wasPressed('map')).toBe(true);
  expect(input.isDown('map')).toBe(true);
});
