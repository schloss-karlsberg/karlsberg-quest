---
id: TASK-006
aliases:
- TASK-006
title: 'Phone gallery: save, download and share photos'
slug: phone-gallery-save-download-and-share-photos
status: in-progress
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
updated: 2026-11-26
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

## Plan
_Status: approved 2026-11-26_

**Approach:** A device-wide photo gallery next to the per-save album.
- **Storage:** every shot with signal is stored in IndexedDB (database `kq-photos`) as a full JPEG Blob, a thumbnail Blob and metadata. It sits behind a small `PhotoStore` interface copied from the `notes/store.ts` pattern: an IndexedDB store plus a memory fallback for private windows. The store requests `navigator.storage.persist()`.
- **Capture:** grows a Blob variant that reads the canvas once (render, `drawImage`) and encodes a full image (≤ 1920 px wide) and a 320 px thumbnail with `canvas.toBlob`.
- **Gallery:** a modal with a thumbnail grid, the count („12 / 100“) and the device-only hint. A tap opens the photo full-size, with Zurück / Weiter (buttons, arrow keys, swipe), Löschen (asks once), Herunterladen and Teilen. Teilen uses `navigator.share({ files })` when `navigator.canShare({ files })` says yes, else it downloads.
- **Entry points:** a „Galerie“ button on the phone, next to the 1× / 2× chips (the layer above the touch controls), and a button on Pause → Album.
- **Unchanged:** the album, judging, cards, codex and save are untouched. No new dependencies.

**Files to touch:**
- `src/systems/notes/capture.ts` - `captureViewBlobs()`: one read-back, full (≤ 1920 px) + thumb (320 px) JPEG Blobs; the data-URL `captureView` stays for notes / cards.
- `src/systems/photo/store.ts` (new) - `PhotoStore` (add / list / full / remove / count), `IdbPhotoStore` (`kq-photos`: store `photos` = meta + thumb, store `full` = the big Blob, same key), `MemoryPhotoStore`, `openPhotoStore()` with fallback and `persist()`.
- `src/systems/photo/gallery-logic.ts` (new, pure) - cap (100), newest-first order, the download file name (`karlsberg-quest-2026-11-26-14-31.jpg`), share-or-download decision, metadata shape.
- `src/systems/photo/gallery.ts` (new) - the gallery modal and the full-size viewer (object URLs revoked on close).
- `src/systems/photo/index.ts` - `shoot()` stores the shot (signal only, async, never blocks the card); the full-gallery toast; the phone's „Galerie“ button; the Album page button; German strings; `kq.photo.gallery` hooks (open, list, remove, count, store kind).
- `src/systems/photo/photo.css` - grid, viewer, buttons ≥ 44 px, portrait and landscape.
- `tests/photo-gallery.test.ts` (new) - store contract on `MemoryPhotoStore`, cap, order, delete, file name, share fallback.
- `e2e/photo.spec.ts` - extend: shoot → Galerie (from the phone) → full size → Herunterladen (download event) → reload keeps it → Löschen → empty; a touch-sized run of the gallery.
- `docs/ARCHITECTURE.md` (photo section), `docs/ACTION-RPG.md` §14, `docs/PRD.md` changelog.

**Steps:**
- [x] 1. `captureViewBlobs()` in `notes/capture.ts`.
- [x] 2. `photo/store.ts` + `photo/gallery-logic.ts`; unit tests on the memory store and the logic.
- [x] 3. `shoot()` → store (signal only, metadata: time, play seconds, era, x / z, targets, good, stars); cap toast; hooks.
- [x] 4. Gallery modal: grid, count, device-only hint (memory fallback: „nur bis zum Neuladen“), viewer with Zurück / Weiter / swipe, Löschen, Herunterladen, Teilen → Download fallback.
- [x] 5. Entry points: „Galerie“ on the phone (closes the phone, opens the gallery), button on Pause → Album.
- [x] 6. Touch / mobile: 44 px targets, portrait and landscape layouts, check in the touch e2e sizes.
- [x] 7. e2e in `e2e/photo.spec.ts`; run `photo` and `touch` with one worker.
- [x] 8. Manual check in the dev build (desktop and a phone-sized viewport); after shots; docs.
- [ ] 9. Gates: `pnpm typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`; `pnpm build && pnpm exec playwright test e2e/photo.spec.ts e2e/touch.spec.ts --workers=1`.

**Test plan:**
- Unit: `pnpm exec vitest run tests/photo-gallery.test.ts tests/photo.test.ts`.
- e2e: `e2e/photo.spec.ts`, `e2e/touch.spec.ts`, one worker. The download is checked with Playwright's download event; Share falls back to Download in headless Chromium (no file share).
- Manual: `http://localhost:5280/?debug&nosave&fresh` → „Neues Spiel“; at the car park press N, take 2–3 photos, then „Galerie“ on the phone. Check the grid, full size, swipe, Löschen, Herunterladen, then reload: the photos are still there.
- Screenshots in `test-results/contribute/TASK-006/`:
  - before: `before-1-phone.png` (phone up at the car park, the board in view), `before-2-album.png` (Pause → Album after one shot);
  - after: `after-1-phone.png` (the „Galerie“ button), `after-2-gallery.png` (grid with count and hint), `after-3-viewer.png` (full size with the buttons), `after-4-gallery-mobile.png` (phone-sized portrait).

**Risks:**
- The full-size read-back costs a frame's `drawImage` from the WebGL canvas plus async JPEG encoding. Shooting has a 0.6 s cooldown, and encoding runs off the main thread in Chromium (check the frame time with `?debug`).
- Storage: about 0.3–0.6 MB per photo, so 100 photos is at most about 60 MB. That is inside normal IndexedDB quotas; a failed write shows a toast instead of throwing.
- Safari may clear site data after about 7 days without a visit (the gallery says so); private windows fall back to memory.
- Web Share needs HTTPS and a user gesture. The button calls it directly from the click; the GitHub Pages build is HTTPS.
- The gallery is device-wide, not per save slot (a new game keeps the photos). See open question 1.

**Open questions:** none. Approved by the contributor 2026-11-26 as proposed: the gallery belongs to the device, not to a save; the cap is 100, and when full a new shot is not stored and a toast says so; the optional ideas (watermark, photo quest, zip export) stay out of this cut.

## Optional ideas
- A game watermark or frame on downloaded / shared images.
- A photo-quest hook, e.g. "photograph the deer" (see the tour's Ricke and Kitz, TASK-001), via the existing `photo:good` event.
- "Export all" as a zip, only if it needs no new dependency.

## Progress
- Branch: `feat/task-006-gallery` (from `main` `1bd1597`)
- 2026-11-26: plan approved (gallery per device, cap 100 with a toast, optional ideas out). Before shots (real GPU, Iris Xe, dev build): `test-results/contribute/TASK-006/before-1-phone.png` (phone up at the car park, 528 / −795, the board in view, only 1× / 2× on the phone), `before-2-album.png` (Pause → Album after one shot: the entry with this session's thumbnail and „Bilder dieser Sitzung; nach dem Neuladen bleibt die Karte.“).

- 2026-11-26: steps 1-2 done:
  - `captureViewBlobs()` (`notes/capture.ts`) draws and copies the frame once, then encodes a full JPEG (≤ 1920 px, q 0.88) and a 320 px thumbnail (q 0.75) with `toBlob`. The data-URL `captureView` stays.
  - `photo/store.ts`: `PhotoStore`, `IdbPhotoStore` (`kq-photos`: `photos` = meta + thumb, autoIncrement; `full` = the picture under the same key; one transaction per add / remove), `MemoryPhotoStore`, `openPhotoStore()` (never throws, memory fallback), `requestPersist()`.
  - `photo/gallery-logic.ts`: `GALLERY_CAP` 100, `PhotoLibrary` (cap on save, newest first; never throws), `photoFileName()`, `shareMode()`.
  - `tests/photo-gallery.test.ts`: 7 tests green; typecheck green.

- 2026-11-26: steps 3-5 done:
  - `shoot()` copies the frame for the gallery on every shot with signal (`keep()`). Encoding and the write run after it, in order (`settled()` for tests), and never hold up the card. A full gallery or a failed write shows a toast. The first stored photo asks for `navigator.storage.persist()`.
  - `gallery.ts`: a modal with the grid, the count, the device / session hint and a cap note; the full-size viewer with ‹ ›, arrow keys, swipe, Teilen (share sheet or download), Herunterladen, Löschen (a second press within 4 s) and Alle Fotos. Object URLs are revoked on rebuild and close.
  - Entry points: the phone bar now reads „1× 2× | Galerie“, and Pause → Album has „Galerie öffnen“.
  - **Plan adjusted:** on desktop the phone holds the pointer lock, so a click always reaches the canvas (the shutter). The gallery button is for touch; **G** opens the gallery on desktop. G is the Bannlicht, muted while the phone is up; the phone hint names it.
  - Checked by script in the dev build (real GPU; desktop 1280×720 and a landscape phone 844×390 with touch): three shots, then the gallery, then a photo full-size. On a phone in portrait the game shows its rotate overlay during play (by design), so the phone check is landscape.
- 2026-11-26: step 6 done (touch / mobile). The touch e2e found two real bugs, both fixed:
  - **The delete confirmation:** it expired silently after 4 s while the button still read „Wirklich löschen?“. It is now a plain state: the first press asks, the second deletes, and moving to another photo asks again.
  - **The landscape phone (844 × 342):** the longer label wrapped the bar, and the button left the visible panel, so the second tap hit the page. The armed label is now „Wirklich?“ (red, `aria-label` „Wirklich löschen?“), so nothing moves.
  - The viewer image gets its width / height from the metadata and a fixed box (56vh, 48 / 52vh on small screens, `object-fit: contain`), so the bar does not jump when the picture decodes.
  - Gallery and phone-bar buttons have `touch-action: manipulation`; all their targets are ≥ 44 px on touch.
- 2026-11-26: step 7 done - `e2e/photo.spec.ts`, one worker. 1789: nothing goes to the gallery. The new desktop test covers:
  - two shots → `list()` (newest first, metadata, ≤ 1920 px), G → grid (count, `idb` hint), full size (`naturalWidth` = stored width), ‹ › / arrow keys;
  - Herunterladen (download event, `karlsberg-quest-YYYY-MM-DD-HH-MM-SS.jpg`); Teilen falls back to a download without `canShare` and hands the JPEG to `navigator.share` with it;
  - both photos and thumbnails are Blobs in IndexedDB `kq-photos`; Pause → Album → „Galerie öffnen“; Löschen asks, deletes, then the next photo moves in and the grid ends empty.
  - The new touch test (iPhone 13 landscape, CDP touch) covers the bar's 44 px buttons, „Galerie“ by tap, full size by tap, viewer buttons on screen, and deleting by two taps.
  - All three are green.
  - The in-place reload under SwiftShader takes 12–51 s here, and Playwright aborted it (`ERR_ABORTED`) in the test. The e2e therefore checks the stored Blobs directly. A real-GPU script (Iris Xe, `vite preview`) shows a reload + boot of about 3 s, the gallery still holding its photo (`count` 1 → 1), with or without gallery use first.
  - The existing „N at the car park“ test fails here because the pack catches the player before the shutter („Die Meute hat dich gestellt“). The same happens on untouched `main` (`1bd1597`, run the same day), so it is unrelated.
- 2026-11-26: step 8 - checked by script in the dev build (real GPU), not hand-played. After shots: `after-1-phone.png` (the bar „1× 2× | Galerie“, hint „G: Galerie“), `after-2-gallery.png`, `after-3-viewer.png`, `after-4-gallery-mobile.png` and `after-5-viewer-mobile.png` (landscape phone 844 × 390, touch). Docs: ARCHITECTURE (photo → Gallery), ACTION-RPG §14, PRD changelog.

## Notes
- Update `docs/ACTION-RPG.md` §14 and the `docs/PRD.md` changelog (CONTRIBUTING.md).
