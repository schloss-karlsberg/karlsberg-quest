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
 * Bodies:        `ctx.people` (kq-characters' people API) is required; without it no bodies spawn
 *                (one console.error), the walk logic, events and slice run on bodiless (bodies.ts).
 * Finding:       find.ts: the guide on the compass when far / out of sight, one call-out per stray
 *                episode ('walk:bark' {id: '<speaker>.bark.hier'}), the „Zur Gruppe“ hold (Q /
 *                Epoche) → 'group:rejoin' {x, z, yaw} (the story fades and teleports). Off with
 *                `?nofind` or flag `walk.find` = false.
 * Persistent:    slice `walk` (walkers, groups). Routes: content/routes/*.json (bundled).
 * Debug/test API: window.kq.walk (WalkHooks).
 */
import { defineSystem } from '../../core/systems';
import type { GameContext } from '../../core/context';
import { t } from '../../i18n';
import { actionLabel } from '../../ui/actionLabel';
import { peopleOf, peopleSpecs, walkBodies } from './bodies';
import { createFindState, stepFind, type FindState } from './find';
import { PEOPLE_SPECS, WalkRuntime, speakerFor, type WalkBus } from './runtime';
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
  stats(): { bodies: number; visible: number; ms: number; updateMs: number; syncMs: number; people: boolean; peopleApi: boolean };
  /** Every npc the walk system holds (position, speed, visible). */
  list(): { npc: string; spec: string; x: number; z: number; yaw: number; speed: number; visible: boolean }[];
  /** Walker state of an npc. */
  walker(npc: string): { route: string; to: string; s: number; targetS: number; waiting: boolean; arrived: boolean; x: number; z: number } | null;
  request(r: unknown): void;
  /** Finding the group: marker / prompt state and the last decision (tests). */
  find(): { group: string | null; dist: number | null; marker: boolean; prompt: boolean; called: boolean; apart: number; progress: number };
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

/** Compass marker id of the guide (find.ts). */
const GUIDE_MARKER = 'walk.guide';
/** Line-group id suffix of the call-out („Hier drüben!“): '<speaker>.bark.hier'. */
export const CALL_SUFFIX = '.bark.hier';

class WalkSystem {
  readonly rt: WalkRuntime;
  private hooks = false;
  private frameMs = 0;
  private readonly findState: FindState = createFindState();
  private findGroup: string | null = null;
  private findDist: number | null = null;
  private findProgress = 0;
  private markerUp = false;
  private promptUp = false;
  private cinematic = false;
  private lastFindPos: { x: number; z: number } | null = null;
  private readonly findOff: boolean;

  constructor(private readonly ctx: GameContext) {
    const routes = loadRoutes();
    const bodies = walkBodies(() => peopleOf(ctx));
    const forest = ctx.world.forest;
    // The authored trail slots stay clear at every graphics tier, including scattered boulders.
    for (const stop of routes.get('p-fuehrung')?.stops ?? []) {
      for (const [x, z] of stop.slots ?? []) ctx.world.nature.props.addClearing(x, z, 2, ['today']);
      // … and what a stop is about can be seen from the path (the deer's grazing spot)
      for (const [x, z, r] of stop.glades ?? []) ctx.world.nature.props.addClearing(x, z, r, ['today']);
    }
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
        reducedMotion: () => ctx.settings.state.reducedMotion,
      },
    });
    ctx.tourCrowd.visitors = () => this.rt.tourVisitors();
    ctx.tourCrowd.lead = (x, z) => this.rt.leadFor(x, z);
    ctx.events.on('save:loaded', () => this.rt.restore());
    ctx.events.on('cinematic:play', () => (this.cinematic = true));
    ctx.events.on('cinematic:end', () => (this.cinematic = false));
    this.findOff = ctx.params.has('nofind');
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
    this.updateFind(dt);
  }

  /** Finding the group (find.ts): marker, call-out, „Zur Gruppe“. */
  private updateFind(dt: number): void {
    const ctx = this.ctx;
    const g = this.findOff || ctx.state.state.flags['walk.find'] === false ? null : this.rt.nearestGuide();
    if (!g) {
      this.findGroup = null;
      this.findDist = null;
      this.showFind(null, false);
      Object.assign(this.findState, createFindState());
      return;
    }
    if (g.group !== this.findGroup) Object.assign(this.findState, createFindState());
    this.findGroup = g.group;
    this.findDist = g.dist;
    const p = ctx.player.position;
    const bearing = ((Math.atan2(g.x - p.x, -(g.z - p.z)) * 180) / Math.PI + 360) % 360;
    const heading = ((-ctx.player.yaw * 180) / Math.PI + 360) % 360;
    const quiet = this.cinematic || this.rt.isTalking(g.leader) || ctx.player.frozen;
    const moved = this.lastFindPos ? Math.hypot(p.x - this.lastFindPos.x, p.z - this.lastFindPos.z) : 0;
    this.lastFindPos = { x: p.x, z: p.z };
    const moving = dt > 0 && moved / dt > 0.4;
    const out = stepFind(this.findState, { dt, dist: g.dist, bearing, heading, holding: ctx.input.isDown('shift'), moving, quiet });
    this.findProgress = out.progress;
    if (out.call) ctx.events.emit('walk:bark', { npc: g.leader, id: `${speakerFor(g.leader) ?? g.leader}${CALL_SUFFIX}` });
    this.showFind(out.marker, out.prompt, g.group);
    if (out.rejoin) {
      const pose = this.rt.rejoinPose(g.group);
      if (!pose) return;
      ctx.events.emit('group:rejoin', { group: g.group, ...pose });
      // nobody fades (no story): go at once
      if (!ctx.systems.get('story')) ctx.player.teleport(pose.x, pose.z, pose.yaw);
    }
  }

  private showFind(marker: { bearing: number; dist: number } | null, prompt: boolean, group = this.findGroup ?? ''): void {
    const hud = this.ctx.ui.hud;
    if (marker) {
      hud.setMarker(GUIDE_MARKER, marker.bearing, undefined, { dist: marker.dist, edge: true, label: 'Gruppe', kind: 'obj', labelRow: 2 });
      this.markerUp = true;
    } else if (this.markerUp) {
      hud.setMarker(GUIDE_MARKER, null);
      this.markerUp = false;
    }
    if (prompt !== this.promptUp) {
      this.promptUp = prompt;
      const touch = this.ctx.input.touchMode;
      if (prompt) hud.prompt(actionLabel(this.ctx.input, 'shift', 0, 'KeyQ'), touch ? t('action.regroup.hold') : 'Gedrückt halten: zur Gruppe', 'walk');
      else hud.prompt(null, undefined, 'walk');
      this.ctx.events.emit('group:find', { group, prompt });
    }
  }

  frame(_dt: number): void {
    if (!this.hooks && window.kq) this.installHooks();
    const t0 = performance.now();
    this.rt.sync();
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
        return { ...s, ms: s.updateMs + this.frameMs, people: !!peopleOf(this.ctx), peopleApi: !!peopleOf(this.ctx) };
      },
      list: () => [...rt.npcs.values()].map((n) => ({ npc: n.id, spec: n.spec, x: n.x, z: n.z, yaw: n.yaw, speed: n.speed, visible: n.visible })),
      walker: (npc) => {
        const w = rt.walkers.get(npc);
        return w ? { route: w.route, to: w.to, s: w.s, targetS: w.targetS, waiting: w.waiting, arrived: w.arrived, x: w.x, z: w.z } : null;
      },
      request: (r) => rt.request(r as Parameters<WalkRuntime['request']>[0]),
      find: () => ({
        group: this.findGroup,
        dist: this.findDist === null ? null : Math.round(this.findDist * 10) / 10,
        marker: this.markerUp,
        prompt: this.promptUp,
        called: this.findState.called,
        apart: Math.round(this.findState.apart * 10) / 10,
        progress: this.findProgress,
      }),
      restore: () => rt.restore(),
    };
  }

  dispose(): void {
    delete this.ctx.tourCrowd.visitors;
    delete this.ctx.tourCrowd.lead;
    this.rt.clear();
  }

  visitTourMembers(visit: (x: number, z: number, guide: boolean) => void): void {
    this.rt.visitTourMembers(visit);
  }
}

let sys: WalkSystem | null = null;

export function visitTourMembers(visit: (x: number, z: number, guide: boolean) => void): void {
  sys?.visitTourMembers(visit);
}

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
