/**
 * Home is the Karlsbergquelle (tour design, story contract C4): the hub, the wake spot and the
 * safe place sit at the spring, not at a trailer. No mesh of its own: the stonework, the trough and
 * the water are the spring's scenery set (src/systems/scenery/quelle.ts, src/systems/quelle/).
 *
 * - `x/z`: the spring (QUELLE in src/systems/quelle/layout.ts, OSM node 368031320).
 * - `r`: the hub radius, today only: inside it `hub:enter` fires (combat heal, hunt reset and oil,
 *   free respec follow that event) and E opens the hub overlay (a low prompt).
 * - `spawn`: where you come to. In front of the trough log (local w ≈ 2.2, the log ends at
 *   w ≈ 1.44), 1.05 m from the water, facing it: inside REACH (2.1), so the Quelle's own E
 *   „Wasser berühren“ is there when the story asks for it (`quelle.call`), in today and in 1789.
 * - `troughR`: round the trough's water the Quelle owns E while `quelle.call` is set; the hub's
 *   prompt stays away there (it shows again as soon as the flag is cleared).
 * - `safeR`: the combat safe ring today (combat owns the ring itself: WP-02).
 */
import { QUELLE, touchLocal, toWorld } from '../../quelle/layout';

export const HOME = {
  x: QUELLE.x,
  z: QUELLE.z,
  r: 12,
  spawn: { x: 1059.3, z: -833.1, yaw: 50 },
  troughR: 2.5,
  safeR: 40,
} as const;

/** The trough's water today (the Quelle's touch point): the centre of `HOME.troughR`. */
export const HOME_TROUGH: { readonly x: number; readonly z: number } = (() => {
  const [x, z] = toWorld(...touchLocal('today'));
  return { x, z };
})();

/** Is x/z inside the hub (today's era is the caller's business)? */
export function atHome(x: number, z: number): boolean {
  return Math.hypot(x - HOME.x, z - HOME.z) < HOME.r;
}

/** Is x/z at the trough, where the Quelle's E wins while `quelle.call` is set? */
export function atTrough(x: number, z: number): boolean {
  return Math.hypot(x - HOME_TROUGH.x, z - HOME_TROUGH.z) < HOME.troughR;
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

/**
 * The hub's state at a spot (pure; StoryRuntime.updateHub acts on it): `inside` — in the hub
 * (today's era, within `HOME.r`, on foot): `hub:enter` / `hub:leave` follow it; `quelleOwnsE` — the
 * Quelle's „Wasser berühren“ owns E here (its prompt is up, or `quelle.call` is set and x/z is at
 * the trough), so the hub shows no prompt and E does not open it; `prompt` — the hub's low prompt.
 */
export function hubAt(s: { era: string; x: number; z: number; flying?: boolean; flags: Readonly<Record<string, unknown>> }): {
  inside: boolean;
  quelleOwnsE: boolean;
  prompt: boolean;
} {
  const inside = s.era === 'today' && !s.flying && atHome(s.x, s.z);
  const quelleOwnsE = s.flags['e.owner'] === 'quelle' || (s.flags['quelle.call'] === true && atTrough(s.x, s.z));
  return { inside, quelleOwnsE, prompt: inside && !quelleOwnsE };
}
