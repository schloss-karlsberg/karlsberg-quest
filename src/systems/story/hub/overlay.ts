/**
 * The hub overlay at the Quelle (field-book spread, contract C4): the Chronik, the phone (Marlene's
 * messages), the shelf on the wall's edge (RPG counts), the drawer (the wall niche: the Bussole's
 * state), the map (chapter select / continue) and the bench (rest = save).
 * Every use emits `hub:use { item }` (story-private event) so beats can react to it.
 */
import { t } from '../../../i18n';
import { h, svg } from '../../../ui/dom';
import { shelfItems } from '../../../ui/journal';
import type { ModalHandle, ModalManager } from '../../../ui/modal';
import type { HubItem } from '../types';

/** The Regal's numbers (RPG stats). */
export interface HubCounts {
  codex: number;
  codexTotal: number;
  level: number;
  xp: number;
  questsDone: number;
  questsTotal: number;
  /** Spirits undone (all kinds). */
  banned: number;
  sets: number;
  setsTotal: number;
  items: number;
}

export interface HubChapter {
  id: string;
  title: string;
  sub: string;
  unlocked: boolean;
  completed: boolean;
  current: boolean;
  placeholder: boolean;
}

export interface HubDeps {
  modals: ModalManager;
  use(item: HubItem): void;
  chapters(): HubChapter[];
  currentBeatTitle(): string;
  goto(chapter: string): void;
  rest(): boolean;
  counts(): HubCounts;
  /** Marlene's next message on the phone, or null. */
  radioLine(): string | null;
  drawerState(): 'full' | 'empty';
  blip(): void;
  reducedMotion(): boolean;
  onClose(): void;
}

const ICON: Record<HubItem, string> = {
  chronik: `<svg viewBox="0 0 64 64"><rect x="6" y="8" width="52" height="44" rx="2" fill="#b98f5a" stroke="#2a2118" stroke-width="1.6"/><rect x="6" y="8" width="52" height="44" fill="url(#kqs-h1)" opacity=".35"/><rect x="11" y="13" width="17" height="21" fill="#efe6d0" stroke="#2a2118" transform="rotate(-6 19 23)"/><rect x="33" y="15" width="19" height="15" fill="#efe6d0" stroke="#2a2118" transform="rotate(4 42 22)"/><rect x="24" y="33" width="20" height="15" fill="#e3d4b0" stroke="#2a2118" transform="rotate(-3 34 40)"/><path d="M19 16L42 18L34 36L19 16" fill="none" stroke="#a33a24" stroke-width="1.1"/><g fill="#a33a24"><circle cx="19" cy="16" r="1.8"/><circle cx="42" cy="18" r="1.8"/><circle cx="34" cy="36" r="1.8"/></g><path d="M14 20h9M14 24h8M14 28h10M36 21h12M36 25h9" stroke="#2a2118" stroke-width=".6"/></svg>`,
  phone: `<svg viewBox="0 0 64 64"><rect x="20" y="6" width="24" height="52" rx="4" fill="#2a2118" stroke="#2a2118" stroke-width="1.4"/><rect x="23" y="12" width="18" height="36" rx="1" fill="#c3cba6"/><path d="M26 18h12M26 22h9M26 30h12M26 34h7" stroke="#2a2118" stroke-width=".9"/><rect x="25" y="16" width="14" height="9" rx="2" fill="#efe6d0" stroke="#2a2118" stroke-width=".6"/><rect x="27" y="28" width="12" height="8" rx="2" fill="#45563a" opacity=".6"/><circle cx="32" cy="53" r="2" fill="#efe6d0"/><path d="M48 14c3 3 3 9 0 12M51 11c5 5 5 13 0 18" stroke="#a33a24" stroke-width="1.2" fill="none"/></svg>`,
  shelf: `<svg viewBox="0 0 64 64"><path d="M8 6v52M56 6v52M8 22h48M8 40h48M8 57h48" stroke="#2a2118" stroke-width="2" fill="none"/><g stroke="#2a2118" stroke-width=".9"><rect x="11" y="9" width="5" height="13" fill="#7c3022"/><rect x="16" y="11" width="4" height="11" fill="#45563a"/><rect x="20" y="8" width="6" height="14" fill="#b58b3d"/><rect x="27" y="12" width="3" height="10" fill="#efe6d0" transform="rotate(12 28 17)"/><rect x="38" y="27" width="14" height="13" fill="#efe6d0"/><rect x="12" y="29" width="5" height="11" fill="#2d4d6b"/><rect x="17" y="27" width="5" height="13" fill="#7a5634"/><circle cx="46" cy="16" r="5" fill="url(#kqs-brass)"/><rect x="12" y="46" width="22" height="11" fill="url(#kqs-h2)"/><rect x="40" y="47" width="10" height="10" rx="2" fill="#c3cba6"/></g></svg>`,
  map: `<svg viewBox="0 0 64 64"><path d="M6 40h52M12 40l-4 18M52 40l4 18" stroke="#2a2118" stroke-width="2" fill="none"/><path d="M10 38L16 18H52L56 38Z" fill="#efe6d0" stroke="#2a2118" stroke-width="1.3"/><path d="M18 24c8 2 10 8 18 6s10 4 16 3M16 31c6-2 12 3 18 1M30 20l-4 18M40 20l2 18" stroke="#2a2118" stroke-width=".6" fill="none"/><path d="M38 26h6v5h-6z" fill="#a33a24" opacity=".7"/><path d="M24 12l8 22M24 12l-4 22" stroke="#2a2118" stroke-width="1.4"/><circle cx="24" cy="12" r="2" fill="url(#kqs-brass)" stroke="#2a2118"/></svg>`,
  bench: `<svg viewBox="0 0 64 64"><path d="M14 44v12M50 44v12M10 56h12M42 56h12" stroke="#2a2118" stroke-width="2.2" fill="none"/><rect x="6" y="38" width="52" height="7" rx="1.5" fill="#7a5634" stroke="#2a2118" stroke-width="1.2"/><path d="M8 41h48" stroke="#2a2118" stroke-width=".6"/><rect x="8" y="24" width="48" height="6" rx="1.5" fill="#7a5634" stroke="#2a2118" stroke-width="1.2" transform="rotate(-4 32 27)"/><path d="M14 30v8M50 28v10" stroke="#2a2118" stroke-width="1.6"/><path d="M38 18c2-4 7-4 8 0" stroke="#2a2118" stroke-width=".8" fill="none"/><text x="40" y="16" font-family="Caveat, cursive" font-size="9" fill="#2a2118">z</text><text x="46" y="10" font-family="Caveat, cursive" font-size="7" fill="#2a2118">z</text></svg>`,
  drawer: `<svg viewBox="0 0 64 64"><path d="M6 20h52v34H6z" fill="#7a5634" stroke="#2a2118" stroke-width="1.6"/><path d="M6 20h52v34H6z" fill="url(#kqs-h1)" opacity=".35"/><path d="M10 28h44v22H10z" fill="#6f4a2c" stroke="#2a2118"/><rect x="26" y="36" width="12" height="4" rx="2" fill="url(#kqs-brass)" stroke="#2a2118"/><path d="M10 20l6-10h32l6 10" fill="#5a3c22" stroke="#2a2118"/><circle class="kqs-drawer-compass" cx="32" cy="15" r="6" fill="url(#kqs-brass)" stroke="#2a2118"/></svg>`,
};

export class HubOverlay {
  private m: ModalHandle | null = null;
  private radioTimer = 0;

  constructor(private readonly d: HubDeps) {}

  get open(): boolean {
    return !!this.m && !this.m.closed;
  }

  show(): void {
    if (this.open) return;
    this.m = this.d.modals.open({ title: t('story.hub.title'), wide: true, className: 'kqs-hub', backdrop: 'still', onClose: () => this.closed() });
    this.m.el.dataset.testid = 'hub';
    this.main();
  }

  close(): void {
    this.m?.close();
  }

  private closed(): void {
    window.clearInterval(this.radioTimer);
    this.m = null;
    this.d.onClose();
  }

  private tile(item: HubItem, label: string, status: string, onClick: () => void): HTMLElement {
    const icon = ICON[item];
    return h('button.kqs-hub-tile', { 'data-testid': `hub-${item}`, onclick: onClick }, [
      h('span.kqs-hub-icon', svg(icon)),
      h('span.kqs-hub-label', label),
      h('span.kqs-hub-status', status),
    ]);
  }

  private main(): void {
    const m = this.m;
    if (!m) return;
    const c = this.d.counts();
    const transcript = h('div.kqs-hub-radio', { 'data-testid': 'hub-transcript' }, [h('span.kqs-hub-radio-hint', t('story.hub.phone.idle'))]);
    const grid = h('div.kqs-hub-grid', [
      this.tile('chronik', t('story.hub.chronik'), t('story.hub.chronik.status'), () => this.d.use('chronik')),
      this.tile('phone', t('story.hub.phone'), t('story.hub.phone.status'), () => {
        this.d.use('phone');
        this.radio(transcript);
      }),
      this.tile('shelf', t('story.hub.shelf'), t('story.hub.shelf.status', { n: c.codex, total: c.codexTotal }), () => {
        this.d.use('shelf');
        this.shelf();
      }),
      this.tile('drawer', t('story.hub.drawer'), this.d.drawerState() === 'full' ? t('story.hub.drawer.full') : t('story.hub.drawer.empty'), () => {
        this.d.use('drawer');
        drawer.classList.add('kqs-done');
        drawer.querySelector('.kqs-hub-status')!.textContent = t('story.hub.drawer.taken');
      }),
      this.tile('map', t('story.hub.map'), this.d.currentBeatTitle(), () => {
        this.d.use('map');
        this.mapTable();
      }),
      this.tile('bench', t('story.hub.bench'), t('story.hub.bench.status'), () => {
        this.d.use('bench');
        const ok = this.d.rest();
        bench.querySelector('.kqs-hub-status')!.textContent = ok ? t('story.hub.bench.saved') : t('story.hub.bench.nosave');
        bench.classList.add('kqs-done');
      }),
    ]);
    const bench = grid.querySelector('[data-testid="hub-bench"]') as HTMLElement;
    const drawer = grid.querySelector('[data-testid="hub-drawer"]') as HTMLElement;
    if (this.d.drawerState() === 'empty') drawer.classList.add('kqs-empty');
    m.setBody([h('p.kqs-hub-sub', t('story.hub.sub')), grid, transcript, h('div.actions', h('button.kq-btn.primary', { onclick: () => m.close(), 'data-testid': 'hub-leave' }, t('story.hub.leave')))], t('story.hub.title'));
  }

  private radio(box: HTMLElement): void {
    const line = this.d.radioLine();
    window.clearInterval(this.radioTimer);
    const text = line ?? t('story.hub.phone.silent');
    const who = h('span.kqs-who', line ? t('story.hub.phone.marlene') : '');
    const span = h('span.kqs-typed');
    box.replaceChildren(who, span);
    if (this.d.reducedMotion()) {
      span.textContent = text;
      return;
    }
    let i = 0;
    this.radioTimer = window.setInterval(() => {
      i = Math.min(text.length, i + 2);
      span.textContent = text.slice(0, i);
      if (line && i % 6 === 0) this.d.blip();
      if (i >= text.length) window.clearInterval(this.radioTimer);
    }, 40);
  }

  private shelf(): void {
    const m = this.m;
    if (!m) return;
    const c = this.d.counts();
    const row = (k: string, v: string) => h('div.kqs-shelf-row', [h('span', k), h('span.kqs-shelf-val', v)]);
    m.setBody(
      [
        h('p.kqs-hub-sub', t('story.hub.shelf.sub')),
        h('div.kqs-shelf', [
          // the field book in RPG terms (playtest round 3: "Begriffe" and "Chronik-Einträge" were
          // leftovers of the old quiz board)
          row(t('story.hub.shelf.level'), t('story.hub.shelf.levelVal', { n: c.level, xp: c.xp })),
          row(t('story.hub.shelf.quests'), `${c.questsDone} / ${c.questsTotal}`),
          row(t('story.hub.shelf.banned'), String(c.banned)),
          row(t('story.hub.shelf.codex'), `${c.codex} / ${c.codexTotal}`),
          row(t('story.hub.shelf.sets'), `${c.sets} / ${c.setsTotal}`),
          row(t('story.hub.shelf.items'), String(c.items)),
        ]),
        ...shelfItems(),
        h('div.actions', h('button.kq-btn', { onclick: () => this.main(), 'data-testid': 'hub-back' }, t('settings.back'))),
      ],
      t('story.hub.shelf'),
    );
  }

  private mapTable(): void {
    const m = this.m;
    if (!m) return;
    const list = h(
      'ol.kqs-chapters',
      this.d.chapters().map((ch) =>
        h(`li${ch.current ? '.current' : ''}${ch.unlocked ? '' : '.locked'}`, [
          h('button.kqs-chapter', {
            disabled: !ch.unlocked,
            'data-testid': `chapter-${ch.id}`,
            onclick: () => {
              if (ch.current) {
                m.close();
                return;
              }
              void this.d.modals.confirm(t('story.hub.map.confirm', { title: ch.title })).then((yes) => {
                if (!yes) return;
                m.close();
                this.d.goto(ch.id);
              });
            },
          }, [
            h('span.kqs-ch-title', ch.unlocked ? ch.title : t('story.hub.map.locked')),
            h('span.kqs-ch-sub', ch.unlocked ? ch.sub : '· · ·'),
            ch.current ? h('span.kqs-ch-tag', t('story.hub.map.current')) : ch.completed ? h('span.kqs-ch-tag.done', t('story.hub.map.done')) : null,
            ch.placeholder && ch.unlocked ? h('span.kqs-ch-tag.ph', t('story.placeholder')) : null,
          ]),
        ]),
      ),
    );
    m.setBody(
      [
        h('p.kqs-hub-sub', t('story.hub.map.sub')),
        list,
        h('div.actions', [
          h('button.kq-btn.primary', { onclick: () => m.close(), 'data-testid': 'hub-continue' }, t('story.hub.map.continue', { beat: this.d.currentBeatTitle() })),
          h('button.kq-btn', { onclick: () => this.main(), 'data-testid': 'hub-back' }, t('settings.back')),
        ]),
      ],
      t('story.hub.map'),
    );
  }
}
