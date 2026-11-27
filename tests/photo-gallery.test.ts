/**
 * The phone's photo gallery (TASK-006): the store contract on the memory store (the IndexedDB one
 * shares the interface and runs in e2e/photo.spec.ts), the library's cap, order and error handling,
 * the download file name, the share-or-download decision and the persist request.
 */
import { describe, expect, it } from 'vitest';
import { GALLERY_CAP, PhotoLibrary, newestFirst, photoFileName, shareMode } from '../src/systems/photo/gallery-logic';
import { MemoryPhotoStore, type PhotoMeta, type PhotoStore, requestPersist } from '../src/systems/photo/store';

const meta = (n: number, o: Partial<PhotoMeta> = {}): PhotoMeta => ({
  at: `2026-11-26T14:${String(n).padStart(2, '0')}:05`,
  playSeconds: 60 * n,
  era: 'today',
  x: 528 + n,
  z: -795,
  targets: ['photo.parkplatz'],
  good: n % 2 ? ['photo.parkplatz'] : [],
  stars: n % 4,
  width: 1920,
  height: 1080,
  ...o,
});
const jpeg = (tag: string) => new Blob([tag], { type: 'image/jpeg' });

describe('the memory photo store (the fallback, and the contract the IndexedDB store shares)', () => {
  it('adds, lists oldest first with metadata and thumbnail, gives the full picture, removes, counts', async () => {
    const s: PhotoStore = new MemoryPhotoStore();
    expect(s.kind).toBe('memory');
    const a = await s.add(meta(1), jpeg('full-a'), jpeg('thumb-a'));
    const b = await s.add(meta(2, { era: 'today', targets: [] }), jpeg('full-b'), jpeg('thumb-b'));
    expect(b).toBeGreaterThan(a);
    expect(await s.count()).toBe(2);
    const list = await s.list();
    expect(list.map((r) => r.id)).toEqual([a, b]);
    expect(list[0]).toMatchObject({ id: a, at: meta(1).at, era: 'today', x: 529, z: -795, targets: ['photo.parkplatz'], width: 1920, height: 1080 });
    expect(await list[0]!.thumb.text()).toBe('thumb-a');
    expect(await (await s.full(b))!.text()).toBe('full-b');
    // the list is a copy: changing it does not change the store
    list[0]!.targets.push('x');
    expect((await s.list())[0]!.targets).toEqual(['photo.parkplatz']);
    await s.remove(a);
    expect(await s.count()).toBe(1);
    expect(await s.full(a)).toBeUndefined();
    expect((await s.list()).map((r) => r.id)).toEqual([b]);
    // ids are never reused
    expect(await s.add(meta(3), jpeg('f'), jpeg('t'))).toBeGreaterThan(b);
  });
});

describe('the photo library', () => {
  it('lists newest first and stops at the cap with reason full', async () => {
    const lib = new PhotoLibrary(new MemoryPhotoStore(), 3);
    expect(GALLERY_CAP).toBe(100);
    const out = [];
    for (let n = 1; n <= 4; n++) out.push(await lib.save(meta(n), jpeg(`f${n}`), jpeg(`t${n}`)));
    expect(out.map((o) => o.ok)).toEqual([true, true, true, false]);
    expect(out[2]).toMatchObject({ ok: true, count: 3 });
    expect(out[3]).toEqual({ ok: false, reason: 'full', count: 3 });
    expect((await lib.list()).map((r) => r.at)).toEqual([meta(3).at, meta(2).at, meta(1).at]);
    // deleting one makes room again
    const oldest = (await lib.list()).at(-1)!;
    expect(await lib.remove(oldest.id)).toBe(true);
    expect(await lib.save(meta(5), jpeg('f5'), jpeg('t5'))).toMatchObject({ ok: true, count: 3 });
    expect(await lib.count()).toBe(3);
    expect(lib.kind).toBe('memory');
  });

  it('never throws: a broken store gives error outcomes and empty lists', async () => {
    const boom = () => Promise.reject(new Error('quota'));
    const broken: PhotoStore = { kind: 'idb', add: boom, list: boom, full: boom, remove: boom, count: boom };
    const lib = new PhotoLibrary(broken);
    const warn = console.warn;
    console.warn = () => {};
    try {
      expect(await lib.save(meta(1), jpeg('f'), jpeg('t'))).toEqual({ ok: false, reason: 'error', count: 0 });
      expect(await lib.list()).toEqual([]);
      expect(await lib.full(1)).toBeUndefined();
      expect(await lib.remove(1)).toBe(false);
      expect(await lib.count()).toBe(0);
    } finally {
      console.warn = warn;
    }
  });
});

describe('gallery helpers', () => {
  it('newest first', () => {
    expect(newestFirst([{ id: 2 }, { id: 9 }, { id: 4 }]).map((r) => r.id)).toEqual([9, 4, 2]);
  });

  it('the download file name comes from the shot time (local clock)', () => {
    expect(photoFileName('2026-11-26T14:31:05')).toBe('karlsberg-quest-2026-11-26-14-31-05.jpg');
    expect(photoFileName(new Date(2026, 0, 2, 3, 4, 5))).toBe('karlsberg-quest-2026-01-02-03-04-05.jpg');
    expect(photoFileName('kaputt')).toBe('karlsberg-quest-foto.jpg');
  });

  it('shares only when the browser can share this file, else downloads', () => {
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    const share = async () => {};
    expect(shareMode(undefined, file)).toBe('download');
    expect(shareMode({}, file)).toBe('download');
    expect(shareMode({ share }, file)).toBe('download');
    expect(shareMode({ share, canShare: () => false }, file)).toBe('download');
    expect(shareMode({ share, canShare: ({ files }) => files?.[0] === file }, file)).toBe('share');
    expect(
      shareMode(
        {
          share,
          canShare: () => {
            throw new Error('nope');
          },
        },
        file,
      ),
    ).toBe('download');
  });

  it('asks the browser to keep the storage, once it is not already persisted; never throws', async () => {
    const calls: string[] = [];
    expect(await requestPersist(undefined)).toBeNull();
    expect(await requestPersist({})).toBeNull();
    expect(await requestPersist({ storage: { persisted: async () => true, persist: async () => (calls.push('persist'), true) } })).toBe(true);
    expect(calls).toEqual([]);
    expect(await requestPersist({ storage: { persisted: async () => false, persist: async () => (calls.push('persist'), false) } })).toBe(false);
    expect(calls).toEqual(['persist']);
    expect(await requestPersist({ storage: { persist: () => Promise.reject(new Error('denied')) } })).toBeNull();
  });
});
