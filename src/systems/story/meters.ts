/**
 * Chapter meters (pure, unit-tested). The story's `meter` action keeps one `MeterState` per id in
 * the story slice. Three ids wrap other features' timers (the value only mirrors them):
 *   oil       → hunt's lantern (threat:configure seconds + lantern:request; value = 1 − oil)
 *   smoke     → fx fire threat (smoke meter; full = player:caught by 'fire')
 *   vergessen → fx oblivion threat (Steinfraß; value = oblivion:progress)
 * Every other id is a story gauge that fills over `seconds` of GAME time (never wall-clock), only
 * in its era, not during echoes / conversations, faster while standing still (`still`).
 * Gentle mode +50 % time, Rauhnacht −30 % (bible chapter headers).
 */
import type { MeterState } from './engine';

export const WRAPPED_METERS = ['oil', 'smoke', 'vergessen'] as const;
export type WrappedMeter = (typeof WRAPPED_METERS)[number];

export function isWrapped(id: string): id is WrappedMeter {
  return (WRAPPED_METERS as readonly string[]).includes(id);
}

export interface MeterMode {
  gentle: boolean;
  rauhnacht: boolean;
}

export function meterSeconds(m: Pick<MeterState, 'seconds'>, mode: MeterMode): number {
  return Math.max(1, m.seconds) * (mode.gentle ? 1.5 : 1) * (mode.rauhnacht ? 0.7 : 1);
}

export interface MeterTick extends MeterMode {
  era: string;
  /** Player stands still (speed < 0.3 m/s for a moment). */
  still: boolean;
  /** Echo, conversation or curtain: the meter waits. */
  hold: boolean;
}

/** Advance a story gauge; returns true exactly once when it becomes full. */
export function tickMeter(m: MeterState, dt: number, e: MeterTick): boolean {
  if (isWrapped(m.id) || m.done) return false;
  if (m.era && m.era !== e.era) return false;
  if (e.hold || dt <= 0) return false;
  const rate = (e.still ? Math.max(1, m.still ?? 1) : 1) / meterSeconds(m, e);
  m.value = Math.min(1, m.value + dt * rate);
  if (m.value >= 1) {
    m.done = true;
    return true;
  }
  return false;
}

/** Push a gauge back (remembering, a found clue …). */
export function relieve(m: MeterState, amount: number): void {
  if (isWrapped(m.id)) return;
  m.value = Math.max(0, m.value - amount);
  if (m.value < 1) m.done = false;
}

export function newMeter(id: string, o: Partial<MeterState> & { seconds?: number }): MeterState {
  const m: MeterState = { id, value: 0, seconds: o.seconds ?? 90, full: o.full ?? 'return' };
  if (o.label !== undefined) m.label = o.label;
  if (o.text !== undefined) m.text = o.text;
  if (o.lossless !== undefined) m.lossless = o.lossless;
  if (o.still !== undefined) m.still = o.still;
  if (o.era !== undefined) m.era = o.era;
  return m;
}
