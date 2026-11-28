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
  /** The tour walk: where the marker of a story objective at (x, z) leads instead (the group it follows), or null. */
  lead?: (x: number, z: number) => { x: number; z: number } | null;
}

export const VISITOR_RADIUS = 0.32;
export const DOG_RADIUS = 0.26;
export const PLAYER_RADIUS = 0.35;
export const CROWD_LEVEL_TOLERANCE = 1.1;

/**
 * Share of a step a body keeps when it bumps (almost) straight into a standing person: it walks
 * round them instead of stopping dead (TASK-082: W held a few degrees off a tour member moved the
 * player 9 % of a step; a group of them felt like a wall).
 */
export const MIN_SLIDE = 0.45;
/** Contacts stop this far short of the touching distance, so float rounding never overlaps. */
const SKIN = 1e-3;
/** Contacts resolved per step (a slide, then the next body it runs into, then a corner). */
const MAX_CONTACTS = 3;

/** Wall / footprint push-out (world.collider.resolve): the corrected position. */
export type WallResolve = (x: number, z: number, radius: number) => { x: number; z: number };

const nearScratch: CrowdCircle[] = [];
const startScratch: CrowdCircle = { x: 0, y: 0, z: 0, radius: 0 };

/**
 * Collide and slide through the crowd (TASK-082). `body` holds the target position and radius on
 * entry and the result on return; `from` is where the body stands now.
 *
 * 1. The start is pushed out of any circle first (a person may have walked into the body).
 * 2. The step is swept against the circles on the body's level, so it never tunnels through one
 *    however long it is. At the first contact the step keeps its tangential part, at least
 *    MIN_SLIDE of what is left, so a glancing or head-on bump walks round the person (head-on picks
 *    the side away from the other people nearby, else the right-hand side).
 * 3. Further contacts only project the rest of the step. A slide that would run back into the
 *    previous body (a corner between two people closer than the body is wide) stops there.
 * 4. With `walls`, a slide that the walls push back into a person is refused: a near head-on nudge
 *    tries the person's other side, else the body stays at the start, so a person next to a wall
 *    never squeezes the body through the wall.
 */
export function slideThroughCrowd(body: CrowdCircle, circles: readonly CrowdCircle[], from: { x: number; z: number }, walls?: WallResolve): void {
  const r = body.radius;
  const len = Math.hypot(body.x - from.x, body.z - from.z);
  // the circles that can matter this step
  const near = nearScratch;
  near.length = 0;
  for (const c of circles) {
    if (Math.abs(body.y - c.y) > CROWD_LEVEL_TOLERANCE) continue;
    const reach = len + r + c.radius + 0.5;
    if ((c.x - from.x) ** 2 + (c.z - from.z) ** 2 <= reach * reach) near.push(c);
  }
  if (!near.length) return;
  const start = startScratch;
  start.x = from.x;
  start.z = from.z;
  start.y = body.y;
  start.radius = r;
  separateFromCrowd(start, near, from);
  const res = sweepScratch;
  sweep(start, body.x - from.x, body.z - from.z, r, near, walls, res);
  if (!res.involved && start.x === from.x && start.z === from.z) return;
  if (walls && wallsIntoCrowd(res, r, near, walls)) {
    // the wall pushed the slide into a person: stay at the start
    const s = walls(start.x, start.z, r);
    const clean = s.x === start.x && s.z === start.z;
    res.x = clean ? start.x : from.x;
    res.z = clean ? start.z : from.z;
  }
  body.x = res.x;
  body.z = res.z;
}

interface SweepResult { x: number; z: number; involved: boolean }
const sweepScratch: SweepResult = { x: 0, z: 0, involved: false };

/** Apply the walls to `res` (in place); true when they push it into a person. */
function wallsIntoCrowd(res: SweepResult, r: number, near: readonly CrowdCircle[], walls: WallResolve): boolean {
  const w = walls(res.x, res.z, r);
  if (w.x === res.x && w.z === res.z) return false;
  for (const c of near) {
    const R = r + c.radius - SKIN;
    if ((w.x - c.x) ** 2 + (w.z - c.z) ** 2 < R * R) return true;
  }
  res.x = w.x;
  res.z = w.z;
  return false;
}

/**
 * Is the way round `c` on side (ux, uz) shut? Probes where the body passes beside the person: a
 * wall pushes it, or another person stands there.
 */
function sideShut(c: CrowdCircle, ux: number, uz: number, r: number, near: readonly CrowdCircle[], walls?: WallResolve): boolean {
  const R = r + c.radius + SKIN;
  const qx = c.x + ux * R;
  const qz = c.z + uz * R;
  if (walls) {
    const w = walls(qx, qz, r);
    if (Math.abs(w.x - qx) > 1e-6 || Math.abs(w.z - qz) > 1e-6) return true;
  }
  for (const o of near) {
    if (o === c) continue;
    const Ro = r + o.radius;
    if ((qx - o.x) ** 2 + (qz - o.z) ** 2 < Ro * Ro) return true;
  }
  return false;
}

/** The swept collide-and-slide of slideThroughCrowd. */
function sweep(start: { x: number; z: number }, mx: number, mz: number, r: number, near: readonly CrowdCircle[], walls: WallResolve | undefined, out: SweepResult): void {
  let px = start.x;
  let pz = start.z;
  let pnx = 0;
  let pnz = 0;
  out.involved = false;
  for (let contact = 0; contact <= MAX_CONTACTS; contact++) {
    const a = mx * mx + mz * mz;
    if (a < 1e-14) break;
    let tHit = 1;
    let hit: CrowdCircle | undefined;
    for (const c of near) {
      const R = r + c.radius;
      const fx = px - c.x;
      const fz = pz - c.z;
      const b = fx * mx + fz * mz;
      if (b >= 0) continue; // moving away or along
      const cc = fx * fx + fz * fz - R * R;
      let t: number;
      if (cc <= 0) t = 0; // touching and pushing in
      else {
        const disc = b * b - a * cc;
        if (disc < 0) continue;
        t = (-b - Math.sqrt(disc)) / a;
      }
      if (t < tHit) {
        tHit = t;
        hit = c;
      }
    }
    if (!hit) {
      px += mx;
      pz += mz;
      break;
    }
    if (contact === MAX_CONTACTS) break;
    out.involved = true;
    const t = Math.max(0, tHit - SKIN / Math.sqrt(a));
    px += mx * t;
    pz += mz * t;
    const rx = mx * (1 - t);
    const rz = mz * (1 - t);
    let nx = px - hit.x;
    let nz = pz - hit.z;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    const into = rx * nx + rz * nz;
    let sx = rx - into * nx;
    let sz = rz - into * nz;
    const rest = Math.hypot(rx, rz);
    let sl = Math.hypot(sx, sz);
    if (contact === 0) {
      if (sl < 1e-6 * rest) {
        // head-on: the side away from the other people near this one, else the right-hand side
        sx = nz;
        sz = -nx;
        let lean = 0;
        for (const c of near) if (c !== hit) lean += ((c.x - hit.x) * sx + (c.z - hit.z) * sz) / (1e-3 + (c.x - hit.x) ** 2 + (c.z - hit.z) ** 2);
        if (lean > 0) {
          sx = -sx;
          sz = -sz;
        }
        sl = 0;
      }
      const unit = sl > 0 ? sl : 1;
      sx /= unit;
      sz /= unit;
      let want = sl;
      if (sl < MIN_SLIDE * rest) {
        // a nudge round a near head-on bump: round the side that is open (a wall or another
        // person shuts a side; decided on the geometry, so it holds from step to step)
        want = MIN_SLIDE * rest;
        if (sideShut(hit, sx, sz, r, near, walls) && !sideShut(hit, -sx, -sz, r, near, walls)) {
          sx = -sx;
          sz = -sz;
        }
      }
      mx = sx * want;
      mz = sz * want;
    } else {
      mx = sx;
      mz = sz;
      // a corner: the projected slide runs back into the previous body
      if (mx * pnx + mz * pnz < 0) break;
    }
    pnx = nx;
    pnz = nz;
  }
  out.x = px;
  out.z = pz;
}

/** Slide the moving body out of nearby circles on its level. Two passes handle adjacent bodies. */
export function separateFromCrowd(body: CrowdCircle, circles: readonly CrowdCircle[], from: { x: number; z: number }): void {
  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    for (const other of circles) {
      if (Math.abs(body.y - other.y) > CROWD_LEVEL_TOLERANCE) continue;
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
