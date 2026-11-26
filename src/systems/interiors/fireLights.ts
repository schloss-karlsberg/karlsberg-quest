import type { FlameSpot } from './builder';

const MAX_FIRE_LIGHTS = 4;
const FIRE_LIGHT_THRESHOLD = 0.05;
const canLight = (fire: number): boolean => fire >= FIRE_LIGHT_THRESHOLD;

/** Reuses the four closest slots, with catalogue order breaking ties. */
export class FireLightSelection {
  private readonly spots: FlameSpot[] = [];
  private readonly distances = new Float64Array(MAX_FIRE_LIGHTS);

  update(spots: readonly FlameSpot[], roomFire: readonly number[], cam: { x: number; y: number; z: number }): readonly FlameSpot[] {
    const out = this.spots;
    out.length = 0;
    if (!roomFire.some(canLight)) return out;
    for (const spot of spots) {
      if (spot.kind !== 1 || !canLight(roomFire[spot.room] ?? 0)) continue;
      const d = (spot.x - cam.x) ** 2 + (spot.y - cam.y) ** 2 + (spot.z - cam.z) ** 2;
      if (d > 30 ** 2) continue;
      let i = out.length;
      while (i > 0 && d < this.distances[i - 1]!) i--;
      if (i === MAX_FIRE_LIGHTS) continue;
      for (let j = Math.min(out.length, MAX_FIRE_LIGHTS - 1); j > i; j--) {
        out[j] = out[j - 1]!;
        this.distances[j] = this.distances[j - 1]!;
      }
      out[i] = spot;
      this.distances[i] = d;
    }
    return out;
  }
}
