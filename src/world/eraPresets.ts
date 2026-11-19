import type { Era } from '../core/era';

/**
 * Look of each era: light, sky, fog and colour grade. Colours are sRGB hex (converted to linear
 * by three's colour management). Directions use grid azimuth (0 = north, 90 = east) and elevation.
 * Night eras use the "sun" slot for moonlight.
 */
export interface EraLook {
  sun: { azimuth: number; elevation: number; color: string; intensity: number };
  /** Visible sun/moon disc in the sky. */
  disc: 'sun' | 'moon' | 'none';
  sky: { zenith: string; horizon: string; below: string; clouds: number; cloudColor: string; stars: number };
  ambient: { sky: string; ground: string; intensity: number };
  fog: { color: string; sunColor: string; density: number; heightDensity: number; base: number; falloff: number; /** extra haze at eye level near the ground (per m, first 260 m) */ ground: number };
  grade: { exposure: number; saturation: number; contrast: number; lift: string; gain: string; vignette: number; grain: number };
  glow: { color: string; intensity: number };
  /**
   * Render baseline (docs/ART-DIRECTION.md): bloom strength / threshold (exposed linear HDR), AO
   * strength, sun-shadow strength (0..1), white balance (multiplier, before tone mapping) and split
   * toning (added to shadows / highlights in display space). Tier-gated: low ignores all but shadow
   * (which low does not render either).
   */
  post: { bloom: number; bloomThreshold: number; ao: number; shadow: number; white: string; shadowTint: string; highTint: string };
  snow: number;
  /** 0 summer, 1 autumn, 2 winter bare. */
  season: number;
}

export const ERA_LOOKS: Record<Era, EraLook> = {
  today: {
    // art direction: a golden autumn afternoon — warm low sun, blue-teal shade, amber haze
    // between the trunks instead of a grey wall (docs/ART-DIRECTION.md §2)
    sun: { azimuth: 222, elevation: 19, color: '#ffd8a6', intensity: 3.2 },
    disc: 'sun',
    sky: { zenith: '#4f7fb2', horizon: '#e2d5bb', below: '#5d6560', clouds: 0.5, cloudColor: '#f3e8d8', stars: 0 },
    ambient: { sky: '#8aa2c0', ground: '#5a4632', intensity: 0.85 },
    fog: { color: '#bdb5a0', sunColor: '#f2cc94', density: 0.0007, heightDensity: 0.0035, base: 255, falloff: 30, ground: 0.0045 },
    grade: { exposure: 1.06, saturation: 1.06, contrast: 1.08, lift: '#0a0c10', gain: '#fff6e8', vignette: 0.32, grain: 0.03 },
    glow: { color: '#000000', intensity: 0 },
    post: { bloom: 0.45, bloomThreshold: 1.25, ao: 0.85, shadow: 0.82, white: '#fff3e2', shadowTint: '#00050f', highTint: '#0d0700' },
    snow: 0,
    season: 1,
  },
  '1789': {
    // integration pass (owner: "lush 1789"): a late-afternoon sun a little higher and a cooler,
    // thinner haze, so the meadows read green instead of a uniform sand under orange fog
    sun: { azimuth: 262, elevation: 20, color: '#ffd4a0', intensity: 3.0 },
    disc: 'sun',
    sky: { zenith: '#3a6aa4', horizon: '#e9d6b4', below: '#6b5a44', clouds: 0.45, cloudColor: '#fbe7cf', stars: 0 },
    ambient: { sky: '#9ab4cc', ground: '#4f4a30', intensity: 0.9 },
    fog: { color: '#c9ccbc', sunColor: '#ffd8a8', density: 0.0006, heightDensity: 0.0025, base: 255, falloff: 30, ground: 0.0024 },
    grade: { exposure: 1.05, saturation: 1.1, contrast: 1.06, lift: '#120c06', gain: '#fff2dc', vignette: 0.33, grain: 0.03 },
    glow: { color: '#000000', intensity: 0 },
    post: { bloom: 0.55, bloomThreshold: 1.2, ao: 0.8, shadow: 0.85, white: '#fff1dc', shadowTint: '#02040e', highTint: '#100800' },
    snow: 0,
    season: 0,
  },
  '1793-02': {
    sun: { azimuth: 150, elevation: 38, color: '#9fb6e0', intensity: 0.9 },
    disc: 'moon',
    sky: { zenith: '#070b16', horizon: '#26324a', below: '#141821', clouds: 0.35, cloudColor: '#3a4660', stars: 1 },
    ambient: { sky: '#40517a', ground: '#232633', intensity: 0.75 },
    fog: { color: '#2b3448', sunColor: '#46557a', density: 0.0018, heightDensity: 0.006, base: 260, falloff: 25, ground: 0.011 },
    grade: { exposure: 1.55, saturation: 0.7, contrast: 1.08, lift: '#05070d', gain: '#dfe8ff', vignette: 0.5, grain: 0.05 },
    glow: { color: '#000000', intensity: 0 },
    post: { bloom: 0.8, bloomThreshold: 0.9, ao: 0.7, shadow: 0.55, white: '#e8efff', shadowTint: '#00030c', highTint: '#06060a' },
    snow: 0.85,
    season: 2,
  },
  '1793-07': {
    sun: { azimuth: 200, elevation: 30, color: '#8ea4cf', intensity: 0.75 },
    disc: 'moon',
    sky: { zenith: '#060812', horizon: '#3a2a2a', below: '#120d0c', clouds: 0.6, cloudColor: '#2a2024', stars: 0.5 },
    ambient: { sky: '#3a4566', ground: '#2a1d16', intensity: 0.7 },
    fog: { color: '#2a2630', sunColor: '#5a4a52', density: 0.0016, heightDensity: 0.005, base: 260, falloff: 30, ground: 0.009 },
    grade: { exposure: 1.6, saturation: 0.8, contrast: 1.1, lift: '#06060a', gain: '#ffe9d6', vignette: 0.5, grain: 0.05 },
    glow: { color: '#ff6a1f', intensity: 2.2 },
    post: { bloom: 1.0, bloomThreshold: 0.85, ao: 0.7, shadow: 0.45, white: '#fff0e4', shadowTint: '#05020a', highTint: '#140600' },
    snow: 0,
    season: 0,
  },
  '1796': {
    // playtest round 2: "everything grey" — still a cold autumn over the ruin, but with a low warm
    // sun under a steel-blue sky, rust in the trees and more contrast, so stone, fire and the far
    // Hohenburg read
    sun: { azimuth: 140, elevation: 19, color: '#f0c890', intensity: 1.75 },
    disc: 'sun',
    sky: { zenith: '#4f6a86', horizon: '#d8c4a0', below: '#5a5248', clouds: 0.75, cloudColor: '#b9a993', stars: 0 },
    ambient: { sky: '#8c98a8', ground: '#5a4a3a', intensity: 1.05 },
    fog: { color: '#b4ab9c', sunColor: '#e0bf90', density: 0.00085, heightDensity: 0.003, base: 255, falloff: 30, ground: 0.006 },
    grade: { exposure: 1.02, saturation: 0.95, contrast: 1.12, lift: '#100c0a', gain: '#fbf0e0', vignette: 0.42, grain: 0.05 },
    glow: { color: '#000000', intensity: 0 },
    post: { bloom: 0.4, bloomThreshold: 1.25, ao: 0.85, shadow: 0.8, white: '#fff4e8', shadowTint: '#01040a', highTint: '#0c0600' },
    snow: 0,
    season: 1.4,
  },
};

/** Unit direction (local frame: x east, z south) for a grid azimuth/elevation in degrees. */
export function dirFromAzEl(azimuthDeg: number, elevationDeg: number): [number, number, number] {
  const a = (azimuthDeg * Math.PI) / 180;
  const e = (elevationDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
}
