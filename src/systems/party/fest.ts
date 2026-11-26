/**
 * The party's real set (`FestPartySet`, behind the `PartySet` interface of set.ts): a small autumn
 * get-together on today's plateau after the guided tour (bible 06-enden §8), built in code on the
 * scenery Kit and its prop material, warm at dusk. No brands, labels or signs anywhere (§8.5):
 * plain mugs, plain pots, a mulled-wine pot and a children's punch pot on a gas stove, nobody
 * drinks in the picture.
 *
 * Pieces (props from placements.ts; positions, people and variants are the party logic's):
 *  - the beer-table set: the trestle table with a gingham cloth, its bench, Hanne's and the keep
 *    ending's benches (folded wool blankets on them), Herzog's camping chair (with a mug in the
 *    cup holder) turned the way Herzog sits
 *  - on the table: a round crumble cake with two slices out, plates with slices, a plate stack,
 *    napkins, the cake cash box (lid open, coins), the two-burner gas stove with the mulled-wine
 *    pot and the punch pot (ladles, steam, small blue gas crowns), rows of mugs, a thermos, a tea
 *    light, the first lantern; a gas bottle under the table; the archive box (museum only)
 *  - the fire bowl on its stand with logs and glowing coals, flames, sparks and a little smoke,
 *    a stack of firewood beside it
 *  - two strands of fairy lights between two rigged posts (guy ropes) over the table
 *  - the group's lanterns (one on the table, two on the ground), a crate of blankets
 *
 * Draw calls (`drawCalls()`, main pass; the props mesh also casts a sun shadow from Mittel up):
 *  1 props   ONE merged Kit mesh on the prop material + 3 local warm lights (fire, fairy lights,
 *            table lantern) that light only the set
 *  2 glows   instanced additive halos: bulbs, lanterns, fire, the CPU sparks (burst on 'burn')
 *  3 flames  instanced flame billboards: fire tongues (`setFire`), gas crowns, the tea light
 *  4 steam   GPU puffs over the pots, thin smoke over the fire (Mittel / Hoch)
 *  5 pools   warm light pools draped on the terrain (Mittel / Hoch)
 * Hoch 5 calls / ≈ 14 k triangles, Mittel 5 / ≈ 12 k, Niedrig 3 / ≈ 5 k (tests/party-set.test.ts).
 * Variants: museum adds the archive box; burn starts the fire high (1.6) and bursts sparks; keep
 * is the base set. Terrain y from `heightAt`.
 */
import {
  type BufferGeometry,
  BufferAttribute,
  BufferGeometry as Geo,
  CylinderGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  LatheGeometry,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  Quaternion,
  type ShaderMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { GraphicsLevel } from '../../core/save';
import { atmosphere } from '../../world/atmosphere';
import { SURF } from '../../world/surfaces';
import { quadInstanced } from '../fx/gl';
import { Kit, type Hex, rng, tint } from '../scenery/kit';
import { glowMaterial } from '../scenery/material';
import { FLAME, type FlameSpec, type PoolSpec, type PuffSource, drapedPools, festPoolMaterial, festPropMaterial, flameMesh, puffMesh } from './festfx';
import { type PartyLayout, type PropId, TABLE_TOP, faceYaw, propsFor } from './placements';
import type { P3, PartySet, PartySetHandle } from './set';
import type { PartyVariant } from './types';

// colours (sRGB); wood / iron / ember / ash / rope match the Kit's surface table
const C = {
  board: 0xa9784a,
  wood: 0x7a5636,
  woodDark: 0x4e3622,
  post: 0x5c4330,
  bark: 0x4a3424,
  char: 0x2a1f19,
  cut: 0xc49a6c,
  iron: 0x2b2a2a,
  steelLeg: 0x7d8186,
  steel: 0xa9adb2,
  black: 0x1c1c1d,
  ember: 0xff7a2a,
  ash: 0x3a3532,
  rope: 0x9a8a68,
  wire: 0x1f1d1b,
  bulb: 0xffe2a8,
  glass: 0xffc27a,
  clothLight: 0xd9ccb2,
  clothMid: 0xae7466,
  clothDark: 0x86352e,
  crust: 0xb8783c,
  crumble: 0xd9a65a,
  crumb: 0xf0d394,
  plate: 0xf1eee6,
  napkin: 0xf4f1ea,
  enamel: 0x8c2a22,
  wine: 0x3d0f13,
  punch: 0xa8452a,
  stove: 0x6d7570,
  shield: 0xa3a8ac,
  cashBox: 0x3c5a7a,
  coin: 0xc9a24a,
  card: 0x9a948a,
  paper: 0xe8dcc0,
  chair: 0x3e6a4a,
  gas: 0x75838f,
  thermos: 0x3f5a46,
  candle: 0xf0e6d0,
};
/** Mug glazes: plain, no prints. */
const MUGS: Hex[] = [0xece4d4, 0x8a2b26, 0x3f5a46, 0x2f4058, 0xd8c7a4];
/** Wool blankets. */
const WOOL: Hex[] = [0x9a4232, 0x6f8257, 0xc9ae7c, 0x5d6c88];

/** Sag of the two fairy-light strands at their middle (m); the first is the placeholder's. */
const SAGS = [0.75, 1.05];
/** Lift of things standing on the cloth (m). */
const ON_CLOTH = 0.006;
/** Table top (2.2 × 0.6 m, yaw 0 = long side along x). */
const TABLE = { w: 2.2, d: 0.6 };

interface Tier {
  level: GraphicsLevel;
  low: boolean;
  /** Segment count for a round thing that has n on Hoch. */
  seg(n: number): number;
}

function tierFor(level: GraphicsLevel): Tier {
  const f = level === 'high' ? 1 : level === 'medium' ? 0.75 : 0.5;
  return { level, low: level === 'low', seg: (n) => Math.max(4, Math.round(n * f)) };
}

interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  age: number;
}

/** Local matrix: position, Euler (YXZ) rotation. */
function mat(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Matrix4 {
  return new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'YXZ')), new Vector3(1, 1, 1));
}

/** A lathe (profile of [radius, y] pairs) as a Kit piece. */
function lathe(k: Kit, pts: readonly [number, number][], seg: number, color: Hex, m?: Matrix4, glow = 0, surf?: number): void {
  k.add(
    new LatheGeometry(
      pts.map(([r, y]) => new Vector2(Math.max(r, 0), y)),
      seg,
    ),
    color,
    glow,
    m,
    surf,
  );
}

/** A flat quad (4 corners, counter-clockwise seen from the front) as a Kit piece. */
function quad(k: Kit, p: readonly [number, number, number][], color: Hex, surf?: number): void {
  const g = new Geo();
  const [a, b, c, d] = p as [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];
  g.setAttribute('position', new BufferAttribute(new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]), 3));
  g.computeVertexNormals();
  k.add(g, color, 0, undefined, surf);
}

/**
 * The gingham tablecloth: the top and the four hanging skirts as check squares in three tones
 * (one geometry per tone), the skirts with soft folds toward the hem.
 */
function tablecloth(k: Kit, w: number, d: number, top: number, drop: number, check: number): void {
  const tones: number[][] = [[], [], []];
  const tone = (i: number, j: number) => (i % 2 === 0 ? 1 : 0) + (j % 2 === 0 ? 1 : 0);
  const push = (t: number, ...v: number[]) => tones[t]!.push(...v);
  const nx = Math.max(2, Math.round(w / check));
  const nz = Math.max(2, Math.round(d / check));
  const sx = w / nx;
  const sz = d / nz;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x0 = -w / 2 + i * sx;
      const z0 = -d / 2 + j * sz;
      const x1 = x0 + sx;
      const z1 = z0 + sz;
      push(tone(i, j), x0, top, z0, x0, top, z1, x1, top, z1, x0, top, z0, x1, top, z1, x1, top, z0);
    }
  }
  // skirts: rows down to the hem, a little flare and fold toward the bottom
  const rows = Math.max(1, Math.ceil(drop / check));
  const fold = (u: number, t: number) => t * (0.012 + 0.01 * Math.sin(u * 37.0) * Math.sin(u * 11.3 + 1.3));
  const skirt = (n: number, len: number, flip: boolean, at: (u: number, out: number) => [number, number]) => {
    const s = len / n;
    for (let i = 0; i < n; i++) {
      for (let r = 0; r < rows; r++) {
        const u0 = -len / 2 + i * s;
        const u1 = u0 + s;
        const t0 = r / rows;
        const t1 = (r + 1) / rows;
        const y0 = top - drop * t0;
        const y1 = top - drop * t1;
        const p = (u: number, t: number, y: number) => {
          const [x, z] = at(u, fold(u, t) + 0.004 * t);
          return [x, y, z];
        };
        const a = p(u0, t0, y0);
        const b = p(u0, t1, y1);
        const c = p(u1, t1, y1);
        const e = p(u1, t0, y0);
        push(tone(flip ? n - 1 - i : i, r), ...a, ...b, ...c, ...a, ...c, ...e);
      }
    }
  };
  skirt(nx, w, false, (u, o) => [u, d / 2 + o]);
  skirt(nx, w, true, (u, o) => [-u, -d / 2 - o]);
  skirt(nz, d, true, (u, o) => [w / 2 + o, -u]);
  skirt(nz, d, false, (u, o) => [-w / 2 - o, u]);
  const cols = [C.clothLight, C.clothMid, C.clothDark];
  tones.forEach((v, t) => {
    const g = new Geo();
    g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3));
    g.computeVertexNormals();
    k.add(g, cols[t]!, 0, undefined, SURF.FABRIC);
  });
}

/** A beer-table bench (seat top at 0.465 m) in the current frame. */
function bench(k: Kit, q: Tier): void {
  k.surface = SURF.PLANKS;
  k.box(2.2, 0.035, 0.12, 0, 0.43, -0.064, C.board);
  k.box(2.2, 0.035, 0.12, 0, 0.43, 0.064, tint(C.board, rng(7), 0.06));
  k.box(2.12, 0.05, 0.02, 0, 0.385, -0.1, C.wood);
  k.box(2.12, 0.05, 0.02, 0, 0.385, 0.1, C.wood);
  k.surface = SURF.NONE;
  for (const sx of [-0.8, 0.8]) {
    k.beam(sx, 0.01, -0.13, sx, 0.43, -0.085, 0.024, C.steelLeg);
    k.beam(sx, 0.01, 0.13, sx, 0.43, 0.085, 0.024, C.steelLeg);
    k.beam(sx, 0.012, -0.14, sx, 0.012, 0.14, 0.024, C.steelLeg);
    if (!q.low) k.beam(sx, 0.2, 0, sx * 0.55, 0.42, 0, 0.018, C.steelLeg);
  }
  k.surface = null;
}

/** A folded wool blanket (w × d), two tones: the body and a stripe. */
function blanket(k: Kit, w: number, h: number, d: number, x: number, y: number, z: number, i: number, yaw = 0): void {
  k.surface = SURF.FABRIC;
  k.box(w, h, d, x, y, z, WOOL[i % WOOL.length]!, [0, yaw, 0]);
  k.box(w + 0.004, h * 0.3, d + 0.004, x, y + h * 0.35, z, WOOL[(i + 2) % WOOL.length]!, [0, yaw, 0]);
  k.surface = null;
}

/** A plain mug (no print) at the frame's origin; `up` false = upside down, `full` = mulled wine in it. */
function mug(k: Kit, q: Tier, color: Hex, up: boolean, full: boolean, handleYaw: number): void {
  const s = q.seg(10);
  const prof: [number, number][] = [
    [0, 0],
    [0.033, 0],
    [0.037, 0.008],
    [0.039, 0.085],
    [0.037, 0.092],
    [0.033, 0.088],
    [0.032, 0.012],
    [0, 0.012],
  ];
  const m = up ? new Matrix4() : mat(0, 0.092, 0, Math.PI, 0, 0);
  lathe(k, prof, s, color, m);
  if (full && up) k.add(new CylinderGeometry(0.031, 0.031, 0.004, s, 1), C.wine, 0, mat(0, 0.074, 0));
  if (!q.low) {
    const h = new TorusGeometry(0.024, 0.006, 4, 6, Math.PI);
    k.add(h, color, 0, new Matrix4().multiply(m).multiply(mat(Math.sin(handleYaw) * 0.038, 0.046, Math.cos(handleYaw) * 0.038, 0, handleYaw - Math.PI / 2, -Math.PI / 2)));
  }
}

/** A round cake slice wedge (radius r, height h, angle a) with its two cut faces, tip at the origin. */
function wedge(k: Kit, q: Tier, r: number, h: number, a0: number, a: number, m: Matrix4): void {
  const seg = Math.max(2, Math.round(q.seg(24) * (a / (Math.PI * 2))));
  const side = new CylinderGeometry(r, r, h, seg, 1, true, a0, a);
  side.translate(0, h / 2, 0);
  k.add(side, C.crust, 0, m);
  const topG = new CylinderGeometry(r, r, 0.012, seg, 1, false, a0, a);
  topG.translate(0, h + 0.006, 0);
  k.add(topG, C.crumble, 0, m);
  for (const t of [a0, a0 + a]) {
    const e = new Vector3(Math.sin(t) * r, 0, Math.cos(t) * r).applyMatrix4(m);
    const o = new Vector3(0, 0, 0).applyMatrix4(m);
    const oh = new Vector3(0, h + 0.012, 0).applyMatrix4(m);
    const eh = new Vector3(Math.sin(t) * r, h + 0.012, Math.cos(t) * r).applyMatrix4(m);
    const pts: [number, number, number][] = [
      [o.x, o.y, o.z],
      [e.x, e.y, e.z],
      [eh.x, eh.y, eh.z],
      [oh.x, oh.y, oh.z],
    ];
    quad(k, pts, C.crumb);
  }
}

/** A dessert plate at the frame's origin. */
function plate(k: Kit, q: Tier, r: number, m: Matrix4): void {
  lathe(
    k,
    [
      [0, 0.002],
      [r * 0.7, 0],
      [r, 0.013],
      [r * 0.97, 0.015],
      [r * 0.68, 0.006],
      [0, 0.008],
    ],
    q.seg(16),
    C.plate,
    m,
  );
}

/** The group's lantern (modern garden lantern: black frame, glowing panes) at the frame's origin. */
function lantern(k: Kit, q: Tier, s: number): void {
  k.surface = SURF.NONE;
  k.box(0.15 * s, 0.02 * s, 0.15 * s, 0, 0, 0, C.black);
  k.box(0.115 * s, 0.2 * s, 0.115 * s, 0, 0.02 * s, 0, C.glass, undefined, 0.55);
  for (const [px, pz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    k.box(0.014 * s, 0.2 * s, 0.014 * s, px * 0.064 * s, 0.02 * s, pz * 0.064 * s, C.black);
  }
  k.box(0.16 * s, 0.018 * s, 0.16 * s, 0, 0.22 * s, 0, C.black);
  k.add(new CylinderGeometry(0, 0.105 * s, 0.07 * s, 4, 1), C.black, 0, mat(0, 0.273 * s, 0, 0, Math.PI / 4, 0));
  if (!q.low) k.add(new TorusGeometry(0.028 * s, 0.004 * s, 4, 10), C.black, 0, mat(0, 0.335 * s, 0));
  k.surface = null;
}

export class FestPartySet implements PartySet {
  /** @param level the graphics preset when the set is built (Niedrig: fewer pieces, no steam, no pools). */
  constructor(
    private readonly heightAt: (x: number, z: number) => number,
    private readonly level: () => GraphicsLevel = () => 'high',
    private readonly reducedMotion: () => boolean = () => false,
  ) {}

  build(scene: Object3D, layout: PartyLayout, variant: PartyVariant): PartySetHandle {
    const q = tierFor(this.level());
    const ground = (x: number, z: number) => {
      const g = this.heightAt(x, z);
      return Number.isFinite(g) ? g : 0;
    };
    const P = layout.props;
    const r = rng(0x5e7f);
    const T = P.table;
    const tableY = ground(T.x, T.z);
    const topY = tableY + TABLE_TOP + ON_CLOTH;
    // things on the table stay on its top (2 cm in from the edges)
    const onTable = (id: PropId, hx: number, hz: number): P3 => {
      const s = P[id];
      const lx = Math.min(TABLE.w / 2 - hx - 0.02, Math.max(-TABLE.w / 2 + hx + 0.02, s.x - T.x));
      const lz = Math.min(TABLE.d / 2 - hz - 0.02, Math.max(-TABLE.d / 2 + hz + 0.02, s.z - T.z));
      return { x: T.x + lx, y: topY, z: T.z + lz };
    };
    const HALF: Partial<Record<PropId, [number, number]>> = {
      cake: [0.17, 0.17],
      cashBox: [0.1, 0.07],
      stove: [0.31, 0.15],
      pot: [0.16, 0.16],
      punch: [0.11, 0.11],
      lantern1: [0.075, 0.075],
      archiveBox: [0.21, 0.16],
    };
    const anchors: Partial<Record<PropId, P3>> = {};
    for (const id of propsFor(variant)) {
      const s = P[id];
      const h = HALF[id];
      if (h && s.up !== undefined) anchors[id] = onTable(id, h[0], h[1]);
      else if (s.up !== undefined && id !== 'lightsA' && id !== 'lightsB') anchors[id] = { x: s.x, y: tableY + s.up, z: s.z };
      else anchors[id] = { x: s.x, y: ground(s.x, s.z) + (s.up ?? 0), z: s.z };
    }
    const A = (id: PropId) => anchors[id]!;
    const k = new Kit();
    const at = (id: PropId, yaw = P[id].yaw ?? 0) => {
      const a = A(id);
      k.place(a.x, a.y, a.z, yaw);
    };
    /** Place on the table top at a table-local x / z. */
    const onTop = (lx: number, lz: number, yaw = 0) => k.place(T.x + lx, topY, T.z + lz, yaw);

    // ---- the beer table: legs, top, gingham cloth ------------------------------------------------
    k.place(T.x, tableY, T.z, T.yaw ?? 0);
    k.surface = SURF.PLANKS;
    k.box(TABLE.w, 0.035, TABLE.d, 0, 0.725, 0, C.board);
    k.surface = SURF.NONE;
    for (const sx of [-0.82, 0.82]) {
      k.beam(sx, 0.01, -0.25, sx, 0.71, -0.2, 0.026, C.steelLeg);
      k.beam(sx, 0.01, 0.25, sx, 0.71, 0.2, 0.026, C.steelLeg);
      k.beam(sx, 0.013, -0.27, sx, 0.013, 0.27, 0.026, C.steelLeg);
      k.beam(sx, 0.7, -0.22, sx, 0.7, 0.22, 0.024, C.steelLeg);
      k.beam(sx, 0.42, 0, sx * 0.45, 0.71, 0, 0.02, C.steelLeg);
    }
    k.surface = null;
    tablecloth(k, TABLE.w + 0.1, TABLE.d + 0.12, TABLE_TOP + 0.003, q.low ? 0.17 : 0.19, q.low ? 0.1 : 0.06);

    // ---- benches (blankets on Hanne's and the keep bench), the camping chair ---------------------
    at('benchTable');
    bench(k, q);
    at('benchHanne');
    bench(k, q);
    blanket(k, 0.3, 0.05, 0.22, 0.92, 0.465, 0.0, 1, 0.08);
    at('benchKeep');
    bench(k, q);
    blanket(k, 0.32, 0.055, 0.23, -0.88, 0.465, 0.0, 0, -0.1);
    if (!q.low) blanket(k, 0.3, 0.05, 0.22, -0.86, 0.52, 0.01, 3, 0.15);

    // Herzog's camping chair, turned the way he sits (the person on its spot)
    const C0 = P.chair;
    const sitter = layout.people.find((p) => Math.hypot(p.x - C0.x, p.z - C0.z) < 0.4);
    const chairYaw = sitter ? faceYaw(sitter, layout, layout.centre) : (C0.yaw ?? 0);
    at('chair', chairYaw);
    k.surface = SURF.NONE;
    for (const sx of [-0.25, 0.25]) {
      k.beam(sx, 0.01, -0.22, sx, 0.43, 0.2, 0.018, C.iron);
      k.beam(sx, 0.01, 0.22, sx, 0.43, -0.2, 0.018, C.iron);
      k.beam(sx, 0.62, -0.2, sx, 0.62, 0.16, 0.018, C.iron);
      k.beam(sx, 0.43, -0.2, sx, 0.62, -0.2, 0.016, C.iron);
      k.beam(sx, 0.4, 0.2, sx * 0.96, 0.95, 0.31, 0.018, C.iron);
    }
    k.surface = SURF.FABRIC;
    k.box(0.48, 0.03, 0.44, 0, 0.405, 0, C.chair, [0.06, 0, 0]);
    k.box(0.48, 0.5, 0.025, 0, 0.44, 0.255, C.chair, [-0.2, 0, 0]);
    k.box(0.07, 0.02, 0.38, -0.25, 0.625, -0.02, tint(C.chair, r, 0.1));
    k.box(0.07, 0.02, 0.38, 0.25, 0.625, -0.02, tint(C.chair, r, 0.1));
    k.surface = null;
    // the cup holder on the right arm, a mug in it
    k.add(new TorusGeometry(0.045, 0.008, 4, q.seg(10)), C.black, 0, mat(0.33, 0.6, -0.15, Math.PI / 2, 0, 0));
    k.push(0.33, 0.56, -0.15);
    mug(k, q, MUGS[1]!, true, false, 0.8);
    k.pop();

    // ---- on the table ---------------------------------------------------------------------------
    // the cake: round crumble cake on a plate, two slices out
    at('cake');
    plate(k, q, 0.17, new Matrix4());
    {
      const m = mat(0, 0.016, 0);
      const out = Math.PI / 3;
      wedge(k, q, 0.14, 0.07, 0.4 + out, Math.PI * 2 - out, m);
      if (!q.low) {
        // crumbles on top
        for (let i = 0; i < 9; i++) {
          const a = 0.4 + out + r() * (Math.PI * 2 - out - 0.3) + 0.15;
          const rr = 0.03 + r() * 0.09;
          const g = new IcosahedronGeometry(0.012 + r() * 0.006, 0);
          g.scale(1, 0.55, 1);
          k.add(g, tint(C.crumble, r, 0.1), 0, mat(Math.sin(a) * rr, 0.016 + 0.082, Math.cos(a) * rr));
        }
      }
    }
    // plates with a slice and a fork each (front, toward the bench)
    for (const [lx, a] of [
      [-0.75, 0.5],
      [-0.38, -0.7],
    ] as const) {
      onTop(lx, -0.2, a);
      plate(k, q, 0.075, new Matrix4());
      wedge(k, q, 0.12, 0.065, Math.PI - 0.26, 0.52, mat(0.01, 0.009, 0.055, 0, 0, 0));
      if (!q.low) k.box(0.012, 0.004, 0.13, 0.06, 0.016, -0.005, C.steel, [0, 0.25, 0]);
    }
    // a stack of plates, the napkins
    onTop(-0.16, 0.19);
    k.add(new CylinderGeometry(0.082, 0.07, 0.03, q.seg(16), 1), C.plate, 0, mat(0, 0.015, 0));
    plate(k, q, 0.085, mat(0, 0.03, 0));
    onTop(0.08, 0.18, 0.2);
    k.box(0.11, 0.03, 0.11, 0, 0, 0, C.napkin);
    // the cake cash box: open, coins in the tray, a few counted out beside it
    at('cashBox', 0.15);
    k.surface = SURF.NONE;
    k.box(0.2, 0.06, 0.14, 0, 0, 0, C.cashBox);
    k.box(0.18, 0.004, 0.12, 0, 0.058, 0, C.black);
    k.box(0.2, 0.01, 0.14, 0, 0.06, 0.07, C.cashBox, [-1.85, 0, 0]);
    if (!q.low) {
      for (let i = 0; i < 6; i++) k.add(new CylinderGeometry(0.011, 0.011, 0.003, 7, 1), C.coin, 0, mat(-0.07 + i * 0.028, 0.063, -0.02 + (i % 2) * 0.03));
      for (let i = 0; i < 3; i++) k.add(new CylinderGeometry(0.012, 0.012, 0.003, 7, 1), C.coin, 0, mat(0.14, 0.0015 + i * 0.003, -0.06));
    }
    k.surface = null;
    // the two-burner gas stove (windshield toward the bench), pots on its grates
    at('stove');
    k.surface = SURF.NONE;
    k.box(0.6, 0.07, 0.3, 0, 0, 0, C.stove);
    k.box(0.6, 0.09, 0.008, 0, 0.07, -0.146, C.shield, [-0.15, 0, 0]);
    for (const bx of [-0.2, 0.2]) {
      k.add(new CylinderGeometry(0.045, 0.05, 0.012, q.seg(10), 1), C.black, 0, mat(bx, 0.076, 0));
      k.beam(bx - 0.08, 0.082, 0, bx + 0.08, 0.082, 0, 0.008, C.black);
      k.beam(bx, 0.082, -0.08, bx, 0.082, 0.08, 0.008, C.black);
      k.add(new CylinderGeometry(0.014, 0.014, 0.018, 6, 1), C.black, 0, mat(bx, 0.035, 0.155, Math.PI / 2, 0, 0));
    }
    k.surface = null;
    // the mulled-wine pot (red enamel, a ladle) and the children's punch (steel)
    const potProfile = (rr: number, h: number): [number, number][] => [
      [0, 0],
      [rr * 0.93, 0],
      [rr, 0.02],
      [rr, h],
      [rr * 1.04, h + 0.008],
      [rr * 0.97, h + 0.006],
      [rr * 0.95, 0.03],
      [0, 0.03],
    ];
    const pot = A('pot');
    k.place(pot.x, pot.y + 0.088, pot.z);
    lathe(k, potProfile(0.14, 0.19), q.seg(18), C.enamel);
    k.add(new CylinderGeometry(0.132, 0.132, 0.004, q.seg(18), 1), C.wine, 0, mat(0, 0.15, 0));
    for (const sx of [-1, 1]) k.box(0.04, 0.016, 0.03, sx * 0.155, 0.15, 0, C.black);
    k.beam(0.04, 0.12, 0.02, -0.11, 0.33, 0.07, 0.012, C.steel);
    k.add(new IcosahedronGeometry(0.03, 0), C.steel, 0, mat(0.05, 0.11, 0.02));
    const punch = A('punch');
    k.place(punch.x, punch.y + 0.088, punch.z);
    lathe(k, potProfile(0.1, 0.13), q.seg(16), C.steel);
    k.add(new CylinderGeometry(0.094, 0.094, 0.004, q.seg(16), 1), C.punch, 0, mat(0, 0.1, 0));
    for (const sx of [-1, 1]) k.box(0.035, 0.014, 0.026, sx * 0.112, 0.1, 0, C.black);
    if (!q.low) k.beam(-0.02, 0.09, -0.01, 0.08, 0.26, -0.06, 0.01, C.steel);
    // mugs in front of the stove: a row upside down (clean), a row ready, two filled
    const mugRows: [number, number, boolean, boolean][] = [];
    const nRow = q.low ? 4 : 6;
    for (let i = 0; i < nRow; i++) mugRows.push([0.28 + i * 0.095, -0.13, false, false]);
    for (let i = 0; i < nRow - 1; i++) mugRows.push([0.33 + i * 0.095, -0.232, true, i === 1 || i === 3]);
    mugRows.forEach(([lx, lz, up, full], i) => {
      onTop(lx, lz);
      mug(k, q, MUGS[i % MUGS.length]!, up, full, 2.2 + r() * 0.6);
    });
    // a thermos at the end, a tea light in a glass
    onTop(1.02, 0.17);
    k.surface = SURF.NONE;
    k.add(new CylinderGeometry(0.038, 0.038, 0.23, q.seg(10), 1), C.thermos, 0, mat(0, 0.115, 0));
    k.add(new CylinderGeometry(0.033, 0.036, 0.05, q.seg(10), 1), C.steel, 0, mat(0, 0.255, 0));
    k.surface = null;
    const teaLight = { x: T.x + 1.0, y: topY, z: T.z - 0.03 };
    k.place(teaLight.x, teaLight.y, teaLight.z);
    lathe(
      k,
      [
        [0, 0],
        [0.03, 0],
        [0.032, 0.06],
        [0.029, 0.06],
        [0.027, 0.006],
        [0, 0.006],
      ],
      q.seg(10),
      C.glass,
      undefined,
      0.35,
    );
    // the gas bottle under the table, the hose up to the stove
    const st = A('stove');
    const gx = st.x + 0.05;
    const gz = T.z + 0.12;
    const gy = ground(gx, gz);
    k.place(gx, gy, gz);
    k.surface = SURF.NONE;
    k.add(new CylinderGeometry(0.11, 0.11, 0.3, q.seg(12), 1), C.gas, 0, mat(0, 0.16, 0));
    lathe(
      k,
      [
        [0.11, 0.31],
        [0.07, 0.36],
        [0.02, 0.37],
        [0, 0.37],
      ],
      q.seg(12),
      C.gas,
    );
    k.add(new CylinderGeometry(0.1, 0.1, 0.02, q.seg(12), 1), C.gas, 0, mat(0, 0, 0));
    k.add(new CylinderGeometry(0.015, 0.015, 0.05, 6, 1), C.steel, 0, mat(0, 0.39, 0));
    k.place(0, 0, 0);
    const hose: [number, number, number][] = [
      [gx, gy + 0.41, gz],
      [gx - 0.05, gy + 0.5, gz + 0.06],
      [gx - 0.12, tableY + 0.62, T.z + 0.32],
      [st.x - 0.15, st.y - 0.02, T.z + 0.32],
      [st.x - 0.3, st.y + 0.03, st.z + 0.05],
    ];
    for (let i = 0; i + 1 < hose.length; i++) {
      const [a, b] = [hose[i]!, hose[i + 1]!];
      k.beam(a[0], a[1], a[2], b[0], b[1], b[2], 0.014, C.black);
    }
    k.surface = null;
    // the archive box (museum): grey card, the lid pushed back, the pages showing
    if (anchors.archiveBox) {
      at('archiveBox', 0.12);
      k.surface = SURF.NONE;
      k.box(0.4, 0.22, 0.3, 0, 0, 0, C.card);
      k.box(0.37, 0.004, 0.18, 0, 0.221, -0.05, C.paper);
      k.box(0.3, 0.003, 0.11, 0.01, 0.226, -0.085, 0xf0e6cc, [0.04, 0.08, -0.03]);
      k.box(0.42, 0.04, 0.32, 0, 0.222, 0.13, C.card);
      k.surface = null;
    }

    // ---- the fire bowl, its firewood ------------------------------------------------------------
    const F = A('fireBowl');
    at('fireBowl');
    k.surface = SURF.IRON;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3;
      const s = Math.sin(a);
      const c = Math.cos(a);
      k.beam(s * 0.46, 0.0, c * 0.46, s * 0.38, 0.18, c * 0.38, 0.03, C.iron);
      k.beam(s * 0.38, 0.18, c * 0.38, s * 0.3, 0.33, c * 0.3, 0.03, C.iron);
      k.add(new CylinderGeometry(0.035, 0.04, 0.012, 6, 1), C.iron, 0, mat(s * 0.465, 0, c * 0.465));
    }
    k.add(new TorusGeometry(0.3, 0.016, 4, q.seg(16)), C.iron, 0, mat(0, 0.33, 0, Math.PI / 2, 0, 0));
    lathe(
      k,
      [
        [0.0, 0.0],
        [0.18, 0.012],
        [0.33, 0.06],
        [0.44, 0.14],
        [0.52, 0.25],
        [0.545, 0.27],
        [0.53, 0.285],
        [0.5, 0.26],
        [0.42, 0.16],
        [0.3, 0.09],
        [0.0, 0.07],
      ],
      q.seg(20),
      C.iron,
      mat(0, 0.3, 0),
    );
    k.surface = null;
    // the bed of ash and glowing coals, the logs crossed over it (charred where they meet)
    k.add(new CylinderGeometry(0.4, 0.34, 0.06, q.seg(16), 1), C.ash, 0, mat(0, 0.37, 0));
    const coals = q.low ? 5 : 11;
    for (let i = 0; i < coals; i++) {
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * 0.3;
      const g = new IcosahedronGeometry(0.035 + r() * 0.03, 0);
      g.scale(1, 0.6, 1);
      k.add(g, i % 3 ? C.ember : C.char, i % 3 ? 0.9 : 0, mat(Math.sin(a) * rr, 0.43, Math.cos(a) * rr, 0, r() * 6.28, 0));
    }
    k.add(new CylinderGeometry(0.3, 0.3, 0.015, q.seg(14), 1), C.ember, 1.0, mat(0, 0.425, 0));
    const logs = q.low ? 3 : 5;
    for (let i = 0; i < logs; i++) {
      const a = (i / logs) * Math.PI * 2 + 0.2;
      const s = Math.sin(a);
      const c = Math.cos(a);
      // from the rim inward and up: a teepee
      k.pole(s * 0.4, 0.44, c * 0.4, s * 0.06, 0.66, c * 0.06, 0.042, i % 2 ? C.bark : C.woodDark, q.seg(7));
      k.pole(s * 0.12, 0.62, c * 0.12, s * 0.03, 0.68, c * 0.03, 0.03, C.char, 5);
    }
    // the firewood stack beside it, cut ends showing
    {
      const fx = F.x - 1.15;
      const fz = F.z + 0.45;
      k.place(fx, ground(fx, fz), fz, 0.5);
      const row = (n: number, y: number) => {
        for (let i = 0; i < n; i++) {
          const z = (i - (n - 1) / 2) * 0.11;
          const len = 0.4 + r() * 0.06;
          const rr = 0.048 + r() * 0.01;
          k.add(new CylinderGeometry(rr, rr, len, q.seg(7), 1), tint(C.bark, r, 0.12), 0, mat(0, y + rr, z, 0, 0, Math.PI / 2));
          if (!q.low) for (const e of [-1, 1]) k.add(new CylinderGeometry(rr * 0.9, rr * 0.9, 0.006, q.seg(7), 1), C.cut, 0, mat((e * len) / 2, y + rr, z, 0, 0, Math.PI / 2));
        }
      };
      row(3, 0);
      row(2, 0.092);
      if (!q.low) row(1, 0.184);
    }

    // ---- fairy lights: two posts with guy ropes, two strands, bulbs -----------------------------
    const LA = A('lightsA');
    const LB = A('lightsB');
    const dirX = LB.x - LA.x;
    const dirZ = LB.z - LA.z;
    const len = Math.hypot(dirX, dirZ) || 1;
    const ux = dirX / len;
    const uz = dirZ / len;
    for (const [e, sgn] of [
      [LA, -1],
      [LB, 1],
    ] as const) {
      const g0 = ground(e.x, e.z);
      const h = e.y - g0 + 0.3;
      // the post leans a little away from the other, held by a guy rope to a peg
      const tx = e.x + sgn * ux * 0.1;
      const tz = e.z + sgn * uz * 0.1;
      k.place(0, 0, 0);
      k.surface = SURF.PLANKS;
      k.pole(e.x, g0 - 0.1, e.z, tx, g0 + h, tz, 0.055, C.post, q.seg(7));
      k.surface = null;
      const px = e.x + sgn * ux * 1.5;
      const pz = e.z + sgn * uz * 1.5;
      const pg = ground(px, pz);
      k.pole(tx, g0 + h - 0.15, tz, px, pg + 0.05, pz, 0.006, C.rope, 4);
      k.box(0.03, 0.12, 0.03, px, pg - 0.04, pz, C.wood);
      if (!q.low) k.add(new TorusGeometry(0.03, 0.008, 4, 8), C.iron, 0, mat(tx, g0 + h - 0.3, tz, 0, Math.atan2(ux, uz), 0));
    }
    k.place(0, 0, 0);
    const strands = q.low ? 1 : 2;
    const bulbs: P3[] = [];
    const nBulbs = q.low ? 26 : 34;
    for (let sIdx = 0; sIdx < strands; sIdx++) {
      const sag = SAGS[sIdx]!;
      const drop = sIdx * 0.12;
      const ax = LA.x - ux * 0.08;
      const az = LA.z - uz * 0.08;
      const bx = LB.x + ux * 0.08;
      const bz = LB.z + uz * 0.08;
      const curve = (t: number): P3 => ({
        x: ax + (bx - ax) * t,
        y: LA.y - drop + (LB.y - LA.y) * t - sag * 4 * t * (1 - t),
        z: az + (bz - az) * t,
      });
      const segs = q.low ? 10 : 16;
      for (let i = 0; i < segs; i++) {
        const p = curve(i / segs);
        const n = curve((i + 1) / segs);
        k.beam(p.x, p.y, p.z, n.x, n.y, n.z, 0.01, C.wire);
      }
      const nb = nBulbs - sIdx * 4;
      for (let i = 0; i < nb; i++) {
        const p = curve((i + 0.5) / nb);
        p.y -= 0.06;
        bulbs.push(p);
        const g = new IcosahedronGeometry(0.034, 0);
        g.scale(1, 1.15, 1);
        k.add(g, C.bulb, 1.15, mat(p.x, p.y, p.z));
        if (!q.low) k.add(new CylinderGeometry(0.014, 0.014, 0.05, 5, 1), C.wire, 0, mat(p.x, p.y + 0.055, p.z));
      }
    }

    // ---- the lanterns, the blanket crate --------------------------------------------------------
    const lanterns: { p: P3; s: number }[] = [];
    for (const id of ['lantern1', 'lantern2', 'lantern3'] as const) {
      const s = id === 'lantern1' ? 0.85 : 1;
      at(id, 0.3 + r());
      lantern(k, q, s);
      const a = A(id);
      lanterns.push({ p: { x: a.x, y: a.y + 0.12 * s, z: a.z }, s });
    }
    {
      // beside the table's left end, out of everyone's way
      const cx = T.x - 1.95;
      const cz = T.z + 1.0;
      k.place(cx, ground(cx, cz), cz, 0.35);
      k.surface = SURF.PLANKS;
      const cw = 0.56;
      const cd = 0.4;
      for (const y of [0.02, 0.17]) {
        k.box(cw, 0.12, 0.02, 0, y, -cd / 2 + 0.01, C.board);
        k.box(cw, 0.12, 0.02, 0, y, cd / 2 - 0.01, C.board);
        k.box(0.02, 0.12, cd - 0.04, -cw / 2 + 0.01, y, 0, C.board);
        k.box(0.02, 0.12, cd - 0.04, cw / 2 - 0.01, y, 0, C.board);
      }
      for (const [px, pz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        k.box(0.04, 0.3, 0.04, px * (cw / 2 - 0.02), 0, pz * (cd / 2 - 0.02), C.wood);
      }
      k.box(cw - 0.04, 0.02, cd - 0.04, 0, 0.02, 0, C.woodDark);
      k.surface = null;
      for (let i = 0; i < 3; i++) blanket(k, 0.5, 0.075, 0.34, (r() - 0.5) * 0.02, 0.11 + i * 0.075, 0, i + 1, (r() - 0.5) * 0.12);
      // one hangs over the edge
      k.surface = SURF.FABRIC;
      k.box(0.36, 0.2, 0.02, 0.0, 0.12, cd / 2 + 0.018, WOOL[0]!, [0.12, 0, 0]);
      k.surface = null;
    }

    const geo = k.build();
    const pm = festPropMaterial();
    const props = new Mesh(geo, pm.material);
    props.name = 'party-props';
    if (q.low) props.userData.noShadow = true;

    // ---- glow sprites: [static halos …, sparks …] -----------------------------------------------
    const nSparks = q.low ? 24 : 44;
    const statics: number[] = [];
    const tints: number[] = [];
    for (const b of bulbs) {
      statics.push(b.x, b.y, b.z, 0.3);
      tints.push(1.0 * 0.5, 0.8 * 0.5, 0.5 * 0.5, r());
    }
    for (const l of lanterns) {
      statics.push(l.p.x, l.p.y, l.p.z, 0.95 * l.s);
      tints.push(0.95 * 0.5, 0.6 * 0.5, 0.25 * 0.5, r());
    }
    statics.push(teaLight.x, teaLight.y + 0.07, teaLight.z, 0.32);
    tints.push(0.5, 0.3, 0.1, r());
    statics.push(F.x, F.y + 0.95, F.z, 3.4);
    tints.push(0.9 * 0.36, 0.42 * 0.36, 0.12 * 0.36, r());
    statics.push(F.x, F.y + 0.6, F.z, 1.5);
    tints.push(0.9 * 0.4, 0.5 * 0.4, 0.15 * 0.4, r());
    const nStatic = statics.length / 4;
    const total = nStatic + nSparks;
    const spriteArr = new Float32Array(total * 4);
    const tintArr = new Float32Array(total * 4);
    spriteArr.set(statics);
    tintArr.set(tints);
    const sg = quadInstanced();
    const aSprite = new InstancedBufferAttribute(spriteArr, 4);
    const aTint = new InstancedBufferAttribute(tintArr, 4);
    sg.setAttribute('aSprite', aSprite);
    sg.setAttribute('aTint', aTint);
    sg.instanceCount = total;
    const gm = glowMaterial(0.6);
    const glows = new Mesh(sg, gm);
    glows.name = 'party-glows';
    glows.frustumCulled = false;
    glows.renderOrder = 9;

    // ---- flames: the fire's tongues, the gas crowns, the tea light ------------------------------
    const flames: FlameSpec[] = [];
    const tongues = q.low ? 4 : 7;
    for (let i = 0; i < tongues; i++) {
      const a = (i / tongues) * Math.PI * 2 + r();
      const rr = i === 0 ? 0 : 0.08 + r() * 0.12;
      const big = i < 3;
      flames.push({ x: F.x + Math.sin(a) * rr, y: F.y + 0.42, z: F.z + Math.cos(a) * rr, w: big ? 0.5 : 0.32, h: big ? 0.95 - i * 0.08 : 0.5 + r() * 0.2, kind: FLAME.fire, seed: r(), lean: (r() - 0.5) * 0.3 });
    }
    for (const bx of [-0.2, 0.2]) flames.push({ x: st.x + bx, y: st.y + 0.074, z: st.z, w: 0.11, h: 0.03, kind: FLAME.gas, seed: r() });
    flames.push({ x: teaLight.x, y: teaLight.y + 0.012, z: teaLight.z, w: 0.022, h: 0.04, kind: FLAME.candle, seed: r() });
    const fl = flameMesh(flames);
    const flameMat = fl.material as ShaderMaterial;
    const visualClock = { value: atmosphere.uTime.value };
    flameMat.uniforms.uTime = visualClock;

    const root = new Group();
    root.name = 'party-set';
    root.add(props, glows, fl);

    // ---- steam over the pots, smoke over the fire (Mittel / Hoch) ------------------------------
    let steam: Mesh | null = null;
    if (!q.low) {
      const puffs: PuffSource[] = [
        { x: pot.x, y: pot.y + 0.27, z: pot.z, rise: 0.6, count: 8, size: 0.14, life: 2.8, color: 0xffffff, alpha: 0.3, spread: 0.14 },
        { x: punch.x, y: punch.y + 0.21, z: punch.z, rise: 0.45, count: 5, size: 0.11, life: 2.4, color: 0xffffff, alpha: 0.24, spread: 0.1 },
        { x: F.x, y: F.y + 1.1, z: F.z, rise: 3.6, count: q.level === 'high' ? 12 : 8, size: 0.45, life: 6.5, color: 0x6e6a66, alpha: 0.16, spread: 0.3 },
      ];
      steam = puffMesh(puffs, r);
      root.add(steam);
    }

    // ---- light pools on the ground (Mittel / Hoch) ----------------------------------------------
    let pools: Mesh | null = null;
    const mid: P3 = { x: (LA.x + LB.x) / 2, y: (LA.y + LB.y) / 2 - SAGS[0]!, z: (LA.z + LB.z) / 2 };
    if (!q.low) {
      const specs: PoolSpec[] = [
        { x: F.x, z: F.z, rx: 4.6, rz: 4.6, color: 0xff8a3a, intensity: 0.42, flicker: 1, fire: true },
        { x: mid.x, z: mid.z, rx: len * 0.55, rz: 2.8, yaw: Math.atan2(ux, uz) - Math.PI / 2, color: 0xffcf8a, intensity: 0.3 },
      ];
      for (const l of lanterns.slice(1)) specs.push({ x: l.p.x, z: l.p.z, rx: 1.4, rz: 1.4, color: 0xffb060, intensity: 0.3, flicker: 0.3 });
      pools = new Mesh(drapedPools(specs, ground, q.level === 'high' ? 12 : 8), festPoolMaterial());
      (pools.material as ShaderMaterial).uniforms.uTime = visualClock;
      pools.name = 'party-pools';
      pools.renderOrder = 7;
      pools.userData.noShadow = true;
      root.add(pools);
    }
    scene.add(root);

    // ---- the local lights of the props ---------------------------------------------------------
    const l1 = lanterns[0]!.p;
    pm.pos[1]!.set(mid.x, mid.y - 0.1, mid.z, 6.5);
    pm.col[1]!.set(0.85, 0.58, 0.32);
    pm.pos[2]!.set(l1.x, l1.y + 0.05, l1.z, 1.5);
    pm.col[2]!.set(1.5, 0.85, 0.36);

    // ---- sparks and the fire -------------------------------------------------------------------
    const sparks: Spark[] = Array.from({ length: nSparks }, () => ({ x: 0, y: -1e4, z: 0, vx: 0, vy: 0, vz: 0, life: 1, age: 1 }));
    let fireK = variant === 'burn' ? 1.6 : 1;
    let time = 0;
    let idleSpark = 0;
    const launch = (s: Spark, strong: boolean) => {
      s.x = F.x + (r() - 0.5) * 0.5;
      s.y = F.y + 0.7;
      s.z = F.z + (r() - 0.5) * 0.5;
      const sp = strong ? 1.2 + r() * 1.6 : 0.4 + r() * 0.5;
      s.vx = (r() - 0.5) * sp;
      s.vz = (r() - 0.5) * sp;
      s.vy = (strong ? 3.2 : 1.6) + r() * (strong ? 3.2 : 1.2);
      s.life = strong ? 2.2 + r() * 1.6 : 1.2 + r();
      s.age = 0;
    };
    const reducedMotion = this.reducedMotion;
    const apply = (reduced = reducedMotion()) => {
      visualClock.value = reduced ? 0 : atmosphere.uTime.value;
      if (steam) steam.visible = !reduced;
      const f = reduced ? 0.86 : 0.86 + 0.09 * Math.sin(time * 7.3) * Math.sin(time * 4.1 + 1.3) + 0.05 * Math.sin(time * 13.1);
      pm.pos[0]!.set(F.x, F.y + 0.8 + 0.15 * fireK, F.z, 5.5 + 1.5 * fireK);
      pm.col[0]!.set(2.3, 0.95, 0.3).multiplyScalar(fireK * f);
      flameMat.uniforms.uFire!.value = fireK;
      if (pools) (pools.material as ShaderMaterial).uniforms.uFire!.value = Math.min(1.6, 0.6 + 0.4 * fireK);
    };
    const write = () => {
      let o = nStatic * 4;
      for (const s of sparks) {
        const live = s.age < s.life;
        const k2 = live ? 1 - s.age / s.life : 0;
        spriteArr[o] = s.x;
        spriteArr[o + 1] = live ? s.y : -1e4;
        spriteArr[o + 2] = s.z;
        spriteArr[o + 3] = 0.07 + 0.05 * k2;
        tintArr[o] = 1.0 * k2;
        tintArr[o + 1] = 0.6 * k2;
        tintArr[o + 2] = 0.22 * k2;
        tintArr[o + 3] = 0.5;
        o += 4;
      }
      aSprite.needsUpdate = true;
      aTint.needsUpdate = true;
    };
    apply();
    write();
    let disposed = false;
    const meshes = [props, glows, fl, steam, pools].filter((m): m is Mesh => m !== null);
    return {
      root,
      anchors,
      setFire(v) {
        fireK = Math.max(0, Math.min(3, Number.isFinite(v) ? v : 1));
        apply();
      },
      burst() {
        if (reducedMotion()) return;
        for (const s of sparks) if (s.age >= s.life) launch(s, true);
      },
      update(dt) {
        if (disposed || !root.visible) return;
        const reduced = reducedMotion();
        if (reduced) {
          idleSpark = 0;
          for (const s of sparks) s.age = s.life;
          apply(reduced);
          write();
          return;
        }
        const d = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
        time += d;
        idleSpark += d * (2 + 3 * fireK);
        for (const s of sparks) {
          if (s.age >= s.life) {
            if (idleSpark >= 1) {
              idleSpark -= 1;
              launch(s, false);
            }
            continue;
          }
          s.age += d;
          s.vy -= 0.6 * d;
          s.vx *= 1 - 0.4 * d;
          s.vz *= 1 - 0.4 * d;
          s.x += s.vx * d + Math.sin(time * 3 + s.life * 7) * 0.15 * d;
          s.y += s.vy * d;
          s.z += s.vz * d;
        }
        idleSpark = Math.min(idleSpark, 1);
        apply(reduced);
        write();
      },
      setVisible(v) {
        root.visible = v;
      },
      drawCalls: () => (root.visible ? meshes.filter((m) => m.visible).length : 0),
      dispose() {
        if (disposed) return;
        disposed = true;
        root.removeFromParent();
        for (const m of meshes) {
          (m.geometry as BufferGeometry).dispose();
          (m.material as Material).dispose();
        }
      },
    };
  }
}
