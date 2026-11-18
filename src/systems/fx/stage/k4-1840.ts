/**
 * K4 Forsthausbrunnen, November 1840 (clue.k4.laub_1840): Laub's last night, shown, not told.
 * The young geometer stands at his theodolite with a lantern at his feet, murmuring bearings;
 * a horn far off — he lifts his head; then, one pair after another, twelve pairs of eyes open in
 * the fog all round you at knee height, a growl circling. A voice: "Leg dich hin." He does not.
 * He snatches up the lantern and runs; the eyes swing after the light and stream away with it,
 * Laub thins into the fog and is gone — the picture breaks off, only the theodolite stands.
 */
import { BoxGeometry, Color, CylinderGeometry, Group, Mesh, type ShaderMaterial, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameContext } from '../../../core/context';
import { noiseBurst } from '../../../audio/synth';
import { GhostFigure } from '../../chronik/world/ghosts';
import { playStorySound } from '../../story/sfx';
import { GlowPoints, GradeLoan, type Piece, clamp01, forward, lerp, paint, pxScale, rng, smooth, solidMaterial } from './common';

export const EYE_PAIRS = 12;
const MIST = 46;

interface EyePair {
  x: number;
  z: number;
  /** When it opens (s), -1 = not yet. */
  on: number;
  off: number;
  blink: number;
  phase: number;
}

function theodolite() {
  const brass = 0xb08a3c;
  const wood = 0x5b4330;
  const parts = [0, 1, 2].map((i) => {
    const a = (i / 3) * Math.PI * 2;
    // the legs meet under the head and splay out to the ground
    const leg = paint(new CylinderGeometry(0.028, 0.04, 1.5, 6), wood);
    leg.translate(0, -0.75, 0);
    leg.rotateZ(0.3);
    leg.rotateY(a);
    leg.translate(0, 1.4, 0);
    return leg;
  });
  const head = paint(new CylinderGeometry(0.13, 0.15, 0.1, 14), brass);
  head.translate(0, 1.42, 0);
  const yoke = paint(new BoxGeometry(0.22, 0.22, 0.07), brass);
  yoke.translate(0, 1.56, 0);
  const tube = paint(new CylinderGeometry(0.045, 0.055, 0.5, 10), brass);
  tube.rotateX(Math.PI / 2 - 0.05);
  tube.translate(0, 1.6, 0);
  return mergeGeometries([...parts, head, yoke, tube])!;
}

export class Laub1840Piece implements Piece {
  readonly id = 'k4-1840';
  done = false;
  private t = 0;
  private endT = -1;
  private readonly group = new Group();
  private readonly laub: GhostFigure;
  private readonly theo: Mesh;
  private readonly theoMat: ShaderMaterial;
  private readonly lamp: GlowPoints;
  private readonly eyes: GlowPoints;
  /** The hounds' dark shapes round each pair of eyes (playtest round 5: the eyes alone read as fireflies). */
  private readonly bodies: GlowPoints;
  private readonly grade: GradeLoan;
  private readonly mist: GlowPoints;
  private readonly pairs: EyePair[] = [];
  private readonly center: Vector3;
  private readonly stand: Vector3;
  private readonly laubPos: Vector3;
  private readonly fleeDir: Vector3;
  private look = 0;
  private lookTarget = 0;
  private talk = 0;
  /** Time the eyes start opening / Laub runs (s), -1 = not yet. */
  private eyesAt = -1;
  private runAt = -1;
  private nextStep = 0;
  private hornDir: Vector3;
  private cut: HTMLElement | null = null;
  private readonly mistBase: Float32Array;

  constructor(private readonly ctx: GameContext) {
    const p = ctx.player.position;
    const fwd = forward(ctx.player.yaw);
    const right = new Vector3(-fwd.z, 0, fwd.x);
    const H = (x: number, z: number) => ctx.world.heightAt(x, z);
    const R = rng(1840);
    this.center = new Vector3(p.x + fwd.x * 2, 0, p.z + fwd.z * 2);
    // the theodolite 5 m ahead, a little to the side; Laub behind it, facing away from you
    this.stand = new Vector3(p.x + fwd.x * 5.5 + right.x * 1.2, 0, p.z + fwd.z * 5.5 + right.z * 1.2);
    this.stand.y = H(this.stand.x, this.stand.z);
    this.theoMat = solidMaterial(0.6, new Color(0.7, 0.85, 1.0));
    this.theo = new Mesh(theodolite(), this.theoMat);
    this.theo.position.copy(this.stand);
    this.theo.rotation.y = ctx.player.yaw;
    this.group.add(this.theo);
    // beside the instrument (both stay in view), a little behind it
    this.laubPos = new Vector3(this.stand.x + fwd.x * 0.35 + right.x * 0.85, 0, this.stand.z + fwd.z * 0.35 + right.z * 0.85);
    this.laub = new GhostFigure(1840, { hat: true, dress: false, night: true, count: 4200 });
    this.group.add(this.laub.object);
    this.look = ctx.player.yaw + Math.PI; // GhostFigure faces +z; looking along fwd
    this.lookTarget = this.look;
    // he runs away from you, out through the far side of the ring
    this.fleeDir = fwd.clone().addScaledVector(right, 0.35).normalize();
    this.hornDir = right.clone().multiplyScalar(-1).addScaledVector(fwd, 0.6).normalize();
    // his lantern on the ground by the tripod
    this.lamp = new GlowPoints(3, { additive: true });
    this.group.add(this.lamp.points);
    // twelve pairs all round, 8–13 m out, at knee height
    // most of them where you look (a wide arc ahead), the rest behind you
    const ahead = Math.atan2(fwd.z, fwd.x);
    for (let i = 0; i < EYE_PAIRS; i++) {
      const a = i < 8 ? ahead + ((i + 0.5) / 8 - 0.5) * 3.4 + (R() - 0.5) * 0.2 : ahead + Math.PI + ((i - 8 + 0.5) / 4 - 0.5) * 2.6;
      const r = 7 + R() * 4.5;
      this.pairs.push({ x: this.center.x + Math.cos(a) * r, z: this.center.z + Math.sin(a) * r, on: -1, off: -1, blink: 0, phase: R() * 10 });
    }
    // they open in a sweep that starts behind your right shoulder and closes the ring
    const order = this.pairs.map((_, i) => i).sort((a, b) => ((a * 7) % EYE_PAIRS) - ((b * 7) % EYE_PAIRS));
    order.forEach((idx, k) => (this.pairs[idx]!.phase = k));
    this.eyes = new GlowPoints(EYE_PAIRS * 2, { additive: true, renderOrder: 72 });
    this.group.add(this.eyes.points);
    // a dark body and a head under each pair: the hounds step out of the fog with their eyes
    this.bodies = new GlowPoints(EYE_PAIRS * 2, { additive: false, soft: 0.6, renderOrder: 71 });
    this.group.add(this.bodies.points);
    // November, night, fog: the picture goes cold and dark (the world behind it is 1796 daylight)
    this.grade = new GradeLoan(ctx);
    // low fog banks between the trees: soft grey puffs
    this.mist = new GlowPoints(MIST, { additive: false, soft: 1, renderOrder: 5 });
    this.mistBase = new Float32Array(MIST * 3);
    for (let i = 0; i < MIST; i++) {
      const a = R() * Math.PI * 2;
      const r = 6 + R() * 12;
      const x = this.center.x + Math.cos(a) * r;
      const z = this.center.z + Math.sin(a) * r;
      this.mistBase.set([x, H(x, z) + 0.4 + R() * 0.6, z], i * 3);
      this.mist.size[i] = 5 + R() * 5;
    }
    this.group.add(this.mist.points);
    this.group.name = 'k4-1840';
    ctx.scene.add(this.group);
  }

  line(id: string, dur: number): void {
    const n = id.match(/laub_1840\.(\d+)$/)?.[1];
    if (!n) return;
    const am = this.ctx.audio;
    if (n === '02') {
      // the horn, far off; he lifts his head towards it
      const src = am.createSource3D('sfx', { refDistance: 30 });
      const h = this.hornDir;
      if (src) {
        src.setPosition(this.stand.x + h.x * 120, this.stand.y + 10, this.stand.z + h.z * 120);
        playStorySound(am, 'horn', src.input, 'anblasen');
        setTimeout(() => src.dispose(), 6000);
      } else playStorySound(am, 'horn', null, 'anblasen');
      this.lookTarget = Math.atan2(h.x, h.z);
    } else if (n === '04') {
      this.eyesAt = this.t;
      this.lookTarget = Math.atan2(this.ctx.player.position.x - this.laubPos.x, this.ctx.player.position.z - this.laubPos.z);
    } else if (n === '08') {
      this.runAt = this.t;
      this.lookTarget = Math.atan2(this.fleeDir.x, this.fleeDir.z);
    }
    this.talk = n === '01' || n === '03' || n === '06' ? dur : 0;
  }

  end(): void {
    if (this.endT >= 0) return;
    this.endT = this.t;
    // the picture breaks off: a hard cut to black, then the present
    const el = document.createElement('div');
    el.className = 'kq-stage-cut';
    el.dataset['testid'] = 'stage-cut';
    if (this.ctx.settings.state.reducedFlash) el.classList.add('soft');
    document.body.append(el);
    this.cut = el;
  }

  /** Eyes open (tests). */
  get open(): number {
    return this.pairs.filter((p) => p.on >= 0 && (p.off < 0 || this.t < p.off)).length;
  }

  get running(): boolean {
    return this.runAt >= 0;
  }

  frame(dt: number): void {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    const H = (x: number, z: number) => ctx.world.heightAt(x, z);
    const reduced = ctx.settings.state.reducedMotion;
    const endK = this.endT < 0 ? 0 : clamp01((t - this.endT) / 0.9);
    if (this.endT >= 0 && t - this.endT > 1.2) {
      this.done = true;
      return;
    }
    const fadeIn = smooth(t / 1.2);
    // ---- Laub: writes, lifts his head, turns, runs and thins into the fog
    let laubFade = fadeIn;
    if (this.runAt >= 0) {
      const rt = t - this.runAt;
      const sp = rt < 0.5 ? rt * 6 : 3 + Math.min(4, rt * 3);
      this.laubPos.addScaledVector(this.fleeDir, sp * dt * (reduced ? 0.7 : 1));
      this.laub.walkAmt = Math.min(1, this.laub.walkAmt + dt * 4);
      this.laub.walk += dt * 11;
      laubFade *= 1 - smooth((rt - 0.9) / 1.7);
      if (t >= this.nextStep && rt < 3) {
        this.nextStep = t + 0.24;
        noiseBurst(ctx.audio, ctx.audio.bus('sfx'), { duration: 0.12, freq: 900, q: 0.8, gain: 0.12 * Math.max(0.1, 1 - rt / 3) });
      }
    } else {
      this.laub.walkAmt = Math.max(0, this.laub.walkAmt - dt * 2);
    }
    let d = this.lookTarget - this.look;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.look += d * Math.min(1, dt * (this.runAt >= 0 ? 8 : 2.5));
    this.talk = Math.max(0, this.talk - dt);
    const k = Math.min(1, dt * 3);
    this.laub.talk += ((this.talk > 0 ? 1 : 0) - this.laub.talk) * k;
    // bent over the instrument until the horn, then upright
    this.laub.gesture += ((this.eyesAt < 0 && this.lookTarget === this.look ? 0.6 : this.runAt >= 0 ? 1 : 0.2) - this.laub.gesture) * k;
    this.laub.object.position.set(this.laubPos.x, H(this.laubPos.x, this.laubPos.z), this.laubPos.z);
    this.laub.object.rotation.y = this.look;
    this.laub.fade = laubFade * (1 - endK);
    this.laub.alpha = 0.9;
    this.laub.apply();
    this.theoMat.uniforms.uAlpha!.value = fadeIn * (1 - endK);
    // ---- the lantern: on the ground, then in his hand, running
    const carried = this.runAt >= 0;
    const lx = carried ? this.laubPos.x + this.fleeDir.z * 0.3 : this.stand.x - this.fleeDir.z * 0.45;
    const lz = carried ? this.laubPos.z - this.fleeDir.x * 0.3 : this.stand.z + this.fleeDir.x * 0.45;
    const ly = H(lx, lz) + (carried ? 0.85 : 0.18);
    const flick = reduced || ctx.settings.state.reducedFlash ? 1 : 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3);
    const la = fadeIn * flick * (carried ? Math.max(0, 1 - smooth((t - this.runAt - 1.4) / 1.6)) : 1) * (1 - endK);
    // the flame, its glow and the light it throws on the ground
    const gy = H(lx, lz) + 0.05;
    this.lamp.pos.set([lx, ly, lz, lx, ly, lz, lx, gy, lz], 0);
    this.lamp.col.set([4.0, 2.4, 0.9, la, 1.8, 1.0, 0.35, la * 0.45, 0.9, 0.55, 0.2, la * 0.3], 0);
    this.lamp.size[0] = 0.35;
    this.lamp.size[1] = 2.6;
    this.lamp.size[2] = 5;
    this.lamp.commit(pxScale(ctx));
    // ---- the eyes: open one pair after another, then stream after the light and go out
    const right = new Vector3();
    const cam = ctx.camera.position;
    this.pairs.forEach((e, i) => {
      if (this.eyesAt >= 0 && e.on < 0 && t >= this.eyesAt + e.phase * 0.32) {
        e.on = t;
        if (e.phase % 3 === 0) noiseBurst(ctx.audio, ctx.audio.bus('sfx'), { duration: 0.5, freq: 140, q: 2, gain: 0.12, attack: 0.15, type: 'lowpass' });
      }
      if (this.runAt >= 0) {
        // they follow the light: drift towards his path, lagging by their distance
        const rt = t - this.runAt - 0.2 - (e.phase % 4) * 0.12;
        if (rt > 0) {
          const tx = this.laubPos.x - this.fleeDir.x * (2 + (i % 4) * 1.6) + this.fleeDir.z * ((i % 3) - 1) * 2.5;
          const tz = this.laubPos.z - this.fleeDir.z * (2 + (i % 4) * 1.6) - this.fleeDir.x * ((i % 3) - 1) * 2.5;
          const f = Math.min(1, dt * (1.5 + rt * 1.2));
          e.x = lerp(e.x, tx, f);
          e.z = lerp(e.z, tz, f);
          if (e.off < 0 && rt > 1.4 + (e.phase % 5) * 0.2) e.off = t + 0.4;
        }
      }
      const on = e.on < 0 ? 0 : smooth((t - e.on) / 0.35);
      const flare = e.on < 0 ? 0 : 1 + 1.4 * Math.max(0, 1 - (t - e.on) / 0.6);
      const gone = e.off < 0 ? 1 : 1 - smooth((t - e.off) / 0.5);
      // a slow blink now and then
      const bl = reduced ? 1 : Math.sin(t * 0.7 + e.phase * 1.7) > 0.97 ? 0.1 : 1;
      const a = on * gone * bl * (1 - endK);
      const y = H(e.x, e.z) + 0.52 + (reduced ? 0 : Math.sin(t * 1.1 + e.phase) * 0.03);
      right.set(cam.z - e.z, 0, -(cam.x - e.x)).normalize().multiplyScalar(0.12);
      const o = i * 6;
      this.eyes.pos.set([e.x - right.x, y, e.z - right.z, e.x + right.x, y, e.z + right.z], o);
      const c = 3.4 * flare;
      this.eyes.col.set([c, c * 0.42, c * 0.12, a, c, c * 0.42, c * 0.12, a], i * 8);
      this.eyes.size[i * 2] = this.eyes.size[i * 2 + 1] = 0.36;
      // the hound behind the eyes: a dark head round them and a body low behind, coming out of the
      // fog as the eyes open (and going with them)
      const bodyA = (e.on < 0 ? 0 : smooth((t - e.on) / 0.9)) * gone * (1 - endK) * 0.82;
      const away = Math.hypot(e.x - cam.x, e.z - cam.z) || 1;
      const ux = (e.x - cam.x) / away;
      const uz = (e.z - cam.z) / away;
      this.bodies.pos.set([e.x, y + 0.02, e.z, e.x + ux * 0.55, y - 0.18, e.z + uz * 0.55], i * 6);
      this.bodies.col.set([0.02, 0.022, 0.03, bodyA, 0.015, 0.016, 0.022, bodyA * 0.9], i * 8);
      this.bodies.size[i * 2] = 0.75;
      this.bodies.size[i * 2 + 1] = 1.35;
    });
    this.eyes.commit(pxScale(ctx));
    this.bodies.commit(pxScale(ctx));
    // the grade: cold night fog, darker still while the eyes are out
    const gk = fadeIn * (1 - endK) * (this.eyesAt < 0 ? 0.75 : 0.75 + 0.25 * smooth((t - this.eyesAt) / 2));
    this.grade.set(gk, new Color(0.0, 0.006, 0.02), new Color(0.42, 0.47, 0.6), 0.45);
    // ---- the fog banks thicken while the eyes are out
    const mk = (this.eyesAt < 0 ? 0.35 : 0.35 + 0.4 * smooth((t - this.eyesAt) / 3)) * fadeIn * (1 - endK);
    for (let i = 0; i < MIST; i++) {
      const o = i * 3;
      const dr = reduced ? 0 : Math.sin(t * 0.13 + i) * 0.8;
      this.mist.pos[o] = this.mistBase[o]! + dr;
      this.mist.pos[o + 1] = this.mistBase[o + 1]!;
      this.mist.pos[o + 2] = this.mistBase[o + 2]! - dr * 0.6;
      this.mist.col.set([0.42, 0.46, 0.54, 0.24 * mk], i * 4);
    }
    this.mist.commit(pxScale(ctx));
  }

  dispose(): void {
    this.group.removeFromParent();
    this.laub.dispose();
    this.theo.geometry.dispose();
    this.theoMat.dispose();
    this.lamp.dispose();
    this.eyes.dispose();
    this.bodies.dispose();
    this.grade.release();
    this.mist.dispose();
    const el = this.cut;
    if (el) setTimeout(() => el.remove(), 900);
  }
}
