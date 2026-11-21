/**
 * The Karlsbergquelle as a scenery set (NEXT-SESSION §3.6; position, layout and the shared height
 * math in src/systems/quelle/layout.ts). Stone, wood, iron and green only — the water, the stream,
 * the brook, the trail decal and the motes are the quelle system's (they animate and take part in
 * the touch).
 *
 *  - today: the reference photo — a hollowed oak log with furrowed bark, ringed ends and moss on
 *    two stumps, before a low dry wall of weathered red and grey sandstone (dark joints, moss on
 *    top, ivy) with a small plaque, an iron pipe, mossy sandstone steps on the left, mossy blocks
 *    along the trail, and up the slope behind a little arched spring house of rough rubble, half
 *    sunk, mossy, with an iron grate; stones, moss and ferns along the brook;
 *  - 1789 (and the two 1793 nights): the same place new and dressed — an ashlar front with a
 *    round-arched niche, pilasters and a cornice, a bronze spout into a stone basin, a flagged
 *    apron laid into the slope; the spring house up the slope with a plank door. February 1793
 *    adds icicles (the prop material puts snow on top by itself); the July night is lit by the
 *    fire's glow;
 *  - 1796: plundered — the spout torn out, cornice stones on the ground, the basin cracked, flags
 *    gone, the spring house door gone.
 *
 * Everything is original procedural masonry and carpentry; the ferns are the CC0 fern clump on the
 * medium / high tiers. One merged mesh (the kit) plus the signs and the instanced ferns.
 */
import { BufferAttribute, BufferGeometry, CylinderGeometry, ExtrudeGeometry, IcosahedronGeometry, Matrix4, Shape, Vector2, Vector3 } from 'three';
import type { Era } from '../../core/era';
import { SURF } from '../../world/surfaces';
import { clearings as bleicheClearings } from '../bleiche/layout';
import {
  basinBase,
  BROOK_LEN,
  BROOK_PATHS,
  BROOK_REF,
  brookLine,
  groundLocal,
  lookFor,
  meshGround,
  PATH_HALF,
  PIECES,
  QUELLE,
  toLocal,
  toWorld,
  TRAIL,
  trailLine,
  troughFrame,
  TROUGH_CUT,
  wallBase,
  type QuelleLook,
} from '../quelle/layout';
import { type SetBuilder, face } from './builder';
import { type Hex, type Kit, rng, tint } from './kit';
import { C } from './props';
import type { SetDef } from './sets';

type V3 = [number, number, number];

/**
 * The kit linearises a colour that three has already linearised (props.ts C is light for that
 * reason): hand it the sRGB colour encoded once more, so what shows on screen is `hex`.
 */
function ink(hex: Hex): Hex {
  const e = (v: number) => {
    const l = v / 255;
    return Math.round(255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055));
  };
  return (e((hex >> 16) & 255) << 16) | (e((hex >> 8) & 255) << 8) | e(hex & 255);
}

// weathered Buntsandstein: red, grey and pale stones side by side (the reference photo)
const STONE_GREY = ink(0x7b746c);
const STONE_RED = ink(0x86675a);
const STONE_DARK = ink(0x5c4f47);
const STONE_PALE = ink(0x938474);
const MORTAR = ink(0x332c26);
const MOSS = ink(0x4f5d2c);
const MOSS_DARK = ink(0x3d4925);
const MOSS_LIGHT = ink(0x64713a);
const EARTH = ink(0x6e5442);
// an oak log gone grey: furrowed bark, a weathered cut, pale end grain with darker rings
const BARK = ink(0x6f6354);
const BARK_DARK = ink(0x4a4036);
const BARK_GREY = ink(0x7a7164);
const CUT = ink(0x9c8a72);
const ENDGRAIN = ink(0xb89f7c);
const RING = ink(0x8c7256);
const HEART = ink(0x6e5a46);
const IVY = ink(0x3c5a2a);
const IVY_LIGHT = ink(0x587a3c);
// the dressed sandstone of the baroque eras: cream, warm and cool blocks, darker joints
const ASHLAR = ink(0xbfac8e);
const ASHLAR_WARM = ink(0xb39b7b);
const ASHLAR_COOL = ink(0xbab09c);
const JOINT = ink(0x75675a);
const DARK: Hex = 0x16130f;
const BRONZE = ink(0x8e6c3c);
const ICE: Hex = 0xdde8f0;
const FERN: Hex = 0x7f9f4c;
const BOARD = ink(0x5e4630);

/** A ring sector (the hollowed log's section): outer radius R, inner r, cut flat at height c. */
export function logSection(R: number, r: number, c: number, filled = false): Shape {
  const pts: Vector2[] = [];
  const a0 = Math.asin(c / R);
  const n = 18;
  // outer arc from the right rim down through the bottom to the left rim
  for (let i = 0; i <= n; i++) {
    const a = a0 - (i / n) * (Math.PI + 2 * a0);
    pts.push(new Vector2(Math.cos(a) * R, Math.sin(a) * R));
  }
  if (!filled) {
    const b0 = Math.asin(c / r);
    // inner arc back from the left rim to the right rim
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI - b0 + (i / n) * (Math.PI + 2 * b0);
      pts.push(new Vector2(Math.cos(a) * r, Math.sin(a) * r));
    }
  }
  return new Shape(pts);
}

/** Put the kit at local (u, w) at height y, facing the spring's front (+ extra degrees). */
function at(b: SetBuilder, u: number, w: number, y: number, extraDeg = 0): void {
  const [x, z] = toWorld(u, w);
  b.kit.place(x, y, z, face(QUELLE.facing + extraDeg));
}

const g = (b: SetBuilder, u: number, w: number) => groundLocal(b.heightAt, u, w);

/** A flat-shaded convex polygon (triangle fan) in the current kit frame. */
function poly(k: Kit, pts: readonly V3[], color: Hex): void {
  if (pts.length < 3) return;
  const pos: number[] = [];
  for (let i = 1; i + 1 < pts.length; i++) pos.push(...pts[0]!, ...pts[i]!, ...pts[i + 1]!);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.computeVertexNormals();
  k.add(geo, color);
}

/** Several flat-shaded quads of one colour as one piece. */
function quads(k: Kit, list: readonly (readonly [V3, V3, V3, V3])[], color: Hex): void {
  if (!list.length) return;
  const pos: number[] = [];
  for (const [a, b, c, d] of list) pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.computeVertexNormals();
  k.add(geo, color);
}

/** A stone of the place: red, grey, dark or pale (and now and then all moss). */
function stoneCol(r: () => number, mossy = 0): Hex {
  if (r() < mossy) return tint(r() < 0.5 ? MOSS : MOSS_DARK, r, 0.12);
  const y = r();
  return tint(y < 0.34 ? STONE_GREY : y < 0.7 ? STONE_RED : y < 0.87 ? STONE_DARK : STONE_PALE, r, 0.1);
}

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();

/**
 * A rough stone (or a moss cushion) like `kit.rock` — a squashed, jittered icosahedron — whose
 * up-facing faces (normal y > `t`) are moss and the rest stone. Cushions (`side` omitted) are
 * smooth-shaded, so they read soft, not as green crystals.
 */
function blob(k: Kit, size: number, x: number, y: number, z: number, seed: number, squash: number, o: { top: Hex; side?: Hex; t?: number; detail?: number }): void {
  const geo = new IcosahedronGeometry(size, o.detail ?? 0);
  const r = rng(seed);
  const p = geo.getAttribute('position');
  const jit = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let j = jit.get(key);
    if (j === undefined) {
      j = 0.8 + r() * 0.36;
      jit.set(key, j);
    }
    p.setXYZ(i, p.getX(i) * j, p.getY(i) * j * squash, p.getZ(i) * j);
  }
  const lift = size * squash * 0.6;
  const groups: { pos: number[]; nor: number[] }[] = [
    { pos: [], nor: [] },
    { pos: [], nor: [] },
  ];
  const smooth = o.side === undefined;
  // on a stone the moss only takes one side of its top (the damp side), the rest shows bare stone
  const ma = r() * 6.28;
  const mx = Math.cos(ma);
  const mz = Math.sin(ma);
  for (let f = 0; f + 2 < p.count; f += 3) {
    _a.fromBufferAttribute(p, f);
    const cx = (_a.x + p.getX(f + 1) + p.getX(f + 2)) / 3;
    const cz = (_a.z + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
    _b.fromBufferAttribute(p, f + 1).sub(_a);
    _c.fromBufferAttribute(p, f + 2).sub(_a);
    const n = _b.cross(_c).normalize();
    const gi = smooth || (n.y > (o.t ?? 0.45) && (cx * mx + cz * mz) / size > -0.25) ? 0 : 1;
    for (let v = 0; v < 3; v++) {
      const px = p.getX(f + v);
      const py = p.getY(f + v);
      const pz = p.getZ(f + v);
      groups[gi]!.pos.push(px, py + lift, pz);
      // moss is soft (smooth normals); the stone below keeps its facets
      if (gi === 0) {
        const l = Math.hypot(px, py / (squash * squash), pz) || 1;
        groups[gi]!.nor.push(px / l, py / (squash * squash) / l, pz / l);
      } else groups[gi]!.nor.push(n.x, n.y, n.z);
    }
  }
  geo.dispose();
  const m = new Matrix4().makeRotationY(r() * 6.28).setPosition(x, y, z);
  groups.forEach((gr, i) => {
    if (!gr.pos.length) return;
    const bg = new BufferGeometry();
    bg.setAttribute('position', new BufferAttribute(new Float32Array(gr.pos), 3));
    bg.setAttribute('normal', new BufferAttribute(new Float32Array(gr.nor), 3));
    k.add(bg, i === 0 ? o.top : o.side!, 0, m, i === 0 ? SURF.NONE : SURF.STONE);
  });
}

/** A moss cushion (smooth, soft). */
function cushion(k: Kit, size: number, x: number, y: number, z: number, seed: number, r: () => number, squash = 0.3): void {
  blob(k, size, x, y, z, seed, squash, { top: tint(r() < 0.45 ? MOSS : r() < 0.7 ? MOSS_DARK : MOSS_LIGHT, r, 0.08), detail: size > 0.17 ? 1 : 0 });
}

/** Icicle hanging from y (prop space). */
function icicle(b: SetBuilder, x: number, y: number, z: number, r: number, len: number): void {
  b.kit.cone(r, len, x, y, z, ICE, 5, [Math.PI, 0, 0]);
}

/**
 * Distance LOD of the fern clumps (tri budget phase B, docs/PERFORMANCE.md §3.5): the scanned CC0
 * clump (`nature.fern.02`, four ferns, ~5.6k triangles, drawn in the main, shadow and water
 * reflection passes) stays where the player stands at home base: within `FERN_NEAR` m of the
 * trough, or within `FERN_TRAIL` m of the trail's stretch through the hollow (its points within
 * `FERN_TRAIL_SPAN` m of the trough). Further out a clump is the stylised forest fern of the
 * scattered props (`nature2.ferns#fern`, 288 triangles) at the same spot, height and footprint.
 */
export const FERN_NEAR = 9;
export const FERN_TRAIL = 3;
export const FERN_TRAIL_SPAN = 14;

/** Local (u, w) points of the trail through the hollow, every 0.5 m. */
let hollowTrail: [number, number][] | null = null;
function hollowTrailPoints(): [number, number][] {
  if (hollowTrail) return hollowTrail;
  const T = PIECES.trough;
  hollowTrail = TRAIL.flatMap((s) => trailLine(s, 0.5))
    .map((p) => toLocal(p.x, p.z))
    .filter(([u, w]) => Math.hypot(u - T.u, w - T.w) <= FERN_TRAIL_SPAN);
  return hollowTrail;
}

/** Whether the fern clump at local (u, w) keeps the detailed CC0 model (see `FERN_NEAR`). */
export function fernDetailed(u: number, w: number): boolean {
  const T = PIECES.trough;
  if (Math.hypot(u - T.u, w - T.w) <= FERN_NEAR) return true;
  return hollowTrailPoints().some(([tu, tw]) => Math.hypot(u - tu, w - tw) <= FERN_TRAIL);
}

/**
 * Height of the stylised fern for a clump of scale `s` (m): about the detailed clump's crown
 * (0.4 m authored × 0.55 × s) with a little more for the rosette's droop; its ~3.3 × wider spread
 * then covers the clump's footprint (~1.1 m × s).
 */
export const fernFarHeight = (s: number) => 0.3 * s;
/** Authored height of `nature2.ferns#fern` (assets:set units). */
const FERN_FAR_AUTHORED = 2.69;

/** A fern clump (CC0 model on medium / high, three leaf cones on low). */
function fern(b: SetBuilder, u: number, w: number, s: number, seed: number, snow: boolean): void {
  at(b, u, w, g(b, u, w) - 0.05, seed * 37);
  const k = b.kit;
  const fallback = () => {
    const col = snow ? 0x6d6a55 : FERN;
    for (let i = 0; i < 3; i++) k.cone(0.16 * s, 0.7 * s, Math.cos(i * 2.1) * 0.18 * s, 0, Math.sin(i * 2.1) * 0.18 * s, tint(col, rng(seed + i), 0.15), 5, [Math.cos(i * 2.1) * 0.5, 0, Math.sin(i * 2.1) * 0.5]);
  };
  // the detailed clump's four ferns spread over x 0–2 / z 0–1.7 (authored): the far fern sits at
  // that footprint's centre
  if (fernDetailed(u, w)) b.model('nature.fern.02', fallback, { yaw: seed * 1.3, scale: s * 0.55 });
  else {
    const yaw = seed * 1.3;
    const cx = 0.45 * s * 0.55;
    const cz = 0.44 * s * 0.55;
    b.model('nature2.ferns#fern', fallback, { x: Math.cos(yaw) * cx + Math.sin(yaw) * cz, z: -Math.sin(yaw) * cx + Math.cos(yaw) * cz, yaw, scale: fernFarHeight(s) / FERN_FAR_AUTHORED });
  }
}

/**
 * Ivy hanging down a face (prop frame: the face is the local z = 0 plane, +z out of it) from
 * (x, y): a wandering strand of small leaves, `n` of them.
 */
function ivy(k: Kit, x: number, y: number, n: number, r: () => number): void {
  const prev = k.surface;
  k.surface = SURF.NONE;
  let cx = x;
  let cy = y;
  for (let i = 0; i < n; i++) {
    cx += (r() - 0.5) * 0.09;
    cy -= 0.045 + r() * 0.04;
    for (let j = 0; j < 2; j++) {
      const s = 0.045 + r() * 0.035;
      const lx = cx + (r() - 0.5) * 0.08;
      const ly = cy + (r() - 0.5) * 0.05;
      const lz = 0.012 + r() * 0.03;
      const a = r() * Math.PI * 2;
      const ca = Math.cos(a) * s;
      const sa = Math.sin(a) * s;
      // a five-point leaf, tipped a little out of the wall
      poly(
        k,
        [
          [lx, ly, lz],
          [lx + ca * 0.6 - sa * 0.5, ly + sa * 0.6 + ca * 0.5, lz + 0.01],
          [lx + ca, ly + sa, lz + 0.02],
          [lx + ca * 0.6 + sa * 0.5, ly + sa * 0.6 - ca * 0.5, lz + 0.01],
        ],
        tint(r() < 0.6 ? IVY : IVY_LIGHT, r, 0.12),
      );
    }
  }
  k.surface = prev;
}

/** How far the wall bows back into the slope at u (it curves round the hollow). */
const bow = (u: number) => 0.32 * (u / PIECES.wall.u1) ** 2;

/**
 * A dry wall of rough sandstone along u (u0…u1), its face at w = wFace(u), `h` high on base(u):
 * uneven courses of red, grey and pale stones standing a little proud of a dark joint plane, a
 * stone-coloured body behind, moss on top and dripping over the edge.
 */
interface WallLook {
  /** stone colour */
  col?: (r: () => number) => Hex;
  joint?: Hex;
  body?: Hex;
  /** dressed: level courses of squared blocks with fine joints, flat cover stones on top */
  dressed?: Hex;
}

function rubbleWall(b: SetBuilder, u0: number, u1: number, h: number, thick: number, seed: number, wFace: (u: number) => number, base: (u: number) => number, mossTop = true, o: WallLook = {}): void {
  const k = b.kit;
  const r = rng(seed);
  const prev = k.surface;
  const col = o.col ?? ((rr: () => number) => stoneCol(rr));
  const dressed = o.dressed !== undefined;
  // every piece turns with the bow of the wall, so neighbours meet without steps
  const turn = (u: number): number => (Math.atan((wFace(u + 0.01) - wFace(u - 0.01)) / 0.02) * 180) / Math.PI;
  const capH = dressed ? 0.1 : 0;
  const body = h - capH;
  // the joints and the body, in short straight pieces along the bow
  for (let u = u0; u < u1 - 0.01; u += 0.3) {
    const ue = Math.min(u1, u + 0.3);
    const cu = (u + ue) / 2;
    at(b, cu, wFace(cu), base(cu) - 0.12, turn(cu));
    k.surface = SURF.NONE;
    k.box(ue - u + 0.03, body + 0.1, 0.03, 0, 0, -0.045, o.joint ?? MORTAR);
    k.surface = SURF.STONE;
    k.box(ue - u + 0.03, body + 0.08, thick - 0.12, 0, 0, -0.06 - (thick - 0.12) / 2, o.body ?? STONE_DARK);
  }
  // the stones: rough courses that are never quite level, or (dressed) level courses of blocks
  k.surface = SURF.STONE;
  const rows = Math.max(3, Math.round(body / 0.22));
  let y = 0;
  let row = 0;
  while (y < body - 0.05) {
    const rh = dressed ? body / rows : Math.min(body - y, 0.17 + r() * 0.12);
    let u = u0 - (dressed ? 0 : 0.04) + (row % 2) * (dressed ? 0.18 : 0.16 * r());
    if (dressed && row % 2) {
      // a half block at the start of every other course
      at(b, (u0 + u) / 2, wFace((u0 + u) / 2), base(u0) + y, turn((u0 + u) / 2));
      k.box(u - u0 - 0.016, rh - 0.016, 0.2, 0, 0, -0.09, col(r));
    }
    while (u < u1 - 0.06) {
      const len = Math.min(u1 + (dressed ? 0 : 0.03) - u, dressed ? (u1 - u < 0.55 ? u1 - u : 0.34 + r() * 0.24) : 0.22 + r() * 0.36);
      const cu = u + len / 2;
      const c = col(r);
      if (dressed) {
        at(b, cu, wFace(cu), base(cu) + y, turn(cu));
        k.box(len - 0.016, rh - 0.016, 0.2, 0, 0, -0.09, c);
      } else {
        const sh = rh * (0.8 + r() * 0.18);
        const rot: V3 = [(r() - 0.5) * 0.05, (r() - 0.5) * 0.12, (r() - 0.5) * 0.08];
        at(b, cu, wFace(cu) + r() * 0.035, base(cu) + y + (rh - sh) * r() * 0.6, turn(cu));
        k.box(Math.max(0.08, len - 0.03 - r() * 0.025), sh, 0.15 + r() * 0.08, 0, 0, -0.1, c, rot);
      }
      u += len;
    }
    y += rh;
    row++;
  }
  if (dressed) {
    // flat cover stones along the top, a little proud of the face
    for (let u = u0; u < u1 - 0.05; ) {
      const len = u1 - u < 0.6 ? u1 - u : 0.4 + r() * 0.2;
      const cu = u + len / 2;
      at(b, cu, wFace(cu), base(cu) + body, turn(cu));
      k.box(len - 0.016, capH - 0.01, thick - 0.02, 0, 0, 0.03 - (thick - 0.02) / 2, tint(o.dressed!, r, 0.05));
      u += len;
    }
  }
  if (mossTop) {
    // moss over the top, dripping over the edge
    k.surface = SURF.NONE;
    for (let u = u0 + 0.1; u < u1 - 0.06; u += 0.16 + r() * 0.2) {
      at(b, u, wFace(u) - thick * (0.15 + r() * 0.6), base(u) + h - 0.07 + capH * 0.8, r() * 360);
      cushion(k, 0.1 + r() * 0.1, 0, 0, 0, seed * 3 + Math.round((u + 5) * 13), r, 0.34);
    }
  }
  k.surface = prev;
}

/** The low dry wall behind the trough (today). */
function dryWall(b: SetBuilder): void {
  const W = PIECES.wall;
  const k = b.kit;
  const r = rng(1061);
  const wf = (u: number) => W.w - bow(u);
  const base = (u: number) => g(b, u, W.w - 0.2) - 0.08;
  rubbleWall(b, W.u0, W.u1, W.h, W.thick, 1061, wf, base);
  // ivy over its face, away from the plaque and the pipe
  for (const u of [-2.3, -1.6, 1.35, 2.1, 2.55]) {
    at(b, u, wf(u) + 0.045, base(u));
    ivy(k, 0, W.h + 0.02, 5 + Math.floor(r() * 6), r);
  }
  // a few stones fallen forward (not where you stand at the trough)
  const prev = k.surface;
  k.surface = SURF.STONE;
  for (let i = 0; i < 6; i++) {
    const u = W.u0 + 0.3 + r() * (W.u1 - W.u0 - 0.6);
    if (Math.abs(u - PIECES.trough.u) < 1.5) continue;
    const w = W.w + 0.22 + r() * 0.3;
    at(b, u, w, g(b, u, w) - 0.06);
    blob(k, 0.12 + r() * 0.08, 0, 0, 0, 400 + i, 0.6, { top: tint(MOSS, r, 0.1), side: stoneCol(r), t: 0.6 });
  }
  k.surface = prev;
  // solids: three boxes along the bow
  for (const [u0, u1] of [[W.u0, -0.9], [-0.9, 0.9], [0.9, W.u1]] as const) {
    const cu = (u0 + u1) / 2;
    b.box(...toWorld(cu, W.w - bow(cu) - W.thick / 2), QUELLE.facing, (u1 - u0) / 2, W.thick / 2 + 0.05);
  }
}

/** A short stump (prop frame at its foot): ridged bark, moss round the foot, the cut on top. */
function stump(k: Kit, rad: number, h: number, r: () => number): void {
  const n = 11;
  const ring: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = rad * (i % 2 ? 0.92 : 1.0) * (0.96 + r() * 0.08);
    ring.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const mid = h * (0.3 + r() * 0.12);
  const low: (readonly [V3, V3, V3, V3])[][] = [[], []];
  for (let i = 0; i < n; i++) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % n]!;
    const f = 1.16;
    // the foot flares out; moss climbs it on the shady side
    low[r() < 0.65 ? 0 : 1]!.push([[ax * f, 0, az * f], [bx * f, 0, bz * f], [bx, mid, bz], [ax, mid, az]]);
  }
  k.surface = SURF.STONE;
  quads(k, low[0]!, tint(BARK_DARK, r, 0.08));
  quads(k, low[1]!, tint(BARK_DARK, r, 0.12));
  for (let i = 0; i < n; i++) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % n]!;
    k.surface = SURF.STONE;
    quads(k, [[[ax, mid, az], [bx, mid, bz], [bx, h, bz], [ax, h, az]]], tint(i % 2 ? BARK_DARK : BARK, r, 0.08));
  }
  k.surface = SURF.FINEWOOD;
  poly(k, ring.map(([x, z]) => [x, h, z] as V3), ENDGRAIN);
}

/**
 * The hollowed log (prop frame on its axis, the axis along x): furrowed bark with moss, the
 * weathered flat cut on top, the hollow (closed short of both ends) and the two sawn ends with
 * their rings.
 */
function logBody(k: Kit, r: () => number): void {
  const T = PIECES.trough;
  const R = T.r;
  const ri = T.inner;
  const c = TROUGH_CUT;
  const L = T.len;
  const endT = 0.12;
  const a0 = Math.asin(c / R);
  const span = Math.PI + 2 * a0;
  const nA = 20;
  const nL = 10;
  // the bark: ridges and furrows along the log, a few bumps; exactly round at the rims and the ends
  const rad: number[][] = [];
  for (let i = 0; i <= nA; i++) {
    const row: number[] = [];
    for (let j = 0; j <= nL; j++) {
      const edge = i === 0 || i === nA;
      const end = j === 0 || j === nL;
      const furrow = (i + (j % 3 === 0 ? 1 : 0)) % 2 ? -0.03 - r() * 0.04 : 0.005 + r() * 0.02;
      row.push(edge ? R : end ? R * 0.985 : R * (1 + furrow + (r() - 0.5) * 0.03 + Math.sin(j * 1.7 + i) * 0.012));
    }
    rad.push(row);
  }
  const ang = (i: number) => a0 - (i / nA) * span;
  const P = (i: number, j: number): V3 => {
    const a = ang(i);
    const rr = rad[i]![j]!;
    return [-L / 2 + (j / nL) * L, Math.sin(a) * rr, Math.cos(a) * rr];
  };
  const groups = new Map<Hex, [V3, V3, V3, V3][]>();
  const mossy: [V3, V3, V3, V3][] = [];
  const mossy2: [V3, V3, V3, V3][] = [];
  for (let i = 0; i < nA; i++) {
    const a = ang(i + 0.5);
    const back = Math.cos(a) < 0; // the side towards the wall (north-east, shady)
    const bottom = Math.abs(a + Math.PI / 2) < 0.7;
    for (let j = 0; j < nL; j++) {
      const q: [V3, V3, V3, V3] = [P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j)];
      const nearEnd = j < 2 || j >= nL - 2;
      const pm = (back ? 0.3 : 0) + (bottom && nearEnd ? 0.3 : 0);
      if (r() < pm) {
        (r() < 0.6 ? mossy : mossy2).push(q);
        continue;
      }
      const pick = r();
      const col = pick < 0.55 ? BARK : pick < 0.88 ? BARK_GREY : BARK_DARK;
      let l = groups.get(col);
      if (!l) groups.set(col, (l = []));
      l.push(q);
    }
  }
  // the cracked-stone layer reads as old cracked bark (the planks one would read as boards)
  k.surface = SURF.STONE;
  for (const [col, list] of groups) quads(k, list, tint(col, r, 0.04));
  k.surface = SURF.NONE;
  quads(k, mossy, MOSS_DARK);
  quads(k, mossy2, tint(MOSS_DARK, r, 0.1));
  // moss cushions on the front, low near the ends where it stays damp, and along the back rim
  for (const [mx, ma, ms] of [[-0.85, -1.9, 0.09], [-0.7, -2.2, 0.07], [0.9, -2.0, 0.08], [0.25, -2.5, 0.06], [-0.95, -1.5, 0.06]] as const) {
    cushion(k, ms, mx, Math.sin(ma) * R - 0.02, -Math.cos(ma) * R * 0.98, 4800 + Math.round(mx * 100), r, 0.45);
  }
  // a knot where a branch was
  k.surface = SURF.PLANKS;
  k.cyl(0.035, 0.05, 0.05, 0.42, -0.02, R * 0.94, BARK_DARK, [Math.PI / 2 - 0.15, 0, 0], 7);
  k.surface = SURF.FINEWOOD;
  k.cyl(0.03, 0.03, 0.006, 0.42, -0.028, R * 0.94 + 0.05, RING, [Math.PI / 2 - 0.15, 0, 0], 7);
  // the hollow: wet dark wood, closed short of both ends
  const b0 = Math.asin(c / ri);
  const nI = 10;
  const x0 = -L / 2 + endT;
  const x1 = L / 2 - endT;
  const pin = (a: number, x: number): V3 => [x, Math.sin(a) * ri, Math.cos(a) * ri];
  const hollow: [V3, V3, V3, V3][] = [];
  for (let i = 0; i < nI; i++) {
    const a1 = b0 - (i / nI) * (Math.PI + 2 * b0);
    const a2 = b0 - ((i + 1) / nI) * (Math.PI + 2 * b0);
    hollow.push([pin(a1, x0), pin(a1, x1), pin(a2, x1), pin(a2, x0)]);
  }
  k.surface = SURF.FINEWOOD;
  quads(k, hollow, HEART);
  for (const x of [x0, x1]) {
    const pts: V3[] = [];
    for (let i = 0; i <= nI; i++) pts.push(pin(b0 - (i / nI) * (Math.PI + 2 * b0), x));
    poly(k, pts, tint(HEART, r, 0.05));
  }
  // the flat cut along the top, weathered grey-tan
  const zo = Math.sqrt(R * R - c * c);
  const zi = Math.sqrt(ri * ri - c * c);
  const rim: [V3, V3, V3, V3][] = [];
  for (const s of [-1, 1]) rim.push([[x0, c, s * zi], [x1, c, s * zi], [x1, c, s * zo], [x0, c, s * zo]]);
  for (const [xa, xb] of [[-L / 2, x0], [x1, L / 2]] as const) rim.push([[xa, c, -zo], [xb, c, -zo], [xb, c, zo], [xa, c, zo]]);
  quads(k, rim, CUT);
  // the sawn ends: rings round the pith, the sapwood paler, the bark a dark band; one crack
  const fr = [0, 0.14, 0.3, 0.45, 0.59, 0.72, 0.84, 0.93, 1];
  const ringCol = (n: number): Hex => (n === 0 ? RING : n >= fr.length - 2 ? BARK_DARK : n === fr.length - 3 ? tint(ENDGRAIN, r, 0.03) : n % 2 ? RING : ENDGRAIN);
  const capAng: number[] = [];
  for (let i = 0; i <= nA; i += 2) capAng.push(ang(i));
  for (let i = 1; i < 4; i++) capAng.push(ang(nA) - (i / 4) * (Math.PI - 2 * a0));
  capAng.push(a0 - 2 * Math.PI);
  for (const s of [-1, 1]) {
    const x = s * (L / 2 + 0.002);
    const cp = (a: number, f: number): V3 => {
      const rr = R * 0.985 * f;
      return [x, Math.min(c, Math.sin(a) * rr), Math.cos(a) * rr];
    };
    for (let n = 0; n + 1 < fr.length; n++) {
      const band: [V3, V3, V3, V3][] = [];
      for (let m = 0; m + 1 < capAng.length; m++) band.push([cp(capAng[m]!, fr[n]!), cp(capAng[m + 1]!, fr[n]!), cp(capAng[m + 1]!, fr[n + 1]!), cp(capAng[m]!, fr[n + 1]!)]);
      k.surface = SURF.FINEWOOD;
      quads(k, band, tint(ringCol(n), r, 0.04));
    }
    // a dry crack from the pith
    const ca = -1.1 + s * 0.4;
    k.surface = SURF.NONE;
    quads(k, [[[x + s * 0.002, 0, 0], [x + s * 0.002, Math.sin(ca) * R * 0.8, Math.cos(ca) * R * 0.8 + 0.006], [x + s * 0.002, Math.sin(ca) * R * 0.8, Math.cos(ca) * R * 0.8 - 0.006], [x + s * 0.002, 0, 0.003]]], BARK_DARK);
  }
}

/** The hollowed log trough on two stumps (today). */
function logTrough(b: SetBuilder): void {
  const k = b.kit;
  const T = PIECES.trough;
  const { gl, gr, axisY } = troughFrame(b.heightAt);
  const r = rng(4711);
  const prevSurf = k.surface;
  for (const [s, gg] of [[-1, gl], [1, gr]] as const) {
    const su = T.u + s * T.len * 0.33;
    at(b, su, T.w, gg - 0.08, s * 23);
    stump(k, 0.2, axisY - gg - T.r * 0.62 + 0.08, r);
    // moss cushions and a stone or two round the foot
    k.surface = SURF.NONE;
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + s;
      cushion(k, 0.1 + r() * 0.06, Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.2, 70 + i + s * 5, r, 0.55);
    }
    k.surface = SURF.STONE;
    k.rock(0.07, 0.3 * s, 0, 0.18, stoneCol(r), 80 + s, 0.55);
  }
  at(b, T.u, T.w, axisY);
  logBody(k, r);
  k.surface = prevSurf;
  b.box(...toWorld(T.u, T.w), QUELLE.facing, T.len / 2, T.r + 0.02);
}

/** The iron pipe out of the wall (today), slightly down. */
function pipe(b: SetBuilder): void {
  const k = b.kit;
  const P = PIECES.pipe;
  at(b, P.u, PIECES.wall.w, wallBase(b.heightAt, 'today') + P.y);
  const prevSurf = k.surface;
  k.surface = SURF.IRON;
  k.pole(0, 0, -0.1, 0, -0.035, P.reach, 0.032, C.iron, 8);
  k.cyl(0.055, 0.055, 0.05, 0, -0.025, -0.03, C.iron, [Math.PI / 2, 0, 0], 8);
  // a green beard of moss under it, where it always drips
  k.surface = SURF.NONE;
  k.box(0.16, 0.2, 0.02, 0, -0.26, 0.035, MOSS_DARK);
  k.surface = prevSurf;
}

/**
 * The rough front of today's spring house (prop frame at its foot, face at z = fz): uneven
 * courses of rubble round a ring of rough voussoirs, on a dark joint plane.
 */
function rubbleFront(k: Kit, r: () => number, width: number, top: number, ow: number, oh: number, ar: number, d: number): void {
  const fz = d / 2;
  const jw = (width - ow) / 2;
  // the body (its face is the joint plane): the jambs, the fill over the arch
  k.surface = SURF.NONE;
  for (const s of [-1, 1]) k.box(jw + 0.02, top, d, s * (ow / 2 + jw / 2), 0, -0.04, MORTAR);
  k.box(ow + 0.04, top - oh - ar, d, 0, oh + ar, -0.04, MORTAR);
  // rough voussoirs round the arch
  k.surface = SURF.STONE;
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = Math.PI - ((i + 0.5) / n) * Math.PI;
    const len = 0.19 + r() * 0.08 + (i === 4 ? 0.04 : 0);
    const rr = ar + 0.02;
    k.push(Math.cos(a) * rr, oh + Math.sin(a) * rr, fz - 0.06 + r() * 0.03, (r() - 0.5) * 0.06, (r() - 0.5) * 0.06, a - Math.PI / 2);
    k.box(0.15 + r() * 0.04, len, 0.12, 0, 0, 0, stoneCol(r, 0.08));
    k.pop();
  }
  // the courses either side and over the arch
  const ring = ar + 0.25;
  let y = 0;
  let row = 0;
  while (y < top - 0.04) {
    const rh = Math.min(top - y, 0.14 + r() * 0.1);
    const cy = y + rh / 2;
    // what the opening and the arch ring keep free in this course
    const dy = cy - oh;
    const free = dy < 0 ? ow / 2 + 0.01 : dy < ring ? Math.sqrt(ring * ring - dy * dy) : 0;
    const spans: [number, number][] = free > 0 ? [[-width / 2 - 0.02, -free], [free, width / 2 + 0.02]] : [[-width / 2 - 0.02, width / 2 + 0.02]];
    for (const [s0, s1] of spans) {
      let x = s0 + (row % 2) * 0.06 * r();
      while (x < s1 - 0.05) {
        const len = Math.min(s1 - x, 0.16 + r() * 0.24);
        if (len > 0.07) {
          const sh = rh * (0.8 + r() * 0.16);
          k.box(len - 0.025, sh, 0.1 + r() * 0.05, x + len / 2, y + (rh - sh) * 0.5, fz - 0.06 + r() * 0.035, stoneCol(r, y > top - 0.3 ? 0.35 : 0.05), [(r() - 0.5) * 0.06, (r() - 0.5) * 0.08, (r() - 0.5) * 0.1]);
        }
        x += len;
      }
    }
    y += rh;
    row++;
  }
}

/** The arched spring house up the slope. */
function springHouse(b: SetBuilder, look: QuelleLook): void {
  const k = b.kit;
  const H = PIECES.house;
  const gg = Math.min(g(b, H.u - 0.6, H.w + 0.3), g(b, H.u + 0.6, H.w + 0.3));
  const r = rng(1789);
  const dressed = look !== 'today';
  const ruin = look === 'ruin';
  const stone = (): Hex => (dressed ? tint(r() < 0.5 ? ASHLAR : ASHLAR_WARM, r, 0.06) : stoneCol(r, 0.1));
  const prevSurf = k.surface;
  at(b, H.u, H.w, gg - 0.12);
  const ow = 0.86; // opening width
  const oh = 0.8; // where the arch springs
  const ar = ow / 2;
  const d = H.depth * 0.5;
  const top = H.height;
  if (dressed) {
    k.surface = ruin ? SURF.STONE : SURF.PLASTER;
    // the core shows as the joints between the blocks
    k.box(H.width - 0.04, top, d - 0.02, 0, 0, -0.02, JOINT);
    // courses of blocks round the opening, standing a little proud of the core
    const jt = 0.014;
    const ring = ar + 0.22;
    const rows = 6;
    const ch = top / rows;
    const half = H.width / 2;
    const grime = look === 'baroque' ? 1 : 0.92;
    for (let i = 0; i < rows; i++) {
      const y0 = i * ch;
      let lim = 0;
      if (y0 < oh) lim = ow / 2;
      else if (y0 < oh + ring) lim = Math.sqrt(Math.max(0, ring * ring - (y0 - oh) ** 2));
      const spans: [number, number][] = lim > 0 ? [[-half, -lim], [lim, half]] : [[-half, half]];
      for (const [s0, s1] of spans) {
        let x = s0;
        let first = true;
        while (x < s1 - 0.05) {
          const len = first && i % 2 ? 0.22 + r() * 0.1 : 0.36 + r() * 0.22;
          first = false;
          const xe = s1 - (x + len) < 0.16 ? s1 : x + len;
          if (xe - x > 0.07) k.box(xe - x - jt, ch - jt, 0.06, (x + xe) / 2, y0 + jt / 2, d / 2 - 0.02, tint(stone(), () => (i === 0 ? grime * 0.9 : grime), 0));
          x = xe;
        }
      }
    }
    // voussoirs round the arch, a keystone at the crown
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = Math.PI - ((i + 0.5) / n) * Math.PI;
      const rr = ar + 0.11;
      k.push(Math.cos(a) * rr, oh + Math.sin(a) * rr, 0, 0, 0, a - Math.PI / 2);
      k.box(0.17 - jt, i === 4 ? 0.27 : 0.22, d, 0, -0.11, i === 4 ? 0.025 : 0.01, i === 4 ? tint(ASHLAR, r, 0.03) : stone());
      k.pop();
    }
    // a moulded cornice in two steps that throws a shadow
    const cw = ruin ? H.width * 0.55 : H.width + 0.16;
    const cx = ruin ? -H.width * 0.22 : 0;
    k.box(cw - 0.08, 0.06, d + 0.06, cx, top - 0.01, 0.02, tint(ASHLAR_WARM, r, 0.03));
    k.box(cw, 0.1, d + 0.12, cx, top + 0.05, 0.04, tint(ASHLAR, r, 0.03));
  } else {
    rubbleFront(k, r, H.width, top, ow, oh, ar, d);
    // a rough top course, overgrown: moss cushions, ivy hanging over the front
    k.surface = SURF.STONE;
    for (let i = 0; i < 5; i++) k.box(0.34 + r() * 0.12, 0.13, d * 0.9, -0.76 + i * 0.38, top - 0.02, -0.04 + (r() - 0.5) * 0.04, stoneCol(r, 0.4), [0, (r() - 0.5) * 0.12, (r() - 0.5) * 0.06]);
    k.surface = SURF.NONE;
    for (let i = 0; i < 7; i++) cushion(k, 0.2 + r() * 0.12, -0.85 + i * 0.28 + (r() - 0.5) * 0.1, top + 0.02, (r() - 0.5) * 0.3, 950 + i, r, 0.34);
    for (const x of [-0.78, -0.5, 0.55, 0.8]) {
      k.push(x, 0, d / 2 + 0.04);
      ivy(k, 0, top + 0.04, 4 + Math.floor(r() * 7), r);
      k.pop();
    }
  }
  // dark inside (a recess behind the opening)
  k.surface = SURF.NONE;
  k.box(ow - 0.02, oh + ar * 0.95, 0.05, 0, 0, -d * 0.45, DARK);
  k.box(ow + 0.02, 0.04, d * 0.9, 0, 0.01, -0.02, 0x2a241d);
  // grate (today) or a plank door (intact past eras); 1796: gone
  const gz = dressed ? 0.05 : d / 2 - 0.06;
  if (look === 'today') {
    k.surface = SURF.IRON;
    for (let i = 0; i < 6; i++) {
      const x = -ow / 2 + 0.08 + (i / 5) * (ow - 0.16);
      const hgt = oh + Math.sqrt(Math.max(0, ar * ar - x * x)) - 0.04;
      k.pole(x, 0.02, gz, x, hgt, gz, 0.012, C.iron, 5);
    }
    for (const y of [0.3, 0.68]) k.box(ow - 0.06, 0.03, 0.02, 0, y, gz, C.iron);
  } else if (!ruin) {
    k.surface = SURF.PLANKS;
    for (let i = 0; i < 4; i++) {
      const x = -ow / 2 + ow / 8 + i * (ow / 4);
      const hgt = oh + Math.sqrt(Math.max(0, ar * ar - x * x)) - 0.05;
      k.box(ow / 4 - 0.02, hgt, 0.05, x, 0.02, 0.0, tint(C.wood, r, 0.08));
    }
    k.surface = SURF.IRON;
    for (const y of [0.22, 0.78]) k.box(ow * 0.7, 0.04, 0.02, -0.04, y, 0.035, C.iron);
    k.cyl(0.03, 0.03, 0.02, 0.28, 0.5, 0.05, C.iron, [Math.PI / 2, 0, 0], 8);
  }
  if (look === 'winter') {
    k.surface = SURF.NONE;
    for (let i = 0; i < 9; i++) icicle(b, -H.width / 2 + 0.1 + r() * (H.width - 0.2), top - 0.01, d / 2 + 0.06, 0.025 + r() * 0.015, 0.08 + r() * 0.22);
  }
  // the earth mound over its vault: the house sits in the slope, only its front shows
  k.surface = SURF.NONE;
  at(b, H.u, H.w - H.depth * 0.4, gg - 0.35);
  k.rock(2.0, 0, 0, -0.9, tint(EARTH, r, 0.08), 900, 0.5);
  blob(k, 1.4, 0.1, 0.62, -0.8, 901, 0.3, { top: tint(dressed ? ink(0x5a6a34) : MOSS_DARK, r, 0.06), detail: 1 });
  // loose stones heaped against its flanks
  k.surface = SURF.STONE;
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const u = H.u + sd * (H.width / 2 + 0.15 + r() * 0.35);
      const w = H.w + 0.25 - i * 0.32;
      at(b, u, w, g(b, u, w) - 0.08, r() * 360);
      if (dressed) k.rock(0.2 + r() * 0.12, 0, 0, 0, stone(), 910 + i + sd * 7, 0.6);
      else blob(k, 0.2 + r() * 0.12, 0, 0, 0, 910 + i + sd * 7, 0.6, { top: tint(r() < 0.5 ? MOSS : MOSS_DARK, r, 0.08), side: stone(), t: 0.35 });
    }
  }
  if (ruin) {
    // a cornice stone fallen in front
    k.surface = SURF.STONE;
    at(b, H.u + 0.7, H.w + 0.9, g(b, H.u + 0.7, H.w + 0.9) - 0.04, 23);
    k.box(0.5, 0.12, 0.3, 0, 0, 0, tint(ASHLAR, r, 0.05), [0.12, 0.3, 0.08]);
  }
  k.surface = prevSurf;
  b.box(...toWorld(H.u, H.w - 0.2), QUELLE.facing, H.width / 2, H.depth / 2);
}

/**
 * Sandstone steps on the left, climbing into the slope (north-east): each slab sits at the
 * ground of its middle, so its back is buried in the slope and only its front edge stands.
 */
function steps(b: SetBuilder, look: QuelleLook): void {
  const k = b.kit;
  const S = PIECES.steps;
  const r = rng(77);
  const today = look === 'today';
  let y = -Infinity;
  const prevSurf = k.surface;
  for (let i = 0; i < S.n; i++) {
    const w = S.w0 - i * S.run;
    const hs = [g(b, S.u - 0.45, w + 0.3), g(b, S.u + 0.45, w + 0.3), g(b, S.u - 0.45, w - 0.3), g(b, S.u + 0.45, w - 0.3)];
    const mid = hs.reduce((a, v) => a + v, 0) / 4;
    y = Math.max(mid + 0.07, y + 0.1);
    const hgt = y - Math.min(...hs) + 0.16;
    const wid = S.width - (today ? r() * 0.14 : 0);
    at(b, S.u + (r() - 0.5) * 0.1, w, y - hgt, (r() - 0.5) * 7);
    k.surface = SURF.STONE;
    k.box(wid, hgt, S.run + 0.08, 0, 0, 0, today ? tint(r() < 0.5 ? STONE_RED : STONE_GREY, r, 0.08) : tint(ASHLAR_WARM, r, 0.05));
    if (today) {
      // moss on the worn edges and in the corners, cheek stones either side
      for (let j = 0; j < 3; j++) {
        if (r() < 0.3) continue;
        const sx = (r() < 0.5 ? -1 : 1) * (wid / 2 - 0.06 - r() * 0.12);
        cushion(k, 0.1 + r() * 0.08, sx, hgt - 0.03, (r() - 0.3) * S.run * 0.8, 720 + i * 5 + j, r, 0.28);
      }
      for (const s of [-1, 1]) {
        if (r() < 0.3) continue;
        blob(k, 0.17 + r() * 0.08, s * (wid / 2 + 0.15), hgt - 0.24, (r() - 0.5) * 0.3, 700 + i * 2 + s, 0.6, { top: tint(MOSS, r, 0.1), side: stoneCol(r), t: 0.4 });
      }
    }
  }
  k.surface = prevSurf;
}

/** Blocks along the trail edge either side of the approach (today: all but swallowed by moss). */
function edge(b: SetBuilder, look: QuelleLook): void {
  const k = b.kit;
  const E = PIECES.edge;
  const r = rng(4242);
  const prevSurf = k.surface;
  for (let u = E.u0; u <= E.u1; u += 0.8 + r() * 0.5) {
    if (Math.abs(u - 0.1) < 1.7) continue; // the way to the water stays open
    const w = E.w + (r() - 0.5) * 0.4;
    const s = 0.22 + r() * 0.12;
    at(b, u, w, g(b, u, w) - 0.1, r() * 360);
    const seed = 500 + Math.round((u + 4) * 7);
    if (look === 'today') blob(k, s, 0, 0, 0, seed, 0.5, { top: tint(r() < 0.5 ? MOSS : MOSS_DARK, r, 0.08), side: stoneCol(r), t: 0.6, detail: 1 });
    else {
      // a dressed kerb, half sunk (1796: knocked askew, a cushion of moss)
      at(b, u, w, g(b, u, w) - 0.12, (r() - 0.5) * (look === 'ruin' ? 30 : 4));
      k.surface = SURF.STONE;
      k.box(0.62, 0.24, 0.28, 0, 0, 0, tint(ASHLAR_WARM, r, 0.06), look === 'ruin' ? [(r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2] : undefined);
      if (look === 'ruin' && r() < 0.6) cushion(k, 0.12, (r() - 0.5) * 0.3, 0.2, 0, seed, r, 0.35);
    }
  }
  k.surface = prevSurf;
}

/** The niche's round head as a polygon: the rectangle over the springing line minus the half disc. */
function nicheSpandrel(nw: number, rise: number): Shape {
  const r = nw / 2;
  const pts: Vector2[] = [new Vector2(-r, 0), new Vector2(-r, rise), new Vector2(r, rise), new Vector2(r, 0)];
  const n = 16;
  for (let i = 1; i < n; i++) {
    const a = (i / n) * Math.PI;
    pts.push(new Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return new Shape(pts);
}

/**
 * The dressed baroque front with its niche and spout (1789–1796): ashlar blocks of slightly
 * different tint standing proud of their joints, the two lowest courses rusticated (a raised
 * face on each block), pilasters with base and capital, a moulded cornice that throws a shadow,
 * grime and (later) moss at the foot. The blocks take the jointless sandstone surface (the CC0
 * ashlar texture would paint joints inside them); on the low tier the relief and tints carry it.
 */
function baroqueFront(b: SetBuilder, look: QuelleLook): void {
  const k = b.kit;
  const W = PIECES.wall;
  const P = PIECES.pipe;
  const r = rng(1777);
  const ruin = look === 'ruin';
  const aged = look === 'ruin' ? 2 : look === 'baroque' ? 0 : 1;
  const half = 1.65;
  const base = wallBase(b.heightAt, look);
  const top = 2.05;
  const t = W.thick;
  const fz = t / 2;
  const prevSurf = k.surface;
  const dressedSurf = ruin ? SURF.STONE : SURF.PLASTER;
  at(b, 0, W.w - t / 2, base);
  // the core: its face is the joints (a little darker), a footing course down into the ground
  k.surface = dressedSurf;
  k.box(half * 2, top, t - 0.02, 0, 0, -0.01, JOINT);
  k.box(half * 2 + 0.08, 0.4, t + 0.08, 0, -0.38, 0.01, tint(ASHLAR_WARM, r, 0.04));
  // the courses, with a round-arched niche in the middle
  const nw = 0.86;
  const sill = 0.42;
  const nh = 1.2; // springing line of the niche's head
  const headTop = nh + nw / 2 + 0.08;
  const courses = 7;
  const ch = top / courses;
  const jt = 0.014;
  const missing = ruin ? new Set([`5:1`, `4:3`, `6:0`]) : new Set<string>();
  const block = (x0: number, x1: number, y0: number, y1: number, row: number, idx: number) => {
    if (x1 - x0 < 0.08 || missing.has(`${row}:${idx}`)) return;
    const grime = row === 0 ? 0.86 - aged * 0.04 : row === 1 ? 0.93 : 1;
    const pick = r();
    const col = tint(tint(pick < 0.4 ? ASHLAR : pick < 0.75 ? ASHLAR_WARM : ASHLAR_COOL, r, 0.05), () => grime, 0);
    const w = x1 - x0 - jt;
    const h = y1 - y0 - jt;
    const cx = (x0 + x1) / 2;
    if (row < 2) {
      // rusticated: the block, and its raised, slightly paler face
      k.box(w, h, 0.07, cx, y0 + jt / 2, fz - 0.025, col);
      k.box(w - 0.07, h - 0.07, 0.05, cx, y0 + jt / 2 + 0.035, fz + 0.005, tint(col, () => 0.75, 0.06));
    } else k.box(w, h, 0.07, cx, y0 + jt / 2, fz - 0.02, col);
  };
  for (let i = 0; i < courses; i++) {
    const y0 = i * ch;
    const y1 = y0 + ch;
    const spans: [number, number][] = [];
    if (y1 <= sill + 0.001 || y0 >= headTop - 0.001) spans.push([-half, half]);
    else {
      spans.push([-half, -nw / 2], [nw / 2, half]);
      if (y0 < sill) block(-nw / 2, nw / 2, y0, sill, i, 90);
      if (y1 > headTop) block(-nw / 2, nw / 2, headTop, y1, i, 91);
    }
    let idx = 0;
    for (const [s0, s1] of spans) {
      let x = s0;
      let first = true;
      while (x < s1 - 0.05) {
        const len = first && i % 2 ? 0.3 + r() * 0.15 : 0.5 + r() * 0.3;
        first = false;
        const xe = s1 - (x + len) < 0.22 ? s1 : x + len;
        block(x, xe, y0, y1, i, idx++);
        x = xe;
      }
    }
  }
  // the niche: its back, the round head (spandrel + back half disc), the keystone
  const back = -t / 2 + 0.05;
  k.box(nw, nh - sill, 0.06, 0, sill, back - 0.03, tint(ASHLAR_WARM, r, 0.05));
  const sp = new ExtrudeGeometry(nicheSpandrel(nw, headTop - nh), { depth: t, bevelEnabled: false, curveSegments: 1 });
  sp.translate(0, nh, -t / 2 + 0.02);
  k.add(sp, tint(ASHLAR, r, 0.04));
  // the half with z ≤ 0 turns into the upper half under rotateX(π/2)
  const halfDisc = new CylinderGeometry(nw / 2, nw / 2, 0.06, 16, 1, false, Math.PI / 2, Math.PI);
  halfDisc.rotateX(Math.PI / 2);
  k.add(halfDisc, tint(ASHLAR_WARM, r, 0.05), 0, new Matrix4().makeTranslation(0, nh, back - 0.03));
  // a moulded arch band round the head, the keystone over it
  for (let i = 0; i < 9; i++) {
    const a = Math.PI - ((i + 0.5) / 9) * Math.PI;
    k.push(Math.cos(a) * (nw / 2 + 0.05), nh + Math.sin(a) * (nw / 2 + 0.05), fz + 0.03, 0, 0, a - Math.PI / 2);
    k.box(0.17, 0.1, 0.05, 0, -0.05, 0, tint(ASHLAR, r, 0.03));
    k.pop();
  }
  k.box(0.2, 0.28, 0.12, 0, headTop - 0.16, fz + 0.02, tint(ASHLAR, r, 0.02));
  // the sill: a moulded ledge
  k.box(nw + 0.24, 0.05, 0.16, 0, sill - 0.05, fz + 0.03, tint(ASHLAR, r, 0.02));
  k.box(nw + 0.16, 0.04, 0.1, 0, sill - 0.09, fz + 0.01, tint(ASHLAR_WARM, r, 0.03));
  // pilasters: a stepped base, the shaft in drums, a capital
  for (const s of [-1, 1]) {
    const px = s * (half - 0.13);
    k.box(0.36, 0.14, 0.2, px, 0, fz + 0.06, tint(ASHLAR_WARM, r, 0.03));
    k.box(0.31, 0.06, 0.16, px, 0.14, fz + 0.05, tint(ASHLAR, r, 0.03));
    for (let d = 0; d < 4; d++) {
      const y0 = 0.2 + d * ((top - 0.42) / 4);
      k.box(0.26, (top - 0.42) / 4 - jt, 0.12, px, y0, fz + 0.04, tint(d === 0 ? ASHLAR_WARM : ASHLAR, r, 0.04));
    }
    k.box(0.3, 0.05, 0.15, px, top - 0.22, fz + 0.055, tint(ASHLAR, r, 0.03));
    k.box(0.34, 0.1, 0.18, px, top - 0.17, fz + 0.06, tint(ASHLAR, r, 0.03));
  }
  // the moulded cornice: fillet, a stepped cyma, the corona, a top fillet (1796: half of it is down)
  const cw = ruin ? half + 0.1 : half * 2 + 0.24;
  const cx = ruin ? -half / 2 - 0.1 : 0;
  const cornice: [number, number, number, number][] = [
    // width extra, height, projection, y (from the top of the wall)
    [0.02, 0.04, 0.03, 0],
    [0.08, 0.04, 0.07, 0.04],
    [0.14, 0.04, 0.12, 0.08],
    [0.24, 0.12, 0.2, 0.12],
    [0.2, 0.04, 0.16, 0.24],
  ];
  for (const [ew, hh, pr, yy] of cornice) k.box(cw + ew, hh, t + pr * 2, cx, top + yy, pr * 0.6, tint(ASHLAR, r, 0.02));
  // the bronze spout on a round plate (1796: a dark hole where it was torn out)
  const sy = P.y + 0.04;
  if (!ruin) {
    k.surface = SURF.IRON;
    k.cyl(0.1, 0.1, 0.03, P.u, sy + 0.04, fz + 0.04, BRONZE, [Math.PI / 2, 0, 0], 14);
    k.pole(P.u, sy + 0.04, fz + 0.04, P.u, sy, fz + P.reach * 0.55, 0.034, BRONZE, 10);
  } else {
    k.surface = SURF.NONE;
    k.cyl(0.06, 0.06, 0.02, P.u, sy + 0.04, fz + 0.054, DARK, [Math.PI / 2, 0, 0], 10);
  }
  // weathering at the foot: a dark damp band, moss in the corners as the years go by
  k.surface = SURF.NONE;
  if (aged > 0) {
    for (const x of [-half + 0.32, -1.0, 0.95, half - 0.32, -0.3]) {
      if (r() < 0.25 * (2 - aged)) continue;
      cushion(k, 0.1 + r() * 0.08 + aged * 0.03, x + (r() - 0.5) * 0.2, -0.04, fz + 0.06, 1770 + Math.round(x * 10), r, 0.4);
    }
  }
  if (look === 'winter') {
    for (let i = 0; i < 5; i++) icicle(b, P.u + (r() - 0.5) * 0.08, sy - 0.02, fz + P.reach * 0.5 + (r() - 0.5) * 0.06, 0.022 + r() * 0.012, 0.12 + r() * 0.22);
    for (let i = 0; i < 16; i++) icicle(b, -half + 0.15 + r() * (half * 2 - 0.3), top - 0.01, fz + 0.18, 0.025 + r() * 0.02, 0.1 + r() * 0.3);
  }
  // fallen cornice stones at the foot (1796)
  if (ruin) {
    k.surface = SURF.STONE;
    at(b, 1.2, W.w + 0.75, g(b, 1.2, W.w + 0.75) - 0.05, 31);
    k.box(0.9, 0.14, 0.4, 0, 0, 0, tint(ASHLAR, r, 0.04), [0.08, 0.4, 0.15]);
    at(b, 1.9, W.w + 1.4, g(b, 1.9, W.w + 1.4) - 0.05, 77);
    k.box(0.55, 0.14, 0.36, 0, 0, 0, tint(ASHLAR, r, 0.04), [-0.1, 0.9, 0.05]);
    k.surface = SURF.NONE;
    cushion(k, 0.14, 0.2, 0.08, 0.1, 1799, r, 0.35);
  }
  k.surface = prevSurf;
  b.box(...toWorld(0, W.w - t / 2), QUELLE.facing, half + 0.1, t / 2 + 0.05);
}

/**
 * A flag laid into the ground: its four corners (local u, w) each `top` m above the terrain mesh
 * (so it lies on the slope, never on stilts), its sides reaching `depth` m below.
 */
function slab(b: SetBuilder, corners: readonly (readonly [number, number])[], top: number, depth: number, color: Hex, lift: readonly number[] = []): void {
  const k = b.kit;
  k.place(0, 0, 0, 0);
  const T: V3[] = corners.map(([u, w], i) => {
    const [x, z] = toWorld(u, w);
    return [x, meshGround(b.heightAt, x, z) + top + (lift[i] ?? 0), z];
  });
  poly(k, T, color);
  const sides: [V3, V3, V3, V3][] = [];
  for (let i = 0; i < T.length; i++) {
    const a = T[i]!;
    const c = T[(i + 1) % T.length]!;
    sides.push([a, c, [c[0], c[1] - top - depth, c[2]], [a[0], a[1] - top - depth, a[2]]]);
  }
  quads(k, sides, tint(color, () => 0.2, 0.15));
}

/** The stone basin before the front (1789–1796; cracked in 1796), and the flagged apron. */
function basin(b: SetBuilder, look: QuelleLook): void {
  const k = b.kit;
  const B = PIECES.basin;
  const r = rng(1788);
  const ruin = look === 'ruin';
  const prevSurf = k.surface;
  at(b, B.u, B.w, basinBase(b.heightAt));
  k.surface = ruin ? SURF.STONE : SURF.PLASTER;
  const t = B.wall;
  // a plinth under it, down into the ground
  k.box(B.len + 0.08, 0.4, B.depth + 0.08, 0, -0.4, 0, tint(ASHLAR_WARM, r, 0.04));
  k.box(B.len, 0.12, B.depth, 0, 0, 0, tint(ASHLAR_WARM, r, 0.04));
  for (const s of [-1, 1]) {
    k.box(B.len, B.h, t, 0, 0, s * (B.depth / 2 - t / 2), tint(ASHLAR, r, 0.03));
    k.box(t, B.h, B.depth - t * 2, s * (B.len / 2 - t / 2), 0, 0, tint(ASHLAR, r, 0.03));
  }
  // a sunk panel on its front (a frame of fillets) over a base band
  const fzB = B.depth / 2;
  k.box(B.len + 0.03, 0.09, 0.03, 0, 0.1, fzB - 0.005, tint(ASHLAR_WARM, r, 0.03));
  for (const yy of [0.26, B.h - 0.12]) k.box(B.len - 0.3, 0.03, 0.025, 0, yy, fzB, tint(ASHLAR, r, 0.02));
  for (const s of [-1, 1]) k.box(0.03, B.h - 0.38, 0.025, s * (B.len / 2 - 0.15), 0.26, fzB, tint(ASHLAR, r, 0.02));
  // the rim moulding (open in the middle, the water shows): two long pieces, two short
  for (const s of [-1, 1]) {
    k.box(B.len + 0.06, 0.05, t + 0.06, 0, B.h, s * (B.depth / 2 - t / 2), tint(ASHLAR, r, 0.02));
    k.box(t + 0.06, 0.05, B.depth - t * 2, s * (B.len / 2 - t / 2), B.h, 0, tint(ASHLAR, r, 0.02));
  }
  if (ruin) {
    k.surface = SURF.NONE;
    k.box(0.02, B.h * 0.8, 0.02, B.len * 0.2, 0.1, B.depth / 2 + 0.002, DARK, [0, 0, 0.3]);
    k.surface = SURF.STONE;
    at(b, B.u + B.len / 2 + 0.35, B.w + 0.4, g(b, B.u + B.len / 2 + 0.35, B.w + 0.4) - 0.04, 12);
    k.box(0.22, 0.2, 0.18, 0, 0, 0, tint(ASHLAR, r, 0.05), [0.2, 0.5, 0.3]);
  }
  // the flagged apron in front: courses of flags of uneven length, laid into the slope
  k.surface = SURF.STONE;
  if (!ruin) k.surface = SURF.PLASTER;
  const u0 = -1.55;
  const u1 = 1.85;
  const rowD = 0.56;
  for (let row = 0; row < 3; row++) {
    const w0 = B.w + B.depth / 2 + 0.06 + row * rowD;
    let u = u0 - (row % 2) * 0.25;
    while (u < u1 - 0.1) {
      const len = Math.min(u1 - u, 0.55 + r() * 0.45);
      const ua = Math.max(u0, u) + 0.012;
      const ub = u + len - 0.012;
      u += len;
      if (ub - ua < 0.15) continue;
      if (ruin && r() < 0.3) continue;
      const tilt = ruin && r() < 0.4 ? [0, 0.04 + r() * 0.05, 0.03, 0] : [];
      slab(b, [[ua, w0 + 0.012], [ub, w0 + 0.012], [ub, w0 + rowD - 0.012], [ua, w0 + rowD - 0.012]], 0.028 + r() * 0.01, 0.14, tint(ASHLAR_WARM, r, 0.07), tilt);
    }
  }
  k.surface = prevSurf;
  b.box(...toWorld(B.u, B.w), QUELLE.facing, B.len / 2 + 0.03, B.depth / 2 + 0.03);
}

/** The information board by the trail (today; OSM node 5762403253 stands about 5 m from the spring). */
function infoBoard(b: SetBuilder): void {
  const k = b.kit;
  // at the trail, front right of the spring, turned to the people coming up from the Weiher
  const [x, z] = toWorld(3.4, 3.3);
  const y = b.heightAt(x, z) - 0.05;
  const deg = QUELLE.facing - 25;
  k.place(x, y, z, face(deg));
  const prevSurf = k.surface;
  k.surface = SURF.PLANKS;
  for (const s of [-1, 1]) k.box(0.09, 1.25, 0.09, s * 0.42, 0, 0, BOARD);
  k.box(1.0, 0.06, 0.18, 0, 1.25, -0.02, BOARD, [0.2, 0, 0]);
  k.box(0.92, 0.56, 0.04, 0, 0.67, -0.03, BOARD);
  k.surface = prevSurf;
  const f = face(deg);
  b.sign(x + Math.sin(f) * 0.01, y + 0.95, z + Math.cos(f) * 0.01, deg, 0.86, 0.48, { text: 'Karlsbergquelle\nWaldPark Schloss Karlsberg' });
  b.circle(x, z, 0.5);
}

/** The era each look stands for (the brook's line starts at the trough or the basin). */
const LOOK_ERA: Record<QuelleLook, Era> = { today: 'today', baroque: '1789', winter: '1793-02', fire: '1793-07', ruin: '1796' };

/** The OSM footpaths by the brook as samples about every metre (world x/z). */
function pathSamples(): [number, number][] {
  const out: [number, number][] = [];
  for (const p of BROOK_PATHS)
    for (let i = 0; i + 1 < p.length; i++) {
      const [ax, az] = p[i]!;
      const [bx, bz] = p[i + 1]!;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
      for (let s = 0; s <= n; s++) out.push([ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n]);
    }
  return out;
}

/**
 * The brook's banks, the whole drawn length (to where its bed fades out past the Bleiche): stones
 * lining the wet bed, moss cushions, ferns on the side away from the trail (the other bank where a
 * footpath runs on that side), stepping stones where the branch to the steps crosses it. Nothing
 * on the trail, today's OSM footpaths or, in 1789, the Bleiche's green (its clearings).
 */
function brookBanks(b: SetBuilder, look: QuelleLook): void {
  const k = b.kit;
  const r = rng(808);
  const line = brookLine(b.heightAt, LOOK_ERA[look]);
  const trail = TRAIL.flatMap((s) => trailLine(s, 1));
  // the terrain draws the OSM footpaths today only
  const paths = look === 'today' ? pathSamples() : [];
  const green1789 = look === 'baroque' ? bleicheClearings() : [];
  const onTrail = (x: number, z: number) =>
    trail.some((p) => Math.hypot(x - p.x, z - p.z) < p.half + 0.15) ||
    paths.some(([px, pz]) => Math.hypot(x - px, z - pz) < PATH_HALF) ||
    green1789.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr);
  const prevSurf = k.surface;
  const green = look !== 'winter';
  let along = 0;
  let nextStone = 0.9;
  let nextFern = 2.5;
  for (let i = 1; i + 1 < line.length && along < BROOK_LEN - 4; i++) {
    const [x, z] = line[i]!;
    along += Math.hypot(x - line[i - 1]![0], z - line[i - 1]![1]);
    const [ax, az] = line[i - 1]!;
    const [bx, bz] = line[i + 1]!;
    const l = Math.hypot(bx - ax, bz - az) || 1;
    const nx = -(bz - az) / l;
    const nz = (bx - ax) / l;
    // which side is away from the trail (towards the slope behind the spring: smaller local w)
    const away = toLocal(x + nx, z + nz)[1] < toLocal(x, z)[1] ? 1 : -1;
    while (along >= nextStone) {
      nextStone += 0.55 + r() * 0.7;
      const side = r() < 0.5 ? -1 : 1;
      const off = 0.36 + r() * 0.32 + Math.min(1, along / 18) * 0.1;
      const px = x + nx * side * off;
      const pz = z + nz * side * off;
      if (onTrail(px, pz)) continue;
      const s = 0.06 + r() * 0.11;
      k.place(px, meshGround(b.heightAt, px, pz) - s * 0.25, pz, r() * 6.28);
      if (green && r() < 0.55) blob(k, s, 0, 0, 0, 820 + i * 3 + side, 0.55, { top: tint(r() < 0.5 ? MOSS : MOSS_DARK, r, 0.08), side: stoneCol(r), t: 0.5 });
      else {
        k.surface = SURF.STONE;
        k.rock(s, 0, 0, 0, stoneCol(r), 820 + i * 3 + side, 0.55);
      }
      // a moss cushion further up the bank
      if (green && r() < 0.35) {
        const mx = x + nx * side * (off + 0.25);
        const mz = z + nz * side * (off + 0.25);
        if (!onTrail(mx, mz)) {
          k.place(mx, meshGround(b.heightAt, mx, mz) - 0.03, mz, r() * 6.28);
          cushion(k, 0.1 + r() * 0.08, 0, 0, 0, 880 + i, r, 0.32);
        }
      }
    }
    if (along >= nextFern && along > 2) {
      // out of the ravine (past the stretch the look pass tuned) the banks open out: ferns further
      // apart there (each CC0 clump is ~5.6k triangles)
      nextFern += (along > BROOK_REF ? 6.5 : 3.2) + r() * 2.5;
      const off = 0.95 + r() * 0.5;
      // the side away from the trail; the other bank where a path or the green takes that one
      const side = [away, -away].find((s) => !onTrail(x + nx * s * off, z + nz * s * off));
      if (side !== undefined) {
        const [fu, fw] = toLocal(x + nx * side * off, z + nz * side * off);
        fern(b, fu, fw, 0.65 + r() * 0.35, 40 + i, look === 'winter');
      }
    }
  }
  // stepping stones where the branch to the steps crosses the runnel
  k.surface = SURF.STONE;
  for (const [u, w, s] of [[-3.42, 1.86, 0.17], [-3.5, 2.22, 0.16], [-3.38, 2.58, 0.15]] as const) {
    const [x, z] = toWorld(u, w);
    k.place(x, meshGround(b.heightAt, x, z) - 0.06, z, r() * 6.28);
    k.rock(s, 0, 0, 0, look === 'today' ? stoneCol(r) : tint(ASHLAR_WARM, r, 0.06), 890 + Math.round(w * 10), 0.42);
  }
  k.surface = prevSurf;
}

/** The spring's stonework for one look (see the file comment). */
export function buildQuelle(b: SetBuilder, look: QuelleLook): void {
  const k = b.kit;
  if (look === 'today') {
    dryWall(b);
    logTrough(b);
    pipe(b);
    const W = PIECES.wall;
    const [px, pz] = toWorld(-0.85, W.w + 0.065);
    b.sign(px, wallBase(b.heightAt, 'today') + 0.62, pz, QUELLE.facing, 0.46, 0.24, { text: 'Karlsberg-\nquelle', style: 'plate' });
    infoBoard(b);
  } else {
    baroqueFront(b, look);
    basin(b, look);
    // the old dry wall continues either side of the new front
    const W = PIECES.wall;
    const sand = (r: () => number): Hex => {
      const p = r();
      return tint(p < 0.4 ? ink(0xab9a7e) : p < 0.75 ? ink(0xa08b70) : ink(0xaca28d), r, 0.06);
    };
    for (const s of [-1, 1]) {
      const a = s < 0 ? -2.95 : 1.8;
      rubbleWall(
        b,
        a,
        a + 1.15,
        0.86,
        0.5,
        17 + s,
        (u) => W.w - bow(u) - 0.02,
        (u) => g(b, u, W.w - 0.2) - 0.08,
        look === 'ruin',
        { col: sand, joint: ink(0x6a5c4c), body: ink(0x6a5c4c), dressed: ink(0xa8977c) },
      );
    }
  }
  springHouse(b, look);
  steps(b, look);
  edge(b, look);
  brookBanks(b, look);
  // ferns in the hollow: either side of the wall, on the slope behind, by the steps and the house
  const ferns: [number, number, number][] = [
    [-2.4, -0.5, 1.1],
    [2.5, -0.4, 1.2],
    [-1.4, -1.4, 0.9],
    [1.6, -1.6, 1.0],
    [2.9, -2.6, 1.1],
    [-0.8, -3.0, 0.8],
    [2.1, -4.0, 0.9],
    [-2.4, -3.6, 1.0],
    [3.4, 1.2, 0.8],
    [-4.2, 2.0, 0.9],
    [-0.6, -4.6, 0.75],
    [2.0, -5.2, 0.85],
    [-4.3, -0.4, 0.85],
    [-2.6, 0.75, 0.6],
    [3.0, 0.4, 0.75],
    [3.9, -1.2, 1.0],
    [-1.6, -5.3, 0.9],
    [4.4, 2.2, 0.7],
  ];
  const keep = look === 'ruin' || look === 'today' ? ferns : ferns.slice(0, 6);
  keep.forEach(([u, w, s], i) => fern(b, u, w, s * (look === 'ruin' ? 1.15 : 1), 11 + i, look === 'winter'));
  // ivy on the slope behind the wall (today)
  if (look === 'today') {
    const r = rng(2025);
    const prev = k.surface;
    k.surface = SURF.NONE;
    for (let i = 0; i < 26; i++) {
      const u = -3 + r() * 6;
      const w = -0.6 - r() * 3.2;
      if (Math.abs(u - PIECES.house.u) < 1.2 && w < -3.2) continue;
      at(b, u, w, g(b, u, w) + 0.01, r() * 360);
      for (let j = 0; j < 5; j++) {
        const s = 0.06 + r() * 0.04;
        const lx = (r() - 0.5) * 0.4;
        const lz = (r() - 0.5) * 0.4;
        const ly = 0.01 + r() * 0.05;
        poly(
          k,
          [
            [lx, ly, lz],
            [lx + s * 0.5, ly + s * 0.3, lz + s * 0.6],
            [lx, ly + s * 0.2, lz + s],
            [lx - s * 0.5, ly + s * 0.3, lz + s * 0.6],
          ],
          tint(r() < 0.6 ? IVY : IVY_LIGHT, r, 0.12),
        );
      }
    }
    k.surface = prev;
  }
}

/** The set: in every era, built within 150 m. */
export const quelleSet: SetDef = {
  id: 'karlsbergquelle',
  eras: ['today', '1789', '1793-02', '1793-07', '1796'],
  x: QUELLE.x,
  z: QUELLE.z,
  range: 150,
  build(b, o) {
    buildQuelle(b, lookFor(o.era));
  },
};
