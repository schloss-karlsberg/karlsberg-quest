/**
 * Set pieces of the world track (playtest round 2: "places where testers saw nothing"):
 *  - the Apfelallee from the Carlsluster Torhaus up to the Orangerie (two rows of apple trees;
 *    snow-laden in February 1793, many felled by 1796), with a board at its foot;
 *  - the menagerie of the Karlslust: iron-barred cages along the terraces with name plates, the
 *    bear boxes, a paddock fence, and boards that say where you are ("Menagerie", "Das Rund");
 *    the solids of the model's rows of animal houses on the terraces (KL-B43, open ground);
 *  - the Festsaal in July 1793: what the looters left (framed paintings stacked to be carried
 *    off, an overturned gilded chair, the last chandelier on the floor) and the things Hanne lets
 *    you choose from, placed in the room: the gilded clock on its console, the ducat on the
 *    window ledge, the door whose handle she holds;
 *  - the Zwinger at the finale (present day, night): the kennels' low ruins, straw, the dogs'
 *    bowls in a row.
 */
import { Color } from 'three';
import { type SetBuilder, face } from './builder';
import { rng, tint } from './kit';
import { fence } from './linear';
import { type OrchardLook, appleTree, stump } from './orchard';
import { C, barrel, kennel, post, straw, trough } from './props';
import type { Solid } from '../../world/collision';
import { RUND } from './rund';
import type { SetDef } from './sets';
import { quelleSet } from './quelle';
import { bleicheSet } from './bleiche';

const LANTERN = new Color(2.2, 1.3, 0.5);

// ---------------------------------------------------------------------------------------------
// The Apfelallee (bible 2.1): the avenue on the 1836–41 sheet, from the Torhaus up the hill
// ---------------------------------------------------------------------------------------------

/** The avenue's axis (local frame): the old track the 1836–41 sheet draws as the avenue, as the
 *  ground shows it (paths.json), from the Torhaus up to the Orangerie. */
export const ALLEE: readonly [number, number][] = [
  [1607, -421],
  [1551, -507],
  [1488, -605],
  [1417, -753],
  [1364, -841],
];
const ALLEE_HALF = 5.2;
const ALLEE_STEP = 9;

/** Tree places along both rows (x, z, row ±1, index). */
export function alleeTrees(): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  let n = 0;
  for (let i = 0; i + 1 < ALLEE.length; i++) {
    const [ax, az] = ALLEE[i]!;
    const [bx, bz] = ALLEE[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    for (let s = i === 0 ? 4 : ALLEE_STEP / 2; s < len; s += ALLEE_STEP) {
      for (const side of [-1, 1]) out.push([ax + ux * s - uz * ALLEE_HALF * side, az + uz * s + ux * ALLEE_HALF * side, side, n++]);
    }
  }
  return out;
}

const apfelallee: SetDef = {
  id: 'apfelallee',
  eras: ['1789', '1793-02', '1793-07', '1796'],
  x: 1490,
  z: -700,
  range: 520,
  keepFree: [
    [1500, -542, 3], // q.k2.spur "allee" (beside the avenue, the runner's trail)
    [1526, -557, 3],
    [1560, -470, 3],
  ],
  build(b, o) {
    const k = b.kit;
    const look: OrchardLook = o.era === '1793-02' ? 'winter' : o.era === '1796' ? 'ruin' : 'summer';
    const r = rng(77);
    for (const [x, z, , i] of alleeTrees()) {
      // a few gaps where a tree died (and in 1796 most were cut for firewood)
      const roll = r();
      if (roll < 0.04) continue;
      // the runner's trail beside the avenue stays clear (q.k2.spur)
      if ((apfelallee.keepFree ?? []).some(([kx, kz, kr]) => Math.hypot(kx - x, kz - z) < kr + 1.6)) continue;
      const felled = look === 'ruin' && roll < 0.6;
      b.at(x, z, (i * 47) % 360, 0.5, 0.1);
      if (felled) stump(k, 900 + i);
      else appleTree(k, 900 + i, look);
      b.circle(x, z, felled ? 0.22 : 0.26);
    }
    // a board at the avenue's foot, by the Torhaus
    const [fx, fz] = ALLEE[0]!;
    const y = b.at(fx + 7.5, fz + 3, 335, 0.4);
    k.box(0.12, 2.1, 0.12, -0.75, 0, 0, C.woodDark);
    k.box(0.12, 2.1, 0.12, 0.75, 0, 0, C.woodDark);
    k.box(1.8, 0.7, 0.06, 0, 1.25, -0.04, C.woodDark);
    b.sign(fx + 7.5 + Math.sin(face(335)) * 0.0, y + 1.6, fz + 3 + Math.cos(face(335)) * 0.0, 335, 1.7, 0.6, { text: 'Apfelallee\nzur Orangerie' });
    b.circle(fx + 7.5, fz + 3, 0.6);
    if (o.era === '1793-02') {
      // the runner's lantern left on a post halfway up
      const [mx, mz] = ALLEE[1]!;
      b.at(mx + 7, mz, 0, 0.2);
      post(k, 501);
      b.model('architecture.lantern', undefined, { x: 0.14, y: 0.66, scale: 0.85 });
      b.circle(mx + 7, mz, 0.12);
      b.glow(mx + 7.1, b.heightAt(mx + 7, mz) + 1.15, mz, 1.0, LANTERN);
    }
  },
};

// ---------------------------------------------------------------------------------------------
// The menagerie of the Karlslust (bible 1.6, 3.10): cages, bear boxes, boards
// ---------------------------------------------------------------------------------------------

/**
 * The menagerie terraces' west edge (footprint KL-B43), north → south. Open ground since the
 * research-wave model (world/palace.ts OPEN_GROUND): no wall runs along it.
 */
const MEN_EDGE: [number, number][] = [
  [2020, 50],
  [1962, 138],
  [1985, 178],
];

/**
 * The six rows of animal houses on the terraces KL-B43 (catalogue facade.menagerie.rows, local
 * frame): each row's terrace wall runs from p0 (west) to p1 (east), its single-storey houses stand
 * in front of it (towards front_azimuth 156.1, downhill) with the runs before them; a broad
 * watercourse crosses the rows in the middle. Row 1 is the highest, next to the Rund.
 */
export const TERRACE_ROWS: readonly { p0: [number, number]; p1: [number, number] }[] = [
  { p0: [1975.1, 155.0], p1: [2061.8, 131.8] },
  { p0: [1983.8, 170.1], p1: [2069.7, 147.0] },
  { p0: [1991.4, 186.4], p1: [2077.0, 163.5] },
  { p0: [1998.6, 205.5], p1: [2085.3, 182.2] },
  { p0: [2006.0, 225.0], p1: [2093.9, 201.4] },
  { p0: [2016.1, 251.4], p1: [2105.4, 227.5] },
];

/**
 * One box solid per row: the terrace wall and the houses (4.4 m deep, centres 1.7 m in front of the
 * wall line). The runs, the ends of the rows and the ground round them are free to walk.
 */
export function terraceSolids(): Solid[] {
  return TERRACE_ROWS.map(({ p0, p1 }) => {
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const ux = (p1[0] - p0[0]) / len;
    const uz = (p1[1] - p0[1]) / len;
    // towards the fronts: right of west → east
    const vx = -uz;
    const vz = ux;
    return { kind: 'box', x: (p0[0] + p1[0]) / 2 + vx * 1.7, z: (p0[1] + p1[1]) / 2 + vz * 1.7, ux, uz, hu: len / 2 + 0.3, hv: 2.35 } as Solid;
  });
}

function cage(b: SetBuilder, x: number, z: number, deg: number, seed: number, name: string): void {
  const k = b.kit;
  const r = rng(seed);
  const y = b.at(x, z, deg, 1.4, 0.1);
  const stone = tint(C.sandstone, r, 0.08);
  // plinth, back and side walls, a slate roof, and iron bars across the front
  k.box(3.4, 0.45, 2.8, 0, 0, 0, stone);
  k.box(3.4, 2.5, 0.25, 0, 0.45, -1.28, tint(C.plaster, r, 0.06));
  for (const s of [-1, 1]) k.box(0.25, 2.5, 2.8, s * 1.58, 0.45, 0, tint(C.plaster, r, 0.06));
  k.box(3.7, 0.12, 3.2, 0, 2.95, -0.05, tint(C.slate, r, 0.1), [0.08, 0, 0]);
  k.box(3.5, 0.14, 0.2, 0, 2.86, 1.32, C.sandstone);
  for (let i = 0; i < 15; i++) k.cyl(0.025, 0.025, 2.42, -1.42 + i * 0.203, 0.45, 1.3, C.iron, undefined, 5);
  for (const yy of [0.9, 2.2]) k.box(3.0, 0.05, 0.05, 0, 0.45 + yy, 1.3, C.iron);
  // straw inside, a trough, a gnawed bone
  k.rock(0.7, -0.6, 0.35, -0.5, C.straw, seed + 4, 0.35);
  k.box(1.0, 0.25, 0.4, 0.8, 0.45, -0.7, C.woodDark);
  k.box(0.32, 0.05, 0.06, 0.2, 0.48, 0.3, C.lime, [0, 0.7, 0]);
  // the name plate over the bars
  const f = face(deg);
  b.sign(x + Math.sin(f) * 1.45, y + 2.55, z + Math.cos(f) * 1.45, deg, 1.2, 0.36, { text: name, style: 'plate' });
  b.box(x, z, deg, 1.75, 1.45);
}

function bearBox(b: SetBuilder, x: number, z: number, deg: number, seed: number): void {
  const k = b.kit;
  const r = rng(seed);
  b.at(x, z, deg, 1.2, 0.08);
  // the iron bear box (bible: "eiserne Bären-Kästen"): riveted plates, a barred window, a hatch
  k.box(2.6, 2.2, 2.2, 0, 0, 0, tint(0x3a3633, r, 0.08));
  for (let i = 0; i < 5; i++) k.box(0.05, 2.22, 2.24, -1.04 + i * 0.52, 0, 0, 0x2a2725);
  k.box(1.0, 0.7, 0.04, 0, 1.15, 1.11, 0x0e0b09);
  for (let i = 0; i < 7; i++) k.cyl(0.022, 0.022, 0.7, -0.42 + i * 0.14, 1.15, 1.13, C.iron, undefined, 5);
  k.box(2.8, 0.12, 2.4, 0, 2.2, 0, 0x2f2c2a);
  k.box(0.7, 0.9, 0.04, -0.7, 0.1, 1.11, 0x4a443e);
  k.rock(0.4, 1.0, -0.05, 1.5, C.strawDark, seed + 2, 0.3);
  b.box(x, z, deg, 1.4, 1.2);
}

const menagerie: SetDef = {
  id: 'karlslust-menagerie',
  eras: ['1789', '1793-02', '1793-07'],
  x: 1950,
  z: 110,
  range: 280,
  keepFree: [
    [1966, 92, 2.5], // the cassowary
    [1903, 87, 2], // the gardener
    [1958, 146, 4], // k1_10 at the bear boxes
    [1935, 50, 3],
    [1935, 124, 3],
    [1910, 215, 3],
    [1920, 205, 3],
  ],
  build(b, o) {
    const k = b.kit;
    // the model's rows of animal houses on the terraces hold you (their plot is open ground)
    b.solids.push(...terraceSolids());
    // cages along the terraces' north-west edge, facing the Rund (outwards, west / south-west)
    const [a, c] = [MEN_EDGE[0]!, MEN_EDGE[1]!];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const ux = (c[0] - a[0]) / len;
    const uz = (c[1] - a[1]) / len;
    // outward normal (away from the polygon, towards the Rund): right of a→c
    const nx = -uz;
    const nz = ux;
    const faceDeg = ((Math.atan2(nx, -nz) * 180) / Math.PI + 360) % 360;
    const names = ['Jaguar', 'Kasuar', 'Dromedare', 'Hirsche', 'Wölfe', 'Füchse', 'Luchs'];
    names.forEach((name, i) => {
      const s = 10 + i * 9.5;
      if (s > len - 6) return;
      const x = a[0] + ux * s + nx * 4.2;
      const z = a[1] + uz * s + nz * 4.2;
      cage(b, x, z, faceDeg, 700 + i, name);
    });
    // the bear boxes on the second stretch: below the west ends of the first two rows, where the
    // ground climbs to the terraces (k1_10's clue at 1958/146 looks up at them)
    const [p, q] = [MEN_EDGE[1]!, MEN_EDGE[2]!];
    const l2 = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const vx = (q[0] - p[0]) / l2;
    const vz = (q[1] - p[1]) / l2;
    const mx = -vz;
    const mz = vx;
    const bearDeg = ((Math.atan2(mx, -mz) * 180) / Math.PI + 360) % 360;
    for (const s of [14, 21, 28, 35]) bearBox(b, p[0] + vx * s + mx * 3.6, p[1] + vz * s + mz * 3.6, bearDeg, 720 + s);
    {
      const s = 24.5;
      const x = p[0] + vx * s + mx * 6.6;
      const z = p[1] + vz * s + mz * 6.6;
      const y = b.at(x, z, bearDeg, 0.4);
      k.box(0.12, 2.3, 0.12, -0.85, 0, 0, C.woodDark);
      k.box(0.12, 2.3, 0.12, 0.85, 0, 0, C.woodDark);
      k.box(2.0, 0.75, 0.06, 0, 1.4, -0.04, C.woodDark);
      b.sign(x, y + 1.78, z, bearDeg, 1.9, 0.62, { text: 'Bären' });
      b.circle(x - 0.85, z, 0.15).circle(x + 0.85, z, 0.15);
    }
    // the big board at the way from the terrace
    {
      const x = 1872;
      const z = 74;
      const y = b.at(x, z, 270, 0.5);
      k.box(0.16, 2.9, 0.16, -1.25, 0, 0, C.woodDark);
      k.box(0.16, 2.9, 0.16, 1.25, 0, 0, C.woodDark);
      k.box(2.8, 1.0, 0.08, 0, 1.8, -0.05, C.woodDark);
      k.box(3.0, 0.1, 0.3, 0, 2.85, 0, C.roof);
      b.sign(x, y + 2.3, z, 270, 2.7, 0.92, { text: 'Menagerie\nder Karlslust' });
      b.circle(x, z - 1.25, 0.18).circle(x, z + 1.25, 0.18);
    }
    // the Rund's board
    {
      const x = RUND.x - RUND.r - 9;
      const z = RUND.z + 9;
      const y = b.at(x, z, 270, 0.4);
      k.box(0.12, 2.1, 0.12, 0, 0, 0, C.woodDark);
      k.box(1.6, 0.6, 0.06, 0, 1.45, -0.04, C.woodDark);
      b.sign(x, y + 1.75, z, 270, 1.5, 0.52, { text: 'Das Rund · 19 Häuser' });
      b.circle(x, z, 0.12);
    }
    // a paddock fence west of the cages, with a gap where the keepers walk in
    b.solids.push(
      ...fence(
        k,
        [
          [1990, 60],
          [1975, 70],
          [1960, 82],
        ],
        b.heightAt,
        731,
        1.3,
        [{ seg: 1, s0: 4, s1: 8 }],
      ),
    );
    // feed: barrels and a trough
    for (const [x, z, s] of [[1999, 92, 741], [2000.5, 93.2, 742]] as const) {
      b.at(x, z, 0, 0.3);
      b.model('architecture.barrel', () => barrel(k, s), { yaw: s, scale: 0.82 });
      b.circle(x, z, 0.32);
    }
    b.at(1993, 100, 30, 1.2);
    trough(k, 743, 2.4, o.era !== '1793-02');
    b.box(1993, 100, 30, 1.25, 0.35);
    if (o.era !== '1789') {
      // one cage stands open (the escaped animals of 1793)
      const x = a[0] + ux * 10 + nx * 6.2;
      const z = a[1] + uz * 10 + nz * 6.2;
      b.at(x, z, faceDeg + 70, 0.5);
      for (let i = 0; i < 6; i++) k.cyl(0.025, 0.025, 2.0, -0.6 + i * 0.24, 0.1, 0, C.iron, [0.2, 0, 0], 5);
    }
  },
};

// ---------------------------------------------------------------------------------------------
// The Festsaal on 28 July 1793 (bible 3.8): the looters' leftovers and the three things to save
// ---------------------------------------------------------------------------------------------

/** The Festsaal's room id (interiors) — its pickups stand on the spots below. */
export const FESTSAAL_ROOM = 'B01.2.og-festsaal';
/** The Festsaal's floor polygon (rooms.json B01.2.og-festsaal) and floor height. */
export const FESTSAAL = {
  poly: [
    [1271.35, -1123.79],
    [1270.06, -1131.47],
    [1260.24, -1129.83],
    [1261.53, -1122.15],
  ] as [number, number][],
  floor: 351.4,
};

/** Where the three things lie (local frame; the e2e and the story's highlight use them). */
export function festsaalSpots(): { uhr: [number, number]; dukat: [number, number]; tuer: [number, number] } {
  const [A, B, Cc, D] = FESTSAAL.poly as [[number, number], [number, number], [number, number], [number, number]];
  const lerp = (p: [number, number], q: [number, number], t: number): [number, number] => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const inward = (p: [number, number], q: [number, number], d: number): [number, number] => {
    const cx = (A[0] + Cc[0]) / 2;
    const cz = (A[1] + Cc[1]) / 2;
    const m = lerp(p, q, 0.5);
    const l = Math.hypot(cx - m[0], cz - m[1]);
    return [m[0] + ((cx - m[0]) / l) * d, m[1] + ((cz - m[1]) / l) * d];
  };
  void D;
  // the clock on a console against the north wall (B→C), the ducat on the east ledge (A→B), the
  // door Hanne's handle came from on the south wall (D→A)
  const uhr = inward(B, Cc, 0.45);
  const dukat = inward(A, B, 0.22);
  const tuer = inward(FESTSAAL.poly[3]!, A, 0.12);
  return { uhr, dukat, tuer };
}

const festsaal: SetDef = {
  id: 'k3-festsaal',
  eras: ['1793-07'],
  x: 1265.8,
  z: -1126.8,
  range: 70,
  build(b) {
    const k = b.kit;
    const y0 = FESTSAAL.floor;
    const [A, , Cc, D] = FESTSAAL.poly as [[number, number], [number, number], [number, number], [number, number]];
    const spots = festsaalSpots();
    const degOf = (dx: number, dz: number) => ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
    const cx = (A[0] + Cc[0]) / 2;
    const cz = (A[1] + Cc[1]) / 2;
    // the gilded clock on its console and the ducat on the ledge are the K3 pickups (interiors
    // festsaal.ts places them on these spots during the fire night); here only the ledge
    {
      const [x, z] = spots.dukat;
      k.place(x, y0 + 0.92, z, 0);
      k.box(0.6, 0.05, 0.28, 0, 0, 0, 0xd8cfc0);
    }
    // the door without its handle: a pale outline where the brass was
    {
      const [x, z] = spots.tuer;
      const deg = degOf(cx - x, cz - z);
      k.place(x, y0, z, face(deg));
      k.box(1.3, 2.5, 0.05, 0, 0, 0, 0xe2d6bc);
      k.box(1.1, 2.3, 0.02, 0, 0.1, 0.03, 0xd2c4a6);
      k.box(0.05, 2.3, 0.02, 0, 0.1, 0.045, 0xb9a57c);
      k.box(0.07, 0.16, 0.01, 0.12, 1.05, 0.05, 0xf4ecd8);
    }
    // the looters' leftovers: framed paintings stacked against the west wall, a toppled chair,
    // the last chandelier lying on the floor, a rolled carpet
    const westIn = (t: number, d: number): [number, number] => {
      const m: [number, number] = [Cc[0] + (D[0] - Cc[0]) * t, Cc[1] + (D[1] - Cc[1]) * t];
      const l = Math.hypot(cx - m[0], cz - m[1]);
      return [m[0] + ((cx - m[0]) / l) * d, m[1] + ((cz - m[1]) / l) * d];
    };
    [0.25, 0.65].forEach((t, si) => {
      for (let i = 0; i < 3; i++) {
        const [x, z] = westIn(t, 0.22 + i * 0.12);
        const deg = degOf(cx - x, cz - z);
        const w = 1.1 - i * 0.18;
        const h = 0.85 - i * 0.12;
        const f = face(deg);
        k.place(x, y0, z, f, { x: -0.22 });
        k.box(w + 0.14, 0.08, 0.05, 0, 0, 0, 0xc9a24a);
        k.box(w + 0.14, 0.08, 0.05, 0, h + 0.06, 0, 0xc9a24a);
        for (const s of [-1, 1]) k.box(0.08, h + 0.14, 0.05, s * (w / 2 + 0.03), 0, 0, 0xc9a24a);
        b.sign(x + Math.sin(f) * 0.03 - Math.sin(f) * Math.sin(0.22) * (h / 2), y0 + 0.07 + (h / 2) * Math.cos(0.22), z + Math.cos(f) * 0.03 - Math.cos(f) * Math.sin(0.22) * (h / 2), deg, w, h, { paint: 40 + si * 7 + i, lean: 0.22 });
      }
    });
    {
      // the toppled gilded chair
      const x = cx - 1.2;
      const z = cz + 1.6;
      k.place(x, y0 + 0.3, z, 0.8, { z: 1.45 });
      k.box(0.55, 0.08, 0.5, 0, 0, 0, 0x3e6a4a);
      k.box(0.6, 0.06, 0.55, 0, -0.06, 0, 0xc9a24a);
      k.box(0.55, 0.6, 0.06, 0, 0, -0.25, 0x3e6a4a);
      for (const [sx, sz] of [[-0.25, -0.22], [0.25, -0.22], [-0.25, 0.22], [0.25, 0.22]] as const) k.box(0.04, -0.4, 0.04, sx, 0, sz, 0xc9a24a);
      // the chandelier on the floor: a gilt ring, crystal drops spilled round it
      const lx = cx + 1.0;
      const lz = cz - 0.8;
      k.place(lx, y0, lz, 0.3, { x: 0.35 });
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * Math.PI * 2;
        const a1 = ((i + 1) / 8) * Math.PI * 2;
        k.beam(Math.cos(a0) * 0.55, 0.08, Math.sin(a0) * 0.55, Math.cos(a1) * 0.55, 0.08, Math.sin(a1) * 0.55, 0.035, 0xb8923e);
        // the bent arms with their candle cups
        k.beam(0, 0.08, 0, Math.cos(a0) * 0.55, 0.08 + (i % 2) * 0.12, Math.sin(a0) * 0.55, 0.02, 0xb8923e);
        k.cyl(0.03, 0.03, 0.09, Math.cos(a0) * 0.55, 0.1, Math.sin(a0) * 0.55, 0xece4d0, undefined, 6);
      }
      k.cyl(0.06, 0.04, 0.7, 0, 0.08, 0, 0xb8923e, [0, 0, 1.25], 6);
      const r = rng(55);
      for (let i = 0; i < 12; i++) {
        const a = r() * 6.28;
        const d = 0.5 + r() * 0.9;
        k.place(lx + Math.cos(a) * d, y0, lz + Math.sin(a) * d, a);
        k.box(0.05, 0.08, 0.03, 0, 0, 0, 0xe8f0f4, [0.5, 0, 0.3], 0.15);
      }
      // a rolled carpet
      k.place(cx - 0.6, y0, cz - 1.9, 1.2);
      k.cyl(0.16, 0.16, 2.4, 0, 0.16, 0, 0x7a2a22, [0, 0, Math.PI / 2], 10);
    }
    // ---- round 3: the room as it was hung the day before (testers saw an empty box) ----------
    const B = FESTSAAL.poly[1]!;
    /** A point on the wall p→q at t, `d` m into the room, and the compass facing into the room. */
    const onWall = (p: [number, number], q: [number, number], t: number, d: number): [number, number, number] => {
      const m: [number, number] = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      // inward normal of the edge (towards the room's centre)
      let nx = -(q[1] - p[1]);
      let nz = q[0] - p[0];
      const l = Math.hypot(nx, nz);
      nx /= l;
      nz /= l;
      if (nx * (cx - m[0]) + nz * (cz - m[1]) < 0) {
        nx = -nx;
        nz = -nz;
      }
      return [m[0] + nx * d, m[1] + nz * d, degOf(nx, nz)];
    };
    const GILT = 0xc9a24a;
    /** A gilt frame round a painting hung flat on the wall. */
    const hang = (p: [number, number], q: [number, number], t: number, yc: number, w: number, h: number, seed: number, tilt = 0) => {
      const [x, z, deg] = onWall(p, q, t, 0.16);
      k.place(x, y0 + yc, z, face(deg));
      k.push(0, 0, 0, 0, 0, tilt);
      k.box(w + 0.2, 0.1, 0.06, 0, -h / 2 - 0.1, 0, GILT);
      k.box(w + 0.2, 0.1, 0.06, 0, h / 2, 0, GILT);
      for (const sx of [-1, 1]) k.box(0.1, h + 0.2, 0.06, sx * (w / 2 + 0.05), -h / 2 - 0.1, 0, GILT);
      // the carved crest on top
      k.box(0.36, 0.14, 0.05, 0, h / 2 + 0.08, 0, GILT, [0, 0, 0], 0.15);
      k.pop();
      const [sx2, sz2] = onWall(p, q, t, 0.2);
      b.sign(sx2, y0 + yc, sz2, deg, w, h, { paint: seed });
    };
    /** A pale patch on the wall where a painting hung until yesterday, its nail still in. */
    const patch = (p: [number, number], q: [number, number], t: number, yc: number, w: number, h: number) => {
      const [x, z, deg] = onWall(p, q, t, 0.135);
      k.place(x, y0 + yc - h / 2, z, face(deg));
      k.box(w, h, 0.01, 0, 0, 0, 0xeee2c4);
      k.box(w - 0.1, 0.02, 0.012, 0, h - 0.06, 0.004, 0xd8caa6);
      k.cyl(0.012, 0.012, 0.06, 0, h + 0.12, 0.02, 0x3a3028, [Math.PI / 2, 0, 0], 5);
    };
    // west wall: the pale squares above the stacks they came from
    patch(Cc, D, 0.25, 2.35, 1.3, 1.0);
    patch(Cc, D, 0.65, 2.25, 1.15, 0.9);
    // north wall: a pier glass over the clock console, two portraits the looters left (too big)
    hang(B, Cc, 0.2, 2.25, 1.0, 1.3, 61);
    hang(B, Cc, 0.8, 2.3, 1.0, 1.3, 62, 0.04);
    {
      const [x, z, deg] = onWall(B, Cc, 0.5, 0.15);
      k.place(x, y0 + 1.05, z, face(deg));
      k.box(0.9, 1.95, 0.04, 0, 0.12, 0, 0x9fb4c0, undefined, 0.25);
      k.box(1.08, 0.12, 0.07, 0, 0.0, 0.01, GILT);
      k.box(1.08, 0.12, 0.07, 0, 2.07, 0.01, GILT);
      for (const sx of [-1, 1]) k.box(0.1, 2.2, 0.07, sx * 0.5, 0.0, 0.01, GILT);
      k.cone(0.22, 0.32, 0, 2.18, 0.01, GILT, 6);
    }
    // south wall, beside the door: one more painting, hanging askew on one nail
    hang(FESTSAAL.poly[3]!, A, 0.22, 2.2, 1.2, 0.9, 63, -0.12);
    // two fauteuils by the console and a canapé under the portraits (green silk, gilt wood)
    const fauteuil = (x: number, z: number, deg: number) => {
      k.place(x, y0, z, face(deg));
      k.box(0.62, 0.1, 0.56, 0, 0.38, 0, 0x3e6a4a);
      k.box(0.66, 0.06, 0.6, 0, 0.34, 0, GILT);
      k.box(0.6, 0.62, 0.08, 0, 0.42, -0.26, 0x3e6a4a);
      k.box(0.66, 0.06, 0.1, 0, 1.04, -0.27, GILT);
      for (const sx of [-1, 1]) {
        k.box(0.06, 0.24, 0.5, sx * 0.31, 0.48, 0, GILT);
        k.box(0.08, 0.04, 0.5, sx * 0.31, 0.72, 0, 0x3e6a4a);
      }
      for (const [sx, sz] of [[-0.28, -0.24], [0.28, -0.24], [-0.28, 0.24], [0.28, 0.24]] as const) k.cyl(0.025, 0.02, 0.34, sx, 0, sz, GILT, undefined, 6);
    };
    for (const t of [0.33, 0.67]) {
      const [x, z, deg] = onWall(B, Cc, t, 0.55);
      k.place(x, y0, z, face(deg));
      b.model('architecture.armchair', () => fauteuil(x, z, deg), { scale: 1.05 });
    }
    {
      // the canapé along the south wall, east of the door
      const [x, z, deg] = onWall(FESTSAAL.poly[3]!, A, 0.72, 0.5);
      k.place(x, y0, z, face(deg));
      k.box(1.7, 0.12, 0.62, 0, 0.36, 0, 0x3e6a4a);
      k.box(1.76, 0.06, 0.66, 0, 0.32, 0, GILT);
      k.box(1.7, 0.55, 0.1, 0, 0.42, -0.28, 0x3e6a4a);
      k.box(1.76, 0.07, 0.12, 0, 0.97, -0.29, GILT);
      for (const sx of [-1, 1]) k.box(0.08, 0.3, 0.6, sx * 0.86, 0.4, 0, GILT);
      for (const sx of [-0.8, -0.27, 0.27, 0.8]) for (const sz of [-0.26, 0.26]) k.cyl(0.025, 0.02, 0.32, sx, 0, sz, GILT, undefined, 6);
    }
    {
      // the second chandelier still hangs: a gilt crown on its chain, candles, crystal drops
      const t = 0.72;
      const mx = B[0] + (Cc[0] - B[0]) * t;
      const mz = B[1] + (Cc[1] - B[1]) * t;
      const hx = mx + (cx - mx) * 0.75;
      const hz = mz + (cz - mz) * 0.75;
      const ceil = 355.5;
      const yb = ceil - 1.75;
      const kitLamp = !b.detailed;
      if (b.detailed) {
        // detailed tiers: a CC0 brass-and-crystal candle chandelier on its chain
        k.place(hx, ceil - 0.25, hz, 0.4);
        b.model('architecture.chandelier', undefined, { scale: 1.6 });
        k.place(hx, 0, hz, 0.4);
        k.cyl(0.015, 0.015, 0.3, 0, ceil - 0.3, 0, 0x8a6a2a, undefined, 4);
      } else {
        k.place(hx, 0, hz, 0.4);
        k.cyl(0.015, 0.015, ceil - yb - 0.4, 0, yb + 0.4, 0, 0x8a6a2a, undefined, 4);
        k.cyl(0.12, 0.05, 0.4, 0, yb, 0, GILT, undefined, 10);
        k.cyl(0.05, 0.12, 0.18, 0, yb - 0.18, 0, GILT, undefined, 10);
      }
      const rr = rng(57);
      for (let i = 0; i < 10; i++) {
        const a0 = (i / 10) * Math.PI * 2;
        const a1 = ((i + 1) / 10) * Math.PI * 2;
        const R = 0.62;
        const lit = rr() < 0.6;
        if (kitLamp) {
          k.beam(Math.cos(a0) * R, yb + 0.05, Math.sin(a0) * R, Math.cos(a1) * R, yb + 0.05, Math.sin(a1) * R, 0.03, GILT);
          k.beam(0, yb + 0.1, 0, Math.cos(a0) * R, yb + 0.05, Math.sin(a0) * R, 0.022, GILT);
          k.cyl(0.04, 0.03, 0.05, Math.cos(a0) * R, yb + 0.06, Math.sin(a0) * R, GILT, undefined, 6);
          // a few candles still burn (the fire outside has not reached the room yet)
          k.cyl(0.018, 0.018, 0.13, Math.cos(a0) * R, yb + 0.1, Math.sin(a0) * R, 0xf2ead8, undefined, 5, lit ? 0.6 : 0);
          k.box(0.03, 0.09, 0.012, Math.cos(a0) * R * 0.8, yb - 0.1, Math.sin(a0) * R * 0.8, 0xe8f0f4, [0, a0, 0], 0.3);
        }
        if (lit) b.glow(hx + Math.cos(a0 + 0.4) * R, yb + 0.27, hz + Math.sin(a0 + 0.4) * R, 0.32, LANTERN);
      }
      // crystal festoons hanging below
      if (kitLamp) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          k.beam(Math.cos(a) * 0.45, yb + 0.02, Math.sin(a) * 0.45, Math.cos(a) * 0.12, yb - 0.38, Math.sin(a) * 0.12, 0.012, 0xdfe8ee);
        }
        k.cone(0.09, 0.22, 0, yb - 0.6, 0, 0xe8f0f4, 6, [Math.PI, 0, 0]);
      }
      b.glow(hx, yb + 0.1, hz, 1.6, new Color(0.9, 0.6, 0.28));
    }
    // nothing here is solid: the room is on the upper floor, and solids act on every storey
  },
};

// ---------------------------------------------------------------------------------------------
// The Zwinger in the present day (K4's finale at night, bible 4.6): the dogs come home
// ---------------------------------------------------------------------------------------------

const zwingerHeute: SetDef = {
  id: 'zwinger-heute',
  eras: ['today'],
  x: 1210,
  z: -1572,
  range: 200,
  keepFree: [
    [1216, -1571, 8], // q.k4.stellen, the finale's place
    [1219, -1566, 2],
  ],
  build(b) {
    const k = b.kit;
    const r = rng(91);
    // the kennels' footings: mossy walls in two rows, each run with its stone threshold, a
    // corner post here and there, and the iron ring the chain hung from
    for (let i = 0; i < 7; i++) {
      for (const z of [-1590.5, -1553.0]) {
        const x = 1188 + i * 3.2 + (z > -1560 ? 41 - 3.2 * 3 : 0);
        b.at(x, z, 0, 0.6, 0.15);
        const wall = tint(0x9a9282, r, 0.12);
        k.box(2.9, 0.55 + r() * 0.35, 0.3, 0, 0, -1.35, wall);
        k.box(0.3, 0.45 + r() * 0.35, 2.7, -1.45, 0, 0, wall);
        if (r() < 0.6) k.box(0.3, 0.35 + r() * 0.3, 2.7, 1.45, 0, 0, tint(0x8a8474, r, 0.12));
        k.box(1.0, 0.12, 0.5, 0, 0, 1.2, tint(0xb0a690, r, 0.08));
        if (r() < 0.5) k.box(0.22, 1.1 + r() * 0.4, 0.22, -1.45, 0, -1.35, tint(0x7a7264, r, 0.1));
        k.cyl(0.1, 0.1, 0.03, 0, 0.5, -1.18, C.iron, [Math.PI / 2, 0, 0], 8);
        k.rock(0.45, 0.2, -0.05, 0.1, tint(0x6a7a4a, r, 0.2), 1000 + i, 0.3);
      }
    }
    // the dogs' bowls in a row, as if somebody still fed them (enamel, chipped); straw; one old
    // kennel still standing
    for (let i = 0; i < 14; i++) {
      const x = 1196 + i * 1.6;
      const z = -1580 + Math.sin(i * 0.7) * 0.3;
      b.at(x, z, 0, 0.2, 0.0);
      const enamel = [0xd8d2c4, 0x7a96b0, 0xb8a888][i % 3]!;
      k.cyl(0.24, 0.17, 0.12, 0, 0, 0, enamel, undefined, 12);
      k.cyl(0.245, 0.245, 0.02, 0, 0.11, 0, 0x2a3442, undefined, 12);
      k.cyl(0.19, 0.19, 0.012, 0, 0.1, 0, i % 4 === 1 ? 0x3a4a52 : 0x5a4636, undefined, 12);
    }
    for (const [x, z, s] of [[1200, -1566, 1101], [1232, -1585, 1102], [1240, -1561, 1103], [1214, -1586, 1106]] as const) {
      b.at(x, z, 0, 1.2);
      straw(k, s, false);
    }
    b.at(1226, -1590.5, 0, 0.6);
    kennel(k, 1104);
    b.box(1226, -1590.5, 0, 0.6, 0.75);
    // a board where the way comes in: what stood here
    {
      const x = 1250;
      const z = -1572;
      const y = b.at(x, z, 270, 0.4);
      k.box(0.12, 1.4, 0.12, -0.7, 0, 0, C.woodDark);
      k.box(0.12, 1.4, 0.12, 0.7, 0, 0, C.woodDark);
      k.box(1.7, 0.75, 0.06, 0, 0.95, -0.04, C.woodDark, [-0.25, 0, 0]);
      b.sign(x - 0.02, y + 1.32, z, 270, 1.55, 0.62, { text: 'Hier standen\ndie Hundezwinger', style: 'plate', lean: 0.25 });
      b.circle(x, z - 0.7, 0.12).circle(x, z + 0.7, 0.12);
    }
    // lanterns along the row (the finale is at night)
    for (const [x, z, s] of [[1250, -1578, 1105], [1192, -1572, 1107], [1224, -1561, 1108]] as const) {
      b.at(x, z, 0, 0.2);
      post(k, s);
      b.model('architecture.lantern', undefined, { x: 0.14, y: 0.66, scale: 0.85 });
      b.circle(x, z, 0.12);
      b.glow(x + 0.1, b.heightAt(x, z) + 1.15, z, 1.2, LANTERN);
    }
  },
};

// ---------------------------------------------------------------------------------------------
// The Ehrenhof's way to the garden (playtest round 2: testers ran into the corner where the
// Corps de logis meets the north wing, because Hanne stands straight beyond it). A finger post
// in that corner points to the Durchfahrt of the north wing, and lamps mark its arch on both sides.
// ---------------------------------------------------------------------------------------------

/** The north wing's carriage passage: the Ehrenhof door and the garden door (interiors' plan). */
export const DURCHFAHRT = { court: [1221.2, -1140.8] as [number, number], garden: [1218.2, -1159.1] as [number, number], nx: 0.16, nz: 0.99 };
/** The finger post in the corner. */
export const WEG_POST: [number, number] = [1243.5, -1139.2];

const ehrenhofWeg: SetDef = {
  id: 'ehrenhof-weg',
  eras: ['1789', '1793-02', '1793-07'],
  x: 1232,
  z: -1145,
  range: 240,
  build(b, o) {
    const k = b.kit;
    // the post faces the court (south-west); the finger points west, to the Durchfahrt
    const [px, pz] = WEG_POST;
    const deg = 215;
    const y = b.at(px, pz, deg, 0.3);
    k.box(0.14, 2.6, 0.14, 0, 0, 0, C.woodDark);
    k.cone(0.12, 0.18, 0, 2.6, 0, C.woodDark, 4);
    // the finger board: plank + point (local −x is the viewer's left = west)
    k.box(1.7, 0.46, 0.06, -0.75, 1.82, 0.08, C.woodDark);
    k.box(0.34, 0.34, 0.06, -1.6, 1.88, 0.08, C.woodDark, [0, 0, Math.PI / 4]);
    k.box(1.2, 0.3, 0.05, 0.45, 1.25, 0.08, C.woodDark);
    const f = face(deg);
    const lx = Math.cos(f);
    const lz = -Math.sin(f);
    const fx = Math.sin(f) * 0.12;
    const fz = Math.cos(f) * 0.12;
    b.sign(px - lx * 0.75 + fx, y + 2.05, pz - lz * 0.75 + fz, deg, 1.55, 0.42, { text: 'Zum Garten' });
    b.sign(px + lx * 0.45 + fx, y + 1.4, pz + lz * 0.45 + fz, deg, 1.12, 0.28, { text: 'durch die Durchfahrt', style: 'plate' });
    b.circle(px, pz, 0.15);
    // lamps either side of the arch, court and garden (lit at night, a warm hint by day)
    const night = o.era === '1793-02';
    for (const [dx, dz, s] of [[...DURCHFAHRT.court, 1], [...DURCHFAHRT.garden, -1]] as [number, number, number][]) {
      for (const side of [-2.3, 2.3]) {
        // along the wall: perpendicular to the door normal
        const x = dx + DURCHFAHRT.nx * 0.35 * s + DURCHFAHRT.nz * side;
        const z = dz + DURCHFAHRT.nz * 0.35 * s - DURCHFAHRT.nx * side;
        const g = b.heightAt(x, z);
        k.place(x, g + 3.0, z, Math.atan2(DURCHFAHRT.nx * s, DURCHFAHRT.nz * s));
        k.box(0.06, 0.06, 0.4, 0, 0.3, -0.15, C.iron);
        k.box(0.22, 0.32, 0.22, 0, 0, 0.06, C.iron);
        k.box(0.16, 0.24, 0.16, 0, 0.04, 0.06, 0xffd8a0, undefined, night ? 2.2 : 1.2);
        b.glow(x, g + 3.15, z, night ? 1.6 : 0.9, LANTERN);
      }
    }
  },
};

export const WORLD_SETS: readonly SetDef[] = [apfelallee, menagerie, festsaal, zwingerHeute, ehrenhofWeg, quelleSet, bleicheSet];
