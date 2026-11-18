/**
 * Card discipline (playtest round 4, docs/ACTION-RPG.md §10): ONE centre card on screen at a time.
 *
 * Every card that takes the centre of the screen — the clue card (a modal field-book page), the
 * quest reward card, the level-up card (which takes pending skill unlocks with it) and a lone skill
 * unlock card — asks this director for the slot. A card that does not get it waits in its own
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

export class CardDirector {
  /** The slide-in card on the slot (reward, level, skill). */
  private owner: string | null = null;
  /** The modal page open now (it goes in front of a slide-in card). */
  private modalOwner: string | null = null;
  private modalHandle: ModalHandle | null = null;
  private readonly queue: QueuedModal[] = [];
  private readonly holds = new Set<string>();
  private gap = 0;
  /** Extra hold for the slide-in cards (the story's title card / curtain), set by the story system. */
  extraHold: (() => boolean) | null = null;

  constructor(
    private readonly hud: Hud,
    private readonly modals: ModalManager,
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
  soft(reason: string, on: boolean): void {
    if (on) this.softs.set(reason, Infinity);
    else if (this.softs.get(reason) === Infinity) this.softs.set(reason, this.clock + SOFT_LINGER);
  }

  private readonly softs = new Map<string, number>();
  private clock = 0;

  private get softBusy(): boolean {
    for (const v of this.softs.values()) if (v > this.clock) return true;
    return false;
  }

  /** Is the slot held (fight, chase, reveal, being knocked down, conversation …)? */
  private get busy(): boolean {
    return this.holds.size > 0 || this.hud.inAction;
  }

  /** Must a slide-in card step aside now (held, a soft reason, or a field-book page in front of it)? */
  get held(): boolean {
    return this.busy || this.softBusy || this.modalOwner !== null;
  }

  /** Why it is held (tests / debug). */
  holdReasons(): string[] {
    const soft = [...this.softs].filter(([, v]) => v > this.clock).map(([k]) => `soft:${k}`);
    return [...this.holds, ...soft, ...(this.hud.inAction ? ['action'] : []), ...(this.extraHold?.() ? ['story'] : [])];
  }

  /** The token on screen now (null: none). */
  get showing(): string | null {
    return this.modalOwner ?? this.owner;
  }

  /**
   * A non-modal card asks for the slot. True when it owns it (keep showing) or just got it.
   * A card that already owns the slot keeps it while held (it steps aside itself).
   */
  claim(token: string): boolean {
    if (this.owner === token) return true;
    if (this.owner !== null || this.modalOwner !== null || this.gap > 0 || this.busy || this.softBusy || this.queue.length > 0) return false;
    // another modal (a menu, the journal, the conversation) or the chapter title card / curtain is
    // up: the slide-in cards wait for it
    if (this.modals.count > 0 || this.extraHold?.()) return false;
    this.owner = token;
    return true;
  }

  /** The card is gone: the slot frees after a short gap. */
  release(token: string): void {
    if (this.modalOwner !== null && this.modalOwner === token) {
      this.modalOwner = null;
      this.modalHandle = null;
      this.gap = CARD_GAP;
    } else if (this.owner === token) {
      this.owner = null;
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
    if (this.gap > 0) this.gap = Math.max(0, this.gap - dt);
    if (this.modalHandle?.closed) this.release(this.modalOwner ?? '');
    this.pump();
  }

  private pump(): void {
    // a field-book page may open over the station's hub (the Pinnwand hands out two at once: they
    // come one after the other) and in front of a slide-in card (it steps aside), but never over a
    // fight or a conversation
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
    this.owner = null;
    this.modalOwner = null;
    this.modalHandle = null;
    this.gap = 0;
    this.softs.clear();
  }

  /** The kinds of centre cards visible in the DOM now (tests: never more than one). */
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
    if (vis('.kqq-reward:not(.kqq-out):not(.kqq-held)')) out.push('reward');
    if (vis('.kqp-card:not(.kqp-out):not(.kqp-held)')) out.push('level');
    if (vis('.kqk-card:not(.kqk-out):not(.kqk-held)')) out.push('skill');
    if (vis('.kqs-choice-card.kqs-show')) out.push('choice');
    return out;
  }
}
