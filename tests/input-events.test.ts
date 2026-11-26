import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Input } from '../src/player/input';

let input: Input;
let canvas: EventTarget;

beforeEach(() => {
  canvas = new EventTarget();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { pointerLockElement: canvas }));
  input = new Input(canvas as HTMLElement);
});
afterEach(() => {
  input.dispose();
  vi.unstubAllGlobals();
});

function send(target: EventTarget, type: string, data: Record<string, unknown>) {
  const event = Object.assign(new Event(type, { cancelable: true }), data);
  target.dispatchEvent(event);
  return event;
}

it.each(['blur', 'pause'] as const)('discards pending actions, turns and zoom on %s before the next step', (interruption) => {
  send(window, 'keydown', { code: 'Digit2', shiftKey: true });
  send(window, 'keyup', { code: 'Digit2' });
  send(document, 'mousemove', { movementX: 10, movementY: -4 });
  send(canvas, 'wheel', { deltaMode: 0, deltaY: 100 });
  if (interruption === 'blur') window.dispatchEvent(new Event('blur'));
  else {
    input.enabled = false;
    input.enabled = true;
  }
  expect.soft(input.wasPressed('scan')).toBe(false);
  expect.soft(input.takeMouse()).toEqual({ dx: 0, dy: 0 });
  expect.soft(input.takeWheel()).toBe(0);
  send(window, 'keydown', { code: 'Digit2', shiftKey: false });
  expect(input.wasPressed('scan')).toBe(true);
  expect(input.wasPressedWithShift('scan')).toBe(false);
});

it('keeps a key held across repeat events without replaying its action', () => {
  input.setBindings({ listen: ['Space'] });
  expect(send(window, 'keydown', { code: 'Space' }).defaultPrevented).toBe(true);
  expect(input.wasPressed('listen')).toBe(true);
  input.endStep();
  send(window, 'keydown', { code: 'Space', repeat: true });
  expect(input.isDown('listen')).toBe(true);
  expect(input.wasPressed('listen')).toBe(false);
  send(window, 'keyup', { code: 'Space' });
  expect(input.isDown('listen')).toBe(false);
});

it('ignores gameplay controls in a modal while Escape is available to close it', () => {
  input.enabled = false;
  expect(send(window, 'keydown', { code: 'Space' }).defaultPrevented).toBe(false);
  send(window, 'keydown', { code: 'Escape' });
  send(document, 'mousemove', { movementX: 5, movementY: 3 });
  expect(send(canvas, 'wheel', { deltaMode: 1, deltaY: 3 }).defaultPrevented).toBe(false);
  expect(input.wasPressed('pause')).toBe(true);
  send(window, 'keyup', { code: 'Escape' });
  input.enabled = true;
  expect(input.wasPressed('pause')).toBe(false);
  expect(input.wasPressed('dodge')).toBe(false);
  expect(input.isDown('dodge')).toBe(false);
  expect(input.takeMouse()).toEqual({ dx: 0, dy: 0 });
  expect(input.takeWheel()).toBe(0);
});

it('accumulates locked movement and wheel units once per read', () => {
  send(document, 'mousemove', { movementX: 12, movementY: -4 });
  send(document, 'mousemove', { movementX: -4, movementY: 3 });
  expect(input.takeMouse()).toEqual({ dx: 8, dy: -1 });
  expect(input.takeMouse()).toEqual({ dx: 0, dy: 0 });
  send(canvas, 'wheel', { deltaMode: 0, deltaY: 50 });
  send(canvas, 'wheel', { deltaMode: 1, deltaY: 2 });
  send(canvas, 'wheel', { deltaMode: 2, deltaY: -1 });
  expect(input.takeWheel()).toBeCloseTo(0.5 + 0.8 - 3);
  expect(input.takeWheel()).toBe(0);
});

it('retries a denied pointer lock and consumes a game-initiated unlock only once', async () => {
  const denied = Promise.reject(new Error('denied'));
  const request = vi.fn().mockReturnValueOnce(denied);
  Object.assign(canvas, { requestPointerLock: request });
  Object.assign(document, { pointerLockElement: null, exitPointerLock() {} });
  input.requestLock();
  input.requestLock();
  expect(request).toHaveBeenCalledTimes(1);
  await expect(denied).rejects.toThrow('denied');
  input.requestLock();
  expect(request).toHaveBeenCalledTimes(2);
  input.releaseLock();
  expect(input.takeSelfRelease()).toBe(false);

  Object.assign(document, { pointerLockElement: canvas });
  input.requestLock();
  expect(request).toHaveBeenCalledTimes(2);
  input.releaseLock();
  expect(input.takeSelfRelease()).toBe(true);
  expect(input.takeSelfRelease()).toBe(false);
});
