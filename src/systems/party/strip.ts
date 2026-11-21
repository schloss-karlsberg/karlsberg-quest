/**
 * The credits strip (bible 06 §8.2 step 4: "Laufschrift am Bildrand"): a band along the bottom edge
 * (over the cinematic's lower letterbox bar) with the lines crawling right to left, driven by the
 * party's game clock (it stops with the game). Reduced motion: no crawl, the lines step through one
 * at a time, centred.
 */
import { h } from '../../ui/dom';
import type { StripLike } from './runtime';
import './party.css';

export class CreditsStrip implements StripLike {
  private el: HTMLElement | null = null;
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

  hide(): void {
    this.el?.classList.remove('on');
    this.el?.remove();
  }
}
