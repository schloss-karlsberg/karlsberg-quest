/** The credits band crawls to the game clock or shows a manually scrollable list. */
import { h } from '../../ui/dom';
import type { StripLike } from './runtime';
import './party.css';

interface StripTexts {
  label: string;
  hint: string;
  hintCamera: string;
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
  private width = 0;

  show(lines: readonly string[], reduced: boolean): void {
    const track = h(reduced ? 'ul.kq-party-track' : 'div.kq-party-track', { 'data-testid': 'party-credits-track' });
    lines.forEach((line, i) => {
      if (i && !reduced) track.append(h('span.kq-party-sep', { 'aria-hidden': 'true' }, '·'));
      track.append(h(reduced ? 'li.kq-party-line' : 'span.kq-party-line', {}, line));
    });
    const el = h('div.kq-party-strip', {
      'data-testid': 'party-credits',
      role: reduced ? 'region' : 'marquee',
      'aria-label': this.texts.label,
      ...(reduced ? { tabindex: 0 } : { 'aria-live': 'off' }),
    }, track);
    if (reduced) {
      // Keep native scrolling keys in the focused list instead of sending them to the player.
      el.addEventListener('keydown', (e) => {
        if (/^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End)$/.test(e.code)) e.stopPropagation();
      });
    }

    const hint = h('span.kq-party-hint', { 'data-testid': 'party-credits-hint' }, this.texts.hint);
    const button = h('button.kq-party-skip', {
      type: 'button',
      'data-testid': 'party-credits-skip',
      onclick: this.onSkip,
    }, this.texts.button);
    const bar = h('div.kq-party-bar', [hint, button]);
    this.el = el;
    this.track = track;
    this.hintEl = hint;
    this.bar = bar;
    this.width = 0;
    document.documentElement.setAttribute('data-kq-credits', reduced ? 'static' : 'crawl');
    document.body.append(el, bar);
    if (reduced) {
      el.focus({ preventScroll: true });
    } else {
      void el.offsetWidth;
    }
    el.classList.add('on');
  }

  render(crawl: number): void {
    const el = this.el;
    const track = this.track;
    if (!el || !track) return;
    if (!this.width) this.width = track.scrollWidth;
    const x = el.clientWidth - crawl * (el.clientWidth + this.width);
    track.style.transform = `translate3d(${x.toFixed(1)}px, -50%, 0)`;
  }

  camera(on: boolean): void {
    if (this.hintEl) this.hintEl.textContent = on ? this.texts.hintCamera : this.texts.hint;
  }

  hide(): void {
    document.documentElement.removeAttribute('data-kq-credits');
    this.el?.remove();
    this.bar?.remove();
    this.el = this.bar = this.track = this.hintEl = null;
  }
}
