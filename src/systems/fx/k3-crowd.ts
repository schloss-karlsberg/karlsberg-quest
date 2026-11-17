/**
 * K3 set piece: the Ehrenhof on 28 July 1793 as a living memory (bible 3.1 / 3.6 / 3.7, playtest
 * round 4: "the empty courtyard with two rings"). Choreography in court coordinates (u from the
 * gate towards the Corps de logis, w across towards the south wing), evaluated as a pure function
 * of the scene clock — deterministic in `?manual` tests, nothing integrates:
 *
 *  - afternoon: a straw cart rolls in through the gate, stops, is unloaded, rolls out; soldiers
 *    carry bales from the parked carts into the ground floor (vestibule, south wing, Durchfahrt);
 *    villagers carry paintings, gilded chairs, clocks and sacks out of the doors and through the
 *    gate; guards at the doors and the gate.
 *  - dusk: the carts stand loaded; a crowd lines the railing and the wings, soldiers in a line
 *    before the Corps de logis; the cart where the Strohmann waits shivers, then bursts (the boss
 *    rises out of it); once it is down the commissioner stands on his cart with a burning torch.
 *  - torch (the `clue.k3.fackel` echo): the crowd chants, fists up; the commissioner raises the
 *    torch — the throw itself is k3-torch.
 *  - fire: plunderers run out of the burning doors with what they can carry, onlookers at the
 *    railing, the carts empty.
 *  - Jost runs off into the night with his horn (`k3:jost-run`).
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, Points, ShaderMaterial, Vector3 } from 'three';
import { atmosphere } from '../../world/atmosphere';
import { GHOST_KINDS, GhostBatch, type GhostKind, type GhostPose, ghostMaterial } from './k3-ghosts';

export type XZ = { x: number; z: number };
export type UW = [number, number];

/** The court frame: origin at the gate in the railing, u east along the axis, w across (south). */
export const COURT = {
  gate: { x: 1192.45, z: -1114.55 },
  e: { x: 0.987, z: -0.16 },
  s: { x: 0.16, z: 0.987 },
};

export function court(u: number, w: number): XZ {
  return { x: COURT.gate.x + u * COURT.e.x + w * COURT.s.x, z: COURT.gate.z + u * COURT.e.z + w * COURT.s.z };
}

/** Facing (radians, 0 = +z) of the court direction (du, dw). */
export function courtYaw(du: number, dw: number): number {
  const x = du * COURT.e.x + dw * COURT.s.x;
  const z = du * COURT.e.z + dw * COURT.s.z;
  return Math.atan2(x, z);
}

export type ScenePhase = 'off' | 'afternoon' | 'dusk' | 'fire';

export interface Walker {
  kind: GhostKind;
  path: UW[];
  /** m/s */
  speed: number;
  /** Pause (s) after the walk before the next appearance. */
  rest: number;
  /** Clock offset (s). */
  offset: number;
  /** Stride (m per leg cycle; shorter = running). */
  stride?: number;
}

export interface Stander {
  kind: GhostKind;
  at: UW;
  /** Facing as a court direction. */
  face: UW;
  /** 0 never raises an arm, 1 now and then, 2 chants with the crowd. */
  voice?: number;
}

export interface CartSpec {
  id: string;
  /** Parked: one point; rolling: the way in, then the way out. */
  at?: UW;
  face?: UW;
  pathIn?: UW[];
  stop?: number;
  pathOut?: UW[];
  speed?: number;
  rest?: number;
  offset?: number;
  load: number;
}

export interface Scene {
  walkers: Walker[];
  standers: Stander[];
  carts: CartSpec[];
}

const VEST: UW = [60.4, -0.3];
const B02D: UW = [37, 18.4];
const B03D: UW = [32.6, -18.6];
const OUT: UW = [-24, 0];
/** Where the Strohmann rises (its spawn, 1222/−1114): the load of cart C0. */
export const STROH_CART: UW = [30, 5.3];
/** The commissioner's cart; he stands on its bed (bible 3.7: "auf einem Karren"). */
export const KOMMISSAR_CART: UW = [36.5, -3];

const P1: UW = [17, -6];
const P2: UW = [14, 14];

function ring<T>(n: number, f: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => f(i));
}

export const AFTERNOON: Scene = {
  carts: [
    { id: 'p1', at: P1, face: [1, -0.15], load: 0.75 },
    { id: 'p2', at: P2, face: [1, 0.1], load: 0.9 },
    {
      id: 'r1',
      pathIn: [[-26, 1.4], [0, 1.4], [10, -2], [24, -11]],
      stop: 16,
      pathOut: [[36, -9], [44, 0], [40, 9], [28, 11.5], [10, 5.5], [0, -1.2], [-26, -1.2]],
      speed: 1.7,
      rest: 5,
      offset: 3,
      load: 1,
    },
  ],
  walkers: [
    // straw into the ground floor
    { kind: 'bale', path: [[16, -3.8], [40, -1.6], VEST], speed: 1.25, rest: 3, offset: 0 },
    { kind: 'bale', path: [[16.5, -4.4], [40, -2.4], [VEST[0], VEST[1] - 0.8]], speed: 1.2, rest: 4, offset: 19 },
    { kind: 'bale', path: [[18.5, -8.2], B03D], speed: 1.25, rest: 5, offset: 6 },
    { kind: 'bale', path: [[17.5, -8.6], [B03D[0] + 0.8, B03D[1]]], speed: 1.2, rest: 3, offset: 16 },
    { kind: 'bale', path: [[16.5, 12.4], B02D], speed: 1.25, rest: 4, offset: 2 },
    { kind: 'bale', path: [[15.5, 12.0], [B02D[0] - 0.8, B02D[1]]], speed: 1.2, rest: 6, offset: 13 },
    // what the villages carry out (bible 3.1: "das Schloss freigegeben")
    { kind: 'painting', path: [VEST, [40, -3.2], [22, -1.6], [2, -0.4], OUT], speed: 1.3, rest: 6, offset: 4 },
    { kind: 'chair', path: [[VEST[0], VEST[1] + 0.7], [40, 1.2], [24, 1.6], [2, 0.8], OUT], speed: 1.25, rest: 8, offset: 21 },
    { kind: 'bundle', path: [B02D, [25, 10.5], [8, 3.4], [0, 0.6], OUT], speed: 1.35, rest: 5, offset: 9 },
    { kind: 'woman', path: [[B02D[0] + 0.7, B02D[1]], [26, 11.2], [9, 4], [0, 0.9], OUT], speed: 1.3, rest: 7, offset: 30 },
    { kind: 'painting', path: [B03D, [24, -12.5], [8, -2.8], [0, -0.7], OUT], speed: 1.3, rest: 4, offset: 14 },
    { kind: 'chair', path: [B02D, [26, 10], [8, 2.8], [0, 0.3], OUT], speed: 1.2, rest: 9, offset: 40 },
    { kind: 'bundle', path: [VEST, [42, -4], [22, -2.4], [2, -0.9], OUT], speed: 1.4, rest: 6, offset: 33 },
  ],
  standers: [
    { kind: 'soldier', at: [57.5, 3.6], face: [-1, 0] },
    { kind: 'soldier', at: [57.5, -4.4], face: [-1, 0] },
    { kind: 'soldier', at: [3.5, 3.4], face: [1, -0.2] },
    { kind: 'soldier', at: [3.5, -3.6], face: [1, 0.2] },
    { kind: 'soldier', at: [21, -2.2], face: [-0.4, -1] },
    { kind: 'soldier', at: [12.5, 10.2], face: [1, 0.6] },
    { kind: 'onlooker', at: [4.5, 9.5], face: [1, -0.3], voice: 1 },
    { kind: 'woman', at: [5.6, 11.4], face: [1, -0.5], voice: 1 },
    { kind: 'onlooker', at: [5, -11.5], face: [1, 0.4], voice: 1 },
    { kind: 'woman', at: [6.4, -12.8], face: [1, 0.6], voice: 1 },
    { kind: 'onlooker', at: [-3, 5.2], face: [1, -0.3], voice: 1 },
    { kind: 'woman', at: [-4.2, -5], face: [1, 0.2], voice: 1 },
    { kind: 'onlooker', at: [-5, 2], face: [1, 0], voice: 1 },
  ],
};

export const DUSK: Scene = {
  carts: [
    { id: 'p1', at: P1, face: [1, -0.15], load: 1 },
    { id: 'p2', at: P2, face: [1, 0.1], load: 1 },
    { id: 'c0', at: [STROH_CART[0] + 1, STROH_CART[1]], face: [1, 0], load: 1 },
    { id: 'k', at: [KOMMISSAR_CART[0], KOMMISSAR_CART[1] + 1], face: [0, -1], load: 0.25 },
  ],
  walkers: [],
  standers: [
    // the crowd along the railing, the wings and the gate
    ...ring(9, (i): Stander => ({ kind: i % 3 === 1 ? 'woman' : 'onlooker', at: [4 + (i % 2) * 1.6, -14 + i * 3.4], face: [1, 0], voice: 2 })),
    ...ring(6, (i): Stander => ({ kind: i % 2 ? 'woman' : 'onlooker', at: [8 + i * 4.2, 15.6 + (i % 2) * 1.2], face: [0.2, -1], voice: 2 })),
    ...ring(5, (i): Stander => ({ kind: i % 2 ? 'onlooker' : 'woman', at: [9 + i * 4.4, -15.6 - (i % 2) * 1.2], face: [0.2, 1], voice: 2 })),
    // soldiers in a line before the Corps de logis
    ...ring(6, (i): Stander => ({ kind: 'soldier', at: [55, -10 + i * 4], face: [-1, 0], voice: 0 })),
    { kind: 'soldier', at: [2.5, 3], face: [1, 0], voice: 0 },
    { kind: 'soldier', at: [2.5, -3], face: [1, 0], voice: 0 },
  ],
};

export const FIRE: Scene = {
  carts: [
    { id: 'p1', at: P1, face: [1, -0.15], load: 0.3 },
    { id: 'p2', at: P2, face: [1, 0.1], load: 0.25 },
    { id: 'c0', at: [STROH_CART[0] + 1, STROH_CART[1]], face: [1, 0], load: 0 },
    { id: 'k', at: [KOMMISSAR_CART[0], KOMMISSAR_CART[1] + 1], face: [0, -1], load: 0.1 },
  ],
  walkers: [
    // out of the burning doors with what they can carry, running
    { kind: 'painting', path: [VEST, [42, -2.5], [20, -1.2], [1, -0.3], OUT], speed: 2.5, rest: 4, offset: 0, stride: 1.9 },
    { kind: 'chair', path: [[VEST[0], VEST[1] + 0.8], [40, 1.6], [22, 2], [1, 0.8], OUT], speed: 2.3, rest: 6, offset: 7, stride: 1.9 },
    { kind: 'bundle', path: [[VEST[0], VEST[1] - 0.8], [41, -4.4], [21, -2.6], [1, -1], OUT], speed: 2.6, rest: 5, offset: 13, stride: 2 },
    { kind: 'woman', path: [B02D, [26, 10.5], [9, 3.6], [0, 0.8], OUT], speed: 2.2, rest: 5, offset: 3, stride: 1.8 },
    { kind: 'bundle', path: [[B02D[0] + 0.8, B02D[1]], [27, 11], [9, 4.2], [0, 1.1], OUT], speed: 2.5, rest: 7, offset: 11, stride: 2 },
    { kind: 'painting', path: [B03D, [24, -12], [8, -2.6], [0, -0.6], OUT], speed: 2.4, rest: 6, offset: 5, stride: 1.9 },
    { kind: 'chair', path: [[B03D[0] - 0.8, B03D[1]], [23, -12.6], [7, -3], [0, -1], OUT], speed: 2.2, rest: 8, offset: 16, stride: 1.9 },
  ],
  standers: [
    ...ring(7, (i): Stander => ({ kind: i % 3 === 1 ? 'woman' : 'onlooker', at: [3 + (i % 2) * 1.4, -13 + i * 4.2], face: [1, 0], voice: 1 })),
    { kind: 'soldier', at: [2.2, 3.2], face: [1, 0], voice: 0 },
    { kind: 'soldier', at: [2.2, -3.4], face: [1, 0], voice: 0 },
    { kind: 'soldier', at: [44, 12], face: [-0.6, -1], voice: 0 },
  ],
};

/** A second wave on the same ways, half a cycle later (a busy court, never in step). */
function doubled(list: Walker[], shift: number): Walker[] {
  return [...list, ...list.map((w, i) => ({ ...w, offset: w.offset + shift + i * 1.7, path: w.path.map(([u, ww]): UW => [u, ww + (i % 2 ? 0.7 : -0.7)]) }))];
}
AFTERNOON.walkers = doubled(AFTERNOON.walkers, 26);
FIRE.walkers = doubled(FIRE.walkers, 14);

export const SCENES: Record<Exclude<ScenePhase, 'off'>, Scene> = { afternoon: AFTERNOON, dusk: DUSK, fire: FIRE };

// ---------------------------------------------------------------------------------------------
// pure evaluation

export function pathLength(path: UW[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  return s;
}

/** Point at arc length s along a court path (clamped). */
export function pointAt(path: UW[], s: number): UW {
  let left = Math.max(0, s);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= l || i === path.length - 1) {
      const k = l > 1e-6 ? Math.min(1, left / l) : 0;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
    left -= l;
  }
  return path[path.length - 1] ?? [0, 0];
}

export interface Placed {
  u: number;
  w: number;
  /** Facing (radians, world). */
  yaw: number;
  /** Distance walked (m). */
  dist: number;
  fade: number;
  moving: boolean;
}

const FADE = 0.9;

/** A walker at scene time T: walks its path, fades in and out at the ends, rests, repeats. */
export function walkerAt(w: Walker, T: number): Placed {
  const len = pathLength(w.path);
  const travel = len / w.speed;
  const cycle = travel + w.rest;
  const local = (((T + w.offset) % cycle) + cycle) % cycle;
  if (local >= travel) return { u: 0, w: 0, yaw: 0, dist: 0, fade: 0, moving: false };
  const s = local * w.speed;
  const [u, ww] = pointAt(w.path, s);
  const a = pointAt(w.path, s - 0.7);
  const b = pointAt(w.path, s + 0.7);
  const yaw = courtYaw(b[0] - a[0], b[1] - a[1]);
  const fade = Math.max(0, Math.min(1, local / FADE, (travel - local) / FADE));
  return { u, w: ww, yaw, dist: s, fade, moving: true };
}

export interface CartPlaced extends Placed {
  load: number;
}

/** A cart at scene time T (parked, or rolling in, stopping to unload, rolling out). */
export function cartAt(c: CartSpec, T: number): CartPlaced {
  if (c.at) {
    const f = c.face ?? [1, 0];
    return { u: c.at[0], w: c.at[1], yaw: courtYaw(f[0], f[1]), dist: 0, fade: 1, moving: false, load: c.load };
  }
  const inP = c.pathIn ?? [[0, 0]];
  const outP = c.pathOut ?? [inP[inP.length - 1]!];
  const v = c.speed ?? 1.6;
  const lIn = pathLength(inP);
  const lOut = pathLength(outP);
  const tIn = lIn / v;
  const stop = c.stop ?? 10;
  const tOut = lOut / v;
  const cycle = tIn + stop + tOut + (c.rest ?? 4);
  const local = ((((T + (c.offset ?? 0)) % cycle) + cycle) % cycle);
  const along = (path: UW[], s: number): { u: number; w: number; yaw: number } => {
    const [u, w] = pointAt(path, s);
    const a = pointAt(path, s - 1.4);
    const b = pointAt(path, s + 1.4);
    return { u, w, yaw: courtYaw(b[0] - a[0], b[1] - a[1]) };
  };
  if (local < tIn) {
    const s = local * v;
    const p = along(inP, s);
    return { ...p, dist: s, fade: Math.min(1, local / 1.4), moving: true, load: c.load };
  }
  if (local < tIn + stop) {
    const p = along(inP, lIn);
    const k = (local - tIn) / stop;
    return { ...p, dist: lIn, fade: 1, moving: false, load: c.load * (1 - 0.6 * k) };
  }
  if (local < tIn + stop + tOut) {
    const s = (local - tIn - stop) * v;
    const p = along(outP, s);
    return { ...p, dist: lIn + s, fade: Math.max(0, Math.min(1, (tOut - (local - tIn - stop)) / 1.4)), moving: true, load: c.load * 0.4 };
  }
  return { u: 0, w: 0, yaw: 0, dist: 0, fade: 0, moving: false, load: 0 };
}

/** Arm raise of an onlooker: now and then (voice 1), or chanting with the crowd (voice 2 · chant). */
export function raiseAt(voice: number, seed: number, T: number, chant: number): number {
  if (!voice) return 0;
  const idle = Math.max(0, Math.sin(T * 0.23 + seed * 5.1) - 0.86) * 7;
  if (voice < 2) return Math.min(1, idle);
  // "Ça ira": fists up on the beat, a different lag per figure
  const beat = 0.5 + 0.5 * Math.sin(T * 4.4 + seed * 2.3);
  return Math.min(1, Math.max(idle, chant * (0.55 + 0.45 * beat)));
}

// ---------------------------------------------------------------------------------------------
// renderer

export interface CrowdInput {
  phase: ScenePhase;
  /** Scene clock (s). */
  T: number;
  heightAt: (x: number, z: number) => number;
  /** 0..1 how loudly the crowd chants (the torch echo). */
  chant: number;
  /** The Strohmann cart: 0 waiting (shivers), 1 burst (empty). */
  strohBurst: number;
  /** Seconds since it burst (straw flying), < 0 = not yet. */
  strohT: number;
  /** The commissioner stands on his cart. */
  commissioner: boolean;
  /** Torch arm 0 down … 1 up; −1 = the torch has left his hand. */
  torchRaise: number;
  /** Jost's run (seconds since it started, < 0 = none) and its way. */
  runT: number;
  run: XZ[] | null;
  /** Warm rim from the fire 0..1. */
  warm: number;
  reducedMotion: boolean;
}

const MAX: Record<GhostKind, number> = { soldier: 16, bale: 14, painting: 10, chair: 10, bundle: 10, onlooker: 20, woman: 16, commissioner: 1, runner: 1, cart: 6 };

const LIGHT_VERT = /* glsl */ `
uniform float uScale;
uniform float uTime;
attribute vec4 aLight; // size (m), intensity, seed, kind
varying float vI;
varying float vKind;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float fl = aLight.w > 0.5 ? 0.85 + 0.15 * sin(uTime * 3.1 + aLight.z) : 0.75 + 0.18 * sin(uTime * 17.0 + aLight.z * 9.0) + 0.1 * sin(uTime * 31.0 + aLight.z);
  vI = aLight.y * fl;
  vKind = aLight.w;
  gl_PointSize = clamp(aLight.x * uScale / max(-mv.z, 0.5) * fl, 2.0, 220.0);
  gl_Position = projectionMatrix * mv;
}
`;

const LIGHT_FRAG = /* glsl */ `
varying float vI;
varying float vKind;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  float core = exp(-r * r * 9.0);
  float halo = exp(-r * 3.2) * 0.45;
  vec3 col = vKind > 0.5 ? vec3(1.0, 0.72, 0.32) : mix(vec3(1.0, 0.32, 0.05), vec3(1.0, 0.85, 0.5), core);
  float a = (core * 1.4 + halo) * vI;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col * a, 1.0);
}
`;

const STRAW_N = 260;
/** The commissioner's torch arm at rest: held out forward. */
const TORCH_MIN = 0.5;

/** The ghost crowd of the Ehrenhof (one draw call per figure kind, plus lights and straw). */
export class Crowd {
  readonly object = new Group();
  private readonly batches = new Map<GhostKind, GhostBatch>();
  private readonly mat = ghostMaterial();
  private readonly lights: Points;
  private readonly lightPos = new Float32Array(8 * 3);
  private readonly lightAttr = new Float32Array(8 * 4);
  private readonly straw: Points;
  private readonly strawSeeds: Float32Array;
  private readonly pose: GhostPose = { x: 0, y: 0, z: 0, yaw: 0, walk: 0, walkAmt: 0, fade: 0, seed: 0, raise: 0, load: 0, wheel: 0, scale: 1 };
  /** Hand of the commissioner (world) — where the torch leaves from. */
  readonly hand = { x: 0, y: 0, z: 0, ok: false };
  counts: Record<string, number> = {};

  constructor() {
    this.object.name = 'k3-crowd';
    for (const k of GHOST_KINDS) {
      const b = new GhostBatch(k, MAX[k], this.mat);
      this.batches.set(k, b);
      this.object.add(b.mesh);
    }
    const lg = new BufferGeometry();
    lg.setAttribute('position', new BufferAttribute(this.lightPos, 3));
    lg.setAttribute('aLight', new BufferAttribute(this.lightAttr, 4));
    lg.setDrawRange(0, 0);
    this.lights = new Points(
      lg,
      new ShaderMaterial({
        vertexShader: LIGHT_VERT,
        fragmentShader: LIGHT_FRAG,
        uniforms: { uScale: { value: 600 }, uTime: atmosphere.uTime },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.lights.frustumCulled = false;
    this.lights.renderOrder = 7;
    this.object.add(this.lights);
    // straw bursting out of the cart when the Strohmann rises
    const sg = new BufferGeometry();
    this.strawSeeds = new Float32Array(STRAW_N * 4);
    for (let i = 0; i < STRAW_N; i++) {
      const h = (n: number) => {
        const x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453;
        return x - Math.floor(x);
      };
      this.strawSeeds.set([h(1), h(2), h(3), h(4)], i * 4);
    }
    sg.setAttribute('position', new BufferAttribute(new Float32Array(STRAW_N * 3), 3));
    sg.setAttribute('aSeed', new BufferAttribute(this.strawSeeds, 4));
    this.straw = new Points(
      sg,
      new ShaderMaterial({
        vertexShader: /* glsl */ `
          uniform float uT;
          uniform vec3 uFrom;
          uniform float uScale;
          attribute vec4 aSeed;
          varying float vA;
          varying float vS;
          void main() {
            float t = uT;
            float ang = aSeed.x * 6.2832;
            float sp = 3.0 + aSeed.y * 7.0;
            vec3 vel = vec3(cos(ang) * sp * 0.55, 6.0 + aSeed.z * 9.0, sin(ang) * sp * 0.55);
            float drag = 1.0 - exp(-t * 1.6);
            vec3 p = uFrom + vec3(cos(ang), 0.4 + aSeed.w, sin(ang)) * 0.8 + vel * drag / 1.6 + vec3(0.0, -2.2 * t * t * 0.5, 0.0);
            p.y = max(p.y, uFrom.y - 1.0);
            p.x += sin(t * 3.0 + aSeed.y * 20.0) * 0.4 * t;
            vA = (1.0 - smoothstep(1.2, 3.2 + aSeed.w * 1.5, t)) * step(0.0, t);
            vS = aSeed.z;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = clamp((0.09 + 0.08 * aSeed.w) * uScale / max(-mv.z, 0.5), 1.5, 26.0);
            gl_Position = vA < 0.01 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          varying float vS;
          void main() {
            vec2 q = gl_PointCoord - 0.5;
            // a stalk: thin, along a diagonal
            float d = abs(q.x * 0.7 - q.y * 0.7 + (vS - 0.5) * 0.3);
            float a = (1.0 - smoothstep(0.03, 0.09, d)) * (1.0 - smoothstep(0.3, 0.5, length(q))) * vA;
            if (a < 0.02) discard;
            gl_FragColor = vec4(mix(vec3(0.9, 0.62, 0.2), vec3(1.0, 0.86, 0.45), vS) * 1.4, a);
          }`,
        uniforms: { uT: { value: -1 }, uFrom: { value: new Vector3() }, uScale: { value: 600 } },
        transparent: true,
        depthWrite: false,
      }),
    );
    this.straw.frustumCulled = false;
    this.straw.visible = false;
    this.object.add(this.straw);
  }

  update(inp: CrowdInput, pointScale: number): void {
    for (const b of this.batches.values()) b.begin();
    let nl = 0;
    const addLight = (x: number, y: number, z: number, size: number, I: number, kind: number) => {
      if (nl >= 8) return;
      this.lightPos.set([x, y, z], nl * 3);
      this.lightAttr.set([size, I, nl * 1.7, kind], nl * 4);
      nl++;
    };
    this.hand.ok = false;
    this.mat.uniforms.uMotion!.value = inp.reducedMotion ? 0.35 : 1;
    this.mat.uniforms.uWarm!.value = inp.warm;
    if (inp.phase !== 'off') {
      const scene = SCENES[inp.phase];
      const T = inp.T;
      const H = inp.heightAt;
      const P = this.pose;
      // walkers
      scene.walkers.forEach((wk, i) => {
        const pl = walkerAt(wk, T);
        if (pl.fade <= 0) return;
        const p = court(pl.u, pl.w);
        Object.assign(P, { x: p.x, y: H(p.x, p.z), z: p.z, yaw: pl.yaw, walk: (pl.dist / (wk.stride ?? 1.35)) * Math.PI * 2, walkAmt: 1, fade: pl.fade, seed: i * 0.731 + 0.2, raise: 0, load: 1, wheel: 0, scale: 1 });
        this.batches.get(wk.kind)!.push(P);
      });
      // standers
      scene.standers.forEach((st, i) => {
        const p = court(st.at[0], st.at[1]);
        const seed = i * 0.613 + 0.4;
        const raise = st.kind === 'onlooker' || st.kind === 'woman' ? raiseAt(st.voice ?? 0, seed, T, inp.chant) : 0;
        Object.assign(P, { x: p.x, y: H(p.x, p.z), z: p.z, yaw: courtYaw(st.face[0], st.face[1]) + Math.sin(T * 0.13 + i) * 0.12, walk: T * 0.6 + i, walkAmt: 0.05, fade: 1, seed, raise, load: 1, wheel: 0, scale: 0.96 + ((i * 37) % 9) * 0.01 });
        this.batches.get(st.kind)!.push(P);
      });
      // carts
      for (const c of scene.carts) {
        const pl = cartAt(c, T);
        if (pl.fade <= 0) continue;
        const p = court(pl.u, pl.w);
        let load = pl.load;
        if (c.id === 'c0') {
          if (inp.strohBurst >= 1) load = 0;
          else load = 1 + (inp.reducedMotion ? 0 : 0.035 * Math.sin(T * 17) * Math.sin(T * 2.3));
        }
        Object.assign(P, { x: p.x, y: H(p.x, p.z), z: p.z, yaw: pl.yaw, walk: (pl.dist / 1.6) * Math.PI * 2, walkAmt: pl.moving ? 1 : 0, fade: pl.fade, seed: c.id.charCodeAt(0) * 0.1, raise: 0, load, wheel: -pl.dist / 0.62, scale: 1 });
        this.batches.get('cart')!.push(P);
        if (c.id === 'k' && inp.commissioner) {
          // he stands on the bed of the cart, facing the palace
          const bx = p.x - Math.sin(pl.yaw) * 1.0;
          const bz = p.z - Math.cos(pl.yaw) * 1.0;
          const by = H(p.x, p.z) + 1.04;
          const yaw = courtYaw(1, 0.05);
          const raise = TORCH_MIN + (1 - TORCH_MIN) * Math.max(0, inp.torchRaise);
          const sc = 1.04;
          Object.assign(P, { x: bx, y: by, z: bz, yaw, walk: 0, walkAmt: 0, fade: 1, seed: 3.3, raise, load: 1, wheel: 0, scale: sc });
          this.batches.get('commissioner')!.push(P);
          // the torch tip: (0.06, −0.99, 0.14) from the right shoulder, swung up about local x
          const a = -2.75 * raise;
          const ly = -0.99 * Math.cos(a) - 0.14 * Math.sin(a);
          const lz = -0.99 * Math.sin(a) + 0.14 * Math.cos(a);
          this.hand.x = bx + (Math.cos(yaw) * 0.27 + Math.sin(yaw) * lz) * sc;
          this.hand.y = by + (1.39 + ly) * sc;
          this.hand.z = bz + (-Math.sin(yaw) * 0.27 + Math.cos(yaw) * lz) * sc;
          this.hand.ok = true;
          if (inp.torchRaise >= 0) addLight(this.hand.x, this.hand.y + 0.15, this.hand.z, 1.1, 1.6, 0);
        }
      }
      // the straw of the Strohmann's cart flies
      const sm = this.straw.material as ShaderMaterial;
      if (inp.strohT >= 0 && inp.strohT < 6) {
        const c0 = court(STROH_CART[0], STROH_CART[1]);
        (sm.uniforms.uFrom!.value as Vector3).set(c0.x, H(c0.x, c0.z) + 1.4, c0.z);
        sm.uniforms.uT!.value = inp.strohT;
        sm.uniforms.uScale!.value = pointScale;
        this.straw.visible = true;
      } else this.straw.visible = false;
    } else this.straw.visible = false;
    // Jost runs into the night, his lantern swinging
    if (inp.run && inp.runT >= 0) {
      const path: UW[] = inp.run.map((p) => [p.x, p.z]);
      const len = pathLength(path);
      const s = inp.runT * 4.2;
      if (s < len) {
        const [x, z] = pointAt(path, s);
        const a = pointAt(path, s + 1);
        const yaw = Math.atan2(a[0] - x, a[1] - z);
        const fade = Math.min(1, inp.runT / 0.6, (len - s) / 12);
        const y = inp.heightAt(x, z);
        Object.assign(this.pose, { x, y, z, yaw, walk: (s / 2.1) * Math.PI * 2, walkAmt: 1, fade, seed: 7.7, raise: 0, load: 1, wheel: 0, scale: 1 });
        this.batches.get('runner')!.push(this.pose);
        const sw = Math.sin((s / 2.1) * Math.PI * 2) * 0.25;
        addLight(x + Math.cos(yaw) * 0.32 + Math.sin(yaw) * sw, y + 0.85, z - Math.sin(yaw) * 0.32 + Math.cos(yaw) * sw, 0.9, 1.3 * fade, 1);
      }
    }
    this.counts = {};
    for (const [k, b] of this.batches) {
      b.end();
      if (b.count) this.counts[k] = b.count;
    }
    const lg = this.lights.geometry;
    lg.setDrawRange(0, nl);
    (lg.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (lg.getAttribute('aLight') as BufferAttribute).needsUpdate = true;
    (this.lights.material as ShaderMaterial).uniforms.uScale!.value = pointScale;
  }

  dispose(): void {
    for (const b of this.batches.values()) b.dispose();
    this.mat.dispose();
    this.lights.geometry.dispose();
    (this.lights.material as ShaderMaterial).dispose();
    this.straw.geometry.dispose();
    (this.straw.material as ShaderMaterial).dispose();
  }
}
