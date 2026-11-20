/**
 * IndexedDB for the F8 notes and the telemetry (database `kq-notes`, stores `notes` and `meta`).
 * Local only, never sent anywhere. Falls back to memory when IndexedDB is missing or blocked
 * (private windows), so the feature keeps working for the session.
 */

const DB_NAME = 'kq-notes';
const DB_VERSION = 1;

export interface NoteStore {
  add<T extends object>(note: T): Promise<number>;
  all<T>(): Promise<(T & { id: number })[]>;
  clear(): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
  /** 'idb' or 'memory' (fallback). */
  readonly kind: 'idb' | 'memory';
}

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

class IdbStore implements NoteStore {
  readonly kind = 'idb' as const;
  constructor(private readonly db: IDBDatabase) {}

  private store(name: 'notes' | 'meta', mode: IDBTransactionMode): IDBObjectStore {
    return this.db.transaction(name, mode).objectStore(name);
  }

  async add<T extends object>(note: T): Promise<number> {
    return Number(await req(this.store('notes', 'readwrite').add(note)));
  }

  async all<T>(): Promise<(T & { id: number })[]> {
    const s = this.store('notes', 'readonly');
    const [vals, keys] = await Promise.all([req(s.getAll()), req(s.getAllKeys())]);
    return (vals as T[]).map((v, i) => ({ ...v, id: Number(keys[i]) }));
  }

  async clear(): Promise<void> {
    const tx = this.db.transaction(['notes', 'meta'], 'readwrite');
    tx.objectStore('notes').clear();
    tx.objectStore('meta').clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await req(this.store('meta', 'readonly').get(key))) as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await req(this.store('meta', 'readwrite').put(value, key));
  }
}

export class MemoryStore implements NoteStore {
  readonly kind = 'memory' as const;
  private notes: { id: number; v: object }[] = [];
  private meta = new Map<string, unknown>();
  private next = 1;
  async add<T extends object>(note: T): Promise<number> {
    const id = this.next++;
    this.notes.push({ id, v: structuredClone(note) });
    return id;
  }
  async all<T>(): Promise<(T & { id: number })[]> {
    return this.notes.map((n) => ({ ...(structuredClone(n.v) as T), id: n.id }));
  }
  async clear(): Promise<void> {
    this.notes = [];
    this.meta.clear();
  }
  async getMeta<T>(key: string): Promise<T | undefined> {
    const v = this.meta.get(key);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }
  async setMeta(key: string, value: unknown): Promise<void> {
    this.meta.set(key, structuredClone(value));
  }
}

/** Open the database (or the memory fallback). */
export async function openNoteStore(): Promise<NoteStore> {
  if (typeof indexedDB === 'undefined') return new MemoryStore();
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('notes')) d.createObjectStore('notes', { autoIncrement: true });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('blocked'));
    });
    return new IdbStore(db);
  } catch (err) {
    console.warn('[notes] IndexedDB unavailable, notes are kept for this session only', err);
    return new MemoryStore();
  }
}
