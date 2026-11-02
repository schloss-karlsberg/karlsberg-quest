/**
 * Full-screen story overlays in the story layer: chapter title cards (field-book stamp), the
 * "caught" curtain (fade to black, a line of text, wake up in the field station) and timed choices
 * (a field-book modal with a burning-down fuse; the fallback option is taken when it runs out).
 */
import { t } from '../../i18n';
import { h } from '../../ui/dom';
import type { ModalHandle, ModalManager } from '../../ui/modal';
import type { ChoiceAction, FlagValue } from './types';

export class StoryOverlays {
  private cardEl: HTMLElement | null = null;
  private cardTimer = 0;
  readonly curtain: HTMLElement;
  private readonly curtainText: HTMLElement;
  private readonly curtainSub: HTMLElement;
  private choice: { m: ModalHandle; left: number; total: number; fuse: HTMLElement; label: HTMLElement; fallback: () => void } | null = null;

  constructor(
    private readonly layer: HTMLElement,
    private readonly modals: ModalManager,
  ) {
    this.curtainText = h('p.kqs-curtain-text');
    this.curtainSub = h('p.kqs-curtain-sub');
    this.curtain = h('div.kqs-curtain', { 'data-testid': 'story-curtain' }, [this.curtainText, this.curtainSub]);
    layer.append(this.curtain);
  }

  /** Chapter / place card: "Prolog · Vermessung". */
  card(title: string, sub?: string, note?: string, seconds = 5.5): void {
    this.cardEl?.remove();
    window.clearTimeout(this.cardTimer);
    const el = h('div.kqs-card', { 'data-testid': 'story-card' }, [
      sub ? h('div.kqs-card-sub', sub) : null,
      h('div.kqs-card-title', title),
      h('div.kqs-card-rule'),
      note ? h('div.kqs-card-note', note) : null,
    ]);
    this.layer.append(el);
    this.cardEl = el;
    requestAnimationFrame(() => el.classList.add('kqs-show'));
    this.cardTimer = window.setTimeout(() => {
      el.classList.remove('kqs-show');
      window.setTimeout(() => el.remove(), 1400);
      if (this.cardEl === el) this.cardEl = null;
    }, seconds * 1000);
  }

  get cardVisible(): boolean {
    return !!this.cardEl;
  }

  /** Fade to black with a line; returns after `hold` seconds (the caller moves the player meanwhile). */
  curtainDown(text: string, sub: string): void {
    this.curtainText.textContent = text;
    this.curtainSub.textContent = sub;
    // above any title card
    this.cardEl?.remove();
    this.cardEl = null;
    this.layer.append(this.curtain);
    this.curtain.classList.remove('kqs-up');
    this.curtain.classList.add('kqs-down');
  }

  curtainUp(text?: string): void {
    if (text) {
      this.curtainText.textContent = text;
      this.curtainSub.textContent = '';
    }
    this.curtain.classList.add('kqs-up');
    window.setTimeout(() => this.curtain.classList.remove('kqs-down', 'kqs-up'), 2600);
  }

  get curtainIsDown(): boolean {
    return this.curtain.classList.contains('kqs-down');
  }

  /** A timed choice. `apply` receives the chosen option's flags. */
  openChoice(a: ChoiceAction, apply: (set: Record<string, FlagValue>, index: number) => void): void {
    this.choice?.m.close();
    let done = false;
    const pick = (i: number) => {
      if (done) return;
      done = true;
      apply(a.options[i]!.set, i);
      this.choice = null;
    };
    const fuse = h('div.kqs-fuse-fill');
    const label = h('span.kqs-fuse-label');
    const body = h('div.kqs-choice', [
      h('p.kqs-choice-prompt', a.prompt),
      a.seconds ? h('div.kqs-fuse', [fuse, label]) : null,
      h(
        'div.kqs-choice-options',
        a.options.map((o, i) => h('button.kq-btn.kqs-choice-btn', { 'data-testid': `choice-${i}`, onclick: () => (pick(i), m.close()) }, [h('span.kqs-choice-n', String(i + 1)), o.label])),
      ),
    ]);
    const m = this.modals.open({ body, closable: false, className: 'kqs-choice-modal' });
    m.el.dataset.testid = 'story-choice';
    const fallback = () => {
      pick(Math.min(a.options.length - 1, Math.max(0, a.fallback ?? 0)));
      m.close();
    };
    this.choice = { m, left: a.seconds ?? 0, total: a.seconds ?? 0, fuse, label, fallback };
    this.tickChoice(0);
  }

  get choiceOpen(): boolean {
    return !!this.choice;
  }

  /** Real-time tick (the game is paused while the choice is open). */
  tickChoice(dt: number): void {
    const c = this.choice;
    if (!c || c.total <= 0) return;
    c.left = Math.max(0, c.left - dt);
    c.fuse.style.transform = `scaleX(${(c.left / c.total).toFixed(3)})`;
    c.label.textContent = t('story.choice.timer', { s: Math.ceil(c.left) });
    if (c.left <= 0) c.fallback();
  }

  /** Pick an option programmatically (tests / debug). */
  pickChoice(i: number): boolean {
    const btn = this.choice?.m.el.querySelector(`[data-testid="choice-${i}"]`) as HTMLButtonElement | null;
    btn?.click();
    return !!btn;
  }

  clear(): void {
    this.cardEl?.remove();
    this.cardEl = null;
    this.curtain.classList.remove('kqs-down', 'kqs-up');
  }
}
