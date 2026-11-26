---
id: TASK-015
aliases:
- TASK-015
title: Minimap
slug: minimap
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- ui
- travel
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Minimap

## Goal

Give players a corner map for local orientation and for finding the tour group and current objective.

## Acceptance Criteria

- [x] The north-up 2D HUD canvas shares the Karte artwork, shows nearby paths in both eras and switches with the world.
- [x] The canvas shows a heading arrow, live tour guide and group dots, and the current objective, with distant markers clamped to the edge.
- [x] The default-on German toggle persists. The minimap hides in photo mode, cinematics, title, pause and map view, and snaps heading with reduced motion.
- [x] The smaller phone layout reserves space beside the controls and dialogue and honours safe-area insets.
- [x] The minimap redraws at about 10 Hz with no extra 3D draws or per-frame allocations. Draw cost is measured.
- [x] Unit tests cover projection, era selection and edge clamping. A browser spec covers visibility, persistence and phone layout.
- [x] The architecture, backlog, mobile layout, performance note and change logs are updated.
- [x] The first Registratur lead uses its entrance route from outside, and the historical minimap overlays the in-game paths on the survey.
- [x] The touch layout reserves space for the lit action label, and staged scenes and the touch survey menu suspend the minimap.
- [x] Local redraws cull off-screen footprints, with layer-specific unit assertions and Canvas 2D instrumentation in the browser spec.
- [ ] Capture the Canvas 2D draw-cost figure from a browser run.
- [ ] Verify the browser specs and run the standard validation wrapper outside the sandbox.

## Plan

_Status: approved 2026-11-26_

**Approach.** Keep north up to match the Karte view and keep paths steady when the player turns. Reuse the field map's paper and footprints, the loaded modern paths and the existing objective and walking-group state. Use a throttled HUD canvas and the project's shared visibility and settings mechanisms.

**Files to touch.** Travel and walk for shared map and marker data, the HUD and settings for the minimap, unit tests and a focused Playwright spec, and the architecture, backlog, mobile and gameplay change logs.

**Steps**

- [x] Share the Karte resources and implement the local projection, era layers and marker drawing.
- [x] Wire up live markers, settings, visibility and the mobile layout.
- [x] Check the projection and canvas cost, update the docs and add the browser coverage.

**Test plan.** Test the projection, era switch and edge behaviour in Vitest. Run the minimap and smoke specs individually under the heavy lock on port 5401. Check the minimap on 667 × 375 touch with the documented insets and desktop, and measure the 2D draw work.

**Risks.** The short landscape layout has little free space above the thumb controls. Keep the map clear of touch targets and yield to overlapping overlays.

**Open questions.** None.

### Review fixes (2026-11-26)

- [x] Use the entrance-routed story lead and draw historical path surfaces from the terrain grid.
- [x] Keep the touch notice dock clear of lit action labels and suspend hidden minimap redraws.
- [x] Cache footprint bounds, assert the individual drawing layers and count real Canvas 2D calls in Playwright.
- [x] Update the affected docs, run all four gates and attempt the minimap and smoke specs under separate lock holds.

## Progress

- Branch `dev/task-015`.
- 2026-11-26. Plan recorded before implementation.
- 2026-11-26. Extracted the Karte's paper and symbols and added the local projection and modern path layer.
- 2026-11-26. Wired compass targets, tour positions, the settings store and the short-landscape HUD layout.
- 2026-11-26. `pnpm typecheck`, `pnpm test` (1578 passed, 0 failed) and `pnpm build` passed.
- 2026-11-26. `pnpm validate` was blocked by the sandbox at the tsx IPC socket. The validator itself passed with `node --import tsx scripts/validate-content.ts`.
- 2026-11-26. The locked minimap spec was blocked before the browser launched by `listen EPERM 127.0.0.1:5401`. Playwright discovered both minimap tests.
- 2026-11-26. The initial implementation is in `0fc182c` and `1bfc2dc` in the PR checkout.
- 2026-11-26. Review fixes reuse the routed objective, add terrain-aligned historical paths, move the notice dock clear of the lit action pill and skip off-screen redraws and footprints. The focused unit suite passed (13 tests). The browser spec now counts Canvas 2D calls at the tour car park and checks the Registratur approach, staged mode, survey menu and phone notices.
- 2026-11-26. `pnpm typecheck`, `pnpm test` (`Tests  1584 passed (1584)`, 0 failed), `pnpm build` and `mc validate` passed. The `pnpm validate` wrapper hit `listen EPERM` on the tsx IPC socket.
- 2026-11-26. Playwright discovered all three minimap tests. The locked minimap and smoke runs both stopped before launching the browser because the preview server could not listen on `127.0.0.1:5401`.
- 2026-11-26. The first review round is in `19ff905` in the PR checkout.
- 2026-11-26. PR #54 review fix. The notice dock clears the unlocked skills on tall touch layouts. Dialogue and notices reclaim the map slot when the shortest layout hides it. The historical path canvas is prepared before the first redraw, and the north label has clear space above the markers. Playwright covers the live layouts and logs the cold 667 × 375 touch shift. The standalone Node benchmark measured 7.988 ms for terrain-buffer preparation and 0.010 ms per warmed present-day redraw with a stub canvas.
- 2026-11-26. Typecheck, Vitest (119 files, 1,586 tests), direct content validation and the production build passed. Playwright discovered all six minimap tests. The locked browser run stopped at `listen EPERM 127.0.0.1:5401`, leaving the layout and cold-shift timings unverified. The fixes are unstaged.

## Follow-ups

- Run `pnpm validate` in an environment that permits the tsx IPC socket. Run the browser specs after building and record the logged Canvas 2D timings in the performance notes.

  ```sh
  pnpm build
  for spec in minimap touch smoke progression chapter-prolog; do
    KQ_E2E_PORT=5401 scripts/dev/heavy.sh --max-hold 15 -- pnpm exec playwright test "e2e/$spec.spec.ts" --workers=1 --reporter=line
  done
  ```
