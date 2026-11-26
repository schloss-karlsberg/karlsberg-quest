import type { SaveManager } from '../core/save';
import { t } from '../i18n';
import { h } from './dom';
import type { BootLoader } from './loader';
import { newsUnseen, versionLabel } from './news';

type TitleStart = 'new' | 'continue' | 'extra';

export interface TitleCallbacks {
  save: Pick<SaveManager, 'availability' | 'readRaw' | 'load' | 'enabled'>;
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
  /** Render into `host`. Resolve false to cancel, or return a callback to apply choices at start. */
  beforeNewGame?(host: HTMLElement): Promise<boolean | (() => void)>;
  openSettings?(): void;
  /**
   * Extra main-menu entries, asked for each time the title becomes ready (e.g. the story's "Ende
   * noch einmal wählen" once an ending was reached). After checking the autosave, `run` prepares
   * the state synchronously and returns true to start play or false to stay on the title.
   */
  extraActions?(): TitleAction[];
}
export interface TitleAction {
  label: string;
  testid: string;
  run(): boolean;
}
export const titleHooks: TitleHooks = {};

/** Title screen: a paper menu over the slowly drifting world. */
export class TitleScreen {
  readonly el: HTMLElement;
  private readonly page: HTMLElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly newBtn: HTMLButtonElement;
  private readonly saveStatus: HTMLElement;
  private readonly settingsBtn: HTMLButtonElement;
  private readonly extrasEl: HTMLElement;
  private readonly newsBadge: HTMLElement;
  private busy = false;

  constructor(private readonly cb: TitleCallbacks, private readonly loader?: BootLoader) {
    this.startBtn = h('button.kq-btn.primary.kq-hidden', { disabled: true, 'data-testid': 'title-continue', onclick: () => this.start('continue') }, t('title.continue'));
    this.newBtn = h('button.kq-btn', { disabled: true, 'data-testid': 'title-new', onclick: () => this.newGame() }, t('title.newGame'));
    this.saveStatus = h('p.kq-hidden', { role: 'status', 'data-testid': 'title-save-status' });
    this.settingsBtn = h('button.kq-btn', { 'data-testid': 'title-settings', onclick: () => titleHooks.openSettings?.() }, t('pause.settings'));
    this.extrasEl = h('div.kq-title-extras');
    this.newsBadge = h('span.kq-news-badge', { 'aria-label': t('news.unseen'), title: t('news.unseen') });
    const newsBtn = h('button.kq-link.kq-news-link', { 'data-testid': 'title-news', onclick: () => cb.onNews?.() }, [h('span', t('title.news')), this.newsBadge]);
    this.refreshNews();
    this.page = h('div.kq-title-page.kq-paper', [
      h('h1', t('game.title')),
      h('p.note', t('title.headphones')),
      this.saveStatus,
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

  setReady(): void {
    const autosave = this.cb.save.readRaw();
    const availability = this.cb.save.availability();
    const canContinue = availability === 'readable';
    const unreadable = availability === 'unreadable';
    this.busy = false;
    this.startBtn.disabled = !canContinue;
    this.newBtn.disabled = false;
    this.loader?.hide();
    this.startBtn.textContent = t('title.continue');
    this.newBtn.textContent = t('title.newGame');
    this.startBtn.classList.toggle('kq-hidden', !canContinue);
    this.newBtn.classList.toggle('primary', !canContinue);
    this.saveStatus.textContent = unreadable ? t('title.unreadableSave') : '';
    this.saveStatus.classList.toggle('kq-hidden', !unreadable);
    this.settingsBtn.classList.toggle('kq-hidden', !titleHooks.openSettings);
    this.renderExtras(autosave);
    if (!this.el.inert && (document.activeElement === document.body || this.el.contains(document.activeElement))) {
      (canContinue ? this.startBtn : this.newBtn).focus();
    }
  }

  private renderExtras(autosave: string | null): void {
    const list = titleHooks.extraActions?.() ?? [];
    this.extrasEl.replaceChildren(
      ...list.map((a) =>
        h('button.kq-btn', {
          'data-testid': a.testid,
          onclick: async () => {
            if (this.busy || this.newBtn.disabled) return;
            this.busy = true;
            try {
              await this.startAfterSaveCheck('extra', autosave, () => {
                try {
                  return a.run();
                } catch (err) {
                  console.error('[title] action failed', err);
                  return false;
                }
              });
            } finally {
              this.busy = false;
            }
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
      const approved = this.cb.save.enabled ? this.cb.save.readRaw() : null;
      if (approved !== null && !(await this.cb.confirm(t('title.confirmNew')))) {
        this.setReady();
        return;
      }
      let go: boolean | (() => void) = false;
      if (titleHooks.beforeNewGame) {
        this.page.inert = true;
        try {
          go = await titleHooks.beforeNewGame(this.el);
        } catch (err) {
          console.error('[title] new-game flow failed', err);
        } finally {
          this.page.inert = false;
        }
        if (!go) {
          this.setReady();
          return;
        }
      }
      await this.startAfterSaveCheck('new', approved, () => {
        if (typeof go === 'function') go();
        return true;
      });
    } finally {
      this.busy = false;
    }
  }

  private async startAfterSaveCheck(mode: 'new' | 'extra', approved: string | null, prepare: () => boolean): Promise<void> {
    // Another tab can write after the title appears, during setup, or during confirmation.
    while (this.cb.save.enabled) {
      const current = this.cb.save.readRaw();
      if (current === null || current === approved) break;
      if (!(await this.cb.confirm(t(mode === 'new' ? 'title.confirmNew' : 'title.confirmReplay')))) {
        this.setReady();
        return;
      }
      approved = current;
    }
    if (prepare()) this.start(mode);
    else this.setReady();
  }

  private start(mode: TitleStart): void {
    if (this.newBtn.disabled) return;
    if (mode === 'continue') {
      if (this.busy || this.startBtn.disabled) return;
      if (!this.cb.save.load()) {
        this.setReady();
        return;
      }
    }
    this.startBtn.disabled = true;
    this.newBtn.disabled = true;
    this.cb.onStart(mode);
  }

  show(): void {
    this.el.inert = false;
    this.el.classList.remove('fade-out', 'kq-hidden');
    this.setReady();
  }

  hide(instant = false): void {
    this.el.inert = true;
    if (instant) this.el.classList.add('kq-hidden');
    else {
      this.el.classList.add('fade-out');
      setTimeout(() => this.el.classList.add('kq-hidden'), 950);
    }
  }
}
