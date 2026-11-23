---
id: TASK-006
aliases:
- TASK-006
title: 'Phone gallery: save, download and share photos'
slug: phone-gallery-save-download-and-share-photos
status: todo
priority: 3
owner: ''
projects: []
customers: []
tags:
- feature
- community
- ux
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-23
updated: 2026-11-23
---

# Phone gallery: save, download and share photos

Related: TASK-005 (phone pull-out animation into camera mode). Not a dependency; either can land first.

## Description

Let players keep the photos they take with the in-game phone: a gallery on the phone, a download
button, and sharing through the OS share sheet (WhatsApp, Signal, AirDrop, ...).

### How it works today

- `src/systems/photo/index.ts`, `shoot()`: each shot is judged (`core.ts`), then a **480 px JPEG data
  URL** (quality 0.72) is captured with `captureView()` (`src/systems/notes/capture.ts`, which uses
  `canvas.toDataURL`). In past eras the picture is a white image ("Kein Netz").
- The image is kept **only in memory** (`thumbs` map, keyed by target id). It is cleared on load, new
  game and reload. Shots with no photo target are not kept at all.
- The save (`src/core/save.ts`, localStorage, keys `kq.save.v1.<slot>`) stores the album slice:
  one entry per **target** (best stars, era, time), max 60, **no images**.
- The journal tab "Album" (`renderAlbum`) shows those entries with this session's thumbnail or a
  placeholder ("Bilder dieser Sitzung; nach dem Neuladen bleibt die Karte.").
- There is **no download and no share**: images are discarded on reload.
- Existing IndexedDB use to copy: `src/systems/notes/store.ts` (database `kq-notes`, a small promise
  wrapper over `IDBRequest`, a `NoteStore` interface with an `IdbStore` and a `MemoryStore` fallback
  for private windows). No IndexedDB library is a dependency; `fake-indexeddb` is not in `package.json`.

### Decisions (owner / coordinator)

- **Storage: IndexedDB**, not localStorage. localStorage holds only ~5 MB, takes strings only
  (base64 adds ~33 %) and blocks the main thread. IndexedDB stores Blobs directly, is async and has
  a large quota. Use its own database (e.g. `kq-photos`), following the `notes/store.ts` pattern.
- Call `navigator.storage.persist()` (when available) to lower the eviction risk.
- **Safari caveat:** Safari may clear site data after ~7 days without a visit unless the game is
  installed to the home screen. The gallery shows a short German hint that photos live only on this
  device and suggests downloading the ones to keep.
- **No new dependencies:** no IndexedDB wrapper library.
- **Per photo:** a full JPEG or WebP Blob from `canvas.toBlob` (larger than today's 480 px thumb,
  e.g. the canvas size capped at 1920 px), a small thumbnail Blob, and metadata: timestamp, era,
  position, and target / quest id when available. `captureView` currently returns a data URL; add a
  Blob variant rather than converting.
- **Gallery UI**, opened from the phone (and reachable from the journal album): thumbnail grid,
  fullscreen view on tap, delete, and a cap (proposal: 100 photos) with a clear message when full.
- **Download:** an object URL plus `<a download>` (works everywhere); revoke the URL afterwards.
- **Share:** Web Share API Level 2, `navigator.share({ files: [file] })`, guarded by
  `navigator.canShare({ files })`. It must run from a user gesture and needs HTTPS. Without support
  (some desktop browsers) the Share button falls back to Download.
- Touch and the mobile UI must work (`src/ui/touch.ts`, `docs/MOBILE-UI-PASS.md`): big tap targets,
  portrait and landscape, swipe or buttons in the fullscreen view.

## Acceptance Criteria
- [ ] Every shot (with signal) is stored in IndexedDB as an image Blob plus thumbnail plus metadata, and survives a reload
- [ ] `navigator.storage.persist()` is requested; the device-only hint is shown in the gallery
- [ ] Gallery from the phone: grid, fullscreen on tap, delete; the cap is enforced with a clear message
- [ ] Download works on desktop and mobile; Share opens the OS share sheet where supported and falls back to Download otherwise
- [ ] Falls back to memory (session only) when IndexedDB is missing or blocked, without errors
- [ ] Works on touch and with the mobile UI; all player-facing text is German
- [ ] Unit tests for the storage module, with storage behind an interface and a memory implementation (no `fake-indexeddb` unless it gets added as a dev dependency with the owner's OK)
- [ ] An e2e for take photo → gallery → delete (extend `e2e/photo.spec.ts`; run with `--workers=1`)
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build` pass

## Optional ideas
- A game watermark or frame on downloaded / shared images.
- A photo-quest hook, e.g. "photograph the deer" (see the tour's Ricke and Kitz, TASK-001), via the existing `photo:good` event.
- "Export all" as a zip, only if it needs no new dependency.

## Notes
- Update `docs/ACTION-RPG.md` §14 and the `docs/PRD.md` changelog (CONTRIBUTING.md).
