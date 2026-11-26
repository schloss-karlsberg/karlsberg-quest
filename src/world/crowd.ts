/** Small horizontal collision circles for the present-day tour. */
export interface CrowdCircle {
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface TourCrowd {
  visitors?: () => readonly CrowdCircle[];
  dogs?: () => readonly CrowdCircle[];
}

export const VISITOR_RADIUS = 0.32;
export const DOG_RADIUS = 0.26;
export const PLAYER_RADIUS = 0.35;

/** Slide the moving body out of nearby circles on its level. Two passes handle adjacent bodies. */
export function separateFromCrowd(body: CrowdCircle, circles: readonly CrowdCircle[], from: { x: number; z: number }): void {
  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    for (const other of circles) {
      if (Math.abs(body.y - other.y) > 1.1) continue;
      const limit = body.radius + other.radius;
      let dx = body.x - other.x;
      let dz = body.z - other.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= limit * limit) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-5) {
        dx = from.x - other.x;
        dz = from.z - other.z;
        d = Math.hypot(dx, dz);
        if (d < 1e-5) {
          dx = 1;
          dz = 0;
          d = 1;
        }
      }
      body.x = other.x + dx * ((limit + 0.001) / d);
      body.z = other.z + dz * ((limit + 0.001) / d);
      moved = true;
    }
    if (!moved) return;
  }
}
