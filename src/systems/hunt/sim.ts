/**
 * "Die Meute" — deterministic pack simulation (hounds + optional Pikeur). Pure TypeScript: no
 * three.js, no DOM, no audio, no Math.random. Same options + same inputs ⇒ same result, which is
 * what makes `kq.step(n)` reproducible. The system (index.ts) turns its events into sound,
 * captions, HUD and contract events.
 *
 * States (bible ch. 1 §9, ch. 2 §9):
 *   calm        patrol along the path graph inside the area
 *   suspicious  a hound noticed something: sniff, approach the last noise
 *   searching   lost you: spread out around the last known position, the Pikeur rides there
 *   chasing     fast and direct; scent keeps them on your trail for a few seconds
 */
import { PathGraph } from './graph';
import { type PlayerSense, type SenseTuning, type SenseWorld, hearRange, hollowness, look, sightRange } from './perception';
import { Rng } from './rng';

export type PackState = 'calm' | 'suspicious' | 'searching' | 'chasing';
export type HornSignal = 'search' | 'found' | 'lost' | 'call-off';

export interface SimWorld extends SenseWorld {
  /** Push a circle out of buildings. */
  collide?(x: number, z: number, r: number): { x: number; z: number };
  bounds?(): { x0: number; z0: number; x1: number; z1: number };
}

export interface PackOptions {
  x: number;
  z: number;
  radius: number;
  /** 0..1 difficulty within the beat. */
  intensity: number;
  hounds: number;
  pikeur: boolean;
  seed: number;
  /** Base night sight (m) for a standing unlit player. */
  sight: number;
  /** Extra sight range of a lit lantern (m). */
  beacon: number;
  gentle: boolean;
  rauhnacht: boolean;
}

/** Names from the bible (Jost, 08-stimmen §5); the sixth is ours, in the same style. FIKTION. */
export const HOUND_NAMES = ['Diane', 'Sultan', 'Fanfare', 'Rauhreif', 'Bijou', 'Mirza'] as const;

export interface Agent {
  kind: 'hound' | 'pikeur';
  idx: number;
  name: string;
  x: number;
  y: number;
  z: number;
  /** Radians, same convention as the player yaw: forward = (−sin h, −cos h). */
  heading: number;
  speed: number;
  /** Metres travelled (gait phase for visuals). */
  dist: number;
  awareness: number;
  /** Sight strength this tick (0 = can't see you). */
  sees: number;
  /** Seconds of close sight (catch rule). */
  closeSee: number;
  target: { x: number; z: number } | null;
  path: number[];
  pathI: number;
  wait: number;
  sniffing: boolean;
  /** Formation offset relative to the leader (right, forward) in m. */
  off: { r: number; f: number };
  node: number;
  stuck: number;
}

export type SimEvent =
  | { type: 'state'; from: PackState; to: PackState }
  | { type: 'horn'; signal: HornSignal; x: number; z: number }
  | { type: 'bay'; idx: number; kind: 'howl' | 'bark' | 'growl' }
  | { type: 'caught'; by: number };

export interface Tuning {
  speed: { patrol: number; follow: number; trot: number; search: number; chase: number };
  pikeurSpeed: { patrol: number; search: number; chase: number };
  sense: SenseTuning;
  gain: number;
  /** Seconds the scent keeps the pack on your trail without sight/hearing. */
  scent: number;
  /** Seconds without any contact before the pack switches to searching. */
  lose: number;
  /** Seconds of searching before the call-off. */
  search: number;
  /** Seconds in water until the trail breaks even while seen. */
  water: number;
  reach: number;
  closeTime: number;
  pikeurReach: number;
}

export function makeTuning(o: PackOptions): Tuning {
  const k = (0.9 + 0.2 * o.intensity) * (o.gentle ? 0.7 : 1) * (o.rauhnacht ? 1.12 : 1);
  const acuity = (0.85 + 0.3 * o.intensity) * (o.gentle ? 0.7 : 1) * (o.rauhnacht ? 1.25 : 1);
  return {
    speed: { patrol: 1.45 * k, follow: 2.6 * k, trot: 2.8 * k, search: 3.3 * k, chase: 6.0 * k },
    pikeurSpeed: { patrol: 1.7 * k, search: 3.6 * k, chase: 5.0 * k },
    sense: { sight: o.sight, beacon: o.beacon, hearing: 34, acuity },
    gain: o.gentle ? 0.6 : 1,
    scent: o.gentle ? 2 : o.rauhnacht ? 5 : 3.5,
    lose: o.gentle ? 1.8 : 2.6,
    search: o.gentle ? 15 : o.rauhnacht ? 35 : 25,
    water: o.gentle ? 2 : 3,
    reach: o.gentle ? 1.0 : 1.4,
    closeTime: o.gentle ? 3 : 2,
    pikeurReach: o.gentle ? 3.5 : 5,
  };
}

const TWO_PI = Math.PI * 2;
const wrap = (a: number) => {
  a = (a + Math.PI) % TWO_PI;
  return (a < 0 ? a + TWO_PI : a) - Math.PI;
};
/** Heading (player-yaw convention) that looks from (0,0) along (dx, dz). */
export const headingTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);

export class PackSim {
  readonly agents: Agent[] = [];
  tune: Tuning;
  state: PackState = 'calm';
  stateTime = 0;
  /** 0..1 HUD threat level. */
  alert = 0;
  lastKnown: { x: number; z: number } | null = null;
  lastNoise: { x: number; z: number } | null = null;
  contactAge = 99;
  waterTime = 0;
  searchLeft = 0;
  caught: { by: number; t: number } | null = null;
  time = 0;
  /** Debug: AI frozen in place (agents still perceive, nothing moves). */
  frozen = false;
  private readonly rng: Rng;
  private readonly area: number[];
  private readonly inArea: Set<number>;
  private pending: SimEvent[] = [];
  private howlT: number;
  private barkT = 0;
  private packAw = 0;

  constructor(
    readonly world: SimWorld,
    readonly graph: PathGraph | null,
    public opt: PackOptions,
    player: { x: number; z: number },
  ) {
    this.rng = new Rng(opt.seed);
    this.tune = makeTuning(opt);
    this.howlT = this.rng.range(6, 14);
    this.area = graph ? graph.within(opt.x, opt.z, opt.radius).filter((i) => !this.isWater(graph.xs[i]!, graph.zs[i]!)) : [];
    this.inArea = new Set(this.area);
    const spawn = this.pickSpawn(player);
    const n = Math.max(1, Math.min(6, Math.round(opt.hounds)));
    const leaderIsPikeur = opt.pikeur;
    if (opt.pikeur) this.agents.push(this.makeAgent('pikeur', 0, 'Pikeur', spawn.x, spawn.z, spawn.h, { r: 0, f: 0 }));
    for (let i = 0; i < n; i++) {
      // par force: hounds run ahead of the huntsman; without him they trail the lead hound
      const side = i % 2 === 0 ? -1 : 1;
      const off = leaderIsPikeur
        ? { r: side * (1.2 + (i >> 1) * 1.6) + this.rng.range(-0.5, 0.5), f: 5 + i * 1.3 + this.rng.range(-1, 1) }
        : i === 0
          ? { r: 0, f: 0 }
          : { r: side * (1 + ((i - 1) >> 1) * 1.4) + this.rng.range(-0.4, 0.4), f: -(1.8 + i * 1.1) };
      // forward (−sin h, −cos h), right (cos h, −sin h)
      const ax = spawn.x - Math.sin(spawn.h) * off.f + Math.cos(spawn.h) * off.r;
      const az = spawn.z - Math.cos(spawn.h) * off.f - Math.sin(spawn.h) * off.r;
      this.agents.push(this.makeAgent('hound', i, HOUND_NAMES[i]!, ax, az, spawn.h, off));
    }
    for (const a of this.agents) a.node = spawn.node;
    this.horn('search');
  }

  private makeAgent(kind: Agent['kind'], idx: number, name: string, x: number, z: number, h: number, off: Agent['off']): Agent {
    const p = this.clampPos(x, z);
    return {
      kind,
      idx,
      name,
      x: p.x,
      y: this.world.heightAt(p.x, p.z),
      z: p.z,
      heading: h,
      speed: 0,
      dist: this.rng.range(0, 3),
      awareness: 0,
      sees: 0,
      closeSee: 0,
      target: null,
      path: [],
      pathI: 0,
      wait: 0,
      sniffing: false,
      off,
      node: -1,
      stuck: 0,
    };
  }

  get leader(): Agent {
    return this.agents[0]!;
  }

  get hounds(): Agent[] {
    return this.agents.filter((a) => a.kind === 'hound');
  }

  get pikeur(): Agent | null {
    return this.agents[0]!.kind === 'pikeur' ? this.agents[0]! : null;
  }

  isWater(x: number, z: number): boolean {
    return this.world.surfaceAt(x, z) === 'water';
  }

  private clampPos(x: number, z: number): { x: number; z: number } {
    const b = this.world.bounds?.();
    if (!b) return { x, z };
    return { x: Math.min(b.x1, Math.max(b.x0, x)), z: Math.min(b.z1, Math.max(b.z0, z)) };
  }

  private pickSpawn(player: { x: number; z: number }): { x: number; z: number; h: number; node: number } {
    const o = this.opt;
    const minD = Math.max(40, o.radius * 0.45);
    const g = this.graph;
    if (g && this.area.length >= 3) {
      const far = this.area.filter((i) => Math.hypot(g.xs[i]! - player.x, g.zs[i]! - player.z) >= minD);
      const pool = far.length ? far : [...this.area].sort((a, b) => Math.hypot(g.xs[b]! - player.x, g.zs[b]! - player.z) - Math.hypot(g.xs[a]! - player.x, g.zs[a]! - player.z)).slice(0, 4);
      const node = this.rng.pick(pool);
      const x = g.xs[node]!;
      const z = g.zs[node]!;
      return { x, z, h: headingTo(o.x - x, o.z - z), node };
    }
    const away = Math.atan2(o.z - player.z, o.x - player.x) + this.rng.range(-0.6, 0.6);
    const r = o.radius * 0.6;
    const x = o.x + Math.cos(away) * r;
    const z = o.z + Math.sin(away) * r;
    return { x, z, h: headingTo(o.x - x, o.z - z), node: -1 };
  }

  private horn(signal: HornSignal): void {
    const p = this.pikeur;
    let x: number;
    let z: number;
    if (p) {
      x = p.x;
      z = p.z;
    } else {
      // no rider in this beat: the horn sounds far behind the lead hound, unseen
      const l = this.leader;
      x = l.x + Math.sin(l.heading) * 70;
      z = l.z + Math.cos(l.heading) * 70;
    }
    this.pending.push({ type: 'horn', signal, x, z });
  }

  private setState(to: PackState): void {
    if (to === this.state) return;
    const from = this.state;
    this.state = to;
    this.stateTime = 0;
    this.pending.push({ type: 'state', from, to });
    for (const a of this.agents) {
      a.path = [];
      a.target = null;
      a.wait = 0;
      a.sniffing = false;
    }
    if (to === 'chasing') {
      this.horn('found');
      this.barkT = 0.2;
      for (const h of this.hounds) h.awareness = 1;
    } else if (to === 'searching') {
      this.horn('lost');
      this.searchLeft = this.tune.search;
      for (const a of this.agents) a.awareness = Math.min(a.awareness, 0.55);
    } else if (to === 'calm' && from === 'searching') {
      this.horn('call-off');
      for (const a of this.agents) a.awareness = Math.min(a.awareness, 0.12);
    } else if (to === 'suspicious') {
      const inv = this.investigator();
      if (inv) this.pending.push({ type: 'bay', idx: this.agents.indexOf(inv), kind: 'growl' });
    }
  }

  private investigator(): Agent | null {
    let best: Agent | null = null;
    for (const a of this.agents) if (a.kind === 'hound' && (!best || a.awareness > best.awareness)) best = a;
    return best;
  }

  /** Advance one fixed step. Returns the events of this step. */
  update(dt: number, p: PlayerSense): SimEvent[] {
    this.time += dt;
    this.stateTime += dt;
    if (this.caught) {
      this.caught.t += dt;
      // everyone closes in on the player
      for (const a of this.agents) {
        if (a.kind === 'hound') this.moveToward(a, p.x, p.z, this.tune.speed.chase * 0.6, dt, 1.0);
        else this.face(a, p.x - a.x, p.z - a.z, dt);
      }
      return this.flush();
    }
    this.perceive(dt, p);
    this.think(dt, p);
    if (!this.frozen) for (const a of this.agents) this.act(a, dt, p);
    this.checkCaught(dt, p);
    this.updateAlert(p);
    return this.flush();
  }

  private flush(): SimEvent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // perception

  private perceive(dt: number, p: PlayerSense): void {
    const w = this.world;
    const hollow = hollowness(w, p.x, p.z);
    const inWater = this.isWater(p.x, p.z);
    this.waterTime = inWater ? this.waterTime + dt : 0;
    const waterSafe = this.waterTime >= this.tune.water;
    const baseRange = sightRange(p, this.tune.sense, hollow);
    const hr = hearRange(p, this.tune.sense, hollow, inWater);
    const st = this.state;
    const alertMul = st === 'chasing' ? 1.35 : st === 'searching' ? 1.15 : 1;
    let any = false;
    for (const a of this.agents) {
      const pik = a.kind === 'pikeur';
      const eyeY = a.y + (pik ? 2.7 : 0.75);
      const fov = st === 'chasing' ? 230 : st === 'searching' ? 180 : pik ? 110 : 140;
      const s = look(w, { x: a.x, z: a.z, eyeY, heading: a.heading, fovDeg: fov, nearSense: pik ? 1.5 : 2.5 }, p, baseRange * alertMul * (pik ? 1.1 : 1));
      a.sees = waterSafe ? s.strength * 0.3 : s.strength;
      const hearR = hr * (pik ? 0.7 : 1);
      const heard = s.dist < hearR && !waterSafe;
      const loud = heard ? 1 - s.dist / hearR : 0;
      const g = this.tune.gain * (st === 'chasing' || st === 'searching' ? 2 : 1);
      let aw = a.awareness;
      if (a.sees > 0) aw += dt * (0.45 + 2.3 * a.sees) * g;
      if (heard) {
        const cap = loud > 0.6 ? 1 : 0.85;
        if (aw < cap) aw = Math.min(cap, aw + dt * (0.25 + 1.1 * loud) * g);
        // where the noise came from (with an error that grows with distance)
        const e = s.dist * 0.12;
        this.lastNoise = { x: p.x + this.rng.range(-e, e), z: p.z + this.rng.range(-e, e) };
      }
      if (a.sees <= 0 && !heard) aw -= dt * (st === 'calm' ? 0.05 : 0.03);
      if (waterSafe) aw = Math.min(aw, 0.6);
      a.awareness = Math.max(0, Math.min(1, aw));
      if (a.sees > 0 || heard) any = true;
      if (a.sees > 0 && (!this.lastKnown || st !== 'chasing')) this.lastNoise = { x: p.x, z: p.z };
    }
    // contact bookkeeping for the chase
    const out = Math.hypot(p.x - this.opt.x, p.z - this.opt.z) > this.opt.radius * 1.5;
    if (any && !waterSafe) {
      this.contactAge = 0;
      this.lastKnown = { x: p.x, z: p.z };
    } else {
      this.contactAge += dt;
      // scent: fresh trail (not through water, not out of the pack's ground)
      if (st === 'chasing' && !inWater && !out && this.contactAge < this.tune.scent) this.lastKnown = { x: p.x, z: p.z };
    }
    this.packAw = 0;
    for (const a of this.agents) this.packAw = Math.max(this.packAw, a.awareness);
  }

  // ---------------------------------------------------------------------------------------------
  // pack decisions

  private think(dt: number, p: PlayerSense): void {
    const full = this.agents.some((a) => a.awareness >= 1);
    switch (this.state) {
      case 'calm':
        if (full) this.setState('chasing');
        else if (this.packAw >= 0.22) this.setState('suspicious');
        this.howlT -= dt;
        if (this.howlT <= 0) {
          this.howlT = this.rng.range(16, 34);
          const hs = this.hounds;
          if (hs.length) this.pending.push({ type: 'bay', idx: this.agents.indexOf(this.rng.pick(hs)), kind: 'howl' });
        }
        break;
      case 'suspicious':
        if (full) this.setState('chasing');
        else if (this.packAw < 0.1 && this.stateTime > 3) this.setState('calm');
        break;
      case 'chasing':
        if (this.contactAge > this.tune.scent + this.tune.lose || (this.waterTime >= this.tune.water && this.contactAge > 0.5)) this.setState('searching');
        this.barkT -= dt;
        if (this.barkT <= 0) {
          this.barkT = this.rng.range(0.9, 2.6);
          const hs = this.hounds;
          if (hs.length) this.pending.push({ type: 'bay', idx: this.agents.indexOf(this.rng.pick(hs)), kind: this.rng.next() < 0.25 ? 'howl' : 'bark' });
        }
        break;
      case 'searching':
        this.searchLeft -= dt;
        if (full && this.stateTime > 1.5) this.setState('chasing');
        else if (this.searchLeft <= 0) this.setState('calm');
        break;
    }
    void p;
  }

  // ---------------------------------------------------------------------------------------------
  // agents

  private act(a: Agent, dt: number, p: PlayerSense): void {
    const T = this.tune;
    const pik = a.kind === 'pikeur';
    if (a.wait > 0) {
      a.wait -= dt;
      a.speed = Math.max(0, a.speed - dt * 8);
      if (a.wait <= 0) a.sniffing = false;
      return;
    }
    switch (this.state) {
      case 'calm':
        if (a === this.leader) this.patrol(a, dt, pik ? T.pikeurSpeed.patrol : T.speed.patrol);
        else this.follow(a, dt);
        break;
      case 'suspicious': {
        const inv = this.investigator();
        const spot = this.lastNoise ?? this.lastKnown;
        if (a === inv || (a.kind === 'hound' && a.awareness >= 0.3)) {
          if (spot) this.investigate(a, spot, dt, T.speed.trot, 4);
        } else if (a === this.leader) {
          // the pack halts and listens; the leader turns towards the noise
          if (spot) this.face(a, spot.x - a.x, spot.z - a.z, dt);
          a.speed = Math.max(0, a.speed - dt * 4);
        } else this.follow(a, dt, 0.5);
        break;
      }
      case 'searching': {
        const c = this.lastKnown ?? this.lastNoise ?? { x: a.x, z: a.z };
        const r = Math.min(35, 6 + this.stateTime * 1.1);
        this.investigate(a, c, dt, pik ? T.pikeurSpeed.search : T.speed.search, r);
        break;
      }
      case 'chasing': {
        const tgt = this.lastKnown ?? { x: p.x, z: p.z };
        if (pik) {
          if (Math.hypot(tgt.x - a.x, tgt.z - a.z) > 2) this.moveToward(a, tgt.x, tgt.z, T.pikeurSpeed.chase, dt, 3);
          else this.face(a, p.x - a.x, p.z - a.z, dt);
          break;
        }
        const dx = tgt.x - a.x;
        const dz = tgt.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.2 && this.contactAge > 0.3) {
          // at the end of the trail: sniff around it
          this.investigate(a, tgt, dt, T.speed.trot, 5);
          break;
        }
        // flank: converge from the sides, closing in as they get near
        const side = (a.idx % 2 === 0 ? -1 : 1) * Math.min(4, d * 0.2) * (a.idx === 0 ? 0 : 1);
        const tx = tgt.x + (-dz / Math.max(d, 1e-3)) * side;
        const tz = tgt.z + (dx / Math.max(d, 1e-3)) * side;
        this.moveToward(a, tx, tz, T.speed.chase, dt, 7);
        break;
      }
    }
  }

  /** Leader walks the path graph inside the area (random targets, A*), pausing now and then. */
  private patrol(a: Agent, dt: number, speed: number): void {
    const g = this.graph;
    if (!g || this.area.length < 3) {
      // no paths here: wander between random points of the area
      if (!a.target || Math.hypot(a.target.x - a.x, a.target.z - a.z) < 2) a.target = this.randomPoint(this.opt.x, this.opt.z, this.opt.radius * 0.8);
      if (this.moveToward(a, a.target.x, a.target.z, speed, dt, a.kind === 'pikeur' ? 2.5 : 5)) a.target = null;
      return;
    }
    if (a.pathI >= a.path.length) {
      const from = a.node >= 0 && this.inArea.has(a.node) ? a.node : g.nearest(a.x, a.z, undefined, this.area);
      let path: number[] | null = null;
      for (let tries = 0; tries < 6 && !path; tries++) {
        const to = this.rng.pick(this.area);
        if (g.dist(from, to) < 35) continue;
        path = g.findPath(from, to, (i) => this.inArea.has(i), 3000);
      }
      if (!path) {
        const nb = g.adj[from]!.filter((i) => this.inArea.has(i));
        path = nb.length ? [from, this.rng.pick(nb)] : [from];
      }
      a.path = path;
      a.pathI = 0;
      if (this.rng.next() < 0.5) {
        a.wait = this.rng.range(1.5, 3.5);
        a.sniffing = true;
      }
      return;
    }
    const n = a.path[a.pathI]!;
    if (this.moveToward(a, g.xs[n]!, g.zs[n]!, speed, dt, a.kind === 'pikeur' ? 2.5 : 5, 2.0)) {
      a.node = n;
      a.pathI++;
    }
  }

  /** Followers keep their place in the formation around the leader, with sniff stops. */
  private follow(a: Agent, dt: number, slow = 1): void {
    const l = this.leader;
    const fx = -Math.sin(l.heading);
    const fz = -Math.cos(l.heading);
    // right vector of heading h is (cos h, −sin h)
    const rx = Math.cos(l.heading);
    const rz = -Math.sin(l.heading);
    const wob = Math.sin(this.time * 0.37 + a.idx * 1.7) * 1.2;
    const tx = l.x + fx * a.off.f + rx * (a.off.r + wob);
    const tz = l.z + fz * a.off.f + rz * (a.off.r + wob);
    const d = Math.hypot(tx - a.x, tz - a.z);
    if (d < 0.8) {
      a.speed = Math.max(0, a.speed - dt * 4);
      if (this.rng.next() < dt * 0.05) {
        a.wait = this.rng.range(1, 2.5);
        a.sniffing = true;
      }
      return;
    }
    const sp = Math.min(this.tune.speed.follow, Math.max(this.tune.speed.patrol * 0.6, d * 0.7)) * slow;
    this.moveToward(a, tx, tz, sp, dt, 5, 0.6);
  }

  /** Go to points around `c` (radius r) and sniff at each. */
  private investigate(a: Agent, c: { x: number; z: number }, dt: number, speed: number, r: number): void {
    if (!a.target) {
      // the first visit goes straight to the spot, later ones around it
      a.target = a.stuck > 0 || a.sniffing ? this.randomPoint(c.x, c.z, r) : this.randomPoint(c.x, c.z, Math.min(r, 3));
      a.stuck = 0;
    }
    if (this.moveToward(a, a.target.x, a.target.z, speed, dt, a.kind === 'pikeur' ? 3 : 6, 1.2) || a.stuck > 1.5) {
      a.wait = this.rng.range(1.2, 2.8);
      a.sniffing = true;
      a.target = this.randomPoint(c.x, c.z, r);
    }
  }

  private randomPoint(cx: number, cz: number, r: number): { x: number; z: number } {
    for (let i = 0; i < 8; i++) {
      const ang = this.rng.range(0, TWO_PI);
      const rr = Math.sqrt(this.rng.next()) * r;
      const x = cx + Math.cos(ang) * rr;
      const z = cz + Math.sin(ang) * rr;
      if (!this.isWater(x, z)) return this.clampPos(x, z);
    }
    return { x: cx, z: cz };
  }

  private face(a: Agent, dx: number, dz: number, dt: number): void {
    if (Math.hypot(dx, dz) < 1e-3) return;
    const want = headingTo(dx, dz);
    const rate = a.kind === 'pikeur' ? 2.5 : 6;
    const diff = wrap(want - a.heading);
    a.heading = wrap(a.heading + Math.max(-rate * dt, Math.min(rate * dt, diff)));
  }

  /**
   * Steer towards (tx, tz): turn-rate limited, accelerate, avoid water (try deflections), stay out
   * of buildings. Returns true when within `arrive` metres.
   */
  moveToward(a: Agent, tx: number, tz: number, maxSpeed: number, dt: number, turnRate: number, arrive = 0.6): boolean {
    const dx = tx - a.x;
    const dz = tz - a.z;
    const d = Math.hypot(dx, dz);
    if (d < arrive) {
      a.speed = Math.max(0, a.speed - dt * 6);
      return true;
    }
    const want = headingTo(dx, dz);
    const diff = wrap(want - a.heading);
    a.heading = wrap(a.heading + Math.max(-turnRate * dt, Math.min(turnRate * dt, diff)));
    const accel = a.kind === 'pikeur' ? 4 : 9;
    // slow down for sharp turns and on arrival
    const target = maxSpeed * (Math.abs(diff) > 1.3 ? 0.35 : 1) * Math.min(1, 0.4 + d / 3);
    a.speed += Math.max(-accel * 1.5 * dt, Math.min(accel * dt, target - a.speed));
    const step = a.speed * dt;
    if (step <= 0) return false;
    const tries = [0, 0.55, -0.55, 1.1, -1.1, 1.7, -1.7];
    for (const off of tries) {
      const h = a.heading + off;
      let nx = a.x - Math.sin(h) * step;
      let nz = a.z - Math.cos(h) * step;
      if (this.isWater(nx, nz)) continue;
      if (this.world.collide) {
        const c = this.world.collide(nx, nz, a.kind === 'pikeur' ? 0.9 : 0.4);
        nx = c.x;
        nz = c.z;
      }
      const cp = this.clampPos(nx, nz);
      const moved = Math.hypot(cp.x - a.x, cp.z - a.z);
      a.x = cp.x;
      a.z = cp.z;
      a.y = this.world.heightAt(a.x, a.z);
      a.dist += moved;
      if (off !== 0) a.heading = wrap(a.heading + off * 0.25);
      a.stuck = Math.max(0, a.stuck - dt);
      return false;
    }
    // blocked by water on all sides: stand at the bank
    a.speed = 0;
    a.stuck += dt;
    return false;
  }

  // ---------------------------------------------------------------------------------------------

  private checkCaught(dt: number, p: PlayerSense): void {
    if (this.state !== 'chasing' || p.flying || this.isWater(p.x, p.z)) {
      for (const a of this.agents) a.closeSee = 0;
      return;
    }
    const T = this.tune;
    for (const a of this.agents) {
      const d = Math.hypot(p.x - a.x, p.z - a.z);
      if (Math.abs(p.y - a.y) > 3) continue;
      if (a.kind === 'pikeur') {
        if (d < T.pikeurReach && a.sees > 0) return this.catchBy(a);
        continue;
      }
      if (d < T.reach) return this.catchBy(a);
      if (d < 4 && a.sees > 0) {
        a.closeSee += dt;
        if (a.closeSee >= T.closeTime) return this.catchBy(a);
      } else a.closeSee = Math.max(0, a.closeSee - dt);
    }
  }

  private catchBy(a: Agent): void {
    this.caught = { by: this.agents.indexOf(a), t: 0 };
    this.alert = 1;
    this.pending.push({ type: 'caught', by: this.agents.indexOf(a) });
    for (const b of this.agents) {
      b.path = [];
      b.wait = 0;
    }
  }

  private updateAlert(p: PlayerSense): void {
    let minD = Infinity;
    for (const a of this.agents) minD = Math.min(minD, Math.hypot(p.x - a.x, p.z - a.z));
    switch (this.state) {
      case 'calm':
        this.alert = 0.4 * this.packAw;
        break;
      case 'suspicious':
        this.alert = 0.3 + 0.3 * this.packAw;
        break;
      case 'searching':
        this.alert = 0.5 + 0.15 * Math.max(0, this.searchLeft / this.tune.search);
        break;
      case 'chasing':
        this.alert = 0.8 + 0.2 * Math.max(0, 1 - minD / 30);
        break;
    }
  }

  /** Settings changed mid-hunt (gentle mode / Rauhnacht / intensity). */
  retune(o: Partial<Pick<PackOptions, 'gentle' | 'rauhnacht' | 'intensity'>>): void {
    this.opt = { ...this.opt, ...o };
    this.tune = makeTuning(this.opt);
  }

  /** Debug/test: place an agent. */
  place(i: number, x: number, z: number, headingRad?: number): void {
    const a = this.agents[i];
    if (!a) return;
    a.x = x;
    a.z = z;
    a.y = this.world.heightAt(x, z);
    if (headingRad !== undefined) a.heading = headingRad;
    a.path = [];
    a.pathI = 0;
    a.target = null;
  }

  /** Debug/test: force a state (emits the matching horn). */
  force(to: PackState, at?: { x: number; z: number }): void {
    if (at) {
      this.lastKnown = { ...at };
      this.lastNoise = { ...at };
    }
    if (to === 'suspicious') {
      const inv = this.investigator();
      if (inv) inv.awareness = Math.max(inv.awareness, 0.4);
    }
    this.setState(to);
    if (to === 'chasing') this.contactAge = 0;
  }

  /** Serializable snapshot (debug hooks, tests). */
  snapshot() {
    return {
      state: this.state,
      alert: this.alert,
      time: this.time,
      lastKnown: this.lastKnown,
      contactAge: this.contactAge,
      searchLeft: this.searchLeft,
      caught: this.caught,
      rng: this.rng.state,
      agents: this.agents.map((a) => ({
        kind: a.kind,
        name: a.name,
        x: a.x,
        z: a.z,
        heading: a.heading,
        speed: a.speed,
        awareness: a.awareness,
        sees: a.sees,
      })),
    };
  }
}
