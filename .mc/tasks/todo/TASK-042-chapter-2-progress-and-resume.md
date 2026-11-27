---
id: TASK-042
aliases:
- TASK-042
title: 'Chapter 2 soft-lock and progress-loss hunt'
slug: chapter-2-progress-and-resume
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- bug
- story
- quests
sprint: "[[SPR-001]]"
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-27
---

# Chapter 2 soft-lock and progress-loss hunt

## Goal

Trace Chapter 2's story and quests from the spring through the departure, including side quests and older saves.
Fix the most serious confirmed progress failures without touching voiced text, balancing, or fixes owned by other tasks.

## Acceptance Criteria

- [x] Audit each K2 beat and objective for ordering, retries, interruption, input mode, replay, and resume.
- [x] Capture the confirmed failures in Vitest before implementing fixes; cover stuck-save recovery.
- [x] Keep voiced text, touch and reduced-motion support, and dependency set unchanged.
- [x] Document behavior and each repro, root cause, fix, and test; append a PRD changelog row.
- [x] Run typecheck, unit tests (zero failed), content validation, and build.
- [ ] Run locked `e2e/chapter-k2.spec.ts` and `e2e/smoke.spec.ts`.
- [x] Commit the scoped changes conventionally without pushing or opening a PR.

## Port onto main (2026-11-27)

The first implementation was written against `d2d1f48`. It was ported onto main after #58, which
already fixed the lantern gate: the `k2_8-vorbei` reaction sets `k2.wagen` when the departure echo
ends, is interrupted, or after 45 s, and the choice follows the lantern. That gate is kept as is,
including the e2e "leaving during the departure". The earlier gate rework (era-bound choice card,
tappable inline options, `lantern` action, `preserveLantern` on the oil meter, deleting `k2.wagen`
on load) was dropped: #58 resolves the choice when the player leaves, main's touch controls already
have a Laterne button, and the reload case the oil-meter change addressed needs a save made in the
same frame as `k2.wagen` is set, which main's gate does not produce. The `story.echo.date` string is
already on main.

## Regressions

| Bug and repro | Root cause and fix | Vitest |
| --- | --- | --- |
| Take a shortcut past the Allee waypoint, hear the Orangerie, and continue; the trail reward and crate quest can be left behind. | `k2_3` completed on the clue or on walking away. It now waits for `q.k2.spur` to pay out and re-offers it idempotently on resume. | `tests/story.test.ts` › `keeps the trail quest at the Orangerie until the missed Allee waypoint is found` |
| Read the Wachbuch before banishing the lights. The story moves to the palace; clearing the lights afterwards never makes the fire memory available, so the reward and two side quests stay locked. | `k2_4` completed on the book, and the flag setter `k2_4-frei` lived inside the beat. The beat waits for `q.k2.wachbuch`; the setter is now chapter-wide (`k2-wachfeuer-frei`) so saves already past the Wachhaus recover. | `does not leave the Wachhaus after reading the book before clearing the lights`; `unlocks the Wachfeuer in a reloaded save that already skipped the Wachhaus` |
| Save (or autosave) during Jost's horn lead-in, before the pack exists, and load it. The chase claims to be running but never spawns, so the dam never ends the beat. | `k2_10-horn` sets `k2.jagd_laeuft` before the delayed pack; scheduled actions are not saved. `migrateInterruptedHunt` (deserializeState) clears the start state when the save has no matching parforce pack, reusing the Ehrenhof retry. | `rearms the chase when an autosave during Jost’s lines has no active pack`; `keeps an already active parforce pack on reload instead of replaying the horn` |
| Same, but Pause → Zum Titelbild → Weiter in the same tab: no deserialize runs, the queue is discarded. | The story resume path calls `migrateInterruptedHunt` too. | `tests/chapter-k2-runtime.test.ts` › `restarts the horn after title Continue drops its scheduled spawn`; `keeps the running pack when continuing from the title` |
| Shift to today during Jost's lead-in: the delayed `threat` still runs and sets the parforce pack loose in the present. | Delayed actions ignore era changes. New reaction flag `sameEra` drops a reaction's pending actions on `shift:begin` / `era:change`; set on `k2_10-horn` and `k2_10-wieder`. | `does not set the pack loose in the present when the player shifts during Jost’s lead-in` |

All listed tests fail on main except the two "keeps ..." guards.

## Follow-ups

- Run locked `e2e/chapter-k2.spec.ts` and `e2e/smoke.spec.ts`; `e2e/campaign.spec.ts` exercises the
  shared Chapter 2 helper end to end.
- A save that already left K2 without claiming a reward should use chapter replay; K3 saves are not
  rewritten or awarded XP retroactively.
