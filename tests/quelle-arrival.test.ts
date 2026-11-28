/**
 * The arrival turns from the water to the palace (TASK-089). The touch of the spring is the one
 * journey; while the shift covers the screen the spring's scene turns the player to the Corps de
 * logis, so the palace stands on the horizon in the first frame of 1789. The yaw is computed from
 * where the player stands, so it follows the spring to whichever flank of the gorge it ends up on.
 */
import { describe, expect, it } from 'vitest';
import { FIRE_CENTER } from '../src/systems/fx/fire/schedule';
import { ARRIVAL_PITCH, ARRIVAL_STEP, PALACE_SIGHT, arrivalSpot, yawToPalace } from '../src/systems/quelle/layout';
import { HOME } from '../src/systems/story/hub/home';

/** Compass bearing (0 = north, 90 = east) of a three.js yaw (forward = (−sin, −cos)). */
const bearing = (yaw: number) => ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;

describe('the arrival in 1789 looks at the palace', () => {
  it('faces the Corps de logis from the trough stand', () => {
    const { x, z } = HOME.spawn;
    const yaw = yawToPalace(x, z);
    const d = Math.hypot(PALACE_SIGHT.x - x, PALACE_SIGHT.z - z);
    // the look's forward vector points at the palace
    expect(-Math.sin(yaw)).toBeCloseTo((PALACE_SIGHT.x - x) / d, 6);
    expect(-Math.cos(yaw)).toBeCloseTo((PALACE_SIGHT.z - z) / d, 6);
    // north-east and a few hundred metres up the hill
    expect(bearing(yaw)).toBeGreaterThan(20);
    expect(bearing(yaw)).toBeLessThan(50);
    expect(d).toBeGreaterThan(250);
    expect(d).toBeLessThan(450);
  });

  it('follows the player, not a fixed number: from another stand the yaw changes with it', () => {
    for (const [dx, dz] of [[0, 0], [3, -2], [-4, 5], [-2.5, 2.1]] as const) {
      const x = HOME.spawn.x + dx;
      const z = HOME.spawn.z + dz;
      const yaw = yawToPalace(x, z);
      const d = Math.hypot(PALACE_SIGHT.x - x, PALACE_SIGHT.z - z);
      expect(-Math.sin(yaw) * d + x).toBeCloseTo(PALACE_SIGHT.x, 4);
      expect(-Math.cos(yaw) * d + z).toBeCloseTo(PALACE_SIGHT.z, 4);
    }
  });

  it('takes a few steps from the water towards the palace, so the camera has room behind the player', () => {
    // real-GPU frames: turned in place at the trough, the boom was squeezed against the fountain and
    // craned over the flank, looking down on the player's head; 6 m out the horizon is in the picture
    const { x, z } = HOME.spawn;
    const to = arrivalSpot(x, z);
    expect(Math.hypot(to.x - x, to.z - z)).toBeCloseTo(ARRIVAL_STEP, 6);
    expect(ARRIVAL_STEP).toBeGreaterThanOrEqual(5);
    expect(ARRIVAL_STEP).toBeLessThanOrEqual(10);
    // on the line to the palace, and still looking at it from there
    const d0 = Math.hypot(PALACE_SIGHT.x - x, PALACE_SIGHT.z - z);
    expect(Math.hypot(PALACE_SIGHT.x - to.x, PALACE_SIGHT.z - to.z)).toBeCloseTo(d0 - ARRIVAL_STEP, 6);
    expect(to.yaw).toBeCloseTo(yawToPalace(to.x, to.z), 9);
    // well inside the home ring: holding Q, the wake and the hand-over do not notice
    expect(Math.hypot(to.x - HOME.x, to.z - HOME.z)).toBeLessThan(HOME.r);
  });

  it('means the same palace as the fire, and looks up a little', () => {
    expect(PALACE_SIGHT).toEqual(FIRE_CENTER);
    expect(ARRIVAL_PITCH).toBeGreaterThan(0);
    expect(ARRIVAL_PITCH).toBeLessThan(0.2);
  });

});
