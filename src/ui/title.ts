import { t } from '../i18n';
import { LANTERN_SVG, h, svg } from './dom';
import type { BootLoader } from './loader';
import { newsUnseen, versionLabel } from './news';

export interface TitleCallbacks {
  /** `fresh` = start a new field book instead of continuing. */
  onStart(fresh: boolean): void;
  onLicences(): void;
  /** „Neuigkeiten“ (release notes); call `title.refreshNews()` once they were seen. */
  onNews?(): void;
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

/** Title screen: a field-book page over the slowly drifting world. */
export class TitleScreen {
  readonly el: HTMLElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly newBtn: HTMLButtonElement;
  private readonly settingsBtn: HTMLButtonElement;
  private readonly extrasEl: HTMLElement;
  private readonly newsBadge: HTMLElement;
  private hasSave = false;
  private busy = false;

  constructor(private readonly cb: TitleCallbacks, private readonly loader?: BootLoader) {
    this.startBtn = h('button.kq-btn.primary.kq-lantern-btn.kq-hidden', { disabled: true, 'data-testid': 'title-continue', onclick: () => this.start(false) }, [
      svg(LANTERN_SVG),
      h('span', t('title.continue')),
    ]);
    this.newBtn = h('button.kq-btn.kq-lantern-btn', { disabled: true, 'data-testid': 'title-new', onclick: () => void this.newGame() }, [svg(LANTERN_SVG), h('span', t('title.newGame'))]);
    this.settingsBtn = h('button.kq-btn', { 'data-testid': 'title-settings', onclick: () => titleHooks.openSettings?.() }, t('pause.settings'));
    this.extrasEl = h('div.kq-title-extras');
    this.newsBadge = h('span.kq-news-badge', { 'aria-label': t('news.unseen'), title: t('news.unseen') });
    const newsBtn = h('button.kq-link.kq-news-link', { 'data-testid': 'title-news', onclick: () => cb.onNews?.() }, [h('span', t('title.news')), this.newsBadge]);
    this.refreshNews();
    const page = h('div.kq-title-page.kq-paper', [
      h('h1', t('game.title')),
      h('p.sub', t('game.subtitle')),
      h('p.note', t('title.headphones')),
      h('div.actions', [this.startBtn, this.newBtn, this.extrasEl, this.settingsBtn]),
      h('p.motto', t('title.motto')),
      h('p.controls', t('title.hint')),
      h('div.kq-title-links', [newsBtn, h('button.kq-link', { onclick: () => cb.onLicences() }, t('title.licences'))]),
      h('p.kq-title-version', { 'data-testid': 'title-version' }, versionLabel()),
    ]);
    this.el = h('div.kq-title', { 'data-testid': 'title' }, page);
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
    (this.startBtn.lastElementChild as HTMLElement).textContent = t('title.continue');
    (this.newBtn.lastElementChild as HTMLElement).textContent = t('title.newGame');
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
            if (go) this.start(false);
          },
        }, a.label),
      ),
    );
    this.extrasEl.classList.toggle('kq-hidden', !list.length);
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
