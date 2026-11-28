---
id: TASK-031
aliases:
- TASK-031
title: Test coverage and bug sweep for saves, migration, settings and input
slug: save-settings-input-coverage
status: done
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
updated: 2026-11-28
---

# Save, settings and input coverage

## Goal

Pin down the behavior players rely on across save slots, state migrations, settings and controls. Fix reproducible defects in this area with a failing test first.

## Acceptance criteria

- [x] Map important behavior and existing coverage for each module.
- [x] Add at least 25 meaningful, deterministic assertions across the area. Run the new tests together in about three seconds or less.
- [x] Reproduce each verified bug before changing behavior. Record unresolved design decisions as test TODOs.
- [ ] Commit the final review fixes. The earlier review changes are in `7ee2b45` and `d6678fb`.
- [x] Keep changes focused and respect the concurrent tasks.
- [x] Update the relevant docs and PRD changelog.
- [ ] Pass the four gates as written. The sandbox denied the validation launcher's IPC listener.
- [x] Attempt the locked smoke spec if the sandbox permits it. The preview port was blocked.

## Plan

1. Compare the save and input contracts and their callers with named unit tests. Record existing coverage and gaps below.
2. Exercise save/load and migration boundaries, live settings edits, control transitions and labels using deterministic fixtures.
3. Reproduce any discrepancy against the unmodified implementation, check the contract, then make the smallest fix and rerun the test.
4. Record test results, documentation changes and any follow-ups. Run the four gates and Playwright smoke on port 5419.

### Review fix round

- [x] Reproduce repeated failed autosave writes with the injected clock. Preserve the first immediate retry, then back off for one second after consecutive failures, including forced autosaves.
- [x] Assert the persisted timestamps and the native pointer-lock exit calls in the existing regression tests.
- [x] Update the autosave contract in the architecture notes, action-RPG log and PRD changelog.
- [x] Attempt all four gates and the locked smoke spec on the reviewed changes.
- [x] Commit the earlier review changes as `d6678fb`.
- [x] Retry queued forced checkpoints after backoff and allow one immediate attempt at tab hide or return to title.
- [x] Use elapsed time for save cooldowns and share touch button ownership across fingers and timed activations.

## Progress

- Started on `dev/task-031` at `d2d1f48a`, matching `origin/main`.
- Committed the task plan as `67808bb`. The initial session hit a worktree index lock denial. The implementation was subsequently committed as `d8ff28b`.
- The review round starts from the implementation commit `d8ff28b` on `dev/task-031`.
- Before the fix, the injected-clock test reproduced six serializations, writes and warnings from six autosave requests at the same timestamp.
- Focused save and control checks passed with 38 tests and one existing TODO. Temporary mutations confirmed that the new assertions detect a stale serialized timestamp and a missing native pointer-lock exit call.
- Committed the pointer-lock regression assertion as `7ee2b45`. The timestamp assertions, backoff fix and docs landed in `d6678fb`.
- 2026-11-26 — PR #59 review fixes queue forced checkpoints for retry, add one immediate attempt on tab hide and return to title, and use monotonic cooldowns. Timed keyboard and assistive technology activations share holds with pointers on Hieb. The pointer-lock test now checks application behavior after the native request settles. Renamed the PR to `fix: cover saves, settings and input edge cases` for use as the squash summary.
- 2026-11-26 — Typecheck, build and all 123 Vitest files passed (1,598 tests passed and one existing TODO). Direct content validation passed with one warning. The `pnpm validate` launcher hit `listen EPERM` on its IPC socket. The new story browser cases could not start because preview hit `listen EPERM` on port 5419. Story, cinematic, party, touch and smoke specs remain to be run with one worker.

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
- Review reproduced six repeated writes during a storage outage. The first rejected autosave allows an immediate retry. From the second failure onward, each failed attempt starts a one-second backoff. Forced checkpoints queue for retry, and hiding the tab or returning to title gives one immediate attempt outside cinematic holds. A successful autosave clears the failure streak.

## Review findings

| Finding | Disposition |
| --- | --- |
| 1. Repeated failed autosaves | Fixed. The injected-clock tests cover immediate retry, the backoff boundary, another failure after backoff, and recovery. |
| 2. Exact validation gate | Deferred. The exact command was blocked at the local IPC listener again. Run it on the final HEAD in a session with socket access before merging. |
| 3. Persisted checkpoint timestamp | Fixed. The checkpoint test reads `meta.savedAt` back from storage after both the initial save and the retry. |
| 4. Native pointer-lock exit | Fixed. The input test checks zero calls while unlocked and one call while locked. |

## Verification

### Initial implementation

- Five focused test files, 84 assertion sites. `Tests  15 passed | 1 todo (16)` in 198 ms. Save tests inject time, touch tests use fake timers at epoch zero and input tests dispatch events synchronously.
- `pnpm typecheck` passed. `pnpm test` reported `Test Files  123 passed (123)` and `Tests  1588 passed | 1 todo (1589)`, 0 failed.
- `pnpm validate` could not open the tsx IPC socket (`listen EPERM`). Running the same validator with `node --import tsx scripts/validate-content.ts` returned `✓ content valid (1 warning(s))`.
- `pnpm build` returned `✓ built in 410ms`. MissionControl validation passed.
- The locked smoke command reached Vite preview, which could not listen on `127.0.0.1:5419` (`EPERM`). The browser spec did not start. No e2e spec or voiced line changed.

### Review fix round

- `pnpm typecheck` passed (`$ tsc --noEmit`).
- `pnpm test` passed with `Test Files  123 passed (123)` and `Tests  1589 passed | 1 todo (1590)`, 0 failed.
- `pnpm validate` exited 1 before validation with `listen EPERM` while opening the tsx IPC socket.
- `pnpm build` passed with `✓ built in 523ms`.
- The locked `e2e/smoke.spec.ts` run stopped at preview startup with `listen EPERM` on `127.0.0.1:5419`. No e2e spec or voiced line changed.

## Follow-ups

- Decide whether an ordinary autosave requested during a hold must bypass the five-second cooldown when the last hold ends. The hold contract promises a write at release, and the throttle contract exempts forced requests. The open case is an `it.todo` in `tests/save-lifecycle.test.ts`.
- Commit the final review changes with write access to the worktree index. Use the updated PR title as the squash summary.

- Run `pnpm validate` on the final HEAD before merging and verify the affected browser specs in a session with local socket access.

```sh
pnpm validate
KQ_E2E_PORT=5419 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/story.spec.ts e2e/cinematic.spec.ts e2e/party.spec.ts e2e/touch.spec.ts e2e/smoke.spec.ts --workers=1 --reporter=line
```

## Closed (audit 2026-11-28)

Merged in PR #59. The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
