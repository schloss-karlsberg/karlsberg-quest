import { t } from '../i18n';
import { EYE_SVG, h, svg } from './dom';

const PX_PER_DEG = 3.2;

/**
 * HUD slots. Each is a tiny API so feature systems never touch the DOM structure:
 *   compass (heading + markers), prompt, subtitles, threat, lantern oil, era label, stance, toasts.
 */
export class Hud {
  readonly el: HTMLElement;
  private readonly strip: HTMLElement;
  private readonly compass: HTMLElement;
  private readonly markers = new Map<string, HTMLElement>();
  private readonly promptEl: HTMLElement;
  private readonly subsEl: HTMLElement;
  private readonly threatEl: HTMLElement;
  private readonly threatEdge: HTMLElement;
  private readonly oilEl: HTMLElement;
  private readonly oilFill: HTMLElement;
  private readonly eraEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly stanceEl: HTMLElement;
  private readonly toastsEl: HTMLElement;
  private readonly clickEl: HTMLElement;
  private heading = 0;

  constructor() {
    this.strip = h('div.kq-compass-strip');
    // labels every 45°, ticks every 15°, three turns so the strip can scroll seamlessly
    const names = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
    const label = (k: string) => (k.length === 1 ? t(`hud.compass.${k}`) : k.split('').map((c) => t(`hud.compass.${c}`)).join(''));
    for (let deg = -360; deg <= 720; deg += 15) {
      const x = deg * PX_PER_DEG;
      const norm = ((deg % 360) + 360) % 360;
      if (norm % 45 === 0) {
        const k = names[norm / 45]!;
        const s = h('span', label(k));
        s.style.left = `${x}px`;
        if (k.length > 1) s.style.fontSize = '13px';
        this.strip.append(s);
      } else {
        const i = h('i.minor');
        i.style.left = `${x}px`;
        this.strip.append(i);
      }
    }
    this.compass = h('div.kq-compass', [this.strip, h('div.kq-compass-needle')]);
    this.promptEl = h('div.kq-prompt');
    this.subsEl = h('div.kq-subtitles', { 'aria-live': 'polite' });
    this.threatEl = h('div.kq-threat', { title: t('hud.threat') }, svg(EYE_SVG));
    this.threatEdge = h('div.kq-threat-edge');
    this.oilFill = h('div.kq-oil-fill');
    this.oilEl = h('div.kq-oil.kq-hidden', [h('div.kq-oil-gauge', this.oilFill), h('div.kq-oil-label', t('hud.oil'))]);
    this.eraEl = h('div.kq-era-label');
    this.statusEl = h('div.kq-status');
    this.stanceEl = h('div.kq-stance');
    this.toastsEl = h('div.kq-toasts');
    this.clickEl = h('div.kq-click-to-play.kq-hidden', t('hud.clickToPlay'));
    this.el = h('div.kq-hud.kq-hidden', [
      this.threatEdge,
      this.compass,
      this.threatEl,
      this.eraEl,
      this.statusEl,
      h('div.kq-crosshair'),
      this.subsEl,
      this.promptEl,
      this.oilEl,
      this.stanceEl,
      this.toastsEl,
      this.clickEl,
    ]);
  }

  show(on: boolean): void {
    this.el.classList.toggle('kq-hidden', !on);
  }

  /** Heading in degrees clockwise from grid north. */
  setHeading(deg: number): void {
    this.heading = ((deg % 360) + 360) % 360;
    const w = this.compass.clientWidth || 460;
    this.strip.style.transform = `translateX(${w / 2 - this.heading * PX_PER_DEG}px)`;
    for (const [, m] of this.markers) this.placeMarker(m);
  }

  /** A marker on the compass at a grid bearing (deg). Pass null to remove. */
  setMarker(id: string, bearingDeg: number | null, color = '#e9c46a'): void {
    let m = this.markers.get(id);
    if (bearingDeg === null) {
      m?.remove();
      this.markers.delete(id);
      return;
    }
    if (!m) {
      m = h('div.kq-compass-marker');
      this.compass.append(m);
      this.markers.set(id, m);
    }
    m.style.borderColor = color;
    m.dataset.bearing = String(bearingDeg);
    this.placeMarker(m);
  }

  private placeMarker(m: HTMLElement): void {
    const b = Number(m.dataset.bearing);
    let d = b - this.heading;
    d = ((d + 540) % 360) - 180;
    const w = this.compass.clientWidth || 460;
    m.style.left = `${w / 2 + d * PX_PER_DEG}px`;
    m.style.display = Math.abs(d) > 70 ? 'none' : '';
  }

  /**
   * Bottom prompt, e.g. prompt('E', 'Lauschen'). Null hides it. Several features can hold a prompt
   * at once (`owner`, e.g. the story's "Q – Zeitwechsel" and the Chronik's "E – Untersuchen"): the
   * most recently set one is shown, and clearing yours reveals the one below instead of hiding all.
   */
  prompt(key: string | null, text?: string, owner = '_'): void {
    this.prompts.delete(owner);
    if (key || text) this.prompts.set(owner, { key, text: text ?? '' });
    const top = [...this.prompts.values()].pop();
    if (!top) {
      this.promptEl.classList.remove('show');
      return;
    }
    this.promptEl.replaceChildren(...(top.key ? [h('kbd', top.key)] : []), top.text);
    this.promptEl.classList.add('show');
  }
  private readonly prompts = new Map<string, { key: string | null; text: string }>();

  /** Show a subtitle line; returns a function that removes it early. */
  subtitle(speaker: string | null, text: string, ms = 4000, fiction = false): () => void {
    const line = h('div', h('span.line', [speaker ? h('span.who', speaker) : null, text, fiction ? h('span.fiction', '(Fiktion)') : null]));
    this.subsEl.append(line);
    while (this.subsEl.childElementCount > 3) this.subsEl.firstElementChild?.remove();
    const timer = setTimeout(() => line.remove(), ms);
    return () => {
      clearTimeout(timer);
      line.remove();
    };
  }

  setSubtitleSize(size: 's' | 'm' | 'l'): void {
    document.documentElement.style.setProperty('--sub-size', size === 's' ? '18px' : size === 'l' ? '28px' : '22px');
  }

  /** 0..1 threat; the eye opens, the screen edge reddens above 0.6. */
  setThreat(level: number): void {
    const v = Math.max(0, Math.min(1, level));
    this.threatEl.style.opacity = v < 0.02 ? '0' : String(0.35 + 0.65 * v);
    const pupil = this.threatEl.querySelector('.pupil') as SVGCircleElement | null;
    pupil?.setAttribute('r', String(2 + 5 * v));
    this.threatEdge.style.opacity = String(Math.max(0, (v - 0.6) / 0.4));
  }

  /** Lantern oil gauge; `oil` null hides it. */
  setLantern(oil: number | null, lit = false): void {
    if (oil === null) {
      this.oilEl.classList.add('kq-hidden');
      return;
    }
    this.oilEl.classList.remove('kq-hidden');
    this.oilEl.classList.toggle('unlit', !lit);
    this.oilFill.style.height = `${Math.round(Math.max(0, Math.min(1, oil)) * 100)}%`;
  }

  setEraLabel(text: string): void {
    this.eraEl.textContent = text;
  }

  /** Small italic status line under the era label (scan mode, map). */
  setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  setStance(text: string): void {
    this.stanceEl.textContent = text;
  }

  toast(text: string, ms = 2600): void {
    const el = h('div.kq-toast', text);
    this.toastsEl.append(el);
    setTimeout(() => el.remove(), ms);
    while (this.toastsEl.childElementCount > 4) this.toastsEl.firstElementChild?.remove();
  }

  showClickToPlay(on: boolean): void {
    this.clickEl.classList.toggle('kq-hidden', !on);
  }
}
