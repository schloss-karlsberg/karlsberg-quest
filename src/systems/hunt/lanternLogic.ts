/**
 * Lantern oil bookkeeping (pure). Oil 0..1 drains only while lit; `seconds` is the burn time of
 * a full lantern. Gentle mode +50 %, Rauhnacht −30 % (bible ch. 1 header).
 */
export interface LanternState {
  oil: number;
  lit: boolean;
  /** Burn time of a full lantern (s) as configured by the story. */
  seconds: number;
}

export const DEFAULT_BURN_SECONDS = 420;

export function newLantern(): LanternState {
  return { oil: 1, lit: false, seconds: DEFAULT_BURN_SECONDS };
}

export function burnSeconds(s: LanternState, mode: { gentle: boolean; rauhnacht: boolean }): number {
  return Math.max(5, s.seconds) * (mode.gentle ? 1.5 : 1) * (mode.rauhnacht ? 0.7 : 1);
}

export interface DrainResult {
  /** Oil ran out this step (lantern went dark). */
  emptied: boolean;
  /** The whole-percent value changed (throttle for 'lantern:oil'). */
  percentChanged: boolean;
}

export function drain(s: LanternState, dt: number, mode: { gentle: boolean; rauhnacht: boolean }): DrainResult {
  if (!s.lit || s.oil <= 0) return { emptied: false, percentChanged: false };
  const before = Math.ceil(s.oil * 100);
  s.oil = Math.max(0, s.oil - dt / burnSeconds(s, mode));
  const after = Math.ceil(s.oil * 100);
  if (s.oil <= 0) {
    s.lit = false;
    return { emptied: true, percentChanged: true };
  }
  return { emptied: false, percentChanged: before !== after };
}

/** Toggle; refuses to light with an empty lantern. Returns the new lit state or null if unchanged. */
export function toggle(s: LanternState, want?: boolean): boolean | null {
  const next = want ?? !s.lit;
  if (next === s.lit) return null;
  if (next && s.oil <= 0) return null;
  s.lit = next;
  return next;
}

export function refill(s: LanternState, amount = 1): void {
  s.oil = Math.min(1, Math.max(0, amount));
}
