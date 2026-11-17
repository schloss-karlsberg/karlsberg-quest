/**
 * K2 "Fackeln" (clue.k2.fackeln): the Duke's departure in the frost night. Was told in two
 * captions ("Räder knirschen im Raureif. Pferde schnauben." … "Hufschlag nach Norden, immer
 * leiser."); now three wagons with torchbearers roll out before you, north up the Allee, the
 * torches swinging, and grow small and go out in the fog while the hoofbeats fade.
 */
import { Color, Group, Mesh, type ShaderMaterial, Vector3 } from 'three';
import type { GameContext } from '../../../core/context';
import { noiseBurst } from '../../../audio/synth';
import { GhostFigure } from '../../chronik/world/ghosts';
import { GlowPoints, type Piece, clamp01, forward, pxScale, smooth, solidMaterial } from './common';
import { cartGeometry, wheelGeometry } from './k4-rewind';

const WAGONS = 3;

interface Wagon {
  group: Group;
  wheels: Mesh[];
  from: Vector3;
  pos: Vector3;
  t0: number;
  torch: GhostFigure;
}

export class AbfahrtPiece implements Piece {
  readonly id = 'k2-abfahrt';
  done = false;
  private t = 0;
  private endT = -1;
  /** Seconds since the first wheel moved (−1: not yet). */
  private go = -1;
  private readonly group = new Group();
  private readonly mat: ShaderMaterial;
  private readonly wagons: Wagon[] = [];
  private readonly torches: GlowPoints;
  private readonly dir: Vector3;
  private hoofT = 0;

  constructor(private readonly ctx: GameContext) {
    const pl = ctx.player;
    const p = pl.position;
    const fwd = forward(pl.yaw);
    const right = new Vector3(-fwd.z, 0, fwd.x);
    // they leave northwards; if north is behind you they leave the way you look
    const north = new Vector3(0, 0, -1);
    this.dir = north.dot(fwd) > -0.2 ? north : fwd.clone();
    const side = new Vector3(-this.dir.z, 0, this.dir.x);
    this.mat = solidMaterial(0.2, new Color(0.9, 0.55, 0.3));
    this.mat.uniforms.uLift!.value = 0.05;
    const cartGeo = cartGeometry();
    const wheelGeo = wheelGeometry();
    const night = ctx.era.info.night;
    for (let i = 0; i < WAGONS; i++) {
      // across your view, 9 m ahead, one behind the other along the road
      const from = new Vector3(p.x + fwd.x * 9 + right.x * 1.5 - this.dir.x * i * 5.5 + side.x * 0.4, 0, p.z + fwd.z * 9 + right.z * 1.5 - this.dir.z * i * 5.5 + side.z * 0.4);
      const group = new Group();
      group.add(new Mesh(cartGeo, this.mat));
      const wheels: Mesh[] = [];
      for (const s of [-0.85, 0.85]) {
        const w = new Mesh(wheelGeo, this.mat);
        w.position.set(s, 0.62, 0.3);
        group.add(w);
        wheels.push(w);
      }
      // the shafts lead (+z of the cart): towards where it goes
      group.rotation.y = Math.atan2(this.dir.x, this.dir.z);
      this.group.add(group);
      const torch = new GhostFigure(1793 + i * 11, { hat: true, dress: false, night, count: 2400 });
      this.group.add(torch.object);
      this.wagons.push({ group, wheels, from, pos: from.clone(), t0: i * 0.7, torch });
    }
    ctx.scene.add(this.group);
    this.torches = new GlowPoints(WAGONS * 2, { additive: true, renderOrder: 64 });
    ctx.scene.add(this.torches.points);
  }

  line(id: string): void {
    // the wheels start at the first caption, the hoofbeats fade with the last
    if (id.endsWith('.01') && this.go < 0) this.go = 0;
  }

  end(): void {
    if (this.endT < 0) this.endT = this.t;
  }

  frame(dt: number): void {
    const ctx = this.ctx;
    this.t += dt;
    if (this.go < 0 && this.t > 2.5) this.go = 0;
    if (this.go >= 0) this.go += dt;
    const H = (x: number, z: number) => ctx.world.heightAt(x, z);
    const fadeIn = smooth(this.t / 1.2);
    const fadeOut = this.endT < 0 ? 1 : 1 - clamp01((this.t - this.endT) / 1.0);
    if (this.endT >= 0 && this.t - this.endT > 1.0) {
      this.done = true;
      return;
    }
    const reduced = ctx.settings.state.reducedMotion;
    const steady = ctx.settings.state.reducedFlash;
    let k = 0;
    for (const w of this.wagons) {
      const g = Math.max(0, this.go - w.t0);
      // walking pace, picking up to a trot
      const d = g <= 0 ? 0 : 1.2 * g + 0.22 * g * g;
      const prev = w.pos.clone();
      w.pos.set(w.from.x + this.dir.x * d, 0, w.from.z + this.dir.z * d);
      const moved = prev.distanceTo(w.pos);
      w.pos.y = H(w.pos.x, w.pos.z);
      w.group.position.copy(w.pos);
      for (const wh of w.wheels) wh.rotation.x += moved / 0.62;
      // far away they thin into the fog
      const far = 1 - smooth((d - 35) / 25);
      const a = fadeIn * fadeOut * far;
      // the torchbearer walks beside the horse's place, torch high
      const side = new Vector3(-this.dir.z, 0, this.dir.x);
      const tx = w.pos.x + this.dir.x * 2.6 + side.x * 1.1;
      const tz = w.pos.z + this.dir.z * 2.6 + side.z * 1.1;
      w.torch.object.position.set(tx, H(tx, tz), tz);
      w.torch.object.rotation.y = w.group.rotation.y;
      w.torch.walkAmt = moved > 0.001 ? 1 : Math.max(0, w.torch.walkAmt - dt * 2);
      w.torch.walk += moved * 2.6;
      w.torch.fade = a;
      w.torch.alpha = 0.85;
      w.torch.apply();
      const sway = reduced ? 0 : Math.sin(this.t * 2.2 + k) * 0.08;
      const fl = steady ? 1 : 0.8 + 0.2 * Math.sin(this.t * 15 + k * 3) * Math.sin(this.t * 6.1 + k);
      const ty = H(tx, tz) + 2.25;
      this.torches.pos.set([tx + side.x * (0.3 + sway), ty, tz + side.z * (0.3 + sway), tx + side.x * 0.3, ty, tz + side.z * 0.3], k * 6);
      this.torches.col.set([4, 2.2, 0.7, a * fl, 1.8, 0.8, 0.25, a * 0.45 * fl], k * 8);
      this.torches.size[k * 2] = 0.3;
      this.torches.size[k * 2 + 1] = 3.2;
      k++;
    }
    this.torches.commit(pxScale(ctx));
    this.mat.uniforms.uAlpha!.value = fadeIn * fadeOut * (1 - smooth((this.go - 18) / 6));
    // hoofbeats: a soft double knock, quieter as they go
    this.hoofT -= dt;
    if (this.go > 0 && this.hoofT <= 0 && fadeOut > 0.2) {
      this.hoofT = 0.42;
      const vol = 0.09 * (1 - smooth((this.go - 4) / 14));
      if (vol > 0.005) {
        const am = ctx.audio;
        const out = am.bus('sfx');
        noiseBurst(am, out, { duration: 0.06, freq: 260, q: 2, gain: vol, type: 'lowpass' });
        noiseBurst(am, out, { duration: 0.05, freq: 300, q: 2, gain: vol * 0.7, type: 'lowpass', when: 0.12 });
      }
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const w of this.wagons) w.torch.dispose();
    this.wagons.length = 0;
    this.mat.dispose();
    this.torches.dispose();
  }
}
