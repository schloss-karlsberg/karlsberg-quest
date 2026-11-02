/**
 * The field station: a procedural forester's construction trailer ("Bauwagen") on the forest road
 * below the Karlsbergweiher dam (bible: loc.p.station 760/−930, moved onto the road at z ≈ −915).
 * Wooden planks, a barrel roof, a stove pipe with smoke, a surveyor's tripod, warm windows that
 * glow at dusk and night and spill light on the ground. Only shown in today's era.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ATMOS_GLSL, atmosphere } from '../../../world/atmosphere';

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
attribute float aEmit;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vEmit;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  vEmit = aEmit;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
precision highp float;
${ATMOS_GLSL}
uniform float uWarm;
uniform vec3 uOrigin;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying float vEmit;
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 alb = vColor;
  vec3 lp = vWorld - uOrigin;
  if (vEmit < 0.01) {
    // planks: horizontal boards on the walls, grain noise everywhere
    float board = abs(fract(lp.y * 5.2) - 0.5);
    alb *= mix(0.72, 1.0, smoothstep(0.0, 0.08, board));
    alb *= 0.82 + 0.3 * kqNoise(vec2(lp.x * 9.0 + lp.z * 9.0, lp.y * 1.3));
    alb *= 0.9 + 0.12 * kqFbm(lp.xz * 0.7 + lp.y);
  }
  float ao = mix(0.55, 1.0, smoothstep(0.2, 1.4, lp.y));
  vec3 col = kqLight(alb, n, vWorld, ao, 1.0);
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

type Part = { g: BufferGeometry; color: string; emit?: number };

function tint(g: BufferGeometry, color: string, emit = 0): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.deleteAttribute('uv');
  const n = ng.getAttribute('position').count;
  const c = new Color(color);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  ng.setAttribute('color', new BufferAttribute(col, 3));
  ng.setAttribute('aEmit', new BufferAttribute(new Float32Array(n).fill(emit), 1));
  return ng;
}

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

/** Trailer geometry in local coordinates (x along the trailer, +z = door side, y = up from ground). */
function trailerParts(): Part[] {
  const P: Part[] = [];
  const L = 7.2;
  const W = 2.5;
  const floor = 0.78;
  const H = 2.15;
  const wood = '#6f4a2c';
  const woodDark = '#3d2818';
  const green = '#45563a'; // forestry green paint, weathered
  const frame = '#2a1d14';
  // chassis + wheels
  P.push({ g: box(L - 0.6, 0.18, W - 0.5, 0, floor - 0.12, 0), color: '#26221d' });
  for (const x of [-2.2, 2.2])
    for (const z of [-1.0, 1.0]) {
      P.push({ g: cyl(0.4, 0.4, 0.22, x, 0.4, z, 16, Math.PI / 2), color: '#1d1b18' });
      P.push({ g: cyl(0.16, 0.16, 0.24, x, 0.4, z, 8, Math.PI / 2), color: '#7c3022' });
    }
  P.push({ g: box(2.0, 0.1, 0.1, -L / 2 - 0.9, 0.62, 0.35, 0, 0.35), color: '#26221d' });
  P.push({ g: box(2.0, 0.1, 0.1, -L / 2 - 0.9, 0.62, -0.35, 0, -0.35), color: '#26221d' });
  // body: walls (green planks), corner posts
  P.push({ g: box(L, H, W, 0, floor + H / 2, 0), color: green });
  for (const x of [-L / 2, L / 2]) for (const z of [-W / 2, W / 2]) P.push({ g: box(0.14, H + 0.05, 0.14, x, floor + H / 2, z), color: frame });
  P.push({ g: box(L + 0.1, 0.12, W + 0.1, 0, floor + 0.06, 0), color: woodDark });
  // barrel roof
  const roof = new CylinderGeometry(1.42, 1.42, L + 0.5, 20, 1, false, -Math.PI / 2, Math.PI);
  roof.rotateZ(Math.PI / 2);
  roof.scale(1, 0.32, 1);
  roof.translate(0, floor + H, 0);
  P.push({ g: roof, color: '#2f2b27' });
  // door (south side, right of centre) with steps
  P.push({ g: box(0.92, 1.85, 0.08, 0.6, floor + 0.95, W / 2 + 0.03), color: wood });
  P.push({ g: box(0.06, 0.06, 0.1, 0.95, floor + 0.95, W / 2 + 0.09), color: '#c49a4a' });
  P.push({ g: box(1.1, 0.12, 0.45, 0.6, 0.52, W / 2 + 0.32), color: woodDark });
  P.push({ g: box(1.1, 0.12, 0.45, 0.6, 0.22, W / 2 + 0.7), color: woodDark });
  // windows: warm emissive panes + dark frames (south ×2, north ×2, east ×1)
  const pane = '#ffb35c';
  const win = (x: number, z: number, side: 1 | -1, along: 'x' | 'z') => {
    const y = floor + 1.35;
    if (along === 'x') {
      P.push({ g: box(1.0, 0.75, 0.04, x, y, z + side * 0.02), color: pane, emit: 2.6 });
      P.push({ g: box(1.12, 0.08, 0.08, x, y + 0.41, z + side * 0.04), color: frame });
      P.push({ g: box(1.12, 0.08, 0.08, x, y - 0.41, z + side * 0.04), color: frame });
      P.push({ g: box(0.06, 0.8, 0.07, x, y, z + side * 0.05), color: frame });
      P.push({ g: box(1.0, 0.05, 0.07, x, y, z + side * 0.05), color: frame });
    } else {
      P.push({ g: box(0.04, 0.75, 0.9, x + side * 0.02, y, z), color: pane, emit: 2.6 });
      P.push({ g: box(0.07, 0.06, 0.9, x + side * 0.05, y, z), color: frame });
      P.push({ g: box(0.07, 0.8, 0.06, x + side * 0.05, y, z), color: frame });
    }
  };
  win(-1.9, W / 2, 1, 'x');
  win(-0.55, W / 2, 1, 'x');
  win(2.3, W / 2, 1, 'x');
  win(-1.5, -W / 2, -1, 'x');
  win(1.6, -W / 2, -1, 'x');
  win(L / 2, 0, 1, 'z');
  // stove pipe
  P.push({ g: cyl(0.09, 0.09, 1.3, -2.4, floor + H + 0.95, -0.4, 8), color: '#1b1917' });
  P.push({ g: cyl(0.2, 0.05, 0.18, -2.4, floor + H + 1.65, -0.4, 8), color: '#1b1917' });
  // door lantern
  P.push({ g: box(0.16, 0.24, 0.16, 1.25, floor + 1.95, W / 2 + 0.15), color: '#ffcf7a', emit: 4.0 });
  P.push({ g: box(0.22, 0.04, 0.22, 1.25, floor + 2.09, W / 2 + 0.15), color: '#1b1917' });
  // radio mast with a crossbar (Marlene's radio)
  P.push({ g: cyl(0.035, 0.05, 5.2, L / 2 - 0.3, floor + H + 2.0, -W / 2 + 0.2, 6), color: '#8a8580' });
  P.push({ g: box(0.7, 0.03, 0.03, L / 2 - 0.3, floor + H + 4.3, -W / 2 + 0.2), color: '#8a8580' });
  // firewood stack against the west wall
  for (let i = 0; i < 14; i++) {
    const row = Math.floor(i / 5);
    const k = i % 5;
    P.push({ g: cyl(0.12, 0.12, 0.9, -L / 2 - 0.45, 0.13 + row * 0.22, -0.7 + k * 0.27 + row * 0.12, 7, Math.PI / 2), color: i % 3 ? '#7a5634' : '#8d6a44' });
  }
  // surveyor's tripod + total station in front of the trailer
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const g = new CylinderGeometry(0.02, 0.025, 1.6, 5);
    g.translate(0, 0.8, 0);
    g.rotateZ(Math.sin(a) * 0.32);
    g.rotateX(Math.cos(a) * 0.32);
    g.translate(-2.4, 0, W / 2 + 3.1);
    P.push({ g, color: '#a8842a' });
  }
  P.push({ g: box(0.22, 0.26, 0.2, -2.4, 1.66, W / 2 + 3.1), color: '#2d4d6b' });
  P.push({ g: cyl(0.06, 0.06, 0.24, -2.4, 1.7, W / 2 + 3.1 + 0.15, 8, Math.PI / 2), color: '#1d1d1d' });
  // camp bench + crate
  P.push({ g: box(1.4, 0.06, 0.38, -1.4, 0.45, W / 2 + 1.0), color: wood });
  P.push({ g: box(0.06, 0.42, 0.3, -2.0, 0.22, W / 2 + 1.0), color: woodDark });
  P.push({ g: box(0.06, 0.42, 0.3, -0.8, 0.22, W / 2 + 1.0), color: woodDark });
  P.push({ g: box(0.5, 0.36, 0.4, 2.3, 0.18, W / 2 + 1.1, 0, 0.3), color: '#5a6b44' });
  return P;
}

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
      uniforms: { ...atmosphere, uWarm: { value: 0.6 }, uOrigin: { value: atmosphere.uCamPos.value.clone() } },
    });
    const geo = mergeGeometries(trailerParts().map((p) => tint(p.g, p.color, p.emit ?? 0)))!;
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
