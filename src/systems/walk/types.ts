/**
 * Tour walk (WP-16, design contract C2): the request shapes the story sends on `npc:walk`, the
 * events the walk system answers with, the route file shape and the save slice. Pure types; the
 * story imports them type-only.
 */

/** Wait for the player: stop when the player is farther than r, go on when back within resume (default r − 13). */
export interface WalkWait { for: 'player'; r: number; resume?: number; bark?: string }
export interface WalkOp { op: 'walk'; npc: string; route?: string; to?: string; path?: [number, number][]; speed?: number; wait?: WalkWait }
export interface GroupOp { op: 'group'; group: string; members: string[]; leader: string; spacing?: [number, number]; era?: 'today' }
export interface FollowOp { op: 'follow'; npc?: string; group?: string; leader: string; spacing?: number; off?: boolean }
export interface GatherOp { op: 'gather' | 'hold' | 'release'; group: string; around?: string; face?: string; r?: [number, number] }
export interface GroupDespawnOp { op: 'despawn'; group: string }
/**
 * Fade transition (story): snap the group's leader to stop `to` (its walker's route, or `route`
 * when the leader has no live walker) and land the members in their slots at once. Never backward
 * along the route; may jump past the walker's target (it then arrives there). Emits
 * `npc:arrived {skipped: true}` once. The player is not moved.
 */
export interface WarpOp { op: 'warp'; group: string; to: string; route?: string }
export type WalkRequest = WalkOp | GroupOp | FollowOp | GatherOp | GroupDespawnOp | WarpOp;
/** content/routes/<id>.json: named stops along a polyline (local metres, x east, z south). */
export interface Route { id: string; stops: { id: string; x: number; z: number }[]; points: [number, number][] }

/** One walker in the save: `s` = metres along the polyline. `path` only for raw-path walkers (route = ''). */
export interface WalkerSave {
  npc: string;
  route: string;
  to: string;
  s: number;
  waiting: boolean;
  path?: [number, number][];
  /** Only when not the default 1.6 m/s. */
  speed?: number;
  wait?: WalkWait;
}
export interface GroupSave {
  group: string;
  leader: string;
  members: string[];
  mode: 'follow' | 'gather' | 'hold';
  around?: string;
  face?: string;
  /** Leader pose [x, z, yaw] (a leader without a walker has nowhere else to come back to). */
  at?: [number, number, number];
  /** The leader's last route (warp without a live walker). */
  route?: string;
  /** Gather radii / follow spacing when not the default. */
  r?: [number, number];
  spacing?: [number, number];
}
/** Save slice of the walk system: its own `SystemStates` key `walk` (src/systems/walk/index.ts). */
export interface WalkSlice { walkers: WalkerSave[]; groups: GroupSave[] }

declare module '../../core/events' {
  interface GameEvents {
    /** Request: walk / group / follow / gather / hold / release / despawn. Owner: story → walk system. */
    'npc:walk': WalkRequest;
    /** at = the stop id (route) or 'end' (raw path); skipped = reached by a snap, not on foot. */
    'npc:arrived': { npc: string; at: string; route: string; skipped: boolean };
    /** The group's leader stopped because the player fell behind (dist = metres to the player). */
    'group:waiting': { group: string; leader: string; dist: number };
    /** The player caught up; the leader walks on. */
    'group:resumed': { group: string; leader: string };
    /**
     * A come-along bark from a waiting walker (`wait.bark`, a line-group id such as
     * 'imhoff.bark.wait'). The barks system picks it up like any event: bark lines with
     * `trigger: { event: 'walk:bark', id: 'imhoff.bark.wait' }` (ids `imhoff.bark.wait.NN`).
     * Never sent during a conversation; at most every 20 s per walker.
     */
    'walk:bark': { npc: string; id: string };
  }
}
