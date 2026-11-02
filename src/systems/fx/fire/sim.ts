/**
 * Fire gameplay (pure, fixed-step): the clock over the schedule, per-room state changes and the
 * player's smoke meter ("Rauch statt Öl", bible 04-kapitel-3 §9). No three.js here.
 */
import { distToOutline, pointInPolygon } from '../geom';
import { type FireUnit, type UnitState, burnIntensity, smokeDensity, unitStateAt } from './schedule';

export interface FireChange {
  index: number;
  unit: FireUnit;
  state: Exclude<UnitState, 'none'>;
}

export interface Exposure {
  /** Index of the unit the player stands in (-1 = outside). */
  inside: number;
  /** State of that unit. */
  state: UnitState;
  /** 0..1 smoke density where the player stands. */
  density: number;
  /** 0..1 heat from nearby burning units (for shimmer, caption, audio). */
  heat: number;
  /** Distance (m) to the nearest burning unit outline (Infinity if none). */
  nearest: number;
}

/** Smoke meter fill rates (1 = full meter) per second. */
export const SMOKE_RATES = { smoke: 1 / 30, burning: 1 / 12, collapsed: 1 / 5, near: 1 / 45, recover: 1 / 10, collapseHit: 0.35 };

export class FireSim {
  clock = 0;
  /** Player smoke meter 0..1; 1 = thrown back. */
  smoke = 0;
  /** Story hold (bible W5: the timeline stands still while the Festsaal choice runs). */
  hold = false;
  readonly states: UnitState[];

  constructor(
    readonly units: FireUnit[],
    public seconds: number,
  ) {
    this.states = units.map(() => 'none');
  }

  get progress(): number {
    return Math.max(0, Math.min(1, this.clock / this.seconds));
  }

  /** Advance the clock; returns every unit whose state changed (in schedule order). */
  advance(dt: number): FireChange[] {
    if (!this.hold) this.clock += dt;
    return this.sync();
  }

  /** Jump to a clock value (debug / resume); returns the changes since the previous state. */
  setClock(t: number): FireChange[] {
    this.clock = Math.max(0, t);
    return this.sync();
  }

  private sync(): FireChange[] {
    const out: FireChange[] = [];
    const order: UnitState[] = ['none', 'smoke', 'burning', 'collapsed'];
    this.units.forEach((u, i) => {
      const s = unitStateAt(u, this.clock, this.seconds);
      const prev = this.states[i]!;
      if (s === prev) return;
      // report every intermediate state once (a big dt may skip 'smoke')
      for (let k = order.indexOf(prev) + 1; k <= order.indexOf(s); k++) {
        out.push({ index: i, unit: u, state: order[k] as FireChange['state'] });
      }
      this.states[i] = s;
    });
    return out;
  }

  intensity(i: number): number {
    return burnIntensity(this.units[i]!, this.clock, this.seconds);
  }

  smokeOf(i: number): number {
    return smokeDensity(this.units[i]!, this.clock, this.seconds);
  }

  /** What the fire does to someone standing at x/y/z (feet height y). */
  exposure(x: number, y: number, z: number): Exposure {
    let inside = -1;
    let nearest = Infinity;
    let heat = 0;
    this.units.forEach((u, i) => {
      const st = this.states[i]!;
      if (st === 'none') return;
      if (Math.abs(u.cx - x) > 80 || Math.abs(u.cz - z) > 80) return;
      const inPlan = pointInPolygon(x, z, u.polygon);
      if (inPlan && y >= u.floor - 1.2 && y <= u.ceiling + 0.5) {
        if (inside < 0 || this.units[inside]!.storey < u.storey) inside = i;
      }
      if (st === 'burning' || st === 'collapsed') {
        const d = inPlan ? 0 : distToOutline(x, z, u.polygon);
        nearest = Math.min(nearest, d);
        heat = Math.max(heat, this.intensity(i) * Math.max(0, 1 - d / 40));
      }
    });
    const state = inside >= 0 ? this.states[inside]! : 'none';
    const density = inside >= 0 ? this.smokeOf(inside) : nearest < 6 ? 0.25 : 0;
    return { inside, state, density, heat, nearest };
  }

  /**
   * Fill/drain the smoke meter for one fixed step. `low` = crouching/prone (half rate),
   * `gentle` = gentle mode (×1/1.5). Returns true when the meter is full.
   */
  breathe(dt: number, e: Exposure, low: boolean, gentle: boolean): boolean {
    let rate = 0;
    if (e.inside >= 0 && e.state !== 'none') {
      rate = e.state === 'collapsed' ? SMOKE_RATES.collapsed : e.state === 'burning' ? SMOKE_RATES.burning : SMOKE_RATES.smoke * (0.5 + e.density);
    } else if (e.nearest < 6) {
      rate = SMOKE_RATES.near;
    }
    if (rate > 0) {
      if (low) rate *= 0.5;
      if (gentle) rate /= 1.5;
      this.smoke = Math.min(1, this.smoke + rate * dt);
    } else {
      this.smoke = Math.max(0, this.smoke - SMOKE_RATES.recover * dt);
    }
    return this.smoke >= 1;
  }

  /** A roof/stair came down while the player was inside the unit. */
  hit(): void {
    this.smoke = Math.min(1, this.smoke + SMOKE_RATES.collapseHit);
  }
}
