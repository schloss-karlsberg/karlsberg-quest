import ascent from '../../../content/routes/p-aufstieg.json';
import tour from '../../../content/routes/p-fuehrung.json';
import type { Era } from '../../core/era';

const dam = tour.stops.find((stop) => stop.id === 'damm')!;
const pond = tour.stops.find((stop) => stop.id === 'weiher')!;
const spring = tour.stops.find((stop) => stop.id === 'quelle')!;
const plateau = ascent.stops.find((stop) => stop.id === 'plateau')!;

// The pond bed covers the dam, south shore and the water immediately north of the path.
const shore = { x: (dam.x + pond.x) / 2, z: (dam.z + pond.z) / 2 - 15 };

// Each elliptical bed is full within the inner 55% and fades over the rest of its range.
function weight(x: number, z: number, center: { x: number; z: number }, rx: number, rz: number): number {
  const edge = Math.hypot((x - center.x) / rx, (z - center.z) / rz);
  const t = Math.max(0, Math.min(1, (1 - edge) / 0.45));
  return t * t * (3 - 2 * t);
}

const ERA_MIX = {
  today: { wind: 0.29, birds: 1, pond: 0.64, brook: 0.58, dread: 0 },
  '1789': { wind: 0.24, birds: 0.74, pond: 0.54, brook: 0.50, dread: 0 },
  '1793-02': { wind: 0.42, birds: 0, pond: 0, brook: 0, dread: 0.7 },
  '1793-07': { wind: 0.37, birds: 0, pond: 0.42, brook: 0.35, dread: 0.7 },
  '1796': { wind: 0.38, birds: 0, pond: 0.28, brook: 0, dread: 0.3 },
} satisfies Record<Era, { wind: number; birds: number; pond: number; brook: number; dread: number }>;

export const PLATEAU = { x: plateau.x, z: plateau.z };

/** Continuous outdoor mix around the tour stops, with forest as the surrounding bed. */
export function ambienceAt(era: Era, x: number, z: number) {
  const mix = ERA_MIX[era];
  const waterside = weight(x, z, shore, 108, 72);
  const ravine = weight(x, z, spring, 73, 74);
  const exposed = weight(x, z, plateau, 145, 205);
  return {
    wind: mix.wind + waterside * 0.07 - ravine * 0.12 + exposed * 0.21,
    birds: mix.birds * (1 - waterside * 0.38 - ravine * 0.50 - exposed * 0.63),
    pond: mix.pond * waterside,
    brook: mix.brook * ravine,
    court: era === '1789' ? exposed : 0,
    dread: mix.dread,
  };
}
