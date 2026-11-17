/**
 * K2 frost on the Bussole (was "[Der Deckel der Bussole ist von innen beschlagen. Eisblumen.]"):
 * ice flowers grow over the glass of Laub's compass and creep in from the edges of the view.
 * `thaw()` (was "[Der Deckel der Bussole taut. Darunter riecht es nach Rauch.]") melts them off
 * the glass and a thread of smoke rises from under the lid.
 *
 * The flowers are drawn once on a canvas (branching dendrites, procedural); growth is a mask
 * that opens from the rim. Reduced motion: the frost fades in / out instead of growing.
 */
import type { GameContext } from '../../../core/context';
import { clamp01, rng, smooth } from './common';

/** Branching ice crystals from points on the rim towards the middle. */
function drawFlowers(cv: HTMLCanvasElement, seed: number, rim: 'circle' | 'frame'): void {
  const g = cv.getContext('2d');
  if (!g) return;
  const W = cv.width;
  const H = cv.height;
  const R = rng(seed);
  g.clearRect(0, 0, W, H);
  g.lineCap = 'round';
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number): void => {
    if (depth <= 0 || len < 2) return;
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    g.strokeStyle = `rgba(225, 240, 255, ${0.35 + 0.12 * depth})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x2, y2);
    g.stroke();
    // fern-like side shoots along the stem
    const n = 2 + Math.floor(R() * 3);
    for (let i = 1; i <= n; i++) {
      const f = i / (n + 1);
      const px = x + (x2 - x) * f;
      const py = y + (y2 - y) * f;
      const side = len * (0.45 - f * 0.25);
      branch(px, py, a + 1.0 + (R() - 0.5) * 0.3, side, w * 0.6, depth - 1);
      branch(px, py, a - 1.0 + (R() - 0.5) * 0.3, side, w * 0.6, depth - 1);
    }
    branch(x2, y2, a + (R() - 0.5) * 0.5, len * 0.62, w * 0.75, depth - 1);
  };
  const seeds = rim === 'circle' ? 9 : 26;
  for (let i = 0; i < seeds; i++) {
    let x: number;
    let y: number;
    let a: number;
    if (rim === 'circle') {
      const t = (i / seeds) * Math.PI * 2 + R() * 0.4;
      x = W / 2 + Math.cos(t) * W * 0.47;
      y = H / 2 + Math.sin(t) * H * 0.47;
      a = t + Math.PI + (R() - 0.5) * 0.6;
    } else {
      const e = i % 4;
      const u = R();
      x = e === 0 ? 0 : e === 1 ? W : u * W;
      y = e === 2 ? 0 : e === 3 ? H : u * H;
      a = Math.atan2(H / 2 - y, W / 2 - x) + (R() - 0.5) * 0.9;
    }
    const len = (rim === 'circle' ? W * 0.16 : Math.min(W, H) * 0.09) * (0.7 + R() * 0.6);
    branch(x, y, a, len, rim === 'circle' ? 2.2 : 3, 4);
  }
}

export class FrostOverlay {
  on = false;
  private k = 0;
  private thawT = -1;
  /** Seconds since the frost came: the edges of the view ice over for a while, then clear. */
  private edgeT = 99;
  private glass: HTMLDivElement | null = null;
  private edge: HTMLDivElement | null = null;
  private smoke: HTMLDivElement | null = null;

  constructor(readonly ctx: GameContext) {}

  set(on: boolean): void {
    this.on = on;
    if (on) {
      if (!this.on || this.edgeT > 20) this.edgeT = 0;
      this.thawT = -1;
      this.mount();
    }
  }

  thaw(): void {
    if (!this.on && this.k <= 0) return;
    this.on = false;
    this.thawT = 0;
    this.mount();
    if (this.smoke) {
      this.smoke.classList.remove('go');
      void this.smoke.offsetWidth;
      this.smoke.classList.add('go');
    }
  }

  private mount(): void {
    const bussole = document.querySelector<HTMLElement>('[data-testid="bussole"]');
    if (!this.glass && bussole) {
      const el = document.createElement('div');
      el.className = 'kq-frost-glass';
      el.dataset['testid'] = 'frost-glass';
      const cv = document.createElement('canvas');
      cv.width = cv.height = 208;
      drawFlowers(cv, 1793, 'circle');
      el.append(cv);
      const smoke = document.createElement('div');
      smoke.className = 'kq-frost-smoke';
      for (let i = 0; i < 3; i++) smoke.append(document.createElement('i'));
      bussole.append(el, smoke);
      this.glass = el;
      this.smoke = smoke;
    }
    if (!this.edge) {
      const el = document.createElement('div');
      el.className = 'kq-frost-edge';
      const cv = document.createElement('canvas');
      cv.width = 640;
      cv.height = 360;
      drawFlowers(cv, 293, 'frame');
      el.append(cv);
      this.ctx.ui.root.insertBefore(el, this.ctx.ui.hud.el);
      this.edge = el;
    }
  }

  frame(dt: number): void {
    const reduced = this.ctx.settings.state.reducedMotion;
    // growing takes ~4 s, the thaw ~2.5 s
    const target = this.on ? 1 : 0;
    const rate = this.on ? 0.25 : 0.4;
    this.k = this.k < target ? Math.min(target, this.k + dt * rate) : Math.max(target, this.k - dt * rate);
    if (this.thawT >= 0) this.thawT += dt;
    this.edgeT += dt;
    if (!this.glass && !this.edge) return;
    const g = smooth(this.k);
    // growth: a mask opening from the rim inwards (reduced motion: a plain fade)
    const inner = reduced ? 0 : (1 - g) * 70;
    const mask = `radial-gradient(circle, transparent ${inner.toFixed(1)}%, #000 ${(inner + 12).toFixed(1)}%)`;
    if (this.glass) {
      this.glass.style.opacity = String(reduced ? g : Math.min(1, g * 1.6));
      this.glass.style.maskImage = mask;
      this.glass.style.webkitMaskImage = mask;
      this.glass.classList.toggle('melting', this.thawT >= 0 && this.k > 0);
    }
    if (this.edge) {
      // up for ~9 s after the frost comes (and while thawing), then only the glass keeps it
      const hold = this.thawT >= 0 ? 1 : 1 - clamp01((this.edgeT - 9) / 3);
      const e = (reduced ? g : clamp01(g * 1.2)) * 0.45 * hold;
      this.edge.style.opacity = String(e);
      const em = `radial-gradient(ellipse at center, transparent ${(55 + (1 - g) * 35).toFixed(1)}%, #000 ${(85 + (1 - g) * 15).toFixed(1)}%)`;
      this.edge.style.maskImage = em;
      this.edge.style.webkitMaskImage = em;
    }
    if (this.k <= 0 && !this.on && (this.thawT < 0 || this.thawT > 4)) this.unmount();
  }

  private unmount(): void {
    this.glass?.remove();
    this.edge?.remove();
    this.smoke?.remove();
    this.glass = this.edge = this.smoke = null;
    this.thawT = -1;
  }

  dispose(): void {
    this.unmount();
  }
}
