/**
 * How the pack perceives the player: sight cone with a terrain line-of-sight ray-march (forest
 * cover and buildings attenuate), hearing from the player's noise. Pure functions over a small
 * world interface so they can be unit-tested with synthetic terrain.
 */
import type { Stance } from '../../player/stance';

export interface SenseWorld {
  heightAt(x: number, z: number): number;
  surfaceAt(x: number, z: number): string;
  /** 0..1 tree cover. */
  coverAt(x: number, z: number): number;
  /** Extra blocking height above the ground (buildings, walls), 0 if none. */
  obstacleAt?(x: number, z: number): number;
}

export interface PlayerSense {
  x: number;
  y: number;
  z: number;
  stance: Stance;
  /** 0..1 (player.stats.noise) */
  noise: number;
  /** 0..1 (player.stats.visibility; already includes stance, cover, motion and the lantern ×1.6) */
  visibility: number;
  lanternLit: boolean;
  speed: number;
  flying: boolean;
  /** In the i-frames of a dodge roll (Space): a lunging hound sails past. */
  dodging?: boolean;
}

export interface SenseTuning {
  /** Base sight range at night for a standing, unlit player (m). Bible: 30 clear, 15 fog. */
  sight: number;
  /** Extra range a lit lantern adds (m). Bible: 70 clear (→ +40), 80 in fog (→ +65). */
  beacon: number;
  /** Hearing range for noise 1.0 (m). Walking (0.45) ≈ 15 m, running ≈ 30 m. */
  hearing: number;
  /** Multiplier for gentle mode / Rauhnacht / intensity. */
  acuity: number;
}

/** Eye height of the target point per stance (m above ground). */
export const TARGET_HEIGHT: Record<Stance, number> = { stand: 1.45, crouch: 0.85, prone: 0.22 };

/** Lantern factor already baked into player.stats.visibility (see Player.update). */
const VIS_LANTERN = 1.6;

/**
 * Transmittance 0..1 of a sight line from a to b: 0 when terrain/buildings block it, reduced by
 * forest cover along the way. Ray-marched at `step` metres.
 */
export function lineOfSight(w: SenseWorld, ax: number, ay: number, az: number, bx: number, by: number, bz: number, step = 2): number {
  const dx = bx - ax;
  const dz = bz - az;
  const d = Math.hypot(dx, dz);
  if (d < 0.5) return 1;
  const n = Math.max(1, Math.ceil(d / step));
  let t = 1;
  // skip the first/last metre (the eye and the target stand on the terrain themselves)
  for (let i = 1; i < n; i++) {
    const f = i / n;
    const s = f * d;
    if (s < 0.8 || d - s < 0.6) continue;
    const x = ax + dx * f;
    const z = az + dz * f;
    const y = ay + (by - ay) * f;
    const g = w.heightAt(x, z) + (w.obstacleAt ? w.obstacleAt(x, z) : 0);
    if (g > y - 0.05) return 0;
    const c = w.coverAt(x, z);
    if (c > 0) t *= Math.exp(-c * 0.032 * (d / n));
  }
  return t;
}

/**
 * 0..1 how sunken the point lies relative to its surroundings (hollow ways, ditches, the foot of
 * a terrace). 1 m below the ring mean ≈ 0.5, 2 m ≈ 1.
 */
export function hollowness(w: SenseWorld, x: number, z: number, r = 7): number {
  const h = w.heightAt(x, z);
  let sum = 0;
  let higher = 0;
  const N = 8;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const hh = w.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r);
    sum += hh;
    if (hh > h + 0.6) higher++;
  }
  const below = Math.max(0, Math.min(1, (sum / N - h) / 1.6));
  // a real hollow way is enclosed on several sides (a plain slope is "higher" only uphill)
  const enclosure = Math.max(0, Math.min(1, (higher - 2) / 4));
  const v = Math.min(1, 0.5 * below + 0.5 * enclosure);
  return higher >= 3 ? v : v * 0.3;
}

/** Effective sight range (m) at which the player can be noticed right now. */
export function sightRange(p: PlayerSense, tune: SenseTuning, hollow: number): number {
  if (p.flying) return 0;
  // player.stats.visibility is capped at 1 after the lantern factor: undo it where we can
  const visNoLantern = p.lanternLit && p.visibility < 0.999 ? p.visibility / VIS_LANTERN : p.visibility;
  let r = tune.sight * visNoLantern;
  if (p.lanternLit) r += tune.beacon * (p.stance === 'prone' ? 0.55 : 1);
  if (p.stance === 'prone' && p.speed < 0.2) r *= 0.6; // lying still: nearly part of the ground
  r *= 1 - 0.55 * hollow;
  return Math.max(0, r * tune.acuity);
}

/** Hearing range (m) for the current noise. Wading/splashing in water is loud. */
export function hearRange(p: PlayerSense, tune: SenseTuning, hollow: number, inWater: boolean): number {
  if (p.flying) return 0;
  let noise = p.noise;
  if (inWater && p.speed > 0.3) noise = Math.max(noise, p.stance === 'prone' ? 0.3 : 0.75);
  // hollow ways: still air, the pack hears half as far (bible ch. 2, §9)
  return noise * tune.hearing * (1 - 0.5 * hollow) * tune.acuity;
}

export interface Sighting {
  /** 0 = not seen, else 0..1 how clearly (closeness × transmittance). */
  strength: number;
  dist: number;
}

/**
 * Can an observer at (ox, oy-eye, oz) facing `heading` (radians, 0 = −z/north, CCW positive like
 * the player yaw) see the player? `fovDeg` full cone; inside `nearSense` metres it notices you in
 * any direction.
 */
export function look(
  w: SenseWorld,
  o: { x: number; z: number; eyeY: number; heading: number; fovDeg: number; nearSense: number },
  p: PlayerSense,
  range: number,
): Sighting {
  const dx = p.x - o.x;
  const dz = p.z - o.z;
  const dist = Math.hypot(dx, dz);
  if (range <= 0 || dist > range) return { strength: 0, dist };
  if (dist > o.nearSense) {
    const fx = -Math.sin(o.heading);
    const fz = -Math.cos(o.heading);
    const cos = (fx * dx + fz * dz) / Math.max(dist, 1e-6);
    if (cos < Math.cos(((o.fovDeg / 2) * Math.PI) / 180)) return { strength: 0, dist };
  }
  const ty = p.y + TARGET_HEIGHT[p.stance];
  const tr = lineOfSight(w, o.x, o.eyeY, o.z, p.x, ty, p.z);
  if (tr <= 0.05) return { strength: 0, dist };
  const close = 1 - dist / range;
  // transmittance shortens the effective range
  if (dist > range * (0.35 + 0.65 * tr)) return { strength: 0, dist };
  return { strength: Math.max(0.05, Math.min(1, Math.sqrt(close) * tr)), dist };
}
