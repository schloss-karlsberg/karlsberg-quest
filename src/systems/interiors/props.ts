/**
 * Furnishing per room function and era (procedural, deterministic per room id).
 *
 * 1789: furnished and candle-lit (chandeliers in the Festsaal and the gallery, candelabra and
 * sconces elsewhere). 1793-02: abandoned, dust sheets over the furniture, one candle in the
 * Kabinett. 1793-07 (bible ch. 3): looted — the gallery bare (lighter rectangles and hooks on the
 * green damask, no chandeliers), the Festsaal half stripped with its last chandelier, empty racks
 * in the arms collection, the Naturalienkabinett's white cabinets half empty with 12 crates and a
 * lectern, empty shelves and loose sheets in the Registratur, straw on the ground floors.
 */
import type { GeoBuf, RGB, Surf, V3 } from './geobuf';
import type { Built, Look } from './builder';
import { C, boxSolid, edgeOps, onEdge, wallBox } from './builder';
import { type Edge, hash1, pointInPoly, rng, seedOf } from './geom';
import type { FullPlan, PlanRoom } from './layout';
import { M, lin } from './material';
import { frameXZ } from './stairs';

export interface FurnishCtx {
  g: GeoBuf;
  plan: FullPlan;
  room: PlanRoom;
  local: number;
  look: Look;
  built: Built;
  terrain: (x: number, z: number) => number;
}

/** The trapdoor in the gallery floor (bible ch. 3, clue `falltuer`). */
export const TRAPDOOR = { x: 1200, z: -1218 };

const SHEET = lin(0xd6d1c4);
const CANDLE_LIGHT: RGB = [1.0, 0.56, 0.24];

class Kit {
  readonly g: GeoBuf;
  readonly r: PlanRoom;
  readonly li: number;
  readonly look: Look;
  readonly out: Built;
  readonly rnd: () => number;
  readonly floor: number;
  readonly H: number;

  constructor(readonly c: FurnishCtx) {
    this.g = c.g;
    this.r = c.room;
    this.li = c.local;
    this.look = c.look;
    this.out = c.built;
    this.rnd = rng(seedOf(c.room.id) ^ 0x9e3779b9);
    this.floor = c.room.floor;
    this.H = c.room.ceiling - c.room.floor;
  }

  S(col: RGB, mat: number, aux?: readonly [number, number, number, number]): Surf {
    return { col, mat, room: this.li, aux };
  }

  /** Furniture surface: under a dust sheet in 1793-02. */
  F(col: RGB, mat: number): Surf {
    return this.look.sheets ? this.S(SHEET, M.FABRIC) : this.S(col, mat);
  }

  at(u: number, v: number): [number, number] {
    return frameXZ(this.r.frame, u, v);
  }

  get f() {
    return this.r.frame;
  }

  /** Frame-aligned box at (u, v), sizes along u / v. */
  box(u: number, v: number, y0: number, su: number, sv: number, h: number, s: Surf, solid = false): void {
    const [x, z] = this.at(u, v);
    this.g.box(x, y0, z, this.f.ux, this.f.uz, su, sv, h, s);
    if (solid) this.out.solids.push(...boxSolid(x, z, this.f.ux, this.f.uz, su + 0.1, sv + 0.1, y0, y0 + Math.max(h, 0.6), this.r.building));
  }

  inside(u: number, v: number, m = 0.3): boolean {
    if (u < m || v < m || u > this.f.L - m || v > this.f.W - m) return false;
    const [x, z] = this.at(u, v);
    return pointInPoly(x, z, this.r.poly);
  }

  /** Is (u, v) clear of the door approaches (1.4 m in front of each door)? */
  clearOfDoors(u: number, v: number, pad = 0.4): boolean {
    const [x, z] = this.at(u, v);
    for (const d of this.c.plan.doors) {
      if (d.a !== this.r.index && d.b !== this.r.index) continue;
      for (const off of [-0.7, d.depth + 0.7]) {
        const px = d.cx + d.nx * off;
        const pz = d.cz + d.nz * off;
        if (Math.hypot(px - x, pz - z) < d.width / 2 + 0.9 + pad) return false;
      }
    }
    if (this.r.deco) {
      const dd = this.r.deco;
      if (u > dd.u0 - pad && u < dd.u1 + pad && v > dd.v0 - pad && v < dd.v1 + pad) return false;
    }
    return true;
  }

  /** Free spans along an edge (no doors; no windows if `tall`). */
  spans(ei: number, tall: boolean, margin = 0.25): [number, number][] {
    const e = this.r.edges[ei]!;
    const ops = edgeOps(this.c.plan, this.r, ei).filter((o) => o.door || (tall && o.win));
    let s = 0.3;
    const out: [number, number][] = [];
    for (const o of ops) {
      const pad = o.door ? 0.6 : margin;
      if (o.s0 - pad > s) out.push([s, o.s0 - pad]);
      s = Math.max(s, o.s1 + pad);
    }
    if (e.len - 0.3 > s) out.push([s, e.len - 0.3]);
    return out.filter(([a, b]) => b - a > 0.4);
  }

  hasWindows(ei: number): boolean {
    return this.c.plan.windows.some((w) => w.room === this.r.index && w.edge === ei);
  }

  light(x: number, y: number, z: number, radius: number, k = 1, col: RGB = CANDLE_LIGHT): void {
    this.out.lights.push({ x, y, z, r: col[0] * k, g: col[1] * k, b: col[2] * k, radius, room: this.li });
  }

  flame(x: number, y: number, z: number, size = 1): void {
    this.out.flames.push({ x, y, z, w: 0.07 * size, h: 0.17 * size, kind: 0, room: -1, seed: hash1(Math.round(x * 50), Math.round(z * 50), 1) });
  }

  candle(x: number, y: number, z: number, lit: boolean): void {
    this.g.prism(x, y, z, 0.012, 0.16, 5, this.S(lin(0xf3ead2), M.PAPER));
    if (lit) this.flame(x, y + 0.165, z);
  }

  chandelier(x: number, z: number, size: number, lit: boolean, hang = 1.7): void {
    const yTop = this.r.ceiling;
    const y = yTop - hang * size;
    const gilt = this.S(C.gilt, M.GILT);
    this.g.prism(x, y + 0.3 * size, z, 0.025, yTop - y - 0.3 * size, 4, gilt);
    this.g.prism(x, y - 0.1 * size, z, 0.12 * size, 0.55 * size, 6, gilt, 0.04 * size);
    const n = Math.round(8 * size);
    for (const [rad, dy] of [
      [0.62 * size, 0.0],
      [0.38 * size, 0.32 * size],
    ] as const) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = x + Math.cos(a) * rad;
        const pz = z + Math.sin(a) * rad;
        this.g.beam([x, y + dy + 0.05, z], [px, y + dy + 0.12, pz], 0.025, 0.025, gilt);
        this.g.prism(px, y + dy + 0.1, pz, 0.035, 0.03, 5, gilt);
        this.candle(px, y + dy + 0.13, pz, lit);
      }
    }
    // crystal drops
    for (let k = 0; k < n * 2; k++) {
      const a = (k / (n * 2)) * Math.PI * 2 + 0.2;
      this.g.blob(x + Math.cos(a) * 0.5 * size, y - 0.06 - 0.08 * (k % 3), z + Math.sin(a) * 0.5 * size, 0.018, 0.04, 0.018, this.S(lin(0xe9eef0), M.GILT), 0.1, k);
    }
    if (lit) this.light(x, y + 0.1, z, 9 + 5 * size, 1.25 * size);
  }

  sconce(e: Edge, s: number, y: number, lit: boolean, arms = 2): void {
    const gilt = this.S(C.gilt, M.GILT);
    wallBox(this.g, e, s - 0.06, s + 0.06, 0, 0.04, y - 0.2, y + 0.15, gilt);
    for (let k = 0; k < arms; k++) {
      const ds = arms === 1 ? 0 : (k / (arms - 1) - 0.5) * 0.36;
      const [x, z] = onEdge(e, s + ds, 0.2);
      const [bx, bz] = onEdge(e, s, 0.03);
      this.g.beam([bx, y - 0.05, bz], [x, y, z], 0.02, 0.02, gilt);
      this.candle(x, y, z, lit);
    }
    if (lit) {
      const [x, z] = onEdge(e, s, 0.5);
      this.light(x, y + 0.2, z, 5.5, 0.55);
    }
  }

  painting(e: Edge, s: number, yc: number, w: number, h: number, seed: number): void {
    const [x, z] = onEdge(e, s, 0.035);
    const gilt = this.S(C.gilt, M.GILT);
    this.g.box(x, yc - h / 2 - 0.09, z, e.tx, e.tz, w + 0.18, 0.07, h + 0.18, gilt);
    const [cx, cz] = onEdge(e, s, 0.072);
    const hw = w / 2;
    const col = [lin(0x5a3a1c), lin(0x3d4a2c), lin(0x4a3424), lin(0x283040)][Math.floor(seed * 4) % 4]!;
    this.g.quad([cx - e.tx * hw, yc - h / 2, cz - e.tz * hw], [cx + e.tx * hw, yc - h / 2, cz + e.tz * hw], [cx + e.tx * hw, yc + h / 2, cz + e.tz * hw], [cx - e.tx * hw, yc + h / 2, cz - e.tz * hw], [-e.nx, 0, -e.nz], this.S(col, M.CANVAS, [0, seed * 97, w / h, 0]), [
      [1, 0],
      [0, 0],
      [0, 1],
      [1, 1],
    ]);
  }

  /** Where a painting hung (1793-07): a lighter rectangle on the damask and the hook above it. */
  ghost(e: Edge, s: number, yc: number, w: number, h: number, wallCol: RGB): void {
    const [cx, cz] = onEdge(e, s, 0.006);
    const hw = w / 2;
    const light: RGB = [Math.min(1, wallCol[0] * 1.55 + 0.02), Math.min(1, wallCol[1] * 1.45 + 0.02), Math.min(1, wallCol[2] * 1.4 + 0.02)];
    this.g.quad([cx - e.tx * hw, yc - h / 2, cz - e.tz * hw], [cx + e.tx * hw, yc - h / 2, cz + e.tz * hw], [cx + e.tx * hw, yc + h / 2, cz + e.tz * hw], [cx - e.tx * hw, yc + h / 2, cz - e.tz * hw], [-e.nx, 0, -e.nz], this.S(light, M.DAMASK, [this.H, 0, 0, 0]), [
      [s - hw, yc - h / 2 - this.floor + 0.0],
      [s + hw, yc - h / 2 - this.floor],
      [s + hw, yc + h / 2 - this.floor],
      [s - hw, yc + h / 2 - this.floor],
    ]);
    const [hx, hz] = onEdge(e, s, 0.02);
    this.g.box(hx, yc + h / 2 + 0.12, hz, e.tx, e.tz, 0.04, 0.04, 0.06, this.S(C.iron, M.IRON));
  }

  chair(u: number, v: number, faceU: number, faceV: number, col: RGB): void {
    const [x, z] = this.at(u, v);
    const y = this.floor;
    const fx = this.f.ux * faceU + this.f.vx * faceV;
    const fz = this.f.uz * faceU + this.f.vz * faceV;
    const seat = this.F(col, M.FABRIC);
    const frame = this.F(C.gilt, M.GILT);
    this.g.box(x, y + 0.42, z, fx, fz, 0.48, 0.48, 0.08, seat);
    this.g.box(x - fx * 0.22, y + 0.5, z - fz * 0.22, fx, fz, 0.05, 0.46, 0.55, seat);
    if (!this.look.sheets) for (const [a, b] of [[0.2, 0.2], [0.2, -0.2], [-0.2, 0.2], [-0.2, -0.2]] as const) this.g.prism(x + fx * a - fz * b, y, z + fz * a + fx * b, 0.02, 0.42, 4, frame);
    else this.g.box(x, y, z, fx, fz, 0.5, 0.5, 0.42, seat);
  }

  table(u: number, v: number, su: number, sv: number, h: number, col: RGB = C.wood): void {
    const top = this.F(col, M.WOOD);
    this.box(u, v, this.floor + h - 0.05, su, sv, 0.05, top, true);
    if (this.look.sheets) {
      this.box(u, v, this.floor + 0.05, su + 0.04, sv + 0.04, h - 0.1, this.S(SHEET, M.FABRIC));
      return;
    }
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const [x, z] = this.at(u + a * (su / 2 - 0.08), v + b * (sv / 2 - 0.08));
      this.g.prism(x, this.floor, z, 0.035, h - 0.05, 4, this.S(col, M.WOOD));
    }
  }

  crate(u: number, v: number, s = 1, rot = 0): void {
    const [x, z] = this.at(u, v);
    const a = rot;
    const ux = this.f.ux * Math.cos(a) + this.f.vx * Math.sin(a);
    const uz = this.f.uz * Math.cos(a) + this.f.vz * Math.sin(a);
    this.g.box(x, this.floor, z, ux, uz, 0.9 * s, 0.6 * s, 0.6 * s, this.S(lin(0x8b6a43), M.BOARDS));
    this.out.solids.push(...boxSolid(x, z, ux, uz, 0.9 * s + 0.1, 0.6 * s + 0.1, this.floor, this.floor + 0.7, this.r.building));
  }

  straw(n: number): void {
    for (let k = 0; k < n; k++) {
      const u = 0.6 + this.rnd() * (this.f.L - 1.2);
      const v = 0.6 + this.rnd() * (this.f.W - 1.2);
      if (!this.inside(u, v, 0.4)) continue;
      const [x, z] = this.at(u, v);
      const s = 0.6 + this.rnd() * 1.1;
      this.g.blob(x, this.floor - 0.02, z, s * 1.3, 0.12 + this.rnd() * 0.12, s, this.S(lin(0xb79a55), M.STRAW), 0.35, k + 3);
    }
  }

  /** Bookcase / shelving along an edge span (paper tint 0..1, empty = dark backs). */
  shelves(e: Edge, s0: number, s1: number, h: number, kind: 'books' | 'papers' | 'empty'): void {
    const depth = 0.42;
    const wood = this.S(kind === 'papers' ? C.woodLight : C.wood, M.WOOD);
    wallBox(this.g, e, s0, s1, 0, depth, this.floor, this.floor + h, wood);
    // the front: spines (books), bundles (papers) or bare boards (looted)
    const [ax, az] = onEdge(e, s0 + 0.04, depth + 0.004);
    const [bx, bz] = onEdge(e, s1 - 0.04, depth + 0.004);
    const y0 = this.floor + 0.12;
    const y1 = this.floor + h - 0.08;
    const base = kind === 'papers' ? lin(0xd9cfb2) : kind === 'empty' ? lin(0x2a1a0e) : C.wood;
    const tint = kind === 'books' ? 0 : 1;
    this.g.quad([bx, y0, bz], [ax, y0, az], [ax, y1, az], [bx, y1, bz], [-e.nx, 0, -e.nz], this.S(base, M.BOOKS, [0, 0, tint, 0]), [
      [s1 - s0, 0],
      [0, 0],
      [0, y1 - y0],
      [s1 - s0, y1 - y0],
    ]);
  }

  sheetsOnFloor(n: number): void {
    for (let k = 0; k < n; k++) {
      const u = 0.5 + this.rnd() * (this.f.L - 1);
      const v = 0.5 + this.rnd() * (this.f.W - 1);
      if (!this.inside(u, v, 0.3)) continue;
      const [x, z] = this.at(u, v);
      const a = this.rnd() * Math.PI;
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      this.g.box(x, this.floor + 0.004 + k * 0.0005, z, ux, uz, 0.21, 0.3, 0.003, this.S(lin(0xe2d8bd), M.PAPER));
    }
  }
}

// ------------------------------------------------------------------------------------------------

export function furnish(c: FurnishCtx): void {
  const k = new Kit(c);
  const r = c.room;
  if (r.stair) {
    stairLights(k);
    return;
  }
  switch (r.kind) {
    case 'gallery':
      gallery(k);
      break;
    case 'festsaal':
      festsaal(k);
      break;
    case 'library':
      library(k);
      break;
    case 'arms':
      arms(k);
      break;
    case 'naturalia':
      naturalia(k);
      break;
    case 'prints':
    case 'cabinet':
      cabinet(k);
      break;
    case 'study':
      study(k);
      break;
    case 'temple':
      temple(k);
      break;
    case 'registry':
      registry(k);
      break;
    case 'orangery':
      orangery(k);
      break;
    case 'kitchen':
      kitchen(k);
      break;
    case 'dining':
      dining(k);
      break;
    case 'bedroom':
      bedroom(k);
      break;
    case 'salon':
      salon(k);
      break;
    case 'guard':
    case 'gunsmith':
      guard(k);
      break;
    case 'vestibule':
      vestibule(k);
      break;
    case 'stair':
      stairLights(k);
      break;
    default:
      chamber(k);
  }
  // the looted palace: straw strewn on the ground floors (set alight on 28 July)
  if (k.look.looted && r.storey === 1 && r.kind !== 'passage' && r.kind !== 'stair') k.straw(Math.round(2 + Math.abs(r.area) / 25));
}

/** Indices of the long edges (≥ 70 % of the frame length). */
function longEdges(k: Kit): number[] {
  return k.r.edges.map((e, i) => [e, i] as const).filter(([e]) => e.len > k.f.L * 0.7).map(([, i]) => i);
}

/** Candelabrum / lantern for an ordinary room when lit. */
function roomLight(k: Kit, u = k.f.L / 2, v = k.f.W / 2, y = 1.4, radius = 7): void {
  if (!k.look.lit) return;
  const [x, z] = k.at(u, v);
  k.light(x, k.floor + y, z, radius, 0.7);
}

function gallery(k: Kit): void {
  const r = k.r;
  const wall = C.damaskGreen;
  r.edges.forEach((e, ei) => {
    const tall = k.hasWindows(ei);
    for (const [a, b] of k.spans(ei, true, 0.3)) {
      // salon hang: big canvases low, smaller above
      let s = a + 0.2;
      let n = 0;
      while (s < b - 0.9) {
        const seed = hash1(seedOf(r.id) % 9973, ei * 100 + n, 2);
        const w = Math.min(b - s - 0.2, tall ? 0.9 + seed * 0.6 : 1.3 + seed * 1.5);
        if (w < 0.7) break;
        const h = tall ? 1.1 + seed * 0.5 : 1.2 + seed * 1.1;
        const yc = k.floor + (tall ? 2.3 : 1.6 + h / 2 + 0.25);
        if (k.look.looted) k.ghost(e, s + w / 2, yc, w, h, wall);
        else k.painting(e, s + w / 2, yc, w, h, seed);
        if (!tall && k.H > 5.2 && w > 1.1) {
          const h2 = 0.8 + seed * 0.4;
          const y2 = yc + h / 2 + 0.35 + h2 / 2;
          if (y2 + h2 / 2 < k.r.ceiling - 0.5) {
            if (k.look.looted) k.ghost(e, s + w / 2, y2, w * 0.7, h2, wall);
            else k.painting(e, s + w / 2, y2, w * 0.7, h2, (seed * 7.3) % 1);
          }
        }
        s += w + 0.45;
        n++;
      }
    }
  });
  // banquettes and chandeliers down the middle
  const n = Math.max(1, Math.round(k.f.L / 8));
  for (let i = 0; i < n; i++) {
    const u = ((i + 0.5) / n) * k.f.L;
    const v = k.f.W / 2;
    const [x, z] = k.at(u, v);
    if (!k.look.looted) {
      k.chandelier(x, z, 0.85, k.look.lit, 1.9);
      if (k.clearOfDoors(u, v)) {
        k.box(u, v, k.floor + 0.12, 1.8, 0.6, 0.32, k.F(lin(0x2c4a30), M.FABRIC), true);
        k.box(u, v, k.floor, 1.7, 0.5, 0.12, k.F(C.gilt, M.GILT));
      }
    }
  }
  // the trapdoor (with an iron ring)
  if (pointInPoly(TRAPDOOR.x, TRAPDOOR.z, r.poly)) {
    const g = k.g;
    g.box(TRAPDOOR.x, k.floor - 0.03, TRAPDOOR.z, k.f.ux, k.f.uz, 1.1, 0.9, 0.045, k.S(lin(0x5b4128), M.BOARDS));
    g.box(TRAPDOOR.x + k.f.ux * 0.35, k.floor + 0.01, TRAPDOOR.z + k.f.uz * 0.35, k.f.ux, k.f.uz, 0.05, 0.16, 0.012, k.S(C.iron, M.IRON));
  }
}

function festsaal(k: Kit): void {
  const r = k.r;
  // windowed long side → mirrors opposite, sconces on the piers
  r.edges.forEach((e, ei) => {
    const win = k.hasWindows(ei);
    for (const [a, b] of k.spans(ei, true, 0.18)) {
      const w = b - a;
      if (win) {
        if (w > 0.5) k.sconce(e, (a + b) / 2, k.floor + 2.1, k.look.lit, 3);
        continue;
      }
      // mirrors in gilt frames, chairs beneath
      const n = Math.max(1, Math.floor(w / 2.4));
      for (let i = 0; i < n; i++) {
        const s = a + (w / n) * (i + 0.5);
        const mw = Math.min(1.5, w / n - 0.5);
        if (mw < 0.6) continue;
        const stripped = k.look.looted && hash1(seedOf(r.id) % 991, ei, i) < 0.5;
        if (!stripped) {
          const y0 = k.floor + 1.0;
          const y1 = Math.min(r.ceiling - 0.9, k.floor + 4.6);
          wallBox(k.g, e, s - mw / 2 - 0.08, s + mw / 2 + 0.08, 0, 0.05, y0 - 0.08, y1 + 0.08, k.S(C.gilt, M.GILT));
          const [ax, az] = onEdge(e, s - mw / 2, 0.052);
          const [bx, bz] = onEdge(e, s + mw / 2, 0.052);
          k.g.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], [-e.nx, 0, -e.nz], k.S([0.05, 0.05, 0.05], M.MIRROR), [[0, 0], [1, 0], [1, 1], [0, 1]]);
          k.sconce(e, s - mw / 2 - 0.3, k.floor + 2.0, k.look.lit, 2);
        }
        if (!k.look.looted || hash1(i, ei, 8) < 0.2) {
          const [x, z] = onEdge(e, s, 0.45);
          const p = frameUVOf(k, x, z);
          const fu = -e.nx * k.f.ux - e.nz * k.f.uz;
          const fv = -e.nx * k.f.vx - e.nz * k.f.vz;
          k.chair(p[0], p[1], fu, fv, lin(0x8a2222));
        }
      }
    }
  });
  // chandeliers down the axis; one left in July 1793
  const n = Math.max(2, Math.round(k.f.L / 7));
  for (let i = 0; i < n; i++) {
    if (k.look.looted && i !== Math.floor(n / 2)) continue;
    const [x, z] = k.at(((i + 0.5) / n) * k.f.L, k.f.W / 2);
    k.chandelier(x, z, 1.15, k.look.lit, 1.9);
  }
  if (k.look.looted) {
    for (let i = 0; i < 4; i++) {
      const u = 1.4 + k.rnd() * (k.f.L - 2.8);
      const v = 1.2 + k.rnd() * (k.f.W - 2.4);
      if (k.clearOfDoors(u, v)) k.crate(u, v, 1, k.rnd() * 0.6);
    }
    // panelling stacked against the wall, ready to be carried off
    const e = r.edges[longEdges(k).find((i) => !k.hasWindows(i)) ?? 0]!;
    for (let i = 0; i < 3; i++) {
      const s = 2 + i * 0.12;
      const [x0, z0] = onEdge(e, s, 0.05);
      const [x1, z1] = onEdge(e, s + 1.3, 0.25 + i * 0.08);
      k.g.beam([x0, k.floor + 1.1, z0], [x1, k.floor + 1.1, z1], 0.04, 2.2, k.S(C.boiserie, M.BOISERIE, [2.2, 0, 0, 0]));
    }
  }
}

function frameUVOf(k: Kit, x: number, z: number): [number, number] {
  const f = k.f;
  const dx = x - f.ox;
  const dz = z - f.oz;
  return [dx * f.ux + dz * f.uz, dx * f.vx + dz * f.vz];
}

function library(k: Kit): void {
  const h = Math.min(k.H - 0.4, 3.2);
  k.r.edges.forEach((e, ei) => {
    for (const [a, b] of k.spans(ei, true, 0.15)) k.shelves(e, a, b, k.hasWindows(ei) ? Math.min(h, 0.95) : h, k.look.looted ? 'empty' : 'books');
  });
  if (k.clearOfDoors(k.f.L / 2, k.f.W / 2)) {
    k.table(k.f.L / 2, k.f.W / 2, 2.2, 1.0, 0.78);
    const [x, z] = k.at(k.f.L / 2 + 1.6, k.f.W / 2);
    if (!k.look.looted) {
      k.g.prism(x, k.floor, z, 0.08, 0.75, 6, k.F(C.wood, M.WOOD));
      k.g.blob(x, k.floor + 0.98, z, 0.24, 0.24, 0.24, k.S(lin(0x9b8a5c), M.PAPER), 0.02, 4);
    }
  }
  if (k.look.looted) k.sheetsOnFloor(14);
  roomLight(k);
}

function arms(k: Kit): void {
  const iron = k.S(lin(0x5a5c60), M.IRON);
  const wood = k.S(C.wood, M.WOOD);
  k.r.edges.forEach((e, ei) => {
    if (k.hasWindows(ei)) return;
    for (const [a, b] of k.spans(ei, true, 0.2)) {
      // rack: back board + two rails
      wallBox(k.g, e, a, b, 0, 0.06, k.floor + 0.2, k.floor + 2.1, wood);
      wallBox(k.g, e, a, b, 0.06, 0.18, k.floor + 0.3, k.floor + 0.42, wood);
      wallBox(k.g, e, a, b, 0.06, 0.08, k.floor + 1.55, k.floor + 1.62, wood);
      if (k.look.looted) {
        // empty slots, a single musket left behind now and then
        if (k.rnd() < 0.3) {
          const s = a + k.rnd() * (b - a);
          const [x0, z0] = onEdge(e, s, 0.15);
          const [x1, z1] = onEdge(e, s + 0.4, 0.08);
          k.g.beam([x0, k.floor + 0.42, z0], [x1, k.floor + 1.8, z1], 0.04, 0.05, wood);
        }
        continue;
      }
      for (let s = a + 0.15; s < b - 0.1; s += 0.17) {
        const [x0, z0] = onEdge(e, s, 0.16);
        const [x1, z1] = onEdge(e, s, 0.09);
        k.g.beam([x0, k.floor + 0.42, z0], [x1, k.floor + 1.55, z1], 0.035, 0.05, wood);
        k.g.beam([x1, k.floor + 1.55, z1], [x1, k.floor + 1.82, z1], 0.02, 0.02, iron);
      }
    }
  });
  // armour stands down the middle (gone in 1793-07)
  if (!k.look.looted) {
    const n = Math.max(1, Math.round(k.f.L / 3.2));
    for (let i = 0; i < n; i++) {
      const u = ((i + 0.5) / n) * k.f.L;
      const v = k.f.W / 2;
      if (!k.clearOfDoors(u, v)) continue;
      const [x, z] = k.at(u, v);
      k.g.prism(x, k.floor, z, 0.2, 0.08, 6, wood);
      k.g.prism(x, k.floor + 0.08, z, 0.03, 1.0, 4, wood);
      k.g.prism(x, k.floor + 1.0, z, 0.19, 0.55, 8, iron, 0.15);
      k.g.blob(x, k.floor + 1.72, z, 0.13, 0.15, 0.13, iron, 0.05, i);
      k.out.solids.push(...boxSolid(x, z, k.f.ux, k.f.uz, 0.5, 0.5, k.floor, k.floor + 1.8, k.r.building));
    }
  }
  roomLight(k);
}

function cabinetCase(k: Kit, e: Edge, s0: number, s1: number, fill: number): void {
  const white = k.S(C.painted, M.WOOD);
  const depth = 0.55;
  const h = Math.min(2.4, k.H - 0.6);
  // carcase: back, sides, top, plinth, shelves
  wallBox(k.g, e, s0, s1, 0, 0.04, k.floor, k.floor + h, white);
  wallBox(k.g, e, s0, s0 + 0.05, 0, depth, k.floor, k.floor + h, white);
  wallBox(k.g, e, s1 - 0.05, s1, 0, depth, k.floor, k.floor + h, white);
  wallBox(k.g, e, s0, s1, 0, depth, k.floor + h - 0.08, k.floor + h, white);
  wallBox(k.g, e, s0, s1, 0, depth, k.floor, k.floor + 0.35, white);
  const shelves = 4;
  for (let i = 1; i < shelves; i++) {
    const y = k.floor + 0.35 + ((h - 0.43) * i) / shelves;
    wallBox(k.g, e, s0, s1, 0.04, depth - 0.06, y, y + 0.025, white);
    // specimens: minerals, shells, jars
    for (let s = s0 + 0.15; s < s1 - 0.1; s += 0.22) {
      if (k.rnd() > fill) continue;
      const [x, z] = onEdge(e, s, 0.25);
      const hue = k.rnd();
      const col: RGB = hue < 0.3 ? lin(0xc8b48a) : hue < 0.6 ? lin(0x7a8a9a) : hue < 0.8 ? lin(0xa45a3a) : lin(0x3a5a4a);
      if (k.rnd() < 0.4) k.g.prism(x, y + 0.025, z, 0.05, 0.16, 6, k.S(lin(0x9fb3a8), M.GLASS));
      else k.g.blob(x, y + 0.07, z, 0.07, 0.05, 0.06, k.S(col, M.MARBLE), 0.3, Math.round(s * 10));
    }
  }
  // glazed doors: frames only
  const n = Math.max(1, Math.round((s1 - s0) / 0.7));
  for (let i = 0; i <= n; i++) wallBox(k.g, e, s0 + ((s1 - s0) * i) / n - 0.02, s0 + ((s1 - s0) * i) / n + 0.02, depth - 0.03, 0.03, k.floor + 0.35, k.floor + h - 0.08, white);
}

function naturalia(k: Kit): void {
  const fill = k.look.looted ? 0.35 : 0.85;
  k.r.edges.forEach((e, ei) => {
    if (k.hasWindows(ei)) return;
    for (const [a, b] of k.spans(ei, true, 0.2)) {
      const n = Math.max(1, Math.floor((b - a) / 2.2));
      for (let i = 0; i < n; i++) cabinetCase(k, e, a + ((b - a) * i) / n + 0.05, a + ((b - a) * (i + 1)) / n - 0.05, fill);
    }
  });
  if (k.look.looted) {
    // 12 crates and a lectern (bible 3.4)
    let placed = 0;
    for (let t = 0; t < 60 && placed < 12; t++) {
      const u = 1.2 + k.rnd() * (k.f.L - 2.4);
      const v = 1.4 + k.rnd() * (k.f.W - 2.8);
      if (!k.clearOfDoors(u, v, 0.2)) continue;
      k.crate(u, v, 0.9 + k.rnd() * 0.3, k.rnd() * 0.5);
      placed++;
    }
    const [x, z] = k.at(k.f.L * 0.5, k.f.W * 0.5);
    k.g.prism(x, k.floor, z, 0.08, 1.05, 6, k.S(C.wood, M.WOOD));
    k.g.box(x, k.floor + 1.05, z, k.f.ux, k.f.uz, 0.55, 0.45, 0.06, k.S(C.wood, M.WOOD));
    k.g.box(x, k.floor + 1.11, z, k.f.ux, k.f.uz, 0.42, 0.3, 0.01, k.S(lin(0xe0d6b8), M.PAPER));
  } else {
    // table vitrines
    const n = Math.max(1, Math.round(k.f.L / 4));
    for (let i = 0; i < n; i++) {
      const u = ((i + 0.5) / n) * k.f.L;
      if (!k.clearOfDoors(u, k.f.W / 2)) continue;
      k.box(u, k.f.W / 2, k.floor, 1.6, 0.8, 0.85, k.F(C.painted, M.WOOD), true);
      k.box(u, k.f.W / 2, k.floor + 0.85, 1.55, 0.75, 0.2, k.S(lin(0x8ea39a), M.GLASS));
    }
  }
  roomLight(k);
}

function cabinet(k: Kit): void {
  k.r.edges.forEach((e, ei) => {
    for (const [a, b] of k.spans(ei, true, 0.2)) {
      if (k.hasWindows(ei)) continue;
      let s = a + 0.3;
      let i = 0;
      while (s < b - 0.7) {
        const w = 0.5 + hash1(seedOf(k.r.id) % 977, ei, i) * 0.4;
        if (!k.look.looted || i % 3 === 0) k.painting(e, s + w / 2, k.floor + 1.7, w, w * 0.75, hash1(i, ei, 3));
        s += w + 0.35;
        i++;
      }
    }
  });
  if (k.clearOfDoors(k.f.L / 2, k.f.W / 2) && !k.look.looted) {
    k.box(k.f.L / 2, k.f.W / 2, k.floor, 1.4, 0.7, 0.85, k.F(C.wood, M.WOOD), true);
    k.box(k.f.L / 2, k.f.W / 2, k.floor + 0.85, 1.35, 0.65, 0.16, k.S(lin(0x8ea39a), M.GLASS));
  }
  if (k.look.looted) k.sheetsOnFloor(6);
  roomLight(k);
}

function study(k: Kit): void {
  // desk at the window, chair, a bookcase, the candle (lit in 1789 and in February 1793)
  const winEdge = k.r.edges.findIndex((_, i) => k.hasWindows(i));
  const e = k.r.edges[winEdge >= 0 ? winEdge : 0]!;
  const [dx, dz] = onEdge(e, e.len / 2, 1.1);
  const [du, dv] = frameUVOf(k, dx, dz);
  k.table(du, dv, 1.4, 0.75, 0.78, lin(0x5a3820));
  const into = [-e.nx, -e.nz];
  k.chair(du + (into[0]! * k.f.ux + into[1]! * k.f.uz) * 0.7, dv + (into[0]! * k.f.vx + into[1]! * k.f.vz) * 0.7, -(into[0]! * k.f.ux + into[1]! * k.f.uz), -(into[0]! * k.f.vx + into[1]! * k.f.vz), lin(0x5a2a1a));
  // papers + inkwell + candle on the desk
  const top = k.floor + 0.78;
  for (let i = 0; i < 4; i++) {
    const a = k.rnd() * 0.6 - 0.3;
    k.g.box(dx + k.rnd() * 0.5 - 0.25, top + 0.002 * i, dz + k.rnd() * 0.3 - 0.15, Math.cos(a), Math.sin(a), 0.21, 0.3, 0.002, k.S(lin(0xe6dcc0), M.PAPER));
  }
  const candleLit = k.look.lit || k.look.sheets;
  const [cx, cz] = onEdge(e, e.len / 2 + 0.5, 1.0);
  k.g.prism(cx, top, cz, 0.05, 0.02, 6, k.S(C.gilt, M.GILT));
  k.candle(cx, top + 0.02, cz, candleLit && !k.look.looted);
  if (candleLit && !k.look.looted) k.light(cx, top + 0.3, cz, 7, k.look.sheets ? 1.0 : 0.8);
  // bookcase on the wall opposite
  const opp = k.r.edges.findIndex((q, i) => i !== winEdge && q.len > 2.5 && !k.hasWindows(i));
  if (opp >= 0) for (const [a, b] of k.spans(opp, true, 0.2)) k.shelves(k.r.edges[opp]!, a, Math.min(b, a + 2.6), Math.min(2.6, k.H - 0.4), k.look.looted ? 'empty' : 'books');
  if (k.look.looted) k.sheetsOnFloor(10);
}

function temple(k: Kit): void {
  // columns along the long walls (paper marble), an urn on a pedestal
  const marble = k.S(lin(0xe2dccf), M.MARBLE);
  for (const ei of longEdges(k)) {
    const e = k.r.edges[ei]!;
    for (const [a, b] of k.spans(ei, false, 0.3)) {
      const n = Math.max(1, Math.floor((b - a) / 1.8));
      for (let i = 0; i <= n; i++) {
        const s = a + ((b - a) * i) / n;
        const [x, z] = onEdge(e, s, 0.35);
        k.g.box(x, k.floor, z, e.tx, e.tz, 0.5, 0.5, 0.3, marble);
        k.g.prism(x, k.floor + 0.3, z, 0.2, k.H - 0.75, 12, marble, 0.17);
        k.g.box(x, k.r.ceiling - 0.45, z, e.tx, e.tz, 0.5, 0.5, 0.3, k.S(C.gilt, M.GILT));
      }
    }
  }
  if (k.clearOfDoors(k.f.L / 2, k.f.W / 2)) {
    k.box(k.f.L / 2, k.f.W / 2, k.floor, 0.6, 0.6, 1.0, marble, true);
    const [x, z] = k.at(k.f.L / 2, k.f.W / 2);
    k.g.prism(x, k.floor + 1.0, z, 0.12, 0.45, 10, k.S(lin(0x8a8a86), M.MARBLE), 0.2);
  }
  roomLight(k);
}

function registry(k: Kit): void {
  const h = Math.min(k.H - 0.4, 2.8);
  k.r.edges.forEach((e, ei) => {
    if (k.hasWindows(ei)) return;
    for (const [a, b] of k.spans(ei, true, 0.2)) k.shelves(e, a, b, h, k.look.looted ? 'empty' : 'papers');
  });
  if (k.clearOfDoors(k.f.L / 2, k.f.W / 2)) k.table(k.f.L / 2, k.f.W / 2, 2.0, 0.9, 0.8, C.woodLight);
  if (k.look.looted) k.sheetsOnFloor(28);
  roomLight(k);
}

function orangery(k: Kit): void {
  // two rows of orange trees in tubs (in the winter quarters)
  const tub = k.S(lin(0x2f4a35), M.WOOD);
  const leaf = k.S(lin(0x2f5a28), M.FOLIAGE);
  const n = Math.max(2, Math.floor(k.f.L / 3.2));
  for (const vf of [0.33, 0.67]) {
    for (let i = 0; i < n; i++) {
      const u = ((i + 0.5) / n) * k.f.L;
      const v = vf * k.f.W;
      if (!k.inside(u, v, 0.8) || !k.clearOfDoors(u, v, 0.2)) continue;
      const [x, z] = k.at(u, v);
      k.g.box(x, k.floor, z, k.f.ux, k.f.uz, 0.75, 0.75, 0.65, tub);
      k.g.prism(x, k.floor + 0.65, z, 0.06, 0.9, 5, k.S(C.wood, M.WOOD));
      if (!k.look.looted || i % 2 === 0) k.g.blob(x, k.floor + 1.95, z, 0.75, 0.7, 0.75, leaf, 0.25, i + 1);
      k.out.solids.push(...boxSolid(x, z, k.f.ux, k.f.uz, 0.85, 0.85, k.floor, k.floor + 0.7, k.r.building));
    }
  }
  roomLight(k);
}

function kitchen(k: Kit): void {
  const ei = k.r.edges.findIndex((_, i) => !k.hasWindows(i) && k.spans(i, true).some(([a, b]) => b - a > 2.6));
  if (ei >= 0) {
    const e = k.r.edges[ei]!;
    const [a, b] = k.spans(ei, true).find(([p, q]) => q - p > 2.6)!;
    const s = (a + b) / 2;
    const brick = k.S(C.masonry, M.MASONRY);
    wallBox(k.g, e, s - 1.3, s + 1.3, 0, 0.9, k.floor, k.floor + 0.55, brick);
    wallBox(k.g, e, s - 1.4, s + 1.4, 0, 1.0, k.floor + 1.7, k.floor + 2.3, brick);
    wallBox(k.g, e, s - 1.1, s + 1.1, 0, 0.6, k.floor + 2.3, k.r.ceiling, brick);
    const [x, z] = onEdge(e, s, 0.45);
    k.g.box(x, k.floor + 0.55, z, e.tx, e.tz, 1.6, 0.5, 0.03, k.S(C.soot, M.CHARRED));
    if (k.look.lit) k.light(x, k.floor + 0.8, z, 6, 0.9, [1.0, 0.45, 0.15]);
    for (let i = 0; i < 4; i++) {
      const [px, pz] = onEdge(e, s - 1.0 + i * 0.6, 0.12);
      k.g.prism(px, k.floor + 1.3, pz, 0.12, 0.18, 8, k.S(lin(0xa0552d), M.GILT), 0.1);
    }
  }
  if (k.clearOfDoors(k.f.L / 2, k.f.W / 2)) k.table(k.f.L / 2, k.f.W / 2, Math.min(3, k.f.L * 0.4), 0.9, 0.85, C.woodLight);
}

function dining(k: Kit): void {
  const L = Math.min(k.f.L - 3, 6);
  if (L > 1.5 && k.clearOfDoors(k.f.L / 2, k.f.W / 2, 0)) {
    k.table(k.f.L / 2, k.f.W / 2, L, 1.2, 0.78);
    if (!k.look.looted) {
      for (let u = k.f.L / 2 - L / 2 + 0.5; u < k.f.L / 2 + L / 2 - 0.3; u += 0.8) {
        k.chair(u, k.f.W / 2 - 0.85, 0, 1, lin(0x4a5a3a));
        k.chair(u, k.f.W / 2 + 0.85, 0, -1, lin(0x4a5a3a));
      }
      for (const du of [-L / 4, L / 4]) {
        const [x, z] = k.at(k.f.L / 2 + du, k.f.W / 2);
        k.g.prism(x, k.floor + 0.78, z, 0.06, 0.35, 6, k.S(C.gilt, M.GILT), 0.02);
        for (let i = 0; i < 3; i++) k.candle(x + (i - 1) * 0.12 * k.f.ux, k.floor + 1.13, z + (i - 1) * 0.12 * k.f.uz, k.look.lit);
        if (k.look.lit) k.light(x, k.floor + 1.4, z, 7, 0.6);
      }
    }
  }
  if (Math.abs(k.r.area) > 40 && !k.look.looted) {
    const [x, z] = k.at(k.f.L / 2, k.f.W / 2);
    k.chandelier(x, z, 0.8, k.look.lit, 1.6);
  }
}

function bedroom(k: Kit): void {
  const ei = k.r.edges.findIndex((_, i) => !k.hasWindows(i) && k.spans(i, true).some(([a, b]) => b - a > 2.2));
  if (ei >= 0 && !k.look.looted) {
    const e = k.r.edges[ei]!;
    const [a, b] = k.spans(ei, true).find(([p, q]) => q - p > 2.2)!;
    const s = (a + b) / 2;
    const fab = k.F(lin(0x34456a), M.FABRIC);
    const [x, z] = onEdge(e, s, 1.1);
    k.g.box(x, k.floor, z, e.tx, e.tz, 1.6, 2.0, 0.6, k.F(lin(0xe0d8c8), M.FABRIC));
    k.out.solids.push(...boxSolid(x, z, e.tx, e.tz, 1.7, 2.1, k.floor, k.floor + 0.7, k.r.building));
    wallBox(k.g, e, s - 0.85, s + 0.85, 0, 0.08, k.floor, k.floor + 1.5, k.F(C.gilt, M.GILT));
    if (!k.look.sheets) {
      for (const [ds, dd] of [[-0.78, 0.1], [0.78, 0.1], [-0.78, 2.05], [0.78, 2.05]] as const) {
        const [px, pz] = onEdge(e, s + ds, dd);
        k.g.prism(px, k.floor, pz, 0.04, Math.min(k.H - 0.4, 2.9), 6, k.S(C.gilt, M.GILT));
      }
      wallBox(k.g, e, s - 0.85, s + 0.85, 0, 2.1, k.floor + Math.min(k.H - 0.4, 2.9), k.floor + Math.min(k.H - 0.2, 3.1), fab);
    }
  }
  roomLight(k, k.f.L * 0.3, k.f.W * 0.3, 1.0, 5);
}

function salon(k: Kit): void {
  const ei = k.r.edges.findIndex((_, i) => !k.hasWindows(i) && k.spans(i, true).some(([a, b]) => b - a > 1.8));
  if (ei >= 0) {
    const e = k.r.edges[ei]!;
    const [a, b] = k.spans(ei, true).find(([p, q]) => q - p > 1.8)!;
    const s = (a + b) / 2;
    // fireplace + mirror above
    const marble = k.S(lin(0xc9bfb0), M.MARBLE);
    wallBox(k.g, e, s - 0.8, s + 0.8, 0, 0.45, k.floor, k.floor + 1.1, marble);
    wallBox(k.g, e, s - 0.45, s + 0.45, 0.4, 0.06, k.floor, k.floor + 0.8, k.S(C.soot, M.CHARRED));
    if (!k.look.looted) {
      wallBox(k.g, e, s - 0.6, s + 0.6, 0, 0.04, k.floor + 1.25, k.floor + Math.min(k.H - 0.5, 3.3), k.S(C.gilt, M.GILT));
      const [ax, az] = onEdge(e, s - 0.52, 0.042);
      const [bx, bz] = onEdge(e, s + 0.52, 0.042);
      const y0 = k.floor + 1.33;
      const y1 = k.floor + Math.min(k.H - 0.58, 3.22);
      k.g.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], [-e.nx, 0, -e.nz], k.S([0.05, 0.05, 0.05], M.MIRROR));
      const [cx, cz] = onEdge(e, s, 0.25);
      for (const d of [-0.5, 0.5]) k.candle(cx + e.tx * d, k.floor + 1.1, cz + e.tz * d, k.look.lit);
      if (k.look.lit) k.light(cx, k.floor + 1.5, cz, 6, 0.6);
    }
  }
  if (!k.look.looted) {
    const u = k.f.L / 2;
    const v = k.f.W / 2;
    if (k.clearOfDoors(u, v)) {
      const [x, z] = k.at(u, v);
      k.g.prism(x, k.floor, z, 0.06, 0.72, 6, k.F(C.gilt, M.GILT));
      k.g.prism(x, k.floor + 0.72, z, 0.45, 0.04, 12, k.F(lin(0xc9bfb0), M.MARBLE));
      k.chair(u - 1.0, v, 1, 0, lin(0x8a2a22));
      k.chair(u + 1.0, v, -1, 0, lin(0x8a2a22));
    }
    if (Math.abs(k.r.area) > 35) {
      const [x, z] = k.at(u, v);
      k.chandelier(x, z, 0.7, k.look.lit, 1.5);
    }
  }
}

function guard(k: Kit): void {
  const ei = k.r.edges.findIndex((_, i) => k.spans(i, true).some(([a, b]) => b - a > 2));
  if (ei >= 0 && !k.look.looted) {
    const e = k.r.edges[ei]!;
    const [a, b] = k.spans(ei, true).find(([p, q]) => q - p > 2)!;
    wallBox(k.g, e, a, Math.min(b, a + 3), 0, 0.4, k.floor, k.floor + 0.45, k.F(C.wood, M.WOOD));
  }
  if (k.clearOfDoors(k.f.L / 2, k.f.W / 2)) k.table(k.f.L / 2, k.f.W / 2, 1.6, 0.8, 0.78, C.woodLight);
  roomLight(k);
}

function vestibule(k: Kit): void {
  // pairs of columns in the large halls
  if (Math.abs(k.r.area) > 50 && k.H > 3.5) {
    const marble = k.S(lin(0xd6d0c4), M.MARBLE);
    for (const uf of [0.3, 0.7])
      for (const vf of [0.25, 0.75]) {
        const u = uf * k.f.L;
        const v = vf * k.f.W;
        if (!k.clearOfDoors(u, v, 0)) continue;
        const [x, z] = k.at(u, v);
        k.g.box(x, k.floor, z, k.f.ux, k.f.uz, 0.7, 0.7, 0.35, marble);
        k.g.prism(x, k.floor + 0.35, z, 0.28, k.H - 0.8, 12, marble, 0.24);
        k.g.box(x, k.r.ceiling - 0.45, z, k.f.ux, k.f.uz, 0.7, 0.7, 0.45, marble);
        k.out.solids.push(...boxSolid(x, z, k.f.ux, k.f.uz, 0.7, 0.7, k.floor, k.r.ceiling, k.r.building));
      }
  }
  stairLights(k);
}

function stairLights(k: Kit): void {
  // a lantern on the wall
  const e = k.r.edges.reduce((a, b) => (b.len > a.len ? b : a));
  const ei = k.r.edges.indexOf(e);
  const sp = k.spans(ei, true, 0.3)[0];
  if (!sp) return;
  const s = (sp[0] + sp[1]) / 2;
  const y = (k.r.stair ? k.r.stair.high : k.floor) + 2.2;
  k.sconce(e, s, Math.min(k.r.ceiling - 0.4, y), k.look.lit, 1);
}

function chamber(k: Kit): void {
  if (k.r.kind === 'corridor' || k.r.kind === 'link' || k.r.kind === 'passage') {
    if (k.r.kind !== 'passage') roomLight(k, k.f.L / 2, k.f.W / 2, 2.0, 5);
    return;
  }
  // a chest and a chair against a wall
  const ei = k.r.edges.findIndex((_, i) => !k.hasWindows(i) && k.spans(i, true).some(([a, b]) => b - a > 1.4));
  if (ei >= 0 && !k.look.looted) {
    const e = k.r.edges[ei]!;
    const [a] = k.spans(ei, true).find(([p, q]) => q - p > 1.4)!;
    wallBox(k.g, e, a + 0.1, a + 1.2, 0, 0.5, k.floor, k.floor + 0.55, k.F(C.wood, M.WOOD));
  }
  roomLight(k, k.f.L / 2, k.f.W / 2, 1.2, 5);
}

/** Exposed for tests. */
export const _internal = { longEdges };
export type { V3 };
