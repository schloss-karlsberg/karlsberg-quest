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
 *
 * In snow (a TrackField is passed) the pack also TRACKS: while searching it follows your boot
 * prints print by print until the trail breaks (water, stone, road, rock) — see tracks.ts.
 * Hounds and the Pikeur leave paw / hoof prints themselves.
 *
 * Modes (PackOptions.mode, see modes.ts): 'patrol' (default, above), 'drive' (Ch. 4: the pack
 * herds you towards a target), 'finale' (W8: the pack gathers around you and lies down once you
 * lie flat with the lantern lit), 'parforce' (Ch. 2 "Die Flucht": the long paced chase).
 */
import type { PathGraph } from './graph';
import { type PlayerSense, type SenseTuning, type SenseWorld, hearRange, hollowness, look, sightRange } from './perception';
import { Rng } from './rng';
import type { TrackField, TrailBreak } from './tracks';

export type PackState = 'calm' | 'suspicious' | 'searching' | 'chasing';
export type HornSignal = 'search' | 'found' | 'lost' | 'call-off';
export type PackMode = 'patrol' | 'drive' | 'finale' | 'parforce';
export type FinaleOutcome = 'gathered' | 'returned' | 'calmed' | 'faded';

export interface SimWorld extends SenseWorld {
  /** Push a circle out of buildings. */
  collide?(x: number, z: number, r: number): { x: number; z: number };
  bounds?(): { x0: number; z0: number; x1: number; z1: number };
  /** Snow: where no print can be laid (and a trail ends). Default: water only. */
  trailBreakAt?(x: number, z: number): TrailBreak;
}

export interface XZ {
  x: number;
  z: number;
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
  /** Behaviour of the pack (default 'patrol'). */
  mode?: PackMode;
  /** drive: where the pack herds you; parforce: the escape goal (water, dam); finale: circle centre. */
  target?: XZ | null;
  /** drive: waypoints on the way to `target` (e.g. Hohlweg → Allee → Zwinger). */
  via?: XZ[];
  /** parforce: where the pack comes from (default: away from the target, behind you). */
  from?: XZ | null;
  /** parforce: seconds of head start before the hounds are let go (bible: 6). */
  headStart?: number;
  /** drive / parforce: radius (m) around the target that counts as arrived. */
  goalRadius?: number;
  /** finale: lying flat alone is enough (one-key option / gentle mode; the lantern lights itself). */
  oneKey?: boolean;
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
  /** Seconds pressed against a wall while chasing (→ follow the scent line instead). */
  wallT: number;
  /** Index into PackSim.scent while following the player's path around walls (−1 = off). */
  scentI: number;
  /** 0 standing … 1 lying down (finale). */
  lie: number;
  /** 0 eyes lit … 1 eyes out (finale). */
  dim: number;
  /** 0 present … 1 faded away (finale). */
  gone: number;
  /** Metres since the last print (snow). */
  printAcc: number;
  printSide: number;
}

export type SimEvent =
  | { type: 'state'; from: PackState; to: PackState }
  | { type: 'horn'; signal: HornSignal; x: number; z: number }
  | { type: 'bay'; idx: number; kind: 'howl' | 'bark' | 'growl' }
  | { type: 'caught'; by: number; soft?: boolean }
  /** Snow: the pack picked up / lost your trail. */
  | { type: 'tracking'; on: boolean; x: number; z: number; why?: Exclude<TrailBreak, null> }
  /** drive / parforce: you reached the target (parforce: the hunt ends at the water). */
  | { type: 'goal'; x: number; z: number }
  /** finale progress. 'returned': bring the player back into the circle (x/z = centre). */
  | { type: 'finale'; outcome: FinaleOutcome; x: number; z: number }
  /** A hound lies down (finale; a sigh). */
  | { type: 'lie'; idx: number }
  /** parforce pacing: a breather starts / ends. */
  | { type: 'rest'; on: boolean };

export interface Tuning {
  speed: { patrol: number; follow: number; trot: number; search: number; chase: number; track: number };
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
  /** Snow: max age (s) of a boot print a passing hound still picks up. */
  pickupAge: number;
}

export function makeTuning(o: PackOptions): Tuning {
  const k = (0.9 + 0.2 * o.intensity) * (o.gentle ? 0.7 : 1) * (o.rauhnacht ? 1.12 : 1);
  const acuity = (0.85 + 0.3 * o.intensity) * (o.gentle ? 0.7 : 1) * (o.rauhnacht ? 1.25 : 1);
  return {
    speed: { patrol: 1.45 * k, follow: 2.6 * k, trot: 2.8 * k, search: 3.3 * k, chase: 6.0 * k, track: 3.9 * k },
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
    pickupAge: o.gentle ? 40 : o.rauhnacht ? 150 : 90,
  };
}

const TWO_PI = Math.PI * 2;
export const wrap = (a: number) => {
  a = (a + Math.PI) % TWO_PI;
  return (a < 0 ? a + TWO_PI : a) - Math.PI;
};
/** Heading (player-yaw convention) that looks from (0,0) along (dx, dz). */
export const headingTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);

/**
 * Behaviour that replaces or bends the default state machine (modes.ts). Every hook is optional;
 * returning true means "handled, skip the default".
 */
export interface ModeController {
  readonly mode: PackMode;
  /** Before perception: the whole step (perceive/think/act/catch/alert). */
  step?(dt: number, p: PlayerSense): boolean;
  think?(dt: number, p: PlayerSense): boolean;
  act?(a: Agent, dt: number, p: PlayerSense): boolean;
  /** Searching ran out: true = the mode takes over (no call-off). */
  searchEnded?(p: PlayerSense): boolean;
  /** Speed multiplier for an agent while chasing (rubber band). */
  chaseSpeed?(a: Agent, p: PlayerSense): number;
  /** Multiplier on how fast awareness grows (pacing breathers). */
  awareness?(): number;
  alert?(p: PlayerSense): boolean;
  /** The pack got the player: false = ignore (e.g. after the goal). */
  mayCatch?(): boolean;
}

/** Builds the controller for `sim.opt.mode`; `fresh` = a new pack (false: switching in place). */
export type MakeController = (sim: PackSim, fresh: boolean) => ModeController | null;

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
  caught: { by: number; t: number; soft?: boolean } | null = null;
  time = 0;
  /** Debug: AI frozen in place (agents still perceive, nothing moves). */
  frozen = false;
  /** Snow: following the player's trail (segment + last reached print number). */
  trail: { seg: number; seq: number; x: number; z: number } | null = null;
  /** Trail segments the pack has lost for good (they ended at a break). */
  readonly deadSegs = new Set<number>();
  /** Mode behaviour (null = patrol). */
  ctl: ModeController | null = null;
  readonly rng: Rng;
  private readonly area: number[];
  private readonly inArea: Set<number>;
  private pending: SimEvent[] = [];
  private howlT: number;
  barkT = 0;
  private packAw = 0;
  private pickupT = 0;
  /** Where the player stood when the pack was configured. */
  readonly origin: XZ;

  constructor(
    readonly world: SimWorld,
    readonly graph: PathGraph | null,
    public opt: PackOptions,
    player: { x: number; z: number },
    /** Snow prints (null = no snow: scent only). */
    readonly tracks: TrackField | null = null,
    makeCtl?: MakeController,
  ) {
    this.rng = new Rng(opt.seed);
    this.tune = makeTuning(opt);
    this.origin = { x: player.x, z: player.z };
    this.howlT = this.rng.range(6, 14);
    this.area = graph ? graph.within(opt.x, opt.z, opt.radius).filter((i) => !this.isWater(graph.xs[i]!, graph.zs[i]!)) : [];
    this.inArea = new Set(this.area);
    const spawn = opt.from ? this.spawnAt(opt.from, player) : this.pickSpawn(player);
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
    this.ctl = makeCtl ? makeCtl(this, true) : null;
    // Anblasen (one long tone); the par force start is two short (bible ch. 2 §9 B) — the
    // controller sounds its own horn then
    if (!this.ctl || this.ctl.mode === 'patrol') this.horn('search');
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
      wallT: 0,
      scentI: -1,
      lie: 0,
      dim: 0,
      gone: 0,
      printAcc: 0,
      printSide: 1,
    };
  }

  get mode(): PackMode {
    return this.ctl?.mode ?? 'patrol';
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

  /** Snow: is the pack following the player's prints right now? */
  get tracking(): boolean {
    return this.trail !== null;
  }

  isWater(x: number, z: number): boolean {
    return this.world.surfaceAt(x, z) === 'water';
  }

  clampPos(x: number, z: number): { x: number; z: number } {
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

  /** A given spawn point (par force: the kennel / the avenue), facing the player. */
  private spawnAt(at: XZ, player: XZ): { x: number; z: number; h: number; node: number } {
    const p = this.clampPos(at.x, at.z);
    const node = this.graph && this.area.length ? this.graph.nearest(p.x, p.z, undefined, this.area) : -1;
    return { x: p.x, z: p.z, h: headingTo(player.x - p.x, player.z - p.z), node };
  }

  /** Queue an event for this step (mode controllers use it too). */
  emit(e: SimEvent): void {
    this.pending.push(e);
  }

  horn(signal: HornSignal, from?: XZ): void {
    const p = this.pikeur;
    let x: number;
    let z: number;
    if (from) {
      x = from.x;
      z = from.z;
    } else if (p) {
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

  /** Change the pack state (horn, awareness, cleared targets). `quiet` skips the horn. */
  setState(to: PackState, quiet = false): void {
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
      a.scentI = -1;
      a.wallT = 0;
    }
    if (to !== 'searching' && this.trail) this.endTrail(false);
    if (to === 'chasing') {
      if (!quiet) this.horn('found');
      this.barkT = 0.2;
      for (const h of this.hounds) h.awareness = 1;
    } else if (to === 'searching') {
      if (!quiet) this.horn('lost');
      this.searchLeft = this.tune.search;
      for (const a of this.agents) a.awareness = Math.min(a.awareness, 0.55);
    } else if (to === 'calm' && from === 'searching') {
      if (!quiet) this.horn('call-off');
      for (const a of this.agents) a.awareness = Math.min(a.awareness, 0.12);
    } else if (to === 'suspicious') {
      const inv = this.investigator();
      if (inv) this.pending.push({ type: 'bay', idx: this.agents.indexOf(inv), kind: 'growl' });
    }
  }

  investigator(): Agent | null {
    let best: Agent | null = null;
    for (const a of this.agents) if (a.kind === 'hound' && (!best || a.awareness > best.awareness)) best = a;
    return best;
  }

  /** Advance one fixed step. Returns the events of this step. */
  update(dt: number, p: PlayerSense): SimEvent[] {
    this.time += dt;
    this.stateTime += dt;
    this.tracks?.tick(dt);
    this.layScent(p);
    const before = this.agents.map((a) => a.dist);
    if (this.caught) {
      this.caught.t += dt;
      // everyone closes in on the player
      for (const a of this.agents) {
        if (a.kind === 'hound') this.moveToward(a, p.x, p.z, this.tune.speed.chase * 0.6, dt, 1.0);
        else this.face(a, p.x - a.x, p.z - a.z, dt);
      }
    } else if (!this.ctl?.step?.(dt, p)) {
      this.perceive(dt, p);
      if (!this.ctl?.think?.(dt, p)) this.think(dt, p);
      if (!this.frozen) for (const a of this.agents) if (!this.ctl?.act?.(a, dt, p)) this.act(a, dt, p);
      this.checkCaught(dt, p);
      if (!this.ctl?.alert?.(p)) this.updateAlert(p);
    }
    this.layPrints(before);
    return this.flush();
  }

  private flush(): SimEvent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // snow: prints and tracking

  private canPrint(x: number, z: number): boolean {
    if (this.isWater(x, z)) return false;
    return !this.world.trailBreakAt?.(x, z);
  }

  /** Paw prints of the hounds, hoof prints of the horse (one per stride, alternating sides). */
  private layPrints(before: number[]): void {
    const T = this.tracks;
    if (!T) return;
    this.agents.forEach((a, i) => {
      const moved = a.dist - before[i]!;
      if (moved <= 0 || a.gone > 0.5) return;
      a.printAcc += moved;
      const pik = a.kind === 'pikeur';
      const stride = pik ? (a.speed > 3 ? 1.5 : 0.9) : a.speed > 4 ? 1.1 : 0.55;
      if (a.printAcc < stride) return;
      a.printAcc = 0;
      a.printSide = -a.printSide;
      const rx = Math.cos(a.heading);
      const rz = -Math.sin(a.heading);
      const off = (pik ? 0.22 : 0.07) * a.printSide;
      const x = a.x + rx * off;
      const z = a.z + rz * off;
      if (!this.canPrint(x, z)) return;
      T.addPack(pik ? 'hoof' : 'paw', i, x, z, a.heading, T.now, a.printSide, Math.min(1, 0.4 + a.speed / 8));
    });
  }

  /** Start following the player's prints from `print` (horn: two short — "Fährte aufgenommen"). */
  private beginTrail(seg: number, seq: number, x: number, z: number): void {
    this.trail = { seg, seq: seq - 1, x, z };
    this.searchLeft = this.tune.search;
    this.lastKnown = { x, z };
    this.pending.push({ type: 'tracking', on: true, x, z });
    this.horn('found');
    for (const a of this.agents) {
      a.target = null;
      a.wait = 0;
      a.sniffing = false;
    }
  }

  private endTrail(broken: boolean): void {
    const tr = this.trail;
    if (!tr) return;
    this.trail = null;
    if (broken) this.deadSegs.add(tr.seg);
    const why = this.tracks?.lastBreak?.why;
    this.pending.push({ type: 'tracking', on: false, x: tr.x, z: tr.z, ...(broken && why ? { why } : {}) });
    if (broken) {
      // casting around where the trail ended (searching again, falling horn)
      this.lastKnown = { x: tr.x, z: tr.z };
      this.searchLeft = this.tune.search;
      this.stateTime = 0;
      this.horn('lost');
    }
  }

  /** A passing hound (or the pack where it lost you) finds your prints in the snow. */
  private scanForTrail(dt: number): void {
    const T = this.tracks;
    if (!T || this.trail || this.state === 'chasing') return;
    this.pickupT -= dt;
    if (this.pickupT > 0) return;
    this.pickupT = 0.25;
    const now = T.now;
    const live = (seg: number) => !this.deadSegs.has(seg);
    if (this.state === 'searching') {
      const c = this.lastKnown ?? this.lastNoise;
      if (!c) return;
      const pr = this.freshPrintNear(c.x, c.z, 7, now, T.life, live);
      if (pr) this.beginTrail(pr.seg, pr.seq, pr.x, pr.z);
      return;
    }
    for (const a of this.hounds) {
      const pr = this.freshPrintNear(a.x, a.z, 1.4, now, this.tune.pickupAge, live);
      if (!pr) continue;
      // the hound puts its nose down: the pack switches to the trail
      this.setState('searching', true);
      this.pending.push({ type: 'bay', idx: this.agents.indexOf(a), kind: 'howl' });
      this.beginTrail(pr.seg, pr.seq, pr.x, pr.z);
      return;
    }
  }

  private freshPrintNear(x: number, z: number, r: number, now: number, maxAge: number, ok: (seg: number) => boolean) {
    const T = this.tracks!;
    let best: { seg: number; seq: number; x: number; z: number } | null = null;
    for (let i = T.prints.length - 1; i >= 0; i--) {
      const p = T.prints[i]!;
      if (now - p.t > maxAge) break;
      if (p.kind !== 'boot' || !ok(p.seg) || (p.x - x) ** 2 + (p.z - z) ** 2 > r * r) continue;
      if (!best || p.seq > best.seq) best = p;
    }
    return best;
  }

  /** Lead hound follows the trail, the rest run in file behind it, the Pikeur rides after. */
  private actTracking(a: Agent, dt: number): void {
    const T = this.tracks!;
    const tr = this.trail!;
    const hs = this.hounds;
    const lead = hs[0] ?? this.leader;
    if (a === lead) {
      const nx = T.next(tr.seg, tr.seq, a.x, a.z);
      if (!nx) {
        if (T.segmentEnded(tr.seg)) {
          // the trail ends here (water, stone, road, rock): lost for good
          const end = T.segmentEnd(tr.seg);
          if (end) {
            tr.x = end.x;
            tr.z = end.z;
          }
          if (Math.hypot(tr.x - a.x, tr.z - a.z) < 1.5 || !end) this.endTrail(true);
          else this.moveToward(a, tr.x, tr.z, this.tune.speed.track, dt, 6, 1.0);
        } else {
          // at the freshest print: the walker can't be far — nose down, listen
          this.lastKnown = { x: tr.x, z: tr.z };
          this.investigate(a, { x: tr.x, z: tr.z }, dt, this.tune.speed.trot, 4);
        }
        return;
      }
      a.sniffing = false;
      // everything before the next print is behind the lead hound now
      tr.seq = Math.max(tr.seq, nx.seq - 1);
      tr.x = a.x;
      tr.z = a.z;
      if (this.moveToward(a, nx.x, nx.z, this.tune.speed.track, dt, 6, 0.9)) {
        tr.seq = nx.seq;
        tr.x = nx.x;
        tr.z = nx.z;
        this.lastKnown = { x: nx.x, z: nx.z };
      }
      this.searchLeft = this.tune.search; // following a fresh trail: no giving up
      return;
    }
    if (a.kind === 'pikeur') {
      const d = Math.hypot(lead.x - a.x, lead.z - a.z);
      if (d > 9) this.moveToward(a, lead.x, lead.z, this.tune.pikeurSpeed.search, dt, 2.5, 6);
      else a.speed = Math.max(0, a.speed - dt * 3);
      return;
    }
    // in file behind the lead hound
    const k = hs.indexOf(a);
    const back = 1.6 * k;
    const tx = lead.x + Math.sin(lead.heading) * back + Math.cos(lead.heading) * (k % 2 ? 0.5 : -0.5);
    const tz = lead.z + Math.cos(lead.heading) * back - Math.sin(lead.heading) * (k % 2 ? 0.5 : -0.5);
    this.moveToward(a, tx, tz, this.tune.speed.track * 1.08, dt, 6, 0.5);
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
    const damp = this.ctl?.awareness?.() ?? 1;
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
      const g = this.tune.gain * (st === 'chasing' || st === 'searching' ? 2 : 1) * damp;
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
        if (!this.trail) this.searchLeft -= dt;
        if (full && this.stateTime > 1.5) this.setState('chasing');
        else if (this.searchLeft <= 0 && !this.ctl?.searchEnded?.(p)) this.setState('calm');
        break;
    }
    this.scanForTrail(dt);
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
    if (this.trail && this.state === 'searching') {
      this.actTracking(a, dt);
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
        const mul = this.ctl?.chaseSpeed?.(a, p) ?? 1;
        if (pik) {
          if (this.followScent(a, p, T.pikeurSpeed.chase * mul, dt)) break;
          if (Math.hypot(tgt.x - a.x, tgt.z - a.z) > 2) this.moveToward(a, tgt.x, tgt.z, T.pikeurSpeed.chase * mul, dt, 3);
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
        if (this.followScent(a, p, T.speed.chase * mul, dt)) break;
        // flank: converge from the sides, closing in as they get near
        const side = (a.idx % 2 === 0 ? -1 : 1) * Math.min(4, d * 0.2) * (a.idx === 0 ? 0 : 1);
        const tx = tgt.x + (-dz / Math.max(d, 1e-3)) * side;
        const tz = tgt.z + (dx / Math.max(d, 1e-3)) * side;
        this.moveToward(a, tx, tz, T.speed.chase * mul, dt, 7);
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
  investigate(a: Agent, c: { x: number; z: number }, dt: number, speed: number, r: number): void {
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

  randomPoint(cx: number, cz: number, r: number): { x: number; z: number } {
    for (let i = 0; i < 8; i++) {
      const ang = this.rng.range(0, TWO_PI);
      const rr = Math.sqrt(this.rng.next()) * r;
      const x = cx + Math.cos(ang) * rr;
      const z = cz + Math.sin(ang) * rr;
      if (!this.isWater(x, z)) return this.clampPos(x, z);
    }
    return { x: cx, z: cz };
  }

  face(a: Agent, dx: number, dz: number, dt: number): void {
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
  /**
   * The scent line: where the player went (a point every 2 m, the last ~600 m). Hunting by
   * straight lines gets a hound stuck behind the first wing between it and the player; a hound
   * pressed against a wall for a moment follows the line instead (round the corner, through the
   * passage the player took) until it is close again or at the line's end.
   */
  readonly scent: { x: number; z: number }[] = [];
  private layScent(p: PlayerSense): void {
    if (p.flying) return;
    const l = this.scent[this.scent.length - 1];
    if (l && Math.hypot(p.x - l.x, p.z - l.z) < 2) return;
    if (l && Math.hypot(p.x - l.x, p.z - l.z) > 40) {
      // a jump (teleport, shift): the old line leads nowhere
      this.scent.length = 0;
      for (const a of this.agents) a.scentI = -1;
    }
    this.scent.push({ x: p.x, z: p.z });
    if (this.scent.length > 300) {
      this.scent.splice(0, 50);
      for (const a of this.agents) if (a.scentI >= 0) a.scentI = Math.max(0, a.scentI - 50);
    }
  }

  /** Chasing around walls along the scent line; false = run straight at the player. */
  private followScent(a: Agent, p: PlayerSense, speed: number, dt: number): boolean {
    const line = this.scent;
    const dP = Math.hypot(p.x - a.x, p.z - a.z);
    if (a.scentI < 0) {
      if (a.wallT < 0.6 || dP < 6 || line.length < 2) return false;
      // pick up the line at its point nearest to the hound
      let best = -1;
      let bd = Infinity;
      for (let i = 0; i < line.length; i++) {
        const d = Math.hypot(line[i]!.x - a.x, line[i]!.z - a.z);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      a.scentI = best;
      a.wallT = 0;
    }
    // close again, or at the end of the line: straight at the quarry
    if (dP < 7 || a.scentI >= line.length - 2) {
      a.scentI = -1;
      a.wallT = 0;
      return false;
    }
    let c = line[a.scentI]!;
    while (a.scentI < line.length - 2 && Math.hypot(c.x - a.x, c.z - a.z) < 2.2) c = line[++a.scentI]!;
    this.moveToward(a, c.x, c.z, speed, dt, 8, 0.3);
    return true;
  }

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
        // pushed back by a wall: count the seconds (chasing hounds then take the scent line)
        if (Math.abs(c.x - nx) + Math.abs(c.z - nz) > 1e-3) a.wallT += dt;
        else a.wallT = Math.max(0, a.wallT - dt * 0.5);
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

  /** Slow down to a stand (mode controllers). */
  halt(a: Agent, dt: number, rate = 5): void {
    a.speed = Math.max(0, a.speed - dt * rate);
  }

  // ---------------------------------------------------------------------------------------------

  private checkCaught(dt: number, p: PlayerSense): void {
    if (this.state !== 'chasing' || this.frozen || p.flying || this.isWater(p.x, p.z) || this.ctl?.mayCatch?.() === false) {
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

  /** The pack has the player. `soft`: brought home, not stalled (drive mode, bible ch. 4 §9). */
  catchBy(a: Agent, soft = false): void {
    const by = this.agents.indexOf(a);
    this.caught = soft ? { by, t: 0, soft } : { by, t: 0 };
    this.alert = 1;
    this.pending.push(soft ? { type: 'caught', by, soft } : { type: 'caught', by });
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
        this.alert = this.trail ? 0.7 : 0.5 + 0.15 * Math.max(0, this.searchLeft / this.tune.search);
        break;
      case 'chasing':
        this.alert = 0.8 + 0.2 * Math.max(0, 1 - minD / 30);
        break;
    }
  }

  /**
   * Change the mode in place (drive → finale at the kennel): the pack stays where it is and
   * walks into its new places instead of re-appearing.
   */
  switchMode(o: Partial<PackOptions>, makeCtl: MakeController): void {
    this.opt = { ...this.opt, ...o };
    this.tune = makeTuning(this.opt);
    if (this.trail) this.endTrail(false);
    this.ctl = makeCtl(this, false);
    for (const a of this.agents) {
      a.target = null;
      a.path = [];
      a.wait = 0;
      a.sniffing = false;
    }
  }

  /** Settings changed mid-hunt (gentle mode / Rauhnacht / intensity). */
  retune(o: Partial<Pick<PackOptions, 'gentle' | 'rauhnacht' | 'intensity' | 'oneKey'>>): void {
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
      mode: this.mode,
      tracking: this.tracking,
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
        lie: a.lie,
        dim: a.dim,
        gone: a.gone,
      })),
    };
  }
}
