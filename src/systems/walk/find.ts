/**
 * Finding the group again (tour round 2, owner playtest: "lost the group and couldn't find it").
 * Pure logic, stepped by the walk system once per fixed step; no fail state, everything gentle:
 *
 *  - guide marker:  the guide on the compass (+ distance) while the player is far (> markerDist)
 *                   or the guide is behind the player (> behindDist and outside the view cone);
 *  - one call-out:  the guide calls once per stray episode („Hier drüben!“) when the player is
 *                   > callDist away or has been walking away for awaySeconds; the episode ends
 *                   when the player is back within episodeEnd;
 *  - „Zur Gruppe“:  after rejoinAfter seconds apart (or > rejoinDist) a prompt offers to hold the
 *                   Epoche key (Q / the touch Epoche button); held for `hold` s → rejoin: the
 *                   player is placed on the route just behind the group's tail.
 *
 * The leash itself (the guide waits when the player falls > r behind) is the walker's (walker.ts).
 * All thresholds live in FIND; `?nofind` or flag `walk.find` = false switches it off.
 */

export const FIND = {
  /** Show the guide marker beyond this distance (m; just under the leash's 25 m, so a waiting guide shows) … */
  markerDist: 24,
  /** … and hide it again within this one (hysteresis). */
  markerHide: 18,
  /** The marker also shows from this distance when the guide is out of the view cone. */
  behindDist: 15,
  /** Half view cone (deg): a guide farther off the heading than this counts as out of sight. */
  behindAngle: 65,
  /** One call-out per episode beyond this distance (m) … */
  callDist: 40,
  /** … or after walking away this long (s) while farther than awayDist. */
  awaySeconds: 10,
  awayDist: 25,
  /** The stray episode ends (a new call-out may come) when the player is back within this (m). */
  episodeEnd: 16,
  /** Offer „Zur Gruppe“ after this long apart (s, apart = farther than markerDist) … */
  rejoinAfter: 60,
  /** … or at once beyond this distance (m). */
  rejoinDist: 80,
  /** Hold the key this long (s) to rejoin. */
  hold: 1.2,
  /** The player lands this far (m) behind the group's last member, on the route. */
  behind: 4,
  /** The group's tail is assumed at most this far (m) behind the guide. */
  maxTail: 20,
} as const;

export type FindConfig = { -readonly [K in keyof typeof FIND]: number };

export interface FindState {
  /** The marker is up (hysteresis). */
  marker: boolean;
  /** Seconds apart (farther than markerDist), reset when back within markerHide. */
  apart: number;
  /** Seconds walking away (distance growing) while farther than awayDist. */
  away: number;
  /** The call-out of this episode was made. */
  called: boolean;
  /** The „Zur Gruppe“ prompt is up. */
  prompt: boolean;
  /** Seconds the key has been held while the prompt is up. */
  held: number;
  /** Distance of the last step (for walking away). */
  lastDist: number | null;
}

export interface FindInput {
  dt: number;
  /** Straight-line distance player ↔ guide (m). */
  dist: number;
  /** Grid bearing player → guide (deg, clockwise from north) and the player's heading (deg). */
  bearing: number;
  heading: number;
  /** The rejoin key is held this step. */
  holding: boolean;
  /** The player moves this step (walking away counts only then, not while the guide walks off). */
  moving?: boolean;
  /** Nothing may happen now (a conversation, a cinematic, the curtain …): timers pause, the prompt hides. */
  quiet?: boolean;
}

export interface FindOutput {
  /** Marker on the compass (null: none). */
  marker: { bearing: number; dist: number } | null;
  /** Make the call-out now (once per episode). */
  call: boolean;
  /** Show the „Zur Gruppe“ prompt. */
  prompt: boolean;
  /** 0 … 1 of the hold. */
  progress: number;
  /** Rejoin now. */
  rejoin: boolean;
}

export function createFindState(): FindState {
  return { marker: false, apart: 0, away: 0, called: false, prompt: false, held: 0, lastDist: null };
}

/** Signed smallest angle a − b in degrees (−180 … 180). */
export function angleDiff(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

export function stepFind(s: FindState, i: FindInput, cfg: FindConfig = FIND): FindOutput {
  const { dist, dt } = i;
  const offView = Math.abs(angleDiff(i.bearing, i.heading)) > cfg.behindAngle;
  // marker (hysteresis on the distance; out of sight counts from behindDist)
  if (dist > cfg.markerDist || (dist > cfg.behindDist && offView)) s.marker = true;
  else if (dist < cfg.markerHide && !(dist > cfg.behindDist && offView)) s.marker = false;
  // walking away: the distance grows while already a bit off
  const growing = s.lastDist !== null && dist > s.lastDist + 1e-3;
  s.lastDist = dist;
  if (!i.quiet) {
    if (dist > cfg.awayDist && growing && i.moving !== false) s.away += dt;
    else if (!growing) s.away = Math.max(0, s.away - dt);
    if (dist > cfg.markerDist) s.apart += dt;
  }
  if (dist < cfg.markerHide) s.apart = 0;
  if (dist < cfg.awayDist) s.away = 0;
  // the episode: one call-out until the player is back with the group
  let call = false;
  if (dist < cfg.episodeEnd) s.called = false;
  else if (!s.called && !i.quiet && (dist > cfg.callDist || s.away >= cfg.awaySeconds)) {
    s.called = true;
    call = true;
  }
  // „Zur Gruppe“: offered after a while apart or when far; gone once back within markerHide
  if (!s.prompt && (s.apart >= cfg.rejoinAfter || dist > cfg.rejoinDist)) s.prompt = true;
  else if (s.prompt && dist < cfg.markerHide) s.prompt = false;
  const prompt = s.prompt && !i.quiet;
  let rejoin = false;
  if (prompt && i.holding) {
    s.held += dt;
    if (s.held >= cfg.hold) {
      rejoin = true;
      s.held = 0;
      s.prompt = false;
      s.apart = 0;
      s.away = 0;
      s.called = false;
      s.marker = false;
      s.lastDist = null;
    }
  } else s.held = 0;
  return {
    marker: s.marker && !rejoin ? { bearing: i.bearing, dist } : null,
    call,
    prompt: prompt && !rejoin,
    progress: Math.min(1, s.held / cfg.hold),
    rejoin,
  };
}

/**
 * Arc length on the guide's route where a rejoining player lands: `behind` m behind the group's
 * tail (`tail` = the member farthest from the guide, capped at maxTail), never before the start.
 */
export function rejoinArc(guideS: number, tail: number, cfg: FindConfig = FIND): number {
  return Math.max(0, guideS - Math.min(cfg.maxTail, Math.max(0, tail)) - cfg.behind);
}

/** Where „Der Gruppe folgen“ leads (playtest 2026-11-28: the marker at the next stop led over a bank). */
export const LEAD = {
  /** A story objective this close (m) to the stop the guide walks to is the follow objective. */
  stopMatch: 8,
  /** The marker sits at most this far (m) along the route ahead of the player. */
  lookahead: 20,
  /** Farther than this (m) off the route, the marker first leads back onto it. */
  offRoute: 10,
} as const;

/** A route for the lead: the nearest point on it, a point at an arc length. */
export interface LeadLine {
  project(x: number, z: number): { s: number; dist: number };
  pointAt(s: number): { x: number; z: number };
}

/**
 * The marker point that leads the player to the group along its route (walkable by construction,
 * the guide walks it): `guideS` is the guide's arc length, `tail` how far (m) the last member walks
 * behind him. Behind the group, the marker rides the route up to `lookahead` m ahead of the player,
 * never past the tail; off the route it first leads to the route's nearest point; with the group
 * it sits on the guide. A player ahead of the guide gets null (the stop itself leads).
 */
export function groupLeadPoint(line: LeadLine, guideS: number, tail: number, player: { x: number; z: number }, cfg: typeof LEAD = LEAD): { x: number; z: number } | null {
  const pr = line.project(player.x, player.z);
  // off the route first (its projection says little about ahead / behind there)
  if (pr.dist > cfg.offRoute) {
    const p = line.pointAt(Math.min(pr.s, guideS));
    return { x: p.x, z: p.z };
  }
  if (pr.s > guideS + 1) return null;
  const tailS = Math.max(0, guideS - Math.max(0, tail));
  const s = pr.s >= tailS ? guideS : Math.min(tailS, pr.s + cfg.lookahead);
  const p = line.pointAt(s);
  return { x: p.x, z: p.z };
}
