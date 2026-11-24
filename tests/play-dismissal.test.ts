import { expect, it, vi } from 'vitest';
import { createPlayDismissal } from '../src/ui/playDismissal';

function duringCredits() {
  const dismissCredits = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
  const dismissNotice = vi.fn().mockReturnValue(false);
  const openPause = vi.fn();
  const dismissal = createPlayDismissal({ dismissCredits, dismissNotice, openPause });
  return { dismissal, dismissCredits, dismissNotice, openPause };
}

it('dismisses the credits when Escape is reported only as loss of pointer lock', () => {
  const { dismissal, dismissCredits, dismissNotice, openPause } = duringCredits();
  dismissal.pointerLockChanged(true, false, true, true);
  dismissal.pointerLockChanged(false, false, true, true);
  dismissal.pointerLockChanged(false, false, true, true);
  expect(dismissCredits).toHaveBeenCalledTimes(1);
  expect(dismissNotice).not.toHaveBeenCalled();
  expect(openPause).not.toHaveBeenCalled();
});

it('handles Escape and the subsequent unlock as one dismissal', () => {
  const { dismissal, dismissCredits, dismissNotice, openPause } = duringCredits();
  dismissal.pointerLockChanged(true, false, true, true);
  expect(dismissal.escape()).toBe(true);
  dismissal.pointerLockChanged(false, false, true, true);
  expect(dismissCredits).toHaveBeenCalledTimes(1);
  expect(dismissNotice).not.toHaveBeenCalled();
  expect(openPause).not.toHaveBeenCalled();

  expect(dismissal.escape()).toBe(false);
  expect(openPause).toHaveBeenCalledTimes(1);
});

it('keeps the credits open when the game releases the lock or a request fails', () => {
  const { dismissal, dismissCredits, dismissNotice, openPause } = duringCredits();
  dismissal.pointerLockChanged(false, false, true, true);
  dismissal.pointerLockChanged(true, false, true, true);
  dismissal.pointerLockChanged(false, true, true, true);
  expect(dismissCredits).not.toHaveBeenCalled();
  expect(dismissNotice).not.toHaveBeenCalled();
  expect(openPause).not.toHaveBeenCalled();
});
