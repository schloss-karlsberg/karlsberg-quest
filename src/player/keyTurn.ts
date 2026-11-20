/**
 * Keyboard turning (docs/NEXT-SESSION.md §3.4): ← / → (and Komma / Punkt, Ziffernblock 4 / 6)
 * turn the view, Bild↑ / Bild↓ (Ziffernblock 8 / 2) tilt it. A fallback to mouse look for
 * automation and accessibility: it works without pointer lock, in both camera modes.
 *
 * The turn rate eases towards its target with a time constant (`KEY_TURN_TAU`), so a tap turns a
 * little and a held key settles at the full rate; the easing is exponential in `dt`, so the result
 * does not depend on the step size. Pure and tested (tests/notes-turn.test.ts).
 */

/** Full yaw rate at mouse sensitivity 1 (rad/s): 120°/s. */
export const KEY_TURN_RATE = (120 * Math.PI) / 180;
/** Pitch turns slower than yaw (fraction of the yaw rate). */
export const KEY_PITCH_FACTOR = 0.7;
/** Seconds for the rate to cover ≈ 63 % of the way to its target (ease in and out). */
export const KEY_TURN_TAU = 0.08;

export interface KeyTurnRates {
  /** Current yaw rate (rad/s, + = left / counter-clockwise from above, like `Player.yaw`). */
  yaw: number;
  /** Current pitch rate (rad/s, + = up). */
  pitch: number;
}

export interface KeyTurnInput {
  /** +1 turn left, −1 turn right, 0 none. */
  h: number;
  /** +1 look up, −1 look down, 0 none. */
  v: number;
  /** Rad/s at full deflection (already scaled by the sensitivity). */
  speed: number;
}

/** Ease `rate` towards `target` over `dt` (exponential, step-size independent). */
export function easeRate(rate: number, target: number, dt: number, tau = KEY_TURN_TAU): number {
  if (dt <= 0) return rate;
  const k = 1 - Math.exp(-dt / tau);
  const r = rate + (target - rate) * k;
  // settle exactly at rest (no endless creep after the key is let go)
  return target === 0 && Math.abs(r) < 1e-4 ? 0 : r;
}

/**
 * Advance the rates by `dt` and return the yaw / pitch change of this step. Uses the exact
 * integral of the eased rate over the step, so many small steps add up to one large one.
 */
export function stepKeyTurn(rates: KeyTurnRates, inp: KeyTurnInput, dt: number, tau = KEY_TURN_TAU): { dYaw: number; dPitch: number } {
  if (dt <= 0) return { dYaw: 0, dPitch: 0 };
  const h = Math.sign(inp.h);
  const v = Math.sign(inp.v);
  const ty = h * inp.speed;
  const tp = v * inp.speed * KEY_PITCH_FACTOR;
  const e = Math.exp(-dt / tau);
  // ∫ r(t) dt with r(t) = target + (r0 − target)·e^(−t/τ)
  const integ = (r0: number, target: number) => target * dt + (r0 - target) * tau * (1 - e);
  const dYaw = integ(rates.yaw, ty);
  const dPitch = integ(rates.pitch, tp);
  rates.yaw = easeRate(rates.yaw, ty, dt, tau);
  rates.pitch = easeRate(rates.pitch, tp, dt, tau);
  return { dYaw, dPitch };
}
