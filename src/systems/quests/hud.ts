/**
 * Quest HUD pieces: the tracker (top-left column, `hud.stack(el, 35)`), objective ticks (right
 * edge, `hud.dock('feed', el, 20)`), the "Neue Aufgabe" banner and the compact payout notice.
 * The quests system feeds them.
 */
import { t } from '../../i18n';
import { h } from '../../ui/dom';
import type { CardDirector } from '../../ui/cards';

export interface TrackerObjective {
  id: string;
  text: string;
  count: number;
  need: number;
  done: boolean;
  optional: boolean;
  /** The goal the compass and the waymark lead to (a marker on the line). */
  lead?: boolean;
  /** Distance to it ("120 m"), on the lead line. */
  dist?: string;
}

export interface TrackerQuest {
  id: string;
  title: string;
  main: boolean;
  /** A main quest on offer (no main quest runs): the next main step, waiting at its giver. */
  offer?: boolean;
  ready: boolean;
  /** "Zurück zu Hanne" while ready. */
  readyText?: string;
  objectives: TrackerObjective[];
  /** "Tipp: …" after a stall (quests wayfinding). */
  hint?: string;
  /** The player stands in one of its goal zones: in a fight this quest's line stays up. */
  here?: boolean;
  /**
   * The step before the goal, when the lead goal is somewhere else right now (another era, the
   * story's „Q am Ehrenhof“): shown under the objective with an arrow (playtest round 7: knocked
   * back into the present, the tracker still said „Mahnbriefe im Küchenhof zerreißen, 60 m“).
   */
  via?: string;
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
        h(`div.kqq-tq${q.main ? '.kqq-main' : ''}${q.offer ? '.kqq-offer' : ''}${q.ready ? '.kqq-ready' : ''}${q.here ? '.kqq-here' : ''}`, { dataset: { quest: q.id } }, [
          h('div.kqq-tq-title', [h('span.kqq-glyph', { 'aria-hidden': 'true' }, q.ready ? '?' : q.offer ? '!' : q.main ? '◆' : '◇'), q.title]),
          ...(q.ready && q.readyText ? [h('div.kqq-to.kqq-turnin', [h('span.kqq-box', '?'), q.readyText])] : []),
          ...q.objectives.map((o) => {
            const row = h(
              `div.kqq-to${o.done ? '.kqq-done.kqq-folding' : ''}${o.optional ? '.kqq-opt' : ''}${o.lead && !o.done ? '.kqq-lead' : ''}`,
              { dataset: { obj: o.id } },
              [
                h('span.kqq-box', { 'aria-hidden': 'true' }, o.done ? '✓' : ''),
                h('span.kqq-tt', o.text),
                o.need > 1 ? h('span.kqq-n', ` ${o.count}/${o.need}`) : null,
                o.lead && o.dist && !o.done ? h('span.kqq-dist', { 'data-testid': 'quest-dist' }, o.dist) : null,
              ],
            );
            // the fold starts where this line's linger ends (a re-render keeps the timing)
            if (o.fold >= 0) row.style.setProperty('--kqq-fold-in', `${Math.max(0, o.fold - 700)}ms`);
            return row;
          }),
          q.via ? h('div.kqq-to.kqq-via.kqq-lead', { 'data-testid': 'quest-via' }, [h('span.kqq-box', { 'aria-hidden': 'true' }, '→'), h('span.kqq-tt', q.via)]) : null,
          q.hint ? h('div.kqq-hint', { 'data-testid': 'quest-hint' }, [h('span.kqq-hint-k', t('quest.hint')), ` ${q.hint}`]) : null,
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
  items: { name: string; count: number }[];
  codex: number;
  skills: string[];
  /** Point to the field book for newly unlocked facts or extra turn-in history. */
  more: boolean;
}

/** Seconds the payout stays; metres you walk away before it goes by itself. */
const REWARD_SECONDS = 5;
const REWARD_WALK_AWAY = 4.5;

export class RewardNotice {
  private el: HTMLElement | null = null;
  private shown = 0;
  private readonly waiting: RewardView[] = [];
  private anchor: { x: number; z: number } | null = null;

  constructor(
    private readonly dock: HTMLElement,
    private readonly cards: CardDirector,
  ) {}

  get open(): boolean {
    return !!this.el;
  }

  get pending(): number {
    return this.waiting.length;
  }

  push(view: RewardView): void {
    this.waiting.push(view);
  }

  private show(view: RewardView, at: { x: number; z: number }): void {
    this.anchor = { x: at.x, z: at.z };
    this.shown = 0;
    const gains = [...view.items.map(({ name, count }) => count > 1 ? `${count}× ${name}` : name), ...view.skills];
    this.el = h('div.kqq-reward.kq-notice', { 'data-testid': 'quest-reward', role: 'status' }, [
      h('div.kqq-r-kick', t('quest.done')),
      h('strong.kqq-r-title', view.title),
      view.xp > 0 ? h('div.kqq-r-xp', { 'data-testid': 'quest-reward-xp' }, t('quest.xp', { n: view.xp })) : null,
      gains.length ? h('div.kqq-r-gains', gains.join(' · ')) : null,
      view.codex ? h('div.kqq-r-codex', { 'data-testid': 'quest-reward-codex' }, t('quest.codexNew', { n: view.codex })) : null,
      view.more ? h('div.kqq-r-more', t('quest.moreJournal')) : null,
    ]);
    this.dock.append(this.el);
  }

  /** Count only visible time. Walking away can dismiss after a moment to read. */
  tick(dt: number, at: { x: number; z: number }): void {
    if (!this.el) {
      if (this.waiting.length && this.cards.claim('reward', this.close)) this.show(this.waiting.shift()!, at);
      return;
    }
    const held = this.cards.held;
    this.el.hidden = held;
    if (held) return;
    this.shown += dt;
    const anchor = this.anchor!;
    if (this.shown >= REWARD_SECONDS || (this.shown > 1.2 && Math.hypot(at.x - anchor.x, at.z - anchor.z) > REWARD_WALK_AWAY)) {
      this.close();
    }
  }

  private readonly close = (): void => {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    this.cards.release('reward');
  };

  /** Drop everything (a new game, a load). */
  clear(): void {
    this.waiting.length = 0;
    this.close();
  }
}
