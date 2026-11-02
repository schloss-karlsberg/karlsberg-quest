/**
 * The Chronik board: a full-screen pin board with case pages (sentences with blanks), a tray of
 * collected noun cards (drag them into blanks, or click a card then a blank), batch checking with
 * stamps, red strings from the finds to the entries they feed, the compass (Laub) for hints, and
 * the codex tab. Pure DOM; state lives in ctx.state via the BoardApi.
 */
import './chronik.css';
import type { CaseProgress } from '../../../core/state';
import type { ChronikCase, CaseEntry, Noun } from '../../../content/types';
import type { ModalHandle } from '../../../ui/modal';
import { h, svg } from '../../../ui/dom';
import { CATEGORY_QUESTION, type BatchResult, type ChronikContent, caseComplete, caseRatio, entryComplete, entryValues, evaluateBatch, factEntries, nounFits } from '../logic';
import type { ChronikBlank, ChronikClue } from '../types';
import { renderCodex } from './codex';
import { drawRelief, type HeightFn } from './sketch';
import { boardTextures } from './textures';

export interface BoardApi {
  t(key: string, params?: Record<string, string | number>): string;
  content: ChronikContent;
  modals: { open: (o: import('../../../ui/modal').ModalOptions) => ModalHandle };
  visibleCases(): ChronikCase[];
  progress(caseId: string): CaseProgress;
  knownNouns(): string[];
  foundClues(): string[];
  codexFacts(): string[];
  fill(caseId: string, entryId: string, blankId: string, nounId: string | null): boolean;
  check(caseId: string): (BatchResult & { blocked?: boolean }) | null;
  canConfirm(): boolean;
  askLaub(caseId: string): string;
  laubNote(caseId: string): string | null;
  marks(caseId: string): string[];
  gentle(): boolean;
  reducedMotion(): boolean;
  heightAt: HeightFn | null;
  sound(kind: 'paper' | 'stamp' | 'wrong', when?: number): void;
  onOpen(caseId: string | null): void;
  onClose(): void;
}

type Tab = 'board' | 'codex';
/** Panes whose scroll offset survives a re-render. */
const SCROLLERS = ['.ck-page-wrap', '.ck-side', '.ck-cases', '.ck-tray-cards', '.ck-grid-wrap'];

const STAMP_SVG = (ring: string, word: string) => `
<svg viewBox="0 0 120 120" aria-hidden="true">
  <defs><path id="ckr" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0"/></defs>
  <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" stroke-width="3.2"/>
  <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <circle cx="60" cy="60" r="31" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <text font-family="IM Fell English SC, serif" font-size="9.4" letter-spacing="1.6" fill="currentColor"><textPath href="#ckr">${ring} · ${ring.split('·')[0]}</textPath></text>
  <text x="60" y="58" text-anchor="middle" font-family="IM Fell English SC, serif" font-size="12.5" fill="currentColor" letter-spacing="0.5">${word}</text>
  <text x="60" y="74" text-anchor="middle" font-family="IM Fell English, serif" font-size="11" fill="currentColor">1840</text>
  <path d="M38 64 L82 64" stroke="currentColor" stroke-width="1"/>
</svg>`;

const COMPASS_SVG = `
<svg class="compass" viewBox="0 0 74 74" aria-hidden="true">
  <defs><radialGradient id="ckb" cx="40%" cy="35%"><stop offset="0" stop-color="#fff0c4"/><stop offset="0.45" stop-color="#c9973d"/><stop offset="1" stop-color="#5d3e12"/></radialGradient></defs>
  <circle cx="37" cy="37" r="35" fill="url(#ckb)"/>
  <circle cx="37" cy="37" r="28" fill="#efe4c8" stroke="#6d4a17" stroke-width="1.5"/>
  <g stroke="#5a4a37" stroke-width="1">${Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const r0 = i % 4 === 0 ? 20 : 24;
    return `<line x1="${37 + Math.sin(a) * r0}" y1="${37 - Math.cos(a) * r0}" x2="${37 + Math.sin(a) * 27}" y2="${37 - Math.cos(a) * 27}"/>`;
  }).join('')}</g>
  <text x="37" y="17.5" text-anchor="middle" font-family="IM Fell English SC, serif" font-size="8" fill="#2a2118">N</text>
  <g class="needle"><path d="M37 13 L40.5 37 L37 61 L33.5 37 Z" fill="#8c2f1f"/><path d="M37 37 L40.5 37 L37 61 L33.5 37 Z" fill="#2a2118"/></g>
  <circle cx="37" cy="37" r="2.6" fill="#b58b3d" stroke="#3a2a10"/>
</svg>`;

export class ChronikBoard {
  private modal: ModalHandle | null = null;
  private root: HTMLElement | null = null;
  tab: Tab = 'board';
  caseId: string | null = null;
  private held: string | null = null;
  private focusSlot: { entry: string; blank: string } | null = null;
  private message: { text: string; ok: boolean } | null = null;
  private freshStamps = new Set<string>();
  private readonly ink = new Map<string, string>();
  private readonly inkPrimed = new Set<string>();
  private freshFacts = new Set<string>();
  private seenNouns = new Set<string>();
  private codexSection: 'cards' | 'relief' = 'cards';
  private codexDetail: string | null = null;
  private revealMessage = false;
  private drag: { noun: string; ghost: HTMLElement | null; x0: number; y0: number; from?: { entry: string; blank: string } } | null = null;
  private stringsRaf = 0;
  private readonly onResize = () => this.drawStrings();

  constructor(private readonly api: BoardApi) {}

  get isOpen(): boolean {
    return !!this.modal && !this.modal.closed;
  }

  open(caseId?: string | null, tab: Tab = 'board'): void {
    const cases = this.api.visibleCases();
    if (caseId && cases.some((c) => c.id === caseId)) this.caseId = caseId;
    if (!this.caseId || !cases.some((c) => c.id === this.caseId)) this.caseId = cases[0]?.id ?? null;
    this.tab = tab;
    if (!this.isOpen) {
      this.message = null;
      this.held = null;
      this.focusSlot = null;
      this.root = h('div.ck-board', { tabindex: '-1', role: 'region', 'aria-label': this.api.t('chronik.title') });
      for (const [k, v] of Object.entries(boardTextures())) this.root.style.setProperty(k, v);
      if (this.api.reducedMotion()) this.root.classList.add('ck-reduced');
      this.root.addEventListener('keydown', (e) => this.onKey(e));
      this.root.addEventListener('pointermove', (e) => this.onPointerMove(e));
      this.root.addEventListener('pointerup', (e) => this.onPointerUp(e));
      this.modal = this.api.modals.open({ body: this.root, closable: false, className: 'ck-board-modal', onClose: () => this.closed() });
      window.addEventListener('resize', this.onResize);
      this.api.sound('paper');
      this.render();
      queueMicrotask(() => this.root?.focus());
      // nouns seen on this opening are no longer "new" next time
      this.api.onOpen(this.caseId);
    } else this.render();
  }

  close(): void {
    this.modal?.close();
  }

  private closed(): void {
    window.removeEventListener('resize', this.onResize);
    cancelAnimationFrame(this.stringsRaf);
    for (const n of this.api.knownNouns()) this.seenNouns.add(n);
    this.drag?.ghost?.remove();
    this.drag = null;
    this.modal = null;
    this.root = null;
    this.api.onClose();
  }

  /** Mark entries to play the stamp animation on next render. */
  stamp(ids: string[], facts: string[]): void {
    for (const id of ids) this.freshStamps.add(id);
    for (const f of facts) this.freshFacts.add(f);
  }

  setMessage(text: string | null, ok = false): void {
    this.message = text ? { text, ok } : null;
    this.revealMessage = !!text;
  }

  /** A selector that finds the focused control again after a re-render. */
  private focusKey(el: Element | null): string | null {
    if (!this.root || !el || !this.root.contains(el)) return null;
    const d = (el as HTMLElement).dataset ?? {};
    if (d.noun && el.classList.contains('ck-noun')) return `.ck-noun[data-noun="${d.noun}"]`;
    if (d.entry && d.blank) return `.ck-slot[data-entry="${d.entry}"][data-blank="${d.blank}"]`;
    if (d.tab) return `.ck-tab[data-tab="${d.tab}"]`;
    if (d.case) return `.ck-case-tab[data-case="${d.case}"]`;
    if (d.testid) return `[data-testid="${d.testid}"]`;
    return '';
  }

  private restoreFocus(key: string | null): void {
    const root = this.root;
    if (!root || !this.isOpen) return;
    // still focused (inside the board, or somewhere else on purpose): leave it
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const el = key ? (root.querySelector(key) as HTMLElement | null) : null;
    (el && !(el as HTMLButtonElement).disabled ? el : root).focus({ preventScroll: true });
  }

  /** Scroll offsets of the scrollable panes, so a re-render does not jump back to the top. */
  private scrollState(root: HTMLElement): Map<string, [number, number]> {
    const m = new Map<string, [number, number]>();
    for (const sel of SCROLLERS) {
      const el = root.querySelector(sel);
      if (el) m.set(sel, [el.scrollLeft, el.scrollTop]);
    }
    return m;
  }

  private restoreScroll(root: HTMLElement, m: Map<string, [number, number]>): void {
    for (const [sel, [x, y]] of m) {
      const el = root.querySelector(sel);
      if (el) {
        el.scrollLeft = x;
        el.scrollTop = y;
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  render(): void {
    const root = this.root;
    if (!root) return;
    const t = this.api.t;
    const cases = this.api.visibleCases();
    const codexTotal = [...this.api.content.facts.values()].length;
    const codexHave = this.api.codexFacts().filter((f) => this.api.content.facts.has(f)).length;
    const tabBtn = (id: Tab, label: string, extra?: string) =>
      h('button.ck-tab', { role: 'tab', 'aria-selected': String(this.tab === id), dataset: { tab: id }, onclick: () => this.switchTab(id) }, [label, extra ? h('span.ck-count', extra) : null]);
    const head = h('div.ck-head', [
      h('div.ck-plate', [t('chronik.title'), h('small', t('chronik.subtitle'))]),
      h('div.ck-tabs', { role: 'tablist' }, [tabBtn('board', t('chronik.tab.board')), tabBtn('codex', t('chronik.tab.codex'), `${codexHave}/${codexTotal}`)]),
      h('div.ck-head-right', [h('span', t('chronik.close')), h('button.ck-close', { 'aria-label': t('chronik.close'), onclick: () => this.close(), dataset: { testid: 'chronik-close' } }, '×')]),
    ]);
    const scroll = this.scrollState(root);
    const focusKey = this.focusKey(document.activeElement);
    root.replaceChildren(head);
    // keep keyboard focus inside the board across re-renders (Escape / J / Tab keep working)
    queueMicrotask(() => this.restoreFocus(focusKey));
    if (this.tab === 'codex') {
      root.append(
        renderCodex({
          api: this.api,
          section: this.codexSection,
          detail: this.codexDetail,
          fresh: this.freshFacts,
          setSection: (s) => {
            this.codexSection = s;
            this.render();
          },
          setDetail: (id) => {
            this.codexDetail = id;
            this.render();
          },
        }),
      );
      this.restoreScroll(root, scroll);
      this.freshFacts.clear();
      return;
    }
    const main = h('div.ck-main');
    const cs = cases.find((c) => c.id === this.caseId) ?? null;
    main.append(this.renderCaseTabs(cases));
    main.append(h('div.ck-page-wrap', cs ? this.renderPage(cs) : h('div.ck-page.kq-paper', [h('p', t('chronik.noCases'))])));
    main.append(this.renderSide(cs));
    root.append(main, this.renderTray(cs));
    this.restoreScroll(root, scroll);
    for (const pane of main.querySelectorAll('.ck-page-wrap, .ck-side'))
      pane.addEventListener('scroll', () => {
        cancelAnimationFrame(this.stringsRaf);
        this.stringsRaf = requestAnimationFrame(() => this.drawStrings());
      });
    if (this.message && this.revealMessage) {
      this.revealMessage = false;
      root.querySelector('.ck-batch')?.scrollIntoView({ block: 'nearest', behavior: this.api.reducedMotion() ? 'auto' : 'smooth' });
    }
    this.freshStamps.clear();
    cancelAnimationFrame(this.stringsRaf);
    this.stringsRaf = requestAnimationFrame(() => this.drawStrings());
  }

  private switchTab(tab: Tab): void {
    this.tab = tab;
    this.codexDetail = null;
    this.api.sound('paper', 0);
    this.render();
  }

  private renderCaseTabs(cases: ChronikCase[]): HTMLElement {
    return h(
      'nav.ck-cases',
      cases.map((c) => {
        const p = this.api.progress(c.id);
        const facts = factEntries(c);
        const done = caseComplete(c, p);
        return h(
          `button.ck-case-tab${done ? '.complete' : ''}`,
          { 'aria-current': String(c.id === this.caseId), dataset: { case: c.id }, onclick: () => this.selectCase(c.id) },
          [c.title_de, h('span.dots', facts.map((e) => h(p.confirmed.includes(e.id) ? 'i.on' : 'i', '●')))],
        );
      }),
    );
  }

  private selectCase(id: string): void {
    this.caseId = id;
    this.message = null;
    this.focusSlot = null;
    this.api.sound('paper', 0);
    this.api.onOpen(id);
    this.render();
  }

  private renderPage(cs: ChronikCase): HTMLElement {
    const t = this.api.t;
    const p = this.api.progress(cs.id);
    const marks = new Set(this.api.marks(cs.id));
    const done = caseComplete(cs, p);
    let n = 0;
    const entries = cs.entries.map((e) => {
      if (!e.blanks.length) return h('li.ck-entry.memorial', h('em', e.text_de));
      n++;
      const confirmed = p.confirmed.includes(e.id);
      const li = h(`li.ck-entry.${e.kind}${confirmed ? '.confirmed' : ''}`, { dataset: { entry: e.id } });
      li.append(h('span.num', `${n}.`));
      li.append(...this.renderSentence(cs, e, p, confirmed));
      li.append(h('span.kind', t(`chronik.kind.${e.kind}`)));
      if (e.kind === 'reading') li.append(h('span.reading-note', t('chronik.reading.note')));
      if (confirmed) {
        const fresh = this.freshStamps.has(e.id);
        const st = h(`div.ck-stamp${fresh && !this.api.reducedMotion() ? '.fresh' : ''}`, svg(STAMP_SVG(t('chronik.stamp.ring'), t('chronik.stamp').toUpperCase())));
        st.style.animationDelay = fresh ? `${[...this.freshStamps].indexOf(e.id) * 0.32}s` : '';
        li.append(st);
        if (fresh && !this.api.reducedMotion()) {
          const sp = h('span.splat');
          sp.style.animationDelay = st.style.animationDelay;
          li.append(sp);
        }
      } else if (marks.has(e.id) && this.api.gentle()) {
        li.append(h('span.tick', `✓ ${t('chronik.gentle.right')}`));
      }
      return li;
    });
    const page = h('article.ck-page.kq-paper', { dataset: { case: cs.id } }, [
      h('span.ck-pin.tl'),
      h('span.ck-pin.red.tr'),
      h('h3', cs.title_de),
      cs.intro_de ? h('p.ck-intro', cs.intro_de) : null,
      h('ol.ck-entries', entries),
      done ? h('div.ck-complete-stamp', t('chronik.complete')) : null,
      this.renderBatch(cs, p),
    ]);
    this.inkPrimed.add(cs.id);
    return page;
  }

  private renderSentence(cs: ChronikCase, e: CaseEntry, p: CaseProgress, confirmed: boolean): (Node | string)[] {
    const t = this.api.t;
    const values = entryValues(p, e);
    const out: (Node | string)[] = [];
    const parts = e.text_de.split(/(\{[\w-]+\})/g);
    for (const part of parts) {
      const m = /^\{([\w-]+)\}$/.exec(part);
      if (!m) {
        if (part) out.push(part);
        continue;
      }
      const blank = e.blanks.find((b) => b.id === m[1]) as ChronikBlank | undefined;
      if (!blank) {
        out.push(part);
        continue;
      }
      const nounId = values[blank.id];
      const noun = nounId ? this.api.content.nouns.get(nounId) : undefined;
      const q = this.question(blank);
      const held = this.held ? this.api.content.nouns.get(this.held) : undefined;
      const canDrop = !confirmed && !!held && nounFits(blank, held);
      if (!noun) this.ink.delete(`${cs.id}|${e.id}|${blank.id}`);
      const isFocus = this.focusSlot?.entry === e.id && this.focusSlot.blank === blank.id;
      const cls = ['button.ck-slot', noun ? 'filled' : '', confirmed ? 'locked' : '', canDrop ? 'can-drop' : '', isFocus ? 'focus' : ''].filter(Boolean).join('.');
      const btn = h(
        cls as 'button',
        {
          type: 'button',
          dataset: { entry: e.id, blank: blank.id, case: cs.id, noun: nounId ?? '' },
          'aria-label': noun ? `${noun.label_de} (${q})` : t('chronik.blank.empty', { q }),
          disabled: confirmed ? true : undefined,
          onclick: () => this.clickSlot(cs, e, blank),
          onpointerdown: (ev: PointerEvent) => {
            if (noun && !confirmed && ev.button === 0) this.startDrag(ev, noun.id, { entry: e.id, blank: blank.id });
          },
        },
        noun ? h(`span.ink${this.inkIsFresh(cs.id, e.id, blank.id, noun.id) ? '.fresh' : ''}`, noun.label_de) : t('chronik.blank.empty', { q }),
      );
      out.push(btn);
    }
    return out;
  }

  private question(b: ChronikBlank): string {
    const t = this.api.t;
    if (b.category) return t(`chronik.q.${CATEGORY_QUESTION[b.category]}`);
    if (b.accepts?.length) {
      const n = this.api.content.nouns.get(b.accepts[0]!);
      if (n) return t(`chronik.q.${CATEGORY_QUESTION[n.category]}`);
    }
    return '…';
  }

  private renderBatch(cs: ChronikCase, p: CaseProgress): HTMLElement {
    const t = this.api.t;
    const r = evaluateBatch(cs, p);
    const allow = this.api.canConfirm();
    const count = r.pending.length;
    const boxes = h('span.boxes', [0, 1, 2].map((i) => h('i', i < count ? '✓' : '')));
    const status = !allow ? t('chronik.check.era') : r.ready ? t('chronik.check.ready', { n: count }) : t('chronik.check.need', { n: count });
    const btn = h(
      `button.kq-btn.primary.ck-btn-check${r.ready && allow ? '.ready' : ''}`,
      { type: 'button', disabled: !r.ready || !allow ? true : undefined, dataset: { testid: 'chronik-check' }, onclick: () => this.doCheck(cs) },
      t('chronik.check'),
    );
    const msg = h(`div.ck-msg${this.message?.ok ? '.ok' : ''}${this.message ? '.in' : ''}`, { 'aria-live': 'polite', dataset: { testid: 'chronik-msg' } }, this.message?.text ?? '');
    return h('div.ck-batch', [boxes, h('span.status', status), btn, msg]);
  }

  private doCheck(cs: ChronikCase): void {
    const r = this.api.check(cs.id);
    if (!r) return;
    if (!r.correct) {
      const page = this.root?.querySelector('.ck-page');
      if (page && !this.api.reducedMotion()) {
        page.classList.remove('ck-shake');
        void (page as HTMLElement).offsetWidth;
        page.classList.add('ck-shake');
      }
    }
  }

  private renderSide(cs: ChronikCase | null): HTMLElement {
    const t = this.api.t;
    const side = h('aside.ck-side');
    // evidence: finds whose nouns sit in this page's blanks; else the latest finds
    const ev = cs ? this.evidenceFor(cs) : [];
    const recent = ev.length === 0;
    const list = recent
      ? this.api
          .foundClues()
          .slice(-4)
          .reverse()
          .map((id) => this.api.content.clues.get(id))
          .filter((c): c is ChronikClue => !!c)
      : ev;
    side.append(h('h4', t(recent ? 'chronik.evidence.recent' : 'chronik.evidence')));
    const grid = h('div.ck-evidence');
    if (!list.length) grid.append(h('p', { style: 'color:#e9dcc0;font-style:italic;font-size:15px;margin:0' }, t('chronik.evidence.none')));
    for (const c of list.slice(0, 6)) {
      const canvas = h('canvas', { width: 120, height: 120 });
      if (this.api.heightAt) drawRelief(canvas, this.api.heightAt, c.where.x, c.where.z, { px: 120, size: 60, north: false, contour: 1 });
      grid.append(h('figure.ck-ev', { dataset: { clue: c.id } }, [h('span.ck-pin.red'), canvas, c.title_de, c.fiction ? h('div.fic', t('chronik.fiction')) : null]));
    }
    side.append(grid);
    // the compass
    const note = cs ? this.api.laubNote(cs.id) : null;
    side.append(
      h('div.ck-laub', [
        svg(COMPASS_SVG),
        h('div', [
          h('div.who', t('chronik.laub.title')),
          h(`p.note${note ? '' : '.idle'}`, { dataset: { testid: 'chronik-laub-note' } }, note ?? t('chronik.laub.idle')),
          cs
            ? h(
                'button.kq-btn',
                {
                  type: 'button',
                  dataset: { testid: 'chronik-ask' },
                  onclick: () => {
                    this.api.askLaub(cs.id);
                    this.render();
                  },
                },
                t('chronik.laub.ask'),
              )
            : null,
        ]),
      ]),
    );
    return side;
  }

  private evidenceFor(cs: ChronikCase): ChronikClue[] {
    const p = this.api.progress(cs.id);
    const placed = new Set<string>();
    for (const e of cs.entries) for (const v of Object.values(entryValues(p, e))) placed.add(v);
    const out: ChronikClue[] = [];
    for (const id of this.api.foundClues()) {
      const c = this.api.content.clues.get(id);
      if (c && (c.reveals.nouns ?? []).some((n) => placed.has(n))) out.push(c);
    }
    return out;
  }

  private renderTray(cs: ChronikCase | null): HTMLElement {
    const t = this.api.t;
    const known = this.api.knownNouns();
    const nouns = known.map((id) => this.api.content.nouns.get(id)).filter((n): n is Noun => !!n);
    const focusBlank = cs && this.focusSlot ? (cs.entries.find((e) => e.id === this.focusSlot!.entry)?.blanks.find((b) => b.id === this.focusSlot!.blank) as ChronikBlank | undefined) : undefined;
    const order: Noun['category'][] = ['person', 'group', 'place', 'time', 'object', 'other', 'action', 'cause'];
    const groups = new Map<string, Noun[]>();
    for (const n of nouns) {
      const key = n.category === 'group' ? 'person' : n.category;
      groups.set(key, [...(groups.get(key) ?? []), n]);
    }
    const cards = h('div.ck-tray-cards', { dataset: { testid: 'chronik-tray' } });
    for (const cat of order) {
      const list = groups.get(cat);
      if (!list?.length) continue;
      const g = h('div.ck-group', [h('span.ck-group-label', t(`chronik.cat.${cat}`))]);
      for (const n of list) {
        const dim = focusBlank ? !nounFits(focusBlank, n) : false;
        const isNew = this.seenNouns.size > 0 && !this.seenNouns.has(n.id);
        const btn = h(
          `button.ck-noun${this.held === n.id ? '.held' : ''}${dim ? '.dim' : ''}${isNew ? '.new' : ''}`,
          {
            type: 'button',
            dataset: { noun: n.id, cat: n.category },
            'aria-pressed': String(this.held === n.id),
            onpointerdown: (ev: PointerEvent) => ev.button === 0 && this.startDrag(ev, n.id),
            onkeydown: (ev: KeyboardEvent) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                this.clickNoun(n.id);
              }
            },
          },
          [h('span.q', t(`chronik.cat.${n.category}`)), n.label_de],
        );
        g.append(btn);
      }
      cards.append(g);
    }
    if (!nouns.length) cards.append(h('em', { style: 'color:#e9dcc0' }, t('chronik.tray.empty')));
    const heldNoun = this.held ? this.api.content.nouns.get(this.held) : undefined;
    const help = heldNoun ? t('chronik.tray.held', { label: heldNoun.label_de }) : this.focusSlot ? t('chronik.slot.help') : t('chronik.tray.help');
    return h('div.ck-tray', [h('div.ck-tray-head', [h('b', t('chronik.tray')), h('span', { dataset: { testid: 'chronik-tray-help' } }, help)]), cards]);
  }

  // -------------------------------------------------------------------------------------------
  // interaction

  private clickNoun(id: string): void {
    const cs = this.currentCase();
    if (this.focusSlot && cs) {
      const e = cs.entries.find((x) => x.id === this.focusSlot!.entry);
      const b = e?.blanks.find((x) => x.id === this.focusSlot!.blank) as ChronikBlank | undefined;
      const n = this.api.content.nouns.get(id);
      if (e && b && n && nounFits(b, n)) {
        this.place(cs, e, b.id, id);
        this.focusSlot = null;
        this.render();
        return;
      }
    }
    this.held = this.held === id ? null : id;
    this.focusSlot = null;
    this.render();
  }

  private clickSlot(cs: ChronikCase, e: CaseEntry, b: ChronikBlank): void {
    if (cs.id !== this.caseId || this.api.progress(cs.id).confirmed.includes(e.id)) return;
    const held = this.held ? this.api.content.nouns.get(this.held) : undefined;
    if (held) {
      if (nounFits(b, held)) {
        this.place(cs, e, b.id, held.id);
        this.held = null;
      }
      this.render();
      return;
    }
    const current = entryValues(this.api.progress(cs.id), e)[b.id];
    if (current) {
      this.api.fill(cs.id, e.id, b.id, null);
      this.api.sound('paper', 0);
      this.message = null;
      this.render();
      return;
    }
    const same = this.focusSlot?.entry === e.id && this.focusSlot.blank === b.id;
    this.focusSlot = same ? null : { entry: e.id, blank: b.id };
    this.render();
  }

  /** Only ink that was just written animates; a re-render must not replay it on every word. */
  private inkIsFresh(caseId: string, entry: string, blank: string, noun: string): boolean {
    const key = `${caseId}|${entry}|${blank}`;
    const before = this.ink.get(key);
    this.ink.set(key, noun);
    return this.inkPrimed.has(caseId) && before !== noun;
  }

  private place(cs: ChronikCase, e: CaseEntry, blankId: string, nounId: string): void {
    if (this.api.fill(cs.id, e.id, blankId, nounId)) {
      this.api.sound('paper', 0);
      this.message = null;
    }
  }

  private currentCase(): ChronikCase | null {
    return this.api.visibleCases().find((c) => c.id === this.caseId) ?? null;
  }

  private startDrag(ev: PointerEvent, noun: string, from?: { entry: string; blank: string }): void {
    ev.preventDefault();
    this.drag = { noun, ghost: null, x0: ev.clientX, y0: ev.clientY, from };
  }

  private onPointerMove(ev: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (!d.ghost) {
      if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 6) return;
      const n = this.api.content.nouns.get(d.noun);
      d.ghost = h('div.ck-noun.ck-drag', { dataset: { cat: n?.category ?? 'other' } }, n?.label_de ?? d.noun);
      document.body.append(d.ghost);
      this.held = d.noun;
      this.focusSlot = null;
      this.render();
    }
    d.ghost.style.left = `${ev.clientX}px`;
    d.ghost.style.top = `${ev.clientY}px`;
    for (const el of this.root?.querySelectorAll('.ck-slot.over') ?? []) el.classList.remove('over');
    const slot = this.slotAt(ev.clientX, ev.clientY);
    if (slot?.classList.contains('can-drop')) slot.classList.add('over');
  }

  private onPointerUp(ev: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (!d.ghost) {
      // a click without movement
      if (!d.from) this.clickNoun(d.noun);
      return;
    }
    d.ghost.remove();
    const cs = this.currentCase();
    const slot = this.slotAt(ev.clientX, ev.clientY);
    if (cs && slot) {
      const e = cs.entries.find((x) => x.id === slot.dataset.entry);
      const b = e?.blanks.find((x) => x.id === slot.dataset.blank) as ChronikBlank | undefined;
      const n = this.api.content.nouns.get(d.noun);
      if (e && b && n && nounFits(b, n) && !this.api.progress(cs.id).confirmed.includes(e.id)) {
        if (d.from && (d.from.entry !== e.id || d.from.blank !== b.id)) this.api.fill(cs.id, d.from.entry, d.from.blank, null);
        this.place(cs, e, b.id, n.id);
      }
    } else if (cs && d.from && this.overTray(ev.clientX, ev.clientY)) {
      // dragged out of a blank back to the tray
      this.api.fill(cs.id, d.from.entry, d.from.blank, null);
      this.api.sound('paper', 0);
    }
    this.held = null;
    this.render();
  }

  private slotAt(x: number, y: number): HTMLElement | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return (el?.closest('.ck-slot') as HTMLElement | null) ?? null;
  }

  private overTray(x: number, y: number): boolean {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return !!el?.closest('.ck-tray');
  }

  private onKey(e: KeyboardEvent): void {
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (this.codexDetail) {
        this.codexDetail = null;
        this.render();
      } else if (this.held || this.focusSlot) {
        this.held = null;
        this.focusSlot = null;
        this.render();
      } else this.close();
      return;
    }
    if (e.code === 'KeyJ' || (e.code === 'Tab' && document.activeElement === this.root)) {
      e.preventDefault();
      this.close();
      return;
    }
    if ((e.code === 'ArrowDown' || e.code === 'ArrowRight') && document.activeElement === this.root) {
      e.preventDefault();
      (this.root?.querySelector('.ck-slot:not([disabled]), .ck-noun, button') as HTMLElement | null)?.focus();
    }
  }

  // -------------------------------------------------------------------------------------------
  // red strings: from each find to the entries its nouns fill

  private drawStrings(): void {
    const root = this.root;
    const main = root?.querySelector('.ck-main') as HTMLElement | null;
    if (!root || !main || this.tab !== 'board') return;
    main.querySelector('svg.ck-strings')?.remove();
    const cs = this.currentCase();
    if (!cs) return;
    const box = main.getBoundingClientRect();
    const view = (main.querySelector('.ck-page-wrap') ?? main).getBoundingClientRect();
    const p = this.api.progress(cs.id);
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('class', 'ck-strings');
    s.setAttribute('width', String(box.width));
    s.setAttribute('height', String(box.height));
    const pinAt = (x: number, y: number) => {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', String(x));
      c.setAttribute('cy', String(y));
      c.setAttribute('r', '3.6');
      s.append(c);
    };
    for (const fig of main.querySelectorAll<HTMLElement>('.ck-ev')) {
      const clue = this.api.content.clues.get(fig.dataset.clue ?? '');
      if (!clue) continue;
      const nouns = new Set(clue.reveals.nouns ?? []);
      const fb = fig.getBoundingClientRect();
      const sideBox = (main.querySelector('.ck-side') ?? main).getBoundingClientRect();
      if (fb.top + 4 < sideBox.top || fb.top + 4 > sideBox.bottom) continue;
      const x0 = fb.left - box.left + 6;
      const y0 = fb.top - box.top + 4;
      for (const e of cs.entries) {
        const vals = Object.values(entryValues(p, e));
        if (!vals.some((v) => nouns.has(v))) continue;
        const slot = [...main.querySelectorAll<HTMLElement>(`.ck-slot[data-entry="${e.id}"]`)].find((el) => nouns.has(el.dataset.noun ?? ''));
        if (!slot) continue;
        const sb = slot.getBoundingClientRect();
        // only blanks that are visible in the (scrolled) page get a string
        if (sb.top + sb.height * 0.45 < view.top || sb.top + sb.height * 0.45 > view.bottom) continue;
        const x1 = sb.right - box.left - 4;
        const y1 = sb.top - box.top + sb.height * 0.45;
        const sag = 26 + Math.abs(x1 - x0) * 0.08;
        const path = document.createElementNS(ns, 'path');
        const d = `M${x0},${y0} Q${(x0 + x1) / 2},${Math.max(y0, y1) + sag} ${x1},${y1}`;
        const shadow = document.createElementNS(ns, 'path');
        shadow.setAttribute('d', d);
        shadow.setAttribute('class', 'sh');
        shadow.setAttribute('transform', 'translate(1.5 3)');
        path.setAttribute('d', d);
        s.append(shadow, path);
        pinAt(x1, y1);
      }
    }
    main.append(s);
  }

  /** Is the given entry complete (tests)? */
  entryComplete(cs: ChronikCase, entryId: string): boolean {
    const e = cs.entries.find((x) => x.id === entryId);
    return !!e && entryComplete(this.api.progress(cs.id), e);
  }

  ratio(cs: ChronikCase): number {
    return caseRatio(cs, this.api.progress(cs.id));
  }
}
