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
- The runtime changes are committed as `d06faee`. Git could not create the worktree
  `index.lock` while staging the mobile tour, measurer tests and docs. Those changes remain local.

## Follow-ups

- Run `e2e/party.spec.ts`, `e2e/smoke.spec.ts` and the six mobile screenshot subsets using
  the commands and visual checklist in MOBILE-UI-PASS §8.5.
- Run the standard `pnpm validate` command where the local tsx socket is allowed.
