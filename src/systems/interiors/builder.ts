/**
 * Mesh builder: one building's interior for one era as a single geometry (structure + props),
 * plus its light sources, candle flames, fire spots and prop solids. Pure apart from three's
 * BufferGeometry (no scene access); called lazily by the system when the player comes near.
 *
 * Structure: floors (parquet / flags / boards / chequered vestibules / cobbled carriage passages),
 * walls with door and window openings (finish per room kind), window reveals with glazing bars at
 * the shell's inner pane (the shell glass itself is cut away at runtime), door passages with
 * architraves and opened leaves, outdoor steps, ceilings, stair flights with landings and
 * balustrades. Ruin (1796): broken masonry stubs, rubble, charred rafters, open sky. Today: low
 * mossy foundation lines on the 2025 ground.
 */
import type { ModelPlacement } from '../scenery/models';
import type { Era } from '../../core/era';
import { GeoBuf, type RGB, type Surf, type V3 } from './geobuf';
import { type Edge, along, hash1, paramOf, pointInPoly, rng, seedOf } from './geom';
import { type FullPlan, type PlanRoom, ruinChunks } from './layout';
import { M, lin } from './material';
import { furnish } from './props';
import { frameXZ, stairHeight } from './stairs';
import type { Door, Wall, Win } from './types';

export interface LightSpot {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  radius: number;
  /** Local room index (light stays in its room) or −1. */
  room: number;
}

/** Billboard spot: 0 candle flame, 1 fire tongue, 2 ember stream, 3 smoke puff. */
export interface FlameSpot {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  kind: 0 | 1 | 2 | 3;
  /** Local room (fire visibility follows the room's state), −1 = always. */
  room: number;
  seed: number;
}

export interface Look {
  era: Era;
  mode: FullPlan['mode'];
  /** Candles and chandeliers burning (1789). */
  lit: boolean;
  /** Looted, half-stripped (1793-07). */
  looted: boolean;
  /** Abandoned, dust sheets over the furniture (1793-02). */
  sheets: boolean;
  /** Medium / high tier: CC0 prop models (chandeliers, fauteuils) instead of the procedural ones. */
  detailed: boolean;
}

export function lookOf(era: Era, mode: FullPlan['mode'], detailed = false): Look {
  return { era, mode, lit: era === '1789', looted: era === '1793-07', sheets: era === '1793-02', detailed };
}

export interface Built {
  geo: GeoBuf;
  lights: LightSpot[];
  flames: FlameSpot[];
  /** Global room index per local index. */
  rooms: number[];
  local: Map<number, number>;
  /** Collision outlines of large props. */
  solids: Wall[];
  /** CC0 prop models to instance beside the mesh (detailed looks only). */
  models: ModelPlacement[];
}

// ---- palette ----------------------------------------------------------------------------------
export const C = {
  plaster: lin(0xd8d0bf),
  plasterWarm: lin(0xd9c9a8),
  plasterCool: lin(0xc9cbc4),
  boiserie: lin(0xece5d3),
  boiserieWood: lin(0x6b4a2c),
  boiserieGrey: lin(0xb9c2b4),
  damaskGreen: lin(0x35573b),
  damaskRed: lin(0x7c2b25),
  damaskBlue: lin(0x3b4f72),
  damaskGold: lin(0x9d7c3c),
  bare: lin(0xb3a691),
  parquet: lin(0x8c5a30),
  boards: lin(0x7b5b3b),
  flags: lin(0xbdb4a2),
  checker: lin(0xdcd5c6),
  cobble: lin(0x8c8479),
  ceiling: lin(0xf0eadc),
  wood: lin(0x4b2f1b),
  woodLight: lin(0x8a6440),
  painted: lin(0xe7e1d2),
  gilt: lin(0xb48d3c),
  stone: lin(0xc9c1b1),
  marble: lin(0xd6d0c4),
  iron: lin(0x2e2e30),
  masonry: lin(0x948a7a),
  ruin: lin(0x81776a),
  moss: lin(0x8a8a74),
  soot: lin(0x2a2522),
  doorBrown: lin(0x4a2a14),
} as const;

const S = (col: RGB, mat: number, room: number, aux?: readonly [number, number, number, number]): Surf => ({ col, mat, room, aux });

/** Wall finish of a room in an era. */
function wallFinish(r: PlanRoom, look: Look): { col: RGB; mat: number } {
  switch (r.kind) {
    case 'festsaal':
      return { col: C.boiserie, mat: M.BOISERIE };
    case 'gallery':
      return { col: C.damaskGreen, mat: M.DAMASK };
    case 'salon':
      return { col: C.damaskRed, mat: M.DAMASK };
    case 'bedroom':
      return { col: C.damaskBlue, mat: M.DAMASK };
    case 'cabinet':
    case 'prints':
      return { col: C.damaskGold, mat: M.DAMASK };
    case 'dining':
      return { col: C.boiserieGrey, mat: M.BOISERIE };
    case 'library':
    case 'study':
      return { col: C.boiserieWood, mat: M.BOISERIE };
    case 'temple':
      return { col: C.marble, mat: M.MARBLE };
    case 'kitchen':
    case 'gunsmith':
      return { col: C.masonry, mat: M.MASONRY };
    case 'vestibule':
    case 'stair':
      return { col: look.looted ? C.plasterCool : C.stone, mat: M.PLASTER };
    case 'naturalia':
    case 'arms':
      return { col: C.plasterWarm, mat: M.PLASTER };
    default:
      return { col: C.plaster, mat: M.PLASTER };
  }
}

function floorFinish(r: PlanRoom): { col: RGB; mat: number } {
  if (r.kind === 'vestibule') return { col: C.checker, mat: M.CHECKER };
  if (r.kind === 'passage') return { col: C.cobble, mat: M.COBBLE };
  if (r.kind === 'temple') return { col: C.marble, mat: M.MARBLE };
  if (r.floorKind === 'parquet') return { col: C.parquet, mat: M.PARQUET };
  if (r.floorKind === 'boards') return { col: C.boards, mat: M.BOARDS };
  return { col: C.flags, mat: M.FLAGS };
}

/** Openings (doors + windows) on one room edge, in edge parameters. */
export interface EdgeOp {
  s0: number;
  s1: number;
  y0: number;
  y1: number;
  door: Door | null;
  win: Win | null;
}

export function edgeOps(plan: FullPlan, r: PlanRoom, ei: number): EdgeOp[] {
  const e = r.edges[ei]!;
  const out: EdgeOp[] = [];
  for (const o of r.openings) if (o.edge === ei && o.kind === 'door') out.push({ s0: Math.max(0, o.s0), s1: Math.min(e.len, o.s1), y0: o.y0, y1: o.y1, door: plan.doors[o.ref]!, win: null });
  for (const w of plan.windows) {
    if (w.room !== r.index || w.edge !== ei) continue;
    const s = paramOf(e, w.cx, w.cz);
    out.push({ s0: Math.max(0, s - w.width / 2), s1: Math.min(e.len, s + w.width / 2), y0: w.y0, y1: w.y1, door: null, win: w });
  }
  return out.sort((a, b) => a.s0 - b.s0);
}

/** Point on an edge at parameter s, pushed off the wall by `off` (positive = into the room). */
export function onEdge(e: Edge, s: number, off: number): [number, number] {
  const [x, z] = along(e, s);
  return [x - e.nx * off, z - e.nz * off];
}

/** Vertical quad on a room edge from s0 to s1, y0 to y1, `off` into the room, facing the room. */
export function wallQuad(g: GeoBuf, e: Edge, s0: number, s1: number, y0: number, y1: number, off: number, s: Surf, yRef: number): void {
  if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) return;
  const [ax, az] = onEdge(e, s0, off);
  const [bx, bz] = onEdge(e, s1, off);
  g.quad([bx, y0, bz], [ax, y0, az], [ax, y1, az], [bx, y1, bz], [-e.nx, 0, -e.nz], s, [
    [s1, y0 - yRef],
    [s0, y0 - yRef],
    [s0, y1 - yRef],
    [s1, y1 - yRef],
  ]);
}

/** Box against a wall: s0..s1 along the edge, depth into the room, y0..y1. */
export function wallBox(g: GeoBuf, e: Edge, s0: number, s1: number, off: number, depth: number, y0: number, y1: number, s: Surf): void {
  const [cx, cz] = onEdge(e, (s0 + s1) / 2, off + depth / 2);
  g.box(cx, y0, cz, e.tx, e.tz, s1 - s0, depth, y1 - y0, s);
}

/** Box outline as collision segments. */
export function boxSolid(cx: number, cz: number, ux: number, uz: number, su: number, sv: number, y0: number, y1: number, building: string): Wall[] {
  const vx = -uz;
  const vz = ux;
  const c: [number, number][] = [
    [cx - ux * su / 2 - vx * sv / 2, cz - uz * su / 2 - vz * sv / 2],
    [cx + ux * su / 2 - vx * sv / 2, cz + uz * su / 2 - vz * sv / 2],
    [cx + ux * su / 2 + vx * sv / 2, cz + uz * su / 2 + vz * sv / 2],
    [cx - ux * su / 2 + vx * sv / 2, cz - uz * su / 2 + vz * sv / 2],
  ];
  const out: Wall[] = [];
  for (let k = 0; k < 4; k++) {
    const p = c[k]!;
    const q = c[(k + 1) % 4]!;
    out.push({ ax: p[0], az: p[1], bx: q[0], bz: q[1], y0, y1, kind: 'block', building });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------

export function buildInterior(plan: FullPlan, building: string, look: Look, terrain: (x: number, z: number) => number): Built {
  const bp = plan.buildings.find((b) => b.id === building);
  const g = new GeoBuf();
  const out: Built = { geo: g, lights: [], flames: [], rooms: [], local: new Map(), solids: [], models: [] };
  if (!bp) return out;
  bp.rooms.forEach((ri, li) => {
    out.rooms.push(ri);
    out.local.set(ri, li);
  });
  if (look.mode === 'today') {
    buildFoundations(g, plan, building, terrain);
    return out;
  }
  if (look.mode === 'ruin') {
    buildRuin(g, plan, building, terrain, out);
    return out;
  }
  for (const ri of bp.rooms) {
    const r = plan.rooms[ri]!;
    const li = out.local.get(ri)!;
    buildRoomShell(g, plan, r, li, look);
    furnish({ g, plan, room: r, local: li, look, built: out, terrain });
    fireSpots(plan, r, li, out, look);
    if (look.looted) burningBeams(g, r, li);
  }
  // door passages + outdoor steps (once per door, owned by the building of room a)
  for (const d of plan.doors) {
    if (d.building !== building) continue;
    buildDoor(g, plan, d, out.local.get(d.a) ?? -1, look, terrain);
  }
  return out;
}

// ---- intact rooms ----------------------------------------------------------------------------------

function buildRoomShell(g: GeoBuf, plan: FullPlan, r: PlanRoom, li: number, look: Look): void {
  const low = r.stair ? r.stair.low : r.floor;
  const wf = wallFinish(r, look);
  const wallH = r.ceiling - low;
  const f = r.frame;
  const fUV = (x: number, z: number): [number, number] => {
    const dx = x - f.ox;
    const dz = z - f.oz;
    return [dx * f.ux + dz * f.uz, dx * f.vx + dz * f.vz];
  };
  // floor
  const ff = floorFinish(r);
  if (!r.stair) g.poly(r.poly, r.floor, true, S(ff.col, ff.mat, li), fUV);
  else buildStair(g, r, li, look);
  if (r.deco) buildDecoFlight(g, r, li);
  // ceiling
  const gilt = r.kind === 'festsaal' || r.kind === 'gallery' || r.kind === 'salon' || r.kind === 'temple' ? 1 : 0;
  g.poly(r.poly, r.ceiling, false, S(C.ceiling, M.CEILING, li, [f.L, f.W, gilt, 0]), fUV);
  // walls
  const rnd = rng(seedOf(r.id));
  r.edges.forEach((e, ei) => {
    const ops = edgeOps(plan, r, ei);
    // breakpoints
    const bps = new Set<number>([0, e.len]);
    for (const o of ops) {
      bps.add(o.s0);
      bps.add(o.s1);
    }
    const xs = [...bps].filter((s) => s >= 0 && s <= e.len).sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k++) {
      const s0 = xs[k]!;
      const s1 = xs[k + 1]!;
      if (s1 - s0 < 1e-3) continue;
      const m = (s0 + s1) / 2;
      const o = ops.find((q) => q.s0 <= m && q.s1 >= m);
      let fin = wf;
      if (look.looted && r.kind === 'festsaal' && hash1(Math.floor((m + seedOf(r.id) % 7) / 2.64), ei, 5) < 0.5) fin = { col: C.bare, mat: M.BARE };
      const surf = S(fin.col, fin.mat, li, [wallH, 0, 0, 0]);
      if (!o) wallQuad(g, e, s0, s1, low, r.ceiling, 0, surf, low);
      else {
        wallQuad(g, e, s0, s1, low, Math.max(low, o.y0), 0, surf, low);
        wallQuad(g, e, s0, s1, Math.min(r.ceiling, o.y1), r.ceiling, 0, surf, low);
      }
      // skirting (not across doors)
      if (!o?.door && !r.stair && fin.mat !== M.MASONRY) wallBox(g, e, s0, s1, 0, 0.025, low, low + (fin.mat === M.DAMASK ? 0.0 : 0.14), S(fin.mat === M.BOISERIE ? fin.col : C.wood, M.WOOD, li));
    }
    // cornice: a plain moulding along the top
    if (r.kind !== 'kitchen' && r.kind !== 'passage') {
      const cs = S(r.kind === 'festsaal' || r.kind === 'gallery' ? C.gilt : C.ceiling, r.kind === 'festsaal' || r.kind === 'gallery' ? M.GILT : M.PLASTER, li);
      wallBox(g, e, 0, e.len, 0, 0.12, r.ceiling - 0.16, r.ceiling, cs);
    }
    for (const o of ops) if (o.win) buildWindow(g, e, o.win, li, r, look, rnd);
  });
  // stair dividers (full-height thin walls)
  if (r.stair) {
    for (const d of r.stair.dividers) {
      const [ax, az] = frameXZ(f, d.u0, d.v0);
      const [bx, bz] = frameXZ(f, d.u1, d.v1);
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.05) continue;
      g.box((ax + bx) / 2, low - 0.05, (az + bz) / 2, (bx - ax) / L, (bz - az) / L, L, 0.3, r.ceiling - low, S(wf.col, M.PLASTER, li, [wallH, 0, 0, 0]));
    }
  }
}

function buildWindow(g: GeoBuf, e: Edge, w: Win, li: number, r: PlanRoom, look: Look, rnd: () => number): void {
  const s = paramOf(e, w.cx, w.cz);
  const s0 = s - w.width / 2;
  const s1 = s + w.width / 2;
  const depth = Math.max(0.12, Math.min(w.depth, w.reveal > 0.05 ? w.reveal : 0.4));
  const reveal = S(r.kind === 'festsaal' ? C.boiserie : C.plaster, r.kind === 'festsaal' ? M.BOISERIE : M.PLASTER, li, [w.y1 - w.y0, 0, 0, 0]);
  // jambs, sill, head (from the room face out to the glazing)
  const P = (ss: number, off: number, y: number): V3 => {
    const [x, z] = onEdge(e, ss, -off);
    return [x, y, z];
  };
  g.quad(P(s0, 0, w.y0), P(s0, depth, w.y0), P(s0, depth, w.y1), P(s0, 0, w.y1), [e.tx, 0, e.tz], reveal, [[0, 0], [depth, 0], [depth, w.y1 - w.y0], [0, w.y1 - w.y0]]);
  g.quad(P(s1, depth, w.y0), P(s1, 0, w.y0), P(s1, 0, w.y1), P(s1, depth, w.y1), [-e.tx, 0, -e.tz], reveal, [[0, 0], [depth, 0], [depth, w.y1 - w.y0], [0, w.y1 - w.y0]]);
  const sill = S(r.kind === 'festsaal' || r.kind === 'gallery' ? C.marble : C.stone, M.MARBLE, li);
  g.quad(P(s0, 0, w.y0), P(s1, 0, w.y0), P(s1, depth, w.y0), P(s0, depth, w.y0), [0, 1, 0], sill, [[0, 0], [w.width, 0], [w.width, depth], [0, depth]]);
  g.quad(P(s1, 0, w.y1), P(s0, 0, w.y1), P(s0, depth, w.y1), P(s1, depth, w.y1), [0, -1, 0], reveal, [[0, 0], [w.width, 0], [w.width, depth], [0, depth]]);
  // glazing bars at the inner pane: frame, mullion, transoms (open between: the shell glass is cut)
  const bar = S(C.painted, M.WOOD, li);
  const broken = look.looted && rnd() < 0.25;
  const d0 = depth - 0.03;
  const [fx, fz] = onEdge(e, s, -d0);
  const H = w.y1 - w.y0;
  g.box(fx, w.y0, fz, e.tx, e.tz, w.width, 0.06, 0.07, bar);
  g.box(fx, w.y1 - 0.07, fz, e.tx, e.tz, w.width, 0.06, 0.07, bar);
  for (const ss of [s0 + 0.035, s1 - 0.035]) {
    const [x, z] = onEdge(e, ss, -d0);
    g.box(x, w.y0, z, e.tx, e.tz, 0.07, 0.06, H, bar);
  }
  if (!broken) {
    g.box(fx, w.y0, fz, e.tx, e.tz, 0.06, 0.06, H, bar);
    const panes = Math.max(2, Math.round(H / 0.55));
    for (let k = 1; k < panes; k++) g.box(fx, w.y0 + (H * k) / panes - 0.015, fz, e.tx, e.tz, w.width, 0.04, 0.03, bar);
  }
  // curtains in the state rooms (1789, 1793-02)
  // 1793-07: the looters left the heavy curtains of the Festsaal and the salons; they burn first
  if ((!look.looted && (r.kind === 'festsaal' || r.kind === 'salon' || r.kind === 'bedroom' || r.kind === 'dining')) || (look.looted && (r.kind === 'festsaal' || r.kind === 'salon'))) {
    const cs = S(look.looted ? lin(0x4a1512) : r.kind === 'festsaal' ? lin(0x7a1e1e) : r.kind === 'bedroom' ? lin(0x34456a) : lin(0x6c2a20), M.FABRIC, li);
    for (const [a, b] of [
      [s0 - 0.42, s0 - 0.02],
      [s1 + 0.02, s1 + 0.42],
    ] as const) {
      if (a < 0.05 || b > e.len - 0.05) continue;
      wallBox(g, e, a, b, 0.06, 0.12, w.y0 - 0.6 < r.floor ? r.floor + 0.02 : w.y0 - 0.6, Math.min(r.ceiling - 0.2, w.y1 + 0.35), cs);
    }
    wallBox(g, e, s0 - 0.5, s1 + 0.5, 0.04, 0.2, Math.min(r.ceiling - 0.2, w.y1 + 0.35), Math.min(r.ceiling - 0.05, w.y1 + 0.6), S(C.gilt, M.GILT, li));
  }
}

function buildDoor(g: GeoBuf, plan: FullPlan, d: Door, li: number, look: Look, terrain: (x: number, z: number) => number): void {
  const a = plan.rooms[d.a]!;
  const b = d.b >= 0 ? plan.rooms[d.b]! : null;
  const outer = d.b < 0;
  const ruin = look.mode === 'ruin';
  const h = d.top - d.floor;
  const hw = d.width / 2;
  const P = (t: number, n: number, y: number): V3 => [d.cx + d.tx * t + d.nx * n, y, d.cz + d.tz * t + d.nz * n];
  const passFin = outer || a.floorKind === 'stone' ? S(C.stone, M.FLAGS, li) : S(C.parquet, M.BOARDS, li);
  const jamb = S(outer ? C.stone : C.plaster, outer ? M.MASONRY : M.PLASTER, li, [h, 0, 0, 0]);
  // passage floor
  g.quad(P(-hw, 0, d.floor), P(hw, 0, d.floor), P(hw, d.depth, d.floor), P(-hw, d.depth, d.floor), [0, 1, 0], passFin, [[0, 0], [d.width, 0], [d.width, d.depth], [0, d.depth]]);
  if (!ruin) {
    // jambs + soffit
    g.quad(P(-hw, d.depth, d.floor), P(-hw, 0, d.floor), P(-hw, 0, d.top), P(-hw, d.depth, d.top), [d.tx, 0, d.tz], jamb, [[0, 0], [d.depth, 0], [d.depth, h], [0, h]]);
    g.quad(P(hw, 0, d.floor), P(hw, d.depth, d.floor), P(hw, d.depth, d.top), P(hw, 0, d.top), [-d.tx, 0, -d.tz], jamb, [[0, 0], [d.depth, 0], [d.depth, h], [0, h]]);
    g.quad(P(-hw, 0, d.top), P(hw, 0, d.top), P(hw, d.depth, d.top), P(-hw, d.depth, d.top), [0, -1, 0], jamb, [[0, 0], [d.width, 0], [d.width, d.depth], [0, d.depth]]);
    // architraves on both faces
    const fancy = (r: PlanRoom | null) => !!r && (r.kind === 'festsaal' || r.kind === 'salon' || r.kind === 'gallery' || r.kind === 'temple');
    for (const [side, r] of [
      [0, a],
      [d.depth, b],
    ] as const) {
      if (outer && side > 0) continue;
      const sgn = side === 0 ? -1 : 1;
      const surf = fancy(r) ? S(C.gilt, M.GILT, li) : S(C.painted, M.WOOD, li);
      const off = side + sgn * 0.03;
      for (const t of [-hw - 0.07, hw + 0.07]) {
        const p = P(t, off, d.floor);
        g.box(p[0], d.floor, p[2], d.tx, d.tz, 0.14, 0.06, h + 0.14, surf);
      }
      const p = P(0, off, d.top);
      g.box(p[0], d.top, p[2], d.tx, d.tz, d.width + 0.28, 0.06, 0.14, surf);
    }
    // opened leaves, folded back against room a's wall (some missing in the looted palace)
    const e = a.edges[d.edge]!;
    const s = paramOf(e, d.cx, d.cz);
    const ops = edgeOps(plan, a, d.edge).filter((o) => o.door !== d);
    const leafW = outer ? hw : hw;
    const leafSurf = outer ? S(C.doorBrown, M.WOOD, li) : S(a.kind === 'festsaal' ? C.boiserie : C.painted, M.BOISERIE, li, [h - 0.05, 0, 0, 0]);
    for (const sgn of [-1, 1]) {
      if (look.looted && hash1(d.index, sgn + 3, 9) < 0.35) continue;
      const l0 = sgn < 0 ? s - hw - leafW : s + hw;
      const l1 = l0 + leafW;
      if (l0 < 0.05 || l1 > e.len - 0.05 || ops.some((o) => !(l1 < o.s0 || l0 > o.s1))) continue;
      wallBox(g, e, l0 + 0.02, l1 - 0.02, 0.0, 0.05, d.floor + 0.02, d.top - 0.04, leafSurf);
    }
  }
  // outdoor steps
  if (d.stoop) {
    const L = d.stoop.length;
    const dh = d.stoop.ground - d.floor;
    const n = Math.max(1, Math.round(Math.abs(dh) / 0.16));
    const stepS = S(ruin ? C.ruin : C.stone, M.STEP, -1);
    const w = d.width + 0.9;
    // a landing in front of the door, then the flight
    const landing = Math.min(0.6, L * 0.3);
    const flight = L - landing;
    const tread = flight / n;
    const base = Math.min(d.floor, d.stoop.ground) - 0.6;
    const p0 = P(0, d.depth + landing / 2, 0);
    g.box(p0[0], base, p0[2], d.nx, d.nz, landing, w, d.floor - base, stepS);
    for (let k = 0; k < n; k++) {
      const c = P(0, d.depth + landing + tread * (k + 0.5), 0);
      const yy = d.floor + (dh * (k + 1)) / n;
      const b0 = Math.min(terrain(c[0], c[2]), yy) - 0.6;
      g.box(c[0], b0, c[2], d.nx, d.nz, tread, w, yy - b0, stepS);
    }
  }
}

// ---- stairs ------------------------------------------------------------------------------------

function buildStair(g: GeoBuf, r: PlanRoom, li: number, look: Look): void {
  const st = r.stair!;
  const f = r.frame;
  const grand = Math.min(f.L, f.W) >= 9;
  const stepS = S(grand ? C.marble : C.stone, M.STEP, li);
  const landS = S(grand ? C.checker : C.flags, grand ? M.CHECKER : M.FLAGS, li);
  const low = st.low;
  const XZ = (u: number, v: number) => frameXZ(f, u, v);
  for (const z of st.zones) {
    const cu = (z.u0 + z.u1) / 2;
    const cv = (z.v0 + z.v1) / 2;
    const su = z.u1 - z.u0;
    const sv = z.v1 - z.v0;
    if (z.kind === 'landing' || Math.abs(z.k) < 1e-4) {
      if (z.h0 - low < 0.02) {
        const pts = [XZ(z.u0, z.v0), XZ(z.u1, z.v0), XZ(z.u1, z.v1), XZ(z.u0, z.v1)];
        g.poly(pts, z.h0, true, landS, (x, zz) => [x, zz]);
      } else {
        const [cx, cz] = XZ(cu, cv);
        g.box(cx, low - 0.02, cz, f.ux, f.uz, su, sv, z.h0 - low + 0.02, landS);
      }
      continue;
    }
    const dh = z.k * su;
    const n = Math.max(2, Math.round(Math.abs(dh) / 0.165));
    const du = su / n;
    for (let j = 0; j < n; j++) {
      const um = z.u0 + du * (j + 0.5);
      const top = z.h0 + z.k * (um - z.u0) + Math.sign(z.k) * Math.abs(dh) / n / 2;
      const [cx, cz] = XZ(um, cv);
      const y0 = low - 0.02;
      if (top - y0 < 0.01) continue;
      g.box(cx, y0, cz, f.ux, f.uz, du + 0.002, sv, top - y0, stepS);
    }
  }
  buildRailings(g, r, li, look);
}

/** Balustrades wherever a walkable zone drops by more than 0.45 m to its neighbour inside the hall. */
function buildRailings(g: GeoBuf, r: PlanRoom, li: number, look: Look): void {
  const st = r.stair!;
  const f = r.frame;
  const grand = Math.min(f.L, f.W) >= 9;
  const rail = S(grand ? C.gilt : C.wood, grand ? M.GILT : M.WOOD, li);
  const post = S(grand ? C.iron : C.stone, grand ? M.IRON : M.STEP, li);
  for (const z of st.zones) {
    const sides: [number, number, number, number, number, number][] = [
      // start u, start v, end u, end v, outward du, dv
      [z.u0, z.v0, z.u1, z.v0, 0, -1],
      [z.u0, z.v1, z.u1, z.v1, 0, 1],
      [z.u0, z.v0, z.u0, z.v1, -1, 0],
      [z.u1, z.v0, z.u1, z.v1, 1, 0],
    ];
    for (const [u0, v0, u1, v1, ou, ov] of sides) {
      const len = Math.hypot(u1 - u0, v1 - v0);
      const n = Math.max(1, Math.round(len / 0.28));
      let run: V3[] = [];
      const flush = () => {
        if (run.length >= 2) for (let k = 0; k + 1 < run.length; k++) g.beam(run[k]!, run[k + 1]!, 0.07, 0.06, rail);
        run = [];
      };
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const u = u0 + (u1 - u0) * t - ou * 0.06;
        const v = v0 + (v1 - v0) * t - ov * 0.06;
        const uo = u + ou * 0.3;
        const vo = v + ov * 0.3;
        if (uo < 0.05 || uo > f.L - 0.05 || vo < 0.05 || vo > f.W - 0.05) {
          flush();
          continue;
        }
        const hin = z.h0 + z.k * (Math.min(z.u1, Math.max(z.u0, u)) - z.u0);
        const hout = stairHeight(st, uo, vo);
        if (hout !== null && hout > hin - 0.45) {
          flush();
          continue;
        }
        const [x, zz] = frameXZ(f, u, v);
        g.prism(x, hin, zz, 0.03, 0.9, 4, post);
        run.push([x, hin + 0.92, zz]);
      }
      flush();
    }
  }
  void look;
}

function buildDecoFlight(g: GeoBuf, r: PlanRoom, li: number): void {
  const d = r.deco!;
  const f = r.frame;
  const top = r.ceiling - 0.05;
  const rise = top - r.floor;
  const n = Math.max(4, Math.round(rise / 0.17));
  const du = (d.u1 - d.u0) / n;
  const stepS = S(C.stone, M.STEP, li);
  for (let j = 0; j < n; j++) {
    const [cx, cz] = frameXZ(f, d.u0 + du * (j + 0.5), (d.v0 + d.v1) / 2);
    g.box(cx, r.floor - 0.02, cz, f.ux, f.uz, du + 0.002, d.v1 - d.v0, (rise * (j + 1)) / n + 0.02, stepS);
  }
  // a balustrade on the open side
  const vOpen = d.v0 < 0.01 ? d.v1 : d.v0;
  const rail = S(C.wood, M.WOOD, li);
  let prev: V3 | null = null;
  for (let j = 0; j <= n; j += 2) {
    const u = d.u0 + du * j;
    const h = r.floor + (rise * j) / n;
    const [x, z] = frameXZ(f, u, vOpen);
    g.prism(x, h, z, 0.03, 0.9, 4, S(C.stone, M.STEP, li));
    const p: V3 = [x, h + 0.92, z];
    if (prev) g.beam(prev, p, 0.07, 0.06, rail);
    prev = p;
  }
}

// ---- fire spots -----------------------------------------------------------------------------------

function fireSpots(plan: FullPlan, r: PlanRoom, li: number, out: Built, look: Look): void {
  const f = r.frame;
  const nu = Math.max(1, Math.min(5, Math.round(f.L / 4)));
  const nv = Math.max(1, Math.min(3, Math.round(f.W / 4)));
  const base = seedOf(r.id) % 1000;
  const roomH = r.ceiling - r.floor;
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const u = ((i + 0.5) / nu) * f.L + (hash1(base, i, j) - 0.5) * 1.2;
      const v = ((j + 0.5) / nv) * f.W + (hash1(base, j, i + 9) - 0.5) * 1.0;
      const [x, z] = frameXZ(f, u, v);
      if (!pointInPoly(x, z, r.poly)) continue;
      const y = r.stair ? stairHeight(r.stair, u, v) ?? r.floor : r.floor;
      const seed = hash1(base, i * 7 + j, 3);
      out.flames.push({ x, y, z, w: 1.4 + seed, h: 1.6 + 1.6 * seed, kind: 1, room: li, seed });
      out.flames.push({ x, y, z, w: 2.5, h: Math.max(2, r.ceiling - y - 0.3), kind: 2, room: li, seed: seed * 0.7 + 0.1 });
      // embers raining down from the burning ceiling (seed ≥ 2 = falling)
      if ((i + j) % 2 === 0) out.flames.push({ x, y, z, w: 3.2, h: Math.max(2, r.ceiling - y - 0.2), kind: 2, room: li, seed: 2 + hash1(base, i, j + 31) });
      // rolling smoke under the ceiling
      if (!r.stair) out.flames.push({ x, y: r.ceiling - 0.8, z, w: 3.6, h: 3.6, kind: 3, room: li, seed: hash1(base, i + 3, j + 5) });
    }
  if (look.mode === 'intact' && !r.stair) {
    // flames licking up the walls: the curtains at the windows first, then the panelling
    r.edges.forEach((e, ei) => {
      const ops = edgeOps(plan, r, ei);
      for (const o of ops) {
        if (!o.win) continue;
        for (const ss of [o.s0 - 0.25, o.s1 + 0.25]) {
          if (ss < 0.3 || ss > e.len - 0.3) continue;
          const [x, z] = onEdge(e, ss, 0.32);
          const seed = hash1(base, ei * 17 + Math.round(ss * 10), 7);
          out.flames.push({ x, y: r.floor, z, w: 1.1 + 0.4 * seed, h: Math.min(roomH - 0.2, (o.y1 - r.floor) + 0.5), kind: 1, room: li, seed });
        }
      }
      // tongues along the bare stretches of wall
      for (let s0 = 1.2; s0 < e.len - 1.2; s0 += 3.4) {
        const seed = hash1(base, ei * 13 + Math.round(s0), 11);
        if (seed < 0.35) continue;
        if (ops.some((o) => s0 > o.s0 - 0.6 && s0 < o.s1 + 0.6)) continue;
        const [x, z] = onEdge(e, s0 + (seed - 0.5), 0.38);
        out.flames.push({ x, y: r.floor, z, w: 1.5 + seed, h: Math.min(roomH - 0.3, 1.8 + 2.4 * seed), kind: 1, room: li, seed });
      }
    });
  }
  // flames licking out through the doors
  for (const d of plan.doors) {
    if (d.a !== r.index && d.b !== r.index) continue;
    const side = d.a === r.index ? -0.35 : d.depth + 0.35;
    const x = d.cx + d.nx * side;
    const z = d.cz + d.nz * side;
    const seed = hash1(d.index, li, 4);
    out.flames.push({ x, y: d.floor, z, w: d.width * 0.9, h: Math.min(2.6, d.top - d.floor), kind: 1, room: li, seed });
    // smoke rolling out of the door head into the next room / outside
    const so = d.a === r.index ? d.depth + 0.6 : -0.6;
    out.flames.push({ x: d.cx + d.nx * so, y: d.top - 0.3, z: d.cz + d.nz * so, w: d.width * 1.6, h: 1.6, kind: 3, room: li, seed });
  }
}

/** Ceiling joists that show once the plaster falls (1793-07): only drawn while the room burns (aux.w = 7). */
function burningBeams(g: GeoBuf, r: PlanRoom, li: number): void {
  if (r.stair) return;
  const f = r.frame;
  const across = f.W < f.L; // beams span the short way
  const span = across ? f.W : f.L;
  const run = across ? f.L : f.W;
  if (span > 14 || r.ceiling - r.floor < 2.6) return;
  const n = Math.max(1, Math.floor(run / 1.6));
  const surf = S(C.soot, M.CHARRED, li, [0, 0, 0, 7]);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) * (run / n);
    const [ax, az] = across ? frameXZ(f, t, 0.15) : frameXZ(f, 0.15, t);
    const [bx, bz] = across ? frameXZ(f, t, span - 0.15) : frameXZ(f, span - 0.15, t);
    // a few have broken loose at one end and hang
    const sag = hash1(seedOf(r.id), k, 21) < 0.2 ? 0.5 + hash1(seedOf(r.id), k, 23) * 0.6 : 0;
    g.beam([ax, r.ceiling - 0.14, az], [bx, r.ceiling - 0.14 - sag, bz], 0.2, 0.24, surf);
  }
}

// ---- 1796: ruins ---------------------------------------------------------------------------------

function buildRuin(g: GeoBuf, plan: FullPlan, building: string, terrain: (x: number, z: number) => number, out: Built): void {
  const bp = plan.buildings.find((b) => b.id === building)!;
  const cap = S(C.soot, M.CHARRED, -1);
  for (const ri of bp.rooms) {
    const r = plan.rooms[ri]!;
    const li = out.local.get(ri)!;
    const rnd = rng(seedOf(r.id) ^ 0x5eed);
    const f = r.frame;
    const fUV = (x: number, z: number): [number, number] => [x, z];
    // the floor: flags under dust and rubble
    g.poly(r.poly, r.floor, true, r.floorKind === 'stone' ? S(C.flags, M.FLAGS, li) : S(C.ruin, M.RUBBLE, li), fUV);
    // walls: stubs of the inner face (same chunks as the collision)
    r.edges.forEach((e, ei) => {
      const doors = r.openings.filter((o) => o.edge === ei && o.kind === 'door').sort((p, q) => p.s0 - q.s0);
      let s = 0;
      const spans: [number, number][] = [];
      for (const o of doors) {
        if (o.s0 > s + 1e-3) spans.push([s, o.s0]);
        s = Math.max(s, o.s1);
      }
      if (e.len > s + 1e-3) spans.push([s, e.len]);
      for (const [s0, s1] of spans) {
        const [ax, az] = along(e, s0);
        const [bx, bz] = along(e, s1);
        for (const c of ruinChunks(r.building, ax, az, bx, bz, !r.ext.some((q) => q.edge === ei))) {
          const L = Math.hypot(c.seg.bx - c.seg.ax, c.seg.bz - c.seg.az);
          const cx = (c.seg.ax + c.seg.bx) / 2 + e.nx * 0.22;
          const cz = (c.seg.az + c.seg.bz) / 2 + e.nz * 0.22;
          const y0 = r.floor - 0.3;
          const tint = 0.8 + 0.28 * hash1(Math.round(cx * 2), Math.round(cz * 2), 5);
          g.box(cx, y0, cz, e.tx, e.tz, L + 0.02, 0.44, c.h + 0.3, S([C.ruin[0] * tint, C.ruin[1] * tint, C.ruin[2] * tint], M.MASONRY, li));
          if (c.h > 1.2) g.box(cx, r.floor + c.h - 0.04, cz, e.tx, e.tz, L * 0.7, 0.3, 0.06, cap);
        }
      }
    });
    // rubble heaps along the walls and in the middle, charred rafters, weeds
    const nHeaps = Math.round(Math.min(10, 2 + Math.abs(r.area) / 18));
    for (let k = 0; k < nHeaps; k++) {
      const u = 0.6 + rnd() * (f.L - 1.2);
      const v = rnd() < 0.6 ? (rnd() < 0.5 ? 0.6 + rnd() * 0.8 : f.W - 0.6 - rnd() * 0.8) : 0.6 + rnd() * (f.W - 1.2);
      const [x, z] = frameXZ(f, u, v);
      const s = 0.5 + rnd() * 1.1;
      g.blob(x, r.floor, z, s * 1.4, s * 0.55, s * 1.2, S(C.ruin, M.RUBBLE, -1), 0.3, k + 1);
    }
    const nBeams = Math.round(Math.min(5, 1 + Math.abs(r.area) / 40));
    for (let k = 0; k < nBeams; k++) {
      const u = 1 + rnd() * (f.L - 2);
      const v = 1 + rnd() * (f.W - 2);
      const [x, z] = frameXZ(f, u, v);
      const a = rnd() * Math.PI;
      const L = 2 + rnd() * 3;
      const lift = rnd() * 0.9;
      g.beam([x - Math.cos(a) * L / 2, r.floor + 0.12, z - Math.sin(a) * L / 2], [x + Math.cos(a) * L / 2, r.floor + 0.12 + lift, z + Math.sin(a) * L / 2], 0.22, 0.2, S(C.soot, M.CHARRED, -1));
    }
    for (let k = 0; k < 6; k++) {
      const [x, z] = frameXZ(f, 0.4 + rnd() * (f.L - 0.8), 0.4 + rnd() * (f.W - 0.8));
      g.blob(x, r.floor + 0.05, z, 0.35, 0.25 + rnd() * 0.3, 0.35, S(lin(0x4d5a2a), M.FOLIAGE, -1), 0.4, k + 7);
    }
  }
  // outer walls: broken facade stubs (thick), matching the collision chunks
  const ring = bp.ring;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.05) continue;
    const tx = (b[0] - a[0]) / L;
    const tz = (b[1] - a[1]) / L;
    // inward = left of a CCW ring
    const nx = -tz;
    const nz = tx;
    const cuts = plan.doors.filter((d) => d.b === -1 && d.building === building);
    for (const c of ruinChunks(building, a[0], a[1], b[0], b[1])) {
      const mx = (c.seg.ax + c.seg.bx) / 2;
      const mz = (c.seg.az + c.seg.bz) / 2;
      if (cuts.some((d) => Math.hypot(d.cx + d.nx * d.depth - mx, d.cz + d.nz * d.depth - mz) < d.width / 2 + 0.3)) continue;
      const len = Math.hypot(c.seg.bx - c.seg.ax, c.seg.bz - c.seg.az);
      const t = terrain(mx, mz);
      const y0 = Math.min(t, bp.floor) - 0.6;
      const top = bp.floor + c.h;
      // weathered, here and there blackened by the fire
      const tint = 0.78 + 0.3 * hash1(Math.round(mx * 2), Math.round(mz * 2), 3);
      const soot = hash1(Math.round(mx), Math.round(mz), 4) < 0.3 ? 0.55 : 1;
      const col: RGB = [C.ruin[0] * tint * soot, C.ruin[1] * tint * soot, C.ruin[2] * tint * soot];
      g.box(mx + nx * 0.45, y0, mz + nz * 0.45, tx, tz, len + 0.02, 0.9, top - y0, S(col, M.MASONRY, -1));
      if (c.h > 1.5) g.box(mx + nx * 0.45, top - 0.03, mz + nz * 0.45, tx, tz, len * 0.8, 0.6, 0.05, S(lin(0x5f6a3a), M.MOSS, -1));
    }
  }
  // door passages keep their thresholds
  for (const d of plan.doors) if (d.building === building) buildDoor(g, plan, d, out.local.get(d.a) ?? -1, lookOf('1796', 'ruin'), terrain);
}

// ---- today: foundations --------------------------------------------------------------------------------

function buildFoundations(g: GeoBuf, plan: FullPlan, building: string, terrain: (x: number, z: number) => number): void {
  const bp = plan.buildings.find((b) => b.id === building)!;
  const mossS = S(C.moss, M.MOSS, -1);
  const lines: { a: [number, number]; b: [number, number]; w: number }[] = [];
  for (const ri of bp.rooms) {
    const r = plan.rooms[ri]!;
    if (r.storey !== Math.min(...bp.storeys)) continue;
    for (const e of r.edges) lines.push({ a: [e.ax + e.nx * 0.2, e.az + e.nz * 0.2], b: [e.bx + e.nx * 0.2, e.bz + e.nz * 0.2], w: 0.4 });
  }
  for (let i = 0; i < bp.ring.length; i++) {
    const a = bp.ring[i]!;
    const b = bp.ring[(i + 1) % bp.ring.length]!;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / L;
    const nz = (b[0] - a[0]) / L;
    lines.push({ a: [a[0] + nx * 0.4, a[1] + nz * 0.4], b: [b[0] + nx * 0.4, b[1] + nz * 0.4], w: 0.8 });
  }
  for (const ln of lines) {
    const L = Math.hypot(ln.b[0] - ln.a[0], ln.b[1] - ln.a[1]);
    if (L < 0.3) continue;
    const n = Math.max(1, Math.round(L / 1.6));
    const tx = (ln.b[0] - ln.a[0]) / L;
    const tz = (ln.b[1] - ln.a[1]) / L;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = ln.a[0] + (ln.b[0] - ln.a[0]) * t;
      const z = ln.a[1] + (ln.b[1] - ln.a[1]) * t;
      const h = hash1(Math.round(x * 3), Math.round(z * 3), 17);
      if (h < 0.18) continue; // gaps where the stones were robbed
      for (const s of foundationStones(x, z, tx, tz, L / n - 0.04, ln.w, terrain)) g.box(s.x, s.y0, s.z, tx, tz, s.len, ln.w, s.top + 0.35 * h - s.y0, mossS);
    }
  }
}

/** One stone of a foundation line: centre x/z, length along the line, bottom y and top y (before the per-run height). */
export interface FoundationStone {
  x: number;
  z: number;
  len: number;
  y0: number;
  top: number;
}

/**
 * A foundation run of `len` × `w` m at (x, z) on the terrain (playtest round 10, F-14: on the
 * Orangerie's step the 1.6 m runs sat flat on the ground under their centre and hung up to 0.7 m
 * in the air at the downhill end). A run down a slope steps in shorter stones (each falls at most
 * ≈ 0.3 m along its length); every stone reaches 0.3 m below the lowest ground under its corners and
 * peeks 5 cm out of the ground at its centre (the caller adds the weathered height on top).
 */
export function foundationStones(x: number, z: number, tx: number, tz: number, len: number, w: number, terrain: (x: number, z: number) => number): FoundationStone[] {
  const vx = -tz;
  const vz = tx;
  const corners = (cx: number, cz: number, l: number): number[] => {
    const out: number[] = [];
    for (const a of [-l / 2, l / 2]) for (const b of [-w / 2, w / 2]) out.push(terrain(cx + tx * a + vx * b, cz + tz * a + vz * b));
    return out;
  };
  // split by the fall along the run only: a run along the contour stays one long stone (its
  // downhill face simply shows more), a run down the slope steps
  const drop = Math.abs(terrain(x + (tx * len) / 2, z + (tz * len) / 2) - terrain(x - (tx * len) / 2, z - (tz * len) / 2));
  const m = Math.min(8, Math.max(1, Math.ceil(drop / 0.3)));
  const out: FoundationStone[] = [];
  const piece = len / m;
  for (let i = 0; i < m; i++) {
    const off = -len / 2 + piece * (i + 0.5);
    const cx = x + tx * off;
    const cz = z + tz * off;
    const c = corners(cx, cz, piece);
    const y0 = Math.min(...c) - 0.3;
    // the top follows the ground at the centre, but always shows a lip on the downhill side
    const top = Math.max(terrain(cx, cz) + 0.05, Math.min(...c) + 0.12);
    out.push({ x: cx, z: cz, len: m > 1 ? piece - 0.03 : piece, y0, top });
  }
  return out;
}

// ---- 1793-07: a collapsed room (ceiling and roof came down) ---------------------------------------

export function buildDebris(plan: FullPlan, ri: number, li: number): GeoBuf {
  const g = new GeoBuf();
  const r = plan.rooms[ri]!;
  const f = r.frame;
  const rnd = rng(seedOf(r.id) ^ 0xdeb);
  const floor = r.stair ? r.stair.low : r.floor;
  const n = Math.round(Math.min(14, 3 + Math.abs(r.area) / 10));
  for (let k = 0; k < n; k++) {
    const [x, z] = frameXZ(f, 0.5 + rnd() * (f.L - 1), 0.5 + rnd() * (f.W - 1));
    const s = 0.6 + rnd() * 1.2;
    g.blob(x, floor, z, s * 1.3, s * 0.6, s * 1.1, S(C.ruin, M.RUBBLE, li), 0.3, k + 2);
  }
  for (let k = 0; k < Math.min(8, 2 + n / 2); k++) {
    const [x, z] = frameXZ(f, 0.8 + rnd() * (f.L - 1.6), 0.8 + rnd() * (f.W - 1.6));
    const a = rnd() * Math.PI;
    const L = 2.5 + rnd() * 3;
    const top = floor + 0.4 + rnd() * (r.ceiling - floor - 1);
    g.beam([x - (Math.cos(a) * L) / 2, floor + 0.15, z - (Math.sin(a) * L) / 2], [x + (Math.cos(a) * L) / 2, top, z + (Math.sin(a) * L) / 2], 0.24, 0.22, S(C.soot, M.CHARRED, li));
  }
  return g;
}
