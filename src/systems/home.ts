/**
 * The home base in the present (tour redesign, docs/design/tour/systems.md §5): where the safe
 * ring lies and what the free respec / heal / hunt reset texts point at. Pure data, no three.js,
 * so combat, hunt, progression and travel can share it without importing the story system.
 *
 * The Karlsbergquelle is home, with a 12 m hub ring around `QUELLE`.
 *
 * The values come from the story system's `HOME` constant (tour WP-01,
 * `src/systems/story/hub/home.ts`).
 */
import { HOME } from './story/hub/home';

export interface HomeSpot {
  readonly x: number;
  readonly z: number;
  /**
   * Radius (m) of the home itself (the hub ring, design `HOME.r`). Combat's safe ring is wider
   * (40 m around the same centre).
   */
  readonly r: number;
}

/** The home base (centre and ring radius, local frame). */
export function homeSpot(): HomeSpot {
  return { x: HOME.x, z: HOME.z, r: HOME.r };
}
