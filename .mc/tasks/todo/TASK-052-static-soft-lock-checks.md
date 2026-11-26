---
id: TASK-052
aliases:
- TASK-052
title: Static soft-lock checks in the content validator
slug: static-soft-lock-checks
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- content
- validation
sprint: ''
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Static soft-lock checks in the content validator

## Goal

Catch broken story and quest progression while authors are editing content. Report the file
and affected id, with warnings for cases that need a playthrough or an editorial decision.

## Acceptance criteria

- [x] Check prerequisite flags and conditions against reachable earlier producers and known runtime sources.
- [x] Check each beat from its chapter start and each required quest for a reachable offer and completion.
- [x] Check objective items for existence and acquisition, and objective events for emitters and timing.
- [x] Detect conflicting text under a shared say id, including pack dialogue.
- [x] Exercise each rule on small Vitest fixtures and keep the extra validation time below two seconds.
- [x] Document the checks in both authoring guides and the PRD, and record findings and gate results.

## Plan

- [x] Trace beat transitions, action ordering, quest activation, event consumption and pack rewards in the runtime.
- [x] Add the cross-file checks to the existing validation entry point, with regression fixtures and diagnostics.
- [x] Run the checks on the shipped chapters, investigate findings and record unresolved cases.
- [x] Update the authoring guides and changelog. Run the four gates and the locked smoke spec if available.

### Review fixes

Keep the fresh-campaign checker aligned with runtime events, quest state and action timing,
and keep the chapter-three basket cue safe when resuming an older save.

- [x] Trace and correct the 14 validator findings, with a fixture for each regression.
- [x] Guard the basket cue after pickup and test the old-save state.
- [x] Update the authoring guides and changelogs, run the four gates and attempt locked browser checks.
- [x] Record each review disposition.
- [x] Commit the remaining review changes locally on `dev/task-052` (`ae41dc6`).

## Progress

- Review round, 2026-11-26. The chapter-three cue now also requires the basket objective to
  be incomplete. The story-engine regression exercises three kills, the fourth kill, and a
  resumed save with the basket already collected. Dialogue text and clip ids match the branch
  baseline.
- Branch `dev/task-052`. Traced the story engine, NPC topics, Chronik discoveries, quest book,
  item pickup events and turn-in rewards.
- Added an ordered progression pass, emitter and dialogue checks, and fixtures for broken and
  working paths. The CLI uses Node's tsx import hook because the tsx launcher opens an IPC socket.

- Corrected the chapter 3 basket cue. The quest caps `schatten` at four and opens the basket
  objective at that count. The old cue waited for five. Verified that the threshold was the
  only changed value in the story JSON.
- Updated both authoring guides, the PRD changelog and the action-RPG risk log.
- Four gates passed. TypeScript exited 0. Vitest reported `Test Files  119 passed (119)` and
  `Tests  1604 passed (1604)`, with zero failures. Validation reported
  `Progression: 0 error(s), 11 warning(s)` and `✓ content valid (20 warning(s))` across all
  checks. The production build reported `✓ built in 933ms`.
- Five measurements of the added work, including quest loading and the source-emitter scan,
  took 78, 66, 56, 56 and 88 ms on the shipped catalog. The progression suite has 21 tests.
- The locked smoke run stopped before browser launch. The sandbox denied the preview server
  permission to listen on `127.0.0.1:5439`.

## Review verification

- Four gates passed. TypeScript exited 0. Vitest reported `Test Files  119 passed (119)` and
  `Tests  1631 passed (1631)`, with zero failures. The progression suite has 47 tests. Validation
  reported `Progression: 0 error(s), 15 warning(s)` and `✓ content valid (24 warning(s))` across
  all checks. The production build reported `✓ built in 458ms`.
- Five measurements of the progression pass, including quest loading and the source-emitter
  scan, ranged from 204 to 271 ms on the shipped catalog.
- The locked smoke run stopped before Chromium launch. The sandbox denied the preview server
  permission to listen on `127.0.0.1:5452`.
- Compared all chapter-three `say` actions with `0454b3a`. They match exactly.

## Review dispositions

| # | Status | Fix |
| --- | --- | --- |
| 1 | Fixed | Arrival events match the reachable tour walk's NPC, route and stop. |
| 2 | Fixed | Pickup gates spend placements and update inventory using the actual bounded payload and event count. |
| 3 | Fixed | Inline choices test prerequisites before applying effects and use a reachable timeout fallback. |
| 4 | Fixed | Voice turn-ins require a story command. NPC turn-in state and payouts travel together. |
| 5 | Fixed | Delayed exit cues are scheduled in the destination beat. |
| 6 | Fixed | Reaction clocks respect beat completion, and chapter reactions use the chapter clock. |
| 7 | Fixed | Chapter entry applies the runtime's earlier-quest reset and expiry rules. |
| 8 | Fixed | Confirmation gates distinguish legacy saves and debug progress from fresh play. |
| 9 | Fixed | Each choice occurrence has its own simulated decision. |
| 10 | Fixed | Repeat reactions clear their event latches and need fresh emissions, subject to cooldown. |
| 11 | Fixed | NPC access respects placement eras and kill objectives use the group's remaining enemies. |
| 12 | Fixed | Runtime flag checks use writer values and prerequisites, including court inspection and anchors. |
| 13 | Fixed | The validator shares the deed lookup and permits world pickups to write deeds independently of quests. |
| 14 | Fixed | The checker diagnoses a missing reachable offer, start or completion for a main quest. |
| 15 | Fixed | Laub's basket cue requires an uncollected basket. The old-save regression uses the shipped story. |

## Findings and follow-ups

- Check the intended fallback in `k2_6`. A fresh run first writes `k2.abfahrt` on exit from
  `k2_8`. The quest and clue alternatives can complete the beat.
- Decide whether `debug.k2` in `k2_12` is still needed. There is no runtime or content writer.
  Completing the parforce quest satisfies the normal path.
- Check whether the `chosen: k3.objekt` fallback in `k3_3` serves replayed saves. A fresh run
  can enter the Festsaal and choose the object in `k3_4`.
- Verify the chapter-two retry at `k2_10` after being caught. The fresh-route pass does not
  reach the `k2.wieder_da` and `k2.jagd_los` alternatives before the normal hunt completes.
- Nine test-catalog warnings come from the worked example. Only the door-handle option
  advances `test/t3`. The manual stop at `t6` leaves `r1–r4` and `q1–q2` for debug
  entry, including the main quest `q.test.lohnzettel`. The side quest `q.test.irrlichter`
  depends on the main quest in that sequence.
- No voiced lines need new text. Source and clip ids are unchanged.
- Run the smoke spec on a host that permits the preview server to bind its port.

```sh
KQ_E2E_PORT=5452 scripts/dev/heavy.sh --max-hold 15 pnpm exec playwright test e2e/smoke.spec.ts --workers=1 --reporter=line
```

## Local commits

- `be58d3e` docs(content) — plan static soft-lock checks
- `0454b3a` feat(content) — static soft-lock checks in the content validator
- `7046d00` fix(story) — keep the basket cue silent after pickup

- `ae41dc6` fix — address review findings (validator, shared quest rules, tests and docs)

## Second review (2026-11-26)

- All 15 first-round findings are confirmed fixed, each with a regression in
  `tests/content-progression.test.ts` or `tests/story.test.ts`. The staging commands that used to
  be listed here are superseded by `ae41dc6`.
- The quest runtime refactor (`dropEarlier`, `killMatches`, `objectiveEvents`, `recordItemDeed`
  moved into `logic.ts`) is behaviour-preserving. The changed chapter-three cue keeps its voiced text.
- Gates: `pnpm typecheck` passed; `pnpm test` reported `Test Files  119 passed (119)` and
  `Tests  1631 passed (1631)`; `pnpm validate` reported `Progression: 0 error(s), 15 warning(s)`
  and `✓ content valid (24 warning(s))`; `pnpm build` passed.
