---
id: TASK-031
aliases:
- TASK-031
title: Test coverage and bug sweep for saves, migration, settings and input
slug: save-settings-input-coverage
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- tests
- saves
- input
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Save, settings and input coverage

## Goal

Pin down the behavior players rely on across save slots, state migrations, settings and controls. Fix reproducible defects in this area with a failing test first.

## Acceptance criteria

- [x] Map important behavior and existing coverage for each module.
- [x] Add at least 25 meaningful, deterministic assertions across the area. Run the new tests together in about three seconds or less.
- [x] Reproduce each verified bug before changing behavior. Record unresolved design decisions as test TODOs.
- [ ] Commit each verified fix separately. The worktree index lock was denied after the plan commit.
- [x] Keep changes focused and respect the concurrent tasks.
- [x] Update the relevant docs and PRD changelog.
- [ ] Pass the four gates as written. The validation launcher was blocked.
- [x] Attempt the locked smoke spec if the sandbox permits it. The preview port was blocked.

## Plan

1. Compare the save and input contracts and their callers with named unit tests. Record existing coverage and gaps below.
2. Exercise save/load and migration boundaries, live settings edits, control transitions and labels using deterministic fixtures.
3. Reproduce any discrepancy against the unmodified implementation, check the contract, then make the smallest fix and rerun the test.
4. Record test results, documentation changes and any follow-ups. Run the four gates and Playwright smoke on port 5419.

## Progress

- Started on `dev/task-031` at `d2d1f48a`, matching `origin/main`.
- Committed the task plan as `67808bb`. Git then failed to create the worktree's `index.lock` with “Operation not permitted”. Implementation and report are in the working tree.

## Coverage map

| Module | Player contract | Unit coverage at the start | Gaps selected |
| --- | --- | --- | --- |
| `core/save.ts` slots | A checkpoint records the current era, position and progress. Named slots, manual saves and the throttled auto slot coexist. Cinematics defer autosaves. | `core.test.ts` covers round-trips, throttle/force, disabled writes and missing slots. `cinematic-system.test.ts` covers one hold and reload during a shot. | Failed writes and retries, named-slot isolation, nested holds across an era change and restore notification order. |
| `core/state.ts` | Missing fields get defaults. Earned or empty feature data survive reload. Restored systems must read the new slice. | `core.test.ts` covers defaults, version rejection and stable lazy slices. `chronik.test.ts` and `tour-kastanien.test.ts` cover feature progress. | A subscriber reading the replacement slice, zero coordinates and old references after load. |
| `core/legacy-prologue.ts` | Continue retires obsolete goals, preserves earned progress, settles rewards once and supplies the tour handover. | `tour-handover.test.ts` covers historical fixtures, quest statuses, reward floors and staff timing. | Reward at the XP and inventory caps. Preserve spent points and a prior Codex unlock across repeated loads. |
| `systems/story/migrate.ts` | Replace retired visitor defaults and spring objectives while keeping personal names and active story progress. | `tour-handover.test.ts` covers a historical K3 slot, both old K2 objectives, current text and name fallback. | Covered by existing cases. |
| `systems/travel/points.ts` load migration | Filter obsolete and duplicate markers and keep live destinations in saved order. | `travel.test.ts` covers retired points. `tour-handover.test.ts` exercises migration of both point lists through a real save. | Covered by existing cases. |
| `core/save.ts` settings and `ui/settings.ts` | Preferences start from system accessibility choices. Editing a range changes its announced value and the stored setting. Section navigation respects reduced motion. | `core.test.ts` and `perf-settings.test.ts` cover ordinary persistence, legacy volume defaults and the frame cap. The settings form is exercised in Playwright. | Actual range and navigation callbacks, mute and maximum volume, explicit overrides of device preferences. |
| `player/input.ts` | Keys and buttons produce holds and one-step presses. Legacy custom keys take priority over new defaults. Keyboard repeat, focus loss, pointer lock and modal state govern when input reaches gameplay. | `touchMap.test.ts` covers virtual taps, holds, remaps, Shift and touch lock suppression. `perf-settings.test.ts` covers sharing, migration and its version marker. `notes-turn.test.ts` covers keyboard look. | Native input between ticks, focus loss with pending input, lock retry and self-release, pointer movement and zoom consumption. |
| `ui/touch.ts` and `player/touchMap.ts` | Touch mode follows device/settings. Each finger owns a hold or drag. Pause and cancellation release controls. Flight, stance and learned abilities determine available buttons. | `touchMap.test.ts` covers stick, look, mode, icons, crouch and rotation. `e2e/touch.spec.ts` drives the overlay. | Button ownership across two fingers and cancellation, and interruption before the next tick. |
| `ui/actionLabel.ts` and `ui/settings.ts` key labels | Captions use the active device, chosen binding slot, German special-key names and optional fallback. | `touchMap.test.ts` covers defaults, a desktop fallback, named touch buttons and one keyboard-only action. | Custom secondary binding on a keyboard-only action in touch mode, and an unbound action with no fallback. |

## Regressions reproduced and fixed

- A rejected storage write advanced live `savedAt` by five seconds and throttled the next ordinary attempt. The save manager now publishes the time and starts the cooldown after storage accepts the checkpoint.
- A press, its Shift modifier, a mouse turn and a wheel notch survived a blur or modal transition before the next tick. Returning to play consumed the old input. The input buffer clears on these transitions.
- With two fingers on Hieb, the second finger produced a new attack press, and lifting the first ended the charge. The button now sends one press and releases when the last pointer leaves.
- Switching touch off before a tick released holds but delivered both an earlier Balsam tap and an Epoche press on the next tick. Cancelling virtual input clears its queued presses as well as its holds.

## Verification

- Five focused test files, 84 assertion sites. `Tests  15 passed | 1 todo (16)` in 198 ms. Save tests inject time, touch tests use fake timers at epoch zero and input tests dispatch events synchronously.
- `pnpm typecheck` passed. `pnpm test` reported `Test Files  123 passed (123)` and `Tests  1588 passed | 1 todo (1589)`, 0 failed.
- `pnpm validate` could not open the tsx IPC socket (`listen EPERM`). Running the same validator with `node --import tsx scripts/validate-content.ts` returned `✓ content valid (1 warning(s))`.
- `pnpm build` returned `✓ built in 410ms`. MissionControl validation passed.
- The locked smoke command reached Vite preview, which could not listen on `127.0.0.1:5419` (`EPERM`). The browser spec did not start. No e2e spec or voiced line changed.

## Follow-ups

- Decide whether an ordinary autosave requested during a hold must bypass the five-second cooldown when the last hold ends. The hold contract promises a write at release, and the throttle contract exempts forced requests. The open case is an `it.todo` in `tests/save-lifecycle.test.ts`.
- Run `pnpm validate` and `KQ_E2E_PORT=5419 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line` in a session with local socket access.
- With write access to the worktree index, the following commands commit the regression tests first and each fix separately.

```sh
trailer='Co-Authored-By: Codex <noreply@openai.com>'
git add tests/control-fixture.ts tests/save-checkpoints.test.ts tests/save-lifecycle.test.ts tests/input-events.test.ts tests/touch-buttons.test.ts tests/settings-controls.test.ts
git commit -m 'test: cover save migration, settings and input interruptions' -m 'Refs: TASK-031' -m "$trailer"
git add src/core/save.ts
git commit -m 'fix: advance save timestamps only after a successful write' -m 'Refs: TASK-031' -m "$trailer"
git add -p src/player/input.ts  # Stage the first three hunks. Leave releaseVirtual for its own commit.
git commit -m 'fix(ui): clear queued input on pause and focus changes' -m 'Refs: TASK-031' -m "$trailer"
git add src/ui/touch.ts
git commit -m 'fix(touch): hold a button until its last finger lifts' -m 'Refs: TASK-031' -m "$trailer"
git add src/player/input.ts
git commit -m 'fix(touch): discard queued actions when touch controls deactivate' -m 'Refs: TASK-031' -m "$trailer"
git add docs/ARCHITECTURE.md docs/ACTION-RPG.md docs/PRD.md .mc/tasks/todo/TASK-031-save-settings-input-coverage.md
git commit -m 'docs: record save and input regression coverage' -m 'Refs: TASK-031' -m "$trailer"
```
