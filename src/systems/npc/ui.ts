/**
 * The conversation panel: a field-book page at the bottom of the screen (the ghost stays visible
 * above it). The spoken line types out with the speaker's voice murmur; below it the questions
 * (keys 1–n, click) and "Auf Wiedersehen". Enter / Space / E / click advance; the hint names the
 * interact key, in touch mode the „Aktion“ button (mode read per line and per frame). Every line carries
 * its label: "erfunden" (fiction) or "historisch" with a source.
 * Typing runs on the UI clock (`tick(realDt)` from the npc system's frame: the game is paused
 * under the modal); `finish()` completes it at once (tests, screenshots).
 */
import { t } from '../../i18n';
import type { QuestCard } from '../../rpg/types';
import { type ActionLabelInput, actionLabel } from '../../ui/actionLabel';
import { h, svg } from '../../ui/dom';
import type { ModalHandle, ModalManager } from '../../ui/modal';
import { ensurePortraitDefs, portraitSvg } from '../story/dialogue/portraits';
import type { SpeakerMeta } from '../story/dialogue/speakers';
import { type Voice, syllableStarts } from '../story/dialogue/voice';

export interface TalkLine {
  id: string;
  speaker: SpeakerMeta;
  text: string;
  source?: string;
  /** A history line told at a quest turn-in (styled as told history; `note` names its codex card). */
  history?: boolean;
  note?: string;
}

/** Quest topics carry a shape-coded glyph; answers to a quest (accept / later / hand in) are styled. */
export type TopicMark = 'offer' | 'offer-main' | 'ready' | 'active' | 'accept' | 'decline' | 'more';

export interface TalkTopic {
  id: string;
  label: string;
  asked: boolean;
  mark?: TopicMark;
}

const MARK_GLYPH: Record<TopicMark, string> = { offer: '!', 'offer-main': '!', ready: '?', active: '?', accept: '✓', decline: '…', more: '§' };

/**
 * The RPG quest card inside the conversation (playtest round 3): kicker (Auftrag / Abgabe), title,
 * giver, the pitch, the objectives (ticked at turn-in), the reward preview (EP, items, skills,
 * codex cards). The answers stay the conversation's buttons below it.
 */
export function questCardEl(c: QuestCard, mode: 'offer' | 'turnin'): HTMLElement {
  const rewards: (HTMLElement | null)[] = [
    c.xp > 0 ? h('span.kqn-qc-xp', t('quest.xp', { n: c.xp })) : null,
    ...c.items.map((i) => h('span.kqn-qc-item', i)),
    ...c.skills.map((s) => h('span.kqn-qc-item.kqn-qc-skill', s)),
    c.codex > 0 ? h('span.kqn-qc-item.kqn-qc-codex', t('quest.card.codex', { n: c.codex })) : null,
  ].filter((x): x is HTMLElement => !!x);
  return h(`div.kqn-qcard.kqn-qc-${mode}${c.main ? '.kqn-qc-main' : ''}`, { 'data-testid': `quest-card-${mode}` }, [
    h('div.kqn-qc-head', [
      h('span.kqn-qc-kick', mode === 'offer' ? (c.main ? t('quest.new') : t('quest.newSide')) : t('quest.card.turnin')),
      h('span.kqn-qc-from', t('quest.card.from', { name: c.giver })),
    ]),
    h('div.kqn-qc-title', c.title),
    mode === 'offer' ? h('p.kqn-qc-pitch', c.pitch) : null,
    h('div.kqn-qc-cols', [
      h('div.kqn-qc-goals', [
        h('div.kqn-qc-lbl', t('quest.card.goals')),
        h(
          'ul',
          c.objectives.slice(0, 6).map((o) =>
            h(`li${o.done ? '.kqn-qc-done' : ''}${o.optional ? '.kqn-qc-opt' : ''}`, [
              h('span.kqn-qc-box', { 'aria-hidden': 'true' }, o.done ? '✓' : o.optional ? '+' : ''),
              o.text,
              o.need > 1 ? h('span.kqn-qc-n', ` ×${o.need}`) : null,
              o.optional ? h('span.kqn-qc-bonus', ` (${t('quest.bonus')})`) : null,
            ]),
          ),
        ),
      ]),
      rewards.length ? h('div.kqn-qc-rew', [h('div.kqn-qc-lbl', t('quest.card.reward')), h('div.kqn-qc-rlist', rewards)]) : null,
    ]),
  ]);
}

const CPS = 46;

/**
 * The advance hint's key: „E“ on desktop (the panel's own key, `onKey`: not the interact binding,
 * which is the mouse button in the world), the touch button's name in touch mode („Aktion“, via
 * `actionLabel`). `touch` says which (the desktop key sits in a kbd, the button name is a word).
 */
export function talkHintKey(input: ActionLabelInput | null): { label: string; touch: boolean } {
  if (!input?.touchMode) return { label: 'E', touch: false };
  return { label: actionLabel(input, 'interact'), touch: true };
}

export class ConversationView {
  private modal: ModalHandle | null = null;
  private readonly portrait = h('div.kqn-portrait');
  private readonly who = h('span.kqn-who');
  private readonly tag = h('span.kqn-tag');
  private readonly typed = h('span.kqn-typed');
  private readonly rest = h('span.kqn-rest');
  private readonly src = h('div.kqn-src');
  private readonly note = h('div.kqn-note', { 'data-testid': 'npc-note' });
  private readonly header = h('div.kqn-header', { 'data-testid': 'npc-header' });
  private readonly hint = h('div.kqn-next');
  /** The hint as last rendered (label + mode): rebuilt only when it changes. */
  private hintKey = '';
  private readonly topicsEl = h('div.kqn-topics');
  private readonly cardEl = h('div.kqn-card-slot.kqn-hidden');
  private queue: TalkLine[] = [];
  private cur: { line: TalkLine; typed: number; acc: number; starts: Set<number> } | null = null;
  private lastPortrait = '';
  private onDrained: (() => void) | null = null;
  private topics: TalkTopic[] = [];
  private pick: ((id: string) => void) | null = null;

  constructor(
    private readonly modals: ModalManager,
    private readonly voice: Voice | null,
    private readonly reducedMotion: () => boolean,
    /** The game's input (touch mode, bindings), read when the hint renders; null: always „E“. */
    private readonly input: ActionLabelInput | null = null,
  ) {
    this.renderHint();
  }

  /** „E weiter“, or „Aktion: weiter“ in touch mode (Touch-Steuerung can switch at runtime). */
  private renderHint(): void {
    const k = talkHintKey(this.input);
    const sig = `${k.touch ? 't' : 'k'}:${k.label}`;
    if (sig === this.hintKey) return;
    this.hintKey = sig;
    if (k.touch) this.hint.replaceChildren(`${k.label}: ${t('npc.next')}`);
    else this.hint.replaceChildren(h('kbd', k.label), ' ', t('npc.next'));
  }

  get open(): boolean {
    return !!this.modal && !this.modal.closed;
  }

  /** Lines still to show (including the current one). */
  get busy(): boolean {
    return !!this.cur || this.queue.length > 0;
  }

  get current(): TalkLine | null {
    return this.cur?.line ?? null;
  }

  show(title: string, onClose: () => void, speaker?: SpeakerMeta): void {
    ensurePortraitDefs();
    // a conversation that opens without a greeting must not show the last one's NPC and line
    // (playtest round 4: Peter's topics under Soll's name, portrait and „Drei Zettel …“)
    this.cur = null;
    this.queue.length = 0;
    this.typed.textContent = '';
    this.rest.textContent = '';
    this.src.textContent = '';
    this.note.textContent = '';
    this.note.classList.add('kqn-hidden');
    this.hint.classList.add('kqn-hidden');
    if (speaker) this.setSpeaker(speaker);
    const body = h('div.kqn-talk', { 'data-testid': 'npc-talk' }, [
      h('div.kqn-head', [this.portrait, h('div.kqn-names', [this.who, this.tag])]),
      h('div.kqn-text', { 'aria-live': 'polite' }, [this.typed, this.rest]),
      this.src,
      this.note,
      this.hint,
      this.header,
      this.cardEl,
      this.topicsEl,
    ]);
    body.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.advance();
    });
    this.modal = this.modals.open({ body, className: 'kqn-modal', onClose: () => {
      window.removeEventListener('keydown', this.onKey, true);
      this.modal = null;
      onClose();
    } });
    this.modal.el.setAttribute('aria-label', title);
    window.addEventListener('keydown', this.onKey, true);
  }

  close(): void {
    this.modal?.close();
  }

  private setSpeaker(m: SpeakerMeta): void {
    if (this.lastPortrait !== m.portrait + m.id) {
      this.lastPortrait = m.portrait + m.id;
      this.portrait.replaceChildren(svg(portraitSvg(m.portrait)));
    }
    this.portrait.dataset.speaker = m.id;
    this.who.textContent = m.name;
    this.tag.textContent = m.historical ? t('npc.tag.historical') : t('npc.tag.fiction');
    this.tag.className = `kqn-tag ${m.historical ? 'hist' : 'fic'}`;
  }

  /** Queue lines; `then` runs when the last one has been read (advanced past). */
  say(lines: TalkLine[], then?: () => void): void {
    this.queue.push(...lines);
    this.onDrained = then ?? null;
    this.setTopics([], null);
    this.setCard(null);
    if (!this.cur) this.next();
  }

  /** A quest card above the answers (offer / turn-in); null removes it. */
  setCard(card: HTMLElement | null): void {
    this.cardEl.replaceChildren(...(card ? [card] : []));
    this.cardEl.classList.toggle('kqn-hidden', !card);
    // the card stands in for the spoken line: the text above steps back
    this.modal?.el.classList.toggle('kqn-with-card', !!card);
  }

  /** `header`: a line above the answers. */
  setTopics(topics: TalkTopic[], pick: ((id: string) => void) | null, header?: string): void {
    this.topics = topics;
    this.pick = pick;
    this.header.textContent = header ?? '';
    this.header.classList.toggle('kqn-hidden', !header || topics.length === 0);
    this.topicsEl.replaceChildren(
      ...topics.map((tp, i) =>
        h(
          `button.kq-btn.kqn-topic${tp.asked ? '.kqn-asked' : ''}${tp.id === 'bye' ? '.kqn-bye' : ''}${tp.mark ? `.kqn-q.kqn-q-${tp.mark}` : ''}`,
          { 'data-testid': `npc-topic-${tp.id}`, onclick: () => this.choose(i) },
          [h('span.kqn-n', String(i + 1)), tp.mark ? h(`span.kqn-qg.kqn-qg-${tp.mark}`, { 'aria-hidden': 'true' }, MARK_GLYPH[tp.mark]) : null, tp.label],
        ),
      ),
    );
    this.topicsEl.classList.toggle('kqn-hidden', topics.length === 0);
    this.hint.classList.toggle('kqn-hidden', topics.length > 0 || !this.cur);
  }

  choose(i: number): boolean {
    const tp = this.topics[i];
    if (!tp || !this.pick || this.busy) return false;
    const fn = this.pick;
    fn(tp.id);
    return true;
  }

  chooseId(id: string): boolean {
    const i = this.topics.findIndex((x) => x.id === id);
    return i >= 0 && this.choose(i);
  }

  /** Finish typing, else go to the next line. */
  advance(): void {
    const c = this.cur;
    if (!c) return;
    if (c.typed < c.line.text.length) {
      c.typed = c.line.text.length;
      this.render();
    } else this.next();
  }

  finish(): void {
    if (this.cur) {
      this.cur.typed = this.cur.line.text.length;
      this.render();
    }
  }

  private next(): void {
    const line = this.queue.shift();
    if (!line) {
      this.cur = null;
      this.hint.classList.add('kqn-hidden');
      const fn = this.onDrained;
      this.onDrained = null;
      fn?.();
      return;
    }
    this.cur = { line, typed: this.reducedMotion() ? line.text.length : 0, acc: 0, starts: syllableStarts(line.text) };
    this.setSpeaker(line.speaker);
    this.src.textContent = line.source ? `${t('npc.source')}: ${line.source}` : '';
    this.note.textContent = line.note ?? '';
    this.note.classList.toggle('kqn-hidden', !line.note);
    this.typed.parentElement?.classList.toggle('kqn-history', !!line.history);
    this.hint.classList.remove('kqn-hidden');
    this.renderHint();
    this.render();
  }

  private render(): void {
    const c = this.cur;
    if (!c) return;
    this.typed.textContent = c.line.text.slice(0, c.typed);
    this.rest.textContent = c.line.text.slice(c.typed);
  }

  /** UI clock (real seconds). */
  tick(dt: number): void {
    if (this.open) this.renderHint();
    const c = this.cur;
    if (!c || c.typed >= c.line.text.length) return;
    const before = c.typed;
    c.acc += dt * CPS;
    const n = Math.floor(c.acc);
    c.acc -= n;
    c.typed = Math.min(c.line.text.length, c.typed + n);
    for (let i = before; i < c.typed; i++)
      if (c.starts.has(i)) {
        this.voice?.blip(c.line.speaker.voice, i === 0 ? 1 : 0);
        break;
      }
    this.render();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.open) return;
    // a card over the conversation (the quest reward card) takes the keys while it shows
    if (document.querySelector('[data-kq-keytrap]')) return;
    const tg = e.target as HTMLElement | null;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
    const d = /^(Digit|Numpad)(\d)$/.exec(e.code);
    if (d && !this.busy) {
      if (this.choose(Number(d[2]) - 1)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'KeyE') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this.busy) this.advance();
      else if (e.code === 'KeyE' || e.code === 'Enter') {
        // nothing to read: E / Enter on an empty menu says goodbye
        const bye = this.topics.findIndex((x) => x.id === 'bye');
        if (bye >= 0 && e.code === 'Enter') this.choose(bye);
      }
    }
  };
}
