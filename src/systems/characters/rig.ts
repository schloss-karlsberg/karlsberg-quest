/**
 * A rigged CC0 model in the world: a skinned clone of a loaded GLB, scaled to a height, with an
 * AnimationMixer and cross-faded clips, additive bone turns after the mixer (a head that looks
 * at you, a nod) and helpers to attach props to bones. Materials are the owner's business
 * (ghost.ts / spectral.ts replace them).
 *
 * Measurements of a source model (height in its own units, the feet, eye centres in the head
 * bone's frame, the hand and head-top positions) are taken once from the bind pose and cached.
 */
import {
  type AnimationAction,
  type AnimationClip,
  AnimationMixer,
  type Bone,
  Box3,
  Group,
  LoopOnce,
  LoopRepeat,
  Matrix4,
  type Mesh,
  type Object3D,
  PropertyBinding,
  Quaternion,
  type SkinnedMesh,
  Vector3,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { LoadedModel } from '../../assets/loader';
import { type LogicalBone, type RigKind, boneName, rigKindOf } from './bones';

export interface RigInfo {
  /** Bind-pose height and lowest point (model units). */
  height: number;
  minY: number;
  /** Head bone and the eye centres in its local frame (from the eye material's vertices). */
  head: string | null;
  eyes: { l: Vector3; r: Vector3 } | null;
  /** Top of the head and the midpoint between the eyes (model units, bind pose). */
  headTop: Vector3 | null;
  eyeMid: Vector3 | null;
}

const cache = new WeakMap<Object3D, RigInfo>();
const _v = new Vector3();
const _m = new Matrix4();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _axis = new Vector3();

/** Outfit pieces other than the default one (`avatar-<costume>-<piece>`, see src/player/costume.ts). */
const ALT_OUTFIT = /^avatar-(?!default-)[a-z]+-/;

function isSkinned(o: Object3D): o is SkinnedMesh {
  return (o as SkinnedMesh).isSkinnedMesh === true;
}

/**
 * A skinned clone (SkeletonUtils.clone) in which meshes that share one skeleton in the source share
 * one in the clone too: SkeletonUtils gives every mesh its own copy, and three updates and uploads
 * each skeleton's bone matrices once per frame (the MPFB player's outfit pieces: one, not eight).
 */
export function cloneRigged(source: Object3D): Object3D {
  const copy = cloneSkinned(source);
  const src: SkinnedMesh[] = [];
  const dst: SkinnedMesh[] = [];
  source.traverse((o) => isSkinned(o) && src.push(o));
  copy.traverse((o) => isSkinned(o) && dst.push(o));
  const shared = new Map<SkinnedMesh['skeleton'], SkinnedMesh['skeleton']>();
  dst.forEach((m, i) => {
    const from = src[i]?.skeleton;
    if (!from) return;
    const first = shared.get(from);
    if (first) m.bind(first, m.bindMatrix);
    else shared.set(from, m.skeleton);
  });
  return copy;
}

/**
 * A bone (or any node) by name, as written in the source rig or as three's GLTFLoader renamed it:
 * the loader runs node names through `PropertyBinding.sanitizeNodeName`, which drops `.` (and
 * `[]:/`, whitespace to `_`), so 'UpperLeg.L' loads as 'UpperLegL'. Tries the name as given first.
 */
export function findBone(root: Object3D, name: string): Object3D | undefined {
  const hit = root.getObjectByName(name);
  if (hit) return hit;
  const clean = PropertyBinding.sanitizeNodeName(name);
  return clean !== name ? root.getObjectByName(clean) : undefined;
}

/** Bind-pose measurements of a loaded model (cached per source scene). */
export function rigInfo(src: LoadedModel): RigInfo {
  const hit = cache.get(src.scene);
  if (hit) return hit;
  const scene = src.scene;
  scene.updateMatrixWorld(true);
  const box = new Box3();
  const eyeL = new Vector3();
  const eyeR = new Vector3();
  let nL = 0;
  let nR = 0;
  const pts: Vector3[] = [];
  scene.traverse((o) => {
    const m = o as Mesh;
    // gear that sticks out (the adventurer's backpack) is not the body, nor are the pieces of an
    // alternate outfit (the MPFB player's avatar-court-*: hidden until worn, src/player/costume.ts)
    if (!m.isMesh || /backpack/i.test(m.name) || ALT_OUTFIT.test(m.name)) return;
    const pos = m.geometry.getAttribute('position');
    const eye = /^eyes?(_black)?$/i.test((m.material as { name?: string }).name ?? '');
    for (let i = 0; i < pos.count; i++) {
      if (isSkinned(m)) m.getVertexPosition(i, _v);
      else _v.fromBufferAttribute(pos, i);
      _v.applyMatrix4(m.matrixWorld);
      box.expandByPoint(_v);
      if (i % 2 === 0) pts.push(_v.clone());
      if (eye) {
        if (_v.x < 0) {
          eyeL.add(_v);
          nL++;
        } else {
          eyeR.add(_v);
          nR++;
        }
      }
    }
  });
  let head: Bone | null = null;
  scene.traverse((o) => {
    if ((o as Bone).isBone && !head && /^head$/i.test(o.name)) head = o as Bone;
  });
  const h = head as Bone | null;
  let eyes: RigInfo['eyes'] = null;
  let eyeMid: Vector3 | null = null;
  if (nL && nR) {
    eyeL.multiplyScalar(1 / nL);
    eyeR.multiplyScalar(1 / nR);
    eyeMid = eyeL.clone().add(eyeR).multiplyScalar(0.5);
    if (h) {
      _m.copy(h.matrixWorld).invert();
      eyes = { l: eyeL.clone().applyMatrix4(_m), r: eyeR.clone().applyMatrix4(_m) };
    }
  }
  // top of the head: the highest vertex above the eyes within a head's width of them (bind pose)
  let headTop: Vector3 | null = null;
  if (eyeMid) {
    const gap = Math.max(eyeL.distanceTo(eyeR), box.max.y * 0.02);
    const cz = eyeMid.z - gap * 0.9;
    let top = eyeMid.y;
    for (const p of pts) if (p.y > top && Math.hypot(p.x - eyeMid.x, p.z - cz) < gap * 2.2) top = p.y;
    headTop = new Vector3(eyeMid.x, top, cz);
  }
  const info: RigInfo = { height: Math.max(1e-6, box.max.y - box.min.y), minY: box.min.y, head: h?.name ?? null, eyes, headTop, eyeMid };
  cache.set(src.scene, info);
  return info;
}

export interface PlayOpts {
  /** Cross-fade seconds (0 = cut). */
  fade?: number;
  once?: boolean;
  speed?: number;
  /** Restart even if it is already the current clip. */
  restart?: boolean;
}

export class Rig {
  /** Place this (world position, yaw). */
  readonly root = new Group();
  /** Scaled holder of the model (feet at the root's origin). */
  readonly holder = new Group();
  readonly model: Object3D;
  readonly mixer: AnimationMixer;
  readonly info: RigInfo;
  /** Model units → metres. */
  readonly scale: number;
  readonly bones = new Map<string, Bone>();
  readonly meshes: Mesh[] = [];
  /** Which rig this is (bones.ts: Quaternius or the MPFB game_engine rig), null for others (animals). */
  readonly kind: RigKind | null;
  private readonly clips = new Map<string, AnimationClip>();
  private readonly actions = new Map<string, AnimationAction>();
  current: AnimationAction | null = null;
  currentName = '';
  /** Bones turned after the mixer (`turnBone`), each with the pose the mixer had left it in. */
  private readonly turned = new Map<Bone, Quaternion>();
  private readonly spare: Quaternion[] = [];

  constructor(src: LoadedModel, height: number) {
    this.info = rigInfo(src);
    this.model = cloneRigged(src.scene);
    this.scale = height / this.info.height;
    this.holder.scale.setScalar(this.scale);
    this.holder.position.y = -this.info.minY * this.scale;
    this.holder.add(this.model);
    this.root.add(this.holder);
    this.model.traverse((o) => {
      if ((o as Bone).isBone) this.bones.set(o.name, o as Bone);
      if ((o as Mesh).isMesh) {
        this.meshes.push(o as Mesh);
        o.frustumCulled = false;
      }
    });
    for (const c of src.animations) this.clips.set(c.name, c);
    this.mixer = new AnimationMixer(this.model);
    this.kind = rigKindOf((n) => this.bones.has(n));
  }

  /** A bone by its name as given or in GLTFLoader's sanitized form (see `findBone`). */
  bone(name: string): Bone | undefined {
    return this.bones.get(name) ?? this.bones.get(PropertyBinding.sanitizeNodeName(name));
  }

  /** A logical bone (bones.ts: 'hips', 'hand_r' …) under this rig's own name. */
  boneOf(bone: LogicalBone): Bone | undefined {
    const n = this.kind ? boneName(this.kind, bone) : null;
    return n ? this.bone(n) : undefined;
  }

  /** The key of a logical bone in `bones` (the loaded, sanitized name), for `turnBone` / `boneWorld`. */
  boneNameOf(bone: LogicalBone): string | null {
    return this.boneOf(bone)?.name ?? null;
  }

  has(name: string): boolean {
    return this.clips.has(name);
  }

  duration(name: string): number {
    return this.clips.get(name)?.duration ?? 1;
  }

  action(name: string): AnimationAction | null {
    let a = this.actions.get(name);
    if (!a) {
      const c = this.clips.get(name);
      if (!c) return null;
      a = this.mixer.clipAction(c);
      this.actions.set(name, a);
    }
    return a;
  }

  /** Cross-fade to a clip (a no-op when it already plays, unless `restart`). */
  play(name: string, o: PlayOpts = {}): AnimationAction | null {
    const a = this.action(name);
    if (!a) return null;
    a.timeScale = o.speed ?? 1;
    a.paused = false;
    if (this.current === a && !o.restart) return a;
    const prev = this.current;
    a.reset();
    a.setLoop(o.once ? LoopOnce : LoopRepeat, Infinity);
    a.clampWhenFinished = !!o.once;
    a.enabled = true;
    a.setEffectiveTimeScale(o.speed ?? 1);
    a.setEffectiveWeight(1);
    a.play();
    const fade = o.fade ?? 0.2;
    if (prev && prev !== a) {
      if (fade > 0) a.crossFadeFrom(prev, fade, false);
      else prev.stop();
    }
    this.current = a;
    this.currentName = name;
    return a;
  }

  /** Hold a clip at a fraction of its length (anticipation poses: a wind-up). */
  hold(name: string, k: number, fade = 0.15): void {
    const a = this.play(name, { once: true, fade });
    if (!a) return;
    a.paused = true;
    a.time = Math.max(0, Math.min(1, k)) * a.getClip().duration;
  }

  /** Seconds into the current clip / its length. */
  progress(): number {
    const a = this.current;
    return a ? a.time / Math.max(1e-3, a.getClip().duration) : 0;
  }

  update(dt: number): void {
    this.restoreTurns();
    this.mixer.update(dt);
  }

  /**
   * Put every bone turned since the last update back into the pose the mixer left it in. The mixer
   * writes a bone only when its blended value changed, and never one without a track, so a turn
   * on a bone that holds still in the playing clips (a constant track: the MPFB player's spine_01)
   * would otherwise stay and the next frame's turn pile on top of it (TASK-091).
   */
  private restoreTurns(): void {
    for (const [b, q] of this.turned) {
      b.quaternion.copy(q);
      this.spare.push(q);
    }
    this.turned.clear();
  }

  /**
   * Turn a bone after the mixer: `yaw` about the world vertical, `pitch` about the root's right
   * axis (radians). Uses last frame's parent matrices (a frame late, invisible at these speeds).
   * The turn lasts until the next `update`, which starts from the mixer's pose again: call it
   * every frame, after `update`.
   */
  turnBone(name: string | null, yaw: number, pitch = 0): void {
    if (!name) return;
    const b = this.bone(name);
    const p = b?.parent;
    if (!b || !p) return;
    if ((yaw || pitch) && !this.turned.has(b)) this.turned.set(b, (this.spare.pop() ?? new Quaternion()).copy(b.quaternion));
    p.getWorldQuaternion(_q).invert();
    if (yaw) {
      _axis.set(0, 1, 0).applyQuaternion(_q).normalize();
      b.quaternion.premultiply(_q2.setFromAxisAngle(_axis, yaw));
    }
    if (pitch) {
      this.root.getWorldQuaternion(_q2);
      _axis.set(1, 0, 0).applyQuaternion(_q2).applyQuaternion(_q).normalize();
      b.quaternion.premultiply(_q2.setFromAxisAngle(_axis, pitch));
    }
  }

  /** World position of a point given in a bone's local frame (eyes). */
  boneWorld(name: string | null, local: Vector3, out: Vector3): Vector3 | null {
    const b = name ? this.bone(name) : undefined;
    if (!b) return null;
    return out.copy(local).applyMatrix4(b.matrixWorld);
  }

  /**
   * Attach an object built in the model's bind-pose space (model units) to a bone, so it follows
   * the bone from then on. Call before the first mixer update (the clone is still in bind pose).
   */
  attach(boneName: string, obj: Object3D): boolean {
    const b = this.bone(boneName);
    if (!b) return false;
    this.model.updateMatrixWorld(true);
    // bind-pose model space → the bone's local frame (the model root sits inside the holder)
    _m.copy(this.model.matrixWorld).invert().multiply(b.matrixWorld).invert();
    obj.applyMatrix4(_m);
    b.add(obj);
    return true;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.root.removeFromParent();
  }
}
