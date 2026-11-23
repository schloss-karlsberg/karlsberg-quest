import { t } from '../i18n';
import { h } from './dom';

/** ARIA and the dial share the same rounded percentage. Unknown totals stay indeterminate. */
export function loadPercent(done: number, total: number): number | undefined {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return undefined;
  return Math.round(Math.min(1, Math.max(0, done / total)) * 100);
}

export class LoaderView {
  readonly compass: SVGSVGElement;
  private readonly display: HTMLElement;
  private readonly label: HTMLElement;

  constructor(readonly el: HTMLElement) {
    this.display = el.querySelector('.kq-loader-display')!;
    this.compass = this.display.querySelector('svg')!;
    this.label = this.display.querySelector('span')!;
  }

  static inGame(compass: SVGSVGElement): LoaderView {
    return new LoaderView(h('div.kq-loader.kq-loader--game', { hidden: true }, [
      h('div.kq-loader-display', [compass.cloneNode(true), h('span')]),
    ]));
  }

  show(label: string, percent?: number, name = label): void {
    this.el.hidden = false;
    this.el.setAttribute('aria-busy', 'true');
    this.display.setAttribute('role', 'progressbar');
    this.display.setAttribute('aria-label', name);
    if (this.label.textContent !== label) this.label.textContent = label;
    if (percent === undefined) this.clearProgress();
    else {
      this.display.setAttribute('aria-valuenow', String(percent));
      this.display.style.setProperty('--loaded', String(percent));
    }
  }

  hide(): void {
    this.el.hidden = true;
    this.clearBusy();
    this.display.removeAttribute('role');
  }

  fail(message: string): void {
    this.clearBusy();
    this.display.setAttribute('role', 'alert');
    this.label.textContent = message;
    this.el.hidden = false;
  }

  private clearBusy(): void {
    this.el.removeAttribute('aria-busy');
    this.display.removeAttribute('aria-label');
    this.clearProgress();
  }

  private clearProgress(): void {
    this.display.removeAttribute('aria-valuenow');
    this.display.style.removeProperty('--loaded');
  }
}

export class BootLoader extends LoaderView {
  setProgress(done: number, total: number): void {
    const percent = loadPercent(done, total);
    const name = t('loader.terrain');
    this.show(percent === undefined ? name : t('title.loading', { pct: percent }), percent, name);
  }
}

const SHOW_DELAY_MS = 300;

export interface LoadingRequest {
  progress(done: number, total: number): void;
  finish(): void;
}

interface PendingLoad {
  label: string;
  priority: number;
  visible: boolean;
  percent?: number;
}

/** Delay short waits and show one request at a time. The most recent wins within a priority. */
export class LoadingRequests {
  private readonly pending = new Set<PendingLoad>();
  private enabled = false;
  private displayed: PendingLoad | undefined;

  constructor(private readonly view: Pick<LoaderView, 'show' | 'hide'>) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.render();
  }

  begin(label: string, priority = 0): LoadingRequest {
    const request: PendingLoad = { label, priority, visible: false };
    this.pending.add(request);
    const timer = setTimeout(() => {
      request.visible = true;
      this.render();
    }, SHOW_DELAY_MS);
    return {
      progress: (done, total) => {
        if (!this.pending.has(request)) return;
        const percent = loadPercent(done, total);
        request.percent = percent === undefined ? undefined : Math.max(request.percent ?? 0, percent);
        if (this.displayed === request) this.render();
      },
      finish: () => {
        clearTimeout(timer);
        if (this.pending.delete(request) && this.displayed === request) this.render();
      },
    };
  }

  private render(): void {
    let active: PendingLoad | undefined;
    if (this.enabled) {
      for (const request of this.pending) {
        if (request.visible && (!active || request.priority >= active.priority)) active = request;
      }
    }
    if (active) this.view.show(active.label, active.percent);
    else if (this.displayed) this.view.hide();
    this.displayed = active;
  }
}
