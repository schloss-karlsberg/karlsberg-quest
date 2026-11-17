/**
 * Pack modes beyond the patrol (configured via threat:configure {kind:'pack', mode, target, …}).
 * Pure and deterministic like sim.ts; they bend the simulation through ModeController hooks.
 *
 *  drive     Ch. 4 "Die Meute treibt" (bible 05 §9): the hounds stand in an arc BEHIND and to
 *            the sides of you (12–20 m), the Pikeur's horn sounds from behind / a flank. Walk
 *            on and nothing happens. Turn back and they give 5 m, then close the gap; push past
 *            them and you are "brought home" (soft catch, nothing lost).
 *  finale    W8 "Sich stellen" at the kennel: the pack gathers in a 6 m circle around you (horn:
 *            three long = Sammeln) and waits, no time pressure. Lie flat (X) with the lantern lit
 *            (L) — in any order; one-key / gentle: X alone — and one hound after another lies
 *            down, its eyes go out like lamps in a house, the mist settles, the horn is silent,
 *            then they fade. Run off (> 10 m) and you are brought back into the circle.
 *  parforce  Ch. 2 "Die Parforcejagd" (bible 03 §9 B): two short horn calls, a head start, then
 *            a long chase paced in waves: surges with the rubber-banded pack at your heels,
 *            breathers when the scent drifts (falling horn), the Pikeur riding in from a flank
 *            (telegraphed by his horn) and sheering off; it never calls off — it ends at the
 *            water / the target. `heel` / `burst` tune the rubber band (chapter 1's short chase).
 *  follow    Ending C: harmless; the hounds walk in your footsteps at a distance and never catch.
 */
import type { PlayerSense } from './perception';
import { type Agent, type MakeController, type ModeController, type PackMode, type PackSim, type XZ, headingTo } from './sim';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const dist = (a: XZ, b: XZ) => Math.hypot(a.x - b.x, a.z - b.z);

// =============================================================================================
// drive
// =============================================================================================

export class DriveMode implements ModeController {
  readonly mode: PackMode = 'drive';
  private readonly wps: XZ[];
  private wpI = 0;
  /** Centre of the arc (where the player would be if he were free). */
  private wall: XZ | null = null;
  /** Most advanced (closest to the goal) distance of the arc's back line. */
  private gMin = Infinity;
  private hornT = 0.4;
  private barkT = 2.5;
  private flank = 1;
  private flankT = 0;
  reached = false;
  /** 0..1 how hard the pack presses (you turned back). */
  pressure = 0;

  constructor(
    private readonly sim: PackSim,
    fresh = true,
  ) {
    const o = sim.opt;
    this.wps = [...(o.via ?? []), o.target ?? { x: o.x, z: o.z }];
    this.flankT = sim.rng.range(18, 26);
    for (const h of sim.hounds) h.awareness = 0.8;
    if (!fresh) return; // switched from another mode: they move into the arc from where they are
    // a fresh drive: the hounds come out of the fog BEHIND the player (never across his path)
    const p = sim.origin;
    const g = this.wps[0]!;
    const gd = Math.max(1e-3, dist(p, g));
    const ux = (g.x - p.x) / gd;
    const uz = (g.z - p.z) / gd;
    const back = Math.atan2(-uz, -ux);
    const hs = sim.hounds;
    hs.forEach((a, i) => {
      const th = back + ((hs.length === 1 ? 0 : i / (hs.length - 1)) - 0.5) * 2.4;
      const r = sim.rng.range(30, 38);
      const x = p.x + Math.cos(th) * r;
      const z = p.z + Math.sin(th) * r;
      sim.place(sim.agents.indexOf(a), x, z, headingTo(p.x - x, p.z - z));
    });
    const pk = sim.pikeur;
    if (pk) {
      const x = p.x - ux * 46 + -uz * 14;
      const z = p.z - uz * 46 + ux * 14;
      sim.place(0, x, z, headingTo(p.x - x, p.z - z));
    }
  }

  get goal(): XZ {
    return this.wps[this.wpI]!;
  }

  step(dt: number, p: PlayerSense): boolean {
    const sim = this.sim;
    const T = sim.tune;
    while (this.wpI < this.wps.length - 1 && dist(p, this.goal) < 22) {
      this.wpI++;
      this.gMin = Infinity;
    }
    const goal = this.goal;
    const last = this.wpI === this.wps.length - 1;
    if (last && !this.reached && dist(p, goal) < (sim.opt.goalRadius ?? 18)) {
      this.reached = true;
      sim.emit({ type: 'goal', x: goal.x, z: goal.z });
      sim.horn('call-off');
    }
    // arc centre: R m behind the player on the line to the goal
    const gp = Math.max(1e-3, dist(p, goal));
    const dx = (goal.x - p.x) / gp;
    const dz = (goal.z - p.z) / gp;
    const R = 15;
    let wx = p.x - dx * R;
    let wz = p.z - dz * R;
    const gDes = Math.hypot(goal.x - wx, goal.z - wz);
    if (gDes > this.gMin + 5) {
      // they give 5 m, not more: the line holds
      const k = (this.gMin + 5) / gDes;
      wx = goal.x + (wx - goal.x) * k;
      wz = goal.z + (wz - goal.z) * k;
    }
    if (!this.wall) this.wall = { x: wx, z: wz };
    const w = this.wall;
    const step = Math.hypot(wx - w.x, wz - w.z);
    const maxStep = 8 * dt;
    if (step > maxStep) {
      w.x += ((wx - w.x) / step) * maxStep;
      w.z += ((wz - w.z) / step) * maxStep;
    } else {
      w.x = wx;
      w.z = wz;
    }
    const gW = Math.max(1e-3, dist(w, goal));
    this.gMin = Math.min(this.gMin, gW);
    // >0: the player is farther from the goal than the back line (pushed past them)
    const margin = gp - gW;
    const want = this.reached ? 0 : clamp01((margin + 7) / 7);
    this.pressure += (want - this.pressure) * Math.min(1, dt * 3);
    // the arc around C (behind and to both sides)
    const ux = (goal.x - w.x) / gW;
    const uz = (goal.z - w.z) / gW;
    const cx = w.x + ux * R;
    const cz = w.z + uz * R;
    const back = Math.atan2(-uz, -ux);
    const hs = sim.hounds;
    let nearest: Agent | null = null;
    let nd = Infinity;
    hs.forEach((a, i) => {
      const n = hs.length;
      const th = back + ((n === 1 ? 0 : i / (n - 1)) - 0.5) * ((210 * Math.PI) / 180);
      const r = 16 + 4 * Math.sin(sim.time * 0.33 + i * 1.9);
      let sx = cx + Math.cos(th) * r;
      let sz = cz + Math.sin(th) * r;
      // pressing: they close in on the player
      const k = 0.78 * this.pressure;
      sx += (p.x - sx) * k;
      sz += (p.z - sz) * k;
      const d = Math.hypot(sx - a.x, sz - a.z);
      if (d > 0.8) sim.moveToward(a, sx, sz, Math.min(T.speed.chase, Math.max(T.speed.trot, d * 1.4)), dt, 6, 0.5);
      else {
        sim.halt(a, dt);
        sim.face(a, p.x - a.x, p.z - a.z, dt);
      }
      a.awareness = 0.75 + 0.25 * this.pressure;
      const dp = Math.hypot(p.x - a.x, p.z - a.z);
      if (dp < nd) {
        nd = dp;
        nearest = a;
      }
    });
    // the Pikeur behind, on one flank; the flank changes now and then, with the horn
    const pk = sim.pikeur;
    this.flankT -= dt;
    if (this.flankT <= 0) {
      this.flankT = sim.rng.range(18, 26);
      this.flank = -this.flank;
    }
    const rx = -uz;
    const rz = ux;
    const hx = cx - ux * (R + 12) + rx * this.flank * 12;
    const hz = cz - uz * (R + 12) + rz * this.flank * 12;
    if (pk) {
      if (Math.hypot(hx - pk.x, hz - pk.z) > 2) sim.moveToward(pk, hx, hz, T.pikeurSpeed.chase * 1.1, dt, 2.5, 1.5);
      else {
        sim.halt(pk, dt, 3);
        sim.face(pk, p.x - pk.x, p.z - pk.z, dt);
      }
    }
    // beaters' horn from behind / the flank; hounds give tongue from behind
    this.hornT -= dt;
    if (this.hornT <= 0 && !this.reached) {
      this.hornT = sim.rng.range(14, 22);
      sim.horn('search', pk ? undefined : { x: cx - ux * 70 + rx * this.flank * 45, z: cz - uz * 70 + rz * this.flank * 45 });
    }
    this.barkT -= dt;
    if (this.barkT <= 0 && hs.length) {
      this.barkT = sim.rng.range(3, 7) * (1 - 0.6 * this.pressure);
      const a = sim.rng.pick(hs);
      sim.emit({ type: 'bay', idx: sim.agents.indexOf(a), kind: this.pressure > 0.5 ? 'bark' : sim.rng.next() < 0.3 ? 'howl' : 'bark' });
    }
    // pushed past them (or one right at you while you push back): brought home, nothing lost
    if (!this.reached && nearest && !p.flying && (margin > 3 || (this.pressure > 0.6 && nd < 1.8))) sim.catchBy(nearest, true);
    sim.setState(this.pressure > 0.5 ? 'chasing' : 'searching', true);
    sim.searchLeft = sim.tune.search;
    sim.alert = this.reached ? Math.max(0, sim.alert - dt * 0.2) : 0.45 + 0.45 * this.pressure;
    return true;
  }

  mayCatch(): boolean {
    return false;
  }
}

// =============================================================================================
// finale
// =============================================================================================

export type FinalePhase = 'gather' | 'wait' | 'calm' | 'done';

/** Timing of the calm-down (s after lying flat with the light on). */
export const FINALE = { lieStart: 1.4, lieGap: 1.7, lieDur: 1.4, dimDelay: 1.8, dimDur: 1.6, fadeDelay: 1.6, fadeGap: 0.9, fadeDur: 1.6, endPause: 1.4, circle: 6, leash: 10 };

export class FinaleMode implements ModeController {
  readonly mode: PackMode = 'finale';
  phase: FinalePhase = 'gather';
  t = 0;
  readonly center: XZ;
  /** 0..1 progress of the calm-down (visuals: the mist settles). */
  calm = 0;
  private returnCd = 0;
  private readonly base: number;
  private readonly pikeurSpot: XZ;
  private lain = new Set<Agent>();

  constructor(
    private readonly sim: PackSim,
    fresh = true,
  ) {
    const c = sim.opt.target ?? sim.origin;
    this.center = { x: c.x, z: c.z };
    this.base = sim.rng.range(0, Math.PI * 2);
    const hs = sim.hounds;
    const pa = this.base + Math.PI / Math.max(1, hs.length);
    this.pikeurSpot = { x: c.x + Math.cos(pa) * 14, z: c.z + Math.sin(pa) * 14 };
    for (const a of hs) a.awareness = 0.7;
    if (!fresh) return; // switching from another mode: they walk in from where they are
    // they come out of the fog from all sides
    hs.forEach((a, i) => {
      const ang = this.base + (i / hs.length) * Math.PI * 2 + sim.rng.range(-0.25, 0.25);
      const r = sim.rng.range(26, 34);
      sim.place(sim.agents.indexOf(a), c.x + Math.cos(ang) * r, c.z + Math.sin(ang) * r, headingTo(-Math.cos(ang), -Math.sin(ang)));
    });
    const pk = sim.pikeur;
    if (pk) sim.place(0, c.x + Math.cos(pa) * 38, c.z + Math.sin(pa) * 38, headingTo(-Math.cos(pa), -Math.sin(pa)));
  }

  /** Total length of the calm-down for n hounds. */
  static duration(n: number): number {
    const F = FINALE;
    const lastDim = F.lieStart + (n - 1) * F.lieGap + F.dimDelay + F.dimDur;
    // the hounds fade one by one, the Pikeur last (slot n)
    return lastDim + F.fadeDelay + n * F.fadeGap + F.fadeDur + F.endPause;
  }

  slot(i: number, n: number): XZ {
    const ang = this.base + (i / n) * Math.PI * 2;
    return { x: this.center.x + Math.cos(ang) * FINALE.circle, z: this.center.z + Math.sin(ang) * FINALE.circle };
  }

  step(dt: number, p: PlayerSense): boolean {
    const sim = this.sim;
    const T = sim.tune;
    const F = FINALE;
    this.t += dt;
    this.returnCd = Math.max(0, this.returnCd - dt);
    const hs = sim.hounds;
    const n = hs.length;
    const c = this.center;
    const pd = dist(p, c);
    const pk = sim.pikeur;
    switch (this.phase) {
      case 'gather':
      case 'wait': {
        let arrived = 0;
        hs.forEach((a, i) => {
          const s = this.slot(i, n);
          const d = Math.hypot(s.x - a.x, s.z - a.z);
          if (d > 0.6) sim.moveToward(a, s.x, s.z, d > 8 ? T.speed.search : T.speed.trot * 0.8, dt, 5, 0.4);
          else {
            arrived++;
            sim.halt(a, dt);
            sim.face(a, p.x - a.x, p.z - a.z, dt);
            a.sniffing = Math.sin(sim.time * 0.5 + i * 2.1) > 0.92;
          }
        });
        if (pk) {
          const d = dist(pk, this.pikeurSpot);
          if (d > 1) sim.moveToward(pk, this.pikeurSpot.x, this.pikeurSpot.z, T.pikeurSpeed.patrol * 1.4, dt, 2, 0.8);
          else {
            sim.halt(pk, dt, 2);
            sim.face(pk, c.x - pk.x, c.z - pk.z, dt);
          }
        }
        if (this.phase === 'gather' && (arrived === n || this.t > 14)) {
          this.phase = 'wait';
          this.t = 0;
          sim.horn('call-off'); // three long: Sammeln
          sim.emit({ type: 'finale', outcome: 'gathered', x: c.x, z: c.z });
        }
        if (this.phase === 'wait') {
          if (pd > F.leash && this.returnCd <= 0) {
            // "Nicht noch einmal. Bitte." — the system fades and brings you back
            this.returnCd = 4;
            sim.emit({ type: 'finale', outcome: 'returned', x: c.x, z: c.z });
          } else if (pd <= F.leash && p.stance === 'prone' && (p.lanternLit || sim.opt.oneKey === true)) {
            this.phase = 'calm';
            this.t = 0;
            sim.emit({ type: 'finale', outcome: 'calmed', x: c.x, z: c.z });
          }
        }
        sim.alert = this.phase === 'gather' ? 0.35 : 0.3;
        break;
      }
      case 'calm': {
        const end = FinaleMode.duration(n);
        this.calm = clamp01(this.t / end);
        const lastDim = F.lieStart + (n - 1) * F.lieGap + F.dimDelay + F.dimDur;
        hs.forEach((a, k) => {
          const s = this.slot(k, n);
          if (Math.hypot(s.x - a.x, s.z - a.z) > 0.4 && a.lie < 0.2) sim.moveToward(a, s.x, s.z, T.speed.patrol, dt, 4, 0.3);
          else sim.halt(a, dt, 3);
          // they look at you while they lie down
          sim.face(a, p.x - a.x, p.z - a.z, dt * 0.5);
          a.sniffing = false;
          const ls = F.lieStart + k * F.lieGap;
          a.lie = clamp01((this.t - ls) / F.lieDur);
          if (a.lie > 0 && !this.lain.has(a)) {
            this.lain.add(a);
            sim.emit({ type: 'lie', idx: sim.agents.indexOf(a) });
          }
          a.dim = clamp01((this.t - ls - F.dimDelay) / F.dimDur);
          a.gone = clamp01((this.t - lastDim - F.fadeDelay - k * F.fadeGap) / F.fadeDur);
          a.awareness = 0.7 * (1 - a.dim);
        });
        if (pk) {
          // hoofbeats, then silence: he rides in a few steps and halts
          const inner = { x: c.x + (this.pikeurSpot.x - c.x) * 0.66, z: c.z + (this.pikeurSpot.z - c.z) * 0.66 };
          if (this.t < 6 && dist(pk, inner) > 0.5) sim.moveToward(pk, inner.x, inner.z, 1.3, dt, 2, 0.4);
          else sim.halt(pk, dt, 1.5);
          sim.face(pk, c.x - pk.x, c.z - pk.z, dt);
          pk.gone = clamp01((this.t - lastDim - F.fadeDelay - n * F.fadeGap) / F.fadeDur);
        }
        sim.alert = 0.3 * clamp01(1 - this.t / 4);
        if (this.t >= end) {
          this.phase = 'done';
          this.t = 0;
          sim.emit({ type: 'finale', outcome: 'faded', x: c.x, z: c.z });
        }
        break;
      }
      case 'done':
        for (const a of hs) {
          a.gone = 1;
          a.dim = 1;
          a.lie = 1;
        }
        if (pk) {
          sim.halt(pk, dt, 2);
          pk.gone = 1;
        }
        this.calm = 1;
        sim.alert = 0;
        break;
    }
    return true;
  }

  mayCatch(): boolean {
    return false;
  }
}

// =============================================================================================
// parforce
// =============================================================================================

export interface ParforceStats {
  rests: number;
  rideIns: number;
  /** Closest the Pikeur came (m). */
  minPikeur: number;
  /** Sim time when the goal was reached (−1 = not yet). */
  escapedAt: number;
  /** Sim time the hounds were let go. */
  releasedAt: number;
}

export class ParforceMode implements ModeController {
  readonly mode: PackMode = 'parforce';
  phase: 'release' | 'hunt' | 'escaped' = 'release';
  private releaseLeft: number;
  private surgeT = 0;
  private nextRest: number;
  resting = false;
  private restMin = 0;
  private restSpot: XZ | null = null;
  private pikT = 0;
  private pikSide = 1;
  private pikCycle = 0;
  private rideAnnounced = false;
  private prev: XZ | null = null;
  private vel = { x: 0, z: 0 };
  private bayT = 0.6;
  private scentT = 0;
  readonly stats: ParforceStats = { rests: 0, rideIns: 0, minPikeur: Infinity, escapedAt: -1, releasedAt: -1 };

  constructor(
    private readonly sim: PackSim,
    fresh = true,
  ) {
    const o = sim.opt;
    // gentle mode: three seconds more than the story asks for (bible: 6 s, gentle 9 s)
    this.releaseLeft = (o.headStart ?? 6) + (o.gentle ? 3 : 0);
    if (!fresh && o.target) {
      // the stand breaks (K1 finale): the hounds between you and the water break aside
      const p = sim.playerAt ?? sim.lastKnown ?? sim.origin;
      const toT = dist(p, o.target);
      // … and any at your heels (you stood at the ring's edge) fall back a few strides: the dash
      // starts with a gap, never with a hound already on you
      for (const h of sim.hounds) if (dist(h, o.target) < toT + 2 || dist(h, p) < 8) {
        h.scatterT = 2.4;
        h.scatterX = p.x;
        h.scatterZ = p.z;
      }
    }
    this.nextRest = this.restGap();
    // a rider kept far off (K1) rides past close once, early: the horn at your ear, hooves by your
    // shoulder, then away to his distance again (playtest round 4: "he never threatened")
    this.pikT = o.pikeurFar ? 10.5 : sim.rng.range(0, 6);
    this.pikSide = sim.rng.next() < 0.5 ? -1 : 1;
    // two short: the hounds have the scent (bible ch. 2 §9 B)
    sim.horn('found');
    sim.lastKnown = { ...sim.origin };
    for (const h of sim.hounds) h.awareness = 0.6;
  }

  private restGap(): number {
    return this.sim.opt.gentle ? this.sim.rng.range(13, 18) : this.sim.opt.rauhnacht ? this.sim.rng.range(24, 32) : this.sim.rng.range(17, 24);
  }

  /** Where the player is heading (smoothed), or from the pack towards him when standing. */
  private dir(p: PlayerSense): XZ {
    const v = Math.hypot(this.vel.x, this.vel.z);
    if (v > 0.8) return { x: this.vel.x / v, z: this.vel.z / v };
    const hs = this.sim.hounds;
    let cx = 0;
    let cz = 0;
    for (const h of hs) {
      cx += h.x / hs.length;
      cz += h.z / hs.length;
    }
    const d = Math.hypot(p.x - cx, p.z - cz) || 1;
    return { x: (p.x - cx) / d, z: (p.z - cz) / d };
  }

  step(dt: number, p: PlayerSense): boolean {
    const sim = this.sim;
    if (this.prev && dt > 0) {
      const k = Math.min(1, dt * 2.5);
      this.vel.x += ((p.x - this.prev.x) / dt - this.vel.x) * k;
      this.vel.z += ((p.z - this.prev.z) / dt - this.vel.z) * k;
    }
    this.prev = { x: p.x, z: p.z };
    const tgt = sim.opt.target;
    const wet = sim.isWater(p.x, p.z);
    if (this.phase !== 'escaped' && ((tgt && dist(p, tgt) < (sim.opt.goalRadius ?? 25)) || (wet && this.phase === 'hunt' && sim.waterTime > 1))) {
      this.phase = 'escaped';
      this.stats.escapedAt = sim.time;
      if (this.resting) this.endRest();
      sim.setState('searching', true);
      sim.emit({ type: 'goal', x: p.x, z: p.z });
      sim.horn('call-off');
    }
    if (this.phase === 'escaped') {
      // they stop at the bank and watch; the Pikeur can't cross running water
      for (const a of sim.agents) {
        const d = dist(a, p);
        const keep = a.kind === 'pikeur' ? 16 : 9;
        if (d > keep + 1 && !sim.isWater(a.x, a.z)) sim.moveToward(a, p.x, p.z, sim.tune.speed.trot, dt, 4, keep);
        else sim.halt(a, dt, 4);
        sim.face(a, p.x - a.x, p.z - a.z, dt);
        a.awareness = Math.max(0.3, a.awareness - dt * 0.1);
      }
      sim.alert = Math.max(0, sim.alert - dt * 0.25);
      return true;
    }
    if (this.phase === 'release') {
      this.releaseLeft -= dt;
      this.bayT -= dt;
      const hs = sim.hounds;
      if (this.bayT <= 0 && hs.length) {
        this.bayT = sim.rng.range(0.8, 1.6);
        sim.emit({ type: 'bay', idx: sim.agents.indexOf(sim.rng.pick(hs)), kind: sim.rng.next() < 0.3 ? 'howl' : 'bark' });
      }
      for (const a of sim.agents) {
        sim.halt(a, dt, 6);
        sim.face(a, p.x - a.x, p.z - a.z, dt);
        a.sniffing = a.kind === 'hound' && Math.sin(sim.time * 3 + a.idx) > 0.4;
      }
      sim.alert = 0.62;
      if (this.releaseLeft <= 0) {
        this.phase = 'hunt';
        this.stats.releasedAt = sim.time;
        sim.lastKnown = { x: p.x, z: p.z };
        sim.contactAge = 0;
        sim.setState('chasing', true);
        for (const a of sim.agents) a.sniffing = false;
        if (hs.length) sim.emit({ type: 'bay', idx: sim.agents.indexOf(hs[0]!), kind: 'howl' });
      }
      return true;
    }
    return false;
  }

  private endRest(): void {
    this.resting = false;
    this.restSpot = null;
    this.sim.emit({ type: 'rest', on: false });
  }

  think(dt: number, p: PlayerSense): boolean {
    const sim = this.sim;
    if (sim.state === 'chasing') {
      if (this.resting) this.endRest();
      // a running quarry leaves hot scent: they stay on it (hiding means stopping out of sight:
      // lying flat, a cellar, the shadow of a wall — or water)
      if (p.speed > 2 && !sim.isWater(p.x, p.z) && p.stance === 'stand') {
        sim.contactAge = 0;
        sim.lastKnown = { x: p.x, z: p.z };
      }
      this.surgeT += dt;
      let minD = Infinity;
      for (const h of sim.hounds) minD = Math.min(minD, dist(h, p));
      const pk = sim.pikeur;
      const pkD = pk ? dist(pk, p) : Infinity;
      if (this.surgeT >= this.nextRest && minD >= 7 && pkD >= 12) {
        // a breather: the scent drifts on the frost, the hounds overrun it and cast around
        this.surgeT = 0;
        this.nextRest = this.restGap();
        sim.setState('searching'); // falling horn: "verloren"
        sim.searchLeft = sim.rng.range(5.5, 7.5) * (sim.opt.gentle ? 1.3 : 1);
        this.resting = true;
        this.restMin = 3.5;
        this.restSpot = sim.lastKnown ? { ...sim.lastKnown } : { x: p.x, z: p.z };
        this.stats.rests++;
        sim.emit({ type: 'rest', on: true });
        return true;
      }
    } else if (sim.state === 'calm') {
      // the par force hunt is never called off: cast wider, pick the scent up again
      this.recast(p);
      return true;
    } else if (sim.state === 'suspicious') {
      if (p.speed > 2 && p.stance === 'stand' && sim.stateTime > 2) {
        // you broke cover and ran: hot scent again
        this.recast(p);
        return true;
      }
      this.scentT -= dt;
      if (this.scentT <= 0) {
        this.scentT = 3.5;
        const e = 6;
        sim.lastNoise = { x: p.x + sim.rng.range(-e, e), z: p.z + sim.rng.range(-e, e) };
        for (const h of sim.hounds) h.awareness = Math.max(h.awareness, 0.35);
      }
    }
    if (this.resting) {
      this.restMin -= dt;
      // the first seconds of a breather they really don't know where you went
      if (this.restMin > 0 && this.restSpot) sim.lastKnown = { ...this.restSpot };
      if (sim.state !== 'searching') this.endRest();
    }
    // Pikeur's ride-in cycle
    this.pikT += dt;
    return false;
  }

  private recast(p: PlayerSense): void {
    const sim = this.sim;
    if (this.resting) this.endRest();
    if (p.speed > 1 && p.stance === 'stand' && !sim.isWater(p.x, p.z)) {
      // the breather is over: they have the scent again (two short)
      sim.lastKnown = { x: p.x, z: p.z };
      sim.contactAge = 0;
      sim.setState('chasing');
      return;
    }
    // you hid well: they cast around, wider and wider (one long: the hunt goes on)
    sim.lastNoise = { x: p.x, z: p.z };
    sim.setState('suspicious', true);
    sim.horn('search');
    this.scentT = 3.5;
    for (const h of sim.hounds) h.awareness = Math.max(h.awareness, 0.4);
  }

  searchEnded(p: PlayerSense): boolean {
    if (this.phase !== 'hunt') return false;
    this.recast(p);
    return true;
  }

  awareness(): number {
    return this.resting && this.restMin > 0 ? 0.15 : 1;
  }

  chaseSpeed(a: Agent, p: PlayerSense): number {
    if (a.kind === 'pikeur') return 1;
    const d = dist(a, p);
    // rubber band: they never fall far behind, and don't snap at your heels for long. `heel` is
    // the gap they settle at behind a runner (default 9 m), `burst` how hard they come out of
    // the release (a short chase: they must catch up within seconds to be felt)
    const heel = this.sim.opt.heel ?? 9;
    const b = this.sim.opt.burst ?? 1;
    if (d > heel + 21) return 1.2 * b;
    if (d > heel + 5) return 1.06 * Math.sqrt(b);
    if (d > heel) return 1;
    if (this.sim.opt.keepPace && !p.flying) {
      // at the heel: a runner who keeps going (≥ 4 m/s) is not run down — they hold the gap; one
      // who stops to look back sees them falter and bay before they close (a long stop still ends it)
      if (p.speed >= 4) return Math.min(0.9, (p.speed * 0.97) / this.sim.tune.speed.chase);
      if (p.speed < 1) return this.sim.opt.gentle ? 0.35 : 0.55;
    }
    return 0.9;
  }

  /** The Pikeur rides on a flank, parallel; every cycle he rides in (horn first) and sheers off. */
  /** Flankers are the last `flankers` hounds of the pack (−1: runs at the heel). */
  private flankRank(a: Agent): number {
    const n = Math.max(0, Math.round(this.sim.opt.flankers ?? 0));
    if (!n) return -1;
    const hs = this.sim.hounds;
    const i = hs.indexOf(a);
    return i >= hs.length - n ? hs.length - 1 - i : -1;
  }

  /**
   * K1 finale: flankers run ahead on both sides and close the way (a turn towards them runs you
   * into their teeth); one at a time a hound crouches and lunges (the wind-up is the telegraph:
   * growl, crouch, eyes flare). A dodge roll beats it; a bite costs ground, the last one ends it.
   */
  private actHound(a: Agent, dt: number, p: PlayerSense): boolean {
    const sim = this.sim;
    if (this.phase !== 'hunt' || sim.state !== 'chasing' || this.resting) return false;
    const since = sim.time - this.stats.releasedAt;
    const d = dist(a, p);
    const rank = this.flankRank(a);
    if (sim.canLunge() && since > 3 && !p.flying && !sim.isWater(p.x, p.z) && (a.scatterT ?? 0) <= 0) {
      if (rank >= 0 && d < 6.8 && d > 2.2) {
        sim.beginLunge(a, p);
        return true;
      }
    }
    if (rank < 0) return false;
    const dir = this.dir(p);
    const rx = -dir.z;
    const rz = dir.x;
    const side = rank % 2 === 0 ? -1 : 1;
    const lead = 3.5 + 3 * Math.sin(sim.time * 0.5 + rank * 2.1);
    const lat = (sim.opt.gentle ? 9 : 7) + 2 * Math.sin(sim.time * 0.37 + rank);
    const tx = p.x + dir.x * lead + rx * side * lat;
    const tz = p.z + dir.z * lead + rz * side * lat;
    const dd = Math.hypot(tx - a.x, tz - a.z);
    const chase = sim.tune.speed.chase;
    // spectral legs: far from their place they race to it (that is how they get ahead of you)
    const sp = dd > 10 ? chase * 1.45 : dd > 5 ? chase * 1.2 : Math.max(chase * 0.55, Math.min(chase * 1.05, p.speed + dd * 0.6));
    sim.moveToward(a, tx, tz, sp, dt, 7, 0.8);
    return true;
  }

  /** Flankers cut you off and lunge; they never catch by running into you. */
  catches(a: Agent): boolean {
    return this.flankRank(a) < 0;
  }

  act(a: Agent, dt: number, p: PlayerSense): boolean {
    const sim = this.sim;
    if (a.kind === 'hound') return this.actHound(a, dt, p);
    if (a.kind !== 'pikeur' || this.phase !== 'hunt' || sim.state !== 'chasing') return false;
    const CYCLE = 24;
    const c = this.pikT % CYCLE;
    const cyc = Math.floor(this.pikT / CYCLE);
    if (cyc !== this.pikCycle) {
      // next cycle: the other flank
      this.pikCycle = cyc;
      this.pikSide = -this.pikSide;
      this.rideAnnounced = false;
    }
    const d = this.dir(p);
    const rx = -d.z;
    const rz = d.x;
    const pass = (sim.opt.pikeurFar ?? 0) > 0 && this.pikCycle === 0;
    const far = pass ? 0 : sim.opt.pikeurFar ?? 0;
    const latEnd = pass ? (sim.opt.gentle ? 8 : 5) : Math.max(far, sim.opt.gentle ? 9 : sim.opt.rauhnacht ? 4.5 : 6.5);
    let lat: number;
    let lead: number;
    if (c < 13) {
      lat = Math.max(30, far);
      lead = 12;
    } else if (c < 20) {
      if (!this.rideAnnounced) {
        this.rideAnnounced = true;
        this.stats.rideIns++;
        sim.horn('search'); // he rides in: the horn comes first, from the flank
      }
      const k = (c - 13) / 7;
      lat = Math.max(30, far) + (latEnd - Math.max(30, far)) * Math.min(1, k * 1.4);
      lead = pass ? 3 : far ? 10 : 4;
    } else {
      lat = latEnd + (Math.max(30, far) - latEnd) * ((c - 20) / 4);
      lead = far ? 8 : -6;
    }
    const tx = p.x + d.x * lead + rx * this.pikSide * lat;
    const tz = p.z + d.z * lead + rz * this.pikSide * lat;
    sim.moveToward(a, tx, tz, sim.tune.pikeurSpeed.chase * 1.5, dt, 2.6, 1.5);
    this.stats.minPikeur = Math.min(this.stats.minPikeur, dist(a, p));
    return true;
  }

  mayCatch(): boolean {
    return this.phase === 'hunt';
  }
}

// =============================================================================================
// follow
// =============================================================================================

/** Gaps (m) the hounds keep behind the player in follow mode; they back off inside `shy`. */
export const FOLLOW = { first: 16, step: 4.5, shy: 11, crumb: 1.2, keep: 260 };

/**
 * Ending C ("Behalten"): the pack follows you through the night, harmless. The hounds walk in your
 * footsteps (a breadcrumb trail of where you went) at 16 m and more behind, one after another;
 * turn round and walk at them and they back off and sit; they never catch (mayCatch false), the
 * threat meter barely moves, now and then one of them gives tongue.
 */
export class FollowMode implements ModeController {
  readonly mode: PackMode = 'follow';
  private readonly trail: XZ[] = [];
  private bayT: number;

  constructor(
    private readonly sim: PackSim,
    fresh = true,
  ) {
    this.bayT = sim.rng.range(8, 16);
    for (const a of sim.agents) a.awareness = 0.45;
    if (!fresh) return;
    // they come out of the dark behind you, wherever that is
    const p = sim.origin;
    const base = sim.rng.range(0, Math.PI * 2);
    sim.agents.forEach((_a, i) => {
      const th = base + (i - (sim.agents.length - 1) / 2) * 0.35;
      const r = sim.rng.range(30, 40);
      const x = p.x + Math.cos(th) * r;
      const z = p.z + Math.sin(th) * r;
      sim.place(i, x, z, headingTo(p.x - x, p.z - z));
    });
  }

  /** The point `back` metres behind the player along the trail he walked (null: not that long yet). */
  behind(back: number): XZ | null {
    let left = back;
    for (let i = this.trail.length - 1; i > 0; i--) {
      const a = this.trail[i]!;
      const b = this.trail[i - 1]!;
      const l = dist(a, b);
      if (l >= left) {
        const k = left / Math.max(1e-6, l);
        return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
      }
      left -= l;
    }
    return null;
  }

  step(dt: number, p: PlayerSense): boolean {
    const sim = this.sim;
    const T = sim.tune;
    const last = this.trail[this.trail.length - 1];
    if (!last || dist(last, p) >= FOLLOW.crumb) {
      this.trail.push({ x: p.x, z: p.z });
      if (this.trail.length > FOLLOW.keep) this.trail.shift();
    }
    sim.agents.forEach((a, i) => {
      const gap = FOLLOW.first + i * FOLLOW.step;
      const d = dist(a, p);
      if (d < FOLLOW.shy && !p.flying) {
        // you came at them: they give way, then sit and watch
        const k = (FOLLOW.shy + 3) / Math.max(0.5, d);
        sim.moveToward(a, p.x + (a.x - p.x) * k, p.z + (a.z - p.z) * k, T.speed.trot, dt, 6, 0.5);
        a.sniffing = false;
        return;
      }
      // in your footsteps, each a little further back (a short trail: straight towards you)
      const side = (i % 2 ? 1 : -1) * 0.9;
      const spot = this.behind(gap) ?? (d > gap + 2 ? { x: p.x + ((a.x - p.x) / d) * gap, z: p.z + ((a.z - p.z) / d) * gap } : null);
      const sd = spot ? Math.hypot(spot.x - a.x, spot.z - a.z) : 0;
      if (spot && sd > 1.2) {
        const v = Math.min(T.speed.chase * 1.1, Math.max(T.speed.patrol, sd * 0.9));
        sim.moveToward(a, spot.x + side, spot.z - side, v, dt, 5, 0.6);
        a.sniffing = v < T.speed.trot && i % 2 === 0;
      } else {
        sim.halt(a, dt, 4);
        sim.face(a, p.x - a.x, p.z - a.z, dt);
        a.sniffing = false;
      }
      a.awareness = 0.45;
    });
    this.bayT -= dt;
    if (this.bayT <= 0 && sim.hounds.length) {
      this.bayT = sim.rng.range(14, 28);
      sim.emit({ type: 'bay', idx: sim.agents.indexOf(sim.rng.pick(sim.hounds)), kind: sim.rng.next() < 0.5 ? 'howl' : 'bark' });
    }
    sim.setState('calm', true);
    sim.alert = 0.08;
    return true;
  }

  mayCatch(): boolean {
    return false;
  }
}

// =============================================================================================
// stand
// =============================================================================================

/** Stand geometry (m): the arc behind, the blockers ahead, where breaking out begins. */
export const STAND = { arc: 15, arcSpread: 2.4, block: 12, blockLat: 4.5, engage: 14, leash: 22, ahead: 7, behind: 8, side: 11 };

/**
 * K1 finale "Die Enge": the pack has run you into a narrow place (`target`) and holds you there.
 * The hounds stand in an arc on the side they came from (`from`), two of them lie in wait across
 * the way out, the Pikeur sits his horse far up the slope. The fight is with the strays they send
 * (story `enemy` waves); the pack itself only holds the ring: try to slip out ahead, back or to
 * the side and the nearest hound lunges; run off for good and they have you. Until you are close
 * they only wait (a return after being caught walks in safely). The story re-configures the same
 * area with `parforce` when the wave is beaten: the blockers break aside.
 */
export class StandMode implements ModeController {
  readonly mode: PackMode = 'stand';
  engaged = false;
  t = 0;
  readonly center: XZ;
  /** Unit vector from the pack's side towards the way out. */
  readonly out: XZ;
  private hornT = 4;
  private barkT = 1;
  /** The player's distance to the centre on the previous step (−1 = none yet). */
  private lastPd = -1;

  constructor(
    private readonly sim: PackSim,
    fresh = true,
  ) {
    const c = sim.opt.target ?? sim.origin;
    this.center = { x: c.x, z: c.z };
    const f = sim.opt.from ?? { x: c.x, z: c.z + 20 };
    const d = dist(c, f) || 1;
    this.out = { x: (c.x - f.x) / d, z: (c.z - f.z) / d };
    for (const h of sim.hounds) h.awareness = 0.9;
    if (!fresh) return;
    const hs = sim.hounds;
    const nb = this.blockerCount();
    hs.forEach((a, i) => {
      const s = i >= hs.length - nb ? this.blockSlot(hs.length - 1 - i) : this.arcSlot(i, hs.length - nb, 6);
      sim.place(sim.agents.indexOf(a), s.x, s.z, headingTo(c.x - s.x, c.z - s.z));
    });
    const pk = sim.pikeur;
    if (pk) {
      const s = this.pikeurSpot();
      sim.place(0, s.x, s.z, headingTo(c.x - s.x, c.z - s.z));
    }
  }

  private blockerCount(): number {
    const n = this.sim.hounds.length;
    return n >= 5 ? 2 : n >= 3 ? 1 : 0;
  }

  private get right(): XZ {
    return { x: -this.out.z, z: this.out.x };
  }

  arcSlot(i: number, n: number, extra = 0): XZ {
    const back = Math.atan2(-this.out.z, -this.out.x);
    const th = back + (n <= 1 ? 0 : i / (n - 1) - 0.5) * STAND.arcSpread;
    const r = STAND.arc + extra + 1.8 * Math.sin(this.sim.time * 0.4 + i * 1.7);
    return { x: this.center.x + Math.cos(th) * r, z: this.center.z + Math.sin(th) * r };
  }

  blockSlot(j: number): XZ {
    const r = this.right;
    const s = j % 2 === 0 ? -1 : 1;
    return { x: this.center.x + this.out.x * STAND.block + r.x * s * STAND.blockLat, z: this.center.z + this.out.z * STAND.block + r.z * s * STAND.blockLat };
  }

  pikeurSpot(): XZ {
    const r = this.right;
    return { x: this.center.x - this.out.x * 40 + r.x * 14, z: this.center.z - this.out.z * 40 + r.z * 14 };
  }

  step(dt: number, p: PlayerSense): boolean {
    const sim = this.sim;
    const T = sim.tune;
    this.t += dt;
    const c = this.center;
    const pd = dist(p, c);
    if (!this.engaged && pd < STAND.engage && !p.flying) {
      this.engaged = true;
      this.t = 0;
      sim.horn('found');
      sim.setState('chasing', true);
    }
    const hs = sim.hounds;
    const nb = this.blockerCount();
    const na = hs.length - nb;
    let nearest: Agent | null = null;
    let nd = Infinity;
    hs.forEach((a, i) => {
      const dp = Math.hypot(p.x - a.x, p.z - a.z);
      if (dp < nd && !a.lunge && !(a.scatterT && a.scatterT > 0)) {
        nd = dp;
        nearest = a;
      }
      if (a.lunge) return;
      if (a.scatterT && a.scatterT > 0) {
        sim.moveToward(a, a.x + (a.x - (a.scatterX ?? a.x)), a.z + (a.z - (a.scatterZ ?? a.z)), T.speed.chase, dt, 3, 0);
        a.scatterT = Math.max(0, a.scatterT - dt);
        return;
      }
      const blocker = i >= na;
      const s = blocker ? this.blockSlot(hs.length - 1 - i) : this.arcSlot(i, na);
      const d = Math.hypot(s.x - a.x, s.z - a.z);
      if (d > 0.7) sim.moveToward(a, s.x, s.z, d > 6 ? T.speed.chase : T.speed.trot, dt, 6, 0.5);
      else {
        sim.halt(a, dt);
        sim.face(a, p.x - a.x, p.z - a.z, dt);
      }
      // the ones across the way out lie low and wait; the arc paces and snaps
      a.sniffing = blocker && d < 1;
      a.awareness = this.engaged ? 1 : 0.8;
    });
    const pk = sim.pikeur;
    if (pk) {
      const s = this.pikeurSpot();
      if (dist(pk, s) > 1.5) sim.moveToward(pk, s.x, s.z, T.pikeurSpeed.search, dt, 2, 1);
      else {
        sim.halt(pk, dt, 2);
        sim.face(pk, p.x - pk.x, p.z - pk.z, dt);
      }
    }
    if (this.engaged) {
      const r = this.right;
      const along = (p.x - c.x) * this.out.x + (p.z - c.z) * this.out.z;
      const lat = Math.abs((p.x - c.x) * r.x + (p.z - c.z) * r.z);
      const outside = along > STAND.ahead || along < -STAND.behind || lat > STAND.side;
      // only a player moving OUT draws a lunge: one who arrives from behind, stands at the edge
      // of the ring or is pushed by a blow while fighting the strays is not slipping away
      const leaving = this.lastPd >= 0 && pd > this.lastPd + 0.004;
      const breaking = outside && leaving;
      if (breaking && sim.canLunge() && !p.flying) {
        // the nearest hound on that side springs
        let best: Agent | null = null;
        let bd = Infinity;
        for (const h of hs) {
          if (h.lunge || (h.scatterT ?? 0) > 0) continue;
          const dd = Math.hypot(p.x - h.x, p.z - h.z);
          if (dd < bd) {
            bd = dd;
            best = h;
          }
        }
        if (best && bd < 9) sim.beginLunge(best, p);
      }
      if (pd > STAND.leash && nearest && !p.flying) sim.catchBy(nearest);
      this.hornT -= dt;
      if (this.hornT <= 0) {
        this.hornT = sim.rng.range(13, 18);
        sim.horn('search');
      }
      this.barkT -= dt;
      if (this.barkT <= 0 && hs.length) {
        this.barkT = sim.rng.range(1.2, 3);
        const a = sim.rng.pick(hs);
        sim.emit({ type: 'bay', idx: sim.agents.indexOf(a), kind: sim.rng.next() < 0.2 ? 'howl' : 'bark' });
      }
      sim.setState('chasing', true);
      sim.alert = 0.78;
    } else {
      sim.setState('searching', true);
      sim.searchLeft = T.search;
      sim.alert = 0.45;
    }
    this.lastPd = pd;
    return true;
  }

  mayCatch(): boolean {
    return false;
  }
}

// =============================================================================================
// kennel
// =============================================================================================

/**
 * K3 "Der Zwinger" (28 July 1793, the night of the fire): the pack paces the walled kennel yard
 * (`target`, `radius` m), restless, baying at the smoke; nothing catches. Story cue
 * `hunt:release` opens the gates: one after another they burst out along `via` (the gate, then
 * the dark) past the player and are gone into the night (`release` events, then 'released').
 */
/** Seconds the kennel doors swing before the first hound comes through. */
export const KENNEL_DOOR_S = 0.7;
/** Lateral distance (m) at which the released pack passes a player near the gate. */
export const KENNEL_PASS = 4.5;

/**
 * The released pack's way when the player stands near the gate (pure): out through the gate,
 * then along a line KENNEL_PASS m beside the player (on the gate's side, heading for the rest of
 * the route), then on. A player farther than 30 m from the gate changes nothing.
 */
export function kennelRoute(route: readonly XZ[], player: XZ, pen?: XZ): XZ[] {
  const g = route[0];
  if (!g || Math.hypot(player.x - g.x, player.z - g.z) > 30) return [...route];
  const on = route[1] ?? { x: g.x + 40, z: g.z };
  let hx = on.x - player.x;
  let hz = on.z - player.z;
  const hl = Math.hypot(hx, hz) || 1;
  hx /= hl;
  hz /= hl;
  // side: the one the gate is on (they come from there and need not cross the player's line)
  let sx = -hz;
  let sz = hx;
  if ((g.x - player.x) * sx + (g.z - player.z) * sz < 0) {
    sx = -sx;
    sz = -sz;
  }
  // the pass line: KENNEL_PASS m to the side, along h; join it level with the gate (never behind it)
  const tg = (g.x - player.x) * hx + (g.z - player.z) * hz;
  const at = (t: number): XZ => ({ x: player.x + hx * t + sx * KENNEL_PASS, z: player.z + hz * t + sz * KENNEL_PASS });
  let ta = Math.max(-8, tg + 1);
  // a gate already past the player: join the line level with the player instead, as long as that
  // stays outside the wall (1.5 m beyond the gate, away from the pen)
  if (ta > 0 && pen) {
    const nl = Math.hypot(g.x - pen.x, g.z - pen.z) || 1;
    const nx = (g.x - pen.x) / nl;
    const nz = (g.z - pen.z) / nl;
    for (let t = 0; t < ta; t += 0.5) {
      const q = at(t);
      if ((q.x - g.x) * nx + (q.z - g.z) * nz >= 1.5) {
        ta = t;
        break;
      }
    }
  }
  const tb = Math.max(ta + 6, 10);
  const a = at(ta);
  const b = at(tb);
  return [g, a, b, ...route.slice(1)];
}

export class KennelMode implements ModeController {
  readonly mode: PackMode = 'kennel';
  phase: 'pen' | 'out' | 'gone' = 'pen';
  t = 0;
  private barkT = 0.5;
  private readonly route: XZ[];
  private readonly wp = new Map<Agent, number>();

  constructor(
    private readonly sim: PackSim,
    fresh = true,
  ) {
    const c = sim.opt.target ?? { x: sim.opt.x, z: sim.opt.z };
    this.route = [...(sim.opt.via ?? [])];
    if (!this.route.length) this.route.push({ x: c.x + 40, z: c.z });
    for (const a of sim.agents) a.awareness = 0.7;
    if (!fresh) return;
    sim.hounds.forEach((a, i) => {
      const s = this.penSpot(i);
      sim.place(sim.agents.indexOf(a), s.x, s.z, sim.rng.range(-Math.PI, Math.PI));
    });
  }

  private get pen(): { c: XZ; r: number } {
    const c = this.sim.opt.target ?? { x: this.sim.opt.x, z: this.sim.opt.z };
    return { c, r: Math.min(14, Math.max(4, this.sim.opt.radius)) };
  }

  private penSpot(i: number): XZ {
    const { c, r } = this.pen;
    const a = i * 2.39996 + this.sim.time * 0.05;
    const rr = r * (0.35 + 0.6 * ((i * 0.618) % 1));
    return { x: c.x + Math.cos(a) * rr, z: c.z + Math.sin(a) * rr };
  }

  /** The way out once the gates are open (gate, then past the player when one stands near). */
  get path(): readonly XZ[] {
    return this.out ?? this.route;
  }

  private out: XZ[] | null = null;
  /** Lateral spread at each waypoint of `path` (narrow where they pass the player). */
  private spread: number[] = [];

  /**
   * Open the gates (bible 3.12). With the player standing within 30 m of the gate, the pack's
   * way bends past them: KENNEL_PASS m to one side, so seven real dogs run by close enough to
   * feel, never through the player (docs/ACTION-RPG.md §14, playtest round 4).
   */
  release(player?: XZ): void {
    if (this.phase !== 'pen') return;
    this.phase = 'out';
    this.t = 0;
    this.sim.horn('found');
    for (const a of this.sim.hounds) this.wp.set(a, 0);
    this.out = player ? kennelRoute(this.route, player, this.pen.c) : null;
    // they were all at the bars already (the stranger at the gate, the smoke): bunched up just
    // inside, so the doors open on dogs, not on an empty yard
    const g = this.route[0]!;
    const { c } = this.pen;
    const l = Math.hypot(c.x - g.x, c.z - g.z) || 1;
    const ux = (c.x - g.x) / l;
    const uz = (c.z - g.z) / l;
    this.sim.hounds.forEach((a, i) => {
      const back = 3.2 + 1.3 * i;
      const side = ((i % 3) - 1) * 0.9;
      this.sim.place(this.sim.agents.indexOf(a), g.x + ux * back - uz * side, g.z + uz * back + ux * side, headingTo(-ux, -uz));
    });
    this.spread = (this.out ?? this.route).map((_, k) => (this.out && k > 0 && k < 3 ? 0.55 : 1.6));
  }

  step(dt: number, p: PlayerSense): boolean {
    const sim = this.sim;
    const T = sim.tune;
    this.t += dt;
    const hs = sim.hounds;
    if (this.phase === 'pen') {
      hs.forEach((a, i) => {
        if (!a.target || Math.hypot(a.target.x - a.x, a.target.z - a.z) < 0.8 || a.wait <= -6) {
          const { c, r } = this.pen;
          a.target = sim.randomPoint(c.x, c.z, r);
          a.wait = 0;
        }
        a.wait -= dt;
        // restless: trot to a corner, stop, look at the smoke / the stranger at the gate, trot on
        if (Math.sin(sim.time * 0.7 + i * 1.3) > 0.55) {
          sim.halt(a, dt);
          sim.face(a, p.x - a.x, p.z - a.z, dt);
          a.sniffing = Math.sin(sim.time * 1.9 + i) > 0.6;
        } else {
          a.sniffing = false;
          sim.moveToward(a, a.target.x, a.target.z, T.speed.trot * (1 + 0.15 * (i % 3)), dt, 5, 0.6);
        }
        a.awareness = 0.75;
      });
      this.barkT -= dt;
      if (this.barkT <= 0 && hs.length) {
        this.barkT = sim.rng.range(0.8, 2.2);
        sim.emit({ type: 'bay', idx: sim.agents.indexOf(sim.rng.pick(hs)), kind: sim.rng.next() < 0.3 ? 'howl' : 'bark' });
      }
      sim.setState('searching', true);
      sim.searchLeft = T.search;
      sim.alert = 0.25;
      return true;
    }
    // out: one after another through the gate, past the player, into the dark
    let left = 0;
    hs.forEach((a, i) => {
      if (a.gone >= 1) return;
      left++;
      const route = this.path;
      // the doors swing first (KENNEL_DOOR_S), then one after another
      if (this.t < KENNEL_DOOR_S + i * 0.35) {
        sim.face(a, route[0]!.x - a.x, route[0]!.z - a.z, dt);
        return;
      }
      const k = this.wp.get(a) ?? 0;
      const last = route.length - 1;
      const w = route[Math.min(k, last)]!;
      // a little spread so they don't run in single file through one point
      const off = ((i % 3) - 1) * (this.spread[Math.min(k, last)] ?? 1.6);
      // tight on the pass line (they must not cut the corner past the player), loose elsewhere
      const arrive = this.out && k > 0 && k < 3 ? 0.9 : 2.2;
      if (sim.moveToward(a, w.x + off, w.z - off, T.speed.chase * 1.1, dt, 7, arrive)) {
        if (k < last) this.wp.set(a, k + 1);
        else a.gone = Math.min(1, a.gone + dt * 1.2);
      } else if (k === last && dist(a, w) < 14) a.gone = Math.min(1, a.gone + dt * 0.5);
      a.sniffing = false;
      a.awareness = 1;
    });
    if (this.t > KENNEL_DOOR_S + 0.3 && this.t < KENNEL_DOOR_S + 0.4) sim.emit({ type: 'bay', idx: sim.agents.indexOf(hs[0]!), kind: 'howl' });
    sim.setState('chasing', true);
    sim.alert = left ? 0.4 : 0;
    if (!left && this.phase === 'out') {
      this.phase = 'gone';
      sim.emit({ type: 'goal', x: p.x, z: p.z });
    }
    return true;
  }

  mayCatch(): boolean {
    return false;
  }
}

/** Controller factory for PackSim (null = patrol). */
export const makeMode: MakeController = (sim, fresh) => {
  switch (sim.opt.mode) {
    case 'follow':
      return new FollowMode(sim, fresh);
    case 'drive':
      return new DriveMode(sim, fresh);
    case 'finale':
      return new FinaleMode(sim, fresh);
    case 'parforce':
      return new ParforceMode(sim, fresh);
    case 'stand':
      return new StandMode(sim, fresh);
    case 'kennel':
      return new KennelMode(sim, fresh);
    default:
      return null;
  }
};
