/**
 * Full-screen story overlays in the story layer: chapter title cards (field-book stamp), the
 * "caught" curtain (fade to black, a line of text, wake up in the field station), timed choices
 * (a field-book modal or an inline card with a burning-down fuse; the fallback option is taken
 * when it runs out) and the story gauges (custom meters).
 */
import { t } from '../../i18n';
import { h } from '../../ui/dom';
import type { Hud } from '../../ui/hud';
import type { ModalManager } from '../../ui/modal';
import type { ChoiceAction } from './types';

interface OpenChoice {
  id: string;
  modal: boolean;
  el: HTMLElement;
  left: number;
  total: number;
  fuse: HTMLElement;
  label: HTMLElement;
  fallback: () => void;
  pick: (i: number) => boolean;
  close: () => void;
  dispose: () => void;
}

export class StoryOverlays {
  private cardEl: HTMLElement | null = null;
  /** Seconds the title card has left on screen (game time: it waits while the game is paused). */
  private cardLeft = 0;
  readonly curtain: HTMLElement;
  private readonly curtainText: HTMLElement;
  private readonly curtainSub: HTMLElement;
  private choice: OpenChoice | null = null;
  private readonly gauges = new Map<string, { el: HTMLElement; fill: HTMLElement }>();
  private readonly gaugeBox: HTMLElement;

  constructor(
    private readonly layer: HTMLElement,
    private readonly modals: ModalManager,
    hud?: Hud,
  ) {
    this.curtainText = h('p.kqs-curtain-text');
    this.curtainSub = h('p.kqs-curtain-sub');
    this.curtain = h('div.kqs-curtain', { 'data-testid': 'story-curtain' }, [this.curtainText, this.curtainSub]);
    this.gaugeBox = h('div.kqs-gauges', { 'data-testid': 'story-gauges' });
    // gauges stack under the objective in the HUD's top-left column (no overlap at any size)
    if (hud) hud.stack(this.gaugeBox, 40);
    layer.append(...(hud ? [] : [this.gaugeBox]), this.curtain);
  }

  /** Chapter / place card: "Prolog · Vermessung". */
  card(title: string, sub?: string, note?: string, seconds = 5.5): void {
    this.cardEl?.remove();
    const el = h('div.kqs-card', { 'data-testid': 'story-card' }, [
      sub ? h('div.kqs-card-sub', sub) : null,
      h('div.kqs-card-title', title),
      h('div.kqs-card-rule'),
      note ? h('div.kqs-card-note', note) : null,
    ]);
    this.layer.append(el);
    this.cardEl = el;
    requestAnimationFrame(() => el.classList.add('kqs-show'));
    this.cardLeft = seconds;
  }

  /**
   * Advance the title card (seconds of game time — 0 while the game is paused, so a card is never
   * missed behind the pause menu or a modal).
   */
  tickCard(dt: number): void {
    const el = this.cardEl;
    if (!el || dt <= 0) return;
    this.cardLeft -= dt;
    if (this.cardLeft > 0) return;
    el.classList.remove('kqs-show');
    window.setTimeout(() => el.remove(), 1400);
    this.cardEl = null;
  }

  get cardVisible(): boolean {
    return !!this.cardEl;
  }

  /** Fade to black with a line (the caller moves the player meanwhile and lifts it). */
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

  // ---- story gauges (custom meters) --------------------------------------------------------

  /** Show / update a gauge (0..1); null removes it. */
  gauge(id: string, label: string, value: number | null): void {
    let g = this.gauges.get(id);
    if (value === null) {
      if (g) {
        g.el.remove();
        this.gauges.delete(id);
      }
      return;
    }
    if (!g) {
      const fill = h('div.kqs-gauge-fill');
      const el = h('div.kqs-gauge', { 'data-testid': `gauge-${id}`, 'data-meter': id }, [h('span.kqs-gauge-label', label), h('div.kqs-gauge-bar', fill)]);
      this.gaugeBox.append(el);
      g = { el, fill };
      this.gauges.set(id, g);
    }
    const v = Math.max(0, Math.min(1, value));
    g.fill.style.transform = `scaleX(${v.toFixed(3)})`;
    g.el.classList.toggle('kqs-warn', v > 0.75);
  }

  // ---- choices -----------------------------------------------------------------------------

  /**
   * A choice. Modal (default): field-book card, pauses the game, click or keys 1–n. Inline
   * (`modal: false`): a card in the story layer while the game runs on, resolved by the host
   * (option conditions) or `pickChoice`. `apply` receives the chosen option's index.
   * The fuse runs on the clock passed to `tickChoice` (game time; see StoryRuntime.uiTick).
   */
  openChoice(a: ChoiceAction, apply: (index: number) => void): void {
    this.closeChoice();
    let done = false;
    const modal = a.modal !== false;
    const fuse = h('div.kqs-fuse-fill');
    const label = h('span.kqs-fuse-label');
    let close: () => void = () => {};
    const pick = (i: number): boolean => {
      if (done || i < 0 || i >= a.options.length) return false;
      done = true;
      const c = this.choice;
      this.choice = null;
      c?.dispose();
      close();
      apply(i);
      return true;
    };
    const options = a.options.map((o, i) =>
      h(`${modal ? 'button.kq-btn' : 'div'}.kqs-choice-btn`, { 'data-testid': `choice-${i}`, onclick: () => pick(i) }, [h('span.kqs-choice-n', modal ? String(i + 1) : '•'), o.label]),
    );
    const body = h(`div.kqs-choice${modal ? '' : '.kqs-choice-inline'}`, [
      h('p.kqs-choice-prompt', a.prompt),
      a.note ? h('p.kqs-choice-note', a.note) : null,
      a.seconds ? h('div.kqs-fuse', [fuse, label]) : null,
      h('div.kqs-choice-options', options),
    ]);
    let el: HTMLElement;
    if (modal) {
      const m = this.modals.open({ body, closable: false, className: 'kqs-choice-modal' });
      m.el.dataset.testid = 'story-choice';
      close = () => m.close();
      el = m.el;
    } else {
      el = h('div.kqs-choice-card', { 'data-testid': 'story-choice' }, body);
      this.layer.append(el);
      requestAnimationFrame(() => el.classList.add('kqs-show'));
      close = () => {
        el.removeAttribute('data-testid');
        el.classList.remove('kqs-show');
        window.setTimeout(() => el.remove(), 600);
      };
    }
    const keys = (e: KeyboardEvent) => {
      const n = /^(Digit|Numpad)(\d)$/.exec(e.code);
      const i = n ? Number(n[2]) - 1 : -1;
      if (i < 0 || i >= a.options.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      pick(i);
    };
    if (modal) window.addEventListener('keydown', keys, true);
    this.choice = {
      id: a.id,
      modal,
      el,
      left: a.seconds ?? 0,
      total: a.seconds ?? 0,
      fuse,
      label,
      fallback: () => pick(Math.min(a.options.length - 1, Math.max(0, a.fallback ?? 0))),
      pick,
      close: () => {
        done = true;
        close();
      },
      dispose: () => window.removeEventListener('keydown', keys, true),
    };
    this.tickChoice(0);
  }

  get choiceOpen(): boolean {
    return !!this.choice;
  }

  /** Id of the open choice (inline or modal). */
  get choiceId(): string | null {
    return this.choice?.id ?? null;
  }

  get choiceInline(): boolean {
    return !!this.choice && !this.choice.modal;
  }

  /** Advance the fuse (seconds of game time, or real time while a modal pauses the game). */
  tickChoice(dt: number): void {
    const c = this.choice;
    if (!c || c.total <= 0) return;
    c.left = Math.max(0, c.left - dt);
    c.fuse.style.transform = `scaleX(${(c.left / c.total).toFixed(3)})`;
    c.label.textContent = t('story.choice.timer', { s: Math.ceil(c.left) });
    if (c.left <= 0) c.fallback();
  }

  /** Pick an option programmatically (tests / debug / inline conditions). */
  pickChoice(i: number): boolean {
    return this.choice?.pick(i) ?? false;
  }

  /** Close an open choice without an answer (caught, chapter switch). */
  closeChoice(): void {
    const c = this.choice;
    if (!c) return;
    this.choice = null;
    c.dispose();
    c.close();
  }

  clear(): void {
    this.cardEl?.remove();
    this.cardEl = null;
    this.curtain.classList.remove('kqs-down', 'kqs-up');
  }
}
