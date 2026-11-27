/**
 * Full-screen story overlays in the story layer: chapter title cards (field-book stamp), the
 * "caught" curtain (fade to black, a line of text, wake up at a checkpoint), timed choices
 * (a field-book modal or an inline card with a burning-down fuse; the fallback option is taken
 * when it runs out) and the story gauges (custom meters).
 *
 * A chapter's title card holds the opening beat (M-11, phone pass: card, banner and the first radio
 * line all landed in the first second): while it shows and fades (`holdsLines`) the story runtime
 * keeps the opening beat's timeline waiting, and the dialogue presenter's `held` keeps lines from
 * other sources (a quest offer's greeting, barks) queued.
 */
import { storyFadeSeconds } from '../../core/motion';
import { t } from '../../i18n';
import { h } from '../../ui/dom';
import type { Hud } from '../../ui/hud';
import type { ModalManager } from '../../ui/modal';
import type { ChoiceAction } from './types';

/** Seconds of the chapter card's fade (CSS 1.4 s) that still hold the lines: it has mostly gone. */
export const CARD_FADE_HOLD = 0.8;

/**
 * Which clock moves a title card (pure, tested). The fixed update always does (game time: it stops
 * behind the pause menu, and a headless `kq.step(n)` moves the card n ticks, though it renders only
 * once). In `?manual` / bullet time the render frame also does while not paused, so a spec that
 * waits in real time without stepping still sees the card go (as it did when cards ran on frames).
 */
export function cardClockDt(source: 'update' | 'frame', manual: boolean, paused: boolean, dt: number): number {
  if (source === 'update') return dt;
  return manual && !paused ? Math.min(dt, 0.1) : 0;
}

/**
 * The title card's clock and its hold on the story (no DOM: unit-tested). `show` starts the card's
 * seconds (a chapter card holds, a place card does not); `tick` counts them down and says when the
 * card goes (its fade then still holds for CARD_FADE_HOLD); `drop` lets go at once (curtain, the
 * ending table).
 */
export class CardLineHold {
  private up = false;
  private fade = 0;
  private left = 0;
  private shown = false;
  private wallUntil = Infinity;
  private pausedAt: number | null = null;

  show(chapter: boolean, seconds = 5.5, now?: number): void {
    this.up = chapter;
    this.fade = 0;
    this.left = seconds;
    this.shown = true;
    this.wallUntil = chapter && now !== undefined ? (this.pausedAt ?? now) + seconds * 1000 : Infinity;
  }

  setPaused(paused: boolean, hidden: boolean, now: number): void {
    if (paused || hidden) this.pausedAt ??= now;
    else if (this.pausedAt !== null) {
      this.wallUntil += now - this.pausedAt;
      this.pausedAt = null;
    }
  }

  hide(now?: number, reducedMotion = false): void {
    if (this.up) this.fade = storyFadeSeconds(CARD_FADE_HOLD, reducedMotion);
    this.wallUntil = this.up && now !== undefined ? now + this.fade * 1000 : Infinity;
    this.up = false;
    this.shown = false;
  }

  drop(): void {
    this.up = false;
    this.fade = 0;
    this.shown = false;
    this.wallUntil = Infinity;
  }

  /** Advance by `dt` s; true when the card's time ran out now (the caller fades it out). */
  tick(dt: number, now?: number, reducedMotion = false): boolean {
    if (this.pausedAt !== null) return false;
    const wallElapsed = now !== undefined && now >= this.wallUntil;
    if (this.fade > 0) this.fade = wallElapsed ? 0 : Math.max(0, this.fade - dt);
    if (!this.shown) return false;
    this.left -= dt;
    if (this.left > 0 && !wallElapsed) return false;
    this.hide(now, reducedMotion);
    return true;
  }

  /** `present`: the card is still in the page (a test or screenshot helper may have removed it). */
  holding(present = true): boolean {
    return (this.up && present) || this.fade > 0;
  }
}

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
  private fadeEl: HTMLElement | null = null;
  /** Seconds the title card has left on screen (game time: it waits while the game is paused). */
  private readonly hold = new CardLineHold();
  readonly curtain: HTMLElement;
  private readonly curtainText: HTMLElement;
  private readonly curtainSub: HTMLElement;
  private curtainTimer: number | undefined;
  private choice: OpenChoice | null = null;
  private readonly gauges = new Map<string, { el: HTMLElement; fill: HTMLElement }>();
  private readonly gaugeBox: HTMLElement;

  constructor(
    private readonly layer: HTMLElement,
    private readonly modals: ModalManager,
    private readonly inlineChoiceChanged: (open: boolean) => void,
    hud?: Hud,
    private readonly reducedMotion: () => boolean = () => false,
  ) {
    this.curtainText = h('p.kqs-curtain-text');
    this.curtainSub = h('p.kqs-curtain-sub');
    this.curtain = h('div.kqs-curtain', { 'data-testid': 'story-curtain' }, [this.curtainText, this.curtainSub]);
    this.gaugeBox = h('div.kqs-gauges', { 'data-testid': 'story-gauges' });
    // gauges stack under the objective in the HUD's top-left column (no overlap at any size)
    if (hud) hud.stack(this.gaugeBox, 40);
    layer.append(...(hud ? [] : [this.gaugeBox]), this.curtain);
  }

  /** Chapter / place card: "Prolog · heute, ein Novembernachmittag". `chapter`: it holds the opening beat while it shows. */
  card(title: string, sub?: string, note?: string, seconds = 5.5, chapter = false): void {
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
    this.hold.show(chapter, seconds, performance.now());
  }

  /** Let the title card go now (the ending table opens: the chapter card must not return after the credits). */
  dropCard(): void {
    this.hideCard();
    this.hold.drop();
  }

  /**
   * Advance the title card by game time, with a wall-clock cap for chapter cards during slow frames.
   * Both clocks suspend while the game is paused or the document is hidden.
   */
  tickCard(dt: number, now?: number): void {
    if (this.hold.tick(dt, now, this.reducedMotion())) this.hideCard();
  }

  setCardPaused(paused: boolean, hidden: boolean): void {
    this.hold.setPaused(paused, hidden, performance.now());
  }

  private hideCard(): void {
    const el = this.cardEl;
    if (!el) return;
    el.classList.remove('kqs-show');
    window.setTimeout(() => el.remove(), storyFadeSeconds(1.4, this.reducedMotion()) * 1000);
    this.cardEl = null;
  }

  get cardVisible(): boolean {
    return !!this.cardEl;
  }

  /** A chapter card is up (or still fading): the opening beat's timeline and other lines wait for it. */
  get holdsLines(): boolean {
    return this.hold.holding(this.cardEl?.isConnected ?? false);
  }

  /** Fade to black with a line (the caller moves the player meanwhile and lifts it). */
  curtainDown(text: string, sub: string): void {
    window.clearTimeout(this.curtainTimer);
    this.curtainText.textContent = text;
    this.curtainSub.textContent = sub;
    // above any title card
    this.cardEl?.remove();
    this.cardEl = null;
    this.hold.drop();
    this.layer.append(this.curtain);
    this.curtain.classList.remove('kqs-up');
    this.curtain.classList.add('kqs-down');
  }

  curtainUp(text?: string, sub?: string): void {
    if (text) {
      this.curtainText.textContent = text;
      this.curtainSub.textContent = sub ?? '';
    }
    this.curtain.classList.add('kqs-up');
    window.clearTimeout(this.curtainTimer);
    this.curtainTimer = window.setTimeout(() => this.clearCurtain(), 2600);
  }

  clearCurtain(): void {
    window.clearTimeout(this.curtainTimer);
    this.curtainTimer = undefined;
    this.curtain.classList.remove('kqs-down', 'kqs-up');
  }

  /**
   * A plain fade to black (`to` 1) or back (0) over `seconds` (the tour's transitions, „Zur
   * Gruppe“). No text; prepended to the layer, so subtitles and cards stay readable on top.
   */
  fade(to: 0 | 1, seconds: number): void {
    let el = this.fadeEl;
    if (!el) {
      el = this.fadeEl = h('div.kqs-fade', { 'data-testid': 'story-fade' });
      this.layer.prepend(el);
    }
    el.style.transition = `opacity ${storyFadeSeconds(seconds, this.reducedMotion())}s linear`;
    // the transition needs a frame between append and the new value
    void el.offsetWidth;
    el.style.opacity = String(to);
    el.dataset['to'] = String(to);
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
      if (!modal) this.inlineChoiceChanged(false);
      apply(i);
      return true;
    };
    const options = a.options.map((o, i) =>
      h(`${modal ? 'button.kq-btn' : 'div'}.kqs-choice-btn`, { 'data-testid': `choice-${i}`, onclick: modal ? () => pick(i) : undefined }, [h('span.kqs-choice-n', { 'aria-hidden': 'true' }, modal ? String(i + 1) : '•'), o.label]),
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
      m.el.setAttribute('aria-label', a.prompt);
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
    if (!modal) this.inlineChoiceChanged(true);
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
    if (!c.modal) this.inlineChoiceChanged(false);
  }

  clear(): void {
    this.cardEl?.remove();
    this.cardEl = null;
    this.clearCurtain();
  }
}
