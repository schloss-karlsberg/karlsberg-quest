/**
 * The field station: a procedural forester's construction trailer ("Bauwagen") on the forest road
 * below the Karlsbergweiher dam (bible: loc.p.station 760/−930, moved onto the road at z ≈ −915).
 * Green painted board-and-batten walls on a steel chassis, a tin barrel roof with gutters, a stove
 * pipe with smoke, an awning, firewood, a surveyor's tripod, warm windows that glow at dusk and night
 * and spill light on the ground; CC0 table, stools and barrel round it on the medium / high tier
 * (textured via src/world/surfaces.ts). Only shown in today's era.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  type BufferAttribute,
  type BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  BufferGeometry as BG,
  Float32BufferAttribute,
  Color,
} from 'three';
import { ATMOS_GLSL, atmosphere } from '../../../world/atmosphere';
import { SURF, SURF_GLSL, surfaces } from '../../../world/surfaces';
import { Kit } from '../../scenery/kit';
import { instanceModels, placeMatrix } from '../../scenery/models';
import type { AssetLoader } from '../../../assets/loader';

export const STATION = {
  /** Trailer centre (local frame). */
  x: 760,
  z: -915,
  /** Long axis along x (east–west), door on the south side (+z). */
  yaw: 0,
  /** Hub radius around the trailer. */
  r: 15,
  /** Where the player stands in front of the door, looking north at it. */
  door: { x: 760.6, z: -910.4 },
  spawn: { x: 760, z: -902, yaw: 0 },
  halfLen: 3.7,
  halfWid: 1.35,
};

const VERT = /* glsl */ `
attribute vec3 color;
attribute float aGlow;
attribute float aSurf;
attribute vec2 aUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vEmit;
varying float vSurf;
varying vec2 vUv;
void main() {
  vSurf = aSurf - 1.0;
  vUv = aUv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  vEmit = aGlow;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
${SURF_GLSL}
uniform float uWarm;
uniform vec3 uOrigin;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vEmit;
varying float vSurf;
varying vec2 vUv;
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 alb = vColor;
  vec3 lp = vWorld - uOrigin;
  float ao = mix(0.55, 1.0, smoothstep(0.2, 1.4, lp.y));
  vec3 col;
  if (uSurfOn > 0.5 && vEmit < 0.01) {
    // textured (medium / high): painted boards, planks, tin, canvas; grime low down
    float rough = 0.85;
    float metal = 0.0;
    kqSurface(vSurf, vUv, vWorld, alb, n, rough, metal);
    alb *= mix(0.7, 1.0, smoothstep(0.3, 1.3, lp.y));
    alb *= 0.92 + 0.12 * kqFbm(lp.xz * 0.5 + lp.y * 0.3);
    col = kqLightPbr(alb, n, vWorld, ao, rough, metal);
  } else {
  if (vEmit < 0.01) {
    // planks: horizontal boards on the walls, grain noise everywhere
    float board = abs(fract(lp.y * 5.2) - 0.5);
    alb *= mix(0.72, 1.0, smoothstep(0.0, 0.08, board));
    alb *= 0.82 + 0.3 * kqNoise(vec2(lp.x * 9.0 + lp.z * 9.0, lp.y * 1.3));
    alb *= 0.9 + 0.12 * kqFbm(lp.xz * 0.7 + lp.y);
  }
  col = kqLight(alb, n, vWorld, ao, 1.0);
  }
  // warm interior light through the windows (flickers like a stove)
  float flick = 0.9 + 0.1 * sin(uTime * 7.3 + lp.x) * sin(uTime * 3.1);
  // squared colour keeps the glow orange instead of clipping to white under the night grade
  col += vColor * vColor * vEmit * uWarm * flick * 0.62;
  // light spill from the windows onto the outer walls near them
  gl_FragColor = vec4(kqFog(col, vWorld), 1.0);
}`;

const POOL_FRAG = /* glsl */ `
precision highp float;
uniform float uWarm;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  // two lobes in front of the windows, elongated towards the door side
  float a = exp(-dot(p - vec2(-0.32, 0.18), (p - vec2(-0.32, 0.18)) * vec2(3.2, 5.0)));
  float b = exp(-dot(p - vec2(0.36, 0.18), (p - vec2(0.36, 0.18)) * vec2(3.2, 5.0)));
  float c = exp(-dot(p - vec2(0.0, 0.0), p * vec2(1.2, 2.0))) * 0.35;
  float flick = 0.92 + 0.08 * sin(uTime * 6.1);
  // soft edge: nothing reaches the border of the quad
  float edge = 1.0 - smoothstep(0.45, 1.0, length(p * vec2(0.9, 1.1)));
  float v = (a + b + c) * edge * flick * max(uWarm - 0.25, 0.0);
  gl_FragColor = vec4(vec3(1.0, 0.42, 0.14) * v * 0.36, 1.0);
}`;

const POOL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

const SMOKE_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uSpeed;
varying float vAge;
void main() {
  float life = 9.0;
  float t = mod(uTime * uSpeed + aSeed * life, life);
  float age = t / life;
  vAge = age;
  vec3 p = position;
  p.y += t * 0.55;
  p.x += sin(aSeed * 31.0 + t * 0.5) * 0.25 * age * 4.0 + t * 0.18;
  p.z += cos(aSeed * 17.0 + t * 0.4) * 0.2 * age * 4.0;
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (40.0 + age * 160.0) / max(-mv.z, 1.0) * 6.0;
}`;
const SMOKE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSmokeColor;
varying float vAge;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d) * (1.0 - vAge) * smoothstep(0.0, 0.08, vAge) * 0.22;
  gl_FragColor = vec4(uSmokeColor, a);
}`;

type Part = { g: BufferGeometry; color: string; emit?: number; surf?: number };

const box = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
  const g = new BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
};
const cyl = (r0: number, r1: number, h: number, x: number, y: number, z: number, seg = 10, rx = 0, rz = 0) => {
  const g = new CylinderGeometry(r0, r1, h, seg);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
};

/**
 * Trailer geometry in local coordinates (x along the trailer, +z = door side, y = up from ground).
 * Every part names its surface layer (src/world/surfaces.ts): painted boards, raw planks, iron,
 * the tin roof, canvas; untextured on the low tier.
 */
function trailerParts(): Part[] {
  const P: Part[] = [];
  const L = 7.2;
  const W = 2.5;
  const floor = 0.78;
  const H = 2.15;
  const wood = '#6f4a2c';
  const woodDark = '#3d2818';
  const green = '#4a5c3c'; // forestry green paint, weathered
  const frame = '#2a1d14';
  const steel = '#26221d';
  const red = '#7c3022';
  const PAINT = SURF.PAINTED;
  const PLANK = SURF.PLANKS;
  const IRON = SURF.IRON;
  // chassis: two longerons, cross members, axles, steel disc wheels with tyres and mudguards
  for (const z of [-0.75, 0.75]) P.push({ g: box(L - 0.4, 0.16, 0.12, 0, floor - 0.14, z), color: steel, surf: IRON });
  for (let i = 0; i < 5; i++) P.push({ g: box(0.1, 0.1, W - 0.6, -L / 2 + 0.6 + i * ((L - 1.2) / 4), floor - 0.12, 0), color: steel, surf: IRON });
  for (const x of [-2.2, 2.2]) {
    P.push({ g: cyl(0.05, 0.05, W - 0.1, x, 0.42, 0, 8, Math.PI / 2), color: steel, surf: IRON });
    for (const z of [-1.0, 1.0]) {
      P.push({ g: cyl(0.42, 0.42, 0.2, x, 0.42, z, 20, Math.PI / 2), color: '#1d1b18' });
      P.push({ g: cyl(0.27, 0.27, 0.22, x, 0.42, z, 16, Math.PI / 2), color: red, surf: IRON });
      P.push({ g: cyl(0.07, 0.07, 0.26, x, 0.42, z, 8, Math.PI / 2), color: '#3a3632', surf: IRON });
      // mudguard: three bent plates over the wheel
      for (let k = -1; k <= 1; k++) {
        const a = k * 0.55;
        P.push({ g: box(0.36, 0.03, 0.26, x + Math.sin(a) * 0.5, 0.42 + Math.cos(a) * 0.5, z, 0, 0, -a), color: steel, surf: IRON });
      }
    }
  }
  // drawbar (A-frame) with the hitch eye, a jockey wheel
  P.push({ g: box(2.0, 0.09, 0.09, -L / 2 - 0.9, 0.62, 0.35, 0, 0.35), color: steel, surf: IRON });
  P.push({ g: box(2.0, 0.09, 0.09, -L / 2 - 0.9, 0.62, -0.35, 0, -0.35), color: steel, surf: IRON });
  P.push({ g: cyl(0.09, 0.09, 0.05, -L / 2 - 1.9, 0.62, 0, 12), color: steel, surf: IRON });
  P.push({ g: cyl(0.03, 0.03, 0.5, -L / 2 - 1.5, 0.37, 0, 6), color: '#3a3632', surf: IRON });
  P.push({ g: cyl(0.1, 0.1, 0.06, -L / 2 - 1.5, 0.1, 0, 12, Math.PI / 2), color: '#1d1b18' });
  // body: walls (green boards), corner posts, a sill beam, eaves trim
  P.push({ g: box(L, H, W, 0, floor + H / 2, 0), color: green, surf: PAINT });
  for (const x of [-L / 2, L / 2]) for (const z of [-W / 2, W / 2]) P.push({ g: box(0.14, H + 0.05, 0.14, x, floor + H / 2, z), color: frame, surf: PLANK });
  P.push({ g: box(L + 0.1, 0.14, W + 0.1, 0, floor + 0.07, 0), color: woodDark, surf: PLANK });
  for (const z of [-W / 2 - 0.03, W / 2 + 0.03]) P.push({ g: box(L + 0.12, 0.1, 0.05, 0, floor + H - 0.05, z), color: frame, surf: PLANK });
  // cover battens every 0.9 m (board-and-batten look), not across the door
  for (let x = -L / 2 + 0.9; x < L / 2 - 0.3; x += 0.9)
    for (const z of [-W / 2 - 0.015, W / 2 + 0.015]) if (Math.abs(x - 0.6) > 0.6 || z < 0) P.push({ g: box(0.06, H - 0.2, 0.03, x, floor + H / 2, z), color: '#3f4f33', surf: PAINT });
  // barrel roof (tin), ridge vent, rain gutters with a downpipe
  const roof = new CylinderGeometry(1.42, 1.42, L + 0.5, 24, 1, false, -Math.PI / 2, Math.PI);
  roof.rotateZ(Math.PI / 2);
  roof.scale(1, 0.32, 1);
  roof.translate(0, floor + H, 0);
  P.push({ g: roof, color: '#3a3733', surf: IRON });
  P.push({ g: box(0.5, 0.14, 0.4, 1.2, floor + H + 0.47, 0), color: '#2a2724', surf: IRON });
  for (const z of [-W / 2 - 0.12, W / 2 + 0.12]) P.push({ g: cyl(0.05, 0.05, L + 0.4, 0, floor + H + 0.02, z, 8, 0, Math.PI / 2), color: '#55504a', surf: IRON });
  P.push({ g: cyl(0.035, 0.035, H + 0.1, L / 2 + 0.05, floor + H / 2 - 0.05, W / 2 + 0.12, 6), color: '#55504a', surf: IRON });
  // door (south side, right of centre): frame, planked leaf with two ledges, handle, a lit pane, steps
  P.push({ g: box(1.08, 2.0, 0.06, 0.6, floor + 1.0, W / 2 + 0.03), color: frame, surf: PLANK });
  P.push({ g: box(0.92, 1.85, 0.08, 0.6, floor + 0.95, W / 2 + 0.05), color: wood, surf: PLANK });
  P.push({ g: box(0.86, 0.06, 0.03, 0.6, floor + 0.55, W / 2 + 0.1), color: woodDark, surf: PLANK });
  P.push({ g: box(0.86, 0.06, 0.03, 0.6, floor + 1.25, W / 2 + 0.1), color: woodDark, surf: PLANK });
  P.push({ g: box(0.06, 0.06, 0.1, 0.95, floor + 0.95, W / 2 + 0.11), color: '#c49a4a', surf: IRON });
  P.push({ g: box(0.4, 0.3, 0.02, 0.6, floor + 1.55, W / 2 + 0.1), color: '#ffb35c', emit: 1.6 });
  for (const sx of [0.05, 1.15]) P.push({ g: box(0.06, 0.12, 1.0, sx, 0.4, W / 2 + 0.55, -0.72), color: woodDark, surf: PLANK });
  P.push({ g: box(1.1, 0.06, 0.32, 0.6, 0.55, W / 2 + 0.34), color: wood, surf: PLANK });
  P.push({ g: box(1.1, 0.06, 0.32, 0.6, 0.26, W / 2 + 0.72), color: wood, surf: PLANK });
  // windows: warm emissive panes + frames + sills, open shutters on two of the south windows
  const pane = '#ffb35c';
  const win = (x: number, z: number, side: 1 | -1, along: 'x' | 'z', shutters = false) => {
    const y = floor + 1.35;
    if (along === 'x') {
      P.push({ g: box(1.0, 0.75, 0.04, x, y, z + side * 0.02), color: pane, emit: 2.6 });
      P.push({ g: box(1.12, 0.08, 0.08, x, y + 0.41, z + side * 0.04), color: frame, surf: PLANK });
      P.push({ g: box(1.2, 0.06, 0.14, x, y - 0.42, z + side * 0.07), color: frame, surf: PLANK });
      for (const dx of [-0.53, 0.53]) P.push({ g: box(0.07, 0.8, 0.07, x + dx, y, z + side * 0.04), color: frame, surf: PLANK });
      P.push({ g: box(0.05, 0.8, 0.07, x, y, z + side * 0.05), color: frame, surf: PLANK });
      P.push({ g: box(1.0, 0.05, 0.07, x, y, z + side * 0.05), color: frame, surf: PLANK });
      if (shutters) for (const dx of [-0.82, 0.82]) P.push({ g: box(0.52, 0.82, 0.04, x + dx, y, z + side * 0.04), color: '#3f4f33', surf: PAINT });
    } else {
      P.push({ g: box(0.04, 0.75, 0.9, x + side * 0.02, y, z), color: pane, emit: 2.6 });
      P.push({ g: box(0.07, 0.06, 0.9, x + side * 0.05, y, z), color: frame, surf: PLANK });
      P.push({ g: box(0.07, 0.8, 0.06, x + side * 0.05, y, z), color: frame, surf: PLANK });
      P.push({ g: box(0.14, 0.06, 1.0, x + side * 0.07, y - 0.42, z), color: frame, surf: PLANK });
      P.push({ g: box(0.08, 0.06, 1.02, x + side * 0.04, y + 0.41, z), color: frame, surf: PLANK });
    }
  };
  win(-1.9, W / 2, 1, 'x', true);
  win(-0.55, W / 2, 1, 'x');
  win(2.3, W / 2, 1, 'x', true);
  win(-1.5, -W / 2, -1, 'x');
  win(1.6, -W / 2, -1, 'x');
  win(L / 2, 0, 1, 'z');
  // stove pipe with a rain cap
  P.push({ g: cyl(0.09, 0.09, 1.3, -2.4, floor + H + 0.95, -0.4, 10), color: '#1b1917', surf: IRON });
  P.push({ g: cyl(0.22, 0.05, 0.16, -2.4, floor + H + 1.72, -0.4, 10), color: '#1b1917', surf: IRON });
  // door lantern on a bracket
  P.push({ g: box(0.04, 0.04, 0.25, 1.25, floor + 2.13, W / 2 + 0.12), color: '#1b1917', surf: IRON });
  P.push({ g: box(0.16, 0.24, 0.16, 1.25, floor + 1.95, W / 2 + 0.22), color: '#ffcf7a', emit: 4.0 });
  P.push({ g: box(0.22, 0.04, 0.22, 1.25, floor + 2.09, W / 2 + 0.22), color: '#1b1917', surf: IRON });
  P.push({ g: box(0.2, 0.03, 0.2, 1.25, floor + 1.82, W / 2 + 0.22), color: '#1b1917', surf: IRON });
  // radio mast with a crossbar (Marlene's radio)
  P.push({ g: cyl(0.035, 0.05, 5.2, L / 2 - 0.3, floor + H + 2.0, -W / 2 + 0.2, 6), color: '#8a8580', surf: IRON });
  P.push({ g: box(0.7, 0.03, 0.03, L / 2 - 0.3, floor + H + 4.3, -W / 2 + 0.2), color: '#8a8580', surf: IRON });
  // gas bottle at the drawbar end, a fire extinguisher by the door
  P.push({ g: cyl(0.16, 0.16, 0.85, -L / 2 - 0.45, floor + 0.25, 0.75, 14), color: '#9a3324', surf: IRON });
  P.push({ g: cyl(0.06, 0.08, 0.12, -L / 2 - 0.45, floor + 0.73, 0.75, 8), color: '#8a8580', surf: IRON });
  P.push({ g: cyl(0.08, 0.08, 0.5, 1.5, floor + 0.55, W / 2 + 0.1, 10), color: '#b02a1a', surf: IRON });
  // a canvas awning over the west half of the door side on two poles
  P.push({ g: box(3.4, 0.03, 1.8, -0.9, floor + H - 0.25, W / 2 + 0.9, -0.18), color: '#8d8475', surf: SURF.FABRIC });
  for (const x of [-2.5, 0.7]) P.push({ g: cyl(0.03, 0.03, floor + H - 0.45, x, (floor + H - 0.45) / 2, W / 2 + 1.75, 6), color: '#8a8580', surf: IRON });
  // firewood stack against the west wall under a tin sheet
  for (let i = 0; i < 18; i++) {
    const row = Math.floor(i / 6);
    const k = i % 6;
    P.push({ g: cyl(0.11, 0.12, 0.9, -L / 2 - 0.45, 0.13 + row * 0.21, -1.0 + k * 0.25 + (row % 2) * 0.12, 7, Math.PI / 2), color: i % 3 ? '#7a5634' : '#8d6a44', surf: PLANK });
  }
  P.push({ g: box(0.9, 0.04, 1.8, -L / 2 - 0.45, 0.85, -0.3, 0, 0, 0.1), color: '#3a3733', surf: IRON });
  // surveyor's tripod + total station in front of the trailer
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const g = new CylinderGeometry(0.022, 0.028, 1.6, 6);
    g.translate(0, 0.8, 0);
    g.rotateZ(Math.sin(a) * 0.32);
    g.rotateX(Math.cos(a) * 0.32);
    g.translate(-2.4, 0, W / 2 + 3.1);
    P.push({ g, color: '#a8842a', surf: SURF.FINEWOOD });
  }
  P.push({ g: cyl(0.1, 0.12, 0.05, -2.4, 1.55, W / 2 + 3.1, 10), color: '#3a3632', surf: IRON });
  P.push({ g: box(0.22, 0.26, 0.2, -2.4, 1.72, W / 2 + 3.1), color: '#d9a21e' });
  P.push({ g: box(0.12, 0.08, 0.02, -2.4, 1.74, W / 2 + 3.0 - 0.01), color: '#1d2a33' });
  P.push({ g: cyl(0.06, 0.06, 0.24, -2.4, 1.78, W / 2 + 3.1 + 0.15, 10, Math.PI / 2), color: '#1d1d1d', surf: IRON });
  // a painted crate by the door
  P.push({ g: box(0.5, 0.36, 0.4, 2.3, 0.18, W / 2 + 1.1, 0, 0.3), color: '#5a6b44', surf: PAINT });
  return P;
}

/** Merge the parts with the scenery kit: colour, glow, surface layer, UVs in metres. */
function trailerGeometry(): BufferGeometry {
  const k = new Kit();
  k.place(0, 0, 0, 0);
  // the kit linearises its hex once more (scenery palette convention): pre-encode so the trailer
  // keeps its own colours
  for (const p of trailerParts()) k.add(p.g, new Color(p.color).convertLinearToSRGB().getHex(), p.emit ?? 0, undefined, p.surf ?? SURF.NONE);
  return k.build();
}

/** The field table, camp stools, a crate and the rain barrel (CC0 models, medium / high tier), local frame. */
const STATION_PROPS: { id: string; x: number; z: number; yaw: number; scale?: number; y?: number }[] = [
  { id: 'architecture.fieldtable', x: -1.35, z: 2.55, yaw: 0.04 },
  { id: 'architecture.campstool', x: -1.9, z: 3.15, yaw: 0.5 },
  { id: 'architecture.campstool', x: -0.75, z: 3.2, yaw: -0.35 },
  { id: 'architecture.crate.lid', x: 2.25, z: 2.35, yaw: 0.3, y: 0.36, scale: 0.9 },
  { id: 'architecture.barrel', x: 3.95, z: 1.55, yaw: 0.8, scale: 0.85 },
  { id: 'architecture.bucket', x: 3.55, z: 2.0, yaw: 1.2 },
];

export class FieldStation {
  readonly object = new Group();
  readonly material: ShaderMaterial;
  private readonly poolMat: ShaderMaterial;
  private readonly smokeMat: ShaderMaterial;
  private readonly pool: Mesh;
  private warm = 0.6;

  constructor() {
    this.object.name = 'field-station';
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { ...atmosphere, ...surfaces, uWarm: { value: 0.6 }, uOrigin: { value: atmosphere.uCamPos.value.clone() } },
    });
    const geo = trailerGeometry();
    const mesh = new Mesh(geo, this.material);
    mesh.name = 'bauwagen';
    this.object.add(mesh);

    // light pool on the ground in front of the windows (draped on the terrain in place())
    this.poolMat = new ShaderMaterial({
      vertexShader: POOL_VERT,
      fragmentShader: POOL_FRAG,
      uniforms: { uWarm: { value: 0.6 }, uTime: atmosphere.uTime },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const pg = new PlaneGeometry(16, 12, 24, 18);
    pg.rotateX(-Math.PI / 2);
    this.pool = new Mesh(pg, this.poolMat);
    this.pool.name = 'station-light';
    this.pool.renderOrder = 2;
    this.pool.frustumCulled = false;

    // stove smoke
    const n = 46;
    const sg = new BG();
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = -2.4;
      pos[i * 3 + 1] = 0.78 + 2.15 + 1.75;
      pos[i * 3 + 2] = -0.4;
      seed[i] = i / n;
    }
    sg.setAttribute('position', new Float32BufferAttribute(pos, 3));
    sg.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
    this.smokeMat = new ShaderMaterial({
      vertexShader: SMOKE_VERT,
      fragmentShader: SMOKE_FRAG,
      uniforms: { uTime: atmosphere.uTime, uSpeed: { value: 1 }, uSmokeColor: { value: new Color('#9a9690') } },
      transparent: true,
      depthWrite: false,
    });
    const smoke = new Points(sg, this.smokeMat);
    smoke.frustumCulled = false;
    smoke.name = 'station-smoke';
    this.object.add(smoke);
  }

  /** Put the trailer on the terrain (call after era changes). */
  place(heightAt: (x: number, z: number) => number): void {
    const { x, z, halfLen, halfWid } = STATION;
    let hMin = Infinity;
    for (const dx of [-halfLen, 0, halfLen]) for (const dz of [-halfWid, halfWid]) hMin = Math.min(hMin, heightAt(x + dx, z + dz));
    this.object.position.set(x, hMin, z);
    this.object.rotation.y = STATION.yaw;
    (this.material.uniforms.uOrigin!.value as { set(a: number, b: number, c: number): void }).set(x, hMin, z);
    // drape the light pool on the ground in front of the door side
    const pos = this.pool.geometry.getAttribute('position') as BufferAttribute;
    const cx = x;
    const cz = z + 3.2;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i) + cx;
      const pz = pos.getZ(i) + cz;
      pos.setY(i, heightAt(px, pz) + 0.06);
    }
    pos.needsUpdate = true;
    this.pool.position.set(cx, 0, cz);
  }

  private dressed = false;

  /** Medium / high tier: the CC0 props round the trailer (table, stools, crate, barrel). */
  dress(assets: AssetLoader, detailed: boolean): void {
    if (!detailed || this.dressed) return;
    this.dressed = true;
    const g = new Group();
    g.name = 'station-props';
    this.object.add(g);
    void instanceModels(
      assets,
      STATION_PROPS.map((p) => ({ id: p.id, matrix: placeMatrix(p.x, p.y ?? 0, p.z, p.yaw, p.scale ?? 1) })),
      g,
    );
  }

  addTo(parent: { add(...o: (Group | Mesh)[]): unknown }): void {
    parent.add(this.object);
    parent.add(this.pool);
  }

  setVisible(v: boolean): void {
    this.object.visible = v;
    this.pool.visible = v;
  }

  /** Per frame: window warmth follows the darkness of the sky (stronger at dusk/night). */
  frame(dt: number, reducedMotion: boolean): void {
    const s = atmosphere.uSunColor.value;
    const lum = 0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b;
    const target = Math.min(1.25, Math.max(0.35, 1.35 - lum * 0.45));
    this.warm += (target - this.warm) * Math.min(1, dt * 1.5);
    this.material.uniforms.uWarm!.value = this.warm;
    this.poolMat.uniforms.uWarm!.value = this.warm;
    this.smokeMat.uniforms.uSpeed!.value = reducedMotion ? 0.4 : 1;
  }

  /** Push a point out of the trailer footprint (simple box collision). Returns null if outside. */
  static pushOut(px: number, pz: number, r = 0.45): { x: number; z: number } | null {
    const dx = px - STATION.x;
    const dz = pz - STATION.z;
    const hx = STATION.halfLen + 0.15 + r;
    const hz = STATION.halfWid + 0.15 + r;
    if (Math.abs(dx) >= hx || Math.abs(dz) >= hz) return null;
    const ox = hx - Math.abs(dx);
    const oz = hz - Math.abs(dz);
    if (ox < oz) return { x: STATION.x + Math.sign(dx || 1) * hx, z: pz };
    return { x: px, z: STATION.z + Math.sign(dz || 1) * hz };
  }
}
