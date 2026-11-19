/**
 * The Ehrenhof in summer 1789, lived in (playtest round 7: "an empty, overexposed sand plane").
 *
 *  - `EHRENHOF_1789` (a set, 1789 only): the court paved — a cobble field framed by sandstone
 *    bands along the wings, a sandstone walk on the axis from the gate to the vestibule, cross
 *    walks to the wing doors, gutters, and a rosette round the place where the player shifts eras
 *    (the anchor 1218/−1118, so "stand in the middle" has a mark). Orange trees in tubs, lantern
 *    posts, two flags at the gate, a parked coach by the south wing, and market stalls outside the
 *    railing. The paving is draped over the terrain a few cm up (no solids); the props keep clear
 *    of the story's places (`keepFree`, tests/scenery.test.ts).
 *  - `CourtLife` (medium / high): the court's people as the ghost silhouettes of the K3 crowd
 *    (fx/k3-ghosts.ts, one draw call per kind) — guards at the gate and the vestibule, courtiers
 *    and maids standing in twos and threes, servants crossing with bundles, a guard walking his
 *    round, a coach with its horse rolling in, waiting at the steps and leaving. Not solid.
 *
 * All positions are in the court frame of fx/k3-crowd.ts: u from the gate east along the axis,
 * w across (south +).
 */
import { BufferAttribute, BufferGeometry, Color, Group } from 'three';
import { SURF } from '../../world/surfaces';
import { COURT, type CartSpec, type Stander, type UW, type Walker, cartAt, court, courtYaw, walkerAt } from '../fx/k3-crowd';
import { GhostBatch, type GhostKind, type GhostPose, ghostMaterial } from '../fx/k3-ghosts';
import type { SetBuilder } from './builder';
import type { SetDef } from './sets';
import { type Hex, rng, tint } from './kit';
import { C, barrel, wheel } from './props';

/** Court frame → compass degrees of a court direction (0 north, 90 east). */
function courtDeg(du: number, dw: number): number {
  const y = courtYaw(du, dw); // atan2(x, z): 0 = +z (south)
  return (180 - (y * 180) / Math.PI + 360) % 360;
}

const COB: Hex = 0x9a9082;
const BAND: Hex = 0xa99c88;
const WALK: Hex = 0xb3a48c;
/** The rosette's inlay: grey-ochre stone, never the red of a combat telegraph (playtest round 9). */
const INLAY: Hex = 0x958772;
const INLAY_DARK: Hex = 0x7f776a;
const GUTTER: Hex = 0x5a544c;

/**
 * A strip of the court draped over the ground: corners in court u/w, `lift` m above the terrain,
 * cells of about `cell` m (the court is not flat: it falls a little towards the gate).
 */
function drape(b: SetBuilder, u0: number, u1: number, w0: number, w1: number, lift: number, color: Hex, surf: number, cell = 2): void {
  const nu = Math.max(1, Math.ceil((u1 - u0) / cell));
  const nw = Math.max(1, Math.ceil((w1 - w0) / cell));
  const pos: number[] = [];
  const P = (u: number, w: number) => {
    const p = court(u, w);
    return [p.x, b.heightAt(p.x, p.z) + lift, p.z] as const;
  };
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nw; j++) {
      const ua = u0 + ((u1 - u0) * i) / nu;
      const ub = u0 + ((u1 - u0) * (i + 1)) / nu;
      const wa = w0 + ((w1 - w0) * j) / nw;
      const wb = w0 + ((w1 - w0) * (j + 1)) / nw;
      const a = P(ua, wa);
      const c = P(ub, wa);
      const d = P(ub, wb);
      const e = P(ua, wb);
      // counter-clockwise seen from above (normals up)
      pos.push(...a, ...e, ...d, ...a, ...d, ...c);
    }
  }
  addWorld(b, pos, color, surf);
}

/** A ring (r0..r1) round a court point, draped. */
function ringAt(b: SetBuilder, cu: number, cw: number, r0: number, r1: number, lift: number, color: Hex, surf: number, seg = 40, a0 = 0, a1 = Math.PI * 2): void {
  const pos: number[] = [];
  const P = (r: number, a: number) => {
    const p = court(cu + Math.cos(a) * r, cw + Math.sin(a) * r);
    return [p.x, b.heightAt(p.x, p.z) + lift, p.z] as const;
  };
  for (let i = 0; i < seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg;
    const c = a0 + ((a1 - a0) * (i + 1)) / seg;
    const p0 = P(r0, a);
    const p1 = P(r1, a);
    const p2 = P(r1, c);
    const p3 = P(r0, c);
    pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
  }
  addWorld(b, pos, color, surf);
}

function addWorld(b: SetBuilder, pos: number[], color: Hex, surf: number): void {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  // every triangle faces up, whatever the winding the caller used
  const n = g.getAttribute('normal') as BufferAttribute;
  if (n.count && n.getY(0) < 0) {
    const p = g.getAttribute('position') as BufferAttribute;
    for (let i = 0; i + 2 < p.count; i += 3) {
      const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      p.setXYZ(i + 2, x, y, z);
    }
    g.computeVertexNormals();
  }
  b.kit.place(0, 0, 0, 0);
  b.kit.add(g, color, 0, undefined, surf);
}

/** The court's extent: from just inside the railing to the Corps de logis, wing to wing. */
export const PAVE = { u0: 0.6, u1: 58.5, w: 18.3 };
/** The rosette round the era anchor (1218/−1118). */
export const ROSETTE: UW = [26, 0];
/** Lantern posts and orange tubs (court u/w): either side of the court, clear of the doors. */
const LANTERNS: UW[] = [8, 20, 44].flatMap((u): UW[] => [[u, -14.2], [u, 14.2]]);
const TUBS: UW[] = [
  ...[14, 50].flatMap((u): UW[] => [[u, -14.2], [u, 14.2]]),
  [55, -7.5],
  [55, 7.5],
  [55, -12],
  [55, 12],
];
/** The parked coach (by the south wing, facing the gate). */
const COACH: UW = [47, 10.8];

function lanternPost(b: SetBuilder, u: number, w: number): void {
  const p = court(u, w);
  const y = b.at(p.x, p.z, 0, 0.3);
  const k = b.kit;
  k.cyl(0.16, 0.2, 0.35, 0, 0, 0, C.sandstone, undefined, 8);
  k.cyl(0.05, 0.06, 2.9, 0, 0.35, 0, C.iron, undefined, 6);
  // the lamp: iron cage, warm glass, cap
  k.box(0.34, 0.04, 0.34, 0, 3.22, 0, C.iron);
  k.box(0.26, 0.42, 0.26, 0, 3.26, 0, 0xffc56a, undefined, 0.85);
  for (const [dx, dz] of [[-0.14, -0.14], [0.14, -0.14], [0.14, 0.14], [-0.14, 0.14]] as const) k.box(0.03, 0.46, 0.03, dx, 3.24, dz, C.iron);
  k.cone(0.26, 0.26, 0, 3.7, 0, C.iron, 4);
  b.glow(p.x, y + 3.47, p.z, 0.9, new Color(1.0, 0.72, 0.38));
  b.circle(p.x, p.z, 0.22);
}

function orangeTub(b: SetBuilder, u: number, w: number, seed: number): void {
  const p = court(u, w);
  b.at(p.x, p.z, courtDeg(1, 0), 0.4);
  const k = b.kit;
  const r = rng(seed);
  // a square Versailles tub, painted green, iron bands, knobs on the corners
  k.box(0.86, 0.78, 0.86, 0, 0, 0, 0x3e6a4a);
  for (const y of [0.12, 0.62]) k.box(0.9, 0.06, 0.9, 0, y, 0, C.iron);
  for (const [dx, dz] of [[-0.43, -0.43], [0.43, -0.43], [0.43, 0.43], [-0.43, 0.43]] as const) k.cone(0.06, 0.12, dx, 0.78, dz, 0xc9a24a, 6);
  k.box(0.8, 0.04, 0.8, 0, 0.76, 0, 0x4a3a2a);
  k.cyl(0.05, 0.07, 0.9, 0, 0.78, 0, C.woodDark, undefined, 6);
  // a clipped round crown with oranges in it
  const h = 1.75 + r() * 0.25;
  k.rock(0.62, 0, h, 0, tint(0x3d6a30, r, 0.08), seed, 0.92);
  k.rock(0.42, 0.18, h + 0.32, -0.1, tint(0x4a7a36, r, 0.08), seed + 1, 0.9);
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const yy = h - 0.35 + r() * 0.75;
    const rr = 0.52 + r() * 0.12;
    k.box(0.09, 0.09, 0.09, Math.cos(a) * rr, yy, Math.sin(a) * rr, 0xe58a24);
  }
  b.circle(p.x, p.z, 0.55);
}

function flag(b: SetBuilder, u: number, w: number): void {
  const p = court(u, w);
  b.at(p.x, p.z, courtDeg(0, Math.sign(w)), 0.3);
  const k = b.kit;
  k.cyl(0.22, 0.26, 0.5, 0, 0, 0, C.sandstone, undefined, 8);
  k.cyl(0.05, 0.07, 7.6, 0, 0.5, 0, C.woodDark, undefined, 6);
  k.cone(0.09, 0.22, 0, 8.1, 0, 0xc9a24a, 6);
  // Zweibrücken: blue and white lozenges on a hanging banner, a red pennant tail
  const fw = 1.3;
  const fh = 2.6;
  k.box(fw + 0.1, 0.05, 0.05, 0, 7.75, 0, C.woodDark);
  k.box(fw, fh, 0.03, 0, 7.7 - fh, 0, 0xf2efe6);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 2; j++) {
      if ((i + j) % 2) continue;
      k.box(fw / 2 - 0.04, fh / 4 - 0.04, 0.04, (j - 0.5) * (fw / 2), 7.7 - fh + (i + 0.02) * (fh / 4), 0, 0x2f5aa8);
    }
  k.box(0.32, 0.5, 0.035, 0, 7.7 - fh - 0.5, 0, 0xa83a2a);
  b.circle(p.x, p.z, 0.3);
}

function coach(b: SetBuilder, u: number, w: number): void {
  const p = court(u, w);
  b.at(p.x, p.z, courtDeg(-1, 0), 1.6);
  const k = b.kit;
  const body = 0x5a2a24;
  // chassis, wheels (large behind), a closed body with glass, the box seat and the shaft
  k.box(1.3, 0.12, 3.6, 0, 0.62, -0.2, C.woodDark);
  wheel(k, -0.82, 0.62, -1.4, 0.62, C.woodDark);
  wheel(k, 0.82, 0.62, -1.4, 0.62, C.woodDark);
  wheel(k, -0.78, 0.46, 1.1, 0.46, C.woodDark);
  wheel(k, 0.78, 0.46, 1.1, 0.46, C.woodDark);
  k.box(1.5, 1.3, 1.9, 0, 0.92, -0.45, body);
  k.box(1.56, 0.08, 1.96, 0, 2.2, -0.45, 0x2a1e18);
  k.box(1.3, 0.12, 1.7, 0, 2.28, -0.45, body);
  for (const s of [-1, 1]) {
    k.box(0.04, 0.5, 0.7, s * 0.76, 1.45, -0.45, 0x9ab0b8, undefined, 0.08);
    k.box(0.05, 0.08, 1.92, s * 0.76, 1.24, -0.45, 0xc9a24a);
  }
  k.box(0.8, 0.5, 0.06, 0, 1.52, 0.5, 0x9ab0b8, undefined, 0.08);
  k.box(1.1, 0.5, 0.6, 0, 1.0, 0.95, C.woodDark);
  k.box(1.0, 0.08, 0.5, 0, 1.5, 0.95, 0x2a1e18);
  k.box(0.08, 0.08, 2.4, 0, 0.55, 2.6, C.woodDark, [0.12, 0, 0]);
  b.box(p.x, p.z, courtDeg(-1, 0), 0.9, 2.3);
}

/** A market stall: posts, a counter with goods, a striped awning. */
function stall(b: SetBuilder, u: number, w: number, deg: number, seed: number, cloth: Hex): void {
  const p = court(u, w);
  b.at(p.x, p.z, deg, 1.4);
  const k = b.kit;
  const r = rng(seed);
  for (const [dx, dz] of [[-1.3, -0.7], [1.3, -0.7], [-1.3, 0.7], [1.3, 0.7]] as const) k.box(0.1, dz < 0 ? 2.5 : 2.2, 0.1, dx, 0, dz, C.wood);
  k.box(2.7, 0.08, 1.2, 0, 0.92, 0.1, C.wood);
  k.box(2.6, 0.84, 0.06, 0, 0.08, 0.68, C.woodGrey);
  // the awning slopes to the front, in stripes
  for (let i = 0; i < 7; i++) k.box(2.9 / 7, 0.03, 1.8, -1.45 + (i + 0.5) * (2.9 / 7), 2.32, 0.05, i % 2 ? 0xf0e8d6 : cloth, [-0.17, 0, 0]);
  // goods: crates, a basket, cabbages / apples / loaves as little lumps
  b.model('architecture.crate.lid', () => k.box(0.5, 0.36, 0.4, -0.8, 1.0, 0.1, C.wood), { x: -0.8, y: 1.0, z: 0.1, yaw: 0.2, scale: 0.75 });
  b.model('architecture.basket', () => k.cyl(0.24, 0.18, 0.24, 0.6, 1.0, 0.2, C.straw), { x: 0.6, y: 1.0, z: 0.2, yaw: 1.1, scale: 0.9 });
  const goods = [0x7aa24a, 0xc23a24, 0xd8a24a, 0x9a6a3a][seed % 4]!;
  for (let i = 0; i < 10; i++) k.rock(0.11 + r() * 0.04, -0.2 + r() * 0.6, 1.04, -0.15 + r() * 0.5, tint(goods, r, 0.12), seed * 13 + i, 0.85);
  b.model('architecture.barrel', () => barrel(k, seed), { x: 1.75, z: -0.3, yaw: r() * 3, scale: 0.75 });
  b.box(p.x, p.z, deg, 1.45, 0.8);
}

export const EHRENHOF_1789: SetDef = {
  id: 'ehrenhof-1789',
  eras: ['1789'],
  x: 1218,
  z: -1118,
  range: 260,
  keepFree: [
    [1218, -1118, 3], // the era anchor (the rosette)
    [1222, -1119, 3], // K1's anchor
    [1206, -1113, 2], // the prologue's Streuner
    [1201, -1115, 2.5], // K1: listening at the gate
    [1216, -1114, 2],
    [COURT.gate.x, COURT.gate.z, 2.2], // the gate itself
  ],
  build(b) {
    const { u0, u1, w } = PAVE;
    // the cobble field, then the sandstone on it (each a little higher: no z-fighting)
    drape(b, u0, u1, -w, w, 0.035, COB, SURF.COBBLE, 2.5);
    drape(b, u0, u1, -w, -w + 1.6, 0.06, BAND, SURF.STONE);
    drape(b, u0, u1, w - 1.6, w, 0.06, BAND, SURF.STONE);
    drape(b, u1 - 1.8, u1, -w + 1.6, w - 1.6, 0.06, BAND, SURF.STONE);
    drape(b, u0, u0 + 1.2, -w + 1.6, w - 1.6, 0.06, BAND, SURF.STONE);
    // gutters along the bands
    drape(b, u0 + 1.2, u1 - 1.8, -w + 1.6, -w + 1.85, 0.07, GUTTER, SURF.STONE, 4);
    drape(b, u0 + 1.2, u1 - 1.8, w - 1.85, w - 1.6, 0.07, GUTTER, SURF.STONE, 4);
    // the axis walk, gate to vestibule, and the cross walks to the wing doors
    drape(b, u0 + 1.2, u1 - 1.8, -1.7, 1.7, 0.075, WALK, SURF.STONE);
    drape(b, 31.1, 34.1, -w + 1.6, -1.7, 0.075, WALK, SURF.STONE);
    drape(b, 35.5, 38.5, 1.7, w - 1.6, 0.075, WALK, SURF.STONE);
    // the rosette round the anchor: a red sandstone ring, pale inside, a red star
    const [ru, rw] = ROSETTE;
    // (grey-ochre inlay, not red: a red ring with spokes read as an enemy's danger ring)
    ringAt(b, ru, rw, 4.6, 5.5, 0.09, INLAY_DARK, SURF.STONE, 48);
    ringAt(b, ru, rw, 1.7, 4.6, 0.085, WALK, SURF.STONE, 48);
    ringAt(b, ru, rw, 0, 1.0, 0.1, INLAY, SURF.STONE, 24);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ringAt(b, ru, rw, 1.0, 4.4, 0.095, i % 2 ? COB : INLAY, SURF.STONE, 2, a - 0.08, a + 0.08);
    }
    // the court's furniture
    for (const [u, ww] of LANTERNS) lanternPost(b, u, ww);
    TUBS.forEach(([u, ww], i) => orangeTub(b, u, ww, 500 + i * 7));
    flag(b, 3.2, -6.2);
    flag(b, 3.2, 6.2);
    coach(b, COACH[0], COACH[1]);
    // outside the railing: the market on the square (the road on the axis stays free)
    stall(b, -9, -8.5, courtDeg(0, 1), 41, 0x2f5aa8);
    stall(b, -15, -8.8, courtDeg(0, 1), 42, 0xa83a2a);
    stall(b, -9.5, 8.6, courtDeg(0, -1), 43, 0x3e6a4a);
    stall(b, -15.5, 9, courtDeg(0, -1), 44, 0xc9a24a);
    const k = b.kit;
    for (const [u, ww, s] of [[-12, -6.4, 1], [-12.6, 6.2, 2], [-18.4, -7, 3]] as const) {
      const p = court(u, ww);
      b.at(p.x, p.z, 0, 0.4);
      b.model('architecture.barrel', () => barrel(k, 600 + s), { yaw: s, scale: 0.85 });
      b.circle(p.x, p.z, 0.36);
    }
  },
};

// --- the people ---------------------------------------------------------------------------------

// just outside the gate (the square below the railing lies lower: they fade in there)
const OUT: UW = [-3.5, 0.4];
const VEST: UW = [58.6, 0];
const B02D: UW = [37, 17.6];
const B03D: UW = [32.6, -17.8];

/** Who stands and walks in the court (all in the K3 crowd's ghost kinds; no soldiers of 1793 there). */
export const COURT_LIFE: { walkers: Walker[]; standers: Stander[]; carts: CartSpec[] } = {
  standers: [
    // the guard: two at the gate, two at the steps of the vestibule
    { kind: 'soldier', at: [2.4, -3.3], face: [-1, 0] },
    { kind: 'soldier', at: [2.4, 3.3], face: [-1, 0] },
    { kind: 'soldier', at: [56.4, -3.2], face: [-1, 0] },
    { kind: 'soldier', at: [56.4, 3.2], face: [-1, 0] },
    // courtiers and maids in twos and threes
    { kind: 'onlooker', at: [40.5, -9.2], face: [0.3, 1] },
    { kind: 'woman', at: [41.6, -7.8], face: [-0.8, -0.4] },
    { kind: 'onlooker', at: [39.4, -7.6], face: [0.8, -0.3] },
    { kind: 'woman', at: [16.2, 10.6], face: [0.4, -1] },
    { kind: 'onlooker', at: [16.6, 9.2], face: [-0.3, 1] },
    { kind: 'woman', at: [51.5, -13.4], face: [1, 0.2] },
  ],
  walkers: [
    // servants between the wings and the vestibule, a maid to the gate and back, the guard's round
    { kind: 'bundle', path: [B03D, [33, -6], [55, -2.5], VEST], speed: 1.25, rest: 6, offset: 0 },
    { kind: 'woman', path: [VEST, [52, 3], [37, 8], B02D], speed: 1.1, rest: 9, offset: 7 },
    { kind: 'painting', path: [B02D, [36, 6], [12, 3.4], [1.5, 1.6], OUT], speed: 1.2, rest: 14, offset: 3 },
    { kind: 'onlooker', path: [OUT, [1.5, -1.4], [18, -6.5], [31.5, -10], B03D], speed: 1.35, rest: 10, offset: 18 },
    { kind: 'soldier', path: [[6, -11.8], [50, -11.8], [50, 11.6], [6, 11.6], [6, -11.8]], speed: 1.0, rest: 0, offset: 0, stride: 1.5 },
    { kind: 'chair', path: [B03D, [30, -8], [45, -5], VEST], speed: 1.0, rest: 22, offset: 30 },
  ],
  carts: [
    // a coach (the ghost cart with its horse) comes in, waits at the steps, turns and goes
    { id: 'coach', pathIn: [OUT, [1, 0.2], [30, 3.6], [51, 3.6]], stop: 16, pathOut: [[51, 3.6], [53, 9], [44, 6.2], [20, 4], [1, -0.2], OUT], speed: 1.7, rest: 26, offset: 4, load: 0 },
  ],
};

const MAXK: Partial<Record<GhostKind, number>> = { soldier: 6, onlooker: 6, woman: 6, bundle: 2, painting: 2, chair: 2, cart: 1 };

/** The court's ghost people (instanced; one draw call per kind). */
export class CourtLife {
  readonly object = new Group();
  private readonly mat = ghostMaterial(new Color(0.98, 0.88, 0.7));
  private readonly batches = new Map<GhostKind, GhostBatch>();
  private readonly pose: GhostPose = { x: 0, y: 0, z: 0, yaw: 0, walk: 0, walkAmt: 0, fade: 0, seed: 0, raise: 0, load: 0, wheel: 0, scale: 1 };
  T = 0;

  constructor(private readonly heightAt: (x: number, z: number) => number) {
    this.object.name = 'court-life';
    for (const [kind, n] of Object.entries(MAXK) as [GhostKind, number][]) {
      const b = new GhostBatch(kind, n, this.mat);
      b.mesh.name = `court-life-${kind}`;
      this.batches.set(kind, b);
      this.object.add(b.mesh);
    }
  }

  /** How many figures stand / walk right now (tests, hooks). */
  get count(): number {
    let n = 0;
    for (const b of this.batches.values()) n += b.count;
    return n;
  }

  update(dt: number, reducedMotion: boolean): void {
    this.T += dt;
    const T = this.T;
    const H = this.heightAt;
    const P = this.pose;
    this.mat.uniforms.uMotion!.value = reducedMotion ? 0.35 : 1;
    for (const b of this.batches.values()) b.begin();
    COURT_LIFE.walkers.forEach((wk, i) => {
      const pl = walkerAt(wk, T);
      if (pl.fade <= 0) return;
      const p = court(pl.u, pl.w);
      Object.assign(P, { x: p.x, y: H(p.x, p.z), z: p.z, yaw: pl.yaw, walk: (pl.dist / (wk.stride ?? 1.35)) * Math.PI * 2, walkAmt: 1, fade: pl.fade, seed: i * 0.731 + 0.2, raise: 0, load: 1, wheel: 0, scale: 1 });
      this.batches.get(wk.kind)?.push(P);
    });
    COURT_LIFE.standers.forEach((st, i) => {
      const p = court(st.at[0], st.at[1]);
      const seed = i * 0.613 + 0.4;
      // the courtiers talk: now and then a hand goes up
      const raise = st.kind === 'soldier' ? 0 : Math.max(0, Math.sin(T * 0.7 + i * 2.1) - 0.7) * 1.6;
      Object.assign(P, { x: p.x, y: H(p.x, p.z), z: p.z, yaw: courtYaw(st.face[0], st.face[1]) + Math.sin(T * 0.13 + i) * 0.1, walk: T * 0.6 + i, walkAmt: 0.05, fade: 1, seed, raise, load: 1, wheel: 0, scale: 0.96 + ((i * 37) % 9) * 0.01 });
      this.batches.get(st.kind)?.push(P);
    });
    for (const c of COURT_LIFE.carts) {
      const pl = cartAt(c, T);
      if (pl.fade <= 0) continue;
      const p = court(pl.u, pl.w);
      Object.assign(P, { x: p.x, y: H(p.x, p.z), z: p.z, yaw: pl.yaw, walk: (pl.dist / 1.6) * Math.PI * 2, walkAmt: pl.moving ? 1 : 0, fade: pl.fade, seed: 1.3, raise: 0, load: 0, wheel: -pl.dist / 0.62, scale: 1 });
      this.batches.get('cart')?.push(P);
    }
    for (const b of this.batches.values()) b.end();
  }

  dispose(): void {
    for (const b of this.batches.values()) b.dispose();
    this.mat.dispose();
    this.object.removeFromParent();
  }
}
