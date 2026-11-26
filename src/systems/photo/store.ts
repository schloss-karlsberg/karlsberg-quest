/**
 * The photo gallery's storage (TASK-006): IndexedDB database `kq-photos`, local only, never sent
 * anywhere. Store `photos` holds each photo's metadata and its thumbnail Blob (the grid reads only
 * these); store `full` holds the full picture under the same key, read when a photo is opened.
 * Falls back to memory when IndexedDB is missing or blocked (private windows): the gallery then
 * keeps this session's photos only. The pattern follows `src/systems/notes/store.ts`.
 */
import type { Era } from '../../core/era';

const DB_NAME = 'kq-photos';
const DB_VERSION = 1;

/** What is known about a photo besides its pixels. */
export interface PhotoMeta {
  /** When it was taken (ISO 8601). */
  at: string;
  /** Seconds played in the save it was taken in. */
  playSeconds: number;
  era: Era;
  /** Where the player stood. */
  x: number;
  z: number;
  /** Photo targets in the frame, the good ones among them, and the best stars. */
  targets: string[];
  good: string[];
  stars: number;
  /** Size of the full picture (px). */
  width: number;
  height: number;
}

/** A stored photo as the grid sees it: metadata and thumbnail, without the full picture. */
export interface PhotoRecord extends PhotoMeta {
  id: number;
  thumb: Blob;
}

export interface PhotoStore {
  /** 'idb' or 'memory' (the fallback: this session only). */
  readonly kind: 'idb' | 'memory';
  add(meta: PhotoMeta, full: Blob, thumb: Blob): Promise<number>;
  /** All photos, oldest first (ascending ids). */
  list(): Promise<PhotoRecord[]>;
  /** The full picture, or undefined when the photo is gone. */
  full(id: number): Promise<Blob | undefined>;
  remove(id: number): Promise<void>;
  count(): Promise<number>;
}

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('aborted'));
  });

class IdbPhotoStore implements PhotoStore {
  readonly kind = 'idb' as const;
  constructor(private readonly db: IDBDatabase) {}

  async add(meta: PhotoMeta, full: Blob, thumb: Blob): Promise<number> {
    const tx = this.db.transaction(['photos', 'full'], 'readwrite');
    const finished = done(tx);
    const r = tx.objectStore('photos').add({ ...meta, thumb });
    // the full picture goes in from the add's own callback: the transaction is surely still active
    r.onsuccess = () => tx.objectStore('full').put(full, r.result);
    await finished;
    return Number(r.result);
  }

  async list(): Promise<PhotoRecord[]> {
    const s = this.db.transaction('photos', 'readonly').objectStore('photos');
    const [vals, keys] = await Promise.all([req(s.getAll()), req(s.getAllKeys())]);
    return (vals as Omit<PhotoRecord, 'id'>[]).map((v, i) => ({ ...v, id: Number(keys[i]) }));
  }

  async full(id: number): Promise<Blob | undefined> {
    return (await req(this.db.transaction('full', 'readonly').objectStore('full').get(id))) as Blob | undefined;
  }

  async remove(id: number): Promise<void> {
    const tx = this.db.transaction(['photos', 'full'], 'readwrite');
    tx.objectStore('photos').delete(id);
    tx.objectStore('full').delete(id);
    await done(tx);
  }

  async count(): Promise<number> {
    return req(this.db.transaction('photos', 'readonly').objectStore('photos').count());
  }
}

/** The fallback (and the unit tests' store): this session only. Blobs are immutable, kept as they are. */
export class MemoryPhotoStore implements PhotoStore {
  readonly kind = 'memory' as const;
  private readonly rows = new Map<number, { rec: PhotoRecord; full: Blob }>();
  private next = 1;

  async add(meta: PhotoMeta, full: Blob, thumb: Blob): Promise<number> {
    const id = this.next++;
    this.rows.set(id, { rec: { ...structuredClone(meta), thumb, id }, full });
    return id;
  }
  async list(): Promise<PhotoRecord[]> {
    return [...this.rows.values()].map((r) => ({ ...r.rec, targets: [...r.rec.targets], good: [...r.rec.good] }));
  }
  async full(id: number): Promise<Blob | undefined> {
    return this.rows.get(id)?.full;
  }
  async remove(id: number): Promise<void> {
    this.rows.delete(id);
  }
  async count(): Promise<number> {
    return this.rows.size;
  }
}

/** Open the database (or the memory fallback). Never throws. */
export async function openPhotoStore(): Promise<PhotoStore> {
  if (typeof indexedDB === 'undefined') return new MemoryPhotoStore();
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { autoIncrement: true });
        if (!d.objectStoreNames.contains('full')) d.createObjectStore('full');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('blocked'));
    });
    return new IdbPhotoStore(db);
  } catch (err) {
    console.warn('[photo] IndexedDB unavailable, the gallery keeps this session only', err);
    return new MemoryPhotoStore();
  }
}

/**
 * Ask the browser to keep this site's storage (lowers the risk that the photos are evicted).
 * Resolves true / false, or null where the API is missing. Never throws.
 */
export async function requestPersist(nav: { storage?: { persisted?: () => Promise<boolean>; persist?: () => Promise<boolean> } } | undefined = globalThis.navigator): Promise<boolean | null> {
  const s = nav?.storage;
  if (!s?.persist) return null;
  try {
    if (s.persisted && (await s.persisted())) return true;
    return await s.persist();
  } catch {
    return null;
  }
}
