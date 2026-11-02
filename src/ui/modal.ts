import { t } from '../i18n';
import { clear, h } from './dom';

export interface ModalAction {
  label: string;
  primary?: boolean;
  /** Return false to keep the modal open. */
  onClick?: () => void | boolean;
}

export interface ModalOptions {
  title?: string;
  /** Body: element, list of elements or plain text (rendered as paragraphs). */
  body?: HTMLElement | HTMLElement[] | string;
  actions?: ModalAction[];
  /** Escape / close button / backdrop close it (default true). */
  closable?: boolean;
  wide?: boolean;
  className?: string;
  onClose?: () => void;
}

export interface ModalHandle {
  readonly el: HTMLElement;
  /** Replace the body (e.g. sub-pages of a menu). */
  setBody(body: ModalOptions['body'], title?: string): void;
  close(): void;
  readonly closed: boolean;
}

/**
 * Stacked field-book panels. While any modal is open the game is paused and gameplay input is
 * disabled (via the `onChange` callback wired in boot). Features reuse this for the Chronik,
 * codex cards, dialogue choices etc.
 */
export class ModalManager {
  private readonly stack: ModalHandle[] = [];
  onChange: (open: number) => void = () => {};

  constructor(private readonly root: HTMLElement) {
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.code !== 'Escape' || !this.stack.length) return;
        const top = this.stack[this.stack.length - 1]!;
        if ((top as ModalHandle & { closable: boolean }).closable) {
          e.stopImmediatePropagation();
          e.preventDefault();
          top.close();
        }
      },
      true,
    );
    // keyboard focus stays inside the top panel (Tab / Shift+Tab wrap around)
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Tab' || e.defaultPrevented || !this.stack.length) return;
      const top = this.stack[this.stack.length - 1]!.el;
      const f = [...top.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
      );
      if (!f.length) return;
      const a = document.activeElement as HTMLElement | null;
      if (!a || !top.contains(a)) {
        e.preventDefault();
        (e.shiftKey ? f[f.length - 1]! : f[0]!).focus();
      } else if (!e.shiftKey && a === f[f.length - 1]) {
        e.preventDefault();
        f[0]!.focus();
      } else if (e.shiftKey && a === f[0]) {
        e.preventDefault();
        f[f.length - 1]!.focus();
      }
    });
  }

  get count(): number {
    return this.stack.length;
  }

  open(o: ModalOptions): ModalHandle {
    const closable = o.closable ?? true;
    const page = h(`div.kq-modal.kq-paper${o.wide ? '.wide' : ''}`, { role: 'dialog', 'aria-modal': 'true' });
    if (o.className) page.classList.add(...o.className.split(' '));
    const layer = h('div.kq-modal-layer', page);
    const titleEl = h('h2');
    const bodyEl = h('div.kq-modal-body');
    const actionsEl = h('div.actions');
    if (closable) page.append(h('button.close', { 'aria-label': t('modal.close'), onclick: () => handle.close() }, '×'));
    page.append(titleEl, bodyEl, actionsEl);
    let closed = false;
    const handle: ModalHandle & { closable: boolean } = {
      el: page,
      closable,
      get closed() {
        return closed;
      },
      setBody: (body, title) => {
        if (title !== undefined) titleEl.textContent = title;
        titleEl.style.display = titleEl.textContent ? '' : 'none';
        clear(bodyEl);
        if (typeof body === 'string') for (const p of body.split(/\n\n+/)) bodyEl.append(h('p', p));
        else if (Array.isArray(body)) bodyEl.append(...body);
        else if (body) bodyEl.append(body);
      },
      close: () => {
        if (closed) return;
        closed = true;
        layer.remove();
        const i = this.stack.indexOf(handle);
        if (i >= 0) this.stack.splice(i, 1);
        o.onClose?.();
        this.onChange(this.stack.length);
      },
    };
    handle.setBody(o.body, o.title ?? '');
    for (const a of o.actions ?? []) {
      actionsEl.append(
        h(`button.kq-btn${a.primary ? '.primary' : ''}`, {
          onclick: () => {
            if (a.onClick?.() !== false) handle.close();
          },
        }, a.label),
      );
    }
    if (!o.actions?.length) actionsEl.remove();
    if (closable) layer.addEventListener('mousedown', (e) => e.target === layer && handle.close());
    this.root.append(layer);
    this.stack.push(handle);
    this.onChange(this.stack.length);
    queueMicrotask(() => (page.querySelector('button.kq-btn, button, input') as HTMLElement | null)?.focus());
    return handle;
  }

  /** Simple yes/no confirm. */
  confirm(text: string, yes = t('common.yes'), no = t('common.no')): Promise<boolean> {
    return new Promise((resolve) => {
      let answered = false;
      this.open({
        body: text,
        actions: [
          { label: no, onClick: () => { answered = true; resolve(false); } },
          { label: yes, primary: true, onClick: () => { answered = true; resolve(true); } },
        ],
        onClose: () => !answered && resolve(false),
      });
    });
  }

  closeAll(): void {
    for (const m of [...this.stack]) m.close();
  }
}
