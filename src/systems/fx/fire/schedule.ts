/**
 * The fire of 28 July 1793 as a schedule over the real rooms (catalogue v2 room polygons) and
 * building footprints. Pure and deterministic (unit-tested).
 *
 * Spread = Dijkstra over a room graph (rooms of one storey that touch, rooms stacked above each
 * other, buildings that touch), clamped to the story bible's timeline (content/bible/
 * 04-kapitel-3.md §9, "Teil B"): EG of the Corps de logis and the north wing at 0 s, whole EG of
 * B01–B03 by 30 s, upper floors via the Prunktreppe from 90 s, Sammlungsflügel 180/210 s, gallery
 * from its west end at 240 s, Tempelzimmer 270 s, kitchen wing last (~300 s). Stone stair halls
 * and vaults ignite later. All times are on a 300 s base and scaled to the configured duration.
 */
import type { Footprint, Room } from '../../../data/types';
import { type Poly, area, centroid, distToPolygon, polygonGap, polygonsOverlap } from '../geom';

/** Length (s) of the bible's fire timeline; schedules are scaled from this to `seconds`. */
export const FIRE_BASE_SECONDS = 300;

export type UnitState = 'none' | 'smoke' | 'burning' | 'collapsed';

export interface FireUnit {
  /** Room id (`KB-B01/B01.2.og-festsaal`) or footprint id (`KB-B37`). */
  id: string;
  kind: 'room' | 'building';
  building: string;
  storey: number;
  polygon: Poly;
  cx: number;
  cz: number;
  /** Floor and ceiling heights (m a.s.l.). For building units: base and eaves. */
  floor: number;
  ceiling: number;
  /** Building eaves/ridge (roof flames sit here). */
  eaves: number;
  ridge: number;
  /** Uppermost storey of its building (the roof burns with it). */
  top: boolean;
  /** Stair hall / vault: ignites later, burns longer. */
  slow: boolean;
  /** Ignition time on the 300 s base. */
  ignite: number;
  /** Collapse time on the 300 s base (roof / stairs), null = stays standing (vaults). */
  collapse: number | null;
  /** Seconds (300 s base) of visible smoke before the flames. */
  smokeLead: number;
}

export interface FireScheduleOptions {
  /** Fire centre (default: Corps de logis). Only footprint units within `radius` burn. */
  center?: { x: number; z: number };
  radius?: number;
}

/** Corps de logis centre (bible: 1262.7 / −1126.3). */
export const FIRE_CENTER = { x: 1262.7, z: -1126.3 };
const FIRE_RADIUS = 110;

/** Buildings whose ground floor is set alight first (straw, bible 3.8/§9). */
const SEED_BUILDINGS = ['KB-B01', 'KB-B03'];
/** [min, max] ignition per building and storey on the 300 s base ('*' = any storey). */
const WINDOWS: Record<string, Record<string, [number, number]>> = {
  'KB-B01': { '1': [0, 30], '2': [90, 200] },
  'KB-B03': { '1': [0, 30], '2': [95, 210] },
  'KB-B02': { '1': [8, 30], '2': [100, 220] },
  'KB-B04': { '1': [180, 200], '2': [210, 235] },
  'KB-B06': { '*': [240, 265] },
  'KB-B07': { '*': [270, 280] },
  'KB-B05': { '*': [285, 300] },
};
/** Footprint-only buildings near the palace (guard houses, pavilions): not before this. */
const OTHER_MIN = 120;
const NO_BURN_CLASSES = new Set(['WALL', 'GARD', 'TERR', 'WATER', 'BRIDGE']);

const isSlow = (r: Room): boolean => /treppe|stair|keller|gew(ö|oe)lbe|vault|cellar/i.test(`${r.roomId} ${r.function}`);

/** Build the burnable units: every room of the burning palace + small buildings within the radius. */
export function buildFireUnits(rooms: Room[], footprints: Footprint[], opts: FireScheduleOptions = {}): FireUnit[] {
  const center = opts.center ?? FIRE_CENTER;
  const radius = opts.radius ?? FIRE_RADIUS;
  const fpById = new Map(footprints.map((f) => [f.id, f]));
  const units: FireUnit[] = [];
  const roomBuildings = new Set<string>();
  const maxStorey = new Map<string, number>();
  for (const r of rooms) maxStorey.set(r.building, Math.max(maxStorey.get(r.building) ?? 0, r.storey));
  for (const r of rooms) {
    const fp = fpById.get(r.building);
    if (!fp || r.storey < 1) continue; // cellars don't burn (vaults hold)
    const [cx, cz] = centroid(fp.ring);
    if (Math.hypot(cx - center.x, cz - center.z) > Math.max(radius, 160)) continue; // only the palace core
    roomBuildings.add(r.building);
    const [rx, rz] = centroid(r.polygon as Poly);
    units.push({
      id: r.id,
      kind: 'room',
      building: r.building,
      storey: r.storey,
      polygon: r.polygon as Poly,
      cx: rx,
      cz: rz,
      floor: r.floor_h,
      ceiling: r.ceiling_h,
      eaves: fp.eaves_h ?? r.ceiling_h,
      ridge: fp.ridge_h ?? (fp.eaves_h ?? r.ceiling_h) + 4,
      top: r.storey === maxStorey.get(r.building),
      slow: isSlow(r),
      ignite: Infinity,
      collapse: null,
      smokeLead: 10,
    });
  }
  for (const f of footprints) {
    if (roomBuildings.has(f.id) || f.base_h === null) continue;
    if (NO_BURN_CLASSES.has(f.cls ?? '')) continue;
    const [cx, cz] = centroid(f.ring);
    if (Math.hypot(cx - center.x, cz - center.z) > radius) continue;
    if (area(f.ring) < 12) continue;
    const eaves = f.eaves_h ?? f.base_h + 5;
    units.push({
      id: f.id,
      kind: 'building',
      building: f.id,
      storey: 1,
      polygon: f.ring,
      cx,
      cz,
      floor: f.base_h,
      ceiling: eaves,
      eaves,
      ridge: f.ridge_h ?? eaves + 3,
      top: true,
      slow: false,
      ignite: Infinity,
      collapse: null,
      smokeLead: 10,
    });
  }
  units.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return units;
}

/** Room graph: [neighbour index, cost (s on the 300 s base)][] per unit. */
export function buildFireGraph(units: FireUnit[]): [number, number][][] {
  const adj: [number, number][][] = units.map(() => []);
  const link = (i: number, j: number, cost: number) => {
    adj[i]!.push([j, cost]);
    adj[j]!.push([i, cost]);
  };
  for (let i = 0; i < units.length; i++) {
    const a = units[i]!;
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j]!;
      if (Math.hypot(a.cx - b.cx, a.cz - b.cz) > 90) continue;
      const slow = a.slow || b.slow ? 2.2 : 1;
      if (a.kind === 'room' && b.kind === 'room' && a.building === b.building) {
        if (a.storey === b.storey) {
          if (polygonGap(a.polygon, b.polygon) < 1.2) link(i, j, 7 * slow);
        } else if (Math.abs(a.storey - b.storey) === 1 && polygonsOverlap(a.polygon, b.polygon)) {
          // fire climbs through the stair halls quickly, through ceilings slowly
          link(i, j, a.slow && b.slow ? 25 : 60);
        }
      } else {
        const gap = polygonGap(a.polygon, b.polygon);
        const sameLevel = a.kind === 'building' || b.kind === 'building' || a.storey === b.storey;
        if (gap < 3 && sameLevel) link(i, j, 20 * slow);
        else if (gap < 9 && (a.kind === 'building' || b.kind === 'building')) link(i, j, 35);
      }
    }
  }
  return adj;
}

/** Ignition and collapse times (300 s base) for every unit. Mutates and returns `units`. */
export function scheduleFire(units: FireUnit[], center = FIRE_CENTER): FireUnit[] {
  const adj = buildFireGraph(units);
  const dist = units.map(() => Infinity);
  // seeds: the two ground-floor rooms of each seed building nearest to the fire centre
  for (const b of SEED_BUILDINGS) {
    const cand = units
      .map((u, i) => ({ u, i }))
      .filter(({ u }) => u.building === b && u.storey === 1 && !u.slow)
      .sort((p, q) => distToPolygon(center.x, center.z, p.u.polygon) - distToPolygon(center.x, center.z, q.u.polygon));
    for (const { i } of cand.slice(0, 2)) dist[i] = 0;
  }
  if (dist.every((d) => d === Infinity) && units.length) {
    // no catalogue rooms: start at the unit nearest the centre
    let best = 0;
    units.forEach((u, i) => {
      if (Math.hypot(u.cx - center.x, u.cz - center.z) < Math.hypot(units[best]!.cx - center.x, units[best]!.cz - center.z)) best = i;
    });
    dist[best] = 0;
  }
  // Dijkstra (n ≈ 120: a linear scan is fine)
  const done = units.map(() => false);
  for (;;) {
    let k = -1;
    for (let i = 0; i < units.length; i++) if (!done[i] && dist[i]! < Infinity && (k < 0 || dist[i]! < dist[k]!)) k = i;
    if (k < 0) break;
    done[k] = true;
    for (const [j, c] of adj[k]!) if (dist[k]! + c < dist[j]!) dist[j] = dist[k]! + c;
  }
  const maxReached = Math.max(0, ...dist.filter((d) => d < Infinity));
  units.forEach((u, i) => {
    let t = dist[i]! < Infinity ? dist[i]! : maxReached + 40; // unconnected: late
    const w = WINDOWS[u.building];
    const win = w ? (w[String(u.storey)] ?? w['*']) : undefined;
    if (win) t = Math.min(win[1], Math.max(win[0], t));
    else if (u.kind === 'building') t = Math.max(OTHER_MIN, t);
    if (u.slow) t += 6;
    u.ignite = Math.min(FIRE_BASE_SECONDS, t);
    // smoke rises ahead of the flames; upper floors fill with smoke long before they burn
    u.smokeLead = u.storey >= 2 ? 25 : 10;
    // roofs and stair halls fall in; vaulted / lower rooms keep standing
    u.collapse = u.slow ? u.ignite + 100 : u.top ? u.ignite + (u.kind === 'building' ? 90 : 80) : null;
  });
  return units;
}

/** Build + schedule in one go. */
export function createFireSchedule(rooms: Room[], footprints: Footprint[], opts: FireScheduleOptions = {}): FireUnit[] {
  return scheduleFire(buildFireUnits(rooms, footprints, opts), opts.center ?? FIRE_CENTER);
}

/** State of a unit at fire clock `t` (seconds), for a schedule scaled to `seconds`. */
export function unitStateAt(u: FireUnit, t: number, seconds = FIRE_BASE_SECONDS): UnitState {
  const k = seconds / FIRE_BASE_SECONDS;
  if (u.collapse !== null && t >= u.collapse * k) return 'collapsed';
  if (t >= u.ignite * k) return 'burning';
  if (t >= (u.ignite - u.smokeLead) * k) return 'smoke';
  return 'none';
}

/** 0..1 visual burn intensity (grows over ~20 s after ignition, sinks after collapse). */
export function burnIntensity(u: FireUnit, t: number, seconds = FIRE_BASE_SECONDS): number {
  const k = seconds / FIRE_BASE_SECONDS;
  const since = t - u.ignite * k;
  if (since < 0) return 0;
  let v = Math.min(1, 0.25 + since / (20 * k));
  if (u.collapse !== null) {
    const after = t - u.collapse * k;
    if (after > 0) v = 0.35 + 0.65 * Math.exp(-after / (25 * k));
  }
  return v;
}

/** Soot on the walls 0..1: blackens over the first 45 s (300 s base) of burning. */
export function sootAt(u: FireUnit, t: number, seconds = FIRE_BASE_SECONDS): number {
  const k = seconds / FIRE_BASE_SECONDS;
  return Math.max(0, Math.min(1, (t - u.ignite * k) / (45 * k)));
}

/** Smoke density 0..1 inside a unit. */
export function smokeDensity(u: FireUnit, t: number, seconds = FIRE_BASE_SECONDS): number {
  const k = seconds / FIRE_BASE_SECONDS;
  const start = (u.ignite - u.smokeLead) * k;
  if (t < start) return 0;
  return Math.min(1, 0.3 + (0.7 * (t - start)) / Math.max(1, (u.smokeLead + 15) * k));
}
