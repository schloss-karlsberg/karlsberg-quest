---
id: TASK-035
aliases:
- TASK-035
title: Touch-only players cannot finish Chapter 4 at the kennel
slug: touch-kennel-finale
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- touch
- accessibility
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Touch-only players cannot finish Chapter 4 at the kennel

## Goal

Expose the prone and lantern actions on touch so players can finish Sich stellen
using the existing encounter and continue saves stranded by the missing controls.

## Acceptance Criteria

- [x] A touch-only player who starts upright with the lantern off can finish the standard finale.
- [x] In one-key mode, one touch action settles the gathered pack.
- [x] Ducken still crouches on foot and Sinken still descends in flight.
- [x] Saves stranded in the encounter can finish after continuing.
- [x] The finale reminder follows flight, stance and lantern state, including when a touch player lies down first.
- [x] Choosing an ending again from Pause refreshes the touch controls after the save restores the player on foot.
- [x] The save recovery regression proves the one-shot oil fallback can fire again after resume.

## Plan

**Approach** — Use two dedicated gameplay buttons for Hinlegen and Laterne. Map the HUD hint
to the corresponding touch control and keep the existing Ducken and Sinken binding.
Check the existing save and lantern recovery paths before adding any special handling.

**Files to touch** — touch UI and action mapping, the hunt's HUD reminder, focused
unit and browser coverage, and the input and gameplay docs.

**Steps**

- [x] Extract the current button bindings without changing behavior, then reproduce the stall in a failing unit test.
- [x] Wire the missing actions and verify that the same tests pass.
- [x] Verify the standard, one-key, and resumed encounters in unit tests and preserve the crouch and descent controls.
- [x] Update the input and gameplay docs and changelogs.
- [x] Attempt the four gates and the locked Playwright run on port 5423. Record blocked checks.
- [x] Record the results and prepare the commit.

**Test plan** — Unit coverage connects the touch action bindings, input, player,
lantern logic and pack simulation. The touch spec exercises the actual buttons
on a small landscape viewport, including continuing from the title.

**Risks** — The two new button positions share `touch.css` with TASK-020.

### Review fixes

- [x] Update the finale reminder and cover its state changes in unit tests and the prone-first flow in the touch spec.
- [x] Fix the existing save listener ordering at the point where boot restores the player and cover the touch control refresh.
- [x] Fire the empty-lantern reaction before saving in the recovery test and verify that it fires again after resume.
- [x] Update the gameplay and input docs and their changelogs.
- [x] Run the required gates and attempt the locked browser checks. Record sandbox limits.

## Progress

- Branch `dev/task-035` at `d2d1f48a528e285f15ad843ac80a5a75f7ae7c92`.
- The baseline maps Ducken to crouch and down. The finale waits for prone in both modes and additionally requires a lit lantern in standard mode.
- Both touch regressions failed before the fix with the pack still in `wait`, one in standard mode and one in one-key mode.
- Both passed with the dedicated controls. The existing story resume reconfigures the finale and re-arms Laub's lantern fallback, so saves can recover with the new controls.
- The shared mobile CSS change adds only the two new button positions. The hunt change updates its HUD reminder.
- `pnpm typecheck` and `pnpm build` passed. `pnpm test` reported `Test Files  118 passed (118)` and `Tests  1578 passed (1578)`.
- `pnpm validate` stopped at `listen EPERM` when the runner tried to open its IPC socket.
- The locked touch spec stopped before browser launch because the preview server could not bind `127.0.0.1:5423`. Smoke requires the same port.
- The initial sandbox could not create the worktree's `index.lock`. The implementation was later committed as `367b622`.
- 2026-11-26 review round on `dev/task-035`, starting at `367b622`. The static two-action touch cue and the recovery test gap are branch changes. The early touch save listener also exists on `origin/main`. Its effect on Hinlegen is within this task's scope.
- The finale reminder follows flight, stance and lantern state. The touch spec follows the cues after continuing, from flight to prone to lighting the lantern.
- Touch refreshes on `player:restored`. The restore unit test observes the grounded player and saved stance, and the touch spec exercises ending replay from Pause in flight.
- The recovery test records `b:licht` before saving and verifies that the oil action fires again on resume. The two focused unit suites passed all 57 tests.
- `pnpm typecheck` and `pnpm build` passed. `pnpm test` reported `Test Files  118 passed (118)` and `Tests  1581 passed (1581)`.
- `pnpm validate` stopped at `listen EPERM` on the TSX IPC socket. `pnpm exec node --import tsx scripts/validate-content.ts` ran the same validator and reported `✓ content valid (1 warning(s))`.
- The locked `e2e/touch.spec.ts` attempt stopped before browser launch because the preview server could not bind `127.0.0.1:5423` (`listen EPERM`). Smoke was skipped because it uses the same preview server.
- The review round updates the architecture, gameplay and PRD docs. It requires no new dialogue recordings.

## Follow-ups

- Run `pnpm validate` where the TypeScript runner can open its IPC socket.
- Run `e2e/touch.spec.ts` and `e2e/smoke.spec.ts` under the machine lock on port 5423.

```sh
KQ_E2E_PORT=5423 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/touch.spec.ts --workers=1 --reporter=line
KQ_E2E_PORT=5423 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
```
