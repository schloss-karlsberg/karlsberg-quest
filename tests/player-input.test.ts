import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlayDismissal } from '../src/ui/playDismissal';
import { inputSurface } from './player-fixture';

afterEach(() => vi.unstubAllGlobals());

const mouseMove = (movementX: number, movementY: number) => Object.assign(new Event('mousemove'), { movementX, movementY });

describe('pointer-lock input', () => {
  it('collects movement only under this canvas lock and starts sampling again on regain', () => {
    const { canvas, doc, input } = inputSurface();
    doc.dispatchEvent(mouseMove(80, 30));
    expect(input.takeMouse()).toEqual({ dx: 0, dy: 0 });
    doc.pointerLockElement = new EventTarget();
    doc.dispatchEvent(mouseMove(20, 10));
    expect(input.locked).toBe(false);
    expect(input.takeMouse()).toEqual({ dx: 0, dy: 0 });

    doc.pointerLockElement = canvas;
    doc.dispatchEvent(new Event('pointerlockchange'));
    doc.dispatchEvent(mouseMove(12, -7));
    doc.dispatchEvent(mouseMove(-2, 3));
    expect(input.locked).toBe(true);
    expect(input.takeMouse()).toEqual({ dx: 10, dy: -4 });
    doc.pointerLockElement = null;
    doc.dispatchEvent(new Event('pointerlockchange'));
    doc.dispatchEvent(mouseMove(100, 100));
    expect(input.takeMouse()).toEqual({ dx: 0, dy: 0 });
    doc.pointerLockElement = canvas;
    doc.dispatchEvent(new Event('pointerlockchange'));
    doc.dispatchEvent(mouseMove(1, 2));
    expect(input.takeMouse()).toEqual({ dx: 1, dy: 2 });
    input.dispose();
    doc.dispatchEvent(mouseMove(15, 8));
    expect(input.takeMouse()).toEqual({ dx: 0, dy: 0 });
  });

  it('drops queued mouse input from the old lock while preserving held keyboard movement', () => {
    const { canvas, doc, input } = inputSurface();
    doc.pointerLockElement = canvas;
    doc.dispatchEvent(new Event('pointerlockchange'));
    input.simulate('KeyW', true);
    canvas.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0 }));
    canvas.dispatchEvent(Object.assign(new Event('wheel'), { deltaMode: 0, deltaY: 100 }));
    doc.dispatchEvent(mouseMove(50, -20));
    expect(input.isDown('attack')).toBe(true);
    expect(input.wasPressed('attack')).toBe(true);

    doc.pointerLockElement = null;
    doc.dispatchEvent(new Event('pointerlockchange'));
    doc.pointerLockElement = canvas;
    doc.dispatchEvent(new Event('pointerlockchange'));
    doc.dispatchEvent(mouseMove(2, -1));

    expect(input.isDown('forward')).toBe(true);
    expect.soft(input.takeMouse()).toEqual({ dx: 2, dy: -1 });
    expect.soft(input.takeWheel()).toBe(0);
    expect.soft(input.isDown('attack')).toBe(false);
    expect.soft(input.wasPressed('attack')).toBe(false);
    expect(input.wasCancelled('attack')).toBe(true);
    expect(input.wasCancelled('forward')).toBe(false);
    input.endStep();
    expect(input.wasCancelled('attack')).toBe(false);
    canvas.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0 }));
    expect(input.wasPressed('attack')).toBe(true);
  });

  it.each(['keyboard', 'touch'] as const)('keeps an overlapping %s attack hold on pointer-lock loss', (source) => {
    const { canvas, doc, input } = inputSurface();
    doc.pointerLockElement = canvas;
    doc.dispatchEvent(new Event('pointerlockchange'));
    canvas.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0 }));
    if (source === 'keyboard') input.simulate('KeyK', true);
    else input.press('attack', true);

    doc.pointerLockElement = null;
    doc.dispatchEvent(new Event('pointerlockchange'));
    expect(input.isDown('attack')).toBe(true);
    expect(input.wasCancelled('attack')).toBe(false);
    if (source === 'keyboard') input.simulate('KeyK', false);
    else input.press('attack', false);
    expect(input.isDown('attack')).toBe(false);
    expect(input.wasCancelled('attack')).toBe(false);
  });

  it('drops held and queued input when the browser loses focus', () => {
    const { win, canvas, input } = inputSurface();
    input.simulate('KeyW', true);
    input.press('dodge', true);
    input.addLook(10, 20);
    canvas.dispatchEvent(Object.assign(new Event('wheel'), { deltaMode: 0, deltaY: 100 }));
    win.dispatchEvent(new Event('blur'));

    expect(input.isDown('forward')).toBe(false);
    expect(input.isDown('dodge')).toBe(false);
    expect.soft(input.wasPressed('forward')).toBe(false);
    expect.soft(input.wasPressed('dodge')).toBe(false);
    expect.soft(input.takeMouse()).toEqual({ dx: 0, dy: 0 });
    expect.soft(input.takeWheel()).toBe(0);
  });

  it('lets a rejected async request be retried without issuing concurrent requests', async () => {
    const { canvas, doc, input } = inputSurface();
    let deny!: (error: Error) => void;
    let grant!: () => void;
    const failed = new Promise<void>((_, reject) => { deny = reject; });
    const success = new Promise<void>((resolve) => { grant = resolve; });
    canvas.requestPointerLock.mockReturnValueOnce(failed).mockReturnValueOnce(success);
    input.requestLock();
    input.requestLock();
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
    deny(new Error('denied'));
    await Promise.resolve();
    input.requestLock();
    input.requestLock();
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(2);
    doc.pointerLockElement = canvas;
    grant();
    await Promise.resolve();
    input.requestLock();
    expect(input.locked).toBe(true);
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(2);
  });

  it('ignores a game-side release and handles the next player-side unlock once', () => {
    const { canvas, doc, input } = inputSurface();
    const openPause = vi.fn();
    const dismissal = createPlayDismissal({ dismissCredits: () => false, dismissNotice: () => false, openPause });
    doc.addEventListener('pointerlockchange', () => dismissal.pointerLockChanged(input.locked, input.takeSelfRelease(), true, true));
    const change = (locked: boolean) => {
      doc.pointerLockElement = locked ? canvas : null;
      doc.dispatchEvent(new Event('pointerlockchange'));
    };
    change(true);
    input.releaseLock();
    expect(doc.exitPointerLock).toHaveBeenCalledTimes(1);
    change(false);
    expect(openPause).not.toHaveBeenCalled();
    change(true);
    change(false);
    change(false);
    expect(openPause).toHaveBeenCalledTimes(1);
    expect(input.takeSelfRelease()).toBe(false);
  });
});
