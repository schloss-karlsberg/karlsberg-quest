import type { FlameSpot } from './builder';

const MAX_FIRE_LIGHTS = 4;
const FIRE_LIGHT_THRESHOLD = 0.05;
const canLight = (fire: number): boolean => fire >= FIRE_LIGHT_THRESHOLD;

/** Reuses the four closest slots, with catalogue order breaking ties. */
export class FireLightSelection {
  readonly spots = new Array<FlameSpot | null>(MAX_FIRE_LIGHTS).fill(null);
  private readonly distances = new Float64Array(MAX_FIRE_LIGHTS);

  update(spots: readonly FlameSpot[], roomFire: readonly number[], cam: { x: number; y: number; z: number }): number {
    const out = this.spots;
    out.fill(null);
    if (!roomFire.some(canLight)) return 0;
    let count = 0;
    for (const spot of spots) {
      if (spot.kind !== 1 || !canLight(roomFire[spot.room] ?? 0)) continue;
      const d = (spot.x - cam.x) ** 2 + (spot.y - cam.y) ** 2 + (spot.z - cam.z) ** 2;
      if (d > 30 ** 2) continue;
      let i = count;
      while (i > 0 && d < this.distances[i - 1]!) i--;
      if (i === MAX_FIRE_LIGHTS) continue;
      count = Math.min(count + 1, MAX_FIRE_LIGHTS);
      for (let j = count - 1; j > i; j--) {
        out[j] = out[j - 1]!;
        this.distances[j] = this.distances[j - 1]!;
      }
      out[i] = spot;
      this.distances[i] = d;
    }
    return count;
  }
}
