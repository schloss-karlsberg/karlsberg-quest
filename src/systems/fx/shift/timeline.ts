/**
 * Era-shift timeline (pure, unit-tested). All curves are functions of the effect time t (s).
 *
 *  0.00  begin: compass tone, scan wave leaves the player; behind it the world turns into points
 *  1.45  only the glowing point cloud is left (veil 'full')
 *  1.75  MIDPOINT: ctx.era.set(to) under cover; the land morphs to the other era's relief
 *  2.00  reassembly: a second wave rebuilds the solid world outward; the palace rises from the
 *        LiDAR ground (point line first, then the walls)
 *  3.50  done
 */
import { clamp01, easeIn, easeInOut, easeOut, lerp, smoothstep } from '../geom';

export const SHIFT_DURATION = 3.5;
export const SHIFT_MID = 1.75;
/** Reduced-motion crossfade. */
export const SHIFT_DURATION_REDUCED = 1.4;
export const SHIFT_MID_REDUCED = 0.7;

export type PalaceLook = 'hidden' | 'intact' | 'ruin';

/** Typical stub height (m above base) of the ruin shader (vBase + 0.8 … 4.0). */
const STUB = 2.4;
/** Height (m above base) at which the palace shader's uRuin = 0 cut sits. */
const TOP = 40;

/**
 * uRuin value for the palace shader that cuts the walls at `h` m above their base.
 * (The shader cuts at base + mix(40, stub, uRuin); mix extrapolates for uRuin > 1.)
 */
export function ruinForCut(h: number): number {
  return Math.max(0, (TOP - h) / (TOP - STUB));
}

/** Cut height (m above base) that shows a palace look; hidden = below ground. */
export function cutForLook(look: PalaceLook): number {
  return look === 'intact' ? TOP : look === 'ruin' ? STUB : -3;
}

/** Wave radius (m): slow near the player, then racing to the horizon. x = 0..1. */
export function waveRadius(x: number): number {
  const c = clamp01(x);
  return 1.5 + 30 * c + 3000 * c * c * c * c;
}

export interface ShiftCurves {
  /** How the veil sphere hides the solid world. */
  veil: 'none' | 'out' | 'full' | 'in';
  /** Veil radius (m) for 'out' (world nearer than R hidden) and 'in' (world nearer than R shown). */
  veilR: number;
  /** Veil opacity (1 = opaque). */
  veilAlpha: number;
  /** Height morph from-era → to-era relief (0..1). */
  morph: number;
  /** Global point-cloud opacity. */
  points: number;
  /** Scan-wave radius for the point cloud (points appear behind it). */
  waveR: number;
  /** Reassembly radius (points inside it hand over to the solid world). */
  inR: number;
  /** Palace points visible below this height above base (m). */
  palCut: number;
  /** Bright scan line on the palace points at this height above base (m). */
  palLine: number;
  /** Solid palace cut height above base (m). */
  palSolid: number;
  /** post.uShift (0..1). */
  warp: number;
  /** Brass flash at the midpoint (0..1). */
  flash: number;
  /** Compass whirl overlay opacity (0..1) and needle angle (deg). */
  whirl: number;
  needle: number;
  /** Time-rewind streaks (0..1). */
  rewind: number;
  /** Trees of the old era sink (0..1 = fraction of height gone) / new trees grow (0..1). */
  treesOut: number;
  treesIn: number;
}

export function shiftCurves(t: number, from: PalaceLook, to: PalaceLook): ShiftCurves {
  const mid = SHIFT_MID;
  const hFrom = cutForLook(from);
  const hTo = cutForLook(to);
  const pre = t < mid;
  // veil
  let veil: ShiftCurves['veil'] = 'none';
  let veilR = 0;
  let veilAlpha = 1;
  if (t < 0.05) veil = 'none';
  else if (t < 1.45) {
    veil = 'out';
    veilR = waveRadius((t - 0.05) / 1.4);
  } else if (t < 2.0) veil = 'full';
  else if (t < SHIFT_DURATION) {
    veil = 'in';
    veilR = waveRadius((t - 2.0) / 1.25);
    veilAlpha = 1 - smoothstep(3.15, 3.5, t);
  }
  const waveR = t < 0.05 ? 0 : waveRadius((t - 0.05) / 1.4);
  const inR = t < 2.0 ? 0 : waveRadius((t - 2.0) / 1.25);

  // palace: before the midpoint the old palace dissolves top-down into points; after it the new
  // palace rises out of the ground (points first, the walls 3 m behind) or the old points sink away
  let palCut: number;
  let palLine: number;
  let palSolid: number;
  if (pre) {
    const k = easeInOut((t - 0.3) / 1.15);
    palSolid = from === 'hidden' ? hFrom : lerp(hFrom === TOP ? 24 : hFrom, -3, k);
    if (from === 'hidden' && t < 0.3) palSolid = hFrom;
    palCut = from === 'hidden' ? -5 : TOP;
    palLine = palSolid;
  } else if (to !== 'hidden') {
    const k = easeInOut((t - 1.9) / 1.25);
    const top = to === 'intact' ? 24 : 9;
    palCut = lerp(-3, top, k);
    palLine = palCut;
    palSolid = Math.min(hTo, palCut - 3);
    if (t >= SHIFT_DURATION - 0.25) palSolid = hTo;
    if (to === 'intact' && palCut >= top - 0.01) palSolid = Math.max(palSolid, lerp(21, TOP, smoothstep(3.0, 3.3, t)));
  } else {
    const k = easeInOut((t - 1.9) / 0.9);
    palCut = from === 'hidden' ? -5 : lerp(24, -3, k);
    palLine = palCut;
    palSolid = hTo;
  }

  const flashT = (t - mid) / 0.14;
  return {
    veil,
    veilR,
    veilAlpha,
    morph: easeInOut((t - 1.55) / 0.75),
    points: smoothstep(0.0, 0.25, t) * (1 - smoothstep(3.05, 3.5, t)),
    waveR,
    inR,
    palCut,
    palLine,
    palSolid,
    warp: 0.85 * smoothstep(0.15, 1.5, t) * (1 - smoothstep(1.95, 3.1, t)),
    flash: Math.exp(-flashT * flashT),
    whirl: smoothstep(0.05, 0.55, t) * (1 - smoothstep(2.6, 3.3, t)),
    needle: 2160 * easeInOut(t / 3.2),
    rewind: smoothstep(0.25, 1.0, t) * (1 - smoothstep(2.3, 3.2, t)),
    treesOut: easeIn((t - 0.35) / 1.1),
    treesIn: easeOut((t - 2.05) / 1.2),
  };
}

/** Reduced motion: a plain crossfade through the veil colour. */
export function reducedCurves(t: number): { alpha: number } {
  return { alpha: smoothstep(0, 0.6, t) * (1 - smoothstep(0.8, SHIFT_DURATION_REDUCED, t)) };
}
