/**
 * Bullet time and the clocks that normally follow real time (playtest round 10, docs/NEXT-SESSION.md
 * §3.1): in bullet time the game moves only through `kq.step` / `kq.pilot.act`, and frames are
 * drawn only on request. A clock that runs on frame time or on `setTimeout` then follows the wall
 * clock (or the pilot's frame captures) instead of game time. These helpers say when such a clock
 * should follow the fixed steps instead. Normal play is unchanged.
 */

/**
 * Do the visual clocks that normally follow frame time (the era shift) step with the fixed updates?
 * Yes in bullet time with the full idle policy (no frames drawn on their own). Under WebDriver
 * without `?idle` the rAF loop keeps drawing in `?manual`, and those specs keep their old timing.
 */
export function stepsDriveVisuals(manual: boolean, webdriver: boolean, idle: boolean): boolean {
  return manual && (!webdriver || idle);
}

/** `stepsDriveVisuals` for the running page. */
export function stepsDriveVisualsNow(manual: boolean, params: URLSearchParams): boolean {
  const webdriver = typeof navigator !== 'undefined' && navigator.webdriver === true;
  return stepsDriveVisuals(manual, webdriver, params.has('idle'));
}

/**
 * Should a real-time wait (a `setTimeout` curtain, e.g. fast travel) be skipped and its end run at
 * once? In `?manual` (deterministic tests, as before) and in bullet time switched on at runtime.
 */
export function skipRealTimeWaits(manual: boolean, params: URLSearchParams): boolean {
  return manual || params.has('manual');
}

/** Campaign automation opts into subtitle timing and defers painting stepped frames to rAF. */
export function fastManualSteps(params: URLSearchParams): boolean {
  return params.has('manual') && params.has('faststep');
}
