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

## Progress

- Branch `dev/task-015`.
- 2026-11-26. Plan recorded before implementation.
- 2026-11-26. Extracted the Karte's paper and symbols and added the local projection and modern path layer.
- 2026-11-26. Wired compass targets, tour positions, the settings store and the short-landscape HUD layout.
- 2026-11-26. `pnpm typecheck`, `pnpm test` (1578 passed, 0 failed) and `pnpm build` passed.
- 2026-11-26. `pnpm validate` was blocked by the sandbox at the tsx IPC socket. The validator itself passed with `node --import tsx scripts/validate-content.ts`.
- 2026-11-26. The locked minimap spec was blocked before the browser launched by `listen EPERM 127.0.0.1:5401`. Playwright discovered both minimap tests.
- 2026-11-26. The sandbox denied the worktree's git index lock. Changes are ready in the worktree.

## Follow-ups

- Run `pnpm validate` outside the sandbox. Run each browser spec in a separate lock hold after building.

  ```sh
  KQ_E2E_PORT=5401 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/minimap.spec.ts --workers=1 --reporter=line
  KQ_E2E_PORT=5401 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
  ```

- Commit locally.

  ```sh
  git add -- src/systems/travel/map.ts src/systems/travel/map-art.ts
  git commit -m 'refactor(ui): share field map artwork' -m 'Refs: TASK-015' -m 'Co-Authored-By: Codex <noreply@openai.com>'
  git add -- .mc/tasks/todo/TASK-015-minimap.md docs/{ACTION-RPG,ARCHITECTURE,MOBILE-UI-PASS,NEXT-SESSION,PERFORMANCE,PRD}.md \
    e2e/minimap.spec.ts tests/minimap.test.ts src/core/save.ts src/i18n/de.ts src/systems/index.ts \
    src/systems/minimap src/systems/quests/index.ts src/systems/story/objectives.ts \
    src/systems/walk/{index,runtime}.ts src/ui/{hud,settings}.ts
  git commit -m 'feat(ui): add a north-up minimap' -m 'Refs: TASK-015' -m 'Co-Authored-By: Codex <noreply@openai.com>'
  ```
