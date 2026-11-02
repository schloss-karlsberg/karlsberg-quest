/**
 * Walkable interiors from the catalogue room polygons (pure, deterministic, unit-tested).
 *
 * Input: the 114 room quads (public/data/palace/rooms.json), the building footprints, the 1789
 * terrain and (optionally) the window/door openings found in the palace model. Output: a Plan
 * with rooms, doors (between rooms that face each other across a wall, through to neighbouring
 * wings, and to the outside at sensible entrances), windows, stair ramps, height-aware wall
 * segments for the 2D collision and floor zones for the ground height.
 *
 * Rules:
 * - Walkable storeys: the ground floor everywhere; the upper floor where a clue room needs it
 *   (Corps de logis KB-B01: Festsaal; Sammlungsflügel KB-B04: Naturalienkabinett). Stair halls
 *   of those buildings become ramps (stairs.ts); elsewhere they are flat halls with a dummy flight.
 * - Doors: every pair of rooms on the same floor whose edges face each other across ≤ 2 m of
 *   wall with ≥ 1.7 m overlap gets one door in the middle of the overlap (enfilade). Rooms of
 *   neighbouring wings connect the same way through both outer walls.
 * - Entrances: door leaves found in the model, carriage passages (Durchfahrt, both sides),
 *   vestibules, the orangery's garden doors (portes-fenêtres) and a few named rooms (gallery ends,
 *   court kitchen). An entrance is kept only if the terrain in front is within reach (steps).
 * - Ruin (1796): ground floor only, no stairs, walls broken down to stubs (deterministic noise);
 *   today: no collision at all (foundations are only drawn).
 */
import type { Footprint, Room } from '../../data/types';
import {
  type Edge,
  along,
  behind,
  ccw,
  centroid,
  clipSegConvex,
  edgesOf,
  facing,
  hash1,
  orientedRect,
  outDist,
  paramOf,
  seedOf,
  signedArea,
} from './geom';
import { frameUV, stairConfigs, stairHeight } from './stairs';
import type { BuildingPlan, Door, InteriorMode, IRoom, Plan, RoomFrame, RoomKind, ShellOpening, StairPlan, Win } from './types';

export interface LayoutInput {
  rooms: readonly Room[];
  footprints: readonly Footprint[];
  mode: InteriorMode;
  /** Terrain height of the era (1789 DTM for the palace eras). */
  terrain: (x: number, z: number) => number;
  /** Windows / doors of the palace model (shell.ts); procedural windows without. */
  openings?: readonly ShellOpening[];
  /** Walkable storeys per building in the intact palace (default WALK_STOREYS). */
  storeys?: Readonly<Record<string, number[]>>;
}

/** Upper floors are walkable only where a clue room needs them. */
export const WALK_STOREYS: Readonly<Record<string, number[]>> = { 'KB-B01': [1, 2], 'KB-B04': [1, 2] };

/** Extra entrances (room id → which exterior edges get a door). */
const EXTRA_ENTRANCES: Readonly<Record<string, 'short' | 'long'>> = {
  'B06.1.kabinett-ost': 'short', // the Tempelzimmer's glass doors to the garden (bible 3.6)
  'B06.1.vorraum-west': 'short',
  'B05.1.eg-hofkueche': 'long', // court kitchen to the Küchenhof
};

/** Room opening on one of its edges (doors on both sides of a passage, windows). */
export interface EdgeOpening {
  edge: number;
  s0: number;
  s1: number;
  y0: number;
  y1: number;
  kind: 'door' | 'window';
  ref: number;
  arch?: boolean;
}

/** Plan room with the derived edge data the mesh builder needs. */
export interface PlanRoom extends IRoom {
  edges: Edge[];
  /** Exterior edges (ring behind at `gap`). */
  ext: { edge: number; gap: number }[];
  openings: EdgeOpening[];
  /** Dummy flight in a flat stair hall (room frame), blocked for walking. */
  deco: { u0: number; u1: number; v0: number; v1: number } | null;
}

export interface FullPlan extends Plan {
  rooms: PlanRoom[];
}

export function classifyRoom(roomId: string, name: string, fn: string): RoomKind {
  const s = `${roomId} ${name} ${fn}`.toLowerCase();
  if (/bildergalerie/.test(s)) return 'gallery';
  if (/festsaal/.test(roomId)) return 'festsaal';
  if (/pfeilersaal/.test(s)) return 'orangery';
  if (/kabinett-ost/.test(roomId)) return 'temple';
  if (/treppe/.test(roomId)) return 'stair';
  if (/bibliothek/.test(s)) return 'library';
  if (/waffensammlung/.test(s)) return 'arms';
  if (/naturalien|physik/.test(s)) return 'naturalia';
  if (/kupferstich/.test(s)) return 'prints';
  if (/eg-kabinett/.test(roomId)) return 'study';
  if (/kabinett/.test(roomId)) return 'cabinet';
  if (/registratur|kanzlei|schreiber/.test(roomId)) return 'registry';
  if (/durchfahrt/.test(roomId)) return 'passage';
  if (/vestib|vorraum|gardesaal/.test(roomId)) return 'vestibule';
  if (/durchgang|wintergarten/.test(roomId)) return 'link';
  if (/korridor/.test(roomId)) return 'corridor';
  if (/kueche|konditorei|baeckerei|anrichte|silber/.test(roomId)) return 'kitchen';
  if (/speisesaal/.test(roomId)) return 'dining';
  if (/schlafzimmer|alkoven/.test(roomId)) return 'bedroom';
  if (/salon|audienz|antichambre/.test(roomId)) return 'salon';
  if (/wachstube|offizier/.test(roomId)) return 'guard';
  if (/buechsenmacher/.test(roomId)) return 'gunsmith';
  return 'chamber';
}

function floorKindOf(kind: RoomKind): IRoom['floorKind'] {
  switch (kind) {
    case 'stair':
    case 'vestibule':
    case 'passage':
    case 'kitchen':
    case 'guard':
    case 'orangery':
    case 'arms':
    case 'gunsmith':
    case 'corridor':
      return 'stone';
    case 'registry':
    case 'chamber':
      return 'boards';
    default:
      return 'parquet';
  }
}

/** Frame along the longest edge (origin at its start, v into the room). */
export function roomFrame(poly: readonly [number, number][], edgeIndex?: number): RoomFrame {
  const es = edgesOf(poly);
  let i = edgeIndex ?? 0;
  if (edgeIndex === undefined) for (let k = 1; k < es.length; k++) if (es[k]!.len > es[i]!.len + 1e-6) i = k;
  const e = es[i]!;
  const next = es[(i + 1) % es.length]!;
  return { ox: e.ax, oz: e.az, ux: e.tx, uz: e.tz, vx: -e.tz, vz: e.tx, L: e.len, W: next.len };
}

/** Deterministic stub height (m above the floor) of a ruined wall at x/z (1796). */
export function ruinTop(building: string, x: number, z: number, low = false): number {
  const s = seedOf(building) % 1000;
  // two octaves of value noise along the ground, ~4 m and ~1.3 m cells
  const vn = (x0: number, z0: number, sc: number, salt: number) => {
    const fx = x0 / sc;
    const fz = z0 / sc;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const ux = fx - ix;
    const uz = fz - iz;
    const sx = ux * ux * (3 - 2 * ux);
    const sz = uz * uz * (3 - 2 * uz);
    const h = (a: number, b: number) => hash1(a + s, b + salt, 7);
    return (h(ix, iz) * (1 - sx) + h(ix + 1, iz) * sx) * (1 - sz) + (h(ix, iz + 1) * (1 - sx) + h(ix + 1, iz + 1) * sx) * sz;
  };
  const n = 0.7 * vn(x, z, 4.2, 11) + 0.3 * vn(x, z, 1.3, 23);
  if (low) return 0.3 + 0.8 * n;
  // breaches (passable) where the noise is low, tall remains where it is high
  if (n < 0.3) return 0.12 + n * 0.5;
  return 0.6 + Math.pow((n - 0.3) / 0.7, 1.3) * 3.4;
}

/** Floor height of a room at x/z (stair ramps), or null if outside the room's zones. */
export function roomFloorAt(r: IRoom, x: number, z: number): number | null {
  if (!r.stair) return r.floor;
  const [u, v] = frameUV(r.frame, x, z);
  return stairHeight(r.stair, u, v);
}

interface Conn {
  other: number;
  edge: number;
  s0: number;
  s1: number;
  gap: number;
  h: number;
  weight: number;
}

const EPS_H = 0.06;

export function buildPlan(inp: LayoutInput): FullPlan {
  const { mode } = inp;
  const storeysOf = (b: string): number[] => (mode === 'intact' ? (inp.storeys ?? WALK_STOREYS)[b] ?? [1] : [1]);
  const fps = inp.footprints.filter((f) => f.interior === 'detailed' && inp.rooms.some((r) => r.building === f.id));
  const plan: FullPlan = { mode, rooms: [], doors: [], windows: [], walls: [], ground: [], buildings: [] };

  // ---- buildings + rooms -------------------------------------------------------------------
  const ringEdges = new Map<string, Edge[]>();
  for (const f of fps) {
    const ring = ccw(f.ring);
    ringEdges.set(f.id, edgesOf(ring));
    const xs = ring.map((p) => p[0]);
    const zs = ring.map((p) => p[1]);
    const st = storeysOf(f.id);
    const bp: BuildingPlan = {
      id: f.id,
      name: f.name_de,
      ring,
      base: f.base_h ?? 0,
      eaves: f.eaves_h ?? (f.base_h ?? 0) + 10,
      storeys: st,
      rooms: [],
      x0: Math.min(...xs) - 6,
      z0: Math.min(...zs) - 6,
      x1: Math.max(...xs) + 6,
      z1: Math.max(...zs) + 6,
      floor: Infinity,
    };
    plan.buildings.push(bp);
    for (const r of inp.rooms) {
      if (r.building !== f.id || !st.includes(r.storey)) continue;
      const poly = ccw(r.polygon);
      const kind = classifyRoom(r.roomId, r.name_de, r.function ?? '');
      const [cx, cz] = centroid(poly);
      const room: PlanRoom = {
        index: plan.rooms.length,
        id: r.id,
        roomId: r.roomId,
        building: r.building,
        name: r.name_de,
        fn: r.function ?? '',
        kind,
        storey: r.storey,
        floor: r.floor_h,
        ceiling: r.ceiling_h,
        poly,
        cx,
        cz,
        area: signedArea(poly),
        frame: roomFrame(poly),
        stair: null,
        floorKind: floorKindOf(kind),
        edges: edgesOf(poly),
        ext: [],
        openings: [],
        deco: null,
      };
      const re = ringEdges.get(f.id)!;
      room.edges.forEach((e, i) => {
        let best: number | null = null;
        for (const g of re) {
          const q = behind(e, g, 1.9);
          if (q && q.s1 - q.s0 > e.len * 0.5 && (best === null || q.gap < best)) best = q.gap;
        }
        if (best !== null) room.ext.push({ edge: i, gap: best });
      });
      plan.rooms.push(room);
      bp.rooms.push(room.index);
      if (r.storey === Math.min(...st)) bp.floor = Math.min(bp.floor, r.floor_h);
    }
  }
  const rooms = plan.rooms;
  const bOf = new Map(plan.buildings.map((b) => [b.id, b]));

  // ---- candidate connections between facing room edges --------------------------------------
  const near = (a: PlanRoom, b: PlanRoom) => {
    const ba = bboxOf(a.poly);
    const bb = bboxOf(b.poly);
    return ba[0] - 2.2 < bb[2] && bb[0] - 2.2 < ba[2] && ba[1] - 2.2 < bb[3] && bb[1] - 2.2 < ba[3];
  };
  const facings = (a: PlanRoom, b: PlanRoom, minOverlap: number) => {
    let best: { ea: number; eb: number; gap: number; s0: number; s1: number } | null = null;
    a.edges.forEach((e, i) =>
      b.edges.forEach((o, j) => {
        const q = facing(e, o, 2.05);
        if (q && q.s1 - q.s0 >= minOverlap && (!best || q.gap < best.gap)) best = { ea: i, eb: j, ...q };
      }),
    );
    return best as { ea: number; eb: number; gap: number; s0: number; s1: number } | null;
  };

  // ---- stairs (intact palace, buildings with a walkable upper floor) -------------------------
  if (mode === 'intact') {
    for (const bp of plan.buildings) {
      const upper = bp.rooms.map((i) => rooms[i]!).filter((r) => r.storey === 2);
      const high = upper.length ? Math.min(...upper.map((r) => r.floor)) : null;
      for (const ri of bp.rooms) {
        const s = rooms[ri]!;
        if (s.kind !== 'stair' || s.storey !== 1) continue;
        if (high === null || s.ceiling < high + 2.5) continue;
        const conns: Conn[] = [];
        for (const r of rooms) {
          if (r === s || r.kind === 'stair' && r.building === s.building || !near(s, r)) continue;
          if (r.kind === 'stair' && storeysOf(r.building).includes(2)) continue;
          s.edges.forEach((e, i) =>
            r.edges.forEach((o) => {
              const q = facing(e, o, 2.05);
              const hub = r.kind === 'vestibule' || r.kind === 'link' || r.kind === 'passage' || r.kind === 'corridor';
              if (q && q.s1 - q.s0 >= 1.6) conns.push({ other: r.index, edge: i, ...q, h: r.floor, weight: r.building !== s.building ? 2 : hub ? 5 : 3 });
            }),
          );
        }
        const solved = solveStair(s, conns, s.floor, high);
        if (solved) {
          s.stair = solved.plan;
          s.frame = solved.frame;
          for (const d of solved.doors) addDoor(plan, s, d.conn.edge, d.s, d.width, d.conn.h, d.top, d.conn.other, d.conn.gap, false);
        }
      }
    }
  }
  const isRamp = (r: PlanRoom) => r.stair !== null;

  // ---- doors between rooms on the same floor --------------------------------------------------
  for (let i = 0; i < rooms.length; i++) {
    const a = rooms[i]!;
    if (isRamp(a)) continue;
    for (let j = i + 1; j < rooms.length; j++) {
      const b = rooms[j]!;
      if (isRamp(b) || Math.abs(a.floor - b.floor) > EPS_H || !near(a, b)) continue;
      const f = facings(a, b, 1.7);
      if (!f) continue;
      const passage = a.kind === 'passage' && b.kind === 'passage';
      const big = Math.abs(a.area) > 60 && Math.abs(b.area) > 60;
      let w = passage ? 3 : big ? 1.7 : 1.3;
      w = Math.min(w, f.s1 - f.s0 - 0.4);
      if (w < 1.0) continue;
      const top = a.floor + Math.max(2.3, Math.min(3.2, Math.min(a.ceiling, b.ceiling) - a.floor - 0.6));
      addDoor(plan, a, f.ea, (f.s0 + f.s1) / 2, w, a.floor, top, b.index, f.gap, passage);
    }
  }

  // ---- windows (from the model, or procedural) -------------------------------------------------
  for (const r of rooms) {
    for (const x of r.ext) {
      const e = r.edges[x.edge]!;
      const found = (inp.openings ?? []).filter((o) => o.kind === 'window' && o.building === r.building);
      const wins: Omit<Win, 'room'>[] = [];
      // panes closest to the room face first (each window has an outer and an inner pane)
      const mapped = found.map((o) => ({ o, m: mapOpening(e, x.gap, o) })).filter((q) => q.m !== null).sort((p, q) => p.m!.d - q.m!.d);
      for (const { o, m } of mapped) {
        const y0 = Math.max(o.y0, r.floor + 0.05);
        const y1 = Math.min(o.y1, r.ceiling - 0.1);
        if (y1 - y0 < 0.6 || o.y0 < r.floor - 0.4 || o.y1 > r.ceiling + 0.4) continue;
        if (wins.some((w) => Math.abs(paramOf(e, w.cx, w.cz) - m!.s) < 0.4 && Math.abs(w.y0 - y0) < 0.4)) continue;
        const [cx, cz] = along(e, m!.s);
        wins.push({ edge: x.edge, cx, cz, tx: e.tx, tz: e.tz, nx: e.nx, nz: e.nz, width: m!.w, y0, y1, reveal: Math.max(0, Math.min(x.gap, m!.d)), depth: x.gap });
      }
      if (!inp.openings?.length && !(mode === 'intact' && r.kind === 'gallery' && isHangingWall(r, x.edge))) {
        // procedural: one window bay every ~3.8 m
        const n = Math.floor((e.len - 0.8) / 3.8);
        const h = Math.min(3.4, r.ceiling - r.floor - 1.4);
        for (let k = 0; k < n && h > 1; k++) {
          const s = (e.len - n * 3.8) / 2 + 3.8 * (k + 0.5);
          const [cx, cz] = along(e, s);
          wins.push({ edge: x.edge, cx, cz, tx: e.tx, tz: e.tz, nx: e.nx, nz: e.nz, width: 1.3, y0: r.floor + 0.9, y1: r.floor + 0.9 + h, reveal: x.gap, depth: x.gap });
        }
      }
      for (const w of wins) plan.windows.push({ ...w, room: r.index });
    }
  }

  // ---- entrances -------------------------------------------------------------------------------
  for (const bp of plan.buildings) {
    const ground = bp.rooms.map((i) => rooms[i]!).filter((r) => !isRamp(r) && Math.abs(r.floor - bp.floor) < EPS_H);
    for (const r of ground) {
      for (const x of r.ext) {
        const e = r.edges[x.edge]!;
        const tryDoor = (s: number, w: number, top: number, arch: boolean): boolean => {
          if (s - w / 2 < 0.15 || s + w / 2 > e.len - 0.15) return false;
          if (r.openings.some((o) => o.edge === x.edge && o.kind === 'door' && !(s + w / 2 + 0.3 < o.s0 || s - w / 2 - 0.3 > o.s1))) return false;
          const [cx, cz] = along(e, s);
          const ox = cx + e.nx * (x.gap + 1.2);
          const oz = cz + e.nz * (x.gap + 1.2);
          const t = inp.terrain(ox, oz);
          const dh = r.floor - t;
          if (dh > 2.7 || dh < -1.2) return false;
          const length = Math.min(4.6, Math.max(0.9, Math.abs(dh) / 0.58));
          const t2 = inp.terrain(cx + e.nx * (x.gap + length), cz + e.nz * (x.gap + length));
          const di = addDoor(plan, r, x.edge, s, w, r.floor, top, -1, x.gap, arch);
          plan.doors[di]!.stoop = { length, ground: t2 };
          // a door replaces the window it stands in
          plan.windows = plan.windows.filter((wn) => !(wn.room === r.index && wn.edge === x.edge && Math.abs(paramOf(e, wn.cx, wn.cz) - s) < (w + wn.width) / 2));
          return true;
        };
        // (a) door leaves of the model
        for (const o of inp.openings ?? []) {
          if (o.kind !== 'door' || o.building !== r.building || o.y0 > r.floor + 0.7 || o.y0 < r.floor - 0.9) continue;
          const m = mapOpening(e, x.gap, o);
          if (m) tryDoor(m.s, Math.max(1.2, m.w), Math.max(o.y1, r.floor + 2.4), false);
        }
        const mid = e.len / 2;
        const hasDoor = () => r.openings.some((o) => o.edge === x.edge && o.kind === 'door' && plan.doors[o.ref]!.b === -1);
        if (r.kind === 'passage') tryDoor(mid, Math.min(3.2, e.len - 0.8), r.floor + Math.min(4.0, r.ceiling - r.floor - 0.4), true);
        else if (r.kind === 'vestibule' && r.storey === 1 && !hasDoor()) {
          const win = nearestWindow(plan, r.index, x.edge, mid, e);
          tryDoor(win ? paramOf(e, win.cx, win.cz) : mid, 1.9, win ? Math.max(win.y1, r.floor + 3) : r.floor + 3.2, false);
        }
        const extra = EXTRA_ENTRANCES[r.roomId];
        if (extra && !hasDoor()) {
          const isShort = e.len < Math.max(...r.edges.map((q) => q.len)) - 0.5;
          if ((extra === 'short') === isShort) {
            const win = nearestWindow(plan, r.index, x.edge, mid, e);
            tryDoor(win ? paramOf(e, win.cx, win.cz) : mid, 1.7, win ? Math.max(win.y1, r.floor + 2.8) : r.floor + 3.0, false);
          }
        }
      }
      if (r.kind === 'orangery') {
        // garden doors: the windows nearest the middle of the edge whose terrain is closest
        let bestEdge = -1;
        let bestDh = Infinity;
        for (const x of r.ext) {
          const e = r.edges[x.edge]!;
          if (e.len < 10) continue;
          const [cx, cz] = along(e, e.len / 2);
          const dh = Math.abs(r.floor - inp.terrain(cx + e.nx * (x.gap + 1.5), cz + e.nz * (x.gap + 1.5)));
          if (dh < bestDh) {
            bestDh = dh;
            bestEdge = x.edge;
          }
        }
        const x = r.ext.find((q) => q.edge === bestEdge);
        if (x) {
          const e = r.edges[x.edge]!;
          const wins = plan.windows
            .filter((w) => w.room === r.index && w.edge === x.edge)
            .sort((p, q) => Math.abs(paramOf(e, p.cx, p.cz) - e.len / 2) - Math.abs(paramOf(e, q.cx, q.cz) - e.len / 2))
            .slice(0, 3);
          for (const w of wins) {
            const s = paramOf(e, w.cx, w.cz);
            const tryIt = () => {
              const [cx, cz] = along(e, s);
              const t = inp.terrain(cx + e.nx * (x.gap + 1.2), cz + e.nz * (x.gap + 1.2));
              const dh = r.floor - t;
              if (dh > 2.7 || dh < -1.2) return;
              const length = Math.min(4.6, Math.max(0.9, Math.abs(dh) / 0.58));
              const di = addDoor(plan, r, x.edge, s, w.width, r.floor, Math.max(w.y1, r.floor + 2.6), -1, x.gap, false);
              plan.doors[di]!.stoop = { length, ground: inp.terrain(cx + e.nx * (x.gap + length), cz + e.nz * (x.gap + length)) };
              plan.windows = plan.windows.filter((q) => q !== w);
            };
            tryIt();
          }
        }
      }
    }
  }

  // ---- dummy flights in flat stair halls -----------------------------------------------------------
  for (const r of rooms) {
    if (r.kind !== 'stair' || r.stair || r.frame.W < 2.6 || r.frame.L < 4.5) continue;
    // along the long wall without doors (v = W side if the v = 0 side has doors)
    const f = r.frame;
    const w = Math.min(2.0, f.W * 0.42);
    const doorsOn = (edgeIdx: number) => r.openings.some((o) => o.edge === edgeIdx && o.kind === 'door');
    const e0 = r.edges.findIndex((e) => Math.abs(e.ax - f.ox) < 1e-6 && Math.abs(e.az - f.oz) < 1e-6);
    const far = (e0 + 2) % r.edges.length;
    const useFar = doorsOn(e0) && !doorsOn(far);
    r.deco = useFar ? { u0: 1.0, u1: f.L - 0.6, v0: f.W - w, v1: f.W } : { u0: 1.0, u1: f.L - 0.6, v0: 0, v1: w };
  }

  // ---- walls (height-aware collision segments) + ground zones ----------------------------------------
  if (mode !== 'today') {
    for (const r of rooms) {
      const low = r.stair ? r.stair.low : r.floor;
      r.edges.forEach((e, i) => {
        const ops = r.openings.filter((o) => o.edge === i && o.kind === 'door').sort((p, q) => p.s0 - q.s0);
        pieces(e.len, ops).forEach(([s0, s1, op]) => {
          const [ax, az] = along(e, s0);
          const [bx, bz] = along(e, s1);
          const base = { ax, az, bx, bz, kind: 'room' as const, building: r.building };
          if (mode === 'ruin') {
            if (!op) for (const c of ruinChunks(r.building, ax, az, bx, bz, r.kind === 'gallery')) plan.walls.push({ ...base, ...c.seg, y0: low - 0.3, y1: low + c.h });
            return;
          }
          if (!op) plan.walls.push({ ...base, y0: low - 0.3, y1: r.ceiling + 0.2 });
          else {
            if (op.y0 - low > 0.05) plan.walls.push({ ...base, y0: low - 0.3, y1: op.y0 - 0.02 });
            plan.walls.push({ ...base, y0: op.y1, y1: r.ceiling + 0.2 });
          }
        });
      });
      if (r.stair) {
        for (const d of r.stair.dividers) {
          const [ax, az] = [r.frame.ox + r.frame.ux * d.u0 + r.frame.vx * d.v0, r.frame.oz + r.frame.uz * d.u0 + r.frame.vz * d.v0];
          const [bx, bz] = [r.frame.ox + r.frame.ux * d.u1 + r.frame.vx * d.v1, r.frame.oz + r.frame.uz * d.u1 + r.frame.vz * d.v1];
          plan.walls.push({ ax, az, bx, bz, y0: r.stair.low - 1, y1: r.ceiling, kind: 'divider', building: r.building });
        }
      }
      if (r.deco && mode === 'intact') {
        const f = r.frame;
        const c = [
          [r.deco.u0, r.deco.v0],
          [r.deco.u1, r.deco.v0],
          [r.deco.u1, r.deco.v1],
          [r.deco.u0, r.deco.v1],
        ].map(([u, v]) => [f.ox + f.ux * u! + f.vx * v!, f.oz + f.uz * u! + f.vz * v!] as const);
        for (let k = 0; k < 4; k++) {
          const p = c[k]!;
          const q = c[(k + 1) % 4]!;
          plan.walls.push({ ax: p[0], az: p[1], bx: q[0], bz: q[1], y0: r.floor - 0.3, y1: r.ceiling, kind: 'block', building: r.building });
        }
      }
    }
    // outer walls: the footprint ring, cut where passages go through
    for (const bp of plan.buildings) {
      const cuts = plan.doors.filter((d) => d.b === -1 ? d.building === bp.id : d.kind === 'cross' && (d.building === bp.id || d.buildingB === bp.id));
      for (const e of ringEdges.get(bp.id)!) {
        let segs: { t0: number; t1: number; door: Door | null }[] = [{ t0: 0, t1: 1, door: null }];
        for (const d of cuts) {
          const quad = orientedRect(d.cx + d.nx * (d.depth / 2), d.cz + d.nz * (d.depth / 2), d.nx, d.nz, d.depth / 2 + 0.6, d.width / 2);
          const clip = clipSegConvex(e.ax, e.az, e.bx, e.bz, quad);
          if (!clip) continue;
          const next: typeof segs = [];
          for (const sg of segs) {
            if (sg.door || clip[1] <= sg.t0 || clip[0] >= sg.t1) {
              next.push(sg);
              continue;
            }
            if (clip[0] > sg.t0) next.push({ t0: sg.t0, t1: clip[0], door: null });
            next.push({ t0: Math.max(sg.t0, clip[0]), t1: Math.min(sg.t1, clip[1]), door: d });
            if (clip[1] < sg.t1) next.push({ t0: clip[1], t1: sg.t1, door: null });
          }
          segs = next;
        }
        for (const sg of segs) {
          const ax = e.ax + (e.bx - e.ax) * sg.t0;
          const az = e.az + (e.bz - e.az) * sg.t0;
          const bx = e.ax + (e.bx - e.ax) * sg.t1;
          const bz = e.az + (e.bz - e.az) * sg.t1;
          const base = { ax, az, bx, bz, kind: 'ring' as const, building: bp.id };
          if (mode === 'ruin') {
            if (!sg.door) for (const c of ruinChunks(bp.id, ax, az, bx, bz, bp.id === 'KB-B06')) plan.walls.push({ ...base, ...c.seg, y0: bp.base - 30, y1: bp.floor + c.h });
            else plan.walls.push({ ...base, y0: bp.base - 30, y1: sg.door.floor - 0.6 });
            continue;
          }
          if (!sg.door) plan.walls.push({ ...base, y0: bp.base - 30, y1: bp.eaves });
          else {
            plan.walls.push({ ...base, y0: bp.base - 30, y1: sg.door.floor - 0.6 });
            plan.walls.push({ ...base, y0: sg.door.top, y1: bp.eaves });
          }
        }
      }
    }
    // door jambs + passage / stoop floors
    for (const d of plan.doors) {
      for (const sgn of [-1, 1]) {
        const ax = d.cx + d.tx * sgn * (d.width / 2);
        const az = d.cz + d.tz * sgn * (d.width / 2);
        plan.walls.push({ ax, az, bx: ax + d.nx * d.depth, bz: az + d.nz * d.depth, y0: d.floor - 1, y1: d.top + 1.5, kind: 'jamb', building: d.building });
      }
      plan.ground.push({
        poly: orientedRect(d.cx + d.nx * (d.depth / 2), d.cz + d.nz * (d.depth / 2), d.nx, d.nz, d.depth / 2 + 0.03, d.width / 2 + 0.02),
        ox: d.cx,
        oz: d.cz,
        dx: d.nx,
        dz: d.nz,
        h0: d.floor,
        k: 0,
        stoop: false,
        door: d.index,
      });
      if (d.stoop) {
        const L = d.stoop.length;
        const sx = d.cx + d.nx * d.depth;
        const sz = d.cz + d.nz * d.depth;
        plan.ground.push({
          poly: orientedRect(sx + d.nx * (L / 2), sz + d.nz * (L / 2), d.nx, d.nz, L / 2 + 0.01, d.width / 2 + 0.45),
          ox: sx,
          oz: sz,
          dx: d.nx,
          dz: d.nz,
          h0: d.floor,
          k: L,
          stoop: true,
          door: d.index,
        });
        const bp = bOf.get(d.building)!;
        bp.x0 = Math.min(bp.x0, sx + d.nx * L - 2);
        bp.x1 = Math.max(bp.x1, sx + d.nx * L + 2);
        bp.z0 = Math.min(bp.z0, sz + d.nz * L - 2);
        bp.z1 = Math.max(bp.z1, sz + d.nz * L + 2);
      }
    }
  }
  return plan;
}

function bboxOf(p: readonly (readonly [number, number])[]): [number, number, number, number] {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of p) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  return [x0, z0, x1, z1];
}

/** The gallery's long wall without windows is the hanging wall. */
function isHangingWall(r: PlanRoom, edge: number): boolean {
  const e = r.edges[edge]!;
  return e.len > 20 && e.nz > 0; // south-facing long side
}

function nearestWindow(plan: Plan, room: number, edge: number, s: number, e: Edge): Win | null {
  let best: Win | null = null;
  for (const w of plan.windows) {
    if (w.room !== room || w.edge !== edge) continue;
    if (!best || Math.abs(paramOf(e, w.cx, w.cz) - s) < Math.abs(paramOf(e, best.cx, best.cz) - s)) best = w;
  }
  return best;
}

/** Map a facade opening onto a room edge (parallel, behind it, within the edge). */
function mapOpening(e: Edge, gap: number, o: ShellOpening): { s: number; w: number; d: number } | null {
  const dx = o.bx - o.ax;
  const dz = o.bz - o.az;
  const w = Math.hypot(dx, dz);
  if (w < 0.3) return null;
  if (Math.abs((dx * e.tx + dz * e.tz) / w) < 0.97) return null;
  const mx = (o.ax + o.bx) / 2;
  const mz = (o.az + o.bz) / 2;
  const d = outDist(e, mx, mz);
  if (d < -0.3 || d > gap + 0.6) return null;
  const s = paramOf(e, mx, mz);
  if (s - w / 2 < 0.05 || s + w / 2 > e.len - 0.05) return null;
  return { s, w, d };
}

/** Add a door on room `a`'s edge at parameter s; registers openings on both rooms. */
function addDoor(plan: FullPlan, a: PlanRoom, edge: number, s: number, width: number, floor: number, top: number, b: number, depth: number, arch: boolean): number {
  const e = a.edges[edge]!;
  const [cx, cz] = along(e, s);
  const rb = b >= 0 ? plan.rooms[b]! : null;
  const d: Door = {
    index: plan.doors.length,
    a: a.index,
    b,
    building: a.building,
    buildingB: rb && rb.building !== a.building ? rb.building : null,
    kind: b < 0 ? 'outer' : rb!.building !== a.building ? 'cross' : 'inner',
    cx,
    cz,
    tx: e.tx,
    tz: e.tz,
    nx: e.nx,
    nz: e.nz,
    width,
    depth,
    floor,
    top,
    arch,
    stoop: null,
    edge,
  };
  plan.doors.push(d);
  a.openings.push({ edge, s0: s - width / 2, s1: s + width / 2, y0: floor, y1: top, kind: 'door', ref: d.index, arch });
  if (rb) {
    // the same opening on the far room's facing edge
    let bestJ = -1;
    let bestD = Infinity;
    rb.edges.forEach((o, j) => {
      if (o.tx * e.tx + o.tz * e.tz > -0.97) return;
      const dd = Math.abs(outDist(o, cx + e.nx * depth, cz + e.nz * depth));
      if (dd < bestD) {
        bestD = dd;
        bestJ = j;
      }
    });
    if (bestJ >= 0) {
      const o = rb.edges[bestJ]!;
      const p0 = paramOf(o, cx + e.tx * (width / 2), cz + e.tz * (width / 2));
      const p1 = paramOf(o, cx - e.tx * (width / 2), cz - e.tz * (width / 2));
      rb.openings.push({ edge: bestJ, s0: Math.min(p0, p1), s1: Math.max(p0, p1), y0: floor, y1: top, kind: 'door', ref: d.index, arch });
    }
  }
  return d.index;
}

/** Split [0, len] around door openings: [s0, s1, opening | null]. */
function pieces(len: number, ops: EdgeOpening[]): [number, number, EdgeOpening | null][] {
  const out: [number, number, EdgeOpening | null][] = [];
  let s = 0;
  for (const o of ops) {
    const a = Math.max(s, o.s0);
    const b = Math.min(len, o.s1);
    if (a > s + 1e-3) out.push([s, a, null]);
    if (b > a) out.push([a, b, o]);
    s = Math.max(s, b);
  }
  if (len > s + 1e-3) out.push([s, len, null]);
  return out;
}

/** Ruined wall: ~1.1 m chunks with their stub height (m above the floor). */
export function ruinChunks(building: string, ax: number, az: number, bx: number, bz: number, low = false): { seg: { ax: number; az: number; bx: number; bz: number }; h: number }[] {
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.round(L / 1.1));
  const out: { seg: { ax: number; az: number; bx: number; bz: number }; h: number }[] = [];
  for (let k = 0; k < n; k++) {
    const t0 = k / n;
    const t1 = (k + 1) / n;
    const mx = ax + (bx - ax) * ((t0 + t1) / 2);
    const mz = az + (bz - az) * ((t0 + t1) / 2);
    out.push({ seg: { ax: ax + (bx - ax) * t0, az: az + (bz - az) * t0, bx: ax + (bx - ax) * t1, bz: az + (bz - az) * t1 }, h: ruinTop(building, mx, mz, low) });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// stair solver
// ------------------------------------------------------------------------------------------------

interface PlacedDoor {
  conn: Conn;
  s: number;
  width: number;
  top: number;
}

function solveStair(s: PlanRoom, conns: Conn[], low: number, high: number): { plan: StairPlan; frame: RoomFrame; doors: PlacedDoor[] } | null {
  let best: { plan: StairPlan; frame: RoomFrame; doors: PlacedDoor[]; score: number } | null = null;
  const grand = Math.min(s.frame.L, s.frame.W) >= 9;
  for (let fi = 0; fi < s.poly.length; fi++) {
    const frame = roomFrame(s.poly, fi);
    for (const cfg of stairConfigs(frame.L, frame.W, low, high)) {
      const doors: PlacedDoor[] = [];
      const done = new Set<number>();
      // closer rooms first; one door per neighbour
      for (const c of [...conns].sort((p, q) => q.weight - p.weight || p.gap - q.gap)) {
        if (done.has(c.other)) continue;
        const e = s.edges[c.edge]!;
        const width = grand ? 2.0 : Math.min(s.frame.L, s.frame.W) < 6 ? 1.2 : 1.4;
        const ok = (sc: number) => {
          // the threshold must be level across the door; a flight may start right behind it
          for (const t of [-0.5, 0, 0.5]) {
            const [px, pz] = along(e, sc + t * width);
            const [u, v] = frameUV(frame, px - e.nx * 0.25, pz - e.nz * 0.25);
            const h = stairHeight(cfg, u, v);
            if (h === null || Math.abs(h - c.h) > 0.12) return false;
          }
          {
            const [px, pz] = along(e, sc);
            const [u, v] = frameUV(frame, px - e.nx * 0.9, pz - e.nz * 0.9);
            const h = stairHeight(cfg, u, v);
            if (h === null || Math.abs(h - c.h) > 0.6) return false;
          }
          // no other door on this edge too close
          return !doors.some((d) => d.conn.edge === c.edge && Math.abs(d.s - sc) < width + 0.4);
        };
        const lo = c.s0 + width / 2 + 0.12;
        const hi = c.s1 - width / 2 - 0.12;
        if (hi < lo) continue;
        const midS = (lo + hi) / 2;
        let placed: number | null = null;
        for (let k = 0; k <= Math.ceil((hi - lo) / 0.1); k++) {
          const off = Math.ceil(k / 2) * 0.1 * (k % 2 ? 1 : -1);
          const sc = midS + off;
          if (sc < lo - 1e-6 || sc > hi + 1e-6) continue;
          if (ok(sc)) {
            placed = sc;
            break;
          }
        }
        if (placed === null) continue;
        done.add(c.other);
        doors.push({ conn: c, s: placed, width, top: c.h + Math.min(3.2, Math.max(2.4, s.ceiling - c.h - 0.6)) });
      }
      const hasLow = doors.some((d) => Math.abs(d.conn.h - low) < EPS_H);
      const hasHigh = doors.some((d) => Math.abs(d.conn.h - high) < EPS_H);
      if (!hasLow || !hasHigh) continue;
      let score = doors.reduce((a, d) => a + d.conn.weight, 0);
      if (cfg.type === 'imperial' && grand) score += 6;
      if (cfg.type === 'dogleg') score += 0.3;
      if (!best || score > best.score + 1e-6) best = { plan: cfg, frame, doors, score };
    }
  }
  return best;
}
