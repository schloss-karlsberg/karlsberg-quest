/**
 * The photo gallery's rules (TASK-006), pure and DOM-free so they are unit tested: the cap, the
 * order, the download file name, whether a photo can be shared, and the library over a
 * `PhotoStore` (store.ts). The gallery belongs to the device, not to a save slot: a new game keeps
 * the photos, like a camera roll. The per-save album (Pause → Album) is separate.
 */
import type { PhotoMeta, PhotoRecord, PhotoStore } from './store';

/** At most this many photos are kept; a shot beyond it is not stored (the player is told). */
export const GALLERY_CAP = 100;

export type SaveOutcome = { ok: true; id: number; count: number } | { ok: false; reason: 'full' | 'error'; count: number };

/** Newest first (highest id first). */
export function newestFirst<T extends { id: number }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => b.id - a.id);
}

const two = (n: number) => String(n).padStart(2, '0');

/** `karlsberg-quest-2026-11-26-14-31-05.jpg` from the shot's time (local clock). */
export function photoFileName(at: string | Date): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  if (!Number.isFinite(d.getTime())) return 'karlsberg-quest-foto.jpg';
  return `karlsberg-quest-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}-${two(d.getMinutes())}-${two(d.getSeconds())}.jpg`;
}

/** The parts of `navigator` the share decision needs. */
export interface ShareNav {
  share?: (data: { files?: File[]; title?: string }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
}

/**
 * 'share' when the browser can hand this file to the OS share sheet (Web Share Level 2), else
 * 'download'. Never throws (a `canShare` that throws counts as no).
 */
export function shareMode(nav: ShareNav | undefined, file: File): 'share' | 'download' {
  if (!nav?.share || !nav.canShare) return 'download';
  try {
    return nav.canShare({ files: [file] }) ? 'share' : 'download';
  } catch {
    return 'download';
  }
}

/** The gallery's photos over a store: the cap on save, newest-first lists. */
export class PhotoLibrary {
  constructor(
    readonly store: PhotoStore,
    readonly cap = GALLERY_CAP,
  ) {}

  get kind(): PhotoStore['kind'] {
    return this.store.kind;
  }

  /** Store a photo unless the gallery is full. Never throws: a failed write is `reason: 'error'`. */
  async save(meta: PhotoMeta, full: Blob, thumb: Blob): Promise<SaveOutcome> {
    let count = 0;
    try {
      count = await this.store.count();
      if (count >= this.cap) return { ok: false, reason: 'full', count };
      const id = await this.store.add(meta, full, thumb);
      return { ok: true, id, count: count + 1 };
    } catch (err) {
      console.warn('[photo] the gallery could not store the photo', err);
      return { ok: false, reason: 'error', count };
    }
  }

  /** Newest first. An unreadable store lists nothing. */
  async list(): Promise<PhotoRecord[]> {
    try {
      return newestFirst(await this.store.list());
    } catch (err) {
      console.warn('[photo] the gallery could not be read', err);
      return [];
    }
  }

  async full(id: number): Promise<Blob | undefined> {
    try {
      return await this.store.full(id);
    } catch {
      return undefined;
    }
  }

  async remove(id: number): Promise<boolean> {
    try {
      await this.store.remove(id);
      return true;
    } catch (err) {
      console.warn('[photo] the gallery could not delete the photo', err);
      return false;
    }
  }

  async count(): Promise<number> {
    try {
      return await this.store.count();
    } catch {
      return 0;
    }
  }
}
