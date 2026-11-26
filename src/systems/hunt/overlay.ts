/**
 * DOM layer of the hunt (ctx.ui.layer('hunt')): the alert vignette that pulses with the
 * heartbeat, direction arrows at the screen edge for every threat sound (accessibility, bible
 * 09-ui-texte §6) and the "caught" black-out with its title. Field-book style: ink and ember.
 */
const CSS = `
.kq-hunt { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
.kq-hunt-vignette {
  position: absolute; inset: -2%;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 48%, rgba(30,6,2,0.55) 78%, rgba(10,2,0,0.92) 100%);
  opacity: 0; will-change: opacity;
}
.kq-hunt-arrow {
  position: absolute; width: 0; height: 0; opacity: 0; transition: opacity 0.25s;
}
.kq-hunt-arrow svg { position: absolute; left: -22px; top: -22px; width: 44px; height: 44px; overflow: visible; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.9)); }
.kq-hunt-arrow span {
  position: absolute; left: -60px; width: 120px; top: 20px; text-align: center;
  font-family: var(--hand); font-size: 18px; color: #efe6d2;
  text-shadow: 0 1px 2px rgba(0,0,0,0.9);
}
.kq-hunt-caught {
  position: absolute; inset: 0; opacity: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, rgba(4,3,2,0.86) 0%, rgba(0,0,0,0.97) 60%, #000 100%);
}
.kq-hunt-caught h2 {
  font-family: var(--serif); font-style: italic; font-weight: normal; font-size: clamp(28px, 4.2vw, 54px);
  color: #e9dcc0; letter-spacing: 0.02em; margin: 0; opacity: 0; transform: translateY(6px);
  text-shadow: 0 0 18px rgba(200, 80, 20, 0.35);
}
.kq-hunt-caught p {
  font-family: var(--hand); font-size: clamp(18px, 2vw, 26px); color: #b9a57c; margin: 14px 0 0; opacity: 0;
}
.kq-hunt-blink { position: absolute; inset: 0; background: #000; opacity: 0; }
.kq-hunt-caught .rule { width: min(420px, 50vw); height: 1px; margin-top: 18px; background: linear-gradient(90deg, transparent, rgba(185,165,124,0.6), transparent); opacity: 0; }
`;

const ARROW_SVG = (color: string) =>
  `<svg viewBox="-22 -22 44 44"><path d="M-11 6 L0 -12 L11 6" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M-6 13 L0 3 L6 13" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.65"/></svg>`;

export type ArrowKind = 'horn' | 'hound' | 'hooves';
const ARROW_COLOR: Record<ArrowKind, string> = { horn: '#e3b964', hound: '#e0602a', hooves: '#cfd6d8' };

interface Arrow {
  el: HTMLElement;
  label: HTMLElement;
  key: string;
  life: number;
  ttl: number;
  angle: number;
  kind: ArrowKind;
}

export class HuntOverlay {
  readonly root: HTMLElement;
  private readonly vignette: HTMLElement;
  private readonly caughtEl: HTMLElement;
  private readonly caughtTitle: HTMLElement;
  private readonly caughtSub: HTMLElement;
  private readonly caughtRule: HTMLElement;
  private readonly arrows: Arrow[] = [];
  private pulse = 0;
  private readonly blinkEl: HTMLElement;
  /** Seconds into a fade-out-and-in (−1 = none). */
  private blinkT = -1;
  private readonly defaults: { caught: string; caughtSub: string };

  constructor(layer: HTMLElement, text: { caught: string; caughtSub: string }) {
    if (!document.getElementById('kq-hunt-css')) {
      const st = document.createElement('style');
      st.id = 'kq-hunt-css';
      st.textContent = CSS;
      document.head.append(st);
    }
    layer.classList.remove('kq-hidden');
    layer.style.pointerEvents = 'none';
    this.root = document.createElement('div');
    this.root.className = 'kq-hunt';
    this.root.dataset.testid = 'hunt-overlay';
    this.vignette = document.createElement('div');
    this.vignette.className = 'kq-hunt-vignette';
    this.caughtEl = document.createElement('div');
    this.caughtEl.className = 'kq-hunt-caught';
    this.caughtEl.setAttribute('role', 'alert');
    this.caughtTitle = document.createElement('h2');
    this.caughtTitle.textContent = text.caught;
    this.caughtSub = document.createElement('p');
    this.caughtSub.textContent = text.caughtSub;
    this.caughtRule = document.createElement('div');
    this.caughtRule.className = 'rule';
    this.caughtEl.append(this.caughtTitle, this.caughtRule, this.caughtSub);
    this.root.append(this.vignette);
    for (let i = 0; i < 6; i++) {
      const el = document.createElement('div');
      el.className = 'kq-hunt-arrow';
      const label = document.createElement('span');
      el.append(label);
      this.root.append(el);
      this.arrows.push({ el, label, key: '', life: 0, ttl: 1, angle: 0, kind: 'hound' });
    }
    this.blinkEl = document.createElement('div');
    this.blinkEl.className = 'kq-hunt-blink';
    this.root.append(this.caughtEl, this.blinkEl);
    layer.append(this.root);
    this.defaults = { ...text };
  }

  /** Caught title/subtitle for the next sequence (null = the defaults). */
  setCaughtText(t: { caught: string; caughtSub: string } | null): void {
    const v = t ?? this.defaults;
    this.caughtTitle.textContent = v.caught;
    this.caughtSub.textContent = v.caughtSub;
  }

  /** Fade to black and back (≈ 1.4 s; full black at 0.45–0.75 s). */
  blink(): void {
    this.blinkT = 0;
  }

  /** True while the blink is fully black (move the player then). */
  get blinkBlack(): boolean {
    return this.blinkT >= 0.45 && this.blinkT < 0.75;
  }

  /** Heartbeat: a pulse of the vignette (skipped in reduced motion). */
  beat(): void {
    this.pulse = 1;
  }

  /**
   * A sound came from `angleDeg` relative to the view (0 = ahead, 90 = right). Same `key`
   * refreshes the same arrow instead of adding one.
   */
  arrow(key: string, kind: ArrowKind, angleDeg: number, label: string, ttl = 1.8): void {
    let a = this.arrows.find((x) => x.key === key && x.life > 0);
    if (!a) a = this.arrows.reduce((m, x) => (x.life < m.life ? x : m), this.arrows[0]!);
    if (a.kind !== kind || a.key !== key) a.el.querySelector('svg')?.remove();
    if (!a.el.querySelector('svg')) a.el.insertAdjacentHTML('afterbegin', ARROW_SVG(ARROW_COLOR[kind]));
    a.key = key;
    a.kind = kind;
    a.life = ttl;
    a.ttl = ttl;
    a.angle = angleDeg;
    a.label.textContent = label;
  }

  /** Drop all direction arrows (a new pack starts, or the hunt is over). */
  clearArrows(): void {
    for (const a of this.arrows) {
      a.life = 0;
      a.key = '';
      a.el.style.opacity = '0';
    }
  }

  /**
   * `handoff`: a story system shows its own caught curtain (title + wake-up) from CAUGHT_EMIT on;
   * the overlay then only fades to black and leaves the words to the story.
   */
  frame(o: { dt: number; alert: number; reducedMotion: boolean; caught: number; showArrows: boolean; handoff?: boolean }): void {
    const dt = Math.min(0.1, o.dt);
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const b = this.blinkT;
      const op = b < 0.45 ? b / 0.45 : b < 0.75 ? 1 : Math.max(0, 1 - (b - 0.75) / 0.65);
      this.blinkEl.style.opacity = op.toFixed(3);
      if (b > 1.4) {
        this.blinkT = -1;
        this.blinkEl.style.opacity = '0';
      }
    }
    this.pulse = Math.max(0, this.pulse - dt * 3.2);
    const base = Math.max(0, (o.alert - 0.25) / 0.75) * 0.75;
    const p = o.reducedMotion ? 0 : this.pulse * this.pulse * 0.35 * Math.min(1, o.alert * 1.5);
    this.vignette.style.opacity = (base + p).toFixed(3);
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const a of this.arrows) {
      if (a.life <= 0 || !o.showArrows) {
        a.el.style.opacity = '0';
        continue;
      }
      a.life -= dt;
      const r = (a.angle * Math.PI) / 180;
      const x = w / 2 + Math.sin(r) * w * 0.4;
      const y = h / 2 - Math.cos(r) * h * 0.36;
      a.el.style.left = `${x.toFixed(1)}px`;
      a.el.style.top = `${y.toFixed(1)}px`;
      const svg = a.el.querySelector('svg');
      if (svg) svg.style.transform = `rotate(${a.angle.toFixed(1)}deg)`;
      a.el.style.opacity = Math.min(1, (a.life / a.ttl) * 2).toFixed(2);
    }
    // caught: t in seconds since caught (−1 = none). 0..1.0 nothing, then black + title.
    const t = o.caught;
    if (t < 0) {
      this.caughtEl.style.opacity = '0';
      return;
    }
    const black = t < 0.9 ? 0 : t < 1.7 ? (t - 0.9) / 0.8 : t < 3.4 || o.handoff ? 1 : Math.max(0, 1 - (t - 3.4) / 1.2);
    this.caughtEl.style.opacity = black.toFixed(3);
    const title = o.handoff ? 0 : t < 1.3 ? 0 : t < 1.9 ? (t - 1.3) / 0.6 : t < 3.3 ? 1 : Math.max(0, 1 - (t - 3.3) / 0.9);
    this.caughtTitle.style.opacity = title.toFixed(3);
    this.caughtTitle.style.transform = o.reducedMotion ? 'none' : `translateY(${((1 - Math.min(1, title)) * 6).toFixed(1)}px)`;
    this.caughtRule.style.opacity = (title * 0.9).toFixed(3);
    this.caughtSub.style.opacity = (Math.max(0, title - 0.3) / 0.7).toFixed(3);
  }

  dispose(): void {
    this.root.remove();
  }
}
