/**
 * The stand-in build of the people contract (./types.ts): a rigged CC0 Quaternius human
 * (characters/catalog.ts models, lazy-loaded through `ctx.assets` like the NPC bodies) in the
 * spec's stand-in colours, scaled to the spec height, behind the `Person` interface. The authored
 * meshes replace this file; the contract, the spec ids and the people system stay.
 *
 * Animation (one AnimationMixer per person, weights set by hand, no cross-fade chains — the
 * avatar's scheme): idle / walk / run blended by the ground speed the caller sets, feet
 * phase-locked (one cycle counter drives walk and run over the stride MEASURED from each clip's foot
 * track), one-shots (Interact, Wave) full-body while standing and upper-body over walking legs, the
 * head turned after the mixer (`Rig.turnBone`) toward a look target within limits. Clip times are
 * set directly and the mixer evaluates at dt 0, so the distance LOD only decides WHEN the pose is
 * evaluated (every frame / ~10 Hz / frozen); the clocks always run.
 *
 * Looks: 'solid' = the model's own slots cloned per person, recoloured and lit by the world
 * (`kqStandard`, like the avatar); 'ghost' = the NPC ghost shader (characters/shaders.ts) with its
 * depth pre-pass twins. Geometry is shared with the asset cache and never disposed here; the
 * materials, the fallback capsule and the mixer's actions are.
 */
import {
  type AnimationAction,
  AnimationClip,
  AnimationMixer,
  type Bone,
  type BufferGeometry,
  CapsuleGeometry,
  type Color,
  Group,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  type ShaderMaterial,
  type Skeleton,
  type SkinnedMesh,
  Sphere,
  Vector3,
} from 'three';
import type { LoadedModel } from '../../assets/loader';
import { kqStandard } from '../../render/standard';
import type { CharacterModel } from '../characters/catalog';
import { Rig } from '../characters/rig';
import { ghostMaterials, ghostShared, linHex } from '../characters/shaders';
import {
  type AnimRate,
  FACE_SECONDS,
  STRIDE_PER_HEIGHT,
  type FootSample,
  advancePhase,
  animTick,
  easeWeight,
  easeYaw,
  hash01,
  headAim,
  locoWeights,
  moveAmount,
  resolveClip,
  shotTarget,
  strideFromFeet,
  sweepYaw,
  wrapPi,
} from './locomotion';
import { type PersonSpec, standinColour, standinShows } from './specs';
import { MOVE_OVERRIDE, type Person, type PersonClip, type PersonInfo, type PersonLook, type PersonSpawnOpts } from './types';

// ---- the stand-in clip map (one table: the authored build swaps it) ----------------------------

/** Source clips of the Quaternius humans (first one present wins). */
export const STANDIN_SOURCE = {
  idle: ['Idle_Neutral', 'Idle'],
  walk: ['Walk'],
  run: ['Run'],
  interact: ['Interact'],
  wave: ['Wave'],
} as const;

type LocoSrc = 'idle' | 'walk' | 'run';
type ShotSrc = 'interact' | 'wave';

export interface StandInPlan {
  /** A looping clip (idle under the speed-driven locomotion), or a one-shot over it. */
  kind: 'loop' | 'shot';
  shot?: ShotSrc;
  /** Interact gestures now and then (talk). */
  gestures?: boolean;
  /** A slow head sweep (lookAround). */
  sweep?: boolean;
  /** The root lowered by this much (m): the stand-in's "sit" is idle sunk onto the seat. */
  drop?: number;
  /** A real clip of this build (listed in `info.clips`); false = a fallback look. */
  native: boolean;
}

/**
 * PersonClip → what the stand-in plays. idle → Idle_Neutral (else Idle), walk → Walk, run → Run
 * (both by `setSpeed`: `play('walk' | 'run')` only hands the body back to locomotion),
 * talk → idle plus Interact gestures now and then, point / interact → Interact, wave → Wave,
 * lookAround → idle with a slow head sweep, sit / sitTalk → idle with the root lowered 0.42 m.
 * Point and the two sits are fallbacks (no such clip in the CC0 pack), so `info.clips` leaves
 * them out.
 */
export const STANDIN_CLIPS: Readonly<Record<PersonClip, StandInPlan>> = {
  idle: { kind: 'loop', native: true },
  walk: { kind: 'loop', native: true },
  run: { kind: 'loop', native: true },
  talk: { kind: 'loop', gestures: true, native: true },
  point: { kind: 'shot', shot: 'interact', native: false },
  wave: { kind: 'shot', shot: 'wave', native: true },
  lookAround: { kind: 'loop', sweep: true, native: true },
  sit: { kind: 'loop', drop: 0.42, native: false },
  sitTalk: { kind: 'loop', drop: 0.42, gestures: true, native: false },
  interact: { kind: 'shot', shot: 'interact', native: true },
};

/** The clips the stand-in really supports (`info.clips`). */
export const STANDIN_SUPPORTED: readonly PersonClip[] = (Object.keys(STANDIN_CLIPS) as PersonClip[]).filter((c) => STANDIN_CLIPS[c].native);

/** Default weight fade (s) of `play()`. */
const DEFAULT_FADE = 0.25;
/** Seconds of one cycle of a looping clip played with `loop: false` (then back to idle / sit). */
const CYCLE: Partial<Record<PersonClip, number>> = { talk: 4.5, sitTalk: 4.5, lookAround: 5.7 };

/** Bones of the upper-body layer (one-shots over walking legs; the avatar's split). */
const UPPER = /^(Torso|Chest|Neck|Head|Shoulder|UpperArm|LowerArm|Wrist|Index|Middle|Ring|Pinky|Thumb)/;

function splitClip(c: AnimationClip, upper: boolean): AnimationClip {
  const tracks = c.tracks.filter((t) => UPPER.test(t.name.split('.')[0] ?? '') === upper);
  return new AnimationClip(`${c.name}_${upper ? 'up' : 'low'}`, c.duration, tracks);
}

interface ClipSet {
  loco: Record<LocoSrc, { low: AnimationClip; up: AnimationClip } | null>;
  shots: Record<ShotSrc, { up: AnimationClip; full: AnimationClip } | null>;
}

/** Split clips per source model (shared by every person wearing it). */
const clipCache = new WeakMap<LoadedModel, ClipSet>();

function clipsFor(src: LoadedModel): ClipSet {
  const hit = clipCache.get(src);
  if (hit) return hit;
  const find = (names: readonly string[]) => {
    for (const n of names) {
      const c = src.animations.find((a) => a.name === n);
      if (c) return c;
    }
    return null;
  };
  const loco = (k: LocoSrc) => {
    const c = find(STANDIN_SOURCE[k]);
    return c ? { low: splitClip(c, false), up: splitClip(c, true) } : null;
  };
  const shot = (k: ShotSrc) => {
    const c = find(STANDIN_SOURCE[k]);
    return c ? { up: splitClip(c, true), full: c } : null;
  };
  const set: ClipSet = { loco: { idle: loco('idle'), walk: loco('walk'), run: loco('run') }, shots: { interact: shot('interact'), wave: shot('wave') } };
  clipCache.set(src, set);
  return set;
}

/** Measured strides per source model (m per loop, per metre of body height). */
const strideCache = new WeakMap<LoadedModel, { walk: number; run: number; measured: boolean }>();

const _v = new Vector3();
const _w = new Vector3();
const _m = new Matrix4();

function findBone(rig: Rig, re: RegExp): Bone | null {
  for (const [n, b] of rig.bones) if (re.test(n)) return b;
  return null;
}

/**
 * The ground distance one loop of Walk / Run covers, measured once per source model on a fresh rig
 * (its root still at the origin): the feet sampled through each clip (`strideFromFeet`). The rig's
 * bones are put back afterwards.
 */
export function measureStrides(rig: Rig, src: LoadedModel, height: number): { walk: number; run: number; measured: boolean } {
  const hit = strideCache.get(src);
  if (hit) return hit;
  const out: { walk: number; run: number; measured: boolean } = { walk: STRIDE_PER_HEIGHT.walk, run: STRIDE_PER_HEIGHT.run, measured: false };
  const fl = findBone(rig, /^Foot_?L$/);
  const fr = findBone(rig, /^Foot_?R$/);
  if (fl && fr) {
    const snap = [...rig.bones.values()].map((b) => [b, b.position.clone(), b.quaternion.clone(), b.scale.clone()] as const);
    const mixer = new AnimationMixer(rig.model);
    rig.root.updateMatrixWorld(true);
    _m.copy(rig.root.matrixWorld).invert();
    for (const k of ['walk', 'run'] as const) {
      const clip = src.animations.find((a) => a.name === STANDIN_SOURCE[k][0]);
      if (!clip) continue;
      const a = mixer.clipAction(clip);
      a.play();
      const feet: FootSample[][] = [[], []];
      const N = 48;
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * clip.duration;
        a.time = t;
        mixer.update(0);
        rig.root.updateMatrixWorld(true);
        fl.getWorldPosition(_v).applyMatrix4(_m);
        feet[0]!.push({ t, y: _v.y, z: _v.z });
        fr.getWorldPosition(_v).applyMatrix4(_m);
        feet[1]!.push({ t, y: _v.y, z: _v.z });
      }
      a.stop();
      const s = strideFromFeet(feet, clip.duration);
      if (s !== null && s > 0.2 * height && s < 3 * height) {
        out[k] = s / height;
        out.measured = true;
      }
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(rig.model);
    for (const [b, p, q, s] of snap) {
      b.position.copy(p);
      b.quaternion.copy(q);
      b.scale.copy(s);
    }
    rig.root.updateMatrixWorld(true);
  }
  strideCache.set(src, out);
  return out;
}

// ---- the person ---------------------------------------------------------------------------------

/** How the stand-in gets its models (the people system passes `ctx.assets`). */
export interface StandInLoader {
  model(id: CharacterModel): Promise<LoadedModel>;
  peek(id: CharacterModel): LoadedModel | null;
}

/** One frame of the people system for one person. */
export interface PersonTick {
  dt: number;
  rate: AnimRate;
  /** Beyond the draw limit. */
  hidden: boolean;
  reducedMotion: boolean;
  reducedFlash: boolean;
}

/** Debug / test snapshot of a person (`kq.people.get`). */
export interface PersonState {
  id: string;
  specId: string;
  name: string;
  speaker: string | null;
  x: number;
  y: number;
  z: number;
  /** Radians, player convention. */
  yaw: number;
  speed: number;
  /** The clip asked for last; the looping clip now; what plays (nearest supported); the one-shot playing. */
  clip: PersonClip;
  base: PersonClip;
  playing: PersonClip;
  shot: PersonClip | null;
  look: PersonLook;
  visible: boolean;
  ready: boolean | null;
  fallback: boolean;
  lod: AnimRate;
  tier: PersonInfo['tier'];
  height: number;
  radius: number;
  /** Measured strides (m per loop at this height). */
  stride: { walk: number; run: number; measured: boolean };
  weights: Record<'idle' | 'walk' | 'run' | 'interact' | 'wave', number>;
  drop: number;
  head: { yaw: number; pitch: number };
  tris: number;
  drawCalls: number;
}

interface Part {
  mesh: Mesh;
  solid: MeshStandardMaterial;
  cloth: Color;
  sphere: Sphere;
  ghost?: { body: ShaderMaterial; depth: ShaderMaterial };
  twin?: Mesh;
  tris: number;
}

interface Base {
  clip: PersonClip;
  plan: StandInPlan;
  loop: boolean;
  fade: number;
  speed: number;
  t: number;
}

interface Shot {
  clip: PersonClip;
  /** A talk gesture the person makes by itself (not asked for). */
  auto: boolean;
  src: ShotSrc;
  t: number;
  dur: number;
  speed: number;
  loop: boolean;
  fade: number;
}

let autoSeed = 0;

export class StandInPerson implements Person {
  readonly root = new Group();
  readonly info: PersonInfo;
  readonly ready: Promise<boolean>;
  readonly name: string;
  readonly speaker: string | undefined;
  private resolveReady: (ok: boolean) => void = () => {};
  private isReady: boolean | null = null;
  private rig: Rig | null = null;
  private fallback: Mesh | null = null;
  private readonly parts: Part[] = [];
  private shared: Record<string, { value: unknown }> | null = null;
  private readonly owned: Material[] = [];
  private readonly geos: BufferGeometry[] = [];
  private look: PersonLook;
  private wantVisible = true;
  private lodHidden = false;
  private disposed = false;
  private readonly seed: number;
  private readonly tempo: number;
  // locomotion
  private speed = 0;
  private eff = 0;
  private phase = 0;
  private idleT: number;
  private stride = { walk: 0, run: 0, measured: false };
  // clips
  private requested: PersonClip = 'idle';
  private base: Base;
  private shot: Shot | null = null;
  private gestureT = 0;
  private gestures = 0;
  private readonly w = { idle: 1, walk: 0, run: 0, interact: 0, wave: 0 };
  private readonly shotTime = { interact: 0, wave: 0 };
  private loco: Record<LocoSrc, { low: AnimationAction; up: AnimationAction } | null> = { idle: null, walk: null, run: null };
  private shots: Record<ShotSrc, { up: AnimationAction; full: AnimationAction } | null> = { interact: null, wave: null };
  private drop = 0;
  // turning, head
  private faceTarget: number | null = null;
  private readonly lookTarget = new Vector3();
  private looking = false;
  private headYaw = 0;
  private headPitch = 0;
  private neck: Bone | null = null;
  private head: Bone | null = null;
  private readonly neckQ = new Quaternion();
  private readonly headQ = new Quaternion();
  private turned = false;
  // LOD
  private rate: AnimRate = 'full';
  private lodAcc: number;
  private sinceEval = 0;
  private needsPose = true;
  private alpha = 0;

  constructor(
    readonly id: string,
    readonly specId: string,
    private readonly spec: PersonSpec,
    o: PersonSpawnOpts & { y: number },
    loader: StandInLoader,
    private readonly onDispose: (p: StandInPerson) => void,
  ) {
    this.info = Object.freeze({ specId, tier: o.tier ?? spec.tier, height: spec.height, radius: spec.radius, clips: STANDIN_SUPPORTED });
    this.name = o.name ?? specId;
    this.speaker = o.speaker;
    this.look = o.look ?? spec.look;
    this.seed = spec.seed + (Number.isFinite(o.seed) ? (o.seed as number) : ++autoSeed * 7.31);
    this.tempo = 0.94 + 0.12 * hash01(this.seed);
    this.idleT = hash01(this.seed * 3.1) * 10;
    this.lodAcc = hash01(this.seed * 5.7) * 0.1;
    this.base = this.makeBase('idle', {});
    this.stride.walk = STRIDE_PER_HEIGHT.walk * spec.height;
    this.stride.run = STRIDE_PER_HEIGHT.run * spec.height;
    this.root.name = `person:${id}`;
    this.root.position.set(o.x, o.y, o.z);
    this.root.rotation.y = Number.isFinite(o.yaw) ? (o.yaw as number) : 0;
    this.root.visible = false;
    this.root.userData.person = id;
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
          console.warn(`[people] ${spec.model} failed, ${id} is a capsule`, e);
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
      const rig = new Rig(src, spec.height);
      // strides measured at the model's own build (cached per model), then the width factor: the
      // feet's forward travel shrinks with the z scale, and so does the stride
      const st = measureStrides(rig, src, spec.height);
      this.stride = { walk: st.walk * spec.height * spec.build, run: st.run * spec.height * spec.build, measured: st.measured };
      if (spec.build !== 1) {
        rig.holder.scale.x *= spec.build;
        rig.holder.scale.z *= spec.build;
      }
      // a conservative bound for every part in its own frame (one sphere round the whole body,
      // arms up or striding included), so frustum culling stays on for skinned parts
      rig.root.updateMatrixWorld(true);
      const R = spec.height * 0.78;
      for (const m of rig.meshes) {
        const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as MeshStandardMaterial | undefined;
        const slot = mat?.name ?? '';
        if (!mat || !standinShows(spec, m.name, slot)) {
          m.visible = false;
          continue;
        }
        const hex = standinColour(spec, m.name, slot);
        const solid = mat.clone() as MeshStandardMaterial;
        delete solid.userData.kqStandard;
        if (hex !== null) solid.color.setHex(hex);
        solid.roughness = slot === 'Skin' ? 0.62 : slot === 'Gold' ? 0.4 : slot === 'Eye' ? 0.3 : 0.82;
        solid.metalness = slot === 'Gold' ? 0.5 : 0;
        kqStandard(solid, { ambient: 1.15 });
        // screen-door fade in (no sorting)
        solid.alphaHash = true;
        solid.opacity = 0;
        this.owned.push(solid);
        _m.copy(m.matrixWorld).invert();
        const centre = _w.set(0, spec.height * 0.5, 0).applyMatrix4(_m).clone();
        const scale = m.matrixWorld.getMaxScaleOnAxis();
        const sphere = new Sphere(centre, R / Math.max(1e-6, scale));
        m.frustumCulled = true;
        (m as Mesh & { boundingSphere: Sphere | null }).boundingSphere = sphere;
        m.material = solid;
        const g = m.geometry;
        const tris = Math.round((g.index ? g.index.count : g.getAttribute('position').count) / 3);
        this.parts.push({ mesh: m, solid, cloth: hex !== null ? linHex(hex) : solid.color.clone(), sphere, tris });
      }
      // clips: locomotion split into legs / upper body; one-shots as upper-only and full-body copies
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
        this.loco[k] = c ? { low: act(c.low), up: act(c.up) } : null;
      }
      for (const k of ['interact', 'wave'] as const) {
        const c = set.shots[k];
        this.shots[k] = c ? { up: act(c.up), full: act(c.full) } : null;
      }
      this.neck = rig.bones.get('Neck') ?? null;
      this.head = rig.info.head ? (rig.bones.get(rig.info.head) ?? null) : null;
      // the model faces +z, the contract's root faces −z: the body turns round inside the root
      rig.root.rotation.y = Math.PI;
      this.rig = rig;
      this.applyLook();
      this.root.add(rig.root);
      this.needsPose = true;
      this.updateVisible();
      return true;
    } catch (e) {
      console.warn(`[people] building ${this.id} failed, it is a capsule`, e);
      this.rig?.dispose();
      this.rig = null;
      this.buildFallback();
      return false;
    }
  }

  /** The load failed: a plain capsule of the spec's height in its main colour (still placeable, no animation). */
  private buildFallback(): void {
    if (this.fallback || this.disposed) return;
    const s = this.spec;
    const r = s.radius * 0.8;
    const geo = new CapsuleGeometry(r, Math.max(0.1, s.height - 2 * r), 4, 10);
    geo.translate(0, s.height / 2, 0);
    const p = s.palette;
    const mat = kqStandard(new MeshStandardMaterial({ color: p.Green ?? p.LimeGreen ?? p.Brown ?? 0x808080, roughness: 0.8 }), { ambient: 1.15 });
    this.geos.push(geo);
    this.owned.push(mat);
    const m = new Mesh(geo, mat);
    m.castShadow = true;
    m.name = 'person-fallback';
    this.fallback = m;
    this.alpha = 1;
    this.root.add(m);
    this.updateVisible();
  }

  /** Lay the current look over the body's parts. */
  private applyLook(): void {
    const ghost = this.look === 'ghost';
    if (ghost && !this.shared) {
      this.shared = ghostShared(linHex(this.spec.tint), this.seed % 97, 0.2);
      this.shared.uHeight!.value = this.spec.height;
      this.shared.uGlow!.value = 1.15;
    }
    for (const p of this.parts) {
      if (ghost) {
        if (!p.ghost) {
          p.ghost = ghostMaterials(this.shared!, p.cloth);
          this.owned.push(p.ghost.body, p.ghost.depth);
          const d = p.mesh.clone(false) as Mesh;
          d.material = p.ghost.depth;
          d.renderOrder = 6;
          d.frustumCulled = true;
          (d as Mesh & { boundingSphere: Sphere | null }).boundingSphere = p.sphere;
          p.mesh.parent?.add(d);
          p.twin = d;
        }
        p.mesh.material = p.ghost.body;
        p.mesh.renderOrder = 7;
        p.mesh.castShadow = false;
        p.twin!.visible = true;
      } else {
        p.mesh.material = p.solid;
        p.mesh.renderOrder = 0;
        p.mesh.castShadow = true;
        if (p.twin) p.twin.visible = false;
      }
    }
  }

  private updateVisible(): void {
    this.root.visible = this.wantVisible && !this.lodHidden && !this.disposed && (this.rig !== null || this.fallback !== null);
  }

  // ---- the contract -----------------------------------------------------------------------------

  setSpeed(mps: number): void {
    this.speed = Number.isFinite(mps) ? Math.max(0, Math.min(12, mps)) : 0;
  }

  play(clip: PersonClip, o: { loop?: boolean; fade?: number; speed?: number } = {}): void {
    const plan = STANDIN_CLIPS[clip];
    if (!plan) {
      console.warn(`[people] unknown clip '${String(clip)}', playing idle`);
      return this.play('idle', o);
    }
    this.requested = clip;
    if (plan.kind === 'shot') {
      const src = plan.shot!;
      const a = this.shots[src];
      this.shot = { clip, auto: false, src, t: 0, dur: a?.full.getClip().duration ?? 1.2, speed: Math.max(0.05, o.speed ?? 1), loop: o.loop ?? false, fade: o.fade ?? DEFAULT_FADE };
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

  private makeBase(clip: PersonClip, o: { loop?: boolean; fade?: number; speed?: number }): Base {
    if (clip === 'talk' || clip === 'sitTalk') this.gestureT = 0;
    return { clip, plan: STANDIN_CLIPS[clip], loop: o.loop ?? true, fade: Math.max(0, o.fade ?? DEFAULT_FADE), speed: Math.max(0.05, o.speed ?? 1), t: 0 };
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

  setLook(look: PersonLook): void {
    if (look !== 'solid' && look !== 'ghost') return;
    if (look === this.look) return;
    this.look = look;
    if (this.rig) this.applyLook();
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
    for (const p of this.parts) p.twin?.removeFromParent();
    this.parts.length = 0;
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

  // ---- per frame (the people system) ------------------------------------------------------------

  tick(f: PersonTick): void {
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
    if (!b.loop) {
      const cyc = CYCLE[b.clip] ?? Infinity;
      if (b.t > cyc) b = this.base = this.makeBase(b.plan.drop ? 'sit' : 'idle', { fade: b.fade });
    }
    const plan = b.plan;
    this.eff = this.speed;
    this.phase = advancePhase(this.phase, this.eff, this.stride.walk, this.stride.run, dt);
    this.idleT += dt * this.tempo * (moving ? 1 : b.speed) * (f.reducedMotion ? 0.6 : 1);
    // talk: a hand comes up every few seconds (not while walking, not with reduced motion)
    if (plan.gestures && !moving && !f.reducedMotion) {
      if (!this.shot) this.gestureT += dt;
      if (this.gestureT > 3.2 + (this.gestures % 2) * 1.3 + hash01(this.seed + this.gestures) * 0.9) {
        this.gestureT = 0;
        this.gestures++;
        const a = this.shots.interact;
        this.shot = { clip: 'interact', auto: true, src: 'interact', t: 0, dur: a?.full.getClip().duration ?? 1.2, speed: 0.8, loop: false, fade: 0.35 };
      }
    }
    const s = this.shot;
    if (s) {
      s.t += dt;
      if (!s.loop && s.t * s.speed >= s.dur) this.shot = null;
    }
    // ---- weights (eased every frame)
    const lw = locoWeights(this.eff);
    const fade = b.fade;
    this.w.idle = easeWeight(this.w.idle, lw.idle, dt, fade);
    this.w.walk = easeWeight(this.w.walk, lw.walk, dt, fade);
    this.w.run = easeWeight(this.w.run, lw.run, dt, fade);
    for (const k of ['interact', 'wave'] as const) {
      const on = s && s.src === k ? shotTarget(s.t * s.speed, s.dur, s.fade, s.loop) : 0;
      this.w[k] = easeWeight(this.w[k], on, dt, s && s.src === k ? s.fade : DEFAULT_FADE);
      if (s && s.src === k) this.shotTime[k] = s.loop ? (s.t * s.speed) % s.dur : Math.min(s.t * s.speed, s.dur * 0.999);
    }
    // sit (stand-in): the body sinks onto the seat
    this.drop = easeWeight(this.drop, !moving && plan.drop ? plan.drop : 0, dt, 0.45);
    rig.root.position.y = -this.drop;
    // ---- pose, at the LOD's rate
    this.sinceEval += dt;
    const tk = animTick(this.lodAcc, dt, f.rate);
    this.lodAcc = tk.acc;
    if (this.root.visible && (tk.evaluate || this.needsPose)) {
      this.evaluate(this.sinceEval, moving, plan, f.reducedMotion);
      this.sinceEval = 0;
      this.needsPose = false;
    }
    this.lookFrame(dt, f);
  }

  private evaluate(dt: number, moving: boolean, plan: StandInPlan, reduced: boolean): void {
    const rig = this.rig!;
    // the mixer writes a bone only when its value changed: put last evaluation's head turn back first
    if (this.turned) {
      this.neck?.quaternion.copy(this.neckQ);
      this.head?.quaternion.copy(this.headQ);
      this.turned = false;
    }
    const still = 1 - moveAmount(this.eff);
    let fullW = 0;
    let upperW = 0;
    for (const k of ['interact', 'wave'] as const) {
      const a = this.shots[k];
      if (!a) continue;
      const w = this.w[k];
      a.up.time = a.full.time = this.shotTime[k];
      a.up.setEffectiveWeight(w * (1 - still));
      a.full.setEffectiveWeight(w * still);
      fullW += w * still;
      upperW += w * (1 - still);
    }
    fullW = Math.min(1, fullW);
    upperW = Math.min(1, upperW);
    for (const k of ['idle', 'walk', 'run'] as const) {
      const l = this.loco[k];
      if (!l) continue;
      const d = l.low.getClip().duration;
      const t = k === 'idle' ? this.idleT % d : this.phase * d;
      l.low.time = l.up.time = t;
      l.low.setEffectiveWeight(this.w[k] * (1 - fullW));
      l.up.setEffectiveWeight(this.w[k] * (1 - fullW) * (1 - upperW));
    }
    rig.update(0);
    // the head: toward the look target within limits, lookAround's sweep, a nod while talking
    let yaw = 0;
    let pitch = 0;
    if (this.looking && this.head) {
      this.head.getWorldPosition(_v);
      rig.root.updateMatrixWorld();
      _m.copy(rig.root.matrixWorld).invert();
      const t = _w.copy(this.lookTarget).applyMatrix4(_m);
      const h = _v.applyMatrix4(_m);
      const a = headAim(t.x - h.x, t.y - h.y, t.z - h.z);
      yaw = a.yaw;
      pitch = a.pitch;
    } else if (plan.sweep && !moving) yaw = reduced ? 0 : sweepYaw(this.idleT, this.seed);
    if (plan.gestures && !moving && !reduced) pitch += Math.sin(this.idleT * 6.5) * 0.035;
    const k = 1 - Math.exp(-dt * (reduced ? 12 : 5));
    this.headYaw += (yaw - this.headYaw) * k;
    this.headPitch += (pitch - this.headPitch) * k;
    if (this.neck) this.neckQ.copy(this.neck.quaternion);
    if (this.head) this.headQ.copy(this.head.quaternion);
    if (Math.abs(this.headYaw) > 1e-4 || Math.abs(this.headPitch) > 1e-4) {
      rig.turnBone(this.neck ? this.neck.name : null, this.headYaw * 0.35, 0);
      rig.turnBone(this.head ? this.head.name : null, this.headYaw * 0.65, this.headPitch);
      this.turned = true;
    }
  }

  /** The fade in after loading, the ghost's per-frame uniforms. */
  private lookFrame(dt: number, f: PersonTick): void {
    if (this.alpha < 1) {
      this.alpha = Math.min(1, this.alpha + dt / 0.35);
      const o = this.alpha >= 1 ? 1 : this.alpha;
      for (const p of this.parts) p.solid.opacity = o;
    }
    const u = this.shared;
    if (u && this.look === 'ghost' && this.root.visible && this.rig) {
      u.uAlpha!.value = this.alpha;
      this.rig.root.getWorldPosition(_v);
      u.uBaseY!.value = _v.y;
      u.uTalk!.value = this.base.plan.gestures ? 1 : 0;
      u.uMotion!.value = f.reducedMotion ? 0.4 : 1;
      u.uStutter!.value = f.reducedFlash ? 0 : 1;
    }
  }

  // ---- debug ------------------------------------------------------------------------------------

  /** Triangles and draw calls this person costs now (0 when not drawn; frustum culling not counted). */
  drawStats(): { tris: number; calls: number } {
    if (!this.root.visible) return { tris: 0, calls: 0 };
    let tris = 0;
    let calls = 0;
    const k = this.look === 'ghost' ? 2 : 1;
    for (const p of this.parts) {
      tris += p.tris * k;
      calls += k;
    }
    if (this.fallback) {
      const g = this.fallback.geometry;
      tris += Math.round((g.index ? g.index.count : g.getAttribute('position').count) / 3);
      calls += 1;
    }
    return { tris, calls };
  }

  state(): PersonState {
    const r = this.root;
    const st = this.drawStats();
    const round = (n: number) => Math.round(n * 1000) / 1000;
    return {
      id: this.id,
      specId: this.specId,
      name: this.name,
      speaker: this.speaker ?? null,
      x: round(r.position.x),
      y: round(r.position.y),
      z: round(r.position.z),
      yaw: round(wrapPi(r.rotation.y)),
      speed: this.speed,
      clip: this.requested,
      base: this.base.clip,
      playing: resolveClip(this.shot && !this.shot.auto ? this.shot.clip : this.base.clip, this.info.clips),
      shot: this.shot?.clip ?? null,
      look: this.look,
      visible: r.visible,
      ready: this.isReady,
      fallback: this.fallback !== null,
      lod: this.rate,
      tier: this.info.tier,
      height: this.info.height,
      radius: this.info.radius,
      stride: { walk: round(this.stride.walk), run: round(this.stride.run), measured: this.stride.measured },
      weights: { idle: round(this.w.idle), walk: round(this.w.walk), run: round(this.w.run), interact: round(this.w.interact), wave: round(this.w.wave) },
      drop: round(this.drop),
      head: { yaw: round(this.headYaw), pitch: round(this.headPitch) },
      tris: st.tris,
      drawCalls: st.calls,
    };
  }

  /** The body (for tests): the rig's root, or null before it is in. */
  get body(): Object3D | null {
    return this.rig?.root ?? null;
  }
}
