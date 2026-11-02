/**
 * Steinfraß / oblivion (bible 05-kapitel-4 §9): a "Vergessen" meter instead of lantern oil.
 * It fills over `seconds`, faster while the player stands still, and drops when the player
 * remembers something (a clue, an echo). Full meter = the player is caught. Pure (unit-tested).
 */
export const OBLIVION_RULES = {
  /** Fill-rate multiplier while standing still. */
  still: 1.6,
  /** Meter drop for remembering. */
  clue: 0.15,
  echo: 0.1,
  /** Gentle mode stretches the timer by this factor. */
  gentle: 1.5,
};

export class OblivionSim {
  /** 0..1 */
  t = 0;

  constructor(public seconds: number) {}

  /** One fixed step. Returns true when oblivion is complete. */
  advance(dt: number, still: boolean, gentle: boolean): boolean {
    let rate = 1 / Math.max(1, this.seconds);
    if (still) rate *= OBLIVION_RULES.still;
    if (gentle) rate /= OBLIVION_RULES.gentle;
    this.t = Math.min(1, this.t + rate * dt);
    return this.t >= 1;
  }

  remember(amount: number): void {
    this.t = Math.max(0, this.t - amount);
  }

  radius(far = 700, near = 14): number {
    return oblivionRadius(this.t, far, near);
  }
}

/** Radius (m) of the clear world around the player: shrinks from `far` to `near` as t → 1. */
export function oblivionRadius(t: number, far = 700, near = 14): number {
  const k = 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 1.6);
  return far + (near - far) * k;
}
