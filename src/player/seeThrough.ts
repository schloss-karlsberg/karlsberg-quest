import type { Vector4 } from 'three';

/**
 * See-through for the third-person view (playtest round 10, F-03 / F-15 / F-21): what the shaders
 * of the trees and the forest props need each frame (`SEE_GLSL` in src/world/atmosphere.ts) — the
 * lens, the character's chest and a second subject (the fight's locked / soft target, or the
 * speaker of a conversation). Occluders inside the cone from the lens to a subject, or pressed
 * against the lens, dither away; the crowns overhead stay. Pure maths, no allocation.
 */
export interface SeeInput {
  /** Third person with the rig's camera (no first person, no spirit view, no cut-scene camera). */
  on: boolean;
  cam: { x: number; y: number; z: number };
  /** The character's chest. */
  chest: { x: number; y: number; z: number };
  /** A fight is on (a wider cone round the character: the fight around it stays readable). */
  fight: boolean;
  /** Second subject (chest / middle) and its half-width (m), or null. */
  subject: { x: number; y: number; z: number; w: number } | null;
}

export interface SeeUniforms {
  uSeeCam: { value: Vector4 };
  uSeeP: { value: Vector4 };
  uSeeT: { value: Vector4 };
  uSeeK: { value: Vector4 };
}

/** The character's half-width for the sight cone: calm and in a fight (m). */
export const SEE_HALF = 0.55;
export const SEE_HALF_FIGHT = 0.95;
/** Inside this distance (m from the lens to the occluder's surface) an occluder is gone; falloff beyond. */
export const SEE_LENS = 0.45;
export const SEE_LENS_FALLOFF = 1.1;
/** How much of an occluder in a sight cone is dithered away (0..1; the rest stays as a ghost). */
export const SEE_CONE = 0.82;

type V3 = { x: number; y: number; z: number };
type V4 = V3 & { w: number };

const ss = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function cone(cam: V4, base: V3, r: number, top: number, s: V4): number {
  const cpx = s.x - cam.x;
  const cpz = s.z - cam.z;
  const L = Math.hypot(cpx, cpz);
  if (L < 0.4) return 0;
  const dx = cpx / L;
  const dz = cpz / L;
  const ax = base.x - cam.x;
  const az = base.z - cam.z;
  const along = ax * dx + az * dz;
  if (along < -r || along - r > L - 0.3) return 0;
  const k = Math.min(1, Math.max(0, along / L));
  const side = Math.abs(ax * dz - az * dx);
  const hw = r + s.w * k + 0.12;
  const c = 1 - ss(hw, hw + 0.45, side);
  const lineY = cam.y + (s.y - 1.0 - cam.y) * k;
  return top >= lineY - 0.15 ? c : 0;
}

/**
 * TS mirror of the shader's `kqSee` (SEE_GLSL, world/atmosphere.ts) for the tests: how much
 * (0..1) an occluder standing at `base` (radius r, top height) is thinned for the vertex `wp`.
 */
export function seeAmount(u: { cam: V4; p: V4; t: V4; k: V4 }, base: V3, r: number, top: number, wp: V3): number {
  const cam = u.cam;
  if (cam.w <= 0) return 0;
  const dx = base.x - cam.x;
  const dz = base.z - cam.z;
  const dd = dx * dx + dz * dz;
  if (dd > cam.w * cam.w) return 0;
  const lens = Math.sqrt(dd) - r;
  let s = lens < u.k.x ? 1 : 0.9 * (1 - ss(u.k.x, u.k.x + u.k.y, lens));
  s = Math.max(s, 1 - ss(0.55, 1.25, Math.hypot(wp.x - cam.x, wp.y - cam.y, wp.z - cam.z)));
  s = Math.max(s, u.k.z * cone(cam, base, r, top, u.p));
  if (u.t.w > 0) s = Math.max(s, u.k.z * cone(cam, base, r, top, u.t));
  return s;
}

/** Write the see-through uniforms for this frame (pure; tested). */
export function applySeeThrough(o: SeeInput, u: SeeUniforms): void {
  const c = u.uSeeCam.value;
  const cam = o.cam;
  const ch = o.chest;
  // off, or a NaN lens / chest (F-15: never a NaN uniform in every tree shader)
  if (!o.on || !Number.isFinite(cam.x + cam.y + cam.z + ch.x + ch.y + ch.z)) {
    c.w = 0;
    return;
  }
  // anything farther from the lens than the farthest subject (plus a margin) cannot be in the way
  let reach = Math.hypot(ch.x - cam.x, ch.z - cam.z);
  let top = Math.max(cam.y, ch.y);
  const s = o.subject && Number.isFinite(o.subject.x + o.subject.y + o.subject.z + o.subject.w) ? o.subject : null;
  if (s) {
    reach = Math.max(reach, Math.hypot(s.x - cam.x, s.z - cam.z));
    top = Math.max(top, s.y);
  }
  c.set(cam.x, cam.y, cam.z, Math.max(SEE_LENS + SEE_LENS_FALLOFF + 1.5, reach + 2.5));
  u.uSeeP.value.set(ch.x, ch.y, ch.z, o.fight ? SEE_HALF_FIGHT : SEE_HALF);
  if (s) u.uSeeT.value.set(s.x, s.y, s.z, Math.max(0.05, s.w));
  else u.uSeeT.value.w = 0;
  u.uSeeK.value.set(SEE_LENS, SEE_LENS_FALLOFF, SEE_CONE, top + 2.2);
}
