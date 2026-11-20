/**
 * The walker state machine (pure): one npc walks along a route (to a named stop) or a raw path
 * (to its end), waits for the player on a leash with hysteresis, hurries when the player is close
 * behind, and reports arrival exactly once. The caller turns the WalkEvents into bus events
 * (`npc:arrived`, `group:waiting`, `group:resumed`) and bark requests.
 *
 * Yaw convention: `yaw` is a heading, `yaw = atan2(-dx, -dz)` for a move by (dx, dz): 0 = facing
 * −z (north), +π/2 = facing −x (west) — the player/camera convention (player.yaw, npc/index.ts). A figure's
 * `rotation.y` (figures face +z at 0, see npc/logic.ts `yawToward`) is `yaw + π`: use `figureYaw()`.
 */
import { Polyline, buildRoute, type BuiltRoute } from './route';
import type { Route, WalkWait, WalkerSave } from './types';

export const WALK_SPEED = 1.6;
/** Speed factor while the player is close behind. */
export const CATCH_UP = 1.5;
/** "Close behind": within this many metres and not ahead of the walker. */
export const CATCH_UP_DIST = 6;
/** Default resume distance = r − this. */
export const RESUME_GAP = 13;
/** At most one come-along bark per this many seconds while waiting. */
export const BARK_EVERY = 20;

export type WalkEvent =
  | { type: 'arrived'; at: string; skipped: boolean }
  | { type: 'waiting'; dist: number }
  | { type: 'resumed' }
  | { type: 'bark'; id: string };

export interface Walker {
  npc: string;
  /** Route id, '' for a raw path. */
  route: string;
  /** Target stop id ('end' for a raw path). */
  to: string;
  line: Polyline;
  /** The built route (stops for snapAhead); null for a raw path. */
  rt: BuiltRoute | null;
  /** Raw path points (kept for the save). */
  path: [number, number][] | null;
  targetS: number;
  s: number;
  speed: number;
  wait: WalkWait | null;
  waiting: boolean;
  arrived: boolean;
  /** `now` of the last bark (−Infinity: none yet). */
  lastBark: number;
  // pose, updated by stepWalker / snapAhead / restore
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  speedNow: number;
}

export interface WalkerInit {
  npc: string;
  /** A built route or a route file; with `to`. */
  route?: BuiltRoute | Route;
  to?: string;
  path?: [number, number][];
  speed?: number;
  wait?: WalkWait;
  /** Start at this arc length (default 0, or the projection of `from`). */
  s?: number;
  from?: { x: number; z: number };
}

const isBuilt = (r: BuiltRoute | Route): r is BuiltRoute => (r as BuiltRoute).line instanceof Polyline;

export function createWalker(init: WalkerInit): Walker {
  let line: Polyline;
  let rt: BuiltRoute | null = null;
  let targetS: number;
  let to: string;
  let path: [number, number][] | null = null;
  if (init.route) {
    rt = isBuilt(init.route) ? init.route : buildRoute(init.route);
    line = rt.line;
    to = init.to ?? rt.stops[rt.stops.length - 1]?.id ?? 'end';
    const ts = rt.stopS.get(to);
    if (ts === undefined && to !== 'end') throw new Error(`walker ${init.npc}: route ${rt.id} has no stop '${to}'`);
    targetS = ts ?? line.length;
  } else if (init.path && init.path.length >= 1) {
    path = init.path.map((p) => [p[0], p[1]] as [number, number]);
    line = new Polyline(path);
    to = 'end';
    targetS = line.length;
  } else throw new Error(`walker ${init.npc}: needs a route or a path`);
  const s0 = init.s ?? (init.from ? line.project(init.from.x, init.from.z).s : 0);
  const w: Walker = {
    npc: init.npc,
    route: rt?.id ?? '',
    to,
    line,
    rt,
    path,
    targetS,
    s: Math.max(0, Math.min(line.length, s0)),
    speed: init.speed ?? WALK_SPEED,
    wait: init.wait ?? null,
    waiting: false,
    arrived: false,
    lastBark: -Infinity,
    x: 0,
    z: 0,
    yaw: 0,
    moving: false,
    speedNow: 0,
  };
  placeAt(w, w.s, 1);
  return w;
}

/** The resume distance of a leash (always ≤ r, so the hysteresis band is never negative). */
export function resumeDist(wait: WalkWait): number {
  return Math.max(0, Math.min(wait.r, wait.resume ?? wait.r - RESUME_GAP));
}

/** Heading for a move by (dx, dz): 0 = −z. */
export const headingOf = (dx: number, dz: number): number => Math.atan2(-dx, -dz);
/** A figure's rotation.y (faces +z at 0) for a heading. */
export const figureYaw = (yaw: number): number => yaw + Math.PI;

const pt = { x: 0, z: 0, dirX: 0, dirZ: -1 };
function placeAt(w: Walker, s: number, sign: number): void {
  w.s = s;
  w.line.pointAt(s, pt);
  w.x = pt.x;
  w.z = pt.z;
  w.yaw = headingOf(pt.dirX * sign, pt.dirZ * sign);
}

function arrive(w: Walker, skipped: boolean, out: WalkEvent[]): void {
  if (w.arrived) return;
  w.arrived = true;
  w.waiting = false;
  w.moving = false;
  w.speedNow = 0;
  out.push({ type: 'arrived', at: w.to, skipped });
}

/**
 * One tick. `now` is a clock in seconds (only used for the bark throttle). Returns the events of
 * this tick, in order.
 */
export function stepWalker(w: Walker, dt: number, player: { x: number; z: number }, now: number): WalkEvent[] {
  const out: WalkEvent[] = [];
  if (w.arrived) {
    w.moving = false;
    w.speedNow = 0;
    return out;
  }
  const dx = player.x - w.x;
  const dz = player.z - w.z;
  const dist = Math.hypot(dx, dz);
  if (w.wait) {
    if (!w.waiting && dist > w.wait.r) {
      w.waiting = true;
      out.push({ type: 'waiting', dist });
      if (w.wait.bark) {
        out.push({ type: 'bark', id: w.wait.bark });
        w.lastBark = now;
      }
    } else if (w.waiting && dist <= resumeDist(w.wait)) {
      w.waiting = false;
      out.push({ type: 'resumed' });
    } else if (w.waiting && w.wait.bark && now - w.lastBark >= BARK_EVERY) {
      out.push({ type: 'bark', id: w.wait.bark });
      w.lastBark = now;
    }
  }
  if (w.waiting) {
    // stand and turn round to the player
    w.moving = false;
    w.speedNow = 0;
    if (dist > 0.01) w.yaw = headingOf(dx, dz);
    return out;
  }
  const gap = w.targetS - w.s;
  if (Math.abs(gap) < 1e-6) {
    arrive(w, false, out);
    return out;
  }
  const sign = gap > 0 ? 1 : -1;
  w.line.pointAt(w.s, pt);
  // player close and not ahead of the walker (along its walking direction): don't dawdle
  const along = (dx * pt.dirX + dz * pt.dirZ) * sign;
  const v = w.speed * (dist <= CATCH_UP_DIST && along <= 0 ? CATCH_UP : 1);
  const step = Math.min(Math.abs(gap), v * dt);
  placeAt(w, w.s + sign * step, sign);
  w.moving = step > 0;
  w.speedNow = dt > 0 ? step / dt : 0;
  if (Math.abs(w.targetS - w.s) < 1e-6) {
    w.s = w.targetS;
    arrive(w, false, out);
  }
  return out;
}

/**
 * Teleport/skip: put the walker at the stop at or ahead of its position (never behind) closest
 * to the player, clamped to the target. Reaching the target marks arrival (`skipped: true`).
 * Returns null when there is nothing ahead to snap to (already arrived, or target behind).
 */
export function snapAhead(w: Walker, player: { x: number; z: number }): { at: string; events: WalkEvent[] } | null {
  if (w.arrived || w.targetS < w.s - 0.01) return null;
  const cands: { id: string; s: number; x: number; z: number }[] = [];
  if (w.rt) {
    for (const st of w.rt.stops) if (st.s >= w.s - 0.01 && st.s <= w.targetS + 0.01) cands.push(st);
  }
  if (!cands.some((c) => Math.abs(c.s - w.targetS) < 0.01)) {
    const e = w.line.pointAt(w.targetS);
    cands.push({ id: w.to, s: w.targetS, x: e.x, z: e.z });
  }
  let best = cands[0]!;
  let bestD = Infinity;
  for (const c of cands) {
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  const events: WalkEvent[] = [];
  const s = Math.max(w.s, Math.min(best.s, w.targetS));
  placeAt(w, s, 1);
  w.waiting = false;
  w.moving = false;
  w.speedNow = 0;
  if (s >= w.targetS - 0.01) {
    w.s = w.targetS;
    arrive(w, true, events);
    return { at: w.to, events };
  }
  return { at: best.id, events };
}

export function serializeWalker(w: Walker): WalkerSave {
  const out: WalkerSave = { npc: w.npc, route: w.route, to: w.to, s: Math.round(w.s * 1000) / 1000, waiting: w.waiting };
  if (w.speed !== WALK_SPEED) out.speed = w.speed;
  if (w.wait) out.wait = { ...w.wait };
  if (w.path) out.path = w.path.map((p) => [p[0], p[1]] as [number, number]);
  return out;
}

/**
 * Rebuild a walker from its save. `resolve` maps a route id to the route (built or file); a raw
 * path walker carries its points. Returns null when the route is gone. No event is re-emitted;
 * a walker saved at its target comes back as arrived. `opts` override the saved speed / leash.
 */
export function restoreWalker(
  save: WalkerSave,
  resolve: (route: string) => BuiltRoute | Route | undefined,
  opts: { speed?: number; wait?: WalkWait } = {},
): Walker | null {
  let w: Walker;
  const speed = opts.speed ?? save.speed;
  const wait = opts.wait ?? save.wait;
  try {
    if (save.route) {
      const r = resolve(save.route);
      if (!r) return null;
      w = createWalker({ npc: save.npc, route: r, to: save.to, s: save.s, speed, wait });
    } else if (save.path) w = createWalker({ npc: save.npc, path: save.path, s: save.s, speed, wait });
    else return null;
  } catch {
    return null;
  }
  w.waiting = !!save.waiting && !!w.wait;
  if (Math.abs(w.targetS - w.s) < 1e-3) {
    w.s = w.targetS;
    w.arrived = true;
    w.waiting = false;
  }
  return w;
}
