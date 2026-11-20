/**
 * NaN guards for the camera and avatar maths (playtest round 10, F-15: a huge black cone that did
 * not reproduce as a scene prop — most likely one exploded triangle from a NaN or huge value in
 * something tied to the player or the camera). Pure, allocation-free; tests/camera.test.ts.
 *
 * The rule: a non-finite value never reaches a transform. A frame's dt that is NaN or negative
 * counts as 0, a huge one is capped; a direction without length falls back to a given one; a
 * smoothed state that went non-finite starts again from a known value.
 */

/** `v`, or `fallback` when `v` is NaN or ±Infinity. */
export function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

/** A frame's dt for smoothing: NaN / negative / 0 → 0, huge → `max` (s). */
export function safeDt(dt: number, max = 0.1): number {
  return Number.isFinite(dt) && dt > 0 ? Math.min(max, dt) : 0;
}

/** 0..1; NaN → 0 (Math.max / Math.min pass NaN through, this does not). */
export function clamp01(t: number): number {
  return t > 0 ? (t < 1 ? t : 1) : 0;
}

/** All three components finite. */
export function finite3(v: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/** Unit direction of (x, z) into `out`, or (fx, fz) when it has no length or is not finite. */
export function dirXZ(x: number, z: number, out: { x: number; z: number }, fx = 0, fz = -1): typeof out {
  const L = Math.hypot(x, z);
  if (L > 1e-9 && Number.isFinite(L)) {
    out.x = x / L;
    out.z = z / L;
  } else {
    out.x = fx;
    out.z = fz;
  }
  return out;
}

/**
 * Ease an angle (rad) towards `want` at `rate` per second, the short way round. A non-finite
 * `want` leaves it where it is; a non-finite current angle restarts at `fallback`.
 */
export function turnToward(cur: number, want: number, rate: number, dt: number, fallback: number): number {
  if (!Number.isFinite(cur)) cur = finiteOr(fallback, 0);
  if (!Number.isFinite(want)) return cur;
  const d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
  return cur + d * (1 - Math.exp(-safeDt(dt) * rate));
}

/** Where a looping clip of duration `d` is at time `t` (0..1); 0 for a clip without length. */
export function loop01(t: number, d: number): number {
  if (!(d > 0) || !Number.isFinite(t)) return 0;
  const k = (t / d) % 1;
  return k < 0 ? k + 1 : k;
}

/**
 * The avatar's ground point this frame (F-15): false when `p` is not finite (the body holds its last
 * good pose this frame, nothing is written to the skinned mesh); a non-finite `last` (copied while
 * hidden) restarts at `p`, so the next velocity is 0 instead of NaN.
 */
export function usablePos(p: { x: number; y: number; z: number }, last: { x: number; y: number; z: number }): boolean {
  if (!finite3(p)) return false;
  if (!finite3(last)) {
    last.x = p.x;
    last.y = p.y;
    last.z = p.z;
  }
  return true;
}

/**
 * The next point pair of a swing ribbon (F-15): 'drop' when a point is not finite (clear the ribbon,
 * add nothing), 'restart' when the blade end jumped more than `jump` m since the last pair (a
 * teleport: clear, then start again here — the old points would stretch it across the screen),
 * otherwise 'add'.
 */
export function ribbonStep(prev: { x: number; y: number; z: number } | undefined, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, jump = 3): 'drop' | 'restart' | 'add' {
  if (!finite3(a) || !finite3(b)) return 'drop';
  if (prev) {
    const dx = prev.x - a.x;
    const dy = prev.y - a.y;
    const dz = prev.z - a.z;
    if (!(dx * dx + dy * dy + dz * dz <= jump * jump)) return 'restart';
  }
  return 'add';
}
