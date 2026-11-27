/**
 * K1 Registratur (was "[Ein Fenster schlägt auf. Papier flattert hinaus in den Küchenhof.]"):
 * a gust tears the reminders off the desk in front of you; forty sheets whirl up round you,
 * then stream away towards the courtyard (the cue's tx / tz) and are gone. The sheets are pale
 * ghost paper with a cold rim, each tumbling on its own axis. Reduced motion: fewer, slower.
 */
import { Color, DoubleSide, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3, Euler } from 'three';
import type { GameContext } from '../../../core/context';
import { type Piece, clamp01, forward, paint, rng, smooth, solidMaterial } from './common';

const N = 40;
const LIFE = 5.2;

interface Sheet {
  ox: number;
  oy: number;
  oz: number;
  delay: number;
  swirl: number;
  rad: number;
  spin: Vector3;
  phase: number;
  speed: number;
}

export class PapersPiece implements Piece {
  readonly id = 'k1-papers';
  done = false;
  time = 0;
  private readonly mesh: InstancedMesh;
  private readonly sheets: Sheet[] = [];
  private readonly origin: Vector3;
  private readonly away: Vector3;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly s = new Vector3(1, 1, 1);
  private readonly p = new Vector3();
  private readonly n: number;

  constructor(
    private readonly ctx: GameContext,
    tx: number,
    tz: number,
  ) {
    const pl = ctx.player.position;
    const f = forward(ctx.player.yaw);
    // the desk in front of you
    this.origin = new Vector3(pl.x + f.x * 2.2, pl.y + 1.0, pl.z + f.z * 2.2);
    const to = new Vector3(tx - this.origin.x, 0, tz - this.origin.z);
    if (to.lengthSq() < 1) to.copy(f);
    this.away = to.normalize();
    this.n = ctx.settings.state.reducedMotion ? 18 : N;
    const R = rng(1789);
    for (let i = 0; i < this.n; i++) {
      this.sheets.push({
        ox: (R() - 0.5) * 1.2,
        oy: R() * 0.3,
        oz: (R() - 0.5) * 0.8,
        delay: R() * 0.9,
        swirl: (R() < 0.5 ? -1 : 1) * (1.8 + R() * 2.2),
        rad: 0.6 + R() * 1.6,
        spin: new Vector3(R() * 7 - 3.5, R() * 9 - 4.5, R() * 7 - 3.5),
        phase: R() * 6.28,
        speed: 6 + R() * 6,
      });
    }
    const g = paint(new PlaneGeometry(0.24, 0.32), new Color(0.93, 0.88, 0.74));
    const mat = solidMaterial(0.5, new Color(0.75, 0.85, 1.0));
    mat.side = DoubleSide;
    mat.uniforms.uLift!.value = 0.55;
    this.mesh = new InstancedMesh(g, mat, this.n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 61;
    ctx.scene.add(this.mesh);
  }

  frame(dt: number): void {
    const slow = this.ctx.settings.state.reducedMotion ? 0.6 : 1;
    this.time += dt * slow;
    const t = this.time;
    const { origin, away } = this;
    const side = new Vector3(-away.z, 0, away.x);
    for (let i = 0; i < this.n; i++) {
      const s = this.sheets[i]!;
      const u = Math.max(0, t - s.delay);
      // 0 … 1.4 s: up and round in the gust; then out along `away`, rising, faster and faster
      const lift = smooth(u / 0.6);
      const ang = s.phase + u * s.swirl;
      const r = s.rad * lift;
      const go = Math.max(0, u - 1.4);
      const dist = go * go * 0.5 * s.speed + go * 2;
      this.p.set(
        origin.x + s.ox + Math.cos(ang) * r + away.x * dist + side.x * Math.sin(u * 2 + s.phase) * 0.6,
        origin.y + s.oy + lift * 1.1 + Math.sin(u * 3 + s.phase) * 0.25 + go * 1.2,
        origin.z + s.oz + Math.sin(ang) * r + away.z * dist + side.z * Math.sin(u * 2 + s.phase) * 0.6,
      );
      this.e.set(s.spin.x * u + s.phase, s.spin.y * u, s.spin.z * u);
      this.q.setFromEuler(this.e);
      // in at the start, out as they go far
      const k = clamp01(u / 0.25) * (1 - clamp01((dist - 22) / 10));
      this.s.setScalar(Math.max(0.001, k));
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (t > LIFE) this.done = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as { dispose(): void }).dispose();
  }
}
