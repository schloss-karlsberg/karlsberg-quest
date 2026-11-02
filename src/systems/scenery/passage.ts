/**
 * The Tempelzimmer's way out (bible 3.6 / 3.10 c): its glass doors (≈ 1270.3 / −1226.8) open
 * onto KB-B07, the pavilion that stands in for the rotunda. A vaulted passage is carved through
 * that pavilion to the garden: the palace shader discards KB-B07's own walls inside the passage
 * box (a runtime patch like the interiors' shell cut), the passage gets its own walls, vault and
 * floor, and the collider lets the player through (a pass zone along the axis, the side walls as
 * solids). Intact eras only (1789–1793); in the 1796 ruin the pavilion is a stub anyway.
 */
import { type Mesh, type ShaderMaterial, Vector4 } from 'three';
import type { PassZone, Solid } from '../../world/collision';
import type { Kit } from './kit';
import { C } from './props';

/** The door (from the interiors' plan) and its outward axis. */
export const TEMPEL_DOOR = { x: 1270.34, z: -1226.78, nx: 0.98643, nz: -0.16416, floor: 348.8 };
export const PASSAGE = { from: 0.25, to: 11.6, half: 1.45, y0: 346.6, y1: 351.7 };

/** Point at distance s along the passage axis. */
export function passageAt(s: number, side = 0): [number, number] {
  const d = TEMPEL_DOOR;
  return [d.x + d.nx * s - d.nz * side, d.z + d.nz * s + d.nx * side];
}

/** Pass zones (for KB-B07's footprint index) and the side-wall solids. */
export function passageCollision(poly: number): { zones: PassZone[]; solids: Solid[] } {
  const zones: PassZone[] = [];
  for (let s = 0.4; s <= PASSAGE.to + 0.8; s += 0.9) {
    const [x, z] = passageAt(s);
    zones.push({ poly, x, z, r: PASSAGE.half + 0.25 });
  }
  const d = TEMPEL_DOOR;
  const mid = (PASSAGE.from + PASSAGE.to) / 2;
  const half = (PASSAGE.to - PASSAGE.from) / 2;
  const solids: Solid[] = [];
  for (const side of [-1, 1]) {
    const [x, z] = passageAt(mid, side * (PASSAGE.half + 0.2));
    solids.push({ kind: 'box', x, z, ux: d.nx, uz: d.nz, hu: half, hv: 0.2 });
  }
  return { zones, solids };
}

/** Walls, vault, floor and the arched portal of the passage (world space). */
export function buildPassage(k: Kit, groundAt: (x: number, z: number) => number): void {
  const d = TEMPEL_DOOR;
  const yaw = Math.atan2(d.nx, d.nz);
  const [ox, oz] = passageAt(0);
  const g0 = groundAt(...passageAt(PASSAGE.to - 0.5));
  k.place(ox, 0, oz, yaw);
  // local frame: +z along the passage (outwards), x across
  const len = PASSAGE.to - PASSAGE.from;
  const zc = (PASSAGE.from + PASSAGE.to) / 2;
  const wallH = PASSAGE.y1 - PASSAGE.y0;
  for (const sx of [-1, 1]) {
    k.box(0.35, wallH, len, sx * (PASSAGE.half + 0.17), PASSAGE.y0, zc, C.plaster);
    // pilasters every 2.6 m
    for (let s = PASSAGE.from + 1.2; s < PASSAGE.to; s += 2.6) k.box(0.3, wallH - 1.2, 0.5, sx * (PASSAGE.half - 0.05), Math.min(g0, d.floor) - 0.2, s, 0xcfc4b0);
  }
  // barrel vault as 9 staves
  const R = PASSAGE.half + 0.1;
  const spring = PASSAGE.y1 - R - 0.05;
  for (let i = 0; i < 9; i++) {
    const a0 = (i / 9) * Math.PI;
    const a1 = ((i + 1) / 9) * Math.PI;
    const x0 = Math.cos(a0) * R;
    const y0 = spring + Math.sin(a0) * R;
    const x1 = Math.cos(a1) * R;
    const y1 = spring + Math.sin(a1) * R;
    const w = Math.hypot(x1 - x0, y1 - y0);
    k.box(w + 0.04, 0.12, len, (x0 + x1) / 2, (y0 + y1) / 2 - 0.06, zc, 0xd8cfc0, [0, 0, Math.atan2(y1 - y0, x1 - x0)]);
  }
  // stone floor: the steps down from the door, then flags at garden level
  const steps = 3;
  const top = d.floor;
  const low = Math.min(g0, top - 0.2);
  for (let i = 0; i < steps; i++) {
    const h = top - ((i + 1) * (top - low)) / (steps + 1);
    k.box(PASSAGE.half * 2, Math.max(0.05, h - PASSAGE.y0), 0.62, 0, PASSAGE.y0, PASSAGE.from + 0.4 + i * 0.62, C.sandstonePale);
  }
  k.box(PASSAGE.half * 2, Math.max(0.05, low - PASSAGE.y0 + 0.02), len - 2.2, 0, PASSAGE.y0, PASSAGE.from + 2.2 + (len - 2.2) / 2, 0xb8aa98);
  // the portal on the garden side: an arch frame proud of the facade
  const pz = PASSAGE.to - 0.1;
  for (const sx of [-1, 1]) k.box(0.55, spring - low + 0.1, 0.5, sx * (PASSAGE.half + 0.3), low - 0.1, pz, C.sandstonePale);
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI;
    k.box(0.5, 0.35, 0.5, Math.cos(a) * (R + 0.25), spring + Math.sin(a) * (R + 0.25) - 0.17, pz, C.sandstonePale, [0, 0, a - Math.PI / 2]);
  }
}

const DECL = /* glsl */ `
uniform vec4 uKqPassA;  // x, z, ux, uz
uniform vec4 uKqPassB;  // half length, half width, y0, y1
uniform float uKqPassBld;
`;
const CUT = /* glsl */ `
  if (abs(vBld - uKqPassBld) < 0.5) {
    vec2 kqPd = vWorld.xz - uKqPassA.xy;
    if (abs(dot(kqPd, uKqPassA.zw)) < uKqPassB.x && abs(dot(kqPd, vec2(-uKqPassA.w, uKqPassA.z))) < uKqPassB.y && vWorld.y > uKqPassB.z && vWorld.y < uKqPassB.w) discard;
  }
`;
const DECL_ANCHOR = 'varying vec3 vWorld;';
const CUT_ANCHOR = 'if (uOpacity < 1.0';

/** Patch the palace shader so KB-B07's walls open along the passage. */
export function patchPalace(mesh: Mesh, b07: number): boolean {
  const m = mesh.material as ShaderMaterial;
  const u = m.uniforms;
  const d = TEMPEL_DOOR;
  const mid = (PASSAGE.from + PASSAGE.to) / 2;
  const [cx, cz] = passageAt(mid);
  u.uKqPassA = { value: new Vector4(cx, cz, d.nx, d.nz) };
  u.uKqPassB = { value: new Vector4((PASSAGE.to - PASSAGE.from) / 2 + 0.6, PASSAGE.half + 0.12, PASSAGE.y0 - 2, PASSAGE.y1 - 0.02) };
  u.uKqPassBld = { value: b07 };
  if (m.fragmentShader.includes('uKqPassA')) return true;
  if (!m.fragmentShader.includes(DECL_ANCHOR) || !m.fragmentShader.includes(CUT_ANCHOR)) return false;
  m.fragmentShader = m.fragmentShader.replace(DECL_ANCHOR, `${DECL_ANCHOR}\n${DECL}`).replace(CUT_ANCHOR, `${CUT}\n  ${CUT_ANCHOR}`);
  m.needsUpdate = true;
  return true;
}

/** Cut the passage into building `index` (KB-B07), or nothing (−10) where it is not wanted. */
export function setPassageCut(mesh: Mesh, index: number): void {
  const b = (mesh.material as ShaderMaterial).uniforms.uKqPassBld;
  if (b) b.value = index;
}
