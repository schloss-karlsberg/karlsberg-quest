/**
 * K2 "Hinter der Tür": the Kabinett door (clue.k2.warnung, then clue.k2.abschied). Holding E you
 * put your eye to the crack: the view leaves your eyes and goes to the gap between the door
 * leaves, framed by the dark wood, and behind it the room plays — a candle on the desk, the
 * Duke sitting there coughing, Schügens bringing the warning, the physician, Pfeffel bursting
 * in (the hinge-side crack); in the second memory, through the crack between the leaves, the
 * Duke on his feet, Mannlich, the farewell, and the Duke walks out. A / D moves your eye to the
 * other crack at any time. Both memories together run under 20 s (./index.ts paces them).
 *
 * Reduced motion: the view cuts to the crack instead of gliding.
 */
import { type EchoMark } from '../../chronik/staging';
import type { GameContext } from '../../../core/context';
import { GlowPoints, type Piece, clamp01, lerp, pxScale, smooth } from './common';

/** The double door between the Duke's bedroom and his Kabinett (interiors plan, KB-B01 EG). */
const DOOR = { x: 1268.14, z: -1112.34 };
/** Into the Kabinett (unit), and along the door (unit). */
const IN = { x: 0.1652, z: 0.9863 };
const ALONG = { x: IN.z, z: -IN.x };

/** A point in the Kabinett: u along the door wall, v into the room (m). */
export function kab(u: number, v: number): { x: number; z: number } {
  return { x: DOOR.x + ALONG.x * u + IN.x * v, z: DOOR.z + ALONG.z * u + IN.z * v };
}

/** Where the people of each memory stand (the echo director's marks). */
export function kabinettMarks(id: 'clue.k2.warnung' | 'clue.k2.abschied'): Record<string, EchoMark> {
  const duke = kab(-0.9, 3.2);
  if (id === 'clue.k2.warnung')
    return {
      herzog: { ...duke, sit: true, face: kab(0.4, 1.8) },
      schuegens: { ...kab(0.5, 1.7), face: duke },
      rose: { ...kab(-1.7, 2.4), face: duke },
      pfeffel: { ...kab(1.6, 4.3), to: kab(0.5, 2.6), walkAt: 5.5, face: duke },
    };
  return {
    herzog: { ...kab(-0.6, 3.0), to: kab(-1.4, 4.2), walkAt: 3.6, face: kab(0.6, 1.9) },
    mannlich: { ...kab(0.6, 1.9), face: kab(-0.6, 3.0) },
  };
}

const CRACKS = [-0.36, 0.36];

export class DoorPiece implements Piece {
  readonly id = 'k2-door';
  done = false;
  private t = 0;
  private endT = -1;
  private crack = 0;
  private s = CRACKS[0]!;
  private gapDip = 0;
  private readonly peek: boolean;
  private readonly el: HTMLElement | null = null;
  private readonly candle: GlowPoints;
  private readonly floor: number;
  private readonly eye0: { x: number; y: number; z: number; yaw: number; pitch: number };
  private prevL = false;
  private prevR = false;

  constructor(
    private readonly ctx: GameContext,
    readonly clue: string,
  ) {
    const pl = ctx.player;
    const p = pl.position;
    this.floor = p.y;
    this.eye0 = { x: p.x, y: p.y + 1.6, z: p.z, yaw: pl.yaw, pitch: pl.pitch };
    // only at the door itself (a debug start elsewhere keeps your eyes)
    this.peek = Math.hypot(p.x - DOOR.x, p.z - DOOR.z) < 6;
    // which crack shows the speaker first: the desk side for the warning, the room for the farewell
    this.crack = clue === 'clue.k2.abschied' ? 1 : 0;
    this.s = CRACKS[this.crack]!;
    if (this.peek) {
      pl.frozen = true;
      pl.lookLocked = true;
      const el = document.createElement('div');
      el.className = 'kq-door-crack';
      el.dataset['testid'] = 'door-crack';
      el.innerHTML = '<div class="leaf l"></div><div class="leaf r"></div><div class="hint"><b>A</b> / <b>D</b> – anderer Türspalt</div>';
      ctx.ui.root.insertBefore(el, ctx.ui.hud.el);
      this.el = el;
    }
    // the candle on the Duke's desk: flame, halo, light on the panelling
    this.candle = new GlowPoints(3, { additive: true, renderOrder: 65 });
    ctx.scene.add(this.candle.points);
  }

  get peeking(): boolean {
    return this.peek && this.endT < 0;
  }

  /** Which crack (0 hinge side, 1 between the leaves). */
  get lit(): number {
    return this.crack;
  }

  end(): void {
    if (this.endT < 0) this.endT = this.t;
    // your feet are yours again at once (the view glides back on its own)
    this.release();
  }

  private released = false;
  private release(): void {
    if (!this.peek || this.released) return;
    this.released = true;
    const pl = this.ctx.player;
    pl.frozen = false;
    pl.lookLocked = false;
  }

  frame(dt: number): void {
    const ctx = this.ctx;
    this.t += dt;
    const t = this.t;
    if (this.endT >= 0 && t - this.endT > 0.6) {
      this.done = true;
      return;
    }
    // A / D: the other crack (edges of the held keys: frames, not fixed steps)
    const L = ctx.input.isDown('left');
    const R = ctx.input.isDown('right');
    if (this.peek && this.endT < 0) {
      if ((L && !this.prevL && this.crack !== 0) || (R && !this.prevR && this.crack !== 1)) {
        this.crack = L && !this.prevL ? 0 : 1;
        this.gapDip = 1;
      }
    }
    this.prevL = L;
    this.prevR = R;
    const want = CRACKS[this.crack]!;
    const reduced = ctx.settings.state.reducedMotion;
    this.s = reduced ? want : lerp(this.s, want, Math.min(1, dt * 5));
    this.gapDip = Math.max(0, this.gapDip - dt * 2.4);
    // candle
    const c = kab(-0.55, 3.55);
    const y = this.floor + 0.98;
    const fl = reduced || ctx.settings.state.reducedFlash ? 1 : 0.85 + 0.15 * Math.sin(t * 17) * Math.sin(t * 5.3);
    const a = smooth(t / 0.8) * (this.endT < 0 ? 1 : 1 - clamp01((t - this.endT) / 0.5));
    this.candle.pos.set([c.x, y, c.z, c.x, y, c.z, c.x, y + 0.6, c.z], 0);
    this.candle.col.set([4, 2.3, 0.8, a * fl, 1.6, 0.85, 0.3, a * 0.5 * fl, 0.7, 0.4, 0.15, a * 0.25], 0);
    this.candle.size[0] = 0.07;
    this.candle.size[1] = 0.9;
    this.candle.size[2] = 3.2;
    this.candle.commit(pxScale(ctx));
    // the crack overlay
    if (this.el) {
      const k = this.peekK();
      this.el.style.opacity = String(k);
      const gap = (24 - 20 * Math.sin(Math.PI * Math.min(1, this.gapDip)) ** 2) * k + 100 * (1 - k);
      this.el.style.setProperty('--gap', `${gap}vw`);
      this.el.style.setProperty('--shift', `${(this.s / 0.36) * -3}vw`);
    }
  }

  /** 0..1 how far the view has gone to the crack. */
  private peekK(): number {
    if (!this.peek) return 0;
    const reduced = this.ctx.settings.state.reducedMotion;
    const inK = reduced ? (this.t > 0.05 ? 1 : 0) : smooth(this.t / 0.7);
    const outK = this.endT < 0 ? 1 : reduced ? 0 : 1 - smooth((this.t - this.endT) / 0.5);
    return Math.min(inK, outK);
  }

  camera(): void {
    const k = this.peekK();
    if (k <= 0) return;
    const cam = this.ctx.camera;
    const e = this.eye0;
    // the eye at the crack, a hand's breadth before the door
    const cx = DOOR.x + ALONG.x * this.s - IN.x * 0.18;
    const cz = DOOR.z + ALONG.z * this.s - IN.z * 0.18;
    const cy = this.floor + 1.52;
    // looking across the room from either crack
    const dir = { x: IN.x - ALONG.x * this.s * 0.9, z: IN.z - ALONG.z * this.s * 0.9 };
    const yaw = Math.atan2(-dir.x, -dir.z);
    let dy = yaw - e.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    cam.position.set(lerp(e.x, cx, k), lerp(e.y, cy, k), lerp(e.z, cz, k));
    cam.rotation.set(lerp(e.pitch, -0.06, k), e.yaw + dy * k, 0, 'YXZ');
    cam.updateMatrixWorld();
  }

  dispose(): void {
    this.candle.dispose();
    this.el?.remove();
    this.release();
  }
}
