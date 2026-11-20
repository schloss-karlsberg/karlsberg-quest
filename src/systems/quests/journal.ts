/**
 * The Journal (J / Tab): one field-book modal with tabs from src/ui/journal.ts (journalTabs()).
 * Replaces the Chronik board (docs/ACTION-RPG.md §8.4). The quests system registers 10 Aufgaben,
 * 20 Codex, 30 Sammlungen (renderers below); progression adds 40 Ausrüstung and 50 Talente.
 *
 * Keyboard: ←/→ (or 1–9) switch tabs, Tab cycles focus inside (the modal manager's trap),
 * J or Esc closes. Every tab is rendered fresh when shown.
 */
import type { GameContext } from '../../core/context';
import type { Confidence, Fact } from '../../content/types';
import { t } from '../../i18n';
import { h } from '../../ui/dom';
import { type JournalTab, journalTabs } from '../../ui/journal';
import type { ModalHandle } from '../../ui/modal';
import type { ItemDef, QuestDef, QuestProgress } from '../../rpg/types';
import { ENEMIES } from '../../rpg/enemies';
import { COLLECTIONS } from '../../rpg/items';
import type { Era } from '../../core/era';

// ---------------------------------------------------------------------------------------------
// the modal

export class JournalModal {
  private modal: ModalHandle | null = null;
  private current = '';
  private readonly tabsEl = h('div.kqj-tabs', { role: 'tablist', 'aria-label': t('journal.title') });
  private readonly panel = h('div.kqj-panel', { role: 'tabpanel', tabindex: '-1' });

  constructor(
    private readonly ctx: GameContext,
    private readonly hooks: { opened(): void; closed(): void; page(): void },
  ) {}

  get open(): boolean {
    return !!this.modal && !this.modal.closed;
  }

  get tab(): string {
    return this.current;
  }

  show(tab?: string): void {
    const tabs = journalTabs();
    if (!tabs.length) return;
    const want = tab && tabs.some((x) => x.id === tab) ? tab : this.current && tabs.some((x) => x.id === this.current) ? this.current : tabs[0]!.id;
    if (this.open) {
      this.select(want);
      return;
    }
    if (this.ctx.ui.modals.count > 0) this.ctx.ui.modals.closeAll();
    const body = h('div.kqj', { 'data-testid': 'journal' }, [
      h('div.kqj-head', [h('div.kqj-titles', [h('h2.kqj-title', t('journal.title')), h('span.kqj-sub', t('journal.subtitle'))]), this.tabsEl]),
      this.panel,
      h('div.kqj-foot', [h('kbd', 'J'), ' / ', h('kbd', 'Esc'), ` ${t('journal.close').replace(/^.*?\(.*?\)\s*/, '')}`]),
    ]);
    this.modal = this.ctx.ui.modals.open({
      body,
      className: 'kqj-modal',
      wide: true,
      backdrop: 'still',
      onClose: () => {
        window.removeEventListener('keydown', this.onKey, true);
        journalTabs().find((x) => x.id === this.current)?.hide?.();
        this.modal = null;
        this.hooks.closed();
      },
    });
    this.modal.el.setAttribute('aria-label', t('journal.title'));
    window.addEventListener('keydown', this.onKey, true);
    this.current = '';
    this.select(want);
    this.hooks.opened();
  }

  close(): void {
    this.modal?.close();
  }

  /** Re-render the open tab (state changed underneath). */
  refresh(): void {
    if (!this.open) return;
    const keep = this.panel.scrollTop;
    this.renderTabs();
    journalTabs().find((x) => x.id === this.current)?.render(this.panel, this.ctx);
    this.panel.scrollTop = keep;
  }

  select(id: string): void {
    const tabs = journalTabs();
    const tab = tabs.find((x) => x.id === id) ?? tabs[0];
    if (!tab) return;
    if (this.current && this.current !== tab.id) {
      tabs.find((x) => x.id === this.current)?.hide?.();
      this.hooks.page();
    }
    this.current = tab.id;
    this.renderTabs();
    this.panel.replaceChildren();
    this.panel.dataset.testid = `journal-panel-${tab.id}`;
    this.panel.setAttribute('aria-labelledby', `kqj-tab-${tab.id}`);
    tab.render(this.panel, this.ctx);
    this.panel.scrollTop = 0;
  }

  /** Re-draw the tab strip (badges) without touching the panel. */
  refreshTabs(): void {
    if (this.open) this.renderTabs();
  }

  private renderTabs(): void {
    const tabs = journalTabs();
    const focused = document.activeElement instanceof HTMLElement && this.tabsEl.contains(document.activeElement) ? document.activeElement.dataset.tab : null;
    this.tabsEl.replaceChildren(
      ...tabs.map((tab: JournalTab, i) => {
        const sel = tab.id === this.current;
        const n = tab.badge?.(this.ctx) ?? 0;
        return h(
          `button.kqj-tab${sel ? '.kqj-sel' : ''}`,
          {
            type: 'button',
            role: 'tab',
            id: `kqj-tab-${tab.id}`,
            'aria-selected': String(sel),
            tabindex: sel ? '0' : '-1',
            dataset: { testid: `journal-tab-${tab.id}`, tab: tab.id },
            onclick: () => this.select(tab.id),
          },
          [h('span.kqj-tn', String(i + 1)), tab.label, n > 0 ? h('span.kqj-badge', { 'aria-label': `${n} neu` }, String(n)) : null],
        );
      }),
    );
    if (focused) (this.tabsEl.querySelector(`[data-tab="${CSS.escape(focused)}"]`) as HTMLElement | null)?.focus();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.open) return;
    // a card / dialog above the journal keeps its keys
    if (this.ctx.ui.modals.count > 1) return;
    const tg = e.target as HTMLElement | null;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
    const tabs = journalTabs();
    const i = tabs.findIndex((x) => x.id === this.current);
    if (e.code === 'KeyJ') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.close();
      return;
    }
    const onTabs = !!tg && this.tabsEl.contains(tg);
    if ((e.code === 'ArrowRight' || e.code === 'ArrowLeft') && (onTabs || !tg || tg === document.body || this.panel === tg)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const n = tabs[(i + (e.code === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
      this.select(n.id);
      (this.tabsEl.querySelector(`[data-tab="${CSS.escape(n.id)}"]`) as HTMLElement | null)?.focus();
      return;
    }
    const d = /^Digit([1-9])$/.exec(e.code);
    if (d && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const n = tabs[Number(d[1]) - 1];
      if (n) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.select(n.id);
      }
    }
  };
}

// ---------------------------------------------------------------------------------------------
// data the quests system hands to the tab renderers

export interface JournalData {
  ctx: GameContext;
  quests(): (QuestDef & { chapter: string })[];
  progress(id: string): QuestProgress | undefined;
  count(id: string, obj: string): number;
  objectiveVisible(q: QuestDef, obj: string): boolean;
  tracked(): string[];
  track(id: string, on: boolean): void;
  item(id: string): ItemDef | undefined;
  /** Items declared by quest files (collection members). */
  questItems(): ItemDef[];
  owned(id: string): number;
  unseen(): string[];
  seen(id: string): void;
  bestiary(): Record<string, number>;
  speaker(id: string): string;
}

const ERA_LABEL: Record<string, string> = { today: 'Gegenwart', '1789': '1789', '1793-02': 'Februar 1793', '1793-07': 'Juli 1793', '1796': '1796' };
export const eraLabel = (e: Era | string | undefined) => (e ? ERA_LABEL[e] ?? e : '');

/** FAKT / STRITTIG / LEGENDE / FIKTION from a fact's tags (`label:X`), fiction → FIKTION. */
export function factLabel(f: Fact): 'FAKT' | 'STRITTIG' | 'LEGENDE' | 'FIKTION' {
  if (f.fiction) return 'FIKTION';
  const tag = (f.tags ?? []).find((x) => x.startsWith('label:'))?.slice(6).toUpperCase();
  if (tag === 'STRITTIG' || tag === 'LEGENDE' || tag === 'FIKTION' || tag === 'FAKT') return tag;
  return f.contested_de ? 'STRITTIG' : 'FAKT';
}

export const isReliefPattern = (f: Fact) => (f.tags ?? []).some((x) => /relief/i.test(x)) || /(^|\.)rm\.\d+/.test(f.id);

const clean = (s: string) => s.replace(/^PLATZHALTER(?: \([^)]*\))?\.?\s*/, '');

function conf(c: Confidence): HTMLElement {
  return h('span.kqq-conf', { dataset: { c }, title: t(`journal.codex.${c}`), 'aria-label': `${c}: ${t(`journal.codex.${c}`)}` }, c);
}

function label(l: string): HTMLElement {
  return h('span.kqq-lab', { dataset: { l } }, t(`journal.codex.label.${l}`));
}

// ---------------------------------------------------------------------------------------------
// 10 Aufgaben

let selQuest: string | null = null;

export function renderQuests(el: HTMLElement, d: JournalData): void {
  const all = d.quests();
  const st = (q: QuestDef) => d.progress(q.id)?.state ?? 'hidden';
  const by = (a: QuestDef, b: QuestDef) => (a.kind === b.kind ? 0 : a.kind === 'main' ? -1 : 1) || (d.progress(b.id)?.t ?? 0) - (d.progress(a.id)?.t ?? 0);
  const active = all.filter((q) => st(q) === 'active' || st(q) === 'ready').sort(by);
  const done = all.filter((q) => st(q) === 'done' || st(q) === 'failed').sort((a, b) => (d.progress(b.id)?.t ?? 0) - (d.progress(a.id)?.t ?? 0));
  if (!selQuest || ![...active, ...done].some((q) => q.id === selQuest)) selQuest = active[0]?.id ?? done[0]?.id ?? null;
  const unseen = new Set(d.unseen());
  const rerender = () => renderQuests(el, d);

  const row = (q: QuestDef) => {
    const s = st(q);
    const mark = s === 'ready' ? '?' : s === 'done' ? '✓' : s === 'failed' ? '×' : q.kind === 'main' ? '◆' : '◇';
    return h(
      `button.kqj-qrow${q.id === selQuest ? '.kqj-on' : ''}${s === 'done' ? '.kqj-qdone' : ''}`,
      {
        type: 'button',
        dataset: { quest: q.id, testid: `journal-quest-${q.id}` },
        'aria-pressed': String(q.id === selQuest),
        onclick: () => {
          selQuest = q.id;
          d.seen(`q:${q.id}`);
          rerender();
        },
      },
      [h(`span.kqj-qm.kqj-qm-${s}`, { 'aria-hidden': 'true' }, mark), h('span.kqj-qt', q.title_de), unseen.has(`q:${q.id}`) ? h('span.kqj-fresh', t('journal.codex.fresh')) : null],
    );
  };

  const list = h('div.kqj-qlist', [
    h('h4', t('journal.quests.active')),
    active.length ? h('div.kqj-qgroup', active.map(row)) : h('p.kqj-empty', t('journal.quests.none')),
    done.length ? h('h4', t('journal.quests.done')) : null,
    done.length ? h('div.kqj-qgroup', done.map(row)) : null,
  ]);

  const q = all.find((x) => x.id === selQuest);
  let detail: HTMLElement;
  if (!q) detail = h('div.kqj-qdetail.kqj-empty', t('journal.quests.pick'));
  else {
    const s = st(q);
    const p = d.progress(q.id);
    const giver = 'npc' in q.giver ? d.speaker(q.giver.npc) : d.speaker(q.giver.voice);
    const ti = q.turnin ?? 'giver';
    const turnin = ti === 'auto' ? null : ti === 'giver' ? giver : 'npc' in ti ? d.speaker(ti.npc) : d.speaker(ti.voice);
    const tracked = d.tracked().includes(q.id);
    const objs = q.objectives.filter((o) => !o.hidden || d.objectiveVisible(q, o.id) || s === 'done');
    const items = (q.rewards?.items ?? []).map((i) => `${(i.count ?? 1) > 1 ? `${i.count}× ` : ''}${d.item(i.item)?.name_de ?? i.item}`);
    const facts = s === 'done' ? (q.history ?? []) : [];
    detail = h('div.kqj-qdetail', { dataset: { testid: 'journal-quest-detail', quest: q.id } }, [
      h('div.kqj-kick', [q.kind === 'main' ? t('journal.quests.main') : t('journal.quests.side'), q.era ? ` · ${eraLabel(q.era)}` : '']),
      h('h3', q.title_de),
      h('div.kqj-who', [t('journal.quests.giver', { name: giver }), turnin && turnin !== giver ? ` · ${t('journal.quests.turnin', { name: turnin })}` : '']),
      h('p.kqj-summary', q.summary_de),
      s === 'failed' ? h('p.kqj-missed', { dataset: { testid: 'journal-missed' } }, t(p?.reason === 'chapter' ? 'journal.quests.missedChapter' : 'journal.quests.missedStory')) : null,
      h(
        'ul.kqj-objs',
        objs.map((o) => {
          const n = d.count(q.id, o.id);
          const need = o.type === 'survive' ? Math.round(o.seconds ?? o.count ?? 1) : (o.count ?? 1);
          const ok = n >= need || s === 'done';
          return h(`li${ok ? '.kqj-ok' : ''}${o.optional ? '.kqj-opt' : ''}`, [
            h('span.kqq-box', { 'aria-hidden': 'true' }, ok ? '✓' : ''),
            o.text_de,
            need > 1 ? h('span.kqj-n', ` ${Math.min(n, need)}/${need}`) : null,
            o.optional ? h('span.kqj-tag', o.bonus_xp ? `${t('quest.bonus')} +${o.bonus_xp} EP` : t('quest.optional')) : null,
          ]);
        }),
      ),
      q.rewards && (q.rewards.xp || items.length)
        ? h('div.kqj-rew', [h('span.kqj-lbl', t('journal.quests.rewards')), q.rewards.xp ? h('span.kqj-xp', `${q.rewards.xp} EP`) : null, ...items.map((i) => h('span.kqj-it', i))])
        : null,
      facts.length
        ? h('section.kqj-hist', { dataset: { testid: 'journal-history' } }, [
            h('h4', t('journal.quests.history')),
            ...facts.map((l) =>
              h('blockquote', [h('p', l.text), h('footer', [d.speaker(l.speaker), l.sources?.[0] ? ` · ${l.sources[0].label}` : ''])]),
            ),
          ])
        : null,
      s === 'active' || s === 'ready'
        ? h(
            `button.kq-btn.kqj-track${tracked ? '.kqj-on' : ''}`,
            { type: 'button', 'aria-pressed': String(tracked), dataset: { testid: 'journal-track' }, onclick: () => (d.track(q.id, !tracked), rerender()) },
            tracked ? t('journal.quests.tracked') : t('journal.quests.track'),
          )
        : null,
    ]);
    if (unseen.has(`q:${q.id}`)) d.seen(`q:${q.id}`);
  }
  el.replaceChildren(h('div.kqj-quests', [list, detail]));
}

// ---------------------------------------------------------------------------------------------
// 20 Codex

let codexFilter: 'all' | 'new' | 'relief' = 'all';
let codexSel: string | null = null;

export function renderCodex(el: HTMLElement, d: JournalData): void {
  const facts = [...d.ctx.content.facts.values()];
  const have = new Set(d.ctx.state.state.codex.facts);
  const unseen = new Set(d.unseen());
  const cards = facts.filter((f) => !isReliefPattern(f));
  const relief = facts.filter(isReliefPattern);
  const pool = codexFilter === 'relief' ? relief : codexFilter === 'new' ? facts.filter((f) => unseen.has(f.id) && have.has(f.id)) : cards;
  const sorted = [...pool.filter((f) => have.has(f.id)), ...(codexFilter === 'new' ? [] : pool.filter((f) => !have.has(f.id)))];
  const rerender = () => renderCodex(el, d);
  const nNew = facts.filter((f) => unseen.has(f.id) && have.has(f.id)).length;
  const filt = (id: typeof codexFilter, text: string) =>
    h('button.kq-btn.kqj-filter', { type: 'button', 'aria-pressed': String(codexFilter === id), dataset: { testid: `codex-filter-${id}` }, onclick: () => ((codexFilter = id), rerender()) }, text);
  const count = (l: Fact[]) => t('journal.codex.count', { n: l.filter((f) => have.has(f.id)).length, total: l.length });

  const side = h('aside.kqj-cside', [
    h('div.kqj-filters', [filt('all', `${t('journal.codex.all')} · ${count(cards)}`), filt('new', `${t('journal.codex.new')} · ${nNew}`), filt('relief', `${t('journal.codex.relief')} · ${count(relief)}`)]),
    // one scale shown (how true is it?); the source confidence D / I / N / U explains itself on
    // hover over each card's badge (playtest round 3: two legends read like an exam key)
    h('h4', t('journal.codex.legend')),
    h('dl.kqj-legend', { dataset: { testid: 'codex-legend' } }, [
      ...(['FAKT', 'STRITTIG', 'LEGENDE', 'FIKTION'] as const).flatMap((l) => [h('dt', label(l)), h('dd', t(`journal.codex.labeltext.${l}`))]),
    ]),
    h('p.kqj-legend-hint', t('journal.codex.confHint')),
  ]);

  const grid = h('div.kqj-cgrid', { dataset: { testid: 'codex-grid' } });
  for (const f of sorted) {
    if (!have.has(f.id)) {
      grid.append(h('div.kqj-card.kqj-locked', { dataset: { fact: f.id }, 'aria-label': t('journal.codex.locked') }, [h('span.kqj-qmk', '?'), h('span.kqj-ct', t('journal.codex.locked'))]));
      continue;
    }
    grid.append(
      h(
        `button.kqj-card${unseen.has(f.id) ? '.kqj-new' : ''}${codexSel === f.id ? '.kqj-on' : ''}`,
        {
          type: 'button',
          dataset: { fact: f.id, testid: `codex-card-${f.id}` },
          onclick: () => {
            codexSel = f.id;
            d.seen(f.id);
            rerender();
          },
        },
        [
          h('span.kqj-ctop', [conf(f.confidence), label(factLabel(f))]),
          h('span.kqj-ct', f.title_de),
          h('span.kqj-cx', clean(f.text_de)),
          unseen.has(f.id) ? h('span.kqj-fresh', t('journal.codex.fresh')) : null,
        ],
      ),
    );
  }

  const f = codexSel ? d.ctx.content.facts.get(codexSel) : undefined;
  const detail =
    f && have.has(f.id)
      ? h('article.kqj-cdetail', { dataset: { testid: 'codex-detail', fact: f.id } }, [
          h('div.kqj-ctop', [conf(f.confidence), h('span.kqj-cw', t(`journal.codex.${f.confidence}`)), label(factLabel(f))]),
          h('h3', f.title_de),
          h('p', clean(f.text_de)),
          f.contested_de ? h('p.kqj-contested', [h('b', `${t('journal.codex.contested')}: `), f.contested_de]) : null,
          f.sources.length
            ? h('div.kqj-sources', [
                h('h4', t('journal.codex.sources')),
                h('ul', f.sources.map((s) => h('li', [/^https?:/.test(s.url) ? h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.label ?? s.url) : s.label ?? s.url, s.note ? h('span.kqj-note', ` – ${s.note}`) : null]))),
              ])
            : null,
        ])
      : h('article.kqj-cdetail.kqj-empty', t('journal.codex.pick'));

  el.replaceChildren(h('div.kqj-codex', [side, h('div.kqj-cmain', [grid]), detail]));
}

// ---------------------------------------------------------------------------------------------
// 30 Sammlungen (+ bestiary)

export function renderSets(el: HTMLElement, d: JournalData): void {
  const members = new Map<string, ItemDef[]>();
  for (const it of d.questItems()) if (it.set) (members.get(it.set) ?? members.set(it.set, []).get(it.set)!).push(it);
  const sets = COLLECTIONS.map((c) => {
    const ids = [...c.items, ...(members.get(c.id) ?? []).map((i) => i.id).filter((id) => !c.items.includes(id))];
    const list = ids.map((id) => d.item(id)).filter((x): x is ItemDef => !!x);
    const have = list.filter((i) => d.owned(i.id) > 0).length;
    return h(`section.kqj-set${list.length && have === list.length ? '.kqj-complete' : ''}`, { dataset: { set: c.id, testid: `set-${c.id}` } }, [
      h('header', [h('h4', c.name_de), h('span.kqj-n', list.length ? `${have}/${list.length}` : '–'), c.reward?.xp ? h('span.kqj-tag', t('journal.sets.reward', { n: c.reward.xp })) : null]),
      list.length
        ? h(
            'ul.kqj-members',
            list.map((i) =>
              d.owned(i.id) > 0
                ? h('li.kqj-have', { title: i.text_de }, [h('span.kqq-box', '✓'), h('b', i.name_de), h('span.kqj-itxt', i.text_de)])
                : h('li.kqj-miss', [h('span.kqq-box', ''), t('journal.sets.unknown')]),
            ),
          )
        : h('p.kqj-empty', t('journal.sets.none')),
    ]);
  });
  const seen = d.bestiary();
  const beasts = ENEMIES.map((e) => {
    const n = seen[e.id] ?? 0;
    return n > 0
      ? h('li.kqj-beast', { dataset: { enemy: e.id } }, [h('b', e.name_de), h('span.kqj-n', t('journal.bestiary.undone', { n })), h('p', e.note_de), h('span.kqj-eras', t('journal.bestiary.eras', { eras: e.eras.map(eraLabel).join(', ') }))])
      : h('li.kqj-beast.kqj-miss', { dataset: { enemy: e.id } }, [h('b', '???'), h('span.kqj-n', t('journal.bestiary.unknown'))]);
  });
  el.replaceChildren(
    h('div.kqj-sets', [
      h('div.kqj-setcol', sets),
      h('section.kqj-bestiary', { dataset: { testid: 'bestiary' } }, [h('h4', t('journal.bestiary')), h('p.kqj-note', t('journal.bestiary.note')), h('ul', beasts)]),
    ]),
  );
}
