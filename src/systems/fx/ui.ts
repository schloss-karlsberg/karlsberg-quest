import './fx.css';
import type { GameContext } from '../../core/context';
import { h, svg } from '../../ui/dom';

function compassSvg(): string {
  const ticks: string[] = [];
  for (let d = 0; d < 360; d += 10) {
    const a = (d * Math.PI) / 180;
    const r0 = d % 90 === 0 ? 70 : d % 30 === 0 ? 76 : 80;
    ticks.push(`<line class="tick" x1="${(Math.sin(a) * r0).toFixed(2)}" y1="${(-Math.cos(a) * r0).toFixed(2)}" x2="${(Math.sin(a) * 86).toFixed(2)}" y2="${(-Math.cos(a) * 86).toFixed(2)}"/>`);
  }
  const lbl = (t: string, d: number) => {
    const a = (d * Math.PI) / 180;
    return `<text class="lbl" x="${(Math.sin(a) * 60).toFixed(1)}" y="${(-Math.cos(a) * 60).toFixed(1)}">${t}</text>`;
  };
  return `<svg viewBox="-100 -100 200 200" aria-hidden="true">
    <g class="rose">
      <circle class="ring" r="88"/><circle class="ring thin" r="94"/><circle class="ring" r="50"/>
      ${ticks.join('')}
      ${lbl('N', 0)}${lbl('O', 90)}${lbl('S', 180)}${lbl('W', 270)}
      <path class="ring" d="M0 -46 L6 -6 L46 0 L6 6 L0 46 L-6 6 L-46 0 L-6 -6 Z"/>
    </g>
    <g class="needle"><path class="needle-n" d="M0 -78 L7 0 L-7 0 Z"/><path class="needle-s" d="M0 78 L7 0 L-7 0 Z"/></g>
    <circle class="hub" r="5"/>
  </svg>`;
}

/** DOM side of the fx system: compass whirl, smoke/oblivion gauges, caught card, captions. */
export class FxUI {
  readonly layer: HTMLElement;
  private readonly compass: HTMLElement;
  private readonly needle: SVGGElement;
  private readonly rose: SVGGElement;
  private readonly smoke: { el: HTMLElement; fill: HTMLElement };
  private readonly obl: { el: HTMLElement; fill: HTMLElement };
  private readonly card: HTMLElement;
  private readonly lastCaption = new Map<string, number>();

  constructor(private readonly ctx: GameContext) {
    this.layer = ctx.ui.layer('fx');
    this.layer.classList.add('kq-fx-layer');
    this.layer.classList.remove('kq-hidden');
    this.layer.style.pointerEvents = 'none';
    this.layer.style.zIndex = '12';
    const s = svg(compassSvg());
    this.compass = h('div.kq-fx-compass', s);
    this.needle = s.querySelector('.needle') as SVGGElement;
    this.rose = s.querySelector('.rose') as SVGGElement;
    const gauge = (cls: string, label: string) => {
      const fill = h('div.kq-fx-gauge-fill');
      const el = h(`div.kq-fx-gauge.${cls}.off` as 'div', [h('div.kq-fx-gauge-tube', fill), h('div.kq-fx-gauge-label', label)]);
      return { el, fill };
    };
    this.smoke = gauge('smoke', ctx.t('fx.gauge.smoke'));
    this.obl = gauge('oblivion', ctx.t('fx.gauge.oblivion'));
    this.card = h('div.kq-fx-card');
    this.layer.append(this.compass, h('div.kq-fx-gauges', [this.obl.el, this.smoke.el]), this.card);
  }

  /** Compass whirl: opacity 0..1, needle angle and slow counter-rotation of the rose (deg). */
  setCompass(opacity: number, needleDeg: number, roseDeg: number): void {
    this.compass.style.opacity = opacity.toFixed(3);
    this.compass.style.display = opacity > 0.001 ? '' : 'none';
    if (opacity > 0.001) {
      this.needle.setAttribute('transform', `rotate(${needleDeg.toFixed(1)})`);
      this.rose.setAttribute('transform', `rotate(${roseDeg.toFixed(1)}) scale(${(0.92 + 0.08 * opacity).toFixed(3)})`);
    }
  }

  /** Gauge value 0..1, or null to hide. */
  setGauge(which: 'smoke' | 'oblivion', v: number | null): void {
    const g = which === 'smoke' ? this.smoke : this.obl;
    g.el.classList.toggle('off', v === null);
    if (v === null) return;
    g.fill.style.height = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
    g.el.classList.toggle('warn', v > 0.7);
  }

  showCard(text: string | null, ms = 3200): void {
    if (!text) {
      this.card.classList.remove('show');
      return;
    }
    this.card.textContent = text;
    this.card.classList.add('show');
    setTimeout(() => this.card.classList.remove('show'), ms);
  }

  /** Caption for a sound (accessibility: every threat sound has a visual cue). Throttled per key. */
  caption(key: string, minGapSec = 8, ms = 2600): void {
    const now = performance.now() / 1000;
    if (now - (this.lastCaption.get(key) ?? -1e9) < minGapSec) return;
    this.lastCaption.set(key, now);
    this.ctx.ui.hud.subtitle(null, this.ctx.t(key), ms);
  }

  dispose(): void {
    this.layer.replaceChildren();
  }
}
