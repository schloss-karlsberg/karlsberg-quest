/**
 * The stand-in build of the fauna contract (./types.ts): a rigged CC0 Quaternius animal (the wolf
 * for the dogs, the horse for the roe deer; characters/catalog.ts models, lazy-loaded through
 * `ctx.assets` like the hunt's hounds and the Pikeur's horse) in the spec's colours, scaled to the
 * spec's SHOULDER height and nose-to-rump length, behind the `Animal` interface. The authored meshes
 * replace this file; the contract, the spec ids and the fauna system stay.
 *
 * Animation (one AnimationMixer per animal, weights set by hand, the people stand-in's scheme): idle
 * / walk / run blended by the ground speed the caller sets, feet phase-locked over the stride
 * MEASURED from each clip's paw track (the near-in-place Gallop takes a floor of two body lengths,
 * `RUN_STRIDE_PER_LENGTH`). Everything else is procedural on top of the clip, after the
 * mixer, in the holder's frame (the model's own frame: +z forward, y up, units of the model):
 * - head overlays on the neck / head bones: the species' head carriage (lifts the eyes to the spec's
 *   eye height), graze / sniff / sleep (nose to the ground, held there by a feedback on the measured
 *   nose height, never behind the forefeet), alert (head up, ears forward, the idle nearly frozen), the look-at;
 * - body poses (sit, lie, the front lowered for graze / sniff): the body bone pitched and lowered about the
 *   hips, every leg placed by a two-segment solver (`kneePoint`). The paws hang on the clip's IK
 *   control bones (not children of the legs), so after the legs are placed the paw bones are moved
 *   to the end of each leg: no stretched paws;
 * - one-shots: bark = the hit-react clip's head / neck tracks plus a head snap (a stand-in: no jaw),
 *   shake = a roll wave through head, chest and tail.
 * Bone overlays are put back before each evaluation (the mixer only writes values that changed). Clip
 * times are set directly and the mixer evaluates at dt 0, so the distance LOD only decides WHEN the
 * pose is evaluated (every frame / ~10 Hz / frozen); the clocks always run.
 *
 * Materials: the model's slots cloned per animal, recoloured, lit by the world (`kqStandard`); slots
 * a spec paints (`paint`) draw a vertex-coloured copy of the geometry that shares every attribute
 * with the asset (cached per model and spec, never disposed here, like the asset's own geometry).
 * The materials, the eye glints, the fallback capsule and the mixer's actions are disposed.
 */
import {
  AdditiveBlending,
  type AnimationAction,
  AnimationClip,
  AnimationMixer,
  type Bone,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  Group,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  type Skeleton,
  type SkinnedMesh,
  Sphere,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LoadedModel } from '../../assets/loader';
import { kqStandard } from '../../render/standard';
import type { CharacterModel } from '../characters/catalog';
import { Rig, rigInfo } from '../characters/rig';
import { FACE_SECONDS } from '../people/locomotion';
import {
  ANIMAL_HEAD,
  type AnimRate,
  type FootSample,
  type LocoGaits,
  type P3,
  advancePhase,
  animTick,
  carriageFor,
  easeWeight,
  easeYaw,
  gaitsFor,
  hash01,
  headAim,
  kneePoint,
  locoWeights,
  moveAmount,
  shotEnvelope,
  shotTarget,
  strideFromFeet,
  wrapPi,
} from './locomotion';
import { type FaunaSpec, type PaintVertex, type Species, paintColour, specNumbers } from './specs';
import { ANIMAL_CLIPS, type Animal, type AnimalClip, type AnimalInfo, type AnimalSpawnOpts, CLIP_FALLBACK, MOVE_OVERRIDE } from './types';

// ---- the stand-in clip map (one table: the authored build swaps it) ----------------------------

/** Source clips of the Quaternius wolf / horse (first one present wins). */
export const STANDIN_SOURCE = {
  idle: ['Idle'],
  walk: ['Walk'],
  run: ['Gallop'],
  jerk: ['Idle_HitReact_Left'],
} as const;

type LocoSrc = 'idle' | 'walk' | 'run';
export type HeadMode = 'graze' | 'sniff' | 'alert' | 'sleep';
export type PoseKind = 'sit' | 'lie' | 'nose';

export interface StandInPlan {
  /** A looping clip (idle under the speed-driven locomotion, plus overlays), or a one-shot over it. */
  kind: 'loop' | 'shot';
  /** Idle clock rate under the loop (alert: nearly frozen; lie / sleep: slower breathing). */
  tempo?: number;
  /** Head overlay. */
  head?: HeadMode;
  /** Body pose (bone offsets, legs placed by the solver). */
  pose?: PoseKind;
  /** One-shot look. */
  shot?: 'bark' | 'shake';
  /** A real clip of this build (listed in `info.clips`); false = a stand-in look for it. */
  native: boolean;
}

const LOCO: StandInPlan = { kind: 'loop', native: true };

/**
 * AnimalClip → what the stand-in plays, per species (a missing clip follows `CLIP_FALLBACK`):
 * - idle → Idle, walk → Walk, run → Gallop (both by `setSpeed`; `play('walk' | 'run')` only hands
 *   the body back to locomotion)
 * - graze (deer) → Idle, nose to the grass, chewing; a dog has none: its graze is its sniff
 * - sniff → Idle, nose down with a slow side-to-side drift and quick sniffs
 *   Both models' necks are short for their legs, so the head-down clips lower the front of the
 *   body too (pose 'nose'): the dog bends its elbows over planted paws, the deer sets its front
 *   legs a little forward
 * - alert → Idle nearly frozen (0.12×), head up, ears forward
 * - sit (dog) → pose: body pitched up about the hips, rump down, hind legs folded, front legs straight
 * - lie → pose: body lowered onto the belly, head up (dog: front legs forward like a sphinx, hind
 *   legs folded; deer: all four folded under)
 * - sleep → lie, head down onto the ground, slow breathing
 * - bark (dog) → a stand-in one-shot: Idle_HitReact_Left's head / neck tracks plus a head snap (no
 *   jaw: not in `info.clips`)
 * - shake (dog) → a stand-in one-shot: a roll wave through head, chest and tail (not in `info.clips`)
 */
export const STANDIN_CLIPS: Readonly<Record<Species, Readonly<Partial<Record<AnimalClip, StandInPlan>>>>> = {
  dog: {
    idle: LOCO,
    walk: LOCO,
    run: LOCO,
    sniff: { kind: 'loop', head: 'sniff', pose: 'nose', native: true },
    alert: { kind: 'loop', head: 'alert', tempo: 0.12, native: true },
    sit: { kind: 'loop', pose: 'sit', native: true },
    lie: { kind: 'loop', pose: 'lie', tempo: 0.8, native: true },
    sleep: { kind: 'loop', pose: 'lie', head: 'sleep', tempo: 0.45, native: true },
    bark: { kind: 'shot', shot: 'bark', native: false },
    shake: { kind: 'shot', shot: 'shake', native: false },
  },
  deer: {
    idle: LOCO,
    walk: LOCO,
    run: LOCO,
    graze: { kind: 'loop', head: 'graze', pose: 'nose', native: true },
    sniff: { kind: 'loop', head: 'sniff', pose: 'nose', native: true },
    alert: { kind: 'loop', head: 'alert', tempo: 0.12, native: true },
    lie: { kind: 'loop', pose: 'lie', tempo: 0.8, native: true },
    sleep: { kind: 'loop', pose: 'lie', head: 'sleep', tempo: 0.45, native: true },
  },
};

/** The clips the stand-in of a species really supports (`info.clips`), in contract order. */
export function standinSupported(species: Species): readonly AnimalClip[] {
  return ANIMAL_CLIPS.filter((c) => STANDIN_CLIPS[species][c]?.native === true);
}

const SUPPORTED: Readonly<Record<Species, readonly AnimalClip[]>> = { dog: standinSupported('dog'), deer: standinSupported('deer') };

/** The clip whose plan plays for `clip`: itself when the species has a plan (real or stand-in look), else along `CLIP_FALLBACK`. */
export function planClip(species: Species, clip: AnimalClip): AnimalClip {
  let c: AnimalClip | null = clip;
  for (let i = 0; c && i < 12; i++) {
    if (STANDIN_CLIPS[species][c]) return c;
    c = CLIP_FALLBACK[c];
  }
  return 'idle';
}

// ---- poses (fractions of the shoulder height S in the model frame) ------------------------------

export interface LegTarget {
  /** 'plant': the paw stays where the clip put it; 'place': at `at` from its hip / shoulder joint after the body moved. */
  mode: 'plant' | 'place';
  /** Front (place): the paw joint's forward offset from the shoulder joint and its height (S); null height = the bind paw height. */
  at?: [number, number | null];
  /** Hind (place): the hock's forward offset from the hip (negative: behind) and its height (S); the metatarsus runs forward from it to the paw's height. */
  hock?: [number, number];
  /** Bend direction of the middle joint (model frame z, y): the knee goes that way. */
  pole: [number, number];
  /** The paw / hoof: 'flat' keeps the clip's orientation (on the ground), 'follow' turns with the last segment (a folded hoof). */
  paw: 'flat' | 'follow';
}

export interface PoseDef {
  /** Body pitch (radians, + nose up) about the pivot. */
  pitch: number;
  pivot: 'hips' | 'shoulders';
  /** The pivot's height afterwards (S above the ground); null = it only pitches. */
  pivotY: number | null;
  front: LegTarget;
  hind: LegTarget;
  /** Neck pitch (radians, + chin down) keeping the head level against the body pitch. */
  neck: number;
  /** Tail root pitch (radians, + up): a sitting dog's tail lies along the ground, not through it. */
  tail: number;
}

/** Poses per species, measured on the Quaternius wolf / horse rigs (tests/fauna.test.ts checks feet, belly and rump against the ground). */
export const POSES: Readonly<Record<Species, Readonly<Partial<Record<PoseKind, PoseDef>>>>> = {
  dog: {
    // rump on the ground behind the hips, the spine ≈ 45° up, front legs nearly straight; hind:
    // thigh forward and up, shank down and back, hock on the ground, metatarsus flat forward
    sit: {
      pitch: 0.79,
      pivot: 'hips',
      pivotY: 0.22,
      front: { mode: 'place', at: [0.1, null], pole: [-1, -0.4], paw: 'flat' },
      hind: { mode: 'place', hock: [-0.21, 0.05], pole: [1, 0.7], paw: 'flat' },
      neck: 0.7,
      tail: 1.1,
    },
    // sphinx: belly on the ground, forearms flat forward, hind legs folded beside the belly
    lie: {
      pitch: 0.04,
      pivot: 'hips',
      pivotY: 0.27,
      front: { mode: 'place', at: [0.27, null], pole: [-1, -0.6], paw: 'flat' },
      hind: { mode: 'place', hock: [-0.17, 0.05], pole: [1, 0.6], paw: 'flat' },
      neck: -0.04,
      tail: 0.15,
    },
    // nose to the ground: the front of the body lowered, elbows bent, every paw planted
    nose: {
      pitch: -0.26,
      pivot: 'hips',
      pivotY: null,
      front: { mode: 'plant', pole: [-1, -0.3], paw: 'flat' },
      hind: { mode: 'plant', pole: [1, 0.3], paw: 'flat' },
      neck: 0,
      tail: 0.2,
    },
  },
  deer: {
    // bedded down: belly on the ground, front legs folded at the knee (cannons under the chest),
    // hind legs folded, hocks behind, cannons forward under the belly
    lie: {
      pitch: 0,
      pivot: 'hips',
      pivotY: 0.3,
      front: { mode: 'place', at: [0.1, 0.035], pole: [1, 0], paw: 'follow' },
      hind: { mode: 'place', hock: [-0.14, 0.035], pole: [1, 0.3], paw: 'follow' },
      neck: 0,
      tail: 0,
    },
    // grazing: the front lowered, the front legs set forward (a little bent at the knee), hind planted
    nose: {
      pitch: -0.2,
      pivot: 'hips',
      pivotY: null,
      front: { mode: 'place', at: [0.25, null], pole: [1, 0], paw: 'flat' },
      hind: { mode: 'plant', pole: [1, 0.3], paw: 'flat' },
      neck: 0,
      tail: 0,
    },
  },
};

/** Default weight fade (s) of `play()`. */
const DEFAULT_FADE = 0.25;
/** Seconds a looping clip played with `loop: false` lasts (then back to idle). */
const CYCLE: Partial<Record<AnimalClip, number>> = { graze: 5, sniff: 4, alert: 2.5, sit: 4, lie: 6, sleep: 8 };
/** One-shot lengths (s) of the procedural looks. */
const SHOT_LEN = { bark: 0.42, shake: 1.05 } as const;
/** Seconds a pose takes to get in / out of (95 %). */
const POSE_FADE = 0.7;
/** Nose height (fraction of S above the ground) the head-down overlays aim at. */
const NOSE_AT: Record<'graze' | 'sniff' | 'sleep', number> = { graze: 0.05, sniff: 0.07, sleep: 0.12 };
/** How far (fraction of S) the nose stays ahead of the forefeet' paw joints when down (a dog sniffs a head's length ahead). */
const NOSE_AHEAD: Record<Species, number> = { dog: 0.3, deer: 0.12 };
/** Bones of the head layer (one-shots over moving legs). */
const HEAD_TRACKS = /^(Neck|Head|Ear)/;

function splitClip(c: AnimationClip, head: boolean): AnimationClip {
  const tracks = c.tracks.filter((t) => HEAD_TRACKS.test(t.name.split('.')[0] ?? '') === head);
  return new AnimationClip(`${c.name}_${head ? 'head' : 'body'}`, c.duration, tracks);
}

interface ClipSet {
  loco: Record<LocoSrc, { body: AnimationClip; head: AnimationClip } | null>;
  jerk: AnimationClip | null;
}

const clipCache = new WeakMap<LoadedModel, ClipSet>();

function findClip(src: LoadedModel, names: readonly string[]): AnimationClip | null {
  for (const n of names) {
    const c = src.animations.find((a) => a.name === n);
    if (c) return c;
  }
  return null;
}

function clipsFor(src: LoadedModel): ClipSet {
  const hit = clipCache.get(src);
  if (hit) return hit;
  const loco = (k: LocoSrc) => {
    const c = findClip(src, STANDIN_SOURCE[k]);
    return c ? { body: splitClip(c, false), head: splitClip(c, true) } : null;
  };
  const j = findClip(src, STANDIN_SOURCE.jerk);
  const set: ClipSet = { loco: { idle: loco('idle'), walk: loco('walk'), run: loco('run') }, jerk: j ? splitClip(j, true) : null };
  clipCache.set(src, set);
  return set;
}

// ---- body measurements of a source model (bind pose, model units; cached) ------------------------

const TORSO = /^(Torso\d?|Back)$/;
const NOT_BODY = /^(Tail|Ear)/;

/** Bind-pose measurements of a quadruped model (model units = the holder's frame). */
export interface BodyInfo {
  /** Lowest point (the ground) and the top of the torso (withers / back). */
  minY: number;
  shoulder: number;
  /** Shoulder height above the ground. */
  S: number;
  /** Nose tip and rump (tail and ears left out) along z. */
  noseZ: number;
  rumpZ: number;
  /** Widest |x| of the torso. */
  halfWidth: number;
  /** The nose point in the head bone's frame (front of the head). */
  noseLocal: Vector3 | null;
}

const bodyCache = new WeakMap<LoadedModel, BodyInfo>();

/** The dominant bone of vertex i (largest skin weight). */
function dominant(m: SkinnedMesh, i: number): string {
  const si = m.geometry.getAttribute('skinIndex');
  const sw = m.geometry.getAttribute('skinWeight');
  if (!si || !sw) return '';
  let best = -1;
  let j = 0;
  for (let k = 0; k < si.itemSize; k++) {
    const w = sw.getComponent(i, k);
    if (w > best) {
      best = w;
      j = si.getComponent(i, k);
    }
  }
  return m.skeleton.bones[j]?.name ?? '';
}

export function bodyInfo(src: LoadedModel): BodyInfo {
  const hit = bodyCache.get(src);
  if (hit) return hit;
  const ri = rigInfo(src);
  src.scene.updateMatrixWorld(true);
  let shoulder = -Infinity;
  let noseZ = -Infinity;
  let rumpZ = Infinity;
  let half = 0;
  const v = new Vector3();
  const headPts: Vector3[] = [];
  let headBone: Bone | null = null;
  src.scene.traverse((o) => {
    if ((o as Bone).isBone && o.name === ri.head) headBone = o as Bone;
  });
  src.scene.traverse((o) => {
    const m = o as SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
      const b = dominant(m, i);
      if (TORSO.test(b)) {
        shoulder = Math.max(shoulder, v.y);
        half = Math.max(half, Math.abs(v.x));
      }
      if (NOT_BODY.test(b)) continue;
      if (b === ri.head) {
        noseZ = Math.max(noseZ, v.z);
        headPts.push(v.clone());
      }
      rumpZ = Math.min(rumpZ, v.z);
    }
  });
  if (!Number.isFinite(shoulder)) shoulder = ri.minY + ri.height * 0.8;
  if (!Number.isFinite(noseZ)) noseZ = ri.height * 0.5;
  if (!Number.isFinite(rumpZ)) rumpZ = -ri.height * 0.5;
  // the nose: the head's front-most vertices (within 6 % of the head's depth), averaged
  let noseLocal: Vector3 | null = null;
  const hb = headBone as Bone | null;
  if (hb && headPts.length) {
    let zmin = Infinity;
    for (const p of headPts) zmin = Math.min(zmin, p.z);
    const lim = noseZ - (noseZ - zmin) * 0.06;
    const c = new Vector3();
    let n = 0;
    for (const p of headPts)
      if (p.z >= lim) {
        c.add(p);
        n++;
      }
    if (n) noseLocal = c.multiplyScalar(1 / n).applyMatrix4(new Matrix4().copy(hb.matrixWorld).invert());
  }
  const info: BodyInfo = { minY: ri.minY, shoulder, S: Math.max(1e-6, shoulder - ri.minY), noseZ, rumpZ, halfWidth: Math.max(1e-6, half), noseLocal };
  bodyCache.set(src, info);
  return info;
}

// ---- vertex-coloured copies of painted slots (per model and spec, shared, never disposed) -----

const paintCache = new WeakMap<LoadedModel, Map<string, BufferGeometry>>();

/** The geometry of a painted slot: the asset's attributes plus a `color` attribute from the spec's paint rules. */
function paintedGeometry(src: LoadedModel, spec: FaunaSpec, mesh: SkinnedMesh, srcMesh: SkinnedMesh, slot: string, b: BodyInfo): BufferGeometry {
  let byKey = paintCache.get(src);
  if (!byKey) paintCache.set(src, (byKey = new Map()));
  const key = `${spec.id}|${mesh.name}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  const g0 = mesh.geometry;
  const g = new BufferGeometry();
  if (g0.index) g.setIndex(g0.index);
  for (const [n, a] of Object.entries(g0.attributes)) g.setAttribute(n, a);
  for (const gr of g0.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g.boundingBox = g0.boundingBox;
  g.boundingSphere = g0.boundingSphere;
  const pos = g0.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new Color();
  const v = new Vector3();
  src.scene.updateMatrixWorld(true);
  const lenZ = Math.max(1e-6, b.noseZ - b.rumpZ);
  const pv: PaintVertex = { slot, bone: '', fy: 0, fz: 0, ax: 0, px: 0, py: 0, pz: 0 };
  for (let i = 0; i < pos.count; i++) {
    srcMesh.getVertexPosition(i, v).applyMatrix4(srcMesh.matrixWorld);
    pv.bone = dominant(srcMesh, i);
    pv.fy = (v.y - b.minY) / b.S;
    pv.fz = (v.z - b.rumpZ) / lenZ;
    pv.ax = Math.abs(v.x) / b.halfWidth;
    pv.px = v.x / b.S;
    pv.py = (v.y - b.minY) / b.S;
    pv.pz = v.z / b.S;
    const hex = paintColour(spec, pv);
    c.setHex(hex ?? 0xffffff);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  byKey.set(key, g);
  return g;
}

// ---- strides --------------------------------------------------------------------------------------

/** Measured strides per source model (model units per loop) and whether they were measured. */
const strideCache = new WeakMap<LoadedModel, { walk: number; run: number; measured: boolean }>();

/** Fallback strides (per shoulder height per loop) when the paws cannot be measured. */
export const STRIDE_PER_SHOULDER = { walk: 1.1, run: 2.6 } as const;

/**
 * The run stride's floor (per metre of body length). The CC0 Gallop clips are stylized and nearly
 * in place: their paws cover about 1.1 body lengths per loop, so at the specs' run speeds (5–8 m/s)
 * the legs would cycle 6–8 times a second. Real gallops / bounds cover about two body lengths per
 * stride (3.5–4.5 Hz at those speeds): the run cycle takes that, and the planted paws slip a little
 * in the gallop's short stance (not visible at running speed). The walk keeps its measured stride.
 */
export const RUN_STRIDE_PER_LENGTH = 2;

function boneNamed(rig: Rig, name: string): Bone | null {
  return rig.bones.get(name) ?? rig.bones.get(name.replace(/([LR])$/, '.$1')) ?? null;
}

/**
 * The ground distance one loop of Walk / Gallop covers, measured once per source model on a fresh
 * rig (bind pose, root at the origin): the four paw control bones sampled through each clip in the
 * holder's frame (`strideFromFeet`). Model units; the bones are put back afterwards.
 */
export function measureStrides(rig: Rig, src: LoadedModel, b: BodyInfo): { walk: number; run: number; measured: boolean } {
  const hit = strideCache.get(src);
  if (hit) return hit;
  const out = { walk: STRIDE_PER_SHOULDER.walk * b.S, run: STRIDE_PER_SHOULDER.run * b.S, measured: false };
  const paws = ['IKFrontLegL', 'IKFrontLegR', 'IKBackLegL', 'IKBackLegR'].map((n) => boneNamed(rig, n));
  if (paws.every((p) => p)) {
    const snap = [...rig.bones.values()].map((x) => [x, x.position.clone(), x.quaternion.clone(), x.scale.clone()] as const);
    const mixer = new AnimationMixer(rig.model);
    rig.root.updateMatrixWorld(true);
    const inv = new Matrix4().copy(rig.holder.matrixWorld).invert();
    const v = new Vector3();
    for (const k of ['walk', 'run'] as const) {
      const clip = findClip(src, STANDIN_SOURCE[k]);
      if (!clip) continue;
      const a = mixer.clipAction(clip);
      a.play();
      const feet: FootSample[][] = paws.map(() => []);
      const N = 64;
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * clip.duration;
        a.time = t;
        mixer.update(0);
        rig.root.updateMatrixWorld(true);
        paws.forEach((p, j) => {
          p!.getWorldPosition(v).applyMatrix4(inv);
          feet[j]!.push({ t, y: v.y, z: v.z });
        });
      }
      a.stop();
      const s = strideFromFeet(feet, clip.duration);
      if (s !== null && s > 0.2 * b.S && s < 8 * b.S) {
        out[k] = s;
        out.measured = true;
      }
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(rig.model);
    for (const [x, p, q, s] of snap) {
      x.position.copy(p);
      x.quaternion.copy(q);
      x.scale.copy(s);
    }
    rig.root.updateMatrixWorld(true);
  }
  strideCache.set(src, out);
  return out;
}

// ---- the animal -----------------------------------------------------------------------------------

/** How the stand-in gets its models (the fauna system passes `ctx.assets`). */
export interface StandInLoader {
  model(id: CharacterModel): Promise<LoadedModel>;
  peek(id: CharacterModel): LoadedModel | null;
}

/** One frame of the fauna system for one animal. */
export interface AnimalTick {
  dt: number;
  rate: AnimRate;
  /** Beyond the draw limit. */
  hidden: boolean;
  reducedMotion: boolean;
}

/** Debug / test snapshot of an animal (`kq.fauna.get`). */
export interface AnimalState {
  id: string;
  specId: string;
  name: string;
  species: Species;
  x: number;
  y: number;
  z: number;
  /** Radians, player convention. */
  yaw: number;
  speed: number;
  /** The clip asked for last; the looping clip now; the clip whose plan plays (itself or its fallback); the one-shot playing. */
  clip: AnimalClip;
  base: AnimalClip;
  playing: AnimalClip;
  shot: AnimalClip | null;
  /** The playing plan is a stand-in look (not in `info.clips`). */
  substitute: boolean;
  visible: boolean;
  ready: boolean | null;
  fallback: boolean;
  lod: AnimRate;
  keepAlive: boolean;
  height: number;
  length: number;
  radius: number;
  headHeight: number;
  /** Strides the cycle uses (m per loop at this size); what the clips' paws measure; the speed (m/s) at which each clip plays at its own cadence. */
  stride: { walk: number; run: number; measured: boolean; raw: { walk: number; run: number }; cadence: { walk: number; run: number } };
  weights: Record<'idle' | 'walk' | 'run' | 'pose' | 'head' | 'alert' | 'jerk', number>;
  pose: PoseKind | null;
  head: { yaw: number; pitch: number; down: number; mode: HeadMode | null };
  /** Live eye point (m, world). */
  eye: { x: number; y: number; z: number };
  eyeShine: number;
  tris: number;
  drawCalls: number;
}

interface Part {
  mesh: Mesh;
  mat: MeshStandardMaterial;
  tris: number;
}

interface Base {
  clip: AnimalClip;
  /** The clip whose plan runs. */
  as: AnimalClip;
  plan: StandInPlan;
  loop: boolean;
  fade: number;
  speed: number;
  t: number;
}

interface Shot {
  clip: AnimalClip;
  as: AnimalClip;
  kind: 'bark' | 'shake';
  t: number;
  dur: number;
  speed: number;
  fade: number;
  loop: boolean;
}

interface Leg {
  hind: boolean;
  /** The two-segment part (front: upper arm, forearm; hind: thigh, shank) and the hind's metatarsus. */
  a: Bone;
  b: Bone;
  m: Bone | null;
  /** The paw / hoof control bone (the clip's IK target; the paw's vertices hang on it). */
  paw: Bone;
  /** Where the paw joint sits in the last segment's frame (bind). */
  endLocal: Vector3;
  la: number;
  lb: number;
  lm: number;
  /** Bind rotation of the paw relative to the last segment (paw 'follow'). */
  rel: Quaternion;
  /** Bind height of the paw joint (model units). */
  pawY: number;
}

const _v = new Vector3();
const _w = new Vector3();
const _u = new Vector3();
const _p = new Vector3();
const _s = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _pq = new Quaternion();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _m3 = new Matrix4();
const _hInv = new Matrix4();
const AX = new Vector3(1, 0, 0);
const AY = new Vector3(0, 1, 0);
const AZ = new Vector3(0, 0, 1);

let autoSeed = 0;

export class StandInAnimal implements Animal {
  readonly root = new Group();
  readonly info: AnimalInfo;
  readonly ready: Promise<boolean>;
  readonly name: string;
  readonly keepAlive: boolean;
  readonly species: Species;
  private resolveReady: (ok: boolean) => void = () => {};
  private isReady: boolean | null = null;
  private rig: Rig | null = null;
  private body: BodyInfo | null = null;
  private fallback: Mesh | null = null;
  private readonly parts: Part[] = [];
  private readonly owned: Material[] = [];
  private readonly geos: BufferGeometry[] = [];
  private wantVisible = true;
  private lodHidden = false;
  private disposed = false;
  private readonly seed: number;
  private readonly tempo: number;
  private readonly gaits: LocoGaits;
  // locomotion
  private speed = 0;
  private phase = 0;
  private idleT: number;
  private t = 0;
  private stride = { walk: 0, run: 0, measured: false };
  private cadence = { walk: 0, run: 0 };
  private raw = { walk: 0, run: 0 };
  // clips
  private requested: AnimalClip = 'idle';
  private base: Base;
  private shot: Shot | null = null;
  private readonly w = { idle: 1, walk: 0, run: 0, pose: 0, head: 0, alert: 0, jerk: 0 };
  private loco: Record<LocoSrc, { body: AnimationAction; head: AnimationAction } | null> = { idle: null, walk: null, run: null };
  private jerk: AnimationAction | null = null;
  // body pose, head
  private pose: PoseKind | null = null;
  private headMode: Exclude<HeadMode, 'alert'> | null = null;
  /** Learned neck pitch (radians, + down) that puts the nose at its height for the current head-down mode. */
  private down = 1.1;
  private carriage = 0;
  private legs: Leg[] = [];
  private bodyBone: Bone | null = null;
  private torso3: Bone | null = null;
  private neck: (Bone | null)[] = [];
  private head: Bone | null = null;
  private ears: Bone[] = [];
  private tail: Bone | null = null;
  private touched: { b: Bone; p: Vector3; q: Quaternion }[] = [];
  private restored = true;
  // turning, look
  private faceTarget: number | null = null;
  private readonly lookTarget = new Vector3();
  private looking = false;
  private headYaw = 0;
  private headPitch = 0;
  // eyes
  private eyeMid: Vector3 | null = null;
  /** The eye point in the root's frame after the last evaluation (headWorld). */
  private readonly eyeRoot = new Vector3();
  private shine = 0;
  private shineMesh: Mesh | null = null;
  private shineMat: MeshBasicMaterial | null = null;
  private readonly shineColour = new Color();
  // LOD
  private rate: AnimRate = 'full';
  private lodAcc: number;
  private sinceEval = 0;
  private needsPose = true;
  private alpha = 0;

  constructor(
    readonly id: string,
    readonly specId: string,
    private readonly spec: FaunaSpec,
    o: AnimalSpawnOpts & { y: number },
    loader: StandInLoader,
    private readonly onDispose: (a: StandInAnimal) => void,
  ) {
    this.species = spec.species;
    this.info = Object.freeze({ specId, ...specNumbers(spec), clips: SUPPORTED[spec.species] });
    this.name = o.name ?? specId;
    this.keepAlive = o.keepAlive === true;
    this.seed = spec.seed + (Number.isFinite(o.seed) ? (o.seed as number) : ++autoSeed * 7.31);
    this.tempo = 0.94 + 0.12 * hash01(this.seed);
    this.idleT = hash01(this.seed * 3.1) * 10;
    this.lodAcc = hash01(this.seed * 5.7) * 0.1;
    this.gaits = gaitsFor(spec.speeds);
    this.base = this.makeBase('idle', {});
    this.stride.walk = STRIDE_PER_SHOULDER.walk * spec.height;
    this.stride.run = Math.max(STRIDE_PER_SHOULDER.run * spec.height, RUN_STRIDE_PER_LENGTH * spec.length);
    this.eyeRoot.set(0, spec.headHeight, -0.42 * spec.length);
    this.root.name = `animal:${id}`;
    this.root.position.set(o.x, o.y, o.z);
    this.root.rotation.y = Number.isFinite(o.yaw) ? (o.yaw as number) : 0;
    this.root.visible = false;
    this.root.userData.animal = id;
    this.ready = new Promise<boolean>((res) => (this.resolveReady = res));
    const done = (ok: boolean) => {
      this.isReady = ok;
      this.resolveReady(ok);
    };
    const have = loader.peek(spec.model);
    if (have) done(this.build(have));
    else {
      let p: Promise<LoadedModel>;
      try {
        p = loader.model(spec.model);
      } catch (e) {
        p = Promise.reject(e);
      }
      p.then(
        (m) => done(this.disposed ? false : this.build(m)),
        (e: unknown) => {
          if (this.disposed) return done(false);
          console.warn(`[fauna] ${spec.model} failed, ${id} is a capsule`, e);
          this.buildFallback();
          done(false);
        },
      );
    }
  }

  // ---- building ---------------------------------------------------------------------------------

  /** The rigged body; false (and the capsule) if it cannot be built. */
  private build(src: LoadedModel): boolean {
    if (this.disposed) return false;
    try {
      const spec = this.spec;
      const b = bodyInfo(src);
      this.body = b;
      // scale: the torso top to the spec's shoulder height; the Rig scales the whole bind box
      const s = spec.height / b.S;
      const ri = rigInfo(src);
      const rig = new Rig(src, s * ri.height);
      const st = measureStrides(rig, src, b);
      // nose-to-rump to the spec's length (z), the width factor (x)
      const lenK = spec.length / (s * Math.max(1e-6, b.noseZ - b.rumpZ));
      rig.holder.scale.set(s * spec.build, s, s * lenK);
      this.raw = { walk: st.walk * s * lenK, run: st.run * s * lenK };
      this.stride = { walk: this.raw.walk, run: Math.max(this.raw.run, RUN_STRIDE_PER_LENGTH * spec.length), measured: st.measured };
      for (const k of ['walk', 'run'] as const) {
        const c = findClip(src, STANDIN_SOURCE[k]);
        this.cadence[k] = c ? this.raw[k] / c.duration : 0;
      }
      // shape: uniform bone scales the mixer never writes
      for (const [n, k] of Object.entries(spec.shape ?? {})) boneNamed(rig, n)?.scale.setScalar(k);
      rig.root.updateMatrixWorld(true);
      // materials: per-animal clones of the slots, recoloured; painted slots on a vertex-coloured copy
      const srcMeshes: SkinnedMesh[] = [];
      src.scene.traverse((o) => {
        if ((o as SkinnedMesh).isSkinnedMesh) srcMeshes.push(o as SkinnedMesh);
      });
      // a conservative bound for every part in its own frame (one sphere round the animal in any
      // pose: standing, galloping stretched, head up, lying, sitting), so frustum culling stays on
      const R = Math.hypot(spec.length * 1.15, spec.height * 1.25) * 0.62 + spec.height * 0.25;
      const centre = new Vector3(0, spec.height * 0.62, 0);
      for (const [i, m] of rig.meshes.entries()) {
        const mat0 = (Array.isArray(m.material) ? m.material[0] : m.material) as MeshStandardMaterial | undefined;
        const slot = mat0?.name ?? '';
        if (!mat0 || spec.hideSlots?.includes(slot)) {
          m.visible = false;
          continue;
        }
        const mat = mat0.clone() as MeshStandardMaterial;
        delete mat.userData.kqStandard;
        const painted = !!spec.paint?.some((r) => !r.slots || r.slots.includes(slot));
        const srcMesh = srcMeshes[i];
        if (painted && srcMesh && (m as SkinnedMesh).isSkinnedMesh) {
          m.geometry = paintedGeometry(src, spec, m as SkinnedMesh, srcMesh, slot, b);
          mat.vertexColors = true;
          mat.color.setHex(0xffffff);
        } else {
          const hex = spec.palette[slot];
          if (hex !== undefined) mat.color.setHex(hex);
        }
        const eye = /^eye/i.test(slot);
        mat.roughness = eye ? 0.25 : slot === 'Nose' || slot === 'Muzzle' ? 0.45 : slot === 'Hooves' ? 0.6 : 0.88;
        mat.metalness = 0;
        kqStandard(mat, { ambient: 1.15 });
        mat.alphaHash = true;
        mat.opacity = 0;
        this.owned.push(mat);
        _m.copy(m.matrixWorld).invert();
        const c = _w.copy(centre).applyMatrix4(_m).clone();
        const sc = m.matrixWorld.getMaxScaleOnAxis();
        m.frustumCulled = true;
        (m as Mesh & { boundingSphere: Sphere | null }).boundingSphere = new Sphere(c, R / Math.max(1e-6, sc));
        m.material = mat;
        m.castShadow = true;
        const g = m.geometry;
        const tris = Math.round((g.index ? g.index.count : g.getAttribute('position').count) / 3);
        this.parts.push({ mesh: m, mat, tris });
      }
      // clips: locomotion split into body / head layers; the jerk's head layer
      const set = clipsFor(src);
      const act = (c: AnimationClip) => {
        const a = rig.mixer.clipAction(c);
        a.play();
        a.setEffectiveTimeScale(0);
        a.setEffectiveWeight(0);
        return a;
      };
      for (const k of ['idle', 'walk', 'run'] as const) {
        const c = set.loco[k];
        this.loco[k] = c ? { body: act(c.body), head: act(c.head) } : null;
      }
      this.jerk = set.jerk ? act(set.jerk) : null;
      this.rig = rig;
      this.bindBones(rig, b);
      this.buildShine(rig, ri);
      // the model faces +z, the contract's root faces −z: the body turns round inside the root
      rig.root.rotation.y = Math.PI;
      this.root.add(rig.root);
      this.needsPose = true;
      this.updateVisible();
      return true;
    } catch (e) {
      console.warn(`[fauna] building ${this.id} failed, it is a capsule`, e);
      this.rig?.dispose();
      this.rig = null;
      this.buildFallback();
      return false;
    }
  }

  /** Bones the overlays use, the legs' bind measurements, the head carriage. */
  private bindBones(rig: Rig, b: BodyInfo): void {
    const n = (s: string) => boneNamed(rig, s);
    this.bodyBone = n('Body');
    this.torso3 = n('Torso3');
    this.neck = [n('Neck1'), n('Neck2'), n('Neck3')];
    this.head = rig.info.head ? (rig.bones.get(rig.info.head) ?? null) : null;
    this.ears = ['Ear1L', 'Ear1R'].map(n).filter((x): x is Bone => !!x);
    this.tail = n('Tail1');
    rig.root.updateMatrixWorld(true);
    _hInv.copy(rig.holder.matrixWorld).invert();
    const fpos = (bone: Bone, out: Vector3) => out.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(_hInv);
    const legs: Leg[] = [];
    for (const side of ['L', 'R']) {
      for (const hind of [false, true]) {
        const a = n(hind ? `BackLeg${side}` : `FrontUpperLeg${side}`);
        const bb = n(hind ? `BackUpperLeg${side}` : `FrontLowerLeg${side}`);
        const m = hind ? n(`BackLowerLeg${side}`) : null;
        const paw = n(hind ? `IKBackLeg${side}` : `IKFrontLeg${side}`);
        if (!a || !bb || !paw || (hind && !m)) continue;
        const last = m ?? bb;
        const pa = fpos(a, new Vector3());
        const pb = fpos(bb, new Vector3());
        const pp = fpos(paw, new Vector3());
        const pm = m ? fpos(m, new Vector3()) : null;
        const endLocal = new Vector3().setFromMatrixPosition(paw.matrixWorld).applyMatrix4(_m.copy(last.matrixWorld).invert());
        _m.multiplyMatrices(_hInv, last.matrixWorld).decompose(_p, _q, _s);
        _m.multiplyMatrices(_hInv, paw.matrixWorld).decompose(_p, _q2, _s);
        const rel = _q.clone().invert().multiply(_q2);
        legs.push({
          hind,
          a,
          b: bb,
          m,
          paw,
          endLocal,
          la: pa.distanceTo(pb),
          lb: pm ? pb.distanceTo(pm) : pb.distanceTo(pp),
          lm: pm ? pm.distanceTo(pp) : 0,
          rel,
          pawY: pp.y,
        });
      }
    }
    this.legs = legs.length === 4 ? legs : [];
    // bones put back before every evaluation (the overlays write them after the mixer)
    const set = new Set<Bone>();
    for (const x of [this.bodyBone, this.torso3, ...this.neck, this.head, this.tail, ...this.ears]) if (x) set.add(x);
    for (const l of this.legs) for (const x of [l.a, l.b, l.m, l.paw]) if (x) set.add(x);
    this.touched = [...set].map((x) => ({ b: x, p: x.position.clone(), q: x.quaternion.clone() }));
    // head carriage: lift the eyes from the model's bind height to the spec's eye height
    const eyes = rig.info.eyes;
    const n1 = this.neck[0];
    if (eyes && this.head && n1) {
      this.eyeMid = eyes.l.clone().add(eyes.r).multiplyScalar(0.5);
      const e = this.eyeMid.clone().applyMatrix4(this.head.matrixWorld).applyMatrix4(_hInv);
      const base = fpos(n1, new Vector3());
      const targetY = this.spec.headHeight / rig.holder.scale.y + b.minY;
      this.carriage = carriageFor({ y: base.y, z: base.z }, { y: e.y, z: e.z }, targetY);
    } else if (b.noseLocal && this.head) this.eyeMid = b.noseLocal.clone();
  }

  /** The eye glints: two small unlit spheres on the head bone at the model's eyes, hidden at 0. */
  private buildShine(rig: Rig, ri: ReturnType<typeof rigInfo>): void {
    const head = this.head;
    if (!head || !ri.eyes) return;
    rig.root.updateMatrixWorld(true);
    head.getWorldScale(_s);
    const sc = (_s.x + _s.y + _s.z) / 3;
    const r = (this.spec.height * 0.03) / Math.max(1e-9, sc);
    const mid = ri.eyes.l.clone().add(ri.eyes.r).multiplyScalar(0.5);
    const geos = [ri.eyes.l, ri.eyes.r].map((e) => {
      // a little out of the head (along the eye's offset from the eye midpoint and forward)
      const g = new SphereGeometry(r, 8, 6);
      const out = e.clone().sub(mid).normalize().multiplyScalar(r * 0.35);
      g.translate(e.x + out.x, e.y + out.y, e.z + out.z);
      return g;
    });
    const geo = mergeGeometries(geos) ?? geos[0]!;
    for (const g of geos) if (g !== geo) g.dispose();
    this.shineColour.setHex(this.spec.shine);
    const mat = new MeshBasicMaterial({ color: this.shineColour.clone(), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    this.geos.push(geo);
    this.owned.push(mat);
    const mesh = new Mesh(geo, mat);
    mesh.name = 'eye-shine';
    mesh.renderOrder = 8;
    mesh.visible = false;
    head.add(mesh);
    this.shineMesh = mesh;
    this.shineMat = mat;
    this.applyShine();
  }

  /** The load failed: a plain capsule of the spec's size lying along the body (still placeable, no animation). */
  private buildFallback(): void {
    if (this.fallback || this.disposed) return;
    const s = this.spec;
    const r = s.height * 0.3;
    const geo = new CapsuleGeometry(r, Math.max(0.05, s.length - 2 * r), 4, 10);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, s.height * 0.62, 0);
    const mat = kqStandard(new MeshStandardMaterial({ color: s.palette.Main ?? 0x808080, roughness: 0.85 }), { ambient: 1.15 });
    this.geos.push(geo);
    this.owned.push(mat);
    const m = new Mesh(geo, mat);
    m.castShadow = true;
    m.name = 'animal-fallback';
    this.fallback = m;
    this.alpha = 1;
    this.root.add(m);
    this.updateVisible();
  }

  private updateVisible(): void {
    this.root.visible = this.wantVisible && !this.lodHidden && !this.disposed && (this.rig !== null || this.fallback !== null);
  }

  private applyShine(): void {
    const m = this.shineMesh;
    const mat = this.shineMat;
    if (!m || !mat) return;
    const k = this.shine;
    m.visible = k > 1e-3;
    // HDR on purpose: at full shine the glint is brighter than white (it blooms where bloom is on)
    mat.color.copy(this.shineColour).multiplyScalar(0.25 + 2.4 * k * k);
    mat.opacity = Math.min(1, k * 1.6);
  }

  // ---- the contract -----------------------------------------------------------------------------

  setSpeed(mps: number): void {
    this.speed = Number.isFinite(mps) ? Math.max(0, Math.min(16, mps)) : 0;
  }

  play(clip: AnimalClip, o: { loop?: boolean; fade?: number; speed?: number } = {}): void {
    if (!ANIMAL_CLIPS.includes(clip)) {
      console.warn(`[fauna] unknown clip '${String(clip)}', playing idle`);
      return this.play('idle', o);
    }
    this.requested = clip;
    const as = planClip(this.species, clip);
    const plan = STANDIN_CLIPS[this.species][as]!;
    if (plan.kind === 'shot') {
      const kind = plan.shot ?? 'bark';
      this.shot = { clip, as, kind, t: 0, dur: SHOT_LEN[kind], speed: Math.max(0.05, o.speed ?? 1), fade: o.fade ?? 0.08, loop: o.loop ?? false };
      return;
    }
    // a looping one-shot ends when another clip is asked for; a single one plays out
    if (this.shot?.loop) this.shot = null;
    const b = this.base;
    const loop = o.loop ?? true;
    if (b.clip === clip && b.loop === loop && b.speed === (o.speed ?? 1)) {
      b.fade = o.fade ?? b.fade;
      if (!loop) b.t = 0;
      return;
    }
    this.base = this.makeBase(clip, o);
  }

  private makeBase(clip: AnimalClip, o: { loop?: boolean; fade?: number; speed?: number }): Base {
    // a base is always a loop: a clip whose plan is a one-shot never lands here (a species without
    // it resolves to a loop, e.g. a deer's bark → alert); idle as the guard
    const r = planClip(this.species, clip);
    const as = STANDIN_CLIPS[this.species][r]?.kind === 'loop' ? r : 'idle';
    return { clip, as, plan: STANDIN_CLIPS[this.species][as]!, loop: o.loop ?? true, fade: Math.max(0, o.fade ?? DEFAULT_FADE), speed: Math.max(0.05, o.speed ?? 1), t: 0 };
  }

  face(yaw: number): void {
    if (Number.isFinite(yaw)) this.faceTarget = wrapPi(yaw);
  }

  lookAt(p: { x: number; y: number; z: number } | null): void {
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
      this.lookTarget.set(p.x, p.y, p.z);
      this.looking = true;
    } else this.looking = false;
  }

  headWorld(out: { x: number; y: number; z: number }): void {
    this.root.updateWorldMatrix(true, false);
    _v.copy(this.eyeRoot).applyMatrix4(this.root.matrixWorld);
    out.x = _v.x;
    out.y = _v.y;
    out.z = _v.z;
  }

  setEyeShine(k: number): void {
    this.shine = Number.isFinite(k) ? Math.max(0, Math.min(1, k)) : 0;
    this.applyShine();
  }

  setVisible(v: boolean): void {
    this.wantVisible = !!v;
    if (v) this.needsPose = true;
    this.updateVisible();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    if (this.rig) {
      // the clone's own skeletons (their bone textures live on the GPU); geometry stays with the asset cache
      const skel = new Set<Skeleton>();
      for (const m of this.rig.meshes) if ((m as SkinnedMesh).isSkinnedMesh) skel.add((m as SkinnedMesh).skeleton);
      for (const k of skel) k.dispose();
      this.rig.dispose();
    }
    this.rig = null;
    this.shineMesh?.removeFromParent();
    this.shineMesh = null;
    this.shineMat = null;
    this.parts.length = 0;
    this.legs = [];
    this.touched = [];
    for (const m of this.owned) m.dispose();
    for (const g of this.geos) g.dispose();
    this.owned.length = 0;
    this.geos.length = 0;
    this.fallback = null;
    this.root.visible = false;
    this.resolveReady(false);
    this.onDispose(this);
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  // ---- per frame (the fauna system) -------------------------------------------------------------

  tick(f: AnimalTick): void {
    if (this.disposed) return;
    const dt = Math.min(0.1, Math.max(0, Number.isFinite(f.dt) ? f.dt : 0));
    // smooth body turn (cheap: at every distance)
    if (this.faceTarget !== null) {
      const y = easeYaw(this.root.rotation.y, this.faceTarget, dt, f.reducedMotion ? 0.15 : FACE_SECONDS);
      this.root.rotation.y = y;
      if (Math.abs(wrapPi(y - this.faceTarget)) < 1e-3) this.faceTarget = null;
    }
    const wasHidden = !this.root.visible;
    this.lodHidden = f.hidden;
    this.rate = f.rate;
    this.updateVisible();
    if (wasHidden && this.root.visible) this.needsPose = true;
    const rig = this.rig;
    if (!rig) return;
    // ---- clocks (always running; the LOD only decides when the pose is evaluated)
    const moving = this.speed > MOVE_OVERRIDE;
    let b = this.base;
    b.t += dt;
    if (!b.loop && b.t > (CYCLE[b.as] ?? Infinity)) b = this.base = this.makeBase('idle', { fade: b.fade });
    const plan = b.plan;
    this.t += dt;
    this.phase = advancePhase(this.phase, this.speed, this.stride.walk, this.stride.run, dt, this.gaits);
    const tempo = moving ? 1 : (plan.tempo ?? 1) * b.speed;
    this.idleT += dt * this.tempo * tempo * (f.reducedMotion ? 0.6 : 1);
    const s = this.shot;
    if (s) {
      s.t += dt * s.speed;
      if (s.t >= s.dur) {
        if (s.loop) s.t %= s.dur;
        else this.shot = null;
      }
    }
    // ---- weights (eased every frame)
    const lw = locoWeights(this.speed, this.gaits);
    const fade = b.fade;
    this.w.idle = easeWeight(this.w.idle, lw.idle, dt, fade);
    this.w.walk = easeWeight(this.w.walk, lw.walk, dt, fade);
    this.w.run = easeWeight(this.w.run, lw.run, dt, fade);
    // a pose: out of the old one first (back on its feet), then into the new one
    const wantPose = !moving && plan.pose && this.legs.length ? plan.pose : null;
    if (this.pose !== wantPose && (this.pose === null || this.w.pose < 0.02)) {
      this.pose = wantPose;
      this.w.pose = 0;
    }
    this.w.pose = easeWeight(this.w.pose, this.pose !== null && this.pose === wantPose ? 1 : 0, dt, f.reducedMotion ? 0.25 : POSE_FADE);
    // head: alert on its own weight; the head-down modes (graze / sniff / sleep) share one and
    // switch between each other while down (only the nose height they aim at changes)
    const hm = !moving && plan.head ? plan.head : null;
    const downMode = hm && hm !== 'alert' ? hm : null;
    if (downMode) this.headMode = downMode;
    this.w.head = easeWeight(this.w.head, downMode ? 1 : 0, dt, 0.55);
    if (!downMode && this.w.head < 1e-3) this.headMode = null;
    this.w.alert = easeWeight(this.w.alert, hm === 'alert' ? 1 : 0, dt, 0.3);
    const jerkOn = s && s.kind === 'bark' ? shotTarget(s.t, s.dur, s.fade, s.loop) : 0;
    this.w.jerk = easeWeight(this.w.jerk, jerkOn, dt, 0.06);
    // ---- pose, at the LOD's rate
    this.sinceEval += dt;
    const tk = animTick(this.lodAcc, dt, f.rate);
    this.lodAcc = tk.acc;
    if (this.root.visible && (tk.evaluate || this.needsPose)) {
      this.evaluate(this.sinceEval, f.reducedMotion);
      this.sinceEval = 0;
      this.needsPose = false;
    }
    if (this.alpha < 1) {
      this.alpha = Math.min(1, this.alpha + dt / 0.35);
      for (const p of this.parts) p.mat.opacity = this.alpha;
    }
  }

  private evaluate(dt: number, reduced: boolean): void {
    const rig = this.rig!;
    // fresh root matrices: every bone matrix below (and the eye point) is taken against them
    this.root.updateWorldMatrix(true, false);
    // the mixer writes a bone only when its value changed: put last evaluation's overlays back first
    if (!this.restored) {
      for (const t of this.touched) {
        t.b.position.copy(t.p);
        t.b.quaternion.copy(t.q);
      }
      this.restored = true;
    }
    const jw = this.w.jerk;
    if (this.jerk) {
      const d = this.jerk.getClip().duration;
      const s = this.shot;
      this.jerk.time = s && s.kind === 'bark' ? Math.min(d * 0.999, (s.t / s.dur) * d) : 0;
      this.jerk.setEffectiveWeight(jw);
    }
    for (const k of ['idle', 'walk', 'run'] as const) {
      const l = this.loco[k];
      if (!l) continue;
      const d = l.body.getClip().duration;
      const t = k === 'idle' ? this.idleT % d : this.phase * d;
      l.body.time = l.head.time = t;
      l.body.setEffectiveWeight(this.w[k]);
      l.head.setEffectiveWeight(this.w[k] * (1 - jw));
    }
    rig.update(0);
    for (const t of this.touched) {
      t.p.copy(t.b.position);
      t.q.copy(t.b.quaternion);
    }
    this.restored = false;
    rig.root.updateMatrixWorld(true);
    _hInv.copy(rig.holder.matrixWorld).invert();
    // ---- body pose (sit / lie / nose), legs placed, paws moved to the legs' ends
    if (this.pose && this.w.pose > 1e-3) this.applyPose(POSES[this.species][this.pose], this.w.pose);
    // ---- head and neck
    const S = this.body!.S;
    const def = this.pose ? POSES[this.species][this.pose] : undefined;
    const pw = this.w.pose;
    const hw = this.w.head;
    const aw = this.w.alert;
    const n1 = this.neck[0] ?? null;
    const n2 = this.neck[1] ?? null;
    const n3 = this.neck[2] ?? null;
    // the carriage holds the head up; with the nose down it gives way
    const carry = this.carriage * (1 - hw);
    let p1 = -carry + (def ? def.neck * pw * 0.6 : 0) - 0.22 * aw;
    let p2 = def ? def.neck * pw * 0.4 : 0;
    let p3 = 0;
    let ph = carry * 0.7 + 0.06 * aw;
    let y2 = 0;
    let yh = 0;
    // head down (graze / sniff / sleep): the learned neck pitch, distributed down the neck
    const mode = this.headMode;
    if (mode && hw > 1e-3) {
      const d = this.down * hw;
      p1 += d * 0.5;
      p2 += d * 0.25;
      p3 += d * 0.15;
      ph += d * 0.1;
      if (!reduced) {
        if (mode === 'graze') {
          ph += Math.sin(this.t * 2 * Math.PI * 1.9) * 0.05 * hw;
          yh += Math.sin(this.t * 0.4 + this.seed) * 0.08 * hw;
        } else if (mode === 'sniff') {
          y2 += Math.sin(this.t * 0.55 + this.seed) * 0.3 * hw;
          yh += Math.sin(this.t * 0.55 + this.seed - 0.5) * 0.15 * hw;
          ph += Math.sin(this.t * 2 * Math.PI * 6.5) * 0.03 * hw * (0.5 + 0.5 * Math.sin(this.t * 1.7));
        }
      }
    }
    // one-shots: the bark's head snap, the shake's roll wave
    const s = this.shot;
    let roll = 0;
    let rollT = 0;
    if (s && !reduced) {
      const e = shotEnvelope(s.t, s.dur);
      if (s.kind === 'bark') {
        p1 -= 0.28 * e;
        ph += 0.12 * e;
      } else {
        roll = 0.32 * e;
        rollT = s.t * 2 * Math.PI * 6.5;
      }
    }
    // the look-at (body frame of the rig root, metres)
    let yaw = 0;
    let pitch = 0;
    if (this.looking && this.head) {
      rig.root.updateMatrixWorld();
      _m.copy(rig.root.matrixWorld).invert();
      this.head.getWorldPosition(_v).applyMatrix4(_m);
      const t = _w.copy(this.lookTarget).applyMatrix4(_m);
      const a = headAim(t.x - _v.x, t.y - _v.y, t.z - _v.z, ANIMAL_HEAD);
      // no look while the nose is on the ground or the body lies asleep
      const free = 1 - Math.max(hw * (mode === 'sleep' ? 1 : 0.7), 0);
      yaw = a.yaw * free;
      pitch = a.pitch * free;
    }
    const k = 1 - Math.exp(-dt * (reduced ? 12 : 5));
    this.headYaw += (yaw - this.headYaw) * k;
    this.headPitch += (pitch - this.headPitch) * k;
    p1 += this.headPitch * 0.3;
    ph += this.headPitch * 0.7;
    const turn = (b: Bone | null, pitchX: number, yawY: number, rollZ = 0) => {
      if (!b) return;
      if (pitchX) this.turnF(b, AX, pitchX);
      if (yawY) this.turnF(b, AY, yawY);
      if (rollZ) this.turnF(b, AZ, rollZ);
      if (pitchX || yawY || rollZ) b.updateMatrixWorld(true);
    };
    turn(this.torso3, 0, 0, roll * 0.5 * Math.sin(rollT));
    turn(n1, p1, this.headYaw * 0.3, roll * 0.7 * Math.sin(rollT - 0.6));
    turn(n2, p2, this.headYaw * 0.3 + y2, 0);
    turn(n3, p3, 0, 0);
    turn(this.head, ph, this.headYaw * 0.4 + yh, roll * Math.sin(rollT - 1.2));
    const ear = 0.35 * aw + (s && s.kind === 'shake' && !reduced ? 0.5 * shotEnvelope(s.t, s.dur) * Math.sin(rollT * 1.3) : 0);
    for (const e of this.ears) turn(e, ear, 0, 0);
    turn(this.tail, def ? def.tail * pw : 0, roll ? 0.8 * roll * Math.sin(rollT + 1.5) : 0, 0);
    // learn the head-down pitch from the nose (only when fully down, a damped step): down to its
    // height, but never behind the forefeet (more pitch would only swing the head back under the chest)
    const nl = this.body!.noseLocal;
    if (mode && hw > 0.9 && this.head && nl) {
      const nose = _v.copy(nl).applyMatrix4(this.head.matrixWorld).applyMatrix4(_hInv);
      let front = -Infinity;
      for (const l of this.legs) if (!l.hind) front = Math.max(front, this.fpos(l.paw, _w).z);
      const want = this.body!.minY + NOSE_AT[mode] * S;
      let step = ((nose.y - want) / S) * 0.9;
      const ahead = Number.isFinite(front) ? (nose.z - front) / S - NOSE_AHEAD[this.species] : 1;
      if (ahead < 0) step = Math.min(step, ahead * 0.9);
      this.down = Math.max(0.2, Math.min(2.0, this.down + Math.max(-0.12, Math.min(0.12, step))));
    }
    // the eye point (headWorld) in the root's frame
    if (this.head && this.eyeMid) {
      _m.copy(this.root.matrixWorld).invert();
      this.eyeRoot.copy(this.eyeMid).applyMatrix4(this.head.matrixWorld).applyMatrix4(_m);
    }
  }

  /** Rotate a bone about an axis of the holder's frame (after the mixer). */
  private turnF(b: Bone, axis: Vector3, angle: number): void {
    const p = b.parent;
    if (!p) return;
    _m.multiplyMatrices(_hInv, p.matrixWorld).decompose(_p, _pq, _s);
    _u.copy(axis).applyQuaternion(_q.copy(_pq).invert()).normalize();
    b.quaternion.premultiply(_q2.setFromAxisAngle(_u, angle));
  }

  /** An object's rotation in the holder's frame (a similarity there: exact). */
  private fquat(o: Object3D, out: Quaternion): Quaternion {
    _m3.multiplyMatrices(_hInv, o.matrixWorld).decompose(_p, out, _s);
    return out;
  }

  /** A bone's position in the holder's frame. */
  private fpos(b: Bone, out: Vector3): Vector3 {
    return out.setFromMatrixPosition(b.matrixWorld).applyMatrix4(_hInv);
  }

  /** Aim a bone so the segment from its origin to `curEnd` points at `want` (holder frame). */
  private aim(b: Bone, from: Vector3, curEnd: Vector3, want: Vector3): void {
    const p = b.parent;
    if (!p) return;
    _v.subVectors(curEnd, from);
    _w.subVectors(want, from);
    if (_v.lengthSq() < 1e-12 || _w.lengthSq() < 1e-12) return;
    _q.setFromUnitVectors(_v.normalize(), _w.normalize());
    _m.multiplyMatrices(_hInv, p.matrixWorld).decompose(_p, _pq, _s);
    _q2.copy(_pq).invert().multiply(_q).multiply(_pq);
    b.quaternion.premultiply(_q2);
    b.updateMatrixWorld(true);
  }

  /** The end of a leg's last segment (the paw joint) in the holder's frame. */
  private legEnd(l: Leg, out: Vector3): Vector3 {
    return out.copy(l.endLocal).applyMatrix4((l.m ?? l.b).matrixWorld).applyMatrix4(_hInv);
  }

  /** Pitch and lower the body about its pivot, then place every leg and move the paws to the legs' ends. */
  private applyPose(def: PoseDef | undefined, w: number): void {
    if (!def || !this.bodyBone || this.legs.length !== 4) return;
    const b = this.body!;
    const S = b.S;
    const body = this.bodyBone;
    // pivot: the hip (or shoulder) joints' midpoint, as the clip left them
    const pivots = this.legs.filter((l) => l.hind === (def.pivot === 'hips'));
    const piv = new Vector3();
    for (const l of pivots) piv.add(this.fpos(l.a, _v));
    piv.multiplyScalar(1 / Math.max(1, pivots.length));
    const to = piv.clone();
    if (def.pivotY !== null) to.y = piv.y + (b.minY + def.pivotY * S - piv.y) * w;
    // M = T(to) · Rx(−pitch·w) · T(−piv), in the holder's frame, applied to the body bone
    _m.makeTranslation(-piv.x, -piv.y, -piv.z);
    _m2.makeRotationX(-def.pitch * w);
    _m3.makeTranslation(to.x, to.y, to.z);
    _m3.multiply(_m2).multiply(_m);
    const parent = body.parent;
    if (!parent) return;
    _m.multiplyMatrices(_hInv, body.matrixWorld);
    _m.premultiply(_m3);
    _m2.multiplyMatrices(_hInv, parent.matrixWorld).invert();
    _m.premultiply(_m2);
    _m.decompose(body.position, body.quaternion, _s);
    body.updateMatrixWorld(true);
    // legs
    const root = new Vector3();
    const knee0 = new Vector3();
    const curPaw = new Vector3();
    const curHock = new Vector3();
    const tgt = new Vector3();
    const hock = new Vector3();
    for (const l of this.legs) {
      const lt = l.hind ? def.hind : def.front;
      this.fpos(l.a, root);
      this.fpos(l.b, knee0);
      // the paw as the clip planted it (the paw bone is not under the body: it did not move)
      this.fpos(l.paw, curPaw);
      let reach = tgt;
      if (l.hind && l.m) {
        this.fpos(l.m, curHock);
        if (lt.mode === 'place' && lt.hock) {
          hock.set(curHock.x, b.minY + lt.hock[1] * S, root.z + lt.hock[0] * S);
          hock.lerpVectors(curHock, hock, w);
        } else hock.copy(curHock);
        reach = hock;
      } else if (lt.mode === 'place' && lt.at) {
        tgt.set(curPaw.x, lt.at[1] === null ? l.pawY : b.minY + lt.at[1] * S, root.z + lt.at[0] * S);
        tgt.lerpVectors(curPaw, tgt, w);
      } else tgt.copy(curPaw);
      // the knee: toward the clip's own knee side at first, the pose's side as it comes in
      _u.subVectors(knee0, root).normalize().multiplyScalar(1 - w);
      _u.add(_v.set(0, lt.pole[1], lt.pole[0]).normalize().multiplyScalar(w));
      const sol = kneePoint(root, reach, l.la, l.lb, _u as P3);
      const kneeW = _w.set(sol.knee.x, sol.knee.y, sol.knee.z).clone();
      const endW = new Vector3(sol.end.x, sol.end.y, sol.end.z);
      this.aim(l.a, root, this.fpos(l.b, _p).clone(), kneeW);
      const kb = this.fpos(l.b, new Vector3());
      const eb = l.m ? this.fpos(l.m, new Vector3()) : this.legEnd(l, new Vector3());
      this.aim(l.b, kb, eb, endW);
      if (l.m) {
        // the metatarsus: from the hock forward to the paw's height (place), or keeping its line to the planted paw
        const hk = this.fpos(l.m, new Vector3());
        if (lt.mode === 'place') {
          const dy = l.pawY - hk.y;
          const dz = Math.sqrt(Math.max(0, l.lm * l.lm - dy * dy));
          tgt.set(curPaw.x, l.pawY, hk.z + dz);
          tgt.lerpVectors(curPaw, tgt, w);
        } else tgt.copy(curPaw);
        this.aim(l.m, hk, this.legEnd(l, new Vector3()), tgt);
      }
      // the paw bone to the leg's end; 'follow' turns it with the last segment
      const end = this.legEnd(l, new Vector3());
      const pp = l.paw.parent;
      if (!pp) continue;
      _m.multiplyMatrices(_hInv, pp.matrixWorld);
      _m2.copy(_m).invert();
      l.paw.position.copy(end.applyMatrix4(_m2));
      if (lt.paw === 'follow') {
        this.fquat(l.m ?? l.b, _q).multiply(l.rel);
        this.fquat(pp, _pq);
        _q2.copy(_pq).invert().multiply(_q);
        l.paw.quaternion.slerp(_q2, w);
      }
      l.paw.updateMatrixWorld(true);
    }
  }

  // ---- debug ------------------------------------------------------------------------------------

  /** Triangles and draw calls this animal costs now (0 when not drawn; frustum culling not counted). */
  drawStats(): { tris: number; calls: number } {
    if (!this.root.visible) return { tris: 0, calls: 0 };
    let tris = 0;
    let calls = 0;
    for (const p of this.parts) {
      tris += p.tris;
      calls += 1;
    }
    if (this.shineMesh?.visible) {
      const g = this.shineMesh.geometry;
      tris += Math.round((g.index ? g.index.count : g.getAttribute('position').count) / 3);
      calls += 1;
    }
    if (this.fallback) {
      const g = this.fallback.geometry;
      tris += Math.round((g.index ? g.index.count : g.getAttribute('position').count) / 3);
      calls += 1;
    }
    return { tris, calls };
  }

  state(): AnimalState {
    const r = this.root;
    const st = this.drawStats();
    const round = (n: number) => Math.round(n * 1000) / 1000;
    const eye = { x: 0, y: 0, z: 0 };
    this.headWorld(eye);
    const asked = this.shot ? this.shot.as : this.base.as;
    return {
      id: this.id,
      specId: this.specId,
      name: this.name,
      species: this.species,
      x: round(r.position.x),
      y: round(r.position.y),
      z: round(r.position.z),
      yaw: round(wrapPi(r.rotation.y)),
      speed: this.speed,
      clip: this.requested,
      base: this.base.clip,
      playing: asked,
      shot: this.shot?.clip ?? null,
      substitute: !(STANDIN_CLIPS[this.species][asked]?.native ?? true),
      visible: r.visible,
      ready: this.isReady,
      fallback: this.fallback !== null,
      lod: this.rate,
      keepAlive: this.keepAlive,
      height: this.info.height,
      length: this.info.length,
      radius: this.info.radius,
      headHeight: this.info.headHeight,
      stride: {
        walk: round(this.stride.walk),
        run: round(this.stride.run),
        measured: this.stride.measured,
        raw: { walk: round(this.raw.walk), run: round(this.raw.run) },
        cadence: { walk: round(this.cadence.walk), run: round(this.cadence.run) },
      },
      weights: {
        idle: round(this.w.idle),
        walk: round(this.w.walk),
        run: round(this.w.run),
        pose: round(this.w.pose),
        head: round(this.w.head),
        alert: round(this.w.alert),
        jerk: round(this.w.jerk),
      },
      pose: this.pose,
      head: { yaw: round(this.headYaw), pitch: round(this.headPitch), down: round(this.down), mode: this.headMode ?? (this.w.alert > 0.5 ? 'alert' : null) },
      eye: { x: round(eye.x), y: round(eye.y), z: round(eye.z) },
      eyeShine: this.shine,
      tris: st.tris,
      drawCalls: st.calls,
    };
  }

  /** The body (for tests): the rig's root, or null before it is in. */
  get bodyRoot(): Object3D | null {
    return this.rig?.root ?? null;
  }

  /** Movement share of the body now (tests). */
  get moving(): number {
    return moveAmount(this.speed, this.gaits);
  }
}
