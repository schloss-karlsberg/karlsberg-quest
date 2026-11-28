/**
 * The rigged body of an NPC: a Quaternius CC0 human (catalog.ts) in its costume colours, with the
 * figure's own hat on the head bone and its prop in the right hand. It breathes (idle clip),
 * walks when it moves (an escort), gestures while it talks, greets warmly, and turns its head
 * to the player before the body follows.
 *
 * Two looks (`NpcPlacement.look`, ./look.ts):
 *  - 'solid' (the default, every quality tier): a living person. The model's material slots are
 *    cloned, recoloured and lit by the world like the tour group's stand-ins (`kqStandard`),
 *    opaque, casting shadows. Appearing and leaving dither in a third of a second (alphaHash, no
 *    sorting, depth written); in between the opacity is exactly 1.
 *  - 'ghost' (medium / high): the ghost shader (characters/shaders.ts) with depth pre-pass twins.
 *    The procedural figure (figure.ts) is its fallback on the low tier, while the model loads,
 *    and for the kneeling pose.
 */
import { type BufferGeometry, Color, DoubleSide, type Material, Matrix4, Mesh, MeshStandardMaterial, Quaternion, type ShaderMaterial, type Skeleton, type SkinnedMesh, Vector3 } from 'three';
import type { LoadedModel } from '../../assets/loader';
import { kqStandard } from '../../render/standard';
import { builtInHat, costumeFor, HIDDEN_MESHES, modelFor, slotColour } from '../characters/catalog';
import { Rig } from '../characters/rig';
import { ghostMaterials, ghostShared, linHex } from '../characters/shaders';
import { attachPike, pikeGeometry } from '../court/props';
import { figureExtras } from './figure';
import type { FigureLook } from './look';
import type { NpcLook } from './roster';

/** The calm standing idle (the pack's 'Idle' shifts its weight like a fighter). */
const IDLE = 'Idle_Neutral';
const _v = new Vector3();
const _w = new Vector3();
const _m = new Matrix4();
const _inv = new Matrix4();

export interface RiggedFrame {
  dt: number;
  alpha: number;
  talk: number;
  motion: number;
  stutter: number;
  reducedMotion: boolean;
  /** Where the figure looks (the player's eye), or null. */
  lookAt: Vector3 | null;
}

/** Roughness / metalness of a solid model slot (the stand-ins' values, people/standin.ts). */
function solidSurface(slot: string): { roughness: number; metalness: number } {
  return { roughness: slot === 'Skin' ? 0.62 : slot === 'Gold' ? 0.4 : slot === 'Eye' ? 0.3 : 0.82, metalness: slot === 'Gold' ? 0.5 : 0 };
}

export class RiggedNpc {
  readonly rig: Rig;
  /** Ghost look: the uniforms every part shares (null on a solid body). */
  readonly shared: Record<string, { value: unknown }> | null;
  private readonly mats: ShaderMaterial[] = [];
  /** Solid look: one material per model slot and extra (opacity = the figure's fade). */
  private readonly solids: MeshStandardMaterial[] = [];
  private readonly geos: BufferGeometry[] = [];
  private readonly last = new Vector3(NaN, 0, 0);
  speed = 0;
  private headYaw = 0;
  private headPitch = 0;
  private talkT = 0;
  private wasTalking = false;
  private gesture = 0;

  constructor(
    readonly look: NpcLook,
    src: LoadedModel,
    tint: Color,
    readonly kind: FigureLook = 'ghost',
  ) {
    const model = modelFor(look);
    this.rig = new Rig(src, look.height);
    if (kind === 'ghost') {
      this.shared = ghostShared(tint, look.seed, look.mood === 'eerie' ? 1 : look.mood === 'neutral' ? 0.4 : 0);
      this.shared.uHeight!.value = look.height;
      this.shared.uGlow!.value = look.mood === 'warm' ? 1.25 : look.mood === 'eerie' ? 1.0 : 1.1;
    } else this.shared = null;
    const costume = costumeFor(look);
    const hide = HIDDEN_MESHES[model];
    for (const m of [...this.rig.meshes]) {
      if (hide?.test(m.name)) {
        m.visible = false;
        continue;
      }
      const orig = (Array.isArray(m.material) ? m.material[0] : m.material) as (Material & { color?: Color }) | undefined;
      const hex = slotColour(costume, m.name, orig?.name ?? '');
      if (kind === 'solid') this.dressSolid(m, hex, orig);
      else this.dress(m, hex !== null ? linHex(hex) : (orig?.color?.clone() ?? new Color(0.5, 0.5, 0.5)));
    }
    this.extras(model);
    this.rig.root.userData.ghost = this;
    this.rig.play('Idle_Neutral', { fade: 0 });
    // no two figures breathe in step
    const a = this.rig.current;
    if (a) a.time = (look.seed * 0.37) % a.getClip().duration;
  }

  /** Give a part its material: ghost (with a depth pre-pass twin) or solid (`hex`: sRGB cloth colour). */
  private wear(m: Mesh, hex: number): void {
    if (this.kind === 'solid') this.dressSolid(m, hex, undefined);
    else this.dress(m, linHex(hex));
  }

  /** Give a mesh its ghost material and a depth pre-pass twin (same skeleton). */
  private dress(m: Mesh, cloth: Color): void {
    const { body, depth } = ghostMaterials(this.shared!, cloth);
    m.material = body;
    m.renderOrder = 7;
    const d = m.clone(false) as Mesh;
    d.material = depth;
    d.renderOrder = 6;
    m.parent?.add(d);
    this.mats.push(body, depth);
  }

  /**
   * Give a mesh its solid material: the model slot's own (cloned, so its maps and vertex colours
   * stay) or a plain one for a hat / prop, in the costume colour, lit by the world. `alphaHash`
   * only carries the fade (`frame`): at opacity 1 nothing is discarded.
   */
  private dressSolid(m: Mesh, hex: number | null, orig: Material | undefined): void {
    const std = orig instanceof MeshStandardMaterial ? orig : undefined;
    const mat = std ? (std.clone() as MeshStandardMaterial) : new MeshStandardMaterial({ color: (orig as { color?: Color } | undefined)?.color ?? 0x808080 });
    delete mat.userData.kqStandard;
    if (hex !== null) mat.color.setHex(hex);
    // the figure's own hat, prop and pike are open shells (a brim, a basket): drawn from both sides
    if (!orig) mat.side = DoubleSide;
    Object.assign(mat, solidSurface(orig?.name ?? ''));
    kqStandard(mat, { ambient: 1.15 });
    mat.transparent = false;
    mat.depthWrite = true;
    mat.alphaHash = true;
    mat.opacity = 0;
    m.material = mat;
    m.renderOrder = 0;
    m.castShadow = true;
    this.solids.push(mat);
  }

  /** The figure's hat on the head bone, its prop hanging from the right hand. */
  private extras(model: ReturnType<typeof modelFor>): void {
    const info = this.rig.info;
    const ex = figureExtras(this.look);
    const toModel = info.height / this.look.height; // metres → model units
    if (ex.hat && info.headTop && this.look.hat !== 'none' && !builtInHat(model, this.look.hat)) {
      // the stylized heads are bigger than the procedural one: scale by the eye gap
      const eyes = info.eyes;
      let k = 1.25;
      if (eyes) {
        const gap = (eyes.l.distanceTo(eyes.r) / info.height) * this.look.height;
        k = Math.min(1.35, Math.max(1, (gap / ex.eyeGap) * 0.6));
      }
      ex.hat.translate(-ex.headTop.x, -ex.headTop.y, -ex.headTop.z);
      ex.hat.scale(k * toModel, k * toModel, k * toModel);
      // sit it down over the stylized hair (the brim at the brow), tipped a little forward
      ex.hat.rotateX(0.08);
      ex.hat.translate(info.headTop.x, info.headTop.y - 0.075 * k * toModel, info.headTop.z + 0.005 * toModel);
      const hat = new Mesh(ex.hat);
      this.geos.push(ex.hat);
      if (this.rig.attach('Head', hat)) this.wear(hat, this.look.hat === 'mobcap' ? 0xf1ebdc : this.look.hat === 'huntcap' ? 0x1f2a1c : 0x1b1714);
    } else ex.hat?.dispose();
    if (ex.prop) {
      const wrist = this.rig.bones.get('WristR');
      const elbow = this.rig.bones.get('LowerArmR');
      if (wrist && elbow) {
        this.rig.model.updateMatrixWorld(true);
        _inv.copy(this.rig.model.matrixWorld).invert();
        const wp = new Vector3().setFromMatrixPosition(wrist.matrixWorld).applyMatrix4(_inv);
        const ep = new Vector3().setFromMatrixPosition(elbow.matrixWorld).applyMatrix4(_inv);
        const dir = wp.clone().sub(ep).normalize();
        ex.prop.computeBoundingBox();
        const b = ex.prop.boundingBox!;
        // grip: top centre of the prop; it hangs along the forearm (down when the arm hangs)
        ex.prop.translate(-(b.min.x + b.max.x) / 2, -b.max.y, -(b.min.z + b.max.z) / 2);
        ex.prop.scale(toModel, toModel, toModel);
        _m.makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), dir));
        ex.prop.applyMatrix4(_m);
        ex.prop.translate(wp.x + dir.x * 0.04 * toModel, wp.y + dir.y * 0.04 * toModel, wp.z + dir.z * 0.04 * toModel);
        const prop = new Mesh(ex.prop);
        this.geos.push(ex.prop);
        const col = this.look.prop === 'ledger' ? 0x3b2418 : this.look.prop === 'basket' ? 0xa9824a : 0x5a4028;
        if (this.rig.attach('WristR', prop)) this.wear(prop, col);
      } else ex.prop.dispose();
    }
    // a Gardist's pike (court, docs/IDEAS-ROUND11.md §2): plumb in the right hand, in the body's material
    if (this.look.pike) {
      const m = new Mesh(pikeGeometry());
      this.geos.push(m.geometry);
      if (attachPike(this.rig, m)) this.wear(m, 0x8a7a66);
    }
  }

  /** The ghost's light colour (era × mood); a solid body takes the era's light from the world. */
  setTint(c: Color): void {
    (this.shared?.uTint!.value as Color | undefined)?.copy(c);
  }

  /** Solid look: how opaque the body is drawn now (1 = every material fully opaque). */
  get opacity(): number {
    return this.solids.reduce((a, m) => Math.min(a, m.opacity), 1);
  }

  frame(f: RiggedFrame): void {
    const r = this.rig;
    const u = this.shared;
    const o = r.root;
    o.updateMatrixWorld();
    if (u) {
      u.uAlpha!.value = f.alpha;
      u.uTalk!.value = f.talk;
      u.uMotion!.value = f.motion;
      u.uStutter!.value = f.stutter;
      u.uBaseY!.value = o.matrixWorld.elements[13];
    } else for (const m of this.solids) m.opacity = f.alpha;
    // speed from the root's travel (an escort walks after the player)
    o.getWorldPosition(_v);
    if (Number.isFinite(this.last.x) && f.dt > 0) {
      const sp = Math.hypot(_v.x - this.last.x, _v.z - this.last.z) / f.dt;
      this.speed += (Math.min(sp, 8) - this.speed) * Math.min(1, f.dt * 6);
    }
    this.last.copy(_v);
    // clips: walk / run when moving, gestures while talking, idle otherwise
    const talking = f.talk > 0.5;
    if (talking && !this.wasTalking) {
      this.talkT = 0;
      this.gesture = 0;
      if (this.look.mood === 'warm' && !f.reducedMotion) r.play('Wave', { once: true, fade: 0.3 });
    }
    this.wasTalking = talking;
    const busy = (r.currentName === 'Wave' || r.currentName === 'Interact') && r.progress() < 0.92;
    if (this.speed > 3.2) r.play('Run', { speed: this.speed / 4 });
    else if (this.speed > 0.35) r.play('Walk', { speed: Math.max(0.5, this.speed / 1.35) });
    else if (!busy) {
      if (talking && !f.reducedMotion) {
        this.talkT += f.dt;
        // a hand comes up every few seconds while it speaks
        if (this.talkT > 3.4 + (this.gesture % 2) * 1.3) {
          this.talkT = 0;
          this.gesture++;
          r.play('Interact', { once: true, fade: 0.35, speed: 0.8 });
        } else r.play(IDLE, { fade: 0.45 });
      } else r.play(IDLE, { fade: 0.45, speed: f.reducedMotion ? 0.5 : 1 });
    }
    r.update(f.dt * f.motion + (f.motion < 1 ? f.dt * 0.15 : 0));
    // the head turns to the player first (the body follows slowly, npc/index.ts)
    let yaw = 0;
    let pitch = 0;
    if (f.lookAt && r.info.head) {
      const head = r.bones.get(r.info.head);
      if (head) {
        head.getWorldPosition(_w);
        _v.copy(f.lookAt).sub(_w);
        const dist = Math.hypot(_v.x, _v.z);
        if (dist < 9) {
          // into the root's frame (the model faces +z)
          _inv.copy(o.matrixWorld).invert();
          const lx = _v.x * _inv.elements[0] + _v.z * _inv.elements[8];
          const lz = _v.x * _inv.elements[2] + _v.z * _inv.elements[10];
          yaw = Math.max(-1.05, Math.min(1.05, Math.atan2(lx, lz)));
          if (Math.abs(Math.atan2(lx, lz)) > 2.2) yaw = 0; // behind it: no owl neck
          pitch = Math.max(-0.35, Math.min(0.3, -Math.atan2(_v.y, Math.max(0.3, dist))));
        }
      }
    }
    const k = Math.min(1, f.dt * (f.reducedMotion ? 10 : 4));
    this.headYaw += (yaw - this.headYaw) * k;
    this.headPitch += (pitch - this.headPitch) * k;
    const nod = talking && !f.reducedMotion ? Math.sin(performance.now() * 0.007) * 0.045 : 0;
    r.turnBone('Neck', this.headYaw * 0.35, 0);
    r.turnBone(r.info.head, this.headYaw * 0.65, this.headPitch + nod);
  }

  dispose(): void {
    // the clone's own skeletons (their bone textures live on the GPU); geometry stays with the asset cache
    const skeletons = new Set<Skeleton>();
    for (const m of this.rig.meshes) if ((m as SkinnedMesh).isSkinnedMesh) skeletons.add((m as SkinnedMesh).skeleton);
    for (const k of skeletons) k.dispose();
    this.rig.dispose();
    for (const m of this.mats) m.dispose();
    for (const m of this.solids) m.dispose();
    for (const g of this.geos) g.dispose();
  }
}
