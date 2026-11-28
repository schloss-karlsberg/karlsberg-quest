---
id: TASK-044
aliases:
- TASK-044
title: 'Soft-lock and progress-loss hunt: Chapter 4'
slug: chapter-4-progress
status: done
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- story
- save
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-28
---

# Chapter 4 progress audit

## Goal

Find and repair the most serious confirmed K4 progress or reward losses without changing
dialogue, design, balance, or work assigned to other tasks.

The review round covers the saved well echo, the fidelity of the autosave and legacy-save tests,
duplicate Pacht failures, and the spring arrival on Continue.

## Acceptance criteria

- [x] Trace every K4 beat, quest and objective through the systems that advance it.
- [x] Verify the note, court and kennel beat autosaves with production action retirement, and seed saves with missing quests directly at `k4_1`, `k4_6`, `k4_8` and `k4_12`.
- [x] Credit a remembered 1840 echo and well visit, and recover saves already at the drive or kennel.
- [x] Make the Pacht cutoff idempotent and preserve rewards for a ready quest.
- [x] Complete an interrupted spring arrival and preserve the saved position and heading after arrival.
- [x] Update gameplay docs and the PRD, and verify the voiced text against `origin/main`.
- [x] Pass typecheck, unit tests and build. Run content validation and record the results.
- [ ] Pass `pnpm validate` and the two Playwright specs as written. The sandbox blocks their listeners.
- [x] Record the disposition of each review finding.
- [ ] Commit the fixes locally. The sandbox blocks the worktree index lock.

## Plan

- [x] Share delayed-action retirement with the regression harness. Verify beat autosaves and seed older saves independently of the patched enter actions.
- [x] Restore well credit from the saved echo before the shift, with coverage for saves past the well.
- [x] Verify repeated Pacht cutoff and a ready payout through the production quest logic.
- [x] Save spring arrival with the teleport and cover both sides of the arrival in Continue tests.
- [x] Update the gameplay docs and PRD, attempt the four gates and both Playwright specs, and record verification.
- [ ] Commit the code and docs locally when git can take the worktree index lock.

## Trace

| Beats | Quest objectives and advance path |
| --- | --- |
| `k4_0`–`k4_1` | `zettel`: discover Marlene's note (Chronik or saved clue), then reach the valley anchor in 1796. The quest pays automatically; the note alone advances `k4_0`. |
| `k4_2`–`k4_3` | `karren`: cart echo → three tagged Steinfresser kills → west viewpoint → Hohenburg clue → rewind echo. Combat restores unfinished groups; Chronik remembers heard echoes and found clues. The rewind's presentation shifts eras after the quest has paid. |
| `k4_4` | `baumagazin`: accept from Soll, find the lease and cart stone, kill the stockpile Steinfresser and optionally the Gruslinge, then turn in. Quest events record finds and kills; saved clues settle in the active quest. |
| `k4_5`–`k4_7` | `steinplatz`: reach the court, examine the notice, kill the Steinbrecher, examine the trench, collect its page. The kill starts the Steinfraß; a wake returns through the court anchor. The page and quest payout open the well leg. |
| `k4_8`–`k4_10` | `standpunkt`: reach the well, hear the 1840 echo, then follow the drive or enter the kennel circle in today. The drive uses hunt events; the circle is the fallback after departure or a catch. The quest pays once either path completes. |
| `k4_11`–`k4_13` | `stellen`: reach the kennel, lie down with the lantern on, wait for the pack to fade, speak to the Pikeur, and turn in for the horn. The hunt simulation owns the calm/fade events; dialogue owns the talk/turn-in. |
| `k4_14`–`k4_15` | Dawn closes outstanding side quests, returns to the Quelle and records the photo and Laub's last clue. The last beat fills legacy readings and advances to the endings. No K4 objective takes place in the 1793 fire; that is K3. |
| Side quests | `zeichen`: optional old stone, remembered cart mark, tagged rubble kills and pickup, then roadside reach in today. `graeben`: three tagged Grusling groups, then present-day relief clue. `pacht`: three tagged Steinfresser kills, their persisted lease drops, then turn-in to Soll before the drive. Existing rules pay a ready side quest at cutoff and fail an unfinished one. |

Cross-checked the K4 pack's clue requirements and dialogue triggers, beat autosaves and resume
filters, quest credit and rewards, combat death and restoration, the hunt's pause and era handling,
fast-travel position changes, and chapter selection retaining existing quests and clues. Touch and
reduced motion use the same reach, quest and hunt events; their input/camera paths did not change.

## Progress findings

Root lines below refer to the starting revision `d2d1f48a`. The production story host runs pending
state changes from the previous beat before the beat autosave. Delayed exit actions belong to the
receiving beat and can still be pending when it is saved. Continue runs the receiving beat's
resumable enter list. The initial test harness omitted retirement and overstated the number of
reproduced failures.

| Repro | Root in `content/story/04-kapitel-4.story.json` | Fix | Vitest regression in `tests/k4-resume.test.ts` |
| --- | --- | --- | --- |
| Read Marlene's note before the delayed voice offer. | Line 263: the offer belongs to `k4_0`. Beat retirement accepts the quest before the `k4_1` autosave. | Keep the `k4_1` start for saves that already lack `zettel`; the saved note settles the objective. | Beat autosave and seeded legacy save |
| Start the court approach inside the arrival circle. | Line 444: beat retirement accepts `steinplatz` before the `k4_6` autosave. | Keep the `k4_6` start for saves that already lack `steinplatz`; the notice still gates the boss. | Beat autosave and seeded legacy save |
| Turn in the trench quest and continue from the first well save, then hear the 1840 echo. | Line 500: `standpunkt` was a delayed exit action; its `onResume` never ran on `k4_8`. | Start the quest on entry/resume of `k4_8`. | Seeded legacy save at `k4_8` |
| Continue after the well echo advances the beat but before the shift has happened. | Line 565: the shift and Pacht cutoff were pending exit actions. | Own the transition in `k4_9`; resume the shift and cutoff and provide a present-day kennel marker. | `finishes the shift into the present after saving on the drive beat` |
| Enter the kennel immediately after the drive, or load a Jost save where the quest missed the calm event. | Lines 631 and 698: beat retirement accepts `stellen` before the `k4_12` autosave. The pack fade advances the story independently of quest credit. | At `k4_12` restore a missing quest and arrival credit; at `k4_13` restore credit for the already-completed calm. Jost still requires interaction and turn-in; the horn pays once. | Beat autosave, seeded legacy save and older Jost save |
| Reload from the first dawn save, before the teleport and clue grants. | Lines 754 and 768: these were one-shot actions, but the last clue was the completion gate. | Resume the interrupted arrival and clue grants. Record the teleport so later saves keep their position and heading. | Interrupted arrival, post-arrival save and older dialogue/photo saves |

## Review round

Branch `dev/task-044`, 2026-11-26.

| Finding | Status | Verification |
| --- | --- | --- |
| 1. Early 1840 echo leaves the well uncredited | Fixed | The chapter reaction restores well and echo credit before the shift and repairs `k4_9` and `k4_10` saves. The early-echo and later-save tests assert quest completion at the kennel. |
| 2. The harness omitted action retirement | Fixed | Production and the harness share retirement. The three receiving beats retain the quest before the autosave even when their extra start is removed. Disabling retirement fails all three tests. |
| 3. The recovery tests saved after the patched quest start | Fixed | Four fixtures start directly at the receiving beat with the quest absent. Disabling `onResume` fails all four tests. |
| 4. Pacht emits another failure on Continue | Fixed | The second cutoff emits no failure or forced quest-fail save, and a ready quest pays 250 XP once. |
| 5. Dawn repeats the teleport after arrival | Fixed | The teleport records arrival when it runs. Continue restores an interrupted arrival and preserves the saved pose after arrival. Old saves with the first dawn line or photo also keep their pose. |

## Verification

- `pnpm typecheck` and `pnpm build` passed.
- `pnpm test` reported `Test Files  119 passed (119)` and `Tests  1590 passed (1590)`. Zero tests failed.
- `pnpm validate` failed to bind the `tsx` IPC socket (`EPERM`). The same validator ran via
  `node --import tsx scripts/validate-content.ts` and reported `✓ content valid (1 warning(s))`.
  The warning points to the example pack's single-entry case.
- `e2e/chapter-k4.spec.ts` and `e2e/smoke.spec.ts` were each attempted under `heavy.sh` with one
  worker. The sandbox denied the preview server's bind on `127.0.0.1:5432` for both (`EPERM`).
  Playwright discovered the new Chapter 4 regression and the two existing tests.
- All 41 Chapter 4 `say` actions matched `origin/main` for text, speakers and line IDs.
- `git add` failed to create the worktree's `index.lock` (`Operation not permitted`). The review
  changes remain in the worktree. The branch tip is `efe5960dada9605f8c9ff28af7a8d1277dc1cf61`.

### Local commits pending index access

```sh
git add content/story/04-kapitel-4.story.json e2e/chapter-k4.spec.ts src/core/state.ts \
  src/systems/quests/index.ts src/systems/quests/logic.ts src/systems/story/engine.ts \
  src/systems/story/index.ts src/systems/story/migrate.ts src/systems/story/schedule.ts \
  src/systems/story/types.ts src/systems/story/validate.ts tests/k4-resume.test.ts
git commit -m 'fix(story): recover chapter 4 progress on continue' -m 'Co-Authored-By: Codex <noreply@openai.com>'
git add .mc/tasks/todo/TASK-044-chapter-4-progress.md content/story/README.md docs/ACTION-RPG.md docs/PRD.md
git commit -m 'docs(story): record chapter 4 review fixes' -m 'Co-Authored-By: Codex <noreply@openai.com>'
```

## Follow-ups

- A save made during the Westblick rewind can resume in 1789; the player can still return to
  today and use the valley anchor. Consider restoring that presentation's delayed return separately.
- The live pack's intermediate finale animation is not saved; continuing before Jost appears can
  replay part of the encounter. This patch preserves quest credit and repairs saves at Jost.
- The interrupted-echo and touch-only kennel work remains with TASK-029 and TASK-035.
- Run the two Playwright specs on a host that can bind the preview port. For older dawn saves
  with no arrival flag, dawn dialogue or photo, Continue treats the arrival as interrupted.

## Closed (audit 2026-11-28)

Merged in PR #100. The review fixes that sandboxed sessions could not commit are in that PR, and the browser and validation runs that were blocked there are covered by the green hosted e2e suite on main (`f8a75ff7`). Open design questions stay as `it.todo` entries in the unit tests.
