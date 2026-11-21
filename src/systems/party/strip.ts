/**
 * The credits strip (bible 06 §8.2 step 4: "Laufschrift am Bildrand"): a band along the bottom edge
 * (over the cinematic's lower letterbox bar) with the lines crawling right to left, driven by the
 * party's game clock (it stops with the game). Reduced motion: no crawl, the lines step through one
 * at a time, centred. While it runs `html[data-kq-credits]` hides the HUD (Bussole, objective,
 * tracker, compass, vitals) the way a cinematic does; subtitles, story lines and the strip stay.
 */
import { h } from '../../ui/dom';
import type { StripLike } from './runtime';
import './party.css';

export interface StripTexts {
  /** The hint after the camera is back: „Enter: Abspann überspringen". */
  hint: string;
  /** The hint while the orbit has the camera: „… · Bewegen: selbst umsehen". */
  hintCamera: string;
  /** The skip button (touch, mouse): „Abspann überspringen". */
  button: string;
}

export class CreditsStrip implements StripLike {
  constructor(
    private readonly texts: StripTexts,
    private readonly onSkip: () => void,
  ) {}

  private el: HTMLElement | null = null;
  private hintEl: HTMLElement | null = null;
  private bar: HTMLElement | null = null;
  private track: HTMLElement | null = null;
  private lines: readonly string[] = [];
  private reduced = false;
  private width = 0;
  private shownLine = -2;

  show(lines: readonly string[], reduced: boolean): void {
    if (typeof document === 'undefined') return;
    this.lines = lines;
    this.reduced = reduced;
    this.width = 0;
    this.shownLine = -2;
    if (!this.el) {
      this.track = h('div.kq-party-track', { 'data-testid': 'party-credits-track' });
      this.hintEl = h('span.kq-party-hint', { 'data-testid': 'party-credits-hint' }, this.texts.hint);
      const button = h(
        'button.kq-party-skip',
        {
          type: 'button',
          'data-testid': 'party-credits-skip',
          onclick: (e: Event) => {
            e.stopPropagation();
            this.onSkip();
          },
        },
        this.texts.button,
      );
      // keep the press on the button (the game reads pointer presses on the canvas / window)
      button.addEventListener('pointerdown', (e) => e.stopPropagation());
      // the bar sits outside the band's clipping box
      this.bar = h('div.kq-party-bar', {}, [this.hintEl, button]);
      this.el = h('div.kq-party-strip', { 'data-testid': 'party-credits', role: 'marquee', 'aria-live': 'off' }, [this.track]);
    }
    const track = this.track!;
    track.replaceChildren();
    if (!reduced) {
      lines.forEach((l, i) => {
        if (i) track.append(h('span.kq-party-sep', {}, '·'));
        track.append(h('span.kq-party-line', {}, l));
      });
    }
    this.el.classList.toggle('reduced', reduced);
    this.el.setAttribute('aria-label', lines.join(' – '));
    document.body.appendChild(this.el);
    document.body.appendChild(this.bar!);
    // the HUD steps aside while the credits roll (party.css), also after the camera is handed back
    document.documentElement.toggleAttribute('data-kq-credits', true);
    void this.el.offsetWidth;
    this.el.classList.add('on');
  }

  render(crawl: number, line: number): void {
    const el = this.el;
    const track = this.track;
    if (!el || !track || !el.isConnected) return;
    if (this.reduced) {
      if (line !== this.shownLine && line >= 0) {
        this.shownLine = line;
        track.replaceChildren(h('span.kq-party-line', {}, this.lines[line] ?? ''));
      }
      track.style.transform = '';
      return;
    }
    if (!this.width) this.width = track.scrollWidth;
    const W = el.clientWidth || window.innerWidth;
    const x = W - crawl * (W + this.width);
    track.style.transform = `translate3d(${x.toFixed(1)}px, -50%, 0)`;
  }

  camera(on: boolean): void {
    if (this.hintEl) this.hintEl.textContent = on ? this.texts.hintCamera : this.texts.hint;
  }

  hide(): void {
    if (typeof document !== 'undefined') document.documentElement.removeAttribute('data-kq-credits');
    this.el?.classList.remove('on');
    this.el?.remove();
    this.bar?.remove();
  }
}
