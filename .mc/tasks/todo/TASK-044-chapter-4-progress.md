---
id: TASK-044
aliases:
- TASK-044
title: 'Soft-lock and progress-loss hunt: Chapter 4'
slug: chapter-4-progress
status: in-progress
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
updated: 2026-11-26
---

# Chapter 4 progress audit

## Goal

Find and repair the most serious confirmed K4 progress or reward losses without changing
dialogue, design, balance, or work assigned to other tasks.

## Acceptance criteria

- [x] Trace every K4 beat, quest and objective through the systems that advance it.
- [x] Reproduce 3–6 confirmed issues in failing Vitest regressions before fixing them.
- [x] Repair the issues and recover existing stuck saves where applicable.
- [x] Update gameplay docs and the PRD; preserve voiced text, touch and reduced motion.
- [x] Pass typecheck, unit tests, content validation and build (validation via the Node loader).
- [x] Attempt smoke e2e under the lock and record the sandbox result.
- [x] Record per-bug findings and the local commit messages.

## Plan

1. Map the generated chapter and quests to story waits, quest payouts and world systems.
2. Check order, retries, saves, chapter replay, departure and return, death, pause and input modes.
3. Reproduce the strongest bugs using the existing engine/quest/save test harnesses.
4. Fix them narrowly, regenerate content if needed, and verify old-save recovery and idempotence.
5. Update docs, run gates and smoke on port 5432, then record the results and commit locally.

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

## Confirmed bugs

Root lines below refer to the starting revision `d2d1f48a`. The common failure is that a beat
autosave persists the receiving beat but not its predecessor's pending actions; resume only runs
the receiving beat's resumable enter list. See `src/systems/story/engine.ts:387`,
`src/systems/story/engine.ts:424` and `src/systems/story/index.ts:1617`.

| Repro | Root in `content/story/04-kapitel-4.story.json` | Fix | Vitest regression in `tests/k4-resume.test.ts` |
| --- | --- | --- | --- |
| Read Marlene's note before the delayed voice offer. Continue on the valley beat, then cross into 1796. | Line 263: the offer only ran on `k4_0`, which the note completes at once. | Start the same quest on entry/resume of `k4_1`; the known note settles the objective. | `accepts the note quest when the note was read before its offer` |
| Start the court approach inside the arrival circle and continue from the immediate boss beat save. | Line 444: arrival can beat the delayed `steinplatz` start. | Start the quest on entry/resume of `k4_6` too; the notice still gates the boss. | `starts the Steinplatz quest when arrival skips the approach delay` |
| Turn in the trench quest and continue from the first well save, then hear the 1840 echo. | Line 500: `standpunkt` was a delayed exit action; its `onResume` never ran on `k4_8`. | Start the quest on entry/resume of `k4_8`. | `restores Standpunkt siebzehn after saving as the trench quest ends` |
| Continue after the well echo advances the beat but before the shift has happened. | Line 565: the shift and Pacht cutoff were pending exit actions. | Own the transition in `k4_9`; resume the shift and cutoff and provide a present-day kennel marker. | `finishes the shift into the present after saving on the drive beat` |
| Enter the kennel immediately after the drive and reload, or load a Jost save where the quest missed the calm event. | Lines 631 and 698: the delayed quest start could be lost, and the pack fade advanced the story independently of quest credit. | At `k4_12` ensure the quest and arrival credit; at `k4_13` restore credit for the already-completed calm. Jost still requires interaction and turn-in; the horn pays once. | `keeps the kennel quest and pays the horn once after an immediate-arrival save`; `credits the finished finale in an older Jost save without bypassing the talk` |
| Reload from the first dawn save, before the teleport and clue grants. | Lines 754 and 768: these were one-shot actions, but the last clue was the completion gate. | Resume the teleport and grants; wait for both clues before leaving dawn. | `restores the spring arrival and both dawn clues before leaving Chapter 4` |

## Verification

- All seven regression cases failed before the fixes and pass afterward.
- `pnpm typecheck` and `pnpm build` passed; `pnpm test`: `Tests  1580 passed (1580)`.
- `pnpm validate` could not bind the `tsx` IPC socket (`EPERM`). The same validator passed via
  `node --import tsx scripts/validate-content.ts`: `✓ content valid (1 warning(s))`.
- `e2e/smoke.spec.ts` was attempted under `heavy.sh` with port 5432; the sandbox denied the
  preview server's bind (`EPERM`). Run smoke on a host that permits the port; `e2e/chapter-k4.spec.ts`
  is the existing campaign-level check for this chapter.
- A comparison of every K4 `say` action found no changes to IDs, speakers, references or text.
- The sandbox denied creation of the worktree's `index.lock`, so both changesets remain
  uncommitted. Intended messages: `fix(story): recover Chapter 4 progress after reload` and
  `docs(story): record the Chapter 4 progress audit` (both with the requested co-author trailer).

## Follow-ups

- A save made during the Westblick rewind can resume in 1789; the player can still return to
  today and use the valley anchor. Consider restoring that presentation's delayed return separately.
- The live pack's intermediate finale animation is not saved; continuing before Jost appears can
  replay part of the encounter. This patch preserves quest credit and repairs saves at Jost.
- The interrupted-echo and touch-only kennel work remains with TASK-029 and TASK-035.
