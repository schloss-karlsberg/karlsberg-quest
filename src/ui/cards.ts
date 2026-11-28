/**
 * Card discipline (docs/ACTION-RPG.md §10): one card or HUD notice on screen at a time.
 *
 * The clue page, quest payout, level-up, standalone skill unlock and HUD toast share the slot.
 * A card that does not get it waits in its own
 * queue; nothing stacks. While a fight, a chase, a boss reveal, the curtain or an NPC conversation
 * is on, the slot is *held*: no card comes up (a card already up steps aside — its own CSS — and
 * its clock stops), so cards never cover a fight or talk over a person.
 *
 *   ctx.ui.cards.claim('reward')   → true while this card may be on screen (call every frame)
 *   ctx.ui.cards.release('reward') → the card went away; the next one may come
 *   ctx.ui.cards.modal('clue:…', open) → a modal card: opens when the slot is free, one at a time
 *   ctx.ui.cards.hold('talk', on)  → extra hold reasons (the NPC panel); the HUD's action reasons hold too
 *
 * A field-book page is something the player asked for (E on a clue, an echo heard out): it goes in
 * front of a slide-in card, which steps aside (`held`) and comes back when the page is read.
 *
 * Tokens are free strings; the kind is the part before the first ':' (tests read `visible()`).
 */
import type { Hud } from './hud';
import type { ModalHandle, ModalManager } from './modal';

interface QueuedModal {
  token: string;
  open: () => ModalHandle;
}

/** Seconds between one card leaving and the next one coming (the eye needs a beat). */
export const CARD_GAP = 0.35;
/** A soft hold (a line being spoken, a hunt) keeps cards back this long after it ends. */
export const SOFT_LINGER = 1.2;
/**
 * Longest a soft reason keeps a waiting card back in one go (s): a chain of lines must not bury it.
 * Past it a card still waits until the line on screen is done (TASK-085: the level card came up over
 * Laub's line), a break or the next line taking its place; once through, it stays for the rest of
 * that spell of talk (it sits clear of the dialogue card on every layout).
 */
export const SOFT_MAX = 8;
/** The soft reason for a line being spoken (story): past SOFT_MAX cards wait for a break in it. */
export const SOFT_LINE = 'dialogue';

/** Tallest viewport (CSS px) that uses the short touch layout of touch.css (`max-height: 500px`). */
export const SHORT_LAYOUT_MAX_H = 500;

/**
 * On a short touch layout (a landscape phone) the level and skill cards share the band under the
 * dialogue with the subtitle box, and there is no free spot for either one beside the other
 * (TASK-074). While a caption or subtitle line is up there, the card steps aside (its clock stops)
 * and comes back when the line has gone, like it does for the floating stick. Desktop and taller
 * touch layouts keep both on screen.
 */
export function captionCoversCard(touch: boolean, viewportH: number, captionLines: number): boolean {
  return touch && viewportH <= SHORT_LAYOUT_MAX_H && captionLines > 0;
}

/**
 * The same band problem for a toast (TASK-085): on a short touch layout a long tip in the notice
 * dock reaches down to the subtitle box („Laufschritt …“ over „Vögel zwitschern.“), so it waits
 * while any line is in the box, spoken or a sound caption. Taller layouts keep them apart.
 */
export function subtitlesCoverToast(touch: boolean, viewportH: number, subtitleLines: number): boolean {
  return touch && viewportH <= SHORT_LAYOUT_MAX_H && subtitleLines > 0;
}

interface Toast {
  text: string;
  left: number;
}

export class CardDirector {
  /** The non-modal card or notice on the slot. */
  private owner: string | null = null;
  private dismissOwner: (() => void) | null = null;
  private toast: Toast | null = null;
  private readonly toasts: Toast[] = [];
  /** The modal page open now (it goes in front of a slide-in card). */
  private modalOwner: string | null = null;
  private modalHandle: ModalHandle | null = null;
  private readonly queue: QueuedModal[] = [];
  private readonly holds = new Set<string>();
  private gap = 0;
  /** A screen that covers the card or notice, such as a title card or a curtain. */
  extraHold: (() => boolean) | null = null;
  /**
   * Keeps the toast back (and steps an up one aside, its clock stopped) while it would share the
   * screen with the subtitle box: on a landscape phone a long tip reaches the captions (TASK-085).
   */
  toastHold: (() => boolean) | null = null;
  /** A dialogue box is open (story line, bark, echo): the level card waits for it (TASK-085). */
  dialogueOpen: (() => boolean) | null = null;

  constructor(
    private readonly hud: Pick<Hud, 'inAction' | 'showToast' | 'holdToast' | 'closeToast'>,
    private readonly modals: Pick<ModalManager, 'count'>,
  ) {}

  private readonly sources = new Map<string, () => unknown[]>();

  /**
   * A card kind that can ride along on another card (the skills system offers its waiting unlock
   * cards; the level card takes them: one card, not two).
   */
  source(kind: string, fn: (() => unknown[]) | null): void {
    if (fn) this.sources.set(kind, fn);
    else this.sources.delete(kind);
  }

  /** Take what `kind` has waiting (empties it there). */
  drain<T>(kind: string): T[] {
    return (this.sources.get(kind)?.() ?? []) as T[];
  }

  /** An extra reason that keeps cards back (the NPC conversation: 'talk'; an echo; the Festsaal). */
  hold(reason: string, on: boolean): void {
    if (on) this.holds.add(reason);
    else if (this.holds.delete(reason)) this.pump(); // a page that waited on it opens now
  }

  /**
   * A soft reason (playtest round 5: the level card came up over Laub's line and over a sneak): it
   * keeps the slide-in cards (reward, level, skill) back — a card up steps aside — but not a page the
   * player asked for (E on a clue). Released, it lingers `SOFT_LINGER` s, so a card does not pop
   * up in the breath between two lines.
   */
  soft(reason: string, on: boolean, line?: unknown): void {
    if (reason === SOFT_LINE) {
      // `line` names the line on screen: the next one taking its place is a break too (past SOFT_MAX)
      const key = on ? line : undefined;
      if (key !== undefined && this.lineKey !== undefined && key !== this.lineKey) this.lineTurned = true;
      this.lineKey = key;
    }
    if (on) this.softs.set(reason, Infinity);
    else if (this.softs.get(reason) === Infinity) this.softs.set(reason, this.clock + SOFT_LINGER);
  }

  private lineKey: unknown = undefined;
  /** The line on screen gave way to the next one since the last tick. */
  private lineTurned = false;

  private readonly softs = new Map<string, number>();
  private clock = 0;

  /** Since when (clock) the soft reasons have held without a break (−1: not holding). */
  private softSince = -1;
  /** Past SOFT_MAX a break between two lines came: the cards may show for the rest of this spell. */
  private softReleased = false;

  private get softRaw(): boolean {
    for (const v of this.softs.values()) if (v > this.clock) return true;
    return false;
  }

  private get softBusy(): boolean {
    return this.softRaw && !this.softReleased;
  }

  /** A line is on screen now (not only lingering after one). */
  private get lineUp(): boolean {
    return this.softs.get(SOFT_LINE) === Infinity;
  }

  /** Past SOFT_MAX the soft hold lets go at the first moment no line is on screen (tick, clear). */
  private updateSoftRelease(): void {
    if (!this.softRaw) this.softReleased = false;
    else if (!this.softReleased && this.softSince >= 0 && this.clock - this.softSince >= SOFT_MAX && (!this.lineUp || this.lineTurned)) this.softReleased = true;
    this.lineTurned = false;
  }

  /** Is the slot held (fight, chase, reveal, being knocked down, conversation …)? */
  private get busy(): boolean {
    return this.holds.size > 0 || this.hud.inAction;
  }

  /** Must a slide-in card step aside now (held, a soft reason, or a field-book page in front of it)? */
  get held(): boolean {
    return this.busy || this.softBusy || this.modalOwner !== null || this.modals.count > 0 || !!this.extraHold?.();
  }

  /**
   * Must the level card wait or step aside now? `held`, and also while any dialogue box is
   * open, past SOFT_MAX too: on the desktop and in 1789's arrival the card lay over Laub's lines
   * (TASK-085). It is never dropped; it shows in the first moment without a box.
   */
  get cardHeld(): boolean {
    return this.held || !!this.dialogueOpen?.();
  }

  /** Why it is held (tests / debug). */
  holdReasons(): string[] {
    const soft = [...this.softs].filter(([, v]) => v > this.clock).map(([k]) => `soft:${k}`);
    return [...this.holds, ...soft, ...(this.hud.inAction ? ['action'] : []), ...(this.extraHold?.() ? ['story'] : []), ...(this.dialogueOpen?.() ? ['dialogue-box'] : [])];
  }

  /** The token on screen now (null: none). */
  get showing(): string | null {
    return this.modalOwner ?? this.owner;
  }

  /**
   * A non-modal card asks for the slot. True when it owns it (keep showing) or just got it.
   * A card that already owns the slot keeps it while held (it steps aside itself).
   * Quest payouts and unlock cards can take the slot from a routine toast.
   */
  claim(token: string, dismiss?: () => void): boolean {
    if (this.owner === token) {
      // The touch UI can switch on while the card shows (a touch laptop's first tap): follow it.
      this.dismissOwner = dismiss ?? null;
      return true;
    }
    if (this.gap > 0 || this.held || this.queue.length > 0) return false;
    const replacesToast = this.owner === 'toast' && (token === 'skill' || token === 'level' || token === 'reward');
    if (this.owner !== null && !replacesToast) return false;
    if (replacesToast) this.hud.holdToast(true);
    this.owner = token;
    this.dismissOwner = dismiss ?? null;
    return true;
  }

  /** Dismiss only the notice the player can currently see. */
  dismissNotice(): boolean {
    if (!this.dismissOwner || this.held) return false;
    this.dismissOwner();
    return true;
  }

  enqueueToast(text: string, ms = 2600): void {
    if (this.toast?.text === text || this.toasts.some((toast) => toast.text === text)) return;
    this.toasts.push({ text, left: ms / 1000 });
    if (this.toasts.length > 6) this.toasts.shift();
  }

  private readonly closeToast = () => {
    this.toast = null;
    this.hud.closeToast();
    this.release('toast');
  };

  clearToasts(): void {
    this.toasts.length = 0;
    if (this.toast) this.closeToast();
  }

  private tickToast(dt: number): void {
    if (!this.toast) {
      if (this.toasts.length && !this.toastHold?.() && this.claim('toast', this.closeToast)) {
        this.toast = this.toasts.shift()!;
        this.hud.showToast(this.toast.text);
      }
      return;
    }
    // Resume an interrupted toast before taking the next one off the queue.
    if (this.owner !== 'toast') {
      if (this.claim('toast', this.closeToast)) this.hud.holdToast(this.held || !!this.toastHold?.());
      return;
    }
    const held = this.held || !!this.toastHold?.();
    this.hud.holdToast(held);
    if (held) return;
    this.toast.left -= dt;
    if (this.toast.left <= 0) this.closeToast();
  }

  /** The card is gone: the slot frees after a short gap. */
  release(token: string): void {
    if (this.modalOwner !== null && this.modalOwner === token) {
      this.modalOwner = null;
      this.modalHandle = null;
      this.gap = CARD_GAP;
    } else if (this.owner === token) {
      this.owner = null;
      this.dismissOwner = null;
      this.gap = CARD_GAP;
    }
  }

  /** A modal card (it pauses the game): opened at once when the slot is free, else queued. */
  modal(token: string, open: () => ModalHandle): void {
    this.queue.push({ token, open });
    this.pump();
  }

  /** Modal cards waiting (tests). */
  get pending(): number {
    return this.queue.length;
  }

  /** Per frame (real seconds; also while paused, so a queued card follows a closed one). */
  tick(dt: number): void {
    this.clock += dt;
    for (const [k, v] of this.softs) if (v <= this.clock) this.softs.delete(k);
    if (!this.softRaw) this.softSince = -1;
    else if (this.softSince < 0) this.softSince = this.clock;
    this.updateSoftRelease();
    if (this.gap > 0) this.gap = Math.max(0, this.gap - dt);
    if (this.modalHandle?.closed) this.release(this.modalOwner ?? '');
    this.pump();
    this.tickToast(dt);
  }

  private pump(): void {
    // A clue page may open over Pause or a slide-in card. Fights and conversations hold the queue.
    if (!this.queue.length || this.modalOwner !== null || this.gap > 0 || this.busy) return;
    const next = this.queue.shift()!;
    this.modalOwner = next.token;
    const handle = next.open();
    this.modalHandle = handle;
    if (handle.closed) {
      this.release(next.token);
      return;
    }
    // every way out (OK, Escape, the backdrop, closeAll) goes through the handle's close
    const close = handle.close.bind(handle);
    handle.close = () => {
      close();
      this.release(next.token);
    };
  }

  /** Forget everything (a new game, a load). */
  clear(): void {
    this.queue.length = 0;
    this.clearToasts();
    this.owner = null;
    this.dismissOwner = null;
    this.modalOwner = null;
    this.modalHandle = null;
    this.gap = 0;
    this.softs.clear();
    this.softSince = -1;
    this.softReleased = false;
    this.lineKey = undefined;
    this.lineTurned = false;
  }

  /** The kinds of cards and notices visible in the DOM now (tests: never more than one). */
  static visible(): string[] {
    if (typeof document === 'undefined') return [];
    const out: string[] = [];
    const vis = (sel: string) =>
      [...document.querySelectorAll<HTMLElement>(sel)].some((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05 && r.width > 2 && r.height > 2;
      });
    if (vis('[data-testid="chronik-card"]')) out.push('clue');
    if (vis('.kqq-reward:not(.kq-notice-out):not([hidden])')) out.push('reward');
    if (vis('.kq-toast:not(.kq-notice-out):not([hidden])')) out.push('toast');
    if (vis('.kqp-card:not(.kqp-out):not(.kqp-held)')) out.push('level');
    if (vis('.kqk-card:not(.kqk-out):not(.kqk-held)')) out.push('skill');
    if (vis('.kqs-choice-card.kqs-show')) out.push('choice');
    return out;
  }
}
