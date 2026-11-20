/**
 * The Laufschritt: holding sprint on an empty walk (no fight, no pack, no chase, outdoors, standing)
 * speeds the player up to ×(1 + SPRINT_BOOST). Pure ramp, unit-tested in tests/travel.test.ts; the
 * travel system eases its moveScale towards `laufschrittTarget` every step.
 *
 * Playtest round 10 (F-10, long walks): the boost waited 1.8 s before it began; it now begins
 * after 1.0 s. There is no court rule to keep here: the palace rooms already never get it
 * (`interior.room`), and "walk, don't run" in the 1789 court is only an idea (docs/IDEAS-ROUND11.md).
 */

/** Extra speed at full Laufschritt (×1.45 on the 6.2 m/s sprint ≈ 9.0 m/s). */
export const SPRINT_BOOST = 0.45;
/** Seconds of held sprint before the boost begins (1.8 until playtest round 10). */
export const LAUF_DELAY = 1.0;
/** Seconds from the start of the boost to full boost. */
export const LAUF_RISE = 1.4;

/** The boost the speed eases towards after `held` seconds of sprinting. */
export function laufschrittTarget(held: number): number {
  return held > LAUF_DELAY ? SPRINT_BOOST * Math.min(1, (held - LAUF_DELAY) / LAUF_RISE) : 0;
}
