/**
 * The Karlsbergquelle is the home base and wake spot (tour design, story contract C4).
 * The spring systems own the stonework, trough, water and touch interaction.
 *
 * - `x/z`: the spring (QUELLE in src/systems/quelle/layout.ts, OSM node 368031320).
 * - `r`: the present-day radius for `hub:enter` (heal, hunt reset, oil and free respec).
 * - `spawn`: where you come to. In front of the trough log (local w ≈ 2.2, the log ends at
 *   w ≈ 1.44), 1.05 m from the water, facing it: inside REACH (2.1), so the Quelle's own E
 *   „Wasser berühren“ is there when the story asks for it (`quelle.call`), in today and in 1789.
 * - `safeR`: the combat safe ring today (combat owns the ring itself: WP-02).
 */
import type { Era } from '../../../core/era';
import { QUELLE } from '../../quelle/layout';

export const HOME = {
  x: QUELLE.x,
  z: QUELLE.z,
  r: 12,
  spawn: { x: 1059.3, z: -833.1, yaw: 50 },
  safeR: 40,
} as const;

/** Is the player on foot inside the present-day home ring? */
export function atHome(x: number, z: number, era: Era, flying: boolean): boolean {
  return era === 'today' && !flying && Math.hypot(x - HOME.x, z - HOME.z) < HOME.r;
}

/**
 * Does this finished shift bring the player home (WP-04, contract C4)? Only holding Q in the past
 * (`reason 'return'`) into today. Being caught has its own wake (it already lands at home or at
 * a nearer anchor), and the spring's touch, anchors, echoes, endings and content shifts without a
 * reason leave the player where they are.
 */
export function returnsHome(e: { to: string; reason?: string }, caught = false): boolean {
  return e.to === 'today' && e.reason === 'return' && !caught;
}

/**
 * A finished shift → home, when `returnsHome` says so: teleport to HOME.spawn (facing the water),
 * then `arrived('return')` (the runtime emits `home:arrived`). Returns whether it went home.
 */
export function bringHome(
  e: { to: string; reason?: string },
  d: { caught: boolean; teleport(x: number, z: number, yawDeg: number): void; arrived(reason: 'return'): void },
): boolean {
  if (!returnsHome(e, d.caught)) return false;
  d.teleport(HOME.spawn.x, HOME.spawn.z, HOME.spawn.yaw);
  d.arrived('return');
  return true;
}
