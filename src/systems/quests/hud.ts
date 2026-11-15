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

/** Up to three tracked quests, main first; counters; a soft pulse on progress (never a flash). */
export class Tracker {
  readonly el = h('div.kqq-tracker', { 'data-testid': 'quest-tracker', 'aria-live': 'polite' });
  private last = '';

  render(list: TrackerQuest[]): void {
    const key = JSON.stringify(list);
    if (key === this.last) return;
    this.last = key;
    this.el.classList.toggle('kqq-empty', list.length === 0);
    this.el.replaceChildren(
      ...list.map((q) =>
        h(`div.kqq-tq${q.main ? '.kqq-main' : ''}${q.ready ? '.kqq-ready' : ''}`, { dataset: { quest: q.id } }, [
          h('div.kqq-tq-title', [h('span.kqq-glyph', { 'aria-hidden': 'true' }, q.ready ? '?' : q.main ? '◆' : '◇'), q.title]),
          ...(q.ready && q.readyText ? [h('div.kqq-to.kqq-turnin', [h('span.kqq-box', '?'), q.readyText])] : []),
          ...q.objectives.map((o) =>
            h(
              `div.kqq-to${o.done ? '.kqq-done' : ''}${o.optional ? '.kqq-opt' : ''}`,
              { dataset: { obj: o.id } },
              [h('span.kqq-box', { 'aria-hidden': 'true' }, o.done ? '✓' : ''), h('span.kqq-tt', o.text), o.need > 1 ? h('span.kqq-n', ` ${o.count}/${o.need}`) : null],
            ),
          ),
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

/** "Neue Aufgabe — <title>": an ink stamp that settles and fades (UI time). */
export function showBanner(layer: HTMLElement, kicker: string, title: string, main: boolean): void {
  layer.querySelector('.kqq-banner')?.remove();
  const el = h(`div.kqq-banner${main ? '.kqq-main' : ''}`, { 'data-testid': 'quest-banner', role: 'status' }, [h('div.kqq-b-kick', kicker), h('div.kqq-b-title', title), h('div.kqq-b-rule')]);
  layer.append(el);
  setTimeout(() => el.classList.add('kqq-out'), 2600);
  setTimeout(() => el.remove(), 3400);
}

export interface RewardView {
  title: string;
  xp: number;
  quiet: boolean;
  items: { name: string; count: number }[];
  codex: { id: string; title: string; confidence: Confidence; label: string }[];
  skills: string[];
}

/**
 * The reward card: "Aufgabe erfüllt", the XP stamp, items, "Neu im Codex: …" with the confidence
 * badge. Above the conversation panel; click / E / Enter / Space or 6 s dismiss it.
 */
export class RewardCard {
  private el: HTMLElement | null = null;
  private timer = 0;
  private onDone: (() => void) | null = null;

  constructor(private readonly layer: HTMLElement) {}

  get open(): boolean {
    return !!this.el;
  }

  /** `keys`: E / Enter / Space dismiss it (only over a conversation; in play those keys are the player's). */
  show(v: RewardView, keys = false, onDone?: () => void): void {
    this.close();
    this.onDone = onDone ?? null;
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
      h('div.kqq-r-next', [h('kbd', 'E'), ` ${t('quest.continue')}`]),
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
    this.timer = 6.5;
  }

  /** UI clock (real seconds). */
  tick(dt: number): void {
    if (!this.el) return;
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
    const fn = this.onDone;
    this.onDone = null;
    fn?.();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.close();
    }
  };
}
