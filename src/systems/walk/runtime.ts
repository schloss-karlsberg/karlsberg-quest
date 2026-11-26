/**
 * The walk system's runtime (WP-16, contract C2), headless: requests (`npc:walk`), walkers, groups,
 * slots, the leash, barks, the conversation pause, era gating, the teleport snap, warp and the
 * save slice. No three.js: bodies come from a `BodyFactory`, the world from `WalkWorld`, so
 * tests/walk-system.test.ts drives it with fakes. index.ts wires it to the game.
 */
import { FIND, rejoinArc } from './find';
import { buildRoute, type BuiltRoute } from './route';
import { MEMBER_SPEEDS, assignSlots, followSlots, gatherSlots, pushOutOfTrunks, separate, stepMember, type MemberSpeeds, type Slot, type TrunksNear } from './group';
import { arriveAtTarget, createWalker, earlyArrival, headingOf, restoreWalker, serializeWalker, snapAhead, stepWalker, type WalkEvent, type Walker } from './walker';
import type { GatherOp, GroupSave, Route, WalkRequest, WalkSlice } from './types';

/** Clips the walk system asks for (a subset of the people API's PersonClip). */
export type BodyClip = 'idle' | 'walk' | 'run';

/** One figure as the walk system sees it. Yaw is a heading (0 faces −z), like `Walker.yaw`. */
export interface Body {
  setPos(x: number, y: number, z: number): void;
  face(yaw: number): void;
  setSpeed(mps: number): void;
  play(clip: BodyClip): void;
  setVisible(on: boolean): void;
  dispose(): void;
}

export type BodyTier = 'hero' | 'featured' | 'extra';
export interface BodySpawn {
  /** The walk system's npc id (roster id, e.g. 'imhoff', 'double.herzog', 'extra.mats'). */
  npc: string;
  /** People API spec id ('guide', 'double.herzog', 'extra.3', …). */
  spec: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  tier: BodyTier;
  seed: number;
  speaker?: string;
}
/** A body for an npc, or null for none (no people API: the npc walks bodiless). */
export type BodyFactory = (o: BodySpawn) => Body | null;

export interface WalkWorld {
  heightAt(x: number, z: number): number;
  trunksNear?: TrunksNear;
  player(): { x: number; z: number };
  era(): string;
}

export interface WalkBus {
  on(name: string, fn: (p: never) => void): void;
  emit(name: string, payload: unknown): void;
}

/** The people API's spec ids (contract of chars/people-api). */
export const PEOPLE_SPECS = [
  'guide',
  'double.herzog',
  'double.mannlich',
  'double.hanne',
  'double.peter',
  'double.jost',
  'double.soll',
  'double.liese',
  'child.compass',
  'extra.1',
  'extra.2',
  'extra.3',
  'extra.4',
  'extra.5',
  'extra.6',
  'extra.7',
] as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Npc id → people spec id: 'imhoff' is the guide, known specs map to themselves, other ids to an extra. */
export function specFor(npc: string, specs: readonly string[] = PEOPLE_SPECS): string {
  if (npc === 'imhoff' || npc === 'guide') return 'guide';
  if (specs.includes(npc)) return npc;
  const extras = specs.filter((s) => s.startsWith('extra.'));
  return extras.length ? extras[hash(npc) % extras.length]! : (specs[0] ?? 'guide');
}

/** A member's look: people spec id and seed (the seed varies the look of a re-used spec). */
export interface MemberLook {
  spec: string;
  seed: number;
}

const isSpecId = (id: string, specs: readonly string[]) => id === 'guide' || specs.includes(id) || /^(extra\.\d+|double\.|child\.)/.test(id);

/**
 * The looks of a group's members, deterministic per group: ids that are spec ids pass through
 * ('extra.3', 'double.hanne', 'child.compass', 'guide'); the other ids ('extra.mats', …) take the
 * extra specs not used by the group yet, in member order; past the last free extra they wrap
 * around the extras with a different seed, so no two members look the same.
 */
export function memberLooks(members: readonly string[], specs: readonly string[] = PEOPLE_SPECS, leader?: string): MemberLook[] {
  const extras = specs.filter((s) => /^extra\.\d+$/.test(s));
  const used = new Set(members.filter((m) => isSpecId(m, specs)));
  if (leader) used.add(specFor(leader, specs));
  const free = extras.filter((e) => !used.has(e));
  let k = 0;
  return members.map((m) => {
    if (m === 'imhoff') return { spec: 'guide', seed: hash(m) };
    if (isSpecId(m, specs)) return { spec: m, seed: hash(m) };
    const i = k++;
    if (i < free.length) return { spec: free[i]!, seed: hash(m) };
    // wrapped: any extra again (all of them, in order), with a seed of its own
    const pool = extras.length ? extras : [specFor(m, specs)];
    const j = i - free.length;
    return { spec: pool[j % pool.length]!, seed: hash(`${m}#${Math.floor(j / pool.length) + 1}`) };
  });
}

export function tierFor(spec: string): BodyTier {
  return spec === 'guide' ? 'hero' : spec.startsWith('extra.') ? 'extra' : 'featured';
}

/** Speaker binding for the conversation system (the guide placeholder is Gerold Imhoff). */
export function speakerFor(npc: string): string | undefined {
  return npc === 'imhoff' || npc === 'guide' ? 'imhoff' : undefined;
}

/** The group exists only in this era. */
export const GROUP_ERA = 'today';
/** Slot / separation / trunk tick. */
export const SLOT_HZ = 10;
/** A player move larger than this in one step counts as a jump (teleport, travel, wake). */
export const JUMP_DIST = 20;
/** After a jump the walking leader snaps ahead when the player is farther than this. */
export const SNAP_DIST = 60;
/** Bodies farther than this from the player are hidden. */
export const VIS_DIST = 220;

interface NpcRt {
  id: string;
  spec: string;
  seed: number;
  body: Body | null;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  clip: BodyClip | null;
  visible: boolean;
}

type Mode = 'follow' | 'gather' | 'hold';

interface GroupRt {
  id: string;
  leader: string;
  members: string[];
  mode: Mode;
  around?: string;
  face?: string;
  r?: [number, number];
  spacing?: [number, number];
  route?: string;
  assign: number[];
  slots: Slot[];
  /** Implicit group of a single `follow` npc. */
  implicit?: boolean;
}

export interface WalkRuntimeOpts {
  bus: WalkBus;
  world: WalkWorld;
  bodies: BodyFactory;
  routes: Map<string, Route>;
  /** The save slice (the object stored in the game state; written in place). */
  slice: () => WalkSlice;
  specs?: () => readonly string[];
  log?: (msg: string) => void;
}

export class WalkRuntime {
  readonly npcs = new Map<string, NpcRt>();
  readonly walkers = new Map<string, Walker>();
  readonly groups = new Map<string, GroupRt>();
  private readonly built = new Map<string, BuiltRoute>();
  /** Clock (s, game time) for the bark throttle. */
  now = 0;
  private slotT = 0;
  private saveT = 0;
  private lastPlayer: { x: number; z: number } | null = null;
  private jumped = false;
  /** Npcs in an open conversation (their walk pauses). */
  private readonly talking = new Set<string>();
  private active = true;
  /** ms spent in the last update / sync (stats). */
  updateMs = 0;
  syncMs = 0;

  constructor(private readonly o: WalkRuntimeOpts) {
    const ev = o.bus;
    ev.on('npc:walk', ((r: WalkRequest) => this.request(r)) as (p: never) => void);
    ev.on('story:cue', (({ id, data }: { id: string; data?: unknown }) => {
      if (id === 'walk' && data && typeof data === 'object' && typeof (data as { op?: unknown }).op === 'string') this.request(data as WalkRequest);
    }) as (p: never) => void);
    ev.on('npc:conversation', (({ npc, open }: { npc: string; open: boolean }) => {
      if (open) this.talking.add(npc);
      else this.talking.delete(npc);
    }) as (p: never) => void);
    ev.on('player:teleport', (() => (this.jumped = true)) as (p: never) => void);
    ev.on('travel:arrived', () => {
      if (!this.era || !this.jumped) return;
      // The travel autosave runs under the curtain. Save the jump for the next tick so the
      // group can emit its arrival when the story is ready to receive it, including on reload.
      this.writeSlice();
      this.o.slice().pendingTravelSnap = true;
    });
  }

  /** The player talks to this npc (the conversation names the placement: our id or its speaker). */
  isTalking(id: string): boolean {
    if (!this.talking.size) return false;
    const sp = speakerFor(id);
    return this.talking.has(id) || (sp !== undefined && this.talking.has(sp));
  }

  private warn(msg: string): void {
    (this.o.log ?? ((m: string) => console.warn(m)))(`[walk] ${msg}`);
  }

  route(id: string): BuiltRoute | undefined {
    let b = this.built.get(id);
    if (!b) {
      const r = this.o.routes.get(id);
      if (!r) return undefined;
      b = buildRoute(r);
      this.built.set(id, b);
    }
    return b;
  }

  // ---- bodies --------------------------------------------------------------------------------

  /** The npc's runtime entry, spawned (with a body when in the group era) at x/z when new. */
  ensureNpc(id: string, x: number, z: number, yaw = 0, look?: MemberLook): NpcRt {
    let n = this.npcs.get(id);
    if (!n) {
      const specs = this.specs();
      n = { id, spec: look?.spec ?? specFor(id, specs), seed: look?.seed ?? hash(id), body: null, x, z, yaw, speed: 0, clip: null, visible: true };
      this.npcs.set(id, n);
      this.spawnBody(n);
    } else if (look && (n.spec !== look.spec || n.seed !== look.seed)) {
      // joined a group that gives it another look: a new body
      n.body?.dispose();
      n.body = null;
      n.spec = look.spec;
      n.seed = look.seed;
      this.spawnBody(n);
    }
    return n;
  }

  private specs(): readonly string[] {
    return this.o.specs?.() ?? PEOPLE_SPECS;
  }

  private spawnBody(n: NpcRt): void {
    if (n.body) return;
    try {
      n.body = this.o.bodies({ npc: n.id, spec: n.spec, x: n.x, y: this.o.world.heightAt(n.x, n.z), z: n.z, yaw: n.yaw, tier: tierFor(n.spec), seed: n.seed, speaker: speakerFor(n.id) });
      n.clip = null;
      n.visible = true;
    } catch (e) {
      this.warn(`body for ${n.id} failed: ${String(e)}`);
    }
  }

  private dropNpc(id: string): void {
    const n = this.npcs.get(id);
    if (!n) return;
    n.body?.dispose();
    this.npcs.delete(id);
    this.walkers.delete(id);
  }

  // ---- requests ------------------------------------------------------------------------------

  request(r: WalkRequest): void {
    try {
      switch (r.op) {
        case 'group':
          return this.opGroup(r.group, r.leader, r.members, r.spacing);
        case 'follow':
          return this.opFollow(r.leader, r.group, r.npc, r.spacing, r.off);
        case 'walk':
          return this.opWalk(r.npc, r.route, r.to, r.path, r.speed, r.wait);
        case 'gather':
        case 'hold':
        case 'release':
          return this.opGather(r);
        case 'despawn':
          return this.opDespawn(r.group);
        case 'warp':
          this.warp(r.group, r.to, r.route);
          return;
        default:
          this.warn(`unknown op ${(r as { op: string }).op}`);
      }
    } finally {
      this.writeSlice();
    }
  }

  /** Where a leader without a body appears: its walker's pose, else 4 m in front of the player. */
  private leaderSpot(id: string): { x: number; z: number; yaw: number } {
    const w = this.walkers.get(id);
    if (w) return { x: w.x, z: w.z, yaw: w.yaw };
    const p = this.o.world.player();
    return { x: p.x, z: p.z - 4, yaw: Math.PI };
  }

  private leaderOf(id: string): NpcRt {
    const n = this.npcs.get(id);
    if (n) return n;
    const s = this.leaderSpot(id);
    return this.ensureNpc(id, s.x, s.z, s.yaw);
  }

  private opGroup(group: string, leader: string, members: string[], spacing?: [number, number]): void {
    const old = this.groups.get(group);
    if (old) for (const m of old.members) if (!members.includes(m)) this.dropNpc(m);
    const L = this.leaderOf(leader);
    const sp: [number, number] = spacing ?? [1.2, 4];
    const g: GroupRt = { id: group, leader, members: members.filter((m) => m !== leader), mode: 'hold', assign: [], slots: [] };
    if (spacing) g.spacing = spacing;
    const n = g.members.length;
    const looks = memberLooks(g.members, this.specs(), leader);
    g.members.forEach((m, i) => {
      // a ring around the leader: golden-angle spread between the radii
      const a = i * 2.39996 + 0.5;
      const rad = sp[0] + (sp[1] - sp[0]) * (n > 1 ? i / (n - 1) : 0.5);
      const x = L.x + Math.sin(a) * rad;
      const z = L.z + Math.cos(a) * rad;
      const nn = this.ensureNpc(m, x, z, headingOf(L.x - x, L.z - z), looks[i]);
      nn.x = x;
      nn.z = z;
      nn.yaw = headingOf(L.x - x, L.z - z);
    });
    const w = this.walkers.get(leader);
    if (w?.route) g.route = w.route;
    this.groups.set(group, g);
  }

  private opFollow(leader: string, group?: string, npc?: string, spacing?: number, off?: boolean): void {
    const sp: [number, number] | undefined = spacing ? [spacing, Math.max(spacing + 2.8, 4)] : undefined;
    if (group) {
      const g = this.groups.get(group);
      if (!g) return this.warn(`follow: no group ${group}`);
      if (g.leader !== leader) {
        g.leader = leader;
        this.leaderOf(leader);
        g.assign = [];
      }
      g.mode = off ? 'hold' : 'follow';
      if (sp) g.spacing = sp;
      return;
    }
    if (!npc) return this.warn('follow: needs npc or group');
    if (leader === 'player') {
      // the npc system's escort
      this.o.bus.emit('npc:follow', { npc, follow: !off });
      return;
    }
    const id = `follow:${npc}`;
    if (off) {
      this.groups.delete(id);
      return;
    }
    this.leaderOf(leader);
    const s = this.leaderSpot(leader);
    this.ensureNpc(npc, s.x, s.z + 2);
    const g: GroupRt = { id, leader, members: [npc], mode: 'follow', assign: [], slots: [], implicit: true };
    if (sp) g.spacing = sp;
    this.groups.set(id, g);
  }

  private opWalk(npc: string, route?: string, to?: string, path?: [number, number][], speed?: number, wait?: WalkOp['wait']): void {
    const cur = this.npcs.get(npc);
    let w: Walker;
    const from = cur ? { x: cur.x, z: cur.z } : undefined;
    if (route) {
      const rt = this.route(route);
      if (!rt) return this.warn(`walk: no route ${route}`);
      const prev = this.walkers.get(npc);
      // keep the progress along the same route (a new stop continues from where the walker is)
      const s = prev && prev.route === route ? prev.s : undefined;
      w = createWalker({ npc, route: rt, to, s, from: s === undefined ? from : undefined, speed, wait });
    } else if (path && path.length >= 2) {
      w = createWalker({ npc, path, from, speed, wait });
    } else return this.warn(`walk ${npc}: needs route + to or a path`);
    this.walkers.set(npc, w);
    const n = this.ensureNpc(npc, w.x, w.z, w.yaw);
    if (!cur) {
      n.x = w.x;
      n.z = w.z;
    }
    for (const g of this.groups.values()) if (g.leader === npc && w.route) g.route = w.route;
  }

  private opGather(r: GatherOp): void {
    const g = this.groups.get(r.group);
    if (!g) return this.warn(`${r.op}: no group ${r.group}`);
    if (r.op === 'hold') g.mode = 'hold';
    else if (r.op === 'release') g.mode = 'follow';
    else {
      g.mode = 'gather';
      if (r.around) g.around = r.around;
      else delete g.around;
      if (r.face) g.face = r.face;
      else delete g.face;
      if (r.r) g.r = r.r;
      else delete g.r;
    }
    g.assign = [];
  }

  private opDespawn(group: string): void {
    const g = this.groups.get(group);
    if (!g) return;
    for (const m of g.members) this.dropNpc(m);
    // the whole group, the guide included (the story re-spawns him with a walk / group op)
    if (![...this.groups.values()].some((o) => o !== g && (o.leader === g.leader || o.members.includes(g.leader)))) this.dropNpc(g.leader);
    this.groups.delete(group);
  }

  // ---- warp / snap ---------------------------------------------------------------------------

  /** Story fade: put the group's leader at stop `to` (never backward) and the members in their slots. */
  warp(group: string, to: string, route?: string): boolean {
    const g = this.groups.get(group);
    if (!g) {
      this.warn(`warp: no group ${group}`);
      return false;
    }
    const prev = this.walkers.get(g.leader);
    const routeId = route ?? (prev?.route || g.route);
    const rt = routeId ? this.route(routeId) : undefined;
    if (!rt) {
      this.warn(`warp ${group}: no route (${routeId ?? 'none'})`);
      return false;
    }
    const stopS = rt.stopS.get(to);
    if (stopS === undefined) {
      this.warn(`warp ${group}: route ${rt.id} has no stop '${to}'`);
      return false;
    }
    const L = this.npcs.get(g.leader);
    const curS = prev && prev.route === rt.id ? prev.s : L ? rt.line.project(L.x, L.z).s : 0;
    if (stopS < curS - 0.01) {
      this.warn(`warp ${group}: '${to}' lies behind the leader (s ${stopS.toFixed(1)} < ${curS.toFixed(1)}), ignored`);
      return false;
    }
    let w: Walker;
    if (prev && prev.route === rt.id && !prev.arrived && stopS < prev.targetS - 0.01) {
      // short of the target: the walker goes on from the stop
      w = createWalker({ npc: g.leader, route: rt, to: prev.to, s: stopS, speed: prev.speed, wait: prev.wait ?? undefined });
    } else {
      // at or beyond the target (or no live walker): the walk ends at the warp stop
      w = createWalker({ npc: g.leader, route: rt, to, s: stopS, speed: prev?.speed, wait: prev?.wait ?? undefined });
      w.arrived = true;
    }
    this.walkers.set(g.leader, w);
    g.route = rt.id;
    this.jumpDone(w, to, true);
    this.writeSlice();
    return true;
  }

  /**
   * The shared tail of a snap-ahead and a warp: the leader stands at the walker's pose, every
   * group it leads lands in its slots (no run), one `npc:arrived {skipped: true}`.
   */
  private jumpDone(w: Walker, at: string, emit: boolean): void {
    const L = this.ensureNpc(w.npc, w.x, w.z, w.yaw);
    L.x = w.x;
    L.z = w.z;
    L.yaw = w.yaw;
    L.speed = 0;
    for (const g of this.groups.values()) if (g.leader === w.npc) this.landMembers(g);
    if (emit) this.o.bus.emit('npc:arrived', { npc: w.npc, at, route: w.route, skipped: true });
  }

  /** Every member straight into its slot (hold keeps its mode, but lands around the leader too). */
  landMembers(g: GroupRt): void {
    const slots = this.slotsFor(g, g.mode === 'hold' ? 'follow' : g.mode);
    const pos = g.members.map((m) => this.npcs.get(m) ?? this.ensureNpc(m, slots[0]?.x ?? 0, slots[0]?.z ?? 0));
    g.slots = slots;
    g.assign = assignSlots(pos, slots);
    pos.forEach((n, i) => {
      const sl = slots[g.assign[i]!];
      if (!sl) return;
      n.x = sl.x;
      n.z = sl.z;
      n.yaw = sl.yaw;
      n.speed = 0;
    });
    const tn = this.o.world.trunksNear;
    if (tn) for (const n of pos) pushOutOfTrunks(n, tn);
  }

  /** Snap every walking leader the player jumped far away from. */
  private snapAll(): void {
    const p = this.o.world.player();
    for (const w of this.walkers.values()) {
      if (w.arrived || Math.hypot(w.x - p.x, w.z - p.z) <= SNAP_DIST) continue;
      const r = snapAhead(w, p);
      if (!r) continue;
      this.jumpDone(w, r.at, true);
    }
    this.writeSlice();
  }

  /** Debug: snap a group's leader to a stop (same path as warp). */
  snap(group: string, stop: string): boolean {
    return this.warp(group, stop);
  }

  // ---- slots ---------------------------------------------------------------------------------

  private posOf(id: string | undefined): { x: number; z: number } | undefined {
    if (!id) return undefined;
    if (id === 'player') return this.o.world.player();
    return this.npcs.get(id);
  }

  private slotsFor(g: GroupRt, mode: Mode): Slot[] {
    const L = this.npcs.get(g.leader);
    if (!L) return [];
    const n = g.members.length;
    if (mode === 'gather') {
      const c = this.npcs.get(g.around ?? g.leader) ?? L;
      return gatherSlots(n, { x: c.x, z: c.z, yaw: c.yaw }, this.posOf(g.face ?? g.around ?? g.leader), g.r ?? [3, 7]);
    }
    return followSlots(n, { x: L.x, z: L.z, yaw: L.yaw }, g.spacing ?? [1.2, 4], hash(g.id));
  }

  private reslot(g: GroupRt): void {
    if (g.mode === 'hold') {
      g.slots = g.members.map((m) => {
        const n = this.npcs.get(m)!;
        return { x: n.x, z: n.z, yaw: n.yaw };
      });
      g.assign = g.members.map((_, i) => i);
      return;
    }
    const slots = this.slotsFor(g, g.mode);
    const pos = g.members.map((m) => this.npcs.get(m)!).filter(Boolean);
    g.assign = assignSlots(pos, slots, g.assign.length ? g.assign : undefined);
    g.slots = slots;
  }

  // ---- per step ------------------------------------------------------------------------------

  get era(): boolean {
    return this.o.world.era() === GROUP_ERA;
  }

  /** One fixed step: leash, walkers, members, slots (the bodies follow in `sync`, per drawn frame). */
  update(dt: number): void {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const p = this.o.world.player();
    const inEra = this.era;
    if (inEra !== this.active) {
      this.active = inEra;
      for (const n of this.npcs.values()) this.setVisible(n, inEra);
    }
    // jump: a teleport event, or the player moved > 20 m in one step
    const lp = this.lastPlayer;
    this.lastPlayer = { x: p.x, z: p.z };
    if (inEra) {
      this.now += dt;
      if (lp && Math.hypot(p.x - lp.x, p.z - lp.z) > JUMP_DIST) this.jumped = true;
    }
    if (this.jumped) {
      this.jumped = false;
      if (inEra) this.snapAll();
      delete this.o.slice().pendingTravelSnap;
    }
    if (!inEra) return;
    for (const w of this.walkers.values()) {
      const n = this.npcs.get(w.npc);
      if (this.isTalking(w.npc)) {
        // the player talks to the walker: it stands (and the group with it)
        if (n) n.speed = 0;
        continue;
      }
      // the player got to the stop first (cut a bent leg): the group is there when the guide is
      // out of sight anyway — snapped in, members in their slots, npc:arrived {skipped: true}
      if (earlyArrival(w, p)) {
        const was = w.waiting;
        arriveAtTarget(w);
        if (was) for (const g of this.groups.values()) if (g.leader === w.npc) this.o.bus.emit('group:resumed', { group: g.id, leader: w.npc });
        this.jumpDone(w, w.to, true);
        this.writeSlice();
        continue;
      }
      const evs = stepWalker(w, dt, p, this.now);
      if (n) {
        n.x = w.x;
        n.z = w.z;
        n.yaw = w.yaw;
        n.speed = w.speedNow;
      }
      for (const e of evs) this.walkEvent(w, e);
    }
    this.slotT += dt;
    const slotTick = this.slotT >= 1 / SLOT_HZ;
    if (slotTick) this.slotT = 0;
    for (const g of this.groups.values()) {
      if (slotTick || g.slots.length !== g.members.length) this.reslot(g);
      const paused = this.isTalking(g.leader);
      const speeds = memberSpeeds(this.npcs.get(g.leader)?.speed ?? 0);
      g.members.forEach((m, i) => {
        const n = this.npcs.get(m);
        const sl = g.slots[g.assign[i] ?? -1];
        if (!n || !sl) return;
        if (paused || g.mode === 'hold') {
          n.speed = 0;
          return;
        }
        const ox = n.x;
        const oz = n.z;
        n.speed = stepMember(n, sl, dt, speeds);
        const mx = n.x - ox;
        const mz = n.z - oz;
        n.yaw = n.speed > 0.05 && Math.hypot(mx, mz) > 1e-4 ? headingOf(mx, mz) : turnTo(n.yaw, sl.yaw, dt * 4);
      });
      if (slotTick && g.mode !== 'hold') {
        const pos = g.members.map((m) => this.npcs.get(m)!).filter(Boolean);
        const L = this.npcs.get(g.leader);
        // the leader (a copy) takes part in the separation without being pushed
        const all = L ? [...pos, { x: L.x, z: L.z }] : pos;
        separate(all, 0.6, 3);
        const tn = this.o.world.trunksNear;
        if (tn) for (const n of pos) pushOutOfTrunks(n, tn);
      }
    }
    this.saveT += dt;
    if (this.saveT >= 0.5) {
      this.saveT = 0;
      this.writeSlice();
    }
    if (t0) this.updateMs = performance.now() - t0;
  }

  private walkEvent(w: Walker, e: WalkEvent): void {
    const bus = this.o.bus;
    const groups = [...this.groups.values()].filter((g) => g.leader === w.npc && !g.implicit);
    switch (e.type) {
      case 'arrived':
        bus.emit('npc:arrived', { npc: w.npc, at: e.at, route: w.route, skipped: e.skipped });
        this.writeSlice();
        return;
      case 'waiting':
        for (const g of groups) bus.emit('group:waiting', { group: g.id, leader: w.npc, dist: Math.round(e.dist * 10) / 10 });
        return;
      case 'resumed':
        for (const g of groups) bus.emit('group:resumed', { group: g.id, leader: w.npc });
        return;
      case 'bark':
        // never during a conversation (the barks system also keeps quiet then)
        if (this.talking.size) return;
        bus.emit('walk:bark', { npc: w.npc, id: e.id });
        return;
    }
  }

  private setVisible(n: NpcRt, on: boolean): void {
    if (n.visible === on) return;
    n.visible = on;
    n.body?.setVisible(on);
  }

  /** Bodies follow the runtime: ground height, heading, speed, clip, distance culling. */
  sync(): void {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const p = this.o.world.player();
    const inEra = this.era;
    for (const n of this.npcs.values()) {
      const b = n.body;
      if (!b) continue;
      const vis = inEra && Math.hypot(n.x - p.x, n.z - p.z) < VIS_DIST;
      this.setVisible(n, vis);
      if (!vis) continue;
      if (this.isTalking(n.id)) {
        // in a conversation the npc system turns the body (face / lookAt / talk): hands off
        b.setSpeed(0);
        continue;
      }
      b.setPos(n.x, this.o.world.heightAt(n.x, n.z), n.z);
      b.face(n.yaw);
      b.setSpeed(n.speed);
      const clip: BodyClip = n.speed < 0.1 ? 'idle' : n.speed > 2.2 ? 'run' : 'walk';
      if (clip !== n.clip) {
        n.clip = clip;
        b.play(clip);
      }
    }
    if (t0) this.syncMs = performance.now() - t0;
  }

  // ---- save ----------------------------------------------------------------------------------

  serialize(): WalkSlice {
    const groups: GroupSave[] = [];
    for (const g of this.groups.values()) {
      if (g.implicit) continue;
      const gs: GroupSave = { group: g.id, leader: g.leader, members: [...g.members], mode: g.mode };
      if (g.around) gs.around = g.around;
      if (g.face) gs.face = g.face;
      if (g.r) gs.r = [...g.r];
      if (g.spacing) gs.spacing = [...g.spacing];
      if (g.route) gs.route = g.route;
      const L = this.npcs.get(g.leader);
      if (L) gs.at = [round(L.x), round(L.z), round(L.yaw)];
      groups.push(gs);
    }
    return { walkers: [...this.walkers.values()].map(serializeWalker), groups };
  }

  writeSlice(): void {
    const s = this.o.slice();
    const d = this.serialize();
    s.walkers = d.walkers;
    s.groups = d.groups;
  }

  /** Throw everything away and rebuild from the slice (no events; waiting walkers don't bark at once). */
  restore(): void {
    this.clear();
    const s = this.o.slice();
    for (const ws of s.walkers ?? []) {
      const w = restoreWalker(ws, (id) => this.route(id));
      if (!w) {
        this.warn(`restore: walker ${ws.npc} (route ${ws.route}) dropped`);
        continue;
      }
      // a restored waiting walker barks after the usual gap, not at once
      w.lastBark = this.now;
      this.walkers.set(w.npc, w);
      this.ensureNpc(w.npc, w.x, w.z, w.yaw);
    }
    for (const gs of s.groups ?? []) {
      let L = this.npcs.get(gs.leader);
      if (!L) {
        const at = gs.at ?? [this.o.world.player().x, this.o.world.player().z - 4, 0];
        L = this.ensureNpc(gs.leader, at[0], at[1], at[2]);
      }
      const g: GroupRt = { id: gs.group, leader: gs.leader, members: [...gs.members], mode: gs.mode, assign: [], slots: [] };
      if (gs.around) g.around = gs.around;
      if (gs.face) g.face = gs.face;
      if (gs.r) g.r = gs.r;
      if (gs.spacing) g.spacing = gs.spacing;
      if (gs.route) g.route = gs.route;
      const looks = memberLooks(g.members, this.specs(), g.leader);
      g.members.forEach((m, i) => this.ensureNpc(m, L!.x, L!.z, 0, looks[i]));
      this.groups.set(g.id, g);
      this.landMembers(g);
    }
    this.lastPlayer = null;
    this.jumped = s.pendingTravelSnap === true;
    this.sync();
  }

  clear(): void {
    for (const n of this.npcs.values()) n.body?.dispose();
    this.npcs.clear();
    this.walkers.clear();
    this.groups.clear();
    this.talking.clear();
  }

  // ---- finding the group (find.ts) -----------------------------------------------------------

  /** The nearest group's guide to the player (only groups, no implicit followers; none outside the group era). */
  nearestGuide(): { group: string; leader: string; x: number; z: number; dist: number } | null {
    if (!this.active) return null;
    const p = this.o.world.player();
    let best: { group: string; leader: string; x: number; z: number; dist: number } | null = null;
    for (const g of this.groups.values()) {
      if (g.implicit) continue;
      const n = this.npcs.get(g.leader);
      if (!n) continue;
      const dist = Math.hypot(n.x - p.x, n.z - p.z);
      if (!best || dist < best.dist) best = { group: g.id, leader: g.leader, x: n.x, z: n.z, dist };
    }
    return best;
  }

  /**
   * Where a player rejoining `group` lands: on the guide's route, FIND.behind m behind the group's
   * tail, facing along the route (yaw as the player's: radians, headingOf). Without a route: behind
   * the guide against his facing.
   */
  rejoinPose(group: string): { x: number; z: number; yaw: number } | null {
    const g = this.groups.get(group);
    const lead = g && this.npcs.get(g.leader);
    if (!g || !lead) return null;
    let tail = 0;
    for (const id of g.members) {
      const m = this.npcs.get(id);
      if (m) tail = Math.max(tail, Math.hypot(m.x - lead.x, m.z - lead.z));
    }
    const w = this.walkers.get(g.leader);
    if (w) {
      const at = w.line.pointAt(rejoinArc(w.s, tail));
      return { x: at.x, z: at.z, yaw: headingOf(at.dirX, at.dirZ) };
    }
    const back = Math.min(FIND.maxTail, tail) + FIND.behind;
    // headingOf(dx, dz) = atan2(-dx, -dz): forward is (-sin yaw, -cos yaw)
    return { x: lead.x + Math.sin(lead.yaw) * back, z: lead.z + Math.cos(lead.yaw) * back, yaw: lead.yaw };
  }

  // ---- debug ---------------------------------------------------------------------------------

  groupList():{ group: string; leader: string; at: string; waiting: boolean }[] {
    return [...this.groups.values()]
      .filter((g) => !g.implicit)
      .map((g) => {
        const w = this.walkers.get(g.leader);
        return { group: g.id, leader: g.leader, at: w ? (w.arrived ? w.to : atStop(w)) : '', waiting: !!w?.waiting };
      });
  }

  stats(): { bodies: number; visible: number; updateMs: number; syncMs: number } {
    let bodies = 0;
    let visible = 0;
    for (const n of this.npcs.values()) {
      if (!n.body) continue;
      bodies++;
      if (n.visible) visible++;
    }
    return { bodies, visible, updateMs: this.updateMs, syncMs: this.syncMs };
  }
}

type WalkOp = Extract<WalkRequest, { op: 'walk' }>;

/**
 * Member speeds against the leader's: the core's 1.6 / 2.4 m/s, raised so the group keeps up with
 * a faster leader (the story's 1.9 m/s pace, ×1.5 while the player is close behind = 2.85 m/s).
 */
export function memberSpeeds(leader: number): MemberSpeeds {
  if (leader <= MEMBER_SPEEDS.walk) return MEMBER_SPEEDS;
  return { ...MEMBER_SPEEDS, walk: leader * 1.1, catchUp: Math.max(MEMBER_SPEEDS.catchUp, leader * 1.5) };
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** The last stop the walker passed ('' before the first). */
function atStop(w: Walker): string {
  let at = '';
  for (const st of w.rt?.stops ?? []) if (st.s <= w.s + 0.01) at = st.id;
  return at;
}

function turnTo(a: number, b: number, k: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * Math.min(1, k);
}
