/**
 * The phone's photo gallery (TASK-006): a modal with the thumbnail grid, the count and the
 * device-only hint; a tap opens a photo full-size with previous / next (buttons, arrow keys, a
 * swipe), Teilen (the OS share sheet where the browser can share files, else a download),
 * Herunterladen and Löschen (asks once). Rules and storage live in gallery-logic.ts / store.ts.
 * Object URLs are revoked when the grid is rebuilt and when the gallery closes.
 */
import type { Era } from '../../core/era';
import { t } from '../../i18n';
import { h } from '../../ui/dom';
import type { ModalHandle, ModalManager } from '../../ui/modal';
import { type PhotoLibrary, type ShareNav, photoFileName, shareMode } from './gallery-logic';
import type { PhotoRecord } from './store';

export interface GalleryDeps {
  modals: ModalManager;
  /** The library once its store is open (it opens asynchronously at boot). */
  library: () => Promise<PhotoLibrary>;
  label: (targetId: string) => string;
  eraLabel: (era: Era) => string;
  toast: (msg: string) => void;
}

export interface GalleryState {
  open: boolean;
  view: 'grid' | 'viewer' | null;
  /** The photo shown full-size (its id), null in the grid. */
  photo: number | null;
  count: number;
}

const SWIPE_PX = 50;

export class GalleryView {
  private handle: ModalHandle | null = null;
  private readonly urls = new Set<string>();
  private photos: PhotoRecord[] = [];
  private lib: PhotoLibrary | null = null;
  private index = -1;
  private current: { id: number; file: File } | null = null;
  /** Löschen was pressed once on this photo: the button asks „Wirklich löschen?“ and the next press deletes. */
  private armed = false;
  private cap = 100;
  private readonly onKey = (e: KeyboardEvent) => {
    if (!this.handle || this.index < 0 || e.repeat) return;
    if (e.code === 'ArrowLeft') this.step(-1);
    else if (e.code === 'ArrowRight') this.step(1);
  };

  constructor(private readonly d: GalleryDeps) {}

  isOpen(): boolean {
    return !!this.handle;
  }

  state(): GalleryState {
    return { open: !!this.handle, view: this.handle ? (this.index < 0 ? 'grid' : 'viewer') : null, photo: this.index < 0 ? null : (this.photos[this.index]?.id ?? null), count: this.photos.length };
  }

  /** Open on the grid. Resolves when the grid is drawn. */
  async open(): Promise<void> {
    if (!this.handle) {
      this.handle = this.d.modals.open({
        title: t('photo.gallery'),
        body: h('p.kq-gallery-loading', t('photo.gallery.loading')),
        wide: true,
        className: 'kq-gallery-modal',
        backdrop: 'still',
        onClose: () => this.closed(),
      });
      this.handle.el.dataset['testid'] = 'gallery';
      window.addEventListener('keydown', this.onKey);
    }
    this.lib = await this.d.library();
    await this.showGrid();
  }

  close(): void {
    this.handle?.close();
  }

  private closed(): void {
    window.removeEventListener('keydown', this.onKey);
    this.revokeAll();
    this.handle = null;
    this.index = -1;
    this.current = null;
    this.photos = [];
  }

  private url(blob: Blob): string {
    const u = URL.createObjectURL(blob);
    this.urls.add(u);
    return u;
  }

  private revokeAll(): void {
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls.clear();
  }

  private when(at: string): string {
    const d = new Date(at);
    if (!Number.isFinite(d.getTime())) return '';
    return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}, ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  async showGrid(): Promise<void> {
    const lib = this.lib;
    const handle = this.handle;
    if (!lib || !handle) return;
    this.photos = await lib.list();
    this.cap = lib.cap;
    if (this.handle !== handle) return;
    this.index = -1;
    this.current = null;
    this.revokeAll();
    const n = this.photos.length;
    const parts: HTMLElement[] = [
      h('p.kq-gallery-count', { 'data-testid': 'gallery-count' }, t('photo.gallery.count', { n, cap: this.cap })),
      h('p.kq-gallery-hint', { 'data-testid': 'gallery-hint', 'data-store': lib.kind }, t(lib.kind === 'idb' ? 'photo.gallery.device' : 'photo.gallery.session')),
    ];
    if (n >= this.cap) parts.push(h('p.kq-gallery-capnote', { role: 'status', 'data-testid': 'gallery-capnote' }, t('photo.gallery.fullNote')));
    if (!n) parts.push(h('p.kq-gallery-empty', { 'data-testid': 'gallery-empty' }, t('photo.gallery.empty')));
    else {
      parts.push(
        h(
          'div.kq-gallery-grid',
          { 'data-testid': 'gallery-grid' },
          this.photos.map((p, i) =>
            h('button.kq-gallery-item', { type: 'button', 'data-testid': `gallery-item-${p.id}`, 'aria-label': t('photo.gallery.item', { when: this.when(p.at), era: this.d.eraLabel(p.era) }), onclick: () => void this.showViewer(i) }, [
              h('img', { src: this.url(p.thumb), alt: '', loading: 'lazy' }),
              h('span.kq-gallery-when', this.when(p.at)),
            ]),
          ),
        ),
      );
    }
    handle.setBody(parts, t('photo.gallery'));
  }

  async showViewer(i: number): Promise<void> {
    const lib = this.lib;
    const handle = this.handle;
    const p = this.photos[i];
    if (!lib || !handle || !p) return;
    const blob = await lib.full(p.id);
    if (this.handle !== handle) return;
    if (!blob) {
      this.d.toast(t('photo.gallery.gone'));
      await this.showGrid();
      return;
    }
    this.index = i;
    // moving to another photo (or back here) asks again
    this.armed = false;
    this.current = { id: p.id, file: new File([blob], photoFileName(p.at), { type: blob.type || 'image/jpeg' }) };
    // width / height from the metadata: the layout stands before the picture has decoded (the buttons do not jump)
    const img = h('img.kq-gallery-full', { src: this.url(blob), alt: t('photo.gallery.item', { when: this.when(p.at), era: this.d.eraLabel(p.era) }), 'data-testid': 'gallery-full', draggable: 'false', width: p.width || undefined, height: p.height || undefined });
    let x0: number | null = null;
    img.addEventListener('pointerdown', (e) => (x0 = e.clientX));
    img.addEventListener('pointerup', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) >= SWIPE_PX) this.step(dx < 0 ? 1 : -1);
    });
    const subject = p.good.map((id) => this.d.label(id)).join(' · ');
    const n = this.photos.length;
    const nav = (dir: -1 | 1, id: string, label: string, glyph: string) =>
      h('button.kq-btn.kq-gallery-nav', { type: 'button', 'data-testid': id, 'aria-label': label, disabled: !(i + dir >= 0 && i + dir < n), onclick: () => this.step(dir) }, glyph);
    const del = h('button.kq-btn.kq-gallery-delete', { type: 'button', 'data-testid': 'gallery-delete', onclick: () => void this.remove(del) }, t('photo.gallery.delete'));
    handle.setBody(
      [
        h('figure.kq-gallery-view', [
          img,
          h('figcaption', [h('span', `${this.when(p.at)} · ${this.d.eraLabel(p.era)}`), subject ? h('span.kq-gallery-subject', subject) : null, h('span.kq-gallery-pos', { 'data-testid': 'gallery-pos' }, `${i + 1} / ${n}`)]),
        ]),
        h('div.kq-gallery-bar', [
          h('button.kq-btn.kq-gallery-back', { type: 'button', 'data-testid': 'gallery-back', onclick: () => void this.showGrid() }, t('photo.gallery.back')),
          nav(-1, 'gallery-prev', t('photo.gallery.prev'), '‹'),
          h('button.kq-btn.primary', { type: 'button', 'data-testid': 'gallery-share', onclick: () => this.share() }, t('photo.gallery.share')),
          h('button.kq-btn', { type: 'button', 'data-testid': 'gallery-download', onclick: () => this.download() }, t('photo.gallery.download')),
          del,
          nav(1, 'gallery-next', t('photo.gallery.next'), '›'),
        ]),
      ],
      t('photo.gallery.photo'),
    );
  }

  private step(dir: -1 | 1): void {
    const j = this.index + dir;
    if (this.index < 0 || j < 0 || j >= this.photos.length) return;
    void this.showViewer(j);
  }

  /** Download from an object URL (works everywhere); the URL is revoked a little later. */
  download(): void {
    const c = this.current;
    if (!c) return;
    const u = URL.createObjectURL(c.file);
    const a = h('a', { href: u, download: c.file.name, style: 'display:none' });
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(u), 10_000);
  }

  /**
   * The OS share sheet (Web Share Level 2) when the browser can share files, called straight from
   * the click (it needs the user gesture); otherwise, or when sharing fails, a download.
   */
  share(): void {
    const c = this.current;
    if (!c) return;
    const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as ShareNav | undefined;
    if (shareMode(nav, c.file) !== 'share') {
      this.download();
      return;
    }
    nav!.share!({ files: [c.file], title: 'Karlsberg Quest' }).catch((err: unknown) => {
      // the player closed the sheet: nothing to do
      if ((err as { name?: string } | null)?.name === 'AbortError') return;
      this.download();
    });
  }

  private async remove(btn: HTMLButtonElement): Promise<void> {
    const c = this.current;
    const lib = this.lib;
    if (!c || !lib) return;
    // the first press only asks; the label and the state always agree (no silent expiry)
    if (!this.armed) {
      this.armed = true;
      btn.textContent = t('photo.gallery.deleteSure');
      btn.setAttribute('aria-label', t('photo.gallery.deleteSureLabel'));
      btn.classList.add('armed');
      return;
    }
    this.armed = false;
    if (!(await lib.remove(c.id))) {
      this.d.toast(t('photo.gallery.fail'));
      return;
    }
    this.d.toast(t('photo.gallery.deleted'));
    const at = this.index;
    await this.showGrid();
    // stay in the viewer on the photo that moved into this place, if any
    if (this.photos.length) await this.showViewer(Math.min(at, this.photos.length - 1));
  }
}
