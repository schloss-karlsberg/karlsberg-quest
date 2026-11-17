/**
 * Quest HUD pieces: the tracker (top-left column, `hud.stack(el, 35)`), objective ticks (right
 * edge, `hud.dock('feed', el, 20)`), the "Neue Aufgabe" banner and the reward card (an overlay
 * above the conversation panel). DOM only; the quests system feeds them.
 */
import { t } from '../../i18n';
import { h } from '../../ui/dom';
import type { Confidence } from '../../content/types';

export interface TrackerObjective {
  id: string;
  text: string;
  count: number;
  need: number;
  done: boolean;
  optional: boolean;
}

export interface TrackerQuest {
  id: string;
  title: string;
  main: boolean;
  ready: boolean;
  /** "Zurück zu Hanne" while ready. */
  readyText?: string;
  objectives: TrackerObjective[];
}

/** Milliseconds a done objective stays struck through before it folds away. */
export const DONE_LINGER_MS = 2600;

/**
 * Up to three tracked quests, main first; counters; a soft pulse on progress (never a flash).
 * A goal that is done is struck through, then folds away (playtest round 4: the tracker shows what
 * is left, not a list of ticks); a quest whose every goal is done keeps its title line.
 */
export class Tracker {
  readonly el = h('div.kqq-tracker', { 'data-testid': 'quest-tracker', 'aria-live': 'polite' });
  private last = '';
  private list: TrackerQuest[] = [];
  /** quest/objective → when it was first seen done (ms, performance clock). */
  private readonly doneAt = new Map<string, number>();
  private first = true;
  /** Next time a struck-through line folds away (ms), or Infinity. */
  private nextFold = Infinity;

  render(list: TrackerQuest[]): void {
    this.list = list;
    this.draw();
  }

  /** Per frame: fold away the lines whose linger ran out. */
  tick(now = performance.now()): void {
    if (now >= this.nextFold) this.draw(now);
  }

  private draw(now = performance.now()): void {
    const list = this.list;
    this.nextFold = Infinity;
    const shown = list.map((q) => ({
      ...q,
      objectives: q.objectives.flatMap((o) => {
        if (!o.done) return [{ ...o, fold: -1 }];
        const k = `${q.id}/${o.id}`;
        // after a load the goals done before are simply gone
        if (!this.doneAt.has(k)) this.doneAt.set(k, this.first ? -Infinity : now);
        const age = now - this.doneAt.get(k)!;
        if (age >= DONE_LINGER_MS) return [];
        this.nextFold = Math.min(this.nextFold, this.doneAt.get(k)! + DONE_LINGER_MS);
        return [{ ...o, fold: Math.round(DONE_LINGER_MS - age) }];
      }),
    }));
    this.first = false;
    const key = JSON.stringify(shown.map((q) => ({ ...q, objectives: q.objectives.map((o) => ({ ...o, fold: o.fold >= 0 })) })));
    if (key === this.last) return;
    this.last = key;
    this.el.classList.toggle('kqq-empty', list.length === 0);
    this.el.replaceChildren(
      ...shown.map((q) =>
        h(`div.kqq-tq${q.main ? '.kqq-main' : ''}${q.ready ? '.kqq-ready' : ''}`, { dataset: { quest: q.id } }, [
          h('div.kqq-tq-title', [h('span.kqq-glyph', { 'aria-hidden': 'true' }, q.ready ? '?' : q.main ? '◆' : '◇'), q.title]),
          ...(q.ready && q.readyText ? [h('div.kqq-to.kqq-turnin', [h('span.kqq-box', '?'), q.readyText])] : []),
          ...q.objectives.map((o) => {
            const row = h(
              `div.kqq-to${o.done ? '.kqq-done.kqq-folding' : ''}${o.optional ? '.kqq-opt' : ''}`,
              { dataset: { obj: o.id } },
              [h('span.kqq-box', { 'aria-hidden': 'true' }, o.done ? '✓' : ''), h('span.kqq-tt', o.text), o.need > 1 ? h('span.kqq-n', ` ${o.count}/${o.need}`) : null],
            );
            // the fold starts where this line's linger ends (a re-render keeps the timing)
            if (o.fold >= 0) row.style.setProperty('--kqq-fold-in', `${Math.max(0, o.fold - 700)}ms`);
            return row;
          }),
        ]),
      ),
    );
  }

  /** Pulse one objective line (progress). */
  pulse(quest: string, obj: string): void {
    const row = this.el.querySelector<HTMLElement>(`[data-quest="${CSS.escape(quest)}"] [data-obj="${CSS.escape(obj)}"]`);
    if (!row) return;
    row.classList.remove('kqq-pulse');
    void row.offsetWidth;
    row.classList.add('kqq-pulse');
  }
}

/** Right-edge ticks: "✓ Mahnbriefe zerreißen", "Mahnbriefe 2/3". */
export class Feed {
  readonly el = h('div.kqq-feed', { 'data-testid': 'quest-feed' });

  push(text: string, kind: 'tick' | 'done' | 'ready' | 'new' = 'tick', ms = 3600): void {
    const row = h(`div.kqq-fi.kqq-fi-${kind}`, [h('span.kqq-fi-mark', { 'aria-hidden': 'true' }, kind === 'done' ? '✓' : kind === 'ready' ? '?' : kind === 'new' ? '!' : '·'), text]);
    this.el.append(row);
    while (this.el.childElementCount > 4) this.el.firstElementChild?.remove();
    setTimeout(() => row.classList.add('kqq-out'), ms);
    setTimeout(() => row.remove(), ms + 600);
  }
}

/** "Neue Aufgabe — <title>" (+ the first step and the reward): an ink stamp that settles and fades (UI time). */
export function showBanner(layer: HTMLElement, kicker: string, title: string, main: boolean, sub = ''): void {
  layer.querySelector('.kqq-banner')?.remove();
  const el = h(`div.kqq-banner${main ? '.kqq-main' : ''}`, { 'data-testid': 'quest-banner', role: 'status' }, [
    h('div.kqq-b-kick', kicker),
    h('div.kqq-b-title', title),
    h('div.kqq-b-rule'),
    sub ? h('div.kqq-b-sub', sub) : null,
  ]);
  layer.append(el);
  setTimeout(() => el.classList.add('kqq-out'), sub ? 3400 : 2600);
  setTimeout(() => el.remove(), sub ? 4200 : 3400);
}

export interface RewardView {
  title: string;
  xp: number;
  quiet: boolean;
  items: { name: string; count: number }[];
  codex: { id: string; title: string; confidence: Confidence; label: string }[];
  skills: string[];
  /** "Mehr im Feldbuch (J)": history kept for the journal (voice turn-ins). */
  more?: string;
}

/** The bit of the card director (src/ui/cards.ts) the reward card needs. */
export interface CardSlot {
  claim(token: string): boolean;
  release(token: string): void;
  readonly held: boolean;
}

/** Seconds a reward card stays at most; metres you walk away before it goes by itself. */
export const REWARD_SECONDS = 5;
export const REWARD_WALK_AWAY = 4.5;

/**
 * The reward card: "Aufgabe erfüllt", the XP stamp, items, "Neu im Codex: …" with the confidence
 * badge. One centre card at a time (playtest round 4): it waits for the card director's slot — not
 * over a conversation (the turn-in card already showed what you get), not in a fight — and goes by
 * itself after five seconds or as soon as you walk away from where it came up; a click takes it
 * away at once. Payouts that arrive together wait in a short queue.
 */
export class RewardCard {
  private el: HTMLElement | null = null;
  private timer = 0;
  private shown = 0;
  private onDone: (() => void) | null = null;
  private readonly waiting: { v: RewardView; onDone?: () => void }[] = [];
  private anchor: { x: number; z: number } | null = null;

  constructor(
    private readonly layer: HTMLElement,
    private readonly slot: CardSlot | null = null,
  ) {}

  get open(): boolean {
    return !!this.el;
  }

  /** Cards waiting for the slot (tests). */
  get pending(): number {
    return this.waiting.length;
  }

  /** Queue a card; it shows when the director gives it the slot (or at once without a director). */
  push(v: RewardView, onDone?: () => void): void {
    this.waiting.push({ v, onDone });
    if (!this.slot && !this.el) this.next();
  }

  private next(): void {
    const w = this.waiting.shift();
    if (w) this.show(w.v, false, w.onDone);
  }

  /** `keys`: E / Enter / Space dismiss it (only over a conversation; in play those keys are the player's). */
  show(v: RewardView, keys = false, onDone?: () => void): void {
    this.close();
    this.onDone = onDone ?? null;
    this.anchor = null;
    this.shown = 0;
    const badge = (c: Confidence) => h('span.kqq-conf', { dataset: { c }, title: t(`journal.codex.${c}`), 'aria-label': `${c}: ${t(`journal.codex.${c}`)}` }, c);
    this.el = h(`div.kqq-reward.kq-paper${v.quiet ? '.kqq-quiet' : ''}`, { 'data-testid': 'quest-reward', role: 'dialog', 'aria-label': t('quest.done') }, [
      h('div.kqq-r-kick', t('quest.done')),
      h('div.kqq-r-title', v.title),
      v.xp > 0 && !v.quiet ? h('div.kqq-r-xp', { 'data-testid': 'quest-reward-xp' }, [h('span', t('quest.xp', { n: v.xp }))]) : null,
      v.items.length
        ? h('div.kqq-r-row', [h('span.kqq-r-lbl', t('quest.items')), h('div.kqq-r-items', v.items.map((i) => h('span.kqq-r-item', `${i.count > 1 ? `${i.count}× ` : ''}${i.name}`)))])
        : null,
      v.skills.length ? h('div.kqq-r-row', [h('span.kqq-r-lbl', t('quest.skill')), h('div.kqq-r-items', v.skills.map((s) => h('span.kqq-r-item', s)))]) : null,
      v.codex.length
        ? h('div.kqq-r-row.kqq-r-codex', { 'data-testid': 'quest-reward-codex' }, [
            h('span.kqq-r-lbl', t('quest.codexNew')),
            h('div.kqq-r-items', v.codex.map((c) => h('span.kqq-r-card', { dataset: { fact: c.id } }, [badge(c.confidence), h('span', c.title), h('span.kqq-lab', { dataset: { l: c.label } }, t(`journal.codex.label.${c.label}`))]))),
          ])
        : null,
      v.more ? h('div.kqq-r-more', v.more) : null,
      // E only dismisses it over a conversation; in open play E is the interact key
      h('div.kqq-r-next', keys ? [h('kbd', 'E'), ` ${t('quest.continue')}`] : [t('quest.continueClick')]),
    ]);
    this.el.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.close();
    });
    this.layer.append(this.el);
    this.layer.classList.remove('kq-hidden');
    if (keys) {
      // the conversation panel leaves its keys to the card while it shows (data-kq-keytrap)
      this.el.dataset.kqKeytrap = '1';
      window.addEventListener('keydown', this.onKey, true);
    }
    this.timer = REWARD_SECONDS;
  }

  /** UI clock (real seconds). `at`: the player's position (walking away dismisses the card). */
  tick(dt: number, at?: { x: number; z: number }): void {
    if (!this.el) {
      if (this.waiting.length && (!this.slot || this.slot.claim('reward'))) this.next();
      return;
    }
    // a fight or a conversation came up: the card steps aside, its clock stops
    const held = !!this.slot?.held;
    this.el.classList.toggle('kqq-held', held);
    if (held) return;
    // a modal other than the conversation, or a story choice, holds the card back (CSS hides it)
    if (typeof document !== 'undefined' && document.querySelector('.kq-modal:not(.kqn-modal), .kqs-choice-card.kqs-show')) return;
    this.shown += dt;
    if (at) {
      if (!this.anchor) this.anchor = { x: at.x, z: at.z };
      else if (this.shown > 1.2 && Math.hypot(at.x - this.anchor.x, at.z - this.anchor.z) > REWARD_WALK_AWAY) {
        this.close();
        return;
      }
    }
    this.timer -= dt;
    if (this.timer <= 0) this.close();
  }

  close(): void {
    if (!this.el) return;
    window.removeEventListener('keydown', this.onKey, true);
    const el = this.el;
    delete el.dataset.kqKeytrap;
    this.el = null;
    el.classList.add('kqq-out');
    setTimeout(() => el.remove(), 350);
    this.slot?.release('reward');
    const fn = this.onDone;
    this.onDone = null;
    fn?.();
  }

  /** Drop everything (a new game, a load). */
  clear(): void {
    this.waiting.length = 0;
    this.close();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.close();
    }
  };
}
