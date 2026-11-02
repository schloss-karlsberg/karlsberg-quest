/**
 * The conversation panel: a field-book page at the bottom of the screen (the ghost stays visible
 * above it). The spoken line types out with the speaker's voice murmur; below it the questions
 * (keys 1–n, click) and "Auf Wiedersehen". Enter / Space / E / click advance. Every line carries
 * its label: "erfunden" (fiction) or "historisch" with a source.
 * Typing runs on the UI clock (`tick(realDt)` from the npc system's frame: the game is paused
 * under the modal); `finish()` completes it at once (tests, screenshots).
 */
import { t } from '../../i18n';
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
}

export interface TalkTopic {
  id: string;
  label: string;
  asked: boolean;
}

const CPS = 46;

export class ConversationView {
  private modal: ModalHandle | null = null;
  private readonly portrait = h('div.kqn-portrait');
  private readonly who = h('span.kqn-who');
  private readonly tag = h('span.kqn-tag');
  private readonly typed = h('span.kqn-typed');
  private readonly rest = h('span.kqn-rest');
  private readonly src = h('div.kqn-src');
  private readonly hint = h('div.kqn-next', [h('kbd', 'E'), ' ', t('npc.next')]);
  private readonly topicsEl = h('div.kqn-topics');
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
  ) {}

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

  show(title: string, onClose: () => void): void {
    ensurePortraitDefs();
    const body = h('div.kqn-talk', { 'data-testid': 'npc-talk' }, [
      h('div.kqn-head', [this.portrait, h('div.kqn-names', [this.who, this.tag])]),
      h('div.kqn-text', { 'aria-live': 'polite' }, [this.typed, this.rest]),
      this.src,
      this.hint,
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

  /** Queue lines; `then` runs when the last one has been read (advanced past). */
  say(lines: TalkLine[], then?: () => void): void {
    this.queue.push(...lines);
    this.onDrained = then ?? null;
    this.setTopics([], null);
    if (!this.cur) this.next();
  }

  setTopics(topics: TalkTopic[], pick: ((id: string) => void) | null): void {
    this.topics = topics;
    this.pick = pick;
    this.topicsEl.replaceChildren(
      ...topics.map((tp, i) =>
        h(`button.kq-btn.kqn-topic${tp.asked ? '.kqn-asked' : ''}${tp.id === 'bye' ? '.kqn-bye' : ''}`, { 'data-testid': `npc-topic-${tp.id}`, onclick: () => this.choose(i) }, [h('span.kqn-n', String(i + 1)), tp.label]),
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
    const m = line.speaker;
    if (this.lastPortrait !== m.portrait + m.id) {
      this.lastPortrait = m.portrait + m.id;
      this.portrait.replaceChildren(svg(portraitSvg(m.portrait)));
    }
    this.portrait.dataset.speaker = m.id;
    this.who.textContent = m.name;
    this.tag.textContent = m.historical ? t('npc.tag.historical') : t('npc.tag.fiction');
    this.tag.className = `kqn-tag ${m.historical ? 'hist' : 'fic'}`;
    this.src.textContent = line.source ? `${t('npc.source')}: ${line.source}` : '';
    this.hint.classList.remove('kqn-hidden');
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
