/**
 * Deterministic scatter for the near nature layers (pure, no three.js; tested). Positions come
 * from a hash of the cell, so the same meadow grows the same grass every visit; densities come
 * from the land cover (forest, water, bare ground, lawn), the slope and the era.
 */

export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Era parameters of the ground cover. */
export interface CoverLook {
  /** Grass density multiplier (snow: a few dry stalks). */
  grass: number;
  /** Chance of a flower per meadow cell. */
  flowers: number;
  /** Reeds along the shores (0 none). */
  reeds: number;
  /** Ferns / props on the forest floor. */
  ferns: number;
}

export const COVER_LOOKS: Record<string, CoverLook> = {
  today: { grass: 1, flowers: 0.025, reeds: 1, ferns: 1 },
  '1789': { grass: 1.1, flowers: 0.07, reeds: 1, ferns: 1 },
  '1793-02': { grass: 0.22, flowers: 0, reeds: 0.7, ferns: 0.25 },
  '1793-07': { grass: 1, flowers: 0.04, reeds: 1, ferns: 1 },
  '1796': { grass: 0.85, flowers: 0.012, reeds: 0.8, ferns: 0.8 },
};

export interface CoverSample {
  forest: number;
  water: number;
  bare: number;
  lawn: number;
}

/** Grass tuft chance (0..1) for a cell (pure). */
export function grassChance(c: CoverSample, slopeDeg: number, patch: number, look: CoverLook): number {
  if (c.water > 0.06 || c.bare > 0.55) return 0;
  const open = 1 - c.forest * 0.88;
  const steep = 1 - Math.min(1, Math.max(0, (slopeDeg - 30) / 15));
  const lawnTidy = 1 - 0.35 * c.lawn; // kept short and sparse on the parterre
  return Math.max(0, Math.min(1, open * steep * lawnTidy * (1 - c.bare * 1.6) * (0.5 + 0.6 * patch) * look.grass));
}

/** Reed chance along a shore: the band where the blurred water cover is partial (pure). */
export function reedChance(c: CoverSample, look: CoverLook): number {
  if (c.water < 0.08 || c.water > 0.62) return 0;
  const band = 1 - Math.abs(c.water - 0.3) / 0.32;
  return Math.min(1, Math.max(0, band) * 1.3) * look.reeds;
}

/** Flower chance for a meadow cell (pure). */
export function flowerChance(c: CoverSample, look: CoverLook): number {
  if (c.forest > 0.3 || c.water > 0.02 || c.bare > 0.2) return 0;
  return look.flowers * (1 - c.forest * 2) * (1 + c.lawn * 0.5);
}
