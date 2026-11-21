/**
 * Feature "walk" (WP-16, design contract C2 in docs/design/tour/systems.md): the tour group.
 * Gerold Imhoff (placeholder guide) walks a route stop by stop, the group follows in a loose
 * cluster, gathers in a half circle at a stop, waits for the player on a leash, snaps ahead when
 * the player jumps far away, warps on a story fade. Exists only in era `today`.
 *
 * Story → walk:  'npc:walk' WalkRequest (group / follow / walk / gather / hold / release /
 *                despawn / warp); also 'story:cue' {id: 'walk', data: WalkRequest} until the
 *                story's own dispatch lands.
 * walk → world:  'npc:arrived' {npc, at, route, skipped}, 'group:waiting' {group, leader, dist},
 *                'group:resumed' {group, leader}, 'walk:bark' {npc, id} (the barks system speaks
 *                lines with `trigger: {event: 'walk:bark', id}`).
 * Listens:       'npc:conversation' (a walker the player talks to stands, its group too; no bark
 *                while any conversation is open), 'player:teleport' (snap), 'save:loaded'.
 * Bodies:        `ctx.people` (kq-characters' people API) when present, else stand-ins (bodies.ts).
 * Persistent:    slice `walk` (walkers, groups). Routes: content/routes/*.json (bundled).
 * Debug/test API: window.kq.walk (WalkHooks).
 */
import { defineSystem } from '../../core/systems';
import type { GameContext } from '../../core/context';
import { StandInPool, peopleOf, peopleSpecs, personBody } from './bodies';
import { PEOPLE_SPECS, WalkRuntime, type BodyFactory, type WalkBus } from './runtime';
import type { Route, WalkSlice } from './types';

declare module '../../core/state' {
  interface SystemStates {
    walk: WalkSlice;
  }
}

export interface WalkHooks {
  /** Walk an npc along a route to a stop (spawns it at the route start when new). */
  go(npc: string, route: string, to: string, opts?: { speed?: number; wait?: { r: number; resume?: number; bark?: string } }): void;
  /** Snap a group's leader to a stop (the warp path: never backward, members land in their slots). */
  snap(group: string, stop: string): boolean;
  groups(): { group: string; leader: string; at: string; waiting: boolean }[];
  /** Guide + 14 members at the car park, follow, walk to `to` (default 'abzweig') with the leash. */
  demo(opts?: { to?: string; speed?: number; r?: number }): void;
  stats(): { bodies: number; visible: number; ms: number; updateMs: number; syncMs: number; people: boolean };
  /** Every npc the walk system holds (position, speed, visible). */
  list(): { npc: string; spec: string; x: number; z: number; yaw: number; speed: number; visible: boolean }[];
  /** Walker state of an npc. */
  walker(npc: string): { route: string; to: string; s: number; targetS: number; waiting: boolean; arrived: boolean; x: number; z: number } | null;
  request(r: unknown): void;
  /** Rebuild from the slice (as after a load). */
  restore(): void;
}

declare module '../../debug/hooks' {
  interface KqHooks {
    walk?: WalkHooks;
  }
}

/** Provisional group pace of the story team (m/s). */
export const DEMO_SPEED = 1.9;
export const DEMO_MEMBERS = [
  'double.herzog',
  'double.mannlich',
  'double.hanne',
  'double.peter',
  'double.jost',
  'double.soll',
  'double.liese',
  'extra.mats',
  'extra.mutter',
  'extra.paar_a',
  'extra.paar_b',
  'extra.wanderin_a',
  'extra.wanderin_b',
  'extra.student',
];

/** All route files bundled by Vite (content/routes/*.json). */
export function loadRoutes(): Map<string, Route> {
  const mods = import.meta.glob<Route>('/content/routes/*.json', { eager: true, import: 'default' });
  const out = new Map<string, Route>();
  for (const r of Object.values(mods)) if (r && typeof r.id === 'string') out.set(r.id, r);
  return out;
}

class WalkSystem {
  readonly rt: WalkRuntime;
  private pool: StandInPool | null = null;
  private hooks = false;
  private frameMs = 0;

  constructor(private readonly ctx: GameContext) {
    const routes = loadRoutes();
    const bodies: BodyFactory = (o) => {
      const api = peopleOf(ctx);
      if (api) return personBody(api, o);
      this.pool ??= new StandInPool(ctx.scene);
      return this.pool.factory(o);
    };
    const forest = ctx.world.forest;
    this.rt = new WalkRuntime({
      bus: ctx.events as unknown as WalkBus,
      bodies,
      routes,
      slice: () => this.slice,
      specs: () => {
        const api = peopleOf(ctx);
        return (api && peopleSpecs(api)) || PEOPLE_SPECS;
      },
      world: {
        heightAt: (x, z) => ctx.world.heightAt(x, z),
        trunksNear: forest ? forest.trunksNear.bind(forest) : undefined,
        player: () => ctx.player.position,
        era: () => ctx.era.current,
      },
    });
    ctx.events.on('save:loaded', () => this.rt.restore());
    this.rt.restore();
  }

  get slice(): WalkSlice {
    const s = this.ctx.state.slice('walk', () => ({ walkers: [], groups: [] }));
    if (!Array.isArray(s.walkers)) s.walkers = [];
    if (!Array.isArray(s.groups)) s.groups = [];
    return s;
  }

  update(dt: number): void {
    if (!this.hooks && window.kq) this.installHooks();
    this.rt.update(dt);
  }

  frame(dt: number): void {
    if (!this.hooks && window.kq) this.installHooks();
    const t0 = performance.now();
    this.rt.sync();
    if (this.pool) {
      const c = this.ctx.camera.position;
      this.pool.tick(dt, { x: c.x, z: c.z });
    }
    this.frameMs = performance.now() - t0;
  }

  private installHooks(): void {
    const kq = window.kq;
    if (!kq) return;
    this.hooks = true;
    const rt = this.rt;
    kq.walk = {
      go: (npc, route, to, opts) => rt.request({ op: 'walk', npc, route, to, speed: opts?.speed, wait: opts?.wait ? { for: 'player', ...opts.wait } : undefined }),
      snap: (group, stop) => rt.snap(group, stop),
      groups: () => rt.groupList(),
      demo: (opts) => {
        const to = opts?.to ?? 'abzweig';
        const start = rt.route('p-fuehrung')?.stops[0];
        if (start && !rt.npcs.has('imhoff')) rt.ensureNpc('imhoff', start.x, start.z, Math.PI);
        rt.request({ op: 'group', group: 'fuehrung', leader: 'imhoff', members: DEMO_MEMBERS, era: 'today' });
        rt.request({ op: 'follow', group: 'fuehrung', leader: 'imhoff' });
        rt.request({ op: 'walk', npc: 'imhoff', route: 'p-fuehrung', to, speed: opts?.speed ?? DEMO_SPEED, wait: { for: 'player', r: opts?.r ?? 25, bark: 'imhoff.bark.wait' } });
      },
      stats: () => {
        const s = rt.stats();
        return { ...s, ms: s.updateMs + this.frameMs, people: !!peopleOf(this.ctx) };
      },
      list: () => [...rt.npcs.values()].map((n) => ({ npc: n.id, spec: n.spec, x: n.x, z: n.z, yaw: n.yaw, speed: n.speed, visible: n.visible })),
      walker: (npc) => {
        const w = rt.walkers.get(npc);
        return w ? { route: w.route, to: w.to, s: w.s, targetS: w.targetS, waiting: w.waiting, arrived: w.arrived, x: w.x, z: w.z } : null;
      },
      request: (r) => rt.request(r as Parameters<WalkRuntime['request']>[0]),
      restore: () => rt.restore(),
    };
  }

  dispose(): void {
    this.rt.clear();
    this.pool?.dispose();
    this.pool = null;
  }
}

let sys: WalkSystem | null = null;

export default defineSystem({
  id: 'walk',
  after: ['people', 'npc'],
  init(ctx) {
    sys = new WalkSystem(ctx);
  },
  update(dt) {
    sys?.update(dt);
  },
  frame(dt) {
    sys?.frame(dt);
  },
  dispose() {
    sys?.dispose();
    sys = null;
  },
});
