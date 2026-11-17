/**
 * K3 set piece "Die Fackel" (bible 3.7, `clue.k3.fackel`): the commissioner's torch flies in an
 * arc from his raised hand through a ground-floor window of the Corps de logis; glass bursts, the
 * straw behind it goes up, and then the ground-floor windows round the Ehrenhof catch one after
 * another — the panes glow from inside, flame sheets lick out of the openings and up the walls,
 * smoke pours out of the tops. Once the fire runs (`fire.active`) every one of them burns.
 *
 * Everything is a pure function of the sequence clock `t` (seconds since the throw), so the echo
 * can be scrubbed (`kq.chronik.advanceEcho`) and screenshots are deterministic. Instanced quads
 * (panes, flame sheets, smoke) + two point clouds (torch trail, impact sparks) + a small torch
 * mesh: five draw calls.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import type { Footprint } from '../../data/types';
import { pointInRing } from '../../world/collision';
import { ATMOS_GLSL, atmosphere } from '../../world/atmosphere';
import type { ShellOpening } from '../interiors/types';
import { quadInstanced } from './gl';
import { COURT, type XZ } from './k3-crowd';

/** Flight time of the torch (s). */
export const FLIGHT = 1.15;
/** Seconds between two windows catching. */
export const CATCH_STEP = 0.16;

export interface CourtWindow {
  building: string;
  /** Centre of the pane (world). */
  x: number;
  y: number;
  z: number;
  /** Outward normal (xz). */
  nx: number;
  nz: number;
  w: number;
  h: number;
}

/** Court coordinates (u, w) of a world point (inverse of `court`). */
export function toCourt(x: number, z: number): [number, number] {
  const dx = x - COURT.gate.x;
  const dz = z - COURT.gate.z;
  return [dx * COURT.e.x + dz * COURT.e.z, dx * COURT.s.x + dz * COURT.s.z];
}

/**
 * The ground-floor windows that face the Ehrenhof (Corps de logis, both wings), from the palace
 * model's own glass (`extractOpenings`). Pure.
 */
export function courtWindows(openings: readonly ShellOpening[], rings: ReadonlyMap<string, readonly [number, number][]>, floorTop = 349.6): CourtWindow[] {
  const out: CourtWindow[] = [];
  for (const o of openings) {
    if (o.kind !== 'window' || o.y0 > floorTop) continue;
    const ring = rings.get(o.building);
    if (!ring) continue;
    const len = Math.hypot(o.bx - o.ax, o.bz - o.az);
    if (len < 0.4 || o.y1 - o.y0 < 0.6) continue;
    const tx = (o.bx - o.ax) / len;
    const tz = (o.bz - o.az) / len;
    let nx = -tz;
    let nz = tx;
    const mx = (o.ax + o.bx) / 2;
    const mz = (o.az + o.bz) / 2;
    if (pointInRing(mx + nx * 0.8, mz + nz * 0.8, ring as [number, number][])) {
      nx = -nx;
      nz = -nz;
    }
    const [u, w] = toCourt(mx, mz);
    if (u < 3 || u > 64 || Math.abs(w) > 23) continue;
    // facing into the court: the normal points back towards its middle
    const [cu, cw] = toCourt(mx + nx, mz + nz);
    if (Math.hypot(cu - 32, cw) > Math.hypot(u - 32, w)) continue;
    const y = (o.y0 + o.y1) / 2;
    // a window is glass on both faces (and sometimes split panes): one per opening
    const dup = out.find((q) => q.building === o.building && Math.hypot(q.x - mx, q.z - mz) < 0.9 && Math.abs(q.y - y) < 0.8);
    if (dup) {
      dup.w = Math.max(dup.w, len);
      continue;
    }
    out.push({ building: o.building, x: mx, y, z: mz, nx, nz, w: len, h: o.y1 - o.y0 });
  }
  return out;
}

/** Order in which the windows catch: outward from the one the torch went through. Pure. */
export function igniteOrder(wins: readonly CourtWindow[], first: number): number[] {
  const f = wins[first];
  if (!f) return wins.map((_, i) => i);
  // along the facades: the same building first, then by distance
  return wins
    .map((w, i) => ({ i, d: Math.hypot(w.x - f.x, w.z - f.z) + (w.building === f.building ? 0 : 6) }))
    .sort((a, b) => a.d - b.d)
    .map((e) => e.i);
}

/** The window nearest to a world point. */
export function nearestWindow(wins: readonly CourtWindow[], x: number, z: number, building?: string): number {
  let best = -1;
  let bd = Infinity;
  wins.forEach((w, i) => {
    if (building && w.building !== building) return;
    const d = Math.hypot(w.x - x, w.z - z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Torch position at flight time t (0 … FLIGHT): a ballistic arc with its apex `lift` m up. */
export function torchArc(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, t: number, lift = 5): { x: number; y: number; z: number } {
  const k = Math.max(0, Math.min(1, t / FLIGHT));
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k + 4 * lift * k * (1 - k),
    z: from.z + (to.z - from.z) * k,
  };
}

// ---------------------------------------------------------------------------------------------
// shaders

const PANE_VERT = /* glsl */ `
${ATMOS_GLSL}
uniform float uT;
uniform float uAll;
attribute vec4 aWin;  // x, y, z, ignite time
attribute vec4 aDim;  // nx, nz, w, h
varying vec2 vQ;
varying float vI;
varying float vFlash;
varying float vSeed;
const vec2 EXP = vec2(2.2, 2.0);
void main() {
  float age = uT - aWin.w;
  float I = max(uAll, smoothstep(0.0, 0.55, age));
  vFlash = uAll > 0.5 ? 0.0 : exp(-max(age, 0.0) * 4.0) * step(0.0, age);
  vI = I;
  vSeed = aWin.w * 13.7 + aWin.x;
  vec3 n = vec3(aDim.x, 0.0, aDim.y);
  vec3 right = vec3(-aDim.y, 0.0, aDim.x);
  vec2 q = (position.xy - 0.5) * EXP;
  vec3 p = aWin.xyz + right * q.x * aDim.z + vec3(0.0, q.y * aDim.w, 0.0) + n * 0.06;
  vQ = q;
  gl_Position = I < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const PANE_FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform float uGain;
varying vec2 vQ;
varying float vI;
varying float vFlash;
varying float vSeed;
void main() {
  vec2 q = vQ;
  vec2 aq = abs(q);
  float inside = step(aq.x, 0.5) * step(aq.y, 0.5);
  float bars = max(step(abs(q.x), 0.03), max(step(abs(q.y - 0.12), 0.025), step(abs(q.y + 0.2), 0.025)));
  bars = max(bars, step(0.465, max(aq.x, aq.y)));
  float fl = kqNoise(vec2(uTime * 3.4 + vSeed, q.y * 2.5 - uTime * 2.1));
  float fl2 = kqNoise(vec2(q.x * 3.0 + vSeed * 3.0, q.y * 4.0 - uTime * 3.7));
  vec3 deep = vec3(0.55, 0.05, 0.0);
  vec3 hot = vec3(1.0, 0.36, 0.05);
  vec3 col = mix(deep, hot, clamp(fl * 0.7 + fl2 * 0.4 - (q.y + 0.5) * 0.35 + vFlash, 0.0, 1.0));
  float pane = inside * (1.0 - bars * 0.9);
  float lum = pane * vI * (0.55 + 0.8 * fl) + inside * vFlash * 3.0;
  vec2 o = max(aq - 0.5, 0.0) / vec2(0.55, 0.4);
  float halo = (1.0 - inside) * exp(-dot(o, o) * 2.6) * vI * (0.5 + 0.4 * fl);
  // light spilling up the wall above the opening
  halo += (1.0 - inside) * step(0.5, q.y) * exp(-(q.y - 0.5) * 1.6) * exp(-q.x * q.x * 5.0) * vI * 0.6;
  halo += exp(-dot(q, q) * 1.2) * vFlash * 2.0;
  vec3 c = col * (lum + halo * 0.9) * uGain;
  if (dot(c, c) < 1e-5) discard;
  gl_FragColor = vec4(c, 1.0);
}
`;

const SHEET_VERT = /* glsl */ `
${ATMOS_GLSL}
uniform float uT;
uniform float uAll;
attribute vec4 aWin;
attribute vec4 aDim;
varying vec2 vUv;
varying float vI;
varying float vSeed;
void main() {
  float age = uT - aWin.w - 0.35;
  float I = max(uAll, smoothstep(0.0, 0.9, age));
  vI = I;
  vSeed = fract(aWin.x * 0.731 + aWin.z * 0.37);
  vec3 n = vec3(aDim.x, 0.0, aDim.y);
  vec3 right = vec3(-aDim.y, 0.0, aDim.x);
  float H = aDim.w * (1.3 + 0.9 * vSeed) * (0.4 + 0.6 * I);
  float W = aDim.z * 1.6;
  vec2 q = position.xy;
  // the sheet starts in the upper part of the opening and leans out and up along the wall
  vec3 base = aWin.xyz + vec3(0.0, aDim.w * 0.1, 0.0) + n * 0.12;
  float lean = q.y * q.y * (0.9 + 0.5 * sin(uTime * 1.3 + vSeed * 9.0));
  vec3 p = base + right * (q.x - 0.5) * W * (1.0 - 0.35 * q.y) + vec3(0.0, q.y * H, 0.0) + n * lean;
  vUv = q;
  gl_Position = I < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const SHEET_FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform float uGain;
varying vec2 vUv;
varying float vI;
varying float vSeed;
void main() {
  float x = (vUv.x - 0.5) * 2.0;
  float y = vUv.y;
  float t = uTime;
  float n = kqFbm(vec2(vUv.x * 3.0 + vSeed * 17.0, y * 2.2 - t * 2.6 - vSeed * 5.0));
  float n2 = kqNoise(vec2(vUv.x * 7.0 - vSeed * 3.0, y * 5.0 - t * 5.5));
  // three ragged tongues out of one opening, each its own height
  float heat = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float cx = (fk - 1.0) * 0.55;
    float hk = 0.6 + 0.4 * kqNoise(vec2(vSeed * 9.0 + fk * 3.1, t * 0.7));
    float yy = y / hk;
    float xd = x - cx + (n - 0.5) * 1.0 * yy + sin(yy * 5.0 - t * 6.0 + fk * 2.0 + vSeed * 20.0) * 0.1 * yy;
    float width = mix(0.5, 0.03, pow(clamp(yy, 0.0, 1.0), 0.7)) * (0.6 + 0.8 * n);
    float shape = 1.0 - smoothstep(width * 0.3, width, abs(xd));
    float top = 1.0 - smoothstep(0.25 + 0.5 * n, 0.98, yy + (n2 - 0.5) * 0.35);
    heat = max(heat, shape * top);
  }
  float torn = smoothstep(0.15, 0.5, n2 + (1.0 - y) * 0.5);
  heat *= torn * (0.55 + 0.75 * n2) * smoothstep(0.0, 0.08, y);
  if (heat < 0.015) discard;
  vec3 col = mix(vec3(0.7, 0.07, 0.01), vec3(1.0, 0.34, 0.04), smoothstep(0.1, 0.45, heat));
  col = mix(col, vec3(1.0, 0.6, 0.22), smoothstep(0.6, 0.98, heat * (1.15 - y * 0.6)));
  gl_FragColor = vec4(col * heat * (0.6 + 0.7 * (1.0 - y)) * vI * uGain, 1.0);
}
`;

const SMOKE_VERT = /* glsl */ `
${ATMOS_GLSL}
uniform float uT;
uniform float uAll;
uniform vec2 uWind;
attribute vec4 aWin;
attribute vec4 aDim;
attribute float aPuff;
varying vec2 vUv;
varying float vA;
varying float vSeed;
varying float vLit;
void main() {
  float on = max(uAll, smoothstep(0.6, 2.0, uT - aWin.w));
  float life = 3.6 + fract(aPuff * 3.7) * 1.8;
  float age = fract(uTime / life + aPuff);
  vSeed = fract(aPuff * 7.13 + aWin.x * 0.1);
  vec3 n = vec3(aDim.x, 0.0, aDim.y);
  vec3 right = vec3(-aDim.y, 0.0, aDim.x);
  vec3 c = aWin.xyz + vec3(0.0, aDim.w * 0.45, 0.0) + n * (0.3 + age * 1.6) + right * (vSeed - 0.5) * aDim.z * 0.6;
  c.y += age * (5.0 + 5.0 * vSeed) + age * age * 4.0;
  c.xz += uWind * age * age * 7.0;
  float size = mix(0.9, 4.5 + 2.0 * vSeed, pow(age, 0.7));
  vec3 rgt = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec2 q = position.xy - 0.5;
  vec3 p = c + rgt * q.x * size + up * q.y * size;
  vUv = position.xy;
  vA = on * smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.55, 1.0, age));
  vLit = exp(-age * 3.0);
  gl_Position = vA < 0.003 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const SMOKE_FRAG = /* glsl */ `
${ATMOS_GLSL}
varying vec2 vUv;
varying float vA;
varying float vSeed;
varying float vLit;
void main() {
  vec2 q = vUv - 0.5;
  float n = kqFbm(vUv * 2.8 + vec2(vSeed * 11.0, -uTime * 0.2));
  float puff = smoothstep(0.5, 0.06, length(q) + (n - 0.5) * 0.35);
  float a = puff * vA * (0.5 + 0.55 * n) * 0.85;
  if (a < 0.004) discard;
  vec3 col = mix(vec3(0.03, 0.026, 0.022), vec3(0.08, 0.065, 0.055), n);
  col += vec3(1.2, 0.4, 0.08) * vLit * smoothstep(0.25, -0.3, q.y) * (0.6 + 0.6 * n);
  gl_FragColor = vec4(col, a);
}
`;

const SPARK_VERT = /* glsl */ `
uniform float uT;
uniform vec3 uFrom;
uniform vec3 uTo;
uniform float uScale;
uniform float uFlight;
uniform float uLift;
attribute vec4 aSeed; // kind (0 trail, 1 impact), r1, r2, r3
varying float vA;
varying float vHot;
vec3 arc(float k) {
  k = clamp(k, 0.0, 1.0);
  return mix(uFrom, uTo, k) + vec3(0.0, 4.0 * uLift * k * (1.0 - k), 0.0);
}
void main() {
  vec3 p;
  float size;
  if (aSeed.x < 0.5) {
    // the trail behind the torch: points left along the arc, sinking and fading
    float lag = aSeed.y * 0.42;
    float tt = uT - lag;
    p = arc(tt / uFlight) + vec3((aSeed.z - 0.5) * 0.3, -lag * lag * 3.0, (aSeed.w - 0.5) * 0.3);
    vA = step(0.0, tt) * step(uT, uFlight + 0.4) * (1.0 - aSeed.y) * (1.0 - smoothstep(uFlight, uFlight + 0.3, uT));
    vHot = 1.0 - aSeed.y;
    size = aSeed.y < 0.03 ? 1.1 : mix(0.55, 0.1, aSeed.y);
  } else {
    // glass and embers bursting out of the window
    float tt = uT - uFlight;
    float ang = aSeed.y * 6.2832;
    vec3 dir = normalize(vec3(cos(ang), 0.4 + aSeed.z * 1.4, sin(ang)));
    p = uTo + dir * (2.0 + aSeed.w * 6.0) * (1.0 - exp(-tt * 2.5)) + vec3(0.0, -2.5 * tt * tt, 0.0);
    vA = step(0.0, tt) * (1.0 - smoothstep(0.4, 1.4 + aSeed.w, tt));
    vHot = 1.0 - smoothstep(0.0, 0.8, tt);
    size = 0.09 + aSeed.z * 0.1;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(size * uScale / max(-mv.z, 0.5), 1.5, 90.0);
  gl_Position = vA < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
}
`;

const SPARK_FRAG = /* glsl */ `
uniform float uGain;
varying float vA;
varying float vHot;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  float a = exp(-r * r * 5.0) * vA;
  if (a < 0.01) discard;
  vec3 col = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.62, 0.2), vHot);
  gl_FragColor = vec4(col * a * 1.5 * uGain, 1.0);
}
`;

const PUFFS = 5;
const TRAIL = 70;
const BURST = 140;

/** The torch, the window that takes it, and the ground floor of the Ehrenhof catching. */
export class TorchStage {
  readonly object = new Group();
  wins: CourtWindow[] = [];
  /** Window the torch goes through. */
  first = -1;
  private panes: Mesh | null = null;
  private sheets: Mesh | null = null;
  private smoke: Mesh | null = null;
  private readonly sparks: Points;
  private readonly torch: Mesh;
  private readonly mats: ShaderMaterial[] = [];
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly lift = 5.5;
  readonly uT = { value: -100 };
  readonly uAll = { value: 0 };
  readonly uGain = { value: 1 };

  constructor() {
    this.object.name = 'k3-torch';
    const n = TRAIL + BURST;
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const h = (k: number) => {
        const x = Math.sin((i + 1) * 91.17 + k * 47.3) * 24634.6345;
        return x - Math.floor(x);
      };
      seeds.set([i < TRAIL ? 0 : 1, i < TRAIL ? i / TRAIL : h(1), h(2), h(3)], i * 4);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new BufferAttribute(seeds, 4));
    const sm = new ShaderMaterial({
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      uniforms: { uT: this.uT, uFrom: { value: this.from }, uTo: { value: this.to }, uScale: { value: 600 }, uFlight: { value: FLIGHT }, uLift: { value: this.lift }, uGain: this.uGain },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.mats.push(sm);
    this.sparks = new Points(g, sm);
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 9;
    this.sparks.visible = false;
    this.object.add(this.sparks);
    // the torch itself: a dark stick with a burning head (the flame is the trail's first point)
    const tg = new CylinderGeometry(0.035, 0.03, 0.7, 6);
    tg.translate(0, -0.3, 0);
    this.torch = new Mesh(tg, new MeshBasicMaterial({ color: 0x1a0d06 }));
    this.torch.visible = false;
    this.object.add(this.torch);
  }

  get ready(): boolean {
    return this.panes !== null;
  }

  /** Build the window layers (once the palace model and its openings are known). */
  build(wins: CourtWindow[], targetX: number, targetZ: number): void {
    this.disposeLayers();
    this.wins = wins;
    if (!wins.length) return;
    this.first = Math.max(0, nearestWindow(wins, targetX, targetZ, 'KB-B01'));
    const order = igniteOrder(wins, this.first);
    const rank = new Float32Array(wins.length);
    order.forEach((wi, r) => (rank[wi] = r));
    const n = wins.length;
    const aWin = new Float32Array(n * 4);
    const aDim = new Float32Array(n * 4);
    wins.forEach((w, i) => {
      const jitter = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 0.08;
      aWin.set([w.x, w.y, w.z, FLIGHT + rank[i]! * CATCH_STEP + Math.abs(jitter)], i * 4);
      aDim.set([w.nx, w.nz, w.w, w.h], i * 4);
    });
    const shared = { uT: this.uT, uAll: this.uAll, uGain: this.uGain };
    const mk = (vert: string, frag: string, normal: boolean, extra: Record<string, { value: unknown }> = {}) => {
      const m = new ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: { ...atmosphere, ...shared, ...extra },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: normal ? NormalBlending : AdditiveBlending,
      });
      return m;
    };
    const inst = (count: number, per = 1) => {
      const g = quadInstanced();
      const W = per === 1 ? aWin : repeat(aWin, per);
      const D = per === 1 ? aDim : repeat(aDim, per);
      g.setAttribute('aWin', new InstancedBufferAttribute(W, 4));
      g.setAttribute('aDim', new InstancedBufferAttribute(D, 4));
      if (per > 1) {
        const pf = new Float32Array(count);
        for (let i = 0; i < count; i++) pf[i] = (i % per) / per + Math.floor(i / per) * 0.137;
        g.setAttribute('aPuff', new InstancedBufferAttribute(pf, 1));
      }
      g.instanceCount = count;
      return g;
    };
    this.panes = new Mesh(inst(n), mk(PANE_VERT, PANE_FRAG, false));
    this.sheets = new Mesh(inst(n), mk(SHEET_VERT, SHEET_FRAG, false));
    this.smoke = new Mesh(inst(n * PUFFS, PUFFS), mk(SMOKE_VERT, SMOKE_FRAG, true, { uWind: { value: new Vector2(0.42, -0.12) } }));
    for (const [m, o] of [[this.panes, 8], [this.sheets, 9], [this.smoke, 7]] as const) {
      m.frustumCulled = false;
      m.renderOrder = o;
      this.object.add(m);
    }
  }

  /** Window the torch flies at (world). */
  target(): { x: number; y: number; z: number } | null {
    const w = this.wins[this.first];
    return w ? { x: w.x, y: w.y, z: w.z } : null;
  }

  /**
   * Per frame. `t` = seconds since the throw (< 0: not thrown, the panes dark); `all` = every
   * window burns (the fire runs). `hand` = where the torch leaves from.
   */
  update(t: number, all: number, hand: XZ & { y: number }, pointScale: number, reducedFlash: boolean): void {
    this.uT.value = t;
    this.uAll.value = all;
    this.uGain.value = reducedFlash ? 0.8 : 1;
    const tgt = this.target();
    const visible = all > 0.001 || t > -0.5;
    for (const m of [this.panes, this.sheets, this.smoke]) if (m) m.visible = visible;
    const flying = tgt !== null && t >= 0 && t < FLIGHT + 2.5 && all < 0.5;
    this.sparks.visible = flying;
    this.torch.visible = tgt !== null && t >= 0 && t < FLIGHT;
    if (!tgt) return;
    if (t < 0 || t < FLIGHT) this.from.set(hand.x, hand.y, hand.z);
    this.to.set(tgt.x, tgt.y, tgt.z);
    (this.sparks.material as ShaderMaterial).uniforms.uScale!.value = pointScale;
    if (this.torch.visible) {
      const p = torchArc(this.from, this.to, t, this.lift);
      this.torch.position.set(p.x, p.y, p.z);
      // end over end
      this.torch.rotation.set(t * 9.0, Math.atan2(this.to.x - this.from.x, this.to.z - this.from.z), 0);
    }
  }

  private disposeLayers(): void {
    for (const m of [this.panes, this.sheets, this.smoke]) {
      if (!m) continue;
      this.object.remove(m);
      m.geometry.dispose();
      (m.material as ShaderMaterial).dispose();
    }
    this.panes = this.sheets = this.smoke = null;
  }

  dispose(): void {
    this.disposeLayers();
    this.sparks.geometry.dispose();
    for (const m of this.mats) m.dispose();
    this.torch.geometry.dispose();
    (this.torch.material as MeshBasicMaterial).dispose();
  }
}

function repeat(a: Float32Array, per: number): Float32Array {
  const n = a.length / 4;
  const out = new Float32Array(n * per * 4);
  for (let i = 0; i < n; i++) for (let k = 0; k < per; k++) out.set(a.subarray(i * 4, i * 4 + 4), (i * per + k) * 4);
  return out;
}

/** Footprint rings by building id (for the outward normals). */
export function ringsOf(fps: readonly Footprint[], ids: readonly string[]): Map<string, [number, number][]> {
  const m = new Map<string, [number, number][]>();
  for (const f of fps) if (ids.includes(f.id)) m.set(f.id, f.ring as [number, number][]);
  return m;
}
