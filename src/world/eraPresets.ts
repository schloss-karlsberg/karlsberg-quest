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
  snow: number;
  /** 0 summer, 1 autumn, 2 winter bare. */
  season: number;
}

export const ERA_LOOKS: Record<Era, EraLook> = {
  today: {
    sun: { azimuth: 222, elevation: 16, color: '#ffe2bd', intensity: 2.6 },
    disc: 'sun',
    sky: { zenith: '#4d6b8a', horizon: '#c9cfd0', below: '#5d6560', clouds: 0.55, cloudColor: '#e9e4dc', stars: 0 },
    ambient: { sky: '#8fa3b8', ground: '#4a4234', intensity: 0.95 },
    fog: { color: '#a9b3b5', sunColor: '#e8d2b0', density: 0.00085, heightDensity: 0.004, base: 255, falloff: 30, ground: 0.007 },
    grade: { exposure: 1.0, saturation: 0.88, contrast: 1.06, lift: '#0b0e12', gain: '#fff8ee', vignette: 0.35, grain: 0.035 },
    glow: { color: '#000000', intensity: 0 },
    snow: 0,
    season: 1,
  },
  '1789': {
    sun: { azimuth: 262, elevation: 13, color: '#ffc98a', intensity: 3.0 },
    disc: 'sun',
    sky: { zenith: '#3e6a9c', horizon: '#f2cfa0', below: '#6b5a44', clouds: 0.45, cloudColor: '#fbe3c4', stars: 0 },
    ambient: { sky: '#9ab0c8', ground: '#5c4a30', intensity: 0.9 },
    fog: { color: '#d6c3a4', sunColor: '#ffd29a', density: 0.0007, heightDensity: 0.003, base: 255, falloff: 30, ground: 0.0035 },
    grade: { exposure: 1.05, saturation: 1.05, contrast: 1.04, lift: '#120c06', gain: '#fff2dc', vignette: 0.35, grain: 0.03 },
    glow: { color: '#000000', intensity: 0 },
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
    snow: 0,
    season: 0,
  },
  '1796': {
    sun: { azimuth: 190, elevation: 24, color: '#d9d6cc', intensity: 1.4 },
    disc: 'none',
    sky: { zenith: '#7a7e80', horizon: '#b4b2aa', below: '#5a5852', clouds: 0.9, cloudColor: '#a9a69f', stars: 0 },
    ambient: { sky: '#9a9c9c', ground: '#4c4a44', intensity: 1.15 },
    fog: { color: '#a4a29b', sunColor: '#b8b4a8', density: 0.0012, heightDensity: 0.004, base: 255, falloff: 30, ground: 0.008 },
    grade: { exposure: 1.0, saturation: 0.55, contrast: 1.02, lift: '#0d0d0c', gain: '#f4f1ea', vignette: 0.4, grain: 0.05 },
    glow: { color: '#000000', intensity: 0 },
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
