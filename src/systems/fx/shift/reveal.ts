/**
 * Reveal window of the era-shift warm-up (pure, tested; fx/shift/warm.ts). After the era switch
 * the shift's veil hides the world: completely while it is 'full', then everything farther from
 * the camera than the reassembly radius while it runs 'in'. Objects the new era brings may stay
 * held back (not drawn, their programs compiling in the background) exactly as long as the veil
 * hides them, so nothing on screen changes.
 */

/** Slack (m) between an object's nearest point and the veil sphere before it must show. */
export const REVEAL_MARGIN = 3;

export interface VeilState {
  active: boolean;
  reduced: boolean;
  /** The era has switched (the shift's midpoint is past). */
  switched: boolean;
  veil: 'none' | 'out' | 'full' | 'in';
  /** Veil radius (m) for 'in' (the world nearer than it shows). */
  veilR: number;
  /** Veil opacity (1 = hides fully). */
  veilAlpha: number;
}

/**
 * How far from the camera (m) the veil still hides the world for objects of the new era:
 * Infinity while it is 'full', the reassembly radius while it runs 'in', 0 when nothing may be
 * held (no shift, before the switch, the reduced-motion crossfade, the veil fading out).
 */
export function holdRadius(s: VeilState): number {
  if (!s.active || s.reduced || !s.switched || s.veilAlpha < 0.999) return 0;
  if (s.veil === 'full') return Infinity;
  if (s.veil === 'in') return Math.max(0, s.veilR);
  return 0;
}

/**
 * Is an object hidden by the veil? `dist` = camera to its bounding-sphere centre, `radius` = the
 * sphere's radius (m); no sphere (NaN) counts as visible unless the veil is 'full'.
 */
export function veilHides(holdR: number, dist: number, radius: number): boolean {
  if (holdR === Infinity) return true;
  if (holdR <= 0 || !Number.isFinite(dist) || !Number.isFinite(radius)) return false;
  return dist - radius > holdR + REVEAL_MARGIN;
}

/**
 * Nearer than this (m) at the switch an object would be reached by the wave right after the void
 * opens (veil radius ≈ 6 m at t = 2.15 s): its program would not finish compiling in the
 * background by then, so it compiles at once, still inside the void, as before.
 */
export const HOLD_MIN_R = 10;

/**
 * Hold a new object back at the switch? Only with a known bounding sphere, while the veil hides
 * it, and when the wave reaches it late enough for its program to compile meanwhile.
 */
export function shouldHold(holdR: number, dist: number, radius: number): boolean {
  if (!Number.isFinite(dist) || !Number.isFinite(radius)) return false;
  return veilHides(holdR, dist, radius) && veilHides(HOLD_MIN_R, dist, radius);
}

/** Should a held object come back now? When it is warm, or as soon as the veil stops hiding it. */
export function shouldRelease(warm: boolean, holdR: number, dist: number, radius: number): boolean {
  return warm || !veilHides(holdR, dist, radius);
}
