/**
 * Rigged spectral enemies (medium / high quality; visual only, reads the simulation): the
 * Streuner is a smoke hound on a CC0 wolf rig, the Raffschatten a smoke plunderer on a human rig
 * (his pack is the loot), the Pikeur rides a spectral horse with two hounds at heel — the rider is
 * the human rig seated in the saddle (thighs over the flanks, shins down, bent after the mixer),
 * cracking the whip with the slash clip, a tricorn on his head. Clips follow the AI state: walk /
 * gallop by real ground speed, the wind-up held at the start of the attack clip (anticipation),
 * the strike played through, a hit flinch, the death clip under a burning dissolve.
 *
 * The bodies use the spectral shader (characters/shaders.ts): dark smoke with a fog-contrast rim,
 * a small family core, the telegraph on the rim. Eyes are glows at the model's own eyes (head
 * bone), so they keep their minimum on-screen size like every enemy's eyes.
 */
import { Group, Matrix4, type Mesh, Quaternion, type ShaderMaterial, Vector3 } from 'three';
import type { AssetLoader, LoadedModel } from '../../assets/loader';
import { type EnemyRig, enemyModels, enemyRig, HIDDEN_MESHES, PIKEUR_RIG } from '../characters/catalog';
import { Rig } from '../characters/rig';
import { spectralMaterials, spectralShared } from '../characters/shaders';
import type { Enemy } from './sim';

type Uniforms = Record<string, { value: unknown }>;

interface Body {
  rig: Rig;
  def: EnemyRig;
  u: Uniforms;
  mats: ShaderMaterial[];
  /** Offset from the enemy (m, right / forward) for the Pikeur's hounds. */
  off: [number, number] | null;
  last: Vector3;
  speed: number;
  /** Last AI state seen and the clip time it started (strike timing). */
  state: string;
  flinch: number;
  /** Seated on the first body (the Pikeur's rider). */
  seat: boolean;
  /** The seated legs' pose from the mixer (restored while frozen). */
  legPose?: Quaternion[];
  legSaved?: boolean;
}

interface EnemyBodies {
  bodies: Body[];
  seen: boolean;
}

export interface RigPose {
  lean: number;
  sink: number;
  tellK: number;
  flash: number;
  /** 0..1 shove from the last hit. */
  flinch: number;
  stunned: boolean;
  /** 0 alive … 1 gone (leaving). */
  fade: number;
  /** 0..1: dissolving (death). */
  dissolve: number;
  reducedFlash: boolean;
  frozen: boolean;
}

export type GlowFn = (x: number, y: number, z: number, size: number, intensity: number, r: number, g: number, b: number, minPx: number) => void;
/** Draw a solid piece (a prop on a rig: the rider's hat, his whip). */
export type SolidFn = (shape: 'block' | 'box' | 'spike', m: Matrix4, r: number, g: number, b: number, er: number, eg: number, eb: number, mat: number) => void;

const _v = new Vector3();
const _v2 = new Vector3();
const _zero = new Vector3();
const _qa = new Quaternion();
const _qb = new Quaternion();
const _qc = new Quaternion();
const _axis = new Vector3();
const _hm = new Matrix4();
const _hs = new Vector3();
const _RIGHT = new Vector3(1, 0, 0);
const _FWD = new Vector3(0, 0, 1);

/** Turn a bone after the mixer about an axis given in the rig root's frame (radians). */
function turnAbout(rig: Rig, name: string, ax: Vector3, angle: number): void {
  const b = rig.bone(name);
  const p = b?.parent;
  if (!b || !p) return;
  p.getWorldQuaternion(_qa).invert();
  rig.root.getWorldQuaternion(_qb);
  _axis.copy(ax).applyQuaternion(_qb).applyQuaternion(_qa).normalize();
  b.quaternion.premultiply(_qc.setFromAxisAngle(_axis, angle));
}

/** Is this AI state moving the body over the ground? */
function locomotive(s: string): boolean {
  return s === 'approach' || s === 'circle' || s === 'retreat' || s === 'return' || s === 'flee' || s === 'leave' || s === 'idle' || s === 'notice';
}

export class EnemyRigs {
  readonly object = new Group();
  private assets: AssetLoader | null = null;
  private readonly live = new Map<string, EnemyBodies>();
  private readonly loading = new Set<string>();

  constructor() {
    this.object.name = 'combat-rigs';
  }

  /** Rigged bodies on (an asset loader) or off (null: the low tier draws everything procedurally). */
  setAssets(a: AssetLoader | null): void {
    this.assets = a;
    if (!a) this.clear();
  }

  get enabled(): boolean {
    return this.assets !== null;
  }

  /** Does this enemy draw as a rig this frame (its models loaded)? Starts the load otherwise. */
  ready(e: Enemy): boolean {
    const a = this.assets;
    if (!a || !enemyRig(e.kind)) return false;
    let ok = true;
    for (const id of enemyModels(e.kind)) {
      if (a.peek(id)) continue;
      ok = false;
      if (!this.loading.has(id)) {
        this.loading.add(id);
        a.model(id).catch((err: unknown) => console.warn('[combat] rig failed', id, err));
      }
    }
    return ok;
  }

  private make(e: Enemy): EnemyBodies {
    const a = this.assets!;
    const bodies: Body[] = [];
    const add = (def: EnemyRig, off: [number, number] | null, scale: number, seat = false) => {
      const src = a.peek<LoadedModel>(def.model)!;
      const rig = new Rig(src, def.height * scale);
      const hide = seat ? HIDDEN_MESHES[def.model] : undefined;
      if (hide) for (const m of rig.meshes) if (hide.test(m.name)) m.visible = false;
      const u = spectralShared(def.body, def.core, (e.seed * 7.13 + bodies.length * 0.37) % 1);
      u.uHeight!.value = def.height * scale;
      u.uCoreR!.value = def.coreR * scale;
      const mats: ShaderMaterial[] = [];
      for (const m of [...rig.meshes]) {
        const { body, depth } = spectralMaterials(u);
        m.material = body;
        m.renderOrder = 7;
        const d = m.clone(false) as Mesh;
        d.material = depth;
        d.renderOrder = 6;
        m.parent?.add(d);
        mats.push(body, depth);
      }
      rig.root.rotation.order = 'YXZ';
      rig.play(def.idle, { fade: 0 });
      const c = rig.current;
      if (c) c.time = (e.seed * 3.1) % c.getClip().duration;
      this.object.add(rig.root);
      bodies.push({ rig, def, u, mats, off, last: new Vector3(NaN, 0, 0), speed: 0, state: '', flinch: 0, seat });
    };
    const size = e.size ?? 1;
    if (e.kind === 'pikeur') {
      add(PIKEUR_RIG.horse, null, size);
      for (const o of PIKEUR_RIG.hounds) add(PIKEUR_RIG.hound, [o[0] * size, o[1] * size], 1);
      add(PIKEUR_RIG.rider, null, size * 1.12, true);
    } else add(enemyRig(e.kind)!, null, size);
    const eb = { bodies, seen: true };
    this.live.set(e.id, eb);
    return eb;
  }

  /** Draw one enemy's rig(s) this frame. */
  draw(e: Enemy, p: RigPose, dt: number, glow: GlowFn, solid?: SolidFn): void {
    const eb = this.live.get(e.id) ?? this.make(e);
    eb.seen = true;
    const yaw = e.heading + Math.PI;
    const cos = Math.cos(e.heading);
    const sin = Math.sin(e.heading);
    for (const b of eb.bodies) {
      const r = b.rig;
      const o = r.root;
      o.visible = true;
      // place: the hounds trot at the horse's heels (template frame: right r, forward f → -z)
      let x = e.x;
      let z = e.z;
      if (b.off) {
        const [rr, ff] = b.off;
        x += rr * cos - ff * sin;
        z += -rr * sin - ff * cos;
      }
      const shove = p.flinch * (e.boss ? 0.06 : 0.22 / Math.max(1, e.size));
      o.position.set(x + e.hitX * shove, e.y - p.sink, z + e.hitZ * shove);
      o.rotation.y = yaw;
      o.rotation.x = p.lean * 0.5;
      // the rider: in the saddle of the horse drawn just before him, his hips a little below it
      const horse = eb.bodies[0]!;
      if (b.seat && horse !== b && horse.rig.boneWorld(PIKEUR_RIG.saddleBone, _zero, _v)) {
        o.position.set(_v.x, _v.y - PIKEUR_RIG.saddleDrop * (e.size ?? 1), _v.z);
        o.rotation.x = p.lean * 0.3;
      }
      // ground speed from the travel (clip choice and its playback rate)
      if (Number.isFinite(b.last.x) && dt > 0) {
        const sp = Math.hypot(x - b.last.x, z - b.last.z) / dt;
        b.speed += (Math.min(sp, 14) - b.speed) * Math.min(1, dt * 8);
      }
      b.last.set(x, 0, z);
      this.animate(e, b, p);
      if (!p.frozen) r.update(dt);
      if (b.seat) {
        // seated: thighs forward and out over the flanks, shins down. The turns are made on the
        // mixer's pose; frozen (no mixer update) the saved pose is restored first, so they never pile up.
        // The loader stores these bones as 'UpperLegL' etc. (sanitized names); rig.bone() finds both
        const legs = ['UpperLeg.L', 'UpperLeg.R', 'LowerLeg.L', 'LowerLeg.R'];
        b.legPose ??= legs.map(() => new Quaternion());
        legs.forEach((n, i) => {
          const q = r.bone(n)?.quaternion;
          if (!q) return;
          if (p.frozen && b.legSaved) q.copy(b.legPose![i]!);
          else b.legPose![i]!.copy(q);
        });
        b.legSaved = true;
        for (const [side, n] of [
          [1, 'L'],
          [-1, 'R'],
        ] as const) {
          turnAbout(r, `UpperLeg.${n}`, _RIGHT, -1.35);
          turnAbout(r, `UpperLeg.${n}`, _FWD, side * 0.42);
          turnAbout(r, `LowerLeg.${n}`, _RIGHT, 1.45);
        }
      }
      // shader state
      const u = b.u;
      u.uAlpha!.value = 1 - p.fade;
      u.uFlash!.value = p.reducedFlash ? Math.min(0.5, p.flash) : p.flash;
      u.uTellK!.value = p.tellK;
      u.uDissolve!.value = p.dissolve;
      u.uStun!.value = p.stunned ? 1 : 0;
      o.updateMatrixWorld();
      u.uBaseY!.value = o.matrixWorld.elements[13];
      // the heart: up the body, a little forward (the chest), riding the lean
      const s = (u.uHeight!.value as number) / b.def.height;
      (u.uCoreP!.value as Vector3).set(0, b.def.coreY * b.def.height * s, b.def.coreF * s).applyMatrix4(o.matrixWorld);
      // eyes: at the model's own eyes, flaring with the telegraph
      const eyes = r.info.eyes;
      if (eyes && p.dissolve < 0.5 && p.fade < 0.95) {
        let I = (1 + p.tellK * 1.6 + p.flash) * (1 - p.fade) * (e.aggro ? 1.4 : 0.9);
        if (p.stunned) I *= 0.6;
        if (p.reducedFlash) I = Math.min(I, 2.2);
        const size = b.def.eyeSize * (1 + p.tellK * 0.6) * (b.off ? 1 : e.size);
        const c = b.def.eye;
        for (const local of [eyes.l, eyes.r]) {
          if (!r.boneWorld(r.info.head, local, _v)) continue;
          glow(_v.x, _v.y, _v.z, size, I, c[0], c[1], c[2], 4.5);
        }
      }
      // the rider's tricorn (brim, crown, brass band) over his eyes, facing where the horse goes
      if (b.seat && solid && eyes && p.dissolve < 0.4 && p.fade < 0.9 && r.boneWorld(r.info.head, eyes.l, _v) && r.boneWorld(r.info.head, eyes.r, _v2)) {
        const k = (u.uHeight!.value as number) / 1.9;
        _v.add(_v2).multiplyScalar(0.5);
        _qa.setFromAxisAngle(_axis.set(0, 1, 0), yaw);
        const put = (shape: 'block' | 'box', up: number, back: number, sx: number, sy: number, sz: number, c: [number, number, number], em: [number, number, number]) => {
          _v2.set(0, up * k, -back * k).applyQuaternion(_qa).add(_v);
          _hm.compose(_v2, _qa, _hs.set(sx * k, sy * k, sz * k));
          solid(shape, _hm, c[0], c[1], c[2], em[0], em[1], em[2], 3);
        };
        put('block', 0.12, 0.04, 0.62, 0.05, 0.52, [0.02, 0.02, 0.025], [0, 0, 0]);
        put('block', 0.2, 0.05, 0.3, 0.16, 0.28, [0.02, 0.02, 0.025], [0, 0, 0]);
        put('box', 0.135, -0.18, 0.46, 0.03, 0.03, [0.6, 0.46, 0.18], [0.14, 0.1, 0.03]);
      }
    }
  }

  /** Pick the clip for the AI state. */
  private animate(e: Enemy, b: Body, p: RigPose): void {
    const r = b.rig;
    const d = b.def;
    const s = e.state;
    const entered = s !== b.state;
    b.state = s;
    if (s === 'dissolve') {
      if (entered) r.play(d.death, { once: true, fade: 0.12, speed: 1.4 });
      return;
    }
    if (s === 'windup') {
      // anticipation: the attack clip held at its wind-up, creeping forward as the tell fills
      const w = Math.min(1, e.t / Math.max(0.01, e.windup));
      r.hold(d.attack, d.attackWindup * (0.35 + 0.65 * w), entered ? 0.12 : 0);
      return;
    }
    if (s === 'strike') {
      if (entered) {
        const a = r.play(d.attack, { once: true, fade: 0.06, speed: 1.5 });
        if (a) a.time = d.attackWindup * a.getClip().duration;
      }
      return;
    }
    if (s === 'stagger' || (p.flinch > 0.9 && b.flinch < 0.9)) {
      if (r.currentName !== d.hit || entered) r.play(d.hit, { once: true, fade: 0.06, restart: true, speed: 1.2 });
      b.flinch = p.flinch;
      return;
    }
    b.flinch = p.flinch;
    // let a hit react or the end of a strike finish before going back to locomotion
    if ((r.currentName === d.hit || r.currentName === d.attack) && r.progress() < 0.9 && s !== 'approach') return;
    if (s === 'gebannt') {
      r.play(d.idle, { fade: 0.3, speed: 0.25 });
      return;
    }
    if (s === 'intro' || s === 'roar') {
      r.play(d.idle, { fade: 0.3, speed: 1.6 });
      return;
    }
    const sp = locomotive(s) || s === 'recover' ? b.speed : 0;
    if (sp > d.walkSpeed * 1.8) r.play(d.run, { fade: 0.2, speed: Math.max(0.7, Math.min(1.8, sp / d.runSpeed)) });
    else if (sp > 0.25) r.play(d.walk, { fade: 0.2, speed: Math.max(0.5, Math.min(2, sp / d.walkSpeed)) });
    else r.play(d.idle, { fade: 0.35 });
  }

  /** After every enemy was drawn: drop the rigs of enemies that are gone. */
  end(): void {
    for (const [id, eb] of this.live) {
      if (!eb.seen) {
        this.disposeBodies(eb);
        this.live.delete(id);
      } else eb.seen = false;
    }
  }

  /** Hide every rig (an enemy not drawn this frame keeps nothing on screen). */
  begin(): void {
    for (const eb of this.live.values()) for (const b of eb.bodies) b.rig.root.visible = false;
  }

  private disposeBodies(eb: EnemyBodies): void {
    for (const b of eb.bodies) {
      b.rig.dispose();
      for (const m of b.mats) m.dispose();
    }
  }

  clear(): void {
    for (const eb of this.live.values()) this.disposeBodies(eb);
    this.live.clear();
  }

  dispose(): void {
    this.clear();
    this.object.removeFromParent();
  }
}
