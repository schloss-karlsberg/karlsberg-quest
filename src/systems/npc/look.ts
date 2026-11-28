/**
 * How a placed NPC is drawn (pure, no three.js; tests/npc-look.test.ts).
 *
 * People are solid: whoever the player meets stands in the player's own time (Marlene today, the
 * court in 1789), lit and opaque like the tour group. A ghost is a deliberate effect that a
 * placement asks for by name (`look: 'ghost'`: the old Pikeur who waits at the kennel today,
 * story beat k4_13) and is the only look with the kneeling pose.
 *
 * A solid figure dithers in when it appears and out when it leaves (`fadeToward`, a third of a
 * second on game time). The fade ends at exactly 0 or 1, so between the two a person is fully
 * opaque. Far from the camera the body is not drawn at all (`drawnAt`, the people contract's
 * limits).
 */
import { PEOPLE_LOD } from '../people/types';

export type FigureLook = 'solid' | 'ghost';

/** The look of a placement: a ghost only when it asks for one. */
export function figureLook(p: { look?: FigureLook | undefined }): FigureLook {
  return p.look === 'ghost' ? 'ghost' : 'solid';
}

/** Does this placement kneel? Only a ghost has the pose (the procedural figure folds its legs). */
export function kneels(p: { pose?: string | undefined; look?: FigureLook | undefined }): boolean {
  return p.pose === 'kneel' && figureLook(p) === 'ghost';
}

/**
 * A placement from a save: one written before placements had a look kneels without one, and the
 * kneeling figure was always a ghost (the Pikeur of k4_13). Returns the placement, corrected in place.
 */
export function loadedPlacement<P extends { pose?: string | undefined; look?: FigureLook | undefined }>(p: P): P {
  if (p.pose === 'kneel' && p.look === undefined) p.look = 'ghost';
  return p;
}

/** Seconds a solid figure takes to dither in or out. */
export const SOLID_FADE_S = 0.35;

/**
 * One frame of a solid figure's fade: linear toward `target` (0 or 1) and never past it. A frame
 * without game time (pause, bullet time) or a bad `dt` leaves it where it is.
 */
export function fadeToward(alpha: number, target: number, dt: number, seconds = SOLID_FADE_S): number {
  if (!Number.isFinite(alpha)) return target;
  if (!(dt > 0) || !Number.isFinite(dt)) return alpha;
  const step = dt / seconds;
  return target > alpha ? Math.min(target, alpha + step) : Math.max(target, alpha - step);
}

/**
 * Is a solid body drawn at this distance from the camera (m)? Hidden beyond the people draw limit,
 * back a little inside it, so a figure at the limit does not flicker.
 */
export function drawnAt(dist: number, was: boolean): boolean {
  if (!Number.isFinite(dist)) return true;
  return dist <= (was ? PEOPLE_LOD.drawLimit : PEOPLE_LOD.drawLimit - PEOPLE_LOD.drawReturnMargin);
}
