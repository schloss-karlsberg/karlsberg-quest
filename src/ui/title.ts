import { t } from '../i18n';
import { LANTERN_SVG, h, svg } from './dom';

export interface TitleCallbacks {
  /** `fresh` = start a new field book instead of continuing. */
  onStart(fresh: boolean): void;
  onLicences(): void;
  confirm(text: string): Promise<boolean>;
}

/** Title screen: a field-book page over the slowly drifting world. */
export class TitleScreen {
  readonly el: HTMLElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly newBtn: HTMLButtonElement;
  private readonly loadingEl: HTMLElement;
  private hasSave = false;

  constructor(private readonly cb: TitleCallbacks) {
    this.startBtn = h('button.kq-btn.primary.kq-lantern-btn', { disabled: true, 'data-testid': 'light-lantern', onclick: () => this.start(false) }, [
      svg(LANTERN_SVG),
      h('span', t('title.light')),
    ]);
    this.newBtn = h('button.kq-link.kq-hidden', { onclick: () => void this.newGame() }, t('title.newGame'));
    this.loadingEl = h('div.loading', t('title.loading', { pct: 0 }));
    const page = h('div.kq-title-page.kq-paper', [
      h('h1', t('game.title')),
      h('p.sub', t('game.subtitle')),
      h('p.note', t('title.headphones')),
      h('div.actions', [this.startBtn, this.newBtn, this.loadingEl]),
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
    this.startBtn.disabled = false;
    this.loadingEl.textContent = '';
    (this.startBtn.lastElementChild as HTMLElement).textContent = t('title.light');
    this.newBtn.classList.toggle('kq-hidden', !hasSave);
    this.startBtn.focus();
  }

  private async newGame(): Promise<void> {
    if (this.hasSave && !(await this.cb.confirm(t('title.confirmNew')))) return;
    this.start(true);
  }

  private start(fresh: boolean): void {
    if (this.startBtn.disabled) return;
    this.startBtn.disabled = true;
    this.cb.onStart(fresh);
  }

  show(): void {
    this.el.classList.remove('fade-out', 'kq-hidden');
    this.startBtn.disabled = false;
  }

  hide(instant = false): void {
    if (instant) this.el.classList.add('kq-hidden');
    else {
      this.el.classList.add('fade-out');
      setTimeout(() => this.el.classList.add('kq-hidden'), 950);
    }
  }
}
