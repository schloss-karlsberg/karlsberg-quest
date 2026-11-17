/**
 * K2 W4 "Das sind Kalköfen" (clue.k2.landremont): General Landremont's riders. Was told in a
 * caption ("(Die Reiter sprengen zum Schloss.)"); now, as the craftsman's answer is spoken, three
 * riders gallop past you, 7 m to the side, up towards the palace — dark horses with riders in
 * blue coats, the leader's sabre catching the light — and go small in the frost fog while the
 * hoofbeats fade. The piece runs its own course (it does not stop with the echo's last line).
 * Reduced motion: no leg swing or bob, they glide; reduced flash: no glint on the sabre.
 */
import { BoxGeometry, Color, Group, Mesh, type ShaderMaterial, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameContext } from '../../../core/context';
import { noiseBurst } from '../../../audio/synth';
import { GlowPoints, type Piece, clamp01, paint, pxScale, smooth, solidMaterial } from './common';

/** Where the riders are going: the Ehrenhof (fx/k3-stage COURT_CENTER). */
const PALACE = { x: 1222, z: -1118 };
const RIDERS = 3;
/** Gallop speed (m/s) and how far they ride before they are gone. */
const SPEED = 8.5;
const RUN = 70;

function horseBody() {
  const coat = 0x231a14;
  const body = paint(new BoxGeometry(0.56, 0.62, 1.55), coat).translate(0, 1.32, 0);
  const chest = paint(new BoxGeometry(0.5, 0.56, 0.4), coat).translate(0, 1.36, 0.78);
  const neck = paint(new BoxGeometry(0.3, 0.75, 0.32), coat).rotateX(0.62).translate(0, 1.78, 0.98);
  const head = paint(new BoxGeometry(0.24, 0.26, 0.62), 0x1c1510).rotateX(0.35).translate(0, 2.04, 1.3);
  const ears = paint(new BoxGeometry(0.2, 0.12, 0.05), 0x1c1510).translate(0, 2.22, 1.12);
  const mane = paint(new BoxGeometry(0.06, 0.62, 0.12), 0x120c08).rotateX(0.62).translate(0, 1.92, 0.86);
  const tail = paint(new BoxGeometry(0.1, 0.65, 0.1), 0x120c08).rotateX(-0.45).translate(0, 1.18, -0.92);
  const saddle = paint(new BoxGeometry(0.62, 0.1, 0.5), 0x4a2a18).translate(0, 1.67, -0.05);
  return mergeGeometries([body, chest, neck, head, ears, mane, tail, saddle])!;
}

/** The rider: a French dragoon's shape — coat, legs astride, head, bicorne, the sabre arm raised. */
function riderGeometry(sabre: boolean) {
  const coat = 0x2c3550;
  const parts = [
    paint(new BoxGeometry(0.44, 0.62, 0.3), coat).rotateX(-0.18).translate(0, 2.05, -0.02),
    paint(new BoxGeometry(0.62, 0.32, 0.5), 0x232a40).translate(0, 1.78, -0.1),
    paint(new BoxGeometry(0.13, 0.55, 0.16), 0xc9c0a8).rotateX(0.5).translate(-0.3, 1.55, 0.08),
    paint(new BoxGeometry(0.13, 0.55, 0.16), 0xc9c0a8).rotateX(0.5).translate(0.3, 1.55, 0.08),
    paint(new BoxGeometry(0.2, 0.22, 0.2), 0xb89a80).translate(0, 2.5, 0),
    paint(new BoxGeometry(0.5, 0.14, 0.18), 0x151515).translate(0, 2.66, 0),
    paint(new BoxGeometry(0.11, 0.45, 0.12), coat).rotateX(0.3).translate(-0.27, 2.02, 0.12),
  ];
  // the leader's sabre arm up and forward; the others hold the reins
  if (sabre) {
    parts.push(paint(new BoxGeometry(0.11, 0.5, 0.12), coat).rotateX(-0.9).translate(0.27, 2.35, 0.2));
    parts.push(paint(new BoxGeometry(0.04, 0.85, 0.04), 0xd8dde6).rotateX(-0.5).translate(0.3, 2.85, 0.6));
  } else parts.push(paint(new BoxGeometry(0.11, 0.45, 0.12), coat).rotateX(0.3).translate(0.27, 2.02, 0.12));
  return mergeGeometries(parts)!;
}

function legGeometry() {
  // pivot at the top (the hip / shoulder), hoof at y = -1.05
  return paint(new BoxGeometry(0.13, 1.05, 0.15), 0x1a130e).translate(0, -0.525, 0);
}

interface Rider {
  horse: Group;
  legs: Mesh[];
  from: Vector3;
  delay: number;
  phase: number;
}

export class ReiterPiece implements Piece {
  readonly id = 'k2-reiter';
  done = false;
  private t = 0;
  /** Seconds since the gallop began (−1: not yet). */
  private go = -1;
  private readonly group = new Group();
  private readonly mat: ShaderMaterial;
  private readonly riders: Rider[] = [];
  private readonly dir: Vector3;
  private readonly glint: GlowPoints;
  private hoofT = 0;

  constructor(private readonly ctx: GameContext) {
    const p = ctx.player.position;
    this.dir = new Vector3(PALACE.x - p.x, 0, PALACE.z - p.z);
    if (this.dir.lengthSq() < 1) this.dir.set(0, 0, -1);
    this.dir.normalize();
    // they pass on your right as you face the palace, from a little behind you
    const side = new Vector3(-this.dir.z, 0, this.dir.x);
    this.mat = solidMaterial(0.25, new Color(0.95, 0.7, 0.45));
    this.mat.uniforms.uLift!.value = 0.08;
    const bodyGeo = horseBody();
    const legGeo = legGeometry();
    const riderGeo = riderGeometry(false);
    const riderLead = riderGeometry(true);
    for (let i = 0; i < RIDERS; i++) {
      const lane = 7 + (i % 2) * 1.6;
      const from = new Vector3(p.x - this.dir.x * (10 + i * 4.5) + side.x * lane, 0, p.z - this.dir.z * (10 + i * 4.5) + side.z * lane);
      const horse = new Group();
      horse.add(new Mesh(bodyGeo, this.mat));
      const legs: Mesh[] = [];
      for (const [x, z] of [
        [-0.17, 0.62],
        [0.17, 0.62],
        [-0.17, -0.6],
        [0.17, -0.6],
      ] as const) {
        const l = new Mesh(legGeo, this.mat);
        l.position.set(x, 1.08, z);
        horse.add(l);
        legs.push(l);
      }
      horse.add(new Mesh(i === 0 ? riderLead : riderGeo, this.mat));
      horse.rotation.y = Math.atan2(this.dir.x, this.dir.z);
      horse.visible = false;
      this.group.add(horse);
      this.riders.push({ horse, legs, from, delay: i * 0.45, phase: i * 1.7 });
    }
    ctx.scene.add(this.group);
    this.glint = new GlowPoints(1, { additive: true, renderOrder: 64 });
    ctx.scene.add(this.glint.points);
  }

  line(id: string): void {
    // the craftsman's answer: the general has heard enough, they ride
    if ((id.endsWith('.02') || id.endsWith('.03')) && this.go < 0) this.go = 0;
  }

  frame(dt: number): void {
    const ctx = this.ctx;
    this.t += dt;
    // a memory without its lines (debug, a skipped echo): ride anyway
    if (this.go < 0 && this.t > 9) this.go = 0;
    if (this.go < 0) return;
    this.go += dt;
    const H = (x: number, z: number) => ctx.world.heightAt(x, z);
    const reduced = ctx.settings.state.reducedMotion;
    const steady = ctx.settings.state.reducedFlash;
    let alive = false;
    let lead: Vector3 | null = null;
    let maxA = 0;
    for (const r of this.riders) {
      const g = Math.max(0, this.go - r.delay);
      // from a canter up to a full gallop in a second
      const d = g <= 0 ? 0 : SPEED * (g < 1 ? 0.5 * g * g + 0.3 * g : g - 0.2);
      const a = smooth(g / 0.6) * (1 - smooth((d - 40) / (RUN - 40)));
      if (d < RUN) alive = true;
      const show = g > 0 && a > 0.01;
      r.horse.visible = show;
      if (!show) continue;
      maxA = Math.max(maxA, a);
      const x = r.from.x + this.dir.x * d;
      const z = r.from.z + this.dir.z * d;
      const stride = this.go * 7.5 + r.phase;
      const bob = reduced ? 0 : Math.abs(Math.sin(stride)) * 0.12;
      const y = H(x, z);
      r.horse.position.set(x, y + bob, z);
      r.horse.rotation.x = reduced ? 0 : Math.sin(stride) * 0.05;
      // gallop: front pair and hind pair swing against each other
      r.legs.forEach((l, k) => {
        const off = k < 2 ? 0 : Math.PI * 0.85;
        l.rotation.x = reduced ? 0 : Math.sin(stride + off + (k % 2) * 0.35) * 0.62;
      });
      if (!lead) lead = new Vector3(x, y + bob, z);
    }
    this.mat.uniforms.uAlpha!.value = maxA;
    // the leader's sabre, raised: a glint at the tip
    if (lead && !steady) {
      const side = new Vector3(-this.dir.z, 0, this.dir.x);
      const fl = 0.6 + 0.4 * Math.sin(this.t * 9);
      this.glint.pos.set([lead.x - side.x * 0.3 + this.dir.x * 0.8, lead.y + 3.25, lead.z - side.z * 0.3 + this.dir.z * 0.8], 0);
      this.glint.col.set([2.2, 2.0, 1.6, fl * clamp01(1 - this.go / 6)], 0);
      this.glint.size[0] = 0.35;
    } else this.glint.col.set([0, 0, 0, 0], 0);
    this.glint.commit(pxScale(ctx));
    // hoofbeats: a gallop's three-beat, fading as they go
    this.hoofT -= dt;
    if (this.hoofT <= 0 && this.go < 9) {
      this.hoofT = 0.36;
      const vol = 0.14 * (1 - smooth((this.go - 2.5) / 6));
      if (vol > 0.005) {
        const am = ctx.audio;
        const out = am.bus('sfx');
        for (let k = 0; k < 3; k++) noiseBurst(am, out, { duration: 0.05, freq: 220 + k * 30, q: 2, gain: vol * (1 - k * 0.2), type: 'lowpass', when: k * 0.08 });
      }
    }
    if (!alive) this.done = true;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.riders.length = 0;
    this.mat.dispose();
    this.glint.dispose();
  }
}
