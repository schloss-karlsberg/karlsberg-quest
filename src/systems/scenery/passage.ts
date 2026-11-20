/**
 * The Tempelzimmer's way out (bible 3.6 / 3.10 c) through the rotunda KB-B07 (research-wave
 * model). From the glass doors at the gallery's east end (≈ 1270.3 / −1226.8) an open colonnade
 * leads along the garden axis (azimuth 80.5) to the round temple room, through it and out by the
 * Ionic portico, three steps down into the garden (catalogue KB-B07: colonnade floor 348.8, three
 * steps up to the room's floor 349.7, the portico on that level, three steps down to ≈ 349.2).
 *
 * The model has all of it except a way through: the room's west and east glass doors are cut open
 * (a runtime patch of the palace shader, like the interiors' shell cut), the floors are handed to the
 * player as a world floor patch (`World.floorPatch`), and the collider lets the player in (pass
 * zones over the room and its two doors; the drum wall and the columns as solids). Intact eras only.
 *
 * Summer 1789: the rotunda is being built (research/11 §1.2, building accounts; catalogue build
 * year 1789; finished by 1793). The same patch then takes off the dome, the attic and the portico's
 * pediment; the bauplatz set (sets.ts) puts up the centering, the rough wall crown and a scaffold
 * round the drum (`rotundaSite`).
 */
import { type Mesh, type ShaderMaterial, Vector4 } from 'three';
import type { PassZone, Solid } from '../../world/collision';
import type { Kit } from './kit';
import { rng, tint } from './kit';
import { C } from './props';

/** The Tempelzimmer's glass doors (from the interiors' plan) and the garden axis through KB-B07. */
export const TEMPEL_DOOR = { x: 1270.34, z: -1226.78, nx: 0.98643, nz: -0.16416, floor: 348.8 };

/**
 * The rotunda on that axis (s: metres from the door): drum radius outside and inside, the room's
 * floor, the top of the entablature (where the 1789 shell ends) and the dome's crown.
 */
export const ROTUNDA = { s: 9.4, r: 5.25, inner: 4.8, floor: 349.7, cornice: 356.2, crown: 359.8 };

/**
 * The way along the axis: colonnade floor to `colonnade`, steps up to the west door (`stepsUp`),
 * the room, the east door, the portico to its front edge (`stylobate`), steps down to the garden
 * (`to`). `half`: half the clear width of the doors.
 */
export const PASSAGE = { from: 0.25, colonnade: 2.75, stepsUp: 4.3, doorW: 4.45, doorE: 14.35, stylobate: 17.6, to: 19.2, half: 1.3 };

/** Floors (catalogue KB-B07 / the model). */
const COLONNADE_FLOOR = TEMPEL_DOOR.floor;
/** Columns of the colonnade (two a side) and of the tetrastyle portico (s, q), radius. */
const COLUMNS: readonly [number, number][] = [
  [1.13, -2.18],
  [1.13, 2.18],
  [3.66, -2.18],
  [3.66, 2.18],
  [17.2, -2.76],
  [17.2, -0.88],
  [17.2, 0.88],
  [17.2, 2.76],
];
const COLUMN_R = 0.28;

/** Point at distance s along the axis, `side` metres to its right. */
export function passageAt(s: number, side = 0): [number, number] {
  const d = TEMPEL_DOOR;
  return [d.x + d.nx * s - d.nz * side, d.z + d.nz * s + d.nx * side];
}

/** (s, q) of a point: along the axis from the door, and to its right. */
export function passageCoords(x: number, z: number): [number, number] {
  const d = TEMPEL_DOOR;
  const dx = x - d.x;
  const dz = z - d.z;
  return [dx * d.nx + dz * d.nz, -dx * d.nz + dz * d.nx];
}

/**
 * The walking floor of the colonnade, the room and the portico at x/z, or null off them (terrain).
 * The steps are ramps (31° up into the room, the portico's down to the garden's terrain).
 */
export function passageFloor(x: number, z: number, terrain: number): number | null {
  // quick reject: the whole way lies within 21 m of the door
  if (Math.abs(x - TEMPEL_DOOR.x - 10) > 11 || Math.abs(z - TEMPEL_DOOR.z + 1.6) > 7) return null;
  const [s, q] = passageCoords(x, z);
  const aq = Math.abs(q);
  if (s < PASSAGE.from || s > PASSAGE.to || aq > ROTUNDA.inner) return null;
  if (s < PASSAGE.colonnade) return aq <= 2.5 ? COLONNADE_FLOOR : null;
  const rr = Math.hypot(s - ROTUNDA.s, q);
  if (rr <= ROTUNDA.inner) return ROTUNDA.floor;
  if (s < ROTUNDA.s) {
    // the three steps up between the colonnade's last columns, then the west door's threshold
    if (aq > 2.5) return null;
    if (aq > 1.9) return COLONNADE_FLOOR;
    if (s < PASSAGE.stepsUp) return COLONNADE_FLOOR + ((ROTUNDA.floor - COLONNADE_FLOOR) * (s - PASSAGE.colonnade)) / (PASSAGE.stepsUp - PASSAGE.colonnade);
    return ROTUNDA.floor;
  }
  // the east door's threshold and the portico, then its steps down to the garden
  if (s <= PASSAGE.stylobate) return aq <= 3.2 ? ROTUNDA.floor : null;
  if (aq > 3.5) return null;
  return ROTUNDA.floor + ((terrain - ROTUNDA.floor) * (s - PASSAGE.stylobate)) / (PASSAGE.to - PASSAGE.stylobate);
}

/**
 * Pass zones (for KB-B07's footprint index): the room and its two doors; solids: the drum wall
 * (inside face, open at the doors) and the eight columns.
 */
export function passageCollision(poly: number): { zones: PassZone[]; solids: Solid[] } {
  const d = TEMPEL_DOOR;
  const [cx, cz] = passageAt(ROTUNDA.s);
  const zones: PassZone[] = [{ poly, x: cx, z: cz, r: ROTUNDA.inner + 0.15 }];
  for (const s of [3.2, 4.0, 4.8, 5.6, 13.2, 14.0, 14.8, 15.6]) {
    const [x, z] = passageAt(s);
    zones.push({ poly, x, z, r: 1.75 });
  }
  const solids: Solid[] = [];
  // the drum wall as 36 short boxes round the inside (4.55 … 5.15 m), the doors left open
  const n = 36;
  const ring = ROTUNDA.inner + 0.05;
  const axis = Math.atan2(d.nz, d.nx);
  for (let i = 0; i < n; i++) {
    const phi = ((i + 0.5) / n) * Math.PI * 2 - Math.PI; // from the axis (east door at 0)
    if (Math.abs(phi) < 0.38 || Math.abs(Math.abs(phi) - Math.PI) < 0.38) continue;
    const a = axis + phi;
    const ux = -Math.sin(a);
    const uz = Math.cos(a);
    solids.push({ kind: 'box', x: cx + Math.cos(a) * ring, z: cz + Math.sin(a) * ring, ux, uz, hu: ring * Math.sin(Math.PI / n) + 0.02, hv: 0.3 });
  }
  for (const [s, q] of COLUMNS) {
    const [x, z] = passageAt(s, q);
    solids.push({ kind: 'circle', x, z, r: COLUMN_R });
  }
  return { zones, solids };
}

/**
 * Footings under the rotunda (intact eras, world space). The model's plinths end at 348.2 (colonnade,
 * portico) and 347.92 (the drum's red sandstone base), drawn for a terrain pad at ≈ 349.1; our 1789
 * terrain lies at 347.6 round the drum, so they would float up to 0.6 m. Foundation masonry continues
 * them down into the ground, inset 2 cm behind the model's faces.
 */
export function rotundaFooting(k: Kit, groundAt: (x: number, z: number) => number): void {
  const d = TEMPEL_DOOR;
  const stone = 0xcfc9ba;
  const red = 0xa65e4a;
  // local frame: +z along the axis (s), +x to its left (−q)
  k.place(d.x, 0, d.z, Math.atan2(d.nx, d.nz));
  const block = (s0: number, s1: number, hq: number, top: number, color: number) => {
    const g = [passageAt(s0, -hq), passageAt(s0, hq), passageAt(s1, -hq), passageAt(s1, hq), passageAt((s0 + s1) / 2, 0)].map((p) => groundAt(p[0], p[1]));
    const y0 = Math.min(...g) - 0.35;
    if (y0 < top - 0.05) k.box(hq * 2, top - y0, s1 - s0, 0, y0, (s0 + s1) / 2, color);
  };
  block(0.66, 4.33, 2.48, 348.22, stone); // the colonnade
  block(14.47, 18.81, 3.5, 348.22, stone); // the portico and its steps
  const ring = Array.from({ length: 16 }, (_, i) => rotundaAt(i * 22.5, 5.19)).map((p) => groundAt(p[0], p[1]));
  const y0 = Math.min(...ring) - 0.35;
  if (y0 < 347.89) k.cyl(5.18, 5.18, 347.94 - y0, 0, y0, ROTUNDA.s, red, undefined, 32);
}

/** A point round the rotunda: `phiDeg` from the garden axis (east door 0, south side positive), radius. */
export function rotundaAt(phiDeg: number, rad: number): [number, number] {
  const d = TEMPEL_DOOR;
  const [cx, cz] = passageAt(ROTUNDA.s);
  const a = Math.atan2(d.nz, d.nx) + (phiDeg * Math.PI) / 180;
  return [cx + Math.cos(a) * rad, cz + Math.sin(a) * rad];
}

/**
 * The 1789 shell (bauplatz set, world space): a rough top course on the drum where the entablature
 * ends, the dome's timber centering above the open room, and a scaffold round the drum's two flanks
 * (the colonnade's and the portico's sides stay free). Returns the scaffold's solids and the height
 * of its first deck on the north (−1) and south (+1) flank.
 */
export function rotundaSite(k: Kit, groundAt: (x: number, z: number) => number, seed: number): { solids: Solid[]; deck: Record<-1 | 1, number> } {
  const r = rng(seed);
  const d = TEMPEL_DOOR;
  const [cx, cz] = passageAt(ROTUNDA.s);
  const axis = Math.atan2(d.nz, d.nx);
  const at = (phi: number, rad: number): [number, number] => [cx + Math.cos(axis + phi) * rad, cz + Math.sin(axis + phi) * rad];
  const deck: Record<-1 | 1, number> = { [-1]: 0, [1]: 0 } as Record<-1 | 1, number>;
  k.place(0, 0, 0, 0);
  const top = ROTUNDA.cornice;
  // the wall crown: rough sandstone blocks laid on the cut drum, a few missing
  const crown = 28;
  for (let i = 0; i < crown; i++) {
    if (r() < 0.12) continue;
    const p0 = at((i / crown) * Math.PI * 2, (ROTUNDA.r + ROTUNDA.inner) / 2);
    const p1 = at(((i + 1) / crown) * Math.PI * 2, (ROTUNDA.r + ROTUNDA.inner) / 2);
    k.beam(p0[0], top + 0.12, p0[1], p1[0], top + 0.12 + (r() - 0.5) * 0.04, p1[1], 0.5, tint(C.sandstone, r, 0.1), 0.26);
  }
  // the centering: eight ribs from the wall head to a crown ring, two tie rings, some lagging
  const ribs = 8;
  const rise = ROTUNDA.crown - top - 0.4;
  const R0 = ROTUNDA.inner - 0.1;
  const rib = (phi: number, t: number): [number, number, number] => {
    const rad = Math.max(0.35, R0 * Math.cos((t * Math.PI) / 2));
    const [x, z] = at(phi, rad);
    return [x, top + 0.25 + rise * Math.sin((t * Math.PI) / 2), z];
  };
  const wood = (k0: number) => tint(C.woodGrey, r, k0);
  for (let i = 0; i < ribs; i++) {
    const phi = (i / ribs) * Math.PI * 2 + Math.PI / ribs;
    for (let j = 0; j < 5; j++) {
      const a = rib(phi, j / 5);
      const b = rib(phi, (j + 1) / 5);
      k.beam(a[0], a[1], a[2], b[0], b[1], b[2], 0.16, wood(0.12), 0.22);
    }
  }
  for (const t of [0.0, 0.45]) {
    for (let i = 0; i < 16; i++) {
      const a = rib((i / 16) * Math.PI * 2, t);
      const b = rib(((i + 1) / 16) * Math.PI * 2, t);
      k.beam(a[0], a[1], a[2], b[0], b[1], b[2], 0.12, wood(0.1), 0.14);
    }
  }
  k.cyl(0.45, 0.45, 0.3, cx, rib(0, 1)[1] - 0.1, cz, C.woodDark, undefined, 10);
  // lagging boards on two bays (the masons start the dome's shell from the springing)
  for (const bay of [1, 4]) {
    const p0 = (bay / ribs) * Math.PI * 2 + Math.PI / ribs;
    const p1 = p0 + (Math.PI * 2) / ribs;
    for (let j = 0; j < 6; j++) {
      const t = 0.05 + j * 0.09;
      const a = rib(p0, t);
      const b = rib(p1, t);
      k.beam(a[0], a[1] + 0.12, a[2], b[0], b[1] + 0.12, b[2], 0.3, tint(C.wood, r, 0.15), 0.04);
    }
  }
  // the scaffold on both flanks (65° … 145° from the axis): two rings of poles, ledgers every
  // 2.1 m, decks, braces, a ladder; its solids keep you off the poles
  const solids: Solid[] = [];
  const R1 = ROTUNDA.r + 0.5;
  const R2 = ROTUNDA.r + 1.85;
  for (const side of [-1, 1] as const) {
    const bays = 4;
    const f0 = (65 * Math.PI) / 180;
    const f1 = (145 * Math.PI) / 180;
    const phis = Array.from({ length: bays + 1 }, (_, i) => side * (f0 + ((f1 - f0) * i) / bays));
    const foot = Math.min(...phis.map((p) => groundAt(...at(p, R1))), ...phis.map((p) => groundAt(...at(p, R2))));
    const levels = [foot + 2.1, foot + 4.2, foot + 6.3, top - 0.2].filter((y, i, l) => i === l.length - 1 || y < top - 1.2);
    deck[side] = levels[0]! + 0.085;
    for (const p of phis) {
      for (const rad of [R1, R2]) {
        const [x, z] = at(p, rad);
        const g = groundAt(x, z);
        k.pole(x, g - 0.2, z, x + (r() - 0.5) * 0.08, top + 1.1, z + (r() - 0.5) * 0.08, 0.06, wood(0.1), 6);
      }
    }
    for (const y of levels) {
      for (let i = 0; i < bays; i++) {
        for (const rad of [R1, R2]) {
          const a = at(phis[i]!, rad);
          const b = at(phis[i + 1]!, rad);
          k.pole(a[0], y, a[1], b[0], y, b[1], 0.045, C.woodGrey, 5);
        }
        // putlogs across and three deck planks
        const a1 = at(phis[i]!, R1);
        const a2 = at(phis[i]!, R2);
        k.pole(a1[0], y, a1[1], a2[0], y, a2[1], 0.04, C.woodGrey, 5);
        for (let pl = 0; pl < 3; pl++) {
          const rad = R1 + 0.25 + pl * 0.42;
          const a = at(phis[i]!, rad);
          const b = at(phis[i + 1]!, rad);
          k.beam(a[0], y + 0.06, a[1], b[0], y + 0.06, b[1], 0.38, tint(C.wood, r, 0.18), 0.05);
        }
      }
    }
    // braces on the outer face, a ladder at the first bay
    for (let i = 0; i < bays; i++) {
      const a = at(phis[i]!, R2 + 0.07);
      const b = at(phis[i + 1]!, R2 + 0.07);
      k.pole(a[0], foot + 0.1, a[1], b[0], foot + 4.2, b[1], 0.035, C.woodGrey, 5);
    }
    {
      const p = (phis[0]! + phis[1]!) / 2;
      const [lx, lz] = at(p, R2 + 0.9);
      const [tx, tz] = at(p, R2 + 0.1);
      const tw = 0.22;
      const [ox, oz] = [-Math.sin(axis + p) * tw, Math.cos(axis + p) * tw];
      for (const sgn of [-1, 1]) k.pole(lx + ox * sgn, groundAt(lx, lz), lz + oz * sgn, tx + ox * sgn, foot + 2.4, tz + oz * sgn, 0.03, C.wood, 5);
    }
    // the solids: one box per bay over both pole rings
    for (let i = 0; i < bays; i++) {
      const a = at((phis[i]! + phis[i + 1]!) / 2, (R1 + R2) / 2);
      const t = axis + (phis[i]! + phis[i + 1]!) / 2;
      const chord = (R2 + 0.1) * Math.abs(Math.sin((phis[i + 1]! - phis[i]!) / 2)) + 0.1;
      solids.push({ kind: 'box', x: a[0], z: a[1], ux: -Math.sin(t), uz: Math.cos(t), hu: chord, hv: (R2 - R1) / 2 + 0.12 });
    }
  }
  return { solids, deck };
}

const DECL = /* glsl */ `
uniform vec4 uKqPassA;  // door x, z, axis ux, uz
uniform vec4 uKqPassB;  // door half width, y0, y1, building index (KB-B07; < 0: off)
uniform vec4 uKqPassS;  // along the axis: west door s0, s1; east door s0, s1
uniform vec4 uKqSite;   // 1789 building site (1/0), rotunda centre s, cornice y, pediment y
`;
const CUT = /* glsl */ `
  if (abs(vBld - uKqPassB.w) < 0.5) {
    vec2 kqPd = vWorld.xz - uKqPassA.xy;
    float kqS = dot(kqPd, uKqPassA.zw);
    float kqQ = dot(kqPd, vec2(-uKqPassA.w, uKqPassA.z));
    bool kqDoor = abs(kqQ) < uKqPassB.x && vWorld.y > uKqPassB.y && vWorld.y < uKqPassB.z && ((kqS > uKqPassS.x && kqS < uKqPassS.y) || (kqS > uKqPassS.z && kqS < uKqPassS.w));
    bool kqSite = uKqSite.x > 0.5 && ((length(vec2(kqS - uKqSite.y, kqQ)) < 5.75 && vWorld.y > uKqSite.z) || (kqS > uKqSite.y + 5.2 && vWorld.y > uKqSite.w));
    if (kqDoor || kqSite) discard;
  }
`;
const DECL_ANCHOR = 'varying vec3 vWorld;';
const CUT_ANCHOR = 'if (uOpacity < 1.0';

/** Patch the palace shader: KB-B07's glass doors open on the axis (and, in 1789, no dome). */
export function patchPalace(mesh: Mesh, b07: number): boolean {
  const m = mesh.material as ShaderMaterial;
  const u = m.uniforms;
  const d = TEMPEL_DOOR;
  const P = PASSAGE;
  u.uKqPassA = { value: new Vector4(d.x, d.z, d.nx, d.nz) };
  u.uKqPassB = { value: new Vector4(P.half + 0.02, ROTUNDA.floor + 0.02, 354.6, b07) };
  u.uKqPassS = { value: new Vector4(P.doorW - 0.45, P.doorW + 0.5, P.doorE - 0.45, P.doorE + 0.45) };
  u.uKqSite = { value: new Vector4(0, ROTUNDA.s, ROTUNDA.cornice, 354.95) };
  if (m.fragmentShader.includes('uKqPassA')) return true;
  if (!m.fragmentShader.includes(DECL_ANCHOR) || !m.fragmentShader.includes(CUT_ANCHOR)) return false;
  m.fragmentShader = m.fragmentShader.replace(DECL_ANCHOR, `${DECL_ANCHOR}\n${DECL}`).replace(CUT_ANCHOR, `${CUT}\n  ${CUT_ANCHOR}`);
  m.needsUpdate = true;
  return true;
}

/**
 * Open the doors of building `index` (KB-B07), or nothing (−10) where it is not wanted; `site`: the
 * 1789 building site (dome, attic and pediment taken off).
 */
export function setPassageCut(mesh: Mesh, index: number, site = false): void {
  const u = (mesh.material as ShaderMaterial).uniforms;
  const b = u.uKqPassB;
  if (b) (b.value as Vector4).w = index;
  const s = u.uKqSite;
  if (s) (s.value as Vector4).x = site ? 1 : 0;
}
