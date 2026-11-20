/**
 * The player character for the third-person camera (playtest round 8): a rigged CC0 Quaternius
 * humanoid dressed as a modern surveyor — olive field jacket, hi-vis orange vest panels, dark
 * cargo trousers, boots, the backpack — with the red-and-white Messstab (the same staff as the
 * first-person view model, `buildStaff`) in the right hand or across the backpack, and a brass
 * lantern on the left hip that IS the lantern light (`lanternPose.anchor`).
 *
 * Animation (one AnimationMixer, weights set every frame, no cross-fade chains):
 * - locomotion: idle / walk / run blended by ground speed, feet phase-locked (one cycle counter
 *   drives every loop, so blends never skate); in a fight or with a lock-on the body faces the
 *   target and the legs strafe (Run_Left / Run_Right / Run_Back);
 * - the upper body is a separate layer (clips split by bone): swings, the Wuchthieb charge, the
 *   Bannlicht push, drinking, a hit, examining play over walking legs, scrubbed to the combat
 *   timing so the blow lands on the hit frame;
 * - full-body overrides: the dodge roll, being undone (death), the abilities' lunge / spin.
 *
 * Visual only: the simulation lives in Player (movement) and combat (fight).
 */
import {
  type AnimationAction,
  AnimationClip,
  AdditiveBlending,
  type Bone,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
  Quaternion,
  type Scene,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import type { LoadedModel } from '../assets/loader';
import { kqStandard } from '../render/standard';
import { Rig } from '../systems/characters/rig';
import { lanternPose } from '../systems/hunt/lantern';
import { cosmetics } from './cosmetics';
import { type WeaponStage, buildStaff, staffMaterial } from '../systems/combat/viewmodel';
import { atmosphere } from '../world/atmosphere';
import { BOOM_MIN } from './camera';
import { type Costume, costumeColours, costumeEmissive, costumeHides, lanternColours, partOf, resolveCostume, resolveTint, slotHex, staffOnBack } from './costume';
import type { Player } from './player';
import { actionPose } from './pose';

export { type Costume, SURVEYOR_COSTUME } from './costume';

declare module '../debug/hooks' {
  interface KqHooks {
    /** Third-person character (src/player/avatar.ts): state for tests, camera mode switch. */
    avatar?: {
      state(): Record<string, unknown> & { ready: boolean; visible: boolean; clip: string; upper: string; full: string; mode: string; third: boolean; distance: number; facing: number; costume: Costume };
      setMode(m: 'third' | 'first'): void;
      ready(): Promise<boolean>;
      /** The costume asked for (sticky; the model may still be fading into it). */
      costume(): Costume;
      /** Emits 'player:costume' (the same path the story takes). */
      setCostume(c: Costume): void;
      /** The lantern tint (sRGB hex), null = the warm default. */
      lanternTint(): number | null;
    };
  }
}

declare module '../core/events' {
  interface GameEvents {
    /** Dress the player character (the story's court disguise). Sticky and idempotent. */
    'player:costume': { costume: Costume };
    /** Tint the player's lantern glass and flame (sRGB hex); null = the warm default. */
    'player:lantern-tint': { hex: number | null };
  }
}

export const AVATAR_MODEL = 'camera.player.surveyor';
export const AVATAR_HEIGHT = 1.78;

/** Bones of the upper-body layer (swings, charge, flare, hit play over the walking legs). */
const UPPER = /^(Torso|Chest|Neck|Head|Shoulder|UpperArm|LowerArm|Wrist|Index|Middle|Ring|Pinky|Thumb)/;

function splitClip(c: AnimationClip, upper: boolean): AnimationClip {
  const tracks = c.tracks.filter((t) => UPPER.test(t.name.split('.')[0] ?? '') === upper);
  return new AnimationClip(`${c.name}_${upper ? 'up' : 'low'}`, c.duration, tracks);
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Distance one loop of a clip covers at the model's own stride (m), and the clip lengths. */
const STRIDE = { walk: 1.75, run: 3.3 };

interface Loco {
  name: string;
  low: AnimationAction;
  up: AnimationAction;
  w: number;
}

const _fa = new Vector3();
const _fb = new Vector3();

export interface AvatarFrame {
  dt: number;
  time: number;
  camera: PerspectiveCamera;
  /** Hide (first person, flying, a cut-scene that took the camera). */
  hidden: boolean;
  reducedMotion: boolean;
  reducedFlash: boolean;
}

export class Avatar {
  readonly root = new Group();
  private rig: Rig | null = null;
  private readonly locos: Loco[] = [];
  private readonly acts = new Map<string, { up: AnimationAction; full: AnimationAction; w: number; wf: number }>();
  private phase = 0;
  /** Body yaw (radians, the player's yaw convention: 0 faces −z). */
  facing = 0;
  private readonly last = new Vector3();
  private speed = 0;
  private vel = { x: 0, z: 0 };
  private hitT = 0;
  private interactT = 0;
  private waveT = 0;
  private deathT = 0;
  private wasDead = false;
  private wasShown = false;
  private spin = 0;
  private crouch = 0;
  private prone = 0;
  private readonly staffHand = new Group();
  private readonly staffBack = new Group();
  private staff: Mesh | null = null;
  private staffMat: ShaderMaterial | null = null;
  private stage: WeaponStage | null = null;
  private readonly lantern = new Group();
  private lanternGlow: MeshBasicMaterial | null = null;
  private flame: Mesh | null = null;
  private flameMat: MeshBasicMaterial | null = null;
  private readonly trail: Trail;
  private readonly materials: Material[] = [];
  /** Geometry built here (the model's own is shared with the asset cache and never disposed). */
  private readonly geos: BufferGeometry[] = [];
  /** The model's costumed materials: one clone per part and slot (the backpack's orange is its own). */
  private readonly dressed: { mat: MeshStandardMaterial; part: string; slot: string }[] = [];
  private readonly parts: Mesh[] = [];
  /** Costume asked for / on the model now; the swap dithers out, swaps, dithers back in. */
  private costumeWant: Costume = 'default';
  private costumeNow: Costume = 'default';
  private swapK = 1;
  private swapDir: -1 | 0 | 1 = 0;
  private tint: number | null = null;
  /** Exposed for tests / debug. */
  readonly debug = { clip: '', upper: '', full: '', weights: {} as Record<string, number>, visible: false, armed: false };

  constructor(
    scene: Scene,
    private readonly player: Player,
    private readonly load: () => Promise<LoadedModel>,
  ) {
    this.root.name = 'player-avatar';
    this.root.visible = false;
    this.trail = new Trail();
    scene.add(this.root, this.trail.mesh);
  }

  /** A short reaction (events from boot): 'hit' | 'interact' | 'wave'. */
  react(kind: 'hit' | 'interact' | 'wave'): void {
    if (kind === 'hit') this.hitT = 0.42;
    else if (kind === 'interact') this.interactT = 1.05;
    else this.waveT = 1.6;
  }

  get ready(): boolean {
    return this.rig !== null;
  }

  /** The costume asked for (the model may still be dithering into it). */
  get costume(): Costume {
    return this.costumeWant;
  }

  /**
   * Dress the character. Sticky (a call before the model is in is applied when it loads) and
   * idempotent. While the character is on screen the body dithers out, swaps and dithers back in
   * (~0.3 s, alphaHash: no sorting); hidden or paused, it swaps at once.
   */
  setCostume(c: Costume): void {
    const want = resolveCostume(c);
    if (want === this.costumeWant) return;
    this.costumeWant = want;
    if (!this.rig) return;
    if (!this.root.visible) this.swapNow();
    else this.swapDir = want === this.costumeNow ? 1 : -1;
  }

  /** The lantern tint (sRGB hex), null = the warm default. */
  get lanternTint(): number | null {
    return this.tint;
  }

  /** Tint the lantern's glass glow and flame (sRGB hex); null = the warm default. Sticky, idempotent. */
  setLanternTint(hex: number | null): void {
    const t = resolveTint(hex);
    if (t === this.tint) return;
    this.tint = t;
    this.applyTint();
  }

  private swapNow(): void {
    this.applyCostume(this.costumeWant);
    this.swapK = 1;
    this.swapDir = 0;
  }

  /** Lay a costume over the model's slots, hide what it does not wear. */
  private applyCostume(c: Costume): void {
    this.costumeNow = c;
    const cols = costumeColours(c);
    const emi = costumeEmissive(c);
    for (const d of this.dressed) {
      const hex = slotHex(cols, d.part, d.slot);
      if (hex !== null) d.mat.color.setHex(hex);
      d.mat.emissive.setHex(slotHex(emi, d.part, d.slot) ?? 0);
    }
    for (const m of this.parts) m.visible = !costumeHides(c, m.name);
    this.staffBack.visible = staffOnBack(c);
  }

  private applyTint(): void {
    const { glow, flame } = lanternColours(this.tint);
    this.lanternGlow?.color.setHex(glow);
    this.flameMat?.color.setHex(flame);
  }

  /** Advance a running costume swap (the dither dip), with `dt` = 0 (paused) it swaps at once. */
  private swapFrame(dt: number): void {
    if (this.swapDir === 0) return;
    if (dt <= 0) {
      this.swapNow();
      return;
    }
    if (this.swapDir === -1) {
      this.swapK -= dt / 0.14;
      if (this.swapK <= 0) {
        this.swapK = 0;
        this.applyCostume(this.costumeWant);
        this.swapDir = 1;
      }
    } else {
      // asked for another costume while dithering back in: dip again from here
      if (this.costumeWant !== this.costumeNow) {
        this.swapDir = -1;
        return;
      }
      this.swapK += dt / 0.16;
      if (this.swapK >= 1) {
        this.swapK = 1;
        this.swapDir = 0;
      }
    }
  }

  private building: Promise<void> | null = null;

  /** Resolves when the model is in (true) or failed (false); starts loading if needed. */
  async whenReady(): Promise<boolean> {
    if (!this.building) this.building = this.build();
    await this.building;
    return this.rig !== null;
  }

  /** World position of the lantern on the belt (for the light). */
  readonly lanternWorld = new Vector3();

  private async build(): Promise<void> {
    let src: LoadedModel;
    try {
      src = await this.load();
    } catch (e) {
      console.warn('[avatar] model failed', e);
      return;
    }
    const rig = new Rig(src, AVATAR_HEIGHT);
    // own costume: clone the shared (world-lit) materials per model part and slot, so a costume can
    // colour the backpack's orange apart from the vest's (applyCostume)
    const cache = new Map<string, MeshStandardMaterial>();
    for (const m of rig.meshes) {
      m.castShadow = true;
      const part = partOf(m.name);
      this.parts.push(m);
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const out = mats.map((mat) => {
        const key = `${part}.${mat.name}`;
        let c = cache.get(key);
        if (!c) {
          const cl = mat.clone() as MeshStandardMaterial;
          delete cl.userData.kqStandard;
          cl.roughness = mat.name === 'LightGreen' ? 0.55 : mat.name === 'Skin' ? 0.62 : 0.82;
          cl.metalness = mat.name === 'Gold' ? 0.6 : 0;
          if (!cl.emissive) cl.emissive = new Color(0);
          kqStandard(cl, { ambient: 1.15 });
          // screen-door fade (no sorting): opacity < 1 dithers the body away (see fade below)
          cl.alphaHash = true;
          cache.set(key, cl);
          this.materials.push(cl);
          this.dressed.push({ mat: cl, part, slot: mat.name });
          c = cl;
        }
        return c;
      });
      m.material = Array.isArray(m.material) ? out : out[0]!;
    }
    this.root.add(rig.root);
    // clips: locomotion split into legs / upper body, actions as upper-only and full-body copies
    const clip = (n: string) => src.animations.find((a) => a.name === n) ?? null;
    for (const n of ['Idle', 'Idle_Sword', 'Walk', 'Run', 'Run_Left', 'Run_Right', 'Run_Back']) {
      const c = clip(n);
      if (!c) continue;
      const low = rig.mixer.clipAction(splitClip(c, false));
      const up = rig.mixer.clipAction(splitClip(c, true));
      for (const a of [low, up]) {
        a.play();
        a.setEffectiveWeight(0);
        a.setEffectiveTimeScale(0);
      }
      this.locos.push({ name: n, low, up, w: n === 'Idle' ? 1 : 0 });
    }
    for (const n of ['Sword_Slash', 'Punch_Right', 'Punch_Left', 'HitRecieve', 'Interact', 'Wave', 'Roll', 'Death']) {
      const c = clip(n);
      if (!c) continue;
      const up = rig.mixer.clipAction(splitClip(c, true));
      const full = rig.mixer.clipAction(c);
      for (const a of [up, full]) {
        a.play();
        a.setEffectiveWeight(0);
        a.setEffectiveTimeScale(0);
      }
      this.acts.set(n, { up, full, w: 0, wf: 0 });
    }
    this.buildStaffAnchors(rig);
    this.buildLantern(rig);
    this.rig = rig;
    this.root.traverse((o) => (o.frustumCulled = false));
    // sticky: a costume / tint asked for before the model was in
    this.swapNow();
    this.applyTint();
  }

  /**
   * Put the rig in a clip's first frame (full weight) and update the matrices, for calibrating
   * attachments in a real pose instead of the bind pose.
   */
  private poseFor(rig: Rig, name: string): void {
    for (const l of this.locos) {
      const on = l.name === name ? 1 : 0;
      l.low.setEffectiveWeight(on);
      l.up.setEffectiveWeight(on);
      l.low.time = l.up.time = 0;
    }
    for (const a of this.acts.values()) {
      a.up.setEffectiveWeight(0);
      a.full.setEffectiveWeight(0);
    }
    rig.root.position.set(0, 0, 0);
    rig.root.rotation.set(0, 0, 0);
    rig.mixer.update(0);
    this.root.updateMatrixWorld(true);
  }

  /**
   * Attach `obj` to `bone` so that, in the current pose, it sits at `pos` (metres, root frame: the
   * model faces +z, +x is its left) with its -z axis along `dir` and its +y towards `up`.
   */
  private attachAt(rig: Rig, bone: Bone, obj: Object3D, pos: Vector3, dir: Vector3, up: Vector3): void {
    const wq = new Quaternion();
    const m = new Matrix4().lookAt(new Vector3(0, 0, 0), dir, up);
    wq.setFromRotationMatrix(m);
    const bq = bone.getWorldQuaternion(new Quaternion());
    const ws = bone.getWorldScale(new Vector3()).x;
    obj.position.copy(bone.worldToLocal(pos.clone().add(rig.root.position)));
    obj.quaternion.copy(bq.invert().multiply(wq));
    obj.scale.setScalar(1 / ws);
    bone.add(obj);
  }

  /** Hand grip (sword pose) and back strap (idle pose), calibrated in the rig's own poses. */
  private buildStaffAnchors(rig: Rig): void {
    const wrist = findBone(rig, /^Wrist.?R$/);
    if (wrist) {
      // measured on the Quaternius hand: the fingers run along the wrist's +y, the line across
      // the knuckles (pinky -> index) along its -x — a held sword's blade. The pole sits in the
      // curled fingers, its shoe out past the index finger.
      const ws = wrist.getWorldScale(new Vector3()).x;
      this.staffHand.position.set(0, 0.085 / ws, -0.012 / ws);
      this.staffHand.quaternion.setFromUnitVectors(new Vector3(0, 0, -1), new Vector3(-1, 0, 0));
      this.staffHand.scale.setScalar(1 / ws);
      wrist.add(this.staffHand);
    }
    const chest = findBone(rig, /^Chest$/) ?? findBone(rig, /^Torso$/);
    if (chest) {
      this.poseFor(rig, 'Idle');
      const c = chest.getWorldPosition(new Vector3());
      // across the backpack: diagonal, the shoe down by the right hip, the butt over the left shoulder
      const pos = c.clone().add(new Vector3(0.0, 0.02, -0.27));
      const dir = new Vector3(-0.38, -0.92, 0).normalize();
      this.attachAt(rig, chest, this.staffBack, pos, dir, new Vector3(0, 0, -1));
    }
  }

  private setStage(stage: WeaponStage): void {
    if (stage === this.stage) return;
    this.stage = stage;
    if (!this.staffMat) this.staffMat = staffMaterial();
    const geo = buildStaff(stage, false);
    if (this.staff) {
      this.staff.geometry.dispose();
      this.staff.geometry = geo;
    } else {
      this.staff = new Mesh(geo, this.staffMat);
      this.staff.name = 'player-staff';
      this.staff.castShadow = true;
      this.staff.frustumCulled = false;
    }
  }

  private buildLantern(rig: Rig): void {
    const hips = findBone(rig, /^Hips$/);
    if (!hips) return;
    const brass = kqStandard(new MeshStandardMaterial({ color: 0x8a6a2c, metalness: 0.75, roughness: 0.38 }), { ambient: 1.2 });
    this.materials.push(brass);
    const { glow, flame } = lanternColours(this.tint);
    this.lanternGlow = new MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false });
    this.flameMat = new MeshBasicMaterial({ color: flame, transparent: true, blending: AdditiveBlending, depthWrite: false });
    const g = this.lantern;
    const add = (geo: BufferGeometry, mat: Material, x: number, y: number, z: number) => {
      const m = new Mesh(geo, mat);
      m.position.set(x, y, z);
      m.userData.noShadow = true;
      g.add(m);
      this.geos.push(geo);
      return m;
    };
    add(new CylinderGeometry(0.055, 0.062, 0.02, 16), brass, 0, -0.07, 0);
    add(new ConeGeometry(0.064, 0.05, 16), brass, 0, 0.075, 0);
    add(new CylinderGeometry(0.012, 0.015, 0.03, 8), brass, 0, 0.11, 0);
    const handle = add(new TorusGeometry(0.03, 0.005, 6, 16), brass, 0, 0.14, 0);
    handle.rotation.y = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      add(new CylinderGeometry(0.005, 0.005, 0.13, 6), brass, Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05);
    }
    add(new CylinderGeometry(0.046, 0.046, 0.12, 14, 1, true), this.lanternGlow, 0, 0, 0);
    this.flame = add(new SphereGeometry(0.022, 10, 8), this.flameMat, 0, -0.01, 0);
    this.flame.scale.set(1, 1.6, 1);
    // on the left hip, hanging from the belt (calibrated in the idle pose; +x is the model's left)
    this.poseFor(rig, 'Idle');
    const h = hips.getWorldPosition(new Vector3());
    this.attachAt(rig, hips, g, h.add(new Vector3(0.21, -0.1, 0.04)), new Vector3(0, 0, -1), new Vector3(0, 1, 0));
    g.scale.multiplyScalar(1.25);
  }

  frame(f: AvatarFrame): void {
    if (!this.rig) {
      if (!this.building) this.building = this.build();
      lanternPose.anchor = null;
      return;
    }
    const pl = this.player;
    const A = actionPose;
    const rig = this.rig;
    const dt = Math.min(0.1, Math.max(0, f.dt));
    const show = !f.hidden && pl.thirdPerson && pl.rig.distance > BOOM_MIN * 0.98;
    this.root.visible = show;
    this.debug.visible = show;
    if (show && !this.wasShown) this.facing = pl.yaw;
    this.wasShown = show;
    if (!show) {
      lanternPose.anchor = null;
      this.trail.clear();
      this.last.copy(pl.renderPos);
      return;
    }
    // ---- ground motion
    const p = pl.renderPos;
    if (dt > 0) {
      const vx = (p.x - this.last.x) / dt;
      const vz = (p.z - this.last.z) / dt;
      const jump = Math.hypot(vx, vz) > 40;
      // a teleport: face where the view looks
      if (jump) this.facing = pl.yaw;
      const k = Math.min(1, dt * 10);
      this.vel.x += ((jump ? 0 : vx) - this.vel.x) * k;
      this.vel.z += ((jump ? 0 : vz) - this.vel.z) * k;
      this.speed = Math.hypot(this.vel.x, this.vel.z);
    }
    this.last.copy(p);
    rig.root.position.copy(p);
    // ---- facing
    const fight = A.inCombat && A.armed && !A.hidden;
    let want: number | null = null;
    if (A.swing) want = A.swing.yaw;
    else if (A.dodge !== null && this.speed > 0.5) want = Math.atan2(-this.vel.x, -this.vel.z);
    else if (A.target && (fight || A.charge !== null)) want = Math.atan2(-(A.target.x - p.x), -(A.target.z - p.z));
    else if (fight && this.speed > 0.3) want = pl.yaw;
    else if (A.charge !== null || A.flare > 0.2) want = pl.yaw;
    else if (this.speed > 0.35) want = Math.atan2(-this.vel.x, -this.vel.z);
    if (want !== null) {
      const rate = A.swing || A.dodge !== null ? 22 : 11;
      this.facing += wrap(want - this.facing) * (1 - Math.exp(-dt * rate));
    }
    // Wirbel: two full turns over the move
    if (A.skill?.id === 'wirbel') this.spin = (A.skill.t / A.skill.dur) * Math.PI * 4;
    else this.spin = 0;
    rig.root.rotation.set(0, this.facing + Math.PI + this.spin, 0);
    // ---- locomotion weights
    const sp = this.speed;
    const strafe = fight && A.dodge === null;
    // local velocity in the body frame (forward = −z of facing)
    const fx = -Math.sin(this.facing);
    const fz = -Math.cos(this.facing);
    const fwd = this.vel.x * fx + this.vel.z * fz;
    const side = this.vel.x * -fz + this.vel.z * fx; // + = to the body's right
    const wl: Record<string, number> = { Idle: 0, Idle_Sword: 0, Walk: 0, Run: 0, Run_Left: 0, Run_Right: 0, Run_Back: 0 };
    const idleName = A.armed && (fight || A.charge !== null) ? 'Idle_Sword' : 'Idle';
    const moveK = smooth(clamp01((sp - 0.15) / 0.6));
    const runK = smooth(clamp01((sp - 2.6) / 1.6));
    wl[idleName] = 1 - moveK;
    if (strafe && sp > 0.15) {
      const tot = Math.abs(fwd) + Math.abs(side) + 1e-3;
      const kf = Math.max(0, fwd) / tot;
      const kb = Math.max(0, -fwd) / tot;
      const kr = Math.max(0, side) / tot;
      const kl = Math.max(0, -side) / tot;
      wl.Walk! += moveK * kf * (1 - runK);
      wl.Run! += moveK * kf * runK;
      wl.Run_Back! += moveK * kb;
      wl.Run_Right! += moveK * kr;
      wl.Run_Left! += moveK * kl;
    } else {
      wl.Walk! += moveK * (1 - runK);
      wl.Run! += moveK * runK;
    }
    // phase-locked feet: one cycle counter for every loop
    const stride = STRIDE.walk + (STRIDE.run - STRIDE.walk) * runK;
    if (!A.frozen) this.phase += (Math.max(sp, 0) / stride) * dt;
    // crouch / prone: slower, lower
    this.crouch += ((pl.stance === 'crouch' ? 1 : 0) - this.crouch) * Math.min(1, dt * 8);
    this.prone += ((pl.stance === 'prone' ? 1 : 0) - this.prone) * Math.min(1, dt * 6);
    // ---- action layer
    const set = (n: string, up: number, full: number, t01: number) => {
      const a = this.acts.get(n);
      if (!a) return;
      a.w = up;
      a.wf = full;
      const d = a.up.getClip().duration;
      a.up.time = a.full.time = clamp01(t01) * d * 0.999;
    };
    for (const a of this.acts.values()) {
      a.w = 0;
      a.wf = 0;
    }
    let upperW = 0;
    let fullW = 0;
    const still = 1 - moveK;
    this.debug.upper = '';
    this.debug.full = '';
    if (A.dead && !this.wasDead) this.deathT = 0;
    this.wasDead = A.dead;
    if (A.dead) {
      this.deathT += dt;
      set('Death', 0, 1, this.deathT / 1.04);
      fullW = 1;
      this.debug.full = 'Death';
    } else if (A.dodge !== null) {
      set('Roll', 0, 1, 0.06 + A.dodge * 0.82);
      fullW = 1;
      this.debug.full = 'Roll';
    } else if (A.skill) {
      const k = A.skill.t / A.skill.dur;
      const n = 'Sword_Slash';
      // Ausfall: the staff levelled at the hit frame through the lunge; Erdstoß: wind-up, then
      // down; Wirbel: three slashes while the body spins
      const t = A.skill.id === 'wirbel' ? 0.15 + ((k * 3) % 1) * 0.6 : A.skill.id === 'erdstoss' ? 0.15 + k * 0.6 : 0.2 + Math.min(1, k * 4) * 0.25;
      set(n, 0, 1, t);
      fullW = smooth(clamp01(Math.min(k, 1 - k) * 8));
      this.debug.full = n;
    } else if (A.swing) {
      const k = A.swing.t / A.swing.dur;
      // light combo: forehand slash, backhand (the slash played backwards), a wide forehand;
      // heavy: the slash from its full wind-up. The clip's hit frame (~0.45) lands on the combat
      // impact (0.34 of a light swing, 0.36 of the heavy).
      const n = 'Sword_Slash';
      const t = A.swing.kind === 'heavy' ? 0.2 + k * 0.7 : A.swing.combo === 1 ? 0.78 - k * 0.95 : A.swing.combo >= 2 ? 0.08 + k * 1.08 : 0.15 + k * 0.85;
      const w = smooth(clamp01(Math.min(k * 10, (1 - k) * 5)));
      set(n, w * (1 - still), w * still, t);
      upperW = w * (1 - still);
      fullW = w * still;
      this.debug.upper = n;
    } else if (A.charge !== null) {
      // the Wuchthieb wind-up held (the staff drawn back over the shoulder), trembling when full
      const tr = A.charge >= 1 && !f.reducedMotion ? Math.sin(f.time * 50) * 0.004 : 0;
      set('Sword_Slash', 1 - still * 0.4, still * 0.4, 0.3 * smooth(clamp01(A.charge * 2.5)) + tr);
      upperW = 1;
      this.debug.upper = 'charge';
    } else if (A.flare > 0.05) {
      set('Punch_Left', smooth(A.flare), 0, 0.42 - A.flare * 0.12);
      upperW = smooth(A.flare);
      this.debug.upper = 'Punch_Left';
    } else if (A.drink > 0) {
      set('Interact', 1, 0, 0.2 + A.drink * 0.6);
      upperW = 1;
      this.debug.upper = 'Interact';
    } else if (this.hitT > 0) {
      const k = 1 - this.hitT / 0.42;
      const w = smooth(clamp01(Math.min(k * 6, (1 - k) * 4)));
      set('HitRecieve', w, 0, k);
      upperW = w;
      this.debug.upper = 'HitRecieve';
    } else if (this.interactT > 0) {
      const k = 1 - this.interactT / 1.05;
      const w = smooth(clamp01(Math.min(k * 6, (1 - k) * 5)));
      set('Interact', w * (1 - still), w * still, k);
      upperW = w * (1 - still);
      fullW = w * still;
      this.debug.upper = 'Interact';
    } else if (this.waveT > 0) {
      const k = 1 - this.waveT / 1.6;
      const w = smooth(clamp01(Math.min(k * 5, (1 - k) * 4)));
      set('Wave', w, 0, k);
      upperW = w;
      this.debug.upper = 'Wave';
    }
    if (!A.frozen) {
      this.hitT = Math.max(0, this.hitT - dt);
      this.interactT = Math.max(0, this.interactT - dt);
      this.waveT = Math.max(0, this.waveT - dt);
    }
    // apply weights (eased: the locomotion blend moves at ~8/s)
    const kk = Math.min(1, dt * 8);
    let best = '';
    let bw = 0;
    for (const l of this.locos) {
      l.w += ((wl[l.name] ?? 0) - l.w) * kk;
      const d = l.low.getClip().duration;
      const t = l.name.startsWith('Idle') ? (f.time / d) % 1 : this.phase % 1;
      l.low.time = l.up.time = t * d;
      l.low.setEffectiveWeight(l.w * (1 - fullW));
      l.up.setEffectiveWeight(l.w * (1 - fullW) * (1 - upperW));
      if (l.w > bw) {
        bw = l.w;
        best = l.name;
      }
      this.debug.weights[l.name] = Math.round(l.w * 100) / 100;
    }
    for (const a of this.acts.values()) {
      a.up.setEffectiveWeight(a.w);
      a.full.setEffectiveWeight(a.wf);
    }
    this.debug.clip = best;
    rig.update(0);
    // crouch: bend at the waist and sink; prone: lie forward along the facing
    if (this.crouch > 0.01) {
      rig.turnBone(findBoneName(rig, /^Abdomen$/), 0, 0.42 * this.crouch);
      rig.holder.position.y = -rig.info.minY * rig.scale - 0.2 * this.crouch;
    } else rig.holder.position.y = -rig.info.minY * rig.scale;
    if (this.prone > 0.01) {
      rig.root.rotateX(1.45 * this.prone);
      rig.root.position.y += 0.15 * this.prone;
    }
    rig.root.updateMatrixWorld(true);
    // ---- staff: in hand when armed and fighting (or swinging), across the backpack otherwise
    this.debug.armed = A.armed;
    if (A.armed) {
      this.setStage(A.stage);
      const inHand = fight || !!A.swing || !!A.skill || A.charge !== null;
      const parent = inHand ? this.staffHand : this.staffBack;
      if (this.staff && this.staff.parent !== parent) parent.add(this.staff);
      if (this.staff) this.staff.visible = !A.lowered || !inHand;
      if (this.staffMat) {
        const g = this.staffMat.uniforms.uGlow!.value as Color;
        const ch = A.charge ?? 0;
        const glow = ch > 0 ? 0.25 + ch * 1.4 : A.swing?.kind === 'heavy' ? 0.6 * (1 - A.swing.t / A.swing.dur) : A.skill ? 1.1 * (1 - A.skill.t / A.skill.dur) : 0;
        g.setRGB(glow, 0.62 * glow, 0.25 * glow);
        this.staffMat.uniforms.uNotch!.value = A.stage === 'bann' || A.stage === 'lot' ? 0.35 + 0.25 * Math.sin(f.time * (f.reducedFlash ? 1 : 2.3)) : 0;
        this.staffMat.uniforms.uFlash!.value = A.flare;
      }
    } else if (this.staff?.parent) this.staff.removeFromParent();
    // swing trail: the shoe end of the staff in world space
    if (this.staff?.parent === this.staffHand) {
      const active = (!!A.swing && A.swing.t / A.swing.dur > 0.1 && A.swing.t / A.swing.dur < 0.7) || (!!A.skill && A.skill.t / A.skill.dur < 0.9);
      this.trail.frame(dt, active && !A.frozen, this.staff, A.swing?.kind === 'heavy', f.reducedFlash);
    } else this.trail.clear();
    // ---- fade (playtest round 9): the camera pressed against the head and backpack, and the enemy
    // being fought hidden behind the body — dither the character when the lens is close or the
    // target sits behind it on screen
    this.fadeFrame(f, dt, p);
    // ---- lantern: the light hangs on the belt
    this.lantern.getWorldPosition(this.lanternWorld);
    lanternPose.anchor = this.lanternWorld;
    const L = atmosphere.uLantern.value as Vector3;
    const lit = Math.min(1.5, L.length() / 2.7);
    this.lantern.visible = true;
    if (this.lanternGlow) {
      this.lanternGlow.opacity = 0.08 + 0.5 * Math.min(1, lit);
      this.lanternGlow.color.setHex(cosmetics.lanternGlass ?? 0xffa64a);
    }
    if (this.flame) {
      this.flame.visible = lit > 0.05;
      const fl = f.reducedFlash ? 1 : 0.85 + 0.15 * Math.sin(f.time * 17);
      this.flame.scale.set(1, 1.6 * fl, 1).multiplyScalar(0.6 + 0.4 * Math.min(1, lit));
    }
  }

  /** 0..1 how much of the body is drawn (1 = solid). */
  private fade = 1;

  private fadeFrame(f: AvatarFrame, dt: number, p: Vector3): void {
    const cam = f.camera;
    let want = 1;
    // the lens close to the head: from 1.3 m in, fade down to 0.3
    const dc = Math.hypot(cam.position.x - p.x, cam.position.y - (p.y + 1.45), cam.position.z - p.z);
    if (dc < 1.3) want = Math.min(want, 0.3 + 0.7 * Math.max(0, (dc - 0.55) / 0.75));
    // the target behind the body: both on screen, the target farther away, close together in x
    const T = actionPose.target;
    if (T) {
      _fa.set(p.x, p.y + 1.0, p.z).project(cam);
      _fb.set(T.x, p.y + 0.9, T.z).project(cam);
      const dT = Math.hypot(T.x - cam.position.x, T.z - cam.position.z);
      const dA = Math.hypot(p.x - cam.position.x, p.z - cam.position.z);
      if (_fa.z < 1 && _fb.z < 1 && dT > dA + 0.3) {
        // the body is ~0.5 m wide: its half-width on screen in NDC, plus a margin
        const half = (0.45 / Math.max(0.5, dA)) / Math.tan((cam.fov * Math.PI) / 360) / Math.max(0.5, cam.aspect);
        const ox = Math.abs(_fa.x - _fb.x);
        if (ox < half + 0.05 && Math.abs(_fa.y - _fb.y) < 0.5) want = Math.min(want, 0.4);
      }
    }
    this.fade += (want - this.fade) * Math.min(1, dt * 8);
    this.swapFrame(dt);
    const o = (this.fade > 0.98 ? 1 : this.fade) * this.swapK;
    for (const m of this.materials) m.opacity = o;
    if (this.staff) this.staff.visible = this.staff.visible && o > 0.35;
  }

  dispose(): void {
    lanternPose.anchor = null;
    this.rig?.dispose();
    this.root.removeFromParent();
    this.trail.dispose();
    for (const m of this.materials) m.dispose();
    this.lanternGlow?.dispose();
    this.flameMat?.dispose();
    for (const g of this.geos) g.dispose();
    this.staff?.geometry.dispose();
    this.staffMat?.dispose();
  }
}

function findBone(rig: Rig, re: RegExp): Bone | undefined {
  for (const [n, b] of rig.bones) if (re.test(n)) return b;
  return undefined;
}

function findBoneName(rig: Rig, re: RegExp): string | null {
  for (const n of rig.bones.keys()) if (re.test(n)) return n;
  return null;
}

/** A ribbon behind the staff's shoe while it swings (world space, additive, ~0.12 s long). */
class Trail {
  readonly mesh: Mesh;
  private readonly geo = new BufferGeometry();
  private readonly mat: ShaderMaterial;
  private readonly pts: { a: Vector3; b: Vector3; age: number }[] = [];
  private static readonly N = 16;

  constructor() {
    const N = Trail.N;
    const pos = new Float32BufferAttribute(new Float32Array(N * 2 * 3), 3);
    pos.setUsage(DynamicDrawUsage);
    const al = new Float32BufferAttribute(new Float32Array(N * 2), 1);
    al.setUsage(DynamicDrawUsage);
    const side = new Float32Array(N * 2);
    const idx: number[] = [];
    for (let i = 0; i < N; i++) {
      side[i * 2 + 1] = 1;
      if (i < N - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    this.geo.setAttribute('position', pos);
    this.geo.setAttribute('aA', al);
    this.geo.setAttribute('aSide', new Float32BufferAttribute(side, 1));
    this.geo.setIndex(idx);
    this.mat = new ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aA; attribute float aSide; varying float vA; varying float vS;
        void main() { vA = aA; vS = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol; varying float vA; varying float vS;
        void main() { float e = smoothstep(0.0, 0.35, vS) * smoothstep(1.0, 0.65, vS); gl_FragColor = vec4(uCol * vA * (0.4 + 0.6 * e), 1.0); }`,
      uniforms: { uCol: { value: new Color(1, 0.86, 0.62) } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.name = 'player-staff-trail';
    this.mesh.frustumCulled = false;
    this.mesh.userData.noShadow = true;
    this.mesh.visible = false;
  }

  clear(): void {
    this.pts.length = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }

  frame(dt: number, active: boolean, staff: Object3D, heavy: boolean, reducedFlash: boolean): void {
    for (const p of this.pts) p.age += dt;
    if (active) {
      this.pts.unshift({ a: staff.localToWorld(new Vector3(0, 0, -1.4)), b: staff.localToWorld(new Vector3(0, 0, -0.75)), age: 0 });
      if (this.pts.length > Trail.N) this.pts.length = Trail.N;
    }
    while (this.pts.length && this.pts[this.pts.length - 1]!.age > 0.14) this.pts.pop();
    if (this.pts.length < 2) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const P = (this.geo.getAttribute('position') as Float32BufferAttribute).array as Float32Array;
    const Al = (this.geo.getAttribute('aA') as Float32BufferAttribute).array as Float32Array;
    for (let i = 0; i < Trail.N; i++) {
      const p = this.pts[Math.min(i, this.pts.length - 1)]!;
      P.set([p.a.x, p.a.y, p.a.z], i * 6);
      P.set([p.b.x, p.b.y, p.b.z], i * 6 + 3);
      const k = i < this.pts.length ? (1 - i / Trail.N) * Math.max(0, 1 - p.age / 0.14) : 0;
      const v = k * (heavy ? 0.6 : 0.36) * (reducedFlash ? 0.6 : 1);
      Al[i * 2] = v;
      Al[i * 2 + 1] = v;
    }
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.getAttribute('aA').needsUpdate = true;
    (this.mat.uniforms.uCol!.value as Color).setRGB(1, heavy ? 0.72 : 0.88, heavy ? 0.4 : 0.66);
  }
}
