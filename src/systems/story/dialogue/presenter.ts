/**
 * Dialogue presenter: a queue of spoken lines shown as a field-book card with an etched portrait,
 * a typing effect and a procedural voice murmur. Enter / click skips (finish typing → next line).
 * Driven by `update(realDt)` from the system's frame() (stops while the game is paused).
 */
import { h, svg } from '../../../ui/dom';
import { t } from '../../../i18n';
import { ensurePortraitDefs, portraitSvg } from './portraits';
import type { SpeakerMeta } from './speakers';
import { type Voice, syllableStarts } from './voice';

export interface DialogueItem {
  id?: string;
  speaker: string;
  text: string;
  ms?: number;
  /** Explicit fiction label (default from the speaker). */
  fiction?: boolean;
  /** Source label for historical quotes. */
  source?: string;
}

interface Active {
  item: DialogueItem;
  meta: SpeakerMeta;
  text: string;
  typed: number;
  hold: number;
  shownFor: number;
  starts: Set<number>;
  acc: number;
}

export interface PresenterOptions {
  layer: HTMLElement;
  meta: (speaker: string) => SpeakerMeta;
  voice: Voice | null;
  reducedMotion: () => boolean;
  /** Player name for {Name}. */
  name: () => string;
  /** Called when a line starts showing. */
  onShow?: (item: DialogueItem) => void;
}

const CHARS_PER_S = 42;

export function substituteName(text: string, name: string): string {
  return text.replace(/\{Name\}/g, name || t('story.name.default'));
}

/** Seconds a fully typed line stays (reading time). */
export function holdSeconds(text: string, ms?: number): number {
  if (ms !== undefined) return ms / 1000;
  return Math.min(9, Math.max(2.2, 1.4 + text.length * 0.045));
}

export class DialoguePresenter {
  readonly el: HTMLElement;
  private readonly portraitEl: HTMLElement;
  private readonly whoEl: HTMLElement;
  private readonly tagEl: HTMLElement;
  private readonly typedEl: HTMLElement;
  private readonly restEl: HTMLElement;
  private readonly srcEl: HTMLElement;
  private readonly queue: DialogueItem[] = [];
  private cur: Active | null = null;
  private hideTimer = 0;
  private mouthTimer = 0;
  private lastPortrait = '';

  constructor(private readonly o: PresenterOptions) {
    ensurePortraitDefs();
    this.portraitEl = h('div.kqs-portrait');
    this.whoEl = h('span.kqs-who');
    this.tagEl = h('span.kqs-tag');
    this.typedEl = h('span.kqs-typed');
    this.restEl = h('span.kqs-rest');
    this.srcEl = h('span.kqs-src');
    this.el = h('div.kqs-dlg', { 'data-testid': 'dialogue', role: 'status' }, [
      this.portraitEl,
      h('div.kqs-dlg-body', [
        h('div.kqs-dlg-head', [this.whoEl, this.tagEl]),
        h('div.kqs-dlg-text', { 'aria-live': 'polite' }, [this.typedEl, this.restEl]),
        h('div.kqs-dlg-foot', [this.srcEl, h('span.kqs-skip', [h('kbd', 'Enter'), ` ${t('story.dialogue.next')}`])]),
      ]),
    ]);
    this.el.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.skip();
    });
    o.layer.append(this.el);
  }

  get busy(): boolean {
    return this.cur !== null || this.queue.length > 0;
  }

  get current(): DialogueItem | null {
    return this.cur?.item ?? null;
  }

  get pending(): number {
    return this.queue.length;
  }

  enqueue(item: DialogueItem): void {
    this.queue.push(item);
    if (!this.cur) this.next();
  }

  clear(): void {
    this.queue.length = 0;
    this.cur = null;
    this.el.classList.remove('kqs-show', 'kqs-speaking');
  }

  /** Finish typing, or advance to the next line. */
  skip(): void {
    if (!this.cur) return;
    if (this.cur.typed < this.cur.text.length) {
      this.cur.typed = this.cur.text.length;
      this.render();
    } else this.next();
  }

  /** Complete the current line instantly (tests / screenshots). */
  finishTyping(): void {
    if (this.cur) {
      this.cur.typed = this.cur.text.length;
      this.render();
    }
  }

  private next(): void {
    const item = this.queue.shift();
    if (!item) {
      this.cur = null;
      this.el.classList.remove('kqs-speaking');
      this.hideTimer = 0.35;
      return;
    }
    const meta = this.o.meta(item.speaker);
    const text = substituteName(item.text, this.o.name());
    this.cur = { item, meta, text, typed: this.o.reducedMotion() ? text.length : 0, hold: holdSeconds(text, item.ms), shownFor: 0, starts: syllableStarts(text), acc: 0 };
    this.hideTimer = 0;
    if (this.lastPortrait !== meta.portrait + meta.id) {
      this.lastPortrait = meta.portrait + meta.id;
      this.portraitEl.replaceChildren(svg(portraitSvg(meta.portrait)));
      this.portraitEl.classList.remove('kqs-pop');
      void this.portraitEl.offsetWidth;
      this.portraitEl.classList.add('kqs-pop');
    }
    this.el.dataset.speaker = meta.id;
    this.el.dataset.portrait = meta.portrait;
    this.whoEl.textContent = meta.name;
    const fiction = item.fiction ?? !meta.historical;
    this.tagEl.textContent = meta.historical ? t('story.tag.historical') : meta.echo ? t('story.tag.echo') : fiction ? t('story.tag.fiction') : '';
    this.tagEl.className = `kqs-tag ${meta.historical ? 'hist' : meta.echo ? 'echo' : 'fic'}`;
    this.srcEl.textContent = item.source ? `${t('story.source')}: ${item.source}` : '';
    this.el.classList.add('kqs-show', 'kqs-speaking');
    this.el.classList.toggle('kqs-echo', meta.echo);
    this.render();
    this.o.onShow?.(item);
  }

  private render(): void {
    const c = this.cur;
    if (!c) return;
    this.typedEl.textContent = c.text.slice(0, c.typed);
    this.restEl.textContent = c.text.slice(c.typed);
    this.el.classList.toggle('kqs-speaking', c.typed < c.text.length);
  }

  /** Real-time update (seconds). Pass 0 while the game is paused. */
  update(dt: number): void {
    if (this.mouthTimer > 0) {
      this.mouthTimer -= dt;
      if (this.mouthTimer <= 0) this.portraitEl.classList.remove('kqs-m');
    }
    if (!this.cur) {
      if (this.hideTimer > 0) {
        this.hideTimer -= dt;
        if (this.hideTimer <= 0) this.el.classList.remove('kqs-show');
      }
      return;
    }
    const c = this.cur;
    if (c.typed < c.text.length) {
      const before = c.typed;
      c.acc += dt * CHARS_PER_S;
      const n = Math.floor(c.acc);
      c.acc -= n;
      c.typed = Math.min(c.text.length, c.typed + n);
      for (let i = before; i < c.typed; i++) {
        if (c.starts.has(i)) {
          const prev = c.text[i - 1];
          const stress = i === 0 || prev === undefined || /[.!?]\s*$/.test(c.text.slice(Math.max(0, i - 3), i)) ? 1 : /[A-ZÄÖÜ]/.test(c.text[i]!) ? 0.5 : 0;
          this.o.voice?.blip(c.meta.voice, stress);
          this.portraitEl.classList.add('kqs-m');
          this.mouthTimer = 0.085;
          break;
        }
      }
      this.render();
      return;
    }
    c.shownFor += dt;
    if (c.shownFor >= c.hold) this.next();
  }
}
