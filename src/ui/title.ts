import type { SaveManager } from '../core/save';
import { t } from '../i18n';
import { h } from './dom';
import type { BootLoader } from './loader';
import { newsUnseen, versionLabel } from './news';

type TitleStart = 'new' | 'continue' | 'extra';

export interface TitleCallbacks {
  save: Pick<SaveManager, 'load' | 'enabled'>;
  onStart(mode: TitleStart): void;
  onLicences(): void;
  /** „Neuigkeiten“ (release notes); call `title.refreshNews()` once they were seen. */
  onNews?(): void;
  confirm(text: string): Promise<boolean>;
}

/**
 * Extension points for features (the story system installs them at init): the new-game flow
 * (content warning, name entry, tour map) and the settings page. Without hooks the
 * title starts a new game directly.
 */
export interface TitleHooks {
  /** Runs before a new game starts; render into `host` (the title root). Resolve false to cancel. */
  beforeNewGame?(host: HTMLElement): Promise<boolean>;
  openSettings?(): void;
  /**
   * Extra main-menu entries, asked for each time the title becomes ready (e.g. the story's "Ende
   * noch einmal wählen" once an ending was reached). `run` prepares the state (e.g. loads a slot);
   * resolve true to continue into the game, false to stay on the title.
   */
  extraActions?(): TitleAction[];
}
export interface TitleAction {
  label: string;
  testid: string;
  run(): boolean | Promise<boolean>;
}
export const titleHooks: TitleHooks = {};

/** Title screen: a paper menu over the slowly drifting world. */
export class TitleScreen {
  readonly el: HTMLElement;
  private readonly page: HTMLElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly newBtn: HTMLButtonElement;
  private readonly settingsBtn: HTMLButtonElement;
  private readonly extrasEl: HTMLElement;
  private readonly newsBadge: HTMLElement;
  private hasSave = false;
  private busy = false;

  constructor(private readonly cb: TitleCallbacks, private readonly loader?: BootLoader) {
    this.startBtn = h('button.kq-btn.primary.kq-hidden', { disabled: true, 'data-testid': 'title-continue', onclick: () => this.start('continue') }, t('title.continue'));
    this.newBtn = h('button.kq-btn', { disabled: true, 'data-testid': 'title-new', onclick: () => this.newGame() }, t('title.newGame'));
    this.settingsBtn = h('button.kq-btn', { 'data-testid': 'title-settings', onclick: () => titleHooks.openSettings?.() }, t('pause.settings'));
    this.extrasEl = h('div.kq-title-extras');
    this.newsBadge = h('span.kq-news-badge', { 'aria-label': t('news.unseen'), title: t('news.unseen') });
    const newsBtn = h('button.kq-link.kq-news-link', { 'data-testid': 'title-news', onclick: () => cb.onNews?.() }, [h('span', t('title.news')), this.newsBadge]);
    this.refreshNews();
    this.page = h('div.kq-title-page.kq-paper', [
      h('h1', t('game.title')),
      h('p.note', t('title.headphones')),
      h('div.actions', [this.startBtn, this.newBtn, this.extrasEl, this.settingsBtn]),
      h('p.controls', t('title.hint')),
      h('div.kq-title-links', [newsBtn, h('button.kq-link', { onclick: () => cb.onLicences() }, t('title.licences'))]),
      h('p.kq-title-version', { 'data-testid': 'title-version' }, versionLabel()),
    ]);
    this.el = h('div.kq-title', { 'data-testid': 'title' }, this.page);
  }

  /** Move the first-paint loader only once the title is connected, keeping its viewport position. */
  adoptLoader(): void {
    if (this.loader) this.el.append(this.loader.el);
  }

  /** Show or hide the „neu“ badge on „Neuigkeiten“ (newest notes not opened yet). */
  refreshNews(): void {
    this.newsBadge.classList.toggle('kq-hidden', !newsUnseen());
  }

  setReady(hasSave: boolean): void {
    this.hasSave = hasSave;
    this.busy = false;
    this.startBtn.disabled = false;
    this.newBtn.disabled = false;
    this.loader?.hide();
    this.startBtn.textContent = t('title.continue');
    this.newBtn.textContent = t('title.newGame');
    this.startBtn.classList.toggle('kq-hidden', !hasSave);
    this.newBtn.classList.toggle('primary', !hasSave);
    this.settingsBtn.classList.toggle('kq-hidden', !titleHooks.openSettings);
    this.renderExtras();
    (hasSave ? this.startBtn : this.newBtn).focus();
  }

  private renderExtras(): void {
    const list = titleHooks.extraActions?.() ?? [];
    this.extrasEl.replaceChildren(
      ...list.map((a) =>
        h('button.kq-btn', {
          'data-testid': a.testid,
          onclick: async () => {
            if (this.busy || this.startBtn.disabled) return;
            this.busy = true;
            const go = await Promise.resolve(a.run()).catch((err) => {
              console.error('[title] action failed', err);
              return false;
            });
            this.busy = false;
            if (go) this.start('extra');
          },
        }, a.label),
      ),
    );
    this.extrasEl.classList.toggle('kq-hidden', !list.length);
  }

  private async newGame(): Promise<void> {
    if (this.busy || this.newBtn.disabled) return;
    this.busy = true;
    try {
      if (this.hasSave && this.cb.save.enabled && !(await this.cb.confirm(t('title.confirmNew')))) return;
      if (titleHooks.beforeNewGame) {
        let go = true;
        this.page.inert = true;
        try {
          go = await titleHooks.beforeNewGame(this.el);
        } catch (err) {
          console.error('[title] new-game flow failed', err);
        } finally {
          this.page.inert = false;
        }
        if (!go) {
          this.newBtn.focus();
          return;
        }
      }
      this.start('new');
    } finally {
      this.busy = false;
    }
  }

  private start(mode: TitleStart): void {
    if (this.startBtn.disabled) return;
    if (mode === 'continue' && (this.busy || !this.hasSave || !this.cb.save.load())) return;
    this.startBtn.disabled = true;
    this.newBtn.disabled = true;
    this.cb.onStart(mode);
  }

  show(): void {
    this.el.classList.remove('fade-out', 'kq-hidden');
    this.startBtn.disabled = false;
    this.newBtn.disabled = false;
  }

  hide(instant = false): void {
    if (instant) this.el.classList.add('kq-hidden');
    else {
      this.el.classList.add('fade-out');
      setTimeout(() => this.el.classList.add('kq-hidden'), 950);
    }
  }
}
