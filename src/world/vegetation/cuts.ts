/**
 * Plants cut down with the staff (src/systems/forage): a short list of mown circles that the
 * instanced nature layers read while they build their lists. A plant whose origin lies in a
 * circle is drawn as a stub and grows back in steps, so nothing is rebuilt per frame: the layers
 * rebuild once when `version` changes (a cut, a growth step, a circle that ran out).
 *
 * Pure (no three.js); the clock is game time, set by the forage system each tick. Cuts are not
 * saved: after a load everything stands again.
 */
export const CUT = {
  /** Height factor right after the cut. */
  stub: 0.2,
  /** Seconds (game time) until the plants of a circle stand full again. */
  regrow: 75,
  /** Growth steps: from this share of `regrow` on, the plants have this height factor. */
  steps: [
    [0.55, 0.45],
    [0.8, 0.75],
  ] as readonly (readonly [number, number])[],
  /** Circles kept at most; the oldest grows back early. */
  max: 48,
} as const;

interface Circle {
  x: number;
  z: number;
  r: number;
  t0: number;
  /** Index into the growth steps reached so far (0 = stub). */
  stage: number;
}

/** Height factor of a circle `age` seconds after its cut (1 = grown back). */
export function cutFactor(age: number): number {
  const k = age / CUT.regrow;
  if (k >= 1) return 1;
  let f: number = CUT.stub;
  for (const [from, factor] of CUT.steps) if (k >= from) f = factor;
  return f;
}

function stageOf(age: number): number {
  const k = age / CUT.regrow;
  let s = 0;
  for (const [from] of CUT.steps) if (k >= from) s++;
  return s;
}

export class PlantCuts {
  /** Bumped whenever a layer has to rebuild its instance lists. */
  version = 0;
  /** Game time (s) of the last `tick`. */
  now = 0;
  private readonly list: Circle[] = [];
  private x0 = 0;
  private x1 = 0;
  private z0 = 0;
  private z1 = 0;

  get count(): number {
    return this.list.length;
  }

  /** Mow a circle now. */
  add(x: number, z: number, r: number): void {
    this.list.push({ x, z, r, t0: this.now, stage: 0 });
    if (this.list.length > CUT.max) this.list.shift();
    this.changed();
  }

  /** Advance the clock: circles step up and run out. True when something changed. */
  tick(now: number): boolean {
    this.now = now;
    if (!this.list.length) return false;
    let changed = false;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i]!;
      const age = now - c.t0;
      // a clock that ran backwards (a load) lets everything stand again
      if (age >= CUT.regrow || age < 0) {
        this.list.splice(i, 1);
        changed = true;
        continue;
      }
      const s = stageOf(age);
      if (s !== c.stage) {
        c.stage = s;
        changed = true;
      }
    }
    if (changed) this.changed();
    return changed;
  }

  /** Height factor of a plant standing at x/z (1 = untouched). */
  factorAt(x: number, z: number): number {
    if (!this.list.length || x < this.x0 || x > this.x1 || z < this.z0 || z > this.z1) return 1;
    let f = 1;
    for (const c of this.list) {
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz > c.r * c.r) continue;
      const k = cutFactor(this.now - c.t0);
      if (k < f) f = k;
    }
    return f;
  }

  clear(): void {
    if (!this.list.length) return;
    this.list.length = 0;
    this.changed();
  }

  private changed(): void {
    this.version++;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const c of this.list) {
      x0 = Math.min(x0, c.x - c.r);
      x1 = Math.max(x1, c.x + c.r);
      z0 = Math.min(z0, c.z - c.r);
      z1 = Math.max(z1, c.z + c.r);
    }
    this.x0 = x0;
    this.x1 = x1;
    this.z0 = z0;
    this.z1 = z1;
  }
}

/** The one list the nature layers and the forage system share (like `enemyDuck`). */
export const plantCuts = new PlantCuts();
