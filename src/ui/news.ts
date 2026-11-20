import { KQ_BUILD, KQ_VERSION } from '../buildInfo';
import { t } from '../i18n';
import { h } from './dom';
import type { ModalHandle, ModalManager } from './modal';
import { type Block, type Inline, type ReleaseNote, collectNotes, hasUnseen, markSeen, parseMarkdown, readSeen } from './releaseNotes';

/** All player notes, bundled at build time (content/release-notes/vX.Y.Z.md), newest first. */
const files = import.meta.glob<string>('/content/release-notes/*.md', { query: '?raw', import: 'default', eager: true });
export const RELEASE_NOTES: ReleaseNote[] = collectNotes(files);

export function latestNotesVersion(): string | null {
  return RELEASE_NOTES[0]?.version ?? null;
}

/** True while the newest notes are newer than the last ones the player opened. */
export function newsUnseen(): boolean {
  return hasUnseen(latestNotesVersion(), readSeen());
}

/** "Version 0.5.0 · Build abc1234" for the title screen. */
export function versionLabel(): string {
  return t('title.version', { version: KQ_VERSION, build: KQ_BUILD });
}

function inline(parts: Inline[]): (Node | string)[] {
  // text nodes only: the markdown is never parsed as HTML
  return parts.map((p) => (p.bold ? h('strong', p.text) : p.text));
}

/** The markdown subset as DOM nodes; headings are demoted below the modal's h2. */
export function renderBlocks(blocks: Block[]): HTMLElement[] {
  return blocks.map((b) => {
    if (b.type === 'heading') return h(b.level <= 1 ? 'h3' : 'h4', inline(b.inline));
    if (b.type === 'list') return h('ul', b.items.map((it) => h('li', inline(it))));
    return h('p', inline(b.inline));
  });
}

/** „Neuigkeiten“: every release note, newest first, on field-book paper. Marks the newest as seen. */
export function openNews(modals: ModalManager, onSeen?: () => void): ModalHandle {
  const latest = latestNotesVersion();
  if (latest) markSeen(latest);
  onSeen?.();
  const body = RELEASE_NOTES.length
    ? RELEASE_NOTES.map((n) => h('section.kq-news-entry', { 'data-version': n.version }, renderBlocks(parseMarkdown(n.markdown))))
    : [h('p', t('news.empty'))];
  return modals.open({
    title: t('news.title'),
    body: h('div.kq-news', { 'data-testid': 'news' }, [...body, h('p.kq-news-build', versionLabel())]),
    wide: true,
    backdrop: 'still',
    actions: [{ label: t('modal.close') }],
  });
}
