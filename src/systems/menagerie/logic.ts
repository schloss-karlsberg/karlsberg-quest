/**
 * The escaped animals of the Karlsberg menagerie: pure, deterministic behaviour (no three.js).
 *
 * Bible / codex cx.12: the duke kept cassowaries, two dromedaries and big cats; after the fire of
 * July 1793 some ran loose in the park. No combat: animals are obstacles and unease, never a
 * "game over".
 *
 *  - cassowary: notices you, booms, stamps (display), CHARGES in a straight line with a slow
 *    turn rate (side-step it), overshoots, turns, charges again (≤ 2–3 times), then gets BORED
 *    and walks back to its spot. A hit knocks you down (you lose a few seconds) — never caught.
 *  - dromedary: a group standing across a path / bridge. You cannot push through (collision);
 *    shoving makes them grumble. Waiting calmly near them a while → they amble aside ('yield').
 *  - jaguar (1793-07): a silhouette at the edge of the lantern light. With the lantern lit it
 *    circles OUTSIDE the light radius and never comes in; unlit it creeps closer and finally
 *    shoves you over (knockdown, then it retreats). Lighting the lantern drives it back.
 *
 * Coordinates: local frame; heading in the player-yaw convention (forward = (−sin h, −cos h)).
 */

export type AnimalKind = 'cassowary' | 'dromedary' | 'jaguar';

export type AnimalState =
  // cassowary
  | 'idle'
  | 'notice'
  | 'display'
  | 'charge'
  | 'turn'
  | 'bored'
  // dromedary
  | 'block'
  | 'grumble'
  | 'yield'
  // jaguar
  | 'lurk'
  | 'stalk'
  | 'creep'
  | 'pounce'
  | 'retreat';

export interface AnimalSpec {
  kind: AnimalKind;
  x: number;
  z: number;
  /** Address for clear / story. */
  id: string;
  heading?: number;
  /** Seed for variation. */
  seed?: number;
}

export interface Animal {
  readonly id: string;
  readonly kind: AnimalKind;
  /** Index inside a group (dromedaries side by side). */
  readonly idx: number;
  x: number;
  z: number;
  h: number;
  home: { x: number; z: number; h: number };
  state: AnimalState;
  /** Seconds in the current state. */
  t: number;
  /** Current ground speed m/s (animation). */
  speed: number;
  /** Charges done in this encounter (cassowary). */
  charges: number;
  /** Seconds left in which the animal ignores the player (after an encounter). */
  cool: number;
  /** Charge: start point (overshoot distance). */
  from: { x: number; z: number };
  /** Wander / circle goal. */
  goal: { x: number; z: number } | null;
  /** Wander pause timer. */
  wait: number;
  /** Jaguar: angle on the ring around the player; dromedary: shove pressure. */
  aux: number;
  /** Gait phase for the visuals (advances with distance). */
  phase: number;
  /** 0..1 display / puff (cassowary), chew (dromedary), crouch (jaguar). */
  pose: number;
  /** Body radius for collisions. */
  readonly radius: number;
  rng: () => number;
}

export interface MenageriePlayer {
  x: number;
  z: number;
  /** Ground speed m/s. */
  speed: number;
  stance: 'stand' | 'crouch' | 'prone';
  lanternLit: boolean;
  /** Radius of the lantern light (m). */
  lightRadius: number;
  /** Knocked down / frozen in a cut-scene: animals leave the player alone. */
  down: boolean;
  flying?: boolean;
}

export interface MenagerieWorld {
  /** Can an animal stand here? (water, buildings: no). Default: everywhere. */
  walkable?(x: number, z: number): boolean;
}

export type MenagerieEvent =
  | { type: 'notice'; id: string; kind: AnimalKind; x: number; z: number }
  | { type: 'boom'; id: string; x: number; z: number }
  | { type: 'charge'; id: string; x: number; z: number; n: number }
  | { type: 'miss'; id: string; x: number; z: number }
  | { type: 'knockdown'; id: string; kind: AnimalKind; x: number; z: number; seconds: number; dx: number; dz: number }
  | { type: 'bored'; id: string; x: number; z: number }
  | { type: 'grumble'; id: string; x: number; z: number }
  | { type: 'yield'; id: string; x: number; z: number }
  | { type: 'seen'; id: string; kind: AnimalKind; x: number; z: number }
  | { type: 'growl'; id: string; x: number; z: number }
  | { type: 'hiss'; id: string; x: number; z: number }
  | { type: 'step'; id: string; x: number; z: number; heavy: boolean };

export interface MenagerieOptions {
  gentle?: boolean;
}

/** Tuning (m, s, m/s, rad/s). */
export const CASSOWARY = {
  noticeRange: 22,
  /** Bored animals ignore the player for this long. */
  cooldown: 26,
  noticeT: 1.1,
  displayT: 1.5,
  chargeSpeed: 8.6,
  gentleChargeSpeed: 6.8,
  /** Max turn rate while charging (a sprinting side-step beats it). */
  chargeTurn: 1.25,
  /** Ahead of the player's position the charge commits to (overshoot). */
  overshoot: 9,
  maxChargeT: 4.2,
  turnT: 1.3,
  maxCharges: 3,
  hitRange: 1.15,
  knockdown: 3.2,
  gentleKnockdown: 1.8,
  wanderRadius: 7,
  walk: 1.1,
};

export const DROMEDARY = {
  /** Pushing into them this long → grumble. */
  shoveT: 1.2,
  /** Waiting calmly within this range … */
  patientRange: 7,
  /** … this long → they amble aside. */
  patientT: 14,
  yieldDist: 11,
  walk: 0.9,
  spacing: 2.6,
};

export const JAGUAR = {
  /** Beyond this from home the jaguar stays at its spot (prowls). */
  range: 55,
  /** Extra distance outside the light radius it keeps while the lantern burns. */
  margin: 3.5,
  /** Lantern off: how close it creeps (then the pounce). */
  creepTo: 2.4,
  gentleCreepTo: 5,
  stalkSpeed: 1.6,
  creepSpeed: 0.9,
  runSpeed: 7.5,
  circleSpeed: 0.09,
  knockdown: 2.4,
  retreatDist: 26,
  /** After a pounce or being driven off: stays away this long. */
  cooldown: 14,
};

function mulberry(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Heading (player-yaw convention) of the direction dx/dz. */
export function headingOf(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

const RADIUS: Record<AnimalKind, number> = { cassowary: 0.55, dromedary: 1.25, jaguar: 0.6 };

/** Create one animal (or a group of `count` dromedaries side by side, across the heading). */
export function createAnimals(spec: AnimalSpec, count = 1): Animal[] {
  const out: Animal[] = [];
  const h = spec.heading ?? 0;
  const n = spec.kind === 'dromedary' ? Math.max(1, Math.min(4, count)) : 1;
  // across the path: perpendicular to the heading
  const rx = Math.cos(h);
  const rz = -Math.sin(h);
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * DROMEDARY.spacing;
    const rng = mulberry((spec.seed ?? hashStr(spec.id)) + i * 977);
    const x = spec.x + rx * off;
    const z = spec.z + rz * off;
    // dromedaries stand across the path (turned 90°), staggered a little
    const ah = spec.kind === 'dromedary' ? h + Math.PI / 2 + (i % 2 ? Math.PI : 0) + (rng() - 0.5) * 0.4 : h;
    out.push({
      id: n > 1 ? `${spec.id}#${i}` : spec.id,
      kind: spec.kind,
      idx: i,
      x,
      z,
      h: ah,
      home: { x, z, h: ah },
      state: spec.kind === 'cassowary' ? 'idle' : spec.kind === 'dromedary' ? 'block' : 'lurk',
      t: 0,
      speed: 0,
      charges: 0,
      cool: 0,
      from: { x, z },
      goal: null,
      wait: rng() * 3,
      aux: rng() * Math.PI * 2,
      phase: rng() * 10,
      pose: 0,
      radius: RADIUS[spec.kind],
      rng,
    });
  }
  return out;
}

/** The group id of an animal ("drom#1" → "drom"). */
export function groupId(id: string): string {
  const k = id.indexOf('#');
  return k < 0 ? id : id.slice(0, k);
}

/**
 * Steps all animals. Returns events (sounds, captions, knockdowns). Deterministic for a given
 * sequence of inputs.
 */
export class Menagerie {
  animals: Animal[] = [];
  gentle: boolean;

  constructor(
    readonly world: MenagerieWorld = {},
    o: MenagerieOptions = {},
  ) {
    this.gentle = o.gentle === true;
  }

  add(spec: AnimalSpec, count = 1): Animal[] {
    this.remove(spec.id);
    const a = createAnimals(spec, count);
    this.animals.push(...a);
    return a;
  }

  /** Remove an animal / group by id (all when id is omitted). */
  remove(id?: string): void {
    if (id === undefined) this.animals = [];
    else this.animals = this.animals.filter((a) => a.id !== id && groupId(a.id) !== id);
  }

  update(dt: number, p: MenageriePlayer): MenagerieEvent[] {
    const ev: MenagerieEvent[] = [];
    for (const a of this.animals) {
      a.t += dt;
      if (a.cool > 0) a.cool = Math.max(0, a.cool - dt);
      const prevX = a.x;
      const prevZ = a.z;
      if (a.kind === 'cassowary') this.cassowary(a, dt, p, ev);
      else if (a.kind === 'dromedary') this.dromedary(a, dt, p, ev);
      else this.jaguar(a, dt, p, ev);
      const moved = Math.hypot(a.x - prevX, a.z - prevZ);
      a.speed = dt > 0 ? moved / dt : 0;
      const stride = a.kind === 'dromedary' ? 2.4 : a.kind === 'jaguar' ? 1.6 : 1.3;
      const before = Math.floor(a.phase);
      a.phase += moved / stride;
      if (Math.floor(a.phase) !== before && a.speed > 0.3) ev.push({ type: 'step', id: a.id, x: a.x, z: a.z, heavy: a.kind !== 'jaguar' && a.speed > 4 });
    }
    // animals don't walk through each other
    for (let i = 0; i < this.animals.length; i++)
      for (let j = i + 1; j < this.animals.length; j++) {
        const a = this.animals[i]!;
        const b = this.animals[j]!;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        const min = a.radius + b.radius;
        if (d < min) {
          const push = (min - d) / 2;
          const dx = d === 0 ? push : ((a.x - b.x) / d) * push;
          const dz = d === 0 ? 0 : ((a.z - b.z) / d) * push;
          a.x += dx;
          a.z += dz;
          b.x -= dx;
          b.z -= dz;
        }
      }
    return ev;
  }

  /**
   * Push a walker at x/z (radius r) out of all animal bodies. Dromedaries are long (an ellipse
   * along their heading). Returns the corrected position and whether it touched an animal.
   */
  collide(x: number, z: number, r: number): { x: number; z: number; hit: Animal | null } {
    let hit: Animal | null = null;
    for (const a of this.animals) {
      // body frame: f along the heading, s to the right
      const fx = -Math.sin(a.h);
      const fz = -Math.cos(a.h);
      const dx = x - a.x;
      const dz = z - a.z;
      const f = dx * fx + dz * fz;
      const s = dx * -fz + dz * fx;
      const len = a.kind === 'dromedary' ? 1.55 : a.kind === 'jaguar' ? 0.9 : 0.4;
      // capsule along the body axis
      const cf = Math.max(-len, Math.min(len, f));
      const ex = f - cf;
      const d = Math.hypot(ex, s);
      const min = a.radius + r;
      if (d < min) {
        const k = d > 1e-4 ? min / d : 1;
        const nf = cf + (d > 1e-4 ? ex * k : 0);
        const ns = d > 1e-4 ? s * k : min;
        x = a.x + fx * nf + -fz * ns;
        z = a.z + fz * nf + fx * ns;
        hit = a;
      }
    }
    return { x, z, hit };
  }

  // ---- shared movement -------------------------------------------------------------------

  private turnTo(a: Animal, h: number, rate: number, dt: number): void {
    const d = wrapAngle(h - a.h);
    const m = rate * dt;
    a.h = wrapAngle(a.h + Math.max(-m, Math.min(m, d)));
  }

  /** Walk forward along the heading; blocked ground: try a slight deflection, else stop. */
  private forward(a: Animal, speed: number, dt: number): boolean {
    const step = speed * dt;
    if (step <= 0) return true;
    for (const off of [0, 0.45, -0.45, 0.9, -0.9]) {
      const h = a.h + off;
      const nx = a.x - Math.sin(h) * step;
      const nz = a.z - Math.cos(h) * step;
      if (this.world.walkable && !this.world.walkable(nx, nz)) continue;
      a.x = nx;
      a.z = nz;
      if (off !== 0) a.h = wrapAngle(a.h + off * 0.3);
      return true;
    }
    return false;
  }

  private walkTo(a: Animal, gx: number, gz: number, speed: number, turn: number, dt: number): number {
    const d = Math.hypot(gx - a.x, gz - a.z);
    if (d < 0.05) return d;
    this.turnTo(a, headingOf(gx - a.x, gz - a.z), turn, dt);
    const facing = Math.cos(wrapAngle(headingOf(gx - a.x, gz - a.z) - a.h));
    if (!this.forward(a, Math.min(speed, d / Math.max(dt, 1e-3)) * Math.max(0, facing), dt)) a.goal = null;
    return d;
  }

  private set(a: Animal, s: AnimalState): void {
    a.state = s;
    a.t = 0;
  }

  private wander(a: Animal, dt: number, radius: number, speed: number): void {
    if (a.wait > 0) {
      a.wait -= dt;
      return;
    }
    if (!a.goal) {
      const ang = a.rng() * Math.PI * 2;
      const r = Math.sqrt(a.rng()) * radius;
      a.goal = { x: a.home.x + Math.cos(ang) * r, z: a.home.z + Math.sin(ang) * r };
    }
    if (this.walkTo(a, a.goal.x, a.goal.z, speed, 1.6, dt) < 0.4) {
      a.goal = null;
      a.wait = 2 + a.rng() * 5;
    }
  }

  // ---- cassowary ---------------------------------------------------------------------------

  private cassowary(a: Animal, dt: number, p: MenageriePlayer, ev: MenagerieEvent[]): void {
    const C = CASSOWARY;
    const dx = p.x - a.x;
    const dz = p.z - a.z;
    const d = Math.hypot(dx, dz);
    const toP = headingOf(dx, dz);
    const ignore = p.flying === true || a.cool > 0;
    a.pose += ((a.state === 'display' || a.state === 'notice' ? 1 : 0) - a.pose) * Math.min(1, dt * 4);
    switch (a.state) {
      case 'idle':
        this.wander(a, dt, C.wanderRadius, C.walk);
        if (!ignore && !p.down && d < C.noticeRange) {
          a.charges = 0;
          this.set(a, 'notice');
          ev.push({ type: 'notice', id: a.id, kind: a.kind, x: a.x, z: a.z });
          ev.push({ type: 'boom', id: a.id, x: a.x, z: a.z });
        }
        break;
      case 'notice':
        this.turnTo(a, toP, 3, dt);
        if (a.t > C.noticeT) this.set(a, 'display');
        break;
      case 'display':
        this.turnTo(a, toP, 2.4, dt);
        if (p.down || d > C.noticeRange * 1.6) {
          this.bored(a, ev);
          break;
        }
        if (a.t > C.displayT) {
          a.charges++;
          a.from = { x: a.x, z: a.z };
          // commit to a point beyond the player: it overshoots when you step aside
          a.goal = { x: p.x + (dx / (d || 1)) * C.overshoot, z: p.z + (dz / (d || 1)) * C.overshoot };
          this.set(a, 'charge');
          ev.push({ type: 'charge', id: a.id, x: a.x, z: a.z, n: a.charges });
        }
        break;
      case 'charge': {
        const sp = this.gentle ? C.gentleChargeSpeed : C.chargeSpeed;
        const ramp = Math.min(1, 0.35 + a.t * 1.6);
        // aim at the player while far, but with a slow turn: a side-step makes it miss
        if (d > 3) this.turnTo(a, toP, C.chargeTurn, dt);
        const ok = this.forward(a, sp * ramp, dt);
        if (!p.down && !p.flying && d < C.hitRange + 0.3) {
          const kx = -Math.sin(a.h);
          const kz = -Math.cos(a.h);
          ev.push({ type: 'knockdown', id: a.id, kind: a.kind, x: a.x, z: a.z, seconds: this.gentle ? C.gentleKnockdown : C.knockdown, dx: kx, dz: kz });
          this.bored(a, ev);
          break;
        }
        const run = Math.hypot(a.x - a.from.x, a.z - a.from.z);
        const passed = Math.cos(wrapAngle(toP - a.h)) < 0 && d > 2.5;
        if (!ok || a.t > C.maxChargeT || (passed && run > 6)) {
          ev.push({ type: 'miss', id: a.id, x: a.x, z: a.z });
          this.set(a, 'turn');
        }
        break;
      }
      case 'turn':
        this.turnTo(a, toP, 2.2, dt);
        this.forward(a, Math.max(0, 3 - a.t * 4), dt); // skidding out
        if (a.t > C.turnT) {
          if (a.charges >= (this.gentle ? 2 : C.maxCharges) || p.down || d > C.noticeRange * 1.6) this.bored(a, ev);
          else this.set(a, 'display');
        }
        break;
      case 'bored':
        // walks back to its spot, pecking now and then
        if (Math.hypot(a.home.x - a.x, a.home.z - a.z) > 1.5) this.walkTo(a, a.home.x, a.home.z, C.walk * 1.2, 1.5, dt);
        else this.set(a, 'idle');
        break;
      default:
        this.set(a, 'idle');
    }
  }

  private bored(a: Animal, ev: MenagerieEvent[]): void {
    a.cool = CASSOWARY.cooldown;
    a.goal = null;
    this.set(a, 'bored');
    ev.push({ type: 'bored', id: a.id, x: a.x, z: a.z });
  }

  // ---- dromedary ---------------------------------------------------------------------------

  private dromedary(a: Animal, dt: number, p: MenageriePlayer, ev: MenagerieEvent[]): void {
    const D = DROMEDARY;
    const d = Math.hypot(p.x - a.x, p.z - a.z);
    // chewing never stops
    a.pose = 0.5 + 0.5 * Math.sin(a.t * 4.2 + a.idx);
    switch (a.state) {
      case 'block': {
        // a little shuffle on the spot, turning the head towards a close visitor
        if (Math.hypot(a.x - a.home.x, a.z - a.home.z) > 0.6) this.walkTo(a, a.home.x, a.home.z, 0.4, 0.6, dt);
        else this.turnTo(a, a.home.h, 0.15, dt);
        // pushing into them
        if (d < a.radius + 2.2 && p.speed > 0.6 && !p.flying) a.aux += dt;
        else a.aux = Math.max(0, a.aux - dt * 0.5);
        if (a.aux > D.shoveT) {
          a.aux = 0;
          a.wait = 0;
          this.set(a, 'grumble');
          ev.push({ type: 'grumble', id: a.id, x: a.x, z: a.z });
        }
        // patience: someone waiting calmly near them (the group shares it through idx 0)
        if (d < D.patientRange && p.speed < 0.5 && !p.flying) a.wait += dt;
        else if (d > D.patientRange * 1.5) a.wait = Math.max(0, a.wait - dt);
        if (a.wait > D.patientT) {
          // amble aside: along the path direction, away from the player
          const side = (a.idx % 2 ? 1 : -1) * 1;
          const fx = -Math.sin(a.home.h);
          const fz = -Math.cos(a.home.h);
          a.goal = { x: a.home.x + fx * D.yieldDist * side, z: a.home.z + fz * D.yieldDist * side };
          this.set(a, 'yield');
          ev.push({ type: 'yield', id: a.id, x: a.x, z: a.z });
        }
        break;
      }
      case 'grumble':
        if (a.t > 1.8) this.set(a, 'block');
        break;
      case 'yield':
        if (a.goal && this.walkTo(a, a.goal.x, a.goal.z, D.walk, 0.8, dt) > 0.5) break;
        // settle in the new spot
        a.home = { x: a.x, z: a.z, h: a.h };
        a.wait = -1e9; // never yields twice
        this.set(a, 'block');
        break;
      default:
        this.set(a, 'block');
    }
  }

  // ---- jaguar ------------------------------------------------------------------------------

  private jaguar(a: Animal, dt: number, p: MenageriePlayer, ev: MenagerieEvent[]): void {
    const J = JAGUAR;
    const dx = p.x - a.x;
    const dz = p.z - a.z;
    const d = Math.hypot(dx, dz);
    const toP = headingOf(dx, dz);
    const fromHome = Math.hypot(p.x - a.home.x, p.z - a.home.z);
    const edge = p.lightRadius + J.margin;
    const near = fromHome < J.range && !p.flying;
    a.pose += ((a.state === 'creep' || a.state === 'stalk' ? 1 : 0) - a.pose) * Math.min(1, dt * 2);
    switch (a.state) {
      case 'lurk':
        this.wander(a, dt, 6, 0.8);
        if (near && a.cool <= 0 && !p.down) {
          a.aux = Math.atan2(a.z - p.z, a.x - p.x);
          this.set(a, 'stalk');
          ev.push({ type: 'seen', id: a.id, kind: a.kind, x: a.x, z: a.z });
        }
        break;
      case 'stalk': {
        if (!near || p.down) {
          this.set(a, 'retreat');
          break;
        }
        if (!p.lanternLit && d < edge + 6) {
          this.set(a, 'creep');
          ev.push({ type: 'growl', id: a.id, x: a.x, z: a.z });
          break;
        }
        // circle at the edge of the light, pausing to stare
        const pausing = Math.sin(a.t * 0.35 + a.idx) > 0.55;
        if (!pausing) a.aux += J.circleSpeed * dt * (a.rng() < 0.002 ? -40 : 1);
        const ring = (p.lanternLit ? edge : edge + 2) + 1.5 * Math.sin(a.t * 0.21);
        const gx = p.x + Math.cos(a.aux) * ring;
        const gz = p.z + Math.sin(a.aux) * ring;
        if (pausing && Math.hypot(gx - a.x, gz - a.z) < 3) this.turnTo(a, toP, 2, dt);
        else this.walkTo(a, gx, gz, d < edge ? J.runSpeed * 0.5 : J.stalkSpeed + Math.max(0, Math.hypot(gx - a.x, gz - a.z) - 4) * 0.4, 2.2, dt);
        // never inside the light: if the player walks at it, it gives way at once
        if (p.lanternLit && d < edge - 0.5) this.giveWay(a, p, edge, dt);
        break;
      }
      case 'creep': {
        if (p.lanternLit) {
          // the light drives it back
          ev.push({ type: 'hiss', id: a.id, x: a.x, z: a.z });
          a.cool = 4;
          this.set(a, 'retreat');
          break;
        }
        if (!near || p.down) {
          this.set(a, 'retreat');
          break;
        }
        const to = this.gentle ? J.gentleCreepTo : J.creepTo;
        this.turnTo(a, toP, 1.8, dt);
        if (d > to) this.forward(a, J.creepSpeed * (p.speed > 2.5 ? 1.8 : 1), dt);
        else if (!this.gentle) {
          this.set(a, 'pounce');
        }
        break;
      }
      case 'pounce':
        if (this.gentle) {
          this.set(a, 'retreat');
          break;
        }
        this.turnTo(a, toP, 4, dt);
        this.forward(a, J.runSpeed, dt);
        if (p.lanternLit) {
          ev.push({ type: 'hiss', id: a.id, x: a.x, z: a.z });
          a.cool = 4;
          this.set(a, 'retreat');
        } else if (d < a.radius + 0.7) {
          ev.push({ type: 'knockdown', id: a.id, kind: a.kind, x: a.x, z: a.z, seconds: J.knockdown, dx: -Math.sin(a.h), dz: -Math.cos(a.h) });
          a.cool = J.cooldown;
          this.set(a, 'retreat');
        } else if (a.t > 1.2) {
          a.cool = 6;
          this.set(a, 'retreat');
        }
        break;
      case 'retreat': {
        // away from the player into the dark, then back to lurking
        const ax = a.x - p.x;
        const az = a.z - p.z;
        const l = Math.hypot(ax, az) || 1;
        if (l < J.retreatDist && a.t < 8) {
          this.turnTo(a, headingOf(ax / l, az / l), 4, dt);
          this.forward(a, J.runSpeed * (a.t < 2 ? 1 : 0.5), dt);
        } else {
          a.cool = Math.max(a.cool, 3);
          this.set(a, near ? 'stalk' : 'lurk');
          if (!near) a.goal = null;
          else a.aux = Math.atan2(a.z - p.z, a.x - p.x);
        }
        break;
      }
      default:
        this.set(a, 'lurk');
    }
  }

  /** Lantern light: step straight out of it. */
  private giveWay(a: Animal, p: MenageriePlayer, edge: number, dt: number): void {
    const ax = a.x - p.x;
    const az = a.z - p.z;
    const l = Math.hypot(ax, az) || 1;
    const need = edge - l;
    const step = Math.min(need, JAGUAR.runSpeed * dt);
    const nx = a.x + (ax / l) * step;
    const nz = a.z + (az / l) * step;
    if (!this.world.walkable || this.world.walkable(nx, nz)) {
      a.x = nx;
      a.z = nz;
    }
  }
}
