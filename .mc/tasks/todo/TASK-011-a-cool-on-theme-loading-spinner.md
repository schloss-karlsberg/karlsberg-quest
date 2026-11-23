---
id: TASK-011
aliases:
- TASK-011
title: A cool, on-theme loading spinner
slug: a-cool-on-theme-loading-spinner
status: review
priority: 3
owner: ''
projects: []
customers: []
tags:
- dev
- ui
- ux
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-23
updated: 2026-11-24
---

# A cool, on-theme loading spinner

> Core dev team task (not community).

## Description

Loading should look like part of the game, not like a default web page.

### Where loading happens today

| Spot | Code | What it looks like |
| --- | --- | --- |
| Before the JS bundle runs | `index.html` | nothing: `<body>` has only an empty `#app`, so the first paint is blank (theme colour `#14110d`) |
| Boot: terrain / game data | `src/boot.ts` (`loadGameData(..., (d, n) => title.setProgress(d / n))`), `src/ui/title.ts` (`setProgress`, `setFailed`, `setReady`) | an italic text line "Gelände wird geladen … {pct} %" (`title.loading` in `src/i18n/de.ts`) with a thin ink progress rule under it (`.kq-title-page .loading` in `src/ui/styles.css`); `role="progressbar"` with `aria-valuenow`; buttons disabled until ready |
| Era change / time travel | `src/boot.ts` (`era:change` → `assets.prefetchEra(to)`), shift effect `src/systems/fx/shift/` (`prewarm.ts`, `warm.ts`) | no loader: assets are prefetched in the background, the shift effect covers the switch |
| Area / lazy model loads | `src/assets/` (`AssetLoader.loadArea`, lazy `instance()` / `model()` in scenery, characters, fauna) | nothing; models pop in when ready |
| X-ray point cloud | `src/systems/tools/index.ts`, `xray.ts` | a toast "Punktwolke wird geladen …" (`tools.xray.loading`) |
| HUD busy state | `HUD.busy()` in `src/ui/hud.ts` | a reason flag, no visual loader |

### Proposal

One small, reusable loader that fits the game's identity, matched to `docs/ART-DIRECTION.md` and the
UI tokens in `src/ui/styles.css` (`--paper`, `--ink`, `--ink-soft`, `--brass`, `--accent`, `--night`;
fonts IM Fell English / IM Fell English SC, Caveat). Ideas to pick or combine:
- the Karlsberg palace silhouette drawing itself (SVG stroke-dashoffset), in ink on paper;
- a pocket-watch hand or clock face for the time travel;
- the brass compass (Bussole) needle settling, which already belongs to the story;
- a rotating chestnut, or a ducal crown / monogram.

Behaviour:
- **Determinate** where progress is known (boot data via `setProgress`, `loadArea` progress): the
  drawing fills with the percentage; **indeterminate** otherwise (gentle loop).
- **Inline in `index.html`** (a few lines of SVG + CSS) so it shows on the first paint, before the
  bundle loads; the title then takes it over (no flash, no layout shift).
- Use it for boot, era change (only if a wait is actually noticeable), lazy area loads, and the x-ray load.

### Constraints
- Pure CSS / SVG, no new dependency, tiny (proposal: < 3 KB inline).
- Reduced motion: a static frame or a slow opacity pulse (`prefers-reduced-motion` before JS; the
  `reducedMotion` setting after).
- Works on mobile; the night background (`--night`) and the paper title page both need to look right.
- Accessible: `role="progressbar"` with `aria-valuenow` when determinate, `aria-busy="true"` on the
  region, a German label like "Lädt …" (keep "Gelände wird geladen … {pct} %" where it fits).
- One component (e.g. `src/ui/loader.ts` + CSS) shared by every spot.

## Acceptance Criteria
- [x] The loader is used in all loading spots listed above (or the task explains why a spot needs none)
- [x] Visible on the first paint from `index.html`, before the JS bundle; no layout shift when the title takes over
- [x] Real progress where known, indeterminate otherwise
- [x] Reduced motion respected; mobile and both backgrounds checked
- [x] Accessible (progressbar role / aria-busy, German label)
- [x] GPU or mobile screenshot, or a short GIF, in the PR
- [x] `pnpm typecheck`, `pnpm test`, content validation (ran the `pnpm validate` script directly; see Progress) and `pnpm build` pass

## Plan

_Status: approved 2026-11-24_

**Approach:** Use the brass Bussole from the story as the loading motif. Its outer ring shows measured progress, and its needle rocks gently while the total is unknown. The same compass stays in place from first paint through the paper title. During play, a compact indicator appears after a 300 ms wait and lets the player keep using the controls.

**Files to touch:**

- `index.html` — render the first-paint compass, German label and critical styles inline.
- `src/ui/loader.ts` — adopt the inline element and share its SVG, progress states and request handling.
- `src/ui/styles.css` — style the compass on night and paper backgrounds and reserve its title space.
- `src/ui/touch.css` — fit the loader within phone safe areas.
- `src/boot.ts` — connect terrain progress, startup completion, saved motion preferences and era prefetch.
- `src/ui/title.ts` — adopt the compass on the title page and handle ready and failed states.
- `src/data/loader.ts` — align the file-count fallback with the requests it tracks.
- `src/main.ts` — surface boot errors that occur before the title is mounted.
- `src/ui/ui.ts` — host the non-interactive in-game indicator.
- `src/systems/scenery/index.ts` — track the lifetime of a nearby scenery set's model batch.
- `src/assets/loader.ts` — forward area byte progress while preserving the existing callback and result.
- `src/systems/tools/index.ts` — connect the x-ray indicator to tool activation and cancellation.
- `src/systems/tools/xray.ts` — expose point-cloud fetch and decode completion to the tool UI.
- `src/systems/tools/strings.ts` — reuse the German point-cloud strings and add a failure label if needed.
- `src/i18n/de.ts` — supply shared German loading labels.
- `tests/loader.test.ts` — add unit coverage for boot, reduced motion, request timing and progress.
- `e2e/smoke.spec.ts` — check first paint, handoff bounds and progress ARIA.
- `e2e/skills.spec.ts` — check the pending x-ray request and toggle-off.
- `docs/PRD.md` — record the player-visible loading behaviour in the changelog table.
- `docs/ACTION-RPG.md` — add the corresponding entry to the design log.

**Steps:**

- [x] 1. Render the Bussole and “Lädt …” before the bundle runs. Keep the added SVG and critical CSS under 3 KB combined.
- [x] 2. Have the shared component adopt that element for boot and reuse its SVG for in-game instances.
- [x] 3. Reserve the same compass bounds through the title handoff on desktop and phone. Use legible colours on night and paper.
- [x] 4. Give the progressbar a German accessible name. Set `aria-valuenow` for measured progress and scope `aria-busy` to the loading region.
- [x] 5. Drive the title ring and “Gelände wird geladen … {pct} %” from the existing terrain progress callback.
- [x] 6. Correct the file-count fallback so its denominator matches the tracked requests. It currently counts seven completions against eight.
- [x] 7. Switch to indeterminate progress between terrain completion and game readiness.
- [x] 8. Keep the needle static under the OS reduced-motion preference before JS and honour the saved setting as soon as settings load.
- [x] 9. Clear loading and busy state when the title is ready, preserving button availability and focus.
- [x] 10. Clear the first-paint indicator when skip-title startup enters the game.
- [x] 11. End loading with a German error message on boot failure, including failures before title mount.
- [x] 12. Mount the in-game indicator with the 300 ms delay. Give overlapping requests independent lifetimes and the player-activated x-ray display priority.
- [x] 13. Associate nearby scenery batches with their attached set and release the indicator when the batch settles or the set detaches. Individual prop, character and fauna loads stream in the background.
- [x] 14. Forward `loadArea` byte progress to the indicator for explicit area loads. It currently has no gameplay caller.
- [x] 15. Let the shift effect cover travel through `shift:done`. Show the compass only if the current era's prefetch is still pending after the display delay. Idle shader prewarm runs in the background. `Hud.busy()` tracks combat, hunts and cinematics.
- [x] 16. Tie “Punktwolke wird geladen …” to the shared x-ray fetch/decode promise until it succeeds or fails.
- [x] 17. Dismiss the x-ray indicator on toggle-off, skill loss or restart, even while an older request is pending.
- [x] 18. Add the loader unit tests listed below.
- [x] 19. Add the smoke regression for the title handoff.
- [x] 20. Extend the Röntgenblick regression for a held request.
- [x] 21. Run the four project gates and the two focused browser tests.
- [x] 22. Capture matching after views for the contributor's desktop and phone title screenshots.
- [x] 23. Record the behaviour in the PRD changelog and action-RPG design log.

**Test plan:**

- Unit tests exercise boot failure before and after title mount, skip-title cleanup, the pre-JS reduced-motion CSS rule and the saved reduced-motion setting during boot. Use controlled promises and timers to check the 300 ms threshold, cache hits, overlapping requests, partial failures and zero or unknown totals. Verify the file-count fallback reaches 100% and that completing an older request preserves the active request's label.
- In `e2e/smoke.spec.ts`, hold the entry bundle to inspect first paint, then hold a terrain response and release the bundle. Compare the compass bounds before and after title adoption. Check its German accessible name, regional busy state and agreement between the displayed percentage and `aria-valuenow`.
- In `e2e/skills.spec.ts`, hold `data/pointcloud/ground.kqp.deflate` while Röntgenblick is active. Toggle it off during the wait, then release the response and verify the indicator stays dismissed.
- For a manual in-game check, open `http://localhost:5280/?notitle&nosave&fresh&manual&skills=strict&cam=first`, grant Röntgenblick and teleport to (1160, −1060). On a slow point-cloud request, check that the German loading label stays clear of the touch controls.
- Run `pnpm typecheck`, `pnpm test`, `pnpm validate` and `pnpm build`. For the focused cases, run `scripts/dev/heavy.sh --max-hold 15 -- pnpm exec playwright test e2e/smoke.spec.ts -g 'title screen' --workers=1` and `scripts/dev/heavy.sh --max-hold 15 -- pnpm exec playwright test e2e/skills.spec.ts -g Röntgenblick --workers=1`.
- The contributor will take the **before** screenshots on the unchanged code at `61fe99b`. Use the title page at `http://localhost:5280/?nosave&fresh` with a terrain raster held so the loading state is visible. Capture desktop 1280×720 and phone 667×375. During implementation, repeat these views for the **after** screenshots under `test-results/contribute/TASK-011/`. Attach the phone pair to the PR.

**Risks:** A caller joining a cached asset promise can miss earlier byte callbacks. Account for cached completions, keep progress monotonic and release failed batches when they settle. A late era or scenery completion must only clear its own request, so it cannot dismiss a newer x-ray indicator.

**Open questions:** None.

## Progress

- Branch: `feat/task-011-loading-spinner`
- 2026-11-24: Step 1. Added 2.56 KB of inline SVG, CSS and markup for the first-paint Bussole.
- 2026-11-24: Step 2. The title adopts the inline element and gameplay clones its SVG.
- 2026-11-24: Step 3. The dial bounds match before and after title adoption at 1280 × 720 and 667 × 375.
- 2026-11-24: Step 4. The shared loader sets the German accessible name, progress and regional busy state.
- 2026-11-24: Step 5. The terrain callback drives both the ring and its German percentage label.
- 2026-11-24: Step 6. File-count progress now tracks all nine requests after the terrain metadata.
- 2026-11-24: Step 7. The Bussole switches to indeterminate while the game finishes preparing.
- 2026-11-24: Step 8. Chromium verified OS reduced motion before JS and saved reduced motion during boot.
- 2026-11-24: Step 9. Finishing startup clears progress and busy state and focuses the available start action.
- 2026-11-24: Step 10. Startup with `?notitle` clears the loader when the game starts.
- 2026-11-24: Step 11. A German alert covers failed renderer startup and terrain requests.
- 2026-11-24: Step 12. Gameplay delays each indicator by 300 ms and gives Röntgenblick priority.
- 2026-11-24: Step 13. Attached scenery batches clear their request on settlement or detachment. Individual props, characters and fauna continue to stream in the background.
- 2026-11-24: The additional live quarry detachment probe stalled in headless Chromium. Request cancellation is covered by the loader unit tests.
- 2026-11-24: Step 14. Explicit area loads forward byte progress and account for cached and failed entries when they settle. There is currently no gameplay caller for `loadArea`.
- 2026-11-24: Step 15. Era prefetch feedback runs after the shift. A Chromium check held prefetch through the shift events and verified that the indicator cleared on settlement. Shader prewarm runs in the background, and `Hud.busy()` records gameplay states.
- 2026-11-24: Step 16. Röntgenblick feedback follows fetch and decode, with a German toast on failure.
- 2026-11-24: Step 17. Toggle-off, skill loss and restart release the active request. An older completion releases only its own request.
- 2026-11-24: Step 18. Six unit tests cover static markup, progress, timing, concurrent requests and cached or failed asset loads. Boot errors and skip-title cleanup are covered in Chromium.
- 2026-11-24: Step 19. Desktop and phone smoke cases held the entry bundle and a terrain raster while checking accessibility, motion and positioning.
- 2026-11-24: Step 20. The Röntgenblick case held the point-cloud response through toggle-off and checked eventual decoding.
- 2026-11-24: Step 21. Gates green with the direct validator invocation. The sandbox denied the `tsx` launcher's IPC socket, so validation ran with `node --import tsx scripts/validate-content.ts`. All five selected smoke cases and the Röntgenblick case passed against the production build with Playwright routing files from disk. The sandbox denied the usual Vite preview listener.
- 2026-11-24: Step 22. Captured the desktop and phone views plus Röntgenblick on a touch viewport. The first offline Playwright run cleared the full-size originals. The screenshot directory contains fresh captures from `61fe99b` and copies of the smaller previews of the originals.
- 2026-11-24: Step 23. Added the player-visible behaviour to the PRD and action-RPG log.
- 2026-11-24: Ship review found that late terrain responses could replace a boot error. The loader now stops reporting progress after a failed request, with a regression test for a delayed sibling response.
- 2026-11-24: Typecheck, all 1,456 unit tests and the production build passed. Content validation passed via `node --import tsx scripts/validate-content.ts` because the sandbox blocked the `pnpm validate` launcher's IPC socket. All five selected title-screen cases and the Röntgenblick case passed in Chromium against the production files. The desktop handoff and terrain-failure cases passed on rerun in fresh browser processes.
- 2026-11-24: Uploaded the matching landscape phone screenshots and verified both in the PR description.
- 2026-11-24: Rechecked the 1796 quarry in Chromium with a barrel load held. The compass appeared for the attached set, cleared when the player left, and stayed hidden when the model request was released. The check passed with the render loop stopped while the scenery system stepped.
- PR: https://github.com/schloss-karlsberg/karlsberg-quest/pull/7

## Notes
- `index.html`'s meta description still says "Erkundungs-Rätselspiel" (old concept); tracked in TASK-007.
