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

## Progress

- Branch `dev/task-035` at `d2d1f48a528e285f15ad843ac80a5a75f7ae7c92`.
- The baseline maps Ducken to crouch and down. The finale waits for prone in both modes and additionally requires a lit lantern in standard mode.
- Both touch regressions failed before the fix with the pack still in `wait`, one in standard mode and one in one-key mode.
- Both passed with the dedicated controls. The existing story resume reconfigures the finale and re-arms Laub's lantern fallback, so saves can recover with the new controls.
- The shared mobile CSS change adds only the two new button positions. The hunt change updates its HUD reminder.
- `pnpm typecheck` and `pnpm build` passed. `pnpm test` reported `Test Files  118 passed (118)` and `Tests  1578 passed (1578)`.
- `pnpm validate` stopped at `listen EPERM` when the runner tried to open its IPC socket.
- The locked touch spec stopped before browser launch because the preview server could not bind `127.0.0.1:5423`. Smoke requires the same port.
- Git could not create the worktree's `index.lock`, so the changes are still in the worktree.

## Follow-ups

- Run `pnpm validate` where the TypeScript runner can open its IPC socket.
- Run `e2e/touch.spec.ts` and `e2e/smoke.spec.ts` under the machine lock on port 5423.
- Commit from a shell that can write the worktree index.

```sh
git add -- .mc/tasks/todo/TASK-035-touch-kennel-finale.md docs/ACTION-RPG.md \
  docs/ARCHITECTURE.md docs/PRD.md e2e/touch.spec.ts src/player/touchMap.ts \
  src/systems/hunt/index.ts src/systems/hunt/strings.ts src/ui/touch.css \
  src/ui/touch.ts src/ui/touchIcons.ts tests/hunt-ext.test.ts tests/touchMap.test.ts
git commit -m 'fix(touch): make the chapter 4 finale playable on touch' \
  -m 'Co-Authored-By: Codex <noreply@openai.com>'
```
