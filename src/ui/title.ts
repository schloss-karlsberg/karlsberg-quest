import { t } from '../i18n';
import { LANTERN_SVG, h, svg } from './dom';

export interface TitleCallbacks {
  /** `fresh` = start a new field book instead of continuing. */
  onStart(fresh: boolean): void;
  onLicences(): void;
  confirm(text: string): Promise<boolean>;
}

/**
 * Extension points for features (the story system installs them at init): the new-game flow
 * (content warning, name entry, "light the lantern") and the settings page. Without hooks the
 * title starts a new game directly.
 */
export interface TitleHooks {
  /** Runs before a new game starts; render into `host` (the title root). Resolve false to cancel. */
  beforeNewGame?(host: HTMLElement): Promise<boolean>;
  openSettings?(): void;
}
export const titleHooks: TitleHooks = {};

/** Title screen: a field-book page over the slowly drifting world. */
export class TitleScreen {
  readonly el: HTMLElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly newBtn: HTMLButtonElement;
  private readonly settingsBtn: HTMLButtonElement;
  private readonly loadingEl: HTMLElement;
  private hasSave = false;
  private busy = false;

  constructor(private readonly cb: TitleCallbacks) {
    this.startBtn = h('button.kq-btn.primary.kq-lantern-btn.kq-hidden', { disabled: true, 'data-testid': 'title-continue', onclick: () => this.start(false) }, [
      svg(LANTERN_SVG),
      h('span', t('title.continue')),
    ]);
    this.newBtn = h('button.kq-btn.kq-lantern-btn', { disabled: true, 'data-testid': 'title-new', onclick: () => void this.newGame() }, [svg(LANTERN_SVG), h('span', t('title.newGame'))]);
    this.settingsBtn = h('button.kq-btn', { 'data-testid': 'title-settings', onclick: () => titleHooks.openSettings?.() }, t('pause.settings'));
    this.loadingEl = h('div.loading', t('title.loading', { pct: 0 }));
    const page = h('div.kq-title-page.kq-paper', [
      h('h1', t('game.title')),
      h('p.sub', t('game.subtitle')),
      h('p.note', t('title.headphones')),
      h('div.actions', [this.startBtn, this.newBtn, this.settingsBtn, this.loadingEl]),
      h('p.motto', t('title.motto')),
      h('p.controls', t('title.hint')),
      h('button.kq-link', { onclick: () => cb.onLicences() }, t('title.licences')),
    ]);
    this.el = h('div.kq-title', { 'data-testid': 'title' }, page);
  }

  setProgress(frac: number): void {
    this.loadingEl.textContent = t('title.loading', { pct: Math.round(frac * 100) });
  }

  setFailed(msg: string): void {
    this.loadingEl.textContent = `${t('title.loadFailed')} (${msg})`;
  }

  setReady(hasSave: boolean): void {
    this.hasSave = hasSave;
    this.busy = false;
    this.startBtn.disabled = false;
    this.newBtn.disabled = false;
    this.loadingEl.textContent = '';
    (this.startBtn.lastElementChild as HTMLElement).textContent = t('title.continue');
    (this.newBtn.lastElementChild as HTMLElement).textContent = t('title.newGame');
    this.startBtn.classList.toggle('kq-hidden', !hasSave);
    this.newBtn.classList.toggle('primary', !hasSave);
    this.settingsBtn.classList.toggle('kq-hidden', !titleHooks.openSettings);
    (hasSave ? this.startBtn : this.newBtn).focus();
  }

  private async newGame(): Promise<void> {
    if (this.busy || this.newBtn.disabled) return;
    if (this.hasSave && !(await this.cb.confirm(t('title.confirmNew')))) return;
    if (titleHooks.beforeNewGame) {
      this.busy = true;
      const go = await titleHooks.beforeNewGame(this.el).catch((err) => {
        console.error('[title] new-game flow failed', err);
        return true;
      });
      this.busy = false;
      if (!go) return;
    }
    this.start(true);
  }

  private start(fresh: boolean): void {
    if (this.startBtn.disabled) return;
    this.startBtn.disabled = true;
    this.newBtn.disabled = true;
    this.cb.onStart(fresh);
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
