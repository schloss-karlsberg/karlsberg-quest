import { t } from '../i18n';
import { h } from './dom';
import { preserveFocus } from './focus';
import type { ModalHandle, ModalManager } from './modal';

interface PausePage {
  id: string;
  label: string;
  order: number;
  title?: string;
  className?: string;
  render(el: HTMLElement): void;
  badge?(): number;
  opened?(): void;
  hide?(): void;
}

const pages: PausePage[] = [];
const openPages = new Map<string, { handle: ModalHandle; refresh(): void }>();

export function addPausePage(page: PausePage): void {
  const i = pages.findIndex((entry) => entry.id === page.id);
  if (i >= 0) pages.splice(i, 1, page);
  else pages.push(page);
  pages.sort((a, b) => a.order - b.order);
}

export function pausePages(): readonly PausePage[] {
  return pages;
}

export function pausePageHandle(id: string): ModalHandle | undefined {
  return openPages.get(id)?.handle;
}

export function refreshPausePage(id: string): void {
  openPages.get(id)?.refresh();
}

export function openPausePage(modals: ModalManager, id: string, onClose?: () => void): ModalHandle | undefined {
  const current = pausePageHandle(id);
  if (current) return current;
  const page = pages.find((entry) => entry.id === id);
  if (!page) return;
  const title = page.title ?? page.label;
  const body = h('div');
  const handle = modals.open({
    title,
    body,
    wide: true,
    className: ['kq-pause-page', page.className].filter(Boolean).join(' '),
    backdrop: 'still',
    actions: [{ label: t('settings.back') }],
    onClose: () => {
      openPages.delete(id);
      page.hide?.();
      onClose?.();
    },
  });
  handle.el.dataset.testid = `page-${id}`;
  openPages.set(id, {
    handle,
    refresh: () => {
      const scroll = body.parentElement;
      const top = scroll?.scrollTop ?? 0;
      preserveFocus(body, () => page.render(body));
      if (scroll) scroll.scrollTop = top;
    },
  });
  page.render(body);
  page.opened?.();
  return handle;
}

/**
 * A section another feature adds to a page it does not own (e.g. the Fläschchen row on the quests
 * system's "Sammlungen" page). The owner of the page calls `pageSections(pageId)` and appends each
 * section's element after its own content.
 */
export interface PageSection {
  id: string;
  page: string;
  order: number;
  render(): HTMLElement | null;
}

const sections: PageSection[] = [];

/** Register (or replace, by id) a section of a page. */
export function addPageSection(s: PageSection): void {
  const i = sections.findIndex((x) => x.id === s.id);
  if (i >= 0) sections.splice(i, 1, s);
  else sections.push(s);
  sections.sort((a, b) => a.order - b.order);
}

/** The rendered sections of a page, in order. */
export function pageSections(page: string): HTMLElement[] {
  return sections.filter((s) => s.page === page).map((s) => s.render()).filter((e): e is HTMLElement => !!e);
}
