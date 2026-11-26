---
id: TASK-020
aliases:
- TASK-020
title: Mobile UI leftovers
slug: mobile-ui-leftovers
status: in-progress
priority: 2
owner: ''
projects: []
customers: []
tags:
- dev
- mobile
- ui
sprint: "[[SPR-001]]"
milestone: ''
depends_on: []
due_date: ''
created: 2026-11-26
updated: 2026-11-26
---

# Mobile UI leftovers

## Description

Close the phone layout items in NEXT-SESSION §7.2 and MOBILE-UI-PASS §§8.2–8.4,
with 667×375 landscape as the tightest playable viewport.

## Acceptance Criteria

- [x] Phone credits reserve the safe width and hide gameplay touch controls, including reduced motion.
- [x] The standalone skill card uses the reserved band below dialogue and supports tap dismissal.
- [x] The MR 9 hints and callouts have explicit clearance. Unit tests cover the hidden and obstructing pause overlap cases. The visual checklist is documented.
- [ ] Measure credits and skill unlock in the mobile tour and check phone portrait and tablets.
- [ ] Pass the four gates and report the locked browser runs or their blocker.

## Plan

**Approach:** Reuse the level card's touch dismiss path and its reserved landscape band.
Use explicit safe-area boundaries for the outstanding HUD overlaps. Keep the desktop rules
and phone rotation behavior in place. Compare the pause report against which surface is
visible and owns taps while the modal is open.

**Files to touch:** Touch layout, party credits and skill cards, mobile tour and measurer,
related tests, and the mobile audit and changelogs.

**Steps:**

- [x] 1. Trace credits, cards, prompt and callout layout, and check the pause report against the modal.
- [x] 2. Apply the phone layout rules and cover touch dismissal with unit tests.
- [x] 3. Add credits and skill card tour states and tests for pause overlap measurement.
- [x] 4. Update the audit and changelogs and run the gates that the sandbox allows.
- [ ] 5. Run the device matrix and browser specs on port 5407.

**Test plan:** Run the card unit tests, the four gates, and the locked mobile tour
and smoke spec on port 5407. Review baseline and updated screenshots where available.

**Risks:** Some tour states depend on story and card timing. Test both animated and static
credits, and keep the phone top-right corner allocation unchanged.

**Open questions:** None.

### Review fix round (2026-11-26)

Preserve phone notice readability and credits camera control. Make the small-landscape tour prove
that the unlock fits, survives movement, and dismisses early, and that the Pause paper owns the
overlap with visible dialogue.

- [x] Defer and pause the skill card during movement on short touch layouts, queue each eligible
  Laub remark once, and reuse the touch dismissal callback. Cover timing and grouping in unit tests.
- [x] Keep touch gestures available around phone credits and assert camera hand-back with the
  crawl still visible in the party spec. Cover the relevant touch and party behavior in tests.
- [x] Measure settled unlock content and require a fresh card for early dismissal. Require a
  visible dialogue and a Pause-owned intersection on the small phone. Add regression assertions.
- [x] Update the behavior docs and record each finding and verification result.
- [ ] Complete the standard validation gate and locked browser checks on a host that permits
  local sockets.

## Progress

- Branch: `dev/task-020`.
- Baseline tour launch returned `EPERM` on the local tsx IPC socket. The Pause layer draws
  opaque paper over the dialogue and captures taps. Verify at the intersection in the tour.
- Phone credits yield the screen to the crawl or static list. The standalone skill card
  uses the level card's touch dismissal path, with coverage for early and grouped dismissals.
- The tour measures the credits, standalone unlock, long HUD hint and combat callout. Pause
  measurement checks the frontmost surface at the intersection. Unit tests also exercise a
  fixture where dialogue is above Pause and the overlap remains reported.
- Typecheck, unit tests and production build passed. `pnpm validate` could not open the tsx
  IPC socket. The same content checker passed when invoked with `node --import tsx`.
- The locked smoke run was blocked starting preview at `127.0.0.1:5407` (`EPERM`).
  The party spec and device screenshots remain pending.
- The implementation is in `d06faee` and `cde0d60`.
- Review round: use the stick state to defer the card and pause its clock, preserve Laub's remarks
  on an early tap, and keep the phone touch surface active around credits. Add strict Pause and
  settled skill-card probes and stage the early tap on a fresh card in manual time. The four
  targeted unit files passed (59 tests).
- Review gates: `pnpm typecheck`, `pnpm test` (`Tests  1581 passed (1581)`, 0 failed),
  `pnpm build` and `mc validate` passed. `pnpm validate` and the locked full `small-landscape`
  tour returned `EPERM` on the tsx IPC socket. The locked party spec returned `EPERM` starting
  preview at `127.0.0.1:5407`. Smoke and the other device runs were skipped after the socket errors.
- Git denied creation of the worktree `index.lock` during staging. The review changes are in the
  worktree. Branch HEAD is `cde0d603577c18cc483a1f005fdb770b6d9caff4`.

| Review finding | Result |
| --- | --- |
| 1. Skill notice expires during stick hold | Fixed. Unit coverage holds the stick past the full duration before and after the notice appears. |
| 2. Phone credits capture the entire play surface | Fixed. The party spec asserts that a drag hands back the camera while the crawl stays visible. Browser verification is pending. |
| 3. Tour checks decorative overflow before the card settles | Fixed. The tour measures visible text fragments and the settled stamp against the card clip. |
| 4. An early tap silences Laub | Fixed. An eligible grouped remark queues once even when the player skips the stamp. |
| 5. Tour can pass after natural expiry | Fixed. The tour taps a fresh card with automatic game frames stopped and checks `kqk-out` after two explicit steps. |
| 6. Pause probe accepts absent dialogue | Fixed. The 667×375 probe requires visible dialogue, a positive intersection and a hit owned by the paper. |
| 7. Dismiss callback is recreated each frame | Fixed. Slot claims reuse one callback, checked by identity in the unit test. |
| Mobile tour blocker | The failing check was replaced and the dismissal check was isolated. Full 667×375 rerun is pending because the sandbox blocks the launcher socket. |

## Follow-ups

- Run `e2e/party.spec.ts`, `e2e/smoke.spec.ts`, the full `small-landscape` tour and the other five device subsets using
  the commands and visual checklist in MOBILE-UI-PASS §8.5.
- Run the standard `pnpm validate` command where the local tsx socket is allowed.
