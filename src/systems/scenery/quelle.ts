/**
 * The Karlsbergquelle as a scenery set (NEXT-SESSION §3.6; position, layout and the shared height
 * math in src/systems/quelle/layout.ts). Stone, wood and iron only — the water, the stream, the
 * brook and the motes are the quelle system's (they animate and take part in the touch).
 *
 *  - today: the reference photo — a hollowed log trough on two stumps before a low dry wall of red
 *    sandstone with a small plaque, an iron pipe, mossy sandstone steps on the left, and up the
 *    slope behind a little arched spring house, half sunk, with an iron grate;
 *  - 1789 (and the two 1793 nights): the same place new and dressed — an ashlar front with a
 *    round-arched niche, pilasters and a cornice, a bronze spout into a stone basin, a flagged
 *    apron; the spring house up the slope with a plank door. February 1793 adds icicles (the prop
 *    material puts snow on top by itself); the July night is lit by the fire's glow;
 *  - 1796: plundered — the spout torn out, cornice stones on the ground, the basin cracked, the
 *    spring house door gone.
 *
 * Everything is original procedural masonry and carpentry; the ferns are the CC0 fern clump on the
 * medium / high tiers.
 */
import { CylinderGeometry, ExtrudeGeometry, Matrix4, Shape, Vector2 } from 'three';
import { SURF } from '../../world/surfaces';
import { basinBase, groundLocal, lookFor, PIECES, QUELLE, toWorld, troughFrame, TROUGH_CUT, wallBase, type QuelleLook } from '../quelle/layout';
import { type SetBuilder, face } from './builder';
import { type Hex, rng, tint } from './kit';
import { C } from './props';
import type { SetDef } from './sets';

// the kit's untextured pieces come out darker than the hex (see props.ts C): moss and earth are light here
const MOSS: Hex = 0x7f9150;
const MOSS_DARK: Hex = 0x6a7a44;
const EARTH: Hex = 0x9c7a5a;
const RED: Hex = 0xa86f58;
const RED_DARK: Hex = 0x8e5a47;
const ASHLAR: Hex = 0xd8c3a2;
const ASHLAR_WARM: Hex = 0xc9ab86;
const DARK: Hex = 0x16130f;
const BRONZE: Hex = 0xb8923e;
const ICE: Hex = 0xdde8f0;
const BARK: Hex = 0x7a5a3e;
const HEART: Hex = 0xc49a6c;
const FERN: Hex = 0x7f9f4c;

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

/** Extrude a section along the kit's local x (its +z after extrusion turned onto x), centred. */
function extrudeX(shape: Shape, len: number): ExtrudeGeometry {
  const g = new ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -len / 2);
  g.applyMatrix4(new Matrix4().makeRotationY(Math.PI / 2));
  return g;
}

/** Put the kit at local (u, w) at height y, facing the spring's front (+ extra degrees). */
function at(b: SetBuilder, u: number, w: number, y: number, extraDeg = 0): void {
  const [x, z] = toWorld(u, w);
  b.kit.place(x, y, z, face(QUELLE.facing + extraDeg));
}

const g = (b: SetBuilder, u: number, w: number) => groundLocal(b.heightAt, u, w);

/** Icicle hanging from y (prop space). */
function icicle(b: SetBuilder, x: number, y: number, z: number, r: number, len: number): void {
  b.kit.cone(r, len, x, y, z, ICE, 5, [Math.PI, 0, 0]);
}

/** A fern clump (CC0 model on medium / high, three leaf cones on low). */
function fern(b: SetBuilder, u: number, w: number, s: number, seed: number, snow: boolean): void {
  at(b, u, w, g(b, u, w) - 0.05, seed * 37);
  const k = b.kit;
  b.model(
    'nature.fern.02',
    () => {
      const col = snow ? 0x6d6a55 : FERN;
      for (let i = 0; i < 3; i++) k.cone(0.16 * s, 0.7 * s, Math.cos(i * 2.1) * 0.18 * s, 0, Math.sin(i * 2.1) * 0.18 * s, tint(col, rng(seed + i), 0.15), 5, [Math.cos(i * 2.1) * 0.5, 0, Math.sin(i * 2.1) * 0.5]);
    },
    { yaw: seed * 1.3, scale: s * 0.55 },
  );
}

/** How far the wall bows back into the slope at u (it curves round the hollow). */
const bow = (u: number) => 0.32 * (u / PIECES.wall.u1) ** 2;

/** Rough red sandstone blocks in rows along u (the dry wall), following the ground; moss on top. */
function dryWall(b: SetBuilder): void {
  const k = b.kit;
  const W = PIECES.wall;
  const r = rng(1061);
  const rows = 4;
  const rh = W.h / rows;
  const prevSurf = k.surface;
  for (let row = 0; row < rows; row++) {
    let u = W.u0 + (row % 2) * 0.22;
    while (u < W.u1) {
      const len = Math.min(W.u1 - u, 0.34 + r() * 0.42);
      if (len < 0.18) break;
      const cu = u + len / 2;
      const h = rh * (0.82 + r() * 0.3);
      at(b, cu, W.w - bow(cu) - W.thick / 2, g(b, cu, W.w - 0.2) - 0.08 + row * rh);
      k.surface = SURF.RUBBLE;
      k.box(len - 0.03, h, W.thick * (0.9 + r() * 0.15), (r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.06, tint(r() < 0.35 ? RED_DARK : RED, r, 0.1), [(r() - 0.5) * 0.05, (r() - 0.5) * 0.08, (r() - 0.5) * 0.06]);
      u += len;
    }
  }
  // moss and earth along the top
  k.surface = SURF.NONE;
  for (let u = W.u0 + 0.2; u < W.u1; u += 0.32 + r() * 0.3) {
    at(b, u, W.w - bow(u) - W.thick * 0.55, g(b, u, W.w - 0.2) - 0.08 + W.h - 0.04);
    k.rock(0.19 + r() * 0.09, 0, 0, 0, tint(r() < 0.5 ? MOSS : MOSS_DARK, r, 0.12), 300 + Math.round((u + 3) * 10), 0.3);
  }
  // a few stones fallen forward (not where you stand at the trough)
  k.surface = SURF.RUBBLE;
  for (let i = 0; i < 5; i++) {
    const u = W.u0 + 0.3 + r() * (W.u1 - W.u0 - 0.6);
    if (Math.abs(u - PIECES.trough.u) < 1.5) continue;
    const w = W.w + 0.25 + r() * 0.3;
    at(b, u, w, g(b, u, w) - 0.06);
    k.rock(0.15 + r() * 0.08, 0, 0, 0, tint(RED, r), 400 + i, 0.6);
  }
  k.surface = prevSurf;
  // solids: three boxes along the bow
  for (const [u0, u1] of [[W.u0, -0.9], [-0.9, 0.9], [0.9, W.u1]] as const) {
    const cu = (u0 + u1) / 2;
    b.box(...toWorld(cu, W.w - bow(cu) - W.thick / 2), QUELLE.facing, (u1 - u0) / 2, W.thick / 2 + 0.05);
  }
}

/** The hollowed log trough on two stumps (today). */
function logTrough(b: SetBuilder): void {
  const k = b.kit;
  const T = PIECES.trough;
  const { gl, gr, axisY } = troughFrame(b.heightAt);
  for (const [s, gg] of [[-1, gl], [1, gr]] as const) {
    at(b, T.u + s * T.len * 0.33, T.w, gg - 0.06);
    k.surface = SURF.PLANKS;
    k.cyl(0.19, 0.23, axisY - gg - T.r * 0.55 + 0.06, 0, 0, 0, tint(BARK, rng(7 + s)), undefined, 9);
    k.surface = SURF.NONE;
    for (let i = 0; i < 3; i++) k.rock(0.09, Math.cos(i * 2.2 + s) * 0.21, 0, Math.sin(i * 2.2 + s) * 0.21, BARK, 70 + i + s * 5, 0.5);
  }
  at(b, T.u, T.w, axisY);
  const prevSurf = k.surface;
  // the bark shell, the light heartwood inside, closed ends
  k.surface = SURF.PLANKS;
  k.add(extrudeX(logSection(T.r, T.inner + 0.014, TROUGH_CUT), T.len), BARK);
  k.surface = SURF.FINEWOOD;
  k.add(extrudeX(logSection(T.inner + 0.014, T.inner, TROUGH_CUT), T.len - 0.2), HEART);
  for (const s of [-1, 1]) {
    const end = extrudeX(logSection(T.r - 0.004, 0.01, TROUGH_CUT, true), 0.1);
    end.translate(s * (T.len / 2 - 0.05), 0, 0);
    k.add(end, BARK);
  }
  // moss on the bark
  k.surface = SURF.NONE;
  k.box(0.5, 0.03, 0.2, -T.len * 0.18, -T.r * 0.62, -T.r * 0.78, MOSS, [-0.9, 0, 0]);
  k.box(0.34, 0.025, 0.16, T.len * 0.3, -T.r * 0.5, T.r * 0.8, MOSS_DARK, [0.8, 0, 0]);
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
  k.surface = prevSurf;
}

/** The arched spring house up the slope. */
function springHouse(b: SetBuilder, look: QuelleLook): void {
  const k = b.kit;
  const H = PIECES.house;
  const gg = Math.min(g(b, H.u - 0.6, H.w + 0.3), g(b, H.u + 0.6, H.w + 0.3));
  const r = rng(1789);
  const dressed = look !== 'today';
  const ruin = look === 'ruin';
  const stone = (): Hex => (dressed ? tint(r() < 0.5 ? ASHLAR : ASHLAR_WARM, r, 0.06) : tint(r() < 0.4 ? RED_DARK : RED, r, 0.12));
  const prevSurf = k.surface;
  k.surface = dressed ? SURF.ASHLAR : SURF.RUBBLE;
  at(b, H.u, H.w, gg - 0.12);
  const ow = 0.86; // opening width
  const oh = 0.8; // where the arch springs
  const ar = ow / 2;
  const jw = (H.width - ow) / 2;
  const d = H.depth * 0.5;
  // jambs
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) k.box(jw - 0.02, oh / 4 - 0.015, d, s * (ow / 2 + jw / 2), i * (oh / 4), 0, stone(), dressed ? undefined : [0, (r() - 0.5) * 0.08, 0]);
  }
  // voussoirs round the arch
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = Math.PI - ((i + 0.5) / n) * Math.PI;
    const rr = ar + 0.11;
    k.push(Math.cos(a) * rr, oh + Math.sin(a) * rr, 0, 0, 0, a - Math.PI / 2);
    k.box(0.17, 0.22, d, 0, -0.11, 0, i === 4 && dressed ? tint(ASHLAR, r, 0.03) : stone());
    k.pop();
  }
  // the fill beside and over the arch, then a cornice (dressed) or a rough top course
  const top = H.height;
  for (const s of [-1, 1]) k.box(jw + 0.06, top - oh - 0.05, d, s * (ow / 2 + jw / 2 - 0.02), oh + 0.05, 0, stone());
  const crown = oh + ar + 0.2;
  if (top - crown > 0.03) k.box(ow + 0.04, top - crown, d, 0, crown, 0, stone());
  if (dressed && !ruin) k.box(H.width + 0.16, 0.12, d + 0.12, 0, top, 0.04, tint(ASHLAR, r, 0.03));
  else if (dressed) k.box(H.width * 0.55, 0.12, d + 0.12, -H.width * 0.22, top, 0.04, tint(ASHLAR, r, 0.03));
  else for (let i = 0; i < 4; i++) k.box(0.42 + r() * 0.1, 0.16, d, -0.7 + i * 0.47, top, (r() - 0.5) * 0.04, stone(), [0, (r() - 0.5) * 0.1, (r() - 0.5) * 0.06]);
  // dark inside (a recess behind the opening)
  k.surface = SURF.NONE;
  k.box(ow - 0.02, oh + ar * 0.95, 0.05, 0, 0, -d * 0.45, DARK);
  k.box(ow + 0.02, 0.04, d * 0.9, 0, 0.01, -0.02, 0x2a241d);
  // grate (today) or a plank door (intact past eras); 1796: gone
  if (look === 'today') {
    k.surface = SURF.IRON;
    for (let i = 0; i < 6; i++) {
      const x = -ow / 2 + 0.08 + (i / 5) * (ow - 0.16);
      const hgt = oh + Math.sqrt(Math.max(0, ar * ar - x * x)) - 0.04;
      k.pole(x, 0.02, 0.05, x, hgt, 0.05, 0.012, C.iron, 5);
    }
    for (const y of [0.3, 0.68]) k.box(ow - 0.06, 0.03, 0.02, 0, y, 0.05, C.iron);
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
  k.rock(1.4, 0.1, 0.75, -0.8, tint(MOSS_DARK, r, 0.1), 901, 0.36);
  // loose stones heaped against its flanks
  k.surface = dressed ? SURF.ASHLAR : SURF.RUBBLE;
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const u = H.u + sd * (H.width / 2 + 0.2 + r() * 0.35);
      const w = H.w + 0.2 - i * 0.35;
      at(b, u, w, g(b, u, w) - 0.08, r() * 360);
      k.rock(0.2 + r() * 0.12, 0, 0, 0, stone(), 910 + i + sd * 7, 0.6);
    }
  }
  if (ruin) {
    // a cornice stone fallen in front
    k.surface = SURF.ASHLAR;
    at(b, H.u + 0.7, H.w + 0.9, g(b, H.u + 0.7, H.w + 0.9) - 0.04, 23);
    k.box(0.5, 0.12, 0.3, 0, 0, 0, tint(ASHLAR, r, 0.05), [0.12, 0.3, 0.08]);
  }
  k.surface = prevSurf;
  b.box(...toWorld(H.u, H.w - 0.2), QUELLE.facing, H.width / 2, H.depth / 2);
}

/** Sandstone steps on the left, climbing into the slope (north-east). */
function steps(b: SetBuilder, look: QuelleLook): void {
  const k = b.kit;
  const S = PIECES.steps;
  const r = rng(77);
  let y = -Infinity;
  const prevSurf = k.surface;
  for (let i = 0; i < S.n; i++) {
    const w = S.w0 - i * S.run;
    const gg = Math.max(g(b, S.u - 0.4, w), g(b, S.u + 0.4, w));
    y = Math.max(gg + 0.06, y + 0.14);
    at(b, S.u + (r() - 0.5) * 0.1, w, y - 0.36, (r() - 0.5) * 6);
    k.surface = look === 'today' ? SURF.RUBBLE : SURF.ASHLAR;
    k.box(S.width, 0.36, S.run + 0.06, 0, 0, 0, look === 'today' ? tint(RED, r, 0.12) : tint(ASHLAR_WARM, r, 0.05));
    if (look === 'today' && r() < 0.7) {
      k.surface = SURF.NONE;
      k.box(0.35 + r() * 0.3, 0.025, 0.14, (r() - 0.5) * 0.5, 0.36, S.run * 0.4, MOSS);
    }
  }
  k.surface = prevSurf;
}

/** Mossy blocks along the trail edge either side of the approach. */
function edge(b: SetBuilder, look: QuelleLook): void {
  const k = b.kit;
  const E = PIECES.edge;
  const r = rng(4242);
  const prevSurf = k.surface;
  for (let u = E.u0; u <= E.u1; u += 0.8 + r() * 0.5) {
    if (Math.abs(u - 0.1) < 1.7) continue; // the way to the water stays open
    const w = E.w + (r() - 0.5) * 0.4;
    at(b, u, w, g(b, u, w) - 0.1, r() * 360);
    k.surface = SURF.RUBBLE;
    k.rock(0.28 + r() * 0.16, 0, 0, 0, tint(look === 'today' ? RED_DARK : RED, r, 0.1), 500 + Math.round((u + 4) * 7), 0.55);
    if (look !== 'winter') {
      k.surface = SURF.NONE;
      k.rock(0.14 + r() * 0.05, 0.04, 0.16, 0, tint(MOSS, r, 0.1), 600 + Math.round((u + 4) * 7), 0.3);
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

/** The dressed baroque front with its niche and spout (1789–1796). */
function baroqueFront(b: SetBuilder, look: QuelleLook): void {
  const k = b.kit;
  const W = PIECES.wall;
  const P = PIECES.pipe;
  const r = rng(1777);
  const ruin = look === 'ruin';
  const half = 1.65;
  const base = wallBase(b.heightAt, look);
  const top = 2.05;
  const t = W.thick;
  const prevSurf = k.surface;
  at(b, 0, W.w - t / 2, base);
  k.surface = SURF.ASHLAR;
  // the wall face in courses, with a round-arched niche in the middle
  const nw = 0.86;
  const sill = 0.42;
  const nh = 1.2; // springing line of the niche's head
  const headTop = nh + nw / 2 + 0.08;
  const courses = 7;
  const ch = top / courses;
  for (let i = 0; i < courses; i++) {
    const y0 = i * ch;
    const y1 = y0 + ch - 0.012;
    const col = tint(i === 0 ? ASHLAR_WARM : ASHLAR, r, 0.04);
    if (y1 <= sill || y0 >= headTop) {
      k.box(half * 2, y1 - y0, t, 0, y0, 0, col);
      continue;
    }
    for (const s of [-1, 1]) k.box(half - nw / 2, y1 - y0, t, s * (nw / 2 + (half - nw / 2) / 2), y0, 0, col);
    if (y0 < sill) k.box(nw, sill - y0, t, 0, y0, 0, col);
    if (y1 > headTop) k.box(nw, y1 - headTop, t, 0, headTop, 0, col);
  }
  // the niche: its back, the round head (spandrel + back half disc + soffit), the keystone
  const back = -t / 2 + 0.05;
  k.box(nw, nh - sill, 0.06, 0, sill, back - 0.03, tint(ASHLAR_WARM, r, 0.05));
  const sp = new ExtrudeGeometry(nicheSpandrel(nw, headTop - nh), { depth: t, bevelEnabled: false, curveSegments: 1 });
  sp.translate(0, nh, -t / 2);
  k.add(sp, tint(ASHLAR, r, 0.04));
  // the half with z ≤ 0 turns into the upper half under rotateX(π/2)
  const halfDisc = new CylinderGeometry(nw / 2, nw / 2, 0.06, 16, 1, false, Math.PI / 2, Math.PI);
  halfDisc.rotateX(Math.PI / 2);
  k.add(halfDisc, tint(ASHLAR_WARM, r, 0.05), 0, new Matrix4().makeTranslation(0, nh, back - 0.03));
  k.box(0.2, 0.26, t + 0.04, 0, headTop - 0.2, 0.01, tint(ASHLAR, r, 0.02));
  // pilasters, the cornice (1796: half of it is down), the niche's sill
  for (const s of [-1, 1]) k.box(0.26, top - 0.05, t + 0.08, s * (half - 0.13), 0, 0.03, tint(ASHLAR, r, 0.03));
  if (!ruin) k.box(half * 2 + 0.24, 0.14, t + 0.22, 0, top, 0.06, tint(ASHLAR, r, 0.02));
  else k.box(half + 0.1, 0.14, t + 0.22, -half / 2 - 0.1, top, 0.06, tint(ASHLAR, r, 0.02));
  k.box(nw + 0.2, 0.07, t + 0.1, 0, sill - 0.04, 0.03, tint(ASHLAR, r, 0.02));
  // the bronze spout on a round plate (1796: a dark hole where it was torn out)
  const sy = P.y + 0.04;
  if (!ruin) {
    k.surface = SURF.IRON;
    k.cyl(0.1, 0.1, 0.03, P.u, sy + 0.04, t / 2 + 0.005, BRONZE, [Math.PI / 2, 0, 0], 14);
    k.pole(P.u, sy + 0.04, t / 2, P.u, sy, t / 2 + P.reach * 0.55, 0.034, BRONZE, 10);
  } else {
    k.surface = SURF.NONE;
    k.cyl(0.06, 0.06, 0.02, P.u, sy + 0.04, t / 2 + 0.004, DARK, [Math.PI / 2, 0, 0], 10);
  }
  if (look === 'winter') {
    k.surface = SURF.NONE;
    for (let i = 0; i < 5; i++) icicle(b, P.u + (r() - 0.5) * 0.08, sy - 0.02, t / 2 + P.reach * 0.5 + (r() - 0.5) * 0.06, 0.022 + r() * 0.012, 0.12 + r() * 0.22);
    for (let i = 0; i < 16; i++) icicle(b, -half + 0.15 + r() * (half * 2 - 0.3), top - 0.01, t / 2 + 0.14, 0.025 + r() * 0.02, 0.1 + r() * 0.3);
  }
  // fallen cornice stones at the foot (1796)
  if (ruin) {
    k.surface = SURF.ASHLAR;
    at(b, 1.2, W.w + 0.75, g(b, 1.2, W.w + 0.75) - 0.05, 31);
    k.box(0.9, 0.14, 0.4, 0, 0, 0, tint(ASHLAR, r, 0.04), [0.08, 0.4, 0.15]);
    at(b, 1.9, W.w + 1.4, g(b, 1.9, W.w + 1.4) - 0.05, 77);
    k.box(0.55, 0.14, 0.36, 0, 0, 0, tint(ASHLAR, r, 0.04), [-0.1, 0.9, 0.05]);
  }
  k.surface = prevSurf;
  b.box(...toWorld(0, W.w - t / 2), QUELLE.facing, half + 0.1, t / 2 + 0.05);
}

/** The stone basin before the front (1789–1796; cracked in 1796), and the flagged apron. */
function basin(b: SetBuilder, look: QuelleLook): void {
  const k = b.kit;
  const B = PIECES.basin;
  const r = rng(1788);
  const ruin = look === 'ruin';
  const prevSurf = k.surface;
  at(b, B.u, B.w, basinBase(b.heightAt));
  k.surface = SURF.ASHLAR;
  const t = B.wall;
  k.box(B.len, 0.12, B.depth, 0, 0, 0, tint(ASHLAR_WARM, r, 0.04));
  for (const s of [-1, 1]) {
    k.box(B.len, B.h, t, 0, 0, s * (B.depth / 2 - t / 2), tint(ASHLAR, r, 0.03));
    k.box(t, B.h, B.depth - t * 2, s * (B.len / 2 - t / 2), 0, 0, tint(ASHLAR, r, 0.03));
  }
  // the rim moulding (open in the middle, the water shows): two long pieces, two short
  for (const s of [-1, 1]) {
    k.box(B.len + 0.06, 0.05, t + 0.06, 0, B.h, s * (B.depth / 2 - t / 2), tint(ASHLAR, r, 0.02));
    k.box(t + 0.06, 0.05, B.depth - t * 2, s * (B.len / 2 - t / 2), B.h, 0, tint(ASHLAR, r, 0.02));
  }
  if (ruin) {
    k.surface = SURF.NONE;
    k.box(0.02, B.h * 0.8, 0.02, B.len * 0.2, 0.1, B.depth / 2 + 0.002, DARK, [0, 0, 0.3]);
    k.surface = SURF.ASHLAR;
    at(b, B.u + B.len / 2 + 0.35, B.w + 0.4, g(b, B.u + B.len / 2 + 0.35, B.w + 0.4) - 0.04, 12);
    k.box(0.22, 0.2, 0.18, 0, 0, 0, tint(ASHLAR, r, 0.05), [0.2, 0.5, 0.3]);
  }
  // the flagged apron in front
  k.surface = SURF.COBBLE;
  for (let i = 0; i < 9; i++) {
    const u = -1.6 + (i % 3) * 1.1 + (r() - 0.5) * 0.08;
    const w = B.w + 0.75 + Math.floor(i / 3) * 0.62;
    if (ruin && r() < 0.3) continue;
    at(b, u, w, g(b, u, w) - 0.07, (r() - 0.5) * 4);
    k.box(1.04, 0.1, 0.58, 0, 0, 0, tint(ASHLAR_WARM, r, 0.07));
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
  for (const s of [-1, 1]) k.box(0.09, 1.25, 0.09, s * 0.42, 0, 0, C.woodDark);
  k.box(1.0, 0.06, 0.18, 0, 1.25, -0.02, C.woodDark, [0.2, 0, 0]);
  k.box(0.92, 0.56, 0.04, 0, 0.67, -0.03, C.woodDark);
  k.surface = prevSurf;
  const f = face(deg);
  b.sign(x + Math.sin(f) * 0.01, y + 0.95, z + Math.cos(f) * 0.01, deg, 0.86, 0.48, { text: 'Karlsbergquelle\nWaldPark Schloss Karlsberg' });
  b.circle(x, z, 0.5);
}

/** The spring's stonework for one look (see the file comment). */
export function buildQuelle(b: SetBuilder, look: QuelleLook): void {
  if (look === 'today') {
    dryWall(b);
    logTrough(b);
    pipe(b);
    const W = PIECES.wall;
    const [px, pz] = toWorld(-0.85, W.w + 0.012);
    b.sign(px, wallBase(b.heightAt, 'today') + 0.62, pz, QUELLE.facing, 0.46, 0.24, { text: 'Karlsberg-\nquelle', style: 'plate' });
    infoBoard(b);
  } else {
    baroqueFront(b, look);
    basin(b, look);
    // the old dry wall continues either side of the new front
    const k = b.kit;
    const r = rng(17);
    const prevSurf = k.surface;
    k.surface = SURF.RUBBLE;
    for (const s of [-1, 1]) {
      for (let u = 1.9; u < 2.9; u += 0.42) {
        const uu = s * u;
        const gg = g(b, uu, PIECES.wall.w - 0.2);
        for (let row = 0; row < 3; row++) {
          at(b, uu, PIECES.wall.w - bow(uu) - 0.27, gg - 0.08 + row * 0.3);
          k.box(0.4, 0.27, 0.5, 0, 0, 0, tint(RED, r, 0.1));
        }
      }
    }
    k.surface = prevSurf;
  }
  springHouse(b, look);
  steps(b, look);
  edge(b, look);
  // ferns in the hollow: either side of the wall, on the slope behind, by the steps
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
  ];
  const keep = look === 'ruin' || look === 'today' ? ferns : ferns.slice(0, 6);
  keep.forEach(([u, w, s], i) => fern(b, u, w, s * (look === 'ruin' ? 1.15 : 1), 11 + i, look === 'winter'));
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
