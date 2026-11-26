/**
 * Dialogue presenter: a queue of spoken lines shown as a field-book card with an etched portrait,
 * a typing effect and a voice: the line's recorded clip when one is ready (./voiceClips.ts; the
 * typing then paces itself to the clip), else the procedural murmur. Subtitles always show.
 * Enter / click / tap skips (finish typing → next line); skipping or advancing stops the clip.
 * The hint under the line reads „Enter weiter“, in touch mode „Tippen: weiter“ (read per line).
 * Driven by `update(dt)` from the system's fixed update (game time: stops while the game is
 * paused, and headless `kq.step` advances it deterministically).
 */
import { fillText } from '../../../content/triggers';
import { h, svg } from '../../../ui/dom';
import { t } from '../../../i18n';
import { ensurePortraitDefs, portraitSvg } from './portraits';
import type { SpeakerMeta } from './speakers';
import { LineQueue, type QueuedLine } from './queue';
import { type Voice, type VoiceClip, syllableStarts } from './voice';
import type { ClipProvider } from './voiceClips';

export { LORE_TTL, LOW_TTL, MAX_QUEUE, NORMAL_TTL, STALE_GRACE } from './queue';

export interface DialogueItem extends QueuedLine {
  id?: string;
  speaker: string;
  text: string;
  ms?: number;
  /** Explicit fiction label (default from the speaker). */
  fiction?: boolean;
  /** Source label for historical quotes. */
  source?: string;
  /** The viewfinder stays down until the line finishes. */
  phoneDown?: boolean;
  /** The place the line is about: skipped if the player is far from it when its turn comes. */
  where?: { x: number; z: number; r: number } | null;
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
  /** Characters per second (the clip's pace when one plays). */
  rate: number;
  /** The recorded clip of this line (null: murmur). */
  clip: VoiceClip | null;
  /** Clip length (s) and the game time the line has been up. */
  clipS: number;
  age: number;
}

/** Recorded-voice counters (tests / debug). */
export interface PresenterVoiceStats {
  /** Lines that started a clip. */
  clips: number;
  /** Lines that murmured. */
  murmured: number;
  /** The id of the line whose clip played last. */
  lastClip: string | null;
}

export interface PresenterOptions {
  layer: HTMLElement;
  meta: (speaker: string) => SpeakerMeta;
  voice: Voice | null;
  /** Recorded clips (none: murmur only). */
  clips?: ClipProvider | null;
  reducedMotion: () => boolean;
  /** Player name for {Name}. */
  name: () => string;
  /** Called when a line starts showing. */
  onShow?: (item: DialogueItem) => void;
  /** Is a queued line still worth saying (place, era …)? Checked when its turn comes. */
  valid?: (item: DialogueItem) => boolean;
  /** Must this line wait now (lore while a fight is on)? It stays queued; later lines go first. */
  held?: (item: DialogueItem) => boolean;
  /** Touch mode now (Settings → Touch-Steuerung can switch it at runtime): the hint says „Tippen“. */
  touch?: () => boolean;
}

const CHARS_PER_S = 42;
/** The breath a mid-line „…“ takes (s). */
const PAUSE_S = 0.6;

/** Placeholders: {Name}/{name}, {jahre:1793}, {jahr} (see content/triggers.ts fillText). */
export function substituteName(text: string, name: string, year: number | null = new Date().getFullYear()): string {
  return fillText(text, { name, year, fallbackName: t('story.name.default') });
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
  private readonly skipEl: HTMLElement;
  private skipTouch: boolean | null = null;
  /** Waiting lines (cap, stale and place rules: ./queue.ts). */
  private readonly queue: LineQueue<DialogueItem>;
  private readonly interruptedGroups = new Set<number>();
  private cur: Active | null = null;
  private hideTimer = 0;
  private mouthTimer = 0;
  private lastPortrait = '';
  private prune = 0;
  private paused = false;
  private suspended = false;
  readonly voiceStats: PresenterVoiceStats = { clips: 0, murmured: 0, lastClip: null };
  constructor(private readonly o: PresenterOptions) {
    this.queue = new LineQueue<DialogueItem>((group) => this.cur?.item.group === group || this.interruptedGroups.has(group), o.valid);
    ensurePortraitDefs();
    this.portraitEl = h('div.kqs-portrait');
    this.whoEl = h('span.kqs-who');
    this.tagEl = h('span.kqs-tag');
    this.typedEl = h('span.kqs-typed');
    this.restEl = h('span.kqs-rest');
    this.srcEl = h('span.kqs-src');
    this.skipEl = h('span.kqs-skip');
    this.skipHint();
    this.el = h('div.kqs-dlg', { 'data-testid': 'dialogue', role: 'status' }, [
      this.portraitEl,
      h('div.kqs-dlg-body', [
        h('div.kqs-dlg-head', [this.whoEl, this.tagEl]),
        h('div.kqs-dlg-text', { 'aria-live': 'polite' }, [this.typedEl, this.restEl]),
        h('div.kqs-dlg-foot', [this.srcEl, this.skipEl]),
      ]),
    ]);
    // a click, and on a phone a tap (its compatibility mousedown), advances
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

  get needsPhoneDown(): boolean {
    return this.cur?.item.phoneDown === true || this.queue.some((item) => item.phoneDown === true);
  }

  hasLine(id: string, beat: string | null): boolean {
    const matches = (item: DialogueItem) => item.id === id && item.beat === beat;
    return (this.cur !== null && matches(this.cur.item)) || this.queue.some(matches);
  }

  /** Lines dropped as stale, invalid or over the cap (tests / debug). */
  get dropped(): number {
    return this.queue.dropped;
  }

  /** Is the current line's clip audible right now? */
  get clipPlaying(): boolean {
    return !!this.cur?.clip?.playing;
  }

  enqueue(item: DialogueItem): void {
    // while the viewfinder suspends the presenter, a 'now' line only queues (it plays on resume)
    const canInterrupt = !this.suspended && item.priority === 'now' && this.cur?.item.priority !== 'now' && !this.o.held?.(item);
    const interrupt = this.queue.push(item, canInterrupt);
    // the clip is hashed over the raw template ({Name} …); the displayed text is tried too
    if (this.o.clips) this.o.clips.preload([{ id: item.id, text: [item.text, substituteName(item.text, this.o.name())], speaker: this.o.meta(item.speaker).id }]);
    if (this.suspended) return;
    if (interrupt) this.next(interrupt);
    else if (!this.cur || (canInterrupt && this.queue.urgent)) this.next();
  }

  /** A beat began: waiting lines of other beats retire (./queue.ts). */
  retireBeat(beat: string): void {
    this.queue.retireBeat(beat);
  }

  clear(): void {
    this.queue.clear();
    this.interruptedGroups.clear();
    this.stopClip();
    this.cur = null;
    this.el.classList.remove('kqs-show', 'kqs-speaking');
  }

  /** Finish typing, or advance to the next line. */
  skip(): void {
    if (this.suspended || !this.cur) return;
    this.stopClip();
    if (this.cur.typed < this.cur.text.length) {
      this.cur.typed = this.cur.text.length;
      this.render();
    } else this.next();
  }

  /**
   * The game is paused (pause menu, an echo holding the presenter): the clip pauses with the
   * typing and resumes where it stopped. A suspended audio context (hidden tab) freezes it anyway.
   */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.syncClip();
  }

  /** The viewfinder hides the presenter. Freeze the current line and leave new lines queued. */
  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    this.syncClip();
  }

  private syncClip(): void {
    const clip = this.cur?.clip;
    if (!clip || clip.done) return;
    if (this.paused || this.suspended) clip.pause();
    else if (!clip.playing) clip.start(); // no-op until the context runs again
  }

  private stopClip(): void {
    this.cur?.clip?.stop();
  }

  /** Complete the current line instantly (tests / screenshots). */
  finishTyping(): void {
    if (this.cur) {
      this.cur.typed = this.cur.text.length;
      this.render();
    }
  }

  private next(interrupt?: DialogueItem): void {
    this.stopClip();
    const item = interrupt ?? this.queue.take(this.o.held);
    const previous = this.cur?.item;
    if (item?.priority === 'now' && previous?.priority !== 'now' && previous?.group !== undefined) {
      this.interruptedGroups.add(previous.group);
    }
    if (item?.group !== undefined) this.interruptedGroups.delete(item.group);
    if (item?.priority !== 'now') {
      for (const group of this.interruptedGroups) {
        if (!this.queue.some((q) => q.group === group)) this.interruptedGroups.delete(group);
      }
    }
    if (!item) {
      this.cur = null;
      this.el.classList.remove('kqs-speaking');
      this.hideTimer = 0.35;
      return;
    }
    const meta = this.o.meta(item.speaker);
    const text = substituteName(item.text, this.o.name());
    this.cur = { item, meta, text, typed: this.o.reducedMotion() ? text.length : 0, hold: holdSeconds(text, item.ms), shownFor: 0, starts: syllableStarts(text), acc: 0, rate: CHARS_PER_S, clip: null, clipS: 0, age: 0 };
    // a recorded clip when it is decoded and the context runs (never waits for one)
    const ready = this.paused ? null : (this.o.clips?.take(item.id, [item.text, text], meta.id) ?? null);
    const clip = ready && this.o.voice ? this.o.voice.playClip(ready.buffer, meta.voice) : null;
    if (clip && ready) {
      this.cur.clip = clip;
      this.cur.clipS = ready.seconds;
      // the reveal ends about when the voice does
      this.cur.rate = Math.max(4, text.length / Math.max(0.3, ready.seconds));
      this.voiceStats.clips++;
      this.voiceStats.lastClip = ready.id;
    } else this.voiceStats.murmured++;
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
    this.skipHint();
    this.render();
    this.o.onShow?.(item);
  }

  /** „Enter weiter“, or „Tippen: weiter“ in touch mode (rebuilt only when the mode changed). */
  private skipHint(): void {
    const touch = this.o.touch?.() === true;
    if (touch === this.skipTouch) return;
    this.skipTouch = touch;
    if (touch) this.skipEl.replaceChildren(t('story.dialogue.tap'));
    else this.skipEl.replaceChildren(h('kbd', 'Enter'), ` ${t('story.dialogue.next')}`);
  }

  private render(): void {
    const c = this.cur;
    if (!c) return;
    this.typedEl.textContent = c.text.slice(0, c.typed);
    this.restEl.textContent = c.text.slice(c.typed);
    this.el.classList.toggle('kqs-speaking', c.typed < c.text.length);
  }

  /** Advance typing / hold (seconds of game time). */
  update(dt: number): void {
    if (this.suspended) return;
    this.queue.tick(dt);
    this.prune += dt;
    if (this.prune >= 0.25) {
      this.prune = 0;
      this.queue.prune();
      // a history line that a fight (or a boss's reveal) now holds steps back and plays again after
      // it (playtest round 5: the Baumagazin lecture sat over four Steinfresser)
      const h = this.cur;
      if (h && h.item.lore && this.o.held?.(h.item)) {
        this.stopClip();
        this.queue.unshift(h.item);
        this.cur = null;
        this.el.classList.remove('kqs-speaking');
        this.hideTimer = 0.2;
        return;
      }
      // the line on screen lost its moment: let it go soon
      const c = this.cur;
      if (c && c.item.expired?.()) {
        c.typed = c.text.length;
        c.hold = Math.min(c.hold, c.shownFor + 0.8);
        this.render();
      }
    }
    if (this.mouthTimer > 0) {
      this.mouthTimer -= dt;
      if (this.mouthTimer <= 0) this.portraitEl.classList.remove('kqs-m');
    }
    // a line held back (lore in a fight) may play once the fight is over
    if (!this.cur && this.queue.length > 0 && (!this.o.held || this.queue.heldCount(this.o.held) < this.queue.length)) {
      this.next();
      if (this.cur) return;
    }
    if (!this.cur) {
      if (this.hideTimer > 0) {
        this.hideTimer -= dt;
        if (this.hideTimer <= 0) this.el.classList.remove('kqs-show');
      }
      return;
    }
    const c = this.cur;
    c.age += dt;
    // the clip ended before the typing did (a slow frame, a hitch): the words are all said
    if (c.clip?.done && c.typed < c.text.length) {
      c.typed = c.text.length;
      this.render();
    }
    if (c.typed < c.text.length) {
      const before = c.typed;
      c.acc += dt * c.rate;
      const n = Math.max(0, Math.floor(c.acc));
      c.acc -= n;
      c.typed = Math.min(c.text.length, c.typed + n);
      // a pause in the line („…“ mid-sentence): the typing stops for a breath (playtest round 5:
      // no „(Pause.)“ written into a subtitle any more)
      const dots = c.text.indexOf('…', before);
      if (!c.clip && dots >= 0 && dots < c.typed && dots > 0 && dots < c.text.length - 1) {
        c.typed = dots + 1;
        c.acc = -PAUSE_S * CHARS_PER_S;
      }
      for (let i = before; i < c.typed; i++) {
        if (c.starts.has(i)) {
          const prev = c.text[i - 1];
          const stress = i === 0 || prev === undefined || /[.!?]\s*$/.test(c.text.slice(Math.max(0, i - 3), i)) ? 1 : /[A-ZÄÖÜ]/.test(c.text[i]!) ? 0.5 : 0;
          if (!c.clip) this.o.voice?.blip(c.meta.voice, stress);
          this.portraitEl.classList.add('kqs-m');
          this.mouthTimer = 0.085;
          break;
        }
      }
      this.render();
      return;
    }
    c.shownFor += dt;
    // lines waiting behind this one: read a little faster (the queue must not lag behind play)
    const hold = this.queue.length >= 2 ? Math.max(1.6, c.hold * 0.7) : c.hold;
    // a clip still speaking keeps its line up (bounded: a stalled context never pins it)
    const speaking = !!c.clip?.playing && c.age < c.clipS + 1;
    if (c.shownFor >= hold && !speaking) this.next();
  }
}
