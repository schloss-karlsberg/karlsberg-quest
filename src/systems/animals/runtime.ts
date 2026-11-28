/**
 * The animal system's runtime (tour C5), headless: requests (`animal:request`), the pure deer / dog
 * core (deer.ts, dogs.ts) stepped against the live player, leaders and world, fauna bodies driven
 * from the core's motion, the core's events on the bus, era gating, the save slice, the photo and
 * cinematic targets. No three.js and no GameContext: index.ts wires it to the game and
 * tests/animals-system.test.ts drives it with fakes.
 */
import type { Stance } from '../../player/stance';
import { CROWD_LEVEL_TOLERANCE, DOG_RADIUS, PLAYER_RADIUS, separateFromCrowd, type CrowdCircle } from '../../world/crowd';
import type { Animal, AnimalClip, AnimalSpawnOpts, FaunaApi } from '../fauna/types';
import type { GroupRelocation } from '../walk/types';
import {
  DEER,
  calmDeer,
  createDeer,
  fawnSlot,
  leaderId,
  leaveDeer,
  applyDeerRequest,
  startleDeer,
  stepDeerHerd,
  type Deer,
  type DeerInput,
  type DeerNoise,
} from './deer';
import { applyDogRequest, createDog, DOGS, dogSlot, relocateDog, stepDog, type Dog, type DogTarget } from './dogs';
import { createCinematicBridge, createPhotoBridge, type CinematicBridge, type P3, type PhotoBridge } from './photoBridge';
import { restoreAnimals, serializeAnimals } from './save';
import { specIdFor, toRequest, type AnimalAction, type AnimalEvent, type AnimalKind, type AnimalRequest, type AnimalSave } from './types';

/** Animals exist only in this era. */
export const ANIMAL_ERA = 'today';
/** Line-of-sight re-check rate (Hz). */
export const LOS_HZ = 5;
/** Save slice refresh rate (Hz); requests and restores write at once. */
export const SAVE_HZ = 4;
/** A leader moving faster than this in one tick jumped (teleport, warp): its speed counts as 0. */
export const JUMP_SPEED = 15;
/**
 * Velocity filter of a follow ref (s). A people root moves only on rendered frames (the walk syncs
 * its bodies in the frame hook), so between fixed ticks it jumps or stands still (at 30 fps: 2v, 0,
 * 2v, 0 …). The ref's speed is its displacement over the time since it last moved, low-passed.
 */
export const REF_TAU = 0.25;
/** A ref that has not moved for this long has stopped (s); shorter gaps are ticks without a render. */
export const REF_HOLD = 0.15;
/** lineOfSight transmittance below this = the deer cannot see the player. */
export const LOS_MIN = 0.15;
/** Photo `at`: body centre at this fraction of the shoulder height. */
const CENTRE_FRAC = 0.7;

export type FaunaLike = Pick<FaunaApi, 'spawn'>;

export interface AnimalsPlayer {
  x: number;
  y?: number;
  z: number;
  /** Ground speed m/s. */
  speed: number;
  stance: Stance;
  flying?: boolean;
}

/** A person as far as the leader lookup needs it (the people API's Person). */
export interface PersonLike {
  readonly specId: string;
  readonly root: { position: { x: number; z: number }; rotation: { y: number } };
}

export interface AnimalsWorld {
  heightAt(x: number, z: number): number;
  era(): string;
  player(): AnimalsPlayer;
  reducedMotion?(): boolean;
  walkable?(x: number, z: number): boolean;
  tourVisitors?(): readonly CrowdCircle[];
  /** Can the deer at (ax, az) see the player at (bx, bz) in this stance? Default: yes. */
  los?(ax: number, az: number, bx: number, bz: number, stance: Stance): boolean;
  /** Live people (ctx.people.list()). */
  people?(): readonly PersonLike[];
  /** Npc system positions (kq.npc.list()). */
  npcs?(): readonly { npc: string; x: number; z: number }[];
}

export interface AnimalsBus {
  on(name: string, fn: (p: never) => void): void;
  emit(name: string, payload: unknown): void;
}

export interface AnimalsDeps {
  bus: AnimalsBus;
  fauna(): FaunaLike | undefined;
  world: AnimalsWorld;
  load(): Partial<AnimalSave> | null | undefined;
  save(s: AnimalSave): void;
  photo?: PhotoBridge;
  cinematic?: CinematicBridge;
  /** Diagnostics (default console.warn). */
  log?: (msg: string) => void;
}

interface Slot {
  id: string;
  kind: AnimalKind;
  body: Animal | null;
  keepAlive: boolean;
  clip: AnimalClip | null;
  speed: number;
  yaw: number;
  visible: boolean;
  /** Eye glint 0..1 (op 'shine'); not saved: a restore starts at 0, whoever set it sets it again. */
  shine: number;
  undo: (() => void)[];
}

interface RefSample extends DogTarget {
  /** Filtered velocity (m/s). */
  vx: number;
  vz: number;
  /** Seconds since the position last changed. */
  idle: number;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const headingOf = (dx: number, dz: number): number => Math.atan2(-dx, -dz);

export class AnimalsRuntime {
  readonly deer: Deer[] = [];
  readonly dogs: Dog[] = [];
  readonly slots = new Map<string, Slot>();
  readonly photo: PhotoBridge;
  readonly cinematic: CinematicBridge;
  private active = true;
  /** Noises since the last tick (`world:noise`). */
  private readonly noises: DeerNoise[] = [];
  private losT = 0;
  private los = true;
  private saveT = 0;
  /** Last known pose of each follow ref (speed / heading from the motion between ticks). */
  private readonly refs = new Map<string, RefSample>();
  private tickRefs = new Map<string, RefSample | null>();
  private dt = 1 / 60;
  private readonly log: (m: string) => void;
  /** Per-tick crowd scratch: the tour runs every fixed step, so these are reused, not allocated. */
  private readonly blockers: CrowdCircle[] = [];
  private readonly playerCircle: CrowdCircle = { x: 0, y: 0, z: 0, radius: PLAYER_RADIUS };
  private readonly dogBody: CrowdCircle = { x: 0, y: 0, z: 0, radius: DOG_RADIUS };
  private readonly dogFrom = { x: 0, z: 0 };
  private readonly dogCircles: CrowdCircle[] = [];

  constructor(private readonly deps: AnimalsDeps) {
    this.photo = deps.photo ?? createPhotoBridge();
    this.cinematic = deps.cinematic ?? createCinematicBridge();
    this.log = deps.log ?? ((m) => console.warn(m));
    deps.bus.on('animal:request', (a: AnimalAction) => this.request(a));
    deps.bus.on('story:cue', (c: { id: string; data?: Record<string, unknown> }) => {
      if (c && c.id === 'animal' && c.data) this.request(c.data as unknown as AnimalAction);
    });
    deps.bus.on('save:loaded', () => this.restore());
    // a thrown chestnut lands (forage): the deer prick up, or bolt when it is close
    deps.bus.on('world:noise', (n: DeerNoise) => {
      if (this.active && this.deer.length && this.noises.length < 8) this.noises.push({ x: n.x, z: n.z, loud: n.loud });
    });
    deps.bus.on('group:relocated', (relocation: GroupRelocation) => this.relocateFollowers(relocation));
    this.active = deps.world.era() === ANIMAL_ERA;
  }

  private relocateFollowers({ poses }: GroupRelocation): void {
    if (this.paused || !this.dogs.length) return;
    const returned: AnimalEvent[] = [];
    let moved = false;
    for (const dog of this.dogs) {
      const ref = dog.state === 'lie' ? dog.lie?.follow : dog.follow;
      const pose = poses.find((p) => ref === `npc:${p.npc}`);
      if (!pose || !ref) continue;
      this.refs.delete(ref);
      this.tickRefs.delete(ref);
      if (relocateDog(dog, { ...pose, speed: 0 })) returned.push({ type: 'animal:returned', id: dog.id });
      moved = true;
    }
    if (!moved) return;
    this.writeSave();
    this.cues(returned);
  }

  // ---- requests -------------------------------------------------------------------------------

  /** One C5 action (flat). Returns false when it was rejected. */
  request(a: AnimalAction & { keepAlive?: boolean }): boolean {
    const r = a && typeof a === 'object' ? toRequest(a) : null;
    if (!r) {
      this.log(`[animals] bad request ${JSON.stringify(a)}`);
      return false;
    }
    const ok = this.apply(r, a.keepAlive === true);
    if (ok) this.writeSave();
    return ok;
  }

  private apply(r: AnimalRequest, keepAlive: boolean): boolean {
    if (r.op === 'spawn') {
      this.remove(r.id);
      if (r.kind === 'reh') {
        let at: { x: number; z: number; yaw?: number } | undefined;
        const lid = r.follow?.startsWith('animal:') ? r.follow.slice(7) : '';
        const lead = lid ? this.deer.find((d) => d.id === lid) : undefined;
        if ((r.x === undefined || r.z === undefined) && lead) at = { ...fawnSlot(lead, Math.min(r.spacing ?? DEER.FAWN_SPACING, DEER.FAWN_MAX)), yaw: lead.yaw };
        else if (r.x === undefined || r.z === undefined) at = this.nearPlayer(r.id);
        const d = createDeer(r, at);
        this.deer.push(d);
        this.addSlot(d.id, 'reh', d.look, d.x, d.z, d.yaw, keepAlive);
      } else {
        let at: { x: number; z: number; yaw?: number } | undefined;
        if (r.x === undefined || r.z === undefined) {
          const t = r.follow ? this.resolve(r.follow) : null;
          const slot = r.look === 'bijou' ? 1 : 0;
          at = t ? { ...dogSlot(t, slot, r.spacing ?? 1.5), yaw: t.yaw } : this.nearPlayer(r.id);
        }
        const dog = createDog(r, undefined, at);
        this.dogs.push(dog);
        this.addSlot(dog.id, 'hund', dog.look, dog.x, dog.z, dog.yaw, keepAlive);
      }
      return true;
    }
    if (r.op === 'despawn') return this.remove(r.id);
    if (r.op === 'shine') {
      const s = this.slots.get(r.id);
      if (!s) {
        this.log(`[animals] no animal '${r.id}' for op 'shine'`);
        return false;
      }
      s.shine = r.k;
      s.body?.setEyeShine(r.k);
      return true;
    }
    const deer = this.deer.find((d) => d.id === r.id);
    if (deer) {
      if (!applyDeerRequest(deer, r)) {
        this.log(`[animals] a deer does not take op '${r.op}' (${r.id})`);
        return false;
      }
      return true;
    }
    const dog = this.dogs.find((d) => d.id === r.id);
    if (!dog) {
      this.log(`[animals] no animal '${r.id}' for op '${r.op}'`);
      return false;
    }
    this.cues(applyDogRequest(dog, r));
    return true;
  }

  private nearPlayer(id: string): { x: number; z: number } {
    const p = this.deps.world.player();
    const a = ((hash(id) % 360) * Math.PI) / 180;
    return { x: p.x + Math.sin(a) * 3, z: p.z + Math.cos(a) * 3 };
  }

  private addSlot(id: string, kind: AnimalKind, look: string, x: number, z: number, yaw: number, keepAlive: boolean): void {
    const s: Slot = { id, kind, body: null, keepAlive, clip: null, speed: -1, yaw: Number.NaN, visible: true, shine: 0, undo: [] };
    this.slots.set(id, s);
    this.spawnBody(s, look, x, z, yaw);
  }

  private spawnBody(s: Slot, look: string, x: number, z: number, yaw: number): void {
    const fauna = this.deps.fauna();
    if (fauna) {
      const o: AnimalSpawnOpts = { x, z, y: this.deps.world.heightAt(x, z), yaw, seed: hash(s.id), name: s.id };
      if (s.keepAlive) o.keepAlive = true;
      try {
        s.body = fauna.spawn(specIdFor(s.kind, look as never), o);
      } catch (err) {
        this.log(`[animals] fauna.spawn failed for '${s.id}': ${String(err)}`);
        s.body = null;
      }
    }
    if (s.body && !this.active) {
      s.body.setVisible(false);
      s.visible = false;
    }
    // photo targets (deer) and cinematic targets (all four)
    if (s.kind === 'reh') {
      s.undo.push(
        this.photo.attach(specIdFor('reh', look as never), {
          at: () => this.centreOf(s.id),
          calm: () => this.deer.find((d) => d.id === s.id)?.state !== 'flee',
          state: () => this.deer.find((d) => d.id === s.id)?.state ?? 'gone',
        }),
      );
    }
    s.undo.push(this.cinematic.register(`animal:${s.id}`, () => this.headOf(s.id)));
  }

  private remove(id: string): boolean {
    const s = this.slots.get(id);
    const di = this.deer.findIndex((d) => d.id === id);
    if (di >= 0) this.deer.splice(di, 1);
    const gi = this.dogs.findIndex((d) => d.id === id);
    if (gi >= 0) this.dogs.splice(gi, 1);
    if (s) this.disposeSlot(s);
    this.slots.delete(id);
    return !!s || di >= 0 || gi >= 0;
  }

  private disposeSlot(s: Slot): void {
    for (const u of s.undo) u();
    s.undo = [];
    s.body?.dispose();
    s.body = null;
  }

  /** Drop the bodies and targets, keep the slice (system dispose). */
  dispose(): void {
    for (const s of this.slots.values()) this.disposeSlot(s);
    this.slots.clear();
  }

  /** Remove every animal (debug / tests). */
  clear(): void {
    for (const s of this.slots.values()) this.disposeSlot(s);
    this.slots.clear();
    this.deer.length = 0;
    this.dogs.length = 0;
    this.refs.clear();
    this.writeSave();
  }

  // ---- targets --------------------------------------------------------------------------------

  /** Body centre (photo `at`), null while hidden or gone. */
  centreOf(id: string): P3 | null {
    const s = this.slots.get(id);
    const d = this.deer.find((e) => e.id === id) ?? this.dogs.find((e) => e.id === id);
    if (!s || !d || !this.active || !s.visible) return null;
    const h = s.body?.info.height ?? 0.7;
    return { x: d.x, y: this.deps.world.heightAt(d.x, d.z) + h * CENTRE_FRAC, z: d.z };
  }

  /** Head position (cinematic target), null while hidden or gone. */
  headOf(id: string): P3 | null {
    const s = this.slots.get(id);
    if (!s || !this.active || !s.visible) return null;
    if (s.body) {
      const o = { x: 0, y: 0, z: 0 };
      s.body.headWorld(o);
      // The camera updates before body sync. Keep its target on the current simulation pose.
      const d = this.deer.find((a) => a.id === id) ?? this.dogs.find((a) => a.id === id);
      if (d) {
        const root = s.body.root.position;
        o.x += d.x - root.x;
        o.y += this.deps.world.heightAt(d.x, d.z) - root.y;
        o.z += d.z - root.z;
      }
      return o;
    }
    const c = this.centreOf(id);
    return c;
  }

  // ---- leaders --------------------------------------------------------------------------------

  /** Raw pose of a follow ref, without speed (null when absent). */
  private locate(ref: string): { x: number; z: number; yaw?: number } | null {
    const w = this.deps.world;
    if (ref === 'player') {
      const p = w.player();
      return { x: p.x, z: p.z };
    }
    if (ref.startsWith('animal:')) {
      const id = ref.slice(7);
      const a = this.deer.find((d) => d.id === id) ?? this.dogs.find((d) => d.id === id);
      return a ? { x: a.x, z: a.z, yaw: a.yaw } : null;
    }
    if (ref.startsWith('npc:')) {
      const id = ref.slice(4);
      if (id.startsWith('double.') || id.startsWith('extra.') || id === 'guide') {
        const p = w.people?.().find((q) => q.specId === id);
        if (p) return { x: p.root.position.x, z: p.root.position.z, yaw: p.root.rotation.y };
      }
      const n = w.npcs?.().find((q) => q.npc === id);
      if (n) return { x: n.x, z: n.z };
      return null;
    }
    return null;
  }

  /** A follow ref as the dog core wants it (pose + speed + heading), cached per tick. */
  resolve = (ref: string): DogTarget | null => {
    if (this.tickRefs.has(ref)) return this.tickRefs.get(ref)!;
    const at = this.locate(ref);
    let out: RefSample | null = null;
    if (at) {
      const prev = this.refs.get(ref);
      let vx = 0;
      let vz = 0;
      let idle = 0;
      let jumped = false;
      if (prev) {
        const dx = at.x - prev.x;
        const dz = at.z - prev.z;
        const d = Math.hypot(dx, dz);
        const span = prev.idle + this.dt;
        if (d > 1e-6) {
          // moved: the displacement since it last moved, over that time; a jump (teleport, a fade's
          // warp, the walk's snap) starts over at rest, and the dogs far behind land in their places
          if (d / span <= JUMP_SPEED) {
            const k = 1 - Math.exp(-span / REF_TAU);
            vx = prev.vx + (dx / span - prev.vx) * k;
            vz = prev.vz + (dz / span - prev.vz) * k;
          } else jumped = true;
        } else {
          // standing: a tick without a render holds the speed, a longer stand lets it decay
          idle = span;
          const keep = idle > REF_HOLD ? Math.exp(-this.dt / REF_TAU) : 1;
          vx = prev.vx * keep;
          vz = prev.vz * keep;
          if (Math.hypot(vx, vz) < 0.02) vx = vz = 0;
        }
      }
      const speed = Math.hypot(vx, vz);
      let yaw = at.yaw ?? prev?.yaw ?? 0;
      if (at.yaw === undefined && speed > 0.3) yaw = headingOf(vx, vz);
      out = { x: at.x, z: at.z, yaw, speed, vx, vz, idle, jumped };
    }
    this.tickRefs.set(ref, out);
    return out;
  };

  /** End of tick: remember where each ref was. */
  private sampleRefs(): void {
    this.refs.clear();
    for (const [ref, t] of this.tickRefs) if (t) this.refs.set(ref, t);
    this.tickRefs = new Map();
  }

  // ---- per tick -------------------------------------------------------------------------------

  get paused(): boolean {
    return !this.active;
  }

  update(dt: number): void {
    const w = this.deps.world;
    const on = w.era() === ANIMAL_ERA;
    if (on !== this.active) this.setActive(on);
    if (!on || dt <= 0) return;
    this.dt = dt;
    this.tickRefs = new Map(); // poses a request resolved between ticks are stale now
    const p = w.player();
    const player = { x: p.x, z: p.z, speed: p.flying ? 0 : p.speed, stance: p.stance };
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 1 / LOS_HZ;
      this.los = !p.flying && this.seen(p);
    }
    const input: DeerInput = { player, los: this.los };
    if (this.noises.length) input.noise = this.noises.splice(0);
    if (w.walkable) input.walkable = (x, z) => w.walkable!(x, z);
    const evs = this.deer.length ? stepDeerHerd(this.deer, dt, input) : [];
    const visitors = this.dogs.length ? w.tourVisitors?.() : undefined;
    const blockers = visitors?.length && !p.flying ? this.withPlayer(visitors, p.x, p.y ?? w.heightAt(p.x, p.z), p.z) : visitors;
    const reachedBlocker = blockers?.length ? (dog: Dog, x: number, z: number): boolean => blockers.some((other) => {
      const clearance = DOG_RADIUS + other.radius;
      return Math.hypot(x - other.x, z - other.z) < clearance &&
        Math.hypot(dog.x - other.x, dog.z - other.z) <= clearance + DOGS.PATH_EPS &&
        Math.abs(w.heightAt(x, z) - other.y) <= CROWD_LEVEL_TOLERANCE;
    }) : undefined;
    const reducedMotion = this.dogs.length > 0 && w.reducedMotion?.();
    for (const dog of this.dogs) {
      const crowded = dog.follow === 'npc:double.jost' && blockers?.length;
      stepDog(dog, dt, this.resolve, evs, reducedMotion, crowded ? reachedBlocker : undefined);
      if (!crowded) continue;
      const body = this.dogBody;
      body.x = dog.x;
      body.y = w.heightAt(dog.x, dog.z);
      body.z = dog.z;
      const from = this.dogFrom;
      from.x = dog.x + Math.sin(dog.yaw);
      from.z = dog.z + Math.cos(dog.yaw);
      separateFromCrowd(body, blockers, from);
      if ((body.x !== dog.x || body.z !== dog.z) && Math.abs(w.heightAt(body.x, body.z) - body.y) < 0.45) {
        dog.x = body.x;
        dog.z = body.z;
      }
    }
    // keep the follow refs' samples fresh (the player and leaders) even when no dog asked this tick
    for (const d of this.dogs) if (d.follow) this.resolve(d.follow);
    this.sampleRefs();
    this.cues(evs);
    this.saveT -= dt;
    if (this.saveT <= 0) {
      this.saveT = 1 / SAVE_HZ;
      this.writeSave();
    }
  }

  /** The visitors plus the player's circle, in a reused array. */
  private withPlayer(visitors: readonly CrowdCircle[], x: number, y: number, z: number): readonly CrowdCircle[] {
    const pc = this.playerCircle;
    pc.x = x;
    pc.y = y;
    pc.z = z;
    const all = this.blockers;
    all.length = 0;
    for (const v of visitors) all.push(v);
    all.push(pc);
    return all;
  }

  /** The tour dogs' collision circles. The array and its circles are reused on every call. */
  tourDogs(): readonly CrowdCircle[] {
    const w = this.deps.world;
    const out = this.dogCircles;
    let n = 0;
    if (w.era() === ANIMAL_ERA) {
      for (const dog of this.dogs) {
        if (dog.follow !== 'npc:double.jost' || !this.slots.get(dog.id)?.body) continue;
        const c = (out[n] ??= { x: 0, y: 0, z: 0, radius: DOG_RADIUS });
        c.x = dog.x;
        c.y = w.heightAt(dog.x, dog.z);
        c.z = dog.z;
        n++;
      }
    }
    out.length = n;
    return out;
  }

  /** Any self-led deer sees the player (the doe leads; followers mirror her). */
  private seen(p: AnimalsPlayer): boolean {
    const los = this.deps.world.los;
    if (!los) return true;
    let any = false;
    for (const d of this.deer) {
      if (leaderId(d) && this.deer.some((e) => e.id === leaderId(d))) continue;
      if (d.state === 'gone') continue;
      if (Math.hypot(p.x - d.x, p.z - d.z) > d.shy.notice + 2) continue;
      if (los(d.x, d.z, p.x, p.z, p.stance)) {
        any = true;
        break;
      }
    }
    return any;
  }

  /** The core's events: `animal:*` 1:1 onto the bus, bark / shake as one-shots on the body. */
  private cues(evs: readonly AnimalEvent[]): void {
    for (const e of evs) {
      if (e.type === 'bark' || e.type === 'shake') {
        this.slots.get(e.id)?.body?.play(e.type, { loop: false });
        continue;
      }
      const { type, ...payload } = e;
      this.deps.bus.emit(type, payload);
    }
  }

  private setActive(on: boolean): void {
    this.active = on;
    for (const s of this.slots.values()) this.applyVisible(s);
    this.refs.clear();
    this.losT = 0;
  }

  private applyVisible(s: Slot): void {
    const d = this.deer.find((e) => e.id === s.id);
    const v = this.active && (!d || d.state !== 'gone');
    if (v !== s.visible) {
      s.visible = v;
      s.body?.setVisible(v);
    }
  }

  /** Bodies follow the core: root on the ground, face, speed, the clip when its hint changes. */
  sync(): void {
    if (!this.active) return;
    const w = this.deps.world;
    for (const a of [...this.deer, ...this.dogs]) {
      const s = this.slots.get(a.id);
      if (!s) continue;
      this.applyVisible(s);
      const b = s.body;
      if (!b) continue;
      b.root.position.set(a.x, w.heightAt(a.x, a.z), a.z);
      const m = a.motion;
      // `!(… <= …)`: the slot starts at NaN (no yaw sent yet), and a NaN comparison is always false;
      // `abs(… - NaN) > 1e-3` never let a face() through, so the bodies kept their spawn yaw for good
      if (!(Math.abs(m.yaw - s.yaw) <= 1e-3)) {
        s.yaw = m.yaw;
        // a dog's core turns smoothly and walks along its yaw: the body shows that yaw as it is
        b.face(m.yaw, s.kind === 'hund' ? { seconds: 0 } : undefined);
      }
      if (Math.abs(m.speed - s.speed) > 0.02) {
        s.speed = m.speed;
        b.setSpeed(m.speed);
      }
      if (m.clip !== s.clip) {
        s.clip = m.clip;
        b.play(m.clip, { loop: true, fade: 0.25 });
      }
    }
  }

  // ---- save -----------------------------------------------------------------------------------

  snapshot(): AnimalSave {
    return serializeAnimals(this.deer, this.dogs);
  }

  writeSave(): void {
    this.deps.save(this.snapshot());
  }

  /** Rebuild from the slice (after a load): re-spawns the bodies, emits nothing. */
  restore(): void {
    for (const s of this.slots.values()) this.disposeSlot(s);
    this.slots.clear();
    this.deer.length = 0;
    this.dogs.length = 0;
    this.refs.clear();
    this.tickRefs = new Map();
    this.active = this.deps.world.era() === ANIMAL_ERA;
    const r = restoreAnimals(this.deps.load());
    for (const d of r.deer) {
      this.deer.push(d);
      this.addSlot(d.id, 'reh', d.look, d.x, d.z, d.yaw, false);
    }
    for (const d of r.dogs) {
      this.dogs.push(d);
      this.addSlot(d.id, 'hund', d.look, d.x, d.z, d.yaw, false);
    }
  }

  // ---- debug ----------------------------------------------------------------------------------

  startle(id: string): boolean {
    const d = this.deer.find((e) => e.id === id);
    if (!d || !this.active) return false;
    const p = this.deps.world.player();
    const w = this.deps.world;
    const evs = startleDeer(d, p, w.walkable ? (x, z) => w.walkable!(x, z) : undefined);
    this.cues(evs);
    return evs.length > 0;
  }

  /** Script-only calm (photo mode does NOT call this; design decision). */
  calm(id: string, seconds: number): boolean {
    const d = this.deer.find((e) => e.id === id);
    if (!d) return false;
    calmDeer(d, seconds);
    return true;
  }

  /** Walk calmly away from the player and end as 'gone'. */
  leave(id: string): boolean {
    const d = this.deer.find((e) => e.id === id);
    if (!d) return false;
    const p = this.deps.world.player();
    const dx = d.x - p.x;
    const dz = d.z - p.z;
    leaveDeer(d, Math.hypot(dx, dz) > 0.1 ? { x: d.x + dx, z: d.z + dz } : undefined);
    return true;
  }

  list(): { id: string; kind: AnimalKind; state: string; x: number; z: number; dist: number }[] {
    const p = this.deps.world.player();
    const row = (a: Deer | Dog, kind: AnimalKind) => ({ id: a.id, kind, state: a.state, x: a.x, z: a.z, dist: Math.hypot(a.x - p.x, a.z - p.z) });
    return [...this.deer.map((d) => row(d, 'reh')), ...this.dogs.map((d) => row(d, 'hund'))];
  }

  state(id: string): Record<string, unknown> | null {
    const d = this.deer.find((e) => e.id === id);
    if (d) return { kind: 'reh', id, state: d.state, t: d.t, meter: d.meter, calm: d.calm, follow: d.follow, x: d.x, z: d.z, yaw: d.yaw, clip: d.motion.clip, speed: d.motion.speed, los: this.los };
    const g = this.dogs.find((e) => e.id === id);
    if (g) return { kind: 'hund', id, state: g.state, t: g.t, follow: g.follow, x: g.x, z: g.z, yaw: g.yaw, clip: g.motion.clip, speed: g.motion.speed, path: g.path, back: g.back };
    return null;
  }

  stats(): { deer: number; dogs: number; bodies: number; visible: number; active: boolean; fauna: boolean; photo: 'active' | 'dormant'; cinematic: 'active' | 'dormant' } {
    let bodies = 0;
    let visible = 0;
    for (const s of this.slots.values()) {
      if (s.body) bodies++;
      if (s.body && s.visible) visible++;
    }
    return {
      deer: this.deer.length,
      dogs: this.dogs.length,
      bodies,
      visible,
      active: this.active,
      fauna: !!this.deps.fauna(),
      photo: this.photo.active ? 'active' : 'dormant',
      cinematic: this.cinematic.active ? 'active' : 'dormant',
    };
  }
}
